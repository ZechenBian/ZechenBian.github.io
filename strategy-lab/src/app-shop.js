// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 应用主体（十三）：世界工坊。自己造两样东西，造好了可以贴到 GitHub 给别人用（怎么跑见 shop.js）。
 *   世界：一段 simulate(T, rng, p, K)。这里能写、能试（生成几百条路径看看长什么样），也能一键拿到实验室里当"自定义世界"用。
 *   玩法：一个裁判（deal / show / referee 三个函数）加上几条来玩它的规则。这里能写裁判、写规则，把几条规则放在同一副牌上比。
 * 自己写的东西存在这台设备的浏览器里。别人写的世界、玩法、规则带着 foreign 标记，一律在隔离环境里运行（sandbox.js）。
 * 裁判和规则编在同一个线程里，互相之间没法完全隔绝（见 jobs.js 的说明），所以有别人的代码在场时，结果只图个乐。 */
(function (A) {
  "use strict";
  var h = A.h, clear = A.clear, QL = A.QL, F = A.F, P = A.P, S = A.state;
  if (typeof QL_SHOP_INSTALL !== "function" || typeof QLJobs === "undefined") return;
  if (!QL.SHOP) QL_SHOP_INSTALL(QL);
  var SH = QL.SHOP, KEY = "ql.shop.v1", MAXR = SH.maxRules, IDRE = /^[a-z0-9_-]{2,40}$/i, KEYRE = /^[A-Za-z_][A-Za-z0-9_]{0,23}$/;
  A.shopOpt = { timeout: 30000 };   // 一件任务多久没动静算卡死（毫秒）。测试里会调小
  var store = { v: 1, tab: "world", worlds: [], games: [], extra: {}, sets: {} };

  /* ---------- 进门的筛子：存着的、别人交来的东西都先过一遍 ---------- */
  function okP(p) { var o = {}; if (p && typeof p === "object") Object.keys(p).slice(0, 12).forEach(function (k) { if (KEYRE.test(k) && typeof p[k] === "number" && isFinite(p[k])) o[k] = p[k]; }); return o; }
  function fromOf(f) { return f && typeof f === "object" && (f.n | 0) > 0 ? { user: A.cleanText(f.user, 60), n: f.n | 0, url: QLHub.issueUrl(f.n | 0) } : null; }
  function okCode(c) { return typeof c === "string" && !!c.trim() && c.length <= 20000; }
  /** 别人写的说明只当文字看：把链接的写法拆开，点不了 */
  function noLinks(s) { return A.cleanText(s, 4000).replace(/\]\(/g, "] ("); }
  function okRule(r) {
    if (!r || typeof r.id !== "string" || !IDRE.test(r.id) || !okCode(r.code)) return null;
    var o = { id: r.id, name: A.cleanText(r.name, 40) || "没有名字的规则", summary: A.cleanText(r.summary, 200), code: r.code, p: okP(r.p), src: r.src === "hub" ? "hub" : r.src === "mine" ? "mine" : "" };
    if (o.src === "hub") { o.foreign = true; o.from = fromOf(r.from); }
    return o;
  }
  function okWorld(w) {
    if (!w || typeof w.id !== "string" || !IDRE.test(w.id) || !okCode(w.code)) return null;
    var K = +w.K, T = Math.round(+w.T), hub = w.src === "hub";
    var o = { id: w.id, name: A.cleanText(w.name, 40) || "没有名字的世界", summary: A.cleanText(w.summary, 200), code: w.code, schema: A.cleanSchema(w.schema).filter(function (q) { return q.type === "num"; }).slice(0, 12),
      K: K >= 1 && K <= 100000 ? K : 252, T: T >= 10 && T <= 4000 ? T : 252, explain: hub ? noLinks(w.explain) : typeof w.explain === "string" ? w.explain.slice(0, 4000) : "", src: hub ? "hub" : "mine" };
    if (hub) { o.foreign = true; o.from = fromOf(w.from); }
    return o;
  }
  function okGame(g) {
    if (!g || typeof g.id !== "string" || !IDRE.test(g.id) || !okCode(g.code)) return null;
    var T = Math.round(+g.T), hub = g.src === "hub", seen = {};
    var o = { id: g.id, name: A.cleanText(g.name, 40) || "没有名字的玩法", summary: A.cleanText(g.summary, 200), about: hub ? noLinks(g.about) : typeof g.about === "string" ? g.about.slice(0, 4000) : "", code: g.code, p: okP(g.p), T: T >= 1 && T <= 2000 ? T : 20,
      rules: (Array.isArray(g.rules) ? g.rules : []).slice(0, 8).map(function (r, i) { return okRule({ id: r && typeof r.id === "string" && IDRE.test(r.id) ? r.id : "b" + i, name: r && r.name, summary: r && r.summary, code: r && r.code, p: r && r.p, src: "" }); }).filter(function (r) { if (!r || seen[r.id]) return false; seen[r.id] = 1; return true; }),
      src: hub ? "hub" : "mine" };
    if (hub) { o.foreign = true; o.from = fromOf(g.from); }
    return o;
  }
  function okSet(s) {
    if (!s || typeof s !== "object") return null;
    var T = Math.round(+s.T), K = Math.round(+s.K), seed = Math.round(+s.seed);
    return { p: okP(s.p), T: T >= 1 && T <= 2000 ? T : 20, K: K >= 20 && K <= 20000 ? K : 2000, seed: seed >= 0 && seed <= 999999 ? seed : 7, pick: Array.isArray(s.pick) ? s.pick.filter(function (x) { return typeof x === "string" && IDRE.test(x); }).slice(0, MAXR) : null };
  }
  try {
    var o0 = JSON.parse(localStorage.getItem(KEY) || "null");
    if (o0 && o0.v === 1) {
      if (o0.tab === "game" || o0.tab === "world") store.tab = o0.tab;
      if (Array.isArray(o0.worlds)) store.worlds = o0.worlds.map(okWorld).filter(Boolean).slice(0, 30);
      if (Array.isArray(o0.games)) store.games = o0.games.map(okGame).filter(Boolean).slice(0, 20);
      if (o0.extra && typeof o0.extra === "object") Object.keys(o0.extra).slice(0, 60).forEach(function (gid) { if (!IDRE.test(gid) || !Array.isArray(o0.extra[gid])) return; var L = o0.extra[gid].map(okRule).filter(function (r) { return r && r.src; }).slice(0, 30); if (L.length) store.extra[gid] = L; });
      if (o0.sets && typeof o0.sets === "object") Object.keys(o0.sets).slice(0, 60).forEach(function (gid) { var s = okSet(o0.sets[gid]); if (IDRE.test(gid) && s) store.sets[gid] = s; });
    }
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
  A.shopStore = function () { return store; };
  function newId(pre) { return pre + "-" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }
  function libWorlds() { return SH.worlds.map(function (w) { return { id: w.id, name: w.name, summary: w.summary, code: w.code, schema: w.schema.map(function (q) { return Object.assign({}, q); }), K: w.K, T: w.T, explain: w.explain, src: "" }; }); }
  function libGames() { return SH.games.map(function (g) { return { id: g.id, name: g.name, summary: g.summary, about: g.about, code: g.code, p: Object.assign({}, g.p), T: g.T, rules: g.rules.map(function (r) { return { id: r.id, name: r.name, summary: r.summary, code: r.code, p: Object.assign({}, r.p), src: "" }; }), src: "" }; }); }
  function allWorlds() { return libWorlds().concat(store.worlds); }
  function allGames() { return libGames().concat(store.games); }
  /** 自己的玩法：规则全放在玩法里，都能改、能删，贴到 GitHub 时一起带走。样板和别人的玩法：自带的规则只能看，你加的规则另放在 extra 里 */
  function owns(g) { return g.src === "mine"; }
  function rulesOf(g) { return owns(g) ? g.rules : g.rules.concat(store.extra[g.id] || []); }
  /** 存一条规则；满了返回 false */
  function putRule(g, r) {
    var L = owns(g) ? g.rules : (store.extra[g.id] || (store.extra[g.id] = [])), cap = owns(g) ? 8 : 30, i = -1, s = setOf(g);
    r.src = owns(g) ? "" : r.src || "mine";
    L.forEach(function (x, k) { if (x.id === r.id) i = k; });
    if (i >= 0) L[i] = r; else { if (L.length >= cap) return false; L.push(r); if (s.pick.indexOf(r.id) < 0 && s.pick.length < MAXR) s.pick.push(r.id); }
    save(); return true;
  }
  function dropRule(g, id) {
    if (owns(g)) g.rules = g.rules.filter(function (x) { return x.id !== id; });
    else { store.extra[g.id] = (store.extra[g.id] || []).filter(function (x) { return x.id !== id; }); if (!store.extra[g.id].length) delete store.extra[g.id]; }
    var s = setOf(g); s.pick = s.pick.filter(function (x) { return x !== id; }); save();
  }
  function setOf(g) {
    var s = store.sets[g.id]; if (!s) s = store.sets[g.id] = { p: Object.assign({}, g.p), T: g.T, K: 2000, seed: 7, pick: null };
    var ids = rulesOf(g).map(function (r) { return r.id; });
    s.pick = s.pick ? s.pick.filter(function (id) { return ids.indexOf(id) >= 0; }) : g.rules.map(function (r) { return r.id; }).slice(0, MAXR);
    return s;
  }
  function tagOf(x) { return x.src === "hub" ? h("span", { class: "tag", text: "别人写的" + (x.from && x.from.user ? " @" + x.from.user : "") }) : x.src === "mine" ? h("span", { class: "tag", text: "我的" }) : h("span", { class: "tag", text: "样板" }); }
  function foreignNote(x, lead, tail, id) { return h("p", { class: "note", id: id || null }, lead, x.from && x.from.user ? ["（", h("a", { href: x.from.url, target: "_blank", rel: "noopener", text: "@" + x.from.user }), "）"] : null, tail); }

  /* ---------- 参数的两种写法 ---------- */
  var NUM = "-?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?";
  function pLine(p) { return Object.keys(p).map(function (k) { return k + " = " + +(+p[k]).toFixed(6); }).join(", "); }
  /** "d = 10, up = 2" → { d: 10, up: 2 }；写法不对时返回 null */
  function parseP(text) {
    var o = {}, parts = String(text || "").split(/[,，;；\n]+/).map(function (s) { return s.trim(); }).filter(Boolean), re = new RegExp("^([A-Za-z_][A-Za-z0-9_]{0,23})\\s*[=\\uFF1D:\\uFF1A]\\s*(" + NUM + ")$", "i"), i;   // 全角的等号、冒号也认
    if (parts.length > 12) return null;
    for (i = 0; i < parts.length; i++) { var m = re.exec(parts[i]); if (!m || !isFinite(+m[2])) return null; o[m[1]] = +m[2]; }
    return o;
  }
  function nice(x) { var e = Math.pow(10, Math.floor(Math.log(x) / Math.LN10)), m = x / e; return +((m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e).toPrecision(6); }
  function schemaText(L) { return L.map(function (q) { var lab = String(q.label || "").replace(/\s+/g, " ").trim(); return q.key + " = " + +(+q.def).toPrecision(8) + " [" + q.min + ", " + q.max + "]" + (lab && lab !== q.key ? " " + lab : ""); }).join("\n"); }
  /** 世界的参数表，每行一个："sigma = 0.2 [0.02, 1] 年化波动"。范围和说明可以不写。写法不对时返回 null */
  function parseSchema(text) {
    var out = [], seen = {}, lines = String(text || "").split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean), i;
    var re = new RegExp("^([A-Za-z_][A-Za-z0-9_]{0,23})\\s*[=\\uFF1D]\\s*(" + NUM + ")\\s*(?:[\\[\\uFF3B]\\s*(" + NUM + ")\\s*[,\\uFF0C]\\s*(" + NUM + ")\\s*[\\]\\uFF3D])?\\s*(.*)$", "i");   // 全角的等号、方括号、逗号也认
    if (lines.length > 12) return null;
    for (i = 0; i < lines.length; i++) {
      var m = re.exec(lines[i]); if (!m || seen[m[1]]) return null;
      var def = +m[2], min, max;
      if (m[3] != null) { min = +m[3]; max = +m[4]; } else if (def > 0) { min = 0; max = nice(3 * def); } else if (def < 0) { max = nice(-3 * def); min = -max; } else { min = -1; max = 1; }
      if (![def, min, max].every(isFinite) || !(max > min) || def < min || def > max) return null;
      seen[m[1]] = 1; out.push({ key: m[1], label: A.cleanText(m[5], 40) || m[1], def: def, min: min, max: max, step: nice((max - min) / 100), type: "num" });
    }
    return out;
  }
  /** 代码开头的注释里要是照"// 名字 = 默认值 [最小, 最大] 含义"写了参数，就读出来（让 AI 写的世界一贴就能用） */
  function schemaFromCode(code) {
    var L = String(code || "").split("\n").map(function (s) { var m = /^\s*\/\/\s*(.+)$/.exec(s); return m ? m[1].trim() : ""; }).filter(function (s) { return /^[A-Za-z_][A-Za-z0-9_]{0,23}\s*[=＝]\s*-?[\d.]/.test(s); }).slice(0, 12);
    return L.length ? parseSchema(L.join("\n")) : null;
  }

  /* ---------- 说明文字：接口，和复制给 AI 的那一段 ---------- */
  var RNG_DOC = "rng.u() 给 0 到 1 之间的均匀数；rng.normal() 标准正态；rng.uniform(a, b)；rng.exp(rate)；rng.t(nu)；rng.gamma(k)；rng.poisson(lam)；rng.bernoulli(q) 给 0 或 1；rng.int(n) 给 0 到 n−1 的整数";
  function worldDoc() {
    return [
      "function simulate(T, rng, p, K)   必须有。每条路径调用一次，返回 T+1 个数：每个都是有限的正的价格，第 0 个是起始价（一般取 100）。",
      "T          一条路径几步",
      "K          每年几步。按年给的量要自己换算到每一步：一步的时间是 1/K",
      "p          参数，就是你在\"参数\"一栏里写的那些（p.sigma 这样用）",
      "rng        这条路径专用的随机数，每条路径互相独立、可以复现。不要用 Math.random",
      "           " + RNG_DOC
    ].join("\n");
  }
  function gameDoc() {
    return [
      "function deal(T, rng, p)      必须有。发牌：每一局开始时调用一次，返回这一局藏起来的东西 G（一个对象）。规则看不到 G。",
      "function show(G, t)           可以没有。亮牌：每回合开始时调用，返回规则这一回合能看到的东西：一个数、一个数组，或者只有一层的对象。",
      "function referee(G, t, a)     必须有。判分：规则报出动作 a 之后调用，返回这一回合的得分（一个有限的数）。",
      "                              规则报的不是数时 a 是 NaN。可以在 G 上记账；把 G.over 设成 true，这一局到此为止。",
      "T          一局最多几回合；t 是第几回合，从 0 起",
      "p          玩法的参数，就是你在\"参数\"一栏里写的那些（只读）",
      "rng        这一局专用的随机数。" + RNG_DOC + "。后面的回合还要用，就把 rng 存进 G",
      "一局的得分 = 各回合得分加起来。每条规则各打同样的几局，第 k 局发给每条规则的是同一副牌。"
    ].join("\n");
  }
  function ruleDoc() {
    return [
      "function decide(s, p, st)   必须有。每个回合调用一次，返回一个数：这一回合的动作。哪个数代表什么，看这套玩法的说明。",
      "function init(p)            可以没有。每一局开始时调用一次，返回的对象就是 decide 的第三个参数 st。",
      "s.see      这一回合裁判亮给你看的东西",
      "s.t  s.T   这是第几回合（从 0 起）、一局最多几回合",
      "s.last     上一回合的得分（第一回合是 NaN）",
      "s.total    这一局到目前为止的得分",
      "s.g        玩法的参数（只读）",
      "s.rnd()    给一个 0 到 1 之间的均匀随机数",
      "p          你在\"参数\"一栏里写的那些数（只读）"
    ].join("\n");
  }
  function worldPrompt(code, parText) {
    return ["请替我写一个\"世界\"：一段生成价格路径的 JavaScript 代码，用在一个模拟实验室里，让各种交易规则在上面回测。只回一段代码，不要解释。", "", "接口：", worldDoc(), "",
      "要求：只定义 simulate（里面可以有辅助函数），不要有别的顶层语句；不要用 eval、不要联网；计算量适中，它会被调用上千次。", "在代码开头用注释把参数列出来，每行一个，照这个样子写：// sigma = 0.2 [0.02, 1] 年化波动",
      code ? "\n我现在的代码（请在它的基础上改）：\n" + code + (parText ? "\n参数：\n" + parText : "") : "", "", "我的想法："].join("\n");
  }
  function gamePrompt(code, about) {
    return ["请替我写一套\"玩法\"：一个回合制的小游戏，连同它的裁判，用 JavaScript 写。别人会写规则来玩它。只回一段代码，不要解释。", "", "接口（三个函数合起来就是裁判）：", gameDoc(), "",
      "来玩的规则长这样：", ruleDoc(), "",
      "要求：只定义 deal、show、referee（里面可以有辅助函数），不要有别的顶层语句；不要用 eval、不要联网。", "在代码开头用注释写清楚怎么玩：规则看到的是什么，报哪个数代表什么动作，怎么得分。",
      code ? "\n我现在的代码（请在它的基础上改）：\n" + code : "", about ? "\n现在的玩法说明：\n" + about : "", "", "我的想法："].join("\n");
  }
  function rulePrompt(g, r) {
    return ["请替我写一条规则，用来玩下面这套回合制的玩法。只回一段 JavaScript 代码，不要解释。", "", "玩法：" + g.name, g.about || g.summary || "", "",
      "裁判的代码（规则看不到 G，只看得到 show 返回的东西）：", g.code, "", "接口：", ruleDoc(), "",
      "要求：只定义 decide（需要的话加 init），不要有别的顶层语句；不要用 eval、不要联网；参数都从 p 里读。",
      r ? "\n我现在的代码（请在它的基础上改）：\n" + r.code + (Object.keys(r.p).length ? "\n参数：" + pLine(r.p) : "") : "", "", "我的想法："].join("\n");
  }

  /** 每日一题（app-quest.js）也要用的几样：参数的写法、规则的接口说明、把"规则看到的东西"写成一行字 */
  A.shopKit = { pLine: pLine, parseP: parseP, ruleDoc: ruleDoc, seeText: function (v) { return seeText(v); } };

  /* ---------- 从 GitHub 上找一类东西 ---------- */
  /** o: { title, kind, pick(item) → 收拾好的东西或 null, have(obj) → 是不是已经有了, add(obj), empty, addText, how } */
  function finder(o) {
    var box = h("div", { class: "db", id: "shFind" }), alive = true;
    var m = A.modal(o.title, box, { cls: "dbm", onClose: function () { alive = false; } });
    function paint(st) {
      clear(box);
      box.appendChild(h("div", { class: "row tight db-head" }, h("span", { class: "sp" }), h("button", { class: "btn small", type: "button", id: "shFindRefresh", disabled: st.loading, text: st.loading ? "正在取…" : "刷新", onclick: function () { load(true); } })));
      if (st.err) box.appendChild(h("div", { class: "warn", id: "shFindErr", text: st.err.limited ? "GitHub 限制了这个网络的访问次数（不登录每小时 60 次）。过一会儿再刷新。" : "连不上 GitHub，暂时看不了。" }));
      if (!st.loading && !st.rows.length && !st.err) box.appendChild(h("p", { class: "db-say", id: "shFindEmpty", text: o.empty }));
      st.rows.forEach(function (x) {
        var have = o.have(x.obj);
        box.appendChild(h("div", { class: "ar-found", "data-n": x.item.n }, h("div", { class: "ar-ftxt" }, h("b", { text: x.obj.name }), " ", h("a", { href: x.item.url, target: "_blank", rel: "noopener", text: "@" + x.item.user }), x.item.up ? h("span", { class: "note", text: " 👍 " + x.item.up }) : null, x.obj.summary ? h("div", { class: "note", text: x.obj.summary }) : null),
          h("button", { class: "btn small" + (have ? "" : " primary"), type: "button", "data-add": x.item.n, disabled: have, text: have ? "已经载入了" : o.addText, onclick: function () { o.add(x.obj); paint(st); } })));
      });
      box.appendChild(h("p", { class: "note db-how", text: o.how + "想给哪一份打分，点它后面的用户名，去那条 Issue 上点 👍。" }));
    }
    function load(fresh) {
      paint({ loading: true, rows: [], err: null });
      QLHub.list({ kind: o.kind, fresh: !!fresh }).then(function (res) {
        if (!alive) return;
        var rows = res.items.map(function (it) { var x = o.pick(it); return x ? { item: it, obj: x } : null; }).filter(Boolean).sort(function (a, b) { return b.item.up - a.item.up || b.item.at - a.item.at; }).slice(0, 60);
        paint({ loading: false, rows: rows, err: res.stale ? res.error : null });
      }, function (e) { if (alive) paint({ loading: false, rows: [], err: e || {} }); });
    }
    load(false);
    return m;
  }
  var HOW = "别人写的代码在隔离环境里运行，碰不到这张页面里的东西，也连不了网。";

  /* ================= 世界 ================= */
  /** 把一个世界设成实验室当前的世界（"自定义世界"那一格） */
  function useWorld(w) {
    // 实验室里"自定义世界"只有一格。里面原来那个要是工坊里没有（比如 AI 刚替你写的），先收进工坊，免得被这一下盖掉
    var kept = S.custom && S.custom.code !== w.code && !sameWorld(S.custom) ? grabCustom() : null;
    var defs = {}; w.schema.forEach(function (q) { defs[q.key] = q.def; });
    var c = { name: w.name, summary: w.summary, code: w.code, schema: w.schema.map(function (q) { return Object.assign({}, q); }), explain: w.explain || "" };
    if (w.foreign) { c.foreign = true; c.from = w.from || null; }
    S.custom = c; S.wparams.custom = defs;
    A.setWorldType("custom", true);
    S.world.K = w.K; S.world.T = w.T;
    A.renderWorld(); A.renderSettings(); A.renderStrat(); A.worldChanged(true); A.persist();
    A.toast("实验室现在用的世界是「" + w.name + "」。" + (kept ? "原来那个自定义世界「" + kept.name + "」已经收进工坊。" : "") + (w.foreign ? "别人写的代码在隔离环境里运行。" : ""), kept ? 6000 : 4200);
  }
  A.shopUseWorld = useWorld;
  function sameWorld(c) { return !!c && allWorlds().some(function (w) { return w.code === c.code; }); }
  /** 实验室里那个自定义世界（AI 写的，或者你自己改的）收进工坊 */
  function grabCustom() {
    var c = S.custom; if (!c || !okCode(c.code)) return null;
    var w = okWorld({ id: newId("w"), name: c.name, summary: c.summary, code: c.code, schema: c.schema, K: S.world.type === "custom" ? S.world.K : 252, T: S.world.type === "custom" ? S.world.T : 252, explain: c.explain, src: c.foreign ? "hub" : "mine", from: c.from });
    if (w) { store.worlds.push(w); if (store.worlds.length > 30) store.worlds.shift(); save(); }
    return w;
  }

  function openWorld(w, after) {
    var isLib = !w.src && !w.fresh, mine = w.src === "mine", ro = w.src === "hub", job = null, chart = null, alive = true;   // fresh：从样板新写的，还没存过
    var name = h("input", { type: "text", id: "shWName", maxlength: 40, value: isLib ? w.name + "（改）" : w.name, "aria-label": "名字", disabled: ro });
    var sum = h("input", { type: "text", id: "shWSum", maxlength: 200, value: w.summary, "aria-label": "一句话说明", disabled: ro });
    var par = h("textarea", { id: "shWPar", class: "num sh-par", rows: Math.max(2, Math.min(6, w.schema.length + 1)), spellcheck: "false", "aria-label": "参数", placeholder: "每行一个，比如：\nsigma = 0.2 [0.02, 1] 年化波动", readonly: ro }); par.value = schemaText(w.schema);
    var kIn = h("input", { type: "number", id: "shWK", min: 1, max: 100000, step: 1, value: w.K, "aria-label": "每年几步", disabled: ro }), tIn = h("input", { type: "number", id: "shWT", min: 10, max: 4000, step: 1, value: w.T, "aria-label": "一条路径几步", disabled: ro });
    var ta = h("textarea", { class: "codeedit", id: "shWCode", spellcheck: "false", "aria-label": "世界的代码", readonly: ro }); ta.value = w.code;
    var err = h("div", { class: "warn err", id: "shWErr", hidden: true }), out = h("div", { class: "ar-out", id: "shWOut" });
    function fail(msg) { err.hidden = false; err.textContent = msg; }
    function read() {
      if (ro) return Object.assign({}, w);                       // 别人的世界改不了：原样用，不重新解析
      var code = ta.value, bad = QLJobs.syntax(code), sch, K = Math.round(+kIn.value), T = Math.round(+tIn.value);
      if (!par.value.trim()) { sch = schemaFromCode(code); if (sch) par.value = schemaText(sch); else sch = []; } else sch = parseSchema(par.value);
      if (!A.cleanText(name.value, 40)) return "先给它起个名字。";
      if (!sch) return "参数的写法不对。每行一个，照这个样子写：sigma = 0.2 [0.02, 1] 年化波动（方括号里是最小值和最大值，默认值要在这个范围里）。";
      if (bad) return "代码有语法错误：" + bad;
      if (!/\bfunction\s+simulate\s*\(/.test(code)) return "代码里要有 function simulate(T, rng, p, K)。";
      if (code.length > 20000) return "代码太长了（上限两万字）。";
      if (!(K >= 1 && K <= 100000)) return "每年几步要在 1 到 100000 之间。";
      if (!(T >= 10 && T <= 4000)) return "一条路径的步数要在 10 到 4000 之间。";
      return { id: mine ? w.id : newId("w"), name: A.cleanText(name.value, 40), summary: A.cleanText(sum.value, 200), code: code, schema: sch, K: K, T: T, explain: w.explain || "", src: "mine" };
    }
    function stop() { if (job) { job.cancel(); job = null; } }
    function tryIt() {
      var r = read(); err.hidden = true; clear(out); if (chart) { chart.destroy(); chart = null; }
      if (typeof r === "string") { fail(r); return; }
      var defs = {}; r.schema.forEach(function (q) { defs[q.key] = q.def; });
      out.appendChild(h("p", { class: "note", id: "shWProg", text: "正在生成路径…" }));
      stop();
      var j = job = QLJobs.run({ kind: "world", codes: [{ id: "w", code: r.code, mine: !w.foreign }], timeout: A.shopOpt.timeout, data: { id: "w", p: defs, T: r.T, K: r.K, N: 400, seed: 7 } });
      j.promise.then(function (res) { if (job === j) job = null; if (!alive) return; clear(out); showWorld(res); },
        function (e) {
          if (job === j) job = null; if (!alive || (e && e.cancelled)) return; clear(out);
          fail(e && e.timeout ? "跑了很久也没有结果，已经停掉：多半是代码里有死循环。" : e && e.compile ? "代码有语法错误" + (e.line ? "（第 " + e.line + " 行）" : "") + "：" + e.message : "没有跑通：" + (e && e.message || "出错了"));
        });
    }
    function showWorld(r) {
      out.appendChild(h("p", { class: "db-say", id: "shWSay", text: "生成了 " + r.N + " 条路径，每条 " + r.T + " 步（每年 " + r.K + " 步）。把每一步的收益换算成一年：平均 " + P(r.annMean, 1) + "，波动 " + P(r.annVol, 1) + "。相邻两步收益的相关系数是 " + F(r.acf1, 3) + "；单步涨得最多的一次是 " + P(r.max, 2) + "，跌得最多的一次是 " + P(-r.min, 2) + "。" }));
      var host2 = h("div", { class: "hp-chart", id: "shWChart" }); out.appendChild(host2);
      chart = new QLChart.Chart(host2, { height: 240 });
      chart.set({ height: 240, x: { label: "步", domain: [0, r.T] }, legend: [{ name: "中位数", color: "s1" }, { name: "几条样本路径，和 5% 到 95% 的范围", color: "s1", mark: "band" }],
        panels: [{ y: { label: "价格" }, layers: [{ kind: "band", x: r.grid, lo: r.q5, hi: r.q95, color: "s1", alpha: 0.1 }, { kind: "lines", x: r.grid, ys: r.paths, color: "s1", alpha: 0.3, width: 1 }, { kind: "line", x: r.grid, y: r.q50, color: "s1", name: "中位数" }] }] });
    }
    var foot = [h("button", { class: "btn", type: "button", id: "shWAi", text: "复制给 AI 的说明", title: "把接口、要求和现在的代码复制下来，贴给任何一个 AI，让它替你写", onclick: function () { A.copy(worldPrompt(ta.value, par.value.trim())); } })];
    if (!ro) {
      foot.push(h("button", { class: "btn", type: "button", id: "shWPost", text: "贴到 GitHub", onclick: function () {
        var r = read(); if (typeof r === "string") { fail(r); return; }
        A.postDialog({ kind: "world", title: r.name, meta: { kind: "world", name: r.name, summary: r.summary, params: r.schema, K: r.K, T: r.T, explain: r.explain }, code: r.code });
      } }));
      foot.push(h("button", { class: "btn", type: "button", id: "shWSave", text: isLib ? "另存成我的" : "保存", onclick: function () { var r = keep(); if (r) { m.close(); if (after) after(r); } } }));
    } else foot.push(h("button", { class: "btn", type: "button", id: "shWFork", text: "另存成我的再改", onclick: function () { m.close(); openWorld({ id: "", name: w.name + "（改）", summary: w.summary, code: w.code, schema: w.schema, K: w.K, T: w.T, explain: "", src: "", fresh: true }, after); } }));
    foot.push(h("button", { class: "btn primary", type: "button", id: "shWUse", text: "拿到实验室里用", title: "把它设成实验室当前的世界，任何一条规则都可以在上面回测", onclick: function () {
      var same = ta.value === w.code && par.value === schemaText(w.schema) && +kIn.value === w.K && +tIn.value === w.T, r;
      if (ro || (isLib && same)) r = w;                                   // 别人的、没动过的样板：原样拿去
      else if (mine) { r = keep(); if (!r) return; }                      // 自己的：先存再用
      else { r = read(); if (typeof r === "string") { fail(r); return; } }   // 改过的样板、还没存的新世界：照现在写的用，存不存由你
      m.close(); if (after) after(r, true); useWorld(r);
    } }));
    /** 存下来（自己的世界原地改，样板和新写的另存一份）；写得不对时返回 null */
    function keep() {
      var r = read(); if (typeof r === "string") { fail(r); return null; }
      var i = -1; store.worlds.forEach(function (x, k) { if (x.id === r.id) i = k; });
      if (i >= 0) store.worlds[i] = r; else { store.worlds.push(r); if (store.worlds.length > 30) store.worlds.shift(); }
      save(); return r;
    }
    var m = A.modal((ro ? "别人写的世界" : isLib ? "样板世界" : "我的世界") + " · " + w.name, [
      ro ? foreignNote(w, "这个世界是别人写的", "，这里只能看。试的时候、拿到实验室里用的时候，它都在隔离环境里运行。", "shWForeign") : isLib ? h("p", { class: "note", text: "样板本身不能改。改完点\"另存成我的\"，它就成了你自己的一个世界。" }) : null,
      h("div", { class: "ar-form" }, h("label", { for: "shWName", text: "名字" }), name, h("label", { for: "shWSum", text: "一句话说明" }), sum, h("label", { for: "shWPar", text: "参数" }), par,
        h("label", { for: "shWK", text: "每年几步" }), h("div", { class: "row tight sh-two" }, kIn, h("span", { class: "sh-pair" }, h("label", { for: "shWT", text: "一条路径几步" }), tIn))),
      ta, err,
      h("div", { class: "row tight" }, h("button", { class: "btn", type: "button", id: "shWTry", text: "试一试", title: "用默认参数生成 400 条路径，看看它长什么样", onclick: tryIt })),
      out,
      w.explain ? h("details", { class: "more" }, h("summary", { text: "这个世界的说明" }), explainBox(w)) : null,
      h("details", { class: "more" }, h("summary", { text: "世界的代码怎么写" }), h("div", { class: "more-body" }, h("pre", { class: "code", id: "shWDoc", text: worldDoc() })))
    ], { cls: "are", foot: foot, focus: "#shWCode", onClose: function () { alive = false; stop(); if (chart) chart.destroy(); } });
    return m;
  }
  /** 世界的说明。自己的、样板的（多半是 AI 写的，带公式）照手册那样排版；别人写的只当文字看 */
  function explainBox(w) {
    var d = h("div", { class: "more-body" + (w.src === "hub" ? " sh-about" : ""), id: "shWExplain" });
    if (w.src === "hub" || typeof QLMD === "undefined") d.textContent = w.explain; else QLMD.mount(d, w.explain);
    return d;
  }
  function hubWorld(it) { var m = it.meta; return okWorld({ id: "hub-w" + it.n, name: m.name, summary: m.summary, code: it.code, schema: m.params, K: m.K, T: m.T, explain: m.explain, src: "hub", from: { user: it.user, n: it.n } }); }

  /* ================= 玩法 ================= */
  function hubGame(it) { var m = it.meta; return okGame({ id: "hub-g" + it.n, name: m.name, summary: m.summary, about: m.about, code: it.code, p: m.p, T: m.T, rules: m.rules, src: "hub", from: { user: it.user, n: it.n } }); }
  function seeText(v) {
    if (typeof v === "number") return v === v ? String(+v.toPrecision(6)) : "—";
    var s; try { s = JSON.stringify(v, function (k, x) { return typeof x === "number" ? (x === x ? +x.toPrecision(5) : null) : x; }); } catch (e) { s = String(v); }
    return s.length > 80 ? s.slice(0, 77) + "…" : s;
  }

  /** 写玩法的裁判 */
  function openGameEditor(g, after) {
    var isLib = !g.src && !g.fresh, mine = g.src === "mine", ro = g.src === "hub";
    var name = h("input", { type: "text", id: "shGName", maxlength: 40, value: isLib ? g.name + "（改）" : g.name, "aria-label": "名字", disabled: ro });
    var sum = h("input", { type: "text", id: "shGSum", maxlength: 200, value: g.summary, "aria-label": "一句话说明", disabled: ro });
    var about = h("textarea", { id: "shGAbout", class: "sh-par", rows: 4, maxlength: 4000, "aria-label": "怎么玩", placeholder: "写给人看的：规则每回合看到什么，报哪个数代表什么动作，怎么得分。", readonly: ro }); about.value = g.about || "";
    var par = h("input", { type: "text", id: "shGPar", class: "num", value: pLine(g.p), placeholder: "比如 lo = 0.2, hi = 0.8（没有就留空）", "aria-label": "参数", spellcheck: "false", disabled: ro });
    var tIn = h("input", { type: "number", id: "shGT0", min: 1, max: 2000, step: 1, value: g.T, "aria-label": "一局最多几回合", disabled: ro });
    var ta = h("textarea", { class: "codeedit", id: "shGCode0", spellcheck: "false", "aria-label": "裁判的代码", readonly: ro }); ta.value = g.code;
    var err = h("div", { class: "warn err", id: "shGErr", hidden: true });
    function fail(msg) { err.hidden = false; err.textContent = msg; }
    function read() {
      var p = parseP(par.value), code = ta.value, bad = QLJobs.syntax(code), T = Math.round(+tIn.value);
      if (!A.cleanText(name.value, 40)) return "先给它起个名字。";
      if (!p) return "参数的写法不对。照这个样子写：lo = 0.2, hi = 0.8（名字用字母，值是数）。";
      if (bad) return "代码有语法错误：" + bad;
      if (!/\bfunction\s+deal\s*\(/.test(code) || !/\bfunction\s+referee\s*\(/.test(code)) return "代码里要有 function deal(T, rng, p) 和 function referee(G, t, a)。";
      if (code.length > 20000) return "代码太长了（上限两万字）。";
      if (!(T >= 1 && T <= 2000)) return "一局的回合数要在 1 到 2000 之间。";
      return { id: mine ? g.id : newId("g"), name: A.cleanText(name.value, 40), summary: A.cleanText(sum.value, 200), about: about.value.slice(0, 4000).trim(), code: code, p: p, T: T,
        rules: mine ? g.rules : rulesOf(g).filter(function (r) { return !r.foreign; }).slice(0, 8).map(function (r, i) { return { id: "b" + i, name: r.name, summary: r.summary, code: r.code, p: Object.assign({}, r.p), src: "" }; }), src: "mine" };
    }
    var foot = [h("button", { class: "btn", type: "button", id: "shGAi", text: "复制给 AI 的说明", title: "把接口、要求和现在的代码复制下来，贴给任何一个 AI，让它替你写", onclick: function () { A.copy(gamePrompt(ta.value, about.value.trim())); } })];
    if (!ro) {
      foot.push(h("button", { class: "btn", type: "button", id: "shGPost", text: "贴到 GitHub", title: "连裁判带规则一起贴上去", onclick: function () {
        var r = read(); if (typeof r === "string") { fail(r); return; }
        var rules = r.rules.slice(0, 8).map(function (x) { return { name: x.name, summary: x.summary, p: x.p, code: x.code }; });
        A.postDialog({ kind: "game", title: r.name, meta: { kind: "game", name: r.name, summary: r.summary, about: r.about, p: r.p, T: r.T, rules: rules }, code: r.code });
      } }));
      foot.push(h("button", { class: "btn primary", type: "button", id: "shGSave", text: isLib ? "另存成我的" : "保存", onclick: function () {
        var r = read(); if (typeof r === "string") { fail(r); return; }
        var i = -1; store.games.forEach(function (x, k) { if (x.id === r.id) i = k; });
        if (i >= 0) { store.games[i] = r; delete store.sets[r.id]; } else { store.games.push(r); if (store.games.length > 20) { var old = store.games.shift(); delete store.extra[old.id]; delete store.sets[old.id]; } }
        save(); m.close(); if (after) after(r);
      } }));
    } else foot.push(h("button", { class: "btn primary", type: "button", id: "shGFork", text: "另存成我的再改", title: "只带走裁判的代码。它自带的规则不跟过来，另存之后自己再写", onclick: function () { m.close(); openGameEditor({ id: "", name: g.name + "（改）", summary: g.summary, about: g.about, code: g.code, p: g.p, T: g.T, rules: [], src: "", fresh: true }, after); } }));
    var m = A.modal((ro ? "别人写的玩法" : isLib ? "样板玩法" : "我的玩法") + " · 裁判", [
      ro ? foreignNote(g, "这套玩法是别人写的", "，这里只能看。比的时候它在隔离环境里运行。", "shGForeign") : isLib ? h("p", { class: "note", text: "样板本身不能改。改完点\"另存成我的\"，它就成了你自己的一套玩法，自带的规则也一起带过去。" }) : null,
      h("div", { class: "ar-form" }, h("label", { for: "shGName", text: "名字" }), name, h("label", { for: "shGSum", text: "一句话说明" }), sum, h("label", { for: "shGAbout", text: "怎么玩" }), about, h("label", { for: "shGPar", text: "参数" }), par, h("label", { for: "shGT0", text: "一局最多几回合" }), h("div", { class: "row tight sh-two" }, tIn)),
      ta, err,
      h("details", { class: "more" }, h("summary", { text: "裁判的代码怎么写" }), h("div", { class: "more-body" }, h("pre", { class: "code", id: "shGDoc", text: gameDoc() })))
    ], { cls: "are", foot: foot, focus: "#shGCode0" });
    return m;
  }

  /** 给一套玩法写规则 / 看规则 */
  function openRule(g, rule, after) {
    var own = owns(g) && !rule.fresh, bundled = !rule.src && !rule.fresh && !own, mine = rule.src === "mine" || own, ro = rule.src === "hub" || (bundled && g.src === "hub"), hubN = g.from && g.from.n;   // own：自己的玩法里的规则
    var name = h("input", { type: "text", id: "shRName", maxlength: 40, value: bundled && !ro ? rule.name + "（改）" : rule.name, "aria-label": "名字", disabled: ro });
    var sum = h("input", { type: "text", id: "shRSum", maxlength: 200, value: rule.summary, "aria-label": "一句话说明", disabled: ro });
    var par = h("input", { type: "text", id: "shRPar", class: "num", value: pLine(rule.p), placeholder: "比如 c = 20（没有就留空）", "aria-label": "参数", spellcheck: "false", disabled: ro });
    var ta = h("textarea", { class: "codeedit", id: "shRCode", spellcheck: "false", "aria-label": "规则的代码", readonly: ro }); ta.value = rule.code;
    var err = h("div", { class: "warn err", id: "shRErr", hidden: true });
    function fail(msg) { err.hidden = false; err.textContent = msg; }
    function read() {
      var p = parseP(par.value), code = ta.value, bad = QLJobs.syntax(code);
      if (!A.cleanText(name.value, 40)) return "先给它起个名字。";
      if (!p) return "参数的写法不对。照这个样子写：c = 20, up = 2（名字用字母，值是数）。";
      if (bad) return "代码有语法错误：" + bad;
      if (!/\bfunction\s+decide\s*\(/.test(code)) return "代码里要有 function decide(s, p, st)。";
      if (code.length > 20000) return "代码太长了（上限两万字）。";
      return { id: mine ? rule.id : newId("r"), name: A.cleanText(name.value, 40), summary: A.cleanText(sum.value, 200), code: code, p: p, src: "mine" };
    }
    var foot = [h("button", { class: "btn", type: "button", id: "shRAi", text: "复制给 AI 的说明", title: "把这套玩法的说明、裁判的代码、接口和现在的代码复制下来，贴给任何一个 AI，让它替你写", onclick: function () { A.copy(rulePrompt(g, { code: ta.value, p: parseP(par.value) || {} })); } })];
    if (!ro) {
      if (hubN) foot.push(h("button", { class: "btn", type: "button", id: "shRPost", text: "贴到 GitHub", title: "贴到这套玩法名下，别人在这套玩法里就能找到它", onclick: function () {
        var r = read(); if (typeof r === "string") { fail(r); return; }
        A.postDialog({ kind: "rule", title: g.name + " · " + r.name, meta: { kind: "rule", for: "game:" + hubN, name: r.name, summary: r.summary, p: r.p }, code: r.code });
      } }));
      foot.push(h("button", { class: "btn primary", type: "button", id: "shRSave", text: bundled ? "另存成我的" : "保存", onclick: function () {
        var r = read(); if (typeof r === "string") { fail(r); return; }
        if (!putRule(g, r)) { fail(owns(g) ? "一套玩法最多带 8 条规则。先删掉一条。" : "这套玩法下面存的规则太多了。先删掉几条。"); return; }
        m.close(); if (after) after(r);
      } }));
    } else foot.push(h("button", { class: "btn primary", type: "button", id: "shRFork", text: "另存成我的再改", onclick: function () { m.close(); openRule(g, { id: "", name: rule.name + "（改）", summary: rule.summary, code: rule.code, p: rule.p, src: "", fresh: true }, after); } }));
    var m = A.modal((ro ? "别人写的规则" : bundled ? "玩法自带的规则" : "我的规则") + " · " + g.name, [
      ro ? foreignNote(rule.src === "hub" ? rule : g, "这条规则是别人写的", "，这里只能看。比的时候它在隔离环境里运行。", "shRForeign") : bundled ? h("p", { class: "note", text: "玩法自带的规则本身不能改。改完点\"另存成我的\"，它就成了你自己的一条。" }) : null,
      h("div", { class: "ar-form" }, h("label", { for: "shRName", text: "名字" }), name, h("label", { for: "shRSum", text: "一句话说明" }), sum, h("label", { for: "shRPar", text: "参数" }), par),
      ta, err,
      !ro && !hubN ? h("p", { class: "note", id: "shRNoPost", text: "这套玩法还只在你这台设备上。想让别人也来写规则，先打开裁判的代码，在那里把玩法贴到 GitHub：你写的规则会跟着一起贴上去。" }) : null,
      h("details", { class: "more" }, h("summary", { text: "规则能用到的东西" }), h("div", { class: "more-body" }, h("pre", { class: "code", id: "shRDoc", text: ruleDoc() })))
    ], { cls: "are", foot: foot, focus: "#shRCode" });
    return m;
  }

  /** 一套玩法：看说明、挑规则、比一比 */
  function openGame(g0, after) {
    var g = g0, job = null, alive = true, last = null;
    var host = h("div", { class: "ar-host sh-host" });
    function stop() { if (job) { job.cancel(); job = null; } }
    var m = A.modal("玩法 · " + g.name, host, { cls: "arm", onClose: function () { alive = false; stop(); if (after) after(); } });
    function refresh(ng) { if (!alive) return; if (ng) { g = ng; last = null; } draw(); }
    function numIn(id, label, key, min, max, step) {
      var s = setOf(g), inp = h("input", { type: "number", id: id, min: min, max: max, step: step, value: s[key], "aria-label": label });
      inp.addEventListener("change", function () { var v = Math.round(parseFloat(inp.value)); if (!(v === v)) v = s[key]; v = Math.min(max, Math.max(min, v)); inp.value = v; s[key] = v; save(); });
      return h("label", { class: "ar-set" }, h("span", { text: label }), inp);
    }
    function draw() {
      clear(host);
      var s = setOf(g), rules = rulesOf(g), pick = s.pick, hubN = g.from && g.from.n;
      if (g.src === "hub") host.appendChild(foreignNote(g, "这套玩法是别人写的", "：裁判和它自带的规则都在隔离环境里运行。", "shGFrom"));
      host.appendChild(h("div", { class: "sh-about", id: "shGAboutText", text: g.about || g.summary || "（这套玩法没有写说明。打开裁判的代码，看它是怎么判分的。）" }));
      var pIn = h("input", { type: "text", id: "shGP", class: "num", value: pLine(s.p), "aria-label": "玩法的参数", spellcheck: "false", placeholder: "没有参数" });
      pIn.addEventListener("change", function () { var p = parseP(pIn.value); if (!p) { pIn.value = pLine(s.p); A.toast("参数的写法不对。照这个样子写：lo = 0.2, hi = 0.8", 3200); return; } s.p = p; pIn.value = pLine(p); save(); });
      host.appendChild(h("div", { class: "row tight ar-sets" }, Object.keys(g.p).length || Object.keys(s.p).length ? h("label", { class: "ar-set sh-gp" }, h("span", { text: "玩法的参数" }), pIn) : null,
        numIn("shGT", "一局最多几回合", "T", 1, 2000, 1), numIn("shGK", "比几局", "K", 20, 20000, 10), numIn("shGSeed", "种子", "seed", 0, 999999, 1)));
      /* 规则的名单 */
      var list = h("div", { class: "ar-list", id: "shRules" });
      rules.forEach(function (r) {
        var on = pick.indexOf(r.id) >= 0, cb = h("input", { type: "checkbox", id: "shPick-" + r.id, checked: on, onchange: function () {
          var i = pick.indexOf(r.id); if (cb.checked && i < 0) { if (pick.length >= MAXR) { cb.checked = false; A.toast("一次最多比 " + MAXR + " 条规则。", 3000); return; } pick.push(r.id); } else if (!cb.checked && i >= 0) pick.splice(i, 1);
          save(); count();
        } });
        list.appendChild(h("div", { class: "ar-rule", "data-rule": r.id }, cb, h("label", { for: "shPick-" + r.id, class: "ar-rtxt" }, h("b", { text: r.name }), r.src === "hub" ? h("span", { class: "tag", text: "别人写的" + (r.from && r.from.user ? " @" + r.from.user : "") }) : r.src ? h("span", { class: "tag", text: "我的" }) : null, h("span", { class: "note", text: (r.summary ? r.summary : "") + (Object.keys(r.p).length ? "（" + pLine(r.p) + "）" : "") })),
          h("button", { class: "btn small", type: "button", "data-code": r.id, text: r.src === "mine" || owns(g) ? "改" : "看代码", onclick: function () { openRule(g, r, function () { refresh(); }); } }),
          r.src || owns(g) ? h("button", { class: "iconbtn", type: "button", "data-del": r.id, "aria-label": "删掉 " + r.name, text: "✕", onclick: function () { dropRule(g, r.id); draw(); } }) : null));
      });
      if (!rules.length) list.appendChild(h("p", { class: "note", id: "shNoRules", text: "这套玩法还没有规则。点下面的\"写一条新规则\"，写第一条。" }));
      host.appendChild(list);
      var cnt = h("span", { class: "note", id: "shCount" }), go = h("button", { class: "btn primary", type: "button", id: "shGRun", text: "比一比", onclick: run });
      function count() { var n = pick.length; cnt.textContent = n ? "挑了 " + n + " 条规则；排在最前面的「" + nameOf(pick[0]) + "」当基准" : "先挑至少一条规则"; go.disabled = n < 1; }
      function nameOf(id) { var x = rules.filter(function (r) { return r.id === id; })[0]; return x ? x.name : id; }
      host.appendChild(h("div", { class: "row tight ar-acts" }, go,
        h("button", { class: "btn", type: "button", id: "shRNew", text: "写一条新规则", onclick: function () { var t = rules[0]; openRule(g, { id: "", name: "我的规则", summary: "", code: t ? t.code : "function decide(s, p, st) {\n  return 0;\n}", p: t ? t.p : {}, src: "", fresh: true }, function () { refresh(); }); } }),
        hubN ? h("button", { class: "btn", type: "button", id: "shRFind", text: "从大家那里找规则", onclick: function () {
          finder({ title: "大家给「" + g.name + "」写的规则", kind: "rule", addText: "请它来比", empty: "还没有人给这套玩法贴过规则。自己写一条，在编辑的地方点\"贴到 GitHub\"。", how: HOW,
            pick: function (it) { return it.meta.for === "game:" + hubN ? okRule({ id: "hub-r" + it.n, name: it.meta.name, summary: it.meta.summary, code: it.code, p: it.meta.p, src: "hub", from: { user: it.user, n: it.n } }) : null; },
            have: function (r) { return (store.extra[g.id] || []).some(function (x) { return x.id === r.id; }); },
            add: function (r) { if (!putRule(g, r)) A.toast("这套玩法下面存的规则太多了。先删掉几条。", 3200); refresh(); } });
        } }) : null,
        h("button", { class: "btn", type: "button", id: "shGCode", text: g.src === "mine" ? "改裁判的代码" : "看裁判的代码", onclick: function () { openGameEditor(g, function (ng) { if (!alive) return; if (ng && ng.id !== g.id) { m.close(); openGame(ng, after); } else refresh(ng); }); } }),
        h("span", { class: "sp" }), cnt));
      count();
      var out = h("div", { class: "ar-out", id: "shGOut" }); host.appendChild(out);
      if (last) show(out, last);

      function run() {
        var chosen = pick.map(function (id) { return rules.filter(function (r) { return r.id === id; })[0]; }).filter(Boolean), bad = QLJobs.syntax(g.code) ? "裁判的代码有语法错误：" + QLJobs.syntax(g.code) : null;
        chosen.forEach(function (r) { if (!bad) { var e = QLJobs.syntax(r.code); if (e) bad = "「" + r.name + "」的代码有语法错误：" + e; } });
        clear(out);
        if (bad) { out.appendChild(h("div", { class: "warn err", id: "shGRunErr", text: bad })); return; }
        go.disabled = true;
        var prog = h("p", { class: "note", id: "shGProg", text: "正在发牌…" }); out.appendChild(prog);
        stop();
        var isForeign = function (r) { return !!r.foreign || (!r.src && !!g.foreign); }, rid = function (r) { return "r:" + r.id; }, byRid = function (id) { return chosen.filter(function (r) { return rid(r) === id; })[0] || null; };
        var j = job = QLJobs.run({ kind: "game", timeout: A.shopOpt.timeout,
          codes: [{ id: "game", code: g.code, mine: !g.foreign }].concat(chosen.map(function (r) { return { id: rid(r), code: r.code, mine: !isForeign(r) }; })),
          data: { game: "game", gp: s.p, T: s.T, K: s.K, seed: s.seed, entries: chosen.map(function (r) { return { id: rid(r), p: r.p }; }) },
          onProgress: function (pm) { var r = byRid(pm.id); if (r) prog.textContent = "第 " + (pm.i + 1) + " / " + pm.n + " 条：" + r.name + "…"; } });
        j.promise.then(function (res) {
          if (job === j) job = null; if (!alive) return;
          last = { res: res, names: chosen.map(function (r) { return { id: rid(r), name: r.name }; }), foreign: !!g.foreign || chosen.some(isForeign) };
          go.disabled = pick.length < 1; clear(out); show(out, last);
        }, function (e) {
          if (job === j) job = null; if (!alive || (e && e.cancelled)) return;
          go.disabled = pick.length < 1; clear(out);
          var who = e && e.id ? byRid(e.id) : null, msg = e && e.message || "出错了";
          if (e && e.timeout && who) { var i = pick.indexOf(who.id); if (i >= 0) pick.splice(i, 1); save(); var c = document.getElementById("shPick-" + who.id); if (c) c.checked = false; count(); msg = "轮到「" + who.name + "」的时候卡住了：多半是它的代码里有死循环（也可能出在裁判的代码里）。已经把它从名单里拿掉，再点一次\"比一比\"。"; }
          else if (e && e.timeout) msg = "跑了很久也没有结果，已经停掉：多半是裁判的代码里有死循环。";
          else if (e && e.compile && e.id === "game") msg = "裁判的代码有语法错误" + (e.line ? "（第 " + e.line + " 行）" : "") + "：" + e.message;
          else if (e && e.compile && who) msg = "「" + who.name + "」的代码有语法错误" + (e.line ? "（第 " + e.line + " 行）" : "") + "：" + e.message;
          else if (e && !e.nostart) msg = "裁判的代码出错了" + (who ? "（当时上场的是「" + who.name + "」）" : "") + "：" + msg;
          out.appendChild(h("div", { class: "warn err", id: "shGRunErr", text: msg }));
        });
      }
    }
    function show(out, L) {
      var res = L.res, nameOf = function (id) { var x = L.names.filter(function (q) { return q.id === id; })[0]; return x ? x.name : id; };
      (res.skipped || []).forEach(function (x) { out.appendChild(h("div", { class: "warn", "data-skip": x.id, text: "「" + nameOf(x.id) + "」没能上场：" + x.err })); });
      if (!res.rows.length) { out.appendChild(h("div", { class: "warn err", id: "shGRunErr", text: "没有能上场的规则。" })); return; }
      var base = res.rows[0], key = function (r) { return r.err || !(r.mean === r.mean) ? -Infinity : r.mean; }, rows = res.rows.slice().sort(function (a, b) { var ka = key(a), kb = key(b); return ka === kb ? 0 : kb > ka ? 1 : -1; }), tb = h("tbody"), rank = 0;
      rows.forEach(function (r) {
        var isBase = r === base;
        tb.appendChild(h("tr", { "data-rule": r.id }, h("td", { class: "num", text: r.err ? "—" : String(++rank) }),
          h("td", null, h("b", { text: nameOf(r.id) }), isBase ? h("span", { class: "tag", text: "基准" }) : null, r.err ? h("span", { class: "note", text: " 中途出错：" + r.err }) : r.bad > 0 ? h("span", { class: "note", text: " 有 " + P(r.bad, 1) + " 的回合报的不是数" }) : null),
          h("td", { class: "num" }, r.err ? "—" : [h("b", { text: F(r.mean, 3) }), h("span", { class: "note", text: " ± " + F(r.se, 3) })]),
          h("td", { class: "num" }, r.err || isBase || !(r.d === r.d) ? "—" : [h("b", { class: "verdict " + (r.d > 2 * r.dse ? "up" : r.d < -2 * r.dse ? "down" : "flat"), text: A.sgn(F(r.d, 3)) }), h("span", { class: "note", text: " ± " + F(r.dse, 3) })]),
          h("td", { class: "num", text: r.err ? "—" : F(r.rounds, 1) })));
      });
      out.appendChild(h("div", { class: "gref" }, h("table", { class: "gtab hp-tab db-tab ar-tab sh-tab", id: "shGTab" },
        h("caption", { text: "每条规则各打 " + res.K + " 局，每局最多 " + res.T + " 回合；第 k 局发给每条规则的是同一副牌。± 后面是标准误。" }),
        h("thead", null, h("tr", null, h("th", { text: "名次" }), h("th", { text: "规则" }), h("th", { text: "平均每局得分" }), h("th", { text: "比基准多" }), h("th", { text: "平均打几回合" }))), tb)));
      if (L.foreign) out.appendChild(h("p", { class: "note", id: "shFun", text: "这里有别人写的代码（裁判或者规则）。它们在隔离环境里运行，偷不走东西；但裁判和规则之间没法完全隔绝，这个结果只图个乐。" }));
      /* 第一局的过程 */
      var tr = (res.trace || []).filter(function (x) { return x.log && x.log.length; });
      if (tr.length) {
        var sel = h("select", { id: "shTraceSel", "aria-label": "看哪条规则的第一局" }, tr.map(function (x) { return h("option", { value: x.id, text: nameOf(x.id) }); })), box = h("div", { class: "gref" });
        var paint = function () {
          var x = tr.filter(function (q) { return q.id === sel.value; })[0] || tr[0], tb2 = h("tbody");
          x.log.forEach(function (o, t) { tb2.appendChild(h("tr", null, h("td", { class: "num", text: String(t + 1) }), h("td", { class: "sh-see", text: seeText(o.see) }), h("td", { class: "num", text: o.a === o.a ? String(+o.a.toPrecision(6)) : "不是数" }), h("td", { class: "num", text: A.sgn(F(o.gain, 3)) }))); });
          clear(box); box.appendChild(h("table", { class: "gtab hp-tab sh-trace", id: "shTraceTab" }, h("thead", null, h("tr", null, h("th", { text: "回合" }), h("th", { text: "规则看到的" }), h("th", { text: "规则报的数" }), h("th", { text: "这一回合的得分" }))), tb2));
        };
        sel.addEventListener("change", paint); paint();
        out.appendChild(h("details", { class: "more", id: "shTrace" }, h("summary", { text: "看第一局是怎么打的" }), h("div", { class: "more-body" }, h("div", { class: "row tight" }, h("label", { for: "shTraceSel", class: "note", text: "哪条规则" }), sel), box, h("p", { class: "note", text: "只列前 30 个回合。写裁判的时候，拿它核对亮出来的东西和判的分对不对。" }))));
      }
    }
    draw();
    return m;
  }

  /* ================= 主弹层 ================= */
  A.openShop = function (tab0) {
    var tab = tab0 === "game" || tab0 === "world" ? tab0 : store.tab, alive = true;
    if (tab !== store.tab) { store.tab = tab; save(); }
    var host = h("div", { class: "ar-host sh-host" }), seg = h("div", { class: "seg", role: "group", "aria-label": "造什么" });
    [["world", "世界"], ["game", "玩法"]].forEach(function (x) { seg.appendChild(h("button", { type: "button", "data-tab": x[0], text: x[1], onclick: function () { if (tab !== x[0]) { tab = x[0]; store.tab = tab; save(); draw(); } } })); });
    var m = A.modal("世界工坊", [
      h("p", { class: "lb-lead", text: "在这里造两样东西：世界（一段生成价格的代码）和玩法（一个发牌、判分的裁判）。造好了可以贴到 GitHub，别人载入之后拿自己的规则来试。" }),
      h("div", { class: "row tight" }, seg), host
    ], { cls: "arm", onClose: function () { alive = false; } });
    function redraw() { if (alive) draw(); }
    function delBtn(label, fn) { return h("button", { class: "iconbtn", type: "button", "aria-label": "删掉 " + label, text: "✕", onclick: fn }); }
    function draw() {
      clear(host);
      Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-tab") === tab ? "true" : "false"); });
      if (tab === "world") {
        host.appendChild(h("p", { class: "note", id: "shWhat", text: "世界 = 一段代码：给它随机数，它交出一条价格路径。造好的世界可以拿到实验室里，让任何一条规则在上面回测。" }));
        var list = h("div", { class: "ar-list", id: "shWorlds" });
        allWorlds().forEach(function (w) {
          list.appendChild(h("div", { class: "ar-rule", "data-world": w.id }, h("div", { class: "ar-rtxt sh-txt" }, h("b", { text: w.name }), tagOf(w), h("span", { class: "note", text: w.summary })),
            h("button", { class: "btn small", type: "button", "data-open": w.id, text: w.src === "mine" ? "改" : "打开", onclick: function () { openWorld(w, function (r, used) { if (used) m.close(); else redraw(); }); } }),
            h("button", { class: "btn small", type: "button", "data-use": w.id, text: "拿到实验室里用", onclick: function () { m.close(); useWorld(w); } }),
            w.src ? delBtn(w.name, function () { store.worlds = store.worlds.filter(function (x) { return x.id !== w.id; }); save(); draw(); }) : null));
        });
        host.appendChild(list);
        host.appendChild(h("div", { class: "row tight ar-acts" },
          h("button", { class: "btn primary", type: "button", id: "shWNew", text: "写一个新的", onclick: function () { var t = libWorlds()[0]; openWorld({ id: "", name: "我的世界", summary: "", code: t.code, schema: t.schema, K: t.K, T: t.T, explain: "", src: "", fresh: true }, function (r, used) { if (used) m.close(); else redraw(); }); } }),
          h("button", { class: "btn", type: "button", id: "shWFind", text: "从大家那里找", onclick: function () {
            finder({ title: "大家造的世界", kind: "world", addText: "载入", empty: "还没有人贴过世界。自己造一个，在编辑的地方点\"贴到 GitHub\"。", how: HOW, pick: hubWorld,
              have: function (w) { return store.worlds.some(function (x) { return x.id === w.id; }); },
              add: function (w) { store.worlds.push(w); if (store.worlds.length > 30) store.worlds.shift(); save(); redraw(); } });
          } }),
          S.custom && !sameWorld(S.custom) ? h("button", { class: "btn", type: "button", id: "shWGrab", text: "把实验室里的自定义世界收进来", title: "实验室里现在有一个自定义世界「" + S.custom.name + "」，收进工坊之后可以在这里改、贴到 GitHub", onclick: function () { if (grabCustom()) draw(); } }) : null));
      } else {
        host.appendChild(h("p", { class: "note", id: "shWhat", text: "玩法 = 一个裁判：它发牌、亮牌、判分。规则每回合看到亮出来的东西，报一个数，裁判给分。玩法连同裁判可以贴到 GitHub，别人载入之后拿自己的规则来比。" }));
        var gl = h("div", { class: "ar-list", id: "shGames" });
        allGames().forEach(function (g) {
          var n = rulesOf(g).length;
          gl.appendChild(h("div", { class: "ar-rule", "data-game": g.id }, h("div", { class: "ar-rtxt sh-txt" }, h("b", { text: g.name }), tagOf(g), h("span", { class: "note", text: g.summary + (g.summary ? " " : "") + "（" + n + " 条规则）" })),
            h("button", { class: "btn small primary", type: "button", "data-open": g.id, text: "打开", onclick: function () { openGame(g, redraw); } }),
            g.src ? delBtn(g.name, function () { store.games = store.games.filter(function (x) { return x.id !== g.id; }); delete store.extra[g.id]; delete store.sets[g.id]; save(); draw(); }) : null));
        });
        host.appendChild(gl);
        host.appendChild(h("div", { class: "row tight ar-acts" },
          h("button", { class: "btn primary", type: "button", id: "shGNew", text: "写一套新的", onclick: function () { var t = libGames()[0]; openGameEditor({ id: "", name: "我的玩法", summary: "", about: "", code: t.code, p: t.p, T: t.T, rules: t.rules, src: "", fresh: true }, function (ng) { redraw(); if (ng && alive) openGame(ng, redraw); }); } }),
          h("button", { class: "btn", type: "button", id: "shGFind", text: "从大家那里找", onclick: function () {
            finder({ title: "大家造的玩法", kind: "game", addText: "载入", empty: "还没有人贴过玩法。自己造一套，在裁判的代码那里点\"贴到 GitHub\"。", how: HOW, pick: hubGame,
              have: function (g) { return store.games.some(function (x) { return x.id === g.id; }); },
              add: function (g) { store.games.push(g); if (store.games.length > 20) { var old = store.games.shift(); delete store.extra[old.id]; delete store.sets[old.id]; } save(); redraw(); } });
          } })));
      }
    }
    draw();
    return m;
  };

  if (A.lobbyAdd) A.lobbyAdd({
    id: "workshop", order: 50, route: "workshop", kicker: "共建", title: "世界工坊", label: "进工坊", keys: "workshop 工坊 世界 玩法 裁判 自定义 上传 simulate referee",
    blurb: "不只写规则，也造世界、造玩法，连裁判一起：写一段生成价格的代码，或者写一个发牌、判分的裁判。造好了贴到 GitHub，别人载入之后拿自己的规则来试。",
    status: function () { var a = store.worlds.length, b = store.games.length; return a || b ? "你这里存着 " + a + " 个世界、" + b + " 套玩法" : ""; },
    go: function (arg) { A.openShop(arg); }
  });
})(App);
