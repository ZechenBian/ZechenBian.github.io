// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 测试用的小工具：在 Node 里按后台线程同样的方式编译策略代码
const path = require("path");
const QL_CORE = require(path.join(__dirname, "../src/core.js"));
let QL_ML_INSTALL = null;
try { QL_ML_INSTALL = require(path.join(__dirname, "../src/ml.js")); } catch (e) { /* 模型库还没写时忽略 */ }
if (QL_ML_INSTALL) global.QL_ML_INSTALL = QL_ML_INSTALL;
try { global.QL_GAMES_INSTALL = require(path.join(__dirname, "../src/games.js")); } catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e; }
try { global.QL_OBS_INSTALL = require(path.join(__dirname, "../src/obs-games.js")); } catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e; }
try { global.QL_LIVE_INSTALL = require(path.join(__dirname, "../src/live.js")); } catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e; }
const scope = {};
const QL = QL_CORE(scope);
const STRATS = require(path.join(__dirname, "../src/strategies.js"));
global.QL_STRATS = STRATS;
try { require(path.join(__dirname, "../src/models.js")); } catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e; }
try { require(path.join(__dirname, "../src/game-strats.js"))(QL).forEach(s => STRATS.push(s)); } catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e; }
try { require(path.join(__dirname, "../src/obs-strats.js"))(QL).forEach(s => STRATS.push(s)); } catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e; }

function compile(code) {
  const fn = new Function('"use strict";\n' + code + '\n;return { init: typeof init === "function" ? init : null, decide: typeof decide === "function" ? decide : null, fit: typeof fit === "function" ? fit : null };');
  return fn();
}
function compileWorld(code) {
  const fn = new Function('"use strict";\n' + code + '\n;return { simulate: typeof simulate === "function" ? simulate : null };');
  return fn();
}
function defaults(schema) { const p = {}; (schema || []).forEach(s => { p[s.key] = s.def; }); return p; }
function world(type, over, N, T, K, seed) {
  const w = QL.WORLDS[type];
  const params = Object.assign(QL.worldDefaults(type), over || {});
  return { type, params, N: N || w.defaults.N, T: T || w.defaults.T, K: K || w.defaults.K, seed: seed == null ? 7 : seed, S0: 100 };
}
const SET0 = { costBps: 0, rf: 0, fmin: -50, fmax: 50, lam: 1, ddLimit: 30, ddProb: 5 };

let pass = 0, fail = 0; const fails = [];
function ok(cond, name, detail) {
  if (cond) { pass++; if (process.env.VERBOSE) console.log("  ok   " + name + (detail ? "  " + detail : "")); }
  else { fail++; fails.push(name + (detail ? "  " + detail : "")); console.log("  FAIL " + name + (detail ? "  " + detail : "")); }
}
function near(x, target, tol, name) { ok(Math.abs(x - target) <= tol, name, `got ${fmt(x)} want ${fmt(target)} ± ${fmt(tol)}`); }
function fmt(x) { return typeof x === "number" ? (Math.abs(x) >= 1e4 || (Math.abs(x) < 1e-3 && x !== 0) ? x.toExponential(3) : x.toFixed(5)) : String(x); }
function section(s) { console.log("\n== " + s); }
function done() {
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exitCode = 1; }
}
function meanSd(a) { let s = 0, s2 = 0; for (const x of a) { s += x; s2 += x * x; } const m = s / a.length; return [m, Math.sqrt(Math.max(0, s2 / a.length - m * m))]; }

module.exports = { QL, STRATS, compile, compileWorld, defaults, world, SET0, ok, near, section, done, meanSd, fmt };
