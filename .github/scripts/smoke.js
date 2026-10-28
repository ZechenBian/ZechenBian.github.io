// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 冒烟测试：在无头 Chromium 里打开 pages.json 登记的每个页面（电脑宽度和手机宽度各一次），检查
//   · 没有未捕获的脚本错误，控制台没有报错；
//   · 仓库里的相对路径资源都能取到（没有 404）；
//   · 页面确实渲染出了内容；
//   · 手机宽度（390px）下没有横向滚动。
// 外部网络一律切断：页面只能依赖 CDN 和内联资源，断网也要能打开主体（见 CLAUDE.md）。
// 所以"取不到外部资源"本身不算错，记一笔，但不判失败。
//
// 用法（仓库根目录）：node .github/scripts/smoke.js [页面路径前缀]
// Playwright 依次从 strategy-lab/node_modules、全局、/opt/npm-tools 里找。
"use strict";
const http = require("http"), fs = require("fs"), path = require("path");

const ROOT = path.resolve(__dirname, "../..");
function need() {
  for (const p of [path.join(ROOT, "strategy-lab/node_modules/playwright"), "playwright", "/opt/npm-tools/node_modules/playwright"]) {
    try { return require(p); } catch (e) { /* 换下一个 */ }
  }
  console.error("找不到 Playwright：先在 strategy-lab/ 里 npm install，再 npx playwright install chromium");
  process.exit(2);
}
const { chromium } = need();

const filter = process.argv[2] || "";
const PAGES = JSON.parse(fs.readFileSync(path.join(__dirname, "pages.json"), "utf8")).pages
  .filter((p) => p.smoke !== false && p.path.startsWith(filter)); // 过滤词按路径前缀：tianxia、strategy-lab/ml、index.html（只有主页）
const VIEWPORTS = [
  { name: "电脑 desktop", width: 1280, height: 800 },
  { name: "手机 phone", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];
const WAIT_MS = 3000; // 载入后再等一会儿，让初始化脚本跑完

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".xml": "application/xml", ".wasm": "application/wasm" };

// 和 GitHub Pages 一样：从仓库根目录提供静态文件，目录取 index.html
function serve() {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!rel.endsWith("/")) { res.writeHead(301, { Location: rel + "/" }); return res.end(); }
      file = path.join(file, "index.html");
    }
    if (!fs.existsSync(file) || path.relative(ROOT, file).split(path.sep).some((s) => s.startsWith(".") || s === "node_modules")) {
      res.writeHead(404); return res.end("not found");
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

(async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  let failures = 0;
  for (const pg of PAGES) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile,
        hasTouch: !!vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor || 1, locale: "zh-CN" });
      const blocked = new Set();
      await ctx.route("**/*", (route) => {
        const u = route.request().url();
        if (u.startsWith(origin) || u.startsWith("data:") || u.startsWith("blob:")) return route.continue();
        blocked.add(new URL(u).host);
        return route.abort("internetdisconnected");
      });
      await ctx.routeWebSocket(/.*/, (ws) => { blocked.add(new URL(ws.url()).host); ws.close(); });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push("脚本错误 uncaught: " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | ")));
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        const loc = (m.location() && m.location().url) || "", text = m.text();
        const external = /net::ERR_|Failed to load resource|WebSocket connection to|ERR_INTERNET_DISCONNECTED|Failed to fetch|NetworkError/i.test(text)
          && !(loc.startsWith(origin) && /Failed to load resource/.test(text));
        if (!external) errors.push("控制台报错 console.error: " + text.slice(0, 300));
      });
      page.on("response", (r) => {
        if (r.url().startsWith(origin) && r.status() >= 400) errors.push(`取不到仓库里的文件 ${r.status()}: ${r.url().slice(origin.length)}`);
      });
      let info = null;
      try {
        await page.goto(`${origin}/${pg.path}`, { waitUntil: "load", timeout: 90000 });
        await page.waitForTimeout(WAIT_MS);
        info = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth, iw: window.innerWidth,
          text: (document.body && document.body.innerText || "").trim().length,
        }));
      } catch (e) {
        errors.push("打不开 failed to load: " + String(e.message || e).split("\n")[0]);
      }
      if (info) {
        if (info.text < 20) errors.push(`页面几乎是空的（可见文字 ${info.text} 字）`);
        if (vp.isMobile && info.sw > info.iw + 1) errors.push(`手机宽度有横向滚动：内容宽 ${info.sw}px > 屏幕 ${info.iw}px`);
      }
      const note = blocked.size ? `（已切断外部请求：${[...blocked].sort().join(", ")}）` : "";
      if (errors.length) {
        failures++;
        console.log(`✗ ${pg.name} · ${vp.name}  ${pg.path}${note}`);
        for (const e of [...new Set(errors)].slice(0, 12)) console.log("    " + e);
      } else {
        console.log(`✓ ${pg.name} · ${vp.name}${note}`);
      }
      await ctx.close();
    }
  }
  await browser.close();
  server.close();
  if (failures) { console.log(`\n冒烟测试：${failures} 项失败 / smoke failures`); process.exit(1); }
  console.log(`\n冒烟测试全部通过：${PAGES.length} 个页面 × ${VIEWPORTS.length} 种宽度 / smoke OK`);
})().catch((e) => { console.error(e); process.exit(1); });
