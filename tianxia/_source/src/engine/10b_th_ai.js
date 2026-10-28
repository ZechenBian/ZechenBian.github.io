/* ===================== 精细战区 · AI（每个作战阶段开始时重新部署） =====================
 * 守方：按“估计威胁 ÷ 地形与工事”分配守军，留出机动预备队；被合围时突围或从港口撤离。
 * 攻方：在有战略战线（f.th）的方向上选择主攻（历史计划先验 + 估计战力比 + 扩张与合围潜力），装甲集中于主攻方向逐格突进，步兵拓宽突破口。
 * 历史计划（剧本数据 plans）：例如 1940 年德军“镰刀收割”与盟军“迪尔计划”；AI 按权重随机选用，玩家不受影响。
 */
function thEst(S, T, TS, C, z) { // C 对区格 z 内敌军的估计（攻击潜力、防御值），带确定性的噪声与条令偏见
  let a = 0, d = 0, n = 0;
  const fort = thFortAt(TS, z);
  for (const v of TS.units) { if (v.z !== z || !thHostile(S, C, v.c)) continue; const w = ustr(v); a += TT[v.t].a * w * v.q * (0.4 + 0.6 * v.o); d += TT[v.t].d * w * v.q * (0.4 + 0.6 * v.o) * (TT[v.t].fix ? (1 + 0.6 * fort) / (1 + 0.4 * fort) : 1) * (1 + 0.3 * v.en); n++; }
  if (!n) return { a: 0, d: 0, n: 0 };
  const h = thHash(S.seed, S.turn, S.th.phase, z, C.charCodeAt(0) + C.charCodeAt(1) * 7);
  const k = 0.8 + 0.4 * h;
  const bias = (TH_DATA[T].bias && TH_DATA[T].bias[C] && TH_DATA[T].bias[C][thStatic(T).zones[z].id]) || 1;
  return { a: a * k * bias, d: d * k, n };
}
function thHash(a, b, c, d, e) { let h = (a | 0) ^ 0x9e3779b9; for (const v of [b, c, d, e]) { h = Math.imul(h ^ (v | 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; } return ((h >>> 0) % 10000) / 10000; }
function thDefVal(S, TS, ST, C, z) { let d = 0; for (const v of TS.units) if (v.z === z && thFr(S, C, v.c)) d += TT[v.t].d * ustr(v) * v.q * (0.4 + 0.6 * v.o); return d * terOf(ST.zones[z].t).def * (1 + 0.4 * thFortAt(TS, z)); }
function thAI(S, T, R, ph) {
  const TS = S.th.T[T], ST = thStatic(T);
  const cs = [...new Set(TS.units.map(u => u.c))];
  for (const C of cs) {
    const human = isHuman(S, C); if (human && !TS.staff[C]) continue;
    const units = TS.units.filter(u => u.c === C && !(human && (u.lk || thOpLive(S, T, u))) && !TT[u.t].fix && u.s > 0.05); // 玩家按方案发动的作战（10h）不归参谋代管
    if (!units.length) continue;
    try { if (TS.base && thAIChina(S, T, TS, ST, C, units, ph, R, human)) continue; thAIcountry(S, T, TS, ST, C, units, ph, R, human); } catch (e) { if (typeof console !== 'undefined') console.error('thAI', C, e); }
  }
}
function thPlanOk(S, T, TS, C, p) {
  if (p.trigger && p.trigger.war && !atWar(S, p.trigger.war[0], p.trigger.war[1])) return false;
  if (p.vs && !S.fronts.some(f => f.th === T && f.att === C && p.vs.includes(f.target)) && !(p.start && p.vs.some(X => S.actors[X] && atWar(S, C, X)))) return false; // 已与目标国交战、战略层尚未发动进攻（“静坐战争”）：按计划集结
  return true;
}
function thPlanOf(S, T, TS, C) {
  TS.plan = TS.plan || {};
  const D = TH_DATA[T], list = (D.plans && D.plans[C]) || []; if (!list.length) return null;
  const cur = TS.plan[C];
  if (cur && cur.done) return null;
  // 防御计划（如迪尔计划）在敌军突入本土后终止，交给通用 AI 应对（撤退、调预备队）
  const lead0 = list[0] && list[0].follow; if (cur && lead0 && TS.plan[lead0] && TS.plan[lead0].done) { cur.done = 1; return null; }
  if (cur && cur.id && list.find(z => z.id === cur.id && z.trigger) && ST_homeBreached(S, T, TS, C)) { cur.done = 1; return null; }
  if (cur && cur.id) { const p = list.find(z => z.id === cur.id); if (p && thPlanOk(S, T, TS, C, p)) { if (cur.t0 == null) cur.t0 = S.turn; return S.turn - cur.t0 <= 2 ? p : null; } }
  const ok = list.filter(p => thPlanOk(S, T, TS, C, p)); if (!ok.length) return null;
  let pick = null;
  const lead = ok[0].follow && TS.plan[ok[0].follow]; if (lead && lead.id) pick = ok.find(p => p.id === lead.id) || null;
  if (!pick) { let r = thHash(S.seed, S.turn, 0, 77, C.charCodeAt(0)) * ok.reduce((s, p) => s + (p.w || 0), 0); pick = ok[0]; for (const p of ok) { r -= p.w || 0; if (r <= 0) { pick = p; break; } } }
  TS.plan[C] = { id: pick.id, t0: S.turn };
  return pick;
}
function thSel(u, sel) {
  if (!sel) return true;
  if (sel.ag && ![].concat(sel.ag).includes(u.ag)) return false;
  if (sel.t && !sel.t.includes(u.t)) return false;
  if (sel.ar && !(u.ar || '').includes(sel.ar)) return false;
  if (sel.dd && u.dd == null) return false;
  return true;
}
/* 计划执行：返回被计划占用的部队与主攻轴线 */
function thPlanGo(S, T, TS, ST, C, units, ph, plan) {
  const out = { used: [], axis: null }; if (!plan || !plan.groups) return out;
  const idx = ST.idx, Zi = z => (typeof z === 'string' ? idx[z] : z);
  let started = true;
  if (plan.start && plan.vs) {
    const fs = S.fronts.filter(f => f.th === T && f.att === C && plan.vs.includes(f.target)); const t0 = fs.length ? Math.min(...fs.map(f => f.start ?? S.turn)) : S.turn;
    // 集结待命：战略层还没有发动进攻（“静坐战争”），或主攻轴线要穿过中立国（德国只与法国交战、荷比卢仍中立）——不去硬啃马奇诺防线。
    // 已经集结过的部队在进攻发动（战略层的宣战即入侵）时立即出击；临时决定的进攻用开头的阶段集结，第 start 阶段发动
    const blocked = !fs.length || plan.groups.some(g => g.role === 'main' && (g.axis || []).some(z => { const i = Zi(z), c = i != null ? TS.zc[i] : null; return c && c !== C && !thFr(S, C, c) && !thHostile(S, C, c); }));
    const st0 = TS.plan[C];
    if (st0 && blocked) { if (st0.asm == null) st0.asm = S.turn; st0.t0 = S.turn; }
    started = !blocked && (S.turn > t0 || ph >= plan.start || !!(st0 && st0.asm != null && st0.asm < S.turn));
  }
  const left = units.slice();
  const st = TS.plan[C];
  plan.groups.forEach((g, gi) => {
    const mine = left.filter(u => thSel(u, g.sel)); for (const u of mine) left.splice(left.indexOf(u), 1);
    if (!mine.length) return;
    const take = u => out.used.push(u);
    if (!started) { // 集结
      for (const u of mine) { const dz = u.dz != null ? idx[u.dz] : null; if (dz != null && dz !== u.z && thFr(S, C, TS.zc[dz])) { const p = thPath(S, T, C, u.z, dz, 'rail') || thPath(S, T, C, u.z, dz, 'move'); if (p && p.length) { thSetOrder(S, T, u, { k: p.length > 2 ? 'rail' : 'move', p }, 'ai'); take(u); continue; } } if (u.ord.k !== 'hold') thSetOrder(S, T, u, { k: 'hold' }, 'ai'); take(u); }
      return;
    }
    if (g.role === 'hold') { for (const u of mine) { if (u.ord.k !== 'hold' && u.ord.k !== 'dig') thSetOrder(S, T, u, { k: 'hold' }, 'ai'); take(u); } return; }
    if (g.role === 'reserve') { // 机动预备队：相邻敌占区格守备薄弱时主动反击（切断突破走廊），否则待命
      for (const u of mine) {
        let tgt = null, best = 0;
        if (u.o > 0.5 && u.s > 0.5) for (const [o, k] of ST.adj[u.z]) { if (ST.edges[k].kind === 'sea' || !thHostile(S, C, TS.zc[o])) continue; const Dt = thEst(S, T, TS, C, o).d * terOf(ST.zones[o].t).def + 0.2; const At = TS.units.filter(v => v.z === u.z && v.c === C && v.o > 0.5).reduce((s2, v) => s2 + TT[v.t].a * ustr(v) * v.q, 0); const sc = At / Dt; if (sc > 1.6 && sc > best) { best = sc; tgt = o; } }
        if (tgt != null) thSetOrder(S, T, u, { k: 'attack', to: tgt }, 'ai'); else if (u.ord.k !== 'reserve' && !(u.ord.p && u.ord.p.length)) thSetOrder(S, T, u, { k: 'reserve' }, 'ai');
        take(u);
      }
      return; }
    if (g.role === 'drop') { // 空降：开战当季第一次执行时直接投送到目标区格
      st.drop = st.drop || {};
      mine.forEach((u, i) => { if (st.drop[u.id]) return; const tz = Zi(g.to[i % g.to.length]); if (tz == null || !thHostile(S, C, TS.zc[tz])) return; st.drop[u.id] = 1; u.z = tz; u.mv = 0; u.o = Math.min(u.o, 0.85); (TS._bh = TS._bh || {})[tz] = C; thSetOrder(S, T, u, { k: 'hold' }, 'auto'); take(u); TS._pev && TS._pev.push({ k: 'drop', z: tz, c: C, d: S.th.day }); });
      return;
    }
    if (g.role === 'deploy') {
      mine.forEach((u, i) => {
        let dest = null;
        if (g.to === 'dd') dest = u.dd != null ? idx[u.dd] : null;
        else if (Array.isArray(g.to)) dest = Zi(g.to[i % g.to.length]);
        else if (g.to && u.dd != null && g.to[u.dd]) dest = Zi(g.to[u.dd]);
        if (dest == null) return;
        if (u.z === dest) { if (u.ord.k !== 'hold' && u.ord.k !== 'dig') thSetOrder(S, T, u, { k: 'hold' }, 'ai'); take(u); return; }
        if (!thFr(S, C, TS.zc[dest])) return;
        if (u.ord.p && u.ord.p.length && u.ord.p[u.ord.p.length - 1] === dest) { take(u); return; }
        const p = thPath(S, T, C, u.z, dest, 'move'); if (p && p.length && p.length <= 8) { thSetOrder(S, T, u, { k: 'move', p }, 'ai'); take(u); }
      });
      return;
    }
    // main / sec / flank：沿轴线逐格突进；侧翼掩护与摩托化步兵守住突破走廊
    const axes = [g.axis].concat(g.alt || []).map(a => a.map(Zi).filter(z => z != null));
    if (g.role === 'main' && !out.axis) out.axis = axes[0];
    const corridor = [];
    for (const ax of axes) for (const z of ax) if (thFr(S, C, TS.zc[z]) && !corridor.includes(z) && ST.adj[z].some(([o, k]) => ST.edges[k].kind !== 'sea' && thHostile(S, C, TS.zc[o]))) corridor.push(z);
    const oc = {}, gA = mine.filter(v => v.o >= 0.25 && v.s >= 0.25).reduce((s2, v) => s2 + TT[v.t].a * ustr(v) * v.q, 0) / Math.max(1, axes.length);
    const odds = t => { if (oc[t] != null) return oc[t]; const zt = ST.zones[t]; let At = gA; for (const [o] of ST.adj[t]) for (const v of TS.units) if (v.z === o && v.c === C && !mine.includes(v)) At += 0.5 * TT[v.t].a * ustr(v) * v.q; return (oc[t] = At / Math.max(0.3, thEst(S, T, TS, C, t).d * terOf(zt.t).def * (1 + 0.4 * thFortAt(TS, t)))); };
    const guard = {}; for (const z of corridor) guard[z] = TS.units.filter(v => v.z === z && thFr(S, C, v.c) && v.ord.k !== 'push').reduce((s2, v) => s2 + ustr(v), 0) + TS.units.filter(v => v.c === C && v.ord.k === 'move' && v.ord.p && v.ord.p[v.ord.p.length - 1] === z).reduce((s2, v) => s2 + ustr(v), 0);
    mine.forEach((u, i) => {
      if (u.o < 0.25 || u.s < 0.25) return;
      if ((g.role === 'flank' || (g.role === 'main' && u.t === 'mot')) && corridor.length) {
        const want = g.role === 'flank' ? 2.5 : 1.5;
        let best = null, bd = 1e9; for (const z of corridor) { if (guard[z] >= want) continue; const d = Math.hypot(ST.zones[u.z].x - ST.zones[z].x, ST.zones[u.z].y - ST.zones[z].y); if (d < bd) { bd = d; best = z; } }
        if (best != null) {
          if (u.z === best) { thSetOrder(S, T, u, { k: 'hold' }, 'ai'); guard[best] += ustr(u); take(u); return; }
          const p = thPath(S, T, C, u.z, best, 'move'); if (p && p.length && p.length <= 8) { thSetOrder(S, T, u, { k: 'move', p }, 'ai'); guard[best] += ustr(u); take(u); return; }
        }
      }
      const ax = axes[i % axes.length];
      let k = ax.findIndex(z => thHostile(S, C, TS.zc[z]) || thEnemyIn(S, TS, z, C));
      if (k < 0) return; // 这条轴线已经全部拿下：交给通用 AI 扩张
      if (odds(ax[k]) < 0.15) return; // 轴线当面敌军云集（估计战力比不到 0.15）：不按计划硬冲，交给通用 AI 另找突破口
      if (g.role === 'flank' && k >= ax.length - 1 && thFr(S, C, TS.zc[ax[ax.length - 2]] || null) === false) return;
      const head = thPath(S, T, C, u.z, ax[k], 'push'); if (!head || !head.length || head.length > 7) return;
      let p = head.slice(); for (let j = k + 1; j < ax.length; j++) { if (!thEdge(ST, p[p.length - 1], ax[j])) break; p.push(ax[j]); }
      thSetOrder(S, T, u, { k: 'push', p, to: p[p.length - 1] }, 'ai'); take(u);
    });
  });
  return out;
}
function thAIcountry(S, T, TS, ST, C, units, ph, R, human, noOff, ex, opt) { // noOff：不发动全面进攻；ex：不当作己方阵地使用的友军区格（如国军不进驻中共根据地）；opt.ctr/ctrR/ctrMax：守方局部反击的目标限制、所需兵力比、每阶段次数
  const nz = ST.zones.length, idx = ST.idx;
  const hostZ = i => thHostile(S, C, TS.zc[i]) || thEnemyIn(S, TS, i, C);
  const myZ = i => thFr(S, C, TS.zc[i]) && !(ex && ex.includes(TS.zc[i]));
  const enemies = [...new Set(TS.units.map(u => u.c))].filter(X => thHostile(S, C, X));
  const plan = thPlanOf(S, T, TS, C);
  const offF = noOff ? [] : S.fronts.filter(f => f.th === T && (f.att === C || (f.co || []).some(k => k.id === C)) && f.phase === 'land');
  const offRegs = new Set(offF.map(f => f.target));
  // 中立：原地防守（并按计划在开战前进入预定阵地）
  if (!enemies.length && !offF.length) {
    for (const u of units) if (u.ord.k !== 'hold' && u.ord.k !== 'dig' && !(u.ord.p && u.ord.p.length)) thSetOrder(S, T, u, { k: 'hold' }, 'ai');
    if (plan) thPlanGo(S, T, TS, ST, C, units, ph, plan);
    return;
  }
  // —— 态势 ——
  const front = [], threat = new Float64Array(nz), value = new Float64Array(nz);
  for (const z of ST.zones) {
    if (!myZ(z.i)) continue;
    value[z.i] = Math.max(0.5, z.vp) + (z.dep ? 2 : 0) + (z.cap ? 8 : 0) + (z.port ? 1 : 0);
    let t = 0; for (const [o, k] of ST.adj[z.i]) if (hostZ(o) && (ST.edges[k].kind !== 'sea' || thSeaLink(S, T, TS.zc[o]))) t += thEst(S, T, TS, C, o).a; // 隔海的敌军只有掌握制海权时才构成威胁
    if (thEnemyIn(S, TS, z.i, C)) t += thEst(S, T, TS, C, z.i).a * 1.5;
    if (t > 0 || ST.adj[z.i].some(([o]) => thHostile(S, C, TS.zc[o]))) { front.push(z.i); threat[z.i] = t; }
  }
  const used = new Set();
  for (const u of units) if (u.ld === S.turn && thHostile(S, C, TS.zc[u.z])) used.add(u); // 刚登陆、正在抢滩的部队不另作调动
  const order = (u, o) => { thSetOrder(S, T, u, o, 'ai'); used.add(u); };
  // —— 撤离：被围、断补给、靠近港口且有海上联系（英国远征军等） ——
  const evacOk = (TH_DATA[T].evac || []).includes(C) && (thSeaLink(S, T, C) || IDS.some(A => A !== C && thFr(S, C, A) && thSeaLink(S, T, A)));
  const landCut = evacOk ? thLandCut(S, T, TS, ST, C) : null;
  for (const u of units) {
    if (u.ord.k === 'evac') { used.add(u); continue; }
    const homeHere = boss(S, ST.zones[u.z].r) === C; // 在本国领土上作战的军队（法军在法国）不轻易撤离
    if (evacOk && ((u.sp < 0.3 && (u.enc || 0) >= 2) || (!homeHere && C !== 'FRA' && landCut && landCut[u.z] && ST.adj[u.z].some(([o]) => hostZ(o)) && !thBeachhead(S, T, C, ST.zones[u.z].r)))) { /* 两栖登陆建立的滩头：不因陆路不通而撤离 */ const pz = thNearestPort(S, T, TS, ST, u); if (pz != null) { const p = pz === u.z ? [] : thPath(S, T, C, u.z, pz, 'move'); if (p) { order(u, { k: 'evac', p }); continue; } } }
  }
  // —— 守住海运补给的滩头港口：每个留两支部队（优先步兵），不参加进攻 ——
  const seaHeads = thSeaHeads(S, T, TS, ST, C);
  for (const z of seaHeads) for (const u of units.filter(u => u.z === z && !used.has(u) && !TT[u.t].gue).sort((a, b) => (TT[a.t].v >= 40) - (TT[b.t].v >= 40) || ustr(b) - ustr(a)).slice(0, 2)) order(u, { k: 'hold' });
  // —— 计划（历史先验）：开战前集结、开战后主攻路线 ——
  let axis = null;
  if (plan) { const r = thPlanGo(S, T, TS, ST, C, units.filter(u => !used.has(u)), ph, plan); for (const u of r.used) used.add(u); axis = r.axis; }
  // —— 进攻 ——
  if (offF.length) {
    // 候选目标：与我方前沿相邻、属于进攻方向地区（或任何敌占区格）的区格
    const cand = [], focZ = thFocusZ(S, T, C);
    for (const f0 of front) for (const [t, ek] of ST.adj[f0]) {
      if (ST.edges[ek].kind === 'sea' || !hostZ(t) || cand.some(c => c.t === t)) continue; const zt = ST.zones[t];
      if (!offRegs.has(zt.r) && !thHostile(S, C, TS.zc[t])) continue;
      if (zt.imp) continue;
      const Dt = Math.max(0.3, thEst(S, T, TS, C, t).d * terOf(zt.t).def * (1 + 0.4 * thFortAt(TS, t)));
      let At = 0; for (const [o] of ST.adj[t]) if (myZ(o)) for (const u of units) if (u.z === o && !used.has(u)) At += TT[u.t].a * ustr(u) * u.q;
      // 纵深：目标后方空虚的敌占区格越多，突破价值越大
      let deep = 0; for (const [o] of ST.adj[t]) if (hostZ(o) && thEst(S, T, TS, C, o).d < 0.5) deep += 1 + Math.max(0.5, ST.zones[o].vp) * 0.2;
      const v = Math.max(0.5, zt.vp) + (zt.cap ? 10 : 0) + (zt.port ? 1 : 0) + deep * 0.8 + (axis && axis.includes(t) ? 6 : 0) + (focZ.has(t) ? 8 : 0);
      const fz = thFortAt(TS, t), need = fz >= 2 ? 2.5 : 1; // 永备工事：没有压倒性优势不去硬啃
      cand.push({ t, Dt, At, v, r: At / Dt / need, u: v * Math.min(3, At / Dt / need) / (1 + Dt * 0.15) });
    }
    cand.sort((a, b) => b.u - a.u);
    if (S.th._dbg) S.th._dbg.push({ front: front.length, cand: cand.slice(0, 6).map(c => [ST.zones[c.t].id, +c.r.toFixed(2), +c.u.toFixed(1), +c.Dt.toFixed(1), +c.At.toFixed(1)]), plan: plan && plan.id, axis: axis && axis.map(z => ST.zones[z].id) });
    // 主攻：装甲与摩托化集中
    const mobile = units.filter(u => !used.has(u) && TT[u.t].v >= 40 && u.o > 0.35 && u.s > 0.3);
    // 两栖登陆后滩头还小（不到 3 个区格）：先巩固滩头，只在战力比明显占优时扩大登陆场
    const bhR = new Set(offF.filter(f => { if (f.kind !== 'amph' || !thBeachhead(S, T, C, f.target)) return false; const zs = ST.zones.filter(z => z.r === f.target); return zs.filter(z => thFr(S, C, TS.zc[z.i])).length < Math.min(3, Math.ceil(zs.length / 2)); }).map(f => f.target));
    const rMinOf = c => (bhR.has(ST.zones[c.t].r) ? 1.5 : 0); // 只对滩头所在的地区从严
    const main = cand.find(c => c.r >= Math.max(0.9, rMinOf(c))) || (cand[0] && cand[0].r >= Math.max(0.45, rMinOf(cand[0])) ? cand[0] : null); // 最好的目标估计战力比也不到 0.45：不发动主攻，装甲部队留作预备队
    const bh = !!main && bhR.has(ST.zones[main.t].r);
    if (S.th._dbg) S.th._dbg.push({ main: main && ST.zones[main.t].id, mobile: mobile.length, obj: main && ST.zones[thObjective(S, T, TS, ST, C, main.t, offRegs, axis)] ? ST.zones[thObjective(S, T, TS, ST, C, main.t, offRegs, axis)].id : null });
    if (main) {
      const obj = bh ? main.t : thObjective(S, T, TS, ST, C, main.t, offRegs, axis); // 滩头阶段只打相邻的有限目标，并留一半机动部队守住滩头
      // 两栖登陆之后：隔海的本土部队不接“突进”命令——海上一步驶入敌占区格在执行时会被拒绝，以前这些部队因此整季度原地不动，也不去增援滩头。
      // 只在已经实施登陆的进攻方生效，1940 年等没有登陆的战局不受影响。
      const amphOn = offF.some(f => f.kind === 'amph' && f.thLand != null);
      const seaBad = (u, p) => { if (!amphOn || !p) return false; let a = u.z; for (const z of p) { const e = thEdge(ST, a, z); if (e && e.kind === 'sea' && (thHostile(S, C, TS.zc[z]) || thEnemyIn(S, TS, z, C))) return true; a = z; } return false; };
      const mob = bh ? mobile.filter(u => { const p = thPath(S, T, C, u.z, main.t, 'push'); return p && p.length && p.length <= 9 && !seaBad(u, p); }) : mobile; // 滩头阶段只从走得到目标的部队里抽调
      for (const u of bh ? mob.slice(0, Math.ceil(mob.length / 2)) : mob) {
        let p = thPath(S, T, C, u.z, obj != null ? obj : main.t, 'push'); if (seaBad(u, p)) p = null; if (!p || !p.length || p.length > 9) continue;
        if (!p.includes(main.t) && !(axis && p.some(z => axis.includes(z)))) { const p2 = thPath(S, T, C, u.z, main.t, 'push'); if (p2 && !seaBad(u, p2)) { order(u, { k: 'push', p: p2.concat(thPath(S, T, C, main.t, obj, 'push') || []), to: obj }); continue; } }
        order(u, { k: 'push', p, to: obj });
      }
    }
    // 步兵：对估计战力比有利的相邻目标发起进攻（拓宽突破口），其余就地防守
    for (const c of cand.slice(0, 8)) {
      if (c.r < Math.max(c === main ? 0.8 : 1.25, rMinOf(c))) continue;
      for (const [o, ek] of ST.adj[c.t]) {
        if (!myZ(o) || ST.edges[ek].kind === 'sea') continue;
        const here = units.filter(u => u.z === o && !used.has(u) && TT[u.t].v < 40 && u.o > 0.4 && u.s > 0.35);
        const keep = threat[o] > 0 ? Math.ceil(here.length * 0.3) : 0; // 留一部分守住出发区格
        for (const u of here.slice(keep)) order(u, { k: 'attack', to: c.t });
      }
    }
    // 后方空闲部队前调：到主攻与次要目标相邻的前沿区格
    if (cand.length) {
      const stage = []; for (const c of cand.slice(0, 4)) for (const [o, ek] of ST.adj[c.t]) if (myZ(o) && !hostZ(o) && ST.edges[ek].kind !== 'sea' && !stage.includes(o)) stage.push(o);
      const room = {}; for (const z of stage) room[z] = terOf(ST.zones[z].t).front * 1.6 - TS.units.filter(v => v.z === z && v.c === C).reduce((s2, v) => s2 + ustr(v), 0);
      const idle = units.filter(u => !used.has(u) && !front.includes(u.z) && u.o > 0.3);
      for (const u of idle) {
        let best = null, bd = 1e9; for (const z of stage) { if (room[z] <= 0) continue; const d = Math.hypot(ST.zones[u.z].x - ST.zones[z].x, ST.zones[u.z].y - ST.zones[z].y); if (d < bd) { bd = d; best = z; } }
        if (best == null) break;
        const p = thPath(S, T, C, u.z, best, 'rail') || thPath(S, T, C, u.z, best, 'move'); if (!p || !p.length || p.length > 12) continue;
        order(u, { k: thPath(S, T, C, u.z, best, 'rail') ? 'rail' : 'move', p }); room[best] -= ustr(u);
      }
    }
  } else {
    // 守方的局部反击：敌军孤立突出、我方占优时
    const ctrR = (opt && opt.ctrR) || 1.8, ctrMax = opt && opt.ctrMax != null ? opt.ctrMax : 99; let nCtr = 0, ctrT = new Set();
    for (const f0 of front) for (const [t, ek] of ST.adj[f0]) {
      if (ST.edges[ek].kind === 'sea' || !hostZ(t) || !thHostile(S, C, TS.zc[t]) || boss(S, ST.zones[t].r) !== C && !thFr(S, C, boss(S, ST.zones[t].r))) continue;
      if (opt && opt.ctr && !opt.ctr(t)) continue;
      if (!ctrT.has(t) && nCtr >= ctrMax) continue;
      const Dt = thEst(S, T, TS, C, t).d * terOf(ST.zones[t].t).def;
      const here = units.filter(u => u.z === f0 && !used.has(u) && u.o > 0.55 && u.s > 0.5);
      const At = here.reduce((s, u) => s + TT[u.t].a * ustr(u) * u.q, 0);
      if (here.length && At > Dt * ctrR + 0.5) { if (!ctrT.has(t)) { ctrT.add(t); nCtr++; } for (const u of here.slice(0, Math.ceil(here.length * 0.6))) order(u, { k: 'attack', to: t }); }
    }
  }
  // —— 防守分配 ——
  const need = new Float64Array(nz), have = new Float64Array(nz);
  for (const z of front) need[z] = clamp(threat[z] * 0.85 / (terOf(ST.zones[z].t).def * (1 + 0.4 * thFortAt(TS, z))), value[z] >= 5 ? 1.5 : 0.8, 40);
  for (const z of thHoldZ(S, T, C)) if (front.includes(z)) need[z] = Math.max(need[z] * 1.8, 3); // 战略层的“死守”：多派守军
  for (const z of seaHeads) if (front.includes(z)) need[z] = Math.max(need[z], 2.5); // 滩头港口一旦丢失，上岸的部队就断了补给
  for (const v of TS.units) if (thFr(S, C, v.c) && (v.c !== C || !used.has(v))) have[v.z] += TT[v.t].d * ustr(v) * v.q;
  const free = units.filter(u => !used.has(u));
  // 机动预备队：约两成，放在威胁最大的前沿区格后方
  const totS = free.reduce((s, u) => s + ustr(u), 0); let resS = 0;
  const reserves = [];
  for (const u of free.filter(u => TT[u.t].v >= 40).sort((a, b) => ustr(b) - ustr(a))) { if (resS > totS * 0.22) break; reserves.push(u); resS += ustr(u); }
  const defenders = free.filter(u => !reserves.includes(u));
  // 缺口最大的前沿区格优先
  const fz = front.slice().sort((a, b) => (need[b] - have[b]) / (need[b] + 0.1) - (need[a] - have[a]) / (need[a] + 0.1));
  for (const z of fz) {
    if (have[z] >= need[z]) continue;
    const cand = defenders.filter(u => !used.has(u) && u.z !== z).map(u => { const surplus = front.includes(u.z) ? have[u.z] - need[u.z] : 99; return { u, surplus, d: Math.hypot(ST.zones[u.z].x - ST.zones[z].x, ST.zones[u.z].y - ST.zones[z].y) }; })
      .filter(c => c.surplus > TT[c.u.t].d * ustr(c.u) * c.u.q * 0.9).sort((a, b) => a.d - b.d);
    for (const c of cand) {
      if (have[z] >= need[z]) break;
      const p = thPath(S, T, C, c.u.z, z, ST.edges.some(e => e.rail) && c.d > 6 ? 'rail' : 'move') || thPath(S, T, C, c.u.z, z, 'move');
      if (!p || !p.length || p.length > 10) continue;
      order(c.u, { k: p.length > 2 && thPath(S, T, C, c.u.z, z, 'rail') ? 'rail' : 'move', p });
      const val = TT[c.u.t].d * ustr(c.u) * c.u.q; have[z] += val; if (front.includes(c.u.z)) have[c.u.z] -= val;
    }
  }
  for (const u of defenders) if (!used.has(u)) { const fortHere = (TS.fort[u.z] || 0) < 2 && front.includes(u.z) && threat[u.z] < have[u.z] * 0.5; if (u.ord.k !== 'hold' && u.ord.k !== 'dig' || fortHere !== (u.ord.k === 'dig')) order(u, { k: fortHere ? 'dig' : 'hold' }); }
  // 预备队位置
  const hot = front.slice().sort((a, b) => threat[b] - threat[a]).slice(0, 3);
  for (const u of reserves) {
    if (used.has(u)) continue;
    let best = u.z, bs = -1e9;
    for (const z of ST.zones) {
      if (!myZ(z.i) || hostZ(z.i)) continue; const nearHot = hot.filter(h => h === z.i || thEdge(ST, h, z.i)).length; if (!nearHot) continue;
      const sc = nearHot * 2 - (front.includes(z.i) ? 1.5 : 0) - Math.hypot(ST.zones[u.z].x - z.x, ST.zones[u.z].y - z.y) * 0.05;
      if (sc > bs) { bs = sc; best = z.i; }
    }
    if (best !== u.z) { const p = thPath(S, T, C, u.z, best, 'move'); if (p && p.length) { order(u, { k: 'move', p, back: 1 }); continue; } } // back：到位后转为预备队（命令迟滞的国家也一样）
    order(u, { k: 'reserve' });
  }
  // 空军：近距支援集中到主攻/最受威胁的区格
  if (!human || TS.staff[C]) {
    const tz = offF.length ? units.filter(u => u.ord.k === 'push' || u.ord.k === 'attack').map(u => (u.ord.k === 'attack' ? u.ord.to : u.ord.p && u.ord.p[0])).filter(z => z != null) : hot;
    const cnt = {}; for (const z of tz) cnt[z] = (cnt[z] || 0) + 1;
    const focus = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 3).map(Number);
    TS.air[C] = { sup: offF.length ? 0.4 : 0.5, cas: offF.length ? 0.5 : 0.4, int: 0.1, z: focus, iz: offF.length ? focus.slice(0, 2) : [] };
  }
}
/* 突破后的扩张目标：计划指定的终点（如海峡）> 进攻地区的首都 > 价值最高的敌占区格 */
function thObjective(S, T, TS, ST, C, from, offRegs, axis) {
  for (const z of thFocusZ(S, T, C)) if (thHostile(S, C, TS.zc[z])) { const p = thPath(S, T, C, from, z, 'push'); if (p && p.length <= 6) return z; } // 战略层指定的主攻方向优先于历史计划的轴线（离主攻目标太远时只作为评分加成）
  if (axis && axis.length) { for (let i = axis.length - 1; i >= 0; i--) if (thHostile(S, C, TS.zc[axis[i]])) return axis[i]; }
  let best = null, bs = -1e9;
  for (const z of ST.zones) {
    if (!thHostile(S, C, TS.zc[z.i]) || !offRegs.has(z.r) || z.imp) continue;
    const d = Math.hypot(ST.zones[from].x - z.x, ST.zones[from].y - z.y);
    const sc = Math.max(0.5, z.vp) * (z.cap ? 2.5 : 1) - d * 0.35;
    if (sc > bs) { bs = sc; best = z.i; }
  }
  return best;
}
function thAIdebug(S, T, C) { const TS = S.th.T[T]; S.th._dbg = []; const ST = thStatic(T); const units = TS.units.filter(u => u.c === C && !TT[u.t].fix && u.s > 0.05); thAIcountry(S, T, TS, ST, C, units, S.th.phase || 1, null, false); const d = S.th._dbg; delete S.th._dbg; return d; }

/* 只靠陆路能否回到本国或盟国的补给基地（不算港口）：用于判断是否该撤离 */
function thLandCut(S, T, TS, ST, C) {
  const nz = ST.zones.length, seen = new Uint8Array(nz), q = [];
  for (const z of ST.zones) { const owner = boss(S, z.r); if (z.dep && !z.base && TS.zc[z.i] === owner && thFr(S, C, owner) && owner !== C) { seen[z.i] = 1; q.push(z.i); } }
  if (!q.length) return null;
  while (q.length) { const a = q.shift(); for (const [b, k] of ST.adj[a]) { if (seen[b] || ST.edges[k].kind === 'sea' || !thFr(S, C, TS.zc[b])) continue; if (thEnemyIn(S, TS, b, C)) continue; seen[b] = 1; q.push(b); } }
  const cut = {}; for (let i = 0; i < nz; i++) if (!seen[i] && thFr(S, C, TS.zc[i])) cut[i] = 1;
  return cut;
}

/* 海运补给的港口：C 控制、从陆上到不了任何己方或盟国补给基地的港口区格（两栖登陆后的滩头补给全靠这里） */
function thSeaHeads(S, T, TS, ST, C) {
  if (!thSeaLink(S, T, C)) return [];
  const nz = ST.zones.length, seen = new Uint8Array(nz), q = [];
  for (const z of ST.zones) { const owner = boss(S, z.r); if (z.dep && TS.zc[z.i] === owner && thFr(S, C, owner)) { seen[z.i] = 1; q.push(z.i); } }
  while (q.length) { const a = q.shift(); for (const [b, k] of ST.adj[a]) { if (seen[b] || ST.edges[k].kind === 'sea' || !thFr(S, C, TS.zc[b]) || thEnemyIn(S, TS, b, C)) continue; seen[b] = 1; q.push(b); } }
  return ST.zones.filter(z => z.port && !seen[z.i] && TS.zc[z.i] === C && boss(S, z.r) !== C).map(z => z.i);
}
function ST_homeBreached(S, T, TS, C) { const ST = thStatic(T); return ST.zones.some(z => z.r === C && thHostile(S, C, TS.zc[z.i])); }
