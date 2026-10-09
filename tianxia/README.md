# 天下棋局 · 联机版 / Tianxia Online

[中文](#中文) · [English](#english)

1939 年开局的大战略推演，几个人在各自的设备上联网对弈。单个网页文件，打开即玩，不用登录、不用安装。推演默认用本地规则，也可以接入 ChatGPT、DeepSeek、豆包等 AI（用你自己的 API 密钥）。

A grand-strategy game starting in 1939, played online by several people on their own devices. One web page: open it and play, with no sign-in and nothing to install. The simulation runs on local rules, or on ChatGPT, DeepSeek, Doubao or another AI with your own API key.

**▶ 在线玩 / Play online:** https://zechenbian.github.io/tianxia/

---

## 中文

### 三种玩法

| 模式 | 怎么玩 |
|---|---|
| 联网对战 | 各自打开上面的网址 → 先在开局画面填一个昵称 → “联网对战” → 新建一局，或者加入列表里的对局 → 选一个国家入座。房主点“开始对局”。所有人同时规划，全员点“就绪”（或房主“立即结算”）后结算 |
| 同屏轮流 | 几个人轮流用同一台设备 |
| 单人 + 智能体 | 你一个国家，其余国家交给智能体 |

### 邀请朋友

- 把网址发给他们，打开后进入“联网对战”，就能在列表里看到你的对局。
- 也可以在大厅里点“复制邀请链接”（网址后面带 `?g=对局编号`），朋友点开直接进入这局。
- 开局以后才进来的人，可以接管还没有真人玩家的国家。

### 接入 AI 推演（ChatGPT、DeepSeek、豆包等）

接入后，各国对你行动的反应、AI 国家的年度战略、一句话命令（可以下达任意命令，AI 换算成各国数据的变化）、与 AI 智能体的外交谈判，都由 AI 实时推演。不接入时用本地规则，照样能玩。

**怎么接入**：开局画面点“接入 ChatGPT / DeepSeek / 豆包…”（或者游戏里“设置 / 存档 → AI 推演接口”）→ 选服务商 → 粘贴 API 密钥（旁边有“去申请”链接）→ 模型用默认值或点“获取模型列表”挑一个 → “测试连接” → “保存并启用”。顶栏会显示“● DeepSeek 推演”这样的标记。

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
- **联机时用谁的密钥**：世界推演（各国对玩家行动的反应）和 AI 国家的年度战略用房主的密钥；你和 AI 智能体的对话、你的一句话命令用你自己的密钥。没有接入 AI 的玩家，这些功能自动退回本地规则。房主接入 AI 后，建局时可以打开“推演各国对玩家行动的反应”，并在大厅里逐国选择本地规则或 AI 智能体。
- **模型名称会变**：上表是 2026 年 10 月的默认值。如果提示“模型名称不对”，点“获取模型列表”从服务商当前提供的模型里挑一个。
- **深度思考**：默认关闭（DeepSeek、豆包、千问、Kimi、智谱的混合思考模型），回合更快；可以在“高级设置”里打开。
- 请求失败时会自动处理：服务商不认 JSON 模式或思考参数时自动去掉重试；请求太频繁（429）或服务出错时稍等重试两次；同时最多发 3 个请求。

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
- 对局数据经公共服务器转发，没有加密，私信里不要写隐私信息。

### 和 claude.ai 里的联机版有什么不同

- 不含精细战区（按区格、按师逐日推演的战区地图）。
- claude.ai 里由 Claude 推演；这里默认用本地规则推演（国家智能体用本地规则谈判，一句话命令只识别战时政策与设定变更），接入 AI 后与 claude.ai 版一样由 AI 推演。
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

### Inviting friends

- Send them the address: under “Online” they will find your game in the list.
- Or click “Copy invite link” in the lobby (the address plus `?g=<game id>`); opening it goes straight to your game.
- People who arrive after the start can take over any country without a human player.

### Connecting an AI (ChatGPT, DeepSeek, Doubao and others)

With an AI connected, other countries' reactions to your moves, the AI countries' yearly strategies, one-line orders (any order, turned into changes to every affected country) and negotiations with AI agents are all simulated live by the AI. Without one, local rules run the game and everything still works.

**How**: on the start screen click “Connect ChatGPT / DeepSeek / Doubao…” (or in the game, “Settings → AI connection”) → pick a provider → paste your API key (there is a “get a key” link) → keep the default model or click “Fetch models” → “Test connection” → “Save and enable”. The top bar then shows a badge such as “● DeepSeek engine”.

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
- **Whose key in online games**: the world simulation (reactions to players' moves) and the AI countries' yearly strategies use the host's key; your chats with AI agents and your one-line orders use your own key. Players without an AI fall back to local rules for these. A host with an AI can turn on “AI reactions” when creating a game and set each country to local rules or an AI agent in the lobby.
- **Model names change**: the table shows the defaults as of October 2026. If you are told the model is unknown, click “Fetch models” and pick one the provider offers now.
- **Deep thinking** is off by default for hybrid reasoning models (DeepSeek, Doubao, Qwen, Kimi, GLM) to keep turns fast; turn it on under Advanced.
- Failures are handled for you: if a provider rejects JSON mode or the thinking parameter, the request is retried without it; on 429 or server errors it waits and retries twice; at most 3 requests run at once.

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
- Game data travels through public servers unencrypted, so keep private details out of messages.

### Differences from the version on claude.ai

- The fine-grained theatre maps (zone-by-zone, division-level daily battles) are not included.
- On claude.ai, Claude runs the simulation. Here local rules run it by default (country agents negotiate with local rules, one-line orders only recognize war policies and settings changes); with an AI connected, the AI runs it as on claude.ai.
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

