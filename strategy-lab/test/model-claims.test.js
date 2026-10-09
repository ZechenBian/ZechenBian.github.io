// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 模型类规则的"可检验的预测"：解释里写了什么，这里就验证什么。
// 设定与页面的默认值一致：成本 5 bp、仓位范围 [−1, 3]、种子 7。
const H = require("./harness.js"); const { QL, STRATS, compile, world, ok, near, section, done } = H;
const SETD = { costBps: 5, rf: 0, fmin: -1, fmax: 3, lam: 1, ddLimit: 30, ddProb: 5 };
const defs = st => { const p = {}; st.params.forEach(q => { p[q.key] = q.def; }); return p; };
const cache = {};
// 与引擎一致：模型在另一批路径（fit 批次）上训练，回测用的那批它没见过
function batch(type, over) { const key = type + JSON.stringify(over || {}); if (!cache[key]) { const cfg = world(type, over); const B = QL.makeBatch(cfg, null, 0); cache[key] = { cfg, B, D: QL.makeData(QL.makeBatch(cfg, null, 0, "fit")) }; } return cache[key]; }
function run(id, type, wover, pover, set) {
  const st = STRATS.find(s => s.id === id), S = compile(st.code), { cfg, B, D } = batch(type, wover), p = Object.assign(defs(st), pover || {});
  const model = S.fit ? S.fit(D, p, QL.ml, new QL.RNG(cfg.seed, 777, 1)) : undefined;
  const res = QL.runBatch(B, S, p, set || SETD, {}, model), sum = QL.summarize(res, set || SETD);
  return { g: sum.growth, se: sum.growthSE, to: sum.turnover, ex: sum.exposure, diag: model && model.diag, note: model && model.note };
}
const f = (x, d) => x.toFixed(d == null ? 4 : d);

section("流水线 · Logistic 映射（水平特征，L = 1）：线性只到 ½，非线性接近 1");
{
  const r = {}; for (const m of ["ols", "knn", "tree", "forest", "gbm", "mlp"]) r[m] = run("pipe", "logistic", {}, { model: m, feat: "level", lags: 1 });
  near(r.ols.diag.r2Valid, 0.5, 0.03, "线性回归的验证 R² ≈ ½");
  for (const m of ["knn", "tree", "forest", "gbm", "mlp"]) ok(r[m].diag.r2Valid > 0.97, m + " 的验证 R² 接近 1", f(r[m].diag.r2Valid));
  ok(r.knn.g > r.ols.g, "预测得准的模型增长率更高", `${f(r.knn.g, 2)} vs ${f(r.ols.g, 2)}`);
  ok(r.knn.diag.pd && r.knn.diag.pd.xs.length > 20 && r.knn.diag.calib.length >= 5 && r.knn.diag.importance.length === 1, "诊断报告齐全（函数切片、校准、重要性）");
  console.log("   R²（验证）：" + Object.keys(r).map(m => m + " " + f(r[m].diag.r2Valid)).join("  "));
}

section("流水线 · AR(1) φ = 0.2：线性回归的 R² ≈ φ²，更复杂的模型不会更好");
{
  const r = {}; for (const m of ["mean", "ols", "ridge", "lasso", "knn", "tree", "forest", "gbm", "mlp"]) r[m] = run("pipe", "ar1", { phi: 0.2 }, { model: m });
  near(r.ols.diag.r2Valid, 0.04, 0.015, "线性回归的验证 R² ≈ φ² = 0.04");
  near(r.ols.diag.ic, 0.2, 0.04, "IC ≈ φ");
  for (const m of ["knn", "tree", "forest", "gbm", "mlp"]) ok(r[m].diag.r2Valid < r.ols.diag.r2Valid + 0.003, m + " 不比线性回归好", `${f(r[m].diag.r2Valid)} vs ${f(r.ols.diag.r2Valid)}`);
  ok(r.ols.g > r.mean.g + 0.2, "有预测力时，按预测下注明显好于只用均值", `${f(r.ols.g, 3)} vs ${f(r.mean.g, 3)}`);
  // 预测力与夏普：R² 小时每步夏普 ≈ sqrt(R²/(1+R²))
  console.log("   R²（验证）：" + Object.keys(r).map(m => m + " " + f(r[m].diag.r2Valid)).join("  "));
}

section("流水线 · 几何布朗运动：没有可学的东西");
{
  const hold = run("hold", "gbm"), r = {}; for (const m of ["mean", "ols", "ridge", "lasso", "logit", "knn", "tree", "forest", "gbm", "mlp"]) r[m] = run("pipe", "gbm", {}, { model: m });
  for (const m of Object.keys(r)) ok(r[m].diag.r2Valid < 0.003, m + " 的验证 R² 不显著大于 0", f(r[m].diag.r2Valid));
  for (const m of ["knn", "tree", "gbm"]) { ok(r[m].diag.r2Train > 0.001, m + " 的训练 R² 为正（学到了不存在的结构）", f(r[m].diag.r2Train)); ok(r[m].g < 0 && r[m].g < hold.g, m + "：按它的预测交易是亏钱的", f(r[m].g, 3)); }
  ok(r.mean.g > 0.02 && Math.abs(r.mean.g - hold.g) < 0.03 && r.mean.to < 5, "只用训练集均值的基准就是一个固定比例（换手很低）", `${f(r.mean.g, 3)}，买入持有 ${f(hold.g, 3)}，年换手 ${f(r.mean.to, 1)}`);
  console.log("   g：买入持有 " + f(hold.g, 3) + "  " + Object.keys(r).map(m => m + " " + f(r[m].g, 3)).join("  "));
  // k 近邻在纯噪声上：训练 R² = 1/k，验证 R² = −1/k
  // 这是期望值：单次实验（一个种子）会有一两个百分点的出入，所以对 6 个种子取平均
  for (const k of [10, 25, 50]) { let tr = 0, va = 0; const seeds = [1, 2, 3, 4, 5, 6];
    for (const seed of seeds) { const cfg = world("gbm", null, 2000, 252, 252, seed), D = QL.makeData(QL.makeBatch(cfg, null, 0, "fit")), ft = s => [s.ret(0)], a = QL.ml.dataset(D, ft, { warmup: 25, maxRows: 12000, from: 0, to: 1600 }), b = QL.ml.dataset(D, ft, { warmup: 25, maxRows: 3000, from: 1600, to: 2000 }), dg = QL.ml.diagnose(QL.ml.knn(a, { k }), a, b, []); tr += dg.r2Train / seeds.length; va += dg.r2Valid / seeds.length; }
    near(tr, 1 / k, 0.15 / k + 0.004, `k = ${k}：训练 R² ≈ 1/k（6 个种子的平均）`); near(va, -1 / k, 0.15 / k + 0.006, `k = ${k}：验证 R² ≈ −1/k（6 个种子的平均）`); }
}

section("卡尔曼滤波：记忆长度");
{
  const mems = [5, 10, 20, 40, 60, 120, 250, 500, 1000], gr = mems.map(m => run("kalman", "regime", {}, { memory: m }).g), gg = mems.map(m => run("kalman", "gbm", {}, { memory: m }).g);
  const best = gr.indexOf(Math.max.apply(null, gr));
  ok(best > 0 && best < mems.length - 1, "牛熊切换：增长率在中间的记忆长度处达到峰值", `峰值在 ${mems[best]}：` + gr.map(v => f(v, 3)).join(" "));
  ok(gg.every((v, i) => i === 0 || v > gg[i - 1]), "几何布朗运动：记忆越长越好（漂移是常数）", gg.map(v => f(v, 3)).join(" "));
}

section("隐马尔可夫模型");
{
  const wd = QL.worldDefaults("regime"), r = run("hmm", "regime"), nums = (r.note.match(/-?\d+(\.\d+)?/g) || []).map(Number);
  // 说明文字的格式：状态 1 漂移、波动、持续；状态 2 漂移、波动、持续（前面还有"状态 1"里的 1）
  const [, mu1, sg1, d1, , mu2, sg2, d2] = nums;
  near(mu1, wd.muB, 4, "拟合的牛市漂移接近真值"); near(sg1, wd.sgB, 1.5, "拟合的牛市波动接近真值"); near(d1, wd.durB, 0.3, "拟合的牛市持续时间接近真值");
  near(mu2, wd.muR, 6, "拟合的熊市漂移接近真值"); near(sg2, wd.sgR, 2, "拟合的熊市波动接近真值"); near(d2, wd.durR, 0.12, "拟合的熊市持续时间接近真值");
  const ma = run("ma", "regime"), mom = run("mom", "regime"), kal = run("kalman", "regime"), hold = run("hold", "regime");
  ok(r.g > kal.g && r.g > ma.g && r.g > mom.g && r.g > hold.g, "牛熊切换：HMM 的增长率高于卡尔曼、均线交叉、动量和买入持有", `HMM ${f(r.g, 3)}  卡尔曼 ${f(kal.g, 3)}  均线 ${f(ma.g, 3)}  动量 ${f(mom.g, 3)}  持有 ${f(hold.g, 3)}`);
  const rg = run("hmm", "gbm"), hg = run("hold", "gbm");
  ok(rg.to < 30 && rg.g > 0 && rg.g < hg.g, "几何布朗运动：仓位只小幅摆动，增长率低于买入持有", `g ${f(rg.g, 3)} vs ${f(hg.g, 3)}，年换手 ${f(rg.to, 1)}`); console.log("   GBM 上的拟合：" + rg.note);
}

section("在线梯度下降");
{
  const pipe = run("pipe", "ar1", { phi: 0.2 }), etas = [0.001, 0.003, 0.01, 0.02, 0.05, 0.1, 0.2], g = etas.map(e => run("ogd", "ar1", { phi: 0.2 }, { eta: e }).g), best = g.indexOf(Math.max.apply(null, g));
  ok(g[3] > 0.1 && g[3] < pipe.g - 0.1, "AR(1)：能学到东西，但明显不如汇总全部训练路径的线性回归", `OGD ${f(g[3], 3)} vs 流水线 ${f(pipe.g, 3)}`);
  ok(best > 0 && best < etas.length - 1, "学习率有内部的峰值", `峰值在 η = ${etas[best]}：` + g.map(v => f(v, 3)).join(" "));
}

section("Q-learning");
{
  const row = (note, name) => (note.split("\n").filter(l => l.indexOf(name) === 0)[0] || "").split(" ")[1] || "";
  const cnt = (s, ch) => s.split(ch).length - 1;
  const r0 = run("qlearn", "ou", {}, { cost: 0 }, Object.assign({}, SETD, { costBps: 0 })), r5 = run("qlearn", "ou"), r20 = run("qlearn", "ou", {}, { cost: 20 }, Object.assign({}, SETD, { costBps: 20 }));
  const flat = row(r5.note, "空仓时"), n = flat.length, lo = flat.slice(0, Math.floor(n / 3)), hi = flat.slice(n - Math.floor(n / 3));
  ok(n === 9 && cnt(lo, "▲") >= 2 && cnt(lo, "▼") === 0 && cnt(hi, "▼") >= 2 && cnt(hi, "▲") === 0, "均值回复：空仓时在 z 低的档做多、z 高的档做空", flat);
  ok(r5.g > 0.03, "均值回复：学到的策略有正的增长率", f(r5.g, 3));
  const h0 = cnt(row(r0.note, "持多时"), "▲"), h20 = cnt(row(r20.note, "持多时"), "▲");
  ok(h20 >= h0 + 2, "成本从 0 加到 20 bp：持多时继续持有的范围明显变宽", `${row(r0.note, "持多时")} → ${row(r20.note, "持多时")}`);
  const rg = run("qlearn", "gbm"), hg = run("hold", "gbm"), longRow = row(rg.note, "持多时");
  ok(cnt(longRow, "▲") >= 8 && Math.abs(rg.g - hg.g) < 0.015, "几何布朗运动：学到\"基本一直做多\"，增长率接近买入持有", `${longRow}  g ${f(rg.g, 3)} vs ${f(hg.g, 3)}`);
  console.log("   均值回复（5 bp）：\n     " + r5.note.split("\n").slice(1).join("\n     "));
}

done();
