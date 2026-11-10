// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* The shell: routes, the course map, the unit pages (Read / Train / Sources), the overview and the ledger.
 * Routes are plain hash names: #home, #u1 … #u13 (Read), #u1-sec-6 (a section of the notes), #u1-train, #u1-sources, #ledger.
 * Why the three sample units are built the way they are (keep to these when writing the other nine):
 *   1. A unit opens with something to do by hand; the notes name what the reader just found. Formulas come after.
 *   2. The four questions (what is it trying to do, why can it be done this way, why should it, what comes out)
 *      are the frame of the unit; every section answers part of one of them.
 *   3. Every statement carries a label saying what kind of claim it is: theorem or proposition (proved here or cited),
 *      heuristic, empirical, contested, convention. Proofs are complete or marked as sketches, and folded.
 *   4. Each experiment asks for a prediction first and judges it from the run's own numbers.
 *   5. Nothing is copied from the course's notes, slides or notebooks: the page links to them and follows their notation. */
(function () {
  "use strict";
  var h = DL.h, $ = DL.$, C = DL.COURSE;
  var route = { page: "home" }, cleanup = [], afterRender = null;
  var KINDS = { Theorem: "thm", Proposition: "thm", Lemma: "thm", Definition: "conv", Convention: "conv", Heuristic: "heur", Empirical: "emp", Contested: "open" };
  var LEGEND = [["Theorem", "thm", "Proved here, or proved in the cited source"], ["Heuristic", "heur", "An argument that is not a proof"], ["Empirical", "emp", "Observed in experiments, not derived"], ["Contested", "open", "The explanation is disputed"], ["Convention", "conv", "A definition or a choice of notation"]];

  function parse() {
    var s = (location.hash || "").replace(/^#/, ""), m = /^(u\d+)(?:-(train|sources)|-sec-([a-z0-9]+))?$/.exec(s);
    if (m && DL.unit(m[1])) return { page: "unit", unit: m[1], tab: m[2] || "read", sec: m[3] || "" };
    return { page: s === "ledger" ? "ledger" : "home" };
  }
  // byNav: the next change of route was asked for on the page (a link, a button). Without it the change comes from
  // the browser's Back or Forward, and the reader is put back where they were on that page.
  var byNav = false, navTimer = 0, leave = {}, lastHash = null;
  // the mark is dropped after a moment, so that a click that changed nothing (a link opened in a new tab) is not
  // mistaken for the cause of a later Back
  function markNav() { byNav = true; clearTimeout(navTimer); navTimer = setTimeout(function () { byNav = false; }, 600); }
  function nav(hash, cb) { afterRender = cb || null; markNav(); if ((location.hash || "#home") === "#" + hash) render(); else location.hash = hash; }
  DL.nav = nav;
  function link(text, url) { return h("a", { href: url, target: "_blank", rel: "noopener noreferrer", text: text }); }
  function srcItem(r) { return h("li", {}, r.u ? link(r.t, r.u) : r.t); }
  function nExps(u) { return DL.EXPERIMENTS.filter(function (e) { return e.unit === u.id; }).length; }
  function footer() {
    return h("p", { class: "foot" }, ["An unofficial study companion. The course, its lecture notes, slides and notebooks are the work of Tony Feng and his students; this page links to them and reproduces none of them. The unit notes were written by Claude, an AI, for this lab and can contain mistakes: statements are labelled and sourced so that you can check them. ",
      h("br"), "© Zechen Bian · All rights reserved"]);
  }

  /* ---------- the course map ---------- */
  function renderRail() {
    var rail = $("#rail"); DL.clear(rail);
    rail.appendChild(h("button", { class: "unit-link", "aria-current": String(route.page === "home"), onclick: function () { nav("home"); } }, [h("span", { class: "wk" }), h("span", { class: "nm", text: "Overview" }), h("span", { class: "st" })]));
    C.parts.forEach(function (p) {
      rail.appendChild(h("h2", { text: p.name }));
      p.units.forEach(function (id) {
        var u = DL.unit(id);
        rail.appendChild(h("button", { class: "unit-link" + (u.status === "full" ? " full" : ""), "aria-current": String(route.page === "unit" && route.unit === id), onclick: function () { nav(id); } },
          [h("span", { class: "wk", text: String(u.week) }), h("span", { class: "nm", text: u.title }), h("span", { class: "st", text: u.status === "full" ? "notes · " + nExps(u) + " exp." : "syllabus" })]));
        if (route.page === "unit" && route.unit === id && DL.NOTES[id]) rail.appendChild(h("div", { class: "rail-secs", id: "rail-secs" }, sectionLinks(u)));
      });
    });
    var sc = DL.train.score();
    rail.appendChild(h("h2", { text: "Your work" }));
    rail.appendChild(h("button", { class: "unit-link", "aria-current": String(route.page === "ledger"), onclick: function () { nav("ledger"); } }, [h("span", { class: "wk" }), h("span", { class: "nm", text: "Prediction ledger" }), h("span", { class: "st", text: sc.n ? sc.hits + " of " + sc.n : "" })]));
    rail.appendChild(h("p", { class: "rail-foot" }, DL.storeNote()));
  }
  /** Links to the sections of a written unit (its numbered headings, the check questions, the experiments) */
  function sectionLinks(u) {
    return DL.NOTES[u.id].blocks.filter(function (b) { return b.t === "h" && b.level !== 3; }).map(function (b) { return h("a", { href: "#" + u.id + "-sec-" + secId(b.text), "data-sec": secId(b.text), text: b.text }); })
      .concat([h("a", { href: "#" + u.id + "-train", text: "Experiments (" + nExps(u) + ")" })]);
  }
  /** While reading: mark, in the course map, the section that is at the top of the page */
  function spy() {
    var box = $("#rail-secs"); if (!box || route.page !== "unit" || route.tab !== "read") return;
    var top = $("#main").getBoundingClientRect().top + 90, cur = "";
    DL.$$(".sheet h2[id]").forEach(function (el) { if (el.getBoundingClientRect().top <= top) cur = el.id.slice(4); });
    DL.$$("a", box).forEach(function (a) { if (a.getAttribute("data-sec") === cur && cur) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current"); });
  }
  function renderTop() {
    var u = route.page === "unit" ? DL.unit(route.unit) : null;
    $("#crumb").textContent = u ? "Week " + u.week + " · " + u.title : route.page === "ledger" ? "Prediction ledger" : C.code + " · " + C.title;
    var E = DL.engine; $("#engine-dot").className = "dot " + (E.state === "ready" ? "ok" : E.state === "connecting" ? "wait" : E.state === "error" || E.state === "absent" ? "bad" : "");
    $("#engine-label").textContent = E.state === "ready" ? "Mac engine: on" : E.state === "connecting" ? "Mac engine…" : "Mac engine";
    $("#btn-engine").title = E.label();
  }

  /* ---------- the notes ---------- */
  function block(b, u) {
    var el = h("div", { class: "blk", "data-k": b.k });
    if (b.t === "h") {
      if (b.level === 3) el.appendChild(h("h3", { text: b.text }));
      else DL.add(el, [h("button", { class: "up", "aria-label": "Back to the list of sections", title: "Back to the list of sections", text: "↑", onclick: function () { var t = $("#toc"); if (t) { t.open = true; DL.reveal(t, "start"); } } }), h("h2", { id: "sec-" + secId(b.text), text: b.text })]);
    }
    else if (b.t === "md") el.appendChild(DL.md(b.src));
    else if (b.t === "lede") el.appendChild(DL.md(b.src, "lede"));
    else if (b.t === "four") el.appendChild(h("div", { class: "four" }, [h("span", { class: "four-h", text: "The unit in four questions" }), DL.md(b.src)]));
    else if (b.t === "widget") { var w = h("div", { class: "widget" }); el.appendChild(w); if (DL.WIDGETS[b.id]) { var inst = DL.WIDGETS[b.id](w); cleanup.push(inst.destroy); } }
    else if (b.t === "fig") { var f = h("figure", { class: "figure" }); f.innerHTML = DL.FIGS[b.id] ? DL.FIGS[b.id]() : ""; f.appendChild(h("figcaption", { text: b.cap })); el.appendChild(f); }
    else if (b.t === "stmt") {
      var cls = KINDS[b.kind] || "conv", box = h("div", { class: "stmt " + cls }, [h("div", { class: "stmt-h" }, [h("span", { class: "label", text: b.kind }), b.name ? DL.inline("b", b.name) : null]), DL.md(b.src)]);
      if (b.proof) box.appendChild(h("details", { class: "proof" }, [h("summary", { text: b.proofTitle || "Proof" }), DL.md(b.proof)]));
      el.appendChild(box);
    }
    else if (b.t === "check") el.appendChild(h("div", { class: "check" }, [h("span", { class: "label", text: "Check yourself" }), DL.md(b.q), h("details", {}, [h("summary", { text: "Show the answer" }), DL.md(b.a)])]));
    else if (b.t === "exp") {
      var x = DL.exp(b.id); if (!x) return null;
      el.appendChild(h("div", { class: "check", style: "display:flex;gap:10px 16px;align-items:center;flex-wrap:wrap" }, [
        h("div", { style: "flex:1 1 260px;min-width:0" }, [h("span", { class: "label", text: "Experiment" }), h("div", { style: "font-weight:600;margin-top:4px", text: x.title }), h("div", { class: "hint", text: (x.lib === "torch" ? "PyTorch on your Mac" : "numpy") + (x.time ? " · " + x.time : "") + " · " + x.presets.length + (x.presets.length === 1 ? " question" : " questions") + " to predict" })]),
        h("button", { class: "btn small", text: "Open in Train", onclick: function () { nav(u.id + "-train", function () { DL.train.focus(x.id); }); } })]));
    }
    return el;
  }
  function renderRead(col, u) {
    var notes = DL.NOTES[u.id];
    if (!notes) return renderPlanned(col, u);
    col.appendChild(h("div", { class: "legend-row" }, [h("span", { text: "Labels on statements:" })].concat(LEGEND.map(function (l) { return h("span", { class: "stmt " + l[1], style: "border:0;padding:0" }, h("span", { class: "label", title: l[2], text: l[0] })); })).concat([
      h("span", {}, ["Parallel reading: ", link("lecture notes " + u.sec, C.notes), " (this page follows their notation)."])])));
    col.appendChild(h("details", { class: "toc", id: "toc" }, [h("summary", { text: "Sections of this unit" }), h("nav", { "aria-label": "Sections of this unit" }, sectionLinks(u))]));
    var sheet = h("article", { class: "sheet", id: "sheet" });
    notes.blocks.forEach(function (b) { var el = block(b, u); if (el) sheet.appendChild(el); });
    col.appendChild(sheet);
    DL.linkSections(sheet, u.id);
    col.appendChild(h("div", { class: "card card-pad", style: "grid-template-columns:minmax(0,1fr) auto;align-items:center" }, [
      h("div", {}, [h("b", { text: "Next: the experiments" }), h("div", { class: "hint", text: nExps(u) + " experiments for this unit. Each asks for a prediction before it runs." })]),
      h("button", { class: "btn", text: "Go to Train", onclick: function () { nav(u.id + "-train"); } })]));
    DL.remarks.decorate(sheet, u.id);
    QLMD.typeset(sheet);
  }
  function secId(text) { var m = /^(\d+)\./.exec(text); return m ? m[1] : text.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "x"; }
  function toSection(id) { var el = document.getElementById("sec-" + id); if (!el) return; DL.reveal(el.parentNode, "start"); if (el.animate) el.animate([{ background: "var(--sel)" }, { background: "transparent" }], { duration: 1400 }); }
  function askNow(u, q) { DL.remarks.compose({ unit: u.id, tab: "read", q: q, go: true }); }
  function renderPlanned(col, u) {
    var box = h("article", { class: "sheet planned", id: "sheet" });
    box.appendChild(h("div", { class: "blk" }, DL.md("**The notes for this week are not written yet.** This lab has full units for weeks 1, 4 and 7. For this week it offers the syllabus, the sources, a scratch bench for experiments, and the tutor, which answers from its own knowledge here. Check what it says against the lecture notes and the references.", "lede")));
    box.appendChild(h("div", { class: "blk" }, h("h2", { text: "What the course covers this week" })));
    box.appendChild(h("div", { class: "blk" }, h("ul", { class: "src-list", style: "font-family:var(--f-read);font-size:17px" }, u.topics.map(function (t) {
      return h("li", {}, [t, " ", h("button", { class: "linkbtn", text: "ask about this", onclick: function () { DL.remarks.compose({ unit: u.id, tab: "read", q: "Explain this topic of the week: " + t + ". Give the definitions, the main statement, and why it matters for what comes later in the course." }); } })]);
    }))));
    if (u.asks) {
      box.appendChild(h("div", { class: "blk" }, h("h2", { text: "Three questions worth being able to answer" })));
      u.asks.forEach(function (q) { box.appendChild(h("div", { class: "blk" }, h("div", { class: "check", style: "display:flex;gap:10px 16px;align-items:center;flex-wrap:wrap" }, [h("div", { style: "flex:1 1 280px;min-width:0" }, DL.md(q)), h("button", { class: "btn ghost small", text: "Ask the tutor", onclick: function () { askNow(u, q); } })]))); });
    }
    box.appendChild(h("div", { class: "blk" }, DL.md("Read the course's own treatment in the lecture notes, " + u.sec + ". The Sources tab has the links, the week's papers and the students' case study.")));
    col.appendChild(box);
    QLMD.typeset(box);
  }
  function renderSources(col, u) {
    var notes = DL.NOTES[u.id], grid = h("div", { class: "card card-pad src-grid" });
    function sec(title, items) { if (items && items.length) grid.appendChild(h("div", { class: "src-sec" }, [h("h3", { text: title }), h("ul", { class: "src-list" }, items)])); }
    var course = [h("li", {}, [link("Lecture notes (PDF)", C.notes), ", " + u.sec + ", by " + C.who]), h("li", {}, link("Schedule: topics and references for every week (PDF)", C.schedule)), h("li", {}, link("Projects: the case studies and the Colab tasks (PDF)", C.projects)), h("li", {}, link("Course page", C.page))];
    if (u.slides) course.push(h("li", {}, [link("Case-study slides for this week (PDF)", u.slides), h("span", { class: "who", text: " by the students who presented it; they are named on the course page" })]));
    (u.colab || []).forEach(function (c) { course.push(h("li", {}, [link(c.t, c.u), h("span", { class: "who", text: c.who || " by the same students" })])); });
    sec("From the course", course);
    if (u.task) grid.appendChild(h("div", { class: "src-sec" }, [h("h3", { text: "The week's hands-on task" }), h("p", { style: "margin:0;font-size:13.5px;line-height:1.55", text: u.task })]));
    sec("References the schedule gives for this week", (u.refs || []).map(srcItem));
    sec("Papers of the week's case study", (u.papers || []).map(srcItem));
    if (notes) sec("Cited in this lab's notes for the week", notes.bib.map(srcItem));
    sec("General references of the course", C.general.map(srcItem));
    grid.appendChild(h("p", { class: "hint", text: "Links open the original sources in a new tab. Course material read on 2026-11-10." }));
    col.appendChild(grid);
  }
  function renderUnit(main) {
    var u = DL.unit(route.unit), part = DL.partOf(u.id), n = nExps(u);
    var col = h("div", { class: "col" + (route.tab === "train" ? " wide" : "") });
    col.appendChild(h("div", { class: "unit-head" }, [
      h("div", { class: "kicker", text: "Week " + u.week + " · " + u.date + ", 2025 · " + part.name }), h("h1", { text: u.title }), h("p", { class: "topics", text: u.blurb }),
      h("div", { class: "tabs", role: "tablist" }, [["read", "Read"], ["train", "Train"], ["sources", "Sources"]].map(function (t) {
        return h("button", { role: "tab", "aria-selected": String(route.tab === t[0]), onclick: function () { nav(u.id + (t[0] === "read" ? "" : "-" + t[0])); } }, [t[1], t[0] === "train" && n ? h("span", { class: "count", text: String(n) }) : null]);
      }))]));
    main.appendChild(col);
    if (route.tab === "train") { var box = h("div", { style: "display:grid;gap:16px;min-width:0" }); col.appendChild(box); DL.train.render(box, u.id); }
    else if (route.tab === "sources") renderSources(col, u);
    else renderRead(col, u);
    col.appendChild(footer());
  }

  /* ---------- overview ---------- */
  function renderHome(main) {
    var col = h("div", { class: "col home" }), sc = DL.train.score(), nr = DL.store.list("r-").length;
    col.appendChild(h("div", { class: "kicker", text: "A study companion to " + C.code + ", " + C.where }));
    col.appendChild(h("h1", { text: "Deep Learning Lab" }));
    col.appendChild(h("p", { class: "intro" }, ["Tony Feng's course ", link("A Survey of Deep Learning for Mathematicians", C.page), " goes through modern deep learning in thirteen weeks, for readers who know analysis, linear algebra and probability and little else about the subject. This lab is a place to work through it: read a unit, ask about any line, then train the model yourself and check your prediction against the run."]));
    col.appendChild(h("div", { class: "how" }, [
      ["Read", "Each written unit opens with a figure to play with, then gives definitions, statements and proofs. Every statement carries a label: theorem, heuristic, empirical, contested. Proofs are folded until you want them."],
      ["Ask", "Select any text and press Ask. The answer stays in the margin, attached to the line it is about: short first, in depth when you ask for it. Your remarks are searchable, so a question asked twice is found."],
      ["Train", "Every experiment starts with a question and asks you to predict the outcome. Then it runs on your own Mac, on the Apple GPU where that helps, and tells you what happened and why. Scripts are short, readable and editable."]
    ].map(function (c, i) { return h("div", { class: "card card-pad" }, [h("div", { class: "kicker", text: "Step " + (i + 1) }), h("h3", { text: c[0] }), h("p", { text: c[1] })]); })));
    col.appendChild(h("div", { class: "card card-pad" }, [h("b", { text: "Where to start" }), h("p", { class: "hint", style: "font-size:13.5px" }, ["Weeks 1, 4 and 7 are written out in full, with seven experiments between them. Each is meant for two sittings: the notes, then the experiments. Start with week 1; week 7 ends with a small transformer trained on Shakespeare in a few minutes."]),
      h("div", { class: "runbar" }, [h("button", { class: "btn", text: "Begin with week 1", onclick: function () { nav("u1"); } }), sc.n || nr ? h("span", { class: "stat-row" }, [h("span", {}, ["predictions that held ", h("b", { text: sc.hits + " of " + sc.n })]), h("span", {}, ["remarks kept ", h("b", { text: String(nr) })])]) : null])]));
    var map = h("div", { class: "map" });
    C.parts.forEach(function (p) {
      map.appendChild(h("div", { class: "part-h", text: p.name }));
      p.units.forEach(function (id) {
        var u = DL.unit(id);
        map.appendChild(h("button", { class: "map-row" + (u.status === "full" ? " full" : ""), onclick: function () { nav(id); } }, [
          h("span", { class: "wk", text: "Week " + u.week }), h("span", {}, [h("b", { text: u.title }), h("span", { text: u.blurb })]),
          h("span", { class: "st", text: u.status === "full" ? "notes + " + nExps(u) + " experiments" : "syllabus, sources, tutor" })]));
      });
    });
    col.appendChild(map);
    col.appendChild(h("p", { class: "hint" }, ["Week 11 had no class. The experiments run on your own Mac through a small local Python program; “Mac engine” at the top says what it is and how to set it up. ", DL.storeNote("full")]));
    col.appendChild(footer());
    main.appendChild(col);
  }

  /* ---------- ledger ---------- */
  function renderLedger(main) {
    var col = h("div", { class: "col" }), items = DL.train.ledger().slice().reverse(), sc = DL.train.score();
    col.appendChild(h("div", { class: "unit-head" }, [h("div", { class: "kicker", text: "Your work" }), h("h1", { text: "Prediction ledger" }),
      h("p", { class: "topics", text: "Every prediction you lock in before a run is recorded here with what happened. Only the first prediction on each question counts toward the score; once you have seen the answer, a second try is not a prediction. The interesting entries are the misses: they show which intuitions to repair." })]));
    var done = {}; items.forEach(function (x) { done[x.exp + "/" + x.preset] = 1; });
    var open = []; DL.EXPERIMENTS.forEach(function (e) { e.presets.forEach(function (p) { if (!done[e.id + "/" + p.id]) open.push({ e: e, p: p }); }); });
    col.appendChild(h("div", { class: "card card-pad" }, [h("div", { class: "stat-row" }, [h("span", {}, ["first predictions that held ", h("b", { text: sc.n ? sc.hits + " of " + sc.n : "none yet" })]), h("span", {}, ["questions not yet tried ", h("b", { text: String(open.length) })])]),
      open.length ? h("div", { class: "chips" }, open.slice(0, 16).map(function (o) { return h("button", { class: "chip", text: "Week " + DL.unit(o.e.unit).week + ": " + o.p.name, onclick: function () { nav(o.e.unit + "-train", function () { DL.train.focus(o.e.id); }); } }); })) : null]));
    if (items.length) {
      col.appendChild(h("div", { class: "card", style: "overflow:hidden" }, h("div", { class: "tablewrap", style: "max-height:none;border:0" }, h("table", { class: "data ledger" }, [
        h("thead", {}, h("tr", {}, ["When", "Question", "You said", "It was", "", "Checked against"].map(function (t) { return h("th", { text: t, style: "text-align:left" }); }))),
        h("tbody", {}, items.map(function (x) {
          var e = DL.exp(x.exp), p = null; if (e) e.presets.forEach(function (q) { if (q.id === x.preset) p = q; });
          function td(label, t) { return h("td", { text: t, "data-label": label, style: "text-align:left;white-space:normal;font-family:var(--f-ui);min-width:120px" }); }
          return h("tr", {}, [td("When", new Date(x.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })), td("Question", e && p ? "Week " + DL.unit(e.unit).week + ": " + p.name : x.exp), td("You said", p ? p.opts[x.pick] : String(x.pick)), td("It was", p ? p.opts[x.answer] : String(x.answer)),
            h("td", { text: (x.hit ? "held" : "missed") + (x.again ? " (repeat)" : ""), "data-label": "Result", style: "text-align:left;font-family:var(--f-ui);font-weight:600;color:" + (x.hit ? "var(--good-ink)" : "var(--crit-ink)") }), td("Against", x.ref ? "the reference run" : "a run on your Mac")]);
        }))]))));
      var del = h("div", { class: "runbar" });
      var idle = function () { DL.clear(del); del.appendChild(h("button", { class: "linkbtn muted", text: "Clear the ledger", onclick: function () { DL.clear(del); DL.add(del, [h("span", { class: "status", text: "Remove all recorded predictions?" }), h("button", { class: "btn danger small", text: "Clear", onclick: function () { DL.store.del("ledger"); render(); } }), h("button", { class: "btn quiet small", text: "Keep", onclick: idle })]); } })); };
      idle(); col.appendChild(del);
    } else col.appendChild(h("p", { class: "hint", text: "Nothing recorded yet. Open a written unit's Train tab, pick a question, choose an answer and run it." }));
    col.appendChild(footer());
    main.appendChild(col);
  }

  /* ---------- render ---------- */
  var drawn = false, SCROLL = "dllab.v1.scroll";
  function saveScroll() { try { window.sessionStorage.setItem(SCROLL, JSON.stringify({ r: location.hash || "#home", y: $("#main").scrollTop })); } catch (e) {} }
  /** After a reload: put the reader back where they were on this page (same tab of the browser only) */
  function restoreScroll() { try { var v = JSON.parse(window.sessionStorage.getItem(SCROLL) || "null"); if (v && v.r === (location.hash || "#home") && v.y > 0) $("#main").scrollTop = v.y; } catch (e) {} }
  function render() {
    var next = parse(), hash = location.hash || "#home", explicit = byNav, same = hash === lastHash;
    byNav = false; clearTimeout(navTimer);
    if (drawn && lastHash && !same) leave[lastHash] = $("#main").scrollTop;      // where the reader was on the page being left
    var back = drawn && !explicit && !same && leave[hash] != null, backTo = back ? leave[hash] : 0;
    lastHash = hash;
    // the same notes are already on screen: move, do not rebuild (the figures keep their state). A link to a section
    // goes to that section; Back returns to the place the reader left.
    if (drawn && next.page === "unit" && route.page === "unit" && route.unit === next.unit && route.tab === "read" && next.tab === "read" && (back || (next.sec && document.getElementById("sec-" + next.sec)))) {
      route = next;
      if (back) { $("#main").scrollTo({ top: backTo, behavior: "instant" }); spy(); } else toSection(next.sec);
      return;
    }
    route = next; drawn = true;
    var toast = $("#toast"); if (toast) toast.hidden = true;      // a message, and its Undo, belong to the page they appeared on
    cleanup.forEach(function (f) { try { f(); } catch (e) {} }); cleanup = []; DL.train.dispose();
    var main = $("#main"); DL.clear(main);
    renderRail(); renderTop();
    if (route.page === "unit") renderUnit(main); else if (route.page === "ledger") renderLedger(main); else renderHome(main);
    main.scrollTop = 0;
    $("#rail").classList.remove("open");
    DL.remarks.setUnit(route.page === "unit" ? route.unit : null);
    var m = $("#btn-margin"); if (m) m.hidden = false;
    if (back) setTimeout(function () { $("#main").scrollTo({ top: backTo, behavior: "instant" }); spy(); }, 0);
    else if (route.sec) { var sec = route.sec; setTimeout(function () { toSection(sec); }, 0); }
    if (afterRender) { var f = afterRender; afterRender = null; setTimeout(f, 0); }
    setTimeout(function () { DL.markScroll($("#main")); spy(); }, 60);
  }
  DL.goRemark = function (rem) {
    if (rem.exp) { var x = DL.exp(rem.exp); return nav((x ? x.unit : rem.unit) + "-train", function () { DL.train.focus(rem.exp); }); }
    if (!rem.bk && route.page === "unit" && route.unit === rem.unit && route.tab === "read") return;
    nav(rem.unit, function () {
      var blk = rem.bk && document.querySelector('.blk[data-k="' + rem.bk + '"]');
      if (blk) { blk.scrollIntoView({ block: "center" }); blk.animate && blk.animate([{ background: "var(--sel)" }, { background: "transparent" }], { duration: 1600 }); }
      else if (rem.bk) DL.toast("The notes have changed since this remark was written; its place could not be found.");
    });
  };
  DL.goExperiment = function (exp, cb) { nav(exp.unit + "-train", cb); };
  DL.onRemarksChanged = function () {
    if (route.page === "unit" && route.tab === "read") { var s = $("#sheet"); if (s && DL.NOTES[route.unit]) DL.remarks.decorate(s, route.unit); }
    else if (route.page === "unit" && route.tab === "train") DL.train.repaint();
  };
  DL.onLedgerChanged = function () { renderRail(); };

  function boot() {
    $("#brand").addEventListener("click", function () { nav("home"); });
    $("#btn-map").addEventListener("click", function () { $("#rail").classList.toggle("open"); });
    $("#btn-margin").addEventListener("click", DL.remarks.toggle);
    $("#btn-engine").addEventListener("click", DL.train.engineHelp);
    $("#main").addEventListener("click", function () { $("#rail").classList.remove("open"); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { $("#rail").classList.remove("open"); if (window.matchMedia("(max-width: 900px)").matches) $("#margin").classList.remove("open"); } });
    window.addEventListener("hashchange", render);
    document.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;      // those open the link elsewhere
      var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (a && a.getAttribute("href") !== (location.hash || "#home")) markNav();
    }, true);
    DL.engine.onChange(renderTop);
    DL.remarks.init();
    render(); restoreScroll();
    DL.store.ready.then(function () { if (Object.keys(DL.store.docs).length) { DL.train.reset(); render(); restoreScroll(); } else { renderRail(); DL.remarks.refresh(); } });
    DL.store.onChange(function () { DL.train.reset(); render(); });
    $("#main").addEventListener("scroll", DL.debounce(saveScroll, 250), { passive: true });
    window.addEventListener("pagehide", saveScroll);
    $("#main").addEventListener("scroll", DL.debounce(spy, 80), { passive: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
