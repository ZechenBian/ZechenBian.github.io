/* ===================== 联机版 · 私密数据与端到端加密 =====================
 * 每台设备一对 ECDH（P-256）密钥：私钥只留在本人这边（网页版存在本浏览器；claude.ai 版存在本人的私密数据里），公钥写在入座记录与自己的通道里。
 * 两人之间用 ECDH 协商出共同密钥（HKDF-SHA256 → AES-GCM-256）；内容先 gzip 再加密，附加数据（AAD）写明用途与编号，不能挪作他用。
 *   · 玩家之间的私信：只有收发双方解得开（房主也解不开）；公开喊话不加密。
 *   · 自己本回合的行动队列、即时命令和方针：只加密给房主——结算之前别的玩家看不到你的方案。
 *   · 各席位的私密数据（战报、情报、来函、危机、各国对你的记忆、你的集结行动……）：房主分别加密给每位玩家；公开快照里只有大家都能看到的局势。
 * 房主负责结算，技术上能看到所有方案与战报（私信除外）。换房主时，各玩家把自己那份重新加密交给新房主。
 */
const MPX = (() => {
  const SUB = (typeof crypto !== 'undefined' && crypto.subtle) || null;
  const te = new TextEncoder(), td = new TextDecoder();
  let me = null, meP = null, meUid = null; const keys = new Map();
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  async function gz(u8) { if (typeof CompressionStream === 'undefined') return null; const cs = new CompressionStream('gzip'); const w = cs.writable.getWriter(); w.write(u8); w.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); }
  async function ungz(u8) { const ds = new DecompressionStream('gzip'); const w = ds.writable.getWriter(); w.write(u8); w.close(); const out = new Uint8Array(await new Response(ds.readable).arrayBuffer()); if (out.length > 8e6) throw new Error('too large'); return out; }
  const okPub = p => !!(p && typeof p === 'object' && typeof p.x === 'string' && typeof p.y === 'string' && /^[A-Za-z0-9_-]{42,44}$/.test(p.x) && /^[A-Za-z0-9_-]{42,44}$/.test(p.y));
  const fp = p => (okPub(p) ? p.x.slice(0, 16) : '');
  const PATH = uid => 'data/users/' + uid + '/txkey', LSK = uid => 'tianxia.mp.kx.' + uid;
  /* 载入或生成本人的密钥（db 为本局所用的 db：私密路径在网页版存本浏览器，在 claude.ai 存本人私密数据） */
  function init(db, uid) {
    if (!SUB || !uid) return Promise.resolve(null);
    if (meP && meUid === uid) return meP;
    meUid = uid; me = null; keys.clear();
    meP = (async () => {
      let jwk = null, priv = null;
      try { const t = localStorage.getItem(LSK(uid)); if (t) jwk = JSON.parse(t); } catch (e) { }
      if (!(jwk && jwk.d) && db) { try { const sn = await db.doc(PATH(uid)).get(); const d = sn.exists ? sn.data() : null; if (d && d.priv && d.priv.d) jwk = d.priv; } catch (e) { } }
      if (jwk && jwk.d && okPub(jwk)) { try { priv = await SUB.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']); } catch (e) { priv = null; } }
      if (!priv) {
        const kp = await SUB.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
        const j = await SUB.exportKey('jwk', kp.privateKey); jwk = { kty: 'EC', crv: 'P-256', x: j.x, y: j.y, d: j.d }; priv = kp.privateKey;
        try { localStorage.setItem(LSK(uid), JSON.stringify(jwk)); } catch (e) { }
        if (db) { try { await db.doc(PATH(uid)).set({ priv: jwk, at: Date.now() }); } catch (e) { } }
      } else { try { localStorage.setItem(LSK(uid), JSON.stringify({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d })); } catch (e) { } }
      me = { uid, priv, pub: { x: jwk.x, y: jwk.y } };
      return me;
    })().catch(e => { console.warn('mpx init', e); meP = null; return null; });
    return meP;
  }
  async function keyFor(pub, salt) {
    const k = pub.x + '.' + pub.y + '|' + salt;
    let p = keys.get(k);
    if (!p) {
      p = (async () => {
        const pk = await SUB.importKey('jwk', { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
        const bits = await SUB.deriveBits({ name: 'ECDH', public: pk }, me.priv, 256);
        const hk = await SUB.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
        return SUB.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: te.encode(String(salt)), info: te.encode('tianxia-mp-e2e-v1') }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      })();
      keys.set(k, p); p.catch(() => keys.delete(k));
    }
    return p;
  }
  /* 加密给对方（pub）；salt 为对局编号，aad 写明用途与编号 */
  async function seal(pub, salt, aad, obj) {
    if (!me || !okPub(pub)) throw new Error('no key');
    const key = await keyFor(pub, salt), iv = crypto.getRandomValues(new Uint8Array(12));
    const raw = te.encode(JSON.stringify(obj)), z = await gz(raw);
    const ct = new Uint8Array(await SUB.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(String(aad)) }, key, z || raw));
    return { v: 1, z: z ? 1 : 0, f: fp(me.pub), t: fp(pub), iv: b64(iv), ct: b64(ct) };
  }
  /* 解开对方（pub）加密给我的、或我加密给对方的内容 */
  async function open(pub, salt, aad, box) {
    if (!me || !okPub(pub) || !box || typeof box.ct !== 'string' || typeof box.iv !== 'string' || box.ct.length > 3e6) throw new Error('bad box');
    const key = await keyFor(pub, salt);
    const pt = new Uint8Array(await SUB.decrypt({ name: 'AES-GCM', iv: unb64(box.iv), additionalData: te.encode(String(aad)) }, key, unb64(box.ct)));
    return JSON.parse(td.decode(box.z ? await ungz(pt) : pt));
  }
  return { init, seal, open, okPub, fp, ok: () => !!SUB, mine: () => (me ? me.pub : null), ready: () => meP || Promise.resolve(null) };
})();

/* ---------- 公开快照与各席位的私密数据 ---------- */
const MP_SEAT_PUB = ['goal', 'heg', 'cbmUntil', 'lowStab', 'pol', 'rep', 'history']; // 席位数据里大家都能知道的字段（国内政局、国际声誉、国力走势本来就公开）
const MP_PRIV_LOG = { secret: 1, hprop: 1 }; // 不进公开快照的日志（AI 的秘密集结在终局揭晓；真人之间的正式提议只给双方）
function mpSeatData(s, H) { // H 的席位数据（当前席位在顶层，其余在 seats 里）
  if (H === s.player) { const o = {}; for (const k of W.SEAT_KEYS) o[k] = s[k]; return o; }
  return (s.seats && s.seats[H]) || null;
}
function mpSeatStub(s, data) { const d = W.seatDefaults(s); if (data) for (const k of MP_SEAT_PUB) if (data[k] !== undefined) d[k] = data[k]; return d; }
function mpPublicView(s) {
  const c = Object.assign({}, s); delete c._exp; delete c._R; delete c._RH;
  const top = mpSeatStub(s, mpSeatData(s, s.player)); for (const k of W.SEAT_KEYS) c[k] = top[k];
  if (s.seats) { c.seats = {}; for (const H of Object.keys(s.seats)) c.seats[H] = mpSeatStub(s, s.seats[H]); }
  c.ops = []; c.turnEvents = []; c.rng = 1;
  c.log = (s.log || []).filter(e => !MP_PRIV_LOG[e.type] || (s.over && e.type === 'secret'));
  c.mp = Object.assign({}, s.mp, { cmdRes: {}, plans: undefined });
  return c;
}
function mpBundleOf(s, H, uid) {
  const log = (s.log || []).filter(e => e.type === 'hprop' && (e.actors || []).includes(H));
  return { v: 1, seat: H, turn: s.turn, data: mpSeatData(s, H), ops: (s.ops || []).filter(o => o.owner === H || (o.det || []).includes(H)), log, cmdRes: uid && s.mp && s.mp.cmdRes ? s.mp.cmdRes[uid] || null : null };
}
function mpEscrowOf(s) { return { v: 1, turn: s.turn, ops: s.ops || [], log: (s.log || []).filter(e => e.type === 'secret'), turnEvents: s.turnEvents || [], rng: s.rng }; }
function mpMergeLog(s, list) {
  if (!Array.isArray(list) || !list.length) return;
  const have = new Set((s.log || []).map(e => JSON.stringify(e)));
  const add = list.filter(e => e && typeof e === 'object' && !have.has(JSON.stringify(e)));
  if (add.length) s.log = (s.log || []).concat(add).map((e, i) => [e, i]).sort((a, b) => (a[0].turn - b[0].turn) || (a[1] - b[1])).map(z => z[0]);
}
function mpMergeOps(s, list) { const have = new Set((s.ops || []).map(o => o.id)); s.ops = (s.ops || []).concat((Array.isArray(list) ? list : []).filter(o => o && o.id && !have.has(o.id))); }
const MP_SEAT_KEEP = ['mem', 'grudge', 'favor', 'threat', 'rep', 'pol', 'history', 'commits', 'cb', 'crossed', 'unattrib', 'holds', 'heg', 'goal', 'cbmUntil', 'lowStab', 'intelLog'];
/* 把一位玩家的私密数据放回快照；old = 数据来自较早的回合（换房主时晚到）：只取长期的部分 */
function mpMergeBundle(s, b, uid, old) {
  if (!b || typeof b !== 'object' || !b.data || typeof b.seat !== 'string' || !W.isHuman(s, b.seat)) return false;
  const H = b.seat, cur = mpSeatData(s, H) || W.seatDefaults(s);
  const data = Object.assign(W.seatDefaults(s), old ? cur : {}, old ? Object.fromEntries(MP_SEAT_KEEP.filter(k => b.data[k] !== undefined).map(k => [k, b.data[k]])) : b.data);
  if (H === s.player) { for (const k of W.SEAT_KEYS) s[k] = data[k]; } else { s.seats = s.seats || {}; s.seats[H] = data; }
  mpMergeOps(s, b.ops); mpMergeLog(s, b.log);
  if (uid && b.cmdRes && !old) { s.mp.cmdRes = s.mp.cmdRes || {}; s.mp.cmdRes[uid] = b.cmdRes; }
  return true;
}
function mpMergeEscrow(s, e) {
  if (!e || typeof e !== 'object') return;
  mpMergeOps(s, e.ops); mpMergeLog(s, e.log);
  if (Array.isArray(e.turnEvents)) s.turnEvents = e.turnEvents;
  if (typeof e.rng === 'number') s.rng = e.rng;
}
