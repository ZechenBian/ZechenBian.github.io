// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 手册、场景对比、算法实测：能不能调出来，每一条能不能显示，跳转对不对，数字和页面对不对得上
const path = require("path"), fs = require("fs"), { open, pickWorld, liveIdle, saveLive } = require("./ui-smoke.js");
const SH = n => path.join(__dirname, "../shots/" + n);
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) pass++; else { fail++; console.log("  FAIL", name, d || ""); } };
(async () => {
  const t = await open({ viewport: { width: 1440, height: 1000 }, seedLive: true, init: fs.readFileSync(path.join(__dirname, "mock-claude.js"), "utf8") }); const { page, logs } = t;
  const idle = async () => { await page.waitForTimeout(150); await page.waitForFunction(() => !window.App.isBusy, null, { timeout: 90000 }); await page.waitForTimeout(120); };
  const card = id => page.locator(`.card[data-chart="${id}"]`);
  const guideOpen = () => page.locator(".modal.guide").count();
  await page.waitForSelector(".crit .big"); await idle();

  // 1) 入口：顶栏按钮、第一次来的提示、? 键、Esc
  ok((await page.locator("#btnGuide").count()) === 1 && /手册/.test(await page.locator("#btnGuide").innerText()), "顶栏有\"手册\"按钮");
  ok((await page.locator("#guideHint").count()) === 1, "第一次来有一条提示");
  ok((await guideOpen()) === 0, "手册平时是收起的");
  await page.click("#btnGuide"); await page.waitForSelector(".modal.guide .gd-title");
  ok((await page.locator(".gd-title").innerText()) === "这是什么", "第一次打开落在\"这是什么\"", await page.locator(".gd-title").innerText());
  ok((await page.locator("#guideHint").count()) === 0, "打开过手册之后提示消失");
  const groups = await page.locator(".gd-nav h4").allInnerTexts(); ok(groups.join() === "从这里开始,当前,玩法,十套玩法,观测玩法,世界,规则,图表,对照", "目录的九个部分", groups.join());
  const nlinks = await page.locator(".gd-nav .gd-link").count(); ok(nlinks >= 8 + 1 + 2 + 10 + 4 + 16 + 18 + 16 + 4, "目录里的条目数", String(nlinks));
  ok((await page.locator('.gd-nav .gd-link:has-text("总览：玩法、世界、规则")').count()) === 1 && (await page.locator('.gd-nav .gd-link:has-text("交易一个资产")').count()) === 1 && (await page.locator('.gd-nav .gd-link:has-text("自检")').count()) === 1, "目录里有总览、交易一个资产、自检");
  await page.screenshot({ path: SH("h-open.png") });
  await page.keyboard.press("Escape"); await page.waitForTimeout(150); ok((await guideOpen()) === 0, "Esc 收起手册");
  await page.keyboard.press("?"); await page.waitForTimeout(200); ok((await guideOpen()) === 1, "? 键调出手册");
  await page.keyboard.press("?"); await page.waitForTimeout(200); ok((await guideOpen()) === 0, "再按 ? 收起");
  await page.locator("#w-mu").focus(); await page.keyboard.press("?"); await page.waitForTimeout(150); ok((await guideOpen()) === 0, "光标在输入框里时 ? 不抢");
  await page.locator("#w-mu").blur();

  // 2) 每一条都能显示：没有报错、有标题、有内容、公式都排好了
  const keys = await page.evaluate(() => { window.App.openGuide("start:what"); return Array.from(new Set(window.App.guideCommands().map((c, i) => i))).length; });
  const all = await page.evaluate(async () => {
    const A = window.App, out = [], QL = A.QL, G = window.QL_GUIDE, list = [];
    G.start.forEach(s => list.push("start:" + s.id)); list.push("now", "games", "game:trade", "matrix", "algos", "selfcheck", "glossary");
    Object.keys(QL.WORLDS).forEach(t => list.push((QL.WORLDS[t].game ? "game:" : "world:") + t));
    A.allStrats().forEach(s => list.push("strat:" + s.id)); Object.keys(A.CH).forEach(id => list.push("chart:" + id));
    for (const k of list) {
      A.openGuide(k); await new Promise(r => setTimeout(r, 0));
      const art = document.querySelector(".gd-art"), title = art.querySelector(".gd-title");
      out.push({ k, title: title ? title.textContent : "", len: art.textContent.length, err: art.querySelectorAll(".warn.err").length, tex: art.querySelectorAll(".tex:not(.done)").length, kerr: art.querySelectorAll(".katex-error").length, secs: art.querySelectorAll(".gd-sec").length, wide: art.scrollWidth - art.clientWidth });
    }
    return out;
  });
  ok(all.length >= 110, "条目总数", String(all.length));
  const bad = all.filter(x => x.err || !x.title || x.len < 150 || x.tex || x.kerr); ok(bad.length === 0, "每一条都显示得出来，公式都排好了", JSON.stringify(bad.slice(0, 6)));
  const thin = all.filter(x => /^(world|strat|chart|game):/.test(x.k) && x.secs < 3); ok(thin.length === 0, "世界、规则、图表、玩法的条目都至少有三节", thin.map(x => x.k).join(","));
  const overflow = all.filter(x => x.wide > 2); ok(overflow.length === 0, "正文不横向溢出（宽表在自己的容器里滚动）", overflow.map(x => x.k + ":" + x.wide).join(","));
  const noScene = all.filter(x => /^strat:/.test(x.k) && x.len < 300); ok(noScene.length === 0, "每条规则都有成段的说明", noScene.map(x => x.k + ":" + x.len).join(","));

  // 3) 小问号直接落在对应的条目上
  await page.keyboard.press("Escape"); await page.waitForTimeout(100);
  await page.click("#blkWorld .helpbtn"); await page.waitForSelector(".gd-title"); ok(/几何布朗运动/.test(await page.locator(".gd-title").innerText()) && /它从哪来/.test(await page.locator(".gd-art").innerText()), "世界旁的小问号 → 这个世界的条目", await page.locator(".gd-title").innerText());
  ok((await page.locator('.gd-link[aria-current="true"]').innerText()) === "GBM", "目录里高亮当前的条目");
  const wtxt = await page.locator(".gd-art").innerText(); ok(/Samuelson/.test(wtxt) && /什么时候用它/.test(wtxt) && /各条规则在这里的成绩/.test(wtxt) && /可以试试/.test(wtxt), "世界条目：来历、何时用、成绩、可以试试");
  await liveIdle(page);
  ok((await page.locator(".gd-art .hb-row").count()) === 17, "世界条目里有各条规则的成绩条（现算）", String(await page.locator(".gd-art .hb-row").count()));
  ok(/不当价格，当作研究对象/.test(await page.locator(".gd-art").innerText()) && (await page.locator('.gd-art .gd-acts button:has-text("测漂移")').count()) === 1, "世界条目里有「不当价格，当作研究对象」和去观测玩法的按钮");
  await page.keyboard.press("Escape");
  await page.click("#blkStrat .helpbtn"); await page.waitForSelector(".gd-title"); const stxt = await page.locator(".gd-art").innerText();
  ok(/固定比例/.test(await page.locator(".gd-title").innerText()) && /适合的场景/.test(stxt) && /不适合的场景/.test(stxt) && /算法的基础信息/.test(stxt) && /在各个世界里的成绩/.test(stxt) && /最优性/.test(stxt), "规则旁的小问号 → 这条规则的条目（场景、算法、成绩、理论）");
  ok(/每一步的计算\s*O\(1\)/.test(stxt) && /在这台设备上实测\s*每步约/.test(stxt), "规则条目里有复杂度和实测", (stxt.match(/每一步的计算[^\n]*\n?[^\n]*/) || [""])[0]);
  await page.keyboard.press("Escape");
  await card("equity").locator(".helpbtn").click(); await page.waitForSelector(".gd-title"); const ctxt = await page.locator(".gd-art").innerText();
  ok((await page.locator(".gd-title").innerText()) === "净值扇形图" && /它回答什么问题/.test(ctxt) && /怎么读/.test(ctxt) && /什么时候用/.test(ctxt) && /容易读错的地方/.test(ctxt), "图表上的小问号 → 这张图的条目（问题、读法、场景、误区）");
  await page.keyboard.press("Escape");
  await page.click("#summary .helpbtn"); await page.waitForSelector(".gd-title"); ok(/三种口径/.test(await page.locator(".gd-title").innerText()), "结果栏的小问号 → 三种口径");
  ok((await page.locator(".gd-art figure.gd-fig svg").count()) >= 1 && (await page.locator(".gd-art .katex").count()) > 5, "三种口径一页有插图和公式");
  await page.locator(".gd-art").screenshot({ path: SH("h-criteria.png") });

  // 4) 搜索
  await page.fill(".gd-search", "Kelly"); await page.waitForTimeout(150);
  const res = await page.locator(".gd-nav .gd-link").allInnerTexts(); ok(res.length >= 4 && res.some(x => /三种口径/.test(x)) && res.some(x => /偏硬币下注/.test(x)), "搜索 Kelly：找到三种口径、偏硬币下注等", res.slice(0, 8).join(" | "));
  await page.fill(".gd-search", "探索 利用"); await page.waitForTimeout(150); await page.locator(".gd-search").press("Enter"); await page.waitForTimeout(150);
  const hit = await page.locator(".gd-title").innerText(); ok(/老虎机|置信上界|Thompson|名词|ε|贪心|先试后定/.test(hit), "搜索后回车打开第一条", hit);
  await page.fill(".gd-search", ""); await page.waitForTimeout(100);

  // 5) 五个小实验："带我去"
  await page.evaluate(() => window.App.openGuide("start:tour")); await page.waitForTimeout(100);
  ok((await page.locator(".gd-tour > li").count()) === 5, "五个小实验");
  await page.locator(".gd-art").screenshot({ path: SH("h-tour.png") });
  await page.locator('.gd-tour > li >> nth=0 >> button:has-text("带我去")').click(); await idle(); await page.waitForTimeout(300);
  const s1 = await page.evaluate(() => ({ w: window.App.state.world.type, s: window.App.state.stratId, f: window.App.sp().f, charts: window.App.shown().join(), open: document.querySelectorAll(".modal.guide").length }));
  ok(s1.w === "bet" && s1.s === "const" && s1.f === 0.2 && /lev/.test(s1.charts) && s1.open === 0, "第一个实验：下注游戏、固定比例 0.2、杠杆曲线，手册自动收起", JSON.stringify(s1));
  await page.evaluate(() => window.App.openGuide("start:tour")); await page.locator('.gd-tour > li >> nth=1 >> button:has-text("带我去")').click(); await idle();
  const s2 = await page.evaluate(() => ({ w: window.App.state.world.type, s: window.App.state.stratId, charts: window.App.shown().join() })); ok(s2.w === "gbm" && s2.s === "stop" && /scenes/.test(s2.charts), "第二个实验：GBM + 止损 + 场景对比", JSON.stringify(s2));
  ok(/▼ 低于基准/.test(await page.locator("#summary").innerText()), "GBM 里止损显著低于基准");

  // 6) 场景对比：这条规则 × 各个世界
  await page.waitForFunction(() => window.App.scn.rows && !window.App.scn.busy, null, { timeout: 120000 }); await page.waitForTimeout(200);
  const sc = await page.evaluate(() => window.App.scn.rows.map(r => ({ n: r.item.name, cur: !!r.item.cur, dg: r.res ? r.res.sum.dGrowth : null, se: r.res ? r.res.sum.dGrowthSE : null, err: r.err })));
  ok(sc.length === 13 && sc.every(r => !r.err && r.dg != null), "场景对比：十三个世界都跑完了", JSON.stringify(sc.filter(r => r.err || r.dg == null)));
  const gbmRow = sc.find(r => r.cur), mainDg = await page.evaluate(() => window.App.run.sum.dGrowth); ok(gbmRow && /GBM/.test(gbmRow.n) && Math.abs(gbmRow.dg - mainDg) < 1e-12, "当前世界那一行和结果栏里的数完全一致", gbmRow ? gbmRow.dg + " vs " + mainDg : "");
  const reg = sc.find(r => /牛熊/.test(r.n)); ok(reg && reg.dg > 2 * reg.se && gbmRow.dg < -2 * gbmRow.se, "止损：GBM 里显著为负，牛熊切换里显著为正", reg ? reg.dg + " ± " + reg.se : "");
  await page.evaluate(() => window.App.live.need({ strat: "stop" })); await liveIdle(page);
  const mxv = await page.evaluate(() => { const M = window.App.matrix.price, i = M.worlds.findIndex(w => w.key === "regime"); return M.cells.stop[i][1]; }); ok(Math.abs(mxv - reg.dg) < 5e-5, "场景对比的数与对照表里的那一格一致", mxv + " vs " + reg.dg);
  const sct = await card("scenes").innerText(); ok(/止损与再入场」在各个场景里/.test(sct) && /当前/.test(sct) && /▲/.test(sct) && /▼/.test(sct) && /规则的参数没有按场景重新调过/.test(sct), "场景对比的条形表：标题、当前标记、显著记号、脚注");
  await card("scenes").scrollIntoViewIfNeeded(); await card("scenes").screenshot({ path: SH("h-scenes-rule.png") });
  // 点行尾的箭头：切到那个世界，规则不变
  await card("scenes").locator('.hb-row:has-text("牛熊切换") .hb-go').click(); await idle();
  const s3 = await page.evaluate(() => ({ w: window.App.state.world.type, s: window.App.state.stratId, dg: window.App.run.sum.dGrowth })); ok(s3.w === "regime" && s3.s === "stop" && Math.abs(s3.dg - reg.dg) < 1e-12, "点箭头切到牛熊切换，结果栏里是同一个数", JSON.stringify(s3));
  ok(/▲ 高于基准/.test(await page.locator("#summary").innerText()), "牛熊切换里止损显著高于基准");
  // 这个世界 × 各条规则
  await page.waitForFunction(() => window.App.scn.rows && !window.App.scn.busy, null, { timeout: 120000 });
  await card("scenes").locator('.seg button:has-text("这个场景 × 各条规则")').click(); await page.waitForFunction(() => window.App.scn.mode === "world" && window.App.scn.rows && !window.App.scn.busy, null, { timeout: 180000 }); await page.waitForTimeout(200);
  const sw = await page.evaluate(() => window.App.scn.rows.map(r => ({ n: r.item.name, id: r.item.st.id, dg: r.res ? r.res.sum.dGrowth : null, err: r.err })));
  ok(sw.length === 14 && sw.every(r => !r.err) && !sw.some(r => ["pipe", "hmm", "kalman", "qlearn"].includes(r.id)), "这个世界 × 各条规则：默认只跑不用训练的十四条", sw.map(r => r.id).join(","));
  const order = await card("scenes").locator(".hb-row .hb-n").allInnerTexts(); ok(order[0] === "波动率目标" && order.indexOf("止损与再入场") < order.indexOf("买入持有"), "按成绩排好：牛熊切换里波动率目标居首", order.slice(0, 5).join(" > "));
  await card("scenes").scrollIntoViewIfNeeded(); await card("scenes").screenshot({ path: SH("h-scenes-world.png") });

  // 7) 规则下面的"算法"一行
  const algo = await page.locator("#algoNote").innerText(); ok(/计算量\s*每步 O\(1\)/.test(algo) && /实测\s*每步决策约 \d+(\.\d+)? (纳秒|微秒)/.test(algo) && /自带状态 2 个数/.test(algo), "规则下面有计算量和实测的一行", algo.replace(/\n/g, " | "));
  await page.locator("#algoNote .helpbtn").click(); await page.waitForSelector(".gd-title"); ok(/算法对比/.test(await page.locator(".gd-title").innerText()), "那一行的小问号 → 算法对比");
  const atxt = await page.locator(".gd-art").innerText(); ok(/价格世界的十八条规则/.test(atxt) && /十种模型/.test(atxt) && /十套玩法的内置规则/.test(atxt) && /四套观测玩法的内置规则/.test(atxt) && /O\(n·d² \+ d³\)/.test(atxt) && /O\(T·G²\)/.test(atxt) && /O\(2ʰ\) 个节点/.test(atxt), "算法对比：四张表和记号");
  ok((await page.locator(".gd-art table.gd-t").nth(3).locator("tbody tr").count()) === 23, "四套观测玩法的二十三条内置规则，每一条都有计算量和存储", String(await page.locator(".gd-art table.gd-t").nth(3).locator("tbody tr").count()));
  ok((await page.locator(".gd-art table.gd-t").nth(2).locator("tbody tr").count()) === 44, "十套玩法的四十四条内置规则，每一条都有计算量和存储", String(await page.locator(".gd-art table.gd-t").nth(2).locator("tbody tr").count()));
  ok((await page.locator(".gd-art table.gd-t").count()) === 4 && (await page.locator(".gd-art table.gd-t >> nth=0 >> tbody tr").count()) === 18 && (await page.locator(".gd-art table.gd-t >> nth=1 >> tbody tr").count()) === 10, "表的行数：18 条规则、10 种模型");
  await page.locator(".gd-art").screenshot({ path: SH("h-algos.png") });

  // 8) 对照表：点一格，页面摆成那个样子，数字一致
  await page.evaluate(() => window.App.openGuide("matrix")); await page.waitForTimeout(150);
  ok(/在你的电脑上现算的/.test(await page.locator(".gd-art").innerText()), "对照表一页写明数字是现算的");
  await page.waitForSelector("#mxDone", { timeout: 500000 }); await liveIdle(page);
  ok(/全部 \d+ 格都算好了/.test(await page.locator("#mxDone").innerText()) && (await page.locator(".gd-art td.pend").count()) === 0, "对照表算完了，没有还在等的格子", await page.locator("#mxDone").innerText());
  await saveLive(page);
  const dims = await page.evaluate(() => { const t = document.querySelector(".gd-art table.mx"); return { rows: t.querySelectorAll("tbody tr").length, cols: t.querySelectorAll("thead tr:first-child th").length - 1, tables: document.querySelectorAll(".gd-art table.mx").length, up: t.querySelectorAll("td.up").length, down: t.querySelectorAll("td.down").length }; });
  ok(dims.rows === 16 && dims.cols === 15 && dims.tables === 15 && dims.up > 30 && dims.down > 100, "对照表：16 条规则 × 15 个世界，外加十四套玩法各一张", JSON.stringify(dims));
  await page.locator(".gd-art").screenshot({ path: SH("h-matrix.png") });
  const cellTxt = await page.evaluate(() => { const M = window.App.matrix.price, t = document.querySelector(".gd-art table.mx"), ri = Array.from(t.querySelectorAll("tbody tr")).findIndex(tr => /均线交叉/.test(tr.querySelector("th").textContent)), ci = M.worlds.findIndex(w => w.key === "fbm"); const b = t.querySelectorAll("tbody tr")[ri].querySelectorAll("td button")[ci]; const txt = b.textContent; b.click(); return { txt, want: M.cells.ma[ci][1] }; });
  await idle(); const s4 = await page.evaluate(() => ({ w: window.App.state.world.type, s: window.App.state.stratId, dg: window.App.run.sum.dGrowth, open: document.querySelectorAll(".modal.guide").length }));
  ok(s4.w === "fbm" && s4.s === "ma" && s4.open === 0 && Math.abs(s4.dg - cellTxt.want) < 5e-5, "点\"均线交叉 × 分数布朗运动\"那一格：页面上是同一个数", JSON.stringify(s4) + " cell " + JSON.stringify(cellTxt));

  // 9) 十套玩法：规则带着当前的数字
  await pickWorld(page, "g_lock"); await idle();
  await page.click("#btnRules"); await page.waitForSelector(".gd-title"); const gt = await page.locator(".gd-art").innerText();
  ok(/接单与冷却/.test(await page.locator(".gd-title").innerText()) && /随后的 15 个回合你被锁住/.test(gt) && /Lambert/.test(gt) && /Lippman/.test(gt) && /内置的规则/.test(gt) && /各条规则在各个场景下的成绩/.test(gt) && /可以试试/.test(gt), "\"完整的规则与来历\" → 玩法的条目：规则、结论、出处、内置规则、成绩表");
  ok((await page.locator(".gd-art ol.gd-rules li").count()) === 7 && (await page.locator(".gd-art .gd-card").count()) === 4 && (await page.locator(".gd-art table.mx tbody tr").count()) === 4, "七条规则、四条内置规则的卡片、成绩表四行");
  await page.locator(".gd-art").screenshot({ path: SH("h-game.png") });
  await page.keyboard.press("Escape"); await page.fill("#w-L", "30"); await page.locator("#w-L").dispatchEvent("change"); await idle();
  await page.evaluate(() => window.App.openGuide("now")); await page.waitForTimeout(100); const nt = await page.locator(".gd-art").innerText();
  ok(/当前的细则/.test(await page.locator(".gd-title").innerText()) && /随后的 30 个回合你被锁住/.test(nt) && /得分是平均每回合收益/.test(nt) && /基准：见单就接/.test(nt) && /事后诸葛亮/.test(nt), "\"当前的细则\"跟着左栏的设定变（锁 30 回合）", (nt.match(/随后的[^。]*。/) || [""])[0]);
  // 玩法里的场景对比
  await page.keyboard.press("Escape"); await page.fill("#w-L", "15"); await page.locator("#w-L").dispatchEvent("change"); await idle();
  await page.evaluate(() => { window.App.state.copt.scenes = { mode: "rule" }; window.App.toggleChart("scenes", true); });
  await page.waitForFunction(() => window.App.scn.rows && !window.App.scn.busy && window.App.scn.game, null, { timeout: 180000 }); await page.waitForTimeout(200);
  const gs = await page.evaluate(() => window.App.scn.rows.map(r => ({ n: r.item.name, cur: !!r.item.cur, sc: r.res ? r.res.game.score : null, err: r.err })));
  ok(gs.length === 7 && gs.every(r => !r.err) && gs[0].cur && Math.abs(gs[1].sc) < 1e-9, "接单与冷却 × 七个场景：门槛 2.01 放到均匀分布里一单也接不到", JSON.stringify(gs.map(r => [r.n, r.sc && +r.sc.toFixed(4)])));
  const mg = await page.evaluate(() => window.App.matrix.games.g_lock.cells.lock_thr.map(c => c[0])); ok(gs.every((r, i) => Math.abs(r.sc - mg[i]) < 2e-5), "与玩法对照表里的那一行一致", JSON.stringify(mg));
  await card("scenes").scrollIntoViewIfNeeded(); await card("scenes").screenshot({ path: SH("h-scenes-game.png") });
  await card("scenes").locator('.seg button:has-text("这个场景 × 各条规则")').click(); await page.waitForFunction(() => window.App.scn.mode === "world" && window.App.scn.rows && !window.App.scn.busy, null, { timeout: 180000 });
  const gw = await card("scenes").locator(".hb-row .hb-n").allInnerTexts(); ok(gw.length === 3 && gw[gw.length - 1] === "见单就接", "这套玩法 × 各条规则（不带训练的三条）：见单就接垫底", gw.join(" > "));

  // 10) 模型对比里的用时与大小
  await pickWorld(page, "ar1"); await idle(); await page.selectOption("#stratSel", "pipe"); await idle();
  const an2 = await page.locator("#algoNote").innerText(); ok(/模型 \d+ 个数，训练用了/.test(an2), "带训练的规则：模型大小和训练用时", an2.replace(/\n/g, " | "));
  await page.evaluate(() => { if (window.App.shown().indexOf("mdlcmp") < 0) window.App.toggleChart("mdlcmp", true); }); await page.waitForTimeout(200);
  await card("mdlcmp").locator('button:has-text("开始对比")').click(); await page.waitForFunction(() => window.App.arena.res && !window.App.arena.busy, null, { timeout: 300000 }); await page.waitForTimeout(300);
  const mt = await card("mdlcmp").locator("table.data").innerText(); ok(/训练用时/.test(mt) && /预测一次/.test(mt) && /存了多少/.test(mt) && /O\(n·d² \+ d³\)/.test(mt) && /k 近邻/.test(mt), "模型对比：图下有用时、大小和复杂度的表");
  const sizes = await page.evaluate(() => Array.from(window.App.arena.res.size)); ok(sizes[1] === 4 && sizes[5] > 5000 && sizes[9] > 20 && sizes.every(v => v > 0), "十种模型各存了多少个数（线性回归 4 个，k 近邻上万）", sizes.join(","));
  await card("mdlcmp").scrollIntoViewIfNeeded(); await card("mdlcmp").screenshot({ path: SH("h-mdlcmp.png") });

  // 11) 命令面板里能找到手册的条目
  await page.keyboard.press("Control+k"); await page.fill(".pal-in", "手册 秘书"); await page.waitForTimeout(100);
  const pal = await page.locator(".pal-item").allInnerTexts(); ok(pal.some(x => /手册/.test(x) && /秘书问题/.test(x)), "命令面板里能搜到手册的条目", pal.slice(0, 4).join(" | "));
  await page.keyboard.press("Enter"); await page.waitForSelector(".gd-title"); ok(/秘书/.test(await page.locator(".gd-title").innerText()), "从命令面板打开手册的条目");
  await page.keyboard.press("Escape");

  // 12) 刷新后：提示不再出现，手册回到上次那一条
  await page.waitForTimeout(600); await page.reload(); await page.waitForSelector(".crit .big", { timeout: 20000 }); await idle();
  ok((await page.locator("#guideHint").count()) === 0, "看过手册之后，刷新不再提示");
  await page.click("#btnGuide"); await page.waitForSelector(".gd-title"); ok(/秘书/.test(await page.locator(".gd-title").innerText()), "再打开时回到上次看的那一条", await page.locator(".gd-title").innerText());
  console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", logs.length ? "\n" + logs.join("\n") : "none");
  await t.close(); process.exitCode = fail || logs.length ? 1 : 0;
})().catch(e => { console.error("TEST CRASHED:", e.message.split("\n").slice(0, 8).join("\n")); process.exit(1); });
