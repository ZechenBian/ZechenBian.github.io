// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
const path = require("path"), fs = require("fs"), { open, pickWorld, liveIdle } = require("./ui-smoke.js");
const SH = n => path.join(__dirname, "../shots/" + n);
(async () => {
  for (const cfg of [{ name: "phone", viewport: { width: 390, height: 780 }, dpr: 2 }, { name: "tablet", viewport: { width: 900, height: 800 } }, { name: "dark", viewport: { width: 1440, height: 900 }, dark: true }, { name: "phone-dark", viewport: { width: 390, height: 780 }, dpr: 2, dark: true }]) {
    const t = await open({ viewport: cfg.viewport, dpr: cfg.dpr, dark: cfg.dark, init: fs.readFileSync(path.join(__dirname, "mock-claude.js"), "utf8") }); const { page, logs } = t;
    await page.waitForSelector(".crit .big", { timeout: 15000 }); await page.waitForFunction(() => !window.App.isBusy); await page.waitForTimeout(900);
    // 页面本身不应横向滚动
    const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, wide: [...document.querySelectorAll("#app *")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1 && getComputedStyle(e).position !== "fixed" && e.offsetParent !== null; }).slice(0, 6).map(e => e.tagName + "." + String(e.className).slice(0, 30) + " right=" + Math.round(e.getBoundingClientRect().right)) }));
    console.log(cfg.name, "scrollWidth", over.sw, "clientWidth", over.cw, over.wide.length ? "OVERFLOWING: " + over.wide.join(" | ") : "no overflow");
    await page.screenshot({ path: SH(`r-${cfg.name}-1.png`) });
    if (cfg.name.startsWith("phone")) {
      await page.click('#tabs button[data-tab="ctl"]'); await page.waitForTimeout(250); await page.screenshot({ path: SH(`r-${cfg.name}-2-ctl.png`) });
      const o2 = await page.evaluate(() => [...document.querySelectorAll("#paneCtl *")].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && e.offsetParent !== null).slice(0, 5).map(e => e.tagName + "." + String(e.className).slice(0, 30))); if (o2.length) console.log("  ctl overflow:", o2.join(" | "));
      await page.click('#tabs button[data-tab="ai"]'); await page.waitForTimeout(250); await page.fill("#aiInput", "对数最优的固定比例"); await page.click("#aiSend"); await page.waitForSelector('.msg-a button:has-text("验证它的最优性声明")', { timeout: 20000 }); await page.waitForTimeout(400); await page.screenshot({ path: SH(`r-${cfg.name}-3-ai.png`) });
      const o3 = await page.evaluate(() => [...document.querySelectorAll("#paneAi *")].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && e.offsetParent !== null && !e.closest(".katex-display") && !e.closest("pre")).slice(0, 5).map(e => e.tagName + "." + String(e.className).slice(0, 30))); if (o3.length) console.log("  ai overflow:", o3.join(" | "));
      await page.click('#tabs button[data-tab="res"]'); await page.waitForTimeout(300); await page.evaluate(() => { document.getElementById("paneRes").scrollTop = 560; }); await page.waitForTimeout(300); await page.screenshot({ path: SH(`r-${cfg.name}-4-res.png`) });
    }
    if (cfg.name === "tablet") { await page.click("#btnClaude"); await page.waitForTimeout(300); await page.screenshot({ path: SH("r-tablet-2-drawer.png") }); }
    if (cfg.name === "dark") { await page.click('.shelf .chip:has-text("参数扫描")'); const card = page.locator('.card[data-chart="sweep"]'); await pickWorld(page, "ou"); await page.waitForTimeout(400); await page.selectOption("#stratSel", "meanrev"); await page.waitForFunction(() => !window.App.isBusy); await page.waitForTimeout(600); await card.locator("select").nth(1).selectOption("n"); await card.locator('button:has-text("开始扫描")').click(); await card.locator('button:has-text("采用最优参数")').waitFor({ timeout: 60000 }); await page.evaluate(() => { document.getElementById("paneRes").scrollTop = 0; }); await page.waitForTimeout(500); await page.screenshot({ path: SH("r-dark-2.png") }); await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await page.screenshot({ path: SH("r-dark-3.png") }); }
    if (logs.length) console.log("  logs:", logs.join("\n  "));
    await t.close();
  }
})().catch(e => { console.error("CRASH", e.message.split("\n").slice(0, 3).join("\n")); process.exit(1); });
