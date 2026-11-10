// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* The Train tab: one card per experiment, with Run / Code / History inside.
 * A run goes: pick a preset (a question) -> predict -> run on the reader's Mac (or look at the recorded reference run)
 * -> the page says which option happened, with the numbers and the reason. First-time predictions go into the ledger.
 * A question is about the script as shipped: once the reader edits the script, runs are free runs (no prediction, no
 * verdict), because the explanation written for the original would no longer be about what ran.
 * Stored documents: "code-<exp>" { src, at } for an edited script; "run-<exp>-<time>" for each finished run;
 * "ledger" { items: [{ at, exp, preset, pick, answer, hit, ref, again }] }. */
(function () {
  "use strict";
  var h = DL.h, $ = DL.$, E = DL.engine, O = DL.out;
  var T = DL.train = {}, vms = {}, host = null, unitId = null, disposers = [];

  /* ---------- per-experiment state ---------- */
  function paramDefaults(exp, preset) { var p = {}; exp.params.forEach(function (d) { p[d.k] = d.def; }); if (preset) for (var k in preset.set) p[k] = preset.set[k]; return p; }
  function vmOf(exp) {
    var vm = vms[exp.id]; if (vm) { vm.exp = exp; return vm; }
    var saved = DL.store.get("code-" + exp.id), orig = DL.scriptOf(exp.id), first = exp.presets[0] || null;
    vm = vms[exp.id] = { exp: exp, code: saved && typeof saved.src === "string" ? saved.src : orig, tab: "run", presetId: first ? first.id : null, pick: null,
      params: paramDefaults(exp, first), extra: "{}", seed: 1, budget: (first && first.budget) || exp.budget, run: null, shown: null, compare: null, cleanup: [], openParams: false };
    return vm;
  }
  function presetOf(vm) { for (var i = 0; i < vm.exp.presets.length; i++) if (vm.exp.presets[i].id === vm.presetId) return vm.exp.presets[i]; return null; }
  function edited(vm) { return vm.code !== DL.scriptOf(vm.exp.id); }
  /** An experiment's own script, changed by the reader: its runs answer no preset question */
  function custom(vm) { return !vm.exp.scratch && edited(vm); }
  function resetCode(vm) {
    if (vm.ui && vm.ui.editor) vm.code = vm.ui.editor.get();
    var old = vm.code; putCode(vm, DL.scriptOf(vm.exp.id)); paint(vm);
    DL.toast("The original script is back.", "Undo", function () { putCode(vm, old); paint(vm); });
  }
  /** After a run or a reference run: bring what came out into view (it is usually below the fold) */
  function showOutcome(vm) {
    var card = host && host.querySelector('.exp[data-exp="' + vm.exp.id + '"]'); if (!card || vm.tab !== "run") return;
    var el = card.querySelector(".verdict, .err") || card.querySelector(".tiles") || card.querySelector(".out");
    if (el) setTimeout(function () { DL.reveal(el); }, 40);
  }
  function history(expId) { return DL.store.list("run-" + expId + "-"); }
  function saveCode(vm) { if (edited(vm)) DL.store.put("code-" + vm.exp.id, { src: vm.code, at: Date.now() }); else DL.store.del("code-" + vm.exp.id); }
  /** Replace the script from outside the editor (reset, undo, the tutor): the editor's own text must not be flushed over it */
  function putCode(vm, code) { vm.code = code; if (vm.ui) vm.ui.editor = null; saveCode(vm); }

  /* ---------- the ledger ---------- */
  T.ledger = function () { var d = DL.store.get("ledger"); return d && Array.isArray(d.items) ? d.items : []; };
  function ledgerAdd(item) {
    var items = T.ledger().slice();
    item.again = items.some(function (x) { return x.exp === item.exp && x.preset === item.preset; });
    items.push(item); if (items.length > 500) items = items.slice(-500);
    DL.store.put("ledger", { items: items, at: Date.now() });
    if (DL.onLedgerChanged) DL.onLedgerChanged();
  }
  T.score = function () { var first = T.ledger().filter(function (x) { return !x.again && x.hit != null; }); return { n: first.length, hits: first.filter(function (x) { return x.hit; }).length }; };

  /* ---------- verdict ---------- */
  function judge(vm, preset, results, curve) {
    var info = { curve: curve };
    if (preset.base) {
      var prev = history(vm.exp.id).filter(function (d) { return d.data.preset === preset.base.preset && d.data.results; })[0];
      if (prev && typeof prev.data.results[preset.base.key] === "number") { info.base = prev.data.results[preset.base.key]; info.baseFrom = "your last run of “" + nameOfPreset(vm.exp, preset.base.preset) + "”"; }
      else { var ref = DL.REF[preset.base.ref]; if (ref) { info.base = ref.results[preset.base.key]; info.baseFrom = "the reference run"; } }
    }
    var ans = null, text = "";
    try { ans = preset.judge(results, info); } catch (e) { ans = null; }
    try { text = preset.happened(results, info); } catch (e) { text = ""; }
    return { answer: ans, text: text };
  }
  function nameOfPreset(exp, id) { for (var i = 0; i < exp.presets.length; i++) if (exp.presets[i].id === id) return exp.presets[i].name; return id; }

  /* ---------- running ---------- */
  function datasets(exp) { if (!exp.needs) return null; var d = {}; exp.needs.forEach(function (n) { if (DL.DATA && DL.DATA[n]) d[n] = DL.DATA[n]; }); return d; }
  function start(vm) {
    var exp = vm.exp, preset = custom(vm) ? null : presetOf(vm), params = {}, k;
    for (k in vm.params) params[k] = vm.params[k];
    if (exp.scratch) { try { var ex = JSON.parse(vm.extra || "{}"); for (k in ex) params[k] = ex[k]; } catch (e) { DL.toast("The extra parameters are not valid JSON."); return; } }
    var built = E.job(vm.code, params, vm.seed, vm.budget, datasets(exp));
    var run = vm.run = { state: "running", status: "Starting…", t0: Date.now(), curve: [], log: [], env: null, params: params, presetId: preset ? preset.id : null, pick: preset ? vm.pick : null, userLines: built.userLines, error: null };
    vm.shown = null; vm.tab = "run";
    var handle = E.run(built.job, function (name, d) {
      if (vm.run !== run) return;
      if (name === "status") { run.status = d.text; liveStatus(vm); }
      else if (name === "ready") { run.env = d; run.t1 = Date.now(); run.status = "Running on Python " + d.python + (d.torch ? ", PyTorch " + d.torch + " on " + (d.device || "cpu") : ", numpy " + d.numpy) + "."; liveStatus(vm); }
      else if (name === "progress" && d.phase === "fit" && d.point) { run.curve.push(d.point); run.step = d.step; liveCurve(vm); liveStatus(vm); }
      else if (name === "log" && d.text != null) { run.log.push(String(d.text)); if (run.log.length > 400) run.log.shift(); liveLog(vm); }
    });
    run.handle = handle;
    run.timer = setInterval(function () { if (vm.run === run && run.state === "running") liveStatus(vm); }, 1000);
    handle.promise.then(function (out) {
      clearInterval(run.timer); if (vm.run !== run) return;
      var res = out.result, pay = out.payload;
      run.state = "done"; run.results = pay.results || {}; run.outputs = pay.outputs || []; run.sha = pay.meta && pay.meta.code_sha256;
      run.curve = res.curve && res.curve.length ? res.curve : run.curve; run.log = res.log && res.log.length ? res.log : run.log;
      run.secs = (res.fitMs || 0) / 1000; run.engine = res.engine || null;
      finish(vm, run, preset);
    }, function (err) {
      clearInterval(run.timer); if (vm.run !== run) return;
      run.state = err.code === "stopped" || /^Stopped/.test(err.message) ? "stopped" : "error";
      run.error = err.ev && (err.ev.traceback || err.ev.type) ? err.ev : { message: err.message, line: 0, traceback: "", type: "" };
      if (run.state === "error" && (err.code === "server_not_connected" || err.code === "not_granted")) { E.state = "absent"; E.error = err.message; }
      paint(vm); showOutcome(vm);
    });
    paint(vm);
  }
  function finish(vm, run, preset) {
    var exp = vm.exp, v = null;
    if (preset) { v = judge(vm, preset, run.results, run.curve); run.verdict = v; }
    if (preset && run.pick != null && v && v.answer != null) ledgerAdd({ at: Date.now(), exp: exp.id, preset: preset.id, pick: run.pick, answer: v.answer, hit: run.pick === v.answer, ref: false });
    var doc = { at: Date.now(), exp: exp.id, preset: run.presetId, pick: run.pick, answer: v ? v.answer : null, params: run.params, seed: vm.seed, results: run.results,
      curve: thin(run.curve, 400), log: run.log.slice(-40), outputs: run.outputs, secs: run.secs, engine: run.engine, edited: edited(vm), sha: run.sha };
    var id = "run-" + exp.id + "-" + Date.now().toString(36);
    if (!DL.store.put(id, doc)) { doc.outputs = lastFrames(run.outputs); if (!DL.store.put(id, doc)) { doc.outputs = []; doc.noOutputs = true; DL.store.put(id, doc); } }
    history(exp.id).slice(8).forEach(function (d) { DL.store.del(d.id); });
    paint(vm); showOutcome(vm);
  }
  function thin(curve, n) { if (curve.length <= n) return curve; var s = Math.ceil(curve.length / n), out = curve.filter(function (_, i) { return i % s === 0; }); if (out[out.length - 1] !== curve[curve.length - 1]) out.push(curve[curve.length - 1]); return out; }
  function lastFrames(outs) { var last = {}; outs.forEach(function (o, i) { if (o.frame != null) last[o.kind + "\u0000" + o.title] = i; }); return outs.filter(function (o, i) { return o.frame == null || last[o.kind + "\u0000" + o.title] === i; }); }
  function stop(vm) { if (vm.run && vm.run.state === "running") { vm.run.status = "Stopping…"; vm.run.handle.cancel(); liveStatus(vm); } }

  /* ---------- live updates (no re-render) ---------- */
  function liveStatus(vm) {
    var el = vm.ui && vm.ui.status, run = vm.run; if (!el || !run) return;
    var t = Math.round((Date.now() - (run.t1 || run.t0)) / 1000), last = run.curve[run.curve.length - 1], bits = [run.status];
    if (run.state === "running" && run.t1) { bits = ["Running"]; if (run.step != null) bits.push("step " + DL.num(run.step)); bits.push(DL.secs(t) + " elapsed"); if (last) { var k = Object.keys(last).filter(function (x) { return x !== "step"; }).slice(0, 2).map(function (x) { return x.replace(/_/g, " ") + " " + DL.num(last[x]); }); bits = bits.concat(k); } }
    DL.clear(el); DL.add(el, [run.state === "running" ? h("i", { class: "spin" }) : null, " ", bits.join(" · ")]);
  }
  var curveRaf = {};
  function liveCurve(vm) {
    if (curveRaf[vm.exp.id]) return;
    curveRaf[vm.exp.id] = requestAnimationFrame(function () { curveRaf[vm.exp.id] = 0; drawCurve(vm, vm.run && vm.run.curve); });
  }
  function drawCurve(vm, curve) {
    var ui = vm.ui; if (!ui || !ui.chartHost) return;
    if (!curve || !curve.length) { ui.chartHost.hidden = true; return; }
    var cmp = vm.compare && DL.store.get(vm.compare), spec = O.curveSpec(O.chartConfig(vm.exp.chart, curve), curve, cmp ? cmp.curve : null);
    if (!spec) { ui.chartHost.hidden = true; return; }
    ui.chartHost.hidden = false;
    if (!ui.chart) { ui.chart = new QLChart.Chart(ui.chartHost, {}); vm.cleanup.push(function () { ui.chart.destroy(); }); }
    ui.chart.set(spec);
  }
  function liveLog(vm) { var el = vm.ui && vm.ui.log; if (!el || !vm.run) return; el.textContent = vm.run.log.slice(-60).join("\n"); el.scrollTop = el.scrollHeight; if (vm.ui.logBox) vm.ui.logBox.hidden = false; }

  /* ---------- the engine card and its help ---------- */
  function engineCard() {
    var box = h("div", { class: "setup", id: "engine-card" });
    function fill() {
      DL.clear(box);
      var dot = h("i", { class: "dot " + (E.state === "ready" ? "ok" : E.state === "connecting" ? "wait" : E.state === "error" || E.state === "absent" ? "bad" : "") }), text, btns = [];
      if (E.state === "ready") { var i = E.info; text = "Connected to the engine on your Mac: Python " + i.python + ", numpy " + i.numpy + (E.hasTorch() ? ", PyTorch " + i.torch.version + " on " + (i.torch.device === "mps" ? "the Apple GPU (mps)" : i.torch.device) : ", no PyTorch (the numpy experiments run; the PyTorch ones need it)") + (i.cpu_count ? ", " + i.cpu_count + " cores" : "") + ". The Claude app asks you before each run."; }
      else if (E.state === "connecting") text = "Connecting. If Claude asks whether this page may use the engine, choose Allow.";
      else if (E.state === "absent") { text = E.error + " Until then, every question can be answered from its recorded reference run, and every script can be copied and run by hand."; btns = [h("button", { class: "btn quiet small", text: "Try again", onclick: E.connect }), h("button", { class: "btn ghost small", text: "How to set it up", onclick: T.engineHelp })]; }
      else if (E.state === "error") { text = E.error; btns = [h("button", { class: "btn small", text: "Try again", onclick: E.connect }), h("button", { class: "btn ghost small", text: "How to set it up", onclick: T.engineHelp })]; }
      else { text = "The experiments run on your own Mac, through mllab-engine: a small Python program that the Claude desktop app starts for this page. It needs setting up once. After that, press Connect; the Claude app asks you before each run. The page installs nothing and saves nothing on your disk. Without the engine, every question can still be answered from a recorded run."; btns = [h("button", { class: "btn small", text: "Connect to my Mac", onclick: E.connect }), h("button", { class: "btn ghost small", text: "What it is and how to set it up", onclick: T.engineHelp })]; }
      DL.add(box, [dot, h("p", { text: text })].concat(btns));
    }
    fill(); return { el: box, fill: fill };
  }
  T.engineHelp = function () {
    var i = E.info, body = h("div", { style: "display:grid;gap:12px;font-size:13.5px;line-height:1.6" });
    var REPO = "https://github.com/ZechenBian/zechenbian.github.io/tree/main/strategy-lab/ml-engine";
    function code(t) { return h("code", { class: "mono", text: t }); }
    // first what it is for, the state of the connection and the one button; the setup steps are folded below
    body.appendChild(h("p", { style: "margin:0" }, [h("b", { text: "You need the engine only to run experiments yourself. " }), "Reading, asking the tutor and looking at the recorded run of every experiment all work without it."]));
    body.appendChild(h("p", { style: "margin:0" }, ["The engine is mllab-engine, a small Python program that runs on a Mac and is started by the Claude desktop app there. This page sends it a script and its parameters; it runs them in a fresh Python process, on the Apple GPU when PyTorch is installed, and streams back the numbers. It does not listen on the network, and the page neither installs anything nor writes files."]));
    if (i) body.appendChild(h("dl", { class: "kv" }, [h("dt", { text: "Engine" }), h("dd", { text: "mllab-engine " + (i.version || "") }), h("dt", { text: "Python" }), h("dd", { text: i.python }), h("dt", { text: "numpy" }), h("dd", { text: i.numpy }), h("dt", { text: "PyTorch" }), h("dd", { text: E.hasTorch() ? i.torch.version + " on " + i.torch.device : "not installed" }), h("dt", { text: "CPU cores" }), h("dd", { text: String(i.cpu_count || "?") })]));
    else body.appendChild(h("p", { class: "hint", style: "margin:0", text: E.state === "connecting" ? "Connecting…" : E.error || "Not connected yet." }));
    body.appendChild(h("div", { class: "runbar" }, [h("button", { class: "btn small", text: E.state === "ready" ? "Check again" : "Connect to my Mac", onclick: function () { E.connect().then(function () { m.close(); T.engineHelp(); }); } }),
      h("span", { class: "status", text: E.state === "ready" ? "" : "Connect works when this page is open in the Claude desktop app on a Mac where the engine is set up. On a phone or in a browser tab there is nothing to connect to." })]));
    var setup = h("details", { open: E.state === "error" || E.state === "absent" }, [h("summary", { class: "linkbtn", style: "cursor:pointer;text-decoration:none", text: "Setting it up on a Mac (once, about ten minutes)" })]), box = h("div", { style: "display:grid;gap:10px;margin-top:8px" });
    box.appendChild(h("p", { style: "margin:0" }, ["The engine's code is in the folder ", h("a", { href: REPO, target: "_blank", rel: "noopener noreferrer", text: "strategy-lab/ml-engine" }), " of this site's repository."]));
    box.appendChild(h("ol", {}, [
      h("li", {}, ["Get the repository onto the Mac (download or clone it from GitHub) and open Terminal in its folder ", code("strategy-lab/ml-engine"), "."]),
      h("li", {}, ["Run ", code("uv run --extra torch python -m mllab_engine --claude-config"), ". The first time, uv downloads Python, numpy and PyTorch; then the command prints a block of configuration. Without uv: ", code("python3 -m venv .venv && source .venv/bin/activate && pip install -e \".[torch]\""), ", then ", code("python -m mllab_engine --claude-config"), "."]),
      h("li", { text: "In the Claude desktop app open Settings, then Developer, then Edit Config, and add the printed “mllab-engine” entry to the “mcpServers” section of claude_desktop_config.json." }),
      h("li", { text: "Quit Claude completely and open it again. Open this page there, press Connect, and choose Allow when Claude asks." })]));
    box.appendChild(h("p", { class: "hint", text: "The engine reaches this page only in the Claude desktop app, and only for the owner of the page. Running a script on your computer counts as an action, so the app asks before each run. If Connect fails, the app's log says why: ~/Library/Logs/Claude/mcp-server-mllab-engine.log. The engine's own README (in the folder linked above) has the full instructions, in the part about using it in Claude." }));
    box.appendChild(h("p", { class: "hint", text: "To add PyTorch to an engine that was installed without it: in the same folder, run the uv command above again (it installs what is missing), or pip install torch inside the engine's environment. Then quit and reopen Claude." }));
    setup.appendChild(box); body.appendChild(setup);
    var m = DL.modal("Your Mac engine", body);
  };

  /* ---------- the code editor ---------- */
  var KW = /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|#[^\n]*|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b(?:def|class|return|if|elif|else|for|while|in|not|and|or|import|from|as|with|lambda|None|True|False|break|continue|pass|try|except|finally|raise|yield|assert|is|global|nonlocal|del)\b|@\w+)/g;
  function highlight(src) {
    var out = "", last = 0, m; KW.lastIndex = 0;
    while ((m = KW.exec(src))) {
      out += QLMD.esc(src.slice(last, m.index)); var t = m[0], c = t.charAt(0);
      out += '<span class="' + (c === "#" ? "tk-c" : c === '"' || c === "'" ? "tk-s" : c === "@" ? "tk-d" : /\d/.test(c) ? "tk-n" : "tk-k") + '">' + QLMD.esc(t) + "</span>"; last = m.index + t.length;
    }
    return out + QLMD.esc(src.slice(last));
  }
  var LH = 19.4;
  function Editor(src, onChange) {
    var pre = h("pre", { "aria-hidden": "true" }), ln = h("div", { class: "ln", "aria-hidden": "true" }), bar = h("div", { class: "errbar", hidden: true });
    var ta = h("textarea", { spellcheck: "false", autocapitalize: "off", autocomplete: "off", autocorrect: "off", wrap: "off", "aria-label": "Python script of this experiment" });
    var el = h("div", { class: "editor" }, h("div", { class: "editor-in" }, [bar, pre, ta, ln]));
    function draw() { var v = ta.value, n = v.split("\n").length, s = ""; pre.innerHTML = highlight(v) + "\n"; for (var i = 1; i <= n; i++) s += i + "\n"; ln.textContent = s; }
    ta.value = src; draw();
    ta.addEventListener("input", function () { bar.hidden = true; draw(); onChange(ta.value); });
    ta.addEventListener("keydown", function (e) {
      var s = ta.selectionStart, t = ta.selectionEnd, v = ta.value;
      if (e.key === "Tab" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); ta.setRangeText("    ", s, t, "end"); draw(); onChange(ta.value); }
      else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && s === t) {
        var ls = v.lastIndexOf("\n", s - 1) + 1, line = v.slice(ls, s), ind = /^[ \t]*/.exec(line)[0] + (/:\s*(#.*)?$/.test(line) ? "    " : "");
        e.preventDefault(); ta.setRangeText("\n" + ind, s, t, "end"); draw(); onChange(ta.value);
      }
    });
    return { el: el, get: function () { return ta.value; }, set: function (v) { ta.value = v; bar.hidden = true; draw(); },
      mark: function (line) { if (!line) { bar.hidden = true; return; } bar.hidden = false; bar.style.top = (10 + (line - 1) * LH) + "px"; setTimeout(function () { bar.scrollIntoView({ block: "center", inline: "nearest" }); }, 0); },
      selection: function () { return ta.value.slice(ta.selectionStart, ta.selectionEnd); } };
  }

  /* ---------- painting a card ---------- */
  function clean(vm) { vm.cleanup.forEach(function (f) { try { f(); } catch (e) {} }); vm.cleanup = []; vm.ui = null; }
  function paint(vm) {
    var card = host && host.querySelector('.exp[data-exp="' + vm.exp.id + '"]'); if (!card) return;
    var body = card.querySelector(".exp-body"), tabs = card.querySelector(".exp-tabs");
    if (vm.ui && vm.ui.editor) { vm.code = vm.ui.editor.get(); saveCode(vm); }
    clean(vm); DL.clear(body); DL.clear(tabs);
    var nh = history(vm.exp.id).length;
    [["run", "Run"], ["code", "Code" + (edited(vm) ? " (edited)" : "")], ["history", "History"]].forEach(function (t) {
      tabs.appendChild(h("button", { role: "tab", "aria-selected": String(vm.tab === t[0]), onclick: function () { vm.tab = t[0]; paint(vm); } }, [t[1], t[0] === "history" && nh ? h("span", { class: "count", text: String(nh) }) : null]));
    });
    vm.ui = {};
    if (vm.tab === "code") paintCode(vm, body); else if (vm.tab === "history") paintHistory(vm, body); else paintRun(vm, body);
    DL.linkSections(card, vm.exp.unit);
    setTimeout(function () { DL.markScroll(card); }, 0);
  }
  function selectPreset(vm, id) {
    var p = null; vm.exp.presets.forEach(function (x) { if (x.id === id) p = x; });
    vm.presetId = p ? p.id : null; vm.pick = null; vm.shown = null;      // a comparison chosen in History stays until it is removed
    if (p) { vm.params = paramDefaults(vm.exp, p); vm.budget = p.budget || vm.exp.budget; }
    if (vm.run && vm.run.state !== "running") vm.run = null;
    paint(vm);
  }
  function paramInput(vm, d) {
    var v = vm.params[d.k], inp;
    function changed(val) { vm.params[d.k] = val; if (vm.presetId) { vm.presetId = null; vm.pick = null; vm.openParams = true; paint(vm); } }
    if (d.type === "bool") { inp = h("input", { type: "checkbox", checked: !!v }); inp.addEventListener("change", function () { changed(inp.checked); }); return h("label", { class: "ck" }, [inp, d.label]); }
    if (d.type === "choice") { inp = h("select", {}, d.choices.map(function (c) { return h("option", { value: c, text: c, selected: c === v }); })); inp.addEventListener("change", function () { changed(inp.value); }); return h("label", {}, [d.label, inp]); }
    inp = h("input", { type: "number", value: String(v), step: d.type === "int" ? "1" : "any", min: d.min != null ? String(d.min) : null, max: d.max != null ? String(d.max) : null });
    inp.addEventListener("change", function () { var x = d.type === "int" ? Math.round(+inp.value) : +inp.value; if (!(x === x)) x = d.def; if (d.min != null) x = Math.max(d.min, x); if (d.max != null) x = Math.min(d.max, x); inp.value = String(x); changed(x); });
    return h("label", {}, [d.label, inp]);
  }
  function paintRun(vm, body) {
    var exp = vm.exp, preset = presetOf(vm), run = vm.run, running = run && run.state === "running", ui = vm.ui, mine = custom(vm);
    var noTorch = exp.lib === "torch" && E.ready() && !E.hasTorch();
    // 1. the questions
    if (exp.presets.length) {
      body.appendChild(h("div", { class: "presets" }, [h("span", { class: "kicker", text: "Pick a question to put to the run" }), h("div", { class: "chips" }, exp.presets.map(function (p, i) {
        var done = T.ledger().some(function (x) { return x.exp === exp.id && x.preset === p.id; });
        return h("button", { class: "chip", "aria-pressed": String(vm.presetId === p.id), disabled: running, onclick: function () { selectPreset(vm, p.id); } }, (i + 1) + ". " + p.name + (done ? " ✓" : ""));
      }).concat([h("button", { class: "chip", "aria-pressed": String(!vm.presetId), disabled: running, onclick: function () { selectPreset(vm, null); vm.openParams = true; paint(vm); } }, "Free run")]))]));
    }
    // 2. the prediction
    var shown = vm.shown || (run && run.state === "done" ? { kind: "live", results: run.results, curve: run.curve, outputs: run.outputs, log: run.log, pick: run.pick, verdict: run.verdict, presetId: run.presetId, secs: run.secs, engine: run.engine } : null);
    var decided = shown && shown.presetId === vm.presetId && preset;
    if (preset && mine && !decided) {
      body.appendChild(h("div", { class: "similar" }, [h("span", { text: "The question is about the script as it came. Yours is edited, so a run now is a free run: no prediction and no verdict." }),
        h("button", { class: "linkbtn", text: "Reset to the original", onclick: function () { resetCode(vm); } })]));
    } else if (preset) {
      var locked = running || decided, lockedPick = locked ? (running ? run.pick : shown.pick) : null;
      var first = T.ledger().filter(function (x) { return x.exp === exp.id && x.preset === preset.id && !x.again; })[0];
      body.appendChild(h("div", { class: "predict" }, [h("span", { class: "kicker", text: locked ? (lockedPick != null ? "Your prediction" : "The question (no prediction was made)") : first ? "Predict again" : "Predict first" }), h("div", { class: "q", text: preset.q }),
        !locked && first ? h("p", { class: "hint", style: "margin:0;font-size:12.5px", text: "You answered this on " + new Date(first.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ": “" + preset.opts[first.pick] + "”, which " + (first.hit ? "held" : "missed") + ". That first answer is the one the ledger counts; you can run the question again as often as you like." }) : null,
        h("div", { class: "opts", role: "radiogroup" }, preset.opts.map(function (o, i) {
          var r = h("input", { type: "radio", name: "pick-" + exp.id, checked: (locked ? lockedPick : vm.pick) === i, disabled: !!locked });
          r.addEventListener("change", function () { vm.pick = i; paint(vm); });
          return h("label", {}, [r, h("span", { text: o })]);
        }))]));
    }
    // 3. parameters
    if (exp.params.length || exp.scratch) {
      var grid = h("div", { class: "params" }, exp.params.map(function (d) { return paramInput(vm, d); }));
      var seed = h("input", { type: "number", value: String(vm.seed), step: "1", min: "0" }); seed.addEventListener("change", function () { vm.seed = Math.max(0, Math.round(+seed.value) || 0); seed.value = String(vm.seed); });
      var bud = h("input", { type: "number", value: String(vm.budget), step: "10", min: "5", max: "3600" }); bud.addEventListener("change", function () { vm.budget = Math.max(5, Math.min(3600, Math.round(+bud.value) || exp.budget)); bud.value = String(vm.budget); });
      DL.add(grid, [h("label", {}, ["random seed", seed]), h("label", {}, ["time budget (seconds)", bud])]);
      if (exp.scratch) { var ex = h("input", { type: "text", value: vm.extra, class: "mono", style: "font-size:12.5px" }); ex.addEventListener("change", function () { vm.extra = ex.value; }); grid.appendChild(h("label", { style: "grid-column:1/-1" }, ["parameters for lab.p, as JSON, for example {\"lr\": 0.1}", ex])); }
      var det = h("details", { open: vm.openParams || !exp.presets.length }, [h("summary", { class: "linkbtn", style: "cursor:pointer;text-decoration:none", text: preset ? "Parameters (set by the question; changing one makes it a free run)" : "Parameters" }), h("div", { style: "margin-top:8px" }, grid)]);
      det.addEventListener("toggle", function () { vm.openParams = det.open; });
      body.appendChild(det);
    }
    // 4. run bar
    ui.status = h("span", { class: "status" });
    var ref = preset && DL.REF[preset.ref], btns = [];
    if (running) btns.push(h("button", { class: "btn danger", text: "Stop", onclick: function () { stop(vm); } }));
    else {
      var label = (mine ? "Run my edited script" : decided ? (shown.kind === "reference" ? "Run it" : "Run again") : preset ? (vm.pick != null ? "Lock in and run" : "Run without predicting") : "Run") + (E.ready() ? " on my Mac" : " (connects to my Mac first)");
      // a PyTorch experiment and an engine without PyTorch: no run to offer; the recorded run answers the question
      if (!noTorch) btns.push(h("button", { class: (vm.pick != null || !preset || mine) && !decided ? "btn" : "btn ghost", text: label, disabled: E.busy || E.state === "connecting",
        onclick: function () { if (E.ready()) return go(); E.connect().then(function (ok) { if (ok) go(); else paint(vm); }); } }));
      if (ref && !(decided && shown.kind === "reference")) btns.push(h("button", { class: noTorch && !decided ? "btn" : "btn quiet", text: vm.pick != null && !decided && !mine ? "Lock in and show the reference run" : "Show the reference run", onclick: function () { if (decided) vm.pick = shown.pick; else if (mine) vm.pick = null; showReference(vm, preset, ref, !!decided); } }));
    }
    function go() {
      if (exp.lib === "torch" && !E.hasTorch()) return paint(vm);      // the engine turned out to have no PyTorch: the repaint says so
      start(vm);
    }
    body.appendChild(h("div", { class: "runbar" }, btns.concat([ui.status])));
    if (!running && !shown && !(run && run.error)) {
      var takes = (preset && preset.time) || exp.time;      // a preset that is much shorter than the experiment's default run says so
      ui.status.textContent = takes ? "A run takes " + takes + (exp.lib === "torch" ? " on a recent MacBook; it needs PyTorch." : ".") : "";
      var prev = history(exp.id)[0];
      if (prev) body.appendChild(h("div", { class: "runbar" }, [h("span", { class: "status", style: "flex:0 1 auto", text: "Your last run here: " + new Date(prev.data.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) + "." }), h("button", { class: "linkbtn", text: "Show it", onclick: function () { showStored(vm, prev); } })]));
    }
    if (noTorch && !running) ui.status.textContent = "The connected engine's Python has no PyTorch, so this experiment cannot run there" + (ref ? "; the recorded run answers the question" : "") + ". To run it yourself, install PyTorch for the engine: “Mac engine” at the top says how.";
    if (E.busy && !running) ui.status.textContent = "The engine is busy with another run; it runs one at a time.";
    // 5. what is shown
    if (shown && shown.kind !== "live") {
      body.appendChild(h("div", { class: "similar" }, [h("span", { text: shown.kind === "reference" ? "This is the reference run, recorded on " + shown.where + " on " + shown.when + ". It is not a run on your machine." : "Showing your run from " + new Date(shown.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) + "." }),
        h("button", { class: "linkbtn", text: "Clear", onclick: function () { vm.shown = null; vm.pick = null; paint(vm); } })]));
    }
    // 6. curves
    ui.chartHost = h("div", { hidden: true }); body.appendChild(ui.chartHost);
    var curve = running ? run.curve : shown ? shown.curve : run ? run.curve : null;
    drawCurve(vm, curve);
    if (vm.compare && curve && curve.length) body.appendChild(h("div", { class: "runbar" }, [h("span", { class: "status", text: "Dotted lines: an earlier run, for comparison." }), h("button", { class: "linkbtn", text: "Remove the comparison", onclick: function () { vm.compare = null; paint(vm); } })]));
    // 7. the outcome
    if (shown) {
      if (decided && shown.verdict) body.appendChild(verdictBox(preset, shown));
      var tiles = O.tiles(exp.tiles, shown.results); if (tiles) body.appendChild(tiles);
      if (shown.outputs && shown.outputs.length) { var outs = O.render(shown.outputs); vm.cleanup.push(outs.destroy); body.appendChild(outs.el); }
      else if (shown.noOutputs) body.appendChild(h("p", { class: "hint", text: "The pictures and tables of this run were too large to keep. Run it again to see them." }));
      if (shown.kind === "reference" && shown.partial) body.appendChild(h("p", { class: "hint", text: shown.partial }));
    }
    // 8. error
    if (run && run.error && !running) body.appendChild(errorBox(vm, run));
    // 9. log
    var logText = running ? run.log.slice(-60).join("\n") : shown && shown.log ? shown.log.join("\n") : run && run.log ? run.log.slice(-60).join("\n") : "";
    ui.log = h("pre", { class: "log", text: logText });
    ui.logBox = h("details", { hidden: !logText, open: running || (run && run.state === "error") }, [h("summary", { class: "linkbtn", style: "cursor:pointer;text-decoration:none", text: "Log" }), h("div", { style: "margin-top:6px" }, ui.log)]);
    body.appendChild(ui.logBox);
    // 10. asking about it
    var chips = DL.remarks.chipsFor(exp.id, exp.unit), acts = [];
    if (shown || (run && run.error)) acts.push(h("button", { class: "btn ghost small", text: "Ask the tutor about this run", onclick: function () { DL.remarks.compose({ unit: exp.unit, tab: "train", exp: exp.id, q: "", mode: "short" }); } }));
    if (exp.scratch) acts = acts.concat(draftRow(vm));
    if (acts.length || chips.length) body.appendChild(h("div", { class: "runbar" }, acts.concat(chips.length ? [h("span", { class: "status", style: "flex:0 0 auto", text: "Remarks on this experiment:" })].concat(chips) : [])));
    if (running) liveStatus(vm);
  }
  function draftRow(vm) {
    var u = DL.unit(vm.exp.unit), ta = h("textarea", { rows: "3", placeholder: "Describe an experiment, and the tutor drafts the script", "aria-label": "What to try" });
    ta.value = vm.draft != null ? vm.draft : (u && u.status === "planned" && u.task ? u.task : "");
    ta.addEventListener("input", function () { vm.draft = ta.value; });
    return [h("div", { style: "display:grid;gap:6px;flex:1 1 100%" }, [ta, h("div", { class: "runbar" }, [
      h("button", { class: "btn small", text: "Draft a script with the tutor", onclick: function () { if (!ta.value.trim()) return; DL.remarks.compose({ unit: vm.exp.unit, tab: "train", exp: vm.exp.id, q: "Write a script for this lab that does the following. Keep it small enough to run in about a minute on a laptop.\n\n" + ta.value.trim(), mode: "code", go: true }); } }),
      h("span", { class: "status", text: "The draft appears in the margin, with a button that puts it into the editor. Read it before you run it." })])])];
  }
  function verdictBox(preset, shown) {
    var v = shown.verdict, pick = shown.pick, box;
    if (v.answer == null) box = h("div", { class: "verdict" }, [h("div", { class: "vh", text: "This run does not decide the question." }), v.text ? h("div", { text: v.text }) : null]);
    else {
      var hit = pick != null ? pick === v.answer : null;
      box = h("div", { class: "verdict" + (hit === true ? " hit" : hit === false ? " miss" : "") }, [
        h("div", { class: "vh", text: hit === true ? "Your prediction held." : hit === false ? "Not what you predicted." : "What happened" }),
        pick != null && hit === false ? h("div", {}, [h("span", { class: "kicker", text: "You said " }), preset.opts[pick]]) : null,
        h("div", {}, [h("span", { class: "kicker", text: "It was " }), h("b", { text: preset.opts[v.answer] })]),
        h("div", { text: v.text })]);
    }
    box.appendChild(h("div", { class: "kicker", style: "margin-top:4px", text: "Why" }));
    box.appendChild(DL.md(preset.why, "after"));
    return box;
  }
  function showReference(vm, preset, ref, seen) {
    var v = judge(vm, preset, ref.results, ref.curve);
    vm.shown = { kind: "reference", results: ref.results, curve: ref.curve || [], outputs: ref.outputs || [], log: ref.log || [], pick: vm.pick, verdict: v, presetId: preset.id, where: ref.where, when: ref.when, partial: ref.note || "" };
    if (vm.pick != null && v.answer != null && !seen) ledgerAdd({ at: Date.now(), exp: vm.exp.id, preset: preset.id, pick: vm.pick, answer: v.answer, hit: vm.pick === v.answer, ref: true });
    if (vm.run && vm.run.state !== "running") vm.run = null;
    paint(vm); showOutcome(vm);
  }
  /** Show a stored run again. A run of an edited script is shown without a verdict: the question was not about it. */
  function showStored(vm, d) {
    var exp = vm.exp, r = d.data, p = null;
    if (!r.edited) exp.presets.forEach(function (x) { if (x.id === r.preset) p = x; });
    vm.presetId = p ? p.id : null;
    vm.params = paramDefaults(exp, null); for (var pk in r.params) if (pk in vm.params) vm.params[pk] = r.params[pk];
    vm.shown = { kind: "history", at: r.at, results: r.results, curve: r.curve || [], outputs: r.outputs || [], log: r.log || [], pick: p ? r.pick : null, verdict: p ? judge(vm, p, r.results, r.curve) : null, presetId: p ? p.id : null, noOutputs: r.noOutputs };
    if (vm.run && vm.run.state !== "running") vm.run = null;
    vm.tab = "run"; paint(vm);
  }
  function errorBox(vm, run) {
    var e = run.error, tb = (e.traceback || "").trim(), lines = tb.split("\n"), headline = run.state === "stopped" ? "Stopped." : tb ? lines[lines.length - 1] : e.message;
    var inRuntime = e.line > run.userLines, box = h("div", { class: "err" }, [h("b", { text: run.state === "stopped" ? "The run was stopped" : "The run failed" }), h("div", { text: headline })]);
    if (run.state !== "stopped" && e.line) box.appendChild(h("div", { class: "hint", text: inRuntime ? "The error surfaced inside the lab's runtime, which usually means a lab.… call got an argument of the wrong shape or type." : "It happened at line " + e.line + " of the script." }));
    if (tb && run.state !== "stopped") box.appendChild(h("pre", { text: tb }));
    var acts = [];
    if (run.state !== "stopped") {
      if (e.line && !inRuntime) acts.push(h("button", { class: "btn quiet small", text: "Show line " + e.line, onclick: function () { vm.tab = "code"; vm.markLine = e.line; paint(vm); } }));
      if (tb || e.line) acts.push(h("button", { class: "btn ghost small", text: "Ask the tutor to find the cause", onclick: function () { DL.remarks.compose({ unit: vm.exp.unit, tab: "train", exp: vm.exp.id, q: "The last run of this script failed. Find the cause, explain it, and give the corrected script.", mode: "code", go: true }); } }));
    }
    if (acts.length) box.appendChild(h("div", { class: "runbar" }, acts));
    return box;
  }
  function paintCode(vm, body) {
    var resetBtn = h("button", { class: "btn quiet small", text: "Reset to the original", hidden: !edited(vm), onclick: function () { resetCode(vm); } });
    var exp = vm.exp, ed = Editor(vm.code, DL.debounce(function (v) { vm.code = v; saveCode(vm); resetBtn.hidden = !edited(vm); var t = host && host.querySelector('.exp[data-exp="' + exp.id + '"] .exp-tabs button:nth-child(2)'); if (t) t.firstChild.textContent = "Code" + (edited(vm) ? " (edited)" : ""); }, 300));
    vm.ui.editor = ed;
    function flush() { vm.code = ed.get(); saveCode(vm); }
    var bar = h("div", { class: "code-bar" }, [
      h("button", { class: "btn quiet small", text: "Copy", onclick: function () { flush(); DL.copyOrShow(vm.code, "Script"); } }),
      h("button", { class: "btn quiet small", text: "Copy as one runnable file", title: "The script with the lab's runtime appended: python file.py runs it without the page", onclick: function () { flush(); DL.copyOrShow(vm.code.replace(/\n*$/, "\n") + "\n" + DL.LABRT + "\n" + DL.STANDALONE, "Runnable file"); } }),
      h("button", { class: "btn quiet small", text: "Save as .txt", onclick: function () { flush(); DL.save(exp.id + ".py.txt", vm.code); } }),
      resetBtn,
      h("span", { class: "sp" }),
      h("button", { class: "btn ghost small", text: "Explain this script", onclick: function () { flush(); DL.remarks.compose({ unit: exp.unit, tab: "train", exp: exp.id, q: "Explain what this script does, part by part, and which statement of the notes each part implements.", mode: "code", go: true }); } }),
      h("button", { class: "btn ghost small", text: "Ask about the selected lines", onclick: function () { flush(); var s = ed.selection(); if (!s.trim()) return DL.toast("Select some lines of the script first."); DL.remarks.compose({ unit: exp.unit, tab: "train", exp: exp.id, quote: s.slice(0, 1500), src: "code", mode: "code" }); } }),
      h("button", { class: "btn ghost small", text: "Have it changed…", onclick: function () { flush(); DL.remarks.compose({ unit: exp.unit, tab: "train", exp: exp.id, q: "", mode: "code" }); var q = $("#m-q"); if (q) q.placeholder = "Describe the change, for example: add dropout 0.1 and report the gap between training and validation loss"; } })]);
    body.appendChild(bar); body.appendChild(ed.el);
    body.appendChild(h("p", { class: "hint", text: "The script defines run(lab). The page appends a small runtime after it and sends both to the engine, so line numbers in error messages are the ones you see here. Edits are kept; “Run” on the Run tab uses the script as it stands." + (exp.scratch ? "" : " The questions on the Run tab are about the script as it came: with an edited script a run is a free run.") }));
    if (vm.markLine) { ed.mark(vm.markLine); vm.markLine = 0; }
  }
  function paintHistory(vm, body) {
    var exp = vm.exp, list = history(exp.id);
    if (!list.length) { body.appendChild(h("p", { class: "hint", text: "No runs yet. Each finished run is kept here (the latest eight), so that you can look at it again or lay its curve under a new one." })); return; }
    list.forEach(function (d) {
      var r = d.data, pname = r.preset ? nameOfPreset(exp, r.preset) : "Free run", diff = [], def = paramDefaults(exp, null), k;
      for (k in r.params) if (def[k] !== undefined && def[k] !== r.params[k]) diff.push(k.replace(/_/g, " ") + " = " + r.params[k]);
      var head = (exp.tiles.length ? exp.tiles : Object.keys(r.results || {}).map(function (x) { return { k: x, label: x }; })).filter(function (t) { return r.results && t.k in r.results && typeof r.results[t.k] === "number"; }).slice(0, 2).map(function (t) { return t.label + " " + DL.num(r.results[t.k]); });
      body.appendChild(h("div", { class: "rcard", style: "cursor:default" }, [
        h("span", { class: "rt" }, [new Date(r.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), h("em", { text: DL.secs(r.secs) + (r.engine && r.engine.device ? " on " + r.engine.device : "") + (r.edited ? " · edited script" : "") + " · seed " + r.seed })]),
        h("span", { class: "rq", text: pname + (diff.length ? " · " + diff.join(", ") : "") }),
        h("span", { class: "rs", text: head.join(" · ") }),
        h("span", { class: "runbar" }, [
          h("button", { class: "btn quiet small", text: "Show", onclick: function () { showStored(vm, d); } }),
          r.curve && r.curve.length ? h("button", { class: "btn quiet small", text: vm.compare === d.id ? "Comparing" : "Compare with the next run", onclick: function () { vm.compare = vm.compare === d.id ? null : d.id; paint(vm); } }) : null,
          h("button", { class: "linkbtn muted", text: "Delete", onclick: function () { if (vm.compare === d.id) vm.compare = null; DL.store.del(d.id); paint(vm); } })])]));
    });
  }

  /* ---------- the tab ---------- */
  T.render = function (el, unit) {
    T.dispose(); host = el; unitId = unit;
    var u = DL.unit(unit), exps = DL.expsOf(unit), card = engineCard();
    el.appendChild(card.el);
    var off = function () { card.fill(); exps.forEach(function (x) { var vm = vms[x.id]; if (vm && vm.tab === "run" && !(vm.run && vm.run.state === "running")) paint(vm); }); };
    E.listeners.push(off); disposers.push(function () { var i = E.listeners.indexOf(off); if (i >= 0) E.listeners.splice(i, 1); });
    if (u.status === "planned") el.appendChild(h("div", { class: "planned" }, [h("span", { class: "kicker", text: "This week's experiments are not built yet" }), h("p", { style: "margin:0", text: u.task || "" }), h("p", { class: "hint", text: "The scratch bench below works now: describe what you want to try and the tutor drafts a script for the engine." })]));
    exps.forEach(function (exp) {
      var vm = vmOf(exp);
      el.appendChild(h("section", { class: "exp" + (exp.scratch ? " scratch" : ""), "data-exp": exp.id, id: "exp-" + exp.id }, [
        h("div", { class: "exp-h" }, [
          h("div", { class: "exp-tags" }, [exp.scratch ? null : h("span", { class: "tag", text: exp.lib === "torch" ? "PyTorch · Apple GPU" : "numpy · CPU" }), h("span", { class: "tag " + (exp.data.kind === "real" ? "real" : "sim"), text: exp.data.kind === "real" ? "Real data" : "Simulated data" }), exp.time ? h("span", { class: "tag", text: exp.time }) : null]),
          h("h3", { text: exp.title }), DL.md(exp.desc, "exp-desc"),
          h("p", { class: "hint", style: "font-size:12.5px" }, [h("b", { text: "Data. " }), exp.data.text])]),
        h("div", { class: "exp-tabs", role: "tablist" }), h("div", { class: "exp-body" })]));
      paint(vm);
    });
    if (DL.pref("engine.ok") && E.state === "unknown" && DL.HOSTED) E.connect();
  };
  /** Forget cached card state (used when saved work arrives after the first paint), except runs in progress */
  T.reset = function () { for (var id in vms) if (!(vms[id].run && vms[id].run.state === "running")) delete vms[id]; };
  T.dispose = function () { for (var id in vms) clean(vms[id]); disposers.forEach(function (f) { f(); }); disposers = []; host = null; };
  T.repaint = function () { if (!host) return; DL.expsOf(unitId).forEach(function (x) { var vm = vms[x.id]; if (vm && !(vm.run && vm.run.state === "running") && vm.tab !== "code") paint(vm); }); };
  T.focus = function (expId) { var c = host && host.querySelector('.exp[data-exp="' + expId + '"]'); if (c) c.scrollIntoView({ block: "start" }); };
  /** What the tutor needs to know about an experiment */
  T.context = function (expId) {
    var exp = DL.exp(expId); if (!exp) return null;
    var vm = vmOf(exp), run = vm.run, last = run && (run.state === "done" || run.state === "error") ? run : null, hist = history(expId)[0];
    if (vm.ui && vm.ui.editor) vm.code = vm.ui.editor.get();
    var res = last && last.results ? last.results : hist ? hist.data.results : null, curve = last && last.curve && last.curve.length ? last.curve : hist ? hist.data.curve : null;
    return { title: exp.title, desc: exp.desc, data: (exp.data.kind === "real" ? "real: " : "simulated: ") + exp.data.text, script: vm.code,
      params: last ? last.params : hist ? hist.data.params : null, results: res, curve: curve && curve.length ? curve.slice(-6) : null,
      log: last && last.log ? last.log.slice(-25).join("\n") : hist && hist.data.log ? hist.data.log.slice(-25).join("\n") : "",
      error: last && last.error ? (last.error.traceback || last.error.message) + (last.error.line ? "\n(line " + last.error.line + ")" : "") : "" };
  };
  /** The tutor's script goes into the editor (the reader reads it there before running it) */
  T.setCode = function (expId, code, rem) {
    var exp = DL.exp(expId); if (!exp) return;
    var vm = vmOf(exp); if (vm.ui && vm.ui.editor) vm.code = vm.ui.editor.get();
    var old = vm.code;
    putCode(vm, code.replace(/\s+$/, "") + "\n"); vm.tab = "code";
    if (DL.goExperiment) DL.goExperiment(exp, function () { paint(vm); T.focus(expId); }); else paint(vm);
    DL.toast("The script is in the editor. Read it, then run it from the Run tab.", "Undo", function () { putCode(vm, old); paint(vm); });
  };
})();
