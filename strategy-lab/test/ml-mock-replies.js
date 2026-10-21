// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 机器学习实验室的界面测试共用：假 AI 按提示词给的回答（写算法、修、诊断、自动改进、问结果）。
// ui-ml.js（独立网页，假的兼容 OpenAI 的服务商）和 ui-ml-claude.js（在 Claude 里打开，假的 window.claude）都用它。
const GOOD = `
// 多项逻辑回归（测试用的假 AI 写的）
function fit(data, p, lib, ctx) {
  var tr = data.train, n = tr.n, d = tr.d, k = tr.k, W = new Float64Array(d * k), b = new Float64Array(k);
  var mu = new Float64Array(d), sd = new Float64Array(d), i, j, c;
  for (j = 0; j < d; j++) { var s = 0, s2 = 0; for (i = 0; i < n; i++) { var v = tr.X[i * d + j]; s += v; s2 += v * v; } mu[j] = s / n; sd[j] = Math.sqrt(Math.max(1e-12, s2 / n - mu[j] * mu[j])); }
  var P = new Float64Array(k);
  for (var it = 0; it < 150 && ctx.timeLeft() > 100; it++) {
    var gW = new Float64Array(d * k), gb = new Float64Array(k), loss = 0;
    for (i = 0; i < n; i++) {
      var m = -Infinity;
      for (c = 0; c < k; c++) { var z = b[c]; for (j = 0; j < d; j++) z += W[j * k + c] * (tr.X[i * d + j] - mu[j]) / sd[j]; P[c] = z; if (z > m) m = z; }
      var Z = 0; for (c = 0; c < k; c++) { P[c] = Math.exp(P[c] - m); Z += P[c]; }
      for (c = 0; c < k; c++) { P[c] /= Z; var g = P[c] - (tr.y[i] === c ? 1 : 0); gb[c] += g; for (j = 0; j < d; j++) gW[j * k + c] += g * (tr.X[i * d + j] - mu[j]) / sd[j]; }
      loss -= Math.log(P[tr.y[i]] + 1e-12);
    }
    for (c = 0; c < k; c++) b[c] -= p.lr * gb[c] / n;
    for (j = 0; j < d * k; j++) W[j] -= p.lr * gW[j] / n;
    ctx.report(it, { loss: loss / n });
    if (it % 10 === 0) ctx.snapshot(it, { W: W.slice(), b: b.slice(), mu: mu, sd: sd, d: d, k: k });
  }
  return { W: W, b: b, mu: mu, sd: sd, d: d, k: k };
}
function predict(m, X, n) {
  var out = new Float64Array(n * m.k), d = m.d, k = m.k;
  for (var i = 0; i < n; i++) {
    var mx = -Infinity, Z = 0, c, j;
    for (c = 0; c < k; c++) { var z = m.b[c]; for (j = 0; j < d; j++) z += m.W[j * k + c] * (X[i * d + j] - m.mu[j]) / m.sd[j]; out[i * k + c] = z; if (z > mx) mx = z; }
    for (c = 0; c < k; c++) { out[i * k + c] = Math.exp(out[i * k + c] - mx); Z += out[i * k + c]; }
    for (c = 0; c < k; c++) out[i * k + c] /= Z;
  }
  return out;
}
function inspect(m) { var coef = []; for (var j = 0; j < m.d; j++) coef.push({ name: "x" + (j + 1), value: m.W[j * m.k + m.k - 1] }); return { coef: coef }; }`;
const BAD = GOOD.replace("var tr = data.train,", "var tr = data.train; undefinedFunction(); var");
function algoReply(code, name) {
  return "<<<META>>>\n" + JSON.stringify({ name: name, summary: "标准化之后做多项逻辑回归，全批量梯度下降。", params: [{ key: "lr", label: "学习率", def: 0.5, min: 0.01, max: 2, step: 0.01, type: "num", desc: "梯度下降的步长" }] }) +
    "\n<<<CODE>>>\n" + code + "\n<<<EXPLAIN>>>\n## 思路\n线性的决策边界。\n## 模型与损失\n$p(y = c \\mid x) = \\mathrm{softmax}(Wx + b)_c$，损失是交叉熵。\n## 为什么这样设计\n先标准化，学习率可以取大一些。\n## 参数怎么调\n学习率 0.1 到 1。\n## 预期与风险\n两个半月这种弯的边界上会欠拟合。\n<<<END>>>";
}
function reply(messages) {
  const all = messages.map((m) => m.content).join("\n"), first = String(messages[0] && messages[0].content || "");
  if (/^Connection test/.test(first)) return "OK";
  if (/写一份诊断报告/.test(first)) return "## 结论\n这是一个线性模型，验证集准确率明显高于基线，但边界是弯的。\n## 证据\n训练集与验证集的准确率相近。\n## 偏差还是方差\n偏差为主：$\\hat\\theta$ 受模型族限制。\n## 数据与评价\n样本量够。\n## 下一步\n1. 加二次特征。\n2. 换成 MLP。\n3. 用核方法。";
  if (/# 输出格式/.test(first)) {
    if (/# 运行时的错误/.test(first)) return algoReply(GOOD, "修好的逻辑回归");
    if (/使用者的想法\n.*坏/.test(first)) return algoReply(BAD, "坏掉的逻辑回归");
    if (/这是第 \d+ 轮/.test(first)) return algoReply(GOOD.replace("it < 150", "it < 220"), "多迭代的逻辑回归");
    return algoReply(GOOD, "逻辑回归（AI）");
  }
  return "回答：训练集和验证集的差距是 $\\Delta = 0.01$，在误差之内。" + (/测试集：还没有揭晓/.test(all) ? "（测试集还没有揭晓。）" : "");
}
module.exports = { GOOD, BAD, algoReply, reply };
