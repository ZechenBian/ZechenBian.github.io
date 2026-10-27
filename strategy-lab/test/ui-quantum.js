// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 三套量子玩法和量子电路谜题在界面里：切过去看结果栏和图，打开谜题面板点格子放门、检验、拿星，再把设定带回玩法；刷新后进度还在；窄屏不溢出
const path = require("path"), { open, pickWorld } = require("./ui-smoke.js");
const SH = n => path.join(__dirname, "../shots/" + n);
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) pass++; else { fail++; console.log("  FAIL", name, d || ""); } };
(async () => {
  const t = await open({ viewport: { width: 1440, height: 1000 } }); const { page, logs } = t;
  const idle = async () => { await page.waitForTimeout(150); await page.waitForFunction(() => !window.App.isBusy, null, { timeout: 90000 }); await page.waitForTimeout(120); };
  const txt = async sel => (await page.locator(sel).first().innerText()).replace(/\s+/g, " ");
  const game = () => page.evaluate(() => { const r = window.App.run, S = window.App.state; return r && r.game ? { world: S.world.type, strat: S.stratId, score: r.game.score, refs: r.game.refs.length, err: r.game.refs.filter(x => x.err).length } : null; });
  await page.waitForSelector(".crit .big"); await idle();

  // 0) 下拉框里多了一组
  const groups = await page.locator("#gameType optgroup").evaluateAll(g => g.map(x => x.label + ":" + x.children.length));
  ok(groups.includes("量子玩法:3"), "玩法的下拉框里有\"量子玩法\"一组，三套", groups.join(","));
  const qopts = await page.locator('#gameType optgroup[label="量子玩法"] option').allInnerTexts();
  ok(qopts.join() === "⑮ Bell 游戏,⑯ 量子搜索,⑰ 炸弹检测", "三套的名字和编号", qopts.join(","));

  // 1) 三套玩法：结果栏、规则、图
  const want = {
    q_bell: { re: /胜率/, base: /都答 0/, lo: 0.845, hi: 0.862, n: 6 },
    q_search: { re: /找到奖品用掉的查询次数/, base: /每次都直接测/, lo: -24.5, hi: -21, n: 5 },
    q_bomb: { re: /平均每颗的得分/, base: /直接看一眼/, lo: 0.91, hi: 0.975, n: 4 }
  };
  for (const k of Object.keys(want)) {
    await pickWorld(page, k); await idle();
    const g = await game(), sum = await txt("#summary"), w = want[k];
    ok(g && g.world === k && g.err === 0 && g.refs >= 3 && w.re.test(sum) && w.base.test(sum) && /理论最优/.test(sum) && !(await page.locator("#summary .warn.err").count()), k + "：结果栏有得分、基准和理论最优", JSON.stringify(g) + " " + sum.slice(0, 160));
    ok(g && g.score > w.lo && g.score < w.hi, k + "：默认规则的得分在理论值附近", g && String(g.score));
    const opts = await page.locator("#stratSel option").count(); ok(opts === w.n, k + "：规则列表是这套玩法自己的", String(opts));
    const chips = await page.locator("#shelf .chip").allInnerTexts();
    ok(chips.includes("单局明细") && chips.includes("参数扫描") && chips.some(c => /^各局(得分|成本)的分布$/.test(c)) && !chips.includes("杠杆曲线") && !chips.includes("收益的分布"), k + "：图表架", chips.join(","));
    await page.waitForFunction(() => window.App.single.data && window.App.single.data.game, null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(350);
    const msgs = await page.locator(".card .qc-msg:visible").allInnerTexts(); ok(msgs.filter(m => /画不出来|出错/.test(m)).length === 0, k + "：图都画得出来", msgs.join(" | "));
    ok((await page.locator("#btnQc").count()) === 1, k + "：规则旁边有\"电路谜题\"按钮");
    await page.screenshot({ path: SH("q-" + k.slice(2) + ".png") });
  }
  // Bell 游戏：辅助栏里的 CHSH 值和"能不能传话"
  await pickWorld(page, "q_bell"); await idle();
  const aux = await page.evaluate(() => window.App.run.game.aux.map(a => a.name + "=" + a.value.toFixed(3)));
  ok(aux.some(a => /^CHSH 值 S/.test(a) && Math.abs(parseFloat(a.split("=").pop()) - 2.828) < 0.03) && aux.some(a => /^Bob 答 1 的比例/.test(a) && Math.abs(parseFloat(a.split("=").pop())) < 0.01), "Bell 游戏：S ≈ 2√2，Bob 一边看不出 Alice 收到了什么", aux.join(" | "));
  // 换成局部隐变量源：同一套角度回到 75%
  await page.selectOption("#w-src", "lhv"); await idle();
  const lhv = await game(); ok(lhv && Math.abs(lhv.score - 0.75) < 0.006, "局部隐变量源：标准角度只赢 75%", lhv && String(lhv.score));
  await page.selectOption("#w-src", "q"); await idle();
  // 参数扫描：φ，峰值在 22.5° 附近，叠着理论曲线
  await page.locator('.card[data-chart="sweep"] button:has-text("开始扫描")').click(); await page.waitForFunction(() => window.App.sweep.res && !window.App.sweep.busy, null, { timeout: 180000 }); await page.waitForTimeout(300);
  const swF = await txt('.card[data-chart="sweep"] .card-f'); ok(/最优点：[^，]*= −?(2[0-5](\.\d+)?|1[89](\.\d+)?)，/.test(swF), "Bell 游戏：扫描 φ，最优点在 22.5° 附近", swF.slice(0, 100));

  // 2) 从 Bell 游戏打开谜题面板：直接落在第十关
  await page.click("#btnQc"); await page.waitForSelector(".modal.qcm .qc-lv");
  const curLv = await page.locator(".qc-lv[aria-current=true]").getAttribute("aria-label");
  ok(/第 10 关/.test(curLv), "从 Bell 游戏打开：落在第十关", curLv);
  ok(/通过 0 \/ 10 关/.test(await txt(".qc-tally")), "一开始一关也没过", await txt(".qc-tally"));
  // 经典的答法：默认全答 0，75%
  ok(/胜率 75\.0%/.test(await txt(".a-cl h4")), "第一步：都答 0 是 75%", await txt(".a-cl h4"));
  await page.click('[data-fk="cl-a01"]'); ok(/胜率 25\.0%/.test(await txt(".a-cl h4")), "改一格答法表：掉到 25%", await txt(".a-cl h4"));
  await page.click('[data-fk="cl-a00"]');
  // 拨四个角度：0、π/4、π/8、−π/8（以 π/16 为一格）
  const setAng = async (k, v) => page.locator("#qcAng-" + k).evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); }, v);
  await page.click("#qcCheck"); ok(/还没成功/.test(await txt(".qc-verdict")), "角度全是 0：不超过 75%，不通过", await txt(".qc-verdict"));
  await setAng("a0", 0); await setAng("a1", 4); await setAng("b0", 2); await setAng("b1", -2);
  ok((await txt(".qc-big")) === "85.36%", "标准角度：85.36%", await txt(".qc-big"));
  ok((await page.locator(".qc-verdict").getAttribute("data-has")) === "0", "改了角度：上一次的检验结果作废");
  await page.click("#qcCheck"); await page.waitForSelector(".qc-verdict .qc-headline");
  const v10 = await txt(".qc-verdict"); ok(/通过/.test(v10) && (await page.locator(".qc-verdict .qc-headline .qc-stars .off").count()) === 0, "检验：通过，三星", v10.slice(0, 80));
  await page.screenshot({ path: SH("q-circuit-chsh.png") });
  // 把角度交给 Bell 游戏的规则
  await page.click("#qcGo"); await page.waitForSelector(".modal.qcm", { state: "detached" }); await idle();
  const bq = await page.evaluate(() => { const S = window.App.state; return { w: S.world.type, s: S.stratId, sp: S.sparams.bell_q, score: window.App.run.game.score }; });
  ok(bq.w === "q_bell" && bq.s === "bell_q" && bq.sp && bq.sp.a0 === 0 && bq.sp.a1 === 45 && bq.sp.b0 === 22.5 && bq.sp.b1 === -22.5 && Math.abs(bq.score - 0.8536) < 0.006, "交给\"纠缠光子 · 四个角度\"：角度换成度，跑出来约 85.4%", JSON.stringify(bq));
  ok(/四个角度（0°、45°、22\.5°、−22\.5°）/.test(await txt(".toast")), "给一句提示，写着拨的角度", await txt(".toast"));

  // 3) 第一关：点格子放门
  await page.evaluate(() => window.App.openQuantum("minus")); await page.waitForSelector(".modal.qcm .qc-cell");
  const place = async (g, c, ws) => { await page.click(`[data-fk="tool-${g}"]`); for (const w of ws) await page.click(`[data-fk="cell-${c}-${w}"]`); };
  await place("H", 0, [0]); await page.click("#qcCheck"); ok(/还没成功/.test(await txt(".qc-verdict")), "第一关：只有 H 是 |+⟩，不通过");
  await page.click('[data-fk="undo"]'); ok(/已撤销/.test(await txt(".modal.qcm")), "撤销：给一句提示");
  await place("X", 0, [0]); await place("H", 1, [0]);
  await page.click("#qcCheck"); const v1 = await txt(".qc-verdict");
  ok(/通过/.test(v1) && (await page.locator(".qc-verdict .qc-headline .qc-stars .off").count()) === 0, "第一关：X 再 H，通过、三星", v1.slice(0, 80));
  await page.click('[data-fk="next"]'); ok(/第 2 关/.test(await page.locator(".qc-lv[aria-current=true]").getAttribute("aria-label")), "下一关");
  // 点黑盒不能删；两比特门要点两下
  await page.evaluate(() => window.App.openQuantum("grover")); await page.waitForSelector('.qc-lv[aria-current=true][aria-label*="第 7 关"]');
  await place("H", 0, [0, 1]); await place("H", 2, [0, 1]); await place("Z", 3, [0, 1]); await place("CZ", 4, [0, 1]); await place("H", 5, [0, 1]);
  await page.click("#qcCheck"); const v7 = await txt(".qc-verdict");
  ok(/通过/.test(v7) && (await page.locator(".qc-verdict .qc-headline .qc-stars .off").count()) === 0, "第七关（四选一）：参考解点出来，三星", v7.slice(0, 120));
  await page.click("#qcGo"); await page.waitForSelector(".modal.qcm", { state: "detached" }); await idle();
  const gs = await page.evaluate(() => { const S = window.App.state, w = S.wparams.q_search || {}; return { w: S.world.type, s: S.stratId, n: w.n, M: w.M, score: window.App.run.game.score }; });
  ok(gs.w === "q_search" && gs.s === "srch_full" && gs.n === 2 && gs.M === 1 && gs.score === -2, "交给 ⑯ 量子搜索：四个盒子、一个奖品，转一步就中（两次查询）", JSON.stringify(gs));
  // 炸弹：8 次 π/16 + 8 颗炸弹
  await page.evaluate(() => window.App.openQuantum("bomb")); await page.waitForSelector('.qc-lv[aria-current=true][aria-label*="第 6 关"]');
  for (let i = 0; i < 8; i++) { await place("R8", 2 * i, [0]); await place("BOMB", 2 * i + 1, [0]); }
  await page.click("#qcCheck"); const v6 = await txt(".qc-verdict");
  ok(/通过/.test(v6) && (await page.locator(".qc-verdict .qc-headline .qc-stars .off").count()) === 0, "第六关（不碰炸弹）：八步转、八颗炸弹，三星", v6.slice(0, 120));
  await page.screenshot({ path: SH("q-circuit-bomb.png") });
  await page.click("#qcGo"); await page.waitForSelector(".modal.qcm", { state: "detached" }); await idle();
  const bz = await page.evaluate(() => { const S = window.App.state; return { w: S.world.type, s: S.stratId, N: (S.sparams.bomb_zeno || {}).N, eps: (S.wparams.q_bomb || {}).eps, score: window.App.run.game.score }; });
  ok(bz.w === "q_bomb" && bz.s === "bomb_zeno" && bz.N === 8 && bz.eps === 0 && bz.score > 0.6 && bz.score < 0.8, "交给 ⑰ 炸弹检测：量子芝诺 N = 8，完美的光路", JSON.stringify(bz));
  ok(/分 N 步转"，N = 8/.test(await txt(".toast")), "提示里写着规则名和 N", await txt(".toast"));

  // 4) 刷新：进度还在；大厅的卡片和 #quantum 地址
  await page.waitForTimeout(400); await page.reload(); await page.waitForSelector(".crit .big, .gsum .big"); await idle();
  ok((await page.evaluate(() => window.App.quantumProgress().done)) === 4, "刷新之后：四关的进度还在", JSON.stringify(await page.evaluate(() => window.App.quantumProgress())));
  await page.click("#btnLobby"); await page.waitForSelector(".modal.lbm .lb-card");
  const lc = page.locator(".lb-card", { hasText: "量子电路谜题" }); ok((await lc.count()) === 1 && /通过 4 \/ 10 关，★ 12 \/ 30/.test((await lc.innerText()).replace(/\s+/g, " ")), "大厅里的卡片写着进度", (await lc.innerText()).replace(/\s+/g, " ").slice(0, 160));
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  await page.evaluate(() => { location.hash = "quantum=teleport"; }); await page.waitForSelector(".modal.qcm .qc-lv");
  ok(/第 9 关/.test(await page.locator(".qc-lv[aria-current=true]").getAttribute("aria-label")), "地址写 #quantum=teleport：直接打开第九关");
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  // 手册里的按钮
  await page.evaluate(() => window.App.openGuide("game:q_search")); await page.waitForSelector(".gd-art h2, .gd-art h1");
  const gb = page.locator('.gd-art button:has-text("量子电路谜题里的那一关")'); ok((await gb.count()) === 1, "手册的玩法页里有去电路谜题的按钮");
  await gb.click(); await page.waitForSelector(".modal.qcm .qc-lv"); ok(/第 7 关/.test(await page.locator(".qc-lv[aria-current=true]").getAttribute("aria-label")), "从 ⑯ 量子搜索的手册页过去：第七关");
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);

  // 5) 窄屏：面板不溢出
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  for (const lv of ["minus", "teleport", "chsh"]) {
    await page.evaluate(lv => window.App.openQuantum(lv), lv); await page.waitForSelector(".modal.qcm .qc-main"); await page.waitForTimeout(250);
    const ov = await page.evaluate(() => { const b = document.querySelector(".modal.qcm .modal-box"), d = document.documentElement; return { box: b.scrollWidth - b.clientWidth, doc: d.scrollWidth - d.clientWidth }; });
    ok(ov.box <= 1 && ov.doc <= 1, lv + "：窄屏下不横向溢出", JSON.stringify(ov));
    await page.screenshot({ path: SH("q-circuit-phone-" + lv + ".png"), fullPage: false });
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  }
  console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", logs.length ? "\n" + logs.join("\n") : "none");
  await t.close(); process.exitCode = fail || logs.length ? 1 : 0;
})().catch(e => { console.error("TEST CRASHED:", e.message.split("\n").slice(0, 6).join("\n")); process.exit(1); });
