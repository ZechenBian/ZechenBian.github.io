// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 在 Node 里按页面同样的办法取"现算的数"（不开线程池，直接调 QL.live 里的函数），供测试用。
// 对照表整张算一遍要一分钟左右，所以按源码的内容做了缓存（test/.cache/，不随页面发布）。
const path = require("path"), fs = require("fs"), crypto = require("crypto");
const { QL, STRATS, compile } = require("./harness.js");
const LV = QL.live, SRC = path.join(__dirname, "../src");
const samples = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/samples.json"), "utf8"));
const builtins = STRATS.filter(s => !s.src);
function series(id) { const o = samples.find(s => s.id === id); return o ? { v: Float64Array.from(o.v), K: o.K } : null; }
function sig() {
  const h = crypto.createHash("sha1");
  ["ml.js", "games.js", "obs-games.js", "live.js", "core.js", "strategies.js", "models.js", "game-strats.js", "obs-strats.js"].forEach(f => h.update(fs.readFileSync(path.join(SRC, f))));
  h.update(fs.readFileSync(path.join(__dirname, "../data/samples.json")));
  return h.digest("hex").slice(0, 16);
}
const cacheDir = path.join(__dirname, ".cache"), cacheFile = path.join(cacheDir, "live-" + sig() + ".json");
let store = { price: {}, pbench: {}, games: {}, sims: {} };
try { store = JSON.parse(fs.readFileSync(cacheFile, "utf8")); } catch (e) {}
function save() { try { fs.mkdirSync(cacheDir, { recursive: true }); fs.readdirSync(cacheDir).forEach(f => { if (/^live-/.test(f) && path.join(cacheDir, f) !== cacheFile) fs.unlinkSync(path.join(cacheDir, f)); }); fs.writeFileSync(cacheFile, JSON.stringify(store)); } catch (e) {} }
const compiled = {};
function S(id) { const st = builtins.find(s => s.id === id); if (!st) throw new Error("no rule " + id); return st.lib ? QL.gameLib[st.lib] : (compiled[id] || (compiled[id] = compile(st.code))); }
const meta = id => builtins.find(s => s.id === id);

/** 价格世界那张表里的一列（一个世界里的全部规则） */
function priceCol(wi) {
  const w = LV.PW[wi], key = w.key;
  if (!store.price[key]) {
    const memo = {}, col = {}; let bench = null, info = null;
    builtins.filter(s => !s.game).forEach(st => { let r; try { r = LV.priceCell(S(st.id), st, w, w.ds ? series(w.ds) : null, memo); } catch (e) { r = { cell: null }; } col[st.id] = r.cell; if (r.plain && !bench) { bench = r.bench; info = { N: r.N, T: r.T, K: r.K }; } });
    store.price[key] = col; store.pbench[key] = Object.assign({ bench }, info); save();
  }
  return store.price[key];
}
function gameCol(type, si) {
  const k = type + "@" + si;
  if (!store.games[k]) { const out = LV.gameScene(type, si, builtins.filter(s => s.game === type)); store.games[k] = { bench: out.bench, cells: out.cells }; save(); }
  return store.games[k];
}
/** 整张对照表，结构与页面上的 App.matrix 相同 */
function matrix() {
  const ps = builtins.filter(s => !s.game).map(s => s.id), cells = {}; ps.forEach(id => { cells[id] = []; });
  const worlds = LV.PW.map((w, wi) => { const col = priceCol(wi), b = store.pbench[w.key]; ps.forEach(id => cells[id].push(col[id])); return { key: w.key, type: w.type, over: w.over, name: w.name, ds: w.ds || null, N: b.N, T: b.T, K: b.K, bench: b.bench }; });
  const games = {};
  QL.ALL_GAMES.forEach(t => { const G = LV.gameSpec(t, builtins.filter(s => s.game === t)); G.strats.forEach(id => { G.cells[id] = []; }); G.scenes.forEach((sc, si) => { const c = gameCol(t, si); sc.bench = c.bench; G.strats.forEach(id => G.cells[id].push(c.cells[id])); }); games[t] = G; });
  return { v: 2, seed: LV.SEED, set: LV.set(), price: { worlds, strats: ps, cells, cols: LV.PRICE_COLS }, games };
}
function sim(job) { const key = JSON.stringify(job); if (!store.sims[key]) { store.sims[key] = LV.sim(job, S(job.strat), meta(job.strat), job.ds ? series(job.ds) : null); save(); } return store.sims[key]; }
/** 登记表里的一个数（与 app-live.js 的 L.val 同一套规矩）；取不到返回 null */
function val(G, id, depth) {
  const sp = (G.live || {})[id]; if (!sp || (depth | 0) > 6) return null;
  let v, c;
  if (sp.calc) { v = sp.calc(QL); return typeof v === "number" && v === v ? v : null; }
  if (sp.cell) {
    const type = sp.cell[0], spec = LV.gameSpec(type, builtins.filter(s => s.game === type)); let si = sp.cell[1];
    if (typeof si === "string") si = spec.scenes.findIndex(x => x.name === sp.cell[1]);
    if (si < 0 || si >= spec.scenes.length) return null;
    const col = gameCol(type, si);
    if (sp.cell[3] === "bench") return typeof col.bench === "number" ? col.bench : null;
    c = col.cells[sp.cell[2]]; return c && typeof c[sp.cell[3]] === "number" ? (sp.neg ? -c[sp.cell[3]] : c[sp.cell[3]]) : null;
  }
  if (sp.pcell) { const wi = LV.PW.findIndex(w => w.key === sp.pcell[1]); if (wi < 0) return null; c = priceCol(wi)[sp.pcell[0]]; v = c && c[LV.PRICE_COLS.indexOf(sp.pcell[2])]; return typeof v === "number" ? v : null; }
  if (sp.pbench) { const wi = LV.PW.findIndex(w => w.key === sp.pbench[0]); if (wi < 0) return null; priceCol(wi); const b = store.pbench[sp.pbench[0]]; v = b && b.bench && b.bench[sp.pbench[1]]; return typeof v === "number" ? v : null; }
  if (sp.sim) { const r = sim(sp.sim); v = typeof sp.pick === "function" ? sp.pick(r) : r[sp.pick || "score"]; return typeof v === "number" && v === v ? v : null; }
  if (sp.of) { const a = sp.of.map(k => val(G, k, (depth | 0) + 1)); if (a.some(x => x == null)) return null; v = sp.f.apply(null, a); return typeof v === "number" && v === v ? v : null; }
  return null;
}
function check(G, c) {
  const vals = {}; (c.need || []).forEach(k => { vals[k] = val(G, k); });
  const dead = Object.keys(vals).filter(k => vals[k] == null);
  if (dead.length) return { state: "fail", note: "没能算出来：" + dead.join("、") };
  const r = c.test(k => vals[k]); return typeof r === "object" && r ? { state: r.ok ? "pass" : "fail", note: r.note || "" } : { state: r ? "pass" : "fail", note: "" };
}
module.exports = { matrix, priceCol, gameCol, sim, val, check, builtins };
