// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 精细战区 · 参谋作业（进攻方案、作战跟踪、战区段） =====================
 * 一、进攻方案 thPlanOps：玩家选中部队、点一个远处的目标（例如巴黎）时，参谋按不同轴线各规划一条分段路线——
 *     稳妥（避开强点）、最快（路程最短）、迂回（另一条轴线），以及剧本里的史实轴线（如曼施坦因计划经阿登—色当）。
 *     每一段估计战力比、渡河、要塞、地形、补给与天数，并给出侧翼、补给与情报方面的风险和兵力建议。
 *     敌情只用玩家看得见的情报（与界面上的“≈”估计一致）；看不见的纵深区格按经验值估计并注明“情报不足”。
 *     走不通时说明原因：中立国挡路、隔海（需要战略层的两栖作战）、部队被包围。只读，不改变局面，也不掷骰子。
 * 二、作战跟踪 thOpStart / thOpTick / thOpsView：选定方案后给部队下“突进”命令（经由方案路线），记下这次作战；
 *     每个作战阶段末记录推进到哪一格，界面据此报告进展、受阻的地点与原因，以及参谋的建议。
 * 三、战区段 thSecs：粗一级指挥用的分区（剧本数据 sec），每个战区段由若干区格组成。
 * 这些函数只在精细战区开启（S.th）时被界面或命令调用；单人版不会运行。
 */
const TH_OP_PRIOR = 1.1; // 看不见的敌占区格：守备按约 1 个步兵师的防御值估计
const thOpNat = (S, C) => { // 与 thNat 相同，但不写缓存（界面调用时不改动局面）
  const x = S.actors[C]; if (!x) return 1; const c = S._thNat, k = C + S.turn; if (c && c[k]) return c[k];
  const t0 = (S.th && S.th.t0 && S.th.t0[C]) || null; let f = stabF(x) / 0.88 * fuelF(x);
  if (t0) f *= clamp(techF(x) / t0[0], 0.8, 1.35) * clamp(Math.sqrt((x.land / Math.max(1, x.pers)) / t0[1]), 0.7, 1.4);
  return clamp(f, 0.45, 1.6);
};
function thOpWxMv(S, T) { // 本阶段的季节对机动的影响（与 thWx 同一张表，但不掷“坏天气”骰子）
  const m = thDate(S, Math.max(0, (S.th.phase || 0)) * TH_DAYS).m;
  if (T === 'W') return m === 12 || m <= 2 ? 0.72 : m === 3 ? 0.85 : m >= 10 && m <= 11 ? 0.8 : 1;
  return m === 12 || m <= 2 ? 0.8 : m >= 6 && m <= 8 ? 0.78 : m === 5 || m === 9 ? 0.9 : 1;
}
/* 选中部队的合计：进攻值（与 thBattle 同一口径，不含地形与渡河）、兵力、机动与步兵的速度 */
function thOpForce(S, T, TS, P, ids) {
  const us = TS.units.filter(u => u.c === P && ids.includes(u.id) && !TT[u.t].fix && u.s > 0.05);
  let A = 0, Aarm = 0, w = 0, mob = 0, inf = 0, gue = 0, vm = 99, vi = 99, arm = 0, sp = 0, wm = 0, wi = 0;
  for (const u of us) {
    const t = TT[u.t], d = docOf(u.c), st = ustr(u); w += st; sp += u.sp * st;
    if (t.gue) { gue++; continue; }
    const a = t.a * st * (0.25 + 0.75 * u.o) * u.q * d.a * thOpNat(S, u.c) * (0.4 + 0.6 * u.sp) * (0.8 + 0.4 * u.x);
    A += a; Aarm += a * t.arm; if (t.arm >= 0.5) arm += st;
    const v = t.v * d.v; if (t.v >= 40) { mob++; vm = Math.min(vm, v); wm += st; } else { inf++; vi = Math.min(vi, v); wi += st; }
  }
  return { us, A, Aarm, w, mob, inf, gue, arm, sp: w ? sp / w : 1, v: mob && (!inf || wm >= wi) ? vm : inf ? vi : 26, vInf: inf ? vi : null }; // 步兵占多数时，整个作战按步兵的速度
}
/* 玩家对区格 z 内敌军的估计：与界面上的“≈”兵力估计用同一个随机数（同一回合、同一阶段不变） */
function thOpEstD(S, T, TS, ST, P, z, vis, ph, prior) {
  const zt = ST.zones[z], ter = terOf(zt.t), fort = thFortAt(TS, z);
  const hostile = thHostile(S, P, TS.zc[z]);
  if (!vis[z]) return hostile ? { d: (prior || TH_OP_PRIOR) * ter.def * (1 + 0.4 * fort), w: null, a: 0, unk: 1 } : { d: 0, w: 0, a: 0, unk: 0 };
  const known = vis[z] === 2 || ST.adj[z].some(([o]) => vis[o] === 2);
  let d = 0, w = 0, a = 0;
  for (const v of TS.units) {
    if (v.z !== z || !thHostile(S, P, v.c) || TT[v.t].gue) continue; // 游击队不死守阵地
    const h = thHash(S.seed, S.turn, ph, v.id, P.charCodeAt(0) + P.charCodeAt(1) * 31), est = ustr(v) * (0.8 + 0.4 * h);
    const t = known ? TT[v.t] : TT.inf;
    d += t.d * est * docOf(v.c).d * 0.9 * (1 + (t.fix ? 0.6 : 0.4) * fort) * 1.15; w += est; a += t.a * est;
  }
  return { d: d * ter.def, w, a, unk: 0 };
}
/* 看不见的敌占区格的守备先验：看得见的有敌军的敌占区格（去掉地形与工事）守备中位数的六成，限制在 0.6–3.5 */
function thOpPrior(S, T, TS, ST, P, vis, ph) {
  const ds = []; for (const z of ST.zones) { if (!vis[z.i] || !thHostile(S, P, TS.zc[z.i])) continue; const e = thOpEstD(S, T, TS, ST, P, z.i, vis, ph); if (e.d > 0.05) ds.push(e.d / terOf(z.t).def / (1 + 0.4 * thFortAt(TS, z.i))); }
  if (!ds.length) return TH_OP_PRIOR; ds.sort((a, b) => a - b); return clamp(ds[Math.floor(ds.length / 2)] * 0.6, 0.6, 3.5);
}
/* 区格对 P 的通行性：0 不可通行（无主、不可进入）· 1 己方或友方 · 2 敌方（或有敌军）· 3 中立国 */
function thOpPass(S, TS, ST, P, b) {
  const z = ST.zones[b]; if (z.imp) return 0; const c = TS.zc[b]; if (!c) return 0;
  if (thHostile(S, P, c)) return 2; if (thFr(S, P, c)) return thEnemyIn(S, TS, b, P) ? 2 : 1; return 3;
}
/* 按某种风格的代价求路线（Dijkstra）。代价以“天”为单位：行军天数 + 战斗天数 + 风格惩罚。
 * opt.neutral：允许穿过中立国（只用来解释走不通的原因）；opt.seaAny：允许从海上直接驶入敌占区（同上）；opt.pen：区格惩罚（迂回方案用） */
function thOpRoute(S, T, TS, ST, P, F, from, to, style, ctx, opt) {
  opt = opt || {}; const nz = ST.zones.length, dist = new Float64Array(nz).fill(1e18), prev = new Int16Array(nz).fill(-1), done = new Uint8Array(nz);
  dist[from] = 0;
  for (let it = 0; it < nz; it++) {
    let a = -1, bd = 1e18; for (let i = 0; i < nz; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; a = i; }
    if (a < 0 || a === to) break; done[a] = 1;
    for (const [b, k] of ST.adj[a]) {
      if (done[b]) continue; const e = ST.edges[k], pass = thOpPass(S, TS, ST, P, b);
      if (!pass || (pass === 3 && !opt.neutral)) continue;
      if (e.kind === 'sea' && (!ctx.sea || (pass !== 1 && !opt.seaAny))) continue; // 海运只驶入己方控制、没有敌军的港口区格
      const c = thOpStep(S, T, TS, ST, P, F, a, b, e, pass, style, ctx) + ((opt.pen && opt.pen[b]) || 0);
      if (dist[a] + c < dist[b]) { dist[b] = dist[a] + c; prev[b] = a; }
    }
  }
  if (prev[to] < 0) return null;
  const p = [to]; for (let z = prev[to]; z >= 0; z = prev[z]) p.unshift(z);
  return p[0] === from ? Object.assign(p, { c: dist[to] }) : null; // c：路线的总代价（天）
}
function thOpStep(S, T, TS, ST, P, F, a, b, e, pass, style, ctx) {
  const zt = ST.zones[b], ter = terOf(zt.t);
  if (e.kind === 'sea') return 2.5;
  const vk = Math.max(4, F.v * ter.mv * ctx.wxmv * 0.8); // 突进与调动命令走公路（铁路机动是另一种命令）
  let c = e.km / vk;
  if (pass === 2 || pass === 3) {
    const est = ctx.est(b), rv = thOpRiver(TS, e, P, b, ctx.vis);
    if (est.d > 0.05) { const r = thOpOdds(F, zt, est.d, rv); c += clamp(1.5 + 4.5 / r, 1, 20) + (style === 'safe' ? 10 * Math.pow(1 / r, 1.6) : style === 'fast' ? 1.2 / r : 4 / r); }
    else c += 0.3;
    if (est.unk) c += style === 'safe' ? 2.5 : 1;
  }
  return c;
}
const thOpBr = (TS, e, vis) => !!(e && e.river && (TS.dmg[e.k] || 0) > 0 && (!vis || vis[e.a] || vis[e.b])); // 桥梁被毁：只有看得见的地方才知道
const thOpRiver = (TS, e, P, tz, vis) => { let rv = 1; if (e && e.river) { rv = e.river > 1 ? 0.55 : 0.75; if (thOpBr(TS, e, vis)) rv *= 0.75; if (TS._bh && TS._bh[tz] === P) rv = Math.sqrt(rv); } if (e && e.kind === 'dike') rv = 0.3; return rv; }; // 与 thBattle 相同：桥头堡看目标区格
/* 估计战力比：进攻值按目标地形修正装甲效能、受正面宽度限制，渡河打折 */
function thOpOdds(F, zt, d, rv) {
  const ter = terOf(zt.t), front = ter.front * 1.4;
  let A = F.A + F.Aarm * (ter.arm - 1); // 装甲在平原更强，在山地、森林、城市里打折
  if (F.w > front) A *= (front + (F.w - front) * 0.15) / F.w; // 超出正面宽度的兵力展不开
  if (F.arm > 0 && F.arm < F.w) A *= 1.08; // 步坦协同
  return clamp(A * rv / Math.max(0.05, d), 0.05, 20);
}
/* 把这一格的战力比提到 1.4 还要加多少师当量（按本部队的平均进攻力，受正面宽度限制）；正面太窄、加兵无济于事时返回 -1 */
function thOpNeed(F, zt, d, rv) {
  if (!F.w || !F.A) return -1; const a1 = F.A / F.w, ar1 = F.Aarm / F.w;
  for (let x = 0.5; x <= 60; x += 0.5) { const G = { A: F.A + a1 * x, Aarm: F.Aarm + ar1 * x, w: F.w + x, arm: F.arm * (F.w + x) / F.w }; if (thOpOdds(G, zt, d, rv) >= 1.4) return x; }
  return -1;
}
/* 补给估计：从出发线（最后一个己方区格）往敌境每深入一格，按公路距离折减（与补给模型同一曲线） */
const thOpSupK = c => (c <= 100 ? 1 : 1 / (1 + (c - 100) / 260));
/* 逐格评估一条路线：每一格的敌情、战力比、渡河、要塞、补给与到达天数；分成接敌、突破、纵深、目标四段；汇总风险 */
function thOpEval(S, T, TS, ST, P, F, path, ctx) {
  const steps = []; let day = 0, A = 1, roadC = 0, s0 = null, inEnemy = false, hard = null;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], e = thEdge(ST, a, b), pass = thOpPass(S, TS, ST, P, b), zt = ST.zones[b], ter = terOf(zt.t);
    const st = { z: b, h: pass === 2 || pass === 3 ? 1 : 0, ne: pass === 3 ? 1 : 0, t: zt.t, fort: +thFortAt(TS, b).toFixed(1), riv: e && e.river ? e.river : 0, rn: e && e.river ? e.rname || '' : '', br: thOpBr(TS, e, ctx.vis) ? 1 : 0, sea: e && e.kind === 'sea' ? 1 : 0 };
    if (!st.h) { if (ctx.sig) s0 = ctx.sig[b]; }
    const vk = Math.max(4, F.v * ter.mv * ctx.wxmv * 0.8);
    day += st.sea ? 2.5 : (e ? e.km : 60) / vk;
    if (st.h) {
      if (!inEnemy) { inEnemy = true; roadC = 0; if (s0 == null && ctx.sig) s0 = ctx.sig[a]; }
      roadC += (e ? e.km : 60) / ter.mv;
      const est = ctx.est(b), rv = thOpRiver(TS, e, P, b, ctx.vis); st.e = est.w == null ? null : +est.w.toFixed(1); st.unk = est.unk;
      st.d = +est.d.toFixed(2);
      if (est.d > 0.05 && !ctx.inf) { const F2 = Object.assign({}, F, { A: F.A * A, Aarm: F.Aarm * A, w: F.w * A }); st.r = +thOpOdds(F2, zt, est.d, rv).toFixed(2); if (!hard || st.r < hard.r) hard = { r: st.r, F2, zt, d: est.d, rv }; day += clamp(1.5 + 4.5 / st.r, 1, 20); A *= st.r >= 2 ? 0.95 : 0.9; }
      else { st.r = null; day += 0.3; }
      st.sup = +((s0 == null ? 1 : s0) * thOpSupK(roadC)).toFixed(2);
    } else st.sup = ctx.sig ? +ctx.sig[b].toFixed(2) : null;
    st.day = Math.round(day);
    steps.push(st);
  }
  // 分段：接敌（己方区格）· 突破（第一个敌占区格；紧接着的要塞或渡河区格也算）· 纵深 · 目标
  const legs = [], hi = steps.findIndex(s => s.h);
  const leg = (k, a, b) => { const ss = steps.slice(a, b); if (!ss.length) return; const rs = ss.map(s => s.r).filter(r => r != null); legs.push({ k, zs: ss.map(s => s.z), d0: a ? steps[a - 1].day : 0, d1: ss[ss.length - 1].day, r: rs.length ? Math.min(...rs) : null, riv: ss.filter(s => s.h && s.riv).map(s => s.rn).filter(Boolean), fort: ss.some(s => s.h && s.fort >= 1.5) ? 1 : 0, unk: ss.some(s => s.unk) ? 1 : 0 }); };
  const L = steps.length - 1;
  if (hi < 0 || ctx.inf) leg(ctx.inf ? 'inf' : 'move', 0, steps.length);
  else {
    leg('move', 0, hi);
    if (hi === L) leg('obj', L, L + 1); // 目标就是第一个敌占区格：突破即攻占
    else {
      let bEnd = hi + 1; while (bEnd < L && bEnd - hi < 2 && steps[bEnd].h && (steps[bEnd].fort >= 1.5 || steps[bEnd].riv)) bEnd++; // 紧接着的要塞或渡河区格也算突破
      leg('break', hi, bEnd); leg('deep', bEnd, L); leg('obj', L, L + 1);
    }
  }
  // 风险
  const hs = steps.filter(s => s.h), rs = hs.map(s => s.r).filter(r => r != null), minR = rs.length ? Math.min(...rs) : null;
  const onP = new Set(path); let flank = null;
  for (const s of hs.slice(0, -1)) for (const [o] of ST.adj[s.z]) { if (onP.has(o) || !ctx.vis[o]) continue; const est = ctx.est(o); if (est.a > 0.5 && (!flank || est.a > flank.a)) flank = { z: o, w: +est.w.toFixed(1), a: est.a, at: s.z }; }
  if (flank && flank.w < F.w * 0.35) flank = null;
  const lowSup = hs.find(s => s.sup != null && s.sup < 0.4) || null;
  const risks = [];
  if (minR != null && minR < 1) risks.push('odds'); if (lowSup) risks.push('sup'); if (flank) risks.push('flank');
  if (hs.some(s => s.fort >= 1.5)) risks.push('fort'); if (hs.some(s => s.riv)) risks.push('riv'); if (hs.some(s => s.unk)) risks.push('unk');
  if (steps.length && steps[steps.length - 1].day > 60) risks.push('long');
  if (ctx.inf) return { p: path, steps, legs, minR: null, risks: risks.filter(r => r === 'long' || r === 'riv'), rating: 'fair', brk: null, via: null, flank: null, lowSup: null, need: 0, days: steps.length ? steps[steps.length - 1].day : 0, cas: null };
  const unk = hs.some(s => s.unk);
  const rating = minR == null ? (lowSup || unk ? 'fair' : 'good') : minR >= 1.4 && !lowSup && !flank && !(unk && minR < 2) ? 'good' : minR >= 0.9 ? 'fair' : 'poor';
  const brk = hi >= 0 ? steps[hi].z : null;
  let via = null, bv = -1; for (const s of hs.slice(1, -1)) { const v = (ST.zones[s.z].vp || 0) + (s.riv ? 1.5 : 0) + (s.fort >= 1.5 ? 1 : 0); if (v > bv) { bv = v; via = s.z; } }
  const need = minR != null && minR < 1.4 && hard ? thOpNeed(hard.F2, hard.zt, hard.d, hard.rv) : 0; // -1：正面太窄，加兵无济于事
  const days = steps.length ? steps[steps.length - 1].day : 0;
  return { p: path, steps, legs, minR, risks, rating, brk, via, flank: flank ? { z: flank.z, w: flank.w, at: flank.at } : null, lowSup: lowSup ? lowSup.z : null, need, days, cas: brk };
}
/* 进攻方案：选中的部队打一个（可能很远的）目标 */
function thPlanOps(S, T, P, ids, to, opt) {
  if (!S.th || !S.th.T[T]) return null; const TS = S.th.T[T], ST = thStatic(T);
  to = typeof to === 'string' ? ST.idx[to] : +to; if (!(to >= 0 && to < ST.zones.length)) return null;
  const vias = thOpVias(ST, opt && opt.via, to); // 经由：每一项是一个区格或一组区格（地区，如“阿登”）
  ids = (Array.isArray(ids) ? ids : [ids]).map(Number);
  const F = thOpForce(S, T, TS, P, ids); if (!F.us.length) return { ok: 0, to, why: { k: 'nounits' }, plans: [] };
  const ph = S.th.phase || 0, vis = thVis(S, T, P), wxmv = thOpWxMv(S, T);
  let sig = null; try { const sp = thSupply(S, T, TS, ST, P); sig = sp[P] ? sp[P].sig : null; } catch (e) { sig = null; }
  const prior = thOpPrior(S, T, TS, ST, P, vis, ph), cache = {}, est = z => cache[z] || (cache[z] = thOpEstD(S, T, TS, ST, P, z, vis, ph, prior));
  const ctx = { vis, wxmv, sig, est, sea: thSeaLink(S, T, P), prior };
  const wz = {}; for (const u of F.us) wz[u.z] = (wz[u.z] || 0) + ustr(u) + 1e-6 * u.id;
  const zsW = Object.keys(wz).map(Number).sort((a, b) => wz[b] - wz[a]);
  let o = zsW[0];
  const force = { n: F.us.length, w: +F.w.toFixed(1), mob: F.mob, inf: F.inf, gue: F.gue, sp: +F.sp.toFixed(2), o };
  if (o === to) return { ok: 0, to, o, force, why: { k: 'here' }, plans: [] };
  const vz = vias.length ? vias.map(A => A.slice()) : null;
  const hostileT = thOpPass(S, TS, ST, P, to) === 2;
  // 只有游击部队：渗透前往，不攻坚
  if (!F.mob && !F.inf) { const p = thPath(S, T, P, o, to, 'inf'); if (!p) return { ok: 0, to, o, force, why: { k: 'none' }, plans: [] }; const ev = thOpEval(S, T, TS, ST, P, F, [o].concat(p), Object.assign({}, ctx, { inf: 1 })); return { ok: 1, to, o, force, plans: [Object.assign(ev, { st: 'inf', k: 'inf', rec: 1 })] }; }
  // 目标在己方或友方手里：调动而不是进攻
  const routeVia = (style, ropt, from) => { // 依次经过每个经由点；地区取总代价最小的那个区格
    const o0 = from ?? o; let cur = o0, path = [o0]; const wp = [];
    for (const A of vias) {
      let best = null;
      for (const z of A) {
        if (z === cur) { best = { p: [cur], c: 0, z }; break; }
        const p1 = thOpRoute(S, T, TS, ST, P, F, cur, z, style, ctx, ropt); if (!p1) continue;
        const p2 = z === to ? { c: 0 } : thOpRoute(S, T, TS, ST, P, F, z, to, style, ctx, ropt); if (!p2) continue;
        if (!best || p1.c + p2.c < best.c) best = { p: p1, c: p1.c + p2.c, z };
      }
      if (!best) return null;
      path = path.concat(best.p.slice(1)); cur = best.z; wp.push(best.z);
    }
    if (cur !== to) { const p3 = thOpRoute(S, T, TS, ST, P, F, cur, to, style, ctx, ropt); if (!p3) return null; path = path.concat(p3.slice(1)); }
    return new Set(path).size === path.length ? Object.assign(path, { wp }) : null; // 走回头路的不要
  };
  // 指定了经由、而主力已经越过那里（例如装甲部队已在色当以西）：改从还没越过的那一群部队出发
  if (vias.length && !routeVia('fast')) for (const z of zsW.slice(1, 4)) if (z !== to && routeVia('fast', undefined, z)) { o = z; break; }
  force.o = o;
  const route = (style, ropt) => (vias.length ? routeVia(style, ropt) : thOpRoute(S, T, TS, ST, P, F, o, to, style, ctx, ropt));
  const folMax = thOpFolPick(S, T, TS, ST, P, F.us, 99).length;
  const folOf = p => Math.min(folMax, thOpFolN(F, p, thOpFlankNeed(S, T, TS, ST, P, p, ctx)));
  if (!hostileT) { const p = route('fast'); if (!p) return { ok: 0, to, o, force, via: vz, why: vias.length ? { k: 'via' } : thOpWhy(S, T, TS, ST, P, F, o, to, ctx), plans: [] }; return { ok: 1, to, o, force, via: vz, plans: [Object.assign(thOpEval(S, T, TS, ST, P, F, p, ctx), { st: 'move', k: p.some(z => thOpPass(S, TS, ST, P, z) >= 2) ? 'push' : 'move', rec: 1, wp: p.wp || [], fol: 0 })] }; }
  const cands = [];
  const hzOf = p => p.filter(z => thOpPass(S, TS, ST, P, z) >= 2);
  const add = (p, st, extra) => { // 敌占区格重合七成五以上的路线算同一条（史实轴线与之重合时，把史实名称记到那条上）
    if (!p) return; const hz = hzOf(p);
    if (vias.length && boss(S, ST.zones[to].r) !== P) { // 经过经由点、出了国境之后又折回本国：不是本意（经由点本身在国内的，从出境那一格算起）
      const i0 = p.findIndex(z => vias[0].includes(z)), home = z => boss(S, ST.zones[z].r) === P;
      if (i0 >= 0) { const rest = p.slice(i0 + 1), j = rest.findIndex(z => !home(z)); if (j >= 0 && rest.slice(j + 1).some(home)) return; }
    }
    for (const c of cands) { const hz2 = hzOf(c.p), inter = hz.filter(z => hz2.includes(z)).length, uni = new Set(hz.concat(hz2)).size; if (!uni || inter / uni >= 0.75) { if (extra && extra.hist && !c.hist) c.hist = extra.hist; return; } }
    cands.push(Object.assign(thOpEval(S, T, TS, ST, P, F, p, ctx), { st, wp: p.wp || [], fol: folOf(p) }, extra || {}));
  };
  add(route('safe'), 'safe'); add(route('fast'), 'fast');
  // 史实轴线：剧本里这个国家的作战计划（例如曼施坦因计划经阿登—色当）。沿轴线前进，再从轴线上离目标最近的一点转向目标；
  // 轴线经过中立国或断开时不用（例如静坐战争期间比利时、卢森堡中立）
  const D = TH_DATA[T], hist = [], km = thOpKm(ST, to);
  for (const pl of (D.plans && D.plans[P]) || []) for (const g of pl.groups || []) if (g.axis && (g.role === 'main' || g.role === 'flank')) for (const ax of [g.axis].concat(g.alt || [])) {
    const zs = ax.map(id => ST.idx[id]).filter(i => i != null); if (zs.length < 2 || zs.some((z, i) => i && !thEdge(ST, zs[i - 1], z)) || zs.some(z => { const ps = thOpPass(S, TS, ST, P, z); return !ps || ps === 3; })) continue;
    if (!zs.some(z => thOpPass(S, TS, ST, P, z) === 2)) continue;
    // 转向点：至少沿轴线走到进入目标所在地区（国家）的第一格——轴线的突破口（例如曼施坦因计划的色当）；
    // 再往前，只要轴线的下一格还在去目标的路上（公路距离不绕远）就继续沿轴线走
    let k = zs.findIndex(z => ST.zones[z].r === ST.zones[to].r);
    if (k < 0) { let bd = 1e9; zs.forEach((z, i) => { if (km[z] < bd) { bd = km[z]; k = i; } }); }
    while (k + 1 < zs.length) { const e = thEdge(ST, zs[k], zs[k + 1]), c = (e ? e.km : 60) / terOf(ST.zones[zs[k + 1]].t).mv + km[zs[k + 1]]; if (c <= km[zs[k]] * 1.03 + 5) k++; else break; }
    const head = zs.indexOf(o) >= 0 ? [] : thOpRoute(S, T, TS, ST, P, F, o, zs[0], 'safe', ctx); if (head == null) continue;
    const mid = zs.indexOf(o) >= 0 ? zs.slice(zs.indexOf(o), k + 1) : zs.slice(0, k + 1); if (!mid.length) continue;
    const tail = mid[mid.length - 1] === to ? [to] : thOpRoute(S, T, TS, ST, P, F, mid[mid.length - 1], to, 'safe', ctx); if (!tail) continue;
    const p = (head.length ? head.slice(0, -1) : []).concat(mid, tail.slice(1)); if (new Set(p).size !== p.length || p[0] !== o) continue;
    if (vias.length && !vias.every(A => mid.some(z => A.includes(z)))) continue; // 指定了经由：只用轴线本身经过这些地方的史实计划（光是去轴线起点的路上擦过不算）
    hist.push({ p, n: [pl.zh, pl.en], w: (pl.w || 0) + (g.role === 'main' ? 1 : 0) });
  }
  hist.sort((a, b) => b.w - a.w);
  const histUsed = new Set();
  for (const h of hist) { if (histUsed.has(h.n[0])) continue; const before = cands.length, named = cands.some(c => c.hist && c.hist[0] === h.n[0]); if (named) { histUsed.add(h.n[0]); continue; } add(h.p, 'hist', { hist: h.n }); if (cands.length > before || cands.some(c => c.hist && c.hist[0] === h.n[0])) histUsed.add(h.n[0]); if (cands.length >= 3) break; }
  // 迂回：避开前面方案经过的敌占区格
  if (cands.length < 3) { const pen = {}; for (const c of cands) for (const z of c.p) if (thOpPass(S, TS, ST, P, z) >= 2 && z !== to && !(vias.length && vias.some(A => A.includes(z)))) pen[z] = (pen[z] || 0) + 25; add(route('safe', { pen }), 'alt'); }
  if (!cands.length) return { ok: 0, to, o, force, via: vz, why: vias.length ? { k: 'via' } : thOpWhy(S, T, TS, ST, P, F, o, to, ctx), plans: [] };
  const viaDeep = c => vias.reduce((s2, A) => s2 + (A.length > 1 ? Math.max(0, c.p.filter(z => A.includes(z)).length - 1) : 0), 0); // 经由一个地区（如“阿登”）：穿过得越深越符合本意，只擦个边的不算
  const sc = c => ({ good: 300, fair: 200, poor: 100 }[c.rating]) + 60 * Math.min(c.minR == null ? 2 : c.minR, 2) - 0.5 * c.days - 4 * c.risks.length + 25 * viaDeep(c);
  const dMin = Math.min(...cands.map(c => c.days)), keep = cands.filter((c, i) => i === 0 || c.days <= dMin * 1.7 + 10); // 绕得太远的方案不列出
  let best = keep[0]; for (const c of keep) if (sc(c) > sc(best)) best = c; best.rec = 1;
  for (const c of keep) c.k = 'push';
  // 其余部队没有任务（又没开参谋代管）：敌军可以腾出兵力专打这次作战的侧翼
  const ids0 = new Set(F.us.map(u => u.id)), idle = TS.staff[P] ? [] : TS.units.filter(u => u.c === P && !ids0.has(u.id) && !TT[u.t].fix && !TT[u.t].gue && !u.nx && ['hold', 'dig', 'reserve'].includes(u.ord.k) && !(u.ord.p && u.ord.p.length) && !thOpLive(S, T, u));
  const idleW = idle.reduce((s2, u) => s2 + ustr(u), 0);
  if (idle.length >= 15 && idleW >= 2 * F.w) for (const c of keep) c.risks.push('idle');
  return { ok: 1, to, o, force, via: vz, folMax, idle: idle.length, plans: keep.slice(0, 3), adj: !!thEdge(ST, o, to) };
}
/* 路线拿下之后要守住多少：路上每个敌占区格至少一个师，紧邻路线、看得见的敌军按其进攻力的六成（师当量） */
function thOpFlankNeed(S, T, TS, ST, P, p, ctx) {
  const onP = new Set(p), seen = new Set(); let a = 0, n = 0;
  for (const z of p.slice(1, -1)) { if (thOpPass(S, TS, ST, P, z) < 2) continue; n++; for (const [o, k] of ST.adj[z]) { if (onP.has(o) || seen.has(o) || ST.edges[k].kind === 'sea' || !ctx.vis[o]) continue; seen.add(o); a += ctx.est(o).a; } }
  return n * 0.7 + a * 0.6 / 1.3;
}
/* 经由点：区格编号、区格代号，或一组区格（地区）；最多两个，不能是出发点或目标本身 */
function thOpVias(ST, via, to) {
  if (via == null) return [];
  const one = v => (Array.isArray(v) ? v : [v]).map(z => (typeof z === 'string' ? ST.idx[z] : +z)).filter(z => Number.isInteger(z) && z >= 0 && z < ST.zones.length && z !== to && !ST.zones[z].imp).slice(0, 12);
  const list = Array.isArray(via) && via.some(Array.isArray) ? via : [via];
  return list.slice(0, 2).map(one).filter(A => A.length);
}
/* 相邻进攻的估计：选中的部队从各自所在的区格直接打 z（取兵力最多的出发区格看渡河），不经参谋部方案 */
function thOpAttackEst(S, T, P, ids, to) {
  if (!S.th || !S.th.T[T]) return null; const TS = S.th.T[T], ST = thStatic(T); to = +to; if (!Number.isInteger(to) || !ST.zones[to]) return null;
  const F = thOpForce(S, T, TS, P, (Array.isArray(ids) ? ids : [ids]).map(Number).filter(id => { const u = TS.units.find(v => v.id === id); return u && thEdge(ST, u.z, to); })); if (!F.us.length) return null;
  const wz = {}; for (const u of F.us) wz[u.z] = (wz[u.z] || 0) + ustr(u) + 1e-6 * u.id; const o = +Object.keys(wz).sort((a, b) => wz[b] - wz[a])[0];
  const ph = S.th.phase || 0, vis = thVis(S, T, P), es = thOpEstD(S, T, TS, ST, P, to, vis, ph, thOpPrior(S, T, TS, ST, P, vis, ph)), e = thEdge(ST, o, to), rv = thOpRiver(TS, e, P, to, vis);
  return { r: es.d > 0.05 && F.A > 0 ? +thOpOdds(F, ST.zones[to], es.d, rv).toFixed(2) : null, riv: e && e.river ? e.river : 0, rn: e && e.river ? e.rname || '' : '', br: thOpBr(TS, e, vis) ? 1 : 0, fort: +thFortAt(TS, to).toFixed(1), unk: es.unk, n: F.us.length };
}
/* 走不通的原因：中立国挡路 · 隔海 · 被包围 */
function thOpWhy(S, T, TS, ST, P, F, o, to, ctx) {
  const pn = thOpRoute(S, T, TS, ST, P, F, o, to, 'fast', ctx, { neutral: true });
  if (pn) { const cs = [...new Set(pn.filter(z => thOpPass(S, TS, ST, P, z) === 3).map(z => boss(S, ST.zones[z].r) || TS.zc[z]))]; if (cs.length) return { k: 'neutral', cs }; }
  const ps = thOpRoute(S, T, TS, ST, P, F, o, to, 'fast', Object.assign({}, ctx, { sea: true }), { seaAny: true });
  if (ps) return { k: 'sea', sl: ctx.sea ? 1 : 0 };
  const enc = F.us.every(u => !ST.adj[u.z].some(([z, k]) => ST.edges[k].kind !== 'sea' && thOpPass(S, TS, ST, P, z) === 1));
  return { k: enc ? 'enc' : 'none' };
}
/* 执行方案：给部队下“突进”命令（不在路线上的部队经己方区格赶到路线上代价最小的一点），记下这次作战；
 * a.fol：调集出发地附近空闲的步兵师跟进；a.md：'s' 稳步推进（默认）· 'f' 全速突进。下令后立即按作战执行规则部署一次（10h） */
function thOpStart(S, T, ids, a) {
  if (!S.th || !S.th.T[T] || !a) return 0; const TS = S.th.T[T], ST = thStatic(T), P = S.player;
  const to = a.to; if (!Number.isInteger(to) || to < 0 || to >= ST.zones.length) return 0;
  let p = (Array.isArray(a.p) ? a.p : []).slice(0, 30).filter(z => Number.isInteger(z) && z >= 0 && z < ST.zones.length);
  for (let i = 1; i < p.length; i++) { const e = thEdge(ST, p[i - 1], p[i]), ps = thOpPass(S, TS, ST, P, p[i]); if (!e || !ps || ps === 3 || (e.kind === 'sea' && ps !== 1)) { p = p.slice(0, i); break; } } // 路线断开、穿过中立国或不可通行的区格：作废（下面按部队各自求路）
  if (!p.length || p[p.length - 1] !== to || new Set(p).size !== p.length) p = [];
  const k = a.k === 'move' ? 'move' : a.k === 'inf' ? 'inf' : 'push';
  const sel = []; for (const uid of [...new Set((Array.isArray(ids) ? ids : []).slice(0, 200).map(Number))]) { const u = TS.units.find(v => v.id === uid && v.c === P); if (u && !TT[u.t].fix && u.s >= 0.05) sel.push(u); }
  if (!sel.length) return 0;
  const F = thOpForce(S, T, TS, P, sel.map(u => u.id));
  const extra = k === 'push' && a.fol ? thOpFolPick(S, T, TS, ST, P, sel, thOpFolN(F, p, p.length ? thOpFlankNeed(S, T, TS, ST, P, p, thOpCtx(S, T, TS, ST, P)) : 3)) : [];
  const mixed = k === 'push' && F.mob > 0; // 机动部队与步兵一起出发：步兵跟进
  const id = 'op' + S.turn + '.' + ((S.th.opN || 0) + 1);
  let n = 0, s0 = 0; const used = [], fol = [];
  for (const u of sel.concat(extra)) {
    const g = !!TT[u.t].gue, mode = g ? 'inf' : k === 'push' ? 'push' : 'move';
    let route = g ? thPath(S, T, P, u.z, to, 'inf') : thOpJoin(S, T, TS, ST, P, u, p);
    if (!route || !route.length) route = thPath(S, T, P, u.z, to, mode);
    if (!route || !route.length) continue;
    const isF = !g && k === 'push' && (extra.includes(u) || (mixed && TT[u.t].v < 40));
    if (isF) fol.push(u.id);
    u.lk = 1; thSetOrder(S, T, u, { k: g || mode === 'move' ? 'move' : 'push', p: route.slice(0, 24), to, op: id, r: k === 'push' && !g ? (isF ? 'fl' : 'sp') : null }, 'p'); n++; s0 += ustr(u); used.push(u.id);
  }
  if (!n) return 0;
  S.th.opN = (S.th.opN || 0) + 1;
  const ops = (S.th.ops = S.th.ops || {});
  const L = (ops[P] || []).filter(x => S.turn - x.t <= 2).slice(-7);
  const op = { id, P, T, to, p, ids: used, k, t: S.turn, ph: S.th.phase || 0, st: String(a.st || '').slice(0, 8), lab: (Array.isArray(a.lab) ? a.lab : []).slice(0, 3).filter(z => Number.isInteger(z) && z >= 0 && z < ST.zones.length), s0: +s0.toFixed(2), pg: [], md: a.md === 'f' ? 'f' : 's', fol };
  L.push(op); ops[P] = L;
  if (k === 'push') try { thOpRun(S, T, TS, ST, P, op, thOpCtx(S, T, TS, ST, P)); } catch (e) { if (typeof console !== 'undefined') console.error('thOpRun', e); }
  return n;
}
/* 加入方案路线：在路线上就从所在位置接着走；否则经己方区格赶到路线上代价最小的一点（可以直接从侧面进攻路线上的敌占区格） */
function thOpJoin(S, T, TS, ST, P, u, p) {
  if (!p.length) return null;
  const j = p.indexOf(u.z); if (j >= 0) return p.slice(j + 1);
  const nz = ST.zones.length, dist = new Float64Array(nz).fill(1e18), prev = new Int16Array(nz).fill(-1), done = new Uint8Array(nz);
  const v = Math.max(4, TT[u.t].v * docOf(P).v * 0.8); dist[u.z] = 0;
  for (let it = 0; it < nz; it++) {
    let a = -1, bd = 1e18; for (let i = 0; i < nz; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; a = i; }
    if (a < 0) break; done[a] = 1;
    if (a !== u.z && thOpPass(S, TS, ST, P, a) !== 1) continue; // 敌占区格只能作为终点
    for (const [b, k] of ST.adj[a]) { if (done[b]) continue; const e = ST.edges[k]; if (e.kind === 'sea' || ST.zones[b].imp) continue; const ps = thOpPass(S, TS, ST, P, b); if (!ps || ps === 3) continue; const c = e.km / (v * terOf(ST.zones[b].t).mv) + (ps === 2 ? 2 : 0); if (dist[a] + c < dist[b]) { dist[b] = dist[a] + c; prev[b] = a; } }
  }
  const rem = new Float64Array(p.length); for (let i = p.length - 2; i >= 0; i--) { const e = thEdge(ST, p[i], p[i + 1]); rem[i] = rem[i + 1] + (e ? e.km : 60) / (v * terOf(ST.zones[p[i + 1]].t).mv); }
  let bi = -1, bc = 1e18; for (let i = 0; i < p.length; i++) { if (dist[p[i]] >= 1e18) continue; const c = dist[p[i]] + rem[i]; if (c < bc - 1e-9) { bc = c; bi = i; } }
  if (bi < 0) return null;
  const head = []; for (let z = p[bi]; z !== u.z && z >= 0; z = prev[z]) head.unshift(z);
  return head.concat(p.slice(bi + 1));
}
/* 作战阶段末：记录每次作战推进到路线上的第几格、还剩多少部队（界面据此判断是否受阻） */
function thOpTick(S, T, TS, ST, ph) {
  for (const L of Object.values(S.th.ops || {})) for (const op of L) {
    if (op.T !== T || S.turn - op.t > 1) continue;
    const us = TS.units.filter(u => op.ids.includes(u.id) && u.s > 0.05), dT = op.p.length ? thOpHops(ST, op.to) : null;
    let idx = 0; for (const u of us) { const j = dT ? thOpIdx(ST, op.p, u.z, dT) : -1; if (j > idx) idx = j; }
    op.pg = (op.pg || []).concat([[S.turn, ph, idx, us.length, +us.reduce((s, u) => s + ustr(u), 0).toFixed(2)]]).slice(-12);
  }
}
/* 界面：本季度与上季度的作战，及其进展、受阻原因与参谋建议 */
function thOpsView(S, T, P) {
  if (!S.th || !S.th.T[T] || !S.th.ops || !S.th.ops[P]) return [];
  const TS = S.th.T[T], ST = thStatic(T), ph = S.th.phase || 0, vis = thVis(S, T, P);
  const prior = thOpPrior(S, T, TS, ST, P, vis, ph), cache = {}, est = z => cache[z] || (cache[z] = thOpEstD(S, T, TS, ST, P, z, vis, ph, prior));
  return S.th.ops[P].filter(op => op.T === T && S.turn - op.t <= 1).map(op => {
    const us = TS.units.filter(u => op.ids.includes(u.id) && u.s > 0.05), on = us.filter(u => (u.nx && u.nx.op === op.id) || (u.ord && u.ord.op === op.id));
    const dT = op.p.length ? thOpHops(ST, op.to) : null; let idx = 0; for (const u of us) { const j = dT ? thOpIdx(ST, op.p, u.z, dT) : -1; if (j > idx) idx = j; }
    const arrived = us.some(u => u.z === op.to), w = us.reduce((s, u) => s + ustr(u), 0);
    const done = op.k === 'push' ? thFr(S, P, TS.zc[op.to]) && !thEnemyIn(S, TS, op.to, P) : arrived; // 进攻：拿下目标；调动、渗透：部队到达
    const pg = op.pg || [], last = pg.slice(-2), stall = !done && on.length > 0 && last.length === 2 && last[1][2] <= last[0][2] && last[1][0] === S.turn;
    const nz = idx + 1 < op.p.length ? op.p[idx + 1] : null; let next = null;
    if (nz != null && !done && thOpPass(S, TS, ST, P, nz) < 2) next = { z: nz, own: 1 }; // 下一格还在己方手里：行军中
    else if (nz != null && !done) { const F = thOpForce(S, T, TS, P, on.length ? on.map(u => u.id) : us.map(u => u.id)); const e = thEdge(ST, op.p[idx], nz), es = est(nz); next = { z: nz, r: es.d > 0.05 && F.us.length && op.k === 'push' ? +thOpOdds(F, ST.zones[nz], es.d, thOpRiver(TS, e, P, nz, vis)).toFixed(2) : null, riv: e && e.river ? e.rname || '' : '', fort: +thFortAt(TS, nz).toFixed(1), unk: es.unk, e: es.w == null ? null : +es.w.toFixed(1) }; }
    const sp = us.length ? us.reduce((s, u) => s + u.sp, 0) / us.length : 0, enc = us.some(u => (u.enc || 0) >= 2);
    let flank = null; for (const z of op.p.slice(Math.max(1, idx - 1), idx + 1)) for (const [o] of ST.adj[z]) { if (op.p.includes(o) || !vis[o]) continue; const es = est(o); if (es.a > 0.5 && (!flank || es.w > flank.w)) flank = { z: o, w: +es.w.toFixed(1) }; }
    if (flank && flank.w < w * 0.35) flank = null;
    const st = done ? 'done' : !us.length ? 'lost' : !on.length ? (arrived ? 'done' : 'idle') : enc ? 'enc' : sp < 0.35 ? 'sup' : stall ? 'stall' : 'go';
    const role = r => on.filter(u => (u.nx || u.ord).r === r).length;
    return { id: op.id, to: op.to, p: op.p, k: op.k, st: op.st, lab: op.lab, t: op.t, ph: op.ph, n: op.ids.length, alive: us.length, on: on.length, w: +w.toFixed(1), loss: op.s0 ? +Math.max(0, 1 - w / op.s0).toFixed(2) : 0, idx, next, sp: +sp.toFixed(2), flank, state: st, pg: pg.map(x => [x[1], x[2]]), ids: op.ids.slice(),
      md: op.md || 's', cs: op.cs ? Object.assign({}, op.cs) : null, gd: (op.gd || []).filter(([z]) => on.some(u => (u.nx || u.ord).g === z)), nsp: role('sp'), nfl: role('fl'), ngd: role('gd'), nrs: on.filter(u => u.ord && u.ord.rs).length, aw: Object.keys(op.aw || {}).map(Number) }; // 作战执行的状态（10h）：当前决定、留守的区格、各角色的部队数、休整中的部队、正在集结准备进攻的区格
  });
}
/* ---------- 战区段（粗一级指挥） ---------- */
const TH_SECC = {};
function thSecs(T) {
  if (TH_SECC[T]) return TH_SECC[T];
  const ST = thStatic(T), def = (TH_DATA[T] && TH_DATA[T].sec) || [], nz = ST.zones.length, of = new Int16Array(nz).fill(-1), list = [];
  const mk = (id, n, zs) => { const i = list.length; for (const z of zs) of[z] = i; const key = zs.slice().sort((a, b) => (ST.zones[b].vp || 0) - (ST.zones[a].vp || 0) || a - b)[0]; list.push({ i, id, n, zs, key, x: zs.reduce((s, z) => s + ST.zones[z].x, 0) / zs.length, y: zs.reduce((s, z) => s + ST.zones[z].y, 0) / zs.length }); };
  for (const s of def) { const zs = s.z.map(id => ST.idx[id]).filter(i => i != null && of[i] < 0); if (zs.length) mk(s.id, s.n, zs); }
  for (const z of ST.zones) if (of[z.i] < 0) mk(z.id, [z.zh.replace(/（.*$/, ''), z.en.replace(/\s*\(.*$/, '')], [z.i]);
  const adj = list.map(() => new Set()); for (const e of ST.edges) { const a = of[e.a], b = of[e.b]; if (a !== b && e.kind !== 'sea') { adj[a].add(b); adj[b].add(a); } }
  return (TH_SECC[T] = { list, of: Array.from(of), adj: adj.map(s => [...s].sort((a, b) => a - b)) });
}
