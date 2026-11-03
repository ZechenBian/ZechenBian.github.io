// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 看不懂时的两层帮助：
//   1. 术语卡（离线）：页面上每个带 data-g 的标题、滑杆、卡片旁有一个 ? 按钮，点开右侧抽屉，内容来自 gloss.js，公式用 KaTeX 渲染。
//   2. 问 AI（对话框）：把当前展区、参数、卡片上的数和你正在看的术语一起发给 AI。Claude Artifact 里用页面的 sample 能力；
//      GitHub Pages 上由使用者自己填一把 API 密钥（和策略实验室共用同一处设置，只存在本机浏览器）。
(function () {
  'use strict';
  const G = window.GENESIS, $ = G.$, store = G.store;
  // ---------- KaTeX ----------
  const DELIMS = [{ left: '$$', right: '$$', display: true }, { left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }, { left: '$', right: '$', display: false }];
  function tex(el) { if (!el || typeof renderMathInElement !== 'function') return; try { renderMathInElement(el, { delimiters: DELIMS, throwOnError: false, ignoredTags: ['script', 'style', 'textarea', 'pre', 'code', 'canvas'], ignoredClasses: ['notex'] }); } catch (e) { /* 公式渲染失败就留原文 */ } }
  G.tex = tex;
  // 极简 Markdown：转义 → 粗体、行内代码、列表、段落（公式交给 KaTeX，先用占位符护住）
  function md(s) {
    const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const maths = []; s = String(s || '').replace(/\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^\n$]+?\$/g, (m) => { maths.push(m); return '\u0000' + (maths.length - 1) + '\u0000'; });
    let h = esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    h = h.split(/\n{2,}/).map((p) => { const lines = p.split('\n'); if (lines.every((l) => /^\s*[-•]\s+/.test(l))) return '<ul>' + lines.map((l) => '<li>' + l.replace(/^\s*[-•]\s+/, '') + '</li>').join('') + '</ul>'; if (lines.every((l) => /^\s*\d+[.、]\s+/.test(l))) return '<ol>' + lines.map((l) => '<li>' + l.replace(/^\s*\d+[.、]\s+/, '') + '</li>').join('') + '</ol>'; return '<p>' + lines.join('<br>') + '</p>'; }).join('');
    return h.replace(/\u0000(\d+)\u0000/g, (m, i) => maths[+i].replace(/&/g, '&amp;').replace(/</g, '&lt;'));
  }
  // ---------- 术语抽屉 ----------
  const drawer = document.createElement('aside'); drawer.id = 'gloss'; drawer.className = 'drawer'; drawer.hidden = true;
  drawer.innerHTML = '<div class="drawer-head"><b id="gloss-title"></b><button class="btn small ghost" id="gloss-close">关闭</button></div><div class="drawer-body"><p class="gloss-s" id="gloss-s"></p><div id="gloss-d"></div><p class="note" id="gloss-try"></p><div class="bar"><button class="btn small primary" id="gloss-ask">问 AI 追问这个</button></div></div>';
  document.body.appendChild(drawer);
  let curG = null;
  function openGloss(id) {
    const g = GLOSS[id]; if (!g) return; curG = id;
    $('gloss-title').innerHTML = g.t; $('gloss-s').innerHTML = g.s; $('gloss-d').innerHTML = md(g.d || ''); $('gloss-try').innerHTML = g.try ? '试一试：' + g.try : '';
    tex(drawer); drawer.hidden = false; chat.hide();
  }
  $('gloss-close').addEventListener('click', () => { drawer.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) drawer.hidden = true; }); // Esc 关抽屉
  document.addEventListener('pointerdown', (e) => { if (drawer.hidden || drawer.contains(e.target) || e.target.closest('.qb')) return; drawer.hidden = true; }, true); // 点抽屉外面也关
  $('gloss-ask').addEventListener('click', () => { const g = GLOSS[curG]; drawer.hidden = true; chat.open(); chat.ask('请解释"' + g.t.replace(/\$/g, '') + '"：它在这个页面上现在的数值意味着什么？我该怎么理解它？'); });
  // ? 按钮：给每个带 data-g 的元素补一个
  function decorate(root) {
    for (const el of (root || document).querySelectorAll('[data-g]')) {
      if (el.querySelector(':scope > .qb') || !GLOSS[el.dataset.g]) continue;
      const b = document.createElement('button'); b.className = 'qb'; b.type = 'button'; b.textContent = '?'; b.title = '这是什么？'; b.setAttribute('aria-label', '解释 ' + el.dataset.g);
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openGloss(el.dataset.g); });
      el.appendChild(b);
    }
  }
  G.decorate = decorate; G.openGloss = openGloss;
  // ---------- 问 AI ----------
  const chat = (function () {
    const box = document.createElement('aside'); box.id = 'chat'; box.className = 'drawer'; box.hidden = true;
    box.innerHTML = '<div class="drawer-head"><b>问 AI <span class="note" id="chat-who" style="font-weight:400"></span></b><span><button class="btn small ghost" id="chat-setup" hidden>接入 AI…</button> <button class="btn small ghost" id="chat-close">关闭</button></span></div><div class="drawer-body"><div id="chat-log" class="chat-log"></div><div id="chat-setup-panel" hidden></div><form id="chat-form" class="chat-form"><textarea id="chat-in" rows="2" placeholder="看不懂哪里？直接问。AI 会连同你当前拨的参数和页面上的数一起看。"></textarea><div class="bar"><button class="btn small primary" type="submit" id="chat-send">发送</button><button class="btn small ghost" type="button" id="chat-clear">清空</button><span class="note" id="chat-hint"></span></div></form></div>';
    document.body.appendChild(box);
    const fab = document.createElement('button'); fab.id = 'chat-fab'; fab.className = 'btn primary'; fab.textContent = '问 AI'; fab.title = '看不懂就问'; document.body.appendChild(fab);
    const log = $('chat-log'), input = $('chat-in');
    let history = [], sampler = null, mode = 'none', busy = false;
    const SYS = '你是"创世实验室"（一个用真实方程模拟宇宙的网页）的讲解员。读者懂微积分和基础物理，但不熟悉宇宙学。用中文回答，先说它是什么、为什么重要，再给公式；公式用 LaTeX（行内 $...$，整行 $$...$$）。回答尽量短（200 字以内，追问时再展开），不要寒暄。页面状态在下面，引用其中的具体数字来解释。如果读者的问题超出页面内容，照常回答但说明页面上看不到。';
    function hide() { box.hidden = true; }
    function open() { box.hidden = false; drawer.hidden = true; input.focus(); }
    function snapshot() {
      const hall = G.current, parts = ['当前展区：' + ({ overview: '总览', forge: '创世台', early: '最初三分钟', godel: '哥德尔旋转宇宙', inverse: '反推台', mix: 'Mixmaster（Bianchi IX）', ltb: '空洞宇宙（LTB）', bubble: '泡泡宇宙（永恒暴胀）', topo: '多连通宇宙', g21: '2+1 维引力' }[hall] || hall)];
      const S = G.forge.S; parts.push(`创世参数：H0=${S.H0} km/s/Mpc, Ωm=${S.Om}, Ωr=${S.Or}, ΩΛ=${S.OL}, w=${S.w}` + (window.GENESIS_QSTATE ? '；量子旋钮：' + JSON.stringify(window.GENESIS_QSTATE()) : ''));
      const txt = (id) => { const el = $(id); return el && !el.hidden && el.offsetParent !== null ? el.innerText.replace(/\s+/g, ' ').slice(0, 1500) : ''; };
      if (hall === 'forge') { parts.push('命运卡：' + txt('fate-cards')); if ($('q-cards')) parts.push('量子卡：' + txt('q-cards')); parts.push('诊断：' + txt('diag')); }
      if (hall === 'early') { parts.push('时刻：' + txt('ev-t') + ' ' + txt('ev-epoch') + '；读数：' + txt('e-cards') + '；叙述：' + txt('ev-story')); }
      if (hall === 'godel') parts.push('哥德尔参数卡：' + txt('godel-cards') + '；发光读数：' + txt('light-readout') + '；圈读数：' + txt('ring-readout'));
      if (hall === 'inverse') parts.push('猜测：' + txt('guess-cards') + '；拟合：' + txt('v-chi2') + ' ' + txt('v-quality') + '；提示：' + txt('v-hints') + '；最老恒星：' + txt('v-oldest') + '；假设检验：' + txt('nolambda-out'));
      if (hall === 'godel' && $('as-read')) parts.push('全天图读数：' + txt('as-read'));
      if (hall === 'mix') parts.push('Mixmaster 读数：' + txt('mix-hud') + '；时代表：' + txt('mix-epochs') + '；参数卡：' + txt('mix-cards'));
      if (hall === 'ltb') parts.push('拟合卡：' + txt('ltb-fit') + '；戳穿它：' + txt('ltb-tests') + '；偶极：' + txt('ltb-dipole') + '；参数卡：' + txt('ltb-cards'));
      if (hall === 'bubble') parts.push('泡沫读数：' + txt('bub-hud') + '；泡内：' + txt('bub-inside') + '；景观：' + txt('bub-landcards'));
      if (hall === 'topo') parts.push('鬼像：' + txt('topo-ghost') + '；匹配圆：' + txt('topo-sky-cards') + '；参数卡：' + txt('topo-cards'));
      if (hall === 'g21') parts.push('锥：' + txt('g21-cone-cards') + '；BTZ：' + txt('g21-fate') + ' ' + txt('g21-btz-cards'));
      if (curG && GLOSS[curG]) parts.push('读者刚打开的术语卡：' + GLOSS[curG].t + '——' + GLOSS[curG].s);
      return parts.join('\n');
    }
    function render() {
      log.innerHTML = history.map((m) => `<div class="msg ${m.role}">${m.role === 'user' ? md(m.content) : (m.html || md(m.content))}</div>`).join('') + (busy ? '<div class="msg assistant note">思考中…</div>' : '');
      tex(log); log.scrollTop = log.scrollHeight;
    }
    async function ensure() {
      if (sampler) return sampler;
      if (window.claude && typeof window.claude.use === 'function') { try { const s = await window.claude.use('sample'); if (s) { sampler = s; mode = 'artifact'; } } catch (e) { /* 不可用 */ } }
      if (!sampler && typeof QLAI !== 'undefined' && QLAI.ready()) { sampler = QLAI.sample(); mode = 'key'; }
      updateWho(); return sampler;
    }
    function updateWho() {
      const who = $('chat-who'), setup = $('chat-setup');
      if (mode === 'artifact') { who.textContent = '· 由这个页面的 Claude 回答'; setup.hidden = true; }
      else if (mode === 'key') { const l = typeof QLAI !== 'undefined' ? QLAI.label() : null; who.textContent = l ? '· ' + l.short + ' ' + l.model : ''; setup.hidden = false; }
      else { who.textContent = ''; setup.hidden = !(typeof QLAI !== 'undefined'); }
    }
    async function ask(q) {
      q = (q || input.value).trim(); if (!q || busy) return; input.value = '';
      history.push({ role: 'user', content: q }); busy = true; render();
      const s = await ensure();
      if (!s) { busy = false; history.push({ role: 'assistant', content: typeof QLAI !== 'undefined' ? '还没有接入 AI。点上面的"接入 AI…"，选一家服务商、填上你自己的密钥（只存在你这台浏览器里）。' : '这个环境里没有可用的 AI。' }); render(); if (typeof QLAI !== 'undefined') showSetup(); return; }
      // 无记忆：每次把说明、页面状态和最近几轮一起发
      const ctx = SYS + '\n\n【页面状态】\n' + snapshot();
      const recent = history.slice(-9); const msgs = [{ role: 'user', content: ctx + '\n\n【读者的第一个问题】\n' + recent[0].content }];
      for (let i = 1; i < recent.length; i++) msgs.push({ role: recent[i].role, content: recent[i].content });
      if (msgs[msgs.length - 1].role !== 'user') msgs.push({ role: 'user', content: q });
      const idx = history.push({ role: 'assistant', content: '' }) - 1;
      try {
        const r = await s(msgs, { modelTier: 'default', cache: false, onText: (t) => { history[idx].content = typeof t === 'string' ? t : (t && t.text) || ''; render(); } });
        history[idx].content = (r && r.text) || history[idx].content || '（没有回答）'; if (r && r.truncated) history[idx].content += '\n\n（回答被截断了）';
      } catch (e) {
        const ex = typeof QLAI !== 'undefined' && mode === 'key' ? QLAI.explain(e) : null;
        history[idx].content = '出错了：' + (ex ? ex.text : (e && (e.message || e.code)) || '未知错误') + (e && e.code === 'not_granted' ? '（你没有允许这个页面使用 AI）' : '');
        if (e && (e.code === 'not_granted' || e.code === 'unavailable')) sampler = null;
      }
      busy = false; render();
    }
    // 密钥设置（只在 GitHub Pages 版有 QLAI 时）
    function showSetup() {
      if (typeof QLAI === 'undefined') return; const p = $('chat-setup-panel'); p.hidden = false; const cfg = QLAI.cfg(), pid = cfg.p || 'claude', u = (cfg.by && cfg.by[pid]) || {};
      p.innerHTML = `<div class="card tight" style="margin:8px 0"><h3 style="font-size:14px">接入 AI <span class="note" style="font-weight:400">密钥只存在你这台浏览器里，请求从浏览器直接发给服务商；本站不经手</span></h3>
        <div class="ctl"><label><span>服务商</span></label><select id="ai-p" class="num" style="width:100%">${QLAI.PRE.map((x) => `<option value="${x.id}"${x.id === pid ? ' selected' : ''}>${x.name}</option>`).join('')}</select></div>
        <div class="ctl"><label><span>密钥</span></label><input id="ai-key" class="num" style="width:100%" type="password" value="${(u.key || '').replace(/"/g, '&quot;')}" placeholder="sk-…"><div class="sub" id="ai-hint"></div></div>
        <div class="ctl"><label><span>模型（可留空用默认）</span></label><input id="ai-model" class="num" style="width:100%" value="${(u.model || '').replace(/"/g, '&quot;')}" placeholder="默认"></div>
        <div class="ctl" id="ai-base-row" hidden><label><span>接口地址</span></label><input id="ai-base" class="num" style="width:100%" value="${(u.base || '').replace(/"/g, '&quot;')}" placeholder="https://…/v1"></div>
        <div class="bar"><button class="btn small primary" type="button" id="ai-save">保存并测试</button><button class="btn small ghost" type="button" id="ai-cancel">取消</button><span class="note" id="ai-status"></span></div></div>`;
      const hint = () => { const P = QLAI.preset($('ai-p').value); $('ai-hint').textContent = ((P && P.hint) || '').replace(/接的是 Claude 时，机器学习实验室[^。]*。/, ''); $('ai-base-row').hidden = !(P && P.id === 'custom'); }; // 去掉只和别的实验室有关的那句
      $('ai-p').addEventListener('change', hint); hint();
      $('ai-cancel').addEventListener('click', () => { p.hidden = true; });
      $('ai-save').addEventListener('click', async () => {
        const c = QLAI.cfg(); const id = $('ai-p').value; c.p = id; c.by = c.by || {}; c.by[id] = Object.assign({}, c.by[id] || {}, { key: $('ai-key').value.trim(), model: $('ai-model').value.trim(), base: $('ai-base').value.trim() });
        $('ai-status').textContent = '测试中…';
        try { const r = await QLAI.test(c); QLAI.save(c); sampler = null; mode = 'none'; $('ai-status').textContent = '连上了（' + r.ms + ' ms）'; await ensure(); setTimeout(() => { p.hidden = true; }, 800); }
        catch (e) { const ex = QLAI.explain(e); $('ai-status').textContent = ex.text + (ex.detail ? '（' + ex.detail + '）' : ''); }
      });
    }
    $('chat-form').addEventListener('submit', (e) => { e.preventDefault(); ask(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(); } });
    $('chat-clear').addEventListener('click', () => { history = []; render(); });
    $('chat-close').addEventListener('click', hide); $('chat-setup').addEventListener('click', showSetup);
    fab.addEventListener('click', () => { if (box.hidden) { open(); ensure(); } else hide(); });
    if (typeof QLAI !== 'undefined') QLAI.onChange(() => { sampler = null; mode = 'none'; ensure(); });
    $('chat-hint').textContent = window.GENESIS_ARTIFACT ? '第一次提问时页面会请你允许它使用 AI' : (typeof QLAI !== 'undefined' ? '需要你自己的 API 密钥（只存在本机浏览器；本站的几个实验室共用这一处设置）' : '');
    ensure();
    return { open, hide, ask };
  })();
  G.chat = chat;
  // 首次渲染：静态文本里的公式 + ? 按钮
  decorate(); tex(document.body);
})();
