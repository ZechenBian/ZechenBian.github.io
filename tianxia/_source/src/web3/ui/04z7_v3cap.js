/* ===================== 网页版 v3 · 行动力（百分比） =====================
 * 在 v2 的界面上，把“行动点”换成每回合 100% 的行动力：顶栏是一条行动力条，表单、队列、按钮上写占用的百分比。
 * 规则在引擎里（src/engine/06_turn.js 的“规则 v3”）：基础比例 + 花钱的部分（按金额占 GDP 的比例），乘本国系数。 */
const v3On = () => !!(window.TX_V3 && W.RULES3);

/* 顶栏：剩余行动力 + 一条进度条；悬停看本回合已排、已用和本国系数 */
function apBoxHTML(left, mx) {
  if (!v3On()) return `<span class="aplbl">${T('u.ap', { n: left, d: mx })}</span><span class="pips">` + Array.from({ length: mx }, (_, i) => `<i class="pip${i < left ? ' on' : ''}"></i>`).join('') + '</span>';
  const L = Math.max(0, Math.round(left)), q = S.queue.reduce((s, z) => s + (z.ap || 0), 0), r = v3Refund(), u = (S.apUsed || 0) + r, e = W.capEff(S, S.player).toFixed(2);
  const tip = r > 0 ? T('v3.cap_tr', { q, u, n: L, e, r }) : T('v3.cap_t', { q, u, n: L, e });
  return `<span class="aplbl">${T('v3.cap', { n: L })}</span><span class="v3cap ${L < 15 ? 'low' : ''}${r > 0 ? ' plus' : ''}" title="${esc(tip)}" role="meter" aria-valuemin="0" aria-valuemax="${100 + r}" aria-valuenow="${L}" aria-label="${esc(T('v3.cap', { n: L }))}"><i style="width:${clamp(L / (100 + r) * 100, 0, 100)}%"></i></span>`;
}
/* 上回合作废的协议退还的行动力（引擎在回合开始时把已用记成负数；这里从本人的战报里找出数目，好在悬停里分开写） */
function v3Refund() {
  const R = S.report; let r = 0;
  if (R && R.turn === S.turn - 1) for (const e of R.actions || []) if (e && e.did != null && e.msg && (e.msg.k === 'dl.res_lost' || e.msg.k === 'dl.res_void')) r += +(e.msg.p && e.msg.p.n) || 0;
  return Math.max(r, -(S.apUsed || 0), 0);
}
/* 表单里每一项旁边：占用的百分比（v2 是几个圆点） */
function v2ApDots(n) { return v3On() ? `<span class="apc v3pct">${n > 0 ? n + '%' : T('u.ap0')}</span>` : `<span class="apc">${'<i></i>'.repeat(Math.max(0, n))}</span>`; }

/* 帮助：v2 的各节前面加一节“行动力” */
function mpShowHelp() {
  const keys = ['flow', 'cap', 'tabs', 'acts', 'pkg', 'deals', 'cmd', 'mob', 'ai', 'net', 'map', 'limits'];
  const pre = k => (['flow', 'net', 'map', 'limits'].includes(k) ? 'mp.h.' : k === 'cap' ? 'v3.h.' : 'v2.h.');
  showModal(`<h2>${T('mp.help')}</h2><div class="help">${keys.map(k => `<p><b>${T(pre(k) + k)}</b>${T(pre(k) + k + '_x')}</p>`).join('')}${v3CapTable()}${I18N.has('web.disc') ? `<p class="disc">${T('web.disc')}</p>` : ''}</div><div class="foot">${S && S.mp && S.mp.tut ? '' : `<button data-mpgo="tut">🎓 ${T('tut.menu')}</button>`}<button class="btn-primary" data-close="1">${T('u.gotit')}</button></div>`, 'narrow', true);
}
/* 帮助里的一张小表：本国做几件常见的事各占多少（按当前局势现算） */
function v3CapTable() {
  if (!S || UI.demo || !v3On()) return '';
  const P = S.player, g = S.actors[P].gdp, X = W.IDS.find(c => c !== P && W.indep(S, c) && !W.isNeutral(S, c) && !W.isHuman(S, c)) || P;
  const rows = [['condemn', X, {}], ['sanction', X, { level: 1 }], ['cyber', X, {}], ['aid', X, { amt: g * 0.001 }], ['aid', X, { amt: g * 0.005 }], ['aid', X, { amt: g * 0.02 }], ['research', P, {}], ['strike', X, {}], ['invade', X, {}], ['nuke', X, { scope: 'tactical' }]];
  const lab = (id, p) => T('a.' + id) + (p.amt ? ' · ' + T('v3.gdp_share', { s: +(p.amt / g * 100).toFixed(2) }) : '');
  return `<div class="v3tbl"><b>${T('v3.h.table', { a: P })}</b><table>${rows.map(([id, t, p]) => `<tr><td>${esc(lab(id, p))}</td><td class="num">${W.apCost(S, id, t, p)}%</td></tr>`).join('')}<tr><td>${esc(T('v3.h.deal'))}</td><td class="num">${W.dealAP([{ type: 'trade' }], S)}% / ${W.dealAP([{ type: 'alliance' }], S)}%</td></tr><tr><td>${esc(T('v3.h.mob'))}</td><td class="num">${W.mobAP(S, 0, 1)}%</td></tr></table><small class="muted">${T('v3.h.eff', { e: W.capEff(S, P).toFixed(2) })}</small></div>`;
}
