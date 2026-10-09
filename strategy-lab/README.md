# 策略实验室 · Strategy Lab

[中文](#中文) · [English](#english)

在浏览器里自己做量化实验的地方：选一种玩法、一个世界，定一条规则，让它在成百上千条模拟路径（或对局）上各跑一遍，看结果的分布，再和理论值对照。单个网页文件，全部在本机计算，不用登录、不用安装。

A place to run quantitative-strategy experiments in the browser: pick a game, a world and a rule, run the rule over thousands of simulated paths (or rounds), and read the distribution of outcomes against the theory. One web page, everything computed on your own machine, no sign-in and nothing to install.

**▶ 在线打开 / Open online:** https://zechenbian.github.io/strategy-lab/

界面是中文的。The interface is in Chinese.

---

## 中文

### 三层：玩法、世界、规则

左栏从上到下就是这三层。

| 层 | 是什么 | 有哪些 |
|---|---|---|
| 玩法 | 题目的类型：每一步看到什么、能做什么、怎么结算、怎么计分 | “交易一个资产”（每一步定仓位）；十套回合制玩法：接单与冷却、秘书问题、偏硬币下注、翻倍或出局、多臂老虎机、报童问题、赢家诅咒、自营考核、A 股交易制度、大单拆分执行；四套观测玩法：测量参数、预测、变点检测、停在最高点 |
| 世界 | 数据服从的分布或过程 | 几何布朗运动、均值回复、跳跃扩散、Heston、GARCH、牛熊切换、AR(1)、分数布朗运动、Logistic 映射、洛伦兹系统、带噪谐振子、自带的旧行情、Bootstrap；各套玩法还有自己能换的世界（报价的分布、噪声的类型……） |
| 规则 | 你的做法：每一步看到信息之后给出一个动作 | 85 条内置规则，每条写明假设、目标、最优性结论、什么时候失效、可以检验的预测；代码可以直接改、另存 |

把玩法和世界分开，是为了看“假设错了会怎样”：一条规则在一个世界里可证最优，换一个世界可以输给朴素的做法。

### 怎么开始

1. 打开上面的网址。第一次来，点右上角的“手册”（或按 `?`），先做“五个小实验”里的第一个，两三分钟。
2. 左栏选玩法、世界和规则，拖动参数；中间的结果栏和图表跟着重算。一次回测只要几十毫秒。
3. “找图表与命令”（`Ctrl K` / `⌘K`）按名字找图表、世界、规则和手册条目。
4. 调过参数之后点“用新路径检验”，看优势在没见过的数据上还在不在。

手册里有每套玩法的细则与来历、每张图怎么读、每条规则适合和不适合的场景、名词表，以及各套玩法已知的结论（定义、定理、证明的梗概、出处）。

### 数字是在你的电脑上现算的

- **对照表**（每条内置规则 × 每个世界或场景，共 701 格）不写在页面里：第一次打开时用后台线程在本机算，算出一格显示一格，结果存在浏览器里，下次直接读。
- 手册正文里带下划线的数字同样是现算的。
- 手册的**“自检”**一页列出 65 条可以用计算判对错的话（某个公式给出的数和模拟出来的对不对得上，某条规则在某个世界里是不是显著更好），在本机逐条算、逐条判。
- 同一个随机种子永远得到同一批路径，所以任何结果都可以复现。

### 右栏的 AI 助手

右栏可以让 AI 把一句话的想法写成规则（给出代码、参数和最优性的说明，写完自动载入并回测）、造一个新的世界、把合适的图调出来、解释眼前的结果。在这个网页上它用的是**你自己的 API 密钥**，可以选：

| 服务商 | 默认模型 | 能不能从网页直接调用 | 备注 |
|---|---|---|---|
| DeepSeek | deepseek-v4-pro | 可以 | |
| ChatGPT（OpenAI） | gpt-6-sol | 可以 | ChatGPT 的会员订阅不包含 API 用量，API 要另外开通 |
| Kimi（月之暗面） | kimi-k3 | 可以（国内站、国际站都可以） | 两个站点的密钥不通用，设置里要选对站点 |
| 豆包（火山方舟） | doubao-seed-2-1-pro-260915 | **不可以，要经转发代理** | 模型要先在方舟控制台开通；也可以填 ep- 开头的接入点编号 |
| 其他 | 自己填 | 看服务商 | 任何兼容 OpenAI Chat Completions 的接口；本机的 Ollama、LM Studio 也算 |

怎么接入：点右上角的“AI”，再点“接入 AI…”，选服务商、填密钥，点“测试连接”，通了就“保存”。模型的名字变得很快，报“不认识这个模型”时点“获取模型列表”换一个。

- **“能不能从网页直接调用”是 2026 年 10 月 9 日实测的**：在这个网址的页面上，用一把无效的密钥向各家的接口发请求。DeepSeek、OpenAI、Kimi 的“密钥无效”能被页面读到，说明它们允许网页调用；火山方舟的回答被浏览器的跨域限制（CORS）拦下。没有用真实的密钥测过完整的对话。
- **密钥只在你的浏览器里**：保存在本机浏览器（localStorage），请求从浏览器直接发给所选的服务商（或者你填的转发代理），不经过本站。和本站同一个域名下的其他页面在技术上也读得到它，所以在公用电脑上用完请点“清除密钥”。
- **费用**由服务商按你的账号计。写一条规则大约发送五千字、收回几千字。
- **转发代理**（设置里的“高级”）：服务商不允许网页直接调用时，要有一个小程序把请求转过去，并给回答加上允许跨域读取的响应头。页面请求的地址是 `<代理地址>/<完整的接口地址>`。代理能看到你的密钥，只用你自己部署的。仓库里为另一个项目写的 [tianxia/ai-proxy.mjs](../tianxia/ai-proxy.mjs) 是这种代理的一个例子（它的使用范围以 [LICENSE](../LICENSE) 为准）。
- 不接入 AI 也不影响别的：世界、规则、图表、参数扫描和手册都在本地运行；规则的代码可以自己改（左栏规则下面的“代码与说明”）。

这个页面最初是在 Claude 里运行的；在那里打开时，右栏直接用 Claude，不需要密钥。

### 数据

- 全部计算都在浏览器里完成，页面不上传任何东西。设置和算过的结果存在本机浏览器里（localStorage）。
- 自带 7 段旧行情（GOOG 日线 2004–2008；标普 500、纳斯达克综指、AAPL、MSFT、IBM、AMZN 月线，到 2022 年），只为演示“真实数据”的流程，不保证准确。可以导入自己的 CSV。
- 这是做实验和学习用的工具，页面上的任何结果都不是投资建议。

### 开发

```
strategy-lab/
├── index.html    构建出来的独立网页（上面的网址打开的就是它）
├── build.py      把 src/ 拼成一个文件
├── src/          引擎、内置规则、界面、手册的文字
├── data/         示例行情
└── test/         自动检查
```

```sh
npm install                      # 取 KaTeX 的发行文件；测试另外要用 Playwright
python3 build.py                 # 生成 index.html（以及 dist/ 下在 Claude 里发布用的那一份）
npx playwright install chromium  # 只有跑界面测试才需要
sh test/run-all.sh               # 全部测试，要十几到二十分钟
```

测试分两部分：Node 里对引擎和手册里每个数字的核对（约 2000 项），无头浏览器里的界面检查（约 840 项）。AI 接口的测试用的是本机的一个假服务商，不会向外发请求。单独跑一个：`node test/obs.test.js`、`node test/ui-standalone.js`。

引擎和规则是纯 JavaScript，没有运行时依赖。页面内联了 [KaTeX](https://katex.org) 来排公式（MIT 许可，见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)）；界面字体从 Google Fonts 加载，连不上时用系统字体。

---

## English

### Three layers: game, world, rule

The left column lists them top to bottom.

| Layer | What it is | What is included |
|---|---|---|
| Game | The type of problem: what you see at each step, what you may do, how it is settled and scored | "Trade one asset" (choose a position at every step); ten turn-based games: accept-and-cooldown, the secretary problem, betting on a biased coin, bold play, multi-armed bandits, the newsvendor, the winner's curse, a prop-firm evaluation, A-share trading rules, optimal execution; four observation games: measure a parameter, forecast, detect a change, stop at the maximum |
| World | The distribution or process the data follow | Geometric Brownian motion, mean reversion, jump diffusion, Heston, GARCH, regime switching, AR(1), fractional Brownian motion, the logistic map, the Lorenz system, a noisy oscillator, bundled historical prices, bootstrap; each game also has worlds of its own (the distribution of offers, the type of noise, and so on) |
| Rule | Your policy: an action at each step given what you have seen | 85 built-in rules, each with its assumptions, objective, optimality result, failure modes and a testable prediction; the code can be edited and saved as your own |

Games and worlds are separate so that you can see what happens when an assumption fails: a rule that is provably optimal in one world can lose to a naive one in another.

### Getting started

1. Open the link above. On a first visit, click "手册" (handbook) at the top right, or press `?`, and do the first of the five short experiments.
2. Choose a game, a world and a rule in the left column and drag the parameters; the summary and the charts recompute as you go. One backtest takes tens of milliseconds.
3. "找图表与命令" (`Ctrl K` / `⌘K`) finds charts, worlds, rules and handbook pages by name.
4. After tuning, click "用新路径检验" to see whether the edge survives on paths the rule has not seen.

The handbook covers the rules and origin of every game, how to read every chart, where each rule fits and where it does not, a glossary, and the known results for each game (definitions, theorems, proof sketches, references).

### The numbers are computed on your machine

- The **comparison table** (every built-in rule × every world or scenario, 701 cells) is not shipped with the page. It is computed locally by background threads the first time you open it, cell by cell, and cached in the browser.
- Underlined numbers in the handbook text are computed the same way.
- The handbook's **self-check** page lists 65 statements that a computation can decide (does a simulated number match its formula; is one rule significantly better than another in a given world) and checks them one by one on your machine.
- The same random seed always gives the same paths, so every result can be reproduced.

### The AI assistant

The right-hand panel lets an AI turn a one-line idea into a rule (code, parameters and a note on optimality, loaded and backtested automatically), write a new world, bring up the right charts, or explain the result in front of you. On this web page it runs on **your own API key**. You can choose:

| Provider | Default model | Callable directly from the page? | Notes |
|---|---|---|---|
| DeepSeek | deepseek-v4-pro | Yes | |
| ChatGPT (OpenAI) | gpt-6-sol | Yes | A ChatGPT subscription does not include API usage; the API is billed separately |
| Kimi (Moonshot AI) | kimi-k3 | Yes (both the China and the international site) | Keys are not interchangeable between the two sites; pick the right one in the settings |
| Doubao (Volcengine Ark) | doubao-seed-2-1-pro-260915 | **No: needs a forwarding proxy** | Activate the model in the Ark console first; an endpoint ID (ep-…) also works |
| Other | yours | Depends on the provider | Any OpenAI-compatible Chat Completions API, including a local Ollama or LM Studio |

To connect: click "AI" at the top right, then "接入 AI…", choose a provider, paste your key, click "测试连接" and, once it answers, "保存". Model names change quickly; if the provider does not recognise the model, "获取模型列表" fetches the current list.

- **"Callable directly from the page" was measured on 9 October 2026**, from a page at this address, by sending each API a request with an invalid key. The page could read the "invalid key" replies of DeepSeek, OpenAI and Kimi, so they accept calls from web pages; the reply from Volcengine Ark was blocked by the browser's cross-origin rules (CORS). A full conversation with a real key was not tested.
- **Your key stays in your browser.** It is kept in localStorage, and requests go straight from the browser to the provider you chose (or to your forwarding proxy), never through this site. Other pages on the same domain can technically read it, so click "清除密钥" when you are done on a shared computer.
- **Cost** is billed by the provider to your account. Writing one rule sends roughly five thousand characters and receives a few thousand.
- **Forwarding proxy** (under "高级" in the settings): when a provider blocks calls from web pages, a small relay has to pass the request on and add the response headers that let the page read the reply. The page requests `<proxy address>/<full API URL>`. The proxy sees your key, so use only one you deployed yourself. [tianxia/ai-proxy.mjs](../tianxia/ai-proxy.mjs), written for another project in this repository, is an example of such a relay (what it may be used for is governed by the [LICENSE](../LICENSE)).
- Everything else works without an AI: worlds, rules, charts, parameter sweeps and the handbook all run locally, and you can edit a rule's code yourself under "代码与说明" below the rule in the left column.

The page was first built to run inside Claude; opened there, the panel uses Claude directly and needs no key.

### Data

- All computation happens in the browser and nothing is uploaded. Settings and computed results are kept in the browser's localStorage.
- Seven bundled historical price series (GOOG daily 2004–2008; S&P 500, Nasdaq Composite, AAPL, MSFT, IBM and AMZN monthly to 2022) are there only to demonstrate the real-data workflow; their accuracy is not guaranteed. You can import your own CSV.
- This is a tool for experiments and learning. Nothing on the page is investment advice.

### Development

```sh
npm install                      # fetches the KaTeX distribution files; the tests also use Playwright
python3 build.py                 # writes index.html (and the build for publishing inside Claude, under dist/)
npx playwright install chromium  # only needed for the browser tests
sh test/run-all.sh               # the whole suite, about fifteen to twenty minutes
```

The tests come in two parts: checks in Node of the engine and of every number quoted in the handbook (about 2,000), and browser checks in headless Chromium (about 840). The AI-interface tests talk to a mock provider on localhost and send nothing outside. To run one file: `node test/obs.test.js`, `node test/ui-standalone.js`.

The engine and the rules are plain JavaScript with no runtime dependencies. The page inlines [KaTeX](https://katex.org) for typesetting (MIT licence, see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)); interface fonts load from Google Fonts and fall back to system fonts when unreachable.

---

## 版权 / Copyright

© 2026 Zechen Bian. 保留所有权利 / All rights reserved.

本项目**不是开源项目**。可以在线使用，但未经书面许可，不得复制、修改、再分发、商用或用于 AI/机器学习训练。详见 [LICENSE](../LICENSE)。页面里内联的 KaTeX 是第三方软件，按它自己的 MIT 许可使用，见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

This project is **not open source**. You are welcome to use it online, but you may not copy, modify, redistribute, use commercially, or use it to train AI/ML models without written permission. See [LICENSE](../LICENSE). KaTeX, which is bundled in the page, is third-party software under its own MIT licence; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Built with Claude.
