// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// Deep Learning Lab: put everything in src/ into one self-contained page (GitHub Pages runs no build).
//   node build.js                      writes index.html
//   node build.js --artifact <path>    also writes the variant published as a Claude Artifact (no document skeleton)
// What goes in: styles.css; KaTeX (CSS, fonts and script inlined); the Markdown and chart modules shared with the strategy
// lab (../strategy-lab/src/md.js, charts.js); the page modules in src/*.js; the notes (src/notes/*.md, parsed into blocks
// here); the experiment scripts (src/experiments/*.py) with the runtime src/labrt.py; the recorded reference runs
// (src/reference.json, made by test/make_reference.py); and the one dataset the page ships (data/tinyshakespeare.txt).
const fs = require('fs'), path = require('path');
const read = (...p) => fs.readFileSync(path.join(__dirname, ...p), 'utf8');

/* ---------- KaTeX (MIT), inlined so that formulas render without a network ---------- */
function katexDir() {
  for (const d of [process.env.KATEX_DIR, path.join(__dirname, 'node_modules/katex/dist'), path.join(__dirname, '../strategy-lab/node_modules/katex/dist'), path.join(__dirname, '../genesis-lab/node_modules/katex/dist'), '/opt/npm-tools/node_modules/katex/dist'])
    if (d && fs.existsSync(path.join(d, 'katex.min.js'))) return d;
  throw new Error('KaTeX not found: run npm install in strategy-lab/, or set KATEX_DIR=…/katex/dist');
}
const KATEX = katexDir(), KATEX_VER = JSON.parse(fs.readFileSync(path.join(KATEX, '../package.json'), 'utf8')).version;
function katexCss() {
  let css = fs.readFileSync(path.join(KATEX, 'katex.min.css'), 'utf8'), n = 0;
  css = css.replace(/src:url\(fonts\/([A-Za-z0-9_-]+)\.woff2\) format\("woff2"\),url\(fonts\/[^)]+\.woff\) format\("woff"\),url\(fonts\/[^)]+\.ttf\) format\("truetype"\)/g, (m, name) => { n++; return 'src:url(data:font/woff2;base64,' + fs.readFileSync(path.join(KATEX, 'fonts', name + '.woff2')).toString('base64') + ') format("woff2")'; });
  if (n !== 20 || css.includes('url(fonts/')) throw new Error('KaTeX fonts were not inlined: ' + n);
  return css;
}
const katexJs = fs.readFileSync(path.join(KATEX, 'katex.min.js'), 'utf8');

/* ---------- the notes: Markdown with a few directives -> blocks ---------- */
// :::lede … :::            opening paragraph            :::widget id          a figure to play with (src/widgets.js)
// :::four … :::            the unit in four questions   :::fig id | caption   a static diagram
// :::thm Kind | Name … [:::proof Title …] :::           a labelled statement, proof folded
// :::check … --- … :::     question and answer          :::exp id             pointer to an experiment
// :::bib … :::             "reference | url" lines for the Sources tab
// Each block gets a key (hash of its kind and beginning); remarks are anchored to these keys.
function hash(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); }
function parseNotes(md, file) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n'), blocks = [], bib = [], seen = {};
  let i = 0, para = [];
  const push = (b) => { let k = 'b' + hash(b.t + '|' + String(b.src || b.text || b.q || b.id || '').slice(0, 160)); while (seen[k]) k += 'x'; seen[k] = 1; b.k = k; blocks.push(b); };
  const flush = () => { if (para.length) { push({ t: 'md', src: para.join('\n') }); para = []; } };
  const two = (s) => { const j = s.indexOf('|'); return j < 0 ? [s.trim(), ''] : [s.slice(0, j).trim(), s.slice(j + 1).trim()]; };
  while (i < lines.length) {
    const ln = lines[i], m = /^:::(\w+)\s*(.*)$/.exec(ln);
    if (m) {
      flush();
      const name = m[1], arg = m[2].trim();
      if (name === 'widget') { push({ t: 'widget', id: arg }); i++; continue; }
      if (name === 'exp') { push({ t: 'exp', id: arg }); i++; continue; }
      if (name === 'fig') { const [id, cap] = two(arg); push({ t: 'fig', id, cap }); i++; continue; }
      const body = []; i++;
      while (i < lines.length && lines[i].trim() !== ':::') body.push(lines[i++]);
      if (i >= lines.length) throw new Error(file + ': directive :::' + name + ' is not closed');
      i++;
      if (name === 'lede') push({ t: 'lede', src: body.join('\n').trim() });
      else if (name === 'four') push({ t: 'four', src: body.filter((l) => l.trim()).join('\n\n') });
      else if (name === 'thm') {
        const [kind, title] = two(arg), pi = body.findIndex((l) => /^:::proof\b/.test(l));
        const b = { t: 'stmt', kind, name: title, src: (pi < 0 ? body : body.slice(0, pi)).join('\n').trim() };
        if (pi >= 0) { b.proofTitle = body[pi].replace(/^:::proof\s*/, '').trim() || 'Proof'; b.proof = body.slice(pi + 1).join('\n').trim(); }
        push(b);
      } else if (name === 'check') {
        const si = body.findIndex((l) => l.trim() === '---');
        if (si < 0) throw new Error(file + ': :::check needs a --- line between question and answer');
        push({ t: 'check', q: body.slice(0, si).join('\n').trim(), a: body.slice(si + 1).join('\n').trim() });
      } else if (name === 'bib') body.filter((l) => l.trim()).forEach((l) => { const [t, u] = two(l); bib.push(u ? { t, u } : { t }); });
      else throw new Error(file + ': unknown directive :::' + name);
      continue;
    }
    if (/^#{2,3}\s/.test(ln)) { flush(); push({ t: 'h', level: ln.startsWith('###') ? 3 : 2, text: ln.replace(/^#+\s+/, '') }); i++; continue; }
    if (!ln.trim()) { flush(); i++; continue; }
    para.push(ln); i++;
  }
  flush();
  return { blocks, bib, md: md.replace(/\n:::bib[\s\S]*?\n:::\s*$/, '\n').trim() };
}

/* ---------- assemble ---------- */
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c').split(LS).join('\\u2028').split(PS).join('\\u2029');
const shared = (f) => read('..', 'strategy-lab', 'src', f);
function scripts() {
  const notes = {}, scriptsPy = {};
  for (const [id, f] of [['u1', 'u01.md'], ['u2', 'u02.md'], ['u3', 'u03.md'], ['u4', 'u04.md'], ['u5', 'u05.md'], ['u6', 'u06.md'], ['u7', 'u07.md'], ['u8', 'u08.md'], ['u9', 'u09.md']]) notes[id] = parseNotes(read('src', 'notes', f), f);
  for (const f of fs.readdirSync(path.join(__dirname, 'src', 'experiments')).filter((x) => x.endsWith('.py')).sort()) scriptsPy[f.replace(/\.py$/, '')] = read('src', 'experiments', f);
  const data = 'DL.NOTES = ' + json(notes) + ';\nDL.SCRIPTS = ' + json(scriptsPy) + ';\nDL.LABRT = ' + json(read('src', 'labrt.py')) + ';\nDL.STANDALONE = ' + json(read('src', 'standalone.py')) +
    ';\nDL.REF = ' + json(JSON.parse(read('src', 'reference.json'))) + ';\nDL.DATA = { tinyshakespeare: ' + json(read('data', 'tinyshakespeare.txt')) + ' };';
  const parts = [shared('md.js'), shared('charts.js'), read('src', 'core.js'), read('src', 'course.js'), data];
  for (const f of ['widgets.js', 'experiments.js', 'engine.js', 'tutor.js', 'remarks.js', 'outputs.js', 'train.js', 'app.js']) parts.push(read('src', f));
  const all = parts.join('\n');
  if (/<\/script/i.test(all + katexJs)) throw new Error('a script contains </script');
  // every experiment the notes point to, and every reference run a preset names, must exist
  const ref = JSON.parse(read('src', 'reference.json'));
  for (const u of Object.values(notes)) for (const b of u.blocks) if (b.t === 'exp' && !scriptsPy[b.id]) throw new Error('the notes point to a missing experiment: ' + b.id);
  for (const m of read('src', 'experiments.js').matchAll(/ref: "([^"]+)"/g)) if (!ref[m[1]]) console.warn('  note: no reference run recorded for ' + m[1]);
  return all;
}
function build() {
  let t = read('src', 'template.html');
  const fill = (slot, text) => { if (!t.includes(slot)) throw new Error('template.html has no slot ' + slot); t = t.replace(slot, () => text); };
  fill('__STYLES__', read('src', 'styles.css').replace(/^\/\* Copyright[\s\S]*?\*\/\n/, ''));
  fill('__KATEX_CSS__', '<style>\n/* KaTeX ' + KATEX_VER + ': MIT License, (c) Khan Academy and other contributors; fonts under the SIL Open Font License 1.1. See THIRD-PARTY-NOTICES.md */\n' + katexCss() + '\n</style>');
  fill('__KATEX_JS__', '<script>\n/* KaTeX ' + KATEX_VER + ', MIT License, (c) Khan Academy and other contributors. https://github.com/KaTeX/KaTeX */\n' + katexJs + '\n</script>');
  fill('__SCRIPTS__', scripts());
  return t;
}
const page = build();
fs.writeFileSync(path.join(__dirname, 'index.html'), page);
console.log('index.html written,', page.length, 'characters');

// The Artifact variant: Claude wraps the page in its own document skeleton, so the skeleton tags are removed here. The
// doctype stays: an Artifact published from files is served as it is, and without a doctype the page runs in quirks mode,
// where KaTeX refuses to render (every formula then shows its TeX source).
const ai = process.argv.indexOf('--artifact');
if (ai > 0 && process.argv[ai + 1]) {
  let a = page.replace(/<!doctype html>\s*<!--[\s\S]*?-->\s*/i, '').replace(/<html[^>]*>|<\/html>|<head>|<\/head>|<body>|<\/body>/g, '').replace(/<meta charset="utf-8">\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
  a = a.replace('<title>Deep Learning Lab</title>', '<title>Deep Learning Lab</title>\n<meta name="claude:viewport-fit-sides" content="cover">');
  a = '<!DOCTYPE html>\n<!-- Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。 -->\n' + a.replace(/^\s+/, '');
  fs.writeFileSync(process.argv[ai + 1], a);
  console.log('artifact variant written to', process.argv[ai + 1] + ',', a.length, 'characters');
}
