// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 亲手写 · 语言模型 · AI 助教，在 Claude 里打开的版本（dist/ml-lm-preview.html：dist/ml-lm.html 套上和 Artifact 一样的骨架）。
// 页面里装一个假的 window.claude：use("sample") 按 Artifact 的 sample 能力的约定（onText 收到 {text, delta}，中止时报 cancelled，出错时报 {code}）；
// use("mcp") 给 null（这里不连引擎：上一次运行的结果事先写进 localStorage）。
// 核对：宽屏默认打开；交给 AI 的材料里有规矩、题目、带行号的代码、没过的那一项和帮助程度；回答流式显示、按 Markdown 渲染、存下来；
// 结果卡片上的“问 AI 助教”带着上一轮对话再问；“完整写法”以后左栏标上“看过写法”；停止；刷新以后对话还在；换一步换一份对话；
// 不允许使用 Claude 时关掉输入并说清楚；中等宽度默认收起、点开是浮层；手机上是第三个标签页，没有横向滚动；页面不报错。
// 用法：node test/ui-ml-lm-ai.js   （先 python3 build.py）
const http = require("http"), fs = require("fs"), path = require("path");
function need(name, fallback) { try { return require(name); } catch (e) { return require(fallback); } }
const { chromium } = need("playwright", "/opt/npm-tools/node_modules/playwright");
const { ok, section, done } = require("./harness.js");
const PAGE = path.join(__dirname, "../dist/ml-lm-preview.html");

const MOCK = `(() => {
  const calls = window.__calls = [], st = window.__mock = { fail: null, delay: 2, reply: "**减去最大值**：第 2 行的 $e^{x}$ 在 $x=1000$ 时溢出。" };
  function sample(input, opts) {
    opts = opts || {};
    calls.push({ tier: opts.modelTier, cache: opts.cache, turns: input.map((t) => ({ role: t.role, content: t.content })) });
    return new Promise((resolve, reject) => {
      let dead = false, text = "";
      if (opts.signal) opts.signal.addEventListener("abort", () => { if (!dead) { dead = true; reject({ code: "cancelled", message: "aborted", text }); } });
      if (st.fail) { const c = st.fail; st.fail = null; setTimeout(() => { dead = true; reject({ code: c, message: "mock " + c }); }, 20); return; }
      const parts = st.reply.match(/[\\s\\S]{1,12}/g) || [];
      let i = 0;
      (function tick() {
        if (dead) return;
        if (i >= parts.length) { dead = true; resolve({ text: st.reply, truncated: false, modelTierApplied: "default" }); return; }
        const d = parts[i++]; text += d; if (opts.onText) try { opts.onText({ text, delta: d }); } catch (e) {}
        setTimeout(tick, st.delay);
      })();
    });
  }
  sample.limits = () => Promise.resolve({ maxPromptBytes: 262144 });
  const permissions = Object.freeze({ state: () => Promise.resolve("prompt"), request: () => Promise.resolve({}), manage: () => Promise.resolve() });
  window.claude = Object.freeze({ use: (n) => new Promise((r) => setTimeout(() => r(n === "sample" ? sample : n === "permissions" ? permissions : null), 30)) });
})();`;

const NAIVE = "def softmax(x, dim=-1):\n    e = torch.exp(x)\n    return e / e.sum(dim=dim, keepdim=True)\n";
const LAST = { passed: 4, total: 5, at: 1762700000000, backend: "torch", code: NAIVE, map: [{ step: 1, start: 6, n: 3 }],
  tests: [{ name: "形状和输入一样", ok: true }, { name: "每一行加起来是 1", ok: true }, { name: "和独立算的答案一致", ok: true, err: 1e-7, tol: 1e-5 },
    { name: "大数不溢出", ok: false, msg: "x = 1000 时得到了 nan（第 7 行）", line: 7 }, { name: "从零写（没有调用现成的 softmax）", ok: true }] };
const SEED = { "qlml.lm.cur": 1, "qlml.lm.backend": "torch", "qlml.lm.code.torch.softmax": NAIVE, "qlml.lm.last.softmax": LAST, "qlml.lm.status": { softmax: { passed: 4, total: 5, at: LAST.at } } };

(async () => {
  if (!fs.existsSync(PAGE)) { console.log("SKIP: 先运行 python3 build.py"); console.log("0 passed, 0 failed"); return; }
  const server = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(fs.readFileSync(PAGE)); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + server.address().port + "/";
  const browser = await chromium.launch(); const logs = [];
  async function newPage(viewport, extra) {
    const ctx = await browser.newContext(Object.assign({ viewport }, extra || {})), page = await ctx.newPage();
    page.on("pageerror", (e) => logs.push("[pageerror] " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|fonts\.g|net::/.test(m.text())) logs.push("[console] " + m.text()); });
    await page.route((u) => u.hostname !== "127.0.0.1", (rt) => rt.abort());
    await page.addInitScript(MOCK);
    await page.addInitScript("try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.clear(); const s = " + JSON.stringify(SEED) + "; for (const k in s) localStorage.setItem(k, JSON.stringify(s[k])); } } catch (e) {}");
    await page.goto(url);
    await page.waitForSelector(".lm-card");
    return { ctx, page };
  }
  const lastCall = (page) => page.evaluate(() => window.__calls[window.__calls.length - 1]);
  const idle = (page) => page.waitForFunction(() => !document.querySelector("#aiLog .spin") && document.querySelector("#aiStop").hidden, null, { timeout: 15000 });
  try {
    const { ctx, page } = await newPage({ width: 1360, height: 900 });

    section("宽屏：默认打开，四档帮助程度");
    await page.waitForFunction(() => !document.querySelector("#aiSend").disabled, null, { timeout: 5000 });
    ok(await page.locator("#app.ai-open").count() === 1 && await page.locator("#paneAi").isVisible(), "右栏的 AI 助教默认打开");
    ok(await page.locator(".lm-lv .chip").count() === 4, "四档帮助程度");
    ok(await page.locator('.lm-lv .chip[aria-pressed="true"]').innerText() === "指出错在哪", "默认是“指出错在哪”");
    const quick = await page.locator(".lm-quick button").allInnerTexts();
    ok(quick.indexOf("为什么没过？") >= 0 && quick.indexOf("从哪下手？") >= 0, "上一次没过：快捷按钮里有“为什么没过？”", quick.join(" | "));
    ok(await page.evaluate(() => document.activeElement && document.activeElement.id !== "aiInput"), "打开页面时不抢走焦点");

    section("问“为什么没过？”：交给 AI 的材料");
    await page.locator(".lm-quick button", { hasText: "为什么没过？" }).click();
    await idle(page);
    let c = await lastCall(page);
    const last = c.turns[c.turns.length - 1].content;
    ok(c.turns[0].role === "user" && /硬规矩/.test(c.turns[0].content) && /F\.softmax/.test(c.turns[0].content), "第一轮是规矩（含不许调用现成的 softmax）");
    ok(/第 1 步 \/ 共 6 步：softmax/.test(last) && /PyTorch/.test(last), "说明现在在第 1 步、用 PyTorch 写", last.slice(0, 200));
    ok(/ 2\|     e = torch\.exp\(x\)/.test(last), "代码带行号", last.match(/【他现在的代码[\s\S]{0,200}/)[0]);
    ok(/✗ 大数不溢出/.test(last) && /第 1 步的第 2 行/.test(last), "上一次运行：没过的那一项，位置换算成第几步第几行", (last.match(/【上一次运行】[\s\S]{0,400}/) || [""])[0]);
    ok(/【帮助程度】「指出错在哪」/.test(last) && /【他的问题】\n上一次运行为什么没过？$/.test(last), "带着帮助程度和问题", last.slice(-160));
    ok(c.tier === "default" && c.cache === false, "modelTier default、不用缓存", JSON.stringify({ tier: c.tier, cache: c.cache }));
    ok(await page.locator("#aiLog .msg-u").count() === 1 && await page.locator("#aiLog .msg-a strong").innerText() === "减去最大值", "回答按 Markdown 渲染");
    ok(await page.locator("#aiLog .msg-a .tex, #aiLog .msg-a .katex").count() >= 1, "回答里的公式交给 KaTeX");

    section("结果卡片上的“问 AI 助教”");
    const ask = page.locator(".lm-askai button");
    ok(await ask.count() === 1 && /为什么没过/.test(await ask.innerText()), "上一次没过：结果下面有“问 AI 助教：为什么没过？”");
    await ask.click(); await idle(page);
    c = await lastCall(page);
    ok(c.turns.length === 4 && c.turns[1].role === "user" && c.turns[2].role === "assistant", "第二次带着上一轮的问答", c.turns.map((t) => t.role).join(","));
    ok(await page.locator("#aiLog .msg-a").count() === 2, "两轮回答都在");

    section("完整写法：左栏标上“看过写法”");
    await page.locator('.lm-lv .chip[data-lv="full"]').click();
    ok(/看过写法/.test(await page.locator(".lm-lvnote").innerText()), "选“完整写法”时先说明后果");
    await page.locator("#aiInput").fill("直接给我写法");
    await page.locator("#aiInput").press("Control+Enter");
    await idle(page);
    c = await lastCall(page);
    ok(/【帮助程度】「完整写法」/.test(c.turns[c.turns.length - 1].content), "这一次的帮助程度是“完整写法”");
    ok(/看过写法/.test(await page.locator(".lm-step").nth(1).innerText()), "左栏第 1 步标上“看过写法”");
    await page.locator('.lm-lv .chip[data-lv="fix"]').click();

    section("停止");
    await page.evaluate(() => { window.__mock.delay = 400; window.__mock.reply = "x".repeat(400); });
    await page.locator("#aiInput").fill("慢慢讲"); await page.locator("#aiSend").click();
    await page.waitForFunction(() => !document.querySelector("#aiStop").hidden);
    await page.waitForTimeout(500);
    await page.locator("#aiStop").click(); await idle(page);
    ok(/已停止/.test(await page.locator("#aiLog .msg-a").last().innerText()) && !(await page.locator("#aiInput").isDisabled()), "点停止：说“已停止”，可以接着问");
    await page.evaluate(() => { window.__mock.delay = 2; window.__mock.reply = "好的。"; });

    section("刷新以后、换一步");
    await page.reload(); await page.waitForSelector(".lm-card");
    await page.waitForFunction(() => !document.querySelector("#aiSend").disabled, null, { timeout: 5000 });
    ok(await page.locator("#aiLog .msg-a").count() === 3 && await page.locator("#aiLog .msg-u").count() === 4, "对话还在（停掉的那次没有存回答）", (await page.locator("#aiLog").innerText()).slice(0, 200));
    await page.locator(".lm-step").nth(2).click();
    ok(await page.locator("#aiLog .msg-u").count() === 0 && /第 2 步/.test(await page.locator("#aiLog").innerText()), "第 2 步是另一份对话");
    ok((await page.locator(".lm-quick button").allInnerTexts()).indexOf("从哪下手？") >= 0, "第 2 步：快捷按钮“从哪下手？”");
    await page.locator(".lm-quick button", { hasText: "从哪下手？" }).click(); await idle(page);
    c = await lastCall(page);
    const l2 = c.turns[c.turns.length - 1].content;
    ok(/第 2 步/.test(l2) && /【前面几步他写的代码/.test(l2) && /第 1 步：softmax/.test(l2) && /还没运行过/.test(l2), "第 2 步的材料：带上第 1 步的代码，还没运行过", l2.slice(0, 300));
    await page.locator(".lm-step").nth(0).click();
    ok((await page.locator(".lm-quick button").allInnerTexts()).some((t) => /整体/.test(t)), "总览页也能问");

    section("不允许使用 Claude");
    await page.evaluate(() => { window.__mock.fail = "not_granted"; });
    await page.locator("#aiInput").fill("你好"); await page.locator("#aiSend").click(); await idle(page);
    ok(await page.locator("#aiInput").isDisabled() && /没有允许/.test(await page.locator("#aiOff").innerText()), "关掉输入，说清楚原因", await page.locator("#aiOff").innerText());
    await page.locator(".lm-step").nth(1).click();
    ok(await page.locator(".lm-askai").count() === 0, "结果卡片上不再出现“问 AI 助教”");
    await ctx.close();

    section("中等宽度：默认收起，点开是浮层");
    const mid = await newPage({ width: 1000, height: 800 });
    ok(await mid.page.locator("#app.ai-open").count() === 0, "1000 宽：默认收起");
    await mid.page.locator("#btnAI").click();
    ok(await mid.page.locator("#paneAi").isVisible() && await mid.page.evaluate(() => getComputedStyle(document.getElementById("paneAi")).position === "fixed"), "点“AI 助教”：从右边滑出的浮层");
    ok(await mid.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "没有横向滚动");
    await mid.page.locator("#paneAi .iconbtn").click();
    ok(await mid.page.locator("#app.ai-open").count() === 0, "✕ 收起");
    await mid.ctx.close();

    section("手机宽度");
    const m = await newPage({ width: 375, height: 760 }, { isMobile: true, hasTouch: true });
    ok(!(await m.page.locator("#btnAI").isVisible()), "顶栏不放“AI 助教”按钮（用标签页）");
    await m.page.locator('#tabs button[data-tab="ai"]').click();
    ok(await m.page.locator("#paneAi").isVisible() && !(await m.page.locator("#paneRes").isVisible()), "第三个标签页是 AI 助教");
    for (const tab of ["ai", "res", "ctl"]) {
      await m.page.locator('#tabs button[data-tab="' + tab + '"]').click();
      const sw = await m.page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      ok(sw[0] <= sw[1] + 1, "手机宽度没有横向滚动（" + tab + "）", JSON.stringify(sw));
    }
    await m.page.locator('#tabs button[data-tab="res"]').click();
    await m.page.waitForFunction(() => !document.querySelector("#aiSend").disabled, null, { timeout: 5000 });
    await m.page.locator(".lm-askai button").click();
    ok(await m.page.locator("#paneAi").isVisible(), "手机上点结果下面的“问 AI 助教”：切到 AI 助教那一页");
    await idle(m.page);
    await m.ctx.close();
    ok(logs.length === 0, "页面没有报错", logs.join("\n"));
  } catch (e) { console.log("CRASH: " + (e && e.stack || e)); ok(false, "测试没有跑完"); }
  await browser.close(); server.close();
  done();
})();
