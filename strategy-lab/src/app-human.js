// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 应用主体（六）：亲手玩一局。
 * 页面上别的地方都是让规则去打；这里是你自己逐回合做决定，打完之后同一局交给各条参照规则再打一遍，并排着比。
 * 逐回合推进、参照规则、长期平均都在 human.js 里；这个文件只管界面：弹层、每套玩法的局面和按钮、打完之后的对照、累计的成绩。
 * 成绩按"哪套玩法 + 哪组设定 + 哪个种子"分开记在这台设备的浏览器里（只有数字）。
 * 同一组设定下第 k 局永远是同一局，所以规则在你打过的那几局上的成绩随时可以重算，不用存。 */
(function (A) {
  "use strict";
  var h = A.h, clear = A.clear, S = A.state, QL = A.QL, F = A.F, P = A.P;
  if (typeof QL_HUMAN_INSTALL === "function" && !QL.humanDef) QL_HUMAN_INSTALL(QL);
  A.humanOk = function (type) { return !!(QL.humanDef && QL.humanDef(type || S.world.type)); };
  if (!QL.humanDef) return;

  /* ---------- 存档 ---------- */
  var KEY = "ql.human.v1", store = { v: 1, size: {}, rec: {} };
  function isNum(x) { return typeof x === "number" && x === x && isFinite(x); }
  try {
    var o0 = JSON.parse(localStorage.getItem(KEY) || "null");
    if (o0 && o0.v === 1) {
      if (o0.size && typeof o0.size === "object") Object.keys(o0.size).forEach(function (k) { if (typeof o0.size[k] === "string") store.size[k] = o0.size[k]; });
      if (o0.rec && typeof o0.rec === "object") Object.keys(o0.rec).forEach(function (k) {
        var r = o0.rec[k]; if (!r || !Array.isArray(r.me) || !r.me.every(isNum)) return;
        // me：打完的各局的得分；base：清零之前已经用掉了多少局（清零之后接着往下打没见过的局）；cur：打到一半的这一局已经交上去的动作
        store.rec[k] = { me: r.me.slice(0, 5000), base: isNum(r.base) && r.base >= 0 ? Math.floor(r.base) : 0, at: isNum(r.at) ? r.at : 0, cur: Array.isArray(r.cur) ? r.cur.map(function (a) { return isNum(a) ? a : NaN; }) : null };
      });
    }
  } catch (e) {}
  function save() {
    try {
      var ks = Object.keys(store.rec);
      if (ks.length > 30) { ks.sort(function (a, b) { return store.rec[a].at - store.rec[b].at; }); ks.slice(0, ks.length - 30).forEach(function (k) { delete store.rec[k]; }); }   // 只留最近用过的 30 组设定
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch (e) {}
  }

  /* ---------- 一组设定 = 一份记录 ---------- */
  var live = {};   // 这次打开页面期间：每组设定各自的参照规则、打到一半的局、刚打完的局
  function sess(type, hp, seed) {
    var key = "h" + QL.HUMAN_VER + "|" + type + "|" + seed + "|" + JSON.stringify(hp), s = live[key];
    if (!s) s = live[key] = { key: key, type: type, hp: hp, seed: seed, kit: QL.humanKit(type, hp, seed), B: null, k: 0, step: null, fin: null, finAt: 0, mark: null, mem: {}, refSC: {}, long: null, star: "" };
    return s;
  }
  function recOf(s) { return store.rec[s.key] || null; }
  function recMake(s) { var r = store.rec[s.key] || (store.rec[s.key] = { me: [], base: 0, at: 0, cur: null }); r.at = Date.now(); return r; }
  function played(s) { var r = recOf(s); return r ? r.me : []; }
  /** 开一局：接着存档里的局号往下；上次打到一半的，从断开的地方接着打 */
  function begin(s) {
    var r = recOf(s);
    s.k = r ? r.base + r.me.length : 0; s.B = QL.humanEpisode(s.type, s.hp, s.seed, s.k); s.fin = null; s.mark = null;
    var st; try { st = QL.humanStep(s.B, r && r.cur ? r.cur : []); } catch (e) { st = QL.humanStep(s.B, []); }
    if (st.done) finish(s, st); else s.step = st;
  }
  /** 把动作 a 交给眼下这一回合 */
  function advance(s, a) {
    var st = s.step, acts = st.acts.slice();
    while (acts.length < st.t) acts.push(NaN);
    acts[st.t] = a;
    var nx = QL.humanStep(s.B, acts);
    if (nx.done) finish(s, nx); else s.step = nx;
  }
  function finish(s, st) {
    var r = recMake(s), refs = QL.humanRefsOn(s.kit, s.B, true), sc = {};
    r.me.push(st.score); r.cur = null;
    if (r.me.length > 5000) { r.me.shift(); r.base++; }   // 只留最近的 5000 局；局号照旧往下数
    save();
    refs.forEach(function (x) { sc[x.id] = x.score; }); s.refSC[s.k] = sc;
    s.fin = { k: s.k, st: st, refs: refs, reveal: QL.humanDef(s.type).reveal(s.B) };
    s.step = null; s.finAt = Date.now();
  }
  /** 你打过的那几局上，各条参照规则的得分（同样的局、同样的顺序） */
  function cumul(s) {
    var r = recOf(s), me = r ? r.me : [], base = r ? r.base : 0, by = {}, i;
    s.kit.refs.forEach(function (x) { by[x.id] = []; });
    for (i = 0; i < me.length; i++) {
      var sc = s.refSC[base + i];
      if (!sc) { sc = s.refSC[base + i] = {}; QL.humanRefsOn(s.kit, QL.humanEpisode(s.type, s.hp, s.seed, base + i), false).forEach(function (x) { sc[x.id] = x.score; }); }
      s.kit.refs.forEach(function (x) { by[x.id].push(sc[x.id]); });
    }
    return { me: me, by: by };
  }
  /** 长期平均：在后台一条规则算一小段，不卡住界面（人打一局的工夫足够算完）。真等不及时 longNow 当场把剩下的算完 */
  function longStart(s) {
    if (s.long) return s.long;
    var L = s.long = { done: false, N: QL.humanLongN(s.kit), by: {}, cbs: [], B: null, i: 0, ids: s.kit.refs.map(function (r) { return r.id; }) };
    L.tick = function () {
      if (L.done) return;
      try { if (!L.B) L.B = QL.humanLongBatch(s.kit, L.N); else { L.by[L.ids[L.i]] = QL.humanLongRef(s.kit, L.B, L.ids[L.i]); L.i++; } } catch (e) { if (!L.B) L.i = L.ids.length; else L.i++; }
      if (L.i >= L.ids.length) { L.done = true; L.B = null; L.cbs.splice(0).forEach(function (f) { try { f(); } catch (e) {} }); }
    };
    (function loop() { setTimeout(function () { L.tick(); if (!L.done) loop(); }, 25); })();
    return L;
  }
  function longNow(s) { var L = longStart(s); while (!L.done) L.tick(); return L; }
  /** 打完之后先和哪一条参照规则比：玩法事先指定的那条；没有指定的，挑长期平均最高的 */
  function starOf(s) { return s.star || (s.star = s.kit.star || QL.humanStar(s.kit, longNow(s).by) || ""); }

  /* ---------- 写法 ---------- */
  function usd(v) { return A.gfmt({ kind: "usd", digits: Math.abs(v - Math.round(v)) < 1e-9 ? 0 : 2 }, v); }
  function usd2(v) { return A.gfmt({ kind: "usd", digits: 2 }, v); }
  function fix2(v) { return (Math.round(v * 100) / 100).toFixed(2); }
  function cents(v) { return Math.floor(v * 100 + 1e-9) / 100; }
  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
  function short(name) { return String(name).replace(/（.*$/, ""); }
  function optName(type, key, val) {
    var q = (QL.WORLDS[type].params || []).filter(function (x) { return x.key === key; })[0], o = q && q.options ? q.options.filter(function (x) { return x[0] === val; })[0] : null;
    return o ? o[1] : String(val);
  }
  function actBtn(label, key, fn, primary, focus) {
    return h("button", { class: "btn hp-act" + (primary ? " primary" : "") + (focus ? " hp-focus" : ""), type: "button", onclick: fn }, label, key ? h("kbd", { text: key }) : null);
  }
  function barX(T) { var x0 = [], x1 = [], xs = [], i; for (i = 0; i < T; i++) { x0.push(i + 0.58); x1.push(i + 1.42); xs.push(i + 1); } return { x0: x0, x1: x1, xs: xs }; }
  function blank(T) { var a = []; for (var i = 0; i < T; i++) a.push(NaN); return a; }
  function noTick() { return ""; }
  /** 横轴上"第几回合"的刻度：只落在整数上 */
  function intTicks(T, from) { var st = 1, out = [], i; [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].some(function (v) { st = v; return T / v <= 12; }); for (i = from ? st : 0; i <= T; i += st) out.push(i); return out; }

  /* ---------- 每套玩法：局面、按钮、图、打完之后揭晓什么 ----------
   * c：{ hp, T, done, st, view, fin, star, starShort, starRun, mark, mem, act(a), run(first, more) }
   *   st 是 human.js 的 humanStep 返回的东西；打完之后 fin.reveal 里才有裁判藏着的数据。 */
  var UI = {};

  /* ① 接单与冷却 */
  function lockStats(st, n) { var tot = 0, cnt = 0; for (var i = 0; i < n; i++) if (st.m[i] === 1) { tot += st.views[i].x; cnt++; } return { tot: tot, cnt: cnt }; }
  UI.g_lock = {
    sizeLabel: function (hp) { return hp.T + " 回合"; },
    setup: function (hp) { return [hp.T + " 回合", "接一单锁 " + (hp.L | 0) + " 回合", "报价：" + QL.lockTheory(hp).dist.label + "，均值是 1"]; },
    tiles: function (c) { var n = c.done ? c.T : c.st.t, q = lockStats(c.st, n); return [["回合", (c.done ? c.T : n + 1) + " / " + c.T], ["已经到手", F(q.tot, 2)], ["接了几单", String(q.cnt)]]; },
    board: function (c) {
      var t = c.st.t, T = c.T, L = c.hp.L | 0;
      var sub = t === T - 1 ? "这是最后一回合。" : L <= 0 ? "" : t + 1 + L >= T ? "接下它，这一局剩下的回合都不能再接（还剩 " + (T - t - 1) + " 个）。" : L === 1 ? "接下它，下一回合不能再接。" : "接下它，第 " + (t + 2) + " 到第 " + (t + 1 + L) + " 回合不能再接。";
      return h("div", { class: "hp-board" },
        h("div", { class: "hp-q", text: "第 " + (t + 1) + " 回合的报价" }),
        h("div", { class: "hp-big num", text: F(c.view.x, 2) }),
        h("div", { class: "hp-sub", text: sub }),
        h("div", { class: "hp-acts" }, actBtn("接下", "1", function () { c.act(1); }, true), actBtn("放过", "0", function () { c.act(0); }, false, true)));
    },
    keys: function (c, key) { if (key === "1") { c.act(1); return true; } if (key === "0") { c.act(0); return true; } return false; },
    log: function (c) {
      if (!c.mark) return "";
      var st = c.st, n = c.done ? c.T : st.t, j = c.mark.to, x = F(st.views[j].x, 2), missed = [], i;
      if (st.m[j] !== 1) return "第 " + (j + 1) + " 回合：报价 " + x + "，你放过了。";
      for (i = j + 1; i < n; i++) missed.push(F(st.views[i].x, 2));
      return missed.length ? "第 " + (j + 1) + " 回合：你接下了 " + x + "。锁着的时候来过：" + missed.join("、") + "。" : "第 " + (j + 1) + " 回合：你接下了 " + x + "。";
    },
    chart: function (c) {
      var st = c.st, T = c.T, n = c.done ? T : st.t, bx = barX(T), seen = blank(T), mine = blank(T), now = blank(T), cx = [0], cy = [0], tot = 0, bands = [], run = -1, i;
      for (i = 0; i < n; i++) { var x = st.views[i].x, tk = st.m[i] === 1; if (tk) { mine[i] = x; tot += x; } else seen[i] = x; cx.push(i + 1); cy.push(tot); }
      if (!c.done) now[n] = c.view.x;
      for (i = 0; i <= n; i++) { var lk = i < n && st.m[i] === 2; if (lk && run < 0) run = i; if (!lk && run >= 0) { bands.push({ kind: "vband", x0: run + 0.5, x1: i + 0.5, color: "s4", alpha: 0.14 }); run = -1; } }
      var p1 = bands.concat([{ kind: "bars", x0: bx.x0, x1: bx.x1, y: seen, color: "neutral", name: "报价" }, { kind: "bars", x0: bx.x0, x1: bx.x1, y: mine, color: "s1", name: "你接下的" }, { kind: "bars", x0: bx.x0, x1: bx.x1, y: now, color: "s1", alpha: 0.4, name: "眼下这一个" }]);
      var legend = [{ name: "报价", color: "neutral", mark: "rect" }, { name: "你接下的", color: "s1", mark: "rect" }, { name: "锁着的回合", color: "s4", mark: "band" }];
      var p2 = [{ kind: "step", x: cx, y: cy, color: "s1", name: "你", end: c.done ? "你" : null }], sr = c.starRun, rv = c.done ? c.fin.reveal : null;
      if (sr && sr.m) {
        var sx = [], sy = [], wx = [];
        for (i = 0; i < T; i++) if (sr.m[i] === 1) { sx.push(i + 1); sy.push(rv.x[i]); }
        for (i = 0; i <= T; i++) wx.push(i);
        p1.push({ kind: "points", x: sx, y: sy, color: "s2", r: 3.5, name: c.starShort + "接下的" }); legend.push({ name: c.starShort + "接下的", color: "s2", mark: "dot" });
        p2.unshift({ kind: "step", x: wx, y: sr.w, color: "s2", name: c.starShort, end: c.starShort });
      }
      return {
        height: 300, x: { label: "回合", domain: [0, T + 0.5], ticks: intTicks(T) }, legend: legend,
        panels: [{ weight: 1.25, y: { label: "报价", zero: true }, layers: p1 }, { weight: 0.8, y: { label: "累计收益", zero: true }, layers: p2 }],
        hover: { xs: bx.xs, bars: true, tip: function (k) {
          if (k > n || (k === n && c.done)) return null;
          var rows = [{ name: "报价", color: "neutral", mark: "rect", value: F(k < n ? st.views[k].x : c.view.x, 2) }];
          if (k < n) { rows.push({ name: st.m[k] === 1 ? "你接下了" : st.m[k] === 2 ? "你被锁着" : "你放过了", color: "s1", mark: "rect", value: st.m[k] === 1 ? "✓" : "—" }); rows.push({ name: "到这里的累计收益", color: "s1", value: F(cy[k + 1], 2) }); }
          if (sr && sr.m) rows.push({ name: c.starShort, color: "s2", mark: "dot", value: sr.m[k] === 1 ? "✓" : "—" });
          return { title: "第 " + (k + 1) + " 回合", rows: rows };
        } }
      };
    },
    hind: function (c) {
      var st = c.fin.st, rv = c.fin.reveal, q = lockStats(st, c.T), sr = c.starRun, out = [], i;
      out.push("你接了 " + q.cnt + " 单，一共 " + F(q.tot, 2) + "。提前知道全部报价的话，最多能拿 " + F(rv.prophetTotal, 2) + "（接 " + rv.prophet.length + " 单）。");
      if (sr && sr.m) { var n2 = 0, t2 = 0; for (i = 0; i < c.T; i++) if (sr.m[i] === 1) { n2++; t2 += rv.x[i]; } out.push("「" + c.star.name + "」接了 " + n2 + " 单，一共 " + F(t2, 2) + "。"); }
      return out;
    }
  };

  /* ② 秘书问题 */
  UI.g_sec = {
    sizeLabel: function (hp) { return hp.n + " 人"; },
    setup: function (hp) { return [hp.n + " 位候选人，只能选一位", "目标：" + optName("g_sec", "goal", hp.goal), "你看得到：" + optName("g_sec", "info", hp.info)]; },
    tiles: function (c) {
      if (c.done) { var pick = c.st.m.indexOf(1); return [["你选的是", "第 " + (pick + 1) + " 位"], ["他在全场的名次", c.fin.reveal.abs[pick] + " / " + c.T]]; }
      return [["候选人", (c.st.t + 1) + " / " + c.T], ["身后还有几位", String(c.view.left)]];
    },
    board: function (c) {
      var v = c.view, t = c.st.t, full = c.hp.info === "full";
      return h("div", { class: "hp-board" },
        h("div", { class: "hp-q", text: "第 " + (t + 1) + " 位候选人（共 " + c.T + " 位）" }),
        h("div", { class: "hp-big" }, h("span", { class: "num", text: "第 " + v.rank + " 名" }), v.rank === 1 && t > 0 ? h("span", { class: "hp-badge", text: "目前最好" }) : null),
        h("div", { class: "hp-sub", text: t === 0 ? "他是第一个到场的，还没有人可以比。" : "这是他在已经见过的 " + (t + 1) + " 个人里的名次；第 1 名是目前最好的。" }),
        full ? h("div", { class: "hp-sub" }, "他的分数 ", h("b", { class: "num", text: F(v.x, 3) }), "（分数互相独立，服从 0 到 1 之间的均匀分布）") : null,
        h("div", { class: "hp-acts" },
          actBtn("就要这一位", "1", function () { c.act(1); }, true), actBtn("放过", "0", function () { c.act(0); }, false, true),
          actBtn("一直放过，直到出现目前最好的", "2", function () { UI.g_sec.skip(c); })));
    },
    /** 放过眼前这一位，之后凡不是"目前最好"的也都放过 */
    skip: function (c) { c.run(0, function (st) { return st.view.rank === 1 ? null : 0; }); },
    keys: function (c, key) { if (key === "1") { c.act(1); return true; } if (key === "0") { c.act(0); return true; } if (key === "2") { UI.g_sec.skip(c); return true; } return false; },
    log: function (c) {
      if (!c.mark || c.done) return "";
      var a = c.mark.from, b = c.mark.to;
      return a === b ? "第 " + (a + 1) + " 位排第 " + c.st.views[a].rank + "，你放过了。" : "你放过了第 " + (a + 1) + " 到第 " + (b + 1) + " 位。";
    },
    chart: function (c) {
      var st = c.st, T = c.T, full = c.hp.info === "full", bx = barX(T), hgt = blank(T), i, layers, legend, rv = c.done ? c.fin.reveal : null, pick = c.done ? st.m.indexOf(1) : -1, m = c.done ? T : st.t + 1;
      if (rv) for (i = 0; i < T; i++) hgt[i] = full ? rv.x[i] : (T - rv.abs[i] + 1) / T;
      else if (full) for (i = 0; i < m; i++) hgt[i] = st.views[i].x;
      else { var order = []; for (i = 0; i < m; i++) order.splice(st.views[i].rank - 1, 0, i); for (i = 0; i < m; i++) hgt[order[i]] = (m - i) / m; }   // 到场时的相对名次足以排出见过的人之间的先后
      function only(f) { return hgt.map(function (v, k) { return f(k) ? v : NaN; }); }
      if (!c.done) {
        layers = [{ kind: "bars", x0: bx.x0, x1: bx.x1, y: only(function (k) { return k < st.t; }), color: "neutral", name: "你放过的" }, { kind: "bars", x0: bx.x0, x1: bx.x1, y: only(function (k) { return k === st.t; }), color: "s1", name: "眼前这一位" }];
        legend = [{ name: "你放过的", color: "neutral", mark: "rect" }, { name: "眼前这一位", color: "s1", mark: "rect" }];
      } else {
        layers = [{ kind: "bars", x0: bx.x0, x1: bx.x1, y: only(function (k) { return k < pick && k !== rv.best; }), color: "neutral", name: "你放过的" },
          { kind: "bars", x0: bx.x0, x1: bx.x1, y: only(function (k) { return k > pick && k !== rv.best; }), color: "neutral", alpha: 0.4, name: "你选定之后才到场的" },
          { kind: "bars", x0: bx.x0, x1: bx.x1, y: only(function (k) { return k === rv.best && k !== pick; }), color: "s3", name: "全场最好的" },
          { kind: "bars", x0: bx.x0, x1: bx.x1, y: only(function (k) { return k === pick; }), color: "s1", name: "你选的" }];
        legend = [{ name: "你选的", color: "s1", mark: "rect" }];
        if (rv.best !== pick) legend.push({ name: "全场最好的", color: "s3", mark: "rect" });
        if (pick > 0) legend.push({ name: "你放过的", color: "neutral", mark: "rect" });
        if (pick < T - 1) legend.push({ name: "你选定之后才到场的", color: "neutral", mark: "band" });
        var sp = c.starRun && c.starRun.m ? c.starRun.m.indexOf(1) : -1;
        if (sp >= 0) { layers.push({ kind: "points", x: [sp + 1], y: [hgt[sp]], color: "s2", r: 4.5, name: c.starShort + "选的" }); legend.push({ name: c.starShort + "选的", color: "s2", mark: "dot" }); }
      }
      return {
        height: 230, x: { label: "到场的次序", domain: [0.5, T + 0.5], ticks: intTicks(T, 1) }, legend: legend,
        panels: [{ y: full ? { label: "分数", domain: [0, 1.06] } : { label: c.done ? "在全场排得多靠前（越高越好）" : "在见过的人里排得多靠前（越高越好）", domain: [0, 1.1], fmt: noTick }, layers: layers }],
        hover: { xs: bx.xs, bars: true, tip: function (k) {
          if (k >= m) return null;
          var rows = [];
          if (rv) rows.push({ name: "全场名次", value: String(rv.abs[k]) });
          rows.push({ name: "到场时在见过的人里的名次", value: String(rv ? rv.rel[k] : st.views[k].rank) });
          if (full) rows.push({ name: "分数", value: F(rv ? rv.x[k] : st.views[k].x, 3) });
          return { title: "第 " + (k + 1) + " 位", rows: rows };
        } }
      };
    },
    hind: function (c) {
      var st = c.fin.st, rv = c.fin.reveal, T = c.T, pick = st.m.indexOf(1), ar = rv.abs[pick], out = [], sp = c.starRun && c.starRun.m ? c.starRun.m.indexOf(1) : -1;
      if (c.hp.goal === "rank") out.push("你选了第 " + (pick + 1) + " 位，他在全场 " + T + " 个人里排第 " + ar + "。");
      else if (ar === 1) out.push("你选中了全场最好的那一位（第 " + (pick + 1) + " 位）。");
      else if (rv.best < pick) out.push("你选了第 " + (pick + 1) + " 位，他在全场排第 " + ar + "。全场最好的是第 " + (rv.best + 1) + " 位，在那之前你已经把他放过了。");
      else out.push("你选了第 " + (pick + 1) + " 位，他在全场排第 " + ar + "。全场最好的是第 " + (rv.best + 1) + " 位，你选定之后他才到场。");
      if (pick === T - 1) out.push("你一路放过，走到了最后一位，只能要他。");
      if (sp >= 0) out.push("「" + c.star.name + "」选的是第 " + (sp + 1) + " 位，全场第 " + rv.abs[sp] + " 名。");
      return out;
    }
  };

  /* ③ 偏硬币下注 */
  UI.g_coin = {
    sizeLabel: function (hp) { return hp.T + " 次"; },
    setup: function (hp) { return ["正面的概率 " + P(+hp.p, 0), "本金 " + usd(+hp.start), "一共押 " + hp.T + " 次", +hp.cap > 0 ? "最多带走 " + usd(+hp.cap) : "不封顶", "押中赢得同样多的钱，押错输掉赌注"]; },
    tiles: function (c) {
      var cap = +c.hp.cap, out = [["资金", usd2(c.done ? c.st.score : c.view.wealth)], ["还剩几次", String(c.done ? 0 : c.T - c.st.t)]];
      if (cap > 0) out.push(["封顶", usd(cap)]);
      return out;
    },
    board: function (c) {
      var hd = QL.humanDef("g_coin"), W = c.view.wealth, t = c.st.t, mem = c.mem;
      if (!mem.mode) { mem.mode = "frac"; mem.f = 0.1; mem.amt = 0; }
      // 默认的注码：上一次是点的"百分之几"，这一次照同样的比例；上一次是自己填的金额，这一次还是那个金额
      var def = mem.mode === "all" ? W : mem.mode === "frac" ? cents(W * mem.f) : Math.min(mem.amt, W);
      var inp = h("input", { type: "number", id: "hpStake", class: "hp-stake hp-focus", min: 0, max: fix2(W), step: 0.01, value: fix2(def), inputmode: "decimal", "aria-label": "押多少美元" });
      var pct = h("span", { class: "hp-pct" });
      function cur() { var x = parseFloat(inp.value); return x === x && x > 0 ? Math.min(x, W) : 0; }
      function showPct() { pct.textContent = "= 资金的 " + P(cur() / W, 1); }
      function chip(label, f) {
        return h("button", { class: "chip", type: "button", text: label, onclick: function () { mem.mode = f >= 1 ? "all" : "frac"; mem.f = f; inp.value = fix2(f >= 1 ? W : cents(W * f)); showPct(); inp.focus(); inp.select(); } });
      }
      function bet(side) {
        var x = cur();
        if (side !== 0 && !(x > 0)) { pct.textContent = "先填一个大于 0 的数，或者点\"这次不押\"。"; inp.focus(); return; }
        if (mem.mode === "amt") mem.amt = x;
        c.act(side === 0 ? 0 : mem.mode === "all" ? side : hd.frac(W, x, side));
      }
      inp.addEventListener("input", function () { mem.mode = "amt"; showPct(); });
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) bet(1); } });
      showPct();
      return h("div", { class: "hp-board" },
        h("div", { class: "hp-q", text: "第 " + (t + 1) + " 次，押多少？" }),
        h("div", { class: "hp-bet" }, h("span", { class: "hp-cur", text: "$" }), inp, pct),
        h("div", { class: "hp-chips" }, chip("5%", 0.05), chip("10%", 0.1), chip("20%", 0.2), chip("50%", 0.5), chip("全押", 1)),
        h("div", { class: "hp-acts" }, actBtn("押正面", "↵", function () { bet(1); }, true), actBtn("押反面", "", function () { bet(-1); }), actBtn("这次不押", "", function () { bet(0); })),
        h("div", { class: "hp-sub", text: "不押的那一次硬币照样抛，机会也照样少一次。" }));
    },
    log: function (c) {
      if (!c.mark) return "";
      var st = c.st, j = c.mark.to, Wb = st.views[j].wealth, Wa = c.done ? st.score : c.view.wealth, r = c.done ? c.fin.reveal.flips[j] : c.view.prev, pnl = Wa - Wb, side = r > 0 ? "正面" : "反面";
      var stake = c.done ? Math.min(1, Math.abs(st.acts[j])) * Wb : Math.abs(c.view.last);   // 打完那一下没有"下一回合"可看：用交上去的比例乘回去（st.acts 是原数；裁判明细里的 st.a 是单精度的，乘回去会差一丝）
      if (!(stake >= 0.01)) return "第 " + (j + 1) + " 次出了" + side + "。这一次你没有押。";
      return pnl > 0 ? "第 " + (j + 1) + " 次出了" + side + "：你押的 " + usd2(stake) + " 押中了，资金变成 " + usd2(Wa) + "。" : "第 " + (j + 1) + " 次出了" + side + "：你押的 " + usd2(stake) + " 没押中，资金变成 " + usd2(Wa) + "。";
    },
    chart: function (c) {
      var st = c.st, T = c.T, cap = +c.hp.cap, J = st.views.length, bx = barX(T), wx = [], wy = [], win = blank(T), lose = blank(T), none = blank(T), i, rv = c.done ? c.fin.reveal : null, nres = c.done ? T : st.t;
      for (i = 0; i < J; i++) { wx.push(i); wy.push(st.views[i].wealth); }            // views[i].wealth：第 i 次下注之前的资金
      if (c.done) { wx.push(J); wy.push(st.score); if (J < T) { wx.push(T); wy.push(st.score); } }
      for (i = 0; i < nres; i++) {
        var r = rv ? rv.flips[i] : st.views[i + 1].prev, pnl = i + 1 < J ? st.views[i + 1].last : i === J - 1 && c.done ? st.score - st.views[i].wealth : 0, bet0 = i < J && Math.abs(c.done && i === J - 1 ? Math.min(1, Math.abs(st.acts[i])) * st.views[i].wealth : pnl) >= 0.01;
        (bet0 ? (pnl > 0 ? win : lose) : none)[i] = r > 0 ? 1 : -1;
      }
      var p1 = [], legend = [{ name: "你的资金", color: "s1" }], sr = c.starRun;
      if (cap > 0) { p1.push({ kind: "hline", y: cap, color: "axis", dash: [4, 3] }); legend.push({ name: "封顶 " + usd(cap), color: "axis", mark: "dash" }); }
      if (sr && sr.w) { var sx = []; for (i = 0; i <= T; i++) sx.push(i); p1.push({ kind: "line", x: sx, y: sr.w, color: "s2", name: c.starShort, end: c.starShort }); legend.push({ name: c.starShort, color: "s2" }); }
      p1.push({ kind: "line", x: wx, y: wy, color: "s1", name: "你的资金", end: c.done ? "你" : null });
      legend.push({ name: "押中", color: "s1", mark: "rect" }, { name: "没押中", color: "ink2", mark: "rect" }, { name: "没押", color: "neutral", mark: "rect" });
      return {
        height: 300, x: { label: "第几次", domain: [0, T + 0.5], ticks: intTicks(T) }, legend: legend,
        panels: [{ weight: 1.5, y: { label: "资金（美元）", zero: true }, layers: p1 },
          { weight: 0.5, y: { label: "硬币：朝上是正面，朝下是反面", domain: [-1.5, 1.5], fmt: noTick }, layers: [{ kind: "bars", x0: bx.x0, x1: bx.x1, y: none, color: "neutral", name: "没押" }, { kind: "bars", x0: bx.x0, x1: bx.x1, y: lose, color: "ink2", name: "没押中" }, { kind: "bars", x0: bx.x0, x1: bx.x1, y: win, color: "s1", name: "押中" }] }],
        hover: { xs: bx.xs, bars: true, tip: function (k) {
          if (k >= nres) return null;
          var up = (win[k] || lose[k] || none[k]) > 0, after = k + 1 < J ? st.views[k + 1].wealth : c.done ? st.score : NaN;
          var rows = [{ name: up ? "正面" : "反面", value: win[k] === win[k] ? "押中" : lose[k] === lose[k] ? "没押中" : "没押" }];
          if (after === after) rows.push({ name: "这一次之后你的资金", color: "s1", value: usd2(after) });
          if (sr && sr.w) rows.push({ name: c.starShort, color: "s2", value: usd2(sr.w[k + 1]) });
          return { title: "第 " + (k + 1) + " 次", rows: rows };
        } }
      };
    },
    hind: function (c) {
      var st = c.fin.st, rv = c.fin.reveal, T = c.T, J = st.views.length, cap = +c.hp.cap, W = st.score, out = [];
      out.push("这一局的 " + T + " 次里，正面出了 " + rv.heads + " 次。");
      if (W <= 0) out.push("你在第 " + J + " 次输光了。");
      else if (cap > 0 && W >= cap) out.push("你在第 " + J + " 次封顶，带走 " + usd2(W) + "。");
      else out.push("你押完了全部 " + T + " 次，带走 " + usd2(W) + "。");
      if (c.starRun) out.push("「" + c.star.name + "」带走 " + usd2(c.starRun.score) + "。");
      return out;
    }
  };

  /* ⑤ 多臂老虎机 */
  UI.g_bandit = {
    sizeLabel: function (hp) { return hp.T + " 回合"; },
    setup: function (hp) {
      var a = [(hp.arms | 0) + " 台机器", "一共拉 " + hp.T + " 次，中了得 1 分", "各台的中奖率：" + optName("g_bandit", "prior", hp.prior)];
      if ((hp.D | 0) > 0) a.push("拉过的机器锁 " + (hp.D | 0) + " 回合");
      return a;
    },
    tiles: function (c) { var n = c.done ? c.T : c.st.t, tot = c.st.w[n]; return [["回合", (c.done ? c.T : n + 1) + " / " + c.T], ["得分", String(tot)], ["平均每回合", n ? F(tot / n, 3) : "—"]]; },
    board: function (c) {
      var v = c.view, K = v.pulls.length, t = c.st.t, grid = h("div", { class: "hp-arms" }), foc = -1, k0;
      // 焦点留在刚拉过的那一台上（连着按回车就是接着拉它）；它被锁住了，或者这是第一回合，就给第一台能拉的
      if (t > 0 && v.lastA >= 0 && v.lastA < K && !(v.lock[v.lastA] > 0)) foc = v.lastA;
      for (k0 = 0; foc < 0 && k0 < K; k0++) if (!(v.lock[k0] > 0)) foc = k0;
      for (var k = 0; k < K; k++) (function (k) {
        var n = v.pulls[k], w = v.wins[k], lk = v.lock[k] > 0, here = t > 0 && v.lastA === k && c.st.m[t - 1] !== 2;
        grid.appendChild(h("button", { class: "hp-arm" + (here ? (v.last > 0 ? " hit" : " miss") : "") + (k === foc ? " hp-focus" : ""), type: "button", disabled: lk, "data-k": k, onclick: function () { c.act(k); } },
          h("span", { class: "hp-arm-n" }, "第 " + (k + 1) + " 台", K <= 9 ? h("kbd", { text: String(k + 1) }) : null),
          h("span", { class: "hp-arm-r num", text: n ? P(w / n, 0) : "—" }),
          h("span", { class: "hp-arm-bar" }, h("i", { style: { width: (n ? 100 * w / n : 0) + "%" } })),
          h("span", { class: "hp-arm-s", text: lk ? "锁着，还要等 " + v.lock[k] + " 回合" : "拉了 " + n + " 次，中了 " + w + " 次" }),
          h("span", { class: "hp-arm-f", text: here ? (v.last > 0 ? "✓ 刚才中了" : "✗ 刚才没中") : "\u00a0" })));
      })(k);
      return h("div", { class: "hp-board" }, h("div", { class: "hp-q", text: "第 " + (t + 1) + " 回合，拉哪一台？" }), grid);
    },
    keys: function (c, key) {
      var k = "123456789".indexOf(key), v = c.view;
      if (key.length !== 1 || k < 0 || k >= v.pulls.length || v.pulls.length > 9 || v.lock[k] > 0) return false;
      c.act(k); return true;
    },
    log: function (c) {
      if (!c.mark) return "";
      var st = c.st, j = c.mark.to, arm = st.a[j] + 1;
      if (st.m[j] === 2) return "第 " + (j + 1) + " 回合：每一台都锁着，这一回合作废。";
      return st.w[j + 1] > st.w[j] ? "第 " + (j + 1) + " 回合：拉了第 " + arm + " 台，中了。" : "第 " + (j + 1) + " 回合：拉了第 " + arm + " 台，没中。";
    },
    chart: function (c) {
      var st = c.st, T = c.T, n = c.done ? T : st.t, K = c.hp.arms | 0, hx = [], hy = [], mx = [], my = [], cx = [0], cy = [0], bands = [], xs = [], i, rv = c.done ? c.fin.reveal : null, sr = c.starRun;
      for (i = 0; i < T; i++) xs.push(i + 1);
      for (i = 0; i < n; i++) {
        if (st.m[i] === 2) bands.push({ kind: "vband", x0: i + 0.5, x1: i + 1.5, color: "s4", alpha: 0.14 });
        else if (st.w[i + 1] > st.w[i]) { hx.push(i + 1); hy.push(st.a[i] + 1); } else { mx.push(i + 1); my.push(st.a[i] + 1); }
        cx.push(i + 1); cy.push(st.w[i + 1]);
      }
      var p1 = bands.slice(), legend = [{ name: "中了", color: "s1", mark: "dot" }, { name: "没中", color: "neutral", mark: "dot" }];
      if (rv) { p1.push({ kind: "hline", y: rv.best + 1, color: "s3", dash: [4, 3] }); legend.push({ name: "最好的一台", color: "s3", mark: "dash" }); }
      p1.push({ kind: "points", x: mx, y: my, color: "neutral", r: 3, ring: false, name: "没中" }, { kind: "points", x: hx, y: hy, color: "s1", r: 3.5, ring: false, name: "中了" });
      var p2 = [{ kind: "step", x: cx, y: cy, color: "s1", name: "你", end: c.done ? "你" : null }];
      if (sr && sr.w) { var wx = []; for (i = 0; i <= T; i++) wx.push(i); p2.unshift({ kind: "step", x: wx, y: sr.w, color: "s2", name: c.starShort, end: c.starShort }); legend.push({ name: "你的累计得分", color: "s1" }, { name: c.starShort, color: "s2" }); }
      return {
        height: 300, x: { label: "回合", domain: [0, T + 0.5], ticks: intTicks(T) }, legend: legend,
        panels: [{ weight: 1, y: { label: "拉的是第几台", domain: [0.4, K + 0.6] }, layers: p1 }, { weight: 0.9, y: { label: "累计得分", zero: true }, layers: p2 }],
        hover: { xs: xs, dots: function (k) { return k < n ? [{ y: cy[k + 1], color: "s1", panel: 1 }] : []; }, tip: function (k) {
          if (k >= n) return null;
          var rows = [st.m[k] === 2 ? { name: "这一回合作废", value: "—" } : { name: st.w[k + 1] > st.w[k] ? "中了" : "没中", color: st.w[k + 1] > st.w[k] ? "s1" : "neutral", mark: "dot", value: "第 " + (st.a[k] + 1) + " 台" }];
          rows.push({ name: "到这里的累计得分", color: "s1", value: String(cy[k + 1]) });
          if (sr && sr.w) rows.push({ name: c.starShort, color: "s2", value: String(sr.w[k + 1]) });
          return { title: "第 " + (k + 1) + " 回合", rows: rows };
        } }
      };
    },
    hind: function (c) {
      var st = c.fin.st, rv = c.fin.reveal, T = c.T, K = rv.mu.length, pulls = zeros(K), wins = zeros(K), sr = c.starRun, i, k, out = [];
      for (i = 0; i < T; i++) { if (st.m[i] === 2) continue; k = st.a[i]; pulls[k]++; if (st.w[i + 1] > st.w[i]) wins[k]++; }
      out.push("最好的是第 " + (rv.best + 1) + " 台，真实的中奖率 " + P(rv.mu[rv.best], 0) + "。你拉了它 " + pulls[rv.best] + " 次，占全部回合的 " + P(pulls[rv.best] / T, 0) + "。");
      if (sr && sr.a) { var n2 = 0; for (i = 0; i < T; i++) if (sr.m[i] !== 2 && sr.a[i] === rv.best) n2++; out.push("「" + c.star.name + "」拉了它 " + n2 + " 次。"); }
      var tb = h("tbody");
      for (k = 0; k < K; k++) tb.appendChild(h("tr", { "data-arm": k }, h("td", { text: k === rv.best ? "第 " + (k + 1) + " 台（最好）" : "第 " + (k + 1) + " 台" }), h("td", { class: "num", text: P(rv.mu[k], 0) }), h("td", { class: "num", text: String(pulls[k]) }), h("td", { class: "num", text: pulls[k] ? P(wins[k] / pulls[k], 0) : "—" })));
      out.push(h("div", { class: "gref hp-reveal" }, h("table", { class: "gtab" }, h("caption", { text: "打完才揭晓：各台真实的中奖率" }), h("thead", null, h("tr", null, ["机器", "真实的中奖率", "你拉了几次", "你看到的中奖率"].map(function (x) { return h("th", { text: x }); }))), tb)));
      return out;
    }
  };

  /* ---------- 弹层 ---------- */
  A.openHuman = function () {
    var type = S.world.type, w = A.wdef();
    if (!A.humanOk(type)) { A.toast("这套玩法还不能亲手玩。现在可以的有：" + QL.humanGames().map(function (k) { return QL.WORLDS[k].short; }).join("、") + "。", 4600); return; }
    var ui = UI[type], seed = S.world.seed, sizes = QL.humanSizes(type, Object.assign({}, A.wp())), sizeId = store.size[type], s = null, chart = null, alive = true;
    if (!sizes.some(function (z) { return z.id === sizeId; })) sizeId = "m";
    var top = h("div", { class: "hp-top" }), setup = h("ul", { class: "hp-setup" }), tiles = h("div", { class: "hp-tiles" }), main = h("div", { class: "hp-main" }), logEl = h("div", { class: "hp-log", "aria-live": "polite" }),
      chartHost = h("div", { class: "hp-chart" }), after = h("div", { class: "hp-after" });
    var m = A.modal("亲手玩一局 · " + w.name, h("div", { class: "hp", "data-game": type }, top, setup, tiles, main, logEl, chartHost, after), { cls: "hpm", focus: ".hp-focus", onClose: function () { alive = false; if (chart) chart.destroy(); } });

    function G() { return s.kit.score; }
    function fm(v) { return A.gfmt(G(), v); }
    /** 一局的得分。"赢了算 1、没赢算 0"的那种得分，一局里只有这两个值：写成 ✓ / ✗ */
    function fm1(v) { var g = G(); if (g.kind === "prob" && (v === 0 || v === 1)) return v ? "✓" : "✗"; return fm(v); }
    function ctx() {
      var fin = s.fin, st = fin ? fin.st : s.step, sid = fin ? starOf(s) : "", sr = sid ? s.kit.refs.filter(function (r) { return r.id === sid; })[0] || null : null;
      return {
        hp: s.hp, T: s.kit.T, done: !!fin, fin: fin, st: st, view: fin ? null : st.view, mark: s.mark, mem: s.mem,
        star: sr, starShort: sr ? short(sr.name) : "", starRun: fin && sr ? fin.refs.filter(function (r) { return r.id === sr.id && !r.err; })[0] || null : null,
        act: function (a) { run(a, null); }, run: run
      };
    }
    /** 交上一个动作；more(step) 接着给出后面的动作，返回 null 就停（"一直放过，直到……"用的） */
    function run(first, more) {
      if (!s.step || s.fin) return;
      var from = s.step.t, to = from, a = first;
      for (var g = 0; g <= s.kit.T && a != null; g++) { to = s.step.t; advance(s, a); a = more && s.step ? more(s.step) : null; }
      s.mark = { from: from, to: to };
      if (!s.fin) { var r = recMake(s); r.cur = s.step.acts.slice(); save(); }
      render();
    }
    function setSize(id) {
      var z = sizes.filter(function (x) { return x.id === id; })[0] || sizes[0];
      sizeId = z.id; store.size[type] = z.id; save();
      s = sess(type, z.hp, seed);
      if (!s.step && !s.fin) begin(s);
      render();
      var mine = s, L = longStart(s);
      if (!L.done) L.cbs.push(function () { if (alive && s === mine && s.fin) renderAfter(); });
    }
    function next() {
      if (Date.now() - s.finAt < 600) return;   // 刚打完的一瞬间不接：连按回车下注的人，不会一头撞过这一局的结果
      s.fin = null; begin(s); render();
    }
    function wipe() {
      var r = recOf(s); if (!r) return;
      r.base += r.me.length; r.me = []; r.cur = null; r.at = Date.now(); save();
      s.fin = null; begin(s); render(); A.toast("这组设定下的记录清零了。接下来打的是没见过的新局。", 3600);
    }

    function renderTop() {
      clear(top);
      var seg = h("div", { class: "seg hp-sizes", role: "group", "aria-label": "一局打多长" }), me = played(s);
      sizes.forEach(function (z) {
        seg.appendChild(h("button", { type: "button", "data-size": z.id, "aria-pressed": z.id === sizeId ? "true" : "false", text: z.id === "same" ? "和左栏一样（" + ui.sizeLabel(z.hp) + "）" : ui.sizeLabel(z.hp), onclick: function () { if (z.id !== sizeId) setSize(z.id); } }));
      });
      top.appendChild(seg);
      top.appendChild(h("span", { class: "hp-ep", text: "第 " + (me.length + (s.fin ? 0 : 1)) + " 局" }));
      top.appendChild(h("span", { class: "sp" }));
      if (me.length) top.appendChild(h("span", { class: "hp-tally", text: "已经打完 " + me.length + A.n1(me.length, " 局，平均 ", " 局，平均 ") + fm(QL.humanMeanSe(me).m) }));
      if (A.openGuide) top.appendChild(A.helpBtn("game:" + type, "这套玩法的细则、来历和已知结论"));
    }
    function verdict(c) {
      var fin = s.fin, me = fin.st.score, g = G(), sr = c.starRun, d = sr ? me - sr.score : NaN, gap = null;
      if (sr) {
        if (g.kind === "prob" && (me === 0 || me === 1) && (sr.score === 0 || sr.score === 1)) gap = h("span", { class: "verdict " + (d > 0 ? "up" : d < 0 ? "down" : "flat"), text: d > 0 ? "▲ 你赢了，它没赢" : d < 0 ? "▼ 它赢了，你没赢" : me ? "= 都赢了" : "= 都没赢" });
        else { var ds = A.gdiff(g, d); gap = h("span", { class: "verdict " + (ds.charAt(0) === "+" ? "up" : ds.charAt(0) === "−" ? "down" : "flat"), text: ds.charAt(0) === "+" ? "▲ 这一局你高 " + ds.slice(1) : ds.charAt(0) === "−" ? "▼ 这一局你低 " + ds.slice(1) : "≈ 这一局几乎一样" }); }
      }
      var box = h("div", { class: "hp-board hp-verdict" },
        h("div", { class: "hp-q", text: "这一局打完了 · 计分：" + g.name }),
        h("div", { class: "hp-vs" },
          h("div", { class: "hp-side me" }, h("span", { class: "hp-lab", text: "你" }), h("b", { class: "hp-num num", id: "hpMe", text: fm1(me) })),
          sr ? h("div", { class: "hp-side" }, h("span", { class: "hp-lab", text: c.star.name + " · 同一局" }), h("b", { class: "hp-num num", id: "hpStar", text: fm1(sr.score) })) : null),
        gap ? h("div", { class: "hp-gap" }, gap) : null);
      if (sr) {
        var why = s.kit.starWhy === "opt" ? "先和「" + c.star.name + "」比：这组设定下，它是这几条参照规则里理论上最好的。"
          : s.kit.starWhy === "growth" ? "先和「" + c.star.name + "」比。不封顶时，期望到手最多的打法是每次全押，但那样几乎必然输光；Kelly 比例让资金的长期增长率最大。"
            : "先和「" + c.star.name + "」比：这组设定下，它是这几条参照规则里长期平均最高的。";
        box.appendChild(h("div", { class: "note hp-why", text: why }));
      }
      var hind = h("div", { class: "hp-hind" });
      ui.hind(c).forEach(function (x) { hind.appendChild(typeof x === "string" ? h("p", { text: x }) : x); });
      box.appendChild(hind);
      box.appendChild(h("div", { class: "hp-acts" }, h("button", { class: "btn primary hp-act hp-focus", type: "button", id: "hpNext", onclick: next }, "再来一局", h("kbd", { text: "↵" }))));
      return box;
    }
    function renderAfter() {
      clear(after); if (!s.fin) return;
      var fin = s.fin, g = G(), cu = cumul(s), n = cu.me.length, L = s.long && s.long.done ? s.long : null, K = A.KIND || {}, tb = h("tbody"), my = QL.humanMeanSe(cu.me), sid = starOf(s);
      function row(attr, name, one, avg, lr) { var tr = h("tr", attr, h("td", null, name), h("td", { class: "num", text: one })); if (n > 1) tr.appendChild(h("td", { class: "num", text: avg })); tr.appendChild(h("td", { class: "num", text: lr })); tb.appendChild(tr); }
      row({ "data-who": "me", class: "me" }, h("b", { text: "你" }), fm1(fin.st.score), fm(my.m), "—");
      s.kit.refs.forEach(function (r) {
        var x = fin.refs.filter(function (q) { return q.id === r.id; })[0], lr = L ? L.by[r.id] : null;
        row({ "data-ref": r.id, class: r.id === sid ? "star" : null }, [h("span", { class: "tag", text: r.bench ? "基准" : K[r.kind] || "参照" }), " ", r.name], x && !x.err ? fm1(x.score) : "出错", r.err ? "出错" : fm(QL.humanMeanSe(cu.by[r.id]).m), r.err ? "出错" : lr ? fm(lr.m) : "…");
      });
      s.kit.marks.forEach(function (mk) { row({ "data-mark": mk.id }, [h("span", { class: "tag", text: K[mk.kind] || "理论" }), " ", mk.name], "—", "—", fm(mk.value)); });
      var head = [h("th", { text: "和谁比" }), h("th", { text: "这一局" })];
      if (n > 1) head.push(h("th", { text: "这 " + n + " 局的平均" }));
      head.push(h("th", { text: "长期平均" }));
      after.appendChild(h("div", { class: "gref" }, h("table", { class: "gtab hp-tab" },
        h("caption", { text: "同样的对局交给各条参照规则各打一遍。\"长期平均\"是在另外生成的 " + (s.long ? s.long.N : QL.humanLongN(s.kit)) + " 局上算的" + (L ? "。" : "，正在算…") }),
        h("thead", null, h("tr", null, head)), tb)));
      // 累计：和先比的那条规则在同样几局上的配对差
      var sr = s.kit.refs.filter(function (r) { return r.id === sid; })[0], note;
      if (sr && !sr.err && n > 1) {
        var ref = cu.by[sr.id], diff = cu.me.map(function (v, i) { return v - ref[i]; }), dm = QL.humanMeanSe(diff), z = dm.se > 0 ? dm.m / dm.se : 0, ds = A.gdiff(g, dm.m), ss = dm.se > 0 ? A.gdiff(g, dm.se).slice(1) : "";
        var head2 = "已经打完 " + n + " 局：你平均 " + fm(my.m) + "，「" + sr.name + "」在同样的 " + n + " 局上平均 " + fm(QL.humanMeanSe(ref).m) + "。";
        var mid = ds.charAt(0) === "+" ? "你比它高 " + ds.slice(1) + (ss ? " ± " + ss : "") + "。" : ds.charAt(0) === "−" ? "你比它低 " + ds.slice(1) + (ss ? " ± " + ss : "") + "。" : "你和它几乎一样。";
        var tail = !(dm.se > 0) ? "" : z > 2 ? "差距超过了 2 倍标准误：到目前为止，你打得比它好。" : z < -2 ? "差距超过了 2 倍标准误：到目前为止，它打得比你好。" : "差距不到 2 倍标准误：还分不出高下，运气的成分盖过了打法的差别。";
        note = h("p", { class: "hp-cum", id: "hpCum" }, head2, " ", h("b", { class: "verdict " + (z > 2 ? "up" : z < -2 ? "down" : "flat"), text: mid }), " ", tail);
      } else note = h("p", { class: "hp-cum", id: "hpCum", text: "一局的输赢里运气占大头。多打几局，这里会给出你和「" + (sr ? sr.name : "") + "」在同样几局上的平均差，以及它的标准误。" });
      after.appendChild(note);
      after.appendChild(h("div", { class: "row tight hp-foot" },
        h("button", { class: "btn small", type: "button", id: "hpWipe", text: "把这组设定下的记录清零", onclick: wipe }),
        h("button", { class: "btn small", type: "button", text: "这套玩法的细则与已知结论", onclick: function () { if (A.openGuide) A.openGuide("game:" + type); } }),
        h("span", { class: "note", text: "成绩只存在这台设备的浏览器里。" })));
    }
    function render() {
      var c = ctx(), g = G();
      renderTop();
      clear(setup); ui.setup(s.hp).concat(["计分：" + g.name, "种子 " + seed]).forEach(function (t) { setup.appendChild(h("li", { text: t })); });
      clear(tiles); ui.tiles(c).forEach(function (t) { tiles.appendChild(h("div", { class: "hp-tile" }, h("span", { text: t[0] }), h("b", { class: "num", text: t[1] }))); });
      clear(main); main.appendChild(s.fin ? verdict(c) : ui.board(c));
      logEl.textContent = ui.log(c) || (s.fin ? "" : "每一回合看到的，和规则在这一回合能看到的一样多；裁判藏着的东西打完才揭晓。");
      var spec = ui.chart(c);
      if (!chart) chart = new QLChart.Chart(chartHost, { height: spec.height || 280 });
      chart.set(spec);
      renderAfter();
      var f = m.box.querySelector(".hp-focus");
      if (f) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } if (f.select && f.tagName === "INPUT") f.select(); }
    }
    m.box.addEventListener("keydown", function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.repeat || !s || s.fin || !s.step || !ui.keys) return;   // 按住不放不算：一次按键一个决定
      var tg = e.target, tag = tg && tg.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;   // 正在填数字时不抢
      if (ui.keys(ctx(), e.key)) e.preventDefault();
    });
    setSize(sizeId);
  };
})(App);
