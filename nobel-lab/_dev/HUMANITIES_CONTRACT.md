# Humanities module contract (Literature / Peace experiences)

These are not puzzles with right answers; they are short interactive experiences (mini-games, interactive
animations, simulations) that let a reader *feel* the deeper meaning of a Nobel Literature or Peace prize
and the social / cultural / historical change around it. Reader: a Chinese pure-math PhD student, curious,
reads Simplified Chinese natively; they want depth, not a textbook summary. All visible text in Simplified
Chinese (proper names may add the original in parentheses).

## Files
- READ FIRST: `/home/claude/nobel/src/core.js` (global `H`: el, slider, choice, toggle, button, readout, canvas,
  loop, axes, quiz, answer, stages…) and the CSS tokens/classes in `/home/claude/nobel/src/head.html`.
- You write ONE file: `/home/claude/nobel/src/humanities/<id>.js`, an IIFE that sets
  `window.HUM = window.HUM || {}; HUM.<id> = { title, mount(root, ctx) { …; return { destroy() {} } } }`.
- ctx = { color(token), reduced, h: H, typeset(node) }.
- Structure the experience as a sequence of "chapters" (幕) the reader moves through (a chapter nav strip at top,
  next/prev buttons at the bottom of each). Each chapter = a short framing paragraph + one interactive piece +
  a short "这一幕想说的" reflection that opens after the reader has interacted. End with a closing chapter that
  ties the work/prize to the social and cultural change of its time and afterwards.
- Styles: reuse existing classes (bench, btn, btn-primary, btn-ghost, seg/segs, ctl*, ro*, quiz*, dtable, lab-canvas…).
  For extra styles inject ONE <style id="st-<id>"> (check it doesn't exist) with classes prefixed `<id>-`, colours only
  from CSS tokens (--bg --bg2 --panel --fg --muted --line --grid --accent --s1..--s4 --good --warn --phy --chem --med,
  fonts --display-font --cjk-display --body-font --mono-font). It must look right in light AND dark themes.
- Canvas: background --panel, read tokens at draw time, redraw on theme change (MutationObserver on documentElement
  attributes + matchMedia('(prefers-color-scheme: dark)') listener). Respect ctx.reduced (no ambient animation; give
  a step/“next” control instead). Work from 340px to 1000px wide; no horizontal page overflow (wide things scroll
  inside their own overflow-x:auto box). Keyboard-operable alternatives for every pointer interaction.
- No network, no alert/confirm/prompt, no localStorage, no external images. Draw everything (Canvas/SVG/CSS).
  Audio only after a button press, stopped in destroy().

## Accuracy & copyright (strict)
- Historical facts must be accurate; where numbers are disputed, say so and give the range. Where you simplify into
  a game model, label it 简化/示意 in the UI.
- Do NOT reproduce text from copyrighted works (novels, speeches, lectures, songs) — not in Spanish, English or any
  Chinese translation. No quotations at all from the novel; at most one quotation under 15 words from any speech,
  and prefer paraphrase. Describe scenes and ideas in your own words. Character and place names are fine.
- No political opinions of your own; present perspectives and evidence fairly; note controversies factually.

## Verify
1. `node --check`.
2. Make a quick harness in your scratch dir: an HTML page = contents of src/head.html (strip the MathJax <script> tag)
   + `<div class="wrap"><div id="root"></div></div>` + <script> of src/core.js + your file + a boot script that mounts
   `HUM.<id>` with ctx {color: n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim(), reduced:false, h:H, typeset(){}}.
   Load it with Playwright (python, chromium) at 1000px dark and 380px light, abort http requests, click through every
   chapter and interaction, collect console errors, check document.documentElement.scrollWidth == innerWidth, and
   screenshot each chapter. READ the screenshots and fix what looks wrong.
3. Reply briefly: file path, the chapters (one line each: what the reader does → what they come to understand),
   facts you relied on that a reviewer should double-check, and what you verified. Keep scratch files out of src/.
