// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 本地冒烟测试：起一个静态服务器，用无头浏览器打开预览页
const http = require("http"), fs = require("fs"), path = require("path");
// Playwright 和 KaTeX：先找 npm install 装的，再找这台机器上公用的那一份
function need(name, fallback) { try { return require(name); } catch (e) { return require(fallback); } }
const { chromium } = need("playwright", "/opt/npm-tools/node_modules/playwright");
const ROOT = path.join(__dirname, ".."), DIST = path.join(ROOT, "dist"), LIVE_CACHE = path.join(__dirname, ".cache/ui-live.json");
const KATEX = [path.join(ROOT, "node_modules/katex/dist/katex.min.js"), "/opt/npm-tools/node_modules/katex/dist/katex.min.js"].find(f => fs.existsSync(f));
const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split("?")[0]), f = u === "/index.html" ? path.join(ROOT, "index.html") : path.join(DIST, u); /* /index.html 是独立的网页版，其余在 dist/ 里 */ fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end("nf"); } else { res.writeHead(200, { "content-type": f.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" }); res.end(d); } }); });
async function open(opts = {}) {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, deviceScaleFactor: opts.dpr || 1, colorScheme: opts.dark ? "dark" : "light" });
  const page = await ctx.newPage(); const logs = [];
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`); });
  page.on("pageerror", e => logs.push("[pageerror] " + e.message + "\n" + (e.stack || "").split("\n").slice(0, 3).join("\n")));
  const external = [];
  if (opts.standalone) {
    // 独立的网页版：外面的东西一概连不上（记下它想连谁），页面照样要能用
    await page.route(u => /^https?:$/.test(u.protocol) && u.hostname !== "127.0.0.1", r => { external.push(new URL(r.request().url()).hostname); r.abort(); });
  } else {
    await page.route("**/cdn.jsdelivr.net/**", r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(KATEX) }));
    await page.route("**/fonts.googleapis.com/**", r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  }
  if (opts.init) await page.addInitScript(opts.init);
  // 现算的结果可以从上一次测试留下的存档里接着用（签名对不上时页面会自己作废重算）；ui-obs.js 不用存档，从头算一遍
  if (opts.seedLive && fs.existsSync(LIVE_CACHE)) await page.addInitScript(v => { try { if (!localStorage.getItem("ql.live.v2")) localStorage.setItem("ql.live.v2", v); } catch (e) {} }, fs.readFileSync(LIVE_CACHE, "utf8"));
  await page.goto(opts.file ? "file://" + path.join(ROOT, "index.html") : `http://127.0.0.1:${port}/${opts.standalone ? "index" : "preview"}.html`);
  return { browser, page, logs, external, close: async () => { await browser.close(); server.close(); } };
}
/** 像用户那样换世界：是玩法就在"玩法"下拉框里选；是价格世界就先回到"交易一个资产"，再在"世界"下拉框里选 */
async function pickWorld(page, x) {
  const isGame = await page.evaluate(x => { const w = window.App.QL.WORLDS[x]; if (!w) throw new Error("没有这个世界：" + x); return !!w.game; }, x);
  if (isGame) { await page.selectOption("#gameType", x); return; }
  if ((await page.inputValue("#gameType")) !== "trade") await page.selectOption("#gameType", "trade");
  await page.selectOption("#worldType", x);
}
/** 等现算告一段落：后台没有在算的了，页面上也没有还在等的数和格子 */
async function liveIdle(page, timeout) {
  await page.waitForFunction(() => { const L = window.App.live; return !L.busy() && !document.querySelector(".lv.wait") && !document.querySelector("td.pend") && !document.querySelector(".ck.wait") && !document.querySelector(".lv-prog"); }, null, { timeout: timeout || 420000, polling: 300 });
  await page.waitForTimeout(250);
}
/** 把页面存在浏览器里的现算结果留一份到磁盘上，后面的测试接着用 */
async function saveLive(page) {
  await page.waitForTimeout(1900);                                  // 页面存档有 1.5 秒的缓冲
  const v = await page.evaluate(() => { try { return localStorage.getItem("ql.live.v2"); } catch (e) { return null; } });
  if (v) { fs.mkdirSync(path.dirname(LIVE_CACHE), { recursive: true }); fs.writeFileSync(LIVE_CACHE, v); }
  return v ? v.length : 0;
}
module.exports = { open, pickWorld, liveIdle, saveLive };
if (require.main === module) (async () => {
  const t = await open();
  const { page, logs } = t;
  try { await page.waitForSelector(".crit .big", { timeout: 15000 }); } catch (e) { console.log("summary did not render:", e.message.split("\n")[0]); }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(__dirname, "../shots/01-desktop.png") });
  console.log("summary text:", (await page.locator("#summary").innerText()).replace(/\n+/g, " | ").slice(0, 700));
  console.log("cards:", await page.locator(".card h3").allInnerTexts());
  console.log("logs:", logs.length ? "\n" + logs.join("\n") : "none");
  await t.close();
})();
