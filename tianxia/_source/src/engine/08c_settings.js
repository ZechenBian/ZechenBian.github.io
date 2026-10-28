/* ===================== 自由指令的“设定变更”（v4） =====================
 * 自由指令除了外交、经济等一次性效果，还可能改变游戏中的持久设定：国名、政体、战略方针、军费、动员、生产结构、
 * 征兵与军工订单、部队部署、战线指挥、领土处置、集团与长期援助计划等。
 * Claude 先判断指令是否需要改动设定（needsSettings），给出结构化的设定变更；引擎逐项校验权限与上限，
 * 把结果写入游戏状态（国名等定义层面的改动记在 S.defOv，读档时重新套用），界面与之后的推演随之同步。
 */
const SET_TYPES = new Set(['rename', 'gov', 'doctrine', 'budget', 'mob', 'mix', 'conscript', 'procure', 'move', 'recall', 'front', 'hold', 'nukes', 'nukeprog', 'annex', 'release', 'puppet', 'bloc', 'program', 'persona']);
const DEFOV_KEYS = ['name', 'en', 'voice', 'voiceEn', 'gov', 'doctrine', 'doctrineEn', 'was'];
const playerMilMax = () => Math.max(25, sc().warPct || 25);
/* 定义层面的改动（国名、政体等）：写入 DEF 并重新登记显示名称 */
function applyDefOv(S, only) {
  for (const [id, ov] of Object.entries(S.defOv || {})) {
    if (only && id !== only) continue; if (!DEF[id]) continue;
    for (const k of DEFOV_KEYS) if (ov[k] !== undefined) DEF[id][k] = ov[k];
    if (typeof I18N !== 'undefined') I18N.registerNames([DEF[id]]);
  }
  if (typeof I18N !== 'undefined' && S.i18nOv && I18N.dict) { I18N_OV_BAK = I18N_OV_BAK || {}; for (const k of Object.keys(S.i18nOv)) if (!(k in I18N_OV_BAK)) I18N_OV_BAK[k] = I18N.dict[k] ?? null; I18N.add(S.i18nOv); }
}
/* 新开一局或读档前：撤销上一局对界面文字（如集团名称）的改动 */
let I18N_OV_BAK = null;
function i18nOvReset() { if (!I18N_OV_BAK || typeof I18N === 'undefined') return; for (const [k, v] of Object.entries(I18N_OV_BAK)) { if (v === null) delete I18N.dict[k]; else I18N.dict[k] = v; } I18N_OV_BAK = null; }
const setDefOv = (S, id, o) => { S.defOv = S.defOv || {}; S.defOv[id] = Object.assign(S.defOv[id] || {}, o); applyDefOv(S, id); };
const inRealm = (S, T) => !!S.actors[T] && (T === S.player || boss(S, T) === S.player);
const cleanName = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>{}"`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
/* 城市：按名称（中/英）或序号查找 */
function cityIdx(T, v) {
  const cs = (typeof CITIES !== 'undefined' && CITIES[T]) || []; if (v === undefined || v === null || v === '') return -1;
  if (Number.isInteger(+v) && cs[+v]) return +v;
  const s = String(v).trim().toLowerCase();
  return cs.findIndex(c => c[0] === String(v).trim() || c[1].toLowerCase() === s || c[1].toLowerCase().includes(s) || (s.length >= 2 && c[0].includes(String(v).trim())));
}
const frac = v => clamp(Number.isFinite(+v) ? +v : 0, 0, 1);
function normSetting(S, o) {
  const P = S.player, x = S.actors[P], g = x.gdp; const num = (v, a, b, d = 0) => clamp(Number.isFinite(+v) ? +v : d, a, b);
  if (!o.target && ['rename', 'gov', 'doctrine', 'persona'].includes(o.type)) o.target = P;
  for (const k of ['from', 'to', 'target']) if (o[k]) o[k] = String(o[k]).toUpperCase();
  switch (o.type) {
    case 'rename': { const n0 = String(o.name || o.zh || o.en || ''); o.name = cleanName(n0, /^[\x00-\x7f]*$/.test(n0) ? 36 : 16); o.en = cleanName(o.en || o.name, 36); break; }
    case 'gov': o.gov = ['dem', 'hyb', 'aut'].includes(o.gov) ? o.gov : 'aut'; break;
    case 'doctrine': o.zh = cleanName(o.zh || o.text, 120); o.en = cleanName(o.en || o.zh, 220); break;
    case 'budget': o.pct = +num(o.pct, 0.5, Math.max(playerMilMax(), weMilCap(S, P)), x.milPct).toFixed(1); break;
    case 'mob': o.level = Math.round(num(o.level, 0, 3, x.mob)); break;
    case 'mix': { let a = [num(o.land, 0, 1), num(o.navy, 0, 1), num(o.air, 0, 1)]; const t = a[0] + a[1] + a[2]; a = t > 0 ? a.map(z => z / t) : x.mix.slice(); a = a.map(z => Math.max(0.05, z)); const t2 = a[0] + a[1] + a[2]; [o.land, o.navy, o.air] = a.map(z => +(z / t2).toFixed(3)); break; }
    case 'conscript': o.n = Math.round(num(o.n, 1, DEF[P].pop * 1000 * 0.15, 1)); break;
    case 'procure': o.branch = ['land', 'air', 'navy'].includes(o.branch) ? o.branch : 'land'; o.amount = +num(o.amount, 0.01, g * 0.02, g * 0.003).toFixed(2); break;
    case 'move': o.from = S.actors[o.from] ? o.from : P; for (const b of ['land', 'navy', 'air']) o[b] = +frac(o[b]).toFixed(3); break;
    case 'front': if (o.commit !== undefined) o.commit = +frac(o.commit).toFixed(2); if (o.air !== undefined) o.air = +frac(o.air).toFixed(2); o.halt = !!o.halt; break;
    case 'nukes': o.delta = Math.round(num(o.delta, -x.nukes, 0)); break;
    case 'nukeprog': o.delta = Math.round(num(o.delta, 0, 15, 5)); break;
    case 'bloc': o.action = ['create', 'leave', 'rename'].includes(o.action) ? o.action : 'create'; o.name = cleanName(o.name, 16); o.en = cleanName(o.en || o.name, 36); o.members = (Array.isArray(o.members) ? o.members : []).map(m => String(m).toUpperCase()).filter(m => S.actors[m] && m !== P).slice(0, 10); if (o.id) o.id = String(o.id); break;
    case 'program': o.kind = o.kind === 'aid' ? 'aid' : 'arms'; o.amount = +num(o.amount, 0.01, g * 0.005, g * 0.002).toFixed(2); o.turns = Math.round(num(o.turns, 1, 16, 4)); break;
    case 'persona': for (const k of ['hawk', 'risk', 'loyal']) if (k in o) o[k] = +num(o[k], -0.2, 0.2).toFixed(2); break;
  }
  return o;
}
/* 校验：返回不能执行的原因（M 消息），可以执行则返回 null */
function checkSetting(S, e) {
  const P = S.player, x = S.actors[P], T = e.target;
  if (S.neutral && ['target', 'to', 'from', 'a', 'b', 'with', 'loc'].some(k => typeof e[k] === 'string' && NEU(S, e[k]))) return neuWhy(S, ['target', 'to', 'from', 'a', 'b', 'with', 'loc'].map(k => e[k]).find(v => typeof v === 'string' && NEU(S, v)));
  switch (e.type) {
    case 'rename': {
      if (!inRealm(S, T)) return M('st.r.notmine', { t: T });
      if (!e.name) return M('st.r.empty');
      if (IDS.some(id => id !== T && (DEF[id].name === e.name || DEF[id].en.toLowerCase() === e.en.toLowerCase()))) return M('st.r.dup');
      if (DEF[T].name === e.name && DEF[T].en === e.en) return M('st.r.same');
      return null;
    }
    case 'gov': if (T !== P && S.actors[T].overlord !== P) return M('st.r.notmine', { t: T }); return DEF[T].gov === e.gov ? M('st.r.same') : null;
    case 'doctrine': return inRealm(S, T) ? (e.zh ? null : M('st.r.empty')) : M('st.r.notmine', { t: T });
    case 'budget': return Math.abs(e.pct - x.milPct) < 0.05 ? M('st.r.same') : null;
    case 'mob': return e.level === x.mob ? M('st.r.same') : null;
    case 'conscript': { const mb = Math.max(x.mob, S._setMob ?? 0), cap = persCapAt(S, P, mb); return cap - (x.pers || 0) - inTraining(S, P) < 1 ? M('st.conscript_cap', { n: fmtK(cap) }) : null; }
    case 'move': {
      const to = e.to; if (!S.actors[to]) return M('c.badmove');
      if (to === e.from) return M('c.badmove');
      if (!canStation(S, P, to)) return M('c.nostation', { l: to });
      const fv = freeQV(S, e.from); if (vmax(vmin([e.land, e.navy, e.air], fv)) < 0.004) return M('c.nofree', { l: e.from, s: { pct: dotw(S, P, fv) } });
      return null;
    }
    case 'recall': return !S.actors[e.from] || e.from === P || vmax(freeQV(S, e.from)) < 0.004 ? M('c.nofree', { l: e.from || P, s: { pct: 0 } }) : null;
    case 'front': { const f = S.fronts.find(z => z.att === P && z.target === T); if (!f) return M('st.r.nofront', { t: T || '?' }); if (e.focus !== undefined && e.focus !== null && e.focus !== '' && cityIdx(T, e.focus) < 0) return M('st.r.nocity', { x: { raw: String(e.focus) } }); return null; }
    case 'hold': { if (!inRealm(S, T)) return M('st.r.notmine', { t: T }); const i = cityIdx(T, e.city); if (i < 0) return M('st.r.nocity', { x: { raw: String(e.city ?? '') } }); if (S.fronts.some(f => f.target === T && (f.taken || []).includes(i))) return M('u.wm.hold_no'); return null; }
    case 'nukes': return e.delta >= 0 || !x.nukes ? M('st.r.same') : null;
    case 'nukeprog': return x.nukes > 0 ? M('st.r.nonuke') : null;
    case 'annex': {
      const t = S.actors[T]; if (!t || T === P) return M('st.r.notmine', { t: T || '?' });
      if (t.ctrl === P && !t.integrated) return t.resist > 30 ? M('c.resist', { n: Math.round(t.resist) }) : null;
      if (t.overlord === P) return S.turn - (t.vassalSince ?? S.turn) < 6 || infl(S, P, T) < 60 ? M('st.r.vassal_new') : null;
      return t.ctrl === P && t.integrated ? M('c.integrated') : M('st.r.notmine', { t: T });
    }
    case 'release': { const t = S.actors[T]; if (!t || T === P || !(t.ctrl === P || t.overlord === P)) return M('st.r.notmine', { t: T || '?' }); return null; }
    case 'puppet': { const t = S.actors[T]; if (!t || T === P || t.ctrl !== P) return M('c.notocc', { t: T || '?' }); return null; }
    case 'bloc': {
      const mine = Object.values(S.blocs).filter(b => b.members.includes(P));
      if (e.action === 'leave') return mine.length ? null : M('c.nobloc');
      if (e.action === 'rename') { const b = (e.id && S.blocs[e.id]) || mine.find(z => z.leader === P); return b && b.leader === P && e.name ? null : M('st.r.notleader'); }
      return e.name ? null : M('st.r.empty');
    }
    case 'program': { const t = S.actors[T]; if (!t || T === P || !indep(S, T)) return M('c.notindep', { t: T || '?' }); if (atWar(S, P, T)) return M('c.atwar', { t: T }); return null; }
    case 'persona': return S.actors[T] && T !== P ? null : M('st.r.same');
  }
  return null;
}
/* 预览：变更前 → 变更后 */
function settingPreview(S, e) {
  const P = S.player, x = S.actors[P], T = e.target;
  const bad = checkSetting(S, e);
  let m;
  switch (e.type) {
    case 'rename': m = M('st.rename', { a: { c: [DEF[T] ? DEF[T].name : T, DEF[T] ? DEF[T].en : T] }, x: { c: [e.name, e.en] } }); break;
    case 'gov': m = M('st.gov', { t: T, a: M('gov.' + (DEF[T] ? DEF[T].gov : 'aut')), b: M('gov.' + e.gov) }); break;
    case 'doctrine': m = M('st.doctrine', { t: T, x: { c: [e.zh, e.en] } }); break;
    case 'budget': m = M('st.budget', { a: +x.milPct.toFixed(1), b: e.pct }); break;
    case 'mob': m = M('st.mob', { a: M('mob.' + x.mob), b: M('mob.' + e.level) }); break;
    case 'mix': m = M('st.mix', { a: Math.round(e.land * 100), b: Math.round(e.navy * 100), c: Math.round(e.air * 100) }); break;
    case 'conscript': m = M('st.conscript', { n: fmtK(e.n), t: trainTurns(S, P), m: $m(e.n * soldierCost(S, P)) }); break;
    case 'procure': m = M('st.procure', { k: M('br.' + e.branch), n: Math.round(procUnits(S, P, e.branch, procPts(S, P, e.amount))), u: M('unit.' + e.branch), t: procLead(S, P, e.branch), m: $m(e.amount) }); break;
    case 'move': { const v = vmin([e.land, e.navy, e.air], S.actors[e.from] ? freeQV(S, e.from) : V0()); m = M('st.move', { f: e.from, l: e.to || '?', x: unitsTxt(S, P, v), n: S.actors[e.to] ? transitTurns(e.from, e.to) : '?' }); break; }
    case 'recall': m = M('st.recall', { l: e.from || '?', x: S.actors[e.from] ? unitsTxt(S, P, freeQV(S, e.from)) : '' }); break;
    case 'front': { const parts = []; if (e.commit !== undefined) parts.push(M('st.f.commit', { s: { pct: e.commit } })); if (e.air !== undefined) parts.push(M('st.f.air', { s: { pct: e.air } })); if (e.focus !== undefined && e.focus !== null && e.focus !== '') { const i = cityIdx(T, e.focus); parts.push(M('st.f.focus', { x: i >= 0 ? cityName(T, i) : { raw: String(e.focus) } })); } if (e.halt) parts.push(M('st.f.halt')); m = M('st.front', { t: T || '?', x: { list: parts } }); break; }
    case 'hold': { const i = cityIdx(T, e.city); m = M('st.hold', { t: T || '?', x: i >= 0 ? cityName(T, i) : { raw: String(e.city ?? '?') } }); break; }
    case 'nukes': m = M('st.nukes', { a: x.nukes, b: Math.max(0, x.nukes + e.delta) }); break;
    case 'nukeprog': m = M('st.nukeprog', { a: Math.round(x.nukeProg), b: Math.min(100, Math.round(x.nukeProg + e.delta)) }); break;
    case 'annex': m = M('st.annex', { t: T || '?' }); break;
    case 'release': m = M('st.release', { t: T || '?' }); break;
    case 'puppet': m = M('st.puppet', { t: T || '?' }); break;
    case 'bloc': { const mine = Object.values(S.blocs).filter(b => b.members.includes(P)); const b = (e.id && S.blocs[e.id]) || mine[0];
      m = e.action === 'leave' ? M('st.bloc_leave', { x: b ? M('bloc.' + b.id) : '?' }) : e.action === 'rename' ? M('st.bloc_rename', { a: b ? M('bloc.' + b.id) : '?', x: { c: [e.name, e.en] } }) : M('st.bloc_create', { x: { c: [e.name, e.en] }, y: { list: e.members.map(id => ({ id })) } }); break; }
    case 'program': m = M('st.program', { k: M('st.k.' + e.kind), t: T || '?', m: $m(e.amount), n: e.turns }); break;
    case 'persona': m = M('st.persona', { t: T || '?', x: { list: ['hawk', 'risk', 'loyal'].filter(k => e[k]).map(k => M('st.p.' + k, { d: Math.round(e[k] * 100) })) } }); break;
    default: return null;
  }
  return bad ? M('st.warn', { x: m, r: bad }) : m;
}
/* 执行（在回合结算的“自由指令”阶段） */
function applySetting(S, e, R) {
  const P = S.player, x = S.actors[P], T = e.target;
  const bad = checkSetting(S, e); const prev = settingPreview(S, e);
  if (bad) return M('st.no', { x: prev && prev.k === 'st.warn' ? prev.p.x : prev, r: bad });
  switch (e.type) {
    case 'rename': {
      const d = DEF[T], was = (S.defOv && S.defOv[T] && S.defOv[T].was) || [d.name, d.en];
      const rep = (s, a, b) => (s ? String(s).split(a).join(b) : s);
      const msg = M('st.rename', { a: { c: [d.name, d.en] }, x: { c: [e.name, e.en] } });
      setDefOv(S, T, { name: e.name, en: e.en, was, voice: rep(d.voice, d.name, e.name), voiceEn: rep(d.voiceEn, d.en, e.en), doctrine: rep(d.doctrine, d.name, e.name), doctrineEn: rep(d.doctrineEn, d.en, e.en) });
      logEvent(S, 'rename', msg, 'info', [T]);
      pushEv(S, { type: 'rename', actor: P, target: T === P ? null : T, sev: 4, third: 6 });
      return msg;
    }
    case 'gov': {
      const from = DEF[T].gov; setDefOv(S, T, { gov: e.gov });
      const y = S.actors[T];
      if (T === P) {
        if (e.gov === 'aut') { S.pol.next = null; y.stab = clamp(y.stab - 6, 0, 100); facAdd(S, { pub: -8, mil: 4 }); repAdd(S, { trust: -5 }); }
        else if (e.gov === 'hyb') { S.pol.every = 20; if (S.pol.next === null) S.pol.next = S.turn + 8; y.stab = clamp(y.stab - 3, 0, 100); }
        else { S.pol.every = 16; S.pol.next = S.turn + 6; y.stab = clamp(y.stab - 4, 0, 100); facAdd(S, { pub: 5 }); }
      } else y.stab = clamp(y.stab - 5, 0, 100);
      for (const c of IDS) if (c !== T && indep(S, c) && DEF[c].gov === 'dem') addRel(S, T, c, e.gov === 'dem' ? 5 : from === 'dem' ? -6 : -2);
      const msg = M('st.gov', { t: T, a: M('gov.' + from), b: M('gov.' + e.gov) }); logEvent(S, 'gov', msg, 'warn', [T]);
      pushEv(S, { type: 'regime', actor: P, target: T === P ? null : T, sev: 8, third: 10 });
      return msg;
    }
    case 'doctrine': S.actors[T].doc = [e.zh, e.en]; return M('st.doctrine', { t: T, x: { c: [e.zh, e.en] } });
    case 'budget': { const a = x.milPct; x.milPct = e.pct; if (e.pct > a + 2) pushEv(S, { type: 'buildup', actor: P, target: null, sev: 6, third: 5 }); return M('st.budget', { a: +a.toFixed(1), b: e.pct }); }
    case 'mob': { const a = x.mob; x.mob = e.level; if (e.level >= 2 && a < 2) { pushEv(S, { type: 'mobilize', actor: P, target: null, sev: 15, third: 8 }); facAdd(S, { mil: 3, pub: -2 }); } return M('st.mob', { a: M('mob.' + a), b: M('mob.' + e.level) }); }
    case 'mix': x.mix = [e.land, e.navy, e.air]; x.mixMode = 'custom'; return M('st.mix', { a: Math.round(e.land * 100), b: Math.round(e.navy * 100), c: Math.round(e.air * 100) });
    case 'conscript': {
      const room = Math.floor(persCap(S, P) - (x.pers || 0) - inTraining(S, P)); const n = Math.min(e.n, room); if (n < 1) return M('st.no', { x: prev, r: M('st.conscript_cap', { n: fmtK(persCap(S, P)) }) });
      const cost = n * soldierCost(S, P); x.treasury -= cost; x.train.push({ n, eta: S.turn + trainTurns(S, P) });
      const hit = conscriptPubHit(S, P, n); if (hit > 0) facAdd(S, { pub: -hit, mil: 1 });
      if (n / (DEF[P].pop * 1000) >= 0.0015) pushEv(S, { type: 'mobilize', actor: P, target: null, sev: 8, third: 5 });
      return M(n < e.n ? 'st.conscript_part' : 'st.conscript', { n: fmtK(n), w: fmtK(e.n), t: trainTurns(S, P), m: $m(cost) });
    }
    case 'procure': { const pts = procPts(S, P, e.amount); x.treasury -= e.amount; x.orders.push({ br: e.branch, pts, eta: S.turn + procLead(S, P, e.branch) }); return M('st.procure', { k: M('br.' + e.branch), n: Math.round(procUnits(S, P, e.branch, pts)), u: M('unit.' + e.branch), t: procLead(S, P, e.branch), m: $m(e.amount) }); }
    case 'move': { const v = vmin([e.land, e.navy, e.air], freeQV(S, e.from)); const mv = orderMove(S, P, e.from, e.to, v); if (!(mv > 0)) return M('st.no', { x: prev, r: M('c.badmove') }); deployEvent(S, e.to, v, R); return M('st.move', { f: e.from, l: e.to, x: unitsTxt(S, P, v), n: transitTurns(e.from, e.to) }); }
    case 'recall': { const v = freeQV(S, e.from); const mv = orderMove(S, P, e.from, P, v); return mv > 0 ? M('st.recall', { l: e.from, x: unitsTxt(S, P, v) }) : M('st.no', { x: prev, r: M('c.badmove') }); }
    case 'front': {
      const f = S.fronts.find(z => z.att === P && z.target === T);
      if (e.halt) { haltFront(S, f.id); return M('st.front', { t: T, x: { list: [M('st.f.halt')] } }); }
      const parts = [];
      if (e.commit !== undefined) { const v = setFrontV(S, f.id, 0, e.commit); parts.push(M('st.f.commit', { s: { pct: v } })); }
      if (e.air !== undefined) { const v = setFrontV(S, f.id, 2, e.air); parts.push(M('st.f.air', { s: { pct: v } })); }
      if (e.focus !== undefined && e.focus !== null && e.focus !== '') { const i = cityIdx(T, e.focus); if (setFrontFocus(S, f.id, i)) parts.push(M('st.f.focus', { x: cityName(T, i) })); }
      return M('st.front', { t: T, x: { list: parts } });
    }
    case 'hold': { const i = cityIdx(T, e.city); setHold(S, T, i); return M('st.hold', { t: T, x: cityName(T, i) }); }
    case 'nukes': { const a = x.nukes; x.nukes = Math.max(0, a + e.delta); pushEv(S, { type: 'armsctl', actor: P, target: null, sev: -8, third: 6 }); return M('st.nukes', { a, b: x.nukes }); }
    case 'nukeprog': {
      const a = x.nukeProg; x.nukeProg = clamp(a + e.delta, 0, 100);
      if (x.nukeProg >= 100) { x.nukes = Math.max(x.nukes, 10); pushEv(S, { type: 'nuketest', actor: P, target: null, sev: 45, third: 30, big: true }); }
      else if (e.delta >= 5) pushEv(S, { type: 'nukeprog', actor: P, target: null, sev: 25, third: 15 });
      S.actors[P].flags.nukeUp = S.turn; for (const c of S.commits.filter(c => c.type === 'no_nuke')) breakCommit(S, 'no_nuke', c.with, R);
      return M('st.nukeprog', { a: Math.round(a), b: Math.round(x.nukeProg) });
    }
    case 'annex': {
      const t = S.actors[T];
      if (t.ctrl === P) { t.integrated = true; t.resist = Math.min(t.resist, 10); }
      else { x.land += t.land * 0.5; x.navy += t.navy * 0.5; x.air += t.air * 0.5; x.pers = (x.pers || 0) + (t.pers || 0) * 0.5; t.land = t.navy = t.air = 0; t.pers = 0; t.ctrl = P; t.overlord = null; t.integrated = true; t.resist = 8; t.forces = {}; t.moves = []; resetExposure(S); }
      for (const c of IDS) if (c !== P && indep(S, c)) addRel(S, P, c, rel(S, c, T) > 30 ? -12 : -3);
      repAdd(S, { aggr: 10 }); pushEv(S, { type: 'annex', actor: P, target: T, sev: 30, third: 15 });
      const msg = M('st.annex', { t: T }); logEvent(S, 'conquest', msg, 'warn', [P, T]); return msg;
    }
    case 'release': {
      const t = S.actors[T];
      if (t.overlord === P) t.overlord = null;
      else { t.ctrl = T; t.overlord = null; t.integrated = false; t.resist = 0; t.occSince = null; t.stab = 40; t.part = null; rebuildArmy(S, T, 0.15); resetExposure(S); } // 我方驻军在下回合按通行权处理（无通行权则撤回）
      addRel(S, P, T, 15); for (const c of IDS) if (c !== P && c !== T && indep(S, c) && rel(S, c, T) > 30) addRel(S, P, c, 4);
      pushEv(S, { type: 'release', actor: P, target: T, sev: -15, third: 8 });
      const msg = M('st.release', { t: T }); logEvent(S, 'peace', msg, 'good', [P, T]); return msg;
    }
    case 'puppet': { const t = S.actors[T]; t.ctrl = T; t.resist = 0; t.integrated = false; rebuildArmy(S, T, 0.25); t.stab = 40; makeVassal(S, T, P); setRel(S, P, T, 50); resetExposure(S); pushEv(S, { type: 'puppet', actor: P, target: T, sev: 15 }); return M('st.puppet', { t: T }); }
    case 'bloc': {
      const mine = Object.values(S.blocs).filter(b => b.members.includes(P));
      if (e.action === 'leave') { const b = (e.id && S.blocs[e.id] && S.blocs[e.id].members.includes(P) && S.blocs[e.id]) || mine[0]; b.members = b.members.filter(m => m !== P); for (const m of b.members) addRel(S, P, m, m === b.leader ? -25 : -15); if (b.leader === P && b.members.length) b.leader = b.members.slice().sort((a, c) => power(S, c) - power(S, a))[0]; pushEv(S, { type: 'leavebloc', actor: P, target: b.leader, sev: 25, third: 10 }); return M('st.bloc_leave', { x: M('bloc.' + b.id) }); }
      if (e.action === 'rename') { const b = (e.id && S.blocs[e.id]) || mine.find(z => z.leader === P); const old = M('bloc.' + b.id), a = { c: [I18N_raw('bloc.' + b.id, 0, old), I18N_raw('bloc.' + b.id, 1, old)] }; S.i18nOv = S.i18nOv || {}; S.i18nOv['bloc.' + b.id] = [e.name, e.en]; applyDefOv(S, '-'); return M('st.bloc_rename', { a, x: { c: [e.name, e.en] } }); }
      // 新建集团：附庸直接加入，其他国家按结盟意愿决定
      const joined = [], refused = [], later = []; // 规则 v3：其他国家同意加入后，回合结束时和协议一起结算（同一国家不能同时进两个对立的集团）
      for (const m of e.members) { if (!indep(S, m) || atWar(S, P, m)) continue; if (S.actors[m].overlord === P || isAlly(S, P, m) && rel(S, P, m) > 30) joined.push(m); else if (RULES3 && isHuman(S, m)) refused.push(m); else if (decide(S, P, m, { type: 'alliance' }, 0.2).ok) (RULES3 && !S._res3 ? later : joined).push(m); else refused.push(m); }
      const id = 'U' + S.seq++; S.blocs[id] = { id, type: 'mil', leader: P, members: [P].concat(joined) };
      for (const m of later) pendCmd3(S, m, [{ type: 'bloc', bloc: id }], 'B' + id + '.' + m);
      for (const m of joined) for (const k of joined) if (m < k) addRel(S, m, k, 5);
      S.i18nOv = S.i18nOv || {}; S.i18nOv['bloc.' + id] = [e.name, e.en]; applyDefOv(S, '-');
      pushEv(S, { type: 'alliance', actor: P, target: joined[0] || null, sev: -10, third: 20 });
      if (later.length) return M(refused.length ? 'st.bloc_made3p' : 'st.bloc_made3', { x: { c: [e.name, e.en] }, y: { list: [P].concat(joined).map(id2 => ({ id: id2 })) }, w: { list: later.map(id2 => ({ id: id2 })) }, z: { list: refused.map(id2 => ({ id: id2 })) } });
      return M(refused.length ? 'st.bloc_made_part' : 'st.bloc_made', { x: { c: [e.name, e.en] }, y: { list: joined.map(id2 => ({ id: id2 })) }, z: { list: refused.map(id2 => ({ id: id2 })) } });
    }
    case 'program': { S.programs = S.programs || []; S.programs = S.programs.filter(p => !(p.to === T && p.kind === e.kind)); S.programs.push({ id: 'G' + S.seq++, from: P, to: T, kind: e.kind, amount: e.amount, until: S.turn + e.turns - 1, since: S.turn }); addRel(S, P, T, 6); pushEv(S, { type: e.kind === 'arms' ? 'armsaid' : 'aid', actor: P, target: T, sev: -10, arms: e.kind === 'arms' }); return M('st.program', { k: M('st.k.' + e.kind), t: T, m: $m(e.amount), n: e.turns }); }
    case 'persona': { const y = S.actors[T]; for (const k of ['hawk', 'risk', 'loyal']) if (e[k]) y[k] = clamp(y[k] + e[k], 0.02, 0.98); return settingPreview(S, e); }
  }
  return null;
}
const I18N_raw = (key, li, fb) => { if (typeof I18N === 'undefined') return key; const e = I18N.dict[key]; return e ? (e[li] ?? e[0]) : I18N.txIn(li ? 'en' : 'zh', fb); };
/* 每回合执行长期援助计划（如租借法案） */
function programsTurn(S, R) {
  if (!S.programs || !S.programs.length) return;
  const keep = [];
  for (const p of S.programs) {
    if (p.until < S.turn || !indep(S, p.to) || !indep(S, p.from) || atWar(S, p.from, p.to)) { if (isHuman(S, p.from)) RP(S, p.from, R).pol.push({ msg: M('st.prog_end', { k: M('st.k.' + p.kind), t: p.to }), tone: 'info' }); continue; }
    const x = S.actors[p.from], y = S.actors[p.to];
    x.treasury -= p.amount;
    if (p.kind === 'arms') armsTransfer(S, p.from, p.to, p.amount); else { y.treasury += p.amount; y.gdp += Math.min(p.amount * 0.3, y.gdp * 0.01); }
    addInfl(S, p.from, p.to, clamp(p.amount / Math.max(1, y.gdp) * 200, 0.5, 4)); addRel(S, p.from, p.to, 1);
    keep.push(p);
  }
  S.programs = keep;
}
function cancelProgram(S, id) { const n = (S.programs || []).length; S.programs = (S.programs || []).filter(p => !(p.id === id && p.from === S.player)); return S.programs.length !== n; }
/* 给 Claude 的设定概况（英文） */
function settingsBrief(S) {
  const P = S.player, x = S.actors[P], d = DEF[P], en = id => DEF[id].en;
  const st = stations(S, P).map(L => { const v = shareV(S, P, L), f = freeQV(S, L), u = unitsV(S, P, v); return `${L} ${en(L)}: army ${Math.round(v[0] * 100)}% navy ${Math.round(v[1] * 100)}% air ${Math.round(v[2] * 100)}% (free ${Math.round(f[0] * 100)}/${Math.round(f[1] * 100)}/${Math.round(f[2] * 100)}; ~${Math.round(u.pers)}k troops, ${Math.round(u.tanks)} tanks, ${Math.round(u.air)} aircraft, ${Math.round(u.ships)} ships)`; }).join('; ');
  const tot = unitsOf(S, P);
  const fr = S.fronts.filter(f => f.att === P).map(f => `${f.target} ${en(f.target)} (${f.phase}${f.phase === 'land' ? ' ' + Math.round(f.progress) + '%' : ''}; committed army ${Math.round(f.v[0] * 100)}% air ${Math.round(f.v[2] * 100)}%; cities: ${(f.obj || []).map(([i, t]) => `${CITIES[f.target][i][1]}${CITIES[f.target][i][4] ? '*' : ''} ${f.taken.includes(i) ? 'taken' : objThr(S, f, i, t) + '%'}`).join(', ')}${f.focus != null ? '; main thrust ' + CITIES[f.target][f.focus][1] : ''})`).join('; ');
  const def = S.fronts.filter(f => boss(S, f.target) === P && f.att !== P).map(f => `${en(f.att)} attacking ${f.target} ${en(f.target)} ${Math.round(f.progress)}% (our cities: ${(CITIES[f.target] || []).map(c => c[1]).join(', ')})`).join('; ');
  const realm = realm_(S, P).map(id => `${id} ${en(id)} (${S.actors[id].ctrl === P ? (S.actors[id].integrated ? 'annexed' : 'occupied, resistance ' + Math.round(S.actors[id].resist)) : 'vassal since turn ' + (S.actors[id].vassalSince ?? '?')})`).join('; ');
  const blocs = Object.values(S.blocs).filter(b => b.members.includes(P)).map(b => `${b.id} "${I18N_raw('bloc.' + b.id, 1, M('bloc.' + b.id))}" leader ${b.leader}, members ${b.members.join(',')}`).join('; ');
  const k1 = br => Math.round(procUnits(S, P, br, procPts(S, P, 1)) * 10) / 10;
  const progs = (S.programs || []).filter(p => p.from === P).map(p => `${p.kind} to ${p.to} ${B_(p.amount)}/quarter until turn ${p.until + 1}`).join('; ');
  return `- Identity: ${d.en} (${d.name})${d.was ? ', formerly ' + d.was[1] : ''}; government ${d.gov}; doctrine: ${(x.doc && x.doc[1]) || d.doctrineEn || ''}
- Defense spending ${x.milPct.toFixed(1)}% of GDP (allowed 0.5–${playerMilMax()}%; industry can absorb about ${Math.round(mcapOf(P) * (x.cu ?? 1) * 100)}% now, up to ${Math.round(mcapOf(P) * 100)}% when fully converted); mobilization ${x.mob}/3; production split army ${Math.round(x.mix[0] * 100)}% navy ${Math.round(x.mix[1] * 100)}% air ${Math.round(x.mix[2] * 100)}%
- Manpower: ${Math.round(x.pers || 0)}k under arms, ${Math.round(inTraining(S, P))}k in training; cap ${Math.round(persCap(S, P))}k at this mobilization level, ${Math.round(persCapAt(S, P, 3))}k at full mobilization; a draftee costs about ${B_(soldierCost(S, P))} per thousand. Totals: ${Math.round(tot.tanks)} tanks, ${Math.round(tot.air)} combat aircraft, ${Math.round(tot.ships)} warships
- Procurement prices: US$1B buys about ${k1('land')} tanks, ${k1('air')} aircraft or ${k1('navy')} warships (delivery ${procLead(S, P, 'land')}/${procLead(S, P, 'air')}/${procLead(S, P, 'navy')} turns)
- Forces by location (share of each branch's total; free = not committed to fronts/operations): ${st || 'none'}
- Our offensives: ${fr || 'none'}${def ? '\n- Enemy offensives against us: ' + def : ''}
- Territory we control: ${realm || 'none'}; blocs: ${blocs || 'none'}; nuclear warheads ${x.nukes}, program ${Math.round(x.nukeProg)}%; standing aid programs: ${progs || 'none'}`;
}
const realm_ = (S, P) => realm(S, P).filter(id => id !== P);
const B_ = b => (b >= 1 ? '$' + b.toFixed(b >= 100 ? 0 : 1) + 'B' : '$' + Math.round(b * 1000) + 'M');

/* 设定变更的执行顺序：先调动员与军费（会影响兵员上限），再做其他 */
const SET_FIRST = { mob: 0, budget: 0, gov: 1, rename: 1 };
const setSort = list => list.slice().sort((a, b) => (SET_FIRST[a.type] ?? 2) - (SET_FIRST[b.type] ?? 2));
/* 预览一组设定变更（同一指令里的动员等级会计入兵员上限） */
function previewSettings(S, list) {
  const m = (list || []).find(e => e.type === 'mob'); if (m) S._setMob = m.level;
  try { return setSort(list || []).map(e => ({ e, msg: settingPreview(S, e), bad: !!checkSetting(S, e) })); } finally { delete S._setMob; }
}
function applySettings(S, list, R) { const out = []; for (const e of setSort(list || [])) { try { const r = applySetting(S, e, R); if (r) out.push(r); } catch (err) { if (typeof console !== 'undefined') console.error(err); } } return out; }
/* 规则兜底：从指令文字中识别明确的设定变更（Claude 漏判或未接入 Claude 时使用） */
function findActor(S, s) {
  s = String(s || '').trim().replace(/^(?:把|将|让)/, '').replace(/(?:的)?(?:国名|国号|名称|名字)$/, '').trim(); if (!s) return S.player;
  if (/^(?:我国|本国|我们|我方|祖国|国家|our country|my country|us)$/i.test(s)) return S.player;
  const lo = s.toLowerCase();
  return IDS.find(id => DEF[id].name === s || DEF[id].en.toLowerCase() === lo || (DEF[id].was && (DEF[id].was[0] === s || DEF[id].was[1].toLowerCase() === lo)) || id === s.toUpperCase()) ||
    IDS.find(id => s.includes(DEF[id].name) || lo.includes(DEF[id].en.toLowerCase())) || null;
}
function ruleSettings(S, text) {
  const out = [], t = String(text || '');
  let m = t.match(/(?:把|将)?\s*([^，,。；;！!]{0,14}?)\s*(?:的国名|的国号|的名称)?\s*(?:正式)?(?:改名为|更名为|改称为|改称|改国号为|易名为|重新命名为|命名为)\s*[“"「『]?([^”"」』，,。；;！!\n]{1,16})/);
  if (m) { const T = findActor(S, m[1]); if (T) out.push({ type: 'rename', target: T, name: m[2].trim() }); }
  m = t.match(/rename\s+(.{1,40}?)\s+(?:to|as)\s+["“']?([^"”',.;!\n]{2,36})/i);
  if (m) { const T = findActor(S, m[1]); if (T) out.push({ type: 'rename', target: T, name: m[2].trim(), en: m[2].trim() }); }
  m = t.match(/(?:军费|国防开支|国防预算|军事预算)[^0-9%]{0,14}?(\d+(?:\.\d+)?)\s*%/) || t.match(/(?:defen[cs]e (?:spending|budget)|military (?:spending|budget))[^0-9%]{0,24}?(\d+(?:\.\d+)?)\s*%/i);
  if (m) out.push({ type: 'budget', pct: +m[1] });
  const lv = /总体战|全民皆兵|总动员|total war/i.test(t) ? 3 : /全面动员|全国动员|general mobili[sz]ation|full mobili[sz]ation/i.test(t) ? 2 : /部分动员|局部动员|partial mobili[sz]ation/i.test(t) ? 1 : /解除动员|复员|demobili[sz]/i.test(t) ? 0 : null;
  if (lv !== null) out.push({ type: 'mob', level: lv });
  return out.map(e => normalizeEffect(S, e)).filter(e => !checkSetting(S, e) || e.type === 'rename');
}
