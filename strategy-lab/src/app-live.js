// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 应用主体：现算。
 * 对照表、手册正文里引用的模拟数字、自检，都在这台电脑上算：开几个后台线程并行，算出一格显示一格。
 * 算过的结果存在浏览器里；引擎、玩法或者任何一条内置规则的代码一变，签名就变，旧结果作废重算。 */
(function (A) {
  "use strict";
  var QL = A.QL, LV = QL.live, KEY = "ql.live.v2";
  var L = A.live = { done: 0, total: 0, err: null };
  var mx = null, sig = "", pool = null, sims = {}, simState = {}, pstate = {}, gstate = {}, saveT = 0, emitT = 0, lastEmit = 0;
  function builtins() { return QL_STRATS.filter(function (s) { return !s.src; }); }
  function stratMeta(id) { var Ls = QL_STRATS; for (var i = 0; i < Ls.length; i++) if (Ls[i].id === id) return Ls[i]; return null; }

  /* ---------- 清单、签名、存档 ---------- */
  function skeleton() {
    var B = builtins(), ps = B.filter(function (s) { return !s.game; }).map(function (s) { return s.id; }), cells = {}, games = {};
    function blank(n) { var a = []; for (var i = 0; i < n; i++) a.push(undefined); return a; }       // 不留空洞：forEach / map 要能走到每一格
    ps.forEach(function (id) { cells[id] = blank(LV.PW.length); });
    var price = { worlds: LV.PW.map(function (w) { var d = QL.WORLDS[w.type]; return { key: w.key, type: w.type, over: w.over, name: w.name, ds: w.ds || null, N: d.defaults.N, T: d.defaults.T, K: d.defaults.K, bench: null }; }), strats: ps, cells: cells, cols: LV.PRICE_COLS };
    QL.ALL_GAMES.forEach(function (t) { var G = LV.gameSpec(t, B.filter(function (s) { return s.game === t; })); G.strats.forEach(function (id) { G.cells[id] = blank(G.scenes.length); }); games[t] = G; });
    return { v: 2, seed: LV.SEED, set: LV.set(), price: price, games: games };
  }
  function source() { return QLEngine.poolSource(builtins()); }
  function init() {
    if (mx) return;
    var src = source(); sig = (typeof window !== "undefined" && window.QL_LIVE_SIG) || A.hash(src) + "." + src.length;
    L.sig = sig; L.srcSig = A.hash(src) + "." + src.length;
    mx = skeleton();
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || "null");
      if (o && o.sig === sig) {
        Object.keys(o.price || {}).forEach(function (sid) { if (mx.price.cells[sid]) (o.price[sid] || []).forEach(function (c, i) { if (c !== "?" && c !== undefined && i < LV.PW.length) mx.price.cells[sid][i] = c; }); });
        (o.pbench || []).forEach(function (b, i) { if (Array.isArray(b) && mx.price.worlds[i]) mx.price.worlds[i].bench = b; });
        Object.keys(o.games || {}).forEach(function (t) {
          var G = mx.games[t], g = o.games[t]; if (!G || !g) return;
          (g.bench || []).forEach(function (b, i) { if (b !== "?" && b !== undefined && G.scenes[i]) G.scenes[i].bench = b; });
          Object.keys(g.cells || {}).forEach(function (sid) { if (G.cells[sid]) (g.cells[sid] || []).forEach(function (c, i) { if (c !== "?" && c !== undefined && i < G.scenes.length) G.cells[sid][i] = c; }); });
        });
        if (o.sims && typeof o.sims === "object") sims = o.sims;
      }
    } catch (e) {}
  }
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      if (A.resetting || !mx) return;
      var q = function (x) { return x === undefined ? "?" : x; }, pack = function (cells) { var o = {}; Object.keys(cells).forEach(function (k) { o[k] = cells[k].map(q); }); return o; };      // 还没算的格子记成 "?"：JSON 里没有 undefined
      var o = { sig: sig, price: pack(mx.price.cells), pbench: mx.price.worlds.map(function (w) { return w.bench; }), games: {}, sims: sims };
      Object.keys(mx.games).forEach(function (t) { var G = mx.games[t]; o.games[t] = { bench: G.scenes.map(function (s) { return q(s.bench); }), cells: pack(G.cells) }; });
      try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}       // 存不下（隐私窗口、配额满）就算了：下次打开再算一遍
    }, 1500);
  }
  function emit() {
    var wait = Math.max(0, 140 - (Date.now() - lastEmit));
    clearTimeout(emitT); emitT = setTimeout(function () { lastEmit = Date.now(); A.emit("live"); }, wait);
  }
  function getPool() {
    if (!pool || pool.dead) {
      var n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
      pool = new QLEngine.Pool(source(), n); L.threads = n;
    }
    return pool;
  }
  function finish(n) { L.done += n; if (!getPool().pending()) { L.done = 0; L.total = 0; } save(); emit(); }
  function seriesFor(w) { if (!w.ds) return null; var ds = A.datasets.filter(function (d) { return d.id === w.ds; })[0]; return ds ? { v: ds.v, K: ds.K } : null; }

  /* ---------- 对照表 ---------- */
  Object.defineProperty(A, "matrix", { get: function () { init(); return mx; }, enumerable: true });
  /** 要哪些格：{price: true} 整张价格表；{world: i} 一个世界的那一列；{strat: id} 一条规则的那一行；{game: type} 一套玩法的整张表。没算过的才会去算 */
  L.need = function (q) {
    init();
    var P = mx.price, byW = {}, i, n = 0;
    function wantCell(sid, wi) { var k = sid + "@" + wi; if (P.cells[sid][wi] !== undefined || pstate[k]) return; pstate[k] = 1; (byW[wi] || (byW[wi] = [])).push(sid); n++; }
    if (q.price) P.strats.forEach(function (sid) { for (i = 0; i < P.worlds.length; i++) wantCell(sid, i); });
    if (q.world != null && P.worlds[q.world]) P.strats.forEach(function (sid) { wantCell(sid, q.world); });
    if (q.strat && P.cells[q.strat]) for (i = 0; i < P.worlds.length; i++) wantCell(q.strat, i);
    Object.keys(byW).forEach(function (wi) {
      var w = LV.PW[+wi], sids = byW[wi], got = 0;
      getPool().submit({ type: "pcol", wi: +wi, sids: sids, series: seriesFor(w) }, function (m) {
        if (m.type !== "cell") return;
        P.cells[m.sid][m.wi] = m.cell || null; delete pstate[m.sid + "@" + m.wi]; got++;
        if (m.bench && !P.worlds[m.wi].bench) { P.worlds[m.wi].bench = m.bench; P.worlds[m.wi].N = m.N; P.worlds[m.wi].T = m.T; P.worlds[m.wi].K = m.K; }
        L.done++; emit();
      }, !q.price).then(function () { finish(0); }, function (e) { sids.forEach(function (sid) { var k = sid + "@" + wi; if (pstate[k]) { delete pstate[k]; P.cells[sid][+wi] = null; } }); L.err = e && e.message; finish(sids.length - got); });
    });
    var games = q.game ? [q.game] : q.games ? QL.ALL_GAMES : [];
    games.forEach(function (t) {
      var G = mx.games[t]; if (!G) return;
      G.scenes.forEach(function (sc, si) {
        var k = t + "@" + si; if (gstate[k]) return;
        if (sc.bench !== undefined && G.strats.every(function (sid) { return G.cells[sid][si] !== undefined; })) return;
        gstate[k] = 1; n += G.strats.length;
        var got = 0;
        getPool().submit({ type: "gcol", game: t, si: si }, function (m) {
          if (m.type === "gbench") G.scenes[si].bench = m.bench;
          else if (m.type === "gcell") { G.cells[m.sid][si] = m.cell || null; got++; L.done++; }
          emit();
        }, !q.games).then(function () { delete gstate[k]; finish(0); }, function (e) { delete gstate[k]; G.strats.forEach(function (sid) { if (G.cells[sid][si] === undefined) G.cells[sid][si] = null; }); if (G.scenes[si].bench === undefined) G.scenes[si].bench = null; L.err = e && e.message; finish(G.strats.length - got); });
      });
    });
    L.total += n;
    if (n) emit();
    return n;
  };
  /** 一组格子是不是都有了（算出来了，或者确定算不出来） */
  L.ready = function (q) {
    init();
    var P = mx.price, i, ok = true;
    if (q.price) P.strats.forEach(function (sid) { for (i = 0; i < P.worlds.length; i++) if (P.cells[sid][i] === undefined) ok = false; });
    if (q.world != null) P.strats.forEach(function (sid) { if (P.cells[sid][q.world] === undefined) ok = false; });
    if (q.strat && P.cells[q.strat]) for (i = 0; i < P.worlds.length; i++) if (P.cells[q.strat][i] === undefined) ok = false;
    (q.game ? [q.game] : q.games ? QL.ALL_GAMES : []).forEach(function (t) { var G = mx.games[t]; if (!G) return; G.scenes.forEach(function (sc, si) { if (sc.bench === undefined) ok = false; G.strats.forEach(function (sid) { if (G.cells[sid][si] === undefined) ok = false; }); }); });
    return ok;
  };
  L.busy = function () { return !!pool && !pool.dead && pool.pending() > 0; };
  /** 把存着的结果全部丢掉，重新算（"重算"按钮） */
  L.reset = function () {
    if (pool) pool.dispose(); pool = null; pstate = {}; gstate = {}; sims = {}; simState = {}; L.done = 0; L.total = 0; L.err = null;
    mx = null; try { localStorage.removeItem(KEY); } catch (e) {}
    init(); emit();
  };

  /* ---------- 指定的一次实验 ---------- */
  /** 返回结果；还没算过就排进队里、返回 undefined，算完会发 "live" 事件。算不出来的返回 {err} */
  L.sim = function (job) {
    init();
    var key = JSON.stringify(job);
    if (sims[key]) return sims[key];
    if (!simState[key]) {
      simState[key] = 1; L.total++;
      var w = QL.WORLDS[job.world], st = stratMeta(job.strat);
      if (!w || !st) { sims[key] = { err: "没有这个世界或规则" }; delete simState[key]; L.total--; return sims[key]; }
      getPool().submit({ type: "sim", job: job, key: key, series: job.ds ? seriesFor({ ds: job.ds }) : null }, function (m) { if (m.type === "sim") sims[key] = m.res; }, true)
        .then(function () { delete simState[key]; finish(1); }, function (e) { delete simState[key]; sims[key] = { err: (e && e.message) || "出错了" }; finish(1); });
      emit();
    }
    return undefined;
  };

  /* ---------- 手册正文里的"活数字" ----------
   * 正文里写 ⟪名字⟫ 或 ⟪名字|格式⟫，名字在 QL_GUIDE.live 里登记：
   *   { calc: function () { return 数; } }                        直接算（公式、倒推）
   *   { cell: [玩法, 第几个场景, 规则, 第几列] }                   对照表里的一格；列：0 得分 1 标准误 2 与基准的配对差 3 配对差的标准误 4… 附带统计，"bench" 基准的得分
   *   { pcell: [规则, 世界的键, 列名] }                            价格世界那张表里的一格
   *   { pbench: [世界的键, 第几个] }                               那个世界里买入持有的成绩：0 增长率 1 夏普 2 期望收益 3 回撤的中位数
   *   { sim: {world, wp, strat, sp, …}, pick: 取哪个数 }           专门跑一次
   *   { of: [名字…], f: function (a, b, …) { return 数; } }       从别的数算出来
   * 格式：数字 = 小数位数；%1 = 百分数、1 位小数；默认用登记时的 d。 */
  function reg() { return (window.QL_GUIDE && window.QL_GUIDE.live) || {}; }
  /** 取一个数。还没算出来返回 undefined（并且已经去算了）；算不出来返回 null */
  L.val = function (id, depth) {
    var sp = reg()[id], v, c;
    if (!sp || (depth | 0) > 6) return null;
    init();
    try {
      if (sp.calc) { v = sp.calc(QL); return typeof v === "number" && v === v ? v : null; }
      if (sp.cell) {
        var G = mx.games[sp.cell[0]]; if (!G) return null;
        var si = sp.cell[1];
        if (typeof si === "string") { var nm = si; si = -1; G.scenes.forEach(function (x, i) { if (x.name === nm) si = i; }); if (si < 0) return null; }
        if (sp.cell[3] === "bench") { v = G.scenes[si] && G.scenes[si].bench; if (v === undefined) { L.need({ game: sp.cell[0] }); return undefined; } return typeof v === "number" ? v : null; }
        c = G.cells[sp.cell[2]] && G.cells[sp.cell[2]][si];
        if (c === undefined) { if (!G.cells[sp.cell[2]]) return null; L.need({ game: sp.cell[0] }); return undefined; }
        return c && typeof c[sp.cell[3]] === "number" ? (sp.neg ? -c[sp.cell[3]] : c[sp.cell[3]]) : null;
      }
      if (sp.pcell) {
        var P = mx.price, wi = -1; P.worlds.forEach(function (w, i) { if (w.key === sp.pcell[1]) wi = i; });
        if (wi < 0 || !P.cells[sp.pcell[0]]) return null;
        c = P.cells[sp.pcell[0]][wi];
        if (c === undefined) { L.need({ world: wi }); return undefined; }          // 只要这个世界的那一列，不把整张表拖进来
        v = c && c[P.cols.indexOf(sp.pcell[2])]; return typeof v === "number" ? v : null;
      }
      if (sp.pbench) {
        var Pb = mx.price, wb = -1; Pb.worlds.forEach(function (w, i) { if (w.key === sp.pbench[0]) wb = i; });
        if (wb < 0) return null;
        if (!Pb.worlds[wb].bench) { if (L.ready({ world: wb })) return null; L.need({ world: wb }); return undefined; }
        v = Pb.worlds[wb].bench[sp.pbench[1]]; return typeof v === "number" ? v : null;
      }
      if (sp.sim) {
        var r = L.sim(sp.sim); if (r === undefined) return undefined; if (!r || r.err) return null;
        v = typeof sp.pick === "function" ? sp.pick(r) : r[sp.pick || "score"]; return typeof v === "number" && v === v ? v : null;
      }
      if (sp.of) {
        var args = [], wait = false, dead = false;
        sp.of.forEach(function (k) { var x = L.val(k, (depth | 0) + 1); if (x === undefined) wait = true; else if (x === null) dead = true; args.push(x); });
        if (dead) return null; if (wait) return undefined;
        v = sp.f.apply(null, args); return typeof v === "number" && v === v ? v : null;
      }
    } catch (e) { console.error(e); return null; }
    return null;
  };
  L.fmt = function (id, how, v) {
    var sp = reg()[id] || {}, f = how != null && how !== "" ? String(how) : sp.fmt != null ? String(sp.fmt) : "3";
    if (v == null) return v === undefined ? "…" : "—";
    if (f.charAt(0) === "%") return A.P(v, +f.slice(1) || 0);
    return A.F(v, +f);
  };
  /** 把一段刚渲染好的文字里的 ⟪…⟫ 填上数（没算出来的先放"…"，算出来后由 "live" 事件再填） */
  function fill(root) {
    var nodes = (root || document).querySelectorAll(".lv:not(.ok)");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i], body = el.getAttribute("data-live") || "", bar = body.indexOf("|"), id = bar < 0 ? body : body.slice(0, bar), how = bar < 0 ? null : body.slice(bar + 1), v = L.val(id);
      el.textContent = L.fmt(id, how, v);
      el.title = v === undefined ? "正在这台电脑上现算…" : v === null ? "这个数没能算出来" : "这个数是在你的电脑上现算的" + (reg()[id] && reg()[id].how ? "：" + reg()[id].how : "");
      if (v !== undefined) el.classList.add("ok"); else el.classList.add("wait");
      if (v !== undefined) el.classList.remove("wait");
    }
  }
  L.fill = fill;
  QLMD.onMount = fill;
  A.on("live", function () { fill(document); });

  /* ---------- 自检 ----------
   * QL_GUIDE.checks 里的每一条：{ id, group, say, need: [名字…], test: function (v) { return 真假 或 {ok, note}; } }
   * v(名字) 给出那个数；need 里的数都算出来之后才判。 */
  L.check = function (c) {
    var vals = {}, wait = false, dead = [];
    (c.need || []).forEach(function (k) { var x = L.val(k); vals[k] = x; if (x === undefined) wait = true; else if (x === null) dead.push(k); });
    if (dead.length) return { state: "fail", note: "这几个数没能算出来：" + dead.join("、"), vals: vals };
    if (wait) return { state: "wait", vals: vals };
    try { var r = c.test(function (k) { return vals[k]; }); if (r && typeof r === "object") return { state: r.ok ? "pass" : "fail", note: r.note || "", vals: vals }; return { state: r ? "pass" : "fail", vals: vals }; }
    catch (e) { return { state: "fail", note: String(e && e.message || e), vals: vals }; }
  };
})(App);
