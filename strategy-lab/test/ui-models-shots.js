// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 模型层在手机宽度和深色下的截图与溢出检查
const path = require("path"), fs = require("fs"), { open, pickWorld, liveIdle } = require("./ui-smoke.js");
const SH = n => path.join(__dirname, "../shots/" + n);
(async () => {
  for (const cfg of [{ name: "phone", viewport: { width: 390, height: 800 }, dpr: 2 }, { name: "dark", viewport: { width: 1440, height: 900 }, dark: true }, { name: "phone-dark", viewport: { width: 390, height: 800 }, dpr: 2, dark: true }]) {
    const t = await open({ viewport: cfg.viewport, dpr: cfg.dpr, dark: cfg.dark, init: fs.readFileSync(path.join(__dirname, "mock-claude.js"), "utf8") }); const { page, logs } = t;
    const idle = async () => { await page.waitForTimeout(80); await page.waitForFunction(() => !window.App.isBusy, null, { timeout: 90000 }); await page.waitForTimeout(150); };
    await page.waitForSelector(".crit .big", { timeout: 15000 }); await idle();
    const phone = cfg.name.startsWith("phone");
    if (phone) await page.click('#tabs button[data-tab="ctl"]');
    await pickWorld(page, "ar1"); await idle(); await page.fill("#w-phi", "0.2"); await page.dispatchEvent("#w-phi", "change"); await idle();
    await page.selectOption("#stratSel", "pipe"); await idle(); await page.selectOption("#s-model", "gbm"); await idle();
    if (phone) { await page.screenshot({ path: SH(`mm-${cfg.name}-ctl.png`) }); await page.click('#tabs button[data-tab="res"]'); await page.waitForTimeout(300); }
    const card = id => page.locator('.card[data-chart="' + id + '"]');
    await card("mdlcmp").scrollIntoViewIfNeeded(); await card("mdlcmp").locator('button:has-text("开始对比")').click(); await page.waitForFunction(() => window.App.arena.res && !window.App.arena.busy, null, { timeout: 300000 }); await page.waitForTimeout(500);
    for (const id of ["mdlfn", "mdl", "mdlcmp"]) { await card(id).scrollIntoViewIfNeeded(); await page.waitForTimeout(250); await card(id).screenshot({ path: SH(`mm-${cfg.name}-${id}.png`) }); }
    const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, wide: [...document.querySelectorAll("#app *")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1 && getComputedStyle(e).position !== "fixed" && e.offsetParent !== null && !e.closest(".tablewrap"); }).slice(0, 6).map(e => e.tagName + "." + String(e.className).slice(0, 30) + " right=" + Math.round(e.getBoundingClientRect().right)) }));
    console.log(cfg.name, "scrollWidth", over.sw, "clientWidth", over.cw, over.wide.length ? "OVERFLOWING: " + over.wide.join(" | ") : "no overflow", "| logs:", logs.length ? logs.join(" ; ") : "none");
    if (!phone) { await page.evaluate(() => { document.getElementById("paneRes").scrollTop = 0; }); await page.waitForTimeout(300); await page.screenshot({ path: SH(`mm-${cfg.name}-top.png`) }); }
    await t.close();
  }
})().catch(e => { console.error("CRASH", e.message.split("\n").slice(0, 4).join("\n")); process.exit(1); });
