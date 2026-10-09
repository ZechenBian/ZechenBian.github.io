// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 第三轮复核时找到的界面缺陷：每一条留一个回归检查。
// "带我去"之后图在眼前；每条规则都有计算量；场景对比的"当前/基准"、截短的条、脚注；进入玩法时换规则；
// 手册搜索的排序；键盘翻下拉框；价格世界的细则带参数；没开过仓的提示；四舍五入成 0 的数；说明里的公式和标点。
const path = require("path"), fs = require("fs"), { open, pickWorld, liveIdle } = require("./ui-smoke.js");
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) pass++; else { fail++; console.log("  FAIL", name, d || ""); } };
const INIT = fs.readFileSync(path.join(__dirname, "mock-claude.js"), "utf8");
(async () => {
  for (const cfg of [{ name: "桌面", viewport: { width: 1440, height: 900 } }, { name: "手机", viewport: { width: 390, height: 800 }, dpr: 2, dark: true }]) {
    const t = await open({ viewport: cfg.viewport, dpr: cfg.dpr, dark: cfg.dark, seedLive: true, init: INIT }), page = t.page, logs = t.logs, phone = cfg.name === "手机";
    const idle = async () => { await page.waitForTimeout(150); await page.waitForFunction(() => !window.App.isBusy, null, { timeout: 120000 }); await page.waitForTimeout(150); };
    const scnDone = async (ms) => { await page.waitForFunction(() => window.App.scn.rows && !window.App.scn.busy, null, { timeout: ms || 180000 }); await page.waitForTimeout(150); };
    const setup = go => page.evaluate(g => window.App.applySetup(g), go);
    const card = id => page.locator(`.card[data-chart="${id}"]`);
    // 一张图是不是在眼前：卡片的顶边落在结果一栏的可见范围里（留出标题和几行内容的位置）
    const inView = id => page.evaluate(id => { const c = document.querySelector('.card[data-chart="' + id + '"]'), p = document.getElementById("paneRes"); if (!c) return { ok: false, why: "no card" }; const r = c.getBoundingClientRect(), pr = p.getBoundingClientRect(), top = r.top - pr.top; return { ok: getComputedStyle(p).display !== "none" && top >= -4 && top < pr.height - 160, top: Math.round(top), h: Math.round(pr.height) }; }, id);
    await page.waitForSelector(".crit .big"); await idle();
    await page.evaluate(() => { const b = document.querySelector("#guideHint button:last-child"); if (b) b.click(); });

    // ---- 1) 五个小实验：点"带我去"之后，要看的那张图在眼前
    for (const [i, id] of [[0, "lev"], [1, "scenes"], [2, "sweep"], [3, "sweep"]]) {
      await page.evaluate(() => window.App.openGuide("start:tour")); await page.waitForTimeout(100);
      await page.locator(`.gd-tour > li >> nth=${i} >> button:has-text("带我去")`).click(); await idle(); await page.waitForTimeout(700);
      const v = await inView(id); ok(v.ok, `${cfg.name}：第 ${i + 1} 个小实验，"${id}"这张图在眼前`, JSON.stringify(v));
    }
    // 点图表架上的一个标签：新打开的图滚到眼前
    await setup({ world: "gbm", std: true, resetW: true, strat: "ma", resetS: true }); await idle();
    if (phone) await page.click('#tabs button[data-tab="res"]');
    await page.evaluate(() => { const A = window.App; if (A.shown().indexOf("dd") >= 0) A.toggleChart("dd"); document.getElementById("paneRes").scrollTop = 0; }); await page.waitForTimeout(100);
    await page.locator('#shelf .chip[data-chart="dd"]').click(); await page.waitForTimeout(500);
    { const v = await inView("dd"); ok(v.ok, `${cfg.name}：点图表架上的"最大回撤分布"，这张图滚到眼前`, JSON.stringify(v)); }
    // 你自己一滚，就不再替你滚回去
    await page.evaluate(() => { const A = window.App; A.applySetup({ world: "gbm", strat: "stop", scenes: "rule", charts: ["scenes"] }); });
    await page.waitForTimeout(250);
    await page.evaluate(() => { const p = document.getElementById("paneRes"); p.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true })); p.scrollTop = 0; });
    await idle(); await page.waitForTimeout(900);
    ok(await page.evaluate(() => document.getElementById("paneRes").scrollTop < 40), `${cfg.name}：自己动手滚过之后，页面不再把图拽回来`, String(await page.evaluate(() => document.getElementById("paneRes").scrollTop)));
    await scnDone();

    if (!phone) {
      // ---- 2) 每条规则下面都有"计算量"一行（十套玩法的四十四条都有）
      const noAlgo = await page.evaluate(() => { const A = window.App, G = window.QL_GUIDE; return A.allStrats().filter(st => !st.src && !G.algo[st.lib || st.id]).map(st => st.id); });
      ok(noAlgo.length === 0, "每条内置规则都有计算量和存储的条目", noAlgo.join(","));
      for (const [w, s] of [["g_bold", "bold_frac"], ["g_exec", "exec_aim"], ["g_coin", "coin_streak"]]) {
        await setup({ world: w, std: true, resetW: true, strat: s, resetS: true }); await idle();
        const an = (await page.locator("#algoNote").innerText()).replace(/\n/g, " | ");
        ok(/计算量 每步 O\(/.test(an) && /存储 O\(/.test(an) && /实测 每步决策/.test(an), `${s}：规则下面有计算量、存储和实测`, an);
      }
      await page.evaluate(() => window.App.openGuide("strat:ash_board")); await page.waitForTimeout(100);
      ok(/要记住的东西/.test(await page.locator(".gd-art").innerText()) && /还要持有几个时段/.test(await page.locator(".gd-art").innerText()), "规则的手册页上也有算法的基础信息");
      await page.keyboard.press("Escape");

      // ---- 3) 场景对比（玩法，这条规则 × 各个场景）：点箭头切到另一个场景，"当前"跟过去，表不标过期
      await setup({ world: "g_lock", std: true, resetW: true, strat: "lock_thr", resetS: true, scenes: "rule", charts: ["scenes"] }); await idle(); await scnDone();
      const before = await page.evaluate(() => document.querySelector('.card[data-chart="scenes"] .hb-row.cur .hb-n').textContent);
      await card("scenes").locator('.hb-row:has-text("均匀分布") .hb-go').click(); await idle(); await page.waitForTimeout(300);
      const after = await page.evaluate(() => { const c = document.querySelector('.card[data-chart="scenes"]'), cur = c.querySelectorAll(".hb-row.cur"); return { n: cur.length, name: cur[0] ? cur[0].querySelector(".hb-n").textContent : "", txt: c.innerText, dist: window.App.wp().dist }; });
      ok(/指数/.test(before) && after.n === 1 && /均匀分布/.test(after.name) && !/上一次的结果/.test(after.txt), "玩法里点箭头切到另一个场景：\"当前\"换到那一行，表不标成过期", JSON.stringify({ before, name: after.name, n: after.n }));
      // 当前的规则就是基准：两个标签都在
      await setup({ world: "g_lock", std: true, resetW: true, strat: "lock_any", resetS: true, scenes: "world", charts: ["scenes"] }); await idle(); await scnDone();
      ok((await card("scenes").locator(".hb-row.cur .tag").innerText()) === "当前 · 基准", "当前的规则就是基准时，两个标签都写", await card("scenes").locator(".hb-row.cur .tag").innerText());
      // 行数少的时候不截短；截短了就有说明
      await setup({ world: "g_sec", std: true, resetW: true, strat: "sec_cut", resetS: true, scenes: "world", charts: ["scenes"] }); await idle(); await scnDone();
      const few = await page.evaluate(() => { const c = document.querySelector('.card[data-chart="scenes"]'); return { rows: c.querySelectorAll(".hb-row").length, clip: c.querySelectorAll(".hb-bar.clip").length, note: c.querySelectorAll(".hb-clipnote").length }; });
      ok(few.rows >= 3 && few.rows < 6 && few.clip === 0 && few.note === 0, "只有几行的时候不截短任何一条", JSON.stringify(few));
      await page.evaluate(() => window.App.openGuide("strat:pipe")); await page.waitForTimeout(150); await liveIdle(page);
      const many = await page.evaluate(() => { const a = document.querySelector(".gd-art"); return { clip: a.querySelectorAll(".hb-bar.clip").length, note: a.querySelector(".hb-clipnote") ? a.querySelector(".hb-clipnote").textContent : "" }; });
      ok(many.clip >= 1 && /截短/.test(many.note), "有条被截短时，表下面写明斜纹是什么意思", JSON.stringify(many));
      await page.keyboard.press("Escape");
      // 下注游戏：有路径破产的行没有标准误，但那不是"只有一条路径"
      await setup({ world: "bet", std: true, resetW: true, strat: "const", resetS: true, scenes: "world", charts: ["scenes"] }); await idle(); await scnDone();
      const betFoot = await card("scenes").locator(".card-f").innerText();
      ok(!/只有一条路径/.test(betFoot) && /2 个标准误/.test(betFoot), "下注游戏的场景对比：脚注不再说\"只有一条路径\"", betFoot.slice(0, 120));
      // 得分带单位的玩法，标题里写出单位
      await setup({ world: "g_exec", std: true, resetW: true, strat: "exec_ac", resetS: true, scenes: "rule", charts: ["scenes"] }); await idle(); await scnDone();
      ok(/期初市值的 %/.test(await card("scenes").locator(".hb-cap").first().innerText()), "大单执行的场景对比：标题里有成本的单位", await card("scenes").locator(".hb-cap").first().innerText());

      // ---- 4) 从价格世界进入一套玩法：规则换成这套玩法自己的
      await setup({ world: "gbm", std: true, resetW: true, strat: "const", resetS: true }); await idle();
      await page.evaluate(() => { window.App.state.last = {}; });
      await pickWorld(page, "g_prop"); await idle();
      const inProp = await page.evaluate(() => ({ s: window.App.state.stratId, sum: document.getElementById("summary").innerText }));
      ok(inProp.s === "prop_fix" && !/逐局相同/.test(inProp.sum), "从几何布朗运动进入自营考核：规则换成这套玩法的默认规则，不再是恰好等于基准的那一条", inProp.s);
      await page.selectOption("#stratSel", "ma"); await idle();
      const warn = await page.locator("#summary .warn").allInnerTexts();
      ok(warn.some(x => /从头到尾没有开过仓/.test(x) && /30 天/.test(x)), "自营考核 + 均线交叉（要回看 50 步，一局只有 30 天）：说明为什么通过率是 0", warn.join(" | ").slice(0, 160));
      await pickWorld(page, "gbm"); await idle(); await pickWorld(page, "g_prop"); await idle();
      ok(await page.evaluate(() => window.App.state.stratId === "ma"), "再回来时，是你上次在这套玩法里用的那条规则");
      await setup({ world: "gbm", std: true, resetW: true, strat: "const", resetS: true }); await idle();
      await page.evaluate(() => { window.App.state.last = {}; window.App.openGuide("game:g_ashare"); }); await page.waitForTimeout(100);
      await page.locator('.gd-art button:has-text("去玩这一套")').click(); await idle();
      ok(await page.evaluate(() => window.App.strat().game === "g_ashare"), "手册里点\"去玩这一套\"：用的是这套玩法自己的规则", await page.evaluate(() => window.App.state.stratId));

      // ---- 5) 手册搜索：标题里有的排在前面
      await page.evaluate(() => window.App.openGuide("start:what")); await page.waitForSelector(".gd-search");
      for (const [q, want] of [["老虎机", /多臂老虎机/], ["报童", /报童问题/], ["止损", /止损/], ["复杂度", /算法对比/], ["均线", /均线/]]) {
        await page.fill(".gd-search", q); await page.waitForTimeout(100); await page.locator(".gd-search").press("Enter"); await page.waitForTimeout(120);
        const ti = await page.locator(".gd-title").innerText(); ok(want.test(ti), `手册里搜"${q}"按回车：打开的是标题里有这个词的那一页`, ti);
      }
      await page.fill(".gd-search", ""); await page.keyboard.press("Escape"); await page.waitForTimeout(100);
      if (await page.locator(".modal.guide").count()) { await page.keyboard.press("Escape"); await page.waitForTimeout(100); }

      // ---- 6) 用键盘在下拉框里上下翻：翻过之后焦点还在下拉框上
      await setup({ world: "gbm", std: true, resetW: true, strat: "const", resetS: true }); await idle();
      await page.focus("#stratSel"); const s0 = await page.inputValue("#stratSel");
      await page.keyboard.press("ArrowDown"); await idle(); const s1 = await page.inputValue("#stratSel"), f1 = await page.evaluate(() => document.activeElement && document.activeElement.id);
      await page.keyboard.press("ArrowDown"); await idle(); const s2 = await page.inputValue("#stratSel"), f2 = await page.evaluate(() => document.activeElement && document.activeElement.id);
      ok(s1 !== s0 && s2 !== s1 && f1 === "stratSel" && f2 === "stratSel", "规则的下拉框：按两次向下键，换了两条规则，焦点一直在下拉框上", [s0, s1, s2, f1, f2].join(" → "));
      await page.focus("#worldType"); const w0 = await page.inputValue("#worldType");
      await page.keyboard.press("ArrowDown"); await idle(); const w1 = await page.inputValue("#worldType"), fw = await page.evaluate(() => document.activeElement && document.activeElement.id);
      ok(w1 !== w0 && fw === "worldType", "世界的下拉框也一样", [w0, w1, fw].join(" → "));

      // ---- 7) 价格世界的"当前的细则"：写出现在的参数；负号是"−"
      await setup({ world: "gbm", std: true, resetW: true, strat: "const", resetS: true }); await idle();
      await page.evaluate(() => window.App.openGuide("now")); await page.waitForTimeout(100);
      let nt = await page.locator(".gd-art").innerText();
      ok(/现在的参数：漂移 μ = 8 %\/年；波动 σ = 20 %\/年/.test(nt) && /仓位被限制在 −1 到 3 之间/.test(nt) && !/ -1 到/.test(nt), "几何布朗运动的细则里有现在的参数，负号写成 −", (nt.match(/现在的参数[^。]*。/) || [""])[0]);
      await page.keyboard.press("Escape"); await setup({ world: "iid", std: true, resetW: true, wp: { dist: "t" }, strat: "const", resetS: true }); await idle();
      await page.evaluate(() => window.App.openGuide("now")); await page.waitForTimeout(100); nt = await page.locator(".gd-art").innerText();
      ok(/分布：Student-t（厚尾）/.test(nt) && /自由度 ν = 3/.test(nt) && !/上涨概率 q/.test(nt), "经典分布的细则里写明选的是哪个分布，只列用得上的参数", (nt.match(/现在的参数[^。]*。/) || [""])[0]);
      await page.evaluate(() => window.App.openGuide("world:jump")); await page.waitForTimeout(100);
      ok(!/默认 -\d/.test(await page.locator(".gd-art").innerText()) && /默认 −5/.test(await page.locator(".gd-art").innerText()), "世界页的参数表里负号也是 −");

      // ---- 8) 四舍五入成 0 的数不带负号；差别小到看不出来的，直说"几乎相同"
      await page.evaluate(() => window.App.openGuide("matrix")); await page.waitForTimeout(150); await page.waitForSelector("#mxDone", { timeout: 500000 }); await liveIdle(page);
      const mxTxt = await page.locator(".gd-art table.mx").first().innerText();
      ok(!/[−-]0\.0(?!\d)/.test(mxTxt), "对照表里没有\"−0.0\"", (mxTxt.match(/.{0,8}[−-]0\.0(?!\d).{0,6}/) || [""])[0]);
      await page.keyboard.press("Escape");
      await setup({ world: "g_lock", std: true, resetW: true, strat: "lock_thr", resetS: true }); await idle();
      const refTxt = await page.locator(".gref").innerText();
      ok(!/[−+]0\.0000 ± 0\.0000/.test(refTxt) && !/−0\.0000/.test(refTxt), "接单与冷却：和自己几乎一样的参照行不写\"+0.0000 ± 0.0000\"", (refTxt.match(/固定门槛[^\n]*\n?[^\n]*\n?[^\n]*/) || [""])[0].replace(/\n/g, " "));
      const fz = await page.evaluate(() => { const C = window.QLChart; return [C.fmtNum(-0.00001, 4), C.fmtPct(-0.000001, 2), C.fmtNum(-0.5, 2), window.App.gdiff({ digits: 4 }, -0.00001), window.App.gdiff({ digits: 4 }, -0.5)]; });
      ok(fz[0] === "0.0000" && fz[1] === "0.00%" && fz[2] === "−0.50" && fz[3] === " 0.0000" && fz[4] === "−0.5000", "数字的写法：-0.00001 写成 0.0000，-0.5 照旧带负号", JSON.stringify(fz));

      // ---- 9) 世界的说明里公式是排版出来的；行内公式后面的句读不会掉到下一行开头
      await setup({ world: "fbm", std: true, resetW: true, strat: "ma", resetS: true }); await idle();
      await page.evaluate(() => { const d = document.getElementById("worldKnown"); if (d) d.open = true; }); await page.waitForTimeout(200);
      const wk = await page.evaluate(() => { const d = document.getElementById("worldKnown"), pane = document.getElementById("paneCtl").getBoundingClientRect(); const wide = [...d.querySelectorAll(".katex .base")].filter(e => e.getBoundingClientRect().right > pane.right + 1).length; const clone = d.cloneNode(true); clone.querySelectorAll(".katex").forEach(e => e.remove()); return { n: d.querySelectorAll(".katex").length, err: d.querySelectorAll(".katex-error").length, wide, raw: /[\^_{}$]/.test(clone.textContent) }; });
      ok(wk.n >= 5 && wk.err === 0 && wk.wide === 0 && !wk.raw, "左栏\"这个世界里已知什么\"：公式排版出来了，窄栏里也不溢出", JSON.stringify(wk));
      for (const key of ["game:g_lock", "start:trust", "strat:kellyest", "game:g_sec"]) {
        await page.evaluate(k => window.App.openGuide(k), key); await page.waitForTimeout(200);
        const orphan = await page.evaluate(() => { const bad = []; document.querySelectorAll(".gd-art .tex.done").forEach(el => { if (el.getAttribute("data-display") === "1") return; const nx = el.nextSibling; if (nx && nx.nodeType === 3 && /^[，。；：、！？）】」』》”’]/.test(nx.nodeValue)) bad.push(nx.nodeValue.slice(0, 6)); }); return { bad, glued: document.querySelectorAll(".gd-art .tex-punct").length }; });
        ok(orphan.bad.length === 0 && orphan.glued > 0, `${key}：行内公式后面的句读都粘在公式上`, JSON.stringify(orphan).slice(0, 160));
      }
      await page.keyboard.press("Escape");

      // ---- 10) 自营考核"没有单日亏损线"的场景真的没有这条线；翻倍或出局的理论曲线不高过大胆下注
      await setup({ world: "g_prop", std: true, resetW: true, strat: "prop_fix", resetS: true, scenes: "rule", charts: ["scenes"] }); await idle(); await scnDone();
      await card("scenes").locator('.hb-row:has-text("没有单日亏损线") .hb-go').click(); await idle();
      await page.evaluate(() => window.App.openGuide("now")); await page.waitForTimeout(100);
      const pn = await page.locator(".gd-art").innerText(); ok(/等于没有这条线/.test(pn) && (await page.evaluate(() => window.App.wp().dayLoss)) === 20, "\"没有单日亏损线\"这个场景：细则里写的也是\"等于没有这条线\"");
      await page.keyboard.press("Escape");
      const tq = await page.evaluate(() => { const QL = window.App.QL, p = 18 / 38, bold = QL.boldQ(0.5, p); let mx = 0, mono = true, prev = -1; for (let s = 0.005; s <= 0.5001; s += 0.00275) { const v = QL.timidQ(0.5, s, p); if (v > mx) mx = v; if (v < prev - 1e-12) mono = false; prev = v; } return { bold, mx, mono }; });
      ok(tq.mx <= tq.bold + 1e-9 && tq.mono, "翻倍或出局：小注的理论曲线单调上升，处处不超过大胆下注", JSON.stringify(tq));
    }
    if (phone) {
      // 在"世界与规则"一页里换成带模型的规则：页面替你打开了模型的几张图，但不把你拽到"结果"那一页去
      await page.click('#tabs button[data-tab="ctl"]'); await pickWorld(page, "ar1"); await idle(); await page.selectOption("#stratSel", "pipe"); await idle(); await page.waitForTimeout(300);
      const st = await page.evaluate(() => ({ tab: document.getElementById("app").dataset.tab, vis: !!document.getElementById("s-model") && document.getElementById("s-model").offsetParent !== null, shown: window.App.shown().indexOf("mdl") >= 0 }));
      ok(st.tab === "ctl" && st.vis && st.shown, "手机上换成带模型的规则：留在\"世界与规则\"一页，模型的图在后台打开了", JSON.stringify(st));
    }
    ok(logs.length === 0, `${cfg.name}：整个过程没有报错`, logs.join(" | ").slice(0, 400));
    await t.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error("TEST CRASHED:", e.message.split("\n").slice(0, 8).join("\n")); process.exit(1); });
