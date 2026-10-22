// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 机器学习实验室 · 右栏的 AI 面板。四种用法：
 *   写算法    说一个想法，AI 写成符合接口的代码（附参数表和说明），自动存进"AI 写的"并运行一次；
 *   诊断      把这次运行的数字（训练 / 验证的成绩、学习曲线的走势、基线、理论最优、特征重要性、排行榜）交给 AI，要一份诊断报告；
 *   自动改进  AI 读当前的代码和结果，写一个改进版，实验室运行、和之前的比；重复几轮，只按验证集挑；
 *   问结果    就眼前的结果提问。
 * 发给 AI 的内容里永远没有测试集的答案；测试集的成绩只有揭晓过才给，而且"写算法""自动改进"从来不给（免得照着测试集调）。
 * 独立的网页里用使用者自己接入的服务商（src/ai.js 的 QLAI，和策略实验室共用同一份设置）；在 Claude 里打开时用 window.claude。 */
(function (A) {
  "use strict";
  var h = A.h, $ = A.$, clear = A.clear, S = A.S, QL = A.QL, F = A.F, G = A.G, P = A.P;
  var HOST = !!(window.claude && typeof window.claude.use === "function"), WEB = !HOST && window.QLAI ? window.QLAI : null;
  var NAME = HOST ? "Claude" : "AI";
  var sample = null, mode = "write", busy = false, ctl = null, turns = [];
  function who() { var l = WEB && WEB.label(); return l ? l.short : NAME; }
  var MODES = [["write", "写算法"], ["diag", "诊断"], ["improve", "自动改进"], ["ask", "问结果"]];

  /* ---------- 接口说明（"代码与说明"里的"接口说明"一页，也原样发给 AI） ---------- */
  var LIB_DOC = [
    "lib.rng   本次运行专用的随机数源（可复现；不要用 Math.random）：rng.u() (0,1) 均匀；rng.uniform(a, b)；rng.normal() 或 rng.normal(m, s)；rng.int(n) 返回 0..n−1；",
    "          rng.bernoulli(q)；rng.exp(rate)；rng.gamma(k)；rng.t(nu)；rng.poisson(lam)；rng.laplace()；rng.cauchy()；rng.choice(arr)。",
    "lib.nn    自动求导小库。Tensor = { data: Float32Array, shape, grad }。",
    "          构造：nn.tensor(data, shape)、nn.zeros(shape)、nn.param(shape, init, rng)（init: \"he\" | \"xavier\" | \"zeros\" | 标准差）、nn.fromRows(X, d, idx) 按行取一批（idx 是下标数组）。",
    "          运算：matmul(a, b)、add（同形或按行广播偏置）、sub、mul、scale(a, s)、relu、leakyRelu、tanh、sigmoid、gelu、square、sum、mean、softmax、logSoftmax、",
    "                crossEntropy(logits, labels Int32Array)（平均）、mse(pred, target)、bceLogits、embedding(table, idx)、concat([a, b], 1)、reshape、transpose2d、",
    "                conv2d(x[N,C,H,W], w[O,C,kh,kw], b[O], {pad: \"same\" | \"circular\" | 0})、maxPool2d(x, 2)、avgPoolGlobal(x)、dropout(a, p, rng, training)、layerNorm(a, gamma, beta)。",
    "          反传：loss.backward()；nn.noGrad(fn)。优化器：nn.adam(params, {lr, beta1, beta2, eps, weightDecay})（解耦的权重衰减，即 AdamW）、nn.sgd(params, {lr, momentum})，都有 step()、zeroGrad()，lr 可以改。",
    "          层：nn.Linear(inDim, outDim, rng)、nn.MLP([d, h1, …, out], {act: \"relu\" | \"tanh\" | \"gelu\", rng})、nn.Embedding(vocab, dim, rng)、nn.Conv2d(inC, outC, k, rng, {pad})，都有 forward(x)、params()。",
    "          工具：nn.batches(n, size, rng) → 下标数组的列表；nn.numParams(params)；nn.la.pca(X, n, d, k)、nn.la.solve、nn.la.chol、nn.la.dft。",
    "lib.ml    经典模型库，直接吃 data.train 这样的 {X, y, n, d}：ml.ols(ds) / ml.ridge(ds, lambda) / ml.lasso(ds, alpha) / ml.logistic(ds, {l2})（二分类，y 取 0/1）/ ml.knn(ds, {k}) /",
    "          ml.tree(ds, {depth, minLeaf}) / ml.forest(ds, {trees, depth, minLeaf, mtry, rng}) / ml.gbm(ds, {trees, depth, lr, minLeaf, rng}) / ml.mlp(ds, {hidden, epochs, lr, rng})；",
    "          返回的模型有 predict(x)（x 是一行特征）。ml.kalman({q, r})、ml.hmm(seqs, {states, iters}) 给时间序列用。注意它们都是回归模型（logistic 是二分类概率），多分类要自己组合。",
    "lib.stats 指标与检验：stats.metrics(kind, pred, truth, k)、stats.perExample、stats.confusion、stats.roc、stats.pairedBootstrap、stats.normCdf、stats.normInv ……",
    "lib.la    = lib.nn.la（矩阵小工具）。lib.toy（只在玩具任务里有）：toy.fourier(rows, p) 等分析工具。"
  ].join("\n");
  var CTX_DOC = [
    "ctx.report(step, { loss, validLoss, trainMetric, validMetric, lr, … })   学习曲线上的一个点（只收数字；最多保留 2000 个点）。分类的 validMetric 用准确率，回归用 MSE。",
    "ctx.snapshot(step, model)   请实验室给模型拍一张快照（训练过程回放用）：实验室当场调用 predict / inspect 算出要画的东西；最多 60 张，太密会自动抽稀。",
    "ctx.timeLeft()   时间预算还剩多少毫秒；训练循环在它 < 0 时必须停下。ctx.budgetMs 是总预算。",
    "ctx.log(text)    写一行日志（显示在\"图表\"一栏的最后）。"
  ].join("\n");
  A.apiDoc = function (api) {
    var sup = api !== "forecast";
    var head = sup ? [
      "function fit(data, p, lib, ctx) → model      必须。训练一次，返回模型（普通对象）。",
      "  data.train、data.valid: { X: Float64Array（n×d，按行存）, y, n, d, k（类别数，回归是 0）, classes, featureNames, shape（图像是 [C, H, W] 或 [H, W]）, tokens（玩具任务：{ vocab }，X 里是 0..vocab−1 的记号）, kind }",
      "  data.kind: \"regression\" | \"classification\"；分类的 y 是 Int32Array，取值 0..k−1。",
      "  验证集只能用来早停、选超参数、监控；测试集算法拿不到。",
      "  p: 参数（冻结的对象，键是参数表里的 key）。",
      "function predict(model, X, n) → 回归：长度 n 的数组；分类：长度 n×k 的概率（每行非负、和为 1）。   必须。X 按行存，d 列。不要在这里训练。",
      "function inspect(model) → 可选。返回模型内部的东西，\"模型内部\"一栏会画出来：",
      "  { layers: [{ name, rows, cols, data: Float32Array }]（权重矩阵）, embedding: { rows, cols, data, labels }（嵌入）, coef: [{ name, value }]（线性系数）,",
      "    tree: { nodes: [{ f, thr, left, right, value, n }] }（叶子的 f = −1）, activations: [{ name, data }], text: \"…\" }"
    ] : [
      "function fit(series, p, lib, ctx) → model    必须。series = { y: Float64Array（训练段）, T, freq, season（季节长度，没有就是 0）, label, valid: { y, start }（验证段，只能用来选参数、早停）}",
      "function forecast(model, past, h) → 长度 h 的数组    必须。past 是截至当前时刻（含）的全部观测（Float64Array），预测之后的 h 步。不许用到 past 之后的数据。",
      "function update(model, yNew)    可选。新观测到来时更新内部状态（不重新训练），滚动预测会按时间顺序把验证段、测试段的观测依次喂进来。",
      "function inspect(model)    可选，同监督学习。",
      "评价：在验证段、测试段的每个时刻 t 作为原点，调用 forecast(model, y[0..t], H) 和 y[t+1..t+H] 比。模型只在训练段上 fit 一次（滚动原点、不重训）。"
    ];
    return head.join("\n") + "\n\n── ctx ──\n" + CTX_DOC + "\n\n── lib ──\n" + LIB_DOC + "\n\n代码里只能用标准 JavaScript 和传进来的 lib、ctx：页面、网络、Math.random 都碰不到（代码在隔离的后台线程里运行）。";
  };

  /* ---------- 发给 AI 的上下文 ---------- */
  function trim(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n) + "……（以下省略）" : s; }
  function paramLine(spec, vals) { return (spec || []).map(function (q) { var v = vals[q.key]; if (q.type === "select") { var o = (q.options || []).filter(function (x) { return String(x[0]) === String(v); })[0]; if (o) v = o[1] + "（" + o[0] + "）"; } return q.key + "（" + q.label + "）= " + (typeof v === "number" ? G(v) : String(v)); }).join("；"); }
  function dsText() {
    var d = A.ds(), g = A.group(), pv = A.preview || {}, L = [];
    if (!d) return "（没有数据集）";
    L.push("任务分组：" + g.name + "；family = " + d.family + "，kind = " + d.kind + "。");
    L.push("数据集：" + d.name + (d.id === "csv" ? "（使用者导入的 CSV）" : "（id " + d.id + "）") + "。" + (d.summary || ""));
    var og = A.dsOrigin(d); if (og) L.push("数据的来源：" + og.label + "。" + og.note);
    if (d.id !== "csv" && d.params && d.params.length) L.push("数据集参数：" + paramLine(d.params, A.dsParams()) + "；种子 " + A.dsSeed() + "。");
    if (d.kind === "forecast") { var se = pv.series || {}; L.push("序列：共 " + (se.T || "?") + " 个时刻，频率 " + (se.freq || "?") + (se.label ? "，" + se.label : "") + "。按时间切成训练 / 验证 / 测试 = " + S.split.train + " / " + S.split.valid + " / " + F(1 - S.split.train - S.split.valid, 2) + "，预测步长 H = " + S.horizon + "。"); }
    else {
      L.push("样本 " + (pv.n || "?") + " 个，每个 " + (pv.d || "?") + " 维" + (pv.shape ? "（图像形状 " + JSON.stringify(pv.shape) + "）" : "") + (pv.tokens ? "（每个特征是 0.." + ((pv.tokens.vocab || pv.tokens) - 1) + " 的记号，词表大小 data.train.tokens.vocab）" : "") + "。");
      if (pv.classes) L.push("类别（k = " + pv.classes.length + "）：" + pv.classes.slice(0, 30).join("、") + (pv.classCounts ? "；各类样本数 " + pv.classCounts.slice(0, 30).join("、") : "") + "。");
      if (pv.featureNames) L.push("特征：" + pv.featureNames.slice(0, 60).join("、") + (pv.featureNames.length > 60 ? "……" : "") + "。");
      L.push(d.family === "toy" ? "划分：训练集占 trainFrac，其余对半分成验证集和测试集。" : "划分：训练 / 验证 / 测试 = " + S.split.train + " / " + S.split.valid + " / " + F(1 - S.split.train - S.split.valid, 2) + (d.kind === "classification" ? "（按类别分层）" : "") + "。");
    }
    L.push("时间预算：" + S.budget + " 秒（fit 里用 ctx.timeLeft() 读）。");
    if (d.docs) L.push("数据集的说明（节选）：\n" + trim(d.docs, 2500));
    return L.join("\n");
  }
  function algoText(a, params, withCode) {
    if (!a) return "（没有算法）";
    var L = ["算法：" + a.name + "（" + (a.src === "ai" ? "AI 写的" : a.src === "mine" ? "使用者自己的" : a.src === "py" ? "本机 Python" : "内置，id " + a.id) + "）。" + (a.summary || "")];
    if ((a.params || []).length) L.push("参数：" + paramLine(a.params, params || {}) + "。");
    if (withCode && a.code) L.push("代码：\n```js\n" + trim(a.code, 14000) + "\n```");
    return L.join("\n");
  }
  function curveText(cv) {
    if (!cv || cv.length < 2) return "没有学习曲线（代码没有调用 ctx.report）。";
    var keys = {}; cv.forEach(function (p) { for (var k in p) if (k !== "step") keys[k] = 1; });
    var n = cv.length, pick = [0, Math.floor(n * 0.1), Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1].filter(function (x, i, arr) { return arr.indexOf(x) === i; });
    var L = ["学习曲线（共 " + n + " 个点，抽几个）："];
    pick.forEach(function (i) { var p = cv[i]; L.push("  第 " + G(p.step) + " 步：" + Object.keys(keys).filter(function (k) { return p[k] != null; }).map(function (k) { return k + " = " + G(p[k]); }).join("，")); });
    Object.keys(keys).forEach(function (k) { var best = Infinity, at = 0, hb = /acc|metric|r2/i.test(k) && !/loss|mse/i.test(k); cv.forEach(function (p) { if (p[k] == null) return; var v = hb ? -p[k] : p[k]; if (v < best) { best = v; at = p.step; } }); if (best < Infinity) L.push("  " + k + " 最好的是 " + G(hb ? -best : best) + "，在第 " + G(at) + " 步。"); });
    return L.join("\n");
  }
  function resText(L0, allowTest) {
    var L = A.last; if (!L) return A.lastError ? "上一次运行出错了：" + A.lastError.message + (A.lastError.line ? "（代码第 " + A.lastError.line + " 行）" : "") : "还没有运行过。";
    var res = L.res, pk = res.primary, out = [], fm = function (k, v) { return A.metFmt(k, v); };
    if (A.stale()) out.push("（注意：使用者在这次运行之后改过设定，下面是上一次的结果。）");
    out.push("算法：" + L.algo.name + "；参数：" + paramLine(L.algo.params, L.params) + "。");
    out.push("样本：训练 " + res.split.nTrain + "、验证 " + res.split.nValid + "、测试 " + res.split.nTest + "。训练用时 " + A.secs(res.fitMs) + (res.size != null ? "，参数 " + res.size + " 个" : "") + "。");
    out.push("主指标：" + A.metName(pk) + "（" + (res.higherBetter ? "越大越好" : "越小越好") + "）。");
    ["train", "valid"].concat(allowTest && (L.revealed || (A.isRevealed && A.isRevealed(L))) ? ["test"] : []).forEach(function (w) { var m = res.metrics[w]; out.push((w === "train" ? "训练集" : w === "valid" ? "验证集" : "测试集") + "：" + Object.keys(m).filter(function (k) { return m[k] != null && m[k] === m[k] && k !== "n"; }).map(function (k) { return A.metName(k) + " " + fm(k, m[k]); }).join("，") + (w !== "train" ? "（主指标的标准误 " + fm(pk, A.primarySE(res, w)) + "）" : "")); });
    if (!allowTest || !(L.revealed || (A.isRevealed && A.isRevealed(L)))) out.push("测试集：还没有揭晓（不给你看）。");
    out.push("基线（" + res.baseline.name + "）验证集 " + A.metName(pk) + " = " + fm(pk, res.baseline.metrics.valid[pk]) + "。");
    if (res.oracle && res.oracle.metrics) out.push("理论最优（知道真实的生成规律）验证集 " + A.metName(pk) + " = " + fm(pk, res.oracle.metrics.valid[pk]) + (res.oracle.note ? "（" + res.oracle.note + "）" : "") + "。");
    if (res.bayes && res.bayes.value != null) out.push("理论上限：" + A.metName(res.bayes.metric || pk) + " = " + fm(res.bayes.metric || pk, res.bayes.value) + (res.bayes.note ? "（" + res.bayes.note + "）" : "") + "。");
    out.push(curveText(res.curve));
    var imp = res.importance && res.importance.items ? res.importance.items : null;
    if (imp && imp.length) out.push("置换重要性（验证集上把一列打乱后" + (res.importance.metric === "acc" ? "准确率下降" : "MSE 上升") + "多少，前 12 个）：" + imp.slice().sort(function (a, b) { return b.drop - a.drop; }).slice(0, 12).map(function (x) { return x.name + " " + G(x.drop) + " ± " + G(x.se); }).join("；") + "。");
    if (res.kind === "classification" && res.k <= 12) {
      var k = res.k, M = QL.mlstats.confusion(res.pred.valid, res.truth.valid, k), rows = [];
      for (var i = 0; i < k; i++) { var tot = 0, c; for (c = 0; c < k; c++) tot += M[i * k + c]; rows.push("真实 " + i + "：" + Array.from({ length: k }, function (_, c2) { return M[i * k + c2]; }).join(" ") + "（对 " + (tot ? P(M[i * k + i] / tot, 0) : "—") + "）"); }
      out.push("验证集的混淆矩阵（行 = 真实类别，列 = 预测）：\n  " + rows.join("\n  "));
    }
    if (res.log && res.log.length) out.push("算法的日志（最后几行）：" + res.log.slice(-8).join(" | "));
    if (res.internals && res.internals.text) out.push("inspect 的说明：" + trim(res.internals.text, 600));
    return out.join("\n");
  }
  function boardText() {
    var runs = A.expRuns ? A.expRuns() : [], E = A.expOf ? A.expOf() : null; if (!runs.length || !E) return "";
    var pk = E.primary, hb = E.hb, sorted = runs.slice().sort(function (a, b) { return hb ? b.m.valid[pk] - a.m.valid[pk] : a.m.valid[pk] - b.m.valid[pk]; }).slice(0, 10);
    return "这个实验的排行榜（按验证集 " + A.metName(pk) + "，前 " + sorted.length + " 名，共 " + runs.length + " 次）：\n" + sorted.map(function (r, i) { return "  " + (i + 1) + ". " + r.name + "：" + A.metFmt(pk, r.m.valid[pk]) + (r.params && Object.keys(r.params).length ? "（" + Object.keys(r.params).slice(0, 6).map(function (k) { return k + "=" + r.params[k]; }).join("，") + "）" : ""); }).join("\n");
  }

  /* ---------- 提示词 ---------- */
  var RULES = [
    "你是一名严谨的机器学习研究员，在一个浏览器里的机器学习实验室中工作。用中文回答；数学用 $...$ 和 $$...$$ 的 LaTeX。",
    "基本纪律：只按验证集挑模型；不要假设能看到测试集；不确定的地方直说；数字要和给你的材料一致，不要编。"
  ].join("\n");
  function fmtRules() {
    return "# 输出格式（必须严格遵守：四个标记各独占一行，标记之外不要写任何内容）\n<<<META>>>\n" +
      '{"name": "不超过 16 个字的中文名", "summary": "一句话说明", "params": [{"key": "lr", "label": "学习率", "def": 0.01, "min": 0.0001, "max": 1, "step": 0.0001, "type": "num", "desc": "…"}]}\n' +
      "（params 是可调参数表：type 取 num / int / bool / select；select 要给 options: [[值, \"名字\"], …]；最多 10 个；代码里用 p.key 读。）\n" +
      "<<<CODE>>>\n（JavaScript 代码，不要用代码围栏。顶层定义 fit、predict（时间序列是 fit、forecast，可选 update）和可选的 inspect。代码要有中文注释，缩进整齐，方便使用者读和改。）\n" +
      "<<<EXPLAIN>>>\n（Markdown。依次写以下几节，每节用二级标题）\n## 思路\n## 模型与损失\n## 为什么这样设计\n## 参数怎么调\n## 预期与风险\n<<<END>>>";
  }
  function codeRules() {
    var d = A.ds(), api = A.apiOf(d);
    return "# 接口（必须遵守）\n" + A.apiDoc(api) + "\n\n# 硬性要求\n" + [
      "- 迭代训练的循环每一轮都检查 ctx.timeLeft()，小于 0 就停（可以先留一点余量，例如 < 200 毫秒就停）。",
      "- 训练过程中定期调用 ctx.report(step, {...})（学习曲线），能画快照的模型（神经网络、迭代的模型）每隔一段调用一次 ctx.snapshot(step, model)，全程 20 到 60 次。",
      "- 分类的 predict 必须返回 n×k 的概率，每行非负、和为 1（用 softmax 或者归一化）。数值要稳定：取对数之前加 1e-12，softmax 先减最大值。",
      "- 只用标准 JavaScript 和 lib、ctx；随机数只用 lib.rng。不要写 import、require、fetch、eval。",
      "- 大数据集要控制计算量：n 可能上万、d 可能上千（图像），predict 一次可能要处理几千行。",
      "- 早停和选超参数只用 data.valid（时间序列是 series.valid）。",
      api === "forecast" ? "- forecast 只能用 past（截至当前时刻的观测），不能用别的未来信息。" : "- 不要在 predict 里训练，也不要在 fit 里预测测试集（拿不到）。"
    ].join("\n");
  }
  function promptWrite(idea, fix) {
    var a = A.algo();
    return [RULES, "# 这次的任务\n" + dsText(), fix ? "# 要修的代码\n" + algoText(a, A.algoParams(), true) + "\n\n# 运行时的错误\n" + fix + "\n\n请修好这个错误，保持算法的思路不变（除非思路本身就是错的）。" : "# 使用者的想法\n" + idea + "\n\n请据此写一个算法。" + (a ? "\n\n（参考：使用者现在选的算法是 " + a.name + "，它的成绩见下。）\n" + resText(null, false) : ""), codeRules(), fmtRules()].join("\n\n");
  }
  function promptImprove(round, hist, base, extra) {
    return [RULES, "# 任务\n" + dsText(),
      "# 当前最好的算法（按验证集）\n" + algoText(base.algo, base.params, true) + "\n\n# 它的结果\n" + base.text,
      hist.length ? "# 这一轮自动改进之前试过的版本\n" + hist.map(function (x, i) { return (i + 1) + ". " + x.name + "：" + x.line + (x.note ? "（" + x.note + "）" : ""); }).join("\n") : "",
      boardText(),
      extra ? "# 使用者或诊断给出的方向\n" + extra : "",
      "# 要求\n这是第 " + round + " 轮。写一个你认为在验证集主指标上会更好的版本：可以改结构、损失、优化、特征、正则化或超参数的默认值。一次只做一两个有理由的改动，在\"为什么这样设计\"一节里说清楚改了什么、为什么预期会更好。不要只是把训练时间拉长；时间预算是固定的。" + (A.ds().family === "toy" ? "注意玩具任务的现象（比如顿悟）往往需要足够的权重衰减和训练步数。" : ""),
      codeRules(), fmtRules()].filter(Boolean).join("\n\n");
  }
  function staleNote() { return A.last && A.stale() ? "（注意：“任务”一节是现在的设定，“结果”一节是使用者改设定之前那一次运行的，两者可能对不上；回答时要考虑到这一点。）" : ""; }
  function promptDiag() {
    return [RULES, staleNote(), "# 任务\n" + dsText(), "# 算法\n" + algoText(A.last ? A.last.algo : A.algo(), A.last ? A.last.params : A.algoParams(), true), "# 这次运行的结果\n" + resText(null, true), boardText(),
      "# 要求\n写一份诊断报告（Markdown，每节用二级标题）：\n## 结论\n（三五句话：好不好、主要问题是什么）\n## 证据\n（逐条引用上面的数字：训练与验证的差距、学习曲线的走势、和基线及理论最优的距离、混淆矩阵或特征重要性里的线索；说明每条证据支持什么判断）\n## 偏差还是方差\n（欠拟合、过拟合还是两者都不是；为什么）\n## 数据与评价\n（数据本身的难度、噪声的下限、样本量是否够、指标是否合适、有没有泄漏或划分的问题）\n## 下一步\n（按预期收益排序的三条具体建议：改什么、改成多少、预期验证集主指标怎么变、怎么验证）\n只根据给你的材料下结论；材料不够的地方说缺什么。"].filter(Boolean).join("\n\n");
  }
  function askRules() {
    return [RULES, "下面是实验室当前的状态。回答使用者的问题：先直接回答，再给理由；需要推导就写推导。", staleNote(), "# 任务\n" + dsText(), "# 算法\n" + algoText(A.last ? A.last.algo : A.algo(), A.last ? A.last.params : A.algoParams(), true), "# 结果\n" + resText(null, true), boardText()].filter(Boolean).join("\n\n");
  }
  A.aiPrompt = function (kind, x) { return kind === "diag" ? promptDiag() : kind === "ask" ? askRules() : promptWrite(x || "", null); };   // 测试和调试用

  /* ---------- 解析回答 ---------- */
  function parseReply(text) {
    var iM = text.lastIndexOf("<<<META>>>"); if (iM < 0) return { stage: 0 };
    var iC = text.indexOf("<<<CODE>>>", iM), iE = iC < 0 ? -1 : text.indexOf("<<<EXPLAIN>>>", iC), iZ = iE < 0 ? -1 : text.indexOf("<<<END>>>", iE);
    var out = { stage: 1, metaRaw: text.slice(iM + 10, iC < 0 ? undefined : iC) };
    if (iC >= 0) { out.stage = 2; out.code = text.slice(iC + 10, iE < 0 ? undefined : iE).replace(/^\s*```[a-zA-Z]*\s*\n/, "").replace(/\n```\s*$/, "").replace(/^\n+|\s+$/g, ""); }
    if (iE >= 0) { out.stage = 3; out.explain = text.slice(iE + 13, iZ < 0 ? undefined : iZ).trim(); }
    if (iZ >= 0) out.stage = 4;
    if (iC >= 0) { var a = out.metaRaw.indexOf("{"), b = out.metaRaw.lastIndexOf("}"); if (a >= 0 && b > a) { try { out.meta = JSON.parse(out.metaRaw.slice(a, b + 1)); } catch (e) { out.metaErr = e.message; } } }
    return out;
  }
  A.parseReply = parseReply;
  /** AI 给的参数表：只留认得的字段，数夹到范围里 */
  function cleanParams(list, max) {
    var seen = {}, out = [];
    (Array.isArray(list) ? list : []).slice(0, max || 10).forEach(function (q) {
      if (!q || typeof q.key !== "string" || !/^[A-Za-z_$][\w$]*$/.test(q.key) || seen[q.key]) return; seen[q.key] = 1;
      var label = String(q.label || q.key).slice(0, 40), desc = q.desc ? String(q.desc).slice(0, 300) : "";
      if (q.type === "bool" || typeof q.def === "boolean") { out.push({ key: q.key, label: label, def: !!q.def, type: "bool", desc: desc }); return; }
      if (q.type === "select" && Array.isArray(q.options) && q.options.length) {
        var opts = q.options.slice(0, 12).map(function (o) { return Array.isArray(o) ? [o[0], String(o[1] != null ? o[1] : o[0]).slice(0, 30)] : [o, String(o).slice(0, 30)]; }).filter(function (o) { return typeof o[0] === "string" || typeof o[0] === "number"; });
        if (opts.length) { var dv = opts.some(function (o) { return String(o[0]) === String(q.def); }) ? opts.filter(function (o) { return String(o[0]) === String(q.def); })[0][0] : opts[0][0]; out.push({ key: q.key, label: label, def: dv, type: "select", options: opts, desc: desc }); return; }
      }
      var def = +q.def, min = +q.min, max = +q.max, step = +q.step, isInt = q.type === "int";
      if (!(def === def)) return;
      if (!(min === min)) min = Math.min(0, def * 2); if (!(max === max)) max = Math.max(def * 2, def + 1);
      if (min > max) { var t = min; min = max; max = t; } if (min === max) max = min + 1;
      if (def < min) min = def; if (def > max) max = def;
      if (!(step > 0)) step = isInt ? 1 : (max - min) / 100;
      if (isInt) { min = Math.floor(min); max = Math.ceil(max); def = Math.round(def); step = Math.max(1, Math.round(step)); }
      out.push({ key: q.key, label: label, def: def, min: min, max: max, step: step, type: isInt ? "int" : "num", desc: desc });
    });
    return out;
  }
  A.aiCleanParams = cleanParams;

  /* ---------- 面板 ---------- */
  function card() { var el = h("div", { class: "msg-a" }); $("aiLog").appendChild(el); scrollLog(); return el; }
  function scrollLog() { var l = $("aiLog"); if (l) l.scrollTop = l.scrollHeight; }
  var lastScroll = 0; function scrollSoft() { var now = Date.now(); if (now - lastScroll > 400) { lastScroll = now; var l = $("aiLog"); if (l && l.scrollHeight - l.scrollTop - l.clientHeight < 240) l.scrollTop = l.scrollHeight; } }
  function bubble(text) { var e = $("aiEmpty"); if (e) e.remove(); $("aiLog").appendChild(h("div", { class: "msg-u", text: text })); scrollLog(); }
  function setBusy(b) { busy = b; var s = $("aiSend"), st = $("aiStop"); if (s) s.hidden = b; if (st) st.hidden = !b; }
  function statusRow(text) { return h("div", { class: "a-status" }, h("span", { class: "spin" }), h("span", { text: text })); }
  function say(status, text) { if (status && status.lastChild) status.lastChild.textContent = text; }
  function paramTable(params) {
    if (!params.length) return h("div", { class: "note", text: "没有可调参数。" });
    return h("table", { class: "ptab" }, h("thead", null, h("tr", null, ["参数", "默认", "范围", "含义"].map(function (t) { return h("th", { text: t }); }))),
      h("tbody", null, params.map(function (q) { return h("tr", null, h("td", { text: q.label }), h("td", { class: "num mono", text: q.type === "bool" ? (q.def ? "是" : "否") : q.type === "select" ? String(q.def) : G(q.def) }), h("td", { class: "num mono", text: q.type === "bool" ? "" : q.type === "select" ? q.options.map(function (o) { return o[1]; }).join(" / ") : G(q.min) + " – " + G(q.max) }), h("td", { text: q.desc || "" })); })));
  }
  function codeBlock(code) { return h("details", { class: "more" }, h("summary", { text: "代码（" + code.split("\n").length + " 行）" }), h("div", { class: "more-body" }, h("pre", { class: "code", text: code }))); }
  /* 在 Claude 里打开时，window.claude 的 sample 报的错（代码见 Artifact 的 sample 能力的说明） */
  var HERR = {
    not_granted: "你没有允许这个页面使用 Claude。重新打开页面时可以再选。", sampling_disabled: "这个账号或组织没有开通页面里使用 Claude。",
    not_declared: "这个页面没有被授予使用 Claude 的能力。", capability_disabled: "当前的打开方式下不能使用 Claude。", capability_removed: "当前的 Claude 应用版本不支持这个调用，请更新应用。",
    tools_unavailable: "当前的打开方式不支持这个功能。", rate_limited: "调用太频繁，或者已经用到了账号的用量上限。过一会儿再试。", session_expired: "登录已过期，请重新登录 Claude 后再试。",
    refused: "Claude 没有接受这个请求，换个说法试试。", empty_completion: "没有得到回答，请把要求说得更具体一些再试。", invalid_json: "回答的格式不对，请再试一次。",
    prompt_too_large: "发送的内容太长了（最多 256 KB）。把自己写的代码改短一些再试。", invalid_request: "请求的格式有误（这是页面的问题）。", transform_error: "请求没能准备好（这是页面的问题）。",
    queue_overflow: "一下子发出的请求太多了。刷新页面再试。", upstream_error: "Claude 那边暂时出了问题。过一会儿再试。", unavailable: "这个页面现在用不了 Claude。"
  };
  var HOST_OFF = /^(not_granted|sampling_disabled|not_declared|capability_disabled|capability_removed)$/;   // 这次打开页面期间都用不了：关掉输入
  function errText(e) {
    if (WEB && e && e.code) return WEB.explain(e).text;
    if (e && e.code === "cancelled") return "已停止。";
    if (HOST && e && e.code) return HERR[e.code] || HERR.upstream_error;
    return "出错了：" + (e && e.message || e) + "。";
  }
  function fail(el, e) {
    var st = el.querySelector(".a-status"); if (st) st.remove();
    if (e && e.code === "cancelled") { el.appendChild(h("div", { class: "note", text: "已停止。" })); return; }
    if (e && e.code === "bad_format") { el.appendChild(h("div", { class: "warn err", text: "回答没有按约定的格式给出，没法自动载入。原文如下，可以再发一次。" })); el.appendChild(h("pre", { class: "code", text: String(e.text || "").slice(0, 6000) })); return; }
    if (WEB && e && e.code) {
      var ex = WEB.explain(e);
      el.appendChild(h("div", { class: "warn err", text: ex.text }));
      if (ex.detail) el.appendChild(h("div", { class: "note ai-detail", text: who() + " 的原话：" + ex.detail }));
      if (/^(bad_auth|bad_model|bad_url|network|proxy_refused|unavailable|quota|invalid_request|timeout)$/.test(e.code)) el.appendChild(h("div", { class: "a-actions" }, h("button", { class: "btn small", type: "button", text: "打开设置", onclick: function () { A.openAiSettings(); } })));
      return;
    }
    el.appendChild(h("div", { class: "warn err", text: errText(e) }));
    if (HOST && e && HOST_OFF.test(e.code || "")) { sample = null; var off = $("aiOff"); if (off) { off.hidden = false; off.textContent = errText(e) + "其余功能不受影响。"; } var sb = $("aiSend"), ta = $("aiInput"); if (sb) sb.disabled = true; if (ta) ta.disabled = true; }
  }
  /** tier：独立网页里"complex"允许深度思考（写代码），"default"直接回答（问结果、诊断） */
  function call(input, tier, onText, status) {
    ctl = new AbortController();
    var o = { signal: ctl.signal, modelTier: tier || "default" };
    if (onText) o.onText = function (u) { try { onText(u.text); } catch (e) { console.error(e); } };
    if (WEB && status) o.onThink = function (n) { say(status, who() + " 正在深度思考…（已经想了 " + n + " 字）"); };
    return sample(input, o);
  }
  /** 一次"写代码"的请求：流式显示，返回 { rec（存好的算法）, explain } */
  function writeOnce(el, prompt, label) {
    var d0 = A.ds(), key0 = A.expKey();
    var status = statusRow(who() + " " + label + "…"), live = h("div"); el.appendChild(status); el.appendChild(live);
    var exEl = null;
    return call(prompt, "complex", function (t) {
      var r = parseReply(t); say(status, [who() + " 正在思考…", "正在定参数…", "正在写代码…", "正在写说明…", "正在收尾…"][r.stage]);
      if (r.stage >= 3 && r.explain) { if (!exEl) { exEl = h("div", { class: "md" }); live.appendChild(exEl); } QLMD.mountPartial(exEl, r.explain); scrollSoft(); }
    }, status).then(function (res) {
      var r = parseReply(res.text); status.remove(); live.remove();
      if (r.stage < 3 || !r.code) throw { code: "bad_format", text: res.text };
      var meta = r.meta || {}, params = cleanParams(meta.params), d = d0;
      var bad = QLMLRunner.syntax(r.code);
      var rec = A.saveMine({ name: String(meta.name || "AI 写的算法").slice(0, 24), summary: String(meta.summary || "").slice(0, 200), code: r.code, params: params, docs: r.explain || "", src: "ai", api: A.apiOf(d), kinds: [d.kind], families: [d.family] });
      return { rec: rec, explain: r.explain || "", syntax: bad, truncated: res.truncated, moved: A.expKey() !== key0 };
    });
  }
  function headOf(rec) { return h("div", { class: "a-h" }, h("b", { text: rec.name }), h("span", { class: "tag", text: "AI 写的" })); }
  function resultLine(res, prev) {
    var pk = res.primary, v = res.metrics.valid[pk], b = res.baseline.metrics.valid[pk], se = A.primarySE(res, "valid");
    var s = "验证集 " + A.metName(pk) + " " + A.metFmt(pk, v) + " ± " + A.metFmt(pk, se) + "（基线 " + A.metFmt(pk, b) + (res.oracle && res.oracle.metrics ? "，理论最优 " + A.metFmt(pk, res.oracle.metrics.valid[pk]) : "") + "）";
    if (prev) { var dlt = res.higherBetter ? v - prev : prev - v; s += "；比之前 " + (dlt > 0 ? "好 " : dlt < 0 ? "差 " : "持平 ") + A.metFmt(pk, Math.abs(dlt)); }
    return s;
  }
  /** 选中并运行一个算法；返回 Promise<res>（出错时 reject 运行器的错误） */
  function runRec(rec, params) { A.selectAlgo(rec.id); if (params) { A.S.algo[A.ds().family + "/" + A.ds().kind].params[rec.id] = Object.assign({}, params); A.persist(); A.renderAlgo(); } return A.run({ quiet: true }); }
  function defsOf(rec) { var o = {}; (rec.params || []).forEach(function (q) { o[q.key] = q.def; }); return o; }

  /* ---------- 写算法（也用来修错） ---------- */
  function doWrite(idea, fix, attempt) {
    var el = card();
    return writeOnce(el, promptWrite(idea, fix), fix ? "正在修代码" : "正在写算法").then(function (w) {
      var rec = w.rec; el.appendChild(headOf(rec));
      if (rec.summary) el.appendChild(h("div", { class: "note", style: { "margin-bottom": "6px" }, text: rec.summary }));
      el.appendChild(paramTable(rec.params)); el.appendChild(codeBlock(rec.code));
      var ex = h("div", { class: "md", style: { "margin-top": "8px" } }); QLMD.mount(ex, w.explain); el.appendChild(ex);
      var line = statusRow("已存进“AI 写的”，正在运行…"), acts = h("div", { class: "a-actions" }); el.appendChild(line); el.appendChild(acts);
      acts.appendChild(h("button", { class: "btn small", type: "button", text: "代码与说明", onclick: function () { A.selectAlgo(rec.id); A.openCode(); } }));
      if (w.syntax) { line.className = "warn err"; clear(line); line.textContent = "代码有语法错误：" + w.syntax; acts.appendChild(fixBtn(w.syntax, attempt)); A.selectAlgo(rec.id); return; }
      if (w.moved) { line.className = "note"; clear(line); line.textContent = "AI 写代码的时候，数据或设定改过了：代码已经存进“AI 写的”，没有自动运行。"; return; }
      return runRec(rec).then(function (res) {
        line.className = "note"; clear(line); line.textContent = "运行完成：" + resultLine(res);
        acts.appendChild(h("button", { class: "btn small primary", type: "button", text: "让 " + NAME + " 诊断", onclick: function () { A.aiDiagnose(); } }));
        acts.appendChild(h("button", { class: "btn small", type: "button", text: "自动改进", onclick: function () { A.aiImprove(); } }));
      }, function (e) {
        if (e && e.cancelled) { line.className = "note"; clear(line); line.textContent = "运行已停止。"; return; }
        line.className = "warn err"; clear(line); line.textContent = "运行出错：" + e.message + (e.line ? "（第 " + e.line + " 行）" : "");
        acts.appendChild(fixBtn(e.message + (e.line ? "（出错的是代码第 " + e.line + " 行：" + lineOf(rec.code, e.line) + "）" : ""), attempt));
      });
    }).catch(function (e) { fail(el, e); });
  }
  function lineOf(code, n) { var ls = String(code || "").split("\n"); return n > 0 && n <= ls.length ? ls[n - 1].trim().slice(0, 200) : ""; }
  function fixBtn(msg, attempt) { return h("button", { class: "btn small primary", type: "button", text: "让 " + NAME + " 修", onclick: function () { send("修复这段代码的错误：" + String(msg).slice(0, 200), { fix: String(msg).slice(0, 1500), attempt: (attempt || 0) + 1 }); } }); }

  /* ---------- 诊断 ---------- */
  function doDiag() {
    var el = card(), status = statusRow(who() + " 正在看这次运行…"), out = h("div", { class: "md" }); el.appendChild(status); el.appendChild(out);
    return call(promptDiag(), "default", function (t) { status.hidden = true; QLMD.mountPartial(out, t); scrollSoft(); }, status).then(function (res) {
      status.remove(); QLMD.mount(out, res.text); lastDiag = res.text;
      el.appendChild(h("div", { class: "a-actions" }, h("button", { class: "btn small primary", type: "button", text: "按“下一步”自动改进", onclick: function () { A.aiImprove(nextSteps(res.text)); } }), h("button", { class: "btn small", type: "button", text: "复制报告", onclick: function () { A.copyText(res.text); } })));
    }).catch(function (e) { fail(el, e); });
  }
  var lastDiag = "";
  function nextSteps(md) { var i = md.search(/##\s*下一步/); return i >= 0 ? md.slice(i).slice(0, 2000) : md.slice(-1500); }

  /* ---------- 自动改进 ---------- */
  var improving = null;
  function doImprove(rounds, extra) {
    var d = A.ds(); if (!A.last || A.stale()) {
      var el0 = card(), st0 = statusRow("先用现在的设定跑一次，作为起点…"); el0.appendChild(st0);
      return A.run({ quiet: true }).then(function () { el0.remove(); return doImprove(rounds, extra); }, function (e) { st0.remove(); el0.appendChild(h("div", { class: "warn err", text: "起点没有跑通：" + (e.message || e) + "。先修好它（可以用“写算法”让 AI 修），再自动改进。" })); });
    }
    var pk = A.last.res.primary, hb = A.last.res.higherBetter, hist = [], me = improving = { stop: false }, key0 = A.expKey();
    var best = { algo: A.last.algo, params: A.last.params, val: A.last.res.metrics.valid[pk], text: resText(null, false), res: A.last.res };
    var start = best.val, el = card(), log = h("ol", { class: "ml-ai-rounds" }), box = h("div");
    el.appendChild(h("div", { class: "a-h" }, h("b", { text: "自动改进：" + rounds + " 轮" }), h("span", { class: "tag", text: "只按验证集挑" })));
    el.appendChild(h("div", { class: "note", text: "起点：" + best.algo.name + "，验证集 " + A.metName(pk) + " " + A.metFmt(pk, start) + "。每一轮 " + who() + " 写一个新版本，实验室在同样的数据、同样的划分上运行；比当前最好的好，就换成它。" }));
    el.appendChild(log); el.appendChild(box);
    function better(v) { return hb ? v > best.val : v < best.val; }
    function round(i) {
      if (me.stop || i > rounds) return Promise.resolve();
      if (A.expKey() !== key0) { box.appendChild(h("div", { class: "warn", text: "数据或设定在自动改进的中途改了：停在第 " + (i - 1) + " 轮。" })); me.stop = true; return Promise.resolve(); }
      var li = h("li"); log.appendChild(li);
      var sub = h("div"); li.appendChild(sub);
      return writeOnce(sub, promptImprove(i, hist, best, extra), "第 " + i + " 轮：正在写改进版").then(function (w) {
        clear(sub); var rec = w.rec;
        sub.appendChild(h("div", null, h("b", { text: rec.name }), " ", h("span", { class: "note", text: rec.summary })));
        var det = h("details", { class: "more" }, h("summary", { text: "说明与代码" }), h("div", { class: "more-body" })); sub.appendChild(det);
        var md = h("div", { class: "md" }); det.lastChild.appendChild(md); QLMD.mount(md, w.explain); det.lastChild.appendChild(paramTable(rec.params)); det.lastChild.appendChild(h("pre", { class: "code", text: rec.code }));
        var st = statusRow("运行中…"); sub.appendChild(st);
        function attempt(r, tries) {
          if (w.syntax) return Promise.reject({ message: "语法错误：" + w.syntax });
          return runRec(r, defsOf(r)).catch(function (e) {
            if (e && e.cancelled) throw e;
            if (tries >= 1 || me.stop) throw e;
            say(st, "运行出错，让 " + who() + " 修一次…");
            var fixEl = h("div"); sub.appendChild(fixEl);
            A.selectAlgo(r.id);
            return writeOnce(fixEl, promptWrite("", e.message + (e.line ? "（第 " + e.line + " 行：" + lineOf(r.code, e.line) + "）" : "")), "正在修").then(function (w2) { fixEl.remove(); w = w2; rec = w2.rec; return attempt(w2.rec, tries + 1); });
          });
        }
        return attempt(rec, 0).then(function (res) {
          var v = res.metrics.valid[pk], up = better(v);
          st.className = "note"; clear(st); st.textContent = resultLine(res, best.val) + (up ? "。换成它。" : "。保留之前的。");
          hist.push({ name: rec.name, line: A.metName(pk) + " " + A.metFmt(pk, v) + (up ? "（比之前好，采用）" : "（没有更好）"), note: rec.summary });
          if (up) best = { algo: rec, params: defsOf(rec), val: v, text: resText(null, false), res: res };
          return round(i + 1);
        }, function (e) {
          if (e && e.cancelled) { st.className = "note"; clear(st); st.textContent = "已停止。"; me.stop = true; return; }
          st.className = "warn err"; clear(st); st.textContent = "没有跑通：" + (e.message || e);
          hist.push({ name: rec.name, line: "运行出错：" + String(e.message || e).slice(0, 160) });
          return round(i + 1);
        });
      }, function (e) {
        if (e && e.code === "cancelled") { me.stop = true; clear(sub); sub.appendChild(h("div", { class: "note", text: "已停止。" })); return; }
        if (e && e.code === "bad_format") { clear(sub); sub.appendChild(h("div", { class: "warn", text: "第 " + i + " 轮的回答没有按约定的格式给出，跳过这一轮。" })); hist.push({ name: "（第 " + i + " 轮）", line: "回答的格式不对" }); return round(i + 1); }
        throw e;
      });
    }
    return round(1).then(function () {
      if (improving === me) improving = null;
      var dlt = hb ? best.val - start : start - best.val;
      box.appendChild(h("div", { class: dlt > 0 ? "note" : "warn" }, dlt > 0 ? "结束：最好的是“" + best.algo.name + "”，验证集 " + A.metName(pk) + " 从 " + A.metFmt(pk, start) + " 到 " + A.metFmt(pk, best.val) + "。" : "结束：几轮都没有超过起点（" + A.metFmt(pk, start) + "）。",
        " 这是在验证集上挑出来的，挑的次数越多越偏乐观；排行榜上有配对检验。确定不再改了，再揭晓一次测试集。"));
      var acts = h("div", { class: "a-actions" }); box.appendChild(acts);
      if (best.algo.src === "ai" || best.algo.src === "mine") acts.appendChild(h("button", { class: "btn small primary", type: "button", text: "选用最好的那个", onclick: function () { A.selectAlgo(best.algo.id); A.run().catch(function () {}); } }));
      acts.appendChild(h("button", { class: "btn small", type: "button", text: "看排行榜", onclick: function () { A.setView("board"); if (window.matchMedia("(max-width: 779.9px)").matches) A.setTab("res"); } }));
      scrollLog();
    }, function (e) { if (improving === me) improving = null; fail(el, e); });
  }

  /* ---------- 问结果 ---------- */
  function doAsk(q) {
    var el = card(), status = statusRow(who() + " 正在看这次的结果…"), out = h("div", { class: "md" }); el.appendChild(status); el.appendChild(out);
    turns.push({ role: "user", content: q }); if (turns.length > 8) turns = turns.slice(-8);
    while (turns.length && turns[0].role !== "user") turns.shift();
    var input = [{ role: "user", content: askRules() }, { role: "assistant", content: "好的，我看过了实验室当前的状态。请问。" }].concat(turns);
    return call(input, "default", function (t) { status.hidden = true; QLMD.mountPartial(out, t); scrollSoft(); }, status).then(function (res) {
      status.remove(); QLMD.mount(out, res.text); turns.push({ role: "assistant", content: res.text });
    }).catch(function (e) { if (turns.length && turns[turns.length - 1].role === "user") turns.pop(); fail(el, e); });
  }

  /* ---------- 发送 ---------- */
  var roundsSel = null;
  function send(text, special) {
    if (busy) return;
    if (!sample) { A.toast(WEB ? "还没有接入 AI：先点右栏的“接入 AI…”" : "这里不能调用 AI。"); return; }
    special = special || {};
    text = String(text || "").trim(); if (!text && !special.auto) return;
    if (text) bubble(text); setBusy(true);
    var m = special.mode || mode, pr;
    if (special.fix) pr = doWrite("", special.fix, special.attempt);
    else if (m === "write") pr = doWrite(text);
    else if (m === "diag") pr = doDiag();
    else if (m === "improve") pr = doImprove(special.rounds || (roundsSel ? +roundsSel.value : 3), special.extra || (special.auto ? "" : text));
    else pr = doAsk(text);
    Promise.resolve(pr).then(function () { setBusy(false); scrollLog(); }, function () { setBusy(false); });
  }
  function ensureOpen() { A.openAI(true); if (!sample) { A.toast(WEB ? "还没有接入 AI：先在右栏点“接入 AI…”" : "这里不能调用 AI。", 3600); return false; } if (busy) { A.toast(who() + " 还在忙上一件事。"); return false; } return true; }
  A.aiDiagnose = function () { if (!ensureOpen()) return; if (!A.last) { A.toast("先运行一次。"); return; } setMode("diag"); send("诊断这次运行：" + A.last.algo.name + " · " + A.last.def.name, { mode: "diag" }); };
  A.aiImprove = function (extra) { if (!ensureOpen()) return; setMode("improve"); send("自动改进 " + (roundsSel ? roundsSel.value : 3) + " 轮" + (typeof extra === "string" && extra ? "（按诊断的建议）" : ""), { mode: "improve", extra: typeof extra === "string" ? extra : "" }); };
  A.aiFix = function (err) { var e = err || A.lastError; if (!e) return; if (e.algo && e.algo.lang === "py") { A.toast("AI 现在只写 JavaScript 的算法。Python 的出错信息（含完整的调用栈）在本机引擎的" + (A.engineMode && A.engineMode() === "mcp" ? "日志里（Claude 桌面版的 mcp-server-mllab-engine.log）。" : "终端里。"), 4600); return; } if (!ensureOpen()) return; if (e.algo) A.selectAlgo(e.algo.id); setMode("write"); send("修复这段代码的错误：" + String(e.message).slice(0, 200), { fix: String(e.message).slice(0, 1200) + (e.line ? "（第 " + e.line + " 行：" + lineOf(e.algo && e.algo.code, e.line) + "）" : "") }); };

  /* ---------- 例子 ---------- */
  function examples(m) {
    var d = A.ds() || {}, f = d.family, k = d.kind;
    if (m === "write") {
      if (f === "timeseries") return ["带季节项的 AR 模型，阶数用验证集选", "用最近 30 个值做输入的小 MLP，直接预测未来 H 步", "回声状态网络，储备池 300 个节点"];
      if (f === "image") return ["两层卷积 + 全局平均池化的小 CNN，格点用循环边界", "先做 PCA 降到 30 维，再用逻辑回归", "把图像展平后用 k 近邻，k 用验证集选"];
      if (f === "toy") return ["一层嵌入 + MLP，用 AdamW 和较大的权重衰减，训练到时间用完（看顿悟）", "单层注意力的小 Transformer", "把输入做独热编码后用两层 MLP"];
      return k === "regression" ? ["带交叉验证选 λ 的岭回归，加二次交互项", "随机傅里叶特征 + 岭回归", "梯度提升树，学习率 0.05，早停用验证集"] : ["两层 MLP，带 dropout 和早停", "RBF 核的支持向量机（用随机傅里叶特征近似）", "随机森林，树的深度和 mtry 用验证集选"];
    }
    if (m === "ask") return ["为什么训练集比验证集好这么多？", "这个结果离理论最优还差多少，差在哪里？", "排行榜上前两名的差别显著吗？"];
    return [];
  }
  var PH = { write: "描述一个算法的想法，" + NAME + " 会写成符合接口的代码并运行…", diag: "（可选）补充你想让它重点看的地方，然后发送…", improve: "（可选）说一个改进的方向，比如“试试更强的正则化”…", ask: "针对当前的结果提问…" };
  var INTRO = {
    write: "说出想法，" + NAME + " 会写成符合实验室接口的算法（代码、参数表和说明），存进“AI 写的”并立刻运行一次。",
    diag: "把这次运行的全部数字交给 " + NAME + "：训练与验证的差距、学习曲线、基线、理论最优、混淆矩阵、特征重要性和排行榜。它会写一份诊断报告，最后给出按预期收益排序的下一步。不会给它测试集的答案。",
    improve: NAME + " 读当前算法的代码和结果，写一个改进版；实验室在同样的数据、同样的划分上运行它，按验证集决定要不要换。重复几轮。只按验证集挑，测试集留到最后。",
    ask: "针对眼前的结果提问。" + NAME + " 能看到当前的数据集、算法的代码和训练 / 验证的成绩（测试集只有揭晓过才给）。"
  };
  function renderEmpty(e) {
    clear(e); e.appendChild(h("div", { text: INTRO[mode] }));
    var eg = h("div", { class: "eg" }); examples(mode).forEach(function (x) { eg.appendChild(h("button", { class: "btn small", type: "button", text: x, onclick: function () { var t = $("aiInput"); t.value = x; if (!t.disabled) t.focus(); } })); }); e.appendChild(eg);
    if (mode === "diag" || mode === "improve") e.appendChild(h("div", { class: "row", style: { "margin-top": "8px" } }, h("button", { class: "btn small primary", type: "button", text: mode === "diag" ? "诊断上一次运行" : "开始自动改进", onclick: function () { if (mode === "diag") A.aiDiagnose(); else A.aiImprove(); } })));
  }
  function setMode(m) {
    mode = m; var ms = $("aiModes"); if (ms) Array.prototype.forEach.call(ms.children, function (b) { b.setAttribute("aria-pressed", b.dataset.m === m ? "true" : "false"); });
    var t = $("aiInput"); if (t) t.placeholder = PH[m];
    var rw = $("aiRoundsWrap"); if (rw) rw.hidden = m !== "improve";
    var e = $("aiEmpty"); if (e) renderEmpty(e);
  }
  A.on("data", function () { var e = $("aiEmpty"); if (e) renderEmpty(e); });

  /* ---------- 接入 AI（独立的网页） ---------- */
  function webSync() {
    var lab = WEB.label(), chip = $("aiProv"), off = $("aiOff"), s = $("aiSend"), t = $("aiInput");
    sample = lab ? WEB.sample() : null;
    if (chip) { chip.textContent = lab ? lab.short + " · " + lab.model : "接入 AI…"; chip.title = lab ? "正在用 " + lab.short + " 的 " + lab.model + "。点这里换服务商、换模型或改密钥。" : "选一家服务商，填上你自己的 API 密钥"; chip.classList.toggle("primary", !lab); }
    if (off) {
      off.hidden = !!lab; clear(off);
      if (!lab) {
        off.appendChild(h("div", { text: "这一栏要先接入一个 AI 才能用：DeepSeek、ChatGPT、Kimi、豆包，或者任何兼容 OpenAI 的接口。用的是你自己的 API 密钥，只保存在这台电脑的浏览器里（和策略实验室共用同一份设置）。" }));
        off.appendChild(h("div", { class: "row", style: { "margin-top": "8px" } }, h("button", { class: "btn small primary", type: "button", text: "接入 AI…", onclick: function () { A.openAiSettings(); } })));
        off.appendChild(h("div", { class: "note", style: { "margin-top": "8px" }, text: "不接入也不影响别的：数据、算法、图表、排行榜和手册都在本地运行；算法的代码可以自己改（左栏的“代码与说明”）。" }));
      }
    }
    if (s) s.disabled = !lab; if (t) t.disabled = !lab;
    var b = $("btnAI"); if (b) b.classList.toggle("primary", !!lab || !WEB);
  }
  /** 设置：和策略实验室里的那一个一样（同一份 localStorage） */
  A.openAiSettings = function () {
    if (!WEB) return;
    var draft = WEB.cfg(), m = null, body = h("div", { class: "ai-set" }), found = {}, busyNow = false;
    if (!draft.p) draft.p = WEB.PRE[0].id;
    if (!draft.by) draft.by = {};
    function cur() { return draft.by[draft.p] || (draft.by[draft.p] = {}); }
    function sayS(kind, text, detail) { var st = body.querySelector(".ai-st"); if (!st) return; clear(st); st.className = "ai-st" + (kind ? " " + kind : ""); if (text) st.appendChild(h("div", { text: text })); if (detail) st.appendChild(h("div", { class: "note", text: detail })); }
    function sayErr(e) { var ex = WEB.explain(e); sayS("bad", "✕ " + ex.text, ex.detail ? "服务商的原话：" + ex.detail : ""); }
    function field(label, control, hint) { return h("div", { class: "ai-f" }, h("label", { text: label, for: control.id || null }), control, hint ? h("div", { class: "note", text: hint }) : null); }
    function lock(on) { busyNow = on; Array.prototype.forEach.call((m ? m.box : body).querySelectorAll("button.ai-act"), function (b) { b.disabled = on; }); }
    function paint() {
      var Pp = WEB.preset(draft.p), u = cur(); clear(body);
      body.appendChild(h("div", { class: "note", text: "用你自己的 API 密钥调用所选的服务商。密钥只保存在这台电脑的这个浏览器里；请求从你的浏览器直接发给服务商，不经过本站；费用由服务商按你的账号计。" }));
      body.appendChild(h("div", { class: "ai-f" }, h("label", { text: "服务商" }), h("div", { class: "ai-provs", role: "group", "aria-label": "服务商" }, WEB.PRE.map(function (x) {
        return h("button", { class: "chip", type: "button", "data-p": x.id, "aria-pressed": x.id === draft.p ? "true" : "false", text: x.name, onclick: function () { draft.p = x.id; paint(); var k = $("aiKey"); if (k) k.focus(); } });
      }))));
      if (Pp.hint) body.appendChild(h("div", { class: "note ai-hint", text: Pp.hint }));
      var needProxy = WEB.noCors(WEB.conf(draft));
      if (needProxy) body.appendChild(h("div", { class: "warn ai-needproxy", text: Pp.short + " 的接口不允许网页直接调用（浏览器的跨域限制会把回答拦下）。要在下面的“高级”里填一个转发代理才能用。" }));
      if (Pp.sites) { var site = h("select", { id: "aiSite", onchange: function () { u.base = site.value === Pp.base ? "" : site.value; paint(); } }, Pp.sites.map(function (x) { return h("option", { value: x[0], text: x[1], selected: (u.base || Pp.base) === x[0] }); })); body.appendChild(field("站点", site)); }
      if (!Pp.base) { var b0 = h("input", { type: "text", id: "aiBase", value: u.base || "", placeholder: "https://…/v1", spellcheck: "false", autocomplete: "off", oninput: function () { u.base = b0.value; } }); body.appendChild(field("接口地址", b0, "到 /v1 为止，后面的 /chat/completions 不用写。")); }
      var key = h("input", { type: "password", id: "aiKey", value: u.key || "", placeholder: WEB.isLocal(u.base || Pp.base) ? "本机的接口可以不填" : "sk-…", spellcheck: "false", autocomplete: "off", oninput: function () { u.key = key.value; } });
      var eye = h("button", { class: "btn small", type: "button", text: "显示", "aria-pressed": "false", onclick: function () { var on = key.type === "password"; key.type = on ? "text" : "password"; eye.textContent = on ? "隐藏" : "显示"; eye.setAttribute("aria-pressed", on ? "true" : "false"); } });
      body.appendChild(h("div", { class: "ai-f" }, h("label", { text: "API 密钥", for: "aiKey" }), h("div", { class: "ai-row" }, key, eye), Pp.keyUrl ? h("div", { class: "note" }, "还没有密钥？", h("a", { href: Pp.keyUrl, target: "_blank", rel: "noopener noreferrer", text: "到 " + Pp.short + " 的控制台申请 ↗" })) : null));
      var list = (found[draft.p] || []).concat(Pp.models.filter(function (x) { return (found[draft.p] || []).indexOf(x) < 0; }));
      var model = h("input", { type: "text", id: "aiModel", value: u.model || "", placeholder: Pp.model || "模型的名字", list: "aiModelList", spellcheck: "false", autocomplete: "off", oninput: function () { u.model = model.value; } });
      var fetchBtn = h("button", { class: "btn small ai-act", type: "button", text: "获取模型列表", onclick: function () {
        if (busyNow) return; lock(true); sayS("", "正在向服务商查询…");
        WEB.models(draft).then(function (ids) { lock(false); found[draft.p] = ids; var keep = model.value; paint(); if (keep) $("aiModel").value = keep; sayS(ids.length ? "good" : "", ids.length ? "查到 " + ids.length + " 个模型：点“模型”那一格可以从里面选。" : "服务商没有返回模型列表，模型的名字要自己填。"); }, function (e) { lock(false); sayErr(e); });
      } });
      body.appendChild(h("div", { class: "ai-f" }, h("label", { text: "模型", for: "aiModel" }), h("div", { class: "ai-row" }, model, fetchBtn), h("datalist", { id: "aiModelList" }, list.map(function (x) { return h("option", { value: x }); })),
        h("div", { class: "note", text: Pp.model ? "留空就用 " + Pp.model + "。模型的名字变得很快，报“不认识这个模型”时点右边的按钮换一个。" : "填服务商给这个模型起的名字。" })));
      var adv = h("details", { class: "more ai-adv", open: !!(u.fast || (Pp.base && u.base && !Pp.sites) || draft.proxy || u.think === false || needProxy) }, h("summary", { text: "高级" })), ab = h("div", { class: "more-body" }); adv.appendChild(ab);
      if (Pp.base && !Pp.sites) { var b1 = h("input", { type: "text", id: "aiBase", value: u.base || "", placeholder: Pp.base, spellcheck: "false", autocomplete: "off", oninput: function () { u.base = b1.value; } }); ab.appendChild(field("接口地址", b1, "一般不用改。走中转或者自建的兼容接口时填在这里。")); }
      var think = h("input", { type: "checkbox", id: "aiThink", checked: u.think !== false, onchange: function () { u.think = think.checked; } });
      ab.appendChild(h("div", { class: "ai-f" }, h("label", { class: "ai-ck", for: "aiThink" }, think, "写算法、自动改进时让模型先深度思考"), h("div", { class: "note", text: "更慢（常常要等一两分钟），代码通常更可靠。诊断、问结果不受这一项影响。" })));
      var proxy = h("input", { type: "text", id: "aiProxy", value: draft.proxy || "", placeholder: "一般留空", spellcheck: "false", autocomplete: "off", oninput: function () { draft.proxy = proxy.value; }, onchange: function () { if (needProxy !== WEB.noCors(WEB.conf(draft))) paint(); } });
      ab.appendChild(field("转发代理", proxy, "有的服务商不允许网页直接调用（浏览器的跨域限制），表现是“请求没有发出去”。这时要有一个转发代理：页面会请求 <代理地址>/<完整的接口地址>。代理能看到你的密钥，只填你自己部署或者信得过的。"));
      body.appendChild(adv);
      body.appendChild(h("div", { class: "ai-st", role: "status", "aria-live": "polite" }));
      body.appendChild(h("div", { class: "note", text: "和本站同一个域名下的其他页面在技术上也读得到保存在这里的密钥。用的是公用电脑的话，用完请点“清除密钥”。" }));
    }
    var clearBtn = h("button", { class: "btn ai-act", type: "button", text: "清除密钥", onclick: function () { var Pp = WEB.preset(draft.p); delete cur().key; var c = WEB.cfg(); if (c.by && c.by[draft.p]) delete c.by[draft.p].key; WEB.save(c); paint(); sayS("", "已经把 " + Pp.short + " 的密钥从这个浏览器里删掉。"); } });
    var testBtn = h("button", { class: "btn ai-act", type: "button", text: "测试连接", onclick: function () { if (busyNow) return; lock(true); sayS("", "正在测试：发一句最短的话，等它回…"); WEB.test(draft).then(function (r) { lock(false); sayS("good", "✓ 通了：" + r.model + " 在 " + (r.ms / 1000).toFixed(1) + " 秒里回了话" + (r.viaProxy ? "（经转发代理）" : "") + "。记得点“保存”。"); }, function (e) { lock(false); sayErr(e); }); } });
    var saveBtn = h("button", { class: "btn primary ai-act", type: "button", text: "保存", onclick: function () { var bad = WEB.problem(WEB.conf(draft)); if (bad) { sayErr({ code: bad }); return; } WEB.save(draft); m.close(); A.toast("已接入 " + WEB.label().short + "。"); A.openAI(true); } });
    paint();
    m = A.modal("接入 AI", body, { narrow: true, cls: "aiset", focus: "#aiKey", foot: [clearBtn, h("span", { style: { flex: "1" } }), testBtn, saveBtn] });
  };

  /* ---------- 面板的开关与初始化 ---------- */
  A.openAI = function (on) {
    var app = $("app"), open = on == null ? !app.classList.contains("ai-open") : on;
    app.classList.toggle("ai-open", open); var b = $("btnAI"); if (b) b.setAttribute("aria-pressed", open ? "true" : "false");
    if (open && window.matchMedia("(max-width: 779.9px)").matches) A.setTab("ai");
    if (open) { var t = $("aiInput"); if (t && !t.disabled) setTimeout(function () { t.focus(); }, 30); }
    setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 30);
  };
  A.initAI = function () {
    var host = clear($("paneAi")); host.setAttribute("aria-label", NAME);
    var b = $("btnAI"); if (b) b.textContent = NAME;
    var tb = document.querySelector('#tabs [data-tab="ai"]'); if (tb) tb.textContent = NAME;
    var prov = WEB ? h("button", { class: "btn small ai-prov", type: "button", id: "aiProv", onclick: function () { A.openAiSettings(); } }) : null;
    host.appendChild(h("div", { class: "ai-h" }, h("h2", { text: NAME }), prov, h("button", { class: "iconbtn", type: "button", "aria-label": "收起 " + NAME + " 面板", text: "✕", onclick: function () { if (window.matchMedia("(max-width: 779.9px)").matches) A.setTab("res"); else A.openAI(false); } })));
    host.appendChild(h("div", { class: "ai-modes", id: "aiModes" }, MODES.map(function (x) { return h("button", { class: "chip", type: "button", "data-m": x[0], "aria-pressed": x[0] === mode ? "true" : "false", text: x[1], onclick: function () { setMode(x[0]); } }); })));
    host.appendChild(h("div", { class: "ai-off", id: "aiOff", hidden: true }));
    var empty = h("div", { class: "ai-empty", id: "aiEmpty" }); renderEmpty(empty);
    host.appendChild(h("div", { class: "ai-log", id: "aiLog", "aria-live": "polite" }, empty));
    var ta = h("textarea", { id: "aiInput", placeholder: PH[mode], "aria-label": "对 " + NAME + " 说", rows: "3" });
    ta.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } });
    function go() { var v = ta.value; if (busy) return; if (!v.trim() && mode !== "diag" && mode !== "improve") return; ta.value = ""; if (mode === "diag") { if (!A.last) { A.toast("先运行一次。"); return; } send(v || "诊断这次运行", { mode: "diag" }); } else if (mode === "improve") send(v || "自动改进", { mode: "improve", extra: v }); else send(v); }
    roundsSel = h("select", { "aria-label": "轮数" }, [1, 2, 3, 4, 5].map(function (n) { return h("option", { value: n, text: n + " 轮", selected: n === 3 }); }));
    host.appendChild(h("div", { class: "ai-in" }, ta, h("div", { class: "row" },
      h("label", { class: "note", id: "aiRoundsWrap", hidden: mode !== "improve", style: { display: "inline-flex", gap: "6px", "align-items": "center" } }, "自动改进", roundsSel), h("span", { style: { flex: "1" } }),
      h("button", { class: "btn", type: "button", id: "aiStop", hidden: true, text: "停止", onclick: function () { if (improving) improving.stop = true; if (ctl) ctl.abort(); if (A.busy()) A.stop(); } }),
      h("button", { class: "btn primary", type: "button", id: "aiSend", text: "发送", title: "⌘/Ctrl + Enter", onclick: go }))));
    if (WEB) { webSync(); WEB.onChange(webSync); return; }
    if (!HOST) { sample = null; var off = $("aiOff"); off.hidden = false; off.textContent = "这个页面没有可用的 AI 接口。其余功能不受影响。"; $("aiSend").disabled = true; ta.disabled = true; return; }
    var sb = $("aiSend"); sb.disabled = true; sb.textContent = "正在连接…";
    window.claude.use("sample").then(function (fn) { sb.textContent = "发送"; if (!fn) { var o = $("aiOff"); o.hidden = false; o.textContent = "当前的打开方式不能调用 Claude。"; return; } sample = fn; sb.disabled = false; }, function () { sb.textContent = "发送"; var o = $("aiOff"); o.hidden = false; o.textContent = "当前的打开方式不能调用 Claude。"; });
  };
  A.aiSend = send; A.aiMode = setMode;
  /** 给别的面板用（比如"从网上取数据"）：问一次，返回 { promise（兑现为回答的全文）, cancel() }。没接入时 ready() 是 false */
  A.aiReady = function () { return !!sample; };
  A.aiWho = who;
  /** extra.webSearch：允许服务商那边上网搜索几次（只有独立网页里接的是 Claude 时才有用）；extra.onSearch(x)：搜了什么、搜到几条。
      回答完以后 meta.searches 是搜了几次，meta.searchOff 表示想搜但这个账号或模型不让搜 */
  A.aiAsk = function (input, tier, onText, extra) {
    var c = new AbortController(), o = { signal: c.signal, modelTier: tier || "default" }, meta = {};
    if (onText) o.onText = function (u) { try { onText(u.text); } catch (e) {} };
    if (WEB && extra && extra.webSearch) { o.webSearch = extra.webSearch; if (extra.onSearch) o.onSearch = function (x) { try { extra.onSearch(x); } catch (e) {} }; }
    var p = sample ? Promise.resolve().then(function () { return sample(input, o); }).then(function (r) { meta.searches = r.searches || 0; meta.searchOff = !!r.searchOff; return r.text; }) : Promise.reject({ code: "unavailable" });
    return { promise: p, cancel: function () { c.abort(); }, meta: meta };
  };
  /** 接的 AI 能不能真的上网搜索（独立网页里接的是 Claude） */
  A.aiCanSearch = function () { return !!(sample && WEB && WEB.canSearch && WEB.canSearch()); };
  /** 是不是在 Claude 里打开的（那里页面不能自己联网） */
  A.aiHost = HOST;
  A.aiErrText = errText;
})(MLA);
