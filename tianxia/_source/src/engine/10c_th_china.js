/* ===================== 精细战区 · 中国战场：敌后根据地、游击与扫荡、伪军、统一战线 =====================
 * 只在中国战场（TS.base 存在）工作。区格的控制（TS.zc）表示县城、铁路与公路在谁手里——日军的“点线”占领；在此之上：
 *   jc   日军治安度 0–100：守备兵力、碉堡与伪政权使其上升，根据地与破袭使其下降；决定伪军来源。
 *   base 中共根据地 0–100：有八路军、新四军活动的地方逐日发展（减租减息、“三三制”政权、民兵），日军驻守、扫荡、碉堡使其萎缩；
 *        根据地达到一半以上、而日伪军撤走的区格由中共收复。
 *   kg   国民党敌后游击力量 0–100（冀察、鲁苏战区等）。
 *   sab  铁路破袭 0–1（削减日军的铁路运力）；bh 碉堡与封锁沟 0–1（“囚笼政策”，阻碍游击队转移与根据地发展）。
 *   pop  人口（百万）：根据地人口决定中共的兵源与经济（回写战略层）。
 * 统一战线 S.th.uf：摩擦 fr 0–100、军饷 sub、封锁 block 0–2、北移令 north、已发生的事件 ev。
 * 史料：research/ccp.md、china_geo.md（《中国共产党历史》第一卷、Van Slyke《剑桥中华民国史》、Benton《新四军》、
 *       Hsu & Chang《中日战争史》、Peattie/Drea/van de Ven《中国之战》、Mitter《被遗忘的盟友》）。
 */
const CN_GROW = { mount: 1.25, hills: 1.05, forest: 1.1, marsh: 1.1, plain: 0.85, urban: 0.35 };   // 地形对根据地发展的影响
const CN_EVADE = { mount: 2, hills: 1.4, forest: 1.6, marsh: 1.5, plain: 0.8, urban: 0.6 };        // 地形对游击队躲避扫荡的影响
const CN_SOUTH = ['CWN', 'JNJ', 'JSH', 'JHZ', 'JND', 'CJH', 'CSR', 'JWZ'];                           // 长江以南（北移令所指）
const CN_NORTH = ['JSB', 'JSZ', 'CHF', 'CBB'];                                                      // 新四军北移的目的地（苏北、皖东）
const CN_RATE = 0.2; // 根据地发展速度（每天，满员时）
const cnZ = z => (z.r === 'CHN' || z.r === 'CCP') && !z.imp && !z.base;
const thGueRoot = (TS, v, z) => (v.c === 'CCP' ? TS.base[z] || 0 : TS.kg ? TS.kg[z] || 0 : 0);
function thGueSup(S, TS, u) { const z = u.z, own = thFr(S, u.c, TS.zc[z]); return clamp((own ? 0.5 : 0.3) + 0.6 * thGueRoot(TS, u, z) / 100 - 0.35 * (TS.bh[z] || 0), 0.2, 1); }
/* 敌后的国统区（山东沂蒙、大别山、苏北等）：省政府与地方部队就地筹粮，被包围也不会很快断粮 */
function thCnSupFloor(S, TS, u, g) { return u.c === 'CHN' && TS.zc[u.z] === 'CHN' ? Math.max(g, 0.42) : g; }
function cnRail(ST) { return ST._cnRail || (ST._cnRail = ST.zones.map(z => ST.adj[z.i].filter(([, k]) => ST.edges[k].rail > 0).length)); }
const cnYQ = S => S.year * 4 + S.q - 1;

/* ---------- 初始化 ---------- */
function thChinaInit(S, TS, ST, D) {
  const n = ST.zones.length, Z0 = () => new Array(n).fill(0);
  TS.jc = Z0(); TS.base = Z0(); TS.kg = Z0(); TS.sab = Z0(); TS.bh = Z0(); TS.heat = Z0(); TS.jlost = new Array(n).fill(-99); // jlost：日军失去该区格的回合（用于组织反攻）
  TS.pop = ST.zones.map(z => z.pop || 0);
  const put = (arr, obj) => { for (const [id, v] of Object.entries(obj || {})) if (ST.idx[id] != null) arr[ST.idx[id]] = v; };
  put(TS.jc, D.jc0); put(TS.base, D.base0); put(TS.kg, D.kg0); put(TS.bh, D.bh0);
  TS.jcF = ST.zones.map(z => { const v = (D.jc0 || {})[z.id] || 0; return v >= 60 ? Math.round(v * 0.6) : 0; }); // 伪政权（伪满、蒙疆、华北与南京伪政府）在核心占领区维持的基本治安
  for (const [a, b, d] of D.rail0 || []) { const e = thEdge(ST, ST.idx[a], ST.idx[b]); if (e) TS.dmg[e.k] = d; }
  TS.cn = { pol: { rent: 1 }, camp: null, jp: { cage: 0, drive: 0 }, ops: {}, q: {}, lastQ: {}, stat: [], P: 0 };
  S.th.uf = { fr: 38, sub: 1, block: 1, north: null, ev: {}, log: [] };
  TS.cn.P = +cnPopP(S, TS, ST).toFixed(2); // 只用于显示；每季度开始时重新计算
}
/* 区格易手时的附带变化 */
function thChinaCapture(S, T, TS, ST, z, newC, old) {
  if (old === 'JPN' && newC !== 'JPN' && TS.jlost) TS.jlost[z] = S.turn;
  if (newC === 'JPN') { TS.jc[z] = Math.max(TS.jc[z] || 0, 25); TS.base[z] *= 0.85; TS.kg[z] *= 0.8; }
  else { TS.jc[z] = 0; TS.bh[z] = 0; TS.sab[z] = 0; if (newC === 'CCP') TS.base[z] = Math.max(TS.base[z], 50); }
}
/* 陕甘宁边区失守而敌后根据地仍在时，中共不会被“征服” */
function thChinaNoConquer(S, T, TS, ST, Rg) {
  if (Rg !== 'CCP') return false;
  const bases = ST.zones.filter(z => cnZ(z) && z.r !== 'CCP' && TS.base[z.i] >= 50).length;
  const str = TS.units.filter(u => u.c === 'CCP').reduce((s, u) => s + ustr(u), 0);
  return bases >= 2 || str >= 8;
}
/* 中共新部队：在人口多、根据地巩固而兵力相对少的地方就地扩军 */
function thCcpSpawnZone(S, T, TS, ST) {
  let best = null, bs = 0;
  for (const z of ST.zones) {
    if (!cnZ(z)) continue; const b = TS.base[z.i]; if (b < 35) continue;
    if (thHostile(S, 'CCP', TS.zc[z.i]) && b < 55 && thEnemyIn(S, TS, z.i, 'CCP')) continue;
    const here = TS.units.reduce((s, u) => s + (u.z === z.i && u.c === 'CCP' ? ustr(u) : 0), 0);
    const sc = b * Math.max(0.3, TS.pop[z.i]) / (1 + here);
    if (sc > bs) { bs = sc; best = z.i; }
  }
  return best;
}
/* 对某区格内满足条件的部队造成损失（w：师当量），org：组织度损失 */
function cnHurt(S, T, TS, z, C, w, sel, org, why) {
  if (!(w > 0)) return 0;
  const list = TS.units.filter(u => u.z === z && u.c === C && u.s > 0.05 && sel(u)); if (!list.length) return 0;
  const tot = list.reduce((s, u) => s + ustr(u), 0) || 1; let done = 0; const lost = {};
  for (const u of list) { const ds = Math.min(u.s * 0.25, w * ustr(u) / tot / uw(u)); u.s -= ds; done += ds * uw(u); if (!thAux(u)) lost[u.c] = (lost[u.c] || 0) + ds * uw(u); if (org) u.o = Math.max(0, u.o - org); }
  if (why) { const lc = TS._lc = TS._lc || {}; (lc[C] = lc[C] || {})[why] = (lc[C][why] || 0) + done; }
  thLoss(S, T, TS, lost, z, null, C);
  return done;
}
/* 躲避扫荡：转移到相邻的、没有被扫荡的根据地或山区 */
function cnEscape(S, T, TS, ST, u, sw) {
  let best = null, bs = -1e9;
  for (const [o, k] of ST.adj[u.z]) {
    const z = ST.zones[o]; if (ST.edges[k].kind === 'sea' || z.imp || !cnZ(z) || sw[o] > 0) continue;
    const c = TS.zc[o]; if (!(thFr(S, u.c, c) || thHostile(S, u.c, c))) continue;
    const sc = thGueRoot(TS, u, o) / 25 + (CN_EVADE[z.t] || 1) - (thEnemyIn(S, TS, o, u.c) ? 1.5 : 0) + (thFr(S, u.c, c) ? 0.5 : 0) + rnd(S) * 0.5;
    if (sc > bs) { bs = sc; best = o; }
  }
  return best;
}

/* ---------- 每日：根据地、治安、破袭、扫荡、碉堡、收复、摩擦 ---------- */
function thCcpDay(S, T, TS, ST, R, d) {
  const Z = ST.zones, n = Z.length, uf = S.th.uf, cn = TS.cn, ev = TS._pev || [];
  if (d % TH_DAYS === 0) cn._sw = {};
  const jpK = thHostile(S, 'JPN', 'CHN'), foe = c => thHostile(S, 'CCP', c), civil = !!uf.civil; // foe：中共的敌人（日军；内战时还有国军）
  const gJ = new Array(n).fill(0), gC = new Array(n).fill(0), gK = new Array(n).fill(0), gN = new Array(n).fill(0), sw = new Array(n).fill(0), rd = new Array(n).fill(0), dg = new Array(n).fill(0);
  for (const u of TS.units) {
    if (u.s < 0.05) continue; const w = ustr(u), z = u.z, mov = !!(u.ord.p && u.ord.p.length);
    if (u.c === 'CCP') { gC[z] += TT[u.t].gue ? w : w * 0.6; if (u.ord.k === 'raid' && !mov) rd[z] += w * (0.3 + 0.7 * u.o); continue; }
    if (foe(u.c) && !TT[u.t].gue) { if (!mov) gJ[z] += w * (u.t === 'pup' ? 0.7 : 1); if (u.ord.k === 'sweep' && u.ord.to === z && !mov) sw[z] += TT[u.t].a * w * u.q * (0.4 + 0.6 * u.o); if (u.ord.k === 'dig') dg[z] += w; }
    if (u.c === 'CHN') { gN[z] += w; if (jpK && (TT[u.t].gue || thHostile(S, 'CHN', TS.zc[z]))) gK[z] += w; }
  }
  const pol = cn.pol, jp = cn.jp, camp = cn.camp && S.turn <= cn.camp.until ? cn.camp : null;
  for (const z of Z) {
    if (!cnZ(z)) continue;
    const i = z.i, ctl = TS.zc[i], jpHeld = foe(ctl), ccpHeld = ctl === 'CCP', kmtHeld = ctl === 'CHN' && !civil; // jpHeld：敌占区（日占区，内战时也包括国统区）
    const tg = CN_GROW[z.t] || 1, popK = TS.pop[i] > 0.2 ? 1 : 0.3;
    let b = TS.base[i], kg = TS.kg[i];
    // —— 中共根据地 ——
    if (gC[i] > 0.05) {
      const pres = gC[i] / (gC[i] + 0.6), opp = jpHeld ? gJ[i] / (gJ[i] + 0.8) : 0;
      const kmt = kmtHeld ? (uf.fr >= 60 ? 0.5 : 0.3) : 1; // 国统区：发展受限并引起摩擦
      const pk = (pol.rent ? 1.2 : 1) * (pol.rect ? 1.1 : 1) * (camp ? 0.85 : 1);
      b += CN_RATE * pres * tg * pk * kmt * popK * (1 - 0.85 * opp) * (1 - 0.7 * TS.bh[i]) * (1 - TS.jcF[i] / 120) * (1 - b / 100);
      if (kmtHeld || kg > 20) uf.dfr = (uf.dfr || 0) + 0.004 * pres * (kmtHeld ? 2 : 1);
      if (jpHeld && gJ[i] > 0) b -= 0.06 * gJ[i] / (gJ[i] + 1) * (1 + TS.bh[i]) * b / 100; // 日伪据点、伪政权
    } else if (b > 0) b -= (jpHeld ? 0.06 + 0.15 * gJ[i] / (gJ[i] + 1) * (1 + TS.bh[i]) : ccpHeld ? 0.01 : 0.04) * b / 100;
    // —— 国民党敌后游击 ——
    if (gK[i] > 0.05) { const pres = gK[i] / (gK[i] + 0.8), opp = jpHeld ? gJ[i] / (gJ[i] + 1.2) : 0; kg += 0.22 * pres * tg * popK * (1 - 0.7 * opp) * (1 - 0.6 * TS.bh[i]) * (1 - kg / 100); }
    else if (kg > 0) kg -= (jpHeld ? 0.1 : 0.03) * kg / 100;
    if (b > 30 && kg > 0 && uf.fr > 45) kg -= 0.02 * b / 100; // 中共在敌后逐步取代国民党的游击力量
    // —— 日军治安度 ——
    if (ctl === 'JPN') {
      const gar = gJ[i] / (0.3 + TS.pop[i] * 0.06);
      const jT = clamp(Math.max(TS.jcF[i], 100 * gar / (gar + 1)) * (1 - 0.6 * b / 100) + 25 * TS.bh[i], 3, 97);
      TS.jc[i] += (jT - TS.jc[i]) * 0.03;
    } else TS.jc[i] = 0;
    // —— 破袭 ——
    if (rd[i] > 0 && jpHeld) {
      const eff = rd[i] * (1 - 0.5 * TS.bh[i]) * (camp ? 1.6 : 1);
      TS.sab[i] = Math.min(1, TS.sab[i] + 0.012 * eff / (1 + 0.5 * gJ[i]));
      for (const [, k] of ST.adj[i]) if (ST.edges[k].rail > 0 && rnd(S) < Math.min(0.5, 0.12 * eff)) TS.dmg[k] = Math.max(TS.dmg[k] || 0, 3 + Math.floor(rnd(S) * 6));
      TS.bh[i] = Math.max(0, TS.bh[i] - 0.004 * eff); TS.jc[i] = Math.max(3, TS.jc[i] - 0.35 * eff); TS.heat[i] += eff * 0.1;
      cnHurt(S, T, TS, i, ctl, 0.0003 * eff * (1 + b / 100), u => !(u.ord.p && u.ord.p.length), 0, 'raid');
      cnHurt(S, T, TS, i, 'CCP', 0.0005 * eff * (1 + 0.3 * gJ[i]) / (1 + b / 100), u => u.ord.k === 'raid', 0.035, 'raid');
      for (const u of TS.units) if (u.z === i && u.c === 'CCP' && u.ord.k === 'raid' && u.o < 0.3) u.ord = { k: 'guer' };
      cn.q.raid = (cn.q.raid || 0) + eff;
      if (!cn._sw['r' + i]) { cn._sw['r' + i] = 1; ev.push({ k: 'raid', z: i, c: 'CCP', d }); }
    }
    TS.sab[i] = Math.max(0, TS.sab[i] - 0.02 * (1 + 0.3 * gJ[i]) * (0.5 + TS.jc[i] / 100));
    // —— 碉堡、封锁沟 ——
    if (jpHeld && dg[i] > 0 && b > 8) TS.bh[i] = Math.min(1, TS.bh[i] + 0.0035 * dg[i] * (jp.cage ? 1 : 0.4));
    else if (!jpHeld || gJ[i] === 0) TS.bh[i] = Math.max(0, TS.bh[i] - 0.002);
    // —— 扫荡 ——
    if (sw[i] > 0) {
      const G = gC[i] + gK[i], ev2 = CN_EVADE[z.t] || 1;
      const q = sw[i] / (sw[i] + G * ev2 * (0.6 + Math.max(b, kg) / 100) + 0.01);
      b -= (G > 0.05 ? 0.5 : 0.65) * q * (0.4 + b / 100);
      kg = Math.max(0, kg - 0.4 * q);
      if (jpHeld) TS.jc[i] = Math.min(97, TS.jc[i] + 0.35 * q);
      TS.sab[i] = Math.max(0, TS.sab[i] - 0.03 * q);
      if (G > 0.05) {
        if (gC[i] > 0.05) cnHurt(S, T, TS, i, 'CCP', 0.01 * q * gC[i], () => true, 0.05 * q, 'sweep');
        if (gK[i] > 0.05) cnHurt(S, T, TS, i, 'CHN', 0.01 * q * gK[i], u => thHostile(S, 'CHN', TS.zc[i]) || TT[u.t].gue, 0.05 * q, 'sweep');
        for (const X of [...new Set(TS.units.filter(u => u.z === i && u.ord.k === 'sweep' && foe(u.c)).map(u => u.c))]) cnHurt(S, T, TS, i, X, 0.0012 * G * ev2, u => u.ord.k === 'sweep', 0, 'sweep');
        if (q > 0.5) for (const u of TS.units) if (u.z === i && TT[u.t].gue && !foe(u.c) && u.ord.k === 'guer' && rnd(S) < 0.18) { const to = cnEscape(S, T, TS, ST, u, sw); if (to != null) { u.z = to; u.mv = 0; u.o = Math.max(0.1, u.o - 0.05); } }
      }
      cn.q.sweep = (cn.q.sweep || 0) + q;
      if (!cn._sw[i]) { cn._sw[i] = 1; ev.push({ k: 'sweep', z: i, c: (TS.units.find(u => u.z === i && u.ord.k === 'sweep') || {}).c || 'JPN', d, q: +q.toFixed(2) }); }
    }
    // —— 日伪据点被骚扰；伪军反正 ——
    if (jpHeld && gC[i] > 0.1 && b > 25 && gJ[i] > 0) cnHurt(S, T, TS, i, ctl, 0.0002 * gC[i] * b / 100, () => true, 0, 'har');
    if (ctl === 'JPN' && b > 40 && TS.jc[i] < 40) for (const u of TS.units) if (u.z === i && u.ag === 'PP' && rnd(S) < 0.0015 * (b / 100) * (1 - TS.jc[i] / 100)) { u.s *= 0.92; b = Math.min(100, b + 1); }
    TS.base[i] = clamp(b, 0, 100); TS.kg[i] = clamp(kg, 0, 100);
    // —— 收复：根据地巩固、日伪军撤走的区格 ——
    if (jpHeld && gC[i] >= 0.6 && TS.base[i] >= 60 && !thEnemyIn(S, TS, i, 'CCP') && (z.t !== 'urban' || TS.base[i] >= 80)) { thCapture(S, T, TS, ST, i, 'CCP', d, R, ev, { lib: 1 }); cn.q.lib = (cn.q.lib || 0) + 1; }
    else if (jpHeld && gK[i] >= 0.6 && TS.kg[i] >= 60 && !thEnemyIn(S, TS, i, 'CHN')) thCapture(S, T, TS, ST, i, 'CHN', d, R, ev, { lib: 1 });
    // —— 国共摩擦：双方部队同处一地、摩擦激化时的局部冲突 ——
    if (!civil && uf.fr > 50 && gC[i] > 0.2 && gN[i] > 0.2 && (kmtHeld || TS.kg[i] > 15) && TS.base[i] > 15 && rnd(S) < 0.004 * (uf.fr - 50) / 50) cnClash(S, T, TS, ST, i, d, ev);
  }
  // 扫荡期限
  for (const u of TS.units) if (u.ord.k === 'sweep' && u.ord.to === u.z && !(u.ord.p && u.ord.p.length)) { u.ord.d = (u.ord.d || TH_DAYS) - 1; if (u.ord.d <= 0) u.ord = { k: 'hold' }; }
  TS.units = TS.units.filter(u => u.s > 0.04);
}
/* 国共摩擦战斗 */
function cnClash(S, T, TS, ST, i, d, ev) {
  const val = (C, root) => TS.units.filter(u => u.z === i && u.c === C).reduce((s, u) => s + TT[u.t].a * ustr(u) * u.q * (0.3 + 0.7 * u.o), 0) * (1 + root / 100);
  const a = val('CCP', TS.base[i]) * docOf('CCP').a, b = val('CHN', TS.kg[i] + (TS.zc[i] === 'CHN' ? 30 : 0)) * docOf('CHN').a;
  if (!(a > 0) || !(b > 0)) return;
  const win = a * (0.8 + 0.4 * rnd(S)) > b * (0.8 + 0.4 * rnd(S)) ? 'CCP' : 'CHN', lose = win === 'CCP' ? 'CHN' : 'CCP';
  cnHurt(S, T, TS, i, lose, 0.08 * TS.units.filter(u => u.z === i && u.c === lose).reduce((s, u) => s + ustr(u), 0), () => true, 0.2, 'fric');
  cnHurt(S, T, TS, i, win, 0.03 * TS.units.filter(u => u.z === i && u.c === win).reduce((s, u) => s + ustr(u), 0), () => true, 0.05, 'fric');
  if (win === 'CCP') { TS.base[i] = Math.min(100, TS.base[i] + 8); TS.kg[i] = Math.max(0, TS.kg[i] - 10); } else { TS.base[i] = Math.max(0, TS.base[i] - 10); TS.kg[i] = Math.min(100, TS.kg[i] + 6); }
  S.th.uf.fr = Math.min(100, S.th.uf.fr + 1); TS.cn.q.fric = (TS.cn.q.fric || 0) + 1;
  ev.push({ k: 'fric', z: i, c: win, o: lose, d });
}

/* ---------- 每季度：政策、根据地经济与扩军、伪军、统一战线 ---------- */
function thCcpBegin(S, T, TS, ST, R) {
  const cn = TS.cn; if (!cn) return;
  cn.lastQ = cn.q || {}; cn.q = {}; TS.jz0 = TS.zc.map(c => (c === 'JPN' ? 1 : 0));
  for (let i = 0; i < TS.heat.length; i++) TS.heat[i] *= 0.5;
  cnPolicyAI(S, T, TS, ST);
  cnCcpEcon(S, T, TS, ST, R);
  cnPuppets(S, T, TS, ST);
  cnUfQuarter(S, T, TS, ST, R);
  if (cn.n4a && S.turn > cn.n4a && !cn.n4aDone) cnN4ARebuild(S, T, TS, ST);
  const xj = S.actors.JPN; if (xj && xj.flags && xj.flags.surrendered && !cn.jpOut && !atWar(S, 'JPN', 'CHN')) cnJapanOut(S, T, TS, ST, R);
}
function cnPolicyAI(S, T, TS, ST) {
  const cn = TS.cn, jp = cn.jp, pol = cn.pol, yq = cnYQ(S);
  for (const k of Object.keys(jp)) if (k !== 'cage' && k !== 'drive') delete jp[k]; // 日方政策只有这两项（旧存档里多出来的状态清掉）
  if (!isHuman(S, 'JPN')) {
    jp.cage = yq >= 1940 * 4 ? 1 : 0;                                   // 1940 年起：碉堡、封锁沟（囚笼政策）
    jp.drive = yq >= 1941 * 4 && yq <= 1942 * 4 + 3 ? 1 : 0;             // 1941—1942：治安强化运动
  }
  if (!isHuman(S, 'CCP')) {
    pol.rent = 1;
    if (!pol.prod && (!S.th.uf.sub || S.th.uf.block >= 2)) cnSetPol(S, TS, 'prod', 1);
    if (!pol.simple && yq >= 1941 * 4 + 3) cnSetPol(S, TS, 'simple', 1);
    if (!pol.rect && yq >= 1942 * 4) cnSetPol(S, TS, 'rect', 1);
    const str = TS.units.filter(u => u.c === 'CCP').reduce((s, u) => s + ustr(u), 0);
    if (cn.campDone == null && S.year === 1940 && S.q === 3 && str >= 25) cnCampaign(S, TS, 'hundred');
  }
}
/* 中共政策：减租减息 rent、精兵简政 simple、大生产运动 prod、整风 rect */
function cnSetPol(S, TS, key, on) {
  const pol = TS.cn.pol; if (!['rent', 'simple', 'prod', 'rect'].includes(key)) return false;
  const was = !!pol[key]; pol[key] = on ? (pol[key] || S.turn + 1) : 0; // 值为“开始的回合 + 1”（第 0 回合也为真）
  const fx = TS.cn.polFx = TS.cn.polFx || {}; // 一次性效果（精兵简政裁员提质、整风的稳定与组织度变化）两年内只生效一次，反复开关不能刷
  if (on && !was && !(fx[key] != null && S.turn - fx[key] < 8)) {
    fx[key] = S.turn;
    const x = S.actors.CCP;
    if (key === 'simple') { for (const u of TS.units) if (u.c === 'CCP') { u.q = Math.min(1.35, u.q * 1.08); u.s *= 0.92; } if (x) x.pers = (x.pers || 0) * 0.92; }
    if (key === 'rect' && x) { x.stab = clamp(x.stab + 4, 0, 100); for (const u of TS.units) if (u.c === 'CCP') u.o = Math.max(0.2, u.o - 0.08); }
  }
  return true;
}
/* 百团大战式的大规模破袭（每四个季度至多一次） */
function cnCampaign(S, TS, k) {
  const cn = TS.cn; if (k !== 'hundred' || (cn.campDone != null && S.turn - cn.campDone < 4)) return false;
  cn.camp = { k, t0: S.turn, until: S.turn + 1 }; cn.campDone = S.turn;
  const x = S.actors.CCP; if (x) x.stab = clamp(x.stab + 4, 0, 100);
  return true;
}
/* 根据地人口 → 中共的兵源与经济（回写战略层） */
/* 根据地人口（百万）：中共控制区全额计入，游击区按根据地程度折算 */
function cnPopP(S, TS, ST) {
  let P = 0;
  for (const z of ST.zones) {
    if (!cnZ(z)) continue; const b = TS.base[z.i] / 100, c = TS.zc[z.i];
    const f = c === 'CCP' ? Math.max(0.7, b) : b >= 0.2 ? b * (thHostile(S, 'CCP', c) ? 0.8 : 0.5) : 0;
    P += TS.pop[z.i] * f;
  }
  return Math.max(1, P);
}
function cnCcpEcon(S, T, TS, ST, R) {
  const x = S.actors.CCP, cn = TS.cn, uf = S.th.uf; if (!x || !indep(S, 'CCP')) return;
  const P = cnPopP(S, TS, ST); cn.P = +P.toFixed(2);
  x.popX = +(P - DEF.CCP.pop).toFixed(2);
  const pol = cn.pol, bl = uf.block * (pol.prod ? 0.4 : 1);
  const tgt = P * 0.3 * (1 - 0.1 * bl) * (pol.prod ? 1.05 : 1) * (pol.simple ? 1.06 : 1) + (uf.sub ? 1.2 : 0); // 敌后农村的人均产出与财政能力都很低
  x.gdp += (tgt - x.gdp) * 0.25;
  // 扩军：根据地动员
  const cap = persCapAt(S, 'CCP', 3) * (pol.simple ? 0.7 : 0.85), room = Math.max(0, cap - (x.pers || 0));
  const nn = Math.min(room, P * 1.0 * (pol.rent ? 1.15 : 1));
  if (nn > 1) { const per = x.land / Math.max(1, x.pers || 1); x.pers = (x.pers || 0) + nn; x.land += nn * per * 0.73; cn.rec = Math.round(nn); } // 0.73：使战略层“兵员随装备”的规则保持中性
}
/* 伪军：日占区的治安越好、人口越多，伪军越多（1940 年 3 月汪精卫政权成立后扩充） */
function cnPuppets(S, T, TS, ST) {
  if (!S.actors.JPN || !indep(S, 'JPN')) return;
  let tgt = 0; for (const z of ST.zones) if (cnZ(z) && TS.zc[z.i] === 'JPN') tgt += TS.pop[z.i] * TS.jc[z.i] / 100;
  const wang = cnYQ(S) >= 1940 * 4 + 1; tgt *= wang ? 0.035 : 0.025;
  const pup = TS.units.filter(u => u.c === 'JPN' && u.ag === 'PP'), have = pup.reduce((s, u) => s + ustr(u), 0);
  if (!(tgt > have + 0.3)) return;
  let need = Math.min((tgt - have) * 0.4, 1.5);
  for (const u of pup.sort((a, b) => a.s - b.s)) { if (need <= 0.02) break; const a = Math.min(1 - u.s, need / uw(u)); if (a > 0) { u.s += a; need -= a * uw(u); } }
  let guard = 0;
  while (need > 0.15 && guard++ < 6) {
    let best = null, bs = 0;
    for (const z of ST.zones) { if (!cnZ(z) || TS.zc[z.i] !== 'JPN') continue; const np = TS.units.filter(u => u.z === z.i && u.ag === 'PP').length; const sc = TS.jc[z.i] * Math.max(0.5, TS.pop[z.i]) / (1 + np * 2); if (sc > bs) { bs = sc; best = z.i; } }
    if (best == null) break;
    const g = TS.gen.PP = (TS.gen.PP || 0) + 1;
    const nm = wang ? [`伪和平建国军第${g}师`, `Collaborationist Peace Army ${g}th Division`] : [`伪绥靖军第${g}师`, `Collaborationist Pacification Army ${g}th Division`];
    const u = thNewUnit(S, TS, 'JPN', [nm[0], nm[1], 'pup', 0.45, 1, wang ? '汪伪政权' : '伪政权', null, null, null, 'PP'], best);
    u.s = clamp(need / uw(u), 0.3, 1); u.o = 0.6; need -= ustr(u);
  }
}
/* 日本投降：日伪军缴械遣返；日占区由受降的一方接收——根据地巩固、附近有中共部队的地方归中共，其余（主要是城市与交通线）归国民政府 */
function cnJapanOut(S, T, TS, ST, R) {
  TS.cn.jpOut = S.turn; const ccpOk = S.actors.CCP && indep(S, 'CCP'); let nC = 0, nK = 0;
  // 受降：大城市与交通枢纽归国民政府（史实：美军空运、海运国军接收京沪平津）；中共就近接收其根据地周围、八路军新四军先到的县城与乡村
  const adj = (C, i) => TS.units.reduce((s, u) => s + (u.c === C && (u.z === i || thEdge(ST, u.z, i)) ? ustr(u) : 0), 0);
  for (const z of ST.zones) {
    if (TS.zc[z.i] !== 'JPN' || !cnZ(z)) continue;
    const near = adj('CCP', z.i);
    const toCCP = ccpOk && near > 0.2 && z.t !== 'urban' && z.vp < 5 && !z.hub && (TS.base[z.i] >= 30 || near > adj('CHN', z.i));
    TS.zc[z.i] = toCCP ? 'CCP' : 'CHN'; TS.jc[z.i] = 0; TS.bh[z.i] = 0; TS.sab[z.i] = 0; toCCP ? nC++ : nK++;
  }
  TS.units = TS.units.filter(u => u.c !== 'JPN'); thResetCache(S);
  S.th.uf.fr = clamp(S.th.uf.fr + 8, 0, 100); // 抢夺受降权：摩擦骤增
  ufEv(S, 'jpout', R, { a: nC, b: nK }, 'info');
}
/* 皖南事变后新四军重建军部（盐城），在苏北扩编 */
function cnN4ARebuild(S, T, TS, ST) {
  const cn = TS.cn; cn.n4aDone = S.turn;
  const z = ST.idx.JSB; if (z == null) return;
  for (const [zh, en] of [['新四军第一师（重建）', 'New Fourth Army 1st Division (rebuilt)'], ['新四军第三师（重建）', 'New Fourth Army 3rd Division (rebuilt)']]) { const u = thNewUnit(S, TS, 'CCP', [zh, en, 'gue', 1, 1.2, '新四军', null, null, null, 'N4A'], z); u.s = 0.7; u.o = 0.6; }
}

/* ---------- 统一战线 ---------- */
function cnN4ASouth(S, TS, ST) { const south = new Set(CN_SOUTH.map(id => ST.idx[id])); return TS.units.filter(u => u.c === 'CCP' && u.ag === 'N4A' && south.has(u.z)); }
function ufEv(S, k, R, p, tone) {
  const uf = S.th.uf; uf.log = (uf.log || []).concat([{ t: S.turn, k }]).slice(-30);
  const msg = M('uf.' + k, p || {});
  if (R) R.world.push({ actor: 'CHN', msg, tone: tone || 'warn', about: ['CCP'], big: true });
  logEvent(S, 'war', msg, tone || 'warn', ['CHN', 'CCP']);
}
function cnUfQuarter(S, T, TS, ST, R) {
  const uf = S.th.uf, cn = TS.cn; if (!S.actors.CCP || !indep(S, 'CCP') || !indep(S, 'CHN')) return;
  if (uf.civil) { uf.fr = 100; uf.sub = 0; uf.block = 2; return; }
  // 摩擦的自然变化：国民党“限共”政策、中共在国统区与敌后的扩张；日军大举进攻、盟国压力使其缓和
  let df = 1.5 + Math.min(4, uf.dfr || 0) - Math.max(0, uf.fr - 60) * 0.25; uf.dfr = 0; // 摩擦过高时双方都会克制（避免全面内战）
  if (cn.lastQ.jpOff) df -= 3;
  if (atWar(S, 'USA', 'JPN') && rel(S, 'USA', 'CHN') > 30) df -= 1.5;
  if (S.year >= 1944) df -= 1;
  uf.fr = clamp(uf.fr + df, 0, 100);
  // 历史上的摩擦高潮（第一次反共高潮）：1939 年冬到 1940 年春的晋西事变、太行与冀南的摩擦
  if (!uf.ev.jinxi && cnYQ(S) >= 1939 * 4 + 3 && uf.fr >= 35) { uf.ev.jinxi = S.turn; cnJinxi(S, T, TS, ST, R); }
  if (!isHuman(S, 'CHN')) {
    if (uf.fr >= 62 && uf.sub) { uf.sub = 0; ufEv(S, 'subcut', R); }
    if (uf.fr >= 70 && uf.block < 2) { uf.block = 2; ufEv(S, 'block2', R); }
    if (uf.fr < 40 && uf.block > 1 && S.year >= 1944) uf.block = 1;
    if (!uf.north && !uf.ev.north && uf.fr >= 48 && cnYQ(S) >= 1940 * 4 + 3 && cnN4ASouth(S, TS, ST).length) { uf.north = { t: S.turn, due: S.turn + 1 }; uf.ev.north = S.turn; ufEv(S, 'north', R); }
  }
  // 北移令到期：仍滞留江南的新四军遭到围攻（皖南事变）
  if (uf.north && S.turn >= uf.north.due) {
    const left = cnN4ASouth(S, TS, ST), attack = isHuman(S, 'CHN') ? !!uf.north.atk : uf.fr >= 58;
    if (left.length && attack && !uf.ev.wannan) cnWannan(S, T, TS, ST, R, left);
    else if (!left.length) { uf.fr = clamp(uf.fr - 6, 0, 100); ufEv(S, 'north_ok', R, {}, 'info'); }
    uf.north = null;
  }
  // 军饷与封锁的战略影响
  const x = S.actors.CCP, y = S.actors.CHN;
  if (uf.block >= 2) x.stab = clamp(x.stab - (cn.pol.prod ? 0.5 : 1.5), 0, 100);
  if (uf.fr >= 80) y.stab = clamp(y.stab - 0.5, 0, 100);
  // 日本退出战争后，摩擦尖锐时国民党可能发动内战（1946 年）
  if (!atWar(S, 'CHN', 'JPN') && !atWar(S, 'CCP', 'JPN') && uf.fr >= 70 && !isHuman(S, 'CHN') && !isHuman(S, 'CCP') && chance(S, 0.25)) cnCivilWar(S, R, 'CHN');
}
function cnJinxi(S, T, TS, ST, R) { // 晋西事变：阎锡山旧军进攻山西新军，新军全面倒向八路军，晋西北成为根据地
  for (const id of ['SXB', 'STY']) { const z = ST.idx[id]; if (z != null) TS.base[z] = Math.min(100, TS.base[z] + 12); }
  const zl = ST.idx.SLL; if (zl != null) for (const u of TS.units) if (u.z === zl && u.c === 'CHN') { u.s *= 0.93; u.o = Math.max(0.2, u.o - 0.15); }
  S.th.uf.fr = clamp(S.th.uf.fr + 6, 0, 100);
  ufEv(S, 'jinxi', R);
}
function cnWannan(S, T, TS, ST, R, left) {
  const uf = S.th.uf; uf.ev.wannan = S.turn;
  let lost = 0; const cwn = ST.idx.CWN;
  for (const u of left) { const k = u.z === cwn ? 0.85 : 0.45; lost += ustr(u) * k; u.s *= 1 - k; u.o = 0.1; }
  TS.units = TS.units.filter(u => u.s > 0.04);
  const L = { CCP: lost }; thLoss(S, T, TS, L, cwn ?? 0, 'CHN', 'CCP', true);
  uf.fr = 92; uf.sub = 0; uf.block = 2;
  addRel(S, 'CCP', 'CHN', -30); addRel(S, 'USA', 'CHN', -4); addRel(S, 'RUS', 'CHN', -8);
  S.actors.CHN.stab = clamp(S.actors.CHN.stab - 2, 0, 100); S.actors.CCP.stab = clamp(S.actors.CCP.stab + 2, 0, 100);
  TS.cn.n4a = S.turn;
  ufEv(S, 'wannan', R, { n: { pers: Math.round(lost * (TS.slice.CCP || 6)) } }, 'bad');
}
function cnCivilWar(S, R, by) { // 内战在战区里进行：解除同盟，保留通行（双方部队仍在中国境内），战区内互相敌对
  const a = by === 'CCP' ? 'CCP' : 'CHN';
  S.treaties = S.treaties.filter(t => !(t.type === 'alliance' && ((t.a === 'CHN' && t.b === 'CCP') || (t.a === 'CCP' && t.b === 'CHN'))));
  if (!hasTreaty(S, 'CHN', 'CCP', 'access')) addTreaty(S, 'access', 'CHN', 'CCP');
  setRel(S, 'CHN', 'CCP', -80);
  S.th.uf.civil = S.turn + 1; thResetCache(S); // 开始的回合 + 1（第 0 回合也为真）
  S.th.uf.fr = 100; S.th.uf.sub = 0; S.th.uf.block = 2;
  ufEv(S, 'civil', R, { a }, 'bad');
}
/* 玩家的统一战线行动（S.player 为中华民国或中共） */
function thUfAct(S, act, arg) {
  if (!S.th || !S.th.uf) return { ok: false };
  const uf = S.th.uf, P = S.player, TS = S.th.T.C, ST = thStatic('C'); if (!TS || !ST || (P !== 'CHN' && P !== 'CCP')) return { ok: false };
  if (uf.civil) return { ok: false, why: 'war' };
  const cd = uf.cd = uf.cd || {}, key = P + act; if (cd[key] === S.turn && !['sub', 'block'].includes(act)) return { ok: false, why: 'cd' };
  const x = S.actors[P];
  switch (P + ':' + act) {
    case 'CHN:sub': { const v = arg ? 1 : 0; if (v === uf.sub) return { ok: false, why: 'same' }; uf.sub = v; if (!v && cd[key] !== S.turn) uf.fr = clamp(uf.fr + 5, 0, 100); break; } // 发放/停发军饷（摩擦每回合只因此增加一次，反复切换不能刷）
    case 'CHN:block': { const v = clamp(arg | 0, 0, 2); if (v === uf.block) return { ok: false, why: 'same' }; uf.block = v; if (v >= 2 && cd[key] !== S.turn) uf.fr = clamp(uf.fr + 4, 0, 100); break; } // 封锁陕甘宁边区
    case 'CHN:north': if (uf.north || !cnN4ASouth(S, TS, ST).length) return { ok: false, why: 'north' }; uf.north = { t: S.turn, due: S.turn + 1, atk: 0 }; uf.ev.north = S.turn; uf.fr = clamp(uf.fr + 4, 0, 100); break; // 北移令
    case 'CHN:attack': if (!uf.north) return { ok: false, why: 'north' }; uf.north.atk = arg ? 1 : 0; break;                   // 逾期不走即围攻
    case 'CHN:talk': uf.fr = clamp(uf.fr - 5, 0, 100); x.stab = clamp(x.stab - 0.5, 0, 100); break;                           // 谈判让步
    case 'CHN:restrict': uf.fr = clamp(uf.fr + 5, 0, 100); for (const z of ST.zones) if (TS.zc[z.i] === 'CHN') TS.base[z.i] *= 0.8; break; // 限共、取缔
    case 'CCP:comply': { // 服从北移令：江南的新四军部队渡江北上
      const list = cnN4ASouth(S, TS, ST); if (!list.length) return { ok: false, why: 'none' };
      const dests = CN_NORTH.map(id => ST.idx[id]).filter(z => z != null);
      for (const u of list) { let best = null, bl = 99; for (const z of dests) { const p = thPath(S, 'C', 'CCP', u.z, z, 'inf'); if (p && p.length < bl) { bl = p.length; best = p; } } if (best) { u.ord = { k: 'move', p: best, to: best[best.length - 1], by: 'p' }; u.lk = 1; delete u.nx; } }
      uf.fr = clamp(uf.fr - 4, 0, 100); break; }
    case 'CCP:talk': uf.fr = clamp(uf.fr - 4, 0, 100); break;                                                                    // 周恩来在重庆的交涉
    case 'CCP:propaganda': S.actors.CHN.stab = clamp(S.actors.CHN.stab - 1.5, 0, 100); addRel(S, 'USA', 'CCP', 3); addRel(S, 'RUS', 'CCP', 2); uf.fr = clamp(uf.fr + 3, 0, 100); break; // 揭露“摩擦”
    case 'CCP:expand': TS.cn.pol.exp = arg ? 1 : 0; if (arg) uf.fr = clamp(uf.fr + 3, 0, 100); break;                      // 向国统区与敌后空白地带发展
    case 'CHN:war': case 'CCP:war': if (uf.fr < 90) return { ok: false, why: 'fr' }; cnCivilWar(S, null, P); break;            // 公开破裂（内战）
    default: return { ok: false };
  }
  cd[key] = S.turn; uf.log = (uf.log || []).concat([{ t: S.turn, k: P + ':' + act, a: arg }]).slice(-30);
  return { ok: true, fr: Math.round(uf.fr) };
}
/* 玩家政策：中共（rent/simple/prod/rect/hundred）、日本（cage/drive） */
function thCnPolicy(S, key, on) {
  if (!S.th || !S.th.T.C || !S.th.T.C.cn) return false; const TS = S.th.T.C, cn = TS.cn, P = S.player;
  if (P === 'CCP') { if (key === 'hundred') return cnCampaign(S, TS, 'hundred'); return cnSetPol(S, TS, key, on); }
  if (P === 'JPN' && ['cage', 'drive'].includes(key)) {
    cn.jp[key] = on ? 1 : 0;
    return true;
  }
  return false;
}

/* ---------- 季度末：统计与报告 ---------- */
function thChinaEnd(S, T, TS, ST, R) {
  const cn = TS.cn; if (!cn) return;
  const str = C => TS.units.filter(u => u.c === C && !thAux(u)).reduce((s, u) => s + ustr(u), 0);
  const bz = ST.zones.filter(z => cnZ(z) && TS.base[z.i] >= 50).length;
  const row = { t: S.turn, P: cn.P, bz, ccp: +str('CCP').toFixed(1), jpn: +str('JPN').toFixed(1), chn: +str('CHN').toFixed(1), pup: +TS.units.filter(u => u.ag === 'PP').reduce((s, u) => s + ustr(u), 0).toFixed(1), fr: Math.round(S.th.uf.fr), raid: +(cn.q.raid || 0).toFixed(1), sweep: +(cn.q.sweep || 0).toFixed(1), lib: cn.q.lib || 0 };
  cn.stat = (cn.stat || []).concat([row]).slice(-40);
  if (!R) return;
  const prev = cn.stat.length > 1 ? cn.stat[cn.stat.length - 2] : null;
  for (const H of humansOf(S)) {
    const lines = []; thChinaReport(S, T, TS, ST, H, TS.qev || [], lines); for (const l of lines) RP(S, H, R).mil.push(Object.assign({ th: T }, l));
    if (H === 'CCP') RP(S, H, R).mil.push({ th: T, msg: M('cn.r.ccp', { a: { raw: cn.P.toFixed(1) }, b: bz, n: { pers: Math.round(row.ccp * (TS.slice.CCP || 6)) } }), tone: prev && cn.P < prev.P - 0.5 ? 'bad' : 'good' });
    if (H === 'JPN') { const jz = ST.zones.filter(z => cnZ(z) && TS.zc[z.i] === 'JPN'); const avg = jz.length ? jz.reduce((s, z) => s + TS.jc[z.i], 0) / jz.length : 0; RP(S, H, R).mil.push({ th: T, msg: M('cn.r.jpn', { n: Math.round(avg), b: bz }), tone: avg < 45 ? 'bad' : 'info' }); }
  }
}
/* 本季度中国战场的报告（扫荡、破袭、摩擦、收复），按区格汇总 */
function thChinaReport(S, T, TS, ST, H, evs, lines) {
  const top = k => { const c = {}; for (const e of evs) if (e.k === k) c[e.z] = (c[e.z] || 0) + 1; return Object.keys(c).map(Number).sort((a, b) => c[b] - c[a] || a - b); }; // 按发生次数排序
  const sw = top('sweep'), rd = top('raid'), fr = evs.filter(e => e.k === 'fric'), lib = [...new Set(evs.filter(e => e.k === 'cap' && e.lib).map(e => e.z))];
  const nm = z => thZoneName(T, z);
  if (sw.length && (H === 'CCP' || H === 'JPN' || H === 'CHN')) lines.push({ msg: M(H === 'JPN' ? 'cn.r.sweep_us' : 'cn.r.sweep', { x: { list: sw.slice(0, 5).map(nm) } }), tone: H === 'JPN' ? 'info' : 'bad' });
  if (rd.length && (H === 'CCP' || H === 'JPN')) lines.push({ msg: M(H === 'CCP' ? 'cn.r.raid_us' : 'cn.r.raid', { x: { list: rd.slice(0, 5).map(nm) } }), tone: H === 'CCP' ? 'good' : 'bad' });
  if (lib.length && H !== 'CCP' && H !== 'CHN') lines.push({ msg: M('cn.r.lib', { x: { list: lib.slice(0, 5).map(nm) } }), tone: 'bad' });
  if (fr.length && (H === 'CCP' || H === 'CHN')) lines.push({ msg: M('cn.r.fric', { x: { list: [...new Set(fr.map(e => e.z))].slice(0, 4).map(nm) }, a: fr[0].c }), tone: 'warn' });
}
