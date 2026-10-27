// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 每日一题的界面：入口和题面、在公开的几组上试（和引擎直接算的对数）、写错了怎么报、把规则封起来交（贴到 GitHub 上的只有密文）、
// 今天谁交了（只有账号和时间）、截止之后的结算和名次（结算的程序解开、算分、公布成绩和名字；页面只认可信的账号发的结果，
// 并且把基准规则和自己交的那一条重算一遍来核对）、没有题的日子重温旧题、断网和取不到随机数时怎么说、手机宽度、英文页面。
// 题目用仓库里 daily/ 下真实的文件；GitHub 的接口和 drand 的接口换成本机的假数据，什么也不发到外面去。
// 结算的程序就是仓库的 Actions 里跑的那一个（daily/settle.js），在这个测试的进程里直接调用：私钥是测试自己造的，
// 沙盒用子进程代替容器（容器这一层在这里测不了），它"贴出来"的结果放回假的 GitHub 里给页面读。
const path = require("path"), fs = require("fs"), crypto = require("crypto"), { open } = require("./ui-smoke.js"), { probe, ALLOW, clipped } = require("./en-probe.js");
const SET = require("../daily/settle.js"), QLN = require("../daily/engine.js").QL, HubN = require("../src/hub.js");
const ROOT = path.join(__dirname, ".."), SH = n => path.join(ROOT, "shots/" + n);
// 测试自己造的一对密钥：公钥放在假的 daily/quest-public.pem 里给页面用，私钥留给下面模拟的结算程序
const KP = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" }), PEM = KP.publicKey.export({ type: "spki", format: "pem" }), SPKI = new Uint8Array(KP.publicKey.export({ type: "spki", format: "der" }));
// 汉字、中文标点、全角字符（和 en-probe.js 里的探头用的是同一个范围）
const RE0 = new RegExp("[" + [[0x3400, 0x9fff], [0x3000, 0x303f], [0xff00, 0xffef]].map(r => String.fromCharCode(r[0]) + "-" + String.fromCharCode(r[1])).join("") + "]");
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) { pass++; if (process.env.VERBOSE) console.log("  ok  ", name, d === undefined ? "" : "  " + String(d).slice(0, 300)); } else { fail++; console.log("  FAIL", name, d === undefined ? "" : "  " + String(d).slice(0, 900)); } };
const DAY = "2026-10-14", NEXT = "2026-10-15", GAP = "2026-10-25";   // GAP：index 里没有的一天，用来看"重温旧题"
const SIG = crypto.createHash("sha512").update("quest-test").digest().subarray(0, 48), RND = crypto.createHash("sha256").update(SIG).digest("hex");

(async () => {
  const t = await open({ standalone: true, viewport: { width: 1280, height: 1000 } }), page = t.page, logs = t.logs, ctx = page.context();
  const hub = { items: [], mode: "ok" }, hits = [], daily = { index: "real", down: false, over: {}, key: "ok" }, drand = { mode: "ok", calls: [] };
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
      if (rel === "quest-public.pem") return daily.key === "ok" ? r.fulfill({ status: 200, contentType: "text/plain", body: PEM }) : r.fulfill({ status: 404, body: "nf" });
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
  /** 一条"别人交上来的、封好的规则"（GitHub 的接口给出来的样子）。over：{ day, cid, upd（最后一次变动的时间）, title } */
  let CID = "";
  const issueOf = (n, user, box, at, over) => { const o = Object.assign({ day: DAY, cid: CID }, over || {}); return { number: n, title: HubN.title("quest", o.title || o.day + " x · 封好的规则"), body: HubN.pack({ kind: "quest", day: o.day, cid: o.cid, v: 2, kid: "t", box }, "", "x"), user: { login: user, id: 1000 + n, avatar_url: "https://avatars.githubusercontent.com/u/" + (1000 + n) + "?v=4" }, html_url: "https://github.com/x/y/issues/" + n, created_at: at, updated_at: o.upd || at, reactions: { "+1": 0 }, comments: 0 }; };
  /** 一条"结算的结果"。不给 user 就是仓库的 Actions 机器人发的 */
  const botIssue = (n, meta, at, user, title) => ({ number: n, title: HubN.title("result", title || meta.day + " x · 结算"), body: HubN.pack(meta, "", "x"), user: user || { login: SET.BOT, id: 41898282 }, html_url: "https://github.com/x/y/issues/" + n, created_at: at, updated_at: at, reactions: {}, comments: 0 });
  /** 在这个进程里把一条规则封起来（和页面用的是同一个函数、同一把公钥） */
  const sealN = (obj, day, cid) => QLN.questSeal(SPKI, obj, QLN.questSealInfo(day, cid));
  const edited = {}, settleLog = [];   // edited：哪几条 Issue 的正文在什么时候改过（GraphQL 才问得到）
  let postedNo = 70;
  /** 把结算的程序跑一遍：从假的 GitHub 里取这一天交的规则，解开、算分，把结果"贴"回 hub.items。nowIso：程序以为的现在 */
  const settleN = (day, nowIso, o) => {
    const res = (status, obj) => ({ ok: status >= 200 && status < 300, status, json: async () => obj });
    const fetchN = async (url, init) => {
      if (/\/issues\?/.test(url)) return res(200, /[?&]page=1(&|$)/.test(url) ? hub.items : []);
      if (/\/graphql$/.test(url)) { const q = JSON.parse(init.body).query, d = {}; (q.match(/i(\d+):/g) || []).forEach(x => { const n = +x.slice(1, -1); d["i" + n] = { lastEditedAt: edited[n] || null }; }); return res(200, { data: { repository: d } }); }
      if (/drand/.test(url)) { const m = /public\/(\d+)$/.exec(url); return res(200, { round: +m[1], randomness: RND, signature: SIG.toString("hex") }); }
      if (/\/issues$/.test(url) && init && init.method === "POST") { const b = JSON.parse(init.body), n = ++postedNo; hub.items.push({ number: n, title: b.title, body: b.body, user: { login: SET.BOT, id: 41898282 }, html_url: "https://github.com/x/y/issues/" + n, created_at: nowIso, updated_at: nowIso, reactions: {}, comments: 0 }); return res(201, { number: n }); }
      return res(404, {});
    };
    return SET.settleDay(Object.assign({ day, key: KP.privateKey, fetch: fetchN, repo: HubN.REPO, token: "t", mode: "process", image: "", now: () => Date.parse(nowIso), log: x => settleLog.push(x), entryMs: 3000, allowUnsandboxed: true }, o || {}));
  };
  const real = l => l.filter(x => !/Failed to load resource|Refused to|Content Security Policy|violates the following|net::ERR|ERR_FAILED/.test(x));

  await setT(DAY + "T10:00:00Z"); await reload();

  console.log("== 一、入口和题面");
  await page.click("#btnLobby"); await page.waitForSelector('.lb-card[data-card="quest"]');
  const card = await page.evaluate(() => { const c = document.querySelector('.lb-card[data-card="quest"]'); return { text: c.innerText, btn: c.querySelector("[data-go]").innerText, status: (c.querySelector(".lb-status") || {}).innerText || "", order: Array.from(document.querySelectorAll(".lb-card")).map(x => x.getAttribute("data-card")).join() }; });
  ok(card.text.includes("每日一题") && card.btn === "看今天的题" && card.status === "" && card.order === "tutorial,daily,quest,room,deca,arena,workshop,qcircuit", "大厅里有每日一题的卡片，排在每日一局后面；没看过题的时候不显示状态", card.order);
  await page.click('.lb-card[data-card="quest"] [data-go]'); await page.waitForSelector("#qsTry", { timeout: 30000 });
  const S = await specOf(DAY); CID = S.cid;
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

  console.log("== 四、封起来交");
  await setRule(MINE, "start = 1.2, up = 1.12, down = 0.9", "涨跌各一成多");
  await page.click("#qsAi");
  const brief = await page.evaluate(() => window.__copied[window.__copied.length - 1]);
  ok(brief.includes("题目：给新产品定价") && brief.includes("60 位顾客") && brief.includes("function referee(G, t, a)") && brief.includes("s.see") && brief.includes("lo = 0.5, hi = 8") && brief.includes("各打 200 局") && brief.includes("st.price *= p.up") && brief.includes("start = 1.2, up = 1.12, down = 0.9") && brief.trim().endsWith("我的想法："), "给 AI 的说明里有题面、裁判的代码、接口、计分办法、眼下的代码和参数");
  ok((await txt("#qsSealNote")).includes("加密") && (await page.getAttribute("#qsPost", "title")).includes("加密"), "交之前就写明：交上去的是加密的，别人看不到名字、参数和代码");
  daily.key = "missing"; await page.click("#qsPost"); await page.waitForFunction(() => { const e = document.querySelector("#qsErr"); return e && !e.hidden; });
  ok((await errText()).includes("现在还交不了") && (await errText()).includes("公钥") && (await page.locator("#pdGo").count()) === 0 && !(await page.locator("#qsPost").isDisabled()), "网站上还没有放公钥：交不了，说清楚为什么，草稿还在");
  daily.key = "ok";
  await setRule("import('x');\n" + MINE, "start = 1.2, up = 1.12, down = 0.9"); await page.click("#qsPost"); await page.waitForTimeout(150);
  ok((await errText()).includes("import") && (await page.locator("#pdGo").count()) === 0, "代码里有 import(…)：结算的程序不收，交之前就拦下来");
  await setRule(MINE, "start = 1.2, up = 1.12, down = 0.9");
  const grab = async () => { await page.click("#qsPost"); await page.waitForSelector("#pdGo"); return page.evaluate(() => { const a = document.querySelector("#pdGo"), u = new URL(a.href), body = u.searchParams.get("body"), p = QLHub.unpack(body); a.addEventListener("click", e => e.preventDefault()); return { host: u.host, path: u.pathname, title: u.searchParams.get("title"), body, meta: p && p.meta, code: p && p.code, len: a.href.length, shown: document.querySelector("#pdBody").textContent, note: document.querySelector("#pdNote").textContent }; }); };
  const post = await grab();
  ok(post.host === "github.com" && /\/issues\/new$/.test(post.path) && post.title === "[SL:quest] " + DAY + " 给新产品定价 · 封好的规则" && post.len < 6000, "去 GitHub 的链接：标题里只有日期和题目，没有规则的名字", post.title + " " + post.len);
  ok(post.meta && post.meta.kind === "quest" && post.meta.day === DAY && post.meta.cid === S.cid && post.meta.v === 2 && QLN.questBoxOk(post.meta.box) && post.code === "" && !("name" in post.meta) && !("p" in post.meta), "交上去的是：哪一天、哪道题（指纹），和封好的一份。名字、参数、代码都不在明处", JSON.stringify(Object.keys(post.meta)));
  ok(!/涨跌各一成多|st\.price|function decide|1\.12/.test(post.body) && post.body.includes("封好的") && post.shown === post.body && post.note.includes("加密过的一份") && post.note.includes("看不到规则的名字、参数和代码") && post.note.includes("改了就作废"), "正文里找不到名字、参数和代码的任何一段；对话框里写明别人看得到什么、看不到什么");
  const opened = SET.unseal(KP.privateKey, post.meta.box, QLN.questSealInfo(DAY, S.cid));
  ok(opened.name === "涨跌各一成多" && JSON.stringify(opened.p) === JSON.stringify(MINE_P) && opened.code === MINE, "拿私钥解开：里面正是名字、参数和代码，一字不差");
  await page.click("#pdGo"); await page.waitForTimeout(150); await closeTop();
  const sent = await page.evaluate(d => window.App.questStore().days[d], DAY);
  ok(sent.posted && sent.posted.ch && sent.sent && sent.sent.k === post.meta.box.slice(0, 64) && !("box" in sent.sent) && sent.old.length === 0 && sent.sent.code === MINE && sent.sent.par === "start = 1.2, up = 1.12, down = 0.9" && sent.sent.ch === sent.posted.ch && sent.sent.ch === crypto.createHash("sha256").update(post.meta.box).digest("hex").slice(0, 16), "点了“去 GitHub 提交”之后，这台设备上记下交的是哪一份（连同原文，结算之后拿它自己核对）");
  const post2 = await grab(); await closeTop();
  ok(post2.meta.box !== post.meta.box && (await page.evaluate(d => window.App.questStore().days[d].sent.k, DAY)) === post.meta.box.slice(0, 64), "再点一次“交上去”，封出来的是不一样的一份（每次都现生成密钥）；没有去 GitHub 提交，记下的还是上一份");
  // 改了一版又点了“去 GitHub 提交”，但在 GitHub 那边没有真的提交：这台设备上记着两份，算数的是 GitHub 上有的那一份（后面结算时要认得出来）
  await setRule(MINE, "start = 2, up = 1.3, down = 0.8", "第二版"); const post3 = await grab(); await page.click("#pdGo"); await page.waitForTimeout(150); await closeTop();
  const two = await page.evaluate(d => window.App.questStore().days[d], DAY);
  ok(two.sent.k === post3.meta.box.slice(0, 64) && two.sent.par === "start = 2, up = 1.3, down = 0.8" && two.old.length === 1 && two.old[0].k === post.meta.box.slice(0, 64) && two.old[0].par === "start = 1.2, up = 1.12, down = 0.9" && two.posted.ch === two.sent.ch, "又交了一版：最后交的和上一份都记着");
  await setRule(MINE, "start = 1.2, up = 1.12, down = 0.9", "涨跌各一成多");
  const LONG = MINE + "\n" + Array.from({ length: 240 }, (_, i) => "// " + crypto.createHash("sha256").update("x" + i).digest("hex")).join("\n");
  await setRule(LONG, "start = 1.2, up = 1.12, down = 0.9"); await page.click("#qsPost"); await page.waitForSelector("#pdGo");
  const long = await page.evaluate(() => { const a = document.querySelector("#pdGo"), u = new URL(a.href); a.addEventListener("click", e => e.preventDefault()); document.querySelector("#pdCopy").click(); return { steps: document.querySelector("#pdSteps").textContent, inUrl: QLHub.unpack(u.searchParams.get("body")), len: a.href.length, copied: window.__copied[window.__copied.length - 1] }; });
  const longMeta = HubN.unpack(long.copied).meta;
  ok(long.steps.includes("分两步") && long.inUrl === null && long.len < 6000 && LONG.length > 15000 && longMeta.box.length > 6000 && SET.unseal(KP.privateKey, longMeta.box, QLN.questSealInfo(DAY, S.cid)).code === LONG, "代码长、封好以后放不进地址的时候：分两步，复制下来的正文里是封好的那一份，照样解得开", long.len + " " + longMeta.box.length);
  await closeTop(); await setRule(MINE, "start = 1.2, up = 1.12, down = 0.9");
  await page.click("#qsRefresh"); await page.waitForSelector("#qsPosted");
  ok((await txt("#qsPosted")).includes("点 Create 才算交上去") && (await txt("#qsSay")).includes("今天还没有人交"), "榜上还没出现的时候，提醒要在 GitHub 那边点 Create，回来刷新");

  console.log("== 五、今天谁交了");
  const UPDOWN = "function init(p) {\n  return { price: 1 };\n}\nfunction decide(s, p, st) {\n  if (s.see === 1) st.price *= 1.15;\n  if (s.see === 0) st.price *= 0.87;\n  return st.price;\n}";
  const THIEF = "var z = 0; try { fetch('http://127.0.0.1:" + t.port + "/__probe__quest'); z = 1; } catch (e) {}\ntry { Math.max = function () { return 99; }; } catch (e) {}\nfunction decide(s, p) { try { s.g.hi = 1e9; } catch (e) {} return 0.9; }";
  const B = {};
  for (const [k, o] of Object.entries({ a1: { name: "第一版", p: {}, code: "function decide(s, p) { return 0.5; }" }, a2: { name: "卖掉就涨", p: {}, code: UPDOWN }, bob: { name: "一口价", p: { x: 2 }, code: "function decide(s, p) { return p.x; }" },
    carol: { name: "死循环", p: {}, code: "function decide(s, p) { while (true) {} }" }, dave: { name: "想偷东西", p: {}, code: THIEF }, eve: { name: "事后改的", p: {}, code: "function decide(s, p) { return 3; }" }, x: { name: "别处的", p: {}, code: "function decide(s, p) { return 3; }" } })) B[k] = (await sealN(o, DAY, S.cid)).box;
  hub.items = [
    issueOf(11, "alice", B.a1, DAY + "T02:00:00Z"), issueOf(12, "alice", B.a2, DAY + "T03:00:00Z"),
    issueOf(13, "bob", B.bob, DAY + "T05:00:00Z", { upd: NEXT + "T00:02:00Z" }),              // 截止之后有人评论过（正文没动）
    issueOf(14, "carol", B.carol, DAY + "T06:00:00Z"), issueOf(15, "dave", B.dave, DAY + "T07:00:00Z"),
    issueOf(16, "erin", B.x, NEXT + "T00:00:05Z"), issueOf(17, "frank", B.x, DAY + "T08:00:00Z", { cid: "other.zz" }), issueOf(18, "gina", B.x, "2026-10-13T08:00:00Z"),
    issueOf(19, "me", post.meta.box, DAY + "T09:00:00Z"),
    issueOf(20, "zed", B.a2, DAY + "T09:30:00Z"),                                              // 把 alice 封好的那一份原样再交一遍
    issueOf(21, "eve", B.eve, DAY + "T10:00:00Z", { upd: NEXT + "T00:03:00Z" }),              // 截止之后改过正文
    issueOf(22, "hank", "A".repeat(300), DAY + "T11:00:00Z")                                   // 乱写的一份，解不开
  ];
  edited[21] = NEXT + "T00:03:00Z";
  await page.click("#qsRefresh"); await page.waitForSelector("#qsWho"); await page.waitForTimeout(100);
  let who = await rowsOf("#qsWho");
  ok(who.map(r => r.who).join() === "alice,bob,carol,dave,me,zed,eve,hank" && (await txt("#qsSay")).includes("已经有 8 个人交了规则") && (await page.locator("#qsPosted").count()) === 0, "只列当天交的、这道题的；迟到的、别的题的、前一天交的都不算", who.map(r => r.who).join());
  ok(who[0].cells.length === 2 && who[0].cells[1] === "03:00 UTC，第 2 次" && who[4].me && who[4].cells[0].includes("（你）") && !who[0].me, "同一个人交了两次，算后一次；GitHub 上那一份是你交过的几份之一（哪怕不是最后点的那一份），那一行就标着“你”", JSON.stringify(who[0].cells));
  const boardText = await txt("#qsBoard");
  ok(!/卖掉就涨|一口价|死循环|想偷东西|涨跌各一成多/.test(boardText) && (await page.locator("#qsPubRun").count()) === 0 && (await txt("#qsHow")).includes("封着的") && (await txt("#qsHow")).includes("私钥由仓库的主人保管"), "截止之前：只看得到谁交了、什么时候交的；规则的名字和成绩都没有，页面也不去跑别人的规则");
  await page.screenshot({ path: SH("quest-board.png") });
  hub.mode = "limited"; await page.click("#qsRefresh"); await page.waitForSelector("#qsBoardErr");
  ok((await txt("#qsBoardErr")).includes("每小时 60 次") && (await txt("#qsBoardErr")).includes("上一次取到的") && (await page.locator("#qsWho tbody tr").count()) === 8, "GitHub 限流：说清楚，并且接着显示上一次取到的");
  hub.mode = "down"; await page.click("#qsRefresh"); await page.waitForFunction(() => /连不上 GitHub/.test((document.querySelector("#qsBoardErr") || {}).textContent || ""));
  ok((await txt("#qsBoardErr")).includes("你的规则存在这台设备上"), "连不上 GitHub：说清楚，自己写的规则不受影响");
  hub.mode = "ok"; await closeAll();

  console.log("== 六、截止之后：结算和名次");
  const stat = () => txt("#qsbStatus"), statHas = re => page.waitForFunction(s => new RegExp(s).test((document.querySelector("#qsbStatus") || {}).textContent || ""), re, { timeout: 60000 });
  const settled = async () => { await page.waitForSelector("#qsbRefresh", { timeout: 120000 }); await page.waitForTimeout(150); };
  const again = async () => { await page.click("#qsbRefresh"); await page.waitForTimeout(60); await settled(); };
  await openBoard(DAY); await statHas("还没有截止");
  ok((await page.locator("#qsbTab").count()) === 0 && drand.calls.length === 0, "还没截止的那一天不结算，也不去取随机数");
  await closeAll();
  await setT(NEXT + "T00:00:10Z"); await reload();
  await openBoard(DAY); await settled();
  ok(drand.calls.length === 0 && (await stat()).includes("结算结果还没有公布") && (await txt("#qsbNoRnd")).includes("还没有发布") && (await page.locator("#qsbTab").count()) === 0, "截止之后不到半分钟：结果没公布，结算用的那一轮随机数也还没发布，页面不去问，告诉人稍等");
  await closeAll();
  await setT(NEXT + "T00:10:00Z"); await reload(); drand.mode = "early";
  await openBoard(DAY); await settled();
  ok(drand.calls.length === 4 && drand.calls.every(u => u.endsWith("/public/" + S.round)) && (await txt("#qsbNoRnd")).includes("还没有发布"), "信标说还没到时候：四个地址都问过了，问的是截止之后半分钟的那一轮", drand.calls.length + " " + drand.calls[0]);
  drand.mode = "badfirst"; drand.calls.length = 0;
  await again();
  ok(drand.calls.length === 2 && /api\.drand\.sh/.test(drand.calls[0]) && /api2\.drand\.sh/.test(drand.calls[1]) && (await page.evaluate(d => window.App.questStore().fin[d], DAY)).randomness === RND, "第一个地址给的随机数和它的签名对不上：不用它，换下一个地址");
  let board = await rowsOf("#qsbTab");
  const finD = await direct(DAY, "fin", [{ code: UPDOWN, p: {}, slot: S.slot }, { code: "function decide(s, p) { return p.x; }", p: { x: 2 }, slot: S.slot }, { code: "function decide(s, p) { return 0.9; }", p: {}, slot: S.slot }, { code: MINE, p: MINE_P, slot: S.slot }].concat(S.refs.map((r, i) => ({ code: r.code, p: r.p, slot: i }))));
  const pubD = await direct(DAY, "pub", [{ code: UPDOWN, p: {}, slot: S.slot }, { code: "function decide(s, p) { return p.x; }", p: { x: 2 }, slot: S.slot }, { code: "function decide(s, p) { return 0.9; }", p: {}, slot: S.slot }]);
  const Bd = u => board.filter(r => r.who === u)[0];
  ok((await stat()).includes("结算结果还没有公布") && board.length === 4 && board.filter(r => r.who === "ref").length === 3 && Bd("me").cells[1].includes("结果还没有公布") && Bd("me").cells[2].startsWith(finD[3].text + " ±") && Bd("me").cells[0] === "—", "结果还没公布的时候：页面在自己这里把基准规则和你交的那一条在结算的数据上算出来（别人的算不了）", board.map(r => r.who + "=" + r.cells[2]).join(" ; "));
  ok(board.filter(r => r.who === "ref").some(r => r.cells[1].includes("基准") && r.cells[2].startsWith(finD[4].text + " ±") && r.cells[3] === "—") && board.filter(r => r.who === "ref").some(r => r.cells[1].includes("参照") && r.cells[2].startsWith(finD[5].text + " ±")), "基准规则的成绩和引擎用结算的种子直接算的一样");
  // 结算的程序跑一遍（就是仓库的 Actions 里跑的那个程序；这里私钥是测试自己造的，沙盒用子进程代替容器）
  const res1 = await settleN(DAY, NEXT + "T00:20:00Z");
  ok(res1.status === "posted" && res1.meta.rows.length === 6 && res1.meta.skipped.edited === 1 && res1.meta.skipped.sealed === 1, "结算的程序把这一天交的规则解开、算分、贴出结果：六条有记录，一条截止后改过作废，一条解不开", JSON.stringify(res1.meta.skipped) + " " + res1.meta.rows.map(r => r.user).join());
  await setT(NEXT + "T00:30:00Z"); await reload(); await openBoard(DAY); await settled();
  board = await rowsOf("#qsbTab");
  ok(Bd("alice").cells[2].startsWith(finD[0].text + " ±") && Bd("bob").cells[2].startsWith(finD[1].text + " ±") && Bd("dave").cells[2].startsWith(finD[2].text + " ±") && Bd("me").cells[2].startsWith(finD[3].text + " ±"), "公布的成绩，和引擎用结算的种子直接算的一样", board.map(r => r.who + "=" + r.cells[2]).join(" ; ") + " | " + finD.map(x => x.text).join());
  const want = [["alice", finD[0].raw, 1], ["bob", finD[1].raw, 3], ["dave", finD[2].raw, 4], ["me", finD[3].raw, 5]].sort((a, b) => b[1] - a[1] || a[2] - b[2]).map(x => x[0]);
  ok(board.filter(r => /^\d+$/.test(r.cells[0])).sort((a, b) => +a.cells[0] - +b.cells[0]).map(r => r.who).join() === want.join(), "名次按结算的成绩排", board.map(r => r.who + ":" + r.cells[0]).join() + " want " + want.join());
  ok(Bd("zed").cells[0] === "—" && Bd("zed").cells[2].includes("原样照搬了 @alice 封好的那一份，不排名") && Bd("zed").cells[1].replace(/\s/g, "") === "@zed" && Bd("carol").cells[0] === "—" && Bd("carol").cells[2].includes("超时了") && hits.length === 0, "原样照搬别人封好的那一份的不排名，榜上也不显示那条规则的名字；死循环的那条没有名次；想偷东西的什么也没发出去", JSON.stringify(Bd("zed").cells));
  ok(Bd("bob").cells[0] !== "—" && !Bd("eve") && !Bd("hank") && (await txt("#qsbSkipped")).includes("1 条在截止之后改过正文") && (await txt("#qsbSkipped")).includes("1 条解不开或者不成样子"), "截止之后只是被评论过的照样算；改过正文的、解不开的不算，下面写着各有几条", await txt("#qsbSkipped"));
  ok(Bd("alice").cells[1].includes("卖掉就涨") && Bd("me").me && Bd("me").cells[1].includes("（你）") && Bd("me").cells[1].includes("涨跌各一成多") && (await stat()) === "这一天有 6 个人交了规则，你排第 " + (want.indexOf("me") + 1) + "。", "结算之后榜上才有规则的名字；你自己的那一行标着“你”，上面写着你排第几", await stat());
  ok((await page.locator("#qsbMineOk").count()) === 1 && (await page.locator("#qsbMineBad").count()) === 0 && (await txt("#qsbMineOk")).includes("你自己算的也是这个数") && (await txt("#qsbRefs")).includes("对得上"), "你交的那一条和基准规则，页面在自己这里重算了一遍：和公布的一样。重算用的是结果里有的那一份，不是后来点了却没有真的提交的那一份");
  const refRows = board.filter(r => r.who === "ref");
  ok(refRows.length === 3 && refRows.every(r => r.cells[0] === "—") && refRows.some(r => r.cells[1].includes("基准") && r.cells[2].startsWith(finD[4].text + " ±") && r.cells[3] === "—") && refRows.some(r => r.cells[1].includes("参照") && r.cells[2].startsWith(finD[5].text + " ±")), "三条基准规则也在表里当参照，不占名次");
  ok(Bd("alice").cells[4] === pubD[0].text && Bd("me").cells[4] === mineD.text && Bd("alice").cells[2].split(" ")[0] !== Bd("alice").cells[4], "最后一栏是同一条规则在公开的几组上的成绩：和结算的不是同一批数据");
  const how = await page.evaluate(() => ({ text: document.querySelector("#qsbHow").innerText, links: Array.from(document.querySelectorAll("#qsbHow a")).map(a => a.href), cap: document.querySelector("#qsbTab caption").innerText, html: document.querySelector("#qsbOut").innerHTML }));
  ok(how.text.includes("drand 第 " + S.round + " 轮") && how.text.includes(NEXT + " 00:00:30 UTC") && how.links.some(u => u.endsWith("/public/" + S.round) && u.includes("52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971")) && how.links.some(u => /\/issues\/\d+$/.test(u)) && how.text.includes("图个乐") && how.text.includes("技术上解得开所有人的规则") && how.text.includes("别人的成绩你没法自己验算") && how.cap.includes("结算的 10 组，每组 200 局"), "下面说明白：谁解得开、谁算的分、结算的数据哪来的、哪些你能自己核对，并且有链接去看那条结果和那一轮随机数");
  ok(!/st\.price|function decide|while \(true\)|__probe__/.test(how.html) && !/st\.price|function decide|while \(true\)|__probe__/.test(JSON.stringify(hub.items.filter(it => it.user.login === "github-actions[bot]"))), "榜上、公布的结果里都没有任何人的代码");
  await page.screenshot({ path: SH("quest-settle.png") });
  // 别人发一条长得一样的"结果"：不认
  const clone = o => JSON.parse(JSON.stringify(o)), fakeMeta = clone(res1.meta); fakeMeta.rows.forEach(r => { if (r.user === "dave") r.fin.mean = 99; });
  hub.items.push(botIssue(90, fakeMeta, NEXT + "T00:25:00Z", { login: "mallory", id: 5 }));
  await again(); board = await rowsOf("#qsbTab");
  ok(Bd("dave").cells[2].startsWith(finD[2].text + " ±") && Bd("alice").cells[0] === String(want.indexOf("alice") + 1), "别人发一条一模一样的“结算结果”、把自己的成绩改高：页面不认，榜不变");
  // 公布的结果要是算错了：我自己的那一行、基准规则对不上，页面说得出来
  const wrong = clone(res1.meta); wrong.rows.forEach(r => { if (r.user === "me") r.fin.mean -= 1; }); wrong.refs[0].fin.mean += 0.5;
  hub.items.push(botIssue(91, wrong, NEXT + "T00:26:00Z"));
  await again();
  ok((await page.locator("#qsbMineBad").count()) === 1 && (await txt("#qsbMineBad")).includes("你自己算的是 " + finD[3].text) && (await page.locator("#qsbMineOk").count()) === 0 && (await txt("#qsbRefs")).includes("不一样") && (await page.evaluate(() => document.querySelector("#qsbRefs").className)) === "warn", "公布的结果要是和你自己算的对不上（你的那一行，或者基准规则）：页面标出来，并且给出你自己算的数", await txt("#qsbMineBad"));
  const other = clone(res1.meta); other.randomness = "ab".repeat(32);
  hub.items.pop(); hub.items.push(botIssue(92, other, NEXT + "T00:27:00Z"));
  await again();
  ok((await page.locator("#qsbBadRnd").count()) === 1 && (await txt("#qsbBadRnd")).includes("信不得"), "公布的结果用的随机数和 drand 给的不是同一个：明说这份结果信不得");
  hub.items = hub.items.filter(it => it.number < 90); await again(); board = await rowsOf("#qsbTab");
  ok((await page.locator("#qsbBadRnd").count()) === 0 && (await page.locator("#qsbMineOk").count()) === 1, "这些假的、错的拿掉以后，榜回到原样");
  drand.mode = "down"; drand.calls.length = 0; await closeAll(); await reload();
  await openBoard(DAY); await settled();
  ok(drand.calls.length === 0 && (await rowsOf("#qsbTab")).filter(r => r.who === "alice")[0].cells[2] === Bd("alice").cells[2] && (await page.locator("#qsbMineOk").count()) === 1, "取到过的随机数存在这台设备上：再看这一天的结算不用再取，结果也一样");
  hub.mode = "down"; await again();
  ok((await txt("#qsbErr")).includes("连不上 GitHub") && (await txt("#qsbErr")).includes("上一次取到的") && (await rowsOf("#qsbTab")).filter(r => r.who === "alice").length === 1, "连不上 GitHub：说清楚，接着显示上一次取到的结果");
  hub.mode = "ok";
  // 没交的那一版：算出"要是算数排第几"，但不占别人的名次
  const keepRec = await page.evaluate(d => JSON.stringify(window.App.questStore().days[d]), DAY);
  await page.evaluate(d => { const st = window.App.questStore(); st.days[d].posted = null; st.days[d].sent = null; st.days[d].old = []; localStorage.setItem("ql.quest.v1", JSON.stringify(st)); }, DAY);
  await closeAll(); await reload(); await openBoard(DAY); await settled(); board = await rowsOf("#qsbTab");
  const would = 1 + [finD[0].raw, finD[1].raw, finD[2].raw, finD[3].raw].filter(v => v >= finD[3].raw).length, ghost = board.filter(r => r.who === "me" && r.cells[0] === "—")[0];
  ok(ghost && ghost.cells[1].includes("当天没有交") && ghost.cells[2].startsWith(finD[3].text + " ±") && (await stat()).includes("要是算数，排第 " + would + "（共 7 条）") && want.every((u, i) => board.filter(r => r.who === u && r.cells[0] !== "—")[0].cells[0] === String(i + 1)) && (await page.locator("#qsbMineOk").count()) === 0, "当天写了但没交（这台设备上只有草稿）：照样在自己这里算出它的成绩和“要是算数排第几”，别人的名次不受它影响", await stat());
  await page.evaluate(([d, r]) => { const st = window.App.questStore(); st.days[d] = JSON.parse(r); localStorage.setItem("ql.quest.v1", JSON.stringify(st)); }, [DAY, keepRec]);   // 还原：后面还要用"交过"的样子
  // 比第一道题还早的日子
  await closeAll(); await reload(); await openBoard(NEXT.replace("15", "13"));
  await page.waitForFunction(() => /取不到|还没有题|还没有每日一题|读不出来/.test((document.querySelector("#qsbStatus") || {}).textContent || ""), null, { timeout: 30000 });
  ok((await stat()).includes("这一天还没有每日一题：第一道题是 " + DAY + " 的") && (await page.locator("#qsbToday").count()) === 1, "比第一道题还早的日子：告诉人第一道题是哪天的，可以回到今天", await stat());
  await closeAll();
  // 没有人交、还没结算、随机数也取不到的一天
  await setT("2026-10-16T01:00:00Z"); await reload(); await openBoard(NEXT); await settled();
  ok((await stat()).includes("结算结果还没有公布") && (await txt("#qsbNoRnd")).includes("几个公共的地址都连不上") && drand.calls.length === 4 && (await page.locator("#qsbTab").count()) === 0, "结果没公布、随机数也取不到（四个地址都连不上）：两样都说清楚，给一个再取的按钮");
  drand.mode = "ok"; await again();
  ok((await stat()).includes("结算结果还没有公布") && (await page.locator("#qsbTab tbody tr").count()) === 3 && (await txt(".modal.arm .modal-h h2")).includes("把车停在哪儿"), "随机数取到了、结果还没公布：表里是页面自己算的三条基准规则");
  const res2 = await settleN(NEXT, "2026-10-16T01:05:00Z"); await again();
  ok(res2.status === "posted" && res2.meta.rows.length === 0 && (await stat()) === "这一天没有人交规则。" && (await page.locator("#qsbTab tbody tr").count()) === 3 && (await txt("#qsbRefs")).includes("对得上"), "没有人交的一天也照常结算：公布的是一份空的结果，表里是三条基准规则，和公布的对得上", await stat());
  // 自己交的那条是个死循环：结果里它超时了；页面在自己这里重算的时候也会卡住，到时间就放下它，只算基准规则
  const S2 = await specOf(NEXT), LOOP = "function decide(s, p) { while (true) {} }", CH2 = "0123456789abcdef";
  await page.evaluate(([d, cid, code, ch]) => { const st = window.App.questStore(); st.days[d] = { cid, title: "x", name: "死循环", par: "", code, posted: { ch, at: 1 }, sent: { k: "B".repeat(64), ch, name: "死循环", par: "", code, at: 1 }, old: [] }; localStorage.setItem("ql.quest.v1", JSON.stringify(st)); }, [NEXT, S2.cid, LOOP, CH2]);
  const hung = clone(res2.meta); hung.rows.push({ n: 50, user: "me", uid: 1050, at: Date.parse(NEXT + "T09:00:00Z"), name: "死循环", ch: CH2, fin: null, pub: null, err: "timeout", dup: 0, tries: 1 });
  hub.items.push(botIssue(95, hung, "2026-10-16T01:10:00Z"));
  await closeAll(); await reload(); await openBoard(NEXT); await settled(); await again(); board = await rowsOf("#qsbTab");
  ok((await stat()) === "这一天有 1 个人交了规则。你交的那条没有排上名次。" && board.length === 4 && Bd("me").me && Bd("me").cells[0] === "—" && Bd("me").cells[2].includes("超时了") && (await page.locator("#qsbMineOk, #qsbMineBad").count()) === 0 && (await txt("#qsbRefs")).includes("对得上"), "自己交的那条卡死了：榜上写着它超时；页面重算时到时间就放下它，基准规则照样核对", await stat());
  await page.click("#qsbPrev"); await settled();
  ok((await txt(".modal.arm .modal-h h2")).includes(DAY) && (await page.locator("#qsbNext").count()) === 1, "“前一天”“后一天”可以翻着看");
  // 交了，但结果里没有（比如截止之后自己改过正文，作废了）
  const gone = clone(res1.meta); gone.rows = gone.rows.filter(r => r.user !== "me"); gone.skipped.edited = 2; gone.skipped.more = 3;
  hub.items.push(botIssue(93, gone, "2026-10-16T01:20:00Z")); await again(); board = await rowsOf("#qsbTab");
  const would2 = 1 + [finD[0].raw, finD[1].raw, finD[2].raw].filter(v => v >= finD[3].raw).length;
  ok((await stat()) === "这一天有 5 个人交了规则。你写的那条不在结果里；要是算数，排第 " + would2 + "（共 6 条）。" && Bd("me").cells[0] === "—" && Bd("me").cells[1].includes("交的那条不在结果里") && Bd("me").cells[2].startsWith(finD[3].text + " ±") && (await txt("#qsbSkipped")) === "另外有几条没有算进来：2 条在截止之后改过正文，1 条解不开或者不成样子，3 条因为太多没有列出来。", "交了但结果里没有（作废了）：照样在自己这里算出来，说明它不在结果里；没算进来的各有几条都写着", (await stat()) + " | " + (await txt("#qsbSkipped")));
  const slow = clone(res1.meta); slow.rows.forEach(r => { if (r.user === "me") { r.fin = null; r.pub = null; r.err = "timeout"; } });
  hub.items.push(botIssue(94, slow, "2026-10-16T01:21:00Z")); await again(); board = await rowsOf("#qsbTab");
  ok((await stat()) === "这一天有 6 个人交了规则。你交的那条没有排上名次。" && Bd("me").me && Bd("me").cells[0] === "—" && Bd("me").cells[2].includes("超时了") && (await page.locator("#qsbMineOk, #qsbMineBad").count()) === 0, "你交的那条在结果里但没有成绩：明说没有排上名次", await stat());
  hub.items = hub.items.filter(it => it.number < 90); await again();
  ok((await page.locator("#qsbMineOk").count()) === 1 && (await stat()).includes("你排第"), "造出来的这几份结果拿掉以后，榜回到原样");
  await closeAll();


  console.log("== 七、没有题的日子");
  await setT(GAP + "T12:00:00Z"); await reload(); await openToday();
  const G = await specOf(GAP), idx = JSON.parse(fs.readFileSync(path.join(ROOT, "daily/index.json"), "utf8")).days, pick = QLN.questPick(idx, GAP).src;
  ok(G.rerun === pick && idx.indexOf(GAP) < 0 && pick < GAP && (await txt("#qsBanner")).includes("这一天没有新题，重温 " + pick + " 的一道旧题") && (await txt("#qsBanner")).includes(GAP), "这一天没有题：按日期从以前的题里挑一道（人人挑到的是同一道，结算的程序挑的也是它），横幅里写明是哪一天的", G.rerun);
  const orig = await specOf(pick);
  ok(G.cid === orig.cid && G.pub.join() !== orig.pub.join() && G.round !== orig.round, "重温的还是同一道题（指纹相同），但公开的数据换了一批，结算用的也是这一天的随机数");
  await tryIt(); ok((await page.locator("#qsTab tbody tr").count()) === G.refs.length + 1, "重温的题照样能试");
  await page.click("#qsPost"); await page.waitForSelector("#pdGo");
  const gapMeta = await page.evaluate(() => QLHub.unpack(new URL(document.querySelector("#pdGo").href).searchParams.get("body")).meta);
  const opens = day => { try { return !!SET.unseal(KP.privateKey, gapMeta.box, QLN.questSealInfo(day, G.cid)).code; } catch (e) { return false; } };
  ok(gapMeta.day === GAP && gapMeta.cid === G.cid && opens(GAP) && !opens(pick), "交上去的记的是今天的日期，封的时候用的也是今天的日期：挪到旧题原来的那一天解不开");
  await closeAll();
  daily.index = { v: 1, days: [] }; await reload(); await openToday();
  ok((await txt("#qsLoadErr")).includes("还没有题"), "一道题都没有的时候：告诉人还没有题");
  await closeAll(); daily.index = "missing"; await reload(); await openToday();
  ok((await txt("#qsLoadErr")).includes("还没有题"), "连目录都没有：一样");
  await closeAll(); daily.index = "real"; daily.down = true; await reload(); await openToday();
  ok((await txt("#qsLoadErr")).includes("取不到") && (await txt("#qsLoadErr")).includes("离线的副本"), "连不上网：说清楚每日一题要在网站上才有");
  daily.down = false; await page.click("#qsRetry"); await page.waitForSelector("#qsTry", { timeout: 30000 });
  ok((await page.locator("#qsTry").count()) === 1, "网好了之后点“再试一次”就能取到");
  daily.down = true; await page.click("#qsPost"); await page.waitForFunction(() => { const e = document.querySelector("#qsErr"); return e && !e.hidden; });
  ok((await errText()).includes("取不到把规则封起来用的公钥") && (await page.locator("#pdGo").count()) === 0, "题取到了、交的时候网又断了：取不到公钥，说清楚，不往下走");
  daily.down = false; await closeAll();
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
  await page.click("#btnLobby"); await page.waitForSelector('.lb-card[data-card="quest"] .lb-status');
  ok((await txt('.lb-card[data-card="quest"] .lb-status')) === "今天：给新产品定价 · 你交过了" && (await txt('.lb-card[data-card="quest"]')).includes("别人看不到你的代码"), "交过之后，大厅的卡片上写着“你交过了”；卡片上也写着别人看不到你的代码");
  await closeAll();

  console.log("== 八、手机宽度");
  await page.setViewportSize({ width: 390, height: 844 }); await openToday(); await tryIt();
  const phone = await page.evaluate(clipped), over1 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over1 <= 1 && phone.length === 0 && (await page.evaluate(() => getComputedStyle(document.querySelector("#qsTab th:nth-child(5)")).display)) === "none", "手机上：页面不横向溢出，按钮和表头里的字不被截掉，“各组的平均”那一栏收起来", JSON.stringify(phone.slice(0, 3)) + " overflow " + over1);
  await page.screenshot({ path: SH("quest-phone.png") });
  await closeAll(); await setT(NEXT + "T00:30:00Z"); await reload(); await openBoard(DAY); await page.waitForSelector("#qsbMineOk", { timeout: 120000 });
  const phone2 = await page.evaluate(clipped), over2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), wide = await page.evaluate(() => { const t = document.querySelector("#qsbTab"), g = t.closest(".gref"); return { box: g.getBoundingClientRect().right, win: window.innerWidth, tab: t.scrollWidth, room: g.clientWidth, cols: Array.from(t.querySelectorAll("thead th")).filter(th => getComputedStyle(th).display !== "none").length }; });
  ok(over2 <= 1 && phone2.length === 0 && wide.box <= wide.win + 1 && wide.tab <= wide.room + 1 && wide.cols === 3, "手机上看结算的榜：不溢出，表格自己也不用横着拖（只留名次、谁、结算的成绩三栏；带着“你自己算的也是这个数”那个标记）", JSON.stringify(phone2.slice(0, 3)) + " overflow " + over2 + " " + JSON.stringify(wide));
  await page.screenshot({ path: SH("quest-settle-phone.png") });
  await closeAll(); await page.setViewportSize({ width: 1280, height: 1000 });

  console.log("== 九、英文页面");
  if (process.env.QUEST_NO_EN) { console.log("（跳过）"); console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", real(logs).length ? "\n" + real(logs).join("\n") : "none"); await t.close(); if (fail) process.exitCode = 1; return; }
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); hub.items = []; hub.mode = "ok"; drand.mode = "ok"; daily.key = "ok";   // 英文页从一张白纸开始：中文页留下的草稿、假数据里的中文名字都不带过去
  const en = await ctx.newPage(), enLogs = [], copied = [];
  en.on("console", m => { if (m.type() === "error" || m.type() === "warning") enLogs.push(`[${m.type()}] ${m.text()}`); }); en.on("pageerror", e => enLogs.push("[pageerror] " + e.message));
  await en.route(u => /^https?:$/.test(u.protocol) && u.hostname !== "127.0.0.1", r => r.abort());
  await wire(en); await en.addInitScript(probe);
  await en.clock.setFixedTime(new Date(DAY + "T10:00:00Z"));
  await en.goto(`http://127.0.0.1:${t.port}/en/index.html`); await ready(en); await stub(en);
  const stage = s => en.evaluate(s => { window.__stage = s; }, s), spills = [];
  const look = async what => { const o = await en.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), c = await en.evaluate(clipped); if (o > 1) spills.push(what + ": overflow " + o); if (c.length) spills.push(what + ": " + JSON.stringify(c.slice(0, 3))); };
  const openAll = () => en.evaluate(() => document.querySelectorAll(".modal details").forEach(d => { d.open = true; }));
  const enErr = () => en.waitForFunction(() => { const e = document.querySelector("#qsErr"); return e && !e.hidden; }, null, { timeout: 20000 });
  const enSettled = async () => { await en.waitForSelector("#qsbRefresh", { timeout: 120000 }); await en.waitForTimeout(150); };
  const enAgain = async what => { await en.click("#qsbRefresh"); await en.waitForTimeout(60); await enSettled(); await openAll(); if (what) await look(what); };
  await stage("quest: lobby"); await en.click("#btnLobby"); await en.waitForSelector('.lb-card[data-card="quest"]'); await look("lobby"); await closeAll(en);
  await stage("quest: today"); await openToday(en); await openAll(); await look("today");
  const enHead = await en.evaluate(() => ({ title: document.querySelector(".modal.arm .modal-h h2").innerText, about: document.querySelector("#qsAbout").innerText, game: document.querySelector("#qsGameCode").textContent, starter: document.querySelector("#qsCode").value, banner: document.querySelector("#qsBanner").innerText, seal: document.querySelector("#qsSealNote").innerText }));
  ok(enHead.title === "Daily challenge · Pricing a new product" && enHead.about.includes("60 customers") && enHead.game.includes("// Deal:") && enHead.starter.includes("// Starter code") && enHead.banner.includes(DAY) && /encrypted/i.test(enHead.seal), "英文页：题目、题面、裁判和起始代码里的注释都是英文的；交之前写明是加密的", enHead.title + " | " + enHead.seal);
  await en.click('#qsRefs [data-code="updown"]'); await en.waitForSelector("#qsRefCode"); await look("ref code"); await closeTop(en);
  await stage("quest: try"); await tryIt(en); await openAll(); await look("try");
  const enRows = await rowsOf("#qsTab", en);
  ok(enRows.length === 4 && S.refs.every((r, i) => enRows.filter(x => x.who === "ref:" + r.id)[0].cells[2].startsWith(refD[i].text + " ±")), "英文页和中文页跑的是同一段代码：基准规则的成绩逐位相同", enRows.map(r => r.cells[2]).join(" ; "));
  await setRule(MINE, "start = 1.2, up = 1.12, down = 0.9", "Up and down", en); await tryIt(en);
  ok((await rowsOf("#qsTab", en)).filter(x => x.who === "you")[0].cells[2].startsWith(mineD.text + " ±"), "英文页上自己写的规则，成绩也和中文页的一样");
  await stage("quest: brief"); await en.click("#qsAi"); copied.push(...(await en.evaluate(() => window.__copied)));
  await stage("quest: seal"); daily.key = "missing"; await en.click("#qsPost"); await enErr(); await look("no key"); daily.key = "ok";
  daily.down = true; await en.click("#qsPost"); await enErr(); await look("key offline"); daily.down = false;
  await setRule("// import\n" + MINE, "start = 1.2, up = 1.12, down = 0.9", null, en); await en.click("#qsPost"); await enErr(); await look("import");
  await setRule(LONG, "start = 1.2, up = 1.12, down = 0.9", null, en); await en.click("#qsPost"); await en.waitForSelector("#pdGo"); await look("post: long"); await closeTop(en);
  await setRule(MINE, "start = 1.2, up = 1.12, down = 0.9", null, en); await en.click("#qsPost"); await en.waitForSelector("#pdGo"); await look("post");
  const enPost = await en.evaluate(() => { const a = document.querySelector("#pdGo"), u = new URL(a.href); a.addEventListener("click", e => e.preventDefault()); return { title: u.searchParams.get("title"), body: u.searchParams.get("body"), meta: QLHub.unpack(u.searchParams.get("body")).meta, note: document.querySelector("#pdNote").textContent }; });
  const enOpen = SET.unseal(KP.privateKey, enPost.meta.box, QLN.questSealInfo(DAY, S.cid));
  ok(enPost.title === "[SL:quest] " + DAY + " Pricing a new product · sealed rule" && !RE0.test(enPost.body) && enOpen.name === "Up and down" && enOpen.code === MINE && /encrypted/i.test(enPost.note), "英文页交上去的那一条：标题和说明都是英文的，封好的那一份照样解得开", enPost.title + " | " + enPost.body.slice(0, 160));
  await en.click("#pdGo"); await en.waitForTimeout(150); await closeTop(en);
  await en.click("#qsRefresh"); await en.waitForSelector("#qsPosted"); await look("posted hint");
  // 英文的假数据：别人交的、封好的规则
  const E = {};
  for (const [k, o] of Object.entries({ a1: { name: "First try", p: {}, code: "function decide(s, p) { return 0.5; }" }, a2: { name: "Up after a sale", p: {}, code: UPDOWN }, bob: { name: "Flat two", p: { x: 2 }, code: "function decide(s, p) { return p.x; }" },
    carol: { name: "Loop", p: {}, code: "function decide(s, p) { while (true) {} }" }, dave: { name: "Throws", p: {}, code: "function decide(s, p) { throw new Error('boom'); }" }, eve: { name: "Edited later", p: {}, code: "function decide(s, p) { return 3; }" } })) E[k] = (await sealN(o, DAY, S.cid)).box;
  const T2 = { title: DAY + " x · sealed rule" };
  hub.items = [issueOf(31, "alice", E.a1, DAY + "T02:00:00Z", T2), issueOf(32, "alice", E.a2, DAY + "T03:00:00Z", T2), issueOf(33, "bob", E.bob, DAY + "T05:00:00Z", Object.assign({ upd: NEXT + "T00:02:00Z" }, T2)), issueOf(34, "carol", E.carol, DAY + "T06:00:00Z", T2), issueOf(35, "dave", E.dave, DAY + "T07:00:00Z", T2),
    issueOf(36, "me", enPost.meta.box, DAY + "T09:00:00Z", T2), issueOf(37, "zed", E.a2, DAY + "T09:30:00Z", T2), issueOf(38, "eve", E.eve, DAY + "T10:00:00Z", Object.assign({ upd: NEXT + "T00:03:00Z" }, T2)), issueOf(39, "hank", "A".repeat(300), DAY + "T11:00:00Z", T2)];
  edited[38] = NEXT + "T00:03:00Z";
  await stage("quest: who"); await en.click("#qsRefresh"); await en.waitForSelector("#qsWho"); await look("who");
  const enWho = await rowsOf("#qsWho", en);
  ok(enWho.length === 8 && enWho.filter(r => r.me).length === 1 && enWho.filter(r => r.me)[0].who === "me" && /\(you\)/i.test(enWho.filter(r => r.me)[0].cells[0]) && enWho[0].cells.length === 2, "英文页：今天谁交了，只有账号和时间；自己的那一行标着 you", JSON.stringify(enWho.slice(0, 2)));
  hub.mode = "limited"; await en.click("#qsRefresh"); await en.waitForSelector("#qsBoardErr"); hub.mode = "down"; await en.click("#qsRefresh"); await en.waitForFunction(() => /GitHub/.test((document.querySelector("#qsBoardErr") || {}).textContent || "")); hub.mode = "ok";
  await closeAll(en);
  await stage("quest: not closed"); await openBoard(DAY, en); await en.waitForFunction(() => (document.querySelector("#qsbStatus") || {}).className === "warn", null, { timeout: 30000 }); await look("not closed"); await closeAll(en);
  await stage("quest: settle, nothing yet"); await en.clock.setFixedTime(new Date(NEXT + "T00:10:00Z")); drand.mode = "early"; await openBoard(DAY, en); await enSettled(); await look("nothing yet");
  drand.mode = "down"; hub.mode = "limited"; await enAgain("no beacon, limited"); hub.mode = "down"; await enAgain("no beacon, down"); hub.mode = "ok"; drand.mode = "ok"; await enAgain("own numbers only");
  ok((await rowsOf("#qsbTab", en)).length === 4 && (await en.locator("#qsbTab tr.me").count()) === 1, "英文页：结果还没公布的时候，表里是页面自己算的基准规则和你交的那一条");
  await stage("quest: settle");
  const enRes = await settleN(DAY, NEXT + "T00:20:00Z");
  await en.clock.setFixedTime(new Date(NEXT + "T00:30:00Z")); await enAgain("settle");
  const enBoard = await rowsOf("#qsbTab", en), EB = u => enBoard.filter(r => r.who === u)[0], enWant = [["alice", finD[0].raw, 1], ["bob", finD[1].raw, 2], ["me", finD[3].raw, 3]].sort((a, b) => b[1] - a[1] || a[2] - b[2]).map(x => x[0]);
  ok(enRes.status === "posted" && EB("alice").cells[2].startsWith(finD[0].text + " ±") && EB("bob").cells[2].startsWith(finD[1].text + " ±") && EB("me").cells[2].startsWith(finD[3].text + " ±") && enWant.every((u, i) => EB(u).cells[0] === String(i + 1)), "英文页的结算和中文页是同一批数据、同一个结果", enBoard.map(r => r.who + "=" + r.cells[2]).join(" ; "));
  ok(EB("alice").cells[1].includes("Up after a sale") && EB("me").me && (await en.locator("#qsbMineOk").count()) === 1 && EB("zed").cells[0] === "—" && /@alice/.test(EB("zed").cells[2]) && EB("carol").cells[0] === "—" && EB("dave").cells[0] === "—" && !EB("eve") && !EB("hank") && (await en.locator("#qsbSkipped").count()) === 1 && (await en.locator("#qsbIssue").count()) === 1, "英文页：名字在结算之后才出现；自己的那一行核对过；照抄的、超时的、出错的没有名次；作废的另外写明");
  await en.screenshot({ path: SH("quest-en-settle.png") });
  await en.setViewportSize({ width: 390, height: 844 }); await en.waitForTimeout(200); await look("phone: settle");
  const enWide = await en.evaluate(() => { const t = document.querySelector("#qsbTab"), g = t.closest(".gref"); return { tab: t.scrollWidth, room: g.clientWidth }; });
  ok(enWide.tab <= enWide.room + 1, "英文页：手机上结算的表格也不用横着拖", JSON.stringify(enWide)); await en.screenshot({ path: SH("quest-en-settle-phone.png") }); await en.setViewportSize({ width: 1280, height: 1000 }); await en.waitForTimeout(150);
  // 各种少见的情形都走一遍，看英文页上有没有漏掉的字、放不下的字
  const eclone = o => JSON.parse(JSON.stringify(o)), enWrong = eclone(enRes.meta); enWrong.rows.forEach(r => { if (r.user === "me") r.fin.mean -= 1; }); enWrong.refs[0].fin.mean += 0.5; enWrong.randomness = "ab".repeat(32); enWrong.skipped.more = 3;
  hub.items.push(botIssue(91, enWrong, NEXT + "T00:26:00Z", null, DAY + " x · settlement")); await stage("quest: settle, wrong"); await enAgain("wrong result");
  ok((await en.locator("#qsbMineBad").count()) === 1 && (await en.locator("#qsbBadRnd").count()) === 1 && (await en.evaluate(() => document.querySelector("#qsbRefs").className)) === "warn", "英文页：公布的结果对不上的时候，三处提醒都在");
  hub.mode = "limited"; await enAgain("stale, limited"); hub.mode = "down"; await enAgain("stale, down"); hub.mode = "ok";
  const enGone = eclone(enRes.meta); enGone.rows = enGone.rows.filter(r => r.user !== "me");
  hub.items.pop(); hub.items.push(botIssue(93, enGone, NEXT + "T00:27:00Z", null, DAY + " x · settlement")); await stage("quest: settle, void"); await enAgain("void entry");
  const enSlow = eclone(enRes.meta); enSlow.rows.forEach(r => { if (r.user === "me") { r.fin = null; r.pub = null; r.err = "timeout"; } });
  hub.items.pop(); hub.items.push(botIssue(94, enSlow, NEXT + "T00:28:00Z", null, DAY + " x · settlement")); await stage("quest: settle, no score"); await enAgain("no score");
  const enNone = eclone(enRes.meta); enNone.rows = [];
  hub.items.pop(); hub.items.push(botIssue(96, enNone, NEXT + "T00:29:00Z", null, DAY + " x · settlement")); await stage("quest: settle, nobody"); await enAgain("nobody");
  hub.items.pop(); await en.evaluate(d => { const st = window.App.questStore(); st.days[d].posted = null; st.days[d].sent = null; st.days[d].old = []; localStorage.setItem("ql.quest.v1", JSON.stringify(st)); }, DAY);
  await closeAll(en); await en.reload(); await ready(en); await stub(en); await stage("quest: settle, draft only"); await openBoard(DAY, en); await enSettled(); await enAgain("draft only");
  await en.evaluate(d => { const st = window.App.questStore(); delete st.days[d]; localStorage.setItem("ql.quest.v1", JSON.stringify(st)); }, DAY);
  await closeAll(en); await en.reload(); await ready(en); await stub(en); await stage("quest: settle, onlooker"); await openBoard(DAY, en); await enSettled(); await openAll(); await look("onlooker");
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
  const cjk = (await en.evaluate(() => window.__cjk())).filter(([s]) => !ALLOW.some(re => re.test(s)));
  ok(cjk.length === 0, "英文页上走完每日一题的每一处，页面上没有出现过汉字和中文标点", cjk.slice(0, 6).map(x => x.join(" @ ")).join("\n"));
  const MARK = new RegExp(String.fromCharCode(0x2423) + "|" + String.fromCharCode(0xa7) + "[0-9]+" + String.fromCharCode(0xa7)), odd = (await en.evaluate(() => window.__allText())).filter(([s]) => MARK.test(s));
  ok(odd.length === 0, "英文页上没有露出翻译用的记号（空格的记号、占位的记号）", odd.slice(0, 4).map(x => x.join(" @ ")).join("\n"));
  ok(spills.length === 0, "英文页：桌面和手机宽度下，弹层不横向溢出，按钮和表头里的字不被截掉", spills.join("\n"));
  ok(copied.length >= 1 && copied.every(s => !RE0.test(s)) && copied[0].includes("Pricing a new product") && copied[0].includes("function referee(G, t, a)"), "英文页复制给 AI 的说明也全是英文", copied.map(s => (RE0.exec(s) || [""])[0] + s.slice(Math.max(0, s.search(RE0) - 30), s.search(RE0) + 30)).join(" | "));
  ok(real(enLogs).length === 0, "英文页没有报错", real(enLogs).join("\n"));

  const realLogs = real(logs);
  console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", realLogs.length ? "\n" + realLogs.join("\n") : "none");
  await t.close();
  if (fail) process.exitCode = 1;
})().catch(e => { console.error("CRASH", e); process.exit(1); });
