// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 隔离环境和十项全能：别人的代码在沙箱里到底碰不碰得到页面、连不连得了网；十项全能的界面、和引擎对数、
// 大家的榜（GitHub 的接口换成本机的假数据）、把榜上的规则载入之后在隔离环境里照常回测
const path = require("path"), { open } = require("./ui-smoke.js");
const SH = n => path.join(__dirname, "../shots/" + n);
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) { pass++; if (process.env.VERBOSE) console.log("  ok  ", name, d === undefined ? "" : "  " + String(d).slice(0, 300)); } else { fail++; console.log("  FAIL", name, d === undefined ? "" : "  " + String(d).slice(0, 600)); } };
(async () => {
  const t = await open({ standalone: true, viewport: { width: 1280, height: 950 } }), page = t.page, logs = t.logs;
  const hub = { items: [], calls: 0 }, hits = [];
  await page.route("https://api.github.com/**", r => { hub.calls++; r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: JSON.stringify(hub.items) }); });
  await page.route("**/__probe__*", r => { hits.push(r.request().url()); r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "text/plain", body: "reached" }); });
  await page.clock.setFixedTime(new Date("2026-10-14T09:00:00Z")); await page.reload();
  await page.waitForFunction(() => window.App && window.App.openDeca && !window.App.isBusy, null, { timeout: 60000 });
  const txt = sel => page.locator(sel).first().innerText();
  const closeAll = async () => { for (let i = 0; i < 5 && (await page.locator(".modal").count()); i++) { await page.keyboard.press("Escape"); await page.waitForTimeout(80); } };
  const pct = s => { s = String(s).replace("−", "-").replace(/[^0-9.\-]/g, ""); return parseFloat(s) / 100; };

  console.log("== 一、隔离环境：里面的线程碰不到页面，也连不了网");
  await page.evaluate(() => { localStorage.setItem("secret.token", "sk-should-never-leak"); });
  const probe = await page.evaluate(origin => new Promise(resolve => {
    // 沙箱里的线程把能试的都试一遍，逐项报回来
    const src = `
      const out = {}, base = ${JSON.stringify(origin)};
      const step = (k, f) => f().then(v => { out[k] = v; }, e => { out[k] = "blocked: " + (e && e.name || e); });
      (async () => {
        out.origin = self.origin; out.href = String(self.location.href).slice(0, 5);
        try { out.eval = eval("1+1"); } catch (e) { out.eval = "blocked: " + e.name; }
        try { out.fn = new Function("return 7")(); } catch (e) { out.fn = "blocked: " + e.name; }
        try { out.asyncFn = Object.getPrototypeOf(async function () {}).constructor("return 7") ? "made" : ""; } catch (e) { out.asyncFn = "blocked: " + e.name; }
        try { importScripts(base + "/__probe__import.js"); out.importScripts = "loaded"; } catch (e) { out.importScripts = "blocked: " + e.name; }
        await step("fetchSame", () => fetch(base + "/__probe__fetch").then(r => r.text()));
        await step("fetchOther", () => fetch("https://example.com/__probe__x").then(r => r.text()));
        await step("xhr", () => new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open("GET", base + "/__probe__xhr"); x.onload = () => res("loaded"); x.onerror = () => rej({ name: "NetworkError" }); x.send(); }));
        await step("ws", () => new Promise((res, rej) => { try { const w = new WebSocket("ws://127.0.0.1:9/__probe__ws"); w.onopen = () => res("open"); w.onerror = () => rej({ name: "error" }); } catch (e) { rej(e); } }));
        await step("beacon", () => Promise.resolve(typeof navigator.sendBeacon === "function" ? String(navigator.sendBeacon(base + "/__probe__beacon", "x")) : "none"));
        await step("idb", () => new Promise((res, rej) => { try { const q = indexedDB.open("x"); q.onsuccess = () => res("opened"); q.onerror = () => rej({ name: "error" }); } catch (e) { rej(e); } }));
        await step("caches", () => (typeof caches === "undefined" ? Promise.resolve("none") : caches.open("x").then(() => "opened")));
        await step("dynImport", () => import(base + "/__probe__dyn.js").then(() => "loaded"));
        out.localStorage = typeof localStorage; out.document = typeof document; out.parent = typeof parent; out.cookie = typeof cookieStore;
        postMessage(out);
      })();`;
    const w = QLSandbox.spawn(src); w.onmessage = e => { w.terminate(); resolve(e.data); }; w.onerror = e => resolve({ error: e.message, sandbox: e.sandbox });
    setTimeout(() => resolve({ error: "timeout" }), 15000);
  }), `http://127.0.0.1:${t.port}`);
  ok(!probe.error, "沙箱开得起来，里面的线程能把话传出来", JSON.stringify(probe));
  ok(probe.origin === "null" && probe.href === "blob:", "线程的来源是空来源（不是这张页面的来源）", probe.origin + " " + probe.href);
  ok(/^blocked/.test(String(probe.eval)) && /^blocked/.test(String(probe.fn)) && /^blocked/.test(String(probe.asyncFn)), "eval、new Function、异步函数的构造器都被禁掉：没法现造代码去够全局对象", JSON.stringify([probe.eval, probe.fn, probe.asyncFn]));
  ok(/^blocked/.test(probe.fetchSame) && /^blocked/.test(probe.fetchOther) && /^blocked/.test(probe.xhr) && /^blocked/.test(probe.ws) && /^blocked/.test(probe.importScripts) && /^blocked/.test(probe.dynImport), "fetch、XHR、WebSocket、importScripts、动态 import 全都发不出去", JSON.stringify(probe));
  ok(/^blocked/.test(probe.idb) && (probe.caches === "none" || /^blocked/.test(probe.caches)) && probe.localStorage === "undefined" && probe.document === "undefined" && probe.parent === "undefined", "读不到页面的存储：IndexedDB、缓存都打不开，线程里本来也没有 localStorage 和 DOM", JSON.stringify([probe.idb, probe.caches]));
  await page.waitForTimeout(300);
  ok(hits.length === 0, "测试服务器一次也没收到沙箱里发来的请求", hits.join(" "));
  // 页面自己（不在沙箱里）当然发得出去：证明上面那些"发不出去"不是因为地址本身不通
  const plain = await page.evaluate(origin => fetch(origin + "/__probe__plain").then(r => r.text()), `http://127.0.0.1:${t.port}`);
  ok(plain === "reached" && hits.length === 1, "同一个地址，页面自己去取是取得到的");
  const loop = await page.evaluate(() => new Promise(resolve => { const t0 = Date.now(), w = QLSandbox.spawn("postMessage('started'); for (;;) {}"); w.onmessage = () => { setTimeout(() => { w.terminate(); resolve({ ms: Date.now() - t0, frames: document.querySelectorAll('iframe[sandbox]').length }); }, 400); }; }));
  ok(loop.frames === 0 && loop.ms < 5000, "里面的线程死循环：外面把沙箱页拿掉就完事了，页面不受影响", JSON.stringify(loop));
  ok((await page.evaluate(() => { const f = document.createElement("iframe"); return QLSandbox.CSP; })).includes("default-src 'none'"), "沙箱页的内容安全策略以 default-src 'none' 打底");

  console.log("== 二、十项全能：入口、走一遍、和引擎对数");
  await page.click("#btnLobby"); await page.waitForSelector('.lb-card[data-card="deca"]');
  ok((await txt('.lb-card[data-card="deca"] .lb-status')).includes("2026-10-12"), "大厅的卡片写着这个赛季（这个星期一）", await txt('.lb-card[data-card="deca"] .lb-status'));
  await page.click('.lb-card[data-card="deca"] [data-go]'); await page.waitForSelector("#dcRule");
  ok((await txt("#dcSeason")).includes("2026-10-12") && (await txt("#dcSeason")).includes("5 天"), "弹层里写着赛季和还有几天换种子", await txt("#dcSeason"));
  const opts = await page.evaluate(() => Array.from(document.querySelectorAll("#dcRule option")).map(o => o.value));
  ok(opts.includes("voltarget") && opts.includes("hold") && !opts.some(v => /^lock_|^sec_|^coin_/.test(v)), "能选的是价格世界的规则，玩法自带的规则不在里面", opts.length);
  await page.selectOption("#dcRule", "voltarget"); await page.waitForTimeout(100);
  ok((await txt("#dcParams")).includes("target = 15") && (await txt("#dcParams")).includes("n = 20"), "写明用的是哪组参数", await txt("#dcParams"));
  await page.click("#dcRun"); await page.waitForSelector("#dcScore", { timeout: 60000 });
  const ui1 = await page.evaluate(() => ({ score: document.querySelector("#dcScore").innerText, say: document.querySelector("#dcSay").innerText, rows: Array.from(document.querySelectorAll(".dc-tab tbody tr")).map(tr => ({ ev: tr.getAttribute("data-ev"), worst: tr.classList.contains("worst"), cells: Array.from(tr.children).map(td => td.innerText.trim()) })) }));
  const eng = await page.evaluate(() => {
    const QL = window.App.QL, st = QL_STRATS.filter(s => s.id === "voltarget")[0], S = new Function('"use strict";\n' + st.code + '\n;return { init: typeof init === "function" ? init : null, decide: decide };')(), p = {}; st.params.forEach(q => { p[q.key] = q.def; });
    const se = QL.decaSeason(Date.now()), cache = {}, rows = QL.DECA.events.map(e => QL.decaEvent(e, se.seed, S, p, QL.DECA.N, cache)), sc = QL.decaScore(rows);
    return { rows: rows.map(r => ({ id: r.id, d: r.d, growth: r.growth, bench: r.bench })), score: sc.score, worst: sc.worst, name: QL.WORLDS[sc.worst].short };
  });
  ok(ui1.rows.length === 10 && ui1.rows.every((r, i) => r.ev === eng.rows[i].id && Math.abs(pct(r.cells[1]) - eng.rows[i].bench) < 6e-5 && Math.abs(pct(r.cells[2]) - eng.rows[i].growth) < 6e-5 && Math.abs(pct(r.cells[3].split("±")[0]) - eng.rows[i].d) < 6e-5), "十行的三个数都等于引擎直接算的（沙箱里跑的和页面里算的一致）", JSON.stringify(ui1.rows.slice(0, 2)));
  ok(Math.abs(pct(ui1.score) - eng.score) < 6e-5 && ui1.rows.filter(r => r.worst).length === 1 && ui1.rows.filter(r => r.worst)[0].ev === eng.worst && ui1.say.includes(eng.name), "得分是最差的那一项；那一行标了出来，下面那句话说的也是它", ui1.score + " / " + ui1.say);
  ok((await page.locator("#dcPost").count()) === 0 && (await txt("#dcOut")).includes("内置规则人人都有"), "内置规则不让贴榜，并说明怎么才能上榜");
  await page.screenshot({ path: SH("deca-mine.png") });
  await page.click("#dcRefBtn"); await page.waitForSelector("#dcRefTab", { timeout: 90000 });
  const refs = await page.evaluate(() => Array.from(document.querySelectorAll("#dcRefTab tbody tr")).map(tr => ({ me: !!tr.getAttribute("data-me"), cells: Array.from(tr.children).map(td => td.innerText.trim()) })));
  const holdRow = refs.filter(r => r.cells[1] === "买入持有")[0], scores = refs.map(r => pct(r.cells[2]));
  ok(refs.length === 15 && refs.filter(r => r.me).length === 1 && holdRow && pct(holdRow.cells[2]) === 0, "和 14 条内置规则排在一起：眼下这条标了出来，买入持有恰好是 0", refs.length + " " + JSON.stringify(holdRow));
  ok(scores.every((v, i) => i === 0 || v <= scores[i - 1] + 1e-12) && refs.every((r, i) => +r.cells[0] === i + 1), "按得分从高到低排，名次连着数");
  ok(Math.abs(pct(refs.filter(r => r.me)[0].cells[2]) - eng.score) < 6e-5, "表里眼下这条的得分和上面的一样");
  await page.selectOption("#dcRule", "hold"); await page.waitForTimeout(100); await page.click("#dcRun"); await page.waitForSelector("#dcScore", { timeout: 60000 });
  ok(pct(await txt("#dcScore")) === 0 && (await txt("#dcSay")).includes("打平") && (await page.locator("#dcRefTab").count()) === 1, "换成买入持有：得分 0，说法是\"打平\"；内置规则那张表不用重算，直接摆出来");
  await page.selectOption("#dcRule", "voltarget"); await page.waitForSelector("#dcScore");
  ok(Math.abs(pct(await txt("#dcScore")) - eng.score) < 6e-5, "换回刚才那条：结果还在，不用再跑一遍");

  console.log("== 三、我自己的规则：贴到榜上");
  await closeAll();
  const mineCode = "// 我的规则：过去 n 步涨了就满仓，否则半仓\nfunction decide(s, p) {\n  var m = s.mom(p.n);\n  return m > 0 ? p.hi : p.lo;   // 数据不够时 m 是 NaN，走 lo\n}";
  await page.evaluate(code => { const A = window.App; A.saveMy({ id: "my-test1", name: "涨了就满仓", group: "我的策略", summary: "测试用", params: [{ key: "n", label: "回看几步", def: 20, min: 2, max: 200, step: 1, type: "num" }, { key: "hi", label: "涨时的仓位", def: 1, min: 0, max: 3, step: 0.05, type: "num" }, { key: "lo", label: "跌时的仓位", def: 0.5, min: 0, max: 3, step: 0.05, type: "num" }], code, src: "edit" }); A.setStrat("my-test1"); }, mineCode);
  await page.waitForFunction(() => !window.App.isBusy); await page.evaluate(() => window.App.openDeca()); await page.waitForSelector("#dcRule");
  ok((await page.inputValue("#dcRule")) === "my-test1", "眼下选用的是价格规则时，十项全能默认就用它");
  await page.click("#dcRun"); await page.waitForSelector("#dcScore", { timeout: 60000 });
  const myScore = pct(await txt("#dcScore"));
  ok((await page.locator("#dcPost").count()) === 1, "自己的规则可以贴榜");
  await page.click("#dcPost"); await page.waitForSelector("#pdGo");
  const post = await page.evaluate(() => { const a = document.querySelector("#pdGo"), u = new URL(a.href), pre = document.querySelector("#pdBody").innerText, p = QLHub.unpack(pre); return { host: u.host, path: u.pathname, title: u.searchParams.get("title"), inUrl: !!QLHub.unpack(u.searchParams.get("body") || ""), meta: p && p.meta, code: p && p.code, steps: document.querySelector("#pdSteps").innerText, primary: document.querySelector("#pdCopy").classList.contains("primary") }; });
  ok(post.host === "github.com" && post.title.startsWith("[SL:deca] 涨了就满仓") && post.meta.kind === "deca" && post.meta.season === "2026-10-12" && post.code === mineCode && post.meta.p.n === 20 && post.meta.params.length === 3, "要交的内容摆在眼前：名字、赛季、参数表、参数值和代码原样都在", JSON.stringify(post.meta));
  ok(post.inUrl ? !post.primary && /已经填好/.test(post.steps) : post.primary && /分两步/.test(post.steps), "内容放得进地址就直接带过去，放不进就先让人复制", post.inUrl + " / " + post.steps);
  await page.screenshot({ path: SH("deca-post.png") });
  await closeAll();

  console.log("== 四、大家的榜：别人的规则在隔离环境里现跑");
  const mk = (n, user, meta, code, extra) => page.evaluate(([n, user, meta, code, extra]) => Object.assign({ number: n, title: QLHub.title("deca", meta.name || "x"), body: QLHub.pack(Object.assign({ kind: "deca" }, meta), code), user: { login: user, avatar_url: "" }, created_at: "2026-10-13T0" + (n % 10) + ":00:00Z", reactions: { "+1": (extra && extra.up) || 0 } }, {}), [n, user, meta, code, extra]);
  const P3 = [{ key: "n", label: "回看几步", def: 20, min: 2, max: 200, step: 1, type: "num" }, { key: "hi", label: "<b>涨</b>", def: 1, min: 0, max: 3, step: 0.05 }, { key: "lo", label: "跌", def: 0.5, min: 0, max: 3, step: 0.05 }];
  hub.items = [
    await mk(31, "alice", { name: "涨了就满仓", params: P3, p: { n: 20, hi: 1, lo: 0.5 }, score: 9.99 }, mineCode, { up: 2 }),
    await mk(32, "bob", { name: "买入持有换个写法", params: [], p: {} }, "function decide(s, p) { return 1; }", { up: 5 }),
    await mk(33, "carol", { name: "死循环", params: [], p: {} }, "function decide(s, p) { for (;;) {} }"),
    await mk(34, "dave", { name: "语法错", params: [], p: {} }, "function decide(s, p { return 1; }"),
    await mk(35, "erin", { name: "<img src=x onerror=alert(1)>偷东西", params: [{ key: "bad key", label: "x", def: 1, min: 0, max: 2, step: 1 }, { key: "f", label: "f", def: 9, min: 0, max: 1, step: 0.1 }, { key: "inf", label: "i", def: 1, min: 0, max: Infinity, step: 1 }], p: { f: 77 } },
      "var leaked = 0;\ntry { fetch('http://127.0.0.1:" + t.port + "/__probe__rule'); leaked = 1; } catch (e) {}\ntry { leaked += typeof localStorage === 'undefined' ? 0 : 2; } catch (e) {}\nfunction decide(s, p) { try { Math.log = function () { return 99; }; } catch (e) {} return p.f; }"),
    await mk(36, "frank", { name: "玩法的规则不该出现在这里", game: "g_sec", params: [], p: {} }, "function decide(s, p) { return 1; }"),
    await mk(37, "alice", { name: "最早的一条（同一个账号最多看三条：赞多的在先，其次新的在先）", params: [], p: {} }, "function decide(s, p) { return 0; }"),
    await mk(38, "alice", { name: "第三条", params: [], p: {} }, "function decide(s, p) { return 0.5; }"),
    await mk(39, "alice", { name: "第四条", params: [], p: {} }, "function decide(s, p) { return 0.25; }"),
  ];
  await page.evaluate(() => { window.App.decaOpt.timeout = 6000; window.App.openDeca("board"); });
  await page.waitForSelector("#dcBoard .dc-boardtab", { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector("#dcLeft") && !/在排队/.test(document.querySelector("#dcBoard").innerText), null, { timeout: 120000 });
  const board = await page.evaluate(() => Array.from(document.querySelectorAll(".dc-boardtab tbody tr")).map(tr => ({ n: +tr.getAttribute("data-n"), cells: Array.from(tr.children).map(td => td.innerText.trim()) })));
  const row = n => board.filter(r => r.n === n)[0];
  ok(board.length === 7 && !row(36) && !row(37) && row(31) && row(38) && row(39), "玩法的规则不进这张榜；同一个账号只看三条（赞多的在先，其次新的在先）", board.map(r => r.n).join(","));
  ok(Math.abs(pct(row(31).cells[2]) - myScore) < 6e-5 && row(31).cells[2] !== "+999.00%", "榜上的得分是现跑出来的，不是交的人报的（它报的是 9.99）", row(31).cells[2] + " vs " + myScore);
  ok(pct(row(32).cells[2]) === 0 && row(32).cells[0] !== "—" && row(32).cells[4].includes("5"), "\"买入持有换个写法\"得 0 分；👍 数照着 GitHub 上的", JSON.stringify(row(32)));
  ok(row(33).cells[0] === "—" && /跑得太久/.test(row(33).cells[2]), "死循环的规则：到时间停掉，记一句，别的规则照常", row(33).cells[2]);
  ok(row(34).cells[0] === "—" && /语法错误/.test(row(34).cells[2]), "语法错的规则：不开线程，直接记一句", row(34).cells[2]);
  const erin = row(35);
  ok(erin && Math.abs(pct(erin.cells[2]) - 0) < 6e-5 && erin.cells[1].includes("<img") && (await page.locator(".dc-boardtab img").count()) === 0, "想偷东西的那条：参数被收回到它自己声明的范围里（f 最大是 1，所以就是买入持有，0 分）；名字里的 HTML 只是文字", JSON.stringify(erin));
  ok(hits.length === 1, "它的 fetch 没有发出去", hits.join(" "));
  const order = board.filter(r => r.cells[0] !== "—").map(r => pct(r.cells[2]));
  ok(order.every((v, i) => i === 0 || v <= order[i - 1] + 1e-12), "按现跑的得分从高到低排");
  ok((await page.evaluate(() => Math.log(Math.E))) === 1 && (await page.evaluate(() => localStorage.getItem("secret.token"))) === "sk-should-never-leak", "页面自己的 Math 和存储原封不动");
  await page.screenshot({ path: SH("deca-board.png") });
  const c0 = hub.calls; await page.click('#dcBoard [data-tab]', { trial: true }).catch(() => {});
  await page.click('.dcm .seg [data-tab="mine"]'); await page.waitForSelector("#dcRule"); await page.click('.dcm .seg [data-tab="board"]'); await page.waitForSelector("#dcBoard .dc-boardtab");
  await page.waitForFunction(() => !document.querySelector("#dcLeft") && !/在排队/.test(document.querySelector("#dcBoard").innerText), null, { timeout: 30000 });
  ok(hub.calls === c0 && Math.abs(pct((await page.evaluate(() => Array.from(document.querySelectorAll('.dc-boardtab tr[data-n="31"] td')).map(td => td.innerText)))[2]) - myScore) < 6e-5, "切走再切回来：榜不重取，跑过的规则不重跑");

  console.log("== 五、把榜上的规则载入：之后它一直在隔离环境里跑");
  await page.click('.dc-boardtab [data-adopt="35"]'); await page.waitForFunction(() => window.App.state.stratId === "hub-35" && !window.App.isBusy && window.App.run, null, { timeout: 30000 });
  const ad = await page.evaluate(() => { const A = window.App, st = A.strat(), e = A.currentEngine(); return { foreign: st.foreign, src: st.src, from: st.from && st.from.user, name: st.name, params: st.params.map(q => q.key + ":" + q.min + ":" + q.max + ":" + q.label), p: A.sp(), sandboxed: e.sandboxed, growth: A.run.sum.growth, bench: A.run.benchSum.growth, frames: document.querySelectorAll("iframe[sandbox]").length, modals: document.querySelectorAll(".modal").length }; });
  ok(ad.foreign === true && ad.src === "hub" && ad.from === "erin" && ad.modals === 0, "载入之后它在\"我的策略\"里，带着\"别人写的\"标记", JSON.stringify(ad));
  ok(ad.params.join("|") === "f:0:1:f" && ad.p.f === 1, "参数表只留合规矩的那几项，交来的参数值收回到范围里", ad.params.join("|") + " " + JSON.stringify(ad.p));
  ok(ad.sandboxed === true && ad.frames >= 1 && Math.abs(ad.growth - ad.bench) < 1e-9, "主回测的线程开在隔离环境里，结果照常出来（这条规则就是满仓，和基准一样）", JSON.stringify([ad.sandboxed, ad.growth, ad.bench]));
  ok((await txt("#stratForeign")).includes("别人写的") && (await txt("#stratForeign")).includes("@erin") && (await txt("#stratSel")).includes("<img"), "左栏写明这是别人写的规则，在隔离环境里运行");
  await page.waitForTimeout(400);
  ok(hits.length === 1 && (await page.evaluate(() => Math.log(Math.E))) === 1, "它在主回测里也发不出请求、改不了页面的 Math", hits.join(" "));
  await page.evaluate(() => { window.App.setStrat("voltarget"); }); await page.waitForFunction(() => !window.App.isBusy && window.App.runStratId === "voltarget");
  ok((await page.evaluate(() => window.App.currentEngine().sandboxed)) === false && (await page.locator("#stratForeign").count()) === 0, "换回内置规则：线程回到普通的后台线程");
  await page.reload(); await page.waitForFunction(() => window.App && !window.App.isBusy && window.App.openDeca);
  ok((await page.evaluate(() => { const m = window.App.my.filter(x => x.id === "hub-35")[0]; return !!m && m.foreign === true; })), "刷新页面：\"别人写的\"标记还在");

  console.log("== 六、手机宽度");
  await page.setViewportSize({ width: 390, height: 780 });
  await page.evaluate(() => { window.App.decaOpt.timeout = 6000; window.App.openDeca(); }); await page.waitForSelector("#dcRule"); await page.selectOption("#dcRule", "voltarget"); await page.click("#dcRun"); await page.waitForSelector("#dcScore", { timeout: 60000 }); await page.click("#dcRefBtn"); await page.waitForSelector("#dcRefTab", { timeout: 90000 });
  const over = () => page.evaluate(() => { const d = document.documentElement, b = document.querySelector(".modal.dcm .modal-box").getBoundingClientRect(); return { doc: d.scrollWidth - d.clientWidth, box: Math.round(b.right) > window.innerWidth || b.left < 0 }; });
  const o1 = await over(); await page.screenshot({ path: SH("deca-phone.png") });
  await page.click('.dcm .seg [data-tab="board"]'); await page.waitForSelector("#dcBoard .dc-boardtab"); await page.waitForFunction(() => !document.querySelector("#dcLeft") && !/在排队/.test(document.querySelector("#dcBoard").innerText), null, { timeout: 120000 });
  const o2 = await over();
  ok(o1.doc <= 1 && !o1.box && o2.doc <= 1 && !o2.box, "手机宽度：两边都不溢出", JSON.stringify([o1, o2]));

  const real = logs.filter(l => !/Failed to load resource|Refused to|Content Security Policy|violates the following|WebSocket connection|net::ERR/.test(l));   // 沙箱里的探针被内容安全策略拦下时，浏览器会在控制台各记一行：那正是要看到的
  console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", real.length ? "\n" + real.join("\n") : "none");
  await t.close(); process.exitCode = fail || real.length ? 1 : 0;
})().catch(e => { console.error("TEST CRASHED:", e.message.split("\n").slice(0, 8).join("\n")); process.exit(1); });
