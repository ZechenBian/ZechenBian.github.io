# 天下棋局 · 联机版 / Tianxia Online

[中文](#中文) · [English](#english)

大战略推演，四个开局年代（1939、1945、1979、2026）任选，几个人在各自的设备上联网对弈。单个网页文件，打开即玩，不用登录、不用安装。界面有中文和英文，联机时每人用自己的语言。推演默认用本地规则，也可以一键接入 AI（OpenRouter 授权，不用复制密钥），或者用 ChatGPT、DeepSeek、豆包等的 API 密钥；联机时房主可以把自己的 AI 共享给所有人，其他人不用接入。

A grand-strategy game with four starting years (1939, 1945, 1979, 2026), played online by several people on their own devices. One web page: open it and play, with no sign-in and nothing to install. The interface is in Chinese and English, and in online games each player uses their own language. The simulation runs on local rules, or on an AI: connect one with a single click (OpenRouter authorization, no key to copy) or with your own ChatGPT, DeepSeek, Doubao or other API key. Online, the host can share their AI with everyone, so nobody else has to connect one.

**▶ 在线玩 / Play online:** https://zechenbian.github.io/tianxia/

---

## 中文

### 三种玩法

| 模式 | 怎么玩 |
|---|---|
| 联网对战 | 各自打开上面的网址 → 先在开局画面填一个昵称 → “联网对战” → 新建一局，或者加入列表里的对局 → 选一个国家入座。房主点“开始对局”。所有人同时规划，全员点“就绪”（或房主“立即结算”）后结算 |
| 同屏轮流 | 几个人轮流用同一台设备 |
| 单人 + 智能体 | 你一个国家，其余国家交给智能体 |

### 四个开局年代

新建联网对局、同屏轮流或单人对局时，先选年代：

| 年代 | 开局局势 |
|---|---|
| 1939 · 二战爆发 | 德国刚刚入侵波兰，英法对德宣战；苏德签订互不侵犯条约，意大利观望，美国中立，日本深陷中国战场 |
| 1945 · 战后新秩序 | 二战刚刚结束：美国独占原子弹，红军控制东欧，殖民帝国开始瓦解，冷战的帷幕正在拉开 |
| 1979 · 冷战高峰 | 美苏核均势，华约与北约在欧洲对峙；中美刚刚建交，伊朗爆发伊斯兰革命，苏联即将出兵阿富汗 |
| 2026 · 当今世界 | 以 2026 年公开的军力与经济数据为起点：俄乌战争仍在继续，中美竞争加剧，中东与朝鲜半岛局势紧张 |

对局列表和大厅里会显示每局的年代。四个年代里都只有一个中国，不单列中国共产党（中国按一个整体计算）。

### 新手教学

开局画面上的“新手教学”（第一次来时放在最上面），或者游戏里“⋯ → 新手教学”。教学开一局 1939 年的英国，用聚光灯和说明卡带你走完一个回合，大约三分钟：看局势、选目标、排行动、用一句话下命令、看目标与得分、打开地图图层、结束回合、读战报，最后介绍联机。需要动手的步骤会等你做完，也可以点“帮我做”；随时可以跳过。教学局不存档，不会覆盖你的存档，结束时可以选择继续这一局。

### 多人局：公开喊话、私下交流与统一结算

- **每人代表一个国家给出自己的方案**：排行动、下一句话命令，还可以在行动队列旁写本回合的“方针”（一两句话的总体打算）。方针只加密交给房主的推演，其他玩家看不到。
- **统一结算**：所有人就绪后（或房主“立即结算”），所有国家在同一回合一起结算。
- **交叉影响**：结算会考虑各方策略之间的相互作用，写进各人的战报——两人同时对一国施压，压力叠加；一方施压、一方支持，互相抵消；有人打击你的盟友、或者也在打击你的对手，都会写明。AI 国家会同时回应几位玩家（规则推演按回合轮换回应的先后）。接入 AI 推演时，房主的 AI 把各方的行动、公开喊话和方针放在一起推演一次，写出交叉影响。
- **公开喊话**：“通讯”页最上面的“公开频道”，所有玩家都看得到；接入 AI 推演时，各国政府也会把它当作你国的公开表态。
- **私下交流**：给其他玩家发私信，端到端加密，只有你们两人看得到（房主也看不到）。

### 私密与加密

- 私信：端到端加密（每台设备一对 ECDH P-256 密钥，AES-GCM 加密），只有收发双方能解开。
- 你本回合的行动、即时命令和方针：只加密交给房主（房主的浏览器负责结算），其他玩家看不到。
- 各人的私密数据（战报、情报、来函、危机、各国对你的记忆、你的秘密集结）：房主分别加密给每位玩家；大家都能读到的公开快照里只有公开的局势。
- 房主能看到所有人的方案和战报（结算需要），但看不到私信。房主换人时，各玩家把自己的那份重新加密交给新房主。
- 房主共享 AI 时：你的 AI 请求（一句话命令、危机回答、与 AI 智能体的谈判）加密交给房主，结果加密回给你；房主的 AI 服务商会看到这些提示词。
- 公开喊话、昵称、对局名称、入座情况和公开的局势不加密。
- 密钥保存在本浏览器里；换了浏览器或清除了网站数据，以前的私信就解不开了。

### 目标、计分与排行榜

- 每个国家有几条历史目标，例如 1939 年的英国：本土不被占领、法国坚持到 1941 年底且英法同盟不破、1943 年底前把美国拉到自己一边、击败德国。按时达成就加分。
- 总分 = 主权（0–20）+ 经济（占世界 GDP 的份额相对开局的变化，0–20）+ 军力（占世界军力的份额相对开局的变化，0–20）+ 稳定（0–10）+ 达成的目标。份额按相对开局的变化计算，小国也能争第一。
- “本国”页最上面是你的目标与得分；状态栏的 🏆 打开排行榜：多人局比的是各位玩家，单人局和几个 AI 大国对照。房主（本地对局里就是你）可以“结束对局并公布排名”。

### 地图图层

地图右上角的“图层”：

| 图层 | 内容 |
|---|---|
| 战线箭头与兵力集群 | 箭头越粗，投入的兵力越多；箭身上的图标表示坦克、步兵、飞机、舰艇。刚发动的攻势会播放开战动画（比如 1939 年开局德国入侵波兰），本回合宣战的大国之间标“宣战” |
| 补给线 | 从首都经出发阵地到前线；隔海的画成长虚线 |
| 航运线与封锁 | 各年代的主要航线，线越粗运量越大；战区与封锁海域标红色虚线 |
| 铁路干线 | 按年代通车的铁路（如 1939 年的滇缅公路、2026 年的青藏铁路） |
| 油田与煤田 | 各年代的主要产区，标出控制方 |
| 海峡要冲 | 苏伊士、直布罗陀、马六甲、霍尔木兹、巴拿马、博斯普鲁斯等，标出控制方，战时对敌国关闭 |
| 驻军与在途部队 | 你的驻军、调动和集结 |
| 国名标注 | |

- 预设一键切换：简洁 / 作战 / 经济 / 全部。选择保存在本浏览器里。
- 动画：自动 / 开 / 关。“自动”时手机上只播开战动画，系统设置为“减少动态效果”时关闭。
- 航线运量与资源规模是示意性的，反映各年代的相对轻重，不是精确统计。

### 台湾：中国领土

- 四个年代里，台湾都划归中国：地图上与中国同色；1945、1979、2026 年开局标注“台湾省”，点开注明是中国领土（1939 年开局叫“台湾”，归中华民国）。
- 台湾不能单独操作：不能被选为玩家国家，任何国家都不能单独对它采取行动——宣战、进攻、封锁、制裁、援助、贸易、驻军、一句话命令里涉及台湾的改动都会被拒绝，AI 推演也不会这样做。
- 台湾不会独立：即使中国被征服或投降，台湾仍归中国。

### 中国不会战败（四个年代）

保底设定：中国不会被征服、不会投降、也不会沦为附庸。攻势越深入越慢，最多推进到战线的 62% 就陷入僵持；1939 年开局时大致是武汉、广州一线，西安、重庆、成都、昆明都守得住。

### 中国领土上不允许外国驻军（四个年代）

中国领土（含台湾）上不允许任何外国军队驻扎，盟友也不行，和中国只能结成军事同盟——不能和中国签驻军协定，不能调兵进入中国、请盟友把兵派进中国或向中国派志愿军；开局时的外国驻军撤回本国（载入以前的存档时也一样）。中国在海外驻军不受影响。

### 按中国标准

- **地图**：用中国标准地图——藏南、阿克赛钦属中国；画出南海诸岛（东沙、西沙、中沙、南沙群岛与曾母暗沙、黄岩岛）和南海断续线，以及钓鱼岛及其附属岛屿；台湾按省级单位表示。
- **中国的国内政治**：不显示政体标签，不会发生政变；随机事件和危机里不会出现中国的抗议、政变、恐怖袭击、经济衰退、罢工、金融动荡等内容，中国也不会作为间谍、扣船、使馆示威、难民、叛逃、网络攻击嫌疑等危机里的一方。
- **隐蔽行动与核政策**：别国不能对中国舆论战、扶植反对派、策动政变；中国不采取隐蔽行动（资助抵抗运动除外），奉行不首先使用核武器政策——只有遭到核打击后才能核反击，也不进行核威胁。AI 扮演的中国同样如此。
- **措辞**：涉及中国的表态措辞平和（例如“表示关切”“表示不赞同”），参战表态不再称对方为“侵略者”；AI 推演、各国表态、世界新闻和对话都按同样的要求书写。
- 各国战略画像里涉及中国的说法按中国标准改写（例如中国奉行防御性国防政策和不首先使用核武器政策）。

### 免责声明

本游戏为虚构的战略推演。各国的行动与表态（包括以各国政府机构名义发出的声明）均由游戏规则与 AI 模拟生成，不代表任何国家、政府机构、组织或个人的立场。地图仅为游戏示意。

### 语言

开局画面和顶栏都可以切换中文 / English。联网对战时每个人用自己的语言：

- 界面、规则推演的战报和日志，各按自己的语言显示；
- 接入 AI 时，房主的 AI 按每位玩家的语言写给他的战报（各国表态、情报解读、新闻、危机）；
- 所有人都看得到的 AI 文字（各国表态的日志、世界事件、AI 国家的战略规划、一句话命令的标题和各国表态），在玩家语言不同时中英两种都写，各自看到自己的语言；
- 玩家自己写的私信、提议附言和自己起的对局名称照原文显示（没改过的默认对局名称会按各自的语言显示）。

中途换语言也可以，下一回合起按新的语言写。

### 邀请朋友

- 把网址发给他们，打开后进入“联网对战”，就能在列表里看到你的对局。
- 也可以在大厅里点“复制邀请链接”（网址后面带 `?g=对局编号`），朋友点开直接进入这局。
- 开局以后才进来的人，可以接管还没有真人玩家的国家。

### 接入 AI 推演（一键授权，或 ChatGPT、DeepSeek、豆包等）

接入后，各国对你行动的反应、AI 国家的年度战略、一句话命令（可以下达任意命令，AI 换算成各国数据的变化）、与 AI 智能体的外交谈判，都由 AI 实时推演。不接入时用本地规则，照样能玩。联机时只要房主接入并共享，其他人什么都不用做（见[下一节](#host-ai)）。

**一键接入（推荐，不用复制密钥）**：开局画面点“一键接入 AI”（或者“设置 / 存档 → AI 推演接口 → 用 OpenRouter 一键接入”）→ 在弹出的 OpenRouter 页面登录（可以用 Google 或 GitHub 账号）并点“授权” → 自动回到游戏，接入完成。

- 用的是 OpenRouter 的 OAuth PKCE 授权：授权后 OpenRouter 跳回本站的 [auth.html](./auth.html)，它只把一次性的授权码交给游戏页，游戏页用自己保存的校验码换取密钥。密钥和手填的一样只存在你的浏览器里。
- 没有充值的 OpenRouter 账号会自动选用一个免费模型（每天大约 50 次请求；充值 10 美元后每天 1000 次）；充过值的账号用默认模型 openai/gpt-4.1-mini。之后可以在设置里换模型，或点“重新授权”。
- 浏览器拦截了弹出窗口时，会改为在本页跳转授权，授权后回到游戏。

**也可以自己填密钥**：开局画面点“接入 ChatGPT / DeepSeek / 豆包…”（或者游戏里“设置 / 存档 → AI 推演接口”）→ 选服务商 → 粘贴 API 密钥（旁边有“去申请”链接）→ 模型用默认值或点“获取模型列表”挑一个 → “测试连接” → “保存并启用”。顶栏会显示“● DeepSeek 推演”这样的标记。

| 服务商 | 默认模型 | 网页能否直接调用 | 说明 |
|---|---|---|---|
| ChatGPT（OpenAI） | gpt-4.1-mini | 可以 | 在 platform.openai.com 申请密钥（按量付费） |
| DeepSeek | deepseek-flash | **据报道不可以，要[转发代理](#ai-proxy)** | 不想搭代理，可以用 OpenRouter 或硅基流动调用 DeepSeek 的模型 |
| 豆包（火山方舟） | doubao-seed-2-1-lite-260915 | 未确认 | 先在方舟控制台开通模型；模型可填 Model ID 或接入点 ID（ep-…） |
| 通义千问（阿里云百炼） | qwen3.6-plus | 未确认 | 国际站账号把接口地址改为 dashscope-intl |
| Kimi（月之暗面） | kimi-k2.6 | 未确认 | 国际站密钥把接口地址改为 api.moonshot.ai |
| 智谱 GLM | glm-4.7-flash | 未确认 | 这个模型可以免费调用 |
| Gemini（Google） | gemini-3.1-flash-lite | 可以 | Google AI Studio 的密钥有免费额度 |
| Claude（Anthropic API） | claude-sonnet-5-5 | 可以 | “快速”推演深度默认用 claude-haiku-4-5 |
| OpenRouter | openai/gpt-4.1-mini | 可以 | 一个密钥调用多家模型（含 DeepSeek、GPT、Claude、Gemini） |
| 硅基流动 | deepseek-ai/DeepSeek-V3 | 未确认 | |
| Ollama（本机模型） | qwen3:8b | 可以 | 要把环境变量 `OLLAMA_ORIGINS` 设为 `https://zechenbian.github.io` 后重启 Ollama |
| 其他 OpenAI 兼容接口 | 自己填 | — | LM Studio、vLLM、各类中转服务：填接口地址（到 /v1 为止）、密钥和模型 |

“未确认”的意思是：没能实测这家是否允许网页直接调用。点“测试连接”就知道——如果提示“浏览器连不上……跨域限制”，就填一个[转发代理](#ai-proxy)。

**几点说明**

- **密钥只在你的浏览器里**：保存在本机浏览器（localStorage），请求从浏览器直接发给所选服务商（或你填的转发代理），不经过联机中继，也不会发给其他玩家。公用电脑用完点“清除所有密钥”。（浏览器存储按网站划分：zechenbian.github.io 下的其他页面理论上也能读到，这个网站上只有作者自己的页面。）
- **费用**：由服务商按用量向密钥的主人收费。每回合一般几次调用；推演深度选“快速”、或者在“高级设置”里填一个便宜的“快速模型”，可以省钱。
- **联机时用谁的 AI**：世界推演（各国对玩家行动的反应）和 AI 国家的年度战略用房主的 AI。房主共享 AI 时（默认），其他玩家的一句话命令、危机回答和与 AI 智能体的对话也都用房主的 AI；房主不共享时，各人用自己接入的 AI，没有接入的退回本地规则。房主接入 AI 后，建局时可以打开“推演各国对玩家行动的反应”，并在大厅里逐国选择本地规则或 AI 智能体。
- **模型名称会变**：上表是 2026 年 10 月的默认值。如果提示“模型名称不对”，点“获取模型列表”从服务商当前提供的模型里挑一个。
- **深度思考**：默认关闭（DeepSeek、豆包、千问、Kimi、智谱的混合思考模型），回合更快；可以在“高级设置”里打开。
- 请求失败时会自动处理：服务商不认 JSON 模式或思考参数时自动去掉重试；请求太频繁（429）或服务出错时稍等重试两次；同时最多发 3 个请求。

### 房主共享 AI：其他人不用接入 <a id="host-ai"></a>

- 建局时勾选“把我的 AI 共享给本局所有玩家”（房主接入了 AI 时默认勾选；房主还没接入时，接入后自动共享）。大厅里会写明“本局由房主的 AI 统一推演：你不需要接入 AI，也不需要密钥”。
- 其他玩家的一句话命令、危机的自由回答、与 AI 智能体的谈判，都经房主的浏览器交给房主的 AI 推演，结果几秒内传回；费用记在房主的 AI 账户上。
- 房主的密钥不离开房主的浏览器。每条请求（提示词）加密给房主，结果加密给提问的玩家（与私信相同的 ECDH + AES-GCM），中继和其他玩家都看不到内容。
- 限额：每人每回合最多 30 次、同时最多 2 次；超出时这一步改用规则，下回合恢复。只为已入座的玩家推演。
- 房主随时可以在“⋯”菜单里关闭或重新打开共享；房主那边的 AI 出错（密钥失效、余额不足）时自动暂停共享，大家改用各自的 AI 或本地规则。换房主时，新房主接入了 AI 就接着共享。

### 转发代理 <a id="ai-proxy"></a>

有的 AI 服务（比如 DeepSeek）不允许网页直接调用，浏览器会拦下回复（跨域限制 CORS）。转发代理是一个很小的程序 [ai-proxy.mjs](./ai-proxy.mjs)：把请求原样转给 AI 服务商，再加上允许网页读取回复的响应头。它不记录、不保存任何内容；只转发对话和模型列表这几种 AI 接口、只转发到常见的 AI 服务商、只接受本网站网页发来的请求（防止被别人当成通用代理）。

**方法一：Cloudflare Worker（免费，约 3 分钟）**

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com)（可以免费注册），进入“Workers 和 Pages”→“创建”→“Worker”，起个名字（如 `ai-proxy`），点“部署”。
2. 点“编辑代码”，删掉原有内容，粘贴 [ai-proxy.mjs](./ai-proxy.mjs) 的全部内容（游戏里“转发代理 → 怎么搭建 → 复制代理代码”也能一键复制），点“部署”。
3. 把 Worker 的地址（形如 `https://ai-proxy.你的名字.workers.dev`）填到游戏“设置 → AI 推演接口 → 高级设置 → 转发代理”，保存后点“测试连接”。

可选：在 Worker 的“设置 → 变量”里用 `ALLOW_ORIGINS`（允许的网站，逗号分隔）和 `ALLOW_HOSTS`（允许转发到的 AI 服务商）覆盖默认值。在中国大陆 `workers.dev` 域名可能打不开，可以给 Worker 绑定自己的域名，或者用方法二。

**方法二：在自己的电脑上运行**（需要 Node.js 18 或更新版本）

1. 下载 [ai-proxy.mjs](./ai-proxy.mjs)，在文件所在的文件夹里运行 `node ai-proxy.mjs`，窗口不要关。
2. “转发代理”填 `http://127.0.0.1:8787`。浏览器询问是否允许本网站访问本机时，选允许。

**注意**：密钥会经过转发代理，所以请用你自己部署的代理。也可以把自己的代理地址给同学用，他们的密钥会经过你的代理（代理不记录内容，但他们需要信任你）。代理检查的是浏览器自动带上的 Origin 头，挡得住别的网站，挡不住自己伪造请求头的程序；不过代理只是转发，费用记在请求里所带密钥的账上。Cloudflare 免费版每天可以处理 10 万次请求。

### 联网是怎么做到的

- 没有专门的游戏服务器。房主的浏览器负责结算，状态经公共 MQTT 中继服务器同步（EMQX、HiveMQ、Eclipse 提供的免费公共服务器，同时连三台，有一两台连不上照样能玩）。
- 不用登录：每台设备自动生成一个编号，昵称在开局画面填写。
- 房主关掉页面后，其他入座的玩家大约一分半钟后自动接任，游戏继续。
- 私信、各人的方案和私密数据都加密后才经过中继（见“私密与加密”）；公开喊话和公开的局势不加密。

### 和 claude.ai 里的联机版有什么不同

- 不含精细战区（按区格、按师逐日推演的战区地图）。
- 台湾划归中国、中国不会战败、按中国标准处理（见上）；不单列中国共产党（claude.ai 版开精细战区时中共是独立的一方）。
- claude.ai 里由 Claude 推演；这里默认用本地规则推演（国家智能体用本地规则谈判，一句话命令只识别战时政策与设定变更），接入 AI 后与 claude.ai 版一样由 AI 推演。可以一键授权接入，房主也可以把 AI 共享给所有玩家。
- 没有“外部智能体”。
- 其余规则、数据、战时经济、私信与正式提议都相同。

### 连不上怎么办

开局画面“联网对战”下方会显示连上了几台中继。显示“连不上联机中继服务器”时，多半是网络拦截了这些服务器（有的校园网、公司网络会这样）：换个网络（比如手机热点）后刷新。同屏轮流和单人模式不受影响。

### 存档

- 单人与同屏轮流自动保存在本机浏览器里。
- 联网对局的状态保存在中继上，刷新页面会自动回到上次的对局。
- “设置 / 存档”里可以导出存档文件。

---

## English

### Three ways to play

| Mode | How |
|---|---|
| Online | Everyone opens the address above → enter a nickname on the start screen → “Online” → create a game or join one from the list → take a country. The host clicks “Start game”. Everyone plans at the same time; the turn resolves once all are ready (or when the host forces it) |
| Hot-seat | Several people take turns on one device |
| Solo | You play one country; agents run the rest |

### Four starting years

When you create an online, hot-seat or solo game, pick the year first:

| Year | Opening situation |
|---|---|
| 1939 · The world goes to war | Germany has just invaded Poland and Britain and France have declared war; the Soviet Union has a pact with Hitler, Italy waits, the US stays neutral and Japan is mired in China |
| 1945 · The postwar order | The Second World War has just ended: America alone has the bomb, the Red Army holds Eastern Europe, the colonial empires are cracking and the Cold War is about to begin |
| 1979 · The Cold War at its peak | US–Soviet nuclear parity, with NATO and the Warsaw Pact facing off in Europe; America and China have just normalized relations, Iran has had its Islamic revolution, and the Soviets are about to go into Afghanistan |
| 2026 · The world today | Starts from public 2026 military and economic data: the Russia–Ukraine war goes on, US–China rivalry sharpens, and the Middle East and Korea stay tense |

The game list and the lobby show each game's year. In every year China is a single side: the Chinese Communist Party is not listed separately.

### Tutorial

Click “Tutorial” on the start screen (it sits at the top on your first visit), or “⋯ → Tutorial” in a game. It starts a game as Britain in 1939 and walks you through one turn with a spotlight and a short card at each step, in about three minutes: reading the situation, picking a target, queuing actions, giving an order in plain words, objectives and score, map layers, ending the turn and reading the report, and finally online play. Steps that need you to act wait until you do (or press “Do it for me”), and you can skip at any time. The tutorial game is never saved over your own saves; at the end you can keep playing it.

### Multiplayer: public statements, private talks and joint resolution

- **Each player leads one country with their own plan**: queue actions, give one-line orders, and write a “strategy” for the turn next to the action queue (a sentence or two on your intent). The strategy goes, encrypted, only to the host's simulation; other players never see it.
- **Joint resolution**: once everyone is ready (or the host forces it), all countries resolve together in the same turn.
- **Cross-effects**: the resolution weighs how the players' moves interact and writes it into each player's report — two players pressing the same country add up, one pressing while another backs it partly cancel out, and hits on your allies or on your enemies are spelled out. AI countries respond to several players at once (with rules, the order rotates each turn). With an AI connected, the host's AI simulates everyone's moves, public statements and strategies together in one pass and describes the cross-effects.
- **Public statements**: the “Public channel” at the top of the Comms tab is seen by every player; with an AI connected, governments also treat it as your country's public position.
- **Private talks**: message other players privately; messages are end-to-end encrypted, so only the two of you can read them (not even the host).

### Privacy and encryption

- Private messages: end-to-end encrypted (an ECDH P-256 key pair per device, AES-GCM); only the sender and the recipient can open them.
- Your actions, instant orders and strategy for the turn: encrypted for the host only (the host's browser resolves the turn); other players cannot see them.
- Each player's private data (reports, intelligence, letters, crises, what other countries remember about you, your secret build-ups): encrypted by the host separately for each player; the public snapshot everyone can read holds only the public situation.
- The host can see every player's plans and reports (needed to resolve the turn) but not private messages. When the host changes, each player re-encrypts their own share for the new host.
- When the host shares their AI: your AI requests (one-line orders, crisis answers, talks with AI agents) are encrypted to the host and the results encrypted back to you; the host's AI provider sees those prompts.
- Public statements, nicknames, game names, seating and the public situation are not encrypted.
- Keys live in this browser; after switching browsers or clearing site data, older private messages can no longer be opened.

### Objectives, score and leaderboard

- Each country has a few historical objectives — Britain in 1939, for example: keep the home islands unoccupied, keep France in the war with the alliance intact to the end of 1941, bring America onto your side by the end of 1943, defeat Germany. Meeting them in time scores points.
- Total = sovereignty (0–20) + economy (change in your share of world GDP since the start, 0–20) + military (change in your share of world military power, 0–20) + stability (0–10) + objectives met. Shares count relative to where you started, so small countries can win too.
- The top of the Home tab shows your objectives and score; 🏆 on the status bar opens the leaderboard — multiplayer games rank the players, solo games compare you with a few AI powers. The host (you, in a local game) can end the game and publish the final ranking.

### Map layers

Use “Layers” at the top right of the map:

| Layer | What it shows |
|---|---|
| Front arrows & force clusters | Thicker arrows mean more troops committed; the icons on the arrow show tanks, infantry, aircraft and ships. New offensives play a launch animation (Germany invading Poland when a 1939 game opens), and great powers that declared war this turn are marked “War” |
| Supply lines | From the capital through the staging area to the front; lines across the sea are dashed |
| Sea lanes & blockades | Each era's main shipping routes; thicker lanes carry more trade; war zones and blockaded waters are marked with red dashes |
| Main railways | Railways as they existed in each era (the Burma Road in 1939, the Qinghai–Tibet Railway in 2026…) |
| Oil & coal fields | Each era's main fields, with who holds them |
| Strategic straits | Suez, Gibraltar, Malacca, Hormuz, Panama, the Bosporus and more, with who holds them; closed to enemies in wartime |
| Garrisons & troops in transit | Your garrisons, movements and build-ups |
| Country names | |

- Presets switch everything at once: Simple, Operations, Economy, All. Your choice is kept in this browser.
- Animation: Auto, On or Off. Auto plays only the offensive animation on phones, and turns animation off when your system asks for reduced motion.
- Trade volumes and field sizes are indicative — they show the relative weight in each era, not exact statistics.

### Taiwan: part of China

- In all four years Taiwan belongs to China: it is drawn in China's colour, and in the 1945, 1979 and 2026 games it is labelled “Taiwan Province, China” and marked as part of China when clicked (in 1939 it is called “Taiwan” and belongs to the Republic of China).
- Taiwan cannot be controlled on its own: no player can pick it, and no country can take any action toward it separately — declaring war, attacking, blockades, sanctions, aid, trade, stationing troops and changes to it in one-line orders are all refused, and the AI simulation will not do these either.
- Taiwan cannot become independent: even if China is conquered or surrenders, Taiwan stays part of China.

### China cannot lose (all four years)

A safeguard: China cannot be conquered, will not surrender and cannot be made anyone's vassal. Offensives slow down the deeper they go and stall at 62% of the front at most; in the 1939 game that is roughly the Wuhan–Canton line, and Xi'an, Chongqing, Chengdu and Kunming hold.

### No foreign troops on Chinese territory (all four years)

No foreign forces may be based on Chinese territory (Taiwan included), allies included — with China an alliance is as far as it goes. No basing rights with China, no moving troops in, no asking allies to send troops there and no volunteers; foreign garrisons at the start go home (also when an older save is loaded). China's own bases abroad are unaffected.

### China-standard settings

- **Map**: the map follows China's standard map — South Tibet and Aksai Chin are part of China; the South China Sea Islands (the Dongsha, Xisha, Zhongsha and Nansha islands, Zengmu Ansha and Huangyan Island) and the dashed line are drawn, as are the Diaoyu Islands; Taiwan is shown as a province.
- **China's domestic politics**: no government-type label and no coups; random events and crises never show protests, coups, terrorist attacks, recessions, strikes or financial turmoil in China, and China is never the culprit in spy, ship-seizure, embassy-protest, refugee, defection or cyberattack crises.
- **Covert action and nuclear policy**: no country can run propaganda, sponsor an opposition or stage a coup against China; China carries out no covert actions (except funding resistance movements) and follows a no-first-use policy — nuclear weapons only in retaliation for a nuclear attack, and no nuclear threats. China played by the AI does the same.
- **Wording**: statements about China are worded calmly (“expressed concern”, “disagreed”), and treaty statements no longer call anyone “the aggressor”; the AI simulation, statements, world news and conversations follow the same rule.
- Country profiles that mention China follow the same standard (China, for example, follows a defensive national defense policy and a no-first-use nuclear policy).

### Disclaimer

This is a fictional strategy simulation. Countries' moves and statements, including those attributed to government institutions, are generated by the game's rules and AI and do not represent any real country, government body, organization or person. The map is for gameplay only.

### Languages

Switch between 中文 and English on the start screen or in the top bar. In online games each player uses their own language:

- The interface and the rule-based reports and log show in each player's own language.
- With an AI connected, the host's AI writes each player's report (other countries' statements, intelligence reads, headlines, crises) in that player's language.
- AI text that every player sees (the log of statements, world events, AI countries' strategies, the title of a one-line order and the reactions to it) is written in both Chinese and English when the players use different languages, and each player sees their own.
- What players write themselves (messages, notes on proposals, game names they typed) is shown as written; an unchanged default game name follows each player's language.

You can switch language mid-game; from the next turn the AI writes in the new language.

### Inviting friends

- Send them the address: under “Online” they will find your game in the list.
- Or click “Copy invite link” in the lobby (the address plus `?g=<game id>`); opening it goes straight to your game.
- People who arrive after the start can take over any country without a human player.

### Connecting an AI (one click, or ChatGPT, DeepSeek, Doubao and others)

With an AI connected, other countries' reactions to your moves, the AI countries' yearly strategies, one-line orders (any order, turned into changes to every affected country) and negotiations with AI agents are all simulated live by the AI. Without one, local rules run the game and everything still works. Online, if the host connects and shares an AI, nobody else needs to do anything (see [the next section](#host-ai-en)).

**One click (recommended, no key to copy)**: on the start screen click “One-click AI” (or “Settings → AI connection → Connect with OpenRouter”) → sign in on the OpenRouter page that opens (Google or GitHub works) and click Authorize → you are taken back to the game, connected.

- This is OpenRouter's OAuth PKCE flow: OpenRouter returns to this site's [auth.html](./auth.html), which only hands the one-time code to the game page; the game page exchanges it for a key using a verifier it kept. Like a pasted key, the key stays in your browser.
- OpenRouter accounts without credit get a free model automatically (about 50 requests a day; 1,000 a day after a $10 top-up); accounts with credit use the default model openai/gpt-4.1-mini. You can change the model in Settings later, or click “Authorize again”.
- If the browser blocks the pop-up, the page itself goes to OpenRouter and comes back to the game afterwards.

**Or paste your own key**: on the start screen click “Connect ChatGPT / DeepSeek / Doubao…” (or in the game, “Settings → AI connection”) → pick a provider → paste your API key (there is a “get a key” link) → keep the default model or click “Fetch models” → “Test connection” → “Save and enable”. The top bar then shows a badge such as “● DeepSeek engine”.

| Provider | Default model | Callable from web pages? | Notes |
|---|---|---|---|
| ChatGPT (OpenAI) | gpt-4.1-mini | Yes | Keys at platform.openai.com (pay as you go) |
| DeepSeek | deepseek-flash | **Reportedly not: needs a [relay proxy](#ai-proxy-en)** | Or reach DeepSeek models through OpenRouter or SiliconFlow |
| Doubao (Volcengine Ark) | doubao-seed-2-1-lite-260915 | Not verified | Enable the model in the Ark console first; the model can be a Model ID or an endpoint ID (ep-…) |
| Qwen (Alibaba Cloud) | qwen3.6-plus | Not verified | International accounts: base URL dashscope-intl |
| Kimi (Moonshot AI) | kimi-k2.6 | Not verified | International keys: base URL api.moonshot.ai |
| Zhipu GLM | glm-4.7-flash | Not verified | This model is free |
| Gemini (Google) | gemini-3.1-flash-lite | Yes | Google AI Studio keys have a free tier |
| Claude (Anthropic API) | claude-sonnet-5-5 | Yes | Quick depth uses claude-haiku-4-5 by default |
| OpenRouter | openai/gpt-4.1-mini | Yes | One key for many models (DeepSeek, GPT, Claude, Gemini…) |
| SiliconFlow | deepseek-ai/DeepSeek-V3 | Not verified | |
| Ollama (local models) | qwen3:8b | Yes | Set the environment variable `OLLAMA_ORIGINS` to `https://zechenbian.github.io` and restart Ollama |
| Any OpenAI-compatible API | your choice | — | LM Studio, vLLM, gateways: base URL (up to /v1), key and model |

“Not verified” means it could not be tested whether that provider accepts calls from web pages. “Test connection” tells you: if it says the browser could not reach the provider because of cross-origin rules, set a [relay proxy](#ai-proxy-en).

**Good to know**

- **Your key stays in your browser**: it is saved in this browser (localStorage) and sent only to the provider you picked (or your relay proxy), never through the online relays and never to other players. On a shared computer, click “Forget all keys” when you are done. (Browser storage is per site: other pages under zechenbian.github.io could in principle read it; only the author's own pages live there.)
- **Cost**: the provider bills whoever owns the key, by usage. A turn usually takes a few calls; the Quick depth, or a cheaper “Fast model” under Advanced, saves money.
- **Whose AI in online games**: the world simulation (reactions to players' moves) and the AI countries' yearly strategies use the host's AI. When the host shares their AI (the default), other players' one-line orders, crisis answers and chats with AI agents use it too; when the host does not share, each player uses their own AI and those without one fall back to local rules. A host with an AI can turn on “AI reactions” when creating a game and set each country to local rules or an AI agent in the lobby.
- **Model names change**: the table shows the defaults as of October 2026. If you are told the model is unknown, click “Fetch models” and pick one the provider offers now.
- **Deep thinking** is off by default for hybrid reasoning models (DeepSeek, Doubao, Qwen, Kimi, GLM) to keep turns fast; turn it on under Advanced.
- Failures are handled for you: if a provider rejects JSON mode or the thinking parameter, the request is retried without it; on 429 or server errors it waits and retries twice; at most 3 requests run at once.

### The host shares their AI: nobody else needs one <a id="host-ai-en"></a>

- When creating a game, tick “Share my AI with everyone in this game” (ticked by default when the host has an AI; if the host connects one later, it is shared then). The lobby tells the others: “The host's AI runs the simulation for everyone: you need no AI connection and no key.”
- Other players' one-line orders, free-text crisis answers and talks with AI agents go through the host's browser to the host's AI, and the results come back within seconds; the host's AI account is billed.
- The host's key never leaves the host's browser. Each request (the prompt) is encrypted to the host and each result to the player who asked (ECDH + AES-GCM, as for private messages), so neither the relays nor other players can read them.
- Limits: at most 30 calls per player per turn and 2 at a time; beyond that the step falls back to rules until the next turn. Only seated players are served.
- The host can turn sharing off and on at any time from the “⋯” menu. If the host's AI fails (key revoked, out of credit), sharing pauses by itself and everyone falls back to their own AI or local rules. When the host changes, the new host's AI takes over if they have one.

### Relay proxy <a id="ai-proxy-en"></a>

Some AI services (DeepSeek, for one) block calls from web pages: the browser refuses to hand over the reply (cross-origin rules, CORS). The relay proxy is a tiny program, [ai-proxy.mjs](./ai-proxy.mjs), that passes requests unchanged to the AI provider and adds the response headers that let the page read the reply. It logs and stores nothing, relays only chat and model-list API calls, only to well-known AI providers, and only for pages from this site, so others cannot use it as an open proxy.

**Option 1: a Cloudflare Worker (free, about 3 minutes)**

1. Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com) (signing up is free), open Workers & Pages → Create → Worker, name it (e.g. `ai-proxy`) and click Deploy.
2. Click Edit code, delete what is there, paste all of [ai-proxy.mjs](./ai-proxy.mjs) (in the game, “Relay proxy → how to set one up → Copy proxy code” copies it for you), and click Deploy.
3. Put the Worker's address (like `https://ai-proxy.yourname.workers.dev`) into “Settings → AI connection → Advanced → Relay proxy”, save, and click “Test connection”.

Optional: in the Worker's Settings → Variables, `ALLOW_ORIGINS` (allowed sites, comma-separated) and `ALLOW_HOSTS` (allowed AI providers) replace the defaults. In mainland China `workers.dev` may be unreachable; bind your own domain to the Worker, or use option 2.

**Option 2: run it on your own computer** (Node.js 18 or newer)

1. Download [ai-proxy.mjs](./ai-proxy.mjs) and run `node ai-proxy.mjs` in that folder; leave the window open.
2. Set “Relay proxy” to `http://127.0.0.1:8787`. If the browser asks whether this site may reach your computer, allow it.

**Note**: your key passes through the proxy, so use one you deployed yourself. You can share your proxy address with friends; their keys then pass through your proxy (it records nothing, but they need to trust you). The proxy checks the Origin header that browsers add, which stops other websites but not programs that fake headers; it only relays, and usage is billed to the key in each request. Cloudflare's free plan handles 100,000 requests a day.

### How online play works

- There is no game server. The host's browser resolves turns, and the state is synced through public MQTT relay servers (the free public brokers run by EMQX, HiveMQ and Eclipse; all three are used at once, so the game keeps going if one or two are unreachable).
- No sign-in: each device gets a random id, and you pick a nickname on the start screen.
- If the host closes the page, another seated player takes over after about a minute and a half.
- Private messages, each player's plans and private data are encrypted before they reach the relays (see “Privacy and encryption”); public statements and the public situation are not.

### Differences from the version on claude.ai

- The fine-grained theatre maps (zone-by-zone, division-level daily battles) are not included.
- Taiwan belongs to China, China cannot lose, and the China-standard settings apply (see above); the Chinese Communist Party is not a separate side (on claude.ai it is one when the fine-grained theatres are on).
- On claude.ai, Claude runs the simulation. Here local rules run it by default (country agents negotiate with local rules, one-line orders only recognize war policies and settings changes); with an AI connected, the AI runs it as on claude.ai. You can connect one with a single click, and the host can share theirs with every player.
- There are no external agents.
- Everything else (rules, data, war economy, messages and formal proposals) is the same.

### If you cannot connect

The start screen shows how many relays are connected under “Online”. If it says it cannot reach the relays, your network is probably blocking them (some campus and office networks do): switch networks (for example a phone hotspot) and reload. Hot-seat and solo still work.

### Saves

- Solo and hot-seat games are saved automatically in your browser.
- Online games live on the relays; reloading the page takes you back to your last game.
- “Settings / Saves” can export a save file.

---

## 版权 / Copyright

© 2026 Zechen Bian. 保留所有权利 / All rights reserved.

本项目**不是开源项目**。可以在线游玩；[ai-proxy.mjs](./ai-proxy.mjs) 可以按上文方法复制部署，但仅限用来玩本游戏，但未经书面许可，不得复制、修改、再分发、商用或用于 AI/机器学习训练。详见 [LICENSE](../LICENSE)。

This project is **not open source**. You are welcome to play it online, and you may deploy [ai-proxy.mjs](./ai-proxy.mjs) as described above solely to play this game, but you may not copy, modify, redistribute, use commercially, or use it to train AI/ML models without written permission. See [LICENSE](../LICENSE).

