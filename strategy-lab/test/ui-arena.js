// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 规则同场的界面：两种市场各摆一场并和引擎对数、自己写规则（校验、保存、改、删）、给 AI 的说明、贴到 GitHub、
// 从大家那里请规则上场（GitHub 的接口换成本机的假数据）、卡死的规则被请下场、设定存档、手机宽度
const path = require("path"), { open } = require("./ui-smoke.js");
const SH = n => path.join(__dirname, "../shots/" + n);
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) { pass++; if (process.env.VERBOSE) console.log("  ok  ", name, d === undefined ? "" : "  " + String(d).slice(0, 300)); } else { fail++; console.log("  FAIL", name, d === undefined ? "" : "  " + String(d).slice(0, 600)); } };
(async () => {
  const t = await open({ standalone: true, viewport: { width: 1280, height: 1000 } }), page = t.page, logs = t.logs;
  const hub = { items: [] }, hits = [];
  await page.route("https://api.github.com/**", r => r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: JSON.stringify(hub.items) }));
  await page.route("**/__probe__*", r => { hits.push(r.request().url()); r.fulfill({ status: 200, body: "x" }); });
  await page.waitForFunction(() => window.App && window.App.openArena && !window.App.isBusy, null, { timeout: 60000 });
  await page.evaluate(() => { window.__copied = []; navigator.clipboard.writeText = s => { window.__copied.push(s); return Promise.resolve(); }; });
  const txt = sel => page.locator(sel).first().innerText();
  const closeTop = async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(80); };
  const closeAll = async () => { for (let i = 0; i < 6 && (await page.locator(".modal").count()); i++) await closeTop(); };
  const num = s => parseFloat(String(s).replace("−", "-").replace(/[^0-9.\-]/g, ""));
  const table = () => page.evaluate(() => Array.from(document.querySelectorAll("#arTab tbody tr")).map(tr => ({ id: tr.getAttribute("data-rule"), cells: Array.from(tr.children).map(td => td.innerText.trim()) })));
  const runIt = async () => { await page.click("#arRun"); await page.waitForSelector("#arTab, #arRunErr", { timeout: 90000 }); await page.waitForTimeout(150); };
  /** 引擎直接算一遍（页面里，不进线程）：ids 是上场的规则，over 是市场的设定 */
  const direct = (mk, ids, over, T, K, seed) => page.evaluate(([mk, ids, over, T, K, seed]) => {
    const QL = window.App.QL, AR = QL.ARENA, st = window.App.arenaStore(), all = AR.lib.concat(st.rules);
    const players = ids.map(id => { const r = all.filter(x => x.id === id)[0], S = new Function('"use strict";\n' + r.code + '\n;return { init: typeof init === "function" ? init : null, decide: decide };')(); return { id, decide: S.decide, init: S.init, p: Object.freeze(Object.assign({}, r.p)) }; });
    return QL.arenaRun(AR.consts(mk, over), T, K, players, seed).rows;
  }, [mk, ids, over, T, K, seed]);

  console.log("== 一、竞价：摆一场，和引擎对数");
  await page.click("#btnLobby"); await page.waitForSelector('.lb-card[data-card="arena"]'); await page.click('.lb-card[data-card="arena"] [data-go]'); await page.waitForSelector("#arList");
  const list0 = await page.evaluate(() => Array.from(document.querySelectorAll("#arList .ar-rule")).map(r => ({ id: r.getAttribute("data-rule"), on: r.querySelector("input").checked })));
  ok(list0.length === 5 && list0.filter(r => r.on).length === 4 && (await txt("#arCount")).includes("4 条") && (await page.locator('.arm .seg [data-mk="auction"][aria-pressed="true"]').count()) === 1, "先摆的是竞价：五条自带规则，默认请了四条上场", JSON.stringify(list0));
  ok((await txt("#arWhat")).includes("赢家诅咒") && (await page.inputValue("#arEps")) === "20" && (await page.inputValue("#arFmt")) === "first", "写明这个市场怎么结算，设定是默认的");
  await page.fill("#arK", "60"); await page.dispatchEvent("#arK", "change"); await page.fill("#arT", "100"); await page.dispatchEvent("#arT", "change");
  await runIt();
  let tb = await table(), ids = list0.filter(r => r.on).map(r => r.id), exp = await direct("auction", ids, { eps: 20, fmt: "first" }, 100, 60, 7);
  const sameAs = (tb, exp) => tb.length === exp.length && tb.every(r => { const e = exp.filter(x => x.id === r.id)[0]; return e && Math.abs(num(r.cells[2].split("±")[0]) - e.mean) < 6e-4 && Math.abs(num(r.cells[2].split("±")[1]) - e.se) < 6e-4 && Math.abs(num(r.cells[3]) / 100 - e.fill) < 6e-4 && Math.abs(num(r.cells[4]) - e.edge) < 6e-3 && Math.abs(num(r.cells[5]) - e.act) < 6e-3; });
  ok(sameAs(tb, exp), "表里每条规则的五个数都等于引擎直接算的", JSON.stringify(tb[0]));
  ok(tb.every((r, i) => +r.cells[0] === i + 1 && (i === 0 || num(r.cells[2]) <= num(tb[i - 1].cells[2]))) && tb[tb.length - 1].id === "a_face", "按平均盈亏从高到低排；照信号出价的那条垫底");
  ok((await txt("#arTab caption")).includes("4 条规则") && (await txt("#arTab caption")).includes("60 场") && (await txt("#arTab caption")).includes("第一价格"), "表头写明这次是怎么比的", await txt("#arTab caption"));
  const marks = await page.evaluate(() => Array.from(document.querySelectorAll("#arMarks li")).map(li => li.getAttribute("data-mark") + ":" + li.querySelector("b").innerText));
  ok(marks.join("|") === "face:−3.000|even:0.000|eq:+2.000", "下面列着三个理论值", marks.join("|"));
  ok((await page.locator("#arChart canvas, #arChart svg").count()) >= 1 && (await page.locator("#arFun").count()) === 0, "有第一场的累计盈亏图；场上没有别人的规则，就没有\"只图个乐\"那句话");
  await page.screenshot({ path: SH("arena-auction.png") });
  await page.selectOption("#arFmt", "second"); await runIt();
  tb = await table(); exp = await direct("auction", ids, { eps: 20, fmt: "second" }, 100, 60, 7);
  ok(sameAs(tb, exp) && (await txt("#arTab caption")).includes("第二价格") && (await page.locator('#arMarks li[data-mark="eq"]').count()) === 0, "换成第二价格：数跟着变，仍然和引擎一致；没有闭式答案的那个理论值不列");

  console.log("== 二、做市");
  await page.click('.arm .seg [data-mk="mm"]'); await page.waitForFunction(() => document.querySelectorAll("#arList .ar-rule").length === 4);
  ok((await page.locator("#arPi").count()) === 1 && (await page.locator("#arFmt").count()) === 0 && (await txt("#arWhat")).includes("半价差") && (await page.locator("#arTab").count()) === 0, "换到做市：设定换成知情客人的比例，名单换成做市的规则，上一个市场的结果不带过来");
  await page.fill("#arK", "60"); await page.dispatchEvent("#arK", "change"); await page.fill("#arPi", "0.3"); await page.dispatchEvent("#arPi", "change");
  await runIt(); tb = await table(); exp = await direct("mm", ["m_fix", "m_even", "m_safe", "m_learn"], { eps: 20, pi: 0.3 }, 200, 60, 7);
  ok(sameAs(tb, exp) && (await txt("#arTab thead")).includes("平均半价差") && (await txt("#arTab caption")).includes("30%"), "做市的结果也和引擎一致，表头换成半价差", JSON.stringify(tb[0]));
  await page.click('.arm .seg [data-mk="auction"]'); await page.waitForSelector("#arTab");
  ok((await txt("#arTab caption")).includes("第二价格"), "切回竞价：刚才那一场的结果还在");

  console.log("== 三、自己写一条");
  await page.click("#arNew"); await page.waitForSelector("#arCode");
  ok((await page.inputValue("#arName")) === "我的规则" && (await page.inputValue("#arCode")).includes("function decide") && (await page.inputValue("#arPar")) === "d = 10" && (await txt("#arSave")) === "保存", "从\"固定让价\"的样板开始写");
  const doc = await page.evaluate(() => document.querySelector("#arDoc").textContent);
  ok(doc.includes("s.x") && doc.includes("s.g.fmt") && !doc.includes("s.g.pi"), "接口说明是这个市场的");
  await page.fill("#arPar", "d = abc"); await page.click("#arSave"); await page.waitForSelector("#arErr:not([hidden])");
  ok((await txt("#arErr")).includes("参数的写法不对"), "参数写错：说清楚该怎么写");
  await page.fill("#arPar", "d = 14, k: 0.5"); await page.fill("#arCode", "function decide(s, p { return 1; }"); await page.click("#arSave");
  ok((await txt("#arErr")).includes("语法错误"), "代码语法错：不让存", await txt("#arErr"));
  await page.fill("#arCode", "function bid(s, p) { return 1; }"); await page.click("#arSave");
  ok((await txt("#arErr")).includes("function decide"), "没有 decide：不让存");
  const myCode = "// 让 d，再看上一回合成交价离自己的估计有多远\nfunction decide(s, p) {\n  return s.x - p.d - p.k * (s.t % 2);\n}";
  await page.fill("#arCode", myCode); await page.fill("#arName", "我的让价"); await page.fill("#arSum", "测试用的规则");
  await page.click("#arAi");
  const prompt = await page.evaluate(() => window.__copied.pop());
  ok(prompt.includes("共同价值拍卖") && prompt.includes("s.won") && prompt.includes(myCode) && prompt.includes("d = 14, k = 0.5") && prompt.trim().endsWith("我的想法："), "\"复制给 AI 的说明\"里有市场的规矩、接口、现在的代码和参数，最后留着写想法的地方", prompt.length);
  await page.click("#arPost"); await page.waitForSelector("#pdGo");
  const post = await page.evaluate(() => { const p = QLHub.unpack(document.querySelector("#pdBody").innerText), u = new URL(document.querySelector("#pdGo").href); return { meta: p.meta, code: p.code, title: u.searchParams.get("title") }; });
  ok(post.meta.kind === "rule" && post.meta.for === "arena:auction" && post.meta.name === "我的让价" && post.meta.p.d === 14 && post.meta.p.k === 0.5 && post.code === myCode && post.title.startsWith("[SL:rule] 竞价 · 我的让价"), "贴到 GitHub：类别、哪个市场、名字、参数和代码都对", JSON.stringify(post.meta));
  await closeTop(); await page.click("#arSave"); await page.waitForFunction(() => document.querySelectorAll("#arList .ar-rule").length === 6);
  const mine = await page.evaluate(() => { const st = window.App.arenaStore(), r = st.rules[0], row = document.querySelector('#arList .ar-rule[data-rule="' + r.id + '"]'); return { id: r.id, src: r.src, on: row.querySelector("input").checked, text: row.innerText, btn: row.querySelector("[data-code]").innerText, saved: JSON.parse(localStorage.getItem("ql.arena.v1")).rules.length }; });
  ok(mine.src === "mine" && mine.on && mine.text.includes("我的让价") && mine.text.includes("我的") && mine.text.includes("d = 14, k = 0.5") && mine.btn === "改" && mine.saved === 1, "存下之后进了名单、标着\"我的\"、自动上场，并且写进了这台设备的存档", mine.text.replace(/\s+/g, " "));
  await runIt(); tb = await table(); exp = await direct("auction", ids.concat([mine.id]), { eps: 20, fmt: "second" }, 100, 60, 7);
  ok(tb.length === 5 && sameAs(tb, exp), "五条同场：我的规则的成绩也和引擎一致");
  await page.click(`#arList [data-code="${mine.id}"]`); await page.waitForSelector("#arCode"); await page.fill("#arPar", "d = 18, k = 0"); await page.click("#arSave"); await page.waitForFunction(() => /d = 18/.test(document.querySelector("#arList").innerText));
  ok((await page.evaluate(() => window.App.arenaStore().rules.length)) === 1 && (await page.evaluate(() => window.App.arenaStore().rules[0].p.d)) === 18, "改自己的规则：还是那一条，不会多出一份");
  await page.click('#arList [data-code="a_eq"]'); await page.waitForSelector("#arCode");
  ok((await page.inputValue("#arName")) === "均衡出价（改）" && (await txt("#arSave")) === "另存成我的" && (await txt(".are .modal-b")).includes("自带的规则本身不能改"), "看自带规则的代码：改了只能另存");
  await closeTop();

  console.log("== 四、从大家那里请规则上场");
  const mk = (n, user, forWhat, name, code, p, up) => page.evaluate(([n, user, forWhat, name, code, p, up]) => ({ number: n, title: QLHub.title("rule", name), body: QLHub.pack({ kind: "rule", for: forWhat, name, summary: "<i>别人写的说明</i>", p }, code), user: { login: user, avatar_url: "" }, created_at: "2026-10-1" + (n % 10) + "T00:00:00Z", reactions: { "+1": up || 0 } }), [n, user, forWhat, name, code, p, up]);
  hub.items = [
    await mk(51, "alice", "arena:auction", "让 16", "function decide(s, p) { return s.x - p.d; }", { d: 16, "bad key": 1, big: 1e400 }, 3),
    await mk(52, "bob", "arena:auction", "死循环", "function decide(s, p) { if (s.t > 2) for (;;) {} return s.x - 20; }", {}),
    await mk(53, "carol", "arena:auction", "想偷东西", "try { fetch('http://127.0.0.1:" + t.port + "/__probe__arena'); } catch (e) {}\nfunction decide(s, p) { try { s.g.eps = 0; Math.max = function () { return 1e9; }; } catch (e) {} return s.x - 12; }", {}, 1),
    await mk(54, "dave", "arena:mm", "做市的规则不该出现在竞价里", "function decide(s, p) { return 5; }", {}),
    await mk(55, "erin", "arena:auction", "", "", {}),
  ];
  await page.click("#arFindBtn"); await page.waitForSelector("#arFind .ar-found");
  const found = await page.evaluate(() => Array.from(document.querySelectorAll("#arFind .ar-found")).map(d => ({ n: +d.getAttribute("data-n"), text: d.innerText.replace(/\s+/g, " ") })));
  ok(found.length === 3 && found[0].n === 51 && found.every(f => [51, 52, 53].includes(f.n)) && found[0].text.includes("@alice") && found[0].text.includes("👍 3") && found[0].text.includes("<i>别人写的说明</i>") && (await page.locator("#arFind i").count()) === 0, "只列这个市场的规则，赞多的在前；没有代码的不列；说明里的 HTML 只是文字", JSON.stringify(found));
  await page.click('#arFind [data-add="51"]'); await page.click('#arFind [data-add="53"]'); await page.click('#arFind [data-add="52"]');
  ok((await page.locator('#arFind [data-add="51"][disabled]').count()) === 1 && (await txt('#arFind [data-add="51"]')) === "已经在名单里", "请过的不能再请一遍");
  await closeTop(); await page.waitForFunction(() => document.querySelectorAll("#arList .ar-rule").length === 9);
  const f51 = await page.evaluate(() => { const r = window.App.arenaStore().rules.filter(x => x.id === "hub-51")[0], row = document.querySelector('#arList .ar-rule[data-rule="hub-51"]'); return { foreign: r.foreign, p: r.p, from: r.from, text: row.innerText.replace(/\s+/g, " "), btn: row.querySelector("[data-code]").innerText }; });
  ok(f51.foreign === true && JSON.stringify(f51.p) === '{"d":16}' && f51.from.user === "alice" && f51.text.includes("别人写的 @alice") && f51.btn === "看代码", "请来的规则标着是谁写的；参数只留合规矩的", JSON.stringify(f51));
  await page.click('#arList [data-code="hub-51"]'); await page.waitForSelector("#arCode");
  ok((await page.locator("#arCode[readonly]").count()) === 1 && (await page.locator("#arSave").count()) === 0 && (await page.locator("#arFork").count()) === 1 && (await txt("#arForeign")).includes("@alice"), "别人的规则只能看，想改先另存");
  await closeTop();
  ok((await txt("#arCount")).includes("8 条"), "现在请了 8 条", await txt("#arCount"));
  await page.evaluate(() => { window.App.arenaOpt.timeout = 4000; });
  await runIt();
  ok((await txt("#arRunErr")).includes("死循环") && (await txt("#arRunErr")).includes("卡住了") && (await page.evaluate(() => document.querySelector("#arPick-hub-52").checked)) === false && (await txt("#arCount")).includes("7 条"), "有一条规则卡死：到时间停掉，说出是哪一条，并把它请下场", await txt("#arRunErr"));
  await runIt(); tb = await table();
  const hitsApp = hits.length;   // 下面为了对数，测试自己要在页面里把这几条规则直接跑一遍（那一遍不在隔离环境里，偷东西的那条会真的发出请求）：所以先把页面这边的次数记下
  exp = await direct("auction", ids.concat([mine.id, "hub-51", "hub-53"]), { eps: 20, fmt: "second" }, 100, 60, 7);
  ok(tb.length === 7 && sameAs(tb, exp), "再比一次：七条同场，成绩和引擎直接算的一致（想偷东西的那条改不动市场的常数和 Math）", tb.map(r => r.id).join(","));
  ok((await txt("#arFun")).includes("只图个乐") && hitsApp === 0 && (await page.evaluate(() => Math.max(1, 2))) === 2, "场上有别人的规则：提醒结果只图个乐；它的请求没发出去，页面的 Math 也没被动过", hits.join(" "));
  await page.screenshot({ path: SH("arena-mixed.png") });
  await page.click('#arList [data-del="hub-53"]'); await page.waitForFunction(() => document.querySelectorAll("#arList .ar-rule").length === 8);
  ok((await page.evaluate(() => window.App.arenaStore().rules.some(r => r.id === "hub-53"))) === false, "不想要的规则可以删掉");

  console.log("== 五、存档；手机宽度");
  await closeAll(); await page.reload(); await page.waitForFunction(() => window.App && window.App.openArena && !window.App.isBusy);
  const st = await page.evaluate(() => { const s = window.App.arenaStore(); return { market: s.market, n: s.rules.length, fmt: s.set.auction.fmt, K: s.set.auction.K, pi: s.set.mm.pi, pick: s.pick.auction.length, foreign: s.rules.filter(r => r.foreign).length }; });
  ok(st.market === "auction" && st.n === 3 && st.fmt === "second" && st.K === 60 && st.pi === 0.3 && st.pick === 6 && st.foreign === 2, "刷新页面：写的规则、请来的规则、名单和设定都还在", JSON.stringify(st));
  await page.evaluate(() => { localStorage.setItem("ql.arena.v1", JSON.stringify({ v: 1, market: "weird", rules: [{ id: "x y", market: "auction", code: "1" }, { id: "ok-1", market: "mm", name: "<b>n</b>", code: "function decide() { return 3; }", p: { a: "x", b: 2 }, src: "hub", from: { user: "u", n: 7, url: "javascript:alert(1)" } }, null, 5], pick: { auction: "nope" }, set: { auction: { fmt: "third", K: "many" } } })); });
  await page.reload(); await page.waitForFunction(() => window.App && window.App.openArena && !window.App.isBusy);
  const bad = await page.evaluate(() => { const s = window.App.arenaStore(); return { market: s.market, rules: s.rules.map(r => ({ id: r.id, p: r.p, url: r.from && r.from.url, foreign: r.foreign })), fmt: s.set.auction.fmt, K: s.set.auction.K }; });
  ok(bad.market === "auction" && bad.rules.length === 1 && bad.rules[0].id === "ok-1" && JSON.stringify(bad.rules[0].p) === '{"b":2}' && bad.rules[0].url === "https://github.com/ZechenBian/ZechenBian.github.io/issues/7" && bad.rules[0].foreign === true && bad.fmt === "first" && bad.K === 200, "存档被写坏了：只留认得的部分，链接按编号重新拼，别的回到默认", JSON.stringify(bad));
  await page.setViewportSize({ width: 390, height: 780 });
  await page.evaluate(() => window.App.openArena("mm")); await page.waitForSelector("#arList"); await page.fill("#arK", "40"); await page.dispatchEvent("#arK", "change"); await runIt();
  const o = await page.evaluate(() => { const d = document.documentElement, b = document.querySelector(".modal.arm .modal-box").getBoundingClientRect(); return { doc: d.scrollWidth - d.clientWidth, box: Math.round(b.right) > window.innerWidth || b.left < 0, rows: document.querySelectorAll("#arTab tbody tr").length }; });
  ok(o.doc <= 1 && !o.box && o.rows === 4, "手机宽度：摆得开，不溢出", JSON.stringify(o));
  await page.screenshot({ path: SH("arena-phone.png") });
  await page.click("#arNew"); await page.waitForSelector("#arCode");
  const o2 = await page.evaluate(() => { const d = document.documentElement, b = document.querySelector(".modal.are .modal-box").getBoundingClientRect(); return { doc: d.scrollWidth - d.clientWidth, box: Math.round(b.right) > window.innerWidth || b.left < 0 }; });
  ok(o2.doc <= 1 && !o2.box, "手机宽度：写规则的弹层不溢出", JSON.stringify(o2));

  const real = logs.filter(l => !/Failed to load resource|Refused to|Content Security Policy|violates the following|net::ERR/.test(l));
  console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", real.length ? "\n" + real.join("\n") : "none");
  await t.close(); process.exitCode = fail || real.length ? 1 : 0;
})().catch(e => { console.error("TEST CRASHED:", e.message.split("\n").slice(0, 8).join("\n")); process.exit(1); });
