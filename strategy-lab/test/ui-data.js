// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
const path = require("path"), fs = require("fs"), os = require("os"), { open, pickWorld, liveIdle } = require("./ui-smoke.js");
const SH = n => path.join(__dirname, "../shots/" + n);
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) pass++; else { fail++; console.log("  FAIL", name, d || ""); } };
(async () => {
  const t = await open({ viewport: { width: 1440, height: 900 } }); const { page, logs } = t;
  const idle = async () => { await page.waitForFunction(() => !window.App.isBusy, null, { timeout: 30000 }); await page.waitForTimeout(120); };
  const sum = async () => (await page.locator("#summary").innerText()).replace(/\n+/g, " | ");
  await page.waitForSelector(".crit .big"); await idle(); await page.click("#btnClaude");
  // 下注游戏：理论曲线与模拟
  await pickWorld(page, "bet"); await idle(); await page.waitForFunction(() => window.App.lev.res && !window.App.lev.busy, null, { timeout: 30000 }); await page.waitForTimeout(400);
  let lev = await page.evaluate(() => { const L = window.App.lev, th = window.App.QL.WORLDS.bet.theory(window.App.wp()); return { xs: L.xs, g: Array.from(L.res.growth), se: Array.from(L.res.growthSE), th: L.xs.map(f => th.gOfF(f)), fStar: th.fStar, mode: L.mode }; });
  let worst = 0; lev.xs.forEach((f, i) => { if (isFinite(lev.g[i]) && isFinite(lev.th[i]) && lev.se[i] > 0 && f < 0.9) worst = Math.max(worst, Math.abs(lev.g[i] - lev.th[i]) / lev.se[i]); });
  ok(lev.mode === "f" && Math.abs(lev.fStar - 0.2) < 1e-9 && worst < 3.5, "下注游戏：模拟的 g(f) 与 Kelly 公式吻合", `最大偏离 ${worst.toFixed(2)} 个标准误`); console.log("  bet: max |sim − theory| =", worst.toFixed(2), "SE; summary:", (await sum()).slice(0, 150));
  ok((await page.locator("#blkSet").innerText()).includes("每次最多押上的比例（上限）"), "下注游戏的设定里写明这是押注的上限");
  await page.locator('.card[data-chart="lev"]').screenshot({ path: SH("lev-bet.png") });
  // 两点分布
  await pickWorld(page, "iid"); await idle(); await page.selectOption("#w-dist", "twopoint"); await idle(); await page.waitForTimeout(700); await page.waitForFunction(() => window.App.lev.res && !window.App.lev.busy); await page.waitForTimeout(300);
  ok((await page.locator("#blkWorld").innerText()).includes("上涨概率 q") && !(await page.locator("#blkWorld").innerText()).includes("自由度"), "分布切换后只显示相关参数");
  ok(!(await page.locator("#blkSet").innerText()).includes("单局") && await page.inputValue("#set-fmax") === "3.00", "离开下注游戏后恢复仓位上下限", await page.inputValue("#set-fmax"));
  await page.locator('.card[data-chart="lev"]').screenshot({ path: SH("lev-twopoint.png") });
  for (const d of ["t", "laplace", "uniform", "mixture", "skewL", "skewR", "cauchy", "normal"]) { await page.selectOption("#w-dist", d); await idle(); const s = await sum(); ok(!/出错/.test(s), "经典分布 " + d); }
  // 真实数据
  await pickWorld(page, "real"); await idle(); await page.waitForTimeout(500);
  let s = await sum(); ok(/只有一条历史路径/.test(s) && /揭晓样本外/.test(s), "真实数据：单条路径的提示与样本外按钮"); console.log("  real:", s.slice(0, 200));
  await page.click("#btnOos"); await page.waitForSelector(".oos-vals"); await page.click("#btnOos"); await page.waitForTimeout(600); s = await sum(); ok(/已经看了 2 次/.test(s), "真实数据：记录看样本外的次数");
  await page.selectOption("#w-mode", "windows"); await idle(); await page.waitForTimeout(400); s = await sum(); ok(/\d+ 条 × 252 步/.test(s), "滚动窗口", s.slice(0, 90));
  await page.locator('.card[data-chart="paths"]').screenshot({ path: SH("paths-real-windows.png") });
  await page.selectOption("#w-mode", "whole"); await idle(); await page.waitForTimeout(300); await page.locator('.card[data-chart="paths"]').screenshot({ path: SH("paths-real.png") });
  await pickWorld(page, "boot"); await idle(); s = await sum(); ok(/2000 条 × 252 步/.test(s) && !/出错/.test(s), "bootstrap 世界", s.slice(0, 120));
  // 导入 CSV（倒序、带 $、美式日期）
  const tmp = path.join(os.tmpdir(), "spy_test.csv"); const rows = ["Date,Close/Last,Volume,Open,High,Low"]; let px = 500, d = new Date(Date.UTC(2026, 9, 2)); const lines = [];
  for (let i = 0; i < 600; i++) { while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d - 864e5); lines.push(`${("0" + (d.getUTCMonth() + 1)).slice(-2)}/${("0" + d.getUTCDate()).slice(-2)}/${d.getUTCFullYear()},$${px.toFixed(2)},1000000,$${px.toFixed(2)},$${(px + 1).toFixed(2)},$${(px - 1).toFixed(2)}`); px *= Math.exp(-0.0004 + 0.01 * Math.sin(i * 1.7) + 0.004 * Math.cos(i * 0.31)); d = new Date(d - 864e5); }
  fs.writeFileSync(tmp, rows.concat(lines).join("\n"));
  await pickWorld(page, "real"); await idle(); await page.click('#blkWorld button:has-text("导入数据")'); await page.setInputFiles("#impFile", tmp); await page.waitForSelector("#impName");
  const info = await page.locator(".modal-box .note", { hasText: "识别到" }).first().innerText(); ok(/识别到 600 个点/.test(info), "导入：识别点数与日期", info); ok(await page.inputValue("#impK") === "261" || await page.inputValue("#impK") === "252", "导入：推断每年步数", await page.inputValue("#impK"));
  await page.screenshot({ path: SH("08-import-preview.png") });
  await page.click('.modal-box button:has-text("导入并使用")'); await idle(); await page.waitForTimeout(400);
  ok((await page.locator("#topWorld").innerText()).includes("spy_test"), "导入后成为当前数据", await page.locator("#topWorld").innerText());
  // 粘贴一列"物理信号"
  await page.click('#blkWorld button:has-text("导入数据")'); await page.click('.drop button:has-text("粘贴文本")'); const sig = Array.from({ length: 400 }, (_, i) => (Math.sin(i / 9) * 40 + 50 + 7 * Math.cos(i * 2.3)).toFixed(2)).join("\n");
  await page.fill(".modal-box textarea", sig); await page.click('.modal-box button:has-text("解析")'); await page.waitForSelector("#impMode"); await page.selectOption("#impMode", "signal"); await page.fill("#impName", "正弦信号"); await page.fill("#impK", "12"); await page.click('.modal-box button:has-text("导入并使用")'); await idle();
  ok((await page.locator("#topWorld").innerText()).includes("正弦信号") && !/出错/.test(await sum()), "一般信号可以导入并回测", await page.locator("#topWorld").innerText());
  // 刷新后还在（本机存储）
  await page.waitForTimeout(700); await page.reload(); await page.waitForSelector(".crit .big"); await idle(); ok((await page.locator("#topWorld").innerText()).includes("正弦信号"), "刷新后保留导入的数据和当前设置", await page.locator("#topWorld").innerText());
  // 表格视图、加入对比
  await pickWorld(page, "gbm"); await idle(); await page.click('.card[data-chart="equity"] button:has-text("表格")'); ok(await page.locator('.card[data-chart="equity"] table.data tr').count() > 10, "表格视图有数据");
  await page.click('#blkStrat button:has-text("加入对比")'); await page.selectOption("#stratSel", "voltarget"); await idle(); await page.click('#blkStrat button:has-text("加入对比")'); await page.waitForFunction(() => document.querySelectorAll('.card[data-chart="compare"] tbody tr').length === 2 && !document.querySelector('.card[data-chart="compare"] tbody').innerText.includes("…"), null, { timeout: 30000 });
  const cmp = await page.locator('.card[data-chart="compare"] tbody').innerText(); ok(/参照/.test(cmp) && /±/.test(cmp), "对比表有配对差"); console.log("  compare:", cmp.replace(/\n+/g, " | ").slice(0, 260));
  await page.locator('.card[data-chart="compare"]').scrollIntoViewIfNeeded(); await page.locator('.card[data-chart="compare"]').screenshot({ path: SH("compare.png") });
  console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", logs.length ? "\n" + logs.join("\n") : "none");
  await t.close(); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error("TEST CRASHED:", e.message.split("\n").slice(0, 4).join("\n")); process.exit(1); });
