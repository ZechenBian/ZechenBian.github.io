# English edition · 英文版是怎么来的

The source code is written once, in Chinese. The English page (`en/index.html`) is generated at build time: every piece of
user-visible Chinese text in `src/*.js` is replaced by its translation from `i18n/en/*.json`; the code itself is not touched.
Both pages therefore run the same computation and show the same numbers. If a Chinese string changes and no translation is
supplied, the build fails and names the string.

源码只有一份（中文）。英文页面在构建时生成：把 `src/*.js` 里给人看的中文换成 `i18n/en/*.json` 里的译文，代码一个字不动，
所以两种语言跑的是同一套计算。改了中文而没补译文，构建会失败并指出是哪一段。

```
node i18n/i18n.js check                    # report missing, damaged or inconsistent translations
node i18n/i18n.js show <file|all> [regex]  # list units (id, Chinese, current English) whose text matches
node i18n/i18n.js export <dir> [n]         # write the untranslated units as text files for a translator (n = max Chinese characters per file)
node i18n/i18n.js verify <zh> <en…>        # a translator checks a finished batch before handing it in
node i18n/i18n.js import <dir> <files…>    # read translated files back into i18n/en/*.json; <dir> is the export folder
node i18n/i18n.js import - <files…>        # the same for hand-written corrections, with unit ids taken from the current source
python3 build.py                           # builds both pages (runs `apply` and `sig` itself)
```

A *unit* is a string literal, a `+` concatenation taken as one sentence, a template string, or a `//` comment inside a
rule's `fit` / `init` / `decide` function (those functions are shown to the reader as the rule's code). In a unit,
`§0§ §1§ …` stand for the pieces of code that are spliced into the sentence; a translation may reorder them but must use
each exactly once.

Where things live:

- `en/<file>.json`: the translations of `src/<file>`, keyed by the Chinese text (and, where the same Chinese needs
  different English in different places, by which occurrence it is).
- `en/_terms.json`: names and labels shared across files (worlds, games, rules, charts, buttons). A file-level entry wins.
- `en/_html.json`: the Chinese in the page skeleton (`src/body.html`) and in the names of the sample datasets.
- `en/_allow_han.json`: the few strings that legitimately keep Chinese characters (for example the patterns that
  recognise Chinese column headers in an imported CSV).

Two safeguards beyond the per-unit checks: a literal that the code compares with `===` must have the same English
everywhere (`check` reports clashes), and `test/ui-en.js` walks through the whole English page and fails if a Chinese
character appears anywhere, including text drawn on charts.

The English page reuses the Chinese page's cache of live-computed numbers: `node i18n/i18n.js sig` prints the cache
signature of the Chinese source, and the build writes it into `en/index.html`.

---

# Translator's guide

You are translating a quantitative-finance teaching tool ("Strategy Lab") from Chinese into English. Readers are students
and practitioners of mathematics, statistics and trading. The Chinese text is careful and plain; the English must be equally
careful and plain. **Precision first**: every theorem, assumption, number and inequality must say exactly what the Chinese says.

## The file format

Each unit looks like this:

```
@@@ app-ui.js#57 | chain | line 342 | in text | §0§ = ws.N ; §1§ = ws.T
已生成 §0§ 条 × §1§ 步的路径并设为当前世界。
```

Write your translation in the **same format** to the output file you were given: copy the `@@@ …` header line unchanged, then
put the English text below it. Translate every unit, in the same order, once. Do not add anything else to the output file.

- `§0§`, `§1§`, … are placeholders for values computed by the code (the header shows the source expression of each). Keep each
  one exactly once; you may move them to wherever English grammar wants them. Never add or drop one.
- `␣` at the very start or end of a unit is a significant space, `↵` a significant newline. Chinese needs no space between
  words; English does. If the unit is a fragment that will be glued to something else, put `␣` where the English needs a
  space, e.g. `每` → `per␣`, `␣步` → `␣steps`. Everything in the middle of a unit is literal, including line breaks.
- Units are often **fragments** of a sentence built in code. Read the source around the given line (`src/<file>`, line number
  in the header) when a fragment is unclear, and make the assembled English sentence read correctly.

## What must not change

1. **Math**: everything between `$…$` or `$$…$$` is LaTeX and must be copied character for character. The only exception is
   Chinese words inside `\text{…}`, `\mathrm{…}` or `\operatorname{…}`, which you translate. Never write a literal dollar sign for
   money (it would start a formula): write "dollars" or "USD".
2. **Live-number tokens** `⟪…⟫` (e.g. `⟪m.mu1.std|2⟫`): copy exactly. They are replaced by numbers computed in the browser.
3. **Inline code** `⟦…⟧` and anything in backticks: copy exactly.
4. **Code units** (text that is JavaScript, e.g. starts with `// …` and contains `function decide(`): translate the comments and
   the Chinese inside string literals only. Do not reformat, rename or "fix" anything else — the code must stay byte-identical
   apart from comments and Chinese strings.
5. **Markdown structure**: keep the same paragraphs, headings (`##`), list items (`- `, `1. `), tables (`|`), bold (`**…**`), links.
6. **Numbers and symbols**: keep every number, unit and symbol (σ, μ, ≥, →, ×, ±, %, bp). Write "10,000" style only if the
   Chinese already groups digits; otherwise copy the number as it is. `万` = 10,000 (so `1–2 万` → `10,000–20,000`).
7. Identifiers, JSON keys, parameter names, file formats and markers such as `<<<META>>>`, `"tier": "proven"`, `s.ret`, `p.f`.

## Style

- American English. Plain, direct sentences; the reader is addressed as "you". No marketing tone, no filler ("simply", "just",
  "note that"), no exclamation marks. Do not add explanations that are not in the Chinese, and do not drop any.
- Sentence case for labels, buttons, chart titles and headings ("Max drawdown distribution", not "Max Drawdown Distribution").
  Keep labels short: a button that is four characters in Chinese should be two or three words in English.
- English punctuation only (no `，。；：（）、""`). Use straight quotes `"…"`. A Chinese `、` list becomes commas.
  `X（Y）` becomes `X (Y)`; `甲：乙` becomes `A: B`.
- Names of people, theorems and papers: use the standard English form (Kelly 1956; Breiman 1961; Merton 1969; Almgren–Chriss;
  Gilbert–Mosteller; Shiryaev; Thompson sampling; Dubins–Savage "bold play"; the newsvendor critical fractile …).
- When the Chinese quotes a button, chart, rule, world or game by name, use the English name from `i18n/en/_terms.json`
  (search it: it maps Chinese → English for every such name), so the handbook matches the interface exactly.
- If the Chinese gives a term with an English gloss in parentheses, e.g. `遗憾（regret）`, write just the English term.
- The right-hand assistant is called "Claude" in the Chinese text; keep "Claude" (the page renames it where needed).

## Vocabulary

Use these consistently. (Exact names of worlds, games, rules, charts and buttons are in `i18n/en/_terms.json`.)

| 中文 | English |
|---|---|
| 玩法 / 世界 / 规则 | game / world / rule (the three layers) |
| 策略 | strategy |
| 细则 | rulebook (the game's regulations; never "rules", which means your decision rule) |
| 一局、对局 | episode |
| 回合 | round |
| 一步、步 | step |
| 路径 | path |
| 场景 | scenario |
| 基准 | benchmark |
| 参照 / 对照 | reference / comparison |
| 对照表 | comparison table |
| 口径（三种口径） | criterion (three criteria) |
| 长期增长率 | long-run growth rate |
| 夏普比率 | Sharpe ratio |
| 期望收益 | expected return |
| 净值 | wealth (terminal wealth $W_T$; "account equity" in the prop-firm game) |
| 终值 | terminal wealth |
| 仓位 | position |
| 仓位比例 | position fraction |
| 杠杆 | leverage |
| 满仓 / 半仓 / 空仓 | fully invested / half invested / flat |
| 做多 / 做空 | long / short |
| 加仓 / 减仓 / 调仓 | add to / reduce / rebalance the position |
| 回撤 / 最大回撤 | drawdown / max drawdown |
| 破产 | ruin |
| 换手 | turnover |
| 交易成本 | trading cost |
| 无风险利率 | risk-free rate |
| 漂移 / 波动 | drift / volatility |
| 收益（每步的） | return |
| 盈亏 | profit and loss (P&L) |
| 均值回复 | mean reversion |
| 动量 / 反转 | momentum / reversal |
| 厚尾 | heavy tails |
| 鞅 | martingale |
| 独立同分布 | i.i.d. |
| 先验 / 后验 | prior / posterior |
| 估计 / 估计量 | estimate / estimator |
| 标准误 | standard error |
| 配对差 | paired difference |
| 显著 | significant |
| 样本外 / 样本内 | out-of-sample / in-sample |
| 训练集 / 验证集 | training set / validation set |
| 训练段 / 回测段 | training segment / backtest segment |
| 过拟合 | overfitting |
| 回测 | backtest |
| 参数扫描 | parameter sweep |
| 随机种子 | random seed |
| 可证最优 / 族内最优 / 有保证 / 启发式 | provably optimal / optimal in its family / guaranteed / heuristic (the four tiers) |
| 最优性结论 | optimality result |
| 模型假设 / 目标函数 / 何时失效 / 可检验的预测 | model assumptions / objective / when it fails / testable prediction |
| 定理 / 证明思路 / 推论 / 引理 | theorem / proof sketch / corollary / lemma |
| 门槛、阈值 | threshold |
| 遗憾 | regret |
| 动态规划 | dynamic programming |
| 最优停止 | optimal stopping |
| 变点 | change point |
| 误报 | false alarm |
| 报警 | alarm |
| 观测 / 读数 | observation / reading |
| 现算 | computed live (on this computer) |
| 自检 | self-check |
| 手册 | handbook |
| 结果栏 | results bar |
| 左栏 / 中间 / 右栏 | left column / middle / right column |
| 后台线程 | background thread |
| 涨停 / 跌停 | limit-up / limit-down |
| 印花税 | stamp duty |
| 订货量 / 缺货 / 残值 | order quantity / stockout / salvage value |
| 出价 / 估值 | bid / estimate (of value) |
| 冲击（成交对价格的） | market impact |
| 年化 | annualized |
| 步数 T / 路径数 N / 每年步数 K | steps T / paths N / steps per year K |
