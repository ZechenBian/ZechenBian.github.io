/* ===================== 新版 · 统一输入框（底部，唯一要打字的地方；危机卡里的自由回答除外） =====================
 * 发送前选一种：执行（一句话命令）、方针（本回合打算，只交给推演）、公开（所有人可见；勾“正式表态”就成了公开谴责、警告或核威慑，1 点）、
 * 对某国（AI 国家就是谈判，真人就是端到端加密的私信）。回车发送，Shift+回车换行。
 * “执行”先对应标准操作：对应得上的按那项操作的规则（花费、生效时间、效果与点按钮相同），需要选择的打开对应的地方并预填好；
 * 对应不上（或一句话里有好几件事）才交给 AI 换算成各国数据的变化（1–3 点）；没接 AI 时只执行能对应上的。 */
function v2UbInject() {
  const f = $('#cmdForm'); if (!f || $('#ubModes')) return;
  f.classList.add('v2cmd'); $('#cmdBtn').removeAttribute('data-i18n'); $('#cmdText').removeAttribute('data-i18n-ph'); // 按钮文字与提示随发送方式变化（v2UbRender）
  f.insertAdjacentHTML('afterbegin', `<div class="ubm" id="ubModes"><span class="seg mini ubseg">${['exec', 'plan', 'pub', 'to'].map(m => `<button type="button" data-ub="${m}">${esc(T('v2.ub.' + m))}</button>`).join('')}</span><select id="ubTo" hidden></select><label class="ubformal" hidden><input type="checkbox" id="ubFormal"> <span id="ubFormalT"></span></label><small class="muted" id="ubHint"></small></div>`);
  $('#cmdText').addEventListener('keydown', e => { if (!v2On()) return; if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.isComposing) { e.preventDefault(); adjudicate(); } });
  f.addEventListener('click', e => { const b = e.target.closest('[data-ub]'); if (!b) return; e.preventDefault(); const m = b.dataset.ub; v2UbSet(m, m === 'to' ? UI.ub.to || v2UbDefTo() : undefined); });
  f.addEventListener('change', e => { if (e.target.id === 'ubTo') { UI.ub.to = e.target.value || null; v2UbRender(); } if (e.target.id === 'ubFormal') { UI.ub.formal = e.target.checked; v2UbRender(); } });
}
const v2UbDefTo = () => (UI.sel && v2CanTalk(UI.sel) ? UI.sel : null);
function v2UbSet(mode, to, text) {
  if (!['exec', 'plan', 'pub', 'to'].includes(mode)) mode = 'exec';
  if (mode === 'plan' && !mpPlanOn()) mode = 'exec';
  UI.ub.mode = mode; if (mode === 'to' && to !== undefined) UI.ub.to = to && v2CanTalk(to) ? to : UI.ub.to;
  v2UbRender();
  const ta = $('#cmdText'); if (ta && text !== undefined) { ta.value = text; try { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) { } }
}
function v2UbRender() {
  const box = $('#ubModes'); if (!box || !S) return;
  if (UI.ub.mode === 'plan' && !mpPlanOn()) UI.ub.mode = 'exec';
  const m = UI.ub.mode, P = S.player;
  $$('#ubModes [data-ub]').forEach(b => { b.classList.toggle('on', b.dataset.ub === m); b.textContent = T('v2.ub.' + b.dataset.ub); if (b.dataset.ub === 'plan') b.hidden = !mpPlanOn(); });
  const sel = $('#ubTo'); sel.hidden = m !== 'to';
  if (m === 'to') {
    const hum = (S.humans || []).filter(C => C !== P && v2CanTalk(C)), ai = UI.demo || !MPS.on ? [] : mpRelevant().slice(0, 40);
    if (UI.ub.to && !hum.includes(UI.ub.to) && !ai.includes(UI.ub.to) && v2CanTalk(UI.ub.to)) ai.unshift(UI.ub.to);
    const opt = C => `<option value="${C}" ${C === UI.ub.to ? 'selected' : ''}>${esc(NAME(C))}</option>`;
    const html = `<option value="">${esc(T('v2.ub.pick'))}</option>${hum.length ? `<optgroup label="${esc(T('mp.c.players'))}">${hum.map(opt).join('')}</optgroup>` : ''}<optgroup label="${esc(T('mp.c.agents'))}">${ai.map(opt).join('')}</optgroup>`;
    if (sel.dataset.k !== html) { sel.innerHTML = html; sel.dataset.k = html; }
    sel.value = UI.ub.to || '';
  }
  const fl = $('#ubModes .ubformal'); fl.hidden = m !== 'pub'; $('#ubFormal').checked = !!UI.ub.formal; $('#ubFormalT').textContent = T('v2.ub.formal');
  const to = UI.ub.to, human = to && W.isHuman(S, to);
  $('#ubHint').textContent = T('v2.ub.h_' + m + (m === 'to' && to ? (human ? '_h' : '_ai') : ''), { a: to ? NAME(to) : '' });
  const ta = $('#cmdText'); ta.setAttribute('placeholder', T('v2.ub.ph_' + m + (m === 'pub' && UI.ub.formal ? '_f' : ''), { a: to ? NAME(to) : '' }));
  const btn = $('#cmdBtn'); btn.textContent = T('v2.ub.btn_' + m);
}
/* 底部按钮、回车、Ctrl+回车都走这里（adjudicate → mpCommand） */
async function mpCommand() {
  if (!S) return;
  if (UI.demo || !MPS.on) { mpShowStart(); return; }
  if (mpNet() && !MPS.seat) { toast(T('mp.e.spectator')); return; }
  const ta = $('#cmdText'), text = (ta.value || '').trim(); if (!text) return;
  const m = UI.ub.mode;
  if (m === 'plan') { mpPlanSet(text); ta.value = ''; renderQueue(); toast(T(mpPlanGet() ? 'mp.plan_saved' : 'mp.plan_cleared')); return; }
  if (m === 'pub') return v2Public(text);
  if (m === 'to') return v2SendTo(UI.ub.to, text);
  return v2Exec(text);
}
async function mpSendChat(text) { // 旧入口（Ctrl+回车之外的地方）：发给当前对话
  const t = typeof text === 'string' ? text : ($('#cmdText').value || '').trim(); if (!t || !MPS.thread) return;
  const [k, C] = MPS.thread.split(':'); if (k === 'P') return v2PubPost(t); return v2SendTo(C, t);
}

/* ---------- 对某国：AI 国家谈判 / 真人私信 ---------- */
async function v2SendTo(X, text) {
  if (!X || !v2CanTalk(X)) { toast(T('v2.ub.pick')); v2UbSet('to'); return; }
  const ta = $('#cmdText');
  MPS.thread = (W.isHuman(S, X) ? 'H:' : 'A:') + X; MPS.seen[MPS.thread] = Date.now(); UI.tab = 'diplo';
  if (W.isHuman(S, X)) { ta.value = ''; const ok = await mpSendHuman(X, text); if (!ok) ta.value = text; renderSide(); v2ChatBottom(); return; }
  if (MPS.chatBusy) { toast(T('u.thinking')); return; }
  ta.value = '';
  const ag = mpAgentOf(X), hist = mpAgentHist(X);
  hist.push({ role: 'me', text, at: Date.now() }); MPS.chatBusy = X; renderSide(); v2ChatBottom();
  try {
    if (ag === 'claude' && useLLM()) { const r = await LLM.diplomacy(S, X, hist.slice(0, -1), text, { tier: UI.tier }); hist.push({ role: 'them', text: r.reply, deal: r.deal, at: Date.now() }); }
    else if (ag === 'ext' && mpNet()) { mpSendHuman(X, text); hist.push({ role: 'them', text: T('mp.c.ext_fwd'), at: Date.now(), src: 'sys' }); }
    else { const r = mpRuleAgent(S, X, text); hist.push({ role: 'them', text: r.reply, deal: r.deal, at: Date.now(), src: 'rule' }); }
  } catch (e) { hist.push({ role: 'them', text: T('u.chat_err', { x: { raw: LLM.errText(e) } }), at: Date.now() }); }
  MPS.chatBusy = false; mpSavePriv(); renderSide(); renderTop(); v2ChatBottom();
}
const v2ChatBottom = () => { const c = $('#mpChat'); if (c) c.scrollTop = c.scrollHeight; };

/* ---------- 公开：喊话；勾“正式表态”就是一项行动（谴责、警告或核威慑，1 点） ---------- */
async function v2PubPost(text) {
  const ta = $('#cmdText'); ta.value = '';
  const ok = await mpSendHuman('*', text); if (!ok) { ta.value = text; return false; }
  MPS.thread = (S.humans || []).length > 1 ? 'P:*' : MPS.thread; toast(T('v2.ub.posted')); if (UI.tab === 'diplo') renderSide(); v2ChatBottom(); return true;
}
function v2Public(text) {
  if (!UI.ub.formal) return v2PubPost(text);
  const P = S.player, cs = v2Mentioned(text).filter(c => c !== P && S.actors[c] && !W.isNeutral(S, c) && !W.provOf(S, c));
  const f = v2F('stmt'); let X = cs[0] || (UI.sel && UI.sel !== P ? UI.sel : null); let kind = /核/.test(text) || /nuclear/i.test(text) ? 'threat' : /警告|warn/i.test(text) ? 'warn' : 'condemn', about = cs[1] || null;
  const draw = () => {
    const tg = W.IDS.filter(c => c !== P && S.actors[c] && W.indep(S, c) && !W.isNeutral(S, c)).sort((a, b) => (cs.includes(b) - cs.includes(a)) || W.power(S, b) - W.power(S, a));
    if (!X || !tg.includes(X)) X = tg[0];
    const abouts = kind === 'warn' ? W.dynOptions(S, 'warn', 'about', X) : []; if (kind === 'warn' && !abouts.includes(about)) about = abouts[0] || null;
    const p = kind === 'warn' ? { about, conseq: f.conseq || 'war' } : {}, st = W.actionStatus(S, kind, X, p);
    showModal(`<h2>${T('v2.formal.h')}</h2><div class="preview"><div class="muted">${T('v2.formal.say')}</div><div>“${esc(text)}”</div></div>
      <div class="radio">${['condemn', 'warn', 'threat'].map(k => `<label><input type="radio" name="v2fk" value="${k}" ${k === kind ? 'checked' : ''}><span>${T('a.' + k)}<small>${T('a.' + k + '.d')}</small></span></label>`).join('')}</div>
      <div class="prm v2fprm"><label>${T('v2.formal.to')}<select id="v2fX">${tg.map(c => `<option value="${c}" ${c === X ? 'selected' : ''}>${esc(NAME(c))}</option>`).join('')}</select></label>${kind === 'warn' ? `<label>${T('pk.about')}<select id="v2fA">${abouts.map(c => `<option value="${c}" ${c === about ? 'selected' : ''}>${esc(NAME(c))}</option>`).join('')}</select></label><label>${T('pk.conseq')}<select id="v2fC">${['war', 'sanction'].map(o => `<option value="${o}" ${(f.conseq || 'war') === o ? 'selected' : ''}>${T('wc.' + o)}</option>`).join('')}</select></label>` : ''}</div>
      <div class="adj"><div class="${st.ok ? '' : 'bad'}">${esc(st.ok ? (st.preview ? TX(st.preview) : '') : TX(st.reason))}</div><div class="muted" style="font-size:12px">${T('v2.formal.x')}</div></div>
      <div class="foot"><button data-close="1">${T('u.cancel')}</button><button id="v2fPlain">${T('v2.formal.plain')}</button><button class="btn-primary" id="v2fGo" ${st.ok ? '' : 'disabled'}>${T('v2.formal.go', { n: W.apCost(S, kind, X, p) })}</button></div>`, 'narrow', true);
    $$('#sheet input[name=v2fk]').forEach(r => (r.onchange = () => { kind = r.value; draw(); }));
    $('#v2fX').onchange = e => { X = e.target.value; draw(); };
    const a = $('#v2fA'); if (a) a.onchange = e => { about = e.target.value; draw(); };
    const c = $('#v2fC'); if (c) c.onchange = e => { f.conseq = e.target.value; draw(); };
    $('#v2fPlain').onclick = () => { closeModal(); v2PubPost(text); };
    $('#v2fGo').onclick = async () => { const r = W.queueAction(S, kind, X, Object.assign({}, p)); if (!r.ok) { toast(r.reason); return; } closeModal(); UI.ub.formal = false; v2UbRender(); renderTop(); renderQueue(); await v2PubPost(text); toast(T('u.queued', { x: { raw: v2QLabel(S.queue[S.queue.length - 1]) } })); };
  };
  draw();
}

/* ---------- 执行：先对应标准操作 ---------- */
const V2_KW = [
  ['deal', 'nap', /互不侵犯|non-?aggression/i], ['deal', 'ceasefire', /停火|休战|ceasefire|truce/i], ['deal', 'peace', /议和|媾和|和谈|讲和|和约|make peace|peace (deal|treaty)/i],
  ['deal', 'alliance', /结盟|同盟|盟约|alliance|ally with/i], ['deal', 'trade', /自贸|自由贸易|贸易协定|通商条约|free.trade|trade (deal|agreement|pact)/i],
  ['deal', 'access', /驻军协定|驻军权|过境权|military access|basing rights/i], ['deal', 'armsctl', /军控|裁军|arms control/i],
  ['deal', 'vassal', /臣服|附庸国|保护国|vassal|protectorate/i], ['deal', 'send_troops', /请.{0,8}(出兵|派兵)|ask .{0,16}(to send troops|for troops)/i], ['deal', 'mobilize', /请.{0,8}(扩军|动员)|ask .{0,16}to mobili[sz]e/i],
  ['form', 'stmt', 'threat', /核威慑|核威胁|nuclear threat|threaten .{0,12}nuclear/i], ['form', 'strike', 'nuke', /核打击|核攻击|动用核武|使用核武|nuclear strike|\bnuke\b/i],
  ['form', 'stmt', 'condemn', /谴责|condemn/i], ['form', 'stmt', 'warn', /警告|warn/i],
  ['form', 'strike', 'strike', /精确打击|空袭|导弹打击|轰炸|air ?strike|missile strike|bomb/i],
  ['form', 'sanc', 'lift', /(解除|取消|撤销).{0,8}制裁|lift .{0,12}sanctions?/i], ['form', 'sanc', 'finsanction', /金融制裁|financial sanctions?/i], ['form', 'sanc', 'techban', /技术封锁|芯片禁令|出口管制|tech(nology)? ban|export controls?/i],
  ['form', 'sanc', 'energy', /能源禁运|石油禁运|(oil|energy) embargo/i], ['form', 'sanc', 'tariff', /关税|tariffs?/i], ['form', 'sanc', 'sanction', /制裁|禁运|sanctions?|embargo/i],
  ['form', 'aid', 'armsaid', /军援|军事援助|武器援助|提供武器|military aid|arms aid|send (arms|weapons)/i], ['form', 'aid', 'loan', /贷款|借款|\bloans?\b/i], ['form', 'aid', 'volunteers', /志愿军|volunteers?/i], ['form', 'aid', 'aid', /援助|资助|经援|economic aid|\baid\b/i],
  ['form', 'press', 'blockade', /海上封锁|封锁|blockade/i], ['form', 'press', 'escort', /护航|escort|convoy/i], ['form', 'press', 'exercise', /军演|演习|military exercises?|show of force/i],
  ['form', 'covert', 'cyber', /网络攻击|黑客|cyber/i], ['form', 'covert', 'propaganda', /舆论战|宣传战|propaganda|disinformation/i], ['form', 'covert', 'coup', /政变|\bcoup\b/i],
  ['form', 'covert', 'opposition', /反对派|opposition/i], ['form', 'covert', 'sabotage', /破坏行动|搞破坏|sabotage/i], ['form', 'covert', 'espionage', /窃取.{0,4}技术|技术窃取|间谍|espionage|steal .{0,8}tech/i],
  ['form', 'covert', 'fabricate', /开战理由|开战借口|false flag|casus belli|pretext/i], ['form', 'covert', 'fund_resist', /抵抗运动|资助抵抗|resistance movement|fund .{0,10}resistance/i], ['form', 'covert', 'incite', /煽动.{0,4}独立|策动独立|incite/i],
  ['form', 'terr', 'puppet', /傀儡|puppet/i], ['form', 'terr', 'pacify', /安抚|pacify/i], ['form', 'terr', 'release', /恢复.{0,4}独立|给予.{0,4}独立|释放|release|grant independence/i], ['form', 'terr', 'annex', /吞并|并入|annex/i],
  ['summit', '', '', /首脑会晤|峰会|会晤|summit/i],
  ['war', '', '', /进攻|入侵|攻打|开战|宣战|invade|attack|declare war/i],
  ['self', 'dom', 'crackdown', /镇压|强力维稳|戒严|crack ?down|martial law/i], ['self', 'dom', 'stab', /维稳|民生|社会稳定|stabili[sz]/i], ['self', 'dom', 'stimulus', /经济刺激|刺激经济|stimulus/i],
  ['self', 'dom', 'research', /科研|研发|科技投入|research|r&d/i], ['self', 'dom', 'intel', /情报建设|情报能力|intelligence (service|capabilit)/i], ['self', 'dom', 'investigate', /溯源|调查|investigat/i],
  ['self', 'dom', 'cbm', /互信|透明措施|confidence.building/i], ['self', 'dom', 'nukeprog', /核计划|核武器计划|扩充核武|nuclear (program|programme|arsenal)/i],
  ['mob', 'conscript', '', /征兵|征召|招募|conscript|draft/i], ['mob', 'procure', '', /订单|采购|订购|(造|生产|购买|买).{0,6}(坦克|飞机|战机|军舰|舰艇|潜艇)|procure|(build|order) .{0,12}(tanks|planes|aircraft|ships|warships)/i],
  ['move', '', '', /调兵|调往|部署到|调.{0,6}(部队|兵力|军队|万人|千人|个师|舰队|飞机).{0,10}(去|到|往)|redeploy|deploy .{0,16}(troops|forces) to|move .{0,16}(troops|forces)/i],
];
/* 句子里提到的国家，按出现的先后 */
function v2Mentioned(text) {
  const t = String(text || ''), up = t.toUpperCase(), out = [];
  for (const id of LLM.mentioned(S, t)) {
    const d = DEF[id]; const ps = [t.indexOf(d.name), up.indexOf(String(d.en || '').toUpperCase()), d.voice ? t.indexOf(d.voice) : -1, up.indexOf(id)].filter(i => i >= 0);
    out.push([id, ps.length ? Math.min(...ps) : 999]);
  }
  return out.sort((a, b) => a[1] - b[1]).map(z => z[0]);
}
/* 句子里的金额（十亿美元）：“50 亿”“3.5 billion”“$20bn” */
function v2Money(t) {
  const m = String(t).match(/(\d+(?:\.\d+)?)\s*(万亿|千亿|亿|billion|bn|b\b|trillion|tn)/i); if (!m) return null;
  const v = +m[1], u = m[2].toLowerCase();
  return u === '万亿' || u === 'trillion' || u === 'tn' ? v * 1000 : u === '千亿' ? v * 100 : u === '亿' ? v / 10 : v;
}
/* 句子里的人数（千人）：“30 万人”“5 千人”“200,000 troops” */
function v2People(t) {
  const s = String(t).replace(/,/g, ''), m = s.match(/(\d+(?:\.\d+)?)\s*(万|千)/); if (m) return +m[1] * (m[2] === '万' ? 10 : 1);
  const e = s.match(/(\d{4,})\s*(troops|men|soldiers|recruits)/i); return e ? +e[1] / 1000 : null;
}
function v2Route(text) {
  const P = S.player, t = String(text || '').trim(); if (!t) return null;
  const long = /[一-鿿]/.test(t) ? t.length > 40 : t.length > 140;
  const rs = W.ruleSettings(S, t), we = mpRulePatch(t).we;
  let rest = t; const hits = [];
  for (const k of V2_KW) { const re = k[k.length - 1], m = rest.match(re); if (m) { hits.push(k); rest = rest.slice(0, m.index) + ' '.repeat(m[0].length) + rest.slice(m.index + m[0].length); } }
  if (long) return null;
  const stdOk = rs.every(z => ['budget', 'mob', 'mix'].includes(z.type));
  if (!hits.length) return (rs.length || we.length) && stdOk ? { kind: 'std', rs, we } : null;
  if (rs.length || we.length) return null; // 设定变更与行动混在一句里：交给 AI
  const kinds = new Set(hits.map(h => (h[0] === 'form' || h[0] === 'self' ? h[0] + ':' + h[1] : h[0])));
  if (kinds.size > 1) return null;
  const cs = v2Mentioned(t).filter(c => c !== P), h0 = hits[0], X = cs[0] || null;
  switch (h0[0]) {
    case 'form': { if (!X) return null; const ids = hits.map(h => h[2]); return { kind: 'form', g: h0[1], ids, X, about: cs[1] || null, amt: v2Money(t) }; }
    case 'self': return { kind: 'form', g: 'dom', ids: hits.map(h => h[2]), X: P, amt: v2Money(t) };
    case 'deal': return X ? { kind: 'deal', X, codes: hits.map(h => h[1]) } : null;
    case 'summit': return X && cs.length === 1 ? { kind: 'summit', X } : null;
    case 'war': return X && cs.length === 1 ? { kind: 'war', X } : null;
    case 'mob': return { kind: 'mob', what: h0[1], n: v2People(t), amt: v2Money(t), br: /飞机|战机|空军|aircraft|planes|air/i.test(t) ? 'air' : /军舰|舰艇|潜艇|海军|ships|navy|naval/i.test(t) ? 'navy' : /坦克|陆军|tanks|army/i.test(t) ? 'land' : null };
    case 'move': return { kind: 'move', X: cs[cs.length - 1] || null };
  }
  return null;
}
async function v2Exec(text) {
  const r = v2Route(text);
  if (r) return v2Go(r, text);
  if (useLLM()) return v2Patch(text);
  showModal(`<h2>${T('mp.cmd_nollm')}</h2><p class="sub">${T('v2.nollm_x')}</p><div class="foot"><button data-close="1">${T('u.ok')}</button><button class="btn-primary" id="goSet">${T('u.settings')}</button></div>`, 'narrow', true); $('#goSet').onclick = openSettings;
}
async function v2Patch(text) { // 对应不上标准操作：AI 换算成各国数据的变化（旧版的一句话命令）
  const ctl = new AbortController(); UI.abort = ctl;
  showModal(`<h2>${T('mp.cmd_ing')}</h2><p class="sub">${T('mp.cmd_ing_x')}</p><div class="preview"><div>“${esc(text)}”</div></div><div class="foot"><div class="spinner"></div><button id="adjStop">${T('u.cancel')}</button></div>`, 'narrow', false);
  $('#adjStop').onclick = () => ctl.abort();
  try { const raw = await LLMX.patch(S, text, { tier: UI.tier, signal: ctl.signal, both: mpMixed() }); mpShowPatch(raw); }
  catch (e) { if (e && e.code === 'cancelled') { closeModal(); return; } showModal(`<h2>${T('u.adj_fail')}</h2><p class="sub">${esc(LLM.errText(e))}</p><div class="foot"><button data-close="1">${T('u.close')}</button></div>`, 'narrow', true); }
}
function v2Go(r, text) {
  const P = S.player, ta = $('#cmdText');
  if (r.kind === 'deal') { ta.value = ''; v2Talk(r.X, r.codes.map(code => ({ code }))); toast(T('v2.go.deal', { a: r.X })); return; }
  if (r.kind === 'war') { ta.value = ''; const f = S.fronts.find(z => z.target === r.X && z.att === P); openWarMap(f ? f.id : 'T:' + r.X); return; }
  if (r.kind === 'move') { ta.value = ''; if (r.X && W.canStation(S, P, r.X)) UI.move.to = r.X; UI.tab = 'mil'; renderSide(); const el = $('#tabbody .movebox'); if (el) try { el.scrollIntoView({ block: 'center' }); } catch (e) { } toast(T('v2.go.move')); return; }
  if (r.kind === 'mob') {
    const f = v2F('mob'); if (r.what === 'conscript' && r.n > 0) f.cn = Math.round(r.n); if (r.what === 'procure') { if (r.amt > 0) f.pa = r.amt; if (r.br) f.br = r.br; }
    ta.value = ''; UI.tab = 'weco'; renderSide(); toast(T('v2.go.mob')); return;
  }
  if (r.kind === 'summit') return v2StdConfirm(text, [{ id: 'summit', X: r.X, p: {} }]);
  if (r.kind === 'std') return v2StdSettings(text, r);
  // 合并表单里的行动
  const g = r.g, d = V2G[g], X = r.X;
  if (d.one || r.ids.includes('lift')) {
    let id = r.ids.find(i => d.items.includes(i) || i === 'lift') || d.items[0];
    if (id === 'annex' && S.actors[X].overlord === P) id = 'integrate'; // 对附庸说“吞并”就是吞并附庸
    if (id === 'warn') { const f = v2F('stmt', X); f.pick = 'warn'; if (r.about) f.about = r.about; }
    const p = id === 'lift' ? {} : v2OneParams(g, id, X, (() => { const f = v2F(g, X); f.pick = id; if (id === 'warn' && r.about) f.about = r.about; return f; })());
    return v2StdConfirm(text, [{ id, X, p, g }]);
  }
  const f = v2F(g, X); f.on = {};
  for (const id of r.ids) { const k = id === 'crackdown' ? 'stab' : id; if (d.items.includes(k)) f.on[k] = true; if (id === 'crackdown') f.stab = 'hard'; if (id === 'stab') f.stab = 'soft'; if (r.amt > 0 && V2_AMT[id]) f.amt[id] = r.amt; }
  const items = v2PkgItems(g, X); if (!items.length) { v2OpenForm(X, g); return; }
  return v2StdConfirmPkg(text, g, X, items);
}
/* “这是标准操作”：一项行动的确认（与点按钮完全相同） */
function v2StdConfirm(text, list) {
  const z = list[0], st = W.actionStatus(S, z.id, z.X, z.p), a = W.ACT[z.id];
  const lab = T('a.' + z.id) + (a.self ? '' : ' → ' + NAME(z.X));
  showModal(`<h2>${T('v2.std.h')}</h2><div class="preview"><div class="muted">${T('u.order')}</div><div>“${esc(text)}”</div></div>
    <div class="adj"><div><b>${esc(lab)}</b></div><div class="${st.ok ? '' : 'bad'}">${esc(st.ok ? (st.preview ? TX(st.preview) : '') : TX(st.reason))}</div>
    <div class="grid2"><div class="stat"><span>${T('u.apcost')}</span><b>${W.RULES3 ? T('u.apn', { n: W.apCost(S, z.id, z.X, z.p) }) : a.ap}</b></div><div class="stat"><span>${T('u.cost')}</span><b>${fmtB(st.cost || 0)}</b></div></div><div class="muted" style="font-size:12px">${T('v2.std.x')}</div></div>
    <div class="foot">${z.g ? `<button id="v2sEdit">${T('v2.std.edit')}</button>` : ''}<button data-close="1">${T('u.cancel')}</button><button class="${a.danger ? '' : 'btn-primary'}" id="v2sOk" ${st.ok ? '' : 'disabled'}>${a.danger ? '⚠ ' : ''}${T('u.addq')}</button></div>`, 'narrow', true);
  const ed = $('#v2sEdit'); if (ed) ed.onclick = () => { closeModal(); $('#cmdText').value = ''; v2OpenForm(z.X, z.g, { pick: z.id }); };
  $('#v2sOk').onclick = () => { closeModal(); if (a.danger) { confirmNuke(z.id, z.X, z.p); $('#cmdText').value = ''; return; } const r = W.queueAction(S, z.id, z.X, Object.assign({}, z.p)); if (!r.ok) { toast(r.reason); return; } $('#cmdText').value = ''; toast(T('u.queued', { x: { raw: v2QLabel(S.queue[S.queue.length - 1]) } })); renderTop(); renderSide(); renderQueue(); renderMap(); };
}
function v2StdConfirmPkg(text, g, X, items) {
  const tgt = g === 'dom' ? S.player : X, r = W.pkgRange(S, items, tgt), ai = r.n > 1 && useLLM();
  const bad = items.map(it => [it, W.actionStatus(S, it.id, W.ACT[it.id].self ? S.player : tgt, it.p, { noAP: true })]).filter(z => !z[1].ok);
  showModal(`<h2>${T('v2.std.h')}</h2><div class="preview"><div class="muted">${T('u.order')}</div><div>“${esc(text)}”</div></div>
    <div class="adj"><div><b>${T('v2.g.' + g)}${tgt !== S.player ? ' → ' + esc(NAME(tgt)) : ''}</b></div><ul>${items.map(it => `<li>${esc(v2ItemShort({ type: it.id, params: it.p, cost: v2ItemCost(it, tgt) }))}</li>`).join('')}</ul>
    ${bad.length ? `<div class="bad">${bad.map(([it, st]) => esc(T('v2.i.' + it.id) + colonT() + TX(st.reason))).join('<br>')}</div>` : ''}
    <div>${r.n > 1 ? (ai ? T('v2.sum.ai', { e: r.est, a: r.lo, b: r.hi }) : T('v2.sum.rule', { e: r.est })) : T('u.apn', { n: r.est })}${r.money > 0 ? ' · ' + fmtB(r.money) : ''}</div><div class="muted" style="font-size:12px">${T('v2.std.x')}</div></div>
    <div class="foot"><button id="v2sEdit">${T('v2.std.edit')}</button><button data-close="1">${T('u.cancel')}</button><button class="btn-primary" id="v2sOk" ${bad.length ? 'disabled' : ''}>${ai ? T('v2.go.ai') : T('u.addq')}</button></div>`, 'narrow', true);
  $('#v2sEdit').onclick = () => { closeModal(); $('#cmdText').value = ''; v2OpenForm(tgt, g); };
  $('#v2sOk').onclick = () => { closeModal(); $('#cmdText').value = ''; if (ai) v2QueuePkg(g, tgt); else v2DoQueuePkg(g, tgt, items, r.est); };
}
/* 军费、投入方向、动员等级、战时政策：确认后立即生效（军费、方向、政策免费；提高动员 1 点） */
function v2StdSettings(text, r) {
  const P = S.player, x = S.actors[P], ops = [];
  let mob = null;
  for (const z of r.rs) { if (z.type === 'budget') ops.push({ op: 'setMil', args: [z.pct], msg: TX({ k: 'st.budget', p: { a: +x.milPct.toFixed(1), b: z.pct } }) }); if (z.type === 'mix') ops.push({ op: 'setMix', args: [[z.land, z.navy, z.air], 'custom'], msg: TX({ k: 'st.mix', p: { a: Math.round(z.land * 100), b: Math.round(z.navy * 100), c: Math.round(z.air * 100) } }) }); if (z.type === 'mob') mob = Math.max(mob ?? 0, z.level); }
  const tw = /三级|最大|全力|极限|max|all-out/i.test(text) ? 3 : /二级|强化|intensif/i.test(text) ? 2 : 1; // “总体战”默认就是第一级
  for (const z of r.we) { if (z.k === 'total') mob = z.lv ? Math.max(mob ?? 0, 2 + tw) : Math.min(mob ?? 2, 2); else ops.push({ op: 'we', args: [z.k, z.lv], msg: T('we.k.' + z.k) + ' → ' + T('we.lv' + z.lv) }); }
  const cur = W.mobIdx(x), raise = mob !== null && mob > cur;
  if (mob !== null && mob !== cur) ops.push({ op: 'setMob', args: [mob], msg: T('mob6.' + cur) + ' → ' + T('mob6.' + mob) });
  if (!ops.length) { toast(T('st.r.same')); return; }
  const left = W.apLeft(S), need = raise ? W.mobAP(S, cur, mob) : 0, ok = left >= need;
  showModal(`<h2>${T('v2.std.h')}</h2><div class="preview"><div class="muted">${T('u.order')}</div><div>“${esc(text)}”</div></div>
    <div class="adj"><ul>${ops.map(o => `<li>${esc(o.msg)}</li>`).join('')}</ul><div>${raise ? T('v2.std.mob1', { n: need }) : T('v2.std.free')}</div>${ok ? '' : `<div class="bad">${T('c.ap', { n: need })}</div>`}</div>
    <div class="foot"><button data-close="1">${T('u.cancel')}</button><button class="btn-primary" id="v2sOk" ${ok ? '' : 'disabled'}>${T('v2.std.now')}</button></div>`, 'narrow', true);
  $('#v2sOk').onclick = () => { closeModal(); for (const o of ops) doCmd(o.op, o.args); $('#cmdText').value = ''; toast(T('v2.std.done')); renderAll(); };
}
