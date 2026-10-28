/* ===================== 联机版 · 目标、计分与排行榜 =====================
 * 本国页顶部：我的历史目标（达成 / 失败 / 正满足 / 未满足）与得分构成；状态栏的 🏆 按钮打开排行榜。
 * 多人局：排行榜列出所有真人；单人局：与几个 AI 大国对照。房主可以“结束对局并公布排名”。 */
const glOn = () => !!(S && S.mp && S.mp.g0 && !UI.demo);
function glList() {
  const hs = (S.humans || [S.player]).filter(X => S.actors[X]);
  if (hs.length > 1) return hs;
  const ai = W.IDS.filter(X => !hs.includes(X) && S.actors[X] && W.indep(S, X) && !W.isNeutral(S, X)).sort((a, b) => W.power(S, b) - W.power(S, a)).slice(0, 4);
  return hs.concat(ai);
}
const glIcon = { done: '✅', fail: '❌', on: '🟢', off: '⚪' };
function goalsSecHTML() {
  if (!glOn()) return '';
  const P = S.player, sc = W.scoreOf(S, P); if (!sc) return '';
  const gv = W.goalsView(S, P), st = W.standings(S, glList()), rank = st.findIndex(r => r.id === P) + 1;
  const dl = g => (g.until ? ' · ' + T('gl.until', { y: { raw: String(g.until[0]) }, q: { raw: String(g.until[1]) } }) : '');
  return `<div class="sec goals"><h3>🏆 ${T('gl.h')} <span class="tag acc">${T('gl.score', { n: sc.total })}</span>${st.length > 1 ? ` <span class="tag">${T('gl.rank', { n: rank, m: st.length })}</span>` : ''}</h3>
    <ul class="glist">${gv.map(g => `<li class="gl-${g.st}"><span class="ic">${glIcon[g.st]}</span><span class="t">${esc(g.t[EN() ? 1 : 0])}<small>${T('gl.k.' + g.kind)}${dl(g)} · ${T('gl.st.' + g.st)}</small></span><b class="num">+${g.w}</b></li>`).join('')}</ul>
    <div class="gsc">${[['sov', 20], ['econ', 20], ['mil', 20], ['stab', 10]].map(([k, m]) => `<div class="stat"><span>${T('gl.' + k)}</span><b class="num">${sc[k]}/${m}</b></div>`).join('')}<div class="stat"><span>${T('gl.obj')}</span><b class="num">${sc.obj}/${sc.objMax}</b></div></div>
    <p class="muted" style="font-size:12px;margin:6px 0">${T('gl.help')}</p>
    <button class="mini" data-gl="board">${T('gl.board')}</button></div>`;
}
function glBoardHTML(final) {
  const st = W.standings(S, glList()), seats = (MPS.meta && MPS.meta.seats) || {};
  const who = r => (r.human ? (mpNet() && seats[r.id] ? esc(mpName(seats[r.id])) : T('gl.human')) : T('gl.ai'));
  return `<table class="glboard"><tr><th>#</th><th>${T('gl.country')}</th><th>${T('gl.total')}</th><th>${T('gl.obj')}</th><th>${T('gl.econ')}</th><th>${T('gl.mil')}</th><th>${T('gl.sov')}</th></tr>
    ${st.map((r, i) => `<tr class="${r.id === S.player ? 'me' : ''} ${r.human ? '' : 'ai'}"><td>${i === 0 && final ? '🥇' : i === 1 && final ? '🥈' : i === 2 && final ? '🥉' : i + 1}</td><td><i class="mpsw" style="background:${polColor(r.id)}"></i>${esc(NAME(r.id))}<small>${who(r)}</small></td><td class="num"><b>${r.total}</b></td><td class="num">${r.obj}/${r.objMax}</td><td class="num">${r.econ}</td><td class="num">${r.mil}</td><td class="num">${r.sov}</td></tr>`).join('')}</table>`;
}
function glShowBoard() {
  if (!glOn()) return;
  const host = mpNet() ? MPS.host : MPS.on;
  showModal(`<h2>🏆 ${T('gl.board')}</h2><p class="sub">${T((S.humans || []).length > 1 ? 'gl.board_x' : 'gl.board_solo')}</p>${glBoardHTML(!!S.over)}
    <div class="foot">${host && !S.over && MPS.on ? `<button id="glEnd">${T('gl.end')}</button>` : ''}<button class="btn-primary" data-close="1">${T('u.close')}</button></div>`, '', true);
  const b = $('#glEnd'); if (b) b.onclick = () => mpConfirm(T('gl.end_q'), glEndGame);
}
/* 房主（或本机对局）结束对局：按当前局势定出最终排名 */
function glEndGame() {
  if (!S || S.over) return;
  if (mpNet() && !MPS.host) return;
  S.over = { result: 'end', reason: W.M(mpNet() ? 'gl.ended' : 'gl.ended_l', { n: S.turn }) };
  if (mpNet()) mpPublish(true); else mpLocalSave();
  renderAll(); showGameOver();
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-gl="board"]'); if (b && glOn()) glShowBoard(); });
