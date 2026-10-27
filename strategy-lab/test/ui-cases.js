// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 数据分析案例（cases/index.html）的界面测试：无头浏览器里把四个案例的每一步都渲染出来，页面不能报错、不能有横向滚动条、
// 不能向外发请求（字体除外）；控件能重算；手机宽度下两个标签能切换；"在机器学习实验室里继续"把数据交过去，机器学习实验室打开时选中它。
// 用法：node test/ui-cases.js        （先 python3 build.py）
const http = require("http"), fs = require("fs"), path = require("path");
function need(name, fallback) { try { return require(name); } catch (e) { return require(fallback); } }
const { chromium } = need("playwright", "/opt/npm-tools/node_modules/playwright");
const { ok, section, done } = require("./harness.js");
const ROOT = path.join(__dirname, "..");
const PAGES = { "/cases/": path.join(ROOT, "cases/index.html"), "/ml/": path.join(ROOT, "ml/index.html") };

function staticServer() {
  const s = http.createServer((req, res) => {
    let u = req.url.split("?")[0].split("#")[0]; if (u.endsWith("/index.html")) u = u.slice(0, -10);
    if (PAGES[u]) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(fs.readFileSync(PAGES[u])); } else { res.writeHead(404); res.end(); }
  });
  return new Promise((r) => s.listen(0, "127.0.0.1", () => r({ port: s.address().port, close: () => new Promise((q) => s.close(q)) })));
}

(async () => {
  for (const k in PAGES) if (!fs.existsSync(PAGES[k])) { console.log("CRASH: 没有 " + PAGES[k] + "，先 python3 build.py"); process.exit(1); }
  const web = await staticServer(), browser = await chromium.launch(), logs = [], external = [];
  const URL0 = "http://127.0.0.1:" + web.port;
  async function newPage(viewport) {
    const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 920 } });
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource: net::ERR_(FAILED|TUNNEL)/.test(m.text())) logs.push("[console] " + m.text()); });
    page.on("pageerror", (e) => logs.push("[pageerror] " + e.message));
    await page.route((u) => /^https?:$/.test(u.protocol) && u.hostname !== "127.0.0.1", (r) => { external.push(new URL(r.request().url()).hostname); r.abort(); });
    return { ctx, page };
  }
  const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const settle = (page) => page.waitForFunction(() => document.querySelectorAll(".cs-later:not([data-done])").length === 0 && document.querySelectorAll(".cs-step-b[data-pending]").length === 0, null, { timeout: 60000, polling: 100 });
  const tile = (page, id) => page.evaluate((id) => { const t = document.querySelector('.cs-tile[data-k="' + id + '"] .v'); return t ? t.textContent : null; }, id);
  try {
    const { ctx, page } = await newPage();
    section("四个案例，每一步都渲染出来");
    await page.goto(URL0 + "/cases/");
    const ids = await page.evaluate(() => QLCaseApp.cases().map((c) => c.id));
    ok(JSON.stringify(ids) === JSON.stringify(["bike", "dock", "ames", "spx"]), "四个案例都在，顺序对", ids);
    ok(await page.evaluate(() => document.querySelectorAll(".cs-navitem").length === 4 && document.querySelectorAll(".cs-frame li").length === 8), "左栏：四个案例、八步框架");
    for (const id of ids) {
      await page.goto(URL0 + "/cases/#" + id); await page.waitForTimeout(200);
      await page.evaluate(() => QLCaseApp.renderAll()); await settle(page);
      const r = await page.evaluate(() => ({
        steps: document.querySelectorAll(".cs-step[data-kind]").length, kinds: Array.from(document.querySelectorAll(".cs-step[data-kind]")).map((s) => +s.dataset.kind).join(","),
        broken: Array.from(document.querySelectorAll(".cs-note.warn")).filter((n) => /没有(算|渲染)出来/.test(n.textContent)).length,
        charts: Array.from(document.querySelectorAll(".cs-chart canvas")).filter((c) => c.width > 50 && c.height > 50).length,
        tex: document.querySelectorAll(".tex.done").length, rawTex: Array.from(document.querySelectorAll(".cs-md")).filter((m) => /\$[^$]+\$/.test(m.textContent) && !m.querySelector(".tex")).length,
        follow: document.querySelectorAll(".cs-follow details").length, current: document.querySelector('.cs-navitem[aria-current="true"]').dataset.case, title: document.title }));
      ok(r.steps === 8 && r.kinds === "1,2,3,4,5,6,7,8", id + "：八步按顺序都在", r.kinds);
      ok(r.broken === 0, id + "：没有算不出来的块", r.broken);
      ok(r.charts >= 2, id + "：图画出来了（" + r.charts + " 张）");
      ok(r.tex > 0 && r.rawTex === 0, id + "：公式都排好了", r);
      ok(r.follow >= 4, id + "：面试官的追问", r.follow);
      ok(r.current === id && /数据分析案例/.test(r.title), id + "：左栏高亮、标题对");
      ok(await overflow(page) <= 0, id + "：没有横向滚动条");
    }

    section("数字与控件");
    await page.goto(URL0 + "/cases/#bike"); await page.evaluate(() => QLCaseApp.renderAll()); await settle(page);
    ok(await tile(page, "bikeTotal") === "3,292,679", "两年总租车次数");
    ok(await tile(page, "bikeGrowth") === "+64%", "第二年的增长", await tile(page, "bikeGrowth"));
    const r0 = await tile(page, "bikeRmse");
    ok(r0 === "42.8", "Poisson + 全部特征的测试 RMSE（与 Node 里的核对相同）", r0);
    await page.click('#bike-6 .cs-seg button[data-v="ols"]'); await settle(page);
    const r1 = await tile(page, "bikeRmse"), neg = await page.evaluate(() => Array.from(document.querySelectorAll("#bike-6 .cs-note.warn")).some((n) => /负的预测/.test(n.textContent)));
    ok(r1 !== r0 && +r1 > +r0 && neg, "换成线性回归：误差变大，提示负的预测", [r0, r1]);
    await page.click('#bike-6 input[data-k="leak"]'); await settle(page);
    const r2 = await tile(page, "bikeRmse"), leak = await page.evaluate(() => Array.from(document.querySelectorAll("#bike-6 .cs-note.warn")).some((n) => /泄漏/.test(n.textContent)));
    ok(+r2 < +r1 && leak, "打开泄漏：成绩突然变好，并提示泄漏", [r1, r2]);

    await page.goto(URL0 + "/cases/#dock"); await page.evaluate(() => QLCaseApp.renderAll()); await settle(page);
    const lost0 = await tile(page, "dockLost");
    ok(/^\d+(\.\d)?%$/.test(lost0) && parseFloat(lost0) > 5, "车桩：没取到车的比例", lost0);
    await page.evaluate(() => { const r = document.querySelector('#dock-1 input[data-k="seed"]'); r.value = 7; r.dispatchEvent(new Event("input")); r.dispatchEvent(new Event("change")); });
    await page.evaluate(() => QLCaseApp.renderAll()); await settle(page);
    const lost1 = await tile(page, "dockLost");
    ok(lost1 && lost1 !== lost0, "换种子：整个案例重算", [lost0, lost1]);
    ok(await page.evaluate(() => document.querySelectorAll(".cs-step[data-kind]").length === 8 && !!document.querySelector("#dock-8 .cs-chart canvas")), "重算之后八步都在，决策图也在");

    await page.goto(URL0 + "/cases/#ames"); await page.evaluate(() => QLCaseApp.renderAll()); await settle(page);
    const cv0 = await tile(page, "amesCv");
    ok(/^0\.1\d\d$/.test(cv0), "房价：交叉验证的对数 RMSE", cv0);
    await page.click('#ames-6 input[data-k="dup"]'); await settle(page);
    ok(await page.evaluate(() => Array.from(document.querySelectorAll("#ames-6 .cs-note.warn")).some((n) => /复制/.test(n.textContent))) && await tile(page, "amesCv") === cv0, "复制数据：提示虚假的显著，交叉验证的误差不变");
    await page.click('#ames-6 .cs-seg button[data-v="level"]'); await settle(page);
    ok(+(await tile(page, "amesCv")) > +cv0, "换成原价目标：相对误差变大", await tile(page, "amesCv"));

    await page.goto(URL0 + "/cases/#spx"); await page.evaluate(() => QLCaseApp.renderAll()); await settle(page);
    ok(await tile(page, "spxLevelR2") === "0.9986", "价格水平的 R²", await tile(page, "spxLevelR2"));
    const wv = +(await tile(page, "spxWorking"));
    ok(Math.abs(wv - 0.25) < 0.04, "月均价的假自相关 ≈ 0.25", wv);
    const tOls = +(await tile(page, "spxTOls")).replace("−", "-"), tNw = +(await tile(page, "spxTNw")).replace("−", "-");
    ok(Math.abs(tNw) < Math.abs(tOls) / 3, "10 年期：Newey–West 的 t 值比经典的小得多", [tOls, tNw]);
    await page.click('#spx-6 .cs-seg button[data-v="1"]');
    const t1 = +(await tile(page, "spxTNw")).replace("−", "-");
    ok(t1 !== tNw, "换成 1 个月：数字跟着变", t1);
    ok(/^−?\d\.\d\d%$/.test(await tile(page, "spxOos")), "样本外 R²", await tile(page, "spxOos"));

    section("地址与跳转");
    await page.goto(URL0 + "/cases/#ames-6"); await page.waitForTimeout(400);
    ok(await page.evaluate(() => { const r = document.getElementById("ames-6").getBoundingClientRect(); return r.top >= -2 && r.top < 200; }), "#ames-6 直接打开到第 6 步");
    await page.click('.cs-navitem[data-case="spx"]'); await page.waitForTimeout(200);
    ok(await page.evaluate(() => location.hash === "#spx" && document.querySelector(".cs-title").textContent.indexOf("标普") >= 0), "点左栏换案例，地址跟着变");
    await page.reload(); await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.querySelector('.cs-navitem[aria-current="true"]').dataset.case) === "spx", "刷新之后还在同一个案例");
    await ctx.close();

    section("手机宽度");
    const m = await newPage({ width: 390, height: 800 });
    await m.page.goto(URL0 + "/cases/#ames"); await m.page.evaluate(() => QLCaseApp.renderAll()); await settle(m.page);
    ok(await overflow(m.page) <= 0, "390 像素宽：没有横向滚动条");
    ok(await m.page.evaluate(() => getComputedStyle(document.getElementById("paneNav")).display === "none" && getComputedStyle(document.getElementById("paneMain")).display !== "none"), "默认显示正文");
    await m.page.click('#tabs button[data-tab="nav"]');
    ok(await m.page.evaluate(() => getComputedStyle(document.getElementById("paneNav")).display !== "none" && getComputedStyle(document.getElementById("paneMain")).display === "none"), "点“案例目录”切到目录");
    await m.page.click('.cs-navitem[data-case="dock"]'); await m.page.waitForTimeout(200);
    ok(await m.page.evaluate(() => getComputedStyle(document.getElementById("paneMain")).display !== "none" && location.hash === "#dock"), "在目录里选一个案例，回到正文");
    await m.ctx.close();

    section("交给机器学习实验室");
    for (const [id, name, group] of [["ames", "埃姆斯房价", "tab-reg"], ["spx", "标普 500 月度总收益", "ts"]]) {
      const h = await newPage();
      await h.page.goto(URL0 + "/cases/#" + id); await h.page.evaluate(() => QLCaseApp.renderAll()); await settle(h.page);
      await Promise.all([h.page.waitForURL(/\/ml\//), h.page.click("#btnHandoff")]);
      await h.page.waitForFunction(() => window.MLA && MLA.S && MLA.csv, null, { timeout: 30000, polling: 100 });
      const r = await h.page.evaluate(() => ({ group: MLA.S.group, id: MLA.S.ds[MLA.S.group] && MLA.S.ds[MLA.S.group].id, name: MLA.csv && MLA.csv.def.name, hash: location.hash }));
      ok(r.group === group && r.id === "csv" && r.name.indexOf(name) >= 0 && r.hash === "", id + "：机器学习实验室打开时选中交过来的数据", JSON.stringify(r));
      await h.ctx.close();
    }
    const ext = external.filter((x) => !/^fonts\.(googleapis|gstatic)\.com$/.test(x));
    ok(ext.length === 0, "除了字体，页面没有向外发请求", [...new Set(ext)]);
    ok(logs.length === 0, "页面没有报错", logs.slice(0, 5));
  } catch (e) { console.log("CRASH:", e && e.stack || e); logs.push(String(e)); ok(false, "测试中途出错", String(e)); }
  await browser.close(); await web.close();
  console.log("page logs: " + logs.length);
  done();
})();
