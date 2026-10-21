// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 机器学习实验室 · 指标与检验（src/ml/stats.js）的测试：手算的小例子 + 原假设下 p 值的分布 + 备择下的功效
const { QL, ok, near, section, done } = require("./harness.js");
const INSTALL = require("../src/ml/stats.js");
const S = INSTALL(QL);
const RNG = QL.RNG, g = new RNG(2026, 10, 21);
const t0 = Date.now();
const snap = a => JSON.stringify(Array.from(a));
function rate(sims, f) { let r = 0; for (let s = 0; s < sims; s++) if (f(s) < 0.05) r++; return r / sims; }

section("安装：自包含，能用 toString() 搬进线程");
{
  ok(QL.mlstats === S, "装到 QL.mlstats 上");
  // 线程里是把函数源码拼起来执行的：只给它 RNG，看能不能独立跑起来
  const fake = { RNG: QL.RNG }, S2 = new Function("QL", "return (" + INSTALL.toString() + ")(QL);")(fake);
  ok(fake.mlstats === S2 && Math.abs(S2.expectedMaxNormal(2) - 1 / Math.sqrt(Math.PI)) < 1e-9 && S2.bootstrapMean([1, 2, 3], 50).mean === 2, "用源码字符串重新装一遍也能用");
  const names = ["metrics", "perExample", "baselinePred", "confusion", "roc", "pr", "calibration", "bootstrapMean", "pairedBootstrap", "mcnemar", "dieboldMariano", "holm", "bonferroni", "expectedMaxNormal", "deflatedZ", "powerLawFit", "normCdf", "normInv", "tCdf", "chi2Sf", "binomTwoSided", "histogram", "quantile", "mean", "variance", "corr", "spearman"];
  const miss = names.filter(n => typeof S[n] !== "function"); ok(!miss.length, "接口齐全", miss.join(","));
  // 运行器会把 QL.mlstats 深度冻结：冻结之后照样能用
  const S3 = new Function("QL", "return (" + INSTALL.toString() + ")(QL);")({ RNG: QL.RNG }); Object.freeze(S3); Object.values(S3).forEach(v => Object.freeze(v));
  let err = ""; try { S3.expectedMaxNormal(50); S3.pairedBootstrap([1, 2, 3], [0, 2, 1], 20); S3.holm([0.1, 0.2]); } catch (e) { err = e.message; } ok(!err, "冻结之后仍可调用（不在 S 上存状态）", err);
}

section("基本统计");
{
  near(S.mean([1, 2, 3, 4]), 2.5, 1e-15, "均值"); near(S.variance([1, 2, 3, 4]), 5 / 3, 1e-15, "无偏方差（除以 n − 1）");
  near(S.quantile([1, 2, 3, 4], 0.5), 2.5, 1e-15, "中位数（线性插值）"); near(S.quantile(Float64Array.from([10, 20, 30]), 0.25), 15, 1e-12, "四分位数");
  near(S.corr([1, 2, 3, 4], [2, 4, 6, 8.0]), 1, 1e-15, "Pearson：完全线性 = 1"); near(S.corr([1, 2, 3], [3, 2, 1]), -1, 1e-15, "Pearson：完全反向 = −1");
  near(S.spearman([1, 2, 3, 4, 5], [1, 8, 27, 64, 125]), 1, 1e-15, "Spearman：单调的非线性 = 1");
  // 有并列：x 的秩 [1, 2.5, 2.5, 4]，y 的秩 [1, 3, 2, 4]
  { const rx = [1, 2.5, 2.5, 4], ry = [1, 3, 2, 4], mx = 2.5, my = 2.5; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < 4; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - my) ** 2; }
    near(S.spearman([1, 2, 2, 3], [1, 3, 2, 4]), sxy / Math.sqrt(sxx * syy), 1e-14, "Spearman：并列取平均秩"); ok(snap(S.ranks([3, 1, 3, 2])) === snap([3.5, 1, 3.5, 2]), "平均秩"); }
  const h = S.histogram([0, 0.1, 0.5, 0.99, 1, 2, NaN], 2, 0, 1); ok(snap(h.counts) === "[2,3]" && h.n === 5 && h.lo === 0 && h.hi === 1, "直方图：区间外和 NaN 不计，hi 落进最后一格", snap(h.counts));
  const h2 = S.histogram([3, 1, 2, 5], 4); ok(h2.lo === 1 && h2.hi === 5 && snap(h2.counts) === "[1,1,1,1]" && h2.n === 4, "直方图：默认范围 = [min, max]", snap(h2.counts));
  const h3 = S.histogram([7, 7, 7], 3); ok(h3.n === 3 && h3.hi > h3.lo, "直方图：全部相等时不出 0 宽度");
}

section("分布函数");
{
  // 参考值：Python math.erfc / statistics.NormalDist（AS241）
  const cdfRef = [[-1, 0.15865525393145705], [-2, 0.022750131948179195], [-3, 0.0013498980316300946], [-5, 2.866515718791946e-7], [-10, 7.619853024160593e-24], [-20, 2.7536241186063314e-89], [-37, 5.725571222525139e-300], [1.5, 0.9331927987311419]];
  let worst = 0; for (const [x, v] of cdfRef) worst = Math.max(worst, Math.abs(S.normCdf(x) - v) / v); ok(worst < 5e-13, "normCdf：相对误差（含远尾）", worst.toExponential(2));
  near(S.normCdf(0), 0.5, 1e-16, "Φ(0) = 1/2"); { const e = 1e-9, jump = S.normCdf(-2 + e) - S.normCdf(-2 - e) - 2 * e * S.normPdf(2); ok(Math.abs(jump) < 1e-14 * S.normCdf(-2), "级数与连分式在 |x| = 2 处衔接（没有跳跃）", jump.toExponential(2)); }
  const invRef = [[0.975, 1.959963984540054], [0.025, -1.959963984540054], [0.9, 1.2815515655446004], [0.999, 3.090232306167813], [1e-10, -6.361340902404056], [1e-20, -9.262340089798408], [0.5, 0]];
  worst = 0; for (const [p, v] of invRef) worst = Math.max(worst, Math.abs(S.normInv(p) - v)); ok(worst < 1e-12, "normInv：与 AS241 的参考值一致", worst.toExponential(2));
  worst = 0; for (const p of [1e-300, 1e-100, 1e-15, 1e-8, 1e-4, 0.01, 0.02425, 0.1, 0.3, 0.5, 0.7, 0.97575, 0.99, 1 - 1e-8]) { const q = S.normCdf(S.normInv(p)); worst = Math.max(worst, Math.abs(q - p) / Math.min(p, 1 - p)); }
  ok(worst < 1e-12, "normCdf(normInv(p)) = p（相对误差，含 1e-300）", worst.toExponential(2));
  ok(S.normInv(0) === -Infinity && S.normInv(1) === Infinity && isNaN(S.normInv(NaN)), "normInv 的边界");
  // t 分布：已知值和小自由度的闭式解
  near(S.tCdf(2, 10), 0.963306, 1e-6, "t 分布：t = 2, ν = 10"); near(S.tCdf(2, 10), 0.9633059826146297, 1e-10, "t 分布：t = 2, ν = 10（更多位）");
  near(S.tCdf(2.228138851986, 10), 0.975, 1e-10, "t 分布：ν = 10 的 97.5% 分位数");
  worst = 0;
  for (const t of [-30, -4, -1.3, -0.2, 0, 0.7, 2.5, 12, 300]) {
    const th = Math.atan(t / Math.sqrt(3));
    const ex = [[1, 0.5 + Math.atan(t) / Math.PI], [2, 0.5 + t / (2 * Math.sqrt(t * t + 2))], [3, 0.5 + (th + Math.sin(th) * Math.cos(th)) / Math.PI], [4, 0.5 + 0.5 * (t / Math.sqrt(t * t + 4)) * (1 + 2 / (t * t + 4))]];
    for (const [df, v] of ex) worst = Math.max(worst, Math.abs(S.tCdf(t, df) - v));
  }
  ok(worst < 1e-10, "t 分布：ν = 1, 2, 3, 4 的闭式解", worst.toExponential(2));
  near(S.tCdf(1.5, 1e6 - 1), S.tCdf(1.5, 1e6 + 1), 1e-9, "t 分布：ν = 10⁶ 两边（连分式 / 正态修正）衔接"); near(S.tCdf(1.5, Infinity), S.normCdf(1.5), 1e-15, "ν = ∞ 即正态");
  near(S.tTwoSided(-2, 10), 2 * (1 - 0.9633059826146297), 1e-10, "双侧尾概率");
  // 卡方与二项
  near(S.chi2Sf(3.841458820694124, 1), 0.05, 1e-12, "χ²(1) 的 95% 分位数"); near(S.chi2Sf(6.5, 1), 2 * S.normCdf(-Math.sqrt(6.5)), 1e-13, "χ²(1) 尾 = 2Φ(−√x)");
  worst = 0; for (const x of [0.1, 1, 3, 7, 20, 60]) { worst = Math.max(worst, Math.abs(S.chi2Sf(x, 2) - Math.exp(-x / 2)), Math.abs(S.chi2Sf(x, 4) - Math.exp(-x / 2) * (1 + x / 2))); } ok(worst < 1e-13, "χ²(2)、χ²(4) 的闭式尾概率", worst.toExponential(2));
  near(S.binomTwoSided(2, 10), 112 / 1024, 1e-15, "二项双侧：k = 2, n = 10"); near(S.binomTwoSided(8, 10), 112 / 1024, 1e-15, "二项双侧：对称"); near(S.binomTwoSided(0, 5), 2 / 32, 1e-15, "二项双侧：k = 0"); ok(S.binomTwoSided(5, 10) === 1 && S.binomTwoSided(4, 9) === 1, "二项双侧：中间 = 1");
  { let s = 0, lc = 0; const n = 3000, m = 1430; for (let i = 0; i <= m; i++) { if (i) lc += Math.log((n - i + 1) / i); s += Math.exp(lc - n * Math.LN2); } near(S.binomTwoSided(m, n), 2 * s, 1e-12, "二项双侧：n = 3000（不下溢）"); }
}

section("回归 / 分类 / 预测的指标");
{
  const pr = Float64Array.from([1, 2, 3, 4]), tr = Float64Array.from([1, 3, 2, 5]), keep = snap(pr) + snap(tr);
  const M = S.metrics("regression", pr, tr);
  near(M.mse, 0.75, 1e-15, "MSE"); near(M.rmse, Math.sqrt(0.75), 1e-15, "RMSE"); near(M.mae, 0.75, 1e-15, "MAE"); near(M.r2, 1 - 3 / 8.75, 1e-15, "R² = 1 − SSE/SST");
  ok(S.metrics("regression", [1, 2], [2, 2]).r2 === 0, "SST = 0 时 R² = 0"); near(S.metrics("regression", [0, 0, 0], [1, 2, 3]).r2, 1 - 14 / 2, 1e-15, "R² 可以为负（比均值还差）");
  ok(snap(pr) + snap(tr) === keep, "不改动输入");
  // 三分类：第 4 行 0.5/0.5 并列，取下标小的
  const P = Float64Array.from([0.7, 0.2, 0.1, 0.1, 0.5, 0.4, 0.3, 0.3, 0.4, 0.5, 0.5, 0]), y = Int32Array.from([0, 2, 2, 1]), keep2 = snap(P) + snap(y);
  const C = S.metrics("classification", P, y, 3);
  near(C.acc, 0.5, 1e-15, "准确率（并列取下标小的）"); near(C.logloss, -(Math.log(0.7) + 2 * Math.log(0.4) + Math.log(0.5)) / 4, 1e-15, "对数损失");
  near(C.brier, (0.14 + 0.62 + 0.54 + 0.5) / 4, 1e-15, "Brier（各类平方差之和的均值）"); near(C.f1, (2 / 3 + 0 + 2 / 3) / 3, 1e-15, "宏平均 F1"); ok(C.auc === null, "多分类没有 AUC");
  ok(snap(P) + snap(y) === keep2, "不改动输入");
  near(S.metrics("classification", P, y).acc, 0.5, 0, "不给 k 时由长度推出");
  // 只出现在预测里的类也算进宏平均
  near(S.metrics("classification", [1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 1, 1], 3).f1, (1 + 2 / 3 + 0) / 3, 1e-15, "F1：类别 2 只出现在预测里，F1 = 0 也计入");
  // 对数损失的下限
  const L0 = S.metrics("classification", [1, 0, 0, 1], [1, 1], 2); near(L0.logloss, -Math.log(1e-15) / 2, 1e-12, "p_y = 0 时按 1e-15 截断（不是 ∞）");
  const pe = S.perExample("classification", [1, 0, 0, 1], [1, 1], 2); near(pe.loss[0], -Math.log(1e-15), 1e-12, "逐样本对数损失也截断"); ok(pe.correct[0] === 0 && pe.correct[1] === 1 && pe.loss[1] === 0, "逐样本正确与否");
  const per = S.perExample("regression", pr, tr); ok(per.loss instanceof Float64Array && snap(per.loss) === "[0,1,1,1]" && !per.correct, "回归的逐样本平方误差");
  let msg = ""; try { S.metrics("classification", [0.5, 0.5], [2], 2); } catch (e) { msg = e.message; } ok(/不在 0..1 里/.test(msg), "类别越界时报中文错误", msg);
  msg = ""; try { S.metrics("whatever", [1], [1]); } catch (e) { msg = e.message; } ok(/未知的任务类型/.test(msg), "未知任务类型报错");
  msg = ""; try { S.metrics("regression", [1, 2], [1]); } catch (e) { msg = e.message; } ok(/长度不一致/.test(msg), "长度不一致报错");
  // 预测：第 3 个样本实际没动（truth = origin），不计入方向准确率
  const F = S.metrics("forecast", [1.5, 2, 0.5], [2, 1, 1], 0, { origin: [1, 1.5, 1], naiveAbsErr: [1, 0.5, 0.5] });
  near(F.mse, 0.5, 1e-15, "预测 MSE"); near(F.mae, 2 / 3, 1e-15, "预测 MAE"); near(F.rmse, Math.sqrt(0.5), 1e-15, "预测 RMSE"); near(F.mase, 1, 1e-15, "MASE = MAE / 朴素 MAE"); near(F.dirAcc, 0.5, 1e-15, "方向准确率（不动的不算）");
  const F0 = S.metrics("forecast", [1, 2], [1, 3]); ok(F0.mase === null && F0.dirAcc === null && F0.r2 === undefined, "没给 extra 时 MASE、dirAcc 为 null");
  ok(S.metrics("forecast", [1], [1], 0, { naiveAbsErr: [0] }).mase === null, "朴素误差为 0 时 MASE 为 null");
}

section("基线与混淆矩阵");
{
  const tr = { y: Int32Array.from([0, 0, 1, 2]), n: 4 }, b = S.baselinePred("classification", tr, 2, 3), p = [2.5 / 5.5, 1.5 / 5.5, 1.5 / 5.5];
  ok(b.length === 6 && b.every((v, i) => Math.abs(v - p[i % 3]) < 1e-15), "分类基线：类别频率（+0.5 平滑），重复 nOut 次", Array.from(b).map(v => v.toFixed(4)).join(","));
  const b4 = S.baselinePred("classification", { y: Int32Array.from([0, 0]) }, 1, 3); ok(b4[2] > 0 && Math.abs(b4[0] + b4[1] + b4[2] - 1) < 1e-15, "没见过的类概率 > 0，每行和为 1");
  const br = S.baselinePred("regression", { y: Float64Array.from([1, 2, 6]) }, 3); ok(br.length === 3 && br.every(v => v === 3), "回归基线：训练集均值");
  ok(S.baselinePred("regression", [4, 6], 1)[0] === 5, "也可以直接传 y");
  let msg = ""; try { S.baselinePred("forecast", { y: [1] }, 1); } catch (e) { msg = e.message; } ok(/运行器/.test(msg), "预测任务的基线不在这里算");
  const P = [0.7, 0.2, 0.1, 0.1, 0.5, 0.4, 0.3, 0.3, 0.4, 0.5, 0.5, 0], y = Int32Array.from([0, 2, 2, 1]);
  ok(snap(S.confusion(P, y, 3)) === "[1,0,0,1,0,0,0,1,1]", "混淆矩阵（行 = 真实，列 = 预测）", snap(S.confusion(P, y, 3)));
  ok(snap(S.confusion([0, 1, 2, 0], y, 3)) === "[1,0,0,1,0,0,0,1,1]", "混淆矩阵：也接受类别编号");
  ok(snap(S.confusion([0, 1, 2, 0], y)) === "[1,0,0,1,0,0,0,1,1]" && S.confusion([0, 3], [0, 1]).length === 16, "混淆矩阵：不给 k 时推断");
}

section("ROC / PR / AUC");
{
  // 手算：正例 {0.9, 0.8, 0.3}，负例 {0.8, 0.3, 0.1}，9 对里赢 6 对、平 2 对 → 7/9
  const s = [0.9, 0.8, 0.8, 0.3, 0.3, 0.1], y = Int32Array.from([1, 0, 1, 1, 0, 0]);
  const R = S.roc(s, y); near(R.auc, 7 / 9, 1e-15, "AUC（并列算 1/2）手算");
  ok(R.fpr.length === 5 && R.fpr[0] === 0 && R.tpr[0] === 0 && R.fpr[4] === 1 && R.tpr[4] === 1, "ROC 从 (0,0) 到 (1,1)，并列得分只占一个台阶");
  const Pr = S.pr(s, y); near(Pr.ap, 34 / 45, 1e-15, "平均精确率手算 = 1/3 + 2/9 + 1/5");
  ok(Pr.recall[0] === 0 && Pr.precision[0] === 1 && Pr.recall[Pr.recall.length - 1] === 1, "PR 曲线的起点和终点");
  const two = []; for (const v of s) two.push(1 - v, v); near(S.metrics("classification", two, y, 2).auc, 7 / 9, 1e-15, "metrics 里的 AUC"); near(S.roc(two, y).auc, 7 / 9, 1e-15, "roc 也接受 n×2 概率矩阵");
  // 随机数据（大量并列）：与逐对暴力计数比较
  const n = 400, sc = new Float64Array(n), lab = new Int32Array(n);
  for (let i = 0; i < n; i++) { sc[i] = Math.round(g.u() * 10) / 10; lab[i] = g.u() < 0.2 + 0.6 * sc[i] ? 1 : 0; }
  let win = 0, np = 0, nn = 0; for (let i = 0; i < n; i++) { if (lab[i]) np++; else nn++; for (let j = 0; j < n; j++) if (lab[i] === 1 && lab[j] === 0) win += sc[i] > sc[j] ? 1 : sc[i] === sc[j] ? 0.5 : 0; }
  const brute = win / (np * nn), keep = snap(sc); near(S.roc(sc, lab).auc, brute, 1e-12, "ROC 面积 = 逐对暴力计数（并列很多）");
  const two2 = new Float64Array(2 * n); for (let i = 0; i < n; i++) { two2[2 * i] = 1 - sc[i]; two2[2 * i + 1] = sc[i]; } near(S.metrics("classification", two2, lab, 2).auc, brute, 1e-12, "Mann–Whitney 的 AUC = 暴力计数");
  ok(snap(sc) === keep, "排序不改动输入");
  // AP 的定义：对每个不同的阈值 t，R(t)、P(t) 由"得分 ≥ t"算出，AP = Σ ΔR·P
  const th = Array.from(new Set(Array.from(sc))).sort((a, b) => b - a); let ap = 0, rPrev = 0;
  for (const t of th) { let tp = 0, fp = 0; for (let i = 0; i < n; i++) if (sc[i] >= t) { if (lab[i]) tp++; else fp++; } const r = tp / np; ap += (r - rPrev) * tp / (tp + fp); rPrev = r; }
  near(S.pr(sc, lab).ap, ap, 1e-12, "平均精确率 = 按定义逐阈值计算");
  ok(S.roc([0.1, 0.2], [1, 1]).auc === null && S.metrics("classification", [0.5, 0.5, 0.4, 0.6], [1, 1], 2).auc === null && S.pr([0.3], [0]).ap === null, "只有一类时 AUC / AP 为 null");
}

section("校准");
{
  const c = S.calibration([0.05, 0.15, 0.95, 1.0], [0, 1, 1, 1], 10);
  ok(c.count[0] === 1 && c.count[1] === 1 && c.count[9] === 2 && c.count[5] === 0 && c.mode === "binary", "分箱（p = 1 落进最后一箱）");
  near(c.conf[9], 0.975, 1e-15, "箱内平均置信度"); near(c.acc[1], 1, 0, "箱内实际频率"); ok(isNaN(c.conf[5]) && isNaN(c.acc[5]), "空箱为 NaN"); near(c.mid[0], 0.05, 1e-15, "箱中点");
  near(c.ece, 0.25 * 0.05 + 0.25 * 0.85 + 0.5 * 0.025, 1e-15, "ECE 手算");
  // 完全校准的模拟数据：y ~ Bernoulli(p)
  const n = 100000, p = new Float64Array(n), y = new Int32Array(n), pBad = new Float64Array(n);
  for (let i = 0; i < n; i++) { p[i] = g.u(); y[i] = g.u() < p[i] ? 1 : 0; pBad[i] = p[i] * p[i]; }
  const cal = S.calibration(p, y, 10); ok(cal.ece < 0.01, "完全校准的二分类：ECE ≈ 0", cal.ece.toFixed(4));
  ok(S.calibration(pBad, y, 10).ece > 0.12, "把 p 换成 p²（过于保守）：ECE 明显大于 0", S.calibration(pBad, y, 10).ece.toFixed(4));
  const two = new Float64Array(2 * n); for (let i = 0; i < n; i++) { two[2 * i] = 1 - p[i]; two[2 * i + 1] = p[i]; } near(S.calibration(two, y, 10).ece, cal.ece, 1e-15, "n×2 概率矩阵按二分类处理");
  // 多分类：y 按概率抽，则"最大概率 = 猜对的概率"
  const k = 4, m = 60000, P = new Float64Array(m * k), Y = new Int32Array(m);
  for (let i = 0; i < m; i++) { let s = 0; for (let j = 0; j < k; j++) { const e = g.exp(1) * (j === 0 ? 1 + 3 * g.u() : 1); P[i * k + j] = e; s += e; } let u = g.u() * s, cls = k - 1; for (let j = 0; j < k; j++) { P[i * k + j] /= s; } for (let j = 0, acc = 0; j < k; j++) { acc += P[i * k + j] * s; if (u < acc) { cls = j; break; } } Y[i] = cls; }
  const cm = S.calibration(P, Y, 10); ok(cm.mode === "confidence" && cm.ece < 0.015, "完全校准的四分类（置信度）：ECE ≈ 0", cm.ece.toFixed(4));
}

section("自助法");
{
  const v = Float64Array.from([3, 1, 4, 1, 5, 9, 2, 6]), keep = snap(v);
  const a = S.bootstrapMean(v, 2000, new RNG(1, 2, 3)), b = S.bootstrapMean(v, 2000, new RNG(1, 2, 3));
  ok(a.mean === 3.875 && a.se === b.se && a.lo === b.lo && a.hi === b.hi, "同一种子结果逐位相同"); ok(snap(v) === keep, "不改动输入");
  near(a.se, Math.sqrt(S.variance(v) * 7 / 8 / 8), 0.12 * Math.sqrt(S.variance(v) * 7 / 8 / 8), "自助 se ≈ σ̂/√n（σ̂ 用除以 n 的版本）");
  ok(a.lo < a.mean && a.mean < a.hi, "区间包含样本均值");
  // 覆盖率：300 组数据，n = 50
  let cover = 0; const sims = 300, mu = 1;
  for (let s = 0; s < sims; s++) { const x = new Float64Array(50); for (let i = 0; i < 50; i++) x[i] = mu + 2 * g.normal(); const r = S.bootstrapMean(x, 500, g); if (r.lo <= mu && mu <= r.hi) cover++; }
  ok(cover / sims >= 0.9 && cover / sims <= 0.99, "95% 百分位区间的覆盖率", (100 * cover / sims).toFixed(1) + "%");
  // 配对自助：原假设下拒绝率 ≈ 5%，备择下有功效
  const n = 80; let r1 = 0, r2 = 0, pw = 0, pwN = 0;
  for (let s = 0; s < sims; s++) {
    const A = new Float64Array(n), B = new Float64Array(n), B2 = new Float64Array(n);
    for (let i = 0; i < n; i++) { const c = g.normal(); A[i] = c + g.normal(); B[i] = c + g.normal(); B2[i] = B[i] - 0.5; }
    const R = S.pairedBootstrap(A, B, 400, g); if (R.p < 0.05) r1++; if (R.pNormal < 0.05) r2++;
    const Q = S.pairedBootstrap(A, B2, 400, g); if (Q.p < 0.05) pw++; if (Q.pNormal < 0.05) pwN++;
  }
  ok(r1 / sims >= 0.02 && r1 / sims <= 0.09, "配对自助：原假设下 5% 水平的拒绝率", (100 * r1 / sims).toFixed(1) + "%");
  ok(r2 / sims >= 0.02 && r2 / sims <= 0.09, "配对自助（正态近似 p）：原假设下的拒绝率", (100 * r2 / sims).toFixed(1) + "%");
  ok(pw / sims > 0.75 && pwN / sims > 0.75, "配对自助：差 0.5（约 3.5 个标准误）时的功效", (100 * pw / sims).toFixed(1) + "%");
  const D = S.pairedBootstrap([1, 2, 3, 4], [0, 1, 2, 3], 200); ok(D.diff === 1 && D.p === 0 && D.pNormal === 0 && D.se === 0, "差恒为 1：p = 0");
  const Z = S.pairedBootstrap([1, 2, 3], [1, 2, 3], 200); ok(Z.diff === 0 && Z.p === 1 && Z.pNormal === 1, "差恒为 0：p = 1");
}

section("McNemar");
{
  const a = [1, 1, 1, 0, 0, 1, 1, 0], b = [0, 1, 0, 1, 0, 0, 1, 0], M = S.mcnemar(a, b);
  ok(M.b === 3 && M.c === 1 && M.exact, "b = A 对 B 错、c = A 错 B 对"); near(M.p, 2 * 5 / 16, 1e-15, "精确二项：2·P(X ≤ 1 | n = 4)");
  const ca = [], cb = []; for (let i = 0; i < 40; i++) { ca.push(1); cb.push(0); } for (let i = 0; i < 20; i++) { ca.push(0); cb.push(1); } for (let i = 0; i < 30; i++) { ca.push(1); cb.push(1); }
  const M2 = S.mcnemar(ca, cb); ok(M2.b === 40 && M2.c === 20 && !M2.exact, "b + c > 50 用卡方"); near(M2.stat, 19 * 19 / 60, 1e-12, "连续性修正的卡方统计量"); near(M2.p, S.chi2Sf(361 / 60, 1), 1e-15, "卡方 p 值");
  ok(S.mcnemar([1, 0], [1, 0]).p === 1, "完全一致：p = 1");
  for (const n of [100, 200]) {   // n = 100：b + c 约 37，走精确二项；n = 200：约 75，走卡方
    const gm = new RNG(77, n, 0), r = rate(3000, () => { const x = new Uint8Array(n), y = new Uint8Array(n); for (let i = 0; i < n; i++) { x[i] = gm.u() < 0.75 ? 1 : 0; y[i] = gm.u() < 0.75 ? 1 : 0; } return S.mcnemar(x, y).p; });
    ok(r >= 0.02 && r <= 0.09, "McNemar 原假设下的拒绝率（n = " + n + "，" + (n < 150 ? "精确二项" : "卡方") + "；离散检验略保守）", (100 * r).toFixed(1) + "%");
  }
  const pw = rate(500, () => { const n = 200, x = new Uint8Array(n), y = new Uint8Array(n); for (let i = 0; i < n; i++) { x[i] = g.u() < 0.85 ? 1 : 0; y[i] = g.u() < 0.7 ? 1 : 0; } return S.mcnemar(x, y).p; });
  ok(pw > 0.8, "McNemar 的功效（85% 对 70%，n = 200）", (100 * pw).toFixed(1) + "%");
}

section("Diebold–Mariano");
{
  const la = [1.2, 0.4, 2.2, 0.9, 1.7, 0.3, 1.1, 2.6, 0.8, 1.9, 0.5, 1.4, 2.0, 0.7], lb = [0.9, 0.7, 1.5, 1.0, 1.1, 0.6, 0.8, 1.7, 1.1, 1.2, 0.9, 1.0, 1.6, 0.4], T = la.length;
  // 教科书公式，独立地写一遍
  function textbook(h) {
    const d = la.map((v, i) => v - lb[i]), db = d.reduce((s, v) => s + v, 0) / T, gam = j => { let s = 0; for (let t = j; t < T; t++) s += (d[t] - db) * (d[t - j] - db); return s / T; };
    let V = gam(0); for (let j = 1; j <= h - 1; j++) V += 2 * (1 - j / h) * gam(j);
    const dm = db / Math.sqrt(V / T), stat = dm * Math.sqrt((T + 1 - 2 * h + h * (h - 1) / T) / T);
    return { stat, dbar: db, p: 2 * (1 - S.tCdf(Math.abs(stat), T - 1)) };
  }
  for (const h of [1, 3]) { const A = S.dieboldMariano(la, lb, h), B = textbook(h); near(A.stat, B.stat, 1e-12, "DM 统计量 = 教科书公式（h = " + h + "）"); near(A.p, B.p, 1e-12, "DM p 值（h = " + h + "）"); near(A.dbar, B.dbar, 1e-15, "DM 的平均损失差（h = " + h + "）"); }
  // h = 1 时 HLN 修正后的 DM 恰好是对 d 的单样本 t 统计量
  { const d = la.map((v, i) => v - lb[i]), m = S.mean(d), t = m / Math.sqrt(S.variance(d) / T); near(S.dieboldMariano(la, lb, 1).stat, t, 1e-12, "h = 1：DM = 配对 t 统计量"); }
  ok(S.dieboldMariano(la, lb).h === 1, "h 默认为 1");
  ok(S.dieboldMariano([1, 2, 3], [0, 1, 2]).p === 0 && S.dieboldMariano([1, 2], [1, 2]).p === 1, "损失差恒定时的边界情况");
  const rIid = rate(1500, () => { const n = 150, a = new Float64Array(n), b = new Float64Array(n); for (let i = 0; i < n; i++) { a[i] = g.normal(); b[i] = g.normal(); } return S.dieboldMariano(a, b, 1).p; });
  ok(rIid >= 0.02 && rIid <= 0.09, "DM 原假设下的拒绝率（独立，h = 1）", (100 * rIid).toFixed(1) + "%");
  // MA(2) 的损失差（h = 3 步预测的典型情形）
  function ma2() { const n = 150, a = new Float64Array(n), b = new Float64Array(n); let e1 = g.normal(), e2 = g.normal(); for (let i = 0; i < n; i++) { const e = g.normal(); a[i] = e + 0.5 * e1 + 0.3 * e2; e2 = e1; e1 = e; } return [a, b]; }
  const rRect = rate(1500, () => { const [a, b] = ma2(); return S.dieboldMariano(a, b, 3, { kernel: "rect" }).p; });
  const rBart = rate(1500, () => { const [a, b] = ma2(); return S.dieboldMariano(a, b, 3).p; });
  ok(rRect >= 0.02 && rRect <= 0.09, "DM 原假设下的拒绝率（MA(2)，h = 3，等权截断）", (100 * rRect).toFixed(1) + "%");
  console.log("   参考：同一 MA(2) 原假设下 Bartlett 权重的拒绝率 " + (100 * rBart).toFixed(1) + "%（滞后 h − 1 的 Bartlett 低估长期方差，略偏多拒绝）");
  const pw = rate(500, () => { const n = 150, a = new Float64Array(n), b = new Float64Array(n); for (let i = 0; i < n; i++) { a[i] = g.normal() + 0.4; b[i] = g.normal(); } return S.dieboldMariano(a, b, 1).p; });
  ok(pw > 0.8, "DM 的功效（平均损失差 0.4 ≈ 3.5 个标准误，T = 150）", (100 * pw).toFixed(1) + "%");
}

section("多重比较、选择偏差、幂律");
{
  const p = [0.01, 0.04, 0.03, 0.005], keep = snap(p), H = S.holm(p);
  ok(H.every((v, i) => Math.abs(v - [0.03, 0.06, 0.06, 0.02][i]) < 1e-15), "Holm 手算（保持原顺序、单调）", H.join(","));
  ok(S.bonferroni(p).every((v, i) => Math.abs(v - [0.04, 0.16, 0.12, 0.02][i]) < 1e-15), "Bonferroni", S.bonferroni(p).join(","));
  ok(snap(p) === keep, "不改动输入");
  const H2 = S.holm([0.5, 0.6, NaN, 0.01]); ok(H2[3] === 0.03 && H2[0] === 1 && H2[1] === 1 && isNaN(H2[2]), "Holm：上限 1，NaN 不计入 m", H2.join(","));
  near(S.expectedMaxNormal(1), 0, 0, "E[max of 1] = 0"); near(S.expectedMaxNormal(2), 1 / Math.sqrt(Math.PI), 1e-9, "E[max of 2] = 1/√π"); near(S.expectedMaxNormal(3), 3 / (2 * Math.sqrt(Math.PI)), 1e-9, "E[max of 3] = 3/(2√π)");
  near(S.expectedMaxNormal(100), 2.50759, 1e-5, "E[max of 100] ≈ 2.50759"); near(S.expectedMaxNormal(10), 1.5387527308, 1e-9, "E[max of 10]");
  // N = 10⁶：用密度 N φ Φ^(N−1) 的另一种积分独立核对
  { const N = 1e6, h = 1e-4; let s = 0; for (let i = 0; i <= 50000; i++) { const x = 2.5 + i * h, w = i === 0 || i === 50000 ? 1 : i & 1 ? 4 : 2; s += w * x * N * S.normPdf(x) * Math.exp((N - 1) * Math.log1p(-S.normCdf(-x))); }
    near(S.expectedMaxNormal(N), s * h / 3, 1e-6, "E[max of 10⁶]（与密度积分对照）"); }
  ok(S.expectedMaxNormal(100) > QL.expectedMaxNormal(100), "比 core.js 的 Blom 近似大（后者低估）");
  near(S.deflatedZ(3, 100), 3 - S.expectedMaxNormal(100), 1e-15, "deflatedZ = z − E[max]");
  // 蒙特卡洛核对 N = 20
  { let s = 0; const R = 20000; for (let r = 0; r < R; r++) { let m = -Infinity; for (let j = 0; j < 20; j++) m = Math.max(m, g.normal()); s += m; } near(s / R, S.expectedMaxNormal(20), 0.02, "E[max of 20] 与蒙特卡洛一致"); }
  const pl = S.powerLawFit([100, 200, 400, 800, 1600, 0, 50], [3 * 100 ** -0.5, 3 * 200 ** -0.5, 3 * 400 ** -0.5, 3 * 800 ** -0.5, 3 * 1600 ** -0.5, 1, -2]);
  near(pl.a, 3, 1e-10, "幂律拟合：a"); near(pl.b, 0.5, 1e-12, "幂律拟合：b"); near(pl.r2, 1, 1e-12, "幂律拟合：无噪声时 R² = 1"); ok(pl.n === 5, "非正的点被忽略");
  ok(isNaN(S.powerLawFit([10], [1]).a), "只有一个点时无法拟合");
}

console.log("\n   用时 " + ((Date.now() - t0) / 1000).toFixed(1) + " 秒");
done();
