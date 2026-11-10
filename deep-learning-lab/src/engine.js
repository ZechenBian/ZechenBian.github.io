// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* The link to the reader's own computer.
 * The engine is strategy-lab/ml-engine (mllab-engine), a small Python program the reader runs on their Mac. In the Claude
 * desktop app it is registered as a local MCP server, and a page opened there reaches it through the artifact runtime's
 * "mcp" capability under the name host:mllab-engine. The page sends a job (script + parameters), the engine runs it in a
 * fresh Python process and streams back progress events; nothing is installed and nothing is written to disk by the page.
 * The engine only knows "supervised" jobs (fit / predict). A free-form experiment rides on one: the job's data are three
 * dummy rows, the code is the reader's script followed by src/labrt.py, whose fit() calls the script's run(lab) and whose
 * inspect() hands back everything the script gave to lab as one JSON string (protocol: strategy-lab/ml-engine/PROTOCOL.md). */
(function () {
  "use strict";
  var SERVER = "host:mllab-engine", PART = 300000;
  var DUMMY = { kind: "regression", train: { X: [[0], [1]], y: [0, 1], n: 2, d: 1 }, valid: { X: [[0]], y: [0], n: 1, d: 1 }, test: { X: [[0]], n: 1, d: 1 } };
  var E = DL.engine = { state: "unknown", info: null, error: "", code: "", busy: false, listeners: [] };
  function changed() { E.listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }
  E.onChange = function (fn) { E.listeners.push(fn); };

  var COPY = {
    server_not_connected: "No engine answered. Either this page is not open in the Claude desktop app, or the engine is not set up there as a local server. Runs need both.",
    not_in_manifest: "This page is not allowed to use the engine in this view. If you turned it off for this page, turn it back on in the page's Permissions menu.",
    approval_required: "The run needs your approval in Claude and did not get it. Press Run again and choose Allow.",
    cancelled: "The call was not allowed, so nothing ran.",
    server_unavailable: "The engine did not answer in time. It may still be starting. Wait a few seconds and try again.",
    not_granted: "This view cannot reach local tools. Open the page in the Claude desktop app on the Mac where the engine is installed.",
    blocked_by_policy: "Your organization's settings block this page from using local tools."
  };
  function textOf(r) { return r && Array.isArray(r.content) ? r.content.filter(function (c) { return c && c.type === "text"; }).map(function (c) { return c.text; }).join("") : r && typeof r.payload === "string" ? r.payload : ""; }
  function payloadOf(r) {
    var p = r && r.payload;
    if (typeof p === "string") { try { p = JSON.parse(p); } catch (e) {} }
    if (p == null || typeof p === "string") { var t = textOf(r); try { p = JSON.parse(t); } catch (e) { p = t || p; } }
    return p;
  }
  /** The engine's own messages are in Chinese; the two that readers meet get an English line in front. */
  function engineSays(msg) {
    if (/正在运行/.test(msg)) return "The engine is busy with another run (it runs one at a time). Wait for it to finish, then run again.";
    if (/没有这次(运行|上传)/.test(msg)) return "The engine no longer has this run (it was restarted, or the run is too old). Run again.";
    return "The engine reported: " + msg;
  }
  function call(tool, input) {
    return DL.cap("mcp").then(function (m) {
      if (!m) throw { code: "not_granted" };
      return m.callTool(SERVER, tool, input || {}, { cache: false });
    }).then(payloadOf, function (e) {
      var code = (e && e.code) || "upstream_error";
      if (code === "tool_error") throw Object.assign(new Error(engineSays((e.result && textOf(e.result)) || e.message || "an error")), { code: code });
      throw Object.assign(new Error(COPY[code] || ("Calling the engine failed (" + code + ").")), { code: code, retryable: !!(e && e.retryable) });
    });
  }
  E.call = call;

  /** Ask the engine who it is. Called on a deliberate action (the Connect button), because the first call asks for consent. */
  var connecting = null;
  E.connect = function () {
    if (connecting) return connecting;
    E.state = "connecting"; E.error = ""; changed();
    connecting = call("info").then(function (info) {
      if (!info || typeof info !== "object" || !info.python) throw Object.assign(new Error("The engine answered, but not with the expected information."), { code: "bad_info" });
      E.info = info; E.state = "ready"; E.error = ""; E.code = ""; DL.pref("engine.ok", 1);
      return info;
    }, function (e) { E.info = null; E.state = e.code === "server_not_connected" || e.code === "not_granted" ? "absent" : "error"; E.error = e.message; E.code = e.code || ""; return null; })
      .then(function (r) { connecting = null; changed(); return r; });
    return connecting;
  };
  E.ready = function () { return E.state === "ready" && !!E.info; };
  E.hasTorch = function () { return !!(E.info && E.info.torch && E.info.torch.available); };
  E.label = function () {
    if (E.state === "ready") return "Mac engine: connected" + (E.hasTorch() ? " · PyTorch " + E.info.torch.version + " on " + (E.info.torch.device || "cpu") : " · numpy only");
    if (E.state === "connecting") return "Mac engine: connecting…";
    if (E.state === "absent") return "Mac engine: not reachable here";
    if (E.state === "error") return "Mac engine: error";
    return "Mac engine: not connected";
  };

  /** The job the engine receives for one experiment run. Returns { job, userLines } */
  E.job = function (code, params, seed, budgetS, datasets) {
    var src = String(code).replace(/\r\n?/g, "\n"); if (!/\n$/.test(src)) src += "\n";
    var p = {}, k; for (k in params) p[k] = params[k];
    if (datasets) p.__data = datasets;
    return { job: { api: "supervised", kind: "regression", code: src + "\n" + DL.LABRT, params: p, seed: seed, budgetMs: Math.round(budgetS * 1000), data: DUMMY }, userLines: src.split("\n").length - 1 };
  };

  /** Run a job. on(name, data) receives "status" {text}, "ready", "progress" {phase, step, point}, "log" {text}.
   *  Returns { promise, cancel }: the promise resolves with { result, payload } or rejects with an Error carrying .ev
   *  (the engine's error event: message, line, traceback, type) or .code (a transport failure). */
  E.run = function (job, on) {
    var st = { id: null, cancelled: false };
    function fail(ev, code) { var e = new Error((ev && ev.message) || "The run failed."); e.ev = ev || null; e.code = code || ""; return e; }
    function start() {
      var text = JSON.stringify(job);
      if (text.length <= PART) { on("status", { text: "Waiting for you to allow the run in Claude…" }); return call("run_start", { job: job }); }
      var i = 0, up = null, n = text.length;
      return (function next() {
        if (st.cancelled) throw fail({ message: "Stopped before the run started." }, "stopped");
        if (i >= n) { on("status", { text: "Data sent. Waiting for you to allow the run in Claude…" }); return call("run_start", { upload: up }); }
        var piece = text.slice(i, i + PART); i += PART;
        return call("run_upload", up ? { upload: up, text: piece } : { text: piece }).then(function (r) { up = r.upload; on("status", { text: "Sending the script and data to the engine: " + Math.round(100 * Math.min(i, n) / n) + "%" }); return next(); });
      })();
    }
    var promise = start().then(function (r) {
      if (!r || !r.id) throw fail({ message: "The engine did not start the run." });
      st.id = r.id; E.busy = true; changed();
      if (st.cancelled) call("run_cancel", { id: st.id }).catch(function () {});
      on("status", { text: "Started." });
      return new Promise(function (ok, no) {
        var from = 0, part = 0, buf = "", misses = 0;
        (function loop() {
          call("run_events", { id: st.id, from: from, part: part, waitMs: 15000 }).then(function (x) {
            misses = 0; var end = null;
            (x.events || []).forEach(function (ev) {
              var text = ev.text;
              if (ev.parts) { buf += ev.text; if (ev.part + 1 < ev.parts) return; text = buf; buf = ""; }
              var d = {}; try { d = JSON.parse(text); } catch (e) {}
              if (ev.name === "done") end = function () {
                var res = d.result || {}, payload = null;
                try { payload = JSON.parse(res.internals.extra.json); } catch (e) {}
                if (!payload) return no(fail({ message: "The run finished, but its results could not be read." }));
                ok({ result: res, payload: payload });
              };
              else if (ev.name === "error") end = function () { no(fail(d, st.cancelled ? "stopped" : "")); };
              else on(ev.name, d);
            });
            from = x.next; part = x.part || 0;
            if (end) return end();
            if (x.finished) return no(fail({ message: st.cancelled ? "Stopped." : "The run ended without a result." }, st.cancelled ? "stopped" : ""));
            loop();
          }, function (e) {
            if (e.retryable && ++misses <= 3) { setTimeout(loop, 1000 + Math.random() * 1000); return; }
            no(fail({ message: e.message }, e.code));
          });
        })();
      });
    }, function (e) { throw e.ev !== undefined ? e : fail({ message: e.message }, e.code); });
    promise = promise.then(function (v) { E.busy = false; changed(); return v; }, function (e) { E.busy = false; changed(); throw e; });
    return { promise: promise, cancel: function () { st.cancelled = true; if (st.id) call("run_cancel", { id: st.id }).catch(function () {}); } };
  };
})();
