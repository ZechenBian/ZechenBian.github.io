# 策略实验室 · Strategy Lab

[中文](#中文) · [English](#english)

在浏览器里自己做量化实验的地方：选一种玩法、一个世界，定一条规则，让它在成百上千条模拟路径（或对局）上各跑一遍，看结果的分布，再和理论值对照。单个网页文件，全部在本机计算，不用登录、不用安装。

A place to run quantitative-strategy experiments in the browser: pick a game, a world and a rule, run the rule over thousands of simulated paths (or rounds), and read the distribution of outcomes against the theory. One web page, everything computed on your own machine, no sign-in and nothing to install.

**▶ 在线打开（中文）:** https://zechenbian.github.io/strategy-lab/

**▶ Open online (English):** https://zechenbian.github.io/strategy-lab/en/

**▶ 青少年版（给中学生，中文）:** https://zechenbian.github.io/strategy-lab/teen/

**▶ 机器学习实验室（中文）/ Machine Learning Lab (in Chinese):** https://zechenbian.github.io/strategy-lab/ml/

**▶ 数据分析案例（中文）/ Data analysis case studies (in Chinese):** https://zechenbian.github.io/strategy-lab/cases/

页面右上角的按钮在中文和英文之间切换，切换后当前的玩法、世界、规则和参数都还在。The button at the top right switches between Chinese and English and keeps the current game, world, rule and parameters.

---

## 中文

### 三层：玩法、世界、规则

左栏从上到下就是这三层。

| 层 | 是什么 | 有哪些 |
|---|---|---|
| 玩法 | 题目的类型：每一步看到什么、能做什么、怎么结算、怎么计分 | “交易一个资产”（每一步定仓位）；十套回合制玩法：接单与冷却、秘书问题、偏硬币下注、翻倍或出局、多臂老虎机、报童问题、赢家诅咒、自营考核、A 股交易制度、大单拆分执行；四套观测玩法：测量参数、预测、变点检测、停在最高点；三套量子玩法：Bell 游戏、量子搜索、炸弹检测 |
| 世界 | 数据服从的分布或过程 | 几何布朗运动、均值回复、跳跃扩散、Heston、GARCH、牛熊切换、AR(1)、分数布朗运动、Logistic 映射、洛伦兹系统、带噪谐振子、自带的旧行情、Bootstrap；各套玩法还有自己能换的世界（报价的分布、噪声的类型、光子从哪里来……） |
| 规则 | 你的做法：每一步看到信息之后给出一个动作 | 100 条内置规则，每条写明假设、目标、最优性结论、什么时候失效、可以检验的预测；代码可以直接改、另存 |

把玩法和世界分开，是为了看“假设错了会怎样”：一条规则在一个世界里可证最优，换一个世界可以输给朴素的做法。

### 怎么开始

1. 打开上面的网址。第一次来，点右上角的“大厅”，从“新手教程”开始；或者点“手册”（也可以按 `?`），先做“五个小实验”里的第一个，两三分钟。
2. 左栏选玩法、世界和规则，拖动参数；中间的结果栏和图表跟着重算。一次回测只要几十毫秒。
3. “找图表与命令”（`Ctrl K` / `⌘K`）按名字找图表、世界、规则和手册条目。
4. 调过参数之后点“用新路径检验”，看优势在没见过的数据上还在不在。

手册里有每套玩法的细则与来历、每张图怎么读、每条规则适合和不适合的场景、名词表，以及各套玩法已知的结论（定义、定理、证明的梗概、出处）。

### 亲手玩一局

接单与冷却、秘书问题、偏硬币下注、多臂老虎机这四套，除了让规则去打，也可以自己上手：在“玩法”一栏点“亲手玩一局”。

- 一局缩短到人打得动的长度（几十回合；偏硬币下注也可以原样打实验里的 300 次），分布、目标、概率这些设定跟左栏走。
- 每一回合你看到的，和规则在这一回合能读到的一样多。裁判藏着的东西（全场谁最好、各台真实的中奖率、后面还有什么报价）打完才揭晓。
- 打完之后，同一局交给各条参照规则各打一遍，和你并排列出来；旁边是它们在几千局上的长期平均，以及理论值。
- 多打几局，页面会给出你和先拿来比的那条参照规则（理论上最好的那条；没有现成最优解时取长期平均最高的）在同样几局上的平均差和它的标准误。差距不到 2 倍标准误，就还分不出是打法好还是运气好。
- 成绩只存在这台设备的浏览器里。同一个种子下第 k 局永远是同一局，所以规则在你打过的那几局上的成绩随时可以重算。

### 量子玩法与电路谜题

三套量子玩法里，量子力学只在裁判手里：规则看不到量子态，只能通过裁判给的几种动作去碰它（测一个光子、让量子计算机再转一步、送光子走一圈），测量的结果由裁判按量子力学的概率去抽。每一套都带一条“经典的做法最多能做到多好”的定理，看量子的做法能越过多少。

| 玩法 | 题目 | 经典的做法 | 量子的做法 |
|---|---|---|---|
| ⑮ Bell 游戏 | 两人不能通气，各收到一个比特、各答一个比特，两人都收到 1 时要答得不同（CHSH） | 胜率不超过 75%（Bell–CHSH 不等式） | 共享纠缠光子、按标准角度测，85.36%（Tsirelson 界）。纠缠的可见度、局部隐变量源、一局多少回合都能调 |
| ⑯ 量子搜索 | N 个盒子里找奖品，每次查询决定再转一步还是现在测（Grover） | 不重复地查，平均 (N+1)/(M+1) 次 | 约 0.69√(N/M) 次。奖品数不知道、每步会退相干时各有各的做法 |
| ⑰ 炸弹检测 | 挑出真炸弹，又不能把它引爆（Elitzur–Vaidman） | 要知道就得碰，碰了就炸 | 量子芝诺效应：分的步数越多，越接近 100% 完好地确认；光路会丢光子时，用倒推选步数 |

大厅里的**量子电路谜题**是十关、一个人玩的谜题：相对相位、换基、纠缠、三次异或、Deutsch 算法、不碰炸弹、四选一、超密编码、隐形传态、打破 75%。点格子放门，看振幅和 Bloch 球怎么变，点“检验”把每一种情形跑一遍，按做得多好给一到三星。它和三套量子玩法用的是同一个模拟器：“不碰炸弹”“四选一”“打破 75%”这三关做完，可以把电路里的设定（炸弹的个数、拨好的四个角度）直接带到对应的玩法里，让规则跑几千局；反过来，三套玩法在“玩法”一栏里有“电路谜题”按钮，回到对应的那一关。进度存在这台设备的浏览器里；地址里写 `#quantum`（或 `#quantum=bomb` 这样带上关卡）直接打开。

### 大厅：和别人一起玩

右上角的“大厅”里有八样东西（量子电路谜题见上一节）。页面仍然没有自己的服务器：要给别人看的东西，是这个仓库里公开的 Issue；实时房间走公共的 MQTT 中继；每日一题的题目是这个仓库里的文件，交上来的规则是加密的，截止之后由这个仓库的 GitHub Actions 解开、算分，结算用的随机数取自公共的随机信标 drand。

| | 做什么 | 凭什么可信 |
|---|---|---|
| 新手教程 | 八步，每步两三分钟；每一步有一个按钮带你去那个地方，做完点左下角回到教程 | |
| 每日一局 | 全站每天同一局（按 UTC 换日，四套能亲手打的玩法轮着来），打完看自己排在哪 | 贴上榜的是你每一步的动作，不是分数；每个看榜的人在自己的浏览器里照着动作重放 |
| 每日一题 | 每天一道新题：一个带裁判的小游戏，大家各写一条规则来解。先在公开的几组数据上随便试，再封起来（加密）交上去，别人看不到你的代码；截止（UTC 24 点）之后换另外几组数据结算、排名 | 结算的数据由 drand 在截止之后发布的随机数决定，截止之前没有人知道是哪几组。算分的是这个仓库里自动运行的结算程序；别人的成绩你没法验算，基准规则和你自己交的那一条，页面会在你的浏览器里重算一遍来核对 |
| 实时房间 | 最多八个人同时打同一局，只看得到彼此打到第几回合，打完一起揭晓 | 先交“封条”（动作的 SHA-256），人都交齐了再亮动作；和封条对不上的作废 |
| 十项全能 | 一条规则走遍十个世界，每个世界里和买入持有比长期增长率，按最差的一项计分；每周一换种子 | 榜上的每条规则都在你的浏览器里现跑一遍 |
| 规则同场 | 几条规则在同一个市场里互相当对手：共同价值拍卖（第一价格 / 第二价格），或者一起做市 | 自带的规则有闭式的理论值可以对照 |
| 世界工坊 | 自己造世界（一段生成价格的代码）和玩法（一个发牌、亮牌、判分的裁判），造好了贴出来，别人载入之后拿自己的规则来试 | |
| 量子电路谜题 | 十关，一个人玩，见上一节 | |

- **贴东西要一个 GitHub 账号。** 点“贴到 GitHub”，页面把内容填进一条新 Issue，你在 GitHub 上点提交。帖子是公开的，署你的用户名；想撤回，把那条 Issue 关掉。只是看榜不需要账号（GitHub 对不登录的访问限每小时 60 次，超了会让你过一会儿再刷新）。
- **别人写的代码一律在隔离环境里运行。** 具体是一个不带同源权限的沙盒页面里的后台线程，内容安全策略禁掉所有网络请求：它读不到这张页面、你的存档和密钥，也发不出任何东西。从榜上、工坊里载入的规则和世界，拿到实验室里用时同样如此。
- **防得了什么，防不了什么。** 亲手打的榜防不了“先把整一局看完，再回头选动作”（种子是公开的），所以只图个乐。规则同场和工坊里，裁判和几条规则编在同一个线程里，互相之间没法做到完全隔绝；有别人的代码在场时，页面会提醒这个结果只图个乐。数据安全靠的是隔离环境，不受这一条影响。每日一题结算时规则和裁判也在同一个环境里：已知的路都堵上了，但别人看不到代码，没法靠大家的眼睛，所以那个榜同样只图个乐。
- **实时房间**的昵称、进度和动作会经过公共中继（broker.emqx.io、broker.hivemq.com、mqtt.eclipseprojects.io），不需要账号；有的网络连不上它们。
- **每日一题**的题目每周出一批，是 [daily/](daily/) 里的数据文件，页面运行时才去取，所以加题不用重新构建；题目的格式、校验脚本、出题和审题的流程见 [daily/README.md](daily/README.md)。交上去的规则先在你的设备上加密，贴到 GitHub 上的只有密文：别人看得到你交了、什么时候交的，看不到规则的名字、参数和代码。截止之后，[结算的工作流](../.github/workflows/strategy-lab-quest.yml)拿仓库 Secrets 里的私钥把每条规则解开，各自放进没有网络的容器里算分，公布成绩和规则的名字，不公布代码；截止之后改过帖子的作废。私钥在仓库的主人手里，他技术上解得开所有人的规则。这张页面从不运行别人为每日一题写的代码。保密和结算的细节、仓库的主人要做的事，也在 [daily/README.md](daily/README.md) 里。离线的副本里没有每日一题。
- 不会写代码也能写规则：每日一题、规则同场和世界工坊里都有“复制给 AI 的说明”，把接口和要求复制下来，贴给任何一个 AI，再把它回的代码贴回来。

### 青少年版

[teen/](teen/) 是另一张单独的页面，给中学生用，只有中文：七个“在不确定的情况下做决定”的小游戏（猜硬币、掷骰子见好就收、卖西瓜、三台抽卡机、找最大的数、奶茶店进货、停车），每个十几回合，手机上就能打。顺序是三步：先亲手打一局，打完立刻看到三条简单的规则在同一局上得了多少分、每一回合是怎么选的；然后学编程的基本思想（七课，每课一段能跑的代码和一个“改一改”）和算法的基本思想（七个想法：数一数、跟着反馈调、探索与利用、从后往前想、算期望值、看情况定门槛、怎么比较两条规则，每个都能跑一个几百局的实验）；最后从填空开始写自己的规则，在固定的 200 局上和基准规则比。另有一页给老师和家长：两种 45 分钟的上法、班级比赛怎么办、对应的知识点。

它用的是实验室的引擎（裁判、规则、隔离环境都是同一份代码），但去掉了所有和投资有关的内容，游戏里的分数就是分数。页面打开之后不再联网、不要账号、没有排行榜服务器：进度、成绩和写的代码只存在这台设备的浏览器里。学生的代码在隔离环境里跑，死循环会被掐掉。游戏是数据文件（[src/teen/games.js](src/teen/games.js)），每个由题面、裁判、几条带讲解的基准规则、填空的起始代码和“这题背后的想法”组成，加游戏不用动界面。

### 机器学习实验室

[ml/](ml/) 是另一张单独的页面（中文），在浏览器里做机器学习实验，流程是 任务 → 数据 → 算法 → 反馈：

- **四类任务、38 个数据集。** 表格（回归、分类：两个半月、螺旋、棋盘格、稀疏线性……以及 UCI 的鸢尾花、葡萄酒、乳腺癌）、时间序列（随机游走、AR(2)、季节、机制切换、logistic 映射、Lorenz、Mackey–Glass、GARCH，以及七条真实行情）、图像与格点（二维伊辛模型、手写数字、几何形状、逾渗）、科研玩具（模加法的顿悟、有限群的乘法、稀疏奇偶、集合函数、老师–学生网络）。模拟的数据都知道真实规律，所以每个结果旁边都有“理论最优”或贝叶斯最优可比。每个数据集都标着“模拟数据”“真实数据”“你导入的数据”或“从网上取的数据”。
- **自己的数据，或者从网上取。** 可以导入自己的 CSV；也可以点“从网上取…”：用一句话描述想要的数据，你接入的 AI 给出几个数据文件的地址，页面逐个去取，取到能用的就预览、确认后导入；也可以直接填网址，或者从二十个地址核实过的现成真实数据（标普 500、VIX、原油、黄金、美债收益率、CPI、房价指数、CO₂、气温、汇率、企鹅、泰坦尼克、钻石……）里挑。能读 CSV、TSV、JSON、JSON Lines 和它们的 .gz / .zip；浏览器读不到的网站（跨域限制）会请本机引擎去取（只取公网地址）。
- **24 个内置算法**，从岭回归、Lasso、逻辑回归、朴素贝叶斯、LDA/QDA、k 近邻、决策树、随机森林、梯度提升、高斯过程、随机傅里叶特征、支持向量机，到多层感知机、卷积网络、嵌入 + MLP、单层 Transformer；时间序列有季节朴素、漂移、AR、指数平滑（Holt–Winters）、卡尔曼、滞后特征 + 梯度提升、滞后窗口 MLP、回声状态网络。每个都附有可以改的代码和带公式、定理与证明梗概的说明。神经网络用页面里的一个自动求导小库（[src/ml/nn.js](src/ml/nn.js)）。
- **在 Claude 里打开。** 同一张页面也发布成了 Claude 里的 Artifact（`python3 build.py` 生成的 `dist/ml-lab.html`，声明“页面可以问 Claude”的能力）。在那里右栏的 AI 就是打开页面的人自己的 Claude：不用密钥，用的是自己 Claude 账号的额度，第一次调用时 Claude 会先问你允不允许。那里页面不能自己联网，但可以请 **Claude 桌面版**替它做（每次都要你允许）：把本机引擎作为本地 MCP 服务器加进桌面版的设置（`python -m mllab_engine --claude-config` 打印要加的那一段，见 [ml-engine/README.md](ml-engine/README.md)），就能在 Claude 里跑 Python 算法、经引擎从网上取数据；没接引擎时，从网上取数据用桌面版自带的浏览器（只能取不压缩的文本文件，最多约 200 万个字符）。这些只在 Claude 桌面版里有。
- **AI 写算法。** 右栏接入你自己的 AI（和策略实验室共用同一份设置）：写算法（写成符合接口的代码，自动存下并运行）、诊断（把训练与验证的差距、学习曲线、基线、理论最优、混淆矩阵、特征重要性交给它，要一份报告）、自动改进（写改进版 → 运行 → 只按验证集决定换不换，重复几轮）、问结果。发给 AI 的内容里没有测试集的答案。
- **几种反馈。** 学习曲线、决策面、预测对实际、混淆矩阵、ROC、校准曲线、置换重要性；模型内部（权重、系数、树、嵌入的主成分和傅里叶谱、按群的不可约表示分解、伊辛模型读出的交叉温度）；训练过程的快照回放；排行榜：同一个实验里的所有运行在同一批样本上做配对检验（McNemar、配对自助法、Diebold–Mariano），Holm 校正，并提示“挑出来的第一名偏乐观”。测试集默认遮住，点一下才揭晓，并记下看了几次。
- **动画与模拟。** 伊辛模型的实时 Metropolis / Wolff 模拟和扫温度，逾渗的团簇与连通概率，时间序列的滚动预测；教学动画：五种优化器在病态二次型、Rosenbrock、鞍点上赛跑，偏差–方差分解，双下降。
- **手册**（按 ? 打开）：每类任务、每个数据集、每个算法、每张图、每种检验都有一页，另有几篇理论（泛化、偏差与方差、双下降、顿悟、等变性、时间序列、相变）。
- **本机 Python 引擎（可选）。** [ml-engine/](ml-engine/) 是一个只用标准库和 numpy 的小程序，在你自己的电脑上运行（有 PyTorch 时用 PyTorch，苹果芯片上用 MPS）。`python -m mllab_engine` 启动后，用它打印的 `http://127.0.0.1:端口/ml/?engine=令牌` 打开页面，算法列表里就多了 Python 写的算法。它只监听本机，每次启动换一个随机令牌；页面只把训练集、验证集和测试集的输入发过去，拿回原始的预测，打分仍在页面里做（和浏览器里的算法同一段代码）。安装和安全须知见 [ml-engine/README.md](ml-engine/README.md)，接口见 [ml-engine/PROTOCOL.md](ml-engine/PROTOCOL.md)。

全部在浏览器里本地运行，算法在隔离的后台线程里训练，别人写的代码（包括 AI 写的）碰不到页面和网络。设计文档在 [src/ml/DESIGN.md](src/ml/DESIGN.md)。

### 数据分析案例

[cases/](cases/) 是另一张单独的页面（中文）：几个完整的数据分析例子，每个都按同样的八步走一遍——定义问题、数据从哪来、清洗与探索、baseline、特征、模型、验证、局限与迭代。每一步的数字、表格和图都是打开页面时在浏览器里现算的，改控件会重算。

| 案例 | 数据 | 讲的事 |
|---|---|---|
| 共享单车：下一小时会有多少人租车 | 真实：华盛顿特区 Capital Bikeshare 2011–2012 年逐小时的租车量和天气（UCI） | 缺的小时不是 0（三段长的缺失对上了暴风雪和两次飓风）；增长让历史平均失效；计数数据用 Poisson 回归、过度离散；`registered + casual = cnt` 的泄漏；随机切分与按时间切分 |
| 车桩：没车的时候，需求去哪了 | 模拟：一个站点的取车、还车按 Poisson 过程到达，没车时取不到，知道真实需求 | 观测到的成交是删失的需求；直接平均和“扔掉缺车的小时”都偏低；用有车的时间做 Poisson 的暴露量来修正，以及它在什么时候还会偏；不知道真相时怎么检验修正；早上补几辆车（成本不对称时的分位数决策） |
| 房价：从一张成交表到一个可信的模型 | 真实：艾奥瓦州埃姆斯市 2006–2010 年的 2930 笔住宅成交（De Cock 2011） | 为什么取对数；非市场交易与 5 套超大的房子；NA 的两种意思；“控制面积后卧室数的系数为负”；方差膨胀因子；异方差与稳健标准误；复制数据制造的虚假显著；随机、按时间、按街区三种切法 |
| 标普 500：价格好预测，收益难预测 | 真实：Robert Shiller 整理的 1871 年以来的月度数据 | 价格水平的 $R^2$ 没有意义；原文件把缺失写成 0；月均价制造约 0.25 的假自相关（Working 1960，模拟与推导）；重叠的长期收益让 t 值虚高（Newey–West）；样本外 $R^2$；一百个噪声信号里挑出“显著”的 |

每个案例的开头写着它对应的面试题，结尾是面试官会追问的问题和回答。“在机器学习实验室里继续”把案例整理好的那张表交给机器学习实验室（同一个网站，数据只存在这台电脑的浏览器里），那边打开时直接选中它，可以换各种算法；也可以下载成 CSV。

[cases-ask/](cases-ask/) 是同一份案例做成的**样本**（还没有并进正式页面）：选中几个字，或者按住 Alt 拖一个框（文字、公式、表格、图上的一段都可以），就地问 AI；回答以批注的形式插在被问的地方，回答里还能接着选、接着框、接着问，一层套一层。在 Claude 里打开时用打开页面的人自己的 Claude，独立网页里用使用者自己的密钥（和策略实验室共用同一份设置，见 `src/ai.js`）；批注只存在这台电脑的浏览器里。批注层的源码在 `src/ask/`（`ask.js` 是通用的部分，`cases.js` 是这张页面的适配），普通的 `cases/` 不受影响。

页面打开之后不再联网（界面字体除外），不要账号。案例是数据文件（`src/cases/case-*.js`）：每一步是一个往页面里写文字、表格、图和控件的函数，算的部分（`compute`）不碰页面，测试直接调用。三份真实数据为了嵌进页面重新编码过，数值不变，来源与许可见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

### 数字是在你的电脑上现算的

- **对照表**（每条内置规则 × 每个世界或场景，共 796 格）不写在页面里：第一次打开时用后台线程在本机算，算出一格显示一格，结果存在浏览器里，下次直接读。
- 手册正文里带下划线的数字同样是现算的。
- 手册的**“自检”**一页列出 78 条可以用计算判对错的话（某个公式给出的数和模拟出来的对不对得上，某条规则在某个世界里是不是显著更好），在本机逐条算、逐条判。
- 同一个随机种子永远得到同一批路径，所以任何结果都可以复现。

### 右栏的 AI 助手

右栏可以让 AI 把一句话的想法写成规则（给出代码、参数和最优性的说明，写完自动载入并回测）、造一个新的世界、把合适的图调出来、解释眼前的结果。在这个网页上它用的是**你自己的 API 密钥**，可以选：

| 服务商 | 默认模型 | 能不能从网页直接调用 | 备注 |
|---|---|---|---|
| Claude（Anthropic） | claude-opus-5-5 | 可以（Anthropic 的接口支持网页直接调用，页面会带上它要求的请求头） | Claude 的会员订阅（Pro、Max）不包含 API 用量，API 要在 platform.claude.com 另外开通；做小事用 claude-haiku-5-5 |
| DeepSeek | deepseek-v4-pro | 可以 | |
| ChatGPT（OpenAI） | gpt-6-sol | 可以 | ChatGPT 的会员订阅不包含 API 用量，API 要另外开通 |
| Kimi（月之暗面） | kimi-k3 | 可以（国内站、国际站都可以） | 两个站点的密钥不通用，设置里要选对站点 |
| 豆包（火山方舟） | doubao-seed-2-1-pro-260915 | **不可以，要经转发代理** | 模型要先在方舟控制台开通；也可以填 ep- 开头的接入点编号 |
| 其他 | 自己填 | 看服务商 | 任何兼容 OpenAI Chat Completions 的接口；本机的 Ollama、LM Studio 也算 |

怎么接入：点右上角的“AI”，再点“接入 AI…”，选服务商、填密钥，点“测试连接”，通了就“保存”。模型的名字变得很快，报“不认识这个模型”时点“获取模型列表”换一个。

- **“能不能从网页直接调用”是 2026 年 10 月 9 日实测的**：在这个网址的页面上，用一把无效的密钥向各家的接口发请求。DeepSeek、OpenAI、Kimi 的“密钥无效”能被页面读到，说明它们允许网页调用；火山方舟的回答被浏览器的跨域限制（CORS）拦下。没有用真实的密钥测过完整的对话。Claude 是后来加的，这一项没有在这个网址上实测，依据的是 Anthropic 的说明（请求头 `anthropic-dangerous-direct-browser-access`）；Claude 走它自己的 Messages 接口，不是 OpenAI 兼容的那一种。
- **接的是 Claude 时，机器学习实验室“从网上取数据”里的 AI 会真的上网搜索**（Anthropic 那边的 web_search 工具，每次最多搜 5 次，搜索按次另外计费），再从搜到的页面里挑数据文件的地址。组织的管理员关掉了网络搜索时，页面会说明，并退回凭记忆给地址。
- **密钥只在你的浏览器里**：保存在本机浏览器（localStorage），请求从浏览器直接发给所选的服务商（或者你填的转发代理），不经过本站。和本站同一个域名下的其他页面在技术上也读得到它，所以在公用电脑上用完请点“清除密钥”。
- **费用**由服务商按你的账号计。写一条规则大约发送五千字、收回几千字。
- **转发代理**（设置里的“高级”）：服务商不允许网页直接调用时，要有一个小程序把请求转过去，并给回答加上允许跨域读取的响应头。页面请求的地址是 `<代理地址>/<完整的接口地址>`。代理能看到你的密钥，只用你自己部署的。仓库里为另一个项目写的 [tianxia/ai-proxy.mjs](../tianxia/ai-proxy.mjs) 是这种代理的一个例子（它的使用范围以 [LICENSE](../LICENSE) 为准）。
- 不接入 AI 也不影响别的：世界、规则、图表、参数扫描和手册都在本地运行；规则的代码可以自己改（左栏规则下面的“代码与说明”）。

这个页面最初是在 Claude 里运行的；在那里打开时，右栏直接用 Claude，不需要密钥。

### 数据

- 全部计算都在浏览器里完成，页面自己不上传任何东西。会离开这台设备的只有这几样：你在大厅里点“贴到 GitHub”并在 GitHub 上提交的内容（每日一题交的是加密过的一份）；实时房间里的昵称、进度和动作；用 AI 助手时发给服务商的提示词（分别见上面“大厅”和“右栏的 AI 助手”两节）。看榜时页面只是向 GitHub 读取公开的帖子；每日一题向本站取当天的题目和加密用的公钥，看结算时向 drand 的公共服务器（api.drand.sh、api2.drand.sh、api3.drand.sh、drand.cloudflare.com）取一个公开的随机数，这几样请求都不带你的任何内容。设置、算过的结果、每日一题的草稿和你交过的那一份的原文存在本机浏览器里（localStorage）。
- 自带 7 段旧行情（GOOG 日线 2004–2008；标普 500、纳斯达克综指、AAPL、MSFT、IBM、AMZN 月线，到 2022 年），只为演示“真实数据”的流程，不保证准确。可以导入自己的 CSV。
- 这是做实验和学习用的工具，页面上的任何结果都不是投资建议。

### 开发

```
strategy-lab/
├── index.html    构建出来的独立网页，中文（上面的网址打开的就是它）
├── en/index.html 构建出来的独立网页，英文
├── teen/index.html 构建出来的青少年版（中文）
├── ml/index.html 构建出来的机器学习实验室（中文）
├── cases/index.html 构建出来的数据分析案例（中文）
├── cases-ask/index.html 数据分析案例 · 框选提问的样本
├── build.py      把 src/ 拼成一个文件
├── src/          引擎、内置规则、界面、手册的文字（只有一份，中文）；大厅的几样东西也在这里（hub.js 读写 GitHub，mq.js 是实时房间的中继，sandbox.js 是隔离环境）
├── src/teen/     青少年版：七个小游戏、两组课、它自己的界面和样式
├── src/ml/       机器学习实验室：数据集、算法、自动求导、统计检验、运行器、界面、手册、动画（设计见 src/ml/DESIGN.md）
├── src/cases/    数据分析案例：三份真实数据、一个车桩模拟器、回归与 Poisson 回归等数值工具、四个案例、界面
├── src/ask/      框选提问的批注层（样本，只进 cases-ask/）
├── ml-engine/    机器学习实验室的本机 Python 引擎（可选）
├── i18n/         英文版：译文表和生成工具
├── data/         示例行情
├── daily/        每日一题的题目（数据，页面运行时才取）、校验脚本、结算的程序、出题和审题的流程
└── test/         自动检查
```

```sh
npm install                      # 取 KaTeX 的发行文件；英文版的生成工具要用 acorn，测试要用 Playwright
python3 build.py                 # 生成 index.html、en/index.html、teen/index.html、ml/index.html、cases/index.html 和 cases-ask/index.html（以及 dist/ 下在 Claude 里发布用的那一份）
npx playwright install chromium  # 只有跑界面测试才需要
sh test/run-all.sh               # 全部测试，要半个多小时
```

**英文版是怎么来的。** 源码只有一份，是中文的。构建时 [i18n/i18n.js](i18n/i18n.js) 把源码里每一段给人看的中文（界面上的字、手册、规则的说明、规则代码里的注释、发给 AI 的提示词，一共六千多段）换成 [i18n/en/](i18n/en/) 里的译文，代码本身一个字不动，所以两种语言跑的是同一套计算：同样的设定下结果逐位相同，现算的缓存也是共用的。译文入库时逐段自动核对：公式、现算的数字标记、代码必须和原文一致，占位符不能多也不能少。改了源码里的中文而没有补译文，构建会失败并指出是哪一段。细节见 [i18n/README.md](i18n/README.md)。

测试分两部分：Node 里对引擎和手册里每个数字的核对（约 2800 项），无头浏览器里的界面检查（约 1500 项）。AI 接口的测试用的是本机的一个假服务商，大厅的测试把 GitHub 和 drand 换成本机的假数据、把中继换成本机的假中继，都不会向外发请求。每日一题的结算程序在测试里是直接调用的：私钥是测试自己造的，容器换成子进程，所以容器那一层只在 GitHub Actions 上实际运行时才用得上。青少年版的测试（`node test/teen.test.js`、`node test/ui-teen.js`）把讲解里写的每个数拿精确计算去对，把七个游戏按最简单的办法亲手打一遍、核对得分和对应的基准规则一模一样，并核对页面打开之后没有任何对外的请求。量子玩法的测试（`node test/quantum.test.js`）核对模拟器本身、十关谜题的参考解都拿三星、电路算出的数和 Bell、Grover、量子芝诺的公式一致、三套玩法模拟出来的数和理论值一致，以及手册里引用的每个数；`node test/ui-quantum.js` 在无头浏览器里点格子把几关做出来，再把设定带回玩法。别人写的代码那一部分是真测：测试里放了会联网、会改内置对象、会去动别人成绩的规则和裁判，核对它们一样也办不到。英文版的测试（`node test/ui-en.js`，大厅的那几样在 `node test/ui-en-lobby.js`）把页面的每一处走一遍：每个世界、每套玩法、每条规则、每张图、手册的每一页，页面上不能出现汉字；并核对两种语言算出来的数相同。机器学习实验室的测试：Node 里的统计检验、自动求导（逐个运算做梯度检查）、38 个数据集（理论最优、贝叶斯最优与独立计算对照）、24 个算法（在每类声称适用的数据上跑通并达到质量下限）、动画背后的数值和手册里引用的每个数，约 1700 项；`node test/ui-ml.js` 在无头浏览器里把每个数据集跑一遍，走一遍各视图、代码编辑、导入 CSV、手册和 AI 面板的四种用法（本机的假服务商）；`node test/ui-ml-engine.js` 起一个真的本机引擎，用 numpy 写的示例算法跑通，并核对没有令牌、别的来源都调不了它；引擎自己的单元测试是 `cd ml-engine && python3 -m unittest`。数据分析案例的测试：`node test/cases.test.js` 核对三份数据解码后和原文件一致（例如共享单车两年合计 3,292,679 次）、数值工具对得上闭式解和模拟、每个案例的关键数字和一份独立的 numpy 计算一致，以及正文里每一句“谁比谁大、符号是什么”在当前数据上成立；`node test/ui-cases.js` 在无头浏览器里把四个案例的每一步渲染出来，点控件、换种子、手机宽度、把数据交给机器学习实验室；`node test/ui-cases-ask.js` 测框选提问的样本：框住图上的一段、在回答里接着问到第 3 层、层数过滤、换控件和换案例以后批注挂回原处、删除连同嵌在里面的一起删，以及独立网页里接入本机的假服务商以后能问。单独跑一个：`node test/obs.test.js`、`node test/ui-standalone.js`。

引擎和规则是纯 JavaScript，没有运行时依赖。页面内联了 [KaTeX](https://katex.org) 来排公式（MIT 许可，见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)）；界面字体从 Google Fonts 加载，连不上时用系统字体。

---

## English

### Three layers: game, world, rule

The left column lists them top to bottom.

| Layer | What it is | What is included |
|---|---|---|
| Game | The type of problem: what you see at each step, what you may do, how it is settled and scored | "Trade one asset" (choose a position at every step); ten turn-based games: accept-and-cooldown, the secretary problem, betting on a biased coin, bold play, multi-armed bandits, the newsvendor, the winner's curse, a prop-firm evaluation, A-share trading rules, optimal execution; four observation games: measure a parameter, forecast, detect a change, stop at the maximum; three quantum games: the Bell game, quantum search, bomb testing |
| World | The distribution or process the data follow | Geometric Brownian motion, mean reversion, jump diffusion, Heston, GARCH, regime switching, AR(1), fractional Brownian motion, the logistic map, the Lorenz system, a noisy oscillator, bundled historical prices, bootstrap; each game also has worlds of its own (the distribution of offers, the type of noise, where the photons come from, and so on) |
| Rule | Your policy: an action at each step given what you have seen | 100 built-in rules, each with its assumptions, objective, optimality result, failure modes and a testable prediction; the code can be edited and saved as your own |

Games and worlds are separate so that you can see what happens when an assumption fails: a rule that is provably optimal in one world can lose to a naive one in another.

### Getting started

1. Open the link above. On a first visit, click "Lobby" at the top right and start with the beginner's tutorial; or click "Handbook" (or press `?`) and do the first of the five short experiments.
2. Choose a game, a world and a rule in the left column and drag the parameters; the summary and the charts recompute as you go. One backtest takes tens of milliseconds.
3. "Find charts & commands" (`Ctrl K` / `⌘K`) finds charts, worlds, rules and handbook pages by name.
4. After tuning, click "Test on fresh paths" to see whether the edge survives on paths the rule has not seen.

The handbook covers the rules and origin of every game, how to read every chart, where each rule fits and where it does not, a glossary, and the known results for each game (definitions, theorems, proof sketches, references).

### Play it yourself

Four games (accept-and-cooldown, the secretary problem, betting on a biased coin, multi-armed bandits) can also be played by hand instead of by a rule: click "Play it yourself" in the "Game" section.

- An episode is shortened to a human scale (a few dozen rounds; the coin game can also be played at the experiment's original 300 flips). The distribution, the objective and the probabilities follow your settings in the left column.
- In every round you see exactly what a rule would be able to read in that round. What the referee keeps hidden (who is best overall, the arms' true win probabilities, the offers still to come) is revealed only when the episode ends.
- When it ends, each reference rule plays the same episode and is listed next to you, together with its long-run average over a few thousand episodes and the theoretical values.
- After several episodes the page reports the average difference between you and the reference rule you are compared with first (the theoretically best one, or the one with the highest long-run average where no optimum is known) on the same episodes, with its standard error. Under two standard errors, skill and luck cannot yet be told apart.
- Results are kept only in this device's browser. Under a given seed, episode k is always the same episode, so the rules' results on the episodes you played can be recomputed at any time.

### Quantum games and circuit puzzles

In the three quantum games, quantum mechanics lives only in the referee's hands: a rule cannot see the quantum state and can touch it only through the few actions the referee offers (measure a photon, rotate the quantum computer one more step, send a photon around a loop), and the referee draws measurement results with the probabilities quantum mechanics gives. Each game comes with a theorem on how well a classical method can do at best, and shows how far a quantum method gets past it.

| Game | The problem | Classical | Quantum |
|---|---|---|---|
| ⑮ Bell game | Two players who cannot communicate each receive a bit and answer a bit; when both receive 1 the answers must differ (CHSH) | Win rate at most 75% (the Bell–CHSH inequality) | Shared entangled photons measured at the standard angles: 85.36% (the Tsirelson bound). The visibility of the entanglement, a local hidden-variable source and the number of rounds can all be changed |
| ⑯ Quantum search | Find a prize among N boxes, deciding at each query whether to rotate one more step or measure now (Grover) | Checking without repeats: (N+1)/(M+1) queries on average | About 0.69√(N/M) queries. An unknown number of prizes and decoherence at every step each call for their own method |
| ⑰ Bomb testing | Pick out the live bombs without setting them off (Elitzur–Vaidman) | To know, you have to touch it, and touching it sets it off | The quantum Zeno effect: the more steps, the closer to 100% confirmed intact; when the loop loses photons, the number of steps is chosen by backward induction |

The **quantum circuit puzzles** in the lobby are ten solo levels: relative phase, change of basis, entanglement, three XORs, Deutsch's algorithm, the untouched bomb, four-way search, superdense coding, teleportation and beating 75%. Click cells to place gates, watch the amplitudes and the Bloch sphere change, and click "Check" to run every case and earn one to three stars depending on how well you did. The puzzles use the same simulator as the three quantum games: after the levels "The untouched bomb", "One out of four" and "Beat 75%", the circuit's settings (the number of bombs, the four angles you dialled in) can be taken straight to the matching game and run by a rule over thousands of episodes, and the other way round, each of the three games has a "Circuit puzzle" button in the "Game" section that goes back to the matching level. Progress is kept in this device's browser; `#quantum` in the address (or `#quantum=bomb` with a level) opens the puzzles directly.

### The lobby: playing with other people

"Lobby" at the top right holds eight things (the quantum circuit puzzles are described above). The page still has no server of its own: anything meant for other people is a public issue in this repository, live rooms go through public MQTT relays, the daily challenges are files in this repository, entries to them are encrypted and are opened and scored after the deadline by this repository's GitHub Actions, and the random number used to settle them comes from the public randomness beacon drand.

| | What it does | Why it can be trusted |
|---|---|---|
| Beginner's tutorial | Eight steps of two or three minutes; each has a button that takes you there, and a chip at the bottom left brings you back | |
| Daily episode | One episode per UTC day, the same for everyone (the four hand-playable games take turns); afterwards you see where you rank | What is posted is your sequence of actions, not a score; every viewer replays the actions in their own browser |
| Daily challenge | A new challenge every day: a small game with a referee, which everyone solves by writing a rule. Try yours freely on the public sets of data, then seal it (encrypt it) and submit it, so that nobody else can see your code; after the deadline (24:00 UTC) entries are settled and ranked on different sets | The settlement data is fixed by a random number that drand publishes after the deadline, so nobody knows it beforehand. Scores are computed by a settlement program that this repository runs automatically; you cannot check other people's scores, but the page recomputes the reference rules and your own entry in your browser and compares |
| Live room | Up to eight people play the same episode at once, seeing only how far the others have got; results are revealed together | A seal (the SHA-256 of the actions) is posted first and the actions only once every seal is in; anything that does not match its seal is void |
| Decathlon | One rule goes through ten worlds and is compared with buy and hold by long-run growth rate in each; the worst event is the score; the seed changes every Monday | Every rule on the board is rerun in your browser |
| Rule arena | Several rules in one market as each other's opponents: a common-value auction (first or second price), or competitive market making | The built-in rules have closed-form benchmarks to compare against |
| World workshop | Build worlds (code that generates prices) and games (a referee that deals, shows and scores), post them, and let others bring their own rules | |
| Quantum circuit puzzles | Ten levels, played solo; see above | |

- **Posting needs a GitHub account.** Click "Post to GitHub": the page fills in a new issue and you submit it on GitHub. The post is public and carries your username; close the issue to take it back. Just viewing the boards needs no account (GitHub allows 60 requests per hour without signing in; beyond that you are asked to refresh later).
- **Code written by other people always runs in an isolated environment**: a worker inside a sandboxed page without same-origin rights, under a content security policy that blocks every network request. It cannot read this page, your saved data or your keys, and cannot send anything out. The same holds when a rule or world loaded from a board or the workshop is used in the lab.
- **What this does and does not prevent.** A board for hand-played episodes cannot stop someone from looking at the whole episode first and choosing their actions afterwards (the seed is public), so it is just for fun. In the arena and the workshop the referee and the rules share one worker and cannot be completely isolated from one another; when someone else's code takes part, the page says that the result is just for fun. Data safety comes from the isolated environment and is not affected by this. When a daily challenge is settled, a rule and the referee also share one environment: the known ways of cheating are closed, but nobody else can see the code, so many eyes cannot help, and that board is just for fun too.
- **Live rooms** pass nicknames, progress and actions through public relays (broker.emqx.io, broker.hivemq.com, mqtt.eclipseprojects.io) and need no account; some networks cannot reach them.
- **Daily challenges** are written in weekly batches and live as data files in [daily/](daily/). The page fetches them at run time, so adding challenges needs no rebuild; the file format, the validator and the procedure for writing and reviewing a batch are in [daily/README.md](daily/README.md) (in Chinese, with an English summary). A rule is encrypted on your device before it is submitted, and only the ciphertext is posted on GitHub: others can see that you submitted and when, but not the name, the parameters or the code of your rule. After the deadline the [settlement workflow](../.github/workflows/strategy-lab-quest.yml) opens every entry with a private key kept in the repository's secrets, scores each one in a container of its own without network access, and publishes the scores and the names of the rules, never the code; an entry edited after the deadline is void. The private key is held by the repository's owner, who is technically able to open everyone's rules. This page never runs code that other people wrote for a daily challenge. How sealing and settlement work, and what the repository owner has to set up, is in the same document. An offline copy of the page has no daily challenge.
- You can write rules without knowing how to code: the daily challenge, the arena and the workshop have a "Copy a brief for an AI" button that copies the interface and the requirements; paste it to any AI and paste the code it replies with back in.

### Teen edition

[teen/](teen/) is a separate page for secondary-school students, in Chinese only: seven small games of deciding under uncertainty (guess a biased coin, roll dice and quit while ahead, sell watermelons, three slot machines, find the largest number, stock a bubble-tea shop, park a car), each ten to thirty rounds, playable on a phone. Three steps: play an episode by hand first and see at once how three simple rules scored on the very same episode and what each chose in every round; then the basic ideas of programming (seven lessons, each with runnable code and a "change it" task) and of algorithms (seven ideas: count, adjust to feedback, explore and exploit, think backwards, compute expected values, set thresholds by context, compare rules properly, each with an experiment over a few hundred episodes); then write a rule, starting from fill-in-the-blank code, and compare it with the reference rules on a fixed 200 episodes. A page for teachers and parents gives two 45-minute lesson plans, how to run a class competition, and the curriculum topics covered.

It runs on the lab's engine (referee, rules and sandbox are the same code) but leaves out everything related to investing; scores are just scores. Once loaded the page makes no network requests, needs no account and has no leaderboard server: progress, scores and code stay in this device's browser. Students' code runs in the sandbox, and an endless loop is stopped. Games are data ([src/teen/games.js](src/teen/games.js)): statement, referee, a few explained reference rules, starter code with blanks, and "the idea behind it".

### Machine Learning Lab

[ml/](ml/) is another separate page (in Chinese) for machine-learning experiments in the browser, organised as task → data → algorithm → feedback:

- **Four kinds of task, 38 datasets.** Tabular (regression and classification: two moons, spirals, checkerboard, sparse linear models, and the UCI Iris, Wine and breast-cancer data), time series (random walk, AR(2), seasonal, regime switching, the logistic map, Lorenz, Mackey–Glass, GARCH, and seven real price series), images and lattices (the 2-D Ising model, handwritten digits, shapes, percolation) and research toy problems (grokking on modular addition, multiplication in finite groups, sparse parity, set functions, teacher–student networks). The simulated datasets know their true generating process, so every result can be compared with the optimal or Bayes-optimal one. Every dataset is labelled as simulated, real, imported or fetched from the web.
- **Your own data, or data from the web.** Import a CSV, or use "从网上取…" (fetch from the web): describe the data you want in a sentence and your AI provider proposes a few data-file URLs, which the page tries in turn and previews before importing; or paste a URL, or pick one of twenty verified real datasets (S&P 500, VIX, oil, gold, US 10-year yields, CPI, house prices, CO₂, temperature, exchange rates, penguins, Titanic, diamonds, …). CSV, TSV, JSON, JSON Lines and their .gz / .zip are read; sites that browsers may not read cross-origin are fetched by the local engine (public addresses only).
- **24 built-in algorithms**, from ridge, lasso, logistic regression, naive Bayes, LDA/QDA, k-nearest neighbours, decision trees, random forests, gradient boosting, Gaussian processes, random Fourier features and support vector machines to multilayer perceptrons, convolutional networks, embedding + MLP and a one-layer transformer; for time series, seasonal naive, drift, AR, exponential smoothing (Holt–Winters), a Kalman filter, lag features + boosting, a lag-window MLP and an echo state network. Each comes with editable code and notes with formulas, theorems and proof sketches. The neural networks use a small autograd library in the page ([src/ml/nn.js](src/ml/nn.js)).
- **Inside Claude.** The same page is also published as an Artifact in Claude (`dist/ml-lab.html`, written by `python3 build.py`, declaring the "page may ask Claude" capability). There the AI in the right pane is the viewer's own Claude: no key, it draws on the viewer's own Claude usage, and Claude asks for permission at the first call. The page cannot reach the network itself there, but it can ask the **Claude desktop app** to act for it (each time with your permission): add the local engine to the desktop app as a local MCP server (`python -m mllab_engine --claude-config` prints the entry; see [ml-engine/README.md](ml-engine/README.md)) to run Python algorithms and fetch web data through the engine from inside Claude; without the engine, fetching uses the desktop app's built-in browser (uncompressed text files only, up to about two million characters). These work only in the Claude desktop app.
- **AI-written algorithms.** Connect your own AI provider in the right pane (the same settings as Strategy Lab) to write an algorithm (code that fits the interface, saved and run at once), diagnose a run (it receives the train/validation gap, learning curves, baselines, the optimum, the confusion matrix and feature importance, and writes a report), improve automatically (write a new version → run it → keep it only if it is better on the validation set, for a few rounds), or ask about the results. Nothing sent to the AI contains the test labels.
- **Several kinds of feedback.** Learning curves, decision surfaces, predicted vs actual, confusion matrices, ROC and calibration curves, permutation importance; model internals (weights, coefficients, trees, principal components and Fourier spectra of embeddings, decomposition into irreducible representations of a group, the crossover temperature an Ising classifier reads out); a replay of training snapshots; and a leaderboard in which all runs of one experiment are compared on the same examples with paired tests (McNemar, paired bootstrap, Diebold–Mariano), Holm-corrected, with a note on why the winner is optimistic. The test set is hidden until you reveal it, and the number of looks is recorded.
- **Animations and simulations.** Live Metropolis / Wolff simulation of the Ising model with a temperature sweep, percolation clusters and crossing probabilities, rolling-origin forecasting; teaching demos of five optimizers racing on an ill-conditioned quadratic, the Rosenbrock function and a saddle, the bias–variance decomposition, and double descent.
- **Handbook** (press ?): a page for every task, dataset, algorithm, chart and test, plus essays on generalisation, bias and variance, double descent, grokking, equivariance, time series and phase transitions.
- **Optional local Python engine.** [ml-engine/](ml-engine/) is a small program (standard library and numpy; PyTorch if installed, with MPS on Apple silicon) that runs on your own computer. Start it with `python -m mllab_engine` and open the printed `http://127.0.0.1:PORT/ml/?engine=TOKEN` address: the algorithm list then includes algorithms written in Python. It listens on localhost only and uses a new random token on every start; the page sends it only the inputs of the training, validation and test sets, receives raw predictions and scores them itself, with the same code as the browser algorithms. Installation and security notes are in [ml-engine/README.md](ml-engine/README.md) (in Chinese), the protocol in [ml-engine/PROTOCOL.md](ml-engine/PROTOCOL.md).

Everything runs locally in the browser; algorithms train in an isolated background thread, and code written by others (including an AI) cannot reach the page or the network. The design document is [src/ml/DESIGN.md](src/ml/DESIGN.md).

### Data analysis case studies

[cases/](cases/) is another separate page (in Chinese): a few complete data-analysis examples, each taken through the same eight steps — define the problem, where the data come from, cleaning and exploration, baseline, features, model, validation, limitations and next steps. Every number, table and chart is computed in the browser when the page opens and recomputed when you change a control.

[cases-ask/](cases-ask/) is a **sample** built from the same case studies (not merged into the main page yet): select a few words, or hold Alt and drag a box around anything (text, a formula, table rows, a stretch of a chart), and ask AI right there. The answer is inserted as a note where you asked; inside an answer you can select or box again and keep asking, one level deeper each time. Opened inside Claude it uses the viewer's own Claude; as a standalone page it uses the visitor's own API key (the same settings as the Strategy Lab, see `src/ai.js`). Notes are stored only in this browser. The note layer lives in `src/ask/`; the regular `cases/` page is unchanged.

| Case | Data | What it covers |
|---|---|---|
| Bike share: how many rentals next hour | Real: hourly rentals and weather of Capital Bikeshare, Washington DC, 2011–2012 (UCI) | Missing hours are not zeros (the three long gaps coincide with a snowstorm and two hurricanes); growth breaks historical averages; counts call for Poisson regression, with overdispersion; the leak `registered + casual = cnt`; random versus time-ordered splits |
| A dock with no bikes: where did the demand go | Simulated: pickups and returns at one station arrive as Poisson processes, nobody can take a bike from an empty dock, and the true demand is known | Observed pickups are censored demand; the plain average and "drop the hours with a stockout" are both biased low; using the minutes with bikes as the Poisson exposure corrects it, and when that still fails; how to check a correction without the truth; how many bikes to stock in the morning (a quantile decision under asymmetric costs) |
| House prices: from a sales table to a model you can trust | Real: 2,930 home sales in Ames, Iowa, 2006–2010 (De Cock 2011) | Why log prices; non-market sales and the five very large houses; the two meanings of NA; "the bedrooms coefficient turns negative once area is controlled"; variance inflation factors; heteroskedasticity and robust standard errors; the false significance created by duplicated rows; random, time-ordered and leave-one-neighborhood-out splits |
| S&P 500: prices are easy to predict, returns are not | Real: Robert Shiller's monthly data since 1871 | Why $R^2$ on price levels means nothing; missing values written as 0 in the source file; the spurious 0.25 autocorrelation created by monthly average prices (Working 1960, simulated and derived); overlapping long-horizon returns inflate t-statistics (Newey–West); out-of-sample $R^2$; picking a "significant" signal out of one hundred noise series |

Each case opens with the interview question it corresponds to and ends with the follow-up questions an interviewer would ask, with answers. "在机器学习实验室里继续" (continue in the Machine Learning Lab) hands the table the case prepared to the Machine Learning Lab (same site; the data stays in this browser), which selects it on opening so that you can try other algorithms; the table can also be downloaded as CSV.

Once loaded the page makes no network requests (apart from interface fonts) and needs no account. Cases are data (`src/cases/case-*.js`): each step is a function that writes text, tables, charts and controls into the page, and the computational part (`compute`) does not touch the page, so the tests call it directly. The three real datasets were re-encoded to be embedded, with the numbers unchanged; sources and licences are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

### The numbers are computed on your machine

- The **comparison table** (every built-in rule × every world or scenario, 796 cells) is not shipped with the page. It is computed locally by background threads the first time you open it, cell by cell, and cached in the browser.
- Underlined numbers in the handbook text are computed the same way.
- The handbook's **self-check** page lists 78 statements that a computation can decide (does a simulated number match its formula; is one rule significantly better than another in a given world) and checks them one by one on your machine.
- The same random seed always gives the same paths, so every result can be reproduced.

### The AI assistant

The right-hand panel lets an AI turn a one-line idea into a rule (code, parameters and a note on optimality, loaded and backtested automatically), write a new world, bring up the right charts, or explain the result in front of you. On this web page it runs on **your own API key**. You can choose:

| Provider | Default model | Callable directly from the page? | Notes |
|---|---|---|---|
| Claude (Anthropic) | claude-opus-5-5 | Yes (Anthropic's API accepts calls from web pages; the page sends the header it requires) | A Claude subscription (Pro, Max) does not include API usage; the API is billed separately at platform.claude.com. Small jobs use claude-haiku-5-5 |
| DeepSeek | deepseek-v4-pro | Yes | |
| ChatGPT (OpenAI) | gpt-6-sol | Yes | A ChatGPT subscription does not include API usage; the API is billed separately |
| Kimi (Moonshot AI) | kimi-k3 | Yes (both the China and the international site) | Keys are not interchangeable between the two sites; pick the right one in the settings |
| Doubao (Volcengine Ark) | doubao-seed-2-1-pro-260915 | **No: needs a forwarding proxy** | Activate the model in the Ark console first; an endpoint ID (ep-…) also works |
| Other | yours | Depends on the provider | Any OpenAI-compatible Chat Completions API, including a local Ollama or LM Studio |

To connect: click "AI" at the top right, then "Connect an AI…", choose a provider, paste your key, click "Test connection" and, once it answers, "Save". Model names change quickly; if the provider does not recognise the model, "Fetch model list" gets the current list.

- **"Callable directly from the page" was measured on 9 October 2026**, from a page at this address, by sending each API a request with an invalid key. The page could read the "invalid key" replies of DeepSeek, OpenAI and Kimi, so they accept calls from web pages; the reply from Volcengine Ark was blocked by the browser's cross-origin rules (CORS). A full conversation with a real key was not tested. Claude was added later and was not measured from this address; its entry follows Anthropic's documentation (the `anthropic-dangerous-direct-browser-access` header). Claude uses its own Messages API, not the OpenAI-compatible one.
- **With Claude connected, the AI in the Machine Learning Lab's "fetch from the web" really searches the web** (Anthropic's server-side web_search tool, at most 5 searches per request, billed per search) and picks data-file addresses from the pages it finds. If an organisation admin has turned web search off, the page says so and falls back to addresses from the model's memory.
- **Your key stays in your browser.** It is kept in localStorage, and requests go straight from the browser to the provider you chose (or to your forwarding proxy), never through this site. Other pages on the same domain can technically read it, so click "Clear key" when you are done on a shared computer.
- **Cost** is billed by the provider to your account. Writing one rule sends roughly five thousand characters and receives a few thousand.
- **Forwarding proxy** (under "Advanced" in the settings): when a provider blocks calls from web pages, a small relay has to pass the request on and add the response headers that let the page read the reply. The page requests `<proxy address>/<full API URL>`. The proxy sees your key, so use only one you deployed yourself. [tianxia/ai-proxy.mjs](../tianxia/ai-proxy.mjs), written for another project in this repository, is an example of such a relay (what it may be used for is governed by the [LICENSE](../LICENSE)).
- Everything else works without an AI: worlds, rules, charts, parameter sweeps and the handbook all run locally, and you can edit a rule's code yourself under "Code & notes" below the rule in the left column.

The page was first built to run inside Claude; opened there, the panel uses Claude directly and needs no key.

### Data

- All computation happens in the browser, and the page uploads nothing by itself. Only these leave this device: what you submit on GitHub after clicking "Post to GitHub" in the lobby (for a daily challenge, an encrypted copy); nicknames, progress and actions in a live room; and the prompts sent to your provider when you use the AI assistant (see "The lobby" and "The AI assistant" above). Viewing a board only reads public posts from GitHub; the daily challenge fetches the day's challenge and the public encryption key from this site and, when you look at a settlement, one public random number from drand's public servers (api.drand.sh, api2.drand.sh, api3.drand.sh, drand.cloudflare.com); none of these requests carries anything of yours. Settings, computed results, daily-challenge drafts and the plain text of what you submitted are kept in the browser's localStorage.
- Seven bundled historical price series (GOOG daily 2004–2008; S&P 500, Nasdaq Composite, AAPL, MSFT, IBM and AMZN monthly to 2022) are there only to demonstrate the real-data workflow; their accuracy is not guaranteed. You can import your own CSV.
- This is a tool for experiments and learning. Nothing on the page is investment advice.

### Development

```sh
npm install                      # fetches the KaTeX distribution files; the English build uses acorn and the tests use Playwright
python3 build.py                 # writes index.html, en/index.html, teen/index.html, ml/index.html and cases/index.html (and the build for publishing inside Claude, under dist/)
npx playwright install chromium  # only needed for the browser tests
sh test/run-all.sh               # the whole suite, a little over half an hour
```

**How the English edition is made.** There is one source tree, written in Chinese. At build time [i18n/i18n.js](i18n/i18n.js) replaces every piece of user-visible Chinese in the source (interface text, the handbook, the notes on each rule, the comments in rule code, the prompts sent to the AI: a little over six thousand units) with its translation from [i18n/en/](i18n/en/) and leaves the code itself untouched. Both languages therefore run the same computation: the same settings give identical results, and the cache of live-computed numbers is shared. Every translation is checked automatically when it is imported: formulas, live-number tokens and code must match the original, and no placeholder may be added or lost. If a Chinese string changes and no translation is supplied, the build fails and names the string. Details are in [i18n/README.md](i18n/README.md).

The tests come in two parts: checks in Node of the engine and of every number quoted in the handbook (about 2,800), and browser checks in headless Chromium (about 1,500). The AI-interface tests talk to a mock provider on localhost; the lobby tests replace GitHub and drand with local fixtures and the relays with a local broker; nothing is sent outside. The daily challenge's settlement program is called directly by the tests, with a key pair the tests generate and a child process in place of the container, so the container layer itself is only exercised when the workflow really runs on GitHub Actions. The teen edition's tests (`node test/teen.test.js`, `node test/ui-teen.js`) recompute every number quoted in its explanations, play each of the seven games by hand with the simplest policy and check that the score equals the corresponding reference rule's exactly, and check that the page makes no external request once loaded. The quantum tests (`node test/quantum.test.js`) check the simulator itself, that each puzzle's reference solution earns three stars, that the circuits agree with the Bell, Grover and quantum-Zeno formulas, that the three games' simulations agree with their theory, and every number quoted in the handbook; `node test/ui-quantum.js` solves several levels by clicking cells in headless Chromium and takes the settings back to the games. The handling of other people's code is tested for real: the tests include rules and referees that try to reach the network, patch built-ins and tamper with other players' results, and check that none of it works. The English-edition test (`node test/ui-en.js`, with the lobby features in `node test/ui-en-lobby.js`) walks through every world, game, rule, chart and handbook page, requires that no Chinese appears anywhere on the page, and checks that the two languages compute the same numbers. The Machine Learning Lab has its own tests: in Node, the statistical tests, the autograd library (a gradient check for every operation), the 38 datasets (optima and Bayes-optimal values against independent computations), the 24 algorithms (each runs on every kind of data it claims and meets a quality floor), the numerics behind the animations and every number quoted in its handbook, about 1,700 checks; `node test/ui-ml.js` runs every dataset in headless Chromium and walks through the views, the code editor, CSV import, the handbook and the four AI modes (against a local mock provider); `node test/ui-ml-engine.js` starts a real local engine, runs the numpy example algorithms through it, and checks that requests without the token or from another origin are refused; the engine has its own unit tests (`cd ml-engine && python3 -m unittest`). The data analysis case studies have their own tests: `node test/cases.test.js` checks that the three datasets decode to the original files (for example the bike data's two-year total of 3,292,679 rentals), that the numerical tools match closed forms and simulations, that each case's key numbers agree with an independent numpy computation, and that every qualitative statement in the text (which is larger, which sign) holds on the current data; `node test/ui-cases.js` renders every step of the four cases in headless Chromium, operates the controls, changes the seed, checks phone width and hands data to the Machine Learning Lab. To run one file: `node test/obs.test.js`, `node test/ui-standalone.js`.

The engine and the rules are plain JavaScript with no runtime dependencies. The page inlines [KaTeX](https://katex.org) for typesetting (MIT licence, see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)); interface fonts load from Google Fonts and fall back to system fonts when unreachable.

---

## 版权 / Copyright

© 2026 Zechen Bian. 保留所有权利 / All rights reserved.

本项目**不是开源项目**。可以在线使用，但未经书面许可，不得复制、修改、再分发、商用或用于 AI/机器学习训练。详见 [LICENSE](../LICENSE)。其中有一处专门给策略实验室的例外（第二条（五））：页面自带的样板（规则、世界和玩法）可以用页面自带的编辑器改写，做出来的东西可以贴到本仓库的 Issue 供策略实验室载入；别人贴在那里的内容，可以在策略实验室里载入、运行和改写。页面里内联的 KaTeX 是第三方软件，按它自己的 MIT 许可使用，见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

This project is **not open source**. You are welcome to use it online, but you may not copy, modify, redistribute, use commercially, or use it to train AI/ML models without written permission. See [LICENSE](../LICENSE). It makes one exception specific to Strategy Lab (section 2(e)): you may use the page's built-in editors to adapt its built-in templates (rules, worlds and games) and post what you make there to this repository's issue tracker so that it can be loaded in Strategy Lab, and inside Strategy Lab you may load, run and adapt what other people have posted there. KaTeX, which is bundled in the page, is third-party software under its own MIT licence; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Built with Claude.
