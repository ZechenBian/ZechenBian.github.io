// Usage: node tools/check_content.js <id>   — validates src/content/<id>.js
const fs = require('fs'), path = require('path');
const katex = require('/opt/npm-tools/node_modules/katex');
const id = process.argv[2];
if (!id) { console.error('usage: node tools/check_content.js <id>'); process.exit(2); }
const file = path.join(__dirname, '..', 'src', 'content', id + '.js');
global.window = global; global.ENTRIES = []; global.LINKS = [];
eval(fs.readFileSync(file, 'utf8'));
const e = ENTRIES.find((x) => x.id === id);
let bad = 0; const err = (m) => { console.log('ERROR', m); bad++; }; const warn = (m) => console.log('warn ', m);
if (!e) { err('no entry with id ' + id); process.exit(1); }
const req = ['id','field','year','who','citation','title','formula','one','short','teaser','scenario','stages','puzzle','observation','idea','math','labNote','legacy','myths','papers','links'];
for (const k of req) if (e[k] == null) err('missing field ' + k);
if (!['phy','chem','med','econ'].includes(e.field)) err('field must be phy|chem|med|econ');
if (!Array.isArray(e.who) || !e.who.every((w) => w.zh && w.en && w.share)) err('who: [{zh,en,share}]');
if (!(e.stages >= 2 && e.stages <= 5)) err('stages must be 2..5');
if (!Array.isArray(e.myths) || e.myths.length < 2) err('myths: ≥2');
if (!Array.isArray(e.papers) || e.papers.length < 2) err('papers: ≥2');
if (!Array.isArray(e.links) || !e.links.every((l) => l.to && l.label)) err('links: [{to,label}]');
const ALL = ['planck','einstein','bohr','schrodinger','ligo','curie','haber','giauque','dna','hh','crispr',
 'rontgen','transistor','laser','bcs','qhe','darkenergy','higgs','topo','bell','nn',
 'pauling','ziegler','pcr','ozone','fullerene','superres','liion','protein',
 'neuron','insulin','penicillin','operon','vision','hiv','ips','artemisinin','circadian','checkpoint','mrna',
 'arrow','solow','nash','options','lemons','kahneman','ostrom','matching','assetprice','rct'];
(e.links || []).forEach((l) => { if (!ALL.includes(l.to)) err('links.to unknown id ' + l.to); if (l.to === id) err('self link'); });
const plain = (s) => String(s).replace(/<[^>]+>/g, '');
if (plain(e.teaser).length > 40) warn('teaser longer than 40 chars');
if (plain(e.scenario).length < 150) warn('scenario seems short');
if (plain(e.math).length < 600) warn('math section seems short (wants definitions, statements, derivations)');
// TeX checks
for (const [k, v] of Object.entries(e)) {
  const texts = typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  for (const t of texts) {
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(t)) err(`control character in ${k} (use String.raw / double backslashes)`);
    const noDD = t.replace(/\$\$[\s\S]*?\$\$/g, '');
    if ((noDD.match(/(?<!\\)\$/g) || []).length % 2) err(`odd number of $ in ${k}`);
    const chunks = [...t.matchAll(/\$\$([\s\S]*?)\$\$|\$([^$]*?)\$/g)].map((m) => m[1] ?? m[2]);
    for (const c of chunks) {
      let d = 0; for (const ch of c.replace(/\\[{}]/g, '')) { if (ch === '{') d++; if (ch === '}') d--; if (d < 0) break; }
      if (d !== 0) err(`unbalanced braces in TeX (${k}): ${c.slice(0, 60)}`);
      if (/<(?=[A-Za-z!\/])/.test(c)) err(`raw "<" followed by a letter inside TeX (${k}) — use \\lt: ${c.slice(0, 60)}`);
      if (/\\\\(frac|mathrm|nu|alpha|beta)/.test(c)) warn(`double backslash before a command in ${k} — intended? ${c.slice(0, 40)}`);
      try { katex.renderToString(c, { throwOnError: true, strict: 'ignore' }); } catch (ex) { err(`TeX does not parse (${k}): ${String(ex.message).split('\n')[0]} :: ${c.slice(0, 60)}`); }
    }
  }
}
try { katex.renderToString(String(e.formula), { throwOnError: true, strict: 'ignore' }); } catch (ex) { err('formula TeX does not parse: ' + String(ex.message).split('\n')[0]); }
// HTML balance (rough)
for (const k of ['scenario','puzzle','observation','idea','math','legacy']) {
  const s = String(e[k] || '');
  for (const tag of ['p','ul','ol','li','b','i','em','strong']) {
    const o = (s.match(new RegExp('<' + tag + '[ >]', 'g')) || []).length, c = (s.match(new RegExp('</' + tag + '>', 'g')) || []).length;
    if (o !== c) err(`<${tag}> open/close mismatch in ${k} (${o} vs ${c})`);
  }
}
console.log(bad ? `${bad} error(s)` : 'OK', '—', id, e.year, e.field, 'stages=' + e.stages);
process.exit(bad ? 1 : 0);
