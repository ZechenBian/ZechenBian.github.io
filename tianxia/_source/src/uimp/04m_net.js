// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 联机版 · 网络层（db / room / user） =====================
 * 房主权威：房主的浏览器运行引擎，其他玩家提交命令与“就绪”，房主结算后把压缩快照写入 db，所有人几秒内同步。
 * 数据布局（db）：
 *   txs/<gid>                对局元数据（房主写）：状态、回合、阶段、席位、智能体模式、代价倍率……
 *   txs/<gid>/snap/cur       最新游戏快照（gzip+base64）：只有大家都能看到的局势（各席位的私密数据另存）
 *   txs/<gid>/sec/<国家>      该席位的私密数据（战报、情报、来函……），房主加密给这位玩家；sec/_h 是只有房主解得开的暂存（AI 的秘密集结等）
 *   txs/<gid>/join/<uid>     入座/离座请求
 *   txs/<gid>/ext/<国家>      外部智能体写入的命令；txs/<gid>/dig/<国家> 房主写给外部智能体的局势摘要
 *   txs/<gid>/lease/host     房主租约（掉线后其他玩家可接管）
 *   txu/<uid>/<gid>/p        每位玩家自己的通道（只有本人能写）：就绪、公钥、语言、私信（逐条加密）、公开喊话；行动队列、即时命令与方针只加密给房主
 *   data/users/<uid>/tx_<gid> 本人与各国智能体的谈判记录（私密）
 * 同一局里的玩家彼此信任：有写权限的人都能改动 txs/ 下的文档；这里只做基本的防护（白名单、只认房主的快照、租约为准）。
 */
const MPS = {
  on: false, mode: null, gid: null, uid: null, seat: null, host: false,
  db: null, room: null, user: null, rm: null, meta: null, players: {}, joins: {}, ext: {},
  snapVer: 0, lastTurn: -1, queue: [], ready: false, cmdN: 0, cmds: [], msgs: [], msgN: 0,
  unsub: [], pSubs: {}, pubBusy: false, pubAgain: false, myAt: 0, myDoc: null,
  err: null, names: {}, peers: [], chats: {}, unread: {}, hostTimer: null, leaseT: null, results: {},
  hotDone: {}, passive: false, tab: null,
};
const MP_VER = 1, MP_EXT_WAIT = 45;
try { window.__MPS = MPS; } catch (e) { } // 测试钩子
const P_META = g => 'txs/' + g, P_SNAP = g => 'txs/' + g + '/snap/cur', P_JOIN = g => 'txs/' + g + '/join', P_EXTC = g => 'txs/' + g + '/ext', P_DIG = (g, c) => 'txs/' + g + '/dig/' + c, P_LEASE = g => 'txs/' + g + '/lease/host';
const P_ME = (u, g) => 'txu/' + u + '/' + g + '/p', P_PRIV = (u, g) => 'data/users/' + u + '/tx_' + g;
const P_SEC = (g, H) => 'txs/' + g + '/sec/' + H, P_SECC = g => 'txs/' + g + '/sec';
const MP_LAST = (window.TX_LSP || 'tianxia') + '.mp.last'; // 新版（tianxia-v2/）用自己的键，不和旧版混
const mpNet = () => MPS.on && MPS.mode === 'net';
const mpClone = o => JSON.parse(JSON.stringify(o)); // db 交付的文档是冻结的，需要修改时先复制
const mpHot = () => MPS.on && MPS.mode === 'hot';
const mpLive = () => !!(S && S.mp && MPS.gid && S.mp.gid === MPS.gid); // 本机已载入这局联网对局（而不是开局画面的演示局）
const MP_AGENTS = ['rule', 'claude', 'ext'], MP_STATUS = ['lobby', 'play', 'over'], MP_TIMERS = [0, 180, 300, 600], MP_COSTS = ['infl', 'stab', 'resist', 'rep', 'interest', 'gain'];
const mpAg = a => (MP_AGENTS.includes(a) ? a : 'rule');
const mpCostCfg = we => { const o = {}; for (const k of MP_COSTS) { const v = +(we && we[k]); o[k] = Number.isFinite(v) ? Math.min(2, Math.max(0.5, v)) : 1; } return o; };
const mpTurnSec = v => (MP_TIMERS.includes(+v) ? +v : 0);
/* 每个浏览器标签页一个编号（刷新后不变）：租约与快照按标签页区分，同一账号开两个标签页不会出现两个房主 */
MPS.tab = (() => { try { let t = sessionStorage.getItem('tianxia.mp.tab'); if (!t) { t = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('tianxia.mp.tab', t); } return t; } catch (e) { return Math.random().toString(36).slice(2, 10); } })();
const mpHolder = () => MPS.uid + '#' + MPS.tab;

/* ---------- 能力 ---------- */
async function mpCaps() {
  const c = window.claude; if (!c || !c.use) return false;
  const [db, room, user] = await Promise.all(['db', 'room', 'user'].map(n => c.use(n).catch(() => null)));
  MPS.db = db; MPS.room = room; MPS.user = user;
  if (user) { try { const me = await user.me(); MPS.uid = me.id; MPS.meName = me.name; MPS.canWrite = await user.can('data.write'); } catch (e) { } }
  if (db && MPS.uid) await MPX.init(db, MPS.uid); // 本人的加密密钥
  return !!(db && MPS.uid);
}
async function mpNames(ids) {
  ids = [...new Set(ids.filter(Boolean))]; if (!MPS.user || !ids.length) return MPS.names;
  try { const ps = await MPS.user.profiles(ids); let ch = false; for (const id of ids) { const v = ps[id] || null; if (((v && v.name) || '') !== ((MPS.names[id] && MPS.names[id].name) || '')) ch = true; MPS.names[id] = v; } if (ch && MPS.on) { mpRenderLobby(); mpRenderBar(); } } catch (e) { } // 名字晚到：刷新大厅与状态栏
  return MPS.names;
}
const mpName = uid => { const p = MPS.names[uid]; return (p && p.name) || (uid === MPS.uid ? T('mp.you') : T('mp.someone')); };

/* ---------- 压缩编码 ---------- */
async function gz64(str) {
  if (typeof CompressionStream === 'undefined') return null;
  const cs = new CompressionStream('gzip'); const w = cs.writable.getWriter(); w.write(new TextEncoder().encode(str)); w.close();
  const buf = new Uint8Array(await new Response(cs.readable).arrayBuffer()); let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}
async function ungz64(b64) {
  const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const ds = new DecompressionStream('gzip'); const w = ds.writable.getWriter(); w.write(u); w.close();
  return new Response(ds.readable).text();
}
function mpPack(s) { const c = Object.assign({}, s); delete c._exp; delete c._R; delete c._RH; return JSON.stringify(c); }
/* 快照里会进入界面文字的自定义名称：去掉尖括号，集团名称以外的文字覆盖一律丢弃 */
function mpSanitizeSnap(o) {
  const cl = v => (typeof v === 'string' ? v.replace(/[<>]/g, '') : Array.isArray(v) ? v.map(cl) : v);
  if (o.defOv && typeof o.defOv === 'object') for (const id of Object.keys(o.defOv)) { const ov = o.defOv[id]; if (!W.DEF[id] || !ov || typeof ov !== 'object') { delete o.defOv[id]; continue; } for (const k of Object.keys(ov)) ov[k] = cl(ov[k]); }
  if (o.i18nOv && typeof o.i18nOv === 'object') for (const k of Object.keys(o.i18nOv)) { if (!/^bloc\.[A-Za-z0-9_]+$/.test(k)) delete o.i18nOv[k]; else o.i18nOv[k] = cl(o.i18nOv[k]); }
  if (o.mp && o.mp.agents) for (const k of Object.keys(o.mp.agents)) o.mp.agents[k] = mpAg(o.mp.agents[k]);
  if (o.weCfg) o.weCfg = mpCostCfg(o.weCfg);
  return o;
}
async function mpUnpack(doc) {
  const txt = doc.enc === 'gz64' ? await ungz64(doc.z) : doc.z;
  const o = mpSanitizeSnap(JSON.parse(txt)); W.migrate(o); o.queue = o.queue || []; o.inbox = o.inbox || []; o.chat = o.chat || {}; o.carry = o.carry || [];
  return o;
}

/* ---------- 写入：同一文档一次只写一笔，合并连续修改；暂时性错误自动重试 ---------- */
const mpWriters = {};
const mpTransient = e => !e || !e.code || ['unavailable', 'resource_exhausted', 'upstream_error'].includes(e.code);
function mpWrite(path, makeBody, mode = 'set', onOk) {
  const w = mpWriters[path] || (mpWriters[path] = { busy: false, again: false });
  w.make = makeBody; w.mode = mode; w.onOk = onOk;
  if (w.busy) { w.again = true; return w.p; }
  w.busy = true;
  w.p = (async () => {
    try {
      do {
        w.again = false; const body = w.make(); if (!body) break;
        for (let i = 0; ; i++) {
          try { const ref = MPS.db.doc(path); if (w.mode === 'update') await ref.update(body); else await ref.set(body); if (w.onOk) w.onOk(body); break; }
          catch (e) { if (i >= 3 || !mpTransient(e)) throw e; await new Promise(r => setTimeout(r, [1000, 3000, 8000][i] * (0.75 + Math.random() * 0.5))); }
        }
      } while (w.again);
    } catch (e) { MPS.err = e; console.warn('mpWrite', path, e); if (e && e.code === 'invalid_argument' && path.startsWith('txu/')) mpToast(T('mp.e.nowrite')); }
    finally { w.busy = false; }
  })();
  return w.p;
}
function mpToast(m) { try { toast(m, 4500); } catch (e) { } }
/* 元数据：不同来源的字段合并后再写（update 会递归合并嵌套对象，如 seats）；写成功后才从待写列表中移除 */
MPS.metaPend = {};
function mpMeta(fields) {
  Object.assign(MPS.metaPend, fields);
  const p = mpWrite(P_META(MPS.gid), () => { const b = Object.assign({}, MPS.metaPend); if (!Object.keys(b).length) return null; b.mv = Date.now(); return b; }, 'update',
    body => { for (const k of Object.keys(body)) if (MPS.metaPend[k] === body[k]) delete MPS.metaPend[k]; });
  p.then(() => mpEmit('tick', { meta: 1 }));
  return p;
}
/* room 快速通知：db 实时推送不可用时（退回约 30 秒轮询），用它让对方立刻重新读取 */
const mpEmitAt = {};
function mpEmit(topic, data) { if (!MPS.rm) return; const k = topic + JSON.stringify(data), now = Date.now(); if (mpEmitAt[k] && now - mpEmitAt[k] < 600) return; mpEmitAt[k] = now; MPS.rm.emit(topic, data).catch(() => { }); }
function mpOnTick(m) {
  const d = (m && m.data) || {}; if (!mpNet() || !MPS.gid || !d || typeof d !== 'object') return;
  const gid = MPS.gid;
  if (typeof d.p === 'string' && MPS.host && MPS.pSubs[d.p]) MPS.db.doc(P_ME(d.p, gid)).get().then(sn => { if (gid !== MPS.gid || !sn.exists) return; const v = sn.data(), cur = MPS.players[d.p]; if (cur && (cur.at || 0) >= (v.at || 0)) return; MPS.players[d.p] = v; mpOnPlayers(d.p); }).catch(() => { });
  if (d.j && MPS.host) MPS.db.collection(P_JOIN(gid)).get().then(q => { if (gid !== MPS.gid) return; for (const x of q.docs) MPS.joins[x.id] = x.data(); mpHostJoins(); mpRenderLobby(); }).catch(() => { });
  if (+d.ver > MPS.snapVer) MPS.db.doc(P_SNAP(gid)).get().then(sn => { if (gid === MPS.gid && sn.exists) mpOnSnap(sn.data()); }).catch(() => { });
  if (typeof d.th === 'string' && !MPS.host && typeof thOnPauseDoc === 'function') MPS.db.doc(P_TH(gid)).get().then(sn => { if (gid === MPS.gid && sn.exists) thOnPauseDoc(sn.data()); }).catch(() => { });
  if (typeof d.ai === 'string' && MPS.host && typeof haPoke === 'function') haPoke(d.ai); // 网页版：有玩家请房主的 AI 推演
  if (d.meta && !MPS.host) MPS.db.doc(P_META(gid)).get().then(sn => { if (gid !== MPS.gid || !sn.exists) return; const v = sn.data(); if (MPS.meta && (MPS.meta.mv || 0) >= (v.mv || 0)) return; MPS.meta = mpClone(v); mpOnMeta(); }).catch(() => { });
}

/* ---------- 我的通道（命令队列、就绪、即时命令、消息） ---------- */
/* 我的通道：就绪、语言、公钥、私信（04o_comms.js 逐条加密）与公开喊话是公开的；本回合的方案（行动队列、即时命令、方针）只加密给房主 */
async function mpMyBodyAsync() {
  const me = await MPX.ready(), at = Date.now();
  const b = { v: MP_VER, seat: MPS.seat || null, turn: mpLive() ? S.turn : -1, ready: !!MPS.ready, msgs: MPS.msgs.slice(-60), thReady: MPS.thReady || null, lang: mpMyLang(), at, queue: [], cmds: [] };
  const priv = { queue: (MPS.queue || []).slice(0, 40), cmds: MPS.cmds.slice(-80), plan: String(MPS.plan || '').slice(0, 600) };
  if (!me) { b.queue = priv.queue; b.cmds = priv.cmds; return b; } // 浏览器不支持加密：退回明文
  b.pk = me.pub;
  const hp = mpHostPub();
  if (hp && MPS.meta && MPS.meta.host) {
    try { b.sx = await MPX.seal(hp, MPS.gid, 'cmd|' + MPS.gid + '|' + MPS.uid + '|' + at, priv); b.sxh = MPS.meta.host; b.sxp = hp; } catch (e) { console.warn('seal', e); }
    if (MPS.handTo && MPS.handTo === MPS.meta.host && MPS.seat && mpLive()) { try { b.hand = { to: MPS.handTo, seat: MPS.seat, box: await MPX.seal(hp, MPS.gid, 'hand|' + MPS.gid + '|' + MPS.seat + '|' + MPS.uid, mpBundleOf(S, MPS.seat, MPS.uid)) }; } catch (e) { } } // 换房主：把自己那份私密数据交给新房主
  }
  return b;
}
function mpSaveMine() {
  if (!mpNet() || !MPS.gid || !MPS.uid || MPS.passive || !MPS.myAt || (!MPS.seat && !MPS.msgs.length)) return;
  const seq = MPS.mySeq = (MPS.mySeq || 0) + 1, gid = MPS.gid;
  mpMyBodyAsync().then(b => { if (seq !== MPS.mySeq || gid !== MPS.gid) return; MPS.myBody = b; return mpWrite(P_ME(MPS.uid, gid), () => MPS.myBody).then(() => { if (!MPS.host) mpEmit('tick', { p: MPS.uid }); }); }).catch(e => console.warn('save mine', e));
}
/* ---------- 公钥：房主记下每位玩家第一次出现时的公钥（之后换了要公开提示） ---------- */
function mpPkOf(uid, s) {
  s = s || S; if (!uid) return null;
  if (uid === MPS.uid && MPX.mine()) return MPX.mine();
  const pin = s && s.mp && s.mp.pks && s.mp.pks[uid]; if (MPX.okPub(pin)) return pin;
  const p = MPS.players[uid], j = MPS.joins && MPS.joins[uid], m = MPS.meta;
  return (p && MPX.okPub(p.pk) && p.pk) || (j && MPX.okPub(j.pk) && j.pk) || (m && m.host === uid && MPX.okPub(m.hpk) && m.hpk) || null;
}
function mpHostPub() { const m = MPS.meta; if (!m || !m.host) return null; return mpPkOf(m.host); }
function mpPin(uid, pk, seat) {
  if (!MPS.host || !mpLive() || !uid || !MPX.okPub(pk)) return;
  const pks = (S.mp.pks = S.mp.pks || {}), cur = pks[uid];
  if (cur && cur.x === pk.x && cur.y === pk.y) return;
  pks[uid] = pk;
  if (cur && seat) { S.log.push({ turn: S.turn, type: 'mp', msg: { k: 'mp.keychg', p: { a: seat } }, tone: 'warn', actors: [seat] }); } // 换了设备或清了浏览器数据
  mpPublishSoon();
}
/* ---------- 房主：解开各玩家加密给我的方案；接任时收回各自的私密数据 ---------- */
MPS.open = {};
async function mpOpenPlayer(uid, d) {
  if (!d || uid === MPS.uid || !MPS.host) return false;
  const prev = MPS.open[uid]; if (prev && prev.at === d.at) return false;
  const seat = mpSeatOf(uid); if (seat && MPX.okPub(d.pk)) mpPin(uid, d.pk, seat);
  let o = { at: d.at, ok: false, queue: [], cmds: [], plan: '' };
  if (d.sx) {
    if (d.sxh === MPS.uid) { try { const pk = mpPkOf(uid); const v = pk ? await MPX.open(pk, MPS.gid, 'cmd|' + MPS.gid + '|' + uid + '|' + d.at, d.sx) : null; if (v) o = { at: d.at, ok: true, queue: Array.isArray(v.queue) ? v.queue : [], cmds: Array.isArray(v.cmds) ? v.cmds : [], plan: String(v.plan || '').slice(0, 600) }; } catch (e) { console.warn('open cmds', uid, e); } }
  } else if (!d.pk && !(S && S.mp && S.mp.pks && S.mp.pks[uid])) o = { at: d.at, ok: true, queue: Array.isArray(d.queue) ? d.queue : [], cmds: Array.isArray(d.cmds) ? d.cmds : [], plan: '' }; // 不支持加密的浏览器：明文
  MPS.open[uid] = o;
  if (d.hand && d.hand.to === MPS.uid) await mpTakeHand(uid, d.hand);
  return true;
}
const mpOpenOk = (uid, p) => { const o = MPS.open[uid]; return !!(o && o.ok && p && o.at === p.at); };
async function mpTakeHand(uid, hand) {
  const seat = mpSeatOf(uid); if (!seat || !hand || hand.seat !== seat || !mpLive() || !W.isHuman(S, seat) || !hand.box) return;
  const k = uid + '|' + hand.box.iv; MPS.handSeen = MPS.handSeen || {}; if (MPS.handSeen[k]) return; MPS.handSeen[k] = 1;
  try {
    const b = await MPX.open(mpPkOf(uid), MPS.gid, 'hand|' + MPS.gid + '|' + seat + '|' + uid, hand.box);
    if (!b || b.seat !== seat || !mpMergeBundle(S, b, uid, b.turn < S.turn)) return;
    (S.mp.handAck = S.mp.handAck || {})[uid] = 1;
    if (MPS.hand) { MPS.hand.need.delete(seat); if (!MPS.hand.need.size) mpHandDone(); } else { renderAll(); mpPublishSoon(); }
  } catch (e) { console.warn('hand', e); }
}
function mpHandDone() { if (!MPS.hand) return; MPS.hand = null; renderAll(); mpPublishSoon(); setTimeout(mpMaybeResolve, 300); }
/* 新房主接任：随机数重新播种（公开快照里没有），等各玩家交回私密数据（最多 20 秒） */
function mpHandStart() {
  if (!mpLive()) return;
  if (typeof S.rng !== 'number' || S.rng === 1) S.rng = (Math.random() * 2 ** 31) >>> 0;
  const seats = (MPS.meta && MPS.meta.seats) || {};
  const need = new Set(S.humans.filter(H => H !== MPS.seat && seats[H] && mpAgentOf(H) !== 'ext'));
  S.mp.handAck = {};
  if (!need.size) return;
  MPS.hand = { until: Date.now() + 20000, need };
  setTimeout(() => { if (MPS.hand && Date.now() >= MPS.hand.until - 50) mpHandDone(); }, 20100);
  for (const [uid, p] of Object.entries(MPS.players)) if (p && p.hand && p.hand.to === MPS.uid) mpTakeHand(uid, p.hand);
}
let mpQT = null;
/* 队列变化（界面每次重绘都会调用）：只有内容真的变了才写 */
function mpQueueChanged() {
  if (!mpNet() || !mpLive()) return;
  if (!MPS.seat || MPS.passive) { if ((S.queue || []).length && !MPS.host) { S.queue = []; mpToast(T(MPS.passive ? 'mp.e.passive' : 'mp.e.spectator')); } return; } // 观战者排的行动不会被执行
  const k = JSON.stringify(S.queue || []); if (k === MPS.qKey) return; MPS.qKey = k;
  MPS.queue = S.queue; clearTimeout(mpQT); mpQT = setTimeout(mpSaveMine, 400);
}

/* ---------- 发布快照（房主） ---------- */
async function mpPublish(force) {
  if (!mpNet() || !MPS.host || !mpLive()) return;
  if (MPS.busy && !force) { MPS.pubPending = true; return; } // 结算进行中不发布半成品
  if (MPS.pubBusy) { MPS.pubAgain = true; return; }
  MPS.pubBusy = true; let failed = false;
  try {
    do {
      MPS.pubAgain = false;
      if (MPS.hand) break; // 刚接任房主：还在收回各玩家的私密数据，先不发布（否则会把别人的数据冲掉）
      const sealOk = !!(await MPX.ready()); // 能加密：快照只放公开局势，各席位的私密数据另外加密
      const pack = () => (sealOk ? JSON.stringify(mpPublicView(S)) : mpPack(S));
      let txt = pack(), z = await gz64(txt), enc = 'gz64';
      if (!z) { z = txt; enc = 'json'; }
      for (let i = 0; i < 3 && z.length > 250000; i++) { // 超过单个文档上限：裁剪日志与历史后重试
        mpToast(T('mp.e.big')); S.log = S.log.slice(-Math.max(80, (S.log.length / 2) | 0)); S.history = S.history.slice(-24); if (S.seats) for (const sb of Object.values(S.seats)) if (sb.history) sb.history = sb.history.slice(-24);
        txt = pack(); z = (await gz64(txt)) || txt; enc = z === txt ? 'json' : 'gz64';
      }
      if (z.length > 250000) throw new Error('snapshot too large');
      MPS.snapVer = Math.max(MPS.snapVer, (S.mp && S.mp.ver) || 0) + 1; S.mp.ver = MPS.snapVer;
      const d = W.dateOf(S);
      if (sealOk) await mpPublishSeats(MPS.snapVer); // 先写各席位的私密数据，再写快照：别人收到快照时自己那份已经在了
      await MPS.db.doc(P_SNAP(MPS.gid)).set({ ver: MPS.snapVer, turn: S.turn, phase: S.mp.phase || 'plan', enc, z, at: Date.now(), by: MPS.uid, tab: MPS.tab, sx: sealOk ? 1 : 0 });
      // 元数据只在回合、阶段、状态或席位变化时才写（房主心跳由租约定时器负责）
      const mf = { turn: S.turn, phase: S.mp.phase || 'plan', date: `${d.y}Q${d.q}`, humans: S.humans.slice(), status: S.over ? 'over' : 'play' };
      const seats = (MPS.meta && MPS.meta.seats) || {}, fix = {}; for (const [C, u] of Object.entries(seats)) if (u && !W.isHuman(S, C)) fix[C] = null; // 出局的席位腾空
      const mk = JSON.stringify(mf);
      if (Object.keys(fix).length) { mf.seats = fix; Object.assign(MPS.meta.seats, fix); }
      if (mk !== MPS.metaKey || mf.seats || (MPS.meta && MPS.meta.host !== MPS.uid)) { MPS.metaKey = mk; mf.host = MPS.uid; mf.hostAt = Date.now(); if (MPX.mine()) mf.hpk = MPX.mine(); await mpMeta(mf); }
      mpEmit('tick', { ver: MPS.snapVer });
    } while (MPS.pubAgain);
    MPS.pubFail = 0;
  } catch (e) { console.warn('publish', e); MPS.err = e; failed = true; }
  finally { MPS.pubBusy = false; }
  if (failed && mpNet() && MPS.host) { MPS.pubFail = (MPS.pubFail || 0) + 1; setTimeout(() => mpPublish(true), Math.min(30000, 1500 * 2 ** MPS.pubFail)); } // 失败则退避重试，避免客户端停在旧回合
}
/* 各席位的私密数据：分别加密给该席位的玩家（没有公钥的席位只加密给房主自己）；sec/_h 是只有房主解得开的暂存 */
async function mpPublishSeats(ver) {
  const me = await MPX.ready(); if (!me) return;
  const gid = MPS.gid, seats = (MPS.meta && MPS.meta.seats) || {}, jobs = [];
  for (const H of S.humans) {
    const uid = seats[H] || null, pk = (uid && mpPkOf(uid)) || me.pub, to = pk === me.pub ? MPS.uid : uid;
    const b = mpBundleOf(S, H, uid); if (b.data && Array.isArray(b.data.history) && b.data.history.length > 40) b.data = Object.assign({}, b.data, { history: b.data.history.slice(-40) });
    jobs.push(MPX.seal(pk, gid, 'seat|' + gid + '|' + H + '|' + ver, b).then(box => MPS.db.doc(P_SEC(gid, H)).set({ ver, turn: S.turn, by: MPS.uid, to, box })));
  }
  jobs.push(MPX.seal(me.pub, gid, 'esc|' + gid + '|' + ver, mpEscrowOf(S)).then(box => MPS.db.doc(P_SEC(gid, '_h')).set({ ver, turn: S.turn, by: MPS.uid, to: MPS.uid, box })));
  await Promise.all(jobs);
}
/* 本席位的私密数据（客户端）：订阅自己的 sec 文档 */
function mpSubSec() {
  const seat = MPS.seat, gid = MPS.gid, key = gid + '|' + seat;
  if (MPS.secKey === key) return;
  if (MPS.secUnsub) { MPS.secUnsub(); MPS.secUnsub = null; }
  MPS.secKey = key; MPS.secDoc = null;
  if (!seat || !mpNet() || !gid) return;
  MPS.secUnsub = mpListen(() => MPS.db.doc(P_SEC(gid, seat)), sn => { if (!sn.exists || gid !== MPS.gid) return; const v = sn.data(); if (!MPS.secDoc || (v.ver || 0) >= (MPS.secDoc.ver || 0)) MPS.secDoc = Object.assign({ seat }, v); }, 'sec');
}
async function mpMySec(ver) {
  mpSubSec(); const seat = MPS.seat, t0 = Date.now();
  while (Date.now() - t0 < 9000 && seat === MPS.seat) {
    const d = MPS.secDoc;
    if (d && d.seat === seat && (d.ver || 0) >= ver && d.box) {
      try { const b = await MPX.open(mpPkOf(d.by), MPS.gid, 'seat|' + MPS.gid + '|' + seat + '|' + d.ver, d.box); if (b && b.seat === seat) { MPS.lastBundle = b; return b; } } catch (e) { console.warn('sec open', e); }
      return null;
    }
    await new Promise(r => setTimeout(r, 120));
  }
  return null;
}
/* 房主刷新页面：解开自己加密过的所有席位与暂存 */
async function mpRestoreAll(s2, ver) {
  const me = await MPX.ready(); if (!me) return;
  let q; try { q = await MPS.db.collection(P_SECC(MPS.gid)).get(); } catch (e) { return; }
  for (const d of q.docs) {
    const v = d.data(); if (!v || !v.box || (v.ver || 0) < ver || v.by !== MPS.uid) continue; // 别的房主加密的：我解不开
    try {
      if (d.id === '_h') { mpMergeEscrow(s2, await MPX.open(me.pub, MPS.gid, 'esc|' + MPS.gid + '|' + v.ver, v.box)); continue; }
      const b = await MPX.open(v.to === MPS.uid ? me.pub : mpPkOf(v.to, s2), MPS.gid, 'seat|' + MPS.gid + '|' + d.id + '|' + v.ver, v.box);
      if (b && b.seat === d.id) mpMergeBundle(s2, b, v.to);
    } catch (e) { console.warn('restore', d.id, e); }
  }
}
let mpPubT = null;
function mpPublishSoon() { if (!mpNet() || !MPS.host) return; clearTimeout(mpPubT); mpPubT = setTimeout(() => mpPublish(), 250); }

/* ---------- 即时命令：本机先执行（立刻看到结果），联机时同时发给房主 ---------- */
function mpCmd(op, args) {
  if (!S) return null;
  if (mpNet() && (!MPS.seat || !mpLive())) { mpToast(T('mp.e.spectator')); return null; }
  if (mpNet() && MPS.passive) { mpToast(T('mp.e.passive')); return null; }
  if (mpNet() && !MPS.host && mpResolving()) { mpToast(T('mp.resolving')); return null; }
  const seat = S.player;
  const r = W.execCmd(S, seat, op, args);
  if (mpNet()) {
    if (MPS.host) { mpPublishSoon(); }
    else { MPS.cmdN = Math.max(MPS.cmdN, ...MPS.cmds.map(c => c.n), (S.mp.cmdDone && S.mp.cmdDone[MPS.uid]) || 0, 0) + 1; MPS.cmds.push({ n: MPS.cmdN, op, args, seat, turn: S.turn }); mpSaveMine(); }
  }
  if (typeof mpAfterCmd === 'function') mpAfterCmd(op, r);
  return r.ok ? r.r : null;
}

/* ---------- 房主：处理各玩家的通道 ---------- */
function mpSeatOf(uid) { const m = MPS.meta; if (!m || !m.seats) return null; for (const [c, u] of Object.entries(m.seats)) if (u === uid && W.DEF[c]) return c; return null; }
function mpHostProcess(force) {
  if (!mpNet() || !MPS.host || !mpLive() || (MPS.busy && !force)) { if (MPS.busy && MPS.thPause && typeof thHostPauseCmds === 'function') thHostPauseCmds(); return; } // 结算期间不动 S，结算完再处理（结算开始时 force 先执行已提交的命令；作战阶段暂停期间只执行战区命令）
  S.mp.cmdDone = S.mp.cmdDone || {}; S.mp.cmdRes = S.mp.cmdRes || {};
  let changed = false;
  for (const [uid, p] of Object.entries(MPS.players)) {
    if (!p || uid === MPS.uid) continue;
    const seat = mpSeatOf(uid); if (!seat || !W.isHuman(S, seat)) continue;
    const o = MPS.open[uid]; if (!o || !o.ok) continue; // 方案加密给房主：解开之后才处理
    const done = S.mp.cmdDone[uid] || 0;
    for (const c of (Array.isArray(o.cmds) ? o.cmds : []).filter(c => c && +c.n > done).sort((a, b) => a.n - b.n)) {
      const res = (S.mp.cmdRes[uid] = S.mp.cmdRes[uid] || []);
      if (c.seat && c.seat !== seat) { S.mp.cmdDone[uid] = +c.n; res.push({ n: +c.n, op: String(c.op), ok: false, msg: null }); changed = true; continue; } // 换了国家：旧命令作废
      const r = W.execCmd(S, seat, String(c.op), Array.isArray(c.args) ? c.args : []);
      S.mp.cmdDone[uid] = +c.n; changed = true;
      res.push({ n: +c.n, op: String(c.op), ok: !!(r.ok && r.r !== null && r.r !== false && !(r.r && r.r.ok === false)), msg: r.r && r.r.reason ? r.r.reason : null }); if (res.length > 12) res.splice(0, res.length - 12);
    }
  }
  if (changed) { renderAll(); mpPublishSoon(); }
  mpMaybeResolve();
}
/* 正在结算？房主看自己；其他人看元数据（房主掉线、换人后由新房主写回 plan） */
function mpResolving() {
  if (!mpNet()) return !!MPS.busy;
  if (MPS.host) return !!MPS.busy;
  const m = MPS.meta; return !!(m && m.phase === 'resolve' && mpLive() && m.turn === S.turn);
}
/* 所有真人席位就绪（或倒计时到）→ 结算 */
function mpReadyMap() {
  const out = {}; if (!S || !S.humans || !S.mp) return out;
  for (const H of S.humans) {
    const ag = (S.mp && S.mp.agents && S.mp.agents[H]) || null;
    if (ag === 'ext') { const e = MPS.ext[H]; out[H] = !!(e && e.turn === S.turn && e.ready); continue; }
    const uid = MPS.meta && MPS.meta.seats ? MPS.meta.seats[H] : null;
    if (uid === MPS.uid) { out[H] = !!MPS.ready; continue; }
    const p = uid && MPS.players[uid]; out[H] = !!(p && p.ready && p.turn === S.turn && (!MPS.host || mpOpenOk(uid, p))); // 房主要等方案解开
  }
  return out;
}
function mpMaybeResolve() {
  if (!mpNet() || !MPS.host || !mpLive() || S.over || MPS.busy || MPS.hand) return; // 接任房主：等各玩家交回私密数据
  const rm = mpReadyMap(), all = Object.values(rm).length && Object.values(rm).every(Boolean);
  const sec = mpTurnSec(MPS.meta && MPS.meta.cfg && MPS.meta.cfg.turnSec), at = (S.mp && S.mp.phaseAt) || Date.now();
  const timeUp = sec > 0 && Date.now() - at > sec * 1000;
  // 外部智能体：其他人都就绪后最多再等 MP_EXT_WAIT 秒
  const exts = Object.keys(rm).filter(H => S.mp.agents && S.mp.agents[H] === 'ext');
  const othersReady = Object.entries(rm).every(([H, v]) => v || exts.includes(H));
  const extWait = exts.length && othersReady && !all ? (MPS.extWaitAt || (MPS.extWaitAt = Date.now())) : (MPS.extWaitAt = 0);
  if (all || timeUp || (extWait && Date.now() - extWait > MP_EXT_WAIT * 1000)) { MPS.extWaitAt = 0; mpResolve(); }
}

/* ---------- 结算（房主 / 热座 / 单机） ---------- */
function mpReplayQueue(list, ext) {
  S.queue = [];
  const arr = (Array.isArray(list) ? list : []).slice(0, 40);
  for (let i = 0; i < arr.length; i++) {
    const q = arr[i]; if (!q || typeof q !== 'object') continue;
    try {
      if (q.pkg && W.RULES2) { // 规则 v2 的行动组合：整组复核，行动点按组合计（第一次遇到这一组时处理）
        const grp = arr.filter(z => z && typeof z === 'object' && z.pkg === q.pkg); if (grp[0] !== q) continue;
        W.queuePackage(S, q.target, grp.map(z => ({ id: z.type, p: mpClone(z.params || {}) })), grp.reduce((s2, z) => s2 + (z.ap | 0), 0));
      } else if (q.type === 'deploy') W.queueDeploy(S, q.from, q.to, q.v);
      else if (q.type === 'custom') W.queueCustom(S, Object.assign({}, q.order || {}, { ap: q.ap, cost: q.cost }));
      else if (q.type === 'core') W.queueCore(S, q.k, q.lvl);
      else if (q.type === 'done') W.queueDone(S, q.label, q.ap | 0);
      else if (q.type === 'deal') { const p = q.params || {}; if (W.RULES3) { if (p.act) W.queueAction(S, p.act, q.target, mpClone(p.aparams || {})); else if (!ext) W.queueDeal(S, q.target, p.terms, p.did); } } // 规则 v3：和 AI 国家签的协议（旧版外交行动照行动复核），房主按同一规则复核后排入，结算时统一处理；外部智能体不能直接签
      else if (W.ACT[q.type]) W.queueAction(S, q.type, q.target, mpClone(q.params || {}));
    } catch (e) { console.warn('replay', q, e); }
  }
}
function mpCollectOrders() {
  for (const H of S.humans) {
    if (H === S.player && MPS.seat === H) continue; // 房主自己的队列就是 S.queue
    const ag = S.mp.agents && S.mp.agents[H];
    let list = [];
    if (ag === 'ext') { const e = MPS.ext[H]; list = e && e.turn === S.turn ? e.queue || [] : []; }
    else { const uid = MPS.meta && MPS.meta.seats ? MPS.meta.seats[H] : null, p = uid && MPS.players[uid]; list = p && p.turn === S.turn && mpOpenOk(uid, p) ? MPS.open[uid].queue || [] : []; }
    W.withSeat(S, H, () => mpReplayQueue(list, ag === 'ext'));
  }
}
async function mpResolve() {
  if (MPS.busy || !S || S.over) return;
  MPS.busy = true; UI.busy = true; $('#btnEnd').disabled = true;
  const S0 = S, snap0 = mpNet() ? mpPack(S) : null; // 结算被放弃（本机不再是房主）时回到结算前的局面，免得把结算了一半的状态当作正式局面发布
  try {
    busy(0); await new Promise(r => setTimeout(r, 30));
    if (mpNet()) { mpHostProcess(true); S.mp.phase = 'resolve'; mpRenderBar(); mpMeta({ phase: 'resolve', turn: S.turn, hostAt: Date.now() }); mpExtApply(); mpCollectOrders(); mpNoteLangs(); }
    const pubs = mpPublicThisTurn(), plans = mpPlans(); // 各方本回合的公开喊话与方针（方针只有房主和 AI 推演看得到）
    const R = W.prepareTurn(S);
    for (const H of S.humans) { const RH = (S._RH && S._RH[H]) || R; const others = pubs.filter(p => p.from !== H); if (others.length) RH.pub = others.map(p => ({ from: p.from, text: p.text })); if (plans[H]) RH.plan = plans[H]; }
    let handled = new Set();
    if (mpCfg().llmWorld && useLLM()) handled = await mpLLMReactions(R, pubs, plans);
    else { busy(1); await new Promise(r => setTimeout(r, 60)); }
    thAbortIf(S0);
    W.ruleReactions(S, R, handled);
    busy(2); await new Promise(r => setTimeout(r, 40)); thAbortIf(S0);
    if (S.th && typeof thRunResolve === 'function') await thRunResolve(R); // 精细战区：6 个作战阶段（阶段之间可暂停部署）
    W.finishTurn(S);
    W.goalsTurn(S); // 目标：判定本季度达成或失败的
    S.mp.phase = 'plan'; S.mp.phaseAt = Date.now();
    MPS.ready = false; MPS.queue = S.queue = []; MPS.qKey = '[]'; MPS.hotDone = {}; MPS.plan = ''; if (S.mp.hplan) S.mp.hplan = {};
    busy(3);
    if (mpNet()) { await mpPublish(true); mpExtDigests(); mpSaveMine(); }
    else mpLocalSave();
    $('#busy').hidden = true;
    MPS.lastTurn = S.turn;
    renderAll(); mpAfterTurn();
    mpRefreshPlans();
  } catch (err) {
    if (err && err.thAbort) { $('#busy').hidden = true; if (snap0 && S === S0) try { const o = mpSanitizeSnap(JSON.parse(snap0)); W.migrate(o); o.queue = o.queue || []; o.inbox = o.inbox || []; o.chat = o.chat || {}; o.carry = o.carry || []; if (MPS.seat && W.isHuman(o, MPS.seat)) W.adoptSeat(o, MPS.seat); S = o; renderAll(); } catch (e) { console.warn('restore', e); } return; }
    console.error(err); $('#busy').hidden = true; toast(T('u.turn_err', { x: { raw: (err && err.message) || String(err) } }), 6000); if (S && S.mp) { S.mp.phase = 'plan'; if (mpNet()) mpMeta({ phase: 'plan' }); } }
  finally {
    MPS.busy = false; UI.busy = false; $('#btnEnd').disabled = false;
    if (mpNet() && MPS.host) { MPS.pubPending = false; mpPublishSoon(); setTimeout(() => { mpHostJoins(); mpHostProcess(); }, 50); } // 结算期间积压的入座与命令
  }
}
const mpCfg = () => (S && S.mp && S.mp.cfg) || {};
/* ---------- 各席位玩家的界面语言 ----------
 * 每位玩家把自己的界面语言写在自己的通道与入座记录里；房主据此让 AI 按各席位的语言写战报里的反应、新闻与危机，
 * 并把语言表存进快照（S.mp.lang）。玩家语言不同时，所有人都看得到的 AI 文字（各国表态、世界事件、战略规划、
 * 实时命令的标题与各国表态）要中英两种，各自按自己的界面语言显示。规则引擎的消息本来就按各自的语言显示。 */
const mpMyLang = () => (EN() ? 'en' : 'zh');
const mpLangOk = l => (l === 'en' || l === 'zh' ? l : null);
function mpSeatLang(H) {
  if (!S || !S.mp || S.mp.mode !== 'net' || H === MPS.seat) return mpMyLang(); // 本机（含同屏轮流）只有一种界面语言
  const uid = MPS.meta && MPS.meta.seats ? MPS.meta.seats[H] : null, p = uid && MPS.players[uid], j = uid && MPS.joins && MPS.joins[uid];
  return mpLangOk(p && p.lang) || mpLangOk(j && j.lang) || mpLangOk(S.mp.lang && S.mp.lang[H]);
}
function mpLangs() {
  const set = new Set();
  for (const H of (S && S.humans) || []) { if (S.mp && S.mp.agents && S.mp.agents[H] === 'ext') continue; const l = mpSeatLang(H); if (l) set.add(l); }
  if (!set.size) set.add(mpMyLang());
  return set;
}
const mpMixed = () => !!(S && S.mp && S.mp.mode === 'net') && mpLangs().size > 1;
function mpNoteLangs() { // 房主：把各席位的语言记进快照（换房主或玩家暂时离线时仍知道）
  if (!S || !S.mp || S.mp.mode !== 'net') return;
  const m = Object.assign({}, S.mp.lang || {}); for (const H of S.humans || []) { const l = mpSeatLang(H); if (l) m[H] = l; }
  S.mp.lang = m;
}
function mpLangChanged() { if (mpNet() && MPS.gid) { mpSaveMine(); if (MPS.host) mpNoteLangs(); } } // 切换界面语言：告诉房主
/* 房主付费：Claude 推演各国对每位真人本回合行动的反应（逐个席位） */
async function mpLLMReactions(R, pubs, plans) {
  const hs = S.humans.filter(H => !(S.mp.agents && S.mp.agents[H] === 'ext'));
  if (hs.length > 1) return mpLLMWorld(R, hs, pubs || [], plans || {}); // 多人局：一次推演同时看所有人的行动
  const handled = new Set();
  for (const H of S.humans.slice()) {
    if (S.mp.agents && S.mp.agents[H] === 'ext') continue;
    const RH = (S._RH && S._RH[H]) || R; // 这个席位的战报：记下推演引擎（战报上显示“推演引擎：…”）
    const cands = W.withSeat(S, H, () => W.reactionCandidates(S, 8)).filter(c => !handled.has(c.id));
    if (!cands.length) { RH.llmNote = 'none'; continue; }
    busy(1, T('u.llm_wait', { x: { raw: cands.map(c => NAME(c.id)).join(sep()) } }));
    try {
      const data = await W.withSeat(S, H, () => LLM.reactions(S, cands, { tier: UI.tier, lang: mpSeatLang(H) || mpMyLang(), both: mpMixed() })); // 按这位玩家的语言写
      const h = W.withSeat(S, H, () => W.applyLLMReactions(S, RH, data));
      for (const x of h) handled.add(x);
      RH.llmNote = 'claude';
    } catch (e) { console.warn('llm reactions', H, e); RH.llmNote = e && e.code === 'cancelled' ? 'skipped' : 'error'; RH.llmErr = LLM.errMsg(e); } // 结构化：这位玩家按自己的语言看
  }
  return handled;
}
/* 多人局的联合推演：各国对所有真人本回合行动的综合反应、各方策略的交叉影响、世界新闻与事件、各人的危机卡 */
async function mpLLMWorld(R, hs, pubs, plans) {
  const RHs = hs.map(H => (S._RH && S._RH[H]) || R);
  const cands = W.jointCandidates(S, hs, 10);
  if (!cands.length && !pubs.length) { for (const RH of RHs) RH.llmNote = 'none'; return new Set(); }
  busy(1, T('u.llm_wait', { x: { raw: cands.map(c => NAME(c.id)).join(sep()) || T('mp.c.public') } }));
  const langs = {}; for (const H of hs) langs[H] = mpSeatLang(H) || mpMyLang();
  try {
    const data = await LLM.world(S, { humans: hs, cands, langs, pubs, plans }, { tier: UI.tier, both: mpMixed(), lang: [...new Set(Object.values(langs))].length === 1 ? langs[hs[0]] : mpMyLang() });
    const h = W.applyWorldReactions(S, R, data);
    for (const RH of RHs) RH.llmNote = 'claude';
    return h;
  } catch (e) { console.warn('llm world', e); for (const RH of RHs) { RH.llmNote = e && e.code === 'cancelled' ? 'skipped' : 'error'; RH.llmErr = LLM.errMsg(e); } return new Set(); }
}
/* 本回合（规划阶段开始以来）各方的公开喊话 */
function mpPublicThisTurn() {
  const t0 = (S.mp && S.mp.phaseAt) || 0, out = [];
  if (mpNet()) {
    const add = (seat, list) => { for (const m of Array.isArray(list) ? list : []) if (m && m.to === '*' && typeof m.text === 'string' && +m.at >= t0) out.push({ from: seat, text: m.text.slice(0, 400), at: +m.at }); };
    if (MPS.seat) add(MPS.seat, MPS.msgs);
    for (const [uid, p] of Object.entries(MPS.players)) { if (uid === MPS.uid || !p) continue; const seat = mpSeatOf(uid); if (seat && W.isHuman(S, seat)) add(seat, p.msgs); }
  } else for (const m of (S.mp && S.mp.hmsgs) || []) if (m.to === '*' && m.turn === S.turn) out.push({ from: m.from, text: String(m.text).slice(0, 400), at: m.at });
  return out.sort((a, b) => a.at - b.at).slice(-20);
}
/* 本回合各方的方针（加密交给房主的那部分） */
function mpPlans() {
  const out = {};
  if (mpNet()) {
    if (MPS.seat && MPS.plan) out[MPS.seat] = String(MPS.plan).slice(0, 600);
    for (const [uid, p] of Object.entries(MPS.players)) { if (uid === MPS.uid || !p || p.turn !== S.turn || !mpOpenOk(uid, p)) continue; const seat = mpSeatOf(uid); if (seat && MPS.open[uid].plan) out[seat] = MPS.open[uid].plan; }
  } else for (const [H, t] of Object.entries((S.mp && S.mp.hplan) || {})) if (t && W.isHuman(S, H)) out[H] = String(t).slice(0, 600);
  return out;
}
/* Claude 智能体（模式为 claude 的国家）定期修订年度战略，房主付费，每回合最多两国 */
async function mpRefreshPlans() {
  if (!useLLM() || MPS.planBusy || !S || S.over || (mpNet() && !MPS.host)) return;
  const S0 = S; const ags = (S0.mp && S0.mp.agents) || {};
  const list = W.IDS.filter(X => ags[X] === 'claude' && !W.isHuman(S0, X) && W.indep(S0, X) && !W.isNeutral(S0, X) && (!S0.actors[X].plan || S0.actors[X].plan.until <= S0.turn)).sort((a, b) => W.power(S0, b) - W.power(S0, a)).slice(0, 2);
  if (!list.length) return; MPS.planBusy = true;
  try {
    for (const X of list) {
      const H = S0.humans.slice().sort((a, b) => Math.abs(W.rel(S0, X, b)) + (W.atWar(S0, X, b) ? 100 : 0) - Math.abs(W.rel(S0, X, a)) - (W.atWar(S0, X, a) ? 100 : 0))[0];
      const langs = [...mpLangs()]; // 战略规划所有玩家都看得到：玩家语言不同时两种语言都要
      try { const p = await W.withSeat(S0, H, () => LLM.plan(S0, X, { tier: 'default', lang: langs.length === 1 ? langs[0] : mpMyLang(), both: langs.length > 1 })); if (S === S0 && !MPS.busy && W.applyPlan(S0, X, p)) { if (mpNet()) mpPublishSoon(); else mpLocalSave(); } } catch (e) { if (e && ['not_granted', 'sampling_disabled'].includes(e.code)) break; }
    }
  } finally { MPS.planBusy = false; }
}

/* ---------- 外部智能体（经由 db 接入的程序或另一个 Claude 会话） ---------- */
function mpExtApply() {
  if (!mpLive()) return;
  S.mp.extDone = S.mp.extDone || {};
  for (const [C, e] of Object.entries(MPS.ext)) {
    if (!e || !S.mp.agents || S.mp.agents[C] !== 'ext' || !W.isHuman(S, C)) continue;
    const done = S.mp.extDone[C] || 0;
    for (const c of (Array.isArray(e.cmds) ? e.cmds : []).filter(c => c && +c.n > done).sort((a, b) => a.n - b.n).slice(0, 12)) { W.execCmd(S, C, String(c.op), Array.isArray(c.args) ? mpClone(c.args) : []); S.mp.extDone[C] = +c.n; }
    for (const m of (Array.isArray(e.say) ? e.say : []).slice(-6)) if (m && +m.n > ((S.mp.extSaid && S.mp.extSaid[C]) || 0)) { (S.mp.extSaid = S.mp.extSaid || {})[C] = +m.n; (S.mp.agentMsgs = S.mp.agentMsgs || []).push({ from: C, to: String(m.to || '*').toUpperCase().slice(0, 3), text: String(m.text || '').slice(0, 400), turn: S.turn, at: Date.now() }); S.mp.agentMsgs = S.mp.agentMsgs.slice(-60); }
  }
}
function mpExtDigests() {
  if (!mpLive() || !S.mp.agents) return;
  for (const C of S.humans.filter(H => S.mp.agents[H] === 'ext')) {
    const dig = W.withSeat(S, C, () => mpDigest(S));
    const msgs = []; const seats = (MPS.meta && MPS.meta.seats) || {};
    for (const [H, uid] of Object.entries(seats)) { if (!uid) continue; const p = uid === MPS.uid ? { msgs: MPS.msgs } : MPS.players[uid]; for (const m of (p && p.msgs) || []) if (m.to === C || m.to === '*') msgs.push({ from: H, text: m.text, at: m.at }); }
    msgs.sort((a, b) => a.at - b.at);
    dig.data.lastCmd = (S.mp.extDone && S.mp.extDone[C]) || 0; dig.data.lastSay = (S.mp.extSaid && S.mp.extSaid[C]) || 0;
    mpWrite(P_DIG(MPS.gid, C), () => ({ turn: S.turn, date: W.dateOf(S).y + 'Q' + W.dateOf(S).q, country: C, text: dig.text, data: dig.data, msgs: msgs.slice(-30), protocol: MP_EXT_DOC, at: Date.now() }));
  }
}
const MP_EXT_DOC = 'Write {turn, ready:true, queue:[orders], cmds:[{n, op, args}], say:[{n, to, text}]} to txs/<gid>/ext/<COUNTRY>. turn must equal this digest\'s turn. queue items: {type:<action id>, target:<country code>, params:{...}} (same as the game\'s action list), {type:"deploy", from, to, v:[land,navy,air shares]}. cmds are executed at once; n must be greater than data.lastCmd (say: greater than data.lastSay). ops: answerOffer [id, true|false], answerUltimatum [id, "accept"|"reject"], answerCrisis [id, optionIndex], proposeH [toCountry, terms, text], patch [{summary, changes:[{c,f,d,w,set,why}], effects, settings, we}], we [policyKey, level], weAct [action, arg]. Operational theaters (when data.th is present; zones and units by the ids listed there): thStaff [theater, true|false] (true = the AI staff commands your units; on by default for external agents), thOrder [theater, [unitIds], {k, to, via}] with k = hold|move|attack|push|rail|reserve|dig|evac|guer|raid|sweep (to/via = zone id; guer/raid only for guerrilla units, sweep only for regulars), thHold [theater, [unitIds], true|false] (no retreat), thAir [theater, {sup, cas, int, z:[zoneIds], iz:[zoneIds]}]; China theater only: thUf [act, arg] (CHN: sub|block|north|attack|talk|restrict|war; CCP: comply|talk|propaganda|expand|war), thPol [key, true|false] (CCP: rent|simple|prod|rect|hundred; JPN: cage|drive). Theater orders given now are carried out during the six 15-day phases of the next resolution. say: messages to other countries (to = code or "*").';
function mpDigest(S_) {
  const P = S_.player, x = S_.actors[P], LL = LLM._;
  const thd = mpThDigest(S_), acts = W.ACTIONS.filter(a => !a.hidden).map(a => a.id + (a.params ? '(' + a.params.map(p => p.key + ':' + (p.options ? p.options.join('|') : 'dyn')).join(',') + ')' : '')).join(' ');
  const text = `[You are the agent controlling ${P} ${W.DEF[P].en}] Date ${LL.dateEn(S_)} (turn ${S_.turn + 1}). ${LL.playerBrief(S_)}
Treasury ${LL.B(x.treasury)}; ${W.RULES3 ? `action capacity left ${W.apLeft(S_)}% of 100%` : `action points ${W.apLeft(S_)}`}.
World: ${LL.worldBrief(S_)}
Inbox (offers): ${S_.inbox.map(o => `${o.id} from ${o.from}: ${LL.EN(o.msg)}`).join(' | ') || 'none'}
Ultimatums: ${S_.ultis.filter(u => u.status === 'open').map(u => `${u.id} from ${u.from}: ${LL.EN({ k: 'ud.' + u.demand, p: { l: u.loc, b: u.with, t: u.t } })} or ${LL.EN({ k: 'uc.' + u.conseq })}`).join(' | ') || 'none'}
Crises: ${S_.crises.filter(c => !c.resolved).map(c => `${c.id}: ${LL.EN(c.title)} options ${c.options.map((o, i) => i + '=' + LL.EN(o.label)).join(', ')}`).join(' | ') || 'none'}
Last report: ${S_.report && S_.report.toYou ? S_.report.toYou.concat(S_.report.mil || []).slice(0, 12).map(m => LL.EN(m.msg)).join(' | ') : ''}
Action ids: ${acts}${thd.text}`;
  return { text, data: { inbox: S_.inbox.map(o => ({ id: o.id, from: o.from, deal: o.deal })), ultis: S_.ultis.filter(u => u.status === 'open').map(u => ({ id: u.id, from: u.from, demand: u.demand })), crises: S_.crises.filter(c => !c.resolved).map(c => ({ id: c.id, n: c.options.length })), ap: W.apLeft(S_), treasury: x.treasury, th: thd.data } };
}
/* 精细战区的摘要：自己的部队、接敌的敌方区格、中国战场的统一战线与政策 */
function mpThDigest(S_) {
  const P = S_.player; if (!S_.th) return { text: '', data: null };
  let text = ''; const data = {};
  for (const Tt of W.thTheatersOf(S_, P)) {
    const v = W.thView(S_, Tt, P), ST = W.thStatic(Tt); if (!v) continue;
    const mine = v.units.filter(u => u.own), zn = i => v.zones[i].id, ctc = new Set();
    for (const u of mine) for (const [o] of ST.adj[u.z]) if (v.zones[o].side === 'en') ctc.add(o);
    const legend = [...new Set(mine.map(u => u.z).concat([...ctc]))].slice(0, 80).map(i => `${zn(i)}=${v.zones[i].en.replace(/\s*\(.*$/, '')}`);
    text += `\nTheater ${Tt} (${v.name[1]}), AI staff ${v.staff ? 'ON' : 'OFF'}. My units (id name @zone strength% order): ${mine.slice(0, 80).map(u => `${u.id} ${u.n[1]} @${zn(u.z)} ${Math.round(u.s * 100)}% ${u.ord ? u.ord.k : 'hold'}`).join('; ') || 'none'}. Enemy-held zones in contact: ${[...ctc].map(zn).join(',') || 'none'}. Zones: ${legend.join(', ')}.`;
    if (v.fronts.length) text += ` Fronts: ${v.fronts.map(f => `${f.att}>${f.target} ${f.progress}%`).join(', ')}.`;
    if (v.cn) text += ` China: base-area population ${(v.cn.P || 0).toFixed(1)}M, KMT-CCP friction ${v.cn.uf.fr}/100${v.cn.uf.civil ? ' (civil war)' : ''}, CCP policies ${Object.keys(v.cn.pol).filter(k => v.cn.pol[k]).join(',') || '-'}, Japanese policies ${Object.keys(v.cn.jp).filter(k => v.cn.jp[k]).join(',') || '-'}.`;
    data[Tt] = { staff: v.staff, units: mine.slice(0, 120).map(u => ({ id: u.id, z: zn(u.z), t: u.t, s: u.s, k: u.ord ? u.ord.k : 'hold', gue: u.gue })), contact: [...ctc].map(zn) };
  }
  return { text, data: Object.keys(data).length ? data : null };
}

/* ---------- 收到新快照（客户端；房主刷新页面后也从这里恢复） ---------- */
async function mpOnSnap(doc) {
  if (!doc || !doc.ver || doc.ver <= MPS.snapVer) return;
  if (doc.tab === MPS.tab && doc.by === MPS.uid && mpLive()) { MPS.snapVer = doc.ver; return; } // 本标签页刚发布的
  if (MPS.meta && MPS.meta.host && doc.by !== MPS.meta.host) { MPS.pendingSnap = doc; return; } // 只认当前房主的快照（元数据可能稍后才到）
  if (MPS.snapBusy) { if (!MPS.snapNext || doc.ver > MPS.snapNext.ver) MPS.snapNext = doc; return; } // 一次处理一份（要等解密）
  MPS.snapBusy = true;
  try { await mpApplySnap(doc); }
  finally { MPS.snapBusy = false; const nx = MPS.snapNext; MPS.snapNext = null; if (nx && nx.ver > MPS.snapVer) mpOnSnap(nx); }
}
async function mpApplySnap(doc) {
  let s2; try { s2 = await mpUnpack(doc); } catch (e) { console.warn('snap', e); return; }
  if (doc.ver <= MPS.snapVer || !s2.mp || s2.mp.gid !== MPS.gid) return;
  if (doc.sx) { // 公开快照：放回自己那份私密数据（房主刷新页面时放回所有席位）
    if (!mpLive() && MPS.meta && MPS.meta.host === MPS.uid) await mpRestoreAll(s2, doc.ver);
    else if (MPS.seat && W.isHuman(s2, MPS.seat)) { const b = await mpMySec(doc.ver); if (b) mpMergeBundle(s2, b, MPS.uid); else if (MPS.lastBundle && MPS.lastBundle.seat === MPS.seat) mpMergeBundle(s2, MPS.lastBundle, MPS.uid, MPS.lastBundle.turn < s2.turn); }
    if (MPS.handTo && doc.by === MPS.handTo && s2.mp.handAck && s2.mp.handAck[MPS.uid]) { MPS.handTo = null; mpSaveMine(); } // 新房主已收到我的私密数据
    if (doc.ver <= MPS.snapVer) return;
  }
  MPS.snapVer = doc.ver; MPS.pendingSnap = null;
  const wasLive = mpLive(), sameTurn = wasLive && s2.turn === S.turn;
  const mySeat = MPS.seat && W.isHuman(s2, MPS.seat) ? MPS.seat : null; // 席位以元数据为准；快照可能比元数据旧
  if (mySeat) W.adoptSeat(s2, mySeat);
  if (!wasLive && MPS.myDoc && MPS.myDoc.turn === s2.turn && mySeat) { MPS.queue = mpClone(MPS.myDoc.queue || []); MPS.ready = !!MPS.myDoc.ready; } // 刷新页面后恢复本回合已提交的命令与就绪
  if ((sameTurn || !wasLive) && mySeat) s2.queue = MPS.queue || [];
  else { MPS.queue = s2.queue = []; MPS.ready = false; }
  MPS.qKey = JSON.stringify(s2.queue);
  const done = (s2.mp.cmdDone && s2.mp.cmdDone[MPS.uid]) || 0;
  MPS.cmdN = Math.max(MPS.cmdN, done);
  if (mySeat && !MPS.host) for (const c of MPS.cmds) if (c.n > done && (!c.seat || c.seat === mySeat)) W.execCmd(s2, mySeat, c.op, c.args); // 尚未被房主处理的命令先在本机生效
  const newTurn = wasLive && s2.turn > S.turn;
  if (newTurn && typeof thPauseClear === 'function') thPauseClear(); // 结算完成：结束作战阶段暂停
  S = s2; MPS.lastTurn = S.turn; UI.demo = false; W.useScenario(S.scen || '1939'); I18N.setPlayer(mySeat || null);
  if (!MPS.host && MPS.thDocLast && MPS.thDocLast.turn === S.turn && typeof thOnPauseDoc === 'function') { const d = MPS.thDocLast; MPS.thDocLast = null; thOnPauseDoc(d); } // 载入快照前收到的暂停
  mpCheckResults();
  renderAll();
  if (newTurn) { MPS.plan = ''; mpSaveMine(); mpAfterTurn(); }
  else if (S.over && S.over.result === 'end' && wasLive && !MPS.overShown) { MPS.overShown = true; showGameOver(); } // 房主结束了对局：公布排名
  else if (!wasLive && MPS.host) { mpHostJoins(); mpHostProcess(); } // 房主刷新后接着处理
}
function mpCheckResults() {
  const res = S && S.mp && S.mp.cmdRes && S.mp.cmdRes[MPS.uid]; if (!res) return;
  for (const r of res) if (!MPS.results[r.n]) { MPS.results[r.n] = true; if (!r.ok && r.op !== 'setMil' && r.op !== 'setMix') mpToast(T('mp.cmd_fail', { x: { raw: r.msg ? TX(r.msg) : String(r.op).slice(0, 20) } })); }
  const done = (S.mp.cmdDone && S.mp.cmdDone[MPS.uid]) || 0; MPS.cmds = MPS.cmds.filter(c => c.n > done);
}
/* 新回合：给本机玩家看自己的回合报告（观战者不弹别人的报告） */
function mpAfterTurn() {
  if (!S || UI.demo || MPS.mode === 'hot') return; // 热座：报告在交接时展示
  if (MPS.mode === 'net' && !MPS.seat) return;
  const R = S.report; if (R && !R.intro && R.turn != null) { showReport(R); if (typeof thRepInject === 'function') thRepInject(R); }
  if (S.out && MPS.seat && S.out[MPS.seat]) { const o = S.out[MPS.seat]; showModal(`<h2 class="bad">${T('mp.you_out')}</h2><p class="sub">${esc(TX(o.reason))}</p><div class="foot"><button class="btn-primary" data-close="1">${T('u.ok')}</button></div>`, 'narrow', true); }
}

/* ---------- 订阅（监听意外中断时自动重新订阅） ---------- */
function mpUnsubAll() { MPS.thDocLast = null; if (MPS.secUnsub) { try { MPS.secUnsub(); } catch (e) { } MPS.secUnsub = null; MPS.secKey = null; } for (const u of MPS.unsub) try { u(); } catch (e) { } MPS.unsub = []; for (const u of Object.values(MPS.pSubs)) try { u(); } catch (e) { } MPS.pSubs = {}; if (MPS.rm) { MPS.rm.leave().catch(() => { }); MPS.rm = null; } clearInterval(MPS.leaseT); clearInterval(MPS.hostTimer); if (typeof haReset === 'function') haReset(); }
function mpListen(make, next, tag) {
  const gid = MPS.gid; let unsub = null, dead = false;
  const sub = () => { if (dead || gid !== MPS.gid) return; try { unsub = make().onSnapshot(next, e => { console.warn(tag, e); if (!dead && gid === MPS.gid && e && !['revoked', 'not_granted', 'invalid_argument', 'capability_disabled', 'capability_removed'].includes(e.code)) setTimeout(sub, 3000 + Math.random() * 2000); }); } catch (e) { console.warn(tag, e); } };
  sub();
  return () => { dead = true; if (unsub) try { unsub(); } catch (e) { } };
}
function mpSubPlayers() {
  const m = MPS.meta; if (!m) return;
  const want = new Set(Object.values(m.seats || {}).filter(u => typeof u === 'string' && u)); want.add(MPS.uid);
  for (const uid of Object.keys(MPS.pSubs)) if (!want.has(uid)) { MPS.pSubs[uid](); delete MPS.pSubs[uid]; delete MPS.players[uid]; }
  for (const uid of want) if (!MPS.pSubs[uid]) {
    let path; try { path = P_ME(uid, MPS.gid); MPS.db.doc(path); } catch (e) { continue; } // 不合法的编号直接跳过
    MPS.pSubs[uid] = mpListen(() => MPS.db.doc(path), sn => {
      const d = sn.exists ? sn.data() : null; MPS.players[uid] = d;
      if (uid === MPS.uid && !MPS.myAt) {
        MPS.myAt = 1; MPS.myDoc = d ? mpClone(d) : null;
        if (d) {
          MPS.cmds = (Array.isArray(d.cmds) ? d.cmds : []).map(c => mpClone(c)); MPS.msgs = (Array.isArray(d.msgs) ? d.msgs : []).map(c => mpClone(c));
          MPS.cmdN = Math.max(MPS.cmdN, 0, ...MPS.cmds.map(c => +c.n || 0)); MPS.msgN = Math.max(0, ...MPS.msgs.map(c => +c.n || 0));
          const restoreQ = q => { if (mpLive() && d.turn === S.turn && MPS.seat && !(S.queue || []).length && Array.isArray(q) && q.length) { MPS.queue = S.queue = mpClone(q); MPS.ready = !!d.ready; MPS.qKey = JSON.stringify(S.queue); renderAll(); } };
          restoreQ(d.queue);
          if (d.sx && MPX.okPub(d.sxp)) { const gid = MPS.gid; MPX.open(d.sxp, gid, 'cmd|' + gid + '|' + MPS.uid + '|' + d.at, d.sx).then(v => { // 我的方案（加密给当时的房主）：自己也解得开
            if (gid !== MPS.gid || !v) return;
            const have = new Set(MPS.cmds.map(c => c.n)); MPS.cmds = MPS.cmds.concat((Array.isArray(v.cmds) ? v.cmds : []).filter(c => c && !have.has(c.n)).map(mpClone)).sort((a, b) => a.n - b.n);
            MPS.cmdN = Math.max(MPS.cmdN, 0, ...MPS.cmds.map(c => +c.n || 0));
            if (typeof v.plan === 'string' && !MPS.plan) MPS.plan = v.plan;
            if (MPS.myDoc) MPS.myDoc.queue = Array.isArray(v.queue) ? v.queue : [];
            restoreQ(v.queue);
          }).catch(e => console.warn('open mine', e)); }
        }
      }
      mpOnPlayers(uid);
    }, 'p sub');
  }
  mpNames([...want]);
}
function mpOnPlayers(uid) {
  const d = MPS.players[uid];
  if (MPS.host) { mpOpenPlayer(uid, d).then(ch => { if (ch) mpHostProcess(); }); mpHostProcess(); }
  mpOpenMsgs(uid, d).then(ch => { if (ch) mpMsgsChanged(uid); }); // 解开发给我的私信
  mpMsgsChanged(uid);
  mpRenderBar();
}
async function mpOpenGame(gid) {
  mpUnsubAll();
  Object.assign(MPS, { on: true, mode: 'net', view: 'game', gid, players: {}, joins: {}, ext: {}, snapVer: 0, meta: null, host: false, seat: null, myAt: 0, myDoc: null, results: {}, metaKey: null, extWaitAt: 0, cmds: [], msgs: [], cmdN: 0, msgN: 0, queue: [], qKey: null, ready: false, chats: {}, privLoaded: null, thread: null, unread: {}, seen: {}, pendingSnap: null, passive: false, peers: [], pubFail: 0, metaPend: {},
    open: {}, hand: null, handTo: null, handSeen: {}, lastHost: null, lastHpk: null, lastBundle: null, secDoc: null, secKey: null, dm: {}, plan: '', snapBusy: false, snapNext: null });
  try { localStorage.setItem(MP_LAST, gid); } catch (e) { }
  MPS.unsub.push(mpListen(() => MPS.db.doc(P_META(gid)), sn => { if (!sn.exists) { mpToast(T('mp.e.gone')); return; } const v = sn.data(); if (MPS.meta && (MPS.meta.mv || 0) > (v.mv || 0)) return; MPS.meta = mpClone(v); mpOnMeta(); }, 'meta'));
  MPS.unsub.push(mpListen(() => MPS.db.doc(P_SNAP(gid)), sn => { if (sn.exists) mpOnSnap(sn.data()); }, 'snap'));
  MPS.unsub.push(mpListen(() => MPS.db.collection(P_JOIN(gid)), q => { MPS.joins = {}; for (const d of q.docs) MPS.joins[d.id] = d.data(); if (MPS.host) mpHostJoins(); mpRenderLobby(); }, 'join'));
  MPS.unsub.push(mpListen(() => MPS.db.collection(P_EXTC(gid)), q => { MPS.ext = {}; for (const d of q.docs) MPS.ext[d.id] = d.data(); if (MPS.host && mpLive() && !MPS.busy) { mpExtApply(); mpPublishSoon(); mpMaybeResolve(); } }, 'ext'));
  if (typeof thSubPause === 'function') thSubPause(); // 精细战区：作战阶段暂停的战区快照
  // 在场（room）：在线状态、同一账号的多个标签页、快速通知。不等待：加入最长可能 10 秒才失败
  if (MPS.room) MPS.room.join('tx-' + gid.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 40)).then(rm => {
    if (MPS.gid !== gid || !mpNet()) { rm.leave().catch(() => { }); return; }
    MPS.rm = rm; rm.onPeers(ch => { MPS.peers = ch.peers; mpCheckTabs(); mpRenderBar(); mpRenderLobby(); }); rm.on('tick', mpOnTick);
    rm.on('ping', m => { const d = m && m.data; if (!d || !W.DEF[d.from] || d.from === MPS.seat) return; if (d.to === MPS.seat) mpToast(T('mp.ping', { a: d.from })); else if (d.to === '*' && MPS.seat) mpToast(T('mp.ping_pub', { a: d.from })); }); mpPresence();
  }).catch(e => console.warn('room', e));
  MPS.leaseT = setInterval(mpLeaseTick, 20000); setTimeout(mpLeaseTick, 1500);
  MPS.hostTimer = setInterval(() => { if (MPS.host) mpMaybeResolve(); mpRenderBar(); }, 5000);
}
/* 同一账号在多个标签页打开这局：只有一个标签页能操作（按标签编号排序，其余只读） */
function mpCheckTabs() {
  const me = (MPS.peers || []).find(p => p.sameTab), others = (MPS.peers || []).filter(p => p.isMe && !p.sameTab);
  const passive = !!(me && others.some(o => String(o.peer) < String(me.peer)));
  if (passive === MPS.passive) return;
  MPS.passive = passive;
  if (passive) { MPS.host = false; if (typeof haOnMeta === 'function') haOnMeta(); showModal(`<h2>${T('mp.e.passive')}</h2><p class="sub">${T('mp.e.passive_x')}</p><div class="foot"><button class="btn-primary" data-close="1">${T('u.ok')}</button></div>`, 'narrow', true); }
  else { mpSaveMine(); mpLeaseTick(); }
}
function mpPresence() { if (MPS.rm) MPS.rm.presence({ uid: MPS.uid, seat: MPS.seat || null, ready: !!MPS.ready, host: !!MPS.host }).catch(() => { }); }
const mpOnline = uid => uid === MPS.uid || (MPS.peers || []).some(p => p.by === uid || (p.presence && p.presence.uid === uid));
async function mpLeaseTick() {
  if (!mpNet() || !MPS.meta || MPS.passive) return;
  const m = MPS.meta, iAmHost = m.host === MPS.uid, stale = !m.hostAt || Date.now() - m.hostAt > 90000;
  if (!iAmHost && !stale) { MPS.host = false; return; }
  if (!iAmHost && !MPS.seat) return; // 只有入座的玩家才接管房主
  try {
    const r = await MPS.db.doc(P_LEASE(MPS.gid)).acquire({ holder: mpHolder(), ttlMs: 60000 });
    if (r.acquired) {
      if (!MPS.host) {
        MPS.host = true;
        if (typeof thPauseClear === 'function' && !TH_WAIT) thPauseClear(); // 接任房主：前任房主的作战阶段暂停作废（本回合重新规划）
        if (mpLive()) {
          const mx = Math.max(0, ...MPS.cmds.map(c => +c.n || 0)); if (mx) { S.mp.cmdDone = S.mp.cmdDone || {}; S.mp.cmdDone[MPS.uid] = Math.max(S.mp.cmdDone[MPS.uid] || 0, mx); MPS.cmds = []; mpSaveMine(); } // 自己尚未被处理的命令已在本机生效，接任后不再重复执行
          if (S.mp.phase === 'resolve' && !MPS.busy) S.mp.phase = 'plan'; // 前任房主在结算中途掉线：本回合重新开始规划
        }
        if (!iAmHost) { mpToast(T('mp.host_took')); mpHandStart(); } // 接任：等各玩家把自己那份私密数据交过来
        await mpMeta({ host: MPS.uid, hostAt: Date.now(), phase: mpLive() ? S.mp.phase : (m.phase === 'resolve' ? 'plan' : m.phase || 'lobby'), hpk: MPX.mine() || null });
        for (const [u, p] of Object.entries(MPS.players)) mpOpenPlayer(u, p).then(ch => { if (ch) mpHostProcess(); });
        mpPresence(); mpHostJoins(); if (mpLive()) { mpHostProcess(); mpPublishSoon(); } mpRenderBar();
        if (typeof haOnMeta === 'function') haOnMeta(); // 网页版：接任房主后按自己的 AI 决定能否共享
      } else await mpMeta({ hostAt: Date.now() });
    } else if (iAmHost) { MPS.host = false; if (typeof haOnMeta === 'function') haOnMeta(); }
  } catch (e) { console.warn('lease', e); }
}
function mpOnMeta() {
  const m = MPS.meta; if (!m) return;
  if (m.host && MPS.lastHost && m.host !== MPS.lastHost && m.host !== MPS.uid && mpLive() && mpSeatOf(MPS.uid)) { MPS.handTo = m.host; setTimeout(mpSaveMine, 50); } // 换了房主
  else if (m.host && m.hpk && MPS.lastHpk && m.hpk.x !== MPS.lastHpk.x) setTimeout(mpSaveMine, 50); // 房主换了密钥
  MPS.lastHost = m.host || MPS.lastHost; MPS.lastHpk = m.hpk || MPS.lastHpk;
  const mine = mpSeatOf(MPS.uid);
  if (mine !== MPS.seat) {
    const had = MPS.seat; MPS.seat = mine; mpPresence();
    if (had && !mine && m.status === 'play') mpToast(T('mp.seat_lost'));
    if (mpLive()) { if (mine && W.isHuman(S, mine)) { W.adoptSeat(S, mine); I18N.setPlayer(mine); } else if (!mine) I18N.setPlayer(null); renderAll(); }
  }
  if (m.host !== MPS.uid) {
    if (MPS.host) { MPS.host = false; mpLeaseTick0(); } // 别人改了房主字段：如果租约仍在本标签页手里就收回
  } else if (!MPS.host) mpLeaseTick();
  if (MPS.pendingSnap && MPS.pendingSnap.by === m.host) mpOnSnap(MPS.pendingSnap);
  mpSubPlayers(); mpSubSec();
  if (typeof haOnMeta === 'function') haOnMeta(); // 网页版：房主的 AI 统一推演（开关、换房主）
  if (m.status === 'lobby') mpRenderLobby();
  else if ($('#sheet .mplobby')) { closeModal(); mpLobbyOrPlay(); } // 房主已开局：关闭大厅，等快照
  mpRenderBar();
}
async function mpLeaseTick0() {
  try { const r = await MPS.db.doc(P_LEASE(MPS.gid)).acquire({ holder: mpHolder(), ttlMs: 60000 }); if (r.acquired) { MPS.host = true; await mpMeta({ host: MPS.uid, hostAt: Date.now(), hpk: MPX.mine() || null }); mpPublishSoon(); if (typeof haOnMeta === 'function') haOnMeta(); } } catch (e) { }
}
/* 房主：处理入座/离座 */
function mpHostJoins() {
  if (!MPS.host || !MPS.meta || MPS.busy) return;
  const seats = Object.assign({}, MPS.meta.seats || {}); let change = false;
  for (const [uid, j] of Object.entries(MPS.joins)) {
    const cur = Object.keys(seats).find(c => seats[c] === uid) || null;
    const want = j && typeof j.seat === 'string' ? j.seat.toUpperCase() : null;
    if (want === cur) continue;
    if (want && seats[want] && seats[want] !== uid) continue; // 已被占
    if (want && (!W.DEF[want] || W.NEUTRAL.includes(want) || (mpLive() && !W.indep(S, want)))) continue; // 中立地区（网页版的台湾）不能入座
    if (want && mpLive() && S.out && S.out[want]) continue; // 已出局的国家不能再入座
    if (want && MPS.meta.status !== 'lobby' && mpLive() && S.mp.agents && S.mp.agents[want] === 'ext') continue;
    const play = mpLive() && MPS.meta.status === 'play';
    if (want && play && !W.isHuman(S, want)) W.addHuman(S, want);
    if (cur && play && W.isHuman(S, cur) && !W.dropHuman(S, cur)) continue; // 最后一位真人不能离座
    if (cur && play) { const p = MPS.players[uid]; const mx = Math.max(0, ...((p && Array.isArray(p.cmds)) ? p.cmds.map(c => +c.n || 0) : [])); S.mp.cmdDone = S.mp.cmdDone || {}; if (mx) S.mp.cmdDone[uid] = Math.max(S.mp.cmdDone[uid] || 0, mx); } // 离开原席位：未处理的旧命令作废
    if (cur) seats[cur] = null;
    if (want) seats[want] = uid;
    if (want && play) mpPin(uid, (j && MPX.okPub(j.pk) && j.pk) || mpPkOf(uid), want);
    change = true;
    if (uid === MPS.uid && play) { MPS.seat = want; if (want) { W.adoptSeat(S, want); I18N.setPlayer(want); } else I18N.setPlayer(null); }
  }
  if (change) { mpMeta({ seats }); MPS.meta.seats = seats; mpSubPlayers(); if (mpLive() && MPS.meta.status === 'play') { renderAll(); mpPublishSoon(); } }
}
