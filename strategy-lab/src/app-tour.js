// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 应用主体（十四）：新手教程。八步，每步两三分钟：这是什么 → 亲手打一局 → 开房间 → 写规则 → 十项全能 → 规则同场 → 世界工坊 → 贴给别人。
 * 每一步是几段话加一个按钮；按钮把人带到那个地方，同时在左下角留一个"回到教程"的小条，做完了点它接着看。
 * 看到第几步、哪几步去过，记在这台设备的浏览器里。教程本身不改任何设置。 */
(function (A) {
  "use strict";
  var h = A.h, clear = A.clear, QL = A.QL, KEY = "ql.tour.v1";
  var store = { v: 1, step: 0, went: {} };
  function dailyNames() { try { return QL.dailyGames().map(function (t) { return QL.WORLDS[t].short; }).join("、"); } catch (e) { return ""; } }
  /** 每一步：{ id, short（上面那排小标签）, title, body: [段落 | { list: [...] }], act: { label, go } } */
  function steps() {
    return [
      { id: "what", short: "这是什么", title: "一个拿来试想法的地方", body: [
        "策略实验室只做一件事：你出一个想法，它告诉你这个想法到底行不行。",
        "具体说：先选一个世界（数据从哪里来，比如一条随机涨跌的价格），再定一条规则（每一步怎么做，比如涨了就买）。页面把这条规则放到成千上万条路径上各跑一遍，把结果摆出来：平均赚多少，最坏亏多少，和什么也不做相比差多少，这个差别是不是运气。",
        "大厅里的几样东西，是把同一件事变成和别人一起玩：同一局大家比一比，规则和规则当对手，自己造世界让别人来试。",
        "这份教程每步两三分钟，不用按顺序。每一步有一个按钮带你去那个地方；做完之后，点左下角的\"回到教程\"接着看。" ] },
      { id: "daily", short: "打一局", title: "先亲手打一局", body: [
        "这一步不用写任何东西。全站每天同一局，玩法轮着来（" + dailyNames() + "），一局只有几十个回合，两三分钟打完。",
        "打完之后看两样东西。第一，你的得分和几条参照规则在同一局上的得分：你是真的打得好，还是只是这一局运气好？第二，今天的榜：你排在所有人的哪个位置。",
        "想上榜，点\"把我的成绩贴到榜上\"（需要 GitHub 账号，最后一步有说明）。不贴也没关系，成绩已经存在这台设备上了。" ],
        act: { label: "打今天这一局", go: function () { A.openDaily(); } } },
      { id: "room", short: "开房间", title: "拉朋友开一个房间", body: [
        "最多八个人同时打同一局。开房间的人挑玩法，把邀请链接发给朋友；人到齐了点\"开始\"。",
        "打的时候只看得到别人打到第几回合，看不到别人怎么选。所有人都打完，成绩一起揭晓，再和参照规则在同一局上比。",
        "不需要账号，起个名字就能进。一个人也能开房间，先看看它是什么样子。" ],
        act: { label: "开一个房间", go: function () { A.openRoom(); } } },
      { id: "rule", short: "写规则", title: "写你的第一条规则", body: [
        "规则是一小段代码：每一步拿到眼下看得到的东西，交出一个数（比如仓位、出价）。它只看得到过去，看不到未来。",
        "不会写代码也可以，有三条路：",
        { list: [
          "改现成的。找到\"规则\"那一块（手机上先点\"玩法与规则\"），点它下面的\"代码与说明\"，换到\"代码\"那一页，把里面的一两个数改掉，点\"应用修改\"：它就另存成了你自己的一条。",
          "让页面里的 AI 写。打开 " + A.AI + " 面板（电脑上是右上角的按钮，手机上是同名的那一页），用一句话说出想法；它会写出规则、给出参数，并解释为什么这样写。这条路要用你自己的 API 密钥。",
          "让你平常用的 AI 写。规则同场和世界工坊里，写规则的地方都有一个\"复制给 AI 的说明\"：点一下，贴给任何一个 AI，再把它回的代码贴回来。" ] } ],
        act: { label: "看看眼下这条规则的代码", go: function () { A.openCode("code"); } } },
      { id: "deca", short: "十项全能", title: "它是不是只在一种行情里好使", body: [
        "一条规则在一个世界里表现好，说明不了什么：也许它只是碰巧合了那个世界的脾气。十项全能让一条规则走遍十个世界，每个世界里都和\"买入持有\"（买了就不动）比长期增长率。十个差里最小的那一个，就是它的得分。",
        "所以得分高于 0 很不容易：它得在十种行情里都不比什么也不做差。",
        "每个星期一换一批路径。自己的规则可以贴到榜上；榜上的分数不是贴的人报的，而是每个看榜的人在自己的浏览器里重新算出来的。" ],
        act: { label: "走一遍十项", go: function () { A.openDeca(); } } },
      { id: "arena", short: "规则同场", title: "有对手的时候", body: [
        "前面的规则都是各打各的。规则同场把几条规则放进同一个市场互相当对手：一起竞价（出价最高的买走），或者一起做市（报价最好的成交）。你赚多少，取决于别人怎么出手。",
        "先点\"开始比\"，看自带的几条规则谁赢，谁中了\"赢家诅咒\"。再点\"写一条新的\"，改一改让价的大小，看能不能挤进前两名。" ],
        act: { label: "摆一场", go: function () { A.openArena(); } } },
      { id: "shop", short: "世界工坊", title: "连世界和裁判一起造", body: [
        "世界是一段生成价格的代码；玩法是一个发牌、判分的裁判。这两样也可以自己写。",
        "先看样板：打开\"涨跌停板\"，点\"试一试\"，看它生成的价格长什么样；再点\"拿到实验室里用\"，换几条规则，看谁在这个世界里好使。",
        "然后换到\"玩法\"那一边，打开\"掷骰子，见好就收\"，点\"比一比\"；再自己写一条规则，看能不能赢过\"攒到 20 分就收\"。（提示：平均下来赢不了，它是最优的；能做到的只是打平。）" ],
        act: { label: "进工坊", go: function () { A.openShop(); } } },
      { id: "share", short: "贴给别人", title: "把你做的东西贴给别人", body: [
        "这张页面没有自己的服务器。大家的榜、别人写的规则、世界和玩法，都是 GitHub 上公开的帖子（GitHub 管它叫 Issue）。",
        "贴东西：在要贴的地方点\"贴到 GitHub\"或者\"把我的成绩贴到榜上\"。页面会把内容填好、打开 GitHub，你在那里点 Create。这需要一个 GitHub 账号；帖子是公开的，署你的用户名；想撤回，把那条帖子关掉就行。",
        "用别人的东西：别人写的代码一律在隔离环境里运行，碰不到这张页面里的东西，也连不了网。觉得哪一份好，去它的帖子上点 👍，赞多的排在前面。",
        "只是看榜不需要账号。GitHub 对不登录的访问有次数限制（每小时 60 次），偶尔会让你过一会儿再刷新。" ],
        act: { label: "回到大厅", go: function () { A.openLobby(); } } }
    ];
  }
  var N = steps().length;
  try {
    var o0 = JSON.parse(localStorage.getItem(KEY) || "null");
    if (o0 && o0.v === 1) {
      if (o0.step >= 0 && o0.step < N) store.step = o0.step | 0;
      if (o0.went && typeof o0.went === "object") Object.keys(o0.went).slice(0, 20).forEach(function (k) { if (/^[a-z]{2,12}$/.test(k) && o0.went[k]) store.went[k] = true; });
      store.started = !!o0.started;
    }
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
  A.tourStore = function () { return store; };

  /* 左下角的小条：去做这一步的时候留着，点它回到教程 */
  function hideChip() { var el = document.getElementById("tourChip"); if (el) el.remove(); }
  function showChip() {
    hideChip();
    document.body.appendChild(h("div", { class: "tour-chip", id: "tourChip", role: "note" },
      h("button", { class: "btn small primary", type: "button", id: "tourBack", text: "回到教程（第 " + (store.step + 1) + " 步）", onclick: function () { hideChip(); A.openTour(); } }),
      h("button", { class: "iconbtn", type: "button", id: "tourChipX", "aria-label": "不用了", text: "✕", onclick: hideChip })));
  }

  /** 打开教程。at：从第几步开始（从 0 数），或者那一步的编号；不给就接着上次看到的地方 */
  A.openTour = function (at) {
    var S = steps(), i = store.step, k;
    if (typeof at === "number" && at >= 0 && at < N) i = at | 0;
    else if (typeof at === "string" && at) { for (k = 0; k < N; k++) if (S[k].id === at) i = k; }
    hideChip();
    var nav = h("div", { class: "tour-nav", id: "tourNav", role: "tablist", "aria-label": "教程的各步" }), pane = h("div", { class: "tour-pane", id: "tourPane" });
    var prev = h("button", { class: "btn", type: "button", id: "tourPrev", text: "上一步", onclick: function () { go(i - 1); } });
    var next = h("button", { class: "btn", type: "button", id: "tourNext", text: "下一步", onclick: function () { if (i < N - 1) go(i + 1); else m.close(); } });
    var m = A.modal("新手教程", [nav, pane], { cls: "tourm", foot: [h("span", { class: "note", id: "tourPos" }), h("span", { class: "sp" }), prev, next], focus: "#tourNext" });
    function go(j) { i = Math.max(0, Math.min(N - 1, j)); store.step = i; store.started = true; save(); draw(); pane.scrollTop = 0; var b = m.box.querySelector(".modal-b"); if (b) b.scrollTop = 0; }
    function draw() {
      var s = S[i];
      clear(nav);
      S.forEach(function (x, j) {
        nav.appendChild(h("button", { type: "button", class: "tour-pill" + (store.went[x.id] ? " went" : ""), role: "tab", "data-step": x.id, "aria-selected": j === i ? "true" : "false", title: store.went[x.id] ? "去过了" : null, onclick: function () { go(j); } },
          h("span", { class: "tour-no", text: String(j + 1) }), h("span", { text: x.short })));
      });
      clear(pane);
      pane.appendChild(h("h3", { class: "tour-title", id: "tourTitle", text: s.title }));
      s.body.forEach(function (b) {
        if (typeof b === "string") pane.appendChild(h("p", { text: b }));
        else if (b && b.list) pane.appendChild(h("ol", null, b.list.map(function (t) { return h("li", { text: t }); })));
      });
      if (s.act) pane.appendChild(h("div", { class: "row tight tour-act" }, h("button", { class: "btn primary", type: "button", id: "tourAct", text: s.act.label, onclick: function () {
        store.went[s.id] = true; save();
        var last = i === N - 1; m.close();
        if (!last) showChip();
        try { s.act.go(); } catch (e) { console.error(e); }
      } }), store.went[s.id] ? h("span", { class: "note", text: "这一步去过了" }) : null));
      document.getElementById("tourPos").textContent = "第 " + (i + 1) + " 步，共 " + N + " 步";
      prev.disabled = i === 0; next.textContent = i === N - 1 ? "看完了" : "下一步";
      next.className = "btn" + (s.act && !store.went[s.id] ? "" : " primary");
    }
    go(i);
    setTimeout(function () { var a = document.getElementById("tourAct"); if (a) a.focus(); }, 0);   // 一打开，焦点落在"带我去"的那个按钮上
    return m;
  };

  if (A.lobbyAdd) A.lobbyAdd({
    id: "tutorial", order: 1, wide: true, primary: true, route: "tutorial", kicker: "第一次来", title: "新手教程", label: function () { return store.started ? "接着看" : "开始"; }, keys: "tutorial 教程 新手 入门 上手 怎么玩 第一次 start guide",
    blurb: "八步，每步两三分钟：亲手打一局，开一个房间，写第一条规则，让它走十项全能、和别的规则同场，再到工坊里造一个世界。每一步都有一个按钮带你过去。",
    status: function () { return store.started ? "上次看到第 " + (store.step + 1) + " 步，共 " + N + " 步" : ""; },
    go: function (arg) { A.openTour(arg || undefined); }
  });
})(App);
