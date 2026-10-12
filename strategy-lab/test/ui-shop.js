// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 世界工坊的界面：世界（样板、试一试、校验、另存、拿到实验室里用、给 AI 的说明、贴到 GitHub）、
// 玩法（样板比一比并和引擎对数、自己写规则、自己写裁判、出错和卡死怎么报）、
// 别人的世界 / 玩法 / 规则（GitHub 的接口换成本机的假数据；在隔离环境里跑，偷不走东西）、存档、手机宽度
const path = require("path"), { open } = require("./ui-smoke.js");
const SH = n => path.join(__dirname, "../shots/" + n);
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) { pass++; if (process.env.VERBOSE) console.log("  ok  ", name, d === undefined ? "" : "  " + String(d).slice(0, 300)); } else { fail++; console.log("  FAIL", name, d === undefined ? "" : "  " + String(d).slice(0, 700)); } };
(async () => {
  const t = await open({ standalone: true, viewport: { width: 1280, height: 1000 } }), page = t.page, logs = t.logs;
  const hub = { items: [] }, hits = [];
  await page.route("https://api.github.com/**", r => r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: JSON.stringify(hub.items) }));
  await page.route("**/__probe__*", r => { hits.push(r.request().url()); r.fulfill({ status: 200, body: "x" }); });
  const ready = () => page.waitForFunction(() => window.App && window.App.openShop && !window.App.isBusy, null, { timeout: 60000 });
  await ready();
  const stub = () => page.evaluate(() => { window.__copied = []; navigator.clipboard.writeText = s => { window.__copied.push(s); return Promise.resolve(); }; });
  await stub();
  const txt = sel => page.locator(sel).first().innerText();
  const closeTop = async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(80); };
  const closeAll = async () => { for (let i = 0; i < 8 && (await page.locator(".modal").count()); i++) await closeTop(); };
  const num = s => parseFloat(String(s).replace("−", "-").replace(/[^0-9.\-]/g, ""));
  const setNum = async (sel, v) => { await page.fill(sel, String(v)); await page.dispatchEvent(sel, "change"); };
  const table = () => page.evaluate(() => Array.from(document.querySelectorAll("#shGTab tbody tr")).map(tr => ({ id: tr.getAttribute("data-rule").replace(/^r:/, ""), cells: Array.from(tr.children).map(td => td.innerText.trim()) })));
  const runIt = async () => { await page.click("#shGRun"); await page.waitForSelector("#shGTab, #shGRunErr", { timeout: 90000 }); await page.waitForTimeout(150); };
  const tryIt = async () => { await page.click("#shWTry"); await page.waitForSelector("#shWSay, #shWErr:not([hidden])", { timeout: 90000 }); await page.waitForTimeout(100); };
  /** 引擎直接算一遍（页面里，不进线程）：gid 是玩法，ids 是上场的规则（按上场的顺序） */
  const direct = (gid, ids, gp, T, K, seed) => page.evaluate(([gid, ids, gp, T, K, seed]) => {
    const QL = window.App.QL, st = window.App.shopStore(), g = QL.SHOP.games.concat(st.games).filter(x => x.id === gid)[0], rules = g.rules.concat(st.extra[gid] || []);
    const comp = (code, names) => new Function('"use strict";\n' + code + "\n;return { " + names.map(n => n + ": typeof " + n + ' === "function" ? ' + n + " : null").join(", ") + " };")();
    const game = comp(g.code, ["deal", "show", "referee"]);
    const players = ids.map(id => { const r = rules.filter(x => x.id === id)[0], S = comp(r.code, ["init", "decide"]); return { id, decide: S.decide, init: S.init, p: Object.freeze(Object.assign({}, r.p)) }; });
    return QL.shopRun(game, Object.freeze(Object.assign({}, gp)), T, K, seed, players, null).rows;
  }, [gid, ids, gp, T, K, seed]);
  const sameAs = (tb, exp) => tb.length === exp.length && tb.every(r => { const e = exp.filter(x => x.id === r.id)[0]; return e && Math.abs(num(r.cells[2].split("±")[0]) - e.mean) < 6e-4 && Math.abs(num(r.cells[2].split("±")[1]) - e.se) < 6e-4 && (r.cells[3] === "—" ? e.d === 0 : Math.abs(num(r.cells[3].split("±")[0]) - e.d) < 6e-4) && Math.abs(num(r.cells[4]) - e.rounds) < 0.06; });
  const mkItem = (n, user, kind, name, meta, code, up) => page.evaluate(([n, user, kind, name, meta, code, up]) => ({ number: n, title: QLHub.title(kind, name), body: QLHub.pack(Object.assign({ kind, name }, meta), code), user: { login: user, avatar_url: "" }, created_at: "2026-10-1" + (n % 10) + "T00:00:00Z", reactions: { "+1": up || 0 } }), [n, user, kind, name, meta, code, up]);

  console.log("== 一、世界：样板，试一试");
  await page.click("#btnLobby"); await page.waitForSelector('.lb-card[data-card="workshop"]');
  ok((await txt('.lb-card[data-card="workshop"]')).includes("世界工坊") && (await txt('.lb-card[data-card="workshop"]')).includes("连裁判一起"), "大厅里有世界工坊的卡片");
  await page.click('.lb-card[data-card="workshop"] [data-go]'); await page.waitForSelector("#shWorlds");
  const w0 = await page.evaluate(() => Array.from(document.querySelectorAll("#shWorlds .ar-rule")).map(r => ({ id: r.getAttribute("data-world"), text: r.innerText.replace(/\s+/g, " ") })));
  ok(w0.length === 2 && w0[0].id === "w_walk" && w0[1].id === "w_limit" && w0.every(w => w.text.includes("样板") && w.text.includes("拿到实验室里用")) && (await page.locator('.arm .seg [data-tab="world"][aria-pressed="true"]').count()) === 1 && (await page.locator("#shWGrab").count()) === 0, "先看到的是世界：两个样板；实验室里没有自定义世界，就没有\"收进来\"的按钮", JSON.stringify(w0));
  await page.click('#shWorlds [data-open="w_limit"]'); await page.waitForSelector("#shWCode");
  ok((await page.inputValue("#shWName")) === "涨跌停板（改）" && (await txt("#shWSave")) === "另存成我的" && (await page.inputValue("#shWPar")).split("\n").length === 2 && (await page.inputValue("#shWPar")).includes("lim = 0.02 [0.005, 0.2] 每天涨跌幅的上限") && (await page.inputValue("#shWK")) === "252" && (await page.inputValue("#shWCode")).includes("function simulate(T, rng, p, K)"), "打开样板：参数一行一个，带范围和说明；改了只能另存", await page.inputValue("#shWPar"));
  const wdoc = await page.evaluate(() => document.querySelector("#shWDoc").textContent), wexp = await page.evaluate(() => document.querySelector("#shWExplain").textContent);
  ok(wdoc.includes("simulate(T, rng, p, K)") && wdoc.includes("rng.normal()") && wdoc.includes("每年几步") && wexp.includes("买不进去"), "底下有接口说明，和这个世界自己的说明");
  await tryIt();
  const say = await txt("#shWSay");
  const dw = await page.evaluate(() => {
    const QL = window.App.QL, w = QL.SHOP.worlds.filter(x => x.id === "w_limit")[0], p = {}; w.schema.forEach(q => { p[q.key] = q.def; });
    const sim = new Function('"use strict";\n' + w.code + "\n;return simulate;")(), B = QL.makeBatch({ type: "custom", params: p, N: 400, T: 252, K: 252, seed: 7, S0: 100 }, { simulate: sim }, 0), ws = QL.worldStats(B);
    return { vol: window.App.P(ws.annVol, 1), mean: window.App.P(ws.annMean, 1), acf: window.App.F(ws.acf[0], 3), max: window.App.P(ws.max, 2), min: window.App.P(-ws.min, 2) };
  });
  ok(say.includes("400 条路径") && say.includes("每条 252 步") && say.includes("波动 " + dw.vol) && say.includes("平均 " + dw.mean) && say.includes("相关系数是 " + dw.acf) && say.includes(dw.max) && say.includes(dw.min), "试一试：生成 400 条路径，报出来的几个数和引擎直接算的一样", say);
  ok(num(dw.acf) > 0.2 && (await page.locator("#shWChart canvas").count()) >= 1, "涨跌停板：相邻两步明显正相关；画出了样本路径");
  await page.screenshot({ path: SH("shop-world.png") });

  console.log("== 二、世界：写一个自己的");
  await page.fill("#shWPar", "sigma = abc"); await tryIt();
  ok((await txt("#shWErr")).includes("参数的写法不对") && (await page.locator("#shWSay").count()) === 0, "参数写错：说清楚该怎么写", await txt("#shWErr"));
  await page.fill("#shWPar", "sigma = 5 [0.05, 1.5]"); await tryIt();
  ok((await txt("#shWErr")).includes("参数的写法不对"), "默认值不在范围里：也算写错");
  await page.fill("#shWPar", "sigma = 0.4 [0.05, 1.5] 年化波动 σ\nlim = 0.02"); await page.fill("#shWCode", "function simulate(T, rng, p { return [100]; }"); await tryIt();
  ok((await txt("#shWErr")).includes("语法错误"), "代码语法错：报出来", await txt("#shWErr"));
  await page.fill("#shWCode", "function sim(T) { return [100]; }"); await tryIt();
  ok((await txt("#shWErr")).includes("function simulate"), "没有 simulate：报出来");
  await page.fill("#shWCode", "function simulate(T, rng, p, K) {\n  var S = [100];\n  for (var t = 0; t < T; t++) S.push(t === 3 ? -5 : 100);\n  return S;\n}"); await tryIt();
  ok((await txt("#shWErr")).includes("没有跑通") && (await txt("#shWErr")).includes("第 4 个价格"), "价格不是正数：报出是第几个", await txt("#shWErr"));
  await page.fill("#shWCode", "function simulate(T, rng, p, K) {\n  var S = [100];\n  for (var t = 0; t < T; t++) S.push(100 + undefinedThing);\n  return S;\n}"); await tryIt();
  ok((await txt("#shWErr")).includes("没有跑通") && (await txt("#shWErr")).includes("undefinedThing"), "代码运行时出错：把错误原样报出来", await txt("#shWErr"));
  await page.evaluate(() => { window.App.shopOpt.timeout = 6000; });
  await page.fill("#shWCode", "function simulate(T, rng, p, K) {\n  for (;;) {}\n}"); await tryIt();
  ok((await txt("#shWErr")).includes("死循环"), "死循环：到时间停掉", await txt("#shWErr"));
  await page.evaluate(() => { window.App.shopOpt.timeout = 30000; });
  const myWorld = "// 波动忽大忽小的世界\n// vol = 0.3 [0.05, 1] 平常的年化波动\n// burst = 3 [1, 10] 闹起来时是平常的几倍\nfunction simulate(T, rng, p, K) {\n  var S = [100], hot = 0;\n  for (var t = 0; t < T; t++) {\n    if (rng.u() < 0.05) hot = 1 - hot;\n    S.push(S[t] * Math.exp(p.vol * (hot ? p.burst : 1) / Math.sqrt(K) * rng.normal()));\n  }\n  return S;\n}";
  await page.fill("#shWCode", myWorld); await page.fill("#shWPar", ""); await page.fill("#shWName", "忽大忽小"); await page.fill("#shWSum", "<b>波动</b>有两档"); await setNum("#shWT", 300); await setNum("#shWK", 52);
  await tryIt();
  ok((await page.inputValue("#shWPar")) === "vol = 0.3 [0.05, 1] 平常的年化波动\nburst = 3 [1, 10] 闹起来时是平常的几倍" && (await txt("#shWSay")).includes("每条 300 步（每年 52 步）"), "参数一栏空着：从代码开头的注释里读出参数；步数和每年几步按填的来", await page.inputValue("#shWPar"));
  await page.click("#shWAi");
  const wprompt = await page.evaluate(() => window.__copied.pop());
  ok(wprompt.includes("simulate(T, rng, p, K)") && wprompt.includes("rng.poisson(lam)") && wprompt.includes(myWorld) && wprompt.includes("burst = 3 [1, 10]") && wprompt.includes("// sigma = 0.2 [0.02, 1] 年化波动") && wprompt.trim().endsWith("我的想法："), "\"复制给 AI 的说明\"里有接口、参数该怎么写、现在的代码和参数，最后留着写想法的地方", wprompt.length);
  await page.click("#shWPost"); await page.waitForSelector("#pdGo");
  const wpost = await page.evaluate(() => { const p = QLHub.unpack(document.querySelector("#pdBody").innerText), u = new URL(document.querySelector("#pdGo").href); return { meta: p.meta, code: p.code, title: u.searchParams.get("title") }; });
  ok(wpost.meta.kind === "world" && wpost.meta.name === "忽大忽小" && wpost.meta.params.length === 2 && wpost.meta.params[1].key === "burst" && wpost.meta.params[1].max === 10 && wpost.meta.K === 52 && wpost.meta.T === 300 && wpost.code === myWorld && wpost.title === "[SL:world] 忽大忽小", "贴到 GitHub：类别、名字、参数表、步数和代码都对", JSON.stringify(wpost.meta).slice(0, 300));
  await closeTop(); await page.click("#shWSave"); await page.waitForFunction(() => document.querySelectorAll("#shWorlds .ar-rule").length === 3);
  const mineW = await page.evaluate(() => { const st = window.App.shopStore(), w = st.worlds[0], row = document.querySelector('#shWorlds .ar-rule[data-world="' + w.id + '"]'); return { id: w.id, src: w.src, K: w.K, T: w.T, n: w.schema.length, text: row.innerText.replace(/\s+/g, " "), btn: row.querySelector("[data-open]").innerText, html: row.querySelectorAll("b").length, saved: JSON.parse(localStorage.getItem("ql.shop.v1")).worlds.length }; });
  ok(mineW.src === "mine" && mineW.K === 52 && mineW.T === 300 && mineW.n === 2 && mineW.text.includes("忽大忽小") && mineW.text.includes("我的") && mineW.text.includes("<b>波动</b>有两档") && mineW.html === 1 && mineW.btn === "改" && mineW.saved === 1, "存下之后进了名单、标着\"我的\"，并且写进了这台设备的存档；说明里的 HTML 只是文字", JSON.stringify(mineW));
  await page.click(`#shWorlds [data-open="${mineW.id}"]`); await page.waitForSelector("#shWCode");
  ok((await page.inputValue("#shWName")) === "忽大忽小" && (await txt("#shWSave")) === "保存", "改自己的世界：名字不加\"（改）\"，按钮是\"保存\"");
  await page.fill("#shWSum", "波动有两档"); await page.click("#shWSave"); await page.waitForFunction(() => /波动有两档/.test(document.querySelector("#shWorlds").innerText) && !document.querySelector("#shWCode"));
  ok((await page.evaluate(() => window.App.shopStore().worlds.length)) === 1, "还是那一个，不会多出一份");

  console.log("== 三、世界：拿到实验室里用");
  await page.click(`#shWorlds [data-use="${mineW.id}"]`); await page.waitForFunction(() => !document.querySelector(".modal") && window.App.state.world.type === "custom");
  const toast1 = await page.evaluate(() => (document.querySelector(".toast") || {}).innerText || "");
  await ready();
  const lab = await page.evaluate(() => { const S = window.App.state, e = window.App.currentEngine(); return { name: S.custom.name, K: S.world.K, T: S.world.T, wp: S.wparams.custom, foreign: !!S.custom.foreign, sandboxed: e && e.sandboxed, sel: document.querySelector("#worldType").selectedOptions[0].text, top: document.querySelector("#topWorld").innerText, note: !!document.querySelector("#worldForeign"), statsT: window.App.worldStats.T, statsK: window.App.worldStats.K }; });
  ok(lab.name === "忽大忽小" && lab.K === 52 && lab.T === 300 && lab.wp.vol === 0.3 && lab.wp.burst === 3 && lab.sel === "自定义：忽大忽小" && lab.top.includes("忽大忽小") && lab.statsT === 300 && lab.statsK === 52, "实验室换到了这个世界：名字、参数的默认值、步数、每年几步都带过去，路径已经生成", JSON.stringify(lab));
  ok(lab.foreign === false && lab.sandboxed === false && !lab.note && toast1.includes("忽大忽小") && !toast1.includes("隔离环境"), "自己写的世界：不进隔离环境，也没有\"别人写的\"那行字", toast1);
  ok((await page.locator('#blkWorld input[type="range"]').count()) >= 2, "左栏里有这个世界的两个参数可以拖");
  await page.evaluate(() => { window.App.state.custom.code += "\n// 在实验室里又改了一点"; });
  await page.evaluate(() => window.App.openShop("world")); await page.waitForSelector("#shWGrab");
  await page.click("#shWGrab"); await page.waitForFunction(() => document.querySelectorAll("#shWorlds .ar-rule").length === 4);
  ok((await page.evaluate(() => { const st = window.App.shopStore(); return st.worlds.length === 2 && st.worlds[1].src === "mine" && /又改了一点/.test(st.worlds[1].code) && st.worlds[1].K === 52; })) && (await page.locator("#shWGrab").count()) === 0, "实验室里的自定义世界和工坊里的对不上：可以收进来；收过了按钮就没了");
  await page.click('#shWorlds [data-open="w_walk"]'); await page.waitForSelector("#shWUse"); await page.click("#shWUse"); await page.waitForFunction(() => !document.querySelector(".modal") && window.App.state.custom.name === "随机游走（最简单的样板）");
  await ready();
  ok((await page.evaluate(() => window.App.shopStore().worlds.length)) === 2 && (await page.evaluate(() => window.App.state.world.K)) === 252, "没动过的样板直接拿去用：名字不变，也不往存档里多存一份");

  console.log("== 四、别人造的世界");
  hub.items = [
    await mkItem(61, "alice", "world", "尖峰", { summary: "<i>偶尔</i>跳一下", params: [{ key: "jump", label: "跳\n多大", def: 0.1, min: 0, max: 0.5, step: 0.01, type: "num" }, { key: "bad key", def: 1, min: 0, max: 2, step: 1 }, { key: "sel", type: "select", def: "a", options: [["a", "A"]] }], K: 252, T: 120, explain: "看[这里](https://example.com/x)。<script>window.__pwn = 1</script>" }, "try { fetch('http://127.0.0.1:" + t.port + "/__probe__world'); } catch (e) {}\nfunction simulate(T, rng, p, K) {\n  var S = [100];\n  try { Math.exp = function () { return 1; }; } catch (e) {}\n  for (var t = 0; t < T; t++) S.push(S[t] * Math.exp((rng.u() < 0.02 ? p.jump : 0) + 0.01 * rng.normal()));\n  return S;\n}", 2),
    await mkItem(62, "bob", "world", "卡死的世界", { summary: "", params: [], K: 252, T: 100 }, "function simulate(T, rng, p, K) { for (;;) {} }"),
    await mkItem(63, "carol", "world", "", {}, ""),
    await mkItem(64, "dave", "game", "不是世界", { about: "x", p: {}, T: 5, rules: [] }, "function deal() { return {}; }\nfunction referee() { return 1; }"),
  ];
  await page.evaluate(() => window.App.openShop("world")); await page.waitForSelector("#shWFind"); await page.click("#shWFind"); await page.waitForSelector("#shFind .ar-found");
  const foundW = await page.evaluate(() => Array.from(document.querySelectorAll("#shFind .ar-found")).map(d => ({ n: +d.getAttribute("data-n"), text: d.innerText.replace(/\s+/g, " ") })));
  ok(foundW.length === 2 && foundW[0].n === 61 && foundW[1].n === 62 && foundW[0].text.includes("@alice") && foundW[0].text.includes("👍 2") && foundW[0].text.includes("<i>偶尔</i>跳一下") && (await page.locator("#shFind i").count()) === 0, "只列世界，赞多的在前；没有代码的不列；说明里的 HTML 只是文字", JSON.stringify(foundW));
  await page.click('#shFind [data-add="61"]'); await page.click('#shFind [data-add="62"]');
  ok((await page.locator('#shFind [data-add="61"][disabled]').count()) === 1 && (await txt('#shFind [data-add="61"]')) === "已经载入了", "载入过的不能再载一遍");
  await closeTop(); await page.waitForFunction(() => document.querySelectorAll("#shWorlds .ar-rule").length === 6);
  const fw = await page.evaluate(() => { const w = window.App.shopStore().worlds.filter(x => x.id === "hub-w61")[0], row = document.querySelector('#shWorlds .ar-rule[data-world="hub-w61"]'); return { foreign: w.foreign, schema: w.schema.map(q => q.key), from: w.from, T: w.T, explain: w.explain, text: row.innerText.replace(/\s+/g, " "), btn: row.querySelector("[data-open]").innerText }; });
  ok(fw.foreign === true && fw.schema.join() === "jump" && fw.from.user === "alice" && fw.from.url.endsWith("/issues/61") && fw.T === 120 && fw.text.includes("别人写的 @alice") && fw.btn === "打开" && fw.explain.includes("[这里] (https://example.com/x)"), "载入的世界标着是谁写的；参数表只留合规矩的数值参数；说明里的链接拆开了，点不了", JSON.stringify(fw));
  await page.click('#shWorlds [data-open="hub-w61"]'); await page.waitForSelector("#shWCode");
  ok((await page.locator("#shWCode[readonly]").count()) === 1 && (await page.locator("#shWSave").count()) === 0 && (await page.locator("#shWPost").count()) === 0 && (await page.locator("#shWFork").count()) === 1 && (await txt("#shWForeign")).includes("@alice") && (await txt("#shWForeign")).includes("隔离环境") && (await page.locator("#shWExplain a, #shWExplain script").count()) === 0, "别人的世界只能看，想改先另存；它的说明只当文字显示");
  await tryIt();
  ok((await txt("#shWSay")).includes("每条 120 步") && hits.length === 0 && (await page.evaluate(() => Math.exp(1) > 2.7 && window.__pwn === undefined)), "试别人的世界：在隔离环境里跑，它的请求没发出去，页面的 Math 也没被动过", hits.join(" "));
  await page.click("#shWUse"); await page.waitForFunction(() => !document.querySelector(".modal") && window.App.state.custom.name === "尖峰");
  const toast2 = await page.evaluate(() => (document.querySelector(".toast") || {}).innerText || "");
  await ready();
  const lab2 = await page.evaluate(() => { const S = window.App.state, e = window.App.currentEngine(); return { foreign: S.custom.foreign, sandboxed: e && e.sandboxed, note: (document.querySelector("#worldForeign") || {}).innerText || "", href: (document.querySelector("#worldForeign a") || {}).href || "", T: window.App.worldStats && window.App.worldStats.T }; });
  ok(lab2.foreign === true && lab2.sandboxed === true && lab2.note.includes("这个世界是别人写的") && lab2.note.includes("@alice") && lab2.href.endsWith("/issues/61") && lab2.T === 120 && toast2.includes("隔离环境") && hits.length === 0, "拿到实验室里用：后台线程开在隔离环境里，世界下面写明是谁写的；它的请求照样发不出去", JSON.stringify(lab2));
  await page.screenshot({ path: SH("shop-foreign-world.png") });
  await page.reload(); await ready(); await stub();
  ok((await page.evaluate(() => { const S = window.App.state, e = window.App.currentEngine(); return S.world.type === "custom" && S.custom.foreign === true && e && e.sandboxed === true && !!document.querySelector("#worldForeign"); })) && hits.length === 0, "刷新页面：别人的世界还在，仍然在隔离环境里跑");
  await page.evaluate(() => window.App.openShop("world")); await page.waitForSelector("#shWorlds"); await page.click('#shWorlds [data-open="hub-w62"]'); await page.waitForSelector("#shWTry");
  await page.evaluate(() => { window.App.shopOpt.timeout = 6000; }); await tryIt();
  ok((await txt("#shWErr")).includes("死循环"), "别人的世界卡死：到时间停掉", await txt("#shWErr"));
  await page.evaluate(() => { window.App.shopOpt.timeout = 30000; });
  await closeTop(); await page.click('#shWorlds [aria-label="删掉 卡死的世界"]'); await page.waitForFunction(() => document.querySelectorAll("#shWorlds .ar-rule").length === 5);
  ok((await page.evaluate(() => window.App.shopStore().worlds.some(w => w.id === "hub-w62"))) === false, "不想要的世界可以删掉");
  await page.evaluate(() => window.App.setWorldType("gbm")); await closeAll(); await ready();

  console.log("== 五、玩法：样板，比一比");
  await page.evaluate(() => window.App.openShop("game")); await page.waitForSelector("#shGames");
  const g0 = await page.evaluate(() => Array.from(document.querySelectorAll("#shGames .ar-rule")).map(r => ({ id: r.getAttribute("data-game"), text: r.innerText.replace(/\s+/g, " ") })));
  ok(g0.length === 2 && g0[0].id === "s_pig" && g0[1].id === "s_guess" && g0.every(g => g.text.includes("样板") && g.text.includes("3 条规则")) && (await txt("#shWhat")).includes("裁判"), "玩法这一边：两套样板，各带三条规则", JSON.stringify(g0));
  await page.click('#shGames [data-open="s_pig"]'); await page.waitForSelector("#shRules");
  const r0 = await page.evaluate(() => Array.from(document.querySelectorAll("#shRules .ar-rule")).map(r => ({ id: r.getAttribute("data-rule"), on: r.querySelector("input").checked, btn: r.querySelector("[data-code]").innerText, del: !!r.querySelector("[data-del]") })));
  ok(r0.length === 3 && r0.every(r => r.on && r.btn === "看代码" && !r.del) && (await txt("#shGAboutText")).includes("1/6") && (await txt("#shCount")).includes("3 条") && (await txt("#shCount")).includes("「掷一次就收」当基准") && (await page.locator("#shGP").count()) === 0 && (await page.locator("#shRFind").count()) === 0, "打开掷骰子：有玩法说明，三条自带规则都上场，排第一的当基准；它没有参数，也不是从 GitHub 来的", await txt("#shCount"));
  await setNum("#shGK", 600);
  await runIt();
  let tb = await table(), exp = await direct("s_pig", ["once", "hold", "greedy"], {}, 60, 600, 7);
  ok(sameAs(tb, exp), "表里每条规则的几个数都等于引擎直接算的", JSON.stringify(tb));
  ok(tb[0].id === "hold" && tb[2].id === "once" && tb.map(r => r.cells[0]).join() === "1,2,3" && tb[2].cells[1].includes("基准") && tb[2].cells[3] === "—" && tb[0].cells[3].startsWith("+"), "按平均得分从高到低排：攒到 20 分的最好，基准垫底；基准那一行不和自己比");
  ok((await txt("#shGTab caption")).includes("600 局") && (await txt("#shGTab caption")).includes("60 回合") && (await txt("#shGTab caption")).includes("同一副牌") && (await page.locator("#shFun").count()) === 0, "表头写明这次是怎么比的；没有别人的代码，就没有\"只图个乐\"那句话", await txt("#shGTab caption"));
  await page.click("#shTrace summary");
  const tr0 = await page.evaluate(() => ({ opts: Array.from(document.querySelectorAll("#shTraceSel option")).map(o => o.text), rows: Array.from(document.querySelectorAll("#shTraceTab tbody tr")).map(r => Array.from(r.children).map(c => c.innerText.trim())) }));
  ok(tr0.opts.join() === "掷一次就收,攒到 20 分就收,太贪：攒到 40 分才收" && tr0.rows.length >= 1 && tr0.rows.length <= 2 && tr0.rows[0][0] === "1" && tr0.rows[0][1] === "0" && tr0.rows[0][2] === "1", "第一局的过程：掷一次就收的那条，第一回合看到 0 分、报 1（接着掷）", JSON.stringify(tr0.rows));
  await page.selectOption("#shTraceSel", "r:greedy");
  const tr1 = await page.evaluate(() => Array.from(document.querySelectorAll("#shTraceTab tbody tr")).map(r => Array.from(r.children).map(c => c.innerText.trim())));
  ok(tr1.length > tr0.rows.length && tr1.every((r, i) => +r[0] === i + 1 && (i === 0 || num(r[1]) > num(tr1[i - 1][1]) || true)) && tr1.slice(0, -1).every(r => r[2] === "1"), "换一条规则看：太贪的那条打得更久，一直在报 1", JSON.stringify(tr1.slice(0, 4)));
  await page.screenshot({ path: SH("shop-game.png") });
  await page.uncheck("#shPick-once");
  ok((await txt("#shCount")).includes("2 条") && (await txt("#shCount")).includes("「攒到 20 分就收」当基准"), "把基准请下场：下一条顶上来当基准", await txt("#shCount"));
  await runIt(); tb = await table(); exp = await direct("s_pig", ["hold", "greedy"], {}, 60, 600, 7);
  ok(sameAs(tb, exp) && tb[0].cells[1].includes("基准") && tb[1].cells[3].startsWith("−"), "两条再比：太贪的比新基准差，差多少也和引擎一致");
  await page.uncheck("#shPick-hold"); await page.uncheck("#shPick-greedy");
  ok((await page.locator("#shGRun[disabled]").count()) === 1 && (await txt("#shCount")).includes("先挑至少一条"), "一条也不挑：不让比");
  await page.check("#shPick-once"); await page.check("#shPick-hold"); await page.check("#shPick-greedy");
  await closeTop(); await page.click('#shGames [data-open="s_guess"]'); await page.waitForSelector("#shGP");
  ok((await page.inputValue("#shGP")) === "lo = 0.2, hi = 0.8" && (await page.inputValue("#shGT")) === "50", "猜硬币有两个参数，默认每局 50 回合");
  await page.fill("#shGP", "lo = 0.9; hi"); await page.dispatchEvent("#shGP", "change");
  ok((await page.inputValue("#shGP")) === "lo = 0.2, hi = 0.8", "参数写错：不收，改回原样");
  await page.fill("#shGP", "lo = 0.9, hi = 0.9"); await page.dispatchEvent("#shGP", "change"); await setNum("#shGK", 400); await setNum("#shGT", 30); await setNum("#shGSeed", 11);
  await runIt(); tb = await table(); exp = await direct("s_guess", ["heads", "repeat", "major"], { lo: 0.9, hi: 0.9 }, 30, 400, 11);
  ok(sameAs(tb, exp) && Math.abs(num(tb.filter(r => r.id === "heads")[0].cells[2]) - 27) < 0.5 && (await txt("#shGTab caption")).includes("400 局") && (await txt("#shGTab caption")).includes("30 回合"), "改玩法的参数、回合数、种子：正面概率定成 0.9，总猜正面平均对 27 次，和引擎一致", JSON.stringify(tb.map(r => r.cells[2])));
  await closeTop();

  console.log("== 六、给玩法写规则");
  await page.click('#shGames [data-open="s_pig"]'); await page.waitForSelector("#shRNew"); await page.click("#shRNew"); await page.waitForSelector("#shRCode");
  ok((await page.inputValue("#shRName")) === "我的规则" && (await page.inputValue("#shRCode")).includes("function decide") && (await txt("#shRSave")) === "保存" && (await page.locator("#shRPost").count()) === 0 && (await txt("#shRNoPost")).includes("先打开裁判的代码"), "从基准规则的代码开始写；这套玩法不在 GitHub 上，所以规则没有单独贴的按钮，并且说明了该怎么办");
  const rdoc = await page.evaluate(() => document.querySelector("#shRDoc").textContent);
  ok(rdoc.includes("s.see") && rdoc.includes("s.total") && rdoc.includes("s.rnd()") && rdoc.includes("init(p)"), "接口说明列着规则能用到的东西");
  await page.fill("#shRPar", "c = x"); await page.click("#shRSave"); await page.waitForSelector("#shRErr:not([hidden])");
  ok((await txt("#shRErr")).includes("参数的写法不对"), "参数写错：说清楚该怎么写");
  await page.fill("#shRPar", "c = 25, lazy: 1"); await page.fill("#shRCode", "function decide(s, p { return 1; }"); await page.click("#shRSave");
  ok((await txt("#shRErr")).includes("语法错误"), "代码语法错：不让存");
  await page.fill("#shRCode", "function act(s) { return 1; }"); await page.click("#shRSave");
  ok((await txt("#shRErr")).includes("function decide"), "没有 decide：不让存");
  const myRule = "// 攒到 c 分就收；前 lazy 个回合不看分数，只管掷\nfunction decide(s, p) {\n  if (s.t < p.lazy) return 1;\n  return s.see >= p.c ? 0 : 1;\n}";
  await page.fill("#shRCode", myRule); await page.fill("#shRName", "攒到 25"); await page.fill("#shRSum", "多攒一点");
  await page.click("#shRAi");
  const rprompt = await page.evaluate(() => window.__copied.pop());
  ok(rprompt.includes("玩法：掷骰子，见好就收") && rprompt.includes("有 1/6 的机会丢掉") && rprompt.includes("function referee(G, t, a)") && rprompt.includes("s.see") && rprompt.includes(myRule) && rprompt.includes("c = 25, lazy = 1") && rprompt.trim().endsWith("我的想法："), "\"复制给 AI 的说明\"里有这套玩法的说明、裁判的代码、接口、现在的代码和参数", rprompt.length);
  await page.click("#shRSave"); await page.waitForFunction(() => document.querySelectorAll("#shRules .ar-rule").length === 4 && !document.querySelector("#shRCode"));
  const mineR = await page.evaluate(() => { const st = window.App.shopStore(), r = st.extra.s_pig[0], row = document.querySelector('#shRules .ar-rule[data-rule="' + r.id + '"]'); return { id: r.id, src: r.src, on: row.querySelector("input").checked, text: row.innerText.replace(/\s+/g, " "), btn: row.querySelector("[data-code]").innerText, del: !!row.querySelector("[data-del]"), pick: st.sets.s_pig.pick.length }; });
  ok(mineR.src === "mine" && mineR.on && mineR.text.includes("攒到 25") && mineR.text.includes("我的") && mineR.text.includes("c = 25, lazy = 1") && mineR.btn === "改" && mineR.del && mineR.pick === 4, "存下之后进了名单、标着\"我的\"、自动上场", JSON.stringify(mineR));
  await runIt(); tb = await table(); exp = await direct("s_pig", ["once", "hold", "greedy", mineR.id], {}, 60, 600, 7);
  ok(tb.length === 4 && sameAs(tb, exp), "四条再比：我的规则的成绩也和引擎一致", JSON.stringify(tb.map(r => r.id + " " + r.cells[2])));
  await page.click(`#shRules [data-code="${mineR.id}"]`); await page.waitForSelector("#shRCode"); await page.fill("#shRPar", "c = 22, lazy = 0"); await page.click("#shRSave"); await page.waitForFunction(() => /c = 22/.test(document.querySelector("#shRules").innerText) && !document.querySelector("#shRCode"));
  ok((await page.evaluate(() => window.App.shopStore().extra.s_pig.length)) === 1 && (await page.evaluate(() => window.App.shopStore().extra.s_pig[0].p.c)) === 22 && (await page.locator("#shGTab").count()) === 1, "改自己的规则：还是那一条，不会多出一份");
  await page.click('#shRules [data-code="hold"]'); await page.waitForSelector("#shRCode");
  ok((await page.inputValue("#shRName")) === "攒到 20 分就收（改）" && (await txt("#shRSave")) === "另存成我的" && (await txt(".are .modal-b")).includes("玩法自带的规则本身不能改"), "看自带规则的代码：改了只能另存");
  await closeTop();
  // 中途出错的规则、报的不是数的规则
  await page.click("#shRNew"); await page.waitForSelector("#shRCode"); await page.fill("#shRName", "半路出错"); await page.fill("#shRPar", ""); await page.fill("#shRCode", "function decide(s, p) { if (s.see > 6) throw new Error('我炸了'); return 1; }"); await page.click("#shRSave"); await page.waitForFunction(() => document.querySelectorAll("#shRules .ar-rule").length === 5 && !document.querySelector("#shRCode"));
  await page.click("#shRNew"); await page.waitForSelector("#shRCode"); await page.fill("#shRName", "乱报"); await page.fill("#shRPar", ""); await page.fill("#shRCode", "function decide(s, p) { return s.t === 0 ? 1 : 'stop'; }"); await page.click("#shRSave"); await page.waitForFunction(() => document.querySelectorAll("#shRules .ar-rule").length === 6 && !document.querySelector("#shRCode"));
  await runIt(); tb = await table();
  const errRow = tb.filter(r => r.cells[1].includes("半路出错"))[0], badRow = tb.filter(r => r.cells[1].includes("乱报"))[0];
  ok(tb.length === 6 && errRow && errRow.cells[0] === "—" && errRow.cells[1].includes("中途出错：我炸了") && errRow.cells[2] === "—" && tb.indexOf(errRow) === 5, "中途抛错的规则：排在最后，写明错在哪，别的规则照常比", JSON.stringify(errRow));
  ok(badRow && badRow.cells[1].includes("报的不是数") && Math.abs(num(badRow.cells[2]) - num(tb.filter(r => r.id === "once")[0].cells[2])) < 1e-9, "报的不是数的规则：照常比（裁判收到 NaN，这里等于收手），旁边注明有多少回合报的不是数", JSON.stringify(badRow));
  const delIds = await page.evaluate(() => window.App.shopStore().extra.s_pig.slice(1).map(r => r.id));
  for (const id of delIds) await page.click(`#shRules [data-del="${id}"]`);
  ok((await page.evaluate(() => { const st = window.App.shopStore(); return st.extra.s_pig.length === 1 && st.sets.s_pig.pick.length === 4; })) && (await page.locator("#shRules .ar-rule").count()) === 4, "不想要的规则可以删掉，名单跟着少");
  await closeTop();

  console.log("== 七、自己造一套玩法");
  await page.click("#shGNew"); await page.waitForSelector("#shGCode0");
  ok((await page.inputValue("#shGName")) === "我的玩法" && (await page.inputValue("#shGCode0")).includes("function referee(G, t, a)") && (await txt("#shGSave")) === "保存" && (await page.evaluate(() => document.querySelector("#shGDoc").textContent)).includes("G.over"), "从掷骰子的裁判开始写；底下有裁判的接口说明");
  await page.fill("#shGCode0", "function deal(T, rng, p) { return {}; }"); await page.click("#shGSave"); await page.waitForSelector("#shGErr:not([hidden])");
  ok((await txt("#shGErr")).includes("function deal(T, rng, p) 和 function referee(G, t, a)"), "少了判分的函数：不让存", await txt("#shGErr"));
  const myGame = "// 猜一个 0 到 n−1 的整数。每回合报一个数，裁判说大了还是小了；猜中得 10 分减去用掉的回合数。\nfunction deal(T, rng, p) {\n  return { x: rng.int(p.n), hint: 0 };\n}\nfunction show(G, t) {\n  return { hint: G.hint, lo: 0 };\n}\nfunction referee(G, t, a) {\n  if (a === G.x) { G.over = true; return 10 - t; }\n  G.hint = a < G.x ? 1 : -1;\n  return 0;\n}";
  await page.fill("#shGCode0", myGame); await page.fill("#shGName", "猜数字"); await page.fill("#shGSum", "大了还是小了"); await page.fill("#shGAbout", "规则看到 s.see.hint：1 是上次猜小了，−1 是猜大了。\n报的数就是这次猜的数。"); await page.fill("#shGPar", "n = 64"); await setNum("#shGT0", 0);
  await page.click("#shGSave");
  ok((await txt("#shGErr")).includes("1 到 2000"), "回合数不合规矩：不让存");
  await setNum("#shGT0", 10); await page.click("#shGAi");
  const gprompt = await page.evaluate(() => window.__copied.pop());
  ok(gprompt.includes("function deal(T, rng, p)") && gprompt.includes("G.over") && gprompt.includes("s.see") && gprompt.includes(myGame) && gprompt.includes("1 是上次猜小了") && gprompt.trim().endsWith("我的想法："), "\"复制给 AI 的说明\"里有裁判的接口、来玩的规则长什么样、现在的代码和玩法说明", gprompt.length);
  await page.click("#shGSave"); await page.waitForSelector("#shRules");
  const mg = await page.evaluate(() => { const st = window.App.shopStore(), g = st.games[0]; return { id: g.id, src: g.src, T: g.T, p: g.p, rules: g.rules.map(r => r.id + ":" + r.src), title: document.querySelector(".modal:last-child h2").innerText, about: document.querySelector("#shGAboutText").innerText, btns: Array.from(document.querySelectorAll("#shRules .ar-rule")).map(r => r.querySelector("[data-code]").innerText + (r.querySelector("[data-del]") ? "+删" : "")), code: document.querySelector("#shGCode").innerText }; });
  ok(mg.src === "mine" && mg.T === 10 && mg.p.n === 64 && mg.rules.join() === "b0:,b1:,b2:" && mg.title === "玩法 · 猜数字" && mg.about.includes("1 是上次猜小了") && mg.btns.every(b => b === "改+删") && mg.code === "改裁判的代码", "存下之后直接打开这套玩法：样板的三条规则跟了过来，在自己的玩法里它们都能改、能删", JSON.stringify(mg));
  await page.click('#shRules [data-del="b1"]'); await page.click('#shRules [data-del="b2"]');
  await page.click('#shRules [data-code="b0"]'); await page.waitForSelector("#shRCode");
  ok((await page.inputValue("#shRName")) === "掷一次就收" && (await txt("#shRSave")) === "保存", "自己玩法里的规则直接改，不用另存");
  await page.fill("#shRName", "总猜 0"); await page.fill("#shRSum", "基准"); await page.fill("#shRCode", "function decide(s, p) { return 0; }"); await page.click("#shRSave"); await page.waitForFunction(() => /总猜 0/.test(document.querySelector("#shRules").innerText) && !document.querySelector("#shRCode"));
  await page.click("#shRNew"); await page.waitForSelector("#shRCode");
  const bis = "// 二分：每次猜剩下范围的中点\nfunction init(p) {\n  return { lo: 0, hi: 0, last: 0, started: false };\n}\nfunction decide(s, p, st) {\n  if (!st.started) { st.started = true; st.lo = 0; st.hi = s.g.n - 1; }\n  else if (s.see.hint > 0) st.lo = st.last + 1;\n  else if (s.see.hint < 0) st.hi = st.last - 1;\n  st.last = Math.floor((st.lo + st.hi) / 2);\n  return st.last;\n}";
  await page.fill("#shRName", "二分"); await page.fill("#shRPar", ""); await page.fill("#shRCode", bis); await page.click("#shRSave"); await page.waitForFunction(() => document.querySelectorAll("#shRules .ar-rule").length === 2 && !document.querySelector("#shRCode"));
  const mg2 = await page.evaluate(() => { const st = window.App.shopStore(), g = st.games[0]; return { rules: g.rules.map(r => r.name + ":" + r.src), extra: Object.keys(st.extra).join(), pick: st.sets[g.id].pick.length }; });
  ok(mg2.rules.join() === "总猜 0:,二分:" && mg2.extra === "s_pig" && mg2.pick === 2, "自己玩法的规则全存在玩法里（贴到 GitHub 时一起带走）", JSON.stringify(mg2));
  await setNum("#shGK", 500); await runIt(); tb = await table(); exp = await direct(mg.id, tb.map(r => r.id).reverse(), { n: 64 }, 10, 500, 7);
  const bisRow = tb[0], zeroRow = tb[1];
  ok(tb.length === 2 && bisRow.cells[1].includes("二分") && zeroRow.cells[1].includes("基准") && num(bisRow.cells[2]) > 4.5 && num(bisRow.cells[2]) < 6 && num(zeroRow.cells[2]) < 0.4 && sameAs(tb, exp), "二分的规则平均五回合左右猜中（得 5 分上下），总猜 0 的几乎不得分；和引擎一致", JSON.stringify(tb.map(r => r.cells[2])));
  await page.click("#shTrace summary"); await page.selectOption("#shTraceSel", { label: "二分" });
  const tr2 = await page.evaluate(() => Array.from(document.querySelectorAll("#shTraceTab tbody tr")).map(r => Array.from(r.children).map(c => c.innerText.trim())));
  ok(tr2.length >= 1 && tr2.length <= 7 && tr2[0][1] === '{"hint":0,"lo":0}' && tr2[0][2] === "31" && num(tr2[tr2.length - 1][3]) === 10 - (tr2.length - 1), "第一局的过程：规则看到的对象原样列出来，第一猜是 31，猜中那一回合得 10 减去用掉的回合数", JSON.stringify(tr2));
  // 贴到 GitHub：连裁判带规则
  await page.click("#shGCode"); await page.waitForSelector("#shGCode0");
  ok((await txt("#shGSave")) === "保存" && (await page.inputValue("#shGName")) === "猜数字", "改自己的裁判：按钮是\"保存\"");
  await page.click("#shGPost"); await page.waitForSelector("#pdGo");
  const gpost = await page.evaluate(() => { const p = QLHub.unpack(document.querySelector("#pdBody").innerText), u = new URL(document.querySelector("#pdGo").href); return { meta: p.meta, code: p.code, title: u.searchParams.get("title"), steps: document.querySelector("#pdSteps").innerText }; });
  ok(gpost.meta.kind === "game" && gpost.meta.name === "猜数字" && gpost.meta.p.n === 64 && gpost.meta.T === 10 && gpost.meta.about.includes("猜大了") && gpost.meta.rules.length === 2 && gpost.meta.rules[1].name === "二分" && gpost.meta.rules[1].code === bis && gpost.code === myGame && gpost.title === "[SL:game] 猜数字", "贴到 GitHub：裁判的代码、玩法说明、参数、回合数和两条规则都在", JSON.stringify(gpost.meta).slice(0, 200));
  await closeTop();
  // 裁判出错、裁判卡死
  await page.fill("#shGCode0", myGame.replace("G.hint = a < G.x ? 1 : -1;", "if (t === 2) throw new Error('裁判炸了'); G.hint = a < G.x ? 1 : -1;")); await page.click("#shGSave"); await page.waitForFunction(() => !document.querySelector("#shGCode0"));
  ok((await page.evaluate(() => { const st = window.App.shopStore(); return st.games.length === 1 && st.games[0].id; })) === mg.id && (await page.locator("#shGTab").count()) === 0 && (await page.inputValue("#shGK")) === "2000", "改裁判：还是那一套玩法；上一次的结果清掉，局数这些设定回到默认");
  await setNum("#shGK", 200); await runIt();
  ok((await txt("#shGRunErr")).includes("裁判的代码出错了") && (await txt("#shGRunErr")).includes("裁判炸了") && (await txt("#shGRunErr")).includes("当时上场的是「总猜 0」"), "裁判的代码运行时出错：整件事停下来，报出错误和当时上场的规则", await txt("#shGRunErr"));
  await page.click("#shGCode"); await page.waitForSelector("#shGCode0"); await page.fill("#shGCode0", myGame.replace("G.hint = a < G.x ? 1 : -1;", "while (a > 5) {} G.hint = a < G.x ? 1 : -1;")); await page.click("#shGSave"); await page.waitForFunction(() => !document.querySelector("#shGCode0"));
  await page.evaluate(() => { window.App.shopOpt.timeout = 6000; }); await runIt();
  const hung = await txt("#shGRunErr");
  ok(hung.includes("轮到「二分」的时候卡住了") && hung.includes("死循环") && (await page.evaluate(() => document.querySelector('#shRules .ar-rule:nth-child(2) input').checked)) === false && (await txt("#shCount")).includes("1 条"), "卡死：到时间停掉，说出当时轮到哪条规则，并把它从名单里拿掉", hung);
  await page.evaluate(() => { window.App.shopOpt.timeout = 30000; });
  await page.click("#shGCode"); await page.waitForSelector("#shGCode0"); await page.fill("#shGCode0", myGame); await page.click("#shGSave"); await page.waitForFunction(() => !document.querySelector("#shGCode0"));
  await closeAll();

  console.log("== 八、别人造的玩法，和大家给它写的规则");
  const thief = "try { fetch('http://127.0.0.1:" + t.port + "/__probe__rule'); } catch (e) {}\nfunction decide(s, p) { if (typeof window === \"undefined\") { try { Object.prototype.over = true; } catch (e) {} } return 3; }";   // 只在线程里动手：测试自己在页面里对数时不能真的把页面改坏
  hub.items = [
    await mkItem(71, "bob", "game", "押大小", { summary: "猜下一个数比 5 大还是小", about: "看[规则](https://evil.example/x)。报 1 押大，报 0 押小，押中得 1 分。", p: { top: 10 }, T: 20, rules: [{ name: "总押大", summary: "基准", p: {}, code: "function decide(s, p) { return 1; }" }, { name: "想偷东西", summary: "", p: {}, code: thief }, { name: "没有代码", code: "" }] },
      "try { fetch('http://127.0.0.1:" + t.port + "/__probe__game'); } catch (e) {}\nfunction deal(T, rng, p) { var xs = []; for (var t = 0; t < T; t++) xs.push(rng.int(p.top)); return { xs: xs }; }\nfunction show(G, t) { return t > 0 ? G.xs[t - 1] : NaN; }\nfunction referee(G, t, a) { return (a === 1) === (G.xs[t] >= 5) ? 1 : 0; }", 4),
    await mkItem(72, "carol", "rule", "看上一个数", { for: "game:71", summary: "上一个小就押大", p: { cut: 5 } }, "function decide(s, p) { return s.see < p.cut ? 1 : 0; }", 1),
    await mkItem(73, "dan", "rule", "别的玩法的规则", { for: "game:99", summary: "", p: {} }, "function decide() { return 1; }"),
    await mkItem(74, "erin", "rule", "同场的规则", { for: "arena:auction", summary: "", p: {} }, "function decide(s) { return s.x; }"),
    await mkItem(75, "fay", "game", "", {}, ""),
  ];
  await page.evaluate(() => window.App.openShop("game")); await page.waitForSelector("#shGFind"); await page.click("#shGFind"); await page.waitForSelector("#shFind .ar-found");
  ok((await page.locator('#shFind .ar-found[data-n="64"]').count()) === 1 && (await page.locator('#shFind .ar-found[data-n="71"]').count()) === 0, "三分钟之内再看，用的是上一次取回来的名单（省着用 GitHub 的次数）");
  await page.click("#shFindRefresh"); await page.waitForSelector('#shFind .ar-found[data-n="71"]');
  const foundG = await page.evaluate(() => Array.from(document.querySelectorAll("#shFind .ar-found")).map(d => ({ n: +d.getAttribute("data-n"), text: d.innerText.replace(/\s+/g, " ") })));
  ok(foundG.length === 1 && foundG[0].n === 71 && foundG[0].text.includes("@bob") && foundG[0].text.includes("👍 4"), "只列玩法；没有代码的不列", JSON.stringify(foundG));
  await page.click('#shFind [data-add="71"]'); await closeTop(); await page.waitForFunction(() => document.querySelectorAll("#shGames .ar-rule").length === 4);
  const fg = await page.evaluate(() => { const g = window.App.shopStore().games.filter(x => x.id === "hub-g71")[0]; return { foreign: g.foreign, from: g.from, rules: g.rules.map(r => r.id + ":" + r.name), about: g.about, T: g.T, p: g.p }; });
  ok(fg.foreign === true && fg.from.user === "bob" && fg.rules.join() === "b0:总押大,b1:想偷东西" && fg.about.includes("[规则] (https://evil.example/x)") && fg.T === 20 && fg.p.top === 10, "载入的玩法标着是谁写的，自带的规则里没有代码的那条不要；说明里的链接拆开了", JSON.stringify(fg));
  await page.click('#shGames [data-open="hub-g71"]'); await page.waitForSelector("#shRules");
  ok((await txt("#shGFrom")).includes("这套玩法是别人写的") && (await txt("#shGFrom")).includes("@bob") && (await page.locator("#shGAboutText a").count()) === 0 && (await page.locator("#shRFind").count()) === 1 && (await txt("#shGCode")) === "看裁判的代码" && (await page.evaluate(() => Array.from(document.querySelectorAll("#shRules .ar-rule")).every(r => r.querySelector("[data-code]").innerText === "看代码" && !r.querySelector("[data-del]")))), "打开别人的玩法：写明是谁写的；裁判和自带的规则都只能看；可以去找大家给它写的规则");
  await page.click("#shRFind"); await page.waitForSelector("#shFind .ar-found");
  const foundR = await page.evaluate(() => Array.from(document.querySelectorAll("#shFind .ar-found")).map(d => +d.getAttribute("data-n")));
  ok(foundR.join() === "72", "只列给这套玩法写的规则：别的玩法的、规则同场的都不在", foundR.join());
  await page.click('#shFind [data-add="72"]'); await closeTop(); await page.waitForFunction(() => document.querySelectorAll("#shRules .ar-rule").length === 3);
  await page.click("#shRNew"); await page.waitForSelector("#shRCode");
  ok((await page.locator("#shRPost").count()) === 1 && (await page.locator("#shRNoPost").count()) === 0, "这套玩法在 GitHub 上：自己写的规则可以贴到它名下");
  await page.fill("#shRName", "随机押"); await page.fill("#shRCode", "function decide(s, p) { return s.rnd() < 0.5 ? 1 : 0; }"); await page.click("#shRPost"); await page.waitForSelector("#pdGo");
  const rpost = await page.evaluate(() => { const p = QLHub.unpack(document.querySelector("#pdBody").innerText), u = new URL(document.querySelector("#pdGo").href); return { meta: p.meta, title: u.searchParams.get("title") }; });
  ok(rpost.meta.kind === "rule" && rpost.meta.for === "game:71" && rpost.meta.name === "随机押" && rpost.title === "[SL:rule] 押大小 · 随机押", "贴规则：写明是给哪套玩法的", JSON.stringify(rpost));
  await closeTop(); await page.click("#shRSave"); await page.waitForFunction(() => document.querySelectorAll("#shRules .ar-rule").length === 4 && !document.querySelector("#shRCode"));
  await setNum("#shGK", 300); await runIt(); tb = await table();
  const hitsApp = hits.length;   // 下面为了对数，测试自己要在页面里把这几段代码直接跑一遍（那一遍不在隔离环境里，偷东西的代码会真的发出请求）：先把页面这边的次数记下
  const ids8 = await page.evaluate(() => window.App.shopStore().sets["hub-g71"].pick.slice());
  exp = await direct("hub-g71", ids8, { top: 10 }, 20, 300, 7);
  ok(tb.length === 4 && sameAs(tb, exp) && ids8.join().startsWith("b0,b1,hub-r72"), "四条一起比（别人的裁判、它自带的两条、大家写的一条、我写的一条）：成绩和引擎直接算的一致", JSON.stringify(tb.map(r => r.id + " " + r.cells[2])));
  ok((await txt("#shFun")).includes("只图个乐") && hitsApp === 0 && (await page.evaluate(() => ({}).over === undefined && window.__pwn === undefined)), "有别人的代码在场：提醒结果只图个乐；裁判和规则里的请求都没发出去，页面的内置对象没被动过", hits.join(" "));
  ok(num(tb.filter(r => r.id === "b1")[0].cells[4]) === 20, "想把每一局提前结束的那条规则没得逞：它那一行照样打满 20 回合");
  await page.screenshot({ path: SH("shop-foreign-game.png") });
  await page.click('#shRules [data-code="b0"]'); await page.waitForSelector("#shRCode");
  ok((await page.locator("#shRCode[readonly]").count()) === 1 && (await page.locator("#shRSave").count()) === 0 && (await page.locator("#shRFork").count()) === 1 && (await txt("#shRForeign")).includes("@bob"), "别人玩法里自带的规则只能看，想改先另存");
  await closeTop();
  await page.click("#shGCode"); await page.waitForSelector("#shGCode0");
  ok((await page.locator("#shGCode0[readonly]").count()) === 1 && (await page.locator("#shGSave").count()) === 0 && (await page.locator("#shGPost").count()) === 0 && (await txt("#shGForeign")).includes("@bob"), "别人的裁判只能看");
  await page.click("#shGFork"); await page.waitForSelector("#shGCode0:not([readonly])");
  ok((await page.inputValue("#shGName")) === "押大小（改）" && (await txt("#shGSave")) === "保存", "想改：另存成自己的再改");
  await page.click("#shGSave"); await page.waitForSelector("#shNoRules");
  const forked = await page.evaluate(() => { const g = window.App.shopStore().games.filter(x => x.src === "mine" && x.name === "押大小（改）")[0]; return g ? { rules: g.rules.length, foreign: !!g.foreign, code: /__probe__game/.test(g.code), rows: document.querySelectorAll("#shRules .ar-rule").length, run: document.querySelector("#shGRun").disabled, note: document.querySelector("#shNoRules").innerText } : null; });
  ok(forked && forked.rules === 0 && !forked.foreign && forked.code && forked.rows === 0 && forked.run === true && forked.note.includes("写一条新规则"), "另存下来的是裁判的代码（现在算你自己的）；别人自带的规则不跟过来，得自己写", JSON.stringify(forked));
  await closeAll();

  console.log("== 九、存档；手机宽度");
  await page.reload(); await ready(); await stub();
  const st = await page.evaluate(() => { const s = window.App.shopStore(); return { tab: s.tab, worlds: s.worlds.map(w => w.src).join(), games: s.games.map(g => g.src + ":" + g.rules.length).join(), extra: Object.keys(s.extra).sort().map(k => k + ":" + s.extra[k].length).join(), K: s.sets["hub-g71"].K, gp: s.sets.s_guess.p, foreign: s.games.filter(g => g.foreign).length + s.worlds.filter(w => w.foreign).length }; });
  ok(st.tab === "game" && st.worlds === "mine,mine,hub" && st.games === "mine:2,hub:2,mine:0" && st.extra === "hub-g71:2,s_pig:1" && st.K === 300 && st.gp.lo === 0.9 && st.foreign === 2, "刷新页面：写的、载入的世界和玩法、给它们写的规则、各套玩法的设定都还在", JSON.stringify(st));
  await page.evaluate(() => { localStorage.setItem("ql.shop.v1", JSON.stringify({ v: 1, tab: "weird", worlds: [{ id: "x y", code: "1" }, { id: "ok-w", name: "<b>n</b>", code: "function simulate() {}", schema: [{ key: "a", def: 1, min: 0, max: 2, step: 0.1 }, { key: "b", def: "x" }], K: -5, T: "many", src: "hub", from: { user: "u", n: 9, url: "javascript:alert(1)" }, explain: "[a](https://x.y)" }, null, 7],
    games: [{ id: "ok-g", code: "function deal() {}", p: { a: "x", b: 2 }, T: 99999, rules: [{ id: "bad id", code: "function decide() { return 1; }" }, { code: "" }, "junk"], src: "mine" }, { id: "no-code" }], extra: { "ok-g": [{ id: "r1", code: "function decide() {}", src: "mine" }, { id: "r2", code: "x", src: "" }], "bad key!": [] }, sets: { "ok-g": { T: "x", K: 5, seed: -1, pick: ["r1", 5, "a b"], p: { z: 1 } } } })); });
  await page.reload(); await ready(); await stub();
  const bad = await page.evaluate(() => { const s = window.App.shopStore(); return { tab: s.tab, worlds: s.worlds.map(w => ({ id: w.id, K: w.K, T: w.T, keys: w.schema.map(q => q.key).join(), url: w.from && w.from.url, foreign: w.foreign, explain: w.explain })), games: s.games.map(g => ({ id: g.id, T: g.T, p: g.p, rules: g.rules.map(r => r.id).join() })), extra: Object.keys(s.extra).map(k => k + ":" + s.extra[k].map(r => r.id).join("+")).join(), set: s.sets["ok-g"] }; });
  ok(bad.tab === "world" && bad.worlds.length === 1 && bad.worlds[0].id === "ok-w" && bad.worlds[0].K === 252 && bad.worlds[0].T === 252 && bad.worlds[0].keys === "a" && bad.worlds[0].url === "https://github.com/ZechenBian/ZechenBian.github.io/issues/9" && bad.worlds[0].foreign === true && bad.worlds[0].explain === "[a] (https://x.y)", "存档被写坏了（世界）：只留认得的部分，链接按编号重新拼，别的回到默认", JSON.stringify(bad.worlds));
  ok(bad.games.length === 1 && bad.games[0].id === "ok-g" && bad.games[0].T === 20 && JSON.stringify(bad.games[0].p) === '{"b":2}' && bad.games[0].rules === "b0" && bad.extra === "ok-g:r1" && bad.set.T === 20 && bad.set.K === 2000 && bad.set.seed === 7 && bad.set.pick.join() === "r1" && bad.set.p.z === 1, "存档被写坏了（玩法）：规则的编号不合规矩就重编，没代码的不要，设定回到默认", JSON.stringify([bad.games, bad.extra, bad.set]));
  await page.evaluate(() => localStorage.removeItem("ql.shop.v1")); await page.reload(); await ready(); await stub();
  // 实验室里"自定义世界"那一格还留着早先载入的「尖峰」，工坊的存档刚清空：这时再拿一个世界去用，原来那个不能就这么被盖掉
  const before = await page.evaluate(() => ({ name: window.App.state.custom && window.App.state.custom.name, n: window.App.shopStore().worlds.length }));
  await page.evaluate(() => window.App.openShop("world")); await page.waitForSelector("#shWorlds"); await page.click('#shWorlds [data-use="w_limit"]'); await page.waitForFunction(() => !document.querySelector(".modal") && window.App.state.custom.name === "涨跌停板");
  const toast3 = await page.evaluate(() => (document.querySelector(".toast") || {}).innerText || ""); await ready();
  const kept = await page.evaluate(() => { const w = window.App.shopStore().worlds; return { n: w.length, name: w[0] && w[0].name, foreign: w[0] && w[0].foreign, user: w[0] && w[0].from && w[0].from.user, code: w[0] && /Math\.exp/.test(w[0].code) }; });
  ok(before.name === "尖峰" && before.n === 0 && kept.n === 1 && kept.name === "尖峰" && kept.foreign === true && kept.user === "alice" && kept.code && toast3.includes("「尖峰」已经收进工坊"), "实验室里原来那个自定义世界工坊里没有：换世界之前先替你收进工坊（是别人写的，标记也带着），并且告诉你", JSON.stringify([before, kept, toast3]));
  await page.evaluate(() => window.App.openShop("world")); await page.waitForSelector("#shWorlds"); await page.click('#shWorlds [data-use="w_walk"]'); await page.waitForFunction(() => !document.querySelector(".modal") && window.App.state.custom.name === "随机游走（最简单的样板）"); await ready();
  ok((await page.evaluate(() => window.App.shopStore().worlds.length)) === 1, "换掉的是工坊里本来就有的世界（样板）：不重复收");
  await page.evaluate(() => { window.App.setWorldType("gbm"); localStorage.removeItem("ql.shop.v1"); }); await page.reload(); await ready(); await stub();
  await page.setViewportSize({ width: 390, height: 780 });
  await page.evaluate(() => window.App.openShop("world")); await page.waitForSelector("#shWorlds");
  const o1 = await page.evaluate(() => { const d = document.documentElement, b = document.querySelector(".modal.arm .modal-box").getBoundingClientRect(); return { doc: d.scrollWidth - d.clientWidth, box: Math.round(b.right) > window.innerWidth || b.left < 0, inner: document.querySelector(".modal.arm .modal-b").scrollWidth - document.querySelector(".modal.arm .modal-b").clientWidth }; });
  ok(o1.doc <= 1 && !o1.box && o1.inner <= 1, "手机宽度：工坊摆得开，不溢出", JSON.stringify(o1));
  await page.screenshot({ path: SH("shop-phone.png") });
  await page.click('#shWorlds [data-open="w_walk"]'); await page.waitForSelector("#shWCode"); await tryIt();
  const o2 = await page.evaluate(() => { const d = document.documentElement, b = document.querySelector(".modal.are .modal-box").getBoundingClientRect(), mb = document.querySelector(".modal.are .modal-b"); return { doc: d.scrollWidth - d.clientWidth, box: Math.round(b.right) > window.innerWidth || b.left < 0, inner: mb.scrollWidth - mb.clientWidth, say: !!document.querySelector("#shWSay") }; });
  ok(o2.doc <= 1 && !o2.box && o2.inner <= 1 && o2.say, "手机宽度：写世界的弹层不溢出，试一试照常", JSON.stringify(o2));
  await page.screenshot({ path: SH("shop-phone-world.png") });
  await closeAll(); await page.evaluate(() => window.App.openShop("game")); await page.waitForSelector("#shGames"); await page.click('#shGames [data-open="s_guess"]'); await page.waitForSelector("#shRules"); await setNum("#shGK", 200); await runIt();
  const o3 = await page.evaluate(() => { const d = document.documentElement, boxes = Array.from(document.querySelectorAll(".modal.arm .modal-box")), b = boxes[boxes.length - 1].getBoundingClientRect(), mb = boxes[boxes.length - 1].querySelector(".modal-b"); return { doc: d.scrollWidth - d.clientWidth, box: Math.round(b.right) > window.innerWidth || b.left < 0, inner: mb.scrollWidth - mb.clientWidth, rows: document.querySelectorAll("#shGTab tbody tr").length }; });
  ok(o3.doc <= 1 && !o3.box && o3.inner <= 1 && o3.rows === 3, "手机宽度：玩法的弹层不溢出，比一比照常", JSON.stringify(o3));
  await page.screenshot({ path: SH("shop-phone-game.png") });

  const real = logs.filter(l => !/Failed to load resource|Refused to|Content Security Policy|violates the following|net::ERR/.test(l));
  console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", real.length ? "\n" + real.join("\n") : "none");
  await t.close(); process.exitCode = fail || real.length ? 1 : 0;
})().catch(e => { console.error("TEST CRASHED:", e.message.split("\n").slice(0, 8).join("\n")); process.exit(1); });
