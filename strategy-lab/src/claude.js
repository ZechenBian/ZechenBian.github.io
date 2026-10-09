// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 右栏的助手面板。四种用法：写策略、造世界、调图表、问结果。每次调用都只发生在你点"发送"的时候。
 *   · 在 Claude 里打开页面：直接调用 Claude（用的是打开页面的人自己的额度）。
 *   · 独立的网页：使用者在"设置"里选一家服务商（DeepSeek、ChatGPT、Kimi、豆包……）并填自己的密钥，见 src/ai.js。 */
(function (A) {
  "use strict";
  var h = A.h, $ = A.$, clear = A.clear, S = A.state, QL = A.QL, F = A.F, P = A.P;
  var sample = null, limits = null, mode = "strategy", busy = false, ctl = null, turns = [], deep = false;
  var HOST = A.aiHost, WEB = !HOST && window.QLAI ? window.QLAI : null, AI = A.AI;
  /** 正在回答的是谁：在 Claude 里是 Claude；独立的网页里是所选服务商的简称（还没接入时就叫 AI） */
  function who() { var l = WEB && WEB.label(); return l ? l.short : AI; }
  var MODES = [["strategy", "写策略"], ["world", "造世界"], ["chart", "调图表"], ["ask", "问结果"]];
  var EG = {
    strategy: ["在这个世界里对数最优的策略是什么？写出来并证明", "用过去 20 步的收益做动量，但波动高的时候自动减仓", "跌 5% 加仓一份，涨回均价全部卖出，最多加 4 次", "用梯度提升预测下一步收益：特征取最近 5 步收益和 20 步波动，并报告训练集与验证集的 R²"],
    world: ["带杠杆效应的 GARCH：下跌之后波动更高", "二维伊辛模型在临界温度附近的磁化强度", "平时平静、每年有几次连续多日暴跌的市场"],
    chart: ["给我看最大回撤的分布", "这个世界的收益有没有厚尾", "这条规则应该押多大"],
    ask: ["为什么夏普比率不随杠杆变化？", "这条规则赚的钱是靠运气还是靠预测？", "终值分布为什么是右偏的？"]
  };
  var PH = { strategy: "描述你的交易想法，" + AI + " 会写成可运行的规则并解释…", world: "描述一种价格或信号的生成方式，可以是公式，也可以是一句话…", chart: "说你想看什么…", ask: "针对当前的结果提问…" };
  /** 玩法里"写策略"的例子：每套玩法自己带几条，再补两条通用的 */
  function examples(m) {
    var d = A.wdef();
    if (m === "strategy" && d.game) return (d.ideas || []).concat(["这套玩法里最优的规则是什么？写出来，并说明在什么意义下最优"]).slice(0, 4);
    if (m === "ask" && d.game) return ["我的规则离理论最优还差在哪里？", "为什么基准规则这么差？", "这个得分有多少是运气？"];
    if (m === "chart" && d.game) return ["给我看一局里到底发生了什么", "哪个参数取多少最好", "各局的得分差别大不大"];
    return EG[m];
  }
  function placeholder(m) { return m === "strategy" && A.isGame() ? "说说你打算怎么玩这一局，" + AI + " 会写成可运行的规则并解释…" : PH[m]; }
  var ERR = {
    not_granted: "你没有允许这个页面调用 Claude。重新打开页面后可以再选择。", sampling_disabled: "这个账号或组织没有开通页面内调用 Claude。", not_declared: "这个页面没有被授予调用 Claude 的能力。",
    capability_disabled: "当前打开方式下不能调用 Claude。", capability_removed: "当前的应用版本不支持这个调用，请更新应用。", tools_unavailable: "当前打开方式不支持深度模式，请关掉它再试。",
    rate_limited: "调用太频繁，或已达到用量上限。过一会儿再试。", session_expired: "登录已过期，请重新登录后再试。", refused: "Claude 没有接受这个请求，换个说法试试。",
    empty_completion: "没有得到回答，请把要求说得更具体一些再试。", invalid_json: "回答的格式不对，请再试一次。", prompt_too_large: "发送的内容太长了。", invalid_request: "请求格式有误（页面的问题）。"
  };
  function errText(e) { if (WEB && e && e.code) return WEB.explain(e).text; return (e && ERR[e.code]) || "连接出了问题" + (e && e.message ? "（" + e.message + "）" : "") + "。可以再试一次。"; }

  /* ---------- 给 Claude 的环境描述 ---------- */
  function gameText() {
    var w = S.world, d = A.wdef(), cfg = A.worldCfg(), p = A.wp(), L = [], sc = d.score(p), G = A.run && A.run.game, guide = window.QL_GUIDE && QL_GUIDE.games && QL_GUIDE.games[w.type];
    L.push("玩法：" + d.name.replace(/^[①-⑩]\s*/, "") + "（内部类型 " + w.type + "）");
    L.push("一句话：" + d.blurb);
    if (guide && guide.rules) L.push("规则：\n" + guide.rules(p, d.theory(p)).map(function (x, i) { return (i + 1) + ". " + x; }).join("\n"));
    var ps = A.wschema().filter(function (q) { return !q.show || q.show(p); }).map(function (q) { var v = p[q.key]; if (q.type === "select") { var o = q.options.filter(function (x) { return x[0] === v; })[0]; v = o ? o[1] : v; } return q.label + " = " + v + (q.unit ? " " + q.unit : ""); });
    if (ps.length) L.push("参数：" + ps.join("；"));
    L.push("规模：" + cfg.N + " 局，每局 " + cfg.T + " " + (d.stepUnit || d.unit));
    L.push("计分：" + sc.name + (sc.unit ? "（" + sc.unit + "）" : "") + "，" + (sc.lower ? "越低越好" : "越高越好") + "；整批对局取平均。");
    if (G) {
      var rows = G.refs.filter(function (x) { return !x.err; }).map(function (x) { return (x.bench ? "基准 " : x.kind === "bound" ? "上界 " : "参照 ") + x.name + "：" + A.gfmt(G, x.score); });
      G.marks.forEach(function (m) { rows.push((m.kind === "optimum" ? "理论最优 " : m.kind === "human" ? "真人实验 " : m.kind === "bound" ? "上界 " : "理论 ") + m.name + "：" + A.gfmt(G, m.value)); });
      if (rows.length) L.push("同一批对局上的对照：\n" + rows.join("\n"));
    }
    return L.join("\n");
  }
  function worldText() {
    if (A.isGame()) return gameText();
    var w = S.world, d = A.wdef(), ws = A.worldStats, cfg = A.worldCfg(), p = A.wp(), L = [];
    L.push("世界：" + (w.type === "custom" && S.custom ? "自定义「" + S.custom.name + "」" : d.name) + "（内部类型 " + w.type + "）");
    L.push("说明：" + (w.type === "custom" && S.custom ? S.custom.summary || "" : d.blurb));
    var ps = A.wschema().filter(function (q) { return !q.show || q.show(p); }).map(function (q) { var v = p[q.key]; if (q.type === "select") { var o = q.options.filter(function (x) { return x[0] === v; })[0]; v = o ? o[1] : v; } return q.label + " = " + v + (q.unit ? " " + q.unit : ""); });
    if (ps.length) L.push("参数：" + ps.join("；"));
    if (d.needsData) { var ds = A.dataset(); if (ds) L.push("数据：" + ds.name + "，" + QLIO.describe(ds)); }
    if (ws) {
      L.push("规模：" + ws.N + " 条路径 × " + ws.T + " 步，每" + A.unit() + " " + ws.K + " 步（Δ = 1/" + ws.K + "）");
      L.push("训练路径上的实测统计：每步收益均值 " + ws.mean.toExponential(3) + "（年化 " + P(ws.annMean, 2) + "），每步标准差 " + ws.sd.toExponential(3) + "（年化 " + P(ws.annVol, 2) + "），偏度 " + F(ws.skew, 2) + "，峰度 " + F(ws.kurt, 2) + "，收益一阶自相关 " + F(ws.acf[0], 3) + "，|收益| 一阶自相关 " + F(ws.acfAbs[0], 3) + "，单步最小 / 最大收益 " + P(ws.min, 2) + " / " + P(ws.max, 2));
    }
    var th = d.theory ? d.theory(p, { K: cfg.K, rf: S.set.rf }) : null;
    if (th && th.note) L.push("关于这个世界已知的理论：" + th.note + (isFinite(th.fStar) ? "（按当前参数 f* = " + F(th.fStar, 3) + "）" : ""));
    L.push("交易设定：成本 " + S.set.costBps + " bp（单边，按换手计）；无风险利率 " + S.set.rf + "%/" + A.unit() + "；仓位范围 [" + S.set.fmin + ", " + S.set.fmax + "]；风险上限 P(最大回撤 ≥ " + S.set.ddLimit + "%) ≤ " + S.set.ddProb + "%");
    return L.join("\n");
  }
  function stratText(withCode) {
    var st = A.strat(), p = A.sp(), L = ["名称：" + st.name];
    if ((st.params || []).length) L.push("参数：" + A.sschema(st).map(function (q) { return q.key + "（" + q.label + "）= " + p[q.key]; }).join("；"));
    if (withCode) L.push("代码：\n" + st.code);
    return L.join("\n");
  }
  function resultText() {
    var r = A.run; if (!r) return "（还没有回测结果）";
    var s = r.sum, b = r.benchSum, u = "每" + A.unit(), L = [];
    if (r.game) {
      var G = r.game;
      L.push((G.lower ? "成本（越低越好）" : "得分") + " = " + A.gfmt(G, G.score) + (G.se > 0 ? " ± " + A.gdiff(G, G.se).slice(1) : "") + "（" + G.name + "；" + G.N + " 局的平均）");
      G.refs.forEach(function (x) { if (!x.err) L.push((x.bench ? "基准 " : x.kind === "bound" ? "上界 " : "参照 ") + x.name + "：" + A.gfmt(G, x.score) + "；当前规则减去它的配对差 " + A.gdiff(G, x.d) + (x.dse > 0 ? " ± " + A.gdiff(G, x.dse).slice(1) : "") + (G.lower ? "（正数表示当前规则成本更低）" : "")); });
      G.marks.forEach(function (m) { L.push((m.kind === "optimum" ? "理论最优 " : m.kind === "human" ? "真人实验 " : "理论 ") + m.name + "：" + A.gfmt(G, m.value)); });
      G.aux.forEach(function (a) { if (a.value === a.value) L.push(a.name + "：" + (a.kind === "prob" ? P(a.value, a.digits) : F(a.value, a.digits))); });
      if (A.oos && A.oos.game && !A.oos.stale) L.push("新的一批对局上：" + A.gfmt(A.oos.game, A.oos.game.score) + " ± " + A.gdiff(A.oos.game, A.oos.game.se).slice(1));
      if (!A.wdef().crit) return L.join("\n");
    }
    L.push("长期增长率 g = " + (s.growth === -Infinity ? "−∞（有路径破产）" : P(s.growth, 2) + " ± " + P(s.growthSE, 2)) + " " + u + "；基准 " + P(b.growth, 2) + "；配对差 " + (s.dGrowth === s.dGrowth ? P(s.dGrowth, 2) + " ± " + P(s.dGrowthSE, 2) : "无法计算"));
    L.push("夏普 = " + F(s.sharpe, 2) + " ± " + F(s.sharpeSE, 2) + "；基准 " + F(b.sharpe, 2));
    L.push("期望收益 E[W_T]−1 = " + P(s.meanW - 1, 2) + " ± " + P(s.meanWSE, 2) + "；基准 " + P(b.meanW - 1, 2) + "；P(最大回撤 ≥ " + P(s.ddLimit, 0) + ") = " + P(s.pDD, 1) + "，" + (s.feasible ? "满足" : "超出") + "上限");
    L.push("终值中位数 " + F(s.medW, 3) + "，5%–95% 分位 " + F(s.q05, 2) + " – " + F(s.q95, 2) + "，亏损概率 " + P(s.pLoss, 1) + "，破产概率 " + P(s.pRuin, 2) + "，最大回撤中位数 " + P(s.ddMed, 1) + "，" + u + "换手 " + F(s.turnover, 2) + " 倍，平均仓位 " + F(s.exposure, 2));
    if (A.oos && A.oos.sum && !A.oos.stale) { var q = A.oos.sum; L.push("样本外：g = " + P(q.growth, 2) + " ± " + P(q.growthSE, 2) + "，夏普 " + F(q.sharpe, 2) + "，相对基准 Δg = " + P(q.dGrowth, 2) + " ± " + P(q.dGrowthSE, 2)); }
    if (A.lev.best && A.lev.res) L.push("杠杆曲线（增长率口径）在这批路径上的峰值位置约为 " + F(A.lev.best.x, 2));
    return L.join("\n");
  }
  var BOOK = "\n\n引擎的记账方式：第 t 步收盘后调用 decide 得到 f，截断到仓位范围，按 |f − 当前仓位| × 成本 扣费，然后净值乘以 1 + f·r + (1 − f)·r_f，其中 r 是资产第 t→t+1 步的简单收益。某一步 1 + f·r ≤ 0 即视为破产，净值归零。";
  /** 给 Claude 的接口说明：价格世界附上记账方式；玩法里结算规则已经写在它自己的接口说明里 */
  function apiText() { return A.apiDoc() + (A.isGame() ? "\n\n裁判按上面的规定逐回合结算；规则读不到任何隐藏的量。" : BOOK); }
  var ML_API = function () { return A.ML_DOC ? "\n\n# 模型库（只在 fit 里可用，通过第三个参数 ml 访问）\n" + A.ML_DOC : ""; };

  function fmtRules(kind) {
    var objs = A.isCrit() ? '"growth" 或 "sharpe" 或 "mean"' : '"score"';
    var metaStrat = '{"name": "不超过 12 个字的名字", "summary": "一句话说明这条规则做什么", "tier": "proven" 或 "family" 或 "bound" 或 "heuristic",\n "params": [{"key": "英文标识符", "label": "中文名（带单位）", "def": 默认值, "min": 下限, "max": 上限, "step": 步长, "desc": "含义，以及默认值是怎么定出来的", "fit": true 或 false（只有定义了 fit 的规则才需要：改动这个参数要不要重新训练）}],\n "claim": null 或 {"param": "某个参数的 key", "value": 你预测的最优取值, "objective": ' + objs + ', "note": "一句话依据"}}';
    var metaWorld = '{"name": "不超过 12 个字的名字", "summary": "一句话说明这个过程", "K": 每年步数（整数，可省略）, "T": 建议的步数（可省略）, "N": 建议的路径数（可省略）,\n "params": [{"key": "英文标识符", "label": "中文名（带单位）", "def": 默认值, "min": 下限, "max": 上限, "step": 步长, "desc": "含义"}]}';
    var secs = kind === "world" ? ["过程的定义", "已知的性质", "什么规则在这里应该有效", "可检验的预测"] : ["模型假设", "目标函数", "最优性结论", "何时失效", "可检验的预测"];
    return "# 输出格式（必须严格遵守：四个标记各独占一行，标记之外不要写任何内容）\n<<<META>>>\n" + (kind === "world" ? metaWorld : metaStrat) + "\n<<<CODE>>>\n（JavaScript 代码，不要用代码围栏）\n<<<EXPLAIN>>>\n（Markdown，公式用 $...$ 和 $$...$$ 的 LaTeX。依次写以下几节，每节用二级标题）\n" + secs.map(function (s) { return "## " + s; }).join("\n") + "\n<<<END>>>";
  }
  function promptStrategy(idea, fix) {
    if (A.isGame() && !A.isCrit()) return promptGame(idea, fix);
    return [
      "你是「策略实验室」里的量化研究助手。用户用一句话描述交易想法，你把它写成可以直接运行的规则，给出具体的参数，并解释为什么这样构造、在什么意义下最优。",
      "# 当前实验环境\n" + worldText(),
      "# 规则的接口（纯 JavaScript，在后台线程里对每条路径逐步调用）\n" + apiText() + ML_API(),
      "# 用户当前使用的规则（想法可能是在它的基础上修改）\n" + stratText(true),
      fmtRules("strategy"),
      "# 要求\n1. 代码里只定义 decide（必须）、init、fit 这几个函数，不要有别的顶层语句；只用标准 JavaScript，不访问任何外部对象，不用随机数（fit 里可以用传入的 rng）。\n2. 所有可调的量都放进参数表，代码里不写死数字。默认值要针对当前世界的具体数字来定，并在 desc 里写明算法（例如 f* = μ/σ² = 0.08/0.04 = 2）。参数最多 8 个，min < def < max 且范围要宽到能看出峰值。\n3. 数据不够（预热期）时返回 0；状态放在 init 返回的对象里；decide 每次调用的计算量不要随 T 增长。\n4. tier 的含义：proven = 在你写明的模型假设和目标函数下可以证明最优；family = 只在这个规则族内靠选参数达到最优；heuristic = 启发式，没有最优性保证。拿不准就选更保守的一档，不要夸大。\n5. 「最优性结论」一节要有用到的定义、精确的定理陈述、证明思路或可查的出处；若结论只在理想条件（连续时间、无成本、参数已知）下成立，要明说，并说明在当前设定（离散步长、有成本、仓位有上下限）下会偏离多少。如果这个想法在当前世界里根本没有优势，直接说。\n6. 「可检验的预测」要具体到能在这个实验室里验证：对哪个参数做扫描、峰值应在哪里，或者换到哪个世界应该失效。\n7. 如果你对某个参数的最优值有明确的理论预测，填进 claim（objective 取 growth / sharpe / mean 之一），实验室会用新的随机路径去检验；没有就填 null。\n8. 解释用中文写，术语第一次出现时附英文；简洁，不要客套话。\n9. 需要从数据里学东西（回归、分类、滤波器的参数、策略表）时写 fit(D, p, ml, rng)：只用训练路径 D，训练只做这一次，不要在 decide 里重复训练。训练集和验证集要切开：D.N ≥ 5 时按路径切（from / to），否则（真实数据只有一条路径）按时间切（t0 / t1）。把 ml.diagnose(model, 训练集, 验证集, 特征名数组) 的结果放进返回对象的 diag 字段，实验室会据此画出诊断图。特征只能用当前步及以前的数据，decide 里算特征的函数必须和训练时是同一个。参数表里每个参数都标上 \"fit\": true 或 false（只在 decide 里用到的参数标 false，这样拖动它时不会重新训练）。「何时失效」一节要写训练集与验证集 R² 的差距说明什么。",
      fix ? "# 需要修复\n上面「当前使用的规则」的代码运行时出错：\n" + fix + "\n请给出修正后的完整输出（格式同上），并在「何时失效」一节的开头用一句话说明改了什么。" : "# 用户的想法\n" + idea
    ].join("\n\n");
  }
  /** 玩法里写规则：动作的含义、能看到什么、怎么计分，都以这套玩法自己的接口说明为准 */
  function promptGame(idea, fix) {
    return [
      "你是「策略实验室」里的研究助手。实验室里有若干套回合制的玩法（来自现实世界的规则、量化面试题和科学实验）。用户描述他想怎么玩，你把它写成可以直接运行的规则，给出具体的参数，并解释为什么这样构造、在什么意义下最优。",
      "# 当前的玩法\n" + worldText(),
      "# 规则的接口（纯 JavaScript，在后台线程里对每一局逐回合调用）\n" + apiText(),
      "# 用户当前使用的规则（想法可能是在它的基础上修改）\n" + stratText(true),
      fmtRules("strategy"),
      "# 要求\n1. 代码里只定义 decide（必须）、init、fit 这几个函数（可以有被它们调用的辅助函数），不要有别的顶层语句；只用标准 JavaScript，不访问任何外部对象。需要随机数时只用 s.rnd()、s.rnorm()、s.rbeta(a, b)（fit 里用传入的 rng），不要用 Math.random。\n2. 返回值的含义、能读到哪些量，严格以上面的接口说明为准，不要假设接口里没有写的字段。所有可调的量都放进参数表，代码里不写死数字。默认值要针对当前玩法的具体参数来定，并在 desc 里写明算法。参数最多 8 个，min < def < max 且范围要宽到能看出峰值。\n3. 每一局各自的状态放在 init 返回的对象里；decide 每次调用的计算量不要随回合数增长得太快（需要历史时用 s.rets(n)、s.mean(n) 这类函数，或者自己在状态里累计）。\n4. tier 的含义：proven = 在你写明的假设和目标下可以证明最优；family = 只在这个规则族内靠选参数达到最优；bound = 有可以证明的性能保证（遗憾上界、收敛到最优等）但不是最优；heuristic = 启发式，没有保证。拿不准就选更保守的一档，不要夸大。\n5. 「最优性结论」一节要有用到的定义、精确的定理陈述、证明思路或可查的出处。如果这套玩法已有公认的最优解，直接给出并说明用户的想法与它差在哪里；如果用户的想法在这套规则下没有优势，直接说。\n6. 「可检验的预测」要具体到能在这个实验室里验证：对哪个参数做扫描、峰值应在哪里，或者改玩法的哪个参数后应该失效。\n7. 如果你对某个参数的最优值有明确的理论预测，填进 claim（objective 填 \"score\"），实验室会用新的一批对局去检验；没有就填 null。\n8. 解释用中文写，术语第一次出现时附英文；简洁，不要客套话。\n9. 需要事先算好一张表（动态规划、阈值表）或从数据里估计分布时写 fit(D, p, ml, rng)：D 是另外生成的一批对局，D.g 是这套玩法的常数，D.next(n, t) 是第 n 局第 t 回合结束时揭晓的那个数（即 decide 里 s.ret 读到的序列）。fit 只执行一次，返回的对象作为 model 传给 init 和 decide；返回对象的 note 字段（字符串）会显示在规则下方。参数表里每个参数都标上 \"fit\": true 或 false。",
      fix ? "# 需要修复\n上面「当前使用的规则」的代码运行时出错：\n" + fix + "\n请给出修正后的完整输出（格式同上），并在「何时失效」一节的开头用一句话说明改了什么。" : "# 用户的想法\n" + idea
    ].join("\n\n");
  }
  function promptWorld(idea, fix) {
    return [
      "你是「策略实验室」里的助手。用户描述一种价格或信号的生成方式（可能来自金融，也可能来自物理或别的领域），你把它写成采样函数，供实验室生成成千上万条路径。",
      "# 采样函数的接口\nfunction simulate(T, rng, p)   必须。每条路径调用一次，返回长度为 T+1 的数组（普通数组或 Float64Array），每个元素是有限的正数价格，第 0 个是起始价（一般取 100）。\nrng 是这条路径专用的随机数源，不同路径相互独立且可复现；不要用 Math.random：\n  rng.u() (0,1) 均匀；rng.uniform(a, b)；rng.normal() 标准正态，rng.normal(m, s)；rng.exp(rate)；rng.t(nu)；rng.gamma(k)；rng.poisson(lam)；rng.bernoulli(q) 返回 0/1；rng.laplace()（方差 2）；rng.cauchy()；rng.int(n) 返回 0..n−1。\np 是参数对象。时间单位：每" + A.unit() + " K 步（当前 K = " + A.worldCfg().K + "），年化的量要自己换算成每步。\n如果生成的不是价格而是可正可负的物理量 x_t，用 S_t = 100·exp(v·(x_t − 均值)/标准差) 映射成价格，把 v 做成参数（默认 0.02），均值和标准差用理论值或在预热段里估计，不要用到未来的数据。\n需要预热（丢掉初始瞬态）时在函数里自己多迭代若干步。计算量要适中：实验室会调用上千次。",
      S.world.type === "custom" && S.custom ? "# 当前的自定义世界（想法可能是在它的基础上修改）\n名称：" + S.custom.name + "\n代码：\n" + S.custom.code : "",
      fmtRules("world"),
      "# 要求\n1. 代码里只定义 simulate（可以有内部辅助函数），不要有别的顶层语句。\n2. 所有可调的量放进参数表（最多 8 个），给出合理的默认值和范围。\n3. 「已知的性质」一节写出这个过程的矩、相关结构、条件期望 E[下一步 | 过去]（若能写出），并说明哪些是定理、哪些是经验事实。\n4. 「什么规则在这里应该有效」要说清楚可预测性来自哪里；如果它是鞅（没有任何规则能赚钱），直接说。\n5. 解释用中文写，术语第一次出现时附英文。",
      fix ? "# 需要修复\n当前代码运行时出错：\n" + fix + "\n请给出修正后的完整输出。" : "# 用户的描述\n" + idea
    ].filter(Boolean).join("\n\n");
  }
  function promptChart(q) {
    var cat = Object.keys(A.CH).filter(function (id) { return A.chartOk(id); }).map(function (id) { return '"' + id + '"：' + A.chartName(id) + "。" + (A.guideChartAbout ? A.guideChartAbout(id) : A.CH[id].about); }).join("\n");
    return "下面是一个量化实验室里可用的图表清单。用户说了一句想看什么，请选出最能回答它的 1 到 3 张图。\n\n" + cat + "\n\n当前世界：" + A.worldLabel() + "；当前规则：" + A.strat().name + "。\n\n只回复一个 JSON 对象：{\"show\": [图表 id, ...], \"say\": \"一句话告诉用户该看图上的什么地方\"}。如果清单里没有合适的图，show 给空数组，并在 say 里说明最接近的做法。\n\n用户说：" + q;
  }
  function askRules() {
    return "你是「策略实验室」里的量化研究助手，用中文回答用户关于当前实验结果的问题。回答要具体到下面给出的数字，区分\"定理\"、\"这次模拟的结果\"和\"猜测\"；结果在标准误之内的差别不要当成结论。需要公式时用 $...$（LaTeX）。篇幅控制在几段之内，除非用户要求展开。\n\n# 当前实验环境\n" + worldText() + "\n\n# 规则能用到的接口\n" + apiText() + "\n\n# 当前规则\n" + stratText(true) + "\n\n# 当前结果（" + (A.isGame() ? "正在调参的这批对局" : "训练路径") + "）\n" + resultText();
  }

  /* ---------- 解析 Claude 的回答 ---------- */
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
  /** 哪些参数改动后要重新训练。Claude 没标的话返回 null：任何参数变了都重新训练（慢，但不会用到过期的模型） */
  function fitKeysOf(code, params) {
    if (!/\bfunction\s+fit\s*\(/.test(code)) return null;
    if (!params.some(function (q) { return typeof q.fit === "boolean"; })) return null;
    return params.filter(function (q) { return q.fit !== false; }).map(function (q) { return q.key; });
  }
  function cleanParams(list) {
    var seen = {}, out = [];
    (Array.isArray(list) ? list : []).slice(0, 12).forEach(function (q) {
      if (!q || typeof q.key !== "string" || !/^[A-Za-z_$][\w$]*$/.test(q.key) || seen[q.key]) return; seen[q.key] = 1;
      var fitFlag = typeof q.fit === "boolean" ? q.fit : undefined;
      if (typeof q.def === "boolean") { out.push({ key: q.key, label: String(q.label || q.key), def: q.def, type: "bool", desc: q.desc ? String(q.desc) : "", fit: fitFlag }); return; }
      var def = +q.def, min = +q.min, max = +q.max, step = +q.step;
      if (!(def === def)) return;
      if (!(min === min)) min = Math.min(0, def * 2); if (!(max === max)) max = Math.max(def * 2, def + 1);
      if (min > max) { var t = min; min = max; max = t; } if (min === max) max = min + 1;
      if (def < min) min = def; if (def > max) max = def;
      if (!(step > 0)) step = (max - min) / 100;
      out.push({ key: q.key, label: String(q.label || q.key).slice(0, 40), def: def, min: min, max: max, step: step, type: "num", desc: q.desc ? String(q.desc).slice(0, 300) : "", fit: fitFlag });
    });
    return out;
  }

  /* ---------- 界面 ---------- */
  function card() { var el = h("div", { class: "msg-a" }); $("aiLog").appendChild(el); scrollLog(); return el; }
  function scrollLog() { var l = $("aiLog"); if (l) l.scrollTop = l.scrollHeight; }
  function bubble(text) { var e = $("aiEmpty"); if (e) e.remove(); $("aiLog").appendChild(h("div", { class: "msg-u", text: text })); scrollLog(); }
  function setBusy(b) { busy = b; var s = $("aiSend"), st = $("aiStop"); if (s) s.hidden = b; if (st) st.hidden = !b; }
  function statusRow(text) { return h("div", { class: "a-status" }, h("span", { class: "spin" }), h("span", { text: text })); }
  function paramTable(params) {
    if (!params.length) return h("div", { class: "note", text: "没有可调参数。" });
    return h("table", { class: "ptab" }, h("thead", null, h("tr", null, ["参数", "默认", "范围", "含义"].map(function (t) { return h("th", { text: t }); }))),
      h("tbody", null, params.map(function (q) { return h("tr", null, h("td", { text: q.label }), h("td", { class: "num mono", text: q.type === "bool" ? (q.def ? "是" : "否") : F(q.def) }), h("td", { class: "num mono", text: q.type === "bool" ? "" : F(q.min) + " – " + F(q.max) }), h("td", { text: q.desc || "" })); })));
  }
  function codeBlock(code, open) { var pre = h("pre", { class: "code" }); pre.innerHTML = A.highlight(code); return h("details", { class: "more", open: !!open }, h("summary", { text: "代码（" + code.split("\n").length + " 行）" }), h("div", { class: "more-body" }, pre)); }
  function runLine(sum, m) {
    if (m && m.game && !A.isCrit()) { var G = m.game, b = G.refs.filter(function (x) { return x.bench && !x.err; })[0]; return "试运行：" + (G.lower ? "成本 " : "得分 ") + A.gfmt(G, G.score) + (G.se > 0 ? " ± " + A.gdiff(G, G.se).slice(1) : "") + (b ? "（基准" + b.name + " " + A.gfmt(G, b.score) + "）" : "") + (sum.badFrac > 0.25 ? "；有 " + P(sum.badFrac, 0) + " 的回合返回了无效值" : ""); }
    return runLine0(sum);
  }
  function runLine0(sum) { return "试运行（训练路径）：g = " + (sum.growth === -Infinity ? "−∞" : A.pctS(sum.growth) + " ± " + P(sum.growthSE)) + "，夏普 " + F(sum.sharpe, 2) + "，E[W]−1 = " + A.pctS(sum.meanW - 1) + (sum.badFrac > 0.25 ? "；有 " + P(sum.badFrac, 0) + " 的步数返回了无效值" : ""); }

  /** status：正在等的那一行。独立的网页里，模型先"深度思考"时正文迟迟不来，就在这一行上报告已经想了多少字 */
  function call(input, opts, onText, status) {
    ctl = new AbortController();
    var o = Object.assign({ signal: ctl.signal, cache: false }, opts || {});
    if (onText) o.onText = function (u) { try { onText(u.text); } catch (e) { console.error(e); } };
    if (WEB && status) o.onThink = function (n) { status.lastChild.textContent = who() + " 正在深度思考…（已经想了 " + n + " 字）"; };
    if (o.tools) delete o.cache;
    return sample(input, o);
  }
  /** 这一类请求用哪一档模型。在 Claude 里由面板上的档位决定；独立的网页里没有档位：写规则、造世界允许深度思考，问结果不用，挑图表用便宜的那个模型 */
  function tierOf(kind) {
    if (WEB) return kind === "chart" ? "quick" : kind === "ask" ? "default" : "complex";
    return kind === "chart" ? "quick" : kind === "ask" ? (S.tier === "complex" ? "default" : S.tier) : S.tier;
  }

  function doStrategy(idea, fix) {
    var el = card(), status = statusRow(deep ? who() + " 正在思考，并会自己试跑几次…" : who() + " 正在思考…（复杂的想法可能要一两分钟）"), bodyEl = h("div"); el.appendChild(status); el.appendChild(bodyEl);
    var lastStage = -1, exEl = null, opts = { modelTier: tierOf("strategy") };
    if (deep && limits && limits.tools) opts.tools = [{
      name: "backtest", description: A.isGame() && !A.isCrit() ? "在当前玩法的这批对局上编译并运行一段规则代码，返回得分和各个对照的得分；代码有错时返回错误信息。用它确认代码能跑、参数量级合理。最多调用 3 次，最后必须按要求的格式给出完整输出。" : "在当前世界的训练路径上编译并运行一段规则代码，返回三种口径的结果；代码有错时返回错误信息。用它确认代码能跑、参数量级合理。最多调用 3 次，最后必须按要求的格式给出完整输出。",
      inputSchema: { type: "object", properties: { code: { type: "string", description: "完整的规则代码（定义 decide，可选 init、fit）" }, params: { type: "object", description: "参数取值，键是参数的 key" } }, required: ["code", "params"] },
      execute: function (input) {
        status.lastChild.textContent = who() + " 正在试跑代码…";
        var code = String(input.code || ""), params = input.params && typeof input.params === "object" ? input.params : {};
        return A.tryStrategy(code, params).then(function (m) { A.dropSide(code); var s = m.sum, b = m.benchSum;
          if (m.game && !A.isCrit()) { var G = m.game, o = { ok: true, score_name: G.name, higher_is_better: !G.lower, score: +(G.lower ? -G.score : G.score).toFixed(6), score_se: +(G.se || 0).toFixed(6), invalid_output_fraction: +s.badFrac.toFixed(3), references: {} }; G.refs.forEach(function (x) { if (!x.err) o.references[x.name] = +(G.lower ? -x.score : x.score).toFixed(6); }); G.marks.forEach(function (x) { o.references[x.name] = +(G.lower ? -x.value : x.value).toFixed(6); }); return o; }
          return { ok: true, growth: +s.growth.toFixed(5), growth_se: +(s.growthSE || 0).toFixed(5), sharpe: +s.sharpe.toFixed(3), sharpe_se: +s.sharpeSE.toFixed(3), mean_return: +(s.meanW - 1).toFixed(5), median_wealth: +s.medW.toFixed(4), p_drawdown_over_limit: +s.pDD.toFixed(4), p_ruin: s.pRuin, turnover: +s.turnover.toFixed(2), avg_abs_position: +s.exposure.toFixed(3), invalid_output_fraction: +s.badFrac.toFixed(3), growth_minus_benchmark: s.dGrowth === s.dGrowth ? +s.dGrowth.toFixed(5) : null, growth_diff_se: s.dGrowthSE === s.dGrowthSE ? +s.dGrowthSE.toFixed(5) : null, benchmark_growth: +b.growth.toFixed(5), benchmark_sharpe: +b.sharpe.toFixed(3) }; },
          function (e) { A.dropSide(code); throw new Error(e.message || String(e)); });
      }
    }];
    function paint(text, final) {
      var r = parseReply(text);
      if (r.stage !== lastStage) { lastStage = r.stage; status.lastChild.textContent = [who() + " 正在思考…", "正在定参数…", "正在写代码…", "正在写解释…", "正在收尾…"][r.stage]; }
      if (r.stage >= 3 && r.explain) { if (!exEl) { clear(bodyEl); exEl = h("div"); bodyEl.appendChild(exEl); } if (final) QLMD.mount(exEl, r.explain); else QLMD.mountPartial(exEl, r.explain); scrollLogSoft(); }
      return r;
    }
    return call(promptStrategy(idea, fix), opts, function (t) { paint(t, false); }, status).then(function (res) {
      var r = parseReply(res.text);
      if (r.stage < 3 || !r.code || !r.meta) throw { code: "bad_format", text: res.text };
      var meta = r.meta, params = cleanParams(meta.params), tier = A.TIER[meta.tier] ? meta.tier : "heuristic";
      var st = { id: "my-" + Date.now().toString(36), name: String(meta.name || AI + " 的策略").slice(0, 24), group: "我的策略", summary: String(meta.summary || "").slice(0, 160), params: params, code: r.code, explain: r.explain, tier: tier, src: "claude", idea: idea || "", claim: null };
      if (A.isGame()) st.game = S.world.type;      // 玩法里写的规则只在那套玩法里用
      var fk = fitKeysOf(st.code, params); if (fk) st.fitKeys = fk;
      var okObj = A.isCrit() ? { growth: 1, sharpe: 1, mean: 1 } : { score: 1 };
      if (meta.claim && typeof meta.claim === "object" && params.some(function (q) { return q.key === meta.claim.param && q.type === "num"; }) && isFinite(+meta.claim.value) && okObj[meta.claim.objective]) st.claim = { param: meta.claim.param, value: +meta.claim.value, objective: meta.claim.objective, note: String(meta.claim.note || "").slice(0, 200) };
      clear(el);
      el.appendChild(h("div", { class: "a-h" }, h("b", { text: st.name }), A.tierBadge(tier), res.truncated ? h("span", { class: "tag", text: "回答被截断" }) : null, HOST && res.modelTierApplied && res.modelTierApplied !== S.tier ? h("span", { class: "tag", text: "实际使用的模型档位：" + tierName(res.modelTierApplied) }) : null));
      if (st.summary) el.appendChild(h("div", { class: "note", style: { "margin-bottom": "6px" }, text: st.summary }));
      el.appendChild(paramTable(params)); el.appendChild(codeBlock(st.code));
      var ex = h("div", { style: { "margin-top": "8px" } }); QLMD.mount(ex, st.explain || ""); el.appendChild(ex);
      var runEl = statusRow("正在编译并试运行…"); el.appendChild(runEl);
      var actions = h("div", { class: "a-actions" }); el.appendChild(actions);
      var defs = {}; params.forEach(function (q) { defs[q.key] = q.def; });
      return A.tryStrategy(st.code, defs, st.fitKeys).then(function (m) {
        A.dropSide(st.code); A.saveMy(st); S.sparams[st.id] = defs; S.stratId = st.id; A.renderStrat(); A.requestRun("commit");
        clear(runEl); runEl.className = "note"; runEl.textContent = runLine(m.sum, m) + "。已设为当前规则并保存到\"我的策略\"。";
        if (st.claim) actions.appendChild(h("button", { class: "btn small primary", type: "button", text: "验证它的最优性声明", title: st.claim.note, onclick: function () { verifyClaim(st, this, el); } }));
        actions.appendChild(h("button", { class: "btn small", type: "button", text: "复制代码", onclick: function () { A.copy(st.code); } }));
        if (st.claim) el.insertBefore(h("div", { class: "note", style: { "margin-top": "6px" }, text: "它的声明：" + pLabel(st, st.claim.param) + " 的最优值是 " + F(st.claim.value) + "（" + OBJN[st.claim.objective] + "口径）。" + st.claim.note }), runEl);
      }, function (e) {
        clear(runEl); runEl.className = "warn err"; runEl.textContent = "这段代码没有跑通：" + (e.message || e);
        actions.appendChild(h("button", { class: "btn small primary", type: "button", text: "让 " + AI + " 修复", onclick: function () { A.my.push(st); S.sparams[st.id] = defs; S.stratId = st.id; A.renderStrat(); A.askFix(e.message || String(e)); } }));
        actions.appendChild(h("button", { class: "btn small", type: "button", text: "复制代码", onclick: function () { A.copy(st.code); } }));
      });
    }).catch(function (e) { fail(el, e, bodyEl); });
  }
  var OBJN = { growth: "增长率", sharpe: "夏普", mean: "期望收益", score: "得分" };
  function pLabel(st, key) { var q = (st.params || []).filter(function (x) { return x.key === key; })[0]; return q ? q.label : key; }
  function tierName(t) { return { complex: "最强", "default": "均衡", quick: "最快" }[t] || t; }
  var lastScroll = 0; function scrollLogSoft() { var now = Date.now(); if (now - lastScroll > 400) { lastScroll = now; var l = $("aiLog"); if (l && l.scrollHeight - l.scrollTop - l.clientHeight < 240) l.scrollTop = l.scrollHeight; } }
  function fail(el, e, keepEl) {
    if (e && e.code === "cancelled") { var s = el.querySelector(".a-status"); if (s) s.remove(); el.appendChild(h("div", { class: "note", text: "已停止。" })); return; }
    var st = el.querySelector(".a-status"); if (st) st.remove();
    if (e && e.code === "bad_format") { el.appendChild(h("div", { class: "warn err", text: "回答没有按约定的格式给出，无法自动载入。原文如下，可以再发一次。" })); el.appendChild(h("pre", { class: "code", text: String(e.text || "").slice(0, 6000) })); return; }
    if (e && e.code === "refused" && keepEl) clear(keepEl);
    if (WEB && e && e.code) {     // 独立的网页：把服务商的原话也给出来；和设置有关的错，给一个直达设置的按钮
      var ex = WEB.explain(e);
      el.appendChild(h("div", { class: "warn err", text: ex.text }));
      if (ex.detail) el.appendChild(h("div", { class: "note ai-detail", text: who() + " 的原话：" + ex.detail }));
      if (/^(bad_auth|bad_model|bad_url|network|proxy_refused|unavailable|quota|invalid_request|timeout)$/.test(e.code)) el.appendChild(h("div", { class: "a-actions" }, h("button", { class: "btn small", type: "button", text: "打开设置", onclick: function () { A.openAiSettings(); } })));
      return;
    }
    el.appendChild(h("div", { class: "warn err", text: e && e.code ? errText(e) : "出错了：" + (e && e.message || e) }));
    if (e && (e.code === "not_granted" || e.code === "sampling_disabled" || e.code === "not_declared" || e.code === "capability_disabled")) disable(errText(e));
  }

  /** 用两批新的随机路径检验"某参数的最优值是 x"：第一批找峰值，第二批做配对比较 */
  function verifyClaim(st, btn, el) {
    if (S.stratId !== st.id) { S.stratId = st.id; A.renderStrat(); }
    var c = st.claim, q = st.params.filter(function (x) { return x.key === c.param; })[0], n = 15, vals = [], i, k = c.objective;
    for (i = 0; i < n; i++) { var v = q.min + (q.max - q.min) * i / (n - 1); vals.push(q.step >= 1 ? Math.round(v) : +v.toPrecision(6)); }
    var cv = Math.min(q.max, Math.max(q.min, c.value)); if (vals.indexOf(cv) < 0) vals.push(cv); vals.sort(function (a, b) { return a - b; }); vals = vals.filter(function (x, j) { return j === 0 || x !== vals[j - 1]; });
    var p = Object.assign({}, A.sp(st.id)), set = Object.assign({}, S.set), out = h("div", { class: "note", style: { "margin-top": "8px" } }, h("span", { class: "spin", style: { display: "inline-block", "vertical-align": "-2px", "margin-right": "6px" } }), "正在两批新路径上检验…"), stamp = Date.now() % 100000;
    btn.disabled = true; el.appendChild(out); scrollLog();
    var res1, best;
    var sw = function (payload) { return A.sweepEngine().then(function (e) { return e.send("sweep", payload, { timeout: A.tmo(180000, st) }); }); };
    var name0 = pLabel(st, c.param), on0 = OBJN[k], isG = k === "score", gd = isG ? A.wdef().score(A.wp()) : null;
    /** 找出扫描结果里的峰值，并把曲线放进"参数扫描"图里 */
    function peakOf(m) {
      var bv = -Infinity, bj = -1; for (var j = 0; j < vals.length; j++) { var x = m[k][j]; if (x === x && x > bv && (k !== "mean" || m.pDD[j] <= set.ddProb / 100)) { bv = x; bj = j; } }
      if (bj < 0) throw { message: "所有取值都不满足约束，无法比较" };
      var o = S.copt.sweep || (S.copt.sweep = {}); o.stratId = st.id; o.x = { key: c.param, min: q.min, max: q.max, n: n }; o.y = { key: "" }; o.obj = k;
      A.sweep.res = m; A.sweep.axes = [{ key: c.param, values: vals }]; A.sweep.claim = c; A.sweep.busy = false;
      if (A.shown().indexOf("sweep") < 0) A.toggleChart("sweep"); A.rebuildControls("sweep"); A.refreshChart("sweep");
      return bj;
    }
    if (S.world.type === "real") {
      // 真实数据只有一段历史：没有新的路径可以生成，样本外那一段也不该为了这件事被翻出来看。只在训练段上扫一遍，不下结论。
      out.lastChild.textContent = "正在训练段上扫描…";
      sw({ axes: [{ key: c.param, values: vals }], p: p, set: set, fitKeys: st.fitKeys || null }).then(function (m) {
        best = peakOf(m); clear(out); out.className = "note"; btn.disabled = false;
        out.appendChild(h("span", { class: "verdict flat", text: "这里没法检验。" }));
        out.appendChild(document.createTextNode(" 真实数据只有一段历史，生成不了新的路径。只在训练段上扫了一遍：" + on0 + "的峰值在 " + name0 + " = " + F(vals[best]) + "（声明的是 " + F(cv) + "）。一条路径上峰值落在哪里主要靠运气，不能当作对声明的检验；要检验，换到模拟的世界或 bootstrap 世界再点一次。扫描曲线已放到\"参数扫描\"图里。"));
        scrollLog();
      }).catch(function (e) { clear(out); out.className = "warn err"; out.textContent = "扫描没有完成：" + (e.message || e); btn.disabled = false; });
      return;
    }
    sw({ axes: [{ key: c.param, values: vals }], p: p, set: set, fresh: 1000 + stamp, fitKeys: st.fitKeys || null }).then(function (m) {
      res1 = m; best = peakOf(m);
      if (vals[best] === cv) return null;
      return sw({ axes: [{ key: c.param, values: [cv, vals[best]] }], p: p, set: set, fresh: 2000 + stamp, keepWT: true, fitKeys: st.fitKeys || null });
    }).then(function (m2) {
      clear(out); out.className = "note"; btn.disabled = false;
      var name = pLabel(st, c.param), on = OBJN[k], fmt = isG ? function (v) { return A.gdiff(gd, v).slice(1); } : k === "sharpe" ? function (v) { return F(v, 2); } : function (v) { return P(v); };
      if (!m2) { out.appendChild(h("span", { class: "verdict up", text: "✓ 与声明一致。" })); out.appendChild(document.createTextNode(" 在一批新路径上扫描 " + name + "，" + on + "的峰值正好落在声明的 " + F(cv) + "。")); return; }
      var d, se, a = m2.keep[0], b = m2.keep[1], N = a.WT.length, s = 0, s2 = 0, cnt = 0, yrs = m2.T / m2.K, j;
      if (k === "growth") { for (j = 0; j < N; j++) if (a.WT[j] > 0 && b.WT[j] > 0) { var z = Math.log(b.WT[j] / a.WT[j]) / yrs; s += z; s2 += z * z; cnt++; } }
      else if (k === "mean") { for (j = 0; j < N; j++) { var y = b.WT[j] - a.WT[j]; s += y; s2 += y * y; cnt++; } }
      else if (isG) { for (j = 0; j < N; j++) { var y2 = b.SC[j] - a.SC[j]; s += y2; s2 += y2 * y2; cnt++; } }
      if (k === "sharpe") { d = m2.sharpe[1] - m2.sharpe[0]; se = Math.hypot(m2.sharpeSE[0], m2.sharpeSE[1]); }
      else { d = s / cnt; se = cnt > 1 ? Math.sqrt(Math.max(0, (s2 - s * s / cnt) / (cnt - 1)) / cnt) : NaN; }
      var okc = !(d > 2 * se);
      out.appendChild(h("span", { class: "verdict " + (okc ? "up" : "down"), text: okc ? "✓ 与声明一致。" : "✕ 与声明有出入。" }));
      out.appendChild(document.createTextNode(" 第一批新路径上，" + on + "的峰值在 " + name + " = " + F(vals[best]) + "（声明的是 " + F(cv) + "）。在第二批新路径上把两者做配对比较：前者比后者" + (isG && gd.lower ? (d >= 0 ? "成本低 " : "成本高 ") : (d >= 0 ? "高 " : "低 ")) + fmt(Math.abs(d)) + " ± " + fmt(se) + (okc ? "，差别在误差之内，峰值附近本来就很平。" : "，超过 2 倍标准误。") + "扫描曲线已放到\"参数扫描\"图里。"));
      scrollLog();
    }).catch(function (e) { clear(out); out.className = "warn err"; out.textContent = "检验没有完成：" + (e.message || e); btn.disabled = false; });
  }

  function doWorld(idea, fix) {
    var el = card(), status = statusRow(who() + " 正在构造这个世界…"), bodyEl = h("div"); el.appendChild(status); el.appendChild(bodyEl);
    var exEl = null;
    return call(promptWorld(idea, fix), { modelTier: tierOf("world") }, function (t) { var r = parseReply(t); status.lastChild.textContent = [who() + " 正在思考…", "正在定参数…", "正在写采样代码…", "正在写说明…", "正在收尾…"][r.stage]; if (r.stage >= 3 && r.explain) { if (!exEl) { exEl = h("div"); bodyEl.appendChild(exEl); } QLMD.mountPartial(exEl, r.explain); scrollLogSoft(); } }, status).then(function (res) {
      var r = parseReply(res.text); if (r.stage < 3 || !r.code || !r.meta) throw { code: "bad_format", text: res.text };
      var meta = r.meta, params = cleanParams(meta.params), prev = { custom: S.custom, type: S.world.type, wp: S.wparams.custom, N: S.world.N, T: S.world.T, K: S.world.K };
      var cw = { name: String(meta.name || "自定义世界").slice(0, 24), summary: String(meta.summary || "").slice(0, 200), code: r.code, schema: params, explain: r.explain };
      clear(el); el.appendChild(h("div", { class: "a-h" }, h("b", { text: cw.name }), h("span", { class: "tag", text: "自定义世界" })));
      if (cw.summary) el.appendChild(h("div", { class: "note", style: { "margin-bottom": "6px" }, text: cw.summary }));
      el.appendChild(paramTable(params)); el.appendChild(codeBlock(cw.code));
      var ex = h("div", { style: { "margin-top": "8px" } }); QLMD.mount(ex, cw.explain || ""); el.appendChild(ex);
      var runEl = statusRow("正在生成路径…"); el.appendChild(runEl); var actions = h("div", { class: "a-actions" }); el.appendChild(actions);
      S.custom = cw; var defs = {}; params.forEach(function (q) { defs[q.key] = q.def; }); S.wparams.custom = defs; S.world.type = "custom";
      if (QL.WORLDS[prev.type].game) { A.fixStrat(); A.syncCharts(); A.renderStrat(); A.renderSettings(); }
      var K = Math.round(+meta.K), T = Math.round(+meta.T), N = Math.round(+meta.N);
      S.world.K = K >= 1 && K <= 100000 ? K : (QL.WORLDS[prev.type].needsData || QL.WORLDS[prev.type].unit === "次" || QL.WORLDS[prev.type].game ? 252 : prev.K); S.world.T = T >= 10 && T <= 4000 ? T : Math.max(50, Math.min(prev.T || 252, 1000)); S.world.N = N >= 20 && N <= 6000 ? N : 1000;
      if (QL.WORLDS[prev.type].bounds) { var sv = S.set._saved || [QL.DEFAULT_SET.fmin, QL.DEFAULT_SET.fmax]; S.set.fmin = sv[0]; S.set.fmax = sv[1]; A.renderSettings(); }
      return A.engine().then(function () {
        A.renderWorld(); A.afterWorldChange(); var ws = A.worldStats;
        clear(runEl); runEl.className = "note"; runEl.textContent = "已生成 " + ws.N + " 条 × " + ws.T + " 步的路径并设为当前世界。实测年化均值 " + P(ws.annMean, 1) + "，年化波动 " + P(ws.annVol, 1) + "，一阶自相关 " + F(ws.acf[0], 3) + "。";
        actions.appendChild(h("button", { class: "btn small", type: "button", text: "看价格路径", onclick: function () { A.showCharts(["paths", "retdist", "acf"]); } }));
        actions.appendChild(h("button", { class: "btn small", type: "button", text: "复制代码", onclick: function () { A.copy(cw.code); } }));
      }, function (e) {
        var msg = e.message || String(e);
        clear(runEl); runEl.className = "warn err"; runEl.textContent = "采样代码没有跑通：" + msg;
        actions.appendChild(h("button", { class: "btn small primary", type: "button", text: "让 " + AI + " 修复", onclick: function () { S.custom = cw; S.world.type = "custom"; send("修复采样代码", { world: true, fix: msg }); } }));
        S.custom = prev.custom; S.world.type = prev.type; S.wparams.custom = prev.wp; S.world.N = prev.N; S.world.T = prev.T; S.world.K = prev.K;
        if (QL.WORLDS[prev.type].game) { A.fixStrat(); A.syncCharts(); A.renderStrat(); A.renderSettings(); }
        A.renderWorld(); A.requestRun("commit");
      });
    }).catch(function (e) { fail(el, e, bodyEl); });
  }

  function doChart(q) {
    var el = card(); el.appendChild(statusRow("正在找合适的图…"));
    return call(promptChart(q), { modelTier: tierOf("chart"), cache: true }).then(function (res) {
      var t = res.text, a = t.indexOf("{"), b = t.lastIndexOf("}"), o = null; try { o = JSON.parse(t.slice(a, b + 1)); } catch (e) {}
      clear(el); if (!o) { el.appendChild(h("div", { class: "note", text: t.slice(0, 400) })); return; }
      var ids = (Array.isArray(o.show) ? o.show : []).filter(function (id) { return A.CH[id]; }).slice(0, 3);
      if (ids.length) {
        A.showCharts(ids, false, true);
        el.appendChild(h("div", { class: "a-h" }, h("b", { text: "已显示：" + ids.map(function (id) { return A.CH[id].name; }).join("、") })));
        if (window.matchMedia("(max-width: 779.9px)").matches) el.appendChild(h("div", { class: "row tight", style: { "margin-top": "6px" } }, h("button", { class: "btn small", type: "button", text: "去\"结果\"一页看图", onclick: function () { A.showCharts(ids); } })));
      }
      if (o.say) el.appendChild(h("div", { class: "md", text: String(o.say) }));
      if (!ids.length && !o.say) el.appendChild(h("div", { class: "note", text: "没有找到合适的图。" }));
    }).catch(function (e) { fail(el, e); });
  }
  function doAsk(q) {
    var el = card(), status = statusRow(who() + " 正在看这次的结果…"), out = h("div"); el.appendChild(status); el.appendChild(out);
    turns.push({ role: "user", content: q }); if (turns.length > 8) turns = turns.slice(-8);
    while (turns.length && turns[0].role !== "user") turns.shift();
    var input = [{ role: "user", content: askRules() }].concat(turns);
    return call(input, { modelTier: tierOf("ask") }, function (t) { status.hidden = true; QLMD.mountPartial(out, t); scrollLogSoft(); }, status).then(function (res) {
      status.remove(); QLMD.mount(out, res.text); turns.push({ role: "assistant", content: res.text });
    }).catch(function (e) { if (turns.length && turns[turns.length - 1].role === "user") turns.pop(); if (e && e.text && e.code !== "refused") { QLMD.mount(out, e.text); } fail(el, e, out); });
  }

  function send(text, special) {
    if (busy || !sample) return; text = String(text || "").trim(); if (!text) return;
    bubble(text); setBusy(true);
    var pr = special && special.fix && !special.world ? doStrategy("", special.fix) : special && special.world ? doWorld(special.fix ? "" : text, special.fix) : mode === "strategy" ? doStrategy(text) : mode === "world" ? doWorld(text) : mode === "chart" ? doChart(text) : doAsk(text);
    pr.then(function () { setBusy(false); scrollLog(); }, function () { setBusy(false); });
  }
  A.askFix = function (msg) { A.openClaude(true); if (!sample) { A.toast(WEB ? "还没有接入 AI：先在右栏点\"接入 AI…\"，或者手动修改代码" : "这里不能调用 Claude，请手动修改代码"); return; } setMode("strategy"); send("修复这段代码的错误：" + String(msg).slice(0, 300), { fix: String(msg).slice(0, 1500) }); };

  function disable(reason) { sample = null; var off = $("aiOff"); if (off) { off.hidden = false; off.textContent = reason + " 其余功能不受影响：世界、规则、图表和参数扫描都在本地运行。"; } var s = $("aiSend"); if (s) s.disabled = true; var t = $("aiInput"); if (t) t.disabled = true; var b = $("btnClaude"); if (b) b.classList.remove("primary"); }
  function setMode(m) {
    mode = m; Array.prototype.forEach.call($("aiModes").children, function (b) { b.setAttribute("aria-pressed", b.dataset.m === m ? "true" : "false"); });
    var t = $("aiInput"); if (t) t.placeholder = placeholder(m);
    var dw = $("aiDeepWrap"); if (dw) dw.hidden = !(m === "strategy" && limits && limits.tools);
    var e = $("aiEmpty"); if (e) renderEmpty(e);
  }
  function renderEmpty(e) {
    clear(e);
    e.appendChild(h("div", { text: { strategy: A.isGame() ? "说说你想怎么玩这一局，" + AI + " 会写成规则的代码、给出具体的参数，并解释它是不是最优。写好后自动载入并计分。" : "说出想法，" + AI + " 会给出规则的代码、具体的参数，并解释为什么这样构造、是不是最优。写好后自动载入并回测。", world: "描述一种数据的生成方式，" + AI + " 会写成采样函数，生成的路径立刻成为当前的世界。", chart: "说你想看什么，" + AI + " 会把对应的图调出来。", ask: "针对眼前的数字提问。" + AI + " 能看到当前的世界、规则和三种口径的结果。" }[mode] }));
    var eg = h("div", { class: "eg" }); examples(mode).forEach(function (x) { eg.appendChild(h("button", { class: "btn small", type: "button", text: x, onclick: function () { var t = $("aiInput"); t.value = x; if (!t.disabled) t.focus(); } })); }); e.appendChild(eg);
  }

  /* ---------- 独立的网页：接入自己的 AI ---------- */
  /** 按当前的设置把面板摆成"能用"或"还没接入" */
  function webSync() {
    var lab = WEB.label(), chip = $("aiProv"), off = $("aiOff"), s = $("aiSend"), t = $("aiInput");
    sample = lab ? WEB.sample() : null; limits = { tools: false };
    if (chip) { chip.textContent = lab ? lab.short + " · " + lab.model : "接入 AI…"; chip.title = lab ? "正在用 " + lab.short + " 的 " + lab.model + "。点这里换服务商、换模型或改密钥。" : "选一家服务商，填上你自己的 API 密钥"; chip.classList.toggle("primary", !lab); }
    if (off) {
      off.hidden = !!lab; clear(off);
      if (!lab) {
        off.appendChild(h("div", { text: "这一栏要先接入一个 AI 才能用：DeepSeek、ChatGPT、Kimi、豆包，或者任何兼容 OpenAI 的接口。用的是你自己的 API 密钥，密钥只保存在这台电脑的浏览器里。" }));
        off.appendChild(h("div", { class: "row", style: { "margin-top": "8px" } }, h("button", { class: "btn small primary", type: "button", text: "接入 AI…", onclick: function () { A.openAiSettings(); } })));
        off.appendChild(h("div", { class: "note", style: { "margin-top": "8px" }, text: "不接入也不影响别的：世界、规则、图表、参数扫描和手册都在本地运行；规则的代码可以自己改（左栏规则下面的\"代码与说明\"）。" }));
      }
    }
    if (s) s.disabled = !lab; if (t) t.disabled = !lab;
    if ($("aiModes")) setMode(mode);
  }
  /** 设置：选服务商、填密钥、选模型、测试连接。改动先落在草稿里，点"保存"才生效 */
  A.openAiSettings = function () {
    if (!WEB) return;
    var draft = WEB.cfg(), m = null, body = h("div", { class: "ai-set" }), found = {}, busyNow = false;
    if (!draft.p) draft.p = WEB.PRE[0].id;
    function cur() { return draft.by[draft.p] || (draft.by[draft.p] = {}); }
    function say(kind, text, detail) {
      var st = body.querySelector(".ai-st"); if (!st) return; clear(st); st.className = "ai-st" + (kind ? " " + kind : "");
      if (text) st.appendChild(h("div", { text: text })); if (detail) st.appendChild(h("div", { class: "note", text: detail }));
    }
    function sayErr(e) { var ex = WEB.explain(e); say("bad", "✕ " + ex.text, ex.detail ? "服务商的原话：" + ex.detail : ""); }
    function field(label, control, hint) { return h("div", { class: "ai-f" }, h("label", { text: label, for: control.id || null }), control, hint ? h("div", { class: "note", text: hint }) : null); }
    function lock(on) { busyNow = on; Array.prototype.forEach.call((m ? m.box : body).querySelectorAll("button.ai-act"), function (b) { b.disabled = on; }); }
    function paint() {
      var P = WEB.preset(draft.p), u = cur(); clear(body);
      body.appendChild(h("div", { class: "note", text: "用你自己的 API 密钥调用所选的服务商。密钥只保存在这台电脑的这个浏览器里；请求从你的浏览器直接发给服务商，不经过本站；费用由服务商按你的账号计。" }));
      body.appendChild(h("div", { class: "ai-f" }, h("label", { text: "服务商" }), h("div", { class: "ai-provs", role: "group", "aria-label": "服务商" }, WEB.PRE.map(function (x) {
        return h("button", { class: "chip", type: "button", "data-p": x.id, "aria-pressed": x.id === draft.p ? "true" : "false", text: x.name, onclick: function () { draft.p = x.id; paint(); var k = $("aiKey"); if (k) k.focus(); } });
      }))));
      if (P.hint) body.appendChild(h("div", { class: "note ai-hint", text: P.hint }));
      var needProxy = WEB.noCors(WEB.conf(draft));
      if (needProxy) body.appendChild(h("div", { class: "warn ai-needproxy", text: P.short + " 的接口不允许网页直接调用（浏览器的跨域限制会把回答拦下）。要在下面的\"高级\"里填一个转发代理才能用。" }));
      // 同一家的不同站点（密钥不通用）
      if (P.sites) {
        var site = h("select", { id: "aiSite", onchange: function () { u.base = site.value === P.base ? "" : site.value; paint(); } }, P.sites.map(function (x) { return h("option", { value: x[0], text: x[1], selected: (u.base || P.base) === x[0] }); }));
        body.appendChild(field("站点", site));
      }
      if (!P.base) { var b0 = h("input", { type: "text", id: "aiBase", value: u.base || "", placeholder: "https://…/v1", spellcheck: "false", autocomplete: "off", oninput: function () { u.base = b0.value; } }); body.appendChild(field("接口地址", b0, "到 /v1 为止，后面的 /chat/completions 不用写。")); }
      // 密钥
      var key = h("input", { type: "password", id: "aiKey", value: u.key || "", placeholder: WEB.isLocal(u.base || P.base) ? "本机的接口可以不填" : "sk-…", spellcheck: "false", autocomplete: "off", oninput: function () { u.key = key.value; } });
      var eye = h("button", { class: "btn small", type: "button", text: "显示", "aria-pressed": "false", onclick: function () { var on = key.type === "password"; key.type = on ? "text" : "password"; eye.textContent = on ? "隐藏" : "显示"; eye.setAttribute("aria-pressed", on ? "true" : "false"); } });
      body.appendChild(h("div", { class: "ai-f" }, h("label", { text: "API 密钥", for: "aiKey" }), h("div", { class: "ai-row" }, key, eye),
        P.keyUrl ? h("div", { class: "note" }, "还没有密钥？", h("a", { href: P.keyUrl, target: "_blank", rel: "noopener noreferrer", text: "到 " + P.short + " 的控制台申请 ↗" })) : null));
      // 模型
      var list = (found[draft.p] || []).concat(P.models.filter(function (x) { return (found[draft.p] || []).indexOf(x) < 0; }));
      var model = h("input", { type: "text", id: "aiModel", value: u.model || "", placeholder: P.model || "模型的名字", list: "aiModelList", spellcheck: "false", autocomplete: "off", oninput: function () { u.model = model.value; } });
      var fetchBtn = h("button", { class: "btn small ai-act", type: "button", text: "获取模型列表", onclick: function () {
        if (busyNow) return; lock(true); say("", "正在向服务商查询…");
        WEB.models(draft).then(function (ids) { lock(false); found[draft.p] = ids; var keep = model.value; paint(); if (keep) $("aiModel").value = keep; say(ids.length ? "good" : "", ids.length ? "查到 " + ids.length + " 个模型：点\"模型\"那一格可以从里面选。" : "服务商没有返回模型列表，模型的名字要自己填。"); }, function (e) { lock(false); sayErr(e); });
      } });
      body.appendChild(h("div", { class: "ai-f" }, h("label", { text: "模型", for: "aiModel" }), h("div", { class: "ai-row" }, model, fetchBtn), h("datalist", { id: "aiModelList" }, list.map(function (x) { return h("option", { value: x }); })),
        h("div", { class: "note", text: P.model ? "留空就用 " + P.model + "。模型的名字变得很快，报\"不认识这个模型\"时点右边的按钮换一个。" : "填服务商给这个模型起的名字。" })));
      // 高级
      var adv = h("details", { class: "more ai-adv", open: !!(u.fast || (P.base && u.base && !P.sites) || draft.proxy || u.think === false || needProxy) }, h("summary", { text: "高级" }));
      var ab = h("div", { class: "more-body" }); adv.appendChild(ab);
      if (P.base && !P.sites) { var b1 = h("input", { type: "text", id: "aiBase", value: u.base || "", placeholder: P.base, spellcheck: "false", autocomplete: "off", oninput: function () { u.base = b1.value; } }); ab.appendChild(field("接口地址", b1, "一般不用改。走中转或者自建的兼容接口时填在这里。")); }
      var fast = h("input", { type: "text", id: "aiFast", value: u.fast || "", placeholder: P.fast || "和上面的模型相同", list: "aiModelList", spellcheck: "false", autocomplete: "off", oninput: function () { u.fast = fast.value; } });
      ab.appendChild(field("做小事用的模型", fast, "\"调图表\"只是从清单里挑几张图，用便宜、快的模型就够了。"));
      var think = h("input", { type: "checkbox", id: "aiThink", checked: u.think !== false, onchange: function () { u.think = think.checked; } });
      ab.appendChild(h("div", { class: "ai-f" }, h("label", { class: "ai-ck", for: "aiThink" }, think, "写策略、造世界时让模型先深度思考"), h("div", { class: "note", text: "更慢（常常要等一两分钟），推导和代码通常更可靠。问结果、调图表不受这一项影响，总是直接回答。" })));
      var proxy = h("input", { type: "text", id: "aiProxy", value: draft.proxy || "", placeholder: "一般留空", spellcheck: "false", autocomplete: "off", oninput: function () { draft.proxy = proxy.value; }, onchange: function () { if (needProxy !== WEB.noCors(WEB.conf(draft))) paint(); } });
      ab.appendChild(field("转发代理", proxy, "有的服务商不允许网页直接调用（浏览器的跨域限制），表现是\"请求没有发出去\"。这时要有一个转发代理把请求转过去，把它的地址填在这里：页面会请求 <代理地址>/<完整的接口地址>。代理能看到你的密钥，只填你自己部署或者信得过的。"));
      body.appendChild(adv);
      body.appendChild(h("div", { class: "ai-st", role: "status", "aria-live": "polite" }));
      body.appendChild(h("div", { class: "note", text: "和本站同一个域名下的其他页面在技术上也读得到保存在这里的密钥。用的是公用电脑的话，用完请点\"清除密钥\"。" }));
    }
    var clearBtn = h("button", { class: "btn ai-act", type: "button", text: "清除密钥", title: "把这家服务商的密钥从这个浏览器里删掉", onclick: function () {
      var P = WEB.preset(draft.p); delete cur().key; var c = WEB.cfg(); if (c.by[draft.p]) delete c.by[draft.p].key; WEB.save(c); paint(); say("", "已经把 " + P.short + " 的密钥从这个浏览器里删掉。");
    } });
    var testBtn = h("button", { class: "btn ai-act", type: "button", text: "测试连接", onclick: function () {
      if (busyNow) return; lock(true); say("", "正在测试：发一句最短的话，等它回…");
      WEB.test(draft).then(function (r) { lock(false); say("good", "✓ 通了：" + r.model + " 在 " + (r.ms / 1000).toFixed(1) + " 秒里回了话" + (r.viaProxy ? "（经转发代理）" : "") + "。记得点\"保存\"。"); }, function (e) { lock(false); sayErr(e); });
    } });
    var saveBtn = h("button", { class: "btn primary ai-act", type: "button", text: "保存", onclick: function () {
      var bad = WEB.problem(WEB.conf(draft)); if (bad) { sayErr({ code: bad }); return; }
      WEB.save(draft); m.close(); A.toast("已接入 " + WEB.label().short + "。右栏可以用了。"); A.openClaude(true);
    } });
    paint();
    m = A.modal("接入 AI", body, { narrow: true, cls: "aiset", focus: "#aiKey", foot: [clearBtn, h("span", { style: { flex: "1" } }), testBtn, saveBtn] });
  };

  A.initClaude = function () {
    var host = clear($("paneAi"));
    // 顶栏的按钮、手机上的标签、面板的名字：独立的网页里叫 AI
    var hb = $("btnClaude"), tb = document.querySelector('#tabs [data-tab="ai"]'); if (hb) hb.textContent = AI; if (tb) tb.textContent = AI; host.setAttribute("aria-label", AI);
    var tierSel = h("select", { "aria-label": "模型档位", title: "越强越慢，也越耗用量", onchange: function () { S.tier = tierSel.value; A.persist(); } }, [["complex", "最强"], ["default", "均衡"], ["quick", "最快"]].map(function (x) { return h("option", { value: x[0], text: "模型：" + x[1], selected: S.tier === x[0] }); }));
    var prov = WEB ? h("button", { class: "btn small ai-prov", type: "button", id: "aiProv", onclick: function () { A.openAiSettings(); } }) : null;
    host.appendChild(h("div", { class: "ai-h" }, h("h2", { text: AI }), WEB ? prov : tierSel, h("button", { class: "iconbtn", type: "button", "aria-label": "收起 " + AI + " 面板", text: "✕", onclick: function () { if (window.matchMedia("(max-width: 779.9px)").matches) A.setTab("res"); else A.openClaude(false); } })));
    host.appendChild(h("div", { class: "ai-modes", id: "aiModes" }, MODES.map(function (m) { return h("button", { class: "chip", type: "button", "data-m": m[0], "aria-pressed": m[0] === mode ? "true" : "false", text: m[1], onclick: function () { setMode(m[0]); } }); })));
    host.appendChild(h("div", { class: "ai-off", id: "aiOff", hidden: true }));
    var empty = h("div", { class: "ai-empty", id: "aiEmpty" }); renderEmpty(empty);
    host.appendChild(h("div", { class: "ai-log", id: "aiLog", "aria-live": "polite" }, empty));
    var ta = h("textarea", { id: "aiInput", placeholder: placeholder(mode), "aria-label": "对 " + AI + " 说", rows: "3" });
    ta.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } });
    function go() { var v = ta.value; if (!v.trim() || busy) return; ta.value = ""; send(v); }
    var deepCb = h("input", { type: "checkbox", id: "aiDeep" }); deepCb.addEventListener("change", function () { deep = deepCb.checked; });
    host.appendChild(h("div", { class: "ai-in" }, ta, h("div", { class: "row" },
      h("label", { class: "note", id: "aiDeepWrap", hidden: true, title: "让 Claude 在回答前自己调用回测、看结果、再改。更慢，也更耗用量。", style: { display: "inline-flex", gap: "6px", "align-items": "center" } }, deepCb, "深度模式"), h("span", { style: { flex: "1" } }),
      h("button", { class: "btn", type: "button", id: "aiStop", hidden: true, text: "停止", onclick: function () { if (ctl) ctl.abort(); } }),
      h("button", { class: "btn primary", type: "button", id: "aiSend", text: "发送", title: "⌘/Ctrl + Enter", onclick: go }))));
    var cl = window.claude, sendBtn = $("aiSend");
    // 独立的网页：用使用者自己接入的服务商；设置变了（包括在别的标签页里改的）就跟着变
    if (WEB) { webSync(); WEB.onChange(webSync); return; }
    // 在 Claude 里：取得调用 Claude 的能力；取不到就把这一块标成不可用
    if (!HOST) { disable("这个页面要在 Claude 里打开才能调用 Claude；现在这样打开，写规则、造世界、调图表、问结果这四项用不了。规则的代码可以自己改：左栏规则下面的\"代码与说明\"。"); return; }
    sendBtn.disabled = true; sendBtn.textContent = "正在连接…";       // 能力要等宿主应答之后才可用
    cl.use("sample").then(function (fn) {
      sendBtn.textContent = "发送";
      if (!fn) { disable("当前的打开方式不能调用 Claude。"); return; }
      sample = fn; sendBtn.disabled = false;
      if (typeof fn.limits === "function") fn.limits().then(function (l) { limits = l; setMode(mode); }, function () {});
    }, function () { sendBtn.textContent = "发送"; disable("当前的打开方式不能调用 Claude。"); });
  };
  A.claudeSend = send; A.claudeMode = setMode;
  /** 换了世界：例子和提示文字跟着换 */
  A.claudeRefresh = function () { if ($("aiModes")) setMode(mode); };
  A.claudePrompt = function (kind, idea) { return kind === "ask" ? askRules() : promptStrategy(idea || "", null); };   // 测试和调试用：看看发给 Claude 的到底是什么
})(App);
