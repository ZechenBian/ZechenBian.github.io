// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 网页版 v4 · 单机任务的定义 =====================
 * 每个任务：年代、国家、期限（until：期限那个季度）、一回合多长（qpt：一回合连算几个季度；2 = 半年，4 = 一年）、难度（diff：1–3 个点）。
 * 三档难度（d：0 简单、1 普通、2 困难）：tg[d] 是这一档的目标数值；简单档的期限多一年（坚守型除外），AI 也按这一档的聪明程度行事。
 * G(t) 列出目标：{ k: 文字键, p: 文字里的数字, keep: 要一直保持（完成时也必须满足）, ev(S, M): { ok, cur, tgt, fmt } }；
 *   fmt：'x' 倍数（相对开局）、'n' 次数/个数、'num' 数值（不低于）、'max' 数值（不高于）、'pct' 占 GDP 的百分比（不低于）、'maxpct' 百分比（不高于）、'q' 已坚持的季度。
 * 全部达成就算完成（每个季度都判定，不用等到期限）；hold: true 的坚守型任务要坚持到期限那个季度。
 * fail(S, M) 返回失败原因的文字键（可选，一出现就失败）。
 * 评星：par[d] = [三星, 两星] 是用掉的季度数上限（按模拟校准：三档里用简单打法拿三星的都不到一半，见 test/v4missions.js）；坚守型用 stars(S, M, t) 按届时的局面评（star 写明门槛）。
 * M（任务记录）：{ id, d 难度, t 目标数值, seed, t0 开局回合, qpt, dl 期限回合, base: { gdp, pow } 开局时各国的 GDP 与军力, cnt: 对各国援助的次数, undo: 回退次数 }。
 * 判定只读局面，在引擎载入之后才调用（这个文件在引擎之前载入，所以函数里才引用 WG）。 */
const TXMIS = (() => {
  const W = () => WG;
  const own = (S, X) => !!(S.actors[X] && W().indep(S, X) && S.actors[X].ctrl === X && !S.actors[X].overlord);
  const gdp = (S, X) => (S.actors[X] ? S.actors[X].gdp : 0);
  const rel = (S, a, b) => W().rel(S, a, b);
  const trade = (S, a, b) => W().hasTreaty(S, a, b, 'trade');
  const enemyOn = (S, T, E) => Math.round(S.fronts.filter(f => f.target === T && f.att === E).reduce((m, f) => Math.max(m, f.progress || 0), 0)); // E 对 T 本土攻势的进度（没有就是 0）
  /* 目标的几种写法 */
  const R = v => ({ raw: String(+v) });
  const flag = (k, f, keep) => ({ k, keep: !!keep, ev: (S, M) => ({ ok: !!f(S, M) }) });
  const mult = (k, t, f) => ({ k, p: { n: R(t) }, ev: (S, M) => { const r = f(S, M); return { ok: r >= t, cur: r, tgt: t, fmt: 'x' }; } });
  const atLeast = (k, t, f, fmt, keep) => ({ k, p: { n: R(t) }, keep: !!keep, ev: (S, M) => { const v = f(S, M); return { ok: v >= t, cur: v, tgt: t, fmt: fmt || 'num' }; } });
  const atMost = (k, t, f, fmt) => ({ k, p: { n: R(t) }, keep: true, ev: (S, M) => { const v = f(S, M); return { ok: v <= t, cur: v, tgt: t, fmt: fmt || 'max' }; } });
  const L = [
    { id: 'gb39', scen: '1939', P: 'GBR', qpt: 2, until: [1942, 4], diff: 2,
      tg: [{ pow: 1.15 }, { pow: 1.25 }, { pow: 1.35 }], par: [[7, 12], [9, 12], [9, 13]],
      G: t => [flag('gb39.ally', S => W().isAlly(S, 'GBR', 'USA')), flag('gb39.war', S => W().atWar(S, 'USA', 'DEU')),
        mult('gb39.pow', t.pow, (S, M) => W().power(S, 'GBR') / M.base.pow.GBR), flag('home', S => own(S, 'GBR'), true)] },
    { id: 'su39', scen: '1939', P: 'RUS', qpt: 2, until: [1943, 4], diff: 3, hold: true, // 坚守型：到期限那个季度结算完时各项都满足才算完成
      tg: [{ front: 40, stab: 30 }, { held: 1, stab: 30 }, { held: 1, stab: 35 }], // 简单档看德军攻势进度；普通、困难档要守住乌克兰或白俄罗斯（至少一处）
      G: t => [flag('su39.ally', S => W().isAlly(S, 'RUS', 'GBR') || W().isAlly(S, 'RUS', 'USA')),
        t.held ? flag('su39.held', S => ['UKR', 'BLR'].some(X => S.actors[X] && S.actors[X].ctrl === 'RUS'), true) : atMost('su39.front', t.front, S => enemyOn(S, 'RUS', 'DEU')),
        atLeast('su39.stab', t.stab, S => S.actors.RUS.stab, 'num', true),
        { k: 'su39.hold', ev: (S, M) => ({ ok: S.turn > M.dl && own(S, 'RUS'), cur: Math.max(0, Math.min(S.turn, M.dl + 1) - M.t0), tgt: M.dl + 1 - M.t0, fmt: 'q' }) }],
      fail: S => (own(S, 'RUS') ? null : 'su39.lost'),
      /* 评星看到期时的局面：德军对苏联本土的攻势进度不超过 20% 且稳定比要求高 10 以上三星，攻势进度不超过 35% 两星（star 也用来写评星说明） */
      star: { front: [20, 35], stab: 10 },
      stars(S, M, t) { const z = this.star, p = enemyOn(S, 'RUS', 'DEU'), st = S.actors.RUS.stab; return p <= z.front[0] && st >= t.stab + z.stab ? 3 : p <= z.front[1] ? 2 : 1; } },
    { id: 'us39', scen: '1939', P: 'USA', qpt: 2, until: [1942, 4], diff: 1,
      tg: [{ n: 2, pow: 1.35 }, { n: 3, pow: 1.5 }, { n: 4, pow: 1.7 }], par: [[3, 6], [4, 8], [6, 10]],
      G: t => [atLeast('us39.gbr', t.n, (S, M) => M.cnt.GBR || 0, 'n'), atLeast('us39.chn', t.n, (S, M) => M.cnt.CHN || 0, 'n'),
        mult('us39.pow', t.pow, (S, M) => W().power(S, 'USA') / M.base.pow.USA)] },
    { id: 'us45', scen: '1945', P: 'USA', qpt: 2, until: [1950, 4], diff: 2,
      tg: [{ gdp: 1.25, al: 1 }, { gdp: 1.4, al: 2 }, { gdp: 1.6, al: 3 }], par: [[7, 11], [10, 14], [13, 17]],
      G: t => { const e = ['GBR', 'FRA', 'DEU'];
        return [mult('us45.gdp', t.gdp, (S, M) => e.reduce((s, X) => s + gdp(S, X), 0) / e.reduce((s, X) => s + M.base.gdp[X], 0)),
          atLeast('us45.ally', t.al, S => e.filter(X => W().isAlly(S, 'USA', X)).length, 'n')]; } },
    { id: 'gb45', scen: '1945', P: 'GBR', qpt: 2, until: [1950, 4], diff: 2,
      tg: [{ mil: 5, gdp: 1.15, stab: 60, tre: 2 }, { mil: 4, gdp: 1.2, stab: 65, tre: 3 }, { mil: 3, gdp: 1.25, stab: 70, tre: 4 }], par: [[14, 17], [16, 19], [20, 21]],
      G: t => [flag('gb45.mob', S => W().mobIdx(S.actors.GBR) === 0, true), atMost('gb45.mil', t.mil, S => S.actors.GBR.milPct, 'maxpct'),
        mult('gb45.gdp', t.gdp, (S, M) => gdp(S, 'GBR') / M.base.gdp.GBR), atLeast('gb45.stab', t.stab, S => S.actors.GBR.stab, 'num', true),
        atLeast('gb45.tre', t.tre, S => S.actors.GBR.treasury / Math.max(1, gdp(S, 'GBR')) * 100, 'pct')] },
    { id: 'cn79', scen: '1979', P: 'CHN', qpt: 4, until: [1989, 4], diff: 2,
      tg: [{ gdp: 1.8 }, { gdp: 2 }, { gdp: 2.2 }], par: [[27, 32], [32, 38], [38, 42]],
      G: t => [mult('cn79.gdp', t.gdp, (S, M) => gdp(S, 'CHN') / M.base.gdp.CHN), flag('cn79.usa', S => trade(S, 'CHN', 'USA')), flag('cn79.jpn', S => trade(S, 'CHN', 'JPN'))] },
    { id: 'in79', scen: '1979', P: 'IND', qpt: 2, until: [1984, 4], diff: 2,
      tg: [{ rel: 30, gdp: 1.2 }, { rel: 40, gdp: 1.25 }, { rel: 50, gdp: 1.3 }], par: [[15, 19], [18, 22], [20, 23]],
      G: t => [atLeast('in79.usa', t.rel, S => rel(S, 'IND', 'USA')), atLeast('in79.rus', t.rel, S => rel(S, 'IND', 'RUS')),
        mult('in79.gdp', t.gdp, (S, M) => gdp(S, 'IND') / M.base.gdp.IND)] },
    { id: 'cn26', scen: '2026', P: 'CHN', qpt: 2, until: [2031, 4], diff: 2,
      tg: [{ n: 4, tech: 93, gdp: 1.12 }, { n: 5, tech: 95, gdp: 1.15 }, { n: 7, tech: 97, gdp: 1.18 }], par: [[8, 12], [10, 14], [12, 16]],
      G: t => [atLeast('cn26.trade', t.n, S => S.treaties.filter(x => x.type === 'trade' && (x.a === 'CHN' || x.b === 'CHN')).length, 'n'),
        atLeast('cn26.tech', t.tech, S => S.actors.CHN.tech), mult('cn26.gdp', t.gdp, (S, M) => gdp(S, 'CHN') / M.base.gdp.CHN)] },
    { id: 'in26', scen: '2026', P: 'IND', qpt: 4, until: [2032, 4], diff: 2,
      tg: [{ lead: 1, rel: 40 }, { lead: 1, rel: 50 }, { lead: 1.1, rel: 60 }], par: [[16, 20], [15, 19], [21, 24]], // lead：GDP 要达到日本、德国的几倍（1 就是超过）
      G: t => { const ld = (k, X) => mult(t.lead > 1 ? k + '2' : k, t.lead, S => gdp(S, 'IND') / Math.max(1, gdp(S, X)));
        return [ld('in26.jpn', 'JPN'), ld('in26.deu', 'DEU'), atLeast('in26.usa', t.rel, S => rel(S, 'IND', 'USA')), atLeast('in26.rus', t.rel, S => rel(S, 'IND', 'RUS'))]; } },
    { id: 'kr26', scen: '2026', P: 'KOR', qpt: 2, until: [2031, 4], diff: 2,
      tg: [{ rel: 0 }, { rel: 20 }, { rel: 40 }], par: [[6, 10], [6, 10], [8, 12]],
      G: t => [atLeast('kr26.rel', t.rel, S => rel(S, 'KOR', 'PRK')), flag('kr26.nap', S => W().hasTreaty(S, 'KOR', 'PRK', 'nap')), flag('kr26.peace', S => !W().atWar(S, 'KOR', 'PRK'), true)],
      fail: S => (W().atWar(S, 'KOR', 'PRK') ? 'kr26.war' : null) },
  ];
  /* 简化模式的参谋：没达成的目标该做什么（deal 条款 + 对象；act 行动 + 对象（没有就是本国）；build 征兵并采购；deploy 从哪里调兵到哪里；demob 降低动员；milcut 把军费降到目标；
   * save 少花钱（只有文字）；joinwar 盟友 + 敌国；对象 best 表示找关系最好的国家；第四项 'pre' 表示目标眼下满足也要提前准备） */
  const ADV = {
    'gb39.ally': ['deal', 'alliance', 'USA'], 'gb39.war': ['joinwar', 'USA', 'DEU'], 'gb39.pow': ['build'],
    'su39.ally': ['deal', 'alliance', ['GBR', 'USA']], 'su39.held': ['deploy', 'RUS', 'UKR', 'pre'], 'su39.front': ['build'], 'su39.stab': ['act', 'stabilize'],
    'us39.gbr': ['act', 'aid', 'GBR'], 'us39.chn': ['act', 'aid', 'CHN'], 'us39.pow': ['build'],
    'us45.gdp': ['act', 'aid', ['FRA', 'DEU', 'GBR']], 'us45.ally': ['deal', 'alliance', ['GBR', 'FRA', 'DEU']],
    'gb45.mob': ['demob'], 'gb45.mil': ['milcut'], 'gb45.gdp': ['act', 'stimulus'], 'gb45.stab': ['act', 'stabilize'], 'gb45.tre': ['save'],
    'cn79.gdp': ['act', 'stimulus'], 'cn79.usa': ['deal', 'trade', 'USA'], 'cn79.jpn': ['deal', 'trade', 'JPN'],
    'in79.usa': ['act', 'summit', 'USA'], 'in79.rus': ['act', 'summit', 'RUS'], 'in79.gdp': ['act', 'stimulus'],
    'cn26.trade': ['deal', 'trade', 'best'], 'cn26.tech': ['act', 'research'], 'cn26.gdp': ['act', 'stimulus'],
    'in26.jpn': ['act', 'stimulus'], 'in26.deu': ['act', 'research'], 'in26.jpn2': ['act', 'stimulus'], 'in26.deu2': ['act', 'stimulus'], 'in26.usa': ['act', 'summit', 'USA'], 'in26.rus': ['act', 'summit', 'RUS'],
    'kr26.rel': ['act', 'summit', 'PRK'], 'kr26.nap': ['deal', 'nap', 'PRK'],
  };
  const DIFFS = ['easy', 'normal', 'hard'];
  const dOf = M => (M && M.d >= 0 && M.d <= 2 ? M.d | 0 : 1);
  const tOf = (m, M) => (M && M.t) || m.tg[dOf(M)];
  /* 这一档的期限：简单档多一年（坚守型不变） */
  const untilOf = (m, d) => (d === 0 && !m.hold ? [m.until[0] + 1, m.until[1]] : m.until.slice());
  /* 期限换算成回合：剧本开局是第 0 回合（开局的那个季度）；dl 是任务里最后结算的那个季度的回合号，结算完（S.turn > dl）就到期 */
  const dlTurn = (m, S, d) => { const u = untilOf(m, d == null ? 1 : d); return (u[0] - S.year) * 4 + (u[1] - S.q) + S.turn; };
  /* 目标：按局面判定；spec 只列出目标（说明里用，不需要局面） */
  function goals(m, S, M) { return m.G(tOf(m, M)).map(g => Object.assign({ k: g.k, p: g.p || null, keep: !!g.keep }, g.ev(S, M))); }
  function spec(m, d) { return m.G(m.tg[d == null ? 1 : d]).map(g => ({ k: g.k, p: g.p || null, keep: !!g.keep, ok: false })); }
  for (const m of L) { m.goals = (S, M) => goals(m, S, M); m.gk = spec(m, 1).map(g => (g.keep ? '!' : '') + g.k); }
  /* 开始任务时的记录（开局时各国的 GDP 与军力是“开局的 N 倍”类目标的基准） */
  function init(m, S, d, seed) {
    d = d >= 0 && d <= 2 ? d | 0 : 1;
    const M = { id: m.id, d, t: Object.assign({}, m.tg[d]), seed: seed == null ? (S.seed ?? null) : seed, t0: S.turn, qpt: m.qpt, dl: dlTurn(m, S, d), base: { gdp: {}, pow: {} }, cnt: {}, turns: 0, undo: 0, done: null };
    for (const X of W().IDS) if (S.actors[X]) { M.base.gdp[X] = S.actors[X].gdp; M.base.pow[X] = W().power(S, X); }
    return M;
  }
  /* 援助类行动（每排一次算一次） */
  const AID = ['aid', 'armsaid', 'aidprog', 'loan', 'volunteers'];
  function countAid(M, queue) { for (const q of queue || []) if (q && AID.includes(q.type) && q.target) M.cnt[q.target] = (M.cnt[q.target] || 0) + 1; }
  /* 评星：用掉的季度不超过 par 的三星 / 两星；没有 par 时按用掉的时间（不到一半三星，不到八成两星） */
  function starsOf(m, S, M) {
    if (m.stars) return m.stars(S, M, tOf(m, M));
    const used = S.turn - M.t0, par = m.par && m.par[dOf(M)];
    if (par) return used <= par[0] ? 3 : used <= par[1] ? 2 : 1;
    const f = used / Math.max(1, M.dl + 1 - M.t0); return f <= 0.5 ? 3 : f <= 0.8 ? 2 : 1;
  }
  /* 每个季度结算完判定：出局或失败条件优先，然后看是否全部达成，最后看期限；还在进行返回 null */
  function check(m, S, M) {
    if (S.over && S.over.result === 'lose') return { res: 'fail', why: 'v4m.lost' };
    const f = m.fail && m.fail(S, M); if (f) return { res: 'fail', why: 'v4m.g.' + f };
    if (goals(m, S, M).every(g => g.ok)) return { res: 'win', stars: starsOf(m, S, M) };
    if (S.turn > M.dl) return { res: 'fail', why: 'v4m.timeout' };
    return null;
  }
  return { list: L, get: id => L.find(m => m.id === id) || null, DIFFS, untilOf, dlTurn, init, spec, countAid, check, starsOf, AID, adv: k => ADV[k] || null, tOf, dOf };
})();
try { window.TXMIS = TXMIS; } catch (e) { }
