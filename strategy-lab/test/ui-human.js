// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 亲手玩一局：四套玩法在界面里一回合一回合地打，打完和参照规则在同一局上比；成绩累计、存档、清零；手机宽度下不溢出
const path = require("path"), { open, pickWorld } = require("./ui-smoke.js");
const SH = n => path.join(__dirname, "../shots/" + n);
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) { pass++; if (process.env.VERBOSE) console.log("  ok  ", name, d === undefined ? "" : "  " + String(d).slice(0, 200)); } else { fail++; console.log("  FAIL", name, d === undefined ? "" : String(d).slice(0, 600)); } };
(async () => {
  let t = await open({ viewport: { width: 1440, height: 1000 } }), page = t.page, logs = t.logs;
  const idle = async () => { await page.waitForTimeout(150); await page.waitForFunction(() => !window.App.isBusy, null, { timeout: 60000 }); await page.waitForTimeout(100); };
  const txt = sel => page.locator(sel).first().innerText();
  const openHuman = async () => { await page.click("#btnHuman"); await page.waitForSelector(".modal.hpm .hp-board"); await page.waitForTimeout(80); };
  const closeAll = async () => { for (let i = 0; i < 4 && (await page.locator(".modal").count()); i++) { await page.keyboard.press("Escape"); await page.waitForTimeout(80); } };
  const tile = async i => (await page.locator(".hp-tile b").nth(i).innerText()).trim();
  const sizes = () => page.locator(".hp-sizes button").evaluateAll(b => b.map(x => x.innerText.trim() + (x.getAttribute("aria-pressed") === "true" ? "*" : "")));
  const rec = () => page.evaluate(() => { const o = JSON.parse(localStorage.getItem("ql.human.v1") || "null"); return o ? Object.keys(o.rec).map(k => ({ key: k, n: o.rec[k].me.length, base: o.rec[k].base, cur: o.rec[k].cur ? o.rec[k].cur.length : -1, me: o.rec[k].me })) : []; });
  /** 用引擎把同一局、同一套打法重算一遍（界面上该显示的就是这些数）。policy(view, t) 给出动作 */
  const expect = (type, sizeId, k, policyName, arg) => page.evaluate(([type, sizeId, k, policyName, arg]) => {
    const A = window.App, QL = A.QL, z = QL.humanSizes(type, Object.assign({}, A.wp())).filter(x => x.id === sizeId)[0], seed = A.state.world.seed, kit = QL.humanKit(type, z.hp, seed), B = QL.humanEpisode(type, z.hp, seed, k);
    const pol = { lockThr: v => (+v.x.toFixed(2) >= arg ? 1 : 0), secFirstBest: (v, t) => (t >= arg && v.rank === 1 ? 1 : 0), banRound: (v, t) => t % v.pulls.length, coinFrac: v => QL.humanDef("g_coin").frac(v.wealth, Math.floor(v.wealth * arg * 100 + 1e-9) / 100, 1) }[policyName];
    let st = QL.humanStep(B, []), n = 0;
    while (!st.done && n++ < 5000) { const acts = st.acts.slice(); acts[st.t] = pol(st.view, st.t); st = QL.humanStep(B, acts); }
    const refs = {}; QL.humanRefsOn(kit, B, false).forEach(r => { refs[r.id] = r.score; });
    const L = QL.humanLongBatch(kit), by = {}; kit.refs.forEach(r => { by[r.id] = QL.humanLongRef(kit, L, r.id); });
    const star = QL.humanStar(kit, by), f = v => A.gfmt(kit.score, v);
    return { score: st.score, text: kit.score.kind === "prob" ? (st.score ? "✓" : "✗") : f(st.score), star, starText: kit.score.kind === "prob" ? (refs[star] ? "✓" : "✗") : f(refs[star]), starName: kit.refs.filter(r => r.id === star)[0].name, refs, longStar: f(by[star].m), first: B.R[0], T: kit.T, nrefs: kit.refs.length, nmarks: kit.marks.length, why: kit.starWhy };
  }, [type, sizeId, k, policyName, arg]);
  /** 在页面里照同一套打法点到这一局结束（一次点一个按钮，和手点的一样） */
  const playOut = (policyName, arg) => page.evaluate(([policyName, arg]) => {
    const q = s => document.querySelector(s), num = s => parseFloat(String(s).replace("−", "-").replace(/[^0-9.\-]/g, ""));
    let n = 0;
    while (!q("#hpNext") && n++ < 5000) {
      const acts = document.querySelectorAll(".hp-board .hp-acts .hp-act");
      if (policyName === "lockThr") (num(q(".hp-big").textContent) >= arg ? acts[0] : acts[1]).click();
      else if (policyName === "secFirstBest") { const t = parseInt(q(".hp-tile b").textContent, 10) - 1, rank = num(q(".hp-big .num").textContent); (t >= arg && rank === 1 ? acts[0] : acts[1]).click(); }
      else if (policyName === "banRound") { const t = parseInt(q(".hp-tile b").textContent, 10) - 1, arms = document.querySelectorAll(".hp-arm"); arms[t % arms.length].click(); }
      else if (policyName === "coinFrac") { const chips = document.querySelectorAll(".hp-chips .chip"); chips[arg === 0.2 ? 2 : arg === 0.5 ? 3 : arg >= 1 ? 4 : 1].click(); acts[0].click(); }
    }
    return n;
  }, [policyName, arg]);
  const longDone = () => page.waitForFunction(() => { const c = document.querySelector(".hp-tab caption"); return c && !/正在算/.test(c.textContent); }, null, { timeout: 60000 });

  await page.waitForSelector(".crit .big"); await idle();

  // ---------- 0) 入口 ----------
  ok((await page.locator("#btnHuman").count()) === 0, "交易一个资产：没有\"亲手玩一局\"的按钮");
  await page.evaluate(() => window.App.openHuman()); await page.waitForTimeout(150);
  ok(/还不能亲手玩/.test(await txt(".toast")) && /接单与冷却、秘书问题、偏硬币下注、多臂老虎机/.test(await txt(".toast")) && (await page.locator(".modal").count()) === 0, "不支持的玩法：给一句提示，列出能打的四套", await txt(".toast"));
  await pickWorld(page, "g_bold"); await idle();
  ok((await page.locator("#btnHuman").count()) === 0, "翻倍或出局：还不能亲手玩，不出按钮");
  await page.evaluate(() => window.App.openPalette()); await page.fill(".pal-in", "亲手"); await page.waitForTimeout(100);
  ok((await page.locator(".pal-item").count()) === 0, "命令面板里也没有这一条"); await closeAll();
  await pickWorld(page, "g_lock"); await idle();
  ok((await page.locator("#btnHuman").count()) === 1 && (await txt("#btnHuman")) === "亲手玩一局", "接单与冷却：玩法一栏里有\"亲手玩一局\"");
  await page.evaluate(() => window.App.openPalette()); await page.fill(".pal-in", "亲手"); await page.waitForTimeout(100);
  ok(/亲手玩一局（接单与冷却）/.test(await txt(".pal-item")), "命令面板里有这一条", await txt(".pal-item"));
  await page.keyboard.press("Enter"); await page.waitForSelector(".modal.hpm .hp-board");
  ok(/亲手玩一局 · ① 接单与冷却/.test(await txt(".modal.hpm .modal-h h2")), "从命令面板打开"); await closeAll();

  // ---------- 1) 接单与冷却 ----------
  await openHuman();
  let e = await expect("g_lock", "m", 0, "lockThr", 1.3);
  ok((await sizes()).join("|") === "30 回合|60 回合*|120 回合", "三种长度，默认 60 回合（左栏的 2000 回合不给原样打）", (await sizes()).join("|"));
  const chips = await page.locator(".hp-setup li").allInnerTexts();
  ok(chips.join("|") === "60 回合|接一单锁 5 回合|报价：指数分布 Exp(1)，均值是 1|计分：平均每回合收益|种子 7", "设定写在最上面：只改了长度和锁期，分布跟左栏走", chips.join("|"));
  ok((await tile(0)) === "1 / 60" && (await tile(1)) === "0.00" && (await tile(2)) === "0" && (await txt(".hp-ep")) === "第 1 局", "开局：第 1 局，第 1 回合");
  ok((await txt(".hp-big")) === e.first.toFixed(2), "看到的是这一局第 1 回合的报价", (await txt(".hp-big")) + " vs " + e.first);
  ok(/一样多/.test(await txt(".hp-log")) && (await page.locator(".hp-chart canvas").evaluate(c => c.width > 200 && c.height > 100)), "开局有一句说明，图已经画出来");
  await page.keyboard.press("1"); await page.waitForTimeout(60);
  ok((await tile(0)) === "7 / 60" && (await tile(2)) === "1" && (await tile(1)) === e.first.toFixed(2), "按 1 接下：锁着的 5 回合自动过去，下一次问的是第 7 回合", await tile(0));
  ok(/第 1 回合：你接下了 /.test(await txt(".hp-log")) && ((await txt(".hp-log")).match(/、/g) || []).length === 4, "日志里写着接下的那一单，和锁着的时候来过的 5 个报价", await txt(".hp-log"));
  await page.keyboard.press("0"); await page.waitForTimeout(60);
  ok((await tile(0)) === "8 / 60" && /第 7 回合：报价 .*你放过了/.test(await txt(".hp-log")), "按 0 放过：到第 8 回合", await txt(".hp-log"));
  await page.keyboard.down("0"); await page.keyboard.down("0"); await page.keyboard.down("0"); await page.keyboard.up("0"); await page.waitForTimeout(60);
  ok((await tile(0)) === "9 / 60", "按住不放只算一次", await tile(0));
  await page.keyboard.press("x"); await page.keyboard.press("5"); await page.waitForTimeout(40);
  ok((await tile(0)) === "9 / 60", "别的键不起作用");
  // 关掉再打开、刷新页面再打开：都从断开的地方接着打
  await closeAll(); await openHuman();
  ok((await tile(0)) === "9 / 60" && (await tile(2)) === "1", "关掉弹层再打开：还在第 9 回合");
  let r = await rec(); ok(r.length === 1 && r[0].n === 0 && r[0].cur === 8, "打到一半的局存在浏览器里（8 个回合的动作）", JSON.stringify(r));
  await closeAll(); await page.waitForTimeout(600); await page.reload(); await page.waitForSelector(".gscore .big", { timeout: 20000 }); await idle(); await openHuman();
  ok((await tile(0)) === "9 / 60" && (await tile(2)) === "1" && (await tile(1)) === e.first.toFixed(2), "刷新页面再打开：还在第 9 回合，到手的钱没变", await tile(0));
  await closeAll();
  // 清掉这半局，从头按固定门槛 1.3 打完，与引擎重算的逐位相同
  await page.evaluate(() => { localStorage.removeItem("ql.human.v1"); }); await page.reload(); await page.waitForSelector(".gscore .big", { timeout: 20000 }); await idle(); await openHuman();
  ok((await tile(0)) === "1 / 60", "清掉存档：从第 1 回合开始");
  let clicks = await playOut("lockThr", 1.3);
  ok((await page.locator("#hpNext").count()) === 1 && clicks > 5 && clicks <= 60, "打完了：出现\"再来一局\"", clicks + " 次决定");
  ok((await txt("#hpMe")) === e.text && (await txt("#hpStar")) === e.starText && e.star === "dp", "你的得分、先比的那条规则（动态规划）在同一局上的得分，都与引擎重算的一致", (await txt("#hpMe")) + " / " + (await txt("#hpStar")) + " vs " + e.text + " / " + e.starText);
  ok(/同一局/.test(await txt(".hp-side:not(.me) .hp-lab")) && /理论上最好的/.test(await txt(".hp-why")) && /[▲▼≈]/.test(await txt(".hp-gap")), "写明和谁比、为什么先和它比、这一局差多少", await txt(".hp-gap"));
  ok(/你接了 \d+ 单，一共 [\d.]+。提前知道全部报价的话，最多能拿 [\d.]+/.test(await txt(".hp-hind")) && /「动态规划（分布从数据里估）」接了 \d+ 单/.test(await txt(".hp-hind")), "揭晓：事后诸葛亮能拿多少、动态规划接了几单", await txt(".hp-hind"));
  await longDone();
  let rows = await page.locator(".hp-tab tbody tr").evaluateAll(tr => tr.map(x => Array.from(x.children).map(c => c.innerText.trim())));
  ok(rows.length === 1 + e.nrefs + e.nmarks && rows[0][0] === "你" && rows[0][1] === e.text && rows[0][2] === "—" && rows.every(x => x.length === 3), "对照表：你、各条参照、理论值；只打了一局时没有\"平均\"那一栏", JSON.stringify(rows.map(x => x[0])));
  const dpRow = rows.filter(x => /动态规划/.test(x[0]))[0], bound = rows.filter(x => /事后诸葛亮/.test(x[0]))[0];
  ok(dpRow[1] === e.starText && dpRow[2] === e.longStar && /^上界/.test(bound[0]) && parseFloat(bound[1]) >= parseFloat(rows[0][1]) && rows.slice(1, 1 + e.nrefs).every(x => /^\d/.test(x[2])), "对照表里的数：这一局的、长期平均的，都与引擎重算的一致；上界不低于你", JSON.stringify(dpRow));
  ok(/已经打完 1 局，平均 /.test(await txt(".hp-tally")) && /运气占大头/.test(await txt("#hpCum")), "只打了一局：提示多打几局");
  ok((await page.locator(".hp-chart .qc-legend").innerText()).includes("动态规划接下的"), "打完后图上叠出动态规划接的单", await page.locator(".hp-chart .qc-legend").innerText());
  await page.screenshot({ path: SH("human-lock.png") });
  // 图上的提示
  const cv = page.locator(".hp-chart canvas"), bb = await cv.boundingBox();
  await page.mouse.move(bb.x + bb.width * 0.5, bb.y + 60); await page.waitForTimeout(120);
  ok(/第 \d+ 回合/.test(await txt(".hp-chart .qc-tip")) && /报价/.test(await txt(".hp-chart .qc-tip")), "鼠标移到图上有提示", (await txt(".hp-chart .qc-tip")).replace(/\n/g, " "));
  await page.mouse.move(5, 5);
  // 刚打完就按回车：不会一头撞过去
  await page.evaluate(() => { document.getElementById("hpNext").click(); });
  ok((await page.locator("#hpNext").count()) === 1, "刚打完的一瞬间点\"再来一局\"不算数（防止连按回车的人错过结果）");
  r = await rec(); ok(r.length === 1 && r[0].n === 1 && r[0].cur === -1 && Math.abs(r[0].me[0] - e.score) < 1e-12, "打完的这一局记进了存档", JSON.stringify(r));
  await page.waitForTimeout(700); await page.keyboard.press("Enter"); await page.waitForTimeout(100);
  ok((await txt(".hp-ep")) === "第 2 局" && (await tile(0)) === "1 / 60" && (await page.locator("#hpNext").count()) === 0, "过一会儿按回车：开第 2 局");
  const e2 = await expect("g_lock", "m", 1, "lockThr", 1.3);
  ok((await txt(".hp-big")) === e2.first.toFixed(2) && e2.first !== e.first, "第 2 局是另一局");
  await playOut("lockThr", 1.3); await longDone();
  rows = await page.locator(".hp-tab tbody tr").evaluateAll(tr => tr.map(x => Array.from(x.children).map(c => c.innerText.trim())));
  const heads = await page.locator(".hp-tab thead th").allInnerTexts();
  ok(heads.join("|") === "和谁比|这一局|这 2 局的平均|长期平均" && rows.every(x => x.length === 4) && rows[0][1] === e2.text, "打完两局：多出\"这 2 局的平均\"一栏", heads.join("|"));
  const avg = await page.evaluate(([a, b]) => window.App.gfmt({ kind: "num", digits: 4 }, (a + b) / 2), [e.score, e2.score]);
  const avgDp = await page.evaluate(([a, b]) => window.App.gfmt({ kind: "num", digits: 4 }, (a + b) / 2), [e.refs.dp, e2.refs.dp]);
  ok(rows[0][2] === avg && rows.filter(x => /动态规划/.test(x[0]))[0][2] === avgDp, "两局的平均：你的、动态规划的，都对", rows[0][2] + " / " + avg);
  const cum = await txt("#hpCum");
  ok(/已经打完 2 局：你平均 /.test(cum) && cum.includes(avg) && cum.includes(avgDp) && /你比它[高低] [\d.]+ ± [\d.]+。|你和它几乎一样/.test(cum) && /2 倍标准误/.test(cum), "累计：和动态规划在同样两局上的配对差 ± 标准误，并说明分没分出高下", cum);
  // 换长度：各记各的；换回来还是刚才那一局的结果
  await page.click('.hp-sizes [data-size="s"]'); await page.waitForTimeout(100);
  ok((await sizes()).join("|") === "30 回合*|60 回合|120 回合" && (await tile(0)) === "1 / 30" && (await txt(".hp-ep")) === "第 1 局" && (await page.locator(".hp-tally").count()) === 0, "换成 30 回合：另一份记录，从第 1 局开始");
  ok((await page.locator(".hp-setup li").allInnerTexts()).slice(0, 2).join("|") === "30 回合|接一单锁 3 回合", "30 回合的局锁 3 回合");
  await page.keyboard.press("0"); await page.click('.hp-sizes [data-size="m"]'); await page.waitForTimeout(100);
  ok((await page.locator("#hpNext").count()) === 1 && (await txt("#hpMe")) === e2.text && /已经打完 2 局/.test(await txt(".hp-tally")), "换回 60 回合：还是刚打完的那一局");
  await closeAll(); await openHuman();
  ok((await sizes()).join("|") === "30 回合|60 回合*|120 回合", "上次选的长度记得住");
  // 清零：接着打没见过的局
  await page.click("#hpWipe"); await page.waitForTimeout(150);
  const e3 = await expect("g_lock", "m", 2, "lockThr", 1.3);
  r = (await rec()).filter(x => /"T":60/.test(x.key))[0];
  ok(/清零/.test(await txt(".toast")) && (await txt(".hp-ep")) === "第 1 局" && r.n === 0 && r.base === 2 && (await txt(".hp-big")) === e3.first.toFixed(2), "清零：记录归零，但接下来是第三局那一局（打过的不再出现）", JSON.stringify(r));
  await closeAll();

  // ---------- 2) 秘书问题 ----------
  await pickWorld(page, "g_sec"); await idle(); await openHuman();
  ok((await sizes()).join("|") === "10 人|20 人*|50 人|和左栏一样（100 人）", "秘书问题：三种长度，外加原样打左栏的 100 人", (await sizes()).join("|"));
  e = await expect("g_sec", "m", 0, "secFirstBest", 7);
  ok((await tile(0)) === "1 / 20" && (await tile(1)) === "19" && /第 1 名/.test(await txt(".hp-big")) && (await page.locator(".hp-badge").count()) === 0 && /第一个到场/.test(await txt(".hp-board")), "第 1 位：没有人可比");
  ok(!/分数/.test(await txt(".hp-board")) && (await page.locator(".hp-setup li").allInnerTexts()).some(x => x === "你看得到：只能和见过的人比"), "只能和见过的人比：局面里没有分数");
  await page.keyboard.press("0"); await page.keyboard.press("0"); await page.waitForTimeout(60);
  ok((await tile(0)) === "3 / 20" && /第 2 位排第 \d，你放过了/.test(await txt(".hp-log")), "放过两位", await txt(".hp-log"));
  // 中途换长度再换回来：这一局还在原处
  await page.click('.hp-sizes [data-size="s"]'); await page.waitForTimeout(80); ok((await tile(0)) === "1 / 10", "换成 10 人：另一局");
  await page.click('.hp-sizes [data-size="m"]'); await page.waitForTimeout(80); ok((await tile(0)) === "3 / 20", "换回 20 人：还在第 3 位");
  await page.keyboard.press("2"); await page.waitForTimeout(80);
  const afterSkip = await page.evaluate(() => ({ done: !!document.getElementById("hpNext"), rank: document.querySelector(".hp-big .num") ? document.querySelector(".hp-big .num").textContent : "", log: document.querySelector(".hp-log").textContent, badge: !!document.querySelector(".hp-badge") }));
  ok(afterSkip.done || (afterSkip.rank === "第 1 名" && afterSkip.badge && /你放过了第 3 到第 \d+ 位|第 3 位排第 \d+，你放过了/.test(afterSkip.log)), "按 2：一直放过，停在下一个\"目前最好\"的人面前（或者走到头）", JSON.stringify(afterSkip));
  await closeAll(); await page.evaluate(() => localStorage.removeItem("ql.human.v1")); await page.reload(); await page.waitForSelector(".gscore .big", { timeout: 20000 }); await idle(); await openHuman();
  await playOut("secFirstBest", 7);
  ok((await txt("#hpMe")) === e.text && (await txt("#hpStar")) === e.starText && e.star === "cut" && e.text === e.starText, "按\"先看 7 人再选\"打：结果是 ✓ 或 ✗，与那条规则自己打的相同", (await txt("#hpMe")) + " / " + (await txt("#hpStar")));
  ok(/都赢了|都没赢/.test(await txt(".hp-gap")) && /先看 7 人再选/.test(await txt(".hp-side:not(.me) .hp-lab")), "输赢型的得分：写\"都赢了 / 都没赢\"", await txt(".hp-gap"));
  ok(/你选中了全场最好的那一位|你选了第 \d+ 位，他在全场排第 \d+/.test(await txt(".hp-hind")) && /「先看 7 人再选」选的是第 \d+ 位/.test(await txt(".hp-hind")), "揭晓：你选的人在全场排第几，全场最好的是谁", await txt(".hp-hind"));
  ok(/你选的是/.test(await txt(".hp-tiles")) && /他在全场的名次/.test(await txt(".hp-tiles")) && / \/ 20$/.test(await tile(1)), "打完后上面写着选的是谁、全场第几", await txt(".hp-tiles"));
  await page.screenshot({ path: SH("human-sec.png") }); await closeAll();
  // 看得到分数、按名次计分：局面里有分数；没有现成的最优解，先比的那条按长期平均挑
  await page.selectOption("#w-goal", "rank"); await idle(); await page.selectOption("#w-info", "full"); await idle(); await openHuman();
  e = await expect("g_sec", "m", 0, "secFirstBest", 5);
  ok(/他的分数/.test(await txt(".hp-board")) && /0\.\d{3}/.test(await txt(".hp-board")), "看得到分数：局面里写着眼前这个人的分数");
  await playOut("secFirstBest", 5);
  ok((await txt("#hpMe")) === e.text && /^0\.\d{4}$|^1\.0000$/.test(e.text) && (await txt("#hpStar")) === e.starText && e.why === "long" && /长期平均最高的/.test(await txt(".hp-why")) && (await txt(".hp-side:not(.me) .hp-lab")).includes(e.starName), "按名次计分：得分是 0 到 1 之间的数；先比的那条是长期平均最高的参照", (await txt("#hpMe")) + " | " + (await txt(".hp-why")));
  ok(/你选了第 \d+ 位，他在全场 20 个人里排第 \d+/.test(await txt(".hp-hind")), "按名次计分时的揭晓", await txt(".hp-hind"));
  await closeAll(); await page.selectOption("#w-goal", "best"); await idle(); await page.selectOption("#w-info", "rank"); await idle();

  // ---------- 3) 偏硬币下注 ----------
  await pickWorld(page, "g_coin"); await idle(); await openHuman();
  ok((await sizes()).join("|") === "20 次|40 次*|100 次|和左栏一样（300 次）", "偏硬币：可以原样打实验里的 300 次", (await sizes()).join("|"));
  e = await expect("g_coin", "m", 0, "coinFrac", 0.2);
  ok((await tile(0)) === "$25.00" && (await tile(1)) === "40" && (await tile(2)) === "$250" && (await page.inputValue("#hpStake")) === "2.50" && /= 资金的 10\.0%/.test(await txt(".hp-pct")), "开局：本金 25，默认的注码是一成", await page.inputValue("#hpStake"));
  await page.fill("#hpStake", ""); await page.click(".hp-acts .hp-act:nth-child(1)"); await page.waitForTimeout(60);
  ok((await tile(1)) === "40" && /先填一个大于 0 的数/.test(await txt(".hp-pct")), "没填金额就点\"押正面\"：不算，提示先填");
  await page.click(".hp-chips .chip:nth-child(3)"); await page.waitForTimeout(40);
  ok((await page.inputValue("#hpStake")) === "5.00" && /20\.0%/.test(await txt(".hp-pct")), "点 20%：注码变成 5.00");
  await page.keyboard.press("Enter"); await page.waitForTimeout(60);
  const up = e.first > 0;
  ok((await tile(0)) === (up ? "$30.00" : "$20.00") && (await tile(1)) === "39" && new RegExp("第 1 次出了" + (up ? "正面：你押的 \\$5\\.00 押中了，资金变成 \\$30\\.00" : "反面：你押的 \\$5\\.00 没押中，资金变成 \\$20\\.00")).test(await txt(".hp-log")), "回车押正面：结果、输赢和资金都对", await txt(".hp-log"));
  ok((await page.inputValue("#hpStake")) === (up ? "6.00" : "4.00"), "下一次的默认注码照同样的比例（20%）", await page.inputValue("#hpStake"));
  await page.keyboard.down("Enter"); await page.keyboard.down("Enter"); await page.keyboard.down("Enter"); await page.keyboard.up("Enter"); await page.waitForTimeout(60);
  ok((await tile(1)) === "38", "按住回车不放只押一次", await tile(1));
  const w2 = await tile(0);
  await page.click(".hp-acts .hp-act:nth-child(3)"); await page.waitForTimeout(60);
  ok((await tile(0)) === w2 && (await tile(1)) === "37" && /这一次你没有押/.test(await txt(".hp-log")), "这次不押：资金不变，机会少一次", await txt(".hp-log"));
  await page.fill("#hpStake", "1"); await page.click(".hp-acts .hp-act:nth-child(2)"); await page.waitForTimeout(60);
  const flip4 = await page.evaluate(() => { const A = window.App, QL = A.QL, z = QL.humanSizes("g_coin", Object.assign({}, A.wp()))[1]; return QL.humanEpisode("g_coin", z.hp, A.state.world.seed, 0).R[3]; });
  ok(new RegExp("第 4 次出了" + (flip4 > 0 ? "正面：你押的 \\$1\\.00 没押中" : "反面：你押的 \\$1\\.00 押中了")).test(await txt(".hp-log")) && (await page.inputValue("#hpStake")) === "1.00", "押 1 美元反面：输赢与硬币相反；自己填的金额下一次还是它", await txt(".hp-log"));
  // 全押到底
  await page.click(".hp-chips .chip:nth-child(5)"); await page.waitForTimeout(30);
  for (let i = 0; i < 45 && !(await page.locator("#hpNext").count()); i++) { await page.click(".hp-acts .hp-act:nth-child(1)"); await page.waitForTimeout(15); }
  const endW = await tile(0), hind = await txt(".hp-hind");
  ok((endW === "$0.00" && /你在第 \d+ 次输光了/.test(hind)) || (endW === "$250.00" && /你在第 \d+ 次封顶，带走 \$250\.00/.test(hind)), "每次全押：不是输光就是封顶，一局提前结束", endW + " | " + hind);
  ok(/这一局的 40 次里，正面出了 \d+ 次/.test(hind) && /「动态规划（直接最大化期望到手金额）」带走 \$/.test(hind) && (await tile(1)) === "0", "揭晓：正面出了几次、动态规划带走多少", hind);
  // 最后一次只押 1 美分：照样算押了（裁判明细里的比例是单精度的，乘回资金会差一丝，不能因此说成"没押"）
  await page.waitForTimeout(700); await page.click("#hpNext"); await page.waitForTimeout(80);
  await page.evaluate(() => { for (let i = 0; i < 39; i++) document.querySelectorAll(".hp-board .hp-acts .hp-act")[2].click(); });
  ok((await tile(0)) === "$25.00" && (await tile(1)) === "1", "连着 39 次不押：资金原封不动，还剩最后一次");
  await page.fill("#hpStake", "0.01"); await page.keyboard.press("Enter"); await page.waitForTimeout(80);
  const last = await txt(".hp-log"), endW2 = await tile(0);
  ok(/第 40 次出了(正面：你押的 \$0\.01 押中了，资金变成 \$25\.01|反面：你押的 \$0\.01 没押中，资金变成 \$24\.99)。/.test(last) && (endW2 === "$25.01" || endW2 === "$24.99") && (await page.locator("#hpNext").count()) === 1, "最后一次押 1 美分：日志写的是押中或没押中，不是\"没有押\"", last + " | " + endW2);
  await closeAll(); await page.evaluate(() => localStorage.removeItem("ql.human.v1")); await page.reload(); await page.waitForSelector(".gscore .big", { timeout: 20000 }); await idle(); await openHuman();
  await playOut("coinFrac", 0.2); await longDone();
  ok((await txt("#hpMe")) === e.text && (await txt("#hpStar")) === e.starText && e.star === "dp", "每次押两成打完：到手的钱与引擎重算的一致（分毫不差）", (await txt("#hpMe")) + " vs " + e.text);
  rows = await page.locator(".hp-tab tbody tr").evaluateAll(tr => tr.map(x => Array.from(x.children).map(c => c.innerText.trim())));
  const kelly = rows.filter(x => /Kelly/.test(x[0]))[0];
  ok(kelly && Math.abs(parseFloat(kelly[1].replace(/[$,]/g, "")) - e.score) < 0.5 * Math.max(1, e.score) && /^\$\d/.test(kelly[2]), "对照表里\"固定押 20%\"在这一局上的结果与你相近（你押的是取整到分的两成）", JSON.stringify(kelly) + " vs " + e.text);
  await page.screenshot({ path: SH("human-coin.png") }); await closeAll();
  // 不封顶：先和 Kelly 比，并说明为什么
  await page.evaluate(() => { const A = window.App; A.wp().cap = 0; A.renderWorld(); A.afterWorldChange(); }); await idle(); await openHuman();
  ok((await page.locator(".hp-setup li").allInnerTexts()).includes("不封顶") && (await page.locator(".hp-tile").count()) === 2, "不封顶：设定里写明，上面不再有\"封顶\"一格");
  await playOut("coinFrac", 0.1);
  ok(/Kelly/.test(await txt(".hp-side:not(.me) .hp-lab")) && /每次全押，但那样几乎必然输光/.test(await txt(".hp-why")), "不封顶时先和 Kelly 比，并说明期望最大的打法为什么不拿来比", await txt(".hp-why"));
  await closeAll(); await page.evaluate(() => { const A = window.App; A.wp().cap = 250; A.renderWorld(); A.afterWorldChange(); }); await idle();

  // ---------- 4) 多臂老虎机 ----------
  await pickWorld(page, "g_bandit"); await idle(); await openHuman();
  e = await expect("g_bandit", "m", 0, "banRound", 0);
  ok((await sizes()).join("|") === "30 回合|60 回合*|120 回合" && (await page.locator(".hp-arm").count()) === 5 && (await page.locator(".hp-arm kbd").allInnerTexts()).join("") === "12345", "五台机器五张牌，带着数字键的提示");
  await page.keyboard.press("3"); await page.waitForTimeout(60);
  const card3 = await page.locator(".hp-arm").nth(2).innerText(), cls3 = await page.locator(".hp-arm").nth(2).getAttribute("class");
  ok((await tile(0)) === "2 / 60" && /拉了 1 次，中了 [01] 次/.test(card3) && /刚才(中了|没中)/.test(card3) && /hit|miss/.test(cls3) && /第 1 回合：拉了第 3 台，(中了|没中)/.test(await txt(".hp-log")), "按 3 拉第 3 台：牌上记一次，写着刚才中没中", card3.replace(/\n/g, " "));
  ok((await tile(1)) === (/中了 1 次/.test(card3) ? "1" : "0"), "得分跟着走");
  ok((await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-k"))) === "2", "焦点留在刚拉过的那一台上");
  await page.keyboard.press("Enter"); await page.waitForTimeout(60);
  ok((await tile(0)) === "3 / 60" && /拉了 2 次/.test(await page.locator(".hp-arm").nth(2).innerText()), "再按回车：接着拉同一台");
  await page.locator(".hp-arm").nth(0).click(); await page.waitForTimeout(60);
  ok((await tile(0)) === "4 / 60" && /拉了 1 次/.test(await page.locator(".hp-arm").nth(0).innerText()), "点牌也行");
  await closeAll(); await page.evaluate(() => localStorage.removeItem("ql.human.v1")); await page.reload(); await page.waitForSelector(".gscore .big", { timeout: 20000 }); await idle(); await openHuman();
  await playOut("banRound", 0); await longDone();
  ok((await txt("#hpMe")) === e.text && (await txt("#hpStar")) === e.starText && e.why === "long" && e.star === "greedy", "轮流拉打完：得分与引擎重算的一致；60 回合的短局先和\"贪心\"比（它长期平均最高）", (await txt("#hpMe")) + " / " + (await txt(".hp-side:not(.me) .hp-lab")));
  const reveal = await page.locator(".hp-reveal tbody tr").evaluateAll(tr => tr.map(x => Array.from(x.children).map(c => c.innerText.trim())));
  ok(reveal.length === 5 && reveal.filter(x => /（最好）/.test(x[0])).length === 1 && reveal.every(x => x[2] === "12" && /%$/.test(x[1])), "揭晓：各台真实的中奖率、你各拉了 12 次、最好的那台标出来", JSON.stringify(reveal));
  ok(/最好的是第 \d 台，真实的中奖率 \d+%。你拉了它 12 次，占全部回合的 20%/.test(await txt(".hp-hind")) && /「贪心」拉了它 \d+ 次/.test(await txt(".hp-hind")), "揭晓的那两句话", (await txt(".hp-hind")).slice(0, 80));
  rows = await page.locator(".hp-tab tbody tr").evaluateAll(tr => tr.map(x => Array.from(x.children).map(c => c.innerText.trim())));
  ok(rows.filter(x => /^上界/.test(x[0])).length === 2 && rows.filter(x => /^基准/.test(x[0])).length === 1 && (await page.locator(".hp-tab tr.star").innerText()).includes("贪心"), "对照表：基准、参照、上界、理论值都在，先比的那条加粗");
  await page.screenshot({ path: SH("human-bandit.png") }); await closeAll();
  // 有锁：拉过的机器按不了；台数比锁期少时，全都锁着的回合自动作废
  await page.evaluate(() => { const A = window.App, p = A.wp(); p.arms = 2; p.D = 3; A.renderWorld(); A.afterWorldChange(); }); await idle(); await openHuman();
  ok((await page.locator(".hp-setup li").allInnerTexts()).includes("拉过的机器锁 3 回合") && (await page.locator(".hp-arm").count()) === 2, "有锁的设定写在上面");
  await page.keyboard.press("1"); await page.waitForTimeout(60);
  ok((await page.locator(".hp-arm").nth(0).isDisabled()) && /锁着，还要等 3 回合/.test(await page.locator(".hp-arm").nth(0).innerText()) && !(await page.locator(".hp-arm").nth(1).isDisabled()), "拉过的那台锁着，按不了");
  await page.keyboard.press("1"); await page.waitForTimeout(40); ok((await tile(0)) === "2 / 60", "按被锁那台的数字键不起作用");
  await page.keyboard.press("2"); await page.waitForTimeout(60);
  ok((await tile(0)) === "5 / 60" && !(await page.locator(".hp-arm").nth(0).isDisabled()), "两台都锁着的两个回合自动作废，等第 1 台解锁再问", await tile(0));
  await closeAll(); await page.evaluate(() => { const A = window.App, p = A.wp(); p.arms = 5; p.D = 0; A.renderWorld(); A.afterWorldChange(); }); await idle();

  // ---------- 5) 换种子是另一份记录；手册里的入口 ----------
  await pickWorld(page, "g_lock"); await idle();
  await page.evaluate(() => { const A = window.App; A.state.world.seed = 8; A.renderWorld(); A.afterWorldChange(); }); await idle(); await openHuman();
  const e8 = await expect("g_lock", "m", 0, "lockThr", 1.3);
  ok((await txt(".hp-ep")) === "第 1 局" && (await page.locator(".hp-setup li").allInnerTexts()).includes("种子 8") && (await txt(".hp-big")) === e8.first.toFixed(2) && e8.first !== e3.first, "换了种子：另一批对局，另一份记录");
  await page.click(".hp-top .helpbtn"); await page.waitForSelector(".modal.guide"); await page.waitForTimeout(200);
  ok(/接单与冷却/.test(await txt(".gd-title")), "弹层里的小问号通向手册里这套玩法的那一页");
  await page.keyboard.press("Escape"); await page.waitForTimeout(100);
  ok((await page.locator(".modal.hpm").count()) === 1 && (await page.locator(".modal.guide").count()) === 0, "关掉手册，回到这一局");
  await closeAll();
  await page.evaluate(() => { const A = window.App; A.state.world.seed = 7; A.renderWorld(); A.afterWorldChange(); }); await idle();
  await pickWorld(page, "gbm"); await idle();
  await page.evaluate(() => window.App.openGuide("game:g_sec")); await page.waitForSelector(".gd-title"); await page.waitForTimeout(150);
  const gbtn = page.locator('.gd-acts button:has-text("亲手玩一局")');
  ok((await gbtn.count()) === 1, "手册里秘书问题那一页有\"亲手玩一局\"");
  await gbtn.click(); await page.waitForSelector(".modal.hpm .hp-board"); await idle();
  ok((await page.evaluate(() => window.App.state.world.type)) === "g_sec" && /② 秘书问题/.test(await txt(".modal.hpm .modal-h h2")) && (await page.locator(".modal.guide").count()) === 0, "点它：切到秘书问题，打开弹层");
  await closeAll();
  await page.evaluate(() => window.App.openGuide("game:g_news")); await page.waitForTimeout(200);
  ok((await page.locator('.gd-acts button:has-text("亲手玩一局")').count()) === 0, "不能亲手玩的玩法，手册里不出这个按钮"); await closeAll();
  await page.evaluate(() => window.App.openGuide("games")); await page.waitForTimeout(200);
  ok(/这四套可以自己上手/.test(await txt(".gd-art")), "手册的\"怎么开始\"里提到了亲手玩"); await closeAll();
  console.log("desktop logs:", logs.length ? "\n" + logs.join("\n") : "none");
  const nlog = logs.length; await t.close();

  // ---------- 6) 手机宽度：四套都打得动，弹层不横向溢出 ----------
  t = await open({ viewport: { width: 390, height: 800 } }); page = t.page; const logs2 = t.logs;
  await page.waitForSelector(".crit .big"); await idle();
  const probs = [];
  for (const g of ["g_lock", "g_sec", "g_coin", "g_bandit"]) {
    await page.evaluate(g => window.App.setWorldType(g), g); await idle();
    await page.click('#tabs [data-tab="ctl"]'); await page.waitForTimeout(150);
    await page.click("#btnHuman"); await page.waitForSelector(".modal.hpm .hp-board"); await page.waitForTimeout(250);
    const chk = async what => {
      const o = await page.evaluate(() => { const b = document.querySelector(".hpm-box"), d = document.documentElement, bad = []; b.querySelectorAll(".hp-board, .hp-tiles, .hp-top, .hp-setup, .hp-after, .hp-chart, .hp-acts, .hp-arms").forEach(el => { if (el.scrollWidth > el.clientWidth + 1) bad.push(el.className + " +" + (el.scrollWidth - el.clientWidth)); }); const br = b.getBoundingClientRect(); return { doc: d.scrollWidth - d.clientWidth, box: Math.round(br.right) > window.innerWidth || br.left < 0, bad }; });
      if (o.doc > 1 || o.box || o.bad.length) probs.push(g + " " + what + ": " + JSON.stringify(o));
    };
    await chk("开局");
    await playOut(g === "g_lock" ? "lockThr" : g === "g_sec" ? "secFirstBest" : g === "g_coin" ? "coinFrac" : "banRound", g === "g_lock" ? 1.3 : g === "g_sec" ? 7 : g === "g_coin" ? 0.2 : 0);
    await longDone(); await page.waitForTimeout(150); await chk("打完");
    ok((await page.locator("#hpNext").count()) === 1 && (await page.locator(".hp-tab tbody tr").count()) >= 4, `手机宽度 · ${g}：打得完，对照表出来了`);
    if (g === "g_bandit") await page.screenshot({ path: SH("human-phone.png"), fullPage: false });
    await page.keyboard.press("Escape"); await page.waitForTimeout(100);
  }
  ok(probs.length === 0, "手机宽度：弹层里没有横向溢出的东西", probs.join(" || "));
  console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", nlog + logs2.length ? "\n" + logs.concat(logs2).join("\n") : "none");
  await t.close(); process.exitCode = fail || nlog || logs2.length ? 1 : 0;
})().catch(e => { console.error("TEST CRASHED:", e.message.split("\n").slice(0, 6).join("\n")); process.exit(1); });
