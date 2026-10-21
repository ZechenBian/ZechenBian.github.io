# 机器学习实验室 · 设计与接口（内部文档，不随页面发布）

策略实验室的一个新版块：`strategy-lab/ml/index.html`（中文，独立页面，像青少年版一样不进英文翻译流程）。
三层：**任务类型 → 数据 → 算法**。算法可以是内置的、用户改写的、AI 写的；在后台线程（隔离环境）里运行；结果以四种形式反馈：图表与学习曲线、排行榜与显著性、AI 诊断报告、模型内部可视化；另有说明（手册）与动画。
第二期：本机 Python 引擎（`strategy-lab/ml-engine/`），同一套数据和结果格式，算法用 Python/PyTorch 写。

所有源文件头两行必须是版权声明（build.py 检查）：
```
// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
```
风格：与 src/ 其他文件一致——ES5 风格的 `function`、`var`，不用模块系统、不用外部库；中文注释说"为什么"。数值代码用 typed arrays。界面文字是中文。

## 1. 文件与归属

| 文件 | 内容 | 在哪里执行 |
|---|---|---|
| `src/ml/registry.js` | `QL_MLREG_INSTALL(QL)`：数据集注册表 `QL.mlreg` | 页面 + 线程 |
| `src/ml/nn.js` | `QL_MLNN_INSTALL(QL)`：自动求导小库 `QL.nn` | 线程（页面也装，用于测试和可视化） |
| `src/ml/stats.js` | `QL_MLSTATS_INSTALL(QL)`：指标与检验 `QL.mlstats` | 页面 + 线程 |
| `src/ml/data-tabular.js` `data-ts.js` `data-image.js` `data-toy.js` | `QL_MLDATA_TABULAR(QL)` 等：调用 `QL.mlreg.add(def)` 注册数据集 | 页面 + 线程 |
| `src/ml/algos.js` | `var QL_MLALGOS = [...]`：内置算法（代码是字符串） | 页面 |
| `src/ml/run.js` | `QL_MLRUN_INSTALL(QL)`：线程里的运行器 `QL.mlrun` | 线程 |
| `src/ml/runner.js` | `QLMLRunner`：拼线程源码、开线程、收进度 | 页面 |
| `src/ml/viz.js` | `QLMLViz`：各种图与模型内部的画法 | 页面 |
| `src/ml/anim.js` | `QLMLAnim`：动画播放器与几个模拟 | 页面 |
| `src/ml/guide.js` | `QL_MLGUIDE`：手册条目 | 页面 |
| `src/ml/ai.js` | AI 面板：写算法、诊断、自动改进、问结果 | 页面 |
| `src/ml/app.js` | 界面主体 | 页面 |
| `src/ml/body.html` `src/ml/styles.css` | 页面骨架、附加样式（主样式 styles.css 也会内联） | |
| `test/ml-*.test.js` | Node 测试 | |
| `test/ui-ml.js` | 无头浏览器测试（假 AI 服务商：test/mock-openai.js） | |
| `ml-engine/` | 第二期：本机 Python 引擎 | 用户的电脑 |

页面会内联：`core.js`（QL_CORE、RNG）、`ml.js`（模型库 QL.ml）、`sandbox.js`、`md.js`（QLMD）、`charts.js`（QLChart）、`ai.js`（QLAI）以及上面的 src/ml/*。
线程的源码 = QL_CORE + QL_ML_INSTALL + QL_MLNN_INSTALL + QL_MLSTATS_INSTALL + QL_MLREG_INSTALL + 各 QL_MLDATA_* + QL_MLRUN_INSTALL（都用 `Function.prototype.toString()` 拼进去），所以**这些 install 函数必须自包含**：只用参数 QL 和标准 JavaScript，不引用函数外的变量（数据常量写在函数体里面）。

在 Node 里测试：每个文件末尾 `if (typeof module !== "undefined" && module.exports) module.exports = QL_MLNN_INSTALL;`。测试里 `const QL = require("../src/core.js")({}); require("../src/ml.js")(QL); require("../src/ml/nn.js")(QL);` 这样装。（core.js 导出 QL_CORE，调用方式见 test/harness.js。）

随机数：一律用 `QL.RNG`（`new QL.RNG(seed, stream, batch)`；方法 `u() uniform(a,b) normal(m,s) exp(r) int(n) bernoulli(p) gamma(k) t(nu) poisson(l) choice(arr)`），不用 Math.random。同样的种子必须得到逐位相同的数据和结果。

## 2. 数据集注册表

```js
QL.mlreg.add({
  id: "moons",                       // 唯一，[a-z0-9_]+
  family: "tabular",                 // tabular | timeseries | image | toy
  kind: "classification",            // regression | classification | forecast
  name: "两个半月", summary: "一句话",
  params: [ { key: "n", label: "样本数", def: 600, min: 100, max: 5000, step: 50, type: "int", desc: "…" },
            { key: "noise", label: "噪声", def: 0.2, min: 0, max: 0.8, step: 0.01, type: "num" },
            { key: "shape", label: "形状", def: "a", type: "select", options: [["a", "甲"], ["b", "乙"]] },
            { key: "flag", label: "…", def: true, type: "bool" } ],
  gen: function (p, rng) { return Data; },          // 纯函数：只依赖参数和 rng（在线程里执行）
  oracle: function (p) { return { predict: function (x) {...}, note: "贝叶斯最优：…" }; }, // 可选：理论上最好的预测器（同 predict 的输出约定）
  bayes: function (p) { return { metric: "acc", value: 0.97, note: "…" }; },             // 可选：理论上最好的成绩（能算出来时）
  split: { train: 0.6, valid: 0.2, test: 0.2, by: "random" | "stratified" | "group" | "time" | "custom" }, // 默认按 family 定
  plot: "scatter2d" | "series" | "images" | "table" | "cayley" | "lattice",           // 预览用哪种图
  docs: "Markdown：定义、生成方式、已知的性质（定理要精确陈述）、适合什么算法、出处",
  source: { name: "UCI …", url: "https://…", license: "CC BY 4.0", cite: "…" }          // 真实数据才有
});
```

`gen` 返回的 **Data**：

* 监督学习（tabular / image / toy）：
  ```js
  { X: Float64Array(n*d),            // 按行展开
    y: Float64Array(n)  (回归) | Int32Array(n) (分类，取 0..k-1),
    n, d,
    classes: ["名字", …] (分类必有，长度 k),
    featureNames: ["x1", …] (可选，长度 d),
    shape: [H, W] 或 [H, W, C] (图像：X 的每一行是一张图按行展开；可选),
    tokens: { vocab: m } (toy：X 里是 0..m-1 的整数编号；可选),
    groups: Int32Array(n) (可选：同组的样本必须落在同一份里，例如同一条马尔可夫链),
    splitIdx: { train: Int32Array, valid: Int32Array, test: Int32Array } (可选：数据集自己规定的划分，split.by = "custom"),
    truth: Float64Array(n) (可选：回归里无噪声的真值 f(x)，用来画"学到的函数 vs 真函数"),
    meta: { … } (可选：画图、分析要用的额外信息，例如群的乘法表、温度) }
  ```
* 时间序列（timeseries，kind = forecast）：
  ```js
  { y: Float64Array(T), T, freq: "day" | "month" | "step", season: 12 (可选), label: "收盘价", times: [...] (可选),
    truthMean: Float64Array(T) (可选：模拟数据里 E[y_t | 过去] 的真值，上帝视角), meta }
  ```

## 3. 算法的接口

内置算法在 `QL_MLALGOS` 里：
```js
{ id: "logreg", name: "逻辑回归", api: "supervised" | "forecast",
  kinds: ["classification"], families: ["tabular", "image", "toy"],
  group: "baseline" | "linear" | "neighbors" | "trees" | "kernel" | "neural" | "probabilistic" | "ts",
  params: [ …同上的参数格式… ],
  code: "function fit(data, p, lib, ctx) { … }\nfunction predict(model, X, n) { … }\nfunction inspect(model) { … }",
  docs: "Markdown：模型、损失、优化、复杂度、什么时候好用、什么时候失效（定理与证明梗概）" }
```
代码是**字符串**（界面里可以看、改、复制；AI 写的也是同样的字符串）。在线程里编译：代码前面会加一行把危险的全局名字遮住（同 src/jobs.js 的 SHADOW），所以代码里只能用标准 JavaScript 和传进来的 `lib`、`ctx`。

### 3.1 supervised
```js
function fit(data, p, lib, ctx) → model
  data.train, data.valid: { X, y, n, d, k (类别数；回归为 0), classes, featureNames, shape, tokens, kind }
  data.kind: "regression" | "classification"
  p: 参数（冻结的对象）
  lib: { ml: QL.ml, nn: QL.nn, stats: QL.mlstats, rng: 本次运行专用的 RNG, la: QL.nn.la（矩阵小工具） }
  ctx: {
    report(step, { loss, validLoss, trainMetric, validMetric, lr, … }),   // 学习曲线上的一个点（数字字段任意；最多保留 2000 个点，均匀抽稀）
    snapshot(step, model),   // 请实验室给模型拍一张快照（动画用）：实验室当场调用 predict / inspect 算出要画的东西；最多 60 张
    timeLeft() → 毫秒,        // 时间预算还剩多少；训练循环应当在 < 0 时停下
    log(text),
    budgetMs }
function predict(model, X, n) → 回归：Float64Array(n)；分类：Float64Array(n*k)，每行是概率，非负、和为 1
function inspect(model) → 可选，模型内部的东西（见 §5 internals）
```
注意：predict 每次可能拿到几千行；不要在 predict 里训练。fit 用到的验证集只能用于早停和监控，**测试集算法拿不到**。

### 3.2 forecast
```js
function fit(series, p, lib, ctx) → model    // series: { y: Float64Array(训练段), T, freq, season }；验证段在 series.valid（同样格式，只能用于选参/早停）
function forecast(model, past, h) → 长度 h 的数组    // past：截至当前时刻（含）的全部观测（Float64Array），预测 past 之后的 h 步
function update(model, yNew)                   // 可选：新观测到来时更新内部状态（不重新训练）
function inspect(model)                        // 可选
```
评价：在验证段和测试段的每个时刻 t 作为预测原点，调用 forecast(model, y[0..t], H)，和 y[t+1..t+H] 比。模型只在训练段上 fit 一次（"滚动原点、不重训"）。

## 4. 划分（runner 负责，算法看不到测试集）

* tabular / image：默认 60 / 20 / 20；分类按类别分层；有 groups 时按组分。
* toy：参数 `trainFrac`（默认 0.5）给训练集，剩下的对半分成验证集与测试集（grokking 的"测试准确率曲线"就是验证集曲线）。
* timeseries：按时间 60 / 20 / 20。
* 数据集可以用 split 或 splitIdx 覆盖。划分由 `seed` 决定，可复现。

## 5. 结果（线程 → 页面；第二期的 Python 引擎返回同样的格式）

```js
{ ok: true, ms, api, kind, k,
  split: { nTrain, nValid, nTest },
  metrics: { train: M, valid: M, test: M },     // M 见下
  primary: "acc" | "mse" | …, higherBetter: true | false,
  baseline: { name, metrics: { valid: M, test: M } },   // 运行器自带的最简单基线：回归 = 训练集均值，分类 = 训练集多数类，预测 = 上一个值
  oracle: { note, metrics: { valid: M, test: M } } | null,   // 数据集提供了 oracle 时
  curve: [ { step, loss, validLoss, … } ],
  snaps: [ { step, kind, data } ],                // kind: "grid2d"（二维决策面：{nx, ny, x0, x1, y0, y1, values(Float32Array nx*ny*k 或 nx*ny)}）
                                                  //       "fn1d"（一维回归曲线：{xs, ys}）、"embed"（嵌入矩阵：{rows, cols, data}）、"weights"
  pred: { valid: Float64Array, test: Float64Array },    // 回归/预测：n 个预测值；分类：n*k 个概率
  truth: { valid, test },                                // 对应的真值（分类是 Int32Array 的类别）
  loss: { valid: Float32Array, test: Float32Array },     // 逐样本损失（平方误差 / 对数损失 / 0-1 正确与否另存 correct），给配对检验用
  correct: { valid: Uint8Array, test: Uint8Array } (分类),
  importance: [ { name, drop, se } ] | null,             // 置换重要性（验证集，主指标的下降）
  internals: inspect 的输出（截断过的）| null,
  data: { preview… }（画图用的样本：二维散点、序列、几张图片；只取一部分）,
  size: 参数个数 | null, log: [ "…" ] }
```
指标 M：回归 `{ mse, rmse, mae, r2 }`；分类 `{ acc, logloss, brier, f1, auc (二分类) }`；预测 `{ mse, rmse, mae, mase, dirAcc }`。

internals（inspect 可以返回其中任意几项；runner 对 nn 模型会自动补 weights）：
```js
{ layers: [ { name, rows, cols, data: Float32Array } ],     // 权重矩阵，画热力图
  embedding: { rows, cols, data, labels },                  // 嵌入（行 = 词表里的元素），画 PCA、傅里叶谱、按表示分解
  activations: [ { name, data: Float32Array } ],            // 某一层在验证集上的激活值（画直方图）
  tree: { nodes: [ { f, thr, left, right, value, n } ] },  // 树
  coef: [ { name, value } ],                                // 线性模型的系数
  text: "…" }
```

## 6. 运行器协议（页面 ⇄ 线程）

页面发：`{ type: "job", kind: "ml-run", dataset: { id, params, seed }, algo: { api, params, code }, opts: { budgetMs, snapEvery, maxCurve, importance: true, splitSeed } }`
线程回：`{ type: "ready" }`，若干 `{ type: "progress", phase: "data" | "fit" | "eval", step, point?, snap?, msg? }`，最后 `{ type: "done", result }` 或 `{ type: "error", message, line }`。
另一种任务 `kind: "ml-data"`：只生成数据并返回（预览和发给本机引擎用）。
超时：页面侧按"多久没有动静"判死（默认 30 秒，fit 期间每次 report 都算动静），另有总预算。

## 7. nn.js（lib.nn）——自动求导小库

* `Tensor`：`{ data: Float32Array, shape: [..], grad: Float32Array | null, requiresGrad }`。
* 构造：`nn.tensor(data, shape)`、`nn.zeros(shape)`、`nn.param(shape, init, rng)`（init："he" | "xavier" | "zeros" | 数字=标准差）、`nn.fromRows(X, d, idx)`（从 Float64Array 按行取一批）。
* 运算（都返回新的 Tensor 并记录计算图）：`matmul(a,b)`（2D）、`add`（同形或按行广播偏置）、`sub`、`mul`、`scale(a,s)`、`relu`、`leakyRelu`、`tanh`、`sigmoid`、`gelu`、`square`、`sum`、`mean`、`softmax`（按行）、`logSoftmax`、`crossEntropy(logits, labels Int32Array)`（标量，平均）、`mse(pred, target)`、`bceLogits(logits, targets)`、`embedding(table, idx Int32Array)`、`concat([a,b], 1)`、`reshape`、`transpose2d`、`conv2d(x[N,C,H,W], w[O,C,kh,kw], b[O], {pad: "same" | "circular" | 0})`、`maxPool2d(x, 2)`、`avgPoolGlobal(x)`→[N,C]、`dropout(a, p, rng, training)`、`layerNorm(a, gamma, beta)`。
* `loss.backward()`；`nn.noGrad(fn)`；`p.zeroGrad()`。
* 优化器：`nn.adam(params, { lr, beta1, beta2, eps, weightDecay })`（weightDecay 为解耦的，即 AdamW）、`nn.sgd(params, { lr, momentum })`，都有 `step()`、`zeroGrad()`、`lr` 可改。
* 层：`nn.Linear(inDim, outDim, rng)`、`nn.MLP([d, h1, …, out], { act: "relu" | "tanh" | "gelu", rng })`、`nn.Embedding(vocab, dim, rng)`、`nn.Conv2d(inC, outC, k, rng, { pad })`；都有 `forward(x)`、`params()`。
* 工具：`nn.batches(n, size, rng)` → 下标数组的列表；`nn.numParams(params)`；`nn.gradcheck(f, params, eps)` → 最大相对误差；`nn.la`：`matmul(A,B,n,m,k)`、`solve`、`chol`、`pca(X,n,d,k)`、`dft`（给嵌入做傅里叶分析）。
* 性能目标：在 2 核云端 CPU 上，128×128 的 MLP、batch 128 的一步前向 + 反向 + Adam 在几毫秒内。

## 8. stats.js（lib.stats，页面里也用）

`metrics(kind, pred, truth, k)` → M；`perExample(kind, pred, truth, k)` → { loss: Float64Array, correct?: Uint8Array }；
`confusion(pred, truth, k)`；`roc(probPos, truth)` → { fpr, tpr, auc }；`calibration(prob, truth, bins)`；
`bootstrapMean(values, B, rng)` → { mean, se, lo, hi }；`pairedBootstrap(a, b, B, rng)` → { diff, se, lo, hi, p }；
`mcnemar(correctA, correctB)` → { b, c, p }（小样本用精确二项）；`dieboldMariano(lossA, lossB, h)` → { stat, p }（Newey–West，HLN 修正）；
`holm(pvals)`；`expectedMaxNormal(N)`（数值积分的精确值）；`powerLawFit(ns, errs)` → { a, b }；`normCdf`、`normInv`、`tCdf`。

## 9. 页面（app.js）

左栏：任务类型（五个：表格回归、表格分类、时间序列、图像与格点、科研玩具）→ 数据（选择、参数、种子、预览、说明）→ 算法（内置 / 我的 / AI 写的；参数；代码与说明；运行）→ 设置（时间预算、划分）。
中栏：摘要（训练 / 验证的主指标，测试集默认遮住，点一下才揭晓并记次数；与基线、理论最优的差距；过拟合提示）→ 标签：图表 | 排行榜 | 模型内部 | 动画回放。
右栏：AI（写算法 / 诊断 / 自动改进 / 问结果），用 QLAI（与策略实验室共用同一份密钥设置）；在 Claude 里打开时用 window.claude。
顶栏：品牌"策略实验室 · 机器学习"、手册、本机引擎状态、AI。
存档：localStorage `ql.ml.v1`（界面状态、我的算法）、`ql.ml.runs.v1`（排行榜，压缩过的逐样本损失）；读写都包 try/catch。
