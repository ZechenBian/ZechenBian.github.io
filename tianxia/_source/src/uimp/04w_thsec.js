// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 联机版 · 精细战区：粗一级指挥（战区段 + 方面军） =====================
 * 玩家可以在“精细”与“简化”之间随时切换（只影响自己的界面，不影响别的玩家，也不改变推演）：
 *   简化：区格合并成十几个战区段（剧本数据 sec），地图按战区段着色，部队按战区段编成“方面军”，
 *         命令下到方面军——进攻（点目标战区段，参谋部拟定方案，留三成步兵守住本段）、坚守、掘壕、预备队、转移（点己方战区段）。
 *   底层仍按区格、按师逐日精细推演；方面军的命令翻译成每支部队的命令（与精细指挥同一套命令）。
 * 状态：thSt().lvl（'fine' | 'sec'，记在本机）、secSel（选中的方面军所在战区段）、secMode（'attack' | 'move'，等待点目标）、secInfo（查看的战区段）
 */
const TH_LVL_KEY = 'tx_th_lvl';
function thLvl() {
  const st = thSt(), s = thS(), P = (s && s.player) || '';
  if (!st.lvl || st.lvlP !== P) { let l = 'fine'; try { l = localStorage.getItem(TH_LVL_KEY + ':' + P) === 'sec' ? 'sec' : 'fine'; } catch (e) { } st.lvl = l; st.lvlP = P; }
  return st.lvl;
}
/* 选中的方面军只在同一个战区、同一个玩家下有效 */
function thSecCheck(v, s, D) {
  const st = thSt(), key = v.T + ':' + s.player;
  if (st.secKey !== key || (st.secSel != null && !D[st.secSel]) || (st.secInfo != null && !D[st.secInfo])) { st.secSel = null; st.secMode = null; st.secInfo = null; st.secKey = key; }
}
const thSecOn = v => thLvl() === 'sec' && !!v && thSt().tab !== 'res' && W.thSecs(v.T).list.length > 1; // “战果”页仍按区格显示逐阶段的战斗
function thLvlHTML(v) {
  if (!v || W.thSecs(v.T).list.length < 2) return '';
  const l = thLvl();
  return `<div class="thlvl" role="group" aria-label="${esc(T('th.lvl.t'))}" title="${esc(T('th.lvl.x'))}"><span>${T('th.lvl.t')}</span><button class="${l === 'fine' ? 'on' : ''}" data-thlvl="fine">${T('th.lvl.fine')}</button><button class="${l === 'sec' ? 'on' : ''}" data-thlvl="sec">${T('th.lvl.sec')}</button></div>`;
}
/* 按战区段汇总：控制份额（按区格、重要城市加权）、我方方面军、友军、看得见的敌军 */
function thSecData(v, s) {
  const SC = W.thSecs(v.T), out = SC.list.map(c => ({ i: c.i, id: c.id, n: c.n, zs: c.zs, key: c.key, x: c.x, y: c.y, sh: { me: 0, al: 0, en: 0, ne: 0 }, own: [], al: 0, en: 0, enSeen: 0, enU: 0 }));
  for (const z of v.zones) { const c = out[SC.of[z.i]]; if (c) c.sh[z.side] += 1 + Math.min(4, z.vp || 0) * 0.5; }
  for (const u of v.units) { const c = out[SC.of[u.z]]; if (!c) continue; if (u.own) { if (!u.fix) c.own.push(u); } else if (u.foe) { c.enU++; if (u.est) { c.en += (u.est[0] + u.est[1]) / 2; c.enSeen = 1; } } else if (!u.aux) c.al += u.str || 0; }
  for (const c of out) {
    const t = c.sh.me + c.sh.al + c.sh.en + c.sh.ne || 1, fr = (c.sh.me + c.sh.al) / t, en = c.sh.en / t;
    c.fr = fr; c.enSh = en; c.side = c.sh.me >= Math.max(c.sh.al, c.sh.en, c.sh.ne) ? 'me' : c.sh.al >= Math.max(c.sh.en, c.sh.ne) ? 'al' : c.sh.en >= c.sh.ne ? 'en' : 'ne';
    c.contested = fr >= 0.15 && en >= 0.15;
    c.w = c.own.reduce((a, u) => a + (u.str || 0), 0); c.mob = c.own.filter(u => !u.gue && ['pz', 'mot', 'lt', 'jtk'].includes(u.t)).length;
    c.sp = c.own.length ? c.own.reduce((a, u) => a + (u.sp || 0), 0) / c.own.length : 0;
    c.adj = SC.adj[c.i];
  }
  return out;
}
/* 战区段里给定一方的目标区格：重要城市优先；进攻找敌占区格，转移找己方区格 */
function thSecTargetZone(v, c, want) {
  const ok = z => (want === 'en' ? v.zones[z].side === 'en' || v.units.some(u => u.foe && u.z === z) : v.zones[z].side === 'me' || v.zones[z].side === 'al');
  const zs = c.zs.filter(ok); if (!zs.length) return null;
  return zs.includes(c.key) ? c.key : zs.sort((a, b) => (v.zones[b].vp || 0) - (v.zones[a].vp || 0) || a - b)[0];
}
/* ---------- 地图：战区段着色、名称与方面军棋子（在 thSVG 里调用） ---------- */
function thSecFill(c, base) {
  const tint = [0, 0.1, 0.2][c.i % 3]; return tint ? mix(base, css('--paper'), tint) : base;
}
function thSecLayer(v, s, k, fill) {
  const st = thSt(), G = TH_GEO[v.T], D = thSecData(v, s); UI.thSecD = D; thSecCheck(v, s, D);
  let cells = '', lab = '', pcs = '', hatch = '';
  for (const c of D) for (const z of c.zs) {
    const zz = v.zones[z], path = G.cells[zz.id]; if (!path) continue;
    const sel = st.secSel === c.i || st.secInfo === c.i;
    cells += `<path class="thz thsz${sel ? ' sel' : ''}" data-thsz="${c.i}" d="${path}" clip-path="url(#thc-${v.T}-${zz.r})" style="fill:${thSecFill(c, fill[c.side] || fill.ne)}"><title>${esc(EN() ? c.n[1] : c.n[0])}</title></path>`;
    if (c.contested && (zz.side === 'en') !== (c.side === 'en')) hatch += `<path class="thsh nohit" d="${path}" clip-path="url(#thc-${v.T}-${zz.r})"/>`;
  }
  for (const c of D) {
    const big = c.zs.some(z => v.zones[z].vp >= 4) || c.zs.length >= 3;
    lab += `<g transform="translate(${c.x.toFixed(2)},${(c.y + 8 * k).toFixed(2)}) scale(${k.toFixed(4)})"><text class="thsl${big ? ' big' : ''}">${esc(EN() ? c.n[1] : c.n[0])}</text></g>`;
    const tok = (cls, txt, dx, attr) => `<g class="thsa ${cls}${attr ? '' : ' nohit'}" ${attr || ''} transform="translate(${c.x.toFixed(2)},${c.y.toFixed(2)}) scale(${k.toFixed(4)}) translate(${dx},-6)"><rect x="-13" y="-7" width="26" height="13" rx="2.5"/><text y="3">${txt}</text></g>`;
    const has = [c.own.length ? 'me' : null, c.al > 0.3 ? 'al' : null, c.enSeen ? 'en' : null].filter(Boolean), off = i => (i - (has.length - 1) / 2) * 30;
    has.forEach((sd, i) => {
      if (sd === 'me') pcs += tok('me' + (st.secSel === c.i ? ' sel' : ''), `${c.own.length}`, off(i), `data-thsa="${c.i}"`);
      else if (sd === 'al') pcs += tok('al', c.al.toFixed(0), off(i));
      else pcs += tok('en', '≈' + c.en.toFixed(0), off(i));
    });
  }
  return { cells, lab, pcs, hatch };
}
/* ---------- 侧栏：方面军 ---------- */
function thSecUnitsHTML(v, s) {
  const st = thSt(), D = UI.thSecD && UI.thSecD.length === W.thSecs(v.T).list.length ? UI.thSecD : thSecData(v, s); thSecCheck(v, s, D);
  const mine = D.filter(c => c.own.length).sort((a, b) => (b.enSh > 0 || b.adj.some(j => D[j].enSeen)) - (a.enSh > 0 || a.adj.some(j => D[j].enSeen)) || b.w - a.w);
  if (!mine.length) return `<p class="muted">${T('th.sec.none')}</p>${typeof thOpsHTML === 'function' ? thOpsHTML(v, s) : ''}`;
  if (st.secSel != null && !D[st.secSel].own.length) st.secSel = null;
  let h = '';
  const c = st.secSel != null ? D[st.secSel] : null;
  if (c) {
    const nm = EN() ? c.n[1] : c.n[0];
    h += `<div class="thselbox thsecbox"><div class="thselhd"><b>${esc(T('th.sec.army', { x: { raw: nm } }))}</b><button class="mini" data-thsclr="1">${T('th.clear')}</button></div>`;
    h += `<div class="thuinfo">${esc(T('th.sec.comp', { n: c.own.length, w: { raw: c.w.toFixed(1) }, m: c.mob, s: { raw: Math.round(c.sp * 100) + '%' } }))}<div class="muted" style="font-size:12px">${esc(T('th.sec.ctl', { a: Math.round(c.fr * 100), b: Math.round(c.enSh * 100) }))}${c.contested ? ' · <b class="warn">' + T('th.sec.contested') + '</b>' : ''}</div></div>`;
    h += `<div class="thords">${['attack', 'hold', 'dig', 'reserve', 'move'].map(k => `<button class="${st.secMode === k ? 'on' : ''}" data-thsord="${k}" title="${esc(k === 'attack' ? T('th.sec.oh.attack') : k === 'move' ? T('th.sec.oh.move') : T('th.oh.' + k))}">${T('th.sec.o.' + k)}</button>`).join('')}</div>`;
    h += st.secMode ? `<div class="alert">${esc(st.secMode === 'attack' ? T('th.sec.oh.attack') : T('th.sec.oh.move'))}</div>` : '';
    const near = c.adj.map(j => D[j]).filter(d => d.side === 'en' || d.enSeen || d.contested);
    if (near.length) h += `<div class="muted" style="font-size:12px;margin-top:4px">${esc(T('th.sec.near', { x: { raw: near.map(d => (EN() ? d.n[1] : d.n[0]) + (d.enSeen ? ' (' + T('th.sec.en', { w: { raw: d.en.toFixed(0) } }) + ')' : '')).join(sep()) } }))}</div>`;
    h += `</div>`;
  } else h += `<p class="muted" style="font-size:12px">${T('th.sec.sel_help')}</p>`;
  const ci = st.secInfo != null && st.secInfo !== st.secSel ? D[st.secInfo] : null;
  if (ci) { const nm = EN() ? ci.n[1] : ci.n[0], bits = [T('th.sec.ctl', { a: Math.round(ci.fr * 100), b: Math.round(ci.enSh * 100) })]; if (ci.w > 0) bits.push(T('th.sec.ours', { a: { raw: ci.w.toFixed(1) } })); if (ci.al > 0.3) bits.push(T('th.sec.al', { w: { raw: ci.al.toFixed(1) } })); if (ci.enSeen) bits.push(T('th.sec.en', { w: { raw: ci.en.toFixed(0) } }));
    h += `<div class="thsecinfo"><b>${esc(T('th.sec.info', { x: { raw: nm } }))}</b>${ci.contested ? ` <span class="tag">${T('th.sec.contested')}</span>` : ''}<div class="muted">${esc(bits.join(' · '))}</div></div>`; }
  if (typeof thPlanHTML === 'function') h += thPlanHTML(v, s);
  if (typeof thOpsHTML === 'function') h += thOpsHTML(v, s);
  h += `<h4>${T('th.sec.armies', { n: mine.length })}</h4><div class="thseclist">`;
  for (const d of mine) {
    const nm = EN() ? d.n[1] : d.n[0], enN = d.adj.reduce((a, j) => a + (D[j].enSeen ? D[j].en : 0), 0) + (d.enSeen ? d.en : 0);
    h += `<button class="thsecrow${st.secSel === d.i ? ' on' : ''}" data-thsa="${d.i}"><b>${esc(T('th.sec.army', { x: { raw: nm } }))}</b><span class="side-${d.side}">${d.contested ? T('th.sec.contested') : ''}</span><small>${esc(T('th.sec.comp', { n: d.own.length, w: { raw: d.w.toFixed(1) }, m: d.mob, s: { raw: Math.round(d.sp * 100) + '%' } }))}${enN > 0.5 ? ' · ' + esc(T('th.sec.en', { w: { raw: enN.toFixed(0) } })) : ''}</small></button>`;
  }
  return h + `</div>${typeof thFrontsHTML === 'function' ? thFrontsHTML(v) : ''}`;
}
/* 方面军的命令 */
function thSecOrder(k) {
  const st = thSt(), s = thS(), v = UI.thV, D = UI.thSecD || thSecData(v, s), c = st.secSel != null ? D[st.secSel] : null; if (!c) return;
  if (k === 'attack' || k === 'move') { st.secMode = st.secMode === k ? null : k; st.plan = null; thRender(); return; }
  const ids = c.own.map(u => u.id), n = +thDo('thOrder', [st.T, ids, { k }]) || 0;
  toast(T('th.sec.ordered', { x: { raw: T('th.sec.army', { x: { raw: EN() ? c.n[1] : c.n[0] } }) }, n, k: T('th.sec.o.' + k) })); st.secMode = null; thRender(); if (n) thAfterChange();
}
function thSecTarget(j) {
  const st = thSt(), s = thS(), v = UI.thV, D = UI.thSecD || thSecData(v, s), c = st.secSel != null ? D[st.secSel] : null, t = D[j]; if (!c || !t) return;
  const mode = st.secMode; st.secMode = null;
  if (mode === 'attack') {
    const z = thSecTargetZone(v, t, 'en'); if (z == null) { toast(T('th.op.why.none')); thRender(); return; }
    // 留三成步兵守住本战区段（攻击力最弱的），其余部队按参谋部方案出击
    const inf = c.own.filter(u => !u.gue && !['pz', 'mot', 'lt', 'jtk'].includes(u.t)).sort((a, b) => (a.str || 0) - (b.str || 0) || a.id - b.id);
    const nk = c.enSh < 0.9 ? Math.min(Math.ceil(inf.length * 0.3), c.own.length - 1) : 0;
    const keep = new Set(inf.slice(0, Math.max(0, nk)).map(u => u.id));
    const ids = c.own.filter(u => !keep.has(u.id)).map(u => u.id); if (!ids.length) { toast(T('th.op.why.nounits')); thRender(); return; }
    if (keep.size) toast(T('th.sec.garrison', { n: keep.size, x: { raw: T('th.sec.army', { x: { raw: EN() ? c.n[1] : c.n[0] } }) } }), 4500);
    st.sel = ids; thPlanMake(z, ids); return;
  }
  if (mode === 'move') {
    const z = thSecTargetZone(v, t, 'fr'); if (z == null) { toast(T('th.op.why.none')); thRender(); return; }
    const P = s.player, rail = [], walk = [];
    for (const u of c.own) { const p = W.thPreview(s, v.T, P, u.id, 'rail', z); (p && p.length ? rail : walk).push(u.id); }
    let n = 0; if (rail.length) n += +thDo('thOrder', [st.T, rail, { k: 'rail', to: z }]) || 0; if (walk.length) n += +thDo('thOrder', [st.T, walk, { k: 'move', to: z }]) || 0;
    toast(n ? T('th.sec.ordered', { x: { raw: T('th.sec.army', { x: { raw: EN() ? c.n[1] : c.n[0] } }) }, n, k: T('th.sec.o.move') }) : T('th.order_no')); thRender(); if (n) thAfterChange();
  }
}
document.addEventListener('click', e => {
  if (!thIsOpen()) return;
  const t = e.target.closest('[data-thlvl],[data-thsz],[data-thsa],[data-thsord],[data-thsclr]'); if (!t) return;
  const d = t.dataset, st = thSt();
  if (d.thlvl) { st.lvl = d.thlvl === 'sec' ? 'sec' : 'fine'; const s = thS(); st.lvlP = (s && s.player) || ''; try { localStorage.setItem(TH_LVL_KEY + ':' + st.lvlP, st.lvl); } catch (er) { } st.secMode = null; st.mode = null; st.plan = null; thRender(); return; }
  if (d.thsclr) { st.secSel = null; st.secMode = null; st.plan = null; thRender(); return; }
  if (d.thsord) { thSecOrder(d.thsord); return; }
  if ((d.thsa !== undefined || d.thsz !== undefined) && st.plan && st.plan.viaPick && typeof thPlanVia === 'function') { const c = W.thSecs(UI.thV.T).list[+(d.thsa ?? d.thsz)]; if (c) thPlanVia(c.zs.slice()); else { st.plan.viaPick = 0; thRender(); } return; } // 参谋部方案：点经由的战区段
  if (d.thsa !== undefined) { const j = +d.thsa; if (st.secMode) { thSecTarget(j); return; } st.secSel = st.secSel === j ? null : j; st.secInfo = j; st.tab = 'units'; thRender(); return; }
  if (d.thsz !== undefined) { const j = +d.thsz; if (thDrag.ended && Date.now() - thDrag.ended < 80) return; if (st.secMode) { thSecTarget(j); return; } const D = UI.thSecD; if (D && D[j] && D[j].own.length) st.secSel = j; st.secInfo = j; st.z = D && D[j] ? D[j].key : null; thRender(); return; }
});
