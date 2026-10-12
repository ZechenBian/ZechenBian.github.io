// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 新手教程：大厅里的入口、八步逐步走、每一步的按钮带到对的地方、左下角"回到教程"的小条、记得看到哪儿、地址入口、手机宽度
const path = require("path"), { open } = require("./ui-smoke.js");
const SH = n => path.join(__dirname, "../shots/" + n);
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) { pass++; if (process.env.VERBOSE) console.log("  ok  ", name, d === undefined ? "" : "  " + String(d).slice(0, 300)); } else { fail++; console.log("  FAIL", name, d === undefined ? "" : "  " + String(d).slice(0, 700)); } };
(async () => {
  const t = await open({ standalone: true, viewport: { width: 1280, height: 900 } }), page = t.page, logs = t.logs, base = `http://127.0.0.1:${t.port}/index.html`;
  await page.route("https://api.github.com/**", r => r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: "[]" }));
  const ready = async () => { await page.waitForFunction(() => window.App && window.App.openTour && !window.App.isBusy, null, { timeout: 60000 }); await page.waitForTimeout(120); };
  await ready();
  const closeAll = async () => { for (let i = 0; i < 8 && (await page.locator(".modal").count()); i++) { await page.keyboard.press("Escape"); await page.waitForTimeout(80); } };
  const state = () => page.evaluate(() => ({ pos: (document.querySelector("#tourPos") || {}).innerText || "", title: (document.querySelector("#tourTitle") || {}).innerText || "", act: (document.querySelector("#tourAct") || {}).innerText || "", next: (document.querySelector("#tourNext") || {}).innerText || "", nextPrimary: !!document.querySelector("#tourNext.primary"), prevOff: !!document.querySelector("#tourPrev[disabled]"), sel: (document.querySelector('.tour-pill[aria-selected="true"]') || { getAttribute: () => "" }).getAttribute("data-step"), body: (document.querySelector("#tourPane") || {}).innerText || "" }));

  console.log("== 一、入口");
  await page.click("#btnLobby"); await page.waitForSelector(".modal.lbm .lb-card");
  const cards = await page.evaluate(() => Array.from(document.querySelectorAll(".lb-card")).map(c => ({ id: c.getAttribute("data-card"), wide: c.classList.contains("wide"), btn: c.querySelector("[data-go]").innerText, primary: c.querySelector("[data-go]").classList.contains("primary"), status: (c.querySelector(".lb-status") || {}).innerText || "", text: c.innerText })));
  ok(cards.map(c => c.id).join() === "tutorial,daily,room,deca,arena,workshop" && cards[0].wide && cards[0].primary && cards[0].btn === "开始" && cards[0].status === "" && cards[0].text.includes("新手教程") && cards[0].text.includes("八步"), "大厅里第一张、占整行的是新手教程；还没看过时按钮是\"开始\"", JSON.stringify(cards.map(c => c.id + ":" + c.btn)));
  await page.click('.lb-card[data-card="tutorial"] [data-go]'); await page.waitForSelector(".modal.tourm #tourTitle");
  let s = await state();
  const pills = await page.evaluate(() => Array.from(document.querySelectorAll(".tour-pill")).map(p => p.getAttribute("data-step") + ":" + p.innerText.replace(/\s+/g, " ")));
  ok((await page.locator(".modal.lbm").count()) === 0 && pills.length === 8 && pills[0] === "what:1 这是什么" && pills[7] === "share:8 贴给别人" && s.pos === "第 1 步，共 8 步" && s.sel === "what" && s.title === "一个拿来试想法的地方", "点进去：大厅收起；上面一排八个小标签，先看第 1 步", pills.join(" | "));
  ok(s.prevOff && s.act === "" && s.nextPrimary && s.next === "下一步" && s.body.includes("回到教程"), "第 1 步只有说明，没有要去的地方；\"上一步\"按不了，\"下一步\"是主按钮");
  await page.screenshot({ path: SH("tutorial-1.png") });

  console.log("== 二、一步一步往下看");
  const labels = [], titles = [];
  for (let i = 2; i <= 8; i++) {
    await page.click("#tourNext"); await page.waitForFunction(i => document.querySelector("#tourPos").innerText.startsWith("第 " + i + " 步"), i);
    s = await state(); labels.push(s.act); titles.push(s.title);
    if (i === 2) { const names = await page.evaluate(() => window.App.QL.dailyGames().map(t => window.App.QL.WORLDS[t].short)); ok(names.length === 4 && names.every(n => s.body.includes(n)) && !s.nextPrimary && !s.prevOff, "第 2 步列出每日一局轮着来的四套玩法；有要去的地方时，主按钮是那一个", names.join("、")); }
    if (i === 4) { const li = await page.evaluate(() => Array.from(document.querySelectorAll("#tourPane ol li")).map(x => x.innerText)), ai = await page.evaluate(() => window.App.AI); ok(li.length === 3 && li[0].includes("代码与说明") && li[1].includes(ai) && li[2].includes("复制给 AI 的说明"), "第 4 步列出写规则的三条路", li.map(x => x.slice(0, 12)).join(" | ")); await page.screenshot({ path: SH("tutorial-4.png") }); }
  }
  ok(labels.join("|") === "打今天这一局|开一个房间|看看眼下这条规则的代码|走一遍十项|摆一场|进工坊|回到大厅" && titles.every(x => x.length >= 4) && new Set(titles).size === 7, "后面七步各有一个带你过去的按钮", labels.join("|"));
  s = await state();
  ok(s.pos === "第 8 步，共 8 步" && s.next === "看完了" && s.body.includes("点 Create") && s.body.includes("隔离环境") && s.body.includes("每小时 60 次"), "最后一步讲怎么贴给别人：要账号、是公开的、别人的代码在隔离环境里跑、看榜有次数限制");
  await page.click("#tourPrev"); s = await state();
  ok(s.pos.startsWith("第 7 步") && s.sel === "shop", "\"上一步\"往回走");
  await page.click('.tour-pill[data-step="daily"]'); s = await state();
  ok(s.pos.startsWith("第 2 步") && s.title === "先亲手打一局", "点上面的小标签直接跳到那一步");
  await page.click('.tour-pill[data-step="share"]'); await page.click("#tourNext"); await page.waitForFunction(() => !document.querySelector(".modal"));
  ok((await page.evaluate(() => window.App.tourStore().step)) === 7 && (await page.locator("#tourChip").count()) === 0, "最后一步点\"看完了\"：教程关掉，不留小条");

  console.log("== 三、每一步的按钮带到对的地方；左下角留着回来的小条");
  const WHERE = [["daily", ".modal.hpm .hp-board", 2], ["room", "#rmNick", 3], ["rule", "#codeEdit", 4], ["deca", "#dcRun", 5], ["arena", "#arList", 6], ["shop", "#shWorlds", 7]];
  for (const [id, sel, n] of WHERE) {
    await page.evaluate(id => window.App.openTour(id), id); await page.waitForSelector("#tourAct");
    await page.click("#tourAct"); await page.waitForSelector(sel, { timeout: 20000 });
    const a = await page.evaluate(() => ({ tour: !!document.querySelector(".modal.tourm"), chip: (document.querySelector("#tourBack") || {}).innerText || "", went: Object.keys(window.App.tourStore().went).sort().join(), modals: document.querySelectorAll(".modal").length }));
    ok(!a.tour && a.chip === "回到教程（第 " + n + " 步）" && a.went.split(",").includes(id) && a.modals === 1, "第 " + n + " 步的按钮：教程收起，要去的地方打开了，左下角有\"回到教程\"", JSON.stringify(a));
    if (id === "rule") ok((await page.evaluate(() => { const b = document.querySelector('.modal .seg [aria-pressed="true"]'); return b && b.innerText; })) === "代码", "写规则那一步打开的是眼下这条规则的\"代码\"那一页");
    if (id === "shop") await page.screenshot({ path: SH("tutorial-chip.png") });
    await page.click("#tourBack"); await page.waitForSelector(".modal.tourm #tourTitle");
    s = await state();
    const b = await page.evaluate(id => ({ chip: !!document.querySelector("#tourChip"), went: document.querySelector('.tour-pill[data-step="' + id + '"]').classList.contains("went"), note: (document.querySelector(".tour-act .note") || {}).innerText || "", modals: document.querySelectorAll(".modal").length }), id);
    ok(s.pos.startsWith("第 " + n + " 步") && !b.chip && b.went && b.note === "这一步去过了" && s.nextPrimary && b.modals === 2, "点小条：回到刚才那一步，标着去过了，主按钮换成\"下一步\"", JSON.stringify(b));
    await closeAll();
  }
  await page.evaluate(() => window.App.openTour("share")); await page.waitForSelector("#tourAct"); await page.click("#tourAct"); await page.waitForSelector(".modal.lbm .lb-card");
  ok((await page.locator("#tourChip").count()) === 0 && (await page.locator(".modal.tourm").count()) === 0, "最后一步的按钮回到大厅，不留小条");
  await closeAll();
  await page.evaluate(() => window.App.openTour("deca")); await page.waitForSelector("#tourAct"); await page.click("#tourAct"); await page.waitForSelector("#dcRun");
  await page.click("#tourChipX");
  ok((await page.locator("#tourChip").count()) === 0 && (await page.locator("#dcRun").count()) === 1, "小条上的叉：不要它了，眼前的东西不受影响");
  await closeAll();
  await page.evaluate(() => window.App.openTour("arena")); await page.waitForSelector("#tourAct"); await page.click("#tourAct"); await page.waitForSelector("#arList"); await closeAll();
  ok((await page.locator("#tourChip").count()) === 1, "关掉去的那个地方，小条还在");
  await page.click("#btnLobby"); await page.waitForSelector('.lb-card[data-card="tutorial"]');
  const card2 = await page.evaluate(() => { const c = document.querySelector('.lb-card[data-card="tutorial"]'); return { btn: c.querySelector("[data-go]").innerText, status: (c.querySelector(".lb-status") || {}).innerText || "" }; });
  ok(card2.btn === "接着看" && card2.status === "上次看到第 6 步，共 8 步", "大厅的卡片记得看到第几步，按钮换成\"接着看\"", JSON.stringify(card2));
  await page.click('.lb-card[data-card="tutorial"] [data-go]'); await page.waitForSelector(".modal.tourm #tourTitle"); s = await state();
  ok(s.pos.startsWith("第 6 步") && (await page.locator("#tourChip").count()) === 0, "从大厅再进教程：接着上次那一步，小条收掉");
  await closeAll();

  console.log("== 四、记得看到哪儿；地址入口");
  await page.reload(); await ready();
  const st = await page.evaluate(() => ({ step: window.App.tourStore().step, went: Object.keys(window.App.tourStore().went).sort().join(), started: window.App.tourStore().started }));
  ok(st.step === 5 && st.went === "arena,daily,deca,room,rule,share,shop" && st.started === true, "刷新页面：看到第几步、哪几步去过，都还记得", JSON.stringify(st));
  await page.goto(base + "#tutorial=shop"); await ready(); await page.waitForSelector(".modal.tourm #tourTitle"); s = await state();
  ok(s.pos.startsWith("第 7 步") && s.title === "连世界和裁判一起造" && !/#/.test(page.url()), "地址里写 #tutorial=shop：直接打开教程的那一步，用过之后地址里的入口去掉", page.url());
  await closeAll();
  await page.goto(base + "#tutorial"); await ready(); await page.waitForSelector(".modal.tourm #tourTitle"); s = await state();
  ok(s.pos.startsWith("第 7 步"), "只写 #tutorial：接着上次看到的地方");
  await closeAll();
  const cmd = await page.evaluate(() => window.App.lobbyCommands().filter(c => /新手教程/.test(c.name)).map(c => c.key)[0] || "");
  ok(/教程/.test(cmd) && /tutorial/.test(cmd), "命令面板里搜\"教程\"或者 tutorial 也找得到", cmd);
  await page.evaluate(() => { localStorage.setItem("ql.tour.v1", JSON.stringify({ v: 1, step: 99, went: { "bad key!": 1, daily: 1, x: 1 }, started: "yes" })); });
  await page.reload(); await ready();
  const bad = await page.evaluate(() => ({ step: window.App.tourStore().step, went: Object.keys(window.App.tourStore().went).join() }));
  ok(bad.step === 0 && bad.went === "daily", "存档被写坏了：步数回到开头，只留认得的记号", JSON.stringify(bad));
  await page.evaluate(() => localStorage.removeItem("ql.tour.v1")); await page.reload(); await ready();

  console.log("== 五、手机宽度");
  await page.setViewportSize({ width: 390, height: 780 });
  await page.evaluate(() => window.App.openTour("rule")); await page.waitForSelector("#tourAct");
  const o1 = await page.evaluate(() => { const d = document.documentElement, b = document.querySelector(".modal.tourm .modal-box").getBoundingClientRect(), mb = document.querySelector(".modal.tourm .modal-b"), rows = new Set(Array.from(document.querySelectorAll(".tour-pill")).map(p => Math.round(p.getBoundingClientRect().top))).size; return { doc: d.scrollWidth - d.clientWidth, box: Math.round(b.right) > window.innerWidth || b.left < 0, inner: mb.scrollWidth - mb.clientWidth, rows }; });
  ok(o1.doc <= 1 && !o1.box && o1.inner <= 1 && o1.rows >= 2, "手机宽度：教程不溢出，上面的小标签自己折行", JSON.stringify(o1));
  await page.screenshot({ path: SH("tutorial-phone.png") });
  await page.click("#tourAct"); await page.waitForSelector("#codeEdit");
  const o2 = await page.evaluate(() => { const c = document.querySelector("#tourChip").getBoundingClientRect(); return { in: c.left >= 0 && c.right <= window.innerWidth && c.bottom <= window.innerHeight, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  ok(o2.in && o2.doc <= 1, "手机宽度：回来的小条在屏幕里面", JSON.stringify(o2));

  const real = logs.filter(l => !/Failed to load resource|Refused to|Content Security Policy|violates the following|net::ERR/.test(l));
  console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", real.length ? "\n" + real.join("\n") : "none");
  await t.close(); process.exitCode = fail || real.length ? 1 : 0;
})().catch(e => { console.error("TEST CRASHED:", e.message.split("\n").slice(0, 8).join("\n")); process.exit(1); });
