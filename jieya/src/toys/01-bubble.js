// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===== bubble ===== */
/* 泡泡纸 — endless bubble wrap */
(() => {
const TAU = J.TAU;
let legacy = 0; try{ legacy = +(localStorage.getItem('bubble-total') || 0); }catch(e){}
const B = { list: [], frags: [], popped: 0, down: false, lx: 0, ly: 0, dirty: true, active: false,
  lifetime: +J.store.get('bubble-total', legacy) || 0, refillAt: 0 };
let cv, refillBtn;

function layout(){
  const W = cv.W, H = cv.H; if(!W || !H) return;
  const d = W < 520 ? 46 : 56, r = d * .42, dy = d * .88, top = 34;
  const cols = Math.max(1, Math.floor((W - d * .5 - 8) / d));
  const rows = Math.max(1, Math.floor((H - top - 10) / dy));
  const ox = (W - (cols * d + d * .5)) / 2 + d / 2;
  const oy = top + (H - top - (rows - 1) * dy - d) / 2 + d / 2;
  const now = performance.now();
  B.list = [];
  for(let j = 0; j < rows; j++) for(let i = 0; i < cols; i++)
    B.list.push({ x: ox + i * d + (j % 2 ? d / 2 : 0), y: oy + j * dy, r, popped: false, t: 0, seed: Math.random(), born: now + j * 28 + i * 6 });
  B.popped = 0; B.frags = []; B.dirty = true; B.refillAt = 0;
  refillBtn.hidden = true;
  J.stat();
}
function popSound(){
  J.sfx.noise({ freq: 900 + Math.random() * 1800, Q: 1.3, peak: .9, dec: .055 });
  J.sfx.tone({ f: 200 + Math.random() * 120, f2: 55, peak: .4, dec: .065 });
}
function popAt(x, y){
  let n = 0;
  for(const b of B.list){
    if(b.popped) continue;
    const dx = b.x - x, dy = b.y - y, rr = b.r + 3;
    if(dx * dx + dy * dy < rr * rr){
      b.popped = true; b.t = performance.now(); n++;
      for(let k = 0; k < 7; k++){
        const a = Math.random() * TAU, s = 1 + Math.random() * 2.5;
        B.frags.push({ x: b.x, y: b.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1 });
      }
      if(n <= 3) popSound();
    }
  }
  if(n){
    B.popped += n; B.lifetime += n; J.store.set('bubble-total', B.lifetime);
    J.buzz(8); B.dirty = true; J.stat();
    if(B.popped === B.list.length) B.refillAt = performance.now() + 350;
  }
}
function sweep(x, y){
  const dx = x - B.lx, dy = y - B.ly, steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 10));
  for(let s = 1; s <= steps; s++) popAt(B.lx + dx * s / steps, B.ly + dy * s / steps);
  B.lx = x; B.ly = y;
}
const backOut = t => { const c = 1.9; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };

function draw(now){
  const c = cv.ctx;
  c.clearRect(0, 0, cv.W, cv.H);
  let active = false;
  for(const b of B.list){
    if(now < b.born){ active = true; continue; }
    const age = now - b.born;
    let s = 1;
    if(age < 300){ s = Math.max(0, backOut(age / 300)); active = true; }
    if(b.popped){
      c.beginPath(); c.arc(b.x, b.y, b.r * .94, 0, TAU);
      c.fillStyle = 'rgba(160,190,212,0.06)'; c.fill();
      c.lineWidth = 1; c.strokeStyle = 'rgba(170,200,222,0.16)'; c.stroke();
      c.strokeStyle = 'rgba(205,225,240,0.22)'; c.beginPath();
      for(let k = 0; k < 4; k++){
        const a = b.seed * TAU + k * 1.7, l = b.r * (.45 + ((b.seed * (k + 3) * 7) % .4));
        c.moveTo(b.x + Math.cos(a) * l * .15, b.y + Math.sin(a) * l * .15);
        c.lineTo(b.x + Math.cos(a + .25) * l, b.y + Math.sin(a + .25) * l);
      }
      c.stroke();
      const pa = now - b.t;
      if(pa < 240){
        active = true;
        const k = pa / 240;
        c.beginPath(); c.arc(b.x, b.y, b.r * (1 + k * .7), 0, TAU);
        c.lineWidth = 2; c.strokeStyle = `rgba(255,236,210,${(1 - k) * .8})`; c.stroke();
      }
    } else {
      const r = b.r * s; if(r <= 0) continue;
      c.beginPath(); c.ellipse(b.x + 1.5, b.y + r * .2, r, r * .92, 0, 0, TAU);
      c.fillStyle = 'rgba(0,0,0,0.28)'; c.fill();
      const g = c.createRadialGradient(b.x - r * .35, b.y - r * .4, r * .08, b.x, b.y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(.4, 'rgba(180,220,238,0.2)');
      g.addColorStop(1, 'rgba(140,195,222,0.12)');
      c.beginPath(); c.arc(b.x, b.y, r, 0, TAU);
      c.fillStyle = g; c.fill();
      c.lineWidth = 1.2; c.strokeStyle = 'rgba(200,232,248,0.38)'; c.stroke();
      c.beginPath(); c.ellipse(b.x - r * .32, b.y - r * .36, r * .28, r * .15, -.6, 0, TAU);
      c.fillStyle = 'rgba(255,255,255,0.6)'; c.fill();
    }
  }
  if(B.frags.length){
    active = true;
    c.fillStyle = 'rgba(225,242,252,0.9)';
    for(let i = B.frags.length - 1; i >= 0; i--){
      const f = B.frags[i];
      f.x += f.vx; f.y += f.vy; f.vx *= .9; f.vy *= .9; f.life -= .05;
      if(f.life <= 0){ B.frags.splice(i, 1); continue; }
      c.globalAlpha = f.life; c.beginPath(); c.arc(f.x, f.y, 1.6, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
  }
  return active;
}

J.css(`.bubble-refill{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:3;background:var(--accent);color:var(--accent-ink);border:0;font:inherit;font-size:15px;padding:12px 24px;border-radius:999px;cursor:pointer;box-shadow:0 10px 40px rgba(242,181,107,.25)}`);

J.register({
  id: 'bubble', name: '泡泡纸', hint: '按住划过去，一排一排捏爆',
  create(root){
    cv = J.canvas(root); cv.cv.style.cursor = 'pointer';
    refillBtn = document.createElement('button');
    refillBtn.className = 'bubble-refill'; refillBtn.textContent = '全捏完了，再来一张'; refillBtn.hidden = true;
    refillBtn.addEventListener('click', () => { J.ac(); layout(); });
    root.appendChild(refillBtn);
    const el = cv.cv;
    el.addEventListener('pointerdown', e => {
      J.ac(); B.down = true; el.setPointerCapture(e.pointerId);
      const [x, y] = J.local(e, el); B.lx = x; B.ly = y; popAt(x, y);
    });
    el.addEventListener('pointermove', e => {
      if(!B.down) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for(const ev of (evs.length ? evs : [e])){ const [x, y] = J.local(ev, el); sweep(x, y); }
    });
    const end = () => { B.down = false; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  },
  resize(W, H){ cv.fit(W, H); layout(); },
  enter(){ B.dirty = true; },
  tick(now){
    if(B.refillAt && now > B.refillAt){ B.refillAt = 0; refillBtn.hidden = false; }
    if(B.dirty || B.active){ B.active = draw(now); B.dirty = false; }
  },
  key(e){
    if(e.code !== 'Space') return;
    const left = B.list.filter(b => !b.popped);
    if(left.length){ const b = left[(Math.random() * left.length) | 0]; popAt(b.x, b.y); }
    return true;
  },
  actions: [{ label: '换一张', run: layout }],
  stat: () => `这张 <b>${B.popped}</b> / ${B.list.length} · 累计捏爆 <b>${J.fmt(B.lifetime)}</b>`
});
})();

