/* ===================== 精细战区 · 界面数据（视图模型）=====================
 * 界面只读这里给出的数据：己方与友军部队的全部信息；敌军只有情报估计（相邻区格、己方区格可见；中国战场上根据地、
 * 治安区与敌后游击区也提供情报），兵力给出一个带噪声的区间。
 */
function thSideOf(S, P, c) { if (!c) return 'ne'; if (c === P) return 'me'; if (thHostile(S, P, c)) return 'en'; if (thFr(S, P, c)) return 'al'; return 'ne'; }
function thVis(S, T, P) { // 0 看不见 · 1 可见（估计）· 2 己方/友军所在
  const TS = S.th.T[T], ST = thStatic(T), vis = new Uint8Array(ST.zones.length);
  for (const z of ST.zones) if (thFr(S, P, TS.zc[z.i])) vis[z.i] = 1;
  for (const u of TS.units) if (u.c === P || thFr(S, P, u.c)) { vis[u.z] = 2; for (const [o] of ST.adj[u.z]) if (!vis[o]) vis[o] = 1; }
  if (TS.base) for (const z of ST.zones) { const i = z.i; if ((P === 'CCP' && TS.base[i] >= 30) || (P === 'JPN' && TS.jc[i] >= 50) || (P === 'CHN' && TS.kg[i] >= 30)) vis[i] = Math.max(vis[i], 1); }
  return vis;
}
/* 玩家相关的战区：有部队、有战线，或是战区所在地区的国家 */
function thTheatersOf(S, P) {
  if (!S.th) return [];
  return thTheaters(S).filter(T => { const TS = S.th.T[T], ST = thStatic(T); return TS.units.some(u => u.c === P) || S.fronts.some(f => f.th === T && (f.att === P || boss(S, f.target) === P)) || ST.regs.includes(P) || ST.zones.some(z => TS.zc[z.i] === P); });
}
function thView(S, T, P) {
  if (!S.th || !S.th.T[T]) return null;
  const TS = S.th.T[T], ST = thStatic(T), D = TH_DATA[T], vis = thVis(S, T, P), ph = S.th.phase || 0, E = thEconZ(T);
  let sig = null; try { const sp = thSupply(S, T, TS, ST, P); sig = sp[P] ? Array.from(sp[P].sig, v => +v.toFixed(2)) : null; } catch (e) { sig = null; }
  const zones = ST.zones.map(z => {
    const i = z.i, c = TS.zc[i], o = { i, id: z.id, zh: z.zh, en: z.en, r: z.r, t: z.t, x: z.x, y: z.y, vp: z.vp, cap: z.cap || z.cap2, port: z.port, dep: z.dep, hub: z.hub, base: z.base, imp: z.imp, towns: z.towns, c, side: thSideOf(S, P, c), fort: +thFortAt(TS, i).toFixed(2), vis: vis[i], sup: sig ? sig[i] : null };
    if (E && E.z[i] && E.tot[z.r]) { o.ep = E.z[i][0]; o.ei = +(E.z[i][1] / E.tot[z.r][1]).toFixed(3); } // 经济权重：人口（百万）与占本国工业的份额
    if (TS.base) { o.jc = Math.round(TS.jc[i]); o.cb = Math.round(TS.base[i]); o.kg = Math.round(TS.kg[i]); o.sab = +TS.sab[i].toFixed(2); o.bh = +TS.bh[i].toFixed(2); o.pop = +TS.pop[i].toFixed(1); }
    return o;
  });
  const units = [];
  for (const u of TS.units) {
    const own = u.c === P, fr = own || thFr(S, P, u.c);
    if (fr) { units.push({ id: u.id, c: u.c, z: u.z, t: u.t, n: u.n, ar: u.ar || '', s: +u.s.toFixed(3), o: +u.o.toFixed(2), sp: +u.sp.toFixed(2), en: +u.en.toFixed(2), x: +u.x.toFixed(2), q: u.q, sz: u.sz || 1, w: +uw(u).toFixed(2), str: +ustr(u).toFixed(2), ord: u.ord, nx: u.nx || null, hd: !!u.hd, lk: !!u.lk, enc: u.enc || 0, own, gue: !!TT[u.t].gue, fix: !!TT[u.t].fix, aux: thAux(u) }); continue; }
    if (!vis[u.z]) continue;
    const h = thHash(S.seed, S.turn, ph, u.id, P.charCodeAt(0) + P.charCodeAt(1) * 31), est = ustr(u) * (0.8 + 0.4 * h);
    const known = vis[u.z] >= 1 && (ST.adj[u.z].some(([o]) => vis[o] === 2) || vis[u.z] === 2);
    units.push({ id: u.id, c: u.c, z: u.z, t: known ? u.t : '?', n: known ? u.n : null, est: [+(est * 0.8).toFixed(2), +(est * 1.2).toFixed(2)], foe: thHostile(S, P, u.c), gue: !!TT[u.t].gue, aux: thAux(u) });
  }
  const fronts = S.fronts.filter(f => f.th === T && (f.att === P || boss(S, f.target) === P || thFr(S, P, f.att) || thFr(S, P, boss(S, f.target)))).map(f => ({ id: f.id, att: f.att, target: f.target, progress: Math.round(f.progress || 0), ratio: f.ratio ? +f.ratio.toFixed(2) : null, taken: (f.taken || []).length, kind: f.kind || 'land', land: f.thLand ?? null, noSea: f.thNoSea === S.turn || (f.kind === 'amph' && f.thLand == null && !thSeaLink(S, T, f.att)) ? 1 : 0, ...((f.att === P || (f.co || []).some(k => k.id === P)) ? { focusZ: f.focus != null ? thCityZones(T, f.target, f.focus) : [], sup: f.sup === S.turn ? 1 : 0 } : {}) })); // 主攻方向与空中支援只给己方的战线（不泄露敌方的主攻方向）
  const d0 = thDate(S, Math.max(0, ph - 1) * TH_DAYS), d1 = thDate(S, Math.max(1, ph) * TH_DAYS - 1);
  const link = { focus: [...thFocusZ(S, T, P)], hold: [...thHoldZ(S, T, P)], air: +thAirBoost(S, T, P).toFixed(3), bomb: +thBombK(S, P).toFixed(2) }; // 国家战略落到战区的设定（主攻方向、死守、空中支援、战略轰炸）
  const out = { T, name: D.name, ph, phases: TH_PHASES, days: TH_DAYS, d0, d1, zones, units, fronts, link, res: thResView(S, T, P, vis), air: TS.air[P] || thAirOrd(TS, P), staff: !!TS.staff[P], ev: (TS.qev || []).slice(-120), log: (TS.log || []).slice(-80), frames: TS.fr || [], cl: TS.cl || [], skip: !!(S.th.skip && S.th.skip[P] === S.turn) };
  if (TS.cn) {
    const cn = TS.cn, uf = S.th.uf || {}, yr = S.year, hist = (D.hist && D.hist.ccp) || {};
    out.cn = { P: cn.P, pol: Object.assign({}, cn.pol), jp: Object.assign({}, cn.jp), camp: cn.camp, campDone: cn.campDone ?? null, stat: (cn.stat || []).slice(-16), rec: cn.rec || 0,
      uf: { fr: Math.round(uf.fr || 0), sub: uf.sub, block: uf.block, north: uf.north, civil: uf.civil || null, ev: Object.assign({}, uf.ev), log: (uf.log || []).slice(-12) },
      hist: hist[yr] || null, ccpStr: TS.units.filter(u => u.c === 'CCP').reduce((s, u) => s + ustr(u), 0) * (TS.slice.CCP || 6), slice: TS.slice };
  }
  return out;
}
/* 各作战阶段的战果（只读）：己方与友军是实数，敌军的兵力与伤亡是带噪声的情报估计（e = 1）；伤亡构成只给自己。
 * 战斗只列出己方或友军参加的、或发生在当前可见区格的。伤亡换算成千人（师当量 × 该国每个师当量的人数）。 */
function thResView(S, T, P, vis) {
  const TS = S.th.T[T]; if (!TS.phr || !TS.phr.some(Boolean)) return null;
  const q = TS.phq || [S.year, S.q], mine = c => !!c && (c === P || thFr(S, P, c)), sl = c => TS.slice[c] || thSliceDef(c);
  const H = (i, j, k) => 0.75 + 0.5 * thHash(S.seed, q[0] * 4 + q[1], i, j, k + P.charCodeAt(0) * 3 + P.charCodeAt(1) * 7);
  const dt = d => ({ y: q[0], m: (q[1] - 1) * 3 + Math.floor(d / 30) + 1, d: (d % 30) + 1 });
  const r1 = x => +(+x).toFixed(1), cc = C => C.charCodeAt(0) * 31 + C.charCodeAt(1) * 7 + C.charCodeAt(2);
  const list = TS.phr.map((r, i) => {
    if (!r) return null;
    const bt = r.bt.filter(b => mine(b[1]) || mine(b[2]) || (vis && vis[b[0]])).map(b => {
      const ea = !mine(b[1]), ed = !mine(b[2]), j = b[0] * 7 + cc(b[1]); // 估计误差按战斗本身（区格、进攻国）确定，可见范围变化时不跳动
      return { z: b[0], a: b[1], d: b[2], t0: b[3], t1: b[4], n: b[5], as: r1(b[6] * (ea ? H(i, j, 1) : 1)), ds: r1(b[7] * (ed ? H(i, j, 2) : 1)), r: b[8],
        la: r1(b[9] * sl(b[1]) * (ea ? H(i, j, 3) : 1)), ld: r1(b[10] * sl(b[2]) * (ed ? H(i, j, 4) : 1)), res: b[11], riv: b[12] ? 1 : 0, from: b[13] || [], air: b[14] || 0, ea: ea ? 1 : 0, ed: ed ? 1 : 0 };
    });
    const loss = {}; for (const [C, v] of Object.entries(r.loss || {})) { const e = !mine(C); loss[C] = { men: r1(v[0] * (e ? H(i, 90, cc(C)) : 1)), pow: r1(v[1] * (e ? H(i, 91, cc(C)) : 1)), e: e ? 1 : 0 }; }
    const str = {}; for (const [C, v] of Object.entries(r.str || {})) { const e = !mine(C); if (e && !thHostile(S, P, C)) continue; str[C] = { v: r1(v * (e ? H(0, 92, cc(C)) : 1)), e: e ? 1 : 0 }; } // 敌军总兵力的估计误差整个季度不变
    const oos = {}; for (const [C, n] of Object.entries(r.oos || {})) if (mine(C)) oos[C] = n;
    const lc = {}; for (const [k, w] of Object.entries((r.lc || {})[P] || {})) lc[k] = r1(w * sl(P));
    return { ph: r.ph, a: dt(r.d0), b: dt(r.d0 + TH_DAYS - 1), bt, cap: (r.cap || []).map(c => ({ z: c[0], c: c[1], o: c[2], d: c[3], brk: c[4] ? 1 : 0, lib: c[5] ? 1 : 0 })),
      loss, lc, str, oos, enc: Object.assign({}, r.enc), ev: r.ev || {}, fr: (r.fr || []).filter(f => mine(f[1]) || f[2] === P || mine(f[2])).map(f => ({ id: f[0], att: f[1], target: f[2], p: f[3] })) };
  });
  return { q, fp0: Object.assign({}, TS.fp0 || {}), list };
}
/* 选中的部队可以下哪些命令 */
function thOrderKinds(S, T, P, ids) {
  if (!S.th || !S.th.T[T]) return [];
  const TS = S.th.T[T], list = TS.units.filter(u => u.c === P && ids.includes(u.id) && !TT[u.t].fix); if (!list.length) return [];
  const g = list.some(u => TT[u.t].gue), r = list.some(u => !TT[u.t].gue), china = !!TS.base, ST = thStatic(T);
  const k = ['hold', 'move', 'attack'];
  if (r) k.push('push', 'rail', 'reserve', 'dig');
  if (r && (TH_DATA[T].evac || []).includes(P)) k.push('evac');
  if (g && china) k.push('guer', 'raid');
  if (r && china) k.push('sweep');
  if (list.some(u => ST.edges.some(e => e.river && (e.a === u.z || e.b === u.z)))) k.push('blow');
  return k;
}
/* 预览：选中的部队按某种命令去某区格的路径（不下令） */
function thPreview(S, T, P, id, k, to) {
  if (!S.th || !S.th.T[T]) return null;
  const TS = S.th.T[T], ST = thStatic(T), u = TS.units.find(v => v.id === +id && v.c === P); if (!u) return null;
  const tz = typeof to === 'string' ? ST.idx[to] : +to; if (tz == null || isNaN(tz)) return null;
  if (k === 'attack') return thEdge(ST, u.z, tz) ? [tz] : null;
  const mode = k === 'push' ? 'push' : k === 'rail' ? 'rail' : TT[u.t].gue ? 'inf' : 'move';
  return thPath(S, T, P, u.z, tz, mode);
}
/* 史料：战区的参考书目 + 历史作战的说明 */
function thSources(T) {
  const D = TH_DATA[T]; if (!D) return { list: [], ops: [] };
  const ops = []; for (const [C, list] of Object.entries(D.ops || {})) for (const o of list) if (o.src) ops.push({ c: C, id: o.id, y: o.y, q: o.q, src: o.src });
  for (const [C, list] of Object.entries(D.plans || {})) for (const p of list) if (p.src && !ops.some(o => o.id === p.id)) ops.push({ c: C, id: p.id, src: p.src });
  return { list: D.src || [], ops };
}
