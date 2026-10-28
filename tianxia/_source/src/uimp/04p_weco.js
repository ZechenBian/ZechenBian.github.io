// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 联机版 · 战时经济面板：以战养战与极限暴兵 ===================== */
function mpWecoHTML() {
  const P = S.player, x = S.actors[P], v = W.weView(S, P), c = v.cfg;
  const gauge = (lbl, val, max, cls, txt) => `<div class="mpg"><span>${lbl}</span><div class="bar"><div style="width:${clamp(val / max * 100, 0, 100)}%;background:var(--${cls})"></div></div><b class="num">${txt}</b></div>`;
  let s = `<div class="sec"><h3>${T('mp.we.title')}</h3><p class="muted" style="font-size:12px;margin:0 0 8px">${T('mp.we.x')}</p>
    <div class="grid2">
      <div class="stat"><span>${T('u.k.treasury')}</span><b class="${x.treasury < 0 ? 'bad' : ''}">${fmtB(x.treasury)}</b></div>
      <div class="stat"><span>${T('mp.we.credit')}</span><b>${fmtB(v.credit)}</b></div>
      <div class="stat"><span>${T('mp.we.debt')}</span><b class="${v.debt > x.gdp * 0.5 ? 'bad' : ''}">${v.debt > 0.05 ? fmtB(v.debt) : '0'}</b></div>
      <div class="stat"><span>${T('mp.we.milcap')}</span><b>${v.milCap}%</b></div>
    </div>
    ${gauge(T('mp.we.infl'), Math.max(0, v.infl), 60, v.infl > 30 ? 'hostile' : v.infl > 10 ? 'warn' : 'neutral', (+v.infl).toFixed(1) + '%')}
    ${gauge(T('mp.we.weary'), v.weary, 100, v.weary > 60 ? 'hostile' : v.weary > 30 ? 'warn' : 'neutral', Math.round(v.weary))}
    ${v.last ? `<p class="muted" style="font-size:12px;margin:6px 0 0">${T('mp.we.last', { x: { raw: Object.entries(v.last).filter(([, n]) => Math.abs(n) > 0.004).map(([k, n]) => T('mp.we.l.' + k) + ' ' + (k === 'levy' ? persT(n) : fmtB(n))).join(sep()) || '—' } })}</p>` : ''}
    ${v.occ.length ? `<p class="muted" style="font-size:12px;margin:4px 0 0">${T('mp.we.occ', { x: { list: v.occ.map(id => ({ id })) } })}</p>` : ''}</div>`;
  s += `<div class="sec"><h3>${T('mp.we.policies')}</h3><div class="mpwe">${W.WE_KEYS.map(k => mpWeRow(k, v.pol[k])).join('')}</div></div>`;
  s += `<div class="sec"><h3>${T('mp.we.acts')}</h3><p class="muted" style="font-size:12px;margin:0 0 6px">${T('mp.we.acts_x')}</p><div class="mpweacts">${v.acts.map(a => mpWeActHTML(a)).join('')}</div></div>`;
  s += `<div class="sec"><h3>${T('mp.we.costs')}</h3><p class="muted" style="font-size:12px;margin:0">${T('mp.we.costs_x', { x: { raw: ['infl', 'stab', 'resist', 'rep', 'interest', 'gain'].map(k => T('mp.cost.' + k) + ' ' + c[k] + '×').join(sep()) } })}</p></div>`;
  return s;
}
function mpWeEff(k, lv) {
    const v = W.weView(S, S.player), z = v.pol[k].est[lv]; if (!z || !lv) return T('mp.we.off');
    if ((k === 'plunder' || k === 'levy') && !v.occ.length) return `<span class="muted">${T('we.noocc')}</span>`;
    const parts = [];
    if (z.money) parts.push(`<span class="good">+${fmtB(z.money)}${T('mp.we.perq')}</span>`);
    if (z.pers) parts.push(`<span class="good">+${persT(z.pers)}${T('mp.we.perq')}</span>`);
    if (z.ind && z.ind !== 1) parts.push(`<span class="good">${T('mp.we.ind', { n: Math.round((z.ind - 1) * 100) })}</span>`);
    if (z.indOcc) parts.push(`<span class="good">${T('mp.we.indocc', { n: Math.round(z.indOcc * 100) })}</span>`);
    if (z.oil) parts.push(`<span class="good">${T('mp.we.oil', { n: z.oil.toFixed(1) })}</span>`);
    if (z.pcap && z.pcap !== 1) parts.push(`<span class="good">${T('mp.we.pcap', { n: Math.round((z.pcap - 1) * 100) })}</span>`);
    if (z.mil) parts.push(`<span class="good">${T('mp.we.mil', { n: z.mil })}</span>`);
    if (z.debt) parts.push(`<span class="bad">${T('mp.we.c.debt')}</span>`);
    if (z.infl) parts.push(`<span class="bad">${T('mp.we.c.infl', { n: z.infl.toFixed(1) })}</span>`);
    if (z.g) parts.push(`<span class="bad">${T('mp.we.c.g', { n: (z.g * 4).toFixed(1) })}</span>`);
    if (z.stab) parts.push(`<span class="bad">${T('mp.we.c.stab', { n: z.stab.toFixed(1) })}</span>`);
    if (z.weary) parts.push(`<span class="bad">${T('mp.we.c.weary', { n: z.weary })}</span>`);
    if (z.resist) parts.push(`<span class="bad">${T('mp.we.c.resist', { n: z.resist.toFixed(0) })}</span>`);
    if (z.rep) parts.push(`<span class="bad">${T('mp.we.c.rep')}</span>`);
    return parts.join(' · ') || T('mp.we.noeff');
}
const mpLvPre = L => (L ? `<b>${T('we.lv' + L)}</b>${EN() ? ': ' : '：'}` : '');
function mpWeRow(k, p) {
  const L = p.L;
  return `<div class="mpwerow ${L ? 'on' : ''}" data-werow="${k}" data-wecur="${L}"><div class="row"><b>${T('we.k.' + k)}</b><span class="seg mini">${[0, 1, 2, 3].map(lv => `<button data-wek="${k}" data-wel="${lv}" class="${lv === L ? 'on' : ''}" title="${esc(T('we.lv' + lv))}">${lv === 0 ? T('mp.we.off_s') : lv}</button>`).join('')}</span></div>
    <div class="muted" style="font-size:12px">${T('we.d.' + k)}</div>
    <div class="mpeff" style="font-size:12px">${mpLvPre(L)}${mpWeEff(k, L)}</div></div>`;
}
function mpWeActHTML(a) {
  const z = a.est || {}, parts = [];
  if (z.money) parts.push(`<span class="${z.money > 0 ? 'good' : 'bad'}">${z.money > 0 ? '+' : ''}${fmtB(z.money)}</span>`);
  if (z.pers) parts.push(`<span class="good">+${persT(z.pers)}</span>`);
  if (z.pts) parts.push(`<span class="good">${T('mp.we.pts', { n: Math.round(z.pts) })}</span>`);
  if (z.stab) parts.push(`<span class="bad">${T('mp.we.c.stab1', { n: z.stab.toFixed(0) })}</span>`);
  if (z.infl) parts.push(`<span class="bad">${T('mp.we.c.infl1', { n: z.infl.toFixed(1) })}</span>`);
  if (z.weary) parts.push(`<span class="bad">${T('mp.we.c.weary1', { n: z.weary })}</span>`);
  if (z.resist) parts.push(`<span class="bad">${T('mp.we.c.resist1', { n: Math.round(z.resist) })}</span>`);
  if (z.rep) parts.push(`<span class="bad">${T('mp.we.c.rep')}</span>`);
  const crash = a.id === 'crash' ? `<select data-weab="${a.id}">${['land', 'air', 'navy'].map(b => `<option value="${b}">${T('br.' + b)}</option>`).join('')}</select>` : '';
  return `<div class="mpweact"><div class="row"><b>${T('we.a.' + a.id)}</b>${crash}<button class="${a.ok ? 'btn-primary' : ''}" data-wea="${a.id}" ${a.ok ? '' : 'disabled'}>${T('mp.we.do')}</button></div><div class="muted" style="font-size:12px">${T('we.ad.' + a.id)}</div><div style="font-size:12px">${parts.join(' · ')}${a.why ? ` <span class="warn">${esc(TX(a.why))}</span>` : ''}</div></div>`;
}
document.addEventListener('click', e => {
  if (!window.TX_MP || !S || !MPS.on) return;
  const b = e.target.closest('[data-wek], [data-wea]'); if (!b) return;
  if (b.dataset.wek) {
    const k = b.dataset.wek, L = +b.dataset.wel, cur = W.weView(S, S.player).pol[k].L; if (L === cur) return;
    const r = doCmd('we', [k, L]); if (r) toast(TX(r)); renderAll(); return;
  }
  if (b.dataset.wea) {
    const a = b.dataset.wea, sel = $(`[data-weab="${a}"]`);
    mpConfirm(T('mp.we.confirm', { x: T('we.a.' + a) }), () => { const r = doCmd('weAct', [a, sel ? sel.value : '']); if (r && r.ok) toast(TX(r.msg), 4500); else if (r && r.reason) toast(TX(r.reason)); renderAll(); });
  }
});
/* 悬停在某一级按钮上时预览该级的收益与代价 */
document.addEventListener('mouseover', e => {
  if (!window.TX_MP || !S || !MPS.on) return;
  const b = e.target.closest('[data-wek]'); if (!b) return;
  const row = b.closest('.mpwerow'), eff = row && row.querySelector('.mpeff'); if (!eff) return;
  const lv = +b.dataset.wel; eff.innerHTML = mpLvPre(lv) + mpWeEff(b.dataset.wek, lv);
});
document.addEventListener('mouseout', e => {
  if (!window.TX_MP || !S || !MPS.on) return;
  const row = e.target.closest && e.target.closest('.mpwerow'); if (!row || (e.relatedTarget && row.contains(e.relatedTarget))) return;
  const eff = row.querySelector('.mpeff'), k = row.dataset.werow, L = +row.dataset.wecur; if (eff && k) eff.innerHTML = `${mpLvPre(L)}${mpWeEff(k, L)}`;
});
