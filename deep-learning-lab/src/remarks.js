// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* The margin: questions asked in place, kept where they were asked.
 * Select text in the notes, in an answer, in an experiment's description or output; press Ask. The question and its
 * answer become a remark anchored to that block (R1, R2, ... per unit). Answers are short first; "Go deeper" asks for
 * the long one. Follow-ups continue the thread, and a selection inside an answer becomes a follow-up about that passage.
 * One remark is one stored document "r-<id>":
 *   { at, unit, tab: "read" | "train", bk: block key | null, exp: experiment id | null, quote, src: "notes" | "code" | "run" | "",
 *     entries: [{ q, quote?, mode, short, long, err?, cut?, at }], memo } */
(function () {
  "use strict";
  var h = DL.h, $ = DL.$;
  var R = DL.remarks = { unit: null };
  var view = { mode: "list", id: null, draft: null, scope: "unit", query: "" };
  var busy = null;      // { id, idx, mode, handle, text }
  var QUICK = ["Explain this.", "Why is this true?", "Give a concrete example.", "Where does this stop being true?"];

  /* ---------- data ---------- */
  function all() { return DL.store.list("r-").map(function (d) { d.data.id = d.id; return d.data; }); }
  R.forUnit = function (unit) { return all().filter(function (r) { return r.unit === unit; }).sort(function (a, b) { return a.at - b.at; }); };
  R.get = function (id) { var d = DL.store.get(id); if (d) d.id = id; return d; };
  R.number = function (rem) { var list = R.forUnit(rem.unit); for (var i = 0; i < list.length; i++) if (list[i].id === rem.id) return i + 1; return 0; };
  R.count = function (unit) { return R.forUnit(unit).length; };
  function save(rem) {
    var copy = DL.clone(rem); delete copy.id;
    if (!DL.store.put(rem.id, copy)) DL.toast("This thread has grown too long to save. Start a new remark for further questions.");
    if (DL.onRemarksChanged) DL.onRemarksChanged();
  }
  function unitLabel(id) { var u = DL.unit(id); return u ? "Week " + u.week : ""; }
  function tokens(s) { return String(s || "").toLowerCase().replace(/\$[^$]*\$/g, " ").split(/[^a-z0-9]+/).filter(function (w) { return w.length > 2 && !STOP[w]; }); }
  var STOP = {}; "the and for that this with from are was not but why how what does can you have has its into than then when where which one all any about your our their there here use used using".split(" ").forEach(function (w) { STOP[w] = 1; });
  function norm(t) { return String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  /** Earlier remarks that ask nearly the same thing about nearly the same text (score 1: word for word the same) */
  function similar(q, quote) {
    var a = {}, n = 0, nq = norm(q), nquote = norm(quote); tokens(q + " " + (quote || "")).forEach(function (w) { if (!a[w]) { a[w] = 1; n++; } });
    if (!nq && !nquote) return [];
    return all().map(function (r) {
      var b = {}, m = 0, both = 0;
      if (nq && norm(r.quote) === nquote && r.entries.some(function (e) { return norm(e.q) === nq; })) return { r: r, score: 1 };
      tokens(r.entries.map(function (e) { return e.q; }).join(" ") + " " + r.quote).forEach(function (w) { if (!b[w]) { b[w] = 1; m++; if (a[w]) both++; } });
      return { r: r, score: n < 2 ? 0 : both / Math.max(1, n + m - both) };
    }).filter(function (x) { return x.score >= 0.42; }).sort(function (x, y) { return y.score - x.score; }).slice(0, 2);
  }
  /** With a keyboard, Enter sends and Shift+Enter makes a new line; Enter that only confirms an input-method
   *  composition does neither. On a touch keyboard Enter stays a new line and the button sends. */
  var ENTER_SENDS = !(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  function sendOnEnter(ta, send) {
    if (!ENTER_SENDS) return;
    ta.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" || ev.shiftKey || ev.altKey || ev.isComposing || ev.keyCode === 229) return;
      ev.preventDefault(); send();
    });
    ta.title = "Enter sends. Shift+Enter starts a new line.";
  }

  /* ---------- asking ---------- */
  function ask(rem, idx, mode, fresh) {
    if (busy) busy.handle.abort();
    var e = rem.entries[idx]; delete e.err; delete e.errMode; delete e.cut;
    var handle = DL.tutor.ask({ turns: DL.tutor.turns(rem, idx, mode), mode: mode, fresh: fresh, onText: function (t) { if (busy && busy.handle === handle) { busy.text = t; paintPartial(); } } });
    busy = { id: rem.id, idx: idx, mode: mode, handle: handle, text: "" };
    handle.promise.then(function (res) {
      if (!busy || busy.handle !== handle) return;
      busy = null;
      if (mode === "deep") e.long = res.text; else e.short = res.text;
      if (res.truncated) e.cut = true;
      save(rem); render();
    }, function (err) {
      if (!busy || busy.handle !== handle) return;
      busy = null;
      if (err.code !== "cancelled") { e.err = err.message; e.errMode = mode; }
      else if (mode !== "deep" && !e.short) { e.err = "Stopped."; e.errMode = mode; }
      save(rem); render();
    });
    render();
  }
  var raf = 0;
  function paintPartial() {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; var el = $("#m-live"); if (el && busy) { QLMD.mountPartial(el, busy.text); var w = $("#m-wait"); if (w) w.hidden = !!busy.text; } });
  }
  /** Start a new remark. o: { unit, tab, bk, exp, quote, src, q, mode, go } ; go = ask immediately */
  R.compose = function (o) {
    view = { mode: "compose", id: null, draft: { unit: o.unit || R.unit, tab: o.tab || "read", bk: o.bk || null, exp: o.exp || null, quote: o.quote || "", src: o.src || "", q: o.q || "", mode: o.mode || "short" }, scope: view.scope, query: "" };
    openPanel();
    if (o.go && o.q) {
      var twin = similar(o.q, o.quote || "").filter(function (x) { return x.score === 1 && x.r.unit === view.draft.unit && (x.r.exp || null) === view.draft.exp && !o.again; })[0];
      if (twin && o.mode !== "code") { R.open(twin.r.id); DL.toast("You asked this before: this is that remark (R" + R.number(twin.r) + ").", "Ask again anyway", function () { o.again = true; R.compose(o); }); return; }
      return submitDraft();
    }
    render();
    var ta = $("#m-q"); if (ta) ta.focus();
  };
  function submitDraft(asNote) {
    var d = view.draft, q = (d.q || "").trim();
    if (!q && !asNote) return;
    var rem = { id: "r-" + DL.uid(), at: Date.now(), unit: d.unit, tab: d.tab, bk: d.bk, exp: d.exp, quote: d.quote, src: d.src, entries: [], memo: asNote ? q : "" };
    if (!asNote) rem.entries.push({ q: q, mode: d.mode, short: "", long: "", at: Date.now() });
    save(rem);
    view = { mode: "thread", id: rem.id, draft: null, scope: view.scope, query: "" };
    if (!asNote && DL.tutor.state !== "absent") ask(rem, 0, d.mode === "code" ? "code" : d.mode === "deep" ? "deep" : "short"); else render();
  }
  function followUp(rem, q, quote, deep) {
    q = (q || "").trim(); if (!q) return;
    var mode = rem.exp && /script|code|change|write|fix|bug|error|add |modify|implement/i.test(q) ? "code" : deep ? "deep" : "short";
    rem.entries.push({ q: q, quote: quote || "", mode: mode, short: "", long: "", at: Date.now() });
    save(rem);
    if (DL.tutor.state !== "absent") ask(rem, rem.entries.length - 1, mode); else render();
  }
  R.open = function (id) { if (!R.get(id)) return; var fq = $("#m-fq"); if (fq && view.id !== id) fq.value = ""; view = { mode: "thread", id: id, draft: null, scope: view.scope, query: "", fdraft: "", fquote: "" }; openPanel(); render(); };
  R.setUnit = function (unit) { R.unit = unit; if (view.mode === "thread") { var r = R.get(view.id); if (r && r.unit === unit) return render(); } if (view.mode !== "compose") view = { mode: "list", id: null, draft: null, scope: view.scope, query: view.query }; render(); };
  R.refresh = function () { render(); };

  /* ---------- panel open / closed ---------- */
  function narrow() { return window.matchMedia && window.matchMedia("(max-width: 900px)").matches; }
  function openPanel() { var m = $("#margin"), app = $("#app"); if (narrow()) m.classList.add("open"); else { app.classList.remove("mc"); DL.pref("margin.closed", 0); } }
  function closePanel() { var m = $("#margin"), app = $("#app"); if (narrow()) m.classList.remove("open"); else { app.classList.add("mc"); DL.pref("margin.closed", 1); } }
  R.toggle = function () { var m = $("#margin"); if (narrow()) m.classList.toggle("open"); else if ($("#app").classList.contains("mc")) openPanel(); else closePanel(); };

  /* ---------- rendering ---------- */
  function iconBtn(label, text, fn) { return h("button", { class: "iconbtn", "aria-label": label, title: label, text: text, onclick: fn }); }
  function render() {
    var head = $("#m-head"), body = $("#m-body"); if (!head || !body) return;
    var n = R.unit ? R.count(R.unit) : 0;
    var c1 = $("#margin-count"), c2 = $("#m-rail-count"); if (c1) c1.textContent = n ? String(n) : ""; if (c2) c2.textContent = n ? String(n) : "";
    var oldQ = $("#m-fq"), oldMemo = $("#m-memo");
    if (oldQ) view.fdraft = oldQ.value;
    if (oldMemo && view.mode === "thread") { var cur = R.get(view.id); if (cur && cur.memo !== oldMemo.value) { cur.memo = oldMemo.value; var cp = DL.clone(cur); delete cp.id; DL.store.put(cur.id, cp); } }
    DL.clear(head); DL.clear(body);
    var close = iconBtn("Hide the margin", narrow() ? "✕" : "»", closePanel);
    if (view.mode === "thread") {
      var rem = R.get(view.id);
      if (!rem) { view.mode = "list"; return render(); }
      head.appendChild(h("div", { class: "row" }, [h("button", { class: "linkbtn", style: "flex:0 0 auto;text-decoration:none", "aria-label": "Back to all remarks", text: "← All remarks", onclick: function () { view.mode = "list"; render(); } }), h("h3", { text: "R" + R.number(rem) + " · " + unitLabel(rem.unit) }), close]));
      renderThread(body, rem);
    } else if (view.mode === "compose") {
      head.appendChild(h("div", { class: "row" }, [iconBtn("Cancel", "←", function () { view.mode = "list"; render(); }), h("h3", { text: "New question" }), close]));
      renderCompose(body);
    } else {
      head.appendChild(h("div", { class: "row" }, [h("h3", { text: "Remarks" }), close]));
      var search = h("input", { type: "search", placeholder: "Search your remarks", "aria-label": "Search your remarks", value: view.query });
      search.addEventListener("input", function () { view.query = search.value; renderList($("#m-list")); });
      head.appendChild(h("div", { class: "chips" }, [
        h("button", { class: "chip", "aria-pressed": String(view.scope === "unit"), text: "This unit", onclick: function () { view.scope = "unit"; render(); } }),
        h("button", { class: "chip", "aria-pressed": String(view.scope === "all"), text: "All units", onclick: function () { view.scope = "all"; render(); } })]));
      head.appendChild(search);
      var q = h("textarea", { rows: "2", placeholder: R.unit ? "Ask the tutor about " + unitLabel(R.unit).toLowerCase() + "…" : "Ask the tutor…", "aria-label": "Question for the tutor" });
      var sendTyped = function () {
        if (!q.value.trim()) return;
        if (DL.tutor.state === "absent") { view.draft = { unit: R.unit || "u1", tab: "read", bk: null, exp: null, quote: "", src: "", q: q.value, mode: "short" }; return submitDraft(true); }
        R.compose({ unit: R.unit || "u1", q: q.value, go: true });
      };
      sendOnEnter(q, sendTyped);
      body.appendChild(h("div", { style: "display:grid;gap:6px" }, [q, h("div", { class: "runbar" }, [h("button", { class: "btn small", text: DL.tutor.state === "absent" ? "Keep as a note" : "Ask", onclick: sendTyped }), tutorNote() || (ENTER_SENDS ? h("span", { class: "status", text: "Enter sends" }) : null)])]));
      body.appendChild(h("div", { id: "m-list", style: "display:grid;gap:8px" }));
      renderList($("#m-list"));
      body.appendChild(h("p", { class: "hint", style: "margin-top:auto;font-size:12px" }, DL.storeNote("", DL.store.slow ? ". Earlier remarks are still loading." : ".")));
    }
    DL.markScroll(body);
  }
  /** One line for a preview: Markdown marks and line breaks removed (outside formulas), display formulas made inline,
   *  cut at about n characters but never inside a formula */
  function clip(text, n) {
    var t = String(text || "").replace(/```[\s\S]*?```/g, " ").replace(/\$\$([\s\S]+?)\$\$/g, function (_, x) { return "$" + x.replace(/\s+/g, " ").trim() + "$"; });
    t = t.split(/(\$[^$\n]+?\$)/).map(function (part, i) { return i % 2 ? part : part.replace(/^\s*(?:#{1,6}|[-*+]|\d+\.)\s+/gm, "").replace(/\*\*|__|[*`]/g, ""); }).join("").replace(/\s+/g, " ").trim();
    if (t.length <= n) return t;
    var cut = t.slice(0, n).replace(/\s+\S*$/, "");
    if ((cut.match(/\$/g) || []).length % 2) cut = cut.slice(0, cut.lastIndexOf("$"));
    return cut.trim() + "…";
  }
  function tutorNote() {
    if (DL.tutor.state !== "absent") return null;
    return h("span", { class: "status", text: "The tutor needs Claude: it answers when this page is open as an artifact in Claude. Here you can still keep notes." });
  }
  function renderList(box) {
    if (!box) return; DL.clear(box);
    var list = (view.scope === "all" ? all().sort(function (a, b) { return b.at - a.at; }) : R.forUnit(R.unit).reverse());
    var words = tokens(view.query);
    if (words.length) list = list.filter(function (r) { var hay = (r.quote + " " + r.memo + " " + r.entries.map(function (e) { return e.q + " " + e.short + " " + e.long; }).join(" ")).toLowerCase(); return words.every(function (w) { return hay.indexOf(w) >= 0; }); });
    if (!list.length) {
      box.appendChild(h("p", { class: "hint", text: words.length ? "No remark matches." : "Nothing here yet. Select any text in the notes, in an experiment or in an answer and press Ask. The question and its answer stay in this margin, attached to the line they are about." }));
      return;
    }
    list.forEach(function (r) {
      var e = r.entries[0], ans = e ? (e.short || e.long || "") : r.memo, title = e ? e.q : "Note";
      // "Explain this." says nothing by itself: add the beginning of the passage it was asked about
      if (e && r.quote && (QUICK.indexOf(e.q) >= 0 || e.q.length < 28)) title = e.q.replace(/[.?!]$/, "") + ": " + clip(r.quote, 70);
      box.appendChild(h("button", { class: "rcard", onclick: function () { R.open(r.id); } }, [
        h("span", { class: "rt" }, ["R" + R.number(r), h("em", { text: unitLabel(r.unit) + (r.exp ? " · experiment" : "") + " · " + DL.ago(r.at) })]),
        DL.fillTex(h("span", { class: "rq" }), title),
        ans ? DL.fillTex(h("span", { class: "rs" }), clip(ans, 160)) : null]));
    });
  }
  function renderCompose(body) {
    var d = view.draft;
    if (d.quote) body.appendChild(quote(d.quote, d.src));
    var ta = h("textarea", { id: "m-q", rows: "3", placeholder: d.quote ? "What do you want to know about this?" : "Your question", "aria-label": "Your question" }); ta.value = d.q;
    var simBox = h("div", {});
    function sims() {
      DL.clear(simBox); var s = similar(ta.value, d.quote); if (!s.length) return;
      simBox.appendChild(h("div", { class: "similar" }, [h("span", { class: "ans-kind", text: "You asked something close to this before" })].concat(s.map(function (x) {
        return h("button", { onclick: function () { R.open(x.r.id); } }, [x.r.entries[0] ? x.r.entries[0].q : "Note", " ", h("span", { text: "R" + R.number(x.r) + " · " + unitLabel(x.r.unit) })]);
      }))));
    }
    ta.addEventListener("input", DL.debounce(function () { d.q = ta.value; sims(); }, 250));
    sendOnEnter(ta, function () { d.q = ta.value; submitDraft(); });
    var deep = h("input", { type: "checkbox", checked: d.mode === "deep" }); deep.addEventListener("change", function () { d.mode = deep.checked ? "deep" : "short"; });
    body.appendChild(ta);
    if (d.quote && d.mode !== "code") body.appendChild(h("div", { class: "chips" }, QUICK.map(function (t) { return h("button", { class: "chip", text: t, onclick: function () { d.q = t; submitDraft(); } }); })));
    body.appendChild(simBox);
    body.appendChild(h("div", { class: "runbar" }, [
      h("button", { class: "btn", text: "Ask", disabled: DL.tutor.state === "absent", onclick: function () { d.q = ta.value; submitDraft(); } }),
      d.mode !== "code" ? h("label", { style: "display:flex;gap:6px;align-items:center;font-size:12.5px;color:var(--ink-2)" }, [deep, "answer in depth right away"]) : null,
      h("button", { class: "linkbtn muted", text: "Keep as my own note", onclick: function () { d.q = ta.value; if (d.q.trim() || d.quote) submitDraft(true); } })]));
    if (DL.tutor.state === "absent") body.appendChild(h("div", { class: "similar" }, [h("span", { text: "The tutor answers when this page is open as an artifact in Claude. Here you can copy the question with its context and paste it into any chat." }),
      h("button", { class: "linkbtn", text: "Copy the question with its context", onclick: function () { d.q = ta.value; var fake = { unit: d.unit, exp: d.exp, quote: d.quote, src: d.src, entries: [{ q: d.q || "Explain this." }] }; DL.copyOrShow(DL.tutor.asText(fake, 0, "deep"), "Question"); } })]));
    else body.appendChild(h("p", { class: "hint", style: "font-size:12px", text: "Answers come from Claude on your own plan. The short answer comes first; ask for depth when you want it." }));
    sims();
  }
  function ansEl(text, cls) { var d = DL.md(text, cls || "ans"); return d; }
  function quote(text, src) { return src === "code" ? h("blockquote", { class: "quote code", text: text }) : DL.quoteEl(text, "quote"); }
  function renderThread(body, rem) {
    var u = DL.unit(rem.unit), ex = rem.exp && DL.exp(rem.exp);
    function go() { if (narrow()) closePanel(); if (DL.goRemark) DL.goRemark(rem); }
    body.appendChild(h("div", { class: "runbar", style: "font-size:12.5px;color:var(--ink-2)" }, [
      h("span", { text: "On " + (ex ? "the experiment “" + ex.title + "”" : u ? "the week " + u.week + " notes" + (rem.bk ? "" : ", not tied to a line") : "the page") }),
      ex ? h("button", { class: "linkbtn", text: "Go to the experiment", onclick: go }) : rem.bk ? h("button", { class: "linkbtn", text: "Show the place", onclick: go }) : u && rem.unit !== R.unit ? h("button", { class: "linkbtn", text: "Open week " + u.week, onclick: go }) : null]));
    if (rem.quote) body.appendChild(quote(rem.quote, rem.src));
    rem.entries.forEach(function (e, idx) {
      var live = busy && busy.id === rem.id && busy.idx === idx, box = h("div", { class: "entry" });
      box.appendChild(h("div", { class: "qline" }, [h("span", { class: "k", text: "Q" }), DL.fillTex(h("span", { class: "t" }), e.q)]));
      if (e.quote) box.appendChild(quote(e.quote, ""));
      function liveBlock() {
        var el = h("div", { class: "ans", id: "m-live" }); if (busy.text) QLMD.mountPartial(el, busy.text);
        return [h("div", { class: "thinking", id: "m-wait", hidden: !!busy.text }, [h("i", { class: "spin" }), busy.mode === "short" ? "Thinking…" : "Thinking. A long answer can take a minute to start…"]), el,
          h("div", {}, h("button", { class: "btn quiet small", text: "Stop", onclick: function () { busy.handle.abort(); } }))];
      }
      if (live && busy.mode !== "deep") DL.add(box, liveBlock());
      else if (e.short) box.appendChild(ansEl(e.short));
      if (e.short || e.long) {
        if (live && busy.mode === "deep") box.appendChild(h("div", { class: "deeper" }, [h("span", { class: "ans-kind", text: "In depth" })].concat(liveBlock())));
        else if (e.long) box.appendChild(h("div", { class: "deeper" }, [h("span", { class: "ans-kind", text: "In depth" }), ansEl(e.long)]));
      } else if (live && busy.mode === "deep") DL.add(box, liveBlock());
      if (e.cut && !live) box.appendChild(h("p", { class: "hint", style: "font-size:12px", text: "This answer was cut short. Ask for less at a time, or ask it to continue." }));
      if (e.err && !live) box.appendChild(h("div", { class: "runbar" }, [h("span", { class: "status", style: "color:var(--warn)", text: e.err }), DL.tutor.state !== "absent" ? h("button", { class: "btn quiet small", text: "Retry", onclick: function () { ask(rem, idx, e.errMode || (e.mode === "code" ? "code" : e.mode === "deep" ? "deep" : "short"), true); } }) : null]));
      if (!live) {
        var acts = [];
        if (e.short && !e.long && e.mode !== "code" && e.mode !== "deep" && DL.tutor.state !== "absent") acts.push(h("button", { class: "btn ghost small", text: "Go deeper", onclick: function () { ask(rem, idx, "deep"); } }));
        var code = rem.exp ? DL.tutor.codeIn(e.long) || DL.tutor.codeIn(e.short) : null;
        if (code) acts.push(h("button", { class: "btn small", text: "Put this script in the editor", onclick: function () { if (DL.train) DL.train.setCode(rem.exp, code, rem); } }));
        if (acts.length) box.appendChild(h("div", { class: "runbar" }, acts));
      }
      body.appendChild(box);
    });
    if (!rem.entries.length && !rem.memo) body.appendChild(h("p", { class: "hint", text: "A note without a question yet." }));
    // follow-up
    var fq = h("textarea", { id: "m-fq", rows: "2", placeholder: view.fquote ? "Ask about the selected part of the answer…" : rem.entries.length ? "Ask a follow-up…" : "Ask a question about this…", "aria-label": "Follow-up question" });
    fq.value = view.fdraft || "";
    var deep = h("input", { type: "checkbox" });
    function send() { if (!fq.value.trim() || busy) return; var q = fq.value, quote = view.fquote || ""; view.fdraft = ""; view.fquote = ""; fq.value = ""; followUp(rem, q, quote, deep.checked); }
    sendOnEnter(fq, send);
    body.appendChild(h("div", { style: "display:grid;gap:6px" }, [
      view.fquote ? quote(view.fquote, "") : null,
      view.fquote ? h("button", { class: "linkbtn muted", style: "justify-self:start", text: "Ask about the whole thread instead", onclick: function () { view.fquote = ""; render(); } }) : null,
      fq, h("div", { class: "runbar" }, [
        h("button", { class: "btn small", text: "Ask", disabled: DL.tutor.state === "absent" || !!busy, onclick: send }),
        h("label", { style: "display:flex;gap:6px;align-items:center;font-size:12.5px;color:var(--ink-2)" }, [deep, "in depth"]), tutorNote()])]));
    // the reader's own note
    var memo = h("textarea", { id: "m-memo", rows: "2", placeholder: "Your own note on this (saved with the remark)", "aria-label": "Your own note" }); memo.value = rem.memo || "";
    memo.addEventListener("input", DL.debounce(function () { rem.memo = memo.value; save(rem); }, 600));
    body.appendChild(memo);
    var del = h("div", { class: "runbar" });
    function delIdle() { DL.clear(del); del.appendChild(h("button", { class: "linkbtn muted", text: "Delete this remark", onclick: function () { DL.clear(del); DL.add(del, [h("span", { class: "status", text: "Delete this remark and its answers?" }), h("button", { class: "btn danger small", text: "Delete", onclick: function () { if (busy && busy.id === rem.id) { busy.handle.abort(); busy = null; } DL.store.del(rem.id); view.mode = "list"; if (DL.onRemarksChanged) DL.onRemarksChanged(); render(); } }), h("button", { class: "btn quiet small", text: "Keep", onclick: delIdle })]); } })); }
    delIdle(); body.appendChild(del);
    DL.linkSections(body, rem.unit);
  }

  /* ---------- chips next to the blocks of the notes ---------- */
  R.decorate = function (root, unit) {
    DL.$$(".marks", root).forEach(function (m) { m.parentNode.removeChild(m); });
    DL.$$(".blk.has-r", root).forEach(function (b) { b.classList.remove("has-r"); });
    R.forUnit(unit).forEach(function (r, i) {
      if (r.tab !== "read" || !r.bk) return;
      var blk = root.querySelector('.blk[data-k="' + r.bk + '"]'); if (!blk) return;
      var box = blk.querySelector(":scope > .marks"); if (!box) { box = h("div", { class: "marks" }); blk.appendChild(box); blk.classList.add("has-r"); }
      box.appendChild(h("button", { class: "mark", text: "R" + (i + 1), title: r.entries[0] ? r.entries[0].q : "Note", "aria-label": "Remark " + (i + 1) + ": " + (r.entries[0] ? r.entries[0].q : "note"), onclick: function () { R.open(r.id); } }));
    });
  };
  /** Chips for the remarks attached to one experiment */
  R.chipsFor = function (expId, unit) {
    var out = []; R.forUnit(unit).forEach(function (r, i) { if (r.exp === expId) out.push(h("button", { class: "mark", text: "R" + (i + 1), title: r.entries[0] ? r.entries[0].q : "Note", onclick: function () { R.open(r.id); } })); });
    return out;
  };

  /* ---------- the selection toolbar ---------- */
  var sel = null;
  function texUp(node) { var el = node.nodeType === 1 ? node : node.parentElement; return el && el.closest ? el.closest(".tex") : null; }
  function quoteOf(range) {
    var r = range.cloneRange(), a = texUp(r.startContainer), b = texUp(r.endContainer);
    if (a) r.setStartBefore(a); if (b) r.setEndAfter(b);
    var frag = r.cloneContents();
    DL.$$(".tex", frag).forEach(function (t) { var tex = t.getAttribute("data-tex") || "", disp = t.getAttribute("data-display") === "1"; t.parentNode.replaceChild(document.createTextNode(disp ? "\n$$" + tex + "$$\n" : "$" + tex + "$"), t); });
    DL.$$(".marks, summary, .label, button, .scroll-cue", frag).forEach(function (n) { n.parentNode.removeChild(n); });
    DL.$$("p, li, h2, h3, h4, div, tr, br, pre", frag).forEach(function (n) { n.appendChild(document.createTextNode("\n")); });
    return (frag.textContent || "").replace(/[ \t ]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{2,}/g, "\n").trim().slice(0, 1500);
  }
  function hideTools() { var t = $("#seltools"); if (t) t.hidden = true; sel = null; }
  function checkSelection() {
    var s = window.getSelection && window.getSelection(), tools = $("#seltools");
    if (!tools || !s || s.isCollapsed || !s.rangeCount) return hideTools();
    var range = s.getRangeAt(0), node = range.commonAncestorContainer, el = node.nodeType === 1 ? node : node.parentElement;
    var host = el && el.closest && el.closest(".sheet, .ans, .exp, .planned");
    if (!host || el.closest(".editor, .exp-tabs, .code-bar, textarea, input, select")) return hideTools();
    var text = quoteOf(range); if (text.length < 2) return hideTools();
    var start = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    var blk = start && start.closest(".blk"), exp = start && start.closest(".exp"), inAns = !!(start && start.closest("#m-body .ans"));
    sel = { text: text, bk: blk ? blk.getAttribute("data-k") : null, exp: exp ? exp.getAttribute("data-exp") : null, thread: inAns && view.mode === "thread" ? view.id : null,
      src: start && start.closest(".out, .out-text, .log, .tiles, .verdict, .err") ? "run" : inAns ? "" : "notes" };
    var rc = range.getBoundingClientRect(); tools.hidden = false;
    var w = tools.offsetWidth, x = Math.max(8, Math.min(window.innerWidth - w - 8, rc.left + rc.width / 2 - w / 2)), y = rc.bottom + 8;
    if (y + 44 > window.innerHeight) y = Math.max(8, rc.top - 44);
    tools.style.left = x + "px"; tools.style.top = y + "px";
  }
  function useSelection(go) {
    if (!sel) return; var s = sel; hideTools();
    try { window.getSelection().removeAllRanges(); } catch (e) {}
    if (s.thread) {   // a passage of an answer: a follow-up in the same thread
      var rem = R.get(s.thread); if (!rem) return;
      if (go) return followUp(rem, "Explain this part in more detail.", s.text, false);
      view.mode = "thread"; view.fquote = s.text; render();
      var fq = $("#m-fq"); if (fq) fq.focus();
      return;
    }
    R.compose({ unit: R.unit, tab: s.exp ? "train" : "read", bk: s.bk, exp: s.exp, quote: s.text, src: s.src, q: go ? "Explain this." : "", go: go });
  }
  R.init = function () {
    render();
    document.addEventListener("selectionchange", DL.debounce(checkSelection, 150));
    document.addEventListener("pointerup", function () { setTimeout(checkSelection, 0); });
    document.addEventListener("scroll", function () { if (sel) hideTools(); }, true);
    var tools = $("#seltools");
    tools.addEventListener("pointerdown", function (e) { e.preventDefault(); });
    tools.addEventListener("mousedown", function (e) { e.preventDefault(); });
    $("#sel-ask").addEventListener("click", function () { useSelection(false); });
    $("#sel-explain").addEventListener("click", function () { useSelection(true); });
    $("#m-expand").addEventListener("click", R.toggle);
    if (DL.pref("margin.closed") && !narrow()) $("#app").classList.add("mc");
  };
  DL.onTutorState = function () { render(); };
})();
