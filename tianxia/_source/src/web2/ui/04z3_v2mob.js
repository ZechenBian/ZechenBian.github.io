// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 新版 · 动员页：国家对战争投入多少，全在这一页 =====================
 * 军费与投入方向（免费、立即）→ 动员等级 0–5（提高花 1 点、立即生效；3–5 是总体战，战时政策里的“总体战动员”并入这里）→
 * 兵员（征兵，旁边是一次性的“紧急征召”）→ 装备（军工订单，旁边是“突击生产”）→ 战争融资（公债、印钞）→
 * 征用（旁边是“紧急征发”）→ 占领区（掠夺 + 洗劫、征兵 + 强征、强迫劳动）→ 在训的新兵与在途的订单。 */
const V2_ONCE = { conscript: 'draft', procure: 'crash', requis: 'seize', plunder: 'loot', levy: 'press' };
function v2MobHTML() {
  const P = S.player, x = S.actors[P], v = W.weView(S, P), c = v.cfg, cur = W.mobIdx(x);
  const gauge = (lbl, val, max, cls, txt) => `<div class="mpg"><span>${lbl}</span><div class="bar"><div style="width:${clamp(val / max * 100, 0, 100)}%;background:var(--${cls})"></div></div><b class="num">${txt}</b></div>`;
  const acts = Object.fromEntries(v.acts.map(a => [a.id, a]));
  const brNow = v2F('mob').br || 'land'; // 突击生产默认与订单同一兵种
  const once = k => (V2_ONCE[k] && acts[V2_ONCE[k]] ? `<div class="v2once"><small class="muted">${T('v2.once')}</small>${mpWeActHTML(acts[V2_ONCE[k]]).replace(`<option value="${brNow}">`, `<option value="${brNow}" selected>`)}</div>` : '');
  let s = `<div class="sec"><h3>${T('v2.mob.title')}</h3><p class="muted" style="font-size:12px;margin:0 0 8px">${T('v2.mob.x')}</p>
    <div class="grid2">
      <div class="stat"><span>${T('u.k.treasury')}</span><b class="${x.treasury < 0 ? 'bad' : ''}">${fmtB(x.treasury - W.moneyQueued(S))}</b></div>
      <div class="stat"><span>${T('mp.we.credit')}</span><b>${fmtB(v.credit)}</b></div>
      <div class="stat"><span>${T('mp.we.debt')}</span><b class="${v.debt > x.gdp * 0.5 ? 'bad' : ''}">${v.debt > 0.05 ? fmtB(v.debt) : '0'}</b></div>
      <div class="stat"><span>${T('mp.we.milcap')}</span><b>${v.milCap}%</b></div>
    </div>
    ${gauge(T('mp.we.infl'), Math.max(0, v.infl), 60, v.infl > 30 ? 'hostile' : v.infl > 10 ? 'warn' : 'neutral', (+v.infl).toFixed(1) + '%')}
    ${gauge(T('mp.we.weary'), v.weary, 100, v.weary > 60 ? 'hostile' : v.weary > 30 ? 'warn' : 'neutral', Math.round(v.weary))}
    ${v.last ? `<p class="muted" style="font-size:12px;margin:6px 0 0">${T('mp.we.last', { x: { raw: Object.entries(v.last).filter(([, n]) => Math.abs(n) > 0.004).map(([k, n]) => T('mp.we.l.' + k) + ' ' + (k === 'levy' ? persT(n) : fmtB(n))).join(sep()) || '—' } })}</p>` : ''}</div>`;
  // 军费与投入方向
  const annual = x.gdp * x.milPct / 100, cap = S.commits.filter(z => z.type === 'armsctl').reduce((m, z) => Math.min(m, z.cap), Infinity);
  s += `<div class="sec"><h3>${T('u.budget')}</h3>
    <div class="slider"><span>${T('u.milpct')}</span><input type="range" id="milPct" min="0.5" max="${Math.max(25, W.weMilCap(S, P))}" step="0.1" value="${x.milPct.toFixed(1)}"><b class="num" id="milPctV">${x.milPct.toFixed(1)}%</b></div>
    <div class="muted" style="font-size:12px" id="milPctN">${budgetNote(x, annual, cap)}</div>
    <div class="slider" style="margin-top:8px"><span>${T('u.mix')}</span><select id="mixSel">${(x.mixMode === 'custom' ? ['custom'] : []).concat(['bal', 'land', 'navy', 'air']).map(m => `<option value="${m}" ${(x.mixMode || 'bal') === m ? 'selected' : ''}>${T('u.mix.' + m)}</option>`).join('')}</select></div>
    <div class="muted" style="font-size:12px">${T('u.mixnow', { a: Math.round(x.mix[0] * 100), b: Math.round(x.mix[1] * 100), c: Math.round(x.mix[2] * 100), k: T('mob6.' + cur) })}</div></div>`;
  // 动员等级
  const left = W.apLeft(S), show = UI.v2mobHover ?? cur;
  s += `<div class="sec"><h3>${T('v2.mob.level')} <span class="tag ${cur >= 3 ? 'red' : ''}">${T('mob6.' + cur)}</span></h3>
    <div class="seg v2mobseg">${[0, 1, 2, 3, 4, 5].map(lv => `<button type="button" data-v2mob="${lv}" class="${lv === cur ? 'on' : ''} ${lv >= 3 ? 'tw' : ''}" ${lv > cur && left < W.mobAP(S, cur, lv) ? 'disabled' : ''} title="${esc(T('mob6.' + lv) + (W.RULES3 && lv > cur ? ' · ' + T('u.apn', { n: W.mobAP(S, cur, lv) }) : ''))}">${T('v2.mob.s' + lv)}</button>`).join('')}</div>
    <div class="v2mobd" id="v2mobd">${v2MobDesc(show)}</div>
    <p class="muted" style="font-size:12px;margin:6px 0 0">${T('v2.mob.cost', { n: W.mobAP(S, cur, Math.min(5, cur + 1)) || W.mobAP(S, 0, 1) })}${cur < 5 && left < W.mobAP(S, cur, cur + 1) ? ' · ' + T('v2.sum.noap', { n: left }) : ''}</p></div>`;
  // 兵员与装备
  const cn = v2F('mob').cn > 0 ? v2F('mob').cn : (v2F('mob').cn = W.conscriptN(S, P, 1));
  const cst = W.actionStatus(S, 'conscript', P, { n: cn });
  const br = v2F('mob').br || 'land', pa = v2F('mob').pa > 0 ? v2F('mob').pa : (v2F('mob').pa = v2Nice(W.procCost(S, P, 1)));
  const pst = W.actionStatus(S, 'procure', P, { branch: br, amt: pa });
  s += `<div class="sec"><h3>${T('v2.mob.forces')}</h3><div class="v2rows">
    <div class="v2row"><div class="row"><b>${T('a.conscript')}</b><span class="v2amt"><input id="v2cn" type="number" min="1" step="1" data-v2mobin="cn" value="${Math.round(cn)}"><small>${T('v2.unit_k')}</small></span><button class="btn-primary" data-v2q="conscript" ${cst.ok ? '' : 'disabled'}>${T('u.addq')}</button></div>
      <div class="muted" style="font-size:12px">${esc(cst.ok ? TX(cst.preview) + ' · ' + fmtB(cst.cost) + (W.RULES3 ? ' · ' + T('u.apn', { n: cst.ap }) : '') : TX(cst.reason))}</div>${once('conscript')}</div>
    <div class="v2row"><div class="row"><b>${T('a.procure')}</b><select id="v2br" data-v2mobin="br">${['land', 'air', 'navy'].map(b => `<option value="${b}" ${b === br ? 'selected' : ''}>${T('br.' + b)}</option>`).join('')}</select><span class="v2amt"><input id="v2pa" type="number" min="0" step="any" data-v2mobin="pa" value="${v2In(pa)}"><small>${T('v2.unit')}</small></span><button class="btn-primary" data-v2q="procure" ${pst.ok ? '' : 'disabled'}>${T('u.addq')}</button></div>
      <div class="muted" style="font-size:12px">${esc(pst.ok ? TX(pst.preview) + ' · ' + fmtB(pst.cost) + (W.RULES3 ? ' · ' + T('u.apn', { n: pst.ap }) : '') : TX(pst.reason))}</div>${once('procure')}</div>
  </div>`;
  const orders = x.orders || [];
  if ((x.train || []).length || orders.length) s += `<div class="list pipe" style="margin-top:6px">${(x.train || []).map(t => `<div class="item"><div class="row"><span>${T('u.pipe.train', { n: { pers: t.n } })}</span><b class="num">${T('u.inN', { n: Math.max(1, t.eta - S.turn) })}</b></div></div>`).join('')}${orders.map(o => `<div class="item"><div class="row"><span>${T('u.pipe.order', { k: T('br.' + o.br), n: Math.round(W.procUnits(S, P, o.br, o.pts)), u: T('unit.' + o.br) })}</span><b class="num">${T('u.inN', { n: Math.max(1, o.eta - S.turn) })}</b></div></div>`).join('')}</div>`;
  s += `<p class="muted" style="font-size:12px;margin:6px 0 0">${T('v2.mob.forces_x')}</p></div>`;
  // 战时政策：融资、征用、占领区
  const row = k => `<div class="v2wrow">${mpWeRow(k, v.pol[k])}${once(k)}</div>`;
  s += `<div class="sec"><h3>${T('v2.mob.money')}</h3><div class="mpwe">${row('bonds')}${row('print')}${row('requis')}</div></div>`;
  s += `<div class="sec"><h3>${T('v2.mob.occ')}</h3>${v.occ.length ? `<p class="muted" style="font-size:12px;margin:0 0 6px">${T('mp.we.occ', { x: { list: v.occ.map(id => ({ id })) } })}</p><div class="mpwe">${row('plunder')}${row('levy')}${row('forced')}</div>` : `<p class="muted" style="font-size:12.5px">${T('v2.mob.noocc')}</p>`}</div>`;
  s += `<div class="sec"><p class="muted" style="font-size:12px;margin:0">${T('mp.we.costs_x', { x: { raw: ['infl', 'stab', 'resist', 'rep', 'interest', 'gain'].map(k => T('mp.cost.' + k) + ' ' + c[k] + '×').join(sep()) } })}</p></div>`;
  return s;
}
/* 某一级动员的效果：0–3 级的战力与兵员倍数；3–5 级再加上总体战的上限与代价 */
function v2MobDesc(lv) {
  const m = Math.min(3, lv), base = TX({ k: 'pv.mobilize', p: { n: W.MOB[m], d: W.MANP[m], s: [0, 0.1, 0.35, 0.8][m] } });
  return `<b>${T('mob6.' + lv)}</b>${colonT()}${esc(base)}${lv >= 3 ? `<div style="margin-top:3px">${T('v2.mob.tw')}${mpWeEff('total', lv - 2)}</div>` : ''}`;
}
document.addEventListener('click', e => {
  if (!v2On() || !S || UI.demo || !MPS.on) return;
  const t = e.target.closest && e.target.closest('[data-v2mob], [data-v2q]'); if (!t) return;
  const d = t.dataset, P = S.player;
  if (d.v2mob !== undefined) {
    const lv = +d.v2mob, cur = W.mobIdx(S.actors[P]); if (lv === cur) return;
    const need = W.mobAP(S, cur, lv); if (lv > cur && W.apLeft(S) < need) { toast(T('c.ap', { n: need })); return; }
    const r = doCmd('setMob', [lv]); if (r === null || r === undefined) toast(T('mp.p.fail')); else toast(T('v2.mob.set', { k: T('mob6.' + lv) }) + (lv > cur ? ' · ' + T('u.apn', { n: need }) : ''));
    UI.v2mobHover = null; renderAll(); return;
  }
  if (d.v2q === 'conscript' || d.v2q === 'procure') {
    const f = v2F('mob'), p = d.v2q === 'conscript' ? { n: Math.round(f.cn) } : { branch: f.br || 'land', amt: f.pa };
    const r = W.queueAction(S, d.v2q, P, p); if (!r.ok) { toast(r.reason); return; }
    toast(T('u.queued', { x: { raw: v2QLabel(S.queue[S.queue.length - 1]) } })); renderTop(); renderSide(); renderQueue();
  }
});
document.addEventListener('change', e => {
  if (!v2On() || !S || UI.demo) return;
  const t = e.target, k = t.dataset && t.dataset.v2mobin; if (!k) return;
  const f = v2F('mob');
  if (k === 'cn') f.cn = Math.max(1, Math.round(+t.value || 1)); else if (k === 'pa') f.pa = v2Out(t.value); else if (k === 'br') f.br = ['land', 'air', 'navy'].includes(t.value) ? t.value : 'land';
  renderSide();
});
/* 悬停在某一级上：预览那一级的效果 */
document.addEventListener('mouseover', e => {
  if (!v2On() || !S) return;
  const b = e.target.closest && e.target.closest('[data-v2mob]'); const el = $('#v2mobd'); if (!b || !el) return;
  el.innerHTML = v2MobDesc(+b.dataset.v2mob);
});
document.addEventListener('mouseout', e => {
  if (!v2On() || !S) return;
  const b = e.target.closest && e.target.closest('.v2mobseg'); const el = $('#v2mobd'); if (!b || !el || (e.relatedTarget && b.contains(e.relatedTarget))) return;
  el.innerHTML = v2MobDesc(W.mobIdx(S.actors[S.player]));
});
