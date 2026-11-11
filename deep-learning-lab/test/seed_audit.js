// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* Does every question have one answer, whatever the random seed?
 *     node test/seed_audit.js [seeds = 40] [experiment id prefix, e.g. u03]
 * Each preset of each numpy experiment is run with the seeds 1..N through the engine code, and its judge (the function
 * the page uses to say which option came true) is applied to every run. A preset passes when all seeds give the option
 * that its reference run gives. The reader can change the seed, so a question whose answer depends on it would tell
 * some readers that a correct prediction "missed". PyTorch presets are skipped here (they need the Mac).
 * Takes about ten minutes; it is not part of the automatic checks. */
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const root = path.join(__dirname, '..'), N = +process.argv[2] || 40, ONLY = process.argv[3] || '';   // e.g. 40 u03: only experiments whose id starts with u03
global.window = global;
global.DL = { num: String, pct: String, secs: String, SCRIPTS: {}, REF: JSON.parse(fs.readFileSync(path.join(root, 'src/reference.json'), 'utf8')) };
(0, eval)(fs.readFileSync(path.join(root, 'src/experiments.js'), 'utf8'));

const presets = [];
for (const exp of DL.EXPERIMENTS) if (exp.lib === 'numpy' && exp.id.startsWith(ONLY)) for (const p of exp.presets || []) presets.push({ exp, p });
// presets of one experiment that use the same parameters share their runs
const runs = [], key = (x) => x.exp.id + ' ' + JSON.stringify(Object.keys(x.p.set).sort().map((k) => [k, x.p.set[k]]));
const index = new Map();
for (const x of presets) if (!index.has(key(x))) { index.set(key(x), runs.length); runs.push({ exp: x.exp.id, set: x.p.set }); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-seeds-')), fin = path.join(tmp, 'runs.json'), fout = path.join(tmp, 'out.json');
fs.writeFileSync(fin, JSON.stringify(runs));
const py = spawnSync('python3', [path.join(__dirname, 'seed_audit.py'), fin, fout, String(N)], { stdio: ['ignore', 'inherit', 'inherit'] });
if (py.status !== 0) { console.error('the runs failed'); process.exit(1); }
const results = JSON.parse(fs.readFileSync(fout, 'utf8'));
fs.rmSync(tmp, { recursive: true, force: true });

let bad = 0;
for (const x of presets) {
  const rows = results[index.get(key(x))], ref = DL.REF[x.p.ref];
  // a preset that compares with another run of the same seed (base) takes that run's number from the audit as well
  let baseRows = null;
  if (x.p.base) { const b = x.exp.presets.find((q) => q.id === x.p.base.preset); baseRows = results[index.get(key({ exp: x.exp, p: b }))]; }
  const want = x.p.judge(ref.results, x.p.base ? { base: DL.REF[x.p.base.ref].results[x.p.base.key] } : {});
  const count = x.p.opts.map(() => 0); let failed = 0;
  rows.forEach((r, i) => { if (!r) { failed++; return; } const j = x.p.judge(r, baseRows && baseRows[i] ? { base: baseRows[i][x.p.base.key] } : {}); if (j == null) failed++; else count[j]++; });
  const ok = !failed && count[want] === rows.length;
  if (!ok) bad++;
  console.log((ok ? '  ok  ' : '  FAIL ') + x.exp.id + '/' + x.p.id + ': ' + x.p.opts.map((o, i) => count[i] + (i === want ? '*' : '')).join(' / ') + (failed ? ', ' + failed + ' runs without an answer' : '') + '   (* = the reference run\'s answer: "' + x.p.opts[want] + '")');
}
console.log(bad ? bad + ' of ' + presets.length + ' questions depend on the seed' : 'all ' + presets.length + ' numpy questions give the same answer for the seeds 1 to ' + N);
process.exit(bad ? 1 : 0);
