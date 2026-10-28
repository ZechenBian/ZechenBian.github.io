# 诺奖思想实验室 · Nobel Ideas Lab

[中文](#中文) · [English](#english)

把诺贝尔奖的关键发现亲手“还原”出来的网站。单个网页文件，全部在浏览器里运行，不用登录、不用安装。

**▶ 在线打开 / Open online:** https://zechenbian.github.io/nobel-lab/

**▶ 文学与和平 / Literature & Peace:** https://zechenbian.github.io/nobel-lab/literature-peace/

---

## 中文

### 怎么玩

每一项都从当年真实的现象或难题开始。你手里只有那个时代的仪器和数据：去测量、拟合、猜测、拼装，一关一关把关键发现重新做出来。卡住了可以看提示（每关三条，一条比一条直接），也可以放弃看答案或直接揭晓。

完成全部关卡后，会展开这一项的完整故事：历史背景、核心观察、核心思想、推导与公式、后续影响、常见误解和原始文献，旁边有一个可以随意摆弄的答案演示。

### 现在有什么

目前上线 28 项（2026 年 10 月），计划扩充到 50 项：

- **物理学：** 伦琴 X 射线、普朗克能量子、爱因斯坦光电效应、玻尔原子、薛定谔与狄拉克、量子霍尔效应、宇宙加速膨胀、希格斯机制、拓扑相变、LIGO 引力波、贝尔不等式
- **化学：** 居里夫人、哈伯合成氨、吉奥克低温热力学、PCR、CRISPR
- **生理学或医学：** 胰岛素、DNA 双螺旋、霍奇金–赫胥黎、操纵子、HIV 与 HPV、iPS 细胞、青蒿素、免疫检查点、mRNA 疫苗
- **经济学：** 索洛增长模型、期权定价、柠檬市场

首页的思想谱系图按学科和年份排开。一条连线两端的两项都还原之后，连线上才会显示两项突破之间的关系。进度只保存在你自己的浏览器里。

文学奖和和平奖没有标准答案，不适合做成“还原”，单独做成了两段互动体验：马尔克斯（1982）的“马孔多，一百年”，以及曼德拉与德克勒克（1993）的“从牢房到投票站”，其中有一个可以扮演任一方的谈判游戏。

### 说明

- 挑战里的实验数据是带噪声的模拟数据。为了让问题可解而做的简化，页面上标注为“示意”或“简化”。
- 史实、颁奖词和公式已经核对；有争议的数字给出范围。
- 文学作品和演讲只做转述，不引用原文。

### 开发

- `src/`：页面源码。`core.js` 是共用的界面和关卡框架；`content1.js`–`content3.js` 和 `content/` 是每一项的文字；`challenges/` 是还原挑战；`labs/` 是答案演示；`humanities/` 和 `hum_app.js` 是文学与和平。
- `python3 build.py --github .` 生成本目录下的 `index.html` 和 `literature-peace/index.html`。
- 一个新条目写完三个文件（`content/`、`challenges/`、`labs/` 里同名的 `.js`）并通过检查后，把它的 id 加进 `build.py` 里的 `READY` 列表才会上线。
- `_dev/` 里是写条目用的说明文档和检查工具，不会发布到网站上；工具从仓库根目录运行（例如 `python3 nobel-lab/_dev/tools/harness.py <id>`），直接读写本目录的 `src/`。

---

## English

### How it works

Each entry starts from the real phenomenon or difficulty of its time. You get only the instruments and data of that era: measure, fit, guess and assemble, stage by stage, until you have rebuilt the key discovery yourself. If you get stuck there are three hints per stage, each more direct than the last, and you can give up on a stage or reveal everything at once.

When you finish every stage, the full story unlocks: historical background, the decisive observation, the core idea, derivations and formulas, what followed, common misconceptions and the original papers, next to an answer demo you can play with freely.

### What is there

28 entries are online so far (October 2026); the plan is 50:

- **Physics:** Röntgen's X-rays, Planck's quanta, Einstein's photoelectric effect, Bohr's atom, Schrödinger and Dirac, the quantum Hall effect, the accelerating universe, the Higgs mechanism, topological phase transitions, LIGO, Bell inequalities
- **Chemistry:** Marie Curie, Haber's ammonia synthesis, Giauque's low-temperature thermodynamics, PCR, CRISPR
- **Physiology or Medicine:** insulin, the DNA double helix, Hodgkin–Huxley, the operon, HIV and HPV, iPS cells, artemisinin, immune checkpoints, mRNA vaccines
- **Economics:** the Solow growth model, option pricing, the market for lemons

The idea-lineage map on the home page lays the prizes out by field and year. The relation written on a link appears only after you have solved the entries at both ends. Your progress is stored only in your own browser.

The Literature and Peace prizes have no right answers to rediscover, so they are separate interactive pieces: García Márquez (1982), "Macondo, a Hundred Years", and Mandela and de Klerk (1993), "From Cell to Ballot Box", which includes a negotiation game you can play from either side. The pages are in Chinese.

### Notes

- Experimental data in the challenges are simulated with noise. Simplifications made to keep a problem solvable are marked 示意 (schematic) or 简化 (simplified) on the page.
- Historical facts, prize citations and formulas have been checked; disputed numbers are given as ranges.
- Literary works and speeches are paraphrased, never quoted.

### Development

- `src/`: page sources. `core.js` is the shared UI and stage framework; `content1.js`–`content3.js` and `content/` hold each entry's text; `challenges/` the rediscovery challenges; `labs/` the answer demos; `humanities/` and `hum_app.js` the Literature & Peace page.
- `python3 build.py --github .` writes `index.html` and `literature-peace/index.html` in this folder.
- A new entry goes live once its three files (same-named `.js` in `content/`, `challenges/` and `labs/`) are written and checked and its id is added to the `READY` list in `build.py`.
- `_dev/` holds the writing guides and test tools for entries. It is not published on the website. Run the tools from the repository root (for example `python3 nobel-lab/_dev/tools/harness.py <id>`); they read and write this folder's `src/` directly.

---

## 版权 / Copyright

© 2026 Zechen Bian. 保留所有权利 / All rights reserved.

本项目**不是开源项目**。可以在线使用，但未经书面许可，不得复制、修改、再分发、商用或用于 AI/机器学习训练。详见 [LICENSE](../LICENSE)。页面从 CDN 加载的 MathJax 和 Google Fonts 网页字体是第三方作品，按各自的许可使用。

This project is **not open source**. You are welcome to use it online, but you may not copy, modify, redistribute, use commercially, or use it to train AI/ML models without written permission. See [LICENSE](../LICENSE). MathJax and the Google Fonts web fonts, which the pages load from CDNs, are third-party works used under their own licences.
