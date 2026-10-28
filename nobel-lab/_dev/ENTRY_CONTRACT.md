# Entry contract — one complete Nobel entry = content + challenge + demo lab

The site 诺奖思想实验室 is growing from 11 to 50 science entries (physics, chemistry, physiology/medicine,
economics). Each entry is a "rediscovery" experience: the reader first meets the phenomenon / real
difficulty of that time, then solves 2–4 staged puzzles that let them reconstruct the key observation
and idea themselves; after they finish, the full story (history, core observation, core idea,
derivations, impact, misconceptions, original papers) unlocks next to a small "answer demo" lab.

Reader: a pure-math PhD student (UC Berkeley), native Chinese speaker, sharp, loves quantitative
reasoning and wants real depth — definitions, precise statements, derivations / proof sketches, not
pop-science. All visible text in Simplified Chinese; symbols, units and proper names may be Latin.

For EACH entry assigned to you, you write THREE files (ids are fixed — use exactly the id you were given):

| file | global | contract |
|---|---|---|
| `src/content/<id>.js`    | pushes into `ENTRIES` | this document, section A |
| `src/challenges/<id>.js` | `CHALLENGES.<id>`     | `nobel-lab/_dev/CHALLENGE_CONTRACT.md` (READ IT) |
| `src/labs/<id>.js`       | `LABS.<id>`           | `nobel-lab/_dev/LAB_CONTRACT.md` (READ IT) — compact (≈150–300 lines); it may reuse the simulation you wrote for the challenge (copy the code; files must be independent) and should let the reader play freely with the answer exposed |

Read `nobel-lab/src/core.js` (helpers H.*, H.stages, H.answer, H.quiz) and look at good
existing examples before starting:
- content: `src/content1.js` (entry `planck`) and `src/content3.js` (entry `giauque`) — match their depth and tone.
- challenges: `src/challenges/planck.js`, `src/challenges/hh.js`, `src/challenges/giauque.js`.
- labs: `src/labs/hh.js`, `src/labs/giauque.js`.
Do NOT modify any file you were not assigned (core.js, app.js, head.html, other entries…). If you think
core needs a change, work around it inside your own files and mention it in your reply.

## A. Content file `src/content/<id>.js`

Wrap in an IIFE so nothing leaks: `(() => { const R = String.raw; ENTRIES.push({ ... }); })();`
Use `R\`…\`` for every string that contains TeX or backslashes (plain '…' strings turn `\n`, `\t`, `\f`, `\b`, `\v` into control characters — the checker catches this).

Fields (all required):
- `id`, `field` ('phy' | 'chem' | 'med' | 'econ'), `year` (prize year), optional `awarded` (only if the
  prize was reserved and given a year later).
- `who`: `[{ zh: '中文名', en: 'Original Name', share: '全奖' | '1/2' | '1/3' | '1/4' }]` — ALL laureates
  of that prize, even those not central to your story (say in the content who did what).
- `short`: very short display name for graph nodes, e.g. '伦琴', '肖克利 · 巴丁 · 布拉顿', 'LIGO 三人'.
- `citation`: faithful Chinese translation of the official prize motivation (given to you below; for split
  prizes include both parts, labelled).
- `title`: name of the breakthrough (may contain $TeX$), revealed only after solving. `formula`: one short
  TeX expression that captures it (no $ delimiters). `one`: one or two sentences — the core insight
  (revealed only after solving).
- `teaser` (≤ ~30 Chinese chars): the question/phenomenon as a hook. MUST NOT give away the answer.
- `scenario` (HTML, 2–3 <p>): the era, what was known, the instruments/data at hand, the difficulty, and
  the reader's task — written as "你" in that time and place. MUST NOT reveal the discovery.
- `stages`: number of stages in your challenge (must match the challenge exactly).
- `puzzle` (HTML): 历史背景 — the state of knowledge and the problem (revealed after solving).
- `observation` (HTML): 核心观察 — the decisive observations/experiments, with real numbers, dates, people.
- `idea` (HTML): 核心思想 — what was understood and why it was a breakthrough.
- `math` (HTML, the longest section): 推导与公式 — numbered parts `<p><b>1. …</b></p>`; definitions,
  precise statements (命题/定理 where appropriate), derivations or proof sketches (`<i>证明梗概。</i>… ∎`),
  key numbers worked out. Display math with `$$…$$`, inline `$…$`. Use `\lt` / `\gt` instead of raw `<` `>`
  inside TeX. For economics, write the actual models (utility maximisation, fixed points, Itô, etc.).
- `labNote`: one or two sentences telling the reader what to try in the demo lab.
- `legacy` (HTML list): what followed — later prizes, technologies, societal impact; connect to
  2020s where relevant.
- `myths`: ≥2 strings, each "“常见说法。”纠正。"
- `papers`: ≥2 key original references as HTML strings (authors, title, journal, volume, page (year)).
- `links`: 1–3 `{ to: '<other id>', label: '短语' }` to related entries in the 50-entry set (ids listed in
  tools/check_content.js), meaning "this idea leads to / builds on that one"; the label is shown on the
  idea-lineage graph only after both ends are solved, so it may name concepts.

Style: plain, precise Chinese; short sentences; no hype; no em-dash asides; numbers with units. Facts must
be accurate (dates, names, numbers); when a number is disputed or approximate, say so. Simplifications in
games must be labelled 简化/示意 in the UI. Copyright: no quotations from copyrighted texts beyond a few
words (prefer none) — paraphrase; never reproduce song lyrics/poems. Political/ethical controversies:
state facts neutrally.

Validate: `node tools/check_content.js <id>` must print OK (it also parses every TeX snippet with KaTeX —
the site renders with MathJax, which accepts everything KaTeX accepts; keep to standard LaTeX math).

## B. Challenge & lab
Follow CHALLENGE_CONTRACT.md and LAB_CONTRACT.md. Make the stages genuinely about *reconstructing* the
discovery: measure, fit, count, design, predict — with checks the code verifies; hints that escalate;
give-up answers with the reasoning. The challenge's stage titles and task texts must not spoil later
stages. Success messages may name the concept. 2–4 stages (usually 3).

## C. Verify (all must pass before you reply)
1. `node --check` on all three files; `node tools/check_content.js <id>` → OK;
   `python3 tools/texcheck_ui.py <id>` → 0 problems (it builds every stage eagerly, parses every TeX string in
   tasks / hints / answers / quiz / answer labels, and mounts the lab).
2. `python3 nobel-lab/_dev/tools/harness.py <id> <your scratch dir>` → no errors, scroll width
   == inner width at 760 and 380; READ the two screenshots and fix visual problems.
3. A Playwright script that solves every stage end-to-end (events `['mark', i, false]` for each stage and a
   final `['complete', …]`), and confirms checkers reject an obviously wrong answer.
4. The machine has only 2 CPUs and 8 GB RAM shared with ~12 other builders. EVERY Playwright/Chromium run
   must hold the shared lock: `tools/harness.py` and `tools/texcheck_ui.py` already take it; in your own
   scripts wrap the browser in `with browser_lock():` (see `tools/browserlock.py`) or launch them with
   `flock /tmp/nobel-browser.lock python3 your_script.py`. Keep each run short (one browser, close it at once,
   no long sleeps), use generous timeouts, never leave servers or browsers running.
   An earlier run of this build crashed the machine by running ~20 browsers at once — do not repeat that.
5. Keep scratch files out of `src/`. Reply briefly: the files, one line per stage (what the reader does →
   what they rediscover), facts a reviewer should double-check, and what you verified.

## D. Whole-site preview (optional but recommended once per entry)
`python3 build.py <your scratch dir>/site.html` builds the full site with every finished entry; open
`file://…/site.html#<id>` (under the browser lock) to see your entry in the real page: scenario → challenge →
「直接揭晓」→ story + demo lab. Other builders' half-written files may exist; if the build breaks because of
someone else's file, ignore it and test with tools/harness.py instead. NEVER edit build.py, app.js, core.js,
head.html or anyone else's files.

## E. Resuming
If a file for your id already exists from an earlier, interrupted run, read it first. Keep it if it is good
(fix what is wrong), otherwise replace it. Scratch from that run may be in the scratchpad's e01…e09 folders.
