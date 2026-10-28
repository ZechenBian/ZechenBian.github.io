/* ===================== 界面层 v2 · 开局、设置、存档、启动 ===================== */
function startHTML(sel) {
  const sid = UI.scen || '2026'; const SC = W.useScenario(sid);
  const tmp0 = W.newGame({ player: SC.defPick || 'CHN', seed: 1, scen: sid }); const okIds = W.playable(tmp0);
  if (!okIds.includes(sel)) sel = okIds.includes(UI.pick) ? UI.pick : (SC.defPick || okIds[0]);
  UI.pick = sel;
  const tmp = tmp0;
  const list = okIds.map(id => ({ id, p: W.power(tmp, id), g: tmp.actors[id].gdp, n: tmp.actors[id].nukes })).sort((a, b) => b.p - a.p);
  const diffOf = id => { tmp.player = id; const h = W.hegemony(tmp); return h.prog > 0.4 ? ['u.d.easy', 'good'] : h.prog > 0.22 ? ['u.d.mid', 'warn'] : h.prog > 0.06 ? ['u.d.hard', 'bad'] : ['u.d.vhard', 'bad']; };
  const cur = sel || UI.pick || 'CHN'; const d = DEF[cur]; const [dl, dc] = diffOf(cur);
  const f = UI.startOpts || (UI.startOpts = { goal: 'hegemony', diff: 'normal', pol: 'std', eng: UI.engine === 'rules' ? 'rules' : 'auto' });
  const radio = (name, v, label, small) => `<label><input type="radio" name="${name}" value="${v}" ${f[name] === v ? 'checked' : ''}><span>${label}${small ? `<small>${small}</small>` : ''}</span></label>`;
  return `<div class="start-h"><h1>${T('u.title')}</h1><div class="langpick"><button data-slang="zh" class="${EN() ? '' : 'on'}">中文</button><button data-slang="en" class="${EN() ? 'on' : ''}">English</button></div></div>
  <p class="sub">${T('u.intro')}</p>
  <h4 style="margin:12px 0 0">${T('u.scen')}</h4><div class="scenpick">${W.scenarioList().map(s => `<button data-scen="${s.id}" class="${s.id === sid ? 'on' : ''}"><b>${esc(EN() ? s.title[1] : s.title[0])}</b><small>${esc(EN() ? s.blurb[1] : s.blurb[0])}</small></button>`).join('')}</div>
  <div class="opts pick2">
    <div class="opt"><h4>${T('u.pick')}</h4><div class="picker">${list.map(r => `<button class="pc ${r.id === cur ? 'on' : ''}" data-pick="${r.id}"><span class="n"><i style="background:${polColor(r.id)}"></i>${esc(NAME(r.id))}</span><small>GDP ${fmtB(r.g)} · ${T('u.power')} ${fmtN(r.p)}${r.n ? ' · ☢' + fmtN(r.n) : ''}</small></button>`).join('')}</div></div>
    <div class="opt"><h4>${esc(NAME(cur))}</h4><div class="doctrine">${esc(EN() ? d.doctrineEn : d.doctrine)}</div>
      <div class="preview"><div class="stat"><span>GDP</span><b>${fmtB(d.gdp)}</b></div><div class="stat"><span>${T('u.milex')}</span><b>${fmtB(d.milex)}</b></div><div class="stat"><span>${T('u.pers')}</span><b>${esc(I18N.pers(d.pers))}</b></div><div class="stat"><span>${T('u.k.nukes')}</span><b>${fmtN(d.nukes)}</b></div>${W.shieldIds && W.shieldIds().includes(cur) ? '' : `<div class="stat"><span>${T('u.gov')}</span><b>${T('gov.' + d.gov)}</b></div>`}<div class="stat"><span>${T('u.difficulty')}</span><b class="${dc}">${T(dl)}</b></div></div>
      ${SC.startNote && SC.startNote[cur] ? `<div class="alert">${T(SC.startNote[cur])}</div>` : ''}
    </div>
  </div>
  <div class="opts">
    <div class="opt"><h4>${T('u.goal')}</h4><div class="radio">${radio('goal', 'hegemony', T('u.goal_heg'), T('u.goal_heg_x'))}${radio('goal', 'unify', T('u.goal_unify'), T('u.goal_unify_x', { n: IDS.length }))}</div></div>
    <div class="opt"><h4>${T('u.ai_int')}</h4><div class="radio">${radio('diff', 'easy', T('u.easy'), T('u.easy_x'))}${radio('diff', 'normal', T('u.normal'), T('u.normal_x'))}${radio('diff', 'hard', T('u.hard'), T('u.hard_x'))}</div></div>
    <div class="opt"><h4>${T('u.polmode')}</h4><div class="radio">${radio('pol', 'std', T('u.pol_std'), T('u.pol_std_x'))}${radio('pol', 'strict', T('u.pol_strict'), T('u.pol_strict_x'))}</div></div>
    <div class="opt"><h4>${T('u.engine')}</h4><div class="radio">${radio('eng', 'auto', T('u.eng_llm'), `<b id="engStat">${engStat()}</b>${T('u.eng_llm_x')}`)}${radio('eng', 'rules', T('u.eng_rule'), T('u.eng_rule_x'))}</div></div>
  </div>
  <div class="foot">${hasSave() ? `<button id="loadSave">${T('u.continue_save')}</button>` : ''}<button id="importSave">${T('u.import')}</button><button class="btn-primary" id="startGo">${T('u.start')}</button></div>`;
}
function engStat() { return LLM.available() ? T('u.es.ready') : LLM.state === 'pending' ? T('u.es.pending') : T('u.es.off'); }
function readStartOpts() { const f = UI.startOpts; for (const k of ['goal', 'diff', 'pol', 'eng']) { const el = $('#sheet').querySelector(`input[name=${k}]:checked`); if (el) f[k] = el.value; } }
function showStart(sel) {
  if (window.TX_MP && typeof mpShowStart === 'function') return mpShowStart();
  showModal(startHTML(sel), 'start', !!S && !UI.demo);
  UI.afterClose = () => { if (S) { W.useScenario(S.scen || '2026'); renderAll(); } };
  const sh = $('#sheet');
  const redraw = () => { readStartOpts(); const st = sh.scrollTop, pk = sh.querySelector('.picker').scrollTop; showStart(UI.pick || sel); sh.scrollTop = st; sh.querySelector('.picker').scrollTop = pk; };
  sh.querySelectorAll('[data-pick]').forEach(b => (b.onclick = () => { UI.pick = b.dataset.pick; redraw(); }));
  sh.querySelectorAll('[data-slang]').forEach(b => (b.onclick = () => { readStartOpts(); setLang(b.dataset.slang); redraw(); }));
  sh.querySelectorAll('[data-scen]').forEach(b => (b.onclick = () => { UI.scen = b.dataset.scen; UI.pick = null; redraw(); }));
  sh.querySelectorAll('input[type=radio]').forEach(r => (r.onchange = readStartOpts));
  $('#startGo').onclick = () => {
    readStartOpts(); const f = UI.startOpts;
    UI.engine = f.eng; savePrefs();
    S = W.newGame({ player: UI.pick || sel || 'CHN', goal: f.goal, diff: f.diff, strict: f.pol === 'strict', llm: f.eng !== 'rules', scen: UI.scen || '2026' }); UI.demo = false;
    I18N.setPlayer(S.player);
    UI.sel = null; UI.tab = 'home'; UI.params = {}; UI.open = {}; UI.move = {}; UI.crisisSeen = {}; closeModal(); renderAll(); zoomTo(S.player); autosave();
    toast(T('u.welcome', { x: { raw: dateStr(S) }, a: S.player }), 6000);
    refreshPlans();
  };
  const ls = $('#loadSave'); if (ls) ls.onclick = () => { const s = loadLocal(); if (s) { adopt(s); closeModal(); } };
  $('#importSave').onclick = importSave;
}
function adopt(s) {
  if (window.TX_MP && typeof mpAdoptImported === 'function') return mpAdoptImported(s); // 联机版：导入的存档按本地模式载入
  S = s; W.useScenario(S.scen || '2026'); UI.scen = S.scen || '2026'; UI.demo = false; I18N.setPlayer(S.player); UI.sel = null; UI.move = {}; UI.params = {}; UI.open = {}; UI.crisisSeen = {}; renderAll(); zoomTo(S.player); }

/* ---------- 存档 ---------- */
function serialize(s) { const c = Object.assign({}, s); delete c._exp; delete c._R; return JSON.stringify(c); }
function deserialize(txt) {
  const o = typeof txt === 'string' ? JSON.parse(txt) : txt;
  if (!o || !o.actors || !o.player || !o.actors[o.player]) throw new Error(T('u.save_bad'));
  if (o.v !== 4 && o.v !== 5) throw new Error(T('u.save_old'));
  W.migrate(o);
  o.queue = o.queue || []; o.inbox = o.inbox || []; o.chat = o.chat || {}; o.carry = o.carry || [];
  return o;
}
function autosave() { if (window.TX_MP) { if (typeof mpLocalSave === 'function') mpLocalSave(); return; } if (!S || UI.demo) return; try { localStorage.setItem(SAVE_KEY, serialize(S)); } catch (e) { } }
function hasSave() { try { return !!(localStorage.getItem(SAVE_KEY) || localStorage.getItem(OLD_SAVE_KEY)); } catch (e) { return false; } }
function loadLocal() { try { return deserialize(localStorage.getItem(SAVE_KEY) || localStorage.getItem(OLD_SAVE_KEY)); } catch (e) { toast(T('u.load_fail', { x: { raw: e.message } })); return null; } }
async function exportSave() {
  const data = serialize(S); const name = `tianxia-${S.scen || '2026'}-${S.player}-${S.year}Q${S.q}.json`;
  try { const dl = await window.claude?.use?.('downloads'); if (dl) { await dl.save({ filename: name, data }); toast(T('u.exported')); return; } } catch (e) { if (e && e.code === 'declined') return; }
  showModal(`<h2>${T('u.export')}</h2><p class="sub">${T('u.export_x')}</p><textarea readonly style="width:100%;height:220px;font-family:var(--f-mono);font-size:11px" id="saveTxt">${esc(data)}</textarea><div class="foot"><button id="copySave">${T('u.copy')}</button><button class="btn-primary" data-close="1">${T('u.done')}</button></div>`, 'narrow', true);
  $('#copySave').onclick = async () => { const ta = $('#saveTxt'); try { await navigator.clipboard.writeText(ta.value); toast(T('u.copied')); } catch (e) { ta.select(); toast(T('u.copy_hint')); } };
}
function importSave() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { adopt(deserialize(r.result)); closeModal(); autosave(); toast(T('u.imported')); } catch (e) { toast(T('u.import_fail', { x: { raw: e.message } })); } }; r.readAsText(f); };
  inp.click();
}

/* ---------- 设置 ---------- */
function openSettings() {
  if (typeof v2OpenSettings === 'function') return v2OpenSettings(); // 新版（tianxia-v2/）的设置面板：AI 来源
  const theme = document.documentElement.getAttribute('data-theme') || '';
  const r = (name, v, cur, label, small) => `<label><input type="radio" name="${name}" value="${v}" ${cur === v ? 'checked' : ''}><span>${label}${small ? `<small>${small}</small>` : ''}</span></label>`;
  showModal(`<h2>${T('u.settings')}</h2>
  <div class="opts">
    <div class="opt"><h4>${T('u.lang')}</h4><div class="radio">${r('sl', 'zh', I18N.getLang(), '中文')}${r('sl', 'en', I18N.getLang(), 'English')}</div><p class="muted" style="font-size:12px;margin:6px 0 0">${T('u.lang_x')}</p></div>
    <div class="opt"><h4>${T('u.engine')}</h4><div class="radio">${r('se', 'auto', UI.engine === 'rules' ? 'rules' : 'auto', T('u.eng_llm'), T('u.status_is', { x: { raw: engStat() } }))}${r('se', 'rules', UI.engine === 'rules' ? 'rules' : 'auto', T('u.eng_rule'))}</div></div>
    <div class="opt"><h4>${T('u.depth')}</h4><div class="radio">${r('st', 'quick', UI.tier, T('u.quick'), T('u.quick_x'))}${r('st', 'default', UI.tier, T('u.std'))}${r('st', 'complex', UI.tier, T('u.deep'), T('u.deep_x'))}</div></div>
    <div class="opt"><h4>${T('u.display')}</h4><div class="radio">${r('th', '', theme, T('u.th_sys'))}${r('th', 'light', theme, T('u.th_light'))}${r('th', 'dark', theme, T('u.th_dark'))}</div><label style="display:flex;gap:8px;margin-top:8px;font-size:13px"><input type="checkbox" id="lblChk" ${UI.labels ? 'checked' : ''}>${T('u.labels')}</label></div>
  </div>
  ${typeof aiSettingsHTML === 'function' ? aiSettingsHTML() : ''}
  <div class="opts"><div class="opt"><h4>${T('u.saves')}</h4><div style="display:flex;gap:6px;flex-wrap:wrap"><button id="sExport" ${S && !UI.demo ? '' : 'disabled'}>${T('u.export')}</button><button id="sImport">${T('u.import')}</button><button id="sNew">${T('u.newgame')}</button><button id="sHelp">${T('u.help')}</button></div><p class="muted" style="font-size:12px">${T('u.autosave')}</p></div></div>
  <div class="foot"><button class="btn-primary" data-close="1">${T('u.done')}</button></div>`, 'narrow', true);
  const sh = $('#sheet');
  sh.querySelectorAll('input[name=sl]').forEach(x => (x.onchange = () => { setLang(x.value); openSettings(); }));
  sh.querySelectorAll('input[name=se]').forEach(x => (x.onchange = () => { UI.engine = x.value; if (x.value === 'auto' && LLM.state === 'off') LLM.init().then(() => renderTop()); savePrefs(); renderTop(); }));
  sh.querySelectorAll('input[name=st]').forEach(x => (x.onchange = () => { UI.tier = x.value; savePrefs(); }));
  sh.querySelectorAll('input[name=th]').forEach(x => (x.onchange = () => { if (x.value) document.documentElement.setAttribute('data-theme', x.value); else document.documentElement.removeAttribute('data-theme'); savePrefs(); if (S) renderAll(); }));
  $('#lblChk').onchange = e => { UI.labels = e.target.checked; savePrefs(); placeLabels(); const lp = $('#lyrPanel'); if (lp && !lp.hidden) lp.innerHTML = lyrPanelHTML(); };
  $('#sExport').onclick = exportSave; $('#sImport').onclick = importSave; $('#sNew').onclick = () => showStart(S && S.player); $('#sHelp').onclick = showHelp;
  if (typeof aiSettingsBind === 'function') aiSettingsBind(); // 网页版：AI 推演接口（src/web/ui）
}
function showHelp() {
  showModal(`<h2>${T('u.help')}</h2><div class="help">${['turn', 'sim', 'orders', 'ai', 'core', 'mil', 'wmap', 'army', 'ind', 'intel', 'pol', 'econ', 'nuke', 'scen', 'data'].map(k => `<p><b>${T('u.h.' + k)}</b>${T('u.h.' + k + '_x')}</p>`).join('')}</div>
  <div class="foot"><button class="btn-primary" data-close="1">${T('u.gotit')}</button></div>`, 'narrow', true);
}

/* ---------- 启动 ---------- */
function boot(data) {
  applyStatic(); buildMap(); applyView();
  let restored = null;
  try { if (data && data.save) restored = deserialize(data.save); } catch (e) { }
  if (window.TX_MP && typeof mpBoot === 'function') mpBoot(data);
  else if (restored) { adopt(restored); }
  else { S = W.newGame({ player: 'CHN', seed: 7 }); I18N.setPlayer(null); UI.demo = true; renderMap(); renderTop(); renderQueue(); showStart(); }
  LLM.onState(() => { if (S) renderTop(); const es = $('#engStat'); if (es) es.textContent = engStat(); });
  LLM.init().then(() => { if (S && !UI.demo) refreshPlans(); });
  try { window.claude?.hot?.snapshot?.(() => ({ save: S && !UI.demo ? serialize(S) : null })); } catch (e) { }
}
try { window.__TX = { get S() { return S; }, get UI() { return UI; }, renderAll: () => renderAll() }; } catch (e) { } // 测试钩子
try { if (window.claude?.hot?.ready) window.claude.hot.ready(boot); else boot(window.claude?.hot?.data ?? {}); } catch (e) { boot({}); }
})();
