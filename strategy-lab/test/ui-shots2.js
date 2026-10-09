// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
const path = require("path"), { open, pickWorld, liveIdle } = require("./ui-smoke.js");
const SH = n => path.join(__dirname, "../shots/" + n);
(async () => {
  const t = await open({ viewport: { width: 1440, height: 900 } }); const { page, logs } = t;
  const idle = async () => { await page.waitForFunction(() => !window.App.isBusy, null, { timeout: 30000 }); await page.waitForTimeout(150); };
  await page.waitForSelector(".crit .big"); await idle(); await page.click("#btnClaude");
  await pickWorld(page, "garch"); await idle();
  for (const name of ["单步收益分布", "自相关", "参数扫描"]) await page.click(`.shelf .chip:has-text("${name}")`);
  await page.selectOption("#stratSel", "ma"); await idle();
  const card = page.locator('.card[data-chart="sweep"]'); await card.locator("select").nth(0).selectOption("fast"); await card.locator("select").nth(1).selectOption("slow"); await card.locator('button:has-text("开始扫描")').click(); await card.locator('button:has-text("采用最优参数")').waitFor({ timeout: 90000 });
  await page.check('.card[data-chart="retdist"] input[type=checkbox]'); await page.waitForTimeout(300);
  for (const id of ["retdist", "acf", "sweep"]) { const c = page.locator(`.card[data-chart="${id}"]`); await c.scrollIntoViewIfNeeded(); await page.waitForTimeout(150); await c.screenshot({ path: SH(`c2-${id}.png`) }); }
  await page.click("#worldKnown summary"); await page.waitForTimeout(200); await page.locator("#blkWorld").screenshot({ path: SH("c2-world.png") });
  if (logs.length) console.log(logs.join("\n")); await t.close();
})().catch(e => { console.error("CRASH", e.message.split("\n").slice(0, 3).join("\n")); process.exit(1); });
