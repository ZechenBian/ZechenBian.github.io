// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 应用主体（十二）：规则同场。几条规则放进同一个市场互相当对手：竞价（共同价值拍卖）或者做市（抢同一批客人）。市场怎么结算见 arena.js。
 * 上场的可以是自带的规则、你自己写的、从大家那里载入的。自己写的存在这台设备的浏览器里（和左栏的"我的策略"分开：这里的规则看到的东西不一样）。
 * 比的事交给 jobs.js：全部规则编进同一个线程；只要里面有别人写的代码，线程就开在隔离环境里。
 * 同一个线程里的规则互相之间没法做到完全隔绝（见 jobs.js 的说明），所以有别人的规则在场时，这里的结果只图个乐。 */
(function (A) {
  "use strict";
  var h = A.h, clear = A.clear, QL = A.QL, F = A.F, P = A.P;
  if (typeof QL_ARENA_INSTALL !== "function" || typeof QLJobs === "undefined") return;
  if (!QL.ARENA) QL_ARENA_INSTALL(QL);
  var AR = QL.ARENA, KEY = "ql.arena.v1", MAXN = 8;
  A.arenaOpt = { timeout: 30000 };   // 一件任务多久没动静算卡死（毫秒）。测试里会调小
  var DEF_PICK = { auction: ["a_face", "a_even", "a_eq", "a_learn"], mm: ["m_fix", "m_even", "m_safe", "m_learn"] };
  var store = { v: 1, market: "auction", rules: [], pick: { auction: DEF_PICK.auction.slice(), mm: DEF_PICK.mm.slice() }, set: { auction: { eps: 20, fmt: "first", T: 200, K: 200, seed: 7 }, mm: { eps: 20, pi: 0.2, T: 200, K: 200, seed: 7 } } };
  function okP(p) { var o = {}; if (p && typeof p === "object") Object.keys(p).slice(0, 12).forEach(function (k) { if (/^[A-Za-z_][A-Za-z0-9_]{0,23}$/.test(k) && typeof p[k] === "number" && isFinite(p[k])) o[k] = p[k]; }); return o; }
  function okRule(r) {
    if (!r || typeof r.id !== "string" || !/^[a-z0-9_-]{2,40}$/i.test(r.id) || !AR.markets[r.market] || typeof r.code !== "string" || !r.code.trim() || r.code.length > 20000) return null;
    var o = { id: r.id, market: r.market, name: A.cleanText(r.name, 40) || "没有名字的规则", summary: A.cleanText(r.summary, 200), code: r.code, p: okP(r.p), src: r.src === "hub" ? "hub" : "mine" };
    if (o.src === "hub") { o.foreign = true; o.from = r.from && typeof r.from === "object" ? { user: A.cleanText(r.from.user, 60), n: r.from.n | 0, url: QLHub.issueUrl(r.from.n | 0) } : null; }
    return o;
  }
  try {
    var o0 = JSON.parse(localStorage.getItem(KEY) || "null");
    if (o0 && o0.v === 1) {
      if (AR.markets[o0.market]) store.market = o0.market;
      if (Array.isArray(o0.rules)) store.rules = o0.rules.map(okRule).filter(Boolean).slice(0, 40);
      ["auction", "mm"].forEach(function (mk) {
        if (o0.pick && Array.isArray(o0.pick[mk])) store.pick[mk] = o0.pick[mk].filter(function (x) { return typeof x === "string"; }).slice(0, MAXN);
        var s = o0.set && o0.set[mk], d = store.set[mk]; if (!s || typeof s !== "object") return;
        ["eps", "pi", "T", "K", "seed"].forEach(function (k) { if (typeof s[k] === "number" && isFinite(s[k]) && k in d) d[k] = s[k]; });
        if (mk === "auction" && (s.fmt === "first" || s.fmt === "second")) d.fmt = s.fmt;
      });
    }
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
  function libRules(mk) { return AR.lib.filter(function (r) { return r.market === mk; }).map(function (r) { return { id: r.id, market: r.market, name: r.name, summary: r.summary, code: r.code, p: Object.assign({}, r.p), src: "" }; }); }
  function allRules(mk) { return libRules(mk).concat(store.rules.filter(function (r) { return r.market === mk; })); }
  function ruleOf(id, mk) { return allRules(mk).filter(function (r) { return r.id === id; })[0] || null; }
  A.arenaStore = function () { return store; };
  function pLine(p) { return Object.keys(p).map(function (k) { return k + " = " + +(+p[k]).toFixed(6); }).join(", "); }
  /** "d = 10, up = 2" → { d: 10, up: 2 }；写法不对时返回 null */
  function parseP(text) {
    var o = {}, parts = String(text || "").split(/[,，;；\n]+/).map(function (s) { return s.trim(); }).filter(Boolean), i;
    if (parts.length > 12) return null;
    for (i = 0; i < parts.length; i++) { var m = /^([A-Za-z_][A-Za-z0-9_]{0,23})\s*[=＝:：]\s*(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)$/i.exec(parts[i]); if (!m || !isFinite(+m[2])) return null; o[m[1]] = +m[2]; }
    return o;
  }
  var MK = { auction: "竞价", mm: "做市" };
  function apiDoc(mk) {
    return [
      "function decide(s, p, st)   必须有。每个回合调用一次，返回一个数。",
      mk === "auction" ? "    返回这一回合的出价。不大于 0，或者返回的不是数 = 这一回合不出价。出价最高的买走；买到的人赚 V − 付的钱。" : "    返回这一回合的半价差 h（负数按 0 算；不是数 = 这一回合不报价）。等于同时挂出卖价 s.x + h 和买价 s.x − h。",
      "function init(p)            可以没有。每一场开始时调用一次，返回的对象就是 decide 的第三个参数 st。",
      "s.x        这一回合你对真实价值 V 的估计：V 加上 −ε 到 +ε 之间均匀分布的误差。各条规则的误差互相独立",
      "s.n        场上一共几条规则",
      "s.t  s.T   这是第几回合（从 0 起）、一场一共几回合",
      "s.g        市场的常数：s.g.lo、s.g.hi（V 在这之间均匀分布）、s.g.eps（ε）" + (mk === "auction" ? "、s.g.fmt（\"first\" 付自己的出价，\"second\" 付第二高的出价）" : "、s.g.pi（客人是知情的概率）、s.g.R（不知情的客人能接受报价离 V 多远）"),
      "s.last     上一回合你的盈亏（没成交是 0，第一回合是 NaN）；s.lastA 是上一回合你报的数；s.won 是上一回合你成交了没有（1 / 0）",
      "s.v        上一回合的真实价值（每回合结束后公布）；s.win 是上一回合的成交价（没成交是 NaN）" + (mk === "mm" ? "；s.side 是上一回合客人买（1）、卖（−1）还是没成交（0）" : ""),
      "s.total    到目前为止你的累计盈亏；s.rnd() 给一个 0 到 1 之间的均匀随机数",
      "p          你在\"参数\"一栏里写的那些数（只读）"
    ].join("\n");
  }
  function aiPrompt(mk, r) {
    return [
      "请替我写一条规则，用在一个模拟市场里和别的规则同场竞争。只回一段 JavaScript 代码，不要解释。",
      "",
      mk === "auction"
        ? "市场：共同价值拍卖。每一回合有一件东西，真实价值 V 在 [lo, hi] 上均匀分布，谁也看不到。每条规则各自看到一个带误差的估计 x = V + U(−ε, ε)，然后各出一个价；出价最高的买走，赚 V − 付的钱。每回合结束后公布 V 和成交价。得分是平均每回合的盈亏。"
        : "市场：几条规则同时做市。每一回合有一件东西，真实价值 V 在 [lo, hi] 上均匀分布，谁也看不到。每条规则各自看到一个带误差的估计 x = V + U(−ε, ε)，然后各报一个半价差 h，等于挂出卖价 x + h 和买价 x − h。来一位客人：不知情的随机买或卖，在最好的报价上成交；知情的知道 V，只在有便宜可占时出手。成交的规则：卖出赚 卖价 − V，买进赚 V − 买价。每回合结束后公布 V 和成交价。得分是平均每回合的盈亏。",
      "",
      "接口：",
      apiDoc(mk),
      "",
      "要求：只定义 decide（需要的话加 init），不要有别的顶层语句；不要用 eval、不要联网；参数都从 p 里读。",
      r ? "\n我现在的代码（请在它的基础上改）：\n" + r.code + (Object.keys(r.p).length ? "\n参数：" + pLine(r.p) : "") : "",
      "",
      "我的想法："
    ].join("\n");
  }

  /* ---------- 写一条 / 看一条 ---------- */
  function openEditor(mk, rule, after) {
    var isLib = !rule.src && !rule.fresh, mine = rule.src === "mine", ro = rule.src === "hub";   // fresh：从样板新写的一条，还没存过
    var name = h("input", { type: "text", id: "arName", maxlength: 40, value: isLib ? rule.name + "（改）" : rule.name, "aria-label": "名字", disabled: ro });
    var sum = h("input", { type: "text", id: "arSum", maxlength: 200, value: rule.summary, "aria-label": "一句话说明", disabled: ro });
    var par = h("input", { type: "text", id: "arPar", class: "num", value: pLine(rule.p), placeholder: "比如 d = 10, up = 2（没有就留空）", "aria-label": "参数", spellcheck: "false", disabled: ro });
    var ta = h("textarea", { class: "codeedit", id: "arCode", spellcheck: "false", "aria-label": "规则的代码", readonly: ro }); ta.value = rule.code;
    var err = h("div", { class: "warn err", id: "arErr", hidden: true });
    function read() {
      var p = parseP(par.value), code = ta.value, bad = QLJobs.syntax(code);
      if (!A.cleanText(name.value, 40)) return "先给它起个名字。";
      if (!p) return "参数的写法不对。照这个样子写：d = 10, up = 2（名字用字母，值是数）。";
      if (bad) return "代码有语法错误：" + bad;
      if (!/\bfunction\s+decide\s*\(/.test(code)) return "代码里要有 function decide(s, p, st)。";
      if (code.length > 20000) return "代码太长了（上限两万字）。";
      return { id: mine ? rule.id : "ar-" + Date.now().toString(36), market: mk, name: A.cleanText(name.value, 40), summary: A.cleanText(sum.value, 200), code: code, p: p, src: "mine" };
    }
    function fail(msg) { err.hidden = false; err.textContent = msg; }
    var foot = [h("button", { class: "btn", type: "button", id: "arAi", text: "复制给 AI 的说明", title: "把这个市场的规矩、接口和现在的代码复制下来，贴给任何一个 AI，让它替你写", onclick: function () { A.copy(aiPrompt(mk, { code: ta.value, p: parseP(par.value) || {} })); } })];
    if (!ro) {
      foot.push(h("button", { class: "btn", type: "button", id: "arPost", text: "贴到 GitHub", onclick: function () {
        var r = read(); if (typeof r === "string") { fail(r); return; }
        A.postDialog({ kind: "rule", title: MK[mk] + " · " + r.name, meta: { kind: "rule", for: "arena:" + mk, name: r.name, summary: r.summary, p: r.p }, code: r.code });
      } }));
      foot.push(h("button", { class: "btn primary", type: "button", id: "arSave", text: isLib ? "另存成我的" : "保存", onclick: function () {
        var r = read(); if (typeof r === "string") { fail(r); return; }
        var i = -1; store.rules.forEach(function (x, k) { if (x.id === r.id) i = k; });
        if (i >= 0) store.rules[i] = r; else { store.rules.push(r); if (store.rules.length > 40) store.rules.shift(); if (store.pick[mk].indexOf(r.id) < 0 && store.pick[mk].length < MAXN) store.pick[mk].push(r.id); }
        save(); m.close(); if (after) after(r);
      } }));
    } else foot.push(h("button", { class: "btn primary", type: "button", id: "arFork", text: "另存成我的再改", onclick: function () { m.close(); openEditor(mk, { id: "", market: mk, name: rule.name + "（改）", summary: rule.summary, code: rule.code, p: rule.p, src: "", fresh: true }, after); } }));
    var m = A.modal((ro ? "别人写的规则 · " : isLib ? "自带的规则 · " : "我的规则 · ") + MK[mk], [
      ro ? h("p", { class: "note", id: "arForeign" }, "这条规则是别人写的", rule.from && rule.from.user ? ["（", h("a", { href: rule.from.url, target: "_blank", rel: "noopener", text: "@" + rule.from.user }), "）"] : null, "，这里只能看。上场时它在隔离环境里运行。") : isLib ? h("p", { class: "note", text: "自带的规则本身不能改。改完点\"另存成我的\"，它就成了你自己的一条。" }) : null,
      h("div", { class: "ar-form" }, h("label", { for: "arName", text: "名字" }), name, h("label", { for: "arSum", text: "一句话说明" }), sum, h("label", { for: "arPar", text: "参数" }), par),
      ta, err,
      h("details", { class: "more" }, h("summary", { text: "规则能用到的东西" }), h("div", { class: "more-body" }, h("pre", { class: "code", id: "arDoc", text: apiDoc(mk) })))
    ], { cls: "are", foot: foot, focus: "#arCode" });
    return m;
  }

  /* ---------- 从大家那里找 ---------- */
  function openFind(mk, after) {
    var box = h("div", { class: "db", id: "arFind" }), alive = true;
    var m = A.modal("大家写的规则 · " + MK[mk], box, { cls: "dbm", onClose: function () { alive = false; } });
    function paint(st) {
      clear(box);
      box.appendChild(h("div", { class: "row tight db-head" }, h("span", { class: "sp" }), h("button", { class: "btn small", type: "button", id: "arFindRefresh", disabled: st.loading, text: st.loading ? "正在取…" : "刷新", onclick: function () { load(true); } })));
      if (st.err) box.appendChild(h("div", { class: "warn", id: "arFindErr", text: st.err.limited ? "GitHub 限制了这个网络的访问次数（不登录每小时 60 次）。过一会儿再刷新。" : "连不上 GitHub，暂时看不了。" }));
      if (!st.loading && !st.rows.length && !st.err) box.appendChild(h("p", { class: "db-say", id: "arFindEmpty", text: "还没有人贴过" + MK[mk] + "的规则。自己写一条，在编辑的地方点\"贴到 GitHub\"。" }));
      st.rows.forEach(function (x) {
        var have = store.rules.some(function (r) { return r.id === x.rule.id; });
        box.appendChild(h("div", { class: "ar-found", "data-n": x.item.n }, h("div", { class: "ar-ftxt" }, h("b", { text: x.rule.name }), " ", h("a", { href: x.item.url, target: "_blank", rel: "noopener", text: "@" + x.item.user }), x.item.up ? h("span", { class: "note", text: " 👍 " + x.item.up }) : null, x.rule.summary ? h("div", { class: "note", text: x.rule.summary }) : null),
          h("button", { class: "btn small" + (have ? "" : " primary"), type: "button", "data-add": x.item.n, disabled: have, text: have ? "已经在名单里" : "请它上场", onclick: function () {
            store.rules.push(x.rule); if (store.rules.length > 40) store.rules.shift();
            if (store.pick[mk].indexOf(x.rule.id) < 0 && store.pick[mk].length < MAXN) store.pick[mk].push(x.rule.id);
            save(); if (after) after(); paint(st);
          } })));
      });
      box.appendChild(h("p", { class: "note db-how", text: "别人写的规则上场时在隔离环境里运行，碰不到这张页面里的东西，也连不了网。想给哪条规则打分，点它后面的用户名，去那条 Issue 上点 👍。" }));
    }
    function load(fresh) {
      paint({ loading: true, rows: [], err: null });
      QLHub.list({ kind: "rule", fresh: !!fresh }).then(function (res) {
        if (!alive) return;
        var rows = res.items.filter(function (it) { return it.meta.for === "arena:" + mk; }).map(function (it) { var r = okRule({ id: "hub-" + it.n, market: mk, name: it.meta.name, summary: it.meta.summary, code: it.code, p: it.meta.p, src: "hub", from: { user: it.user, n: it.n } }); return r ? { item: it, rule: r } : null; }).filter(Boolean)
          .sort(function (a, b) { return b.item.up - a.item.up || b.item.at - a.item.at; }).slice(0, 60);
        paint({ loading: false, rows: rows, err: res.stale ? res.error : null });
      }, function (e) { if (alive) paint({ loading: false, rows: [], err: e || {} }); });
    }
    load(false);
    return m;
  }

  /* ---------- 主弹层 ---------- */
  A.openArena = function (mk0) {
    var mk = AR.markets[mk0] ? mk0 : store.market, job = null, alive = true, chart = null, last = {};
    var host = h("div", { class: "ar-host" }), seg = h("div", { class: "seg", role: "group", "aria-label": "哪种市场" });
    [["auction", "竞价"], ["mm", "做市"]].forEach(function (x) { seg.appendChild(h("button", { type: "button", "data-mk": x[0], text: x[1], onclick: function () { if (mk !== x[0]) { stop(); mk = x[0]; store.market = mk; save(); draw(); } } })); });
    function stop() { if (job) { job.cancel(); job = null; } }
    var m = A.modal("规则同场", [
      h("p", { class: "lb-lead", text: "别处的规则都是各打各的；这里把几条规则放进同一个市场，互相当对手。一条规则赚多少，取决于别的规则怎么出手。" }),
      h("div", { class: "row tight" }, seg), host
    ], { cls: "arm", onClose: function () { alive = false; stop(); if (chart) chart.destroy(); } });
    function numIn(id, label, key, min, max, step) {
      var s = store.set[mk], inp = h("input", { type: "number", id: id, min: min, max: max, step: step, value: s[key], "aria-label": label });
      inp.addEventListener("change", function () { var v = parseFloat(inp.value); if (!(v === v)) v = s[key]; v = Math.min(max, Math.max(min, v)); if (step >= 1) v = Math.round(v); inp.value = v; s[key] = v; save(); });
      return h("label", { class: "ar-set" }, h("span", { text: label }), inp);
    }
    function draw() {
      clear(host); if (chart) { chart.destroy(); chart = null; }
      Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-mk") === mk ? "true" : "false"); });
      var s = store.set[mk], rules = allRules(mk), pick = store.pick[mk] = store.pick[mk].filter(function (id) { return rules.some(function (r) { return r.id === id; }); });
      host.appendChild(h("p", { class: "note", id: "arWhat", text: mk === "auction"
        ? "竞价：每一回合有一件东西，真实价值 V 谁也看不到，每条规则各自看到一个带误差的估计，然后各出一个价。出价最高的买走，赚 V 减去付的钱。出价最高的人，手里往往是最乐观的那个估计，这就是赢家诅咒。"
        : "做市：每条规则报一个半价差，等于同时挂出卖价和买价。来一位客人，在最好的那个报价上成交。价差小才抢得到单，可是抢到的多半是自己估错的那些；知情的客人更是只在你报错价时才来。" }));
      var setRow = h("div", { class: "row tight ar-sets" }, numIn("arEps", "估计的误差 ε", "eps", 1, 100, 1));
      if (mk === "auction") { var fs = h("select", { id: "arFmt", "aria-label": "怎么付钱", onchange: function () { s.fmt = fs.value; save(); } }, [["first", "第一价格（付自己的出价）"], ["second", "第二价格（付第二高的出价）"]].map(function (x) { return h("option", { value: x[0], text: x[1], selected: s.fmt === x[0] }); })); setRow.appendChild(h("label", { class: "ar-set" }, h("span", { text: "怎么付钱" }), fs)); }
      else setRow.appendChild(numIn("arPi", "知情客人的比例", "pi", 0, 0.9, 0.05));
      setRow.appendChild(numIn("arT", "一场几回合", "T", 20, 1000, 10)); setRow.appendChild(numIn("arK", "比几场", "K", 20, 2000, 10)); setRow.appendChild(numIn("arSeed", "种子", "seed", 0, 999999, 1));
      host.appendChild(setRow);
      /* 名单 */
      var list = h("div", { class: "ar-list", id: "arList" });
      rules.forEach(function (r) {
        var on = pick.indexOf(r.id) >= 0, cb = h("input", { type: "checkbox", id: "arPick-" + r.id, checked: on, onchange: function () {
          var i = pick.indexOf(r.id); if (cb.checked && i < 0) { if (pick.length >= MAXN) { cb.checked = false; A.toast("一场最多 " + MAXN + " 条规则。", 3000); return; } pick.push(r.id); } else if (!cb.checked && i >= 0) pick.splice(i, 1);
          save(); count();
        } });
        list.appendChild(h("div", { class: "ar-rule", "data-rule": r.id }, cb, h("label", { for: "arPick-" + r.id, class: "ar-rtxt" }, h("b", { text: r.name }), r.src === "hub" ? h("span", { class: "tag", text: "别人写的" + (r.from && r.from.user ? " @" + r.from.user : "") }) : r.src ? h("span", { class: "tag", text: "我的" }) : null, h("span", { class: "note", text: (r.summary ? r.summary : "") + (Object.keys(r.p).length ? "（" + pLine(r.p) + "）" : "") })),
          h("button", { class: "btn small", type: "button", "data-code": r.id, text: r.src === "mine" ? "改" : "看代码", onclick: function () { openEditor(mk, r, function () { if (alive) draw(); }); } }),
          r.src ? h("button", { class: "iconbtn", type: "button", "data-del": r.id, "aria-label": "删掉 " + r.name, text: "✕", onclick: function () { store.rules = store.rules.filter(function (x) { return x.id !== r.id; }); store.pick[mk] = store.pick[mk].filter(function (x) { return x !== r.id; }); save(); draw(); } }) : null));
      });
      host.appendChild(list);
      var cnt = h("span", { class: "note", id: "arCount" }), go = h("button", { class: "btn primary", type: "button", id: "arRun", text: "开始比", onclick: run });
      function count() { var n = pick.length; cnt.textContent = "已经请了 " + n + " 条上场（2 到 " + MAXN + " 条）"; go.disabled = n < 2; }
      host.appendChild(h("div", { class: "row tight ar-acts" }, go,
        h("button", { class: "btn", type: "button", id: "arNew", text: "写一条新的", onclick: function () { var t = libRules(mk).filter(function (r) { return r.id === (mk === "auction" ? "a_cut" : "m_fix"); })[0]; openEditor(mk, { id: "", market: mk, name: "我的规则", summary: "", code: t.code, p: t.p, src: "", fresh: true }, function () { if (alive) draw(); }); } }),
        h("button", { class: "btn", type: "button", id: "arFindBtn", text: "从大家那里找", onclick: function () { openFind(mk, function () { if (alive) draw(); }); } }), h("span", { class: "sp" }), cnt));
      count();
      var out = h("div", { class: "ar-out", id: "arOut" }); host.appendChild(out);
      if (last[mk]) show(out, last[mk]);

      function run() {
        var chosen = pick.map(function (id) { return ruleOf(id, mk); }).filter(Boolean), bad = null;
        chosen.forEach(function (r) { if (!bad) { var e = QLJobs.syntax(r.code); if (e) bad = "「" + r.name + "」的代码有语法错误：" + e; } });
        clear(out); if (chart) { chart.destroy(); chart = null; }
        if (bad) { out.appendChild(h("div", { class: "warn err", id: "arRunErr", text: bad })); return; }
        go.disabled = true;
        var prog = h("p", { class: "note", id: "arProg", text: "正在让每条规则先单独走几步…" }); out.appendChild(prog);
        stop();
        var j = job = QLJobs.run({ kind: "arena", codes: chosen.map(function (r) { return { id: r.id, code: r.code, mine: !r.foreign }; }), timeout: A.arenaOpt.timeout,
          data: { market: mk, params: { eps: s.eps, fmt: s.fmt, pi: s.pi }, T: s.T, K: s.K, seed: s.seed, entries: chosen.map(function (r) { return { id: r.id, p: r.p }; }) },
          onProgress: function (pm) { if (pm.total) prog.textContent = "已经比了 " + pm.done + " / " + pm.total + " 场…"; } });
        j.promise.then(function (res) { if (job === j) job = null; if (!alive) return; last[mk] = { res: res, names: chosen.map(function (r) { return { id: r.id, name: r.name, src: r.src }; }), foreign: chosen.some(function (r) { return !!r.foreign; }) }; go.disabled = pick.length < 2; clear(out); show(out, last[mk]); },
          function (e) {
            if (job === j) job = null; if (!alive || (e && e.cancelled)) return;
            go.disabled = pick.length < 2; clear(out);
            var who = e && e.id ? chosen.filter(function (r) { return r.id === e.id; })[0] : null, msg = e && e.message || "出错了";
            if (who && e.timeout) { var i = pick.indexOf(who.id); if (i >= 0) pick.splice(i, 1); save(); var c = document.getElementById("arPick-" + who.id); if (c) c.checked = false; count(); msg = "「" + who.name + "」卡住了（多半是代码里有死循环），已经把它请下场。再点一次\"开始比\"。"; }
            else if (who && e.compile) msg = "「" + who.name + "」的代码有语法错误" + (e.line ? "（第 " + e.line + " 行）" : "") + "：" + e.message;
            out.appendChild(h("div", { class: "warn err", id: "arRunErr", text: msg }));
          });
      }
    }
    function show(out, L) {
      var res = L.res, nameOf = function (id) { var x = L.names.filter(function (q) { return q.id === id; })[0]; return x ? x.name : id; };
      (res.skipped || []).forEach(function (x) { out.appendChild(h("div", { class: "warn", "data-skip": x.id, text: "「" + nameOf(x.id) + "」没能上场：" + x.err })); });
      if (!res.rows.length) { out.appendChild(h("div", { class: "warn err", id: "arRunErr", text: "能上场的规则不到两条，比不了。" })); return; }
      var rows = res.rows.slice().sort(function (a, b) { return b.mean - a.mean; }), tb = h("tbody"), auc = res.market === "auction";
      rows.forEach(function (r, i) {
        tb.appendChild(h("tr", { "data-rule": r.id }, h("td", { class: "num", text: String(i + 1) }), h("td", null, h("b", { text: nameOf(r.id) }), r.err ? h("span", { class: "note", text: " 中途出错：" + r.err }) : null),
          h("td", { class: "num" }, h("b", { class: "verdict " + (r.mean > 2 * r.se ? "up" : r.mean < -2 * r.se ? "down" : "flat"), text: A.sgn(F(r.mean, 3)) }), h("span", { class: "note", text: " ± " + F(r.se, 3) })),
          h("td", { class: "num", text: P(r.fill, 1) }), h("td", { class: "num", text: r.edge === r.edge ? A.sgn(F(r.edge, 2)) : "—" }), h("td", { class: "num", text: r.act === r.act ? F(r.act, 2) : "—" })));
      });
      out.appendChild(h("div", { class: "gref" }, h("table", { class: "gtab hp-tab db-tab ar-tab", id: "arTab" },
        h("caption", { text: res.n + " 条规则同场，比了 " + res.K + " 场，每场 " + res.T + " 回合；ε = " + res.g.eps + (auc ? (res.g.fmt === "second" ? "，第二价格" : "，第一价格") : "，知情客人占 " + P(res.g.pi, 0)) + "。± 后面是标准误。" }),
        h("thead", null, h("tr", null, h("th", { text: "名次" }), h("th", { text: "规则" }), h("th", { text: "平均每回合盈亏" }), h("th", { text: "成交占比" }), h("th", { text: "成交时每笔盈亏" }), h("th", { text: auc ? "平均比估计少出" : "平均半价差" }))), tb)));
      if (res.marks && res.marks.length) {
        var ul = h("ul", { class: "ar-marks", id: "arMarks" });
        res.marks.forEach(function (mkx) { ul.appendChild(h("li", { "data-mark": mkx.id }, mkx.name + "：每条规则每回合 ", h("b", { class: "num", text: A.sgn(F(mkx.value, 3)) }))); });
        out.appendChild(h("div", null, h("p", { class: "note", text: "对照着看的理论值（" + res.n + " 条规则、ε = " + res.g.eps + " 时）：" }), ul));
      }
      if (L.foreign) out.appendChild(h("p", { class: "note", id: "arFun", text: "场上有别人写的规则。它们在隔离环境里运行，偷不走东西；但同场的规则之间没法完全隔绝，这个结果只图个乐。" }));
      if (res.trace) {
        var T = res.T, xs = [], i; for (i = 0; i <= T; i++) xs.push(i);
        var host2 = h("div", { class: "hp-chart", id: "arChart" }); out.appendChild(host2);
        chart = new QLChart.Chart(host2, { height: 250 });
        chart.set({ height: 250, x: { label: "第一场的回合", domain: [0, T] }, legend: res.rows.map(function (r, k) { return { name: nameOf(r.id), color: "s" + (k % 8 + 1) }; }),
          panels: [{ y: { label: "累计盈亏", zero: true }, layers: [{ kind: "hline", y: 0, color: "axis" }].concat(res.rows.map(function (r, k) { return { kind: "line", x: xs, y: res.trace[k], color: "s" + (k % 8 + 1), name: nameOf(r.id) }; })) }] });
      }
    }
    draw();
    return m;
  };

  if (A.lobbyAdd) A.lobbyAdd({
    id: "arena", order: 40, route: "arena", kicker: "规则对规则", title: "规则同场", label: "摆一场", keys: "arena 同场 竞价 拍卖 做市 对手 赢家诅咒 auction market making",
    blurb: "几条规则放进同一个市场互相当对手：一起竞价，或者一起做市抢同一批客人。看谁的规则在有对手的时候还站得住。",
    status: function () { var n = store.rules.length; return n ? "你写了、载入了 " + n + " 条规则" : ""; },
    go: function (arg) { A.openArena(arg); }
  });
})(App);
