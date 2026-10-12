// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 应用主体（十一）：十项全能。一条规则走遍十个世界，每个世界里和买入持有比长期增长率，得分取最差的那一项（计分办法见 deca.js）。
 * 我的规则：挑一条价格世界的规则，用它眼下的参数走一遍；可以再和内置规则排在一起看。
 * 大家的榜：别人贴在 GitHub 上的规则（hub.js）。每一条都在你的浏览器里、隔离环境中现跑一遍，用的是这个星期的种子，
 *           所以榜上的得分不是交的人报的，也没法针对种子事先调好：下个星期换了种子，它们要重新来过。
 * 算的事都交给 jobs.js：一件任务一个线程，别人的代码在隔离环境里。 */
(function (A) {
  "use strict";
  var h = A.h, clear = A.clear, QL = A.QL, S = A.state;
  if (typeof QL_DECA_INSTALL !== "function" || typeof QLJobs === "undefined") return;
  if (!QL.decaSeason) QL_DECA_INSTALL(QL);
  A.decaOpt = { timeout: 45000, slow: 300000 };   // 一件任务多久没动静算卡死（毫秒）；带训练的规则放宽。测试里会调小
  var mem = { mine: {}, refs: {}, board: {} };   // 这次打开页面期间算过的：同一个赛季、同一段代码、同一组参数不重算
  function season() { return QL.decaSeason(Date.now()); }
  function rate(v) { return v === -Infinity ? "破产" : v !== v || v == null ? "—" : A.pctS(v, 2); }
  function num(v) { return v === "-inf" ? -Infinity : v; }
  function wname(t) { return QL.WORLDS[t] ? QL.WORLDS[t].short : t; }
  function hasFit(code) { return /\bfunction\s+fit\s*\(/.test(code || ""); }
  function priceRules() { return A.allStrats().filter(function (s) { return !s.game; }); }
  function builtins() { return QL_STRATS.filter(function (s) { return !s.game && !hasFit(s.code); }); }
  function keyOf(code, p) { return season().id + "|" + A.hash(code) + "|" + JSON.stringify(p); }
  /** 走十项。entries: [{ id, p }]；codes: [{ id, code, mine }]。返回 { promise, cancel } */
  function runDeca(entries, codes, onProgress) {
    var slow = codes.some(function (c) { return hasFit(c.code); });
    return QLJobs.run({ kind: "deca", codes: codes, data: { seed: season().seed, n: QL.DECA.N, entries: entries }, timeout: slow ? A.decaOpt.slow : A.decaOpt.timeout, onProgress: onProgress });
  }
  A.decaRun = runDeca;
  function errText(e) {
    if (e.compile) return "代码有语法错误" + (e.line ? "（第 " + e.line + " 行）" : "") + "：" + e.message;
    return e.message || "出错了";
  }
  /** 十项的明细表 */
  function eventsTable(r) {
    var tb = h("tbody"), CAP = 0.2;
    r.rows.forEach(function (x) {
      var d = num(x.d), w = d === -Infinity ? 50 : 50 * Math.min(1, Math.abs(d) / CAP), over = Math.abs(d) > CAP;
      tb.appendChild(h("tr", { class: x.id === r.worst ? "worst" : "", "data-ev": x.id },
        h("td", null, wname(x.id), x.id === r.worst ? h("span", { class: "tag", text: "最差的一项" }) : null),
        h("td", { class: "num", text: rate(x.bench) }), h("td", { class: "num", text: rate(num(x.growth)) }),
        h("td", { class: "num" }, h("b", { class: "verdict " + (d > 0 ? "up" : d < 0 ? "down" : "flat"), text: rate(d) }), x.dse === x.dse && x.dse != null && typeof x.dse === "number" ? h("span", { class: "note", text: " ± " + A.P(x.dse, 2) }) : null),
        h("td", { class: "dc-bar" }, h("span", { class: "dc-track" }, h("i", { class: (d >= 0 ? "up" : "down") + (over ? " over" : ""), style: { width: w + "%" } })))));
    });
    return h("div", { class: "gref" }, h("table", { class: "gtab hp-tab dc-tab" },
      h("caption", { text: "每个世界 " + (r.rows[0] ? r.rows[0].N : QL.DECA.N) + " 条路径，规则和买入持有走的是同一批。数字是每年的对数增长率；最后一栏的横条在 ±20% 处封顶。" }),
      h("thead", null, h("tr", null, h("th", { text: "世界" }), h("th", { text: "买入持有" }), h("th", { text: "这条规则" }), h("th", { text: "比买入持有" }), h("th", { text: "" }))), tb));
  }
  function sayOf(r) {
    var sc = num(r.score), wn = wname(r.worst);
    if (sc === -Infinity) return "在「" + wn + "」里有路径破产了，所以得分是负无穷。";
    if (sc > 0) return "十个世界里都比买入持有好。最差的一项是「" + wn + "」，在那里每年也高出 " + A.P(sc, 2) + "。";
    if (sc === 0) return "最差的一项和买入持有打平。";
    return "最差的一项是「" + wn + "」：这条规则在那里比买入持有每年低 " + A.P(-sc, 2) + "。";
  }

  A.openDeca = function (startTab) {
    var se = season(), tab = startTab === "board" ? "board" : "mine", jobs = [], alive = true, host = h("div", { class: "dc-host" });
    var def = A.strat(), list = priceRules(), stId = !def.game ? def.id : (S.last && S.last.price) || "voltarget";
    if (!list.some(function (s) { return s.id === stId; })) stId = list[0].id;
    function stop() { jobs.splice(0).forEach(function (j) { j.cancel(); }); }
    var seg = h("div", { class: "seg", role: "group", "aria-label": "看哪一边" });
    [["mine", "我的规则"], ["board", "大家的榜"]].forEach(function (x) { seg.appendChild(h("button", { type: "button", "data-tab": x[0], text: x[1], onclick: function () { if (tab !== x[0]) { tab = x[0]; stop(); draw(); } } })); });
    var nextIn = Math.max(1, Math.ceil((se.next - Date.now()) / 864e5));
    var m = A.modal("十项全能", [
      h("p", { class: "lb-lead", text: "一条规则走遍十个世界。每个世界里，它和买入持有在同一批路径上比长期增长率；十个差里最小的那一个就是得分。想拿高分，靠的不是在哪个世界里大赚，而是在哪个世界里都不掉链子。" }),
      h("div", { class: "row tight dc-top" }, seg, h("span", { class: "sp" }), h("span", { class: "note", id: "dcSeason", text: "赛季 " + se.id + " · 还有 " + nextIn + " 天换种子" })),
      host
    ], { cls: "dcm", onClose: function () { alive = false; stop(); } });

    /* ---- 我的规则 ---- */
    function drawMine() {
      var st = A.strat(stId), p = Object.assign({}, A.sp(stId)), key = keyOf(st.code, p), out = h("div", { class: "dc-out", id: "dcOut" });
      var sel = h("select", { id: "dcRule", "aria-label": "哪一条规则", onchange: function () { stId = sel.value; stop(); draw(); } }), groups = [];
      list.forEach(function (s) { var g = s.src ? "我的策略" : s.group; if (groups.indexOf(g) < 0) groups.push(g); });
      groups.forEach(function (g) { sel.appendChild(h("optgroup", { label: g }, list.filter(function (s) { return (s.src ? "我的策略" : s.group) === g; }).map(function (s) { return h("option", { value: s.id, text: s.name, selected: s.id === stId }); }))); });
      var pl = A.paramLine(A.sschema(st), p), go = h("button", { class: "btn primary", type: "button", id: "dcRun", text: "走一遍十项", onclick: run });
      host.appendChild(h("div", { class: "row tight dc-pick" }, h("span", { class: "note", text: "规则" }), sel, go));
      host.appendChild(h("p", { class: "note", id: "dcParams", text: (pl ? "用它眼下的参数：" + pl + "。" : "这条规则没有参数。") + "要换参数，回到左栏调好再来。" + (st.foreign ? "这是别人写的规则，在隔离环境里运行。" : "") }));
      host.appendChild(out);
      function show(r) {
        clear(out);
        if (r.err) { out.appendChild(h("div", { class: "warn err", id: "dcErr", text: r.at ? "没走完：在「" + wname(r.at) + "」里出错了。" + r.err : "没走完：" + r.err })); return; }
        out.appendChild(h("div", { class: "hp-vs" }, h("div", { class: "hp-side me" }, h("span", { class: "hp-lab", text: "十项全能得分 · 每年 · " + st.name }), h("b", { class: "hp-num num", id: "dcScore", text: rate(num(r.score)) }))));
        out.appendChild(h("p", { class: "db-say", id: "dcSay", text: sayOf(r) }));
        out.appendChild(eventsTable(r));
        var acts = h("div", { class: "row tight" }), refHost = h("div", { class: "dc-refs", id: "dcRefs" });
        acts.appendChild(h("button", { class: "btn", type: "button", id: "dcRefBtn", text: "和内置规则排在一起看", onclick: function () { refs(refHost, r); } }));
        if (st.src && !st.foreign) acts.appendChild(h("button", { class: "btn", type: "button", id: "dcPost", text: "把这条规则贴到榜上", onclick: function () {
          var pk = A.rulePack(st, p, "deca", { season: se.id, score: num(r.score) === -Infinity ? null : r.score });
          A.postDialog({ kind: "deca", title: st.name + " " + rate(num(r.score)), meta: pk.meta, code: pk.code });
        } }));
        out.appendChild(acts);
        if (!st.src) out.appendChild(h("p", { class: "note", text: "内置规则人人都有，不用贴。想上榜：在左栏这条规则下面点\"代码与说明\"，改一改另存成你自己的，或者让 " + A.AI + " 替你写一条，再回到这里。" }));
        out.appendChild(refHost);
        if (mem.refs[se.id]) refs(refHost, r);
      }
      function run() {
        var err = QLJobs.syntax(st.code);
        if (err) { clear(out); out.appendChild(h("div", { class: "warn err", id: "dcErr", text: "代码有语法错误：" + err })); return; }
        go.disabled = true; clear(out);
        var prog = h("p", { class: "note", id: "dcProg", text: "正在准备…" }); out.appendChild(prog);
        var j = runDeca([{ id: "r", p: p }], [{ id: "r", code: st.code, mine: !st.foreign }], function (pm) { if (pm.event) prog.textContent = "第 " + (pm.i + 1) + " / " + pm.n + " 项：" + wname(pm.event) + "…"; });
        jobs.push(j);
        j.promise.then(function (res) { var r = res.entries[0]; mem.mine[key] = r; if (alive && tab === "mine") { go.disabled = false; show(r); } },
          function (e) { if (e && e.cancelled) return; if (alive && tab === "mine") { go.disabled = false; clear(out); out.appendChild(h("div", { class: "warn err", id: "dcErr", text: errText(e || {}) })); } });
      }
      if (mem.mine[key]) show(mem.mine[key]);
    }
    /** 内置规则各走一遍十项（一个赛季只算一次），和眼下这条排在一起 */
    function refs(refHost, mine) {
      function show(rows) {
        clear(refHost);
        var all = rows.map(function (x) { return { name: x.name, score: num(x.score), worst: x.worst, err: x.err }; }).concat([{ name: A.strat(stId).name, score: num(mine.score), worst: mine.worst, me: true }]);
        all.sort(function (a, b) { return (b.score === b.score ? b.score : -Infinity) - (a.score === a.score ? a.score : -Infinity) || (a.me ? -1 : 1); });
        var tb = h("tbody");
        all.forEach(function (x, i) { tb.appendChild(h("tr", { class: x.me ? "me" : "", "data-me": x.me ? "1" : null }, h("td", { class: "num", text: String(i + 1) }), h("td", null, x.me ? [h("b", { text: x.name }), "（眼下这条）"] : x.name), h("td", { class: "num", text: x.err ? "出错" : rate(x.score) }), h("td", { text: x.err ? "" : wname(x.worst) }))); });
        refHost.appendChild(h("div", { class: "gref" }, h("table", { class: "gtab hp-tab db-tab dc-reftab", id: "dcRefTab" }, h("caption", { text: "内置规则用的是各自的默认参数；带训练的几条没有列进来。买入持有的得分按定义是 0。" }),
          h("thead", null, h("tr", null, h("th", { text: "名次" }), h("th", { text: "规则" }), h("th", { text: "得分" }), h("th", { text: "最差的一项" }))), tb)));
      }
      if (mem.refs[se.id]) { show(mem.refs[se.id]); return; }
      clear(refHost);
      var L = builtins(), prog = h("p", { class: "note", id: "dcRefProg", text: "正在让 " + L.length + " 条内置规则各走一遍…" }), done = 0; refHost.appendChild(prog);
      var j = runDeca(L.map(function (s) { var p = {}; (s.params || []).forEach(function (q) { p[q.key] = q.def; }); return { id: s.id, p: p }; }), L.map(function (s) { return { id: s.id, code: s.code, mine: true }; }), function (pm) { if (pm.done) { done++; prog.textContent = "正在让 " + L.length + " 条内置规则各走一遍…（" + done + " / " + L.length + "）"; } });
      jobs.push(j);
      j.promise.then(function (res) {
        var rows = res.entries.map(function (e, i) { return { name: L[i].name, score: e.score, worst: e.worst, err: e.err || "" }; });
        mem.refs[se.id] = rows; if (alive && tab === "mine") show(rows);
      }, function (e) { if (e && e.cancelled) return; if (alive) { clear(refHost); refHost.appendChild(h("div", { class: "warn err", text: errText(e || {}) })); } });
    }

    /* ---- 大家的榜 ---- */
    function drawBoard(fresh) {
      var box = h("div", { class: "db dc-board", id: "dcBoard" }); host.appendChild(box);
      var st = { loading: true, err: null, rows: [], left: 0 };
      function paint() {
        clear(box);
        box.appendChild(h("div", { class: "row tight db-head" }, h("h3", { class: "db-title", text: "这个星期的榜" }), h("span", { class: "sp" }),
          st.left ? h("span", { class: "note", id: "dcLeft", text: "还有 " + st.left + " 条在跑…" }) : null,
          h("button", { class: "btn small", type: "button", id: "dcRefresh", disabled: st.loading, text: st.loading ? "正在取…" : "刷新", onclick: function () { stop(); clear(host); drawBoard(true); } })));
        if (st.err) box.appendChild(h("div", { class: "warn", id: "dcBoardErr", text: st.err.limited ? "GitHub 限制了这个网络的访问次数（不登录每小时 60 次）。过一会儿再刷新。" : "连不上 GitHub，榜暂时看不了。" }));
        if (!st.loading && !st.rows.length && !st.err) box.appendChild(h("p", { class: "db-say", id: "dcEmpty", text: "榜上还没有规则。在\"我的规则\"里走一遍十项，就可以把自己的贴上来。" }));
        if (st.rows.length) {
          var okRows = st.rows.filter(function (x) { return x.res && !x.res.err; }).sort(function (a, b) { return num(b.res.score) - num(a.res.score) || b.item.up - a.item.up || a.item.at - b.item.at; });
          var rest = st.rows.filter(function (x) { return okRows.indexOf(x) < 0; }), tb = h("tbody");
          okRows.concat(rest).forEach(function (x, i) {
            var r = x.res, good = r && !r.err;
            tb.appendChild(h("tr", { "data-n": x.item.n }, h("td", { class: "num", text: good ? String(i + 1) : "—" }),
              h("td", null, h("b", { text: x.rule.st.name }), " ", h("a", { href: x.item.url, target: "_blank", rel: "noopener", text: "@" + x.item.user })),
              h("td", { class: good ? "num" : "note", text: good ? rate(num(r.score)) : x.fail ? x.fail : r ? "没走完：" + r.err : "在排队…" }),
              h("td", { text: good ? wname(r.worst) : "" }), h("td", { class: "num", text: x.item.up ? "👍 " + x.item.up : "" }),
              h("td", null, h("button", { class: "btn small", type: "button", "data-adopt": x.item.n, text: "载入", title: "放进\"我的策略\"，可以看代码、改参数、自己跑", onclick: function () { m.close(); A.adoptRule(x.rule); } }))));
          });
          box.appendChild(h("div", { class: "gref" }, h("table", { class: "gtab hp-tab db-tab dc-boardtab" }, h("thead", null, h("tr", null, h("th", { text: "名次" }), h("th", { text: "规则" }), h("th", { text: "得分" }), h("th", { text: "最差的一项" }), h("th", { text: "" }), h("th", { text: "" }))), tb)));
        }
        box.appendChild(h("p", { class: "note db-how", text: "榜上的得分不是交的人报的：每条规则都在你的浏览器里现跑一遍，用的是这个星期的种子。别人写的代码在隔离环境里运行，碰不到这张页面里的任何东西，也连不了网。想给哪条规则打分，点它后面的用户名，去那条 Issue 上点 👍。" }));
      }
      paint();
      QLHub.list({ kind: "deca", fresh: !!fresh }).then(function (res) {
        if (!alive || tab !== "board") return;
        st.loading = false; st.err = res.stale ? res.error : null;
        var seen = {};
        st.rows = res.items.map(function (it) { var rule = A.ruleFromItem(it); return rule && !rule.st.game ? { item: it, rule: rule, res: null, fail: "" } : null; }).filter(Boolean)
          .sort(function (a, b) { return b.item.up - a.item.up || b.item.at - a.item.at; })
          .filter(function (x) { seen[x.item.user] = (seen[x.item.user] || 0) + 1; return seen[x.item.user] <= 3; }).slice(0, 40);   // 每个账号最多看三条，一共最多 40 条
        var queue = [];
        st.rows.forEach(function (x) { var k = keyOf(x.rule.st.code, x.rule.p), c = mem.board[k]; if (c) x.res = c; else queue.push([x, k]); });
        st.left = queue.length; paint();
        (function next() {
          if (!alive || tab !== "board") return;
          var q = queue.shift(); if (!q) { st.left = 0; paint(); return; }
          var x = q[0], bad = QLJobs.syntax(x.rule.st.code);
          if (bad) { x.fail = "代码有语法错误"; st.left = queue.length; paint(); next(); return; }
          var j = runDeca([{ id: "r", p: x.rule.p }], [{ id: "r", code: x.rule.st.code, mine: false }]);
          jobs.push(j);
          j.promise.then(function (out) { x.res = mem.board[q[1]] = out.entries[0]; }, function (e) { if (e && e.cancelled) return; x.fail = e && e.timeout ? "跑得太久，停掉了" : e && e.nostart ? "这个浏览器开不了隔离环境" : e && e.compile ? "代码有语法错误" : "出错了"; })
            .then(function () { st.left = queue.length; if (alive && tab === "board") { paint(); next(); } });
        })();
      }, function (e) { if (!alive) return; st.loading = false; st.err = e || {}; paint(); });
    }
    function draw() {
      clear(host);
      Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-tab") === tab ? "true" : "false"); });
      if (tab === "mine") drawMine(); else drawBoard(false);
    }
    draw();
    return m;
  };

  if (A.lobbyAdd) A.lobbyAdd({
    id: "deca", order: 30, route: "deca", kicker: "规则对规则", title: "十项全能", label: "让一条规则走十项", keys: "decathlon 十项 全能 最差 稳健 榜 规则",
    blurb: "一条规则走遍十个世界，按最差的那一项计分。看看你的规则是不是只在一种行情里好使；榜上别人的规则每个星期换一批新路径重跑。",
    status: function () { var se = season(); return "赛季 " + se.id; },
    go: function (arg) { A.openDeca(arg); }
  });
})(App);
