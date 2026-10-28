/* ===================== 网页版 v4 · 局势说明（每回合战报里的一节） =====================
 * 不管本回合有没有行动，都说明国力与国际局势为什么这样变：
 *   · 国力：GDP（增长率按引擎公式拆开：基础增速、科技、稳定、制裁、自贸、战争、动员、援助与刺激……，剩下的是随机波动）、稳定、国库、军力；
 *   · 国内政策：本回合的国内措施，以及仍在起作用的军费、动员、经济刺激；
 *   · 对外行动：本回合对各国做了什么、关系与影响力怎么变、各国的反应；
 *   · 国际局势：新的战争与停战、结盟、经济与军力排名、紧张程度；下回合要留意的事。
 * 本机结算（单人、同屏、房主）时，结算前后与每个季度引擎计算经济之前各记一次（W.finishTurn 外面包一层，只读），分解是精确的；
 * 联网的其他玩家只看得到结算后的局面，按结算后的局面估算。说明存在战报里（R.v4x），重看战报不会变。 */
const V4X = { start: {}, acc: {}, last: {} };
const v4xHum = () => (S && S.humans && S.humans.length ? S.humans.slice() : S ? [S.player] : []);
/* 某一方的局面摘要（结算前后各一份） */
function v4xSnap(H) {
  const x = S.actors[H]; if (!x) return null;
  const ids = W.IDS.filter(id => S.actors[id] && W.indep(S, id) && !W.isNeutral(S, id));
  const rel = {}, inf = {}; for (const X of ids) if (X !== H) { rel[X] = W.rel(S, H, X); inf[X] = W.infl(S, H, X); }
  const wars = []; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (W.atWar(S, ids[i], ids[j])) wars.push(ids[i] + '|' + ids[j]);
  const rk = W.rankings(S);
  const q = W.withSeat(S, H, () => (S.queue || []).map(z => JSON.parse(JSON.stringify(z))));
  const heg = W.withSeat(S, H, () => W.hegemony(S));
  return {
    turn: S.turn, y: S.year, q: S.q, x: { gdp: x.gdp, stab: x.stab, treasury: x.treasury, tech: x.tech, power: W.power(S, H), nukes: x.nukes, milPct: x.milPct, mob: x.mob, intel: x.intel },
    rel, inf, wars, allies: S.treaties.filter(t => t.type === 'alliance').map(t => t.a + '|' + t.b), my: S.treaties.filter(t => t.a === H || t.b === H).map(t => t.type + '|' + (t.a === H ? t.b : t.a)),
    sanc: S.sanctions.filter(s => s.from === H || s.to === H).map(s => s.from + '>' + s.to + ':' + s.kind + (s.level || '')),
    rankG: rk.slice().sort((a, b) => b.gdp - a.gdp).slice(0, 8).map(r => r.id), rankP: rk.slice().sort((a, b) => b.power - a.power).slice(0, 8).map(r => r.id),
    tension: S.tension, heg: heg ? heg.prog : 0, queue: q, mods: x.mods.map(m => Object.assign({}, m)),
  };
}
/* 结算开始：记下各方的起点；W.finishTurn 外面记每个季度的分解 */
function v4xBegin() { V4X.start = {}; V4X.acc = {}; for (const H of v4xHum()) { V4X.start[H] = v4xSnap(H); V4X.acc[H] = { q: [] }; } }
const v4xFinish0 = W.finishTurn;
W.finishTurn = function (S0, opts) {
  const hs = S0 === S ? v4xHum() : [], pre = {};
  for (const H of hs) { const x = S0.actors[H]; if (!x || !V4X.acc[H]) continue; try { pre[H] = { gb: W.growthBreak(S0, H), fb: W.fiscalBreak(S0, H), mb: W.milBreak(S0, H), stab: x.stab, gdp: x.gdp, treasury: x.treasury, power: W.power(S0, H), tech: x.tech }; } catch (e) { console.warn('v4x', e); } }
  const R = v4xFinish0(S0, opts);
  for (const H of Object.keys(pre)) {
    const x = S0.actors[H], p = pre[H]; if (!x) continue;
    let sb = null; try { const keep = x.stab; x.stab = p.stab; sb = W.stabBreak(S0, H, x.lastG); x.stab = keep; } catch (e) { }
    V4X.acc[H].q.push(Object.assign(p, { sb, g: x.lastG, stab1: x.stab, gdp1: x.gdp, treasury1: x.treasury, power1: W.power(S0, H), tech1: x.tech }));
  }
  return R;
};
/* 结算结束：给每位本机玩家的战报写上说明 */
function v4xEnd(R0) {
  for (const H of v4xHum()) {
    const st = V4X.start[H], acc = V4X.acc[H]; if (!st) continue;
    W.withSeat(S, H, () => { const R = S.report; if (R && !R.intro) R.v4x = v4xBuild(H, st, acc, R); });
    V4X.last[H] = v4xSnap(H);
  }
}
/* 联网的其他玩家：按结算后的局面估算（上一回合看战报时记下的起点） */
function v4xLate(R) {
  const H = S.player, st = V4X.last[H];
  if (!R || R.intro || R.v4x) return;
  if (st && st.turn < S.turn) R.v4x = v4xBuild(H, st, null, R);
  V4X.last[H] = v4xSnap(H);
}
/* ---------- 计算 ---------- */
const v4xSum = (list, key) => { const o = {}; for (const z of list) for (const p of (z && z[key] && z[key].parts) || []) { const k = p.k + (p.by || p.on || p.with || p.vs || p.t ? ':' + (p.by || p.on || p.with || p.vs || p.t) : ''); if (!o[k]) o[k] = Object.assign({}, p, { v: 0 }); o[k].v += p.v; } return Object.values(o); };
function v4xBuild(H, st, acc, R) {
  const x = S.actors[H], end = v4xSnap(H), qs = (acc && acc.q) || [], exact = qs.length > 0, nq = Math.max(1, exact ? qs.length : S.turn - st.turn);
  const out = { H, exact, nq, from: [st.y, st.q], to: [R.y, R.q], k: {} };
  // —— GDP：增长率逐项（百分点，各季度相加） ——
  const gParts = exact ? v4xSum(qs, 'gb') : ((W.growthBreak(S, H) || { parts: [] }).parts.map(p => Object.assign({}, p, { v: p.v * nq })));
  const gAct = exact ? qs.reduce((s, z) => s + (z.g || 0), 0) : (Math.pow(end.x.gdp / Math.max(1e-9, st.x.gdp), 1 / nq) - 1) * 100 * nq;
  const gModel = gParts.reduce((s, p) => s + p.v, 0);
  const gdpDirect = exact ? (qs[0].gdp / Math.max(1e-9, st.x.gdp) - 1) * 100 : 0; // 本回合行动直接造成的（打击、援助、网络攻击等，结算经济之前）
  out.k.gdp = { a: st.x.gdp, b: end.x.gdp, pct: (end.x.gdp / Math.max(1e-9, st.x.gdp) - 1) * 100, parts: gParts.concat(Math.abs(gdpDirect) > 0.005 ? [{ k: 'direct', v: gdpDirect }] : []).concat(Math.abs(gAct - gModel) > 0.005 ? [{ k: exact ? 'noise' : 'other', v: gAct - gModel }] : []) };
  // —— 稳定 ——
  let sParts, sAct = end.x.stab - st.x.stab;
  if (exact) { sParts = v4xSum(qs, 'sb'); const actD = qs[0].stab - st.x.stab; if (Math.abs(actD) > 0.05) sParts.push({ k: 'actions', v: actD }); const ev = sAct - sParts.reduce((s, p) => s + p.v, 0); if (Math.abs(ev) > 0.05) sParts.push({ k: 'events', v: ev }); }
  else { const sb = W.stabBreak(S, H) || { parts: [] }; sParts = sb.parts.map(p => Object.assign({}, p, { v: p.v * nq })); const ev = sAct - sParts.reduce((s, p) => s + p.v, 0); if (Math.abs(ev) > 0.05) sParts.push({ k: 'other', v: ev }); }
  out.k.stab = { a: st.x.stab, b: end.x.stab, parts: sParts };
  // —— 国库 ——
  let tParts = exact ? v4xSum(qs, 'fb') : ((W.fiscalBreak(S, H) || { parts: [] }).parts.map(p => Object.assign({}, p, { v: p.v * nq })));
  const spent = st.queue.reduce((s, z) => s + (+z.cost || 0), 0); if (spent > 0.0005) tParts = tParts.concat([{ k: 'actions', v: -spent }]);
  const tRes = (end.x.treasury - st.x.treasury) - tParts.reduce((s, p) => s + p.v, 0); if (Math.abs(tRes) > Math.max(0.05, Math.abs(end.x.gdp) * 0.00002)) tParts.push({ k: 'other', v: tRes });
  out.k.treasury = { a: st.x.treasury, b: end.x.treasury, parts: tParts };
  // —— 军力 ——
  const mb = exact ? qs.reduce((o, z) => { if (z.mb) { o.prod += z.mb.prod; o.depr += z.mb.depr; } return o; }, { prod: 0, depr: 0 }) : (() => { const m = W.milBreak(S, H) || { prod: 0, depr: 0 }; return { prod: m.prod * nq, depr: m.depr * nq }; })();
  const pRes = (end.x.power - st.x.power) - (mb.prod - mb.depr), mlast = W.milBreak(S, H) || {};
  out.k.power = { a: st.x.power, b: end.x.power, parts: [{ k: 'prod', v: mb.prod }, { k: 'depr', v: -mb.depr }].concat(Math.abs(pRes) > 0.5 ? [{ k: 'other', v: pRes }] : []), milPct: mlast.milPct, capped: !!mlast.capped };
  out.k.tech = { a: st.x.tech, b: end.x.tech };
  out.k.heg = { a: st.heg, b: end.heg };
  // —— 国内政策与对外行动（本回合排的行动） ——
  out.dom = []; out.fx = {};
  for (const q of st.queue) {
    if (!q || q.type === 'done') continue;
    const tgt = q.target && q.target !== H ? q.target : null, items = [{ id: q.type, p: q.params || {} }];
    if (!tgt) { for (const it of items) out.dom.push({ id: it.id, p: it.p, lbl: v4xLbl(q) }); continue; }
    const f = out.fx[tgt] || (out.fx[tgt] = { t: tgt, acts: [], rel: [st.rel[tgt] ?? 0, end.rel[tgt] ?? 0], inf: [st.inf[tgt] ?? 0, end.inf[tgt] ?? 0] });
    f.acts.push({ lbl: v4xLbl(q), ids: items.map(i => i.id), p: items.map(i => i.p) });
  }
  // 制裁的双向影响（按双方的贸易依存度，见行动手册）
  for (const f of Object.values(out.fx)) {
    if (!f.acts.some(a => a.ids.some(id => ['sanction', 'tariff', 'techban', 'finsanction', 'energy'].includes(id)))) continue;
    const mine = (W.growthBreak(S, H) || { parts: [] }).parts.filter(p => p.k === 'sanc_out' && p.on === f.t).reduce((s, p) => s + p.v, 0);
    const theirs = (W.growthBreak(S, f.t) || { parts: [] }).parts.filter(p => p.k === 'sanc_in' && p.by === H).reduce((s, p) => s + p.v, 0);
    f.sanc = { mine, theirs };
  }
  out.mods = x.mods.filter(m => m.turns > 0).map(m => ({ src: m.src || 'other', g: m.g, turns: m.turns }));
  out.pol = { milPct: x.milPct, mob: x.mob, we: !!x.we };
  out.rx = (R.reactions || []).map(r => ({ a: r.actor, s: r.stance, n: (r.actions || []).length }));
  // —— 国际局势 ——
  const wars0 = new Set(st.wars), wars1 = new Set(end.wars);
  out.warsNew = end.wars.filter(w => !wars0.has(w)); out.warsEnd = st.wars.filter(w => !wars1.has(w));
  const al0 = new Set(st.allies); out.alNew = end.allies.filter(a => !al0.has(a)).slice(0, 6);
  out.rankG = { a: st.rankG, b: end.rankG }; out.rankP = { a: st.rankP, b: end.rankP };
  out.tension = [st.tension, end.tension];
  out.myTreat = { add: end.my.filter(t => !st.my.includes(t)), del: st.my.filter(t => !end.my.includes(t)) };
  out.sanc = { add: end.sanc.filter(t => !st.sanc.includes(t)), del: st.sanc.filter(t => !end.sanc.includes(t)) };
  // —— 下回合 ——
  out.pend = { cr: S.crises.filter(c => !c.resolved).length, ul: S.ultis.filter(u => u.status === 'open').length, ib: S.inbox.length };
  out.warn = [];
  if (end.x.stab < 35) out.warn.push({ k: 'stab', n: Math.round(end.x.stab) });
  if (end.x.treasury < -end.x.gdp * 0.04) out.warn.push({ k: 'debt' });
  for (const f of S.fronts) if (W.boss(S, f.target) === H && f.progress >= 40) out.warn.push({ k: 'front', a: f.att, n: Math.round(f.progress) });
  return out;
}
const v4xLbl = q => { try { return v2QLabel(q); } catch (e) { return T('a.' + q.type); } };
/* ---------- 显示 ---------- */
const v4xF = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(d);
function v4xPartLbl(p, kind) {
  const a = id => (id && W.DEF[id] ? NAME(id) : '');
  const key = 'v4x.' + kind + '.' + (p.k.startsWith('mod_') ? 'mod' : p.k);
  if (p.k.startsWith('mod_')) return T(I18N.has('v4x.mod.' + p.k.slice(4)) ? 'v4x.mod.' + p.k.slice(4) : 'v4x.mod.other');
  return T(key, { a: a(p.by || p.on || p.with || p.vs || p.t), k: p.kind ? T('v4x.sk.' + p.kind) : '' });
}
function v4xBars(parts, kind, fmt, n) {
  const list = parts.filter(p => Math.abs(p.v) >= (kind === 'power' ? 0.5 : kind === 'treasury' ? 0.05 : 0.01)).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, n || 6);
  if (!list.length) return `<p class="muted v4x-none">${T('v4x.none')}</p>`;
  const mx = Math.max(...list.map(p => Math.abs(p.v))) || 1;
  return `<div class="v4x-bars">${list.map(p => `<div class="v4x-bar ${p.v >= 0 ? 'up' : 'dn'}"><span class="l">${esc(v4xPartLbl(p, kind))}</span><span class="b"><i style="width:${Math.max(3, Math.round(Math.abs(p.v) / mx * 100))}%"></i></span><span class="v">${fmt(p.v)}</span></div>`).join('')}</div>`;
}
function v4xHTML(X) {
  if (!X || !X.k) return '';
  const k = X.k, nq = X.nq, per = nq > 1 ? T('v4x.period', { n: { raw: nq === 2 ? T('v4x.half') : nq % 4 === 0 ? T('v4x.years', { n: nq / 4 }) : T('v4x.quarters', { n: nq }) } }) : T('v4x.quarter');
  const pp = v => v4xF(v, 2) + (EN() ? ' pt' : ' 个百分点'), num = v => v4xF(v, 1), mon = v => (v >= 0 ? '+' : '−') + fmtB(Math.abs(v)), pw = v => v4xF(v, 0);
  const top = (parts, sign) => parts.filter(p => sign > 0 ? p.v > 0.005 : p.v < -0.005).filter(p => !['base', 'norm', 'tax', 'noise', 'other', 'g0', 'p0', 'global'].includes(p.k)).sort((a, b) => sign * (b.v - a.v)).slice(0, 2);
  const gUp = top(k.gdp.parts, 1), gDn = top(k.gdp.parts, -1);
  const sum = T('v4x.sum', { p: per, g: v4xF(k.gdp.pct, 2), y: v4xF(k.gdp.pct / nq * 4, 1), s: num(k.stab.b - k.stab.a), m: pw(k.power.b - k.power.a) })
    + (gUp.length ? T('v4x.sum_up', { x: { raw: gUp.map(p => v4xPartLbl(p, 'g')).join(sep()) } }) : '') + (gDn.length ? T('v4x.sum_dn', { x: { raw: gDn.map(p => v4xPartLbl(p, 'g')).join(sep()) } }) : '');
  const card = (ic, title, a, b, fmtV, bars, note) => `<div class="v4x-card"><div class="v4x-h"><b>${ic} ${title}</b><span>${a} → <b>${b}</b> <em class="${fmtV.startsWith('−') ? 'bad' : fmtV.startsWith('+') ? 'good' : ''}">${fmtV}</em></span></div>${bars}${note ? `<p class="muted v4x-note">${note}</p>` : ''}</div>`;
  let h = `<div class="rep-sec v4x"><h3>📊 ${T('v4x.h')} <small class="muted">${per}${X.exact ? '' : ' · ' + T('v4x.est')}</small></h3><p class="v4x-sum">${sum}</p><div class="v4x-grid">`;
  h += card('📈', T('v4x.c.gdp'), fmtB(k.gdp.a), fmtB(k.gdp.b), v4xF(k.gdp.pct, 2) + '%', v4xBars(k.gdp.parts, 'g', pp), T('v4x.n.gdp'));
  h += card('🏛', T('v4x.c.stab'), Math.round(k.stab.a), Math.round(k.stab.b), num(k.stab.b - k.stab.a), v4xBars(k.stab.parts, 's', num), T('v4x.n.stab'));
  h += card('💰', T('v4x.c.tre'), fmtB(k.treasury.a), fmtB(k.treasury.b), mon(k.treasury.b - k.treasury.a), v4xBars(k.treasury.parts, 'treasury', mon), '');
  h += card('🛡', T('v4x.c.pow'), fmtN(k.power.a), fmtN(k.power.b), pw(k.power.b - k.power.a), v4xBars(k.power.parts, 'power', pw), T('v4x.n.pow', { n: (+k.power.milPct || 0).toFixed(1) }) + (k.power.capped ? ' ' + T('v4x.n.capped') : ''));
  h += `</div>`;
  // 国内政策
  const dom = X.dom.map(d => `<li>${esc(d.lbl)}${T('v4x.d.' + d.id) !== 'v4x.d.' + d.id ? ' — <span class="muted">' + T('v4x.d.' + d.id) + '</span>' : ''}</li>`);
  const ong = [];
  for (const m of X.mods) ong.push(`<li>${T('v4x.on.mod', { x: { raw: T(I18N.has('v4x.mod.' + m.src) ? 'v4x.mod.' + m.src : 'v4x.mod.other') }, g: { raw: v4xF(m.g, 2) }, n: m.turns })}</li>`);
  if (X.pol.mob > 0) ong.push(`<li>${T('v4x.on.mob', { k: T('mob.' + X.pol.mob) })}</li>`);
  if (X.pol.milPct > 3) ong.push(`<li>${T('v4x.on.mil', { n: X.pol.milPct.toFixed(1), g: ((X.pol.milPct - 3) * 0.06).toFixed(2) })}</li>`);
  if (X.pol.we) ong.push(`<li>${T('v4x.on.we')}</li>`);
  h += `<details class="v4x-d" ${dom.length ? 'open' : ''}><summary>🏠 ${T('v4x.dom')}</summary>${dom.length ? `<ul>${dom.join('')}</ul>` : `<p class="muted">${T('v4x.dom_none')}</p>`}${ong.length ? `<p class="muted v4x-sub">${T('v4x.ongoing')}</p><ul>${ong.join('')}</ul>` : ''}</details>`;
  // 对外行动
  const fx = Object.values(X.fx).map(f => {
    const dr = f.rel[1] - f.rel[0], di = f.inf[1] - f.inf[0];
    let s = `<li><b>${esc(NAME(f.t))}</b>：${f.acts.map(a => esc(a.lbl)).join(sep())}。${T('v4x.f.rel', { a: Math.round(f.rel[0]), b: Math.round(f.rel[1]), d: num(dr) })}`;
    if (Math.abs(di) >= 0.5) s += T('v4x.f.inf', { d: num(di) });
    if (f.sanc) s += ' ' + T('v4x.f.sanc', { a: { raw: v4xF(f.sanc.theirs, 2) }, b: { raw: v4xF(f.sanc.mine, 2) } });
    return s + '</li>';
  });
  const rxSup = X.rx.filter(r => ['支持', '欢迎'].includes(r.s)).map(r => NAME(r.a)), rxOpp = X.rx.filter(r => ['反对', '强烈反对'].includes(r.s)).map(r => NAME(r.a)), rxAct = X.rx.filter(r => r.n > 0).map(r => NAME(r.a));
  const rx = X.rx.length ? `<p class="muted v4x-sub">${T('v4x.rx', { n: X.rx.length, a: rxSup.length ? rxSup.slice(0, 4).join(sep()) : T('u.none'), b: rxOpp.length ? rxOpp.slice(0, 4).join(sep()) : T('u.none') })}${rxAct.length ? ' ' + T('v4x.rx_act', { x: { raw: rxAct.slice(0, 4).join(sep()) } }) : ''}</p>` : '';
  const tr = X.myTreat.add.map(t => T('v4x.tr_add', { k: T('tr.' + t.split('|')[0]), a: t.split('|')[1] })).concat(X.myTreat.del.map(t => T('v4x.tr_del', { k: T('tr.' + t.split('|')[0]), a: t.split('|')[1] })));
  h += `<details class="v4x-d" ${fx.length || tr.length ? 'open' : ''}><summary>🌐 ${T('v4x.fx')}</summary>${fx.length ? `<ul>${fx.join('')}</ul>` : `<p class="muted">${T('v4x.fx_none')}</p>`}${tr.length ? `<p class="v4x-sub">${tr.join(sep())}</p>` : ''}${rx}</details>`;
  // 国际局势
  const pair = w => w.split('|').map(id => NAME(id)).join(EN() ? ' vs ' : '与');
  const intl = [];
  for (const w of X.warsNew) intl.push(`<li class="bad">${T('v4x.i.war', { x: { raw: esc(pair(w)) } })}</li>`);
  for (const w of X.warsEnd) intl.push(`<li class="good">${T('v4x.i.peace', { x: { raw: esc(pair(w)) } })}</li>`);
  for (const a of X.alNew) intl.push(`<li>${T('v4x.i.ally', { x: { raw: esc(pair(a)) } })}</li>`);
  const mv = (r, me) => { const ch = []; r.b.slice(0, 5).forEach((id, i) => { const j = r.a.indexOf(id); if (j !== i && j >= 0 && j < 8) ch.push(T(j > i ? 'v4x.i.up' : 'v4x.i.dn', { a: id, n: i + 1 })); else if (j < 0) ch.push(T('v4x.i.up', { a: id, n: i + 1 })); }); return ch; };
  const ra = mv(X.rankG), rb = mv(X.rankP);
  if (ra.length) intl.push(`<li>${T('v4x.i.rankg')}${ra.join(sep())}</li>`);
  if (rb.length) intl.push(`<li>${T('v4x.i.rankp')}${rb.join(sep())}</li>`);
  const myG = X.rankG.b.indexOf(X.H), myP = X.rankP.b.indexOf(X.H);
  intl.push(`<li class="muted">${T('v4x.i.mine', { g: myG >= 0 ? myG + 1 : '8+', p: myP >= 0 ? myP + 1 : '8+', t: Math.round(X.tension[1]), d: num(X.tension[1] - X.tension[0]) })}</li>`);
  h += `<details class="v4x-d" open><summary>🗺 ${T('v4x.intl')}</summary><ul>${intl.join('')}</ul></details>`;
  // 下回合
  const tips = [];
  if (X.pend.cr || X.pend.ul || X.pend.ib) tips.push(T('v4x.t.pend', { a: X.pend.cr, b: X.pend.ul, n: X.pend.ib }));
  for (const w of X.warn) tips.push(T('v4x.t.' + w.k, { n: w.n, a: w.a }));
  if (!tips.length) tips.push(T('v4x.t.calm'));
  h += `<details class="v4x-d" open><summary>🔭 ${T('v4x.next')}</summary><ul>${tips.map(t => `<li>${t}</li>`).join('')}</ul></details></div>`;
  return h;
}
/* 战报：在要点数字下面插入局势说明 */
const v4xShowReport0 = showReport;
showReport = function (R) {
  if (R && !R.intro && !R.v4x && mpNet() && !MPS.host) v4xLate(R); // 联网的其他玩家：估算
  v4xShowReport0(R);
  if (!R || !R.v4x) return;
  const sh = $('#sheet'); if (!sh || sh.querySelector('.v4x')) return;
  const at = sh.querySelector('.rep-kpis') || sh.querySelector('p.sub');
  try { if (at) at.insertAdjacentHTML('afterend', v4xHTML(R.v4x)); } catch (e) { console.warn('v4x', e); }
};
/* 本机结算：前后各记一次（mpResolve 外面包一层；单机任务在 04z9b 里再包一层，连算几个季度） */
const v4xResolve0 = mpResolve;
mpResolve = async function () {
  if (!S || S.over || MPS.busy || (mpNet() && !MPS.host)) return v4xResolve0();
  const t0 = S.turn; v4xBegin(); V4X.hold = true;
  try { await v4xResolve0(); } finally { V4X.hold = false; }
  if (S.turn === t0) return; // 没有结算（被放弃或出错）
  if (typeof v4MissionAfter === 'function') await v4MissionAfter(); // 单机任务：连算几个季度、判定目标
  v4xEnd(); if (typeof v4FxCollect === 'function') v4FxCollect();
  if (MPS.mode !== 'net') mpLocalSave();
  renderAll(); v4xAfterTurn0();
};
/* 结算过程中先不弹战报：等说明写好（以及单机任务连算完）再弹 */
const v4xAfterTurn0 = mpAfterTurn;
mpAfterTurn = function () { if (V4X.hold) return; if (S && S.report && !S.report.v4x && !(mpNet() && !MPS.host) && V4X.last[S.player] && !UI.demo) v4xLate(S.report); return v4xAfterTurn0(); };
/* 开局与载入：记下起点（联网的其他玩家用来估算第一回合） */
const v4xAdopt0 = mpAdoptLocal;
mpAdoptLocal = function (s, fresh) { const r = v4xAdopt0(s, fresh); try { V4X.last = {}; for (const H of v4xHum()) V4X.last[H] = v4xSnap(H); } catch (e) { } return r; };
