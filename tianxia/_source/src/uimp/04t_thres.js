// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 联机版 · 精细战区：逐阶段战果 =====================
 * 每个作战阶段（15 天）结束时引擎记下战斗账（thPhaseRecord），视图模型 thView().res 给出玩家能看到的部分
 * （己方与友军为实数，敌军为情报估计）。这里负责：侧栏“战果”页、地图叠加层（该阶段末的态势、战斗位置与结果、
 * 进攻箭头、易手区格、合围）、地图下方的阶段选择条、侧栏顶部的摘要条，以及回合报告里的“各阶段战果”表。
 * 状态：UI.th.resPh 选中的阶段（下标），resKey 最近一次看到的“季度:阶段”（出现新结果时自动跳到最新阶段），resHi 高亮的战斗区格
 */
const thMineC = (s, c) => !!c && (c === s.player || W.thFr(s, s.player, c));
const thResDate = (q, D) => ({ y: q[0], m: (q[1] - 1) * 3 + Math.floor(D / 30) + 1, d: (D % 30) + 1 });
function thResLast(v) { const L = v && v.res ? v.res.list : []; for (let i = L.length - 1; i >= 0; i--) if (L[i]) return i; return -1; }
function thResSel(v) {
  const st = thSt(), last = thResLast(v); if (last < 0) return -1;
  const key = v.T + ':' + v.res.q.join('Q') + ':' + last;
  if (st.resKey !== key) { st.resKey = key; st.resPh = last; st.resHi = null; }
  if (st.resPh == null || !v.res.list[st.resPh]) st.resPh = last;
  return st.resPh;
}
const thResOn = v => thSt().tab === 'res' && thResLast(v) >= 0;
/* 让所选阶段的战斗与易手区格都在视野里（已经在视野里就不动） */
function thResFit(v) {
  const st = thSt(), bx = st.box, k = thResSel(v); if (!bx || k < 0 || bx.T !== v.T) return;
  const r = v.res.list[k], zs = new Set(); for (const b of r.bt.slice(0, 28)) { zs.add(b.z); for (const f of b.from) zs.add(f); } for (const c of r.cap) zs.add(c.z);
  const pts = [...zs].map(i => v.zones[i]).filter(Boolean); if (!pts.length) return;
  const [x, y, w, h] = bx.b, m = w * 0.05; if (pts.every(z => z.x > x + m && z.x < x + w - m && z.y > y + m && z.y < y + h - m)) return;
  const xs = pts.map(z => z.x), ys = pts.map(z => z.y), pad = Math.max(4, bx.full.b[2] * 0.04);
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  const nw = Math.max(x1 - x0, (y1 - y0) * bx.full.ar, bx.full.b[2] * 0.25);
  st.vb = { T: bx.T, ar: bx.full.ar, b: thClampBox([(x0 + x1) / 2 - nw / 2, (y0 + y1) / 2 - nw / bx.full.ar / 2, nw], bx.full) };
}
/* 从玩家的角度看一场战斗：o = good（我方得手）/ bad（我方失利）/ ne（他国之间） */
function thBtView(b, s) {
  if (thMineC(s, b.a)) return { o: b.res === 'hold' ? 'bad' : 'good', k: 'th.res.o.' + b.res };
  if (thMineC(s, b.d)) return { o: b.res === 'hold' ? 'good' : 'bad', k: 'th.res.d.' + b.res };
  return { o: 'ne', k: 'th.res.x.' + b.res };
}
function thResSum(r, s) {
  const P = s.player, mine = c => thMineC(s, c);
  const o = { gain: 0, lost: 0, my: 0, myP: 0, al: 0, en: 0, win: 0, fail: 0, enc: (r.enc || {})[P] || 0, oos: (r.oos || {})[P] || 0 };
  for (const c of r.cap) { if (mine(c.c) && !mine(c.o)) o.gain++; else if (mine(c.o) && !mine(c.c)) o.lost++; }
  for (const [C, l] of Object.entries(r.loss)) { if (C === P) { o.my += l.men; o.myP += l.pow; } else if (mine(C)) o.al += l.men; else if (W.thHostile(s, P, C)) o.en += l.men; }
  for (const b of r.bt) { const x = thBtView(b, s).o; if (x === 'good') o.win++; else if (x === 'bad') o.fail++; }
  return o;
}
const thResPrevQ = (v, s) => v.res && (v.res.q[0] !== s.year || v.res.q[1] !== s.q);
/* 阶段选择按钮（地图下方与“战果”页顶部共用） */
function thResPhBtns(v, k) {
  const L = v.res.list;
  return `<span class="thphb">${Array.from({ length: v.phases }, (_, i) => `<button class="${i === k ? 'on' : ''}" data-thresph="${i}" ${L[i] ? '' : 'disabled'}>${i + 1}</button>`).join('')}</span>`;
}
function thResBar(v, s) {
  const k = thResSel(v); if (k < 0) return '';
  const r = v.res.list[k];
  return `<div class="threp thphbar"><span>${T('th.res.phs')}</span>${thResPhBtns(v, k)}<b>${thDate(r.a)}—${thDate(r.b)}${thResPrevQ(v, s) ? ' · ' + T('th.res.prevq') : ''}</b></div>`;
}
/* 侧栏顶部的摘要条（不在“战果”页时显示最近一个阶段） */
function thResStrip(v, s) {
  const k = thResLast(v); if (k < 0 || thSt().tab === 'res') return '';
  const r = v.res.list[k], m = thResSum(r, s);
  return `<div class="thstrip"><span>${T('th.res.strip', { n: r.ph, a: m.gain, b: m.lost, x: { raw: persT(m.my) }, y: { raw: persT(m.en) } })}${thResPrevQ(v, s) ? ' · ' + T('th.res.prevq') : ''}</span><button class="mini" data-thtab="res">${T('th.res.open')}</button></div>`;
}
function thBtTitle(b, v, s, r) {
  const z = v.zones[b.z], q = v.res.q, D0 = (r.ph - 1) * v.days + b.t0, D1 = (r.ph - 1) * v.days + b.t1, bv = thBtView(b, s);
  return `${thZN(z, true)} · ${T(bv.k, { a: b.a, d: b.d })} · ${NAME(b.a)} → ${NAME(b.d)} · ${thDate(thResDate(q, D0))}${b.t1 > b.t0 ? '—' + thDate(thResDate(q, D1)) : ''} · ${T('th.res.force', { a: { raw: (b.ea ? '≈' : '') + b.as.toFixed(1) }, b: { raw: (b.ed ? '≈' : '') + b.ds.toFixed(1) } })} · ${T('th.res.cas', { a: { raw: (b.ea ? '≈' : '') + persT(b.la) }, b: { raw: (b.ed ? '≈' : '') + persT(b.ld) } })}`;
}
/* ---------- 侧栏“战果”页 ---------- */
function thResHTML(v, s) {
  const k = thResSel(v); if (k < 0) return `<p class="muted">${T('th.res.none')}</p>`;
  const R = v.res, r = R.list[k], st = thSt(), m = thResSum(r, s), q = R.q;
  let h = `<div class="thresh">${thResPhBtns(v, k)}</div><div class="thresh"><b>${T('th.res.ph', { n: r.ph })}</b> ${thDate(r.a)}—${thDate(r.b)}${thResPrevQ(v, s) ? ` <span class="tag">${T('th.res.prevq')}</span>` : ''}</div>`;
  const kp = (lbl, val, cls, sub) => `<div class="stat"><span>${lbl}</span><b class="${cls || ''}">${val}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  h += `<div class="grid2 thkpi">${kp(T('th.res.gain'), m.gain, m.gain ? 'good' : '')}${kp(T('th.res.lost'), m.lost, m.lost ? 'bad' : '')}`
    + `${kp(T('th.res.myloss'), persT(m.my), '', m.myP >= 0.05 ? esc(T('th.res.pow', { x: { raw: persT(m.myP) } })) : m.al >= 0.05 ? esc(T('th.res.alloss', { x: { raw: persT(m.al) } })) : '')}${kp(T('th.res.enloss'), '≈' + persT(m.en))}`
    + `${kp(T('th.res.btl'), T('th.res.btl_v', { a: m.win, b: m.fail }), m.win > m.fail ? 'good' : m.fail > m.win ? 'bad' : '')}${kp(T('th.res.encoos'), T('th.res.units_n', { a: m.enc, b: m.oos }), m.enc ? 'bad' : m.oos ? 'warn' : '')}</div>`;
  // 战线进度（与上一阶段相比）
  const prev = k > 0 && R.list[k - 1] ? Object.fromEntries(R.list[k - 1].fr.map(f => [f.id, f.p])) : R.fp0 || {};
  if (r.fr.length) h += `<h4>${T('th.res.fronts')}</h4><ul class="thfr">${r.fr.map(f => { const d = f.p - (prev[f.id] ?? f.p), ok = thMineC(s, f.att) ? d > 0 : d < 0; return `<li><b>${esc(NAME(f.att))} → ${esc(NAME(f.target))}</b> <span class="num">${f.p}%</span>${d ? ` <b class="${ok ? 'good' : 'bad'}">${d > 0 ? '+' : ''}${d}</b>` : ''}</li>`; }).join('')}</ul>`;
  // 兵力（阶段末）
  const sts = Object.entries(r.str).filter(([, o]) => o.v >= 0.1).sort((a, b) => b[1].v - a[1].v);
  if (sts.length) h += `<h4>${T('th.res.str')}</h4><div class="thstr">${sts.map(([C, o]) => `<span class="${C === s.player ? 'me' : thMineC(s, C) ? 'al' : 'en'}">${esc(NAME(C))} <b>${o.e ? '≈' : ''}${o.v.toFixed(1)}</b></span>`).join('')}</div>`;
  // 伤亡构成（只有自己）
  const lcE = Object.entries(r.lc || {}).filter(([, x]) => x >= 0.05).sort((a, b) => b[1] - a[1]), tot = lcE.reduce((a, [, x]) => a + x, 0);
  if (tot >= 0.1) h += `<h4>${T('th.res.lc')}</h4><div class="thlc">${lcE.map(([c, x]) => `<i class="lc-${c}" style="width:${(x / tot * 100).toFixed(1)}%"></i>`).join('')}</div><div class="thlcl">${lcE.map(([c, x]) => `<span><i class="lc-${c}"></i>${T('th.lc.' + c)} ${Math.round(x / tot * 100)}%</span>`).join('')}</div>`;
  // 战斗
  if (r.bt.length) {
    h += `<h4>${T('th.res.battles', { n: r.bt.length })}</h4><ul class="thbt">`;
    for (const b of r.bt.slice(0, 16)) {
      const z = v.zones[b.z]; if (!z) continue; const bv = thBtView(b, s), D0 = (r.ph - 1) * v.days + b.t0, D1 = (r.ph - 1) * v.days + b.t1;
      h += `<li class="o-${bv.o}${st.resHi === b.z ? ' hi' : ''}" data-thbt="${b.z}"><div class="hd"><button class="lnk" data-thrz="${b.z}">${esc(thZN(z, true))}</button><span class="tag ${bv.o === 'good' ? 'blue' : bv.o === 'bad' ? 'red' : ''}">${esc(T(bv.k, { a: b.a, d: b.d }))}</span></div>`
        + `<div class="ln">${esc(NAME(b.a))} → ${esc(NAME(b.d))} · ${thDate(thResDate(q, D0))}${b.t1 > b.t0 ? '—' + thDate(thResDate(q, D1)) : ''}${b.riv ? ' · ' + T('th.res.riv') : ''}${b.air >= 0.05 ? ' · ' + T('th.res.air') : ''}${b.from.length ? ' · ' + esc(T('th.res.from', { x: { raw: b.from.map(f => v.zones[f] ? thZN(v.zones[f], true) : '?').join(sep()) } })) : ''}</div>`
        + `<div class="ln muted">${T('th.res.force', { a: { raw: (b.ea ? '≈' : '') + b.as.toFixed(1) }, b: { raw: (b.ed ? '≈' : '') + b.ds.toFixed(1) } })} · ${T('th.res.ratio', { r: { raw: b.r.toFixed(2) } })} · ${T('th.res.cas', { a: { raw: (b.ea ? '≈' : '') + persT(b.la) }, b: { raw: (b.ed ? '≈' : '') + persT(b.ld) } })}</div></li>`;
    }
    h += `</ul>`;
    if (r.bt.length > 16) h += `<div class="muted" style="font-size:11px">${T('th.more_n', { n: r.bt.length - 16 })}</div>`;
  }
  // 区格易手
  if (r.cap.length) h += `<h4>${T('th.res.caps', { n: r.cap.length })}</h4><ul class="thcap">${r.cap.slice(0, 24).map(c => { const z = v.zones[c.z]; if (!z) return ''; const g = thMineC(s, c.c) && !thMineC(s, c.o), l = thMineC(s, c.o) && !thMineC(s, c.c); return `<li class="${g ? 'good' : l ? 'bad' : ''}"><button class="lnk" data-thrz="${c.z}">${esc(thZN(z, true))}</button> ${c.o ? esc(NAME(c.o)) : '—'} → <b>${esc(NAME(c.c))}</b> <small>${thDate(thResDate(q, (r.ph - 1) * v.days + c.d))}${c.brk ? ' · ' + T('th.res.brk') : ''}${c.lib ? ' · ' + T('th.res.lib') : ''}</small></li>`; }).join('')}</ul>`;
  // 其他事件
  const evk = ['enc', 'sur', 'cross', 'land', 'drop', 'op', 'sweep', 'raid', 'fric', 'evac', 'subcap'].filter(k2 => r.ev[k2] && r.ev[k2].n);
  if (evk.length) h += `<h4>${T('th.res.other')}</h4><div class="thevc">${evk.map(k2 => `<span title="${esc(r.ev[k2].z.map(([zi]) => v.zones[zi] ? thZN(v.zones[zi], true) : '').filter(Boolean).join(sep()))}">${T('th.res.ev.' + k2)} ×${r.ev[k2].n}</span>`).join('')}</div>`;
  if (!r.bt.length && !r.cap.length && !evk.length) h += `<p class="muted" style="font-size:12px">${T('th.res.quiet')}</p>`;
  h += `<p class="muted" style="font-size:11px;margin-top:8px">${T('th.res.lg')}</p>`;
  return h;
}
/* ---------- 地图叠加层：底层（易手区格、进攻箭头）与顶层（战斗标记、合围圈） ---------- */
function thResLayer(v, s, r, k, Tn) {
  const G = TH_GEO[Tn], st = thSt(), P = s.player; let lo = '', hi = '';
  for (const c of r.cap) { const z = v.zones[c.z]; if (!z || !G.cells[z.id]) continue; const cp = `d="${G.cells[z.id]}" clip-path="url(#thc-${Tn}-${z.r})"`; lo += `<path class="thcapz halo nohit" ${cp}/><path class="thcapz nohit" ${cp} style="stroke:${thSideCol(W.thSideOf(s, P, c.c))}"/>`; }
  const bts = r.bt.slice(0, 28);
  for (const b of bts) {
    const tz = v.zones[b.z]; if (!tz) continue; const sd = W.thSideOf(s, P, b.a), col = thSideCol(sd), w = clamp(2 + Math.sqrt(Math.max(0, b.as)) * 0.55, 2, 5.5);
    for (const f of b.from) {
      const fz = v.zones[f]; if (!fz) continue; const p = t => [fz.x + (tz.x - fz.x) * t, fz.y + (tz.y - fz.y) * t]; const [x0, y0] = p(0.14), [x1, y1] = p(0.8);
      const xy = `x1="${x0.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}"`;
      lo += `<line class="thbta halo nohit" ${xy} style="stroke-width:${(w + 3).toFixed(1)}px"/><line class="thbta nohit" ${xy} style="stroke:${col};stroke-width:${w.toFixed(1)}px" marker-end="url(#thR-${['me', 'al', 'en'].includes(sd) ? sd : 'ne'})"/>`;
    }
  }
  for (const b of bts) {
    const tz = v.zones[b.z]; if (!tz) continue; const bv = thBtView(b, s), col = bv.o === 'good' ? css('--good') : bv.o === 'bad' ? css('--bad') : css('--muted');
    const rr = clamp(7.5 + Math.sqrt(Math.max(0, b.la + b.ld)) * 0.3, 7.5, 13);
    hi += `<g class="thbtm o-${bv.o}${st.resHi === b.z ? ' hi' : ''}" data-thz="${b.z}" transform="translate(${tz.x.toFixed(2)},${tz.y.toFixed(2)}) scale(${k.toFixed(4)}) translate(0,10)"><circle r="${rr.toFixed(1)}" style="stroke:${col}"/><text y="3.8" style="fill:${col}">${b.res === 'cap' ? '⚑' : b.res === 'brk' ? '✸' : '⚔'}</text><title>${esc(thBtTitle(b, v, s, r))}</title></g>`;
  }
  for (const kk of ['enc', 'sur']) { const o = r.ev[kk]; if (!o) continue; for (const [zi, c] of o.z) { const z = v.zones[zi]; if (!z) continue; hi += `<g class="thencr${kk === 'sur' ? ' sur' : ''} nohit" transform="translate(${z.x.toFixed(2)},${z.y.toFixed(2)}) scale(${k.toFixed(4)})"><circle r="${kk === 'sur' ? 19 : 16}" style="stroke:${c && thMineC(s, c) ? css('--bad') : css('--good')}"/></g>`; } }
  return { lo, hi };
}
/* ---------- 回合报告里的“各阶段战果”表 ---------- */
function thRepSecHTML(R) {
  if (!S || !S.th || !R) return '';
  let h = '';
  for (const Tt of W.thTheatersOf(S, S.player)) {
    const v = W.thView(S, Tt, S.player); if (!v || !v.res || thResLast(v) < 0 || v.res.q[0] !== R.y || v.res.q[1] !== R.q) continue;
    const rows = v.res.list.map(r => { if (!r) return ''; const m = thResSum(r, S); return `<tr><td>${r.ph}</td><td>${thDate(r.a)}—${thDate(r.b)}</td><td class="${m.gain ? 'good' : ''}">${m.gain}</td><td class="${m.lost ? 'bad' : ''}">${m.lost}</td><td>${T('th.res.btl_v', { a: m.win, b: m.fail })}</td><td>${persT(m.my)}</td><td>≈${persT(m.en)}</td></tr>`; }).join('');
    h += `<div class="threptb"><div class="row"><b>${esc(EN() ? v.name[1] : v.name[0])}</b><button class="mini" data-thopen="${Tt}" data-thres="1">${T('th.res.rep_open')}</button></div><div class="tbl"><table><thead><tr><th>${T('th.res.col.ph')}</th><th>${T('th.res.col.d')}</th><th>${T('th.res.gain')}</th><th>${T('th.res.lost')}</th><th>${T('th.res.btl')}</th><th>${T('th.res.col.my')}</th><th>${T('th.res.col.en')}</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  return h ? `<div class="rep-sec"><h3>${T('th.res.rep_t')}</h3><p class="muted" style="font-size:12px;margin:0 0 6px">${T('th.res.rep_x')}</p>${h}</div>` : '';
}
/* 在已经打开的回合报告里插入战区战果（不改动单机版的报告函数） */
function thRepInject(R) {
  try { const sh = $('#sheet'); if (!sh || $('#modal').hidden || sh.querySelector('.threptb')) return; const html = thRepSecHTML(R); if (!html) return; const foot = sh.querySelector(':scope > .foot'); if (foot) foot.insertAdjacentHTML('beforebegin', html); else sh.insertAdjacentHTML('beforeend', html); } catch (e) { console.warn('thRepInject', e); }
}
