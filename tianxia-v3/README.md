# 天下棋局 · 联机版 v3 / Tianxia Online v3

[中文](#中文) · [English](#english)

这是 [天下棋局·联机版 v2](https://zechenbian.github.io/tianxia-v2/) 的下一版：行动点改成按百分比计的行动力，一个回合可以做更多事。v2 和[旧版](https://zechenbian.github.io/tianxia/)都保持原样。三个版本的联网对局互不相通，本机存档也分开；AI 接入的设置三版共用。

This is the next edition after [Tianxia Online v2](https://zechenbian.github.io/tianxia-v2/): action points become an action capacity counted in percent, so a turn can hold many more moves. v2 and the [original](https://zechenbian.github.io/tianxia/) stay as they were. Online games and local saves are separate between the three editions; your AI connection settings are shared.

**▶ 在线玩 / Play online:** https://zechenbian.github.io/tianxia-v3/

---

## 中文

### v3 改了什么

- **每回合 100% 的行动力**，代替 3–6 个行动点。每件事占一部分：一句谴责两三个百分点，常规行动 5%–15%，重大行动 10%–30%。一个回合可以做十来件事。
- **花钱的事按金额多占**：金额占本国 GDP 的 0.1% 约多占 5%，0.5% 约 15%，1% 约 25%，2% 约 41%，最多 45%。越大越多，但拆成几笔不会更省。改金额时，旁边的百分比跟着变。
- **本国系数**：国力越强、政局越稳，做同样的事越省力（×0.7–×1.35）。
- **多选组合打折**：两项九折、三项八折、四项以上七折；接了 AI 时由 AI 在范围内判断。
- **协议、动员、阶梯、AI 命令都按百分比**：签一份协议 6% 起（看条款），提高动员每级 6%，交给 AI 换算的命令由 AI 定（5%–40%）。真人之间的协议、调兵、军费、战时政策不占。
- **界面**：顶栏是一条行动力条；表单、队列、按钮上写占用的百分比；帮助里有一张按当前局势现算的小表。

其余（六个页签、合并后的表单、外交页的对话与协议、统一输入框、臣服的前提、中美保底）都和 v2 一样，详见 [v2 说明](https://github.com/ZechenBian/zechenbian.github.io/blob/main/tianxia-v2/README.md)。

### 行动力怎么算

占用 =（基础比例 + 花钱的部分）× 本国系数，四舍五入，至少 1%。

| 位置 | 基础比例（乘本国系数之前；“＋钱”再按金额加） |
|---|---|
| 公开表态 | 谴责 3、警告 5、核威慑 6 |
| 制裁 | 经济制裁 5 / 7 / 9（力度 1–3）、关税 5、技术封锁 6、金融制裁 10、能源禁运 6、解除 3 |
| 援助 | 经济援助、贷款、军援各 3＋钱，志愿军 8＋钱，长期计划 4＋钱 |
| 军事施压 | 演习 5、海上封锁 12、护航 6 |
| 打击 | 精确打击 12、核打击 25 |
| 隐蔽行动 | 网络攻击 6、舆论战 4、扶植反对派 6＋钱、破坏 7、技术窃取 6、开战理由 6、资助抵抗 6＋钱、煽动独立 7＋钱、政变 14＋钱 |
| 处置领土 | 安抚 4＋钱、傀儡 8、吞并 12、吞并附庸 12＋钱、释放 4 |
| 国内措施 | 维稳 3＋钱（强硬 6）、经济刺激 / 科技 / 情报各 3＋钱、溯源 4、互信 5、核计划 14＋钱 |
| 其他 | 首脑会晤 6、退出一项条约 8、退出集团 8、新攻势 15、空中支援 6、提高动员每级 6；征兵与订单只按金额（按一半） |

完整规则与例子见 [行动力规则](行动力规则.md)。

---

## English

### What changed in v3

- **100% action capacity per turn** instead of 3–6 action points. Every move takes a share: a statement a few percent, routine measures 5–15%, heavy ones 10–30%. One turn can hold a dozen moves.
- **Money costs capacity by size**: spending 0.1% of your GDP adds about 5%, 0.5% about 15%, 1% about 25%, 2% about 41%, at most 45%. Bigger sums take more, but splitting them never saves anything. The percentage beside an item changes as you type the amount.
- **Country factor**: bigger, steadier countries spend less on the same move (×0.7 to ×1.35).
- **Packages are discounted**: 10% off for two items, 20% for three, 30% for four or more; with an AI connected, the AI decides within a range.
- **Deals, mobilization, ladders and AI orders in percent too**: signing a deal takes 6% and up depending on its terms, each mobilization level 6%, and orders the AI converts take what the AI decides (5–40%). Deals between humans, troop moves, the budget and war-economy policies take nothing.
- **Interface**: a capacity bar in the top bar; shares shown on forms, the queue and buttons; the help has a small table worked out from the current situation.

Everything else — six tabs, merged forms, conversations and agreements, the single input box, the vassalage condition, the China/USA safeguard — works as in [v2](https://github.com/ZechenBian/zechenbian.github.io/blob/main/tianxia-v2/README.md#english).

---

本项目**不是开源项目**。可以在线游玩，但未经书面许可，不得复制、修改、再分发、商用或用于 AI/机器学习训练。详见 [LICENSE](../LICENSE)。

This project is **not open source**. You are welcome to play it online, but you may not copy, modify, redistribute, use commercially, or use it to train AI/ML models without written permission. See [LICENSE](../LICENSE).
