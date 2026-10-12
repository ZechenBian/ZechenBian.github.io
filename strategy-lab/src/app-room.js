// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 应用主体（九）：实时房间。最多八个人同时打同一局，打的时候只看得到彼此打到第几回合，所有人都打完，成绩一起揭晓。
 * 通道是公共的 MQTT 中继（src/mq.js），不经过 GitHub，不需要账号。房间里有三种东西：
 *   cfg       房主写：打哪套玩法、多长、种子、第几局、现在是在等人（lobby）、在打（play）还是房主叫停了（over）
 *   p/<编号>  每个人各写各的：昵称、在第几局、打到第几回合、打完没有、打完时交的"封条"
 *   r/<编号>  揭晓时每个人各写各的：这一局的全部动作，和封条用的那串随机字
 * 一起揭晓靠"先封后亮"：打完的人先交封条（动作 + 一串随机字的 SHA-256），等这一局在场的人都交了封条，各人才把动作亮出来。
 * 亮出来的动作和封条对不上的作废，所以没法看了别人的再改自己的。得分不由本人报：每个人的浏览器照着动作各自重放。
 * 打的那一局就是"亲手玩一局"里指定的那一局（app-human.js），裁判、局面、对照表都是同一份。 */
(function (A) {
  "use strict";
  var h = A.h, clear = A.clear, QL = A.QL;
  if (!QL.dailySpec || typeof QLRoom === "undefined") return;
  var MAXP = 8, SIZES = ["s", "m", "l"];
  A.roomOpt = { stale: 35000, beat: 10000 };   // 多久没动静算掉线、多久报一次到（毫秒）。测试里会调小
  var cur = null;   // 眼下所在的房间（一次只在一个里）

  /* ---------- 我是谁 ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function myId() { var u = lsGet("ql.uid"); if (!u || !/^[a-z0-9]{8,24}$/.test(u)) { u = QLMQ.rid(12); lsSet("ql.uid", u); } return u; }
  function myNick() { var n = (lsGet("ql.nick") || "").trim(); return n ? n.slice(0, 20) : ""; }
  function cleanNick(s) { return String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 20); }
  /** 封条：SHA-256 的十六进制。浏览器不给用（不是安全的页面）时返回空字符串，那就不封 */
  function seal(text) {
    try {
      if (!crypto.subtle) return Promise.resolve("");
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join(""); }, function () { return ""; });
    } catch (e) { return Promise.resolve(""); }
  }
  function isInt(x) { return typeof x === "number" && x === Math.floor(x) && isFinite(x); }
  function sizeHp(type, z) { var L = QL.humanSizes(type, QL.worldDefaults(type)), o = L.filter(function (x) { return x.id === z; })[0] || L.filter(function (x) { return x.id === "m"; })[0]; return o.hp; }
  function sizeLabel(type, z) { return A.humanSizeLabel(type, sizeHp(type, z)); }
  /** 别人写来的东西先过一遍：不合规矩的当作没有 */
  function okCfg(c) { return c && typeof c.host === "string" && c.host.length <= 40 && !!QL.humanDef(c.type) && SIZES.indexOf(c.z) >= 0 && isInt(c.k) && c.k >= 0 && c.k < 1e6 && isInt(c.seed) && c.seed >= 0 && c.seed < 1e6 && (c.phase === "lobby" || c.phase === "play" || c.phase === "over") ? c : null; }
  function okP(p) { return p && typeof p.n === "string" && isInt(p.k) && isInt(p.t) && isInt(p.T) && (p.done === 0 || p.done === 1) && typeof p.h === "string" && p.h.length <= 64 ? p : null; }
  function okR(r) { return r && isInt(r.k) && typeof r.acts === "string" && r.acts.length <= 40000 && typeof r.salt === "string" && r.salt.length <= 40 ? r : null; }

  /* ---------- 一个房间 ---------- */
  function enter(code, create) {
    var me = myId(), R = { code: code, me: me, alive: true, cfg: null, round: 0, sat: 0, my: null, hp: null, judged: {}, first: true, joinedAt: Date.now(), full: false, missing: false, modal: null, body: null, timers: [] };
    function spec() { var c = R.cfg; return { type: c.type, hp: sizeHp(c.type, c.z), seed: c.seed, k: c.k, T: QL.WORLDS[c.type].Tof(sizeHp(c.type, c.z)) }; }
    function isHost() { return !!R.cfg && R.cfg.host === me; }
    /** 这个人现在在不在：他最近一次发来东西是什么时候 */
    function online(uid) {
      if (uid === me) return true;
      var info = R.room.info("p/" + uid), p = okP(R.room.get("p/" + uid)); if (!info || !p) return false;
      var at = info.live ? info.rt : Math.min(info.rt, typeof p.at === "number" ? p.at : 0);   // 中继替他留着的旧消息：按他自己写的时间算
      return Date.now() - at < A.roomOpt.stale;
    }
    function players() {
      return R.room.keys("p/").map(function (k) { var uid = k.slice(2), p = okP(R.room.get(k)); return p ? { uid: uid, n: cleanNick(p.n) || "玩家", k: p.k, t: p.t, T: p.T, done: p.done === 1, h: p.h, on: online(uid), me: uid === me } : null; })
        .filter(function (p) { return p && (p.on || (R.round > 0 && p.k === R.round)); })   // 早就走了的人（中继还替他留着一条旧消息）不列出来
        .sort(function (a, b) { return (b.me ? 1 : 0) - (a.me ? 1 : 0) || (a.uid < b.uid ? -1 : 1); });
    }
    function inRound() { return players().filter(function (p) { return p.k === R.round && R.round > 0; }); }
    function pubMe() {
      var m = R.my || {};
      R.room.set("p/" + me, { n: myNick() || "玩家", at: Date.now(), k: m.k | 0, t: m.t | 0, T: m.T | 0, done: m.sealed ? 1 : 0, h: m.h || "" });   // 封条交上去了才算"打完"：别人是看到这个才亮动作的
    }
    var pubT = 0;
    function pubSoon() { if (pubT) return; pubT = setTimeout(function () { pubT = 0; if (R.alive) pubMe(); }, 350); }

    /* 先封后亮 */
    function maybeReveal() {
      var m = R.my; if (!m || !m.done || m.shown || !m.sealed || !R.cfg || m.k !== R.round) return;
      var waiting = inRound().filter(function (p) { return p.on && !p.done; });
      if (R.cfg.phase !== "over" && waiting.length) return;
      m.shown = true; R.room.set("r/" + me, { k: m.k, acts: m.acts, salt: m.salt });
    }
    /** 这一局里某个人亮出来的成绩：{ ok, score, bad }。照着动作重放；和封条对不上的作废 */
    function judge(p) {
      var r = okR(R.room.get("r/" + p.uid)); if (!r || r.k !== R.round) return null;
      var key = p.uid + "|" + r.k + "|" + r.salt + "|" + r.acts.length, j = R.judged[key];
      if (j) return j;
      var sp = spec(), acts = QL.actsUnpack(r.acts, sp.T), rp = acts ? QL.humanReplay(sp, acts) : { ok: false };
      j = R.judged[key] = { ok: rp.ok, score: rp.ok ? rp.score : NaN, bad: false, checked: !p.h };
      if (p.h) seal(r.acts + "|" + r.salt).then(function (x) { j.checked = true; if (x && x !== p.h) { j.bad = true; j.ok = false; } if (R.alive) draw(); });
      return j;
    }

    /* 开一局、收到别人开的一局 */
    function startRound() {
      var c = R.cfg; if (!c || c.host !== me) return;
      setCfg({ host: me, type: c.type, z: c.z, seed: c.seed, k: c.k + 1, phase: "play", at: Date.now() });
    }
    function setCfg(c) { R.room.set("cfg", c); onCfg(c); }
    function onCfg(c) {
      var prev = R.cfg; R.cfg = c; R.missing = false;
      if (R.first) { R.first = false; if (c.phase !== "lobby" && c.host !== me) R.sat = c.k; }   // 进来的时候这一局已经开打了：这一局旁观，等下一局
      if (c.k !== R.round) { R.round = c.k; R.judged = {}; if (c.phase === "play" && c.k !== R.sat) play(); else { R.my = null; closeHuman(); if (R.room.get("p/" + me)) pubMe(); } }
      else if (prev && prev.phase !== c.phase) maybeReveal();
      draw();
    }
    function closeHuman() { var x = R.hp; R.hp = null; if (x) x.close(); }
    function play() {
      var sp = spec();
      closeHuman();
      R.my = { k: sp.k, t: 0, T: sp.T, done: false, h: "", acts: "", salt: QLMQ.rid(16), cur: null, sealed: false, shown: false };
      pubMe(); openHuman();
    }
    function openHuman() {
      var sp = spec(), w = QL.WORLDS[sp.type], m = R.my; if (!m || R.hp) return;
      var api = A.openHuman({ fixed: {
        id: "room|" + code + "|" + sp.k, type: sp.type, hp: sp.hp, seed: sp.seed, k: sp.k, title: "实时房间 · " + w.name, label: "房间 " + code + " · 第 " + sp.k + " 局",
        acts: function () { return m.cur; },
        onStep: function (acts, t) { m.cur = acts; m.t = t; pubSoon(); },
        onFinish: function (x) {
          m.cur = x.acts;
          if (m.done) return;
          m.done = true; m.t = m.T; m.acts = QL.actsPack(x.acts);
          seal(m.acts + "|" + m.salt).then(function (hx) { m.h = hx; m.sealed = true; if (!R.alive) return; pubMe(); maybeReveal(); draw(); });
          pubSoon();
        },
        mount: function (a) { a.banner.appendChild(R.strip = h("div", { class: "rm-strip", id: "rmStrip" })); a.extra.appendChild(R.after = h("div", { class: "db rm-after", id: "rmAfter" })); },
        onRender: function () { drawHuman(); },
        onClose: function () { if (R.hp === api) R.hp = null; R.strip = null; R.after = null; if (R.alive) draw(); }
      } });
      R.hp = api;
    }

    /* ---------- 画 ---------- */
    function stateText(p) {
      if (!p.on) return "掉线了";
      if (!R.round || p.k !== R.round) return R.cfg && R.cfg.phase === "play" ? "旁观，等下一局" : "在等开始";
      if (p.done) return "打完了";
      return "打到 " + Math.min(p.T, p.t + 1) + " / " + p.T;
    }
    function table() {
      var sp = spec(), kk = sp.type + "|" + R.cfg.z + "|" + sp.seed;
      if (R.kitKey !== kk) { R.kitKey = kk; R.kit = QL.humanKit(sp.type, sp.hp, sp.seed); }
      var kit = R.kit, lower = !!kit.score.lower;
      function fmt(v) { if (kit.score.kind === "prob" && (v === 0 || v === 1)) return v ? "✓" : "✗"; return A.gfmt(kit.score, v); }
      var ps = inRound(), rows = [], shown = 0;
      ps.forEach(function (p) { var j = judge(p); if (j && j.ok) { shown++; rows.push({ p: p, score: j.score, at: 0 }); } });
      var rk = QL.rankRows(rows, lower), tb = h("tbody"), all = rows.map(function (r, i) { return { p: r.p, score: r.score, rank: rk.rank[i] }; });
      if (shown) {
        var key = "refs|" + sp.k; if (R.refKey !== key) { R.refKey = key; R.refs = QL.humanRefsOn(kit, QL.humanEpisode(sp.type, sp.hp, sp.seed, sp.k), false); }
        R.refs.forEach(function (x) { var r = kit.refs.filter(function (q) { return q.id === x.id; })[0]; if (!x.err && x.score === x.score) all.push({ ref: r, score: x.score, rank: 0 }); });
      }
      all.sort(function (a, b) { var d = lower ? a.score - b.score : b.score - a.score; return d || (a.rank ? 0 : 1) - (b.rank ? 0 : 1); });
      all.forEach(function (r) {
        tb.appendChild(h("tr", { class: (r.p && r.p.me ? "me" : "") + (r.ref ? " ref" : ""), "data-who": r.p ? r.p.uid : "ref" }, h("td", { class: "num", text: r.rank ? String(r.rank) : "—" }),
          h("td", null, r.ref ? [h("span", { class: "tag", text: r.ref.bench ? "基准" : "规则" }), " ", r.ref.name] : [h("b", { text: r.p.n }), r.p.me ? "（你）" : ""]), h("td", { class: "num", text: fmt(r.score) })));
      });
      ps.forEach(function (p) {
        var j = judge(p); if (j && j.ok) return;
        var why = j && j.bad ? "亮出来的动作和封条对不上，作废" : j ? "动作重放不通，作废" : !p.on ? "掉线了" : p.done ? "打完了，等着一起揭晓" : "还在打：" + stateText(p);
        tb.appendChild(h("tr", { class: p.me ? "me" : "", "data-who": p.uid }, h("td", { class: "num", text: "—" }), h("td", null, h("b", { text: p.n }), p.me ? "（你）" : ""), h("td", { class: "note", text: why })));
      });
      return { el: h("div", { class: "gref" }, h("table", { class: "gtab hp-tab db-tab rm-tab" }, h("thead", null, h("tr", null, h("th", { text: "名次" }), h("th", { text: "谁" }), h("th", { text: "得分" }))), tb)), shown: shown, n: ps.length, left: ps.filter(function (p) { return p.on && !p.done; }).length };
    }
    function hostButtons(host) {
      var c = R.cfg; if (!c) return;
      if (isHost()) {
        // 还有人在打：房主只能选择"不等了"；都打完了（或者还没开过）才能开下一局
        if (c.phase === "play" && inRound().some(function (p) { return p.on && !p.done; })) host.appendChild(h("button", { class: "btn small", type: "button", id: "rmForce", text: "不等了，现在揭晓", onclick: function () { setCfg(Object.assign({}, R.cfg, { phase: "over", at: Date.now() })); } }));
        else host.appendChild(h("button", { class: "btn primary", type: "button", id: "rmStart", text: c.k ? "再来一局" : "开始", onclick: startRound }));
      } else {
        var hostOn = players().some(function (p) { return p.uid === c.host && p.on; });
        if (hostOn) host.appendChild(h("span", { class: "note", text: c.phase === "play" ? "这一局打完，由房主开下一局。" : "等房主开始。" }));
        else host.appendChild(h("button", { class: "btn", type: "button", id: "rmTake", text: "房主掉线了，我来当房主", onclick: function () { setCfg(Object.assign({}, R.cfg, { host: me, at: Date.now() })); } }));
      }
    }
    /** 打的那个弹层里：上面一行各人的进度，打完之后下面是这一局的成绩 */
    function drawHuman() {
      if (!R.hp || !R.cfg) return;
      var ps = inRound(), m = R.my;
      if (R.strip) {
        clear(R.strip);
        ps.forEach(function (p) {
          R.strip.appendChild(h("span", { class: "rm-chip" + (p.me ? " me" : "") + (p.on ? "" : " off") + (p.done ? " done" : ""), "data-who": p.uid }, h("b", { text: p.me ? "你" : p.n }), h("span", { class: "num", text: p.done ? "✓" : !p.on ? "掉线" : p.t + " / " + p.T }), h("i", { style: { width: (p.T ? 100 * (p.done ? p.T : p.t) / p.T : 0) + "%" } })));
        });
      }
      if (R.after) {
        clear(R.after);
        if (!m || !m.done) return;
        var t = table();
        R.after.appendChild(h("div", { class: "row tight db-head" }, h("h3", { class: "db-title", text: "这一局的成绩" }), h("span", { class: "sp" })));
        R.after.appendChild(h("p", { class: "db-say", id: "rmSay", text: t.shown === t.n ? "都亮出来了。每个人的得分都是在你的浏览器里照着动作重放出来的。" : t.left ? "还有 " + t.left + " 个人在打。所有人都打完，成绩一起揭晓；在那之前谁也看不到谁的。" : "正在揭晓…" }));
        R.after.appendChild(t.el);
        var foot = h("div", { class: "row tight db-foot" }); hostButtons(foot); R.after.appendChild(foot);
      }
    }
    /** 房间的弹层：房间号、谁在、打什么、谁来开始 */
    function draw() {
      drawHuman();
      var body = R.body; if (!body) return;
      clear(body);
      var c = R.cfg, ps = players(), up = R.room.up();
      body.appendChild(h("div", { class: "rm-code" }, h("span", { class: "note", text: "房间号" }), h("b", { class: "num", id: "rmCode", text: code }), h("button", { class: "btn small", type: "button", id: "rmCopy", text: "复制邀请链接", onclick: function () { A.copy(A.lobbyLink("room", code)); } }),
        h("span", { class: "sp" }), h("span", { class: "note", id: "rmNet", text: up ? "已连上 " + up + " / " + R.room.total() + " 台中继" : "正在连中继…" })));
      if (!up && Date.now() - R.joinedAt > 9000) body.appendChild(h("div", { class: "warn", id: "rmDown", text: "连不上公共的中继服务器。可能是这个网络把它们拦了；换一个网络再试，或者过一会儿它会自己重连。" }));
      if (R.full) { body.appendChild(h("div", { class: "warn", id: "rmFull", text: "这个房间已经有 " + MAXP + " 个人了，进不去。" })); return; }
      if (!c) { body.appendChild(h("p", { class: R.missing ? "warn" : "note", id: "rmWait", text: R.missing ? "没有找到这个房间。房间号可能输错了，或者里面的人都已经走了。" : "正在进房间…" })); return; }
      var w = QL.WORLDS[c.type], line = h("div", { class: "row tight rm-game" });
      if (isHost() && c.phase !== "play") {
        var gs = h("select", { id: "rmGame", "aria-label": "打哪套玩法", onchange: function () { setCfg(Object.assign({}, R.cfg, { type: gs.value, at: Date.now() })); } }, QL.humanGames().map(function (g) { return h("option", { value: g, text: QL.WORLDS[g].short, selected: g === c.type }); }));
        var zs = h("select", { id: "rmSize", "aria-label": "一局打多长", onchange: function () { setCfg(Object.assign({}, R.cfg, { z: zs.value, at: Date.now() })); } }, SIZES.map(function (z) { return h("option", { value: z, text: sizeLabel(c.type, z), selected: z === c.z }); }));
        line.appendChild(h("span", { class: "note", text: "打什么" })); line.appendChild(gs); line.appendChild(zs);
      } else line.appendChild(h("span", { id: "rmWhat", text: "打的是" + w.short + "（" + sizeLabel(c.type, c.z) + "）" + (c.k ? "，现在是第 " + c.k + " 局。" : "。") }));
      body.appendChild(line);
      var tb = h("tbody");
      ps.forEach(function (p) { tb.appendChild(h("tr", { class: p.me ? "me" : "", "data-who": p.uid }, h("td", null, h("b", { text: p.n }), p.me ? "（你）" : "", p.uid === c.host ? h("span", { class: "tag", text: "房主" }) : null), h("td", { class: p.on ? "" : "note", text: stateText(p) }))); });
      body.appendChild(h("div", { class: "gref" }, h("table", { class: "gtab hp-tab rm-list" }, h("caption", { text: "房间里有 " + ps.filter(function (p) { return p.on; }).length + " 个人（最多 " + MAXP + " 个）" }), h("thead", null, h("tr", null, h("th", { text: "谁" }), h("th", { text: "在做什么" }))), tb)));
      if (R.round && c.k === R.round && (c.phase === "over" || inRound().some(function (p) { return !!judge(p); }))) {
        var t = table(); body.appendChild(h("h3", { class: "db-title", text: "第 " + c.k + " 局的成绩" })); body.appendChild(t.el);
      }
      var foot = h("div", { class: "row tight rm-foot" });
      if (R.my && !R.hp && R.my.k === R.round) foot.appendChild(h("button", { class: "btn" + (R.my.done ? "" : " primary"), type: "button", id: "rmBack", text: R.my.done ? "看这一局的对照" : "回到这一局", onclick: function () { openHuman(); } }));
      hostButtons(foot);
      foot.appendChild(h("span", { class: "sp" }));
      foot.appendChild(h("button", { class: "btn small", type: "button", id: "rmLeave", text: "离开房间", onclick: function () { leave(); } }));
      body.appendChild(foot);
      body.appendChild(h("p", { class: "note", text: "房间走公共的中继服务器，不需要账号。知道房间号的人都能进来，昵称、进度和这一局的动作会经过中继。" }));
    }
    function leave() {
      if (!R.alive) return; R.alive = false;
      R.timers.forEach(clearInterval); clearTimeout(pubT);
      closeHuman();
      try { R.room.close(); } catch (e) {}
      if (cur === R) cur = null;
      var m = R.modal; R.modal = null; R.body = null; if (m) m.close();
    }
    R.leave = leave;
    R.show = function () {
      if (R.modal) return;
      R.body = h("div", { class: "rm", id: "roomBody" });
      R.modal = A.modal("实时房间", R.body, { cls: "rmm", onClose: function () { R.modal = null; R.body = null; } });
      draw();
    };
    R.room = QLRoom.open(code, me, {
      doc: function (key, data) {
        if (!R.alive) return;
        if (key === "cfg") { var c = okCfg(data); if (c) onCfg(c); return; }
        if (key.slice(0, 2) === "p/" && !R.cfg && !create) { /* 还没收到 cfg：先不急 */ }
        maybeReveal(); draw();
      },
      status: function () { if (R.alive) draw(); }
    });
    if (create) {
      var t0 = A.humanOk(A.state.world.type) ? A.state.world.type : QL.dailySpec(QL.dayOf(Date.now())).type;
      setCfg({ host: me, type: t0, z: "m", seed: Math.floor(Math.random() * 1e6), k: 0, phase: "lobby", at: Date.now() });
      pubMe();
    } else {
      // 进别人的房间：等一会儿，看有没有这个房间、是不是满了，再报到
      R.timers.push(setTimeout(function () {
        if (!R.alive) return;
        if (!R.cfg) { R.missing = true; draw(); return; }
        if (players().filter(function (p) { return p.on && !p.me; }).length >= MAXP) { R.full = true; draw(); try { R.room.close(); } catch (e) {} return; }
        pubMe(); draw();
      }, 1500));
      R.timers.push(setTimeout(function () { if (R.alive && !R.cfg) { R.missing = true; draw(); } }, 7000));
    }
    R.timers.push(setInterval(function () { if (!R.alive) return; if (R.cfg && !R.full && (create || R.room.get("p/" + me))) pubMe(); maybeReveal(); draw(); }, A.roomOpt.beat));
    R.timers.push(setInterval(function () { if (R.alive && R.hp) drawHuman(); }, 3000));
    return R;
  }

  /* ---------- 入口 ---------- */
  A.roomNow = function () { return cur; };
  A.openRoom = function (code) {
    if (cur && cur.alive) { if (!code || code === cur.code) { cur.show(); return; } }
    code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    var nick = h("input", { type: "text", id: "rmNick", maxlength: 20, value: myNick(), placeholder: "给自己起个名字", "aria-label": "昵称" });
    var codeI = h("input", { type: "text", id: "rmJoinCode", maxlength: 6, value: code, placeholder: "6 位房间号", "aria-label": "房间号", autocapitalize: "characters", spellcheck: "false", class: "num" });
    var err = h("div", { class: "warn err", id: "rmErr", hidden: true });
    function go(c, create) {
      var n = cleanNick(nick.value); if (!n) { err.hidden = false; err.textContent = "先起个名字，别人才认得出你。"; nick.focus(); return; }
      if (!create && !QLRoom.codeOk(c)) { err.hidden = false; err.textContent = "房间号是 6 位的字母和数字（没有 0、1、I、L、O）。"; codeI.focus(); return; }
      lsSet("ql.nick", n);
      if (cur && cur.alive) cur.leave();
      m.close(); cur = enter(c, create); cur.show();
    }
    codeI.addEventListener("input", function () { codeI.value = codeI.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
    codeI.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); go(codeI.value, false); } });
    var m = A.modal("实时房间", [
      h("p", { class: "lb-lead", text: "最多八个人同时打同一局。打的时候只看得到彼此打到第几回合；所有人都打完，成绩一起揭晓，再和参照规则在同一局上比。" }),
      h("div", { class: "field rm-field" }, h("label", { for: "rmNick", text: "你的名字" }), h("span"), nick),
      h("div", { class: "rm-two" },
        h("div", { class: "rm-opt" }, h("h3", { text: "开一个新房间" }), h("p", { class: "note", text: "你来当房主：选玩法，把邀请链接发给朋友，人齐了点开始。" }), h("button", { class: "btn" + (code ? "" : " primary"), type: "button", id: "rmCreate", text: "开房间", onclick: function () { go(QLRoom.newCode(), true); } })),
        h("div", { class: "rm-opt" }, h("h3", { text: "进别人的房间" }), h("p", { class: "note", text: "填朋友给你的房间号；点邀请链接进来的话，已经替你填好了。" }), h("div", { class: "row tight" }, codeI, h("button", { class: "btn" + (code ? " primary" : ""), type: "button", id: "rmJoin", text: "进房间", onclick: function () { go(codeI.value, false); } })))),
      err,
      h("p", { class: "note", text: "房间走公共的中继服务器，不经过 GitHub，也不需要账号。关掉页面就算离开；所有人都离开，房间就没有了。" })
    ], { cls: "rmm", narrow: false, focus: myNick() ? (code ? "#rmJoin" : "#rmCreate") : "#rmNick" });
  };
  window.addEventListener("pagehide", function () { if (cur && cur.alive) { try { cur.room.close(); } catch (e) {} } });

  if (A.lobbyAdd) A.lobbyAdd({
    id: "room", order: 20, route: "room", kicker: "同一局，大家一起打", title: "实时房间", label: "开房间或进房间", keys: "room 房间 联机 多人 一起 实时 朋友",
    blurb: "最多八个人同时打同一局。打的时候只看得到彼此的进度，所有人打完一起揭晓。不需要账号，把邀请链接发给朋友就行。",
    status: function () { return cur && cur.alive ? "你在房间 " + cur.code + " 里" : ""; },
    go: function (arg) { A.openRoom(arg); }
  });
})(App);
