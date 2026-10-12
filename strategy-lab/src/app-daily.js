// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 应用主体（八）：每日一局。全站每天打同一局（哪套玩法、哪个种子只由日期决定，见 social.js），打完看自己排在所有人的哪个位置。
 * 打：就是"亲手玩一局"里指定的那一局，一天只有这一局，打到一半关掉可以接着打。成绩存在这台设备上。
 * 榜：想上榜的人自己把这一局的动作贴成一条 GitHub Issue（src/hub.js）。看榜的人把每一条交来的动作在自己的浏览器里重放一遍，
 *     得分以重放出来的为准，所以没法虚报；同一个账号一天只算最早交的那一条。
 * 种子是公开的，先看完整局再回头挑动作的人拦不住：这个榜只图个乐。 */
(function (A) {
  "use strict";
  var h = A.h, clear = A.clear, QL = A.QL;
  if (typeof QL_SOCIAL_INSTALL === "function" && QL.humanDef && !QL.dailySpec) QL_SOCIAL_INSTALL(QL);
  if (!QL.dailySpec) return;

  /* ---------- 存档：一天一条 ---------- */
  var KEY = "ql.daily.v1", store = { v: 1, days: {} };
  try {
    var o0 = JSON.parse(localStorage.getItem(KEY) || "null");
    if (o0 && o0.v === 1 && o0.days && typeof o0.days === "object") Object.keys(o0.days).forEach(function (d) {
      var r = o0.days[d]; if (!r || typeof r.acts !== "string" || !(QL.dayNum(d) === QL.dayNum(d))) return;
      store.days[d] = { type: String(r.type || ""), acts: r.acts.slice(0, 40000), done: !!r.done, score: typeof r.score === "number" ? r.score : NaN, at: +r.at || 0, v: r.v | 0 };
    });
  } catch (e) {}
  function save() {
    try {
      var ks = Object.keys(store.days).sort(); if (ks.length > 90) ks.slice(0, ks.length - 90).forEach(function (k) { delete store.days[k]; });   // 只留最近 90 天
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch (e) {}
  }
  /** 这一天存下来的那一局；玩法或者对局的生成方式对不上（换过版本）就当没打过 */
  function rec(spec) { var r = store.days[spec.day]; return r && r.type === spec.type && r.v === QL.HUMAN_VER ? r : null; }
  function touch(spec) { var r = rec(spec); if (!r) r = store.days[spec.day] = { type: spec.type, acts: "", done: false, score: NaN, at: 0, v: QL.HUMAN_VER }; return r; }
  function today() { return QL.dayOf(Date.now()); }
  A.dailyToday = today;
  function sizeText(spec) { return A.humanSizeLabel(spec.type, spec.hp); }
  function untilNext() {
    var ms = (QL.dayNum(today()) + 1) * 864e5 - Date.now(), hr = Math.floor(ms / 36e5), mi = Math.floor((ms % 36e5) / 6e4);
    return hr > 0 ? hr + " 小时 " + mi + " 分钟" : Math.max(1, mi) + " 分钟";
  }

  /* ---------- 榜 ---------- */
  /** 把交上来的东西核对一遍：只留这一天这一局的、重放得通的；同一个账号只算最早的那一条 */
  function verify(spec, items) {
    var seen = {}, rows = [];
    items.slice().sort(function (a, b) { return a.at - b.at || a.n - b.n; }).forEach(function (it) {
      var m = it.meta; if (m.day !== spec.day || m.game !== spec.type || !it.user || seen[it.user]) return;
      var acts = QL.actsUnpack(m.acts, spec.T); if (!acts) return;
      var rp = QL.humanReplay(spec, acts); if (!rp.ok) return;
      seen[it.user] = 1; rows.push({ user: it.user, avatar: it.avatar, url: it.url, at: it.at, score: rp.score, packed: QL.actsPack(rp.acts), up: it.up });
    });
    return rows;
  }
  A.dailyVerify = verify;
  /** 在 host 里画这一天的榜。mine()：{ acts（写成一行字的）, score } 或 null；refs：[{ name, score, bench }]；fmt：得分怎么写；lower：是不是越低越好 */
  function board(host, spec, mine, refs, fmt, lower) {
    var st = { loading: false, rows: null, err: null, at: 0, posted: false }, alive = true;
    function load(fresh) {
      st.loading = true; draw();
      QLHub.list({ kind: "daily", since: spec.day + "T00:00:00Z", fresh: !!fresh }).then(function (res) {
        st.loading = false; st.rows = verify(spec, res.items); st.err = res.stale ? res.error : null; st.at = res.at; if (alive) draw();
      }, function (e) { st.loading = false; st.err = e || {}; if (alive) draw(); });
    }
    function errText(e) {
      if (e.limited) return "GitHub 限制了这个网络的访问次数（不登录每小时 60 次）。过一会儿再刷新。";
      return "连不上 GitHub，排名暂时看不了。这一局的成绩已经存在这台设备上，不受影响。";
    }
    function draw() {
      clear(host);
      var me = mine(), rows = st.rows || [], isToday = spec.day === today(), dayWord = isToday ? "今天" : spec.day;
      var meRow = null, people = rows.map(function (r) { var o = Object.assign({ who: "user" }, r); if (me && r.packed === me.acts) { o.me = true; meRow = o; } return o; });
      if (me && !meRow) { meRow = { who: "me", me: true, score: me.score, at: Date.now(), ghost: true }; people.push(meRow); }
      var rk = QL.rankRows(people, lower), all = people.slice();
      people.forEach(function (r, i) { r.rank = rk.rank[i]; });
      (refs || []).forEach(function (r) { if (r.score === r.score) all.push({ who: "ref", name: r.name, bench: r.bench, score: r.score, rank: 0, at: Infinity }); });
      all.sort(function (a, b) { var d = lower ? a.score - b.score : b.score - a.score; return d || (a.rank ? 0 : 1) - (b.rank ? 0 : 1) || a.at - b.at; });
      var n = rows.length, head = h("div", { class: "row tight db-head" }, h("h3", { class: "db-title", text: dayWord + "的排名" }), h("span", { class: "sp" }));
      if (st.at) head.appendChild(h("span", { class: "note", text: "核对过的成绩 " + n + " 条" }));
      head.appendChild(h("button", { class: "btn small", type: "button", id: "dbRefresh", disabled: st.loading, text: st.loading ? "正在取…" : "刷新", onclick: function () { load(true); } }));
      host.appendChild(head);
      var say = "";
      if (st.rows) {
        if (!n) say = dayWord + "还没有人上榜。";
        else if (meRow && !meRow.ghost) say = dayWord + "有 " + n + " 个人上榜，你排第 " + meRow.rank + "。";
        else if (meRow) say = dayWord + "有 " + n + " 个人上榜。把你的成绩贴上去的话，排第 " + meRow.rank + "（共 " + (n + 1) + " 人）。";
        else say = dayWord + "有 " + n + " 个人上榜。";
        if (meRow && n + (meRow.ghost ? 1 : 0) >= 5) { var tot = n + (meRow.ghost ? 1 : 0), below = all.filter(function (r) { return r.rank > meRow.rank; }).length; say += "比你低的有 " + below + " 人，占 " + A.P(below / (tot - 1), 0) + "。"; }
      }
      if (say) host.appendChild(h("p", { class: "db-say", id: "dbSay", text: say }));
      if (st.err) host.appendChild(h("div", { class: "warn", id: "dbErr", text: errText(st.err) + (st.rows ? "下面是上一次取到的。" : "") }));
      if (st.rows || me) {
        var tb = h("tbody");
        all.forEach(function (r) {
          var who;
          if (r.who === "ref") who = [h("span", { class: "tag", text: r.bench ? "基准" : "规则" }), " ", r.name];
          else if (r.who === "me") who = [h("b", { text: "你" }), h("span", { class: "note", text: "（还没贴到榜上）" })];
          else who = [r.avatar ? h("img", { class: "db-av", src: r.avatar + (r.avatar.indexOf("?") < 0 ? "?" : "&") + "s=40", alt: "", width: 18, height: 18, loading: "lazy" }) : null, h("a", { href: r.url, target: "_blank", rel: "noopener", text: "@" + r.user }), r.me ? h("b", { text: "（你）" }) : null];
          tb.appendChild(h("tr", { class: (r.me ? "me" : "") + (r.who === "ref" ? " ref" : ""), "data-who": r.who === "user" ? r.user : r.who }, h("td", { class: "num", text: r.rank ? String(r.rank) : "—" }), h("td", null, who), h("td", { class: "num", text: fmt(r.score) })));
        });
        host.appendChild(h("div", { class: "gref" }, h("table", { class: "gtab hp-tab db-tab" }, h("thead", null, h("tr", null, h("th", { text: "名次" }), h("th", { text: "谁" }), h("th", { text: "得分" }))), tb)));
      } else if (st.loading) host.appendChild(h("p", { class: "note", text: "正在从 GitHub 取大家的成绩…" }));
      var foot = h("div", { class: "row tight db-foot" });
      if (me && isToday && !(meRow && !meRow.ghost)) {
        var w = QL.WORLDS[spec.type], body = QLHub.pack({ kind: "daily", day: spec.day, game: spec.type, acts: me.acts, score: me.score, v: QL.HUMAN_VER }), u = QLHub.newUrl("daily", spec.day + " " + w.short + " " + fmt(me.score), body);
        var a = A.outLink("把我的成绩贴到榜上", u.url, true, "dbPost"); a.addEventListener("click", function () { st.posted = true; setTimeout(draw, 50); });
        foot.appendChild(a);
      }
      foot.appendChild(h("button", { class: "btn small", type: "button", id: "dbShare", text: "复制这一局的链接", onclick: function () { A.copy(A.lobbyLink("daily")); } }));
      if (isToday) foot.appendChild(h("button", { class: "btn small", type: "button", id: "dbYesterday", text: "看昨天的榜", onclick: function () { A.openDailyBoard(QL.dayShift(spec.day, -1)); } }));
      host.appendChild(foot);
      if (st.posted) host.appendChild(h("p", { class: "note", id: "dbPosted", text: "在刚打开的 GitHub 页面里点 Submit new issue（要先登录 GitHub 账号，成绩会以这个账号公开显示）。提交之后回到这里点\"刷新\"；GitHub 那边有时要等一两分钟才取得到。" }));
      host.appendChild(h("p", { class: "note db-how", text: "榜上的每一条都在你的浏览器里照着交来的动作重放过，得分以重放的为准。种子是公开的，先看完整局再回头挑动作的人拦不住，所以这个榜只图个乐。" }));
    }
    load(false);
    return { redraw: function () { if (alive) draw(); }, stop: function () { alive = false; } };
  }

  /* ---------- 打 ---------- */
  A.dailyStatus = function () {
    var spec = QL.dailySpec(today()), r = rec(spec), w = QL.WORLDS[spec.type], g = w.score(spec.hp);
    return { spec: spec, name: w.short, size: sizeText(spec), done: !!(r && r.done), started: !!(r && r.acts), scoreText: r && r.done ? A.gfmt({ kind: g.kind || "num", digits: g.digits == null ? 3 : g.digits, lower: !!g.lower }, r.score) : "" };
  };
  A.openDaily = function () {
    var spec = QL.dailySpec(today()), w = QL.WORLDS[spec.type], bd = null, hp = null;
    function mine() { var r = rec(spec); return r && r.done ? { acts: r.acts, score: r.score } : null; }
    hp = A.openHuman({ fixed: {
      id: "daily|" + spec.day, type: spec.type, hp: spec.hp, seed: spec.seed, k: 0, title: "每日一局 · " + w.name, label: spec.day + " · 全站同一局",
      acts: function () { var r = rec(spec); return r && r.acts ? QL.actsUnpack(r.acts, spec.T) : null; },
      onStep: function (acts) { var r = touch(spec); r.acts = QL.actsPack(acts); save(); },
      onFinish: function (x) { var r = touch(spec); r.acts = QL.actsPack(x.acts); r.done = true; r.score = x.score; if (!x.restored || !r.at) r.at = Date.now(); save(); },
      mount: function (api) {
        api.banner.appendChild(h("p", { class: "note db-banner", text: "每天一局，全站的人打的是同一局；换日在 UTC 0 点（北京时间早上 8 点），离下一局还有 " + untilNext() + "。只有这一次机会，打到一半关掉可以接着打。" }));
      },
      onRender: function (api) {
        if (!api.state().done) return;
        if (bd) { bd.redraw(); return; }
        var kit = api.kit(), refs = (api.refs() || []).map(function (x) { var r = kit.refs.filter(function (q) { return q.id === x.id; })[0]; return { name: r ? r.name : x.id, score: x.err ? NaN : x.score, bench: !!(r && r.bench) }; });
        var host = h("div", { class: "db", id: "dailyBoard" }); api.extra.appendChild(host);
        bd = board(host, spec, mine, refs, api.fmt, !!kit.score.lower);
      },
      onClose: function () { if (bd) bd.stop(); }
    } });
    return hp;
  };
  /** 只看某一天的榜（不打）：昨天的、更早的 */
  A.openDailyBoard = function (day) {
    var spec = QL.dailySpec(day), w = QL.WORLDS[spec.type], kit = QL.humanKit(spec.type, spec.hp, spec.seed), B = QL.humanEpisode(spec.type, spec.hp, spec.seed, 0);
    var refs = QL.humanRefsOn(kit, B, false).map(function (x) { var r = kit.refs.filter(function (q) { return q.id === x.id; })[0]; return { name: r.name, score: x.err ? NaN : x.score, bench: r.bench }; });
    var host = h("div", { class: "db" }), r0 = rec(spec);
    function fmt(v) { if (kit.score.kind === "prob" && (v === 0 || v === 1)) return v ? "✓" : "✗"; return A.gfmt(kit.score, v); }
    var bd = board(host, spec, function () { return r0 && r0.done ? { acts: r0.acts, score: r0.score } : null; }, refs, fmt, !!kit.score.lower);
    A.modal("每日一局 · " + day + " · " + w.short, [h("p", { class: "note", text: "这一天打的是" + w.short + "（" + sizeText(spec) + "），计分：" + kit.score.name + "。" }), host], { cls: "dbm", onClose: function () { bd.stop(); } });
  };

  if (A.lobbyAdd) A.lobbyAdd({
    id: "daily", order: 10, route: "daily", primary: true, kicker: "同一局，大家一起打", title: "每日一局", label: "打今天这一局", keys: "daily 每天 今日 排名 榜",
    blurb: "全站每天打同一局。打完看自己排在所有人的哪个位置，再和最优规则在同一局上比。",
    status: function () { var s = A.dailyStatus(); return "今天：" + s.name + "（" + s.size + "）" + (s.done ? " · 你的成绩 " + s.scoreText : s.started ? " · 打到一半" : " · 还没打"); },
    go: function () { A.openDaily(); }
  });
})(App);
