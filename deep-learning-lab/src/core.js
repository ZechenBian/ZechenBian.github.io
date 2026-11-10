// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* Core helpers: DOM, formatting, capabilities of the Claude artifact runtime, and the store.
 * The store keeps the reader's own work (remarks, prediction ledger, run history, edited scripts):
 *   - in Claude: one document per item in the viewer's private subtree data/users/<id>/ of the artifact database
 *   - elsewhere: this browser's localStorage
 *   - if neither works: memory only (the page still runs; a banner says so) */
var DL = window.DL = {};
(function () {
  "use strict";
  var doc = document;

  /* ---------- DOM ---------- */
  function h(tag, attrs, kids) {
    var el = doc.createElement(tag), k;
    if (attrs) for (k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else if (k === "hidden" || k === "disabled" || k === "checked" || k === "open" || k === "selected") el[k] = !!v;
      else if (k === "value") el.value = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    add(el, kids);
    return el;
  }
  function add(el, kids) {
    if (kids == null || kids === false) return el;
    if (Array.isArray(kids)) { for (var i = 0; i < kids.length; i++) add(el, kids[i]); return el; }
    el.appendChild(kids.nodeType ? kids : doc.createTextNode(String(kids)));
    return el;
  }
  DL.h = h; DL.add = add;
  DL.$ = function (sel, root) { return (root || doc).querySelector(sel); };
  DL.$$ = function (sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); };
  DL.clear = function (el) { el.textContent = ""; return el; };
  /** A block of Markdown + LaTeX (rendered by QLMD; any HTML in the source is shown as text, never run) */
  DL.md = function (src, cls) { var d = h("div", { class: cls || "" }); QLMD.mount(d, src); return d; };

  /** One line of Markdown + LaTeX as the content of an inline element (names of statements, titles) */
  DL.inline = function (tag, src, attrs) {
    var tmp = h("div"), el = h(tag, attrs || {}); QLMD.mount(tmp, String(src));
    var para = tmp.querySelector("p");
    if (para) while (para.firstChild) el.appendChild(para.firstChild); else el.textContent = src;
    return el;
  };
  /** Text as it is, with $...$ and $$...$$ typeset, as the content of `el` (a quoted passage, the reader's own
   *  question): nothing else in it is interpreted */
  DL.fillTex = function (el, text) {
    var re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, last = 0, m;
    text = String(text || "");
    while ((m = re.exec(text))) {
      if (m.index > last) el.appendChild(doc.createTextNode(text.slice(last, m.index)));
      el.appendChild(h("span", { class: "tex", "data-display": m[1] != null ? "1" : "0", "data-tex": m[1] != null ? m[1] : m[2], text: m[0] }));
      last = m.index + m[0].length;
    }
    if (last < text.length) el.appendChild(doc.createTextNode(text.slice(last)));
    QLMD.typeset(el);
    return el;
  };
  DL.quoteEl = function (text, cls) { return DL.fillTex(h("blockquote", { class: cls || "quote" }), text); };
  /** Boxes whose content is wider than they are scroll sideways. Each gets a class (the style sheet fades its right
   *  edge) and a small "scroll" tag below its right corner. The tag turns invisible once the box has been scrolled
   *  and keeps its place, so that nothing below it jumps. */
  DL.markScroll = function (root) {
    function cueOf(el) { var c = el.nextElementSibling; return c && c.classList.contains("scroll-cue") ? c : null; }
    DL.$$(".katex-display, .figure .scroll, .md table, .tablewrap", root || doc).forEach(function (el) {
      var over = el.scrollWidth > el.clientWidth + 2, cue = cueOf(el);
      el.classList.toggle("can-scroll", over);
      if (over && !cue && el.parentNode) { cue = h("span", { class: "scroll-cue", "aria-hidden": "true", text: "scroll →" }); el.parentNode.insertBefore(cue, el.nextSibling); }
      if (cue) { cue.hidden = !over; cue.classList.toggle("gone", !!el._moved); }
      if (over && !el._ms) {
        el._ms = 1;
        el.addEventListener("scroll", function () {
          el.classList.toggle("at-end", el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
          if (el.scrollLeft > 4) { el._moved = 1; var c = cueOf(el); if (c) c.classList.add("gone"); }
        }, { passive: true });
      }
    });
  };
  /** The scrolling column: bring an element into view (used when a result appears below the fold) */
  DL.reveal = function (el, where) {
    var main = DL.$("#main"); if (!el || !main) return;
    var a = el.getBoundingClientRect(), b = main.getBoundingClientRect(), pad = 14, dy = 0;
    if (where === "start" || a.height + 2 * pad >= b.height || a.top < b.top + pad) dy = a.top - b.top - pad;
    else if (a.bottom > b.bottom - pad) dy = a.bottom - b.bottom + pad;
    // a long jump (to another section) is made at once; a short one (a result just below the fold) glides
    if (Math.abs(dy) > 1) main.scrollTo({ top: main.scrollTop + dy, behavior: Math.abs(dy) > 1400 || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) ? "instant" : "smooth" });
  };
  /** The numbered sections of a written unit: { "6": "Backpropagation", ... } */
  var secCache = {};
  DL.sections = function (unitId) {
    if (secCache[unitId]) return secCache[unitId];
    var out = {}, notes = DL.NOTES && DL.NOTES[unitId];
    if (notes) notes.blocks.forEach(function (b) { var m = b.t === "h" && b.level !== 3 && /^(\d+)\.\s+(.*)$/.exec(b.text); if (m) out[m[1]] = m[2]; });
    return (secCache[unitId] = out);
  };
  /** "section 6", "sections 1 and 2", "week 4, section 6" in running text become links to that section of the notes */
  DL.linkSections = function (root, unitId) {
    var re = /\b(?:week (\d+), )?(sections?) (\d+)(?: and (\d+))?/gi, nodes = [], n;
    var walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    while ((n = walker.nextNode())) {
      var par = n.parentElement; re.lastIndex = 0;
      if (par && !par.closest("a, button, code, pre, textarea, summary, h1, h2, h3, .katex, .tex, .editor, .log, .out-text") && re.test(n.nodeValue)) nodes.push(n);
    }
    nodes.forEach(function (node) {
      var text = node.nodeValue, frag = doc.createDocumentFragment(), last = 0, m, hit = false; re.lastIndex = 0;
      function a(unit, num, label) { return h("a", { class: "seclink", href: "#" + unit + "-sec-" + num, title: "Week " + DL.unit(unit).week + ", section " + num + ": " + DL.sections(unit)[num], text: label }); }
      while ((m = re.exec(text))) {
        var unit = m[1] ? "u" + m[1] : unitId, secs = unit && DL.unit(unit) ? DL.sections(unit) : {};
        if (!secs[m[3]] || (m[4] && !secs[m[4]])) continue;
        frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
        if (m[4]) { frag.appendChild(a(unit, m[3], (m[1] ? "week " + m[1] + ", " : "") + m[2] + " " + m[3])); frag.appendChild(doc.createTextNode(" and ")); frag.appendChild(a(unit, m[4], m[4])); }
        else frag.appendChild(a(unit, m[3], m[0]));
        last = m.index + m[0].length; hit = true;
      }
      if (!hit) return;
      frag.appendChild(doc.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  };

  /* ---------- small utilities ---------- */
  DL.uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); };
  DL.clone = function (o) { return o == null ? o : JSON.parse(JSON.stringify(o)); };
  DL.debounce = function (fn, ms) { var t; return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); }; };
  DL.hash = function (s) { var x = 2166136261; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); };
  DL.ago = function (ts) {
    var s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return "just now"; if (s < 3600) return Math.round(s / 60) + " min ago"; if (s < 86400) return Math.round(s / 3600) + " h ago";
    var d = new Date(ts); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  /** Numbers the way a lab notebook writes them: 4 significant digits, scientific notation outside 1e-4 .. 1e6 */
  DL.num = function (v, digits) {
    if (typeof v === "string") return v;
    if (v == null || v !== v) return "—";
    if (v === Infinity) return "+∞"; if (v === -Infinity) return "−∞";
    var a = Math.abs(v), s;
    if (digits != null) s = v.toFixed(digits);
    else if (a === 0) s = "0";
    else if (Number.isInteger(v) && a < 1e9) s = v.toLocaleString("en-US");     // counts stay whole: 4,208,643 parameters
    else if (a >= 1e6 || a < 1e-4) s = v.toExponential(2).replace("e+", "e");
    else s = String(+v.toPrecision(4));
    return s.replace(/-/g, "−");
  };
  DL.pct = function (v, d) { return v == null || v !== v ? "—" : (v * 100).toFixed(d == null ? 1 : d) + "%"; };
  DL.secs = function (s) { if (s == null || s !== s) return "—"; if (s < 10) return s.toFixed(1) + " s"; if (s < 90) return Math.round(s) + " s"; s = Math.round(s); return Math.floor(s / 60) + " min " + (s % 60) + " s"; };

  /* ---------- toast, modal, clipboard ---------- */
  var toastT;
  DL.toast = function (msg, action, fn) {
    var t = DL.$("#toast"); if (!t) return;
    DL.clear(t); add(t, h("span", { text: msg }));
    if (action) add(t, h("button", { text: action, onclick: function () { t.hidden = true; fn(); } }));
    t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, action ? 8000 : 3200);
  };
  DL.modal = function (title, body, opts) {
    opts = opts || {};
    var root = DL.$("#modal-root"), prev = doc.activeElement;
    function close() { if (wrap.parentNode) root.removeChild(wrap); doc.removeEventListener("keydown", key); if (prev && prev.focus) prev.focus(); if (opts.onClose) opts.onClose(); }
    function key(e) { if (e.key === "Escape") close(); }
    var x = h("button", { class: "iconbtn", "aria-label": "Close", text: "✕", onclick: close });
    var box = h("div", { class: "mbox", role: "dialog", "aria-modal": "true", "aria-label": title }, [h("div", { class: "mhead" }, [h("h2", { text: title }), x]), body]);
    if (opts.wide) box.style.maxWidth = "920px";
    var wrap = h("div", { class: "modal", onclick: function (e) { if (e.target === wrap) close(); } }, box);
    root.appendChild(wrap); doc.addEventListener("keydown", key); x.focus();
    return { close: close, box: box };
  };
  /** Copy text. Returns a promise of true/false; on refusal the caller shows the text for manual copying. */
  DL.copy = function (text) {
    try { return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; }); }
    catch (e) { return Promise.resolve(false); }
  };
  DL.copyOrShow = function (text, what) {
    DL.copy(text).then(function (ok) {
      if (ok) return DL.toast((what || "Text") + " copied.");
      var ta = h("textarea", { rows: "14", readonly: true, style: "font-family:var(--f-mono);font-size:12px" }); ta.value = text;
      DL.modal("Copy " + (what || "this text").toLowerCase(), h("div", {}, [h("p", { class: "hint", text: "Copying was not allowed here. Select all of the text below and copy it." }), ta]));
      ta.focus(); ta.select();
    });
  };

  /* ---------- the Claude artifact runtime ---------- */
  DL.HOSTED = !!(window.claude && typeof window.claude.use === "function");
  var caps = {};
  /** Promise of a capability namespace, or null when this view cannot run it (also null outside Claude). Never rejects. */
  DL.cap = function (name) {
    if (!caps[name]) caps[name] = DL.HOSTED ? Promise.resolve().then(function () { return window.claude.use(name); }).then(function (ns) { return ns || null; }, function () { return null; }) : Promise.resolve(null);
    return caps[name];
  };
  /** Offer a text file to the viewer (.txt, .json, .csv, .md are allowed; .py is not, so scripts are saved as .txt). */
  DL.save = function (filename, text) {
    return DL.cap("downloads").then(function (d) {
      if (!d) { DL.copyOrShow(text, filename); return false; }
      return d.save({ filename: filename, data: text }).then(function () { return true; }, function (e) {
        if (e && e.code === "declined") return false;
        DL.copyOrShow(text, filename); return false;
      });
    });
  };

  /* ---------- preferences (this browser only; a convenience, the page works without it) ---------- */
  var LS = "dllab.v1.";
  function lsGet(k) { try { var s = window.localStorage.getItem(LS + k); return s == null ? null : JSON.parse(s); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) window.localStorage.removeItem(LS + k); else window.localStorage.setItem(LS + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function lsKeys(prefix) { var out = []; try { for (var i = 0; i < window.localStorage.length; i++) { var k = window.localStorage.key(i); if (k && k.indexOf(LS + prefix) === 0) out.push(k.slice((LS + prefix).length)); } } catch (e) {} return out; }
  DL.pref = function (k, v) { if (arguments.length === 1) return lsGet("pref." + k); lsSet("pref." + k, v); return v; };

  /* ---------- the store ---------- */
  var MAX_DOC = 200000;   // characters of JSON; the database refuses documents over 256 KiB
  var store = DL.store = {
    mode: "memory",       // "account" (Claude artifact database, private to the viewer) | "browser" (localStorage) | "memory"
    docs: {}, col: null, slow: false, listeners: [],
    get: function (id) { return store.docs[id] || null; },
    /** Documents whose id starts with `prefix`, newest first by their `at` field */
    list: function (prefix) {
      var out = []; for (var id in store.docs) if (id.indexOf(prefix) === 0) out.push({ id: id, data: store.docs[id] });
      out.sort(function (a, b) { return (b.data.at || 0) - (a.data.at || 0); }); return out;
    },
    /** Save one document (a plain object). Returns false when it is too large to keep. */
    put: function (id, data) {
      var text = JSON.stringify(data);
      if (text.length > MAX_DOC) return false;
      store.docs[id] = JSON.parse(text); touched[id] = 1; queue(id); return true;
    },
    del: function (id) { if (!(id in store.docs)) return; delete store.docs[id]; touched[id] = 1; queue(id); },
    onChange: function (fn) { store.listeners.push(fn); }
  };
  var touched = {}, pending = {}, writing = {};
  function queue(id) {      // one write at a time per document; a burst of changes becomes one write of the latest state
    pending[id] = 1; if (writing[id]) return;
    writing[id] = 1;
    var retried = false;
    function next() {
      if (!pending[id]) { delete writing[id]; return; }
      delete pending[id];
      var data = store.docs[id], p;
      try {
        if (store.col) p = data ? store.col.doc(id).set(data) : store.col.doc(id).delete();
        else { lsSet("doc." + id, data || null); p = Promise.resolve(); }
      } catch (e) { p = Promise.reject(e); }
      Promise.resolve(p).then(next, function (e) {
        var code = e && e.code;
        if (code === "unavailable" && !retried) { retried = true; pending[id] = 1; setTimeout(next, 800 + Math.random() * 800); return; }
        delete writing[id];
        if (!store.warned) { store.warned = 1; DL.toast(code === "quota_exceeded" ? "The lab's storage is full: delete old runs or remarks to save new ones." : "Could not save this change (" + (code || "storage error") + "). It stays on this page until you close it."); }
      });
    }
    store.ready.then(next);     // writes wait until the store knows where it saves (account or browser)
  }
  function fromLocal() {
    lsKeys("doc.").forEach(function (id) { var d = lsGet("doc." + id); if (d && typeof d === "object") store.docs[id] = d; });
    store.mode = lsSet("probe", 1) ? "browser" : "memory";
  }
  function timeout(p, ms) { return new Promise(function (ok, no) { var t = setTimeout(function () { no({ timeout: true }); }, ms); p.then(function (v) { clearTimeout(t); ok(v); }, function (e) { clearTimeout(t); no(e); }); }); }
  function merge(snap) { snap.docs.forEach(function (d) { if (!touched[d.id] && d.exists !== false) store.docs[d.id] = DL.clone(d.data()); }); }
  store.ready = Promise.all([DL.cap("db"), DL.cap("user")]).then(function (c) {
    var db = c[0], user = c[1];
    if (!db || !user) return fromLocal();
    return Promise.resolve().then(function () { return user.id(); }).then(function (uid) {
      if (!uid) return fromLocal();
      var col = db.collection("data/users/" + uid), q = col.limit(1000).get();
      store.col = col; store.mode = "account";
      return timeout(q, 10000).then(merge, function (e) {
        if (e && e.timeout) {   // the database is slow to answer: show the page now, merge the saved work when it arrives
          store.slow = true;
          q.then(function (snap) { merge(snap); store.slow = false; store.listeners.forEach(function (fn) { fn(); }); }, function () {});
          return;
        }
        store.col = null; fromLocal();
      });
    }, function () { fromLocal(); });
  }).then(function () { store.loaded = true; }, function () { store.loaded = true; });
  DL.storeLabel = function () {
    if (!store.loaded) return "Looking for your saved work";
    return store.mode === "account" ? "Saved to your Claude account (private to you)" : store.mode === "browser" ? "Saved in this browser only" : "Not saved: storage is unavailable here";
  };
  /** The same, as a full sentence that also says what is kept */
  DL.storeSentence = function () {
    var what = "Your remarks, predictions, runs and edited scripts";
    if (!store.loaded) return "Looking for your saved work…";
    return store.mode === "account" ? what + " are saved to your Claude account, private to you." : store.mode === "browser" ? what + " are saved in this browser only."
      : "Nothing can be saved here, so your remarks and runs last only until this page is closed.";
  };
  /** A piece of text that says where the reader's work is kept, and stays right when that becomes known.
   *  DL.storeNote("full") gives the full sentence. */
  DL.storeNote = function (before, after) {
    var el = h("span", { class: "store-note" });
    el._fill = function () { el.textContent = before === "full" ? DL.storeSentence() : (before || "") + DL.storeLabel() + (after == null ? "." : after); };
    el._fill(); return el;
  };
  function refreshNotes() { DL.$$(".store-note").forEach(function (el) { if (el._fill) el._fill(); }); }
  store.ready.then(refreshNotes); store.onChange(refreshNotes);
  document.addEventListener("toggle", function (e) { if (e.target && e.target.open) DL.markScroll(e.target); }, true);
  window.addEventListener("resize", DL.debounce(function () { DL.markScroll(document); }, 200));
})();
