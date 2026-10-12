// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 大厅和每日一局：入口、指定的那一局、打到一半接着打、榜（GitHub 的接口换成本机的假数据）、把成绩贴上去的链接、换日、手机宽度
const path = require("path"), { open } = require("./ui-smoke.js");
const SH = n => path.join(__dirname, "../shots/" + n);
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) { pass++; if (process.env.VERBOSE) console.log("  ok  ", name, d === undefined ? "" : "  " + String(d).slice(0, 200)); } else { fail++; console.log("  FAIL", name, d === undefined ? "" : "  " + String(d).slice(0, 400)); } };
(async () => {
  const t = await open({ standalone: true, viewport: { width: 1280, height: 950 } }), page = t.page, logs = t.logs;
  // GitHub 的接口：每个测试段自己往 hub.items 里放东西；hub.mode 可以换成"被限流"
  const hub = { items: [], mode: "ok", calls: [] };
  await page.route("https://api.github.com/**", r => {
    hub.calls.push(r.request().url());
    if (hub.mode === "limited") return r.fulfill({ status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1791800000", "access-control-expose-headers": "x-ratelimit-remaining, x-ratelimit-reset", "access-control-allow-origin": "*" }, contentType: "application/json", body: JSON.stringify({ message: "API rate limit exceeded" }) });
    if (hub.mode === "down") return r.abort();
    r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: JSON.stringify(hub.items) });
  });
  await page.route("https://avatars.githubusercontent.com/**", r => r.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#888"/></svg>' }));
  const setDay = async iso => { await page.clock.setFixedTime(new Date(iso)); };
  const reload = async () => { await page.reload(); await page.waitForFunction(() => window.App && window.App.openDaily && !window.App.isBusy, null, { timeout: 60000 }); await page.waitForTimeout(150); };
  const closeAll = async () => { for (let i = 0; i < 5 && (await page.locator(".modal").count()); i++) { await page.keyboard.press("Escape"); await page.waitForTimeout(80); } };
  const txt = sel => page.locator(sel).first().innerText();
  /** 像人那样点到这一局结束：每一步点最显眼的那个按钮（接下 / 就要这一位 / 押正面 / 第一台能拉的机器）；n：最多点几下 */
  const clicks = n => page.evaluate(n => { let k = 0; while (k < n && !document.querySelector("#hpMe")) { const b = document.querySelector(".hpm .hp-board .hp-acts .btn.primary") || document.querySelector(".hpm .hp-arm:not(:disabled)"); if (!b) break; b.click(); k++; } return { k, done: !!document.querySelector("#hpMe") }; }, n);
  /** 用引擎造一条"别人交上来的成绩"：policy 决定每一步的动作 */
  const fake = (day, user, policy, n, extra) => page.evaluate(([day, user, policy, n, extra]) => {
    const QL = window.App.QL, spec = QL.dailySpec(day), B = QL.humanEpisode(spec.type, spec.hp, spec.seed, 0);
    const pol = { zero: () => 0, one: () => 1, alt: (v, t) => t % 2, late: (v, t) => (t >= 8 ? 1 : 0), small: () => 0.05 }[policy];
    let st = QL.humanStep(B, []), g = 0;
    while (!st.done && g++ < 5000) { const a = st.acts.slice(); while (a.length < st.t) a.push(NaN); a[st.t] = pol(st.view, st.t); st = QL.humanStep(B, a); }
    const meta = Object.assign({ kind: "daily", day, game: spec.type, acts: QL.actsPack(st.acts), score: st.score, v: QL.HUMAN_VER }, extra || {});
    return { item: { number: n, title: QLHub.title("daily", day + " x"), body: QLHub.pack(meta).replace(/\n/g, "\r\n"), user: { login: user, avatar_url: "https://avatars.githubusercontent.com/u/" + n + "?v=4" }, html_url: "https://github.com/x/y/issues/" + n, created_at: day + "T0" + (n % 10) + ":00:00Z", reactions: { "+1": n % 3 }, comments: 0 }, score: st.score, type: spec.type };
  }, [day, user, policy, n, extra]);

  const D1 = "2026-10-12";
  await setDay(D1 + "T10:00:00Z"); await reload();

  console.log("== 一、入口");
  ok((await page.locator("#btnLobby").count()) === 1 && (await txt("#btnLobby")).includes("大厅"), "顶栏有大厅的按钮");
  const spec1 = await page.evaluate(d => { const QL = window.App.QL, s = QL.dailySpec(d), s2 = QL.dailySpec(d); return { s, same: JSON.stringify(s) === JSON.stringify(s2), today: window.App.dailyToday(), name: QL.WORLDS[s.type].short, games: [0, 1, 2, 3].map(i => QL.dailySpec(QL.dayShift(d, i)).type) }; }, D1);
  ok(spec1.today === D1 && spec1.same && new Set(spec1.games).size === 4, "今天打哪一局只由日期决定；四天轮完四套玩法", JSON.stringify(spec1.games));
  await page.click("#btnLobby"); await page.waitForSelector(".modal.lbm .lb-card");
  const cardText = await txt('.lb-card[data-card="daily"]');
  ok(cardText.includes("每日一局") && cardText.includes(spec1.name) && cardText.includes("还没打"), "大厅里每日一局的卡片写着今天打什么、打没打", cardText.replace(/\s+/g, " "));
  await page.screenshot({ path: SH("lobby.png") });
  await page.click('.lb-card[data-card="daily"] [data-go]'); await page.waitForSelector(".modal.hpm .hp-board");
  ok((await page.locator(".modal.lbm").count()) === 0, "点进去之后大厅收起");
  ok((await txt(".modal.hpm .modal-h h2")).includes("每日一局") && (await txt(".hp-ep")).includes(D1), "弹层标着每日一局和日期", await txt(".hp-ep"));
  ok((await page.locator(".hp-sizes").count()) === 0 && (await page.locator(".hp-tally").count()) === 0, "指定的那一局：没有长度可选，也没有累计");
  ok((await txt(".db-banner")).includes("UTC") && /还有 \d+ 小时/.test(await txt(".db-banner")), "说明了换日的时刻和离下一局还有多久", await txt(".db-banner"));
  ok(hub.calls.length === 0, "还没打完时不去碰 GitHub");

  console.log("== 二、打到一半关掉，再打开接着打");
  let c = await clicks(3);
  const mid = await page.evaluate(() => JSON.parse(localStorage.getItem("ql.daily.v1")));
  ok(c.k >= 1 && mid && mid.days[D1] && mid.days[D1].acts.length > 0 && (c.done || !mid.days[D1].done), "每一步都记到这台设备上", JSON.stringify(mid && mid.days[D1]));
  if (!c.done) {
    const tile0 = await txt(".hp-tile b");
    await closeAll(); await reload();
    await page.evaluate(() => window.App.openDaily()); await page.waitForSelector(".modal.hpm .hp-board");
    ok((await txt(".hp-tile b")) === tile0, "刷新页面再进来，接着刚才那一回合", tile0 + " → " + (await txt(".hp-tile b")));
    c = await clicks(500);
  }
  ok(c.done, "这一局打得完");
  await page.waitForSelector("#dailyBoard"); await page.waitForTimeout(250);
  const rec1 = await page.evaluate(d => JSON.parse(localStorage.getItem("ql.daily.v1")).days[d], D1);
  const chk1 = await page.evaluate(([d, acts]) => { const QL = window.App.QL, s = QL.dailySpec(d), r = QL.humanReplay(s, QL.actsUnpack(acts, s.T)); return { ok: r.ok, score: r.score }; }, [D1, rec1.acts]);
  ok(rec1.done && chk1.ok && Math.abs(chk1.score - rec1.score) < 1e-12, "存下来的动作重放一遍，得分和当时的一样", JSON.stringify([rec1.score, chk1.score]));
  ok((await page.locator("#hpNext").count()) === 0 && (await page.locator("#hpWipe").count()) === 0 && (await page.locator("#hpCum").count()) === 0, "打完没有再来一局，也没有清零");
  ok((await page.locator(".hp-tab tbody tr").count()) >= 3, "和各条参照规则在同一局上的对照表照旧");

  console.log("== 三、榜：没有人、有人、无效的不算");
  ok(hub.calls.length === 1 && /since=2026-10-12T00%3A00%3A00Z/.test(hub.calls[0]) && /state=open/.test(hub.calls[0]), "打完才去取榜，只要今天动过的", hub.calls[0]);
  ok((await txt("#dbSay")).includes("还没有人上榜"), "没人上榜时照实说", await txt("#dbSay"));
  ok((await page.locator('.db-tab tr[data-who="me"]').count()) === 1 && (await page.locator(".db-tab tr.ref").count()) >= 2, "榜上有我自己这一行（还没贴上去）和几条参照规则");
  const post = await page.evaluate(() => { const a = document.querySelector("#dbPost"); if (!a) return null; const u = new URL(a.href), p = QLHub.unpack(u.searchParams.get("body")); return { host: u.host, path: u.pathname, title: u.searchParams.get("title"), meta: p && p.meta, target: a.target, rel: a.rel, len: a.href.length }; });
  ok(post && post.host === "github.com" && post.path === "/ZechenBian/ZechenBian.github.io/issues/new" && post.title.startsWith("[SL:daily] " + D1) && post.target === "_blank" && /noopener/.test(post.rel), "贴成绩的按钮是一条去 GitHub 新建 Issue 的链接", JSON.stringify(post));
  ok(post && post.meta && post.meta.day === D1 && post.meta.acts === rec1.acts && post.meta.game === spec1.s.type && post.len < 6000, "链接里带的就是这一局的动作", post && post.len);
  // 别人的成绩：两条有效的、一条动作被改坏的、一条昨天的、同一个账号的第二条、一条不相干的 Issue
  const f1 = await fake(D1, "alice", "one", 11), f2 = await fake(D1, "bob", "alt", 12), f3 = await fake(D1, "carol", "one", 13, { acts: "9,9,zz" }), f4 = await fake("2026-10-11", "dave", "one", 14), f5 = await fake(D1, "alice", "alt", 15);
  hub.items = [f1.item, f2.item, f3.item, f4.item, f5.item, { number: 16, title: "有个问题", body: "页面打不开", user: { login: "eve" }, created_at: D1 + "T01:00:00Z" }, { number: 17, title: "[SL:daily] " + D1, body: "```json\n{\"sl\":1,\"kind\":\"rule\"}\n```", user: { login: "mallory" }, created_at: D1 + "T01:00:00Z" }];
  await page.click("#dbRefresh"); await page.waitForFunction(() => document.querySelectorAll('.db-tab tr[data-who]:not(.ref)').length >= 3, null, { timeout: 5000 });
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll(".db-tab tbody tr")).map(tr => ({ who: tr.getAttribute("data-who"), rank: tr.children[0].innerText.trim(), score: tr.children[2].innerText.trim(), me: tr.classList.contains("me"), ref: tr.classList.contains("ref") })));
  const people = rows.filter(r => !r.ref);
  ok(people.length === 3 && people.some(r => r.who === "alice") && people.some(r => r.who === "bob") && !rows.some(r => ["carol", "dave", "eve", "mallory"].includes(r.who)), "只留今天这一局、重放得通的；改坏的、昨天的、不相干的都不算", JSON.stringify(people));
  const exp = await page.evaluate(([d, a, b, me]) => { const QL = window.App.QL, lower = !!QL.humanKit(QL.dailySpec(d).type, QL.dailySpec(d).hp, QL.dailySpec(d).seed).score.lower; const rk = QL.rankRows([{ score: a, at: 1 }, { score: b, at: 2 }, { score: me, at: 9e15 }], lower); return rk.rank; }, [D1, f1.score, f2.score, rec1.score]);
  const rankOf = w => +people.filter(r => r.who === w)[0].rank;
  ok(rankOf("alice") === exp[0] && rankOf("bob") === exp[1] && rankOf("me") === exp[2], "名次按重放出来的得分排，并列的先交的在前", JSON.stringify([people, exp]));
  ok((await txt("#dbSay")).includes("有 2 个人上榜") && (await txt("#dbSay")).includes("排第 " + exp[2]) && (await txt("#dbSay")).includes("共 3 人"), "一句话说清我排在哪", await txt("#dbSay"));
  ok((await page.locator(".db-tab img.db-av").count()) === 2 && (await page.locator('.db-tab a[href^="https://github.com/"]').count()) === 2, "上榜的人带头像和去那条 Issue 的链接");
  await page.screenshot({ path: SH("daily-board.png") });

  console.log("== 四、我也贴上去之后；GitHub 限流、断网");
  await page.click("#dbPost").catch(() => {}); await page.waitForTimeout(200);
  ok((await page.locator("#dbPosted").count()) === 1 && (await txt("#dbPosted")).includes("点 Create"), "点了之后告诉人下一步在 GitHub 上点什么");
  const pages = page.context().pages(); for (const p2 of pages) if (p2 !== page) await p2.close();
  const mineItem = await page.evaluate(([d, acts]) => ({ number: 20, title: QLHub.title("daily", d), body: QLHub.pack({ kind: "daily", day: d, game: window.App.QL.dailySpec(d).type, acts, v: 1 }), user: { login: "zechen" }, html_url: "https://github.com/x/y/issues/20", created_at: d + "T10:05:00Z", reactions: {} }), [D1, rec1.acts]);
  hub.items = hub.items.concat([mineItem]);
  await page.click("#dbRefresh"); await page.waitForFunction(() => !!document.querySelector('.db-tab tr[data-who="zechen"]'), null, { timeout: 5000 });
  ok((await page.locator('.db-tab tr[data-who="me"]').count()) === 0 && (await page.locator('.db-tab tr[data-who="zechen"].me').count()) === 1 && (await page.locator("#dbPost").count()) === 0, "动作对得上的那一条认作我：不再有\"还没贴上去\"的一行，也不再劝我去贴");
  ok((await txt("#dbSay")).includes("有 3 个人上榜，你排第 " + exp[2]), "说法也跟着变", await txt("#dbSay"));
  hub.mode = "limited"; await page.click("#dbRefresh"); await page.waitForSelector("#dbErr");
  ok((await txt("#dbErr")).includes("60 次") && (await page.locator('.db-tab tr[data-who="alice"]').count()) === 1, "被 GitHub 限流：照实说，并留着上一次取到的榜", await txt("#dbErr"));
  hub.mode = "ok"; await closeAll();

  console.log("== 五、刷新之后；大厅里的状态；地址里的入口");
  await reload();
  await page.click("#btnLobby"); await page.waitForSelector(".modal.lbm .lb-card");
  ok((await txt('.lb-card[data-card="daily"] .lb-status')).includes("你的成绩"), "大厅的卡片上写着今天的成绩", await txt('.lb-card[data-card="daily"] .lb-status'));
  await closeAll();
  const n0 = hub.calls.length;
  await page.evaluate(() => { location.hash = "#daily"; }); await page.waitForSelector(".modal.hpm #hpMe"); await page.waitForSelector("#dailyBoard .db-tab");
  const rec2 = await page.evaluate(d => JSON.parse(localStorage.getItem("ql.daily.v1")).days[d], D1);
  ok(rec2.acts === rec1.acts && rec2.at === rec1.at && (await page.locator(".hpm .hp-acts .btn.primary").count()) === 0, "地址带 #daily 直接进来；打完的那一局原样摆着，不能重打，也没有重记");
  ok((await page.evaluate(() => location.hash)) === "", "入口只用一次：地址里的 #daily 用完就拿掉");
  ok(hub.calls.length === n0 && (await page.locator('.db-tab tr[data-who="alice"]').count()) === 1, "三分钟之内重新打开，榜用的是刚才取到的那一份，不再去打扰 GitHub", hub.calls.length - n0);
  hub.mode = "down"; await page.click("#dbRefresh"); await page.waitForSelector("#dbErr");
  ok((await txt("#dbErr")).includes("连不上 GitHub"), "断网：说连不上，成绩不受影响", await txt("#dbErr"));
  hub.mode = "ok"; await closeAll();

  console.log("== 六、换日；昨天的榜");
  await setDay("2026-10-13T00:00:30Z"); await reload();
  const s2 = await page.evaluate(() => window.App.dailyStatus());
  ok(s2.spec.day === "2026-10-13" && s2.spec.type !== spec1.s.type && !s2.done && !s2.started, "过了 UTC 0 点就是新的一局，换了一套玩法", JSON.stringify([s2.spec.day, s2.spec.type]));
  await page.evaluate(() => window.App.openDaily()); await page.waitForSelector(".modal.hpm .hp-board");
  c = await clicks(500); ok(c.done, "第二天这一局也打得完");
  await page.waitForSelector("#dailyBoard #dbYesterday"); await page.click("#dbYesterday"); await page.waitForSelector(".modal.dbm .db-tab");
  await page.waitForFunction(() => document.querySelectorAll('.dbm .db-tab tr[data-who]:not(.ref)').length >= 3, null, { timeout: 5000 });
  ok((await txt(".dbm .modal-h h2")).includes(D1) && (await page.locator('.dbm .db-tab tr[data-who="zechen"].me').count()) === 1 && (await page.locator(".dbm #dbPost").count()) === 0 && (await page.locator(".dbm #dbYesterday").count()) === 0, "昨天的榜：还认得出我，不再让贴成绩");
  ok((await txt(".dbm #dbSay")).includes(D1 + "有 3 个人上榜"), "说的是那一天", await txt(".dbm #dbSay"));
  await closeAll();
  const days = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("ql.daily.v1")).days));
  ok(days.length === 2, "两天各记一条", days.join(","));
  ok((await page.evaluate(() => { const o = JSON.parse(localStorage.getItem("ql.human.v1") || "null"); return o ? Object.keys(o.rec).length : 0; })) === 0, "每日一局不往\"亲手玩一局\"的存档里记");

  console.log("== 七、四套玩法都能当每日一局；手机宽度");
  await page.setViewportSize({ width: 390, height: 780 });
  const probs = [];
  for (const d of ["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"]) {
    await setDay(d + "T12:00:00Z"); await reload();
    await page.evaluate(() => window.App.openDaily()); await page.waitForSelector(".modal.hpm .hp-board");
    c = await clicks(500); await page.waitForSelector("#dailyBoard .db-tab"); await page.waitForTimeout(150);
    const o = await page.evaluate(() => { const d = document.documentElement, b = document.querySelector(".modal.hpm .modal-box"), bad = []; b.querySelectorAll(".db, .db-foot, .hp-banner, .db-tab").forEach(el => { if (el.scrollWidth > el.clientWidth + 1) bad.push(el.className + " +" + (el.scrollWidth - el.clientWidth)); }); const br = b.getBoundingClientRect(); return { doc: d.scrollWidth - d.clientWidth, box: Math.round(br.right) > window.innerWidth || br.left < 0, bad, type: window.App.dailyStatus().spec.type }; });
    if (!c.done || o.doc > 1 || o.box || o.bad.length) probs.push(d + ": " + JSON.stringify(o) + " done=" + c.done);
    if (d === "2026-10-14") await page.screenshot({ path: SH("daily-phone.png") });
    await closeAll();
  }
  ok(probs.length === 0, "手机宽度下四套玩法的每日一局都打得完，没有横向溢出", probs.join(" || "));
  await page.click("#btnLobby"); await page.waitForSelector(".modal.lbm .lb-card");
  const lob = await page.evaluate(() => { const d = document.documentElement, b = document.querySelector(".modal.lbm .modal-box").getBoundingClientRect(), top = document.querySelector(".top"); return { doc: d.scrollWidth - d.clientWidth, box: Math.round(b.right) > window.innerWidth, top: top.scrollWidth - top.clientWidth }; });
  ok(lob.doc <= 1 && !lob.box && lob.top <= 1, "手机宽度：大厅和顶栏都不溢出", JSON.stringify(lob));
  await page.screenshot({ path: SH("lobby-phone.png") });

  const ext = t.external.filter(hst => !/fonts\.(googleapis|gstatic)\.com/.test(hst));
  ok(ext.length === 0, "除了字体，页面没有去连别的地方（GitHub 的接口和头像在测试里另有假数据接着）", ext.join(","));
  const real = logs.filter(l => !/Failed to load resource/.test(l));   // 字体被拦、假装的限流和断网都会在控制台留一行"取不到"，那是预料之中的
  console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", real.length ? "\n" + real.join("\n") : "none");
  await t.close(); process.exitCode = fail || real.length ? 1 : 0;
})().catch(e => { console.error("TEST CRASHED:", e.message.split("\n").slice(0, 6).join("\n")); process.exit(1); });
