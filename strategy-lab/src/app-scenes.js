// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 应用主体（四）：场景对比。
 * 两种看法：一条规则放进各个场景里各跑一遍；一个场景里把各条规则各跑一遍。结果排成一张横向的条形表。
 * 条形表（A.barList）手册里也用：事先算好的对照表按行、按列取出来，就是同样的一组条。
 * 一次对比开始时，把要用到的东西（世界的设定、规则的代码和参数、交易设定）全部拍一张快照：
 * 中途你去改别的，这一次对比不受影响，改完之后表上会标明"这是上一次的结果"。 */
(function (A) {
  "use strict";
  var h = A.h, $ = A.$, clear = A.clear, S = A.state, QL = A.QL, F = A.F, P = A.P;
  function opt() { var o = S.copt.scenes; if (!o || typeof o !== "object") o = S.copt.scenes = {}; return o; }
  function fin(v) { return v != null && v === v && isFinite(v); }

  /* ================================================================== *
   *  条形表
   *  rows: [{name, full, tag, v, se, text, mark: up|down|flat|same, tip, cur, muted, go, goLabel, pending, cancelled, err}]
   *  o:    {caption}
   * ================================================================== */
  var GLYPH = { up: "▲", down: "▼", flat: "≈", same: "=" }, GTIP = { up: "显著好于基准", down: "显著差于基准", flat: "和基准没有显著差别", same: "就是基准，或者与基准逐条相同" };
  A.barList = function (rows, o) {
    o = o || {};
    var vals = [];
    rows.forEach(function (r) { if (fin(r.v)) vals.push(r.v); });
    var lo = 0, hi = 0, abs = vals.map(Math.abs).sort(function (a, b) { return a - b; });
    rows.forEach(function (r) { if (fin(r.v)) { var e = r.se > 0 && isFinite(r.se) ? 2 * r.se : 0; if (r.v - e < lo) lo = r.v - e; if (r.v + e > hi) hi = r.v + e; } });
    // 个别特别大的值会把其余的条都压成一根线：超过"第三四分位数的 4 倍"的部分截掉，条的末端画成断口
    var q3 = abs.length ? abs[Math.floor(0.75 * (abs.length - 1))] : 0, lim = abs.length >= 6 && q3 > 0 && abs[abs.length - 1] > 4 * q3 ? 4 * q3 : Infinity, anyClip = false;
    if (-lo > lim) lo = -lim; if (hi > lim) hi = lim;
    if (!(hi > lo)) { hi = 1; lo = 0; }
    var pad = (hi - lo) * 0.03; if (lo < 0) lo -= pad; if (hi > 0) hi += pad;
    var X = function (v) { return Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100)); }, x0 = X(0);
    var box = h("div", { class: "hb", role: "list" });
    if (o.caption) box.appendChild(h("div", { class: "hb-cap", text: o.caption }));
    rows.forEach(function (r) {
      var ok = fin(r.v), idle = r.pending || r.cancelled, track;
      if (r.err) track = h("div", { class: "hb-track hb-msg", text: r.err });   // 出错的原因直接写在条的位置上：触屏上没有悬停提示
      else {
        track = h("div", { class: "hb-track", "aria-hidden": "true" });
        if (lo < 0 && hi > 0) track.appendChild(h("i", { class: "hb-zero", style: { left: x0 + "%" } }));
        if (r.pending) track.appendChild(h("span", { class: "spin", style: { position: "absolute", left: "2px", top: "2px" } }));
        else if (ok && !r.cancelled) {
          var a = X(Math.min(0, r.v)), b = X(Math.max(0, r.v)), clip = r.v > hi || r.v < lo; if (clip) anyClip = true;
          track.appendChild(h("i", { class: "hb-bar" + (r.v < 0 ? " neg" : "") + (r.muted ? " muted" : "") + (clip ? " clip" : ""), style: { left: a + "%", width: Math.max(0.6, b - a) + "%" } }));
          if (r.se > 0 && isFinite(r.se) && !clip) { var e0 = X(r.v - 2 * r.se), e1 = X(r.v + 2 * r.se); track.appendChild(h("i", { class: "hb-err", style: { left: e0 + "%", width: Math.max(0.3, e1 - e0) + "%" } })); }
        }
      }
      var val = h("div", { class: "hb-val num" }, r.err ? h("span", { class: "note", text: "出错" }) : r.pending ? "…" : r.cancelled ? "—" : (r.text != null ? r.text : ok ? F(r.v) : "—"),
        r.mark && !idle && !r.err ? h("span", { class: "verdict " + (r.mark === "same" ? "flat" : r.mark), title: GTIP[r.mark], text: " " + GLYPH[r.mark] }) : null);
      var row = h("div", { class: "hb-row" + (r.cur ? " cur" : ""), role: "listitem", title: r.err ? r.err : r.cancelled ? "没有算到这一行" : r.tip || "" },
        h("div", { class: "hb-name" }, h("span", { class: "hb-n", text: r.name, title: r.full || r.name }), r.tag ? h("span", { class: "tag", text: r.tag }) : null),
        track, val,
        r.go ? h("button", { class: "iconbtn hb-go", type: "button", "aria-label": (r.goLabel || "切过去") + "：" + r.name, title: r.goLabel || "切过去", text: "→", onclick: function (ev) { ev.stopPropagation(); r.go(); } }) : h("span", { class: "hb-go" }));
      box.appendChild(row);
    });
    if (anyClip) box.appendChild(h("div", { class: "note hb-clipnote", text: "带斜纹的条被截短了：它比其余的大出好几倍，照比例画会把别的条压成一条线。数值照常写在右边。" }));
    return box;
  };
  /** 差值除以标准误 → 记号。标准误算不出来（比如只有一条路径）时不下判断 */
  A.zMark = function (d, se) {
    if (d == null || d !== d || se == null || se !== se) return "";
    if (d === 0 && !(se > 0)) return "same";
    var z = se > 0 ? d / se : d > 0 ? 99 : -99;
    return z > 2 ? "up" : z < -2 ? "down" : "flat";
  };

  /* ================================================================== *
   *  场景与规则的清单（每一项都带着当时的设定，不留到开跑时再去读）
   * ================================================================== */
  var PRICE_SCENES = ["iid", "gbm", "jump", "heston", "garch", "regime", "ar1", "fbm", "ou", "osc", "logistic", "lorenz", "boot"];
  function wname() { return S.world.type === "custom" && S.custom ? S.custom.name : A.wdef().short; }
  function sname(st) { return st.src ? st.name : st.name.replace(/（.*$/, ""); }   // 内置规则去掉括号里的补充说明；自己的规则原样显示
  function paramsOf(type) {   // 那个世界的参数：你调过就用你调的，没调过用默认值
    var p = QL.worldDefaults(type), mine = S.wparams[type] || {}; Object.keys(mine).forEach(function (k) { if (k in p) p[k] = mine[k]; }); return p;
  }
  function priceCfg(type) {
    if (type === S.world.type) return { cfg: A.worldCfg(), ext: A.extFor() };
    var d = QL.WORLDS[type], ds = d.needsData ? A.dataset() : null;
    return { cfg: { type: type, params: paramsOf(type), N: d.defaults.N, T: d.defaults.T, K: ds ? ds.K : d.defaults.K, seed: S.world.seed, S0: 100 }, ext: ds ? { series: ds.v } : null };
  }
  function gameCfg(type, params) {
    var d = QL.WORLDS[type], T = d.Tof(params);
    return { cfg: { type: type, params: params, N: Math.max(1, Math.min(S.world.N, Math.floor(QL.GAME_MAX_CELLS / T))), T: T, K: d.Kof ? d.Kof(params) : 1, seed: S.world.seed, S0: 100 }, ext: null };
  }
  function sameParams(a, b) { return A.wschema().every(function (q) { return (q.show && !q.show(a) && !q.show(b)) || a[q.key] === b[q.key]; }); }   // 两边都用不上的参数（被别的选项藏起来的）不比
  /** "这条规则 × 各个场景"的场景清单 */
  function sceneList() {
    var type = S.world.type, d = A.wdef(), L = [], m;
    if (d.game) {
      var cur = Object.assign({}, A.wp()), base = QL.worldDefaults(type), hit = false;
      (d.scenes || []).forEach(function (sc) {
        var p = Object.assign({}, base, sc.p), isCur = sameParams(p, cur); if (isCur) hit = true;
        m = gameCfg(type, p);
        L.push({ name: sc.name, cur: isCur, cfg: m.cfg, ext: m.ext, wparams: p, group: d.score(p).name, go: function () { S.wparams[type] = Object.assign({}, p); A.renderWorld(); A.renderStrat(); A.worldChanged(true); } });
      });
      if (!hit) { m = gameCfg(type, cur); L.unshift({ name: "你现在的设定", cur: true, cfg: m.cfg, ext: m.ext, wparams: cur, group: d.score(cur).name }); }
      return L;
    }
    if (d.bounds) return null;                                     // 下注游戏的仓位含义不同，不和价格世界混着比
    if (PRICE_SCENES.indexOf(type) < 0) { m = priceCfg(type); L.push({ name: wname() + (d.needsData && A.dataset() ? " · " + A.dataset().name : ""), cur: true, cfg: m.cfg, ext: m.ext }); }
    PRICE_SCENES.forEach(function (t) {
      var w = QL.WORLDS[t]; if (!w || (w.needsData && !A.dataset())) return;
      m = priceCfg(t);
      L.push({ name: w.short + (w.needsData ? " · " + A.dataset().name : ""), cur: t === type, cfg: m.cfg, ext: m.ext, go: t === type ? null : function () { A.setWorldType(t); } });
    });
    return L;
  }
  /** "这个场景 × 各条规则"里列哪些规则：当前的规则总在里面；玩法里只列这套玩法自己的和你写的；带训练的要勾上才列 */
  function listedRules(withFit) {
    var d = A.wdef();
    return A.stratsFor().filter(function (st) { return st.id === S.stratId || ((d.game ? !!st.game || !!st.src : true) && (withFit || !A.hasFit(st))); });
  }
  function ruleList(withFit) {
    var type = S.world.type, d = A.wdef(), bref = d.game ? d.refs(A.wp()).filter(function (r) { return r.bench; })[0] || null : null;
    var m = d.game ? gameCfg(type, Object.assign({}, A.wp())) : priceCfg(type);
    return listedRules(withFit).map(function (st) {
      var p = Object.assign({}, A.sp(st.id)), isBench;
      // 基准不只看是哪条规则，还要参数也和基准用的一样（"固定仓位 2 倍"不是基准"固定仓位 1 倍"）
      if (d.game) isBench = !!bref && !!bref.lib && !st.src && st.lib === bref.lib && Object.keys(bref.p || {}).every(function (k) { return p[k] === bref.p[k]; });
      else isBench = d.benchF !== 0 && st.id === "hold";
      return { name: sname(st), full: st.name, st: st, id: st.id, code: st.code, fitKeys: st.fitKeys || null, fit: A.hasFit(st), p: p, cfg: m.cfg, ext: m.ext, bench: isBench, go: function () { A.setStrat(st.id); } };
    });
  }
  /** 把规则的参数收回到某个场景允许的范围里（比如"先看多少人"不能超过那个场景的人数） */
  function clampFor(st, type, wparams, p) {
    var w = QL.WORLDS[type], out = Object.assign({}, p); if (!w.game || !w.ranges || !st.lib) return out;
    var R = w.ranges(wparams);
    (st.params || []).forEach(function (q) { var r = R[st.lib + "." + q.key]; if (r && typeof out[q.key] === "number") out[q.key] = Math.min(r[1], Math.max(r[0], out[q.key])); });
    return out;
  }

  /* ================================================================== *
   *  跑
   * ================================================================== */
  A.scn = { rows: null, busy: false, stopped: false, done: 0, total: 0, sig: "", token: 0, eng: null, mode: "" };
  function modeOf() { return opt().mode === "world" ? "world" : "rule"; }
  /** 结果依赖的全部东西。和上次开跑时不一样了，表上就标"上一次的结果" */
  function worldSig(mode) {
    var d = A.wdef();
    if (mode === "rule" && d.game) {
      var cur = A.wp(), base = QL.worldDefaults(S.world.type), hit = (d.scenes || []).some(function (sc) { return sameParams(Object.assign({}, base, sc.p), cur); });
      return JSON.stringify([S.world.type, S.world.N, S.world.seed, hit ? "preset" : cur]);
    }
    return A.worldKey();
  }
  function sig() {
    var o = opt(), mode = modeOf(), body;
    if (mode === "world") body = listedRules(!!o.fit).map(function (st) { return [st.id, A.hash(st.code || ""), A.sp(st.id)]; });   // 不含"当前选的是哪条"：换一条已经在表里的规则，表不必重算
    else body = [S.stratId, A.hash(A.strat().code || ""), A.spWant()];
    return JSON.stringify([mode, body, S.set, worldSig(mode), A.hash(A.worldCode())]);
  }
  function fresh() { return !!A.scn.rows && A.scn.sig === sig(); }
  function stop() {
    var sc = A.scn; sc.token++;
    if (sc.eng) { try { sc.eng.dispose(); } catch (e) {} sc.eng = null; }
    if (sc.busy && sc.rows) { sc.rows.forEach(function (r) { if (r.pending) { r.pending = false; r.cancelled = true; } }); sc.stopped = true; }   // 没算到的行不再转圈
    sc.busy = false;
  }
  function pairedOf(a, b) { if (!a || !b || a.length !== b.length) return null; var n = a.length, s = 0, s2 = 0; for (var i = 0; i < n; i++) { var d = a[i] - b[i]; s += d; s2 += d * d; } return { d: s / n, se: n > 1 ? Math.sqrt(Math.max(0, (s2 - s * s / n) / (n - 1)) / n) : NaN }; }
  function runOne(e, job, set, part) {
    return e.send("world", { cfg: job.cfg, ext: job.ext }, { timeout: 90000 }).then(function () {
      return e.send("run", { p: job.p, set: set, fan: false, fitKeys: job.fitKeys, noRefs: true, part: part }, { timeout: job.fit ? 600000 : 60000 });
    }).then(function (m) { var out = { sum: m.sum, bench: m.benchSum, game: m.game || null, stepNs: m.stepNs, runMs: m.runMs, N: m.sum.N, T: m.sum.T }; if (m.game) out.pd = pairedOf(m.SC, m.benchSC); return out; });
  }
  function redraw() { A.rebuildControls("scenes"); A.refreshChart("scenes"); }
  A.runScenes = function () {
    var o = opt(), mode = modeOf(), sc = A.scn, type = S.world.type, d = A.wdef();
    stop();
    var token = sc.token, list = mode === "rule" ? sceneList() : ruleList(!!o.fit);
    if (!list || !list.length) { sc.rows = null; sc.stopped = false; redraw(); return; }
    // 快照：这一次对比从头到尾用的都是此刻的设定
    var st0 = A.strat(), p0 = mode === "rule" ? A.spWant() : Object.assign({}, A.sp()), set = JSON.parse(JSON.stringify(S.set)), wcode = A.worldCode(), fit0 = A.hasFit(st0);
    // 真实数据上，带训练的规则只能在训练段的后一部分回测；表里只要有一条这样的规则，其余的也都放到那一段上跑，才是同一批数据
    var needEval = mode === "world" && !!d.needsData && list.some(function (x) { return x.fit; });
    sc.rows = list.map(function (x) {
      var job = mode === "rule" ? { cfg: x.cfg, ext: x.ext, code: st0.code, fitKeys: st0.fitKeys || null, fit: fit0, p: clampFor(st0, type, x.wparams || x.cfg.params, p0) }
        : { cfg: x.cfg, ext: x.ext, code: x.code, fitKeys: x.fitKeys, fit: x.fit, p: x.p };
      return { item: x, job: job, res: null, err: null, pending: true, cancelled: false };
    });
    sc.busy = true; sc.stopped = false; sc.done = 0; sc.total = list.length; sc.sig = sig(); sc.mode = mode; sc.game = !!d.game; sc.type = type; sc.aligned = needEval;
    sc.who = mode === "rule" ? "「" + sname(st0) + "」在各个场景里" : "各条规则在「" + wname() + "」里";
    sc.benchName = d.benchF === 0 ? "不下注" : "买入持有"; sc.unit = A.unit();
    redraw();
    var chain = Promise.resolve(), eng = null;
    sc.rows.forEach(function (row) {
      chain = chain.then(function () {
        if (sc.token !== token) return;
        var e;
        if (mode === "rule") { if (!eng || eng.dead) { eng = new QLEngine.Engine(st0.code, wcode, {}); } e = eng; }   // 上一行超时会把线程停掉：换一个新的接着算
        else e = new QLEngine.Engine(row.job.code, wcode, {});
        sc.eng = e;
        return runOne(e, row.job, set, needEval ? "eval" : "").then(function (r) { if (sc.token === token) row.res = r; }, function (err) { if (sc.token === token) row.err = (err && err.message) || String(err); })
          .then(function () {
            if (mode === "world") { try { e.dispose(); } catch (x) {} }
            if (sc.token !== token) return;
            row.pending = false; sc.done++; var pg = $("scnProg"); if (pg) pg.value = sc.done / sc.total; A.refreshChart("scenes");
          });
      });
    });
    chain.catch(function (err) { console.error(err); }).then(function () {
      if (sc.token !== token) return;
      if (eng) { try { eng.dispose(); } catch (x) {} } sc.eng = null; sc.busy = false;
      sc.rows.forEach(function (r) { if (r.pending) { r.pending = false; r.cancelled = true; } });
      redraw();
    });
  };
  /** 从外面（手册、命令）指定看法：换了看法，旧的结果就不留了 */
  A.scenesSet = function (mode) { var o = opt(); mode = mode === "world" ? "world" : "rule"; if (o.mode !== mode || A.scn.mode !== mode) { stop(); A.scn.rows = null; A.scn.stopped = false; } o.mode = mode; };
  A.scenesStop = function (drop) { if (A.scn.busy) { stop(); if (drop) { A.scn.rows = null; A.scn.stopped = false; } } };

  /* ================================================================== *
   *  画
   * ================================================================== */
  var MP = [["dg", "比基准多赚"], ["g", "增长率"], ["sharpe", "夏普"], ["mean", "期望收益"], ["dd", "回撤"]];
  function metricOf(o, game) { var m = o.metric; if (game) return m === "d" ? "d" : "score"; return MP.some(function (x) { return x[0] === m; }) ? m : "dg"; }
  /** 一行结果在所选指标下的数、标准误、写法和记号 */
  function cellOf(res, metric) {
    if (!res) return {};
    if (res.game) {
      var G = res.game, pd = res.pd, mark = pd ? A.zMark(pd.d, pd.se) : "";
      if (metric === "d") return { v: pd ? pd.d : NaN, se: pd ? pd.se : NaN, text: pd ? A.gdiff(G, pd.d) : "—", mark: mark };
      return { v: G.lower ? -G.score : G.score, se: G.se, text: A.gfmt(G, G.score), mark: mark };
    }
    var s = res.sum, b = res.bench, ruin = s.growth === -Infinity, zg = A.zMark(s.dGrowth, s.dGrowthSE);
    if (metric === "g") return { v: ruin ? NaN : s.growth, se: s.growthSE, text: ruin ? "−∞（" + P(s.pRuin, s.pRuin < 0.01 ? 2 : 1) + " 破产）" : A.pctS(s.growth), mark: ruin ? "down" : zg };
    if (metric === "sharpe") return { v: s.sharpe, se: s.sharpeSE, text: F(s.sharpe, 2), mark: A.zMark(s.sharpe - b.sharpe, Math.hypot(s.sharpeSE || 0, b.sharpeSE || 0)) };
    if (metric === "mean") return { v: s.meanW - 1, se: s.meanWSE, text: A.pctS(s.meanW - 1), mark: A.zMark(s.dMeanW, s.dMeanWSE) };
    if (metric === "dd") return { v: s.ddMed, se: 0, text: P(s.ddMed, 1), mark: "" };
    return { v: ruin || b.growth === -Infinity ? NaN : s.dGrowth, se: s.dGrowthSE, text: ruin ? "有路径破产" : s.dGrowth === s.dGrowth ? A.pctS(s.dGrowth) : "—", mark: ruin ? "down" : zg };
  }
  /** 条形表上方的一句话：谁、在哪里、比的是什么。用的是开跑时记下的名字，不是你现在选着的 */
  function capText(sc, metric, G, groupName) {
    var what = metric === "score" ? (G && G.lower ? "成本（越低越好）" : "得分") + (groupName || (G && G.name) ? "：" + (groupName || G.name) + (G && G.unit ? "（" + G.unit + "）" : "") : "")
      : metric === "d" ? "比基准" + (G && G.lower ? "省了多少" : "高出多少") + "（" + (G && G.unit ? G.unit + "；" : "") + "同一批对局上的配对差）" + (groupName ? "，计分是" + groupName : "")
        : metric === "dg" ? "长期增长率比" + sc.benchName + "高出多少（每" + sc.unit + "，同一批路径上的配对差）" : metric === "g" ? "长期增长率（每" + sc.unit + "）" : metric === "sharpe" ? "夏普比率" : metric === "mean" ? "期望收益 E[W_T] − 1" : "最大回撤的中位数";
    return sc.who + "：" + what + "。细线是 ±2 个标准误。";
  }
  function blocked() { return modeOf() !== "world" && !A.isGame() && !!A.wdef().bounds; }
  A.CH.scenes = {
    name: "场景对比", wide: true, plain: true, about: "一条规则放进各个场景里各跑一遍，或者一个场景里把各条规则各跑一遍，排成一张条形表。", keys: "scenes 场景 对比 世界 规则 应用场景 横向 比较 适用",
    controls: function (o, re) {
      o = opt(); var sc = A.scn, game = A.isGame(), out = [];
      out.push(A.seg([["rule", "这条规则 × 各个场景"], ["world", "这个场景 × 各条规则"]], modeOf(), function (v) { A.scenesSet(v); A.persist(); A.rebuildControls("scenes"); re(); if (auto()) A.runScenes(); }));
      var metric = metricOf(o, game), items = game ? [["score", A.wdef().score(A.wp()).lower ? "成本" : "得分"], ["d", "比基准"]] : MP;
      var sel = h("select", { "aria-label": "指标", onchange: function () { o.metric = sel.value; A.persist(); re(); } }, items.map(function (x) { return h("option", { value: x[0], text: x[1], selected: x[0] === metric }); }));
      out.push(h("label", null, "看", sel));
      if (o.mode === "world") { var cb = h("input", { type: "checkbox", checked: !!o.fit }); cb.addEventListener("change", function () { o.fit = cb.checked; A.persist(); stop(); A.scn.rows = null; A.scn.stopped = false; A.rebuildControls("scenes"); re(); }); out.push(h("label", { title: "带训练的规则每条要先训练一遍，慢一些" }, cb, "包括要训练的规则")); }
      if (sc.busy) { out.push(h("progress", { id: "scnProg", max: 1, value: sc.total ? sc.done / sc.total : 0 })); out.push(h("button", { class: "btn small", type: "button", text: "停止", onclick: function () { stop(); A.rebuildControls("scenes"); re(); } })); }
      else out.push(h("button", { class: "btn small primary", type: "button", id: "btnScenes", disabled: blocked(), text: sc.rows ? "重新对比" : "开始对比", onclick: A.runScenes }));
      return out;
    },
    spec: function () {
      var o = opt(), sc = A.scn;
      if (blocked()) return "下注游戏里的仓位是每次押上的比例，和价格世界不是一回事，所以不放在一起比。换成\"这个场景 × 各条规则\"，或者换一个世界。";
      if (!sc.rows) return "点\"开始对比\"。" + (o.mode === "world" ? "当前世界里能用的各条规则，会按各自现在的参数在同一批" + (A.isGame() ? "对局" : "路径") + "上各跑一遍。" : A.isGame() ? "当前的规则和参数会原样拿到这套玩法的各个场景里各打一遍。" : "当前的规则和参数会原样拿到各个世界里各跑一遍。" + (A.hasFit() ? "这条规则带训练：每个世界都要重新训练一次，要等一会儿。" : ""));
      return null;
    },
    extra: function (host) {
      var o = opt(), sc = A.scn; if (!sc.rows || blocked()) return;
      var game = !!sc.game, metric = metricOf(o, game), mode = sc.mode, G0 = null;
      sc.rows.forEach(function (r) { if (!G0 && r.res && r.res.game) G0 = r.res.game; });
      var rows = sc.rows.map(function (r) {
        var it = r.item, c = cellOf(r.res, metric), tip = "", G = r.res && r.res.game;
        if (r.res) {
          if (G) tip = (G.lower ? "成本 " : "得分 ") + A.gfmt(G, G.score) + (G.se > 0 ? " ± " + A.gdiff(G, G.se).slice(1) : "") + (r.res.pd ? "；比基准 " + A.gdiff(G, r.res.pd.d) + (r.res.pd.se === r.res.pd.se ? " ± " + A.gdiff(G, r.res.pd.se).slice(1) : "") : "") + "；" + r.res.N + " 局";
          else { var s = r.res.sum; tip = "增长率 " + (s.growth === -Infinity ? "−∞" : A.pctS(s.growth) + (s.growthSE === s.growthSE ? " ± " + P(s.growthSE) : "")) + "；比基准 " + (s.dGrowth === s.dGrowth ? A.pctS(s.dGrowth) + (s.dGrowthSE === s.dGrowthSE ? " ± " + P(s.dGrowthSE) : s.N < 2 ? "（只有一条路径，没有标准误）" : "") : "—") + "；夏普 " + F(s.sharpe, 2) + "；回撤中位数 " + P(s.ddMed, 1) + "；" + s.N + A.n1(s.N, " 条 × ", " 条 × ") + s.T + " 步"; }
          tip += "；每步决策" + A.fmtStep(r.res.stepNs, r.res.runMs);
        }
        // "当前"跟着你现在的选择走：按规则比时看选的是哪条规则；玩法里按场景比时看左栏的设定现在等于哪个场景
        var isCur = mode === "world" ? it.id === S.stratId : game && it.wparams && sc.type === S.world.type ? sameParams(it.wparams, A.wp()) : !!it.cur;
        return { name: it.name, full: it.full || it.name, tag: isCur && it.bench ? "当前 · 基准" : isCur ? "当前" : it.bench ? "基准" : "", cur: isCur, muted: !!it.bench, v: c.v, se: c.se, text: c.text, mark: c.mark, tip: tip, pending: r.pending, cancelled: r.cancelled, err: r.err, group: it.group || "",
          go: (mode === "world" ? !isCur : true) && it.go ? function () { it.go(); } : null, goLabel: mode === "rule" ? "切到这个场景" : "选用这条规则" };
      });
      if (mode === "world" && !sc.busy) {   // 好的排前面；没算出来的垫底
        var asc = metric === "dd" || (metric === "score" && G0 && G0.lower);
        rows.sort(function (a, b) { var fa = fin(a.v), fb = fin(b.v); if (fa !== fb) return fa ? -1 : 1; if (!fa) return 0; return asc ? a.v - b.v : b.v - a.v; });
      }
      if (sc.stopped && !sc.busy) host.appendChild(h("div", { class: "note", style: { margin: "2px 0 6px" }, text: "已停止：" + sc.total + " 行里只算了 " + sc.done + " 行。" }));
      else if (!fresh() && !sc.busy) host.appendChild(h("div", { class: "note", style: { margin: "2px 0 6px" }, text: "世界、规则或参数变了，下面是上一次的结果。点\"重新对比\"。" }));
      // 玩法的各个场景可能按不同的办法计分（秘书问题：选中最好者的概率 / 名次得分）：计分不同的不画在一根轴上
      var groups = [], by = {};
      rows.forEach(function (r) { var k = game && mode === "rule" ? r.group : ""; if (!by[k]) { by[k] = []; groups.push(k); } by[k].push(r); });
      groups.forEach(function (k, i) {
        var Gk = null; sc.rows.forEach(function (r) { if (!Gk && r.res && r.res.game && (groups.length < 2 || r.item.group === k)) Gk = r.res.game; });
        var box = A.barList(by[k], { caption: capText(sc, metric, Gk || G0, groups.length > 1 ? k : "") });
        if (i > 0) box.style.marginTop = "12px";
        host.appendChild(box);
      });
    },
    foot: function () {
      var sc = A.scn; if (!sc.rows || blocked()) return "";
      var n = sc.rows.filter(function (r) { return !!r.res; }).length, s = "", noSE = sc.rows.some(function (r) { return r.res && !r.res.game && r.res.sum.N < 2; });
      if (sc.mode === "rule") s = "规则的参数没有按场景重新调过：在别处表现差，可能只是参数不合适。";
      else s = "各条规则用的是各自现在的参数（没调过的就是默认值），跑的是同一批" + (sc.game ? "对局" : "路径") + (sc.aligned ? "（表里有带训练的规则，所以全部改在训练段的后一部分上回测）" : "") + "，已经按成绩排好。";
      s += "▲▼ 表示和基准的配对差超过 2 个标准误" + (noSE ? "；只有一条路径时算不出标准误，不做标记" : "") + "。";
      if (n > 1) s += "一共比了 " + n + " 行，即使全无差别，最好的一行也会领先约 " + QL.expectedMaxNormal(n).toFixed(1) + " 个标准误。";
      return s;
    }
  };
  function auto() { var o = opt(); return !blocked() && !o.fit && !A.hasFit(); }
  /** 图刚打开、还没有结果时，轻的对比自己先跑起来 */
  A.scenesMaybeRun = function () { if (A.shown().indexOf("scenes") >= 0 && !A.scn.rows && !A.scn.busy && auto() && A.run) A.runScenes(); };
  A.on("commit", function () { if (A.shown().indexOf("scenes") < 0) return; if (!A.scn.rows) A.scenesMaybeRun(); else if (!A.scn.busy) redraw(); });
  A.on("world", function () { if (A.scn.rows && A.scn.type !== S.world.type) { stop(); A.scn.rows = null; A.scn.stopped = false; if (A.shown().indexOf("scenes") >= 0) redraw(); } });
})(App);
