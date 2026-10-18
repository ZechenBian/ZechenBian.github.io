// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 应用主体（七）：大厅。和别人一起玩的几种办法都从这里进：每日一局、每日一题、实时房间、十项全能、规则同场、世界工坊，外加新手教程。
 * 各个功能在自己的文件里，用 A.lobbyAdd 把自己登记成大厅里的一张卡片；这里只管把卡片摆出来、认地址里的 #daily、#room=… 这类入口。
 * 页面没有自己的服务器：要给别人看的东西放在 GitHub 上（src/hub.js），实时房间走公共的中继（src/mq.js）。 */
(function (A) {
  "use strict";
  var h = A.h, $ = A.$;
  var cards = [], routes = {};
  /** 登记一张卡片：{ id, order, kicker, title, blurb, status(), go(arg), label（文字，或者返回文字的函数）, route, wide, primary }。route：地址里 #route 或 #route=参数 会直接打开它 */
  A.lobbyAdd = function (c) { cards.push(c); cards.sort(function (a, b) { return a.order - b.order; }); if (c.route) routes[c.route] = c; };
  A.lobbyCards = function () { return cards.slice(); };
  /** 能发给别人的地址：这张页面 + #入口 */
  A.lobbyLink = function (route, arg) { return location.href.replace(/#.*$/, "") + "#" + route + (arg ? "=" + encodeURIComponent(arg) : ""); };
  /** 去别的网站（GitHub）的按钮：做成真正的链接，浏览器不会当成弹窗拦下来 */
  A.outLink = function (label, url, primary, id) { return h("a", { class: "btn" + (primary ? " primary" : ""), href: url, target: "_blank", rel: "noopener", id: id || null, text: label }); };

  A.openLobby = function () {
    var grid = h("div", { class: "lb-grid" });
    cards.forEach(function (c) {
      var st = ""; try { st = c.status ? c.status() : ""; } catch (e) { st = ""; }
      grid.appendChild(h("section", { class: "lb-card" + (c.wide ? " wide" : ""), "data-card": c.id },
        c.kicker ? h("div", { class: "lb-kicker", text: c.kicker }) : null,
        h("h3", { text: c.title }),
        h("p", { class: "lb-blurb", text: c.blurb }),
        h("div", { class: "lb-foot" },
          h("button", { class: "btn" + (c.primary ? " primary" : ""), type: "button", "data-go": c.id, text: (typeof c.label === "function" ? c.label() : c.label) || "打开", onclick: function () { m.close(); c.go(); } }),
          st ? h("span", { class: "lb-status", text: st }) : null)));
    });
    var m = A.modal("大厅", [
      h("p", { class: "lb-lead", text: "和别人一起玩的几种办法。这张页面没有自己的服务器：要给别人看的东西，由你自己贴到 GitHub 上；实时房间走公共的中继。不联网的时候，自己玩的部分照样能用。" }),
      grid
    ], { cls: "lbm", focus: ".lb-card .btn" });
    return m;
  };

  /** 地址里的入口：#daily、#room=AB12CD …… */
  function route() {
    var m = /^#([a-z]+)(?:=(.*))?$/.exec(location.hash || ""); if (!m) return false;
    var c = m[1] === "lobby" ? { go: A.openLobby } : routes[m[1]]; if (!c) return false;
    var arg = ""; try { arg = m[2] ? decodeURIComponent(m[2]) : ""; } catch (e) {}
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}   // 入口只用一次：刷新页面不再弹出来
    setTimeout(function () { try { c.go(arg); } catch (e) { console.error(e); } }, 60);
    return true;
  }
  A.initLobby = function () {
    var b = $("btnLobby"); if (b) b.addEventListener("click", function () { A.openLobby(); });
    route();
    window.addEventListener("hashchange", route);
  };
  A.lobbyCommands = function () {
    var L = [{ kind: "操作", name: "打开大厅（每日一局、每日一题、实时房间、十项全能、规则同场、世界工坊）", key: "大厅 lobby 一起 多人 联机 社区 排行 榜", run: function () { A.openLobby(); } }];
    cards.forEach(function (c) { L.push({ kind: "大厅", name: c.title, key: c.title + " " + c.id + " " + (c.keys || ""), run: function () { c.go(); } }); });
    return L;
  };
})(App);
