# 天下棋局 · 联机版 v4 / Tianxia Online v4

[中文](#中文) · [English](#english)

这是 [天下棋局·联机版 v3](https://zechenbian.github.io/tianxia-v3/) 的下一版：加入十个单机任务、每回合的局势说明、简化模式、详细教程与行动手册、更多地图动画；联网房间的名称按现行规定检查，房间可以设密码。v3、v2 和[旧版](https://zechenbian.github.io/tianxia/)都保持原样。各版本的联网对局互不相通，本机存档也分开；AI 接入的设置各版共用。

This is the next edition after [Tianxia Online v3](https://zechenbian.github.io/tianxia-v3/): ten solo missions, a situation briefing every turn, a simple mode, a detailed tutorial with an action handbook, and more map animations; online room names are checked against current rules and rooms can have a password. v3, v2 and the [original](https://zechenbian.github.io/tianxia/) stay as they were. Online games and local saves are separate between editions; your AI connection settings are shared.

**▶ 在线玩 / Play online:** https://zechenbian.github.io/tianxia-v4/

---

## 中文

### v4 新增了什么

**1. 房间名与密码**

- 房间名（最多 24 个字）和联网昵称（最多 16 个字）按《互联网用户账号信息管理规定》《网络信息内容生态治理规定》等现行规定检查：只能用汉字、字母、数字、空格和常用标点，不能用表情或旗帜符号；不能含网址、邮箱、联系方式或长串数字；不能冒用“官方”“客服”“管理员”、党政军机关或新闻媒体的名称，不能擅自使用“新闻”“报道”；不能含违法和不良信息。不合规的名称不能创建；别的玩家看到的名称也会再查一遍，不合规的自动换成默认名称。违禁词表只以散列值放在页面里，不出现明文。
- 房主可以给房间设密码（4–32 个字符）。设了密码的房间在列表里显示 🔒，凭密码才能进入；对局内容（局势、私信、命令）用密码派生的密钥加密，中继上看不到。密码只保存在各人自己的浏览器里，不会发给中继或其他人，忘了无法找回——把邀请链接和密码分开发给朋友。

**2. 十个单机任务**

选一个年代和国家，完成一个限时任务。推演规则和完整对局一样，只是每回合连算 2 个季度（半年）或 4 个季度（一年）；目标每个季度都判定，达成就立即完成，不用等到最后统一结算。出现需要你决定的事（危机、通牒、有国家对你开战）时，推演提前停下交给你。按用掉的时间评星，最佳成绩存在本机。

| 年代 | 国家 | 任务 | 每回合 | 期限 | 目标 |
|---|---|---|---|---|---|
| 1939 | 英国 | 孤岛求援 | 半年 | 1942 年底 | 与美国结盟、让美国对德作战、军力达到开局的 1.25 倍、守住本土 |
| 1939 | 苏联 | 卫国战争：坚守 | 半年 | 1943 年底 | 与英国或美国结盟；坚持到期限，届时本土仍在、德军攻势进度不超过 40%、稳定不低于 30 |
| 1939 | 美国 | 民主国家的兵工厂 | 半年 | 1942 年底 | 援助英国 3 次、援助中国 3 次、军力达到开局的 1.5 倍 |
| 1945 | 美国 | 复兴欧洲 | 半年 | 1950 年底 | 英、法、德 GDP 合计达到开局的 1.25 倍，与其中至少两国结盟 |
| 1945 | 英国 | 战后重建 | 半年 | 1950 年底 | GDP 达到开局的 1.2 倍、稳定不低于 65、国库转为正数 |
| 1979 | 中国 | 改革开放 | 一年 | 1989 年底 | GDP 达到开局的 2 倍，与美国、日本签订自贸协定 |
| 1979 | 印度 | 不结盟的平衡 | 半年 | 1984 年底 | 与美国、苏联的关系都达到 40，GDP 达到开局的 1.25 倍 |
| 2026 | 中国 | 高水平开放 | 半年 | 2031 年底 | 5 个自贸协定、科技达到 95、GDP 达到开局的 1.15 倍 |
| 2026 | 印度 | 跻身前三 | 一年 | 2036 年底 | GDP 超过日本和德国，与美国、俄罗斯的关系都保持在 30 以上 |
| 2026 | 韩国 | 半岛和解 | 半年 | 2031 年底 | 与朝鲜关系回升到 0 以上并签订互不侵犯条约，期间不与朝鲜发生战争 |

每个任务都用规则推演反复试过：按说明里的提示打，在期限内能够完成。默认只用规则推演（最快）；接入了 AI 时，可以选择每回合第一个季度用 AI 推演各国的反应。

**3. 每回合的局势说明**

不管这回合有没有行动，战报里都有一节“局势说明”，解释国力与国际局势为什么这样变：GDP 增长按引擎的公式拆成基础增速、科技、自贸、援助与刺激、制裁、战争、动员、军费、债务等各项（加起来就是实际增长），稳定、国库、军力也各自列出来源；下面分国内政策（本回合的措施与仍在起作用的政策）、对外行动（对每个国家做了什么、关系与影响力怎么变、各国的反应）、国际局势（新的战争与停战、结盟、经济与军力排名、紧张程度）和下回合要留意的事。本机结算（单人、同屏、房主）时分解是精确的；联网的其他玩家按结算后的局面估算，房主的说明随后同步过来。

**4. 简化模式**

开局画面和游戏菜单里可以打开。只显示最常用的行动：目标页一组按钮（峰会、援助、提议自贸 / 互不侵犯 / 结盟、停火 / 和平、谴责、制裁、军演、进攻），每个写一句作用、占多少行动力、花多少钱、对方多半同不同意；本国页是参谋建议（最多三条，点“照办”直接排进本回合；单机任务里按任务目标给建议）和国内常用措施。完整面板收在下面，随时可以展开。只改界面，不改规则。

**5. 详细教程与行动手册**

保留原来约 3 分钟的快速教程；新增约 10 分钟的详细教程，逐项讲清顶栏、行动力、地图视图、目标页、行动表单、协议、队列、输入框、本国页、计分、军事、动员、外交、情报、结算、战报与局势说明。行动手册列出每一个行动和协议条款的作用、代价、风险和机制，以及回合怎么结算（行动力、结算顺序、GDP 增长、稳定、国库、军力、关系与影响力、信誉、战争）；有对局时还按你当前的国家实时算出占多少行动力、花多少钱、预估效果。

**6. 地图动画**

每回合看完战报后，地图上用动画表现这回合的事：援助与军援（物资沿弧线运过去）、贸易（双向流动）、会晤与结盟、制裁、警告、封锁、军演、打击、开战与交火、占领、停战、击退、吞并与政变、独立、决裂、动员、核计划等，底部写一行小结；与你有关的优先，地图右上角的 ▶ 可以回放。手机上只播与你有关或重大的几项；系统设置为“减少动态效果”或在图层面板里关掉时不播。

其余（行动力按百分比、六个页签、合并后的表单、外交页的对话与协议、统一输入框、协议回合结束时统一结算、中国领土上不允许外国驻军）都和 v3 一样，详见 [v3 说明](https://github.com/ZechenBian/zechenbian.github.io/blob/main/tianxia-v3/README.md)。

### 按中国标准（各版本相同）

地图用中国标准地图（藏南、阿克赛钦属中国，画出南海诸岛与断续线、钓鱼岛及其附属岛屿，台湾标“台湾省”）；中国不显示政体、不会发生政变，随机事件和危机里没有中国的负面内容；别国不能对中国舆论战、扶植反对派、策动政变；中国不采取隐蔽行动，奉行不首先使用核武器政策、不进行核威胁；涉及中国的表态措辞平和。v4 新增的任务、说明、教程与动画同样遵循这些设置（中国处在敌对行动被动一方时，地图动画不写文字标签）。详见[旧版说明](https://github.com/ZechenBian/zechenbian.github.io/blob/main/tianxia/README.md)。

### 免责声明

本游戏为虚构的战略推演。各国的行动与表态（包括以各国政府机构名义发出的声明）均由游戏规则与 AI 模拟生成，不代表任何国家、政府机构、组织或个人的立场。地图仅为游戏示意。

---

## English

### What's new in v4

**1. Room names and passwords**

- Room names (up to 24 characters) and online nicknames (up to 16) are checked against current Chinese rules on online account names and content: only Chinese characters, letters, digits, spaces and common punctuation — no emoji or flag symbols; no links, email addresses, contact details or long strings of digits; no impersonating “official”, “support” or “admin” accounts, government, party or military bodies or news media, and no unauthorized use of words like “news”; nothing unlawful or harmful. Names that fail can't be created, and names coming from other players are checked again and replaced with a default if they fail. The banned-term list is embedded only as hashes, never in plain text.
- The host can give a room a password (4–32 characters). Password rooms show 🔒 in the list and need the password to enter; the game contents (the world state, private messages, orders) are encrypted with a key derived from the password, so the relays can't read them. The password stays in each player's own browser and is never sent to the relays or anyone else; if it's lost it can't be recovered — send the invite link and the password to your friends separately.

**2. Ten solo missions**

Pick an era and a country and complete a timed goal. The rules are the same as a full game, but each turn runs 2 quarters (half a year) or 4 quarters (a year) back to back; goals are checked every quarter and you win the moment they are met, with no final tally. If something needs your decision (a crisis, an ultimatum, a declaration of war on you), the run stops early and hands control back. Stars depend on how much time you used; your best results are kept in this browser.

| Era | Country | Mission | Per turn | Deadline | Goals |
|---|---|---|---|---|---|
| 1939 | United Kingdom | Britain Calls for Help | ½ year | end of 1942 | Ally with the US, bring it into the war on Germany, reach 1.25× starting military power, keep the homeland |
| 1939 | Soviet Union | The Patriotic War: Hold the Line | ½ year | end of 1943 | Ally with Britain or the US; hold out to the deadline with the homeland intact, German progress at 40% or less and stability 30+ |
| 1939 | United States | Arsenal of Democracy | ½ year | end of 1942 | Aid Britain 3 times, aid China 3 times, reach 1.5× starting military power |
| 1945 | United States | Rebuild Europe | ½ year | end of 1950 | Combined GDP of Britain, France and Germany at 1.25× the start; ally with at least two of them |
| 1945 | United Kingdom | Postwar Recovery | ½ year | end of 1950 | GDP at 1.2× the start, stability 65+, treasury back above zero |
| 1979 | China | Reform and Opening Up | 1 year | end of 1989 | Double GDP; trade agreements with the US and Japan |
| 1979 | India | The Non-Aligned Balance | ½ year | end of 1984 | Relations of 40+ with both the US and the Soviet Union; GDP at 1.25× the start |
| 2026 | China | High-Level Opening Up | ½ year | end of 2031 | 5 trade agreements, technology 95, GDP at 1.15× the start |
| 2026 | India | Into the Top Three | 1 year | end of 2036 | Overtake Japan and Germany in GDP while keeping relations of 30+ with the US and Russia |
| 2026 | South Korea | Peninsula Reconciliation | ½ year | end of 2031 | Relations with North Korea back to 0+ and a non-aggression pact, without any war with it |

Every mission was played through repeatedly on the rule engine: following the tips in its briefing, it can be completed before the deadline. Missions use the rule engine by default (fastest); with an AI connected you can choose to have the AI play other countries' reactions in the first quarter of each turn.

**3. A situation briefing every turn**

Whether or not you acted, each report has a “situation briefing” explaining why your national strength and the world changed: GDP growth is broken down by the engine's formula into baseline, technology, trade, aid and stimulus, sanctions, war, mobilization, military spending, debt and more (they add up to the actual growth), and stability, treasury and military power each list their sources; below come domestic policy (this turn's measures and policies still in effect), foreign moves (what you did to each country, how relations and influence moved, how others reacted), the international situation (new wars and ceasefires, alliances, economic and military rankings, tension) and what to watch next turn. When the turn resolves on your machine (solo, hot-seat, or as host) the breakdown is exact; other online players see an estimate from the resolved state until the host's briefing syncs over.

**4. Simple mode**

Switch it on from the start screen or the game menu. It shows only the most common actions: a set of buttons on the Target tab (summit, aid, propose trade / non-aggression / alliance, ceasefire / peace, condemn, sanction, exercise, attack), each with a one-line explanation, its capacity cost, its money cost and the odds the other side agrees; on the Home tab an advisor (up to three suggestions — “Do it” queues them; in missions it advises on the mission goals) and common domestic measures. The full panels stay one click away. It changes only the interface, not the rules.

**5. Detailed tutorial and action handbook**

The original quick tutorial (about 3 minutes) is still there; the new detailed tutorial (about 10 minutes) explains the top bar, capacity, map views, the Target tab, action forms, deals, the queue, the input box, the Home tab, scoring, the Military, Mobilization, Diplomacy and Intel tabs, turn resolution, the report and the situation briefing. The action handbook explains every action and deal term — effect, cost, risk and mechanism — and how a turn resolves (capacity, order of resolution, GDP growth, stability, treasury, military power, relations and influence, reputation, war); in a game it also shows live figures for your country: capacity, cost and expected effect.

**6. Map animations**

After each report the map animates what happened this turn: aid and arms shipments travelling along arcs, two-way trade flows, summits and alliances, sanctions, warnings, blockades, exercises, strikes, war and clashes, occupation, armistice, repelled offensives, annexations and coups, independence, splits, mobilization, nuclear programmes and more, with a one-line summary at the bottom; moves involving you come first, and ▶ at the top right of the map replays them. On phones only the few moves that involve you or are major are shown; nothing plays when your system asks for reduced motion or when animations are turned off in the layers panel.

Everything else — capacity in percent, six tabs, merged forms, conversations and agreements, the single input box, agreements settled at turn end, no foreign troops on Chinese territory — works as in [v3](https://github.com/ZechenBian/zechenbian.github.io/blob/main/tianxia-v3/README.md#english).

### China-standard settings (same in all editions)

The map follows China's standard map (South Tibet and Aksai Chin are part of China; the South China Sea Islands with the dashed line and the Diaoyu Islands are drawn; Taiwan is labelled “Taiwan Province, China”); China shows no government-type label and has no coups, and random events and crises contain nothing negative about China; no country can run propaganda, sponsor an opposition or stage a coup against China; China carries out no covert actions, follows a no-first-use nuclear policy and makes no nuclear threats; statements about China are worded calmly. v4's missions, briefings, tutorial and animations follow the same settings (map animations add no text label when China is on the receiving end of a hostile move). See the [original edition](https://github.com/ZechenBian/zechenbian.github.io/blob/main/tianxia/README.md#english) for details.

### Disclaimer

This is a fictional strategy simulation. Countries' moves and statements, including those attributed to government institutions, are generated by the game's rules and AI and do not represent any real country, government body, organization or person. The map is for gameplay only.

---

本项目**不是开源项目**。可以在线游玩，但未经书面许可，不得复制、修改、再分发、商用或用于 AI/机器学习训练。详见 [LICENSE](../LICENSE)。

This project is **not open source**. You are welcome to play it online, but you may not copy, modify, redistribute, use commercially, or use it to train AI/ML models without written permission. See [LICENSE](../LICENSE).
