/* app.js — v3: 50 rediscovery challenges; puzzles first, the story unlocks after */
(() => {
  const FIELD = { phy: '物理学', chem: '化学', med: '生理学或医学', econ: '经济学' };
  const PRIZE = { phy: '诺贝尔物理学奖', chem: '诺贝尔化学奖', med: '诺贝尔生理学或医学奖', econ: '瑞典央行纪念诺贝尔经济学奖' };
  const LANES = ['phy', 'chem', 'med', 'econ'].filter((f) => ENTRIES.some((e) => e.field === f));
  const E = [...ENTRIES].sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
  const byId = Object.fromEntries(E.map((e) => [e.id, e]));
  (() => {
    const L = window.LINKS = window.LINKS || [];
    const key = (a, b) => [a, b].sort().join('|');
    const seen = new Set(L.map((x) => key(x.a, x.b)));
    E.forEach((e) => (e.links || []).forEach((l) => {
      if (!byId[l.to] || l.to === e.id || seen.has(key(e.id, l.to))) return;
      const o = byId[l.to]; const first = o.year < e.year || (o.year === e.year && o.id < e.id) ? o : e;
      L.push({ a: first.id, b: first === e ? o.id : e.id, label: l.label }); seen.add(key(e.id, l.to));
    }));
    for (let i = L.length - 1; i >= 0; i--) if (!byId[L[i].a] || !byId[L[i].b]) L.splice(i, 1);
  })();
  // where the Literature & Peace page lives: the GitHub build sets a relative path, the artifact build uses the claude.ai link
  const HUM_URL = window.NOBEL_HUM_URL || 'https://claude.ai/artifact/13N7VFh1h3t1S6q52GCjiw';
  const HUM_EXT = /^https?:/.test(HUM_URL);
  const app = document.getElementById('app');
  const el = H.el;
  let handles = [];
  const KEY = 'nobel.v2.progress';
  let filter = 'all', sfilter = 'all';
  try { filter = localStorage.getItem('nobel.filter') || 'all'; sfilter = localStorage.getItem('nobel.sfilter') || 'all'; } catch (e) {}
  if (!['all', ...LANES].includes(filter)) filter = 'all';

  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const strip = (s) => String(s || '').replace(/\$[^$]*\$/g, '').trim();
  const shortName = (e) => e.short || (e.who.length > 1 ? e.who.slice(0, 2).map((w) => w.zh.split('·').pop()).join(' · ') + (e.who.length > 2 ? ' 等' : '') : e.who[0].zh.split('·').pop());

  function typeset(node) {
    const mj = window.MathJax;
    if (mj && mj.typesetPromise) mj.typesetPromise([node]).catch(() => {});
  }

  /* ---------- progress (per viewer, best effort) ---------- */
  let P = {};
  try { P = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { P = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} };
  const rec = (id) => (P[id] = P[id] || { s: [], g: [], r: false });
  const nStages = (id) => (byId[id] && byId[id].stages) || (window.STAGE_COUNT && STAGE_COUNT[id]) || 3;
  const solvedCount = (id) => (P[id] ? P[id].s.length : 0);
  const isDone = (id) => solvedCount(id) >= nStages(id);
  const isRevealed = (id) => !!(P[id] && (P[id].r || isDone(id)));
  function status(id) {
    const n = nStages(id), k = Math.min(solvedCount(id), n);
    if (k >= n) return { key: 'done', t: (P[id].g.length ? `已完成（看过 ${P[id].g.length} 个答案）` : '已独立还原'), cls: 'st-done' };
    if (k > 0) return { key: 'mid', t: `进行中 ${k}/${n}`, cls: 'st-mid' };
    if (isRevealed(id)) return { key: 'mid', t: '已直接揭晓', cls: 'st-mid' };
    return { key: 'new', t: `${n} 关 · 未开始`, cls: 'st-new' };
  }

  /* ---------- lineage map: lanes by field, x by year, automatic de-overlap ---------- */
  function lineage() {
    const NS = 'http://www.w3.org/2000/svg';
    const s = (tag, a = {}, kids = []) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); kids.forEach((c) => n.append(c)); return n; };
    const W = 1500, X0 = 130, X1 = 1470, Y0 = 1898, Y1 = 2026, LANE_H = 96, TOP = 28;
    const X = (y) => X0 + ((y - Y0) / (Y1 - Y0)) * (X1 - X0);
    const H_ = TOP + LANES.length * LANE_H + 34;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H_}`, role: 'img', 'aria-label': `${E.length} 项诺奖的思想谱系图` });
    // lanes + decade grid
    LANES.forEach((f, i) => {
      const yc = TOP + i * LANE_H + LANE_H / 2;
      svg.append(s('rect', { x: X0 - 14, y: TOP + i * LANE_H + 4, width: X1 - X0 + 28, height: LANE_H - 8, rx: 10, class: 'lane f-' + f }));
      const t = s('text', { x: 14, y: yc + 4, class: 'lane-label f-' + f }); t.textContent = FIELD[f]; svg.append(t);
    });
    for (let y = 1900; y <= 2020; y += 10) {
      const x = X(y);
      svg.append(s('line', { x1: x, x2: x, y1: TOP, y2: TOP + LANES.length * LANE_H, class: 'decade' }));
      const t = s('text', { x, y: H_ - 10, class: 'era', 'text-anchor': 'middle' }); t.textContent = y; svg.append(t);
    }
    // node positions: within a lane, greedy rows so circles never overlap
    const OFF = [0, -24, 24, -46, 46];
    const pos = {};
    LANES.forEach((f, i) => {
      const yc = TOP + i * LANE_H + LANE_H / 2;
      const lastX = OFF.map(() => -1e9);
      E.filter((e) => e.field === f).forEach((e) => {
        const x = X(e.year);
        let r = OFF.findIndex((_, k) => x - lastX[k] >= 26);
        if (r < 0) r = 0;
        lastX[r] = x; pos[e.id] = [x, yc + OFF[r], OFF[r]];
      });
    });
    const edges = [];
    (window.LINKS || []).forEach((L) => {
      if (!pos[L.a] || !pos[L.b]) return;
      const [x1, y1] = pos[L.a], [x2, y2] = pos[L.b];
      const d = Math.hypot(x2 - x1, y2 - y1);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.min(80, 16 + 0.12 * d);
      const lit = isRevealed(L.a) && isRevealed(L.b);
      const p = s('path', { d: `M${x1},${y1} Q${mx},${my} ${x2},${y2}`, class: 'edge' + (lit ? ' lit' : '') });
      const lx = (x1 + 2 * mx + x2) / 4, ly = (y1 + 2 * my + y2) / 4 - 6;
      const t = s('text', { x: lx, y: ly, class: 'edge-label', 'text-anchor': 'middle' }); t.textContent = lit ? L.label : '还原两端后显示';
      svg.append(p); edges.push({ L, p, t });
    });
    edges.forEach((E2) => svg.append(E2.t));
    const wrap = el('div', { class: 'lineage' });
    const info = el('div', { class: 'lin-info', 'aria-live': 'polite', text: '把鼠标移到（或用 Tab 键移到）一个点上，看它是什么、和谁相连。' });
    E.forEach((e) => {
      const [x, y, rowOff] = pos[e.id];
      const rv = isRevealed(e.id), st = status(e.id);
      const a = s('a', { href: '#' + e.id, class: 'node f-' + e.field + (rv ? ' solved' : '') + (st.key === 'mid' ? ' mid' : ''), 'aria-label': `${e.year}，${shortName(e)}，${e.teaser}，${st.t}` });
      a.append(s('circle', { cx: x, cy: y, r: 9 }));
      const yr = s('text', { x, y: rowOff < 0 ? y - 14 : y + 22, class: 'yr', 'text-anchor': 'middle' }); yr.textContent = String(e.year).slice(2); a.append(yr);
      const on = () => {
        wrap.classList.add('hl'); a.classList.add('cur');
        edges.forEach((E2) => { const hit = E2.L.a === e.id || E2.L.b === e.id; E2.p.classList.toggle('on', hit); E2.t.classList.toggle('on', hit); });
        info.innerHTML = '';
        info.append(el('b', { text: `${e.year} · ${shortName(e)}` }), ' ', el('span', { class: 'chip f-' + e.field, text: FIELD[e.field] }), ' ',
          el('span', { text: rv ? strip(e.title) : e.teaser }), ' ', el('span', { class: 'st ' + st.cls, text: '· ' + st.t }));
      };
      const off = () => { wrap.classList.remove('hl'); a.classList.remove('cur'); };
      a.addEventListener('mouseenter', on); a.addEventListener('focus', on);
      a.addEventListener('mouseleave', off); a.addEventListener('blur', off);
      svg.append(a);
    });
    const litN = (window.LINKS || []).filter((L) => isRevealed(L.a) && isRevealed(L.b)).length;
    wrap.append(
      el('div', { class: 'cap' }, [el('span', { text: `思想谱系：横轴是年份，四条泳道是四个学科；连线表示一项突破直接用到了另一项（已点亮 ${litN}/${(window.LINKS || []).length}）` }), el('span', { class: 'mono', text: '实心 = 已还原' })]),
      el('div', { class: 'lineage-scroll' }, [svg]),
      info,
    );
    return wrap;
  }

  /* ---------- home ---------- */
  function home() {
    document.title = '诺奖思想实验室';
    const total = E.reduce((a, e) => a + nStages(e.id), 0);
    const solved = E.reduce((a, e) => a + Math.min(solvedCount(e.id), nStages(e.id)), 0);
    const doneN = E.filter((e) => isDone(e.id)).length;
    const count = (f) => E.filter((e) => e.field === f).length;
    const hero = el('section', { class: 'hero' }, [
      el('div', {}, [
        el('div', { class: 'kicker', text: 'Nobel · 物理 / 化学 / 生理学或医学 / 经济学' }),
        el('h1', { html: '<span class="nw">先看现象，</span><br><span class="nw">再把诺奖<em>还原</em>出来</span>' }),
        el('p', { text: `${E.length} 项诺奖，每一项都从当年真实的现象或难题开始。你手里只有那个时代的仪器和数据：去测量、拟合、猜测、拼装，一关一关把关键发现重新做出来。答案和完整的推导在你完成之后才揭晓，卡住了可以看提示。` }),
      ]),
      el('div', { class: 'stats' }, [
        el('div', {}, [el('b', { text: String(E.length) }), el('span', { text: [['phy', '物理'], ['chem', '化学'], ['med', '医学'], ['econ', '经济']].filter(([f]) => count(f)).map(([f, t]) => `${t} ${count(f)}`).join(' · ') + ' · 陆续扩充到 50 项' })]),
        el('div', {}, [el('b', { text: `${solved}/${total}` }), el('span', { text: `你已通过的关卡 · 已完成 ${doneN} 项` })]),
        el('div', {}, [el('b', { text: `${E[0].year}–${E[E.length - 1].year}` }), el('span', { text: '跨越的年份' })]),
      ]),
      lineage(),
    ]);

    const fopts = [['all', '全部'], ['phy', '物理学'], ['chem', '化学'], ['med', '生理学或医学'], ['econ', '经济学']].filter(([v]) => v === 'all' || LANES.includes(v));
    const sopts = [['all', '任意状态'], ['new', '未开始'], ['mid', '进行中'], ['done', '已完成']];
    const fbtns = fopts.map(([v, t]) => el('button', { type: 'button', 'aria-pressed': String(filter === v), text: t, onclick: () => { filter = v; apply(); } }));
    const sbtns = sopts.map(([v, t]) => el('button', { type: 'button', 'aria-pressed': String(sfilter === v), text: t, onclick: () => { sfilter = v; apply(); } }));
    const cards = E.map((e) => {
      const st = status(e.id), rv = isRevealed(e.id);
      const n = nStages(e.id), k = Math.min(solvedCount(e.id), n);
      const c = el('a', { class: 'card f-' + e.field + (rv ? ' is-rev' : ''), href: '#' + e.id }, [
        el('div', { class: 'row' }, [el('span', { class: 'yr', text: e.year }), el('span', { class: 'chip', text: FIELD[e.field] })]),
        el('h3', { text: e.teaser }),
        el('div', { class: 'who', text: e.who.map((w) => w.zh).join('、') }),
        el('div', { class: 'prog', 'aria-hidden': 'true' }, Array.from({ length: n }, (_, i) => el('i', { class: i < k ? 'on' : '' }))),
        el('div', { class: 'st ' + st.cls, text: st.t }),
        rv ? el('p', { class: 'one', html: `<b>${e.title}</b>　$${e.formula}$` }) : null,
      ]);
      c.dataset.field = e.field; c.dataset.st = st.key;
      return c;
    });
    const empty = el('p', { class: 'ledger-empty', hidden: true, text: '没有符合条件的挑战。' });
    function apply() {
      try { localStorage.setItem('nobel.filter', filter); localStorage.setItem('nobel.sfilter', sfilter); } catch (e) {}
      fbtns.forEach((b, i) => b.setAttribute('aria-pressed', String(fopts[i][0] === filter)));
      sbtns.forEach((b, i) => b.setAttribute('aria-pressed', String(sopts[i][0] === sfilter)));
      let shown = 0;
      cards.forEach((c) => { const ok = (filter === 'all' || c.dataset.field === filter) && (sfilter === 'all' || c.dataset.st === sfilter); c.hidden = !ok; if (ok) shown++; });
      empty.hidden = shown > 0;
    }
    apply();

    const new26 = el('section', { class: 'new26' }, [
      el('h2', { html: '2026 年新得主<small>截至 10 月 11 日</small>' }),
      el('ul', {}, NEW2026.map((n) => el('li', { class: 'f-' + n.field }, [
        el('span', { class: 'chip', text: FIELD[n.field] }),
        el('b', { text: n.who }),
        n.what ? el('span', { text: n.what }) : null,
        n.link && byId[n.link] ? el('a', { href: '#' + n.link, text: `相关挑战：${byId[n.link].year} · ${byId[n.link].teaser} →` }) : null,
      ]))),
    ]);
    const humLink = el('section', { class: 'new26 humlink' }, [
      el('h2', { html: '文学与和平<small>另一个页面</small>' }),
      el('div', { class: 'hl-body' }, [
        el('p', { text: '文学奖和和平奖没有标准答案，不适合做成“还原”。它们在单独的页面里，用互动体验来做：马尔克斯的马孔多五幕，以及曼德拉与德克勒克的谈判桌。' }),
        el('a', { class: 'btn', href: HUM_URL, target: HUM_EXT ? '_blank' : null, rel: HUM_EXT ? 'noopener' : null, text: HUM_EXT ? '打开“文学与和平” ↗' : '打开“文学与和平” →' }),
      ]),
    ]);
    const reset = el('button', { type: 'button', class: 'linkbtn', text: '清除我的进度' });
    let armed = false;
    reset.addEventListener('click', () => {
      if (!armed) { armed = true; reset.textContent = '再点一次确认清除'; setTimeout(() => { armed = false; reset.textContent = '清除我的进度'; }, 4000); return; }
      P = {}; save(); route();
    });

    app.replaceChildren(
      hero,
      el('div', { class: 'bar' }, [
        el('h2', { text: `${E.length} 个还原挑战` }),
        el('div', { class: 'filters-wrap' }, [
          el('div', { class: 'filters', role: 'group', 'aria-label': '按学科筛选' }, fbtns),
          el('div', { class: 'filters', role: 'group', 'aria-label': '按进度筛选' }, sbtns),
        ]),
      ]),
      el('div', { class: 'ledger' }, cards), empty, new26, humLink,
      el('p', { class: 'foot' }, ['内容由 Claude 整理。史实、颁奖词和公式已逐条核对；实验数据带有模拟噪声，标注为“示意”或“简化”的部分是为了让问题可解而做的简化。进度只保存在你这台设备的浏览器里。 ', reset]),
    );
    typeset(app);
  }

  /* ---------- detail ---------- */
  function sec(k, zh, html, cls = '') {
    return el('section', { class: 'sec ' + cls }, [el('h2', {}, [k, el('span', { text: zh })]), el('div', { class: 'mbody', html })]);
  }
  function story(e) {
    const links = (window.LINKS || []).filter((L) => (L.a === e.id || L.b === e.id) && byId[L.a] && byId[L.b]).map((L) => {
      const o = byId[L.a === e.id ? L.b : L.a];
      const lit = isRevealed(o.id);
      return el('a', { href: '#' + o.id }, [
        el('span', { class: 'dir', text: L.a === e.id ? '通向' : '来自' }),
        el('span', {}, [el('b', { html: `${o.year} ${lit ? o.title : o.teaser}` }), ' ', el('small', { text: lit ? `· ${L.label}` : '· 还原它之后显示两者的关系' })]),
      ]);
    });
    const partA = el('div', { class: 'part-a' }, [sec('01', '历史背景', e.puzzle), sec('02', '核心观察', e.observation)]);
    const partB = el('div', { class: 'part-b' }, [
      sec('03', '核心思想', e.idea),
      sec('04', '推导与公式', e.math, 'math'),
      sec('05', '后续影响', e.legacy),
      el('section', { class: 'sec myths' }, [el('h2', {}, ['06', el('span', { text: '常见误解' })]), el('ul', {}, e.myths.map((m) => el('li', { html: m })))]),
      el('section', { class: 'sec papers' }, [el('h2', {}, ['07', el('span', { text: '原始文献' })]), el('ul', {}, e.papers.map((p) => el('li', { html: p })))]),
      links.length ? el('section', { class: 'sec' }, [el('h2', {}, ['08', el('span', { text: '思想链' })]), el('div', { class: 'links-list' }, links)]) : null,
    ]);
    const lab = window.LABS && LABS[e.id];
    const labRoot = el('div', { class: 'lab' });
    const bench = el('aside', { class: 'labcol', 'aria-label': '答案演示' }, [
      el('div', { class: 'bench' }, [
        el('div', { class: 'bench-head' }, [el('div', { class: 'k', text: 'DEMO · 答案演示' }), el('h2', { text: lab ? lab.title : '演示准备中' }), el('p', { html: e.labNote || '' })]),
        labRoot,
      ]),
    ]);
    const wrap = el('div', {}, [
      el('div', { class: 'reveal-head' }, [
        el('h2', { html: e.title }),
        el('p', { class: 'cite' }, [el('b', { text: '颁奖词　' }), e.citation]),
        el('p', { class: 'lead', html: e.one }),
      ]),
      el('div', { class: 'dgrid' }, [partA, bench, partB]),
    ]);
    return { node: wrap, mountLab() { if (lab) { try { handles.push(lab.mount(labRoot, { color: css, reduced, h: H })); } catch (err) { console.error(err); labRoot.replaceChildren(el('p', { class: 'lab-missing', text: '演示加载失败，请刷新页面重试。' })); } } } };
  }

  function detail(e) {
    const rv0 = isRevealed(e.id);
    document.title = `${e.year} · ${rv0 ? strip(e.title) : e.teaser} · 诺奖思想实验室`;
    const i = E.indexOf(e), prev = E[i - 1], next = E[i + 1];
    const crumbs = el('div', { class: 'crumbs' }, [
      el('a', { href: '#', text: '← 全部挑战' }),
      el('div', { class: 'pn' }, [
        prev ? el('a', { href: '#' + prev.id, text: `← ${prev.year} ${shortName(prev).split(' · ')[0]}` }) : null,
        next ? el('a', { href: '#' + next.id, text: `${next.year} ${shortName(next).split(' · ')[0]} →` }) : null,
      ]),
    ]);
    const head = el('header', { class: 'dhead f-' + e.field }, [
      el('div', { class: 'bigyr', text: e.year }),
      el('div', { class: 'meta' }, [el('span', { class: 'chip', text: PRIZE[e.field] }), e.awarded ? el('span', { class: 'awarded', text: e.awarded }) : null]),
      el('h1', { text: e.teaser }),
      el('div', { class: 'laureates' }, e.who.map((w) => el('div', {}, [el('b', { text: w.zh }), el('span', { text: w.en }), w.share ? el('i', { text: w.share }) : null]))),
    ]);
    const scen = el('section', { class: 'scenario' }, [el('div', { class: 'k', text: 'SCENE · 情境' }), el('div', { class: 'scen-body', html: e.scenario })]);

    const ch = window.CHALLENGES && CHALLENGES[e.id];
    const croot = el('div', { class: 'chroot' });
    const chBench = el('section', { class: 'bench chbench', 'aria-label': '还原挑战' }, [
      el('div', { class: 'bench-head' }, [el('div', { class: 'k', text: 'CHALLENGE · 还原挑战' }), el('h2', { text: ch ? ch.title : '挑战准备中' })]),
      croot,
    ]);

    const revHost = el('div', { class: 'reveal-body' });
    const revBtn = el('button', { type: 'button', class: 'btn', text: '直接揭晓（会剧透）' });
    const revNote = el('p', { class: 'reveal-note' });
    const revBlock = el('section', { class: 'reveal', id: 'story' }, [
      el('div', { class: 'reveal-bar' }, [el('div', { class: 'k', text: 'STORY · 揭晓' }), el('h2', { text: '他们是怎么想到的' }), revNote, revBtn]),
      revHost,
    ]);
    let opened = false;
    function openStory(scroll) {
      if (!opened) {
        opened = true;
        const st = story(e);
        revHost.append(st.node); st.mountLab(); typeset(revHost);
        revBtn.hidden = true;
        const h1 = head.querySelector('h1'); h1.innerHTML = ''; h1.append(el('span', { html: e.title }), el('small', { text: e.teaser }));
        typeset(head);
        document.title = `${e.year} · ${strip(e.title)} · 诺奖思想实验室`;
      }
      revNote.textContent = isDone(e.id) ? '你已完成全部关卡。' : '你选择了直接揭晓。挑战仍然可以继续做。';
      if (scroll) revBlock.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }
    revNote.textContent = `完成全部 ${nStages(e.id)} 关后自动展开。`;
    revBtn.addEventListener('click', () => { rec(e.id).r = true; save(); openStory(true); });

    app.replaceChildren(crumbs, head, scen, chBench, revBlock);

    if (ch) {
      const ctx = {
        color: css, reduced, h: H, typeset,
        progress: {
          get: () => [...rec(e.id).s],
          mark(idx, gave) { const r = rec(e.id); if (!r.s.includes(idx)) r.s.push(idx); if (gave && !r.g.includes(idx)) r.g.push(idx); save(); },
        },
        onComplete(viaButton) { openStory(!!viaButton); },
      };
      try { handles.push(ch.mount(croot, ctx)); }
      catch (err) { console.error(err); croot.replaceChildren(el('p', { class: 'lab-missing', text: '挑战加载失败，请刷新页面重试。' })); }
    }
    if (rv0) openStory(false);
    typeset(app);
  }

  /* ---------- router ---------- */
  function route() {
    handles.forEach((h) => { try { h && h.destroy && h.destroy(); } catch (e) {} });
    handles = [];
    const id = location.hash.replace(/^#/, '');
    const e = byId[id];
    if (e) detail(e); else home();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();
})();
