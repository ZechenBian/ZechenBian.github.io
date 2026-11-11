// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 框选提问样本（cases-ask/index.html，以及在 Claude 里打开的 dist/cases-ask-preview.html）的界面测试：
//   在 Claude 里（假的 window.claude）：按住 Alt 框住图上的一段 → 提问；在回答里选中几个字 → 第 2 层；在第 2 层的回答上点"问" → 第 3 层；
//   层数过滤；换控件后批注还挂在原来的块上并标"数字已变"；换案例再回来、刷新页面，批注都挂回原处；删除连同嵌在里面的一起删。
//   独立网页（没有密钥）：提问的入口是关着的，"接入 AI"能打开；接入本机的假服务商（mock-openai.js 充当转发代理）以后能问。
// 用法：node test/ui-cases-ask.js        （先 python3 build.py）
const http = require("http"), fs = require("fs"), path = require("path");
function need(name, fallback) { try { return require(name); } catch (e) { return require(fallback); } }
const { chromium } = need("playwright", "/opt/npm-tools/node_modules/playwright");
const { ok, section, done } = require("./harness.js");
const mock = require("./mock-openai.js");
const ROOT = path.join(__dirname, "..");
const PAGES = { "/cases-ask/": path.join(ROOT, "cases-ask/index.html"), "/preview": path.join(ROOT, "dist/cases-ask-preview.html") };
const MOCK_CLAUDE = fs.readFileSync(path.join(__dirname, "mock-claude.js"), "utf8");

function staticServer() {
  const s = http.createServer((req, res) => {
    let u = req.url.split("?")[0].split("#")[0]; if (u.endsWith("/index.html")) u = u.slice(0, -10);
    if (PAGES[u]) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(fs.readFileSync(PAGES[u])); } else { res.writeHead(404); res.end(); }
  });
  return new Promise((r) => s.listen(0, "127.0.0.1", () => r({ port: s.address().port, close: () => new Promise((q) => s.close(q)) })));
}

(async () => {
  for (const k in PAGES) if (!fs.existsSync(PAGES[k])) { console.log("CRASH: 没有 " + PAGES[k] + "，先 python3 build.py"); process.exit(1); }
  const web = await staticServer(), api = await mock.start(), browser = await chromium.launch(), logs = [], external = [];
  const URL0 = "http://127.0.0.1:" + web.port, BASE = "http://127.0.0.1:" + api.port;
  async function newPage(viewport, init) {
    const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 920 } });
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource: net::ERR_(FAILED|TUNNEL)/.test(m.text())) logs.push("[console] " + m.text()); });
    page.on("pageerror", (e) => logs.push("[pageerror] " + e.message));
    await page.route((u) => /^https?:$/.test(u.protocol) && u.hostname !== "127.0.0.1", (r) => { const host = new URL(r.request().url()).hostname; if (!/fonts\.g/.test(host)) external.push(host); r.abort(); });
    if (init) await page.addInitScript(init);
    return { ctx, page };
  }
  const settle = (page) => page.waitForFunction(() => document.querySelectorAll(".cs-later:not([data-done])").length === 0 && document.querySelectorAll(".cs-step-b[data-pending]").length === 0, null, { timeout: 60000, polling: 100 });
  const stored = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("ql.ask.cases.v1") || "{}"); } catch (e) { return {}; } });
  const answered = (page, n) => page.waitForFunction((n) => { const m = JSON.parse(localStorage.getItem("ql.ask.cases.v1") || "{}"); return Object.keys(m).length === n && Object.values(m).every((d) => d.thread.length >= 2); }, n, { timeout: 20000 });
  const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  try {
    section("在 Claude 里打开：框选图表、在回答里接着问");
    let { ctx, page } = await newPage(null, MOCK_CLAUDE);
    await page.goto(URL0 + "/preview#bike"); await page.waitForTimeout(300);
    await page.evaluate(() => QLCaseApp.renderAll()); await settle(page);
    await page.waitForFunction(() => document.body.classList.contains("ask-ready"));
    ok(await page.evaluate(() => document.querySelectorAll("#caseMain .ask-blk").length > 50), "正文的块都标上了");
    ok(await page.evaluate(() => /Claude/.test(document.getElementById("askStatus").textContent)), "状态：回答的是 Claude");
    const chart = page.locator('.cs-chart[data-chart="一天之内的平均租车数"] canvas');
    await chart.scrollIntoViewIfNeeded(); await page.waitForTimeout(150);
    let b = await chart.boundingBox();
    await page.keyboard.down("Alt");
    await page.mouse.move(b.x + b.width * 0.25, b.y + 10); await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.5, { steps: 5 }); await page.mouse.move(b.x + b.width * 0.55, b.y + b.height - 20, { steps: 5 });
    await page.mouse.up(); await page.keyboard.up("Alt");
    await page.waitForSelector(".ask-composer .ask-box-t");
    const box1 = await page.textContent(".ask-composer .ask-box-t");
    ok(/\[图表：一天之内的平均租车数\]/.test(box1) && /工作日/.test(box1) && /点/.test(box1), "框住图上的一段：交出框内的数据点", box1.slice(0, 200));
    await page.fill(".ask-composer textarea", "为什么工作日早上有一个峰？"); await page.keyboard.press("Enter");
    await answered(page, 1);
    let m = await stored(page), d1 = Object.values(m)[0], rid1 = Object.keys(m)[0];
    ok(d1.kind === "box" && /^bike-3\./.test(d1.bid) && d1.sig && /一天之内的平均租车数/.test(d1.passage), "存下：框选、挂在第 3 步的那张图上", { kind: d1.kind, bid: d1.bid });
    ok(await page.evaluate(() => !!document.querySelector(".ask-remark.mine .ask-ans .katex")), "回答里的公式排好了");
    const prompt1 = await page.evaluate(() => window.__calls[window.__calls.length - 1].input.map((t) => t.content).join("\n"));
    ok(/数据分析案例/.test(prompt1) && /共享单车|单车/.test(prompt1) && /框里是/.test(prompt1) && /控件/.test(prompt1), "提示词里有页面、这一步的内容、框里的东西和控件设置");

    // 在回答里选中几个字 → 第 2 层
    await page.evaluate((rid) => {
      const p = document.querySelector('.ask-remark[data-rid="' + rid + '"] .ask-ans p');
      const tn = Array.from(p.childNodes).find((n) => n.nodeType === 3 && n.nodeValue.length > 6);
      p.scrollIntoView({ block: "center" });
      const r = document.createRange(); r.setStart(tn, 1); r.setEnd(tn, 6); getSelection().removeAllRanges(); getSelection().addRange(r);
    }, rid1);
    await page.waitForSelector("#askSelBtn:not([hidden])"); await page.click("#askSelBtn");
    ok(await page.getAttribute(".ask-composer", "data-lc") === "2", "在回答里提问：输入框是第 2 层的颜色");
    await page.fill(".ask-composer textarea", "这句话是什么意思？"); await page.keyboard.press("Enter");
    await answered(page, 2);
    const l2 = await page.evaluate((rid) => { const d = document.querySelector('.ask-remark[data-level="2"]'); return d && { inParent: d.parentElement.closest(".ask-remark") && d.parentElement.closest(".ask-remark").dataset.rid === rid, inAns: !!d.parentElement.closest(".ask-ans") }; }, rid1);
    ok(l2 && l2.inParent && l2.inAns, "第 2 层的批注嵌在第 1 层的回答里", l2);

    // 第 2 层回答里的一段：悬停出现"问" → 第 3 层
    const l2p = page.locator('.ask-remark[data-level="2"] > .ask-rbody > .ask-ans > p').first();
    await l2p.scrollIntoViewIfNeeded(); await l2p.hover();
    await page.waitForSelector("#askBtn:not([hidden])"); await page.click("#askBtn");
    await page.locator(".ask-composer .chip", { hasText: "为什么" }).click();
    await answered(page, 3);
    ok(await page.evaluate(() => { const d = document.querySelector('.ask-remark[data-level="3"]'); return !!(d && d.parentElement.closest('.ask-remark[data-level="2"]')); }), "第 3 层嵌在第 2 层里");
    const p3 = await page.evaluate(() => window.__calls[window.__calls.length - 1].input.map((t) => t.content).join("\n"));
    ok(/第 1 层批注/.test(p3) && /第 2 层批注/.test(p3) && /第 2 层的回答里/.test(p3), "第 3 层的提示词带着整条追问链");

    section("层数、换控件、换案例、刷新");
    await page.click("#askViewBtn"); await page.click('#askView [data-g="levels"] button[data-v="1"]');
    let vis = await page.evaluate(() => ({ lv: Array.from(document.querySelectorAll(".ask-remark.mine")).filter((d) => d.offsetParent).map((d) => d.dataset.level), stubs: Array.from(document.querySelectorAll(".ask-stub")).filter((s) => s.offsetParent).map((s) => s.textContent) }));
    ok(vis.lv.join() === "1" && vis.stubs.some((s) => /更深/.test(s)), "层数 1：只显示第 1 层，留一条“更深的提问”", vis);
    await page.click('#askView [data-g="levels"] button[data-v="all"]'); await page.keyboard.press("Escape");
    // 问数字卡片，再换模型：卡片的数变了，批注还在那组卡片后面，标"数字已变"
    const tiles = page.locator("#bike-6 .cs-tiles").first();
    await tiles.scrollIntoViewIfNeeded(); await tiles.hover();
    await page.waitForSelector("#askBtn:not([hidden])"); await page.click("#askBtn");
    await page.locator(".ask-composer .chip").first().click();
    await answered(page, 4);
    await page.click('#bike-6 .cs-seg button[data-v="ols"]'); await settle(page); await page.waitForTimeout(400);
    const st = await page.evaluate(() => { const d = Array.from(document.querySelectorAll(".ask-remark.mine")).find((x) => { const p = x.previousElementSibling; return p && p.classList.contains("cs-tiles"); }); return d ? { stale: d.classList.contains("stale"), flag: getComputedStyle(d.querySelector(".ask-flag"), "::after").content } : null; });
    ok(st && st.stale && /数字已变/.test(st.flag), "换成线性回归：批注还挂在那组卡片后面，标“数字已变”", st);
    await page.goto(URL0 + "/preview#ames"); await page.waitForTimeout(300); await page.evaluate(() => QLCaseApp.renderAll()); await settle(page); await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.querySelectorAll("#caseMain .ask-remark.mine").length === 0), "换到房价案例：单车的批注不显示");
    await page.goto(URL0 + "/preview#bike"); await page.waitForTimeout(300); await page.evaluate(() => QLCaseApp.renderAll()); await settle(page); await page.waitForTimeout(400);
    let back = await page.evaluate(() => Array.from(document.querySelectorAll("#caseMain .ask-remark.mine")).map((d) => d.dataset.level + (d.classList.contains("orphan") ? "o" : "")).join());
    ok(back.split(",").sort().join() === "1,1,2,3", "换回来：四条批注都挂回原处", back);
    await page.click("#askQBtn");
    const items = await page.$$eval(".ask-ditem", (n) => n.map((e) => e.textContent));
    ok(items.length === 4 && items.some((t) => /^L2/.test(t)) && items.some((t) => /^L3/.test(t)), "“我的提问”：按层缩进列出", items);
    await page.click("#askDrawer .btn");
    await page.reload(); await page.waitForTimeout(300); await page.evaluate(() => QLCaseApp.renderAll()); await settle(page); await page.waitForTimeout(400);
    back = await page.evaluate(() => Array.from(document.querySelectorAll("#caseMain .ask-remark.mine")).map((d) => d.dataset.level).sort().join());
    ok(back === "1,1,2,3", "刷新以后：批注从本机存储里恢复，层次不变", back);
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
    ok(await overflow(page) <= 0, "手机宽度没有横向滚动条");
    await page.setViewportSize({ width: 1440, height: 920 });
    await page.evaluate((rid) => { const d = document.querySelector('.ask-remark[data-rid="' + rid + '"]'); d.open = true; d.scrollIntoView({ block: "center" }); }, rid1);
    await page.click('.ask-remark[data-rid="' + rid1 + '"] > .ask-rbody > .ask-actions .ask-ra:has-text("删除")');
    ok(/连同嵌在里面的 2 条/.test(await page.textContent('.ask-remark[data-rid="' + rid1 + '"] > .ask-rbody > .ask-actions .ask-confirm')), "删除前确认：会连同嵌在里面的 2 条一起删");
    await page.click('.ask-remark[data-rid="' + rid1 + '"] > .ask-rbody > .ask-actions .ask-ra.danger');
    m = await stored(page);
    ok(Object.keys(m).length === 1, "删除第 1 层：连同第 2、3 层一起删掉，只剩卡片那条");
    await ctx.close();

    section("独立网页：没接入时关着，接入以后能问");
    ({ ctx, page } = await newPage());
    await page.goto(URL0 + "/cases-ask/#bike"); await page.waitForTimeout(500);
    ok(await page.evaluate(() => !document.body.classList.contains("ask-ready") && document.getElementById("askBoxBtn").disabled && /接入 AI/.test(document.getElementById("askStatus").textContent)), "没有密钥：框选按钮关着，状态说要接入 AI");
    await page.click("#askSetBtn");
    ok(await page.isVisible(".ask-modal #askKey"), "“接入 AI”打开设置");
    await page.keyboard.press("Escape");
    ok(!(await page.isVisible(".ask-modal")), "Esc 关掉设置");
    await ctx.close();
    ({ ctx, page } = await newPage(null, `try { localStorage.setItem("ql.ai.v1", ${JSON.stringify(JSON.stringify({ p: "deepseek", by: { deepseek: { key: "test-key-ok" } }, proxy: BASE }))}); } catch (e) {}`));
    await page.goto(URL0 + "/cases-ask/#bike"); await page.waitForFunction(() => document.body.classList.contains("ask-ready"));
    ok(/DeepSeek/.test(await page.textContent("#askStatus")), "接入以后：状态写着回答的是 DeepSeek");
    const p1 = page.locator("#bike-1 .cs-md > p").first();
    await p1.scrollIntoViewIfNeeded(); await p1.hover(); await page.waitForSelector("#askBtn:not([hidden])"); await page.click("#askBtn");
    await page.locator(".ask-composer .chip").first().click();
    await answered(page, 1);
    ok(await page.evaluate(() => document.querySelector(".ask-remark.mine .ask-ans").textContent.length > 20), "独立网页：问到了回答");
    await ctx.close();
  } catch (e) { console.log("CRASH: " + (e && e.stack || e)); logs.push("crash"); }
  ok(logs.length === 0, "页面没有报错", logs.slice(0, 5));
  ok(external.length === 0, "没有向外发请求（字体除外）", external.slice(0, 5));
  await browser.close(); await web.close(); await api.close();
  done();
})();
