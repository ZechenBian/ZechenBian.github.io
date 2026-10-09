// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 模型类的规则：先在训练路径上学一个模型（fit），再用它的输出决定仓位（decide）。
 * 追加到内置规则列表的末尾，分组为"模型"。 */
(function () {
  var R = String.raw;
  function n(key, label, def, min, max, step, extra) { var o = { key: key, label: label, def: def, min: min, max: max, step: step, type: "num" }; if (extra) for (var k in extra) o[k] = extra[k]; return o; }
  function sel(key, label, def, options, extra) { var o = { key: key, label: label, def: def, options: options, type: "select" }; if (extra) for (var k in extra) o[k] = extra[k]; return o; }
  function b(key, label, def, extra) { var o = { key: key, label: label, def: def, type: "bool" }; if (extra) for (var k in extra) o[k] = extra[k]; return o; }
  function is() { var a = arguments; return function (p) { for (var i = 0; i < a.length; i++) if (p.model === a[i]) return true; return false; }; }
  var L = QL_STRATS;

  L.push({
    id: "pipe", name: "预测模型流水线（特征 → 模型 → 仓位）", group: "模型",
    summary: "在训练路径上学一个\"下一步收益\"的预测器，再按预测的 期望/方差 下注。模型可以换。",
    fitKeys: ["feat", "lags", "model", "lambda", "alpha", "k", "depth", "minLeaf", "trees", "lr", "hidden", "epochs", "rows"],
    scaleKey: "shrink",
    params: [
      sel("model", "模型", "ols", [["mean", "基准：训练集均值"], ["ols", "线性回归（OLS）"], ["ridge", "岭回归"], ["lasso", "Lasso"], ["logit", "逻辑回归（预测涨跌）"], ["knn", "k 近邻"], ["tree", "回归树"], ["forest", "随机森林"], ["gbm", "梯度提升"], ["mlp", "神经网络（MLP）"]],
        { short: { mean: "均值", ols: "OLS", ridge: "岭", lasso: "Lasso", logit: "逻辑", knn: "k近邻", tree: "树", forest: "森林", gbm: "提升", mlp: "MLP" },
          descs: {
            mean: "不看任何特征，永远预测训练集的平均收益。别的模型都该和它比：赢不了它，就是没学到东西。",
            ols: "预测 = 特征的线性组合，系数使训练集上的平方误差最小。特征是最近 L 步收益时，它就是 AR(L) 自回归模型。",
            ridge: "线性回归，再加上对系数平方和的惩罚 λ，把系数往 0 拉：用一点偏差换更小的方差。特征互不相关时，系数恰好缩小到原来的 1/(1+λ)。",
            lasso: "线性回归，再加上对系数绝对值之和的惩罚：没用的特征，系数会被压成恰好为 0，相当于自动挑特征。",
            logit: "不预测收益的大小，只预测上涨的概率 q，再换算成 (2q − 1) × 平均涨跌幅。",
            knn: "在训练集里找特征最像的 k 个时刻，取它们下一步收益的平均。不假设函数的形状；k 小就跟着噪声走，k 大就过于平滑。",
            tree: "把特征空间一刀一刀切成小块，每块里预测那一块的平均收益。深度和叶子的最少样本数决定它有多灵活；分裂点只在每个特征的几十个分位点里选（64 等分，两头的尾部再补几个）。",
            forest: "很多棵树取平均：每棵在重抽样的数据上训练，每次分裂只看一部分特征。单棵树的方差被平均掉。",
            gbm: "一棵接一棵地加小树，每棵去拟合前面所有树留下的残差。树越多、学习率越大，拟合得越细，也越容易过拟合。",
            mlp: "一个隐层的神经网络（tanh 激活），用 Adam 做小批量梯度下降。隐层足够宽时能以任意精度逼近连续函数；训练带随机性，这里固定了随机种子，结果可以复现。"
          } }),
      sel("feat", "特征", "ret", [["ret", "最近 L 步的收益"], ["level", "最近 L 步的价格水平（对数）"], ["tech", "收益 + 动量、z 分数、波动比"]]),
      n("lags", "滞后数 L", 2, 1, 10, 1),
      n("lambda", "岭惩罚 λ", 0.1, 0, 5, 0.01, { show: is("ridge") }),
      n("alpha", "Lasso 强度（0–1）", 0.1, 0, 1, 0.01, { show: is("lasso"), hint: "1 = 刚好把所有系数压成 0" }),
      n("k", "近邻数 k", 25, 1, 300, 1, { show: is("knn"), hint: "k 小：灵活但噪声大；k 大：平滑但迟钝" }),
      n("depth", "树的深度", 4, 1, 10, 1, { show: is("tree", "forest", "gbm") }),
      n("minLeaf", "叶子的最少样本数", 50, 5, 500, 5, { show: is("tree", "forest", "gbm") }),
      n("trees", "树的棵数", 60, 5, 300, 5, { show: is("forest", "gbm") }),
      n("lr", "学习率", 0.1, 0.01, 0.5, 0.01, { show: is("gbm") }),
      n("hidden", "隐层宽度", 12, 2, 48, 1, { show: is("mlp") }),
      n("epochs", "训练轮数", 20, 2, 80, 1, { show: is("mlp") }),
      n("rows", "训练样本上限", 12000, 1000, 40000, 1000, { hint: "日频下 12000 个样本约合 48 年的数据：现实里拿不到这么多" }),
      sel("sizing", "仓位映射", "kelly", [["kelly", "Kelly 型：收缩 × 预测 / 残差方差"], ["sign", "只看方向：预测为正就持有"]]),
      n("shrink", "收缩系数", 0.5, 0, 1.5, 0.01, { show: function (p) { return p.sizing === "kelly"; } }),
      n("cap", "仓位上限（绝对值）", 2, 0.25, 10, 0.25, { show: function (p) { return p.sizing === "kelly"; } }),
      n("size", "仓位大小", 1, 0, 3, 0.05, { show: function (p) { return p.sizing === "sign"; } }),
      b("short", "预测为负时做空", true, { show: function (p) { return p.sizing === "sign"; } })
    ],
    code:
`// 预测模型流水线：特征 → 模型 → 仓位
// fit 在训练路径上学一个"下一步收益"的预测器；decide 用它的预测决定仓位。

function features(s, p) {                       // 只能用到当前步及以前的数据
  var x = [], k;
  if (p.feat === "level") {                     // 最近 L 个对数价格（相对 100）：均值回复、混沌映射用它
    for (k = 0; k < p.lags; k++) x.push(Math.log(s.p(k) / 100));
  } else {                                      // 最近 L 个单步收益
    for (k = 0; k < p.lags; k++) x.push(s.ret(k));
    if (p.feat === "tech") x.push(s.mom(20), s.z(20), s.vol(5) / s.vol(20));
  }
  return x;
}
function names(p) {
  var a = [], k;
  for (k = 0; k < p.lags; k++) a.push((p.feat === "level" ? "ln(S/100)" : "收益") + (k ? "，滞后 " + k : ""));
  if (p.feat === "tech") a.push("20 步动量", "20 步 z 分数", "波动比 5/20");
  return a;
}

function fit(D, p, ml, rng) {
  var feat = function (s) { return features(s, p); };
  var tr, va, warm = Math.min(25, Math.floor(D.T / 5));   // 跳过每条路径开头的一小段
  if (D.N >= 5) {                               // 前 80% 的路径训练，后 20% 验证
    var cut = Math.floor(D.N * 0.8);
    tr = ml.dataset(D, feat, { warmup: warm, maxRows: p.rows, from: 0, to: cut });
    va = ml.dataset(D, feat, { warmup: warm, maxRows: p.rows / 4, from: cut, to: D.N });
  } else {                                      // 路径太少（真实数据的整段历史）：按时间切，前 80% 训练
    var tc = Math.floor(D.T * 0.8);
    tr = ml.dataset(D, feat, { warmup: warm, maxRows: p.rows, t1: tc - 1 });
    va = ml.dataset(D, feat, { maxRows: p.rows / 4, t0: tc });
  }
  if (tr.n < 30 || va.n < 10) throw new Error("可用的样本太少（训练 " + tr.n + " 行，验证 " + va.n + " 行）：把步数或路径数调大，或者把滞后数调小。");
  var m;
  switch (p.model) {
    case "mean":   var ym = ml.mean(tr.y); m = { kind: "mean", size: 1, predict: function () { return ym; } }; break;
    case "ridge":  m = ml.ridge(tr, p.lambda); break;
    case "lasso":  m = ml.lasso(tr, p.alpha); break;
    case "knn":    m = ml.knn(tr, { k: p.k }); break;
    case "tree":   m = ml.tree(tr, { depth: p.depth, minLeaf: p.minLeaf }); break;
    case "forest": m = ml.forest(tr, { trees: p.trees, depth: p.depth, minLeaf: p.minLeaf, rng: rng }); break;
    case "gbm":    m = ml.gbm(tr, { trees: p.trees, depth: p.depth, lr: p.lr, minLeaf: p.minLeaf, rng: rng }); break;
    case "mlp":    m = ml.mlp(tr, { hidden: [p.hidden], epochs: p.epochs, rng: rng }); break;
    case "logit":  // 先预测"涨"的概率 q，再换算成期望收益 (2q − 1)·平均涨跌幅
      var up = { X: tr.X, n: tr.n, d: tr.d, y: tr.y.map(function (v) { return v > 0 ? 1 : 0; }) };
      var lg = ml.logistic(up), amp = ml.mean(tr.y.map(Math.abs));
      m = { kind: "logit", size: lg.size + 1, predict: function (x) { return (2 * lg.predict(x) - 1) * amp; } }; break;
    default:       m = ml.ols(tr);
  }
  var mse = ml.metrics(ml.predictAll(m, va), va.y).mse;   // 验证集上的残差方差，换算仓位时用
  return { m: m, resVar: mse, diag: ml.diagnose(m, tr, va, names(p)) };
}

function decide(s, p, st, model) {
  var x = features(s, p);
  for (var j = 0; j < x.length; j++) if (!isFinite(x[j])) return 0;   // 预热期
  var mu = model.m.predict(x) - s.rf;           // 预测的下一步收益，减去无风险利率
  if (!(mu === mu)) return 0;
  if (p.sizing === "sign") return mu > 0 ? p.size : (p.short ? -p.size : 0);
  var f = p.shrink * mu / model.resVar;         // Kelly 型：期望超额收益 / 方差
  return Math.max(-p.cap, Math.min(p.cap, f));
}`,
    explain: {
      tier: "family",
      assume: R`下一步收益的条件期望是所选特征的函数，$m(x)=\mathbb{E}[r_{t+1}\mid x_t=x]$，并且这个函数在训练路径和交易路径上是同一个（平稳）。`,
      objective: R`分两步。先找使预测均方误差 $\mathbb{E}\,(r_{t+1}-\hat m(x_t))^2$ 最小的 $\hat m$：条件期望 $m$ 正是均方误差的最小化者。再把预测代入 Kelly 型仓位 $f_t=\hat m(x_t)/\hat\sigma^2$。`,
      optimal: R`**插入式（plug-in）最优。** 收益幅度很小时，短视的对数最优仓位是 $f_t\approx\mathbb{E}[r_{t+1}-r_f\mid\mathcal F_t]/\mathrm{Var}[r_{t+1}\mid\mathcal F_t]$。若真实的 $m$ 落在模型族内、样本无穷多、特征包含了全部有用信息，并且条件方差是常数（代码里的 $\hat\sigma^2$ 是一个不随 $x$ 变的残差方差），则 $\hat m\to m$，规则趋于最优。现实中这些都不成立，对应的误差是：模型族选错（偏差）、样本有限（方差）、信息不全、波动时变。

各个模型的理论性质：
- **线性回归。** Gauss–Markov 定理：$m$ 线性、噪声以全部特征为条件均值为零（严格外生）、同方差且不相关时，OLS 是最佳线性无偏估计。特征是滞后收益时严格外生不成立，OLS 在有限样本下有偏，只剩相合性。
- **岭回归、Lasso。** 用一点偏差换方差。Hoerl–Kennard (1970)：总存在 $\lambda>0$ 使岭估计的均方误差严格小于 OLS，但这个 $\lambda$ 依赖未知的真实系数，只能靠验证集去找。更强的结论是 Stein 现象（Stein 1956；James–Stein 1961）：维数 ≥ 3 时，正态均值的最大似然估计在总平方误差下不是容许的，James–Stein 给出了一个不依赖未知参数、风险处处严格更小的收缩估计。Lasso 还会把一部分系数压成恰好为 0。
- **k 近邻。** Stone (1977)：样本独立同分布、$\mathbb{E}Y^2<\infty$ 时，只要 $k\to\infty$、$k/n\to 0$，对任何分布都（在 $L^2$ 意义下）相合。但对 Lipschitz 的 $m$，均方误差的最优收敛速度是 $n^{-2/(2+d)}$，随特征个数 $d$ 迅速恶化（维数灾难）。
- **树、森林、提升、神经网络。** 模型足够大时都能在紧集上逼近任意连续函数，代价是需要更多数据，也更容易把噪声当成结构。

预测力与收益的关系：设 $r_{t+1}=m_t+\varepsilon_{t+1}$，$m_t$ 服从零均值正态分布，$\varepsilon$ 与之独立。按 $f_t\propto m_t$ 下注，每步夏普恰为 $\sqrt{R^2/(1+R^2)}$，$R^2$ 小时约等于 $\sqrt{R^2}$（也就是 IC）。日频上 $R^2=0.5\%$ 就对应年化夏普约 1.1。`,
      fails: R`金融收益的信噪比极低，灵活的模型很容易在训练集上"学到"不存在的结构：看训练 $R^2$ 与验证 $R^2$ 的差距。条件期望随时间变化（非平稳）时，学到的函数会过期。验证集上的残差方差被低估时，Kelly 型仓位会过大，所以默认收缩一半。`,
      test: R`Logistic 映射世界、特征选"价格水平"、滞后数 1：线性回归的验证 $R^2\approx\tfrac12$（它只学到"水平会回到均值"），k 近邻、树、神经网络接近 1。AR(1) 世界、特征选"收益"：线性回归的验证 $R^2\approx\varphi^2$，更复杂的模型不会更好。几何布朗运动：所有模型的验证 $R^2$ 都不应显著大于 0，而 k 近邻、树和梯度提升的训练 $R^2$ 为正，按它们的预测交易是亏钱的。k 近邻的情形可以算出来：纯噪声上训练 $R^2$ 的期望是 $1/k$（训练点自己占了 $k$ 个邻居里的一个），验证 $R^2$ 的期望是 $-1/k$（预测值带来了 $\sigma^2/k$ 的额外方差）；单次实验会有一两个百分点的出入。在"参数扫描"里选"预测力 R²"、对 $k$ 扫描就能看到这两条曲线。`
    }
  });

  L.push({
    id: "kalman", name: "卡尔曼滤波（跟踪时变的漂移）", group: "模型",
    summary: "把\"每步的期望收益\"当作缓慢游走的隐藏状态来跟踪，再按 估计的漂移/方差 下注。",
    fitKeys: [], scaleKey: "shrink",
    params: [n("memory", "有效记忆长度（步）", 60, 5, 1000, 5, { hint: "稳态增益 K = 1/记忆长度；对应信噪比 Q/R = K²/(1−K)" }), n("shrink", "收缩系数", 0.5, 0, 1.5, 0.01), n("cap", "仓位上限（绝对值）", 2, 0.25, 10, 0.25)],
    code:
`// 卡尔曼滤波（局部水平模型）：
//   观测  r_t = m_t + ε_t      方差 R
//   状态  m_{t+1} = m_t + η_t  方差 Q
// 每实现一步收益，就更新一次对当前漂移 m 的估计。

function fit(D, p, ml) {                        // 只用训练路径估计收益的均值和方差
  var s = 0, s2 = 0, c = 0, step = Math.max(1, Math.floor(D.N / 400));
  for (var n = 0; n < D.N; n += step) for (var t = 0; t < D.T; t++) { var r = D.next(n, t); s += r; s2 += r * r; c++; }
  var mean = s / c;
  return { mean: mean, R: s2 / c - mean * mean };
}
function init(p, model) {
  return { m: model.mean, P: model.R / p.memory };   // 先验：漂移在训练均值附近，不确定度取稳态值 K·R
}
function decide(s, p, st, model) {
  var K0 = 1 / p.memory, Q = model.R * K0 * K0 / (1 - K0);   // 由记忆长度反推状态噪声
  if (s.t > 0) {
    var Pp = st.P + Q, K = Pp / (Pp + model.R);               // 预测 → 增益
    st.m += K * (s.ret(0) - st.m);                            // 用刚实现的收益修正
    st.P = Pp * model.R / (Pp + model.R);                     // = (1 − K)·Pp
  }
  var predVar = st.P + Q + model.R;                           // 下一步收益的预测分布是 N(m, P + Q + R)；稳态时方差 = R/(1 − K)
  var f = p.shrink * (st.m - s.rf) / predVar;
  return Math.max(-p.cap, Math.min(p.cap, f));
}`,
    explain: {
      tier: "family",
      assume: R`每步的期望收益 $m_t$ 是一个缓慢游走的隐藏状态：$r_t=m_t+\varepsilon_t$，$m_{t+1}=m_t+\eta_t$，两种噪声独立，方差分别为 $R$ 和 $Q$。`,
      objective: R`对漂移的估计误差 $\mathbb{E}\,(m_t-\hat m_t)^2$ 最小。`,
      optimal: R`**定理（Kalman 1960）。** 在线性高斯状态空间模型里，卡尔曼滤波给出的 $\hat m_t=\mathbb{E}[m_t\mid r_1,\dots,r_t]$ 在所有估计量中均方误差最小；去掉高斯假设，它仍是最优的线性估计。

局部水平模型的稳态增益 $K$ 满足 $K^2/(1-K)=Q/R$，此时滤波器就是指数加权平均 $\hat m_t=\hat m_{t-1}+K\,(r_t-\hat m_{t-1})$（Muth 1960）。所以"指数移动平均"不是经验做法，而是这个模型下的最优滤波；记忆长度 $1/K$ 由信噪比决定。

滤波这一步可证最优。下注这一步，对数效用下"代入滤波值"本身也是最优的（确定性等价）：以到 $t$ 为止的收益为条件，$r_{t+1}\sim N\bigl(\hat m_t,\ P_t+Q+R\bigr)$，稳态时这个预测方差等于 $R/(1-K)$，所以短视的对数最优仓位（二阶近似）是 $f_t\approx(\hat m_t-r_f)/(P_t+Q+R)$，代码里用的就是它。估计的不确定性只是把分母从 $R$ 放大到预测方差，记忆长度 60 时相差不到 2%。整条规则只算族内最优，是因为信噪比 $Q/R$（也就是记忆长度）和 $R$ 都未知，要靠调参和估计，真实的漂移也未必是随机游走。`,
      fails: R`漂移其实是常数时（几何布朗运动），最优的是 $Q=0$，也就是用全部历史的均值，任何有限的记忆都只是多引入噪声。单步收益里关于漂移的信息非常少：$\sigma=20\%$ 时，一天的收益几乎全是噪声。`,
      test: R`牛熊切换世界里对"记忆长度"做扫描，应出现内部的峰值：太短在追噪声，太长跟不上状态切换。几何布朗运动里，增长率应随记忆长度单调上升。`
    }
  });

  L.push({
    id: "hmm", name: "隐马尔可夫模型（识别牛熊）", group: "模型",
    summary: "用 EM 算法从训练路径估计两个隐藏状态的参数，交易时在线推断当前处于哪个状态。",
    fitKeys: ["paths", "iters"], scaleKey: "shrink",
    params: [
      sel("sizing", "仓位映射", "kelly", [["kelly", "Kelly 型：收缩 × 条件期望 / 条件方差"], ["thr", "阈值：牛市概率够高才持有"]]),
      n("shrink", "收缩系数", 0.5, 0, 1.5, 0.01, { show: function (p) { return p.sizing === "kelly"; } }),
      n("cap", "仓位上限（绝对值）", 2, 0.25, 10, 0.25, { show: function (p) { return p.sizing === "kelly"; } }),
      n("thr", "牛市概率阈值", 0.6, 0.05, 0.95, 0.01, { show: function (p) { return p.sizing === "thr"; } }),
      n("size", "仓位大小", 1, 0, 3, 0.05, { show: function (p) { return p.sizing === "thr"; } }),
      n("paths", "用多少条路径估计", 150, 10, 600, 10), n("iters", "EM 迭代次数", 25, 3, 80, 1)
    ],
    code:
`// 两状态高斯隐马尔可夫模型。
// fit：Baum–Welch（EM）估计每个状态的均值、标准差和转移概率。
// decide：前向算法在线更新"下一步处于各状态"的概率，再据此下注。

function fit(D, p, ml) {
  var seqs = [], step = Math.max(1, Math.floor(D.N / p.paths));
  for (var n = 0; n < D.N; n += step) {
    var y = new Float64Array(D.T);
    for (var t = 0; t < D.T; t++) y[t] = D.next(n, t);
    seqs.push(y);
  }
  var h = ml.hmm(seqs, { states: 2, iters: p.iters });
  var ann = function (v) { return (v * D.K * 100).toFixed(1) + "%"; }, vol = function (v) { return (v * Math.sqrt(D.K) * 100).toFixed(1) + "%"; };
  var note = "拟合结果（年化）：状态 1 漂移 " + ann(h.mu[0]) + "、波动 " + vol(h.sd[0]) + "、平均持续 " + (1 / (1 - h.A[0][0]) / D.K).toFixed(2) + " 年；" +
             "状态 2 漂移 " + ann(h.mu[1]) + "、波动 " + vol(h.sd[1]) + "、平均持续 " + (1 / (1 - h.A[1][1]) / D.K).toFixed(2) + " 年。";
  return { hmm: h, note: note };
}
function init(p, model) {
  return { F: model.hmm.filter() };             // 每条路径一个在线滤波器，从平稳分布出发
}
function decide(s, p, st, model) {
  if (s.t > 0) st.F.update(s.ret(0));           // 用刚实现的收益更新状态概率
  if (p.sizing === "thr") return st.F.p[0] > p.thr ? p.size : 0;   // 状态按均值从高到低排，p[0] 是"牛"
  var f = p.shrink * (st.F.mean() - s.rf) / st.F.variance();   // 下一步收益的预测均值（减去无风险利率）/ 预测方差
  return Math.max(-p.cap, Math.min(p.cap, f));
}`,
    explain: {
      tier: "family",
      assume: R`收益由两个看不见的状态生成；状态是一条马尔可夫链，状态内的收益是高斯的。`,
      objective: R`参数用极大似然估计；状态用贝叶斯后验推断；仓位取条件矩的 Kelly 型比例。`,
      optimal: R`**推断这一步是精确的。** 模型正确、参数已知时，前向算法给出的 $P(S_t=i\mid r_1,\dots,r_t)$ 就是贝叶斯后验，没有近似。

**估计这一步只保证局部最优。** Baum–Welch 是 EM 算法：每次迭代都不降低似然（Baum 等 1970；Dempster–Laird–Rubin 1977），但一般只收敛到似然函数的驻点（通常是局部极大；Wu 1983），结果依赖初值。

在"牛熊切换"世界里，这（近似）是正确设定的模型：状态内的简单收益是对数正态减 1，日频下与高斯几乎没有差别。所以它逼近"只看历史收益"能做到的最好预测。仓位仍是插入式的：把估计出的条件矩直接当真值用。`,
      fails: R`EM 落在坏的局部极大；状态数选错；真实市场里状态的持续时间不服从几何分布，参数也会漂移。两个状态的均值差相对波动很小时，状态概率更新得很慢，等确认熊市时已经跌了一段。`,
      test: R`牛熊切换世界里：规则下方显示的拟合结果应接近左栏的真实参数；它的增长率应高于均线交叉和时间序列动量。换到几何布朗运动：EM 仍会报出两个"状态"（它在拟合噪声），但两者波动几乎相同、持续时间很短，后验概率变化不大，仓位只小幅摆动，增长率低于买入持有。`
    }
  });

  L.push({
    id: "ogd", name: "在线梯度下降（边交易边学）", group: "模型",
    summary: "不事先训练：每条路径从零开始，每走一步就用预测误差修正一次线性模型的权重。",
    scaleKey: "shrink",
    params: [n("lags", "滞后数 L", 2, 1, 8, 1), n("eta", "学习率 η", 0.02, 0.001, 0.3, 0.001), n("shrink", "收缩系数", 0.5, 0, 1.5, 0.01), n("cap", "仓位上限（绝对值）", 2, 0.25, 10, 0.25)],
    code:
`// 在线梯度下降：预测 ŷ = w·x，其中 x 是最近 L 步收益（按波动标准化）加一个常数项。
// 每实现一步收益，沿平方误差的负梯度把 w 挪一小步：w ← w + η·(y − ŷ)·x。

function init(p) {
  return { w: new Float64Array(p.lags + 1), x: null, v: 0, n: 0 };
}
function decide(s, p, st) {
  var L = p.lags;
  if (s.t > 0) {                                // 更新对波动的估计（递推的均方）
    var r = s.ret(0);
    st.n++; st.v += (r * r - st.v) / Math.min(st.n, 100);
    if (st.x) {                                 // 上一步做过预测：现在知道答案了，修正权重
      var sd0 = Math.sqrt(st.v), y = r / sd0, yhat = 0, j;
      for (j = 0; j <= L; j++) yhat += st.w[j] * st.x[j];
      for (j = 0; j <= L; j++) st.w[j] += p.eta * (y - yhat) * st.x[j];
    }
  }
  if (s.t < L + 5 || !(st.v > 0)) return 0;     // 预热
  var sd = Math.sqrt(st.v), x = [1], k, pred = 0;
  for (k = 0; k < L; k++) x.push(s.ret(k) / sd);
  st.x = x;
  for (k = 0; k <= L; k++) pred += st.w[k] * x[k];   // 预测的是"标准化后的下一步收益"
  var f = p.shrink * (pred * sd - s.rf) / (sd * sd);   // 换回来：(期望收益 − 无风险利率) / 方差，期望收益 = pred·sd
  return Math.max(-p.cap, Math.min(p.cap, f));
}`,
    explain: {
      tier: "heuristic",
      assume: R`不假设任何分布，也不假设关系是固定的：数据可以是任意序列。`,
      objective: R`遗憾（regret）增长得比 $T$ 慢：遗憾指累计平方损失，与事后看来最好的那个固定线性预测器的累计损失之差。`,
      optimal: R`**定理（Zinkevich 2003）。** 设可行域是有界闭凸集，每一步的损失是凸的且梯度有界。步长取 $\eta_t\propto 1/\sqrt t$ 的投影在线梯度下降，$T$ 步的遗憾是 $O(\sqrt T)$：平均每步的遗憾趋于 0，而且对任意数据序列都成立，包括对抗性的。

这是"预测的累计平方损失不会比事后最好的固定线性预测器差太多"的保证，不是"能赚钱"的保证：如果最好的线性预测器本身没有预测力，它也没有。代码里用的是固定步长 $\eta$，也没有做投影：固定步长下标准的界是 $D^2/(2\eta)+\eta G^2T/2$（$D$ 是可行域的直径，$G$ 是梯度的上界），平均遗憾不再趋于 0，而是停在 $O(\eta)$ 的水平；换来的是对变化的跟踪能力。所以定理并不覆盖这里实现的算法，这条规则归为启发式。`,
      fails: R`对学习率敏感：太大则权重跟着噪声乱跳，太小则学不到东西。它只用自己这条路径的历史，样本量比汇总所有训练路径的做法少几个数量级。`,
      test: R`AR(1) 世界里，它的增长率应明显低于"预测模型流水线"里的线性回归：后者用了全部训练路径来估计同一个系数。把 φ 调到 0.2，对学习率做扫描（范围缩到 0.001 到 0.05），会有一个内部的峰值，在 0.005 上下；默认的 φ = 0.1 信号太弱，峰退到 0.002 上下，几乎贴着下限 0.001：默认 21 个点的扫描分辨不出来，看上去就是越小越好。`
    }
  });

  L.push({
    id: "qlearn", name: "Q-learning（表格型强化学习）", group: "模型",
    summary: "把交易写成一个决策过程，让程序在训练路径上反复试错，学出\"在什么状态下该持有什么仓位\"的一张表。",
    fitKeys: ["n", "bins", "size", "cost", "epochs", "eps", "omega", "gamma", "paths"],
    params: [
      n("n", "z 分数的窗口（步）", 20, 5, 120, 1), n("bins", "z 分数分成几档", 9, 3, 21, 2), n("size", "仓位大小", 1, 0.1, 3, 0.05),
      n("cost", "训练时计入的成本", 5, 0, 100, 0.5, { unit: "bp", hint: "应与左下\"交易成本\"一致" }), n("epochs", "训练轮数", 12, 1, 60, 1),
      n("eps", "初始探索率 ε", 0.3, 0, 1, 0.01), n("omega", "学习率的衰减指数 ω", 0.7, 0.51, 1, 0.01, { hint: "第 N 次访问某个格子时学习率取 1/N^ω" }), n("gamma", "折现因子 γ", 0.95, 0, 0.999, 0.001), n("paths", "用多少条路径训练", 600, 50, 2000, 50)
    ],
    code:
`// 表格型 Q-learning。
// 状态 = (价格相对均线的 z 分数落在第几档, 当前持仓)；动作 = 做空 / 空仓 / 做多。
// 回报 = 这一步的对数收益，扣掉换仓成本。

function stateOf(s, p, prev) {                  // prev ∈ {-1, 0, 1}
  var z = s.z(p.n);
  if (!(z === z)) return -1;
  var b = Math.floor((z + 2.5) / 5 * p.bins);
  b = Math.max(0, Math.min(p.bins - 1, b));
  return b * 3 + (prev + 1);
}
function best(Q, k) {                           // 状态 k 下价值最高的动作（0, 1, 2）
  var a = 1;                                    // 打平时倾向空仓
  if (Q[k * 3] > Q[k * 3 + a]) a = 0;
  if (Q[k * 3 + 2] > Q[k * 3 + a]) a = 2;
  return a;
}

function fit(D, p, ml, rng) {
  var Q = new Float64Array(p.bins * 3 * 3), visits = new Float64Array(p.bins * 3 * 3), c = p.cost / 1e4;
  var step = Math.max(1, Math.floor(D.N / p.paths));
  for (var ep = 0; ep < p.epochs; ep++) {
    var eps = p.eps * (1 - ep / p.epochs);      // 探索率逐轮下降
    for (var n = 0; n < D.N; n += step) {
      var prev = 0;
      for (var t = p.n; t < D.T; t++) {
        var k = stateOf(D.at(n, t), p, prev);
        if (k < 0) { prev = 0; continue; }          // 状态没法定义（价格一直没动）：按空仓处理
        var a = rng.u() < eps ? rng.int(3) : best(Q, k), pos = a - 1;
        var g = 1 + pos * p.size * D.next(n, t) - c * Math.abs(pos - prev) * p.size;
        var reward = Math.log(Math.max(g, 1e-9));
        var k2 = stateOf(D.at(n, t + 1), p, pos);   // 路径的最后一步也照常往后看一步：到期不是"终点"，只是数据用完了
        var future = k2 >= 0 ? p.gamma * Q[k2 * 3 + best(Q, k2)] : 0;
        var alpha = 1 / Math.pow(1 + visits[k * 3 + a]++, p.omega);   // 这个格子访问得越多，步子越小
        Q[k * 3 + a] += alpha * (reward + future - Q[k * 3 + a]);
        prev = pos;
      }
    }
  }
  // 把学到的策略表写成三行字：每一档 z 分数下的动作；一个状态总共没走到过 50 次的，标成 ?
  var sym = ["▼", "·", "▲"], rows = ["持空时", "空仓时", "持多时"].map(function (name, j) {
    var s = "";
    for (var b = 0; b < p.bins; b++) { var k = b * 3 + j, seen = visits[k * 3] + visits[k * 3 + 1] + visits[k * 3 + 2]; s += seen < 50 ? "?" : sym[best(Q, k)]; }
    return name + " " + s;
  });
  return { Q: Q, note: "学到的策略（每行从左到右是 z 分数从低到高；▲ 做多、· 空仓、▼ 做空、? 样本太少）：\\n" + rows.join("\\n") };
}
function init() {
  return { prev: 0 };
}
function decide(s, p, st, model) {
  var k = stateOf(s, p, st.prev);
  if (k < 0) { st.prev = 0; return 0; }
  st.prev = best(model.Q, k) - 1;
  return st.prev * p.size;
}`,
    explain: {
      tier: "family",
      assume: R`交易是一个马尔可夫决策过程：状态 =（z 分数所在的档，当前持仓），动作 = 做空、空仓、做多，回报 = 这一步的对数收益减去换仓成本。`,
      objective: R`折现累计回报 $\mathbb{E}\sum_t\gamma^t R_t$ 最大。回报是对数收益，所以 $\gamma\to1$ 时 $(1-\gamma)\,\mathbb{E}\sum_t\gamma^tR_t$ 趋于长期增长率；默认 $\gamma=0.95$ 只看大约 20 步。`,
      optimal: R`**定理（Watkins–Dayan 1992）。** 在有限状态、有限动作、回报有界、折现因子 $\gamma<1$ 的马尔可夫决策过程里，如果每个（状态，动作）都被访问无穷多次，且学习率满足 $\sum_t\alpha_t=\infty$、$\sum_t\alpha_t^2<\infty$，则 Q-learning 以概率 1 收敛到最优动作价值函数 $Q^*$，对 $Q^*$ 贪心的策略就是最优策略。

代码里第 $N$ 次访问某个格子时学习率取 $1/N^{\omega}$，$\tfrac12<\omega\le 1$ 时满足上面的条件。

定理要求（状态，动作）构成马尔可夫决策过程。把 z 分数分档之后，真实过程对这组状态一般不再是马尔可夫的，前提并不成立：此时 Q-learning 的极限依赖于探索时的访问分布，对它贪心的策略也不保证是"只看这组状态的策略"里最优的（Singh–Jaakkola–Jordan 1994）。它的好处是不需要你知道模型，成本也自动计入：在均值回复的世界里，带成本的最优策略是一条"不交易带"，学出来的表应当有这个形状。`,
      fails: R`状态一多，每个格子里的样本就不够（维数灾难）。金融数据里不同动作的价值差别常常小于估计误差，表里的很多格子其实是噪声。环境变了之后，学到的表不会自己更新。`,
      test: R`均值回复世界里："空仓时"那一行在 z 低的档做多、z 高的档做空（边上的个别格子会因为两个动作的价值几乎相等而随机翻转）；把成本从 0 调到 20 bp 再重新训练，"持多时"那一行里继续持有的范围会明显变宽。几何布朗运动里：z 分数不带信息，学到的表应当与 z 基本无关——漂移为正时几乎处处做多，增长率接近买入持有。`
    }
  });
})();
