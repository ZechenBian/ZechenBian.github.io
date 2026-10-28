/* ===================== 网页版 · “AI 推演接口”的界面（src/web/ui，只在网页版构建里；与 src/ui 同一作用域） =====================
 * 设置面板里的一节：一键接入（OpenRouter 授权，不用复制密钥）、选服务商、填密钥与模型、获取模型列表、测试连接、转发代理（附搭建说明与代理代码）；
 * 开局画面上显示接入状态。保存后重新连接推演层（LLM.init），并把界面文字里的“Claude”换成所选服务商的名字（没有接入时换成“AI”；
 * 联网对局里用房主共享的 AI 时换成房主所用服务商的名字，见 04y_hostai.js）。服务商的调用见 src/web/02_ai.js（window.TXAI）。
 */
const aiWeb = () => !!(window.TXAI && window.__txWeb); // 只在普通网站上（claude.ai 里用真正的 Claude）
const AI_DOC = 'https://github.com/ZechenBian/zechenbian.github.io/blob/main/tianxia/README.md';
let AID = null, aiKeep = false, aiFlash = null, aiPicked = null; // 设置面板里的草稿；重画时保留草稿；重画后显示的消息；获取到的模型列表

/* ---------- 界面文字：把“Claude”换成所选服务商的名字 ---------- */
const AI_ORIG = {}; // 键 → 换名之前的 [中, 英]
const AI_KEEP = new Set(['mp.ag.ext', 'mp.ag.ext_x', 'mp.ext_x']); // 说的是另一个 Claude 会话，不换
function aiBrand() {
  if (!window.TXAI || !I18N.dict) return;
  const D = I18N.dict, NO = window.TX_WEB_NOAI || {}, on = LLM.available();
  if (!aiBrand.snap) {
    for (const k in D) { const v = D[k]; if (!k.startsWith('ai.') && Array.isArray(v) && v.some(s => typeof s === 'string' && s.includes('Claude'))) AI_ORIG[k] = v.slice(); } // ai.* 里的 Claude 指的就是 Anthropic 这家服务商
    for (const k in NO) if (!(k in AI_ORIG)) AI_ORIG[k] = D[k] ? D[k].slice() : null;
    aiBrand.snap = true;
  }
  const lab = (typeof haLabel === 'function' && haLabel()) || window.TXAI.label() || { zh: 'AI', en: 'AI' }, han = c => !!c && /[\u{3000}-\u{303f}\u{3400}-\u{9fff}\u{ff00}-\u{ffef}]/u.test(c);
  // 中文简称（豆包、通义千问……）紧挨着汉字时去掉原来夹着“Claude”的空格：“由 Claude 实时推演”→“由豆包实时推演”，“● Claude 推演”→“● 豆包推演”
  const zh = s => (han(lab.zh) ? s.replace(/( ?)Claude( ?)/g, (m, a, b, at, all) => (a && !han(all[at - 1]) ? ' ' : '') + lab.zh + (b && !han(all[at + m.length]) ? ' ' : '')) : s.replace(/Claude/g, lab.zh));
  const sub = (s, i) => (typeof s !== 'string' || /claude\.ai/i.test(s) ? s : i === 0 ? zh(s) : s.replace(/Claude/g, lab.en));
  for (const k in AI_ORIG) {
    const v = !on && NO[k] ? NO[k] : AI_ORIG[k]; // 没有接入 AI 时用网页版的说法（如一句话命令只识别政策与设定）
    if (v) D[k] = AI_KEEP.has(k) ? v.slice() : v.map(sub);
  }
}
function aiRefresh() { aiBrand(); try { applyStatic(); } catch (e) { } }
if (aiWeb()) {
  aiBrand();
  LLM.onState(() => aiRefresh()); // 先于 05_boot.js 的监听：重画顶栏之前文字已经换好
  // 服务商的原话（e.detail）不放进 errText：errText 会进战报与聊天记录，联机时同步给其他玩家；详情在设置里“测试连接”时显示
}

/* ---------- 设置面板里的一节 ---------- */
const aiP = id => window.TXAI.preset(id);
const aiNm = (P, i) => P[i][EN() ? 1 : 0];
function aiSettingsHTML() {
  if (!aiWeb()) return '';
  if (!aiKeep || !AID) { AID = window.TXAI.cfg; aiPicked = null; }
  aiKeep = false;
  return `<div class="opts aiopts"><div class="opt aibox" id="aiBox">${aiBoxHTML()}</div></div>`;
}
function aiNote(P) {
  const a = [T(P.cors === 1 ? 'ai.cors_ok' : P.cors === 0 ? 'ai.cors_no' : 'ai.cors_unk', { x: { raw: esc(aiNm(P, 'b')) } })];
  if (I18N.has('ai.note.' + P.id)) a.push(T('ai.note.' + P.id, { o: { raw: esc(location.origin) } }));
  return a.join(' ');
}
function aiBoxHTML() {
  const d = AID, P = d.p ? aiP(d.p) : null, u = (P && d.by[d.p]) || {};
  const opts = window.TXAI.PRE.map(p => `<option value="${p.id}" ${p.id === d.p ? 'selected' : ''}>${esc(aiNm(p, 'n'))}</option>`).join('');
  const ou = d.by.openrouter || {}, oauthed = d.p === 'openrouter' && ou.oauth && ou.key;
  let h = `<h4>${T('ai.h')}</h4>${typeof haSettingsNote === 'function' ? haSettingsNote() : ''}<p class="muted aix">${T('ai.x')}</p>
    <div class="aioa"><b>${T('ai.oa.h')}</b><p class="muted aix">${T('ai.oa.x')}</p><div class="aibtns"><button class="btn-primary" id="aiOAuth" type="button">${T(oauthed ? 'ai.oa.again' : 'ai.oa.go')}</button>${oauthed ? `<span class="good aioa-ok">${T('ai.oa.done', { m: { raw: esc(ou.model || aiP('openrouter').model) } })}</span>` : ''}</div></div>
    <p class="muted aix aior">${T('ai.oa.or')}</p>
    <label class="aif"><span>${T('ai.prov')}</span><select id="aiP"><option value="">${T('ai.none')}</option>${opts}</select></label>`;
  if (P) {
    const baseIn = `<label class="aif"><span>${T('ai.base')}</span><input id="aiBase" spellcheck="false" autocomplete="off" value="${esc(u.base || '')}" placeholder="${esc(P.base || T('ai.base_ph'))}"></label>`;
    const picked = aiPicked && aiPicked.p === d.p ? aiPicked.ids : null;
    h += `<p class="muted aix">${aiNote(P)}</p>
    ${P.noKey ? '' : `<label class="aif"><span>${T('ai.key')}${P.key ? ` · <a href="${esc(P.key)}" target="_blank" rel="noopener">${T('ai.getkey')}</a>` : ''}</span><span class="airow"><input id="aiKey" type="password" spellcheck="false" autocomplete="off" value="${esc(u.key || '')}" placeholder="${esc(T('ai.key_ph'))}"><button class="mini" id="aiEye" type="button">${T('ai.show')}</button></span></label>`}
    ${P.base ? '' : baseIn}
    <label class="aif"><span>${T('ai.model')}</span><span class="airow"><input id="aiModel" list="aiModels" spellcheck="false" autocomplete="off" value="${esc(u.model || P.model || '')}" placeholder="${esc(P.model || T('ai.model_ph'))}"><button class="mini" id="aiList" type="button">${T('ai.list')}</button></span></label>
    <datalist id="aiModels">${(P.models || []).map(m => `<option value="${esc(m)}"></option>`).join('')}</datalist>
    ${picked && picked.length ? `<label class="aif"><span class="airow"><select id="aiPick"><option value="">${T('ai.pick', { n: { raw: picked.length } })}</option>${picked.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}</select></span></label>` : ''}
    <details class="aiadv" ${u.base || u.fast || u.maxTok || u.think || d.proxy ? 'open' : ''}><summary>${T('ai.adv')}</summary>
      ${P.base ? baseIn : ''}
      <label class="aif"><span>${T('ai.fast')}</span><input id="aiFast" spellcheck="false" autocomplete="off" value="${esc(u.fast || '')}" placeholder="${esc(P.fast || T('ai.fast_ph'))}"></label>
      <label class="aif"><span>${T('ai.maxtok')}</span><input id="aiMax" type="number" min="256" max="1000000" step="256" value="${u.maxTok || ''}" placeholder="${P.maxTok || esc(T('ai.maxtok_ph'))}"></label>
      ${P.fastBody ? `<label class="chk"><input type="checkbox" id="aiThink" ${u.think ? 'checked' : ''}><span>${T('ai.think')}</span></label>` : ''}
      <label class="aif"><span>${T('ai.proxy')} · <a href="#" id="aiProxyHow">${T('ai.proxy_how')}</a></span><input id="aiProxy" spellcheck="false" autocomplete="off" value="${esc(d.proxy || '')}" placeholder="${esc(T('ai.proxy_ph'))}"></label>
      <p class="muted aix">${T('ai.proxy_x')}</p>
    </details>`;
  }
  h += `<div class="aibtns">${P ? `<button id="aiTest" type="button">${T('ai.test')}</button>` : ''}<button class="btn-primary" id="aiSave" type="button">${T(P ? 'ai.save' : 'ai.save_off')}</button>${Object.values(window.TXAI.cfg.by).some(x => x && x.key) || (P && u.key) ? `<button id="aiClear" type="button">${T('ai.clear')}</button>` : ''}</div>
    <p class="aimsg" id="aiMsg" role="status"></p>${P && !P.noKey ? `<p class="muted aix">${T('ai.priv')}</p>` : ''}`;
  return h;
}
function aiSettingsBind() {
  const box = $('#aiBox'); if (!box || !AID) return;
  const sel = $('#aiP'); if (sel) sel.onchange = () => { aiRead(); AID.p = sel.value; aiPicked = null; aiRedraw(); };
  box.querySelectorAll('input').forEach(x => { x.oninput = () => aiRead(); x.onchange = () => aiRead(); });
  const eye = $('#aiEye'); if (eye) eye.onclick = () => { const k = $('#aiKey'), show = k.type === 'password'; k.type = show ? 'text' : 'password'; eye.textContent = T(show ? 'ai.hide' : 'ai.show'); };
  const ls = $('#aiList'); if (ls) ls.onclick = aiListModels;
  const pk = $('#aiPick'); if (pk) pk.onchange = () => { if (pk.value) { $('#aiModel').value = pk.value; aiRead(); } };
  const ts = $('#aiTest'); if (ts) ts.onclick = () => aiTestNow(AID, '');
  const sv = $('#aiSave'); if (sv) sv.onclick = aiSaveNow;
  const cl = $('#aiClear'); if (cl) cl.onclick = aiClearKey;
  const oa = $('#aiOAuth'); if (oa) oa.onclick = () => aiOAuthGo('box');
  const ph = $('#aiProxyHow'); if (ph) ph.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); aiProxyHelp(); });
  box.querySelectorAll('a[target=_blank]').forEach(a => a.addEventListener('click', e => e.stopPropagation())); // 页面的全局点击处理会拦下链接
  if (aiFlash) { aiMsg(aiFlash.t, aiFlash.c); aiFlash = null; }
}
function aiRedraw() { const box = $('#aiBox'); if (!box) return; box.innerHTML = aiBoxHTML(); aiSettingsBind(); }
// 把面板上的值读进草稿（与预设相同的值存为空，预设以后更新时跟着变）
function aiRead() {
  const d = AID; if (!d) return;
  const pr = $('#aiProxy'); if (pr) d.proxy = pr.value.trim();
  const P = d.p && aiP(d.p); if (!P) return;
  const u = d.by[d.p] = Object.assign({}, d.by[d.p]);
  const g = id => { const e = $('#' + id); return e ? e.value.trim() : null; };
  let v;
  if ((v = g('aiKey')) !== null) u.key = v;
  if ((v = g('aiModel')) !== null) u.model = v === P.model ? '' : v;
  if ((v = g('aiBase')) !== null) u.base = v.replace(/\/+$/, '') === P.base ? '' : v;
  if ((v = g('aiFast')) !== null) u.fast = v === (P.fast || '') ? '' : v;
  if ((v = g('aiMax')) !== null) u.maxTok = +v > 0 ? Math.round(+v) : 0;
  const th = $('#aiThink'); if (th) u.think = th.checked;
}
function aiMsg(html, cls) { const m = $('#aiMsg'); if (!m) return; m.className = 'aimsg' + (cls ? ' ' + cls : ''); m.innerHTML = html; }
function aiMissing(k) { const p = window.TXAI.problem(k); return p ? 'ai.e.' + p : ''; } // 填写有误时返回说明文字的键
function aiErrMsg(e, k) {
  const c = (e && e.code) || 'x', det = e && e.detail ? `<small class="muted">${esc(e.detail)}</small>` : '';
  if (c === 'network') return (window.TXAI.viaProxy(k) ? T('ai.e.network_proxy', { x: { raw: esc(k.proxy) } }) : T(k.P.cors === 1 ? 'ai.e.network_ok' : 'ai.e.network', { x: { raw: esc(aiNm(k.P, 'b')) } })) + det;
  if (I18N.has('ai.e.' + c)) return T('ai.e.' + c) + det;
  return esc(LLM.errText(e));
}
async function aiTestNow(d, pre) {
  if (d === AID) aiRead();
  const k = window.TXAI.conf(d); if (!k) return;
  const miss = aiMissing(k); if (miss) { aiMsg(pre + T(miss), 'warn'); return; }
  const btn = $('#aiTest'); if (btn) btn.disabled = true;
  aiMsg(pre + T('ai.testing'), '');
  try {
    const r = await window.TXAI.test(d);
    aiMsg(pre + T(r.json ? 'ai.ok' : 'ai.ok_nojson', { m: { raw: esc(k.model) }, s: { raw: (r.ms / 1000).toFixed(1) } }), r.json ? 'ok' : 'warn');
  } catch (e) { aiMsg(pre + aiErrMsg(e, k), 'err'); }
  finally { const b = $('#aiTest'); if (b) b.disabled = false; }
}
async function aiSaveNow() {
  aiRead();
  const d = AID, k = window.TXAI.conf(d);
  if (k) { const miss = aiMissing(k); if (miss) { aiMsg(T(miss), 'warn'); return; } }
  window.TXAI.save(d);
  if (k && UI.engine === 'rules') { UI.engine = 'auto'; savePrefs(); } // 接入 AI 就是要用它推演
  await LLM.init();
  aiRefresh(); renderTop();
  const lab = window.TXAI.label();
  const done = k ? T('ai.saved', { x: { raw: esc((lab ? lab[EN() ? 'en' : 'zh'] : '') + ' · ' + k.model) } }) + ' ' : T('ai.saved_off');
  aiKeep = false; openSettings(); // 整个设置面板重画（推演引擎的状态也变了）
  const box = $('#aiBox'); if (box) box.scrollIntoView({ block: 'nearest' });
  if (k) aiTestNow(window.TXAI.cfg, done); // 顺手测试一次，结果显示在这一节下方
  else aiMsg(done, 'ok');
}
function aiClearKey() { // 清除所有服务商的密钥（公用电脑用完时），AI 推演随之关闭
  aiRead(); const d = AID;
  for (const id of Object.keys(d.by)) d.by[id] = Object.assign({}, d.by[id], { key: '' });
  const sv = window.TXAI.cfg; for (const id of Object.keys(sv.by)) if (sv.by[id]) sv.by[id].key = '';
  sv.p = '';
  window.TXAI.save(sv); // 立刻从本机删除
  LLM.init().then(() => { aiRefresh(); renderTop(); });
  aiPicked = null; aiRedraw(); aiMsg(T('ai.cleared'), 'ok');
}
async function aiListModels() {
  aiRead(); const k = window.TXAI.conf(AID); if (!k) return;
  const miss = window.TXAI.problem(k); if (miss && miss !== 'no_model') { aiMsg(T('ai.e.' + miss), 'warn'); return; }
  const b = $('#aiList'); if (b) b.disabled = true;
  aiMsg(T('ai.listing'), '');
  try {
    const ids = await window.TXAI.models(AID);
    aiPicked = { p: AID.p, ids }; aiRedraw();
    aiMsg(ids.length ? T('ai.listed', { n: { raw: ids.length } }) : T('ai.list_none'), ids.length ? 'ok' : 'warn');
  } catch (e) { aiMsg(e && (e.status === 404 || e.status === 405) ? T('ai.list_unsupported') : aiErrMsg(e, k), e && e.status === 404 ? 'warn' : 'err'); } // 有的服务商没有模型列表接口
  finally { const b2 = $('#aiList'); if (b2) b2.disabled = false; }
}

/* ---------- 转发代理：搭建说明与代理代码 ---------- */
let aiProxySrc = null;
const aiProxyCode = () => aiProxySrc || (aiProxySrc = fetch(new URL('ai-proxy.mjs', location.href)).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }).catch(e => { aiProxySrc = null; throw e; }));
function aiProxyHelp() {
  aiRead(); aiKeep = true;
  const prev = UI.afterClose; UI.afterClose = null;
  showModal(`<h2>${T('ai.ph.h')}</h2><p class="sub">${T('ai.ph.x')}</p>
    <div class="aihelp">${T('ai.ph.cf')}<p class="muted">${T('ai.ph.cn')}</p>${T('ai.ph.node')}<div id="aiPhCode"></div></div>
    <div class="foot"><a href="${AI_DOC}#ai-proxy" target="_blank" rel="noopener" id="aiPhDoc">${T('ai.ph.more')}</a><button id="aiPhDl">${T('ai.ph.dl')}</button><button id="aiPhCopy">${T('ai.ph.copy')}</button><button class="btn-primary" data-close="1">${T('u.back')}</button></div>`, 'narrow', true);
  UI.afterClose = () => { UI.afterClose = prev; aiKeep = true; openSettings(); const box = $('#aiBox'); if (box) box.scrollIntoView({ block: 'nearest' }); };
  $('#aiPhDoc').addEventListener('click', e => e.stopPropagation());
  aiProxyCode().catch(() => { });
  const fail = () => toast(T('ai.ph.nocode'), 5000);
  $('#aiPhCopy').onclick = () => aiProxyCode().then(t => navigator.clipboard.writeText(t).then(() => toast(T('ai.ph.copied'), 3000), () => {
    const box = $('#aiPhCode'); if (box) { box.innerHTML = `<p class="muted">${T('ai.ph.manual')}</p><textarea readonly spellcheck="false"></textarea>`; const ta = box.querySelector('textarea'); ta.value = t; ta.focus(); ta.select(); }
  }), fail);
  $('#aiPhDl').onclick = () => aiProxyCode().then(async t => { const dl = await window.claude.use('downloads'); if (dl) await dl.save({ filename: 'ai-proxy.mjs', data: t, mimeType: 'text/javascript' }); }, fail);
}

/* ---------- 开局画面：AI 推演的接入状态 ---------- */
function aiStartHTML() {
  if (!aiWeb()) return '';
  const on = window.TXAI.ready(), k = window.TXAI.conf(), lab = window.TXAI.label();
  const txt = on ? T('ai.start_on', { x: { raw: `<b class="on">${esc(lab[EN() ? 'en' : 'zh'])}</b> · ${esc(k.model)}` } }) + (LLM.state === 'off' ? ' ' + T('ai.start_err') : '') : T('ai.start_off');
  return `<div class="aistart" id="aiStart"><span>${txt}</span>${on ? '' : `<button class="mini btn-primary" id="aiStartOA">${T('ai.oa.start')}</button>`}<button class="mini" id="aiStartGo">${T(on ? 'ai.change' : 'ai.connect')}</button></div><p class="aimsg" id="aiStartMsg" role="status"></p>`;
}
function aiStartBind() {
  const b = $('#aiStartGo'); if (!b) return;
  b.onclick = () => { UI.afterClose = () => mpShowStart(); openSettings(); const box = $('#aiBox'); if (box) box.scrollIntoView({ block: 'start' }); };
  const oa = $('#aiStartOA'); if (oa) oa.onclick = () => aiOAuthGo('start');
}

/* ---------- 一键接入：OpenRouter 授权（不用复制密钥） ----------
 * 先同步打开一个空白的弹出窗口（异步之后再开会被浏览器当作广告弹窗拦下），算好 PKCE 参数后把它导向 OpenRouter 的授权页；
 * 弹出窗口被拦截时改为本页跳转（授权后 auth.html 再跳回来）。授权页回到本站的 auth.html 后，本页从 localStorage 的变化
 * （或 auth.html 发来的消息、或下次打开页面时）得知，用授权码换取密钥（TXAI.oauthFinish）。 */
let aiOAWhere = 'box';
function aiOAMsg(html, cls) {
  if ($('#aiBox')) { aiMsg(html, cls); return; }
  const m = $('#aiStartMsg'); if (m) { m.className = 'aimsg' + (cls ? ' ' + cls : ''); m.innerHTML = html; return; }
  toast(html.replace(/<[^>]+>/g, ''), 7000);
}
function aiOAuthGo(where) {
  aiOAWhere = where || 'box';
  if (where === 'box') aiRead();
  let w = null; try { w = window.open('', 'txauth', 'popup,width=520,height=760'); } catch (e) { w = null; }
  if (w) { try { w.document.title = 'OpenRouter'; w.document.body.style.cssText = 'font:15px system-ui,sans-serif;text-align:center;margin-top:30vh'; w.document.body.textContent = T('ai.oa.opening'); } catch (e) { } }
  window.TXAI.oauthStart(w ? 'popup' : 'redirect').then(url => {
    if (w && !w.closed) { w.location.href = url; aiOAMsg(T('ai.oa.wait'), ''); }
    else location.href = url; // 弹出窗口被拦截：本页跳转，授权后回到这里
  }).catch(e => { if (w) try { w.close(); } catch (x) { } aiOAMsg(T('ai.oa.fail', { x: { raw: aiErrMsg(e, window.TXAI.conf(null, 'openrouter')) } }), 'err'); });
}
let aiOABusy = false;
async function aiOAuthDone() {
  if (aiOABusy || !window.TXAI.oauthPending()) return; aiOABusy = true;
  try {
    let r = null;
    try { r = await window.TXAI.oauthFinish(); }
    catch (e) { aiOAMsg(T('ai.oa.fail', { x: { raw: aiErrMsg(e, window.TXAI.conf(null, 'openrouter')) } }), 'err'); return; }
    if (!r) return;
    if (UI.engine === 'rules') { UI.engine = 'auto'; savePrefs(); } // 接入 AI 就是要用它推演
    await LLM.init(); aiRefresh(); if (S) renderTop();
    const txt = T('ai.oa.ok', { m: { raw: esc(r.model) }, f: { raw: r.free ? T('ai.oa.free') : '' } });
    if ($('#aiBox')) { AID = window.TXAI.cfg; aiPicked = null; aiRedraw(); }
    else if ($('#aiStart') && typeof mpShowStart === 'function' && MPS.view === 'start') mpShowStart();
    aiOAMsg(txt, 'ok');
    if (typeof haOnLocalAI === 'function') haOnLocalAI(); // 房主：马上共享给本局所有玩家（开着共享时）
  } finally { aiOABusy = false; }
}
if (aiWeb()) {
  window.addEventListener('storage', e => { if (e.key === 'tianxia.oauth.code' && e.newValue) aiOAuthDone(); });
  window.addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.type === 'tianxia-oauth') setTimeout(aiOAuthDone, 50); });
  window.addEventListener('focus', () => { if (window.TXAI.oauthPending()) aiOAuthDone(); }); // 保险：回到本页时
  if (window.TXAI.oauthPending()) setTimeout(aiOAuthDone, 600); // 本页跳转回来，或授权完成时本页正在刷新
  window.TXAI.onChange(() => { LLM.init().then(() => { aiRefresh(); if (S) renderTop(); }); }); // 别的标签页改了 AI 设置
}
