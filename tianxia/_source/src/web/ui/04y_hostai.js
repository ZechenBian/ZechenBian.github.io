/* ===================== 网页版 · 房主的 AI 统一推演（src/web/ui，只在网页版构建里；与 src/ui、src/uimp 同一作用域） =====================
 * 联网对局里，房主可以把自己接入的 AI 共享给本局所有玩家：其他玩家不用自己接入（也不用密钥），他们的一句话命令、危机应对、
 * 与 AI 智能体的谈判都经房主的浏览器交给房主的 AI 推演，费用记在房主的 AI 账户上。各国反应与世界推演本来就由房主结算。
 *   · 开关：建局时“把我的 AI 共享给本局所有玩家”（房主接入了 AI 时默认勾选），对局中房主在“⋯”菜单里随时开关。
 *     设置记在对局设置里（大厅阶段 meta.cfg.hostAI，开局后 S.mp.cfg.hostAI）；房主当前能否提供写在元数据 meta.ai（{on, b: [中, 英], m: 模型}）。
 *   · 请求：玩家写在自己的通道 txu/<uid>/<gid>/ai（{h: 房主, reqs: [{n, at, box}]}），提示词用 ECDH 加密给房主（附加数据 'ai|对局|玩家|编号'）；
 *     房主解开后调用自己的 AI，把结果加密给这位玩家，写在 txs/<gid>/air/<uid>（'air|对局|玩家|编号'）。中继和其他玩家看不到内容。
 *   · 房主的密钥从不离开房主的浏览器；玩家拿到的只是 AI 的回复。房主出错时只回错误代码，不回服务商的原话。
 *   · 限额：每位玩家每回合最多 HA.cap 次、同时最多 2 次，提示词最大 200 KB，等待最长 5 分钟；只为已入座的玩家推演。
 *   · 换房主：等待中的请求作废；新房主接入了 AI 就接着共享（开关跟着对局走），没有时大家改用各自的 AI 或本地规则。
 */
const HA_PAR = 2, HA_MAXQ = 200000, HA_WAIT = 300000;
const HA_HARD = ['not_granted', 'quota', 'unavailable', 'bad_model', 'bad_url', 'proxy_refused', 'network', 'sampling_disabled']; // 房主这边的接入坏了：暂停共享
const HA_PASS = ['rate_limited', 'timeout', 'upstream_error', 'invalid_json', 'refused', 'cancelled']; // 原样告诉玩家的错误
const P_AIQ = (u, g) => 'txu/' + u + '/' + g + '/ai', P_AIR = (g, u) => 'txs/' + g + '/air/' + u;
var HA = { cap: 30, key: '', mode: null, host: null, hp: null, gid: null, uid: null, reqs: [], pend: new Map(), unsubR: null, // 玩家这边
  subs: {}, seen: new Set(), jobs: new Map(), queue: [], used: {}, out: {}, broken: false }; // 房主这边
try { window.__HA = HA; } catch (e) { } // 测试钩子

/* ---------- 共享的设置与状态 ---------- */
function haCfgOn() { // 本局是否开了“房主的 AI 统一推演”
  const m = MPS.meta; if (!m) return false;
  if (mpLive() && S.mp.cfg && S.mp.cfg.hostAI !== undefined) return !!S.mp.cfg.hostAI;
  return !!(m.cfg && m.cfg.hostAI);
}
const haLocalReady = () => !!(window.TXAI && window.TXAI.ready() && !HA.broken); // 本机（房主）自己接入的 AI 可用
function haMetaAI(want) { // 写进元数据的共享状态
  if (want && haLocalReady()) { const lab = window.TXAI.label() || { zh: 'AI', en: 'AI' }, k = window.TXAI.conf(); return { on: true, want: true, b: [String(lab.zh).slice(0, 24), String(lab.en).slice(0, 24)], m: String((k && k.model) || '').slice(0, 80), by: MPS.uid }; }
  return { on: false, want: !!want, b: null, m: '', by: MPS.uid };
}
const haShared = () => { const m = MPS.meta; return !!(m && m.ai && m.ai.on && m.ai.by === m.host); }; // 房主正在共享
function haName(m) { const a = (m || MPS.meta || {}).ai || {}, b = Array.isArray(a.b) ? a.b : null; const n = b ? String(b[EN() ? 1 : 0] || b[0] || 'AI') : 'AI'; return n + (a.m ? ' · ' + String(a.m) : ''); }
function haLabel() { try { if (HA && HA.mode === 'remote') { const a = MPS.meta.ai, b = Array.isArray(a.b) ? a.b : ['AI', 'AI']; return { zh: String(b[0] || 'AI'), en: String(b[1] || b[0] || 'AI') }; } } catch (e) { } return null; } // 界面文字里代替“Claude”的名字

/* ---------- 玩家这边：经房主推演 ---------- */
function haWant() {
  const m = MPS.meta;
  return !!(window.TX_WEB && mpNet() && MPS.gid && m && m.status === 'play' && haShared() && m.host !== MPS.uid && !MPS.host && MPS.seat && !MPS.passive && MPX.mine() && mpHostPub());
}
function haSync() {
  const want = haWant(), hp = want ? mpHostPub() : null;
  const key = want ? [MPS.gid, MPS.meta.host, hp.x, hp.y, MPS.uid].join('|') : '';
  if (key === HA.key) return;
  const was = HA.mode === 'remote';
  for (const n of [...HA.pend.keys()]) haDone(n, { code: 'shared_down' }, null, true); // 换了房主或不再共享：等待中的请求作废
  if (was && HA.gid && HA.gid === MPS.gid && HA.uid === MPS.uid) { HA.reqs = []; haWriteReqs(); }
  if (HA.unsubR) { try { HA.unsubR(); } catch (e) { } HA.unsubR = null; }
  Object.assign(HA, { key, mode: want ? 'remote' : null, host: want ? MPS.meta.host : null, hp, gid: want ? MPS.gid : null, uid: MPS.uid, reqs: [] });
  if (want) HA.unsubR = mpListen(() => MPS.db.doc(P_AIR(MPS.gid, MPS.uid)), haOnRes, 'air');
  if (want || was) haReinit();
}
function haReinit() { LLM.init().then(() => { try { aiRefresh(); } catch (e) { } if (S) renderTop(); const box = $('#aiBox'); if (box && typeof aiRedraw === 'function') aiRedraw(); }); }
async function haCall(input, o) {
  o = o || {};
  if (HA.mode !== 'remote' || !HA.hp) throw { code: 'shared_down' };
  if (o.signal && o.signal.aborted) throw { code: 'cancelled' };
  if (HA.pend.size >= 4) throw { code: 'rate_limited' };
  let size = 0; try { size = JSON.stringify(input).length; } catch (e) { throw { code: 'invalid_request' }; }
  if (size > HA_MAXQ) throw { code: 'prompt_too_large' };
  const key = HA.key, gid = HA.gid, uid = MPS.uid, n = (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).slice(0, 20);
  const tier = ['quick', 'default', 'complex'].includes(o.modelTier) ? o.modelTier : 'default';
  const box = await MPX.seal(HA.hp, gid, 'ai|' + gid + '|' + uid + '|' + n, { input, tier, turn: S ? S.turn : -1, at: Date.now() });
  if (HA.key !== key) throw { code: 'shared_down' };
  return new Promise((res, rej) => {
    HA.pend.set(n, { res, rej, t: setTimeout(() => haDone(n, { code: 'timeout' }), HA_WAIT) });
    if (o.signal) o.signal.addEventListener('abort', () => haDone(n, { code: 'cancelled' }), { once: true });
    HA.reqs.push({ n, at: Date.now(), box }); haWriteReqs();
    mpEmit('tick', { ai: uid }); // 提醒房主马上读取
  });
}
const haSample = Object.assign((input, o) => haCall(input, o).then(v => ({ text: JSON.stringify(v), truncated: false })), { json: (input, o) => haCall(input, o), limits: async () => ({ images: false, maxPromptBytes: HA_MAXQ }) });
window.__txSampleHook = () => (HA.mode === 'remote' ? haSample : undefined); // 01_shim.js 的 claude.use('sample')
function haWriteReqs() {
  const gid = HA.gid || MPS.gid, uid = MPS.uid; if (!gid || !uid || !MPS.db) return;
  mpWrite(P_AIQ(uid, gid), () => ({ v: 1, h: HA.gid === gid ? HA.host : null, at: Date.now(), reqs: HA.gid === gid ? HA.reqs.slice(-4) : [] }));
}
function haDone(n, err, val, quiet) {
  const p = HA.pend.get(n); if (!p) return;
  HA.pend.delete(n); clearTimeout(p.t);
  const had = HA.reqs.length; HA.reqs = HA.reqs.filter(r => r.n !== n);
  if (!quiet && HA.reqs.length !== had) haWriteReqs(); // 从通道里撤下（房主看到撤下的请求会停止推演）
  if (err) p.rej(err); else p.res(val);
}
async function haOnRes(sn) {
  const d = sn.exists ? sn.data() : null; if (!d || !Array.isArray(d.res) || HA.mode !== 'remote') return;
  const gid = HA.gid, uid = MPS.uid, hp = HA.hp;
  for (const r of d.res) {
    if (!r || typeof r.n !== 'string' || !r.box || !HA.pend.has(r.n)) continue;
    let v = null; try { v = await MPX.open(hp, gid, 'air|' + gid + '|' + uid + '|' + r.n, r.box); } catch (e) { continue; } // 不是当前房主加密给我的：不认
    if (!v || !HA.pend.has(r.n)) continue;
    if (v.ok && v.o && typeof v.o === 'object' && !Array.isArray(v.o)) haDone(r.n, null, v.o);
    else haDone(r.n, { code: typeof v.code === 'string' && /^[a-z_]{2,30}$/.test(v.code) ? v.code : 'shared_fail' });
  }
}

/* ---------- 房主这边：替玩家推演 ---------- */
function haServe() { const m = MPS.meta; return !!(window.TX_WEB && mpNet() && MPS.host && !MPS.passive && MPS.gid && m && m.status === 'play' && m.host === MPS.uid && haShared()); }
function haAdvertise() { // 房主：把能否共享写进元数据（只在变化时写）
  if (!window.TX_WEB || !mpNet() || !MPS.host || MPS.passive || !MPS.meta || !MPS.gid || MPS.meta.host !== MPS.uid) { haHostSubs(); return; }
  const ai = haMetaAI(haCfgOn()), cur = MPS.meta.ai || {};
  if (!!cur.on === ai.on && !!cur.want === ai.want && cur.by === ai.by && JSON.stringify(cur.b || null) === JSON.stringify(ai.b) && (cur.m || '') === ai.m) { haHostSubs(); return; }
  MPS.meta.ai = ai; mpMeta({ ai }); haHostSubs();
}
function haHostSubs() {
  const want = new Set();
  if (haServe()) for (const u of Object.values(MPS.meta.seats || {})) if (typeof u === 'string' && u && u !== MPS.uid) want.add(u);
  for (const u of Object.keys(HA.subs)) if (!want.has(u)) { try { HA.subs[u](); } catch (e) { } delete HA.subs[u]; for (const j of HA.jobs.values()) if (j.uid === u) j.ctl.abort(); HA.queue = HA.queue.filter(q => q.uid !== u); }
  for (const u of want) if (!HA.subs[u]) { let path; try { path = P_AIQ(u, MPS.gid); MPS.db.doc(path); } catch (e) { continue; } HA.subs[u] = mpListen(() => MPS.db.doc(path), sn => haOnReq(u, sn), 'aiq'); }
}
function haPoke(uid) { if (!HA.subs[uid] || !MPS.gid) return; const gid = MPS.gid; MPS.db.doc(P_AIQ(uid, gid)).get().then(sn => { if (gid === MPS.gid) haOnReq(uid, sn); }).catch(() => { }); } // 房间里的提醒：立即读取（db 推送慢时）
function haOnReq(uid, sn) {
  if (!haServe()) return;
  const d = sn.exists ? sn.data() : null, list = d && d.h === MPS.uid && Array.isArray(d.reqs) ? d.reqs.slice(-4) : [];
  const live = new Set(list.map(r => r && r.n));
  for (const j of HA.jobs.values()) if (j.uid === uid && !live.has(j.n)) j.ctl.abort(); // 玩家撤下了请求（取消、超时）
  HA.queue = HA.queue.filter(q => q.uid !== uid || live.has(q.n));
  for (const r of list) {
    if (!r || typeof r.n !== 'string' || !/^[a-z0-9]{6,24}$/.test(r.n) || !r.box) continue;
    const k = MPS.gid + '|' + uid + '|' + r.n; if (HA.seen.has(k)) continue; HA.seen.add(k); if (HA.seen.size > 3000) HA.seen = new Set([...HA.seen].slice(-1500));
    if (Math.abs(Date.now() - (+r.at || 0)) > HA_WAIT) continue; // 早已过期
    HA.queue.push({ uid, n: r.n, box: r.box, gid: MPS.gid });
  }
  haPump();
}
function haPump() {
  if (!haServe()) { HA.queue = []; return; }
  for (let i = 0; i < HA.queue.length; i++) {
    const q = HA.queue[i]; let busy = 0; for (const j of HA.jobs.values()) if (j.uid === q.uid) busy++;
    if (busy >= HA_PAR) continue;
    HA.queue.splice(i--, 1); haRun(q);
  }
}
async function haRun(q) {
  const ctl = new AbortController(), k = q.gid + '|' + q.uid + '|' + q.n;
  HA.jobs.set(k, { uid: q.uid, n: q.n, ctl });
  try {
    const pk = mpPkOf(q.uid); if (!pk) return; // 没有这位玩家的公钥：无法加密回复
    let req = null; try { req = await MPX.open(pk, q.gid, 'ai|' + q.gid + '|' + q.uid + '|' + q.n, q.box); } catch (e) { return; } // 不是这位玩家加密的：不理
    if (!req || req.input == null || ctl.signal.aborted || Math.abs(Date.now() - (+req.at || 0)) > HA_WAIT) return; // 加密内容里的时间：重放的旧请求不理
    let out;
    const t = mpLive() ? S.turn : -1, u = HA.used[q.uid] && HA.used[q.uid].turn === t ? HA.used[q.uid] : (HA.used[q.uid] = { turn: t, n: 0 });
    let size = 0; try { size = JSON.stringify(req.input).length; } catch (e) { size = Infinity; }
    const smp = window.TXAI && haLocalReady() ? window.TXAI.sample() : null;
    if (!mpSeatOf(q.uid)) out = { ok: 0, code: 'unavailable' }; // 只为入座的玩家推演
    else if (u.n >= HA.cap) out = { ok: 0, code: 'shared_cap' };
    else if (size > HA_MAXQ) out = { ok: 0, code: 'prompt_too_large' };
    else if (!smp) out = { ok: 0, code: 'shared_down' };
    else {
      u.n++;
      try { out = { ok: 1, o: await smp.json(req.input, { modelTier: ['quick', 'default', 'complex'].includes(req.tier) ? req.tier : 'default', signal: ctl.signal }) }; }
      catch (e) {
        const c = (e && e.code) || 'upstream_error';
        if (c === 'cancelled' || ctl.signal.aborted) return;
        if (HA_HARD.includes(c)) { HA.broken = true; setTimeout(haAdvertise, 0); } // 房主的接入坏了：暂停共享，玩家改用各自的 AI 或规则
        out = { ok: 0, code: HA_PASS.includes(c) ? c : HA_HARD.includes(c) ? 'shared_down' : 'shared_fail' };
      }
    }
    if (q.gid !== MPS.gid || !MPS.host) return;
    const box = await MPX.seal(pk, q.gid, 'air|' + q.gid + '|' + q.uid + '|' + q.n, out);
    HA.out[q.uid] = (HA.out[q.uid] || []).filter(r => Date.now() - r.at < HA_WAIT).concat([{ n: q.n, at: Date.now(), box }]).slice(-6);
    mpWrite(P_AIR(q.gid, q.uid), () => ({ v: 1, at: Date.now(), res: (HA.out[q.uid] || []).slice(-6) }));
  } catch (e) { console.warn('host ai', e); }
  finally { HA.jobs.delete(k); haPump(); }
}

/* ---------- 与联网层的衔接（04m_net.js 里的钩子） ---------- */
function haOnMeta() { haSync(); if (MPS.host) haAdvertise(); else haHostSubs(); }
function haReset() { // 离开对局（mpUnsubAll）
  for (const u of Object.keys(HA.subs)) { try { HA.subs[u](); } catch (e) { } }
  HA.subs = {}; for (const j of HA.jobs.values()) j.ctl.abort(); HA.queue = []; HA.out = {};
  const was = HA.mode === 'remote';
  for (const n of [...HA.pend.keys()]) haDone(n, { code: 'shared_down' }, null, true);
  if (HA.unsubR) { try { HA.unsubR(); } catch (e) { } HA.unsubR = null; }
  Object.assign(HA, { key: '', mode: null, host: null, hp: null, gid: null, reqs: [] });
  if (was) haReinit();
}
function haOnLocalAI() { HA.broken = false; if (MPS.host) haAdvertise(); } // 房主改了自己的 AI 设置（或授权成功）
if (window.TX_WEB && window.TXAI) {
  window.TXAI.onChange(() => { haOnLocalAI(); });
  LLM.onState(() => { if (MPS.host && mpNet()) haAdvertise(); });
}
/* 房主在“⋯”菜单里开关 */
function haToggle() {
  if (!MPS.host || !mpNet() || !MPS.meta) return;
  const on = !haCfgOn();
  if (on && !(window.TXAI && window.TXAI.ready())) { toast(T('ha.need_ai'), 6000); return; }
  HA.broken = false;
  if (mpLive()) { S.mp.cfg = Object.assign({}, S.mp.cfg || {}, { hostAI: on }); mpPublishSoon(); }
  MPS.meta.cfg = Object.assign({}, MPS.meta.cfg || {}, { hostAI: on }); mpMeta({ cfg: { hostAI: on } });
  haAdvertise(); toast(T(on ? 'ha.on_t' : 'ha.off_t'), 5000);
}

/* ---------- 界面片段 ---------- */
function haCfgHTML(c) { // 建局表单
  if (!window.TX_WEB || MPS.view !== 'create') return '';
  if (!(window.TXAI && window.TXAI.ready())) return `<p class="muted haopt" style="font-size:12px;margin:8px 0 0">${T('ha.cfg_noai')}</p>`;
  return `<label class="chk haopt" style="margin-top:8px"><input type="checkbox" id="mpHostAI" ${c.hostAI !== false ? 'checked' : ''}> ${T('ha.cfg')}</label><p class="muted" style="font-size:11.5px;margin:2px 0 4px">${T('ha.cfg_x', { n: HA.cap })}</p>`;
}
function haSumTxt(m) { // 大厅里的设置摘要
  if (!window.TX_WEB || !m) return '';
  const a = m.ai || {}, want = (m.cfg && m.cfg.hostAI) || a.want;
  return ' · ' + (a.on && a.by === m.host ? T('ha.sum_on', { x: { raw: esc(haName(m)) } }) : want ? T('ha.sum_wait') : T('ha.sum_off'));
}
function haLobbyNote(m) { return window.TX_WEB && m && m.host !== MPS.uid && m.ai && m.ai.on && m.ai.by === m.host ? `<div class="alert good hanote">${T('ha.lobby_you', { x: { raw: esc(haName(m)) } })}</div>` : ''; }
function haMenuHTML() { // “⋯”菜单
  if (!window.TX_WEB || !mpNet() || !MPS.meta) return '';
  if (MPS.host) return `<button data-mpm="hostai">${T(haCfgOn() ? 'ha.menu_on' : 'ha.menu_off')}</button>`;
  return haShared() ? `<p class="muted" style="font-size:12px;margin:2px 0 6px">${T('ha.menu_guest', { x: { raw: esc(haName()) } })}</p>` : '';
}
function haSettingsNote() { return HA && HA.mode === 'remote' ? `<p class="alert good hanote" style="font-size:12.5px">${T('ha.set_note', { x: { raw: esc(haName()) } })}</p>` : ''; }
