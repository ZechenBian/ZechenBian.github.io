// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 机器学习实验室 + 本机 Python 引擎（第二期）：起一个真的引擎（只要 numpy），从它打印的网址打开页面，
// 用三个 numpy 写的示例算法（分类、回归、时间序列）各跑一次，核对页面拿到的成绩和浏览器里的打分方式一致；
// 再核对没有令牌、令牌不对、别的来源都调不了引擎。用法：node test/ui-ml-engine.js   （先 python3 build.py；没有 python3 或 numpy 时跳过）
const { spawn, execFileSync } = require("child_process"), path = require("path"), http = require("http");
function need(name, fallback) { try { return require(name); } catch (e) { return require(fallback); } }
const { chromium } = need("playwright", "/opt/npm-tools/node_modules/playwright");
const { ok, section, done } = require("./harness.js");
const ENGINE = path.join(__dirname, "../ml-engine");

function req(port, method, p, headers, body) {
  return new Promise((resolve) => {
    const r = http.request({ host: "127.0.0.1", port, method, path: p, headers: headers || {} }, (res) => { let t = ""; res.on("data", (d) => { t += d; }); res.on("end", () => resolve({ status: res.statusCode, text: t, headers: res.headers })); });
    r.on("error", (e) => resolve({ status: 0, text: String(e) }));
    if (body) r.write(body); r.end();
  });
}

(async () => {
  try { execFileSync("python3", ["-c", "import numpy"], { stdio: "ignore" }); } catch (e) { console.log("SKIP: 没有 python3 或 numpy"); console.log("0 passed, 0 failed"); return; }
  const port = 18700 + Math.floor(Math.random() * 500);
  const proc = spawn("python3", ["-m", "mllab_engine", "--port", String(port), "--no-browser"], { cwd: ENGINE, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  proc.stdout.on("data", (d) => { out += d; }); proc.stderr.on("data", (d) => { out += d; });
  const url = await new Promise((resolve) => { const t0 = Date.now(); (function poll() { const m = /http:\/\/127\.0\.0\.1:(\d+)\/ml\/\?engine=([A-Za-z0-9_-]+)/.exec(out); if (m) resolve(m[0]); else if (Date.now() - t0 > 30000) resolve(null); else setTimeout(poll, 100); })(); });
  const browser = await chromium.launch(); const logs = [];
  try {
    section("引擎启动");
    ok(!!url, "引擎打印了带令牌的网址", out.slice(0, 400));
    if (!url) throw new Error("引擎没有起来");
    const P = +/:(\d+)\//.exec(url)[1], TOKEN = /engine=([^&]+)/.exec(url)[1];
    section("安全");
    let r = await req(P, "GET", "/api/info", { Host: "127.0.0.1:" + P });
    ok(r.status === 401, "没带令牌：401", String(r.status));
    r = await req(P, "GET", "/api/info", { Host: "127.0.0.1:" + P, "X-QLML-Token": "wrong" });
    ok(r.status === 401, "令牌不对：401", String(r.status));
    r = await req(P, "GET", "/api/info", { Host: "127.0.0.1:" + P, "X-QLML-Token": TOKEN, Origin: "https://evil.example" });
    ok(r.status === 403, "别的来源：403", String(r.status));
    r = await req(P, "GET", "/api/info", { Host: "evil.example:" + P, "X-QLML-Token": TOKEN });
    ok(r.status === 403, "Host 不是本机（防 DNS 重绑定）：403", String(r.status));
    r = await req(P, "GET", "/ml/", { Host: "127.0.0.1:" + P });
    ok(r.status === 200 && /"needToken":true/.test(r.text) && r.text.indexOf(TOKEN) < 0, "不带令牌打开页面：页面里没有令牌，提示要用打印的网址");
    r = await req(P, "GET", "/api/info", { Host: "127.0.0.1:" + P, "X-QLML-Token": TOKEN });
    ok(r.status === 200 && !r.headers["access-control-allow-origin"], "带令牌：200，而且没有跨域的回应头");

    section("页面连上引擎");
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }), page = await ctx.newPage();
    page.on("pageerror", (e) => logs.push("[pageerror] " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/ERR_TUNNEL|ERR_FAILED|fonts\.g/.test(m.text())) logs.push("[console] " + m.text()); });
    await page.route((u) => u.hostname !== "127.0.0.1", (rt) => rt.abort());
    await page.addInitScript(() => { try { localStorage.setItem("ql.ml.v1", JSON.stringify({ v: 1, group: "tab-cls", ds: {}, algo: {}, my: [], budget: 6, split: { train: 0.6, valid: 0.2 }, horizon: 1, view: "charts", flags: { welcomed: 1 } })); } catch (e) {} });
    await page.goto(url);
    await page.waitForFunction(() => window.MLA && MLA.engineReady && MLA.engineReady(), null, { timeout: 20000 });
    const btn = await page.locator("#btnEngine").innerText();
    const py = await page.evaluate(() => (window.QL_MLPY || []).map((x) => x.id));
    ok(/本机引擎 · /.test(btn) && py.indexOf("py-softmax_numpy") >= 0 && py.indexOf("py-ridge_numpy") >= 0 && py.indexOf("py-ar_numpy") >= 0, "顶栏显示已连上；算法列表里有引擎的示例", btn + " " + py.join(","));

    section("在引擎里训练，在页面里打分");
    for (const [g, id, min] of [["tab-cls", "py-softmax_numpy", 0.7], ["tab-reg", "py-ridge_numpy", null], ["ts", "py-ar_numpy", null]]) {
      const res = await page.evaluate(async ([g, id]) => {
        MLA.selectGroup(g); await new Promise((r) => setTimeout(r, 300));
        if (MLA.algosFor(MLA.ds()).map((a) => a.id).indexOf(id) < 0) return { err: "不在列表里" };
        MLA.selectAlgo(id);
        try { const r = await MLA.run(); return { ds: MLA.ds().id, pk: r.primary, v: r.metrics.valid[r.primary], b: r.baseline.metrics.valid[r.primary], engine: r.engine, curve: r.curve.length, snaps: (r.snaps || []).length, kind: r.kind, nPred: r.pred.valid.length, lossLen: r.loss.valid.length }; }
        catch (e) { return { err: e.message, line: e.line }; }
      }, [g, id]);
      ok(!res.err && res.engine === "py" && isFinite(res.v) && res.lossLen > 0, g + " / " + id + "：跑通，结果来自引擎，逐样本损失在页面里算出来", JSON.stringify(res));
      if (min != null) ok(res.v >= min, g + "：验证集准确率说得过去", String(res.v));
      if (g === "tab-cls") ok(res.snaps >= 3, "二维分类：引擎拍的决策面快照拼成了回放", String(res.snaps));
    }
    section("出错的 Python 代码");
    const bad = await page.evaluate(async () => {
      MLA.selectGroup("tab-reg"); await new Promise((r) => setTimeout(r, 200));
      const rec = MLA.saveMine({ name: "坏的 Python", code: "def fit(data, p, lib, ctx):\n    x = 1\n    return undefined_name\n\ndef predict(model, X):\n    return X[:, 0]\n", params: [], src: "mine", lang: "py", api: "supervised", kinds: ["regression"], families: ["tabular"] });
      MLA.selectAlgo(rec.id);
      try { await MLA.run(); return { err: null }; } catch (e) { return { err: e.message, line: e.line }; }
    });
    ok(/NameError/.test(bad.err || "") && bad.line === 3, "Python 的错误和行号传回页面", JSON.stringify(bad));
    ok(logs.length === 0, "页面没有报错", logs.join("\n"));
    await ctx.close();
  } catch (e) { console.log("CRASH: " + (e && e.stack || e)); }
  await browser.close();
  proc.kill("SIGTERM");
  console.log("page logs: " + logs.length);
  done();
})();
