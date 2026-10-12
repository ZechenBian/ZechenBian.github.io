// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 应用主体（十）：把自己的东西交出去、把别人的东西拿进来。十项全能、规则同场、世界工坊共用。
 * 交出去：页面不替人发帖。这里把要交的内容摆给人看，再给一条去 GitHub"新建 Issue"的链接（见 hub.js）。
 * 拿进来：别人交的东西先过一遍筛子（名字、说明、参数表都只留认得的字段，长度有上限，数字必须是有限的），
 *         放进"我的策略"时带着 foreign 标记：凡是带这个标记的代码，一律在隔离环境里运行（sandbox.js）。
 * 别人写的名字和说明只当纯文字显示。 */
(function (A) {
  "use strict";
  var h = A.h, QL = A.QL, S = A.state;
  function str(x, n) { return typeof x === "string" ? x.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, n) : ""; }
  A.cleanText = str;
  /** 别人交来的参数表：只留认得的字段 */
  A.cleanSchema = function (L) {
    if (!Array.isArray(L)) return [];
    var out = [], seen = {};
    L.slice(0, 16).forEach(function (q) {
      if (!q || typeof q.key !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,23}$/.test(q.key) || seen[q.key]) return;
      var label = str(q.label, 40) || q.key;
      if (q.type === "bool") { seen[q.key] = 1; out.push({ key: q.key, label: label, def: !!q.def, type: "bool" }); return; }
      if (q.type === "select") {
        var ops = Array.isArray(q.options) ? q.options.slice(0, 12).filter(function (o) { return Array.isArray(o) && typeof o[0] === "string" && o[0].length <= 24; }).map(function (o) { return [o[0], str(o[1], 40) || o[0]]; }) : [];
        if (!ops.length) return;
        seen[q.key] = 1; out.push({ key: q.key, label: label, def: ops.some(function (o) { return o[0] === q.def; }) ? q.def : ops[0][0], options: ops, type: "select" }); return;
      }
      var def = +q.def, min = +q.min, max = +q.max, step = +q.step;
      if (![def, min, max, step].every(isFinite) || !(max > min) || !(step > 0)) return;
      seen[q.key] = 1; out.push({ key: q.key, label: label, def: Math.min(max, Math.max(min, def)), min: min, max: max, step: step, type: "num" });
    });
    return out;
  };
  /** 按参数表把一组参数值收拾干净：缺的补默认值，超出范围的收回来 */
  A.cleanParams = function (schema, p) {
    var o = {};
    schema.forEach(function (q) {
      var v = p ? p[q.key] : undefined;
      if (q.type === "bool") o[q.key] = v == null ? q.def : !!v;
      else if (q.type === "select") o[q.key] = q.options.some(function (x) { return x[0] === v; }) ? v : q.def;
      else { v = typeof v === "number" ? v : NaN; o[q.key] = isFinite(v) ? Math.min(q.max, Math.max(q.min, v)) : q.def; }
    });
    return o;
  };
  /** 一条规则写成要交上去的样子：{ meta, code } */
  A.rulePack = function (st, p, kind, extra) {
    var schema = (st.params || []).map(function (q) { var o = { key: q.key, label: q.label, def: q.def, type: q.type || "num" }; if (o.type === "num") { o.min = q.min; o.max = q.max; o.step = q.step; } if (q.options) o.options = q.options.map(function (x) { return [x[0], x[1]]; }); return o; });
    return { meta: Object.assign({ kind: kind, name: st.name, summary: st.summary || "", params: schema, p: Object.assign({}, p), game: st.game || "" }, extra || {}), code: st.code };
  };
  /** 榜上的一条 → { st（可以放进"我的策略"的规则）, p（它交上来时用的参数）, item }；不合规矩的返回 null */
  A.ruleFromItem = function (it) {
    var m = it && it.meta, code = it && it.code;
    if (!m || typeof code !== "string" || !code.trim() || code.length > 20000) return null;
    var schema = A.cleanSchema(m.params), game = typeof m.game === "string" && QL.WORLDS[m.game] && QL.WORLDS[m.game].game ? m.game : "";
    var st = { id: "hub-" + it.n, name: str(m.name, 40) || "没有名字的规则", group: "我的策略", summary: str(m.summary, 200), params: schema, code: code, src: "hub", foreign: true, from: { user: it.user, n: it.n, url: it.url } };
    if (game) st.game = game;
    return { st: st, p: A.cleanParams(schema, m.p), item: it };
  };
  /** 把榜上的一条规则载入"我的策略"并选用它 */
  A.adoptRule = function (r) {
    A.saveMy(r.st); S.sparams[r.st.id] = Object.assign({}, r.p);
    if (r.st.game) { if (S.world.type !== r.st.game) A.setGame(r.st.game); } else if (A.isGame() && A.wdef().act !== "position") A.setGame("trade");
    A.setStrat(r.st.id);
    A.toast("已载入到\"我的策略\"：" + r.st.name + "。别人写的代码在隔离环境里运行。", 4200);
  };
  /** 一组参数写成一行："f = 1，n = 20"；没有参数时是空字符串 */
  A.paramLine = function (schema, p) { return (schema || []).map(function (q) { var v = p[q.key]; return q.key + " = " + (typeof v === "number" ? +v.toFixed(6) : String(v)); }).join("，"); };

  /** 把一份东西交到 GitHub。o: { kind, title, meta, code }。先给人看要交的是什么，再给去 GitHub 的链接 */
  A.postDialog = function (o) {
    var body; try { body = QLHub.pack(o.meta, o.code); } catch (e) { A.toast(e.message || String(e), 4200); return null; }
    var u = QLHub.newUrl(o.kind, o.title, body), long = !!u.clip;
    var steps = long
      ? "内容比较长，放不进地址里，所以分两步：先点\"复制内容\"，再点\"去 GitHub 提交\"；在打开的页面里把正文整段换成刚复制的内容，然后点 Submit new issue。"
      : "点\"去 GitHub 提交\"会打开 GitHub 的新建 Issue 页面，内容已经填好；在那里点 Submit new issue 就交上去了。";
    var copy = h("button", { class: "btn" + (long ? " primary" : ""), type: "button", id: "pdCopy", text: "复制内容", onclick: function () { A.copy(body); } });
    var go = A.outLink("去 GitHub 提交", u.url, !long, "pdGo");
    return A.modal("交到 GitHub", [
      h("p", { class: "lb-lead", id: "pdSteps", text: steps }),
      h("pre", { class: "code pd-body", id: "pdBody", text: body }),
      h("p", { class: "note", text: "需要一个 GitHub 账号。交上去的东西是公开的，署的是你的 GitHub 用户名；别人可以载入、运行和修改它。想撤下来，把那条 Issue 关掉就行。" })
    ], { cls: "pdm", foot: [copy, go] });
  };
})(App);
