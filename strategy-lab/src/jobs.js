// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 策略实验室 · 一次性的计算任务（十项全能、规则同场、世界工坊的试玩台都走这里）
 * 一件任务 = 一个新开的后台线程：装上内核，把这次要用到的几段代码（规则、世界、裁判）编进去，算完就扔。
 * 只要任务里有别人写的代码，线程就开在隔离环境里（sandbox.js）；全是自己的代码而隔离环境又开不了时，退回普通的后台线程。
 *
 * 上半个文件（QL_JOBS_INSTALL）在线程里执行：
 *   · harden()  在别人的代码执行之前，把内置对象（Math、Array.prototype、Float64Array.prototype……）、随机数发生器和模型库冻住。
 *               不冻的话，一条规则可以改掉 Math.log，让之后的计分都算错。
 *   · jobMain() 一个线程只接一件任务，接了之后不再理会别的消息。
 *   别人的代码拿不到线程的全局对象（名字被遮住，eval 和 new Function 被内容安全策略禁掉），所以自己发不出"算完了"的假结果。
 * 这些办法防的是常见的捣乱。JavaScript 没法在同一个线程里做到滴水不漏：别人的规则和你的规则同场时，
 * 结果只当作娱乐，不要当作证明。数据安全不靠这些，靠的是隔离环境本身。
 * 下半个文件（QLJobs）在页面里执行：拼源码、开线程、等结果、超时了就掐掉。 */
function QL_JOBS_INSTALL(QL) {
"use strict";
QL.jobs = QL.jobs || {};
function deepFreeze(o, depth) {
  if (!o || (typeof o !== "object" && typeof o !== "function") || Object.isFrozen(o) || depth > 4) return;
  Object.freeze(o);
  Object.getOwnPropertyNames(o).forEach(function (k) { var d = Object.getOwnPropertyDescriptor(o, k); if (d && "value" in d) deepFreeze(d.value, depth + 1); });
}
/** 冻住内置对象。要在别人的代码执行之前调用（它们的顶层语句在编进线程时就会执行） */
QL.harden = function () {
  var TA = Object.getPrototypeOf(Float64Array), list = [Object, Object.prototype, Function.prototype, Array, Array.prototype, Math, JSON, Number, Number.prototype, String, String.prototype, Boolean, Boolean.prototype,
    Symbol, Symbol.prototype, Date, Date.prototype, RegExp, RegExp.prototype, Error, Error.prototype, TypeError.prototype, RangeError.prototype, Promise, Promise.prototype, Map, Map.prototype, Set, Set.prototype, WeakMap, WeakMap.prototype,
    ArrayBuffer, ArrayBuffer.prototype, DataView, DataView.prototype, Reflect, TA, TA.prototype, Object.getPrototypeOf([][Symbol.iterator]()), Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()))];
  [Float64Array, Float32Array, Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array].forEach(function (C) { list.push(C, C.prototype); });
  list.forEach(function (o) { try { Object.freeze(o); } catch (e) {} });
  try { Object.freeze(QL.RNG); Object.freeze(QL.RNG.prototype); deepFreeze(QL.ml, 0); } catch (e) {}
  QL.hardened = true;
};
/** 给规则看的参数：每条规则各拿各的一份，冻住（改不了，也传不到别的规则手里） */
QL.jobParams = function (p) { var o = {}; Object.keys(p || {}).forEach(function (k) { var v = p[k]; if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") o[k] = v; }); return Object.freeze(o); };
/** 线程的主循环：只接一件任务。CODE：{ 编号: { init, decide, fit, simulate, deal, show, referee } }，是编进线程的那几段代码 */
QL.jobMain = function (scope, CODE) {
  var post = scope.postMessage.bind(scope), used = false;
  scope.onmessage = function (ev) {
    var m = ev && ev.data;
    if (used || !m || m.type !== "job") return;
    used = true;
    try {
      var f = QL.jobs[m.kind]; if (typeof f !== "function") throw new Error("没有这种任务：" + m.kind);
      var out = f(m, CODE, function (p) { post(Object.assign({ type: "progress" }, p)); });
      post({ type: "done", result: out });
    } catch (e) { post({ type: "error", message: String(e && e.message || e) }); }
  };
  post({ type: "ready" });
};
}
var QLJobs = (function () {
  "use strict";
  // 编进线程的代码里碰不到这些名字。比 engine-client.js 的那一份多：别人的代码连"给自己发消息""再开一个线程"的门也不留
  var SHADOW = "var self, globalThis, postMessage, onmessage, onerror, onmessageerror, addEventListener, removeEventListener, dispatchEvent, importScripts, fetch, XMLHttpRequest, WebSocket, EventSource, WebTransport, BroadcastChannel, MessageChannel, MessageEvent, Worker, SharedWorker, URL, Blob, FileReader, close, navigator, location, indexedDB, caches, crypto, setTimeout, setInterval, queueMicrotask, requestAnimationFrame, reportError, structuredClone, QL, __CODE, QL_CORE, QL_ML_INSTALL, QL_GAMES_INSTALL, QL_OBS_INSTALL, QL_LIVE_INSTALL, QL_JOBS_INSTALL, QL_DECA_INSTALL, QL_ARENA_INSTALL, QL_SHOP_INSTALL, QL_QUEST_INSTALL;";
  var RET = "\n;return { init: typeof init === \"function\" ? init : null, decide: typeof decide === \"function\" ? decide : null, fit: typeof fit === \"function\" ? fit : null, simulate: typeof simulate === \"function\" ? simulate : null, deal: typeof deal === \"function\" ? deal : null, show: typeof show === \"function\" ? show : null, referee: typeof referee === \"function\" ? referee : null };\n})();";
  function lines(s) { var n = 0, i = -1; while ((i = s.indexOf("\n", i + 1)) >= 0) n++; return n; }
  function fns() {
    var base = [typeof QL_ML_INSTALL === "function" ? QL_ML_INSTALL : null, typeof QL_GAMES_INSTALL === "function" ? QL_GAMES_INSTALL : null, typeof QL_OBS_INSTALL === "function" ? QL_OBS_INSTALL : null, typeof QL_LIVE_INSTALL === "function" ? QL_LIVE_INSTALL : null].filter(Boolean).map(function (f) { return f.toString(); }).join("\n");
    var extra = [QL_JOBS_INSTALL, typeof QL_DECA_INSTALL === "function" ? QL_DECA_INSTALL : null, typeof QL_ARENA_INSTALL === "function" ? QL_ARENA_INSTALL : null, typeof QL_SHOP_INSTALL === "function" ? QL_SHOP_INSTALL : null, typeof QL_QUEST_INSTALL === "function" ? QL_QUEST_INSTALL : null].filter(Boolean).map(function (f) { return "(" + f.toString() + ")(QL);"; }).join("\n");
    return base + "\nvar QL = (" + QL_CORE.toString() + ")(self);\n" + extra + "\nQL.harden();\nvar __CODE = {};\n";
  }
  /** 拼出线程的源码。codes: [{ id, code }]；返回 { src, spans: [{ id, from, to }] }（每段代码落在源码的哪几行，报错时用） */
  function source(codes) {
    var src = fns(), spans = [];
    (codes || []).forEach(function (c) {
      var pre = "__CODE[" + JSON.stringify(String(c.id)) + "] = (function () { \"use strict\"; " + SHADOW + "\n", from = lines(src + pre) + 1, body = String(c.code == null ? "" : c.code);
      src += pre + body + RET + "\n";
      spans.push({ id: String(c.id), from: from, to: from + lines(body) });
    });
    return { src: src + "QL.jobMain(self, __CODE);\n", spans: spans };
  }
  /** 一段代码能不能通过语法检查（只解析，不执行）。不许现造代码的环境里查不了，就当它没问题，留给线程去报 */
  function syntax(code) {
    try { new Function("\"use strict\";\n" + code + "\n"); return ""; }
    catch (e) { return e instanceof SyntaxError ? String(e.message || e) : ""; }
  }
  /** 跑一件任务。job: { kind, codes: [{ id, code, mine }], data: {…任务自己的参数}, timeout（多久没动静算卡死，毫秒）, onProgress }
   *  返回 { promise, cancel() }。promise 兑现为任务的结果；失败时是 { message, id（哪段代码出的事，知道的话）, line, timeout, nostart } */
  function run(job) {
    var built = source(job.codes), allMine = (job.codes || []).every(function (c) { return !!c.mine; }), w = null, done = false, timer = 0, last = null, cancelFn = function () {};
    var promise = new Promise(function (resolve, reject) {
      var limit = job.timeout || 30000;
      function finish(err, val) { if (done) return; done = true; clearTimeout(timer); try { if (w) w.terminate(); } catch (e) {} if (err) reject(err); else resolve(val); }
      function arm() { clearTimeout(timer); timer = setTimeout(function () { finish({ message: "这件任务超过 " + Math.round(limit / 1000) + " 秒没有动静，已经停掉：多半是哪一段代码里有死循环。", timeout: true, id: last && last.id != null ? String(last.id) : "" }); }, limit); }
      function locate(ln) { for (var i = 0; i < built.spans.length; i++) if (ln >= built.spans[i].from && ln <= built.spans[i].to) return { id: built.spans[i].id, line: ln - built.spans[i].from + 1 }; return null; }
      function wire(worker, plain) {
        w = worker;
        w.onmessage = function (ev) {
          var m = ev.data; if (done || !m || typeof m !== "object") return;
          if (m.type === "ready") { arm(); w.postMessage(Object.assign({ type: "job", kind: job.kind }, job.data || {})); }
          else if (m.type === "progress") { arm(); last = m; if (job.onProgress) { try { job.onProgress(m); } catch (e) {} } }
          else if (m.type === "done") finish(null, m.result);
          else if (m.type === "error") finish({ message: String(m.message || "出错了"), id: last && last.id != null ? String(last.id) : "" });
        };
        w.onerror = function (ev) {
          if (ev.preventDefault) ev.preventDefault();
          if (ev.sandbox === "nostart" && !plain) {                       // 隔离环境没开起来
            try { w.terminate(); } catch (e) {}
            if (allMine) { try { wire(new Worker(URL.createObjectURL(new Blob([built.src], { type: "text/javascript" }))), true); arm(); return; } catch (e) {} }
            finish({ message: allMine ? "这个环境不允许创建后台线程，这件事做不了。" : "这个浏览器开不了隔离环境，所以不运行别人写的代码。换一个新一点的浏览器再试。", nostart: true });
            return;
          }
          var at = locate(ev.lineno | 0), msg = String(ev.message || "脚本错误").replace(/^Uncaught\s+/, "");
          finish({ message: msg, id: at ? at.id : "", line: at ? at.line : 0, compile: true });
        };
      }
      cancelFn = function () { finish({ cancelled: true, message: "已取消" }); };
      arm();
      try { wire(QLSandbox.spawn(built.src), false); }
      catch (e) { finish({ message: String(e && e.message || e), nostart: true }); }
    });
    promise.catch(function () {});
    return { promise: promise, cancel: function () { cancelFn(); } };
  }
  return { run: run, source: source, syntax: syntax, SHADOW: SHADOW };
})();
if (typeof module !== "undefined" && module.exports) { module.exports = QL_JOBS_INSTALL; module.exports.QLJobs = QLJobs; }
