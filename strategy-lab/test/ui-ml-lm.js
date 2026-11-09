// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 亲手写 · 语言模型（ml/lm/）+ 本机引擎：起一个真的引擎（只要 numpy），从 /ml/lm/?engine=令牌 打开页面，
// 像学的人一样：先交起始代码（应该报"还没写"）、再交照公式直接写的 softmax（应该只挂"大数不溢出"）、再交对的；
// 后面四步交 numpy 的写法，全部通过；预测台账记下了预测；行号换算成"第几步第几行"；手机宽度没有横向滚动。
// 用法：node test/ui-ml-lm.js   （先 python3 build.py；没有 python3 或 numpy 时跳过）
const { spawn, execFileSync } = require("child_process"), path = require("path");
function need(name, fallback) { try { return require(name); } catch (e) { return require(fallback); } }
const { chromium } = need("playwright", "/opt/npm-tools/node_modules/playwright");
const { ok, section, done } = require("./harness.js");
const ENGINE = path.join(__dirname, "../ml-engine");

const NAIVE = "def softmax(x, dim=-1):\n    e = np.exp(x)\n    return e / e.sum(axis=dim, keepdims=True)\n";
const GOOD = {
  softmax: "def softmax(x, dim=-1):\n    e = np.exp(x - x.max(axis=dim, keepdims=True))\n    return e / e.sum(axis=dim, keepdims=True)\n",
  cross_entropy: "def cross_entropy(logits, targets):\n    z = logits.reshape(-1, logits.shape[-1])\n    t = targets.reshape(-1)\n    m = z.max(axis=1, keepdims=True)\n    lse = m[:, 0] + np.log(np.exp(z - m).sum(axis=1))\n    return (lse - z[np.arange(len(t)), t]).mean()\n",
  linear: "class Linear:\n    def __init__(self, n_in, n_out):\n        self.weight = np.random.normal(0, 1 / math.sqrt(n_in), size=(n_out, n_in)).astype(np.float32)\n\n    def __call__(self, x):\n        return x @ self.weight.T\n",
  embedding: "class Embedding:\n    def __init__(self, n, d):\n        self.weight = np.random.normal(0, 1, size=(n, d)).astype(np.float32)\n\n    def __call__(self, ids):\n        return self.weight[ids]\n",
  attention: "def causal_attention(q, k, v):\n    T, d = q.shape[-2], q.shape[-1]\n    s = q @ np.swapaxes(k, -1, -2) / math.sqrt(d)\n    s = np.where(np.tril(np.ones((T, T), dtype=bool)), s, -np.inf)\n    return softmax(s, -1) @ v\n"
};

(async () => {
  try { execFileSync("python3", ["-c", "import numpy"], { stdio: "ignore" }); } catch (e) { console.log("SKIP: 没有 python3 或 numpy"); console.log("0 passed, 0 failed"); return; }
  const port = 19300 + Math.floor(Math.random() * 500);
  const proc = spawn("python3", ["-m", "mllab_engine", "--port", String(port), "--no-browser"], { cwd: ENGINE, stdio: ["ignore", "pipe", "pipe"], env: Object.assign({}, process.env, { MLLAB_DEVICE: "cpu" }) });
  let out = "";
  proc.stdout.on("data", (d) => { out += d; }); proc.stderr.on("data", (d) => { out += d; });
  const url = await new Promise((resolve) => { const t0 = Date.now(); (function poll() { const m = /http:\/\/127\.0\.0\.1:(\d+)\/ml\/\?engine=([A-Za-z0-9_-]+)/.exec(out); if (m) resolve(m[0]); else if (Date.now() - t0 > 20000) resolve(null); else setTimeout(poll, 100); })(); });
  const browser = await chromium.launch(); const logs = [];
  try {
    section("打开页面");
    ok(!!url, "引擎打印了带令牌的网址", out.slice(0, 300));
    if (!url) throw new Error("引擎没有起来");
    const lmUrl = url.replace("/ml/?", "/ml/lm/?");
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } }), page = await ctx.newPage();
    page.on("pageerror", (e) => logs.push("[pageerror] " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/ERR_TUNNEL|ERR_FAILED|fonts\.g|net::/.test(m.text())) logs.push("[console] " + m.text()); });
    await page.route((u) => u.hostname !== "127.0.0.1", (rt) => rt.abort());
    page.on("dialog", (d) => d.accept());
    await page.goto(lmUrl);
    await page.waitForSelector("#blkEngine .lm-eng.ok", { timeout: 20000 });
    const eng = await page.locator("#blkEngine").innerText();
    ok(/没有 PyTorch/.test(eng) && /numpy/.test(eng), "连上引擎；没有 PyTorch 时起始代码换成 numpy", eng);
    ok(await page.locator(".lm-step").count() === 7, "左栏：总览 + 6 步");
    const back = await page.locator("#btnBack").getAttribute("href");
    ok(/^\.\.\/\?engine=/.test(back), "回到实验室的链接带着令牌", back);

    async function runStep(n, code, pred) {
      await page.locator(".lm-step").nth(n).click();
      if (code != null) await page.locator("textarea.lm-code").fill(code);
      if (pred != null) await page.locator(".lm-pnum").fill(String(pred));
      await page.locator(".lm-actions .btn.primary").click();
      await page.waitForFunction(() => { const o = document.querySelector(".lm-out"); return o && !o.hidden && !o.querySelector(".spin"); }, null, { timeout: 60000 });
      return page.evaluate(() => ({ head: document.querySelector(".lm-outhead").innerText, fails: Array.from(document.querySelectorAll(".ck.fail .ck-say")).map((e) => e.textContent), notes: Array.from(document.querySelectorAll(".ck.fail .ck-note")).map((e) => e.textContent), err: (document.querySelector(".lm-out .warn") || {}).innerText || "" }));
    }

    section("第 1 步：先撞上溢出，再改对");
    let r = await runStep(1, null, 4);
    ok(/没能运行完/.test(r.head) && /还没有函数 softmax|NotImplementedError/.test(r.err) || r.fails.length >= 5, "起始代码：报没写", JSON.stringify(r).slice(0, 300));
    r = await runStep(1, NAIVE, 4);
    ok(/通过 4 \/ 5/.test(r.head) && r.fails.length === 1 && /大数不溢出/.test(r.fails[0]), "照公式直接写：只挂“大数不溢出”", JSON.stringify(r));
    r = await runStep(1, GOOD.softmax, 5);
    ok(/全部通过：5 \/ 5/.test(r.head), "减去最大值：全部通过", JSON.stringify(r));
    r = await runStep(1, "import scipy.special\ndef softmax(x, dim=-1):\n    return scipy.special.softmax(x, axis=dim)\n");
    ok(r.fails.some((f) => /从零写/.test(f)) && r.notes.some((n) => /第 1 步的第 3 行/.test(n)), "调用现成的 softmax：被抓到，位置换算成第几步第几行", JSON.stringify(r));
    await runStep(1, GOOD.softmax, 5);

    section("第 2—5 步");
    for (const [n, id] of [[2, "cross_entropy"], [3, "linear"], [4, "embedding"], [5, "attention"]]) {
      r = await runStep(n, GOOD[id], n === 2 ? 4 : null);
      ok(/全部通过/.test(r.head), "第 " + n + " 步（" + id + "）全部通过", JSON.stringify(r));
    }
    r = await runStep(5, GOOD.attention.replace("    s = np.where(np.tril(np.ones((T, T), dtype=bool)), s, -np.inf)\n", ""));
    ok(r.fails.some((f) => /因果性/.test(f)), "去掉掩码：因果性那一项挂掉", JSON.stringify(r.fails));
    await runStep(5, GOOD.attention);
    r = await runStep(2, GOOD.cross_entropy.replace("    t = targets", "    t = targets +\n"));
    ok(/语法错误|SyntaxError/.test(r.err) && /第 2 步的第 \d+ 行/.test(r.err), "语法错误：报出是第 2 步的哪一行", r.err.slice(0, 200));
    await runStep(2, GOOD.cross_entropy);
    const marks = await page.locator(".lm-step.ok").count();
    ok(marks === 5, "左栏 5 步打了勾", String(marks));

    section("第 6 步：没有 PyTorch 时不让训练");
    await page.locator(".lm-step").nth(6).click();
    ok(await page.locator("textarea.lm-code").count() === 0, "训练这一步不用写代码");
    await page.locator(".lm-actions .btn.primary").click();
    await page.waitForSelector(".toast", { timeout: 5000 });
    ok(/PyTorch/.test(await page.locator(".toast").last().innerText()), "提示要装 PyTorch");

    section("预测台账");
    await page.locator("#btnLedger").click();
    const led = await page.locator(".lm-ledger").innerText();
    ok(/写了预测的运行 \d+ 次/.test(led) && (await page.locator(".lm-ledger tbody tr").count()) >= 8, "台账记下了每次运行", led.slice(0, 200));
    ok(/猜中 [1-9]/.test(led), "猜中的那几次计了分", led.slice(0, 120));
    await page.keyboard.press("Escape");

    section("刷新以后");
    await page.reload();
    await page.waitForSelector("#blkEngine .lm-eng.ok", { timeout: 20000 });
    ok(await page.locator(".lm-step.ok").count() === 5, "进度还在");
    await page.locator(".lm-step").nth(3).click();
    ok((await page.locator("textarea.lm-code").inputValue()).indexOf("class Linear") >= 0, "代码还在");
    ok(/全部通过/.test(await page.locator(".lm-outhead").innerText()), "上一次的结果还在");

    section("手机宽度");
    const m = await browser.newContext({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true }), mp = await m.newPage();
    mp.on("pageerror", (e) => logs.push("[pageerror mobile] " + e.message));
    await mp.route((u) => u.hostname !== "127.0.0.1", (rt) => rt.abort());
    await mp.goto(lmUrl);
    await mp.waitForSelector(".lm-card");
    for (const tab of ["res", "ctl"]) {
      await mp.locator('#tabs button[data-tab="' + tab + '"]').click();
      const over = await mp.evaluate(() => { const els = Array.from(document.querySelectorAll("body *")).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1 && getComputedStyle(e).position !== "fixed"; }); return { sw: document.documentElement.scrollWidth, w: window.innerWidth, els: els.slice(0, 5).map((e) => e.tagName + "." + e.className) }; });
      ok(over.sw <= over.w + 1, "手机宽度没有横向滚动（" + tab + "）", JSON.stringify(over));
    }
    await m.close();
    ok(logs.length === 0, "页面没有报错", logs.join("\n"));
    await ctx.close();
  } catch (e) { console.log("CRASH: " + (e && e.stack || e)); }
  await browser.close();
  proc.kill("SIGTERM");
  console.log("page logs: " + logs.length);
  done();
})();
