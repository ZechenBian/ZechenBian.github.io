// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
const { QL, world, ok, near, section, done } = require("./harness.js");
const ml = QL.ml, RNG = QL.RNG;
const g = new RNG(42, 0, 0);
function make(n, d, f, noise) { const rows = [], ys = []; for (let i = 0; i < n; i++) { const x = Array.from({ length: d }, () => g.normal()); rows.push(x); ys.push(f(x) + noise * g.normal()); } return ml.table(rows, ys); }
function r2(model, ds) { return ml.metrics(ml.predictAll(model, ds), ds.y).r2; }

section("线性模型");
{
  const beta = [1.5, -2, 0, 0.7], tr = make(4000, 4, x => 3 + x.reduce((s, v, j) => s + beta[j] * v * (j + 1), 0), 0.5);
  // 让各列尺度不同，检验标准化与还原
  for (let i = 0; i < tr.n; i++) { tr.X[i * 4 + 1] = tr.X[i * 4 + 1] * 10 + 5; tr.X[i * 4 + 3] *= 0.01; }
  const y2 = new Float64Array(tr.n); for (let i = 0; i < tr.n; i++) y2[i] = 3 + 1.5 * tr.X[i * 4] - 0.4 * tr.X[i * 4 + 1] + 210 * tr.X[i * 4 + 3] + 0.5 * g.normal(); tr.y = y2;
  const m = ml.ols(tr); near(m.coef[0], 1.5, 0.03, "OLS 系数 1"); near(m.coef[1], -0.4, 0.003, "OLS 系数 2（尺度 ×10）"); near(m.coef[2], 0, 0.03, "OLS 无关特征 ≈ 0"); near(m.coef[3], 210, 3, "OLS 系数 4（尺度 ×0.01）"); near(m.intercept, 3, 0.05, "OLS 截距");
  // 正规方程：残差与每个特征正交
  const pred = ml.predictAll(m, tr); let mx = 0; for (let j = 0; j < 4; j++) { let s = 0; for (let i = 0; i < tr.n; i++) s += (tr.y[i] - pred[i]) * tr.X[i * 4 + j]; mx = Math.max(mx, Math.abs(s) / tr.n); } ok(mx < 1e-6, "OLS 残差与特征正交", mx.toExponential(2));
  // 岭：与直接解 (Z'Z + λnI)β = Z'y 对照
  const lam = 0.5, mr = ml.ridge(tr, lam), sc = ml.scaler(tr); const d = 4, A = new Float64Array(16), b = new Float64Array(4), ym = ml.mean(tr.y);
  for (let i = 0; i < tr.n; i++) for (let j = 0; j < d; j++) { const zj = (tr.X[i * d + j] - sc.mean[j]) / sc.sd[j]; b[j] += zj * (tr.y[i] - ym); for (let k = 0; k < d; k++) A[j * d + k] += zj * (tr.X[i * d + k] - sc.mean[k]) / sc.sd[k]; }
  for (let j = 0; j < d; j++) A[j * d + j] += lam * tr.n;
  // 高斯消元（与实现里的 Cholesky 是两条不同的路）
  const M = []; for (let j = 0; j < d; j++) M.push(Array.from(A.subarray(j * d, j * d + d)).concat([b[j]])); for (let c = 0; c < d; c++) { for (let r = c + 1; r < d; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= d; k++) M[r][k] -= f * M[c][k]; } } const bz = new Array(d); for (let r = d - 1; r >= 0; r--) { let s = M[r][d]; for (let k = r + 1; k < d; k++) s -= M[r][k] * bz[k]; bz[r] = s / M[r][r]; }
  let dmax = 0; for (let j = 0; j < d; j++) dmax = Math.max(dmax, Math.abs(mr.coef[j] * sc.sd[j] - bz[j])); ok(dmax < 1e-8, "岭回归与正规方程一致", dmax.toExponential(2));
  ok(Math.abs(mr.coef[0]) < Math.abs(m.coef[0]), "岭把系数向 0 收缩");
  // Lasso：KKT 条件
  const alpha = 0.2, ml1 = ml.lasso(tr, alpha), Z = (i, j) => (tr.X[i * d + j] - sc.mean[j]) / sc.sd[j]; let lmax = 0; const res0 = Array.from(tr.y, v => v - ym);
  for (let j = 0; j < d; j++) { let c = 0; for (let i = 0; i < tr.n; i++) c += Z(i, j) * res0[i]; lmax = Math.max(lmax, Math.abs(c) / tr.n); } const lamL = alpha * lmax, pl = ml.predictAll(ml1, tr); let kkt = 0, nz = 0;
  for (let j = 0; j < d; j++) { let c = 0; for (let i = 0; i < tr.n; i++) c += Z(i, j) * (tr.y[i] - pl[i]); c /= tr.n; const bj = ml1.coef[j] * sc.sd[j]; if (bj !== 0) { nz++; kkt = Math.max(kkt, Math.abs(c - lamL * Math.sign(bj))); } else kkt = Math.max(kkt, Math.max(0, Math.abs(c) - lamL)); }
  ok(kkt < 1e-6 * lmax, "Lasso 满足 KKT 条件", kkt.toExponential(2)); ok(ml1.coef[2] === 0 && nz >= 2, "Lasso 把无关特征的系数压成恰好 0", Array.from(ml1.coef).map(v => v.toFixed(3)).join(","));
  ok(Array.from(ml.lasso(tr, 1.0).coef).every(v => v === 0), "alpha = 1 时所有系数为 0");
  // 逻辑回归：带惩罚的对数似然梯度为 0，且系数接近真值
  const lg = make(6000, 3, () => 0, 0); for (let i = 0; i < lg.n; i++) { const eta = 0.3 + 1.2 * lg.X[i * 3] - 0.8 * lg.X[i * 3 + 1]; lg.y[i] = g.u() < 1 / (1 + Math.exp(-eta)) ? 1 : 0; }
  const ll = ml.logistic(lg, { l2: 1e-6 }); near(ll.coef[0], 1.2, 0.12, "逻辑回归系数 1"); near(ll.coef[1], -0.8, 0.1, "逻辑回归系数 2"); near(ll.coef[2], 0, 0.1, "逻辑回归无关特征"); near(ll.intercept, 0.3, 0.1, "逻辑回归截距");
  let gmax = 0; const pr = ml.predictAll(ll, lg); for (let j = 0; j < 4; j++) { let s = 0; for (let i = 0; i < lg.n; i++) s += (lg.y[i] - pr[i]) * (j < 3 ? lg.X[i * 3 + j] : 1); gmax = Math.max(gmax, Math.abs(s) / lg.n); } ok(gmax < 2e-5, "逻辑回归：对数似然的梯度 ≈ 0", gmax.toExponential(2));
}
section("非参数模型");
{
  const f = x => Math.sin(1.5 * x[0]) + 0.5 * x[1] * x[1], tr = make(6000, 4, f, 0.2), te = make(2000, 4, f, 0.2);
  const lin = r2(ml.ols(tr), te), tree = ml.tree(tr, { depth: 6, minLeaf: 20 }), forest = ml.forest(tr, { trees: 60, depth: 8, minLeaf: 10, mtry: 2, rng: new RNG(1, 1, 1) }), gbm = ml.gbm(tr, { trees: 150, depth: 3, lr: 0.1, rng: new RNG(2, 2, 2) }), mlp = ml.mlp(tr, { hidden: [24], epochs: 40, lr: 0.01, rng: new RNG(3, 3, 3) }), knn = ml.knn(tr, { k: 15 });
  const R = { 线性: lin, 树: r2(tree, te), 森林: r2(forest, te), 提升: r2(gbm, te), 神经网络: r2(mlp, te), k近邻: r2(knn, te) }; console.log("   测试集 R²:", Object.entries(R).map(([k, v]) => k + " " + v.toFixed(3)).join("  "), " (噪声上限 ≈ " + (1 - 0.04 / (0.04 + 0.5 + 0.47)).toFixed(3) + ")");
  ok(lin < 0.35, "线性模型抓不住这个非线性函数"); ok(R.树 > 0.7, "回归树"); ok(R.森林 > 0.85, "随机森林"); ok(R.提升 > 0.9, "梯度提升"); ok(R.神经网络 > 0.9, "多层感知机"); ok(R.k近邻 > 0.75, "k 近邻");
  ok(tree.importance[0] + tree.importance[1] > 0.97 && forest.importance[0] + forest.importance[1] > 0.9 && gbm.importance[0] + gbm.importance[1] > 0.95, "树模型的重要性集中在两个有用的特征上");
  // 单个阶跃：深度 1 的树找到断点
  const st = make(3000, 2, x => (x[0] > 0.3 ? 2 : -1), 0.1), t1 = ml.tree(st, { depth: 1, minLeaf: 20, bins: 64 }); near(t1.nodes[0].t, 0.3, 0.06, "深度 1 的树找到阶跃的位置"); ok(t1.nodes[0].f === 0 && t1.leaves === 2, "在正确的特征上分裂");
  near(t1.predict([1, 0]), 2, 0.05, "右叶的均值"); near(t1.predict([-1, 0]), -1, 0.05, "左叶的均值");
  // k 近邻学 Logistic 映射
  const rows = [], ys = []; let x = 0.123; for (let i = 0; i < 3000; i++) { const nx = 4 * x * (1 - x); rows.push([x]); ys.push(nx); x = nx; if (!(x > 1e-9 && x < 1)) x = 0.3; }
  const lm = ml.table(rows.slice(0, 2500), ys.slice(0, 2500)), lt = ml.table(rows.slice(2500), ys.slice(2500)); ok(r2(ml.knn(lm, { k: 3 }), lt) > 0.995, "k 近邻几乎完美地预测 Logistic 映射"); ok(Math.abs(r2(ml.ols(lm), lt)) < 0.02, "线性回归在 Logistic 映射上 R² ≈ 0", r2(ml.ols(lm), lt).toFixed(4));
}
section("状态空间模型");
{
  // 卡尔曼：稳态增益
  const Q = 2e-6, Rv = 1e-4, kf = ml.kalman({ q: Q, r: Rv }); for (let i = 0; i < 2000; i++) kf.update(g.normal() * 0.01); const Pp = (Q + Math.sqrt(Q * Q + 4 * Q * Rv)) / 2; near(kf.k, Pp / (Pp + Rv), 1e-9, "卡尔曼滤波的稳态增益");
  // 跟踪一个缓慢游走的均值：滤波误差小于直接用观测
  let m = 0, e1 = 0, e2 = 0; const k2 = ml.kalman({ q: Q, r: Rv }); for (let i = 0; i < 20000; i++) { m += Math.sqrt(Q) * g.normal(); const y = m + Math.sqrt(Rv) * g.normal(), est = k2.update(y); e1 += (est - m) ** 2; e2 += (y - m) ** 2; } ok(e1 < 0.2 * e2, "滤波后的均方误差远小于原始观测", (e1 / e2).toFixed(3)); near(e1 / 20000, k2.p, 0.15 * k2.p, "实际误差方差 ≈ 滤波器报告的 P");
  // HMM：参数复原
  const mu = [0.001, -0.002], sd = [0.008, 0.02], stay = [0.98, 0.95], seqs = []; for (let s = 0; s < 60; s++) { const y = new Float64Array(400); let st = g.u() < 0.7 ? 0 : 1; for (let t = 0; t < 400; t++) { y[t] = mu[st] + sd[st] * g.normal(); if (g.u() > stay[st]) st = 1 - st; } seqs.push(y); }
  const h = ml.hmm(seqs, { states: 2, iters: 40 }); console.log("   HMM: mu", h.mu.map(v => v.toExponential(2)), "sd", h.sd.map(v => v.toFixed(4)), "A", h.A.map(r => r.map(v => v.toFixed(3))));
  near(h.sd[0], 0.008, 0.001, "HMM 低波动状态的标准差"); near(h.sd[1], 0.02, 0.002, "HMM 高波动状态的标准差"); near(h.A[0][0], 0.98, 0.012, "HMM 牛市的自留概率"); near(h.A[1][1], 0.95, 0.03, "HMM 熊市的自留概率"); near(h.mu[0], 0.001, 0.0006, "HMM 牛市均值"); near(h.mu[1], -0.002, 0.002, "HMM 熊市均值");
  let mono = true; for (let i = 1; i < h.llHistory.length; i++) if (h.llHistory[i] < h.llHistory[i - 1] - 1e-6 * Math.abs(h.llHistory[i])) mono = false; ok(mono, "EM 的对数似然单调不减", h.llHistory.slice(0, 5).map(v => v.toFixed(1)).join(" → "));
  near(h.stationary[0], 0.05 / 0.07, 0.08, "平稳分布");
  // 在线滤波能识别状态
  let st = 0, hit = 0, tot = 0; const F = h.filter(); for (let t = 0; t < 20000; t++) { const y = mu[st] + sd[st] * g.normal(); const p = F.update(y); if (g.u() > stay[st]) st = 1 - st; tot++; if ((p[0] > 0.5) === (st === 0)) hit++; } ok(hit / tot > 0.8, "在线滤波对下一步状态的判断准确率", (hit / tot).toFixed(3));
}
section("从世界里取样本：时间对齐");
{
  const B = QL.makeBatch(world("ar1", { mu: 5, sigma: 20, phi: 0.3 }, 600, 252), null, 0), D = QL.makeData(B);
  const ds = ml.dataset(D, s => [s.ret(0), s.ret(1)], { warmup: 3, maxRows: 30000 }), m = ml.ols(ds); near(m.coef[0], 0.3, 0.02, "AR(1)：用最近一步收益预测下一步，斜率 = φ"); near(m.coef[1], 0, 0.02, "AR(1)：再往前一步没有额外信息");
  ok(ds.n > 20000 && ds.n <= 30000 && ds.d === 2, "样本数受上限控制", String(ds.n));
  const tr = ml.dataset(D, s => [s.ret(0)], { warmup: 3, from: 0, to: 480 }), va = ml.dataset(D, s => [s.ret(0)], { warmup: 3, from: 480, to: 600 }), dg = ml.diagnose(ml.ols(tr), tr, va, ["最近一步收益"], { truth: x => 0.05 / 252 + 0.3 * (x - 0.05 / 252) });
  near(dg.r2Valid, 0.09, 0.02, "验证集 R² ≈ φ² = 0.09"); near(dg.ic, 0.3, 0.03, "IC ≈ φ"); ok(dg.calib.length === 10 && dg.pd.xs.length === 41 && dg.pd.truth.length === 41 && dg.importance.length === 1 && dg.importance[0] > 0.05, "诊断报告结构完整");
  let worst = 0; dg.pd.xs.forEach((x, i) => { worst = Math.max(worst, Math.abs(dg.pd.yhat[i] - dg.pd.truth[i])); }); ok(worst < 0.0006, "学到的函数贴近真实条件期望", worst.toExponential(2));
  // 预热期的 NaN 行被丢掉
  const d2 = ml.dataset(D, s => [s.mom(20), s.vol(20)], { maxRows: 5000 }); ok(d2.n > 3000 && Array.from(d2.X).every(v => v === v), "含 NaN 的行不进入数据集", String(d2.n));
  // 鞅世界：验证集 R² 不显著为正
  const B0 = QL.makeBatch(world("gbm", { mu: 0, sigma: 20 }, 600, 252), null, 0), D0 = QL.makeData(B0), f5 = s => [s.ret(0), s.ret(1), s.ret(2), s.mom(10), s.vol(10)];
  const t0 = ml.dataset(D0, f5, { warmup: 12, from: 0, to: 480 }), v0 = ml.dataset(D0, f5, { warmup: 12, from: 480, to: 600 }), fo = ml.forest(t0, { trees: 40, depth: 6, rng: new RNG(5, 5, 5) }), dz = ml.diagnose(fo, t0, v0, []);
  console.log("   GBM（不可预测）上的随机森林：训练 R² =", dz.r2Train.toFixed(4), " 验证 R² =", dz.r2Valid.toFixed(4), " IC =", dz.ic.toFixed(4), "±", dz.icSE.toFixed(4)); ok(dz.r2Train > 0.005 && dz.r2Valid < 0.003 && Math.abs(dz.ic) < 3.5 * dz.icSE, "不可预测的世界里：训练集有\"拟合\"，验证集没有");
}

section("审阅后补的检查");
{
  // Lasso：特征高度相关时也要收敛（以前 200 轮就停，离最优解很远）
  { const n = 3000, rows = [], ys = []; for (let i = 0; i < n; i++) { const a = g.normal(), b = 0.999 * a + Math.sqrt(1 - 0.999 * 0.999) * g.normal(); rows.push([a, b]); ys.push(a - b + 0.1 * g.normal()); }
    const ds = ml.table(rows, ys), o = ml.ols(ds), l0 = ml.lasso(ds, 0); near(l0.coef[0], o.coef[0], 1e-5, "Lasso（α = 0，相关系数 0.999）= OLS：系数 1"); near(l0.coef[1], o.coef[1], 1e-5, "Lasso（α = 0，相关系数 0.999）= OLS：系数 2");
    const sc = ml.scaler(ds), ym = ml.mean(ds.y), al = 0.02, l1 = ml.lasso(ds, al), pr = ml.predictAll(l1, ds); let lmax = 0, kkt = 0;
    for (let j = 0; j < 2; j++) { let c = 0; for (let i = 0; i < n; i++) c += (ds.X[i * 2 + j] - sc.mean[j]) / sc.sd[j] * (ds.y[i] - ym); lmax = Math.max(lmax, Math.abs(c) / n); }
    for (let j = 0; j < 2; j++) { let c = 0; for (let i = 0; i < n; i++) c += (ds.X[i * 2 + j] - sc.mean[j]) / sc.sd[j] * (ds.y[i] - pr[i]); c /= n; const bj = l1.coef[j] * sc.sd[j]; kkt = Math.max(kkt, bj !== 0 ? Math.abs(c - al * lmax * Math.sign(bj)) : Math.max(0, Math.abs(c) - al * lmax)); }
    ok(kkt < 1e-6 * lmax, "Lasso（相关系数 0.999）满足 KKT 条件", (kkt / lmax).toExponential(2)); }
  // 取样：行数正好是 maxRows，而且不会只抽到同一个时刻
  { const B = QL.makeBatch(world("gbm", null, 250, 125), null, 0), D = QL.makeData(B), ft = s => [s.t];
    const a = ml.dataset(D, ft, { warmup: 25, maxRows: 2000, from: 0, to: 200, target: (DD, n) => n });   // 每条路径 100 个时刻，共 20000 格，取 2000：固定步长 10 会与 100 共振
    const ts = new Set(Array.from(a.X)), ps = new Set(Array.from(a.y)); ok(a.n === 2000 && ts.size >= 95 && ps.size === 200, "取样在时刻和路径上都铺开", `${a.n} 行，${ts.size} 个时刻，${ps.size} 条路径`);
    const cnt = new Map(); for (const t of a.X) cnt.set(t, (cnt.get(t) || 0) + 1); const mx = Math.max(...cnt.values()), mn = Math.min(...cnt.values()); ok(mx <= 45 && mn >= 5, "各个时刻被抽到的次数大致均匀", `每个时刻 ${mn}–${mx} 次（平均 20）`);
    const b = ml.dataset(D, ft, { warmup: 25, maxRows: 19999, from: 0, to: 200 }); ok(b.n === 19999, "上限只比总数少 1 时不会丢掉一半", String(b.n));
    const c = ml.dataset(D, ft, { warmup: 25, maxRows: 50000, from: 0, to: 200 }); ok(c.n === 20000, "上限够大时一行不少", String(c.n));
    const a2 = ml.dataset(D, ft, { warmup: 25, maxRows: 2000, from: 0, to: 200, target: (DD, n) => n }); ok(a2.n === a.n && a2.X.every((v, i) => v === a.X[i]), "取样可复现");
    // 特征个数以预热之后为准，长度不足的行丢掉
    const r5 = ml.dataset(D, s => s.rets(5), { from: 0, to: 2 }); ok(r5.d === 5 && r5.n === 2 * (124 - 5 + 1), "s.rets(5) 作特征：d = 5，预热期的行被丢掉", `d=${r5.d} n=${r5.n}`);
    const e0 = ml.dataset(D, s => [s.mom(400)], {}); ok(e0.n === 0 && e0.d === 1, "特征全是 NaN 时得到空数据集而不是报错"); }
  // 空训练集：报出说得清的错误，不死循环
  { const empty = ml.table([], []); for (const [nm, fn] of [["ols", () => ml.ols(empty)], ["lasso", () => ml.lasso(empty, 0.1)], ["logistic", () => ml.logistic(empty)], ["knn", () => ml.knn(empty, { k: 3 })], ["tree", () => ml.tree(empty)], ["forest", () => ml.forest(empty)], ["gbm", () => ml.gbm(empty)], ["mlp", () => ml.mlp(empty)]]) { let msg = ""; try { fn(); } catch (e) { msg = e.message; } ok(/训练集只有 0 行/.test(msg), `ml.${nm} 在空训练集上报错`, msg.slice(0, 30)); }
    const tiny = make(5, 2, x => x[0], 0.1), mt = ml.mlp(tiny, { hidden: [4], epochs: 3 }); ok(isFinite(mt.predict([0, 0])), "只有 5 行时神经网络也能训练完（批大小不为 0）"); }
  // k 近邻保留的训练点数
  { const ds = make(3001, 2, x => x[0], 0.1); ok(ml.knn(ds, { k: 5 }).nTrain === 3000, "3001 行保留 3000 行（以前会丢到 1501）"); ok(ml.knn(make(100, 2, x => x[0], 0.1), { k: 5 }).nTrain === 100, "不足上限时全部保留"); }
  // 分箱数很大时树不出错
  { const rows = [], ys = []; for (let i = 0; i < 4000; i++) { const x = g.u(); rows.push([x]); ys.push(x > 0.37 ? 1 : 0); } const ds = ml.table(rows, ys), t = ml.tree(ds, { depth: 3, minLeaf: 5, bins: 400 }); ok(ml.metrics(ml.predictAll(t, ds), ds.y).mse < 0.01, "bins = 400 的树能拟合阶跃函数", ml.metrics(ml.predictAll(t, ds), ds.y).mse.toExponential(2)); }
  // HMM 的平稳分布：状态很持久时也要真的平稳
  { const seq = new Float64Array(60000); let st = 0; for (let t = 0; t < seq.length; t++) { if (g.u() < (st ? 0.002 : 0.0007)) st = 1 - st; seq[t] = st ? -0.5 + g.normal() : 0.5 + 0.5 * g.normal(); }
    const m = ml.hmm([seq], { states: 2, iters: 30 }), pi = m.stationary; let worst = 0; for (let j = 0; j < 2; j++) worst = Math.max(worst, Math.abs(pi[0] * m.A[0][j] + pi[1] * m.A[1][j] - pi[j]));
    const exact = m.A[1][0] / (m.A[0][1] + m.A[1][0]); ok(worst < 1e-10, "π = πA（转移概率约 0.001 的链）", worst.toExponential(2)); near(pi[0], exact, 1e-9, "平稳分布等于两状态的闭式解"); near(pi[0] + pi[1], 1, 1e-12, "平稳分布归一"); }
  // 卡尔曼：先验极宽时等于滑动平均，不因相消丢精度
  { const f = ml.kalman({ q: 0, r: 1, m0: 0, p0: 1e12 }); let s = 0, worst = 0; for (let i = 1; i <= 2000; i++) { const y = g.normal(); s += y; worst = Math.max(worst, Math.abs(f.update(y) - s / i)); } ok(worst < 1e-8, "Q = 0、先验极宽：滤波值 = 样本均值", worst.toExponential(2)); }
}
done();
