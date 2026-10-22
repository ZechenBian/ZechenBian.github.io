// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 机器学习实验室 · 在 Claude 里打开的版本（dist/ml-preview.html：dist/ml-lab.html 套上和 Artifact 一样的骨架）。
// 页面里装一个假的 window.claude（按 Artifact 的 sample 能力的约定：use("sample") 给一个函数；onText 收到 {text, delta}；
// 中止时报 cancelled；出错时报 {code, message}），回答借用 ml-mock-replies.js。
// 另外按 mcp 能力的约定装 use("mcp")：host:mllab-engine 背后是一个真的引擎进程（python -m mllab_engine --mcp，经标准输入 / 输出说 MCP），
// host:claude_browser 是一个假的"桌面版的浏览器"（按真实工具的回答格式给出页面文字）；use("permissions") 记着允许过哪些。
// 核对：AI 就是 Claude（没有"接入 AI"的设置）、四种用法都能用、用户不允许时关掉输入并说清楚；
// 本机引擎：没点"连接"之前不调用、没配置时说清楚怎么配、连上以后跑 Python 算法（大的请求分块交、长的事件分块取）、替页面取数据（分块读）；
// 没接引擎时经桌面版的浏览器取数据（压缩文件、网页、太长的文件都说清楚）；允许过的话再打开页面时自动连上；
// 回到策略实验室的链接是网站的绝对地址；页面不报错、不向外发请求。
// 用法：node test/ui-ml-claude.js   （先 python3 build.py）
const http = require("http"), fs = require("fs"), path = require("path"), zlib = require("zlib"), { spawn, execFileSync } = require("child_process");
function need(name, fallback) { try { return require(name); } catch (e) { return require(fallback); } }
const { chromium } = need("playwright", "/opt/npm-tools/node_modules/playwright");
const { ok, section, done } = require("./harness.js");
const { reply } = require("./ml-mock-replies.js");
const ROOT = path.join(__dirname, ".."), PAGE = path.join(ROOT, "dist/ml-preview.html"), SITE = "https://zechenbian.github.io/strategy-lab/";

/** 假的 window.claude：只认 "sample"；回答由测试进程给（__reply），一小段一小段地流出来 */
const MOCK = `(() => {
  const calls = window.__calls = [], st = window.__mock = { fail: null, delay: 2 };
  function sample(input, opts) {
    opts = opts || {};
    const turns = typeof input === "string" ? [{ role: "user", content: input }] : input.map((t) => ({ role: t.role, content: t.content }));
    calls.push({ tier: opts.modelTier, keys: Object.keys(opts), first: turns[0].content.slice(0, 200) });
    return new Promise((resolve, reject) => {
      let dead = false, text = "";
      if (opts.signal) opts.signal.addEventListener("abort", () => { if (!dead) { dead = true; reject({ code: "cancelled", message: "aborted", text }); } });
      if (st.fail) { const c = st.fail; st.fail = null; setTimeout(() => { dead = true; reject({ code: c, message: "mock " + c }); }, 20); return; }
      window.__reply(turns).then((full) => {
        const parts = full.match(/[\\s\\S]{1,80}/g) || [];
        let i = 0;
        (function tick() {
          if (dead) return;
          if (i >= parts.length) { dead = true; resolve({ text: full, truncated: false, modelTierApplied: opts.modelTier || "default" }); return; }
          const d = parts[i++]; text += d; if (opts.onText) try { opts.onText({ text, delta: d }); } catch (e) {}
          setTimeout(tick, st.delay);
        })();
      });
    });
  }
  sample.json = (input, opts) => sample(input, opts).then((r) => JSON.parse(r.text));
  sample.limits = () => Promise.resolve({ maxPromptBytes: 262144, tools: { maxCount: 8 } });
  // 允许过哪些本机工具：存在 sessionStorage 里，刷新页面以后还记得（像桌面版那样）
  let perm = {}; try { perm = JSON.parse(sessionStorage.getItem("__perm") || "{}"); } catch (e) {}
  const savePerm = () => { try { sessionStorage.setItem("__perm", JSON.stringify(perm)); } catch (e) {} };
  const mcpCalls = window.__mcpCalls = [];
  const mcp = Object.freeze({
    callTool: (server, tool, input, opts) => {
      mcpCalls.push({ server, tool, bytes: JSON.stringify(input || {}).length, cache: opts && opts.cache });
      return window.__mcp(server, tool, input || {}).then((r) => {
        if (!r.error || r.error.code === "tool_error") { perm["mcp:" + server] = "granted"; savePerm(); }
        if (r.error) throw r.error;
        return r.result;
      });
    },
    listTools: () => Promise.resolve({ servers: [] })
  });
  const permissions = Object.freeze({ state: (n) => Promise.resolve(n ? perm[n] || "prompt" : Object.assign({}, perm)), request: (ns) => Promise.resolve({}), manage: () => Promise.resolve() });
  window.claude = { use: (name) => new Promise((r) => setTimeout(() => r(name === "sample" ? sample : name === "mcp" ? mcp : name === "permissions" ? permissions : null), 40)) };
})();`;

/* ---------- 本机数据网站（假的"网上"） ---------- */
function salesCsv() { let s = "x1,x2,color,y\n"; for (let i = 0; i < 400; i++) { const a = Math.sin(i * 1.3), b = Math.cos(i * 0.7), y = 3 * a - 2 * b + (i % 2 ? 0.5 : 0); s += a.toFixed(4) + "," + b.toFixed(4) + "," + (i % 2 ? "red" : "blue") + "," + y.toFixed(4) + "\n"; } return s; }
function bigCsv(n) { let s = "v,w,y\n"; for (let i = 0; i < n; i++) { const v = Math.sin(i * 0.37), w = Math.cos(i * 0.11); s += v.toFixed(4) + "," + w.toFixed(4) + "," + (v + 2 * w).toFixed(4) + "\n"; } return s; }
function dataSite() {
  const files = { "/sales.csv": ["text/csv", salesCsv()], "/big.csv.gz": ["application/gzip", zlib.gzipSync(bigCsv(60000))], "/huge.csv": ["text/csv", bigCsv(110000)],
    "/page.html": ["text/html", "<!doctype html><html><head><title>数据下载页</title></head><body>点这里下载</body></html>"] };
  const s = http.createServer((req, res) => { const f = files[req.url.split("?")[0]]; if (!f) { res.writeHead(404); res.end("not found"); return; } res.writeHead(200, { "content-type": f[0] }); res.end(f[1]); });
  return new Promise((r) => s.listen(0, "127.0.0.1", () => r({ port: s.address().port, files, close: () => new Promise((q) => s.close(q)) })));
}

/* ---------- 真的引擎进程（MCP 模式） ---------- */
function engineProc() {
  const proc = spawn("python3", ["-m", "mllab_engine", "--mcp"], { cwd: path.join(ROOT, "ml-engine"), env: Object.assign({}, process.env, { MLLAB_ALLOW_PRIVATE_FETCH: "1" }), stdio: ["pipe", "pipe", "pipe"] });
  let buf = "", nid = 0; const wait = {}, bad = [], err = [];
  proc.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); let m; try { m = JSON.parse(line); } catch (e) { bad.push(line); continue; } if (wait[m.id]) { wait[m.id](m); delete wait[m.id]; } } });
  proc.stderr.on("data", (d) => err.push(String(d)));
  function rpc(method, params) { const id = ++nid; return new Promise((ok) => { wait[id] = ok; proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); }); }
  const ready = rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } }).then(() => proc.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n'));
  return { on: false, bad, err, calls: [], ready, call: (tool, args) => rpc("tools/call", { name: tool, arguments: args }).then((m) => m.result), close: () => { try { proc.stdin.end(); } catch (e) {} setTimeout(() => { try { proc.kill(); } catch (e) {} }, 3000); } };
}

/* ---------- 假的"桌面版的浏览器"：回答的格式照真实的 get_page_text ---------- */
function fakeBrowser() {
  const B = { tabs: {}, n: 0, calls: [] };
  function get(url) { return new Promise((ok) => { http.get(url, (res) => { const parts = []; res.on("data", (d) => parts.push(d)); res.on("end", () => ok({ type: res.headers["content-type"] || "", body: Buffer.concat(parts) })); }).on("error", () => ok(null)); }); }
  async function open(tab, url) { const r = await get(url); if (r && /gzip|zip|octet/.test(r.type)) return; tab.url = url; tab.page = r; }     // 压缩文件：浏览器当成下载，页面不换
  B.handle = async (tool, input) => {
    B.calls.push(tool);
    if (tool === "preview_start") { const id = "tab-" + (++B.n); B.tabs[id] = { url: "about:blank", page: null }; await open(B.tabs[id], input.url); return { content: [{ type: "text", text: "Opening " + input.url + " in the browser pane (tabId " + id + "). The page may still be loading; read the page to see the result." }] }; }
    const tab = B.tabs[input.tabId];
    if (!tab) return { error: { code: "tool_error", message: "No tab " + input.tabId, result: { content: [{ type: "text", text: "No tab with id " + input.tabId }], isError: true } } };
    if (tool === "navigate") { await open(tab, input.url); return { content: [{ type: "text", text: "Navigated to " + input.url }] }; }
    if (tool === "get_page_text") {
      const html = tab.page && /html/.test(tab.page.type), raw = tab.page ? tab.page.body.toString("utf8") : "";
      let body = html ? raw.replace(/<title>.*<\/title>/, "").replace(/<[^>]+>/g, "").trim() : raw, title = html ? (/<title>(.*)<\/title>/.exec(raw) || [])[1] || "" : "";
      const max = input.max_chars || 50000; if (body.length > max) body = body.slice(0, max) + "\n\n[truncated to " + max + " chars]";
      return { content: [{ type: "text", text: "Title: " + title + "\nURL: " + tab.url + "\nSource element: <body>\n---\n" + body + "\n\nTab Context:\n- Executed on tabId: " + input.tabId }] };
    }
    return { error: { code: "not_in_manifest", message: "tool not declared" } };
  };
  return B;
}

function pageSite() {
  const s = http.createServer((req, res) => { if (req.url.split("?")[0] === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(fs.readFileSync(PAGE)); } else { res.writeHead(404); res.end(); } });
  return new Promise((r) => s.listen(0, "127.0.0.1", () => r({ port: s.address().port, close: () => new Promise((q) => s.close(q)) })));
}

(async () => {
  if (!fs.existsSync(PAGE)) { console.log("CRASH: 没有 dist/ml-preview.html，先 python3 build.py"); process.exit(1); }
  let haveNumpy = true; try { execFileSync("python3", ["-c", "import numpy"], { stdio: "ignore" }); } catch (e) { haveNumpy = false; }
  if (!haveNumpy) { console.log("CRASH: 这个测试要 python3 和 numpy（本机引擎）"); process.exit(1); }
  const web = await pageSite(), data = await dataSite(), eng = engineProc(), br = fakeBrowser(), browser = await chromium.launch(), logs = [], external = [];
  await eng.ready;
  const D = "http://127.0.0.1:" + data.port;
  /** 页面里的 window.__mcp：把调用转给真的引擎进程或者假的浏览器，结果包成 callTool 的样子 */
  async function mcpBridge(server, tool, input) {
    if (server === "host:mllab-engine") {
      if (!eng.on) return { error: { code: "server_not_connected", message: "host server not connected" } };
      eng.calls.push(tool);
      const r = await eng.call(tool, input), text = (r.content || []).map((c) => c.text).join("");
      if (r.isError) return { error: { code: "tool_error", message: text, result: r } };
      let payload; try { payload = JSON.parse(text); } catch (e) { payload = text; }
      return { result: { content: r.content, payload } };
    }
    if (server === "host:claude_browser") { const r = await br.handle(tool, input); return r.error ? r : { result: Object.assign({ payload: r.content[0].text }, r) }; }
    return { error: { code: "not_in_manifest", message: "not declared" } };
  }
  async function newPage(viewport) {
    const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 950 } }), page = await ctx.newPage();
    page.on("pageerror", (e) => logs.push("[pageerror] " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_/.test(m.text())) logs.push("[console] " + m.text()); });
    await page.route((u) => u.hostname !== "127.0.0.1", (r) => { external.push(new URL(r.request().url()).hostname); r.abort(); });
    await page.route((u) => u.hostname === "127.0.0.1" && u.port === String(data.port), (r) => { external.push("页面自己去取了 " + r.request().url()); r.abort(); });   // 在 Claude 里页面不能自己联网：只能经桌面版
    await page.exposeFunction("__reply", (turns) => reply(turns));
    await page.exposeFunction("__mcp", mcpBridge);
    await page.addInitScript(MOCK);
    await page.addInitScript(`try { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.clear(); localStorage.setItem("ql.ml.v1", ${JSON.stringify(ST)}); } } catch (e) {}`);
    await page.goto("http://127.0.0.1:" + web.port + "/");
    await page.waitForFunction(() => window.MLA && MLA.preview, null, { timeout: 30000 });
    return { ctx, page };
  }
  const logText = (page) => page.evaluate(() => (document.querySelector(".ml-web-log") || {}).innerText || "");
  async function getUrl(page, u) { const n0 = await page.evaluate(() => +(document.querySelector(".ml-web-log").getAttribute("data-done") || 0)); await page.fill("#webUrl", u); await page.click("#webGet"); await page.waitForFunction((n0) => +(document.querySelector(".ml-web-log").getAttribute("data-done") || 0) > n0, n0, { timeout: 60000 }); return logText(page); }
  const ST = JSON.stringify({ v: 1, group: "tab-cls", ds: {}, algo: {}, my: [], budget: 4, split: { train: 0.6, valid: 0.2 }, horizon: 1, view: "charts", flags: { welcomed: 1 } });
  const idle = (page) => page.waitForFunction(() => !MLA.busy(), null, { timeout: 120000, polling: 100 });
  try {
    let { ctx, page } = await newPage();

    section("页面本身");
    const top = await page.evaluate(() => ({ title: document.title, lab: document.getElementById("btnLab").href, target: document.getElementById("btnLab").target, ai: document.getElementById("btnAI").textContent }));
    ok(top.title === "机器学习实验室", "标题是“机器学习实验室”", top.title);
    ok(top.lab === SITE && top.target === "_blank", "“策略实验室”链接到网站，在新窗口打开", JSON.stringify(top));
    ok(top.ai === "Claude", "顶栏的 AI 按钮叫 Claude", top.ai);

    section("AI 就是 Claude：不用接入、不用密钥");
    await page.click("#btnAI");
    await page.waitForFunction(() => !document.getElementById("aiSend").disabled, null, { timeout: 15000 });
    const pane = await page.evaluate(() => ({ prov: !!document.getElementById("aiProv"), h: document.querySelector("#paneAi h2").textContent, off: document.getElementById("aiOff").hidden, ph: document.getElementById("aiInput").getAttribute("aria-label") }));
    ok(!pane.prov && pane.h === "Claude" && pane.off && /Claude/.test(pane.ph), "面板叫 Claude，没有“接入 AI…”的设置，可以直接输入", JSON.stringify(pane));
    ok(await page.evaluate(() => MLA.aiReady() && !MLA.aiCanSearch() && MLA.aiHost === true), "页面知道自己在 Claude 里（不能上网搜）");
    const send = async (t) => { await page.fill("#aiInput", t); await page.click("#aiSend"); await page.waitForFunction(() => document.getElementById("aiStop").hidden, null, { timeout: 60000, polling: 100 }); await idle(page); };

    section("写算法、诊断、问结果");
    await send("写一个逻辑回归");
    let st = await page.evaluate(() => ({ src: MLA.algo() && MLA.algo().src, last: MLA.last && MLA.last.algo.name, log: document.getElementById("aiLog").innerText.slice(-300) }));
    ok(st.src === "ai" && st.last === "逻辑回归（AI）" && /运行完成/.test(st.log), "Claude 写的算法存进“AI 写的”并运行了一次", JSON.stringify(st));
    let c0 = await page.evaluate(() => window.__calls[0]);
    ok(c0.tier === "complex" && c0.keys.indexOf("signal") >= 0 && c0.keys.indexOf("onText") >= 0 && c0.keys.indexOf("webSearch") < 0, "写算法用 complex 档，流式显示、可以停止；不带网页版才有的选项", JSON.stringify(c0));
    await page.click('#aiModes button:has-text("诊断")');
    await page.evaluate(() => MLA.aiDiagnose());
    await page.waitForFunction(() => document.getElementById("aiStop").hidden && /下一步/.test(document.getElementById("aiLog").innerText), null, { timeout: 60000 });
    ok(/偏差还是方差/.test(await page.locator("#aiLog").innerText()) && (await page.$$("#aiLog .katex")).length > 0, "诊断报告渲染出来（含公式）");
    await page.click('#aiModes button:has-text("问结果")');
    await send("为什么训练集和验证集差不多？");
    ok(/在误差之内/.test(await page.locator("#aiLog").innerText()), "问结果有回答");
    const tiers = await page.evaluate(() => window.__calls.map((c) => c.tier));
    ok(tiers.join() === "complex,default,default", "诊断、问结果用 default 档", tiers.join());

    section("停止、出错");
    await page.evaluate(() => { window.__mock.delay = 1500; });
    await page.fill("#aiInput", "慢慢说"); await page.click("#aiSend");
    await page.waitForSelector("#aiStop:not([hidden])"); await page.waitForTimeout(200); await page.click("#aiStop");
    await page.waitForFunction(() => document.getElementById("aiStop").hidden, null, { timeout: 10000 });
    ok(/已停止/.test(await page.locator("#aiLog .msg-a").last().innerText()), "点停止：停下来，说“已停止”");
    await page.evaluate(() => { window.__mock.delay = 2; window.__mock.fail = "rate_limited"; });
    await send("再问一次");
    ok(/调用太频繁，或者已经用到了账号的用量上限/.test(await page.locator("#aiLog .msg-a").last().innerText()) && !(await page.$eval("#aiSend", (b) => b.disabled)), "限速：说清楚，输入框还能用");
    await page.evaluate(() => { window.__mock.fail = "not_granted"; });
    await send("再问一次");
    const off = await page.evaluate(() => ({ t: document.getElementById("aiLog").innerText.slice(-200), off: document.getElementById("aiOff").hidden ? "" : document.getElementById("aiOff").textContent, dis: document.getElementById("aiSend").disabled, ready: MLA.aiReady() }));
    ok(/你没有允许这个页面使用 Claude/.test(off.t) && /其余功能不受影响/.test(off.off) && off.dis && !off.ready, "没允许使用 Claude：说清楚，关掉输入，别的功能照常", JSON.stringify(off));

    section("本机引擎：经 Claude 桌面版（本地 MCP 服务器）");
    ok((await page.evaluate(() => window.__mcpCalls.length)) === 0 && !(await page.evaluate(() => MLA.engineReady())), "没允许过：打开页面时不调用本机工具（不会一上来就弹出询问）");
    await page.click("#btnEngine"); await page.waitForSelector("#engMcpConnect");
    let et = await page.locator(".ml-eng").innerText();
    ok(/作为“本地 MCP 服务器”加进桌面版的设置/.test(et) && /python -m mllab_engine --claude-config/.test(et) && /Developer/.test(et) && /Edit Config/.test(et), "对话框里写着三步：装好引擎、加进桌面版的设置、重启并连接", et.slice(0, 300));
    const cfg = JSON.parse(await page.locator("#engMcpConfig").innerText());
    ok(cfg.mcpServers["mllab-engine"].args.join(" ") === "-m mllab_engine --mcp", "给出 claude_desktop_config.json 里要加的那一段", JSON.stringify(cfg));
    await page.click("#engMcpConnect");
    await page.waitForSelector("#engMcpErr", { timeout: 15000 });
    ok(/Claude 桌面版里没有找到本机引擎/.test(await page.locator("#engMcpErr").innerText()), "还没配置（桌面版里没有这个服务器）：说清楚，按步骤配置");
    eng.on = true;
    await page.click("#engMcpConnect");
    await page.waitForFunction(() => MLA.engineReady(), null, { timeout: 30000 });
    await page.waitForSelector(".ml-eng .ok-note", { timeout: 10000 });
    ok(/已经经 Claude 桌面版连上本机引擎/.test(await page.locator(".ml-eng .ok-note").innerText()) && (await page.evaluate(() => (window.QL_MLPY || []).some((a) => a.id === "py-ridge_numpy"))), "连上了：Python 的示例算法进了算法列表");
    ok((await page.evaluate(() => window.__mcpCalls.every((c) => c.cache === false))), "每次调用都不用缓存（运行、取数据都要真的去做）");
    await page.keyboard.press("Escape");

    section("在 Claude 里从网上取数据：经本机引擎（压缩文件、分块读）");
    await page.evaluate(() => MLA.selectGroup("tab-reg"));
    await page.click("#btnWeb"); await page.waitForSelector("#webDesc");
    ok(/网上的数据由本机引擎去取/.test(await page.locator("#webHost").innerText()), "对话框顶上说：经本机引擎去取");
    let lt = await getUrl(page, D + "/big.csv.gz");
    const reads = await page.evaluate(() => window.__mcpCalls.filter((c) => c.tool === "read_blob").length);
    ok(/请本机引擎去取（经 Claude 桌面版）/.test(lt) && /本机引擎取到了/.test(lt) && /gzip 解压后/.test(lt) && /读出 50000 行/.test(lt) && reads >= 1, "gz 文件经引擎取来、分块读完、解压、抽样到 5 万行", lt.slice(-300) + " | read_blob " + reads);
    await page.selectOption("#webTarget", "y"); await page.selectOption("#webKind", "regression");
    await page.click("#webImport");
    await page.waitForFunction(() => MLA.ds().id === "csv" && MLA.ds().web && MLA.ds().web.via === "engine" && MLA.preview && MLA.preview.dsId === "csv", null, { timeout: 30000 });
    ok(true, "导入了，记着是本机引擎取的");

    section("在 Claude 里用本机引擎跑 Python 算法（大的请求分块交，长的结果分块取）");
    await page.evaluate(() => MLA.selectAlgo("py-ridge_numpy"));
    const n1 = await page.evaluate(() => window.__mcpCalls.length);
    const pr = await page.evaluate(async () => { try { const r = await MLA.run({ quiet: true }); return { r2: r.metrics.valid.r2, engine: !!r.engineInfo, log: (r.log || []).join(" ") }; } catch (e) { return { err: e.message || String(e) }; } });
    const used = await page.evaluate((n1) => window.__mcpCalls.slice(n1).map((c) => c.tool), n1);
    ok(pr.r2 > 0.99 && pr.engine && /本机引擎：Python/.test(pr.log), "Python 的岭回归在引擎里跑完，页面打分（y = v + 2w，R² 接近 1）", JSON.stringify(pr));
    ok(used.filter((t) => t === "run_upload").length >= 2 && used.indexOf("run_start") > used.lastIndexOf("run_upload") && used.filter((t) => t === "run_events").length >= 1, "5 万行的数据分几块交，再请运行，再取事件", used.join(","));
    ok(eng.bad.length === 0, "引擎的标准输出里只有 MCP 消息", eng.bad.slice(0, 2).join(" | "));

    section("在 Claude 里从网上取数据：没接引擎时经桌面版的浏览器");
    await page.keyboard.press("Escape").catch(() => {});
    const second = await newPage();
    const p2 = second.page;
    ok(!(await p2.evaluate(() => MLA.engineReady())), "新的一页没允许过引擎：没连");
    await p2.evaluate(() => MLA.selectGroup("tab-reg"));
    await p2.click("#btnWeb"); await p2.waitForSelector("#webDesc");
    const hw = await p2.locator("#webHost").innerText();
    ok(/没接本机引擎时用桌面版自带的浏览器/.test(hw) && /最多约 200 万个字符/.test(hw) && !(await p2.$eval("#webAsk", (b) => b.disabled)), "对话框顶上说：经桌面版的浏览器去取，有哪些限制；“让 AI 找”可以用", hw.slice(0, 200));
    lt = await getUrl(p2, D + "/sales.csv");
    ok(/本机引擎没有连上/.test(lt) === false && /请 Claude 桌面版的浏览器去取/.test(lt) && /浏览器取到了/.test(lt) && /读出 400 行、4 列/.test(lt), "浏览器打开那个地址、读出文字，读出 400 行 4 列", lt.slice(-300));
    ok(/Claude 桌面版的浏览器取的/.test(await p2.locator(".ml-web-prev").innerText()), "预览里写着是浏览器取的");
    lt = await getUrl(p2, D + "/page.html");
    ok(/取到的是网页（数据下载页）/.test(lt), "取到网页：说清楚", lt.slice(-200));
    lt = await getUrl(p2, D + "/big.csv.gz");
    ok(/压缩文件、Excel 之类经浏览器取不了/.test(lt), "压缩文件：说要接上本机引擎", lt.slice(-200));
    lt = await getUrl(p2, D + "/huge.csv");
    ok(/浏览器只读到了前 200 万个字符/.test(lt) && /读出 50000 行/.test(lt), "太长的文件：读到多少用多少，并说清楚可能不全", lt.slice(-300));
    ok(br.calls.filter((t) => t === "preview_start").length === 1 && br.calls.indexOf("navigate") > 0, "只开一个标签页，之后在同一个标签页里换地址", br.calls.join(","));
    await p2.click("#webImport");
    const imp = await p2.waitForFunction(() => MLA.ds().id === "csv" && MLA.ds().web && MLA.ds().web.via === "browser", null, { timeout: 30000 }).then(() => "", () => p2.evaluate(() => JSON.stringify({ err: (document.querySelector(".ml-web-prev .warn.err") || {}).textContent, id: MLA.ds().id, web: MLA.ds().web, modal: !!document.querySelector(".mlweb") })));
    ok(!imp, "浏览器取来的数据也能导入", imp);
    await second.ctx.close();

    section("允许过的话，再打开页面时自动连上");
    await page.reload(); await page.waitForFunction(() => window.MLA && MLA.preview, null, { timeout: 30000 });
    await page.waitForFunction(() => MLA.engineReady(), null, { timeout: 30000 });
    ok(/本机引擎 · numpy/.test(await page.locator("#btnEngine").innerText()), "顶栏的“本机引擎”亮着，不用再点连接");
    await page.waitForFunction(() => !MLA.csvPending, null, { timeout: 60000 }).catch(() => {});
    const st2 = await page.evaluate(() => ({ id: MLA.ds().id, via: MLA.ds().web && MLA.ds().web.via, g: MLA.group().id, toast: (document.querySelector(".toast") || {}).textContent || "" }));
    ok(st2.id === "csv" && st2.via === "engine", "上次导入的数据还在（大文件刷新后经引擎重新取）", JSON.stringify(st2));

    section("要确认的操作不用浏览器的对话框（Claude 里 confirm() 直接返回“取消”）");
    page.on("dialog", (d) => { logs.push("[dialog] " + d.message()); d.dismiss().catch(() => {}); });
    const mine0 = await page.evaluate(() => { MLA.selectGroup("tab-cls"); const m = MLA.S.my[0]; MLA.selectAlgo(m.id); return m.id; });
    await page.click("#btnCode"); await page.waitForSelector("#btnDelMine");
    await page.click("#btnDelMine");
    const armed = await page.$eval("#btnDelMine", (b) => b.textContent);
    ok(/再点一次：删除/.test(armed) && (await page.evaluate((id) => MLA.S.my.some((x) => x.id === id), mine0)), "点一次“删除”：按钮变成“再点一次”，还没删", armed);
    await page.click("#btnDelMine");
    ok(await page.evaluate((id) => !MLA.S.my.some((x) => x.id === id), mine0), "再点一次：删掉了");

    section("别的功能照常");
    await page.evaluate(() => MLA.selectGroup("ts"));
    await page.evaluate(() => MLA.selectDs && MLA.selectDs("ar2"));
    const run = await page.evaluate(async () => { try { const r = await MLA.run({ quiet: true }); return { ok: !!r.metrics }; } catch (e) { return { err: e.message }; } });
    ok(run.ok, "内置算法照常运行", JSON.stringify(run));
    await page.setViewportSize({ width: 380, height: 820 }); await page.waitForTimeout(300);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const wide = ov > 1 ? await page.evaluate(() => Array.from(document.querySelectorAll("body *")).filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && e.offsetParent).slice(0, 6).map((e) => e.tagName + "#" + e.id + "." + e.className + " " + Math.round(e.getBoundingClientRect().right) + " " + (e.textContent || "").slice(0, 30)).join(" | ")) : "";
    ok(ov <= 1, "手机宽度没有横向滚动条", String(ov) + " " + wide);
    if (process.env.ML_SHOTS) { fs.mkdirSync(process.env.ML_SHOTS, { recursive: true }); await page.setViewportSize({ width: 1440, height: 950 }); await page.screenshot({ path: path.join(process.env.ML_SHOTS, "claude-host.png") }); }
    await ctx.close();
    const ext = external.filter((x) => !/^fonts\.(googleapis|gstatic)\.com$/.test(x));
    ok(ext.length === 0, "页面自己没有向外发请求（网页字体之外）；网上的数据都经桌面版去取", ext.join(", "));
    ok(logs.length === 0, "页面没有报错", logs.slice(0, 6).join("\n"));
  } catch (e) { console.log("CRASH: " + (e && e.stack || e)); }
  await browser.close(); await web.close(); await data.close(); eng.close();
  done();
})();
