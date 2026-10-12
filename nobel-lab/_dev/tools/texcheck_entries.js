// Usage: node tools/texcheck_entries.js [id ...]
// Loads content1-3 + src/entries/*.js in a sandbox, validates every $…$ / $$…$$ TeX segment with KaTeX,
// and checks entry fields / no-raw-"<" inside TeX / balanced $ signs. Exit code 1 on any problem.
const fs = require('fs'), path = require('path'), vm = require('vm');
const katex = require('/opt/npm-tools/node_modules/katex');
const SRC = '/home/claude/nobel/src';
const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
const files = ['content1.js', 'content2.js', 'content3.js'].map((f) => path.join(SRC, f))
  .concat(fs.readdirSync(path.join(SRC, 'content')).filter((f) => f.endsWith('.js')).sort().map((f) => path.join(SRC, 'content', f)));
for (const f of files) {
  try { vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }); }
  catch (e) { console.log('LOAD ERROR', f, e.message); process.exitCode = 1; }
}
const only = process.argv.slice(2);
const REQ = ['id', 'field', 'year', 'who', 'citation', 'title', 'formula', 'one', 'teaser', 'scenario', 'puzzle', 'observation', 'idea', 'math', 'labNote', 'legacy', 'myths', 'papers'];
const fsx = require('fs');
let bad = 0;
function texChunks(s) {
  const out = []; const re = /\$\$([\s\S]*?)\$\$|\$([^$]*?)\$/g; let m;
  while ((m = re.exec(s))) out.push({ tex: m[1] ?? m[2], display: m[1] != null });
  const stripped = s.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/\$[^$]*?\$/g, '');
  if (stripped.includes('$')) out.push({ odd: true });
  return out;
}
function check(id, where, s) {
  if (typeof s !== 'string') return;
  for (const c of texChunks(s)) {
    if (c.odd) { console.log(`[${id}] ${where}: unbalanced $`); bad++; continue; }
    if (/<[A-Za-z!\/]/.test(c.tex)) { console.log(`[${id}] ${where}: raw '<' in TeX (use \\lt): ${c.tex.slice(0, 60)}`); bad++; }
    try { katex.renderToString(c.tex, { throwOnError: true, strict: 'ignore', displayMode: c.display }); }
    catch (e) { console.log(`[${id}] ${where}: TeX error: ${e.message.split('\n')[0]} :: ${c.tex.slice(0, 80)}`); bad++; }
  }
}
for (const e of ctx.ENTRIES) {
  if (only.length && !only.includes(e.id)) continue;
  for (const k of REQ) if (e[k] == null || (Array.isArray(e[k]) && !e[k].length)) { console.log(`[${e.id}] missing field ${k}`); bad++; }
  if (!['phy', 'chem', 'med', 'econ'].includes(e.field)) { console.log(`[${e.id}] bad field ${e.field}`); bad++; }
  if (!(e.stages || (ctx.STAGE_COUNT && ctx.STAGE_COUNT[e.id]))) { console.log(`[${e.id}] stage count missing`); bad++; }
  for (const d of ['challenges', 'labs']) if (!fsx.existsSync(path.join(SRC, d, e.id + '.js'))) { console.log(`[${e.id}] missing ${d}/${e.id}.js`); bad++; }
  for (const [k, v] of Object.entries(e)) {
    if (typeof v === 'string') check(e.id, k, k === 'formula' ? '$' + v + '$' : v);
    else if (Array.isArray(v)) v.forEach((x, i) => typeof x === 'string' ? check(e.id, `${k}[${i}]`, x) : null);
  }
}
const ids = ctx.ENTRIES.map((e) => e.id);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i); if (dup.length) { console.log('duplicate ids', dup); bad++; }
for (const L of ctx.LINKS || []) if (!ids.includes(L.a) || !ids.includes(L.b)) { console.log('link to unknown id', L.a, L.b); bad++; }
for (const e of ctx.ENTRIES) for (const l of e.links || []) if (!ids.includes(l.to)) console.log(`[${e.id}] (info) link to not-yet-built id ${l.to}`);
console.log(`entries=${ctx.ENTRIES.length} checked=${only.length ? only.join(',') : 'all'} problems=${bad}`);
if (bad) process.exitCode = 1;
