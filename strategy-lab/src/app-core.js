// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 应用主体（一）：小工具、状态、后台线程的调度。 */
var App = (function () {
  "use strict";
  var QL = QL_CORE(window);
  var A = { QL: QL };
  if (typeof QL_GAME_STRATS === "function") QL_GAME_STRATS(QL).forEach(function (s) { QL_STRATS.push(s); });   // 十套玩法各自的内置规则
  if (typeof QL_OBS_STRATS === "function") QL_OBS_STRATS(QL).forEach(function (s) { QL_STRATS.push(s); });     // 四套观测玩法的内置规则

  /* ---------- DOM 小工具 ---------- */
  function h(tag, attrs) {
    var el = document.createElement(tag), i, k;
    if (attrs) for (k in attrs) {
      var v = attrs[k]; if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "style" && typeof v === "object") for (var s in v) el.style.setProperty(s, v[s]);
      else if (k === "value" || k === "checked" || k === "disabled" || k === "hidden" || k === "selected") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  }
  function $(id) { return document.getElementById(id); }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function debounce(fn, ms) { var t; return function () { var a = arguments, me = this; clearTimeout(t); t = setTimeout(function () { fn.apply(me, a); }, ms); }; }
  var toastT;
  function toast(msg, ms) {
    var old = document.querySelector(".toast"); if (old) old.remove();
    var el = h("div", { class: "toast", role: "status", text: msg }); document.body.appendChild(el);
    clearTimeout(toastT); toastT = setTimeout(function () { el.remove(); }, ms || 2600);
  }
  A.h = h; A.$ = $; A.clear = clear; A.debounce = debounce; A.toast = toast;
  /** 数量是 1 时用 one，否则用 many。中文的量词不分单复数，所以调用的地方两个参数写的是同一段中文；英文版里它们分别被译成单数和复数 */
  A.n1 = function (n, one, many) { return n === 1 ? one : many; };
  /* 右栏的助手是谁。在 Claude 里打开页面时由宿主提供 Claude；放在普通网站上时没有，由使用者自带密钥接入一家服务商（src/ai.js）。
   * 界面上泛指这位助手的地方一律用 A.AI：在 Claude 里是"Claude"，在独立的网页里是"AI"。 */
  A.aiHost = !!(window.claude && typeof window.claude.use === "function");
  A.AI = A.aiHost ? "Claude" : "AI";
  /** 手册等现成的文字是按"在 Claude 里打开"写的；独立的网页里把其中的 Claude 换成当前的称呼 */
  A.aiSay = function (s) { return A.aiHost ? s : String(s).replace(/Claude/g, A.AI); };

  /* ---------- 数字的写法 ---------- */
  var F = QLChart.fmtNum, P = QLChart.fmtPct;
  function sgn(s) { return s.charAt(0) === "−" || s.charAt(0) === "+" || s === "—" || !/[1-9]/.test(s) ? s : "+" + s; }   // 显示出来是 0 的数不带正负号
  function pctS(v, d) { return sgn(P(v, d)); }
  function pm(se, asPct, d) { return se === se && se != null ? "± " + (asPct ? P(se, d) : F(se, d)) : ""; }
  A.F = F; A.P = P; A.pctS = pctS; A.pm = pm; A.sgn = sgn;

  /* ---------- 状态 ---------- */
  var DEF_CHARTS = ["equity", "dist", "lev", "paths", "single"];
  var S = A.state = {
    world: { type: "gbm", N: 2000, T: 252, K: 252, seed: 7, dsId: "sample-goog" },
    wparams: {},              // 每种世界各自记住的参数
    stratId: "const",
    sparams: {},              // 每个规则各自记住的参数
    set: Object.assign({}, QL.DEFAULT_SET),
    charts: DEF_CHARTS.slice(), wide: {}, copt: {},
    custom: null,             // {name, code, schema, explain}
    compare: [],
    tier: "complex",
    gcharts: ["equity", "dist", "single", "sweep"],   // 玩法里显示哪些图（与价格世界分开记）
    last: {},                 // 每个世界上一次用的规则：换世界时，规则跟着换回去
    lastPrice: "gbm"          // 上一次在"交易一个资产"里用的世界：从别的玩法回来时回到这里
  };
  A.my = [];                  // 我的策略（Claude 写的或自己改的）
  A.datasets = [];
  A.run = null; A.worldStats = null; A.oos = null; A.oosCount = 0; A.err = null; A.fitMs = null;

  A.allStrats = function () { return QL_STRATS.concat(A.my); };
  A.strat = function (id) { id = id || S.stratId; var L = A.allStrats(); for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return QL_STRATS[0]; };
  /* ---------- 玩法 ---------- */
  A.isGame = function (type) { var w = QL.WORLDS[type || S.world.type]; return !!(w && w.game); };
  /** 这套玩法除了自己的得分，是否还适用"三种口径"（动作是仓位、净值按复利滚动的那几套） */
  A.isCrit = function () { var w = A.wdef(); return !w.game || !!w.crit; };
  /** 规则能不能在这个世界里用：玩法自带的规则只在那套玩法里用；价格世界的规则可以用在"动作是仓位"的玩法里 */
  A.stratOk = function (st, type) {
    var w = QL.WORLDS[type || S.world.type];
    if (st.game) return st.game === (type || S.world.type);
    return !w.game || w.act === "position";
  };
  A.stratsFor = function (type) { return A.allStrats().filter(function (st) { return A.stratOk(st, type); }); };
  /** 保证当前规则在当前世界里能用；不能用就换回这个世界上次用的那条，或者它的默认规则 */
  A.fixStrat = function () {
    var type = S.world.type, w = QL.WORLDS[type], cur = A.strat(), key = w.game ? type : "price";
    if (cur.id === S.stratId && A.stratOk(cur, type)) { S.last[key] = cur.id; return false; }
    var want = S.last[key], pick = null, L = A.stratsFor(type);
    L.forEach(function (st) { if (st.id === want) pick = st; });
    if (!pick && w.game) L.forEach(function (st) { if (st.id === w.defStrat) pick = st; });
    if (!pick) pick = L[0] || QL_STRATS[0];
    S.stratId = pick.id; S.last[key] = pick.id;
    return true;
  };
  /** 玩法的得分怎么写：概率写成百分数，金额带美元号，"越低越好"的成本取相反数 */
  function usd(x, d) { var s = x.toFixed(d), i = s.indexOf("."), a = i < 0 ? s : s.slice(0, i); return a.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (i < 0 ? "" : s.slice(i)); }   // 1234567.80 → 1,234,567.80
  A.gfmt = function (g, v, plain) {
    if (v == null || !(v === v)) return "—";
    var x = g.lower && !plain ? -v : v, d = g.digits == null ? 3 : g.digits;
    if (g.kind === "prob" || g.kind === "pct") return P(x, d);
    if (g.kind === "usd") return (x < 0 ? "−$" : "$") + usd(Math.abs(x), d);
    return F(x, d);
  };
  /** 两个得分之差的写法（不带"越低越好"的翻转：正数永远表示前者更好） */
  A.gdiff = function (g, v) {
    if (v == null || !(v === v)) return "—";
    var d = g.digits == null ? 3 : g.digits, s;
    if (g.kind === "prob" || g.kind === "pct") s = P(Math.abs(v), d); else if (g.kind === "usd") s = "$" + usd(Math.abs(v), d); else s = F(Math.abs(v), d);
    return (!/[1-9]/.test(s) ? " " : v < 0 ? "−" : "+") + s;   // 显示出来是 0 的差不带正负号（占位的空格保证调用的人照旧可以切掉第一个字符）
  };
  /** 规则的参数表。玩法可以修正个别参数的范围和默认值（比如"先看多少人"不能超过候选人数，门槛的默认值取当前分布下的最优） */
  A.sschema = function (st) {
    st = st || A.strat(); var w = QL.WORLDS[S.world.type], P0 = st.params || [];
    if (!w || !w.game || !w.ranges || !st.lib || st.game !== S.world.type) return P0;
    var R = w.ranges(A.wp());
    return P0.map(function (q) { var r = R[st.lib + "." + q.key]; if (!r) return q; var o = Object.assign({}, q, { min: r[0], max: r[1] }); if (r[2] != null) o.def = r[2]; o.def = Math.min(o.max, Math.max(o.min, o.def)); return o; });
  };
  /** 当前规则的参数（补齐默认值；超出当前范围的收回来）。
   *  有的玩法会按场景收窄参数的范围（秘书问题里"先看多少人"不能超过人数减一）。被收回来的参数记着你原来设的值：
   *  范围放宽了就还给你；你自己动过它，就以你新设的为准。 */
  var clampMemo = {};
  A.sp = function (id) {
    var st = A.strat(id), p = S.sparams[st.id] || (S.sparams[st.id] = {}), memo = clampMemo[st.id] || (clampMemo[st.id] = {});
    A.sschema(st).forEach(function (q) {
      if (p[q.key] === undefined) { p[q.key] = q.def; delete memo[q.key]; return; }
      if (q.type !== "num" || typeof p[q.key] !== "number") return;
      var m = memo[q.key];
      if (m) { if (p[q.key] === m.got) p[q.key] = m.want; delete memo[q.key]; }      // 还是当初收回来的那个数：先换回原来想要的，下面再按现在的范围量一次
      var v = p[q.key];
      if (v > q.max) { memo[q.key] = { want: v, got: q.max }; p[q.key] = q.max; }
      else if (v < q.min) { memo[q.key] = { want: v, got: q.min }; p[q.key] = q.min; }
    });
    return p;
  };
  /** 同上，但被收回来的参数给的是你原来设的值（场景对比用它：每个场景各自按自己的范围去收） */
  A.spWant = function (id) {
    var st = A.strat(id), p = Object.assign({}, A.sp(id)), memo = clampMemo[st.id] || {};
    Object.keys(memo).forEach(function (k) { if (p[k] === memo[k].got) p[k] = memo[k].want; });
    return p;
  };
  A.wdef = function () { return QL.WORLDS[S.world.type]; };
  A.wschema = function () { return S.world.type === "custom" && S.custom ? (S.custom.schema || []) : (A.wdef().params || []); };
  A.wp = function () {
    var key = S.world.type, p = S.wparams[key] || (S.wparams[key] = {});
    A.wschema().forEach(function (q) { if (p[q.key] === undefined) p[q.key] = q.def; });
    return p;
  };
  A.dataset = function (id) { id = id || S.world.dsId; for (var i = 0; i < A.datasets.length; i++) if (A.datasets[i].id === id) return A.datasets[i]; return A.datasets[0] || null; };
  A.unit = function () { return A.wdef().unit || "年"; };
  A.isReal = function () { return S.world.type === "real"; };
  A.worldCfg = function () {
    var w = S.world, d = A.wdef(), ds = d.needsData ? A.dataset() : null, p = Object.assign({}, A.wp());
    if (d.game) return { type: w.type, params: p, N: A.gameN(), T: d.Tof(p), K: d.Kof ? d.Kof(p) : 1, seed: w.seed, S0: 100 };
    return { type: w.type, params: p, N: w.N, T: w.T, K: ds ? ds.K : w.K, seed: w.seed, S0: 100 };
  };
  /** 玩法的局数：局数 × 回合数有上限，超了就按上限算 */
  A.gameN = function () { var d = A.wdef(), T = d.Tof(A.wp()); return Math.max(1, Math.min(S.world.N, Math.floor(QL.GAME_MAX_CELLS / T))); };
  A.worldLabel = function () {
    var w = S.world, d = A.wdef(), st = A.worldStats, nm = w.type === "custom" && S.custom ? S.custom.name : d.short;
    if (d.needsData) { var ds = A.dataset(); nm += " · " + (ds ? ds.name : "未导入数据"); }
    if (A.worldStatsKey !== curWorldKey()) st = null;
    if (d.game) { var c = A.worldCfg(), wo = d.wsel ? (A.wschema().filter(function (q) { return q.key === d.wsel; })[0] || {}).options || [] : [], wn = wo.filter(function (o) { return o[0] === A.wp()[d.wsel]; })[0]; if (wn) nm += " · " + wn[1].replace(/（.*$/, ""); return nm + " · " + c.N + " 局 × " + (d.crit ? c.T + " 步" : c.T + " " + d.unit) + " · 种子 " + w.seed; }
    var n = st ? st.N : w.N, t = st ? st.T : w.T;
    return nm + " · " + n + A.n1(n, " 条 × ", " 条 × ") + t + " 步" + (w.type === "real" ? "" : " · 种子 " + w.seed);
  };

  function persist() {
    if (A.resetting) return;                 // 刚点了"恢复默认设置"：这一次打开页面期间不再往回写
    QLIO.save({
      v: 1, world: S.world, wparams: S.wparams, stratId: S.stratId, sparams: S.sparams, set: S.set, charts: S.charts, wide: S.wide, copt: S.copt, custom: S.custom, compare: S.compare, tier: S.tier, gcharts: S.gcharts, last: S.last, lastPrice: S.lastPrice,
      my: A.my, ds: A.datasets.filter(function (d) { return d.src === "import"; }).slice(-6).map(QLIO.packDs)
    });
  }
  A.persist = debounce(persist, 400);
  A.persistNow = persist;                   // 离开页面时不等那 400 毫秒
  A.restore = function () {
    var o = QLIO.load(); if (!o || o.v !== 1) return;
    try {
      if (o.world && QL.WORLDS[o.world.type]) Object.assign(S.world, o.world);
      ["wparams", "sparams", "wide", "copt"].forEach(function (k) { if (o[k] && typeof o[k] === "object" && !Array.isArray(o[k])) S[k] = o[k]; });
      // 存档可能来自旧版本，也可能被别的东西写坏：每一项都该是对象，不是的丢掉
      ["wparams", "sparams", "copt"].forEach(function (k) { Object.keys(S[k]).forEach(function (q) { var v = S[k][q]; if (!v || typeof v !== "object" || Array.isArray(v)) delete S[k][q]; }); });
      if (o.set) Object.assign(S.set, o.set);
      if (Array.isArray(o.charts)) S.charts = o.charts.filter(function (x) { return typeof x === "string"; });
      if (Array.isArray(o.gcharts)) S.gcharts = o.gcharts.filter(function (x) { return typeof x === "string"; });
      if (o.last && typeof o.last === "object") S.last = o.last;
      if (typeof o.lastPrice === "string" && QL.WORLDS[o.lastPrice] && !QL.WORLDS[o.lastPrice].game) S.lastPrice = o.lastPrice;
      if (!QL.WORLDS[S.world.type].game) S.lastPrice = S.world.type;        // 上一版的存档里没有这一项：眼下用的就是价格世界时，记它
      if (o.custom && o.custom.code) S.custom = o.custom;
      if (Array.isArray(o.compare)) S.compare = o.compare.slice(0, 6);
      if (o.tier) S.tier = o.tier;
      if (Array.isArray(o.my)) A.my = o.my.filter(function (m) { return m && typeof m.id === "string" && m.id && typeof m.code === "string" && m.code && (!m.game || (QL.WORLDS[m.game] && QL.WORLDS[m.game].game)); })
        .map(function (m) { if (typeof m.name !== "string" || !m.name) m.name = "未命名的规则"; if (!m.src) m.src = "edit"; if (!Array.isArray(m.params)) m.params = []; return m; });
      if (Array.isArray(o.ds)) o.ds.forEach(function (d) { try { A.datasets.push(QLIO.unpackDs(d)); } catch (e) {} });
      if (o.stratId) S.stratId = o.stratId;
      if (S.world.type === "custom" && !S.custom) S.world.type = "gbm";
      A.fixStrat();
    } catch (e) {}
  };

  /* ---------- 后台线程调度 ---------- */
  var eng = null, engKey = "", worldKey = "", worldP = null, running = false, queued = null, listeners = {};
  A.on = function (ev, fn) { (listeners[ev] || (listeners[ev] = [])).push(fn); };
  function emit(ev, a) { (listeners[ev] || []).forEach(function (fn) { try { fn(a); } catch (e) { console.error(e); } }); }
  A.emit = emit;
  function hash(s) { var x = 2166136261; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); }
  A.hash = hash;
  function worldCode() { return S.world.type === "custom" && S.custom ? S.custom.code : ""; }
  function extFor() { var ds = A.wdef().needsData ? A.dataset() : null; return ds ? { series: ds.v } : null; }
  A.worldKey = function () { return curWorldKey(); };
  A.worldCode = worldCode; A.extFor = extFor;
  function curWorldKey() { var ds = A.wdef().needsData ? A.dataset() : null; return JSON.stringify(A.worldCfg()) + "|" + (ds ? ds.id + ":" + ds.v.length : ""); }
  A.fitKeys = function (st) { st = st || A.strat(); return st.fitKeys || null; };
  A.hasFit = function (st) { st = st || A.strat(); return /\bfunction\s+fit\s*\(/.test(st.code || ""); };
  /** 等后台线程的时限：带训练的规则要先训练模型，放宽到 10 分钟 */
  A.tmo = function (base, st) { return A.hasFit(st) ? 600000 : base; };

  /** 保证有一个装着当前策略代码、当前世界的后台线程 */
  A.engine = function () {
    var st = A.strat(), key = hash(st.code) + "/" + hash(worldCode());
    if (!eng || eng.dead || key !== engKey) {
      if (eng) eng.dispose();
      eng = new QLEngine.Engine(st.code, worldCode(), {
        onFit: function (ms, info) { A.fitMs = ms; A.fitInfo = info || null; emit("fit", ms); },
        onDeath: function () { worldKey = ""; }
      });
      engKey = key; worldKey = ""; worldP = null;
    }
    var wk = curWorldKey(), e = eng;
    if (wk !== worldKey || !worldP) {
      worldKey = wk;
      if (A.wdef().needsData && !A.dataset()) { worldP = Promise.reject({ message: "这个世界需要先导入一段数据", needData: true }); worldP.catch(function () {}); }
      else worldP = e.send("world", { cfg: A.worldCfg(), ext: extFor() }, { timeout: 60000 }).then(function (m) {
        if (e === eng) { A.worldStats = m.stats; A.worldStatsKey = wk; A.oos = null; emit("world", m); }
        return e;
      });
      worldP.catch(function () { if (e === eng) worldKey = ""; });
    }
    return worldP.then(function () { return e; });
  };
  A.currentEngine = function () { return eng; };

  /** 请求重新回测。kind: "live"（拖动中）或 "commit"（松手 / 改了离散选项） */
  A.requestRun = function (kind) {
    queued = queued === "commit" || kind === "commit" ? "commit" : "live";
    if (!running) pump();
    // 带训练的规则可能要跑很久：用户已经改了设置，就不等它跑完，停掉重来
    else if (kind === "commit" && eng && !eng.dead && eng.info && eng.info.hasFit && Date.now() - runStart > 1500) eng.kill({ cancelled: true, message: "已取消" });
  };
  var runStart = 0;
  function pump() {
    if (!queued) { running = false; A.isBusy = false; return; }
    var kind = queued; queued = null; running = true;
    var st = A.strat(), p = Object.assign({}, A.sp()), set = Object.assign({}, S.set);
    A.isBusy = true; runStart = Date.now(); emit("busy", true);
    A.engine().then(function (e) {
      return e.send("run", { p: p, set: set, fan: true, fitKeys: A.fitKeys(st) }, { timeout: e.info && e.info.hasFit ? 600000 : 20000 });
    }).then(function (m) {
      A.run = m; A.runP = p; A.runSet = set; A.runStratId = st.id; A.err = null;   // runStratId：这份结果是哪条规则跑出来的（手册里引用实测数字时要对得上）
      if (A.oos) A.oos.stale = A.oos.sig ? A.oos.sig !== A.runSig(st, p, set) : A.oos.stale || kind === "commit";
      emit("run", { kind: kind });
      if (kind === "commit") { emit("commit"); A.persist(); }
    }).catch(function (e) {
      if (e && e.cancelled) return;
      A.err = e || { message: "未知错误" }; A.run = null;
      emit("error", A.err);
    }).then(function () { emit("busy", false); pump(); });
  }
  /** 一次回测依赖的全部设定：哪条规则（连同代码）、它的参数、交易设定、哪个世界 */
  A.runSig = function (st, p, set) { return JSON.stringify([st.id, hash(st.code || ""), p, set, curWorldKey()]); };
  A.send = function (type, payload, opt) { return A.engine().then(function (e) { var pr = e.send(type, payload, opt); return pr; }); };

  /** 另起一个后台线程跑别的代码（对比、Claude 的试运行），用完即弃或缓存 */
  var side = {};
  A.sideEngine = function (code, keep) {
    var key = hash(code) + "/" + hash(worldCode()), wk = curWorldKey(), s = side[key];
    if (!s || s.e.dead) { s = side[key] = { e: new QLEngine.Engine(code, worldCode(), {}), wk: "", wp: null, used: 0 }; }
    s.used = Date.now();
    if (s.wk !== wk) { s.wk = wk; s.wp = s.e.send("world", { cfg: A.worldCfg(), ext: extFor() }, { timeout: 60000 }); s.wp.catch(function () { s.wk = ""; }); }
    var keys = Object.keys(side);
    if (keys.length > 5) { keys.sort(function (a, b) { return side[a].used - side[b].used; }); side[keys[0]].e.dispose(); delete side[keys[0]]; }
    return s.wp.then(function () { return s.e; });
  };
  /** 跑参数扫描用的后台线程：与主线程装同一份策略代码，但互不阻塞 */
  A.sweepEngine = function () { return A.sideEngine(A.strat().code + "\n/*sweep*/"); };
  A.dropSide = function (code) { var key = hash(code) + "/" + hash(worldCode()); if (side[key]) { side[key].e.dispose(); delete side[key]; } };
  /** 试编译 + 试运行一段策略代码，返回摘要或抛出错误 */
  A.tryStrategy = function (code, params, fitKeys) {
    return A.sideEngine(code).then(function (e) {
      return e.send("run", { p: params, set: Object.assign({}, S.set), fan: false, fitKeys: fitKeys || null }, { timeout: e.info && e.info.hasFit ? 600000 : 20000 });
    });
  };

  return A;
})();
