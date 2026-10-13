// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 应用主体（十四）：每日一题。每天一套新规则（一个带裁判的小游戏），大家各写一条规则来解（引擎见 quest.js）。
 *   题：是数据，不随页面发布。页面按日期去取 daily/q/日期.json；这一天没有题，就从以前的题里按日期挑一道重温。
 *   试：在"公开的几组数据"上跑你的规则和几条基准规则，想试几次都行。
 *   交：先在这台设备上把规则封起来（加密，公钥在 daily/quest-public.pem），再把封好的那一份贴成一条 GitHub Issue（hub.js）。
 *       当天 UTC 24 点截止，同一个账号只算截止前最后交的那一条。别人看得到谁交了，看不到名字、参数和代码。
 *   结算：截止之后，仓库里每天自动运行的结算程序（daily/settle.js，在 GitHub Actions 里跑，私钥只在那里）把每条规则解开，
 *         各自放进没有网络的容器里，在"结算的几组数据"上打一遍，把成绩和名字贴成一条 Issue。结算的几组数据由公共随机信标（drand）
 *         在截止之后发布的随机数决定。页面只认仓库的 Actions 机器人和仓库主人发的结果。
 *   核对：别人的规则页面打不开，所以别人的成绩没法在这里验算。页面能自己算的有两样：基准规则，和你自己交的那一条；算出来和公布的对一对。
 * 这张页面从不执行别人为每日一题写的代码。私钥在仓库主人手里：他技术上解得开所有人的规则。规则和裁判在同一个线程里没法完全隔绝：这个榜图个乐。 */
(function (A) {
  "use strict";
  var h = A.h, clear = A.clear, QL = A.QL, F = A.F;
  if (typeof QL_QUEST_INSTALL !== "function" || typeof QL_SHOP_INSTALL !== "function" || typeof QLJobs === "undefined" || typeof QLHub === "undefined" || !A.shopKit) return;
  if (!QL.SHOP) QL_SHOP_INSTALL(QL);
  if (!QL.QUEST) QL_QUEST_INSTALL(QL);
  var Q = QL.QUEST, KIT = A.shopKit, KEY = "ql.quest.v1", LANG = /^en/i.test(document.documentElement.getAttribute("lang") || "") ? "en" : "zh";
  // base：题目放在哪里（英文页面在 en/ 里，要往上一层）。relays：取结算随机数的几个地址，一个不行换下一个。测试里会换掉
  A.questOpt = { timeout: 30000, fetchMs: 9000, base: (LANG === "en" ? "../" : "") + "daily/", relays: ["https://api.drand.sh", "https://api2.drand.sh", "https://api3.drand.sh", "https://drand.cloudflare.com"] };

  /* ---------- 存档：每天一份草稿，连同交上去的那几份的原文（结算之后拿它自己核对），外加取到过的结算随机数 ----------
   * 交过的一份记成 { k: 封好的那一份开头的 64 个字符, ch: 它的记号, name, par, code, at }。sent 是最后交的，old 是更早交的几份（最多四份）：
   * 点了"去 GitHub 提交"不等于在 GitHub 上真的提交了，所以结算的时候要在这几份里找记号对得上的那一份 */
  var store = { v: 1, days: {}, fin: {} };
  function sentOk(x) { return x && typeof x.code === "string" && typeof x.k === "string" && /^[A-Za-z0-9_-]{64}$/.test(x.k) ? { k: x.k, ch: String(x.ch || "").slice(0, 16), name: A.cleanText(x.name, 40), par: typeof x.par === "string" ? x.par.slice(0, 400) : "", code: x.code.slice(0, Q.maxCode), at: +x.at || 0 } : null; }
  try {
    var o0 = JSON.parse(localStorage.getItem(KEY) || "null");
    if (o0 && o0.v === 1) {
      if (o0.days && typeof o0.days === "object") Object.keys(o0.days).slice(-80).forEach(function (d) {
        var r = o0.days[d]; if (!r || !(QL.questOpen(d) === QL.questOpen(d)) || typeof r.code !== "string") return;
        store.days[d] = { cid: String(r.cid || ""), title: A.cleanText(r.title, 60), name: A.cleanText(r.name, 40), par: typeof r.par === "string" ? r.par.slice(0, 400) : "", code: r.code.slice(0, Q.maxCode),
          posted: r.posted && typeof r.posted.ch === "string" ? { ch: r.posted.ch.slice(0, 16), at: +r.posted.at || 0 } : null,
          sent: sentOk(r.sent), old: (Array.isArray(r.old) ? r.old : []).map(sentOk).filter(Boolean).slice(0, 4) };
      });
      if (o0.fin && typeof o0.fin === "object") Object.keys(o0.fin).slice(-80).forEach(function (d) { var f = o0.fin[d]; if (f && /^[0-9a-f]{64}$/.test(f.randomness) && f.round === QL.questRound(d)) store.fin[d] = { round: f.round, randomness: f.randomness }; });
    }
  } catch (e) {}
  function save() {
    try {
      ["days", "fin"].forEach(function (k) { var ks = Object.keys(store[k]).sort(); if (ks.length > 40) ks.slice(0, ks.length - 40).forEach(function (d) { delete store[k][d]; }); });
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
  function avatar(u) { return u ? h("img", { class: "db-av", src: u + (u.indexOf("?") < 0 ? "?" : "&") + "s=40", alt: "", width: 18, height: 18, loading: "lazy" }) : null; }
  function hhmm(ms) { return new Date(ms).toISOString().slice(11, 16) + " UTC"; }
  function md(el, text) { if (typeof QLMD !== "undefined") QLMD.mount(el, text); else el.textContent = text; return el; }

  /* ---------- 取东西：题目、加密用的公钥、谁交了、结算的结果、结算的随机数 ---------- */
  /** 取一个文件。own：是本站自己的文件。本站的文件每次都向服务器核对一遍，新合并的题马上看得到；
   *  别人的服务器（drand）就用最普通的请求，不带任何额外的设定，免得有的浏览器为此先发一次预检。
   *  text：要原文，不当成 JSON 解析。失败时：{ offline }（连不上、超时）或 { status }（服务器说没有） */
  function getFile(url, own, text) {
    if (typeof fetch !== "function") return Promise.reject({ offline: true });
    var ctl = typeof AbortController === "function" ? new AbortController() : null, t = ctl ? setTimeout(function () { ctl.abort(); }, A.questOpt.fetchMs) : 0, opt = {};
    if (ctl) opt.signal = ctl.signal;
    if (own) opt.cache = "no-cache";
    return fetch(url, opt).then(function (r) {
      clearTimeout(t); if (!r.ok) throw { status: r.status };
      return (text ? r.text() : r.json()).then(null, function () { throw { status: 0, bad: true }; });
    }, function () { clearTimeout(t); throw { offline: true }; });
  }
  function getJson(url, own) { return getFile(url, own, false); }
  var idx = null, specs = {}, sealKey = null;
  /** 有题的日子（排好序的）。十分钟内不重取 */
  function loadIndex() {
    if (idx && Date.now() - idx.at < 6e5) return Promise.resolve(idx.days);
    return getJson(A.questOpt.base + "index.json", true).then(function (o) {
      var days = o && o.v === 1 && Array.isArray(o.days) ? o.days.filter(function (d) { return typeof d === "string" && QL.questOpen(d) === QL.questOpen(d); }).sort() : [];
      idx = { at: Date.now(), days: days }; return days;
    });
  }
  /** 这一天的题：{ spec, rerun }。这一天没有题时，从更早的题里按日期挑一道（人人挑到的是同一道，结算的程序挑的也是它），rerun 是它原来的日子。
   *  失败时：{ offline } 连不上；{ none, first } 挑不出题（first 是清单里的第一天）；{ bad } 题目文件读不懂 */
  function loadSpec(day) {
    if (specs[day]) return Promise.resolve(specs[day]);
    return loadIndex().then(function (days) {
      var pick = QL.questPick(days, day);
      if (!pick.src) throw { none: true, first: pick.first };
      return getJson(A.questOpt.base + "q/" + pick.src + ".json", true).then(function (raw) {
        if (!raw || raw.day !== pick.src) throw { bad: true };
        var spec = QL.questOk(pick.src === day ? raw : Object.assign({}, raw, { day: day })); if (!spec) throw { bad: true };
        return (specs[day] = { spec: spec, rerun: pick.rerun });
      }, function (e) { throw e && e.status ? { bad: true } : e; });
    }, function (e) { throw e && e.status === 404 ? { none: true } : e; });
  }
  /** 把规则封起来用的公钥：{ der, kid }。失败时：{ nokey } 网站上还没有放公钥；{ offline } 连不上 */
  function loadKey() {
    if (sealKey) return Promise.resolve(sealKey);
    return getFile(A.questOpt.base + "quest-public.pem", true, true).then(function (pem) {
      var der = QL.questPem(pem); if (!der) throw { nokey: true };
      return (sealKey = { der: der, kid: QL.questHash(QL.questB64.enc(der)).toString(36) });
    }, function (e) { throw e && (e.status || e.bad) ? { nokey: true } : e; });
  }
  function loadEntries(spec, fresh) {
    return QLHub.list({ kind: "quest", since: spec.day + "T00:00:00Z", fresh: !!fresh }).then(function (res) { return { rows: QL.questEntries(res.items, spec), err: res.stale ? res.error : null }; });
  }
  /** 这一天的结算结果：{ result, err }，还没有公布时 result 是 null。只认仓库的 Actions 机器人和仓库主人发的，别人发一条长得一样的没有用 */
  function loadResult(spec, fresh) {
    var trusted = Q.seal.settlers.concat([QLHub.REPO.split("/")[0]]);
    return QLHub.list({ kind: "result", since: new Date(QL.questDeadline(spec.day)).toISOString().slice(0, 19) + "Z", asc: true, fresh: !!fresh }).then(function (res) { return { result: QL.questResult(res.items, spec, trusted), err: res.stale ? res.error : null }; });
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
  A.questBeacon = beacon; A.questLoad = loadSpec; A.questKey = loadKey;

  /* ---------- 跑 ---------- */
  /** players: [{ id, code, p, slot }]。这里跑的只有题目自己的代码和你自己写的规则：别人交的规则是封着的，页面打不开，也就从不执行 */
  function runJob(spec, seeds, players, cut, trace, onProgress) {
    return QLJobs.run({ kind: "quest", timeout: A.questOpt.timeout,
      codes: [{ id: "game", code: spec.canon, mine: true }].concat(players.map(function (p) { return { id: p.id, code: p.code, mine: true }; })),
      data: { game: "game", gp: spec.p, T: spec.T, K: spec.sets.K, seeds: seeds, cut: cut || 0, trace: !!trace, entries: players.map(function (p) { return { id: p.id, p: p.p, slot: p.slot }; }) }, onProgress: onProgress });
  }
  function refPlayers(spec) { return spec.refs.map(function (r, i) { return { id: "ref:" + r.id, code: r.canon, p: r.p, slot: i }; }); }
  function failText(e) {
    if (e && e.nostart) return e.message || "这个浏览器开不了隔离环境。";
    if (e && e.timeout) return "卡住了：多半是代码里有死循环。";
    if (e && e.compile) return "代码有语法错误" + (e.line ? "（第 " + e.line + " 行）" : "") + "：" + e.message;
    return "出错了：" + (e && e.message || "不知道为什么");
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
    var host = h("div", { class: "ar-host qs-host" }, h("p", { class: "note", id: "qsLoading", text: "正在取今天的题…" })), alive = true, job = null, tick = 0, flushDraft = null;
    function stop() { if (job) { job.cancel(); job = null; } }
    // 草稿是停笔 0.3 秒之后才存的；关掉对话框、离开页面的时候，把还没来得及存的那几个字也存下来
    function onHide() { if (flushDraft) flushDraft(); }
    window.addEventListener("pagehide", onHide);
    var m = A.modal("每日一题", host, { cls: "arm", onClose: function () { alive = false; stop(); clearInterval(tick); onHide(); window.removeEventListener("pagehide", onHide); } });
    function fail(e) { if (!alive) return; clear(host); host.appendChild(h("div", { class: "warn", id: "qsLoadErr", text: loadFail(e, "今天的题") })); host.appendChild(h("div", { class: "row tight" }, h("button", { class: "btn", type: "button", id: "qsRetry", text: "再试一次", onclick: function () { clear(host); host.appendChild(h("p", { class: "note", id: "qsLoading", text: "正在取今天的题…" })); go(); } }))); }
    function go() { loadSpec(day).then(function (x) { if (alive) draw(x.spec, x.rerun); }, fail); }
    function draw(spec, rerun) {
      clear(host);
      var rec = store.days[day], pubSeeds = QL.questPubSeeds(spec), last = null, ents = null, entErr = null, entLoading = false;
      if (!rec || rec.cid !== spec.cid) rec = store.days[day] = { cid: spec.cid, title: T(spec.title), name: "", par: KIT.pLine(spec.starter.p), code: T(spec.starter.code), posted: null, sent: null, old: [] };
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
        if (/\bimport\b/.test(code)) return "代码里不能出现 import 这个词（写在注释里也不行）：结算的程序不收这样的规则。";
        return { name: A.cleanText(name.value, 40) || "没有名字的规则", p: p, code: code };
      }
      host.appendChild(h("div", { class: "ar-form" }, h("label", { for: "qsName", text: "名字" }), name, h("label", { for: "qsPar", text: "参数" }), par));
      host.appendChild(ta); host.appendChild(err);
      var tryBtn = h("button", { class: "btn primary", type: "button", id: "qsTry", text: "在公开的 " + spec.sets.pub + " 组上试", onclick: tryIt });
      var post = h("button", { class: "btn", type: "button", id: "qsPost", text: "交上去", title: "先在这台设备上把规则加密，再贴成一条 GitHub Issue。截止之前可以再交，只算最后交的那一条", onclick: submit });
      host.appendChild(h("div", { class: "row tight ar-acts" }, tryBtn, post,
        h("button", { class: "btn", type: "button", id: "qsAi", text: "复制给 AI 的说明", title: "把题目、裁判的代码、接口和现在的代码复制下来，贴给任何一个 AI，让它替你写", onclick: function () { A.copy(rulePrompt(spec, ta.value, par.value.trim())); } }),
        h("button", { class: "btn", type: "button", id: "qsReset", text: "还原成起始代码", onclick: function () { ta.value = T(spec.starter.code); par.value = KIT.pLine(spec.starter.p); dirty = true; flush(); err.hidden = true; } })));
      host.appendChild(h("p", { class: "note", id: "qsSealNote", text: "交上去的规则是加密的：别人看得到你交了，看不到规则的名字、参数和代码。榜上只公布成绩和名字。结算的时候每条规则有 90 秒，内置的东西（Math 之类）是只读的：超时的、去改它们的规则没有成绩。" }));
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
      /** 封不起来的时候说清楚为什么 */
      function sealFail(e) {
        if (e && e.nokey) return "现在还交不了：这个网站还没有放上把规则封起来用的公钥。你的规则存在这台设备上，可以接着改。";
        if (e && e.offline) return "取不到把规则封起来用的公钥：连不上网。";
        if (e && e.message === "too-long") return "代码太长了，封好以后一条 Issue 放不下。";
        return "这个浏览器没法把规则封起来：要在 https 的网址下打开，浏览器也不能太旧。";
      }
      var sealing = false;
      function submit() {
        flush();
        var r = read(); err.hidden = true;
        if (typeof r === "string") { bad(r); return; }
        if (closed()) { bad("这一天的题已经截止了。"); paintBanner(); return; }
        if (sealing) return;
        sealing = true; post.disabled = true;
        // 先在这台设备上把规则封起来（加密），贴到 GitHub 上的只有封好的那一份
        loadKey().then(function (k) {
          return QL.questSeal(k.der, { name: r.name, p: r.p, code: r.code }, QL.questSealInfo(day, spec.cid)).then(function (s) { return { kid: k.kid, box: s.box, ch: s.ch }; });
        }).then(function (x) {
          sealing = false; if (!alive) return; post.disabled = closed();
          var pd = A.postDialog({ kind: "quest", title: day + " " + T(spec.title) + " · 封好的规则", meta: { kind: "quest", day: day, cid: spec.cid, v: 2, kid: x.kid, box: x.box }, code: "",
            packNote: "这条 Issue 由策略实验室生成（https://zechenbian.github.io/strategy-lab/）。下面是一条封好的“每日一题”参赛规则：内容是加密的，只有结算的程序解得开，榜上只公布成绩和规则的名字。请不要改动下面的内容。",
            note: "需要一个 GitHub 账号。要是 GitHub 先让你登录，登录完没有回到填好的页面，就回到这里再点一次。交上去的是加密过的一份，署的是你的 GitHub 用户名：别人看得到你交了、什么时候交的，看不到规则的名字、参数和代码。截止之后不要再改这条 Issue 的正文，改了就作废。想撤下来，把那条 Issue 关掉就行。" });
          var go2 = pd && pd.box.querySelector("#pdGo");
          if (go2) go2.addEventListener("click", function () {
            if (rec.sent && rec.sent.ch !== x.ch) rec.old = [rec.sent].concat(rec.old || []).slice(0, 4);   // 上一份留着：这一份要是没有真的提交，算数的还是它
            rec.sent = { k: x.box.slice(0, 64), ch: x.ch, name: r.name, par: KIT.pLine(r.p), code: r.code, at: Date.now() }; rec.posted = { ch: x.ch, at: Date.now() }; save(); setTimeout(paintBoard, 60);
          });
        }, function (e) { sealing = false; if (!alive) return; post.disabled = closed(); bad(sealFail(e)); });
      }

      /* 今天谁交了 */
      host.appendChild(h("h3", { class: "db-title", text: "今天谁交了" }));
      var board = h("div", { class: "db", id: "qsBoard" }); host.appendChild(board);
      function isMine(e) { var k = e.box.slice(0, 64); return [rec.sent].concat(rec.old || []).some(function (x) { return !!x && x.k === k; }); }
      function loadBoard(fresh) {
        entLoading = true; paintBoard();
        loadEntries(spec, fresh).then(function (x) { entLoading = false; ents = x.rows; entErr = x.err; if (alive) paintBoard(); }, function (e) { entLoading = false; entErr = e || {}; if (alive) paintBoard(); });
      }
      function paintBoard() {
        clear(board);
        var n = ents ? ents.length : 0, head = h("div", { class: "row tight db-head" }, h("span", { class: "db-say", id: "qsSay", text: ents ? (n ? "已经有 " + n + " 个人交了规则。" : "今天还没有人交。") + "成绩在截止之后结算。" : entLoading ? "正在从 GitHub 取…" : "" }), h("span", { class: "sp" }),
          h("button", { class: "btn small", type: "button", id: "qsRefresh", disabled: entLoading, text: entLoading ? "正在取…" : "刷新", onclick: function () { loadBoard(true); } }));
        board.appendChild(head);
        if (entErr) board.appendChild(h("div", { class: "warn", id: "qsBoardErr", text: (entErr.limited ? "GitHub 限制了这个网络的访问次数（不登录每小时 60 次）。过一会儿再刷新。" : "连不上 GitHub，暂时看不到谁交了。你的规则存在这台设备上，不受影响。") + (ents ? "下面是上一次取到的。" : "") }));
        if (rec.posted && ents && !ents.some(isMine)) board.appendChild(h("p", { class: "note", id: "qsPosted", text: "在刚打开的 GitHub 页面里点 Create 才算交上去。交完回到这里点\"刷新\"；GitHub 那边有时要等一两分钟才取得到。" }));
        if (n) {
          var tb = h("tbody");
          ents.forEach(function (e) {
            tb.appendChild(h("tr", { class: isMine(e) ? "me" : "", "data-who": e.user }, h("td", null, avatar(e.avatar), h("a", { href: e.url, target: "_blank", rel: "noopener", text: "@" + e.user }), isMine(e) ? h("b", { text: "（你）" }) : null),
              h("td", { class: "num", text: hhmm(e.at) + (e.tries > 1 ? "，第 " + e.tries + " 次" : "") })));
          });
          board.appendChild(h("div", { class: "gref" }, h("table", { class: "gtab hp-tab db-tab", id: "qsWho" }, h("thead", null, h("tr", null, h("th", { text: "谁" }), h("th", { text: "交的时间" }))), tb)));
        }
        board.appendChild(h("p", { class: "note db-how", id: "qsHow", text: "交上去的规则是封着的：这里只看得到谁交了、什么时候交的，规则的名字、参数和代码别人都看不到。截止之后，这个仓库里自动运行的结算程序把它们解开，各自放在隔离环境里算分，然后公布成绩和规则的名字，不公布代码。同分的时候先交的排前面。解开用的私钥由仓库的主人保管。" }));
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
    var host = h("div", { class: "ar-host qs-host" }, h("p", { class: "note", id: "qsbStatus", text: "正在取这一天的题…" })), alive = true, rjob = null;
    var m = A.modal("每日一题 · " + day, host, { cls: "arm", onClose: function () { alive = false; if (rjob) rjob.cancel(); } });
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
      var rec = store.days[day], mine = rec && rec.cid === spec.cid ? rec : null, run = 0, my = null;
      var sents = mine ? [mine.sent].concat(mine.old || []).filter(Boolean) : [], onHub = null;   // onHub：GitHub 上现在挂着的参赛帖（每份开头的 64 个字符），用到才取
      function inResult(res) { var hit = null; if (res) sents.some(function (x) { if (x.ch && res.rows.some(function (r) { return r.ch === x.ch; })) { hit = x; return true; } return false; }); return hit; }
      /** 我自己的那一条。交过：点了"去 GitHub 提交"不等于真的提交了，所以在交过的几份里先找结果里有的，再找 GitHub 上现在挂着的，都没有就是最后交的那一份；
       *  没交过：当天留在这台设备上的草稿（写得不成样子的不算） */
      function pickMine(res) {
        var hit = inResult(res);
        if (!hit && onHub) sents.some(function (x) { if (onHub[x.k]) { hit = x; return true; } return false; });
        var x = hit || sents[0];
        if (x) return { code: x.code, p: KIT.parseP(x.par) || {}, ch: x.ch, sent: true };
        return mine && QLJobs.syntax(mine.code) === "" && /\bfunction\s+decide\s*\(/.test(mine.code) ? { code: mine.code, p: KIT.parseP(mine.par) || {}, ch: "", sent: false } : null;
      }
      function close2(a, b) { return a === a && b === b && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)); }
      function settle(fresh) {
        var me = ++run; clear(out); if (rjob) { rjob.cancel(); rjob = null; }
        if (fresh) onHub = null;
        if (Date.now() < QL.questDeadline(day)) { say("这一天的题还没有截止（UTC 0 点截止）。", "warn"); return; }
        say("正在取结算的结果…");
        var res = null, resErr = null, bea = null, beaErr = null, left = 2;
        function both() {
          if (--left || !alive || me !== run) return;
          if (sents.length > 1 && !inResult(res) && !onHub) {
            // 交过不止一份，结果里又认不出是哪一份（还没公布，或者那一份作废了）：看一眼 GitHub 上现在挂着的是哪一份
            loadEntries(spec, fresh).then(function (x) { onHub = {}; x.rows.forEach(function (e) { onHub[e.box.slice(0, 64)] = 1; }); }, function () { onHub = {}; }).then(function () { if (alive && me === run) local(me, res, resErr, bea, beaErr); });
          } else local(me, res, resErr, bea, beaErr);
        }
        loadResult(spec, fresh).then(function (x) { res = x.result; resErr = x.err; both(); }, function (e) { resErr = e || {}; both(); });
        beacon(day).then(function (b) { bea = b; both(); }, function (e) { beaErr = e || {}; both(); });
      }
      /** 自己的浏览器能算的那一部分：基准规则，还有我自己的那一条。别人的规则是封着的，这里算不了 */
      function local(me, res, resErr, bea, beaErr) {
        my = pickMine(res);
        if (!bea) { paint(res, resErr, null, beaErr, null, ""); return; }
        var seeds = QL.questFinSeeds(spec, bea.randomness).concat(QL.questPubSeeds(spec)), cut = spec.sets.fin;
        function go(withMine) {
          say(withMine ? "正在你的浏览器里算基准规则和你自己的规则…" : "正在你的浏览器里算基准规则…");
          var j = rjob = runJob(spec, seeds, withMine ? refPlayers(spec).concat([{ id: "you", code: my.code, p: my.p, slot: Q.slot }]) : refPlayers(spec), cut, false);
          j.promise.then(function (r) { if (rjob === j) rjob = null; if (alive && me === run) paint(res, resErr, bea, null, r, withMine || !my ? "" : "x"); },
            function (e) {
              if (rjob === j) rjob = null; if (!alive || me !== run || (e && e.cancelled)) return;
              if (withMine && !(e && e.nostart)) go(false);   // 多半是我自己的那条卡住了、出错了：只算基准规则
              else paint(res, resErr, bea, null, null, failText(e));
            });
        }
        go(!!my);
      }
      /** res：公布的结算结果（可能没有）；bea：结算用的随机数（可能取不到）；loc：自己的浏览器算出来的；locErr："" 没事，"x" 我自己的那条没算成，别的是基准规则没算成的原因 */
      function paint(res, resErr, bea, beaErr, loc, locErr) {
        clear(out);
        var locRow = function (id) { var r = loc && loc.rows.filter(function (x) { return x.id === id; })[0]; return r && !r.err && r.parts ? r : null; };
        var mineLoc = my ? locRow("you") : null, rows = [], rk = [], myRow = null;
        if (res) {
          rk = QL.questRank(res.rows.map(function (r) { return { score: r.fin ? r.fin.mean : NaN, at: r.at, n: r.n, err: r.err || (r.dup ? "dup" : "") }; }), spec.higher);
          res.rows.forEach(function (r, i) { var o = { who: "user", r: r, me: !!(my && my.ch && r.ch === my.ch), fin: r.fin, pub: r.pub, rank: rk[i], at: r.at }; if (o.me) myRow = o; rows.push(o); });
        }
        // 我写了但结果里没有的那一条（没交，或者交的那条作废了）：算出"要是算数排第几"，不占别人的名次
        var ghost = null;
        if (my && !myRow && mineLoc) {
          var gf = mineLoc.parts[0], would = 0;
          if (res && gf.mean === gf.mean) would = 1 + rows.filter(function (r) { return r.rank && (spec.higher ? r.fin.mean >= gf.mean : r.fin.mean <= gf.mean); }).length;
          ghost = { who: "me", me: true, fin: gf, pub: mineLoc.parts[1], rank: 0, would: would, at: Infinity };
        }
        var all = rows.slice(); if (ghost) all.push(ghost);
        // 基准规则：自己算得出来就用自己算的，算不出来才用公布的
        var refBad = 0, refSeen = 0;
        spec.refs.forEach(function (ref, i) {
          var l = locRow("ref:" + ref.id), p = res ? res.refs.filter(function (x) { return x.id === ref.id; })[0] : null;
          if (l && p && p.fin) { refSeen++; if (!close2(l.parts[0].mean, p.fin.mean)) refBad++; }
          if (l) all.push({ who: "ref", name: T(ref.name), bench: i === 0, fin: l.parts[0], pub: l.parts[1], rank: 0, at: Infinity });
          else if (p && p.fin) all.push({ who: "ref", name: T(ref.name), bench: i === 0, fin: p.fin, pub: p.pub, rank: 0, at: Infinity });
        });
        var key = function (r) { return r.fin && r.fin.mean === r.fin.mean ? (spec.higher ? r.fin.mean : -r.fin.mean) : -Infinity; };
        all.sort(function (a, b) { return key(b) - key(a) || (a.rank || 1e9) - (b.rank || 1e9) || a.at - b.at; });
        var n = res ? res.rows.length : 0, text, cls = "db-say";
        if (!res) {
          cls = "warn";
          text = resErr ? (resErr.limited ? "GitHub 限制了这个网络的访问次数（不登录每小时 60 次），结算的结果暂时取不到。过一会儿再试。" : "连不上 GitHub，结算的结果取不到。")
            : "这一天的结算结果还没有公布。结算由这个仓库里每天自动运行的程序来做，一般在截止之后一个小时以内；过了很久还没有，就是那边出了问题。";
        } else if (!n) text = "这一天没有人交规则。";
        else if (myRow && myRow.rank) text = "这一天有 " + n + " 个人交了规则，你排第 " + myRow.rank + "。";
        else if (myRow) text = "这一天有 " + n + " 个人交了规则。你交的那条没有排上名次。";
        else if (ghost && ghost.would) text = "这一天有 " + n + " 个人交了规则。你写的那条不在结果里；要是算数，排第 " + ghost.would + "（共 " + (n + 1) + " 条）。";
        else text = "这一天有 " + n + " 个人交了规则。";
        say(text, cls);
        if (res && resErr) out.appendChild(h("div", { class: "warn", id: "qsbErr", text: (resErr.limited ? "GitHub 限制了这个网络的访问次数（不登录每小时 60 次）。" : "连不上 GitHub。") + "下面是上一次取到的。" }));
        if (res && bea && res.randomness !== bea.randomness) out.appendChild(h("div", { class: "warn err", id: "qsbBadRnd", text: "公布的结果用的随机数，和 drand 给你的浏览器的不是同一个。这不应该发生：这份结果信不得。" }));
        if (!bea) out.appendChild(h("div", { class: "warn", id: "qsbNoRnd", text: beaErr && beaErr.early ? "结算用的随机数还没有发布（要等截止之后半分钟）。稍等一下再试。" : "结算用的随机数取不到（几个公共的地址都连不上），所以你的浏览器没法自己核对。" + (res ? "下面是公布的结果。" : "") }));
        else if (locErr && locErr !== "x") out.appendChild(h("div", { class: "warn err", id: "qsbLocErr", text: "题目自己的代码在你的浏览器里没有跑通：" + locErr }));
        if (all.length) {
          var userOf = function (num) { var r = res && res.rows.filter(function (x) { return x.n === num; })[0]; return r ? "@" + r.user : "#" + num; };
          var errText = function (r) {
            if (r.dup) return "原样照搬了 " + (r.dupUser ? "@" + r.dupUser : userOf(r.dup)) + " 封好的那一份，不排名";
            if (r.err === "timeout") return "超时了：多半是代码里有死循环";
            if (r.err === "error") return "中途出错了";
            return "没有跑出成绩";
          };
          var tb = h("tbody");
          all.forEach(function (r) {
            var who, flat = r.who === "user" && (r.r.dup || r.r.err || !r.fin);
            if (r.who === "ref") who = [h("span", { class: "tag", text: r.bench ? "基准" : "参照" }), " ", r.name];
            else if (r.who === "me") who = [h("b", { text: "你" }), h("span", { class: "note", text: !res ? "（结果还没有公布；这是你的浏览器自己算的）" : my.sent ? "（交的那条不在结果里；这是你的浏览器自己算的）" : "（当天没有交；这是你的浏览器自己算的）" })];
            else {
              who = [r.r.uid ? avatar("https://avatars.githubusercontent.com/u/" + r.r.uid + "?v=4") : null, h("a", { href: QLHub.issueUrl(r.r.n), target: "_blank", rel: "noopener", text: "@" + r.r.user }), r.me ? h("b", { text: "（你）" }) : null, h("span", { class: "note", text: " " + r.r.name })];
              if (r.me && mineLoc && r.fin) who.push(close2(mineLoc.parts[0].mean, r.fin.mean) ? h("span", { class: "tag qs-ok", id: "qsbMineOk", title: "你的浏览器把你交的那条规则在结算的数据上重算了一遍，和公布的成绩一样", text: "你自己算的也是这个数" })
                : h("span", { class: "tag qs-flag", id: "qsbMineBad", title: "你的浏览器把你交的那条规则在结算的数据上重算了一遍，和公布的成绩不一样", text: "你自己算的是 " + num(spec, mineLoc.parts[0].mean) }));
            }
            tb.appendChild(h("tr", { class: (r.me ? "me" : "") + (r.who === "ref" ? " ref" : ""), "data-who": r.who === "user" ? r.r.user : r.who === "ref" ? "ref" : "me" },
              h("td", { class: "num", text: r.rank ? String(r.rank) : "—" }), h("td", null, who),
              h("td", { class: "num" + (flat ? " qs-flat" : "") }, flat ? h("span", { class: "note", text: errText(r.r) }) : r.fin ? pm(spec, r.fin.mean, r.fin.se) : "—"),
              h("td", { class: "num" }, !flat && r.fin && !(r.who === "ref" && r.bench) && r.fin.d === r.fin.d ? verdict(spec, r.fin.d, r.fin.dse) : "—"),
              h("td", { class: "num", text: !flat && r.pub ? num(spec, r.pub.mean) : "—" })));
          });
          out.appendChild(h("div", { class: "gref" }, h("table", { class: "gtab hp-tab db-tab ar-tab", id: "qsbTab" },
            h("caption", { text: "结算的 " + spec.sets.fin + " 组，每组 " + spec.sets.K + " 局；每一局发给各条规则的是同一副牌。± 后面是标准误。" }),
            h("thead", null, h("tr", null, h("th", { text: "名次" }), h("th", { text: "谁" }), h("th", { text: "结算的 " + spec.sets.fin + " 组" }), h("th", { text: "比基准多" }), h("th", { text: "公开的 " + spec.sets.pub + " 组" }))), tb)));
        }
        if (res && refSeen) out.appendChild(h("p", { class: refBad ? "warn" : "note", id: "qsbRefs", text: refBad ? "基准规则的成绩，你的浏览器算出来的和公布的不一样。不同的浏览器算小数偶尔会差最后几位；差得多，就是结算出了问题。" : "基准规则的成绩是你的浏览器自己算的，和公布的对得上：结算用的数据和程序没有走样。" }));
        if (res) {
          var sk = res.skipped, parts = [];
          if (sk.edited) parts.push(sk.edited + " 条在截止之后改过正文");
          if (sk.sealed) parts.push(sk.sealed + " 条解不开或者不成样子");
          if (sk.more) parts.push(sk.more + " 条因为太多没有列出来");
          if (parts.length) out.appendChild(h("p", { class: "note", id: "qsbSkipped", text: "另外有几条没有算进来：" + parts.join("，") + "。" }));
        }
        out.appendChild(h("div", { class: "row tight db-foot" }, h("button", { class: "btn small", type: "button", id: "qsbRefresh", text: "重新取一遍", onclick: function () { settle(true); } })));
        var how = h("p", { class: "note db-how", id: "qsbHow" }, "交上来的规则是加密的，只有这个仓库里自动运行的结算程序解得开。截止之后，它把每条规则单独放进没有网络的隔离环境，在结算的几组数据上打一遍，然后公布成绩和规则的名字");
        if (res && res.url) { how.appendChild(document.createTextNode("（")); how.appendChild(h("a", { href: res.url, target: "_blank", rel: "noopener", id: "qsbIssue", text: "这一天的结果" })); how.appendChild(document.createTextNode("）")); }
        how.appendChild(document.createTextNode("，不公布代码。结算的几组数据由一个公共的随机数决定："));
        how.appendChild(h("a", { href: A.questOpt.relays[0] + "/" + Q.beacon.chain + "/public/" + QL.questRound(day), target: "_blank", rel: "noopener", text: "drand 第 " + QL.questRound(day) + " 轮" }));
        how.appendChild(document.createTextNode("，在截止之后半分钟（" + new Date(QL.beaconTime(QL.questRound(day))).toISOString().slice(0, 19).replace("T", " ") + " UTC）才发布，之前谁也算不出来。别人的成绩你没法自己验算；基准规则和你自己的那一行，是你的浏览器重算过的。同分的时候先交的排前面；截止之后改过正文的、原样照搬别人封好的那一份的不算。解开用的私钥由仓库的主人保管：他技术上解得开所有人的规则。规则和裁判在同一个线程里，没法完全隔绝，所以这个榜图个乐。"));
        out.appendChild(how);
      }
      settle(false);
    }
    start();
    return m;
  };

  if (A.lobbyAdd) A.lobbyAdd({
    id: "quest", order: 12, route: "quest", primary: true, kicker: "每天一道题，写规则来解", title: "每日一题", label: "看今天的题", keys: "quest challenge 每日 一题 题目 策略 比赛 结算 排名",
    blurb: "每天一道新题：一个带裁判的小游戏。写一条规则来解，先在公开的几组数据上试，再封起来交上去（别人看不到你的代码）；截止之后换另外几组数据结算、排名。",
    status: function () { var r = store.days[today()]; return r && r.title ? "今天：" + r.title + (r.posted ? " · 你交过了" : "") : ""; },
    go: function (arg) { A.openQuest(arg); }
  });
})(App);
