// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 第四轮复核（修订之后的再检查）找到的界面缺陷：每一条留一个回归检查。
// 四舍五入成 0 的数不带正负号；样本外那一行立刻标出"参数已变"；进入玩法时记着的规则不存在了就用默认的；
// 被场景收回来的参数会还回来，场景对比不因此过期；隐藏的参数不妨碍认出场景；搜索框、局数输入框、焦点与滚动位置；手机上不被拽回"结果"一页。
const path = require("path"), fs = require("fs"), { open, pickWorld, liveIdle } = require("./ui-smoke.js");
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) pass++; else { fail++; console.log("  FAIL", name, d || ""); } };
const INIT = fs.readFileSync(path.join(__dirname, "mock-claude.js"), "utf8");
(async () => {
  let t = await open({ viewport: { width: 1366, height: 700 }, init: INIT }), page = t.page, logs = t.logs;
  const mk = p => ({
    idle: async () => { await p.waitForTimeout(150); await p.waitForFunction(() => !window.App.isBusy, null, { timeout: 120000 }); await p.waitForTimeout(150); },
    scnDone: async (ms) => { await p.waitForFunction(() => window.App.scn.rows && !window.App.scn.busy, null, { timeout: ms || 180000 }); await p.waitForTimeout(150); },
    setup: go => p.evaluate(g => window.App.applySetup(g), go), card: id => p.locator(`.card[data-chart="${id}"]`)
  });
  let H = mk(page);
  await page.waitForSelector(".crit .big"); await H.idle();
  await page.evaluate(() => { const b = document.querySelector("#guideHint button:last-child"); if (b) b.click(); });

  // ---- 1) 价格世界的结果栏：差别小到显示出来是 0 的，不带正负号，也不说"高于/低于"
  await H.setup({ world: "gbm", std: true, resetW: true, strat: "const", resetS: true, sp: { f: 0.999 } }); await H.idle();
  let sm = await page.locator("#summary").innerText();
  ok(!/[+−]0\.00%/.test(sm) && !/差 [+−]0\.00/.test(sm) && /与基准几乎相同/.test(sm) && /差 0\.00/.test(sm) && !/(高于|低于)基准 /.test(sm), "固定比例 0.999 倍：和基准的差写成\"几乎相同\"，不出现 +0.00% 或 −0.00", (sm.match(/.{0,14}0\.00.{0,10}/g) || []).join(" | ").slice(0, 200));
  await H.setup({ world: "gbm", std: true, resetW: true, strat: "const", resetS: true }); await H.idle();
  sm = await page.locator("#summary").innerText();
  ok(/= 与基准完全相同/.test(sm) && /差 0\.00/.test(sm) && !/[+−]0\.00/.test(sm), "固定比例 1 倍：与基准完全相同，夏普的差写 0.00");
  await H.setup({ world: "gbm", std: true, resetW: true, strat: "const", resetS: true, scenes: "world", charts: ["scenes"] }); await H.idle(); await H.scnDone();
  const scTxt = await H.card("scenes").innerText(), tips = await page.evaluate(() => Array.from(document.querySelectorAll('.card[data-chart="scenes"] .hb-row')).map(r => r.getAttribute("title") || "").join(" || "));
  ok(!/[+−]0\.00%/.test(scTxt) && !/比基准 [+−]0\.00%/.test(tips), "场景对比里和基准一样的行写 0.00%，不带正负号", (scTxt.match(/.{0,10}[+−]0\.00%.{0,6}/) || [""])[0]);
  const fm = await page.evaluate(() => { const A = window.App; return [A.pctS(0.000001), A.pctS(-0.000001), A.pctS(0.0123), A.pctS(-0.0123), A.gfmt({ kind: "usd", digits: 2 }, 3276940.19), A.gfmt({ kind: "usd", digits: 2 }, 91), A.gdiff({ kind: "usd", digits: 2 }, -1234.5)]; });
  ok(fm.join("|") === "0.00%|0.00%|+1.23%|−1.23%|$3,276,940.19|$91.00|−$1,234.50", "数字的写法：零不带号；美元带千位分隔", fm.join(" | "));

  // ---- 2) 样本外那一行：改了参数，这一次回测出来它就标成"参数已变"；改回去就不标
  await H.setup({ world: "gbm", std: true, resetW: true, strat: "const", resetS: true, sp: { f: 1.5 } }); await H.idle();
  await page.click("#btnOos"); await page.waitForFunction(() => window.App.oos && window.App.oos.k >= 1 && /新路径 #/.test(document.getElementById("oosBox").innerText), null, { timeout: 60000 });
  ok(!(await page.locator("#oosBox.stale").count()), "刚做完样本外检验：不标过期");
  await page.fill("#s-f", "0.5"); await page.locator("#s-f").press("Enter"); await H.idle();
  ok((await page.locator("#oosBox.stale").count()) === 1 && /参数已变/.test(await page.locator("#oosBox").innerText()), "改了一次参数：样本外那一行立刻标出\"参数已变\"", await page.locator("#oosBox").innerText());
  await page.fill("#s-f", "1.5"); await page.locator("#s-f").press("Enter"); await H.idle();
  ok(!(await page.locator("#oosBox.stale").count()), "把参数改回去：它又对得上了，不再标过期");

  // ---- 3) 进入玩法时：记着的那条规则已经不存在，就用这套玩法的默认规则
  await H.setup({ world: "gbm", std: true, resetW: true, strat: "const", resetS: true }); await H.idle();
  await page.evaluate(() => { window.App.state.last = { g_prop: "my-deleted", g_ashare: 42 }; });
  await pickWorld(page, "g_prop"); await H.idle();
  ok(await page.evaluate(() => window.App.state.stratId === "prop_fix"), "自营考核：记着的规则不存在时用默认的\"固定仓位\"", await page.evaluate(() => window.App.state.stratId));
  await pickWorld(page, "gbm"); await H.idle(); await page.selectOption("#stratSel", "const"); await H.idle(); await page.evaluate(() => { window.App.state.last.g_ashare = 42; });
  await pickWorld(page, "g_ashare"); await H.idle();
  ok(await page.evaluate(() => window.App.strat().game === "g_ashare"), "A 股制度同理", await page.evaluate(() => window.App.state.stratId));

  // ---- 4) 秘书问题：切到"只有 10 人"，"先看多少人"被收回到 9；表不标过期；切回去它变回 37
  await H.setup({ world: "g_sec", std: true, resetW: true, strat: "sec_cut", resetS: true, scenes: "rule", charts: ["scenes"] }); await H.idle(); await H.scnDone();
  await H.card("scenes").locator('.hb-row:has-text("只有 10 人") .hb-go').click(); await H.idle(); await page.waitForTimeout(300);
  let sec = await page.evaluate(() => { const c = document.querySelector('.card[data-chart="scenes"]'), cur = c.querySelector(".hb-row.cur"); return { m: window.App.sp().m, n: window.App.wp().n, stale: /上一次的结果/.test(c.innerText), cur: cur ? cur.querySelector(".hb-n").textContent : "", val: cur ? cur.querySelector(".hb-val").textContent : "", score: window.App.gfmt(window.App.run.game, window.App.run.game.score) }; });
  ok(sec.n === 10 && sec.m === 9 && !sec.stale && /只有 10 人/.test(sec.cur) && sec.val.indexOf(sec.score) >= 0, "切到\"只有 10 人\"：参数收回到 9，表不过期，当前这一行的数就是结果栏的数", JSON.stringify(sec));
  await H.card("scenes").locator('.hb-row >> nth=0 >> .hb-go').click(); await H.idle(); await page.waitForTimeout(300);
  sec = await page.evaluate(() => { const c = document.querySelector('.card[data-chart="scenes"]'), cur = c.querySelector(".hb-row.cur"); return { m: window.App.sp().m, n: window.App.wp().n, stale: /上一次的结果/.test(c.innerText), val: cur ? cur.querySelector(".hb-val").textContent : "", score: window.App.gfmt(window.App.run.game, window.App.run.game.score) }; });
  ok(sec.n === 100 && sec.m === 37 && !sec.stale && sec.val.indexOf(sec.score) >= 0, "切回 100 人：参数自己变回 37，表仍然不过期", JSON.stringify(sec));
  // 自己动过参数之后，就以新设的为准
  await H.card("scenes").locator('.hb-row:has-text("只有 10 人") .hb-go').click(); await H.idle();
  await page.fill("#s-m", "4"); await page.locator("#s-m").press("Enter"); await H.idle();
  await H.card("scenes").locator('.hb-row >> nth=0 >> .hb-go').click(); await H.idle();
  ok(await page.evaluate(() => window.App.sp().m === 4), "在 10 人的场景里自己把它改成 4：回到 100 人时不再变回 37", String(await page.evaluate(() => window.App.sp().m)));

  // ---- 5) "比基准"的标题也带单位；被别的选项藏起来的参数不妨碍认出场景
  await H.setup({ world: "g_exec", std: true, resetW: true, strat: "exec_ac", resetS: true, scenes: "rule", charts: ["scenes"] }); await H.idle(); await H.scnDone();
  await H.card("scenes").locator('select[aria-label="指标"]').selectOption("d"); await page.waitForTimeout(200);
  ok(/期初市值的 %/.test(await H.card("scenes").locator(".hb-cap").first().innerText()), "大单执行，\"比基准\"：标题里有单位", await H.card("scenes").locator(".hb-cap").first().innerText());
  await H.setup({ world: "g_lock", std: true, resetW: true, wp: { dist: "pareto", alpha: 3 }, strat: "lock_thr", resetS: true }); await H.idle();
  await page.selectOption("#w-dist", "exp"); await H.idle();
  await page.evaluate(() => window.App.applySetup({ scenes: "rule", charts: ["scenes"] })); await H.idle(); await H.scnDone();
  await page.click("#btnScenes"); await page.waitForFunction(() => window.App.scn.busy, null, { timeout: 20000 }).catch(() => {}); await H.scnDone();   // 上面换过分布：重新对比一次
  const hid = await page.evaluate(() => { const c = document.querySelector('.card[data-chart="scenes"]'); return { names: Array.from(c.querySelectorAll(".hb-n")).map(e => e.textContent), cur: (c.querySelector(".hb-row.cur .hb-n") || {}).textContent }; });
  ok(hid.names.indexOf("你现在的设定") < 0 && /指数/.test(hid.cur || ""), "接单与冷却：改过帕累托的 α 再换回指数分布，仍认得出这是\"指数分布\"那个场景", JSON.stringify(hid));

  // ---- 6) 手册的搜索框：空着时回车不跳页；有字时 Esc 先清空（焦点在手册里别处也一样）
  await page.evaluate(() => window.App.openGuide("start:criteria")); await page.waitForSelector(".gd-search");
  await page.focus(".gd-search"); await page.keyboard.press("Enter"); await page.waitForTimeout(120);
  ok(/三种口径/.test(await page.locator(".gd-title").innerText()), "搜索框空着时按回车：留在原来那一页", await page.locator(".gd-title").innerText());
  await page.fill(".gd-search", "报童"); await page.waitForTimeout(100); await page.locator(".gd-nav .gd-link").first().focus(); await page.keyboard.press("Escape"); await page.waitForTimeout(120);
  ok((await page.locator(".modal.guide").count()) === 1 && (await page.inputValue(".gd-search")) === "", "搜索框里有字、焦点在搜索结果上时按 Esc：先清空搜索，手册不关");
  await page.keyboard.press("Escape"); await page.waitForTimeout(120);
  ok((await page.locator(".modal.guide").count()) === 0, "再按一次 Esc 才收起手册");

  // ---- 7) 当前的细则：起点不是 100 的世界不说"从 100 出发"
  await H.setup({ world: "ou", std: true, resetW: true, wp: { start: 150 }, strat: "band", resetS: true }); await H.idle();
  await page.evaluate(() => window.App.openGuide("now")); await page.waitForTimeout(100);
  const ouTxt = await page.locator(".gd-art").innerText(); ok(!/从 100 出发/.test(ouTxt) && /起始价 = 150/.test(ouTxt), "均值回复、起始价 150：细则里不再写\"价格从 100 出发\"");
  await page.keyboard.press("Escape");
  await H.setup({ world: "gbm", std: true, resetW: true, strat: "const", resetS: true }); await H.idle();
  await page.evaluate(() => window.App.openGuide("now")); await page.waitForTimeout(100);
  ok(/价格从 100 出发/.test(await page.locator(".gd-art").innerText()), "几何布朗运动照旧写从 100 出发"); await page.keyboard.press("Escape");

  // ---- 8) 左栏：改一个下拉框，这个下拉框不跳走；玩法的局数输入框按 Tab 到下一格，紧接着点按钮也点得中
  await H.setup({ world: "g_prop", std: true, resetW: true, strat: "prop_fix", resetS: true }); await H.idle();
  await page.evaluate(() => { const p = document.getElementById("paneCtl"), s = document.getElementById("w-src"); p.scrollTop += s.getBoundingClientRect().top - p.getBoundingClientRect().top - 40; });
  const y0 = await page.evaluate(() => document.getElementById("w-src").getBoundingClientRect().top);
  await page.focus("#w-src"); await page.keyboard.press("ArrowDown"); await H.idle();
  const y1 = await page.evaluate(() => ({ y: document.getElementById("w-src").getBoundingClientRect().top, f: document.activeElement && document.activeElement.id, v: document.getElementById("w-src").value }));
  ok(Math.abs(y1.y - y0) < 12 && y1.f === "w-src" && y1.v !== "gbm", "\"行情\"下拉框按一下向下键：它留在原处，焦点还在它上面", JSON.stringify({ y0, y1 }));
  await page.fill("#wN", "500"); await page.keyboard.press("Tab"); await H.idle();
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id === "wSeed" && window.App.state.world.N === 500), "局数输入框按 Tab：数生效，焦点到了\"随机种子\"", await page.evaluate(() => (document.activeElement || {}).id + " N=" + window.App.state.world.N));
  const seed0 = await page.evaluate(() => window.App.state.world.seed);
  await page.fill("#wN", "600"); await page.locator('#blkWorld button:has-text("换一批对局")').click(); await H.idle();
  ok(await page.evaluate(s => window.App.state.world.N === 600 && window.App.state.world.seed === s + 1, seed0), "改完局数紧接着点\"换一批对局\"：两样都生效", await page.evaluate(() => JSON.stringify([window.App.state.world.N, window.App.state.world.seed])));
  await H.setup({ world: "g_lock", std: true, resetW: true, wp: { T: 4000 }, strat: "lock_thr", resetS: true, N: 6000 }); await H.idle();
  ok(/实际按 \d+ 局算/.test(await page.locator("#wNcap").innerText()), "局数 × 回合数超过上限时的那句提示还在", await page.locator("#blkWorld").innerText().then(x => x.slice(-80)));

  // ---- 9) 图表架的标签、场景对比的切换按钮：用键盘按过之后焦点还在
  await H.setup({ world: "gbm", std: true, resetW: true, strat: "ma", resetS: true }); await H.idle();
  await page.evaluate(() => { const A = window.App; if (A.shown().indexOf("dd") >= 0) A.toggleChart("dd"); }); await page.waitForTimeout(100);
  await page.focus('#shelf .chip[data-chart="dd"]'); await page.keyboard.press("Enter"); await page.waitForTimeout(250);
  ok(await page.evaluate(() => { const a = document.activeElement; return !!a && a.classList.contains("chip") && a.getAttribute("data-chart") === "dd" && window.App.shown().indexOf("dd") >= 0; }), "在图表架的标签上按回车：图打开了，焦点还在那个标签上");
  await page.evaluate(() => window.App.applySetup({ scenes: "rule", charts: ["scenes"] })); await H.idle(); await H.scnDone();
  await H.card("scenes").locator('.seg button:has-text("这个场景 × 各条规则")').focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  ok(await page.evaluate(() => { const a = document.activeElement, c = document.querySelector('.card[data-chart="scenes"]'); return !!a && c.contains(a) && a.tagName === "BUTTON"; }), "场景对比里用回车切换看法：焦点还在这一排按钮里", await page.evaluate(() => (document.activeElement || {}).tagName + ":" + ((document.activeElement || {}).textContent || "").slice(0, 12)));
  await H.scnDone();
  // 收起跑到一半的场景对比，再打开：重新开始，不留"已停止"
  await page.click("#btnScenes"); await page.waitForFunction(() => window.App.scn.busy, null, { timeout: 20000 });
  await page.evaluate(() => window.App.toggleChart("scenes")); await page.waitForTimeout(200);
  await page.evaluate(() => window.App.toggleChart("scenes", undefined, true)); await page.waitForTimeout(400); await H.scnDone();
  ok(!/已停止/.test(await H.card("scenes").innerText()) && await page.evaluate(() => window.App.scn.rows.every(r => !r.cancelled)), "收起跑到一半的场景对比再打开：重新跑完，不留\"已停止\"");

  // ---- 10) 规则下面那行小字：有记事本、开局时是空的
  await H.setup({ world: "g_bandit", std: true, resetW: true, strat: "ban_etc", resetS: true }); await H.idle();
  ok(/开局时状态是空的/.test(await page.locator("#algoNote").innerText()), "先试后定：开局时状态是空的，之后边跑边记", (await page.locator("#algoNote").innerText()).replace(/\n/g, " | "));
  await H.setup({ world: "g_bandit", std: true, resetW: true, strat: "ban_ucb", resetS: true }); await H.idle();
  ok(/不带状态/.test(await page.locator("#algoNote").innerText()), "UCB 自己不记东西：不带状态");

  ok(logs.length === 0, "桌面：整个过程没有报错", logs.join(" | ").slice(0, 400));
  await t.close();

  // ---- 11) 手机：点了"带我去"之后自己切到"世界与规则"，回测跑完不被拽回"结果"；让 Claude 调图表时不离开 Claude 那一页
  t = await open({ viewport: { width: 390, height: 800 }, dpr: 2, dark: true, init: INIT }); page = t.page; logs = t.logs; H = mk(page);
  await page.waitForSelector(".crit .big"); await H.idle();
  await page.evaluate(() => { const b = document.querySelector("#guideHint button:last-child"); if (b) b.click(); });
  await page.evaluate(() => window.App.openGuide("start:tour")); await page.waitForTimeout(100);
  await page.locator('.gd-tour > li >> nth=1 >> button:has-text("带我去")').click(); await page.waitForTimeout(60);
  await page.click('#tabs button[data-tab="ctl"]'); await H.idle(); await page.waitForTimeout(1200);
  ok(await page.evaluate(() => document.getElementById("app").dataset.tab === "ctl"), "手机：回测还在跑的时候切到\"世界与规则\"，跑完之后仍留在这一页", await page.evaluate(() => document.getElementById("app").dataset.tab));
  await page.evaluate(() => window.App.openGuide("start:tour")); await page.waitForTimeout(100);
  await page.locator('.gd-tour > li >> nth=1 >> button:has-text("带我去")').click(); await H.idle(); await page.waitForTimeout(900);
  ok(await page.evaluate(() => { const c = document.querySelector('.card[data-chart="scenes"]'), p = document.getElementById("paneRes"); const top = c.getBoundingClientRect().top - p.getBoundingClientRect().top; return document.getElementById("app").dataset.tab === "res" && top >= -4 && top < 400; }), "手机：不去动它的话，照旧到\"结果\"一页，图在眼前");
  await page.evaluate(() => { document.getElementById("app").dataset.tab = "ai"; window.App.showCharts(["dd", "acf"], false, true); }); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.getElementById("app").dataset.tab === "ai" && window.App.shown().indexOf("dd") >= 0 && window.App.shown().indexOf("acf") >= 0), "手机：从 Claude 那一页请它调图表，图打开了，人还在 Claude 那一页");
  ok(logs.length === 0, "手机：整个过程没有报错", logs.join(" | ").slice(0, 400));
  await t.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error("TEST CRASHED:", e.message.split("\n").slice(0, 8).join("\n")); process.exit(1); });
