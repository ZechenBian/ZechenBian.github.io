---
name: flavored-notes
description: Write a math or physics note — lecture notes, an expository write-up, a seminar handout, exam-prep sheet, problem set with solutions, or a 笔记/讲义 — on a given topic in a requested flavor (an author or school such as Serre, Bourbaki, Grothendieck, Tao, Vakil, Lurie, Feynman, Landau–Lifshitz, Witten; a rigor level; an audience; a genre; a viewpoint; or a sample text to imitate), delivered as PDF + Markdown with numbered theorems, proofs, equations and cross-references. Use it whenever someone asks for notes or a write-up on a math or physics topic "in the style of", "à la", "like X would write it", "with a … flavor/vibe", "风格", or at a stated level ("for physicists", "qual prep", "first-year grad"), even if the word flavor never appears, and when rewriting an existing note in a different flavor. Not for short answers that belong in chat.
---

# Flavored math & physics notes

A *flavor* is a bundle of concrete decisions: who speaks to whom, what counts
as an argument, what comes first, how proofs read, how many examples, what is
left to the reader. This skill turns a flavor request into an explicit
**flavor card**, writes the note to a fixed standard of mathematical
correctness that no flavor relaxes, and builds a PDF and a clean Markdown file
from one source.

Files in this skill:
- `references/flavors.md` — the flavor dimensions, the rigor dial R0–R4, and
  presets for authors, schools and genres. Read the parts you need before
  writing the card.
- `scripts/build_note.py` (+ `note_filter.lua`, `md_title.template`) — builds
  `NAME.src.md` into `NAME.pdf`, `NAME.md`, `NAME.tex`. research-writeup
  builds its PDFs with the same script, so keep its command line stable.
- `assets/example.src.md` — a short note that uses every feature of the
  source format; copy its patterns.

## What no flavor changes

1. **Every statement is true as stated.** A flavor decides how much is
   argued, in what order and in what voice. It never licenses a missing
   hypothesis, a wrong constant or a false "clearly". A Feynman-style note
   may skip rigor; it may not say something false.
2. **Every claim has a visible status**: proved here; sketched (title the
   block "Proof sketch" or "Idea of proof"); cited to a reference you have
   verified; heuristic (say so); or conjectural (say so). Never present a
   sketch as a proof or a heuristic as a theorem.
3. **Details are written out by default**: precise definitions, precise
   theorem statements with all hypotheses, and proofs or labelled proof
   sketches. Only a genre that is explicitly an overview (cheat sheet,
   colloquium write-up) drops proofs, and even then statements stay exact.

## Workflow

### 1. Read the request
Pin down: topic and scope; flavor (author, school, adjective, genre, or a
sample to imitate); audience; purpose; length; language; any attached source
material (if the user gives papers or notes, the note is built from them and
must agree with them). If the flavor is genuinely ambiguous *and* the note is
long, ask one question; otherwise choose, state the choice, and proceed.

Default length when none is given: 4–8 PDF pages (roughly 2,000–4,000
English words, or 2,500–5,000 汉字 for a Chinese note with a fair amount of
math), one main theorem or idea plus what it needs. "Short note": 2–3 pages.
"Lecture notes": 8–15 pages, split into sections. The build prints the page
count; trim to the budget rather than shrinking margins or fonts.

### 2. Write the flavor card
Use `references/flavors.md`: start from the nearest preset(s), adjust to the
request, and resolve conflicts explicitly (e.g. an informal author on a
topic that needs heavy definitions). Put the card in the source's front
matter as `flavor-card:`, so it travels with the note and later revisions can
honour it, and state it to the user in 3–6 lines at the start of the work, so
they can redirect early. Stating is not asking: carry on without waiting for
a reply (and when nobody is there to read it — a scheduled or delegated run —
just report it at the end).

```yaml
flavor-card:
  flavor: "Serre"                       # in the user's words
  reading: "terse, exact, elementary means, complete in few pages"
  audience: "first-year graduate students"
  purpose: "self-study: be able to reprove the main theorem"
  rigor: "R3; the transfer lemma only sketched"
  architecture: "short numbered sections; definition → statement → short proof"
  proofs: "complete and short; slickest elementary route"
  examples: "few, decisive: S_4 and GL_2(F_p)"
  exercises: "5 at the end, two extending the theory, hints in parentheses"
  notation: "groups act on the left; |G| order; G_p a Sylow p-subgroup"
  moves: ["one-line remarks pointing to the general case", "a table settling small cases"]
  avoid: ["chatty motivation", "rhetorical questions", "adjectives like 'beautiful'"]
  conflicts: "none"                     # how clashes between flavor and topic were resolved
  length: "3 pages"
  language: en
```

Add keys when they help (the card is free-form YAML and is never printed).

If the user supplied a sample of the flavor, derive the card from the sample
(see §6 of `references/flavors.md`) and imitate its decisions, never its text.

### 3. Plan the mathematics
Before prose, write a plan (outline) for yourself:
- the one or two ideas the reader must leave with;
- definitions, results and examples in dependency order, so each proof uses
  only what came before;
- for each result: full proof, sketch, exercise, citation, or omitted —
  chosen by the card's rigor level and the length budget;
- notation and conventions, fixed once. Physics notes start with a
  conventions block: units and constants set to 1, metric signature, Fourier
  and normalisation conventions, index placement, sign conventions;
- where the flavor's signature moves go (2–4 of them, placed where they do
  work, not sprinkled).

### 4. Check what you are not sure of
Look up (web search, or the provided sources) anything beyond
textbook-standard: exact hypotheses of named theorems, who proved what and
when, standard references. Verify every reference with the citation-check
skill (load it with the Skill tool): it is the single source of the citation
rules — what counts as verified, the ledger, where to check in each field,
and how to handle who-proved-what. Budget: every reference in the note
(notes cite few). If a reference cannot be confirmed, describe the result
without citing it. Quantitative facts (measured constants, data) get a
source too.

### 5. Write the source
Write `NAME.src.md` in the format below. For anything longer than a few
pages, write the outline into the file first, then fill in section by
section. Keep the voice of the card in every section, not just the first.

Writing in Chinese (`lang: zh`): write natural Chinese mathematical prose, not
translated English; use standard Chinese terminology and give the English
term in parentheses at first use, e.g. 层（sheaf）. Environment names
(定理, 引理, 证明, …) are set automatically. Type Chinese quotation marks
“ ” directly (straight `"` stays straight). A reference already prints its
name: write `由@thm:x可知` (→ 由定理 2.1可知), not `由定理@thm:x`; and
`第[-@sec:x]节` for a bare section number, since `@sec:x` alone prints
“第 2 节”.

### 6. Verify
- **Mathematics.** Reread every statement: are the hypotheses necessary and
  sufficient for what is used? Quantifiers in the right order? Edge cases
  (n = 0, empty set, characteristic 2, non-compact, non-simply-connected)?
  Does each proof use only earlier results? Where the flavor allows, add the
  counterexample showing a hypothesis is needed.
- **Computations.** Recompute every explicit computation in code: integrals,
  series, character tables, small-case enumerations (brute force is fine),
  matrix identities, numerical values. Use sympy if it imports (or installs
  with `pip install sympy`, adding `--break-system-packages` if pip asks);
  otherwise numpy/scipy, or plain Python with `fractions` and `itertools` —
  don't skip the check because a package is missing. In physics, check the
  units of each displayed formula, limiting cases, signs, and factors of 2,
  π and i.
- **Flavor.** Reread against the card: is each signature move present and
  doing work? Is anything from the "avoid" list there? Does the note read
  as the flavor in its decisions, or only in its phrases? (One recognisable
  phrase per note is plenty.)
- For a long or high-stakes note, hand the built Markdown to a fresh
  subagent (if available) with the instruction to act as a referee: list
  mathematical errors, unjustified steps and unverified claims, and say where
  the flavor slips. Fix what it finds.
- **Flavor blind test** (every note). Once the note is built (step 7), give a
  fresh subagent only the built Markdown, with any line that names the
  flavor removed — no flavor card, no request text — and ask which author,
  school or genre it imitates and which three features gave it away. If it
  misses or cannot say, the flavor lives only in phrases: change decisions
  (architecture, how proofs read, choice and number of examples), not
  wording, and test once more. With no subagent available, open a fresh
  session for it; if neither is possible, say the blind test was not run.

### 7. Build and look
```
python3 SKILL_DIR/scripts/build_note.py NAME.src.md --outdir OUTDIR --preview SCRATCH
```
This writes `NAME.pdf`, `NAME.md` and `NAME.tex` to OUTDIR and reports the
page count, LaTeX errors, unresolved `@` references, overfull lines (with
the page and a text snippet), glyphs missing from the font, and a nearly
empty last page. `--preview SCRATCH` renders every page to PNG in a *new*
folder under SCRATCH each time (keep SCRATCH apart from OUTDIR), so rounds
never mix. Other options: `--dpi 100` (preview resolution), `--paper a4`,
`--cjk-font "Songti SC"`, `--no-pdf` (Markdown only).

Requirements: pandoc (≥ 2.17) and XeLaTeX. Without a TeX engine it still
writes the Markdown and a self-contained `.tex` (compile with XeLaTeX, e.g.
on Overleaf). Chinese works with or without xeCJK.

Then look at the pages, not just the log. 80–100 dpi shows layout; for
subscripts, small binomials or QED boxes, crop a region at 150 dpi
(`pdftoppm -r 150 -f P -l P -x X -y Y -W W -H H -png NAME.pdf crop`). Fix
broken math, lines running into the margin, diagrams, a reference list split
across pages, a near-empty last page; rebuild. Only the rendered pages show
these — a clean log is not enough.

### 8. Deliver
Send the PDF and the `.md` to the user with the session's file-delivery
tool, or, if there is none, give their paths. Mention that the `.src.md`
(editable source) and `.tex` exist and send them if asked. The final
message: what the note covers, the flavor card in one line, the blind
test's guess and whether it matched, and anything flagged (claims left
unverified, choices you made for the user). Do not restate the note's
contents.

## Source format

Pandoc Markdown with fenced divs. Title and metadata go in the front matter;
`#` is a section, `##` a subsection (both numbered), `###` an unnumbered
heading.

```markdown
---
title: "…"
subtitle: "…"            # optional
author: "…"              # optional, like the other fields
date: "…"
abstract: |
  …
lang: en                 # or zh
numbering: section       # theorem numbers 2.1, 2.2 … (default); or global / none
flavor-card: { … }       # not printed
---

\newcommand{\Hom}{\operatorname{Hom}}
\newcommand{\RR}{\mathbb{R}}

# Section title {#sec:intro}

::: {.theorem #thm:main title="Hartogs"}
Statement, with all hypotheses.
:::

::: proof
…
:::

::: {.proof title="Proof sketch"}
…
:::
```

- **Macros**: `\newcommand` lines right after the front matter, one per
  line; they are expanded in both outputs (Markdown viewers never see them).
- **Blocks**: `theorem lemma proposition corollary conjecture claim fact
  principle` (italic body); `definition example exercise problem
  construction axiom postulate notation question convention setup box`
  (upright); `remark note warning heuristic caution aside` (light head);
  `proof solution` (unnumbered, end with ∎/□).
- **Attributes**: `#id` to cross-reference; `title="…"` for the parenthetical
  name (may contain `$math$`); `name="…"` to print a different block name
  (`name="Important Exercise"`, `name="Box"`, `name="Main Theorem"`);
  `.unnumbered`.
- **Equations**: `$$ … \label{eq:energy} $$` numbers the display (2.1); one
  `\label` per display; inside `$$` use `aligned`, `gathered`, `cases`,
  `CD` — not `align` or `equation`.
- **References**: `@thm:main` → "Theorem 2.3", `[-@thm:main]` → "2.3",
  `@eq:energy` → "(2.1)", `@sec:intro` → "Section 1" (Chinese: 定理 2.3,
  第 1 节). Ids need a prefix such as `thm: lem: prop: cor: def: ex: rem: exr:
  eq: sec:` — then a typo is reported instead of silently printed, and the
  reference is found even when written flush against Chinese text.
- **Diagrams**: `\begin{CD}…\end{CD}` inside `$$` renders in both outputs.
  For anything else (`tikzcd`, TikZ pictures) use a raw block
  ```` ```{=latex} ```` — it appears in the PDF; the Markdown gets the code
  with a note pointing to the PDF.
- **Bibliography**: a final `# References {.unnumbered}` section with a
  numbered list, cited in the text as [1], [2]. Only verified entries.
- **Lettered parts** (a), (b), (c) — in a theorem, an exercise or a proof —
  are a list: a blank line before the first item, then one `(a) …` item per
  line (blank lines between items are fine). The PDF gets a real (a)/(b)
  list; the Markdown keeps the same labels, so "by (b)" still matches.
  Without the blank line before the list they run into the paragraph.
- **Tables**: pipe tables; inside cell math write `\lvert x \rvert`, not
  `|x|`. A small `array` in `$$` is an alternative.
- Footnotes `^[…]`, lists and `*emphasis*` work as in Pandoc. Use LaTeX
  math symbols rather than rare Unicode ones (the build reports any glyph
  the font lacks).
- Keep a blank line before and after every `:::` fence; nest blocks by
  using more colons on the outer fence (`::::`).

## Version

- v2 · 2026-10-28: flavor blind test for every note (a fresh subagent names the imitated author or genre from the built Markdown alone); references are verified with the citation-check skill, the single source of the citation rules; noted that research-writeup reuses the build script.
- v1 · 2026-10: first version.

© 2026 Zechen Bian · All rights reserved / 保留所有权利
