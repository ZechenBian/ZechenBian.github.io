/* ===================== 网页版 v4 · 联网：房间密码与名称检查（包在 01_shim.js 的 db / user 外面） =====================
 * 房间密码：建局时设了密码，房主用 PBKDF2（SHA-256，12 万次，盐 = 对局编号）从密码派生 512 位：前 256 位是 AES-GCM 密钥，
 * 后 96 位公开作“校验码”（只用来判断密码对不对，推不出密钥）。这局的文档在写进中继之前加密，读出来之后解密：
 *   · txs/<gid>（对局元数据）：对局列表要用的字段（名称、年代、状态、席位、房主在线时间、锁与校验码）明文保留，其余加密；
 *   · txs/<gid>/…（快照、各席位的私密数据、入座请求、外部智能体……）与 txu/<uid>/<gid>/p（各玩家的通道）：整份加密；
 *   · 房主租约 txs/<gid>/lease/host 不加密（只有编号；租约的抢占逻辑要读它）。
 * 加密格式 { _e: 1, z: 1, iv, ct }：先 gzip 再 AES-GCM（附加数据 = 文档路径，换了位置就解不开），密文 base64。
 * 密钥存在本机（localStorage，各对局一条），刷新页面不用重输；没有密钥的人看得到列表里带锁的这一局，进不去，也读不到内容。
 * 解不开的写入（有人乱写）不予理会，继续用上一份解得开的版本。在场信息与“有更新”的通知走房间事件，不含对局内容，不加密。
 * 名称：读到的对局名称、默认名称里的昵称、玩家资料里的昵称，不合规（见 01a_v4nmcore.js）的一律换掉：对局名称显示成“#编号的 年代”，昵称显示成“某位玩家”。 */
(() => {
  if (!window.claude || !window.claude.use || !window.__txWeb) return; // 只在网页版的联机后端上（claude.ai 里不用）
  const base = window.claude;
  const LKEY = (window.TX_LSP || 'tianxia4') + '.locks';
  const te = new TextEncoder(), td = new TextDecoder();
  const LS = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } } };
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const b64u = u8 => b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const copy = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
  const merge = (a, b) => { const o = Object.assign({}, a); for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) ? merge(o[k], v) : v; return o; };
  /* ---------- 密钥 ---------- */
  const keys = new Map(); // gid → { key: CryptoKey, pv }
  let store = {}; try { store = JSON.parse(LS.get(LKEY) || '{}') || {}; } catch (e) { store = {}; }
  const save = () => LS.set(LKEY, JSON.stringify(store));
  const ready = (async () => { for (const [gid, v] of Object.entries(store)) { try { keys.set(gid, { key: await crypto.subtle.importKey('raw', unb64(v.k), 'AES-GCM', false, ['encrypt', 'decrypt']), pv: v.pv }); } catch (e) { } } })();
  async function derive(gid, pw) {
    const km = await crypto.subtle.importKey('raw', te.encode(String(pw).normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: te.encode('tianxia-v4-room|' + gid), iterations: 120000, hash: 'SHA-256' }, km, 512));
    return { raw: bits.slice(0, 32), pv: b64u(bits.slice(32, 44)) };
  }
  async function useKey(gid, raw, pv, pw) {
    keys.set(gid, { key: await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']), pv });
    store[gid] = Object.assign({ k: b64(raw), pv, at: Date.now() }, pw ? { pw: String(pw) } : {}); // 房主自己的密码也记一份，方便在大厅里再看
    const ids = Object.keys(store); if (ids.length > 40) { ids.sort((a, b) => (store[a].at || 0) - (store[b].at || 0)); for (const id of ids.slice(0, ids.length - 40)) delete store[id]; }
    save();
  }
  /* ---------- 加密与解密 ---------- */
  async function gz(u8, inflate) {
    const cs = inflate ? new DecompressionStream('gzip') : new CompressionStream('gzip'); const w = cs.writable.getWriter(); w.write(u8); w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  }
  const canZ = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
  async function seal(gid, path, obj) {
    const k = keys.get(gid); if (!k) throw { code: 'permission_denied', message: 'room locked' };
    let pt = te.encode(JSON.stringify(obj)); const z = canZ ? 1 : 0; if (z) pt = await gz(pt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(path) }, k.key, pt));
    return { _e: 1, z, iv: b64(iv), ct: b64(ct) };
  }
  async function open(gid, path, box) {
    const k = keys.get(gid); if (!k || !box || box._e !== 1) return undefined;
    try {
      let pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv), additionalData: te.encode(path) }, k.key, unb64(box.ct)));
      if (box.z) pt = await gz(pt, true);
      return JSON.parse(td.decode(pt));
    } catch (e) { return undefined; }
  }
  /* ---------- 路径 ---------- */
  const RE_META = /^txs\/([a-z0-9]{4,40})$/, RE_TXS = /^txs\/([a-z0-9]{4,40})\//, RE_TXU = /^txu\/[A-Za-z0-9_]{1,40}\/([a-z0-9]{4,40})\//;
  const gidOf = p => { const m = RE_META.exec(p) || RE_TXS.exec(p) || RE_TXU.exec(p); return m ? m[1] : null; };
  const isLease = p => /^txs\/[a-z0-9]{4,40}\/lease\/host$/.test(p);
  const lockedAt = new Set(); // 看到过元数据带锁的对局（没有密钥时，写入一律拒绝）
  const PUB = ['v', 'id', 'title', 'tdef', 'scen', 'created', 'status', 'hostAt', 'seats', 'date', 'lock', 'pv']; // 对局列表要用的字段
  /* 名称检查：不合规的对局名称与昵称换掉 */
  const nmOk = (s, k) => typeof TXNM === 'undefined' || TXNM.ok(s, k);
  function cleanMeta(gid, m) {
    if (!m || typeof m !== 'object') return m;
    const o = Object.assign({}, m), tail = '#' + String(gid || o.id || '').slice(-4).toUpperCase(), y = String(o.scen || '').slice(0, 8);
    if (o.tdef && typeof o.tdef === 'object' && !nmOk(o.tdef.n, 'nick')) o.tdef = { n: tail, y: o.tdef.y || y };
    if (!o.tdef && o.title != null && !nmOk(o.title, 'room')) { o.title = ''; o.tdef = { n: tail, y }; }
    if (o.tdef && o.title != null && !nmOk(o.title, 'room')) o.title = '';
    return o;
  }
  /* 读：元数据解开私密部分；其余整份解开；解不开的用上一份 */
  const lastGood = new Map();
  async function decode(path, d) {
    if (d == null) return d;
    const gid = gidOf(path); if (!gid) return d;
    if (RE_META.test(path)) {
      if (d.lock) lockedAt.add(gid);
      let o = Object.assign({}, d); delete o._x;
      if (d.lock && d._x) { const priv = await open(gid, path, d._x); if (priv !== undefined) o = Object.assign({}, priv, o); else o._locked = 1; }
      return cleanMeta(gid, o);
    }
    if (isLease(path) || !(d && d._e === 1)) return lockedAt.has(gid) && !isLease(path) && keys.has(gid) ? (lastGood.has(path) ? lastGood.get(path) : null) : d; // 锁着的对局里出现明文：不认（可能是乱写的）
    const v = await open(gid, path, d);
    if (v !== undefined) { lastGood.set(path, v); return v; }
    return lastGood.has(path) ? lastGood.get(path) : null;
  }
  /* 写：锁着的对局加密；元数据只加密列表用不到的字段 */
  async function encode(path, d) {
    const gid = gidOf(path); if (!gid || d == null) return d;
    const k = keys.get(gid);
    if (RE_META.test(path)) {
      if (!k && !d.lock && !lockedAt.has(gid)) return cleanMeta(gid, d);
      if (!k) throw { code: 'permission_denied', message: 'room locked' };
      const pub = {}, priv = {}; for (const [kk, v] of Object.entries(d)) { if (kk === '_x' || kk === '_locked') continue; (PUB.includes(kk) ? pub : priv)[kk] = v; }
      pub.lock = 1; pub.pv = k.pv; lockedAt.add(gid);
      return Object.assign(cleanMeta(gid, pub), { _x: await seal(gid, path, priv) });
    }
    if (isLease(path) || !k) { if (!k && lockedAt.has(gid) && !isLease(path)) throw { code: 'permission_denied', message: 'room locked' }; return d; }
    return seal(gid, path, d);
  }
  const needs = p => !!gidOf(p) || p === 'txs';
  const snapOf = (id, d) => ({ id, exists: d != null, data: () => (d == null ? undefined : deepFreeze(copy(d))), metadata: { fromCache: false, hasPendingWrites: false } });
  const qsnapOf = list => { const docs = list.map(x => snapOf(x.id, x.d)); return { docs, size: docs.length, empty: !docs.length, docChanges: () => docs.map((d, i) => ({ type: 'added', doc: d, oldIndex: -1, newIndex: i })), metadata: { fromCache: false, hasPendingWrites: false } }; };
  const rawOf = sn => (sn && sn.exists ? copy(sn.data()) : null);
  function wrapDoc(bdb, ref) {
    const p = ref.path, id = ref.id;
    if (!needs(p)) return ref;
    const get = async () => snapOf(id, await decode(p, rawOf(await ref.get())));
    const set = async data => ref.set(await encode(p, copy(data)));
    return {
      id, path: p, get, set,
      async update(data) { const cur = await decode(p, rawOf(await ref.get())); if (!cur) throw { code: 'invalid_argument', message: 'update of missing doc' }; const o = merge(cur, copy(data)); delete o._locked; return set(o); },
      delete: () => ref.delete(),
      acquire: o => ref.acquire(o),
      onSnapshot(next, err) {
        let seq = 0;
        return ref.onSnapshot(sn => { const my = ++seq; decode(p, rawOf(sn)).then(d => { if (my === seq) try { next(snapOf(id, d)); } catch (e) { console.error('onSnapshot handler', e); } }); }, err);
      },
      collection: sub => wrapCol(bdb, bdb.collection(p + '/' + sub)),
    };
  }
  function wrapQuery(bdb, q, col) {
    const tr = async qs => qsnapOf(await Promise.all(qs.docs.map(async d => ({ id: d.id, d: await decode(col + '/' + d.id, copy(d.data())) }))));
    return {
      where: (...a) => wrapQuery(bdb, q.where(...a), col),
      orderBy: (...a) => wrapQuery(bdb, q.orderBy(...a), col),
      limit: n => wrapQuery(bdb, q.limit(n), col),
      get: async () => tr(await q.get()),
      onSnapshot(next, err) { let seq = 0; return q.onSnapshot(qs => { const my = ++seq; tr(qs).then(out => { if (my === seq) try { next(out); } catch (e) { console.error('query handler', e); } }); }, err); },
    };
  }
  function wrapCol(bdb, c) {
    if (!(c.path === 'txs' || gidOf(c.path + '/_'))) return c; // 对局列表（txs）与某局之下的集合
    return Object.assign(wrapQuery(bdb, c, c.path), { path: c.path, doc: id => wrapDoc(bdb, c.doc(id)), add: async data => { const r = wrapDoc(bdb, c.doc()); await r.set(data); return r; } });
  }
  function wrapDb(bdb) { return Object.freeze({ doc: p => wrapDoc(bdb, bdb.doc(p)), collection: p => wrapCol(bdb, bdb.collection(p)) }); }
  function wrapUser(u) {
    if (!u) return u;
    return Object.freeze(Object.assign({}, u, {
      profiles: async ids => { const o = await u.profiles(ids); const out = {}; for (const [k, v] of Object.entries(o || {})) out[k] = v && !nmOk(v.name, 'nick') ? Object.assign({}, v, { name: '' }) : v; return out; },
    }));
  }
  /* 房间事件与在场信息：锁着的对局里，事件内容加密；在场信息只留编号（席位、就绪等不公开） */
  function wrapRoom(r) {
    if (!r || !r.join) return r;
    return Object.freeze(Object.assign({}, r, {
      join: async name => {
        const api = await r.join(name), m = /^tx-([a-z0-9]{4,40})$/.exec(name); if (!m) return api;
        const gid = m[1], locked = () => keys.has(gid) || lockedAt.has(gid), aad = t => 'rm/' + name + '/' + t;
        return Object.freeze(Object.assign({}, api, {
          emit: async (topic, data) => { if (!locked()) return api.emit(topic, data); if (!keys.has(gid)) return; return api.emit(topic, await seal(gid, aad(topic), data === undefined ? null : data)); },
          on: (topic, fn) => api.on(topic, ev => {
            const d = ev && ev.data;
            if (!(d && d._e === 1)) { if (locked() && keys.has(gid)) return; return fn(ev); } // 锁着的对局里的明文事件：不认
            open(gid, aad(topic), d).then(v => { if (v !== undefined) try { fn(Object.freeze(Object.assign({}, ev, { data: v }))); } catch (e) { console.error(e); } });
          }),
          presence: async patch => api.presence(locked() && patch && typeof patch === 'object' ? ('uid' in patch ? { uid: patch.uid } : {}) : patch),
        }));
      },
    }));
  }
  let dbW = null, userW = null, roomW = null;
  window.claude = Object.freeze({
    use: async n => {
      const r = await base.use(n);
      if (n === 'db' && r) { await ready; return dbW || (dbW = wrapDb(r)); }
      if (n === 'user' && r) return userW || (userW = wrapUser(r));
      if (n === 'room' && r) return roomW || (roomW = wrapRoom(r));
      return r;
    },
  });
  /* 界面用：设密码、验密码、看本机有没有这局的密钥 */
  window.TXLOCK = {
    ready,
    has: gid => keys.has(gid),
    pw: gid => (store[gid] && store[gid].pw) || '',
    isLocked: m => !!(m && m.lock),
    async create(gid, pw) { const d = await derive(gid, pw); await useKey(gid, d.raw, d.pv, pw); return d.pv; },
    async tryOpen(gid, pw, pv) { const d = await derive(gid, pw); if (pv && d.pv !== pv) return false; await useKey(gid, d.raw, d.pv); return true; },
    forget(gid) { keys.delete(gid); delete store[gid]; save(); },
    _keys: keys, _lockedAt: lockedAt,
  };
})();
