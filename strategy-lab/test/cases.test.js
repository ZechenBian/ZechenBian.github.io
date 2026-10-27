// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 数据分析案例（cases/index.html）在 Node 里的核对：三份真实数据解码后和原文件一致；数值工具对得上闭式解和模拟；
// 每个案例算出来的关键数字和一份独立的 numpy 计算（写在下面的 REF 里）一致；正文里每一句“定性的话”（谁比谁大、符号是什么）在当前数据上成立。
// 用法：node test/cases.test.js
const path = require("path");
const { ok, near, section, done } = require("./harness.js");
const R = path.join(__dirname, "../src/");
const QL = require(R + "core.js")({});
global.QLCS = require(R + "cases/stats.js");
global.QLCASE_BIKE = require(R + "cases/data-bike.js");
global.QLCASE_AMES = require(R + "cases/data-ames.js");
global.QLCASE_SPX = require(R + "cases/data-spx.js");
global.QLCASE_DOCK = require(R + "cases/sim-dock.js");
const CB = require(R + "cases/case-bike.js"), CD = require(R + "cases/case-dock.js"), CA = require(R + "cases/case-ames.js"), CS = require(R + "cases/case-spx.js");
const S = QLCS;
// 独立计算（numpy，定义与案例里的一致）得到的参照值
const REF = {
  bike: { b_mean: 208.12055307046, b_hw: 128.9355958304207, b_l168: 114.85293161629772, b_l1: 119.93527409149209, pois_nolags: 78.51556008512956, ols_nolags: 102.64819177049742, pois_lags: 42.83499404712381 },
  ames: { bed_alone: 0.08734691861709573, bed_alone_se: 0.008927696824630384, bed_with: -0.14368886604315878, bed_with_se: 0.006882690539043577, bed_with_hc: 0.007090716531902485, logA_with: 1.1161981782368584, lvl_alone: 13264.195976153727, lvl_with: -32482.285396708834, time_rmse: 0.15762309012219744 },
  spx: { ac1: 0.27422797370188784, kurt: 11.223741195867643, levelR2: 0.9985753721664304,
    cape1: { n: 1709, b: -0.004589244213764985, r2: 0.002163246617299497, t: -1.9237118890402953, tnw: -1.6167304960931423 },
    cape12: { n: 1698, b: -0.09970530831141314, r2: 0.051447225836461996, t: -9.590983755995598, tnw: -3.3234147794714817 },
    cape120: { n: 1590, b: -0.6511115606152627, r2: 0.296064691278927, t: -25.84355072617204, tnw: -4.7268132869466335 } }
};
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-12, Math.abs(b));

section("数据：解码后与原文件一致");
const B = QLCASE_BIKE.decode();
ok(B.n === 17379, "共享单车 17379 行", B.n);
ok(B.cnt.reduce((a, b) => a + b, 0) === 3292679, "共享单车两年总租车次数 3,292,679（UCI 公布的合计）");
ok(B.hours === 17544 && B.hours - B.n === 165, "两年 17544 个小时，缺 165 个");
ok(B.work.reduce((a, b) => a + b, 0) === 11865, "由日期和节假日推出的工作日与 UCI 的 workingday 一致（11865 个小时）");
ok(B.t[0] === 0 && B.hr[1] === 1 && B.weekday[0] === 6, "2011-01-01 是周六、从 0 点开始");
ok(B.casual[0] === 3 && B.registered[0] === 13 && B.cnt[16] === 93, "第一行 3 + 13 = 16；第 17 行 93", [B.casual[0], B.registered[0], B.cnt[16]]);
const A = QLCASE_AMES.decode();
ok(A.n === 2930, "房价 2930 行");
near(A.price.reduce((a, b) => a + b, 0) / A.n, 180796.0600682594, 1e-6, "价格均值与原文件相同");
ok(Array.from(A.area).filter((v) => v > 4000).length === 5, "面积超过 4000 平方英尺的恰好 5 套");
ok(Array.from(A.lotFrontage).filter((v) => !(v === v)).length === 490, "临街长度缺 490 个");
ok(A.garageType.filter((v) => v == null).length === 157, "没有车库的 157 套", A.garageType.filter((v) => v == null).length);
ok(A.saleCond.filter((v) => v === "Family").length === 46 && A.saleCond.filter((v) => v === "Normal").length === 2413, "成交方式的计数");
const X = QLCASE_SPX.decode();
ok(X.n === 1869 && X.year[X.n - 1] === 2026 && X.month[X.n - 1] === 9, "Shiller 月度数据 1871-01 至 2026-09");
ok(X.P[0] === 4.44 && X.P[X.n - 1] === 7669.41 && X.P[1500] === 614.42, "指数的首尾与中间一个值");

section("数值工具");
{
  const rng = new QL.RNG(3, 0, 0), n = 4000, x = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) { x[i] = rng.normal(); y[i] = 1 + 2 * x[i] + rng.normal() * (1 + Math.abs(x[i])); }
  const rows = S.rowsOf(n), D = S.design([{ name: "截距", f: () => 1 }, { name: "x", f: (i) => x[i] }], rows), f = S.ols(D, y, { nw: 0 });
  const mx = S.mean(x), my = S.mean(y); let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  near(f.beta[1], sxy / sxx, 1e-10, "一元回归的斜率 = Cov/Var");
  near(f.r2, S.corr(x, y) ** 2, 1e-10, "一元回归 R² = ρ²");
  near(f.seNW[1] * Math.sqrt(n / (n - 2)), f.seHC[1], 1e-10, "滞后 0 阶的 Newey–West 就是 HC0（差一个 n/(n−p)）");
  ok(f.seHC[1] > f.se[1] * 1.1, "异方差时稳健标准误比经典的大", [f.se[1], f.seHC[1]]);
  const dup = Int32Array.from([...rows, ...rows]), f2 = S.ols(S.design([{ name: "截距", f: () => 1 }, { name: "x", f: (i) => x[i] }], dup), Float64Array.from(dup, (i) => y[i]));
  near(f2.beta[1], f.beta[1], 1e-12, "复制数据：系数不变");
  near(f2.se[1] / f.se[1], Math.sqrt((n - 2) / (2 * n - 2)), 1e-10, "复制数据：标准误乘 √((n−p)/(2n−p)) ≈ 1/√2");
  const v = S.vif(S.design([{ name: "截距", f: () => 1 }, { name: "x", f: (i) => x[i] }, { name: "y", f: (i) => y[i] }], rows));
  near(v[0].vif, 1 / (1 - S.corr(x, y) ** 2), 1e-8, "两个特征时 VIF = 1/(1 − ρ²)");
  // Poisson：模拟数据上找回系数；offset 的作用
  const m = 20000, z = new Float64Array(m), e = new Float64Array(m), cnt = new Float64Array(m);
  for (let i = 0; i < m; i++) { z[i] = rng.normal(); e[i] = 0.2 + rng.u(); cnt[i] = rng.poisson(e[i] * Math.exp(0.5 + 0.8 * z[i])); }
  const Dp = S.design([{ name: "截距", f: () => 1 }, { name: "z", f: (i) => z[i] }], S.rowsOf(m)), off = Float64Array.from(e, Math.log), fp = S.poisson(Dp, cnt, off);
  ok(fp.converged && Math.abs(fp.beta[0] - 0.5) < 3 * fp.se[0] + 0.01 && Math.abs(fp.beta[1] - 0.8) < 3 * fp.se[1] + 0.01, "Poisson 回归（带 offset）找回系数 0.5、0.8", Array.from(fp.beta));
  near(fp.phi, 1, 0.05, "真 Poisson 数据的离散度 φ ≈ 1");
  near(S.quantile([1, 2, 3, 4], 0.25), 1.75, 1e-12, "分位数按 numpy 的定义（线性插值）");
  ok(S.poissonQuantile(3, 0.5) === 3 && S.poissonQuantile(0.5, 0.9) === 1, "Poisson 分位数");
  near(S.pinball([1, 2, 3], [2, 2, 2], 0.8), (0.2 * 1 + 0 + 0.8 * 1) / 3, 1e-12, "分位数损失");
  near(S.normCdf(1.959964), 0.975, 2e-7, "正态分布函数");
}

section("案例一：共享单车");
const cb = { ui: {}, cache: {} }; CB.compute.prep(cb); const Kb = CB.compute;
ok(cb.X.rows.train.length === 12591 && cb.X.rows.test.length === 2098, "训练 12591 小时、测试 2098 小时（三个滞后都在的行）");
const g = Kb.gaps(cb.X);
ok(g[0].hours === 36 && Kb.dateStr(Math.floor(g[0].from / 24)) === "2012-10-29", "最长的缺失 36 小时，从 2012-10-29 开始（飓风桑迪）");
ok(Kb.dateStr(Math.floor(g[1].from / 24)) === "2011-01-26" && Kb.dateStr(Math.floor(g[2].from / 24)) === "2011-08-27", "第二、三长的缺失在 2011-01-26 与 2011-08-27");
const bl = Kb.baselines(cb.X, cb.X.rows.test), blm = {}; bl.forEach((b) => { blm[b.id] = b.rmse; });
["mean", "hw", "l168", "l1"].forEach((k) => near(blm[k], REF.bike["b_" + (k === "mean" ? "mean" : k)], 1e-8, "baseline " + k + " 与 numpy 一致"));
ok(bl.slice().sort((a, b) => a.rmse - b.rmse)[0].id === "l168", "正文：上周同一小时是最强的 baseline");
const F0 = Kb.FULL, fl = (m, o) => Kb.fit(cb.X, m, Object.assign({}, F0, o), cb.X.rows.train, cb.X.rows.test);
const pNo = fl("poisson", { lags: false }), pAll = fl("poisson", {}), oNo = fl("ols", { lags: false }), oAll = fl("ols", {}), lk = fl("poisson", { leak: true }), noTrend = fl("poisson", { lags: false, trend: false });
near(pNo.rmse, REF.bike.pois_nolags, 1e-6, "Poisson（无滞后）测试 RMSE 与 numpy 一致");
near(pAll.rmse, REF.bike.pois_lags, 1e-6, "Poisson（全部特征）测试 RMSE 与 numpy 一致");
near(oNo.rmse, REF.bike.ols_nolags, 1e-6, "线性回归（无滞后）测试 RMSE 与 numpy 一致");
ok(pAll.rmse < blm.l168, "正文：Poisson 打败最强的 baseline");
ok(oAll.neg > 0 && oNo.neg > 0 && pAll.neg === 0, "正文：线性回归会给出负的预测，Poisson 不会", [oNo.neg, oAll.neg]);
ok(oAll.rmse / pAll.rmse > 1.15 && oAll.rmse / pAll.rmse < 1.5 && oNo.rmse / pNo.rmse > 1.15 && oNo.rmse / pNo.rmse < 1.5, "追问里说的“线性回归的 RMSE 高三成左右”", [oAll.rmse / pAll.rmse, oNo.rmse / pNo.rmse]);
ok(lk.rmse < 0.7 * pAll.rmse, "正文：泄漏让成绩好看得多", lk.rmse);
ok(noTrend.rmse > 1.4 * pNo.rmse, "去掉趋势之后差很多（增长让历史平均失效）", noTrend.rmse);
ok(pAll.f.phi > 2, "Poisson 的离散度明显大于 1（过度离散）", pAll.f.phi);
const rv = Kb.randomVsTime(cb.X, "poisson", F0, new QL.RNG(7, 0, 0));
ok(rv.random.rmse < rv.time.rmse, "正文：随机切分的成绩比按时间切分好看", [rv.random.rmse, rv.time.rmse]);
{
  let s1 = 0, s2 = 0; for (let d = 0; d < 365; d++); const daily = new Float64Array(731); for (let i = 0; i < B.n; i++) daily[B.day[i]] += B.cnt[i];
  for (let d = 0; d < 365; d++) s1 += daily[d]; for (let d = 365; d < 731; d++) s2 += daily[d];
  ok(s2 / 366 / (s1 / 365) > 1.5, "正文：第二年整体高出一截", s2 / 366 / (s1 / 365));
}

section("案例二：车桩（模拟）");
CD.compute.setRng(QL.RNG);
const Kd = CD.compute, od = Object.assign({}, Kd.DEF), sim = Kd.run(od), est = QLCASE_DOCK.estimate(sim, 1);
{
  const sim2 = Kd.run(od); ok(JSON.stringify(sim2.recs.slice(0, 50)) === JSON.stringify(sim.recs.slice(0, 50)), "同样的种子得到同样的模拟");
  let bad = 0; sim.recs.forEach((r) => { if (r.pick > r.wantP || r.ret > r.wantR || r.avail < -1e-9 || r.avail > 60 + 1e-9 || r.bikes0 < 0 || r.bikes0 > od.cap) bad++; });
  ok(bad === 0, "记录自洽：成交 ≤ 需求，有车的分钟数在 0–60，车数在 0–容量");
  let tP = 0, tN = 0; for (let h = 0; h < 24; h++) { tP += est.truth[h]; tN += est.naive[h]; }
  ok(tN < tP, "正文：直接平均低估了全天的需求");
  ok(est.naive[8] / est.truth[8] < 0.85, "8 点的直接平均明显偏低", est.naive[8] / est.truth[8]);
  ok(Math.abs(est.offset[8] / est.truth[8] - 1) < Math.abs(est.naive[8] / est.truth[8] - 1), "8 点：暴露量修正比直接平均更接近真相");
}
const rep = Kd.replicate(od, 8, 30), rep0 = Kd.replicate(Object.assign({}, od, { daySd: 0 }), 8, 30);
ok(rep.naive.rel < -0.2 && rep.dropped.rel < -0.15, "30 次模拟：直接平均和只用一直有车的小时都偏低两成左右以上", [rep.naive.rel, rep.dropped.rel]);
ok(Math.abs(rep.offset.rel) < 0.1 && rep.offset.rmse < rep.naive.rmse / 2, "30 次模拟：暴露量修正的偏差在一成以内", rep.offset.rel);
ok(Math.abs(rep0.offset.rel) < 0.03, "需求没有日间波动时，暴露量修正几乎无偏", rep0.offset.rel);
ok(rep0.offset.rel - rep.offset.rel > 0, "日间波动让暴露量修正偏低（按有车的时间加权偏向需求小的日子）", [rep0.offset.rel, rep.offset.rel]);
const dc = Kd.decide(od, est, 5, 1, 300);
ok(dc.naive < dc.best && dc.costNaive > dc.costBest && dc.costOffset <= dc.costNaive, "决策：按直接平均补得少、成本更高", [dc.best, dc.naive, dc.offset]);
near(dc.tau, 5 / 6, 1e-12, "τ* = c_u/(c_u + c_o)");

section("案例三：房价");
const ca = { ui: {}, cache: {} }; CA.compute.prep(ca); const Ka = CA.compute, rowsA = Ka.sample(ca.X, { dropBig: true });
ok(rowsA.length === 2925, "去掉 5 套之后 2925 笔");
const bd = Ka.bedroom(ca.X, rowsA);
near(bd.logAlone.beta[1], REF.ames.bed_alone, 1e-10, "卧室数单独回归的系数与 numpy 一致");
near(bd.logAlone.se[1], REF.ames.bed_alone_se, 1e-10, "…标准误");
near(bd.logWith.beta[1], REF.ames.bed_with, 1e-10, "加上面积之后的系数与 numpy 一致");
near(bd.logWith.se[1], REF.ames.bed_with_se, 1e-10, "…经典标准误");
near(bd.logWith.seHC[1], REF.ames.bed_with_hc, 1e-10, "…HC1 标准误");
near(bd.logWith.beta[2], REF.ames.logA_with, 1e-10, "…log 面积的系数");
ok(rel(bd.lvlAlone.beta[1], REF.ames.lvl_alone) < 1e-9 && rel(bd.lvlWith.beta[1], REF.ames.lvl_with) < 1e-9, "原价尺度的两个系数与 numpy 一致");
ok(bd.logAlone.beta[1] > 0 && bd.logWith.beta[1] < 0 && bd.lvlAlone.beta[1] > 0 && bd.lvlWith.beta[1] < 0, "正文：放不放面积，卧室数的符号相反");
const base = Ka.baselineCV(ca.X, rowsA, Ka.foldsOf(rowsA, new QL.RNG(11, 0, 0)));
ok(base.ppsf < base.median * 0.65, "“每平方英尺多少钱”比中位数好得多", base);
const cvLog = Ka.cv(ca.X, Ka.columns(ca.X, { nbhd: true, year: true }), "log", rowsA, Ka.foldsOf(rowsA, new QL.RNG(11, 0, 0)));
const cvLvl = Ka.cv(ca.X, Ka.columns(ca.X, { nbhd: true, year: true }), "level", rowsA, Ka.foldsOf(rowsA, new QL.RNG(11, 0, 0)));
ok(cvLog.rmseLog < base.ppsf * 0.7, "回归明显比“每平方英尺”好", cvLog.rmseLog);
ok(cvLog.rmseLog < cvLvl.rmseLog, "对数目标的相对误差比原价目标小", [cvLog.rmseLog, cvLvl.rmseLog]);
const sp = Ka.splits(ca.X, rowsA, new QL.RNG(11, 0, 0));
near(sp.time.rmseLog, REF.ames.time_rmse, 1e-9, "按时间切分（2010 年测）的误差与 numpy 一致");
ok(sp.time.rmseLog > sp.random.rmseLog && sp.groupNoFE.rmseLog > sp.random.rmseLog, "正文：按时间、按街区切分都比随机切分难", [sp.random.rmseLog, sp.time.rmseLog, sp.groupNoFE.rmseLog]);
{
  const big = Object.keys(sp.resN).map((k) => ({ k, m: sp.resN[k][0] / sp.resN[k][1], n: sp.resN[k][1] })).filter((o) => o.n >= 20).sort((a, b) => Math.abs(b.m) - Math.abs(a.m));
  ok(big.filter((o) => Math.abs(o.m) > 0.05).length >= 1, "成交 20 笔以上的街区里有偏差超过 5% 的", big.slice(0, 3));
  const cols = Ka.columns(ca.X, { nbhd: false, year: false }), v0 = S.vif(S.design(cols, rowsA))[0].vif, v1 = S.vif(S.design(cols.concat([{ name: "rooms", f: (i) => A.rooms[i] }]), rowsA))[0].vif;
  ok(v1 > v0 + 0.5, "加上房间总数之后面积的 VIF 升高", [v0, v1]);
  // 残差的异方差：原价目标时，最贵一组的残差均方根比中间几组大得多；对数目标时差不多
  const f = S.ols(S.design(Ka.columns(ca.X, { nbhd: true, year: true }), rowsA), Float64Array.from(rowsA, (i) => A.price[i]));
  const idx = Array.from(f.fitted.keys()).sort((a, b) => f.fitted[a] - f.fitted[b]), q = [];
  for (let k = 0; k < 5; k++) { const seg = idx.slice(Math.floor(k * idx.length / 5), Math.floor((k + 1) * idx.length / 5)); q.push(Math.sqrt(S.mean(seg.map((j) => f.resid[j] ** 2)))); }
  ok(q[4] > 1.8 * q[1], "原价目标：贵的那一组残差大得多（异方差）", q.map((v) => Math.round(v)));
}

section("案例四：标普 500");
const cs = { ui: {}, cache: {} }; CS.compute.prep(cs); const Ks = CS.compute, XS = cs.X;
ok(Ks.ym(XS.lastD) === "2023-06", "股息最后一个有记录的月份是 2023-06");
const z = Ks.zeros(XS);
ok(z.D.count === 39 && z.CPI.count === 36 && z.PE10.count === 156 && z.PE10.runs.length === 2 && Ks.ym(z.PE10.runs[0][1]) === "1880-12", "写成 0 的缺失：股息 39、CPI 36、CAPE 156（两段）");
const lv = Ks.levelVsReturn(XS);
near(lv.levelR2, REF.spx.levelR2, 1e-10, "“下月 = 本月”的 R² 与 numpy 一致"); near(lv.retCorr, REF.spx.ac1, 2e-3, "收益的一阶相关接近一阶自相关");
const rr = Ks.monthlyReturns(XS);
near(S.autocorr(rr, 1), REF.spx.ac1, 1e-12, "月收益的一阶自相关与 numpy 一致");
near(S.moments(rr).kurt, REF.spx.kurt, 1e-9, "超额峰度与 numpy 一致");
{
  const band = 2 / Math.sqrt(rr.length), absr = rr.map(Math.abs); let all = true; for (let k = 1; k <= 24; k++) if (S.autocorr(absr, k) <= band) all = false;
  ok(all, "正文：收益绝对值的自相关在 24 期上都高于 2/√n");
}
const w = Ks.working(6000, 21, new QL.RNG(5, 0, 0));
near(w.theory, 440 / 1766, 1e-12, "Working：m = 21 时 (m²−1)/(2(2m²+1))");
ok(Math.abs(w.avg - w.theory) < 0.04 && Math.abs(w.end) < 0.04, "模拟：月均价的收益自相关 ≈ 0.25，月底价 ≈ 0", w);
{
  // Working 的方差与协方差公式：直接按增量的权重算
  const m = 21, delta = (k) => { const W = new Array(5 * m).fill(0); for (let d = 0; d < m; d++) { for (let j = 0; j <= k * m + d; j++) W[j] += 1 / m; for (let j = 0; j <= (k - 1) * m + d; j++) W[j] -= 1 / m; } return W; };
  const a = delta(2), b = delta(3), c = delta(4);
  near(a.reduce((s, x) => s + x * x, 0), (2 * m * m + 1) / (3 * m), 1e-10, "Var(Δ) = (2m²+1)/(3m)");
  near(a.reduce((s, x, j) => s + x * b[j], 0), (m * m - 1) / (6 * m), 1e-10, "Cov(Δ_k, Δ_{k+1}) = (m²−1)/(6m)");
  near(a.reduce((s, x, j) => s + x * c[j], 0), 0, 1e-10, "隔一个月的协方差为 0");
}
const mo = Ks.momentum(XS);
ok(mo.m12.t[1] > 3 && mo.m121.t[1] < mo.m12.t[1] / 1.5, "正文：跳过最近一个月之后动量的 t 值小了很多", [mo.m12.t[1], mo.m121.t[1]]);
[1, 12, 120].forEach((h) => {
  const c = Ks.cape(XS, h, 0, 1881), r0 = REF.spx["cape" + h];
  ok(c.n === r0.n, "CAPE h=" + h + " 的样本数", c.n);
  ok(rel(c.f.beta[1], r0.b) < 1e-9 && rel(c.f.r2, r0.r2) < 1e-9 && rel(c.f.t[1], r0.t) < 1e-9 && rel(c.f.tNW[1], r0.tnw) < 1e-9, "CAPE h=" + h + "：系数、R²、两种 t 值与 numpy 一致");
});
ok(Ks.cape(XS, 120, 0, 1881).f.r2 > Ks.cape(XS, 12, 0, 1881).f.r2 && Math.abs(Ks.cape(XS, 120, 0, 1881).f.tNW[1]) < Math.abs(Ks.cape(XS, 120, 0, 1881).f.t[1]) / 3, "正文：预测期越长 R² 越高，Newey–West 的 t 值小得多");
const oo = Ks.oos(XS, 0, 1950);
near(oo.r2, -0.002426495811910012, 1e-9, "样本外 R²（1950 年起）与 numpy 一致");
ok(oo.n === 881, "样本外预测了 881 个月", oo.n);
const nz = Ks.noise(XS, 100, new QL.RNG(9, 0, 0));
ok(nz.big >= 1 && Math.abs(nz.max) > 2, "100 个噪声里至少有一个 |t| > 2", nz);

section("交给机器学习实验室的表");
{
  global.QLCaseApp = { U: { QL: QL } };
  const csvText = (rows) => rows.map((r) => r.map((v) => (v == null || (typeof v === "number" && !(v === v)) ? "" : String(v))).join(",")).join("\n");
  [[CB, cb], [CA, ca], [CS, cs]].forEach(([C, ctx]) => {
    const o = C.handoff(ctx);
    ok(o.rows.length > 1000 && o.rows.every((r) => r.length === o.header.length) && o.header.indexOf(o.target) >= 0, C.id + "：表头和每一行一样长，要预测的列在表里", [o.rows.length, o.header.length]);
    ok(csvText([o.header].concat(o.rows)).indexOf("\"") < 0, C.id + "：没有需要转义的单元格");
  });
  const od2 = { ui: {}, cache: {} }; od2.memo = (k, f) => (k in od2.cache ? od2.cache[k] : (od2.cache[k] = f()));
  const o = CD.handoff(od2);
  ok(o.rows.length === 140 * 24 && o.header.length === 8, "车桩：140 天 × 24 小时");
}
done();
