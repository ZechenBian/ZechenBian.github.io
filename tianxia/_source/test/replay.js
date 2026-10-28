// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 天下棋局 · 回放比对：确认改动没有悄悄改变某个版本的推演结果。
//
// 在无头 Chromium 里打开仓库里发布的四个页面（tianxia/、tianxia-v2/、tianxia-v3/、tianxia-v4/），
// 每个版本 × 每个开局年代用固定种子开一局，按界面不接 AI 时的流程（prepareTurn → ruleReactions → finishTurn）
// 推演 TURNS 个回合；玩家选一个不行动的国家（PLAYER），其余国家都由引擎决策。
// 每回合记下：整个局面的指纹（JSON 的哈希），以及几个看得懂的数：交战对数、战线数、在华驻军的外国国家数。
// 结果和 replay-golden.json 比对：
//   · 一致：这个改动没有改变任何版本的玩法；
//   · 不一致：列出哪个版本、哪个年代、从第几回合开始不同。如果这正是这次要改的玩法，
//     用 --write 重新生成 replay-golden.json 并一起提交——这样玩法变化会出现在 PR 的 diff 里，一眼能看出影响了哪些版本。
//
// 用法（仓库根目录）：
//   node tianxia/_source/test/replay.js           比对
//   node tianxia/_source/test/replay.js --write   重新生成 replay-golden.json
// 外部网络一律切断（页面断网也能推演）。Math.random 在页面里换成固定种子的版本，保证可重复。
"use strict";
const http = require("http"), fs = require("fs"), path = require("path");

const ROOT = path.resolve(__dirname, "../../..");
const GOLDEN = path.join(__dirname, "replay-golden.json");
const EDITIONS = ["tianxia", "tianxia-v2", "tianxia-v3", "tianxia-v4"];
const SCENS = ["1939", "1945", "1979", "2026"];
const TURNS = 12;          // 每局推演 12 个回合（三年）
const SEED = 20261027;
const PLAYER = "BRA";      // 玩家（不行动）：巴西在四个年代都是独立国家，离各个热点都远，三年内不会被占领而提前结束

function need() {
  for (const p of [path.join(ROOT, "strategy-lab/node_modules/playwright"), "playwright", "/opt/npm-tools/node_modules/playwright"]) {
    try { return require(p); } catch (e) { /* 换下一个 */ }
  }
  console.error("找不到 Playwright：先在 strategy-lab/ 里 npm install，再 npx playwright install chromium");
  process.exit(2);
}

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": file.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

// 在页面里运行：开局、推演、每回合记指纹和摘要
function runInPage({ scen, seed, turns, player }) {
  const W = WG; // eslint-disable-line no-undef
  const h53 = (str) => { // cyrb53
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };
  const sum = (v) => (Array.isArray(v) ? v.reduce((a, b) => a + (+b || 0), 0) : 0);
  // 外国在华驻军：在中国本土或台湾驻有兵力的外国国家数（和引擎的 stations 用同一个门槛）
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
  return { hash: hash.join(" "), wars: wars.join(" "), fronts: fronts.join(" "), cn: cn.join(" ") };
}

(async () => {
  const write = process.argv.includes("--write");
  const { chromium } = need();
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const out = { _说明: "由 tianxia/_source/test/replay.js 生成，不要手改。cn = 在中国本土或台湾驻军的外国国家数，wars = 交战对数，fronts = 战线数，hash = 局面指纹；每项从第 0 回合（开局）起每回合一个数。",
    turns: TURNS, seed: SEED, player: PLAYER };
  for (const ed of EDITIONS) {
    const ctx = await browser.newContext({ locale: "zh-CN" });
    await ctx.addInitScript((seed) => { // 页面里的 Math.random 换成固定种子的版本（mulberry32），保证可重复
      let a = seed >>> 0;
      Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }, SEED);
    await ctx.route("**/*", (r) => (r.request().url().startsWith(origin) ? r.continue() : r.abort("internetdisconnected")));
    await ctx.routeWebSocket(/.*/, (ws) => ws.close());
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e.message || e)));
    await page.goto(`${origin}/${ed}/index.html`, { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => typeof WG !== "undefined" && WG.newGame, null, { timeout: 60000 }); // eslint-disable-line no-undef
    out[ed] = {};
    for (const scen of SCENS) {
      const t0 = Date.now();
      out[ed][scen] = await page.evaluate(runInPage, { scen, seed: SEED, turns: TURNS, player: PLAYER });
      console.log(`  ${ed} ${scen}: ${((Date.now() - t0) / 1000).toFixed(1)}s  在华驻军的外国国家数 ${out[ed][scen].cn}`);
    }
    if (errs.length) { console.log(`✗ ${ed} 页面报错：\n    ${errs.slice(0, 5).join("\n    ")}`); process.exitCode = 1; }
    await ctx.close();
  }
  await browser.close();
  server.close();

  if (write) {
    fs.writeFileSync(GOLDEN, JSON.stringify(out, null, 1) + "\n");
    console.log(`已写入 ${path.relative(ROOT, GOLDEN)}`);
    return;
  }
  if (!fs.existsSync(GOLDEN)) { console.log(`✗ 没有 ${path.relative(ROOT, GOLDEN)}：先用 --write 生成`); process.exit(1); }
  const gold = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
  let bad = 0;
  for (const k of ["turns", "seed", "player"]) if (gold[k] !== out[k]) { console.log(`✗ 设置不同：${k} ${gold[k]} → ${out[k]}`); bad++; }
  for (const ed of EDITIONS) for (const scen of SCENS) {
    const a = (gold[ed] || {})[scen], b = out[ed][scen];
    if (!a) { console.log(`✗ ${ed} ${scen}：replay-golden.json 里没有`); bad++; continue; }
    if (a.hash === b.hash) { console.log(`✓ ${ed} ${scen}：${TURNS} 个回合逐回合一致`); continue; }
    const ah = a.hash.split(" "), bh = b.hash.split(" ");
    let t = 0; while (t < ah.length && ah[t] === bh[t]) t++;
    console.log(`✗ ${ed} ${scen}：从第 ${t} 回合起推演结果不同`);
    for (const k of ["cn", "wars", "fronts"]) if (a[k] !== b[k]) console.log(`    ${k}: ${a[k]}\n      → ${b[k]}`);
    bad++;
  }
  if (bad) {
    console.log("\n推演结果和 replay-golden.json 不一致。如果这正是这次要改的玩法，用 --write 重新生成并一起提交，在 PR 说明里写明影响了哪些版本；否则说明改动意外改变了玩法。");
    process.exit(1);
  }
  console.log(`\n回放比对通过：${EDITIONS.length} 个版本 × ${SCENS.length} 个年代，各 ${TURNS} 个回合`);
})().catch((e) => { console.error(e); process.exit(1); });
