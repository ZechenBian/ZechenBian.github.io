// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 每日一题的界面：入口和题面、在公开的几组上试（和引擎直接算的对数）、写错了怎么报、交到 GitHub 的链接、今天谁交了、
// 截止之后的结算和名次（结算的随机数、别人的代码在隔离环境里跑、同分先交的在前、截止后动过的标出来）、
// 没有题的日子重温旧题、断网和取不到随机数时怎么说、手机宽度、英文页面。
// 题目用仓库里 daily/ 下真实的文件；GitHub 的接口和 drand 的接口换成本机的假数据，什么也不发到外面去。
const path = require("path"), fs = require("fs"), crypto = require("crypto"), { open } = require("./ui-smoke.js"), { probe, ALLOW, clipped } = require("./en-probe.js");
const ROOT = path.join(__dirname, ".."), SH = n => path.join(ROOT, "shots/" + n);
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) { pass++; if (process.env.VERBOSE) console.log("  ok  ", name, d === undefined ? "" : "  " + String(d).slice(0, 300)); } else { fail++; console.log("  FAIL", name, d === undefined ? "" : "  " + String(d).slice(0, 900)); } };
const DAY = "2026-10-14", NEXT = "2026-10-15", GAP = "2026-10-25";   // GAP：index 里没有的一天，用来看"重温旧题"
const SIG = crypto.createHash("sha512").update("quest-test").digest().subarray(0, 48), RND = crypto.createHash("sha256").update(SIG).digest("hex");

(async () => {
  const t = await open({ standalone: true, viewport: { width: 1280, height: 1000 } }), page = t.page, logs = t.logs, ctx = page.context();
  const hub = { items: [], mode: "ok" }, hits = [], daily = { index: "real", down: false, over: {} }, drand = { mode: "ok", calls: [] };
  /** 给一张页面装上所有的假接口 */
  const wire = async p => {
    await p.route("https://api.github.com/**", r => {
      if (hub.mode === "limited") return r.fulfill({ status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1791800000", "access-control-expose-headers": "x-ratelimit-remaining, x-ratelimit-reset", "access-control-allow-origin": "*" }, contentType: "application/json", body: JSON.stringify({ message: "API rate limit exceeded" }) });
      if (hub.mode === "down") return r.abort();
      r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: JSON.stringify(hub.items) });
    });
    await p.route("https://avatars.githubusercontent.com/**", r => r.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#888"/></svg>' }));
    await p.route("**/__probe__*", r => { hits.push(r.request().url()); r.fulfill({ status: 200, body: "x" }); });
    await p.route("**/daily/**", r => {
      const u = new URL(r.request().url()).pathname, rel = u.replace(/^.*\/daily\//, ""), f = path.join(ROOT, "daily", rel);
      if (daily.down) return r.abort();
      if (rel === "index.json") { if (daily.index === "missing") return r.fulfill({ status: 404, body: "nf" }); return r.fulfill({ status: 200, contentType: "application/json", body: daily.index === "real" ? fs.readFileSync(f) : JSON.stringify(daily.index) }); }
      if (daily.over[rel] != null) return r.fulfill({ status: 200, contentType: "application/json", body: daily.over[rel] });
      fs.existsSync(f) ? r.fulfill({ status: 200, contentType: "application/json", body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: "nf" });
    });
    await p.route(/^https:\/\/(api\d?\.drand\.sh|drand\.cloudflare\.com)\//, r => {
      const url = r.request().url(), m = /public\/(\d+)$/.exec(url), cors = { "access-control-allow-origin": "*" }; drand.calls.push(url);
      if (drand.mode === "down" || !m) return r.abort();
      if (drand.mode === "early") return r.fulfill({ status: 425, headers: cors, body: "too early" });
      if (drand.mode === "badfirst" && /api\.drand\.sh/.test(url)) return r.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ round: +m[1], randomness: "00".repeat(32), signature: SIG.toString("hex") }) });   // 随机数和签名对不上
      r.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ round: +m[1], randomness: RND, signature: SIG.toString("hex") }) });
    });
  };
  await wire(page);
  const ready = async p => { await (p || page).waitForFunction(() => window.App && window.App.openQuest && !window.App.isBusy, null, { timeout: 60000 }); await (p || page).waitForTimeout(150); };
  const setT = iso => page.clock.setFixedTime(new Date(iso));
  const stub = p => (p || page).evaluate(() => { window.__copied = []; navigator.clipboard.writeText = s => { window.__copied.push(s); return Promise.resolve(); }; window.App.questOpt.timeout = 2500; });
  const reload = async () => { await page.reload(); await ready(); await stub(); };
  const txt = (sel, p) => (p || page).locator(sel).first().innerText();
  const closeTop = async p => { await (p || page).keyboard.press("Escape"); await (p || page).waitForTimeout(80); };
  const closeAll = async p => { for (let i = 0; i < 8 && (await (p || page).locator(".modal").count()); i++) await closeTop(p); };
  const rowsOf = (sel, p) => (p || page).evaluate(sel => Array.from(document.querySelectorAll(sel + " tbody tr")).map(tr => ({ who: tr.getAttribute("data-who") || tr.getAttribute("data-rule") || "", me: tr.classList.contains("me"), cells: Array.from(tr.children).map(td => td.innerText.trim().replace(/\s+/g, " ")) })), sel);
  const openToday = async p => { await (p || page).evaluate(() => { window.App.openQuest(); }); await (p || page).waitForSelector("#qsTry, #qsLoadErr", { timeout: 30000 }); await (p || page).waitForTimeout(120); };
  const tryIt = async p => { await (p || page).click("#qsTry"); await (p || page).waitForSelector("#qsTab, #qsErr:not([hidden])", { timeout: 60000 }); await (p || page).waitForTimeout(120); };
  const errText = () => page.evaluate(() => { const e = document.querySelector("#qsErr"); return e && !e.hidden ? e.textContent : ""; });
  const setRule = async (code, par, name, p) => { await (p || page).fill("#qsCode", code); await (p || page).fill("#qsPar", par || ""); if (name != null) await (p || page).fill("#qsName", name); };
  const openBoard = async (day, p) => { await (p || page).evaluate(d => { window.App.openQuestBoard(d); }, day); };
  const waitBoard = (p) => (p || page).waitForSelector("#qsbTab", { timeout: 120000 });
  /** 引擎在页面里直接算（不进线程）：rules 是 [{ code, p, slot }]；kind 是 "pub" 或 "fin"。返回按这道题的小数位数写好的平均数 */
  const direct = (day, kind, rules, p) => (p || page).evaluate(async ([day, kind, rules, RND]) => {
    const QL = window.App.QL, spec = (await window.App.questLoad(day)).spec, seeds = kind === "pub" ? QL.questPubSeeds(spec) : QL.questFinSeeds(spec, RND);
    const comp = (code, names) => new Function('"use strict";\n' + code + "\n;return { " + names.map(n => n + ": typeof " + n + ' === "function" ? ' + n + " : null").join(", ") + " };")();
    const game = comp(spec.canon, ["deal", "show", "referee"]), gp = Object.freeze(Object.assign({}, spec.p));
    return rules.map(r => { const P = Object.assign(comp(r.code, ["init", "decide"]), { id: "x", p: Object.freeze(Object.assign({}, r.p || {})) }); let s = 0, n = 0; for (const sd of seeds) for (let k = 0; k < spec.sets.K; k++) { s += QL.shopEpisode(game, gp, spec.T, sd, k, P, r.slot, null).score; n++; } return { raw: s / n, text: QLChart.fmtNum(s / n, spec.digits) }; });
  }, [day, kind, rules, RND]);
  const specOf = (day, p) => (p || page).evaluate(async d => { const x = await window.App.questLoad(d), QL = window.App.QL; return { cid: x.spec.cid, rerun: x.rerun, id: x.spec.id, refs: x.spec.refs.map(r => ({ id: r.id, code: r.canon, p: r.p })), pub: QL.questPubSeeds(x.spec), round: QL.questRound(d), slot: QL.QUEST.slot, starter: QL.questText(x.spec.starter.code, "zh") }; }, day);
  /** 造一条"别人交上来的规则" */
  const mk = (n, user, name, code, p, at, over) => page.evaluate(([n, user, name, code, p, at, over, DAY]) => {
    const st = window.App.questStore(), o = Object.assign({ day: DAY, cid: st.days[DAY].cid }, over || {});
    return { number: n, title: QLHub.title("quest", o.day + " x · " + name), body: QLHub.pack({ kind: "quest", day: o.day, cid: o.cid, name, p, v: 1 }, code), user: { login: user, avatar_url: "https://avatars.githubusercontent.com/u/" + n + "?v=4" }, html_url: "https://github.com/x/y/issues/" + n, created_at: at, updated_at: o.upd || at, reactions: { "+1": 0 }, comments: 0 };
  }, [n, user, name, code, p, at, over, DAY]);
  const real = l => l.filter(x => !/Failed to load resource|Refused to|Content Security Policy|violates the following|net::ERR|ERR_FAILED/.test(x));

  await setT(DAY + "T10:00:00Z"); await reload();

  console.log("== 一、入口和题面");
  await page.click("#btnLobby"); await page.waitForSelector('.lb-card[data-card="quest"]');
  const card = await page.evaluate(() => { const c = document.querySelector('.lb-card[data-card="quest"]'); return { text: c.innerText, btn: c.querySelector("[data-go]").innerText, status: (c.querySelector(".lb-status") || {}).innerText || "", order: Array.from(document.querySelectorAll(".lb-card")).map(x => x.getAttribute("data-card")).join() }; });
  ok(card.text.includes("每日一题") && card.btn === "看今天的题" && card.status === "" && card.order === "tutorial,daily,quest,room,deca,arena,workshop", "大厅里有每日一题的卡片，排在每日一局后面；没看过题的时候不显示状态", card.order);
  await page.click('.lb-card[data-card="quest"] [data-go]'); await page.waitForSelector("#qsTry", { timeout: 30000 });
  const S = await specOf(DAY);
  const head = await page.evaluate(() => ({ title: document.querySelector(".modal.arm .modal-h h2").innerText, banner: document.querySelector("#qsBanner").innerText, strong: document.querySelectorAll("#qsAbout strong").length, code: document.querySelectorAll("#qsAbout code").length, about: document.querySelector("#qsAbout").innerText, note: document.querySelector("#qsNote").innerText, sets: document.querySelector("#qsSets").innerText, game: document.querySelector("#qsGameCode").textContent, refs: Array.from(document.querySelectorAll("#qsRefs .ar-rule")).map(r => r.getAttribute("data-ref") + ":" + (r.querySelector(".tag") ? "基准" : "")), par: document.querySelector("#qsPar").value, starter: document.querySelector("#qsCode").value, doc: document.querySelector("#qsDoc").textContent }));
  ok(head.title === "每日一题 · 给新产品定价" && head.banner.includes(DAY) && head.banner.includes("离截止还有 14 小时 0 分钟") && head.banner.includes("另外 10 组数据结算"), "标题是这道题的名字；横幅写着日期、离截止还有多久、结算换另外几组", head.banner);
  ok(head.strong >= 3 && head.code >= 1 && head.about.includes("60 位顾客") && !head.about.includes("**") && head.note.includes("θ/2") && head.sets.includes("公开的数据 10 组，结算的数据 10 组，每组 200 局") && head.sets.includes("越高越好") && head.sets.includes("lo = 0.5, hi = 8"), "题面按手册那样排版（加粗、代码）；下面写着几组几局、朝哪边算好、题目的参数", head.sets);
  ok(head.game.includes("function deal(T, rng, p)") && head.game.includes("// 发牌") && head.refs.join() === "fixed:基准,updown:,double:" && head.par === "start = 1" && head.starter === S.starter && head.starter.includes("// 起始代码") && head.doc.includes("s.see"), "看得到裁判的代码（带中文注释）、三条基准规则（第一条是基准）；编辑框里是起始代码和它的参数");
  await page.click('#qsRefs [data-code="updown"]'); await page.waitForSelector("#qsRefCode");
  ok((await txt("#qsRefCode")).includes("st.price *= 1 + p.step") && (await page.locator(".modal.are").last().innerText()).includes("start = 1, step = 0.1"), "基准规则的代码和参数可以打开看");
  await closeTop();

  console.log("== 二、在公开的几组上试");
  await tryIt();
  let rows = await rowsOf("#qsTab");
  const refD = await direct(DAY, "pub", S.refs.map((r, i) => ({ code: r.code, p: r.p, slot: i })));
  const byId = id => rows.filter(r => r.who === id)[0];
  ok(rows.length === 4 && S.refs.every((r, i) => byId("ref:" + r.id).cells[2].startsWith(refD[i].text + " ±")), "基准规则的成绩和引擎直接算的一样", rows.map(r => r.who + "=" + r.cells[2]).join(" ; ") + " | " + refD.map(x => x.text).join());
  ok(byId("you").me && byId("you").cells[2].startsWith(refD[0].text + " ±") && byId("you").cells[3].replace(/\s/g, "") === "0.00±0.00" && byId("ref:fixed").cells[3] === "—" && byId("ref:fixed").cells[1].includes("基准"), "起始代码和基准是同一个办法：成绩一样，“比基准多”是 0");
  ok(rows.map(r => r.cells[0]).join() === "1,2,3,4" && rows[0].who === "ref:updown" && byId("you").cells[4].split(" ").length === 10 && (await txt("#qsTab caption")).includes("公开的 10 组，每组 200 局") && (await txt("#qsHint")).includes("结算用的是另外 10 组"), "按成绩排；每条规则列出 10 组各自的平均；提醒结算用的是另外几组");
  const MINE = "function init(p) {\n  return { price: p.start };\n}\nfunction decide(s, p, st) {\n  if (s.see === 1) st.price *= p.up;\n  if (s.see === 0) st.price *= p.down;\n  return st.price;\n}", MINE_P = { start: 1.2, up: 1.12, down: 0.9 };
  await setRule(MINE, "start = 1.2, up = 1.12, down = 0.9", "涨跌各一成多"); await tryIt(); rows = await rowsOf("#qsTab");
  const mineD = (await direct(DAY, "pub", [{ code: MINE, p: MINE_P, slot: S.slot }]))[0];
  ok(byId("you").cells[2].startsWith(mineD.text + " ±") && mineD.raw > refD[0].raw + 5 && /^\+/.test(byId("you").cells[3]) && (await page.locator('#qsTab tr[data-rule="you"] .verdict.up').count()) === 1, "换成自己写的规则：成绩和引擎直接算的一样（它自己的随机数用的是固定的位置），明显比基准好", byId("you").cells[2] + " vs " + mineD.text);
  await page.evaluate(() => { document.querySelector("#qsTrace").open = true; });
  const trace = await page.evaluate(() => ({ n: document.querySelectorAll("#qsTraceTab tbody tr").length, first: Array.from(document.querySelectorAll("#qsTraceTab tbody tr")[0].children).map(td => td.innerText.trim()), sel: document.querySelector("#qsTraceSel").value, opts: document.querySelectorAll("#qsTraceSel option").length }));
  ok(trace.n === 30 && trace.first[0] === "1" && trace.first[1] === "—" && trace.first[2] === "1.2" && trace.sel === "you" && trace.opts === 4, "看得到第一局的前 30 个回合：第一回合规则什么也没看到，报的是起步价", JSON.stringify(trace));
  await page.screenshot({ path: SH("quest-try.png") });
  await reload(); await openToday();   // 点"试"的那一刻草稿就存了，用不着等
  const kept = await page.evaluate(() => ({ name: document.querySelector("#qsName").value, par: document.querySelector("#qsPar").value, code: document.querySelector("#qsCode").value, modals: document.querySelectorAll(".modal").length, stored: localStorage.getItem("ql.quest.v1") }));
  ok(kept.name === "涨跌各一成多" && kept.par === "start = 1.2, up = 1.12, down = 0.9" && kept.code === MINE && kept.modals === 1, "刷新页面，写到一半的规则还在", JSON.stringify(kept).slice(0, 900));
  await page.fill("#qsName", "刚改的名字"); await reload(); await openToday();
  const keptHide = await page.inputValue("#qsName");
  await page.fill("#qsName", "涨跌各一成多"); await closeAll(); await openToday();
  const keptClose = await page.inputValue("#qsName");
  ok(keptHide === "刚改的名字" && keptClose === "涨跌各一成多" && (await page.inputValue("#qsCode")) === MINE, "刚打完字就刷新页面、就关掉对话框：最后打的那几个字也存下来了", keptHide + " | " + keptClose);
  await closeAll(); await page.click("#btnLobby"); await page.waitForSelector('.lb-card[data-card="quest"] .lb-status');
  ok((await txt('.lb-card[data-card="quest"] .lb-status')) === "今天：给新产品定价", "看过题之后，大厅的卡片上写着今天的题目");
  await closeAll();

  console.log("== 三、写错了怎么报");
  await openToday();
  await setRule(MINE, "start = abc"); await page.click("#qsTry"); ok((await errText()).includes("参数的写法不对") && (await page.locator("#qsTab").count()) === 0, "参数写错：说清楚该怎么写，不跑");
  await setRule("function decide(s, p) { return 1 +; }", ""); await page.click("#qsTry"); ok((await errText()).includes("代码有语法错误"), "语法错误：不跑，直接报");
  await setRule("function choose(s, p) { return 1; }", ""); await page.click("#qsTry"); ok((await errText()).includes("function decide(s, p, st)"), "没有 decide：告诉人要有这个函数");
  await setRule("function decide(s, p) { if (s.t === 3) throw new Error('第四回合炸了'); return 1; }", ""); await tryIt(); rows = await rowsOf("#qsTab");
  ok(byId("you").cells[1].includes("中途出错：第四回合炸了") && byId("you").cells[0] === "—" && byId("ref:updown").cells[2].startsWith(refD[1].text), "规则中途出错：它那一行写着错在哪里，基准规则照常");
  await setRule("function decide(s, p) { return s.t % 2 ? 1 : 'x'; }", ""); await tryIt(); rows = await rowsOf("#qsTab");
  ok(byId("you").cells[1].includes("的回合报的不是数"), "规则有的回合报的不是数：照跑，并且标出来", byId("you").cells[1]);
  await setRule("function decide(s, p) { while (true) {} }", ""); await page.click("#qsTry"); await page.waitForFunction(() => { const e = document.querySelector("#qsErr"); return e && !e.hidden; }, null, { timeout: 20000 });
  ok((await errText()).includes("卡住了") && !(await page.locator("#qsTry").isDisabled()), "死循环：到时间就掐掉，说它卡住了，按钮恢复可用", await errText());
  await page.click("#qsReset"); ok((await page.inputValue("#qsCode")) === S.starter && (await page.inputValue("#qsPar")) === "start = 1" && (await errText()) === "", "“还原成起始代码”把代码和参数都还原");

  console.log("== 四、交到 GitHub");
  await setRule(MINE, "start = 1.2, up = 1.12, down = 0.9", "涨跌各一成多");
  await page.click("#qsAi");
  const brief = await page.evaluate(() => window.__copied[window.__copied.length - 1]);
  ok(brief.includes("题目：给新产品定价") && brief.includes("60 位顾客") && brief.includes("function referee(G, t, a)") && brief.includes("s.see") && brief.includes("lo = 0.5, hi = 8") && brief.includes("各打 200 局") && brief.includes("st.price *= p.up") && brief.includes("start = 1.2, up = 1.12, down = 0.9") && brief.trim().endsWith("我的想法："), "给 AI 的说明里有题面、裁判的代码、接口、计分办法、眼下的代码和参数");
  await page.click("#qsPost"); await page.waitForSelector("#pdGo");
  const post = await page.evaluate(() => { const a = document.querySelector("#pdGo"), u = new URL(a.href), p = QLHub.unpack(u.searchParams.get("body")); a.addEventListener("click", e => e.preventDefault()); return { host: u.host, path: u.pathname, title: u.searchParams.get("title"), meta: p && p.meta, code: p && p.code, len: a.href.length }; });
  ok(post.host === "github.com" && /\/issues\/new$/.test(post.path) && post.title === "[SL:quest] " + DAY + " 给新产品定价 · 涨跌各一成多" && post.len < 6000, "去 GitHub 的链接：标题带着日期、题目和规则的名字", post.title);
  ok(post.meta && post.meta.kind === "quest" && post.meta.day === DAY && post.meta.cid === S.cid && post.meta.name === "涨跌各一成多" && JSON.stringify(post.meta.p) === JSON.stringify(MINE_P) && post.meta.v === 1 && post.code === MINE, "交上去的是：哪一天、哪道题（指纹）、名字、参数和代码", JSON.stringify(post.meta));
  await page.click("#pdGo"); await page.waitForTimeout(150); await closeTop();
  ok(await page.evaluate(d => { const r = window.App.questStore().days[d]; return !!(r.posted && r.posted.h && r.posted.at > 0); }, DAY), "点了“去 GitHub 提交”之后记下交的是哪一版");
  await page.click("#qsRefresh"); await page.waitForSelector("#qsPosted");
  ok((await txt("#qsPosted")).includes("点 Create 才算交上去") && (await txt("#qsSay")).includes("今天还没有人交"), "榜上还没出现的时候，提醒要在 GitHub 那边点 Create，回来刷新");

  console.log("== 五、今天谁交了");
  const UPDOWN = "function init(p) {\n  return { price: 1 };\n}\nfunction decide(s, p, st) {\n  if (s.see === 1) st.price *= 1.15;\n  if (s.see === 0) st.price *= 0.87;\n  return st.price;\n}";
  const THIEF = "var z = 0; try { fetch('http://127.0.0.1:" + t.port + "/__probe__quest'); z = 1; } catch (e) {}\ntry { Math.max = function () { return 99; }; } catch (e) {}\nfunction decide(s, p) { try { s.g.hi = 1e9; } catch (e) {} return 0.9; }";
  hub.items = [
    await mk(11, "alice", "第一版", "function decide(s, p) { return 0.5; }", {}, DAY + "T02:00:00Z"),
    await mk(12, "alice", "卖掉就涨", UPDOWN, {}, DAY + "T03:00:00Z"),
    await mk(13, "bob", "一口价", "function decide(s, p) { return p.x; }", { x: 2 }, DAY + "T05:00:00Z", { upd: NEXT + "T00:20:00Z" }),
    await mk(14, "carol", "死循环", "function decide(s, p) { while (true) {} }", {}, DAY + "T06:00:00Z"),
    await mk(15, "dave", "想偷东西", THIEF, {}, DAY + "T07:00:00Z"),
    await mk(16, "erin", "迟到的", "function decide(s, p) { return 3; }", {}, NEXT + "T00:00:05Z"),
    await mk(17, "frank", "别的题", "function decide(s, p) { return 3; }", {}, DAY + "T08:00:00Z", { cid: "other.zz" }),
    await mk(18, "gina", "昨天交的", "function decide(s, p) { return 3; }", {}, "2026-10-13T08:00:00Z"),
    await mk(19, "me", "涨跌各一成多", MINE, MINE_P, DAY + "T09:00:00Z"),
    await mk(20, "zed", "和 alice 一样", UPDOWN, {}, DAY + "T09:30:00Z")
  ];
  await page.click("#qsRefresh"); await page.waitForSelector("#qsWho"); await page.waitForTimeout(100);
  let who = await rowsOf("#qsWho");
  ok(who.map(r => r.who).join() === "alice,bob,carol,dave,me,zed" && (await txt("#qsSay")).includes("已经有 6 个人交了规则") && (await page.locator("#qsPosted").count()) === 0, "只列当天交的、这道题的；迟到的、别的题的、前一天交的都不算", who.map(r => r.who).join());
  ok(who[0].cells[1] === "卖掉就涨" && who[0].cells[2] === "03:00 UTC，第 2 次" && who[4].me && who[4].cells[0].includes("（你）") && !who[0].me && who[0].cells.length === 3, "同一个人交了两次，算后一次；和你记下的那一版对得上的那一行标着“你”；截止之前不显示成绩", JSON.stringify(who[0].cells));
  await page.click("#qsPubRun"); await page.waitForFunction(() => document.querySelectorAll("#qsWho thead th").length === 4, null, { timeout: 90000 }); await page.waitForTimeout(100);
  who = await rowsOf("#qsWho");
  const pubD = await direct(DAY, "pub", [{ code: UPDOWN, p: {}, slot: S.slot }, { code: "function decide(s, p) { return p.x; }", p: { x: 2 }, slot: S.slot }, { code: "function decide(s, p) { return 0.9; }", p: {}, slot: S.slot }]);
  const W = u => who.filter(r => r.who === u)[0];
  ok(W("alice").cells[3].startsWith(pubD[0].text + " ±") && W("zed").cells[3].startsWith(pubD[0].text + " ±") && W("bob").cells[3].startsWith(pubD[1].text + " ±") && W("me").cells[3].startsWith(mineD.text + " ±"), "点一下可以算出大家在公开的几组上的成绩，和引擎直接算的一样", who.map(r => r.who + "=" + r.cells[3]).join(" ; "));
  ok(W("dave").cells[3].startsWith(pubD[2].text + " ±") && hits.length === 0, "想偷东西的规则：请求发不出去，内置对象和题目的参数也改不动，它的成绩就是“一直报 0.9”该得的", W("dave").cells[3] + " hits=" + hits.length);
  ok(W("carol").cells[3].includes("卡住了") && who[who.length - 1].who === "carol" && who.map(r => r.who).indexOf("alice") < who.map(r => r.who).indexOf("zed"), "死循环的那条标出来、排在最后，不耽误别人；同分的先交的在前");
  await page.screenshot({ path: SH("quest-board.png") });
  hub.mode = "limited"; await page.click("#qsRefresh"); await page.waitForSelector("#qsBoardErr");
  ok((await txt("#qsBoardErr")).includes("每小时 60 次") && (await txt("#qsBoardErr")).includes("上一次取到的") && (await page.locator("#qsWho tbody tr").count()) === 6, "GitHub 限流：说清楚，并且接着显示上一次取到的");
  hub.mode = "down"; await page.click("#qsRefresh"); await page.waitForFunction(() => /连不上 GitHub/.test((document.querySelector("#qsBoardErr") || {}).textContent || ""));
  ok((await txt("#qsBoardErr")).includes("你的规则存在这台设备上"), "连不上 GitHub：说清楚，自己写的规则不受影响");
  hub.mode = "ok"; await closeAll();

  console.log("== 六、截止之后：结算和名次");
  await openBoard(DAY); await page.waitForFunction(() => /还没有截止/.test((document.querySelector("#qsbStatus") || {}).textContent || ""), null, { timeout: 30000 });
  ok((await page.locator("#qsbTab").count()) === 0 && drand.calls.length === 0, "还没截止的那一天不结算，也不去取随机数");
  await closeAll();
  await setT(NEXT + "T00:00:10Z"); await reload();
  await openBoard(DAY); await page.waitForFunction(() => /还没有发布/.test((document.querySelector("#qsbStatus") || {}).textContent || ""), null, { timeout: 30000 });
  ok(drand.calls.length === 0 && (await page.locator("#qsbRetry").count()) === 1, "截止之后不到半分钟：结算用的那一轮随机数还没发布，页面不去问，告诉人稍等");
  await closeAll();
  await setT(NEXT + "T00:10:00Z"); await reload(); drand.mode = "early";
  await openBoard(DAY); await page.waitForFunction(() => /还没有发布/.test((document.querySelector("#qsbStatus") || {}).textContent || ""), null, { timeout: 30000 });
  ok(drand.calls.length === 4 && drand.calls.every(u => u.endsWith("/public/" + S.round)), "信标说还没到时候：四个地址都问过了，问的是截止之后半分钟的那一轮", drand.calls.length + " " + drand.calls[0]);
  drand.mode = "badfirst"; drand.calls.length = 0;
  await page.click("#qsbRetry"); await waitBoard(); await page.waitForTimeout(150);
  ok(drand.calls.length === 2 && /api\.drand\.sh/.test(drand.calls[0]) && /api2\.drand\.sh/.test(drand.calls[1]) && (await page.evaluate(d => window.App.questStore().fin[d], DAY)).randomness === RND, "第一个地址给的随机数和它的签名对不上：不用它，换下一个地址");
  let board = await rowsOf("#qsbTab");
  const finD = await direct(DAY, "fin", [{ code: UPDOWN, p: {}, slot: S.slot }, { code: "function decide(s, p) { return p.x; }", p: { x: 2 }, slot: S.slot }, { code: "function decide(s, p) { return 0.9; }", p: {}, slot: S.slot }, { code: MINE, p: MINE_P, slot: S.slot }].concat(S.refs.map((r, i) => ({ code: r.code, p: r.p, slot: i }))));
  const Bd = u => board.filter(r => r.who === u)[0], users = board.filter(r => !/^(ref|me)$/.test(r.who) || r.who === "me");
  ok(Bd("alice").cells[2].startsWith(finD[0].text + " ±") && Bd("bob").cells[2].startsWith(finD[1].text + " ±") && Bd("dave").cells[2].startsWith(finD[2].text + " ±") && Bd("me").cells[2].startsWith(finD[3].text + " ±"), "结算的成绩和引擎用结算的种子直接算的一样", board.map(r => r.who + "=" + r.cells[2]).join(" ; ") + " | " + finD.map(x => x.text).join());
  const want = [["alice", finD[0].raw, 1], ["zed", finD[0].raw, 2], ["bob", finD[1].raw, 3], ["dave", finD[2].raw, 4], ["me", finD[3].raw, 5]].sort((a, b) => b[1] - a[1] || a[2] - b[2]).map(x => x[0]);
  ok(users.filter(r => r.cells[0] !== "—").sort((a, b) => +a.cells[0] - +b.cells[0]).map(r => r.who).join() === want.join() && Bd("alice").cells[0] === String(want.indexOf("alice") + 1) && +Bd("zed").cells[0] === +Bd("alice").cells[0] + 1, "名次按结算的成绩排；代码一样、成绩一样的两个人，先交的排前面", users.map(r => r.who + ":" + r.cells[0]).join() + " want " + want.join());
  ok(Bd("carol").cells[0] === "—" && Bd("carol").cells[2].includes("卡住了") && hits.length === 0, "死循环的那条没有名次；想偷东西的还是什么也没发出去");
  ok(Bd("bob").cells[1].includes("截止后有变动") && !Bd("alice").cells[1].includes("截止后有变动") && Bd("me").me && Bd("me").cells[1].includes("（你）") && (await txt("#qsbStatus")) === "这一天有 6 个人交了规则，你排第 " + (want.indexOf("me") + 1) + "。", "截止之后动过的那条标出来；你自己的那一行标着“你”，上面写着你排第几", await txt("#qsbStatus"));
  const refRows = board.filter(r => r.who === "ref");
  ok(refRows.length === 3 && refRows.every(r => r.cells[0] === "—") && refRows.some(r => r.cells[1].includes("基准") && r.cells[2].startsWith(finD[4].text + " ±") && r.cells[3] === "—") && refRows.some(r => r.cells[1].includes("参照") && r.cells[2].startsWith(finD[5].text + " ±")), "三条基准规则也在表里当参照，不占名次");
  ok(Bd("alice").cells[4] === pubD[0].text && Bd("me").cells[4] === mineD.text && Bd("alice").cells[2].split(" ")[0] !== Bd("alice").cells[4], "最后一栏是同一条规则在公开的几组上的成绩：和结算的不是同一批数据");
  const how = await page.evaluate(() => ({ text: document.querySelector("#qsbHow").innerText, href: document.querySelector("#qsbHow a").href, cap: document.querySelector("#qsbTab caption").innerText }));
  ok(how.text.includes("drand 第 " + S.round + " 轮") && how.text.includes(NEXT + " 00:00:30 UTC") && how.href.endsWith("/public/" + S.round) && how.href.includes("52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971") && how.text.includes("图个乐") && how.cap.includes("结算的 10 组，每组 200 局"), "下面说明结算的数据是怎么来的：哪一轮随机数、什么时候发布的，并且有链接可以自己去查");
  await page.screenshot({ path: SH("quest-settle.png") });
  drand.mode = "down"; drand.calls.length = 0; await closeAll(); await reload();
  await openBoard(DAY); await waitBoard();
  ok(drand.calls.length === 0 && (await rowsOf("#qsbTab")).filter(r => r.who === "alice")[0].cells[2] === Bd("alice").cells[2], "取到过的随机数存在这台设备上：再看这一天的结算不用再取，结果也一样");
  // 没交的那一版：算出"要是交了排第几"，但不占别人的名次
  await page.evaluate(d => { const st = window.App.questStore(); st.days[d].posted = null; localStorage.setItem("ql.quest.v1", JSON.stringify(st)); }, DAY);
  hub.items = hub.items.filter(it => it.user.login !== "me");
  await closeAll(); await reload(); await openBoard(DAY); await waitBoard();
  await page.click("#qsbRefresh"); await page.waitForFunction(() => /没有交/.test((document.querySelector("#qsbStatus") || {}).textContent || "") && !!document.querySelector("#qsbTab"), null, { timeout: 120000 }); board = await rowsOf("#qsbTab");   // 三分钟内不重取；"重新取一遍"才去 GitHub 拿新的名单
  const others = want.filter(u => u !== "me"), would = 1 + [finD[0].raw, finD[0].raw, finD[1].raw, finD[2].raw].filter(v => v >= finD[3].raw).length;
  ok(Bd("me").cells[0] === "—" && Bd("me").cells[1].includes("当天没有交") && Bd("me").cells[2].startsWith(finD[3].text + " ±") && (await txt("#qsbStatus")).includes("要是交了，排第 " + would + "（共 6 人）") && others.every((u, i) => Bd(u).cells[0] === String(i + 1)), "当天写了但没交：照样算出它的成绩和“要是交了排第几”，但别人的名次不受它影响", await txt("#qsbStatus"));
  // 取不到随机数的一天
  await closeAll(); await openBoard(NEXT.replace("15", "13"));
  await page.waitForFunction(() => /取不到|还没有题|还没有每日一题|读不出来/.test((document.querySelector("#qsbStatus") || {}).textContent || ""), null, { timeout: 30000 });
  ok((await txt("#qsbStatus")).includes("这一天还没有每日一题：第一道题是 " + DAY + " 的") && (await page.locator("#qsbToday").count()) === 1, "比第一道题还早的日子：告诉人第一道题是哪天的，可以回到今天", await txt("#qsbStatus"));
  await closeAll();
  await setT("2026-10-16T01:00:00Z"); await reload(); await openBoard(NEXT);
  await page.waitForFunction(() => /取不到/.test((document.querySelector("#qsbStatus") || {}).textContent || ""), null, { timeout: 40000 });
  ok((await txt("#qsbStatus")).includes("几个公共的地址都连不上") && drand.calls.length === 4, "随机数取不到（四个地址都连不上）：说清楚，给一个再试的按钮");
  drand.mode = "ok"; await page.click("#qsbRetry"); await waitBoard();
  ok((await txt("#qsbStatus")).includes("这一天没有人交规则") && (await page.locator("#qsbTab tbody tr").count()) === 3 && (await txt(".modal.arm .modal-h h2")).includes("把车停在哪儿"), "再试一次取到了：没有人交的一天，表里是三条基准规则的成绩");
  await page.click("#qsbPrev"); await waitBoard();
  ok((await txt(".modal.arm .modal-h h2")).includes(DAY) && (await page.locator("#qsbNext").count()) === 1, "“前一天”“后一天”可以翻着看");
  await closeAll();

  console.log("== 七、没有题的日子");
  await setT(GAP + "T12:00:00Z"); await reload(); await openToday();
  const G = await specOf(GAP), idx = JSON.parse(fs.readFileSync(path.join(ROOT, "daily/index.json"), "utf8")).days, pick = await page.evaluate(([d, days]) => { const past = days.filter(x => x < d); return past[window.App.QL.questHash("rerun|" + d) % past.length]; }, [GAP, idx]);
  ok(G.rerun === pick && idx.indexOf(GAP) < 0 && (await txt("#qsBanner")).includes("这一天没有新题，重温 " + pick + " 的一道旧题") && (await txt("#qsBanner")).includes(GAP), "这一天没有题：按日期从以前的题里挑一道（人人挑到的是同一道），横幅里写明是哪一天的", G.rerun);
  const orig = await specOf(pick);
  ok(G.cid === orig.cid && G.pub.join() !== orig.pub.join() && G.round !== orig.round, "重温的还是同一道题（指纹相同），但公开的数据换了一批，结算用的也是这一天的随机数");
  await tryIt(); ok((await page.locator("#qsTab tbody tr").count()) === G.refs.length + 1, "重温的题照样能试");
  await page.click("#qsPost"); await page.waitForSelector("#pdGo");
  ok(await page.evaluate(d => QLHub.unpack(new URL(document.querySelector("#pdGo").href).searchParams.get("body")).meta.day === d, GAP), "交上去的记的是今天的日期，不是旧题原来的日期");
  await closeAll();
  daily.index = { v: 1, days: [] }; await reload(); await openToday();
  ok((await txt("#qsLoadErr")).includes("还没有题"), "一道题都没有的时候：告诉人还没有题");
  await closeAll(); daily.index = "missing"; await reload(); await openToday();
  ok((await txt("#qsLoadErr")).includes("还没有题"), "连目录都没有：一样");
  await closeAll(); daily.index = "real"; daily.down = true; await reload(); await openToday();
  ok((await txt("#qsLoadErr")).includes("取不到") && (await txt("#qsLoadErr")).includes("离线的副本"), "连不上网：说清楚每日一题要在网站上才有");
  daily.down = false; await page.click("#qsRetry"); await page.waitForSelector("#qsTry", { timeout: 30000 });
  ok((await page.locator("#qsTry").count()) === 1, "网好了之后点“再试一次”就能取到");
  await closeAll();
  daily.over["q/" + pick + ".json"] = JSON.stringify({ v: 1, day: pick, id: "broken" }); await reload(); await openToday();
  ok((await txt("#qsLoadErr")).includes("读不出来") , "题目文件的格式不对：说读不出来，不往下走");
  delete daily.over["q/" + pick + ".json"]; await closeAll();
  await setT("2026-10-13T12:00:00Z"); await reload(); await openToday();
  const early = await txt("#qsLoadErr");
  ok(early.includes("第一道题 " + DAY + " 开放") && early.includes("离现在还有 12 小时 0 分钟") && (await page.locator("#qsRetry").count()) === 1, "题排好了、还没到第一天：告诉人第一道题哪天开放、还要等多久", early);
  await closeAll();
  await setT(DAY + "T10:00:00Z"); await page.goto(page.url().replace(/#.*$/, "") + "#quest"); await ready(); await page.waitForSelector("#qsTry", { timeout: 30000 });
  ok((await txt(".modal.arm .modal-h h2")) === "每日一题 · 给新产品定价" && !/#quest/.test(page.url()), "地址里带 #quest 直接打开今天的题");
  await closeAll(); await stub();

  console.log("== 八、手机宽度");
  await page.setViewportSize({ width: 390, height: 844 }); await openToday(); await tryIt();
  const phone = await page.evaluate(clipped), over1 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over1 <= 1 && phone.length === 0 && (await page.evaluate(() => getComputedStyle(document.querySelector("#qsTab th:nth-child(5)")).display)) === "none", "手机上：页面不横向溢出，按钮和表头里的字不被截掉，“各组的平均”那一栏收起来", JSON.stringify(phone.slice(0, 3)) + " overflow " + over1);
  await page.screenshot({ path: SH("quest-phone.png") });
  await closeAll(); await setT(NEXT + "T00:10:00Z"); await reload(); await openBoard(DAY); await waitBoard();
  const phone2 = await page.evaluate(clipped), over2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over2 <= 1 && phone2.length === 0, "手机上看结算的榜也不溢出", JSON.stringify(phone2.slice(0, 3)) + " overflow " + over2);
  await page.screenshot({ path: SH("quest-settle-phone.png") });
  await closeAll(); await page.setViewportSize({ width: 1280, height: 1000 });

  console.log("== 九、英文页面");
  if (process.env.QUEST_NO_EN) { console.log("（跳过）"); console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", real(logs).length ? "\n" + real(logs).join("\n") : "none"); await t.close(); if (fail) process.exitCode = 1; return; }
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); hub.items = []; drand.mode = "ok";   // 英文页从一张白纸开始：中文页留下的草稿、假数据里的中文名字都不带过去
  const en = await ctx.newPage(), enLogs = [], copied = [];
  en.on("console", m => { if (m.type() === "error" || m.type() === "warning") enLogs.push(`[${m.type()}] ${m.text()}`); }); en.on("pageerror", e => enLogs.push("[pageerror] " + e.message));
  await en.route(u => /^https?:$/.test(u.protocol) && u.hostname !== "127.0.0.1", r => r.abort());
  await wire(en); await en.addInitScript(probe);
  await en.clock.setFixedTime(new Date(DAY + "T10:00:00Z"));
  await en.goto(`http://127.0.0.1:${t.port}/en/index.html`); await ready(en); await stub(en);
  const stage = s => en.evaluate(s => { window.__stage = s; }, s), spills = [];
  const look = async what => { const o = await en.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), c = await en.evaluate(clipped); if (o > 1) spills.push(what + ": overflow " + o); if (c.length) spills.push(what + ": " + JSON.stringify(c.slice(0, 3))); };
  const openAll = () => en.evaluate(() => document.querySelectorAll(".modal details").forEach(d => { d.open = true; }));
  await stage("quest: lobby"); await en.click("#btnLobby"); await en.waitForSelector('.lb-card[data-card="quest"]'); await look("lobby"); await closeAll(en);
  await stage("quest: today"); await openToday(en); await openAll(); await look("today");
  const enHead = await en.evaluate(() => ({ title: document.querySelector(".modal.arm .modal-h h2").innerText, about: document.querySelector("#qsAbout").innerText, game: document.querySelector("#qsGameCode").textContent, starter: document.querySelector("#qsCode").value, banner: document.querySelector("#qsBanner").innerText }));
  ok(enHead.title === "Daily challenge · Pricing a new product" && enHead.about.includes("60 customers") && enHead.game.includes("// Deal:") && enHead.starter.includes("// Starter code") && enHead.banner.includes(DAY), "英文页：题目、题面、裁判和起始代码里的注释都是英文的", enHead.title + " | " + enHead.banner);
  await en.click('#qsRefs [data-code="updown"]'); await en.waitForSelector("#qsRefCode"); await look("ref code"); await closeTop(en);
  await stage("quest: try"); await tryIt(en); await openAll(); await look("try");
  const enRows = await rowsOf("#qsTab", en);
  ok(enRows.length === 4 && S.refs.every((r, i) => enRows.filter(x => x.who === "ref:" + r.id)[0].cells[2].startsWith(refD[i].text + " ±")), "英文页和中文页跑的是同一段代码：基准规则的成绩逐位相同", enRows.map(r => r.cells[2]).join(" ; "));
  await setRule(MINE, "start = 1.2, up = 1.12, down = 0.9", "Up and down", en); await tryIt(en);
  ok((await rowsOf("#qsTab", en)).filter(x => x.who === "you")[0].cells[2].startsWith(mineD.text + " ±"), "英文页上自己写的规则，成绩也和中文页的一样");
  await stage("quest: brief"); await en.click("#qsAi"); copied.push(...(await en.evaluate(() => window.__copied))); await en.click("#qsPost"); await en.waitForSelector("#pdGo"); await look("post"); await closeTop(en);
  await stage("quest: errors"); await setRule("function decide(s, p) { return 1 +; }", "", null, en); await en.click("#qsTry"); await setRule("function decide(s, p) { while (true) {} }", "", null, en); await en.click("#qsTry"); await en.waitForFunction(() => { const e = document.querySelector("#qsErr"); return e && !e.hidden && /stuck|loop/i.test(e.textContent); }, null, { timeout: 20000 });
  await setRule("function decide(s, p) { if (s.t === 3) throw new Error('boom'); return 'x'; }", "bad par", null, en); await en.click("#qsTry"); await en.fill("#qsPar", ""); await tryIt(en); await look("errors");
  // 英文的假数据：别人交的规则
  const enItems = await en.evaluate(([DAY, NEXT, UPDOWN]) => { const st = window.App.questStore(), cid = st.days[DAY].cid, it = (n, user, name, code, p, at, upd) => ({ number: n, title: QLHub.title("quest", DAY + " x · " + name), body: QLHub.pack({ kind: "quest", day: DAY, cid, name, p, v: 1 }, code), user: { login: user, avatar_url: "https://avatars.githubusercontent.com/u/" + n + "?v=4" }, html_url: "https://github.com/x/y/issues/" + n, created_at: at, updated_at: upd || at, reactions: { "+1": 0 }, comments: 0 });
    return [it(31, "alice", "First try", "function decide(s, p) { return 0.5; }", {}, DAY + "T02:00:00Z"), it(32, "alice", "Up after a sale", UPDOWN, {}, DAY + "T03:00:00Z"), it(33, "bob", "Flat two", "function decide(s, p) { return p.x; }", { x: 2 }, DAY + "T05:00:00Z", NEXT + "T00:20:00Z"), it(34, "carol", "Loop", "function decide(s, p) { while (true) {} }", {}, DAY + "T06:00:00Z"), it(35, "dave", "Throws", "function decide(s, p) { throw new Error('boom'); }", {}, DAY + "T07:00:00Z")]; }, [DAY, NEXT, UPDOWN]);
  hub.items = enItems;
  await stage("quest: who"); await en.click("#qsRefresh"); await en.waitForSelector("#qsWho"); await en.click("#qsPubRun"); await en.waitForFunction(() => document.querySelectorAll("#qsWho thead th").length === 4, null, { timeout: 90000 }); await look("who");
  hub.mode = "limited"; await en.click("#qsRefresh"); await en.waitForSelector("#qsBoardErr"); hub.mode = "down"; await en.click("#qsRefresh"); await en.waitForFunction(() => /GitHub/.test((document.querySelector("#qsBoardErr") || {}).textContent || "")); hub.mode = "ok";
  await closeAll(en);
  await stage("quest: settle"); await en.clock.setFixedTime(new Date(NEXT + "T00:10:00Z")); drand.mode = "early"; await openBoard(DAY, en); await en.waitForSelector("#qsbRetry", { timeout: 30000 });
  drand.mode = "down"; await en.click("#qsbRetry"); await en.waitForSelector("#qsbRetry", { timeout: 40000 }); drand.mode = "ok"; await en.click("#qsbRetry"); await waitBoard(en); await openAll(); await look("settle");
  const enBoard = await rowsOf("#qsbTab", en);
  ok(enBoard.filter(r => r.who === "alice")[0].cells[2].startsWith(finD[0].text + " ±") && enBoard.filter(r => r.who === "bob")[0].cells[2].startsWith(finD[1].text + " ±") && enBoard.filter(r => r.who === "alice")[0].cells[0] === "1", "英文页的结算和中文页是同一批数据、同一个结果", enBoard.map(r => r.who + "=" + r.cells[2]).join(" ; "));
  await closeAll(en);
  await stage("quest: gaps"); await openBoard("2026-10-13", en); await en.waitForFunction(() => (document.querySelector("#qsbStatus") || {}).className === "warn", null, { timeout: 30000 }); await closeAll(en);
  daily.down = true; await en.clock.setFixedTime(new Date(GAP + "T12:00:00Z")); await en.reload(); await ready(en); await stub(en); await openToday(en); await look("offline"); daily.down = false; await en.click("#qsRetry"); await en.waitForSelector("#qsTry", { timeout: 30000 }); await look("rerun"); await closeAll(en);
  daily.index = { v: 1, days: [] }; await en.reload(); await ready(en); await openToday(en); daily.index = "real"; await closeAll(en);
  await en.clock.setFixedTime(new Date("2026-10-13T12:00:00Z")); await en.reload(); await ready(en); await openToday(en);
  const enEarly = await txt("#qsLoadErr", en);
  ok(enEarly === "The first challenge opens on " + DAY + " (at 00:00 UTC, 12 h 0 min from now).", "英文页：还没到第一天的时候，说清楚第一道题哪天开放", enEarly);
  await closeAll(en); await en.clock.setFixedTime(new Date(GAP + "T12:00:00Z"));
  await en.setViewportSize({ width: 390, height: 844 }); await en.reload(); await ready(en); await stub(en); await stage("quest: phone"); await openToday(en); await tryIt(en); await openAll(); await look("phone: today");
  await en.screenshot({ path: SH("quest-en-phone.png") }); await closeAll(en);
  await en.click("#btnLobby"); await en.waitForSelector(".lb-card"); await look("phone: lobby"); await closeAll(en);
  const RE = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
  const cjk = (await en.evaluate(() => window.__cjk())).filter(([s]) => !ALLOW.some(re => re.test(s)));
  ok(cjk.length === 0, "英文页上走完每日一题的每一处，页面上没有出现过汉字和中文标点", cjk.slice(0, 6).map(x => x.join(" @ ")).join("\n"));
  ok(spills.length === 0, "英文页：桌面和手机宽度下，弹层不横向溢出，按钮和表头里的字不被截掉", spills.join("\n"));
  ok(copied.length >= 1 && copied.every(s => !RE.test(s)) && copied[0].includes("Pricing a new product") && copied[0].includes("function referee(G, t, a)"), "英文页复制给 AI 的说明也全是英文", copied.map(s => (RE.exec(s) || [""])[0] + s.slice(Math.max(0, s.search(RE) - 30), s.search(RE) + 30)).join(" | "));
  ok(real(enLogs).length === 0, "英文页没有报错", real(enLogs).join("\n"));

  const realLogs = real(logs);
  console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", realLogs.length ? "\n" + realLogs.join("\n") : "none");
  await t.close();
  if (fail) process.exitCode = 1;
})().catch(e => { console.error("CRASH", e); process.exit(1); });
