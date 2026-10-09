// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 走一遍主要功能，收集报错并截图
const path = require("path"), { open, pickWorld, liveIdle } = require("./ui-smoke.js");
const SH = n => path.join(__dirname, "../shots/" + n);
const arg = process.argv[2] || "all";
(async () => {
  const t = await open({ viewport: { width: 1440, height: 900 } }); const { page, logs } = t;
  const step = async (name, fn) => { const n0 = logs.length; try { await fn(); } catch (e) { console.log("STEP FAILED:", name, "-", e.message.split("\n")[0]); } if (logs.length > n0) console.log("  logs after", name, ":\n   " + logs.slice(n0).join("\n   ")); };
  const scrollRes = y => page.evaluate(v => { document.getElementById("paneRes").scrollTop = v; }, y);
  await page.waitForSelector(".crit .big", { timeout: 15000 }); await page.waitForTimeout(1200);
  await step("close claude, wide view", async () => { await page.click("#btnClaude"); await page.waitForTimeout(500); await page.screenshot({ path: SH("02-wide.png") }); await scrollRes(520); await page.waitForTimeout(300); await page.screenshot({ path: SH("03-wide-scrolled.png") }); await scrollRes(0); });
  await step("drag f to 2", async () => { await page.fill("#s-f", "2"); await page.dispatchEvent("#s-f", "change"); await page.waitForTimeout(900); console.log("  f=2 summary:", (await page.locator(".crit").innerText()).replace(/\n+/g, " | ").slice(0, 300)); });
  await step("oos", async () => { await page.click("#btnOos"); await page.waitForSelector(".oos-vals", { timeout: 8000 }); console.log("  oos:", (await page.locator("#oosBox").innerText()).replace(/\n+/g, " ").slice(0, 260)); });
  await step("all charts on", async () => { for (const name of ["最大回撤分布", "单步收益分布", "自相关", "参数扫描", "终值与回撤"]) await page.click(`.shelf .chip:has-text("${name}")`); await page.waitForTimeout(800); });
  await step("sweep 1d", async () => { await page.click('.card[data-chart="sweep"] button:has-text("开始扫描")'); await page.waitForSelector('.card[data-chart="sweep"] button:has-text("采用最优参数")', { timeout: 30000 }); console.log("  sweep foot:", (await page.locator('.card[data-chart="sweep"] .card-f').innerText()).slice(0, 200)); });
  await step("screens of all cards", async () => { const cards = await page.locator(".card").all(); let i = 0; for (const c of cards) { await c.scrollIntoViewIfNeeded(); await page.waitForTimeout(150); await c.screenshot({ path: SH(`card-${String(i).padStart(2, "0")}.png`) }); i++; } });
  await step("strategy: meanrev on OU + 2d sweep", async () => {
    await pickWorld(page, "ou"); await page.waitForTimeout(700); await page.selectOption("#stratSel", "meanrev"); await page.waitForTimeout(900);
    console.log("  OU/meanrev:", (await page.locator(".crit").innerText()).replace(/\n+/g, " | ").slice(0, 240));
    const card = page.locator('.card[data-chart="sweep"]'); await card.locator("select").nth(0).selectOption("entry"); await card.locator("select").nth(1).selectOption("n");
    await card.locator('button:has-text("开始扫描")').click(); await card.locator('button:has-text("采用最优参数")').waitFor({ timeout: 60000 }); await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await card.screenshot({ path: SH("sweep-2d.png") });
    console.log("  2d foot:", (await card.locator(".card-f").innerText()).slice(0, 220));
  });
  await step("each world x a rule", async () => {
    for (const w of ["iid", "bet", "jump", "heston", "garch", "regime", "ar1", "fbm", "logistic", "lorenz", "osc", "real", "boot", "gbm"]) {
      await pickWorld(page, w); await page.waitForTimeout(650);
      const txt = await page.locator("#summary").innerText(); const bad = /运行出错|代码无法运行/.test(txt);
      console.log(`  world ${w}: ${bad ? "ERROR " + txt.slice(0, 200) : (txt.match(/长期增长率 g[\s\S]*?每[年局]/) || [""])[0].replace(/\n+/g, " ").slice(0, 90)}  | ${await page.locator("#topWorld").innerText()}`);
    }
  });
  await step("each rule on gbm", async () => { const ids = await page.locator("#stratSel option").evaluateAll(os => os.map(o => o.value)); for (const id of ids) { await page.selectOption("#stratSel", id); await page.waitForTimeout(450); const txt = await page.locator("#summary").innerText(); if (/运行出错|代码无法运行/.test(txt)) console.log("  rule", id, "ERROR", txt.slice(0, 200)); } console.log("  rules ok:", ids.join(",")); });
  await step("code modal", async () => { await page.selectOption("#stratSel", "oukelly"); await page.waitForTimeout(400); await page.click('#blkStrat button:has-text("代码与说明")'); await page.waitForSelector(".modal-box .katex", { timeout: 5000 }); await page.screenshot({ path: SH("04-modal-explain.png") }); await page.click('.modal-box .seg button:has-text("代码")'); await page.waitForTimeout(200); await page.screenshot({ path: SH("05-modal-code.png") }); await page.keyboard.press("Escape"); });
  await step("palette", async () => { await page.keyboard.press("Control+k"); await page.waitForSelector(".pal-in"); await page.keyboard.type("回撤"); await page.waitForTimeout(150); await page.screenshot({ path: SH("06-palette.png") }); await page.keyboard.press("Escape"); });
  await step("import modal", async () => { await pickWorld(page, "real"); await page.waitForTimeout(500); await page.click('#blkWorld button:has-text("导入数据")'); await page.waitForSelector(".drop"); await page.screenshot({ path: SH("07-import.png") }); await page.keyboard.press("Escape"); });
  console.log("TOTAL LOGS:", logs.length); if (logs.length) console.log(logs.join("\n"));
  await t.close();
})();
