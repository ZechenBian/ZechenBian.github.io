// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 英文版（en/index.html）：
//   一、把页面的每一处都走一遍：每个世界、每套玩法、每条规则、每张图和它的表格、手册的每一页、每个弹层、AI 面板的四种用法，
//       凡是出现在页面上的文字（包括画在图上的、title / aria-label / placeholder 里的）都不能有汉字和中文标点；
//   二、版面：桌面和手机宽度下都不横向溢出，按钮和标签里的字不被截掉；
//   三、和中文版是同一套计算：同样的设定下结果逐位相同，现算的缓存两种语言共用；
//   四、语言切换：点一下去另一种语言，玩法、世界、规则、参数都还在；选过的语言记得住。
// 用法：node test/ui-en.js [quick]      quick：不把每条规则逐条跑一遍（手册里每条规则的那一页照样看）
const path = require("path"), fs = require("fs"), { open, pickWorld, liveIdle } = require("./ui-smoke.js"), mock = require("./mock-openai.js");
const QUICK = process.argv.indexOf("quick") >= 0, SH = n => path.join(__dirname, "../shots/" + n);
const LIVE_CACHE = path.join(__dirname, ".cache/ui-live.json");
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) pass++; else { fail++; console.log("  FAIL", name, d === undefined ? "" : String(d).slice(0, 1200)); } };

/** 装在页面里的"汉字探头"：之后凡是进入页面的文字、属性、画到图上的字，带汉字或中文标点的都记下来（连同当时走到哪一步） */
function probe() {
  const RE = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/, seen = new Map(), all = new Map();
  window.__stage = "load";
  // 顺带把出现过的全部文字留一份（去重），供事后检查英文的拼接：缺空格、单复数、a / an 之类
  function note(s, where) { if (typeof s === "string" && s.trim() && s.length < 4000 && all.size < 60000) { const k0 = s.replace(/\s+/g, " ").trim(); if (!all.has(k0)) all.set(k0, where); }
    if (typeof s !== "string" || !RE.test(s)) return; const k = s.replace(/\s+/g, " ").trim().slice(0, 160); if (!seen.has(k)) seen.set(k, window.__stage + " | " + where); }
  function whereOf(n) { const p = n.nodeType === 1 ? n : n.parentElement; if (!p) return "?"; const a = []; for (let e = p, i = 0; e && e !== document.body && i < 4; e = e.parentElement, i++) a.push(e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className ? "." + e.className.split(/\s+/)[0] : "")); return a.join(" < "); }
  const ATTRS = ["title", "aria-label", "placeholder", "alt", "label"];
  function scan(n) {
    if (n.nodeType === 3) { const p = n.parentElement; if (p && /^(SCRIPT|STYLE|NOSCRIPT)$/.test(p.tagName)) return; note(n.nodeValue, whereOf(n)); return; }
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.tagName)) return;
    ATTRS.forEach(a => { if (n.hasAttribute(a)) note(n.getAttribute(a), whereOf(n) + " @" + a); });
    n.childNodes.forEach(scan);
  }
  function start() {
    scan(document.documentElement);
    new MutationObserver(list => list.forEach(r => { if (r.type === "characterData") scan(r.target); else if (r.type === "attributes") note(r.target.getAttribute(r.attributeName), whereOf(r.target) + " @" + r.attributeName); else r.addedNodes.forEach(scan); }))
      .observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.documentElement) start(); else document.addEventListener("readystatechange", start, { once: true });
  const P = CanvasRenderingContext2D.prototype;
  ["fillText", "strokeText"].forEach(m => { const f = P[m]; P[m] = function (t) { note(String(t), "canvas"); return f.apply(this, arguments); }; });
  window.__allText = () => Array.from(all.entries());
  window.__cjk = () => { document.querySelectorAll("input:not([type=password]), textarea").forEach(e => note(e.value, whereOf(e) + " .value")); return Array.from(seen.entries()); };
}
/** 允许留在英文页上的：去中文版的那个按钮 */
const ALLOW = [/^中文$/, /^切换到中文$/];
/** 被截掉的字：按钮、标签、表头这类单行的小东西，内容比盒子宽而盒子又不让溢出。返回 [文字, 位置] */
function clipped() {
  const out = [];
  document.querySelectorAll("button, .btn, .chip, .tag, .iconbtn, th, label, summary, select, .seg button, h2, h3").forEach(e => {
    if (!e.offsetParent || e.closest("[hidden]")) return;
    const cs = getComputedStyle(e); if (cs.overflowX === "visible" && cs.textOverflow !== "ellipsis") return;
    if (e.scrollWidth > e.clientWidth + 1 && !/^(SELECT)$/.test(e.tagName)) out.push([(e.innerText || "").trim().slice(0, 60), e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className ? "." + e.className.split(/\s+/).join(".") : "")]);
  });
  // 结果栏的每一格：里面的字不能伸出去压到旁边那一格
  document.querySelectorAll(".crit > div, .gscore, .statline, .sum-head, .card h3").forEach(e => { if (e.offsetParent && e.scrollWidth > e.clientWidth + 1) out.push([(e.innerText || "").trim().replace(/\s+/g, " ").slice(0, 60), "(overflows its cell by " + (e.scrollWidth - e.clientWidth) + "px) " + (typeof e.className === "string" && e.className ? "." + e.className.split(/\s+/).join(".") : e.tagName.toLowerCase())]); });
  // 弹层里的东西不能伸到弹层外面去（长的代码行应当在自己的框里滚动）
  document.querySelectorAll(".modal-box").forEach(box => { const br = box.getBoundingClientRect(); box.querySelectorAll("pre, textarea, table, .ai-row, input").forEach(e => { if (!e.offsetParent) return; for (let a = e.parentElement; a && a !== box; a = a.parentElement) if (getComputedStyle(a).overflowX !== "visible") return;   /* 外面有会滚动的框兜着，不算 */
      const r = e.getBoundingClientRect(); if (r.right > br.right + 1 || r.left < br.left - 1) out.push(["(spills out of its dialog by " + Math.round(r.right - br.right) + "px)", e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className ? "." + e.className.split(/\s+/).join(".") : "")]); }); });
  return out;
}

(async () => {
  const api = await mock.start(), BASE = "http://127.0.0.1:" + api.port;
  // ================= 一、每一处都走一遍，找汉字 =================
  let t = await open({ viewport: { width: 1440, height: 900 }, en: true, init: probe }), page = t.page, logs = t.logs;
  const real = l => l.filter(x => !/ERR_FAILED|net::ERR|Failed to load resource|\[AI\]/.test(x));
  const mkIdle = page => async (ms) => { await page.waitForTimeout(120); await page.waitForFunction(() => !window.App.isBusy, null, { timeout: ms || 120000 }); await page.waitForTimeout(100); };
  let idle = mkIdle(page);
  const stage = s => page.evaluate(s => { window.__stage = s; }, s);
  const closeModals = async () => { for (let i = 0; i < 4 && (await page.locator(".modal").count()); i++) { await page.keyboard.press("Escape"); await page.waitForTimeout(80); } };
  /** 把当前世界（玩法）下能看的图全打开，每张图的表格也翻出来看一眼；左栏里折叠的说明都展开 */
  async function everything() {
    await page.evaluate(() => { const A = window.App; A.showCharts(Object.keys(A.CH).filter(id => A.chartOk(id)), false, true); document.querySelectorAll("#paneCtl details").forEach(d => { d.open = true; }); });
    await idle();
    const flip = () => page.evaluate(() => document.querySelectorAll("#grid .card").forEach(c => { const b = c.querySelector(".iconbtn[aria-pressed]"); if (b) b.click(); }));
    await flip(); await page.waitForTimeout(250); await flip(); await page.waitForTimeout(150);
  }
  await page.waitForSelector(".crit .big", { timeout: 20000 }); await idle();
  ok((await page.evaluate(() => document.documentElement.lang)) === "en" && (await page.title()) === "Strategy Lab", "页面的语言和标题是英文的");
  const info = await page.evaluate(() => { const W = window.App.QL.WORLDS; return { price: Object.keys(W).filter(k => !W[k].game && k !== "custom"), games: Object.keys(W).filter(k => W[k].game) }; });

  // 1) 价格世界：每个世界的左栏、结果栏、全部图表
  for (const k of info.price) { await stage("world:" + k); await pickWorld(page, k); await idle(); await everything(); }
  // 2) 每套玩法：细则、结果栏、全部图表；逐条规则跑一遍（规则自己的参数、训练之后的说明、算法信息）
  let nRules = 0;
  for (const k of info.games) {
    await stage("game:" + k); await pickWorld(page, k); await idle(); await everything();
    // 每套玩法能换的世界（场景）也各看一眼
    const sel = await page.evaluate(() => { const A = window.App, d = A.wdef(); if (!d.wsel) return null; const q = A.wschema().filter(x => x.key === d.wsel)[0]; return q ? { key: d.wsel, values: q.options.map(o => o[0]) } : null; });
    if (sel && !QUICK) for (const v of sel.values) { await page.evaluate(([k2, v2]) => { const A = window.App; A.state.wparams[A.state.world.type][k2] = v2; A.renderWorld(); A.afterWorldChange(); }, [sel.key, v]).catch(() => {}); await idle(); }
    if (QUICK) continue;
    const ids = await page.evaluate(() => Array.from(document.querySelectorAll("#stratSel option")).map(o => o.value));
    for (const id of ids) { nRules++; await stage("game:" + k + " rule:" + id); await page.selectOption("#stratSel", id); await idle(240000); }
  }
  await stage("trade rules"); await pickWorld(page, "gbm"); await idle();
  if (!QUICK) {
    const ids = await page.evaluate(() => Array.from(document.querySelectorAll("#stratSel option")).map(o => o.value));
    for (const id of ids) { nRules++; await stage("trade rule:" + id); await page.selectOption("#stratSel", id); await idle(240000); await page.evaluate(() => document.querySelectorAll("#paneCtl details").forEach(d => { d.open = true; })); }
    await page.selectOption("#stratSel", ids[0]); await idle();
    ok(nRules >= 85, "每条内置规则都跑过一遍", nRules);
  }
  ok(real(logs).length === 0, "走完世界、玩法和规则：页面没有报错", real(logs).slice(0, 3).join(" || "));
  await page.screenshot({ path: SH("en-home.png") });

  // 3) 样本外检验、场景对比这些要点一下才出字的地方
  await stage("oos"); await page.click("#btnOos"); await idle();
  await stage("scenes"); await page.evaluate(() => { const A = window.App; if (A.shown().indexOf("scenes") < 0) A.toggleChart("scenes"); }); await page.waitForTimeout(300);
  if (await page.locator("#btnScenes").count()) { await page.click("#btnScenes"); await page.waitForFunction(() => { const b = document.getElementById("btnScenes"); return b && !b.disabled && !document.getElementById("scnProg"); }, null, { timeout: 240000 }).catch(() => {}); await page.waitForTimeout(300); }

  // 4) 手册：每一页
  await stage("guide");
  const nGuide = await page.evaluate(() => window.App.guideCommands().length);
  for (let i = 0; i < nGuide; i++) {
    await page.evaluate(i => { const c = window.App.guideCommands()[i]; window.__stage = "guide:" + c.name; c.run(); }, i);
    await page.waitForTimeout(30);
    await page.evaluate(() => document.querySelectorAll(".gd-art details").forEach(d => { d.open = true; }));
    if (i % 20 === 0) await page.waitForTimeout(200);
  }
  ok(nGuide >= 140, "手册的每一页都打开过", nGuide);
  // 对照表和自检要现算：等它们算完，把出来的字也看一遍
  for (const key of ["now", "games", "glossary", "algos", "matrix", "selfcheck"]) {
    await page.evaluate(k => { window.__stage = "guide:" + k; window.App.openGuide(k); }, key); await page.waitForTimeout(300);
    if (key === "matrix" || key === "selfcheck") await liveIdle(page, 900000);
    await page.evaluate(() => document.querySelectorAll(".gd-art details").forEach(d => { d.open = true; })); await page.waitForTimeout(200);
    if (key === "matrix") await page.screenshot({ path: SH("en-matrix.png") });
  }
  const ckSum = await page.locator("#ckSum").innerText().catch(() => "(no #ckSum)");
  ok(/65/.test(ckSum) && (await page.locator(".ck.fail").count()) === 0 && (await page.locator(".ck.pass").count()) === 65, "自检在英文版里照样逐条通过", ckSum + " pass=" + (await page.locator(".ck.pass").count()) + " fail=" + (await page.locator(".ck.fail").count()));
  await page.screenshot({ path: SH("en-selfcheck.png") });
  const enLive = await page.evaluate(async () => { await new Promise(r => setTimeout(r, 1900)); return { cache: localStorage.getItem("ql.live.v2"), sig: window.App.live.sig, srcSig: window.App.live.srcSig }; });
  await page.evaluate(() => window.App.openGuide("start:what")); await page.waitForTimeout(250); await page.screenshot({ path: SH("en-guide.png") });
  await closeModals();

  // 5) 弹层：代码与接口说明、命令面板、导入数据
  await stage("code"); await page.evaluate(() => window.App.openCode()); await page.waitForTimeout(200);
  for (const b of await page.locator(".modal .seg button").all()) { await b.click(); await page.waitForTimeout(120); }
  await page.evaluate(() => document.querySelectorAll(".modal details").forEach(d => { d.open = true; })); await page.waitForTimeout(100);
  const spill = await page.evaluate(clipped); ok(spill.length === 0, "代码与接口说明的弹层：长行在自己的框里滚动，不把弹层撑破", JSON.stringify(spill.slice(0, 4)));
  await page.screenshot({ path: SH("en-code.png") }); await closeModals();
  await stage("palette"); await page.evaluate(() => window.App.openPalette()); await page.waitForTimeout(250); await page.screenshot({ path: SH("en-palette.png") }); await closeModals();
  await stage("import"); await pickWorld(page, "real"); await idle(); await page.evaluate(() => document.querySelectorAll("#paneCtl details").forEach(d => { d.open = true; })); await page.waitForTimeout(150);
  await pickWorld(page, "gbm"); await idle();

  // 5b) 亲手玩一局：四套玩法每种长度点开看一眼，各打两局（键、按钮、"一直放过"都用上），打完的对照表、累计、图上的提示、清零
  const humanPlay = g => page.evaluate(g => {
    const q = s => document.querySelector(s); let n = 0;
    while (!q("#hpNext") && n++ < 3000) {
      const acts = document.querySelectorAll(".hp-board .hp-acts .hp-act");
      if (g === "g_bandit") { const arms = Array.from(document.querySelectorAll(".hp-arm:not(:disabled)")); arms[n % arms.length].click(); }
      else if (g === "g_coin") { if (n === 1) { q("#hpStake").value = ""; acts[0].click(); } document.querySelectorAll(".hp-chips .chip")[n % 4].click(); acts[n % 5 === 4 ? 2 : n % 3 === 2 ? 1 : 0].click(); }
      else acts[n % 4 === 0 ? 0 : g === "g_sec" && n % 4 === 3 ? 2 : 1].click();
    }
    return n;
  }, g);
  const humanDone = async () => { await page.waitForFunction(() => { const c = document.querySelector(".hp-tab caption"); return c && !/…/.test(c.textContent); }, null, { timeout: 60000 }); await page.waitForTimeout(120); };
  const humanHover = async () => { const bb = await page.locator(".hp-chart canvas").boundingBox(); for (const fx of [0.2, 0.5, 0.8]) for (const y of [50, bb.height - 70]) { await page.mouse.move(bb.x + bb.width * fx, bb.y + y); await page.waitForTimeout(40); } await page.mouse.move(4, 4); };
  const humanSpill = [];
  for (const g of ["g_lock", "g_sec", "g_coin", "g_bandit"]) {
    await stage("human:" + g); await pickWorld(page, g); await idle();
    await page.click("#btnHuman"); await page.waitForSelector(".modal.hpm .hp-board");
    for (const b of await page.locator(".hp-sizes button").all()) { await b.click(); await page.waitForTimeout(70); }
    await page.click('.hp-sizes [data-size="m"]'); await page.waitForTimeout(70);
    if (g !== "g_coin") { await page.keyboard.press("0"); await page.keyboard.press("1"); await page.waitForTimeout(60); }
    await humanHover();
    for (let ep = 0; ep < 2; ep++) {
      if (await page.locator("#hpNext").count()) { await page.waitForTimeout(650); await page.click("#hpNext"); await page.waitForTimeout(80); }
      await humanPlay(g); await humanDone(); await humanHover();
    }
    const sp = await page.evaluate(clipped); if (sp.length) humanSpill.push(g + ": " + JSON.stringify(sp.slice(0, 3)));
    if (g === "g_bandit") await page.screenshot({ path: SH("en-human.png") });
    await page.click("#hpWipe"); await page.waitForTimeout(120); await page.click(".hp-top .helpbtn"); await page.waitForTimeout(200); await page.keyboard.press("Escape"); await page.waitForTimeout(80);
    await closeModals();
  }
  // 另外几种设定下才出现的字：按名次计分又看得到分数、不封顶、有锁
  for (const [g, over] of [["g_sec", { goal: "rank", info: "full" }], ["g_sec", { goal: "best", info: "full" }], ["g_coin", { cap: 0 }], ["g_bandit", { arms: 2, D: 3 }], ["g_lock", { dist: "normal", L: 1, T: 100 }]]) {
    await stage("human:" + g + JSON.stringify(over)); await pickWorld(page, g); await idle();
    await page.evaluate(over => { const A = window.App; Object.assign(A.wp(), over); A.renderWorld(); A.afterWorldChange(); }, over); await idle();
    await page.click("#btnHuman"); await page.waitForSelector(".modal.hpm .hp-board");
    for (const b of await page.locator(".hp-sizes button").all()) { await b.click(); await page.waitForTimeout(60); await humanPlay(g); await humanDone(); }
    await closeModals();
    await page.evaluate(g => { const A = window.App; A.state.wparams[g] = {}; A.renderWorld(); A.afterWorldChange(); }, g); await idle();
  }
  await stage("human:unsupported"); await pickWorld(page, "g_news"); await idle(); await page.evaluate(() => window.App.openHuman()); await page.waitForTimeout(150);
  ok(humanSpill.length === 0, "亲手玩一局的弹层：按钮和表头里的字没有被截掉，表格不撑破弹层", humanSpill.join(" || "));
  ok((await page.evaluate(() => { try { return Object.keys(JSON.parse(localStorage.getItem("ql.human.v1")).rec).length; } catch (e) { return 0; } })) >= 8, "英文页上亲手打的局照样记进存档");
  await page.evaluate(() => localStorage.removeItem("ql.human.v1"));
  await pickWorld(page, "gbm"); await idle();

  // 6) AI 面板：设置里的每一家；接到本机的假服务商上，把四种用法各走一遍（假服务商见到英文的提示词就用英文回答）
  await stage("ai"); await page.click("#btnClaude"); await page.waitForTimeout(200);
  for (const m of await page.locator("#aiModes button").all()) { await m.click(); await page.waitForTimeout(100); }
  await page.click("#aiProv"); await page.waitForSelector(".ai-set");
  for (const pid of ["deepseek", "openai", "kimi", "doubao", "custom"]) { await page.click('.ai-provs [data-p="' + pid + '"]'); await page.waitForTimeout(100); await page.evaluate(() => { const d = document.querySelector(".ai-adv"); if (d) d.open = true; }); await page.waitForTimeout(60); }
  const foot = () => page.locator(".modal-f button");
  await foot().last().click(); await page.waitForTimeout(200);                                 // 保存：什么都没填，说缺什么
  await page.fill("#aiBase", BASE + "/v1"); await page.fill("#aiKey", "test-key-wrong"); await page.fill("#aiModel", "mock-pro");
  await foot().nth(1).click(); await page.waitForFunction(() => /✕/.test(document.querySelector(".ai-st").innerText), null, { timeout: 20000 });      // 测试连接：密钥不对
  await page.fill("#aiKey", "test-key-ok"); await page.locator(".ai-set .ai-row button").last().click(); await page.waitForFunction(() => /\d/.test(document.querySelector(".ai-st").innerText), null, { timeout: 20000 });   // 获取模型列表
  await foot().nth(1).click(); await page.waitForFunction(() => /✓/.test(document.querySelector(".ai-st").innerText), null, { timeout: 20000 });
  await page.screenshot({ path: SH("en-ai-settings.png") });
  await foot().last().click(); await page.waitForTimeout(400);
  const send = async (text) => { await page.fill("#aiInput", text); await page.click("#aiSend"); };
  const done = async (ms) => { await page.waitForFunction(() => !document.getElementById("aiSend").hidden, null, { timeout: ms || 60000 }); await page.waitForTimeout(250); await idle(); };
  const modeBtn = i => page.locator("#aiModes button").nth(i);
  api.state.think = 3;
  await stage("ai:strategy"); await modeBtn(0).click(); await send("fixed fraction"); await done();
  const sName = await page.evaluate(() => window.App.strat().name);
  ok(sName === "Kelly fixed fraction", "英文页上让 AI 写规则：发的是英文提示词，写完自动载入", sName);
  const p0 = api.calls.filter(c => c.path === "/v1/chat/completions" && c.body && c.body.messages).map(c => c.body.messages[0].content).filter(x => /The rule's interface/.test(x))[0] || "";
  ok(/The rule's interface/.test(p0) && /<<<META>>>/.test(p0) && /## Model assumptions/.test(p0) && !/[\u3400-\u9fff]/.test(p0), "发给 AI 的提示词里没有汉字", (p0.match(/.{0,30}[\u3400-\u9fff].{0,30}/) || [""])[0]);
  if (await page.locator('#aiLog .msg-a button').first().count()) { await page.locator('#aiLog .msg-a:last-child .a-actions button').first().click().catch(() => {}); await page.waitForTimeout(400); await page.waitForFunction(() => !document.querySelector("#aiLog .msg-a:last-child .spin"), null, { timeout: 240000 }).catch(() => {}); }
  await stage("ai:ask"); await modeBtn(3).click(); await send("Why does the Sharpe ratio not change with leverage?"); await done();
  await stage("ai:chart"); await modeBtn(2).click(); await send("Show me the drawdown distribution"); await done();
  await stage("ai:world"); await modeBtn(1).click(); await send("Friday gaps"); await done();
  ok((await page.evaluate(() => window.App.state.world.type === "custom" && window.App.state.custom.name)) === "Friday gaps", "英文页上让 AI 造世界", await page.evaluate(() => window.App.state.custom && window.App.state.custom.name));
  await stage("ai:errors"); api.state.fail.push({ status: 402, body: { error: { message: "Insufficient Balance", type: "insufficient_balance" } } }); await modeBtn(3).click(); await send("And the growth rate?"); await done();
  api.state.mock.broken = 1; await modeBtn(0).click(); await send("broken"); await done();
  await page.screenshot({ path: SH("en-ai.png") });
  await page.evaluate(() => { const c = window.QLAI.cfg(); c.p = ""; c.by = {}; window.QLAI.save(c); });
  await pickWorld(page, "gbm"); await idle();
  ok(real(logs).length === 0, "走完手册、弹层和 AI 面板：页面没有报错", real(logs).slice(0, 3).join(" || "));

  // —— 汇总：页面上出现过的汉字 ——
  const rawFound = await page.evaluate(() => window.__cjk()), found = rawFound.filter(([s]) => !ALLOW.some(r => r.test(s)));
  ok(rawFound.some(([s]) => s === "中文"), "探头是在工作的（它看到了去中文版的那个按钮）");
  try { fs.mkdirSync(path.join(__dirname, ".cache"), { recursive: true }); fs.writeFileSync(path.join(__dirname, ".cache/en-text.json"), JSON.stringify(await page.evaluate(() => window.__allText()))); } catch (e) {}
  ok(found.length === 0, "英文页上没有出现过汉字或中文标点", found.length + " 处");
  if (found.length) { fs.mkdirSync(path.join(__dirname, ".cache"), { recursive: true }); fs.writeFileSync(path.join(__dirname, ".cache/en-leftover.json"), JSON.stringify(found, null, 1)); found.slice(0, 60).forEach(([s, w]) => console.log("    · " + s.slice(0, 110) + "    ← " + w)); if (found.length > 60) console.log("    … 其余见 test/.cache/en-leftover.json"); }

  // ================= 二、版面 =================
  const clipDesk = await page.evaluate(clipped);
  ok(clipDesk.length === 0, "桌面宽度：按钮和标签里的字没有被截掉", JSON.stringify(clipDesk.slice(0, 8)));
  ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, "桌面宽度：不横向溢出");
  await t.close();
  for (const [name, vp] of [["phone", { width: 390, height: 800 }], ["tablet", { width: 900, height: 1000 }]]) {
    t = await open({ viewport: vp, en: true }); page = t.page; idle = mkIdle(page);
    await page.waitForSelector(".crit .big", { timeout: 20000 }); await idle();
    const ov = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const probs = [];
    const check = async (what) => { const o = await ov(), c = await page.evaluate(clipped); if (o > 1) probs.push(what + ": overflow " + o); if (c.length) probs.push(what + ": clipped " + JSON.stringify(c.slice(0, 4))); };
    await check("home"); await page.screenshot({ path: SH("en-" + name + "-home.png") });
    if (name === "phone") { for (const tab of ["ctl", "ai", "res"]) { await page.click('#tabs [data-tab="' + tab + '"]'); await page.waitForTimeout(200); await check("tab " + tab); if (tab === "ctl") await page.screenshot({ path: SH("en-phone-ctl.png") }); } }
    for (const k of ["g_sec", "o_det", "g_ashare"]) { await page.evaluate(k => { const A = window.App; A.state.world.type = k; A.fixStrat(); A.syncCharts(); A.renderWorld(); A.renderStrat(); A.renderSettings(); A.afterWorldChange(); }, k); await idle(); await check("game " + k); }
    await page.screenshot({ path: SH("en-" + name + "-game.png"), fullPage: name === "phone" });
    for (const key of ["start:what", "games", "matrix", "strat:kelly", "game:g_prop", "selfcheck", "glossary"]) { await page.evaluate(k => window.App.openGuide(k), key); await page.waitForTimeout(350); await check("guide " + key); if (key === "games") await page.screenshot({ path: SH("en-" + name + "-guide.png") }); }
    for (let i = 0; i < 3; i++) { await page.keyboard.press("Escape"); await page.waitForTimeout(80); }
    await page.evaluate(() => window.App.openCode()); await page.waitForTimeout(250); await check("code"); await page.keyboard.press("Escape");
    await page.evaluate(() => window.App.openPalette()); await page.waitForTimeout(250); await check("palette"); await page.keyboard.press("Escape");
    for (const g of ["g_coin", "g_bandit", "g_sec", "g_lock"]) {   // 亲手玩一局：开局、打完之后各看一眼
      await page.evaluate(g => { const A = window.App; A.setWorldType(g); A.openHuman(); }, g); await page.waitForSelector(".modal.hpm .hp-board"); await page.waitForTimeout(250); await check("human " + g);
      await page.evaluate(g => { const q = s => document.querySelector(s); let n = 0; while (!q("#hpNext") && n++ < 3000) { if (g === "g_bandit") { const a = document.querySelectorAll(".hp-arm:not(:disabled)"); a[n % a.length].click(); } else document.querySelectorAll(".hp-board .hp-acts .hp-act")[g === "g_coin" ? 0 : n % 5 === 0 ? 0 : 1].click(); } }, g);
      await page.waitForFunction(() => { const c = document.querySelector(".hp-tab caption"); return c && !/…/.test(c.textContent); }, null, { timeout: 60000 }); await page.waitForTimeout(200); await check("human " + g + " finished");
      if (g === "g_coin") await page.screenshot({ path: SH("en-" + name + "-human.png") });
      await page.keyboard.press("Escape"); await page.waitForTimeout(100);
    }
    await page.evaluate(() => { localStorage.removeItem("ql.human.v1"); window.App.setWorldType("gbm"); }); await idle();
    await page.evaluate(() => window.App.openAiSettings()); await page.waitForTimeout(250); await check("ai settings"); await page.screenshot({ path: SH("en-" + name + "-ai-settings.png") }); await page.keyboard.press("Escape");
    ok(probs.length === 0, name + " 宽度：不横向溢出，字没有被截掉", probs.join(" || "));
    ok(real(t.logs).length === 0, name + " 宽度：页面没有报错", real(t.logs).slice(0, 3).join(" || "));
    await t.close();
  }

  // ================= 三、和中文版是同一套计算 =================
  ok(enLive.sig && enLive.srcSig && enLive.sig !== enLive.srcSig, "英文版的现算缓存用的是中文版的签名（它自己的源码因为文字不同，签名本来不一样）", JSON.stringify([enLive.sig, enLive.srcSig]));
  const pick = async (page, idle, k, strat) => { await pickWorld(page, k); await idle(); if (strat) { await page.selectOption("#stratSel", strat); await idle(); } return page.evaluate(() => { const r = window.App.run, s = r.sum; return JSON.stringify(r.game ? [r.game.score, r.game.se, r.game.refs.map(x => x.score)] : [s.growth, s.growthSE, s.sharpe, s.meanW, s.pDD, s.medW, s.turnover]); }); };
  const CASES = [["gbm", null], ["ou", "oukelly"], ["garch", "voltarget"], ["g_lock", "lock_dp"], ["g_bandit", "ban_ts"], ["g_exec", "exec_ac"], ["o_meas", null], ["o_stop", null]];
  const res = {};
  for (const lang of ["zh", "en"]) {
    t = await open({ viewport: { width: 1280, height: 900 }, standalone: true, en: lang === "en", seedLive: lang === "zh" }); page = t.page; idle = mkIdle(page);
    await page.waitForSelector(".crit .big", { timeout: 20000 }); await idle();
    res[lang] = [];
    for (const [k, st] of CASES) { const has = st ? await page.evaluate(([k, st]) => window.QL_STRATS.some(s => s.id === st), [k, st]) : true; res[lang].push(await pick(page, idle, k, has ? st : null)); }
    // 亲手玩一局：每套玩法第 0 局的数据、各条参照规则在上面的得分、长期平均、先和谁比
    res[lang].push(await page.evaluate(() => { const QL = window.App.QL; return JSON.stringify(QL.humanGames().map(g => { const hp = QL.humanSizes(g, QL.worldDefaults(g))[1].hp, kit = QL.humanKit(g, hp, 7), B = QL.humanEpisode(g, hp, 7, 0), LB = QL.humanLongBatch(kit, 400), by = {}; kit.refs.forEach(r => { by[r.id] = QL.humanLongRef(kit, LB, r.id); }); return [g, Array.from(B.R).slice(0, 8), QL.humanRefsOn(kit, B, false).map(r => r.score), kit.refs.map(r => by[r.id].m), QL.humanStar(kit, by)]; })); }));
    if (lang === "zh") {
      // 中文页：对照表接着用 ui-obs.js 留下的存档，再把手册每一页走一遍，让正文里现算的数都算出来，回头和英文页的逐项比
      res.zhSig = await page.evaluate(() => { window.App.openGuide("matrix"); return window.App.live.sig; });
      const n = await page.evaluate(() => window.App.guideCommands().length);
      for (let i = 0; i < n; i++) { await page.evaluate(i => window.App.guideCommands()[i].run(), i); await page.waitForTimeout(25); }
      await page.evaluate(() => window.App.openGuide("selfcheck")); await page.waitForTimeout(300); await liveIdle(page, 900000);
      res.zhCache = await page.evaluate(async () => { await new Promise(r => setTimeout(r, 1900)); return localStorage.getItem("ql.live.v2"); });
    }
    await t.close();
  }
  ok(JSON.stringify(res.zh) === JSON.stringify(res.en) && res.zh.every(x => /\d/.test(x)), "同样的世界、玩法和规则，两种语言算出来的数逐位相同（连同亲手玩一局用的对局和参照规则的成绩）", res.zh.map((x, i) => x === res.en[i] ? "" : (CASES[i] ? CASES[i][0] : "human") + ": " + x.slice(0, 200) + " vs " + res.en[i].slice(0, 200)).filter(Boolean).join(" || "));
  ok(res.zhSig === enLive.sig, "两种语言的现算缓存用同一个签名", res.zhSig + " vs " + enLive.sig);
  // 英文版从头现算出来的整张对照表，和中文版（ui-obs.js 留下的存档）逐格相同
  let zhCache = null; try { zhCache = JSON.parse(res.zhCache || fs.readFileSync(LIVE_CACHE, "utf8")); } catch (e) {}
  const enCache = enLive.cache ? JSON.parse(enLive.cache) : null;
  if (zhCache && enCache && zhCache.sig === enCache.sig) {
    const cells = o => JSON.stringify([o.price, o.pbench, o.games]);
    const nCells = Object.keys(enCache.price).reduce((a, k) => a + enCache.price[k].filter(x => x !== "?").length, 0) + Object.keys(enCache.games).reduce((a, g) => a + Object.keys(enCache.games[g].cells).reduce((b, k) => b + enCache.games[g].cells[k].filter(x => x !== "?").length, 0), 0);
    ok(cells(zhCache) === cells(enCache) && nCells >= 700, "对照表的 701 格：英文版现算的和中文版现算的逐格相同", "cells " + nCells);
    const simKeys = Object.keys(enCache.sims || {}).filter(k => zhCache.sims && k in zhCache.sims);
    const simBad = simKeys.filter(k => JSON.stringify(enCache.sims[k]) !== JSON.stringify(zhCache.sims[k]));
    ok(simKeys.length >= 1 && simKeys.length === Object.keys(enCache.sims || {}).length && simBad.length === 0, "手册正文里单独现算的那几组模拟：两种语言相同", simKeys.length + " / " + Object.keys(enCache.sims || {}).length + " 组可比，不同的：" + simBad.slice(0, 5).join(" "));
  } else ok(false, "没有可比的中文版现算存档（先跑一遍 node test/ui-obs.js，再跑这个测试）", zhCache ? zhCache.sig + " vs " + (enCache && enCache.sig) : "no cache");

  // ================= 四、语言切换 =================
  t = await open({ viewport: { width: 1280, height: 900 }, standalone: true }); page = t.page; idle = mkIdle(page);
  await page.waitForSelector(".crit .big", { timeout: 20000 }); await idle();
  ok((await page.locator("#btnLang").innerText()).trim() === "English" && (await page.getAttribute("#btnLang", "lang")) === "en", "中文页右上角有去英文版的按钮");
  await pickWorld(page, "g_bandit"); await idle(); await page.selectOption("#stratSel", "ban_ucb"); await idle();
  await page.evaluate(() => { const A = window.App; A.state.world.N = 300; A.state.sparams.ban_ucb = Object.assign({}, A.sp("ban_ucb"), { c: 1.25 }); A.renderWorld(); A.renderStrat(); A.afterWorldChange(); }); await idle();
  const before = await page.evaluate(() => { const A = window.App; return JSON.stringify([A.state.world.type, A.state.world.N, A.state.stratId, A.sp(), A.wp(), A.run.game.score]); });
  await Promise.all([page.waitForNavigation(), page.click("#btnLang")]);
  await page.waitForSelector(".gscore .big, .crit .big", { timeout: 20000 }); await idle();
  const after = await page.evaluate(() => { const A = window.App; return JSON.stringify([A.state.world.type, A.state.world.N, A.state.stratId, A.sp(), A.wp(), A.run.game.score]); });
  ok(/\/en\/$/.test(page.url()) && (await page.evaluate(() => document.documentElement.lang)) === "en", "点一下：到了英文页", page.url());
  ok(before === after && /g_bandit/.test(after) && /1\.25/.test(after), "切到英文：玩法、规模、规则、参数都还在，得分相同", before + " → " + after);
  ok((await page.evaluate(() => localStorage.getItem("ql.lang"))) === "en" && (await page.locator("#btnLang").innerText()).trim() === "中文", "记住了选的是英文；英文页上的按钮是\"中文\"");
  ok(!/[\u3400-\u9fff]/.test((await page.locator("#paneCtl").innerText()) + (await page.locator("#summary").innerText())), "英文页上这套玩法的细则和结果是英文的");
  await page.goto("http://127.0.0.1:" + t.port + "/"); await page.waitForSelector(".gscore .big, .crit .big", { timeout: 20000 });
  ok(/\/en\/$/.test(page.url()), "上次选的是英文：再打开中文页的地址，直接去英文页", page.url());
  await idle(); await pickWorld(page, "ou"); await idle();
  await Promise.all([page.waitForNavigation(), page.click("#btnLang")]);
  await page.waitForSelector(".crit .big", { timeout: 20000 }); await idle();
  ok(/127\.0\.0\.1:\d+\/$/.test(page.url()) && (await page.evaluate(() => document.documentElement.lang)) === "zh-CN" && (await page.evaluate(() => window.App.state.world.type)) === "ou" && (await page.evaluate(() => localStorage.getItem("ql.lang"))) === "zh", "点\"中文\"：回到中文页，世界还在，并且记住了", page.url());
  await page.reload(); await page.waitForSelector(".crit .big", { timeout: 20000 });
  ok(!/\/en\//.test(page.url()), "选回中文之后刷新：留在中文页");
  ok(real(t.logs).length === 0, "切换语言的过程中页面没有报错", real(t.logs).slice(0, 3).join(" || "));
  await t.close();
  // 从硬盘上打开：按钮的地址里写着文件名，能走到另一张页面
  t = await open({ viewport: { width: 1100, height: 800 }, file: true }); page = t.page;
  await page.waitForSelector(".crit .big", { timeout: 20000 });
  await Promise.all([page.waitForNavigation(), page.click("#btnLang")]);
  await page.waitForSelector(".crit .big", { timeout: 20000 });
  ok(/\/en\/index\.html$/.test(page.url()) && (await page.title()) === "Strategy Lab", "从硬盘上打开时也能切到英文页", page.url());
  await Promise.all([page.waitForNavigation(), page.click("#btnLang")]);
  await page.waitForSelector(".crit .big", { timeout: 20000 });
  ok(/quantlab\/index\.html$|strategy-lab\/index\.html$/.test(page.url()) && (await page.title()) === "策略实验室", "再切回中文页", page.url());
  await t.close(); await api.close();
  // 在 Claude 里发布的那一份没有语言按钮
  const dist = fs.readFileSync(path.join(__dirname, "../dist/strategy-lab.html"), "utf8");
  ok(!/btnLang"/.test(dist.replace(/<script>[\s\S]*$/, "")) && !/<!--LANG-->/.test(dist), "在 Claude 里发布的那一份没有语言按钮");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH", e); process.exit(1); });
