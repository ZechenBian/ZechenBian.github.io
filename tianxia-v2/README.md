# 天下棋局 · 联机版 v2 / Tianxia Online v2

[中文](#中文) · [English](#english)

这是 [天下棋局·联机版](https://zechenbian.github.io/tianxia/) 的合并操作新版，单独放在这里试玩；旧版保持原有的玩法。两版的联机对局互不相通，本机存档也分开；AI 接入的设置两版共用。

This is the streamlined new edition of [Tianxia Online](https://zechenbian.github.io/tianxia/), kept separately so it can be tried side by side; the original keeps its own gameplay. Online games and local saves are separate between the two editions; your AI connection settings are shared.

**▶ 在线玩 / Play online:** https://zechenbian.github.io/tianxia-v2/

---

## 中文

### 新版改了什么

- **每件事只有一个入口**。六个页签：目标、本国、军事、动员、外交、情报。原来的“通讯”并入外交，“战时经济”加上军费与动员改名“动员”。
- **行动合成八张表单**：目标页有公开表态、制裁、援助、军事施压、打击、隐蔽行动、处置领土，本国页有国内措施。原来 43 个单方面行动按钮变成 8 张表单。
- **多选、金额自己填**：制裁、援助、军事施压、隐蔽行动、国内措施可以一次勾几项；援助、贷款、军援、国内投入的金额自己填，援助还可以改成每季度的长期计划。
- **一组要几个行动点由 AI 判断**：只有一项就是那一项的点数；几项一起时，规则估计是各项之和减去组合优惠（每两项少 1 点），金额很大时加点；接了 AI 时由 AI 在这个范围里判断并写出理由，没接 AI 时用规则估计。排进队列后整组显示成一个条目，整组撤回。
- **协议都在对话里**：结盟、自贸、互不侵犯、驻军、军控、停火、议和、臣服、援助、出兵、扩军动员等 23 种条款，在外交页和某国的对话里附上发出。和 AI 国家签一份 1 点，含同盟或臣服 2 点；真人之间免费。首脑会晤也在对话里。
- **条约可以逐项退出**（1 点），集团在同一处退出，长期援助随时停止。
- **动员页**：军费、投入方向、动员等级 0–5（3–5 是总体战，原来的“总体战动员”并入这里；提高 1 点、立即生效）、征兵（人数自己填）、军工订单（金额自己填）、战时政策；五种一次性措施放在对应那一行旁边。
- **核心利益阶梯**移到目标页，每一级就是一组标准行动，点数按包含的行动算。
- **一个输入框**：发送前选“执行、方针、公开、对某国”。“执行”的一句话命令先对应标准操作（花费、效果和点按钮一样，需要选择的打开对应的地方并预填好），对应不上才交给 AI 换算成各国数据的变化。“公开”勾上“正式表态”就是公开谴责、警告或核威慑。
- **AI 设置**：每人一个“AI 来源”（自动 / 只用我自己的 / 关）；房主建局时选“AI 用量”（省 / 标准 / 充分）并可共享自己的 AI；默认只有几个大国由 AI 扮演，逐国设定放在大厅的“高级设置”里。
- **规则**：只有对方本土全被你或盟友占领、或攻势推进到 80% 以上，才能要求它臣服；中国和美国在四个年代都不会被征服、不会投降、不会臣服；占领区可以直接释放。

### 按中国标准（三个版本相同）

地图用中国标准地图（藏南、阿克赛钦属中国，画出南海诸岛与断续线、钓鱼岛及其附属岛屿，台湾标“台湾省”）；中国不显示政体、不会发生政变，随机事件和危机里没有中国的负面内容；别国不能对中国舆论战、扶植反对派、策动政变；中国不采取隐蔽行动，奉行不首先使用核武器政策、不进行核威胁；涉及中国的表态措辞平和；中国领土（含台湾）上不允许任何外国军队驻扎，盟友也不行，和中国只能结成军事同盟——不能和中国签驻军协定，不能调兵进入中国、请盟友把兵派进中国或向中国派志愿军；开局时的外国驻军撤回本国（载入以前的存档时也一样）。中国在海外驻军不受影响。详见[旧版说明](https://github.com/ZechenBian/zechenbian.github.io/blob/main/tianxia/README.md)。

### 免责声明

本游戏为虚构的战略推演。各国的行动与表态（包括以各国政府机构名义发出的声明）均由游戏规则与 AI 模拟生成，不代表任何国家、政府机构、组织或个人的立场。地图仅为游戏示意。

### 怎么玩

三种玩法、四个开局年代、新手教学、联机与加密、计分与排行榜都和旧版一样，详见[旧版说明](https://github.com/ZechenBian/zechenbian.github.io/blob/main/tianxia/README.md)。

| 模式 | 怎么玩 |
|---|---|
| 联网对战 | 打开网址 → 填昵称 → “联网对战” → 新建一局或加入列表里的对局 → 选一个国家入座；全员“就绪”后由房主的浏览器结算 |
| 同屏轮流 | 几个人轮流用同一台设备 |
| 单人 + 智能体 | 你一个国家，其余国家交给智能体 |

### 全部操作

#### 行动点

每回合 3–6 点。单选表单里的一项、首脑会晤、正式表态、退出一项条约或集团、提高动员等级各按它的点数（大多 1 点）；多选表单按组合计；和 AI 国家签协议 1 点（含同盟或臣服 2 点）；新攻势 2 点、空中支援 1 点；交给 AI 换算的一句话命令 1–3 点。军费、投入方向、调兵、征兵与订单（花钱）、战时政策、对话、公开发言、方针、回应来函与危机、真人之间的协议都不花点。

#### 目标页

| 表单 | 方式 | 内容 |
|---|---|---|
| 公开表态 | 单选 | 公开谴责、公开警告（保护对象、后果）、核威慑 |
| 制裁 | 多选 | 经济制裁（力度 1–3）、加征关税、技术封锁、金融制裁、能源禁运；解除制裁 |
| 援助 | 多选 | 经济援助、贷款、军事援助（金额自填）、派遣志愿军；一次或每季度 |
| 军事施压 | 多选 | 军事演习、海上封锁、护航破封锁 |
| 打击 | 单选 | 精确打击、核打击（战术 / 战略） |
| 隐蔽行动 | 多选 | 网络攻击、舆论战、扶植反对派、破坏行动、技术窃取、制造开战理由、资助抵抗运动、煽动独立、策动政变 |
| 处置领土 | 单选 | 占领区：安抚、扶植傀儡、正式吞并、释放；附庸：吞并附庸、释放 |

表单上方：对话与协议、进攻（作战地图）、协议快捷条款、核心利益阶梯（有危机时）。

#### 其他页

- **本国**：目标与得分、政治、国内措施（维稳温和或强硬、经济刺激、科技投入、情报建设、调查溯源、互信措施、核计划）、领土。
- **军事**：兵力、战线与作战地图（新攻势、空中支援、主攻城市、死守、增兵、调整投入、停止进攻、取消集结）、部队调动、盟军。
- **动员**：军费与投入方向、动员等级 0–5、征兵 + 紧急征召、军工订单 + 突击生产、战争公债、印钞、强制征用 + 紧急征发、掠夺占领区 + 洗劫、占领区征兵 + 强征、强迫劳动。
- **外交**：待处理（危机、通牒、来函）；对话（公开频道、真人私信、AI 国家），每个对话里有首脑会晤和协议表单；条约与计划（逐项退出、退出集团、停止长期援助）；实时数据变更。
- **情报**：各国动向、集结预警、新闻与排行。

#### 输入框

| 方式 | 谁看得到 | 效果 |
|---|---|---|
| 执行 | 结果所有人可见 | 一句话命令：先对应标准操作，对应不上才交给 AI |
| 方针 | 只有推演 | 本回合的总体打算（多人局） |
| 公开 | 所有玩家和各国 AI | 公开发言；勾“正式表态”成为谴责、警告或核威慑（1 点） |
| 对某国 | 对方 | AI 国家：讨价还价；真人：端到端加密的私信 |

---

## English

### What changed

- **One place for everything.** Six tabs: Target, Home, Military, Mobilize, Diplomacy, Intelligence. Comms is folded into Diplomacy; War economy plus the budget and mobilization became Mobilize.
- **Actions merged into eight forms**: public statement, sanctions, aid, military pressure, strike, covert action and disposing of territory on the Target tab, domestic measures on the Home tab — instead of 43 separate buttons.
- **Tick several, type your own amounts**: sanctions, aid, military pressure, covert action and domestic measures take several ticks at once; aid, loans, military aid and domestic spending take typed amounts, and aid can become a standing quarterly programme.
- **The AI prices a package**: one item costs its own points; for several, the rule estimate is their sum minus a bundling discount (one point per two items), plus extra for very large sums; with an AI connected the AI decides within that range and explains why. A queued package shows as one entry and is withdrawn as a whole.
- **Every agreement is negotiated in a conversation**: 23 kinds of terms (alliance, free trade, non-aggression, basing, arms control, ceasefire, peace, vassalage, aid, troops, mobilization…) attached in a conversation on the Diplomacy tab. Signing with an AI country costs 1 point, 2 with an alliance or vassalage; deals between humans are free. Summits are in the conversation too.
- **Leave treaties one at a time** (1 point); leave a bloc and stop standing aid in the same place.
- **Mobilize tab**: budget, priorities, mobilization levels 0–5 (3–5 are total war, which absorbs the old total-war policy; raising costs 1 point and is immediate), conscription and arms orders with typed numbers, war-economy policies, each one-off surge beside its row.
- **Core-interest ladders** moved to the Target tab; each rung is a set of standard actions priced by what it contains.
- **One input box**: choose Do, Strategy, Public or To a country. One-line orders are matched to standard actions first (same cost and effect as the buttons; anything that needs choices opens the right place, pre-filled); only the rest goes to the AI. Public with “formal statement” becomes a condemnation, warning or nuclear threat.
- **AI settings**: each player has one AI source (automatic / only my own / off); the host picks AI usage (light / standard / full) and can share their AI; a few great powers are AI-played by default, with per-country choices under Advanced in the lobby.
- **Rules**: vassalage can be demanded only once the other side's homeland is fully occupied or an offensive against it passes 80%; China and the USA cannot be conquered, surrender or become vassals in any timeline; occupied lands can be released.

Everything else — the three modes, four timelines, tutorial, online play and encryption, scoring — works as in the [original edition](https://github.com/ZechenBian/zechenbian.github.io/blob/main/tianxia/README.md#english).

### China-standard settings (same in all three editions)

The map follows China's standard map (South Tibet and Aksai Chin are part of China; the South China Sea Islands with the dashed line and the Diaoyu Islands are drawn; Taiwan is labelled “Taiwan Province, China”); China shows no government-type label and has no coups, and random events and crises contain nothing negative about China; no country can run propaganda, sponsor an opposition or stage a coup against China; China carries out no covert actions, follows a no-first-use nuclear policy and makes no nuclear threats; statements about China are worded calmly. No foreign forces may be based on Chinese territory (Taiwan included), allies included — with China an alliance is as far as it goes. No basing rights with China, no moving troops in, no asking allies to send troops there and no volunteers; foreign garrisons at the start go home (also when an older save is loaded). China's own bases abroad are unaffected. See the [original edition](https://github.com/ZechenBian/zechenbian.github.io/blob/main/tianxia/README.md#english) for details.

### Disclaimer

This is a fictional strategy simulation. Countries' moves and statements, including those attributed to government institutions, are generated by the game's rules and AI and do not represent any real country, government body, organization or person. The map is for gameplay only.

---

本项目**不是开源项目**。可以在线游玩，但未经书面许可，不得复制、修改、再分发、商用或用于 AI/机器学习训练。详见 [LICENSE](../LICENSE)。

This project is **not open source**. You are welcome to play it online, but you may not copy, modify, redistribute, use commercially, or use it to train AI/ML models without written permission. See [LICENSE](../LICENSE).
