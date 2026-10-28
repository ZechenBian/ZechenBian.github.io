// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 界面层 v4 · 人口、动员与工业 ===================== */
const mtT = v => (v == null ? '—' : EN() ? (v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(0) : v.toFixed(1)) + ' Mt' : v >= 1 ? (v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(0) : v.toFixed(1)) + T('u.i.mt') : Math.round(v * 100) + T('u.i.wt'));
const popT = m => (EN() ? (m >= 100 ? Math.round(m) : m.toFixed(1)) + 'M' : m >= 100 ? (m / 100).toFixed(m >= 1000 ? 1 : 2) + '亿' : Math.round(m * 100) + '万');
const unitN = v => (v >= 10000 ? fmtN(Math.round(v / 100) * 100) : fmtN(Math.round(v)));
function indStat(label, val, note, cls) { return `<div class="stat"><span>${label}</span><b class="${cls || ''}">${val}</b>${note ? `<small>${note}</small>` : ''}</div>`; }
/* 本国：人口与动员、工业与战时生产 */
function indHomeHTML() {
  const P = S.player, v = W.industryView(S, P), x = S.actors[P];
  const capPct = v.capNow > 0 ? Math.min(1, v.pers / v.capNow) : 1;
  let s = `<div class="sec"><h3>${T('u.i.man')} <button class="mini" data-indpanel="1">${T('u.i.panel')}</button></h3><div class="grid2">
    ${indStat(T('u.pop'), popT(v.pop), v.base > v.pop * 1.02 ? T('u.i.base', { x: { raw: popT(v.base) } }) : '')}
    ${indStat(T('u.u.pers'), persT(v.pers), T('u.i.cap_now', { x: { raw: persT(v.capNow) }, k: T('mob.' + v.mob) }), capPct > 0.95 ? 'warn' : '')}
    ${indStat(T('u.i.cap_max'), persT(v.capMax), T('u.i.mobmax', { s: { pct: v.mobMax } }))}
    ${indStat(T('u.i.cas'), persT(v.cas), v.cas > 0 ? T('u.i.cas_x') : '')}
    ${indStat(T('u.i.manning'), pct(Math.min(1.2, v.manning)), v.manning < 0.85 ? T('u.i.man_low') : v.manning > 1.05 ? T('u.i.man_hi') : T('u.i.man_ok'), v.manning < 0.85 ? 'bad' : '')}
    ${indStat(T('u.i.labor'), v.labor > 0.005 ? '-' + v.labor.toFixed(2) + '%' : '—', T('u.i.labor_x'), v.labor > 0.2 ? 'warn' : '')}
  </div><div class="bar" style="margin-top:6px" title="${esc(T('u.i.capbar'))}"><div style="width:${(capPct * 100).toFixed(0)}%"></div></div><p class="muted" style="font-size:12px;margin:6px 0 0">${T('u.i.man_help')}</p></div>`;
  const yr = q => (q == null ? '—' : fmtB(q * 4));
  const short = v.budQ > v.capQ * 1.02;
  s += `<div class="sec"><h3>${T('u.i.ind')}</h3><div class="grid2">
    ${indStat(T('u.i.steel'), mtT(v.steel), T('u.i.steel_x'))}
    ${indStat(T('u.i.oil'), v.oil == null ? '—' : mtT(v.oil), v.oilNeed != null ? T('u.i.oil_bal', { a: { raw: mtT(v.oilDom ?? v.oil) }, b: { raw: mtT(v.oilImp ?? 0) }, c: { raw: mtT(v.oilNeed) } }) : T('u.i.oil_x'), v.oilShort > 0.05 ? 'bad' : '')}
    ${v.oilStock != null ? indStat(T('u.i.oilstock'), mtT(v.oilStock), v.oilShort > 0.05 ? T('u.i.oil_short', { s: { pct: v.oilShort } }) : T('u.i.oil_ok')) : ''}
    ${indStat(T('u.i.cu'), v.cu == null ? '—' : pct(v.cu), T('u.i.cu_x', { s: { pct: v.mcap }, r: { pct: v.ramp } }))}
    ${indStat(T('u.i.prod'), yr(v.prodQ), T('u.i.prod_x', { x: { raw: yr(v.budQ) }, y: { raw: yr(v.capQ) } }), short ? 'warn' : '')}
    ${indStat(T('u.i.made'), `${unitN(v.made.t)} / ${unitN(v.made.a)} / ${unitN(v.made.s)}`, T('u.i.made_x'))}
  </div>${short ? `<div class="alert warn" style="margin-top:6px">${T('u.i.short', { s: { pct: 1 - v.capQ / v.budQ } })}</div>` : ''}
  <div class="grid2" style="margin-top:6px"><div><small class="muted">${T('u.i.prod_s')}</small>${spark('prod', '--neutral')}</div><div><small class="muted">${T('u.i.cu')}</small>${spark('cu', '--accent')}</div></div>
  <p class="muted" style="font-size:12px;margin:6px 0 0">${T('u.i.ind_help')}</p></div>`;
  return s;
}
/* 他国档案中的简表 */
function indDossierHTML(id) {
  const v = W.industryView(S, id);
  return `<div class="grid2" style="margin-top:6px">
    ${indStat(T('u.u.pers'), persT(v.pers), T('u.i.cap_max_s', { x: { raw: persT(v.capMax) } }))}
    ${indStat(T('u.i.steel'), mtT(v.steel), v.oil != null ? T('u.i.oil_s', { x: { raw: mtT(v.oil) } }) : '')}
    ${indStat(T('u.i.cu'), v.cu == null ? '—' : pct(v.cu), T('u.i.prod_s2', { x: { raw: fmtB((v.prodQ || 0) * 4) } }))}
    ${indStat(T('u.i.made'), `${unitN(v.made.t)} / ${unitN(v.made.a)} / ${unitN(v.made.s)}`, v.cas > 0 ? T('u.i.cas_s', { x: { raw: persT(v.cas) } }) : '')}
  </div><button class="mini" data-indpanel="1" style="margin-top:6px">${T('u.i.panel')}</button>`;
}
/* 国力对比面板 */
const IND_COLS = [
  ['pop', 'u.i.c.pop', r => popT(r.base)], ['gdp', 'u.i.c.gdp', r => fmtB(r.gdp)], ['milPct', 'u.i.c.mil', r => r.milPct.toFixed(1) + '%'],
  ['pers', 'u.i.c.pers', r => persT(r.pers)], ['capMax', 'u.i.c.cap', r => `${persT(r.capNow)}<small>/${persT(r.capMax)}</small>`], ['mob', 'u.i.c.mob', r => T('mob.' + r.mob)],
  ['steel', 'u.i.c.steel', r => mtT(r.steel)], ['oil', 'u.i.c.oil', r => (r.oil == null ? '—' : mtT(r.oil)) + (r.oilNeed != null ? `<small>${T('u.i.c.need', { x: { raw: mtT(r.oilNeed) } })}${r.oilStock != null ? ' · ' + T('u.i.c.stock', { x: { raw: mtT(r.oilStock) } }) : ''}</small>` : '')],
  ['cu', 'u.i.c.cu', r => (r.cu == null ? '—' : pct(r.cu))], ['prodQ', 'u.i.c.prod', r => fmtB((r.prodQ || 0) * 4)],
  ['madeT', 'u.i.c.tanks', r => unitN(r.made.t)], ['madeA', 'u.i.c.air', r => unitN(r.made.a)], ['madeS', 'u.i.c.ships', r => unitN(r.made.s)],
  ['cas', 'u.i.c.cas', r => (r.cas ? persT(r.cas) : '—')], ['power', 'u.power', r => fmtN(r.power)],
];
function openIndPanel() {
  const P = S.player; UI.indSort = UI.indSort || 'gdp'; UI.indAll = !!UI.indAll;
  let rows = IDS.filter(id => W.indep(S, id)).map(id => { const v = W.industryView(S, id); return Object.assign(v, { madeT: v.made.t, madeA: v.made.a, madeS: v.made.s }); });
  const key = UI.indSort; rows.sort((a, b) => ((b[key] ?? -1) - (a[key] ?? -1)));
  if (!UI.indAll) { const top = rows.slice(0, 14); if (!top.some(r => r.id === P)) top.push(rows.find(r => r.id === P)); rows = top.filter(Boolean); }
  const head = `<tr><th>${T('u.country')}</th>${IND_COLS.map(([k, l]) => `<th data-isort="${k}" class="${k === key ? 'on' : ''}">${T(l)}${k === key ? ' ▾' : ''}</th>`).join('')}</tr>`;
  const body = rows.map(r => `<tr class="${r.id === P ? 'me' : ''}"><td data-sel="${r.id}">${esc(NAME(r.id))}</td>${IND_COLS.map(([, , f]) => `<td>${f(r)}</td>`).join('')}</tr>`).join('');
  showModal(`<div class="indpanel"><div class="kicker">${T('u.i.panel')}</div><h2>${T('u.i.title')}</h2><p class="sub">${T('u.i.sub', { x: { raw: dateStr(S) } })}</p>
    <div class="btns" style="margin:4px 0 8px"><button class="${UI.indAll ? '' : 'on'}" data-ifilter="top">${T('u.i.top')}</button><button class="${UI.indAll ? 'on' : ''}" data-ifilter="all">${T('u.i.all')}</button></div>
    <div class="tblwrap"><table class="rank indtab">${head}${body}</table></div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">${T('u.i.notes')}</p>
    <div class="foot"><button class="btn-primary" data-close="1">${T('u.close')}</button></div></div>`, 'wide', true);
}
