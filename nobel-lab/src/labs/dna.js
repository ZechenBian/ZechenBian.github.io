/* DNA 双螺旋与碱基配对 — Crick, Watson, Wilkins, Nobel Medicine 1962
 * B-DNA geometry: rise 3.4 Å/bp, 10.5 bp/turn (twist 34.3°), diameter 20 Å.
 * Strand 2 backbone sits 135° (3/8 turn) round from strand 1 at the same level → minor/major grooves.
 * (That 3/8 offset is also what makes the 4th layer line of Photo 51 vanish: 4·135° = 540° ≡ 180°.)
 * Fibre diffraction of a helix (Cochran–Crick–Vand 1952): layer line l at Z = l/P carries
 * Bessel terms J_n(2πRρ) with n = l − 10m (10 units per turn); two strands at Δφ multiply term n by
 * |1 + e^{inΔφ}|² = 4cos²(nΔφ/2).
 */
(() => {
  const PAIR = { A: 'T', T: 'A', G: 'C', C: 'G' }, HB = { A: 2, T: 2, G: 3, C: 3 };
  const RISE = 3.4, BP_TURN = 10.5, DPHI = (135 * Math.PI) / 180, MAXN = 24;
  const comp = (s) => s.split('').map((b) => PAIR[b]).join('');          // aligned 3'→5'
  const revcomp = (s) => comp(s).split('').reverse().join('');           // read 5'→3'
  function stats(s) {
    const n = (b) => s.split(b).length - 1, at = n('A') + n('T'), gc = n('G') + n('C');
    return { N: s.length, gc: s.length ? gc / s.length : 0, A: at, T: at, G: gc, C: gc, // both strands: A₁+A₂ = A₁+T₁
      hb: 2 * at + 3 * gc, nm: s.length * RISE / 10, turns: s.length / BP_TURN };
  }
  function besselJ(n, x) { // J_n(x) = (1/π)∫₀^π cos(nτ − x sin τ) dτ, Simpson, 64 panels
    const K = 64; let s = 0;
    for (let k = 0; k <= K; k++) { const t = (Math.PI * k) / K, w = k === 0 || k === K ? 1 : k % 2 ? 4 : 2; s += w * Math.cos(n * t - x * Math.sin(t)); }
    return s / (3 * K);
  }
  // fibre-diffraction intensity of a 2-strand, 10-units/turn helix (R = 10 Å, P = 34 Å)
  function layerI(l, rho, R = 10) {
    let I = 0;
    for (let m = -2; m <= 2; m++) { const n = l - 10 * m; if (Math.abs(n) > 14) continue;
      const J = besselJ(Math.abs(n), 2 * Math.PI * R * Math.abs(rho)); I += J * J * 4 * Math.cos((n * DPHI) / 2) ** 2; }
    return I;
  }
  const M = { comp, revcomp, stats, besselJ, layerI };

  LABS.dna = {
    title: 'DNA 双螺旋与碱基配对',
    _math: M,
    mount(root, ctx) {
      const h = ctx.h, C = (n) => ctx.color(n), mono = () => C('--mono-font') || 'monospace';
      const BC = { A: '--s1', T: '--s2', G: '--s3', C: '--s4' };
      const st = { seq: 'GATTACACGCGTATGGCCAAT', phi: 0.4, speed: 30, mut: -1, rep: -1, repOn: false };
      const stage = h.el('div', { class: 'lab-stage' });
      const controls = h.el('div', { class: 'lab-controls' });
      const readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', text: '拖动或调速旋转螺旋：两条骨架不是相隔 180°，于是出现一宽一窄的大沟、小沟。改序列看 Chargaff 规则 A=T、G=C 自动成立；按“半保留复制”看每个子代双链都保留一条旧链。' });
      root.append(stage, controls, readout, hint);
      const cv = h.canvas(stage, { aspect: 0.58, minH: 260, maxH: 420 });
      stage.append(h.el('div', { class: 'ctl-lab', style: 'margin:10px 0 4px', text: '为什么是 X 形？' }));
      const xr = h.canvas(stage, { aspect: 0.5, minH: 200, maxH: 320 });
      stage.append(h.el('div', { class: 'ctl-lab', style: 'font-size:12px', text: '螺旋 ⇒ X 形衍射；层线间距 ⇒ 螺距 34 Å；第 10 层线强 ⇒ 每圈 10 个碱基（第 4 层线因两链错开 3/8 圈而消失）' }));

      // ---- controls ----
      const msg = h.el('span', { class: 'ctl-lab', style: 'min-height:1.2em' });
      const inp = h.el('input', { type: 'text', value: st.seq, maxlength: 60, spellcheck: 'false', autocomplete: 'off', 'aria-label': "链 1 序列 5'→3'", style: 'width:100%;font-family:var(--mono-font,monospace);text-transform:uppercase' });
      inp.addEventListener('input', () => {
        const raw = inp.value.toUpperCase(), clean = raw.replace(/[^ACGT]/g, '').slice(0, MAXN);
        msg.textContent = raw.replace(/[^ACGT]/g, '').length > MAXN ? '最多 ' + MAXN + ' bp' : clean.length < raw.length ? '已忽略非 ACGT 字符' : '';
        if (clean.length) { st.seq = clean; st.mut = -1; resetRep(); refresh(); } else msg.textContent = '至少 1 个碱基';
      });
      inp.addEventListener('blur', () => { inp.value = st.seq; });
      const inWrap = h.el('div', { class: 'ctl' }, [h.el('span', { class: 'ctl-lab', text: "链 1 (5'→3')" }), inp, msg]);
      const sSpin = ctx.reduced
        ? h.slider({ label: '旋转角', min: 0, max: 360, step: 1, value: 23, format: (v) => v + '°', onInput: (v) => { st.phi = (v * Math.PI) / 180; draw(); } })
        : h.slider({ label: '旋转速度', min: 0, max: 90, step: 1, value: st.speed, format: (v) => v + '°/s', onInput: (v) => (st.speed = v) });
      const bRand = h.button({ label: '随机序列', onClick: () => { const n = 12 + Math.floor(Math.random() * 13); st.seq = Array.from({ length: n }, () => 'ACGT'[Math.floor(Math.random() * 4)]).join(''); inp.value = st.seq; st.mut = -1; msg.textContent = ''; resetRep(); refresh(); } });
      const bMut = h.button({ label: '突变一个碱基', onClick: () => {
        const i = Math.floor(Math.random() * st.seq.length), old = st.seq[i], opts = 'ACGT'.replace(old, '');
        const nb = opts[Math.floor(Math.random() * 3)]; st.seq = st.seq.slice(0, i) + nb + st.seq.slice(i + 1);
        st.mut = i; inp.value = st.seq; msg.textContent = '第 ' + (i + 1) + ' 位 ' + old + '→' + nb + '，互补链 ' + PAIR[old] + '→' + PAIR[nb]; resetRep(); refresh(); } });
      const bRep = h.button({ label: '半保留复制', kind: 'primary', onClick: () => {
        if (st.repOn) { resetRep(); draw(); return; }
        st.repOn = true; st.rep = ctx.reduced ? st.seq.length + 4 : -1; bRep.textContent = '复原'; draw(); } });
      function resetRep() { st.repOn = false; st.rep = -1; bRep.textContent = '半保留复制'; }
      controls.append(inWrap, sSpin.el, h.el('div', { class: 'ctl' }, [bRand, ' ', bMut, ' ', bRep]));
      const ro = { N: h.readout('长度'), gc: h.readout('GC 含量'), ch: h.readout('Chargaff（双链合计）'), hb: h.readout('氢键总数'),
        L: h.readout('螺旋长度'), t: h.readout('圈数'), rc: h.readout("互补链 5'→3'") };
      Object.values(ro).forEach((r) => readout.append(r.el));
      function refresh() {
        const s = stats(st.seq);
        ro.N.set(s.N + ' bp'); ro.gc.set((100 * s.gc).toFixed(1) + ' %');
        ro.ch.set(`A=${s.A} T=${s.T} · G=${s.G} C=${s.C}`); ro.hb.set(`${s.hb}（A–T×2, G–C×3）`);
        ro.L.set(`${s.N} × 0.34 = ${s.nm.toFixed(2)} nm`); ro.t.set(`${s.N} / 10.5 = ${s.turns.toFixed(2)}`); ro.rc.set(revcomp(st.seq));
        draw();
      }

      // ---- main canvas: helix (or replication ladder) + sequence rows ----
      function layout() {
        const W = cv.w, Hh = cv.h, N = st.seq.length, helixH = Hh - 70;
        const sp = Math.min((W - 44) / Math.max(N, 1), (RISE * (helixH / 2 - 8)) / 10, 30);
        return { W, Hh, N, sp, k: sp / RISE, R: (10 * sp) / RISE, x0: (W - (N - 1) * sp) / 2, cy: 8 + helixH / 2 };
      }
      function draw() {
        const g = cv.g, L = layout(); g.fillStyle = C('--panel'); g.fillRect(0, 0, L.W, L.Hh);
        if (st.repOn) drawRep(g, L); else drawHelix(g, L);
        drawSeq(g, L);
      }
      function drawHelix(g, L) {
        const { N, sp, R, x0, cy } = L, tw = (2 * Math.PI) / BP_TURN, items = [];
        const pt = (t, s) => { const th = st.phi + t * tw + (s ? DPHI : 0); return [x0 + t * sp, cy - R * Math.cos(th), Math.sin(th)]; };
        for (let s = 0; s < 2; s++) for (let t = -0.5; t < N - 0.5 - 1e-9; t += 0.25) {
          const a = pt(t, s), b = pt(t + 0.25, s);
          items.push({ z: (a[2] + b[2]) / 2, f: (z) => { g.strokeStyle = C(s ? '--muted' : '--fg'); g.lineWidth = 2 + 3 * (z + 1) / 2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); } });
        }
        for (let i = 0; i < N; i++) {
          const a = pt(i, 0), b = pt(i, 1), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b1 = st.seq[i];
          items.push({ z: (a[2] + b[2]) / 2 - 0.01, f: (z) => {
            g.lineWidth = Math.max(2, sp * 0.32); g.lineCap = 'butt';
            g.strokeStyle = C(BC[b1]); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(m[0], m[1] - 0.8 * Math.sign(b[1] - a[1])); g.stroke();
            g.strokeStyle = C(BC[PAIR[b1]]); g.beginPath(); g.moveTo(m[0], m[1] + 0.8 * Math.sign(b[1] - a[1])); g.lineTo(b[0], b[1]); g.stroke();
            if (i === st.mut) { g.strokeStyle = C('--accent'); g.lineWidth = 1.5; g.beginPath(); g.arc(m[0], m[1], Math.max(6, Math.abs(b[1] - a[1]) / 2 + 4), 0, 7); g.stroke(); }
          } });
        }
        items.sort((p, q) => p.z - q.z).forEach((it) => { g.globalAlpha = 0.3 + 0.7 * (it.z + 1) / 2; it.f(it.z); });
        g.globalAlpha = 1; g.lineCap = 'butt';
        g.font = '11px ' + mono(); g.fillStyle = C('--muted'); g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillText(`B-DNA · 直径 20 Å · 每圈 10.5 bp · 螺距 ${(RISE * BP_TURN).toFixed(1)} Å`, 6, 4);
        // scale bar: one turn
        const yb = cy + R + 10, xb = x0 - sp / 2;
        g.strokeStyle = C('--muted'); g.lineWidth = 1; g.beginPath(); g.moveTo(xb, yb); g.lineTo(xb + BP_TURN * sp, yb); g.stroke();
        g.textBaseline = 'top'; g.fillText('1 圈', xb + 2, yb + 2);
      }
      function drawRep(g, L) { // flattened ladder; fork at bp st.rep moves left→right
        const { N, sp, R, x0, cy } = L, gw = Math.min(R * 0.45, 26), D = gw + Math.min(R * 0.5, 30);
        const sm = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
        const off = (i) => D * sm((st.rep - i) / 3), newA = (i) => sm((st.rep - i - 1.5) / 2);
        const strand = (yf, solid, alphaF) => { // backbone polyline
          g.lineWidth = solid ? 3 : 2; g.strokeStyle = C(solid ? '--fg' : '--muted'); g.setLineDash(solid ? [] : [5, 4]);
          for (let i = 0; i < N - 1; i++) { const a = alphaF ? Math.min(alphaF(i), alphaF(i + 1)) : 1; if (a <= 0.01) continue;
            g.globalAlpha = solid ? 1 : 0.4 + 0.5 * a; g.beginPath(); g.moveTo(x0 + i * sp, yf(i)); g.lineTo(x0 + (i + 1) * sp, yf(i + 1)); g.stroke(); }
          g.setLineDash([]); g.globalAlpha = 1;
        };
        const rung = (i, yTop, yBot, bTop, aTop, aBot) => {
          const x = x0 + i * sp, m = (yTop + yBot) / 2; g.lineWidth = Math.max(2, sp * 0.32);
          g.globalAlpha = aTop; g.strokeStyle = C(BC[bTop]); g.beginPath(); g.moveTo(x, yTop); g.lineTo(x, m - 1); g.stroke();
          g.globalAlpha = aBot; g.strokeStyle = C(BC[PAIR[bTop]]); g.beginPath(); g.moveTo(x, m + 1); g.lineTo(x, yBot); g.stroke(); g.globalAlpha = 1;
        };
        for (let i = 0; i < N; i++) {
          const b = st.seq[i], o = off(i), na = 0.6 * newA(i);
          if (o < 0.5) rung(i, cy - gw, cy + gw, b, 1, 1);
          else { rung(i, cy - gw - o, cy - gw - o + 2 * gw * newA(i), b, 1, na); rung(i, cy + gw + o - 2 * gw * newA(i), cy + gw + o, b, na, 1); }
        }
        strand((i) => cy - gw - off(i), true);                        // old strand 1
        strand((i) => cy + gw + off(i), true);                        // old strand 2
        strand((i) => cy - gw - off(i) + 2 * gw, false, newA);        // new partner of strand 1
        strand((i) => cy + gw + off(i) - 2 * gw, false, newA);        // new partner of strand 2
        g.font = '11px ' + mono(); g.textBaseline = 'top'; g.textAlign = 'left'; g.fillStyle = C('--muted');
        g.fillText('— 旧链（实线）   - - 新链（虚线）', 6, 4);
        if (st.rep > N + 2) { g.fillStyle = C('--good'); g.textAlign = 'right'; g.fillText('两个子代双链：各含一条旧链', L.W - 6, 4); }
      }
      function drawSeq(g, L) {
        const { N, sp, x0, Hh } = L, y1 = Hh - 50, y2 = Hh - 18, fs = Math.max(9, Math.min(13, sp * 0.95));
        g.font = `${fs}px ` + mono(); g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = C('--muted'); g.font = '10px ' + mono();
        g.fillText("5'", x0 - sp * 0.5 - 8, y1); g.fillText("3'", x0 + (N - 0.5) * sp + 8, y1);
        g.fillText("3'", x0 - sp * 0.5 - 8, y2); g.fillText("5'", x0 + (N - 0.5) * sp + 8, y2);
        for (let i = 0; i < N; i++) {
          const x = x0 + i * sp, b = st.seq[i], c = PAIR[b];
          if (i === st.mut) { g.strokeStyle = C('--accent'); g.lineWidth = 1.5; g.strokeRect(x - sp / 2 + 1, y1 - 10, sp - 2, y2 - y1 + 20); }
          g.font = `bold ${fs}px ` + mono();
          g.fillStyle = C(BC[b]); g.fillText(b, x, y1); g.fillStyle = C(BC[c]); g.fillText(c, x, y2);
          g.strokeStyle = C('--muted'); g.lineWidth = 1; const n = HB[b], w = Math.min(3, sp / 5);
          for (let j = 0; j < n; j++) { const xx = x + (j - (n - 1) / 2) * w; g.beginPath(); g.moveTo(xx, y1 + 9); g.lineTo(xx, y2 - 9); g.stroke(); }
        }
      }

      // ---- diffraction panel ----
      let img = null;
      function buildPattern() { // reciprocal space ρ∈[−0.2,0.2] Å⁻¹, l = −11..11 (Z = l/34 Å⁻¹)
        const NR = 60, L = 11, rows = [];
        let mx = 0; for (let l = -L; l <= L; l++) { const row = []; for (let j = 0; j <= NR; j++) { const v = layerI(l, (0.2 * j) / NR); row.push(v); if ((l % 10 !== 0) || j > 2) mx = Math.max(mx, v); } rows.push(row); }
        img = { NR, L, rows, mx };
      }
      function drawX() {
        const g = xr.g, W = xr.w, Hh = xr.h; g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        g.font = '11px ' + mono();
        // left: projection of the two backbones (sinusoids), vertical axis
        const lw = Math.min(W * 0.32, 160), ax = lw / 2, P = (Hh - 30) / 2, A = lw * 0.28, top = 14;
        for (let s = 0; s < 2; s++) { g.strokeStyle = C(s ? '--muted' : '--fg'); g.lineWidth = 2; g.beginPath();
          for (let y = 0; y <= 2 * P; y += 2) { const x = ax + A * Math.sin((2 * Math.PI * y) / P + st.phi + (s ? DPHI : 0)); y ? g.lineTo(x, top + y) : g.moveTo(x, top + y); } g.stroke(); }
        g.strokeStyle = C('--muted'); g.lineWidth = 1; g.beginPath(); g.moveTo(lw - 8, top); g.lineTo(lw - 8, top + P); g.stroke();
        g.fillStyle = C('--fg'); g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText('P=34 Å', lw - 11, top + P / 2);
        g.fillStyle = C('--muted'); g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText('侧视投影', ax, top + 2 * P + 2);
        // right: computed fibre pattern
        if (!img) buildPattern();
        const x0 = lw + 10, pw = W - x0 - 74, cx = x0 + pw / 2, cyy = Hh / 2, zs = (Hh / 2 - 12) / (img.L + 0.5), rs = pw / 2 / 0.2;
        g.fillStyle = C('--fg');
        for (let li = 0; li < img.rows.length; li++) { const l = li - img.L, y = cyy - l * zs;
          img.rows[li].forEach((v, j) => { const a = Math.min(1, 1.6 * v / img.mx); if (a < 0.08) return; g.globalAlpha = a;
            const dx = (j * 0.2 / img.NR) * rs, r = 1 + 1.6 * a; // blob size ∝ intensity
            g.beginPath(); g.ellipse(cx + dx, y, r * 1.4, r, 0, 0, 7); g.ellipse(cx - dx, y, r * 1.4, r, 0, 0, 7); g.fill(); }); }
        g.globalAlpha = 1;
        // labels
        g.strokeStyle = C('--accent'); g.fillStyle = C('--accent'); g.lineWidth = 1; g.textAlign = 'left'; g.textBaseline = 'middle';
        const xl = x0 + pw + 6; g.beginPath(); g.moveTo(xl, cyy); g.lineTo(xl, cyy - zs); g.stroke(); g.fillText('1/34 Å⁻¹', xl + 3, cyy - zs / 2);
        g.beginPath(); g.arc(cx, cyy - 10 * zs, 5, 0, 7); g.stroke(); g.fillText('1/3.4 Å⁻¹', xl + 3, cyy - 10 * zs);
        g.fillStyle = C('--warn'); g.fillText('l=4 缺', xl + 3, cyy - 4 * zs);
        g.fillStyle = C('--muted'); g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText('|J_n(2πRρ)|² 层线', cx, Hh - 1);
      }

      // ---- interaction & animation ----
      let drag = null;
      const pd = (e) => { drag = { x: e.clientX, phi: st.phi }; cv.canvas.setPointerCapture(e.pointerId); };
      const pm = (e) => { if (!drag) return; st.phi = drag.phi + (e.clientX - drag.x) * 0.02; if (ctx.reduced) { sSpin.set(Math.round(((st.phi * 180 / Math.PI) % 360 + 360) % 360)); draw(); } };
      const pu = () => { drag = null; };
      cv.canvas.style.touchAction = 'pan-y'; cv.canvas.style.cursor = 'grab';
      cv.canvas.addEventListener('pointerdown', pd); cv.canvas.addEventListener('pointermove', pm);
      cv.canvas.addEventListener('pointerup', pu); cv.canvas.addEventListener('pointercancel', pu);
      const lp = h.loop((dt) => {
        if (!drag) st.phi += (st.speed * Math.PI / 180) * dt;
        if (st.repOn && st.rep < st.seq.length + 4) st.rep += 5 * dt; // 5 bp/s
        draw();
      });
      cv.onResize(() => draw()); xr.onResize(() => drawX());
      const mo = new MutationObserver(() => { draw(); drawX(); });
      mo.observe(document.documentElement, { attributes: true });
      refresh(); drawX();
      if (!ctx.reduced) lp.start();
      return { destroy() { lp.stop(); mo.disconnect(); cv.destroy(); xr.destroy();
        cv.canvas.removeEventListener('pointerdown', pd); cv.canvas.removeEventListener('pointermove', pm);
        cv.canvas.removeEventListener('pointerup', pu); cv.canvas.removeEventListener('pointercancel', pu); } };
    },
  };
})();
