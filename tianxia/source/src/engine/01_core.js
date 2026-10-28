/* ===================== 规则引擎 v2 · 核心 ===================== */
const WG = (() => {
'use strict';
const DEF = Object.fromEntries(ACTORS.map(a => [a.id, a]));
const IDS = ACTORS.map(a => a.id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rk = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
/* 永久中立地区（联机网页版：台湾）：任何国家都不能对其采取行动，它自己也不行动，玩家不能操作。
 * setNeutral 在构建里打开（单人版不调用，规则与结果完全不变）；对局里记在 S.neutral。 */
let NEUTRAL = typeof window !== 'undefined' && Array.isArray(window.TX_NEUTRAL) ? window.TX_NEUTRAL.filter(id => IDS.includes(id)) : []; // 构建开关：网页版在引擎之前设 window.TX_NEUTRAL
function setNeutral(ids) { NEUTRAL = (ids || []).filter(id => IDS.includes(id)); for (const k of Object.keys(PROV)) if (!NEUTRAL.includes(k)) NEUTRAL.push(k); }
const NEU = (S, X) => !!(S && S.neutral && X && S.neutral.length && S.neutral.includes(X));
/* 永久领土（联机网页版：台湾划归中国）：{地区: 所属国}。它是所属国领土的一部分，同时按中立地区处理——任何国家都不能单独对它采取行动，
 * 它自己不行动、不能被选为玩家国家，也不会独立（所属国被征服或投降时仍归所属国）。对局里记在 S.prov。 */
let PROV = {}; const provCfg = o => { PROV = {}; for (const [k, v] of Object.entries(o && typeof o === 'object' ? o : {})) if (IDS.includes(k) && IDS.includes(v) && k !== v) PROV[k] = v; };
provCfg(typeof window !== 'undefined' ? window.TX_PROV : null); // 构建开关：网页版在引擎之前设 window.TX_PROV
for (const k of Object.keys(PROV)) if (!NEUTRAL.includes(k)) NEUTRAL.push(k);
function setProv(o) { for (const k of Object.keys(PROV)) NEUTRAL = NEUTRAL.filter(x => x !== k); provCfg(o); for (const k of Object.keys(PROV)) if (!NEUTRAL.includes(k)) NEUTRAL.push(k); }
const PRV = (S, X) => (S && S.prov && X && S.prov[X]) || null; // X 所属的国家（不是永久领土时为 null）
/* 保底（联机网页版：1939 年开局的中国）：{剧本: [国家]}。这些国家不会被征服、不会投降、不会沦为附庸——对它们的攻势最多推进到 GCAP 就陷入僵持。对局里记在 S.guard。 */
let GUARD = {}; const guardCfg = o => { GUARD = {}; for (const [k, v] of Object.entries(o && typeof o === 'object' ? o : {})) if (Array.isArray(v)) GUARD[k] = v.filter(id => IDS.includes(id)); };
guardCfg(typeof window !== 'undefined' ? window.TX_GUARD : null); // 构建开关：网页版在引擎之前设 window.TX_GUARD
function setGuard(o) { guardCfg(o); }
const GRD = (S, X) => !!(S && S.guard && X && S.guard.includes(X));
/* 不得有外国驻军的国家（联机网页版 v3：中国）：外国军队不能驻扎在它的领土上（含它的永久领土），盟友也不行——和它只能结成军事同盟；
 * 交战中的占领不在此列。对局里记在 S.nobase（见 09_scen.js 的 nobaseize）。 */
let NOBASE = []; const nobaseCfg = a => { NOBASE = (Array.isArray(a) ? a : []).filter(id => IDS.includes(id)); };
nobaseCfg(typeof window !== 'undefined' ? window.TX_NOBASE : null); // 构建开关：网页版在引擎之前设 window.TX_NOBASE
function setNobase(a) { nobaseCfg(a); }
const NBH = (S, L) => { const nb = S && S.nobase; if (!nb || !nb.length || !L) return null; if (nb.includes(L)) return L; const o = PRV(S, L); return o && nb.includes(o) ? o : null; }; // L 是哪个“不得有外国驻军”国家的领土（不是则为 null）
const noBase = (S, X, L) => { const nb = NBH(S, L); return !!nb && nb !== X; }; // X 不能把军队放进 L
/* 按中国标准处理的国家（联机网页版：中国）：不显示政体标签、不会发生政变；随机事件与危机里不出现它的抗议、政变、恐袭、衰退、动荡等内容；
 * 别国不能对它舆论战、扶植反对派、策动政变；它自己不采取隐蔽行动（资助抵抗运动除外），奉行不首先使用核武器（遭到核打击后才能核反击）、
 * 不进行核威胁；AI 提示词要求客观、平和地描述它。对局里记在 S.shield。单人版不设，结果与以前逐位相同。 */
let SHIELD = []; const shieldCfg = a => { SHIELD = (Array.isArray(a) ? a : []).filter(id => IDS.includes(id)); };
shieldCfg(typeof window !== 'undefined' ? window.TX_SHIELD : null); // 构建开关：网页版在引擎之前设 window.TX_SHIELD
function setShield(a) { shieldCfg(a); }
const SHD = (S, X) => !!(S && S.shield && X && S.shield.includes(X));
const neuWhy = (S, X) => (PRV(S, X) ? M('c.prov', { t: X, b: { id: PRV(S, X) } }) : M('c.neutral', { t: X })); // 不能对中立地区 / 永久领土采取行动的原因
/* 网页版规则 v2（window.TX_RULES2）：协议按条款计行动点、提高动员即时生效、只有对方几乎沦陷时才能要求臣服。单人版不设，结果与以前逐位相同。 */
const RULES2 = typeof window !== 'undefined' && !!window.TX_RULES2;
/* 网页版规则 v3（window.TX_RULES3，在 v2 之上，部署在 tianxia-v3/）：行动点改成每回合 100% 的行动力，每项行动占一定百分比，花钱的按金额占 GDP 的比例多占（见 06_turn.js）。 */
const RULES3 = RULES2 && typeof window !== 'undefined' && !!window.TX_RULES3;
const GCAP = 62; // 保底国家的战线进度上限（1939 年的中国：沿海与长江中游可能失守，西安、重庆、成都、昆明守得住）
const M = (k, p) => ({ k, p: p || {} });
const $m = v => ({ m: v });
const nm = id => ({ id });
const LANDLOCKED = new Set(['CEU', 'BLR', 'MNG', 'CAS']);
const ISLAND = new Set(['JPN', 'TWN', 'GBR', 'AUS', 'OCE']);
const GOVW = { dem: 1.35, hyb: 1.0, aut: 0.7 };
const DIST = new Map();
for (const [k, v] of Object.entries(GEO.dist)) { const [a, b] = k.split('|'); DIST.set(rk(a, b), v); }
const dist = (a, b) => (a === b ? 0 : (DIST.get(rk(a, b)) ?? 20000));
const landAdj = (a, b) => a !== b && !!(GEO.land[a] && GEO.land[a].includes(b)) && !(CURS && CURS.noLandSet && CURS.noLandSet.has(a < b ? a + '|' + b : b + '|' + a)); // 剧本可去掉不合时宜的陆地接壤（如1939年把爱尔兰并入北欧地区造成的英国—北欧陆上边界）
const near = (a, b, km = 450) => landAdj(a, b) || dist(a, b) <= km;
/* 主要国土（标注点）之间的大致距离：用于排除“海外领地相邻”造成的不合理跨洋登陆（如从法国本土经圣皮埃尔岛进攻加拿大） */
function labelKm(a, b) { const p = GEO.label[a], q = GEO.label[b]; if (!p || !q) return 0; let dx = Math.abs(p[0] - q[0]); dx = Math.min(dx, GEO.w - dx); return Math.hypot(dx, p[1] - q[1]) * 40075 / GEO.w; }

/* ---------- 随机数（可复现） ---------- */
function rnd(S) { S.rng = (S.rng + 0x6D2B79F5) | 0; let t = S.rng; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function rn(S) { let u = 0; while (u === 0) u = rnd(S); const v = rnd(S); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const chance = (S, p) => rnd(S) < p;
const pick = (S, arr) => arr[Math.floor(rnd(S) * arr.length)];
const between = (S, a, b) => a + (b - a) * rnd(S);
function shuffle(S, arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd(S) * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
function softPick(S, opts, temp) {
  const m = Math.max(...opts.map(o => o.u));
  const w = opts.map(o => Math.exp((o.u - m) / temp)); const tot = w.reduce((a, b) => a + b, 0);
  let r = rnd(S) * tot; for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) return opts[i]; }
  return opts[opts.length - 1];
}
const sig = x => 1 / (1 + Math.exp(-x));

/* ---------- 基础访问 ---------- */
const rel = (S, a, b) => (a === b ? 100 : (S.rel[rk(a, b)] ?? 0));
function addRel(S, a, b, d) { if (a === b || !d || !S.actors[a] || !S.actors[b] || NEU(S, a) || NEU(S, b)) return; const k = rk(a, b); S.rel[k] = clamp((S.rel[k] ?? 0) + d, -100, 100); }
function setRel(S, a, b, v) { if (a !== b && !NEU(S, a) && !NEU(S, b)) S.rel[rk(a, b)] = clamp(v, -100, 100); }
const infl = (S, a, b) => S.infl[a + '>' + b] || 0;
function addInfl(S, a, b, d) { if (a === b || NEU(S, a) || NEU(S, b)) return; const k = a + '>' + b; S.infl[k] = clamp((S.infl[k] || 0) + d, 0, 100); }
const indep = (S, id) => !!S.actors[id] && S.actors[id].ctrl === id;
function boss(S, id) { const x = S.actors[id]; if (x.ctrl !== id) return x.ctrl; return x.overlord || id; }
function realm(S, p) { return IDS.filter(id => { const x = S.actors[id]; return x.ctrl === p || (x.ctrl === id && x.overlord === p); }); }
const controlled = (S, p) => IDS.filter(id => S.actors[id].ctrl === p);
const atWar = (S, a, b) => a !== b && !!S.war[rk(a, b)];
const enemies = (S, a) => IDS.filter(b => b !== a && atWar(S, a, b));
function hasTreaty(S, a, b, type) { return S.treaties.some(t => t.type === type && ((t.a === a && t.b === b) || (t.a === b && t.b === a))); }
function treatiesOf(S, a, b) { return S.treaties.filter(t => (t.a === a && t.b === b) || (t.a === b && t.b === a)); }
function sameBloc(S, a, b) { return Object.values(S.blocs).some(x => x.members.includes(a) && x.members.includes(b)); }
function isAlly(S, a, b) { if (!S.actors[a] || !S.actors[b] || a === b) return false; return hasTreaty(S, a, b, 'alliance') || sameBloc(S, a, b) || S.actors[a].overlord === b || S.actors[b].overlord === a; }
function isPartner(S, a, b) { return !!S.actors[a] && !!S.actors[b] && hasTreaty(S, a, b, 'partner'); }
const friendly = (S, a, b) => isAlly(S, a, b) || isPartner(S, a, b) || rel(S, a, b) >= 50;
function econBlocs(id) { return Object.entries(sc().econ || {}).filter(([, m]) => m.includes(id)).map(([k]) => k); }
function sameEcon(a, b) { return Object.values(sc().econ || {}).some(m => m.includes(a) && m.includes(b)); }
const worldGDP = S => IDS.reduce((s, id) => s + S.actors[id].gdp, 0);
const isGreat = (S, id) => S.actors[id].gdp > 3000 * (sc().gdpScale || 1) || power(S, id) > 700 * (sc().milScale || 1);

/* ---------- 制裁 ---------- */
function addSanction(S, from, to, kind, level) {
  if (NEU(S, from) || NEU(S, to)) return;
  const s = S.sanctions.find(x => x.from === from && x.to === to && x.kind === kind);
  if (s) s.level = Math.max(s.level, level); else S.sanctions.push({ from, to, kind, level, since: S.turn });
}
function sanctionLevel(S, from, to, kind) { let l = 0; for (const x of S.sanctions) if (x.from === from && x.to === to && (!kind || x.kind === kind)) l = Math.max(l, x.level); return l; }
function removeSanctions(S, from, to) { S.sanctions = S.sanctions.filter(x => !(x.from === from && x.to === to)); }

/* ---------- AI 写的文字 ----------
 * 一般是字符串；联机局里玩家用不同语言时，所有人都看得到的文字（表态、世界事件、战略规划、实时命令的标题与各国表态）
 * 是 {zh, en} 两种语言，界面各按自己的语言显示。ltxt 规整并截断，两种一样时退回字符串；lraw 用作消息参数。 */
function ltxt(v, n) {
  if (v && typeof v === 'object' && !Array.isArray(v) && (typeof v.zh === 'string' || typeof v.en === 'string')) {
    const z = String(v.zh || v.en || '').slice(0, n), e = String(v.en || v.zh || '').slice(0, n);
    return z === e ? z : { zh: z, en: e };
  }
  return v === undefined || v === null || typeof v === 'object' ? '' : String(v).slice(0, n);
}
const lraw = (v, n) => { const t = ltxt(v, n); return typeof t === 'string' ? { raw: t } : t; };

/* ---------- 日志与事件 ---------- */
function logEvent(S, type, msg, tone, actors) { S.log.push({ turn: S.turn, type, msg, tone: tone || 'info', actors: actors || [] }); if (S.log.length > 700) S.log.splice(0, S.log.length - 700); }
function pushEv(S, ev) { ev.id = 'E' + S.seq++; ev.turn = S.turn; (S.turnEvents = S.turnEvents || []).push(ev); return ev; }

/* ---------- 贸易暴露度 ---------- */
function exposure(S, a, b) {
  if (a === b) return 0;
  const k = a + '>' + b; if (S._exp && S._exp[k] !== undefined) return S._exp[k];
  if (!S._exp) S._exp = {};
  const W = worldGDP(S); let tot = 0; const row = {};
  for (const c of IDS) {
    if (c === a) continue;
    const d = dist(a, c);
    let p = 1 + (sameEcon(a, c) ? 0.8 : 0) + (landAdj(a, c) ? 0.6 : 0) + (d < 2500 ? 0.4 : 0) - (d > 9000 ? 0.35 : 0);
    if (hasTreaty(S, a, c, 'trade')) p += 0.6;
    if (atWar(S, a, c)) p *= 0.1;
    p = Math.max(0.05, p);
    row[c] = S.actors[c].gdp / W * p; tot += row[c];
  }
  for (const c in row) S._exp[a + '>' + c] = row[c] / tot;
  return S._exp[k];
}
function resetExposure(S) { S._exp = null; }

/* ---------- 时间 ---------- */
function dateOf(S, turn = S.turn) { const t = (S.q - 1) + (turn - S.turn); return { y: S.year + Math.floor(t / 4), q: ((t % 4) + 4) % 4 + 1 }; }

/* ---------- 多人席位（联机版）----------
 * 单人局：S.humans 不存在，S.player 就是唯一的真人国家，下面这些函数都退化为原来的行为（结果逐位不变）。
 * 多人局：S.humans 列出所有真人控制的国家；S.player 是“当前席位”，其余真人的席位状态（来函、通牒、危机、
 * 承诺、开战理由、各国对其的记忆与威胁感知、国内政治、信誉、回合报告……）存放在 S.seats[国家] 中。
 * 引擎里以玩家为中心的逻辑通过 withSeat 临时切换到某个真人席位运行；全局逻辑用 isHuman 判断真人国家，
 * 用 RP 把消息投递到相应真人的回合报告。 */
const SEAT_KEYS = ['goal', 'queue', 'inbox', 'ultis', 'crises', 'commits', 'cb', 'mem', 'grudge', 'favor', 'threat', 'unattrib', 'crossed', 'intelLog', 'carry', 'cbmUntil', 'lowStab', 'chat', 'heg', 'holds', 'pre', 'ultiAt', 'offerAt', 'history', 'pol', 'rep', 'report', 'apUsed'];
const humansOf = S => (S.humans ? S.humans : [S.player]);
const isHuman = (S, X) => !!X && (S.humans ? S.humans.includes(X) : X === S.player);
function seatOf(S, X) { return X === S.player ? S : (S.seats && S.seats[X]) || null; }
const RP = (S, X, R) => (S._RH && X && S._RH[X]) || R;
function swapSeat(S, H) { // 把真人 H 的席位换成当前席位（原当前席位存入 S.seats）
  const P0 = S.player, a = S.seats[H], b = {};
  for (const k of SEAT_KEYS) { b[k] = S[k]; S[k] = a[k]; }
  delete S.seats[H]; S.seats[P0] = b; S.player = H;
  return P0;
}
function withSeat(S, H, fn) {
  if (!H || H === S.player || !S.seats || !S.seats[H]) return fn();
  const P0 = swapSeat(S, H);
  try { return fn(); } finally { swapSeat(S, P0); }
}
function forHumans(S, fn) { for (const H of humansOf(S).slice()) withSeat(S, H, () => fn(H)); }
function forSeats(S, fn) { for (const H of humansOf(S)) { const sb = seatOf(S, H); if (sb) fn(sb, H); } }
/* 客户端：让本机玩家的席位成为当前席位（界面一律按 S.player 渲染） */
function adoptSeat(S, H) { if (H && H !== S.player && S.seats && S.seats[H]) swapSeat(S, H); return S; }
/* 某真人对 X 是否握有正当开战理由（不切换席位） */
function seatCB(S, H, X) { const sb = seatOf(S, H); const c = sb && sb.cb && sb.cb[X]; return c && c.until >= S.turn ? c : null; }
