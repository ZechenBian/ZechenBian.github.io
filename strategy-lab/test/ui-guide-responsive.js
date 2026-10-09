// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 手册和场景对比在窄屏、深色主题下：不横向溢出，目录换成下拉框，截图留档
const path = require("path"), fs = require("fs"), { open, liveIdle } = require("./ui-smoke.js");
const SH = n => path.join(__dirname, "../shots/" + n);
const PAGES = ["start:what", "start:loop", "start:read", "start:criteria", "start:tour", "start:step", "start:trust", "start:claude", "start:keys", "now", "games", "game:trade", "game:o_meas", "game:o_pred", "game:o_det", "game:o_stop", "selfcheck", "world:ou", "world:fbm", "world:logistic", "strat:meas_shrink", "strat:det_cusum", "strat:stop_dp", "game:g_lock", "game:g_sec", "game:g_coin", "game:g_bold", "game:g_bandit", "game:g_news", "game:g_curse", "game:g_prop", "game:g_ashare", "game:g_exec", "world:iid", "world:bet", "world:gbm", "world:regime", "world:real", "strat:ma", "strat:pipe", "strat:lock_dp", "strat:ban_ucb", "strat:curse_shade", "strat:prop_pace", "chart:sweep", "chart:scenes", "chart:mdl", "matrix", "algos", "glossary"];
let bad = 0;
(async () => {
  for (const cfg of [{ name: "phone", viewport: { width: 390, height: 800 }, dpr: 2 }, { name: "phone-dark", viewport: { width: 390, height: 800 }, dpr: 2, dark: true }, { name: "tablet", viewport: { width: 900, height: 800 } }, { name: "dark", viewport: { width: 1440, height: 900 }, dark: true }]) {
    const t = await open({ viewport: cfg.viewport, dpr: cfg.dpr, dark: cfg.dark, seedLive: true, init: fs.readFileSync(path.join(__dirname, "mock-claude.js"), "utf8") }); const { page, logs } = t;
    await page.waitForSelector(".crit .big", { timeout: 15000 }); await page.waitForFunction(() => !window.App.isBusy); await page.waitForTimeout(600);
    const phone = cfg.name.startsWith("phone");
    // 主页面：带着"第一次来"的提示也不溢出
    const over0 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, hint: !!document.getElementById("guideHint") }));
    if (over0.sw > over0.cw + 1 || !over0.hint) { bad++; console.log(cfg.name, "OVERFLOWING main page or no hint", JSON.stringify(over0)); }
    await page.screenshot({ path: SH(`hr-${cfg.name}-0-main.png`) });
    await page.click("#btnGuide"); await page.waitForSelector(".gd-title");
    const lay = await page.evaluate(() => ({ nav: getComputedStyle(document.querySelector(".gd-nav")).display, toc: getComputedStyle(document.querySelector(".gd-toc")).display, box: document.querySelector(".guide-box").getBoundingClientRect().width, vw: window.innerWidth }));
    if (phone ? !(lay.nav === "none" && lay.toc !== "none" && Math.abs(lay.box - lay.vw) < 1) : !(lay.nav !== "none" && lay.toc === "none")) { bad++; console.log(cfg.name, "LAYOUT wrong", JSON.stringify(lay)); }
    for (const k of PAGES) {
      await page.evaluate(key => window.App.openGuide(key), k); await page.waitForTimeout(60); await liveIdle(page);      // 现算的数和格子填好之后再量宽度
      const o = await page.evaluate(() => {
        const art = document.querySelector(".gd-art"), vw = window.innerWidth, inScroll = e => e.closest(".mx-wrap, .gd-tw, .scroll, .katex, pre, .tablewrap, .md table");   // 公式里的根号是一条被裁掉的长路径，不算溢出
        const wide = [...art.querySelectorAll("*")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1 && !inScroll(e); }).slice(0, 4).map(e => e.tagName + "." + String(e.className).slice(0, 24) + ":" + Math.round(e.getBoundingClientRect().right));
        return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, artOver: art.scrollWidth - art.clientWidth, wide, title: (art.querySelector(".gd-title") || {}).textContent, err: art.querySelectorAll(".warn.err").length };
      });
      if (o.sw > o.cw + 1 || o.artOver > 1 || o.wide.length || o.err) { bad++; console.log(cfg.name, k, "OVERFLOWING", JSON.stringify(o)); }
      if (["start:read", "start:criteria", "now", "games", "game:trade", "game:o_meas", "game:o_det", "selfcheck", "world:ou", "game:g_lock", "game:g_sec", "strat:ma", "strat:det_cusum", "matrix", "algos", "glossary"].includes(k)) await page.screenshot({ path: SH(`hr-${cfg.name}-${k.replace(/[:]/g, "-")}.png`) });
    }
    if (phone) {   // 窄屏：目录下拉框能翻页，搜索结果顶替正文
      await page.selectOption(".gd-toc", "chart:lev"); await page.waitForTimeout(80);
      if ((await page.locator(".gd-title").innerText()) !== "杠杆曲线") { bad++; console.log(cfg.name, "TOC select did not navigate"); }
      await page.fill(".gd-search", "报童"); await page.waitForTimeout(120);
      const vis = await page.evaluate(() => ({ nav: getComputedStyle(document.querySelector(".gd-nav")).display, art: getComputedStyle(document.querySelector(".gd-art")).display, n: document.querySelectorAll(".gd-nav .gd-link").length }));
      if (!(vis.nav !== "none" && vis.art === "none" && vis.n >= 3)) { bad++; console.log(cfg.name, "SEARCH on phone wrong", JSON.stringify(vis)); }
      await page.screenshot({ path: SH(`hr-${cfg.name}-search.png`) });
      await page.locator('.gd-nav .gd-link:has-text("报童问题")').first().click(); await page.waitForTimeout(100);
      const after = await page.evaluate(() => ({ art: getComputedStyle(document.querySelector(".gd-art")).display, title: document.querySelector(".gd-title").textContent, q: document.querySelector(".gd-search").value }));
      if (!(after.art !== "none" && /报童/.test(after.title) && after.q === "")) { bad++; console.log(cfg.name, "SEARCH pick wrong", JSON.stringify(after)); }
      // 搜到一半改用下拉目录或顶上的按钮翻页：搜索收起来，正文露出来
      await page.fill(".gd-search", "凯利"); await page.waitForTimeout(120);
      await page.selectOption(".gd-toc", "start:read"); await page.waitForTimeout(100);
      const viaToc = await page.evaluate(() => ({ art: getComputedStyle(document.querySelector(".gd-art")).display, title: document.querySelector(".gd-title").textContent, q: document.querySelector(".gd-search").value }));
      if (!(viaToc.art !== "none" && viaToc.title === "怎么读结果栏" && viaToc.q === "")) { bad++; console.log(cfg.name, "SEARCH then TOC wrong", JSON.stringify(viaToc)); }
      await page.fill(".gd-search", "凯利"); await page.waitForTimeout(120);
      await page.locator('.gd-h button:has-text("当前的细则")').click(); await page.waitForTimeout(100);
      const viaBtn = await page.evaluate(() => ({ art: getComputedStyle(document.querySelector(".gd-art")).display, title: document.querySelector(".gd-title").textContent, q: document.querySelector(".gd-search").value }));
      if (!(viaBtn.art !== "none" && viaBtn.title === "当前的细则" && viaBtn.q === "")) { bad++; console.log(cfg.name, "SEARCH then header button wrong", JSON.stringify(viaBtn)); }
      // 名词表在窄屏上能筛
      await page.evaluate(() => window.App.openGuide("glossary")); await page.waitForTimeout(80);
      await page.fill(".gd-filter", "夏普"); await page.waitForTimeout(100);
      const gf = await page.evaluate(() => ({ n: document.querySelectorAll(".gd-art dl.gd-gloss dt").length, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      if (!(gf.n >= 1 && gf.n < 12 && gf.sw <= gf.cw + 1)) { bad++; console.log(cfg.name, "GLOSSARY filter on phone wrong", JSON.stringify(gf)); }
      await page.screenshot({ path: SH(`hr-${cfg.name}-gloss-filter.png`) });
    }
    await page.keyboard.press("Escape"); await page.waitForTimeout(100);
    // 场景对比在这个宽度下
    await page.evaluate(() => { window.App.applySetup({ world: "gbm", strat: "stop", charts: ["scenes"] }); });
    await page.waitForFunction(() => window.App.scn.rows && !window.App.scn.busy, null, { timeout: 120000 }); await page.waitForTimeout(250);
    const so = await page.evaluate(() => { const c = document.querySelector('.card[data-chart="scenes"]'), vw = window.innerWidth; return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, wide: [...c.querySelectorAll("*")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1; }).length, rows: c.querySelectorAll(".hb-row").length, nameH: c.querySelector(".hb-name").getBoundingClientRect().height }; });
    if (so.sw > so.cw + 1 || so.wide || so.rows !== 13) { bad++; console.log(cfg.name, "scenes OVERFLOWING", JSON.stringify(so)); }
    await page.locator('.card[data-chart="scenes"]').scrollIntoViewIfNeeded(); await page.waitForTimeout(150); await page.locator('.card[data-chart="scenes"]').screenshot({ path: SH(`hr-${cfg.name}-scenes.png`) });
    // 玩法 + 规则下面的"算法"一行
    await page.evaluate(() => { window.App.applySetup({ world: "g_news", strat: "news_saa" }); }); await page.waitForFunction(() => !window.App.isBusy && window.App.run && window.App.run.game); await page.waitForTimeout(300);
    if (phone) { await page.click('#tabs button[data-tab="ctl"]'); await page.waitForTimeout(200); }
    const an = await page.locator("#algoNote").innerText();
    if (!/每步 O\(t\)/.test(an) || !/实测/.test(an)) { bad++; console.log(cfg.name, "algo note wrong:", an.replace(/\n/g, " | ")); }
    const co = await page.evaluate(() => [...document.querySelectorAll("#paneCtl *")].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && e.offsetParent !== null).length); if (co) { bad++; console.log(cfg.name, "ctl pane OVERFLOWING", co); }
    await page.screenshot({ path: SH(`hr-${cfg.name}-9-game.png`) });
    if (logs.length) { bad++; console.log(cfg.name, "logs:", logs.join("\n  ")); }
    console.log(cfg.name, "done");
    await t.close();
  }
  console.log(bad ? `${bad} PROBLEMS` : "handbook responsive OK");
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.error("CRASH", e.message.split("\n").slice(0, 5).join("\n")); process.exit(1); });
