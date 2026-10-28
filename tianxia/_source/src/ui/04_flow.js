// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 界面层 v2 · 交互与回合流程 ===================== */
document.addEventListener('click', e => {
  const t = e.target.closest('button, a, [data-toggle], [data-sel], th[data-sort], th[data-isort], td[data-sel], [data-wcity], [data-wfront], [data-wreg]');
  if (!t) return;
  const d = t.dataset;
  if (t.id === 'btnLang') { setLang(EN() ? 'zh' : 'en'); return; }
  if (!S) return;
  if (t.tagName === 'A') e.preventDefault();
  if (d.wmap) { openWarMap(d.wmap); return; }
  if (d.progcancel) { if (doCmd('cancelProgram', [d.progcancel])) toast(T('u.prog_cancelled')); renderSide(); autosave(); return; }
  if (wmClick(d)) return;
  if (d.tab) { UI.tab = d.tab; renderSide(); return; }
  if (d.toggle) { UI.open[d.toggle] = !UI.open[d.toggle]; renderSide(); return; }
  if (d.cat) { UI.cat = d.cat; renderSide(); return; }
  if (d.queue) {
    const a = W.ACT[d.queue]; const p = paramsFor(a, d.t);
    if (a.danger) { confirmNuke(d.queue, d.t, p); return; }
    const r = W.queueAction(S, d.queue, d.t, Object.assign({}, p));
    if (!r.ok) toast(r.reason); else { toast(T('u.queued', { x: { raw: qLabel(S.queue[S.queue.length - 1]) } })); UI.open[d.queue] = false; }
    renderTop(); renderSide(); renderQueue(); renderMap(); return;
  }
  if (d.unq !== undefined) { W.unqueue(S, +d.unq); renderTop(); renderSide(); renderQueue(); return; }
  if (d.indpanel) { openIndPanel(); return; }
  if (d.isort) { UI.indSort = d.isort; openIndPanel(); return; }
  if (d.ifilter) { UI.indAll = d.ifilter === 'all'; openIndPanel(); return; }
  if (d.sel) { if (t.closest('#sheet')) { UI.afterClose = null; closeModal(); } select(d.sel); zoomTo(d.sel); return; }
  if (d.v) { UI.view = d.v; renderMap(); return; }
  if (d.go === 'home') { UI.tab = 'home'; renderSide(); return; }
  if (d.go === 'chat') { UI.tab = 'diplo'; renderSide(); return; }
  if (d.go === 'settings') { openSettings(); return; }
  if (d.chat) { UI.sel = d.chat; UI.tab = 'diplo'; renderMap(); renderSide(); return; }
  if (d.offer) { const msg = doCmd('answerOffer', [d.offer, d.ok === '1']); toast(msg ? TX(msg) : T('u.done')); renderAll(); autosave(); return; }
  if (d.ulti) { const msg = doCmd('answerUltimatum', [d.ulti, d.ans]); if (msg) toast(TX(msg), 4500); renderAll(); autosave(); return; }
  if (d.crisis) { openCrisis(d.crisis); return; }
  if (d.cstep) { openCoreStep(d.cstep, +d.lv); return; }
  if (d.cancelop) { if (doCmd('cancelOp', [d.cancelop])) toast(T('u.op_cancelled')); renderAll(); return; }
  if (d.halt) { if (doCmd('haltFront', [d.halt])) toast(T('u.halted')); renderAll(); return; }
  if (d.peace) { UI.sel = d.peace; UI.tab = 'target'; UI.cat = 'dip'; UI.open = { peace: true }; renderMap(); renderSide(); return; }
  if (d.recall) { const r = W.queueDeploy(S, d.recall, S.player, W.freeQV(S, d.recall)); toast(r.ok ? T('u.recall_q', { l: d.recall }) : TX(r.reason)); renderSide(); renderQueue(); return; }
  if (d.war) { openWar(d.war, (UI.lastFronts || []).find(f => f.id === d.war)); return; }
  if (d.askfront) { closeModal(); UI.tab = 'mil'; (UI.params.reqtroops = UI.params.reqtroops || {}).dest = d.askfront; UI.open.reqtroops = true; renderSide(); return; }
  if (d.warnq) { UI.sel = d.warnq; UI.tab = 'target'; UI.cat = 'dip'; UI.open = { warn: true }; UI.params.warn = { about: d.about, conseq: 'war' }; renderMap(); renderSide(); return; }
  if (d.sign) { signDeal(d.sign, +d.i); return; }
  if (d.feed) { UI.feedFilter = d.feed; renderSide(); return; }
  if (d.sort) { UI.rankSort = d.sort; renderSide(); return; }
  if (t.id === 'mvGo') { const mv = UI.move; const free = W.freeQV(S, mv.from); const v = free.map((z, b) => z * (mv.f[b] || 0)); const r = W.queueDeploy(S, mv.from, mv.to, v); toast(r.ok ? T('u.deploy_q', { f: mv.from, l: mv.to }) : TX(r.reason)); renderSide(); renderQueue(); return; }
});
document.addEventListener('change', e => {
  const t = e.target; if (!S) return;
  if (t.dataset.act) { const a = W.ACT[t.dataset.act]; const pp = (a.params || []).find(x => x.key === t.dataset.key); let v = t.value; if (pp && !pp.dyn && pp.options.some(o => typeof o === 'number')) v = +v; UI.params[t.dataset.act][t.dataset.key] = v; renderSide(); return; }
  if (t.dataset.fv) { const v = doCmd('setFrontV', [t.dataset.fv, +t.dataset.b, +t.value]); if (v !== false) toast(T('u.fshare_set', { s: pct(v) })); renderSide(); if (wmIsOpen()) renderWarMap(); else openWar(t.dataset.fv); return; }
  if (wmChange(t)) return;
  if (t.dataset.mvf !== undefined) { UI.move.f[+t.dataset.mvf] = +t.value; renderSide(); return; }
  if (t.id === 'rqAlly') { UI.rqAlly = t.value; renderSide(); return; }
  if (t.id === 'mvFrom') { UI.move.from = t.value; renderSide(); return; }
  if (t.id === 'mvTo') { UI.move.to = t.value; renderSide(); return; }
  if (t.id === 'mixSel') { if (t.value === 'custom') return; const x = S.actors[S.player]; const base = DEF[S.player].mix; const m = { bal: base, land: [0.6, 0.15, 0.25], navy: [0.25, 0.5, 0.25], air: [0.25, 0.2, 0.55] }[t.value]; x.mix = m.slice(); x.mixMode = t.value; renderSide(); return; }
});
document.addEventListener('input', e => {
  const t = e.target; if (!S) return;
  if (t.id === 'milPct') { const x = S.actors[S.player]; x.milPct = +t.value; $('#milPctV').textContent = x.milPct.toFixed(1) + '%'; const cap = S.commits.filter(c => c.type === 'armsctl').reduce((m, c) => Math.min(m, c.cap), Infinity); $('#milPctN').textContent = budgetNote(x, x.gdp * x.milPct / 100, cap); }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'chatForm') sendChat();
  if (e.target.id === 'cmdForm') adjudicate();
});
$('#search').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !S) return; const q = e.target.value.trim(); if (!q) return; const ql = q.toLowerCase();
  const id = IDS.find(i => DEF[i].name.includes(q) || DEF[i].en.toLowerCase().includes(ql) || i === q.toUpperCase() || (DEF[i].voice || '').includes(q));
  if (id) { select(id); zoomTo(id); e.target.blur(); } else toast(T('u.notfound', { x: { raw: q } }));
});
$('#cmdText').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); adjudicate(); } });
document.addEventListener('keydown', e => { if (e.target && e.target.id === 'chatText' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChat(); } });
$('#btnEnd').onclick = () => endTurn();
$('#btnMenu').onclick = () => openSettings();
$('#engineBadge').onclick = () => openSettings();
$('#meChip').onclick = () => { if (!S) return; select(S.player); zoomTo(S.player); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden && UI.modalClosable) closeModal(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S) renderAll(); });

/* ---------- 效果预览（危机选项、自由指令） ---------- */
function effMsg(e) {
  const P = S.player, T_ = e.target || e.b;
  if (W.SET_TYPES.has(e.type)) return W.settingPreview(S, e) || { raw: e.type };
  switch (e.type) {
    case 'rel': return { k: 'fx.rel', p: { a: e.a || P, b: e.b || e.target, d: e.delta } };
    case 'infl': return { k: 'fx.infl', p: { t: T_, d: e.delta } };
    case 'infl_on_me': return { k: 'fx.inflme', p: { t: T_, d: e.delta } };
    case 'stab': return { k: 'fx.stab', p: { t: T_, d: e.delta } };
    case 'gdp': return { k: 'fx.gdp', p: { t: T_, d: e.pct } };
    case 'growth': return { k: 'fx.growth', p: { t: T_, d: e.pct, n: e.turns || 4 } };
    case 'mil': return { k: 'fx.mil', p: { t: T_, d: e.pct } };
    case 'tech': return { k: 'fx.tech', p: { t: T_, d: e.delta } };
    case 'treasury': return { k: 'fx.treasury', p: { m: { m: e.delta } } };
    case 'sanction': return { k: 'fx.sanction', p: { t: T_, n: e.level || 1 } };
    case 'treaty': return { k: 'u.fx.treaty', p: { t: T_, k: { k: 'tr.' + e.treaty } } };
    case 'untreaty': return { k: 'fx.untreaty', p: { t: T_, k: { k: 'tr.' + (e.treaty || 'alliance') } } };
    case 'war': return { k: 'u.fx.war', p: { t: T_, s: { pct: e.commit || 0.45 } } };
    case 'declare': return { k: 'fx.declare', p: { t: T_ } };
    case 'vassal': return { k: 'u.fx.vassal', p: { t: T_ } };
    case 'fac': return { k: 'fx.fac', p: { x: { list: ['mil', 'biz', 'pub'].filter(k => e[k]).map(k => ({ k: 'fx.fac1', p: { k: { k: 'fac.' + k }, d: e[k] } })) } } };
    case 'rep': return { k: 'fx.rep', p: { x: { list: ['trust', 'aggr', 'cred'].filter(k => e[k]).map(k => ({ k: 'fx.rep1', p: { k: { k: 'rep.' + k }, d: e[k] } })) } } };
    case 'threat': return { k: 'fx.threat', p: { t: T_, d: e.delta } };
    case 'tension': return { k: 'fx.tension', p: { t: T_, d: e.delta } };
    case 'cb': return { k: 'fx.cb', p: { t: T_, n: e.turns || 6 } };
    case 'deploy': return { k: 'fx.deploy', p: { l: e.to || T_, s: { pct: e.share || 0.08 } } };
    case 'aidto': return { k: 'fx.aidto', p: { t: T_, m: { m: e.amount } } };
    case 'armsto': return { k: 'fx.armsto', p: { t: T_, m: { m: e.amount } } };
    case 'mobilize': return { k: 'fx.mobilize', p: { k: { k: 'mob.' + (e.level || 1) } } };
    case 'intel': return { k: 'fx.intel', p: { d: e.delta } };
    case 'resist': return { k: 'fx.resist', p: { t: T_, d: e.delta } };
    case 'peace': return { k: 'fx.peace', p: { a: e.a, b: e.b } };
    case 'warn': return { k: 'fx.warn', p: { t: T_, b: e.about } };
    case 'relgreat': return { k: 'fx.relgreat', p: { d: e.delta } };
    case 'reveal': return { k: 'u.fx.reveal' };
    case 'chance': return { k: 'u.fx.chance', p: { s: { pct: e.p }, x: { list: (e.then || []).map(effMsg) }, y: (e.else || []).length ? { k: 'u.fx.else', p: { x: { list: e.else.map(effMsg) } } } : '' } };
    case 'event': return { raw: String(e.text || '') };
  }
  return { raw: e.type };
}
const effText = e => { const m = effMsg(e); return m.raw !== undefined ? m.raw : TX(m); };

/* ---------- 危机决策 ---------- */
function openCrisis(id) {
  const c = S.crises.find(z => z.id === id && !z.resolved); if (!c) { renderSide(); return; }
  const actors = (c.actors || []).filter(a => S.actors[a]);
  showModal(`<div class="crisis"><div class="kicker">${T('u.crisis')}${c.src === 'llm' ? ' · CLAUDE' : ''}</div><h2>${esc(TX(c.title))}</h2><p class="sub">${esc(TX(c.text))}</p>
    ${actors.length ? `<div class="tags">${actors.map(a => `<span class="tag">${esc(NAME(a))} · ${T('u.rel_short')} ${Math.round(W.rel(S, a, S.player))}</span>`).join('')}</div>` : ''}
    <div class="copts">${c.options.map((o, i) => `<button class="copt" data-copt="${i}"><b>${esc(TX(o.label))}${i === (c.def || 0) ? ` <small class="muted">${T('u.default')}</small>` : ''}</b><span>${(o.effects || []).map(e => esc(effText(e))).join(' · ') || T('u.noeffect')}</span></button>`).join('')}</div>
    ${useLLM() ? `<div class="cfree"><textarea id="crText" rows="2" placeholder="${esc(T('u.crisis_free'))}"></textarea><button id="crGo">${T('u.crisis_adj')}</button></div>` : ''}
    <div class="foot"><span class="muted" style="font-size:12px;margin-right:auto">${T('u.crisis_later')}</span><button data-close="1">${T('u.later')}</button></div></div>`, 'narrow', true);
  $$('#sheet [data-copt]').forEach(b => (b.onclick = () => { const r = doCmd('answerCrisis', [id, +b.dataset.copt]); closeModal(); showCrisisResult(c, r); }));
  const go = $('#crGo'); if (go) go.onclick = () => crisisFree(c);
}
function showCrisisResult(c, r) {
  if (!r) { renderAll(); return; }
  toast(T('u.crisis_done', { x: { raw: TX(r.label) } }), 4000);
  const lines = (r.done || []).map(m => typeof m === 'string' ? m : TX(m));
  if (lines.length) showModal(`<h2>${esc(TX(c.title))}</h2><p class="sub">${esc(TX(r.label))}</p><div class="lines">${lines.map(l => `<div class="info">${esc(l)}</div>`).join('')}</div><div class="foot"><button class="btn-primary" data-close="1">${T('u.ok')}</button></div>`, 'narrow', true);
  UI.afterClose = () => nextCrisis();
  renderAll(); autosave();
}
async function crisisFree(c) {
  const text = ($('#crText') || {}).value; if (!text || !text.trim()) return;
  const ctl = new AbortController(); UI.abort = ctl;
  showModal(`<h2>${T('u.adjing')}</h2><div class="preview"><div>“${esc(text)}”</div></div><div class="foot"><div class="spinner"></div><button id="adjStop">${T('u.cancel')}</button></div>`, 'narrow', false);
  $('#adjStop').onclick = () => ctl.abort();
  try {
    const o = await LLM.crisisResponse(S, c, text, { tier: UI.tier, signal: ctl.signal, both: typeof mpMixed === 'function' && mpMixed() }); // 联机局玩家语言不同：结果标题（写进所有人看得到的日志）两种语言都要
    showModal(`<h2>${esc(TX(c.title))}</h2><div class="adj"><div><b>${esc(TX(o.summary) || text)}</b></div>${o.narrative ? `<div class="muted" style="font-size:12.5px">${esc(TX(o.narrative))}</div>` : ''}<ul>${o.effects.map(e => `<li>${esc(effText(e))}</li>`).join('') || `<li>${T('u.noeffect')}</li>`}</ul></div><div class="foot"><button id="crBack">${T('u.back')}</button><button class="btn-primary" id="crOk">${T('u.confirm')}</button></div>`, 'narrow', true);
    $('#crBack').onclick = () => openCrisis(c.id);
    $('#crOk').onclick = () => { const r = doCmd('answerCrisis', [c.id, { effects: o.effects, summary: o.summary || text.slice(0, 40) }]); closeModal(); showCrisisResult(c, r); };
  } catch (e) {
    if (e && e.code === 'cancelled') { openCrisis(c.id); return; }
    showModal(`<h2>${T('u.adj_fail')}</h2><p class="sub">${esc(LLM.errText(e))}</p><div class="foot"><button id="crBack">${T('u.back')}</button></div>`, 'narrow', true); $('#crBack').onclick = () => openCrisis(c.id);
  }
}
function nextCrisis() { const c = S && !S.over && S.crises.find(z => !z.resolved && !UI.crisisSeen?.[z.id]); if (c) { (UI.crisisSeen = UI.crisisSeen || {})[c.id] = true; openCrisis(c.id); } }

/* ---------- 自由指令 ---------- */
async function adjudicate() {
  if (window.TX_MP && typeof mpCommand === 'function') return mpCommand();
  const text = $('#cmdText').value.trim(); if (!text || !S) return;
  if (!useLLM()) {
    const rs = W.ruleSettings(S, text); // 未接入 Claude：明确的设定变更（改名、军费、动员）按规则识别
    if (rs.length) { showAdj({ feasible: true, summary: T('u.adj.set_t'), ap: 1, cost: 0, successChance: 0.95, detectionRisk: 0, effects: [], onFailure: [], settings: rs, needsSettings: true, settingsWhy: T('u.adj.rules_only'), text }, text); return; }
    showModal(`<h2>${T('u.cmd_nollm')}</h2><p class="sub">${T('u.cmd_nollm_x')}</p><div class="foot"><button data-close="1">${T('u.ok')}</button><button class="btn-primary" id="goSet">${T('u.settings')}</button></div>`, 'narrow', true); $('#goSet').onclick = openSettings; return; }
  const ctl = new AbortController(); UI.abort = ctl;
  showModal(`<h2>${T('u.adjing')}</h2><p class="sub">${T('u.adjing_x')}</p><div class="preview"><div>“${esc(text)}”</div></div><div class="foot"><div class="spinner"></div><button id="adjStop">${T('u.cancel')}</button></div>`, 'narrow', false);
  $('#adjStop').onclick = () => ctl.abort();
  try {
    const o = await LLM.adjudicate(S, text, { tier: UI.tier, signal: ctl.signal });
    showAdj(o, text);
  } catch (e) {
    if (e && e.code === 'cancelled') { closeModal(); return; }
    showModal(`<h2>${T('u.adj_fail')}</h2><p class="sub">${esc(LLM.errText(e))}</p><div class="foot"><button data-close="1">${T('u.close')}</button></div>`, 'narrow', true); renderTop();
  }
}
/* 裁定结果：设定变更 + 成功时的效果 + 失败时的后果 */
function showAdj(o, text) {
  {
    UI.adj = o;
    const ap = clamp(o.ap | 0 || 1, 1, 3), apOk = ap <= W.apLeft(S);
    const cost = clamp(+o.cost || 0, 0, S.actors[S.player].gdp * 0.03);
    showModal(`<h2>${o.feasible === false ? T('u.adj_no') : T('u.adj_res')}</h2>
      <div class="preview"><div class="muted">${T('u.order')}</div><div>“${esc(text)}”</div></div>
      ${o.feasible === false ? `<div class="adj"><b class="bad">${T('u.infeasible')}</b>${esc(o.reason || '')}${o.alternative ? `<div><b>${T('u.alt')}</b>${esc(o.alternative)}</div>` : ''}</div>` : `
      <div class="adj"><div><b>${esc(o.summary || T('u.special'))}</b></div>${setBoxHTML(o)}
        <div class="grid2"><div class="stat"><span>${T('u.apcost')}</span><b>${ap}</b></div><div class="stat"><span>${T('u.cost')}</span><b>${fmtB(cost)}</b></div><div class="stat"><span>${T('u.succ')}</span><b>${pct(clamp(+o.successChance || 0.6, 0.05, 0.95))}</b></div><div class="stat"><span>${T('u.exposure')}</span><b>${pct(clamp(+o.detectionRisk || 0, 0, 1))}</b></div></div>
        <div><span class="muted">${T('u.on_succ')}</span><ul>${o.effects.map(e => `<li>${esc(effText(e))}</li>`).join('') || `<li>${T('u.noeffect')}</li>`}</ul></div>
        ${o.onFailure.length ? `<div><span class="muted">${T('u.on_fail')}</span><ul>${o.onFailure.map(e => `<li>${esc(effText(e))}</li>`).join('')}</ul></div>` : ''}
        ${o.narrative ? `<div class="muted" style="font-size:12.5px">${T('u.expect')}${esc(o.narrative)}</div>` : ''}
      </div>`}
      <div class="foot"><button data-close="1">${o.feasible === false ? T('u.back') : T('u.discard')}</button>${o.feasible === false ? '' : `<button class="btn-primary" id="adjOk" ${apOk ? '' : 'disabled'}>${apOk ? T('u.addq') : T('u.noap')}</button>`}</div>`, 'narrow', true);
    const ok = $('#adjOk'); if (ok) ok.onclick = () => { const r = W.queueCustom(S, Object.assign({}, o, { cost, ap })); if (!r.ok) { toast(TX(r.reason)); return; } $('#cmdText').value = ''; closeModal(); renderTop(); renderQueue(); toast(T('u.cmd_q')); };
  }
}
function setBoxHTML(o) {
  const sp = W.previewSettings(S, o.settings || []);
  if (!sp.length && !o.needsSettings) return `<div class="setbox none"><span class="muted">${T('u.adj.noset')}</span></div>`;
  return `<div class="setbox"><div class="hd">${T('u.adj.set')}</div>${o.settingsWhy ? `<div class="why">${T('u.adj.judge')}${esc(o.settingsWhy)}</div>` : ''}<ul>${sp.map(z => `<li class="${z.bad ? 'bad' : ''}">${esc(TX(z.msg))}</li>`).join('')}</ul>${o.ruleAdded ? `<div class="muted" style="font-size:11.5px">${T('u.adj.rule')}</div>` : ''}</div>`;
}

/* ---------- 外交谈判 ---------- */
async function sendChat() {
  if (window.TX_MP && typeof mpSendChat === 'function') return mpSendChat();
  const X = UI.sel; const ta = $('#chatText'); if (!ta || !X) return; const msg = ta.value.trim(); if (!msg || UI.chatBusy) return;
  const hist = S.chat[X] || (S.chat[X] = []);
  hist.push({ role: 'me', text: msg }); UI.chatBusy = true; renderSide();
  try { const r = await LLM.diplomacy(S, X, hist.slice(0, -1), msg, { tier: UI.tier }); hist.push({ role: 'them', text: r.reply, deal: r.deal }); }
  catch (e) { hist.push({ role: 'them', text: T('u.chat_err', { x: { raw: LLM.errText(e) } }) }); }
  UI.chatBusy = false; renderSide(); renderTop(); autosave();
}
function signDeal(X, i) {
  const m = (S.chat[X] || [])[i]; if (!m || !m.deal || m.signed) return;
  if (W.apLeft(S) < 1) { toast(T('c.ap', { n: 1 })); return; }
  let done;
  if (window.TX_MP) { done = doCmd('applyDeal', [X, m.deal.terms]); if (!done) { toast(T('c.ap', { n: 1 })); return; } } // 联机版：立即生效，行动点记在本回合
  else { done = W.applyDeal(S, X, m.deal.terms); W.queueDone(S, { k: 'u.q.signed', p: { a: X } }, 1); }
  m.signed = true;
  toast(T('u.deal_done', { x: { list: done } }), 5000); renderAll(); autosave();
}

/* ---------- 核打击确认 ---------- */
function confirmNuke(id, t, p) {
  const st = W.actionStatus(S, id, t, p); if (!st.ok) { toast(st.reason); return; }
  showModal(`<h2 class="bad">${T('u.nuke_q')}</h2><p class="sub">${T('u.nuke_tgt', { t, k: T('scope.' + (p.scope || 'tactical')) })} ${esc(st.preview ? TX(st.preview) : '')}</p><div class="preview"><div>${T('u.nuke_warn')}</div></div><div class="foot"><button class="btn-primary" data-close="1">${T('u.cancel')}</button><button id="nukeOk" style="border-color:var(--bad);color:var(--bad)">${T('u.nuke_go')}</button></div>`, 'narrow', true);
  $('#nukeOk').onclick = () => { const r = W.queueAction(S, id, t, Object.assign({}, p)); closeModal(); if (!r.ok) toast(r.reason); renderAll(); };
}

/* ---------- 回合结算 ---------- */
function busy(stepIdx, extra, stopFn) {
  const steps = ['u.step1', useLLM() ? 'u.step2c' : 'u.step2r', 'u.step3', 'u.step4'];
  const b = $('#busy'); b.hidden = false;
  b.innerHTML = `<div class="card"><div style="display:flex;gap:10px;align-items:center"><div class="spinner"></div><b>${T('u.resolving', { x: { raw: dateStr(S) } })}</b></div><div class="steps">${steps.map((s, i) => `<div class="${i < stepIdx ? 'done' : i === stepIdx ? 'on' : ''}">${i < stepIdx ? '✓' : i === stepIdx ? '›' : '·'} ${T(s)}</div>`).join('')}</div>${extra ? `<div class="muted" style="font-size:12.5px" id="busyExtra">${esc(extra)}</div>` : ''}${stopFn ? `<div><button id="busyStop">${T('u.skip_llm')}</button></div>` : ''}</div>`;
  if (stopFn) $('#busyStop').onclick = stopFn;
}
async function endTurn() {
  if (window.TX_MP && typeof mpEndTurn === 'function') return mpEndTurn();
  if (!S || UI.demo) { showStart(); return; }
  if (UI.busy || S.over) { if (S.over) showGameOver(); return; }
  UI.busy = true; $('#btnEnd').disabled = true;
  try {
    busy(0); await new Promise(r => setTimeout(r, 30));
    const R = W.prepareTurn(S);
    let handled = new Set();
    const cands = W.reactionCandidates(S, 10);
    const due = useLLM() ? W.coreDue(S).sort((a, b) => (b.v === S.player) - (a.v === S.player) || b.w - a.w).slice(0, 2) : [];
    const coreJobs = due.map(k => LLM.coreDecide(S, k, { tier: UI.tier }).then(d => { S.coreLLM[k.id] = d; }).catch(() => { }));
    if (useLLM() && cands.length) {
      const ctl = new AbortController(); UI.abort = ctl;
      busy(1, T('u.llm_wait', { x: { raw: cands.map(c => NAME(c.id)).join(sep()) } }), () => ctl.abort());
      try {
        const data = await LLM.reactions(S, cands, { tier: UI.tier, signal: ctl.signal, onText: ({ text }) => { const el = $('#busyExtra'); if (el) el.textContent = T('u.llm_chars', { n: text.length }); } });
        handled = W.applyLLMReactions(S, R, data); R.llmNote = 'claude';
      } catch (e) { R.llmNote = e && e.code === 'cancelled' ? 'skipped' : 'error'; R.llmErr = LLM.errMsg(e); }
    } else { busy(1); R.llmNote = useLLM() ? 'none' : 'rules'; await new Promise(r => setTimeout(r, 120)); }
    if (coreJobs.length) { busy(1, T('u.core_wait', { x: { list: due.map(k => ({ id: k.o })) } })); await Promise.all(coreJobs); }
    W.ruleReactions(S, R, handled);
    busy(2); await new Promise(r => setTimeout(r, 60));
    const rep = W.finishTurn(S);
    busy(3);
    autosave();
    $('#busy').hidden = true;
    renderAll();
    showReport(rep);
    refreshPlans();
  } catch (err) {
    console.error(err); $('#busy').hidden = true; toast(T('u.turn_err', { x: { raw: (err && err.message) || String(err) } }), 6000);
  } finally { UI.busy = false; $('#btnEnd').disabled = false; }
}
/* Claude 为主要大国制定/修订年度战略（后台进行，不阻塞游戏） */
async function refreshPlans() {
  if (window.TX_MP) return; // 联机版：由房主为“Claude 智能体”国家修订战略（mpRefreshPlans）
  if (!useLLM() || UI.planBusy || !S || S.over) return;
  const S0 = S; const list = W.planTargets(S0, 2); if (!list.length) return;
  UI.planBusy = true;
  try {
    for (const X of list) {
      try { const p = await LLM.plan(S0, X, { tier: UI.tier === 'complex' ? 'default' : UI.tier }); if (S === S0 && W.applyPlan(S0, X, p)) { S0.intelLog.push({ turn: S0.turn, msg: { k: 'u.plan_new', p: { a: X } }, tone: 'info', about: [X] }); if (UI.tab === 'intel' || UI.sel === X) renderSide(); autosave(); } }
      catch (e) { if (e && ['not_granted', 'sampling_disabled'].includes(e.code)) break; }
    }
  } finally { UI.planBusy = false; }
}
function linesHTML(arr) { return `<div class="lines">${arr.map(a => `<div class="${a.tone || 'info'}">${esc(TX(a.msg))}</div>`).join('')}</div>`; }
function showReport(R) {
  const e = R.econ;
  const eng = { claude: T('u.eng_claude'), skipped: T('u.eng_skipped'), error: T('u.eng_error', { x: { raw: esc(TX(R.llmErr) || '') } }), none: T('u.eng_none'), rules: T('u.eng_rules') }[R.llmNote] || T('u.eng_rules');
  let h = `<h1>${T('u.brief', { x: { raw: I18N.date(R.y, R.q) } })}</h1><p class="sub">${T('u.engine_is', { x: { raw: eng } })}</p>`;
  if (e) {
    const fd = k => delta(e.fac[0][k], e.fac[1][k], v => v.toFixed(0));
    h += `<div class="rep-kpis">
    <div><span>GDP</span><b>${fmtB(e.gdp[1])}</b> ${delta(e.gdp[0], e.gdp[1], v => fmtB(v))}</div>
    <div><span>${T('u.k.growth')}</span><b>${(e.growth * 4).toFixed(1)}%</b></div>
    <div><span>${T('u.power')}</span><b>${fmtN(e.mil[1])}</b> ${delta(e.mil[0], e.mil[1], v => fmtN(v))}</div>
    <div><span>${T('u.stab')}</span><b>${Math.round(e.stab[1])}</b> ${delta(e.stab[0], e.stab[1], v => v.toFixed(0))}</div>
    <div><span>${T('fac.pub')}</span><b>${Math.round(e.fac[1].pub)}</b> ${fd('pub')}</div>
    <div><span>${T('fac.mil')}</span><b>${Math.round(e.fac[1].mil)}</b> ${fd('mil')}</div>
    <div><span>${T('fac.biz')}</span><b>${Math.round(e.fac[1].biz)}</b> ${fd('biz')}</div>
    <div><span>${T('rep.trust')}</span><b>${Math.round(e.rep[1].trust)}</b> ${delta(e.rep[0].trust, e.rep[1].trust, v => v.toFixed(0))}</div></div>`;
  }
  const sec = (title, body) => `<div class="rep-sec"><h3>${title}</h3>${body}</div>`;
  if (R.notes.length) h += sec(T('u.r.notes'), linesHTML(R.notes));
  if (R.actions.length) h += sec(T('u.r.actions'), linesHTML(R.actions));
  if (R.custom.length) h += sec(T('u.r.custom'), `<div class="list">${R.custom.map(c => `<div class="item"><div class="row"><b>${esc(c.text)}</b><span class="tag ${c.success ? 'blue' : 'red'}">${c.success ? T('u.success') : T('u.failure')}${c.detected === true ? ' · ' + T('u.exposed') : c.detected === false ? ' · ' + T('u.unexposed') : ''}</span></div><div style="font-size:13px;margin-top:4px">${esc(c.narrative || '')}</div>${(c.settings || []).length ? `<div class="setdone"><b>${T('u.r.settings')}</b> ${esc(c.settings.map(x => typeof x === 'string' ? x : TX(x)).join(sep()))}</div>` : ''}${c.effects.length ? `<div class="muted" style="font-size:12px;margin-top:3px">${esc(c.effects.map(x => typeof x === 'string' ? x : TX(x)).join(sep()))}</div>` : ''}</div>`).join('')}</div>`);
  if (R.plan) h += sec(T('u.r.plan'), `<p class="muted" style="font-size:13px;margin:0">“${esc(R.plan)}”</p>`); // 多人局：自己这回合的方针
  if (R.toYou.length) h += sec(T('u.r.toyou'), linesHTML(R.toYou));
  if ((R.cross || []).length) h += sec(T('u.r.cross'), linesHTML(R.cross)); // 多人局：各方策略的交叉影响
  if ((R.pub || []).length) h += sec(T('u.r.pub'), `<div class="list">${R.pub.map(p => `<div class="item" style="font-size:13px"><b>${esc(NAME(p.from))}</b>${EN() ? ': ' : '：'}${esc(p.text)}</div>`).join('')}</div>`);
  if (R.intel.length) h += sec(T('u.r.intel'), linesHTML(R.intel));
  if (R.reactions.length) h += sec(T('u.r.reactions'), `<div class="rx">${R.reactions.map(r => { const c = STANCE_CLS[r.stance] || 'unknown'; return `<div class="rcard s-${c}"><div class="hd"><i style="width:10px;height:10px;border-radius:2px;background:${polColor(r.actor)};display:inline-block"></i><b>${esc(NAME(r.actor))}</b><span class="stance s-${c}">${esc(stanceLabel(r.stance))}</span></div><q>${esc(TX(r.statement))}</q>${r.actions.length ? `<div class="ra">${r.actions.map(a => `<span>${esc(TX(a))}</span>`).join('')}</div>` : ''}${r.reason ? `<div class="why">${T('u.why')}${esc(TX(r.reason))}</div>` : ''}<div class="src">${r.src === 'llm' ? 'CLAUDE' : 'RULE-AI'}</div></div>`; }).join('')}</div>${I18N.has('web.disc_short') ? `<p class="muted disc">${T('web.disc_short')}</p>` : ''}`);
  UI.lastFronts = R.fronts;
  if (R.fronts.length || R.mil.length) h += sec(T('u.r.mil'), `${R.mil.length ? linesHTML(R.mil) : ''}<div class="list" style="margin-top:8px">${R.fronts.map(f => frontHTML(f, false)).join('')}</div>`);
  if (R.pol.length) h += sec(T('u.r.pol'), linesHTML(R.pol));
  const world = R.world.concat(R.events);
  if (world.length || R.headlines.length) h += sec(T('u.r.world'), `${linesHTML(world)}${R.headlines.length ? `<div class="list" style="margin-top:8px">${R.headlines.map(x => `<div class="item" style="font-family:var(--f-display);font-weight:600">${esc(TX(x))}</div>`).join('')}</div>` : ''}`);
  const nU = S.ultis.filter(u => u.status === 'open').length, nC = S.crises.filter(c => !c.resolved).length;
  if (S.inbox.length || nU || nC) h += sec(T('u.r.pending'), `<p>${T('u.pending', { a: nU, b: nC, n: S.inbox.length })} <button id="toInbox">${T('u.goto_diplo')}</button></p>`);
  if (S.over) h += sec(T(S.over.result === 'win' ? 'u.win' : 'u.over'), `<p><b>${esc(TX(S.over.reason))}</b></p>`);
  h += `<div class="foot"><button class="btn-primary" data-close="1">${S.over ? T('u.see_end') : T('u.continue')}</button></div>`;
  showModal(h, 'txrep', true);
  const ib = $('#toInbox'); if (ib) ib.onclick = () => { UI.afterClose = null; closeModal(); UI.tab = 'diplo'; renderSide(); };
  UI.afterClose = () => { if (S.over) showGameOver(); else nextCrisis(); };
}
function showGameOver() {
  const o = S.over; if (!o) return; const h = W.hegemony(S);
  const title = o.result === 'win' ? T('u.win') : o.result === 'apocalypse' ? T('u.apoc') : o.result === 'end' ? T('gl.end_t') : T('u.lose');
  const board = typeof glBoardHTML === 'function' && typeof glOn === 'function' && glOn() ? `<h3 style="margin-top:12px">🏆 ${T('gl.final')}</h3>${glBoardHTML(true)}` : ''; // 联机版：最终排名
  showModal(`<h1 class="${o.result === 'win' || o.result === 'end' ? 'good' : 'bad'}">${title}</h1><p class="sub">${esc(TX(o.reason))}</p>${board}<div class="rep-kpis"><div><span>${T('u.lasted')}</span><b>${T('u.turnsN', { n: S.turn })}</b></div><div><span>${T('u.gshare_s')}</span><b>${pct(h.gdpShare, 1)}</b></div><div><span>${T('u.mshare_s')}</span><b>${pct(h.milShare, 1)}</b></div><div><span>${T('u.units_s')}</span><b>${h.units}</b></div></div><div class="foot"><button data-close="1">${T('u.keep_look')}</button><button class="btn-primary" id="goNew">${T('u.newgame')}</button></div>`, 'narrow', true);
  $('#goNew').onclick = () => showStart();
}

/* ---------- 弹窗 ---------- */
function showModal(html, cls = '', closable = true) { const m = $('#modal'); $('#sheet').className = 'sheet ' + cls; $('#sheet').innerHTML = html; m.hidden = false; UI.modalClosable = closable; $('#sheet').scrollTop = 0; }
function closeModal() { $('#modal').classList.remove('opaque'); $('#modal').hidden = true; const f = UI.afterClose; UI.afterClose = null; if (f) f(); if (typeof lyrOnModalClose === 'function') lyrOnModalClose(); } // 弹窗关掉后补播开战动画
$('#modal').addEventListener('click', e => { if (e.target.dataset.close) closeModal(); else if (e.target.id === 'modal' && UI.modalClosable) closeModal(); });
