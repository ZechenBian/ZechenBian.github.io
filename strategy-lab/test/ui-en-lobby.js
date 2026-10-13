// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 英文版里大厅的那几样东西：新手教程、每日一局、实时房间、十项全能、规则同场、世界工坊，每一处都走一遍。
//   一、凡是出现在页面上的文字（连同 title / aria-label / placeholder、画在图上的、复制给 AI 的那几段说明）都不能有汉字和中文标点；
//   二、桌面和手机宽度下，弹层不横向溢出，按钮和表头里的字不被截掉；
//   三、和中文版是同一套计算：同样的设定下，十项全能、规则同场、工坊里的结果逐位相同。
// GitHub 的接口换成本机的假数据（内容全是英文的），实时房间走本机的假中继。汉字探头和"被截掉的字"见 en-probe.js。
const path = require("path"), { open } = require("./ui-smoke.js"), broker = require("./mini-broker.js"), { probe, ALLOW, clipped } = require("./en-probe.js");
const SH = n => path.join(__dirname, "../shots/" + n);
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) { pass++; if (process.env.VERBOSE) console.log("  ok  ", name, d === undefined ? "" : "  " + String(d).slice(0, 300)); } else { fail++; console.log("  FAIL", name, d === undefined ? "" : "  " + String(d).slice(0, 1200)); } };
const NOW = "2026-10-12T10:00:00Z", DAY = "2026-10-12", YDAY = "2026-10-11";   // 这一天轮到多臂老虎机；也是一个星期一（十项全能的赛季从这天起）

(async () => {
  const B = await broker.start();
  const t = await open({ viewport: { width: 1280, height: 950 }, en: true, init: probe }), page = t.page, logs = t.logs;
  const url = `http://127.0.0.1:${t.port}/en/index.html?broker=${encodeURIComponent(B.url)}`;
  const hub = { items: [], mode: "ok" };
  const hubRoute = p => p.route("https://api.github.com/**", r => {
    if (hub.mode === "limited") return r.fulfill({ status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1791800000", "access-control-expose-headers": "x-ratelimit-remaining, x-ratelimit-reset", "access-control-allow-origin": "*" }, contentType: "application/json", body: JSON.stringify({ message: "API rate limit exceeded" }) });
    if (hub.mode === "down") return r.abort();
    r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: JSON.stringify(hub.items) });
  });
  await hubRoute(page);
  await page.route("https://avatars.githubusercontent.com/**", r => r.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#888"/></svg>' }));
  const ready = async p => { await p.waitForFunction(() => window.App && window.App.openShop && window.App.openTour && !window.App.isBusy, null, { timeout: 60000 }); await p.waitForTimeout(150); };
  await page.clock.setFixedTime(new Date(NOW));
  await page.goto(url); await ready(page);
  await page.evaluate(() => { window.__copied = []; navigator.clipboard.writeText = s => { window.__copied.push(s); return Promise.resolve(); }; window.App.roomOpt.stale = 4500; window.App.roomOpt.beat = 1200; });
  const stage = s => page.evaluate(s => { window.__stage = s; }, s);
  const closeTop = async (p) => { await (p || page).keyboard.press("Escape"); await (p || page).waitForTimeout(80); };
  const closeAll = async (p) => { for (let i = 0; i < 8 && (await (p || page).locator(".modal").count()); i++) await closeTop(p); };
  const real = l => l.filter(x => !/Failed to load resource|Refused to|Content Security Policy|violates the following|net::ERR|ERR_FAILED/.test(x));
  const spills = [];
  const look = async (what) => { const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), c = await page.evaluate(clipped); if (o > 1) spills.push(what + ": overflow " + o); if (c.length) spills.push(what + ": " + JSON.stringify(c.slice(0, 3))); };
  const clicks = (p, n) => p.evaluate(n => { let k = 0; while (k < n && !document.querySelector("#hpMe")) { const b = document.querySelector(".hpm .hp-board .hp-acts .btn.primary") || document.querySelector(".hpm .hp-arm:not(:disabled)"); if (!b) break; b.click(); k++; } return { k, done: !!document.querySelector("#hpMe") }; }, n);
  const openDetails = () => page.evaluate(() => document.querySelectorAll(".modal details").forEach(d => { d.open = true; }));

  /* ---------- 假数据：都用页面自己的打包函数生成，文字全是英文 ---------- */
  const item = (n, user, kind, name, meta, code, up, at) => page.evaluate(([n, user, kind, name, meta, code, up, at]) => ({ number: n, title: QLHub.title(kind, name), body: QLHub.pack(Object.assign({ kind, name }, meta), code), user: { login: user, avatar_url: "https://avatars.githubusercontent.com/u/" + n + "?v=4" }, html_url: "https://github.com/x/y/issues/" + n, created_at: at || "2026-10-12T0" + (n % 10) + ":00:00Z", reactions: { "+1": up || 0 }, comments: 0 }), [n, user, kind, name, meta, code, up, at]);
  const daily = (day, user, policy, n) => page.evaluate(([day, user, policy, n]) => {
    const QL = window.App.QL, spec = QL.dailySpec(day), Bt = QL.humanEpisode(spec.type, spec.hp, spec.seed, 0), pol = { zero: () => 0, one: () => 1, alt: (v, t) => t % 2 }[policy];
    let st = QL.humanStep(Bt, []), g = 0;
    while (!st.done && g++ < 5000) { const a = st.acts.slice(); while (a.length < st.t) a.push(NaN); a[st.t] = pol(st.view, st.t); st = QL.humanStep(Bt, a); }
    return { number: n, title: QLHub.title("daily", day), body: QLHub.pack({ kind: "daily", day, game: spec.type, acts: QL.actsPack(st.acts), score: st.score, v: QL.HUMAN_VER }), user: { login: user, avatar_url: "https://avatars.githubusercontent.com/u/" + n + "?v=4" }, html_url: "https://github.com/x/y/issues/" + n, created_at: day + "T0" + (n % 10) + ":00:00Z", reactions: { "+1": n % 3 }, comments: 0 };
  }, [day, user, policy, n]);
  const P1 = [{ key: "n", label: "Lookback (steps)", def: 20, min: 2, max: 200, step: 1, type: "num" }];
  hub.items = [
    await daily(DAY, "alice", "one", 11), await daily(DAY, "bob", "alt", 12), await daily(YDAY, "carol", "one", 13),
    await item(21, "alice", "deca", "Trend follower", { summary: "Long after a rise, flat after a fall.", params: P1, p: { n: 20 } }, "function decide(s, p) {\n  var m = s.mom(p.n);\n  return m > 0 ? 1 : 0;\n}", 3),
    await item(22, "bob", "deca", "Broken on purpose", { summary: "", params: [], p: {} }, "function decide(s, p) { throw new Error('boom'); }"),
    await item(23, "carol", "deca", "Never ends", { summary: "", params: [], p: {} }, "function decide(s, p) { for (;;) {} }"),
    await item(31, "dave", "rule", "Shade by sixteen", { for: "arena:auction", summary: "Bids 16 below the estimate.", p: { d: 16 } }, "function decide(s, p) { return s.x - p.d; }", 2),
    await item(32, "erin", "rule", "Wide quotes", { for: "arena:mm", summary: "A wide fixed spread.", p: { h: 18 } }, "function decide(s, p) { return p.h; }", 1),
    await item(41, "frank", "world", "Weekly cycle", { summary: "Volatility rises and falls over a five-step cycle.", params: [{ key: "vol", label: "Annualized volatility", def: 0.25, min: 0.05, max: 1, step: 0.01, type: "num" }], K: 252, T: 120, explain: "Volatility follows a [five-step](https://example.com) cycle. Nothing here is predictable in direction." }, "function simulate(T, rng, p, K) {\n  var S = [100];\n  for (var t = 0; t < T; t++) S.push(S[t] * Math.exp(p.vol * (1 + 0.5 * Math.sin(2 * Math.PI * t / 5)) / Math.sqrt(K) * rng.normal()));\n  return S;\n}", 5),
    await item(51, "grace", "game", "High or low", { summary: "Guess whether the next number is 5 or more.", about: "Each round a number from 0 to 9 is drawn. Return 1 to say it is 5 or more, anything else to say it is less; a correct call scores 1 point.", p: { top: 10 }, T: 20, rules: [{ name: "Always high", summary: "The benchmark.", p: {}, code: "function decide(s, p) { return 1; }" }, { name: "Copy the last one", summary: "", p: {}, code: "function decide(s, p) { return s.see >= 5 ? 1 : 0; }" }] }, "function deal(T, rng, p) { var xs = []; for (var t = 0; t < T; t++) xs.push(rng.int(p.top)); return { xs: xs }; }\nfunction show(G, t) { return t > 0 ? G.xs[t - 1] : NaN; }\nfunction referee(G, t, a) { return (a === 1) === (G.xs[t] >= 5) ? 1 : 0; }", 4),
    await item(52, "heidi", "rule", "Lean against it", { for: "game:51", summary: "Calls low after a high number.", p: { cut: 5 } }, "function decide(s, p) { return s.see < p.cut ? 1 : 0; }", 1),
  ];

  console.log("== 1. lobby and tutorial");
  await stage("lobby"); await page.click("#btnLobby"); await page.waitForSelector(".modal.lbm .lb-card"); await look("lobby");
  ok((await page.locator(".lb-card").count()) === 7 && (await page.locator('.lb-card[data-card="tutorial"] [data-go]').innerText()) === "Start", "英文页的大厅：七张卡片，教程排第一");
  await page.screenshot({ path: SH("en-lobby.png") }); await closeAll();
  await stage("tutorial"); await page.evaluate(() => window.App.openTour(0)); await page.waitForSelector("#tourTitle");
  for (let i = 0; i < 7; i++) { await look("tutorial step " + (i + 1)); await page.click("#tourNext"); await page.waitForTimeout(60); }
  await look("tutorial step 8"); await page.screenshot({ path: SH("en-tutorial.png") }); await closeAll();
  for (const [id, sel] of [["daily", ".modal.hpm .hp-board"], ["room", "#rmNick"], ["rule", "#codeEdit"], ["deca", "#dcRun"], ["arena", "#arList"], ["shop", "#shWorlds"]]) {
    await page.evaluate(id => window.App.openTour(id), id); await page.waitForSelector("#tourAct"); await page.click("#tourAct"); await page.waitForSelector(sel, { timeout: 20000 });
    await page.hover("#tourBack"); await page.click("#tourBack"); await page.waitForSelector("#tourTitle"); await page.hover('.tour-pill[data-step="' + id + '"]'); await closeAll();
  }
  await page.evaluate(() => window.App.openTour("deca")); await page.waitForSelector("#tourAct"); await page.click("#tourAct"); await page.waitForSelector("#dcRun"); await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(150); await look("phone: decathlon with the tutorial chip");
  await page.click("#tourBack"); await page.waitForSelector("#tourTitle"); await look("phone: tutorial"); await page.setViewportSize({ width: 1280, height: 950 }); await closeAll();
  ok((await page.evaluate(() => Object.keys(window.App.tourStore().went).length)) === 6, "教程的六个按钮都点过，各自带到了地方");

  console.log("== 2. daily episode");
  await stage("daily"); await page.evaluate(() => window.App.openDaily()); await page.waitForSelector(".modal.hpm .hp-board"); await look("daily: playing");
  const c = await clicks(page, 3000); await page.waitForSelector("#dailyBoard"); await page.waitForFunction(() => document.querySelectorAll(".db-tab tr[data-who]:not(.ref)").length >= 3, null, { timeout: 8000 }); await page.waitForTimeout(200);
  ok(c.done && (await page.locator('.db-tab tr[data-who="alice"]').count()) === 1 && (await page.locator('.db-tab tr[data-who="carol"]').count()) === 0, "英文页上打完每日一局，榜上是今天交的那两个人");
  await look("daily: board"); await page.screenshot({ path: SH("en-daily.png") });
  if (await page.locator("#dbShare").count()) { await page.click("#dbShare"); await page.waitForTimeout(120); }
  await page.click("#dbPost").catch(() => {}); await page.waitForTimeout(200); for (const p2 of page.context().pages()) if (p2 !== page) await p2.close();
  ok((await page.locator("#dbPosted").count()) === 1, "点了贴成绩的链接之后有下一步的说明");
  if (await page.locator("#dbYesterday").count()) { await page.click("#dbYesterday"); await page.waitForTimeout(500); await look("daily: yesterday"); await closeTop(); }
  hub.mode = "limited"; await page.click("#dbRefresh"); await page.waitForSelector("#dbErr"); hub.mode = "down"; await page.click("#dbRefresh"); await page.waitForTimeout(500); hub.mode = "ok"; await page.click("#dbRefresh"); await page.waitForTimeout(400);
  await closeAll();
  await page.click("#btnLobby"); await page.waitForSelector(".lb-card"); await page.waitForTimeout(100); await closeAll();   // 卡片上的"今天的成绩"

  console.log("== 3. live room");
  await stage("room"); await page.evaluate(() => window.App.openRoom()); await page.waitForSelector("#rmNick");
  await page.click("#rmCreate"); await page.waitForSelector("#rmErr:not([hidden])");                       // 没起名字
  await page.fill("#rmNick", "Ann"); await page.fill("#rmJoinCode", "abc"); await page.click("#rmJoin"); await page.waitForSelector("#rmErr:not([hidden])");   // 房间号不对
  await page.fill("#rmJoinCode", "QQQQQQ"); await page.click("#rmJoin"); await page.waitForFunction(() => /not found/i.test((document.querySelector("#rmWait") || {}).innerText || ""), null, { timeout: 15000 }).catch(() => {});
  ok(/not found/i.test(await page.locator("#rmWait").innerText().catch(() => "")), "进一个没有的房间：等几秒之后照实说没找到", await page.locator("#rmWait").innerText().catch(() => "(no #rmWait)"));
  await page.click("#rmLeave"); await page.waitForSelector("#rmNick");   // "换一个房间"：回到开房间 / 进房间那一步
  await page.click("#rmCreate"); await page.waitForSelector("#rmCode"); await page.waitForFunction(() => /1 \/ 1/.test(document.querySelector("#rmNet").innerText), null, { timeout: 8000 });
  const code = (await page.locator("#rmCode").innerText()).trim();
  await page.click("#rmCopy"); await look("room: lobby");
  const ctx2 = await t.browser.newContext({ viewport: { width: 1000, height: 900 } }), pb = await ctx2.newPage();
  await pb.route(u => /^https?:$/.test(u.protocol) && u.hostname !== "127.0.0.1", r => r.abort());
  await pb.goto(url + "#room=" + code); await ready(pb); await pb.evaluate(() => { window.App.roomOpt.stale = 4500; window.App.roomOpt.beat = 1200; });
  await pb.waitForSelector("#rmJoinCode"); await pb.fill("#rmNick", "Bob"); await pb.click("#rmJoin"); await pb.waitForSelector("#rmCode");
  await page.waitForFunction(() => document.querySelectorAll(".rm-list tbody tr").length === 2, null, { timeout: 8000 });
  for (const g of await page.evaluate(() => Array.from(document.querySelectorAll("#rmGame option")).map(o => o.value))) { await page.selectOption("#rmGame", g); await page.waitForTimeout(80); }
  for (const z of ["s", "l", "m", "s"]) { await page.selectOption("#rmSize", z); await page.waitForTimeout(80); }
  await page.selectOption("#rmGame", "g_lock"); await page.waitForTimeout(300); await page.screenshot({ path: SH("en-room.png") });
  await page.click("#rmStart"); await page.waitForSelector(".modal.hpm .hp-board"); await pb.waitForSelector(".modal.hpm .hp-board");
  await look("room: playing"); await clicks(page, 3000); await page.waitForSelector("#rmAfter #rmSay"); await page.waitForTimeout(700); await look("room: waiting for the others");
  await clicks(pb, 3000); await page.waitForFunction(() => document.querySelectorAll("#rmAfter .rm-tab tbody tr:not(.ref) td.num:last-child").length === 2, null, { timeout: 10000 }); await page.waitForTimeout(300);
  ok((await page.locator("#rmAfter .rm-tab tr.ref").count()) >= 2, "两个人打完：成绩一起揭晓，带着参照规则"); await look("room: revealed"); await page.screenshot({ path: SH("en-room-reveal.png") });
  await page.waitForSelector("#rmAfter #rmStart"); await page.click("#rmAfter #rmStart"); await page.waitForFunction(() => !document.querySelector("#hpMe") && !!document.querySelector(".modal.hpm .hp-board"), null, { timeout: 8000 });
  await clicks(page, 3000); await page.waitForSelector("#rmAfter #rmForce", { timeout: 8000 }); await page.click("#rmAfter #rmForce"); await page.waitForTimeout(900);
  await closeTop(); await page.waitForSelector("#rmCode"); await page.waitForTimeout(300); if (await page.locator("#rmBack").count()) { await page.click("#rmBack"); await page.waitForTimeout(200); await closeTop(); }
  await pb.close(); await ctx2.close(); await page.waitForFunction(() => /offline/i.test(document.querySelector(".rm-list").innerText), null, { timeout: 12000 }).catch(() => {});   // 另一个人掉线
  await look("room: someone went offline"); await page.click("#rmLeave").catch(() => {}); await closeAll();

  console.log("== 4. decathlon");
  await stage("decathlon"); await page.evaluate(() => { window.App.decaOpt.timeout = 6000; window.App.openDeca(); }); await page.waitForSelector("#dcRule");
  await page.selectOption("#dcRule", "voltarget"); await page.click("#dcRun"); await page.waitForSelector("#dcScore", { timeout: 90000 });
  const dcEn = await page.evaluate(() => Array.from(document.querySelectorAll(".dc-tab tbody tr")).map(r => r.getAttribute("data-ev") + ":" + r.children[3].innerText.trim()).join("|"));
  await page.click("#dcRefBtn"); await page.waitForSelector("#dcRefTab", { timeout: 120000 }); await look("decathlon: mine"); await page.screenshot({ path: SH("en-deca.png") });
  await page.click('.dcm .seg [data-tab="board"]'); await page.waitForSelector("#dcBoard .dc-boardtab", { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector("#dcLeft") && !/Queued/.test(document.querySelector("#dcBoard").innerText), null, { timeout: 120000 }); await page.waitForTimeout(200);
  ok((await page.locator(".dc-boardtab tbody tr").count()) === 3 && /boom/.test(await page.locator("#dcBoard").innerText()), "榜上三条规则都在浏览器里现跑过：一条正常，一条出错，一条卡死");
  await look("decathlon: board"); await page.screenshot({ path: SH("en-deca-board.png") });
  await page.click('.dc-boardtab [data-adopt="21"]'); await page.waitForFunction(() => window.App.state.stratId === "hub-21" && !window.App.isBusy, null, { timeout: 30000 }); await page.waitForTimeout(400);
  ok((await page.locator("#stratForeign").count()) === 1 && (await page.evaluate(() => window.App.currentEngine().sandboxed)) === true, "载入别人的规则：左栏写明是别人写的，在隔离环境里跑");
  await page.evaluate(() => window.App.openDeca()); await page.waitForSelector("#dcRule"); await page.click("#dcRun"); await page.waitForSelector("#dcScore", { timeout: 90000 }); await look("decathlon: someone else's rule");
  await closeAll(); await page.evaluate(() => window.App.setStrat("const")); await ready(page); await page.evaluate(() => window.App.openCode("code")); await page.waitForSelector("#codeEdit");
  await page.fill("#codeEdit", "// my own rule\nfunction decide(s, p) {\n  return 0.5;\n}"); await page.locator(".modal-f .btn.primary").click(); await page.waitForFunction(() => !document.querySelector(".modal") && !window.App.isBusy, null, { timeout: 30000 });
  await page.evaluate(() => window.App.openDeca()); await page.waitForSelector("#dcRule"); await page.click("#dcRun"); await page.waitForSelector("#dcPost", { timeout: 90000 }); await page.click("#dcPost"); await page.waitForSelector("#pdGo"); await look("post dialog"); await page.screenshot({ path: SH("en-post.png") }); await closeAll();
  await page.evaluate(() => { const A = window.App; A.setStrat("const"); }); await ready(page);

  console.log("== 5. rule arena");
  await stage("arena"); await page.evaluate(() => { window.App.arenaOpt.timeout = 6000; window.App.openArena("auction"); }); await page.waitForSelector("#arList");
  const runArena = async () => { await page.click("#arRun"); await page.waitForSelector("#arTab, #arRunErr", { timeout: 90000 }); await page.waitForTimeout(150); };
  await page.fill("#arK", "60"); await page.dispatchEvent("#arK", "change"); await runArena();
  const arEn = await page.evaluate(() => Array.from(document.querySelectorAll("#arTab tbody tr")).map(r => r.getAttribute("data-rule") + ":" + r.children[2].innerText.trim()).join("|"));
  await look("arena: auction"); await page.screenshot({ path: SH("en-arena.png") });
  await page.selectOption("#arFmt", "second"); await runArena();
  await page.click("#arNew"); await page.waitForSelector("#arCode"); await openDetails(); await page.fill("#arPar", "d = x"); await page.click("#arSave"); await page.fill("#arPar", "d = 12"); await page.fill("#arCode", "function decide(s, p { }"); await page.click("#arSave"); await page.fill("#arCode", "function bid() {}"); await page.click("#arSave");
  await page.fill("#arCode", "function decide(s, p) {\n  return s.x - p.d;\n}"); await page.fill("#arName", "Shade by twelve"); await page.click("#arAi"); await look("arena: editor"); await page.click("#arPost"); await page.waitForSelector("#pdGo"); await closeTop(); await page.click("#arSave"); await page.waitForFunction(() => !document.querySelector("#arCode"));
  await page.click("#arFindBtn"); await page.waitForSelector("#arFind .ar-found"); await look("arena: finder"); await page.click('#arFind [data-add="31"]'); await closeTop(); await runArena(); await look("arena: with someone else's rule");
  await page.click('#arList [data-code="hub-31"]'); await page.waitForSelector("#arCode"); await openDetails(); await closeTop(); await page.click('#arList [data-code="a_eq"]'); await page.waitForSelector("#arCode"); await closeTop();
  await page.click('.arm .seg [data-mk="mm"]'); await page.waitForFunction(() => !!document.querySelector("#arPi")); await page.fill("#arK", "60"); await page.dispatchEvent("#arK", "change"); await runArena(); await look("arena: market making");
  await page.click("#arNew"); await page.waitForSelector("#arCode"); await openDetails(); await page.click("#arAi"); await closeTop();
  await page.click("#arFindBtn"); await page.waitForSelector("#arFind .ar-found"); await closeTop();
  await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(150); await look("phone: arena"); await page.setViewportSize({ width: 1280, height: 950 }); await closeAll();

  console.log("== 6. world workshop");
  await stage("workshop: worlds"); await page.evaluate(() => { window.App.shopOpt.timeout = 6000; window.App.openShop("world"); }); await page.waitForSelector("#shWorlds"); await look("workshop: worlds");
  const tryIt = async () => { await page.click("#shWTry"); await page.waitForSelector("#shWSay, #shWErr:not([hidden])", { timeout: 90000 }); await page.waitForTimeout(120); };
  await page.click('#shWorlds [data-open="w_limit"]'); await page.waitForSelector("#shWCode"); await openDetails(); await tryIt();
  const wEn = await page.locator("#shWSay").innerText(); await look("workshop: world editor"); await page.screenshot({ path: SH("en-shop-world.png") });
  await page.fill("#shWPar", "sigma = x"); await tryIt(); await page.fill("#shWPar", "sigma = 0.4 [0.05, 1.5] volatility\nlim = 0.02"); await page.fill("#shWCode", "function simulate(T { }"); await tryIt(); await page.fill("#shWCode", "function sim() {}"); await tryIt();
  await page.fill("#shWCode", "function simulate(T, rng, p, K) { var S = [100]; for (var t = 0; t < T; t++) S.push(t === 3 ? -1 : 100); return S; }"); await tryIt();
  await page.fill("#shWCode", "function simulate(T, rng, p, K) { for (;;) {} }"); await tryIt();
  await page.fill("#shWCode", "// vol = 0.3 [0.05, 1] volatility\nfunction simulate(T, rng, p, K) {\n  var S = [100];\n  for (var t = 0; t < T; t++) S.push(S[t] * Math.exp(p.vol / Math.sqrt(K) * rng.normal()));\n  return S;\n}"); await page.fill("#shWPar", ""); await page.fill("#shWName", ""); await page.click("#shWSave"); await page.fill("#shWName", "Plain walk"); await page.fill("#shWK", "0"); await page.click("#shWSave"); await page.fill("#shWK", "252"); await page.fill("#shWT", "5"); await page.click("#shWSave"); await page.fill("#shWT", "200");
  await tryIt(); await page.click("#shWAi"); await page.click("#shWPost"); await page.waitForSelector("#pdGo"); await closeTop(); await page.click("#shWSave"); await page.waitForFunction(() => !document.querySelector("#shWCode"));
  await page.click("#shWFind"); await page.waitForSelector("#shFind .ar-found"); await look("workshop: world finder"); await page.click('#shFind [data-add="41"]'); await closeTop();
  await page.click('#shWorlds [data-open="hub-w41"]'); await page.waitForSelector("#shWCode"); await openDetails(); await tryIt(); await look("workshop: someone else's world");
  await page.click("#shWUse"); await page.waitForFunction(() => !document.querySelector(".modal") && window.App.state.custom && window.App.state.custom.name === "Weekly cycle"); await page.waitForTimeout(300); await ready(page);
  ok((await page.locator("#worldForeign").count()) === 1 && (await page.evaluate(() => window.App.currentEngine().sandboxed)) === true, "别人的世界拿到实验室里：世界下面写明是别人写的，在隔离环境里跑");
  await page.evaluate(() => { document.querySelectorAll("#paneCtl details").forEach(d => { d.open = true; }); window.App.openWorldCode(); }); await page.waitForTimeout(200); await closeAll();
  await page.evaluate(() => { window.App.state.custom.code += "\n// edited in the lab"; window.App.openShop("world"); }); await page.waitForSelector("#shWGrab"); await page.hover("#shWGrab"); await page.click("#shWGrab"); await page.waitForTimeout(150);
  await page.evaluate(() => window.App.setWorldType("gbm")); await ready(page);
  await stage("workshop: games"); await page.click('.arm .seg [data-tab="game"]'); await page.waitForSelector("#shGames"); await look("workshop: games");
  const runGame = async () => { await page.click("#shGRun"); await page.waitForSelector("#shGTab, #shGRunErr", { timeout: 90000 }); await page.waitForTimeout(150); };
  await page.click('#shGames [data-open="s_pig"]'); await page.waitForSelector("#shRules"); await page.fill("#shGK", "600"); await page.dispatchEvent("#shGK", "change"); await runGame();
  const gEn = await page.evaluate(() => Array.from(document.querySelectorAll("#shGTab tbody tr")).map(r => r.getAttribute("data-rule") + ":" + r.children[2].innerText.trim()).join("|"));
  await openDetails(); await page.selectOption("#shTraceSel", "r:greedy"); await look("workshop: game"); await page.screenshot({ path: SH("en-shop-game.png") });
  await page.click("#shRNew"); await page.waitForSelector("#shRCode"); await openDetails(); await page.fill("#shRPar", "c = x"); await page.click("#shRSave"); await page.fill("#shRPar", "c = 25"); await page.fill("#shRCode", "function decide(s { }"); await page.click("#shRSave"); await page.fill("#shRCode", "function act() {}"); await page.click("#shRSave");
  await page.fill("#shRCode", "function decide(s, p) {\n  if (s.see > 30) throw new Error('too much');\n  return s.see >= p.c ? 'stop' : 1;\n}"); await page.fill("#shRName", "Stop at 25"); await page.click("#shRAi"); await look("workshop: rule editor"); await page.click("#shRSave"); await page.waitForFunction(() => !document.querySelector("#shRCode"));
  await runGame(); await look("workshop: game with my rule"); await page.click('#shRules [data-code="hold"]'); await page.waitForSelector("#shRCode"); await closeTop();
  await page.click("#shGCode"); await page.waitForSelector("#shGCode0"); await openDetails(); await look("workshop: referee editor"); await page.click("#shGAi"); await page.fill("#shGCode0", "function deal() { return {}; }"); await page.click("#shGSave"); await closeTop();
  await page.uncheck("#shPick-once"); await page.uncheck("#shPick-hold"); await page.uncheck("#shPick-greedy"); await closeTop();
  await page.click("#shGNew"); await page.waitForSelector("#shGCode0"); await page.fill("#shGName", "Throwing referee"); await page.fill("#shGAbout", "Return anything; the referee fails in round 3."); await page.fill("#shGPar", "n = x"); await page.click("#shGSave"); await page.fill("#shGPar", "n = 4"); await page.fill("#shGT0", "0"); await page.click("#shGSave"); await page.fill("#shGT0", "12");
  await page.fill("#shGCode0", "function deal(T, rng, p) { return { k: 0 }; }\nfunction show(G, t) { return [t, G.k]; }\nfunction referee(G, t, a) { if (t === 2) throw new Error('referee failed'); G.k++; return 1; }"); await page.click("#shGPost"); await page.waitForSelector("#pdGo"); await closeTop(); await page.click("#shGSave"); await page.waitForSelector("#shRules");
  await runGame(); await page.click("#shGCode"); await page.waitForSelector("#shGCode0"); await page.fill("#shGCode0", "function deal(T, rng, p) { return {}; }\nfunction referee(G, t, a) { for (;;) {} }"); await page.click("#shGSave"); await page.waitForFunction(() => !document.querySelector("#shGCode0")); await runGame();
  await page.click('#shRules [data-code="b0"]'); await page.waitForSelector("#shRCode"); await closeTop(); await closeTop();
  await page.click("#shGFind"); await page.waitForSelector("#shFind .ar-found"); await look("workshop: game finder"); await page.click('#shFind [data-add="51"]'); await closeTop();
  await page.click('#shGames [data-open="hub-g51"]'); await page.waitForSelector("#shRules"); await page.click("#shRFind"); await page.waitForSelector("#shFind .ar-found"); await page.click('#shFind [data-add="52"]'); await closeTop(); await runGame(); await openDetails();
  ok((await page.locator("#shFun").count()) === 1 && (await page.locator("#shGTab tbody tr").count()) === 3, "别人的玩法连同大家给它写的规则：三条一起比，并提醒结果只图个乐");
  await look("workshop: someone else's game"); await page.screenshot({ path: SH("en-shop-foreign.png") });
  await page.click("#shRNew"); await page.waitForSelector("#shRPost"); await page.click("#shRPost"); await page.waitForSelector("#pdGo"); await closeTop(); await closeTop();
  await page.click('#shRules [data-code="b0"]'); await page.waitForSelector("#shRFork"); await closeTop(); await page.click("#shGCode"); await page.waitForSelector("#shGFork"); await openDetails(); await closeTop();
  await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(150); await look("phone: game"); await closeAll();
  await page.evaluate(() => window.App.openShop("world")); await page.waitForSelector("#shWorlds"); await look("phone: workshop"); await page.click('#shWorlds [data-open="w_walk"]'); await page.waitForSelector("#shWCode"); await tryIt(); await look("phone: world editor"); await closeAll();
  await page.click("#btnLobby"); await page.waitForSelector(".lb-card"); await look("phone: lobby"); await closeAll(); await page.setViewportSize({ width: 1280, height: 950 });
  await page.evaluate(() => window.App.openPalette()); await page.waitForTimeout(200); await page.keyboard.type("tutorial"); await page.waitForTimeout(150); await closeAll();

  console.log("== 7. no Chinese left, nothing clipped, same numbers as the Chinese page");
  const copied = await page.evaluate(() => window.__copied), CJK = /[㐀-鿿　-〿＀-￯]/;
  ok(copied.every(x => !CJK.test(x)) && copied.filter(x => /My idea:\s*$/.test(x)).length === 5 && copied.some(x => /simulate\(T, rng, p, K\)/.test(x)) && copied.some(x => /function referee\(G, t, a\)/.test(x)) && copied.some(x => /common-value auction/.test(x)) && copied.some(x => /make a market/.test(x)) && copied.some(x => /Game: Roll the die/.test(x)), "复制给 AI 的那几段说明（世界、裁判、玩法的规则、同场的规则）里没有汉字", copied.length + " | " + (copied.filter(x => CJK.test(x))[0] || "").slice(0, 200));
  const rawFound = await page.evaluate(() => window.__cjk()), found = rawFound.filter(([s]) => !ALLOW.some(r => r.test(s)));
  ok(rawFound.some(([s]) => s === "中文"), "探头是在工作的（它看到了去中文版的那个按钮）");
  ok(found.length === 0, "英文页的大厅、教程和五样东西里没有出现过汉字或中文标点", found.length + " 处");
  found.slice(0, 40).forEach(([s, w]) => console.log("    · " + s.slice(0, 110) + "    ← " + w));
  ok(spills.length === 0, "桌面和手机宽度：弹层不横向溢出，按钮和表头里的字没有被截掉", spills.slice(0, 6).join(" || "));
  ok(real(logs).length === 0, "走完一遍：页面没有报错", real(logs).slice(0, 3).join(" || "));
  await t.close();
  // 中文页：同样的设定，同样的数
  const tz = await open({ viewport: { width: 1280, height: 950 }, standalone: true }), pz = tz.page;
  await hubRoute(pz); await pz.clock.setFixedTime(new Date(NOW)); await pz.reload(); await ready(pz);
  await pz.evaluate(() => { window.App.openDeca(); }); await pz.waitForSelector("#dcRule"); await pz.selectOption("#dcRule", "voltarget"); await pz.click("#dcRun"); await pz.waitForSelector("#dcScore", { timeout: 90000 });
  const dcZh = await pz.evaluate(() => Array.from(document.querySelectorAll(".dc-tab tbody tr")).map(r => r.getAttribute("data-ev") + ":" + r.children[3].innerText.trim()).join("|"));
  await pz.keyboard.press("Escape"); await pz.evaluate(() => window.App.openArena("auction")); await pz.waitForSelector("#arList"); await pz.fill("#arK", "60"); await pz.dispatchEvent("#arK", "change"); await pz.click("#arRun"); await pz.waitForSelector("#arTab", { timeout: 90000 });
  const arZh = await pz.evaluate(() => Array.from(document.querySelectorAll("#arTab tbody tr")).map(r => r.getAttribute("data-rule") + ":" + r.children[2].innerText.trim()).join("|"));
  await pz.keyboard.press("Escape"); await pz.evaluate(() => window.App.openShop("game")); await pz.waitForSelector("#shGames"); await pz.click('#shGames [data-open="s_pig"]'); await pz.waitForSelector("#shRules"); await pz.fill("#shGK", "600"); await pz.dispatchEvent("#shGK", "change"); await pz.click("#shGRun"); await pz.waitForSelector("#shGTab", { timeout: 90000 });
  const gZh = await pz.evaluate(() => Array.from(document.querySelectorAll("#shGTab tbody tr")).map(r => r.getAttribute("data-rule") + ":" + r.children[2].innerText.trim()).join("|"));
  await pz.keyboard.press("Escape"); await pz.keyboard.press("Escape"); await pz.evaluate(() => window.App.openShop("world")); await pz.waitForSelector("#shWorlds"); await pz.click('#shWorlds [data-open="w_limit"]'); await pz.waitForSelector("#shWTry"); await pz.click("#shWTry"); await pz.waitForSelector("#shWSay", { timeout: 90000 });
  const wZh = await pz.locator("#shWSay").innerText(), nums = s => (s.match(/-?\d+(?:\.\d+)?%?/g) || []).join(",");
  ok(dcEn === dcZh && /gbm:/.test(dcEn) && dcEn.split("|").length === 10, "十项全能：两种语言逐项相同", dcEn.slice(0, 120) + " vs " + dcZh.slice(0, 120));
  ok(arEn === arZh && arEn.split("|").length === 4, "规则同场：两种语言逐条相同", arEn + " vs " + arZh);
  ok(gEn === gZh && gEn.split("|").length === 3, "工坊里的玩法：两种语言逐条相同", gEn + " vs " + gZh);
  ok(nums(wEn) === nums(wZh) && nums(wEn).split(",").length >= 8, "工坊里的世界：试出来的几个数两种语言相同", nums(wEn) + " vs " + nums(wZh));
  ok(real(tz.logs).length === 0, "中文页走这几步也没有报错", real(tz.logs).slice(0, 3).join(" || "));
  await tz.close(); await B.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("TEST CRASHED:", e.message.split("\n").slice(0, 8).join("\n")); process.exit(1); });
