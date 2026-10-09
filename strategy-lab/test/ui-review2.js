// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 第二轮复核时找到的界面缺陷：每一条留一个回归检查。
// 场景对比的竞态与快照、没有标准误时不下判断、停止之后的状态、基准行的认定；
// 对照表和小实验自带完整的设定；命令面板的排序；只读的代码视图；键盘；存档的健壮性。
const path = require("path"), fs = require("fs"), { open, pickWorld, liveIdle } = require("./ui-smoke.js");
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) pass++; else { fail++; console.log("  FAIL", name, d || ""); } };
const INIT = fs.readFileSync(path.join(__dirname, "mock-claude.js"), "utf8");
(async () => {
  let t = await open({ viewport: { width: 1440, height: 1000 }, seedLive: true, init: INIT }), page = t.page, logs = t.logs;
  const idle = async () => { await page.waitForTimeout(150); await page.waitForFunction(() => !window.App.isBusy, null, { timeout: 120000 }); await page.waitForTimeout(120); };
  const scnDone = async (ms) => { await page.waitForFunction(() => window.App.scn.rows && !window.App.scn.busy, null, { timeout: ms || 180000 }); await page.waitForTimeout(150); };
  const card = id => page.locator(`.card[data-chart="${id}"]`);
  const setup = go => page.evaluate(g => window.App.applySetup(g), go);
  await page.waitForSelector(".crit .big"); await idle();
  await page.evaluate(() => { const b = document.querySelector("#guideHint button:last-child"); if (b) b.click(); });

  // ---- 1) 场景对比跑到一半换世界：不报错，旧的结果清掉
  await setup({ world: "gbm", std: true, resetW: true, strat: "ma", resetS: true, scenes: "world", charts: ["scenes"] }); await idle();
  await page.waitForFunction(() => window.App.scn.busy && window.App.scn.done >= 2, null, { timeout: 60000 });
  await pickWorld(page, "g_bold"); await idle(); await page.waitForTimeout(600);
  ok(logs.length === 0, "场景对比跑到一半换成一套玩法：没有报错", logs.join(" | ").slice(0, 300));
  ok(await page.evaluate(() => !window.App.scn.busy && (!window.App.scn.rows || window.App.scn.type === "g_bold")), "换了世界之后旧的对比停掉、清掉");

  // ---- 2) 跑到一半改种子：这一次对比从头到尾用的是开始时的那一批路径
  await setup({ world: "gbm", std: true, resetW: true, strat: "ma", resetS: true, scenes: "world", charts: ["scenes"] }); await idle();
  await page.waitForFunction(() => window.App.scn.busy && window.App.scn.done >= 3, null, { timeout: 60000 });
  await page.evaluate(() => { const A = window.App; A.state.world.seed = 8; A.renderWorld(); A.worldChanged(true); });
  await scnDone(); await idle();
  const mixed = await page.evaluate(() => ({ seeds: Array.from(new Set(window.App.scn.rows.map(r => r.job.cfg.seed))), dg: window.App.scn.rows.map(r => [r.item.id, r.res ? r.res.sum.dGrowth : null]), txt: document.querySelector('.card[data-chart="scenes"]').innerText }));
  ok(mixed.seeds.length === 1 && mixed.seeds[0] === 7 && mixed.dg.every(x => x[1] != null), "中途改了种子：十四行用的仍是同一个种子", JSON.stringify(mixed.seeds));
  ok(/上一次的结果/.test(mixed.txt) && /重新对比/.test(mixed.txt), "改过之后表上注明这是上一次的结果，按钮是\"重新对比\"");
  await page.evaluate(() => { const A = window.App; A.state.world.seed = 7; A.renderWorld(); A.worldChanged(true); }); await idle();
  await page.click("#btnScenes"); await page.waitForFunction(() => window.App.scn.busy, null, { timeout: 20000 }).catch(() => {}); await scnDone();
  const clean = await page.evaluate(() => window.App.scn.rows.map(r => [r.item.id, r.res ? r.res.sum.dGrowth : null]));
  ok(clean.length === mixed.dg.length && clean.every(x => { const y = mixed.dg.find(z => z[0] === x[0]); return y && Math.abs(y[1] - x[1]) < 1e-12; }), "和干净地重跑一遍的结果逐行相同");
  // 换一条已经在表里的规则：表不必重算，"当前"跟着走
  await card("scenes").locator('.hb-row:has-text("止损与再入场") .hb-go').click(); await idle();
  const afterPick = await page.evaluate(() => ({ s: window.App.state.stratId, txt: document.querySelector('.card[data-chart="scenes"]').innerText, cur: document.querySelector('.card[data-chart="scenes"] .hb-row.cur .hb-n').textContent }));
  ok(afterPick.s === "stop" && !/上一次的结果/.test(afterPick.txt) && afterPick.cur === "止损与再入场", "点箭头选用另一条规则：表不标过期，\"当前\"换到那一行", afterPick.cur);

  // ---- 3) 停止：没算到的行不再转圈，写明算了几行
  await setup({ world: "ar1", std: true, resetW: true, strat: "ma", resetS: true, scenes: "world", charts: ["scenes"] }); await idle(); await scnDone();
  await card("scenes").locator('label:has-text("包括要训练的规则") input').check(); await page.waitForTimeout(100);
  await page.click("#btnScenes"); await page.waitForFunction(() => window.App.scn.busy && window.App.scn.done >= 2, null, { timeout: 60000 });
  await card("scenes").locator('button:has-text("停止")').click(); await page.waitForTimeout(400);
  const stopped = await page.evaluate(() => { const c = document.querySelector('.card[data-chart="scenes"]'); return { spin: c.querySelectorAll(".hb .spin").length, txt: c.innerText, rows: c.querySelectorAll(".hb-row").length, dash: Array.from(c.querySelectorAll(".hb-val")).filter(e => e.textContent.trim() === "—").length, busy: window.App.scn.busy }; });
  ok(!stopped.busy && stopped.spin === 0 && /已停止：\d+ 行里只算了 \d+ 行/.test(stopped.txt) && stopped.dash >= 5 && /重新对比/.test(stopped.txt), "停止之后：不再转圈，没算到的行写\"—\"，注明算了几行", JSON.stringify({ spin: stopped.spin, dash: stopped.dash }));
  await card("scenes").locator('label:has-text("包括要训练的规则") input').uncheck(); await page.waitForTimeout(100);
  // 收起卡片时后台不再接着算
  await page.click("#btnScenes"); await page.waitForFunction(() => window.App.scn.busy, null, { timeout: 20000 });
  await page.evaluate(() => window.App.toggleChart("scenes")); await page.waitForTimeout(300);
  ok(await page.evaluate(() => !window.App.scn.busy), "收起\"场景对比\"时，正在跑的对比停下来");

  // ---- 4) 只有一条路径（真实数据）时算不出标准误：不标 ▲▼
  await setup({ world: "real", strat: "ma", resetS: true, scenes: "rule", charts: ["scenes"] }); await idle(); await scnDone();
  const real = await page.evaluate(() => { const c = document.querySelector('.card[data-chart="scenes"]'), row = c.querySelector(".hb-row.cur"); return { name: row.querySelector(".hb-n").textContent, mark: row.querySelectorAll(".verdict").length, tip: row.getAttribute("title"), foot: c.querySelector(".card-f").textContent, sum: document.getElementById("summary").innerText }; });
  ok(/真实数据/.test(real.name) && real.mark === 0 && /没有标准误/.test(real.tip) && /算不出标准误/.test(real.foot), "真实数据那一行不下显著与否的判断，脚注说明原因", JSON.stringify({ name: real.name, mark: real.mark }));
  ok(/无法与基准比较/.test(real.sum), "和结果栏的说法一致");
  // 带训练的规则和别的规则放在一张表里：全部改在同一段数据上跑
  await page.evaluate(() => { window.App.scenesSet("world"); window.App.state.copt.scenes.fit = true; window.App.rebuildControls("scenes"); window.App.refreshChart("scenes"); });
  await page.click("#btnScenes"); await page.waitForFunction(() => window.App.scn.busy, null, { timeout: 20000 }).catch(() => {}); await scnDone(400000);
  const al = await page.evaluate(() => ({ aligned: window.App.scn.aligned, T: Array.from(new Set(window.App.scn.rows.filter(r => r.res).map(r => r.res.sum.T))), bench: Array.from(new Set(window.App.scn.rows.filter(r => r.res).map(r => r.res.bench.growth.toFixed(10)))), n: window.App.scn.rows.length, err: window.App.scn.rows.filter(r => r.err).map(r => r.item.id + ":" + r.err), foot: document.querySelector('.card[data-chart="scenes"] .card-f').textContent }));
  ok(al.aligned === true && al.T.length === 1 && al.bench.length === 1 && al.n === 18 && al.err.length === 0 && /训练段的后一部分/.test(al.foot), "真实数据 × 全部十八条规则：同一段数据、同一个基准", JSON.stringify(al).slice(0, 300));
  await page.evaluate(() => { window.App.state.copt.scenes.fit = false; window.App.scenesSet("rule"); });

  // ---- 5) 基准行的认定：规则和参数都得和基准一样
  await setup({ world: "g_prop", std: true, resetW: true, strat: "prop_pace", resetS: true, scenes: "world", charts: ["scenes"] }); await idle(); await scnDone();
  const propRow = await page.evaluate(() => { const row = Array.from(document.querySelectorAll('.card[data-chart="scenes"] .hb-row')).find(r => r.querySelector(".hb-n").textContent === "固定仓位"); return { tag: row.querySelector(".tag") ? row.querySelector(".tag").textContent : "", val: row.querySelector(".hb-val").textContent }; });
  ok(propRow.tag === "" && /▲/.test(propRow.val), "自营考核：\"固定仓位\"默认是 2 倍，不是基准的 1 倍，不标成基准", JSON.stringify(propRow));
  await setup({ world: "g_lock", std: true, resetW: true, strat: "lock_thr", resetS: true, scenes: "world", charts: ["scenes"] }); await idle(); await scnDone();
  const lockRow = await page.evaluate(() => { const row = Array.from(document.querySelectorAll('.card[data-chart="scenes"] .hb-row')).find(r => r.querySelector(".hb-n").textContent === "见单就接"); return { tag: row.querySelector(".tag") ? row.querySelector(".tag").textContent : "", val: row.querySelector(".hb-val").textContent }; });
  ok(lockRow.tag === "基准" && /=/.test(lockRow.val), "接单与冷却：\"见单就接\"就是基准", JSON.stringify(lockRow));
  // 计分办法不同的场景不画在一根轴上
  await setup({ world: "g_sec", std: true, resetW: true, strat: "sec_cut", resetS: true, scenes: "rule", charts: ["scenes"] }); await idle(); await scnDone();
  const secCaps = await card("scenes").locator(".hb-cap").allInnerTexts();
  ok(secCaps.length === 2 && /选中全场最好者的概率/.test(secCaps[0]) && /名次得分/.test(secCaps[1]), "秘书问题 × 六个场景：两种计分分成两组", secCaps.join(" | ").slice(0, 160));

  // ---- 6) 对照表的一格：改过种子、成本和局数之后点过去，仍是表里那个数
  await setup({ world: "gbm", strat: "ma" }); await idle();
  await page.evaluate(() => { const A = window.App; A.state.world.seed = 11; A.state.world.N = 300; A.state.set.costBps = 20; A.renderWorld(); A.renderSettings(); A.worldChanged(true); }); await idle();
  await page.evaluate(() => window.App.openGuide("matrix")); await page.waitForTimeout(150); await page.waitForSelector("#mxDone", { timeout: 500000 }); await liveIdle(page);
  const want = await page.evaluate(() => { const M = window.App.matrix.price, t = document.querySelector(".gd-art table.mx"), ri = Array.from(t.querySelectorAll("tbody tr")).findIndex(tr => /均线交叉/.test(tr.querySelector("th").textContent)), ci = M.worlds.findIndex(w => w.key === "gbm"); t.querySelectorAll("tbody tr")[ri].querySelectorAll("td button")[ci].click(); return M.cells.ma[ci][1]; });
  await idle();
  const got = await page.evaluate(() => ({ dg: window.App.run.sum.dGrowth, seed: window.App.state.world.seed, N: window.App.state.world.N, cost: window.App.state.set.costBps, toast: (document.querySelector(".toast") || {}).textContent || "" }));
  ok(Math.abs(got.dg - want) < 5e-5 && got.seed === 7 && got.N === 2000 && got.cost === 5 && /对照表的设定/.test(got.toast), "同一个世界里改了种子、路径数和成本，再点对照表的一格：数字和表里一致", JSON.stringify(got) + " want " + want);
  await page.evaluate(() => { const A = window.App; A.setWorldType("g_sec"); A.state.world.N = 300; A.state.world.seed = 9; A.renderWorld(); A.worldChanged(true); }); await idle();
  await page.evaluate(() => window.App.openGuide("game:g_sec")); await page.waitForTimeout(150); await liveIdle(page);
  const gwant = await page.evaluate(() => { const M = window.App.matrix.games.g_sec, si = M.scenes.findIndex(s => /只有 10 人/.test(s.name)), t = document.querySelector(".gd-art table.mx"), ri = Array.from(t.querySelectorAll("tbody tr")).findIndex(tr => /先看后选/.test(tr.querySelector("th").textContent)); t.querySelectorAll("tbody tr")[ri].querySelectorAll("td button")[si].click(); return M.cells.sec_cut[si][0]; });
  await idle();
  const ggot = await page.evaluate(() => ({ sc: window.App.run.game.score, m: window.App.sp().m, n: window.App.wp().n }));
  ok(Math.abs(ggot.sc - gwant) < 2e-5 && ggot.n === 10 && ggot.m === 9, "玩法的对照表同样：秘书问题 \"只有 10 人\" × 先看后选", JSON.stringify(ggot) + " want " + gwant);

  // ---- 7) 小实验自带完整的设定；只跑一次，不先用旧规则白跑一遍
  await setup({ world: "bet", wp: { p: 0.5, b: 3 } }); await idle();
  await page.evaluate(() => window.App.openGuide("start:tour")); await page.waitForTimeout(100);
  await page.locator('.gd-tour > li >> nth=0 >> button:has-text("带我去")').click(); await idle();
  const t1 = await page.evaluate(() => ({ p: window.App.wp().p, b: window.App.wp().b, f: window.App.sp().f, seed: window.App.state.world.seed, fmax: window.App.state.set.fmax }));
  ok(t1.p === 0.6 && t1.b === 1 && t1.f === 0.2 && t1.seed === 7 && t1.fmax === 1, "第一个小实验：硬币的参数回到 60%、赔率 1", JSON.stringify(t1));
  await page.evaluate(() => window.App.openGuide("start:tour")); await page.locator('.gd-tour > li >> nth=2 >> button:has-text("带我去")').click(); await idle();
  ok(await page.evaluate(() => window.App.state.world.N === 100 && window.App.state.stratId === "ma"), "第三个小实验：路径数 100");
  await page.evaluate(() => { window.App.scenesSet("world"); });
  await page.evaluate(() => window.App.openGuide("start:tour")); await page.locator('.gd-tour > li >> nth=1 >> button:has-text("带我去")').click(); await idle(); await scnDone();
  const t2 = await page.evaluate(() => ({ N: window.App.state.world.N, mode: window.App.scn.mode, fmax: window.App.state.set.fmax, n: window.App.scn.rows.length }));
  ok(t2.N === 2000 && t2.mode === "rule" && t2.fmax === 3 && t2.n === 13, "第二个小实验：路径数回到 2000，场景对比是\"这条规则 × 各个场景\"", JSON.stringify(t2));
  await setup({ world: "ar1", strat: "pipe", resetS: true, sp: { model: "forest" } }); await idle();
  await page.evaluate(() => { window.__runs = []; window.App.on("run", () => window.__runs.push([window.App.runStratId, window.App.state.world.type, !!window.App.run.hasFit])); });
  await setup({ world: "fbm", std: true, resetW: true, strat: "ma", resetS: true }); await idle(); await page.waitForTimeout(400);
  const runs = await page.evaluate(() => window.__runs);
  ok(runs.length === 1 && runs[0][0] === "ma" && runs[0][1] === "fbm" && runs[0][2] === false, "从\"AR(1) + 随机森林\"跳到\"分数布朗运动 + 均线\"：只跑一次，没有先拿旧规则在新世界里训练一遍", JSON.stringify(runs));

  // ---- 8) 命令面板：操作排在前面；搜"说明"找得到查看代码
  await page.keyboard.press("Control+k"); await page.waitForSelector(".pal-in"); await page.waitForTimeout(80);
  const pal0 = await page.locator(".pal-item").allInnerTexts();
  ok(pal0.length > 20 && pal0.slice(0, 8).every(x => /^操作/.test(x)) && pal0.some(x => /恢复默认设置/.test(x)) && !pal0.some(x => /^手册/.test(x)), "命令面板一打开：八条操作在最前面，手册条目不挤进来", pal0.slice(0, 3).join(" | "));
  await page.fill(".pal-in", "说明"); await page.waitForTimeout(80);
  const pal1 = await page.locator(".pal-item").allInnerTexts(); ok(/查看当前规则的代码与说明/.test(pal1[0]) && pal1.length < 40, "搜\"说明\"：第一条是查看代码与说明", pal1.slice(0, 2).join(" | ") + " … " + pal1.length);
  await page.fill(".pal-in", "手册 名词"); await page.waitForTimeout(80); await page.keyboard.press("Enter"); await page.waitForSelector(".gd-title");
  ok((await page.locator(".gd-title").innerText()) === "名词", "命令面板里搜得到手册条目");

  // ---- 9) 手册：名词分组、怎么读结果栏、玩法页的"看得到什么"
  ok((await page.locator(".gd-art h3.gd-gh").count()) >= 8 && (await page.locator(".gd-art dl.gd-gloss dt").count()) >= 110, "名词分成几组，一百多条");
  await page.fill(".gd-filter", "做市"); await page.waitForTimeout(80);
  const gl = await page.locator(".gd-art dl.gd-gloss dt").allInnerTexts(); ok(gl.includes("做市商") && gl.length < 8 && (await page.locator(".gd-art h3.gd-gh").count()) <= gl.length, "名词可以筛：做市 → 做市商", gl.join(","));
  await page.evaluate(() => window.App.openGuide("start:read")); await page.waitForTimeout(100);
  const rd = await page.locator(".gd-art").innerText(); ok((await page.locator(".gd-title").innerText()) === "怎么读结果栏" && /红色的 ✕ 不是出错/.test(rd) && /平均仓位/.test(rd) && /换规则/.test(rd) && (await page.locator(".gd-art table").count()) === 2, "\"怎么读结果栏\"一页：三个大数、小字、标签");
  await page.evaluate(() => window.App.openGuide("game:g_sec")); await page.waitForTimeout(100);
  const gp = await page.locator(".gd-art").innerText(); ok(/你的规则看得到什么、能做什么/.test(gp) && /s\.rank/.test(gp) && /裁判不把分数交给规则/.test(gp) && /细则/.test(gp), "玩法页有\"看得到什么\"一节");
  await page.evaluate(() => window.App.openGuide("now")); await page.waitForTimeout(100);
  ok((await page.locator(".gd-title").innerText()) === "当前的细则" && /s\.sma\(n\)/.test(await page.locator(".gd-art").innerText()), "\"当前的细则\"里也列出规则读得到的东西");

  // ---- 10) 手册里看另一条规则的代码：只读，不换规则，Esc 回到手册
  const before = await page.evaluate(() => window.App.state.stratId);
  await page.evaluate(() => window.App.openGuide("strat:pipe")); await page.waitForTimeout(100);
  await page.locator('.gd-art button:has-text("代码与理论说明")').click(); await page.waitForSelector("#codeEdit", { state: "attached" });
  const ro = await page.evaluate(() => ({ modals: document.querySelectorAll("#overlays .modal").length, ro: document.getElementById("codeEdit").readOnly, cur: window.App.state.stratId, busy: !!window.App.isBusy }));
  ok(ro.modals === 2 && ro.ro === true && ro.cur === before, "\"代码与理论说明\"开在手册上面，只读，当前的规则没有变", JSON.stringify(ro));
  await page.keyboard.press("?"); await page.waitForTimeout(150);
  ok((await page.locator(".modal.guide").count()) === 1 && (await page.locator("#overlays .modal").count()) === 2, "上面盖着别的弹层时按 ?：手册不会在底下被悄悄关掉");
  await page.keyboard.press("Escape"); await page.waitForTimeout(150);
  ok((await page.locator(".modal.guide").count()) === 1 && (await page.locator("#overlays .modal").count()) === 1 && /预测模型流水线/.test(await page.locator(".gd-title").innerText()), "Esc 回到手册里原来那一页");
  // Tab 不离开弹层
  let outside = 0; for (let i = 0; i < 70; i++) { await page.keyboard.press("Tab"); if (!(await page.evaluate(() => { const b = document.querySelector(".guide-box"); return !!b && b.contains(document.activeElement); }))) outside++; }
  ok(outside === 0, "手册开着的时候，Tab 只在手册里转", String(outside));
  await page.keyboard.press("Escape"); await page.waitForTimeout(150);
  // 勾选框、滑块上按 ? 照样打开手册；文字输入框里不抢
  await page.evaluate(() => { if (window.App.shown().indexOf("dist") < 0) window.App.toggleChart("dist"); }); await page.waitForTimeout(150);
  const cb = card("dist").locator('input[type="checkbox"]').first(); await cb.focus(); await page.keyboard.press("?"); await page.waitForTimeout(150);
  ok((await page.locator(".modal.guide").count()) === 1, "焦点在勾选框上时 ? 照样调出手册"); await page.keyboard.press("Escape"); await page.waitForTimeout(120);

  // ---- 11) 每步用时：这一趟太短时不写"0 纳秒"
  await setup({ world: "gbm", std: true, resetW: true, N: 20, T: 10, strat: "hold", resetS: true }); await idle();
  const an = await page.locator("#algoNote").innerText(); ok(/每步决策(约 \d|不到 |太快)/.test(an) && !/约 0 纳秒/.test(an), "很短的回测：每步用时不写 0 纳秒", an.replace(/\n/g, " | "));

  ok(logs.length === 0, "整个过程没有报错", logs.join(" | ").slice(0, 400));

  // ---- 12) 恢复默认设置之后，后面的改动不再把旧设定写回去
  await page.keyboard.press("Control+k"); await page.fill(".pal-in", "恢复默认"); await page.waitForTimeout(80); await page.keyboard.press("Enter"); await page.waitForTimeout(150);
  await page.evaluate(() => { const A = window.App; A.state.world.seed = 123; A.renderWorld(); A.worldChanged(true); }); await idle(); await page.waitForTimeout(700);
  ok(await page.evaluate(() => localStorage.getItem("ql.lab.v1") === null), "恢复默认设置之后再动别的：存档没有被写回去");
  await t.close();

  // ---- 13) 存档里有坏记录：页面照常打开，手册和命令面板照常能用
  const bad = { v: 1, world: { type: "gbm", N: 2000, T: 252, K: 252, seed: 7, dsId: "sample-goog" }, stratId: "x2", wparams: { gbm: "oops" }, sparams: { ma: 3 }, copt: { __flags: "oops", scenes: "rule", dist: true },
    my: [{ id: "x1", code: "function decide(s) { return 1; }", game: "g_nope", name: "坏玩法的规则" }, { id: "x2", code: "function decide(s) { return 0.5; }" }, { id: "x3" }, null] };
  t = await open({ viewport: { width: 1280, height: 900 }, init: INIT + ";try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ql.lab.v1', " + JSON.stringify(JSON.stringify(bad)) + "); sessionStorage.setItem('seeded', '1'); } } catch (e) {}" }); page = t.page; logs = t.logs;
  await page.waitForSelector(".crit .big", { timeout: 20000 }); await page.waitForFunction(() => !window.App.isBusy, null, { timeout: 60000 });
  const st = await page.evaluate(() => ({ my: window.App.my.map(m => m.id + ":" + m.name), s: window.App.state.stratId, flags: typeof window.App.state.copt.__flags }));
  ok(st.my.length === 1 && st.my[0] === "x2:未命名的规则" && st.s === "x2", "坏记录被滤掉：玩法不存在的规则丢弃，没名字的补一个名字", JSON.stringify(st));
  await page.click("#btnGuide"); await page.waitForSelector(".gd-title"); ok((await page.locator(".gd-title").innerText()) === "这是什么", "手册照常打开");
  await page.evaluate(() => window.App.openGuide("strat:x2")); await page.waitForTimeout(100); ok(/未命名的规则/.test(await page.locator(".gd-title").innerText()), "自己写的规则在手册里也有一页");
  await page.keyboard.press("Escape"); await page.keyboard.press("Control+k"); await page.waitForSelector(".pal-in"); ok((await page.locator(".pal-item").count()) > 20, "命令面板照常打开"); await page.keyboard.press("Escape");
  await page.evaluate(() => window.App.toggleChart("scenes", true)); await page.waitForTimeout(200);
  await page.locator('.card[data-chart="scenes"] .seg button:has-text("这个场景 × 各条规则")').click(); await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.App.state.copt.scenes && window.App.state.copt.scenes.mode === "world"), "图表的选项存成了别的东西也不碍事");
  ok(logs.length === 0, "坏存档下没有报错", logs.join(" | ").slice(0, 400));
  await t.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error("TEST CRASHED:", e.message.split("\n").slice(0, 8).join("\n")); process.exit(1); });
