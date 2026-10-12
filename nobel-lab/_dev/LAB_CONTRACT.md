# Lab contract (read fully before writing)

You are writing one or two interactive "labs" for a Chinese-language website that explains classic Nobel Prize breakthroughs. Audience: a pure-math PhD student who wants to *see* the key observation and *play* with it. Labs must be correct physics/chemistry/biology, not decoration.

## Files
- Shared helpers: `/home/claude/nobel/src/core.js` — READ IT FIRST. It defines global `H` (el, slider, choice, toggle, button, readout, canvas, loop, axes, wavelengthRGB) and `window.LABS`.
- You write: `/home/claude/nobel/src/labs/<id>.js` — plain browser JS (no modules, no imports, no libraries). Wrap everything in an IIFE so nothing leaks except the `LABS.<id>` assignment.

## Shape
```js
(() => {
  LABS.<id> = {
    title: '中文实验名（短）',
    mount(root, ctx) {
      const h = ctx.h;              // same as global H
      // build inside root, using this structure:
      // root
      //  ├─ div.lab-stage      (one or more canvases via h.canvas(stage, {...}); can hold small overlay text)
      //  ├─ div.lab-controls   (sliders/choices/toggles/buttons from h.*; they lay themselves out in a wrapping grid)
      //  ├─ div.lab-readout    (h.readout(...) rows: live numbers with units)
      //  └─ p.lab-hint         (1–2 sentences in Chinese: what to try, what to notice)
      return { destroy() { /* stop loops, h.canvas(...).destroy(), remove listeners */ } };
    }
  };
})();
```
- `root` is an empty div already in the page. It may be ~340px wide on phones and ~640px on desktop — everything must work at both. Canvases track width automatically via `h.canvas`; redraw in `onResize`.
- Colors: NEVER hard-code theme colors. Read tokens each draw: `ctx.color('--fg')`, `--muted`, `--line`, `--grid`, `--panel` (canvas background), `--accent` (gold highlight), series colors `--s1 --s2 --s3 --s4`, semantic `--good --warn`. The theme can switch at runtime. Physical colors (e.g. spectral line colours from `h.wavelengthRGB`) are fine as literals.
- Fonts on canvas: `ctx.color('--mono-font')` gives a monospace family, `ctx.color('--body-font')` the body family. Use 11–13px.
- Clear each canvas with `--panel` fill at the start of every draw.
- Animation: use `h.loop`. If `ctx.reduced` is true, don't run ambient animation; draw static frames (step on user input). Stop loops in destroy(). Prefer only animating while something is changing, or keep it light.
- All visible text in Simplified Chinese (units and symbols in Latin: nm, eV, K, atm, mV, Hz, M☉). Keep labels short.
- Readouts use tabular numbers and real units. Show the governing formula's live values where it helps (e.g. `Eₖ = hν − W = 1.23 eV`).
- No alert/confirm/prompt, no network, no localStorage. Audio only from a button press (WebAudio), and stop it in destroy().
- Keyboard: sliders/buttons from helpers are already accessible. If you add click-on-canvas interaction, also give an equivalent control (button/choice) so it works without pointer precision.
- Pointer interactions on canvas: use pointer events; account for CSS px (canvas coordinates == CSS px because h.canvas sets the transform).

## Quality bar
- Physically/biologically correct numbers and formulas (state constants you use in comments).
- Opens in a meaningful, already-interesting state (not blank).
- The single key insight must be visible within 5 seconds of playing.
- Code ~150–350 lines per lab, clean, commented briefly.

## Verify before finishing
1. `node --check /home/claude/nobel/src/labs/<id>.js`
2. Write a tiny Node test in the scratchpad that loads core.js-free math (copy your pure functions or structure them so they can be required) and prints a few key numbers to confirm correctness (e.g. Wien peak at 5800 K ≈ 500 nm). Do not leave test files in src/.
3. Reply with: file path(s), a 3-line summary of what each lab shows, and the numeric sanity checks you ran. Do not paste the code back.
