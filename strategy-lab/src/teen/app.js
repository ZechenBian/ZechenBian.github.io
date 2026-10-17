// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 策略实验室 · 青少年版 · 界面
 * 一张单独的页面：先亲手打一局（人和规则面对同一个裁判、同一局牌，打完逐回合比），再学编程和算法的基本想法（每课一个能跑的例子），
 * 最后自己写一条规则，在几百局上和基准规则比。用的是实验室的引擎（core / shop / quest / jobs / sandbox），没有别的依赖。
 * 这张页面不联网、不注册、不收集任何信息：进度和草稿只存在这台设备的浏览器里。自己写的代码在隔离环境（sandbox.js）的后台线程里跑，死循环会被掐掉。 */
(function () {
  "use strict";
  var QL = QL_CORE(window); QL_JOBS_INSTALL(QL); QL_SHOP_INSTALL(QL); QL_QUEST_INSTALL(QL);
  var GAMES = QL_TEEN_GAMES, LESSONS = QL_TEEN_LESSONS, G_BY = {}, SLOT = QL.QUEST.slot, KEY = "ql.teen.v1";
  GAMES.forEach(function (g) { G_BY[g.id] = g; });
  var LAB = "../", DIGITS = { coin: 0, pig: 0, melon: 1, bandit: 0, stop: 0, shop: 0, park: 0 };
  var OPT = { timeout: 20000, snippetMs: 3000 };   // 规则、小程序各跑多久算卡死（测试里会调小）

  /* ---------- 小工具 ---------- */
  function h(tag, attrs) {
    var el = document.createElement(tag), i, k;
    if (attrs) for (k in attrs) {
      var v = attrs[k]; if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "value" || k === "checked" || k === "disabled" || k === "hidden" || k === "selected" || k === "open") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  /** 一段文字里的 **加粗** 和 `代码` */
  function rich(text) {
    var frag = document.createDocumentFragment(), re = /(\*\*[^*]+\*\*|`[^`]+`)/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var s = m[0];
      frag.appendChild(s.charAt(0) === "*" ? h("b", { text: s.slice(2, -2) }) : h("code", { text: s.slice(1, -1) }));
      last = m.index + s.length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }
  function paras(list, cls) { return (list || []).map(function (t) { return h("p", { class: cls || "" }, rich(t)); }); }
  function bullets(list) { return h("ul", null, (list || []).map(function (t) { return h("li", null, rich(t)); })); }
  function fmt(v, d) { return v === v && v != null && v !== Infinity && v !== -Infinity ? (+v).toFixed(d == null ? 2 : d) : "—"; }
  function sgn(v, d) { return (v > 0 ? "+" : "") + fmt(v, d); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1) + "-" + (d.getDate() < 10 ? "0" : "") + d.getDate(); }
  function copyText(text, btn) {
    var done = function () { if (btn) { var t = btn.textContent; btn.textContent = "已复制"; setTimeout(function () { btn.textContent = t; }, 1500); } };
    try { navigator.clipboard.writeText(text).then(done, function () { fallback(); }); } catch (e) { fallback(); }
    function fallback() { var ta = h("textarea", { style: "position:fixed;opacity:0" }); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) {} ta.remove(); }
  }

  /* ---------- 存档（只在这台设备上） ---------- */
  var store = { v: 1, best: {}, played: {}, drafts: {}, done: {} };
  try { var o0 = JSON.parse(localStorage.getItem(KEY) || "null"); if (o0 && o0.v === 1) ["best", "played", "drafts", "done"].forEach(function (k) { if (o0[k] && typeof o0[k] === "object") store[k] = o0[k]; }); } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }

  /* ---------- 种子、编译、一局 ---------- */
  var PUB = []; for (var i0 = 0; i0 < 10; i0++) PUB.push(QL.questHash("teen|pub|" + i0) | 0);   // 写规则时比成绩用的 10 组，固定不变
  function daySeed(gid, day) { return QL.questHash("teen|" + gid + "|" + day) | 0; }
  function randSeed() { return Math.floor(Math.random() * 2147483647); }
  function compile(code, names) { return new Function("\"use strict\";\n" + code + "\n;return { " + names.map(function (n) { return n + ": typeof " + n + " === \"function\" ? " + n + " : null"; }).join(", ") + " };")(); }
  function gameOf(g) { var o = compile(g.code, ["deal", "show", "referee"]); return { deal: o.deal, show: o.show, referee: o.referee }; }
  function playerOf(ref, slot) { var o = compile(ref.code, ["init", "decide"]); return { id: ref.id, init: o.init, decide: o.decide, p: Object.freeze(Object.assign({}, ref.p)), slot: slot }; }
  function gpOf(g) { return Object.freeze(Object.assign({}, g.p)); }
  /** 人打的一局：一回合一回合来。和 shopEpisode 走的是同一条路（同样的发牌、同样的亮牌）。 */
  function startEpisode(g, seed) {
    var game = gameOf(g), gp = gpOf(g), G = game.deal(g.T, new QL.RNG(seed, 0, 9101), gp);
    var ep = { g: g, seed: seed, game: game, gp: gp, G: G, t: 0, total: 0, log: [], over: false, rounds: 0 };
    ep.see = function () { return game.show ? QL.shopSee(game.show(G, ep.t)) : NaN; };
    ep.act = function (a) {
      if (ep.over) return null;
      var see = ep.see(), gain = game.referee(G, ep.t, a), rec = { t: ep.t, see: see, a: a, gain: gain };
      if (typeof gain !== "number" || gain !== gain) gain = rec.gain = 0;
      ep.total += gain; ep.log.push(rec); ep.t++;
      if (G.over === true || ep.t >= g.T) { ep.over = true; }
      ep.rounds = ep.t;
      rec.next = ep.over ? null : ep.see(); rec.over = ep.over;
      return rec;
    };
    return ep;
  }
  /** 基准规则在同一局上打一遍（主线程里：是自带的代码） */
  function refsOn(g, seed) {
    var game = gameOf(g), gp = gpOf(g);
    return g.refs.map(function (r, i) {
      var log = [], out;
      try { out = QL.shopEpisode(game, gp, g.T, seed, 0, playerOf(r, i), i, log); } catch (e) { return { ref: r, err: String(e && e.message || e), score: NaN, log: [] }; }
      return { ref: r, score: out.score, rounds: out.rounds, log: log };
    });
  }
  /** 每一回合发生了什么，用人话说 */
  function roundText(g, rec) {
    var a = rec.a, gain = rec.gain, see = rec.see, next = rec.next;
    switch (g.id) {
      case "coin": var real = gain ? a : (a === 1 ? 0 : 1); return "你猜" + (a === 1 ? "正面" : "反面") + "，抛出来是" + (real === 1 ? "正面" : "反面") + "：" + (gain ? "猜对，+1 分" : "猜错，0 分");
      case "pig": if (a !== 1) return "收手，带走 " + gain + " 分"; if (rec.over && gain === 0) return "掷出 1，累计清零，这一局 0 分"; if (rec.over) return "回合用完了，带走 " + gain + " 分"; return "掷出 " + (next - see) + "，累计 " + next + " 分";
      case "melon": return gain > 0 ? "报 " + a + " 元：买了，收到 " + fmt(gain, 1) + " 元" : "报 " + a + " 元：这位顾客走掉了";
      case "bandit": return "抽 " + a + " 号机：" + (gain ? "出了好卡，+1 分" : "没出");
      case "stop": return a === 1 ? "要了，这一局得 " + gain + " 分" : rec.over ? "最后一个，只能要它：" + gain + " 分" : "跳过";
      case "shop": var q = a >= 0 ? Math.round(a) : 0, sold = Math.round((gain + 3 * q) / 5); return "做 " + q + " 杯，卖出 " + sold + " 杯" + (next ? (next.out === 1 ? "（卖光了）" : "（没卖光）") : (sold === q ? "（卖光了）" : "（没卖光）")) + "：" + (gain >= 0 ? "赚 " : "亏 ") + Math.abs(gain) + " 元";
      case "park": if (a === 1 && gain > 0) return "停在离门口 " + see.dist + " 格：得 " + gain + " 分"; if (a === 1) return "这里有车，停不了，只能开过去"; return rec.over ? "开到头了也没停：0 分" : "开过去";
    }
    return "得 " + gain;
  }
  function seeText(g, see, t) { return g.fmtSee(see, t); }

  /* ---------- 在隔离环境里跑：学生的规则、学生的小程序 ---------- */
  function failText(e) {
    if (e && e.nostart) return "这个浏览器开不了后台线程，跑不了。换一个新一点的浏览器试试。";
    if (e && e.timeout) return "跑了太久被掐掉了：多半是代码里有死循环（比如 while 的条件永远成立）。";
    if (e && e.compile) return "代码有语法错误" + (e.line ? "（第 " + e.line + " 行附近）" : "") + "：" + e.message;
    return "出错了：" + (e && e.message || "不知道为什么");
  }
  /** 代码里的字符串和注释换成空格（长度、换行都不变），这样查标点的时候不会误伤写在引号和注释里的中文 */
  function bare(code) {
    return code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, function (m) { return m.replace(/[^\n]/g, " "); });
  }
  /** 检查学生的代码：全角标点（引号和注释里的不算）、没填的空、语法 */
  function precheck(code, needDecide) {
    var m = /[（）；，：“”‘’【】｛｝。]/.exec(bare(code));
    if (m) { var ln = code.slice(0, m.index).split("\n").length; return "第 " + ln + " 行有一个中文的标点“" + m[0] + "”：电脑只认英文的标点（( ) ; , : \" ）。"; }
    if (/____/.test(code)) return "还有空没填：把代码里的 ____ 换掉。";
    var syn = QLJobs.syntax(code); if (syn) return "代码有语法错误：" + syn;
    if (needDecide && !/\bfunction\s+decide\s*\(/.test(code)) return "代码里要有 function decide(s, p, st)：裁判每回合就是调用它。";
    return "";
  }
  /** 一条规则（也可以带几条基准规则）在几组数据上打一遍。players: [{ id, code, p, slot }] */
  function runRules(g, players, seeds, K, trace, onProgress) {
    return QLJobs.run({ kind: "quest", timeout: OPT.timeout,
      codes: [{ id: "game", code: g.code, mine: true }].concat(players.map(function (p) { return { id: p.id, code: p.code, mine: true }; })),
      data: { game: "game", gp: g.p, T: g.T, K: K, seeds: seeds, cut: 0, trace: !!trace, entries: players.map(function (p) { return { id: p.id, p: p.p, slot: p.slot }; }) }, onProgress: onProgress }).promise;
  }
  /** 一小段程序：跑它，把 print 出来的东西收回来。3 秒不停就掐掉 */
  function runSnippet(code, ms) {
    var PRE = "var __out = [];\nfunction print() { var a = [], i, v; for (i = 0; i < arguments.length; i++) { v = arguments[i]; a.push(typeof v === \"number\" ? String(+v.toPrecision(12)) : v !== null && typeof v === \"object\" ? JSON.stringify(v) : String(v)); } __out.push(a.join(\" \")); if (__out.length > 300) throw new Error(\"打印得太多了（超过 300 行）\"); }\nself.onmessage = function () {\n  var err = \"\";\n  try { (function () { \"use strict\";\n";
    var POST = "\n  })(); } catch (e) { err = String(e && e.message || e); }\n  self.postMessage({ type: \"done\", out: __out, error: err });\n};\nself.postMessage({ type: \"ready\" });\n";
    var preLines = PRE.split("\n").length - 1, src = PRE + code + POST;
    return new Promise(function (resolve) {
      var done = false, w = null, timer = 0;
      function finish(r) { if (done) return; done = true; clearTimeout(timer); try { if (w) w.terminate(); } catch (e) {} resolve(r); }
      function wire(worker, plain) {
        w = worker;
        w.onmessage = function (ev) { var m = ev.data; if (!m) return; if (m.type === "ready") w.postMessage({ go: 1 }); else if (m.type === "done") finish({ out: Array.isArray(m.out) ? m.out.map(String) : [], error: String(m.error || "") }); };
        w.onerror = function (ev) {
          if (ev.preventDefault) ev.preventDefault();
          if (ev.sandbox === "nostart" && !plain) { try { w.terminate(); } catch (e) {} try { wire(new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" }))), true); } catch (e) { finish({ out: [], error: "这个浏览器开不了后台线程，跑不了代码。" }); } return; }
          var ln = (ev.lineno | 0) - preLines;
          finish({ out: [], error: "语法错误" + (ln > 0 ? "（第 " + ln + " 行附近）" : "") + "：" + String(ev.message || "").replace(/^Uncaught\s+/, ""), syntax: true });
        };
      }
      timer = setTimeout(function () { finish({ out: [], error: "跑了 " + (ms / 1000) + " 秒还没停，已经被掐掉：多半是死循环（while 的条件永远成立）。", timeout: true }); }, ms);
      try { wire(QLSandbox.spawn(src), false); } catch (e) { finish({ out: [], error: String(e && e.message || e) }); }
    });
  }
  /** 参数那一栏：c = 20, up = 1.1 */
  function parseP(text) {
    var p = {}, parts = String(text || "").split(/[,，;；\n]/), i;
    for (i = 0; i < parts.length; i++) {
      var s = parts[i].trim(); if (!s) continue;
      var m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(-?\d+(?:\.\d+)?)$/.exec(s); if (!m) return null;
      p[m[1]] = +m[2];
    }
    return p;
  }
  function pLine(p) { return Object.keys(p || {}).map(function (k) { return k + " = " + p[k]; }).join(", "); }

  /* ---------- 公共的小部件 ---------- */
  function table(heads, rows, opt) {
    opt = opt || {};
    return h("div", { class: "tabwrap" }, h("table", { class: "tab" + (opt.cls ? " " + opt.cls : ""), id: opt.id },
      opt.caption ? h("caption", { text: opt.caption }) : null,
      h("thead", null, h("tr", null, heads.map(function (x, i) { return h("th", { class: i > 0 && opt.num !== false ? "num" : "", text: x }); }))),
      h("tbody", null, rows.map(function (r) { return h("tr", { class: r.cls || "", "data-id": r.id }, r.cells.map(function (c, i) { return h("td", { class: i > 0 && opt.num !== false ? "num" : "" }, c); })); }))));
  }
  function details(title, body, open, id) { return h("details", { class: "more", open: !!open, id: id }, h("summary", { text: title }), h("div", { class: "more-body" }, body)); }
  function codeBlock(code, id) { return h("pre", { class: "code", id: id, text: code }); }
  function link(hash, text, cls) { return h("a", { href: hash, class: cls || "", text: text }); }
  function note(text, cls, id) { return h("p", { class: (cls || "note"), id: id }, rich(text)); }

  /* ================= 视图 ================= */
  var view = $("#view"), nav = $("#nav");
  var ROUTES = { home: 1, play: 1, code: 1, algo: 1, rule: 1, teach: 1 };
  function go(hash) { location.hash = hash; }
  function route() {
    var m = /^#([a-z]+)(?:\/([a-z0-9-]+))?/.exec(location.hash || ""), name = m && ROUTES[m[1]] ? m[1] : "home", arg = m ? m[2] : "";
    Array.prototype.forEach.call(nav.querySelectorAll("a"), function (a) { a.classList.toggle("on", a.getAttribute("data-view") === name); });
    clear(view);
    ({ home: viewHome, play: viewPlay, code: viewCode, algo: viewAlgo, rule: viewRule, teach: viewTeach })[name](arg);
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  /* ---------- 开始 ---------- */
  function featured() { var d = today(), k = QL.questHash("teen|day|" + d) % GAMES.length; return GAMES[k]; }
  function viewHome() {
    var g = featured(), best = store.best[g.id];
    view.appendChild(h("section", { class: "hero" },
      h("h2", { text: "每天一道决策题。先亲手打一局，再让程序替你打。" }),
      h("p", { class: "lead", text: "七个小游戏：猜硬币、掷骰子、卖西瓜、抽卡机、找最大的数、开奶茶店、停车。每个都是“不知道会发生什么，但现在就得做决定”。你先自己打，再看看一条简单的程序打得怎么样，最后自己写一条。不用注册，手机上也能玩。" })));
    view.appendChild(h("section", { class: "card today", id: "today" },
      h("div", { class: "kicker", text: "今天的一局 · " + today() }),
      h("h3", { text: g.name }), h("p", { text: g.kicker }),
      h("div", { class: "row" }, h("a", { class: "btn primary big", href: "#play/" + g.id, id: "goToday", text: "亲手打一局" }), best ? h("span", { class: "note", text: "你在这个游戏里的最好成绩：" + fmt(best.score, DIGITS[g.id]) + " " + g.unit }) : null),
      note("同一天打开的人打的是同一局（按你设备上的日期），所以可以和同学比成绩。")));
    view.appendChild(h("section", { class: "steps" },
      step("1", "亲手打一局", "每个游戏十几回合，一两分钟。打完立刻看到：三条简单的规则在同一局上得了多少分，它们每一回合是怎么选的。", "#play", "去打一局"),
      step("2", "编程的基本思想", "七课，每课一段能跑的代码和一个“改一改”。变量、if、循环、函数、记事本——学完就看得懂一条规则。", "#code", "开始学"),
      step("3", "算法的基本思想", "七个想法：数一数、跟着反馈调、探索与利用、从后往前想、算期望值、看情况定门槛、怎么比较。每个都能跑一个实验。", "#algo", "看看"),
      step("4", "写你的规则", "从填空开始，把规则放到几百局上和基准规则比。写得好的，可以去正式版的每日一题。", "#rule", "去写")));
    view.appendChild(h("section", { class: "card" }, h("h3", { text: "三个要知道的" }),
      bullets(["**不收集任何东西。** 这张页面不联网、不要账号；你的进度、成绩和写的代码只存在这台设备的浏览器里，换一台设备就没有了。",
        "**这些是游戏，不是投资。** 游戏里的“钱”都是分数。里面的想法（估计、期望值、门槛、探索）是数学和算法，不是赚钱的办法。",
        "**老师和家长看这里。** 一页说明：怎么在 45 分钟里用它上一节课，怎么组织班级比赛。"]),
      h("div", { class: "row" }, link("#teach", "给老师和家长的说明", "btn"), h("a", { class: "btn", href: LAB, text: "正式版：策略实验室" }))));
    function step(n, title, text, hash, label) { return h("div", { class: "card step" }, h("div", { class: "stepn", text: n }), h("h3", { text: title }), h("p", { text: text }), link(hash, label, "btn")); }
  }

  /* ---------- 亲手试一局 ---------- */
  var cur = null;   // 正在打的那一局
  function gamePicker(sel, prefix) {
    return h("div", { class: "chips", id: "games" }, GAMES.map(function (g) {
      var best = store.best[g.id];
      return h("a", { href: "#" + prefix + "/" + g.id, class: "chip" + (g.id === sel ? " on" : ""), "data-game": g.id }, h("b", { text: g.name }), best ? h("small", { text: " 最好 " + fmt(best.score, DIGITS[g.id]) }) : null);
    }));
  }
  function viewPlay(gid) {
    var g = G_BY[gid] || featured();
    view.appendChild(h("h2", { text: "亲手试一局" }));
    view.appendChild(note("先自己打，再看程序怎么打。每个游戏十几回合；打完能看到三条规则在同一局上的得分和它们每一回合的选择。"));
    view.appendChild(gamePicker(g.id, "play"));
    var day = today(), seed = daySeed(g.id, day);
    if (!cur || cur.g.id !== g.id) cur = startEpisode(g, seed), cur.kind = "day", cur.day = day;
    view.appendChild(gamePanel(g));
  }
  function gamePanel(g) {
    var box = h("section", { class: "game", id: "game" });
    box.appendChild(h("div", { class: "gamehead" }, h("div", null, h("div", { class: "kicker", text: "想法：" + g.idea }), h("h3", { text: g.name }), h("p", { class: "lead", text: g.kicker }))));
    box.appendChild(details("题目（先读这个）", [
      paras(g.about),
      h("div", { class: "three" },
        h("div", { class: "card" }, h("h4", { text: "你会看到" }), h("p", { text: g.see })),
        h("div", { class: "card" }, h("h4", { text: "你要做的" }), h("p", { text: g.act })),
        h("div", { class: "card" }, h("h4", { text: "怎么算分" }), h("p", { text: g.score }))),
      h("h4", { text: "举个例子" }), bullets(g.example)
    ], !store.played[g.id], "about"));
    var board = h("div", { class: "board", id: "board" }); box.appendChild(board);
    var after = h("div", { id: "after" }); box.appendChild(after);
    paintBoard(g, board, after);
    box.appendChild(details("三条基准规则是怎么想的", g.refs.map(function (r, i) {
      return h("div", { class: "refcard", "data-ref": r.id }, h("h4", null, r.name, i === 0 ? h("span", { class: "tag", text: "基准" }) : null), h("p", { class: "note", text: r.summary }), h("p", null, rich(r.why)), details("看代码", codeBlock(r.code), false));
    }), false, "refs"));
    box.appendChild(details("想一想", bullets(g.think), false, "think"));
    box.appendChild(details("这题背后的想法", [paras(g.math), g.harder ? note(g.harder) : null], !!store.played[g.id], "math"));
    box.appendChild(h("div", { class: "row" }, link("#rule/" + g.id, "去写这个游戏的规则 →", "btn primary"), link("#code", "先学编程的基本思想", "btn")));
    return box;
  }
  function paintBoard(g, board, after) {
    clear(board); clear(after);
    var ep = cur, see = ep.over ? null : ep.see();
    board.appendChild(h("div", { class: "status" }, h("span", { id: "round", text: ep.over ? "这一局结束了" : "第 " + (ep.t + 1) + " / " + g.T + " 回合" }), h("span", { class: "sp" }), h("span", { id: "total", text: "到现在：" + fmt(ep.total, DIGITS[g.id]) + " " + g.unit }), h("span", { class: "note", text: ep.kind === "day" ? "今天的一局" : "随机的一局" })));
    if (!ep.over) {
      board.appendChild(h("div", { class: "see", id: "see", text: seeText(g, see, ep.t)}));
      if (ep.log.length) board.appendChild(h("div", { class: "last", id: "last", text: "上一回合：" + roundText(g, ep.log[ep.log.length - 1]) }));
      board.appendChild(controls(g, see, function (a) { ep.act(a); paintBoard(g, board, after); }));
    }
    if (ep.log.length && !ep.over) board.appendChild(details("这一局到现在的每一回合", logTable(g, ep.log), false, "log"));
    if (ep.over) finish(g, board, after);
  }
  function controls(g, see, act) {
    var ui = g.ui;
    if (ui.kind === "choice") return h("div", { class: "choices", id: "choices" }, ui.options.map(function (o) {
      var off = o.needFree && !(see && see.free === 1);
      return h("button", { class: "btn choice" + (off ? " off" : ""), type: "button", "data-a": o.a, disabled: off, title: off ? "这个车位有车" : "", onclick: function () { act(o.a); }, text: o.label });
    }));
    var inp = h("input", { type: "number", id: "num", class: "num", min: ui.min, max: ui.max, step: ui.step, placeholder: ui.hint, "aria-label": ui.hint });
    var goBtn = h("button", { class: "btn primary", type: "button", id: "go", text: "就这么报" });
    function submit() { var v = parseFloat(inp.value); if (v !== v) { inp.focus(); return; } v = Math.max(ui.min, Math.min(ui.max, v)); act(v); }
    goBtn.addEventListener("click", submit); inp.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    return h("div", { class: "numbox" }, h("div", { class: "presets" }, ui.presets.map(function (v) { return h("button", { class: "btn small", type: "button", "data-a": v, text: v + " " + ui.unit, onclick: function () { act(v); } }); })),
      h("div", { class: "row" }, inp, h("span", { class: "note", text: ui.unit }), goBtn));
  }
  function logTable(g, log) {
    return table(["回合", "你看到的", "你报的", "结果"], log.map(function (r) { return { cells: [String(r.t + 1), seeText(g, r.see, r.t), g.fmtAct(r.a), roundText(g, r)] }; }), { num: false, id: "logTab" });
  }
  function finish(g, board, after) {
    var ep = cur, refs = refsOn(g, ep.seed), d = DIGITS[g.id], best = store.best[g.id];
    if (!ep.saved) {
      ep.saved = true;
      if (!best || ep.total > best.score) store.best[g.id] = { score: ep.total, when: today() };
      store.played[g.id] = { seed: ep.seed, total: ep.total, log: ep.log.map(function (r) { return { t: r.t, a: r.a, gain: r.gain }; }), day: ep.kind === "day" ? ep.day : "", refs: refs.map(function (r) { return { id: r.ref.id, score: r.score }; }) };
      save();
    }
    var rows = [{ id: "you", cls: "me", cells: [h("b", { text: "你" }), fmt(ep.total, d) + " " + g.unit, String(ep.rounds)] }].concat(refs.map(function (r) { return { id: r.ref.id, cells: [r.ref.name + (r === refs[0] ? "（基准）" : ""), r.err ? "出错：" + r.err : fmt(r.score, d) + " " + g.unit, String(r.rounds || "")] }; }));
    var beat = refs.filter(function (r) { return ep.total > r.score; }).length, tie = refs.filter(function (r) { return ep.total === r.score; }).length;
    after.appendChild(h("div", { class: "result card", id: "result" },
      h("h3", { id: "resultLine", text: "这一局你得了 " + fmt(ep.total, d) + " " + g.unit + "。" + (beat === refs.length ? "三条规则都没你高！" : beat ? "比 " + beat + " 条规则高" + (tie ? "，和 " + tie + " 条打平" : "") + "。" : tie ? "和规则打平。" : "三条规则都比你高，看看它们是怎么打的。") }),
      table(["谁", "这一局的得分", "打了几回合"], rows, { id: "cmp", caption: "同一局、同样的牌（同样的硬币、骰子、顾客）。规则的分数是现算的。" }),
      h("div", { class: "row" },
        h("button", { class: "btn primary", type: "button", id: "again", text: "再来一局（随机）", onclick: function () { cur = startEpisode(g, randSeed()); cur.kind = "rand"; paintBoard(g, board, after); } }),
        ep.kind === "day" ? null : h("button", { class: "btn", type: "button", id: "replayDay", text: "重打今天的一局", onclick: function () { cur = startEpisode(g, daySeed(g.id, today())); cur.kind = "day"; cur.day = today(); paintBoard(g, board, after); } }),
        h("button", { class: "btn", type: "button", id: "copyScore", text: "复制成绩", onclick: function () { copyText("【策略实验室·青少年版】" + g.name + " · " + (ep.kind === "day" ? ep.day + " 今天的一局" : "随机的一局") + "：我得了 " + fmt(ep.total, d) + " " + g.unit + "；" + refs.map(function (r) { return r.ref.name + " " + fmt(r.score, d); }).join("，") + "。", this); } }))));
    after.appendChild(details("看规则每一回合是怎么打的（和你的对照）", [
      h("div", { class: "row" }, h("label", { for: "whichRef", class: "note", text: "哪条规则" }), h("select", { id: "whichRef" }, refs.map(function (r, i) { return h("option", { value: i, text: r.ref.name }); }))),
      h("div", { id: "traceBox" })], true, "trace"));
    var sel = $("#whichRef", after), tb = $("#traceBox", after);
    function paintTrace() { clear(tb); var r = refs[+sel.value]; tb.appendChild(sideBySide(g, ep.log, r.log, r.ref.name)); tb.appendChild(note("规则看到的和你看到的一模一样。想知道它为什么这么选，看它的代码：")); tb.appendChild(codeBlock(r.ref.code)); }
    sel.addEventListener("change", paintTrace); paintTrace();
  }
  /** 你和一条规则在同一局上逐回合对照 */
  function sideBySide(g, mine, theirs, name) {
    var n = Math.max(mine.length, theirs.length), rows = [], i, d = DIGITS[g.id];
    for (i = 0; i < n; i++) {
      var a = mine[i], b = theirs[i];
      rows.push({ cells: [String(i + 1), a ? seeText(g, a.see, i) : b ? seeText(g, b.see, i) : "", a ? g.fmtAct(a.a) : "—", a ? fmt(a.gain, d) : "—", b ? g.fmtAct(b.a) : "—", b ? fmt(b.gain, d) : "—"] });
    }
    return table(["回合", "看到的", "你报的", "你得", name + " 报的", "它得"], rows, { num: false, id: "sideTab" });
  }

  /* ---------- 编程的基本思想 ---------- */
  function viewCode(lid) {
    view.appendChild(h("h2", { text: "编程的基本思想" }));
    view.appendChild(h("div", { class: "card howto" }, h("h4", { text: "怎么学" }), bullets([
      "每课三步：**读**讲解，**跑**例子（点“跑一跑”，看打印出来的东西和你想的一样不一样），**改**例子（按“改一改”的要求改，再跑）。改坏了点“还原例子”。",
      "看不懂的地方先跑一遍再看：程序是做出来才懂的，不是读出来才懂的。打错了没关系，页面会说是第几行、什么错；死循环也会被掐掉。",
      "七课大约一个小时。学完第 7 课就能看懂一条规则，去“写规则”把空填上。"])));
    view.appendChild(h("div", { class: "chips" }, LESSONS.code.map(function (l, i) { return h("a", { href: "#code/" + l.id, class: "chip" + (store.done[l.id] ? " done" : ""), text: (i + 1) + " " + l.title }); })));
    var l = LESSONS.code.filter(function (x) { return x.id === lid; })[0] || LESSONS.code[0], idx = LESSONS.code.indexOf(l);
    var box = h("section", { class: "lesson", id: "lesson", "data-lesson": l.id });
    box.appendChild(h("h3", { text: "第 " + (idx + 1) + " 课 · " + l.title }));
    box.appendChild(h("div", null, paras(l.intro)));
    var ta = h("textarea", { class: "codeedit", id: "snip", spellcheck: "false", "aria-label": "代码" }); ta.value = l.code;
    var out = h("pre", { class: "out", id: "out", hidden: true }), msg = h("div", { class: "warn", id: "msg", hidden: true }), okBox = h("div", { class: "ok", id: "taskOk", hidden: true });
    var run = h("button", { class: "btn primary", type: "button", id: "run", text: l.rule ? "在猜硬币上跑一跑" : "跑一跑" });
    var reset = h("button", { class: "btn", type: "button", id: "reset", text: "还原例子", onclick: function () { ta.value = l.code; out.hidden = true; msg.hidden = true; okBox.hidden = true; } });
    box.appendChild(h("div", { class: "editor" }, ta, h("div", { class: "row" }, run, reset, l.loopDemo ? h("button", { class: "btn", type: "button", id: "loopDemo", text: "看一次死循环被掐掉", onclick: function () { run.disabled = true; show("正在跑一个永远停不下来的程序…", "note"); runSnippet(l.loopDemo, OPT.snippetMs).then(function (r) { run.disabled = false; show(r.error, "warn"); }); } }) : null), msg, out, okBox));
    function show(text, cls) { msg.hidden = false; msg.className = cls; msg.textContent = text; }
    run.addEventListener("click", function () {
      var code = ta.value, pre = precheck(code, !!l.rule); out.hidden = true; okBox.hidden = true; msg.hidden = true;
      if (pre) { show(pre, "warn"); return; }
      run.disabled = true;
      if (l.rule) { runLessonRule(l, code, out, msg, okBox).then(function () { run.disabled = false; }); return; }
      runSnippet(code, OPT.snippetMs).then(function (r) {
        run.disabled = false;
        out.hidden = false; out.textContent = r.out.length ? r.out.join("\n") : "（什么也没打印。用 print(…) 把东西显示出来。）";
        if (r.error) show(r.error, "warn");
        if (!r.error && l.task) { var bad = l.task.check(r.out, code); if (!bad || code !== l.code) { okBox.hidden = false; okBox.className = bad ? "warn" : "ok"; okBox.textContent = bad ? "“改一改”还没做到：" + bad : "做到了！这一课可以算过了。"; } if (!bad) { store.done[l.id] = 1; save(); } }
      });
    });
    box.appendChild(h("h4", { text: "读代码的要点" })); box.appendChild(bullets(l.notes));
    if (l.task) box.appendChild(h("div", { class: "task card", id: "task" }, h("h4", { text: "改一改" }), h("p", null, rich(l.task.text))));
    box.appendChild(h("div", { class: "row" }, idx > 0 ? link("#code/" + LESSONS.code[idx - 1].id, "← 上一课", "btn") : null, idx < LESSONS.code.length - 1 ? link("#code/" + LESSONS.code[idx + 1].id, "下一课 →", "btn primary") : link("#rule", "去写你的规则 →", "btn primary")));
    view.appendChild(box);
  }
  /** 第七课：把编辑框里的规则放到猜硬币的一局上跑，看逐回合 */
  function runLessonRule(l, code, out, msg, okBox) {
    var g = G_BY[l.rule.game], seed = daySeed(g.id, today());
    return runRules(g, [{ id: "you", code: code, p: {}, slot: SLOT }], [seed], 1, true).then(function (res) {
      var row = res.rows[0], sk = (res.skipped || [])[0];
      clear(out); out.hidden = false;
      if (sk || !row) { msg.hidden = false; msg.className = "warn"; msg.textContent = sk ? sk.err : "没有跑出结果"; return; }
      if (row.err) { msg.hidden = false; msg.className = "warn"; msg.textContent = "规则中途出错：" + row.err; return; }
      var log = (res.trace[0] || {}).log || [];
      out.appendChild(h("p", { text: "在今天的“" + g.name + "”这一局上，这条规则得了 " + fmt(row.mean, 0) + " 分（共 " + g.T + " 回合）。" }));
      out.appendChild(table(["回合", "它看到的", "它报的", "得分"], log.map(function (r, i) { return { cells: [String(i + 1), seeText(g, r.see, i), g.fmtAct(r.a), fmt(r.gain, 0)] }; }), { num: false, id: "ruleTrace" }));
      if (l.task) { var bad = l.task.check([], code); okBox.hidden = false; okBox.className = bad ? "note" : "ok"; okBox.textContent = bad ? "想试试“改一改”的话：" + bad : "做到了！这一课可以算过了。"; if (!bad) { store.done[l.id] = 1; save(); } }
    }, function (e) { msg.hidden = false; msg.className = "warn"; msg.textContent = failText(e); });
  }

  /* ---------- 算法的基本思想 ---------- */
  function viewAlgo(aid) {
    view.appendChild(h("h2", { text: "算法的基本思想" }));
    view.appendChild(h("div", { class: "card howto" }, h("h4", { text: "怎么学" }), bullets([
      "算法就是“办法”：面对不确定的事，怎么决定才划算。这里的七个想法，每个对着一个小游戏。",
      "顺序：先去**打一局**那个游戏，有了自己的感觉再回来**读想法**；然后**跑实验**，看数据和你的感觉一样不一样；最后去**写规则**，把这个想法写成代码。",
      "每个实验跑的是几百局，所以表里的数靠得住；± 后面的数是误差的刻度，两条规则差不到它的两三倍，就还说不清谁好。"])));
    view.appendChild(h("div", { class: "chips" }, LESSONS.algo.map(function (l, i) { return h("a", { href: "#algo/" + l.id, class: "chip", text: (i + 1) + " " + l.title }); })));
    var l = LESSONS.algo.filter(function (x) { return x.id === aid; })[0] || LESSONS.algo[0], idx = LESSONS.algo.indexOf(l), g = G_BY[l.game];
    var box = h("section", { class: "lesson", id: "idea", "data-idea": l.id });
    box.appendChild(h("div", { class: "kicker", text: "对着的游戏：" + g.name }));
    box.appendChild(h("h3", { text: "想法 " + (idx + 1) + " · " + l.title }));
    box.appendChild(h("div", null, paras(l.intro)));
    if (l.life) { box.appendChild(h("h4", { text: "生活里也一样" })); box.appendChild(bullets(l.life)); }
    if (l.demo) box.appendChild(demo(l.demo));
    box.appendChild(experiment(l.experiment, "exp"));
    if (l.experiment2) box.appendChild(experiment(l.experiment2, "exp2"));
    box.appendChild(h("h4", { text: "记住这几句" })); box.appendChild(bullets(l.takeaway));
    box.appendChild(h("div", { class: "row" }, link("#play/" + g.id, "去打一局“" + g.name + "”", "btn"), link("#rule/" + g.id, "写它的规则", "btn"), idx < LESSONS.algo.length - 1 ? link("#algo/" + LESSONS.algo[idx + 1].id, "下一个想法 →", "btn primary") : null));
    view.appendChild(box);
  }
  /** 页面里现算的小演示 */
  function demo(kind) {
    var box = h("div", { class: "demo card", id: "demo", "data-demo": kind });
    if (kind === "estimate") {
      var rng = new QL.RNG(20261017, 0, 1), q = 0.7, heads = 0, n = 0, marks = [5, 20, 100, 1000], rows = [];
      for (n = 1; n <= 1000; n++) { if (rng.u() < q) heads++; if (marks.indexOf(n) >= 0) rows.push({ cells: [String(n), String(heads), fmt(heads / n, 3), fmt(Math.abs(heads / n - q), 3)] }); }
      box.appendChild(h("h4", { text: "一枚正面概率 0.7 的硬币" }));
      box.appendChild(table(["抛了几次", "正面几次", "估计的概率", "和 0.7 差多少"], rows, { id: "estTab" }));
      box.appendChild(note("次数少的时候估计可能差很远；一千次以后就很接近了。误差大致按“次数的平方根”缩小：次数乘 100，误差只缩小到十分之一。"));
    } else if (kind === "dp") {
      var v = [50.5], k, x, s;
      for (k = 2; k <= 10; k++) { s = 0; for (x = 1; x <= 100; x++) s += Math.max(x, v[k - 2]); v.push(s / 100); }
      var rows2 = [];
      for (k = 1; k <= 10; k++) { var left = 10 - k; rows2.push({ cells: [String(k), String(left), left ? "比 " + fmt(v[left - 1], 1) + " 大才要" : "只能要", fmt(v[left], 1)] }); }
      box.appendChild(h("h4", { text: "从后往前算出来的门槛（页面现算）" }));
      box.appendChild(table(["看到第几个数", "后面还剩几个", "眼前这个数要不要", "从这里起平均能拿到"], rows2, { id: "dpTab" }));
      box.appendChild(note("最后一行是起点：按这张表打，10 个数平均能拿到 " + fmt(v[9], 1) + "。“要第一个”只有 50.5，“过 70 就要”大约 84。"));
    } else if (kind === "expect") {
      var rows3 = [10, 15, 19, 20, 21, 25, 30].map(function (xx) { return { cells: [String(xx), fmt((20 - xx) / 6, 2), xx < 20 ? "再掷是赚的" : xx > 20 ? "再掷是亏的" : "一样"] }; });
      box.appendChild(h("h4", { text: "掷骰子：累计 x 分时再掷一次，平均赚多少" }));
      box.appendChild(table(["累计 x", "(20 − x) / 6", "该不该再掷"], rows3, { id: "pigTab", num: false }));
      var lam = 15, pmf = [], e = Math.exp(-lam), pk = e, kk; for (kk = 0; kk <= 60; kk++) { pmf.push(pk); pk = pk * lam / (kk + 1); }
      var rows4 = [], bestQ = 0, bestV = -1e9;
      for (var qq = 10; qq <= 20; qq++) {
        var emin = 0, tail = 0, dd; for (dd = 0; dd <= 60; dd++) emin += Math.min(qq, dd) * pmf[dd]; for (dd = qq + 1; dd <= 60; dd++) tail += pmf[dd];
        var prof = 5 * emin - 3 * qq; if (prof > bestV) { bestV = prof; bestQ = qq; }
        rows4.push({ id: "q" + qq, cells: [String(qq), fmt(prof, 2), fmt(100 * tail, 0) + "%"] });
      }
      rows4.forEach(function (r) { if (r.id === "q" + bestQ) r.cls = "me"; });
      box.appendChild(h("h4", { text: "奶茶店：平均每天 15 位顾客时，做几杯平均赚多少" }));
      box.appendChild(table(["做几杯", "平均每天赚（元）", "再多做一杯卖得掉的概率"], rows4, { id: "nvTab" }));
      box.appendChild(note("最划算的是做 " + bestQ + " 杯：正好是“再多一杯卖得掉的概率”刚降到 60% 以下的地方，比平均顾客数 15 少。"));
    }
    return box;
  }
  /** 跑一个实验：几条规则在几百局上比。exp: { game, K, entries: [{ ref, name, p } | { code, name, p }], variants: [{ name, p }], single: [局号…], note } */
  function experiment(exp, id) {
    var g = G_BY[exp.game], box = h("div", { class: "exp card", id: id }), btn = h("button", { class: "btn primary", type: "button", id: id + "Run", text: "跑一个实验（几百局）" }), out = h("div", { id: id + "Out" }), prog = h("span", { class: "note", id: id + "Prog" });
    var players = exp.entries.map(function (e, i) { var r = e.ref ? g.refs.filter(function (x) { return x.id === e.ref; })[0] : null; return { id: "r" + i, name: e.name || (r ? r.name : "规则 " + (i + 1)), code: e.code || r.code, p: e.p || (r ? r.p : {}), slot: i }; });
    box.appendChild(h("h4", { text: "跑一个实验：" + g.name })); box.appendChild(note(exp.note || ""));
    box.appendChild(h("div", { class: "row" }, btn, prog)); box.appendChild(out);
    btn.addEventListener("click", function () {
      btn.disabled = true; clear(out); prog.textContent = "正在跑…";
      var variants = exp.variants || [{ name: "", p: g.p }], runs = [];
      (exp.single || []).forEach(function (k) { runs.push({ name: "只打第 " + k + " 局", kind: "one", gg: g, seeds: [PUB[k - 1]], K: 1 }); });
      variants.forEach(function (vv) { runs.push({ name: vv.name || (exp.single ? "打 " + (PUB.length * exp.K) + " 局的平均" : ""), kind: "many", gg: Object.assign({}, g, { p: vv.p }), seeds: PUB, K: exp.K }); });
      var results = [], i = 0;
      (function next() {
        if (i >= runs.length) { btn.disabled = false; prog.textContent = ""; paint(); return; }
        var r = runs[i++];
        runRules(r.gg, players, r.seeds, r.K, false, function (pm) { prog.textContent = "第 " + (pm.i + 1) + " / " + pm.n + " 条规则…"; }).then(function (res) { results.push({ run: r, res: res }); next(); }, function (e) { btn.disabled = false; prog.textContent = ""; out.appendChild(h("div", { class: "warn", text: failText(e) })); });
      })();
      function paint() {
        var heads = ["规则"].concat(results.map(function (x) { return x.run.name || ("平均每局（" + (PUB.length * exp.K) + " 局）"); }));
        var best = results.map(function (x) { return Math.max.apply(null, x.res.rows.map(function (r) { return r.err ? -Infinity : r.mean; })); });
        var rows = players.map(function (p, pi) {
          return { id: p.id, cells: [p.name].concat(results.map(function (x, xi) { var r = x.res.rows.filter(function (q) { return q.id === p.id; })[0]; if (!r || r.err) return "出错"; var top = r.mean === best[xi]; return h("span", { class: top ? "top" : "" }, x.run.kind === "one" ? fmt(r.mean, DIGITS[g.id]) : [h("b", { text: fmt(r.mean, 2) }), h("span", { class: "note", text: " ± " + fmt(r.se, 2) })]); })) };
        });
        out.appendChild(table(heads, rows, { id: id + "Tab", caption: "每一列里最高的加粗。± 后面是“平均数大概差多少”的刻度（标准误）。所有规则面对的是同样的牌。" }));
      }
    });
    return box;
  }

  /* ---------- 写你的规则 ---------- */
  function viewRule(gid) {
    var g = G_BY[gid] || featured();
    view.appendChild(h("h2", { text: "写你的规则" }));
    view.appendChild(note("从填空开始：把起始代码里的空填上，跑 200 局，看它和三条基准规则比怎么样。然后改参数、改办法，再跑。能跑赢最好的那条基准规则，就说明你的办法真的更好。"));
    view.appendChild(gamePicker(g.id, "rule"));
    var draft = store.drafts[g.id] || {}, box = h("section", { class: "lesson", id: "ruleBox", "data-game": g.id });
    box.appendChild(h("div", { class: "kicker", text: "想法：" + g.idea })); box.appendChild(h("h3", { text: g.name })); box.appendChild(h("p", { class: "lead", text: g.kicker }));
    box.appendChild(details("题目", [paras(g.about), h("div", { class: "three" }, h("div", { class: "card" }, h("h4", { text: "你会看到" }), h("p", { text: "s.see：" + g.see })), h("div", { class: "card" }, h("h4", { text: "你要报的数" }), h("p", { text: g.act })), h("div", { class: "card" }, h("h4", { text: "怎么算分" }), h("p", { text: g.score })))], false, "about"));
    box.appendChild(details("裁判的代码（规则读不到 G 里的东西，只看得到 show 给的）", codeBlock(g.code), false, "gameCode"));
    var par = h("input", { type: "text", id: "par", class: "par", value: draft.par != null ? draft.par : pLine(g.starter.p), placeholder: "比如 c = 20（没有就留空）", spellcheck: "false", "aria-label": "参数" });
    var ta = h("textarea", { class: "codeedit tall", id: "code", spellcheck: "false", "aria-label": "规则的代码" }); ta.value = draft.code != null ? draft.code : g.starter.code;
    var msg = h("div", { class: "warn", id: "msg", hidden: true }), out = h("div", { id: "out" }), outOne = h("div", { id: "outOne" }), prog = h("span", { class: "note", id: "prog" });
    var runBtn = h("button", { class: "btn primary", type: "button", id: "run", text: "跑 200 局，和基准规则比" });
    var played = store.played[g.id], onePlayed = h("button", { class: "btn", type: "button", id: "runOne", hidden: !played, text: "在你刚打过的那一局上试" });
    var tmpl = h("select", { id: "tmpl", "aria-label": "换一段代码" }, [h("option", { value: "", text: "换一段代码…" }), h("option", { value: "starter", text: "起始代码（填空）" })].concat(g.refs.map(function (r) { return h("option", { value: r.id, text: "基准规则：" + r.name }); })));
    tmpl.addEventListener("change", function () { var v = tmpl.value; if (!v) return; if (v === "starter") { ta.value = g.starter.code; par.value = pLine(g.starter.p); } else { var r = g.refs.filter(function (x) { return x.id === v; })[0]; ta.value = r.code; par.value = pLine(r.p); } tmpl.value = ""; keep(); });
    function keep() { store.drafts[g.id] = { code: ta.value.slice(0, 20000), par: par.value.slice(0, 400) }; save(); }
    ta.addEventListener("input", keep); par.addEventListener("input", keep);
    box.appendChild(h("div", { class: "editor" }, h("div", { class: "row" }, h("label", { for: "par", text: "参数" }), par, tmpl), ta, note(g.blanks, "note hint", "hint"), h("div", { class: "row" }, runBtn, onePlayed, prog), msg, out, outOne));
    function fail(text) { msg.hidden = false; msg.textContent = text; }
    function read(which) { msg.hidden = true; clear(which); var pre = precheck(ta.value, true); if (pre) { fail(pre); return null; } var p = parseP(par.value); if (!p) { fail("参数的写法不对。照这个样子写：c = 20, up = 1.1（名字用字母，值是数）。"); return null; } return { code: ta.value, p: p }; }
    runBtn.addEventListener("click", function () {
      var r = read(out); if (!r) return;
      runBtn.disabled = true; prog.textContent = "正在跑…";
      var players = g.refs.map(function (ref, i) { return { id: "ref:" + ref.id, code: ref.code, p: ref.p, slot: i }; }).concat([{ id: "you", code: r.code, p: r.p, slot: SLOT }]);
      runRules(g, players, PUB, 20, false, function (pm) { prog.textContent = "第 " + (pm.i + 1) + " / " + pm.n + " 条规则，第 " + (pm.s + 1) + " / " + pm.S + " 组…"; }).then(function (res) {
        runBtn.disabled = false; prog.textContent = "";
        var sk = (res.skipped || []).filter(function (x) { return x.id === "you"; })[0];
        if (sk) { fail("你的规则没能上场：" + sk.err); return; }
        var rows = res.rows.slice().sort(function (a, b) { var ka = a.err ? -Infinity : a.mean, kb = b.err ? -Infinity : b.mean; return kb - ka; }), rank = 0, youRow = null;
        var trs = rows.map(function (row) {
          var you = row.id === "you", ref = you ? null : g.refs.filter(function (x) { return "ref:" + x.id === row.id; })[0];
          if (you) youRow = row;
          return { id: row.id, cls: you ? "me" : "", cells: [row.err ? "—" : String(++rank), you ? h("b", { text: "你的规则" }) : ref.name + (ref === g.refs[0] ? "（基准）" : ""), row.err ? h("span", { class: "note", text: "中途出错：" + row.err }) : [h("b", { text: fmt(row.mean, 2) }), h("span", { class: "note", text: " ± " + fmt(row.se, 2) })], row.err || row === res.rows[0] ? "—" : [h("b", { class: "verdict " + (row.d > 2 * row.dse ? "up" : row.d < -2 * row.dse ? "down" : "flat"), text: sgn(row.d, 2) }), h("span", { class: "note", text: " ± " + fmt(row.dse, 2) })]] };
        });
        out.appendChild(table(["名次", "规则", "平均每局得分", "比基准多"], trs, { id: "cmpTab", caption: "公开的 10 组，每组 20 局；每一局发给各条规则的是同一副牌。± 后面是标准误。" }));
        if (youRow && !youRow.err) {
          var others = res.rows.filter(function (x) { return x.id !== "you" && !x.err; }), bestRef = others.slice().sort(function (a, b) { return b.mean - a.mean; })[0];
          var by = youRow.mean - bestRef.mean, noise = Math.sqrt(youRow.se * youRow.se + bestRef.se * bestRef.se), same = Math.abs(by) < 1e-9, beat = by > 0;
          out.appendChild(h("p", { class: beat && by > 2 * noise ? "ok" : "note", id: "verdictLine", text: same ? "你的规则和最好的基准规则得分一模一样：办法一样，分数就一样。改点什么再试试。" : beat && by > 2 * noise ? "你的规则比最好的基准规则高 " + fmt(by, 2) + "，比误差的刻度（" + fmt(noise, 2) + "）大得多：这不是运气，是真的更好。" : beat ? "你的规则比最好的基准规则高一点（" + fmt(by, 2) + "），但还在误差范围内，说不准是不是运气。多试几种参数看看。" : "最好的基准规则还领先 " + fmt(-by, 2) + "。看看它的代码是怎么想的，再改改。" }));
          if (youRow.bad > 0) out.appendChild(note("有 " + (100 * youRow.bad).toFixed(0) + "% 的回合你的规则报的不是数（忘了 return？），裁判把它当成不合规矩的数处理了。", "warn"));
        }
      }, function (e) { runBtn.disabled = false; prog.textContent = ""; fail(failText(e)); });
    });
    onePlayed.addEventListener("click", function () {
      var r = read(outOne); if (!r) return; var pl = store.played[g.id]; if (!pl) return;
      onePlayed.disabled = true; prog.textContent = "正在跑…";
      runRules(g, [{ id: "you", code: r.code, p: r.p, slot: SLOT }], [pl.seed], 1, true).then(function (res) {
        onePlayed.disabled = false; prog.textContent = "";
        var row = res.rows[0], sk = (res.skipped || [])[0];
        if (sk || !row) { fail(sk ? sk.err : "没有跑出结果"); return; }
        if (row.err) { fail("规则中途出错：" + row.err); return; }
        var log = (res.trace[0] || {}).log || [], mine = pl.log.map(function (x) { return { t: x.t, a: x.a, gain: x.gain, see: (log[x.t] || {}).see }; });
        outOne.appendChild(h("p", { id: "oneLine", text: "在你" + (pl.day ? pl.day + " 打过" : "打过") + "的那一局上：你得了 " + fmt(pl.total, DIGITS[g.id]) + "，这条规则得了 " + fmt(row.mean, DIGITS[g.id]) + "。" }));
        outOne.appendChild(sideBySide(g, mine, log, "你的规则"));
      }, function (e) { onePlayed.disabled = false; prog.textContent = ""; fail(failText(e)); });
    });
    box.appendChild(h("h4", { text: "常见的错" }));
    box.appendChild(bullets(["用了中文的标点：括号、分号、引号都要用英文的。", "忘了 return：规则报的就不是数。", "一个等号和三个等号：if (s.see = 1) 是赋值，要写 if (s.see === 1)。", "记事本的东西一局一本：第一回合 st 里只有 init 放进去的东西。", "死循环：while 的条件永远成立。页面会掐掉它，结算时也会，并且没有成绩。", "想看规则每回合在干什么：先亲手打一局，再点“在你刚打过的那一局上试”。"]));
    box.appendChild(h("div", { class: "card" }, h("h4", { text: "更难的题在正式版" }), h("p", null, rich("正式版的**每日一题**每天一道新题，先在公开的数据上试，再把规则封起来交上去，截止之后和所有人一起排名。要用电脑；交规则需要一个 GitHub 账号，或者把封好的那一份交给老师统一提交。")), h("a", { class: "btn", href: LAB + "#quest", text: "去正式版的每日一题" })));
    view.appendChild(box);
  }

  /* ---------- 给老师和家长 ---------- */
  function viewTeach() {
    view.appendChild(h("h2", { text: "给老师和家长的说明" }));
    var S = function (title, body) { return h("section", { class: "card teach" }, h("h3", { text: title }), body); };
    view.appendChild(S("这是什么", [paras([
      "一个不用安装、不用注册的网页，手机和电脑都能开。七个“在不确定的情况下做决定”的小游戏，每个十几回合：先亲手打一局，再看三条简单的程序规则在同一局上怎么打，然后学一点编程、一点算法，最后自己写一条规则，在几百局上和程序比。",
      "它背后是一个给大学生和成年人用的“策略实验室”；这个青少年版去掉了和投资有关的内容，只留下数学和算法的部分。游戏里的“钱”都是分数。"])]));
    view.appendChild(S("两种 45 分钟的上法", [
      h("h4", { text: "数学课：概率与统计（猜硬币 + 掷骰子）" }),
      bullets(["5 分钟：讲“猜硬币”的规则，让每人在手机上打“今天的一局”（全班打的是同一局）。", "10 分钟：报成绩。为什么有人 14 分有人 8 分？让得分高的说说怎么猜的。打开“三条基准规则是怎么想的”，看“跟着多数猜”。", "10 分钟：想法 1“数一数：从频率估计概率”的演示表（抛 5 次、20 次、100 次、1000 次），讨论误差。", "15 分钟：换“掷骰子，见好就收”，每人打一局；然后算那笔账：累计 x 分时再掷一次平均赚 (20 − x)/6。全班一起推。", "5 分钟：作业——在“写你的规则”里把掷骰子的门槛改成 10、20、30，跑 200 局，记下平均分。"]),
      h("h4", { text: "信息课：算法与程序（猜硬币 + 写规则）" }),
      bullets(["5 分钟：每人打一局“猜硬币”。", "15 分钟：编程课第 1、3、7 课（指令、if、一条规则长什么样）。第 7 课点“在猜硬币上跑一跑”，看规则每回合看到什么、报什么。", "15 分钟：“写你的规则”：把填空填上，跑 200 局；再改成“上次是什么就猜什么”，比一比。", "10 分钟：讨论为什么“跟着多数猜”更好，引出“估计”和“探索”的想法；布置下一课的游戏（抽卡机）。"])]));
    view.appendChild(S("班级比赛怎么办", bullets(["每天“今天的一局”全班是同一局（按设备上的日期），打完点“复制成绩”，把那一行发到班级群，老师汇总。没有排行榜服务器——这是故意的，不用注册、不收数据。", "一周一个游戏：周一打一局，周三学对应的想法，周五交一条规则（截图“跑 200 局”的结果）。", "奖励用证书或者口头表扬，不要用钱。页面上的排名只是“图个乐”：想作弊的人总有办法，重要的是讨论办法本身。", "写规则的部分要电脑（手机上打字太难）；亲手打一局手机就行。"])));
    view.appendChild(S("对应哪些知识点", bullets(["高中数学 · 概率与统计：随机事件与概率、频率估计概率、条件概率、离散随机变量与期望、二项分布（猜硬币、抽卡机）、泊松分布（奶茶店，只需知道“平均数”）。", "高中信息技术 · 算法与程序：顺序、分支、循环、函数、数组；算法的描述与比较（“怎么比较两条规则”）。", "数学建模入门：把一个生活里的决定写成“看到什么、能做什么、怎么算分”，就是建模的第一步。每个游戏都可以当一道小建模题。", "初中也能用亲手打的部分（猜硬币、掷骰子、找最大的数），期望值那一课适合初三以上。"])));
    view.appendChild(S("安全和数据", bullets(["页面不联网（打开之后断网照样用）、不要账号、没有聊天、没有排行榜服务器。进度和代码只存在这台设备的浏览器里（localStorage），清除浏览数据就没了。", "学生写的代码在浏览器的隔离环境里运行：碰不到页面、碰不到网络，死循环 20 秒内被掐掉。", "游戏里没有真实的金融内容，不涉及任何投资建议。", "正式版的“每日一题”需要 GitHub 账号（13 岁以上）并且会公开用户名；班级使用时建议由老师代交。"])));
    view.appendChild(S("常见问题", bullets(["**手机上代码框太小。** 写规则请用电脑；手机上可以打局、看课、看实验。", "**学生说“跑了没反应”。** 多半是中文标点或者语法错，页面会在代码框下面用红字说明是第几行。", "**两个学生“今天的一局”不一样？** 看设备上的日期是否一致；过了零点就换了一局。", "**想换题目或者加游戏。** 游戏是数据文件（`src/teen/games.js`），每个游戏由裁判代码、几条基准规则和讲解组成；仓库在 GitHub 上。"])));
    view.appendChild(h("div", { class: "row" }, link("#home", "← 回到开始", "btn"), h("a", { class: "btn", href: LAB, text: "正式版：策略实验室" })));
  }

  /* ---------- 起 ---------- */
  route();
  window.QL_TEEN = { QL: QL, games: GAMES, lessons: LESSONS, opt: OPT, store: function () { return store; }, pub: PUB, daySeed: daySeed, today: today, runSnippet: runSnippet, runRules: runRules, refsOn: refsOn, startEpisode: startEpisode, current: function () { return cur; } };
})();
