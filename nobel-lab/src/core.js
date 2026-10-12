/* ===== core.js — shared helpers for every lab =====
 * Contract for a lab file (src/labs/<id>.js):
 *
 *   LABS.<id> = {
 *     title: '中文实验名',
 *     mount(root, ctx) { ...build DOM inside root...; return { destroy() {...} }; }
 *   };
 *
 * ctx = {
 *   color(name)   -> current value of a CSS token, e.g. ctx.color('--fg'). Theme can change at
 *                    any time, so read colors inside your draw function, not once at mount.
 *   reduced       -> true if the viewer prefers reduced motion (skip/slow ambient animation)
 *   h             -> the helpers below
 * }
 */
window.LABS = window.LABS || {};

const H = (() => {
  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(children)) {
      if (c == null || c === false) continue;
      e.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return e;
  }

  let uid = 0;
  const nid = (p) => `${p}-${++uid}`;

  /* Slider: returns {el, get(), set(v)}. format(v) -> string shown next to label. */
  function slider({ label, min, max, step = 1, value, format = (v) => v, onInput, id }) {
    id = id || nid('s');
    const out = el('output', { class: 'ctl-val', for: id });
    const input = el('input', { type: 'range', id, min, max, step, value });
    const wrap = el('div', { class: 'ctl ctl-slider' }, [
      el('label', { for: id, class: 'ctl-lab' }, [el('span', { text: label }), out]),
      input,
    ]);
    const show = () => (out.textContent = format(+input.value));
    input.addEventListener('input', () => { show(); onInput && onInput(+input.value); });
    show();
    return { el: wrap, input, get: () => +input.value, set: (v) => { input.value = v; show(); } };
  }

  /* Segmented choice: options = [{value,label}]. returns {el, get(), set(v)} */
  function choice({ label, options, value, onChange }) {
    let cur = value ?? options[0].value;
    const btns = options.map((o) =>
      el('button', { type: 'button', class: 'seg', 'aria-pressed': String(o.value === cur), text: o.label,
        onclick: () => { set(o.value); onChange && onChange(cur); } }));
    function set(v) { cur = v; btns.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === v))); }
    const wrap = el('div', { class: 'ctl ctl-choice' }, [
      label ? el('span', { class: 'ctl-lab', text: label }) : null,
      el('div', { class: 'segs', role: 'group' }, btns),
    ]);
    return { el: wrap, get: () => cur, set };
  }

  /* Checkbox toggle. returns {el, get(), set(b)} */
  function toggle({ label, value = false, onChange, id }) {
    id = id || nid('t');
    const input = el('input', { type: 'checkbox', id });
    input.checked = !!value;
    input.addEventListener('change', () => onChange && onChange(input.checked));
    const wrap = el('label', { class: 'ctl ctl-toggle', for: id }, [input, el('span', { text: label })]);
    return { el: wrap, get: () => input.checked, set: (b) => (input.checked = !!b) };
  }

  /* Button. kind: 'primary' | undefined */
  function button({ label, onClick, kind }) {
    return el('button', { type: 'button', class: 'btn' + (kind ? ' btn-' + kind : ''), text: label, onclick: onClick });
  }

  /* Readout row: returns {el, set(text)} */
  function readout(label, initial = '—') {
    const v = el('span', { class: 'ro-val', text: initial });
    return { el: el('div', { class: 'ro' }, [el('span', { class: 'ro-lab', text: label }), v]), set: (t) => (v.textContent = t) };
  }

  /* Hi-DPI canvas that tracks its container width.
   * aspect = height / width (e.g. 0.6). minH/maxH clamp CSS height in px.
   * returns { canvas, g (2d ctx in CSS px units), get w(), get h(), onResize(cb), destroy() } */
  function canvas(parent, { aspect = 0.6, minH = 180, maxH = 460, cls = '' } = {}) {
    const c = el('canvas', { class: 'lab-canvas ' + cls });
    parent.append(c);
    const g = c.getContext('2d');
    let W = 300, Hh = 180; const cbs = [];
    function fit() {
      const r = c.parentElement.getBoundingClientRect();
      W = Math.max(200, Math.floor(r.width));
      Hh = Math.round(Math.min(maxH, Math.max(minH, W * aspect)));
      const d = Math.min(window.devicePixelRatio || 1, 2);
      c.width = W * d; c.height = Hh * d; c.style.width = W + 'px'; c.style.height = Hh + 'px';
      g.setTransform(d, 0, 0, d, 0, 0);
      cbs.forEach((f) => f(W, Hh));
    }
    const ro = new ResizeObserver(() => fit());
    ro.observe(c.parentElement);
    fit();
    return {
      canvas: c, g,
      get w() { return W; }, get h() { return Hh; },
      onResize(f) { cbs.push(f); },
      destroy() { ro.disconnect(); },
    };
  }

  /* rAF loop: cb(dtSeconds, tSeconds). returns {stop(), start(), running} */
  function loop(cb) {
    let id = 0, last = 0, t = 0, running = false;
    function frame(ts) {
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts; t += dt;
      cb(dt, t); if (running) id = requestAnimationFrame(frame);
    }
    const api = {
      start() { if (!running) { running = true; last = 0; id = requestAnimationFrame(frame); } return api; },
      stop() { running = false; cancelAnimationFrame(id); return api; },
      get running() { return running; },
    };
    return api;
  }

  /* Simple axis helper for plots. Returns mapping functions and draws frame+ticks.
   * opts: {x0,x1,y0,y1, pad:{l,r,t,b}, xTicks:[...], yTicks:[...], xLabel, yLabel, fmtX, fmtY, logY} */
  function axes(g, W, Hh, o, color) {
    const p = Object.assign({ l: 46, r: 14, t: 14, b: 34 }, o.pad || {});
    const iw = W - p.l - p.r, ih = Hh - p.t - p.b;
    const X = (x) => p.l + ((x - o.x0) / (o.x1 - o.x0)) * iw;
    const Y = o.logY
      ? (y) => p.t + ih - ((Math.log10(Math.max(y, 1e-300)) - Math.log10(o.y0)) / (Math.log10(o.y1) - Math.log10(o.y0))) * ih
      : (y) => p.t + ih - ((y - o.y0) / (o.y1 - o.y0)) * ih;
    g.save();
    g.font = '11px ' + (color('--mono-font') || 'monospace');
    g.strokeStyle = color('--grid'); g.lineWidth = 1; g.fillStyle = color('--muted');
    g.textAlign = 'center'; g.textBaseline = 'top';
    (o.xTicks || []).forEach((t) => { const x = X(t); g.beginPath(); g.moveTo(x, p.t); g.lineTo(x, p.t + ih); g.stroke(); g.fillText((o.fmtX || String)(t), x, p.t + ih + 6); });
    g.textAlign = 'right'; g.textBaseline = 'middle';
    (o.yTicks || []).forEach((t) => { const y = Y(t); g.beginPath(); g.moveTo(p.l, y); g.lineTo(p.l + iw, y); g.stroke(); g.fillText((o.fmtY || String)(t), p.l - 6, y); });
    g.strokeStyle = color('--line'); g.strokeRect(p.l + 0.5, p.t + 0.5, iw, ih);
    g.fillStyle = color('--muted'); g.textAlign = 'center'; g.textBaseline = 'bottom';
    if (o.xLabel) g.fillText(o.xLabel, p.l + iw / 2, Hh - 1);
    if (o.yLabel) { g.save(); g.translate(11, p.t + ih / 2); g.rotate(-Math.PI / 2); g.textBaseline = 'middle'; g.fillText(o.yLabel, 0, 0); g.restore(); }
    g.restore();
    return { X, Y, p, iw, ih };
  }

  /* Wavelength (nm, 380–780) -> approximate visible sRGB string; outside range returns null */
  function wavelengthRGB(nm, alpha = 1) {
    let r = 0, gg = 0, b = 0;
    if (nm < 380 || nm > 780) return null;
    if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
    else if (nm < 490) { gg = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { gg = 1; b = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; gg = 1; }
    else if (nm < 645) { r = 1; gg = -(nm - 645) / 65; }
    else { r = 1; }
    let f = nm < 420 ? 0.3 + 0.7 * (nm - 380) / 40 : nm > 700 ? 0.3 + 0.7 * (780 - nm) / 80 : 1;
    const c = (v) => Math.round(255 * Math.pow(v * f, 0.8));
    return `rgba(${c(r)},${c(gg)},${c(b)},${alpha})`;
  }

  return { el, slider, choice, toggle, button, readout, canvas, loop, axes, wavelengthRGB };
})();

/* ===== Challenge framework (v2) =====
 * Contract for a challenge file (src/challenges/<id>.js):
 *   CHALLENGES.<id> = { title: '中文名', mount(root, ctx) { return H.stages(root, ctx, [ ...stages ]); } };
 * A stage: { title, task (HTML, may contain $TeX$), hints: [HTML,...], answer: HTML (shown on give-up),
 *            build(body, api) -> optional { destroy() } }
 * api: done(msgHTML)        mark this stage solved (shows success + "下一关" button). Idempotent.
 *      say(html, kind)      feedback line under the body; kind: 'info' | 'good' | 'bad'
 *      typeset(node)        render $TeX$ inside node (call after inserting HTML that contains TeX)
 *      solved()             -> bool
 * ctx (from the page): color(), reduced, h, typeset(node), progress: {get() -> Set of solved indices, mark(i)}, onComplete()
 */
window.CHALLENGES = window.CHALLENGES || {};

H.stages = function (root, ctx, stages) {
  const el = H.el;
  const solved = new Set(ctx.progress ? ctx.progress.get() : []);
  const built = new Map(); // i -> {wrap, handle}
  let cur = 0;
  const pills = stages.map((s, i) => el('button', { type: 'button', class: 'pill', onclick: () => open(i) }, [el('span', { class: 'pill-n', text: String(i + 1) }), el('span', { class: 'pill-t', text: s.title })]));
  const strip = el('div', { class: 'pills', role: 'tablist' }, pills);
  const host = el('div', { class: 'stage-host' });
  root.append(strip, host);
  const ts = (n) => { if (ctx.typeset) ctx.typeset(n); };

  function refresh() {
    pills.forEach((p, i) => {
      const reachable = i === 0 || solved.has(i - 1) || solved.has(i);
      p.disabled = !reachable;
      p.setAttribute('aria-selected', String(i === cur));
      p.dataset.state = solved.has(i) ? 'done' : i === cur ? 'cur' : reachable ? 'open' : 'locked';
    });
  }
  function build(i) {
    const s = stages[i];
    const fb = el('div', { class: 'stage-fb', 'aria-live': 'polite' });
    const body = el('div', { class: 'stage-body' });
    const hintBox = el('div', { class: 'stage-hints' });
    const ansBox = el('div', { class: 'stage-ans', hidden: true });
    const next = el('button', { type: 'button', class: 'btn btn-primary', hidden: true, text: i < stages.length - 1 ? '下一关 →' : '揭晓完整故事 ↓', onclick: () => { if (i < stages.length - 1) open(i + 1); else if (ctx.onComplete) ctx.onComplete(true); } });
    let shown = 0;
    const hintBtn = el('button', { type: 'button', class: 'btn', text: s.hints && s.hints.length ? `提示 (0/${s.hints.length})` : '没有提示', disabled: !(s.hints && s.hints.length) });
    hintBtn.addEventListener('click', () => {
      if (shown >= s.hints.length) return;
      const p = el('p', { class: 'hint', html: `<b>提示 ${shown + 1}</b>　${s.hints[shown]}` });
      hintBox.append(p); ts(p); shown++;
      hintBtn.textContent = `提示 (${shown}/${s.hints.length})`; if (shown >= s.hints.length) hintBtn.disabled = true;
    });
    const giveUp = el('button', { type: 'button', class: 'btn btn-ghost', text: '放弃，看答案' });
    giveUp.addEventListener('click', () => { ansBox.hidden = false; ansBox.innerHTML = '<b>答案</b>　' + (s.answer || ''); ts(ansBox); api.done(null, true); giveUp.disabled = true; });
    const wrap = el('section', { class: 'stage', 'aria-label': s.title }, [
      el('div', { class: 'stage-head' }, [el('span', { class: 'stage-k', text: `第 ${i + 1} 关 / ${stages.length}` }), el('h3', { text: s.title })]),
      el('div', { class: 'stage-task', html: s.task }),
      body, fb, hintBox, ansBox,
      el('div', { class: 'stage-foot' }, [hintBtn, giveUp, next]),
    ]);
    const api = {
      done(msg, viaGiveUp) {
        if (!solved.has(i)) { solved.add(i); if (ctx.progress) ctx.progress.mark(i, !!viaGiveUp); }
        if (msg) api.say(msg, 'good');
        next.hidden = false; refresh();
        if (solved.size === stages.length && ctx.onComplete) ctx.onComplete(false);
      },
      say(html, kind = 'info') { fb.className = 'stage-fb fb-' + kind; fb.innerHTML = html; ts(fb); },
      typeset: ts,
      solved: () => solved.has(i),
    };
    if (solved.has(i)) { next.hidden = false; }
    host.append(wrap);
    let handle = null;
    try { handle = s.build(body, api) || null; } catch (e) { console.error(e); body.append(el('p', { class: 'lab-missing', text: '这一关加载失败。' })); }
    ts(wrap);
    built.set(i, { wrap, handle });
  }
  function open(i) {
    cur = i;
    if (!built.has(i)) build(i);
    built.forEach((b, k) => { b.wrap.hidden = k !== i; });
    refresh();
  }
  // start at first unsolved stage
  let start = 0; while (start < stages.length - 1 && solved.has(start)) start++;
  open(start);
  return { destroy() { built.forEach((b) => { try { b.handle && b.handle.destroy && b.handle.destroy(); } catch (e) {} }); } };
};

/* Numeric answer box. check(v) -> {ok:bool, msg:HTML}. Returns {el, input} */
H.answer = function ({ label, unit = '', placeholder = '', check, onOk, id }) {
  const el = H.el;
  id = id || 'ans-' + Math.random().toString(36).slice(2, 8);
  const input = el('input', { type: 'text', inputmode: 'decimal', id, placeholder, autocomplete: 'off', class: 'ans-in' });
  const msg = el('span', { class: 'ans-msg', 'aria-live': 'polite' });
  const go = () => {
    const raw = input.value.trim().replace(/×\s*10\^?/i, 'e').replace(/[，,]/g, '.');
    const v = Number(raw);
    if (raw === '' || !isFinite(v)) { msg.className = 'ans-msg bad'; msg.textContent = '请输入一个数字'; return; }
    const r = check(v) || {};
    msg.className = 'ans-msg ' + (r.ok ? 'good' : 'bad'); msg.innerHTML = r.msg || (r.ok ? '对了' : '不对，再想想');
    if (r.ok && onOk) onOk(v);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  const wrap = el('div', { class: 'ans' }, [el('label', { for: id, class: 'ans-lab', html: label }), el('div', { class: 'ans-row' }, [input, unit ? el('span', { class: 'ans-unit', html: unit }) : null, H.button({ label: '检查', onClick: go })]), msg]);
  return { el: wrap, input };
};

/* Multiple-choice question. options: [{label(HTML), ok:bool, why(HTML)}]. Returns {el} */
H.quiz = function ({ question, options, onOk }) {
  const el = H.el;
  const why = el('div', { class: 'quiz-why', 'aria-live': 'polite' });
  const btns = options.map((o) => {
    const b = el('button', { type: 'button', class: 'quiz-opt', html: o.label });
    b.addEventListener('click', () => {
      btns.forEach((x) => x.classList.remove('picked'));
      b.classList.add('picked'); b.dataset.res = o.ok ? 'ok' : 'no';
      why.className = 'quiz-why ' + (o.ok ? 'good' : 'bad'); why.innerHTML = o.why || (o.ok ? '对。' : '不对。');
      if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([why]).catch(() => {});
      if (o.ok && onOk) onOk();
    });
    return b;
  });
  return { el: el('div', { class: 'quiz' }, [question ? el('div', { class: 'quiz-q', html: question }) : null, el('div', { class: 'quiz-opts' }, btns), why]) };
};
