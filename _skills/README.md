# 我的 Skills · 分层工作流

这里是我给 Claude 写的 skill（可复用的做事规程），共 14 个，分三层：最上层 3 个工作流负责把事情串起来，下面两层是具体的方法和产出。

目录名以下划线开头，GitHub Pages 不发布它（网站上看不到），在 GitHub 上照常可见。

## 一张图

```mermaid
flowchart TB
  subgraph L0["第 0 层 · 工作流（入口）"]
    FP["flow-project<br/>项目：想法 → 上线"]
    FR["flow-research<br/>研究：提问 → 成稿"]
    FA["flow-ambition<br/>提标：一张单子"]
  end
  subgraph L1["第 1 层 · 方法"]
    KA[kickoff-assessment]
    AL[altitude]
    DN[deeper-not-bigger]
    AA[assumption-audit]
    AC[assemble-the-crew]
    CC[citation-check]
  end
  subgraph L2["第 2 层 · 产出"]
    LB[lab-builder]
    RW[research-writeup]
    FN[flavored-notes]
    LH[latex-helper]
    QC[quant-interview-coach]
  end
  FP --> KA
  FP --> FA
  FP --> LB
  FR --> RW
  FR --> FN
  FR --> AA
  FR --> FA
  FA --> AL
  FA --> DN
  FA --> AA
  FA --> AC
  RW --> CC
  FN --> CC
  RW -. 用它的 PDF 构建脚本 .-> FN
```

箭头表示“会调用”。latex-helper 和 quant-interview-coach 不在任何工作流里，单独用。

## 怎么用

### 三条工作流

| 工作流 | 什么时候用 | 怎么叫 | 会发生什么 | 你要做的 |
|---|---|---|---|---|
| `flow-project` | 有个新项目想法（游戏、互动页、实验室、agent、工具），想从评估一路推进到上线 | “用 flow-project 推进 ××”，或“从评估到上线带我走一遍” | 盘点 → 评估 → 提标（可选）→ 样本（过独立试玩）→ 铺开（过抽查）→ 合并 | 每轮批一张批示单；说“合并”才会合并 |
| `flow-research` | 一个研究问题要做成能存档的成稿：总结、指定风格的笔记、检验一个结论 | “用 flow-research 写 ××”，或直接说“总结一下 ××，做成成稿” | 分流 → 写第一版 → 核引用 → 检验（有数据时）→ 独立审稿 → 出 PDF → 随追问生长 | 看成稿，追问；只有真有歧义时才会给你批示单 |
| `flow-ambition` | 想把手上一件事往大了做、做深、做到顶尖水准 | “往大了做 ××”“提标”“用 flow-ambition” | 四个方法各自分析，合成一张提标单；批完按选定的条目执行 | 批一张提标单 |

例子：

- “我想做一个看星空认星座的网页小游戏，给初中生用。用 flow-project 带我走一遍。”
- “用 flow-research 把 Atiyah–Bott 的 Yang–Mills 那套理论写成一份能存档的成稿。”
- “下周给导师汇报这学期的进展，帮我准备十页幻灯片。往大了做。”

### 单独用

每个 skill 都可以单独触发，工作流只在要走完整流程时才需要。比如“这个符号怎么打”会直接用 `latex-helper`；“先评估一下，先别建”会直接用 `kickoff-assessment`；一两句话能说清的小事，工作流也会直接放行。

### 总控协议（三个工作流共用）

1. **先看再问**：先查对话里的文件、记忆、已连接的应用、仓库和之前的批示文档，能查到的不问。
2. **一轮一张批示单**：每轮要你拍板的事合成一张单子，逐条编号，你逐条批（采纳 / 改后采纳 / 暂缓 / 不做）。4 条以内用提问工具，更多用“逐条批示版”文档。
3. **原任务保底**：你原来要的东西照交；提标只加不换；发送、发布、删除、部署、合并、花钱、建定时任务都先问。
4. **关口过独立核验**：每个阶段的成品交给一个没看过过程的子 agent 去审，结果分成已修 / 接受风险 / 需要你决定。
5. **没人在场时**：按推荐项做可逆的部分，开头写明按哪种理解做的；不可逆的停在决定前。
6. **小任务直通**：一两句话的小事不走流程。
7. **记进度**：跨轮的工作有一张“进度”表，回来时从停下的地方接着做。
8. **环境不够就交接**：跑不了代码、读不到数据时，交一段能直接粘贴进 Claude Code 的提示。

## 全部 skill

| 层 | skill | 做什么 | 版本 |
|---|---|---|---|
| 0 工作流 | `flow-project` | 项目从想法到上线：评估、提标、样本、铺开、合并 | v1 |
| 0 工作流 | `flow-research` | 研究问题从提问到成稿：写、核、验、审、交付 | v1 |
| 0 工作流 | `flow-ambition` | 把四个提标方法合成一张提标单，批完再执行 | v1 |
| 1 方法 | `kickoff-assessment` | 新项目先评估、不开工；有压力测试模式 | v2 |
| 1 方法 | `altitude` | 往上抽一层：四层阶梯，每层有裁判和首个探针 | v2 |
| 1 方法 | `deeper-not-bigger` | 按顶尖从业者的材料、方法和可查的标准重写任务 | v2 |
| 1 方法 | `assumption-audit` | 用原始材料检验默认结论：先封存留出集、跑规格网格、隔离的对手 | v2 |
| 1 方法 | `assemble-the-crew` | 跨领域团队加红队盲审 | v2 |
| 1 方法 | `citation-check` | 引用核验的唯一规则：什么算核实、预算、台账 | v1 |
| 2 产出 | `lab-builder` | 浏览器实验室与小游戏的建造规程，样本过独立试玩 | v2 |
| 2 产出 | `research-writeup` | 跨学科研究级总结：四问纲领、命题台账、独立审稿、PDF | v2 |
| 2 产出 | `flavored-notes` | 指定风格的数学物理笔记（PDF + Markdown），带风味盲测 | v2 |
| 2 产出 | `latex-helper` | 自然语言描述 → 可粘贴的 LaTeX | v1.1 |
| 2 产出 | `quant-interview-coach` | 量化面试准备、限时陪练（只判不答）、面完复盘 | v2 |

每个 skill 的目录里：`SKILL.md` 是规程本身，文末有版本记录；`evals/` 是测试题（见“维护”）。

## 安装与同步

仓库里按层分目录，而 claude.ai 和 Claude Code 都要求每个 skill 是一个平铺的 `名字/SKILL.md` 文件夹，所以安装时要“拍平”。

**claude.ai（网页、桌面、手机）**

- 推荐：在对话里请 Claude 为改过的 skill 出“保存 skill”的卡片，点保存。
- 也可以上传压缩包：在仓库根目录运行 `python3 _skills/tools/sync_skills.py pack ~/Desktop/skills-zip`，再到 claude.ai 的设置里逐个上传。压缩包要放在仓库外面（仓库里不放压缩包）。
- 自己上传的 skill 在技能列表里有时显示成 `anthropic-skills:名字`，工作流按名字找，不受影响。

**Claude Code**

- `python3 _skills/tools/sync_skills.py install`：装到 `~/.claude/skills/`；同名的旧版本先挪进 `.backup-时间戳/`。
- `python3 _skills/tools/sync_skills.py list`：列出全部 skill 和版本。

## 维护

- **改一个 skill**：批示 → 改 `SKILL.md` → 改或加测试题 → 文末版本记录加一条 → 跑检查 → 开 PR（规矩见仓库根目录 `CLAUDE.md`）。
- **检查**：`python3 _skills/tools/check_skills.py`。它查名字和描述是否合规、有没有版本记录和版权行、测试题是否齐全、三个工作流的总控协议是否一致、这份说明是否列出了每个 skill。
- **测试题**：每个 skill 的 `evals/` 里有 3 道任务题（skill-creator 的用例格式：`prompt.md`、`case.yaml`、`graders/`）和 `trigger_eval.json`（10 句该触发或不该触发的问法，一半是容易混淆的近邻）。可以在对话里请 Claude 用 skill-creator 跑；有 Claude Code 的话，在某个 skill 的目录里运行 `claude plugin eval .`（真实计费）。测试用的数据都是合成的，文件里写明了。
- **总控协议**：三个工作流里的那一段要逐字相同，改的时候三处一起改。
- **暂缓的改动**（2026-10-28 批示时暂缓）：LB1 试玩脚本进自动检查；LB4 机制库每类一页模板；LH1 先编译再给、交换图附渲染图；LH2 测 latex-helper 的触发率；LH3 个人宏文件；DN3 “沉淀”走更新卡片、专家工具表设上限；AC1 子 agent 任务书固定格式；AC3 最小团队与用量。

## 没收进来的 skill

账户里另外 14 个是从别人的仓库导入的，各有自己的许可证，不收进这里：

- [tradermonty/claude-trading-skills](https://github.com/tradermonty/claude-trading-skills)：backtest-expert、options-strategy-advisor、position-sizer、residual-edge-analyzer、trade-hypothesis-ideator
- [wshobson/agents](https://github.com/wshobson/agents)：backtesting-frameworks、risk-metrics-calculation、quant-analyst
- [K-Dense 科研技能库](https://github.com/K-Dense-AI/claude-scientific-skills)：qiskit、pennylane、qutip、sympy、scientific-schematics
- persona（Hajime Takeda，MIT）

按 2026-10-28 的批示：回测类以 backtest-expert 为主，backtesting-frameworks 的描述收窄为“写回测框架代码”，quant-analyst 停用；scientific-schematics 要用就放行 openrouter.ai 并提供 key，不用就停用。

---

© 2026 Zechen Bian · All rights reserved / 保留所有权利。非开源，见仓库根目录 LICENSE。
