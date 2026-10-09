// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
const path = require("path"), fs = require("fs"), { open, pickWorld, liveIdle } = require("./ui-smoke.js");
const SH = n => path.join(__dirname, "../shots/" + n);
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) pass++; else { fail++; console.log("  FAIL", name, d || ""); } };
(async () => {
  const t = await open({ viewport: { width: 1440, height: 900 }, init: fs.readFileSync(path.join(__dirname, "mock-claude.js"), "utf8") }); const { page, logs } = t;
  const idle = () => page.waitForFunction(() => !window.App.isBusy, null, { timeout: 30000 });
  const sendMsg = async txt => { await page.fill("#aiInput", txt); await page.click("#aiSend"); };
  await page.waitForSelector(".crit .big", { timeout: 15000 }); await idle();
  ok(await page.locator("#aiOff").isHidden(), "Claude 面板可用");
  ok(await page.locator("#aiDeepWrap").isVisible(), "深度模式开关出现（支持工具时）");
  // 1) 写策略
  await sendMsg("对数最优的固定比例是多少"); await page.waitForSelector('.msg-a button:has-text("验证它的最优性声明")', { timeout: 20000 }); await idle();
  const cur = await page.inputValue("#stratSel"); ok(/^my-/.test(cur), "生成的策略被设为当前规则", cur);
  ok((await page.locator("#blkStrat").innerText()).includes("Kelly 固定比例"), "左栏显示新规则");
  ok(await page.inputValue("#s-f") === "2.00", "参数取了 Claude 给的默认值", await page.inputValue("#s-f"));
  ok(await page.locator(".msg-a .katex").count() > 3, "解释里的公式被渲染");
  ok((await page.locator(".msg-a").last().innerText()).includes("试运行"), "显示试运行结果");
  const c0 = await page.evaluate(() => window.__calls[0]); ok(c0.tier === "complex" && typeof c0.input === "string" && c0.input.includes("几何布朗运动") && c0.input.includes("f* = 2"), "提示词带上了当前世界和理论值");
  await page.screenshot({ path: SH("10-claude-strategy.png") });
  // 2) 验证声明
  await page.click('.msg-a button:has-text("验证它的最优性声明")'); await page.waitForSelector(".msg-a .verdict", { timeout: 60000 });
  const vtxt = await page.locator(".msg-a").last().innerText(); ok(/与声明一致|与声明有出入/.test(vtxt), "给出检验结论"); console.log("  verdict:", vtxt.split("\n").filter(l => /声明/.test(l)).pop().slice(0, 200));
  ok(await page.locator('.card[data-chart="sweep"]').count() === 1, "扫描图被打开");
  // 2b) 真实数据的世界：生成不了新路径，不给 ✓ / ✕，也不去碰样本外那一段
  await pickWorld(page, "real"); await idle(); await page.waitForTimeout(300);
  const oos0 = await page.evaluate(() => window.App.oosCount);
  await page.locator('.msg-a button:has-text("验证它的最优性声明")').last().click(); await page.waitForFunction(() => /这里没法检验|检验没有完成|扫描没有完成/.test([...document.querySelectorAll(".msg-a")].pop().innerText), null, { timeout: 60000 });
  const rtxt0 = await page.locator(".msg-a").last().innerText(); ok(/这里没法检验/.test(rtxt0) && /只在训练段上扫了一遍/.test(rtxt0) && !/✓|✕/.test(rtxt0.split("这里没法检验")[1] || ""), "真实数据：不下结论，只报告训练段上的峰值", rtxt0.split("\n").filter(l => /没法检验/.test(l))[0]);
  ok(await page.evaluate(() => window.App.oosCount) === oos0 && !(await page.evaluate(() => !!window.App.oos)), "真实数据：检验声明不会偷看样本外");
  await pickWorld(page, "gbm"); await idle();
  // 3) 语法错误 → 修复
  await page.evaluate(() => { window.__mock.broken = 1; }); await sendMsg("写一个坏的"); await page.waitForSelector('.msg-a button:has-text("让 Claude 修复")', { timeout: 20000 });
  const etxt = await page.locator(".msg-a").last().innerText(); ok(/没有跑通/.test(etxt) && /第 \d+ 行/.test(etxt), "语法错误带行号", etxt.split("\n").filter(l => /没有跑通/.test(l))[0]);
  await page.click('.msg-a button:has-text("让 Claude 修复")'); await page.waitForFunction(() => document.querySelectorAll('.msg-a button').length && [...document.querySelectorAll(".msg-a")].pop().innerText.includes("已设为当前规则"), null, { timeout: 30000 }); await idle();
  const cfix = await page.evaluate(() => window.__calls[window.__calls.length - 1].input); ok(cfix.includes("# 需要修复") && cfix.includes("+* 1"), "修复请求带上了出错的代码和错误信息");
  // 4) 运行时错误
  await page.evaluate(() => { window.__mock.runtime = 1; }); await sendMsg("写一个运行时会错的"); await page.waitForSelector('.msg-a:last-child button:has-text("让 Claude 修复")', { timeout: 20000 });
  const rtxt = await page.locator(".msg-a").last().innerText(); ok(/undefinedThing/.test(rtxt) && /策略代码第 \d+ 行/.test(rtxt), "运行时错误带行号", rtxt.split("\n").filter(l => /没有跑通/.test(l))[0]);
  // 5) 深度模式：工具被调用
  await page.check("#aiDeep"); await sendMsg("深度模式试一下"); await page.waitForFunction(() => [...document.querySelectorAll(".msg-a")].pop().innerText.includes("已设为当前规则"), null, { timeout: 30000 }); await idle();
  const tr = await page.evaluate(() => window.__mock.toolResults); ok(tr.length === 1 && tr[0].ok === true && Math.abs(tr[0].growth - 0.075) < 0.02, "回测工具返回了结果", JSON.stringify(tr[0]).slice(0, 200)); console.log("  tool result:", JSON.stringify(tr[0]).slice(0, 260));
  await page.uncheck("#aiDeep");
  // 5b) 带训练的规则：fit + 诊断 + 哪些参数要重新训练
  await page.evaluate(() => { window.__mock.model = 1; }); await sendMsg("用岭回归预测下一步收益"); await page.waitForFunction(() => [...document.querySelectorAll(".msg-a")].pop().innerText.includes("已设为当前规则"), null, { timeout: 30000 }); await idle();
  const mi = await page.evaluate(() => { const A = window.App, st = A.strat(); return { fitKeys: st.fitKeys, diag: !!(A.run && A.run.diag), r2: A.run && A.run.diag ? A.run.diag.r2Valid : null, note: document.getElementById("fitNote").innerText, cards: A.state.charts.slice(), prompt: window.__calls[window.__calls.length - 1].input }; });
  ok(JSON.stringify(mi.fitKeys) === '["lags","lambda"]', "Claude 标出的训练参数被记下", JSON.stringify(mi.fitKeys));
  ok(mi.diag && mi.r2 < 0.01 && /岭回归系数已拟合/.test(mi.note), "Claude 写的模型规则能训练并给出诊断", `R² ${mi.r2}; ${mi.note}`);
  ok(mi.cards.indexOf("mdlfn") >= 0 && mi.cards.indexOf("mdl") >= 0, "诊断图被调出", mi.cards.join(","));
  ok(mi.prompt.includes("模型库") && mi.prompt.includes("ml.diagnose") && mi.prompt.includes('"fit": true'), "提示词带上了模型库的接口");
  const before = await page.evaluate(() => window.App.fitMs); await page.fill("#s-shrink", "0.8"); await page.dispatchEvent("#s-shrink", "change"); await idle();
  ok(await page.evaluate(() => window.App.run.sum.growth === window.App.run.sum.growth), "改只影响仓位的参数后能重跑");
  await page.screenshot({ path: SH("13-claude-model.png") });
  // 6) 造世界
  await page.click('#aiModes button:has-text("造世界")'); await sendMsg("周五可能跳空的市场"); await page.waitForFunction(() => [...document.querySelectorAll(".msg-a")].pop().innerText.includes("设为当前世界"), null, { timeout: 30000 }); await idle();
  ok(await page.inputValue("#worldType") === "custom", "自定义世界成为当前世界"); ok((await page.locator("#topWorld").innerText()).includes("周五跳空") && (await page.locator("#topWorld").innerText()).includes("400 条 × 200 步"), "世界标题与规模", await page.locator("#topWorld").innerText());
  ok(await page.locator("#w-pj").count() === 1, "自定义世界的参数出现在左栏");
  await page.fill("#w-pj", "0.5"); await page.dispatchEvent("#w-pj", "change"); await idle(); ok(!(await page.locator("#summary").innerText()).includes("出错"), "改自定义世界的参数后能重跑");
  await page.screenshot({ path: SH("11-claude-world.png") });
  await page.evaluate(() => { window.__mock.badWorld = 1; }); await sendMsg("坏的世界"); await page.waitForSelector('.msg-a:last-child button:has-text("让 Claude 修复")', { timeout: 20000 }); await idle();
  const wtxt = await page.locator(".msg-a").last().innerText(); ok(/长度为 T\+1/.test(wtxt), "采样函数返回值不对时给出说明", wtxt.split("\n").filter(l => /没有跑通/.test(l))[0]);
  ok(await page.inputValue("#worldType") === "custom" && (await page.locator("#topWorld").innerText()).includes("周五跳空"), "坏世界被撤回，仍用上一个能跑的世界", await page.locator("#topWorld").innerText());
  // 7) 调图表
  await page.click('#aiModes button:has-text("调图表")'); await sendMsg("给我看最大回撤的分布"); await page.waitForFunction(() => [...document.querySelectorAll(".msg-a")].pop().innerText.includes("已显示"), null, { timeout: 20000 });
  ok(await page.locator('.card[data-chart="dd"]').count() === 1 && await page.locator('.card[data-chart="scatter"]').count() === 1, "图表被调出");
  // 8) 问结果
  await page.click('#aiModes button:has-text("问结果")'); await sendMsg("为什么夏普不随杠杆变化？"); await page.waitForFunction(() => [...document.querySelectorAll(".msg-a")].pop().querySelector(".katex-display"), null, { timeout: 20000 });
  const ask = await page.evaluate(() => window.__calls[window.__calls.length - 1]); ok(Array.isArray(ask.input) && ask.input[0].content.includes("当前结果") && ask.input[ask.input.length - 1].role === "user", "问答带上了当前结果，且以用户消息结尾");
  // 9) 停止
  await page.click('#aiModes button:has-text("写策略")'); await page.evaluate(() => { window.__mock.delay = 400; }); await sendMsg("慢慢写"); await page.waitForSelector("#aiStop:not([hidden])"); await page.waitForTimeout(500); await page.click("#aiStop");
  await page.waitForFunction(() => [...document.querySelectorAll(".msg-a")].pop().innerText.includes("已停止"), null, { timeout: 8000 }); ok(await page.locator("#aiSend").isVisible(), "停止后可以继续发送");
  // 10) 出错
  await page.evaluate(() => { window.__mock.delay = 15; window.__mock.failWith = "rate_limited"; }); await sendMsg("限流"); await page.waitForFunction(() => [...document.querySelectorAll(".msg-a")].pop().innerText.includes("用量上限"), null, { timeout: 8000 }); ok(true, "限流提示");
  await page.evaluate(() => { window.__mock.failWith = "not_granted"; }); await sendMsg("拒绝授权"); await page.waitForSelector("#aiOff:not([hidden])", { timeout: 8000 }); ok(await page.locator("#aiSend").isDisabled(), "未授权后面板停用");
  await page.screenshot({ path: SH("12-claude-end.png") });
  console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", logs.length ? "\n" + logs.join("\n") : "none");
  await t.close(); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error("TEST CRASHED:", e.message.split("\n").slice(0, 4).join("\n")); process.exit(1); });
