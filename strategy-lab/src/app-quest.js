// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 应用主体（十四）：每日一题。每天一套新规则（一个带裁判的小游戏），大家各写一条规则来解（引擎见 quest.js）。
 *   题：是数据，不随页面发布。页面按日期去取 daily/q/日期.json；这一天没有题，就从以前的题里按日期挑一道重温。
 *   试：在"公开的几组数据"上跑你的规则和几条基准规则，想试几次都行。
 *   交：把规则贴成一条 GitHub Issue（hub.js）。当天 UTC 24 点截止，同一个账号只算截止前最后交的那一条。
 *   结算：截止之后，用公共随机信标（drand）那一刻发布的随机数定出"结算的几组数据"，在看榜的人的浏览器里
 *         把每个人的规则重跑一遍、排名次。每条规则各自和裁判单独在一个隔离环境里跑，互相碰不到。
 * 截止前别人交的代码在 GitHub 上看得到；截止后改 Issue 的人只能标出来、拦不住。规则和裁判在同一个线程里也没法完全隔绝：这个榜图个乐。 */
(function (A) {
  "use strict";
  var h = A.h, clear = A.clear, QL = A.QL, F = A.F;
  if (typeof QL_QUEST_INSTALL !== "function" || typeof QL_SHOP_INSTALL !== "function" || typeof QLJobs === "undefined" || typeof QLHub === "undefined" || !A.shopKit) return;
  if (!QL.SHOP) QL_SHOP_INSTALL(QL);
  if (!QL.QUEST) QL_QUEST_INSTALL(QL);
  var Q = QL.QUEST, KIT = A.shopKit, KEY = "ql.quest.v1", LANG = /^en/i.test(document.documentElement.getAttribute("lang") || "") ? "en" : "zh";
  // base：题目放在哪里（英文页面在 en/ 里，要往上一层）。relays：取结算随机数的几个地址，一个不行换下一个。测试里会换掉
  A.questOpt = { timeout: 30000, fetchMs: 9000, base: (LANG === "en" ? "../" : "") + "daily/", relays: ["https://api.drand.sh", "https://api2.drand.sh", "https://api3.drand.sh", "https://drand.cloudflare.com"] };

  /* ---------- 存档：每天一份草稿，外加取到过的结算随机数 ---------- */
  var store = { v: 1, days: {}, fin: {} };
  try {
    var o0 = JSON.parse(localStorage.getItem(KEY) || "null");
    if (o0 && o0.v === 1) {
      if (o0.days && typeof o0.days === "object") Object.keys(o0.days).slice(-80).forEach(function (d) {
        var r = o0.days[d]; if (!r || !(QL.questOpen(d) === QL.questOpen(d)) || typeof r.code !== "string") return;
        store.days[d] = { cid: String(r.cid || ""), title: A.cleanText(r.title, 60), name: A.cleanText(r.name, 40), par: typeof r.par === "string" ? r.par.slice(0, 400) : "", code: r.code.slice(0, Q.maxCode), posted: r.posted && typeof r.posted.h === "string" ? { h: r.posted.h.slice(0, 16), at: +r.posted.at || 0 } : null };
      });
      if (o0.fin && typeof o0.fin === "object") Object.keys(o0.fin).slice(-80).forEach(function (d) { var f = o0.fin[d]; if (f && /^[0-9a-f]{64}$/.test(f.randomness) && f.round === QL.questRound(d)) store.fin[d] = { round: f.round, randomness: f.randomness }; });
    }
  } catch (e) {}
  function save() {
    try {
      ["days", "fin"].forEach(function (k) { var ks = Object.keys(store[k]).sort(); if (ks.length > 60) ks.slice(0, ks.length - 60).forEach(function (d) { delete store[k][d]; }); });
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch (e) {}
  }
  A.questStore = function () { return store; };

  /* ---------- 小工具 ---------- */
  function T(x) { return QL.questText(x, LANG); }
  function today() { return new Date(Date.now()).toISOString().slice(0, 10); }
  function dayShift(day, d) { return new Date(QL.questOpen(day) + d * 864e5).toISOString().slice(0, 10); }
  /** 一段时间写成"几小时几分钟" */
  function spanText(ms) {
    var hr = Math.floor(ms / 36e5), mi = Math.floor((ms % 36e5) / 6e4);
    return hr > 0 ? hr + " 小时 " + mi + " 分钟" : Math.max(1, mi) + " 分钟";
  }
  function leftText(day) { return spanText(QL.questDeadline(day) - Date.now()); }
  function num(spec, v) { return v === v && v != null ? F(v, spec.digits) : "—"; }
  function pm(spec, mean, se) { return [h("b", { text: num(spec, mean) }), se === se && se != null ? h("span", { class: "note", text: " ± " + F(se, spec.digits) }) : null]; }
  function verdict(spec, d, dse) { var up = spec.higher ? d > 2 * dse : d < -2 * dse, down = spec.higher ? d < -2 * dse : d > 2 * dse; return [h("b", { class: "verdict " + (up ? "up" : down ? "down" : "flat"), text: A.sgn(F(d, spec.digits)) }), h("span", { class: "note", text: " ± " + F(dse, spec.digits) })]; }
  function codeHash(code, p) { return QL.questHash(QL.questCanon(code) + "|" + KIT.pLine(p || {})).toString(36); }
  function avatar(u) { return u ? h("img", { class: "db-av", src: u + (u.indexOf("?") < 0 ? "?" : "&") + "s=40", alt: "", width: 18, height: 18, loading: "lazy" }) : null; }
  function hhmm(ms) { return new Date(ms).toISOString().slice(11, 16) + " UTC"; }
  function md(el, text) { if (typeof QLMD !== "undefined") QLMD.mount(el, text); else el.textContent = text; return el; }

  /* ---------- 取东西：题目、交上来的规则、结算的随机数 ---------- */
  /** 取一个 JSON。失败时：{ offline }（连不上、超时）或 { status }（服务器说没有）。
   *  own：是本站自己的文件。本站的文件每次都向服务器核对一遍，新合并的题马上看得到；
   *  别人的服务器（drand）就用最普通的请求，不带任何额外的设定，免得有的浏览器为此先发一次预检 */
  function getJson(url, own) {
    if (typeof fetch !== "function") return Promise.reject({ offline: true });
    var ctl = typeof AbortController === "function" ? new AbortController() : null, t = ctl ? setTimeout(function () { ctl.abort(); }, A.questOpt.fetchMs) : 0, opt = {};
    if (ctl) opt.signal = ctl.signal;
    if (own) opt.cache = "no-cache";
    return fetch(url, opt).then(function (r) {
      clearTimeout(t); if (!r.ok) throw { status: r.status };
      return r.json().then(null, function () { throw { status: 0, bad: true }; });
    }, function () { clearTimeout(t); throw { offline: true }; });
  }
  var idx = null, specs = {};
  /** 有题的日子（排好序的）。十分钟内不重取 */
  function loadIndex() {
    if (idx && Date.now() - idx.at < 6e5) return Promise.resolve(idx.days);
    return getJson(A.questOpt.base + "index.json", true).then(function (o) {
      var days = o && o.v === 1 && Array.isArray(o.days) ? o.days.filter(function (d) { return typeof d === "string" && QL.questOpen(d) === QL.questOpen(d); }).sort() : [];
      idx = { at: Date.now(), days: days }; return days;
    });
  }
  /** 这一天的题：{ spec, rerun }。这一天没有题时，从更早的题里按日期挑一道（人人挑到的是同一道），rerun 是它原来的日子。
   *  失败时：{ offline } 连不上；{ none } 一道题也没有；{ bad } 题目文件读不懂 */
  function loadSpec(day) {
    if (specs[day]) return Promise.resolve(specs[day]);
    return loadIndex().then(function (days) {
      var src = day;
      if (days.indexOf(day) < 0) { var past = days.filter(function (d) { return d < day; }); if (!past.length) throw { none: true, first: days.length ? days[0] : "" }; src = past[QL.questHash("rerun|" + day) % past.length]; }
      return getJson(A.questOpt.base + "q/" + src + ".json", true).then(function (raw) {
        if (!raw || raw.day !== src) throw { bad: true };
        var spec = QL.questOk(src === day ? raw : Object.assign({}, raw, { day: day })); if (!spec) throw { bad: true };
        return (specs[day] = { spec: spec, rerun: src === day ? "" : src });
      }, function (e) { throw e && e.status ? { bad: true } : e; });
    }, function (e) { throw e && e.status === 404 ? { none: true } : e; });
  }
  function loadEntries(spec, fresh) {
    return QLHub.list({ kind: "quest", since: spec.day + "T00:00:00Z", fresh: !!fresh }).then(function (res) { return { rows: QL.questEntries(res.items, spec), err: res.stale ? res.error : null }; });
  }
  function hex2bytes(s) { var a = new Uint8Array(s.length >> 1), i; for (i = 0; i < a.length; i++) a[i] = parseInt(s.substr(2 * i, 2), 16); return a; }
  /** 信标给的东西自己对不对得上：随机数应该是签名的 SHA-256。算不了（没有 crypto.subtle）就当它对 */
  function sigOk(o) {
    try {
      if (!/^([0-9a-f]{2})+$/i.test(o.signature) || !window.crypto || !crypto.subtle) return Promise.resolve(true);
      return crypto.subtle.digest("SHA-256", hex2bytes(o.signature)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join("") === String(o.randomness).toLowerCase(); }, function () { return true; });
    } catch (e) { return Promise.resolve(true); }
  }
  /** 这一天结算用的随机数：{ round, randomness }。失败时：{ early } 还没到时候；{ offline } 几个地址都取不到 */
  function beacon(day) {
    var round = QL.questRound(day), have = store.fin[day];
    if (have && have.round === round) return Promise.resolve(have);
    if (Date.now() < QL.beaconTime(round)) return Promise.reject({ early: true });
    var relays = A.questOpt.relays.slice(), early = false;
    function next() {
      if (!relays.length) return Promise.reject(early ? { early: true } : { offline: true });
      var base = relays.shift();
      return getJson(base + "/" + Q.beacon.chain + "/public/" + round).then(function (o) {
        if (!o || o.round !== round || !/^[0-9a-f]{64}$/i.test(o.randomness)) return next();
        return sigOk(o).then(function (ok) { if (!ok) return next(); var f = store.fin[day] = { round: round, randomness: String(o.randomness).toLowerCase() }; save(); return f; });
      }, function (e) { if (e && (e.status === 404 || e.status === 425)) early = true; return next(); });
    }
    return next();
  }
  A.questBeacon = beacon; A.questLoad = loadSpec;

  /* ---------- 跑 ---------- */
  /** players: [{ id, code, p, slot, foreign }]。裁判和基准规则是这个网站自己发布的，不算别人的代码 */
  function runJob(spec, seeds, players, cut, trace, onProgress) {
    return QLJobs.run({ kind: "quest", timeout: A.questOpt.timeout,
      codes: [{ id: "game", code: spec.canon, mine: true }].concat(players.map(function (p) { return { id: p.id, code: p.code, mine: !p.foreign }; })),
      data: { game: "game", gp: spec.p, T: spec.T, K: spec.sets.K, seeds: seeds, cut: cut || 0, trace: !!trace, entries: players.map(function (p) { return { id: p.id, p: p.p, slot: p.slot }; }) }, onProgress: onProgress });
  }
  function refPlayers(spec) { return spec.refs.map(function (r, i) { return { id: "ref:" + r.id, code: r.canon, p: r.p, slot: i }; }); }
  function failText(e) {
    if (e && e.nostart) return e.message || "这个浏览器开不了隔离环境。";
    if (e && e.timeout) return "卡住了：多半是代码里有死循环。";
    if (e && e.compile) return "代码有语法错误" + (e.line ? "（第 " + e.line + " 行）" : "") + "：" + e.message;
    return "出错了：" + (e && e.message || "不知道为什么");
  }
  /** 把一批人的规则挨个跑一遍：每个人单独一件任务（和基准规则一起），所以谁也碰不到谁。
   *  people: [{ key, code, p, foreign }]；step(i, n) 报进度；返回 { stop() }，跑完调用 done(rows)：rows[i] 是 { row } 或 { err } */
  function scoreAll(spec, seeds, cut, people, step, done) {
    var out = [], i = 0, cur = null, dead = false, bench = refPlayers(spec)[0];
    function next() {
      if (dead) return;
      if (i >= people.length) { done(out); return; }
      step(i, people.length);
      var p = people[i], j = cur = runJob(spec, seeds, [bench, { id: "you", code: p.code, p: p.p, slot: Q.slot, foreign: !!p.foreign }], cut, false);
      j.promise.then(function (res) {
        if (dead) return;
        var row = res.rows.filter(function (r) { return r.id === "you"; })[0], sk = (res.skipped || []).filter(function (s) { return s.id === "you"; })[0];
        out.push(row && !row.err ? { row: row } : { err: row ? "中途出错：" + row.err : sk ? sk.err : "没能上场" }); i++; next();
      }, function (e) {
        if (dead || (e && e.cancelled)) return;
        if (e && e.nostart) { dead = true; done(null, failText(e)); return; }
        out.push({ err: failText(e) }); i++; next();
      });
    }
    next();
    return { stop: function () { dead = true; if (cur) cur.cancel(); } };
  }

  /* ---------- 给 AI 的说明 ---------- */
  function rulePrompt(spec, code, par) {
    return ["请替我写一条规则，用来解下面这道题。只回一段 JavaScript 代码，不要解释。", "", "题目：" + T(spec.title), T(spec.about), T(spec.note) ? "\n" + T(spec.note) : "", "",
      "裁判的代码（规则看不到 G，只看得到 show 返回的东西）：", T(spec.code), Object.keys(spec.p).length ? "\n题目的参数（规则里用 s.g 读）：" + KIT.pLine(spec.p) : "", "", "接口：", KIT.ruleDoc(), "",
      "计分：每条规则在几组数据上各打 " + spec.sets.K + " 局，取平均每局得分，" + (spec.higher ? "越高越好" : "越低越好") + "。结算时换的是另外几组数据，所以不要去凑公开的那几组。",
      "要求：只定义 decide（需要的话加 init），不要有别的顶层语句；不要用 eval、不要联网、不要用 Math.random（要随机数用 s.rnd()）；参数都从 p 里读。",
      code ? "\n我现在的代码（请在它的基础上改）：\n" + code + (par ? "\n参数：" + par : "") : "", "", "我的想法："].join("\n");
  }

  /* ---------- 题面（今天的和往期的都用） ---------- */
  function statement(spec, host) {
    host.appendChild(md(h("div", { class: "qs-about", id: "qsAbout" }), T(spec.about)));
    if (T(spec.note)) host.appendChild(md(h("div", { class: "qs-note", id: "qsNote" }), T(spec.note)));
    host.appendChild(h("p", { class: "note", id: "qsSets", text: "每局最多 " + spec.T + " 回合。公开的数据 " + spec.sets.pub + " 组，结算的数据 " + spec.sets.fin + " 组，每组 " + spec.sets.K + " 局；成绩是平均每局得分，" + (spec.higher ? "越高越好" : "越低越好") + "。" + (Object.keys(spec.p).length ? "题目的参数（规则里用 s.g 读）：" + KIT.pLine(spec.p) + "。" : "") }));
    host.appendChild(h("details", { class: "more", id: "qsGame" }, h("summary", { text: "裁判的代码" }), h("div", { class: "more-body" }, h("pre", { class: "code", id: "qsGameCode", text: T(spec.code) }))));
  }
  function refList(spec, host) {
    var list = h("div", { class: "ar-list", id: "qsRefs" });
    spec.refs.forEach(function (r, i) {
      list.appendChild(h("div", { class: "ar-rule", "data-ref": r.id }, h("div", { class: "ar-rtxt sh-txt" }, h("b", { text: T(r.name) }), i === 0 ? h("span", { class: "tag", text: "基准" }) : null, h("span", { class: "note", text: T(r.summary) + (Object.keys(r.p).length ? "（" + KIT.pLine(r.p) + "）" : "") })),
        h("button", { class: "btn small", type: "button", "data-code": r.id, text: "看代码", onclick: function () { A.modal(T(r.name), [h("pre", { class: "code", id: "qsRefCode", text: T(r.code) }), Object.keys(r.p).length ? h("p", { class: "note", text: "参数：" + KIT.pLine(r.p) }) : null], { cls: "are" }); } })));
    });
    host.appendChild(list);
  }
  function loadFail(e, what) {
    if (e && e.none) {
      // 题已经排好了、只是还没到第一天：说清楚哪天开始。往回翻到了第一道题之前：说清楚第一道题是哪天的
      if (e.first && e.first > today()) return "第一道题 " + e.first + " 开放（UTC 0 点，离现在还有 " + spanText(QL.questOpen(e.first) - Date.now()) + "）。";
      if (e.first) return "这一天还没有每日一题：第一道题是 " + e.first + " 的。";
      return "还没有题。每周会放出新的一批。";
    }
    if (e && e.bad) return "这一天的题读不出来（文件的格式不对）。";
    if (e && e.limited) return "GitHub 限制了这个网络的访问次数（不登录每小时 60 次）。过一会儿再刷新。";
    return what + "取不到：连不上网，或者你打开的是一份离线的副本。每日一题要在网站上才有。";
  }

  /* ================= 今天的题 ================= */
  A.openQuest = function (dayArg) {
    var day = today();
    if (dayArg && typeof dayArg === "string" && QL.questOpen(dayArg) === QL.questOpen(dayArg) && dayArg < day) return A.openQuestBoard(dayArg);
    var host = h("div", { class: "ar-host qs-host" }, h("p", { class: "note", id: "qsLoading", text: "正在取今天的题…" })), alive = true, job = null, bjob = null, tick = 0, flushDraft = null;
    function stop() { if (job) { job.cancel(); job = null; } if (bjob) { bjob.stop(); bjob = null; } }
    // 草稿是停笔 0.3 秒之后才存的；关掉对话框、离开页面的时候，把还没来得及存的那几个字也存下来
    function onHide() { if (flushDraft) flushDraft(); }
    window.addEventListener("pagehide", onHide);
    var m = A.modal("每日一题", host, { cls: "arm", onClose: function () { alive = false; stop(); clearInterval(tick); onHide(); window.removeEventListener("pagehide", onHide); } });
    function fail(e) { if (!alive) return; clear(host); host.appendChild(h("div", { class: "warn", id: "qsLoadErr", text: loadFail(e, "今天的题") })); host.appendChild(h("div", { class: "row tight" }, h("button", { class: "btn", type: "button", id: "qsRetry", text: "再试一次", onclick: function () { clear(host); host.appendChild(h("p", { class: "note", id: "qsLoading", text: "正在取今天的题…" })); go(); } }))); }
    function go() { loadSpec(day).then(function (x) { if (alive) draw(x.spec, x.rerun); }, fail); }
    function draw(spec, rerun) {
      clear(host);
      var rec = store.days[day], pubSeeds = QL.questPubSeeds(spec), last = null, ents = null, entErr = null, entLoading = false, pubBoard = null;
      if (!rec || rec.cid !== spec.cid) rec = store.days[day] = { cid: spec.cid, title: T(spec.title), name: "", par: KIT.pLine(spec.starter.p), code: T(spec.starter.code), posted: null };
      rec.title = T(spec.title); save();
      var title = m.box.querySelector(".modal-h h2"); if (title) title.textContent = "每日一题 · " + T(spec.title);
      var banner = h("p", { class: "note db-banner", id: "qsBanner" });
      function closed() { return Date.now() >= QL.questDeadline(day); }
      function paintBanner() {
        banner.textContent = (rerun ? "这一天没有新题，重温 " + rerun + " 的一道旧题。" : "") + (closed() ? day + " 的题已经截止。成绩用另外 " + spec.sets.fin + " 组数据结算，点下面的\"看结算\"。"
          : day + " · 离截止还有 " + leftText(day) + "（UTC 0 点，北京时间早上 8 点）。截止之后换另外 " + spec.sets.fin + " 组数据结算、排名。");
        if (post) post.disabled = closed();
      }
      host.appendChild(banner);
      statement(spec, host);
      host.appendChild(h("h3", { class: "db-title", text: "基准规则" }));
      refList(spec, host);

      /* 我的规则 */
      host.appendChild(h("h3", { class: "db-title", text: "你的规则" }));
      var name = h("input", { type: "text", id: "qsName", maxlength: 40, value: rec.name, placeholder: "给它起个名字（交上去的时候用）", "aria-label": "规则的名字" });
      var par = h("input", { type: "text", id: "qsPar", class: "num", value: rec.par, placeholder: "比如 c = 20（没有就留空）", "aria-label": "参数", spellcheck: "false" });
      var ta = h("textarea", { class: "codeedit", id: "qsCode", spellcheck: "false", "aria-label": "规则的代码" }); ta.value = rec.code;
      var err = h("div", { class: "warn err", id: "qsErr", hidden: true }), out = h("div", { class: "ar-out", id: "qsOut" });
      var dirty = false, flush = flushDraft = function () { if (!dirty) return; dirty = false; rec.name = A.cleanText(name.value, 40); rec.par = par.value.slice(0, 400); rec.code = ta.value.slice(0, Q.maxCode); save(); };
      var later = A.debounce(flush, 300), keep = function () { dirty = true; later(); };
      [name, par, ta].forEach(function (el) { el.addEventListener("input", keep); });
      function bad(msg) { err.hidden = false; err.textContent = msg; }
      /** 读出眼下写的规则：{ name, p, code }；写得不对时返回一句话 */
      function read() {
        var p = KIT.parseP(par.value), code = ta.value, syn = QLJobs.syntax(code);
        if (!p) return "参数的写法不对。照这个样子写：c = 20, up = 2（名字用字母，值是数）。";
        if (syn) return "代码有语法错误：" + syn;
        if (!/\bfunction\s+decide\s*\(/.test(code)) return "代码里要有 function decide(s, p, st)。";
        if (code.length > Q.maxCode) return "代码太长了（上限两万字）。";
        return { name: A.cleanText(name.value, 40) || "没有名字的规则", p: p, code: code };
      }
      host.appendChild(h("div", { class: "ar-form" }, h("label", { for: "qsName", text: "名字" }), name, h("label", { for: "qsPar", text: "参数" }), par));
      host.appendChild(ta); host.appendChild(err);
      var tryBtn = h("button", { class: "btn primary", type: "button", id: "qsTry", text: "在公开的 " + spec.sets.pub + " 组上试", onclick: tryIt });
      var post = h("button", { class: "btn", type: "button", id: "qsPost", text: "交上去", title: "把这条规则贴成一条 GitHub Issue。截止之前可以再交，只算最后交的那一条", onclick: submit });
      host.appendChild(h("div", { class: "row tight ar-acts" }, tryBtn, post,
        h("button", { class: "btn", type: "button", id: "qsAi", text: "复制给 AI 的说明", title: "把题目、裁判的代码、接口和现在的代码复制下来，贴给任何一个 AI，让它替你写", onclick: function () { A.copy(rulePrompt(spec, ta.value, par.value.trim())); } }),
        h("button", { class: "btn", type: "button", id: "qsReset", text: "还原成起始代码", onclick: function () { ta.value = T(spec.starter.code); par.value = KIT.pLine(spec.starter.p); dirty = true; flush(); err.hidden = true; } })));
      host.appendChild(h("details", { class: "more" }, h("summary", { text: "规则能用到的东西" }), h("div", { class: "more-body" }, h("pre", { class: "code", id: "qsDoc", text: KIT.ruleDoc() }))));
      host.appendChild(out);

      function tryIt() {
        flush();
        var r = read(); err.hidden = true; clear(out);
        if (typeof r === "string") { bad(r); return; }
        stop(); tryBtn.disabled = true;
        var prog = h("p", { class: "note", id: "qsProg", text: "正在发牌…" }); out.appendChild(prog);
        var players = refPlayers(spec).concat([{ id: "you", code: r.code, p: r.p, slot: Q.slot }]);
        var j = job = runJob(spec, pubSeeds, players, 0, true, function (pm) { prog.textContent = "第 " + (pm.i + 1) + " / " + pm.n + " 条规则，第 " + (pm.s + 1) + " / " + pm.S + " 组…"; });
        j.promise.then(function (res) { if (job === j) job = null; if (!alive) return; tryBtn.disabled = false; last = res; clear(out); showTry(res); },
          function (e) { if (job === j) job = null; if (!alive || (e && e.cancelled)) return; tryBtn.disabled = false; clear(out); bad(e && e.id && e.id !== "you" && !e.timeout ? "题目自己的代码出错了：" + (e.message || "") : failText(e)); });
      }
      function nameOf(id) { if (id === "you") return "你的规则"; var r = spec.refs.filter(function (x) { return "ref:" + x.id === id; })[0]; return r ? T(r.name) : id; }
      function showTry(res) {
        (res.skipped || []).forEach(function (x) { out.appendChild(h("div", { class: "warn", "data-skip": x.id, text: "「" + nameOf(x.id) + "」没能上场：" + x.err })); });
        var base = res.rows[0], key = function (r) { return r.err || !(r.mean === r.mean) ? -Infinity : spec.higher ? r.mean : -r.mean; }, rows = res.rows.slice().sort(function (a, b) { return key(b) - key(a) || 0; }), tb = h("tbody"), rank = 0;
        rows.forEach(function (r) {
          var me = r.id === "you";
          tb.appendChild(h("tr", { class: me ? "me" : "ref", "data-rule": r.id }, h("td", { class: "num", text: r.err ? "—" : String(++rank) }),
            h("td", null, h("b", { text: nameOf(r.id) }), r === base ? h("span", { class: "tag", text: "基准" }) : null, r.err ? h("span", { class: "note", text: " 中途出错：" + r.err }) : r.bad > 0 ? h("span", { class: "note", text: " 有 " + A.P(r.bad, 1) + " 的回合报的不是数" }) : null),
            h("td", { class: "num" }, r.err ? "—" : pm(spec, r.mean, r.se)),
            h("td", { class: "num" }, r.err || r === base || !(r.d === r.d) ? "—" : verdict(spec, r.d, r.dse)),
            h("td", { class: "num qs-sets", text: r.err ? "—" : r.sets.map(function (v) { return F(v, spec.digits); }).join("  ") })));
        });
        out.appendChild(h("div", { class: "gref" }, h("table", { class: "gtab hp-tab db-tab ar-tab sh-tab", id: "qsTab" },
          h("caption", { text: "公开的 " + res.n + " 组，每组 " + res.K + " 局；每一局发给各条规则的是同一副牌。± 后面是标准误。" }),
          h("thead", null, h("tr", null, h("th", { text: "名次" }), h("th", { text: "规则" }), h("th", { text: "平均每局得分" }), h("th", { text: "比基准多" }), h("th", { text: "各组的平均" }))), tb)));
        out.appendChild(h("p", { class: "note", id: "qsHint", text: "这只是公开的 " + res.n + " 组。结算用的是另外 " + spec.sets.fin + " 组，截止之前谁也不知道是哪几组，所以别去凑这几组的数。" }));
        var tr = (res.trace || []).filter(function (x) { return x.log && x.log.length; });
        if (tr.length) {
          var sel = h("select", { id: "qsTraceSel", "aria-label": "看哪条规则的第一局" }, tr.map(function (x) { return h("option", { value: x.id, text: nameOf(x.id), selected: x.id === "you" }); })), box = h("div", { class: "gref" });
          var paint = function () {
            var x = tr.filter(function (q) { return q.id === sel.value; })[0] || tr[0], tb2 = h("tbody");
            x.log.forEach(function (o, t) { tb2.appendChild(h("tr", null, h("td", { class: "num", text: String(t + 1) }), h("td", { class: "sh-see", text: KIT.seeText(o.see) }), h("td", { class: "num", text: o.a === o.a ? String(+o.a.toPrecision(6)) : "不是数" }), h("td", { class: "num", text: A.sgn(F(o.gain, 3)) }))); });
            clear(box); box.appendChild(h("table", { class: "gtab hp-tab sh-trace", id: "qsTraceTab" }, h("thead", null, h("tr", null, h("th", { text: "回合" }), h("th", { text: "规则看到的" }), h("th", { text: "规则报的数" }), h("th", { text: "这一回合的得分" }))), tb2));
          };
          sel.addEventListener("change", paint); paint();
          out.appendChild(h("details", { class: "more", id: "qsTrace" }, h("summary", { text: "看第一局是怎么打的" }), h("div", { class: "more-body" }, h("div", { class: "row tight" }, h("label", { for: "qsTraceSel", class: "note", text: "哪条规则" }), sel), box, h("p", { class: "note", text: "第一组的第一局，只列前 30 个回合。拿它核对你的规则看到的东西和你以为的一样不一样。" }))));
        }
      }
      function submit() {
        flush();
        var r = read(); err.hidden = true;
        if (typeof r === "string") { bad(r); return; }
        if (closed()) { bad("这一天的题已经截止了。"); paintBanner(); return; }
        var pd = A.postDialog({ kind: "quest", title: day + " " + T(spec.title) + " · " + r.name, meta: { kind: "quest", day: day, cid: spec.cid, name: r.name, p: r.p, v: Q.ver }, code: r.code });
        var go2 = pd && pd.box.querySelector("#pdGo");
        if (go2) go2.addEventListener("click", function () { rec.posted = { h: codeHash(r.code, r.p), at: Date.now() }; save(); setTimeout(paintBoard, 60); });
      }

      /* 今天谁交了 */
      host.appendChild(h("h3", { class: "db-title", text: "今天谁交了" }));
      var board = h("div", { class: "db", id: "qsBoard" }); host.appendChild(board);
      function isMine(e) { return !!rec.posted && codeHash(e.code, e.p) === rec.posted.h; }
      function loadBoard(fresh) {
        entLoading = true; paintBoard();
        loadEntries(spec, fresh).then(function (x) { entLoading = false; ents = x.rows; entErr = x.err; pubBoard = null; if (alive) paintBoard(); }, function (e) { entLoading = false; entErr = e || {}; if (alive) paintBoard(); });
      }
      function paintBoard() {
        clear(board);
        var n = ents ? ents.length : 0, head = h("div", { class: "row tight db-head" }, h("span", { class: "db-say", id: "qsSay", text: ents ? (n ? "已经有 " + n + " 个人交了规则。" : "今天还没有人交。") + "成绩在截止之后结算。" : entLoading ? "正在从 GitHub 取…" : "" }), h("span", { class: "sp" }),
          h("button", { class: "btn small", type: "button", id: "qsRefresh", disabled: entLoading, text: entLoading ? "正在取…" : "刷新", onclick: function () { loadBoard(true); } }));
        board.appendChild(head);
        if (entErr) board.appendChild(h("div", { class: "warn", id: "qsBoardErr", text: (entErr.limited ? "GitHub 限制了这个网络的访问次数（不登录每小时 60 次）。过一会儿再刷新。" : "连不上 GitHub，暂时看不到谁交了。你的规则存在这台设备上，不受影响。") + (ents ? "下面是上一次取到的。" : "") }));
        if (rec.posted && ents && !ents.some(isMine)) board.appendChild(h("p", { class: "note", id: "qsPosted", text: "在刚打开的 GitHub 页面里点 Create 才算交上去。交完回到这里点\"刷新\"；GitHub 那边有时要等一两分钟才取得到。" }));
        if (n) {
          var tb = h("tbody"), order = ents.map(function (e, i) { return i; }), sc = pubBoard && pubBoard.rows;
          if (sc) order.sort(function (a, b) { var ka = sc[a].row ? (spec.higher ? sc[a].row.mean : -sc[a].row.mean) : -Infinity, kb = sc[b].row ? (spec.higher ? sc[b].row.mean : -sc[b].row.mean) : -Infinity; return kb - ka || ents[a].at - ents[b].at; });
          order.forEach(function (i) {
            var e = ents[i], x = sc ? sc[i] : null;
            tb.appendChild(h("tr", { class: isMine(e) ? "me" : "", "data-who": e.user }, h("td", null, avatar(e.avatar), h("a", { href: e.url, target: "_blank", rel: "noopener", text: "@" + e.user }), isMine(e) ? h("b", { text: "（你）" }) : null),
              h("td", { text: e.name }), h("td", { class: "num", text: hhmm(e.at) + (e.tries > 1 ? "，第 " + e.tries + " 次" : "") }),
              sc ? h("td", { class: "num" }, x.row ? pm(spec, x.row.mean, x.row.se) : h("span", { class: "note", text: x.err })) : null));
          });
          board.appendChild(h("div", { class: "gref" }, h("table", { class: "gtab hp-tab db-tab", id: "qsWho" }, h("thead", null, h("tr", null, h("th", { text: "谁" }), h("th", { text: "规则" }), h("th", { text: "交的时间" }), sc ? h("th", { text: "公开的 " + spec.sets.pub + " 组" }) : null)), tb)));
          if (pubBoard && pubBoard.err) board.appendChild(h("div", { class: "warn err", id: "qsPubErr", text: pubBoard.err }));
          var pb = h("button", { class: "btn small", type: "button", id: "qsPubRun", disabled: !!bjob, text: bjob ? "正在算…" : "算一下大家在公开的 " + spec.sets.pub + " 组上的成绩", onclick: function () {
            var prog = h("span", { class: "note", id: "qsPubProg" }); pb.disabled = true; pb.parentNode.appendChild(prog);
            bjob = scoreAll(spec, pubSeeds, 0, ents.map(function (e) { return { code: e.code, p: e.p, foreign: true }; }), function (i2, n2) { prog.textContent = "第 " + (i2 + 1) + " / " + n2 + " 个人…"; }, function (rows, fatal) { bjob = null; pubBoard = { rows: rows, err: fatal || "" }; if (alive) paintBoard(); });
          } });
          board.appendChild(h("div", { class: "row tight db-foot" }, pb));
          board.appendChild(h("p", { class: "note db-how", text: "公开的几组上的成绩只是参考，不是最后的名次。别人的规则在隔离环境里运行，碰不到这张页面里的东西，也连不了网。交上去的代码是公开的，截止之前别人也看得到；同分的时候先交的排前面。" }));
        }
      }
      host.appendChild(h("div", { class: "row tight db-foot" },
        h("button", { class: "btn small", type: "button", id: "qsYesterday", text: "看昨天的结算", onclick: function () { A.openQuestBoard(dayShift(day, -1)); } }),
        h("button", { class: "btn small", type: "button", id: "qsSettle", text: "看结算", hidden: true, onclick: function () { m.close(); A.openQuestBoard(day); } }),
        h("button", { class: "btn small", type: "button", id: "qsShare", text: "复制这道题的链接", onclick: function () { A.copy(A.lobbyLink("quest")); } })));
      paintBanner(); loadBoard(false);
      tick = setInterval(function () { if (!alive) return; paintBanner(); var sb = host.querySelector("#qsSettle"); if (sb) sb.hidden = !closed(); }, 20000);
    }
    go();
    return m;
  };

  /* ================= 往期：结算和名次 ================= */
  A.openQuestBoard = function (day) {
    var host = h("div", { class: "ar-host qs-host" }, h("p", { class: "note", id: "qsbStatus", text: "正在取这一天的题…" })), alive = true, sjob = null, rjob = null;
    var m = A.modal("每日一题 · " + day, host, { cls: "arm", onClose: function () { alive = false; if (sjob) sjob.stop(); if (rjob) rjob.cancel(); } });
    function say(text, cls) { var s = host.querySelector("#qsbStatus"); if (!s) { s = h("p", { id: "qsbStatus" }); host.appendChild(s); } s.className = cls || "note"; s.textContent = text; }
    function retry(label, fn) { host.appendChild(h("div", { class: "row tight", id: "qsbRetryRow" }, h("button", { class: "btn", type: "button", id: "qsbRetry", text: label, onclick: function () { var r = host.querySelector("#qsbRetryRow"); if (r) r.remove(); fn(); } }))); }
    function nav() {
      var prev = dayShift(day, -1), next = dayShift(day, 1), t = today();
      return h("div", { class: "row tight db-foot", id: "qsbNav" },
        h("button", { class: "btn small", type: "button", id: "qsbPrev", text: "前一天", onclick: function () { m.close(); A.openQuestBoard(prev); } }),
        next < t ? h("button", { class: "btn small", type: "button", id: "qsbNext", text: "后一天", onclick: function () { m.close(); A.openQuestBoard(next); } }) : null,
        h("button", { class: "btn small", type: "button", id: "qsbToday", text: "回到今天的题", onclick: function () { m.close(); A.openQuest(); } }));
    }
    function start() {
      loadSpec(day).then(function (x) { if (alive) withSpec(x.spec, x.rerun); }, function (e) { if (!alive) return; say(loadFail(e, "这一天的题"), "warn"); if (!(e && (e.none || e.bad))) retry("再试一次", start); host.appendChild(nav()); });
    }
    function withSpec(spec, rerun) {
      clear(host);
      var title = m.box.querySelector(".modal-h h2"); if (title) title.textContent = "每日一题 · " + day + " · " + T(spec.title);
      host.appendChild(h("p", { class: "note db-banner", id: "qsbBanner", text: (rerun ? "这一天没有新题，重温的是 " + rerun + " 的一道旧题。" : "") + T(spec.summary) }));
      var det = h("details", { class: "more", id: "qsbAbout" }, h("summary", { text: "题目和基准规则" })), body = h("div", { class: "more-body qs-in" });
      statement(spec, body); refList(spec, body); det.appendChild(body); host.appendChild(det);
      var status = h("p", { class: "note", id: "qsbStatus" }), out = h("div", { class: "db", id: "qsbOut" });
      host.appendChild(status); host.appendChild(out); host.appendChild(nav());
      var rec = store.days[day], mine = rec && rec.cid === spec.cid ? rec : null;
      function settle(fresh) {
        clear(out); say("正在取结算用的随机数…");
        if (Date.now() < QL.questDeadline(day)) { say("这一天的题还没有截止（UTC 0 点截止）。", "warn"); return; }
        beacon(day).then(function (b) {
          if (!alive) return;
          say("正在从 GitHub 取大家交的规则…");
          loadEntries(spec, fresh).then(function (x) { if (alive) compute(b, x.rows, x.err); }, function (e) { if (alive) compute(b, [], e || {}); });
        }, function (e) {
          if (!alive) return;
          say(e && e.early ? "结算用的随机数还没有发布（要等截止之后半分钟）。稍等一下再试。" : "结算用的随机数取不到：几个公共的地址都连不上。换一个网络，或者过一会儿再试。", "warn");
          retry("再试一次", function () { settle(false); });
        });
      }
      function compute(b, ents, entErr) {
        var seeds = QL.questFinSeeds(spec, b.randomness).concat(QL.questPubSeeds(spec)), cut = spec.sets.fin, people = ents.map(function (e) { return { code: e.code, p: e.p, foreign: true }; });
        var ghost = mine && QLJobs.syntax(mine.code) === "" && /\bfunction\s+decide\s*\(/.test(mine.code) && !(mine.posted && ents.some(function (e) { return codeHash(e.code, e.p) === mine.posted.h; })) ? { code: mine.code, p: KIT.parseP(mine.par) || {} } : null;
        if (ghost) people.push(ghost);
        say("正在跑基准规则…");
        var j = rjob = runJob(spec, seeds, refPlayers(spec), cut, false);
        j.promise.then(function (res) {
          rjob = null; if (!alive) return;
          sjob = scoreAll(spec, seeds, cut, people, function (i, n) { say("正在重跑大家的规则：第 " + (i + 1) + " / " + n + " 个…"); }, function (rows, fatal) {
            sjob = null; if (!alive) return;
            if (!rows) { say(fatal, "warn err"); return; }
            paint(b, ents, entErr, res, rows, !!ghost);
          });
        }, function (e) { rjob = null; if (!alive || (e && e.cancelled)) return; say("题目自己的代码没有跑通：" + failText(e), "warn err"); });
      }
      function paint(b, ents, entErr, refRes, scored, hasGhost) {
        clear(out);
        var rows = ents.map(function (e, i) { var x = scored[i]; return { who: "user", e: e, me: !!(mine && mine.posted && codeHash(e.code, e.p) === mine.posted.h), fin: x.row ? x.row.parts[0] : null, pub: x.row ? x.row.parts[1] : null, err: x.err || "", at: e.at, n: e.n }; });
        var rk = QL.questRank(rows.map(function (r) { return { score: r.fin ? r.fin.mean : NaN, at: r.at, n: r.n, err: r.err }; }), spec.higher);
        rows.forEach(function (r, i) { r.rank = rk[i]; });
        if (hasGhost) {   // 你当天写了但没交的那一条：算出"要是交了排第几"，但不占别人的名次
          var g = scored[scored.length - 1], gf = g.row ? g.row.parts[0] : null, would = 0;
          if (gf && gf.mean === gf.mean) would = 1 + rows.filter(function (r) { return r.rank && (spec.higher ? r.fin.mean >= gf.mean : r.fin.mean <= gf.mean); }).length;
          rows.push({ who: "me", me: true, ghost: true, fin: gf, pub: g.row ? g.row.parts[1] : null, err: g.err || "", at: Infinity, n: Infinity, rank: 0, would: would });
        }
        var all = rows.slice();
        refRes.rows.forEach(function (r, i) { var ref = spec.refs[i]; if (ref && r.parts) all.push({ who: "ref", name: T(ref.name), bench: i === 0, fin: r.parts[0], pub: r.parts[1], err: r.err || "", rank: 0, at: Infinity, n: Infinity }); });
        var key = function (r) { return r.fin && r.fin.mean === r.fin.mean ? (spec.higher ? r.fin.mean : -r.fin.mean) : -Infinity; };
        all.sort(function (a, b) { return key(b) - key(a) || (a.rank || 1e9) - (b.rank || 1e9); });
        var n = ents.length, meRow = rows.filter(function (r) { return r.me; })[0], text;
        if (!n) text = "这一天没有人交规则。" + (hasGhost && meRow && meRow.fin ? "你当天写的那条没有交；下面是它在结算数据上的成绩。" : "下面是基准规则在结算数据上的成绩。");
        else if (meRow && !meRow.ghost && meRow.rank) text = "这一天有 " + n + " 个人交了规则，你排第 " + meRow.rank + "。";
        else if (meRow && meRow.ghost && meRow.would) text = "这一天有 " + n + " 个人交了规则。你当天写的那条没有交；要是交了，排第 " + meRow.would + "（共 " + (n + 1) + " 人）。";
        else text = "这一天有 " + n + " 个人交了规则。";
        say(text, "db-say");
        if (entErr) out.appendChild(h("div", { class: "warn", id: "qsbErr", text: (entErr.limited ? "GitHub 限制了这个网络的访问次数（不登录每小时 60 次）。" : "连不上 GitHub，大家交的规则取不到。") + (n ? "下面是上一次取到的。" : "") }));
        var tb = h("tbody");
        all.forEach(function (r) {
          var who;
          if (r.who === "ref") who = [h("span", { class: "tag", text: r.bench ? "基准" : "参照" }), " ", r.name];
          else if (r.who === "me") who = [h("b", { text: "你" }), h("span", { class: "note", text: "（当天没有交）" })];
          else who = [avatar(r.e.avatar), h("a", { href: r.e.url, target: "_blank", rel: "noopener", text: "@" + r.e.user }), r.me ? h("b", { text: "（你）" }) : null, h("span", { class: "note", text: " " + r.e.name }), r.e.touched ? h("span", { class: "tag qs-flag", title: "截止之后这条 Issue 又有过变动：可能改过代码，也可能只是有人评论", text: "截止后有变动" }) : null];
          tb.appendChild(h("tr", { class: (r.me ? "me" : "") + (r.who === "ref" ? " ref" : ""), "data-who": r.who === "user" ? r.e.user : r.who === "ref" ? "ref" : "me" },
            h("td", { class: "num", text: r.rank ? String(r.rank) : "—" }), h("td", null, who),
            h("td", { class: "num" }, r.fin ? pm(spec, r.fin.mean, r.fin.se) : h("span", { class: "note", text: r.err || "—" })),
            h("td", { class: "num" }, r.fin && !(r.who === "ref" && r.bench) && r.fin.d === r.fin.d ? verdict(spec, r.fin.d, r.fin.dse) : "—"),
            h("td", { class: "num", text: r.pub ? num(spec, r.pub.mean) : "—" })));
        });
        out.appendChild(h("div", { class: "gref" }, h("table", { class: "gtab hp-tab db-tab ar-tab", id: "qsbTab" },
          h("caption", { text: "结算的 " + spec.sets.fin + " 组，每组 " + spec.sets.K + " 局；每一局发给各条规则的是同一副牌。± 后面是标准误。" }),
          h("thead", null, h("tr", null, h("th", { text: "名次" }), h("th", { text: "谁" }), h("th", { text: "结算的 " + spec.sets.fin + " 组" }), h("th", { text: "比基准多" }), h("th", { text: "公开的 " + spec.sets.pub + " 组" }))), tb)));
        out.appendChild(h("div", { class: "row tight db-foot" }, h("button", { class: "btn small", type: "button", id: "qsbRefresh", text: "重新取一遍", onclick: function () { settle(true); } })));
        out.appendChild(h("p", { class: "note db-how", id: "qsbHow" }, "结算的几组数据由一个公共的随机数决定：",
          h("a", { href: A.questOpt.relays[0] + "/" + Q.beacon.chain + "/public/" + b.round, target: "_blank", rel: "noopener", text: "drand 第 " + b.round + " 轮" }),
          "，在截止之后半分钟（" + new Date(QL.beaconTime(b.round)).toISOString().slice(0, 19).replace("T", " ") + " UTC）才发布，之前谁也算不出来。榜上每个人的规则都在你的浏览器里重跑过，各自单独在一个隔离环境里，互相碰不到；同分的时候先交的排前面。标着\"截止后有变动\"的，是那条 Issue 在截止之后又动过：可能改了代码，也可能只是有人评论，这里分不出来。规则和裁判在同一个线程里，没法完全隔绝，所以这个榜图个乐。"));
      }
      settle(false);
    }
    start();
    return m;
  };

  if (A.lobbyAdd) A.lobbyAdd({
    id: "quest", order: 12, route: "quest", primary: true, kicker: "每天一道题，写规则来解", title: "每日一题", label: "看今天的题", keys: "quest challenge 每日 一题 题目 策略 比赛 结算 排名",
    blurb: "每天一道新题：一个带裁判的小游戏。写一条规则来解，先在公开的几组数据上试，再交上去；截止之后换另外几组数据结算、排名。",
    status: function () { var r = store.days[today()]; return r && r.title ? "今天：" + r.title + (r.posted ? " · 你交过了" : "") : ""; },
    go: function (arg) { A.openQuest(arg); }
  });
})(App);
