// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 联机版 · 精细战区：战区地图、部队命令、空军、中国战场（中共、统一战线）、史料、回放 =====================
 * 地图上每个区格按控制方着色（中国战场叠加中共根据地），部队以棋子显示（敌军只有情报估计），选中部队后点区格下令。
 * 作战阶段暂停时（见 04s_thnet.js）同一个界面用来部署，底部出现“完成，继续”。
 * 状态：UI.th = { T, sel:[部队编号], z:区格, mode:命令, tab, lay:{base,sup,ter}, rep:回放帧, pause }
 */
const TH_KINDS = ['hold', 'move', 'attack', 'push', 'rail', 'reserve', 'dig', 'evac', 'guer', 'raid', 'sweep', 'blow'];
const TH_NEEDS_TO = new Set(['move', 'attack', 'push', 'rail', 'raid', 'sweep', 'blow']);
const thSt = () => UI.th || (UI.th = { T: null, sel: [], z: null, mode: null, tab: 'units', lay: { base: 1, sup: 0, ter: 1 }, rep: null });
const thIsOpen = () => !$('#modal').hidden && !!$('#sheet .thmap');
/* 当前用来显示的局面：作战阶段暂停期间，联网的非房主玩家看房主发来的战区快照 */
const thS = () => (typeof thPauseS === 'function' && thPauseS()) || S;
function thList() { const s = thS(); return s && s.th ? W.thTheatersOf(s, s.player) : []; }
function thOpen(T, opt) {
  const st = thSt(), s = thS(); if (!s || !s.th) return;
  const list = W.thTheatersOf(s, s.player); st.T = T || (list.includes(st.T) ? st.T : list[0] || W.thTheaters(s)[0]); if (!st.T) return;
  if (opt && opt.keepSel !== true) { st.sel = []; st.mode = null; st.rep = null; }
  thRender();
}
/* 重绘战区窗口时保持各个滚动区（整个窗口、侧栏、部队列表）的位置；给出 anchor 时，让被点的那一行留在屏幕上原来的位置
   （勾选部队后列表上方会多出选中部队的信息与命令按钮，不处理的话列表会跳回顶部或整体下移） */
const TH_SCROLLERS = ['#sheet', '#sheet .thside', '#sheet .thulist', '#sheet .thres'];
function thRender(opt) {
  const html = thHTML(); if (!html) return;
  if (thIsOpen()) {
    const keep = TH_SCROLLERS.map(sel => { const el = $(sel); return el ? [sel, el.scrollTop] : null; }).filter(Boolean);
    const aSel = opt && opt.anchor, a0 = aSel && $(aSel) ? $(aSel).getBoundingClientRect().top : null;
    $('#sheet').innerHTML = html;
    for (const [sel, top] of keep) { const el = $(sel); if (el) el.scrollTop = top; }
    if (a0 != null) {
      const n = $(aSel);
      if (n) for (let p = n.parentElement, guard = 0; p && p !== document.body && guard < 30; p = p.parentElement, guard++) {
        const d = n.getBoundingClientRect().top - a0; if (Math.abs(d) < 1) break;
        const oy = getComputedStyle(p).overflowY; if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) p.scrollTop += d;
      }
      // 手机上选中部队后命令栏会停在屏幕顶部（sticky）：被点的那一行如果被它挡住，就让列表往下让出位置
      const sb = $('#sheet .thselbox'), sc = $('#sheet');
      if (n && sb && sc && getComputedStyle(sb).position === 'sticky') { const gap = sb.getBoundingClientRect().bottom + 8 - n.getBoundingClientRect().top; if (gap > 0) sc.scrollTop -= gap; }
    }
  } else showModal(html, 'wide wm thsheet', !thSt().pause);
  const inp = $('#thCmd'); if (inp && UI.thCmdDraft) inp.value = UI.thCmdDraft;
}
const thZN = (z, short) => { const n = EN() ? z.en : z.zh; return short ? n.replace(/（.*$/, '').replace(/\s*\(.*$/, '') : n; };
const thUN = u => (u.n ? (EN() ? u.n[1] : u.n[0]) : T('th.u.unknown'));
const thSideCol = sd => ({ me: css('--accent'), al: css('--friend'), en: css('--hostile'), ne: css('--unknown') }[sd] || css('--unknown'));
const thDate = d => (EN() ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][(d.m - 1) % 12]} ${d.d}` : `${d.m}月${d.d}日`);

/* ---------- 地图 ---------- */
function thSVG(v, s) {
  const st = thSt(), Tn = v.T, G = TH_GEO[Tn], P = s.player;
  const full = thFullBox(G); let zb = st.vb && st.vb.T === Tn && st.vb.ar === full.ar ? thClampBox(st.vb.b, full) : thAutoBox(v, full);
  if (st.focusZ != null) { const z = v.zones[st.focusZ]; st.focusZ = null; if (z) { const [x, y, w, h] = zb, m = w * 0.1; if (!(z.x > x + m && z.x < x + w - m && z.y > y + m && z.y < y + h - m)) { zb = thClampBox([z.x - w / 2, z.y - h / 2, w], full); st.vb = { T: Tn, ar: full.ar, b: zb }; } } } // 暂停时对准出事的区格
  st.box = { T: Tn, b: zb, full };
  const [x0, y0, bw, bh] = zb, zf = full.b[2] / bw;
  const k = bw / wmRW() * (wmNarrow() ? 0.82 : 1), land = css('--land'); // k：一个屏幕像素对应的地图单位（棋子、文字保持固定的屏幕大小）
  const fill = { me: mix(css('--accent'), land, 0.5), al: mix(css('--friend'), land, 0.66), en: mix(css('--hostile'), land, 0.62), ne: land };
  const resK = thResOn(v) ? thResSel(v) : -1, resR = resK >= 0 ? v.res.list[resK] : null; // “战果”页：地图显示所选阶段结束时的态势
  const frame = resR ? v.frames[resK + 1] || null : st.rep != null && v.frames[st.rep] ? v.frames[st.rep] : null;
  const ctlOf = i => (frame ? (frame.zc[i] >= 0 ? v.cl[frame.zc[i]] : null) : v.zones[i].c);
  const sideOf = i => (frame ? W.thSideOf(s, P, ctlOf(i)) : v.zones[i].side);
  let defs = `<pattern id="thBase" width="${(4 * k).toFixed(2)}" height="${(4 * k).toFixed(2)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${(1.5 * k).toFixed(2)}" height="${(4 * k).toFixed(2)}" style="fill:#c0281e"/></pattern>`;
  for (const [n, c] of [['me', css('--accent')], ['en', css('--hostile')], ['al', css('--friend')], ['ne', css('--unknown')]]) defs += `<marker id="thA-${n}" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="${(8 * k).toFixed(2)}" markerHeight="${(8 * k).toFixed(2)}" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill:${c}"/></marker><marker id="thR-${n}" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="${(15 * k).toFixed(2)}" markerHeight="${(15 * k).toFixed(2)}" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill:${c};stroke:${css('--paper')};stroke-width:1"/></marker>`;
  const regs = [...new Set(v.zones.map(z => z.r))];
  const secL = !frame && typeof thSecOn === 'function' && thSecOn(v) ? thSecLayer(v, s, k, fill) : null; // 粗一级指挥：战区段
  if (secL) defs += `<pattern id="thSecH" width="${(5 * k).toFixed(2)}" height="${(5 * k).toFixed(2)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${(1.6 * k).toFixed(2)}" height="${(5 * k).toFixed(2)}" style="fill:${css('--warn')};fill-opacity:.7"/></pattern>`;
  for (const R of regs) if (GEO.paths[R]) defs += `<clipPath id="thc-${Tn}-${R}"><path d="${GEO.paths[R]}"/></clipPath>`;
  // 背景：战区外的地区
  let bg = '';
  for (const id of W.IDS) { const b = GEO.bbox[id]; if (!b || b[2] < x0 || b[0] > x0 + bw || b[3] < y0 || b[1] > y0 + bh || regs.includes(id)) continue; bg += `<path class="thbg" d="${GEO.paths[id]}"/>`; }
  // 区格
  let cells = '', over = '', lab = '';
  for (const z of v.zones) {
    if (secL) break;
    const sd = sideOf(z.i), path = G.cells[z.id]; if (!path) continue;
    let f = fill[sd] || land;
    if (st.lay.sup && z.sup != null && sd !== 'en') f = mix(f, z.sup >= 0.7 ? css('--good') : z.sup >= 0.4 ? css('--warn') : css('--bad'), 0.35);
    cells += `<path class="thz${st.z === z.i ? ' sel' : ''}${z.imp ? ' imp' : ''}" data-thz="${z.i}" d="${path}" clip-path="url(#thc-${Tn}-${z.r})" style="fill:${f}"><title>${esc(thZN(z))}</title></path>`;
    if (v.cn && st.lay.base && !frame && z.cb >= 25) over += `<path class="thcb nohit" d="${path}" clip-path="url(#thc-${Tn}-${z.r})" style="fill:url(#thBase);fill-opacity:${Math.min(0.85, 0.15 + z.cb / 120).toFixed(2)}"/>`;
    if (z.vp >= (zf >= 2.2 ? 0 : zf >= 1.4 ? 1 : Tn === 'C' ? 3 : 2) || z.cap || st.z === z.i) lab += `<g transform="translate(${z.x.toFixed(2)},${(z.y + 3.2 * k).toFixed(2)}) scale(${k.toFixed(4)})"><text class="thzl${z.cap ? ' cap' : ''}">${z.cap ? '★' : ''}${esc(thZN(z, true))}</text></g>`;
  }
  if (secL) { cells = secL.cells; over = secL.hatch; lab = secL.lab; }
  // 地形、河流、铁路、工事
  let geo = '';
  if (st.lay.ter) for (const [t, p] of G.ter) geo += `<path class="thter t-${t} nohit" d="${p}"/>`;
  for (const [n, p] of G.riv) geo += `<path class="thriv nohit" d="${p}"><title>${esc(n)}</title></path>`;
  for (const [p, lv] of G.rail) geo += `<path class="thrail${lv >= 2 ? ' main' : lv ? '' : ' minor'} nohit" d="${p}"/>`;
  for (const [n, p] of G.fort) geo += `<path class="thfort nohit" d="${p}"><title>${esc(n)}</title></path>`;
  // 战区边界（地区轮廓）
  let outl = ''; for (const R of regs) if (GEO.paths[R]) outl += `<path class="throut nohit" d="${GEO.paths[R]}"/>`;
  // 选中部队的路线
  let paths = '';
  const units = frame ? thFrameUnits(v, frame) : v.units;
  for (const u of units) {
    if (!u.own || !u.ord || frame || secL) continue; const sel = st.sel.includes(u.id); if (!sel && !(st.sel.length === 0 && (u.ord.k === 'push' || u.ord.k === 'attack'))) continue;
    const pts = [[v.zones[u.z].x, v.zones[u.z].y]]; const seq = u.ord.k === 'attack' || u.ord.k === 'sweep' && u.ord.to != null && !(u.ord.p && u.ord.p.length) ? [u.ord.to] : (u.ord.p || []);
    for (const z of seq) if (v.zones[z]) pts.push([v.zones[z].x, v.zones[z].y]);
    if (pts.length < 2) continue;
    paths += `<polyline class="thpath${sel ? ' sel' : ''} k-${u.ord.k}" points="${pts.map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ')}" marker-end="url(#thA-me)"/>`;
  }
  if (st.preview && st.preview.length) { const u = v.units.find(x => x.id === st.sel[0]); if (u) { const pts = [[v.zones[u.z].x, v.zones[u.z].y]].concat(st.preview.map(z => [v.zones[z].x, v.zones[z].y])); paths += `<polyline class="thpath prev" points="${pts.map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ')}" marker-end="url(#thA-me)"/>`; } }
  // 本阶段的事件标记
  let evs = '';
  if (!frame) {
    const ph = v.ph || 0, seen = {};
    for (const e of v.ev.filter(e => e.ph === ph || (ph === 0 && e.ph === 6))) {
      const z = v.zones[e.z]; if (!z || seen[e.z + e.k]) continue; seen[e.z + e.k] = 1;
      const g = { cap: e.lib ? '★' : '⚑', brk: '⚔', enc: '◎', sur: '✖', evac: '⚓', sweep: '⊘', raid: '✶', fric: '⚡', land: '⚓', drop: '☂', cross: '≈', op: '➤' }[e.k]; if (!g) continue;
      const col = e.c ? thSideCol(W.thSideOf(s, P, e.c)) : css('--ink');
      evs += `<g class="thev nohit" transform="translate(${(z.x + 4 * k).toFixed(2)},${(z.y - 4 * k).toFixed(2)}) scale(${k.toFixed(4)})"><circle r="6"/><text y="3" style="fill:${col}">${g}</text></g>`;
    }
  }
  // 部队棋子：每个区格最多三枚（手机上两枚），其余合并显示“+n”
  let pcs = '';
  const byZ = {}; for (const u of units) (byZ[u.z] = byZ[u.z] || []).push(u);
  for (const [zs, list] of Object.entries(secL ? {} : byZ)) {
    const z = v.zones[+zs]; if (!z) continue;
    const rank = u => (u.own ? 0 : u.foe ? 2 : 1);
    list.sort((a, b) => rank(a) - rank(b) || (b.str || (b.est ? b.est[1] : 0)) - (a.str || (a.est ? a.est[1] : 0)));
    const shown = list.slice(0, wmNarrow() && zf < 1.8 ? 2 : 3), more = list.length - shown.length;
    shown.forEach((u, j) => {
      const sd = u.own ? 'me' : u.foe ? 'en' : 'al', col = thSideCol(sd), sel = st.sel.includes(u.id);
      const dx = (j - (shown.length - 1) / 2) * 15, s100 = u.s != null ? u.s : u.est ? Math.min(1, u.est[1] / Math.max(0.3, u.est[1])) : 1;
      const sym = T_(u.t);
      pcs += `<g class="thu${sel ? ' sel' : ''}${u.own ? ' own' : ''}${u.foe ? ' foe' : ''}${u.gue ? ' gue' : ''}" data-thu="${u.id}" data-thz="${u.z}" transform="translate(${(z.x).toFixed(2)},${(z.y).toFixed(2)}) scale(${k.toFixed(4)}) translate(${dx.toFixed(1)},-5)"><rect x="-7" y="-6" width="14" height="11" rx="2" style="stroke:${col};fill:${mix(col, css('--paper'), u.foe && u.t === '?' ? 0.85 : 0.72)}"/><text y="2.6" style="fill:${col}">${esc(sym)}</text>${u.s != null ? `<rect class="thbar" x="-7" y="6" width="${(14 * Math.max(0, Math.min(1, s100))).toFixed(1)}" height="2" style="fill:${s100 > 0.6 ? css('--good') : s100 > 0.3 ? css('--warn') : css('--bad')}"/>` : ''}${u.hd ? '<text class="thhd" x="6" y="-4">!</text>' : ''}<title>${esc(thUnitTitle(u, v))}</title></g>`;
    });
    if (more > 0) pcs += `<g class="thmore nohit" transform="translate(${z.x.toFixed(2)},${z.y.toFixed(2)}) scale(${k.toFixed(4)}) translate(${(shown.length * 7.5 + 4).toFixed(1)},-1)"><text>+${more}</text></g>`;
  }
  if (secL) pcs = secL.pcs;
  const RL = resR ? thResLayer(v, s, resR, k, Tn) : { lo: '', hi: '' };
  const fb = full.b;
  return `<svg class="${zf > 1.02 ? 'zoomed' : ''}${resR ? ' resmode' : ''}" viewBox="${x0.toFixed(2)} ${y0.toFixed(2)} ${bw.toFixed(2)} ${bh.toFixed(2)}" role="img" aria-label="${esc(T('th.map'))}"><defs>${defs}</defs><rect x="${fb[0] - fb[2]}" y="${fb[1] - fb[3]}" width="${fb[2] * 3}" height="${fb[3] * 3}" class="wsea"/>${bg}<g class="thcells">${cells}</g>${over}${geo}${outl}${RL.lo}${lab}${paths}${!frame && typeof thPlanSVG === 'function' ? thPlanSVG(v, k) : ''}${evs}${frame ? '' : thLinkMarks(v, k)}${pcs}${RL.hi}</svg>`;
}
/* ---------- 缩放与平移 ---------- */
/* 全图范围（按屏幕宽窄取不同的长宽比） */
function thFullBox(G) {
  const [bx0, by0, bx1, by1] = G.bbox, pad = 2, ar = wmNarrow() ? 1.05 : 1.45; let x0 = bx0 - pad, y0 = by0 - pad, bw = bx1 - bx0 + pad * 2, bh = by1 - by0 + pad * 2;
  if (bw / bh < ar) { const nw = bh * ar; x0 -= (nw - bw) / 2; bw = nw; } else { const nh = bw / ar; y0 -= (nh - bh) / 2; bh = nh; }
  return { b: [x0, y0, bw, bh], ar };
}
/* 把视窗限制在全图之内，最大放大 7 倍 */
function thClampBox(b, full) {
  const F = full.b; let [x, y, w] = b; w = clamp(w, F[2] / 7, F[2]); const h = w / full.ar;
  x = clamp(x, F[0], F[0] + F[2] - w); y = clamp(y, F[1], F[1] + F[3] - h);
  return [x, y, w, h];
}
/* 默认视窗：框住我方部队（中国战场上不必把东北、日本本土都画进来）；自己没有部队时框住可见的敌军 */
function thAutoBox(v, full) {
  let zs = []; for (const u of v.units) if (u.own) { const z = v.zones[u.z]; if (z) zs.push(z); }
  if (new Set(zs).size < 2) for (const u of v.units) if (u.foe) { const z = v.zones[u.z]; if (z) zs.push(z); } // 没有部队（观察者）时看敌军
  if (new Set(zs).size < 2) return full.b.slice();
  // 去掉远离主力的零星部队（如琼崖纵队、东江纵队），按 8%–92% 分位取范围
  const xs = zs.map(z => z.x).sort((a, b) => a - b), ys = zs.map(z => z.y).sort((a, b) => a - b), n = xs.length, cut = n >= 8 ? Math.floor(n * 0.08) : 0;
  let x0 = xs[cut], x1 = xs[n - 1 - cut], y0 = ys[cut], y1 = ys[n - 1 - cut];
  const pad = Math.max(3, (x1 - x0) * 0.07, (y1 - y0) * 0.07); x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  let w = Math.max(x1 - x0, (y1 - y0) * full.ar, full.b[2] * 0.3), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (wmNarrow() && w > full.b[2] * 0.38) { w = full.b[2] * 0.38; cx = zs.reduce((a, z) => a + z.x, 0) / zs.length; cy = zs.reduce((a, z) => a + z.y, 0) / zs.length; } // 手机上地图太小：先对准部队最密集的地方，需要时再缩小
  if (w >= full.b[2] * 0.92) return full.b.slice();
  return thClampBox([cx - w / 2, cy - w / full.ar / 2, w], full);
}
/* 以某点为中心缩放（f < 1 放大） */
function thZoomAt(f, cx, cy) {
  const st = thSt(), bx = st.box; if (!bx) return;
  const [x, y, w, h] = bx.b, nw = w * f;
  if (cx == null) { cx = x + w / 2; cy = y + h / 2; }
  const b = thClampBox([cx - (cx - x) * (nw / w), cy - (cy - y) * (nw / w), nw], bx.full);
  st.vb = b[2] >= bx.full.b[2] * 0.999 ? { T: bx.T, ar: bx.full.ar, b: bx.full.b.slice() } : { T: bx.T, ar: bx.full.ar, b };
  thRender();
}
/* 把某个区格移到视野中（已在视野内则不动） */
function thFocusZone(z) {
  const st = thSt(), bx = st.box, v = UI.thV; if (!bx || !v || !v.zones[z]) return false;
  const [x, y, w, h] = bx.b, zz = v.zones[z], m = w * 0.08;
  if (zz.x > x + m && zz.x < x + w - m && zz.y > y + m && zz.y < y + h - m) return false;
  st.vb = { T: bx.T, ar: bx.full.ar, b: thClampBox([zz.x - w / 2, zz.y - h / 2, w], bx.full) }; return true;
}
const thSvgPt = (svg, cx, cy) => { const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy; const m = svg.getScreenCTM(); return m ? pt.matrixTransform(m.inverse()) : null; };
const T_ = t => (t === '?' ? '?' : T('th.ut.' + t));
function thFrameUnits(v, fr) { const by = {}; for (const u of v.units) by[u.id] = u; return fr.u.map(([id, z, s]) => (by[id] ? Object.assign({}, by[id], by[id].est ? { z } : { z, s: s / 100 }) : null)).filter(Boolean); } // 敌军只有情报估计，回放中也不显示确切兵力
function thUnitTitle(u, v) {
  if (u.est) return `${u.n ? thUN(u) + ' · ' : ''}${NAME(u.c)} · ${T('th.est', { a: u.est[0].toFixed(1), b: u.est[1].toFixed(1) })}`;
  return `${thUN(u)} · ${NAME(u.c)} · ${T('th.utl.' + u.t)} · ${T('th.str')} ${Math.round(u.s * 100)}% · ${T('th.org')} ${Math.round(u.o * 100)}% · ${T('th.sup')} ${Math.round(u.sp * 100)}% · ${thOrdText(u, v)}`;
}
function thOrdText(u, v) {
  const o = u.nx || u.ord || { k: 'hold' }, to = o.to != null ? o.to : o.p && o.p.length ? o.p[o.p.length - 1] : null;
  const zn = to != null && v.zones[to] ? thZN(v.zones[to], true) : '', lag = u.nx ? ' · ' + T('th.lag') : '';
  if (o.op) { // 作战部队：按角色说明（留守、跟进、休整、打通补给线）
    const rs = u.ord && u.ord.rs ? ' · ' + T('th.op.r.rs') : '';
    if (o.ro) return T('th.op.r.ro', { x: { raw: zn } }) + rs + lag;
    if (o.r === 'gd' && o.g != null && v.zones[o.g]) return T('th.op.r.gd', { x: { raw: thZN(v.zones[o.g], true) } }) + (o.k !== 'hold' ? ' · ' + T('th.op.r.enr') : '') + rs + lag;
    if (o.r === 'fl') return T('th.op.r.fl') + (zn && o.k !== 'hold' ? ' → ' + zn : '') + rs + lag;
  }
  return T('th.o.' + o.k) + (zn ? ' → ' + zn : '') + (u.ord && u.ord.rs ? ' · ' + T('th.op.r.rs') : '') + lag;
}

/* ---------- 侧栏 ---------- */
function thHTML() {
  const s = thS(); if (!s || !s.th) return null;
  const st = thSt(), list = W.thTheatersOf(s, s.player), all = W.thTheaters(s);
  if (st.pause && typeof thPauseLive === 'function' && !thPauseLive(st.pause)) { st.pause = null; return thHTML(); } // 过期的暂停（结算已结束、房主已更换）
  if (!st.T || !s.th.T[st.T]) st.T = list[0] || all[0]; if (!st.T) return null;
  const v = W.thView(s, st.T, s.player); if (!v) return null;
  UI.thV = v;
  const tabs = all.map(Tt => `<button class="${Tt === st.T ? 'on' : ''}" data-tht="${Tt}">${esc(EN() ? TH_DATA[Tt].name[1] : TH_DATA[Tt].name[0])}${list.includes(Tt) ? '' : ` <small>${T('th.observe')}</small>`}</button>`).join('');
  const sideTabs = ['units', 'res', 'zone', 'air'].concat(v.cn ? ['cn'] : []).concat(['log', 'src']).map(k => `<button class="${st.tab === k ? 'on' : ''}" data-thtab="${k}">${T('th.tab.' + k)}</button>`).join('');
  const sec = typeof thSecOn === 'function' && thSecOn(v); if (sec) UI.thSecD = thSecData(v, s);
  const body = sec && st.tab === 'units' ? thSecUnitsHTML(v, s) : st.tab === 'res' ? thResHTML(v, s) : st.tab === 'zone' ? thZoneHTML(v, s) : st.tab === 'air' ? thAirHTML(v, s) : st.tab === 'cn' ? thCnHTML(v, s) : st.tab === 'log' ? thLogHTML(v, s) : st.tab === 'src' ? thSrcHTML(v) : thUnitsHTML(v, s);
  const ph = v.ph, pz = st.pause;
  const head = ph ? T('th.phase_on', { n: ph, m: v.phases, a: { raw: thDate(v.d0) }, b: { raw: thDate(v.d1) } }) : T('th.plan_phase', { x: { raw: dateStr(s) } });
  const rep = thResOn(v) ? thResBar(v, s) : v.frames.length > 1 ? `<div class="threp"><span>${T('th.replay')}</span><input type="range" id="thRep" min="0" max="${v.frames.length - 1}" value="${st.rep == null ? v.frames.length - 1 : st.rep}"><b>${st.rep == null ? T('th.now') : T('th.day', { n: v.frames[st.rep].d })}</b></div>` : '';
  const lay = `<div class="thlay">${['base', 'sup', 'ter'].filter(k => k !== 'base' || v.cn).map(k => `<label><input type="checkbox" data-thlay="${k}" ${st.lay[k] ? 'checked' : ''}> ${T('th.lay.' + k)}</label>`).join('')}</div>`;
  const foot = pz ? `<div class="foot thfoot"><span class="muted thpz">${esc(pz.label || '')}${pz.until ? ` · ⏱ <b id="thTimer">${thLeft(pz.until)}</b>` : ''}</span><button data-thskip="1">${T('th.skip_q')}</button><button class="btn-primary" data-thready="1">${pz.last ? T('th.ready_last') : T('th.ready')}</button></div>`
    : `<div class="foot"><label class="chk" style="margin-right:auto"><input type="checkbox" data-thstaff="1" ${v.staff ? 'checked' : ''}> ${T('th.staff')}</label><button class="btn-primary" data-close="1">${T('u.close')}</button></div>`;
  return `<div class="thmap wmap${st.mode && TH_NEEDS_TO.has(st.mode) ? ' tgt' : ''}"><div class="kicker">${T('th.kicker')} · ${esc(EN() ? v.name[1] : v.name[0])} · ${esc(head)}</div>
    <h2>${esc(EN() ? v.name[1] : v.name[0])}${s.player ? ' · ' + esc(NAME(s.player)) : ''}</h2>
    <div class="thtop">${all.length > 1 ? `<div class="wtabs">${tabs}</div>` : '<span></span>'}${typeof thLvlHTML === 'function' ? thLvlHTML(v) : ''}</div>
    <div class="wbody thbody"><div class="wsvg thsvg">${thSVG(v, s)}<div class="thzoom"><button data-thzm="in" title="${esc(T('th.zm.in'))}" aria-label="${esc(T('th.zm.in'))}">＋</button><button data-thzm="out" title="${esc(T('th.zm.out'))}" aria-label="${esc(T('th.zm.out'))}">－</button><button data-thzm="auto" title="${esc(T('th.zm.auto'))}" aria-label="${esc(T('th.zm.auto'))}">◎</button><button data-thzm="full" title="${esc(T('th.zm.full'))}" aria-label="${esc(T('th.zm.full'))}">⤢</button></div>${thLegend(v)}${lay}${rep}</div>
      <div class="wside thside"><div class="thstabs">${sideTabs}</div>${thResStrip(v, s)}${typeof thOpsStrip === 'function' ? thOpsStrip(v, s) : ''}${body}</div></div>
    <form class="thcmd" id="thCmdForm"><input id="thCmd" maxlength="300" placeholder="${esc(T('th.cmd_ph'))}" autocomplete="off"><button type="submit">${T('th.cmd_go')}</button></form>
    ${foot}</div>`;
}
function thLegend(v) {
  const land = css('--land'), sw = c => `<i style="background:${c}"></i>`;
  const sec = typeof thSecOn === 'function' && thSecOn(v);
  return `<div class="wlegend thleg"><span>${sw(mix(css('--accent'), land, 0.5))}${T('th.lg.me')}</span><span>${sw(mix(css('--friend'), land, 0.66))}${T('th.lg.al')}</span><span>${sw(mix(css('--hostile'), land, 0.62))}${T('th.lg.en')}</span>${sec ? `<span><i style="background:repeating-linear-gradient(45deg,${css('--warn')} 0 2px,transparent 2px 5px)"></i>${T('th.sec.lg')}</span>` : v.cn ? `<span><i style="background:repeating-linear-gradient(45deg,#c0281e 0 2px,transparent 2px 5px)"></i>${T('th.lg.base')}</span>` : ''}<span><b class="lgriv"></b>${T('th.lg.riv')}</span><span><b class="lgrail"></b>${T('th.lg.rail')}</span>${TH_GEO[v.T].fort.length ? `<span><b class="lgfort"></b>${T('th.lg.fort')}</span>` : ''}</div>`;
}
function thLeft(until) { const l = Math.max(0, Math.round((until - Date.now()) / 1000)); return Math.floor(l / 60) + ':' + String(l % 60).padStart(2, '0'); }
function thMine(v) { return v.units.filter(u => u.own); }
function thUnitsHTML(v, s) {
  const st = thSt(), P = s.player, mine = thMine(v);
  if (!mine.length) return `<p class="muted">${T('th.no_units')}</p>${thFrontsHTML(v)}`;
  st.sel = st.sel.filter(id => mine.some(u => u.id === id));
  let h = typeof thNLHTML === 'function' ? thNLHTML(v) : '';
  if (st.sel.length) {
    const sel = mine.filter(u => st.sel.includes(u.id)), kinds = W.thOrderKinds(s, v.T, P, st.sel);
    h += `<div class="thselbox"><div class="thselhd"><b>${sel.length === 1 ? esc(thUN(sel[0])) : T('th.nsel', { n: sel.length })}</b><button class="mini" data-thclr="1">${T('th.clear')}</button></div>`;
    if (sel.length === 1) { const u = sel[0]; h += `<div class="thuinfo">${esc(T('th.utl.' + u.t))}${u.ar ? ' · ' + esc(u.ar) : ''} · ${esc(thZN(v.zones[u.z], true))}<div class="grid2">${[['th.str', u.s], ['th.org', u.o], ['th.sup', u.sp], ['th.ent', u.en]].map(([k, x]) => `<div class="stat"><span>${T(k)}</span><b class="${x < 0.3 ? 'bad' : x < 0.6 ? 'warn' : ''}">${Math.round(x * 100)}%</b></div>`).join('')}</div><div class="muted" style="font-size:12px">${T('th.cur')}${esc(thOrdText(u, v))}${u.enc ? ' · <b class="bad">' + T('th.encd') + '</b>' : ''}</div></div>`; }
    h += `<div class="thords">${kinds.map(k => `<button class="${st.mode === k ? 'on' : ''}" data-thmode="${k}" title="${esc(T('th.oh.' + k))}">${T('th.o.' + k)}</button>`).join('')}<button class="${sel.every(u => u.hd) ? 'on' : ''}" data-thhd="1" title="${esc(T('th.oh.hd'))}">${T('th.o.hd')}</button></div>`;
    h += st.mode && TH_NEEDS_TO.has(st.mode) ? `<div class="alert">${st.mode === 'attack' || st.mode === 'push' ? T('th.pick_to2') : T('th.pick_to', { k: T('th.o.' + st.mode) })}</div>` : `<p class="muted" style="font-size:11.5px">${T('th.ord_help')}</p>`;
    h += `</div>`;
  } else h += `<p class="muted" style="font-size:12px">${T('th.sel_help')}</p>`;
  if (typeof thPlanHTML === 'function') h += thPlanHTML(v, s);
  if (typeof thOpsHTML === 'function') h += thOpsHTML(v, s);
  // 我方部队（按区格分组）
  const byZ = {}; for (const u of mine) (byZ[u.z] = byZ[u.z] || []).push(u);
  const zs = Object.keys(byZ).map(Number).sort((a, b) => (v.zones[b].side === 'en') - (v.zones[a].side === 'en') || byZ[b].length - byZ[a].length);
  h += `<h4>${T('th.my_units', { n: mine.length, w: mine.reduce((x, u) => x + u.str, 0).toFixed(1) })}</h4><div class="thulist">`;
  for (const z of zs.slice(0, 40)) {
    const zz = v.zones[z], all = byZ[z].every(u => st.sel.includes(u.id));
    h += `<div class="thug"><div class="thugh"><button class="lnk" data-thzone="${z}">${esc(thZN(zz, true))}</button>${zz.side === 'en' ? ` <span class="tag red">${T('th.in_enemy')}</span>` : ''}<button class="mini" data-thselz="${z}">${all ? T('th.unsel_all') : T('th.sel_all')}</button></div>`;
    for (const u of byZ[z].slice(0, 12)) h += `<label class="thurow${st.sel.includes(u.id) ? ' on' : ''}"><input type="checkbox" data-thsel="${u.id}" ${st.sel.includes(u.id) ? 'checked' : ''}><span class="sym">${esc(T_(u.t))}</span><span class="nm">${esc(thUN(u))}</span><span class="bar"><i style="width:${Math.round(u.s * 100)}%"></i></span><small>${esc(thOrdText(u, v))}</small></label>`;
    if (byZ[z].length > 12) h += `<div class="muted" style="font-size:11px">${T('th.more_n', { n: byZ[z].length - 12 })}</div>`;
    h += `</div>`;
  }
  h += `</div>${thFrontsHTML(v)}`;
  return h;
}
function thFrontsHTML(v) {
  if (!v.fronts.length) return '';
  return `<h4>${T('th.fronts')}</h4><ul class="thfr">${v.fronts.map(f => `<li><b>${esc(NAME(f.att))} → ${esc(NAME(f.target))}</b> <span class="num">${f.progress}%</span>${f.ratio ? ` · ${T('u.fratio')} ${f.ratio}` : ''}${thFrontNote(f, v)}</li>`).join('')}</ul>`;
}
function thZoneHTML(v, s) {
  const st = thSt(), z = st.z != null ? v.zones[st.z] : null;
  if (!z) return `<p class="muted">${T('th.zone_help')}</p>`;
  const P = s.player, air = v.air || {};
  let h = `<div class="whd"><b>${esc(thZN(z))}</b><span class="tag ${z.side === 'me' ? 'blue' : z.side === 'en' ? 'red' : ''}">${z.c ? esc(NAME(z.c)) : '—'}</span></div>`;
  h += `<div class="muted" style="font-size:12px">${T('th.ter.' + z.t)} · ${T('th.fortv', { n: z.fort.toFixed(1) })}${z.vp ? ' · ' + T('th.vp', { n: z.vp }) : ''}${z.port ? ' · ⚓' : ''}${z.hub ? ' · ' + T('th.hub') : ''}${z.sup != null && z.side !== 'en' ? ' · ' + T('th.supv', { n: Math.round(z.sup * 100) }) : ''}</div>`;
  h += thZoneEcoHTML(z);
  if (v.link && v.link.focus.includes(z.i)) h += `<div class="tag acc" style="margin:3px 0;display:inline-block">${T('th.lk.focus_z')}</div> `;
  if (v.link && v.link.hold.includes(z.i)) h += `<div class="tag blue" style="margin:3px 0;display:inline-block">${T('th.lk.hold_z')}</div>`;
  if (z.towns) h += `<div class="muted" style="font-size:11.5px">${esc(z.towns.split(' ').filter(x => EN() ? /^[A-Za-z]/.test(x) : !/^[A-Za-z]/.test(x)).join(EN() ? ', ' : '、'))}</div>`;
  if (v.cn && z.cb != null) h += `<div class="grid2 thcn">${[['th.cn.base', z.cb, 'bad'], ['th.cn.jc', z.jc, ''], ['th.cn.kg', z.kg, ''], ['th.cn.pop', z.pop, '']].map(([k, x]) => `<div class="stat"><span>${T(k)}</span><b>${k === 'th.cn.pop' ? x.toFixed(1) : Math.round(x)}</b></div>`).join('')}</div><div class="muted" style="font-size:11.5px">${T('th.cn.sabbh', { a: Math.round(z.sab * 100), b: Math.round(z.bh * 100) })}</div>`;
  const here = v.units.filter(u => u.z === z.i);
  if (here.length) h += `<h4>${T('th.units_here')}</h4><ul class="thzu">${here.map(u => `<li class="${u.own ? 'own' : u.foe ? 'foe' : 'al'}"><span class="sym">${esc(T_(u.t))}</span>${u.own ? `<button class="lnk" data-thsel1="${u.id}">${esc(thUN(u))}</button>` : esc(u.n ? thUN(u) : T('th.u.unknown'))} <small>${esc(NAME(u.c))}${u.est ? ' · ' + T('th.est', { a: u.est[0].toFixed(1), b: u.est[1].toFixed(1) }) : u.s != null ? ' · ' + Math.round(u.s * 100) + '%' : ''}</small></li>`).join('')}</ul>`;
  else if (z.vis === 0) h += `<p class="muted" style="font-size:12px">${T('th.fog')}</p>`;
  // 空军重点、炸桥
  h += `<div class="btns" style="margin-top:8px"><button data-thcas="${z.i}" class="${(air.z || []).includes(z.i) ? 'on' : ''}">✈ ${T('th.air.casz')}</button><button data-thint="${z.i}" class="${(air.iz || []).includes(z.i) ? 'on' : ''}">✈ ${T('th.air.intz')}</button></div>`;
  return h;
}
function thAirHTML(v, s) {
  const a = v.air || { sup: 0.45, cas: 0.45, int: 0.1, z: [], iz: [] };
  const row = k => `<label class="mpsl"><span>${T('th.air.' + k)}</span><input type="range" min="0" max="100" step="5" value="${Math.round((a[k] || 0) * 100)}" data-thair="${k}"><b>${Math.round((a[k] || 0) * 100)}%</b></label>`;
  const lk = v.link || {};
  return `<p class="muted" style="font-size:12px">${T('th.air_x')}</p>${lk.air > 0 ? `<div class="alert" style="margin:4px 0">${T('th.lk.air_on', { s: { pct: lk.air } })}</div>` : ''}${lk.bomb < 0.99 ? `<div class="muted" style="font-size:12px;margin:4px 0">${T('th.lk.bomb', { s: { pct: 1 - lk.bomb } })}</div>` : ''}${row('sup')}${row('cas')}${row('int')}
    <div class="muted" style="font-size:12px;margin-top:6px">${T('th.air.focus', { x: { raw: (a.z || []).map(z => v.zones[z] ? thZN(v.zones[z], true) : '?').join(sep()) || '—' }, y: { raw: (a.iz || []).map(z => v.zones[z] ? thZN(v.zones[z], true) : '?').join(sep()) || '—' } })}</div>
    <button class="btn-primary" data-thairgo="1" style="margin-top:8px">${T('th.air.apply')}</button>`;
}
function thCnHTML(v, s) {
  const c = v.cn, P = s.player, uf = c.uf, pol = c.pol;
  const bar = (x, cls) => `<div class="bar"><div style="width:${clamp(x, 0, 100)}%;background:var(--${cls})"></div></div>`;
  let h = `<div class="sec"><h3>${T('th.cn.ccp_t')}</h3><div class="grid2"><div class="stat"><span>${T('th.cn.P')}</span><b>${(c.P || 0).toFixed(1)}${T('th.cn.mil_u')}</b></div><div class="stat"><span>${T('th.cn.str')}</span><b>${persT(c.ccpStr)}</b></div></div>`;
  if (c.hist && c.hist[0] != null) h += `<div class="muted" style="font-size:11.5px">${T(c.hist[1] != null ? 'th.cn.hist' : 'th.cn.hist1', { y: { raw: String(s.year) }, a: { raw: String(c.hist[0]) }, b: { raw: String(c.hist[1]) } })}</div>`;
  if (c.stat.length > 1) h += thSpark(c.stat.map(r => r.P), T('th.cn.trend'));
  h += `</div><div class="sec"><h3>${T('th.cn.uf_t')}</h3><div class="mpg"><span>${T('th.cn.fr')}</span>${bar(uf.fr, uf.fr >= 70 ? 'hostile' : uf.fr >= 45 ? 'warn' : 'neutral')}<b class="num">${uf.fr}</b></div>
    <div class="muted" style="font-size:12px">${T('th.cn.ufst', { a: T(uf.sub ? 'th.cn.sub1' : 'th.cn.sub0'), b: T('th.cn.block' + (uf.block | 0)) })}${uf.north ? ' · <b class="warn">' + T('th.cn.north_on') + '</b>' : ''}${uf.civil ? ' · <b class="bad">' + T('th.cn.civil') + '</b>' : ''}</div>`;
  if (uf.log.length) h += `<ul class="thuflog">${uf.log.slice(-5).reverse().map(l => `<li><small>${esc(dateStr(s, l.t))}</small> ${esc(T('th.ufl.' + String(l.k).replace(':', '_')))}</li>`).join('')}</ul>`;
  const act = (a, arg, lbl, cls) => `<button class="${cls || ''}" data-thuf="${a}" data-arg="${arg == null ? '' : arg}">${lbl}</button>`;
  if (P === 'CCP' && !uf.civil) h += `<div class="btns">${uf.north ? act('comply', null, T('th.uf.comply'), 'btn-primary') : ''}${act('talk', null, T('th.uf.talk'))}${act('propaganda', null, T('th.uf.propaganda'))}${act('expand', pol.exp ? 0 : 1, T(pol.exp ? 'th.uf.expand0' : 'th.uf.expand1'))}${uf.fr >= 90 ? act('war', null, T('th.uf.war'), 'danger') : ''}</div>`;
  if (P === 'CHN' && !uf.civil) h += `<div class="btns">${act('sub', uf.sub ? 0 : 1, T(uf.sub ? 'th.uf.sub0' : 'th.uf.sub1'))}${act('block', ((uf.block | 0) + 1) % 3, T('th.uf.block', { n: ((uf.block | 0) + 1) % 3 }))}${!uf.north ? act('north', null, T('th.uf.north')) : act('attack', uf.north.atk ? 0 : 1, T(uf.north.atk ? 'th.uf.attack0' : 'th.uf.attack1'), uf.north.atk ? 'on' : '')}${act('talk', null, T('th.uf.talk'))}${act('restrict', null, T('th.uf.restrict'))}${uf.fr >= 90 ? act('war', null, T('th.uf.war'), 'danger') : ''}</div>`;
  h += `<p class="muted" style="font-size:11.5px">${T('th.cn.uf_x')}</p></div>`;
  if (P === 'CCP') {
    h += `<div class="sec"><h3>${T('th.cn.pol_t')}</h3>${['rent', 'simple', 'prod', 'rect'].map(k => `<div class="thpol"><label class="chk"><input type="checkbox" data-thpol="${k}" ${pol[k] ? 'checked' : ''}> <b>${T('th.pol.' + k)}</b></label><small>${T('th.pol.' + k + '_x')}</small></div>`).join('')}
      <div class="thpol"><button data-thpol="hundred" class="${c.camp && c.camp.k === 'hundred' && s.turn <= c.camp.until ? 'on' : ''}" ${c.campDone != null && s.turn - c.campDone < 4 ? 'disabled' : ''}>${T('th.pol.hundred')}</button><small>${T('th.pol.hundred_x')}</small></div></div>`;
  }
  if (P === 'JPN') h += `<div class="sec"><h3>${T('th.cn.jp_t')}</h3>${['cage', 'drive'].map(k => `<div class="thpol"><label class="chk"><input type="checkbox" data-thpol="${k}" ${c.jp[k] ? 'checked' : ''}> <b>${T('th.jp.' + k)}</b></label><small>${T('th.jp.' + k + '_x')}</small></div>`).join('')}</div>`;
  return h;
}
function thSpark(vals, lbl) { if (vals.length < 2) return ''; const mx = Math.max(...vals, 1), mn = Math.min(...vals, 0), w = 160, hh = 34; const pts = vals.map((x, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(hh - (x - mn) / (mx - mn || 1) * (hh - 4) - 2).toFixed(1)}`).join(' '); return `<div class="thspark"><svg viewBox="0 0 ${w} ${hh}" width="${w}" height="${hh}"><polyline points="${pts}"/></svg><small>${esc(lbl)}</small></div>`; }
function thLogHTML(v, s) {
  const ev = v.ev.slice().reverse().filter(e => ['cap', 'enc', 'sur', 'evac', 'sweep', 'raid', 'fric', 'land', 'drop', 'op', 'subcap'].includes(e.k)).slice(0, 60);
  if (!ev.length) return `<p class="muted">${T('th.no_ev')}</p>`;
  return `<ul class="thlog">${ev.map(e => { const z = v.zones[e.z]; const d = W.thDate(s, (e.ph - 1) * v.days + ((e.d || 0) % v.days)); return `<li><small>${T('th.ph_n', { n: e.ph })} · ${thDate(d)}</small> ${esc(T('th.ev.' + e.k + (e.k === 'cap' && e.lib ? '_lib' : ''), { a: e.c || '', x: { raw: z ? thZN(z, true) : '' } }))}</li>`; }).join('')}</ul>`;
}
function thSrcHTML(v) {
  const sr = W.thSources(v.T);
  return `<p class="muted" style="font-size:12px">${T('th.src_x')}</p><ul class="thsrc">${sr.list.map(([a, b]) => `<li><b>${esc(a)}</b><small>${esc(b)}</small></li>`).join('')}</ul>${sr.ops.length ? `<h4>${T('th.src_ops')}</h4><ul class="thsrc">${sr.ops.map(o => `<li><b>${esc(NAME(o.c))}${o.y ? ` · ${o.y}Q${o.q}` : ''}</b><small>${esc(o.src)}</small></li>`).join('')}</ul>` : ''}`;
}

/* ---------- 交互 ---------- */
/* 战区命令：本地执行（联机时同时发给房主）；作战阶段暂停期间由 04s 的 thPauseCmd 负责 */
function thDo(op, args) {
  if (typeof thPauseCmd === 'function' && thSt().pause) return thPauseCmd(op, args);
  return doCmd(op, args);
}
function thIssue(k, to) {
  const st = thSt(); if (!st.sel.length) return;
  const r = thDo('thOrder', [st.T, st.sel.slice(), { k, to }]);
  const n = typeof r === 'number' ? r : r ? 1 : 0;
  if (!n && to != null && typeof thIssueFail === 'function' && thIssueFail(k, to)) return;
  toast(n ? T('th.ordered', { n, k: T('th.o.' + k) }) : T('th.order_no'));
  st.mode = null; st.preview = null; thRender(); if (n) thAfterChange();
}
function thAfterChange() { if (thSt().pause || MPS.busy) return; if (typeof autosave === 'function' && !(MPS.on && MPS.mode === 'net')) try { autosave(); } catch (e) { } } // 结算进行中不存档
document.addEventListener('click', e => {
  if (!thIsOpen() && !e.target.closest('[data-thopen]')) return;
  const t = e.target.closest('[data-thopen],[data-tht],[data-thtab],[data-thz],[data-thu],[data-thmode],[data-thhd],[data-thclr],[data-thselz],[data-thzone],[data-thsel1],[data-thcas],[data-thint],[data-thairgo],[data-thuf],[data-thpol],[data-thready],[data-thskip],[data-thzm],[data-thresph],[data-thrz]');
  if (!t || !S) return; const d = t.dataset, st = thSt(), s = thS();
  if (thDrag.ended && Date.now() - thDrag.ended < 80 && (d.thz !== undefined || d.thu !== undefined)) return; // 拖动地图后松手不算点击
  if (d.thzm) { const a = d.thzm; if (a === 'in') thZoomAt(1 / 1.6); else if (a === 'out') thZoomAt(1.6); else if (a === 'auto') { st.vb = null; thRender(); } else if (st.box) { st.vb = { T: st.box.T, ar: st.box.full.ar, b: st.box.full.b.slice() }; thRender(); } return; }
  if (d.thopen !== undefined) { if (d.thres) { st.tab = 'res'; st.resKey = null; } thOpen(d.thopen || null, { keepSel: false }); return; }
  if (d.thresph !== undefined) { st.resPh = +d.thresph; st.resHi = null; if (UI.thV) thResFit(UI.thV); thRender(); return; }
  if (d.thrz !== undefined) { const z = +d.thrz; st.z = z; st.resHi = z; thFocusZone(z); thRender({ anchor: `#sheet [data-thbt="${z}"]` }); return; }
  if (d.tht) { st.T = d.tht; st.sel = []; st.z = null; st.mode = null; st.rep = null; thRender(); return; }
  if (d.thtab) { st.tab = d.thtab; if (st.tab === 'res' && UI.thV) thResFit(UI.thV); thRender(); return; }
  if (d.thclr) { st.sel = []; st.mode = null; st.preview = null; thRender(); return; }
  if (d.thmode) {
    const k = d.thmode; if (!TH_NEEDS_TO.has(k)) { if (k === 'evac' || k === 'hold' || k === 'reserve' || k === 'dig' || k === 'guer') { thIssue(k, null); return; } }
    st.mode = st.mode === k ? null : k; st.preview = null; thRender(); return;
  }
  if (d.thhd) { const v = UI.thV, sel = v.units.filter(u => u.own && st.sel.includes(u.id)), on = !sel.every(u => u.hd); thDo('thHold', [st.T, st.sel.slice(), on]); toast(T(on ? 'th.hd_on' : 'th.hd_off')); thRender(); return; }
  if (d.thselz !== undefined) { const z = +d.thselz, ids = UI.thV.units.filter(u => u.own && u.z === z).map(u => u.id), all = ids.every(id => st.sel.includes(id)); st.sel = all ? st.sel.filter(id => !ids.includes(id)) : [...new Set(st.sel.concat(ids))]; st.z = z; thFocusZone(z); thRender({ anchor: `#sheet [data-thselz="${z}"]` }); return; }
  if (d.thzone !== undefined) { st.z = +d.thzone; st.tab = 'zone'; thFocusZone(st.z); thRender(); return; }
  if (d.thsel1 !== undefined) { st.sel = [+d.thsel1]; st.tab = 'units'; const u = UI.thV.units.find(x => x.id === +d.thsel1); if (u) thFocusZone(u.z); thRender(); return; }
  if (d.thcas !== undefined || d.thint !== undefined) { const v = UI.thV, a = Object.assign({ sup: 0.45, cas: 0.45, int: 0.1, z: [], iz: [] }, v.air), key = d.thcas !== undefined ? 'z' : 'iz', z = +(d.thcas ?? d.thint); const arr = (a[key] || []).slice(); const i = arr.indexOf(z); if (i >= 0) arr.splice(i, 1); else arr.push(z); a[key] = arr.slice(-6); thDo('thAir', [st.T, a]); thRender(); return; }
  if (d.thairgo) { const a = Object.assign({}, UI.thV.air); for (const r of $$('#sheet [data-thair]')) a[r.dataset.thair] = +r.value / 100; thDo('thAir', [st.T, a]); toast(T('th.air.done')); thRender(); return; }
  if (d.thuf) { const a = d.thuf, arg = d.arg === '' ? null : +d.arg; const go = () => { const r = thDo('thUf', [a, arg]); toast(r && r.ok !== false ? T('th.uf.done') : T('th.uf.no')); thRender(); }; if (a === 'war' || a === 'attack' && arg) { mpConfirm(T(a === 'war' ? 'th.uf.war_q' : 'th.uf.attack_q'), () => { go(); thOpen(st.T, { keepSel: true }); }); UI.afterClose = () => thOpen(st.T, { keepSel: true }); } else go(); return; } // 取消时回到战区（暂停中的结算还在等这个窗口）
  if (d.thpol) { const k = d.thpol, inp = t.tagName === 'INPUT' ? t : null; const on = inp ? inp.checked : true; const r = thDo('thPol', [k, on]); toast(r ? T('th.pol_done') : T('th.pol_no')); thRender(); return; }
  if (d.thready) { if (typeof thPauseReady === 'function') thPauseReady(); return; }
  if (d.thskip) { thDo('thSkip', [true]); if (typeof thPauseReady === 'function') thPauseReady(); return; }
  if ((d.thu !== undefined || d.thz !== undefined) && st.plan && st.plan.viaPick && typeof thPlanVia === 'function') { thPlanVia(+d.thz); return; } // 参谋部方案：在地图上点经由的区格
  if (d.thu !== undefined) {
    const id = +d.thu, u = UI.thV.units.find(x => x.id === id), z = +d.thz;
    if (st.mode && TH_NEEDS_TO.has(st.mode)) { thTarget(z); return; }
    if (u && u.own) { st.sel = e.shiftKey ? (st.sel.includes(id) ? st.sel.filter(x => x !== id) : st.sel.concat([id])) : [id]; st.tab = 'units'; }
    st.z = z; if (!u || !u.own) st.tab = 'zone';
    thRender(); return;
  }
  if (d.thz !== undefined) { const z = +d.thz; if (st.mode && TH_NEEDS_TO.has(st.mode)) { thTarget(z); return; }
    if (st.tab === 'res') { st.z = z; st.resHi = z; thRender(); const row = $(`#sheet [data-thbt="${z}"]`), box = $('#sheet .thside'); if (row && box && !wmNarrow()) { const rb = row.getBoundingClientRect(), bb = box.getBoundingClientRect(); if (rb.top < bb.top || rb.bottom > bb.bottom) box.scrollTop += rb.top - bb.top - 40; } return; } // 战果页：点地图上的战斗标记，在侧栏里高亮那场战斗
    st.z = z; if (!st.sel.length) st.tab = 'zone'; thRender(); return; }
});
function thTarget(z) {
  const st = thSt(), k = st.mode;
  if (k === 'blow') { const v = UI.thV, u = v.units.find(x => x.id === st.sel[0]); if (!u) return; const ok = thDo('thBlow', [st.T, u.z, z]); toast(ok ? T('th.blown') : T('th.blow_no')); st.mode = null; thRender(); return; }
  if ((k === 'attack' || k === 'push') && typeof thPlanTarget === 'function' && thPlanTarget(k, z)) return; // 相邻目标直接进攻；远处目标由参谋部拟定方案
  thIssue(k, z);
}
document.addEventListener('change', e => {
  const t = e.target; if (!thIsOpen() || !S) return; const st = thSt();
  if (t.dataset.thsel !== undefined) { const id = +t.dataset.thsel; st.sel = t.checked ? [...new Set(st.sel.concat([id]))] : st.sel.filter(x => x !== id); if (t.checked) { const u = UI.thV.units.find(x => x.id === id); if (u) thFocusZone(u.z); } thRender({ anchor: `#sheet [data-thsel="${id}"]` }); return; }
  if (t.dataset.thlay) { st.lay[t.dataset.thlay] = t.checked ? 1 : 0; thRender(); return; }
  if (t.dataset.thstaff !== undefined) { thDo('thStaff', [st.T, t.checked]); toast(T(t.checked ? 'th.staff_on' : 'th.staff_off')); thRender(); return; }
  if (t.id === 'thRep') { const v = UI.thV, i = +t.value; st.rep = i >= v.frames.length - 1 ? null : i; thRender(); return; }
});
document.addEventListener('input', e => { const t = e.target; if (!thIsOpen()) return; if (t.dataset.thair) { const b = t.nextElementSibling; if (b) b.textContent = t.value + '%'; } if (t.id === 'thCmd') UI.thCmdDraft = t.value; });
document.addEventListener('submit', e => { if (e.target.id !== 'thCmdForm') return; e.preventDefault(); e.stopPropagation(); const v = ($('#thCmd') || {}).value || ''; if (typeof thNLCommand === 'function') thNLCommand(v.trim()); }, true);
/* 滚轮缩放；按住拖动平移；双指捏合缩放。手势进行中只改 viewBox，松手后再重绘（棋子与文字恢复原大小） */
const thDrag = { p: new Map(), b0: null, moved: false, ended: 0, pinch: null, svg: null };
document.addEventListener('wheel', e => {
  const svg = e.target.closest && e.target.closest('#sheet .thsvg svg'); if (!svg || !thIsOpen()) return;
  e.preventDefault(); const q = thSvgPt(svg, e.clientX, e.clientY); if (!q) return;
  const f = Math.exp(clamp(e.deltaY, -120, 120) * (e.deltaMode === 1 ? 0.05 : 0.0022));
  clearTimeout(thDrag.wt); const st = thSt(); if (!st.box) return;
  const [x, y, w] = st.box.b, nw = w * f, b = thClampBox([q.x - (q.x - x) * (nw / w), q.y - (q.y - y) * (nw / w), nw], st.box.full);
  st.box.b = b; svg.setAttribute('viewBox', b.map(n => n.toFixed(2)).join(' '));
  thDrag.wt = setTimeout(() => { st.vb = { T: st.box.T, ar: st.box.full.ar, b: st.box.b.slice() }; thRender(); }, 160);
}, { passive: false });
/* 每个触点记录按下（或触点数变化）时的位置 x0,y0 与当前位置 x,y；触点数一变就以当前视窗为新的起点 */
function thDragRebase() { const st = thSt(); for (const q of thDrag.p.values()) { q.x0 = q.x; q.y0 = q.y; } thDrag.b0 = st.box ? st.box.b.slice() : null; thDrag.pinch = null; if (thDrag.p.size === 2 && thDrag.svg) { const [a, b] = [...thDrag.p.values()]; thDrag.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, m: thSvgPt(thDrag.svg, (a.x + b.x) / 2, (a.y + b.y) / 2) }; } }
document.addEventListener('pointerdown', e => {
  const svg = e.target.closest && e.target.closest('#sheet .thsvg svg'); if (!svg || !thIsOpen() || (e.pointerType === 'mouse' && e.button !== 0)) return;
  if (!thSt().box || thDrag.p.size >= 2) return;
  thDrag.p.set(e.pointerId, { x: e.clientX, y: e.clientY }); thDrag.svg = svg; if (thDrag.p.size === 1) thDrag.moved = false; thDragRebase();
});
document.addEventListener('pointermove', e => {
  const q = thDrag.p.get(e.pointerId); if (!q || !thDrag.svg || !thDrag.svg.isConnected) return;
  q.x = e.clientX; q.y = e.clientY;
  const st = thSt(), svg = thDrag.svg, r = svg.getBoundingClientRect(); if (!st.box || !thDrag.b0 || !r.width) return;
  if (thDrag.p.size === 1) {
    const dx = q.x - q.x0, dy = q.y - q.y0; if (!thDrag.moved && Math.hypot(dx, dy) < 5) return;
    if (thDrag.b0[2] >= st.box.full.b[2] * 0.999) return; // 全图时不拖动，手机上让页面照常滚动
    thDrag.moved = true; const sc = thDrag.b0[2] / r.width;
    st.box.b = thClampBox([thDrag.b0[0] - dx * sc, thDrag.b0[1] - dy * sc, thDrag.b0[2]], st.box.full);
  } else if (thDrag.pinch && thDrag.pinch.m) {
    const [a, b] = [...thDrag.p.values()], f = thDrag.pinch.d / (Math.hypot(a.x - b.x, a.y - b.y) || 1), m = thDrag.pinch.m, [x, y, w] = thDrag.b0, nw = w * f;
    thDrag.moved = true; st.box.b = thClampBox([m.x - (m.x - x) * (nw / w), m.y - (m.y - y) * (nw / w), nw], st.box.full);
  } else return;
  svg.setAttribute('viewBox', st.box.b.map(n => n.toFixed(2)).join(' '));
});
function thDragEnd(e) {
  if (!thDrag.p.has(e.pointerId)) return; thDrag.p.delete(e.pointerId);
  if (thDrag.p.size) { thDragRebase(); return; }
  const st = thSt(); thDrag.pinch = null; thDrag.svg = null;
  if (thDrag.moved && st.box) { thDrag.ended = Date.now(); st.vb = { T: st.box.T, ar: st.box.full.ar, b: st.box.b.slice() }; thDrag.moved = false; setTimeout(thRender, 0); }
}
document.addEventListener('pointerup', thDragEnd); document.addEventListener('pointercancel', thDragEnd);
/* 鼠标悬停在区格上时预览路线（桌面端） */
document.addEventListener('mouseover', e => {
  if (!thIsOpen()) return; const st = thSt(); if (!st.mode || !TH_NEEDS_TO.has(st.mode) || !st.sel.length || st.mode === 'blow') return;
  const g = e.target.closest('[data-thz]'); if (!g) return; const z = +g.dataset.thz; if (st.hoverZ === z) return; st.hoverZ = z;
  const p = W.thPreview(thS(), st.T, thS().player, st.sel[0], st.mode, z); st.preview = p || null;
  const svg = $('#sheet .thsvg svg'); if (!svg) return; const old = svg.querySelector('.thpath.prev'); if (old) old.remove();
  if (p && p.length) { const v = UI.thV, u = v.units.find(x => x.id === st.sel[0]); if (!u) return; const pts = [[v.zones[u.z].x, v.zones[u.z].y]].concat(p.map(i => [v.zones[i].x, v.zones[i].y])); svg.insertAdjacentHTML('beforeend', `<polyline class="thpath prev" points="${pts.map(q => q[0].toFixed(2) + ',' + q[1].toFixed(2)).join(' ')}" marker-end="url(#thA-me)"/>`); }
});

/* ---------- 侧栏“战区”页 ---------- */
function thTabHTML() {
  if (!S || !S.th) return `<p class="muted">${T('th.off')}</p>`;
  const P = S.player, list = W.thTheatersOf(S, P), all = W.thTheaters(S);
  let h = `<div class="sec"><h3>${T('th.tab_t')}</h3><p class="muted" style="font-size:12px;margin:0 0 8px">${T('th.tab_x')}</p><div class="btns">${all.map(Tt => `<button class="${list.includes(Tt) ? 'btn-primary' : ''}" data-thopen="${Tt}">🗺 ${esc(EN() ? TH_DATA[Tt].name[1] : TH_DATA[Tt].name[0])}${list.includes(Tt) ? '' : ' · ' + T('th.observe')}</button>`).join('')}</div></div>`;
  for (const Tt of list) {
    const v = W.thView(S, Tt, P); if (!v) continue; const mine = thMine(v);
    h += `<div class="sec"><h3>${esc(EN() ? v.name[1] : v.name[0])}</h3><div class="grid2"><div class="stat"><span>${T('th.my_div')}</span><b>${mine.length} · ${mine.reduce((x, u) => x + u.str, 0).toFixed(1)}</b></div><div class="stat"><span>${T('th.staff_s')}</span><b>${v.staff ? T('mp.on') : T('mp.off')}</b></div></div>${thFrontsHTML(v)}`;
    const lg = v.log.filter(e => e.t === S.turn - 1).slice(-6);
    if (lg.length) h += `<ul class="thlog">${lg.map(e => { const z = v.zones[e.z]; return `<li>${esc(T('th.ev.' + e.k + (e.k === 'cap' && e.lib ? '_lib' : ''), { a: e.c || '', x: { raw: z ? thZN(z, true) : '' } }))}</li>`; }).join('')}</ul>`;
    if (v.cn && (P === 'CCP' || P === 'CHN' || P === 'JPN')) h += `<p class="muted" style="font-size:12px">${T('th.cn.sum', { a: (v.cn.P || 0).toFixed(1), b: v.cn.uf.fr })}</p>`;
    h += `</div>`;
  }
  h += thOccHTML(S, P) + thLinkHelpHTML();
  return h;
}
