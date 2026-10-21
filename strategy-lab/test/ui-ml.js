// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 机器学习实验室（ml/index.html）的界面测试：无头浏览器里把五类任务、每个数据集、各视图、代码编辑、导入 CSV、手册、排行榜与揭晓、
// AI 面板的四种用法（本机的假服务商）都走一遍，页面不能报错、不能有横向滚动条、不能向外发请求。
// 用法：node test/ui-ml.js        （先 python3 build.py）
const http = require("http"), fs = require("fs"), path = require("path");
function need(name, fallback) { try { return require(name); } catch (e) { return require(fallback); } }
const { chromium } = need("playwright", "/opt/npm-tools/node_modules/playwright");
const { ok, section, done } = require("./harness.js");
const ROOT = path.join(__dirname, "..");
const PAGE = path.join(ROOT, "ml/index.html");
const SHOTS = process.env.ML_SHOTS || "";      // 设了就把截图存到这个目录

/* ---------- 假服务商：兼容 OpenAI 的流式接口，按提示词回答 ---------- */
const GOOD = `
// 多项逻辑回归（测试用的假 AI 写的）
function fit(data, p, lib, ctx) {
  var tr = data.train, n = tr.n, d = tr.d, k = tr.k, W = new Float64Array(d * k), b = new Float64Array(k);
  var mu = new Float64Array(d), sd = new Float64Array(d), i, j, c;
  for (j = 0; j < d; j++) { var s = 0, s2 = 0; for (i = 0; i < n; i++) { var v = tr.X[i * d + j]; s += v; s2 += v * v; } mu[j] = s / n; sd[j] = Math.sqrt(Math.max(1e-12, s2 / n - mu[j] * mu[j])); }
  var P = new Float64Array(k);
  for (var it = 0; it < 150 && ctx.timeLeft() > 100; it++) {
    var gW = new Float64Array(d * k), gb = new Float64Array(k), loss = 0;
    for (i = 0; i < n; i++) {
      var m = -Infinity;
      for (c = 0; c < k; c++) { var z = b[c]; for (j = 0; j < d; j++) z += W[j * k + c] * (tr.X[i * d + j] - mu[j]) / sd[j]; P[c] = z; if (z > m) m = z; }
      var Z = 0; for (c = 0; c < k; c++) { P[c] = Math.exp(P[c] - m); Z += P[c]; }
      for (c = 0; c < k; c++) { P[c] /= Z; var g = P[c] - (tr.y[i] === c ? 1 : 0); gb[c] += g; for (j = 0; j < d; j++) gW[j * k + c] += g * (tr.X[i * d + j] - mu[j]) / sd[j]; }
      loss -= Math.log(P[tr.y[i]] + 1e-12);
    }
    for (c = 0; c < k; c++) b[c] -= p.lr * gb[c] / n;
    for (j = 0; j < d * k; j++) W[j] -= p.lr * gW[j] / n;
    ctx.report(it, { loss: loss / n });
    if (it % 10 === 0) ctx.snapshot(it, { W: W.slice(), b: b.slice(), mu: mu, sd: sd, d: d, k: k });
  }
  return { W: W, b: b, mu: mu, sd: sd, d: d, k: k };
}
function predict(m, X, n) {
  var out = new Float64Array(n * m.k), d = m.d, k = m.k;
  for (var i = 0; i < n; i++) {
    var mx = -Infinity, Z = 0, c, j;
    for (c = 0; c < k; c++) { var z = m.b[c]; for (j = 0; j < d; j++) z += m.W[j * k + c] * (X[i * d + j] - m.mu[j]) / m.sd[j]; out[i * k + c] = z; if (z > mx) mx = z; }
    for (c = 0; c < k; c++) { out[i * k + c] = Math.exp(out[i * k + c] - mx); Z += out[i * k + c]; }
    for (c = 0; c < k; c++) out[i * k + c] /= Z;
  }
  return out;
}
function inspect(m) { var coef = []; for (var j = 0; j < m.d; j++) coef.push({ name: "x" + (j + 1), value: m.W[j * m.k + m.k - 1] }); return { coef: coef }; }`;
const BAD = GOOD.replace("var tr = data.train,", "var tr = data.train; undefinedFunction(); var");
function algoReply(code, name) {
  return "<<<META>>>\n" + JSON.stringify({ name: name, summary: "标准化之后做多项逻辑回归，全批量梯度下降。", params: [{ key: "lr", label: "学习率", def: 0.5, min: 0.01, max: 2, step: 0.01, type: "num", desc: "梯度下降的步长" }] }) +
    "\n<<<CODE>>>\n" + code + "\n<<<EXPLAIN>>>\n## 思路\n线性的决策边界。\n## 模型与损失\n$p(y = c \\mid x) = \\mathrm{softmax}(Wx + b)_c$，损失是交叉熵。\n## 为什么这样设计\n先标准化，学习率可以取大一些。\n## 参数怎么调\n学习率 0.1 到 1。\n## 预期与风险\n两个半月这种弯的边界上会欠拟合。\n<<<END>>>";
}
function reply(messages) {
  const all = messages.map((m) => m.content).join("\n"), first = String(messages[0] && messages[0].content || "");
  if (/^Connection test/.test(first)) return "OK";
  if (/写一份诊断报告/.test(first)) return "## 结论\n这是一个线性模型，验证集准确率明显高于基线，但边界是弯的。\n## 证据\n训练集与验证集的准确率相近。\n## 偏差还是方差\n偏差为主：$\\hat\\theta$ 受模型族限制。\n## 数据与评价\n样本量够。\n## 下一步\n1. 加二次特征。\n2. 换成 MLP。\n3. 用核方法。";
  if (/# 输出格式/.test(first)) {
    if (/# 运行时的错误/.test(first)) return algoReply(GOOD, "修好的逻辑回归");
    if (/使用者的想法\n.*坏/.test(first)) return algoReply(BAD, "坏掉的逻辑回归");
    if (/这是第 \d+ 轮/.test(first)) return algoReply(GOOD.replace("it < 150", "it < 220"), "多迭代的逻辑回归");
    return algoReply(GOOD, "逻辑回归（AI）");
  }
  return "回答：训练集和验证集的差距是 $\\Delta = 0.01$，在误差之内。" + (/测试集：还没有揭晓/.test(all) ? "（测试集还没有揭晓。）" : "");
}
function mockAI() {
  const calls = [];
  const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, OPTIONS" };
  const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
    let raw = ""; req.on("data", (d) => { raw += d; });
    req.on("end", () => {
      let body = null; try { body = raw ? JSON.parse(raw) : null; } catch (e) {}
      calls.push({ path: req.url, body, key: String(req.headers.authorization || "").replace(/^Bearer\s+/i, "") });
      if (String(req.headers.authorization || "") !== "Bearer test-key-ok") { res.writeHead(401, Object.assign({ "content-type": "application/json" }, CORS)); res.end(JSON.stringify({ error: { message: "bad key" } })); return; }
      if (/\/models$/.test(req.url)) { res.writeHead(200, Object.assign({ "content-type": "application/json" }, CORS)); res.end(JSON.stringify({ data: [{ id: "mock-pro" }] })); return; }
      const text = reply(body.messages || []);
      if (!body.stream) { res.writeHead(200, Object.assign({ "content-type": "application/json" }, CORS)); res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }] })); return; }
      res.writeHead(200, Object.assign({ "content-type": "text/event-stream; charset=utf-8" }, CORS));
      const parts = text.match(/[\s\S]{1,64}/g) || [];
      let i = 0; (function tick() { if (i >= parts.length) { res.write("data: " + JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }) + "\n\ndata: [DONE]\n\n"); res.end(); return; } res.write("data: " + JSON.stringify({ choices: [{ delta: { content: parts[i++] } }] }) + "\n\n"); setTimeout(tick, 1); })();
    });
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ port: server.address().port, calls, close: () => new Promise((q) => server.close(q)) })));
}

/* ---------- 静态服务器：只给 ml/index.html ---------- */
function staticServer() {
  const s = http.createServer((req, res) => { const u = req.url.split("?")[0]; if (u === "/ml/" || u === "/ml/index.html") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(fs.readFileSync(PAGE)); } else { res.writeHead(404); res.end("nf"); } });
  return new Promise((r) => s.listen(0, "127.0.0.1", () => r({ port: s.address().port, close: () => new Promise((q) => s.close(q)) })));
}

(async () => {
  if (!fs.existsSync(PAGE)) { console.log("CRASH: 没有 ml/index.html，先 python3 build.py"); process.exit(1); }
  const web = await staticServer(), ai = await mockAI(), BASE = "http://127.0.0.1:" + ai.port + "/v1";
  const browser = await chromium.launch();
  const logs = [], external = [];
  async function newPage(opt) {
    opt = opt || {};
    const ctx = await browser.newContext({ viewport: opt.viewport || { width: 1440, height: 920 }, colorScheme: opt.dark ? "dark" : "light" });
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error") logs.push("[console] " + m.text()); });
    page.on("pageerror", (e) => logs.push("[pageerror] " + e.message + "\n" + String(e.stack || "").split("\n").slice(0, 3).join("\n")));
    await page.route((u) => /^https?:$/.test(u.protocol) && u.hostname !== "127.0.0.1", (r) => { external.push(new URL(r.request().url()).hostname); r.abort(); });
    if (opt.init) await page.addInitScript(opt.init);
    await page.goto("http://127.0.0.1:" + web.port + "/ml/");
    return { ctx, page };
  }
  const idle = (page, t) => page.waitForFunction(() => !MLA.busy(), null, { timeout: t || 60000, polling: 100 });
  const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: true }); } };
  const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  try {
    /* ---------- 第一次打开 ---------- */
    section("第一次打开");
    let { ctx, page } = await newPage();
    await page.waitForFunction(() => window.MLA && MLA.last, null, { timeout: 60000, polling: 200 }).catch(() => {});
    const first = await page.evaluate(() => ({ last: !!MLA.last, algos: (window.QL_MLALGOS || []).length, ds: MLA.REG.list.length, groups: MLA.REG.groups.length, tiles: document.querySelectorAll(".ml-tile").length, lock: !!document.getElementById("btnReveal") }));
    ok(first.algos >= 10 && first.ds >= 10 && first.groups === 5, "内置算法、数据集、五个任务分组都在", JSON.stringify(first));
    ok(first.last && first.tiles >= 4 && first.lock, "第一次打开自动跑了一次默认的算法：摘要有成绩，测试集遮着", JSON.stringify(first));
    await shot(page, "01-first");

    /* ---------- 揭晓与排行榜 ---------- */
    section("揭晓测试集、排行榜");
    await page.click("#btnReveal");
    let looks = await page.evaluate(() => MLA.looksText());
    ok(/看过 1 次/.test(looks) && !(await page.$("#btnReveal")), "揭晓之后显示测试集的成绩，记下看了一次", looks);
    await page.evaluate(() => MLA.run());
    await idle(page);
    await page.evaluate(() => MLA.setView("board"));
    const rows = await page.$$eval("table.ml-lb tbody tr", (t) => t.length);
    ok(rows >= 3, "同一个实验跑了两次：排行榜上两行（加基线一行）", String(rows));
    const lbText = await page.locator("table.ml-lb").innerText();
    ok(/McNemar|Holm/.test(await page.locator(".ml-note").first().innerText()) && /揭晓/.test(lbText), "排行榜说明了用什么检验；新的一行测试集还遮着");

    /* ---------- 每个任务、每个数据集 ---------- */
    section("五类任务，每个数据集跑一次默认的算法");
    await page.evaluate(() => { MLA.S.budget = 3; MLA.persist(); });
    const plan = await page.evaluate(() => MLA.REG.groups.map((g) => ({ g: g.id, ds: MLA.dsOf(g).map((d) => d.id) })));
    for (const G of plan) {
      for (const id of G.ds) {
        const r = await page.evaluate(async ({ g, id }) => {
          MLA.selectGroup(g); MLA.selectDs(id);
          // 大的数据集缩小一点：样本数类参数取下限附近
          var d = MLA.ds(), st = MLA.S.ds[g]; (d.params || []).forEach(function (q) { if (/^(n|nTrain|nSamples|samples|N|T|L|size)$/.test(q.key) && q.type !== "select") { st.params[id] = st.params[id] || {}; st.params[id][q.key] = Math.max(q.min, Math.min(q.def, q.min + (q.max - q.min) * 0.1)); } });
          MLA.persist(); MLA.renderLeft(); MLA.dataChanged();
          var a = MLA.algo(); if (!a) return { err: "没有算法" };
          try { var res = await MLA.run({ quiet: true }); return { ok: true, algo: a.name, pk: res.primary, v: res.metrics.valid[res.primary], b: res.baseline.metrics.valid[res.primary] }; }
          catch (e) { return { err: (e && e.message) || String(e), algo: a.name }; }
        }, { g: G.g, id });
        ok(r.ok && isFinite(r.v), G.g + " / " + id + "：" + (r.algo || "") + " 跑通", JSON.stringify(r));
        for (const v of ["charts", "inside", "anim", "data"]) await page.evaluate((v) => MLA.setView(v), v);
        await page.evaluate(() => MLA.setView("charts"));
      }
      await shot(page, "02-" + G.g);
    }
    ok(logs.length === 0, "走完所有数据集，页面没有报错", logs.slice(0, 5).join("\n"));

    /* ---------- 同一个数据集上换几种内置算法 ---------- */
    section("换算法");
    const swap = await page.evaluate(async () => {
      MLA.selectGroup("tab-cls"); var list = MLA.algosFor(MLA.ds()).filter((a) => a.src === "builtin"), out = [];
      for (var i = 0; i < list.length; i++) { MLA.selectAlgo(list[i].id); try { var r = await MLA.run({ quiet: true }); out.push([list[i].id, r.metrics.valid.acc]); } catch (e) { out.push([list[i].id, "ERR " + e.message]); } }
      return out;
    });
    ok(swap.length >= 6 && swap.every((x) => typeof x[1] === "number"), "表格分类的每个内置算法都能跑", JSON.stringify(swap));

    /* ---------- 代码编辑 ---------- */
    section("代码与说明");
    await page.click("#btnCode");
    await page.waitForSelector("#codeEdit");
    ok(await page.$eval("#codeEdit", (t) => t.readOnly), "内置算法的代码是只读的");
    await page.click('.modal-f button:has-text("另存为我的算法")');
    await page.waitForSelector("#codeEdit");
    ok(!(await page.$eval("#codeEdit", (t) => t.readOnly)) && /（改）/.test(await page.evaluate(() => MLA.algo().name)), "另存为我的算法以后可以改");
    await page.fill("#codeEdit", "function fit( {");
    await page.click('.modal-f button:has-text("保存并运行")');
    ok(/语法错误/.test(await page.locator(".ml-code-err").innerText()), "语法错误当场指出来，不运行");
    await page.keyboard.press("Escape");
    await page.evaluate(() => MLA.deleteMine(MLA.algo().id));

    /* ---------- 导入 CSV ---------- */
    section("导入 CSV");
    await page.evaluate(() => MLA.selectGroup("tab-reg"));
    await page.click('button:has-text("导入 CSV")');
    let csv = "x1,x2,color,y\n"; for (let i = 0; i < 300; i++) { const a = Math.sin(i * 1.7), b = Math.cos(i * 0.31); csv += a.toFixed(4) + "," + b.toFixed(4) + "," + (i % 3 ? "red" : "blue") + "," + (2 * a - b + (i % 3 ? 0.5 : 0) + 0.1 * Math.sin(i * 7.1)).toFixed(4) + "\n"; }
    await page.fill(".modal textarea", csv);
    await page.dispatchEvent(".modal textarea", "change");
    await page.click('.modal-f button:has-text("导入")');
    await page.waitForTimeout(300);
    const csvRun = await page.evaluate(async () => { var d = MLA.ds(); try { var r = await MLA.run({ quiet: true }); return { id: d.id, r2: r.metrics.valid.r2 }; } catch (e) { return { id: d.id, err: e.message }; } });
    ok(csvRun.id === "csv" && csvRun.r2 > 0.5, "导入的表格成了当前数据集，可以训练（类别列做了独热编码）", JSON.stringify(csvRun));

    /* ---------- 手册 ---------- */
    section("手册");
    await page.keyboard.press("?");
    await page.waitForSelector(".gd-art");
    const gd = await page.evaluate(() => ({ n: MLA.guideEntries().length, links: document.querySelectorAll(".gd-link").length, katexErr: document.querySelectorAll(".katex-error").length }));
    ok(gd.n >= 60 && gd.links >= 60, "手册的条目都在目录里", JSON.stringify(gd));
    await page.fill(".gd-search", "Holm");
    ok((await page.$$(".gd-link")).length >= 1, "手册可以搜索");
    const bad = await page.evaluate(async () => {
      var keys = MLA.guideEntries().map((e) => e.key), badK = [];
      for (var i = 0; i < keys.length; i++) { MLA.modalTop() && MLA.modalTop().close(); MLA.openGuide(keys[i]); await new Promise((r) => setTimeout(r, 5)); if (document.querySelector(".gd-art .katex-error")) badK.push(keys[i]); }
      MLA.modalTop() && MLA.modalTop().close(); return badK;
    });
    ok(bad.length === 0, "手册的每一页都没有公式错误", bad.join(", "));

    /* ---------- AI ---------- */
    section("AI：接入假服务商");
    await ctx.close();
    ({ ctx, page } = await newPage({ init: `try { localStorage.setItem("ql.ai.v1", ${JSON.stringify(JSON.stringify({ p: "custom", by: { custom: { base: BASE, key: "test-key-ok", model: "mock-pro" } } }))}); localStorage.setItem("ql.ml.v1", JSON.stringify({ v: 1, group: "tab-cls", ds: {}, algo: {}, my: [], budget: 4, split: { train: 0.6, valid: 0.2 }, horizon: 1, view: "charts", flags: { welcomed: 1 } })); } catch (e) {}` }));
    await page.waitForFunction(() => window.MLA && MLA.preview, null, { timeout: 30000 });
    await page.click("#btnAI");
    ok((await page.locator("#aiProv").innerText()) === "AI · mock-pro" && !(await page.locator("#aiSend").isDisabled()), "已接入：面板顶上显示模型，可以输入");
    const send = async (t) => { await page.fill("#aiInput", t); await page.click("#aiSend"); await page.waitForFunction(() => !document.getElementById("aiStop") || document.getElementById("aiStop").hidden, null, { timeout: 60000, polling: 100 }); await idle(page); };
    section("AI：写算法");
    await send("写一个逻辑回归");
    let st = await page.evaluate(() => ({ a: MLA.algo() && MLA.algo().name, src: MLA.algo() && MLA.algo().src, last: MLA.last && MLA.last.algo.name, log: document.getElementById("aiLog").innerText.slice(-400) }));
    ok(st.src === "ai" && st.last === "逻辑回归（AI）" && /运行完成/.test(st.log), "AI 写的算法存进“AI 写的”并运行了一次", JSON.stringify(st));
    const p1 = ai.calls.filter((c) => /chat/.test(c.path)).pop().body.messages[0].content;
    ok(/function predict\(model, X, n\)/.test(p1) && /两个半月|数据集/.test(p1) && !/测试集：.*准确率 \d/.test(p1), "提示词里有接口、数据集；没有测试集的成绩");
    section("AI：写坏了让它修");
    await send("写一个坏的逻辑回归");
    st = await page.evaluate(() => document.getElementById("aiLog").innerText.slice(-300));
    ok(/运行出错/.test(st) && /undefinedFunction/.test(st), "运行出错时把错误显示出来", st);
    await page.click('#aiLog button:has-text("修")');
    await page.waitForFunction(() => document.getElementById("aiStop").hidden, null, { timeout: 60000 }); await idle(page);
    st = await page.evaluate(() => ({ last: MLA.last && MLA.last.algo.name, prompt: "" }));
    const pf = ai.calls.filter((c) => /chat/.test(c.path)).pop().body.messages[0].content;
    ok(st.last === "修好的逻辑回归" && /# 运行时的错误/.test(pf) && /undefinedFunction/.test(pf), "让 AI 修：把出错的代码和错误一起发过去，修好的版本跑通", JSON.stringify(st));
    section("AI：诊断");
    await page.click('#aiModes button:has-text("诊断")');
    await page.evaluate(() => MLA.aiDiagnose());
    await page.waitForFunction(() => document.getElementById("aiStop").hidden && /下一步/.test(document.getElementById("aiLog").innerText), null, { timeout: 60000 });
    ok(/偏差还是方差/.test(await page.locator("#aiLog").innerText()) && (await page.$$("#aiLog .katex")).length > 0, "诊断报告渲染出来（含公式）");
    section("AI：自动改进");
    await page.evaluate(() => { document.querySelector('#aiRoundsWrap select').value = "2"; });
    await page.evaluate(() => MLA.aiImprove());
    await page.waitForFunction(() => /结束：/.test(document.getElementById("aiLog").innerText), null, { timeout: 120000, polling: 200 });
    const imp = await page.locator("#aiLog").innerText();
    ok(/第 1 轮|多迭代的逻辑回归/.test(imp) && /结束：/.test(imp) && /只按验证集/.test(imp), "自动改进跑完两轮，给出结论", imp.slice(-300));
    const pImp = ai.calls.filter((c) => /chat/.test(c.path) && /这是第 2 轮/.test(c.body.messages[0].content)).pop();
    ok(pImp && /这一轮自动改进之前试过的版本/.test(pImp.body.messages[0].content), "第二轮的提示词里有第一轮的结果");
    section("AI：问结果");
    await page.click('#aiModes button:has-text("问结果")');
    await send("为什么训练集和验证集差不多？");
    ok(/在误差之内/.test(await page.locator("#aiLog").innerText()), "问结果有回答");
    ok(ai.calls.every((c) => c.key === "test-key-ok"), "所有请求都带着设置里的密钥，只发往设置里的接口");

    /* ---------- 窄屏与暗色 ---------- */
    section("窄屏与暗色");
    await ctx.close();
    ({ ctx, page } = await newPage({ viewport: { width: 380, height: 800 }, dark: true }));
    await page.waitForFunction(() => window.MLA && MLA.last, null, { timeout: 60000, polling: 200 }).catch(() => {});
    for (const t of ["ctl", "res"]) { await page.evaluate((t) => MLA.setTab(t), t); for (const v of ["charts", "board", "inside", "anim", "data"]) { await page.evaluate((v) => MLA.setView(v), v); await page.waitForTimeout(150); const o = await overflow(page); ok(o <= 1, "手机宽度（" + t + " / " + v + "）没有横向滚动条", String(o)); } }
    await shot(page, "09-phone-dark");
    await ctx.close();
    const ext = external.filter((x) => !/^fonts\.(googleapis|gstatic)\.com$/.test(x));
    ok(ext.length === 0, "页面没有向外发请求（网页字体之外）", ext.join(", "));
    ok(logs.length === 0, "整个测试里页面没有报错", logs.slice(0, 6).join("\n"));
  } catch (e) {
    console.log("CRASH: " + (e && e.stack || e));
  }
  await browser.close(); await web.close(); await ai.close();
  console.log("page logs: " + logs.length);
  done();
})();
