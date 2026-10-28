// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 网页版 · 联机后端（在 claude.ai 之外运行时代替 window.claude 的 db / room / user） =====================
 * 联机版原本用 claude.ai 页面运行时的共享数据库（db）、房间（room）与身份（user）。放到 GitHub Pages 等普通网站上时没有这些能力，
 * 这里用公共 MQTT 中继服务器（经 WebSocket）实现同样的接口，供 04m_net.js 等联机代码原样使用：
 *   · 文档 = 中继上的“保留消息”（主题 <命名空间>/<文档路径>），内容 {s: 版本戳, w: 写入者, d: 数据}；同一文档以版本戳最大者为准
 *     （版本戳取 max(本机时钟, 已见版本 + 1)，换房主后不受两台机器时钟差的影响）；删除写入 d: null。
 *   · 同时连接几台中继，写入发往每一台、读取取并集；某台中继上的版本旧了，看到的人会把新版本补发过去。
 *   · 租约（acquire）：先看当前持有者是否过期（按写入时间与本机收到时间中较早的那个算），再写入声明，等 1.5 秒看谁的声明版本最新。
 *   · 房间：在场信息是每 15 秒刷新的保留消息，45 秒没有刷新就算离开；事件是普通消息，按编号去重。
 *   · 身份：本机随机编号（localStorage），昵称由玩家在开局画面填写，写在 <命名空间>/u/<编号>。
 *   · 私人数据（data/users/…，与国家智能体的谈判记录）只存本机。
 * 推演层的 sample 由 02_ai.js 提供（玩家在设置里接入 ChatGPT、DeepSeek、豆包等，自带密钥或一键授权；没接入时返回 null，游戏用规则引擎）；
 * 联网对局里房主共享了自己的 AI 时，改由 src/web/ui/04y_hostai.js 经房主转发（window.__txSampleHook）。导出存档直接下载文件。
 * 地址参数：broker=ws://…（逗号分隔，覆盖默认中继，测试用）、ns=命名空间、u=/n= 测试用的编号与昵称、g=对局编号（邀请链接）。
 */
(() => {
  if (window.claude && window.claude.use) return; // 在 claude.ai 里打开：用真正的运行时
  const qs = new URLSearchParams(location.search);
  const NS = String(qs.get('ns') || window.TX_NS || 'tianxia-web/v1').replace(/[#+\u0000]/g, '').replace(/\/+$/, '');
  const DEF = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://mqtt.eclipseprojects.io:443/mqtt'];
  const BROKERS = (qs.get('broker') ? qs.get('broker').split(',') : DEF).map(s => s.trim()).filter(s => /^wss?:\/\//.test(s)).slice(0, 4);
  const LS = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } } };
  const rnd = n => { const a = new Uint8Array(n); try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < n; i++) a[i] = Math.random() * 256; } return Array.from(a, b => (b % 36).toString(36)).join(''); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const { enc, dec } = TXMQ;
  // —— 身份 ——
  const U = qs.get('u');
  let uid = U ? 'u_' + U.replace(/[^A-Za-z0-9_]/g, '').slice(0, 24) : LS.get('tianxia.web.uid');
  if (!uid || !/^[A-Za-z0-9_]{4,40}$/.test(uid)) { uid = 'w' + rnd(12); LS.set('tianxia.web.uid', uid); }
  const nameKey = 'tianxia.web.name' + (U ? '.' + uid : '');
  if (qs.get('n')) LS.set(nameKey, qs.get('n').slice(0, 20));
  const myName = () => (LS.get(nameKey) || '').trim() || '玩家' + uid.slice(-4).toUpperCase();
  const tab = rnd(8), writer = uid + '.' + tab, peer = 'p' + rnd(10);
  const g0 = qs.get('g'); if (g0 && /^[a-z0-9]{4,40}$/.test(g0)) LS.set((window.TX_LSP || 'tianxia') + '.mp.last', g0); // 邀请链接：直接进入这局
  const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
  const copy = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const merge = (a, b) => { const o = Object.assign({}, a); for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) ? merge(o[k], v) : v; return o; };
  const parentOf = p => p.split('/').slice(0, -1).join('/');

  /* ---------- 中继连接 ---------- */
  const conns = BROKERS.map((url, i) => ({ url, i, cl: null, up: false, tries: 0, subs: new Set() }));
  const upList = () => conns.filter(c => c.up);
  const upWait = [];
  const subs = new Map(); // 主题过滤 → { ref, synced, ok, res, seen: Map(中继 → Set(路径)), idle }
  function open(c) {
    const cl = TXMQ.connect(c.url, { clientId: 'tx' + rnd(16), keepalive: 30 });
    c.cl = cl;
    cl.on('connect', () => {
      c.up = true; c.tries = 0;
      while (upWait.length) upWait.shift()();
      c.subs.clear(); for (const f of subs.keys()) subOnGrace(c, f);
      pubProfile(c);
      for (const p of dirty) republish(p, c);
      for (const R of rooms.values()) R.beat();
      status();
    });
    cl.on('message', (t, b, r) => onMsg(c, t, b, r));
    cl.on('close', () => { if (c.cl !== cl) return; c.up = false; c.cl = null; c.subs.clear(); status(); setTimeout(() => open(c), Math.min(30000, 1000 * 2 ** Math.min(c.tries++, 5)) * (0.7 + Math.random() * 0.6)); });
  }
  const anyUp = ms => (upList().length ? Promise.resolve(true) : new Promise(r => { upWait.push(() => r(true)); setTimeout(() => r(upList().length > 0), ms); }));
  const st = { cbs: [] };
  function status() { const n = upList().length; for (const f of st.cbs) try { f(n, conns.length); } catch (e) { } }
  // 订阅确认后的宽限时间：单个文档 600 毫秒，通配 1 秒
  const graceOf = f => (/[+#]/.test(f) ? 1000 : 600);
  function ensure(f) {
    let s = subs.get(f);
    if (!s) {
      let res; const synced = new Promise(r => (res = r));
      s = { ref: 0, ok: false, res, synced, seen: new Map(), idle: null };
      subs.set(f, s);
      for (const c of upList()) subOnGrace(c, f);
    }
    clearTimeout(s.idle); s.idle = null;
    return s;
  }
  function subOnGrace(c, f) {
    if (!c.up || c.subs.has(f)) return;
    c.subs.add(f); const s = subs.get(f); if (s) s.seen.set(c.i, new Set());
    c.cl.subscribe([f], 1).then(codes => {
      setTimeout(() => {
        const s2 = subs.get(f); if (!s2) return;
        if (codes && codes[0] === 0x80) { c.subs.delete(f); return; }
        if (!s2.ok) { s2.ok = true; s2.res(); }
        heal(c, f, s2.seen.get(c.i)); s2.seen.delete(c.i);
      }, graceOf(f));
    }, () => c.subs.delete(f));
  }
  function release(f) {
    const s = subs.get(f); if (!s) return;
    if (--s.ref > 0) return;
    s.ref = 0; clearTimeout(s.idle);
    s.idle = setTimeout(() => { if (s.ref > 0) return; subs.delete(f); for (const c of conns) if (c.subs.has(f)) { c.subs.delete(f); if (c.up) c.cl.unsubscribe([f]).catch(() => { }); } }, 60000);
  }
  async function synced(f, ms) {
    const s = ensure(f); s.ref++;
    try {
      if (!s.ok) { await anyUp(ms || 8000); if (!upList().length) throw { code: 'unavailable', message: 'no relay connected' }; await Promise.race([s.synced, sleep(ms || 8000)]); }
    } finally { release(f); }
  }
  const topicOf = p => NS + '/' + p;
  const matchF = (f, t) => { const a = f.split('/'), b = t.split('/'); for (let i = 0; i < a.length; i++) { if (a[i] === '#') return true; if (i >= b.length) return false; if (a[i] !== '+' && a[i] !== b[i]) return false; } return a.length === b.length; };

  /* ---------- 文档副本 ---------- */
  const docs = new Map(); // 路径 → { s, w, d, rt }
  const kids = new Map(); // 集合路径 → Set(文档路径)
  const docL = new Map(), colL = new Map();
  const dirty = new Set(); // 还没有任何中继确认的写入
  const addL = (m, k, f) => { let s = m.get(k); if (!s) m.set(k, (s = new Set())); s.add(f); };
  const delL = (m, k, f) => { const s = m.get(k); if (s) { s.delete(f); if (!s.size) m.delete(k); } };
  const newer = (m, cur) => !cur || m.s > cur.s || (m.s === cur.s && m.w > cur.w);
  function put(path, m) {
    docs.set(path, { s: m.s, w: m.w, d: m.d === undefined ? null : m.d, rt: Date.now() });
    const pc = parentOf(path); let k = kids.get(pc); if (!k) kids.set(pc, (k = new Set())); k.add(path);
    const a = docL.get(path); if (a) for (const f of [...a]) f();
    const b = colL.get(pc); if (b) for (const f of [...b]) f();
  }
  function onMsg(c, topic, bytes, retain) {
    if (!topic.startsWith(NS + '/')) return;
    const path = topic.slice(NS.length + 1);
    if (path.startsWith('rm/')) { onRoom(path, bytes); return; }
    if (path.startsWith('u/')) { onProfile(path.slice(2), bytes); return; }
    if (!bytes.length) return;
    let m; try { m = JSON.parse(dec.decode(bytes)); } catch (e) { return; }
    if (!m || typeof m.s !== 'number' || typeof m.w !== 'string') return;
    for (const [f, s] of subs) { const seen = s.seen.get(c.i); if (seen && matchF(f, topic)) seen.add(path); }
    const cur = docs.get(path);
    if (newer(m, cur)) put(path, m);
    else if (retain && cur && (m.s !== cur.s || m.w !== cur.w)) republishSoon(path, c); // 这台中继上的版本旧了：补发
  }
  const rpT = new Map();
  function republishSoon(path, c) { const k = c.i + ' ' + path; if (rpT.has(k)) return; rpT.set(k, setTimeout(() => { rpT.delete(k); republish(path, c); }, 300 + Math.random() * 1200)); }
  function republish(path, c) { const cur = docs.get(path); if (!cur || !c.up) return; c.cl.publish(topicOf(path), enc.encode(JSON.stringify({ s: cur.s, w: cur.w, d: cur.d })), { qos: 1, retain: true }).then(() => dirty.delete(path)).catch(() => { }); }
  // 订阅确认后，副本里有、这台中继却没有送来的文档：补发（中继重启丢了保留消息，或者当时没连上）
  function heal(c, f, seen) { if (!seen) return; for (const [p, cur] of docs) { if (seen.has(p) || !matchF(f, topicOf(p)) || cur.d == null) continue; republish(p, c); } }

  async function write(path, d) {
    const cur = docs.get(path), m = { s: Math.max(Date.now(), cur ? cur.s + 1 : 0), w: writer, d };
    const bytes = enc.encode(JSON.stringify(m));
    if (bytes.length > 245000) throw { code: 'invalid_argument', message: 'document over 240 KiB' };
    put(path, m); dirty.add(path);
    const up = upList();
    if (!up.length) throw { code: 'unavailable', message: 'no relay connected' };
    await new Promise((res, rej) => {
      let left = up.length, ok = false;
      const t = setTimeout(() => { if (!ok) rej({ code: 'unavailable', message: 'relay timeout' }); }, 12000);
      for (const c of up) c.cl.publish(topicOf(path), bytes, { qos: 1, retain: true }).then(() => { const now = docs.get(path); if (now && now.s === m.s && now.w === m.w) dirty.delete(path); if (!ok) { ok = true; clearTimeout(t); res(); } }, () => { if (--left === 0 && !ok) { clearTimeout(t); rej({ code: 'unavailable', message: 'relay error' }); } });
    });
  }
  // —— 私人数据：只存本机 ——
  const PRIV = 'tianxia.web.priv/';
  const isPriv = p => p.startsWith('data/');
  function privGet(p) { try { const t = LS.get(PRIV + p); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
  function privSet(p, d) { if (d == null) { try { localStorage.removeItem(PRIV + p); } catch (e) { } } else LS.set(PRIV + p, JSON.stringify(d)); const a = docL.get(p); if (a) for (const f of [...a]) f(); }

  /* ---------- db 接口（与 claude.ai 的 db 能力同形） ---------- */
  const SEG = /^[A-Za-z0-9_\-.~:@+]+$/;
  function check(p, kind) {
    if (typeof p !== 'string' || !p) throw new TypeError('path must be a non-empty string');
    const s = p.split('/');
    for (const x of s) if (!SEG.test(x) || x === '.' || x === '..' || x.length > 200) throw new TypeError('bad segment "' + x + '" in ' + p);
    if (kind === 'doc' && s.length % 2) throw new TypeError('document path needs an even number of segments: ' + p);
    if (kind === 'col' && !(s.length % 2)) throw new TypeError('collection path needs an odd number of segments: ' + p);
  }
  const snapOf = (id, d) => ({ id, exists: d != null, data: () => (d == null ? undefined : deepFreeze(copy(d))), metadata: { fromCache: false, hasPendingWrites: false } });
  const qsnapOf = list => { const docsA = list.map(x => snapOf(x.id, x.d)); return { docs: docsA, size: docsA.length, empty: !docsA.length, docChanges: () => docsA.map((d, i) => ({ type: 'added', doc: d, oldIndex: -1, newIndex: i })), metadata: { fromCache: false, hasPendingWrites: false } }; };
  const cur = p => { if (isPriv(p)) return privGet(p); const c = docs.get(p); return c && c.d != null ? c.d : null; };
  function docRef(p) {
    check(p, 'doc'); const id = p.split('/').pop(), f = topicOf(p);
    return {
      id, path: p,
      async get() { if (!isPriv(p)) await synced(f); return snapOf(id, cur(p)); },
      async set(data) { if (!data || typeof data !== 'object' || Array.isArray(data)) throw { code: 'invalid_argument', message: 'body must be an object' }; if (isPriv(p)) return privSet(p, copy(data)); await write(p, copy(data)); },
      async update(data) { if (isPriv(p)) { const o = privGet(p); if (!o) throw { code: 'invalid_argument', message: 'update of missing doc' }; return privSet(p, merge(o, copy(data))); } await synced(f); const o = cur(p); if (!o) throw { code: 'invalid_argument', message: 'update of missing doc' }; await write(p, merge(o, copy(data))); },
      async delete() { if (isPriv(p)) return privSet(p, null); await write(p, null); },
      async acquire(o) {
        o = o || {}; const holder = String(o.holder || ''), ttl = Math.min(600000, Math.max(1000, +o.ttlMs || 30000));
        await synced(f);
        const c0 = docs.get(p), now = Date.now();
        const expOf = c => Math.min(c.rt, +c.d.at || c.s) + (+c.d.ttl || 0); // 按写入时间与本机收到时间中较早的那个算（晚订阅才收到的旧租约不会显得还新）
        if (c0 && c0.d && c0.d.holder && c0.d.holder !== holder && expOf(c0) > now) return { acquired: false, expiresAt: new Date(expOf(c0)).toISOString() };
        await write(p, Object.assign({}, (c0 && c0.d) || {}, o.data || {}, { holder, ttl, at: now }));
        await sleep(1500); // 等别人的声明送到：版本最新的那份为准
        const c1 = docs.get(p);
        return c1 && c1.d && c1.d.holder === holder ? { acquired: true, holder, expiresAt: new Date(Date.now() + ttl).toISOString(), version: c1.s } : { acquired: false, expiresAt: c1 && c1.d ? new Date(expOf(c1)).toISOString() : null };
      },
      onSnapshot(next, err) {
        let alive = true, last;
        const fire = () => { if (!alive) return; const c = isPriv(p) ? privGet(p) : docs.get(p); const k = isPriv(p) ? JSON.stringify(c) : c ? c.s + '|' + c.w : 'none'; if (k === last) return; last = k; try { next(snapOf(id, cur(p))); } catch (e) { console.error('onSnapshot handler', e); } };
        addL(docL, p, fire);
        if (isPriv(p)) { setTimeout(fire, 0); return () => { alive = false; delL(docL, p, fire); }; }
        const s = ensure(f); s.ref++;
        if (docs.has(p)) setTimeout(fire, 0);
        (async () => { await anyUp(10000); if (!alive) return; if (!upList().length && !docs.has(p)) { if (err) err({ code: 'unavailable', message: 'no relay connected' }); return; } await s.synced; fire(); })();
        return () => { if (!alive) return; alive = false; delL(docL, p, fire); release(f); };
      },
      collection: sub => colRef(p + '/' + sub),
    };
  }
  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function matches(d, [fl, op, v]) {
    const x = d[fl];
    switch (op) { case '==': return x === v; case '!=': return x !== v; case '<': return x < v; case '<=': return x <= v; case '>': return x > v; case '>=': return x >= v; case 'in': return Array.isArray(v) && v.includes(x); case 'not-in': return Array.isArray(v) && !v.includes(x); case 'array-contains': return Array.isArray(x) && x.includes(v); }
    return false;
  }
  function listOf(col, filters, order, lim) {
    let list = [...(kids.get(col) || [])].map(p => ({ id: p.split('/').pop(), d: cur(p), c: docs.get(p) })).filter(x => x.d != null);
    for (const fl of filters) list = list.filter(x => matches(x.d, fl));
    if (order) { const [fl, dir] = order; list.sort((x, y) => (x.d[fl] === undefined) - (y.d[fl] === undefined) || cmp(x.d[fl], y.d[fl]) * (dir === 'desc' ? -1 : 1)); } else list.sort((x, y) => cmp(x.id, y.id));
    if (lim) list = list.slice(0, lim);
    return list;
  }
  function query(col, filters, order, lim) {
    const f = topicOf(col) + '/+';
    return {
      where: (fl, op, v) => query(col, filters.concat([[fl, op, v]]), order, lim),
      orderBy: (fl, dir = 'asc') => query(col, filters, [fl, dir], lim),
      limit: n => query(col, filters, order, n),
      async get() { await synced(f); return qsnapOf(listOf(col, filters, order, lim)); },
      onSnapshot(next, err) {
        let alive = true, last;
        const fire = () => { if (!alive) return; const list = listOf(col, filters, order, lim), k = list.map(x => x.id + ':' + x.c.s + ':' + x.c.w).join(','); if (k === last) return; last = k; try { next(qsnapOf(list)); } catch (e) { console.error('query handler', e); } };
        addL(colL, col, fire);
        const s = ensure(f); s.ref++;
        if ((kids.get(col) || new Set()).size) setTimeout(fire, 0);
        (async () => { await anyUp(10000); if (!alive) return; if (!upList().length) { if (err) err({ code: 'unavailable', message: 'no relay connected' }); return; } await s.synced; fire(); })();
        return () => { if (!alive) return; alive = false; delL(colL, col, fire); release(f); };
      },
    };
  }
  function colRef(p) { check(p, 'col'); return Object.assign(query(p, [], null, null), { path: p, doc: id => docRef(p + '/' + (id || rnd(12))), add: async data => { const r = docRef(p + '/' + rnd(12)); await r.set(data); return r; } }); }
  const db = Object.freeze({ doc: docRef, collection: colRef });

  /* ---------- 房间：在场与事件 ---------- */
  const rooms = new Map();
  const ROOMRE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
  const seenEv = new Map();
  function onRoom(path, bytes) {
    const s = path.split('/'); const R = rooms.get(s[1]); if (!R) return;
    if (s[2] === 'p') { // 在场
      const pid = s[3]; if (!pid) return;
      if (!bytes.length) { if (R.peers.delete(pid)) R.notify(); return; }
      let m; try { m = JSON.parse(dec.decode(bytes)); } catch (e) { return; }
      if (!m || typeof m !== 'object') return;
      if (Date.now() - (+m.at || 0) > 120000) return; // 早已离开的人留下的在场信息
      const old = R.peers.get(pid);
      if (old && (+old.at || 0) > (+m.at || 0)) return;
      R.peers.set(pid, { by: String(m.by || ''), presence: m.presence && typeof m.presence === 'object' ? m.presence : {}, at: +m.at || 0, rt: Date.now() });
      R.notify();
    } else if (s[2] === 'e') { // 事件
      const topic = s.slice(3).join('/'); if (!topic) return;
      let m; try { m = JSON.parse(dec.decode(bytes)); } catch (e) { return; }
      if (!m || typeof m !== 'object' || !m.id) return;
      if (seenEv.has(m.id)) return; seenEv.set(m.id, Date.now());
      if (seenEv.size > 800) { const cut = Date.now() - 60000; for (const [k, t] of seenEv) if (t < cut) seenEv.delete(k); }
      const fns = R.topics.get(topic); if (!fns) return;
      const ev = deepFreeze({ topic, data: m.data === undefined ? null : m.data, peer: String(m.peer || ''), by: String(m.by || ''), isMe: m.by === uid, sameTab: m.peer === peer, kind: 'viewer', guest: false });
      for (const fn of [...fns]) try { fn(ev); } catch (e) { console.error(e); }
    }
  }
  function namedRoom(name) {
    const base = NS + '/rm/' + name, f = base + '/#';
    const R = { name, topics: new Map(), peers: new Map(), fns: new Set(), me: {}, last: [], left: false };
    R.list = () => { const now = Date.now(); const out = []; for (const [pid, v] of R.peers) if (pid === peer || now - v.rt < 45000) out.push({ peer: pid, by: v.by, presence: v.presence, updatedAt: v.at, kind: 'viewer', guest: false, isMe: v.by === uid, sameTab: pid === peer }); return deepFreeze(out); };
    R.notify = () => {
      const peers = R.list(), old = new Set(R.last.map(p => p.peer)), now = new Set(peers.map(p => p.peer));
      const ch = { peers, joined: peers.filter(p => !old.has(p.peer)), left: R.last.filter(p => !now.has(p.peer)), updated: peers.filter(p => old.has(p.peer)) };
      R.last = peers;
      for (const fn of [...R.fns]) try { fn(ch); } catch (e) { console.error(e); }
    };
    R.beat = () => { if (R.left) return; const body = enc.encode(JSON.stringify({ by: uid, presence: R.me, at: Date.now() })); R.peers.set(peer, { by: uid, presence: R.me, at: Date.now(), rt: Date.now() }); for (const c of upList()) c.cl.publish(base + '/p/' + peer, body, { qos: 1, retain: true }).catch(() => { }); };
    const s = ensure(f); s.ref++;
    R.hb = setInterval(R.beat, 15000);
    R.exp = setInterval(() => { const k = R.list().map(p => p.peer).join(','); if (k !== R.last.map(p => p.peer).join(',')) R.notify(); }, 10000);
    R.beat(); setTimeout(R.notify, 0);
    const api = {
      name,
      emit: async (topic, data) => { if (R.left) return; const body = enc.encode(JSON.stringify({ id: rnd(12), peer, by: uid, data: data === undefined ? null : data })); if (body.length > 8192) throw { code: 'invalid_argument', message: 'event too large' }; const up = upList(); if (!up.length) throw { code: 'unavailable' }; for (const c of up) c.cl.publish(base + '/e/' + topic, body, { qos: 0 }).catch(() => { }); },
      on: (topic, fn) => { let t = R.topics.get(topic); if (!t) R.topics.set(topic, (t = new Set())); t.add(fn); return () => t.delete(fn); },
      presence: async patch => { R.me = Object.assign({}, R.me, patch || {}); for (const k of Object.keys(R.me)) if (R.me[k] === null) delete R.me[k]; R.beat(); },
      peers: () => R.list(),
      onPeers: fn => { R.fns.add(fn); return () => R.fns.delete(fn); },
      connected: () => upList().length > 0,
      onConnection: fn => { const cb = n => fn(n > 0); st.cbs.push(cb); setTimeout(() => cb(upList().length), 0); return () => { const i = st.cbs.indexOf(cb); if (i >= 0) st.cbs.splice(i, 1); }; },
      leave: async () => { if (R.left) return; R.left = true; clearInterval(R.hb); clearInterval(R.exp); if (rooms.get(name) === R) rooms.delete(name); for (const c of upList()) c.cl.publish(base + '/p/' + peer, new Uint8Array(0), { qos: 1, retain: true }).catch(() => { }); release(f); },
    };
    rooms.set(name, R);
    return api;
  }
  const room = Object.freeze({
    join: async name => { if (!ROOMRE.test(name)) throw { code: 'invalid_argument', message: 'room name' }; return namedRoom(name); },
    emit: () => Promise.resolve(), on: () => () => { }, presence: () => Promise.resolve(), peers: () => [], onPeers: () => () => { }, connected: () => upList().length > 0, onConnection: () => () => { },
  });
  addEventListener('pagehide', () => { for (const R of rooms.values()) for (const c of upList()) try { c.cl.publish(NS + '/rm/' + R.name + '/p/' + peer, new Uint8Array(0), { qos: 0, retain: true }); } catch (e) { } });

  /* ---------- 身份与昵称 ---------- */
  const profs = new Map(); // 编号 → { name, at }
  function onProfile(id, bytes) { if (!bytes.length) return; let m; try { m = JSON.parse(dec.decode(bytes)); } catch (e) { return; } if (!m || typeof m.name !== 'string') return; const o = profs.get(id); if (o && (+o.at || 0) > (+m.at || 0)) return; profs.set(id, { name: m.name.replace(/[<>]/g, '').slice(0, 20), at: +m.at || 0 }); }
  function pubProfile(c) { const body = enc.encode(JSON.stringify({ name: myName(), at: Date.now() })); profs.set(uid, { name: myName(), at: Date.now() }); for (const x of c ? [c] : upList()) x.cl.publish(NS + '/u/' + uid, body, { qos: 1, retain: true }).catch(() => { }); }
  const prof = id => ({ id, name: id === uid ? myName() : (profs.get(id) || {}).name || '', avatarUrl: null, color: '#888', email: null, isMe: id === uid, guest: false });
  const user = Object.freeze({
    isOwner: async () => false, canEdit: async () => true, can: async n => n === 'data.write',
    me: async () => ({ id: uid, name: myName(), avatarUrl: null, color: '#888', email: null, isOwner: false, canEdit: true }),
    id: async () => uid, name: async () => myName(), avatarUrl: async () => null, email: async () => null, search: async () => [],
    profiles: async ids => {
      ids = [].concat(ids).filter(id => typeof id === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(id));
      const need = ids.filter(id => id !== uid && !profs.has(id));
      if (need.length && upList().length) await Promise.all(need.map(id => synced(NS + '/u/' + id, 3000).catch(() => { })));
      const o = {}; for (const id of ids) o[id] = prof(id); return o;
    },
  });

  /* ---------- 下载（导出存档） ---------- */
  const downloads = Object.freeze({
    save: async ({ filename, data, mimeType }) => {
      const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType || 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = String(filename || 'tianxia.json').replace(/[\\/:*?"<>|]/g, '_');
      a.addEventListener('click', e => e.stopPropagation()); // 页面的全局点击处理会拦下所有链接的默认动作
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      return { saved: true };
    },
  });

  /* ---------- 对外 ---------- */
  for (const c of conns) open(c);
  window.claude = Object.freeze({
    use: async n => {
      if (n === 'db') { await anyUp(8000); return upList().length ? db : null; }
      if (n === 'room') return room;
      if (n === 'user') return user;
      if (n === 'downloads') return downloads;
      if (n === 'sample') { // 玩家自己接入的 AI（没接入时为 null）；联网对局开了“房主的 AI 统一推演”时经房主转发（src/web/ui/04y_hostai.js）
        const h = window.__txSampleHook, r = typeof h === 'function' ? h() : undefined;
        return r !== undefined ? r : window.TXAI ? window.TXAI.sample() : null;
      }
      return null;
    },
  });
  window.__txWeb = {
    uid, peer, ns: NS, brokers: BROKERS.slice(),
    name: myName,
    setName(v) { v = String(v || '').replace(/[<>]/g, '').trim().slice(0, 20); LS.set(nameKey, v); pubProfile(); return myName(); },
    relays: () => conns.map(c => ({ url: c.url, up: c.up })),
    onStatus(fn) { st.cbs.push(fn); setTimeout(() => fn(upList().length, conns.length), 0); },
    _docs: docs, _subs: subs,
  };
})();
