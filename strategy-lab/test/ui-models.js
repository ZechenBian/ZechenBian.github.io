// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 模型层的界面测试：模型规则、诊断图、R² 扫描、杠杆曲线的回放
const path = require("path"), fs = require("fs"), { open, pickWorld, liveIdle } = require("./ui-smoke.js");
const SH = n => path.join(__dirname, "../shots/" + n);
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) { pass++; if (process.env.VERBOSE) console.log("  ok  ", name, d || ""); } else { fail++; console.log("  FAIL", name, d || ""); } };
(async () => {
  const t = await open({ viewport: { width: 1440, height: 900 }, init: fs.readFileSync(path.join(__dirname, "mock-claude.js"), "utf8") }); const { page, logs } = t;
  const idle = async (ms) => { await page.waitForTimeout(80); await page.waitForFunction(() => !window.App.isBusy, null, { timeout: ms || 90000 }); await page.waitForTimeout(150); };
  const sum = async () => (await page.locator("#summary").innerText()).replace(/\n+/g, " | ");
  const setNum = async (id, v) => { await page.fill("#" + id, String(v)); await page.dispatchEvent("#" + id, "change"); };
  const diag = () => page.evaluate(() => { const d = window.App.run && window.App.run.diag; return d ? { r2Train: d.r2Train, r2Valid: d.r2Valid, ic: d.ic, icSE: d.icSE, hit: d.hit, nTrain: d.nTrain, nValid: d.nValid, imp: d.importance, names: d.names, hasPd: !!d.pd, calib: (d.calib || []).length } : null; });
  const growth = () => page.evaluate(() => window.App.run.sum.growth);
  const card = id => page.locator('.card[data-chart="' + id + '"]');
  await page.waitForSelector(".crit .big"); await idle();

  // 1. Logistic 映射 + 流水线：第一次用到模型时自动调出诊断图
  await pickWorld(page, "logistic"); await idle();
  await page.selectOption("#stratSel", "pipe"); await idle();
  ok(await card("mdlfn").count() === 1 && await card("mdl").count() === 1 && await card("mdlcmp").count() === 1, "第一次选模型规则时自动显示诊断图和模型对比");
  ok(/开始对比/.test(await card("mdlcmp").innerText()), "模型对比等用户点了才开始算");
  let d = await diag(); ok(d && d.hasPd && d.calib >= 2, "流水线给出诊断数据", JSON.stringify(d));
  const note0 = await page.locator("#fitNote").innerText(); ok(/另外生成的 500 条路径上拟合，用时/.test(note0) && /没见过/.test(note0), "规则下方说明模型在另一批路径上拟合", note0);
  // 水平特征 + OLS：R² ≈ ½
  await page.selectOption("#s-feat", "level"); await idle(); await setNum("s-lags", 1); await idle();
  d = await diag(); ok(Math.abs(d.r2Valid - 0.5) < 0.05, "Logistic · 水平特征 · OLS：验证集 R² ≈ ½", "R² = " + d.r2Valid.toFixed(4)); console.log("  logistic OLS(level): R² train/valid =", d.r2Train.toFixed(4), d.r2Valid.toFixed(4));
  const gOls = await growth();
  // 换成 k 近邻：R² → 1，并且学到的函数贴着真值抛物线
  await page.selectOption("#s-model", "knn"); await idle();
  d = await diag(); ok(d.r2Valid > 0.97, "Logistic · k 近邻：验证集 R² 接近 1", "R² = " + d.r2Valid.toFixed(4)); console.log("  logistic kNN(level): R² train/valid =", d.r2Train.toFixed(4), d.r2Valid.toFixed(4), " g:", (await growth()).toFixed(3), "vs OLS", gOls.toFixed(3));
  ok(await growth() > gOls, "预测得更准，增长率也更高");
  const fnInfo = await page.evaluate(() => { const A = window.App, pd = A.run.diag.pd, wp = A.wp(), v = wp.v / 100, sd = 0.35355339; let worst = 0, span = 0; const ty = pd.xs.map(x => { const u = 0.5 + sd * x / v, u2 = wp.a * u * (1 - u); return Math.exp(v * (u2 - 0.5) / sd - x) - 1; }); const lo = Math.min.apply(null, ty), hi = Math.max.apply(null, ty); span = hi - lo; pd.xs.forEach((x, i) => { worst = Math.max(worst, Math.abs(pd.yhat[i] - ty[i])); }); return { worst, span, n: pd.xs.length, legend: document.querySelector('.card[data-chart="mdlfn"]').innerText }; });
  ok(fnInfo.worst < 0.08 * fnInfo.span, "学到的函数贴着真实的条件期望", `最大偏差 ${(fnInfo.worst / fnInfo.span * 100).toFixed(1)}% 的量程`); ok(/真实的条件期望/.test(fnInfo.legend), "图例里有真值曲线");
  await card("mdlfn").scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await card("mdlfn").screenshot({ path: SH("m-fn-logistic-knn.png") }); await card("mdl").screenshot({ path: SH("m-diag-logistic-knn.png") });
  // 表格视图
  await card("mdlfn").locator('button:has-text("表格")').click(); ok(await card("mdlfn").locator("table.data tr").count() > 5, "学到的函数：表格视图有数据"); await card("mdlfn").locator('button:has-text("表格")').click(); ok(await card("mdlfn").locator("canvas").first().isVisible(), "再点一次回到图");
  // 特征重要性
  await setNum("s-lags", 3); await idle(); await page.evaluate(() => window.App.toggleChart("mdlimp")); await page.waitForTimeout(300);
  d = await diag(); ok(d.imp && d.imp.length === 3 && d.imp[0] > 3 * Math.max(Math.abs(d.imp[1]), Math.abs(d.imp[2]), 1e-6), "置换重要性：当前水平最重要", JSON.stringify(d.imp.map(x => +x.toFixed(4))));
  await card("mdlimp").scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await card("mdlimp").screenshot({ path: SH("m-imp-logistic.png") });
  await setNum("s-lags", 1); await idle();

  // 2. 参数扫描：预测力 R² 随 k 的变化（训练 vs 验证）
  await page.evaluate(() => { if (window.App.state.charts.indexOf("sweep") < 0) window.App.toggleChart("sweep"); }); await page.waitForTimeout(300);
  const sw = card("sweep"); const axOpts = await sw.locator("select").first().locator("option").allInnerTexts(); ok(axOpts.some(o => /近邻数/.test(o)) && !axOpts.some(o => /岭惩罚|树的深度|隐层/.test(o)), "扫描的参数表只列当前模型用得到的参数", axOpts.join(","));
  ok(await sw.locator('.seg button:has-text("预测力 R²")').count() === 1, "扫描的口径里出现\"预测力 R²\"");
  await sw.locator('.seg button:has-text("预测力 R²")').click(); await sw.locator("select").first().selectOption("k"); await sw.locator('button:has-text("开始扫描")').click();
  await page.waitForFunction(() => window.App.sweep.res && !window.App.sweep.busy, null, { timeout: 240000 }); await page.waitForTimeout(400);
  const swr = await page.evaluate(() => { const m = window.App.sweep.res, a = window.App.sweep.axes[0]; return { xs: a.values, tr: Array.from(m.r2Train), va: Array.from(m.r2Valid), g: Array.from(m.growth) }; });
  ok(swr.va.every(v => v === v) && swr.tr.every(v => v === v), "扫描返回每个取值的训练/验证 R²"); ok(swr.tr[0] >= swr.va[0] - 1e-6, "k 最小时训练 R² 不低于验证 R²");
  console.log("  sweep k:", swr.xs.map((x, i) => `${x}:${swr.tr[i].toFixed(3)}/${swr.va[i].toFixed(3)}`).join("  "));
  await sw.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await sw.screenshot({ path: SH("m-sweep-r2-k.png") });
  ok(/训练集 R²|过拟合/.test(await sw.innerText()), "R² 扫描图有训练/验证的说明");

  // 3. AR(1)：OLS 的 R² ≈ φ²，真值是一条直线
  await pickWorld(page, "ar1"); await idle(); await setNum("w-phi", 0.2); await idle();
  await page.selectOption("#s-feat", "ret"); await idle(); await page.selectOption("#s-model", "ols"); await idle();
  d = await diag(); ok(Math.abs(d.r2Valid - 0.04) < 0.012, "AR(1) φ=0.2 · OLS：验证集 R² ≈ φ² = 0.04", "R² = " + d.r2Valid.toFixed(4)); ok(Math.abs(d.ic - 0.2) < 0.03, "IC ≈ φ", "IC = " + d.ic.toFixed(3));
  const ar = await page.evaluate(() => { const A = window.App, pd = A.run.diag.pd, wp = A.wp(), m = wp.mu / 100 / A.worldCfg().K; let w = 0; pd.xs.forEach((x, i) => { w = Math.max(w, Math.abs(pd.yhat[i] - (m + wp.phi * (x - m)))); }); const span = (pd.xs[pd.xs.length - 1] - pd.xs[0]) * wp.phi; return { w, span, txt: document.querySelector('.card[data-chart="mdlfn"]').innerText }; });
  ok(ar.w < 0.12 * ar.span && /真实的条件期望/.test(ar.txt), "AR(1)：学到的直线贴着真值", `偏差 ${(ar.w / ar.span * 100).toFixed(1)}%`);
  console.log("  ar1 OLS: R² train/valid =", d.r2Train.toFixed(4), d.r2Valid.toFixed(4), "IC", d.ic.toFixed(3), "±", d.icSE.toFixed(3), " g =", (await growth()).toFixed(3));
  await card("mdlfn").scrollIntoViewIfNeeded(); await page.waitForTimeout(250); await card("mdlfn").screenshot({ path: SH("m-fn-ar1-ols.png") }); await card("mdl").screenshot({ path: SH("m-diag-ar1-ols.png") });
  // k 近邻的 k：经典的"训练 R² 随 k 变小而升高，验证 R² 先升后降"
  await page.selectOption("#s-model", "knn"); await idle(); await setNum("s-lags", 1); await idle();
  ok((await sw.locator("select").first().locator("option").allInnerTexts()).some(o => /近邻数/.test(o)), "换了模型，扫描的参数表跟着换");
  await sw.locator("select").first().selectOption("k"); await sw.locator('button:has-text("开始扫描")').click(); await page.waitForFunction(() => window.App.sweep.res && !window.App.sweep.busy, null, { timeout: 240000 }); await page.waitForTimeout(400);
  const sk = await page.evaluate(() => { const m = window.App.sweep.res, a = window.App.sweep.axes[0]; return { xs: a.values, tr: Array.from(m.r2Train), va: Array.from(m.r2Valid) }; });
  console.log("  ar1 sweep k:", sk.xs.map((x, i) => `${x}:${sk.tr[i].toFixed(3)}/${sk.va[i].toFixed(3)}`).join("  "));
  ok(sk.tr[0] > 0.99 && sk.va[0] < -0.5, "k = 1：训练 R² = 1，验证 R² 远小于 0", `${sk.tr[0].toFixed(3)} / ${sk.va[0].toFixed(3)}`);
  const last = sk.xs.length - 1; ok(sk.va[last] > 0.015 && sk.tr[last] - sk.va[last] < 0.03, "k 很大：两者靠拢，验证 R² 接近线性模型的水平", `${sk.tr[last].toFixed(3)} / ${sk.va[last].toFixed(3)}`);
  await sw.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await sw.screenshot({ path: SH("m-sweep-r2-k-ar1.png") });
  await page.selectOption("#s-model", "ols"); await idle();
  // 模型对比：十个模型在同一批路径上各跑一遍
  const cmp = card("mdlcmp"); await cmp.scrollIntoViewIfNeeded(); await cmp.locator('button:has-text("开始对比")').click();
  await page.waitForFunction(() => window.App.arena.res && !window.App.arena.busy, null, { timeout: 300000 }); await page.waitForTimeout(400);
  const arn = await page.evaluate(() => { const m = window.App.arena.res; return { n: m.nx, va: Array.from(m.r2Valid), tr: Array.from(m.r2Train), g: Array.from(m.growth), to: Array.from(m.turnover), ic: Array.from(m.ic) }; });
  ok(arn.n === 10 && arn.va.every(v => v === v) && arn.g.every(v => v === v) && arn.to.every(v => v >= 0), "模型对比：十个模型都有结果", JSON.stringify(arn.va.map(v => +v.toFixed(3))));
  ok(Math.abs(arn.va[1] - 0.033) < 0.012 && arn.va[0] === 0 && arn.g[1] > arn.g[0] + 0.2, "模型对比的数值与单独运行一致（OLS 的 R² 与增长率）", `R² ${arn.va[1].toFixed(4)}  g ${arn.g[1].toFixed(3)} vs 均值 ${arn.g[0].toFixed(3)}`);
  console.log("  arena AR(1): R²(valid) " + arn.va.map(v => v.toFixed(3)).join(" ") + " | g " + arn.g.map(v => v.toFixed(2)).join(" "));
  await page.waitForTimeout(300); await cmp.screenshot({ path: SH("m-arena-ar1.png") });
  ok(/验证集 R² 最高/.test(await cmp.innerText()) && /重新对比/.test(await cmp.innerText()), "模型对比有结论和选择偏差的提醒");
  // 点图上的某个模型 → 换成它，对比结果仍然有效
  const box = await cmp.locator("canvas").first().boundingBox(); const geo = await page.evaluate(() => { const c = [...document.querySelectorAll('.card[data-chart="mdlcmp"] canvas')][0]; return { w: c.clientWidth }; });
  await page.mouse.move(box.x + box.width * 0.52, box.y + 60); await page.waitForTimeout(150); const tipTxt = await cmp.locator(".qc-tip").innerText().catch(() => ""); await page.mouse.click(box.x + box.width * 0.52, box.y + 60); await idle();
  const picked = await page.inputValue("#s-model"); ok(picked !== "ols" && /验证集 R²/.test(tipTxt), "点图上的模型就换成它", picked + " | " + tipTxt.replace(/\n+/g, " ").slice(0, 80));
  ok(await page.evaluate(() => !!window.App.arena.res) && !/已经过期/.test(await cmp.innerText()), "换模型不会让对比结果过期");
  await setNum("s-rows", 6000); await idle(); ok(/已经过期/.test(await cmp.innerText()), "改了别的训练参数，对比结果标为过期");
  await setNum("s-rows", 12000); await idle(); await page.selectOption("#s-model", "ols"); await idle();
  // 杠杆曲线：模型规则走"录一次、回放多次"
  await page.waitForFunction(() => window.App.lev.res && !window.App.lev.busy, null, { timeout: 120000 }); const lev = await page.evaluate(() => { const L = window.App.lev; return { n: L.xs.length, g: Array.from(L.res.growth).filter(v => v === v).length, mode: L.mode }; });
  ok(lev.g >= lev.n - 1, "模型规则的杠杆曲线算得出来", JSON.stringify(lev));
  // 在线梯度下降：不用训练集，也能学到 φ 的一部分
  await page.selectOption("#stratSel", "ogd"); await idle(); const gOgd = await growth(); ok(gOgd > 0.05, "在线梯度下降在 AR(1) 上有正的增长率", gOgd.toFixed(3)); console.log("  ar1 OGD g =", gOgd.toFixed(3));

  // 4. GBM：没有可学的东西
  await pickWorld(page, "gbm"); await idle(); await page.selectOption("#stratSel", "pipe"); await idle(); await page.selectOption("#s-model", "forest"); await idle(180000);
  d = await diag(); ok(d.r2Valid < 0.002 && d.r2Train > d.r2Valid, "GBM · 随机森林：验证集 R² ≈ 0，训练集更高", `train ${d.r2Train.toFixed(4)} valid ${d.r2Valid.toFixed(4)}`); console.log("  gbm forest: R² train/valid =", d.r2Train.toFixed(4), d.r2Valid.toFixed(4), " summary:", (await sum()).slice(0, 170));
  ok(/真实的条件期望/.test(await card("mdlfn").innerText()), "GBM：真值是一条水平线");
  await card("mdlfn").scrollIntoViewIfNeeded(); await page.waitForTimeout(250); await card("mdlfn").screenshot({ path: SH("m-fn-gbm-forest.png") }); await card("mdl").screenshot({ path: SH("m-diag-gbm-forest.png") });
  for (const m of ["mean", "ridge", "lasso", "logit", "tree", "gbm", "mlp", "knn", "ols"]) { await page.selectOption("#s-model", m); await idle(180000); const s = await sum(), dd = await diag(); ok(!/出错/.test(s) && dd && dd.r2Valid === dd.r2Valid, "流水线模型 " + m + " 能训练并回测", s.slice(0, 80)); console.log(`  gbm ${m}: R² ${dd.r2Train.toFixed(4)} / ${dd.r2Valid.toFixed(4)}  g = ${(await growth()).toFixed(3)}`); }
  await page.selectOption("#s-feat", "tech"); await idle(180000); d = await diag(); ok(d.names.length === 4 && /动量/.test(d.names.join()) && !/出错/.test(await sum()), "技术特征可用", JSON.stringify(d.names));

  // 5. 状态切换：HMM 与卡尔曼
  await pickWorld(page, "regime"); await idle(); await page.selectOption("#stratSel", "hmm"); await idle(180000);
  const noteH = await page.locator("#fitNote").innerText(); ok(/状态/.test(noteH) && /%/.test(noteH), "HMM：显示拟合出来的状态参数", noteH.slice(0, 160)); const gH = await growth(); console.log("  regime HMM: g =", gH.toFixed(3), "|", noteH.slice(0, 200));
  await page.selectOption("#stratSel", "kalman"); await idle(); const gK = await growth(); await page.selectOption("#stratSel", "hold"); await idle(); const gHold = await growth();
  ok(gH > gK && gK > gHold, "状态切换世界：HMM > 卡尔曼 > 买入持有", `${gH.toFixed(3)} / ${gK.toFixed(3)} / ${gHold.toFixed(3)}`);
  ok(/当前规则没有训练模型/.test(await card("mdl").innerText()), "换回没有模型的规则时，诊断图给出说明而不是旧数据");

  // 6. OU：表格型 Q-learning
  await pickWorld(page, "ou"); await idle(); await page.selectOption("#stratSel", "qlearn"); await idle(240000);
  const noteQ = await page.locator("#fitNote").innerText(), gQ = await growth(); ok(/[▲▼·]/.test(noteQ), "Q-learning：显示学到的策略表", noteQ.slice(0, 200)); ok(gQ > 0.02, "Q-learning 在均值回复世界里学到赚钱的策略", gQ.toFixed(3)); console.log("  ou qlearn: g =", gQ.toFixed(3), "|", noteQ.slice(0, 260));
  await page.locator("#blkStrat").screenshot({ path: SH("m-qlearn-panel.png") });
  // OU + 流水线（水平特征）：真值曲线
  await page.selectOption("#stratSel", "pipe"); await idle(); await page.selectOption("#s-feat", "level"); await idle(); await page.selectOption("#s-model", "ols"); await idle(); await setNum("s-lags", 1); await idle();
  d = await diag(); const ou = await page.evaluate(() => { const A = window.App, pd = A.run.diag.pd, wp = A.wp(), dt = 1 / A.worldCfg().K, lt = Math.log(wp.theta / 100), a = Math.exp(-wp.kappa * dt), sd2 = Math.pow(wp.sigma / 100, 2) * (1 - a * a) / (2 * wp.kappa); let w = 0, lo = 1e9, hi = -1e9; pd.xs.forEach((x, i) => { const ty = Math.exp((lt - x) * (1 - a) + sd2 / 2) - 1; w = Math.max(w, Math.abs(pd.yhat[i] - ty)); lo = Math.min(lo, ty); hi = Math.max(hi, ty); }); return { w, span: hi - lo }; });
  ok(d.r2Valid > 0.001 && d.r2Valid < 0.03 && ou.w < 0.2 * ou.span, "OU · 水平特征 · OLS：R² 约 1%，直线贴着真值", `R² ${d.r2Valid.toFixed(4)}，偏差 ${(ou.w / ou.span * 100).toFixed(1)}%`); console.log("  ou OLS(level): R² =", d.r2Train.toFixed(4), d.r2Valid.toFixed(4), " g =", (await growth()).toFixed(3));
  await card("mdlfn").scrollIntoViewIfNeeded(); await page.waitForTimeout(250); await card("mdlfn").screenshot({ path: SH("m-fn-ou-ols.png") });

  // 7. 真实数据（只有一条路径）：按时间切分训练 / 验证
  await pickWorld(page, "real"); await idle(); await page.waitForTimeout(300); await page.selectOption("#s-feat", "ret"); await idle(); await setNum("s-lags", 2); await idle();
  d = await diag(); const sr = await sum(); ok(d && d.nTrain > 100 && d.nValid > 20 && !/出错/.test(sr), "真实数据上按时间切分训练模型", d ? `${d.nTrain}/${d.nValid}  R² ${d.r2Valid.toFixed(4)}` : sr.slice(0, 120)); console.log("  real OLS:", d ? `n ${d.nTrain}/${d.nValid}  R² ${d.r2Train.toFixed(4)}/${d.r2Valid.toFixed(4)}` : "-", "|", sr.slice(0, 140));

  // 真实数据 + 带训练的规则：回测只覆盖训练段的后一部分，并且说明了这一点
  ok(/1 条 × 293 步/.test(sr) && /留给模型学/.test(sr), "真实数据：回测只用训练段的后 40%，摘要里有说明", sr.slice(-220));
  ok(/训练段的前 60%（\d+ 步）上拟合/.test(await page.locator("#fitNote").innerText()), "真实数据：拟合说明写的是前 60%", await page.locator("#fitNote").innerText());
  await page.locator("#summary").screenshot({ path: SH("m-real-summary.png") });
  // 价格图上标出三段：留给模型 | 回测 | 样本外
  await page.evaluate(() => { const A = window.App; if (A.state.charts.indexOf("paths") < 0) A.toggleChart("paths"); }); await page.waitForTimeout(300);
  const ptxt = await card("paths").innerText(); ok(/留给模型训练/.test(ptxt) && /样本外/.test(ptxt), "真实数据的价格图标出留给模型的那一段", ptxt.replace(/\n+/g, " | ").slice(0, 80)); await card("paths").scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await card("paths").screenshot({ path: SH("m-real-paths.png") });
  // 多策略对比：有带训练的规则时，其余规则对齐到同一段
  await page.click('#blkStrat button:has-text("加入对比")'); await page.selectOption("#stratSel", "hold"); await idle(); const holdT = await page.evaluate(() => window.App.run.sum.T); await page.click('#blkStrat button:has-text("加入对比")');
  await page.waitForFunction(() => document.querySelectorAll('.card[data-chart="compare"] tbody tr').length === 2 && !document.querySelector('.card[data-chart="compare"] tbody').innerText.includes("…"), null, { timeout: 60000 }); await page.waitForTimeout(300);
  const cmpInfo = await page.evaluate(() => { const A = window.App, rows = A.cmp.rows, ids = A.state.compare.map(c => c.id); return { T: ids.map(i => rows[i].sum.T), aligned: A.cmp.aligned, txt: document.querySelector('.card[data-chart="compare"]').innerText }; });
  ok(holdT === 731 && cmpInfo.T[0] === 293 && cmpInfo.T[1] === 293 && cmpInfo.aligned, "对比里买入持有被对齐到同一段（单独运行时用的是整个训练段）", `单独 ${holdT} 步；对比里 ${cmpInfo.T.join(" / ")} 步`);
  ok(/留给模型学/.test(cmpInfo.txt), "对比卡片说明了对齐"); await card("compare").scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await card("compare").screenshot({ path: SH("m-real-compare.png") });
  await page.evaluate(() => { window.App.state.compare = []; window.App.persist(); }); await page.selectOption("#stratSel", "pipe"); await idle();

  // 很重的模型跑到一半时改设置：不等它跑完，直接重来
  await pickWorld(page, "gbm"); await idle(); await page.selectOption("#s-feat", "tech"); await idle(); await page.selectOption("#s-model", "forest"); await idle(180000);
  await page.fill("#s-trees", "300"); await page.fill("#s-depth", "10"); await page.fill("#s-minLeaf", "5"); await page.fill("#s-rows", "40000"); await page.dispatchEvent("#s-rows", "change");
  await page.waitForTimeout(4200); const busyTxt = await page.locator("#sumBusy").innerText(); ok(/已用 \d+ 秒/.test(busyTxt), "长时间训练时显示已用的秒数", busyTxt);
  const tSwitch = Date.now(); await page.selectOption("#s-model", "ols"); await idle(60000); const waited = (Date.now() - tSwitch) / 1000;
  ok(waited < 20 && await page.evaluate(() => window.App.run && window.App.run.diag && window.App.sp().model === "ols" && !window.App.err), "改了设置就打断正在训练的重模型", waited.toFixed(1) + " 秒后拿到新结果");
  await page.evaluate(() => { const A = window.App; Object.assign(A.sp(), { trees: 60, depth: 4, minLeaf: 50, rows: 12000, feat: "ret" }); A.renderStrat(); A.requestRun("commit"); }); await idle();

  // 8. 说明与代码
  await pickWorld(page, "ar1"); await idle(); await page.click('#blkStrat button:has-text("说明与代码")').catch(async () => { await page.click('#blkStrat button:has-text("说明")'); }); await page.waitForSelector(".modal-box"); await page.waitForTimeout(500);
  const mtxt = await page.locator(".modal-box").innerText(); ok(/假设|目标|最优/.test(mtxt) && mtxt.length > 400, "模型规则有同样格式的解释", mtxt.slice(0, 80)); await page.screenshot({ path: SH("m-explain-pipe.png") });
  const kerr = await page.locator(".modal-box .katex-error").count(); ok(kerr === 0, "解释里的公式都能排版", kerr + " 处错误");
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);

  await page.evaluate(() => { document.getElementById("paneRes").scrollTop = 0; }); await page.waitForTimeout(300); await page.screenshot({ path: SH("m-desktop.png") });
  console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", logs.length ? "\n" + logs.join("\n") : "none");
  await t.close(); process.exitCode = fail || logs.length ? 1 : 0;
})().catch(e => { console.error("TEST CRASHED:", e.message.split("\n").slice(0, 6).join("\n")); process.exit(1); });
