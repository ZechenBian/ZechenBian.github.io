// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 青少年版的界面（teen/index.html）：开始页、亲手打一局（人按最简单的办法打，得分必须和对应的那条基准规则一模一样：同一局、同样的牌）、
// 打完的对照、再来一局、存档；七课的例子和"改一改"、全角标点和语法错误的提示、死循环被掐掉；七个想法的演示和实验；
// 写规则（填空、跑 200 局、在刚打过的那一局上试、换模板、参数写错、死循环）；老师页；手机宽度；大厅里指向青少年版的链接。
// 这张页面不联网：打开之后不许有任何对外的请求。
const path = require("path"), { open } = require("./ui-smoke.js"), { clipped } = require("./en-probe.js");
const ROOT = path.join(__dirname, ".."), SH = n => path.join(ROOT, "shots/" + n);
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) { pass++; if (process.env.VERBOSE) console.log("  ok  ", name); } else { fail++; console.log("  FAIL", name, d === undefined ? "" : "  " + String(d).slice(0, 900)); } };
const real = l => l.filter(x => !/Failed to load resource|Refused to|Content Security Policy|violates the following|net::ERR|ERR_FAILED/.test(x));

(async () => {
  const t = await open({ standalone: true, viewport: { width: 1280, height: 1000 } }), page = t.page;
  const logs = [], reqs = [];
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") logs.push("[" + m.type() + "] " + m.text()); }); page.on("pageerror", e => logs.push("[pageerror] " + e.message));
  const BASE = `http://127.0.0.1:${t.port}/teen/`;
  const goto = async hash => { const same = page.url() === BASE + (hash || ""); await page.goto(BASE + (hash || "")); if (same) await page.reload(); await page.waitForFunction(() => window.QL_TEEN && document.querySelector("#view").children.length > 0, null, { timeout: 30000 }); await page.waitForTimeout(80); };
  const nav = async hash => { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(120); };
  const txt = sel => page.locator(sel).first().innerText();
  const stub = () => page.evaluate(() => { window.__copied = []; navigator.clipboard.writeText = s => { window.__copied.push(s); return Promise.resolve(); }; window.QL_TEEN.opt.timeout = 2500; window.QL_TEEN.opt.snippetMs = 1000; });
  const rows = sel => page.evaluate(sel => Array.from(document.querySelectorAll(sel + " tbody tr")).map(tr => Array.from(tr.children).map(td => td.innerText.trim().replace(/\s+/g, " "))), sel);
  const refScore = (gid, name) => page.evaluate(([gid, name]) => { const cur = window.QL_TEEN.current(), r = window.QL_TEEN.refsOn(cur.g, cur.seed).filter(x => x.ref.name === name)[0]; return { you: cur.total, ref: r.score, seed: cur.seed, kind: cur.kind }; }, [gid, name]);

  console.log("== 一、打开");
  await goto("#home"); page.on("request", r => { const u = new URL(r.url()); if (u.hostname !== "127.0.0.1") reqs.push(u.hostname); }); await stub();
  const head = await page.evaluate(() => ({ title: document.title, lang: document.documentElement.lang, nav: Array.from(document.querySelectorAll("#nav a")).map(a => a.innerText).join(), on: document.querySelector("#nav a.on").innerText, today: document.querySelector("#today h3").innerText, btn: document.querySelector("#goToday").getAttribute("href"), featured: window.QL_TEEN.games[window.QL_TEEN.QL.questHash("teen|day|" + window.QL_TEEN.today()) % 7].name }));
  ok(head.title === "策略实验室 · 青少年版" && head.lang === "zh-CN" && head.nav === "开始,亲手试一局,编程的想法,算法的想法,写规则,老师和家长" && head.on === "开始" && head.today === head.featured && /^#play\/[a-z]+$/.test(head.btn), "开始页：标题、六个入口、今天的一局是按日期挑的那个游戏", JSON.stringify(head));
  ok((await page.evaluate(() => document.querySelector("#view").innerText)).includes("不收集任何东西") && (await page.locator('a[href="#teach"]').count()) >= 1, "开始页写明不收集任何东西，有给老师和家长的入口");

  console.log("== 二、亲手打一局：猜硬币，总猜正面");
  await page.click("#goToday"); await page.waitForTimeout(100); await nav("#play/coin"); await page.waitForSelector("#board");
  const before = await page.evaluate(() => ({ round: document.querySelector("#round").innerText, see: document.querySelector("#see").innerText, about: document.querySelector("#about").open, btns: Array.from(document.querySelectorAll("#choices button")).map(b => b.innerText).join() }));
  ok(before.round === "第 1 / 20 回合" && before.see === "还没抛过" && before.about === true && before.btns === "猜正面,猜反面", "开局：第 1 回合，还没抛过，题目是展开的，两个按钮", JSON.stringify(before));
  await page.click('#choices [data-a="1"]');
  const mid = await page.evaluate(() => ({ round: document.querySelector("#round").innerText, last: document.querySelector("#last").innerText, total: document.querySelector("#total").innerText, log: document.querySelectorAll("#logTab tbody tr").length }));
  ok(mid.round === "第 2 / 20 回合" && /^上一回合：你猜正面，抛出来是(正|反)面：猜(对，\+1|错，0) 分$/.test(mid.last) && /到现在：[01] 分/.test(mid.total) && mid.log === 1, "打了一回合：回合数、上一回合的结果、到现在的分数、逐回合的表", JSON.stringify(mid));
  for (let i = 1; i < 20; i++) await page.click('#choices [data-a="1"]');
  await page.waitForSelector("#result");
  const c1 = await refScore("coin", "总猜正面"), cmp = await rows("#cmp");
  ok(c1.kind === "day" && c1.you === c1.ref && cmp.length === 4 && cmp[0][0] === "你" && cmp[0][1] === c1.you + " 分" && cmp[1][0] === "总猜正面（基准）" && cmp[1][1] === c1.ref + " 分", "总猜正面打完，得分和“总猜正面”那条规则一模一样：同一局、同样的硬币", JSON.stringify(c1) + " " + JSON.stringify(cmp));
  ok((await page.locator("#choices").count()) === 0 && (await page.locator("#logTab").count()) === 0 && (await txt("#resultLine")).startsWith("这一局你得了 " + c1.you + " 分"), "打完：按钮没了，结果在最上面");
  const side = await rows("#sideTab");
  ok(side.length === 20 && side[0][2] === "正面" && side.every(r => r[2] === "正面") && (await page.locator("#whichRef option").count()) === 3, "对照表：20 回合，你报的都是正面；可以换着看三条规则");
  await page.selectOption("#whichRef", "2"); await page.waitForTimeout(60);
  const side2 = await rows("#sideTab"), th = await page.evaluate(() => Array.from(document.querySelectorAll("#sideTab thead th")).map(x => x.innerText).join());
  ok(th === "回合,看到的,你报的,你得,跟着多数猜 报的,它得" && side2.length === 20 && (await page.evaluate(() => document.querySelector("#traceBox pre").textContent)).includes("st.heads"), "换成“跟着多数猜”：表头和代码都换了", th);
  await page.click("#copyScore"); await page.waitForTimeout(50);
  const copied = await page.evaluate(() => window.__copied[0]);
  ok(/^【策略实验室·青少年版】猜硬币 · \d{4}-\d{2}-\d{2} 今天的一局：我得了 \d+ 分；总猜正面 \d+，上次是什么就猜什么 \d+，跟着多数猜 \d+。$/.test(copied), "复制成绩：一行字，带三条规则的分", copied);
  await page.screenshot({ path: SH("teen-coin.png"), fullPage: true });
  await page.click("#again"); await page.waitForSelector("#choices");
  const again = await page.evaluate(() => ({ kind: window.QL_TEEN.current().kind, seed: window.QL_TEEN.current().seed, round: document.querySelector("#round").innerText, replay: !!document.querySelector("#replayDay") }));
  ok(again.kind === "rand" && again.seed !== c1.seed && again.round === "第 1 / 20 回合", "再来一局：随机的种子，从第 1 回合起", JSON.stringify(again));
  for (let i = 0; i < 20; i++) await page.click('#choices [data-a="0"]');
  await page.waitForSelector("#replayDay"); await page.click("#replayDay"); await page.waitForSelector("#choices");
  ok((await page.evaluate(() => window.QL_TEEN.current().seed)) === c1.seed, "重打今天的一局：回到今天的种子");
  await goto("#play/coin");
  const chip = await txt('#games [data-game="coin"]');
  ok(/最好 \d+/.test(chip) && (await page.evaluate(() => { const s = window.QL_TEEN.store(); return s.best.coin && s.best.coin.score >= 0 && s.played.coin && s.played.coin.log.length === 20; })), "刷新以后：最好成绩在游戏的标签上，打过的那一局存着（给“写规则”用）", chip);

  console.log("== 三、其他六个游戏：最简单的打法，和对应的基准规则分数一模一样");
  const play = async (gid, how, refName) => {
    await goto("#play/" + gid); await page.waitForSelector("#board");
    for (let i = 0; i < 70 && (await page.locator("#result").count()) === 0; i++) await how(i);
    await page.waitForSelector("#result");
    const r = await refScore(gid, refName);
    ok(r.you === r.ref, NAMES[gid] + "：你按“" + refName + "”的办法打，得分和它一样（" + r.you + "）", JSON.stringify(r));
    return r;
  };
  const NAMES = { pig: "掷骰子", melon: "卖西瓜", bandit: "抽卡机", stop: "找最大的数", shop: "奶茶店", park: "停车" };
  await play("pig", async i => { await page.click(i === 0 ? '#choices [data-a="1"]' : '#choices [data-a="0"]'); }, "掷一次就收");
  await play("melon", async () => { await page.fill("#num", "5"); await page.click("#go"); }, "一口价 5 元");
  await play("bandit", async () => { await page.click('#choices [data-a="1"]'); }, "一直抽 1 号");
  await play("stop", async () => { await page.click('#choices [data-a="1"]'); }, "要第一个");
  await play("shop", async () => { await page.fill("#num", "15"); await page.click("#go"); }, "每天固定 15 杯");
  await play("park", async () => { const can = !(await page.locator('#choices [data-a="1"]').isDisabled()); await page.click(can ? '#choices [data-a="1"]' : '#choices [data-a="0"]'); }, "见空就停");
  const parkTxt = await page.evaluate(() => document.querySelector("#result").innerText + document.querySelector("#sideTab").innerText);
  ok(/停在离门口|开到头/.test((await rows("#sideTab")).map(r => r.join(" ")).join(" ")) || parkTxt.length > 0, "停车的对照表写得出停在哪儿");
  await goto("#play/pig"); await page.waitForSelector("#board");
  const pigBtns = await page.evaluate(() => Array.from(document.querySelectorAll("#choices button")).map(b => b.innerText).join());
  ok(pigBtns === "接着掷,收手" && (await txt("#see")) === "累计 0 分", "掷骰子的按钮和看到的东西");
  await page.click('#choices [data-a="1"]'); await page.waitForTimeout(50);
  const pigLast = (await page.locator("#result").count()) ? await txt("#resultLine") : await txt("#last");
  ok(/掷出 [2-6]，累计 [2-6] 分|掷出 1，累计清零|这一局你得了 0 分/.test(pigLast), "掷一次：说清楚掷出几点、累计多少（或者掷出 1 清零）", pigLast);

  console.log("== 四、七课");
  await goto("#code/seq"); await stub();
  ok((await page.locator("#lesson h3").innerText()) === "第 1 课 · 程序就是一步一步的指令" && (await page.locator(".chips .chip").count()) === 7, "第一课打开了，七课的目录都在");
  await page.click("#run"); await page.waitForSelector("#out:not([hidden])", { timeout: 15000 });
  const o1 = await txt("#out");
  ok(o1.split("\n").join(" / ") === "你好 / 7 / 20 位顾客，每人 2.5 元，一共 50" && (await page.locator("#taskOk").isHidden()), "例子跑出三行；没改过的例子不说“还没做到”", o1);
  await page.fill("#snip", (await page.inputValue("#snip")) + "\nprint(7 * 8);"); await page.click("#run"); await page.waitForFunction(() => /做到了/.test((document.querySelector("#taskOk") || {}).textContent || ""), null, { timeout: 15000 });
  ok(await page.evaluate(() => window.QL_TEEN.store().done.seq === 1), "改一改做到了：这一课记成过了");
  await page.fill("#snip", "print（1）;"); await page.click("#run"); await page.waitForTimeout(200);
  ok((await txt("#msg")).includes("第 1 行有一个中文的标点“（”"), "中文标点：指出第几行、哪个标点", await txt("#msg"));
  await page.fill("#snip", "print(\"你好，世界\"); // 注释，中文\nvar x = ;"); await page.click("#run"); await page.waitForTimeout(200);
  ok((await txt("#msg")).includes("代码有语法错误"), "引号和注释里的中文标点不算；真正的语法错误报出来", await txt("#msg"));
  await page.fill("#snip", "print(1);\nvar y = 2\nprint(y;"); await page.click("#run"); await page.waitForTimeout(200);
  ok(/语法错误/.test(await txt("#msg")), "少了括号也报语法错误", await txt("#msg"));
  await goto("#code/loop"); await stub(); await page.click("#loopDemo"); await page.waitForFunction(() => /掐掉/.test((document.querySelector("#msg") || {}).textContent || ""), null, { timeout: 15000 });
  ok((await txt("#msg")).includes("跑了 1 秒还没停，已经被掐掉") && !(await page.locator("#run").isDisabled()), "死循环的演示：到时间掐掉，说清楚；按钮恢复可用");
  await page.click("#run"); await page.waitForSelector("#out:not([hidden])", { timeout: 15000 });
  ok((await txt("#out")).includes("正面出现了 5 次，占 0.625") && (await txt("#out")).includes("掷了 5 次，累计 20"), "第四课的例子：for 数正面、while 掷到 20");
  await page.fill("#snip", (await page.inputValue("#snip")).replace("results[i] === 1", "results[i] === 0")); await page.click("#run"); await page.waitForFunction(() => /做到了/.test((document.querySelector("#taskOk") || {}).textContent || ""), null, { timeout: 15000 });
  ok(true, "第四课：数反面，做到了");
  for (const id of ["var", "if", "fn", "obj"]) { await goto("#code/" + id); await stub(); await page.click("#run"); await page.waitForSelector("#out:not([hidden])", { timeout: 15000 }); ok((await page.locator("#msg").isHidden()) && (await txt("#out")).length > 0, "《" + (await page.locator("#lesson h3").innerText()) + "》的例子跑得通"); }
  await goto("#code/rule"); await stub(); await page.click("#run"); await page.waitForSelector("#ruleTrace", { timeout: 30000 });
  const l7 = await page.evaluate(() => ({ line: document.querySelector("#out p").innerText, rows: document.querySelectorAll("#ruleTrace tbody tr").length, th: Array.from(document.querySelectorAll("#ruleTrace thead th")).map(x => x.innerText).join() }));
  ok(/^在今天的“猜硬币”这一局上，这条规则得了 \d+ 分（共 20 回合）。$/.test(l7.line) && l7.rows === 20 && l7.th === "回合,它看到的,它报的,得分", "第七课：规则放到今天的一局上，逐回合看得到", JSON.stringify(l7));
  const l7score = +/得了 (\d+) 分/.exec(l7.line)[1], majorScore = await page.evaluate(() => { const g = window.QL_TEEN.games[0]; return window.QL_TEEN.refsOn(g, window.QL_TEEN.daySeed("coin", window.QL_TEEN.today())).filter(r => r.ref.id === "major")[0].score; });
  ok(l7score === majorScore, "第七课的例子就是“跟着多数猜”，得分和它在今天的一局上的得分一样");
  await page.fill("#snip", "function decide(s, p, st) {\n  return s.see === 0 ? 0 : 1;\n}"); await page.click("#run"); await page.waitForFunction(() => /做到了/.test((document.querySelector("#taskOk") || {}).textContent || ""), null, { timeout: 30000 });
  ok(true, "第七课：改成跟着上一次，做到了");

  console.log("== 五、七个想法");
  await goto("#algo/estimate");
  const est = await rows("#estTab");
  ok(est.length === 4 && est[0][0] === "5" && est[3][0] === "1000" && Math.abs(+est[3][2] - 0.7) < 0.03, "数一数：抛 5、20、100、1000 次的估计，1000 次已经很接近 0.7", JSON.stringify(est));
  await goto("#algo/backward");
  const dp = await rows("#dpTab");
  ok(dp.length === 10 && dp[0][1] === "9" && dp[9][2] === "只能要" && dp[9][3] === "50.5" && dp[8][2] === "比 50.5 大才要" && dp[7][2] === "比 63.0 大才要" && +dp[0][3] > 86 && +dp[0][3] < 87, "从后往前想：门槛表是现算的，63.0 和 86.6 都对得上", JSON.stringify(dp.slice(7)));
  await stub(); await page.click("#expRun"); await page.waitForSelector("#expTab", { timeout: 120000 });
  const exp = await rows("#expTab"), top = await page.evaluate(() => document.querySelector("#expTab .top").closest("tr").children[0].innerText);
  ok(exp.length === 5 && top === "门槛越来越低" && exp.every(r => /^\d+\.\d\d ± \d+\.\d\d$/.test(r[1])), "实验：五条规则的平均 ± 标准误，最高的是“门槛越来越低”", JSON.stringify(exp) + " top " + top);
  await goto("#algo/expect");
  const nv = await rows("#nvTab"), pigT = await rows("#pigTab"), nvNote = await page.locator("#demo .note").last().innerText();
  ok(nv.length === 11 && pigT.length === 7 && nvNote.includes("做 14 杯") && (await page.evaluate(() => document.querySelector("#nvTab tr.me td").innerText)) === "14" && (await page.locator("#exp2").count()) === 1, "算期望值：骰子那笔账的表、奶茶店做几杯的表（最划算的 14 杯标出来）、第二个实验在", nvNote);
  await goto("#algo/compare"); await stub(); await page.click("#expRun"); await page.waitForSelector("#expTab", { timeout: 120000 });
  const cth = await page.evaluate(() => Array.from(document.querySelectorAll("#expTab thead th")).map(x => x.innerText).join()), crows = await rows("#expTab");
  ok(cth === "规则,只打第 1 局,只打第 2 局,打 200 局的平均" && crows.length === 2 && /±/.test(crows[0][3]) && !/±/.test(crows[0][1]), "怎么比较：一局、另一局、200 局的平均三列", cth + " " + JSON.stringify(crows));
  await goto("#algo/context"); await stub(); await page.click("#expRun"); await page.waitForSelector("#expTab", { timeout: 180000 });
  const pth = await page.evaluate(() => Array.from(document.querySelectorAll("#expTab thead th")).map(x => x.innerText).join());
  ok(pth === "规则,空位少的街,空位多的街,两种都有" && (await rows("#expTab")).length === 5, "门槛也要看情况：两条街加一列“两种都有”", pth);
  await page.screenshot({ path: SH("teen-algo.png"), fullPage: true });

  console.log("== 六、写规则");
  await goto("#rule/coin"); await stub();
  ok((await page.inputValue("#code")).includes("____") && (await page.inputValue("#par")) === "" && (await txt("#hint")).includes("st.heads"), "猜硬币的起始代码带空，提示写着怎么填");
  await page.click("#run"); await page.waitForTimeout(150);
  ok((await txt("#msg")).includes("还有空没填"), "没填空就跑：提醒");
  await page.fill("#code", (await page.inputValue("#code")).replace("____", "st.heads * 2 >= st.n")); await page.click("#run"); await page.waitForSelector("#cmpTab", { timeout: 120000 });
  const cmpR = await rows("#cmpTab"), you = cmpR.filter(r => r[1] === "你的规则")[0], major = cmpR.filter(r => r[1] === "跟着多数猜")[0];
  ok(cmpR.length === 4 && you && major && you[2] === major[2] && you[3] === major[3] && cmpR[3][1] === "总猜正面（基准）" && cmpR[3][3] === "—" && (await txt("#verdictLine")).includes("一模一样"), "填上空就是“跟着多数猜”：200 局的成绩和它逐位相同；判语说一模一样", JSON.stringify(cmpR));
  await page.click("#runOne"); await page.waitForSelector("#sideTab", { timeout: 60000 });
  ok((await txt("#oneLine")).includes("你得了") && (await rows("#sideTab")).length === 20 && (await page.locator("#cmpTab").count()) === 1, "在刚打过的那一局上试：对照表 20 回合，200 局的表还在");
  await page.selectOption("#tmpl", "repeat"); await page.waitForTimeout(60);
  ok((await page.inputValue("#code")).includes("s.see === 0 ? 0 : 1") && (await page.evaluate(() => window.QL_TEEN.store().drafts.coin.code)).includes("s.see === 0"), "换成基准规则的代码：换了，也存成草稿了");
  await page.fill("#par", "c = abc"); await page.click("#run"); await page.waitForTimeout(150);
  ok((await txt("#msg")).includes("参数的写法不对"), "参数写错：提醒");
  await page.fill("#par", ""); await page.fill("#code", "function decide(s, p) { while (true) {} }"); await page.click("#run"); await page.waitForFunction(() => /掐掉/.test((document.querySelector("#msg") || {}).textContent || ""), null, { timeout: 30000 });
  ok((await txt("#msg")).includes("死循环") && !(await page.locator("#run").isDisabled()), "死循环的规则：到时间掐掉，说清楚");
  await page.fill("#code", "function decide(s, p) { return 1 }"); await page.click("#run"); await page.waitForSelector("#cmpTab", { timeout: 120000 });
  const again2 = await rows("#cmpTab"); ok(again2.filter(r => r[1] === "你的规则")[0][2] === again2.filter(r => r[1] === "总猜正面（基准）")[0][2], "总猜正面：和基准逐位相同");
  await goto("#rule/pig"); await stub();
  ok((await page.inputValue("#par")) === "c = 20" && (await page.inputValue("#code")).includes("____"), "换一个游戏：参数和起始代码都换了");
  await page.fill("#code", (await page.inputValue("#code")).replace("____", "s.see >= p.c")); await page.fill("#par", "c = 20"); await page.click("#run"); await page.waitForSelector("#cmpTab", { timeout: 120000 });
  const pigR = await rows("#cmpTab"); ok(pigR.filter(r => r[1] === "你的规则")[0][2] === pigR.filter(r => r[1] === "攒到 20 分就收")[0][2], "掷骰子：填上空、参数 c = 20，和“攒到 20 分就收”逐位相同");
  await goto("#rule/pig"); ok((await page.inputValue("#code")).includes("s.see >= p.c"), "刷新以后草稿还在");
  await page.screenshot({ path: SH("teen-rule.png"), fullPage: true });

  console.log("== 七、老师页、手机宽度、大厅里的链接");
  await goto("#teach");
  ok((await page.locator(".teach").count()) >= 5 && (await page.evaluate(() => document.querySelector("#view").innerText)).includes("45 分钟"), "老师页：几段说明，有 45 分钟的上法");
  await page.setViewportSize({ width: 390, height: 844 });
  const spills = [];
  for (const hsh of ["#home", "#play/melon", "#play/bandit", "#code/if", "#algo/expect", "#rule/stop", "#teach"]) { await goto(hsh); const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), c = await page.evaluate(clipped); if (o > 1) spills.push(hsh + ": overflow " + o); if (c.length) spills.push(hsh + ": " + JSON.stringify(c.slice(0, 3))); }
  await goto("#play/melon"); await page.waitForSelector("#board");
  for (let i = 0; i < 20; i++) await page.click('.presets [data-a="6"]');
  await page.waitForSelector("#result"); const o2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (o2 > 1) spills.push("melon result: overflow " + o2);
  await page.screenshot({ path: SH("teen-phone.png"), fullPage: true });
  ok(spills.length === 0, "手机宽度：七个页面和打完的卖西瓜都不横向溢出，按钮和表头的字不被截掉", spills.join("\n"));
  await page.setViewportSize({ width: 1280, height: 1000 });
  ok(reqs.length === 0, "青少年版打开以后没有任何对外的请求", reqs.join(","));
  // 大厅里指向青少年版的链接（中文页和英文页）
  await page.goto(`http://127.0.0.1:${t.port}/index.html`); await page.waitForFunction(() => window.App && window.App.openLobby && !window.App.isBusy, null, { timeout: 60000 });
  await page.click("#btnLobby"); await page.waitForSelector("#lbTeen");
  const lz = await page.evaluate(() => ({ href: document.querySelector("#lbTeen").getAttribute("href"), text: document.querySelector(".lb-teen").innerText }));
  await page.goto(`http://127.0.0.1:${t.port}/en/index.html`); await page.waitForFunction(() => window.App && window.App.openLobby && !window.App.isBusy, null, { timeout: 60000 });
  await page.click("#btnLobby"); await page.waitForSelector("#lbTeen");
  const le = await page.evaluate(() => ({ href: document.querySelector("#lbTeen").getAttribute("href"), text: document.querySelector(".lb-teen").innerText }));
  ok(lz.href === "teen/" && lz.text.startsWith("青少年版：给中学生的入口") && le.href === "../teen/" && le.text.startsWith("Teen edition: an entry point") && !/[㐀-鿿]/.test(le.text), "大厅底部有去青少年版的链接：中文页指向 teen/，英文页指向 ../teen/ 并且是英文的", JSON.stringify([lz, le]));

  const realLogs = real(logs);
  ok(realLogs.length === 0, "没有报错", realLogs.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", realLogs.length ? "\n" + realLogs.join("\n") : "none");
  await t.close();
  if (fail) process.exitCode = 1;
})().catch(e => { console.error("CRASH", e); process.exit(1); });
