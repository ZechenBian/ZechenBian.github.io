// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 联机版 · 新手教学 =====================
 * 开一局 1939 年的英国（单人 + 规则推演；教学局不存档，不会覆盖玩家的本地存档），用聚光灯和说明卡带新玩家走完一个回合。
 * 每步都可以“上一步 / 下一步”，也可以随时跳到最后一步；要玩家动手的步骤会等玩家做完（也可以点“帮我做”）。
 * 别的弹窗（战报以外）开着、或者正在结算时，说明卡先让开。 */
const TUT_KEY = (window.TX_LSP || 'tianxia') + '.tut.done';
const TUT = { on: false, i: 0, turn0: 0, t: null, raf: 0, pending: false, at: 0, lang: '' };
const tutDone = () => { try { return !!localStorage.getItem(TUT_KEY); } catch (e) { return false; } };
const tutMark = () => { try { localStorage.setItem(TUT_KEY, String(Date.now())); } catch (e) { } };
const tutRepOpen = () => !$('#modal').hidden && $('#sheet').classList.contains('txrep'); // 季度战报开着
const tutAct = id => { const h = document.querySelector(`#tabbody [data-toggle="${id}"]`); return h ? h.closest('.act') : null; };
const tutCalm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const tutTarget = () => { UI.tab = 'target'; UI.cat = 'dip'; if (!UI.sel || UI.sel === S.player || !W.indep(S, UI.sel)) { select('FRA'); tutZoomEU(); } };
/* 镜头对准英法之间（法国的范围含海外领地，zoomTo 会拉到全世界） */
function tutZoomEU() { const a = GEO.label.FRA, b = GEO.label.GBR; if (!a || !b) return; const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2; view.k = 3.5; view.x = GEO.w / 2 - cx * view.k; view.y = GEO.h / 2 - cy * view.k; applyView(); }
/* 步骤：el 要照亮的元素；go 进入这一步时做的准备；wait 要等玩家完成的事；help “帮我做”；skip 这一步不适用时跳过 */
const TUT_STEPS = [
  { k: 'welcome' },
  { k: 'top', el: () => $('.top') },
  { k: 'map', el: () => $('#mapwrap'), go: () => { if (UI.sel !== 'FRA') tutZoomEU(); }, wait: () => UI.sel === 'FRA', help: () => { select('FRA'); tutZoomEU(); } }, // 先把镜头拉到西欧，手机上也点得到法国
  { k: 'target', el: () => $('.side'), go: () => { if (UI.sel !== 'FRA') { select('FRA'); tutZoomEU(); } UI.tab = 'target'; UI.cat = 'dip'; renderSide(); } },
  { k: 'summit', el: () => tutAct('summit'), go: () => { tutTarget(); renderSide(); },
    wait: () => S.queue.some(q => q.type === 'summit'),
    help: () => { tutTarget(); UI.open = { summit: true }; renderSide(); const b = $('#tabbody [data-queue="summit"]'); if (b && !b.disabled) b.click(); } },
  { k: 'queue', el: () => $('#queue') },
  { k: 'cmd', el: () => $('#cmdForm') },
  { k: 'goals', el: () => $('#tabbody .goals'), go: () => { UI.tab = 'home'; renderSide(); const b = $('#tabbody'); if (b) b.scrollTop = 0; } },
  { k: 'layers', el: () => $('#lyrBtn'), skip: () => !$('#lyrBtn') }, // 地图图层（有图层面板时）
  { k: 'tabs', el: () => $('#tabs') },
  { k: 'end', el: () => $('#btnEnd'), wait: () => S.turn > TUT.turn0 && !UI.busy, help: () => endTurn() },
  { k: 'report', el: () => (tutRepOpen() ? $('#sheet') : null), skip: () => !tutRepOpen(), wait: () => !tutRepOpen() },
  { k: 'online', el: () => $('#mpbar') },
  { k: 'done' },
];
const tutParams = () => ({ x: { raw: T('a.summit') }, y: { raw: T('u.addq') }, e: { raw: (($('#btnEnd') || {}).textContent || T('u.end')).replace(/\s*▸\s*$/, '') }, o: { raw: T('mp.m.net') }, a: 'FRA' });
function tutInject() {
  if ($('#tutCard')) return;
  document.body.insertAdjacentHTML('beforeend', '<div class="tuthole" id="tutHole" hidden></div><div class="tutcard" id="tutCard" role="dialog" aria-live="polite" hidden></div>');
  addEventListener('resize', tutSoon); document.addEventListener('scroll', tutSoon, true);
}
const tutSoon = () => { if (!TUT.on || TUT.raf) return; TUT.raf = requestAnimationFrame(() => { TUT.raf = 0; tutPlace(); }); };
/* 开始教学：新开一局 1939 年的英国（不存档） */
function tutStart() {
  const go = () => {
    W.useScenario('1939');
    const c = Object.assign(mpCfg0(), { llmWorld: false, th: false, diff: 'easy' });
    const s = W.newGame({ player: 'GBR', scen: '1939', seed: (Math.random() * 2 ** 31) >>> 0, diff: 'easy', humans: ['GBR'], th: false });
    s.weCfg = mpCostCfg(c.we); s.weAI = false;
    const agents = {}; for (const r of mpPlayable(false, '1939')) if (r.id !== 'GBR') agents[r.id] = 'rule';
    s.mp = { mode: 'solo', agents, cfg: c, phase: 'plan', phaseAt: Date.now(), ver: 0, tut: 1 }; W.goalsInit(s);
    mpAdoptLocal(s, true); closeModal();
    tutInject(); TUT.on = true; TUT.turn0 = S.turn; clearInterval(TUT.t); TUT.t = setInterval(tutTick, 300);
    tutShow(0, 1);
  };
  if (S && !UI.demo && MPS.on && !(S.mp && S.mp.tut)) mpConfirm(T('tut.leave_q'), () => { mpLocalSave(); go(); }); else go(); // 本地对局先存一下（联网对局不受影响）
}
function tutStop(done) {
  TUT.on = false; clearInterval(TUT.t); TUT.t = null;
  const c = $('#tutCard'), h = $('#tutHole'); if (c) c.hidden = true; if (h) h.hidden = true;
  if (done) tutMark();
}
function tutShow(i, dir) {
  const N = TUT_STEPS.length; i = Math.max(0, Math.min(N - 1, i));
  while (i > 0 && i < N - 1 && TUT_STEPS[i].skip && TUT_STEPS[i].skip()) i += dir < 0 ? -1 : 1;
  const st = TUT_STEPS[i]; TUT.i = i; TUT.at = Date.now();
  if (st.go) try { st.go(); } catch (e) { console.warn('tut', e); }
  TUT.pending = !!(st.wait && !st.wait()); // 进入时还没做到的，才等玩家去做
  if (st.k === 'done') tutMark();
  tutRender(); tutScroll(); tutPlace();
}
function tutRender() {
  const card = $('#tutCard'); if (!card) return;
  const st = TUT_STEPS[TUT.i], n = TUT.i + 1, m = TUT_STEPS.length, first = TUT.i === 0, last = st.k === 'done', w = TUT.pending;
  TUT.lang = I18N.getLang();
  const nav = last ? `<button data-tut="real">${T('tut.real')}</button><button class="btn-primary" data-tut="keep">${T('tut.keep')}</button>`
    : `${first ? `<button data-tut="skip">${T('tut.skip')}</button>` : `<button data-tut="prev">${T('tut.prev')}</button>`}${w && st.help ? `<button class="btn-primary" data-tut="help">${T('tut.help')}</button>` : ''}<button class="${w ? '' : 'btn-primary'}" data-tut="next">${T(first ? 'tut.begin' : 'tut.next')}</button>`;
  card.innerHTML = `<div class="tuth"><span>🎓 ${T('tut.step', { n, m })}</span>${last ? '' : `<button class="tutx" data-tut="skip" title="${esc(T('tut.skip'))}" aria-label="${esc(T('tut.skip'))}">✕</button>`}</div>
    <div class="tutbar"><i style="width:${Math.round(n / m * 100)}%"></i></div>
    <h3>${T('tut.s.' + st.k + '.h')}</h3><p>${T('tut.s.' + st.k + '.x', tutParams())}</p>
    ${w ? `<div class="tutwait"><i class="pulse-dot"></i>${T('tut.wait')}</div>` : ''}
    <div class="tutf">${nav}</div>`;
}
/* 要照亮的元素不在视野里时滚过去（手机上页面会滚动；桌面上侧栏会滚动） */
function tutScroll() {
  const st = TUT_STEPS[TUT.i], el = st.el && st.el(); if (!el || el.closest('#modal')) return;
  const r = el.getBoundingClientRect();
  if (r.top < 0 || r.bottom > innerHeight) try { el.scrollIntoView({ block: r.height > innerHeight * 0.7 ? 'start' : 'center', behavior: tutCalm() ? 'auto' : 'smooth' }); } catch (e) { }
}
function tutPlace() {
  if (!TUT.on) return;
  const card = $('#tutCard'), hole = $('#tutHole'); if (!card || !hole) return;
  if (TUT.lang !== I18N.getLang()) tutRender(); // 中途切换了界面语言
  const st = TUT_STEPS[TUT.i];
  let el = st.el ? st.el() : null; if (el && !el.getClientRects().length) el = null;
  const inModal = !!(el && el.closest('#modal'));
  if (!$('#busy').hidden || (!$('#modal').hidden && !inModal)) { card.hidden = true; hole.hidden = true; return; } // 结算中、或别的弹窗开着：先让开
  card.hidden = false; hole.hidden = false;
  const vw = innerWidth, vh = innerHeight, M = 8, G = 12;
  if (!el) { hole.className = 'tuthole full'; hole.style.cssText = ''; card.className = 'tutcard mid'; card.style.cssText = ''; return; }
  const r = el.getBoundingClientRect(), pad = 4;
  const L = Math.max(2, r.left - pad), Tp = Math.max(2, r.top - pad), R = Math.min(vw - 2, r.right + pad), B = Math.min(vh - 2, r.bottom + pad);
  hole.className = 'tuthole'; hole.style.cssText = `left:${L}px;top:${Tp}px;width:${Math.max(0, R - L)}px;height:${Math.max(0, B - Tp)}px`;
  if (vw < 640) { card.className = 'tutcard dock ' + ((r.top + r.bottom) / 2 > vh / 2 ? 'at-top' : 'at-bot'); card.style.cssText = ''; return; } // 手机：停在离目标远的一端
  card.className = 'tutcard'; card.style.cssText = 'left:0;top:0';
  const cw = card.offsetWidth, ch = card.offsetHeight; let x, y;
  if (R + G + cw <= vw - M) { x = R + G; y = r.top; }
  else if (L - G - cw >= M) { x = L - G - cw; y = r.top; }
  else if (B + G + ch <= vh - M) { y = B + G; x = r.left + r.width / 2 - cw / 2; }
  else if (Tp - G - ch >= M) { y = Tp - G - ch; x = r.left + r.width / 2 - cw / 2; }
  else { x = Math.max(r.left, 0) + 16; y = Math.min(r.bottom, vh) - ch - 16; } // 目标太大：放在目标里面的左下角
  x = Math.max(M, Math.min(vw - cw - M, x)); y = Math.max(M, Math.min(vh - ch - M, y));
  card.style.cssText = `left:${Math.round(x)}px;top:${Math.round(y)}px`;
}
function tutTick() {
  if (!TUT.on) return;
  if (!S || UI.demo || !MPS.on || !S.mp || !S.mp.tut) { tutStop(false); return; } // 离开了教学局
  const st = TUT_STEPS[TUT.i];
  if (TUT.pending && Date.now() - TUT.at > 250 && $('#busy').hidden && st.wait()) { tutShow(TUT.i + 1, 1); return; }
  tutPlace();
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-tut]'); if (!b || !TUT.on) return;
  const k = b.dataset.tut, st = TUT_STEPS[TUT.i];
  if (k === 'next') tutShow(TUT.i + 1, 1);
  else if (k === 'prev') tutShow(TUT.i - 1, -1);
  else if (k === 'help' && st.help) { try { st.help(); } catch (err) { console.warn('tut', err); } tutScroll(); tutPlace(); }
  else if (k === 'skip') tutShow(TUT_STEPS.length - 1, 1); // 跳过：直接到最后一步（继续这一局 / 开始正式对局）
  else if (k === 'keep') { tutStop(true); if (S && S.mp) { delete S.mp.tut; mpLocalSave(); } toast(T('tut.kept'), 5000); }
  else if (k === 'real') { tutStop(true); mpShowStart(); mpDemo(); }
});
/* 开局画面上的入口：第一次来的玩家放在最前面 */
function tutCTA(first) {
  return `<div class="mptut ${first ? 'first' : ''}"><div><b>🎓 ${T('tut.cta')}</b><small>${T(first ? 'tut.cta_x' : 'tut.cta_x2')}</small></div><button class="${first ? 'btn-primary' : ''}" data-mpgo="tut">${T(first ? 'tut.go' : 'tut.again')}</button></div>`;
}
