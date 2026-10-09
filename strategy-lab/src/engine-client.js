// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 主线程这一侧：把内核源码和策略代码拼成一个后台线程，并把消息包装成 Promise。
 * 策略代码不经过 eval：它直接成为 Worker 脚本的一部分。 */
var QLEngine = (function () {
  "use strict";
  // 策略代码里碰不到这些名字（后台线程本来也没有 DOM 和网络）
  var SHADOW = "var self, globalThis, postMessage, onmessage, importScripts, fetch, XMLHttpRequest, WebSocket, close, navigator, indexedDB, caches, setTimeout, setInterval, QL_CORE, QL_ML_INSTALL, QL_GAMES_INSTALL, QL_OBS_INSTALL, QL_LIVE_INSTALL;";
  var seq = 0;
  function lines(s) { var n = 0, i = -1; while ((i = s.indexOf("\n", i + 1)) >= 0) n++; return n; }

  function buildSource(stratCode, worldCode) {
    var head = (typeof QL_ML_INSTALL === "function" ? QL_ML_INSTALL.toString() + "\n" : "") + (typeof QL_GAMES_INSTALL === "function" ? QL_GAMES_INSTALL.toString() + "\n" : "") + (typeof QL_OBS_INSTALL === "function" ? QL_OBS_INSTALL.toString() + "\n" : "") + (typeof QL_LIVE_INSTALL === "function" ? QL_LIVE_INSTALL.toString() + "\n" : "") + "var QL = (" + QL_CORE.toString() + ")(self);\n";
    var wPre = "var __W = (function () { \"use strict\"; " + SHADOW + "\n";
    var wPost = "\n;return { simulate: typeof simulate === \"function\" ? simulate : null };\n})();\n";
    var sPre = "var __S = (function () { \"use strict\"; " + SHADOW + "\n";
    var sPost = "\n;return { init: typeof init === \"function\" ? init : null, decide: typeof decide === \"function\" ? decide : null, fit: typeof fit === \"function\" ? fit : null };\n})();\n";
    var tail = "if (!__S.decide) throw new Error(\"__NO_DECIDE__\");\nQL.workerMain(self, __S, __W);\n";
    var w = worldCode || "";
    var src = head + wPre + w + wPost + sPre + stratCode + sPost + tail;
    var worldStart = lines(head + wPre) + 1, stratStart = lines(head + wPre + w + wPost + sPre) + 1;
    return { src: src, worldStart: worldStart, worldLines: lines(w) + 1, stratStart: stratStart, stratLines: lines(stratCode) + 1 };
  }

  function Engine(stratCode, worldCode, hooks) {
    var self = this;
    this.id = ++seq; this.dead = false; this.pending = {}; this.nextId = 1; this.hooks = hooks || {};
    this.info = null;
    var built = this.built = buildSource(stratCode, worldCode);
    this.ready = new Promise(function (resolve, reject) { self._ready = resolve; self._fail = reject; });
    this.ready.catch(function () {});
    try {
      this.url = URL.createObjectURL(new Blob([built.src], { type: "text/javascript" }));
      this.worker = new Worker(this.url);
    } catch (e) {
      this.dead = true; this._fail({ message: "这个环境不允许创建后台线程，无法运行回测（" + (e && e.message || e) + "）", fatal: true });
      return;
    }
    this.worker.onmessage = function (ev) { self.onMsg(ev.data); };
    this.worker.onerror = function (ev) {
      // 脚本加载阶段的错误：多半是策略代码的语法错误
      var ln = ev.lineno || 0, where = "", line = 0;
      if (ln >= built.stratStart && ln < built.stratStart + built.stratLines) { where = "策略代码"; line = ln - built.stratStart + 1; }
      else if (ln >= built.worldStart && ln < built.worldStart + built.worldLines) { where = "世界代码"; line = ln - built.worldStart + 1; }
      var msg = String(ev.message || "脚本错误").replace(/^Uncaught\s+/, "");
      if (/__NO_DECIDE__/.test(msg)) { msg = "代码里没有定义 decide(s, p, st) 函数"; where = "策略代码"; line = 0; }
      if (ev.preventDefault) ev.preventDefault();
      var err = { message: (where ? where + (line ? "第 " + line + " 行：" : "：") : "") + msg, where: where, line: line, compile: true };
      self.kill(err); self._fail(err);
    };
    this.startTimer = setTimeout(function () { if (!self.info) { var e = { message: "后台线程没有启动（10 秒无响应）", fatal: true }; self.kill(e); self._fail(e); } }, 10000);
  }
  Engine.prototype.onMsg = function (m) {
    if (!m || typeof m !== "object") return;
    if (m.type === "ready") { clearTimeout(this.startTimer); this.info = { hasFit: !!m.hasFit, hasInit: !!m.hasInit }; this._ready(this.info); return; }
    if (m.type === "fitted") { if (this.hooks.onFit) this.hooks.onFit(m.ms, m.fit); return; }
    var p = this.pending[m.id]; if (!p) return;
    if (m.type === "progress") { this.arm(p); if (p.onProgress) p.onProgress(m.done, m.total); return; }
    clearTimeout(p.timer); delete this.pending[m.id];
    if (m.type === "error") p.reject({ message: this.locate(m.stack) + m.message, runtime: true });
    else if (m.type === "cancelled") p.reject({ cancelled: true, message: "已取消" });
    else p.resolve(m);
  };
  /** 从调用栈里找出错误落在策略代码的第几行 */
  Engine.prototype.locate = function (stack) {
    var b = this.built, re = /:(\d+):\d+\)?\s*$/gm, m;
    while ((m = re.exec(String(stack || "")))) {
      var ln = +m[1];
      if (ln >= b.stratStart && ln < b.stratStart + b.stratLines) return "策略代码第 " + (ln - b.stratStart + 1) + " 行：";
      if (ln >= b.worldStart && ln < b.worldStart + b.worldLines) return "世界代码第 " + (ln - b.worldStart + 1) + " 行：";
    }
    return "";
  };
  Engine.prototype.arm = function (p) {
    var self = this; clearTimeout(p.timer);
    p.timer = setTimeout(function () { self.kill({ message: "运行超过 " + Math.round(p.timeout / 1000) + " 秒被中止：代码里可能有死循环，或者这一步的计算量太大", timeout: true }); }, p.timeout);
  };
  /** 发送一条消息，返回结果的 Promise。opt: {timeout, onProgress} */
  Engine.prototype.send = function (type, payload, opt) {
    var self = this; opt = opt || {};
    if (this.dead) return Promise.reject({ message: "后台线程已停止", dead: true });
    var id = this.nextId++, msg = Object.assign({ type: type, id: id }, payload || {});
    var pr = new Promise(function (resolve, reject) {
      var p = { resolve: resolve, reject: reject, timeout: opt.timeout || 15000, onProgress: opt.onProgress, timer: 0 };
      self.pending[id] = p; self.arm(p);
    });
    pr.id = id;
    this.ready.then(function () { if (!self.dead) self.worker.postMessage(msg); }, function () {});
    return pr;
  };
  Engine.prototype.cancel = function (id) { if (!this.dead && this.worker) this.worker.postMessage({ type: "cancel", id: id }); };
  Engine.prototype.kill = function (err) {
    if (this.dead) return; this.dead = true; clearTimeout(this.startTimer);
    try { this.worker.terminate(); } catch (e) {}
    try { URL.revokeObjectURL(this.url); } catch (e) {}
    var ps = this.pending; this.pending = {};
    Object.keys(ps).forEach(function (k) { clearTimeout(ps[k].timer); ps[k].reject(err || { message: "已停止", dead: true }); });
    if (err && this.hooks.onDeath) this.hooks.onDeath(err);
  };
  Engine.prototype.dispose = function () { this.kill(null); };

  /* ---------- 现算用的线程池 ----------
   * 对照表和手册里引用的数字是在这台电脑上现算的。池里的每个线程都装着全部内置规则，一条消息算一件事（见 live.js 的 LV.main）。 */
  function installs() {
    return [typeof QL_ML_INSTALL === "function" ? QL_ML_INSTALL : null, typeof QL_GAMES_INSTALL === "function" ? QL_GAMES_INSTALL : null, typeof QL_OBS_INSTALL === "function" ? QL_OBS_INSTALL : null, typeof QL_LIVE_INSTALL === "function" ? QL_LIVE_INSTALL : null]
      .filter(Boolean).map(function (f) { return f.toString(); }).join("\n") + "\n";
  }
  /** strats：全部内置规则。玩法自带的规则用裁判手里的那一份函数，价格世界的规则把代码编进线程里 */
  function poolSource(strats) {
    var parts = ["var __CODE = {};"], meta = [];
    strats.forEach(function (st) {
      meta.push({ id: st.id, lib: st.lib || "", game: st.game || "", params: (st.params || []).map(function (q) { return { key: q.key, def: q.def, min: q.min, max: q.max }; }) });
      if (!st.lib) parts.push("__CODE[" + JSON.stringify(st.id) + "] = (function () { \"use strict\"; " + SHADOW + "\n" + st.code + "\n;return { init: typeof init === \"function\" ? init : null, decide: typeof decide === \"function\" ? decide : null, fit: typeof fit === \"function\" ? fit : null };\n})();");
    });
    return installs() + "var QL = (" + QL_CORE.toString() + ")(self);\n" + parts.join("\n") + "\nvar __META = " + JSON.stringify(meta) + ";\nQL.live.main(self, __CODE, __META);\n";
  }
  function Pool(src, size) {
    this.src = src; this.size = Math.max(1, size | 0); this.ws = []; this.queue = []; this.nextId = 1; this.dead = false; this.url = null; this.idleT = 0; this.broken = null;
  }
  Pool.prototype.spawn = function () {
    var self = this, w;
    if (!this.url) this.url = URL.createObjectURL(new Blob([this.src], { type: "text/javascript" }));
    try { w = new Worker(this.url); } catch (e) { this.broken = { message: "这个环境不允许创建后台线程（" + (e && e.message || e) + "）" }; return null; }
    var slot = { w: w, job: null, ready: false };
    w.onmessage = function (ev) {
      var m = ev.data || {}, job = slot.job;
      if (m.type === "ready") { slot.ready = true; self.pump(); return; }
      if (!job || m.id !== job.id) return;
      if (m.type === "done") { slot.job = null; job.resolve(m); self.pump(); }
      else if (m.type === "error") { slot.job = null; job.reject({ message: m.message }); self.pump(); }
      else if (job.onPart) { try { job.onPart(m); } catch (e) { console.error(e); } }
    };
    w.onerror = function (ev) {
      if (ev.preventDefault) ev.preventDefault();
      var job = slot.job, i = self.ws.indexOf(slot); if (i >= 0) self.ws.splice(i, 1);
      try { w.terminate(); } catch (e) {}
      if (!slot.ready) self.broken = { message: "后台线程没能启动：" + String(ev.message || "脚本错误") };      // 脚本本身就有问题：再开一个也一样，不再重试
      if (job) job.reject({ message: String(ev.message || "后台线程出错") });
      self.pump();
    };
    this.ws.push(slot);
    return slot;
  };
  /** 交给池子一件事。onPart 收中途发回来的每一格；返回的 Promise 在这件事做完时兑现 */
  Pool.prototype.submit = function (msg, onPart, front) {
    var self = this;
    return new Promise(function (resolve, reject) {
      if (self.dead) { reject({ message: "已停止", dead: true }); return; }
      var job = { id: self.nextId++, msg: msg, onPart: onPart, resolve: resolve, reject: reject };
      if (front) self.queue.unshift(job); else self.queue.push(job);
      self.pump();
    });
  };
  Pool.prototype.pump = function () {
    var self = this, i;
    if (this.dead) return;
    clearTimeout(this.idleT);
    if (this.broken) { var q = this.queue; this.queue = []; q.forEach(function (j) { j.reject(self.broken); }); return; }
    for (i = 0; i < this.ws.length && this.queue.length; i++) {
      var s = this.ws[i];
      if (s.ready && !s.job) { s.job = this.queue.shift(); s.w.postMessage(Object.assign({ id: s.job.id }, s.job.msg)); }
    }
    var busy = this.ws.filter(function (s) { return s.job || !s.ready; }).length;
    while (this.queue.length > busy && this.ws.length < this.size && !this.broken) { if (!this.spawn()) break; busy++; }
    if (this.broken) { this.pump(); return; }
    if (!this.queue.length && this.ws.every(function (s) { return !s.job; })) this.idleT = setTimeout(function () { self.rest(); }, 20000);   // 闲了一阵就把线程放掉，省内存；再有事时重新开
  };
  Pool.prototype.pending = function () { return this.queue.length + this.ws.filter(function (s) { return !!s.job; }).length; };
  Pool.prototype.rest = function () { if (this.pending()) return; this.ws.forEach(function (s) { try { s.w.terminate(); } catch (e) {} }); this.ws = []; };
  /** 把还没开始的事全部撤掉（正在算的那几件让它算完） */
  Pool.prototype.clear = function () { var q = this.queue; this.queue = []; q.forEach(function (j) { j.reject({ cancelled: true, message: "已取消" }); }); };
  Pool.prototype.dispose = function () {
    this.dead = true; clearTimeout(this.idleT);
    this.ws.forEach(function (s) { try { s.w.terminate(); } catch (e) {} if (s.job) s.job.reject({ message: "已停止", dead: true }); });
    this.ws = []; this.clear();
    if (this.url) { try { URL.revokeObjectURL(this.url); } catch (e) {} }
  };

  return { Engine: Engine, buildSource: buildSource, Pool: Pool, poolSource: poolSource };
})();
