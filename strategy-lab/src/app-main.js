// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 启动 */
(function (A) {
  "use strict";
  var S = A.state, $ = A.$;
  // 自带的示例数据（旧行情，只为演示"真实数据"流程）
  try {
    JSON.parse(document.getElementById("ql-samples").textContent).forEach(function (o) {
      var t = [o.d0 * 864e5]; o.dd.forEach(function (d) { t.push(t[t.length - 1] + d * 864e5); });
      A.datasets.push({ id: o.id, name: o.name, K: o.K, v: Float64Array.from(o.v), t: t, src: "sample", mode: "price" });
    });
  } catch (e) { console.error("示例数据载入失败", e); }
  A.restore();
  if (!A.dataset(S.world.dsId)) S.world.dsId = A.datasets[0] && A.datasets[0].id;
  A.initChrome(); A.renderWorld(); A.renderStrat(); A.renderSettings(); A.renderWorldHead(); A.renderSummary();
  A.initCharts(); A.initClaude(); if (A.initGuide) A.initGuide();
  A.on("run", function () { A.renderSummary(); });
  A.on("error", function () { A.renderSummary(); });
  A.on("world", function () { A.renderWorldHead(); });
  if (window.innerWidth >= 1240 && window.claude && typeof window.claude.use === "function") A.openClaude(true);   // 独立的网页里没有 Claude：右栏不自动展开
  A.requestRun("commit");
  // 离开页面：立刻存一次。平时的保存晚 400 毫秒才落盘，最后那一下改动（刚点的"知道了"、刚钉的对比）不能丢
  window.addEventListener("pagehide", function () { try { A.persistNow(); } catch (e) {} });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") { try { A.persistNow(); } catch (e) {} } });
})(App);
