// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 天下棋局 · 回放比对：确认改动没有悄悄改变某个版本的推演结果。
//
// 从仓库里发布的四个页面（tianxia/、tianxia-v2/、tianxia-v3/、tianxia-v4/）里取出页面自己的脚本
// （版本开关、地图、数据、文字、规则引擎；不含界面和 AI 推演层），在 Node 的隔离环境里运行。
// 每个版本 × 每个开局年代用固定种子开一局，按界面不接 AI 时的流程（prepareTurn → ruleReactions → finishTurn）
// 推演 TURNS 个回合；玩家选一个不行动的国家（PLAYER），其余国家都由引擎决策。
// 每回合记下：整个局面的指纹（JSON 的哈希），以及几个看得懂的数：交战对数、战线数、在华驻军的外国国家数。
// 结果和 replay-golden.json 比对：
//   · 一致：这个改动没有改变任何版本的玩法；
//   · 不一致：列出哪个版本、哪个年代、从第几回合开始不同。如果这正是这次要改的玩法，
//     用 --write 重新生成 replay-golden.json 并一起提交——这样玩法变化会出现在 PR 的 diff 里，一眼能看出影响了哪些版本。
//
// 为什么用 Node 而不是浏览器：不同版本的 JavaScript 引擎，个别数学函数的结果在最后一位上会差一点
// （例如 5.490623036878785 和 …784），推演几个回合就会放大成完全不同的局面。所以指纹只能在同一版本的引擎上比。
// Node 22 的引擎版本固定（V8 12.4），本机和 GitHub 上一样；浏览器的版本则各处不同。
// 引擎版本和 replay-golden.json 记录的不一样时，脚本会直接说明，不做比对。
//
// 用法（仓库根目录，Node 22）：
//   node tianxia/_source/test/replay.js                         比对磁盘上的页面
//   node tianxia/_source/test/replay.js --write                 重新生成 replay-golden.json
//   node tianxia/_source/test/replay.js --git origin/main [--write]  用某个提交里的页面（例如线上的版本）
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm"), { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../../..");
const GOLDEN = path.join(__dirname, "replay-golden.json");
const EDITIONS = ["tianxia", "tianxia-v2", "tianxia-v3", "tianxia-v4"];
const SCENS = ["1939", "1945", "1979", "2026"];
const TURNS = 12;          // 每局推演 12 个回合（三年）
const SEED = 20261027;
const PLAYER = "BRA";      // 玩家（不行动）：巴西在四个年代都是独立国家，离各个热点都远，三年内不会被占领而提前结束
const V8 = process.versions.v8.split(".").slice(0, 2).join(".");

// 读页面：默认读磁盘；--git <提交> 时读那个提交里的版本
function pageHtml(ed, ref) {
  const rel = `${ed}/index.html`;
  return ref ? execFileSync("git", ["show", `${ref}:${rel}`], { cwd: ROOT, maxBuffer: 64 << 20 }).toString("utf8")
             : fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// 在隔离环境里运行页面的脚本，直到定义规则引擎 WG 的那一段（含）为止
function loadEngine(html) {
  const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const iEng = blocks.findIndex((b) => /\bconst WG = \(\(\) =>/.test(b));
  if (iEng < 0) throw new Error("页面里找不到规则引擎（const WG）");
  // 页面开头的脚本（联网、AI 接口等）载入时会碰到浏览器对象：给一个什么都接受的替身，它们在推演里用不到
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => "" : k === "then" ? undefined : any()), apply: () => any(), construct: () => any() });
  const store = {};
  const ctx = {
    console, queueMicrotask, TextEncoder, TextDecoder, URL, URLSearchParams, atob, btoa, crypto: globalThis.crypto,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0,
    document: any(), navigator: { language: "zh-CN", languages: ["zh-CN"], userAgent: "node" },
    location: { href: "http://localhost/", origin: "http://localhost", pathname: "/", search: "", hash: "" },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    WebSocket: function () {}, fetch: () => new Promise(() => {}),
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; ctx.sessionStorage = ctx.localStorage;
  vm.createContext(ctx);
  // Math.random 换成固定种子的版本（mulberry32），保证可重复；引擎自己的随机数来自对局种子
  vm.runInContext(`(${(seed) => {
    let a = seed >>> 0;
    Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }})(${SEED})`, ctx);
  for (let i = 0; i <= iEng; i++) vm.runInContext(blocks[i], ctx, { filename: `script${i}` });
  return ctx;
}

// 在页面的环境里运行：开局、推演、每回合记指纹和摘要
function runGame({ scen, seed, turns, player }) {
  const W = WG; // eslint-disable-line no-undef
  const h53 = (str) => { // cyrb53
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };
  const sum = (v) => (Array.isArray(v) ? v.reduce((a, b) => a + (+b || 0), 0) : 0);
  // 在华驻军的外国国家数：在中国本土或台湾驻有兵力的外国国家（和引擎的 stations 用同一个门槛）
  const cnForeign = (S) => {
    let n = 0;
    for (const [id, x] of Object.entries(S.actors)) {
      if (id === "CHN" || !x || !x.forces) continue;
      if (["CHN", "TWN"].some((L) => sum(x.forces[L]) > 0.0015)) n++;
    }
    return n;
  };
  const S = W.newGame({ scen, seed, player });
  const hash = [], wars = [], fronts = [], cn = [];
  const rec = () => {
    hash.push(h53(JSON.stringify(S)));
    wars.push(Object.keys(S.war || {}).length);
    fronts.push((S.fronts || []).length);
    cn.push(cnForeign(S));
  };
  rec(); // 第 0 回合：开局
  for (let t = 0; t < turns && !S.over; t++) {
    const R = W.prepareTurn(S); if (!R) break;
    W.ruleReactions(S, R, new Set());
    W.finishTurn(S);
    rec();
  }
  return JSON.stringify({ hash: hash.join(" "), wars: wars.join(" "), fronts: fronts.join(" "), cn: cn.join(" ") });
}

function main() {
  const args = process.argv.slice(2), write = args.includes("--write");
  const gi = args.indexOf("--git"), ref = gi >= 0 ? args[gi + 1] : null;
  const gold = fs.existsSync(GOLDEN) ? JSON.parse(fs.readFileSync(GOLDEN, "utf8")) : null;
  if (!write && gold && gold.v8 !== V8) {
    console.log(`✗ 这里的 JavaScript 引擎是 V8 ${V8}（Node ${process.versions.node}），replay-golden.json 是在 V8 ${gold.v8} 上生成的。` +
      `不同版本的引擎在浮点运算的最后一位上可能不同，指纹没法直接比。请用 Node 22 运行；如果要换 Node 版本，` +
      `先在旧版本上确认比对通过，再在新版本上用 --write 重新生成，单独提交。`);
    process.exit(2);
  }
  const out = { _说明: "由 tianxia/_source/test/replay.js 生成，不要手改。cn = 在中国本土或台湾驻军的外国国家数，wars = 交战对数，fronts = 战线数，hash = 局面指纹；每项从第 0 回合（开局）起每回合一个数。",
    v8: V8, turns: TURNS, seed: SEED, player: PLAYER };
  console.log(`页面：${ref ? `提交 ${ref} 里的` : "磁盘上的"}四个版本 · 引擎 V8 ${V8}（Node ${process.versions.node}）`);
  for (const ed of EDITIONS) {
    const ctx = loadEngine(pageHtml(ed, ref));
    out[ed] = {};
    for (const scen of SCENS) {
      out[ed][scen] = JSON.parse(vm.runInContext(`(${runGame})(${JSON.stringify({ scen, seed: SEED, turns: TURNS, player: PLAYER })})`, ctx));
      console.log(`  ${ed} ${scen}：在华驻军的外国国家数 ${out[ed][scen].cn}`);
    }
  }

  if (write) {
    fs.writeFileSync(GOLDEN, JSON.stringify(out, null, 1) + "\n");
    console.log(`已写入 ${path.relative(ROOT, GOLDEN)}`);
    return;
  }
  if (!gold) { console.log(`✗ 没有 ${path.relative(ROOT, GOLDEN)}：先用 --write 生成`); process.exit(1); }
  let bad = 0;
  const gh = process.env.GITHUB_ACTIONS === "true";
  const report = (msg) => { console.log(msg); if (gh) console.log(`::error title=天下棋局回放比对::${msg.replace(/%/g, "%25").replace(/\n/g, "%0A")}`); };
  for (const k of ["turns", "seed", "player"]) if (gold[k] !== out[k]) { report(`✗ 设置不同：${k} ${gold[k]} → ${out[k]}`); bad++; }
  for (const ed of EDITIONS) for (const scen of SCENS) {
    const a = (gold[ed] || {})[scen], b = out[ed][scen];
    if (!a) { report(`✗ ${ed} ${scen}：replay-golden.json 里没有`); bad++; continue; }
    if (a.hash === b.hash) { console.log(`✓ ${ed} ${scen}：${TURNS} 个回合逐回合一致`); continue; }
    const ah = a.hash.split(" "), bh = b.hash.split(" ");
    let t = 0; while (t < ah.length && ah[t] === bh[t]) t++;
    const rows = ["cn", "wars", "fronts"].filter((k) => a[k] !== b[k]).map((k) => `\n    ${k}: ${a[k]}\n      → ${b[k]}`).join("");
    report(`✗ ${ed} ${scen}：从第 ${t} 回合起推演结果不同${rows}`);
    bad++;
  }
  if (bad) {
    console.log("\n推演结果和 replay-golden.json 不一致。如果这正是这次要改的玩法，用 --write 重新生成并一起提交，在 PR 说明里写明影响了哪些版本；否则说明改动意外改变了玩法。");
    process.exit(1);
  }
  console.log(`\n回放比对通过：${EDITIONS.length} 个版本 × ${SCENS.length} 个年代，各 ${TURNS} 个回合`);
}

main();
