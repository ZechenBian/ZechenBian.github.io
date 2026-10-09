// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 独立的网页版里右栏的 AI 面板：接入一家服务商（自带密钥）之后，写策略、造世界、调图表、问结果都能用。
// 服务商是本机的一个假接口（mock-openai.js），密钥是随手编的；页面想连外面的网站一律连不上。
const path = require("path"), { open } = require("./ui-smoke.js"), mock = require("./mock-openai.js");
const SH = n => path.join(__dirname, "../shots/" + n);
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) pass++; else { fail++; console.log("  FAIL", name, d || ""); } };
const KEY = "test-key-ok";
(async () => {
  const api = await mock.start(), BASE = "http://127.0.0.1:" + api.port;
  let t = await open({ viewport: { width: 1440, height: 950 }, standalone: true }), page = t.page, logs = t.logs;
  const idle = async () => { await page.waitForTimeout(150); await page.waitForFunction(() => !window.App.isBusy, null, { timeout: 90000 }); await page.waitForTimeout(120); };
  const real = l => l.filter(x => !/ERR_FAILED|net::ERR|Failed to load resource|\[AI\]/.test(x));    // 被掐断的外部请求和页面自己记的"[AI] …"一行不算页面的错
  const st = async () => (await page.locator(".ai-st").innerText()).replace(/\n+/g, " | ");
  const foot = name => page.locator('.modal-f button:has-text("' + name + '")');
  const openSet = async () => { await page.click("#aiProv"); await page.waitForSelector(".ai-set"); };
  const stored = () => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
  const send = async (text) => { await page.fill("#aiInput", text); await page.click("#aiSend"); };
  const done = async (re, ms) => { await page.waitForFunction(r => !document.getElementById("aiSend").hidden && new RegExp(r).test(document.querySelector("#aiLog .msg-a:last-child").innerText), re, { timeout: ms || 30000 }); await page.waitForTimeout(150); };
  await page.waitForSelector(".crit .big", { timeout: 20000 }); await idle();

  // ---- 1) 还没接入：右栏不占地方，打开以后说清楚要做什么
  const s0 = await page.evaluate(() => ({ btn: document.getElementById("btnClaude").textContent, tab: document.querySelector('#tabs [data-tab="ai"]').textContent, open: document.getElementById("app").classList.contains("ai-open"), aria: document.getElementById("paneAi").getAttribute("aria-label") }));
  ok(s0.btn === "AI" && s0.tab === "AI" && s0.aria === "AI" && !s0.open, "独立的网页里这一栏叫 AI；还没接入时不自动展开", JSON.stringify(s0));
  await page.click("#btnClaude"); await page.waitForSelector("#aiOff:not([hidden])");
  const off = await page.locator("#aiOff").innerText();
  ok(/DeepSeek、ChatGPT、Kimi、豆包/.test(off) && /自己的 API 密钥/.test(off) && /只保存在这台电脑的浏览器里/.test(off) && (await page.locator("#aiSend").isDisabled()) && (await page.locator("#aiInput").isDisabled()), "没接入：说明能接哪几家、密钥放在哪儿；输入框和发送是灰的");
  ok((await page.locator("#aiProv").innerText()) === "接入 AI…" && (await page.locator("#paneAi select").count()) === 0 && (await page.locator("#aiDeepWrap").isHidden()), "面板顶上是\"接入 AI…\"，没有 Claude 的模型档位和深度模式");
  ok(!/Claude/.test(await page.locator("#paneAi").innerText()), "这一栏里不提 Claude");
  await page.screenshot({ path: SH("ai-1-empty.png") });

  // ---- 2) 设置：五个选项，密钥是密码框
  await page.locator('#aiOff button:has-text("接入 AI…")').click(); await page.waitForSelector(".ai-set");
  const provs = await page.locator(".ai-provs .chip").allInnerTexts();
  ok(provs.length === 5 && /DeepSeek/.test(provs[0]) && /ChatGPT/.test(provs[1]) && /Kimi/.test(provs[2]) && /豆包/.test(provs[3]) && /其他/.test(provs[4]), "可以选 DeepSeek、ChatGPT、Kimi、豆包，或者其他兼容的接口", provs.join(" / "));
  const f0 = await page.evaluate(() => ({ type: document.getElementById("aiKey").type, ac: document.getElementById("aiKey").autocomplete, ph: document.getElementById("aiModel").placeholder, link: document.querySelector(".ai-set a").href, rel: document.querySelector(".ai-set a").rel, sel: document.querySelector('.ai-provs [aria-pressed="true"]').dataset.p }));
  ok(f0.type === "password" && f0.ac === "off" && f0.ph === "deepseek-v4-pro" && f0.link === "https://platform.deepseek.com/api_keys" && /noopener/.test(f0.rel) && f0.sel === "deepseek", "密钥是密码框；默认选 DeepSeek，给出默认模型和申请密钥的链接", JSON.stringify(f0));
  await page.screenshot({ path: SH("ai-2-settings.png") });
  await page.click('.ai-provs [data-p="kimi"]');
  ok((await page.locator("#aiSite option").count()) === 2 && (await page.inputValue("#aiSite")) === "https://api.moonshot.cn/v1" && /国内站和国际站的密钥不通用/.test(await page.locator(".ai-hint").innerText()) && (await page.getAttribute("#aiModel", "placeholder")) === "kimi-k3", "Kimi：可以选国内站或国际站");
  await page.click('.ai-provs [data-p="doubao"]'); ok(/ep- 开头/.test(await page.locator(".ai-hint").innerText()) && /^doubao-seed/.test(await page.getAttribute("#aiModel", "placeholder")), "豆包：提示可以填推理接入点的编号");
  ok(/豆包 的接口不允许网页直接调用/.test(await page.locator(".ai-needproxy").innerText()) && (await page.evaluate(() => document.querySelector(".ai-adv").open)) && (await page.locator("#aiProxy").isVisible()), "豆包：明说要填转发代理，\"高级\"自动展开");
  await page.fill("#aiProxy", "https://my-proxy.example.workers.dev"); await page.locator("#aiProxy").blur(); await page.waitForTimeout(100);
  ok((await page.locator(".ai-needproxy").count()) === 0 && (await page.inputValue("#aiProxy")) === "https://my-proxy.example.workers.dev", "填了代理：那句提醒消失");
  await page.fill("#aiProxy", ""); await page.locator("#aiProxy").blur(); await page.waitForTimeout(100);
  await page.click('.ai-provs [data-p="deepseek"]'); ok((await page.locator(".ai-needproxy").count()) === 0, "DeepSeek：没有这句提醒");
  await page.click('.ai-provs [data-p="openai"]'); ok(/会员订阅不包含 API/.test(await page.locator(".ai-hint").innerText()) && (await page.locator(".ai-set a").getAttribute("href")) === "https://platform.openai.com/api-keys", "ChatGPT：提醒会员订阅和 API 是两回事");

  // ---- 3) 填错了有话说；测试连接；获取模型列表；保存
  await page.click('.ai-provs [data-p="custom"]');
  await foot("保存").click(); ok(/没有填接口地址/.test(await st()) && (await page.locator(".ai-set").count()) === 1, "没填接口地址就保存：不让存，说缺什么");
  await page.fill("#aiBase", location0(BASE)); await page.fill("#aiModel", "mock-pro"); await page.fill("#aiKey", "test-key-wrong");
  await foot("测试连接").click(); await page.waitForSelector(".ai-st.bad");
  let s = await st(); ok(/服务商不认这把密钥/.test(s) && /服务商的原话：HTTP 401/.test(s) && /Incorrect API key/.test(s) && !/test-key-wrong/.test(s), "密钥不对：说人话，附上服务商的原话（原话里的密钥是打了码的）", s);
  await page.fill("#aiKey", KEY); await page.fill("#aiModel", "typo-model");
  await foot("测试连接").click(); await page.waitForFunction(() => /模型/.test(document.querySelector(".ai-st").innerText));
  s = await st(); ok(/不认识这个模型的名字/.test(s) && /获取模型列表/.test(s), "模型名写错：提示去获取模型列表", s);
  await page.locator('.ai-set button:has-text("获取模型列表")').click(); await page.waitForSelector(".ai-st.good");
  const opts = await page.evaluate(() => [...document.querySelectorAll("#aiModelList option")].map(o => o.value));
  ok(/查到 2 个模型/.test(await st()) && opts.join() === "mock-fast,mock-pro" && (await page.inputValue("#aiModel")) === "typo-model" && (await page.inputValue("#aiKey")) === KEY, "模型列表：只留对话模型，填过的东西不丢", opts.join());
  await page.fill("#aiModel", "mock-pro");
  await foot("测试连接").click(); await page.waitForFunction(() => /通了/.test(document.querySelector(".ai-st").innerText), null, { timeout: 15000 });
  ok(/✓ 通了：mock-pro 在 [\d.]+ 秒里回了话/.test(await st()) && /记得点"保存"/.test(await st()), "测试连接：通了", await st());
  ok((await stored())["ql.ai.v1"] === undefined, "没点保存之前，什么都没存");
  await page.screenshot({ path: SH("ai-3-test.png") });
  await foot("保存").click(); await page.waitForSelector(".ai-set", { state: "detached" });
  let ls = await stored(), cfg = JSON.parse(ls["ql.ai.v1"]);
  ok(cfg.p === "custom" && cfg.by.custom.key === KEY && cfg.by.custom.model === "mock-pro" && Object.keys(ls).filter(k => k !== "ql.ai.v1" && ls[k].indexOf(KEY) >= 0).length === 0, "保存：设置和密钥只写在 ql.ai.v1 这一项里，别处没有密钥");
  ok((await page.locator("#aiProv").innerText()) === "AI · mock-pro" && (await page.locator("#aiOff").isHidden()) && !(await page.locator("#aiSend").isDisabled()) && !(await page.locator("#aiInput").isDisabled()), "接入之后：面板顶上显示在用哪个模型，可以输入了");
  const c0 = api.calls.filter(c => c.method === "POST" && c.key === KEY)[0];
  ok(c0 && c0.cookie === "" && c0.referer === "" && /^http:\/\/127\.0\.0\.1:/.test(c0.origin), "请求不带 cookie，也不带来源页的地址", JSON.stringify(c0 && [c0.cookie, c0.referer, c0.origin]));

  // ---- 4) 写策略：先"想"，再流出回答，写完自动载入并回测
  api.calls.length = 0; api.state.think = 8; api.state.delay = 40;
  await send("按 Kelly 公式下注");
  await page.waitForFunction(() => /正在深度思考…（已经想了 \d+ 字）/.test(document.getElementById("aiLog").innerText), null, { timeout: 8000 });
  ok(!(await page.locator("#aiStop").isHidden()), "模型在想的时候：报告已经想了多少字，可以点停止");
  await page.screenshot({ path: SH("ai-4-thinking.png") });
  api.state.delay = 2; await done("试运行"); await idle();
  let card = await page.locator("#aiLog .msg-a").last().innerText();
  ok(/Kelly 固定比例/.test(card) && /可证最优/.test(card) && /已设为当前规则并保存到"我的策略"/.test(card) && (await page.evaluate(() => window.App.strat().name)) === "Kelly 固定比例", "写策略：写出的规则自动载入、试运行、存进\"我的策略\"");
  let call = api.calls[0];
  ok(api.calls.length === 1 && call.path === "/v1/chat/completions" && call.body.model === "mock-pro" && call.body.stream === true && /规则的接口/.test(call.body.messages[0].content) && /几何布朗运动/.test(call.body.messages[0].content) && /按 Kelly 公式下注/.test(call.body.messages[0].content), "发出去的是同一份提示词：接口说明、当前的世界、使用者的想法");
  ok((await page.locator('#aiLog .msg-a button:has-text("验证它的最优性声明")').count()) === 1, "可以验证它的最优性声明");
  await page.screenshot({ path: SH("ai-5-strategy.png") });

  // ---- 5) 问结果（多轮）、调图表、造世界
  api.calls.length = 0; api.state.think = 0;
  await page.click('#aiModes button:has-text("问结果")'); await send("为什么夏普比率不随杠杆变化？"); await done("夏普");
  ok((await page.locator("#aiLog .msg-a:last-child .katex").count()) >= 1 && /当前结果/.test(api.calls[0].body.messages[0].content), "问结果：回答里的公式排出来了；提问带着当前的结果");
  await send("那增长率呢？"); await done("夏普");
  call = api.calls[1]; ok(call.body.messages.length === 3 && call.body.messages[1].role === "assistant" && /那增长率呢/.test(call.body.messages[2].content), "追问：带着上一轮的问答", String(call.body.messages.length));
  await page.click('#aiModes button:has-text("调图表")'); await send("给我看最大回撤的分布"); await done("已显示");
  ok((await page.evaluate(() => window.App.shown().indexOf("dd") >= 0 && window.App.shown().indexOf("scatter") >= 0)), "调图表：把图调出来了");
  await page.click('#aiModes button:has-text("造世界")'); await send("平时平静、周五可能跳空的市场"); await done("已生成"); await idle();
  ok((await page.evaluate(() => window.App.state.world.type === "custom" && window.App.state.custom.name === "周五跳空")), "造世界：生成的路径成为当前的世界");

  // ---- 6) 出错：余额不足、限速后自动重试、停止
  await page.click('#aiModes button:has-text("问结果")');
  api.state.fail.push({ status: 402, body: { error: { message: "Insufficient Balance" } } });
  await send("余额"); await done("余额");
  card = await page.locator("#aiLog .msg-a").last().innerText();
  ok(/余额或额度不够了/.test(card) && /AI 的原话：HTTP 402 · Insufficient Balance/.test(card) && (await page.locator('#aiLog .msg-a:last-child button:has-text("打开设置")').count()) === 1, "余额不足：说清楚，附原话，给一个去设置的按钮", card.replace(/\n/g, " | "));
  api.state.fail.push({ status: 429, body: { error: { message: "Rate limit reached" } }, headers: { "retry-after": "1" } });
  const n0 = api.calls.length; await send("限速"); await done("夏普", 20000);
  ok(api.calls.length === n0 + 2, "限速：过一会儿自己重试，成功了");
  api.state.delay = 150; await send("慢慢说"); await page.waitForSelector("#aiStop:not([hidden])"); await page.waitForTimeout(350); await page.click("#aiStop"); await done("已停止");
  ok(/已停止/.test(await page.locator("#aiLog .msg-a").last().innerText()), "停止：立刻停下"); api.state.delay = 2;
  ok(real(logs).length === 0, "到这里页面没有报错", real(logs).slice(0, 3).join(" || "));

  // ---- 7) 换成 DeepSeek，经转发代理；问结果时不让它深度思考
  await openSet(); await page.click('.ai-provs [data-p="deepseek"]'); await page.fill("#aiKey", KEY);
  await foot("测试连接").click(); await page.waitForSelector(".ai-st.bad");
  s = await st(); ok(/请求没有发出去/.test(s) && /跨域/.test(s) && /转发代理/.test(s), "直连连不上（这里外网是掐断的）：提示可能是跨域限制，要填转发代理", s);
  if (!(await page.evaluate(() => document.querySelector(".ai-adv").open))) await page.locator(".ai-adv summary").click();
  await page.fill("#aiProxy", BASE + "/"); api.calls.length = 0;
  await foot("测试连接").click(); await page.waitForFunction(() => /通了/.test(document.querySelector(".ai-st").innerText), null, { timeout: 15000 });
  call = api.calls[api.calls.length - 1];
  ok(/经转发代理/.test(await st()) && call.via === "proxy" && call.upstream === "https://api.deepseek.com" && call.path === "/chat/completions" && call.body.model === "deepseek-v4-pro" && call.body.thinking.type === "disabled", "经代理到 DeepSeek：<代理>/<完整的接口地址>，测试时不思考", JSON.stringify([call.via, call.upstream, call.path]));
  await page.screenshot({ path: SH("ai-6-proxy.png") });
  await foot("保存").click(); await page.waitForSelector(".ai-set", { state: "detached" });
  ok((await page.locator("#aiProv").innerText()) === "DeepSeek · deepseek-v4-pro", "换了服务商：面板顶上跟着变");
  api.calls.length = 0; api.state.think = 3; api.state.delay = 60;
  await send("这条规则赚的钱是靠运气还是靠预测？"); await page.waitForFunction(() => /DeepSeek 正在/.test(document.getElementById("aiLog").innerText), null, { timeout: 8000 }).catch(() => {});
  const named = await page.evaluate(() => /DeepSeek 正在/.test(document.getElementById("aiLog").innerText));
  api.state.delay = 2; await done("夏普");
  ok(named && api.calls[0].body.thinking && api.calls[0].body.thinking.type === "disabled", "问结果：等的时候叫它 DeepSeek；请求里关掉了深度思考");
  await page.click('#aiModes button:has-text("调图表")'); await send("收益有没有厚尾"); await done("已显示");
  ok(api.calls[api.calls.length - 1].body.model === "deepseek-flash", "调图表：用的是便宜的那个模型");
  await page.click('#aiModes button:has-text("写策略")'); api.calls.length = 0; await send("动量"); await done("试运行"); await idle();
  ok(api.calls[0].body.model === "deepseek-v4-pro" && !("thinking" in api.calls[0].body), "写策略：用主模型，允许它深度思考");
  // 代理不放行的服务商
  await openSet(); await page.click('.ai-provs [data-p="openai"]'); await page.fill("#aiKey", KEY); await foot("测试连接").click(); await page.waitForSelector(".ai-st.bad");
  s = await st(); ok(/转发代理拒绝了这次请求/.test(s) && /does not forward to api\.openai\.com/.test(s), "代理不转发这一家：说是代理拒绝的，不说成密钥不对", s);
  await page.keyboard.press("Escape"); await page.waitForSelector(".ai-set", { state: "detached" });
  ok((await page.locator("#aiProv").innerText()) === "DeepSeek · deepseek-v4-pro" && JSON.parse((await stored())["ql.ai.v1"]).p === "deepseek", "没点保存就关掉：设置不变");

  // ---- 8) 手册和别处的称呼
  await page.click("#btnGuide"); await page.waitForSelector(".gd-title"); await page.evaluate(() => window.App.openGuide("start:claude")); await page.waitForTimeout(250);
  const g1 = await page.evaluate(() => ({ title: document.querySelector(".gd-title").textContent, art: document.querySelector(".gd-art").innerText }));
  ok(g1.title === "AI 面板怎么用" && /接入 AI…/.test(g1.art) && /密钥只保存在这台电脑的这个浏览器里/.test(g1.art) && /转发代理/.test(g1.art) && !/Claude/.test(g1.art), "手册：这一页讲的是怎么接入自己的 AI", g1.title);
  let claudeLeft = [];
  for (const k of ["start:overview", "start:tour", "games", "game:g_job", "game:o_cp", "world:custom", "world:gbm", "glossary", "trust"]) {
    const has = await page.evaluate(k => { try { window.App.openGuide(k); } catch (e) { return "ERR " + e.message; } const el = document.querySelector(".modal.guide"); return el && /Claude/.test(el.innerText) ? (el.innerText.match(/.{0,20}Claude.{0,20}/) || [""])[0] : ""; }, k);
    await page.waitForTimeout(60); if (has) claudeLeft.push(k + ": " + has);
  }
  ok(claudeLeft.length === 0, "手册别的页里泛指助手的地方都改口叫 AI", claudeLeft.join(" || "));
  await page.keyboard.press("Escape"); await page.waitForTimeout(150);
  await page.keyboard.press("Control+k"); await page.waitForSelector(".pal-in"); await page.fill(".pal-in", "密钥"); await page.waitForTimeout(150);
  ok(/AI 设置：服务商、密钥、模型/.test(await page.locator(".modal").last().innerText()), "命令面板里搜\"密钥\"能找到 AI 设置");
  await page.keyboard.press("Escape"); await page.waitForTimeout(100);
  ok((await page.evaluate(() => window.App.QL.WORLDS.custom.name)) === "自定义（AI 或你自己写的采样函数）", "世界的名字里也不点名 Claude");

  // ---- 9) 刷新：设置还在，宽屏上右栏自动展开；写坏了的规则可以让它修；清除密钥
  await t.close();
  t = await open({ viewport: { width: 1440, height: 950 }, standalone: true, init: `try { localStorage.setItem("ql.ai.v1", ${JSON.stringify(JSON.stringify({ p: "deepseek", by: { deepseek: { key: KEY } }, proxy: BASE }))}); } catch (e) {}` }); page = t.page; const logs2 = t.logs;
  await page.waitForSelector(".crit .big", { timeout: 20000 }); await idle();
  ok((await page.evaluate(() => document.getElementById("app").classList.contains("ai-open"))) && (await page.locator("#aiProv").innerText()) === "DeepSeek · deepseek-v4-pro" && !(await page.locator("#aiSend").isDisabled()), "已经接入过：打开页面右栏就是可用的");
  await page.click('#aiModes button:has-text("问结果")'); api.state.think = 0; await send("终值分布为什么是右偏的？"); await done("夏普");
  ok(/夏普/.test(await page.locator("#aiLog .msg-a").last().innerText()), "刷新之后照常能问");
  await page.click('#aiModes button:has-text("写策略")'); api.state.mock.broken = 1; await send("写一个坏的");
  await page.waitForSelector('#aiLog .msg-a button:has-text("让 AI 修复")', { timeout: 20000 });
  ok(/这段代码没有跑通/.test(await page.locator("#aiLog .msg-a").last().innerText()) && (await page.locator('button:has-text("让 Claude 修复")').count()) === 0, "写出来的代码跑不通：给一个\"让 AI 修复\"的按钮");
  await page.locator('#aiLog .msg-a button:has-text("让 AI 修复")').last().click(); await done("试运行"); await idle();
  ok(/需要修复/.test(api.calls[api.calls.length - 1].body.messages[0].content) && /已设为当前规则/.test(await page.locator("#aiLog .msg-a").last().innerText()), "点了之后把报错发回去，修好的规则载入");
  await page.click("#aiProv"); await page.waitForSelector(".ai-set"); await foot("清除密钥").click(); await page.waitForTimeout(200);
  ls = await stored();
  ok(/已经把 DeepSeek 的密钥从这个浏览器里删掉/.test(await st()) && Object.keys(ls).every(k => ls[k].indexOf(KEY) < 0) && (await page.inputValue("#aiKey")) === "", "清除密钥：浏览器里不再有这把密钥");
  await page.keyboard.press("Escape"); await page.waitForSelector(".ai-set", { state: "detached" });
  ok((await page.locator("#aiProv").innerText()) === "接入 AI…" && !(await page.locator("#aiOff").isHidden()) && (await page.locator("#aiSend").isDisabled()), "清除之后右栏回到\"还没接入\"");
  ok(real(logs2).length === 0, "这一段页面没有报错", real(logs2).slice(0, 3).join(" || "));
  await t.close();

  // ---- 10) 手机宽度、深色：设置不溢出，按钮够得着
  t = await open({ viewport: { width: 390, height: 780 }, dpr: 2, dark: true, standalone: true }); page = t.page;
  await page.waitForSelector(".crit .big", { timeout: 20000 }); await idle();
  await page.locator('#tabs [data-tab="ai"]').click(); await page.waitForSelector("#aiOff:not([hidden])");
  await page.click("#aiProv"); await page.waitForSelector(".ai-set"); await page.click('.ai-provs [data-p="kimi"]'); await page.locator(".ai-adv summary").click(); await page.waitForTimeout(150);
  const ph = await page.evaluate(() => { const box = document.querySelector(".aiset-box").getBoundingClientRect(), save = [...document.querySelectorAll(".modal-f button")].pop().getBoundingClientRect(), b = document.querySelector(".aiset .modal-b"); return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, right: box.right, bottom: box.bottom, vh: innerHeight, vw: innerWidth, saveBottom: save.bottom, inner: b.scrollWidth - b.clientWidth, scrolls: b.scrollHeight > b.clientHeight }; });
  ok(ph.sw <= ph.cw + 1 && ph.right <= ph.vw + 1 && ph.bottom <= ph.vh + 1 && ph.saveBottom <= ph.vh && ph.inner <= 1 && ph.scrolls, "手机上：设置不横向溢出；内容多了在框里滚，\"保存\"始终够得着", JSON.stringify(ph));
  await page.screenshot({ path: SH("ai-7-phone-dark.png") });
  ok(real(t.logs).length === 0, "手机宽度下没有报错", real(t.logs).slice(0, 3).join(" || "));
  await t.close(); await api.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  console.log("page logs:", real(logs).length ? "\n" + real(logs).join("\n") : "none");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("CRASH", e && e.stack || e); process.exit(1); });
function location0(base) { return base + "/v1/chat/completions"; }   // 故意把完整的地址贴进去：页面应当自己去掉后面那一截
