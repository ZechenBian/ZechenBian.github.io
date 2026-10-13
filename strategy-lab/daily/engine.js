// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 每日一题在 Node 里用到的引擎：把 src/ 里的几个文件载进来，再提供一个"跑一件任务"的函数。
 * 校验脚本（check.js）、结算的程序（settle.js）和沙盒里跑的那一小段（box.js）用的都是这一份。只用 Node 自带的模块，要 Node 22.8 以上。
 *
 * job() 把几段代码放进和页面后台线程一模一样的程序里（src/jobs.js 拼出来的那一份）执行。交上来的规则是封着的，别人看不到它写了什么，
 * 所以这里不能指望"有人会看出来它在捣鬼"，得让它捣不了：
 *   · 执行的环境是一个单独的 vm 上下文，全局对象是普通的那一种（不是 Node 包过一层的）：里面没有任何 Node 的对象，
 *     也没有从外面带进去的对象可以顺着原型链摸回来；不许现造代码（eval、new Function），和页面里靠内容安全策略做到的一样。
 *   · 内核装好之后、规则的代码执行之前，把全局对象和上面的每一样东西都冻住：规则换不掉 Math、isFinite 这些裁判要用的名字。
 *   · 任务的参数（里面有结算用的种子）不放在任何叫得出名字的地方；"算完了"的消息只存在一个闭包里，规则够不着，也就造不出假的结果。
 *   · 每段代码先单独过一遍语法检查：它自己得是一段完整的函数体，这样才不可能提前把包着它的那层函数收掉、跑到外面去。
 * vm 不是安全边界：别人写的代码要跑，外面还得再套一层真正的隔离（见 settle.js：没有网络、文件只读的容器）。
 * 规则和裁判还是在同一个上下文里，上面这些只是把已知的路堵上，不敢说滴水不漏。 */
"use strict";
const path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, ".."), SRC = f => path.join(ROOT, "src", f);
for (const [name, file] of [["QL_ML_INSTALL", "ml.js"], ["QL_GAMES_INSTALL", "games.js"], ["QL_OBS_INSTALL", "obs-games.js"], ["QL_LIVE_INSTALL", "live.js"]]) { try { global[name] = require(SRC(file)); } catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e; } }
global.QL_CORE = require(SRC("core.js"));
global.QL_SHOP_INSTALL = require(SRC("shop.js"));
global.QL_QUEST_INSTALL = require(SRC("quest.js"));
const JI = require(SRC("jobs.js")), QLJobs = JI.QLJobs;
const QL = global.QL_CORE({});
JI(QL); global.QL_SHOP_INSTALL(QL); global.QL_QUEST_INSTALL(QL);

// JSON 里写不了 NaN 和无穷大（会变成 null）：出去之前换成记号，进来之后换回去
const NUM = { "\u0000nan": NaN, "\u0000+inf": Infinity, "\u0000-inf": -Infinity };
/* 上下文里的第一段：造出内核当成"线程自己"的那个对象 self。发出去的消息只存在这个闭包里。
 * 规则的代码里 self 这个名字是被遮住的（src/jobs.js 的 SHADOW），全局对象它也拿不到，所以够不着这里的任何东西 */
const PRELUDE = [
  "var self = (function () {",
  "  \"use strict\";",
  "  var posts = [], scope = { onmessage: null }, stringify = JSON.stringify, parse = JSON.parse;",
  "  function num(k, v) { return typeof v !== \"number\" || (v === v && v !== Infinity && v !== -Infinity) ? v : v !== v ? \"\\u0000nan\" : v > 0 ? \"\\u0000+inf\" : \"\\u0000-inf\"; }",
  "  scope.postMessage = function (m) { posts.push(stringify(m, num)); };",
  "  scope.__run = function (json) { scope.onmessage({ data: parse(json) }); return posts.length ? posts[posts.length - 1] : \"\"; };",
  "  return scope;",
  "})();"
].join("\n");
/* 内核装好、冻住内置对象之后（QL.harden），规则的代码执行之前：从全局对象出发，把顺着属性和原型链摸得到的每一样东西都冻住，最后冻住全局对象自己。
 * 连内置函数本身也要冻：不然规则可以给 Math.max 添一个自己的 apply，裁判写 Math.max.apply(null, 数组) 的时候调到的就是规则的函数。
 * 几种迭代器、生成器的原型从全局对象上摸不到，另外补上。self、QL、__CODE 是内核自己还要往里写的，不冻；规则的代码里这三个名字都被遮住了 */
const LOCK = [
  "(function (G) {",
  "  \"use strict\";",
  "  var skip = { self: 1, QL: 1, __CODE: 1 }, seen = new Set(), todo = [];",
  "  function add(v) { if (v && (typeof v === \"object\" || typeof v === \"function\") && v !== G && !seen.has(v)) { seen.add(v); todo.push(v); } }",
  "  function props(o, own) { var keys; try { keys = Reflect.ownKeys(o); } catch (e) { return; } keys.forEach(function (k) { if (own && typeof k === \"string\" && skip[k]) return; var d; try { d = Object.getOwnPropertyDescriptor(o, k); } catch (e) { return; } if (!d) return; if (\"value\" in d) add(d.value); else { add(d.get); add(d.set); } }); }",
  "  try { add(Object.getPrototypeOf(new Map().entries())); add(Object.getPrototypeOf(new Set().values())); add(Object.getPrototypeOf(\"\"[Symbol.iterator]())); add(Object.getPrototypeOf(\"\".matchAll(/x/g))); add(Object.getPrototypeOf([][Symbol.iterator]())); } catch (e) {}",
  "  try { add(Object.getPrototypeOf(function* () {})); add(Object.getPrototypeOf(async function* () {})); add(Object.getPrototypeOf(async function () {})); } catch (e) {}",
  "  props(G, true);",
  "  while (todo.length) { var o = todo.pop(); props(o, false); try { add(Object.getPrototypeOf(o)); } catch (e) {} try { Object.freeze(o); } catch (e) {} }",
  "  Object.freeze(G);",
  "  if (!Object.isFrozen(G) || !Object.isFrozen(Math.max) || !Object.isFrozen(Object.prototype.hasOwnProperty)) throw new Error(\"the global object could not be frozen\");",
  "})(this);"
].join("\n");
/** 上下文里抛出来的东西是规则可以随便造的：只取一句话，别的不碰 */
function said(e) { try { const m = e && e.message; return typeof m === "string" ? m.slice(0, 300) : typeof e === "string" ? e.slice(0, 300) : "error"; } catch (x) { return "error"; } }
/** 跑一件任务。codes: [{ id, code }]；msg: 任务的参数（kind 之类）。返回任务的结果；出错时抛出来（message 是线程报的那句话） */
function job(codes, msg) {
  const PLAIN = vm.constants && vm.constants.DONT_CONTEXTIFY;
  if (!PLAIN) throw new Error("daily/engine.js needs Node 22.8 or newer (this is " + process.version + ")");
  (codes || []).forEach(c => { const bad = QLJobs.syntax(String(c && c.code != null ? c.code : "")); if (bad) throw new Error("syntax error in " + String(c && c.id) + ": " + bad); });
  const built = QLJobs.source(codes, { ready: LOCK }), ctx = vm.createContext(PLAIN, { codeGeneration: { strings: false, wasm: false } });
  let out = "";
  try {
    vm.runInContext(PRELUDE, ctx, { filename: "prelude.js" });
    vm.runInContext(built.src, ctx, { filename: "job.js" });
    // 任务的参数直接写进这一小段代码里（一个字符串），不经过任何全局的名字
    out = vm.runInContext("self.__run(" + JSON.stringify(JSON.stringify(Object.assign({ type: "job" }, msg))) + ")", ctx, { filename: "run.js" });
  } catch (e) { throw new Error(said(e)); }
  let last = null; try { last = JSON.parse(String(out), (k, v) => (typeof v === "string" && Object.prototype.hasOwnProperty.call(NUM, v) ? NUM[v] : v)); } catch (e) {}
  if (!last || last.type !== "done") throw new Error(last && typeof last.message === "string" ? last.message : "任务没有跑完");
  return last.result;
}
module.exports = { QL, QLJobs, job, ROOT };
