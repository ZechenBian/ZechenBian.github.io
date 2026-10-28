// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 网页版 v4 · 详细教程与行动手册 =====================
 * 新手教学有两版：经典的快速教程（原来的步骤，约 3 分钟）和详细教程（约 10 分钟，逐项讲清界面上每个部分和每类操作的作用机制）。
 * 两版用同一套聚光灯与说明卡（uimp/04h_tut.js），开始时把步骤表换成对应的一版。
 * 行动手册：每个行动的作用、代价、风险与机制（文字见 lang/98_v4t.js），有对局时再按当前局势实时显示占多少行动力、花多少钱、预估效果。 */
const TUT_Q = TUT_STEPS.slice(); // 快速教程（含 v2 改过的“援助法国”一步）
const v4tStep = k => TUT_Q.find(z => z.k === k) || null;
const v4tTab = tab => () => { UI.tab = tab; renderSide(); const b = $('#tabbody'); if (b) b.scrollTop = 0; };
const TUT_D = [
  { k: 'd_welcome' },
  { k: 'd_top', el: () => $('#kpis') || $('.top') },
  { k: 'd_cap', el: () => $('#apBox') },
  Object.assign({}, v4tStep('map'), { k: 'd_map' }),
  { k: 'd_views', el: () => $('#viewSeg') },
  { k: 'd_target', el: () => $('.side'), go: () => { if (UI.sel !== 'FRA') { select('FRA'); tutZoomEU(); } UI.tab = 'target'; renderSide(); } },
  { k: 'd_forms', el: () => $('#tabbody .v2acts') || $('#tabbody'), go: () => { tutTarget(); renderSide(); } },
  Object.assign({}, v4tStep('v2aid') || v4tStep('summit'), { k: 'd_aid' }),
  { k: 'd_deals', el: () => $('#tabbody .v2deals') || $('#tabbody .v2acts'), go: () => { tutTarget(); renderSide(); } },
  { k: 'd_queue', el: () => $('#queue') },
  { k: 'd_cmd', el: () => $('#cmdForm') },
  { k: 'd_home', el: () => $('.side'), go: v4tTab('home') },
  { k: 'd_goals', el: () => $('#tabbody .goals'), go: v4tTab('home'), skip: () => !$('#tabbody .goals') },
  { k: 'd_mil', el: () => $('.side'), go: v4tTab('mil') },
  { k: 'd_mob', el: () => $('.side'), go: v4tTab('weco') },
  { k: 'd_diplo', el: () => $('.side'), go: v4tTab('diplo') },
  { k: 'd_intel', el: () => $('.side'), go: v4tTab('intel') },
  Object.assign({}, v4tStep('end'), { k: 'd_end' }),
  { k: 'd_report', el: () => (tutRepOpen() ? $('#sheet .rep-kpis') || $('#sheet') : null), skip: () => !tutRepOpen() },
  { k: 'd_v4x', el: () => (tutRepOpen() ? $('#sheet .v4x') || $('#sheet') : null), skip: () => !tutRepOpen(), wait: () => !tutRepOpen() },
  { k: 'd_book', el: () => $('#mpbar [data-mp="menu"]') },
  { k: 'd_modes' },
  { k: 'done' }, // 最后一步沿用原来的“完成”（继续这一局 / 开始正式对局）
];
/* 开始教学：先把步骤表换成要的那一版（UI.v4tNext = 'd' 是详细教程，否则是快速教程） */
const v4tStart0 = tutStart;
tutStart = function () { const d = UI.v4tNext === 'd'; UI.v4tNext = null; TUT_STEPS.splice(0, TUT_STEPS.length, ...(d ? TUT_D : TUT_Q)); return v4tStart0(); };
function v4tDetailed() { UI.v4tNext = 'd'; tutStart(); }
/* 开局画面上的入口：两版教程 + 行动手册 */
tutCTA = function (first) {
  return `<div class="mptut ${first ? 'first' : ''}"><div><b>🎓 ${T('tut.cta')}</b><small>${T(first ? 'tut.cta_x' : 'tut.cta_x2')} ${T('v4t.cta_x')}</small></div><div class="v4t-btns"><button class="${first ? 'btn-primary' : ''}" data-mpgo="tut">${T('v4t.quick')}</button><button data-mpgo="tutd">${T('v4t.detail')}</button><button data-mpgo="v4book">${T('v4t.book')}</button></div></div>`;
};
const v4tBar0 = mpBarClick;
mpBarClick = function (b) { const g = b && (b.dataset.mpgo || b.dataset.mp); if (g === 'tutd') { v4tDetailed(); return; } if (g === 'v4book') { v4hShow(); return; } return v4tBar0(b); };
const v4tMenu0 = mpShowMenu;
mpShowMenu = function () {
  v4tMenu0();
  const box = $('#sheet .mpmenu'); if (!box) return;
  const tut = box.querySelector('[data-mpm="tut"]'), html = `${S && S.mp && S.mp.tut ? '' : `<button data-mpgo="tutd">${T('v4t.menu_d')}</button>`}<button data-mpgo="v4book">${T('v4t.menu_b')}</button>`;
  if (tut) tut.insertAdjacentHTML('afterend', html); else box.insertAdjacentHTML('beforeend', html);
};
const v4tHelp0 = mpShowHelp;
mpShowHelp = function () { v4tHelp0(); const f = $('#sheet .foot'); if (f && !f.querySelector('[data-mpgo="v4book"]')) f.insertAdjacentHTML('afterbegin', `<button data-mpgo="v4book">${T('v4t.menu_b')}</button>`); };

/* ---------- 行动手册 ---------- */
const V4H_MECH = ['cap', 'order', 'growth', 'stab', 'treasury', 'mil', 'rel', 'rep', 'war'];
const V4H_CATS = ['dip', 'econ', 'mil', 'covert', 'occ', 'dom', 'army'];
const V4H_DEALS = ['trade', 'alliance', 'nap', 'access', 'partner', 'armsctl', 'ceasefire', 'peace', 'vassal', 'lift_sanctions', 'lift_my_sanctions', 'aid', 'arms', 'tribute', 'join_war', 'break_alliance', 'tech_share', 'drop_ultimatum', 'pledge_no_attack', 'withdraw', 'send_troops', 'mobilize', 'raise_defense'];
const v4hActs = () => (W.ACTIONS || Object.values(W.ACT)).filter(a => !a.hidden);
function v4hRow(a, P, X) {
  const live = !!P, t = a.self ? P : X, meta = [];
  if (live && t) {
    try { const ap = W.apCost(S, a.id, t, {}); if (ap > 0) meta.push(T('v4h.cap', { n: ap })); } catch (e) { }
    try { const c = a.cost(S, P, t, {}) || 0; if (c > 0.0001) meta.push(T('v4h.cost', { x: { raw: fmtB(c) } })); } catch (e) { }
  }
  let pv = '';
  if (live && t && a.preview) { try { const m = a.preview(S, P, t, {}); pv = m ? TX(m) : ''; const st = W.actionStatus(S, a.id, t, {}); if (!st.ok) pv = (pv ? pv + sep() : '') + v4sWhy(st.reason); } catch (e) { pv = ''; } }
  const tags = [a.hostile ? ['', 'hostile'] : null, a.covert ? ['', 'covert'] : null, a.danger ? ['red', 'danger'] : null].filter(Boolean);
  const q = (T('a.' + a.id) + ' ' + T('v4h.a.' + a.id)).toLowerCase();
  return `<div class="v4h-row" data-v4hq="${esc(q)}"><div class="hd"><b>${esc(T('a.' + a.id))}</b>${tags.map(([c, k]) => `<span class="tag ${c}">${T('v4h.t.' + k)}</span>`).join('')}${meta.length ? `<em>${esc(meta.join(' · '))}</em>` : ''}</div><p>${esc(T('v4h.a.' + a.id))}</p>${pv ? `<p class="v4h-now"><b>${T('v4h.now')}</b>${a.self ? '' : ` · ${esc(T('v4h.vs', { a: { id: t } }))}`}${EN() ? ': ' : '：'}${esc(pv)}</p>` : ''}</div>`;
}
function v4hShow() {
  const live = !!(S && !UI.demo && MPS.on && S.actors[S.player]), P = live ? S.player : null;
  const X = live ? (UI.sel && UI.sel !== P && S.actors[UI.sel] && W.indep(S, UI.sel) && !W.isNeutral(S, UI.sel) ? UI.sel : W.IDS.filter(c => c !== P && S.actors[c] && W.indep(S, c) && !W.isNeutral(S, c)).sort((a, b) => W.power(S, b) - W.power(S, a))[0]) : null;
  const acts = v4hActs();
  const mech = V4H_MECH.map((k, i) => `<details class="v4h-m"${i < 2 ? ' open' : ''} data-v4hq="${esc((T('v4h.m.' + k + '.h') + ' ' + T('v4h.m.' + k + '.x')).toLowerCase())}"><summary>${T('v4h.m.' + k + '.h')}</summary><p>${esc(T('v4h.m.' + k + '.x'))}</p></details>`).join('');
  const cats = V4H_CATS.map(c => { const list = acts.filter(a => a.cat === c); return list.length ? `<div class="v4h-cat"><h4>${T('v4h.cat.' + c)}</h4>${list.map(a => v4hRow(a, P, X)).join('')}</div>` : ''; }).join('');
  const chance = ty => { if (!live || !X || !['trade', 'alliance', 'nap', 'access', 'partner', 'armsctl'].includes(ty)) return ''; try { if (W.dealCheck(S, X, { type: ty })) return ''; const sc = W.evalDeal(S, P, X, { type: ty }).score, pr = 1 / (1 + Math.exp(-sc * 4)); return T('pv.w' + (pr > 0.8 ? 0 : pr > 0.55 ? 1 : pr > 0.35 ? 2 : pr > 0.15 ? 3 : 4)); } catch (e) { return ''; } };
  const deals = V4H_DEALS.filter(t => I18N.has('v4h.dl.' + t)).map(t => { const ch = chance(t); return `<div class="v4h-row" data-v4hq="${esc((T('dk.' + t) + ' ' + T('v4h.dl.' + t)).toLowerCase())}"><div class="hd"><b>${esc(T('dk.' + t))}</b>${ch ? `<em>${esc(T('v4h.vs', { a: { id: X } }))} · ${esc(ch)}</em>` : ''}</div><p>${esc(T('v4h.dl.' + t))}</p></div>`; }).join('');
  showModal(`<div class="v4h"><h2>📖 ${T('v4h.title')}</h2><p class="sub">${T('v4h.sub')}</p><input id="v4hQ" type="search" placeholder="${esc(T('v4h.search'))}" autocomplete="off">
    <h3>⚙ ${T('v4h.sec_mech')}</h3><div class="v4h-mech">${mech}</div>
    <h3>🎯 ${T('v4h.sec_acts')}</h3>${cats}
    <h3>🤝 ${T('v4h.sec_deals')}</h3><p class="muted v4h-x">${T('v4h.sec_deals_x')}</p><div class="v4h-cat">${deals}</div>
    <p class="muted v4h-none" id="v4hNone" hidden>${T('v4h.none')}</p>
    <div class="foot"><button class="btn-primary" data-close="1">${T('u.close')}</button></div></div>`, 'start', true);
  const inp = $('#v4hQ'); if (!inp) return;
  inp.oninput = () => {
    const q = inp.value.trim().toLowerCase(); let n = 0;
    $$('#sheet [data-v4hq]').forEach(el => { const on = !q || el.dataset.v4hq.includes(q); el.hidden = !on; if (on && el.classList.contains('v4h-row')) n++; if (on && q && el.tagName === 'DETAILS') el.open = true; });
    $$('#sheet .v4h-cat').forEach(c => { c.hidden = !c.querySelector('.v4h-row:not([hidden])'); });
    const none = $('#v4hNone'); if (none) none.hidden = !q || n > 0 || !!$('#sheet details.v4h-m:not([hidden])');
  };
}
