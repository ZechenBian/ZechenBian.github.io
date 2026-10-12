# Challenge contract — "rediscover the Nobel" puzzles (read fully)

The site is being rebuilt from "explain the answer" into "rediscover it yourself". For each prize the
reader first sees the phenomenon / real-world difficulty of the time, then works through 2–4 staged
puzzles that let them reconstruct the key observation and idea *themselves* — by measuring, fitting,
predicting, building, counting. Do not hand them the formula or the conclusion in task text. The
reader is a pure-math PhD student (sharp, likes quantitative reasoning, Chinese native speaker).
All visible text in Simplified Chinese; symbols/units in Latin.

## Files
- READ FIRST: `/home/claude/nobel/src/core.js` (helpers `H.el, slider, choice, toggle, button, readout, canvas, loop, axes, wavelengthRGB` and the NEW framework `H.stages`, `H.answer`, `H.quiz` at the bottom — read their doc comments carefully).
- Look at the existing "answer demo" lab for your prize in `/home/claude/nobel/src/labs/<id>.js` (if any). You may copy physics/math code from it (copy, don't import), but the challenge is a different, puzzle-style experience.
- You write: `/home/claude/nobel/src/challenges/<id>.js`, an IIFE that sets `CHALLENGES.<id> = { title, mount(root, ctx) { return H.stages(root, ctx, [...]) } }`.
- CSS classes available (already styled): `lab-stage`, `lab-controls`, `lab-readout`, `lab-hint`, `lab-canvas`, `ctl…`, `btn`, `btn-primary`, `btn-ghost`, `ro…`, `dtable` (wrap a <table> in div.dtable for data tables), plus the stage/quiz/answer classes the helpers emit. If you need a few extra styles, inject one <style> element with classes prefixed by your id (e.g. `.planck-…`) once (check `document.getElementById('st-<id>')` first) and use only CSS variables for colours.

## Stage design rules
- Each stage = a concrete task with a checkable success condition the code verifies (numeric answer within tolerance via `H.answer`, a fit-quality threshold reached by sliders, a correct construction, a correct `H.quiz` choice after the data justify it). Call `api.done('<b>…</b> 一句话说明他们发现了什么')` on success — the success message may now name the concept, since they earned it.
- `task` HTML: the situation and the question, as a scientist of that time would face it. Give data and instruments, not conclusions. TeX allowed with `$…$` (call `api.typeset(node)` for TeX you insert later). Use `\lt` instead of a raw `<` inside TeX.
- 2–3 `hints` per stage, progressively stronger; the last hint nearly gives it away. `answer`: the full answer with a short derivation (shown only on give-up).
- Prefer "measure it yourself" over showing numbers: e.g. a retarding-voltage sweep the reader performs, a ruler they drag on a diffraction picture, a curve they click to mark a peak. Experimental data should have realistic noise (seeded PRNG so it's reproducible, e.g. mulberry32).
- Accept equivalent answers generously (units, tolerance ±3–10% as appropriate; mention the tolerance in the label).
- Every interactive canvas also needs a non-pointer path (slider/buttons) so keyboard users can finish.
- Colours via `ctx.color('--token')` read at draw time (tokens: --fg --muted --line --grid --panel --bg --bg2 --accent --s1..--s4 --good --warn --phy --chem --med, fonts --mono-font --body-font). Canvas background = --panel. Redraw on theme change: a MutationObserver on documentElement attributes + matchMedia('(prefers-color-scheme: dark)') change listener.
- Layout must work from 340px to 900px wide. Long tables/sequences scroll inside their own `overflow-x:auto` container.
- Stage `build` returns `{destroy()}` that stops loops/audio/observers.
- ctx.reduced → no ambient animation.
- No network, no alert/confirm/prompt, no localStorage (the page stores progress itself).

## Verify
1. `node --check` your file.
2. Run the harness: `cd /home/claude/nobel && python3 tools/harness.py <id> <your scratch dir>` → prints errors and overflow for 760px dark and 380px light, and saves screenshots. Look at the screenshots (Read the png). Fix errors / overflow (scroll width must equal inner width).
3. Drive your puzzles end-to-end at least once with Playwright (import tools/harness.py's `build`, open the page, solve each stage programmatically by filling inputs / moving sliders / clicking) and confirm each stage calls `done` (check `window.__events` for ['mark', i, false]) and that the final stage fires ['complete', …]. Also confirm your numeric checkers accept the true answer and reject a clearly wrong one.
4. Keep scratch files out of src/. Reply briefly: file path, the stages (one line each: what the reader does → what they rediscover), and what you verified.
