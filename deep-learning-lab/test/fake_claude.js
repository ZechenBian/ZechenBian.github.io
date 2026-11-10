// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* A stand-in for the Claude artifact runtime, for tests only (test/serve.js injects it before the page's scripts).
 * window.claude.use(name) resolves the same shapes the page uses:
 *   db        an in-memory document store, kept in localStorage["__fake_db"] so that a reload finds the data again
 *   user      id() -> "viewer-test"
 *   sample    a CANNED tutor: it streams a fixed answer that says so. It checks plumbing, not teaching.
 *   mcp       callTool("host:mllab-engine", tool, input) -> the real engine, started by test/serve.js (numpy only here)
 *   downloads save() records the request in window.__saved
 * window.__FAKE_OFF = "sample,mcp" makes use() resolve null for those names. */
(function () {
  "use strict";
  function later(v, ms) { return new Promise(function (ok) { setTimeout(function () { ok(v); }, ms == null ? 40 : ms); }); }
  var store = {}; try { store = JSON.parse(localStorage.getItem("__fake_db") || "{}"); } catch (e) {}
  function persist() { try { localStorage.setItem("__fake_db", JSON.stringify(store)); } catch (e) {} }
  function snap(id, path) { var d = store[path]; return { id: id, exists: !!d, data: function () { return d ? JSON.parse(JSON.stringify(d)) : undefined; }, metadata: { fromCache: false, hasPendingWrites: false } }; }
  function check(path, even) { var n = path.split("/").length; if ((n % 2 === 0) !== even) throw new TypeError("path parity: " + path); }
  function docRef(path) {
    check(path, true); var id = path.split("/").pop();
    return { id: id, path: path, get: function () { return later(snap(id, path)); },
      set: function (data) { if (JSON.stringify(data).length > 262144) return Promise.reject({ code: "invalid_argument", message: "document over 256 KiB" }); store[path] = JSON.parse(JSON.stringify(data)); persist(); return later(); },
      update: function (data) { if (!store[path]) return Promise.reject({ code: "invalid_argument", message: "no such document" }); Object.assign(store[path], JSON.parse(JSON.stringify(data))); persist(); return later(); },
      delete: function () { delete store[path]; persist(); return later(); } };
  }
  function colRef(path) {
    check(path, false);
    var q = { path: path, limit: function () { return q; }, where: function () { return q; }, orderBy: function () { return q; },
      get: function () { var pre = path + "/", docs = Object.keys(store).filter(function (k) { return k.indexOf(pre) === 0 && k.slice(pre.length).indexOf("/") < 0; }).sort().map(function (k) { return snap(k.slice(pre.length), k); }); return later({ docs: docs, size: docs.length, empty: !docs.length }, window.__FAKE_DB_DELAY || 40); },
      doc: function (id) { return docRef(path + "/" + (id || Math.random().toString(36).slice(2))); } };
    return q;
  }
  var SCRIPT = '"""A canned script from the test tutor (simulated data)."""\nimport numpy as np\n\n\ndef run(lab):\n    rng = lab.rng\n    x = rng.normal(size=500)                      # simulated: standard normal samples\n    total = 0.0\n    for step in range(1, 51):\n        total += float(np.mean(x[: step * 10] ** 2))\n        lab.report(step, running_mean_square=total / step)\n    lab.table("First five samples", ["index", "value"], [[i, float(x[i])] for i in range(5)])\n    lab.result(mean_square=float(np.mean(x ** 2)), n=len(x))\n';
  function sample(input, opts) {
    opts = opts || {};
    var turns = typeof input === "string" ? [{ role: "user", content: input }] : input, last = turns[turns.length - 1].content;
    window.__lastPrompt = turns; window.__sampleCalls = (window.__sampleCalls || 0) + 1; window.__lastTier = opts.modelTier;
    var m = /Question: ([\s\S]*?)(?:\n\nLength:|\n\nThis is a request about a script|$)/.exec(last), q = m ? m[1].trim() : "(a follow-up)";
    var text;
    if (/FAIL_TUTOR/.test(last)) return later(null, 200).then(function () { throw { code: "rate_limited", message: "rate limited" }; });
    if (/COMPLETE script/.test(last)) text = "**Canned answer from the test tutor.** A real answer would explain the change. This script averages squares of simulated normal samples.\n\n```python\n" + SCRIPT + "```\n";
    else if (/300 to 600 words/.test(last)) text = "**Canned in-depth answer from the test tutor.** In the real page Claude answers here.\n\nThe statement: for logits $z$ and label $y$,\n\n$$\\nabla_z\\,\\ell(z, y) = \\mathrm{softmax}(z) - e_y .$$\n\n- First step of a derivation.\n- Second step, with $\\sum_k p_k = 1$.\n\nYou asked: " + q.slice(0, 200);
    else text = "**Canned answer from the test tutor.** In the real page Claude answers here, in at most 120 words. A formula to check rendering: $\\delta^L = p - e_y$. You asked: " + q.slice(0, 160);
    return new Promise(function (ok, no) {
      var i = 0, t = setInterval(function () {
        if (opts.signal && opts.signal.aborted) { clearInterval(t); return no({ code: "cancelled", message: "cancelled", text: text.slice(0, i) }); }
        i = Math.min(text.length, i + 60);
        if (opts.onText) opts.onText({ text: text.slice(0, i), delta: "" });
        if (i >= text.length) { clearInterval(t); ok({ text: text, truncated: false, modelTierApplied: opts.modelTier || "default" }); }
      }, window.__FAKE_SLOW ? 250 : 20);
    });
  }
  sample.json = function () { return Promise.reject({ code: "capability_removed" }); };
  sample.limits = function () { return later({ maxPromptBytes: 262144 }); };
  var mcp = { callTool: function (server, tool, input) {
    window.__mcpCalls = (window.__mcpCalls || []).concat([tool]);
    if (server !== "host:mllab-engine") return Promise.reject({ code: "not_in_manifest", message: "unknown server" });
    return fetch("/__mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: tool, input: input || {} }) }).then(function (r) { return r.json(); }).then(function (r) {
      if (r.transport) throw { code: r.transport, message: r.message || "" };
      if (r.isError) throw { code: "tool_error", message: "the tool reported an error", result: r };
      var text = (r.content || []).map(function (c) { return c.text; }).join(""), payload; try { payload = JSON.parse(text); } catch (e) { payload = text; }
      return { content: r.content, payload: payload };
    });
  } };
  var caps = { db: db(), user: { id: function () { return later("viewer-test"); } }, sample: sample, mcp: mcp, downloads: { save: function (o) { window.__saved = o; return later({}); } } };
  function db() { return { doc: docRef, collection: colRef }; }
  var off = String(window.__FAKE_OFF || "").split(",");
  window.claude = { use: function (name) { return later(off.indexOf(name) >= 0 ? null : caps[name] || null, 20); } };
})();
