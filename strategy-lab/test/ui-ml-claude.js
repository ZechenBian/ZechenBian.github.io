// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 机器学习实验室 · 在 Claude 里打开的版本（dist/ml-preview.html：dist/ml-lab.html 套上和 Artifact 一样的骨架）。
// 页面里装一个假的 window.claude（按 Artifact 的 sample 能力的约定：use("sample") 给一个函数；onText 收到 {text, delta}；
// 中止时报 cancelled；出错时报 {code, message}），回答借用 ml-mock-replies.js。
// 核对：AI 就是 Claude（没有"接入 AI"的设置）、四种用法都能用、用户不允许时关掉输入并说清楚；
// 从网上取数据和本机引擎说明在 Claude 里不能联网并指向网站版；回到策略实验室的链接是网站的绝对地址；页面不报错、不向外发请求。
// 用法：node test/ui-ml-claude.js   （先 python3 build.py）
const http = require("http"), fs = require("fs"), path = require("path");
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
  window.claude = { use: (name) => new Promise((r) => setTimeout(() => r(name === "sample" ? sample : null), 40)) };
})();`;

function pageSite() {
  const s = http.createServer((req, res) => { if (req.url.split("?")[0] === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(fs.readFileSync(PAGE)); } else { res.writeHead(404); res.end(); } });
  return new Promise((r) => s.listen(0, "127.0.0.1", () => r({ port: s.address().port, close: () => new Promise((q) => s.close(q)) })));
}

(async () => {
  if (!fs.existsSync(PAGE)) { console.log("CRASH: 没有 dist/ml-preview.html，先 python3 build.py"); process.exit(1); }
  const web = await pageSite(), browser = await chromium.launch(), logs = [], external = [];
  const ST = JSON.stringify({ v: 1, group: "tab-cls", ds: {}, algo: {}, my: [], budget: 4, split: { train: 0.6, valid: 0.2 }, horizon: 1, view: "charts", flags: { welcomed: 1 } });
  const idle = (page) => page.waitForFunction(() => !MLA.busy(), null, { timeout: 120000, polling: 100 });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } }), page = await ctx.newPage();
    page.on("pageerror", (e) => logs.push("[pageerror] " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_/.test(m.text())) logs.push("[console] " + m.text()); });
    await page.route((u) => u.hostname !== "127.0.0.1", (r) => { external.push(new URL(r.request().url()).hostname); r.abort(); });
    await page.exposeFunction("__reply", (turns) => reply(turns));
    await page.addInitScript(MOCK);
    await page.addInitScript(`try { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.clear(); localStorage.setItem("ql.ml.v1", ${JSON.stringify(ST)}); } } catch (e) {}`);
    await page.goto("http://127.0.0.1:" + web.port + "/");
    await page.waitForFunction(() => window.MLA && MLA.preview, null, { timeout: 30000 });

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

    section("从网上取数据：在 Claude 里不能联网");
    await page.click("#btnWeb"); await page.waitForSelector("#webDesc");
    const wd = await page.evaluate(() => ({ host: (document.getElementById("webHost") || {}).innerText || "", link: (document.querySelector("#webHost a") || {}).href, ask: document.getElementById("webAsk").disabled }));
    ok(/Claude 不让页面自己联网/.test(wd.host) && wd.link === SITE + "ml/" && wd.ask, "对话框顶上说明在 Claude 里取不到网上的数据，给出网站版的地址；“让 AI 找”是灰的", JSON.stringify(wd));
    const n0 = await page.evaluate(() => +(document.querySelector(".ml-web-log").getAttribute("data-done") || 0));
    await page.click('.ml-web-item button[data-cat="penguins"]');
    await page.waitForFunction((n0) => +(document.querySelector(".ml-web-log").getAttribute("data-done") || 0) > n0, n0, { timeout: 30000 });
    const wl = await page.locator(".ml-web-log").innerText();
    ok(/在 Claude 里打开时页面不能联网/.test(wl) && !/没有连上本机引擎（连上以后/.test(wl), "真的去取时，失败的原因说的是在 Claude 里不能联网", wl.slice(-300));
    await page.keyboard.press("Escape");
    await page.click("#btnEngine"); await page.waitForSelector(".ml-eng");
    ok(/你是在 Claude 里打开的这一页：这里连不上本机引擎/.test(await page.locator(".ml-eng").innerText()), "本机引擎：说明在 Claude 里连不上");
    await page.keyboard.press("Escape");

    section("要确认的操作不用浏览器的对话框（Claude 里 confirm() 直接返回“取消”）");
    page.on("dialog", (d) => { logs.push("[dialog] " + d.message()); d.dismiss().catch(() => {}); });
    const mine0 = await page.evaluate(() => MLA.algo() && MLA.algo().id);
    await page.click("#btnCode"); await page.waitForSelector("#btnDelMine");
    await page.click("#btnDelMine");
    const armed = await page.$eval("#btnDelMine", (b) => b.textContent);
    ok(/再点一次：删除/.test(armed) && (await page.evaluate((id) => MLA.S.my.some((x) => x.id === id), mine0)), "点一次“删除”：按钮变成“再点一次”，还没删", armed);
    await page.click("#btnDelMine");
    ok(await page.evaluate((id) => !MLA.S.my.some((x) => x.id === id), mine0), "再点一次：删掉了");

    section("别的功能照常");
    await page.evaluate(() => MLA.setGroup ? MLA.setGroup("ts") : null);
    const run = await page.evaluate(async () => { try { const r = await MLA.run({ quiet: true }); return { ok: !!r.metrics }; } catch (e) { return { err: e.message }; } });
    ok(run.ok, "内置算法照常运行", JSON.stringify(run));
    await page.setViewportSize({ width: 380, height: 820 }); await page.waitForTimeout(300);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(ov <= 1, "手机宽度没有横向滚动条", String(ov));
    if (process.env.ML_SHOTS) { fs.mkdirSync(process.env.ML_SHOTS, { recursive: true }); await page.setViewportSize({ width: 1440, height: 950 }); await page.screenshot({ path: path.join(process.env.ML_SHOTS, "claude-host.png") }); }
    await ctx.close();
    const ext = external.filter((x) => !/^fonts\.(googleapis|gstatic)\.com$/.test(x) && !/^(raw\.githubusercontent\.com|cdn\.jsdelivr\.net)$/.test(x));
    ok(ext.length === 0, "除了字体和点过的那份现成数据，没有向外发请求", ext.join(", "));
    ok(logs.length === 0, "页面没有报错", logs.slice(0, 6).join("\n"));
  } catch (e) { console.log("CRASH: " + (e && e.stack || e)); }
  await browser.close(); await web.close();
  done();
})();
