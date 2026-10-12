/* Lab: 氢原子能级与谱线 (Nobel Physics 1922, Niels Bohr)
 * Constants:
 *   Rydberg energy Ry = 13.6057 eV (infinite nuclear mass) -> ladder E_n = -Ry/n²
 *   R_H = 1.09678e7 m⁻¹ (hydrogen, reduced mass) -> vacuum wavelengths 1/λ = R_H(1/n₁² − 1/n₂²)
 *   hc = 1239.84198 eV·nm, c = 2.99792458e8 m/s. ΔE is shown as hc/λ so ΔE and λ agree exactly.
 */
(() => {
  const RY = 13.6057, RH = 1.09678e-2 /* nm⁻¹ */, HC = 1239.84198, CL = 2.99792458e8;
  const NMAX = 7, DUR = 2.2;                          // levels shown; animation length (s)
  const SERIES = ['', '莱曼', '巴耳末', '帕邢', '布拉开', '普丰德', '汉弗莱'];
  const PREFIX = ['', 'Ly', 'H', 'Pa', 'Br', 'Pf', 'Hu'];
  const GREEK = 'αβγδεζ';
  const En = (n) => -RY / (n * n);
  const lambda = (n1, n2) => 1 / (RH * (1 / (n1 * n1) - 1 / (n2 * n2)));   // nm, vacuum
  const limit = (n1) => (n1 * n1) / RH;                                     // series limit, nm
  const band = (l) => (l < 380 ? '紫外' : l > 780 ? '红外' : '可见');
  const lineName = (n1, n2) => PREFIX[n1] + GREEK[n2 - n1 - 1];
  const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  const sci = (v, d = 3) => { const [m, e] = v.toExponential(d).split('e'); return m + '×10' + String(+e).replace(/./g, (c) => SUP[c]); };
  const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

  LABS.bohr = {
    title: '氢原子能级与谱线',
    _math: { En, lambda, limit, HC, CL },
    mount(root, ctx) {
      const h = ctx.h, col = ctx.color;
      let n1 = 2, n2 = 3, mode = 'emit';
      let p = 0, theta = -0.6, photonAng = 0;        // animation phase 0..1, electron angle
      const omega = (rDisp) => 3 / Math.pow(rDisp, 1.5); // visual angular speed only (∝ n^-1.5 here)

      const stage = h.el('div', { class: 'lab-stage' });
      const cv = h.canvas(stage, { aspect: 0.62, minH: 250, maxH: 400 });
      const sp = h.canvas(stage, { aspect: 0.24, minH: 112, maxH: 150 });
      const ctl = h.el('div', { class: 'lab-controls' });
      const ro = h.el('div', { class: 'lab-readout' });
      root.append(stage, ctl, ro, h.el('p', { class: 'lab-hint',
        text: '默认是 Hα（3→2，红光）。换不同的 n₂、n₁，或点能级/谱线：能级越高挨得越密（∝1/n²），谱线也越挤向系限——离散能级给出离散谱线。' }));

      const c2 = h.choice({ label: '上能级 n₂', value: n2, options: [2, 3, 4, 5, 6, 7].map((v) => ({ value: v, label: String(v) })),
        onChange: (v) => { n2 = v; if (n1 >= n2) { n1 = n2 - 1; c1.set(n1); } changed(); } });
      const c1 = h.choice({ label: '下能级 n₁', value: n1, options: [1, 2, 3, 4, 5, 6].map((v) => ({ value: v, label: String(v) })),
        onChange: (v) => { n1 = v; if (n2 <= n1) { n2 = n1 + 1; c2.set(n2); } changed(); } });
      const cm = h.choice({ label: '过程', value: mode, options: [{ value: 'emit', label: '发射' }, { value: 'absorb', label: '吸收' }],
        onChange: (v) => { mode = v; btn.textContent = v === 'emit' ? '跃迁并发光' : '吸收光子并跃迁'; changed(); } });
      const btn = h.button({ label: '跃迁并发光', kind: 'primary', onClick: () => play() });
      ctl.append(c2.el, c1.el, cm.el, btn);

      const rT = h.readout('跃迁'), rE = h.readout('ΔE = hc/λ'), rL = h.readout('λ（真空）= 1/[R_H(1/n₁²−1/n₂²)]'),
        rF = h.readout('频率 ν = c/λ'), rR = h.readout('半径比 r₂/r₁ = (n₂/n₁)²'), rA = h.readout('角动量 L = nħ');
      [rT, rE, rL, rF, rR, rA].forEach((r) => ro.append(r.el));

      const photonCol = (l, a = 1) => h.wavelengthRGB(l, a) || col('--muted');

      /* ---------- geometry shared by draw + hit-testing ---------- */
      function ladderGeo() {
        const W = cv.w, Hh = cv.h, wl = Math.round(W * 0.47);
        const top = 14, bot = Hh - 22, e0 = 2.6, e1 = -14.6;
        const Y = (e) => top + ((e0 - e) / (e0 - e1)) * (bot - top);
        return { W, Hh, wl, x0: 36, x1: wl - (W > 500 ? 78 : 30), Y, top, bot };
      }
      function orbitGeo() {
        const W = cv.w, Hh = cv.h, wl = Math.round(W * 0.47);
        const ox = wl + (W - wl) / 2, oy = Hh / 2 + 6, R = Math.min((W - wl) / 2, Hh / 2) - 12;
        return { ox, oy, R, wl, rn: (n) => (R * n) / NMAX };  // r_n = n²a₀, drawn as √r ∝ n
      }

      /* electron radius (in units of n) at phase p */
      function electronN() {
        if (mode === 'emit') return n2 + (n1 - n2) * ease((p - 0.2) / 0.25);
        return n1 + (n2 - n1) * ease((p - 0.45) / 0.25);
      }

      function drawPhoton(g, x, y, ang, len, l, alpha) {
        const wl = 5 + 14 * Math.max(0, Math.min(1, Math.log(l / 90) / Math.log(22)));  // squiggle ∝ log λ
        const ux = Math.cos(ang), uy = Math.sin(ang);
        g.save(); g.strokeStyle = photonCol(l, alpha); g.lineWidth = 2; g.beginPath();
        for (let s = -len / 2; s <= len / 2; s += 1) {
          const env = Math.cos((Math.PI * s) / len), a = 6 * env * Math.sin((2 * Math.PI * s) / wl);
          const px = x + ux * s - uy * a, py = y + uy * s + ux * a;
          s === -len / 2 ? g.moveTo(px, py) : g.lineTo(px, py);
        }
        g.stroke(); g.restore();
      }

      function draw() {
        const g = cv.g, L = ladderGeo(), O = orbitGeo(), mono = col('--mono-font') || 'monospace';
        const lam = lambda(n1, n2), pc = photonCol(lam);
        g.fillStyle = col('--panel'); g.fillRect(0, 0, L.W, L.Hh);

        /* --- energy ladder (to scale, eV) --- */
        g.font = '11px ' + mono; g.textBaseline = 'middle';
        g.fillStyle = col('--muted'); g.globalAlpha = 0.08; g.fillRect(L.x0, L.Y(2.6), L.x1 - L.x0, L.Y(0) - L.Y(2.6)); g.globalAlpha = 1;
        g.textAlign = 'left'; g.fillText('电离（连续）', L.x0 + 3, L.Y(1.5));
        g.textAlign = 'right';
        [0, -4, -8, -12].forEach((e) => { g.fillStyle = col('--muted'); g.fillText(String(e), L.x0 - 6, L.Y(e)); });
        g.save(); g.translate(10, (L.top + L.bot) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('E / eV', 0, 0); g.restore();
        g.strokeStyle = col('--line'); g.beginPath(); g.moveTo(L.x0 - 2, L.top); g.lineTo(L.x0 - 2, L.bot); g.stroke();
        g.setLineDash([3, 3]); g.beginPath(); g.moveTo(L.x0, L.Y(0)); g.lineTo(L.x1, L.Y(0)); g.stroke(); g.setLineDash([]);
        // labels pushed apart (min 11 px) and joined by leader lines, since n ≥ 4 crowd together
        let labY = Infinity;
        for (let n = 1; n <= NMAX; n++) {
          const y = L.Y(En(n)), sel = n === n1 || n === n2;
          g.strokeStyle = sel ? col('--accent') : col('--fg'); g.lineWidth = sel ? 2.5 : 1;
          g.beginPath(); g.moveTo(L.x0, y); g.lineTo(L.x1, y); g.stroke();
          labY = Math.min(y, labY - 11);
          g.strokeStyle = col('--grid'); g.lineWidth = 1; g.beginPath(); g.moveTo(L.x1, y); g.lineTo(L.x1 + 6, labY); g.stroke();
          g.fillStyle = sel ? col('--accent') : col('--muted'); g.textAlign = 'left';
          g.fillText(L.W > 500 ? `n=${n} ${En(n).toFixed(2)}` : `n=${n}`, L.x1 + 8, labY);
        }
        // transition arrow + moving dot
        const ax = L.x0 + (L.x1 - L.x0) * 0.62, ya = L.Y(En(mode === 'emit' ? n2 : n1)), yb = L.Y(En(mode === 'emit' ? n1 : n2));
        g.strokeStyle = pc; g.fillStyle = pc; g.lineWidth = 2; g.beginPath(); g.moveTo(ax, ya); g.lineTo(ax, yb); g.stroke();
        const dir = Math.sign(yb - ya) || 1;
        g.beginPath(); g.moveTo(ax, yb); g.lineTo(ax - 5, yb - 8 * dir); g.lineTo(ax + 5, yb - 8 * dir); g.closePath(); g.fill();
        const nE = electronN();
        g.fillStyle = col('--s1'); g.beginPath(); g.arc(ax, L.Y(-RY / (nE * nE)), 4.5, 0, 7); g.fill();
        g.fillStyle = col('--fg'); g.textAlign = 'right';
        g.fillText(`ΔE ${(HC / lam).toFixed(2)} eV`, ax - 8, Math.max(L.top + 30, (ya + yb) / 2));

        /* --- Bohr orbits (radius compressed: drawn ∝ n = √(r/a₀)) --- */
        g.save(); g.beginPath(); g.rect(O.wl, 0, L.W - O.wl, L.Hh); g.clip();
        for (let n = 1; n <= NMAX; n++) {
          const sel = n === n1 || n === n2;
          g.strokeStyle = sel ? col('--accent') : col('--grid'); g.lineWidth = sel ? 1.8 : 1;
          g.beginPath(); g.arc(O.ox, O.oy, O.rn(n), 0, 7); g.stroke();
        }
        g.fillStyle = col('--muted'); g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillText('r = n²a₀（按 √r 压缩）', O.wl + 6, 4);
        g.fillStyle = col('--s2'); g.beginPath(); g.arc(O.ox, O.oy, 4, 0, 7); g.fill();
        // electron
        const re = O.rn(nE), ex = O.ox + re * Math.cos(theta), ey = O.oy + re * Math.sin(theta);
        g.fillStyle = col('--s1'); g.beginPath(); g.arc(ex, ey, 5, 0, 7); g.fill();
        // photon: emitted outward at p∈[0.45,1]; absorbed inward at p∈[0,0.45]
        const far = O.R + 60;
        let ph = null;
        if (mode === 'emit' && p >= 0.45) { const u = (p - 0.45) / 0.55; ph = O.rn(n1) + 20 + u * (far - O.rn(n1)); }
        if (mode === 'absorb' && p < 0.45) { const u = p / 0.45; ph = far - u * (far - O.rn(n1)); }
        if (ph != null) {
          const a = photonAng, fade = mode === 'emit' ? 1 - Math.max(0, (p - 0.9) / 0.1) : 1;
          const px = O.ox + ph * Math.cos(a), py = O.oy + ph * Math.sin(a);
          drawPhoton(g, px, py, a, 44, lam, fade);
          g.fillStyle = pc; g.globalAlpha = fade; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(`${lam.toFixed(1)} nm${band(lam) === '可见' ? '' : ' ' + band(lam)}`, px, py + (Math.sin(a) > 0 ? -16 : 16));
          g.globalAlpha = 1;
        }
        g.restore();
        drawSpectrum();
      }

      /* ---------- spectrum strip: log λ from 90 to 2000 nm ---------- */
      const LMIN = 90, LMAX = 2000;
      function specGeo() {
        const W = sp.w, Hh = sp.h, l = 10, r = 10, iw = W - l - r;
        return { W, Hh, X: (lm) => l + (Math.log(lm / LMIN) / Math.log(LMAX / LMIN)) * iw, y0: 18, y1: Hh - 38 };
      }
      function drawSpectrum() {
        const g = sp.g, S = specGeo(), mono = col('--mono-font') || 'monospace';
        g.fillStyle = col('--panel'); g.fillRect(0, 0, S.W, S.Hh);
        g.font = '11px ' + mono;
        g.fillStyle = 'rgba(8,8,14,0.92)'; g.fillRect(S.X(LMIN), S.y0, S.X(LMAX) - S.X(LMIN), S.y1 - S.y0);  // spectrograph plate
        for (let l = 380; l < 780; l += 2) { g.fillStyle = h.wavelengthRGB(l, 0.22); g.fillRect(S.X(l), S.y1 - 6, S.X(l + 2) - S.X(l) + 0.5, 6); }
        g.fillStyle = col('--muted'); g.textAlign = 'center'; g.textBaseline = 'bottom';
        [100, 200, 400, 700, 1000, 2000].forEach((t) => g.fillText(t === 2000 ? '2000 nm' : String(t), Math.min(S.X(t), S.W - 26), S.y0 - 3));
        const lamSel = lambda(n1, n2);
        for (let a = 1; a <= 3; a++) {
          const xl = S.X(limit(a)), xf = S.X(lambda(a, a + 1));
          g.strokeStyle = 'rgba(255,255,255,0.45)'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(xl, S.y0); g.lineTo(xl, S.y1); g.stroke(); g.setLineDash([]);
          for (let b = a + 1; b <= NMAX; b++) {
            const lm = lambda(a, b);
            g.strokeStyle = h.wavelengthRGB(lm) || 'rgba(205,205,215,0.6)'; g.lineWidth = 1.6;
            g.beginPath(); g.moveTo(S.X(lm), S.y0 + 2); g.lineTo(S.X(lm), S.y1 - 1); g.stroke();
          }
          // series bracket from limit to first line
          const yb = S.y1 + 8; g.strokeStyle = col('--line'); g.lineWidth = 1;
          g.beginPath(); g.moveTo(xl, yb - 3); g.lineTo(xl, yb); g.lineTo(xf, yb); g.lineTo(xf, yb - 3); g.stroke();
          g.fillStyle = col('--fg'); g.textBaseline = 'top'; g.fillText(SERIES[a] + '系', (xl + xf) / 2, yb + 3);
          g.fillStyle = col('--muted'); g.textAlign = 'left'; g.fillText('系限', xl - 3, yb + 16); g.textAlign = 'center';
        }
        // highlight selected line
        g.fillStyle = col('--accent'); g.strokeStyle = col('--accent');
        if (lamSel <= LMAX) {
          const x = S.X(lamSel);
          g.lineWidth = 3; g.beginPath(); g.moveTo(x, S.y0); g.lineTo(x, S.y0 + 6); g.moveTo(x, S.y1 - 6); g.lineTo(x, S.y1); g.stroke();
          g.strokeStyle = h.wavelengthRGB(lamSel) || 'rgba(230,230,240,0.95)'; g.lineWidth = 3;
          g.beginPath(); g.moveTo(x, S.y0 + 6); g.lineTo(x, S.y1 - 6); g.stroke();
          g.textBaseline = 'middle'; g.textAlign = x > S.W - 90 ? 'right' : 'left';
          g.fillText(`${lineName(n1, n2)} ${lamSel.toFixed(1)}`, x + (x > S.W - 90 ? -6 : 6), S.y0 + 10);
        } else {
          g.textBaseline = 'middle'; g.textAlign = 'right';
          g.fillText(`${lineName(n1, n2)} → ${(lamSel / 1000).toFixed(2)} μm`, S.X(LMAX) - 4, (S.y0 + S.y1) / 2);
        }
        g.lineWidth = 1;
      }

      function updateReadouts() {
        const lam = lambda(n1, n2);
        rT.set(`n=${n2} → n=${n1} · ${SERIES[n1]}系 ${lineName(n1, n2)}`);
        rE.set(`${(HC / lam).toFixed(3)} eV`);
        rL.set(`${lam.toFixed(2)} nm · ${band(lam)}`);
        rF.set(`${sci(CL / (lam * 1e-9))} Hz`);
        rR.set(`(${n2}/${n1})² = ${((n2 / n1) ** 2).toFixed(2)}`);
        rA.set(`${n2}ħ ↔ ${n1}ħ（ħ = 1.0546×10⁻³⁴ J·s）`);
      }

      /* ---------- animation ---------- */
      const lp = h.loop((dt) => {
        theta += omega(Math.max(1, electronN())) * dt;
        p = Math.min(1, p + dt / DUR);
        if (mode === 'emit' && p >= 0.45 && photonAng == null) photonAng = theta;
        draw();
        if (p >= 1) lp.stop();
      });
      function play() {
        lp.stop(); p = 0;
        if (mode === 'emit') photonAng = null;
        else {  // aim incoming photon at where the electron will be when it arrives
          photonAng = theta + omega(n1) * 0.45 * DUR;
        }
        if (ctx.reduced) {   // static "mid-transition" frame instead of motion
          p = mode === 'emit' ? 0.72 : 0.3; photonAng = theta;
          draw(); return;
        }
        lp.start();
      }
      function changed() { lp.stop(); p = 0; photonAng = theta; updateReadouts(); draw(); }

      /* ---------- pointer: click a ladder level or a spectral line ---------- */
      function onLadder(e) {
        const r = cv.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, L = ladderGeo();
        if (x > L.wl) return;
        let best = 1, bd = Infinity;
        for (let n = 1; n <= NMAX; n++) { const d = Math.abs(L.Y(En(n)) - y); if (d < bd) { bd = d; best = n; } }
        if (best > n1) { n2 = best; c2.set(n2); } else { n1 = best; c1.set(n1); if (n2 <= n1) { n2 = n1 + 1; c2.set(n2); } }
        changed();
      }
      function onSpec(e) {
        const r = sp.canvas.getBoundingClientRect(), x = e.clientX - r.left, S = specGeo();
        let best = null, bd = 10;
        for (let a = 1; a <= 3; a++) for (let b = a + 1; b <= NMAX; b++) {
          const d = Math.abs(S.X(lambda(a, b)) - x); if (d < bd) { bd = d; best = [a, b]; }
        }
        if (best) { [n1, n2] = best; c1.set(n1); c2.set(n2); changed(); }
      }
      cv.canvas.addEventListener('pointerdown', onLadder);
      sp.canvas.addEventListener('pointerdown', onSpec);
      cv.onResize(draw); sp.onResize(drawSpectrum);
      // redraw when the theme flips (colours are read at draw time)
      const mo = new MutationObserver(() => draw());
      mo.observe(document.documentElement, { attributes: true });
      if (document.body) mo.observe(document.body, { attributes: true });
      const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      mq && mq.addEventListener && mq.addEventListener('change', draw);

      updateReadouts(); photonAng = theta; draw();
      play();   // plays once on mount (static frame if reduced motion)

      return {
        destroy() {
          lp.stop(); cv.destroy(); sp.destroy(); mo.disconnect();
          mq && mq.removeEventListener && mq.removeEventListener('change', draw);
          cv.canvas.removeEventListener('pointerdown', onLadder);
          sp.canvas.removeEventListener('pointerdown', onSpec);
        },
      };
    },
  };
})();
