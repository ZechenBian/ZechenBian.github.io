# 天下棋局 · 联机版 / Tianxia Online

[中文](#中文) · [English](#english)

1939 年开局的大战略推演，几个人在各自的设备上联网对弈。单个网页文件，打开即玩，不用登录、不用安装。

A grand-strategy game starting in 1939, played online by several people on their own devices. One web page: open it and play, with no sign-in and nothing to install.

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

### 联网是怎么做到的

- 没有专门的游戏服务器。房主的浏览器负责结算，状态经公共 MQTT 中继服务器同步（EMQX、HiveMQ、Eclipse 提供的免费公共服务器，同时连三台，有一两台连不上照样能玩）。
- 不用登录：每台设备自动生成一个编号，昵称在开局画面填写。
- 房主关掉页面后，其他入座的玩家大约一分半钟后自动接任，游戏继续。
- 对局数据经公共服务器转发，没有加密，私信里不要写隐私信息。

### 和 claude.ai 里的联机版有什么不同

- 不含精细战区（按区格、按师逐日推演的战区地图）。
- 没有 Claude：国家智能体用本地规则谈判；一句话命令只识别战时政策与设定变更（如“发行战争公债”“军费提高到 20%”）；回合推演用规则引擎。
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

### How online play works

- There is no game server. The host's browser resolves turns, and the state is synced through public MQTT relay servers (the free public brokers run by EMQX, HiveMQ and Eclipse; all three are used at once, so the game keeps going if one or two are unreachable).
- No sign-in: each device gets a random id, and you pick a nickname on the start screen.
- If the host closes the page, another seated player takes over after about a minute and a half.
- Game data travels through public servers unencrypted, so keep private details out of messages.

### Differences from the version on claude.ai

- The fine-grained theatre maps (zone-by-zone, division-level daily battles) are not included.
- No Claude: country agents negotiate with local rules, one-line orders only recognize war policies and settings changes (e.g. “issue war bonds”, “raise defence spending to 20%”), and turns are resolved by the rules engine.
- Everything else (rules, data, war economy, messages and formal proposals) is the same.

### If you cannot connect

The start screen shows how many relays are connected under “Online”. If it says it cannot reach the relays, your network is probably blocking them (some campus and office networks do): switch networks (for example a phone hotspot) and reload. Hot-seat and solo still work.

### Saves

- Solo and hot-seat games are saved automatically in your browser.
- Online games live on the relays; reloading the page takes you back to your last game.
- “Settings / Saves” can export a save file.
