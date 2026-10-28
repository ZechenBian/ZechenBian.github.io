// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 框选提问 · 数据分析案例的适配层（只进 cases-ask/ 这一张页面；普通的 cases/ 不受影响）。
 * 告诉 src/ask/ask.js：哪些是可以提问的块、它们稳定的 id 怎么起、原来的块不见了批注放哪、怎么跳到某一步、给 AI 的上下文是什么。
 *
 * 块的 id = 所在的部分（"bike-3" 是共享单车案例的第 3 步，"bike-intro" 是开头，"bike-followups" 是追问）+ 块的种类和内容的哈希：
 *   图表按标题、数字卡片按卡片名、表格按表头起 id，所以换控件以后数字变了，批注还挂在原来那张图/表上（标"数字已变"）；
 *   文字段落按全文（公式取 TeX）起 id，文字里嵌着现算的数字时，数字变了就找不到原段落，批注移到那一步的末尾（标"原文已变"）。 */
(function () {
  "use strict";
  if (typeof QLAsk === "undefined" || typeof document === "undefined") return;
  /* 图表对象挂到它的元素上，框选时才找得到图上的数据（只在这张页面里这样做） */
  if (typeof QLChart !== "undefined" && QLChart.Chart && !QLChart.Chart.prototype.__askHost) {
    var set0 = QLChart.Chart.prototype.set;
    QLChart.Chart.prototype.set = function () { this.host.__qc = this; return set0.apply(this, arguments); };
    QLChart.Chart.prototype.__askHost = true;
  }
  function $(id) { return document.getElementById(id); }
  var SYS = [
    "你在给一个交互式学习页面写页边批注。页面是“数据分析案例”：用真实或模拟的数据，按八步框架（定义问题、数据从哪来、清洗与探索、先给 baseline、特征、模型、验证、局限与迭代）把一个数据分析问题从头做到尾；页面上的数字都是读者的浏览器按当前控件设置现算的。读者在学数据分析与建模，可能在准备量化研究或数据科学的面试。",
    "",
    "批注可以嵌套：读者可以选中或框住页面上的任何部分来问，也可以选中或框住之前某条回答里的一部分接着问。问的是之前回答里的一部分时，直接回答新问题，不要复述之前的回答；和之前的回答保持一致，除非它错了，错了就直说。",
    "",
    "怎么回答：",
    "- 先用一到三句话直接回答，再只补真正有帮助的：理由或简短的推导、一个小例子、或页面上对应的数字。",
    "- 篇幅看问题末尾的标记：[简短] 大约 200 字；[详细] 最多大约 600 字，把推导或例子写完整。",
    "- 准确。用页面上的数字，不要编造关于这些数据的新结论；依赖假设或属于判断的地方要说明。",
    "- 框住的区域给你的是框里的文字、公式（TeX）、表格行和图表上的数据点；以这些数为准，它们对应读者当前的控件设置。",
    "- 格式：Markdown 段落、短列表、**加粗**、`代码`；确实有帮助时可以用小表格；不要用标题。公式用 LaTeX：行内 $...$，单独成行用 $$...$$。",
    "- 用提问所用的语言回答。"
  ].join("\n");
  var BLOCKS = ".cs-md > p, .cs-md > ul, .cs-md > ol, .cs-md > table, .cs-md > pre, .cs-md > h2, .cs-md > h3, .cs-md > h4, .cs-md > .tex, .cs-chart, .cs-tablewrap, .cs-tiles, h3.cs-step-h, h2.cs-title";
  function caseIdOf(sid) { return String(sid || "").split("-")[0]; }
  function curCase() { var s = document.querySelector("#caseMain .cs-step[id]"); return s ? s.id.split("-")[0] : ""; }
  function caseById(id) { var all = typeof QLCaseApp !== "undefined" ? QLCaseApp.cases() : []; for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; return null; }
  function sidOf(b) { var sec = b.closest("section.cs-step"); return sec && sec.id ? sec.id : curCase() + "-intro"; }
  function texts(list) { return Array.prototype.map.call(list, function (x) { return x.textContent.trim(); }).join("|"); }
  function keyOf(b) {
    if (b.classList.contains("cs-chart")) return "chart:" + (b.getAttribute("data-chart") || "");
    if (b.classList.contains("cs-tiles")) return "tiles:" + texts(b.querySelectorAll(".cs-tile .k"));
    if (b.classList.contains("cs-tablewrap") || b.tagName === "TABLE") { var th = b.querySelectorAll("th"); return "table:" + (th.length ? texts(th) : QLAsk.srcText(b).slice(0, 200)); }
    if (b.tagName === "H2" || b.tagName === "H3") return "head:" + b.textContent.trim();
    return "text:" + QLAsk.srcText(b).slice(0, 600);
  }
  function markBlocks(root) {
    var seen = {};
    Array.prototype.forEach.call(root.querySelectorAll(BLOCKS), function (b) {
      if (b.closest(".ask-remark, .ask-composer")) return;
      var sid = sidOf(b), base = sid + "." + QLAsk.hash(keyOf(b)), k = base, n = 2;
      while (seen[k]) k = base + "-" + n++;
      seen[k] = 1;
      if (b.getAttribute("data-ask-bid") !== k) b.setAttribute("data-ask-bid", k);
      if (b.getAttribute("data-ask-sid") !== sid) b.setAttribute("data-ask-sid", sid);
      b.classList.add("ask-blk");
    });
  }
  function orphanHost(sid) {
    if (!sid || caseIdOf(sid) !== curCase()) return null;
    if (/-intro$/.test(sid)) { var strip = document.querySelector("#caseMain .cs-strip"); return strip ? { parent: strip.parentNode, before: strip } : null; }
    var sec = $(sid); if (!sec) return null;
    var body = sec.querySelector(":scope > .cs-step-b") || sec;
    if (body.hasAttribute("data-pending") || sec.querySelector(".cs-later:not([data-done])")) return null;
    return { parent: body, before: null };
  }
  function navigate(sid) {
    var c = caseIdOf(sid), m = /-(\d+)$/.exec(sid), target = m ? c + "-" + m[1] : c;
    if (location.hash !== "#" + target) location.hash = target;
    else { var el = $(sid); if (el) el.scrollIntoView({ block: "start" }); }
    if (!m) setTimeout(function () { var el = $(sid); if (el) el.scrollIntoView({ block: "start" }); }, 150);
  }
  function sectionTitle(sid) {
    if (/-intro$/.test(sid)) return "开头";
    var sec = $(sid), hd = sec && sec.querySelector(".cs-step-h");
    if (!hd) return sid;
    var n = hd.querySelector(".n"), k = hd.querySelector(".k"), t = hd.querySelector(".t");
    return (n ? "第 " + n.textContent + " 步 · " : "") + (k ? k.textContent : "") + (t ? "：" + t.textContent : "");
  }
  function pageTitle(sid) { var c = caseById(caseIdOf(sid)); return c ? c.title : "数据分析案例"; }
  function pageContext(sid) {
    var c = caseById(caseIdOf(sid)), lines = [];
    if (c) {
      lines.push("案例：" + c.title + "（" + (c.tag === "sim" ? "模拟数据" : "真实数据") + "）");
      if (c.interview) lines.push("对应的面试题：" + c.interview);
    }
    var heads = Array.prototype.map.call(document.querySelectorAll("#caseMain .cs-step[data-kind] > .cs-step-h"), function (hd) { return hd.textContent.replace(/\s+/g, " ").trim(); });
    if (heads.length) lines.push("这个案例的各步：" + heads.join("；"));
    var text = "";
    if (/-intro$/.test(sid)) Array.prototype.forEach.call(document.querySelectorAll("#caseMain > .cs-head, #caseMain > .cs-interview, #caseMain > .cs-md"), function (el) { text += QLAsk.srcText(el, { charts: true }) + "\n"; });
    else { var sec = $(sid); if (sec) text = QLAsk.srcText(sec, { charts: true }); }
    lines.push("", "这一部分（" + sectionTitle(sid) + "）的内容。[可展开] 是折叠起来的细节；[图表] 后面是图上的数据；“控件 … = …”是读者当前的设置：", '"""', QLAsk.clip(text, 12000), '"""');
    return lines.join("\n");
  }
  function banner() {
    var pane = $("paneMain"), main = $("caseMain"); if (!pane || !main) return null;
    var b = document.createElement("div"); b.className = "ask-banner ask-ui";
    b.innerHTML = '<p class="ask-banner-t"><b>样本 · 框选提问</b> 选中几个字，或者按住 Alt（Mac 上是 Option）拖一个框，框住文字、公式、表格或者图上的一段，就地提问；回答里还能接着选、接着框、接着问，一层套一层。也可以打开顶栏的“框选提问”（快捷键 B）。批注只存在这台电脑的浏览器里。 <a href="' + (window.claude ? "https://zechenbian.github.io/strategy-lab/cases/\" target=\"_blank\" rel=\"noopener" : "../cases/") + '">回到普通版</a></p>';
    pane.insertBefore(b, main);
    return b;
  }
  function boot() {
    QLAsk.init({
      root: function () { return $("caseMain"); },
      scope: function () { return $("paneMain"); },
      toolbar: function () { return document.querySelector("#app .top-actions"); },
      banner: banner, markBlocks: markBlocks, orphanHost: orphanHost, navigate: navigate,
      pageTitle: pageTitle, sectionTitle: sectionTitle, pageContext: pageContext, sys: SYS, storeKey: "ql.ask.cases.v1",
      blankSel: "#paneMain, .cs-article, .cs-step, .cs-step-b, .cs-later, .cs-head, .cs-md, .cs-tiles, .cs-note, .cs-interview, .cs-foot, .ask-banner, .ask-rbody, .ask-ans, .ask-remark"
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
