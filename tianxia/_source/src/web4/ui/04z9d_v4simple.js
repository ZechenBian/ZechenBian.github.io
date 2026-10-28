/* ===================== 网页版 v4 · 简化模式（快速上手） =====================
 * 开局画面与游戏菜单里可以切换（存在本机 localStorage 'tianxia4.simple'）。打开后：
 *   · 目标页：一组常用行动按钮（峰会、援助、提议自贸/互不侵犯/结盟、停火/和平、谴责、制裁、军演、进攻），
 *     每个写一句作用、占多少行动力、花多少钱、对方多半同不同意；完整的行动面板收在下面，展开就是平常的界面；
 *   · 本国页：参谋建议（最多三条，点“照办”直接排进本回合）+ 国内常用措施（刺激、维稳、科研、征兵、采购、动员）；完整面板收在下面；
 *   · 隐藏“动员（战时经济）”与“情报”两页。
 * 只改界面，不改规则：按钮排的就是普通行动与协议。新手教学进行时不用简化界面（教学按完整界面指引）。 */
const V4S_KEY = 'tianxia4.simple';
const v4sOn = () => { if (UI.simple == null) { try { UI.simple = localStorage.getItem(V4S_KEY) === '1'; } catch (e) { UI.simple = false; } } return !!UI.simple; };
const v4sLive = () => v4sOn() && !!S && !UI.demo && !!MPS.on && !(S.mp && S.mp.tut);
function v4sSet(on) {
  UI.simple = !!on; try { localStorage.setItem(V4S_KEY, on ? '1' : '0'); } catch (e) { }
  document.body.classList.toggle('v4simple', !!on);
  if (on && ['weco', 'intel'].includes(UI.tab)) UI.tab = 'home';
  UI.extHTML = null; if (S && !UI.demo && MPS.on) renderAll();
}
try { document.body.classList.toggle('v4simple', v4sOn()); } catch (e) { }
/* 常用行动：a 行动、d 协议条款；p(P) 参数；war 只在交战时；host 敌对行动（对盟友不显示）；ask 先确认 */
const V4S_T = [
  { k: 'summit', a: 'summit' }, { k: 'aid', a: 'aid', p: P => ({ amt: S.actors[P].gdp * 0.002 }) },
  { k: 'trade', d: 'trade' }, { k: 'nap', d: 'nap' }, { k: 'alliance', d: 'alliance' },
  { k: 'ceasefire', d: 'ceasefire', war: 1 }, { k: 'peace', d: 'peace', war: 1 },
  { k: 'condemn', a: 'condemn', host: 1 }, { k: 'sanction', a: 'sanction', p: () => ({ level: 1 }), host: 1 }, { k: 'exercise', a: 'exercise', host: 1 },
  { k: 'invade', a: 'invade', p: () => ({ share: 0.5, haste: 0 }), host: 1, ask: 1 },
];
const V4S_D = [
  { k: 'stimulus', a: 'stimulus' }, { k: 'stabilize', a: 'stabilize' }, { k: 'research', a: 'research' }, { k: 'conscript', a: 'conscript', p: () => ({ size: 1 }) },
  { k: 'procure_land', a: 'procure', p: () => ({ branch: 'land', tier: 1 }) }, { k: 'procure_air', a: 'procure', p: () => ({ branch: 'air', tier: 1 }) }, { k: 'procure_navy', a: 'procure', p: () => ({ branch: 'navy', tier: 1 }) },
  { k: 'mob_up', mob: 1, when: P => W.mobIdx(S.actors[P]) < 5 }, { k: 'mob_down', mob: -1, when: P => W.mobIdx(S.actors[P]) > 0 }, // 动员等级 0–5，和“动员”页一样立即生效（提高占行动力，降低免费）
];
const v4sWhy = r => (r == null ? '' : typeof r === 'string' ? r : TX(r));
/* 一个按钮的状态：能不能排、占多少行动力、花多少钱、对方同意的可能 */
function v4sInfo(q, X) {
  const P = S.player, p = q.p ? q.p(P) : {};
  if (q.mob) { const cur = W.mobIdx(S.actors[P]), lv = Math.max(0, Math.min(5, cur + q.mob)), ap = lv > cur ? W.mobAP(S, cur, lv) : 0, left = W.apLeft(S); return { ok: lv !== cur && ap <= left, why: lv === cur ? '' : ap > left ? T('c.ap', { n: ap }) : '', ap, cost: 0, ch: '→ ' + T('mob6.' + lv), p: { lv } }; }
  if (q.d) {
    const term = { type: q.d }, bad = W.dealCheck(S, X, term), ap = W.dealAP([term], S), left = W.apLeft(S);
    let ch = ''; try { const sc = W.evalDeal(S, P, X, q.war ? { type: q.d, terms: 'white' } : term).score, pr = 1 / (1 + Math.exp(-sc * 4)); ch = T('pv.w' + (pr > 0.8 ? 0 : pr > 0.55 ? 1 : pr > 0.35 ? 2 : pr > 0.15 ? 3 : 4)); } catch (e) { }
    return { ok: !bad && ap <= left, why: bad ? v4sWhy(bad) : ap > left ? T('c.ap', { n: ap }) : '', ap, cost: 0, ch, p };
  }
  const tgt = V4S_D.includes(q) ? P : X, d = W.ACT[q.a], st = W.actionStatus(S, q.a, tgt, p);
  let cost = 0, ap = d ? d.ap : 0; try { cost = d.cost(S, P, tgt, p) || 0; } catch (e) { } try { ap = W.apCost(S, q.a, tgt, p); } catch (e) { }
  return { ok: !!st.ok, why: st.ok ? '' : v4sWhy(st.reason), ap, cost, ch: '', p };
}
function v4sBtn(q, X) {
  const i = v4sInfo(q, X), meta = [i.ap > 0 ? T('v4s.cap', { n: Math.round(i.ap) }) : '', i.cost > 0.0001 ? T('v4s.cost', { x: { raw: fmtB(i.cost) } }) : '', i.ch].filter(Boolean).join(' · ');
  return `<button class="v4s-btn${q.host ? ' host' : ''}" data-v4s="${q.k}" data-v4st="${esc(X)}" ${i.ok ? '' : `disabled title="${esc(i.why)}"`}><b>${T('v4s.a.' + q.k)}</b><small>${T('v4s.x.' + q.k)}</small>${meta ? `<em>${esc(meta)}</em>` : ''}${!i.ok && i.why ? `<em class="bad">${esc(i.why)}</em>` : ''}</button>`;
}
function v4sTargetQuick(X) {
  const P = S.player, war = W.atWar(S, P, X), ally = W.isAlly(S, P, X);
  const list = V4S_T.filter(q => (q.war ? war : !(q.d && war)) && !(q.d && !q.war && W.hasTreaty(S, P, X, q.d)) && !(q.host && ally));
  return `<div class="sec v4s-sec"><h3>⚡ ${T('v4s.quick')}</h3><p class="muted v4s-x">${T('v4s.quick_x')}</p><div class="v4s-grid">${list.map(q => v4sBtn(q, X)).join('')}</div></div>`;
}

/* ---------- 参谋建议 ---------- */
function v4sMisAdv(a, M) {
  const P = S.player, [kind, x, y] = a, me = S.actors[P], t = (M && M.t) || {};
  const ok = c => S.actors[c] && W.indep(S, c) && !W.isNeutral(S, c);
  const pick = (v, f) => (Array.isArray(v) ? v : [v]).find(c => ok(c) && f(c));
  switch (kind) {
    case 'deal': {
      if (y === 'best') { const c = W.IDS.filter(c => c !== P && ok(c) && !W.isHuman(S, c) && !W.hasTreaty(S, P, c, x) && !W.dealCheck(S, c, { type: x })).sort((p, q) => W.evalDeal(S, P, q, { type: x }).score - W.evalDeal(S, P, p, { type: x }).score)[0]; return c ? { txt: T('v4s.m.best', { a: c }), go: { d: x, t: c } } : null; }
      const c = pick(y, c => !W.hasTreaty(S, P, c, x) && !W.dealCheck(S, c, { type: x })); return c ? { txt: T('v4s.m.deal', { a: c, k: T('tr.' + x) }), go: { d: x, t: c } } : null;
    }
    case 'joinwar': if (!ok(x) || !W.atWar(S, P, y)) return null; return W.isAlly(S, P, x) ? { txt: T('v4s.m.joinwar2', { a: x, b: y }), go: { d: 'join_war', t: x, e: y } } : { txt: T('v4s.m.joinwar', { a: x, b: y }), go: { d: 'alliance', t: x } };
    case 'act': {
      if (!y) return { txt: T('v4s.m.self', { k: T('v4s.a.' + x) }), go: { a: x, t: P } };
      const c = pick(y, () => true); if (!c) return null;
      return { txt: T(I18N.has('v4s.m.' + x) ? 'v4s.m.' + x : 'v4s.m.self', { a: c, k: T('v4s.a.' + x) }), go: { a: x, t: c, p: x === 'aid' ? { amt: S.actors[P].gdp * 0.002 } : {} } };
    }
    case 'build': return { txt: T('v4s.m.build'), go: { build: 1 } };
    case 'demob': return W.mobIdx(me) > 0 ? { txt: T('v4s.m.demob'), go: { mob: 0 } } : null; // 复员：降低动员免费，直接降到平时
    case 'milcut': return t.mil != null && me.milPct > t.mil ? { txt: T('v4s.m.milcut', { n: { raw: String(t.mil) } }), go: { mil: t.mil } } : null;
    case 'save': return { txt: T('v4s.m.save'), go: null };
    case 'deploy': { // 从 x 调兵到 y：x 空闲的陆军一半（最多三分之一的全国兵力）、空军四成（最多五分之一）
      if (!S.actors[y] || S.actors[y].ctrl !== P || !S.actors[x]) return null;
      const here = (me.forces && me.forces[y]) || [0, 0, 0], free = W.freeQV(S, x) || [0, 0, 0];
      if (here[0] >= 0.4) return null;
      const v = [Math.min(0.33, free[0] * 0.5), 0, Math.min(0.2, free[2] * 0.4)].map(z => +z.toFixed(3));
      if (v[0] < 0.03 && v[2] < 0.03) return null;
      return { txt: T('v4s.m.deploy', { a: x, b: y, s: { raw: pct(v[0]) } }), go: { dep: [x, y, v] } };
    }
  }
  return null;
}
function v4sAdvice() {
  const P = S.player, x = S.actors[P], out = [], seen = new Set();
  const add = (txt, go) => { const key = go ? JSON.stringify(go) : txt; if (seen.has(key) || out.length >= 3) return; seen.add(key); out.push({ txt, go }); };
  const cr = (S.crises || []).find(c => !c.resolved); if (cr) add(T('v4s.adv.crisis'), { crisis: cr.id });
  const ul = (S.ultis || []).find(u => u.status === 'open'); if (ul) add(T('v4s.adv.ulti', { a: ul.from }), { tab: 'diplo' });
  if ((S.inbox || []).length) add(T('v4s.adv.inbox', { n: S.inbox.length }), { tab: 'diplo' });
  const M = typeof v4mLive === 'function' ? v4mLive() : null, m = M ? v4mDef(M) : null;
  if (m) for (const g of m.goals(S, M)) { const a = TXMIS.adv(g.k); if (g.ok && !(a && a[3] === 'pre')) continue; const z = a ? v4sMisAdv(a, M) : null; if (z) add(T('v4s.adv.mis', { x: { raw: T('v4m.g.' + g.k, g.p || undefined) } }) + z.txt, z.go); }
  if (x.stab < 45) add(T('v4s.adv.stab', { n: Math.round(x.stab) }), { a: 'stabilize', t: P });
  const mi = W.mobIdx(x);
  if (x.treasury < -x.gdp * 0.06) { if (mi > 0) add(T('v4s.adv.debt_mob'), { mob: mi - 1 }); else add(T('v4s.adv.debt'), null); }
  const en = W.enemies(S, P).filter(e => S.actors[e]);
  if (en.length) {
    const e = en.slice().sort((a, b) => W.power(S, b) - W.power(S, a))[0], lose = S.fronts.some(f => f.att === e && W.boss(S, f.target) === P && f.progress > 40);
    if (W.power(S, P) < W.power(S, e) * 0.9) { if (lose) add(T('v4s.adv.cease', { a: e }), { d: 'ceasefire', t: e }); add(T('v4s.adv.weak', { a: e }), { build: 1 }); }
  }
  if (x.lastG < (DEF[P].growth / 4) * 0.6 && x.treasury > -x.gdp * 0.04 && !en.length) add(T('v4s.adv.growth'), { a: 'stimulus', t: P });
  if (out.length < 3) {
    const big = W.IDS.filter(c => c !== P && S.actors[c] && W.indep(S, c) && !W.isNeutral(S, c) && !W.isHuman(S, c) && !W.atWar(S, P, c)).sort((a, b) => W.power(S, b) - W.power(S, a)).slice(0, 8);
    const tp = big.find(c => W.rel(S, P, c) >= 25 && !W.hasTreaty(S, P, c, 'trade') && !W.dealCheck(S, c, { type: 'trade' })); if (tp) add(T('v4s.adv.trade', { a: tp }), { d: 'trade', t: tp });
    const sm = big.find(c => W.rel(S, P, c) > -30 && W.rel(S, P, c) < 25); if (sm) add(T('v4s.adv.summit', { a: sm }), { a: 'summit', t: sm });
  }
  if (!out.length) add(T('v4s.adv.calm'), null);
  return out;
}
function v4sAdvHTML() {
  const list = UI.v4sAdv = v4sAdvice();
  return `<div class="sec v4s-adv"><h3>🧭 ${T('v4s.adv')}</h3><p class="muted v4s-x">${T('v4s.adv_x')}</p><ol>${list.map((z, i) => `<li><span>${esc(z.txt)}</span>${z.go ? `<button class="mini${z.go.crisis || z.go.tab ? '' : ' btn-primary'}" data-v4sadv="${i}">${T(z.go.crisis || z.go.tab ? 'v4s.look' : 'v4s.do')}</button>` : ''}</li>`).join('')}</ol></div>`;
}

/* ---------- 执行 ---------- */
const v4sRefresh = () => { renderTop(); renderSide(); renderQueue(); renderMap(); };
function v4sAct(id, X, p, quiet) {
  if (W.ACT[id] && W.ACT[id].danger) { confirmNuke(id, X, p); return false; }
  const r = W.queueAction(S, id, X, Object.assign({}, p || {}));
  if (!r.ok) { if (!quiet) toast(v4sWhy(r.reason), 4500); return false; }
  if (!quiet) toast(T('u.queued', { x: { raw: v2QLabel(S.queue[S.queue.length - 1]) } }));
  return true;
}
function v4sGo(go) {
  if (!go || !S) return;
  if (go.crisis) { openCrisis(go.crisis); return; }
  if (go.tab) { UI.tab = go.tab; renderSide(); return; }
  if (go.dep) { const [f, l, v] = go.dep, r = W.queueDeploy(S, f, l, v); toast(r.ok ? T('u.deploy_q', { f, l }) : v4sWhy(r.reason), 4500); v4sRefresh(); return; }
  if (go.mil != null) { const r = doCmd('setMil', [go.mil]); if (r === null || r === undefined) { toast(T('mp.p.fail')); return; } toast(T('v4s.mil_set', { n: { raw: String(go.mil) } })); renderAll(); return; }
  if (go.mob != null) { const r = doCmd('setMob', [go.mob]); if (r === null || r === undefined) { toast(T('mp.p.fail')); return; } toast(T('v2.mob.set', { k: T('mob6.' + go.mob) })); renderAll(); return; }
  if (go.build) { const a = v4sAct('conscript', S.player, { size: 1 }, true), b = v4sAct('procure', S.player, { branch: 'land', tier: 1 }, true); toast(a || b ? T('v4s.done') + ' · ' + [a ? T('v4s.a.conscript') : '', b ? T('v4s.a.procure_land') : ''].filter(Boolean).join(sep()) : T('c.money')); v4sRefresh(); return; }
  if (go.d) { const r = W.queueDeal(S, go.t, [go.d === 'join_war' ? { type: 'join_war', enemy: go.e } : { type: go.d }]); if (!r.ok) { toast(v4sWhy(r.reason), 4500); return; } toast(T('v4s.queued_deal', { a: go.t }), 5000); v4sRefresh(); return; }
  if (go.a && v4sAct(go.a, go.t, go.p || {})) v4sRefresh();
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-v4s], [data-v4sadv]'); if (!b || !S || UI.demo || b.disabled) return;
  if (b.dataset.v4sadv != null) { const z = (UI.v4sAdv || [])[+b.dataset.v4sadv]; if (z && z.go) v4sGo(z.go); return; }
  const k = b.dataset.v4s, X = b.dataset.v4st, q = V4S_T.concat(V4S_D).find(z => z.k === k); if (!q) return;
  const P = S.player, p = q.p ? q.p(P) : {};
  if (q.mob) v4sGo({ mob: p.lv != null ? p.lv : v4sInfo(q, P).p.lv });
  else if (q.d) v4sGo({ d: q.d, t: X });
  else if (q.ask) mpConfirm(T('v4s.inv_q', { a: X }), () => v4sGo({ a: q.a, t: X, p }));
  else v4sGo({ a: q.a, t: V4S_D.includes(q) ? P : X, p });
});
document.addEventListener('toggle', e => { const d = e.target; if (d && d.matches && d.matches('details.v4s-more')) UI['v4sMore_' + (d.dataset.v4smore || 't')] = d.open; }, true);

/* ---------- 面板 ---------- */
const v4sActs0 = v2ActsHTML;
v2ActsHTML = function (X) {
  if (!v4sLive()) return v4sActs0(X);
  return v4sTargetQuick(X) + `<details class="sec v4s-more" data-v4smore="t"${UI.v4sMore_t ? ' open' : ''}><summary>${T('v4s.more')}</summary>${v4sActs0(X)}</details>`;
};
const v4sHome0 = homeHTML;
homeHTML = function () {
  if (!v4sLive()) return v4sHome0();
  const g = goalsSecHTML(), keep = goalsSecHTML; let inner = '';
  goalsSecHTML = () => ''; try { inner = v4sHome0(); } finally { goalsSecHTML = keep; }
  const P = S.player;
  return v4sAdvHTML() + `<div class="sec v4s-sec"><h3>🏠 ${T('v4s.dom')}</h3><div class="v4s-grid">${V4S_D.filter(q => !q.when || q.when(P)).map(q => v4sBtn(q, P)).join('')}</div></div>` + g + `<details class="sec v4s-more" data-v4smore="home"${UI.v4sMore_home ? ' open' : ''}><summary>${T('v4s.home_more')}</summary>${inner}</details>`; // 先看“该做什么”（参谋）和“能做什么”，再看目标与计分
};

/* 新手教学进行时用完整界面（教学按完整界面指引）：页签跟着显示 */
const v4sTop0 = renderTop;
renderTop = function () { v4sTop0(); try { document.body.classList.toggle('v4simple', v4sOn() && !(S && S.mp && S.mp.tut)); } catch (e) { } };

/* ---------- 开关：开局画面、游戏菜单 ---------- */
const v4sStartScr0 = mpShowStart;
mpShowStart = function () {
  v4sStartScr0();
  const box = $('#sheet .mpmodes'); if (!box || $('#v4sTog')) return;
  box.insertAdjacentHTML('afterend', `<label class="chk v4s-tog"><input type="checkbox" id="v4sTog" ${v4sOn() ? 'checked' : ''}> <b>${T('v4s.toggle')}</b><span class="muted">${T('v4s.toggle_x')}</span></label>`);
  $('#v4sTog').onchange = e => v4sSet(e.target.checked);
};
const v4sMenu0 = mpShowMenu;
mpShowMenu = function () {
  v4sMenu0();
  const box = $('#sheet .mpmenu'); if (!box) return;
  box.insertAdjacentHTML('afterbegin', `<button id="v4sMenuTog">${T(v4sOn() ? 'v4s.menu_off' : 'v4s.menu_on')}</button>`);
  $('#v4sMenuTog').onclick = () => { closeModal(); v4sSet(!v4sOn()); toast(T(v4sOn() ? 'v4s.on' : 'v4s.off')); };
};
