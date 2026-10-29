// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===== sand ===== */
/* 流沙字 — sand particles forming a word that scatter from your finger */
(() => {
const WORDS = ['深呼吸', '没关系', '慢慢来', '睡个好觉', '放下'];
const FONT = '"ZCOOL XiaoWei","PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif';
const PAL = ['#d8ae78', '#f4c47e', '#ff9e7c', '#fff1da'];
const S = { n: 0, wi: +J.store.get('sand-word', 0) % WORDS.length, mx: -1e4, my: -1e4, down: false,
  x: new Float32Array(0), y: new Float32Array(0), vx: new Float32Array(0), vy: new Float32Array(0),
  hx: new Float32Array(0), hy: new Float32Array(0), bk: new Uint8Array(0), size: 2 };
let cv;

function build(){
  const W = Math.floor(cv.W), H = Math.floor(cv.H); if(!W || !H) return;
  const word = WORDS[S.wi];
  const oc = document.createElement('canvas'); oc.width = W; oc.height = H;
  const o = oc.getContext('2d', { willReadFrequently: true });
  const len = [...word].length;
  const fs = Math.min(H * .5, W * .88 / len);
  o.font = `400 ${fs}px ${FONT}`;
  o.textAlign = 'center'; o.textBaseline = 'middle';
  o.fillStyle = '#fff'; o.strokeStyle = '#fff'; o.lineWidth = fs * .035; o.lineJoin = 'round';
  o.fillText(word, W / 2, H / 2 + 10); o.strokeText(word, W / 2, H / 2 + 10);
  const data = o.getImageData(0, 0, W, H).data;
  let gap = Math.max(3, Math.round(fs / 46)), pts;
  for(;;){
    pts = [];
    for(let y = 0; y < H; y += gap) for(let x = 0; x < W; x += gap)
      if(data[(y * W + x) * 4 + 3] > 140) pts.push([x + (Math.random() - .5) * gap * .6, y + (Math.random() - .5) * gap * .6]);
    if(pts.length <= 4800) break;
    gap++;
  }
  for(let i = pts.length - 1; i > 0; i--){ const j = (Math.random() * (i + 1)) | 0; [pts[i], pts[j]] = [pts[j], pts[i]]; }
  const n = pts.length, old = S.n;
  const nx = new Float32Array(n), ny = new Float32Array(n), nvx = new Float32Array(n), nvy = new Float32Array(n);
  const hx = new Float32Array(n), hy = new Float32Array(n);
  for(let i = 0; i < n; i++){
    hx[i] = pts[i][0]; hy[i] = pts[i][1];
    if(i < old){ nx[i] = S.x[i]; ny[i] = S.y[i]; nvx[i] = S.vx[i]; nvy[i] = S.vy[i]; }
    else if(old === 0){ nx[i] = hx[i]; ny[i] = hy[i]; }
    else { nx[i] = Math.random() * W; ny[i] = Math.random() * H; }
  }
  Object.assign(S, { n, x: nx, y: ny, vx: nvx, vy: nvy, hx, hy, bk: new Uint8Array(n), size: Math.max(1.6, gap * .55) });
  J.stat();
}
function burst(cx, cy, R, power){
  for(let i = 0; i < S.n; i++){
    const dx = S.x[i] - cx, dy = S.y[i] - cy, d = Math.hypot(dx, dy) || 1;
    if(d < R){
      const f = (1 - d / R) * power * (.7 + Math.random() * .6);
      S.vx[i] += dx / d * f; S.vy[i] += dy / d * f;
    }
  }
}
function whoosh(){ J.sfx.noise({ type: 'lowpass', freq: 1800, freq2: 180, Q: 3, peak: .45, dec: .55, att: .05 }); }

J.register({
  id: 'sand', name: '流沙字', hint: '手指靠近会散开，按下去会炸开',
  create(root){
    cv = J.canvas(root); cv.cv.style.cursor = 'crosshair';
    const el = cv.cv;
    el.addEventListener('pointerdown', e => {
      J.ac(); S.down = true; el.setPointerCapture(e.pointerId);
      [S.mx, S.my] = J.local(e, el);
      burst(S.mx, S.my, 240, 16); whoosh(); J.buzz(15);
    });
    el.addEventListener('pointermove', e => { [S.mx, S.my] = J.local(e, el); });
    const end = e => { S.down = false; if(e.pointerType !== 'mouse'){ S.mx = S.my = -1e4; } };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', () => { if(!S.down){ S.mx = S.my = -1e4; } });
    if(document.fonts && document.fonts.load)
      document.fonts.load('40px "ZCOOL XiaoWei"', WORDS.join('')).then(() => { if(cv.W) build(); }).catch(() => {});
  },
  resize(W, H){ cv.fit(W, H); build(); },
  enter(){ cv.ctx.fillStyle = J.C.panel; cv.ctx.fillRect(0, 0, cv.W, cv.H); },
  tick(now){
    const c = cv.ctx, n = S.n;
    c.fillStyle = 'rgba(26,30,42,0.42)'; c.fillRect(0, 0, cv.W, cv.H);
    const R = S.down ? 150 : 90, R2 = R * R, F = S.down ? 2.4 : 1.2;
    const mx = S.mx, my = S.my, wt = now * .0016;
    const { x, y, vx, vy, hx, hy, bk } = S;
    for(let i = 0; i < n; i++){
      const dx = x[i] - mx, dy = y[i] - my, d2 = dx * dx + dy * dy;
      if(d2 < R2){
        const d = Math.sqrt(d2) || 1, f = (1 - d / R) * F;
        vx[i] += dx / d * f; vy[i] += dy / d * f;
      }
      const ty = hy[i] + Math.sin(wt + hx[i] * .012) * 2.2;
      vx[i] = (vx[i] + (hx[i] - x[i]) * .012) * .9;
      vy[i] = (vy[i] + (ty - y[i]) * .012) * .9;
      x[i] += vx[i]; y[i] += vy[i];
      const s = Math.abs(vx[i]) + Math.abs(vy[i]);
      bk[i] = s < .35 ? 0 : s < 1.6 ? 1 : s < 4.5 ? 2 : 3;
    }
    const sz = S.size, h = sz / 2;
    for(let b = 0; b < 4; b++){
      c.fillStyle = PAL[b]; c.beginPath();
      for(let i = 0; i < n; i++) if(bk[i] === b) c.rect(x[i] - h, y[i] - h, sz, sz);
      c.fill();
    }
  },
  key(e){ if(e.code === 'Space'){ burst(cv.W / 2, cv.H / 2, 260, 16); whoosh(); return true; } },
  actions: [{ label: '换个字', run(){
    S.wi = (S.wi + 1) % WORDS.length; J.store.set('sand-word', S.wi);
    build(); burst(cv.W / 2, cv.H / 2, Math.max(cv.W, cv.H), 9); whoosh();
  } }],
  stat: () => `「<b>${WORDS[S.wi]}</b>」 · ${J.fmt(S.n)} 粒沙`
});
})();

