// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 联机版 · 精细战区与国家战略的衔接（界面） =====================
 * 侧栏“战区”页的“占领区与国力”、区格页的经济权重。数据来自引擎的 thOccInfo / thView（见 engine/10f_th_bridge.js）。
 */
const thPctD = (k, d = 0) => { const v = Math.round((k - 1) * 100); return (v > 0 ? '+' : '') + v + '%'; };
function thOccHTML(s, P) {
  const i = W.thOccInfo(s, P); if (!i) return '';
  const own = i.own, hit = own.eco < 0.995 || own.ind < 0.995 || own.pop < 0.995 || own.eco > 1.005, g = i.gain, gz = i.gz.filter(q => q.eco > 0);
  if (!hit && !gz.length && Math.abs(g.fis) < 0.5) return '';
  let h = `<div class="sec"><h3>${T('th.occ.t')}</h3>`;
  if (hit) {
    h += `<div class="grid2">${indStat(T('th.occ.eco'), thPctD(own.eco), '', own.eco < 0.97 ? 'bad' : own.eco > 1.01 ? 'good' : '')}${indStat(T('th.occ.ind'), thPctD(own.ind), '', own.ind < 0.97 ? 'bad' : own.ind > 1.01 ? 'good' : '')}${indStat(T('th.occ.pop'), thPctD(own.pop), '', own.pop < 0.97 ? 'bad' : own.pop > 1.01 ? 'good' : '')}${indStat(T('th.occ.nz'), i.nLost)}</div>`;
    if (i.lost.length) h += `<div class="muted" style="font-size:12px;margin-top:4px">${T('th.occ.top', { x: { raw: i.lost.slice(0, 6).map(l => { const z = W.thStatic(l.T).zones[l.z]; return `${thZN(z, true)}${paren(Math.round(l.ind * 100) + '%')}`; }).join(sep()) } })}</div>`;
  }
  if (gz.length || Math.abs(g.fis) >= 0.5) h += `<div class="muted" style="font-size:12px;margin-top:4px">${T('th.occ.gain', { a: { m: Math.max(0, g.fis) }, b: { m: Math.max(0, g.ind) }, c: { pers: Math.max(0, g.man) * 1000 }, x: { raw: gz.map(q => `${NAME(q.R)} ${Math.round(q.ind * 100)}%`).join(sep()) || '—' } })}</div>`;
  h += `<p class="muted" style="font-size:11.5px;margin:6px 0 0">${T('th.occ.x')}</p></div>`;
  return h;
}
/* 区格页：这个区格的人口与工业 */
function thZoneEcoHTML(z) {
  if (z.ep == null) return '';
  return `<div class="muted" style="font-size:12px">${T('th.occ.zone', { a: { raw: z.ep >= 1 ? z.ep.toFixed(1) : z.ep.toFixed(2) }, b: { raw: (z.ei * 100).toFixed(z.ei >= 0.1 ? 0 : 1) }, c: { raw: NAME(z.r) } })}</div>`;
}

/* 地图标记：战略层指定的主攻方向（◎）与死守城市（盾） */
function thLinkMarks(v, k) {
  const L = v.link; if (!L) return '';
  let h = '';
  for (const z of L.focus) { const zz = v.zones[z]; if (zz) h += `<g class="thlink foc nohit" transform="translate(${zz.x.toFixed(2)},${zz.y.toFixed(2)}) scale(${k.toFixed(4)}) translate(-14,-14)"><circle r="6.5"/><text y="3">◎</text><title>${esc(T('th.lk.focus_t', { x: { raw: thZN(zz, true) } }))}</title></g>`; }
  for (const z of L.hold) { const zz = v.zones[z]; if (zz) h += `<g class="thlink hold nohit" transform="translate(${zz.x.toFixed(2)},${zz.y.toFixed(2)}) scale(${k.toFixed(4)}) translate(-14,-14)"><circle r="6.5"/><text y="3">⛨</text><title>${esc(T('th.lk.hold_t', { x: { raw: thZN(zz, true) } }))}</title></g>`; }
  return h;
}
/* 战线清单里的两栖作战状态与主攻方向 */
function thFrontNote(f, v) {
  const parts = [];
  if (f.kind === 'amph') parts.push(f.land != null ? T('th.lk.amph_ok') : f.noSea ? T('th.lk.amph_nosea') : T('th.lk.amph_wait'));
  if (f.focusZ && f.focusZ.length) { const z = v.zones[f.focusZ[0]]; if (z) parts.push(T('th.lk.focus', { x: { raw: thZN(z, true) } })); }
  if (f.sup) parts.push(T('th.lk.sup'));
  return parts.length ? ` <small class="muted">${parts.map(esc).join(' · ')}</small>` : '';
}
/* 侧栏“战区”页：战区与国家战略如何互相影响 */
function thLinkHelpHTML() {
  return `<div class="sec"><h3>${T('th.lk.t')}</h3><ul class="thlk">${['in1', 'in2', 'in3', 'in4', 'in5', 'out1', 'out2', 'out3', 'out4'].map(k => `<li class="${k.startsWith('in') ? 'in' : 'out'}">${T('th.lk.' + k)}</li>`).join('')}</ul></div>`;
}
