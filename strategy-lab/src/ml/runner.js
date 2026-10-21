// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 机器学习实验室 · 页面这一侧的运行器：拼线程的源码、开线程、收进度、超时了就掐掉。
 * 线程开在隔离环境里（src/sandbox.js）：AI 写的、别人分享的代码读不到这张页面的任何东西（存档、接入 AI 用的密钥），也发不出网络请求。
 * 线程源码 = 内核与模型库 + 自动求导库 + 统计 + 数据集 + 运行器（都是 install 函数的源码）+ 这一次的算法代码。 */
var QLMLRunner = (function () {
  "use strict";
  var EXTRA = ["QL_MLNN_INSTALL", "QL_MLSTATS_INSTALL", "QL_MLREG_INSTALL", "QL_MLDATA_TABULAR", "QL_MLDATA_TS", "QL_MLDATA_IMAGE", "QL_MLDATA_TOY", "QL_MLRUN_INSTALL"];
  // 算法代码里碰不到这些名字（在 src/jobs.js 的那一份之外，再遮住本页自己的几个）
  var SHADOW = QLJobs.SHADOW.replace(/;\s*$/, ", " + EXTRA.join(", ") + ", QLMLRunner, QLSandbox, QLJobs;");
  var RET = "\n;return { fit: typeof fit === \"function\" ? fit : null, predict: typeof predict === \"function\" ? predict : null, forecast: typeof forecast === \"function\" ? forecast : null, update: typeof update === \"function\" ? update : null, inspect: typeof inspect === \"function\" ? inspect : null };\n})();";
  var prefix = null;
  function lines(s) { var n = 0, i = -1; while ((i = s.indexOf("\n", i + 1)) >= 0) n++; return n; }
  function fn(name) { var f = typeof window !== "undefined" ? window[name] : (typeof self !== "undefined" ? self[name] : undefined); return typeof f === "function" ? f : null; }
  /** 内核部分只拼一次（几百 KB，内置的真实数据也在里面） */
  function base() {
    if (prefix) return prefix;
    var core = fn("QL_CORE"), ml = fn("QL_ML_INSTALL"), jobs = fn("QL_JOBS_INSTALL");
    if (!core || !jobs) throw new Error("页面缺少内核（QL_CORE / QL_JOBS_INSTALL）。");
    var s = (ml ? ml.toString() + "\n" : "") + "var QL = (" + core.toString() + ")(self);\n(" + jobs.toString() + ")(QL);\n";
    EXTRA.forEach(function (name) { var f = fn(name); if (f) s += "(" + f.toString() + ")(QL);\n"; });
    // 先冻住内置对象和各个库，再执行算法代码（算法的顶层语句在编进线程时就会执行）
    prefix = s + "QL.harden(); if (QL.mlrun) QL.mlrun.freezeLibs();\nvar __CODE = {};\n";
    return prefix;
  }
  /** 拼出线程源码；span 记下算法代码落在第几行（报错时换算回算法自己的行号） */
  function source(code) {
    var head = base(), pre = "__CODE.algo = (function () { \"use strict\"; " + SHADOW + "\n", from = lines(head + pre) + 1, body = String(code == null ? "" : code);
    return { src: head + pre + body + RET + "\nQL.jobMain(self, __CODE);\n", span: { from: from, to: from + lines(body) } };
  }
  /** 只做语法检查（不执行）。不许现造代码的环境里查不了，就当它没问题，留给线程去报 */
  function syntax(code) {
    try { new Function("\"use strict\";\n" + code + "\n"); return ""; }
    catch (e) { return e instanceof SyntaxError ? String(e.message || e) : ""; }
  }
  /** 跑一件任务。job: { kind: "ml-run" | "ml-data", data: {…发给线程的消息体}, code（算法代码；ml-data 可以不给）, mine（代码是不是自己的/内置的/自己的 AI 写的）,
   *  budgetMs（算法的时间预算）, onProgress(m) }。返回 { promise, cancel() }；失败时 reject { message, line, timeout, cancelled, nostart } */
  function run(job) {
    var built = source(job.code || ""), w = null, done = false, timer = 0, cancelFn = function () {}, budget = job.budgetMs || 20000;
    var idle = Math.max(20000, budget * 1.5 + 10000);       // 多久没有动静算卡死：fit 里不汇报进度也要给足时间
    var promise = new Promise(function (resolve, reject) {
      function finish(err, val) { if (done) return; done = true; clearTimeout(timer); try { if (w) w.terminate(); } catch (e) {} if (err) reject(err); else resolve(val); }
      function arm() { clearTimeout(timer); timer = setTimeout(function () { finish({ message: "超过 " + Math.round(idle / 1000) + " 秒没有动静，已经停掉：多半是代码里有死循环，或者训练没有在时间预算用完时停下（用 ctx.timeLeft() 判断）。", timeout: true }); }, idle); }
      function locate(ln) { return ln >= built.span.from && ln <= built.span.to ? ln - built.span.from + 1 : 0; }
      function wire(worker, plain) {
        w = worker;
        w.onmessage = function (ev) {
          var m = ev.data; if (done || !m || typeof m !== "object") return;
          if (m.type === "ready") { arm(); w.postMessage(Object.assign({ type: "job", kind: job.kind }, job.data || {})); }
          else if (m.type === "progress") { arm(); if (job.onProgress) { try { job.onProgress(m); } catch (e) { console.error(e); } } }
          else if (m.type === "done") finish(null, m.result);
          else if (m.type === "error") { var raw = String(m.message || "出错了"), mm = /\u0000L(\d+)$/.exec(raw); finish({ message: raw.replace(/\u0000L\d+$/, ""), line: mm ? locate(+mm[1]) : 0 }); }
        };
        w.onerror = function (ev) {
          if (ev.preventDefault) ev.preventDefault();
          if (ev.sandbox === "nostart" && !plain) {
            try { w.terminate(); } catch (e) {}
            if (job.mine) { try { wire(new Worker(URL.createObjectURL(new Blob([built.src], { type: "text/javascript" }))), true); arm(); return; } catch (e) {} }
            finish({ message: job.mine ? "这个环境不允许创建后台线程，算不了。" : "这个浏览器开不了隔离环境，所以不运行别人写的代码。换一个新一点的浏览器再试。", nostart: true });
            return;
          }
          var ln = locate(ev.lineno | 0), msg = String(ev.message || "脚本错误").replace(/^Uncaught\s+/, "");
          finish({ message: msg, line: ln, compile: true });
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
  return { run: run, source: source, syntax: syntax, SHADOW: SHADOW, _reset: function () { prefix = null; } };
})();
if (typeof module !== "undefined" && module.exports) module.exports = QLMLRunner;
