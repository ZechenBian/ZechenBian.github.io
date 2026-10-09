// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 测试用：在页面里装一个假的 window.claude，按提示词的种类回放事先写好的回答
(function () {
  var calls = window.__calls = [], state = window.__mock = { delay: 15, broken: 0, toolResults: [] };
  var STRAT = '<<<META>>>\n{"name":"Kelly 固定比例","summary":"按 μ/σ² 的固定比例持仓。","tier":"proven","params":[{"key":"f","label":"仓位比例 f","def":2,"min":0,"max":4,"step":0.05,"desc":"f* = μ/σ² = 0.08/0.04 = 2"}],"claim":{"param":"f","value":2,"objective":"growth","note":"Merton 比例 (μ−r)/σ²"}}\n<<<CODE>>>\n// 固定比例\nfunction decide(s, p) {\n  return p.f;\n}\n<<<EXPLAIN>>>\n## 模型假设\n\n价格是几何布朗运动 $dS/S=\\mu\\,dt+\\sigma\\,dW$。\n\n## 目标函数\n\n$\\mathbb{E}\\log W_T$。\n\n## 最优性结论\n\n**定理（Merton 1969）。** 最优仓位恒为\n$$f^*=\\frac{\\mu-r}{\\sigma^2}=2.$$\n\n## 何时失效\n\n参数估错时。\n\n## 可检验的预测\n\n对 $f$ 扫描，峰值在 2。\n<<<END>>>';
  var MODEL = "<<<META>>>\n{\"name\":\"岭回归预测\",\"summary\":\"用最近 L 步收益做岭回归，按预测/方差下注。\",\"tier\":\"family\",\"params\":[{\"key\":\"lags\",\"label\":\"滞后数 L\",\"def\":2,\"min\":1,\"max\":8,\"step\":1,\"desc\":\"特征个数\",\"fit\":true},{\"key\":\"lambda\",\"label\":\"岭惩罚 λ\",\"def\":0.1,\"min\":0,\"max\":5,\"step\":0.01,\"desc\":\"收缩强度\",\"fit\":true},{\"key\":\"shrink\",\"label\":\"收缩系数\",\"def\":0.5,\"min\":0,\"max\":1.5,\"step\":0.01,\"desc\":\"半 Kelly\",\"fit\":false},{\"key\":\"cap\",\"label\":\"仓位上限\",\"def\":2,\"min\":0.25,\"max\":10,\"step\":0.25,\"desc\":\"绝对值\",\"fit\":false}],\"claim\":null}\n<<<CODE>>>\nfunction features(s, p) { var x = []; for (var k = 0; k < p.lags; k++) x.push(s.ret(k)); return x; }\nfunction fit(D, p, ml, rng) {\n  var f = function (s) { return features(s, p); }, tr, va;\n  if (D.N >= 5) { var cut = Math.floor(D.N * 0.8); tr = ml.dataset(D, f, { warmup: 10, maxRows: 8000, from: 0, to: cut }); va = ml.dataset(D, f, { warmup: 10, maxRows: 2000, from: cut, to: D.N }); }\n  else { var tc = Math.floor(D.T * 0.8); tr = ml.dataset(D, f, { warmup: 10, t1: tc - 1 }); va = ml.dataset(D, f, { t0: tc }); }\n  var m = ml.ridge(tr, p.lambda), names = []; for (var k = 0; k < p.lags; k++) names.push(\"收益，滞后 \" + k);\n  return { m: m, v: ml.metrics(ml.predictAll(m, va), va.y).mse, diag: ml.diagnose(m, tr, va, names), note: \"岭回归系数已拟合\" };\n}\nfunction decide(s, p, st, model) {\n  var x = features(s, p); for (var j = 0; j < x.length; j++) if (!(x[j] === x[j])) return 0;\n  return Math.max(-p.cap, Math.min(p.cap, p.shrink * model.m.predict(x) / model.v));\n}\n<<<EXPLAIN>>>\n## 模型假设\n\n$\\mathbb{E}[r_{t+1}\\mid x_t]=\\beta^\\top x_t$。\n\n## 目标函数\n\n$\\min_\\beta \\sum (r_{t+1}-\\beta^\\top x_t)^2+\\lambda\\lVert\\beta\\rVert^2$。\n\n## 最优性结论\n\n族内最优。\n\n## 何时失效\n\n训练 $R^2$ 远高于验证 $R^2$ 时。\n\n## 可检验的预测\n\nGBM 世界里验证 $R^2\\le 0$。\n<<<END>>>";
  var BROKEN = STRAT.replace("return p.f;", "return p.f +* 1;").replace("Kelly 固定比例", "坏掉的规则");
  var RUNTIME = STRAT.replace("return p.f;", "return undefinedThing.x * p.f;").replace("Kelly 固定比例", "运行时出错的规则");
  var WORLD = '<<<META>>>\n{"name":"周五跳空","summary":"平时是几何布朗运动，每 5 步有一次可能的跳空。","K":252,"T":200,"N":400,"params":[{"key":"sigma","label":"波动（%/年）","def":15,"min":1,"max":80,"step":0.5,"desc":"扩散部分"},{"key":"pj","label":"跳空概率","def":0.1,"min":0,"max":1,"step":0.01,"desc":"每个周五"}]}\n<<<CODE>>>\nfunction simulate(T, rng, p) {\n  var out = new Float64Array(T + 1), s = 100, sd = p.sigma / 100 / Math.sqrt(252);\n  out[0] = s;\n  for (var t = 1; t <= T; t++) {\n    var r = sd * rng.normal();\n    if (t % 5 === 0 && rng.u() < p.pj) r -= 0.05;\n    s *= Math.exp(r); out[t] = s;\n  }\n  return out;\n}\n<<<EXPLAIN>>>\n## 过程的定义\n\n$\\log S$ 的增量是 $\\sigma\\sqrt{\\Delta}\\,Z$，每 5 步以概率 $p_j$ 再减 5%。\n\n## 已知的性质\n\n条件期望只依赖 $t \\bmod 5$。\n\n## 什么规则在这里应该有效\n\n周四收盘前减仓。\n\n## 可检验的预测\n\n自相关图上看不出来。\n<<<END>>>';
  var BADWORLD = WORLD.replace("return out;", "return [1, 2, 3];").replace("周五跳空", "坏世界");
  function pick(input, opts) {
    var text = typeof input === "string" ? input : input.map(function (m) { return m.content; }).join("\n");
    if (text.indexOf('{"show"') >= 0 || text.indexOf('\\"show\\"') >= 0 || text.indexOf("图表清单") >= 0) return '{"show": ["dd", "scatter"], "say": "先看最大回撤分布的右尾。"}';
    if (text.indexOf("采样函数的接口") >= 0) { if (state.badWorld > 0) { state.badWorld--; return BADWORLD; } return WORLD; }
    if (text.indexOf("规则的接口") >= 0) { if (state.model > 0) { state.model--; return MODEL; } if (state.broken > 0) { state.broken--; return BROKEN; } if (state.runtime > 0) { state.runtime--; return RUNTIME; } return STRAT; }
    return "因为把仓位乘以 $\\lambda$ 时，超额收益的均值和标准差同时乘以 $\\lambda$：\n\n$$\\mathrm{SR}(\\lambda f)=\\frac{\\lambda\\,m}{\\lambda\\,s}=\\mathrm{SR}(f).$$\n\n这次模拟里夏普是 **0.39 ± 0.02**。";
  }
  function sample(input, opts) {
    opts = opts || {}; calls.push({ input: input, opts: Object.keys(opts), tier: opts.modelTier, hasTools: !!opts.tools });
    return new Promise(function (resolve, reject) {
      var full = pick(input, opts), i = 0, done = false;
      function fail(e) { if (!done) { done = true; reject(e); } }
      if (opts.signal) opts.signal.addEventListener("abort", function () { fail({ code: "cancelled", message: "aborted", text: full.slice(0, i) }); });
      if (state.failWith) { var c = state.failWith; state.failWith = null; setTimeout(function () { fail({ code: c, message: "mock " + c }); }, 30); return; }
      var pre = Promise.resolve();
      if (opts.tools && opts.tools.length) pre = Promise.resolve().then(function () { return opts.tools[0].execute({ code: "function decide(s,p){ return p.f; }", params: { f: 1.5 } }, { signal: new AbortController().signal }); }).then(function (r) { state.toolResults.push(r); }, function (e) { state.toolResults.push({ error: String(e && e.message || e) }); });
      pre.then(function tick() {
        if (done) return;
        i = Math.min(full.length, i + 40);
        if (opts.onText) opts.onText({ text: full.slice(0, i), delta: full.slice(Math.max(0, i - 40), i) });
        if (i >= full.length) { done = true; resolve({ text: full, truncated: false, modelTierApplied: opts.modelTier || "default" }); }
        else setTimeout(tick, state.delay);
      });
    });
  }
  sample.limits = function () { return Promise.resolve({ maxPromptBytes: 262144, tools: { maxCount: 8 } }); };
  sample.json = function (input, opts) { return sample(input, opts).then(function (r) { return JSON.parse(r.text); }); };
  window.claude = { use: function (name) { return Promise.resolve(name === "sample" ? sample : null); } };
})();
