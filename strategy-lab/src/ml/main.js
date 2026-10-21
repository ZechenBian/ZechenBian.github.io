// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 机器学习实验室 · 启动：接上顶栏和手机上的标签，画出左栏、摘要和中栏，生成第一份数据。
 * 第一次打开时自动跑一次默认的算法，让中栏一开始就有东西可看。 */
(function (A) {
  "use strict";
  var $ = A.$, S = A.S;
  A.setTab = function (t) {
    $("app").dataset.tab = t;
    Array.prototype.forEach.call($("tabs").children, function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
    setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 30);
  };
  function boot() {
    if (A.restoreCsv) A.restoreCsv();
    Array.prototype.forEach.call($("tabs").children, function (b) { b.addEventListener("click", function () { A.setTab(b.dataset.tab); if (b.dataset.tab === "ai") A.openAI(true); }); });
    $("btnGuide").addEventListener("click", function () { A.openGuide(); });
    $("btnAI").addEventListener("click", function () { A.openAI(); });
    var be = $("btnEngine");
    if (A.openEngine) be.addEventListener("click", function () { A.openEngine(); });
    else be.hidden = true;
    if (A.initAI) A.initAI();
    A.renderLeft(); A.renderSummary(); A.renderViews();
    A.dataChanged(true);
    if (A.initEngine) A.initEngine();
    // 第一次打开：数据预览出来以后跑一次默认的算法
    if (!S.flags.welcomed) {
      S.flags.welcomed = 1; A.persist();
      var once = false;
      A.on("preview", function () { if (once || A.busy() || A.last) return; once = true; A.run({ quiet: true }).catch(function () {}); });
    }
    window.addEventListener("beforeunload", function () { A.persist(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})(MLA);
