// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===== fish ===== */
/* 电子木鱼 — reference example of the toy contract (DOM-based; most toys use J.canvas instead). */
(() => {
J.css(`
.fish-wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;touch-action:manipulation}
.fish-merit{font-family:var(--display);font-size:clamp(44px,10vw,72px);line-height:1;color:var(--accent);font-variant-numeric:tabular-nums}
.fish-label{color:var(--muted);font-size:13px;letter-spacing:.3em;margin-bottom:6px}
.fish-box{position:relative;width:min(80%,380px);max-width:100%}
.fish-box svg{width:100%;height:auto;display:block;position:relative;z-index:1;overflow:visible}
.fish-glow{position:absolute;inset:-10% -10% 0;background:radial-gradient(closest-side,rgba(242,181,107,.35),transparent);opacity:0;pointer-events:none}
.fish-float{position:absolute;z-index:4;font-family:var(--display);color:var(--accent);font-size:20px;pointer-events:none;white-space:nowrap;animation:fishRise .95s ease-out forwards}
.fish-float.big{font-size:30px;color:#fff3dd;text-shadow:0 0 18px rgba(242,181,107,.8)}
@keyframes fishRise{from{transform:translate(-50%,0);opacity:1}to{transform:translate(-50%,-80px);opacity:0}}
@media (prefers-reduced-motion:reduce){.fish-float{animation-duration:.5s}}
`);
let legacy = 0; try{ legacy = +(localStorage.getItem('muyu-total') || 0); }catch(e){}
const F = { total: +J.store.get('fish-total', legacy) || 0, session: 0, auto: false, autoT: 0, hit: -1e9 };
let wrap, meritEl, bodyEl, malletEl, glowEl, boxEl;
const easeOut = t => 1 - Math.pow(1 - t, 3);

function knock(){
  F.total++; F.session++; J.store.set('fish-total', F.total);
  F.hit = performance.now();
  J.sfx.tone({ f: 720, f2: 690, peak: .55, dec: .24 });
  J.sfx.tone({ f: 1980, f2: 1900, peak: .12, dec: .07 });
  J.sfx.tone({ f: 360, f2: 345, type: 'triangle', peak: .16, dec: .13 });
  J.sfx.noise({ freq: 2400, Q: 2, peak: .3, dec: .025 });
  J.buzz(12);
  meritEl.textContent = J.fmt(F.total);
  const big = F.total % 108 === 0;
  const s = document.createElement('div');
  s.className = 'fish-float' + (big ? ' big' : '');
  s.textContent = big ? '一百零八 · 圆满' : '功德 +1';
  const wr = boxEl.getBoundingClientRect(), sr = wrap.getBoundingClientRect();
  s.style.left = (wr.left - sr.left + wr.width * (.5 + (Math.random() - .5) * .35)) + 'px';
  s.style.top = (wr.top - sr.top + wr.height * .08) + 'px';
  s.addEventListener('animationend', () => s.remove());
  wrap.appendChild(s);
  J.stat();
}

J.register({
  id: 'fish', name: '电子木鱼', hint: '点哪里都行，空格键也能敲',
  create(root){
    wrap = document.createElement('div'); wrap.className = 'fish-wrap';
    wrap.innerHTML = `
      <div class="fish-merit">0</div>
      <div class="fish-label">功 德</div>
      <div class="fish-box">
        <div class="fish-glow"></div>
        <svg viewBox="0 -40 320 300" role="img" aria-label="木鱼，点一下敲一下">
          <defs>
            <radialGradient id="fishWood" cx="36%" cy="30%" r="78%">
              <stop offset="0" stop-color="#dba062"/><stop offset=".55" stop-color="#9a5a2a"/><stop offset="1" stop-color="#55290f"/>
            </radialGradient>
            <linearGradient id="fishStick" x1="0" x2="1"><stop offset="0" stop-color="#b98a5a"/><stop offset="1" stop-color="#7a5230"/></linearGradient>
          </defs>
          <ellipse cx="155" cy="250" rx="122" ry="11" fill="rgba(0,0,0,.4)"/>
          <path d="M42 238 Q155 214 268 238 Q264 254 155 256 Q46 254 42 238Z" fill="#7a2c2c"/>
          <path d="M60 236 Q155 220 250 236" stroke="rgba(255,190,150,.18)" stroke-width="2" fill="none"/>
          <g class="fish-body">
            <path d="M40 150 C40 82 108 44 172 46 C236 48 272 98 266 152 C260 206 212 232 152 230 C86 228 40 206 40 150Z" fill="url(#fishWood)"/>
            <path d="M52 158 C88 146 132 144 176 154" stroke="#2e1608" stroke-width="9" fill="none" stroke-linecap="round"/>
            <path d="M60 168 C92 160 128 159 160 165" stroke="rgba(255,215,170,.18)" stroke-width="2" fill="none" stroke-linecap="round"/>
            <circle cx="88" cy="112" r="10" fill="#2e1608"/>
            <circle cx="85" cy="109" r="3" fill="rgba(255,230,200,.6)"/>
            <path d="M150 92 q16 -10 30 0 M188 108 q16 -10 30 0 M158 122 q16 -10 30 0 M204 140 q14 -9 27 0 M176 182 q16 -10 30 0 M212 172 q12 -8 24 0" stroke="rgba(50,24,8,.45)" stroke-width="3" fill="none" stroke-linecap="round"/>
            <ellipse cx="122" cy="80" rx="48" ry="15" transform="rotate(-18 122 80)" fill="rgba(255,228,190,.22)"/>
          </g>
          <g class="fish-mallet">
            <line x1="290" y1="-28" x2="206" y2="10" stroke="url(#fishStick)" stroke-width="9" stroke-linecap="round"/>
            <circle cx="200" cy="14" r="15" fill="#caa06c"/>
            <circle cx="195" cy="9" r="5" fill="rgba(255,240,215,.5)"/>
          </g>
        </svg>
      </div>`;
    root.appendChild(wrap);
    meritEl = wrap.querySelector('.fish-merit'); bodyEl = wrap.querySelector('.fish-body');
    malletEl = wrap.querySelector('.fish-mallet'); glowEl = wrap.querySelector('.fish-glow'); boxEl = wrap.querySelector('.fish-box');
    meritEl.textContent = J.fmt(F.total);
    wrap.addEventListener('pointerdown', e => { e.preventDefault(); J.ac(); knock(); });
  },
  actions: [
    { label: () => F.auto ? '自动敲：开' : '自动敲：关', on: () => F.auto, run(){ F.auto = !F.auto; F.autoT = 0; } }
  ],
  key(e){ if(e.code === 'Space'){ knock(); return true; } },
  tick(now, dt){
    if(F.auto){ F.autoT += dt; if(F.autoT > 620){ F.autoT = 0; knock(); } }
    const t = now - F.hit;
    const a = t < 220 ? -14 * (1 - easeOut(t / 220)) : 0;
    malletEl.setAttribute('transform', `rotate(${a.toFixed(2)} 290 -28)`);
    const k = t < 170 ? 1 - t / 170 : 0;
    bodyEl.setAttribute('transform', `translate(153 230) scale(${1 + .03 * k} ${1 - .05 * k}) translate(-153 -230)`);
    glowEl.style.opacity = (t < 400 ? (1 - t / 400) : 0).toFixed(3);
  },
  stat: () => `这一轮 <b>${F.session}</b> 下 · 累计功德 <b>${J.fmt(F.total)}</b>`
});
})();

