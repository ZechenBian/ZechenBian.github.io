// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* The tutor: questions go to Claude through the artifact runtime's "sample" capability (the reader's own Claude plan).
 * Every call is memoryless, so each one carries: how to answer, the unit (its syllabus and, when written, its notes),
 * the passage or experiment the question is about, and the thread so far. Answers come back as Markdown with LaTeX. */
(function () {
  "use strict";
  var T = DL.tutor = { state: "unknown" };   // "unknown" | "ready" | "absent"
  DL.cap("sample").then(function (s) { T.state = s ? "ready" : "absent"; if (DL.onTutorState) DL.onTutorState(); });

  var HEADER = [
    'You are the tutor inside "Deep Learning Lab", a study page that accompanies Math 270, "A Survey of Deep Learning for Mathematicians" (Tony Feng, UC Berkeley, Fall 2025). The course describes its audience as pure mathematicians: mathematically sophisticated, with analysis, linear algebra and probability assumed, but with little background in statistics, optimization or machine-learning practice, and able to read Python.',
    "",
    "How to answer:",
    "- Be correct first. Give definitions and precise statements. When you give an argument, say whether it is a proof, a proof sketch or a heuristic. Say plainly which claims are theorems, which are empirical findings and which are contested. If you are not sure, say so. Never invent a citation; name a paper only when you are confident of its authors and year.",
    "- Then give the intuition: the simplest special case, a small example, or a picture described in words.",
    "- Use the page's notation: vectors are rows; a layer computes a^l = h(a^{l-1} W^l + b^l) with W^l of shape n_{l-1} x n_l (the transpose of PyTorch's weight); logarithms are natural and losses are in nats. \"Section k\" means section k of the unit's notes, included below when they exist.",
    "- Write Markdown. Mathematics goes in $...$ (inline) or $$...$$ (display), in LaTeX that KaTeX renders. No HTML and no headings above ###. Do not restate the question and do not close with an offer of more help."
  ].join("\n");
  var MODE = {
    short: "Length: at most 120 words. The direct answer first, then the single most important reason. The reader can ask for a longer answer afterwards.",
    deep: "Length: the full answer, about 300 to 600 words. Give the precise statement, a proof or derivation with the steps a mathematician would want to see, one worked example or special case, and where the statement stops being true.",
    code: "This is a request about a script. If it asks you to write or change the script, reply with one short paragraph saying what the script does or what you changed, then the COMPLETE script in a single ```python block: never a fragment or a diff. If it asks for an explanation or a diagnosis, explain first (which line, what goes wrong, why), then give the complete corrected script in a single ```python block if a fix is needed."
  };
  var API = [
    "The lab's script interface. The script defines run(lab); the page calls nothing else.",
    "  lab.p(name, default) a parameter. lab.rng a seeded numpy Generator. lab.torch and lab.device (torch.device: mps on Apple GPUs, else cuda, else cpu; None when PyTorch is missing). lab.time_left() seconds left in the time budget. lab.dataset(\"tinyshakespeare\") returns the text as one str.",
    "  Live: lab.report(step, **metrics) adds a point to the live curves; lab.log(*parts) adds a log line.",
    "  Results: lab.result(**named) headline numbers; lab.text(title, s); lab.table(title, columns, rows); lab.plot(title, x, {name: y}, xlabel=\"\", ylabel=\"\", logx=False, logy=False); lab.scatter(title, {name: array[N,2]}, xlabel=\"\", ylabel=\"\", frame=None); lab.heatmap(title, z[H,W], extent=None, vmin=None, vmax=None, diverging=False, xlabel=\"\", ylabel=\"\", frame=None); lab.regions(title, probs[H,W,K], extent=(x0,x1,y0,y1), points=None, labels=None, frame=None) with row 0 at the top; lab.images(title, imgs[N,H,W], cols=8, frame=None). Calls with the same title and different frame labels become frames of one picture.",
    "Rules for scripts: self-contained; import only the standard library, numpy and torch; no reading or writing of files, no downloads, no subprocesses, no plotting libraries. Generate synthetic data inside the script and say in a comment that it is simulated, or use lab.dataset. Keep the default run under about two minutes on a laptop and check lab.time_left() inside long loops. Put tensors on lab.device. Report losses with lab.report so the curve is live, and finish with lab.result(...). Comment the code for a reader who knows the mathematics but not the library."
  ].join("\n");

  function clip(s, n) { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n) + "\n[…cut…]" : s; }
  /** Everything the tutor should know about where the question was asked */
  T.context = function (rem) {
    var u = DL.unit(rem.unit), parts = [];
    if (u) {
      parts.push("The question was asked in week " + u.week + ", \"" + u.title + "\". Syllabus topics of the week: " + u.topics.join("; ") + ".");
      var notes = DL.NOTES && DL.NOTES[u.id];
      if (notes) parts.push("The unit's notes on the page, as Markdown source (lines starting with ::: are layout directives):\n<notes>\n" + clip(notes.md, 60000) + "\n</notes>");
      else parts.push("This lab has not written notes for this week yet. Answer from your own knowledge and say where the lecture notes or the listed references are the place to check a detail. References listed for the week: " + (u.refs || []).concat(u.papers || []).map(function (r) { return r.t; }).join("; ") + ".");
    }
    if (rem.exp) {
      var x = DL.train && DL.train.context(rem.exp);
      if (x) {
        parts.push("The question concerns this experiment: " + x.title + ". " + x.desc + "\nData: " + x.data);
        parts.push(API);
        parts.push("The current script:\n<current_code>\n" + clip(x.script, 40000) + "\n</current_code>");
        if (x.params) parts.push("Parameters of the last run: " + JSON.stringify(x.params));
        if (x.results) parts.push("Results of the last run: " + clip(JSON.stringify(x.results), 4000));
        if (x.curve) parts.push("Last points of its curves: " + clip(JSON.stringify(x.curve), 3000));
        if (x.log) parts.push("Last log lines of the run:\n" + clip(x.log, 3000));
        if (x.error) parts.push("The last run failed with this error (line numbers refer to the script above):\n" + clip(x.error, 4000));
      }
    }
    if (rem.quote) parts.push("The reader selected this passage " + (rem.src === "code" ? "in the script" : rem.src === "run" ? "in the output of a run" : "on the page") + ":\n<passage>\n" + clip(rem.quote, 4000) + "\n</passage>");
    return parts.join("\n\n");
  };
  /** The conversation to send for entry `idx` of a remark, in the given mode ("short" | "deep" | "code") */
  T.turns = function (rem, idx, mode) {
    var turns = [], head = HEADER + "\n\n" + T.context(rem) + "\n\n";
    for (var i = 0; i <= idx; i++) {
      var e = rem.entries[i], q = (i === 0 ? head : "") + (e.quote ? "About this part of your earlier answer:\n<passage>\n" + clip(e.quote, 3000) + "\n</passage>\n\n" : "") + "Question: " + e.q;
      if (i < idx) { turns.push({ role: "user", content: q }); turns.push({ role: "assistant", content: e.long || e.short || "(no answer was given)" }); continue; }
      if (mode === "deep" && e.short) { turns.push({ role: "user", content: q }); turns.push({ role: "assistant", content: e.short }); turns.push({ role: "user", content: "Go deeper on this. " + MODE.deep }); }
      else turns.push({ role: "user", content: q + "\n\n" + MODE[mode] });
    }
    return turns;
  };
  /** The same thing as plain text, for pasting into a chat when the page cannot call Claude itself */
  T.asText = function (rem, idx, mode) { return T.turns(rem, idx, mode).map(function (t) { return (t.role === "user" ? "" : "[earlier answer]\n") + t.content; }).join("\n\n"); };

  var COPY = {
    rate_limited: "Claude is busy or a usage limit was reached. Try again in a while.",
    session_expired: "Your Claude session expired. Sign in again, then retry.",
    refused: "Claude declined to answer this as asked. Rephrase the question.",
    empty_completion: "No answer came back. Ask for less at a time.",
    prompt_too_large: "The question with its context is too long. Ask about a shorter passage."
  };
  /** Ask. opts: { turns, mode, fresh, onText(text) }. Returns { promise -> { text, truncated }, abort }.
   *  Rejections carry .code and a readable .message; "cancelled" means the reader pressed Stop. */
  T.ask = function (opts) {
    var ctl = new AbortController();
    var promise = DL.cap("sample").then(function (sample) {
      if (!sample) { T.state = "absent"; throw { code: "absent", message: "The tutor needs Claude, and this view cannot call it." }; }
      var o = { signal: ctl.signal, modelTier: opts.mode === "short" ? "default" : "complex", onText: function (ev) { if (opts.onText) opts.onText(ev.text); } };
      if (opts.fresh) o.cache = false;
      return sample(opts.turns, o);
    }).then(function (r) { return { text: r.text, truncated: !!r.truncated }; }, function (e) {
      var code = (e && e.code) || "upstream_error";
      if (code === "not_granted" || code === "sampling_disabled" || code === "not_declared" || code === "capability_disabled" || code === "capability_removed") { T.state = "absent"; if (DL.onTutorState) DL.onTutorState(); }
      throw { code: code, text: e && e.text, message: code === "absent" ? e.message : COPY[code] || (T.state === "absent" ? "The tutor is not available in this view." : "The answer was interrupted. Press Retry.") };
    });
    return { promise: promise, abort: function () { ctl.abort(); } };
  };
  /** The last ```python block of an answer, if any */
  T.codeIn = function (text) {
    var re = /```(?:python|py)?[ \t]*\n([\s\S]*?)```/g, m, last = null;
    while ((m = re.exec(String(text || "")))) if (/def\s+run\s*\(/.test(m[1])) last = m[1];
    return last;
  };
})();
