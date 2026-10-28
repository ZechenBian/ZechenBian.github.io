/* ===================== 精细战区 · 作战执行（玩家按参谋方案发动的作战） =====================
 * 参谋方案只定轴线和目标，具体怎么走、怎么打由这里负责。每个作战阶段开始时重新部署一次；补给线被切断、
 * 目标刚拿下、路线失效或久攻不下时当天立即重新部署；逐日再做几项检查：
 *   一、分路前进：突击部队（装甲、摩托化）沿轴线两侧一格以内的平行道路分成几路，减少道路拥塞、分散补给负担；
 *       估计守备很强的区格从旁边绕过（直接奔轴线上的下一格），由跟进的步兵收拾。
 *   二、集中突击：先到的部队在出发阵地等后续部队（稳步推进最多等 3 天，全速 1 天），凑齐六成兵力、
 *       或兵力已占压倒优势才发起进攻，不再一个师一个师地投入。
 *   三、休整：组织度耗尽的部队原地休整，恢复后继续执行原命令（以前会直接改为“坚守”，作战就此中断）。
 *   四、走廊与侧翼：突破后补给线上和轴线上的区格，凡紧邻敌军或敌占区的都留兵守住（跟进步兵优先，
 *       稳步推进时也从突击部队里抽摩托化步兵），防止敌军走进空着的区格切断补给线。
 *       稳步推进时，侧翼威胁大的区格没人守、补给明显跟不上或多数部队组织度过低，突击部队先停下（最多 6 天；
 *       侧翼派不出人接防的只停 3 天并报告，等玩家增援）；同一个原因在一个作战阶段里只停一次，免得走走停停。
 *   五、拿下目标之后：有补给就地坚守，部队太多时分散到相邻区格；补给线被切断就回头打通，打不通就向己方区格突围。
 *   六、跟进步兵：下令时可以调集出发地附近空闲的步兵师，跟在突击部队后面并承担走廊守备。
 * 只作用于带作战编号（ord.op）的部队；AI 的部队、普通命令都不受影响。不掷骰子，结果可复现。
 */
const TH_OPX = { wait: 3, waitF: 1, halt: 6, fxd: 3, once: 1, rh: 0, restO: 0.45, restOF: 0.35, stack: 4, twoSide: 0, untenable: 0 }; // fxd：派不出人接防时停几天（0 只报告，≥15 停到阶段结束）；once：同一原因每阶段只停一次；rh：回头打通时战力比低于它就不打（0 不限）；twoSide、untenable、rh：备选做法（测试中对比过，默认关闭）
const THOPC = new WeakMap(); // 作战的逐日缓存（不进存档、不参与联机同步）
const THOPH = {}, THOPK = {}; // 到目标的步数表、公路距离表（静态地图数据）
const thOpOrd = u => u.nx || u.ord;
const thOpKeep = (o, n) => (o && o.op ? Object.assign(n, { op: o.op }, o.r ? { r: o.r } : {}, o.g != null ? { g: o.g } : {}) : n); // 换命令时保留作战编号与角色
const thOpHold = o => thOpKeep(o, { k: 'hold' });
function thOpFind(S, P, id) { const L = S.th && S.th.ops && S.th.ops[P]; return L ? L.find(o => o.id === id) || null : null; }
function thOpOwner(S, op) { if (op.P) return op.P; for (const [P, L] of Object.entries(S.th.ops || {})) if (L.includes(op)) return P; return null; }
const thOpUnits = (TS, P, id) => TS.units.filter(u => u.c === P && u.s > 0.05 && thOpOrd(u) && thOpOrd(u).op === id);
/* 作战是否还在执行：本回合或上回合发动、还在这个战区（过期的作战不再管它的部队，部队按普通命令行事） */
const thOpLiveOp = (S, T, op) => !!op && op.T === T && S.turn - op.t <= 1;
function thOpLive(S, T, u) { const o = u.nx || u.ord; if (!o || !o.op || !S.th || !S.th.ops) return false; return thOpLiveOp(S, T, thOpFind(S, u.c, o.op)); }
const thOpAbs = (S, d) => S.turn * 1000 + d; // 跨季度递增的日期（暂停、集结的计时用）
const thOpPk = a => Math.floor(a / 1000) * 10 + Math.floor((a % 1000) / TH_DAYS); // 跨季度日期落在哪个作战阶段
const thOpSupOk = (S, TS, u, sg) => sg[u.z] > 0 || !!TT[u.t].gue || (!!TS.base && u.c === 'CHN' && TS.zc[u.z] === 'CHN'); // 有补给路线（中国战场上国军的敌后区域就地筹粮，与合围判定一致）
const thOpFlag = (S, u) => { const o = u.ord; if (!o || !o.op) return; const op = thOpFind(S, u.c, o.op); if (op) op.rp = 1; }; // 请求当天重新部署
const thOpDC = (op, d) => { let c = THOPC.get(op); if (!c || c.d !== d) THOPC.set(op, c = { d }); return c; };
const thOpW = a => a.reduce((s, u) => s + ustr(u), 0);
const thOpDV = u => TT[u.t].d * ustr(u) * u.q; // 防御值（不含组织度）
function thOpHops(ST, to) { // 到目标的最少步数（只走陆上，不论控制方）
  const k = ST.T + ':' + to; if (THOPH[k]) return THOPH[k];
  const d = new Int16Array(ST.zones.length).fill(999), q = [to]; d[to] = 0;
  while (q.length) { const a = q.shift(); for (const [b, e] of ST.adj[a]) if (d[b] > d[a] + 1 && ST.edges[e].kind !== 'sea' && !ST.zones[b].imp) { d[b] = d[a] + 1; q.push(b); } }
  return (THOPH[k] = d);
}
function thOpKm(ST, to) { // 到目标的公路距离（按地形折算，不论控制方）：判断史实轴线在哪里转向目标
  const k = ST.T + ':' + to; if (THOPK[k]) return THOPK[k];
  const nz = ST.zones.length, d = new Float64Array(nz).fill(1e9), done = new Uint8Array(nz); d[to] = 0;
  for (let it = 0; it < nz; it++) {
    let a = -1, bd = 1e9; for (let i = 0; i < nz; i++) if (!done[i] && d[i] < bd) { bd = d[i]; a = i; }
    if (a < 0) break; done[a] = 1;
    for (const [b, e] of ST.adj[a]) { const E = ST.edges[e]; if (done[b] || E.kind === 'sea' || ST.zones[b].imp) continue; const c = E.km / terOf(ST.zones[a].t).mv; if (d[a] + c < d[b]) d[b] = d[a] + c; }
  }
  return (THOPK[k] = d);
}
/* 区格 z 在轴线上推进到第几格：在轴线上就是它的序号；在轴线旁（分路前进）就按相邻的、不比它更靠后的轴线区格算 */
function thOpIdx(ST, p, z, dT) {
  const j = p.indexOf(z); if (j >= 0) return j;
  let best = -1; for (let i = 1; i < p.length; i++) if (dT[z] <= dT[p[i]] && thEdge(ST, z, p[i])) best = i;
  return best;
}
/* 按路线走到终点大约要几天（行军速度、地形，路上每个敌占区格加两天战斗） */
function thOpEta(S, TS, ST, u, from, p) {
  let d = 0, a = from; const v = Math.max(4, TT[u.t].v * docOf(u.c).v * 0.75);
  for (const z of p) { const e = thEdge(ST, a, z); d += (e ? e.km : 60) / (v * terOf(ST.zones[z].t).mv); if (thHostile(S, u.c, TS.zc[z]) || thEnemyIn(S, TS, z, u.c)) d += 2; a = z; }
  return d;
}
const thOpMainZ = us => { const w = {}; for (const u of us) w[u.z] = (w[u.z] || 0) + ustr(u) + 1e-6 * u.id; return +Object.keys(w).sort((a, b) => w[b] - w[a])[0]; };
/* P 的补给线：从补给基地到各区格的最短补给路径（与 thSupply 同一口径，不计运力） */
function thOpLines(S, T, TS, ST, P) {
  const nz = ST.zones.length, dist = new Float64Array(nz).fill(1e9), prev = new Int16Array(nz).fill(-1), done = new Uint8Array(nz);
  const pass = i => { const c = TS.zc[i]; return !!c && thFr(S, P, c); };
  const sea = thSeaLink(S, T, P), seaAlly = !sea && [...new Set(TS.units.map(u => u.c))].some(A => A !== P && thFr(S, P, A) && thSeaLink(S, T, A));
  for (const z of ST.zones) {
    if (!pass(z.i)) continue; const owner = boss(S, z.r);
    if ((z.dep && thFr(S, P, owner) && TS.zc[z.i] === owner) || (z.base && thFr(S, P, owner)) || (z.port && (sea || seaAlly)) || (TS.base && P === 'CCP' && TS.base[z.i] > 25)) dist[z.i] = 0;
  }
  for (let it = 0; it < nz; it++) {
    let a = -1, bd = 1e9; for (let i = 0; i < nz; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; a = i; }
    if (a < 0) break; done[a] = 1;
    for (const [b, k] of ST.adj[a]) {
      if (done[b] || !pass(b)) continue; const e = ST.edges[k];
      if (e.kind === 'sea' && !(sea || seaAlly)) continue;
      const railOk = e.rail > 0 && !((TS.dmg[k] || 0) > 0) && !(TS.sab && TS.sab[b] > 0.85);
      let c = e.kind === 'sea' ? 160 : railOk ? e.km / 6 : e.km / terOf(ST.zones[b].t).mv; if (e.kind === 'dike') c = e.km * 2;
      if (dist[a] + c < dist[b] - 1e-9) { dist[b] = dist[a] + c; prev[b] = a; }
    }
  }
  return { dist, prev };
}
/* 一次部署要用到的情报：可见范围、敌情估计（与界面上的“≈”一致）、补给 */
function thOpCtx(S, T, TS, ST, P, sup) {
  const ph = S.th.phase || 0, vis = thVis(S, T, P), prior = thOpPrior(S, T, TS, ST, P, vis, ph), cache = {};
  const est = z => cache[z] || (cache[z] = thOpEstD(S, T, TS, ST, P, z, vis, ph, prior));
  let sig = null; try { const s2 = sup || thSupply(S, T, TS, ST, P); sig = s2[P] ? s2[P].sig : null; } catch (e) { sig = null; }
  return { P, vis, est, sig, wxmv: thOpWxMv(S, T), prior, lines: null };
}
/* 作战内部的调整命令：立即生效（不计命令迟滞）；下一步没变时保留已走的路程。
 * 玩家的作战命令还在传达途中（有命令迟滞的国家，作战阶段暂停时下的令）：改的是那条待生效的命令，生效时间不变 */
function thOpSet(S, T, u, o) {
  if (u.nx && u.nx.t0 != null) { u.nx = Object.assign(thOrdObj(o, 'op'), { t0: u.nx.t0 }); return; }
  const cur = u.ord, same = !u.nx && cur && cur.p && cur.p.length && o.p && o.p.length && cur.p[0] === o.p[0] && cur.k === o.k;
  const mv = same ? u.mv : 0, rs = cur && cur.op === o.op && cur.rs;
  thSetOrder(S, T, u, o, 'op');
  if (same) u.mv = mv;
  if (rs && o.k !== 'hold' && !o.ro) u.ord.rs = 1; // 正在休整的部队换了路线也继续休整（打通补给线、突围除外）
}

/* ---------- 每个作战阶段开始：重新部署所有进行中的作战 ---------- */
function thOpCtl(S, T, TS, ST) {
  if (!S.th.ops) return;
  for (const P of Object.keys(S.th.ops)) {
    let ctx = null;
    for (const op of S.th.ops[P]) {
      if (op.T !== T || S.turn - op.t > 1 || op.k !== 'push') continue;
      if (!TS.units.some(u => u.c === P && thOpOrd(u) && thOpOrd(u).op === op.id)) continue;
      ctx = ctx || thOpCtx(S, T, TS, ST, P);
      op.aw = {}; delete op.rp;
      try { thOpRun(S, T, TS, ST, P, op, ctx); } catch (e) { if (typeof console !== 'undefined') console.error('thOpRun', e); }
    }
  }
}
/* ---------- 每天开始：需要当天重新部署的作战 ---------- */
function thOpDay(S, T, TS, ST, absDay, sup) {
  for (const P of Object.keys(S.th.ops)) {
    let ctx = null;
    for (const op of S.th.ops[P]) {
      if (op.T !== T || S.turn - op.t > 1 || op.k !== 'push') continue;
      let why = op.rp ? 'ev' : null;
      if (!why) {
        const sp = thOpUnits(TS, P, op.id).filter(u => thOpOrd(u).r === 'sp'); if (!sp.length) continue;
        const sg = sup[P] ? sup[P].sig : null;
        if (sg && !sp.some(u => thOpOrd(u).ro)) { // 补给线被切断：一半以上的突击部队所在区格没有补给路线
          const cw = thOpW(sp.filter(u => !thOpSupOk(S, TS, u, sg) && !thHostile(S, P, TS.zc[u.z])));
          if (cw > thOpW(sp) * 0.5) why = 'cut';
        }
        if (!why && TS._hit) for (const [z] of op.gd || []) if (TS._hit[z]) { why = 'hit'; break; } // 留守的区格遭到进攻：重新分配守备（多派一些过去）
        if (!why) { // 久攻不下：同一个目标连打 6 天以上、平均战力比不到 0.85
          const bl = TS._bl || {};
          for (const u of sp) { const o = u.ord, nx = o.k === 'attack' ? o.to : o.p && o.p[0]; const B = nx != null ? bl[nx + ':' + P] : null; if (B && B.n >= 6 && Math.exp(B.lr / B.n) < 0.85 && absDay - B.d1 <= 1) { why = 'stall'; break; } }
        }
      }
      if (!why) continue;
      const now = thOpAbs(S, absDay);
      if (why !== 'ev' && op.rpd != null && now - op.rpd < (why === 'cut' ? 2 : why === 'hit' ? 3 : 5) && now >= op.rpd) continue;
      op.rpd = now; delete op.rp;
      ctx = ctx || thOpCtx(S, T, TS, ST, P, sup);
      try { thOpRun(S, T, TS, ST, P, op, ctx); } catch (e) { if (typeof console !== 'undefined') console.error('thOpRun', e); }
    }
  }
}
/* ---------- 逐日：作战部队今天是否按兵不动（休整、全军暂停、等待集结） ---------- */
function thOpGate(S, T, TS, ST, u, day, sup) {
  const o = u.ord; if (o.k !== 'push' && o.k !== 'attack' && o.k !== 'move') return false;
  const op = thOpFind(S, u.c, o.op); if (!thOpLiveOp(S, T, op)) { delete o.rs; return false; } // 过期的作战：按普通命令行事
  if (o.ro) { delete o.rs; return false; } // 打通补给线、突围：不等，也不休整（被围时组织度恢复不过来）
  if (o.rs) { if (u.o >= (op.md === 'f' ? TH_OPX.restOF : TH_OPX.restO)) delete o.rs; else return true; } // 休整：组织度恢复后继续原来的命令
  const nx = o.k === 'attack' ? o.to : o.p && o.p.length ? o.p[0] : null; if (nx == null || !thEdge(ST, u.z, nx)) return false; // 路线断了（被迫后撤之后）：交给行军结算当天重新求路
  const enemyNx = thEnemyIn(S, TS, nx, u.c);
  if (!enemyNx && !thHostile(S, u.c, TS.zc[nx])) return false; // 在己方区格里行军不受影响
  if (o.r === 'sp' && op.hl && thOpHalted(S, TS, op, thOpAbs(S, day), sup)) return true;
  if (!enemyNx) return false; // 空着的敌占区格：直接进入
  return !thOpReady(S, T, TS, ST, u, op, nx, thOpAbs(S, day));
}
/* 全军暂停是否还要继续：侧翼有人接防、补给恢复、组织度恢复，或已经停了 6 天（派不出人接防的 3 天） */
function thOpHalted(S, TS, op, day, sup) {
  const h = op.hl; if (!h) return false;
  const c = thOpDC(op, day); if (c.hl != null) return c.hl;
  const lim = h.k === 'flankx' ? TH_OPX.fxd : TH_OPX.halt;
  let on = lim >= TH_DAYS ? thOpPk(day) === thOpPk(h.d0) : day >= h.d0 && day - h.d0 < lim; // 派不出人接防（flankx）按 fxd 天、其余按 6 天（day、d0 都是跨季度递增的日期）
  if (!on) op.hx = { k: h.k, z: h.z ?? null, pk: thOpPk(day) }; // 到时自动解除的暂停：本阶段不再为同一个原因停
  if (on) {
    const P = thOpOwner(S, op), us = thOpUnits(TS, P, op.id).filter(v => thOpOrd(v).r === 'sp'), w = thOpW(us) || 1;
    if (h.k === 'flank' || h.k === 'flankx') { const dv = TS.units.filter(v => v.z === h.z && thFr(S, P, v.c) && !(v.c === P && thOpOrd(v) && thOpOrd(v).op === op.id && thOpOrd(v).r === 'sp')).reduce((s2, v) => s2 + thOpDV(v), 0); on = dv < Math.min(h.need || 0.7, 4) * 0.35 && !thHostile(S, P, TS.zc[h.z]); } // 接防的部队到了（突击部队自己不算）
    else if (h.k === 'sup') { const sg = sup && sup[P] ? sup[P].sig : null, aSig = sg ? us.reduce((s, v) => s + (sg[v.z] || 0) * ustr(v), 0) / w : 1; on = us.reduce((s, v) => s + v.sp * ustr(v), 0) / w < Math.min(0.5, aSig - 0.05); } // 补给恢复到当地能达到的水平
    else if (h.k === 'rest') on = us.reduce((s, v) => s + v.o * ustr(v), 0) / w < 0.5;
  }
  if (!on) op.hl = null;
  return (c.hl = on);
}
/* 攻击 nx 的兵力是否到齐：相邻、正要打它的部队占六成以上（或已占压倒优势），否则最多等 3 天（全速 1 天） */
function thOpReady(S, T, TS, ST, u, op, nx, day) {
  const c = thOpDC(op, day), key = 'r' + nx; if (c[key] != null) return c[key];
  const P = u.c, host = z => thHostile(S, P, TS.zc[z]) || thEnemyIn(S, TS, z, P), zt = ST.zones[nx], ter = terOf(zt.t);
  let pres = 0, come = 0, A = 0;
  for (const v of thOpUnits(TS, P, op.id)) {
    const o = v.ord; if (v.nx || o.rs || (o.k !== 'push' && o.k !== 'attack')) continue;
    const p = o.k === 'attack' ? [o.to] : o.p || [];
    if (p[0] === nx && thEdge(ST, v.z, nx)) {
      pres += ustr(v); const t = TT[v.t], e = thEdge(ST, v.z, nx);
      let a = t.a * ustr(v) * v.q * (0.25 + 0.75 * v.o) * (0.4 + 0.6 * v.sp); if (t.arm > 0) a *= 1 + (ter.arm - 1) * t.arm; if (e.river) a *= e.river > 1 ? 0.55 : 0.75;
      A += a; continue;
    }
    for (let j = 0; j < Math.min(3, p.length); j++) { if (p[j] === nx) { come += ustr(v); break; } if (host(p[j])) break; }
  }
  let D = 0; for (const w of TS.units) if (w.z === nx && thHostile(S, P, w.c) && !TT[w.t].gue) D += TT[w.t].d * ustr(w) * w.q * (0.4 + 0.6 * w.o) * (1 + 0.3 * w.en);
  D *= ter.def * (1 + 0.4 * thFortAt(TS, nx));
  const hopeless = op.md !== 'f' && pres > 0 && A < 0.35 * D; // 敌军太强：先不硬冲，请求换一条路、等增援（全速突进不等）
  let ok = !hopeless && (come <= 0 || pres >= 0.6 * (pres + come) || A >= 2.5 * Math.max(0.05, D));
  const aw = op.aw = op.aw || {};
  if (!ok) { if (aw[nx] == null || aw[nx] > day) aw[nx] = day; const lim = op.md === 'f' ? TH_OPX.waitF : hopeless ? TH_OPX.wait * 2 : TH_OPX.wait; if (day - aw[nx] >= lim) ok = true; } // 太强的也只等 6 天：玩家下的令终究要执行
  if (hopeless) { op.blk = nx; if (op.rpd == null || day - op.rpd >= 3) op.rp = 1; } else if (op.blk === nx) delete op.blk;
  if (ok) delete aw[nx];
  return (c[key] = ok);
}

/* ---------- 部署一次作战 ---------- */
function thOpRun(S, T, TS, ST, P, op, ctx) {
  const us = thOpUnits(TS, P, op.id), day = S.th.day || 0, ph = S.th.phase || 0, to = op.to, fast = op.md === 'f';
  const reg = us.filter(u => !TT[u.t].gue); if (!reg.length) return;
  const fol = new Set(op.fol || []);
  let spear = reg.filter(u => TT[u.t].v >= 40 && !fol.has(u.id)), foll = reg.filter(u => !spear.includes(u));
  if (!spear.length) { spear = foll; foll = []; } // 只有步兵：步兵担任突击
  const host = z => thOpPass(S, TS, ST, P, z) >= 2;
  const dT = thOpHops(ST, to);
  let axis = Array.isArray(op.p) && op.p.length >= 2 && op.p[op.p.length - 1] === to ? op.p : null;
  if (!axis) { const m = thOpMainZ(spear), p = thPath(S, T, P, m, to, 'push'); axis = p ? [m].concat(p) : [m, to]; }
  const axisSet = new Set(axis), done = !host(to) && thFr(S, P, TS.zc[to]), sig = ctx.sig;
  ctx.lines = ctx.lines || thOpLines(S, T, TS, ST, P); ctx.expo = {}; // 侧翼暴露值随轴线而变：每次作战重新算
  // —— 补给线被切断？——
  const cut = !!sig && thOpW(spear.filter(u => !thOpSupOk(S, TS, u, sig) && !thHostile(S, P, TS.zc[u.z]))) > thOpW(spear) * 0.5;
  // —— 各部队推进到轴线上的第几格；主力（一半以上的兵力）到了哪里 ——
  const ui = new Map(reg.map(u => [u, Math.max(0, thOpIdx(ST, axis, u.z, dT))]));
  const med = a => { const b = a.map(u => [ui.get(u), ustr(u)]).sort((x, y) => y[0] - x[0]); const tot = b.reduce((s2, x) => s2 + x[1], 0) || 1; let acc = 0; for (const [i, w] of b) { acc += w; if (acc >= tot * 0.5) return i; } return 0; };
  const mi = med(spear), mx = Math.max(0, ...spear.map(u => ui.get(u)));
  const nextH = i => { for (let j = i + 1; j < axis.length; j++) if (host(axis[j])) return j; return -1; };
  // —— 记下主力当前的补给线（从前到后）：日后补给线被切断时，回头打的就是这条线上丢掉的那一格 ——
  if (!cut) { const m = thOpMainZ(spear), L = ctx.lines, ln = []; for (let z = m, n = 0; z >= 0 && n < 14 && L.dist[z] < 1e9; n++) { ln.push(z); if (!(L.dist[z] > 0)) break; z = L.prev[z]; } if (ln.length > 1) op.ln = ln; }
  // —— 走廊守备 ——
  const cor = thOpCorridor(S, T, TS, ST, P, op, spear, axis, mx, ctx);
  const left = ph > 0 ? Math.max(0, ph * TH_DAYS - day) : TH_DAYS; // 本作战阶段还剩几天（对手在阶段之间重新部署）
  const G = thOpGuards(S, T, TS, ST, P, op, cor, spear, foll, fast || cut, left);
  if (TH_OPX.dbg) TH_OPX.dbg.push({ d: day, cor: cor.map(c => [c.z, +c.a.toFixed(1), +c.need.toFixed(1), TS._hit && TS._hit[c.z] ? 1 : 0]), g: [...G.ord.values()].map(g => g.z), free: G.free.length, sp: spear.length, gap: G.gap, gapK: G.gapK }); // 调试（测试脚本里打开）
  for (const [u, g] of G.ord) thOpSet(S, T, u, g.p && g.p.length ? { k: 'push', p: g.p, to: g.z, op: op.id, r: 'gd', g: g.z } : { k: 'hold', op: op.id, r: 'gd', g: g.z });
  const spGo = spear.filter(u => !G.ord.has(u));
  const gz = {}; for (const g of G.ord.values()) gz[g.z] = (gz[g.z] || 0) + 1; op.gd = Object.entries(gz).map(([z, n]) => [+z, n]).slice(0, 8);
  // —— 突击部队 ——
  let cs;
  if (cut) { op.hl = null; cs = thOpReopen(S, T, TS, ST, P, op, spGo.concat(G.free), ctx, axis, dT, done); }
  else if (done) cs = thOpHoldObj(S, T, TS, ST, P, op, spGo, cor, ctx);
  else if (!spGo.length) cs = { k: 'go', z: null };
  else {
    // 稳步推进：侧翼缺口、补给明显跟不上、多数部队疲惫时暂停（逐日检查是否可以恢复）
    const w = thOpW(spGo) || 1, aSp = spGo.reduce((s2, u) => s2 + u.sp * ustr(u), 0) / w, aO = spGo.reduce((s2, u) => s2 + u.o * ustr(u), 0) / w;
    const aSig = sig ? spGo.reduce((s2, u) => s2 + (sig[u.z] || 0) * ustr(u), 0) / w : 1;
    const byZ = {}; for (const u of spGo) byZ[u.z] = (byZ[u.z] || 0) + 1;
    const canSpread = Object.entries(byZ).some(([z, n]) => n > TH_OPX.stack && ST.adj[+z].some(([o, k]) => ST.edges[k].kind !== 'sea' && thOpPass(S, TS, ST, P, o) === 1 && (byZ[o] || 0) < TH_OPX.stack - 1));
    let hl = null; const now = thOpAbs(S, day);
    if (!fast && G.gap != null) hl = { k: G.gapK, z: G.gap, d0: now, need: +(cor.find(c => c.z === G.gap) || { need: 0.7 }).need.toFixed(2) };
    else if (!fast && ((aSp < 0.3 && aSig > aSp + 0.12) || (canSpread && aSig < 0.35))) hl = { k: 'sup', d0: now };
    else if (aO < (fast ? 0.2 : 0.33)) hl = { k: 'rest', d0: now };
    let xpo = null;
    if (hl && hl.k === 'flankx' && !(TH_OPX.fxd > 0)) { xpo = hl.z; hl = null; } // 只报告、不停
    if (hl && TH_OPX.once && op.hx && op.hx.k === hl.k && op.hx.z === (hl.z ?? null) && op.hx.pk === thOpPk(now)) { if (hl.k === 'flankx') xpo = hl.z; hl = null; } // 本阶段已经为这个原因停过
    if (hl && (hl.k !== 'flankx' || TH_OPX.fxd < TH_DAYS) && op.hl && op.hl.k === hl.k && op.hl.z === hl.z && op.hl.d0 <= now) hl.d0 = op.hl.d0; // 同一个原因的暂停：重新部署不重新计时
    op.hl = hl;
    // 每支部队奔它前方第一个敌占轴线区格的下一格（分路，可以绕过强点）；同一个目标的部队一起分路
    const groups = new Map();
    for (const u of spGo) { const h = nextH(ui.get(u)), j = h < 0 ? axis.length - 1 : Math.min(h + 1, axis.length - 1); if (!groups.has(j)) groups.set(j, []); groups.get(j).push(u); }
    const load = new Float64Array(ST.zones.length), eload = new Float64Array(ST.edges.length), thru = new Set();
    for (const [j, gu] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
      const T1 = axis[j], tail0 = axis.slice(j + 1), cutT = tail0.findIndex(z => { const ps = thOpPass(S, TS, ST, P, z); return !ps || ps === 3; }), tail = cutT >= 0 ? tail0.slice(0, cutT) : tail0, lanes = thOpLanes(S, T, TS, ST, P, gu, T1, axisSet, ctx, !!(hl && hl.k === 'sup'), load, eload);
      for (const u of gu) {
        let p = lanes.get(u); if (!p) p = u.z === T1 ? [] : (thPath(S, T, P, u.z, T1, 'push') || []);
        p = p.concat(tail.filter(z => !p.includes(z))); thru.add(u.z); for (const z of p) thru.add(z);
        if (p.length) thOpSet(S, T, u, { k: 'push', p: p.slice(0, 24), to, op: op.id, r: 'sp' }); else thOpSet(S, T, u, { k: 'hold', op: op.id, r: 'sp' });
      }
    }
    const hm = nextH(mi), W = hm >= 0 ? axis[hm] : to, byp = host(W) && !thru.has(W) && ctx.est(W).d > 0.05;
    cs = hl ? { k: hl.k, z: hl.z ?? null } : xpo != null ? { k: 'xpo', z: xpo } : byp ? { k: 'byp', z: W } : { k: 'go', z: W };
  }
  // —— 跟进步兵：跟在突击部队后面；被绕过的敌占区格顺路拔除 ——
  if (!cut) thOpFollow(S, T, TS, ST, P, op, G.free, axis, mi, done, ctx);
  op.cs = Object.assign(cs || { k: 'go', z: null }, { ph, t: S.turn, n: G.ord.size });
}
/* 走廊：突击部队到补给基地的补给线上、以及突击部队身后的轴线上，不是本国领土、紧邻敌军或敌占区的己方区格 */
function thOpCorridor(S, T, TS, ST, P, op, spear, axis, mx, ctx) {
  const L = ctx.lines, out = new Map(), host = z => thOpPass(S, TS, ST, P, z) === 2; // 中立国不算威胁
  const add = (z, pr) => { if (z == null || z < 0 || host(z)) return; const zz = ST.zones[z]; if (zz.imp || boss(S, zz.r) === P || !thFr(S, P, TS.zc[z])) return; if (!out.has(z) || out.get(z) > pr) out.set(z, pr); };
  for (const u of spear) { let z = u.z, n = 0; const seen = new Set(); while (z >= 0 && !seen.has(z) && n++ < 30) { seen.add(z); add(z, L.dist[z]); if (!(L.dist[z] > 0) || L.dist[z] >= 1e9) break; z = L.prev[z]; } }
  for (let i = 1; i <= Math.min(mx, axis.length - 1); i++) add(axis[i], L.dist[axis[i]] < 1e9 ? L.dist[axis[i]] : 999);
  if (!host(op.to)) add(op.to, L.dist[op.to] < 1e9 ? L.dist[op.to] : 999);
  const res = [];
  for (const [z, pr] of out) {
    let a = 0, h = 0; for (const [o, k] of ST.adj[z]) { if (ST.edges[k].kind === 'sea' || ST.zones[o].imp || !host(o)) continue; h++; if (ctx.vis[o]) a += ctx.est(o).a; }
    if (!h) continue; // 不挨着敌人：不用守
    const k = terOf(ST.zones[z].t).def * (1 + 0.4 * thFortAt(TS, z)), hit = TS._hit && TS._hit[z] ? 1.5 : 1; // 正遭到进攻的区格多派一些
    let amax = 0; for (const [o, k2] of ST.adj[z]) if (ST.edges[k2].kind !== 'sea' && host(o) && ctx.vis[o]) amax = Math.max(amax, ctx.est(o).a);
    res.push({ z, a, h, pr, k, amax, need: Math.max(0.7, a * 0.6 / k) * hit });
  }
  return res;
}
/* 守备分派：每次重新分配，但尽量让原来的留守部队留在原地。先给每个受威胁、眼下没人守的区格各派一支，
 * 再轮流给还不够的区格各补一支（跟进步兵和原有的留守部队优先；第一轮也可以从突击部队里抽，摩托化步兵先抽，突击力量至少留五成五）。
 * 侧翼缺口：紧邻约 2 个师当量以上敌军的走廊区格眼下没人守——有人在路上就等（flank），派不出人就停下报告（flankx） */
function thOpGuards(S, T, TS, ST, P, op, cor, spear, foll, noDetach, left) {
  const zs = cor.slice().sort((a, b) => b.a - a.a || a.pr - b.pr || a.z - b.z), dist = (a, b) => Math.hypot(ST.zones[a].x - ST.zones[b].x, ST.zones[a].y - ST.zones[b].y);
  const have = new Map(), pres = new Map(), ord = new Map(), cur = new Map(), eta = new Map();
  for (const c of zs) { let h = 0; for (const v of TS.units) { if (v.z !== c.z || !thFr(S, P, v.c)) continue; const o = thOpOrd(v); if (o && o.op === op.id) continue; h += thOpDV(v); } have.set(c.z, h); pres.set(c.z, h); }
  for (const u of foll.concat(spear)) { const o = thOpOrd(u); if (o.r === 'gd' && o.g != null) cur.set(u, o.g); }
  for (const c of zs) if (pres.get(c.z) > 0) eta.set(c.z, 0);
  const pool = foll.concat(spear.filter(u => cur.has(u)));
  const rank = u => (u.t === 'mot' ? 0 : u.t === 'cav' ? 1 : u.t === 'lt' ? 2 : u.t === 'pz' ? 4 : 3);
  const det = noDetach ? [] : spear.filter(u => !cur.has(u)).sort((a, b) => rank(a) - rank(b) || ustr(a) - ustr(b) || a.id - b.id);
  const sp0 = thOpW(spear); let spLeft = sp0 - thOpW(spear.filter(u => cur.has(u)));
  const dropZ = new Map(); // 某个哨位去不了的部队（路太远），只对那个哨位作废
  const take = (c, allowDet) => {
    const drop = dropZ.get(c.z) || new Set(); dropZ.set(c.z, drop);
    for (;;) {
      let best = null, bd = 1e18, isDet = false;
      for (const u of pool) { if (ord.has(u) || drop.has(u)) continue; const d = (cur.get(u) === c.z ? -1e6 : 0) + dist(u.z, c.z); if (d < bd) { bd = d; best = u; } }
      const th = Math.min(c.need, 4) * 0.35, short = th - have.get(c.z); // 抽调突击部队时挑一支够分量的（守得住门槛），免得派去的单位太弱
      if (!best && (allowDet || short > 0) && c.a > 0.8) for (const u of det) { if (ord.has(u) || drop.has(u) || spLeft - ustr(u) < sp0 * 0.55) continue; const d = rank(u) * 1e4 + (thOpDV(u) >= short ? 0 : 5e3) + dist(u.z, c.z); if (d < bd) { bd = d; best = u; isDet = true; } }
      if (!best) return false;
      const p = best.z === c.z ? [] : thPath(S, T, P, best.z, c.z, 'push'); if (p == null || p.length > 10) { drop.add(best); continue; }
      ord.set(best, { z: c.z, p }); have.set(c.z, have.get(c.z) + thOpDV(best)); if (best.z === c.z) pres.set(c.z, pres.get(c.z) + thOpDV(best)); if (isDet) spLeft -= ustr(best);
      const t = best.z === c.z ? 0 : thOpEta(S, TS, ST, best, best.z, p); if (!(eta.get(c.z) <= t)) eta.set(c.z, t);
      return true;
    }
  };
  for (const c of zs) { // 原有的留守部队先各留一支在原地（避免来回调动）；其余的重新分配，免得都堆在威胁最大的那一格
    const mine = pool.filter(u => cur.get(u) === c.z).sort((a, b) => (a.z === c.z ? 0 : 1) - (b.z === c.z ? 0 : 1) || dist(a.z, c.z) - dist(b.z, c.z) || a.id - b.id);
    for (const u of mine) {
      if (have.get(c.z) > 0) break;
      const p = u.z === c.z ? [] : thPath(S, T, P, u.z, c.z, 'push'); if (p == null || p.length > 10) continue;
      ord.set(u, { z: c.z, p }); have.set(c.z, have.get(c.z) + thOpDV(u)); if (u.z === c.z) pres.set(c.z, pres.get(c.z) + thOpDV(u));
      const t = u.z === c.z ? 0 : thOpEta(S, TS, ST, u, u.z, p); if (!(eta.get(c.z) <= t)) eta.set(c.z, t);
    }
  }
  for (const c of zs) if (!(have.get(c.z) > 0)) take(c, true); // 第一轮：每个受威胁、还没人守的区格先派一支，防止敌军走进空着的区格
  for (let round = 0; round < 12; round++) { let any = false; for (const c of zs) if (have.get(c.z) < c.need && take(c, false)) any = true; if (!any) break; } // 之后轮流补足（守备不到门槛的区格仍可从突击部队里抽人）
  // 侧翼缺口：紧邻约 2 个师当量以上敌军、眼下没人守的走廊区格——派不出人（flankx），或者接防的部队本阶段结束前赶不到、那里正遭到进攻（flank）
  // 守备明显不足也算缺口：至少要有所需兵力的三成五（所需按最多 4 个师当量算——敌军再多，守住走廊也只指望一个军拖住，不指望硬挡）
  let gap = null, gapK = null; const hit = TS._hit || {};
  for (const c of zs) { const th = Math.min(c.need, 4) * 0.35; if (c.a < 2 || pres.get(c.z) >= th) continue; if (have.get(c.z) < th) { gap = c.z; gapK = 'flankx'; break; } if (eta.get(c.z) > left || hit[c.z]) { gap = c.z; gapK = 'flank'; break; } }
  if (TH_OPX.untenable && gap == null) for (const c of zs) if (c.amax >= 10 && c.amax > 3 * have.get(c.z) * c.k) { gap = c.z; gapK = 'flankx'; break; } // 守不住：紧邻的一大股敌军（10 个师当量以上）超过守备的三倍
  return { ord, free: foll.filter(u => !ord.has(u)), gap, gapK };
}
/* 分路前进：每支突击部队各求一条到 T1 的路线，已经有部队走的区格加代价，敌占区只走轴线两侧一格以内 */
function thOpLanes(S, T, TS, ST, P, us, T1, axisSet, ctx, spread, load, eload) {
  const out = new Map();
  const near = new Set(); for (const z of axisSet) { near.add(z); for (const [o] of ST.adj[z]) near.add(o); }
  const F = thOpForce(S, T, TS, P, us.map(u => u.id));
  const byZ = {};
  for (const u of us.slice().sort((a, b) => ustr(b) - ustr(a) || a.id - b.id)) {
    let from = u.z, pre = [];
    if (spread) { // 补给跟不上：同一区格的部队太多就先分散到相邻的己方区格
      byZ[u.z] = (byZ[u.z] || 0) + 1;
      if (byZ[u.z] > TH_OPX.stack - 1) {
        let best = null, bs = -1e9; for (const [o, k] of ST.adj[u.z]) { if (ST.edges[k].kind === 'sea' || thOpPass(S, TS, ST, P, o) !== 1 || (byZ[o] || 0) >= TH_OPX.stack - 1) continue; const sc = (near.has(o) ? 1 : 0) + (ctx.sig ? ctx.sig[o] || 0 : 0) - 0.1 * (byZ[o] || 0); if (sc > bs) { bs = sc; best = o; } }
        if (best != null) { byZ[u.z]--; byZ[best] = (byZ[best] || 0) + 1; from = best; pre = [best]; }
      }
    }
    const p = from === T1 ? [] : thOpLane(S, T, TS, ST, P, u, from, T1, near, axisSet, load, eload, F, ctx);
    if (p == null) continue;
    const full = pre.concat(p); out.set(u, full);
    let n = 0, a = u.z; for (const z of full) { load[z] += ustr(u); const e = thEdge(ST, a, z); if (e && TT[u.t].v >= 40) eload[e.k] += uw(u); a = z; if (++n >= 4) break; }
  }
  return out;
}
/* 区格 b 侧面暴露在多少敌军面前：相邻（不在轴线上）、看得见的敌军进攻力之和 */
function thOpExpo(S, TS, ST, P, b, axisSet, ctx) {
  const c = ctx.expo || (ctx.expo = {}); if (c[b] != null) return c[b];
  let a = 0; for (const [o, k] of ST.adj[b]) { if (axisSet.has(o) || ST.edges[k].kind === 'sea' || !ctx.vis[o] || thOpPass(S, TS, ST, P, o) !== 2) continue; a += ctx.est(o).a; }
  return (c[b] = a);
}
function thOpLane(S, T, TS, ST, P, u, from, T1, near, axisSet, load, eload, F, ctx) {
  const nz = ST.zones.length, dist = new Float64Array(nz).fill(1e18), prev = new Int16Array(nz).fill(-1), done = new Uint8Array(nz);
  const v = Math.max(4, TT[u.t].v * docOf(P).v * ctx.wxmv * 0.8), w = uw(u), mob = TT[u.t].v >= 40; dist[from] = 0;
  for (let it = 0; it < nz; it++) {
    let a = -1, bd = 1e18; for (let i = 0; i < nz; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; a = i; }
    if (a < 0 || a === T1) break; done[a] = 1;
    for (const [b, k] of ST.adj[a]) {
      if (done[b]) continue; const e = ST.edges[k]; if (e.kind === 'sea') continue;
      const pass = thOpPass(S, TS, ST, P, b); if (!pass || pass === 3) continue;
      if (pass === 2 && !near.has(b)) continue; // 敌占区只走轴线两侧一格以内
      const zt = ST.zones[b], ter = terOf(zt.t);
      const capE = (e.rail ? 14 : 10) * ter.cap * (e.kind === 'dike' ? 0.3 : 1); // 道路容量（与行军结算相同）：同一条路上的机动部队越多走得越慢
      let c = e.km / (v * ter.mv * (mob ? Math.min(1, capE / (eload[k] + w)) : 1));
      if (pass === 2) { const es = ctx.est(b), rv = thOpRiver(TS, e, P, b, ctx.vis); if (es.d > 0.05) { const r = thOpOdds(F, zt, es.d, rv); c += clamp(1.5 + 4.5 / r, 1, 20) + 4 / r; } else c += 0.3; if (es.unk) c += 1; }
      c += 0.25 * load[b] / Math.max(2.5, ter.front * 0.6); // 挤在同一个区格里：补给分摊、正面展不开
      if (!axisSet.has(b)) c += 0.4 + 0.05 * thOpExpo(S, TS, ST, P, b, axisSet, ctx); // 偏离轴线、侧面紧挨着大股敌军的路不走
      if (dist[a] + c < dist[b]) { dist[b] = dist[a] + c; prev[b] = a; }
    }
  }
  if (prev[T1] < 0) return null;
  const p = []; for (let z = T1; z !== from && z >= 0; z = prev[z]) p.unshift(z);
  return p;
}
/* 补给线被切断：先沿来路（轴线）往回打——切断补给线的多半就是身后轴线上被敌军夺回的那一两格；
 * 来路被切成三格以上时，改求一条最多穿过两个敌占区格、回到有补给的己方区格的短路线；都不行就就地坚守，等待解围 */
function thOpReopen(S, T, TS, ST, P, op, us, ctx, axis, dT, done) {
  const nz = ST.zones.length, sig = ctx.sig, host = z => thOpPass(S, TS, ST, P, z) >= 2;
  let keep = [];
  if (done) { // 目标在手：最强的一半（至少两支）守住目标，其余回头打通补给线
    const at = us.filter(u => u.z === op.to).sort((a, b) => ustr(b) - ustr(a) || a.id - b.id); keep = at.slice(0, Math.max(2, Math.ceil(at.length / 2)));
    for (const u of keep) thOpSet(S, T, u, { k: 'hold', op: op.id, r: thOpOrd(u).r || 'sp' });
    us = us.filter(u => !keep.includes(u)); if (!us.length) return { k: 'enc', z: null };
  }
  const stay = v => keep.includes(v) || (done && v.z === op.to); // 守目标的部队不动
  const bad = (z, a) => { if (!(TH_OPX.rh > 0) || !host(z)) return false; const es = ctx.est(z); if (!(es.d > 0.05)) return false; const F = thOpForce(S, T, TS, P, a.map(v => v.id)); return F.us.length > 0 && thOpOdds(F, ST.zones[z], es.d, 1) < TH_OPX.rh; }; // 战力比太低（rh）：打不下来
  let route = null, xBad = null;
  // 补给线上丢掉的那一格（离补给基地最近的那个）：外面的留守、跟进部队从有补给的一侧打，里面的部队从另一侧打
  if (Array.isArray(op.ln) && op.ln.length > 1) {
    const ln = op.ln; let X = null;
    for (let i = ln.length - 1; i >= 1; i--) { const z = ln[i]; if (host(z) && ST.adj[z].some(([b, k]) => ST.edges[k].kind !== 'sea' && thOpPass(S, TS, ST, P, b) === 1 && sig[b] > 0.15)) { X = z; break; } }
    if (X != null) {
      const near = new Map([[X, 0]]), q = [X];
      while (q.length) { const a = q.shift(), d = near.get(a); if (d >= 3) continue; for (const [b, k] of ST.adj[a]) { if (near.has(b) || ST.edges[k].kind === 'sea' || thOpPass(S, TS, ST, P, b) !== 1) continue; near.set(b, d + 1); q.push(b); } }
      const go = [];
      for (const v of thOpUnits(TS, P, op.id)) { // 外面（有补给一侧）两步以内的作战部队
        if (TT[v.t].gue || stay(v) || !(sig[v.z] > 0) || !near.has(v.z) || near.get(v.z) > 2) continue; const o = thOpOrd(v);
        const p = thEdge(ST, v.z, X) ? [X] : thPath(S, T, P, v.z, X, 'push'); if (!p || !p.length || p.length > 3) continue;
        go.push([v, { k: 'push', p, to: X, op: op.id, r: o.r || 'fl', g: o.g, ro: 1 }]);
      }
      const j = ln.indexOf(X), back = ln.slice(0, j + 1); // 里面的部队沿补给线往回打
      for (const u of us) { const k0 = back.indexOf(u.z); const p = k0 >= 0 ? back.slice(k0 + 1) : (near.has(u.z) && near.get(u.z) <= 3 ? thPath(S, T, P, u.z, X, 'push') : null); if (!p || !p.length || p.length > (done ? 3 : 6)) continue; go.push([u, { k: 'push', p: p.slice(0, 24), to: X, op: op.id, r: thOpOrd(u).r || 'sp', ro: 1 }]); }
      if (go.length && !bad(X, go.map(([v]) => v))) { for (const [v, o] of go) thOpSet(S, T, v, o); return { k: 'cut', z: X }; }
      if (go.length) xBad = X; // 敌军太强、打不动：不去白白送死
    }
  }
  if (axis && axis.length >= 2) {
    let hi = 0; for (const u of us) hi = Math.max(hi, thOpIdx(ST, axis, u.z, dT));
    // 切断点：轴线上离补给基地最近、一侧挨着有补给的己方区格的敌占区格——走廊里离它近的部队从两面夹攻（离得远的突击部队守住目标，不来回奔波）
    let X0 = null; for (let i = 1; i <= hi; i++) if (host(axis[i])) { X0 = axis[i]; break; }
    if (TH_OPX.twoSide && X0 != null && ST.adj[X0].some(([b, k]) => ST.edges[k].kind !== 'sea' && thOpPass(S, TS, ST, P, b) === 1 && sig[b] > 0.15)) {
      const near = new Map([[X0, 0]]), q = [X0]; // 离切断点几步（只走己方区格）
      while (q.length) { const a = q.shift(), d = near.get(a); if (d >= 3) continue; for (const [b, k] of ST.adj[a]) { if (near.has(b) || ST.edges[k].kind === 'sea' || thOpPass(S, TS, ST, P, b) !== 1) continue; near.set(b, d + 1); q.push(b); } }
      let n = 0;
      for (const v of thOpUnits(TS, P, op.id)) {
        if (TT[v.t].gue || !near.has(v.z) || v.z === X0) continue; const o = thOpOrd(v), d = near.get(v.z);
        if (done && v.z === op.to && o.r === 'sp') continue; // 守目标的部队不动
        if (o.r === 'sp' && d > 2 && done) continue;
        const p = d === 1 ? [X0] : thPath(S, T, P, v.z, X0, 'push'); if (!p || !p.length || p.length > 3) continue;
        thOpSet(S, T, v, { k: 'push', p, to: X0, op: op.id, r: o.r || 'sp', g: o.g, ro: 1 }); n++;
      }
      if (n) { for (const u of us) { const o = thOpOrd(u); if (!o.ro && near.get(u.z) == null && u.z !== op.to) thOpSet(S, T, u, { k: 'hold', op: op.id, r: o.r || 'sp' }); } return { k: 'cut', z: X0 }; }
    }
    const back = []; let nh = 0, ok = false;
    for (let i = hi - 1; i >= 0; i--) { const z = axis[i]; back.push(z); if (host(z)) nh++; else if (sig[z] > 0.15) { ok = true; break; } if (nh > 2 || back.length > (done ? 3 : 6)) break; }
    if (ok && nh > 0 && !back.some(z => z === xBad || bad(z, us))) route = { p: back, end: back[back.length - 1], from: axis[hi] };
  }
  if (!route) {
    const m = thOpMainZ(us), F = thOpForce(S, T, TS, P, us.map(u => u.id)); let best = null;
    for (let z = 0; z < nz; z++) {
      if (thOpPass(S, TS, ST, P, z) !== 1 || !(sig[z] > 0.25)) continue;
      const p = thOpRoute(S, T, TS, ST, P, F, m, z, 'safe', { vis: ctx.vis, wxmv: ctx.wxmv, est: ctx.est, sea: false }); if (!p || p.length > 5) continue;
      const nh = p.filter(x => host(x)).length; if (nh > 2 || p.some(x => x === xBad || bad(x, us))) continue; // 要连穿几个敌占区格的不算突围，是往敌后钻；打不动的也不走
      const c = p.c + 4 * Math.max(0, nh - 1); if (!best || c < best.c - 1e-9) best = { z, p, c };
    }
    if (best) route = { p: best.p.slice(1), end: best.z, from: best.p[0] };
  }
  if (!route) { for (const u of us) thOpSet(S, T, u, { k: 'hold', op: op.id, r: thOpOrd(u).r || 'sp' }); return { k: 'enc', z: null }; }
  const X = route.p.find(z => host(z)) ?? route.end, xHost = host(X) && !bad(X, us);
  for (const u of us) {
    if (sig[u.z] > 0) { if (xHost && thEdge(ST, u.z, X)) thOpSet(S, T, u, { k: 'push', p: [X], to: X, op: op.id, r: thOpOrd(u).r || 'sp', ro: 1 }); continue; } // 已经在包围圈外（有补给）的部队：只从外面打切断点，不钻进去再出来
    const j = route.p.indexOf(u.z); let p = j >= 0 ? route.p.slice(j + 1) : null;
    if (!p) { const h = u.z === route.from ? [] : thPath(S, T, P, u.z, route.from, 'push'); p = h ? h.concat(route.p) : thPath(S, T, P, u.z, route.end, 'push'); }
    if (p && p.length) thOpSet(S, T, u, { k: 'push', p: p.slice(0, 24), to: route.end, op: op.id, r: thOpOrd(u).r || 'sp', ro: 1 });
  }
  const outside = xHost && ST.adj[X].some(([b, k]) => ST.edges[k].kind !== 'sea' && thOpPass(S, TS, ST, P, b) === 1 && sig[b] > 0.15);
  if (outside) for (const v of thOpUnits(TS, P, op.id)) { const o = thOpOrd(v); if (us.includes(v) || stay(v) || o.r !== 'gd' || !thEdge(ST, v.z, X) || !(sig[v.z] > 0)) continue; thOpSet(S, T, v, { k: 'push', p: [X], to: X, op: op.id, r: 'gd', g: o.g, ro: 1 }); } // 外面的留守部队从另一侧配合
  return { k: axis && route.p.every(z => axis.includes(z)) ? 'cut' : 'out', z: X };
}
/* 目标在手：最强的几支部队守目标，其余分散到相邻的己方区格（优先紧邻敌军的） */
function thOpHoldObj(S, T, TS, ST, P, op, spGo, cor, ctx) {
  const to = op.to, thr = new Map(cor.map(c => [c.z, c.a])), byZ = {};
  const at = spGo.filter(u => u.z === to).sort((a, b) => ustr(b) - ustr(a) || a.id - b.id);
  const rest = at.slice(TH_OPX.stack).concat(spGo.filter(u => u.z !== to));
  for (const u of at.slice(0, TH_OPX.stack)) thOpSet(S, T, u, { k: 'hold', op: op.id, r: 'sp' });
  let nAt = Math.min(at.length, TH_OPX.stack);
  const adj = ST.adj[to].filter(([o, k]) => ST.edges[k].kind !== 'sea' && thOpPass(S, TS, ST, P, o) === 1).map(([o]) => o).sort((a, b) => (thr.get(b) || 0) - (thr.get(a) || 0) || a - b);
  for (const u of rest) {
    if (u.z !== to && nAt < TH_OPX.stack) { const p = thPath(S, T, P, u.z, to, 'push'); if (p && p.length && p.length <= 3) { thOpSet(S, T, u, { k: 'push', p, to, op: op.id, r: 'sp' }); nAt++; continue; } }
    const z = adj.find(o => (byZ[o] || 0) < 3);
    if (z != null && u.z !== z) { const p = thPath(S, T, P, u.z, z, 'push'); if (p && p.length && p.length <= 4) { byZ[z] = (byZ[z] || 0) + 1; thOpSet(S, T, u, { k: 'push', p, to: z, op: op.id, r: 'gd', g: z }); continue; } }
    thOpSet(S, T, u, { k: 'hold', op: op.id, r: 'sp' });
  }
  op.hl = null;
  return { k: 'hold', z: to };
}
/* 跟进步兵：去主力身后最后一个己方的轴线区格；主力绕过的敌占轴线区格，估计打得下就顺路拔除 */
function thOpFollow(S, T, TS, ST, P, op, free, axis, mi, done, ctx) {
  if (!free.length) return;
  const host = z => thOpPass(S, TS, ST, P, z) >= 2, F = thOpForce(S, T, TS, P, free.map(u => u.id));
  let pt = done ? op.to : null, pk = null;
  for (let i = 1; i < Math.min(mi, axis.length - 1); i++) { const z = axis[i]; if (!host(z)) continue; const es = ctx.est(z), e = thEdge(ST, axis[i - 1], z); if (es.d <= 0.05 || thOpOdds(F, ST.zones[z], es.d, thOpRiver(TS, e, P, z, ctx.vis)) >= 1.2) { pk = z; break; } }
  if (pt == null) for (let i = Math.min(mi, axis.length - 1); i >= 0; i--) if (!host(axis[i])) { pt = axis[i]; break; }
  if (pt == null) pt = axis[0];
  const tgt = pk != null ? pk : pt;
  for (const u of free) {
    if (u.z === tgt) { thOpSet(S, T, u, { k: 'hold', op: op.id, r: 'fl' }); continue; }
    const p = thPath(S, T, P, u.z, tgt, 'push');
    if (p && p.length) thOpSet(S, T, u, { k: 'push', p: p.slice(0, 24), to: tgt, op: op.id, r: 'fl' }); else thOpSet(S, T, u, { k: 'hold', op: op.id, r: 'fl' });
  }
}
/* 下令时调集的跟进步兵：出发地两步以内、空闲（没有接到玩家命令、不在别的作战里）的步兵师；前沿区格至少留四成 */
function thOpFolPick(S, T, TS, ST, P, sel, n) {
  if (!(n > 0)) return [];
  const ids = new Set(sel.map(u => u.id)), near = new Map(), q = [];
  for (const u of sel) if (!near.has(u.z)) { near.set(u.z, 0); q.push(u.z); }
  while (q.length) { const a = q.shift(), h = near.get(a); if (h >= 2) continue; for (const [b, k] of ST.adj[a]) { if (near.has(b) || ST.edges[k].kind === 'sea' || thOpPass(S, TS, ST, P, b) !== 1) continue; near.set(b, h + 1); q.push(b); } }
  const front = z => ST.adj[z].some(([b, k]) => ST.edges[k].kind !== 'sea' && thOpPass(S, TS, ST, P, b) >= 2);
  const pool = TS.units.filter(u => u.c === P && !ids.has(u.id) && near.has(u.z) && ['inf', 'mtn', 'army', 'jdiv'].includes(u.t) && !thAux(u) && u.s > 0.6 && u.o > 0.5 && !u.lk && !u.nx && !thOpLive(S, T, u) && ['hold', 'dig', 'reserve'].includes(u.ord.k) && !(u.ord.p && u.ord.p.length));
  pool.sort((a, b) => near.get(a.z) - near.get(b.z) || ustr(b) - ustr(a) || a.id - b.id);
  const byZ = {}; for (const u of TS.units) if (u.c === P && !TT[u.t].fix && !ids.has(u.id)) byZ[u.z] = (byZ[u.z] || 0) + 1; // 只算留下来的部队（选中出发的不算）
  const take = {}, out = [];
  for (const u of pool) { if (out.length >= n) break; const cap = front(u.z) ? Math.floor(byZ[u.z] * 0.6) : byZ[u.z]; if ((take[u.z] || 0) >= cap) continue; take[u.z] = (take[u.z] || 0) + 1; out.push(u); }
  return out;
}
/* 建议调集多少跟进步兵：机动部队为主时，按守住路线所需的兵力（thOpFlankNeed，3—16 个师）；已经带了足够步兵就不调 */
function thOpFolN(F, path, need) { if (!F.mob || F.inf >= F.mob) return 0; return clamp(Math.ceil(need), 3, 16); }
