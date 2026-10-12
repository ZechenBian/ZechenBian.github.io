// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 实时房间：三个人（三个互不相通的浏览器环境）经本机的假中继进同一个房间，同时打同一局；只看得到进度，打完一起揭晓；
// 封条对不上的作废；房主叫停、掉线、接手、房间满了、没有这个房间
const path = require("path"), { open } = require("./ui-smoke.js"), broker = require("./mini-broker.js");
const SH = n => path.join(__dirname, "../shots/" + n);
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) { pass++; if (process.env.VERBOSE) console.log("  ok  ", name, d === undefined ? "" : "  " + String(d).slice(0, 200)); } else { fail++; console.log("  FAIL", name, d === undefined ? "" : "  " + String(d).slice(0, 500)); } };
(async () => {
  const B1 = await broker.start(), B2 = await broker.start();
  const t = await open({ standalone: true, viewport: { width: 1100, height: 900 } }), logs = t.logs, base = `http://127.0.0.1:${t.port}/index.html?broker=${encodeURIComponent(B1.url + "," + B2.url)}`;
  // 掉线的判定和报到的间隔调快（正式是 35 秒和 10 秒），测试才等得起
  const ready = async p => { await p.waitForFunction(() => window.App && window.App.openRoom && !window.App.isBusy, null, { timeout: 60000 }); await p.evaluate(() => { window.App.roomOpt.stale = 4500; window.App.roomOpt.beat = 1200; }); await p.waitForTimeout(100); };
  const newPlayer = async (hash, vp) => {
    const ctx = await t.browser.newContext({ viewport: vp || { width: 1100, height: 900 } }), p = await ctx.newPage();
    p.on("console", m => { if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`); }); p.on("pageerror", e => logs.push("[pageerror] " + e.message));
    await p.route(u => /^https?:$/.test(u.protocol) && u.hostname !== "127.0.0.1", r => r.abort());
    await p.goto(base + (hash || "")); await ready(p); return p;
  };
  const txt = (p, sel) => p.locator(sel).first().innerText();
  const closeTop = async p => { await p.keyboard.press("Escape"); await p.waitForTimeout(80); };
  const clicks = (p, n) => p.evaluate(n => { let k = 0; while (k < n && !document.querySelector("#hpMe")) { const b = document.querySelector(".hpm .hp-board .hp-acts .btn.primary") || document.querySelector(".hpm .hp-arm:not(:disabled)"); if (!b) break; b.click(); k++; } return { k, done: !!document.querySelector("#hpMe") }; }, n);
  /** 像另一种人那样打：每一步点"不那么显眼"的按钮（放过 / 最后一台机器 / 这次不押） */
  const clicksOther = (p, n) => p.evaluate(n => { let k = 0; while (k < n && !document.querySelector("#hpMe")) { const acts = document.querySelectorAll(".hpm .hp-board .hp-acts .btn"), arms = document.querySelectorAll(".hpm .hp-arm:not(:disabled)"); const b = acts.length ? acts[acts.length > 2 ? 2 : 1] : arms[arms.length - 1]; if (!b) break; b.click(); k++; } return { k, done: !!document.querySelector("#hpMe") }; }, n);
  const rows = (p, sel) => p.evaluate(sel => Array.from(document.querySelectorAll(sel + " tbody tr")).map(tr => ({ who: tr.getAttribute("data-who"), cells: Array.from(tr.children).map(td => td.innerText.trim()), me: tr.classList.contains("me") })), sel);
  const uidOf = p => p.evaluate(() => localStorage.getItem("ql.uid"));

  console.log("== 一、开房间");
  const pa = t.page; await pa.goto(base); await ready(pa);
  await pa.click("#btnLobby"); await pa.waitForSelector('.lb-card[data-card="room"]'); await pa.click('.lb-card[data-card="room"] [data-go]'); await pa.waitForSelector("#rmNick");
  await pa.click("#rmCreate"); await pa.waitForSelector("#rmErr:not([hidden])");
  ok((await txt(pa, "#rmErr")).includes("名字"), "没起名字不让进", await txt(pa, "#rmErr"));
  await pa.fill("#rmNick", "  阿甲\u0007  "); await pa.click("#rmCreate"); await pa.waitForSelector("#rmCode");
  const code = (await txt(pa, "#rmCode")).trim();
  ok(/^[A-Z2-9]{6}$/.test(code) && !/[01ILO]/.test(code), "房间号是 6 位，不含容易看混的字", code);
  await pa.waitForFunction(() => /2 \/ 2/.test(document.querySelector("#rmNet").innerText), null, { timeout: 8000 });
  ok(true, "两台中继都连上了");
  const la = await rows(pa, ".rm-list");
  ok(la.length === 1 && la[0].me && la[0].cells[0].includes("阿甲") && la[0].cells[0].includes("房主") && la[0].cells[1] === "在等开始", "房间里先只有房主一个人；名字里的怪字符去掉了", JSON.stringify(la));
  ok((await pa.locator("#rmStart").count()) === 1 && (await pa.locator("#rmGame").count()) === 1 && (await pa.locator("#rmSize").count()) === 1, "房主能选玩法、选长度、点开始");
  await pa.selectOption("#rmGame", "g_lock"); await pa.selectOption("#rmSize", "s"); await pa.waitForTimeout(150);
  await pa.click("#rmCopy"); await pa.waitForTimeout(100);

  console.log("== 二、另外两个人进来");
  const pb = await newPlayer("#room=" + code); await pb.waitForSelector("#rmJoinCode");
  ok((await pb.inputValue("#rmJoinCode")) === code && (await pb.evaluate(() => location.hash)) === "", "点邀请链接进来：房间号已经填好，地址里的入口用完就拿掉");
  await pb.fill("#rmNick", "小乙"); await pb.click("#rmJoin"); await pb.waitForSelector("#rmCode");
  await pb.waitForFunction(() => document.querySelectorAll(".rm-list tbody tr").length === 2, null, { timeout: 8000 });
  ok((await txt(pb, "#rmWhat")).includes("接单与冷却") && (await txt(pb, "#rmWhat")).includes("30"), "进来的人看得到房主选的玩法和长度", await txt(pb, "#rmWhat"));
  ok((await pb.locator("#rmStart").count()) === 0 && (await pb.locator("#rmGame").count()) === 0 && (await txt(pb, ".rm-foot")).includes("等房主开始"), "不是房主：不能选玩法，不能开始");
  const pc = await newPlayer(""); await pc.evaluate(() => window.App.openRoom()); await pc.waitForSelector("#rmJoinCode");
  await pc.fill("#rmNick", "丙"); await pc.fill("#rmJoinCode", "abc"); await pc.click("#rmJoin"); await pc.waitForSelector("#rmErr:not([hidden])");
  ok((await txt(pc, "#rmErr")).includes("6 位"), "房间号不够 6 位：说清楚该填什么");
  await pc.fill("#rmJoinCode", code.toLowerCase()); await pc.click("#rmJoin"); await pc.waitForSelector("#rmCode");
  for (const p of [pa, pb, pc]) await p.waitForFunction(() => document.querySelectorAll(".rm-list tbody tr").length === 3, null, { timeout: 8000 });
  ok((await rows(pa, ".rm-list")).map(r => r.cells[0].replace(/\s+/g, "")).join("|").includes("小乙") && (await txt(pa, ".rm-list caption")).includes("3 个人"), "三个人互相都看得到", JSON.stringify(await rows(pa, ".rm-list")));
  const ids = { a: await uidOf(pa), b: await uidOf(pb), c: await uidOf(pc) };
  ok(new Set(Object.values(ids)).size === 3, "三个人各有各的编号");

  console.log("== 三、房主点开始：三个人同时进到同一局");
  await pa.click("#rmStart");
  for (const p of [pa, pb, pc]) await p.waitForSelector(".modal.hpm .hp-board", { timeout: 8000 });
  const same = await Promise.all([pa, pb, pc].map(p => p.evaluate(() => [document.querySelector(".hpm .modal-h h2").innerText, document.querySelector(".hp-ep").innerText, document.querySelector(".hp-big").innerText, Array.from(document.querySelectorAll(".hp-setup li")).map(l => l.innerText).join("|")].join(" ## "))));
  ok(same[0] === same[1] && same[1] === same[2] && same[0].includes("第 1 局") && same[0].includes(code), "三个人面前是同一局：同一个标题、同一组设定、同一个开局报价", same[0]);
  await pb.waitForFunction(() => document.querySelectorAll("#rmStrip .rm-chip").length === 3, null, { timeout: 6000 });
  ok((await pb.locator("#rmStrip .rm-chip.me").count()) === 1 && (await txt(pb, "#rmStrip .rm-chip.me")).includes("你"), "上面一行是每个人的进度，自己那一条标着\"你\"");
  await clicks(pa, 4); await pa.waitForTimeout(700);
  await pb.waitForFunction(id => { const c = document.querySelector('#rmStrip .rm-chip[data-who="' + id + '"] .num'); return c && !/^0 \//.test(c.innerText); }, ids.a, { timeout: 6000 });
  const seenA = await txt(pb, `#rmStrip .rm-chip[data-who="${ids.a}"]`);
  ok(/\d+ \/ 30/.test(seenA) && seenA.includes("阿甲"), "别人打到第几回合，实时看得到", seenA.replace(/\s+/g, " "));
  const leak = await pb.evaluate(() => document.querySelector(".modal.hpm").innerText);
  ok(!/这一局的成绩/.test(leak), "没打完的人看不到任何人的成绩");
  await pa.screenshot({ path: SH("room-play.png") });

  console.log("== 四、先打完的人等着；都打完才一起揭晓");
  let c = await clicks(pa, 500); ok(c.done, "房主打完了");
  await pa.waitForSelector("#rmAfter #rmSay"); await pa.waitForTimeout(600);
  ok((await txt(pa, "#rmSay")).includes("还有 2 个人在打") && (await pa.locator("#rmAfter .rm-tab tr.ref").count()) === 0, "先打完的人：被告知还差几个人；这时谁的得分都不显示，连参照规则的也不显示", await txt(pa, "#rmSay"));
  const waitRows = await rows(pa, "#rmAfter .rm-tab");
  ok(waitRows.length === 3 && waitRows.every(r => r.cells[0] === "—") && waitRows.filter(r => r.me)[0].cells[2].includes("等着一起揭晓"), "表里只有各人的状态", JSON.stringify(waitRows));
  const shownOn = B => B.log.filter(m => m.topic.includes("/" + code + "/r/")).length;
  ok(shownOn(B1) === 0 && shownOn(B2) === 0, "中继上还没有任何人的动作：先打完的人只交了封条");
  const sealA = JSON.parse(B1.log.filter(m => m.topic.endsWith("/p/" + ids.a) && m.text).pop().text).d;
  ok(sealA.done === 1 && /^[0-9a-f]{64}$/.test(sealA.h), "封条是一串 SHA-256", sealA.h);
  ok((await pa.locator("#rmStart").count()) === 0 && (await pa.locator("#rmForce").count()) >= 1, "还有人在打：房主不能开下一局，只能选择\"不等了\"");
  c = await clicksOther(pb, 500); ok(c.done, "第二个人打完了"); await pb.waitForTimeout(500);
  ok((await txt(pb, "#rmSay")).includes("还有 1 个人在打"), "第二个人也在等", await txt(pb, "#rmSay"));
  c = await clicks(pc, 7); c = await clicksOther(pc, 500); ok(c.done, "第三个人打完了");
  for (const p of [pa, pb, pc]) await p.waitForFunction(() => document.querySelectorAll("#rmAfter .rm-tab tbody tr:not(.ref) td.num:last-child").length === 3, null, { timeout: 8000 });
  await pa.waitForTimeout(400);
  const res = await Promise.all([pa, pb, pc].map(p => rows(p, "#rmAfter .rm-tab")));
  const key = r => r.filter(x => x.who !== "ref").map(x => x.who + ":" + x.cells[0] + ":" + x.cells[2]).join(",");
  ok(key(res[0]) === key(res[1]) && key(res[1]) === key(res[2]), "三个人看到的是同一张成绩表", key(res[0]));
  ok(res[0].filter(x => x.who === "ref").length >= 2 && (await txt(pa, "#rmSay")).includes("都亮出来了"), "揭晓之后参照规则在同一局上的得分也列出来");
  const mine = await pa.evaluate(() => document.querySelector("#hpMe").innerText.trim());
  ok(res[0].filter(x => x.me)[0].cells[2] === mine, "表里我的得分就是我这一局的得分", mine);
  const exp = await pa.evaluate(([code, ids]) => { const A = window.App, QL = A.QL, R = A.roomNow(), c = R.cfg, hp = QL.humanSizes(c.type, QL.worldDefaults(c.type)).filter(z => z.id === c.z)[0].hp, sp = { type: c.type, hp, seed: c.seed, k: c.k }; const out = {}; Object.keys(ids).forEach(k => { const r = R.room.get("r/" + ids[k]); out[ids[k]] = QL.humanReplay(sp, QL.actsUnpack(r.acts, 999)).score; }); return out; }, [code, ids]);
  const scoreIn = (r, id) => parseFloat(r.filter(x => x.who === id)[0].cells[2].replace("−", "-"));
  ok(Object.keys(exp).every(id => Math.abs(scoreIn(res[1], id) - exp[id]) < 6e-4), "每个人的得分都等于照着他亮出来的动作重放的结果", JSON.stringify(exp));
  await pb.screenshot({ path: SH("room-reveal.png") });

  console.log("== 五、再来一局；有人作弊；房主叫停");
  ok((await pb.locator("#rmStart").count()) === 0 && (await pa.locator("#rmAfter #rmStart").count()) === 1 && (await txt(pa, "#rmAfter #rmStart")).includes("再来一局"), "只有房主能开下一局");
  await pa.click("#rmAfter #rmStart");
  for (const p of [pa, pb, pc]) await p.waitForFunction(() => /第 2 局/.test((document.querySelector(".hp-ep") || {}).innerText || "") && !document.querySelector("#hpMe"), null, { timeout: 8000 });
  ok(true, "三个人一起换到第 2 局，上一局的弹层自动收起");
  const big2 = await Promise.all([pa, pb, pc].map(p => txt(p, ".hp-big")));
  ok(big2[0] === big2[1] && big2[1] === big2[2] && big2[0] !== same[0].split(" ## ")[2], "第 2 局是另外一局，三个人仍然相同", big2.join(" / "));
  // 小乙作弊：打完交了封条之后，把要亮出来的动作偷偷换掉
  await clicksOther(pb, 500); await pb.waitForTimeout(500);
  await pb.evaluate(() => { const R = window.App.roomNow(); R.my.acts = R.my.acts.replace(/0/g, "1"); });
  await clicks(pa, 500); await clicks(pc, 500);
  await pa.waitForFunction(id => { const tr = document.querySelector('#rmAfter .rm-tab tr[data-who="' + id + '"]'); return tr && /作废/.test(tr.innerText); }, ids.b, { timeout: 8000 });
  ok((await txt(pa, `#rmAfter .rm-tab tr[data-who="${ids.b}"]`)).includes("封条对不上"), "亮出来的动作和封条对不上：作废，不排名次", await txt(pa, `#rmAfter .rm-tab tr[data-who="${ids.b}"]`));
  ok((await rows(pa, "#rmAfter .rm-tab")).filter(r => r.who !== "ref" && /^\d+$/.test(r.cells[0])).length === 2, "另外两个人照常排名");
  await pa.waitForFunction(() => !!document.querySelector("#rmAfter #rmStart"), null, { timeout: 4000 });
  await pa.click("#rmAfter #rmStart");
  for (const p of [pa, pb, pc]) await p.waitForFunction(() => /第 3 局/.test((document.querySelector(".hp-ep") || {}).innerText || ""), null, { timeout: 8000 });
  await clicks(pa, 500); await clicks(pb, 500); await pa.waitForTimeout(500);
  await pa.waitForSelector("#rmAfter #rmForce"); await pa.click("#rmAfter #rmForce");
  await pb.waitForFunction(() => document.querySelectorAll("#rmAfter .rm-tab tbody tr:not(.ref) td.num:last-child").length === 2, null, { timeout: 8000 });
  const r3 = await rows(pb, "#rmAfter .rm-tab");
  ok(r3.filter(x => x.who === ids.c)[0].cells[2].includes("还在打") && r3.filter(x => /^\d+$/.test(x.cells[0])).length === 2, "房主叫停：打完的两个人揭晓，没打完的那个标着还在打", JSON.stringify(r3.filter(x => x.who !== "ref")));
  ok((await pa.locator("#rmAfter #rmStart").count()) === 1, "叫停之后房主可以开下一局");

  console.log("== 六、弹层关掉再回来；房主掉线，别人接手；离开");
  await closeTop(pc); await pc.waitForSelector("#rmBack");
  ok((await txt(pc, "#rmBack")).includes("回到这一局"), "打到一半把弹层关了：房间里有一个\"回到这一局\"");
  const tileBefore = await pc.evaluate(() => window.App.roomNow().my.t);
  await pc.click("#rmBack"); await pc.waitForSelector(".modal.hpm .hp-board"); await pc.waitForTimeout(100);
  ok((await pc.evaluate(() => window.App.roomNow().my.t)) === tileBefore && (await txt(pc, ".hp-tile b")).startsWith(String(tileBefore + 1)), "回来接着刚才那一回合", tileBefore);
  await closeTop(pc);
  await pa.context().close();                                   // 房主直接关掉浏览器
  await pb.keyboard.press("Escape"); await pb.waitForTimeout(100);
  await pb.waitForFunction(id => !document.querySelector('.rm-list tr[data-who="' + id + '"]') || /掉线/.test(document.querySelector('.rm-list tr[data-who="' + id + '"]').innerText), ids.a, { timeout: 12000 });
  await pb.waitForSelector("#rmTake", { timeout: 12000 });
  ok(true, "房主走了：其余的人看到他不在了，并且可以接手");
  await pb.click("#rmTake"); await pb.waitForSelector("#rmStart");
  await pc.waitForFunction(id => { const tr = document.querySelector('.rm-list tr[data-who="' + id + '"]'); return tr && /房主/.test(tr.innerText); }, ids.b, { timeout: 8000 });
  ok(true, "接手之后，别人那里房主也换成了他");
  await pb.click("#rmStart"); for (const p of [pb, pc]) await p.waitForFunction(() => /第 4 局/.test((document.querySelector(".hp-ep") || {}).innerText || ""), null, { timeout: 8000 });
  ok((await pb.locator("#rmStrip .rm-chip").count()) === 2, "新房主开的下一局里只有还在场的两个人");
  await clicks(pb, 500); await clicks(pc, 500);
  await pb.waitForFunction(() => document.querySelectorAll("#rmAfter .rm-tab tbody tr:not(.ref) td.num:last-child").length === 2, null, { timeout: 8000 });
  await closeTop(pc); await pc.click("#rmLeave"); await pc.waitForTimeout(600);
  ok((await pc.locator(".modal.rmm").count()) === 0 && (await pc.evaluate(() => window.App.roomNow())) === null, "点离开：房间的弹层收起");
  ok(![...B1.retained.keys()].some(k => k.endsWith("/p/" + ids.c)) && ![...B1.retained.keys()].some(k => k.endsWith("/r/" + ids.c)), "走的时候把自己留在中继上的东西撤掉", [...B1.retained.keys()].join(" "));
  await pb.keyboard.press("Escape"); await pb.waitForTimeout(100);
  await pb.waitForFunction(() => document.querySelectorAll(".rm-list tbody tr").length <= 2, null, { timeout: 8000 });

  console.log("== 七、中继断了会自己连回来；没有这个房间；房间满了");
  B1.drop(); B2.drop();
  await pb.waitForFunction(() => /正在连|[01] \/ 2/.test(document.querySelector("#rmNet").innerText), null, { timeout: 8000 });
  await pb.waitForFunction(() => /2 \/ 2/.test(document.querySelector("#rmNet").innerText), null, { timeout: 20000 });
  ok([...B1.retained.keys()].some(k => k.endsWith("/p/" + ids.b)), "中继断开再连上：自己的状态自动补发");
  const pd = await newPlayer("#room=ZZZZ99"); await pd.waitForSelector("#rmJoinCode"); await pd.fill("#rmNick", "丁"); await pd.click("#rmJoin");
  await pd.waitForFunction(() => /没有找到这个房间/.test((document.querySelector("#rmWait") || {}).innerText || ""), null, { timeout: 12000 });
  ok(true, "房间号不存在：等几秒之后说没有找到");
  await pd.click("#rmLeave").catch(() => {}); await pd.keyboard.press("Escape");
  // 往中继上直接放 8 个"在场的人"，再让丁进这个房间
  const prefix = "strategy-lab/v1/r/" + code + "/", { QLMQ } = require("../src/mq.js");
  const bot = QLMQ.connect(B1.url, {}); await new Promise(r => bot.on("connect", r));
  for (let i = 0; i < 8; i++) bot.publish(prefix + "p/bot" + i, JSON.stringify({ s: Date.now() + i, w: "bot" + i, d: { n: "<img src=x onerror=alert(1)>" + i, at: Date.now(), k: 0, t: 0, T: 0, done: 0, h: "" } }), true);
  await pb.waitForFunction(() => document.querySelectorAll(".rm-list tbody tr").length >= 9, null, { timeout: 8000 });
  ok((await pb.evaluate(() => document.querySelectorAll(".rm-list img").length)) === 0 && (await txt(pb, ".rm-list")).includes("<img"), "别人的名字里写了 HTML：当成纯文字显示，不会变成标签");
  await pd.evaluate(c => window.App.openRoom(c), code); await pd.waitForSelector("#rmJoin"); await pd.click("#rmJoin");
  await pd.waitForSelector("#rmFull", { timeout: 8000 });
  const idD = await uidOf(pd); await pd.waitForTimeout(1500);
  ok((await txt(pd, "#rmFull")).includes("8 个人") && ![...B1.retained.keys()].concat([...B2.retained.keys()]).some(k => k.endsWith("/" + idD)), "房间里已经有 8 个人：进不去，也不会在里面留下自己的名字");
  bot.end();

  console.log("== 八、手机宽度");
  const pe = await newPlayer("", { width: 390, height: 780 }); await pe.evaluate(() => window.App.openRoom()); await pe.waitForSelector("#rmNick"); await pe.fill("#rmNick", "手机上的戊"); await pe.click("#rmCreate"); await pe.waitForSelector("#rmStart");
  const over = async (p, sel) => p.evaluate(sel => { const d = document.documentElement, b = document.querySelector(sel).getBoundingClientRect(); return { doc: d.scrollWidth - d.clientWidth, box: Math.round(b.right) > window.innerWidth || b.left < 0 }; }, sel);
  let o1 = await over(pe, ".modal.rmm .modal-box");
  await pe.screenshot({ path: SH("room-phone.png") });
  await pe.click("#rmStart"); await pe.waitForSelector(".modal.hpm .hp-board"); await clicks(pe, 500); await pe.waitForSelector("#rmAfter .rm-tab"); await pe.waitForTimeout(500);
  let o2 = await over(pe, ".modal.hpm .modal-box");
  ok(o1.doc <= 1 && !o1.box && o2.doc <= 1 && !o2.box, "手机宽度：房间和打完之后的成绩表都不溢出", JSON.stringify([o1, o2]));
  ok((await txt(pe, "#rmSay")).includes("都亮出来了"), "一个人也能开一局：打完直接揭晓");

  const real = logs.filter(l => !/Failed to load resource|WebSocket connection to/.test(l));   // 字体被拦、中继被掐断时控制台会各留一行，那是预料之中的
  console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", real.length ? "\n" + real.join("\n") : "none");
  await t.close(); await B1.close(); await B2.close(); process.exitCode = fail || real.length ? 1 : 0;
})().catch(e => { console.error("TEST CRASHED:", e.message.split("\n").slice(0, 8).join("\n")); process.exit(1); });
