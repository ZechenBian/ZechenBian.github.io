// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 策略实验室 · 隔离环境：别人写的代码在这里面跑
 * 自己写的、AI 替你写的代码，出的错是无心之失，后台线程里遮住几个名字（engine-client.js 的 SHADOW）就够了。
 * 别人上传的代码不能这样假设。它在一个"沙箱页"里的后台线程中运行：
 *   · 沙箱页是一个 sandbox="allow-scripts" 的 iframe，没有 allow-same-origin：它的来源是一个独一无二的空来源，
 *     读不到这张页面的任何东西（存档、接入 AI 用的密钥、Cookie、IndexedDB），也碰不到这张页面的 DOM。
 *   · 沙箱页自带一条内容安全策略：default-src 'none'。里面的线程发不出任何网络请求（fetch、XHR、WebSocket、importScripts 都不行），
 *     也不能用 eval / new Function 现造代码。
 *   · 沙箱页自己只有下面这十几行转发用的代码；别人的代码只在它开的线程里，和这张页面之间只隔着 postMessage 传数。
 * 卡死了怎么办：外面的人（jobs.js、engine-client.js）到时间没等到结果，就把整个沙箱页拿掉，里面的线程跟着没了。
 * 用法和 Worker 一样：var w = QLSandbox.spawn(源码); w.onmessage = …; w.onerror = …; w.postMessage(…); w.terminate(); */
var QLSandbox = (function () {
  "use strict";
  var CSP = "default-src 'none'; script-src 'unsafe-inline'; worker-src blob:";
  /* 沙箱页里的全部代码。它被写成一个函数只是为了好读：真正用的是它的源码文本 */
  function boot() {
    var w = null;
    function up(m) { parent.postMessage(m, "*"); }
    addEventListener("message", function (e) {
      if (e.source !== parent) return;
      var m = e.data; if (!m || typeof m !== "object") return;
      if (m.__sb === "start" && !w) {
        try { w = new Worker(URL.createObjectURL(new Blob([m.src], { type: "text/javascript" }))); }
        catch (err) { up({ __sb: "fail", message: String(err && err.message || err) }); return; }
        w.onmessage = function (ev) { up({ __sb: "msg", data: ev.data }); };
        w.onerror = function (ev) { if (ev.preventDefault) ev.preventDefault(); up({ __sb: "error", message: String(ev.message || ""), lineno: ev.lineno || 0 }); };
        up({ __sb: "started" });
      } else if (m.__sb === "post" && w) w.postMessage(m.data);
    });
    up({ __sb: "boot" });
  }
  var DOC = "<!doctype html><meta charset=\"utf-8\"><meta http-equiv=\"Content-Security-Policy\" content=\"" + CSP + "\"><script>(" + boot.toString() + ")();<\/script>";

  /** 开一个沙箱页，在里面用 src 起一个后台线程。opt.bootMs：多久没起来算失败（默认 6 秒） */
  function spawn(src, opt) {
    opt = opt || {};
    var frame = document.createElement("iframe"), api = { onmessage: null, onerror: null, dead: false, sandboxed: true }, queue = [], started = false, timer = 0;
    function fail(msg, lineno, kind) { if (api.onerror) api.onerror({ message: msg, lineno: lineno || 0, sandbox: kind || "", preventDefault: function () {} }); }
    function onMsg(e) {
      if (api.dead || e.source !== frame.contentWindow) return;
      var m = e.data; if (!m || typeof m !== "object") return;
      if (m.__sb === "boot") frame.contentWindow.postMessage({ __sb: "start", src: src }, "*");
      else if (m.__sb === "started") { started = true; clearTimeout(timer); queue.splice(0).forEach(function (d) { frame.contentWindow.postMessage({ __sb: "post", data: d }, "*"); }); }
      else if (m.__sb === "msg") { if (api.onmessage) api.onmessage({ data: m.data }); }
      else if (m.__sb === "error") fail(String(m.message || ""), m.lineno | 0, "");
      else if (m.__sb === "fail") { clearTimeout(timer); fail(String(m.message || ""), 0, "nostart"); }
    }
    frame.setAttribute("sandbox", "allow-scripts"); frame.setAttribute("aria-hidden", "true"); frame.setAttribute("tabindex", "-1"); frame.setAttribute("title", "sandbox");
    frame.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden;pointer-events:none";
    frame.srcdoc = DOC;
    window.addEventListener("message", onMsg);
    try { document.body.appendChild(frame); } catch (e) { setTimeout(function () { fail(String(e && e.message || e), 0, "nostart"); }, 0); }
    timer = setTimeout(function () { if (!started && !api.dead) fail("timeout", 0, "nostart"); }, opt.bootMs || 6000);
    api.postMessage = function (d) { if (api.dead) return; if (started) frame.contentWindow.postMessage({ __sb: "post", data: d }, "*"); else queue.push(d); };
    api.terminate = function () { if (api.dead) return; api.dead = true; clearTimeout(timer); window.removeEventListener("message", onMsg); try { frame.remove(); } catch (e) {} };
    return api;
  }
  return { spawn: spawn, CSP: CSP };
})();
