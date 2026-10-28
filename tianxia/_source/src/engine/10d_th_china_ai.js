/* ===================== 精细战区 · 中国战场 AI =====================
 * 日军：关东军对苏戒备；按历史时间表发动有限目标的作战（如枣宜、中原、长沙会战，打下目标后或坚守、或撤回）；
 *       其余兵力按人口、治安度、根据地与交通线分配守备，集中兵力扫荡根据地，修碉堡、挖封锁沟；国军反攻时就地反击。
 * 国军：以通用防守 AI 为主（守备、预备队、局部反击），按历史时间表发动攻势（1939 年冬季攻势），收复日军撤出的区格。
 * 中共：躲避扫荡、破袭交通线、打击孤立据点；每支部队比较留在原地和转移到相邻区格对根据地发展的贡献，向敌后空白地带发展。
 */
function thAIChina(S, T, TS, ST, C, units, ph, R, human) {
  if (C === 'CCP') { thAICcp(S, T, TS, ST, units, ph, human); return true; }
  if (C === 'JPN') { thAIJpnCN(S, T, TS, ST, units, ph, R, human); return true; }
  if (C === 'CHN') { thAIChnCN(S, T, TS, ST, units, ph, R, human); return true; }
  return false;
}
/* 剧本里的历史作战：本季度、本阶段（含前一阶段的集结）是否有计划中的作战 */
function thCnOp(S, T, TS, C, ph) {
  const list = (TH_DATA[T].ops && TH_DATA[T].ops[C]) || [], cn = TS.cn; cn.ops = cn.ops || {};
  for (const o of list) {
    if (o.y !== S.year || o.q !== S.q || ph < o.ph[0] - 1 || ph > o.ph[1] + 1) continue;
    const st = cn.ops[o.id] = cn.ops[o.id] || { t: S.turn, u: [] };
    if (st.t !== S.turn || st.skip) continue;
    return { o, st };
  }
  return null;
}
/* 日军有限目标作战：选兵 → 集结 →（登陆）→ 沿轴线突进 → 坚守目标或撤回 */
function cnOpGo(S, T, TS, ST, C, units, ph, op, order, can) {
  const { o, st } = op, Zi = id => ST.idx[id], axis = (o.axis || []).map(Zi).filter(z => z != null), obj = Zi(o.obj);
  if (o.leave) { // 主动撤出突出部（如 1940 年秋撤出南宁）：这些区格本季度不再需要守备
    const zs = o.leave.map(Zi).filter(z => z != null), to = Zi(o.to); st.leave = zs;
    for (const u of units) if (zs.includes(u.z) && to != null) { const p = thPath(S, T, C, u.z, to, 'move'); if (p && p.length) order(u, { k: 'move', p }); }
    return;
  }
  if (!axis.length) { st.skip = 1; return; }
  if (!st.u.length) {
    let stage = o.land ? Zi(o.from) : axis[0];
    if (!o.land && thHostile(S, C, TS.zc[stage])) { const f = ST.adj[stage].map(([z]) => z).filter(z => TS.zc[z] === C).sort((a, b) => (axis.includes(b) ? 1 : 0) - (axis.includes(a) ? 1 : 0))[0]; stage = f; }
    if (stage == null || TS.zc[stage] !== C) { st.skip = 1; return; }
    const cand = units.filter(u => (!o.ag || o.ag.includes(u.ag)) && u.t !== 'pup' && u.s > 0.5 && u.o > 0.4)
      .map(u => ({ u, d: u.z === stage ? 0 : ((thPath(S, T, C, u.z, stage, 'rail') || thPath(S, T, C, u.z, stage, 'move') || { length: 99 }).length) }))
      .filter(c => c.d < 12).sort((a, b) => a.d - b.d || ustr(b.u) - ustr(a.u));
    const pick = []; for (const c of cand) { if (pick.length >= o.n) break; if (!can || can(c.u)) pick.push(c.u); }
    if (can && pick.length < Math.max(2, Math.ceil(o.n * 0.5))) for (const c of cand) { if (pick.length >= o.n) break; if (!pick.includes(c.u) && can(c.u, 1)) pick.push(c.u); } // 兵力不够时再从守备上抽一些（史实：南宁作战从华北调来第 5 师团）
    if (pick.length < Math.max(2, Math.ceil(o.n * 0.5))) { st.skip = 1; return; }
    st.u = pick.map(u => u.id); st.stage = stage; TS.cn.q.jpOff = 1;
    if (TS._pev) TS._pev.push({ k: 'op', z: obj ?? axis[axis.length - 1], c: C, d: S.th.day, id: o.id });
  }
  const mine = st.u.map(id => units.find(u => u.id === id)).filter(Boolean); if (!mine.length) return;
  const done = obj != null && TS.zc[obj] === C;
  if (done && !st.got) st.got = ph;
  const withdraw = !o.hold && ((st.got && ph > st.got) || ph > o.ph[1]);
  if (ph < o.ph[0]) { // 集结
    for (const u of mine) { if (u.z === st.stage) { order(u, { k: 'hold' }); continue; } const pr = thPath(S, T, C, u.z, st.stage, 'rail'), p = pr && pr.length ? pr : thPath(S, T, C, u.z, st.stage, 'move'); if (p && p.length) order(u, { k: pr && pr.length ? 'rail' : 'move', p }); }
    return;
  }
  if (withdraw) { // 打了就撤：退回出发阵地（沿途占领的区格不留守备）
    for (const u of mine) { if (u.z === st.stage || !thFr(S, C, TS.zc[st.stage])) { order(u, { k: 'hold' }); continue; } const p = thPath(S, T, C, u.z, st.stage, 'move'); if (p && p.length) order(u, { k: 'move', p }); else order(u, { k: 'hold' }); }
    st.ret = 1; return;
  }
  if (o.land && !st.landed) { // 两栖登陆（需要制海权）
    const lz = Zi(o.land);
    if (lz == null || !thSeaLink(S, T, C) || !thHostile(S, C, TS.zc[lz])) { st.skip = 1; return; }
    for (const u of mine) { u.z = lz; u.mv = 0; u.o = Math.min(u.o, 0.8); delete u.nx; }
    st.landed = 1; (TS._bh = TS._bh || {})[lz] = C;
    if (TS._pev) TS._pev.push({ k: 'land', z: lz, c: C, d: S.th.day });
  }
  if (done && o.hold) { // 坚守：分驻目标区格
    const hz = [].concat(o.hold === 1 ? [o.obj] : o.hold).map(Zi).filter(z => z != null && TS.zc[z] === C);
    mine.forEach((u, i) => { const z = hz.length ? hz[i % hz.length] : u.z; if (u.z === z) order(u, { k: 'hold' }); else { const p = thPath(S, T, C, u.z, z, 'move'); if (p && p.length) order(u, { k: 'move', p }); else order(u, { k: 'hold' }); } });
    return;
  }
  for (const u of mine) { // 沿轴线逐格突进
    if (u.o < 0.25 || u.s < 0.25) { order(u, { k: 'hold' }); continue; }
    const k = axis.findIndex(z => thHostile(S, C, TS.zc[z]) || thEnemyIn(S, TS, z, C)); if (k < 0) { order(u, { k: 'hold' }); continue; }
    const head = thPath(S, T, C, u.z, axis[k], 'push'); if (!head || !head.length || head.length > 7) { order(u, { k: 'hold' }); continue; }
    const p = head.slice(); for (let j = k + 1; j < axis.length; j++) { if (!thEdge(ST, p[p.length - 1], axis[j])) break; p.push(axis[j]); }
    order(u, { k: 'push', p, to: p[p.length - 1] });
  }
}

/* ---------- 日军 ---------- */
function thAIJpnCN(S, T, TS, ST, units, ph, R, human) {
  const C = 'JPN', Z = ST.zones, nz = Z.length, used = new Set(), jp = TS.cn.jp;
  const order = (u, o) => { thSetOrder(S, T, u, o, 'ai'); used.add(u); };
  const keep = (u, k) => { if (u.ord.k !== k || (u.ord.p && u.ord.p.length)) order(u, { k }); else used.add(u); };
  const kwa = u => u.ag === 'KW' || u.ag === 'KR';
  for (const u of units) if (!u.ag) { const z = Z[u.z]; u.ag = z.r === 'PRK' || z.r === 'KOR' ? 'KR' : /^M/.test(z.id) ? 'KW' : z.lat >= 33.6 ? 'NC' : z.lon <= 117.5 && z.lat >= 27.5 ? 'CC' : z.lat >= 29 && z.lon > 117.5 ? 'CC' : 'SC'; } // 新编部队按所在地区编入方面军
  // 关东军、朝鲜军：对苏戒备；对苏开战后交给通用 AI 防守
  const kw = units.filter(kwa);
  if (thHostile(S, C, 'RUS') || thHostile(S, C, 'MNG')) { thAIcountry(S, T, TS, ST, C, kw, ph, R, human, true); for (const u of kw) used.add(u); }
  else for (const u of kw) keep(u, u.ord.k === 'dig' ? 'dig' : 'hold');
  const opL = thCnOp(S, T, TS, C, ph), leave = new Set(opL && opL.o.leave ? opL.o.leave.map(id => ST.idx[id]) : []);
  // 需求：守备（人口、治安、根据地、交通线）+ 前线（与国军接壤）；重要性：城市、枢纽、港口、铁路、前线
  const rails = cnRail(ST), need = new Float64Array(nz), have = new Float64Array(nz), imp = new Float64Array(nz), front = [];
  const dvOf = u => TT[u.t].d * ustr(u) * u.q;
  for (const z of Z) {
    if (TS.zc[z.i] !== C || z.base) continue;
    const g = cnZ(z) ? 0.25 + TS.pop[z.i] * 0.05 * (1.15 - TS.jc[z.i] / 100) + TS.base[z.i] / 100 * 1.4 + (z.hub ? 0.4 : 0) + rails[z.i] * 0.15 : 0.1;
    let t = 0; for (const [o, k] of ST.adj[z.i]) if (ST.edges[k].kind !== 'sea' && thHostile(S, C, TS.zc[o])) t += thEst(S, T, TS, C, o).a * (TS.zc[o] === 'CCP' ? 0.4 : 1);
    if (t > 0) front.push(z.i);
    need[z.i] = leave.has(z.i) ? 0 : g * 1.3 + t * 0.7 / (terOf(z.t).def * (1 + 0.4 * thFortAt(TS, z.i)));
    if (z.t === 'mount' && TS.base[z.i] >= 45 && !t) need[z.i] *= 0.25; // 中共的山区根据地：扫荡过后不值得长期驻守
    imp[z.i] = Math.max(0.5, z.vp) * 2 + TS.pop[z.i] * 0.3 + rails[z.i] + (z.hub ? 3 : 0) + (z.port ? 2 : 0) + (t > 0 ? 3 : 0);
  }
  for (const v of TS.units) if (v.c === C) have[v.z] += dvOf(v);
  // 历史作战：只抽调守备有余的部队（重要城市不唱空城计）
  const op = thCnOp(S, T, TS, C, ph);
  const isFront = new Uint8Array(nz); for (const z of front) isFront[z] = 1;
  const lastHere = u => isFront[u.z] && !TS.units.some(v => v !== u && v.c === C && v.z === u.z && v.t !== 'pup' && !(used.has(v) && v.ord.p && v.ord.p.length));
  if (op) { const can = (u, relax) => { if (TS.zc[u.z] === C && (have[u.z] - dvOf(u) < (relax ? 0.2 : 0.4) * need[u.z] || lastHere(u))) return false; have[u.z] -= dvOf(u); return true; }; cnOpGo(S, T, TS, ST, C, units.filter(u => !used.has(u)), ph, op, order, can); }
  have.fill(0); for (const v of TS.units) if (v.c === C && !(used.has(v) && v.ord.p && v.ord.p.length)) have[v.z] += dvOf(v);
  // 扫荡：根据地最强、游击队最多、威胁交通线的地方（不进入陕甘宁边区）
  const sw = [];
  for (const z of Z) {
    if (!cnZ(z) || z.r === 'CCP') continue; const c = TS.zc[z.i];
    if (!(c === C || (thHostile(S, C, c) && ST.adj[z.i].some(([o, k]) => TS.zc[o] === C && ST.edges[k].kind !== 'sea')))) continue;
    if (c === 'CHN') continue;
    const G = TS.units.filter(u => u.z === z.i && TT[u.t].gue && thHostile(S, C, u.c)).reduce((s, u) => s + ustr(u), 0);
    if (G < 0.3 && TS.base[z.i] < 35) continue;
    sw.push({ z: z.i, G, sc: (TS.base[z.i] / 100 + 0.2) * (G + 0.3) * (1 + TS.heat[z.i] * 0.4) * (1 + rails[z.i] * 0.25) * (c === 'CCP' ? 1.3 : 1) });
  }
  sw.sort((a, b) => b.sc - a.sc);
  const nSw = jp.drive ? 3 : 2;
  for (const t of sw.slice(0, nSw)) {
    const want = Math.max(3, t.G * 2.6); let got = 0;
    const cand = units.filter(u => !used.has(u) && !kwa(u) && u.s > 0.4 && u.o > 0.45 && (u.t !== 'pup' || u.z === t.z)).map(u => {
      const p = u.z === t.z ? [] : thPath(S, T, C, u.z, t.z, 'move'); if (p == null || p.length > 3) return null; // 只经过己方区格前往扫荡目标
      const dv = TT[u.t].d * ustr(u) * u.q; return { u, p, d: p.length, sur: have[u.z] - need[u.z], dv };
    }).filter(c => c && (c.d === 0 || (c.sur > c.dv * 0.4 && !lastHere(c.u)))).sort((a, b) => a.d - b.d || b.sur - a.sur);
    if (cand.reduce((s, c) => s + TT[c.u.t].a * ustr(c.u) * c.u.q, 0) < want * 0.6) continue; // 兵力不够就不扫
    for (const c of cand) { if (got >= want) break; order(c.u, { k: 'sweep', to: t.z, p: c.p, d: TH_DAYS }); got += TT[c.u.t].a * ustr(c.u) * c.u.q * (0.4 + 0.6 * c.u.o); have[c.u.z] -= c.dv; }
  }
  // 守备与前线：按重要性 × 缺口排序；兵力不足时放弃次要区格、保住城市与交通线（铁路优先；伪军只在附近调动）
  const gap = z => imp[z] * Math.max(0, 1 - have[z] / Math.max(0.01, need[z]));
  const zs = Z.filter(z => TS.zc[z.i] === C && !z.base && need[z.i] > 0).map(z => z.i).sort((a, b) => gap(b) - gap(a));
  for (const z of zs) {
    if (have[z] >= need[z] * 0.95) continue;
    const cand = units.filter(u => !used.has(u) && u.z !== z && !kwa(u) && TS.zc[u.z] === C && !lastHere(u)).map(u => { const dv = dvOf(u), z0 = u.z, after = have[z0] - dv; const ok = after >= need[z0] || (imp[z0] < imp[z] * 0.7 && after >= 0.45 * need[z0]); return ok ? { u, dv, d: Math.hypot(Z[z0].x - Z[z].x, Z[z0].y - Z[z].y) } : null; }).filter(Boolean).sort((a, b) => a.d - b.d);
    for (const c of cand) {
      if (have[z] >= need[z]) break;
      const pr = thPath(S, T, C, c.u.z, z, 'rail'), p = pr && pr.length ? pr : thPath(S, T, C, c.u.z, z, 'move');
      if (!p || !p.length || p.length > (c.u.t === 'pup' ? 2 : 10)) continue;
      order(c.u, { k: pr && pr.length > 1 ? 'rail' : 'move', p }); have[z] += c.dv; have[c.u.z] -= c.dv;
    }
  }
  // 反击：近一年内被国军夺去的区格（史实：冬季攻势中丢失的据点，日军总在几周内组织反攻夺回），先打能恢复被围守军补给的、再打价值高的；
  // 兵力从相邻区格直接进攻，不够时从两三格内守备有余的部队抽调（沿己方区格推进）
  const lostT = t => TS.zc[t] === 'CHN' && ((TS.jz0 && TS.jz0[t]) || (TS.jlost && S.turn - TS.jlost[t] <= 3));
  const cut = new Set(); for (const u of TS.units) if (u.c === C && u.sp < 0.3 && !kwa(u)) for (const [o] of ST.adj[u.z]) cut.add(o); // 打通被围守军的补给线
  const tg = [];
  for (const z of front) for (const [t, k] of ST.adj[z]) if (ST.edges[k].kind !== 'sea' && lostT(t) && !tg.some(x => x.t === t)) tg.push({ t, v: (cut.has(t) ? 20 : 0) + Math.max(0.5, Z[t].vp) * 2 + rails[t] + (Z[t].hub ? 3 : 0) });
  tg.sort((a, b) => b.v - a.v);
  for (const { t } of tg.slice(0, 3)) {
    const Dt = thEst(S, T, TS, C, t).d * terOf(Z[t].t).def * (1 + 0.4 * (TS.fort[t] || 0)) + 0.2;
    const cand = units.filter(u => !used.has(u) && !kwa(u) && u.o > 0.5 && u.s > 0.45 && u.t !== 'pup' && TS.zc[u.z] === C).map(u => {
      if (thEdge(ST, u.z, t)) return { u, p: null, d: 1 };
      if (lastHere(u) || have[u.z] - dvOf(u) < 0.45 * need[u.z]) return null;
      const p = thPath(S, T, C, u.z, t, 'push'); return p && p.length <= 4 && p.slice(0, -1).every(z => TS.zc[z] === C) ? { u, p, d: p.length } : null;
    }).filter(Boolean).sort((a, b) => a.d - b.d);
    let At = 0; const go = [];
    for (const c of cand) { if (At > Dt * 2.4) break; go.push(c); At += TT[c.u.t].a * ustr(c.u) * c.u.q * (0.4 + 0.6 * c.u.o); }
    if (!go.length || At < Dt * 1.6) continue;
    for (const c of go) { if (c.p) { order(c.u, { k: 'push', p: c.p, to: t }); have[c.u.z] -= dvOf(c.u); } else order(c.u, { k: 'attack', to: t }); }
  }
  // 其余：驻守；有根据地活动的地方修碉堡、挖封锁沟
  for (const u of units) if (!used.has(u)) keep(u, jp.cage && TS.base[u.z] > 10 && TS.zc[u.z] === C ? 'dig' : 'hold');
  if (!human || TS.staff[C]) {
    const cnt = {}; for (const u of units) { const z = u.ord.k === 'attack' || u.ord.k === 'sweep' ? u.ord.to : u.ord.k === 'push' && u.ord.p ? u.ord.p[0] : null; if (z != null) cnt[z] = (cnt[z] || 0) + (u.ord.k === 'sweep' ? 0.5 : 1); }
    TS.air[C] = { sup: 0.35, cas: 0.55, int: 0.1, z: Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 3).map(Number), iz: [] };
  }
}

/* ---------- 国军 ---------- */
function thAIChnCN(S, T, TS, ST, units, ph, R, human) {
  const C = 'CHN', Z = ST.zones, used = new Set(), uf = S.th.uf;
  const order = (u, o) => { thSetOrder(S, T, u, o, 'ai'); used.add(u); };
  // 敌后的国军（游击部队）原地坚持
  for (const u of units) if (TT[u.t].gue) { if (u.ord.k !== 'guer' && !(u.ord.p && u.ord.p.length)) order(u, { k: 'guer' }); else used.add(u); }
  // 历史攻势（如 1939 年冬季攻势）
  const op = thCnOp(S, T, TS, C, ph);
  if (op && ph >= op.o.ph[0] && ph <= op.o.ph[1]) for (const id of op.o.targets || []) {
    const t = ST.idx[id]; if (t == null || !thHostile(S, C, TS.zc[t])) continue;
    const Dt = thEst(S, T, TS, C, t).d * terOf(Z[t].t).def * (1 + 0.4 * thFortAt(TS, t)) + 0.3;
    const att = []; for (const [o, k] of ST.adj[t]) if (ST.edges[k].kind !== 'sea' && TS.zc[o] === C) for (const u of units) if (!used.has(u) && u.z === o && u.o > 0.5 && u.s > 0.5 && !TT[u.t].gue) att.push(u);
    const At = att.reduce((s, u) => s + TT[u.t].a * ustr(u) * u.q, 0);
    if (att.length && At >= Dt * (op.o.r || 0.7)) { for (const u of att.slice(0, Math.max(1, Math.ceil(att.length * 0.6)))) order(u, { k: 'attack', to: t }); TS.cn.q.chnOff = 1; }
  }
  // 内战：进攻相邻的、守备较弱的中共区格
  if (uf && uf.civil) for (const z of Z) {
    if (TS.zc[z.i] !== 'CCP' || z.imp) continue;
    const Dt = thEst(S, T, TS, C, z.i).d * terOf(z.t).def + 0.3, att = [];
    for (const [o, k] of ST.adj[z.i]) if (ST.edges[k].kind !== 'sea' && TS.zc[o] === C) for (const u of units) if (!used.has(u) && u.z === o && u.o > 0.5 && u.s > 0.5 && !TT[u.t].gue) att.push(u);
    const At = att.reduce((s, u) => s + TT[u.t].a * ustr(u) * u.q, 0);
    if (att.length && At >= Dt * 1.3) for (const u of att.slice(0, Math.ceil(att.length * 0.6))) order(u, { k: 'attack', to: z.i });
  }
  // 收复日军撤出的区格（中共根据地已经很巩固的地方除外，避免摩擦）
  for (const z of Z) {
    if (!cnZ(z) || !thHostile(S, C, TS.zc[z.i]) || thEnemyIn(S, TS, z.i, C) || boss(S, z.r) !== C || TS.base[z.i] >= 40 || TS.jc[z.i] >= 40) continue; // 治安区里有伪政权、警备队与碉堡，并不是“空城”
    const u = units.filter(v => !used.has(v) && !TT[v.t].gue && thEdge(ST, v.z, z.i) && TS.zc[v.z] === C && v.o > 0.4 && v.s > 0.4).sort((a, b) => ustr(b) - ustr(a))[0];
    if (u) order(u, { k: 'attack', to: z.i });
  }
  // 其余交给通用防守 AI；只有在兵力远超日军（或战争末期）时才允许全面反攻。
  // 局部反击（史实：国军缺乏火炮与弹药，反击多限于夺回刚失去的城镇，如 1939 年南昌、1940 年宜昌）：只打本季度刚被日军夺去的区格，需要 2.6 倍兵力，每阶段至多两处
  const my = TS.units.filter(u => u.c === C).reduce((s, u) => s + TT[u.t].a * ustr(u) * u.q, 0), jpS = TS.units.filter(u => u.c === 'JPN' && !thAux(u)).reduce((s, u) => s + TT[u.t].a * ustr(u) * u.q, 0);
  const ctr = t => !!TS.jz0 && !TS.jz0[t];
  thAIcountry(S, T, TS, ST, C, units.filter(u => !used.has(u)), ph, R, human, !(S.year >= 1945 || my > 2.6 * jpS), uf && uf.civil ? null : ['CCP'], { ctr, ctrR: 2.6, ctrMax: 2 });
}

/* ---------- 中共 ---------- */
/* 一个区格在给定中共兵力下每天的根据地收益（发展 + 维持），按人口加权 */
function cnZoneVal(S, TS, ST, z, g, gj) {
  if (g <= 0.05) return 0;
  const Zz = ST.zones[z], ctl = TS.zc[z], b = TS.base[z], uf = S.th.uf, pol = TS.cn.pol, jpHeld = ctl === 'JPN', kmtHeld = ctl === 'CHN';
  const pres = g / (g + 0.6), opp = jpHeld ? gj / (gj + 1.2) : 0;
  const kmt = kmtHeld ? (uf.fr >= 60 || pol.exp ? 0.5 : 0.15) : 1;
  const grow = 0.42 * pres * (CN_GROW[Zz.t] || 1) * kmt * (1 - 0.7 * opp) * (1 - 0.6 * TS.bh[z]) * (1 - b / 100);
  const keepV = (jpHeld ? 0.05 + 0.12 * gj / (gj + 1) : 0.03) * b / 100;
  const safety = jpHeld ? 1 / (1 + gj * 0.3 / (CN_EVADE[Zz.t] || 1)) : 1;
  return (grow + keepV) * Math.pow(Math.max(0.2, TS.pop[z]), 0.6) * safety;
}
function thAICcp(S, T, TS, ST, units, ph, human) {
  const C = 'CCP', Z = ST.zones, nz = Z.length, used = new Set(), cn = TS.cn, uf = S.th.uf;
  const order = (u, o) => { thSetOrder(S, T, u, o, 'ai'); used.add(u); };
  const keep = (u, k) => { if (u.ord.k !== k || (u.ord.p && u.ord.p.length)) order(u, { k }); else used.add(u); };
  const gJ = new Float64Array(nz), gC = new Float64Array(nz), swz = new Set();
  for (const v of TS.units) { const f = thHostile(S, C, v.c); if (f && !TT[v.t].gue) gJ[v.z] += ustr(v) * (v.t === 'pup' ? 0.5 : 1); if (v.c === C) gC[v.z] += ustr(v); if (f && v.ord.k === 'sweep' && v.ord.to != null) swz.add(v.ord.to); }
  const camp = cn.camp && S.turn <= cn.camp.until, rails = cnRail(ST);
  // 0) 陕甘宁边区：留守兵团守延安；边区受到威胁时就地防守
  const home = Z.filter(z => z.r === 'CCP').map(z => z.i), homeThreat = home.some(z => ST.adj[z].some(([o]) => thEnemyIn(S, TS, o, C)));
  for (const u of units) if (/留守/.test(u.n[0]) || (homeThreat && home.includes(u.z))) keep(u, 'hold');
  // 1) 北移令：江南的新四军部队渡江北上（军部行动迟缓——历史上因此在茂林遭到围攻）
  if (uf.north) { const south = new Set(CN_SOUTH.map(id => ST.idx[id])), dests = CN_NORTH.map(id => ST.idx[id]).filter(z => z != null);
    for (const u of units) if (!used.has(u) && u.ag === 'N4A' && south.has(u.z) && !/军部/.test(u.n[0])) { let best = null; for (const z of dests) { const p = thPath(S, T, C, u.z, z, 'inf'); if (p && (!best || p.length < best.length)) best = p; } if (best) order(u, { k: 'move', p: best, to: best[best.length - 1] }); } }
  // 2) 反扫荡：所在区格正被扫荡，或日伪军远强于我且群众基础薄弱 → 跳到相邻根据地
  const swArr = new Array(nz).fill(0); for (const z of swz) swArr[z] = 1;
  for (const u of units) {
    if (used.has(u) || !TT[u.t].gue) continue;
    const danger = swz.has(u.z) || (thHostile(S, C, TS.zc[u.z]) && gJ[u.z] > 2.5 * gC[u.z] && TS.base[u.z] < 40);
    if (!danger) continue;
    const to = cnEscape(S, T, TS, ST, u, swArr); if (to != null) { order(u, { k: 'move', p: [to], to }); gC[u.z] -= ustr(u); gC[to] += ustr(u); }
  }
  // 3) 破袭交通线：日占区格有铁路、守备相对薄弱；百团大战期间全面展开
  for (const z of Z) {
    if (!cnZ(z) || !thHostile(S, C, TS.zc[z.i]) || !rails[z.i]) continue;
    const odds = gC[z.i] / (gJ[z.i] + 0.3);
    const go = camp ? odds > 0.4 : odds > 1.2 && TS.base[z.i] > 20 && TS.sab[z.i] < 0.4 && thHash(S.seed, S.turn, ph, z.i, 41) < 0.35;
    if (!go) continue;
    for (const u of units) if (!used.has(u) && u.z === z.i && TT[u.t].gue && u.o > 0.55 && u.s > 0.4) order(u, { k: 'raid' });
    if (camp) for (const [o, k] of ST.adj[z.i]) if (ST.edges[k].kind !== 'sea') for (const u of units) if (!used.has(u) && u.z === o && TT[u.t].gue && u.o > 0.6 && u.s > 0.5 && gC[o] > 1.2 && gC[z.i] < 2.5 && !home.includes(o)) { order(u, { k: 'raid', p: [z.i], to: z.i }); gC[o] -= ustr(u); gC[z.i] += ustr(u); }
  }
  // 4) 拔除孤立据点：伪军或小股日军，我方占压倒优势且群众基础好
  for (const z of Z) {
    if (!cnZ(z) || !thHostile(S, C, TS.zc[z.i]) || gJ[z.i] <= 0 || gJ[z.i] > 0.9 || TS.base[z.i] < 30) continue;
    const Dt = thEst(S, T, TS, C, z.i).d * terOf(z.t).def + 0.15;
    const here = units.filter(u => !used.has(u) && u.z === z.i && TT[u.t].gue && u.o > 0.6 && u.s > 0.5), At = here.reduce((s, u) => s + TT[u.t].a * ustr(u) * u.q, 0);
    if (here.length && At > Dt * 2.5) for (const u of here) order(u, { k: 'attack', to: z.i });
  }
  // 5) 发展：比较留在原地与转移到相邻区格对根据地的贡献，向敌后空白地带发展
  for (const u of units.filter(u => !used.has(u) && TT[u.t].gue).sort((a, b) => ustr(b) - ustr(a))) {
    const w = ustr(u), cur = u.z;
    const here = cnZoneVal(S, TS, ST, cur, gC[cur], gJ[cur]) - cnZoneVal(S, TS, ST, cur, gC[cur] - w, gJ[cur]);
    let best = null, bv = here * 1.3 + 0.002;
    for (const [o, k] of ST.adj[cur]) {
      if (ST.edges[k].kind === 'sea' || !cnZ(Z[o]) || swz.has(o)) continue; const c = TS.zc[o]; if (!(thFr(S, C, c) || thHostile(S, C, c))) continue;
      const v = cnZoneVal(S, TS, ST, o, gC[o] + w, gJ[o]) - cnZoneVal(S, TS, ST, o, gC[o], gJ[o]);
      if (v > bv) { bv = v; best = o; }
    }
    if (best != null) { order(u, { k: 'move', p: [best], to: best }); gC[cur] -= w; gC[best] += w; }
    else keep(u, 'guer');
  }
  for (const u of units) if (!used.has(u)) keep(u, TT[u.t].gue ? 'guer' : 'hold');
}
