// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 机器学习实验室 · 本机 Python 引擎的客户端（第二期，接口见 ml-engine/PROTOCOL.md）。
 * 页面要从引擎打开（终端里打印的 http://127.0.0.1:端口/ml/?engine=令牌）：引擎在页面里注入 window.QLML_ENGINE = { token, version }，
 * 页面和接口同源，请求带 X-QLML-Token 请求头。别的地方打开的页面（GitHub Pages、file://）连不上引擎，这里只显示怎么启动。
 * 一次运行：页面线程准备数据（ml-prep：训练 / 验证集、测试集的输入、快照网格）→ POST /api/run → 事件流（进度、快照、日志）→
 * 拿到原始预测以后在页面线程里打分（ml-score，和浏览器里跑的算法用同一段代码）。测试集的答案不发给引擎。
 * 在 Claude 里打开时（Artifact，页面不能自己联网）换一条路：经 Claude 桌面版调用本地 MCP 服务器 host:mllab-engine
 * （python -m mllab_engine --mcp，见 ml-engine/mllab_engine/mcp.py）。同样的请求和事件，只是分块交、分块取，每次调用都经桌面版、要你允许。 */
(function (A) {
  "use strict";
  var h = A.h, $ = A.$, clear = A.clear;
  var E = window.QLML_ENGINE || null, info = null, infoErr = "", examples = [];
  var HOSTED = !!(window.claude && typeof window.claude.use === "function");
  var MODE = E && E.token ? "http" : HOSTED ? "mcp" : "none";            // http：从引擎打开的页面；mcp：在 Claude 里，经桌面版调用本地 MCP 服务器
  var MCPN = "host:mllab-engine", mcpP = null, connecting = null, settle = null;
  var settled = new Promise(function (ok) { settle = ok; });              // 打开页面时那一次自动连接（如果有）有了结果
  function token() { return E && E.token ? String(E.token) : ""; }
  A.engineMode = function () { return MODE; };
  A.engineReady = function () { return MODE === "http" ? !!(token() && info) : MODE === "mcp" ? !!info : false; };
  A.engineInfo = function () { return info; };
  A.engineCanFetch = function () { return !!(A.engineReady() && info.fetch); };

  /* ---------- 数组的编码（PROTOCOL.md §2） ---------- */
  function b64(t) { var u8 = new Uint8Array(t.buffer, t.byteOffset, t.byteLength), s = "", CH = 0x8000; for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }
  function enc(t, shape) {
    if (t == null) return null;
    if (Array.isArray(t)) t = Float64Array.from(t);
    var code = t instanceof Float64Array ? "f8" : t instanceof Float32Array ? "f4" : t instanceof Int32Array ? "i4" : t instanceof Uint8Array ? "u1" : null;
    if (!code) throw new Error("只能编码 Float64Array / Float32Array / Int32Array / Uint8Array");
    return { $b64: b64(t), dtype: code, shape: shape || [t.length] };
  }
  function dec(o) { var bin = atob(o.$b64), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new ({ f8: Float64Array, f4: Float32Array, i4: Int32Array, u1: Uint8Array })[o.dtype](u8.buffer); }
  function reviver(k, v) { return v && typeof v === "object" && typeof v.$b64 === "string" ? dec(v) : v; }
  A.engineCodec = { enc: enc, dec: dec, reviver: reviver };

  /* ---------- 请求 ---------- */
  function api(method, path, body) {
    var o = { method: method, headers: { "X-QLML-Token": token() }, credentials: "same-origin", cache: "no-store" };
    if (body !== undefined) { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(body); }
    return fetch(path, o).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t, reviver) : null; } catch (e) {}
        if (!r.ok) { var err = new Error((j && j.error) || ("本机引擎回答 HTTP " + r.status)); err.status = r.status; err.body = j; throw err; }
        return j;
      });
    }, function () { throw new Error("连不上本机引擎：引擎可能已经关了。在终端里重新启动它，再用它打印的网址打开这一页。"); });
  }
  A.engineApi = function (method, path, body) { return api(method, path, body); };

  /* ---------- 在 Claude 里：经 Claude 桌面版调用本地 MCP 服务器 ---------- */
  function mcpNs() { if (!mcpP) mcpP = HOSTED ? Promise.resolve().then(function () { return window.claude.use("mcp"); }).then(function (m) { return m || null; }, function () { return null; }) : Promise.resolve(null); return mcpP; }
  A.mcpNs = mcpNs;
  function textOf(r) { return r && Array.isArray(r.content) ? r.content.filter(function (c) { return c && c.type === "text"; }).map(function (c) { return c.text; }).join("") : r && typeof r.payload === "string" ? r.payload : ""; }
  function payloadOf(r) { var p = r && r.payload; if (typeof p === "string") { try { p = JSON.parse(p); } catch (e) {} } if (p == null || typeof p === "string") { var t = textOf(r); try { p = JSON.parse(t); } catch (e) { p = t || p; } } return p; }
  A.mcpText = textOf;
  /** 调一个本机工具（原样返回结果）；server 是 host:… 的名字。失败时是 { code, message, retryable } */
  A.mcpCall = function (server, tool, input, opts) {
    return mcpNs().then(function (m) {
      if (!m) throw { code: "not_granted", message: "no mcp" };
      return m.callTool(server, tool, input || {}, Object.assign({ cache: false }, opts || {}));
    });
  };
  var MCPERR = {
    server_not_connected: "Claude 桌面版里没有找到本机引擎，或者它没在运行。按下面的步骤把它加进桌面版的设置，然后完全退出、重新打开 Claude 桌面版。（在网页版的 Claude、手机上打开时连不上本机引擎。）",
    not_in_manifest: "你没有允许这个页面使用本机引擎（或者在这个页面的权限里关掉了它）。",
    approval_required: "这一步要你点“允许”，但没有得到允许。再试一次，在弹出的对话框里选允许。",
    cancelled: "你没有允许这一次调用。",
    server_unavailable: "本机引擎没有回应：它可能还在启动，或者卡住了。等几秒再试；还不行就重启 Claude 桌面版，并看一下引擎的日志（见下面）。",
    blocked_by_policy: "你所在组织的设置不允许这个页面使用本机的工具。",
    not_granted: "当前的打开方式下，这个页面不能调用 Claude 桌面版的本机工具（要在 Claude 桌面版里打开）。",
    capability_disabled: "当前的打开方式下，这个页面不能调用 Claude 桌面版的本机工具（要在 Claude 桌面版里打开）。",
    capability_removed: "当前的 Claude 桌面版太旧，不支持页面调用本机工具：请更新桌面版。"
  };
  function mcpErr(e) {
    var code = e && e.code, t;
    if (code === "tool_error") { t = e.result ? textOf(e.result) : ""; return Object.assign(new Error(t || (e && e.message) || "本机引擎报错。"), { code: code }); }
    t = MCPERR[code] || ("调用本机引擎出错了（" + (code || "未知") + "）" + (e && e.message ? "：" + e.message : "") + "。");
    return Object.assign(new Error(t), { code: code, retryable: !!(e && e.retryable) });
  }
  function mcall(tool, input, sig) {
    return A.mcpCall(MCPN, tool, input, sig ? { signal: sig } : null).then(payloadOf, function (e) { throw mcpErr(e); });
  }
  A.engineCall = mcall;
  function connectMcp(silent) {
    if (connecting) return connecting;
    connecting = mcall("info").then(function (j) {
      info = j; infoErr = "";
      return mcall("examples").then(function (x) { examples = (x && x.examples) || []; }, function () {}).then(function () {
        publish(); if (!silent) A.toast("已连上本机引擎：算法列表里多了“Python（本机引擎）”一组。", 3600); return info;
      });
    }, function (e) { info = null; infoErr = e.message; paintBtn(); return null; }).then(function (r) { connecting = null; return r; });
    return connecting;
  }
  A.engineConnect = function () { return connectMcp(false); };
  /** 等打开页面时的自动连接有了结果（在 Claude 里刷新以后，要重新取的数据先等它） */
  A.engineSettled = function () { return settled; };
  function dec64(s) { var bin = atob(s || ""), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }
  /** 替页面从网上取一个文件：{ bytes, url, contentType, packed（"gzip" 表示引擎压缩过） } */
  A.engineFetch = function (url) {
    if (MODE !== "mcp") return api("POST", "/api/fetch", { url: url }).then(function (r) { return { bytes: r.data, url: r.url || url, contentType: r.contentType || "", packed: null }; });
    return mcall("fetch_url", { url: url }).then(function (r) {
      var parts = [dec64(r.data)], i = 1;
      return (function more() { if (i >= r.chunks) return Promise.resolve(); return mcall("read_blob", { id: r.id, index: i++ }).then(function (b) { parts.push(dec64(b.data)); return more(); }); })().then(function () {
        var n = parts.reduce(function (a, p) { return a + p.length; }, 0), out = new Uint8Array(n), o = 0; parts.forEach(function (p) { out.set(p, o); o += p.length; });
        return { bytes: out, url: r.url || url, contentType: r.contentType || "", packed: r.packed || null };
      });
    });
  };
  /** 交一次运行：http 一次 POST；mcp 小的直接交，大的先分块（每次调用的输入最多 1 MB） */
  function startRun(body, prog) {
    if (MODE !== "mcp") return api("POST", "/api/run", body);
    var text = JSON.stringify(body), PART = 300000, n = text.length, i = 0, up = null;
    if (n <= PART) { prog({ phase: "data", msg: "等你在 Claude 里允许运行…" }); return mcall("run_start", { job: body }); }
    return (function next() {
      if (i >= n) { prog({ phase: "data", msg: "发送完了，等你在 Claude 里允许运行…" }); return mcall("run_start", { upload: up }); }
      var piece = text.slice(i, i + PART); i += PART;
      return mcall("run_upload", { upload: up, text: piece }).then(function (r) { up = r.upload; prog({ phase: "data", msg: "发送到本机引擎… " + Math.round(100 * Math.min(i, n) / n) + "%" }); return next(); });
    })();
  }
  function cancelRemote(id) { if (MODE === "mcp") mcall("run_cancel", { id: id }).catch(function () {}); else api("POST", "/api/run/" + id + "/cancel", {}).catch(function () {}); }
  /** mcp：一轮一轮地取事件（每次最多等 15 秒）；很长的一条分几次来，拼好再交给 onEv */
  function pollEvents(id, onEv, onFail, state) {
    var from = 0, part = 0, buf = "", stopped = false, misses = 0;
    state.stop = function () { stopped = true; };
    function parse(t) { try { return JSON.parse(t, reviver); } catch (e) { return {}; } }
    (function loop() {
      if (stopped) return;
      mcall("run_events", { id: id, from: from, part: part, waitMs: 15000 }).then(function (r) {
        misses = 0; if (stopped) return;
        (r.events || []).forEach(function (ev) {
          if (ev.parts) { buf += ev.text; if (ev.part + 1 < ev.parts) return; var t = buf; buf = ""; onEv(ev.name, parse(t)); }
          else onEv(ev.name, parse(ev.text));
        });
        from = r.next; part = r.part || 0;
        if (r.finished) { stopped = true; return; }
        loop();
      }, function (e) {
        if (stopped) return;
        if (e.retryable && ++misses <= 3) { setTimeout(loop, 1000 + Math.random() * 1000); return; }
        stopped = true; onFail(e);
      });
    })();
  }
  function refresh() {
    if (MODE === "mcp") return info ? connectMcp(true) : Promise.resolve(null);
    if (!token()) return Promise.resolve(null);
    return api("GET", "/api/info").then(function (j) { info = j; infoErr = ""; return api("GET", "/api/examples").then(function (x) { examples = (x && x.examples) || []; publish(); return info; }, function () { publish(); return info; }); },
      function (e) { info = null; infoErr = e.message; paintBtn(); return null; });
  }
  /** 把引擎的示例算法放进算法列表（"Python（本机引擎）"一组） */
  function publish() {
    var torchOk = !!(info && info.torch && info.torch.available);
    window.QL_MLPY = examples.map(function (x) {
      var needTorch = (x.needs || []).indexOf("torch") >= 0, off = needTorch && !torchOk;
      return { id: "py-" + x.id, name: x.name + (off ? "（要先装 PyTorch）" : ""), summary: x.summary || "", api: x.api, kinds: x.kinds || [], families: x.families || [], group: "py", params: x.params || [], code: x.code || "", docs: x.docs || "", src: "py", lang: "py", disabled: off };
    });
    paintBtn(); A.renderAlgo();
  }
  function paintBtn() {
    var b = $("btnEngine"); if (!b) return;
    b.hidden = false;
    var on = A.engineReady();
    b.classList.toggle("on", on);
    clear(b);                          // 窄屏上只写"引擎"（顶栏放不下"本机引擎 · numpy"）
    b.appendChild(h("span", { class: "lang-long", text: on ? "本机引擎" + (info.torch && info.torch.available ? " · " + (info.torch.device || "cpu").toUpperCase() : " · numpy") : "本机引擎" }));
    b.appendChild(h("span", { class: "lang-short", text: "引擎" }));
    b.title = on ? "已连上本机的 Python 引擎" + (MODE === "mcp" ? "（经 Claude 桌面版）" : "") + "（Python " + info.python + "，numpy " + info.numpy + (info.torch && info.torch.available ? "，PyTorch " + info.torch.version + "，设备 " + info.torch.device : "，没有 PyTorch") + "）" : MODE === "mcp" ? "本机 Python 引擎：在 Claude 里要经 Claude 桌面版连接。点这里看怎么设置" : "本机 Python 引擎：在你自己的电脑上用 Python / PyTorch 跑算法。点这里看怎么启动";
  }

  /* ---------- 一次运行 ---------- */
  A.runEngine = function (a, params, opt) {
    opt = opt || {};
    if (!A.engineReady()) { A.toast("没有连上本机引擎。点顶栏的“本机引擎”看怎么启动。", 4200); return Promise.reject(new Error("没有连上本机引擎")); }
    if (a.disabled) { A.toast("这个算法要用 PyTorch，但引擎所在的 Python 里没有装。", 4200); return Promise.reject(new Error("引擎里没有 PyTorch")); }
    var d = A.ds(), spec = A.dsSpec(), opts = A.runOpts(), key = A.expKey(), aKey = A.algoKey();
    var state = { id: null, es: null, prep: null, cancelled: false, done: false, stop: null };
    var job = { cancel: function () { state.cancelled = true; if (state.prep) state.prep.cancel(); if (state.es) try { state.es.close(); } catch (e) {} if (state.stop) state.stop(); if (state.id) cancelRemote(state.id); } };
    var me = A.beginExternal(job, d, a), prog = function (m) { A.progress(m, me); };
    var grid = null, kk = 0;
    function fail(e) { if (state.done) return; state.done = true; var err = e && e.message ? e : { message: String(e && e.message || e) }; if (state.cancelled) err = { cancelled: true, message: "已取消" }; A.failExternal(me, err); throw err; }
    state.prep = QLMLRunner.run({ kind: "ml-prep", data: { dataset: spec, opts: opts }, mine: true, budgetMs: 30000 });
    return state.prep.promise.then(function (P) {
      if (state.cancelled) throw { cancelled: true, message: "已取消" };
      var data;
      if (P.api === "forecast") data = { y: enc(P.y), t1: P.t1, t2: P.t2, H: P.H, season: P.season, freq: P.freq, label: P.label };
      else {
        var part = function (s, withY) { var o = { X: enc(s.X, [s.n, s.d]), n: s.n, d: s.d, shape: s.shape || null, tokens: s.tokens || null }; if (withY) { o.y = enc(s.y); o.k = s.k; o.classes = s.classes || null; o.featureNames = s.featureNames || null; } return o; };
        grid = P.grid && P.grid.X ? P.grid : null; kk = P.k || 0;
        data = { kind: P.kind, train: part(P.train, true), valid: part(P.valid, true), test: part(P.test, false) };
        if (grid) data.grid = { X: enc(grid.X, [grid.X.length / (grid.kind === "fn1d" ? 1 : 2), grid.kind === "fn1d" ? 1 : 2]), kind: grid.kind };
      }
      prog({ phase: "data", msg: "发送到本机引擎…" });
      return startRun({ api: P.api, kind: P.kind, code: a.code, params: params, seed: A.dsSeed(), budgetMs: opts.budgetMs, data: data }, prog).catch(function (e) {
        if (e.status === 409) throw new Error("本机引擎正在跑另一次运行（一次只跑一个）。等它跑完，或者在引擎的终端里看看。");
        throw e;
      });
    }).then(function (r) {
      state.id = r.id;
      if (state.cancelled) { cancelRemote(r.id); throw { cancelled: true, message: "已取消" }; }
      return new Promise(function (resolve, reject) {
        // 多久没有任何事件就算引擎没了（引擎每 15 秒发一次心跳注释，EventSource 看不到注释，所以按预算放宽）
        var idleMs = Math.max(60000, opts.budgetMs * 1.5 + 30000), idleT = 0;
        function arm() { clearTimeout(idleT); idleT = setTimeout(function () { try { es.close(); } catch (e) {} reject(new Error("本机引擎超过 " + Math.round(idleMs / 1000) + " 秒没有动静：它可能已经关了或者卡住了。看一下引擎的终端。")); }, idleMs); }
        var done0 = resolve, fail0 = reject, es = null; resolve = function (v) { clearTimeout(idleT); done0(v); }; reject = function (e) { clearTimeout(idleT); fail0(e); };
        function close() { if (es) try { es.close(); } catch (x) {} if (state.stop) state.stop(); }
        /** 一条事件（http 的事件流和 mcp 的 run_events 是同样的名字和内容） */
        function onEv(name, m) {
          arm();
          if (name === "ready") prog({ phase: "data", msg: "引擎已就绪（Python " + (m.python || "") + (m.torch ? "，PyTorch " + m.torch + " · " + (m.device || "") : "") + "）" });
          else if (name === "progress") prog(m);
          else if (name === "snap") { if (m.kind === "grid2d" && grid && grid.bounds) prog({ snap: { step: m.step, kind: "grid2d", data: { nx: grid.nx, ny: grid.ny, x0: grid.bounds.x0, x1: grid.bounds.x1, y0: grid.bounds.y0, y1: grid.bounds.y1, k: kk, values: m.values } } }); }
          else if (name === "done") { close(); resolve(m.result); }
          else if (name === "error") { close(); reject({ message: m.message || "本机引擎报错", line: m.line || 0, cancelled: !!m.cancelled, timeout: !!m.timeout, traceback: m.traceback || "" }); }
        }
        arm();
        if (MODE === "mcp") { pollEvents(r.id, onEv, function (e) { reject(e); }, state); return; }
        es = state.es = new EventSource(r.events + (r.events.indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(token()));
        function J(e) { try { return JSON.parse(e.data, reviver); } catch (x) { return {}; } }
        ["ready", "progress", "snap", "log", "done"].forEach(function (nm) { es.addEventListener(nm, function (e) { onEv(nm, J(e)); }); });
        es.addEventListener("error", function (e) {
          if (e.data) { onEv("error", J(e)); return; }
          if (es.readyState === 2 && !state.done) reject(new Error("和本机引擎的连接断了：引擎可能已经关了。"));
        });
      });
    }).then(function (R) {
      if (state.cancelled) throw { cancelled: true, message: "已取消" };
      prog({ phase: "eval", msg: "打分中…" });
      var outs = { train: R.pred.train, valid: R.pred.valid, test: R.pred.test, curve: R.curve || [], log: R.log || [], fitMs: R.fitMs, predUs: R.predUs, size: R.size, internals: R.internals || null, engine: "py", ms: R.ms, importance: null };
      if (R.api !== "forecast") {
        outs.gridSnaps = (R.snaps || []).filter(function (s) { return s.kind === "grid2d" || s.kind === "fn1d"; }).map(function (s) { return { step: s.step, kind: s.kind, values: s.values }; });
        outs.snaps = (R.snaps || []).filter(function (s) { return s.kind === "embed"; }).map(function (s) { return { step: s.step, kind: "embed", data: { rows: s.rows, cols: s.cols, data: s.data } }; });
      }
      var sc = QLMLRunner.run({ kind: "ml-score", data: { dataset: spec, opts: opts, outs: outs }, mine: true, budgetMs: 30000 });
      return sc.promise.then(function (res) {
        res.engineInfo = R.engine || null;
        if (R.engine) res.log = (res.log || []).concat(["本机引擎：Python " + R.engine.python + "，numpy " + R.engine.numpy + (R.engine.torch ? "，PyTorch " + R.engine.torch + "（" + R.engine.device + "）" : "")]);
        state.done = true;
        A.endExternal(me, res, params, spec, key, aKey);
        return res;
      });
    }).catch(fail);
  };

  /* ---------- 对话框：状态与启动方法 ---------- */
  var START = [
    "# 第一次：在仓库的 strategy-lab/ml-engine 目录里装好（Python 3.10 或更新）",
    "cd strategy-lab/ml-engine",
    "python3 -m venv .venv && source .venv/bin/activate      # Windows：.venv\\Scripts\\activate",
    "pip install -e \".[torch]\"                              # 不要 PyTorch：pip install -e .",
    "",
    "# 以后每次：先构建页面（在 strategy-lab 目录里 python3 build.py），再启动引擎",
    "python -m mllab_engine",
    "# 终端里会打印 http://127.0.0.1:8765/ml/?engine=…  —— 用这个网址打开这一页"
  ].join("\n");
  var START_MCP = [
    "# 第一次：在仓库的 strategy-lab/ml-engine 目录里装好（Python 3.10 或更新）",
    "cd strategy-lab/ml-engine",
    "python3 -m venv .venv && source .venv/bin/activate      # Windows：.venv\\Scripts\\activate",
    "pip install -e \".[torch]\"                              # 不要 PyTorch：pip install -e .",
    "",
    "# 打印要加进 Claude 桌面版设置的那一段（路径已经填好）",
    "python -m mllab_engine --claude-config"
  ].join("\n");
  var CONFIG = JSON.stringify({ mcpServers: { "mllab-engine": { command: "/你的路径/strategy-lab/ml-engine/.venv/bin/python", args: ["-m", "mllab_engine", "--mcp"] } } }, null, 2);
  A.openEngine = function () {
    var body = h("div", { class: "ml-eng" });
    function paint() {
      clear(body);
      if (A.engineReady()) {
        var t = info.torch || {};
        body.appendChild(h("div", { class: "ok-note" }, h("b", { text: MODE === "mcp" ? "已经经 Claude 桌面版连上本机引擎。" : "已连上本机引擎。" }), " Python " + info.python + "，numpy " + info.numpy + "，" + (t.available ? "PyTorch " + t.version + "，设备 " + t.device + (t.device === "mps" ? "（苹果芯片的 GPU）" : t.device === "cuda" ? "（NVIDIA GPU）" : "") : "没有装 PyTorch（只能跑 numpy 的算法）") + "；" + info.cpu_count + " 个 CPU 核。" + (info.busy ? "正在跑一次运行。" : "")));
        body.appendChild(h("p", { class: "note", text: "左栏的算法列表里多了“Python（本机引擎）”一组：选一个，运行时就在你的电脑上用 Python 训练。也可以选一个打开“代码与说明”，另存一份再改。数据在页面里生成、划分好以后才发给引擎；测试集只发输入，不发答案，打分在页面里做，和浏览器里跑的算法用同一份代码。" }));
        if (examples.length) body.appendChild(h("ul", { class: "ml-eng-list" }, examples.map(function (x) { return h("li", null, h("b", { text: x.name }), " · " + (x.kinds || []).map(A.kindName).join("、") + ((x.needs || []).indexOf("torch") >= 0 ? " · 要 PyTorch" : "")); })));
        if (MODE === "mcp") body.appendChild(h("p", { class: "note", text: "在 Claude 里：每次运行 Python 算法之前，Claude 桌面版会问你允不允许；从网上取数据也经引擎去取（最多 50 MB）。" }));
      } else if (MODE === "mcp") {
        body.appendChild(h("p", { text: "你是在 Claude 里打开的这一页。页面自己不能联网，连不上本机引擎，但可以请 Claude 桌面版替它调用：把引擎作为“本地 MCP 服务器”加进桌面版的设置，桌面版启动时会把它拉起来（不监听任何端口，只有桌面版能和它说话）。每次运行算法之前，桌面版都会问你允不允许。第一次要做三件事：" }));
        if (infoErr) body.appendChild(h("div", { class: "warn err", id: "engMcpErr", text: infoErr }));
        body.appendChild(h("ol", { class: "ml-eng-steps" },
          h("li", null, h("b", { text: "装好引擎" }), "（只要做一次）：", h("pre", { class: "code", text: START_MCP })),
          h("li", null, h("b", { text: "加进 Claude 桌面版" }), "：在电脑屏幕顶上的菜单栏里点 Claude → Settings…，打开 Developer 一栏，点 Edit Config，把上一步打印出来的那一段并进 claude_desktop_config.json（文件里已经有 mcpServers 的话，只把 mllab-engine 那一项加进去）。大致是这个样子：", h("pre", { class: "code", id: "engMcpConfig", text: CONFIG })),
          h("li", null, h("b", { text: "重启并连接" }), "：完全退出 Claude 桌面版再打开，在桌面版里打开这一页，点下面的“连接本机引擎”，在弹出的对话框里选允许。")));
        body.appendChild(h("div", { class: "a-actions" }, h("button", { class: "btn primary", type: "button", id: "engMcpConnect", text: connecting ? "正在连接…" : "连接本机引擎", disabled: !!connecting, onclick: function () { connectMcp(false).then(paint); paint(); } })));
        body.appendChild(h("p", { class: "note", text: "连不上的时候看引擎的日志：Mac 上在 ~/Library/Logs/Claude/mcp-server-mllab-engine.log，Windows 上在 %APPDATA%\\Claude\\logs。只在 Claude 桌面版里能用：在网页版的 Claude、手机上打开时连不上本机引擎；在浏览器里打开网站版、用引擎打印的网址打开也行。" }));
      } else if (E && E.needToken) {
        body.appendChild(h("div", { class: "warn", text: "这一页是本机引擎给的，但网址里没有令牌（或者令牌不对）。请用引擎终端里打印的那个完整网址打开（…/ml/?engine=…）。" }));
      } else if (E && token() && !info) {
        body.appendChild(h("div", { class: "warn err", text: "连不上本机引擎：" + (infoErr || "没有回应") + "。" }));
        body.appendChild(h("button", { class: "btn small", type: "button", text: "再试一次", onclick: function () { refresh().then(paint); } }));
      } else {
        body.appendChild(h("p", { text: "本机引擎是一个小程序，在你自己的电脑上运行，让这一页可以用 Python（numpy、PyTorch，有苹果芯片或 NVIDIA 的 GPU 时用 GPU）训练算法。它只监听本机（127.0.0.1），每次启动换一个随机令牌；只有从它打印的网址打开的页面才能用它。" }));
        body.appendChild(h("pre", { class: "code", text: START }));
        body.appendChild(h("p", { class: "note", text: "这一页现在不是从引擎打开的，所以只用浏览器里的线程（不需要引擎也能用全部内置算法）。详细的说明在仓库的 strategy-lab/ml-engine/README.md，也可以看手册里的“本机引擎”。" }));
      }
      body.appendChild(h("p", { class: "note" }, "安全：引擎会执行你选的 Python 代码，权限和你自己一样（能读写你的文件）。只运行你看过、信得过的代码；AI 写的 Python 代码也要先看一遍。", A.helpBtn ? A.helpBtn("engine:how", "本机引擎") : null));
    }
    paint();
    var m = A.modal("本机引擎", body, { narrow: true, foot: [h("span", { style: { flex: "1" } }), h("button", { class: "btn", type: "button", text: "关闭", onclick: function () { m.close(); } })] });
    if (token() || (MODE === "mcp" && info)) refresh().then(paint);
  };
  A.initEngine = function () {
    paintBtn();
    if (MODE === "mcp") {
      // 以前允许过这个页面用本机引擎：打开页面时直接连（不会弹出询问）；没允许过就等你在“本机引擎”里点“连接”
      mcpNs().then(function (m) {
        if (!m) return;
        return Promise.resolve().then(function () { return window.claude.use("permissions"); }).then(function (p) { return p ? p.state("mcp:" + MCPN) : "unavailable"; }).catch(function () { return "unavailable"; })
          .then(function (st) { if (st === "granted") return connectMcp(true); });
      }).then(function () { settle(); }, function () { settle(); });
      return;
    }
    settle();
    if (!token()) return;
    refresh().then(function () { if (A.engineReady()) A.toast("已连上本机引擎：算法列表里多了“Python（本机引擎）”一组。", 3600); });
    setInterval(function () { if (!document.hidden && token()) api("GET", "/api/info").then(function (j) { var was = !!info; info = j; if (!was) publish(); else paintBtn(); }, function () { var was = !!info; info = null; if (was) { paintBtn(); A.renderAlgo(); } }); }, 15000);
  };
})(MLA);
