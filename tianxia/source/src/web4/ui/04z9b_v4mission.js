/* ===================== 网页版 v4 · 单机任务（界面与连续推演） =====================
 * 开局画面多一张“单机任务”卡片 → 任务列表 → 任务说明 → 开始（单人 + 规则智能体；默认不用 AI 推演，最快）。
 * 每回合：先按普通流程结算一个季度（玩家排的行动在这里执行），再只按规则连算剩下的季度（一回合半年 = 2 个季度，一年 = 4 个）；
 * 每个季度结算完都判定目标（TXMIS.check），达成或失败立即结束；出现需要玩家决定的事（危机、通牒、有国家对你开战）就提前停下。
 * 几个季度的战报合并成一份；局势说明（04z9c）按整段时间写。
 * 难度：简单 / 普通 / 困难（目标数值、期限、其他国家 AI 的强硬程度），在任务说明里选；最佳成绩按任务和难度分别存在本机（localStorage 'tianxia4.missions'）。
 * 开局：随机、本周挑战（按任务和日期定下的种子，同一周所有人相同）或输入挑战码（种子的 36 进制写法）；挑战码开局只用规则推演。
 *   结束后的成绩卡写明任务、难度、星级、用时、挑战码和链接（?m=任务&d=难度&s=挑战码，打开就是同一个挑战）。
 * 存档：任务有自己的存档槽（'tianxia4.mission.save'），不覆盖平常对局的本机存档；刷新页面时回到最后玩的那一个。
 * 回到上一回合：每回合推演前记下当时的局面（含本回合排好的行动，'tianxia4.mission.prev'），推演完可以回去改了再推；回退次数记在成绩里。
 * 任务结束后可以继续自由游玩：之后按普通单人对局进行，每回合一个季度（仍然存在任务存档槽里）。 */
const V4M = { ev: null, prev: null, link: null };
const V4M_KEY = 'tianxia4.missions';
const V4M_LSP = window.TX_LSP || 'tianxia4';
const V4M_SAVE = V4M_LSP + '.mission.save', V4M_PREV = V4M_LSP + '.mission.prev', V4M_ACT = V4M_LSP + '.mission.active', V4M_PREF = V4M_LSP + '.mission.diff';
const v4mOf = () => (S && S.mp && S.mp.mission && !UI.demo && typeof TXMIS !== 'undefined' ? S.mp.mission : null);
const v4mDef = M => (M ? TXMIS.get(M.id) : null);
const v4mLive = () => { const M = v4mOf(); return M && !M.done && MPS.mode === 'solo' && MPS.on ? M : null; };
const v4mLS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } return null; };
/* ---------- 成绩（按任务和难度；旧版没有难度的记录算普通） ---------- */
function v4mBest() { try { const o = JSON.parse(localStorage.getItem(V4M_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
const v4mRec = (b, id, d) => b[id + '@' + d] || (d === 1 && b[id] && b[id].s ? b[id] : null);
function v4mSaveBest(M, stars, turns, q) {
  const d = TXMIS.dOf(M), b = v4mBest(), o = v4mRec(b, M.id, d), u = M.undo || 0;
  const better = !o || stars > o.s || (stars === o.s && (o.q == null ? turns < o.n : q < o.q || (q === o.q && u < (o.u || 0))));
  if (better) { b[M.id + '@' + d] = { s: stars, n: turns, q, u, c: v4mCode(M.seed), at: Date.now() }; try { localStorage.setItem(V4M_KEY, JSON.stringify(b)); } catch (e) { } }
  return better;
}
const v4mStars = n => '★'.repeat(Math.max(0, Math.min(3, n | 0))) + '☆'.repeat(3 - Math.max(0, Math.min(3, n | 0)));
const v4mDots = n => '●'.repeat(n) + '○'.repeat(3 - n);
const v4mLen = m => T(m.qpt >= 4 ? 'v4m.len4' : 'v4m.len2');
const v4mUntil = (m, d) => T('v4m.until', { n: { raw: String(TXMIS.untilOf(m, d == null ? 1 : d)[0]) } });
const v4mT = (m, k) => T('v4m.' + m.id + '.' + k);
const v4mC = v => Math.max(0, Math.min(1, v));
const v4mDN = d => T('v4m.d' + d);
const v4mPrefD = () => { const t = v4mLS(V4M_PREF), v = t == null || t === '' ? NaN : +t; return v >= 0 && v <= 2 ? v | 0 : 1; }; // 上次选的难度（没选过就是普通）
/* 日期：剧本的开局季度往后数 */
const v4mStart0 = m => { const s = (W.SCENARIOS && W.SCENARIOS[m.scen]) || {}; return { y: s.year || 2026, q: s.q || 1 }; };
const v4mQAdd = (y, q, n) => { const t = y * 4 + (q - 1) + n; return { y: Math.floor(t / 4), q: (t % 4) + 1 }; };
const v4mQTot = (m, d) => { const s = v4mStart0(m), u = TXMIS.untilOf(m, d); return (u[0] - s.y) * 4 + (u[1] - s.q) + 1; };
function v4mSpan(v) {
  if (v.y0 === v.y1) return v.q0 === v.q1 ? I18N.date(v.y0, v.q0) : EN() ? `Q${v.q0}–Q${v.q1} ${v.y0}` : `${v.y0}年Q${v.q0}–Q${v.q1}`;
  return `${I18N.date(v.y0, v.q0)} – ${I18N.date(v.y1, v.q1)}`;
}
/* ---------- 种子与挑战码 ---------- */
const v4mCode = seed => (seed == null ? '' : (seed >>> 0).toString(36).toUpperCase());
function v4mParse(c) { c = String(c || '').trim().toUpperCase(); if (!/^[0-9A-Z]{1,6}$/.test(c)) return null; const v = parseInt(c, 36) % 2147483648; return v > 0 ? v : null; }
function v4mWeek(now) { // ISO 周（按 UTC，各地同一周）
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); const y = d.getUTCFullYear();
  return { y, w: Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7) };
}
const v4mHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 2147483647) + 1; };
const v4mWeekSeed = (id, wk) => v4mHash(`tianxia4|${id}|${wk.y}-W${wk.w}`);
const v4mWeekTxt = wk => T('v4m.week', { y: { raw: String(wk.y) }, n: wk.w });
/* ---------- 目标的进度文字与进度条 ---------- */
function v4mFmt(g) {
  if (g.cur == null || !g.fmt) return '';
  const r = v => ({ raw: String(v) });
  switch (g.fmt) {
    case 'x': return T('v4m.f.x', { a: r((+g.cur).toFixed(2)), b: r(g.tgt) });
    case 'n': return T('v4m.f.n', { a: r(g.cur), b: r(g.tgt) });
    case 'num': return T('v4m.f.num', { a: r(Math.round(g.cur)), b: r(g.tgt) });
    case 'max': return T('v4m.f.max', { a: r(Math.round(g.cur)), b: r(g.tgt) });
    case 'pct': return T('v4m.f.pct', { a: r((+g.cur).toFixed(1)), b: r(g.tgt) });
    case 'maxpct': return T('v4m.f.maxpct', { a: r((+g.cur).toFixed(1)), b: r(g.tgt) });
    case 'q': return T('v4m.f.q', { a: r(g.cur), b: r(g.tgt) });
    case 'gdp': return fmtB(g.cur);
  }
  return '';
}
function v4mPct(g) {
  if (g.ok) return 1;
  if (g.cur == null || !g.tgt) return null;
  if (g.fmt === 'x') return v4mC(g.tgt > 1 ? (g.cur - 1) / (g.tgt - 1) : g.cur / g.tgt);
  if (g.fmt === 'n' || g.fmt === 'q' || g.fmt === 'num' || g.fmt === 'pct') return v4mC(g.cur / g.tgt);
  return null;
}
const v4mGT = g => T('v4m.g.' + g.k, g.p || undefined);
/* 目标列表：live 时按当前局面显示达成情况与进度，否则只列出这一档的目标 */
function v4mGoalsHTML(m, M, live, d) {
  const gs = live ? m.goals(S, M) : TXMIS.spec(m, d == null ? TXMIS.dOf(M) : d);
  return `<ul class="v4m-goals">${gs.map(g => {
    const p = live ? v4mPct(g) : null, f = live ? v4mFmt(g) : '';
    return `<li class="${live ? (g.ok ? 'ok' : 'no') : ''}"><span class="ic">${live ? (g.ok ? '✅' : '⬜') : '•'}</span><span class="t">${esc(v4mGT(g))}${g.keep ? ` <span class="tag">${T('v4m.keep')}</span>` : ''}${f ? ` <small>${esc(f)}</small>` : ''}${p != null && !g.ok ? `<i class="v4m-bar"><b style="width:${Math.round(p * 100)}%"></b></i>` : ''}</span></li>`;
  }).join('')}</ul>`;
}
/* 评星的写法：按用时（几个季度内、到哪个季度为止）；坚守型按到期时的局面 */
function v4mStarTxt(m, d) {
  if (m.star) { const t = m.tg[d]; return T('v4m.star_hold', { a: { raw: String(m.star.front[0]) }, n: t.stab + m.star.stab, b: { raw: String(m.star.front[1]) } }); }
  const p = m.par[d], s = v4mStart0(m), a = v4mQAdd(s.y, s.q, p[0] - 1), b = v4mQAdd(s.y, s.q, p[1] - 1);
  return T('v4m.star_q', { a: { raw: I18N.date(a.y, a.q) }, n: p[0], b: { raw: I18N.date(b.y, b.q) }, m: p[1] });
}
const v4mRulesTxt = (m, d) => T('v4m.rules') + T('v4m.rules_x', { a: { raw: v4mLen(m) }, b: { raw: v4mUntil(m, d) }, n: v4mQTot(m, d) }) + (m.hold ? ' ' + T('v4m.rules_hold') : '');

/* ---------- 任务列表与说明 ---------- */
function v4mShowList() {
  MPS.view = 'v4m';
  const best = v4mBest(), wk = v4mWeek(new Date());
  const recs = m => [0, 1, 2].map(d => { const r = v4mRec(best, m.id, d); return `<span class="v4m-rec${r ? ' on' : ''}" title="${esc(v4mDN(d) + (r ? ' · ' + T('v4m.best_n', { x: { raw: v4mStars(r.s) }, n: r.n }) : ''))}">${T('v4m.ds' + d)} ${r ? v4mStars(r.s) : '—'}</span>`; }).join('');
  const row = m => `<button class="v4m-row" data-v4m="${m.id}"><span class="v4m-who"><i style="background:${polColor(m.P)}"></i>${esc(v4mT(m, 'who'))}</span><b>${esc(v4mT(m, 't'))}</b><small>${v4mUntil(m, 1)} · ${v4mLen(m)} · ${T('v4m.diff')} ${v4mDots(m.diff)}</small><em class="v4m-recs">${recs(m)}</em></button>`;
  const eras = [...new Set(TXMIS.list.map(m => m.scen))];
  showModal(`<h2>🎯 ${T('v4m.list_h')}</h2><p class="sub">${T('v4m.list_x')}</p><p class="muted v4m-wk">📅 ${T('v4m.week_x', { x: { raw: v4mWeekTxt(wk) } })}</p>${eras.map(e => `<h4>${T('v4m.era', { n: { raw: e } })}</h4><div class="v4m-list">${TXMIS.list.filter(m => m.scen === e).map(row).join('')}</div>`).join('')}
    <div class="foot"><button data-mpgo="start">${T('u.back')}</button></div>`, 'start', false);
  $$('#sheet [data-v4m]').forEach(b => (b.onclick = () => v4mShowBrief(b.dataset.v4m)));
}
/* 任务说明：选难度、选开局；进行中打开时显示当前进度 */
function v4mShowBrief(id, inGame, pick) {
  const m = TXMIS.get(id); if (!m) return;
  const M = inGame ? v4mOf() : null;
  if (M && M.id === id) return v4mShowLive(m, M);
  const P = UI.v4mPick = Object.assign({ id, d: v4mPrefD(), mode: 'rand', code: '' }, UI.v4mPick && UI.v4mPick.id === id ? UI.v4mPick : {}, pick || {});
  P.d = P.d >= 0 && P.d <= 2 ? P.d | 0 : 1;
  const d = P.d, wk = v4mWeek(new Date()), wseed = v4mWeekSeed(id, wk), r = v4mRec(v4mBest(), id, d), ai = P.mode === 'rand' && !mpNoAI();
  const seedRow = (k, label) => `<label class="v4m-sopt${P.mode === k ? ' on' : ''}"><input type="radio" name="v4mSeed" value="${k}" ${P.mode === k ? 'checked' : ''}> ${label}</label>`;
  showModal(`<div class="v4m-brief"><div class="kicker">🎯 ${T('v4m.card')} · ${T('v4m.era', { n: { raw: m.scen } })} · <i style="background:${polColor(m.P)}"></i> ${esc(v4mT(m, 'who'))} · ${T('v4m.diff')} ${v4mDots(m.diff)}</div><h2>${esc(v4mT(m, 't'))}</h2><p>${esc(v4mT(m, 'b'))}</p>
    <h4>${T('v4m.diff_h')}</h4><div class="v4m-dpick">${[0, 1, 2].map(k => `<button data-v4md="${k}" class="${k === d ? 'on' : ''}"><b>${v4mDN(k)}</b><small>${T('v4m.dx' + k)}</small></button>`).join('')}</div>
    <h4>${T('v4m.goals')} <span class="tag">${v4mDN(d)}</span></h4>${v4mGoalsHTML(m, null, false, d)}
    <p class="muted v4m-rules">${v4mRulesTxt(m, d)}</p><p class="muted v4m-rules">⭐ ${v4mStarTxt(m, d)}${r ? ` <b>${T('v4m.best_d', { x: { raw: v4mStars(r.s) }, n: r.n })}</b>` : ''}</p>
    <h4>${T('v4m.tips')}</h4><p class="v4m-tip">${esc(v4mT(m, 'tip'))}</p>
    <h4>${T('v4m.seed_h')}</h4><div class="v4m-seed">${seedRow('rand', T('v4m.seed_rand'))}${seedRow('week', `${T('v4m.seed_week', { x: { raw: v4mWeekTxt(wk) } })} <code>${v4mCode(wseed)}</code>`)}${seedRow('code', T('v4m.seed_code'))}<input id="v4mCode" maxlength="6" autocomplete="off" spellcheck="false" placeholder="${esc(T('v4m.seed_ph'))}" value="${esc(P.code)}"${P.mode === 'code' ? '' : ' hidden'}>
      <p class="muted">${T('v4m.seed_x')}</p></div>
    ${ai ? `<label class="chk"><input type="checkbox" id="v4mAI"> ${T('v4m.ai_opt')}</label>` : ''}
    <p class="muted v4m-save">${T('v4m.save_x')}</p>
    <div class="foot"><button id="v4mBack">${T('u.back')}</button><button class="btn-primary" id="v4mGo">${T('v4m.go')}</button></div></div>`, 'start', false);
  $('#v4mBack').onclick = v4mShowList;
  $$('#sheet [data-v4md]').forEach(b => (b.onclick = () => { P.d = +b.dataset.v4md; v4mLS(V4M_PREF, String(P.d)); const sh = $('#sheet'), st = sh.scrollTop; v4mShowBrief(id, false); $('#sheet').scrollTop = st; }));
  $$('#sheet input[name="v4mSeed"]').forEach(x => (x.onchange = () => { P.mode = x.value; const sh = $('#sheet'), st = sh.scrollTop; v4mShowBrief(id, false); $('#sheet').scrollTop = st; if (P.mode === 'code') { const c = $('#v4mCode'); if (c) c.focus(); } }));
  const ci = $('#v4mCode'); if (ci) ci.oninput = () => { P.code = ci.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6); if (ci.value !== P.code) ci.value = P.code; };
  $('#v4mGo').onclick = () => {
    let seed = null;
    if (P.mode === 'week') seed = wseed;
    else if (P.mode === 'code') { seed = v4mParse(P.code); if (!seed) { toast(T('v4m.seed_bad'), 4500); if (ci) ci.focus(); return; } }
    const go = () => v4mStart(id, d, seed, P.mode, !!($('#v4mAI') && $('#v4mAI').checked), P.mode === 'week' ? `${wk.y}-W${wk.w}` : null);
    const o = v4mSaved(), om = o && v4mDef(o.mp.mission);
    if (om && !o.mp.mission.done) mpConfirm(T('v4m.overwrite_q', { x: { raw: v4mT(om, 't') } }), go); else go();
  };
}
/* 进行中的任务说明（目标进度、难度与挑战码、回到上一回合） */
function v4mShowLive(m, M) {
  const d = TXMIS.dOf(M), undo = !!v4mPrevGet();
  showModal(`<div class="v4m-brief"><div class="kicker">🎯 ${T('v4m.card')} · ${T('v4m.era', { n: { raw: m.scen } })} · <i style="background:${polColor(m.P)}"></i> ${esc(v4mT(m, 'who'))} · ${v4mDN(d)}${M.seed ? ' · ' + T('v4m.code', { x: { raw: v4mCode(M.seed) } }) : ''}</div><h2>${esc(v4mT(m, 't'))}</h2><p>${esc(v4mT(m, 'b'))}</p>
    <h4>${T('v4m.goals')}</h4>${v4mGoalsHTML(m, M, true)}
    <p class="muted v4m-rules">${v4mRulesTxt(m, d)}</p><p class="muted v4m-rules">⭐ ${v4mStarTxt(m, d)}${M.undo ? ' · ' + T('v4m.undo_n', { n: M.undo }) : ''}</p>
    <h4>${T('v4m.tips')}</h4><p class="v4m-tip">${esc(v4mT(m, 'tip'))}</p>
    <div class="foot">${undo ? `<button data-v4mundo="1">${T('v4m.undo')}</button>` : ''}<button class="btn-primary" data-close="1">${T('u.close')}</button></div></div>`, 'narrow', true);
}
/* 开始任务：单人 + 规则智能体（勾选 AI 时大国由 AI 扮演、每回合第一个季度用 AI 推演反应） */
function v4mStart(id, d, seed, kind, useAI, week) {
  const m = TXMIS.get(id); if (!m) return;
  d = d >= 0 && d <= 2 ? d | 0 : 1; useAI = !!useAI && kind === 'rand' && !mpNoAI(); // 挑战局只用规则推演：同一个挑战码对所有人都是同一个开局
  seed = seed || ((Math.random() * 2147483646) >>> 0) + 1;
  W.useScenario(m.scen);
  const list = mpPlayable(false, m.scen);
  const c = Object.assign(mpCfg0(), { aiUse: useAI ? 'std' : 'save', llmWorld: useAI, th: false, agentDef: useAI ? 'claude' : 'rule', diff: TXMIS.DIFFS[d] });
  S = W.newGame({ player: m.P, scen: m.scen, seed, diff: TXMIS.DIFFS[d], humans: [m.P], th: false });
  S.weCfg = mpCostCfg(c.we); S.weAI = false;
  const agents = {}; for (const r of list) if (r.id !== m.P) agents[r.id] = useAI && r.maj ? 'claude' : 'rule';
  S.mp = { mode: 'solo', agents, cfg: c, phase: 'plan', phaseAt: Date.now(), ver: 0 };
  W.goalsInit(S);
  const M = S.mp.mission = TXMIS.init(m, S, d, seed);
  Object.assign(M, { kind: kind || 'rand', week: week || null, ai: useAI, run: Date.now().toString(36) });
  v4mPrevClear(); v4mLS(V4M_PREF, String(d));
  mpAdoptLocal(S, true); closeModal(); mpLocalSave();
  toast(T('v4m.started', { x: { raw: v4mT(m, 't') + ' · ' + v4mDN(d) } }), 5000);
}

/* ---------- 任务存档：单独的存档槽 ---------- */
function v4mSaved() { try { const t = localStorage.getItem(V4M_SAVE), o = t && JSON.parse(t); return o && o.mp && o.mp.mission && TXMIS.get(o.mp.mission.id) ? o : null; } catch (e) { return null; } }
const v4mLocalSave0 = mpLocalSave;
mpLocalSave = function () {
  if (S && !UI.demo && MPS.on && MPS.mode === 'solo' && S.mp && S.mp.mission && !S.mp.tut) { try { localStorage.setItem(V4M_SAVE, serialize(S)); } catch (e) { } return; }
  return v4mLocalSave0();
};
const v4mAdopt0 = mpAdoptLocal;
mpAdoptLocal = function (s, fresh) {
  const r = v4mAdopt0(s, fresh);
  try { if (S && S.mp && S.mp.mode !== 'net' && !S.mp.tut) v4mLS(V4M_ACT, S.mp.mission ? '1' : '0'); if (S && S.mp && S.mp.mission && !V4M.prev) v4mPrevLoad(); } catch (e) { }
  return r;
};
/* 旧版把任务存在本机唯一的存档槽里：挪到任务存档槽（任务槽已经有存档时保留新的） */
function v4mMigrate() {
  try {
    const t = localStorage.getItem(MP_LOCAL), o = t && JSON.parse(t);
    if (!o || !o.mp || !o.mp.mission) return;
    if (!localStorage.getItem(V4M_SAVE)) { localStorage.setItem(V4M_SAVE, t); localStorage.setItem(V4M_ACT, '1'); }
    localStorage.removeItem(MP_LOCAL);
  } catch (e) { }
}
/* 刷新页面：最后玩的是任务就回到任务（平常的对局照旧从本机存档继续）；链接里带着挑战就打开那个任务的说明 */
function v4mLinkRead() {
  try {
    const q = new URLSearchParams(location.search), id = q.get('m');
    if (!id || !TXMIS.get(id)) return null;
    const d = Math.max(0, Math.min(2, (+q.get('d')) | 0)), code = (q.get('s') || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);
    for (const k of ['m', 'd', 's']) q.delete(k);
    const rest = q.toString(); try { history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash); } catch (e) { }
    return { id, d, mode: code && v4mParse(code) ? 'code' : 'rand', code };
  } catch (e) { return null; }
}
const v4mBoot0 = mpBoot;
mpBoot = function (data) {
  v4mMigrate(); V4M.link = v4mLinkRead();
  const ms = v4mLS(V4M_ACT) === '1' ? v4mLS(V4M_SAVE) : null;
  if (ms && !(data && data.save)) data = Object.assign({}, data || {}, { save: ms });
  const r = v4mBoot0(data);
  if (V4M.link) { const L = V4M.link; V4M.link = null; setTimeout(() => { UI.afterClose = null; v4mShowBrief(L.id, false, { d: L.d, mode: L.mode, code: L.code }); }, 400); }
  return r;
};

/* ---------- 回到上一回合：推演前记下局面 ---------- */
function v4mPrevSet(M) { try { V4M.prev = { id: M.id, run: M.run || null, from: S.turn, to: null, s: serialize(S) }; } catch (e) { V4M.prev = null; return; } try { localStorage.setItem(V4M_PREV, JSON.stringify(V4M.prev)); } catch (e) { v4mLS(V4M_PREV, null); } }
function v4mPrevDone() { if (!V4M.prev || V4M.prev.to != null) return; V4M.prev.to = S.turn; try { localStorage.setItem(V4M_PREV, JSON.stringify(V4M.prev)); } catch (e) { v4mLS(V4M_PREV, null); } }
function v4mPrevLoad() { try { const p = JSON.parse(localStorage.getItem(V4M_PREV) || 'null'); V4M.prev = p && p.s ? p : null; } catch (e) { V4M.prev = null; } }
function v4mPrevClear() { V4M.prev = null; v4mLS(V4M_PREV, null); }
function v4mPrevGet() { const p = V4M.prev, M = v4mOf(); return p && M && MPS.on && MPS.mode === 'solo' && p.id === M.id && (p.run || null) === (M.run || null) && p.to != null && p.to === S.turn && !UI.busy ? p : null; }
function v4mUndo() {
  const p = v4mPrevGet(); if (!p) { toast(T('v4m.undo_none')); return; }
  const M = v4mOf(), u = ((M && M.undo) || 0) + 1;
  let o; try { o = deserialize(p.s); } catch (e) { toast(T('u.load_fail', { x: { raw: (e && e.message) || String(e) } })); return; }
  if (o.mp && o.mp.mission) o.mp.mission.undo = u;
  v4mPrevClear(); V4M.ev = null; UI.afterClose = null;
  closeModal(); mpAdoptLocal(o, true); mpLocalSave();
  toast(T('v4m.undo_done', { d: { raw: dateStr(S) } }), 6000);
}
document.addEventListener('click', e => { const b = e.target.closest('[data-v4mundo]'); if (!b || b.disabled) return; e.preventDefault(); if (!v4mPrevGet()) { toast(T('v4m.undo_none')); return; } mpConfirm(T('v4m.undo_q', { d: { raw: dateStr(S, V4M.prev.from) } }), v4mUndo); });
const v4mResolve0 = mpResolve;
mpResolve = async function () {
  const M = v4mLive();
  if (M && S && !S.over && !MPS.busy && !UI.busy) v4mPrevSet(M); // 本回合排好的行动也在里面：回来以后可以改了再推
  return v4mResolve0();
};

/* ---------- 连续推演（04z9c 的 mpResolve 在第一个季度结算完后调用） ---------- */
function v4mStop(st) {
  const P = S.player;
  if (S.over) return 'over';
  if ((S.ultis || []).some(u => u.status === 'open')) return 'ulti';
  if ((S.crises || []).some(c => !c.resolved)) return 'crisis';
  const w0 = new Set((st && st.wars) || []);
  if (W.IDS.some(X => X !== P && S.actors[X] && W.atWar(S, P, X) && !w0.has(P + '|' + X) && !w0.has(X + '|' + P))) return 'war';
  return null;
}
/* 一回合更长：本回合收到的提议留到玩家下一次规划时还有效 */
function v4mKeepOffers() { for (const o of S.inbox || []) if (o.expires < S.turn + 1) o.expires = S.turn + 1; }
/* 几个季度的战报合并成一份（列表依次接上；数字取首尾；增长率取平均；战线与待办取最后） */
function v4mMerge(reps) {
  const a = reps[0], z = reps[reps.length - 1], R = Object.assign({}, z);
  for (const k of ['actions', 'custom', 'reactions', 'toYou', 'world', 'mil', 'pol', 'intel', 'events', 'headlines', 'notes', 'cross', 'pub']) { if (!reps.some(r => r[k])) continue; const all = []; for (const r of reps) for (const x of r[k] || []) all.push(x); R[k] = all; }
  if (a.econ && z.econ) {
    const e0 = a.econ, e1 = z.econ, gs = reps.map(r => r.econ && r.econ.growth).filter(v => typeof v === 'number');
    R.econ = Object.assign({}, e1, { gdp: [e0.gdp[0], e1.gdp[1]], stab: [e0.stab[0], e1.stab[1]], mil: [e0.mil[0], e1.mil[1]], treasury: [e0.treasury[0], e1.treasury[1]], tech: [e0.tech[0], e1.tech[1]], fac: [e0.fac[0], e1.fac[1]], rep: [e0.rep[0], e1.rep[1]], growth: gs.length ? gs.reduce((s, v) => s + v, 0) / gs.length : e1.growth });
  }
  R.inbox = [...new Set([].concat(...reps.map(r => r.inbox || [])))];
  R.turn = a.turn; R.y = a.y; R.q = a.q; R.llmNote = a.llmNote; if (a.llmErr) R.llmErr = a.llmErr; else delete R.llmErr; if (a.plan) R.plan = a.plan;
  return R;
}
async function v4MissionAfter() {
  V4M.ev = null;
  const M = v4mLive(), m = v4mDef(M); if (!M || !m) return;
  const st = V4X.start && V4X.start[S.player];
  TXMIS.countAid(M, st && st.queue); // 本回合排的援助
  M.turns = (M.turns || 0) + 1;
  const reps = [S.report], evs = [(S.lastEvents || []).slice()];
  let res = TXMIS.check(m, S, M), stop = res ? null : v4mStop(st);
  MPS.busy = UI.busy = true; const be = $('#btnEnd'); if (be) be.disabled = true;
  try {
    while (!res && !stop && reps.length < M.qpt && !S.over) {
      busy(2, T('v4m.busy', { n: reps.length + 1, m: M.qpt })); await new Promise(r => setTimeout(r, 30));
      v4mKeepOffers();
      const R = W.prepareTurn(S); if (!R) break;
      W.ruleReactions(S, R, new Set()); W.finishTurn(S); W.goalsTurn(S);
      reps.push(S.report); evs.push((S.lastEvents || []).slice());
      res = TXMIS.check(m, S, M); if (!res) stop = v4mStop(st);
    }
  } catch (e) { console.error(e); toast(T('u.turn_err', { x: { raw: (e && e.message) || String(e) } }), 6000); }
  finally { MPS.busy = UI.busy = false; if (be) be.disabled = false; $('#busy').hidden = true; }
  MPS.queue = S.queue = []; MPS.qKey = '[]'; S.mp.phase = 'plan'; S.mp.phaseAt = Date.now(); MPS.lastTurn = S.turn;
  if (reps.length > 1) S.report = v4mMerge(reps);
  const R = S.report, z = reps[reps.length - 1]; V4M.ev = { turn: S.turn, list: evs };
  if (R && !R.intro) R.v4m = { n: reps.length, qpt: M.qpt, stop: !res && reps.length < M.qpt ? stop : null, res: res ? res.res : null, y0: reps[0].y, q0: reps[0].q, y1: z.y, q1: z.q };
  if (res) { M.done = Object.assign({ turn: S.turn, turns: M.turns, q: S.turn - M.t0, at: Date.now(), ly: z.y, lq: z.q }, res); if (res.res === 'win') M.done.rec = v4mSaveBest(M, res.stars, M.turns, S.turn - M.t0); }
  v4mPrevDone();
}

/* ---------- 战报：任务进度一节；任务刚结束时，关掉战报后弹出结果 ---------- */
const v4mShowReport0 = showReport;
showReport = function (R) {
  v4mShowReport0(R);
  const M = v4mOf(), m = v4mDef(M), v = R && R.v4m; if (!M || !m || !v) return;
  const sh = $('#sheet'); if (!sh) return;
  const h1 = sh.querySelector('h1'); if (h1 && v.n > 1) h1.textContent = T('u.brief', { x: { raw: v4mSpan(v) } });
  const d = M.done, ban = v.res === 'win' && d ? `<p class="good v4m-banner">${T('v4m.rep_win')} <span class="v4m-st">${v4mStars(d.stars)}</span></p>` : v.res === 'fail' && d ? `<p class="bad v4m-banner">${T('v4m.rep_fail')}${EN() ? ': ' : '：'}${esc(T(d.why))}</p>` : '';
  const undo = v4mPrevGet() ? `<p class="v4m-undo-l"><button class="mini" data-v4mundo="1">${T('v4m.undo')}</button> <span class="muted">${T('v4m.undo_l')}</span></p>` : '';
  const html = `<div class="rep-sec v4m-rep"><h3>🎯 ${T('v4m.rep_h')} · ${esc(v4mT(m, 't'))} <span class="tag">${v4mDN(TXMIS.dOf(M))}</span></h3>${ban}<p class="muted">${T('v4m.rep_n', { n: v.n, x: { raw: v4mSpan(v) } })}${v.stop ? ' ' + T('v4m.rep_stop', { n: v.n, x: { raw: T('v4m.stop.' + v.stop) } }) : ''}</p>${v4mGoalsHTML(m, M, true)}${undo}</div>`;
  const at = sh.querySelector('p.sub'); if (at) at.insertAdjacentHTML('afterend', html);
  if (d && !d.seen) { const a0 = UI.afterClose; UI.afterClose = () => { d.seen = true; mpLocalSave(); v4mShowResult(a0); }; }
};
/* 成绩卡：任务、难度、星级、用时、回退次数、挑战码与链接 */
function v4mLink(M) { try { return `${location.origin}${location.pathname}?m=${encodeURIComponent(M.id)}&d=${TXMIS.dOf(M)}&s=${v4mCode(M.seed)}`; } catch (e) { return ''; } }
function v4mCard(m, M) {
  const d = M.done, D = TXMIS.dOf(M), win = d && d.res === 'win';
  const L = [`🎯 ${T('mp.title')} · ${T('v4m.card')}`, T('v4m.card_t', { t: { raw: v4mT(m, 't') }, w: { raw: v4mT(m, 'who') }, e: { raw: T('v4m.era', { n: { raw: m.scen } }) }, d: { raw: v4mDN(D) } }),
    win ? T('v4m.card_win', { x: { raw: v4mStars(d.stars) }, n: d.turns, q: d.q != null ? d.q : d.turn - M.t0, u: M.undo || 0 }) : T('v4m.card_fail', { x: { raw: T(d.why) }, n: d.turns }),
    T('v4m.card_code', { x: { raw: v4mCode(M.seed) } }) + (M.kind === 'week' && M.week ? ' · ' + T('v4m.card_week', { x: { raw: M.week } }) : '') + (M.ai ? ' · ' + T('v4m.card_ai') : '')];
  const u = v4mLink(M); if (u) L.push(u);
  return L.join('\n');
}
async function v4mCopy(txt) {
  try { await navigator.clipboard.writeText(txt); toast(T('v4m.copied')); return true; } catch (e) { }
  const ta = $('#v4mCardTxt'); if (ta) { ta.focus(); ta.select(); try { if (document.execCommand('copy')) { toast(T('v4m.copied')); return true; } } catch (e) { } }
  toast(T('v4m.copy_fail'), 4500); return false;
}
function v4mShowResult(after) {
  const M = v4mOf(), m = v4mDef(M), d = M && M.done; if (!d || !m) { if (after) after(); return; }
  const win = d.res === 'win', D = TXMIS.dOf(M), card = v4mCard(m, M), undo = !!v4mPrevGet();
  showModal(`<div class="v4m-res"><div class="kicker">🎯 ${T('v4m.card')} · ${esc(v4mT(m, 'who'))} · ${v4mDN(D)}</div><h1 class="${win ? 'good' : 'bad'}">${T(win ? 'v4m.win_h' : 'v4m.fail_h', { x: { raw: v4mT(m, 't') } })}</h1>
    ${win ? `<div class="v4m-stars">${v4mStars(d.stars)}</div><p>${T('v4m.win_x', { n: d.turns, q: d.q != null ? d.q : d.turn - M.t0, d: { raw: I18N.date(d.ly, d.lq) } })}${M.undo ? ' ' + T('v4m.undo_n', { n: M.undo }) : ''}${d.rec ? ` <b class="good">${T('v4m.win_new')}</b>` : ''}</p><p class="muted">⭐ ${v4mStarTxt(m, D)}</p>` : `<p>${esc(T(d.why))}</p>`}
    ${v4mGoalsHTML(m, M, true)}
    <div class="v4m-share"><h4>${T('v4m.share_h')}</h4><textarea id="v4mCardTxt" readonly rows="5">${esc(card)}</textarea><div class="btns"><button class="mini" id="v4mCopy">${T('v4m.share_copy')}</button><button class="mini" id="v4mCopyL">${T('v4m.link_copy')}</button></div><p class="muted">${T('v4m.share_x')}</p></div>
    <p class="muted" style="font-size:12.5px">${T('v4m.free_x')}</p>
    <div class="foot">${undo ? `<button data-v4mundo="1">${T('v4m.undo')}</button>` : ''}<button id="v4mFree">${T('v4m.free')}</button><button id="v4mList">${T('v4m.list')}</button><button class="btn-primary" id="v4mAgain">${T('v4m.again')}</button></div></div>`, 'narrow', false);
  $('#v4mCopy').onclick = () => v4mCopy(card);
  $('#v4mCopyL').onclick = () => v4mCopy(v4mLink(M));
  $('#v4mFree').onclick = () => { closeModal(); renderAll(); if (after) after(); };
  $('#v4mList').onclick = () => v4mShowList();
  $('#v4mAgain').onclick = () => v4mShowBrief(m.id, false, { d: D, mode: M.kind === 'week' ? 'week' : M.kind === 'code' ? 'code' : 'rand', code: M.kind === 'code' ? v4mCode(M.seed) : '' });
}

/* ---------- 进行中的显示：地图上的任务卡、本国页的任务一节、顶栏与结束按钮 ---------- */
function v4mHud() {
  let el = $('#v4mHud'); const M = v4mOf(), m = v4mDef(M);
  if (!M || !m || !MPS.on) { if (el) el.hidden = true; return; }
  if (!el) {
    const w = $('#mapwrap'); if (!w) return;
    w.insertAdjacentHTML('beforeend', '<div class="v4m-hud" id="v4mHud"></div>'); el = $('#v4mHud');
    el.addEventListener('click', e => { const b = e.target.closest('[data-v4mh]'); if (!b) return; const M1 = v4mOf(); if (b.dataset.v4mh === 'min') { UI.v4mMin = !UI.v4mMin; v4mHud(); } else if (M1) v4mShowBrief(M1.id, true); });
  }
  el.hidden = false;
  const gs = m.goals(S, M), n = gs.filter(g => g.ok).length, left = Math.max(0, Math.ceil((M.dl + 1 - S.turn) / M.qpt)), D = TXMIS.dOf(M), undo = !!v4mPrevGet();
  const st = M.done ? (M.done.res === 'win' ? `<span class="good">${T('v4m.done_tag')} ${v4mStars(M.done.stars)}</span>` : `<span class="bad">${T('v4m.fail_tag')}</span>`) : `<span>${left <= 1 ? T('v4m.left1') : T('v4m.left', { n: left })}</span>`;
  el.innerHTML = `<div class="hd"><button class="mini" data-v4mh="min" aria-label="${esc(T('v4m.hud'))}">${UI.v4mMin ? '▸' : '▾'}</button><b>🎯 ${esc(v4mT(m, 't'))}</b><span class="tag">${n}/${gs.length}</span></div>${UI.v4mMin ? '' : `<div class="bd"><div class="muted v4m-hl">${st} · ${v4mDN(D)} · ${v4mUntil(m, D)} · ${v4mLen(m)}</div><ul>${gs.map(g => `<li class="${g.ok ? 'ok' : ''}">${g.ok ? '✅' : '⬜'} ${esc(v4mGT(g))}${g.cur != null && !g.ok ? ` <small>${esc(v4mFmt(g))}</small>` : ''}</li>`).join('')}</ul><div class="v4m-hb"><button class="mini" data-v4mh="brief">${T('v4m.brief')}</button>${undo ? `<button class="mini" data-v4mundo="1" title="${esc(T('v4m.undo_l'))}">${T('v4m.undo_s')}</button>` : ''}</div></div>`}`;
}
const v4mGoals0 = goalsSecHTML;
goalsSecHTML = function () {
  const base = v4mGoals0(), M = v4mOf(), m = v4mDef(M); if (!M || !m) return base;
  const d = M.done, D = TXMIS.dOf(M), st = d ? (d.res === 'win' ? `<span class="tag blue">${T('v4m.done_tag')} ${v4mStars(d.stars)}</span>` : `<span class="tag red">${T('v4m.fail_tag')}</span>`) : `<span class="tag acc">${T('v4m.left', { n: Math.max(0, Math.ceil((M.dl + 1 - S.turn) / M.qpt)) })}</span>`;
  return `<div class="sec v4m-sec"><h3>🎯 ${esc(v4mT(m, 't'))} ${st}</h3><p class="muted" style="font-size:12px;margin:0 0 4px">${v4mDN(D)} · ${v4mUntil(m, D)} · ${v4mLen(m)}</p>${v4mGoalsHTML(m, M, true)}<button class="mini" data-v4mbrief="1">${T('v4m.brief')}</button>${v4mPrevGet() ? ` <button class="mini" data-v4mundo="1">${T('v4m.undo_s')}</button>` : ''}</div>` + (d ? base : ''); // 任务进行中只看任务目标；结束后（自由游玩）再显示平常的目标与计分
};
document.addEventListener('click', e => { const b = e.target.closest('[data-v4mbrief]'); if (!b) return; const M = v4mOf(); if (M) v4mShowBrief(M.id, true); });
const v4mBar0 = mpRenderBar;
mpRenderBar = function () {
  v4mBar0();
  const M = v4mLive(), m = v4mDef(M); if (!M || !m) return;
  const lb = $('#mpbar .mplbl'); if (lb) lb.textContent = '🎯 ' + v4mT(m, 't');
  const gb = $('#mpbar [data-gl="board"]'); if (gb) gb.remove(); // 任务进行中不看计分排行
  const be = $('#btnEnd'); if (be && !UI.busy) be.textContent = T(M.qpt >= 4 ? 'v4m.end4' : 'v4m.end2');
};
const v4mTop0 = renderTop;
renderTop = function () {
  v4mTop0();
  try { const M = v4mLive(); if (M && S) { const dl = $('#dateLine'); if (dl) dl.textContent = `${dateStr(S)} · ${T('v4m.date', { n: (M.turns || 0) + 1 })}`; } v4mHud(); } catch (e) { console.warn('v4m', e); }
};

/* ---------- 开局画面：任务卡片；有任务存档时可以继续 ---------- */
const v4mStartScr0 = mpShowStart;
mpShowStart = function () {
  v4mMigrate();
  v4mStartScr0();
  const hud = $('#v4mHud'); if (hud) hud.hidden = true;
  const box = $('#sheet .mpmodes'); if (box && !box.querySelector('[data-mpgo="v4mis"]')) box.insertAdjacentHTML('beforeend', `<button class="mpmode v4m-card" data-mpgo="v4mis"><b>🎯 ${T('v4m.card')}</b><small>${T('v4m.card_x')}</small></button>`);
  try {
    const o = v4mSaved(), M = o && o.mp.mission, m = v4mDef(M);
    if (m && box && !$('#sheet [data-mpgo="v4mresume"]')) {
      const tag = M.done ? T(M.done.res === 'win' ? 'v4m.resume_done' : 'v4m.resume_fail') : v4mDN(TXMIS.dOf(M));
      const html = `<div class="alert v4m-resume">${esc(T('v4m.resume', { x: { raw: v4mT(m, 't') }, k: { raw: tag }, d: { raw: dateStr(o) } }))} <button data-mpgo="v4mresume">${T('u.continue_save')}</button></div>`;
      const al = $('#sheet [data-mpgo="resume_local"]'); if (al && al.parentElement) al.parentElement.insertAdjacentHTML('afterend', html); else box.insertAdjacentHTML('afterend', html);
    }
  } catch (e) { }
};
const v4mBarClick0 = mpBarClick;
mpBarClick = function (b) {
  const g = b && (b.dataset.mpgo || b.dataset.mp);
  if (g === 'v4mis') { v4mShowList(); return; }
  if (g === 'v4mresume') { try { const o = deserialize(localStorage.getItem(V4M_SAVE)); V4M.prev = null; mpAdoptLocal(o); closeModal(); } catch (e) { toast(T('u.load_fail', { x: { raw: (e && e.message) || String(e) } })); } return; }
  return v4mBarClick0(b);
};
