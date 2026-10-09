// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 独立的网页版（index.html）：不在 Claude 里、外面的网站一概连不上时，页面照样能用。
// 其余的界面测试跑的是 dist/preview.html（发布到 Claude 的那一份套上壳），两份的脚本和样式相同，这里只核对不同的地方。
const path = require("path"), fs = require("fs"), { open, pickWorld, liveIdle } = require("./ui-smoke.js");
const SH = n => path.join(__dirname, "../shots/" + n);
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) pass++; else { fail++; console.log("  FAIL", name, d || ""); } };
const num = s => parseFloat(String(s).replace("−", "-").replace(/[^0-9.\-]/g, ""));
(async () => {
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  ok(/^<!doctype html>\s*<!--[\s\S]*?-->\s*<html lang="zh-CN">\s*<head>/.test(html) && /<\/body>\s*<\/html>\s*$/.test(html) && /<meta charset="utf-8">/.test(html) && /<title>策略实验室<\/title>/.test(html), "index.html 是一份完整的文档");
  ok(/^<!doctype html>\s*<!--\s*Copyright \(c\) 2026 Zechen Bian\. All rights reserved\./.test(html) && /<meta name="robots" content="noai, noimageai">/.test(html) && /<link rel="license" href="https:\/\/github\.com\/ZechenBian\/zechenbian\.github\.io\/blob\/main\/LICENSE">/.test(html) && (html.match(/Not open source\. See LICENSE at the repository root/g) || []).length === 0 && /KaTeX[^\n]*MIT License/.test(html), "页面带版权声明和第三方声明；各源文件头上的那两行没有重复进页面");
  ok(!/<script[^>]+src=/.test(html) && (html.match(/<link rel="stylesheet"/g) || []).length === 1 && /media="print" onload=/.test(html), "脚本全部内联；唯一的外部样式是字体，而且不阻塞首屏");
  ok(html.length < 3e6, "文件不到 3 MB", String(html.length));

  let t = await open({ viewport: { width: 1440, height: 1000 }, standalone: true }), page = t.page, logs = t.logs;
  const idle = async () => { await page.waitForTimeout(150); await page.waitForFunction(() => !window.App.isBusy, null, { timeout: 90000 }); await page.waitForTimeout(120); };
  const real = () => logs.filter(l => !/ERR_FAILED|net::ERR|Failed to load resource/.test(l));      // 字体被掐断时浏览器自己会记一行，不算页面的错
  await page.waitForSelector(".crit .big", { timeout: 20000 }); await idle();
  const hosts = [...new Set(t.external)];
  ok(hosts.every(h => /^fonts\.(googleapis|gstatic)\.com$/.test(h)), "除了字体，页面不向外面要任何东西", hosts.join(","));
  const s0 = await page.evaluate(() => ({ katex: typeof window.katex, claude: typeof window.claude, lang: document.documentElement.lang, aiOpen: document.getElementById("app").classList.contains("ai-open"), big: document.querySelectorAll(".crit .big").length, g: window.App.run.sum.growth, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, font: getComputedStyle(document.body).fontFamily }));
  ok(s0.katex === "object" && s0.claude === "undefined" && s0.lang === "zh-CN", "公式库在页面里；没有 Claude 的接口", JSON.stringify([s0.katex, s0.claude, s0.lang]));
  ok(s0.big === 3 && Math.abs(s0.g - 0.0586) < 0.002 && s0.sw <= s0.cw + 1, "连不上字体也照常算出结果，版面不溢出", JSON.stringify([s0.big, s0.g, s0.sw, s0.cw]));
  ok(!s0.aiOpen && (await page.locator("#paneAi").isHidden()), "还没接入 AI 时右栏不自动展开");
  await page.screenshot({ path: SH("sa-main.png") });
  // 右栏：独立的网页里是"AI"，要先接入一家服务商（细节在 ui-ai.js 里测）；没接入时说清楚怎么办
  await page.click("#btnClaude"); await page.waitForSelector("#aiOff:not([hidden])");
  const off = await page.locator("#aiOff").innerText();
  ok(/接入一个 AI/.test(off) && /DeepSeek、ChatGPT、Kimi、豆包/.test(off) && /代码与说明/.test(off) && /不接入也不影响别的/.test(off) && (await page.locator("#aiSend").isDisabled()) && (await page.locator("#aiInput").isDisabled()) && (await page.locator("#btnClaude").innerText()) === "AI", "点开右栏：写明要先接入 AI、不接入时怎么办，输入框停用", off.slice(0, 60));
  await page.click("#btnClaude");
  // 手工改规则的代码：不靠 Claude 也能写规则
  await page.locator('#blkStrat button:has-text("代码与说明")').click(); await page.waitForSelector('.modal .seg button[data-v="code"]'); await page.locator('.modal .seg button[data-v="code"]').click(); await page.waitForSelector("#codeEdit");
  const code0 = await page.inputValue("#codeEdit"); ok(/function decide/.test(code0) && !(await page.evaluate(() => document.getElementById("codeEdit").readOnly)), "「代码与说明」里的代码可以直接改");
  await page.keyboard.press("Escape"); await page.waitForTimeout(150);
  // 公式
  await page.click("#btnGuide"); await page.waitForSelector(".gd-title");
  await page.evaluate(() => window.App.openGuide("start:criteria")); await page.waitForTimeout(300);
  const tex = await page.evaluate(() => ({ k: document.querySelectorAll(".gd-art .katex").length, undone: document.querySelectorAll(".gd-art .tex:not(.done)").length, err: document.querySelectorAll(".gd-art .katex-error").length }));
  ok(tex.k > 5 && tex.undone === 0 && tex.err === 0, "手册里的公式排出来了（公式库是内联的，不靠 CDN）", JSON.stringify(tex));
  // 现算：一套玩法的那一页
  await page.evaluate(() => window.App.openGuide("game:o_meas")); await page.waitForSelector(".gd-title"); await liveIdle(page);
  const lv = await page.evaluate(() => { const el = document.querySelector('.gd-art .lv[data-live="m.mu1.std"]'); return { okn: document.querySelectorAll(".gd-art .lv.ok").length, txt: el && el.textContent, threads: window.App.live.threads, rows: document.querySelectorAll(".gd-art table.mx tbody tr").length }; });
  ok(lv.okn >= 12 && Math.abs(num(lv.txt) - 3.929) < 0.002 && lv.threads >= 1 && lv.rows === 6, "现算照常：后台线程算出了测量参数一页的数字和成绩表", JSON.stringify(lv));
  await page.locator('.gd-art button:has-text("去玩这一套")').click(); await idle();
  ok(Math.abs(num(await page.locator(".gsum .gscore .big").innerText()) - 3.93) < 0.02, "观测玩法能玩：测漂移 · 标准估计 3.93");
  ok(real().length === 0, "页面没有报错", real().slice(0, 4).join(" || "));
  await t.close();

  // 手机宽度、深色
  t = await open({ viewport: { width: 390, height: 800 }, dpr: 2, dark: true, standalone: true }); page = t.page; const logs2 = t.logs;
  await page.waitForSelector(".crit .big", { timeout: 20000 }); await idle();
  const ph = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bg: getComputedStyle(document.body).backgroundColor, tabs: getComputedStyle(document.getElementById("tabs")).display }));
  const lum = (ph.bg.match(/\d+/g) || []).slice(0, 3).reduce((a, b) => a + (+b), 0);
  ok(ph.sw <= ph.cw + 1 && ph.tabs !== "none" && lum < 150, "手机宽度、深色：不横向溢出，三栏折成标签，底色是深的", JSON.stringify(ph));
  await page.screenshot({ path: SH("sa-phone-dark.png") });
  await page.click("#btnGuide"); await page.waitForSelector(".gd-title"); await page.evaluate(() => window.App.openGuide("games")); await page.waitForTimeout(250);
  const ph2 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, art: document.querySelector(".gd-art").scrollWidth - document.querySelector(".gd-art").clientWidth }));
  ok(ph2.sw <= ph2.cw + 1 && ph2.art <= 1, "手机上的手册不溢出", JSON.stringify(ph2));
  ok(logs2.filter(l => !/ERR_FAILED|net::ERR|Failed to load resource/.test(l)).length === 0, "手机宽度下没有报错", logs2.slice(0, 3).join(" || "));
  await t.close();

  // 直接双击打开（file://）
  t = await open({ viewport: { width: 1280, height: 900 }, standalone: true, file: true }); page = t.page; const logs3 = t.logs;
  let fileOk = true; try { await page.waitForSelector(".crit .big", { timeout: 20000 }); await idle(); } catch (e) { fileOk = false; }
  const f = fileOk ? await page.evaluate(() => ({ proto: location.protocol, g: window.App.run.sum.growth, big: document.querySelectorAll(".crit .big").length })) : {};
  ok(fileOk && f.proto === "file:" && f.big === 3 && Math.abs(f.g - 0.0586) < 0.002, "把 index.html 存到本地双击打开：也能算", JSON.stringify(f) + " " + logs3.slice(0, 2).join(" || "));
  if (fileOk) { await pickWorld(page, "o_stop"); await idle(); ok(Math.abs(num(await page.locator(".gsum .gscore .big").innerText()) - 0.675) < 0.003, "本地打开时观测玩法也能玩"); }
  await t.close();

  console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", real().length ? real().join("\n") : "none");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("TEST CRASHED:", e.stack || e); process.exit(1); });
