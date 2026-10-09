// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 十套玩法在界面里：切过去、换规则、看结果栏和图表、再切回价格世界
const path = require("path"), fs = require("fs"), { open, pickWorld, liveIdle } = require("./ui-smoke.js");
const SH = n => path.join(__dirname, "../shots/" + n);
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) pass++; else { fail++; console.log("  FAIL", name, d || ""); } };
(async () => {
  const t = await open({ viewport: { width: 1440, height: 1000 }, init: fs.readFileSync(path.join(__dirname, "mock-claude.js"), "utf8") }); const { page, logs } = t;
  const idle = async () => { await page.waitForTimeout(150); await page.waitForFunction(() => !window.App.isBusy, null, { timeout: 60000 }); await page.waitForTimeout(120); };
  const card = id => page.locator(`.card[data-chart="${id}"]`);
  await page.waitForSelector(".crit .big"); await idle();
  // 0) 价格世界照旧
  const groups = await page.locator("#gameType optgroup").evaluateAll(g => g.map(x => x.label + ":" + x.children.length));
  ok(groups.join() === "交易:1,十套玩法:10,观测玩法:4", "玩法的下拉框：交易一个资产、十套玩法、四套观测玩法", groups.join(","));
  const wopts = await page.locator("#worldType option").evaluateAll(o => o.map(x => x.value));
  ok(wopts.length >= 15 && wopts.every(v => !/^(g|o)_/.test(v)) && (await page.inputValue("#gameType")) === "trade", "世界的下拉框里只剩价格世界", wopts.join(","));
  ok((await page.locator("#stratSel option").count()) === 18, "价格世界里只列价格世界的规则", String(await page.locator("#stratSel option").count()));
  const chips0 = await page.locator("#shelf .chip").allInnerTexts();
  ok(chips0.includes("杠杆曲线") && chips0.includes("模型诊断"), "价格世界的图表架照旧", chips0.join(","));

  // 1) 接单与冷却
  await pickWorld(page, "g_lock"); await idle();
  ok((await page.locator(".gsum .gscore .big").count()) === 1, "结果栏换成了玩法的得分");
  const sum = await page.locator("#summary").innerText();
  ok(/平均每回合收益/.test(sum) && /见单就接/.test(sum) && /事后诸葛亮/.test(sum) && /理论最优/.test(sum), "结果栏里有得分的名字、基准、上界和理论值", sum.replace(/\n+/g, " | ").slice(0, 200));
  const score = await page.evaluate(() => window.App.run.game.score); ok(Math.abs(score - 0.134) < 0.004, "默认规则（固定门槛 2.01）的得分约 0.134", String(score));
  ok(/≈ 达到了理论最优|▲ 高于理论值/.test(sum), "判词：达到理论最优", (sum.match(/[≈▲▼][^|\n]*理论[^|\n]*/) || [""])[0]);
  const opts = await page.locator("#stratSel option").allInnerTexts(); ok(opts.length === 4 && opts.includes("固定门槛") && !opts.includes("均线交叉"), "规则列表换成这套玩法自己的", opts.join(","));
  ok(await page.locator("#blkSet").isHidden(), "玩法里不显示\"交易设定\"");
  ok((await page.locator("#wT").count()) === 0 && (await page.locator("#w-T").count()) === 1 && (await page.locator("#w-L").inputValue()) === "15", "回合数和锁定长度是玩法自己的参数");
  const chips = await page.locator("#shelf .chip").allInnerTexts(); ok(!chips.includes("杠杆曲线") && !chips.includes("模型诊断") && chips.includes("累计收益怎么走") && chips.includes("各局得分的分布") && chips.includes("报价的分布") && chips.includes("单局明细"), "图表架只列用得上的图，名字跟着玩法换", chips.join(","));
  const cards = await page.locator(".card h3").allInnerTexts(); ok(cards.join() === "累计收益怎么走,各局得分的分布,单局明细,参数扫描", "默认显示四张图", cards.join(","));
  await page.waitForFunction(() => window.App.single.data && window.App.single.data.game, null, { timeout: 20000 }); await page.waitForTimeout(300);
  await page.screenshot({ path: SH("g-lock.png"), fullPage: false });
  const top = await page.locator("#topWorld").innerText(); ok(/接单与冷却 · 指数分布 · 400 局 × 2000 回合/.test(top), "顶栏写着玩法、世界、局数和回合数", top);
  // 扫描门槛：理论曲线叠在上面
  await card("sweep").locator('button:has-text("开始扫描")').click(); await page.waitForFunction(() => window.App.sweep.res && !window.App.sweep.busy, null, { timeout: 120000 }); await page.waitForTimeout(300);
  const swLegend = await card("sweep").locator(".qc-legend").innerText(), swFoot = await card("sweep").locator(".card-f").innerText();
  ok(/理论 ρ\(c\)/.test(swLegend) && /最优点：门槛 c = (1\.[6-9]\d*|2(\.[0-4]\d*)?)，/.test(swFoot) && /绿色的宽带是理论曲线/.test(swFoot), "参数扫描：峰值在 c* 附近，叠着理论曲线", swFoot.slice(0, 80));
  await card("sweep").scrollIntoViewIfNeeded(); await card("sweep").screenshot({ path: SH("g-lock-sweep.png") });
  await card("single").scrollIntoViewIfNeeded(); await card("single").screenshot({ path: SH("g-lock-single.png") });
  // 换成见单就接：得分降到基准，判词变红
  await page.selectOption("#stratSel", "lock_any"); await idle();
  const s2 = await page.locator("#summary").innerText(); ok(/= 逐局相同/.test(s2) && /▼ 离理论最优/.test(s2), "换成见单就接：与基准逐局相同，离理论最优有差距", (s2.match(/▼[^|\n]*/) || [""])[0]);
  ok(/这条规则没有可以扫描的数值参数/.test(await card("sweep").innerText()), "没有参数的规则：扫描图给出说明而不是报错");
  // 带训练的规则
  await page.selectOption("#stratSel", "lock_dp"); await idle();
  const fn = await page.locator("#fitNote").innerText(); ok(/另外生成的 400 局/.test(fn) && /倒推出的门槛/.test(fn), "动态规划：说明它在另一批对局上估的分布", fn.replace(/\n/g, " ").slice(0, 80));
  // 新的一批
  await page.click("#btnOos"); await page.waitForSelector(".oos-vals", { timeout: 30000 }); const oos = await page.locator("#oosBox").innerText(); ok(/新的一批 #1/.test(oos) && /得分 0\.13/.test(oos) && /相对基准 \+0\.07/.test(oos), "用新的一批对局检验", oos.replace(/\n/g, " "));
  // 加入对比
  await page.selectOption("#stratSel", "lock_thr"); await idle(); await page.click('#blkStrat button:has-text("加入对比")'); await page.waitForTimeout(200);
  await page.selectOption("#stratSel", "lock_any"); await idle(); await page.click('#blkStrat button:has-text("加入对比")');
  await page.waitForFunction(() => { const r = window.App.cmp.rows, p = window.App.pins(); return p.length === 2 && p.every(c => r[c.id] && r[c.id].game); }, null, { timeout: 30000 }); await page.waitForTimeout(300);
  const cmpT = await card("compare").innerText(); ok(/固定门槛/.test(cmpT) && /见单就接/.test(cmpT) && /−0\.07/.test(cmpT) && /比第 1 条高出多少/.test(cmpT), "多策略对比：按得分比，给出配对差", cmpT.replace(/\n+/g, " | ").slice(-140));
  await card("compare").scrollIntoViewIfNeeded(); await card("compare").screenshot({ path: SH("g-lock-compare.png") });

  // 2) 逐个过一遍其余九套
  const want = { g_sec: /选中全场最好者的概率/, g_coin: /平均到手金额/, g_bold: /到达目标的概率/, g_bandit: /平均每回合得分/, g_news: /平均每天的利润/, g_curse: /平均每次收购的盈亏/, g_prop: /通过率/, g_ashare: /长期增长率/, g_exec: /风险调整后的成本/ };
  for (const k of Object.keys(want)) {
    await pickWorld(page, k); await idle();
    const txt = await page.locator("#summary").innerText(), g = await page.evaluate(() => { const r = window.App.run; return r && r.game ? { score: r.game.score, refs: r.game.refs.length, err: r.game.refs.filter(x => x.err).length, strat: window.App.state.stratId, cards: Object.keys(window.App.CH).filter(id => document.querySelector('.card[data-chart="' + id + '"]')).length } : null; });
    ok(g && isFinite(g.score) && g.refs >= 2 && g.err === 0 && want[k].test(txt) && !(await page.locator("#summary .warn.err").count()), `${k}：结果栏正常`, g ? JSON.stringify(g) : txt.slice(0, 120));
    await page.waitForFunction(() => window.App.single.data && window.App.single.data.game, null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(350);
    const msgs = await page.locator(".card .qc-msg:visible").allInnerTexts(); ok(msgs.filter(m => /画不出来|出错/.test(m)).length === 0, `${k}：图都画得出来`, msgs.join(" | "));
    await page.screenshot({ path: SH("g-" + k.slice(2) + ".png") });
  }
  // A 股制度：三种口径 + 对照
  await pickWorld(page, "g_ashare"); await idle();
  ok((await page.locator(".crit .big").count()) === 3 && (await page.locator(".gref").count()) === 1 && /改成 T\+0、不设涨跌停/.test(await page.locator(".gref").innerText()) && !(await page.locator("#blkSet").isHidden()), "A 股制度：三种口径照旧，另加\"换一套规则\"的对照，保留风险上限");
  const stN = await page.locator("#stratSel option").count(); ok(stN === 21, "A 股制度：自己的 3 条规则 + 价格世界的 18 条", String(stN));
  await page.selectOption("#stratSel", "ma"); await idle(); ok(await page.evaluate(() => isFinite(window.App.run.game.score)) && /均线交叉/.test(await page.locator("#sumMeta").innerText()), "价格世界的规则直接能在 A 股制度里用");
  const chipsA = await page.locator("#shelf .chip").allInnerTexts(); ok(chipsA.includes("价格路径") && chipsA.includes("最大回撤分布") && chipsA.includes("自相关") && !chipsA.includes("杠杆曲线"), "A 股制度的图表架", chipsA.join(","));
  // 自营考核：扫描杠杆，叠理论曲线
  await pickWorld(page, "g_prop"); await idle();
  ok((await page.evaluate(() => window.App.state.stratId)) === "ma", "换到自营考核：均线交叉在这里也能用，就不换规则");
  await pickWorld(page, "g_coin"); await idle(); ok((await page.evaluate(() => window.App.state.stratId)) === "coin_frac", "换到偏硬币：均线交叉用不了，换回这套玩法上次用的规则");
  // 大单执行：成本越低越好
  await pickWorld(page, "g_exec"); await idle();
  const ex = await page.locator("#summary").innerText(); ok(/成本（越低越好）/.test(ex) && /1\.7\d/.test(ex) && /它的成本/.test(ex), "大单执行：结果栏按成本写", ex.replace(/\n+/g, " | ").slice(0, 160));
  await card("sweep").locator('button:has-text("开始扫描")').click(); await page.waitForFunction(() => window.App.sweep.res && !window.App.sweep.busy, null, { timeout: 120000 }); await page.waitForTimeout(300);
  const exF = await card("sweep").locator(".card-f").innerText(); ok(/最优点：风险厌恶 λ = 0\.[2-9]/.test(exF) && /成本 1\.7/.test(exF), "扫描规则的 λ：成本最低的点在裁判的 λ 附近", exF.slice(0, 70));
  await card("sweep").scrollIntoViewIfNeeded(); await card("sweep").screenshot({ path: SH("g-exec-sweep.png") });

  // 3) 回到价格世界：一切复原
  await pickWorld(page, "gbm"); await idle();
  ok((await page.locator(".crit .big").count()) === 3 && (await page.locator(".gsum").count()) === 0 && (await page.locator("#stratSel option").count()) === 18 && !(await page.locator("#blkSet").isHidden()), "回到 GBM：三种口径、规则列表、交易设定都回来了");
  const st = await page.evaluate(() => window.App.state.stratId); ok(st === "const", "规则换回价格世界上次用的那条", st);
  const cards2 = await page.locator(".card h3").allInnerTexts(); ok(cards2.includes("净值扇形图") && cards2.includes("杠杆曲线"), "图表架换回价格世界的那一组", cards2.join(","));
  const cmp2 = await page.evaluate(() => window.App.pins().length); ok(cmp2 === 0, "玩法里钉的对比不带到价格世界");
  // 刷新后还在玩法里
  await pickWorld(page, "g_bandit"); await idle(); await page.selectOption("#stratSel", "ban_ts"); await idle(); await page.waitForTimeout(600);
  await page.reload(); await page.waitForSelector(".gsum .big", { timeout: 20000 }); await idle();
  ok((await page.evaluate(() => window.App.state.world.type + "/" + window.App.state.stratId)) === "g_bandit/ban_ts", "刷新页面后停在原来的玩法和规则上");
  console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", logs.length ? "\n" + logs.join("\n") : "none");
  await t.close(); process.exitCode = fail || logs.length ? 1 : 0;
})().catch(e => { console.error("TEST CRASHED:", e.message.split("\n").slice(0, 6).join("\n")); process.exit(1); });
