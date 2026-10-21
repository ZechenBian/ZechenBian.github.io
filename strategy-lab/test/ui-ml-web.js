// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 机器学习实验室 · "从网上取数据"：本机的假数据网站（有的允许跨域、有的不允许）+ 本机的假 AI + 真的本机引擎。
// 核对：用描述找（AI 给的第一个地址 404，自动换下一个）、直接填网址（gzip、zip、JSON、超过 5 万行的抽样、按列筛行）、
// 取到网页时的提示、浏览器读不到时请本机引擎去取、导入后标成"从网上取的数据"并能训练、刷新以后还在。不向外发请求。
// 用法：node test/ui-ml-web.js   （先 python3 build.py）
const http = require("http"), fs = require("fs"), path = require("path"), zlib = require("zlib"), { spawn, execFileSync } = require("child_process");
function need(name, fallback) { try { return require(name); } catch (e) { return require(fallback); } }
const { chromium } = need("playwright", "/opt/npm-tools/node_modules/playwright");
const { ok, section, done } = require("./harness.js");
const ROOT = path.join(__dirname, ".."), PAGE = path.join(ROOT, "ml/index.html");

/* ---------- 假数据网站 ---------- */
function salesCsv() { let s = "x1,x2,color,leak,y\n"; for (let i = 0; i < 400; i++) { const a = Math.sin(i * 1.3), b = Math.cos(i * 0.7), y = 3 * a - 2 * b + (i % 2 ? 0.5 : 0) + 0.05 * Math.sin(i * 11.1); s += a.toFixed(4) + "," + b.toFixed(4) + "," + (i % 2 ? "red" : "blue") + "," + (y * 2).toFixed(4) + "," + y.toFixed(4) + "\n"; } return s; }
function bigCsv() { let s = "Country,v,w,y\n"; for (let i = 0; i < 60000; i++) { const c = i % 3 === 0 ? "Atlantis" : i % 3 === 1 ? "Lemuria" : "Mu", v = Math.sin(i * 0.37), w = Math.cos(i * 0.11); s += c + "," + v.toFixed(4) + "," + w.toFixed(4) + "," + (v + 2 * w).toFixed(4) + "\n"; } return s; }
function seriesJson() { const rows = []; for (let t = 0; t < 300; t++) rows.push({ date: new Date(Date.UTC(2000, 0, 1 + t)).toISOString().slice(0, 10), value: +(10 + Math.sin(t / 7) + t * 0.01).toFixed(4), meta: { src: "test" } }); return JSON.stringify({ status: "ok", data: { rows } }); }
function zipOf(files) {
  const parts = [], cd = []; let off = 0;
  for (const [name, text] of files) {
    const raw = Buffer.from(text, "utf8"), comp = zlib.deflateRawSync(raw), nm = Buffer.from(name, "utf8"), crc = zlib.crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
    parts.push(lh, nm, comp);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    cd.push(ch, nm); off += 30 + nm.length + comp.length;
  }
  const cdb = Buffer.concat(cd), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cdb.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat(parts.concat([cdb, e]));
}
function dataSite() {
  const hits = [];
  const files = {
    "/cors/sales.csv": ["text/csv", salesCsv()],
    "/cors/big.csv.gz": ["application/gzip", zlib.gzipSync(bigCsv())],
    "/cors/pack.zip": ["application/zip", zipOf([["README.txt", "readme"], ["nested/data.csv", salesCsv()]])],
    "/cors/series.json": ["application/json", seriesJson()],
    "/cors/page.html": ["text/html", "<!doctype html><html><body>下载页面</body></html>"],
    "/nocors/table.csv": ["text/csv", salesCsv()]
  };
  const s = http.createServer((req, res) => {
    const u = req.url.split("?")[0]; hits.push(u);
    const f = files[u], cors = u.startsWith("/cors/") ? { "access-control-allow-origin": "*" } : {};
    if (!f) { res.writeHead(404, cors); res.end("not found"); return; }
    res.writeHead(200, Object.assign({ "content-type": f[0] }, cors)); res.end(f[1]);
  });
  return new Promise((r) => s.listen(0, "127.0.0.1", () => r({ port: s.address().port, hits, close: () => new Promise((q) => s.close(q)) })));
}

/* ---------- 假 AI：按提示词给候选（第一个 404）。/v1/messages 扮演 Claude：先"搜索"一次，再给候选 ---------- */
function mockAI(dataPort) {
  const calls = [];
  const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access", "access-control-allow-methods": "GET, POST, OPTIONS" };
  const s = http.createServer((req, res) => {
    if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
    let raw = ""; req.on("data", (d) => { raw += d; }); req.on("end", () => {
      const body = JSON.parse(raw || "{}"); calls.push(body);
      Object.defineProperty(body, "__req", { value: { path: req.url, key: req.headers["x-api-key"] || "", version: req.headers["anthropic-version"] || "", browser: req.headers["anthropic-dangerous-direct-browser-access"] || "" } });
      const base = "http://127.0.0.1:" + dataPort;
      const text = JSON.stringify({ candidates: [
        { name: "不存在的文件", url: base + "/cors/missing.csv", format: "csv", target: "y", kind: "regression", real: true, why: "测试：这个地址是 404" },
        { name: "测试销售表", url: base + "/cors/sales.csv", format: "csv", target: "y", kind: "regression", drop: ["leak"], source: "测试用的假网站", license: "测试", real: true, why: "x1、x2、color 预测 y；leak 是由 y 算出来的，要丢掉" }
      ], note: "测试" });
      if (/\/messages$/.test(req.url)) {
        if (req.headers["x-api-key"] !== "test-key-ok") { res.writeHead(401, Object.assign({ "content-type": "application/json" }, CORS)); res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } })); return; }
        const ev = [{ type: "message_start", message: { id: "msg_test", role: "assistant", content: [] } }, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "我先搜一下。" } }, { type: "content_block_stop", index: 0 }];
        if (body.tools && body.tools.some((t) => t.name === "web_search")) ev.push({ type: "content_block_start", index: 1, content_block: { type: "server_tool_use", id: "srvtoolu_t", name: "web_search", input: {} } }, { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{\"query\": \"x1 x2 color y 销售表 csv\"}" } }, { type: "content_block_stop", index: 1 },
          { type: "content_block_start", index: 2, content_block: { type: "web_search_tool_result", tool_use_id: "srvtoolu_t", content: [{ type: "web_search_result", title: "测试销售表", url: base + "/cors/sales.csv" }, { type: "web_search_result", title: "说明页", url: base + "/cors/page.html" }] } }, { type: "content_block_stop", index: 2 });
        ev.push({ type: "content_block_start", index: 3, content_block: { type: "text", text: "" } }, { type: "content_block_delta", index: 3, delta: { type: "text_delta", text: text.slice(0, 40) } }, { type: "content_block_delta", index: 3, delta: { type: "text_delta", text: text.slice(40) } }, { type: "content_block_stop", index: 3 }, { type: "message_delta", delta: { stop_reason: "end_turn" } }, { type: "message_stop" });
        res.writeHead(200, Object.assign({ "content-type": "text/event-stream" }, CORS));
        res.end(ev.map((e) => "event: " + e.type + "\ndata: " + JSON.stringify(e) + "\n\n").join("")); return;
      }
      if (!body.stream) { res.writeHead(200, Object.assign({ "content-type": "application/json" }, CORS)); res.end(JSON.stringify({ choices: [{ message: { content: text }, finish_reason: "stop" }] })); return; }
      res.writeHead(200, Object.assign({ "content-type": "text/event-stream" }, CORS));
      res.write("data: " + JSON.stringify({ choices: [{ delta: { content: text } }] }) + "\n\n");
      res.write("data: " + JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }) + "\n\ndata: [DONE]\n\n"); res.end();
    });
  });
  return new Promise((r) => s.listen(0, "127.0.0.1", () => r({ port: s.address().port, calls, close: () => new Promise((q) => s.close(q)) })));
}
function pageSite() { const s = http.createServer((req, res) => { if (req.url.split("?")[0] === "/ml/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(fs.readFileSync(PAGE)); } else { res.writeHead(404); res.end(); } }); return new Promise((r) => s.listen(0, "127.0.0.1", () => r({ port: s.address().port, close: () => new Promise((q) => s.close(q)) }))); }

(async () => {
  const data = await dataSite(), ai = await mockAI(data.port), web = await pageSite();
  const browser = await chromium.launch(), logs = [], external = [];
  const ST = JSON.stringify({ v: 1, group: "tab-reg", ds: {}, algo: {}, my: [], budget: 3, split: { train: 0.6, valid: 0.2 }, horizon: 1, view: "charts", flags: { welcomed: 1 } });
  async function newPage(url, init) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } }), page = await ctx.newPage();
    page.on("pageerror", (e) => logs.push("[pageerror] " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_FAILED|ERR_TUNNEL|net::ERR_|blocked by CORS policy/.test(m.text())) logs.push("[console] " + m.text()); });
    await page.route((u) => u.hostname !== "127.0.0.1", (r) => { external.push(new URL(r.request().url()).hostname); r.abort(); });
    if (init) await page.addInitScript(init);
    await page.goto(url);
    await page.waitForFunction(() => window.MLA && MLA.preview, null, { timeout: 30000 });
    return { ctx, page };
  }
  const logText = (page) => page.evaluate(() => (document.querySelector(".ml-web-log") || {}).innerText || "");
  const doneCount = (page) => page.evaluate(() => +((document.querySelector(".ml-web-log") || { getAttribute: () => 0 }).getAttribute("data-done") || 0));
  async function waitDone(page, n0) { await page.waitForFunction((n0) => +((document.querySelector(".ml-web-log") || { getAttribute: () => 0 }).getAttribute("data-done") || 0) > n0, n0, { timeout: 30000 }); }
  async function getUrl(page, u) { const n0 = await doneCount(page); await page.fill("#webUrl", u); await page.click("#webGet"); await waitDone(page, n0); }
  try {
    const AICFG = JSON.stringify({ p: "custom", by: { custom: { base: "http://127.0.0.1:" + ai.port + "/v1", key: "test-key-ok", model: "mock-pro" } } });
    let { ctx, page } = await newPage("http://127.0.0.1:" + web.port + "/ml/", `try { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.clear(); localStorage.setItem("ql.ml.v1", ${JSON.stringify(ST)}); localStorage.setItem("ql.ai.v1", ${JSON.stringify(AICFG)}); } } catch (e) {}`);

    section("用描述找：AI 给的第一个地址 404，自动换下一个");
    await page.click("#btnWeb");
    await page.waitForSelector("#webDesc");
    ok(!(await page.$eval("#webAsk", (b) => b.disabled)), "接入了 AI：可以用描述找");
    ok((await page.$$(".ml-web-cat .ml-web-item")).length === 20, "现成的数据有 20 个");
    await page.fill("#webDesc", "一张用 x1、x2 和颜色预测 y 的表");
    await page.click("#webAsk");
    await page.waitForSelector("#webImport", { timeout: 30000 });
    let lt = await logText(page);
    ok(/HTTP 404/.test(lt) && /读出 400 行、5 列/.test(lt), "第一个候选 404，第二个取到了，读出 400 行 5 列", lt.slice(0, 400));
    const prompt = ai.calls[0].messages.map((m) => m.content).join("\n");
    ok(/一张用 x1、x2 和颜色预测 y 的表/.test(prompt) && /raw\.githubusercontent\.com\/datasets\/s-and-p-500/.test(prompt) && /只输出一个 JSON/.test(prompt), "提示词里有描述、现成数据的地址和输出格式");
    if (process.env.ML_SHOTS) { fs.mkdirSync(process.env.ML_SHOTS, { recursive: true }); await page.screenshot({ path: path.join(process.env.ML_SHOTS, "web-preview.png") }); }
    ok((await page.inputValue("#webTarget")) === "y" && (await page.inputValue("#webKind")) === "regression", "要预测的列和任务按 AI 的建议填好了");
    const leak = await page.evaluate(() => Array.from(document.querySelectorAll(".ml-web-col")).map((l) => [l.textContent, l.querySelector("input").checked]));
    ok(leak.some((x) => x[0] === "leak" && !x[1]) && leak.some((x) => x[0] === "x1" && x[1]), "AI 说要丢掉的 leak 列默认没勾上", JSON.stringify(leak));
    await page.click("#webImport");
    await page.waitForFunction(() => MLA.ds().id === "csv" && MLA.preview && MLA.preview.dsId === "csv", null, { timeout: 20000 });
    let st = await page.evaluate(() => ({ web: MLA.ds().web && MLA.ds().web.url, origin: MLA.dsOrigin(MLA.ds()).k, badge: (document.querySelector("#blkData h2 .ml-badge") || {}).textContent, d: MLA.preview.d, names: MLA.preview.featureNames }));
    ok(/\/cors\/sales\.csv$/.test(st.web) && st.origin === "web" && st.badge === "从网上取的数据", "导入后标成“从网上取的数据”，记着地址", JSON.stringify(st));
    ok(!(st.names || []).some((n) => /leak/.test(n)), "丢掉的列不在特征里", JSON.stringify(st.names));
    const run = await page.evaluate(async () => { try { const r = await MLA.run({ quiet: true }); return { r2: r.metrics.valid.r2 }; } catch (e) { return { err: e.message }; } });
    ok(run.r2 > 0.8, "导入的数据能训练", JSON.stringify(run));

    section("接的是 Claude：先上网搜索，再给地址");
    await page.evaluate((port) => QLAI.save({ p: "claude", by: { claude: { base: "http://127.0.0.1:" + port + "/v1", key: "test-key-ok" } } }), ai.port);
    await page.click("#btnWeb"); await page.waitForSelector("#webDesc");
    ok(/Claude 会先上网搜索（最多 5 次/.test(await page.locator(".ml-web-sec .note").first().innerText()), "对话框里说明：Claude 会先上网搜索", await page.locator(".ml-web-sec .note").first().innerText());
    let nc = ai.calls.length; await page.fill("#webDesc", "一张用 x1、x2 和颜色预测 y 的表"); await page.click("#webAsk");
    await page.waitForSelector("#webImport", { timeout: 30000 });
    lt = await logText(page); const cc = ai.calls[nc] || {};
    ok(cc.__req && cc.__req.path === "/v1/messages" && cc.__req.key === "test-key-ok" && cc.__req.version === "2023-06-01" && cc.__req.browser === "true", "请求发到 Claude 的 /v1/messages，带着 x-api-key 和允许网页调用的请求头", JSON.stringify(cc.__req));
    ok(cc.tools && cc.tools[0].type === "web_search_20250305" && cc.tools[0].max_uses === 5 && cc.max_tokens > 0 && cc.model === "claude-opus-5-5", "带上了网络搜索工具，最多 5 次", JSON.stringify(cc.tools));
    ok(/web_search 工具/.test(cc.messages[0].content) && /搜索完以后，最后的回答只输出一个 JSON/.test(cc.messages[0].content), "提示词里交代了先搜索、最后只输出 JSON");
    ok(/请 Claude 上网搜索、找数据/.test(lt) && /Claude 搜索：x1 x2 color y 销售表 csv/.test(lt) && /搜到 2 条结果/.test(lt) && /AI 给了 2 个候选/.test(lt) && /读出 400 行、5 列/.test(lt), "日志里看得到它搜了什么、搜到几条；搜索前的那句话不影响读出候选", lt.slice(0, 500));
    if (process.env.ML_SHOTS) await page.screenshot({ path: path.join(process.env.ML_SHOTS, "web-claude.png") });
    await page.keyboard.press("Escape");

    section("直接填网址：gzip、超过 5 万行、zip、JSON、网页、404");
    await page.click("#btnWeb"); await page.waitForSelector("#webUrl");
    await getUrl(page, "http://127.0.0.1:" + data.port + "/cors/big.csv.gz");
    lt = await logText(page);
    ok(/gzip 解压后/.test(lt) && /读出 50000 行/.test(lt) && /随机取了 50000 行/.test(await page.locator(".ml-web-prev").innerText()), "gzip 自动解压；6 万行随机取了 5 万行", lt.slice(-300));
    await getUrl(page, "http://127.0.0.1:" + data.port + "/cors/pack.zip");
    lt = await logText(page);
    ok(/从 zip 里取了 nested\/data\.csv/.test(lt) && /读出 400 行/.test(lt), "zip 里自动挑了数据文件", lt.slice(-300));
    await getUrl(page, "http://127.0.0.1:" + data.port + "/cors/page.html");
    ok(/取到的是网页/.test(await logText(page)), "取到网页时说清楚");
    await getUrl(page, "http://127.0.0.1:" + data.port + "/cors/series.json");
    lt = await logText(page);
    const cols = await page.evaluate(() => Array.from(document.querySelectorAll(".ml-web-table th")).map((x) => x.textContent));
    ok(/读出 300 行、3 列（JSON）/.test(lt) && cols.join() === "date,value,meta.src", "JSON：自动找到记录的数组（data.rows），嵌套的字段展开成 meta.src", lt + " | " + cols.join());
    await page.selectOption("#webKind", "forecast"); await page.selectOption("#webTarget", "value"); await page.selectOption("#webTime", "date");
    await page.click("#webImport");
    await page.waitForFunction(() => MLA.ds().id === "csv" && MLA.ds().kind === "forecast" && MLA.preview && MLA.preview.series, null, { timeout: 20000 });
    st = await page.evaluate(() => ({ g: MLA.group().id, T: MLA.preview.series.T }));
    ok(st.g === "ts" && st.T === 300, "选了时间序列：切到“时间序列”，300 个时刻", JSON.stringify(st));

    section("按列筛行（现成数据的 filter 用同样的代码）");
    const filt = await page.evaluate(() => { const T = MLA.webTable("Country,v,y\n" + Array.from({ length: 30 }, (_, i) => (i % 2 ? "A" : "B") + "," + i + "," + i * 2).join("\n"), { filter: { Country: "A" }, kind: "regression" }); return { n: T.table.rows.length, w: T.warnings.join(" ") }; });
    ok(filt.n === 15 && /只留 Country = A/.test(filt.w), "filter 只留指定的行", JSON.stringify(filt));
    const bad = await page.evaluate(() => { try { MLA.webTable("Country,v\nA,1\nA,2\nA,3\nA,4\nA,5\nA,6\nA,7\nA,8\nA,9\nA,10\nA,11", { filter: { Country: "Z" } }); return ""; } catch (e) { return e.message; } });
    ok(/筛完一行也不剩/.test(bad) && /A/.test(bad), "筛空了就说清楚这一列有哪些取值", bad);

    section("浏览器读不到的网站（没有连本机引擎）");
    await page.click("#btnWeb"); await page.waitForSelector("#webUrl");
    await getUrl(page, "http://127.0.0.1:" + data.port + "/nocors/table.csv");
    lt = await logText(page);
    ok(/浏览器读不到/.test(lt) && /没有连上本机引擎/.test(lt), "说明是跨域限制，并提示可以连本机引擎", lt.slice(-300));
    let n1 = await doneCount(page); await page.click('.ml-web-item button[data-cat="vix"]'); await waitDone(page, n1);
    ok(/jsDelivr/.test(await logText(page)), "GitHub 的地址取不到时试过 jsDelivr 镜像（测试里外网都连不上）");
    await page.keyboard.press("Escape");

    section("手机宽度");
    await page.setViewportSize({ width: 380, height: 820 });
    await page.evaluate(() => MLA.setTab("ctl"));
    await page.click("#btnWeb"); await page.waitForSelector("#webUrl");
    await getUrl(page, "http://127.0.0.1:" + data.port + "/cors/sales.csv");
    const ov = await page.evaluate(() => { const b = document.querySelector(".mlweb-box"); return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, box: b ? b.scrollWidth - b.clientWidth : -1 }; });
    if (process.env.ML_SHOTS) await page.screenshot({ path: path.join(process.env.ML_SHOTS, "web-phone.png") });
    ok(ov.page <= 1 && ov.box <= 1, "手机宽度下对话框没有横向滚动条", JSON.stringify(ov));
    await page.keyboard.press("Escape"); await page.setViewportSize({ width: 1400, height: 950 }); await page.evaluate(() => MLA.setTab("res"));

    section("刷新以后还在");
    await page.reload(); await page.waitForFunction(() => window.MLA && MLA.preview, null, { timeout: 30000 });
    st = await page.evaluate(() => ({ id: MLA.ds().id, k: MLA.dsOrigin(MLA.ds()).k, g: MLA.group().id }));
    ok(st.id === "csv" && st.k === "web" && st.g === "ts", "上次从网上取的数据刷新以后还是当前的数据集", JSON.stringify(st));
    await ctx.close();

    section("本机引擎替页面去取");
    let haveNumpy = true; try { execFileSync("python3", ["-c", "import numpy"], { stdio: "ignore" }); } catch (e) { haveNumpy = false; }
    if (haveNumpy) {
      const proc = spawn("python3", ["-m", "mllab_engine", "--port", String(19300 + Math.floor(Math.random() * 400)), "--no-browser"], { cwd: path.join(ROOT, "ml-engine"), env: Object.assign({}, process.env, { MLLAB_ALLOW_PRIVATE_FETCH: "1" }), stdio: ["ignore", "pipe", "pipe"] });
      let out = ""; proc.stdout.on("data", (d) => { out += d; }); proc.stderr.on("data", (d) => { out += d; });
      const url = await new Promise((r) => { const t0 = Date.now(); (function poll() { const m = /http:\/\/127\.0\.0\.1:\d+\/ml\/\?engine=[A-Za-z0-9_-]+/.exec(out); if (m) r(m[0]); else if (Date.now() - t0 > 30000) r(null); else setTimeout(poll, 100); })(); });
      ok(!!url, "引擎起来了", out.slice(0, 300));
      if (url) {
        ({ ctx, page } = await newPage(url, `try { localStorage.setItem("ql.ml.v1", ${JSON.stringify(ST)}); } catch (e) {}`));
        await page.waitForFunction(() => MLA.engineCanFetch && MLA.engineCanFetch(), null, { timeout: 20000 });
        await page.click("#btnWeb"); await page.waitForSelector("#webUrl");
        ok(await page.$eval("#webAsk", (b) => b.disabled), "没接入 AI 时“让 AI 找”是灰的");
        await getUrl(page, "http://127.0.0.1:" + data.port + "/nocors/table.csv");
        lt = await logText(page);
        ok(/浏览器读不到/.test(lt) && /本机引擎取到了/.test(lt) && /读出 400 行/.test(lt), "浏览器读不到时请本机引擎去取", lt.slice(-300));
        await page.click("#webImport");
        await page.waitForFunction(() => MLA.ds().id === "csv" && MLA.ds().web && MLA.ds().web.via === "engine", null, { timeout: 20000 });
        ok(true, "引擎取来的数据导入了");
        await ctx.close();
      }
      proc.kill("SIGTERM");
    } else ok(true, "没有 numpy：跳过引擎这一节");
    ok(external.length === 0 || external.every((x) => /^(fonts\.(googleapis|gstatic)\.com|raw\.githubusercontent\.com|cdn\.jsdelivr\.net)$/.test(x)), "除了字体和现成数据的地址，没有向外发请求", external.join(", "));
    ok(logs.length === 0, "页面没有报错", logs.join("\n"));
  } catch (e) { console.log("CRASH: " + (e && e.stack || e)); }
  await browser.close(); await data.close(); await ai.close(); await web.close();
  console.log("page logs: " + logs.length);
  done();
})();
