// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// "玩法 → 世界 → 规则"两层左栏、四套观测玩法、现算（对照表、手册里的活数字、自检）。
// 这一个测试不用现算的存档：从头算一遍，核对算出来的数、存档和作废，最后把存档留给后面的测试。
const path = require("path"), fs = require("fs"), { open, pickWorld, liveIdle, saveLive } = require("./ui-smoke.js");
const SH = n => path.join(__dirname, "../shots/" + n);
const INIT = fs.readFileSync(path.join(__dirname, "mock-claude.js"), "utf8");
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) pass++; else { fail++; console.log("  FAIL", name, d || ""); } };
const num = s => parseFloat(String(s).replace("−", "-").replace(/[^0-9.\-]/g, ""));
(async () => {
  let t = await open({ viewport: { width: 1440, height: 1000 }, init: INIT }), page = t.page, logs = t.logs;
  const idle = async () => { await page.waitForTimeout(150); await page.waitForFunction(() => !window.App.isBusy, null, { timeout: 90000 }); await page.waitForTimeout(120); };
  const card = id => page.locator(`.card[data-chart="${id}"]`);
  const st = () => page.evaluate(() => { const A = window.App, S = A.state; return { w: S.world.type, s: S.stratId, wp: Object.assign({}, A.wp()), sp: Object.assign({}, A.sp()), game: A.gameOf(), last: S.lastPrice, score: A.run && A.run.game ? A.run.game.score : null, se: A.run && A.run.game ? A.run.game.se : null }; });
  const sendMsg = async txt => { await page.fill("#aiInput", txt); await page.click("#aiSend"); };
  await page.waitForSelector(".crit .big"); await idle();

  // ---- 1) 左栏：玩法在上，世界在下
  const blocks = await page.evaluate(() => Array.from(document.querySelectorAll("aside .blk")).map(b => b.id).join());
  ok(blocks === "blkGame,blkWorld,blkStrat,blkSet", "左栏四块的次序：玩法、世界、规则、交易设定", blocks);
  ok((await page.inputValue("#gameType")) === "trade" && (await page.inputValue("#worldType")) === "gbm" && /交易一个资产/.test(await page.locator("#blkGame").innerText()) && /长期增长率/.test(await page.locator("#blkGame .blurb").innerText()), "第一次打开：玩法是交易一个资产，世界是几何布朗运动");
  ok((await page.locator("#blkGame .fields").count()) === 0 && (await page.locator("#blkWorld #w-mu").count()) === 1, "交易一个资产没有自己的参数；漂移、波动在世界那一块");
  // 换到一套观测玩法
  await pickWorld(page, "ou"); await idle();
  await pickWorld(page, "o_meas"); await idle();
  let s = await st();
  ok(s.w === "o_meas" && s.game === "o_meas" && s.last === "ou" && (await page.locator("#worldType").count()) === 0, "选了测量参数：价格世界的下拉框收起来", JSON.stringify([s.w, s.last]));
  const gIds = await page.evaluate(() => Array.from(document.querySelectorAll("#blkGame [id]")).map(e => e.id).join()), wIds = await page.evaluate(() => Array.from(document.querySelectorAll("#blkWorld [id]")).map(e => e.id).join());
  ok(/w-T\b/.test(gIds) && /w-dur\b/.test(gIds) && !/w-what|w-sigma/.test(gIds), "玩法那一块：采样点数、总时长（题目怎么出）", gIds);
  ok(wIds.indexOf("w-what") === 0 && /w-sigma\b/.test(wIds) && /w-tau\b/.test(wIds) && !/w-T\b/.test(wIds), "世界那一块：换世界的下拉框排最前，后面是这个世界自己的参数", wIds);
  ok((await page.locator("#w-what option").count()) === 4 && (await page.inputValue("#w-what")) === "mu", "测量参数能换四个世界");
  const top = await page.locator("#topWorld").innerText(); ok(/测量参数 · 布朗运动 · 测漂移 μ · 2000 局 × 250 个观测/.test(top), "顶栏写着玩法 · 世界 · 规模", top);
  ok((await page.locator("#stratSel option").count()) === 6 && s.s === "meas_std", "规则换成这套玩法自己的六条，默认是标准估计", s.s);
  const sum1 = await page.locator("#summary").innerText();
  ok(/成本（越低越好）/.test(sum1) && /剩余误差/.test(sum1) && Math.abs(num(await page.locator(".gsum .gscore .big").innerText()) - 3.93) < 0.02 && /理论最优：后验均值/.test(sum1) && /0\.800/.test(sum1) && /4\.000/.test(sum1), "测漂移 · 标准估计：成本 3.93，对照里有公式值 4 和理论最优 0.8", sum1.replace(/\n+/g, " | ").slice(0, 200));
  ok(Math.abs(s.score + 3.929) < 0.01, "引擎里成本记成负数（越高越好），显示时翻回正的", String(s.score));
  // 换世界：同一套玩法，换成测回复速度
  await page.selectOption("#w-what", "kappa"); await idle(); s = await st();
  const wIds2 = await page.evaluate(() => Array.from(document.querySelectorAll("#blkWorld [id]")).map(e => e.id).join()), gIds2 = await page.evaluate(() => Array.from(document.querySelectorAll("#blkGame [id]")).map(e => e.id).join());
  ok(s.w === "o_meas" && s.wp.what === "kappa" && /w-klo\b/.test(wIds2) && !/w-sigma\b/.test(wIds2) && /w-durk\b/.test(gIds2) && !/w-dur\b/.test(gIds2) && s.s === "meas_std", "换成均值回复 · 测回复速度：世界的参数跟着换，规则不动", wIds2 + " / " + gIds2);
  ok(/均值回复 · 测回复速度 κ/.test(await page.locator("#topWorld").innerText()) && s.score < -0.1 && s.score > -0.3, "结果跟着重算", String(s.score));
  const bias = await page.locator("#summary").innerText(); ok(/平均偏差（估计 − 真值）\s*\+?0\.3\d/.test(bias.replace(/\n/g, " ")), "测回复速度：平均偏差约 +0.39（回复显得比实际快）", (bias.match(/平均偏差[^\n]*\n?[^\n]*/) || [""])[0]);
  await page.screenshot({ path: SH("o-meas-kappa.png") });
  // 固定世界的玩法：写一句话，不给下拉框
  await pickWorld(page, "g_sec"); await idle();
  ok((await page.locator("#worldFixed").count()) === 1 && (await page.locator("#worldFixed").innerText()).length > 15 && (await page.locator("#blkWorld select").count()) === 0, "秘书问题的世界是固定的：写明是什么", await page.locator("#worldFixed").innerText().catch(() => ""));
  await pickWorld(page, "g_lock"); await idle();
  ok((await page.locator("#blkWorld #w-dist").count()) === 1 && (await page.locator("#blkGame #w-L").count()) === 1 && (await page.locator("#blkGame #w-dist").count()) === 0, "接单与冷却：报价的分布在世界那一块，锁期在玩法那一块");
  // 回到交易一个资产：世界回到上次在那里用的
  await page.selectOption("#gameType", "trade"); await idle(); s = await st();
  ok(s.w === "ou" && (await page.inputValue("#worldType")) === "ou" && (await page.locator(".crit .big").count()) === 3, "回到交易一个资产：世界回到上次用的均值回复，结果栏回到三种口径", s.w);
  // 存档：刷新之后玩法、世界、上次的价格世界都还在
  await pickWorld(page, "o_det"); await idle(); await page.selectOption("#w-src", "t3"); await idle(); await page.waitForTimeout(700);
  await page.reload(); await page.waitForSelector(".gsum .gscore .big"); await idle(); s = await st();
  ok(s.w === "o_det" && s.wp.src === "t3" && s.last === "ou" && (await page.inputValue("#gameType")) === "o_det" && (await page.inputValue("#w-src")) === "t3", "刷新之后：玩法、世界和上次的价格世界都还在", JSON.stringify([s.w, s.wp.src, s.last]));
  // 命令面板
  await page.keyboard.press("Control+k"); await page.waitForSelector(".pal-in"); await page.fill(".pal-in", "停在最高点"); await page.waitForTimeout(120);
  const pal = await page.locator(".pal-item").allInnerTexts(); ok(pal.some(x => /玩法/.test(x) && /停在最高点/.test(x)), "命令面板里能找到观测玩法", pal.slice(0, 4).join(" | "));
  await page.keyboard.press("Enter"); await idle(); s = await st(); ok(s.w === "o_stop", "回车切过去", s.w);
  await page.keyboard.press("Control+k"); await page.waitForSelector(".pal-in"); await page.fill(".pal-in", "交易 资产"); await page.waitForTimeout(120); await page.keyboard.press("Enter"); await idle(); s = await st();
  ok(s.game === "trade" && s.w === "ou", "命令面板里的「交易一个资产」回到上次的价格世界", s.w);

  // ---- 2) 四套观测玩法逐个过：每一档世界、每一条规则
  const info = await page.evaluate(() => { const QL = window.App.QL; return QL.OBS.map(k => { const w = QL.WORLDS[k]; return { k, name: w.short, wsel: w.wsel, opts: w.params.find(q => q.key === w.wsel).options.map(o => o[0]), score: w.score(QL.worldDefaults(k)).name, rules: window.App.allStrats().filter(x => x.game === k).map(x => x.id) }; }); });
  for (const g of info) {
    await pickWorld(page, g.k); await idle();
    let bad = [];
    for (const o of g.opts) {
      await page.selectOption("#w-" + g.wsel, o); await idle();
      const r = await page.evaluate(() => { const A = window.App, r = A.run; return r && r.game ? { score: r.game.score, se: r.game.se, bad: r.sum.badFrac, refs: r.game.refs.length, err: r.game.refs.filter(x => x.err).map(x => x.err).join("|"), marks: r.game.marks.length, warn: document.querySelectorAll("#summary .warn.err").length } : null; });
      if (!r || !isFinite(r.score) || r.bad || r.err || r.warn || r.refs < 2) bad.push(o + ":" + JSON.stringify(r));
      await page.waitForFunction(() => window.App.single.data && window.App.single.data.game, null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(250);
      const msgs = await page.locator(".card .qc-msg:visible").allInnerTexts(); if (msgs.some(m => /画不出来|出错/.test(m))) bad.push(o + ": " + msgs.join("|"));
    }
    ok(bad.length === 0, `${g.name}：${g.opts.length} 档世界都能跑，对照都算出来了，图都画得出来`, bad.join("; ").slice(0, 300));
    await page.selectOption("#w-" + g.wsel, g.opts[0]); await idle();
    bad = [];
    for (const id of g.rules) { await page.selectOption("#stratSel", id); await idle(); const r = await page.evaluate(() => { const r = window.App.run; return r && r.game ? { score: r.game.score, bad: r.sum.badFrac, warn: document.querySelectorAll("#summary .warn.err").length, algo: (document.getElementById("algoNote") || {}).innerText || "" } : null; }); if (!r || !isFinite(r.score) || r.bad || r.warn || !/计算量/.test(r.algo)) bad.push(id + ":" + JSON.stringify(r)); }
    ok(bad.length === 0, `${g.name}：${g.rules.length} 条内置规则都能跑，规则下面有计算量的一行`, bad.join("; ").slice(0, 300));
    ok((await page.locator("#summary").innerText()).includes(g.score), `${g.name}：结果栏写着这套玩法自己的计分`, g.score);
    const chips = await page.locator("#shelf .chip").allInnerTexts(); ok(chips.length === 7 && chips.includes("单局明细") && chips.includes("参数扫描") && chips.includes("场景对比") && !chips.some(x => /杠杆曲线|模型诊断/.test(x)), `${g.name}：图表架是玩法的七张`, chips.join(","));
    await page.screenshot({ path: SH("o-" + g.k.slice(2) + ".png") });
  }
  // 每一步的那个量是增量时，分布图的名字照实写
  { await pickWorld(page, "o_stop"); await idle(); const chips = await page.locator("#shelf .chip").allInnerTexts(); ok(chips.includes("步长的分布") && !chips.includes("路径的分布"), "停在最高点：分布图画的是步长，名字也叫步长的分布", chips.join(","));
    await pickWorld(page, "o_meas"); await idle(); const c2 = await page.locator("#shelf .chip").allInnerTexts(); ok(c2.includes("增量的分布"), "测量参数：分布图叫增量的分布", c2.join(","));
    await pickWorld(page, "o_det"); await idle(); const c3 = await page.locator("#shelf .chip").allInnerTexts(); ok(c3.includes("读数的分布"), "变点检测：分布图叫读数的分布", c3.join(",")); }
  // 玩法按当前的世界给规则默认值：幅度减半，累积和的参考值跟着减半
  await pickWorld(page, "o_det"); await idle(); await page.selectOption("#w-src", "gauss"); await idle(); await page.selectOption("#stratSel", "det_cusum"); await idle();
  await page.evaluate(() => window.App.applySetup({ world: "o_det", resetW: true, strat: "det_cusum", resetS: true })); await idle(); s = await st();
  ok(Math.abs(s.sp.k - 0.5) < 1e-9 && Math.abs(s.sp.h - 5.47) < 0.01 && Math.abs(-s.score - 11.63) < 0.01, "变点检测 · 幅度 1σ：累积和默认 k = 0.5、h = 5.47，代价 11.63", JSON.stringify([s.sp, s.score]));
  await page.evaluate(() => window.App.applySetup({ world: "o_det", resetW: true, wp: { delta: 0.5 }, strat: "det_cusum", resetS: true })); await idle(); s = await st();
  ok(Math.abs(s.sp.k - 0.25) < 1e-9 && s.sp.h > 6 && -s.score > 20 && -s.score < 30, "幅度 0.5σ：默认 k 变成 0.25，报警线抬高，代价二十几步", JSON.stringify([s.sp, s.score]));
  // 参数扫描叠上理论曲线：测漂移的收缩权重
  await page.evaluate(() => window.App.applySetup({ world: "o_meas", resetW: true, strat: "meas_shrink", resetS: true, charts: ["sweep"] })); await idle();
  await card("sweep").locator('button:has-text("开始扫描")').click(); await page.waitForFunction(() => window.App.sweep && window.App.sweep.res && !window.App.sweep.busy, null, { timeout: 120000 }); await page.waitForTimeout(300);
  const swLegend = await card("sweep").locator(".qc-legend").innerText(), swFoot = await card("sweep").locator(".card-f").innerText(), swBest = num((swFoot.match(/最优点：[^=]*= ([0-9.]+)/) || ["", "NaN"])[1]);
  ok(/理论/.test(swLegend) && Math.abs(swBest - 0.2) <= 0.11 && /成本 0\.8/.test(swFoot), "对收缩权重 w 扫描：成本最低的点在 0.2 附近（约 0.8），图上有理论曲线", swFoot.slice(0, 90) + " | " + swLegend.replace(/\n/g, " "));
  await card("sweep").scrollIntoViewIfNeeded(); await card("sweep").screenshot({ path: SH("o-meas-sweep.png") });
  // 场景对比：这条规则 × 各个场景
  await page.evaluate(() => { window.App.state.copt.scenes = { mode: "rule" }; window.App.applySetup({ world: "o_stop", resetW: true, strat: "stop_sqrt", resetS: true, charts: ["scenes"] }); }); await idle();
  await page.waitForFunction(() => window.App.scn.rows && !window.App.scn.busy && window.App.scn.game, null, { timeout: 180000 }); await page.waitForTimeout(200);
  const scn = await page.evaluate(() => window.App.scn.rows.map(r => ({ n: r.item.name, sc: r.res ? r.res.game.score : null, err: r.err })));
  ok(scn.length === 6 && scn.every(r => !r.err && isFinite(r.sc)), "停在最高点 × 六个场景都跑完了", JSON.stringify(scn.map(r => [r.n, r.sc && +r.sc.toFixed(3)])));
  // Claude 面板：想法和提示词都换成这套玩法的
  await page.evaluate(() => window.App.applySetup({ world: "o_det", resetW: true, claude: true })); await idle();
  const ideas = await page.locator("#aiPanel .idea, #aiIdeas button, .ai-ideas button").allInnerTexts().catch(() => []);
  await sendMsg("用最近 20 个读数的中位数代替平均值"); await page.waitForFunction(() => window.__calls && window.__calls.length >= 1, null, { timeout: 20000 }); await idle();
  const call = await page.evaluate(() => { const c = window.__calls[window.__calls.length - 1]; return typeof c.input === "string" ? c.input : c.input.map(m => m.content).join("\n"); });
  const api = await page.evaluate(() => window.App.QL.WORLDS.o_det.api.slice(0, 60));
  ok(call.includes("变点检测") && call.includes(api) && /正态噪声，幅度已知/.test(call) && call.includes("中位数"), "让 Claude 写规则：提示词带着这套玩法的接口说明和当前的世界", call.slice(0, 160).replace(/\n/g, " ") + " … ideas " + ideas.length);

  // ---- 3) 现算：从头开始
  await page.keyboard.press("Escape");
  const before = await page.evaluate(() => { const A = window.App; return { ready: A.live.ready({ games: true }), busy: A.live.busy(), stored: !!localStorage.getItem("ql.live.v2"), embedded: /"cells":\{"const":\[\[/.test(document.documentElement.innerHTML) }; });
  ok(!before.ready && !before.embedded, "页面里没有事先写好的对照表", JSON.stringify(before));
  // 一页手册：数字先是"…"，算出来之后填上
  const t0 = Date.now();
  await page.evaluate(() => window.App.openGuide("game:o_meas")); await page.waitForSelector(".gd-title");
  const lv0 = await page.evaluate(() => ({ n: document.querySelectorAll(".gd-art .lv").length, wait: document.querySelectorAll(".gd-art .lv.wait").length, prog: document.querySelectorAll(".gd-art td.pend").length, txt: (document.querySelector(".gd-art .lv.wait") || {}).textContent, tip: (document.querySelector(".gd-art .lv.wait") || {}).title }));
  ok(lv0.n >= 12 && lv0.wait >= 10 && lv0.prog >= 20 && lv0.txt === "…" && /现算/.test(lv0.tip), "测量参数一页：十几个活数字先显示成「…」，成绩表里没算的格子是占位的点", JSON.stringify(lv0));
  await page.screenshot({ path: SH("o-live-wait.png") });
  await liveIdle(page);
  const tMeas = Date.now() - t0;
  const lv1 = await page.evaluate(() => { const A = window.App, G = A.matrix.games.o_meas, si = G.scenes.findIndex(x => x.name === "漂移 · 时长 1"), el = document.querySelector('.gd-art .lv[data-live="m.mu1.std"]'); return { wait: document.querySelectorAll(".gd-art .lv.wait").length, okn: document.querySelectorAll(".gd-art .lv.ok").length, txt: el && el.textContent, tip: el && el.title, cell: G.cells.meas_std[si][0], rows: document.querySelectorAll(".gd-art table.mx tbody tr").length, pend: document.querySelectorAll(".gd-art td.pend").length, threads: A.live.threads }; });
  ok(lv1.wait === 0 && lv1.okn >= 12 && Math.abs(num(lv1.txt) - 3.929) < 0.002 && Math.abs(lv1.cell + 3.929) < 0.002 && /现算/.test(lv1.tip), "算完之后填上了数：标准估计 3.929，与表里那一格相同", JSON.stringify(lv1));
  ok(lv1.rows === 6 && lv1.pend === 0 && lv1.threads >= 1, "这一页的成绩表也画出来了（六条规则），用了后台线程", JSON.stringify([lv1.rows, lv1.threads, tMeas + "ms"]));
  ok(!(await page.evaluate(() => window.App.live.ready({ price: true }))), "只算了这一页要用的：价格世界的表还没动");
  await page.locator(".gd-art").screenshot({ path: SH("o-live-meas.png") });
  // 点表里的一格：页面摆成那个场景，规则的参数按那个场景的默认值
  const cell = await page.evaluate(() => { const A = window.App, G = A.matrix.games.o_meas, si = G.scenes.findIndex(x => x.name === "漂移 · 时长 25"), t = document.querySelector(".gd-art table.mx"), ri = Array.from(t.querySelectorAll("tbody tr")).findIndex(tr => /向先验收缩/.test(tr.querySelector("th").textContent)); const b = t.querySelectorAll("tbody tr")[ri].querySelectorAll("td button")[si]; const txt = b.textContent; b.click(); return { txt, want: G.cells.meas_shrink[si][0] }; });
  await idle(); s = await st();
  ok(s.w === "o_meas" && s.s === "meas_shrink" && s.wp.dur === 25 && Math.abs(s.sp.w - 25 / 29) < 0.002 && Math.abs(s.score - cell.want) < 2e-5 && Math.abs(num(cell.txt) + cell.want) < 0.001, "点「漂移 · 时长 25 × 向先验收缩」：时长 25，权重取那个场景的默认值 0.862，结果栏里是同一个数", JSON.stringify([s.wp.dur, s.sp, s.score, cell]));
  // 自检
  const t1 = Date.now();
  await page.evaluate(() => window.App.openGuide("selfcheck")); await page.waitForSelector(".ck-list");
  const NCK = await page.evaluate(() => window.QL_GUIDE.checks.length), allPass = new RegExp(NCK + " 条全部通过");
  const ck0 = await page.evaluate(() => ({ n: document.querySelectorAll(".ck").length, wait: document.querySelectorAll(".ck.wait").length, pass: document.querySelectorAll(".ck.pass").length, sum: (document.getElementById("ckSum") || {}).innerText || "" }));
  ok(NCK === 65 && ck0.n === NCK && ck0.wait > 10 && ck0.pass >= 8 && new RegExp("已核对 \\d+ / " + NCK + " 条").test(ck0.sum), "自检页：六十五条；刚才算过的那些已经判了，其余的在等", JSON.stringify(ck0));
  await page.screenshot({ path: SH("o-check-wait.png") });
  await liveIdle(page);
  const ck1 = await page.evaluate(() => ({ wait: document.querySelectorAll(".ck.wait").length, pass: document.querySelectorAll(".ck.pass").length, fail: Array.from(document.querySelectorAll(".ck.fail")).map(e => e.textContent), sum: document.getElementById("ckSum").innerText, notes: Array.from(document.querySelectorAll(".ck .ck-note")).filter(e => e.textContent).length, groups: Array.from(document.querySelectorAll(".gd-art .gd-sec > h3")).map(e => e.textContent).join("|") }));
  ok(ck1.pass === NCK && ck1.wait === 0 && ck1.fail.length === 0 && allPass.test(ck1.sum), "在这台电脑上算完：" + NCK + " 条全部通过", JSON.stringify({ pass: ck1.pass, fail: ck1.fail, ms: Date.now() - t1 }));
  ok(ck1.notes >= 55 && /价格世界的对照表\|十套玩法\|.*测量参数\|.*预测\|.*变点检测\|.*停在最高点/.test(ck1.groups), "每条写着算出来的数和标准；分成价格世界、十套玩法、四套观测玩法", ck1.groups);
  await page.locator(".gd-art").screenshot({ path: SH("o-check-done.png") });
  // 判定不是摆设：把一条的标准改成过不了的，页面上要标出来
  await page.evaluate(() => { const C = window.QL_GUIDE.checks; C[0].__t = C[0].test; C[0].test = function () { return { ok: false, note: "故意判错" }; }; window.App.openGuide("games"); window.App.openGuide("selfcheck"); });
  await page.waitForSelector(".ck-list"); await page.waitForTimeout(250);
  const ck2 = await page.evaluate(() => ({ fail: document.querySelectorAll(".ck.fail").length, first: document.querySelector(".ck.fail") ? document.querySelector(".ck.fail").textContent : "", sum: document.getElementById("ckSum").innerText }));
  ok(ck2.fail === 1 && /故意判错/.test(ck2.first) && /✗/.test(ck2.first) && new RegExp(NCK + " 条里有 1 条没通过").test(ck2.sum), "有一条不通过时：那一条打叉、写原因，顶上的汇总也改口", JSON.stringify(ck2));
  await page.evaluate(() => { const C = window.QL_GUIDE.checks; C[0].test = C[0].__t; delete C[0].__t; });
  // 对照表：全部算完
  const t2 = Date.now();
  await page.evaluate(() => window.App.openGuide("matrix")); await page.waitForTimeout(400);
  const mx0 = await page.evaluate(() => ({ pend: document.querySelectorAll(".gd-art td.pend").length, prog: (document.querySelector(".gd-art .lv-prog") || {}).textContent || "", tables: document.querySelectorAll(".gd-art table.mx").length }));
  ok(mx0.pend > 60 && /正在这台电脑上现算对照表/.test(mx0.prog) && /后台线程/.test(mx0.prog) && mx0.tables === 15, "对照表：十五张表先摆出来，没算的格子是占位的点，顶上写着进度", JSON.stringify(mx0).slice(0, 200));
  await page.waitForTimeout(2500); await page.locator(".gd-art").screenshot({ path: SH("o-matrix-computing.png") });
  const mid = await page.evaluate(() => ({ pend: document.querySelectorAll(".gd-art td.pend").length, done: window.App.live.done, total: window.App.live.total }));
  ok(mid.pend < mx0.pend && mid.done > 0 && mid.total >= mid.done, "算出一格显示一格：占位的点在减少", JSON.stringify(mid));
  await page.waitForSelector("#mxDone", { timeout: 500000 }); await liveIdle(page);
  const mx1 = await page.evaluate(() => { const A = window.App, M = A.matrix; let holes = 0, nul = 0; M.price.strats.forEach(id => M.price.cells[id].forEach(c => { if (c === undefined) holes++; else if (!c) nul++; })); Object.keys(M.games).forEach(t => { const G = M.games[t]; G.strats.forEach(id => G.cells[id].forEach(c => { if (c === undefined) holes++; else if (!c) nul++; })); }); return { holes, nul, pend: document.querySelectorAll(".gd-art td.pend").length, done: document.getElementById("mxDone").innerText, err: A.live.err, up: document.querySelectorAll(".gd-art td.up").length, down: document.querySelectorAll(".gd-art td.down").length }; });
  ok(mx1.holes === 0 && mx1.nul === 0 && mx1.pend === 0 && !mx1.err && /全部 \d+ 格都算好了/.test(mx1.done) && mx1.up > 80 && mx1.down > 150, "整张对照表在这台电脑上算完，没有算不出来的格子", JSON.stringify(mx1) + " " + (Date.now() - t2) + "ms");
  console.log("   现算用时：测量参数一页 " + tMeas + " 毫秒；整张对照表（余下的部分）" + (Date.now() - t2) + " 毫秒；线程数 " + lv1.threads);
  // 几个格子和引擎直接跑的结果、和手册里说的话对得上
  const spot = await page.evaluate(() => { const M = window.App.matrix, g = (t, sn, id) => { const G = M.games[t], si = G.scenes.findIndex(x => x.name === sn); return G.cells[id][si]; }, pw = k => M.price.worlds.findIndex(w => w.key === k); return { det: g("o_det", "幅度 1σ", "det_dp")[0], stop: g("o_stop", "没有漂移", "stop_dp")[0], nn: g("o_pred", "Logistic", "pred_nn")[0], lock: g("g_lock", M.games.g_lock.scenes[0].name, "lock_thr")[0], stopGbm: M.price.cells.stop[pw("gbm")][1], hmm: M.price.cells.hmm[pw("regime")][1], bench: M.price.worlds[pw("gbm")].bench[0] }; });
  ok(Math.abs(spot.det + 11.52) < 0.02 && Math.abs(spot.stop + 0.686) < 0.002 && spot.nn > 0.99 && Math.abs(spot.lock - 0.134) < 0.002 && spot.stopGbm < -0.005 && spot.hmm > 0.05 && Math.abs(spot.bench - 0.059) < 0.003, "抽查几格：变点检测的动态规划 11.52、停时 0.686、Logistic 最近邻 0.998、接单 0.134、GBM 里止损为负、牛熊切换里隐马尔可夫为正", JSON.stringify(spot));
  const saved = await saveLive(page); ok(saved > 20000, "算完的结果存进了浏览器（留给下次打开）", String(saved));

  // ---- 4) 存档：刷新之后直接读，不用再算；签名对不上就作废
  await page.reload(); await page.waitForSelector(".gsum .gscore .big, .crit .big"); await idle();
  const t3 = Date.now(); await page.evaluate(() => window.App.openGuide("matrix")); await page.waitForSelector("#mxDone", { timeout: 15000 });
  const re = await page.evaluate(() => ({ threads: window.App.live.threads, busy: window.App.live.busy(), pend: document.querySelectorAll(".gd-art td.pend").length, ready: window.App.live.ready({ price: true, games: true }) }));
  ok(re.ready && !re.busy && re.pend === 0 && re.threads === undefined && Date.now() - t3 < 6000, "刷新之后对照表直接从存档里读出来，没有开后台线程", JSON.stringify(re) + " " + (Date.now() - t3) + "ms");
  await page.evaluate(() => window.App.openGuide("selfcheck")); await page.waitForSelector("#ckSum"); await page.waitForTimeout(300);
  ok(allPass.test(await page.locator("#ckSum").innerText()) && !(await page.evaluate(() => window.App.live.busy())), "自检的结果也是直接读出来的（专门跑的那几次实验也存了）", await page.locator("#ckSum").innerText());
  // 全部重算
  await page.locator('#ckSum button:has-text("全部重算")').click(); await page.waitForTimeout(600);
  const rs = await page.evaluate(() => ({ wait: document.querySelectorAll(".ck.wait").length, busy: window.App.live.busy(), stored: !!localStorage.getItem("ql.live.v2") }));
  ok(rs.wait > 20 && rs.busy, "「全部重算」：存档丢掉，重新开始算", JSON.stringify(rs));
  await page.evaluate(() => window.App.live.reset());                      // 不等它算完：把后台线程停掉
  // 签名对不上：旧结果作废
  await page.evaluate(v => { const o = JSON.parse(v); o.sig = "0.0"; localStorage.setItem("ql.live.v2", JSON.stringify(o)); }, fs.readFileSync(path.join(__dirname, ".cache/ui-live.json"), "utf8"));
  await page.reload(); await page.waitForSelector(".gsum .gscore .big, .crit .big"); await idle();
  ok(!(await page.evaluate(() => window.App.live.ready({ game: "o_meas" }))), "存档的签名与现在的引擎对不上时，旧结果不用");
  await page.evaluate(v => localStorage.setItem("ql.live.v2", v), fs.readFileSync(path.join(__dirname, ".cache/ui-live.json"), "utf8"));
  await page.reload(); await page.waitForSelector(".gsum .gscore .big, .crit .big"); await idle();
  ok(await page.evaluate(() => window.App.live.ready({ price: true, games: true })), "签名对得上的存档照用");

  // ---- 5) 手册的新页
  await page.evaluate(() => window.App.openGuide("games")); await page.waitForSelector(".gd-title");
  const gtxt = await page.locator(".gd-art").innerText();
  ok(/总览：玩法、世界、规则/.test(await page.locator(".gd-title").innerText()) && /三层/.test(gtxt) && /一、交易一个资产/.test(gtxt) && /二、十套玩法/.test(gtxt) && /三、四套观测玩法/.test(gtxt), "总览页：三层，三类玩法");
  const rowsG = await page.evaluate(() => Array.from(document.querySelectorAll(".gd-art table.gd-t")).map(t => ({ n: t.querySelectorAll("tbody tr").length, head: Array.from(t.querySelectorAll("thead th")).map(x => x.textContent).join(), empty: Array.from(t.querySelectorAll("tbody tr")).filter(tr => !tr.children[3] || tr.children[3].textContent.trim().length < 2).length })));
  ok(rowsG.length === 2 && rowsG[0].n === 10 && rowsG[1].n === 4 && rowsG.every(r => /能换的世界/.test(r.head) && r.empty === 0), "两张表：十套 + 四套，每一行都写了能换的世界", JSON.stringify(rowsG));
  await page.locator(".gd-art").screenshot({ path: SH("o-guide-games.png") });
  await page.evaluate(() => window.App.openGuide("game:trade")); await page.waitForTimeout(150);
  const tt = await page.locator(".gd-art").innerText(); ok(/交易一个资产/.test(await page.locator(".gd-title").innerText()) && /能换的世界/.test(tt) && /细则/.test(tt) && (await page.locator('.gd-art .gd-a').count()) >= 15, "「交易一个资产」一页：细则，和通往十五个价格世界的链接", String(await page.locator('.gd-art .gd-a').count()));
  await page.evaluate(() => window.App.openGuide("game:o_stop")); await page.waitForTimeout(150); await liveIdle(page);
  const so = await page.locator(".gd-art").innerText();
  ok(/能换的世界/.test(so) && /换一个世界，应该看到什么/.test(so) && /Graversen/.test(so) && /带下划线的数字不是事先写好的/.test(so) && (await page.locator(".gd-art .lv.ok").count()) >= 15 && (await page.locator(".gd-art .gd-card").count()) === 6, "停在最高点一页：能换的世界、应该看到什么（活数字）、结论、六条内置规则", String(await page.locator(".gd-art .lv.ok").count()));
  ok((await page.locator(".gd-art .katex-error").count()) === 0 && (await page.locator(".gd-art .tex:not(.done)").count()) === 0, "公式都排好了");
  await page.locator('.gd-art button:has-text("去玩这一套")').click(); await idle(); s = await st(); ok(s.w === "o_stop" && (await page.locator(".modal.guide").count()) === 0, "「去玩这一套」切到那套玩法，手册收起", s.w);
  // 世界页的"不当价格，当作研究对象"
  await page.evaluate(() => window.App.openGuide("world:ou")); await page.waitForTimeout(150);
  ok(/不当价格，当作研究对象/.test(await page.locator(".gd-art").innerText()) && /洛伦兹线型/.test(await page.locator(".gd-art").innerText()), "均值回复的世界页有「不当价格，当作研究对象」");
  await page.locator('.gd-art .gd-acts button:has-text("测回复速度")').click(); await idle(); s = await st();
  ok(s.w === "o_meas" && s.wp.what === "kappa" && (await page.locator(".modal.guide").count()) === 0, "点「测回复速度」：切到测量参数 · 均值回复", JSON.stringify([s.w, s.wp.what]));
  await page.evaluate(() => window.App.openGuide("world:logistic")); await page.waitForTimeout(150);
  await page.locator('.gd-art .gd-acts button:has-text("提前 5 步")').click(); await idle(); s = await st();
  ok(s.w === "o_pred" && s.wp.src === "logi" && s.wp.h === 5, "Logistic 的世界页 →「提前 5 步」：预测 · Logistic，提前量 5", JSON.stringify([s.w, s.wp.src, s.wp.h]));
  // 规则页：用在哪、算法信息、最优性（带活数字）
  await page.evaluate(() => window.App.openGuide("strat:det_cusum")); await page.waitForTimeout(150); await liveIdle(page);
  const ct = await page.locator(".gd-art").innerText();
  ok(/用在哪/.test(ct) && /Page 1954/.test(ct) && /算法的基础信息/.test(ct) && /最优性/.test(ct) && /Lorden|Moustakides/.test(ct) && (await page.locator(".gd-art .lv.ok").count()) >= 4 && (await page.locator(".gd-art .hb-row").count()) >= 6, "累积和的规则页：用在哪、算法、最优性、各场景的成绩", String(await page.locator(".gd-art .hb-row").count()));
  // 小问号
  await page.keyboard.press("Escape"); await pickWorld(page, "o_pred"); await idle();
  await page.click("#blkGame .helpbtn"); await page.waitForSelector(".gd-title"); ok(/预测/.test(await page.locator(".gd-title").innerText()), "玩法旁的小问号 → 这套玩法的条目"); await page.keyboard.press("Escape");
  await page.click("#btnRules"); await page.waitForSelector(".gd-title"); ok(/预测/.test(await page.locator(".gd-title").innerText()), "「完整的细则与来历」也是"); await page.keyboard.press("Escape");
  await page.evaluate(() => window.App.openGuide("now")); await page.waitForTimeout(120);
  const nowT = await page.locator(".gd-art").innerText(); ok(/当前的细则/.test(await page.locator(".gd-title").innerText()) && /Logistic/.test(nowT) && /技巧分/.test(nowT), "当前的细则跟着这套玩法和世界写", nowT.slice(0, 80).replace(/\n/g, " "));
  await page.keyboard.press("Escape");
  ok(logs.length === 0, "整个过程页面没有报错", logs.slice(0, 5).join(" || "));
  await t.close();

  // ---- 6) 手机宽度：两层左栏和观测玩法不横向溢出
  t = await open({ viewport: { width: 390, height: 800 }, dpr: 2, seedLive: true, init: INIT }); page = t.page; const logs2 = t.logs;
  await page.waitForSelector(".crit .big"); await idle();
  for (const k of ["o_meas", "o_det", "g_lock"]) {
    await page.evaluate(k => window.App.applySetup({ world: k, resetW: true }), k); await idle();
    for (const tab of ["ctl", "res"]) {
      await page.evaluate(tab => window.App.setTab(tab), tab); await page.waitForTimeout(250);
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      ok(o.sw <= o.cw + 1, `手机宽度 · ${k} · ${tab === "ctl" ? "玩法与规则" : "结果"}：不横向溢出`, JSON.stringify(o));
      if (k !== "g_lock") await page.screenshot({ path: SH(`o-phone-${k.slice(2)}-${tab}.png`) });
    }
  }
  await page.evaluate(() => window.App.setTab("ctl")); await page.waitForTimeout(200);
  ok((await page.locator("#gameType").isVisible()) && (await page.locator("#w-dist").isVisible()), "手机上「玩法与规则」一页里，玩法和世界两块都在");
  await page.evaluate(() => window.App.openGuide("selfcheck")); await page.waitForSelector("#ckSum"); await liveIdle(page);
  const ph = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, art: document.querySelector(".gd-art").scrollWidth - document.querySelector(".gd-art").clientWidth, sum: document.getElementById("ckSum").innerText }));
  ok(ph.sw <= ph.cw + 1 && ph.art <= 1 && allPass.test(ph.sum), "手机上的自检页：不溢出，结果读得出来", JSON.stringify(ph));
  ok(logs2.length === 0, "手机宽度下也没有报错", logs2.slice(0, 3).join(" || "));
  await t.close();

  // ---- 7) 上一版留下的存档（没有"上次的价格世界"这一项）：照常打开，两层选择对得上
  const seed = o => INIT + ";try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ql.lab.v1', " + JSON.stringify(JSON.stringify(o)) + "); sessionStorage.setItem('seeded', '1'); } } catch (e) {}";
  t = await open({ viewport: { width: 1280, height: 900 }, init: seed({ v: 1, world: { type: "ou", N: 600, T: 252, K: 252, seed: 3 }, stratId: "meanrev", wparams: { ou: { kappa: 8 } }, sparams: {}, charts: ["equity"] }) }); page = t.page; const logs3 = t.logs;
  await page.waitForSelector(".crit .big", { timeout: 20000 }); await idle(); s = await st();
  ok(s.w === "ou" && s.wp.kappa === 8 && s.s === "meanrev" && (await page.inputValue("#gameType")) === "trade" && (await page.inputValue("#worldType")) === "ou", "上一版的存档（价格世界）：玩法显示成交易一个资产，世界和参数都在", JSON.stringify([s.w, s.wp.kappa, s.s]));
  await pickWorld(page, "o_stop"); await idle(); await page.selectOption("#gameType", "trade"); await idle(); s = await st();
  ok(s.w === "ou", "去一趟观测玩法再回来，还是存档里的那个世界", s.w);
  ok(logs3.length === 0, "没有报错", logs3.slice(0, 3).join(" || ")); await t.close();
  t = await open({ viewport: { width: 1280, height: 900 }, init: seed({ v: 1, world: { type: "g_coin", N: 800, seed: 5 }, stratId: "coin_frac", wparams: { g_coin: { p: 0.55 } }, sparams: { coin_frac: { f: 0.1 } } }) }); page = t.page; const logs4 = t.logs;
  await page.waitForSelector(".gsum .gscore .big", { timeout: 20000 }); await idle(); s = await st();
  ok(s.w === "g_coin" && s.wp.p === 0.55 && s.sp.f === 0.1 && (await page.inputValue("#gameType")) === "g_coin" && (await page.locator("#blkWorld #w-p").count()) === 1, "上一版的存档（十套玩法之一）：玩法、世界的参数、规则的参数都在", JSON.stringify([s.w, s.wp.p, s.sp.f]));
  await page.selectOption("#gameType", "trade"); await idle(); s = await st(); ok(s.w === "gbm", "从没用过价格世界时，回到交易一个资产落在几何布朗运动", s.w);
  ok(logs4.length === 0, "没有报错", logs4.slice(0, 3).join(" || ")); await t.close();

  console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", logs.length + logs2.length + logs3.length + logs4.length ? logs.concat(logs2, logs3, logs4).join("\n") : "none");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("TEST CRASHED:", e.stack || e); process.exit(1); });
