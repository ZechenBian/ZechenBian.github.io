# 仓库规矩 / Repository rules

这是 Zechen Bian 的个人主页仓库，也放着他的几个网页项目（每个项目一个子目录），以及他给 Claude 写的 skill（`_skills/`，网站不发布）。
GitHub Pages 直接发布 main 分支，服务器上不跑构建，所以**构建出来的页面也要提交**。
任何会话（Claude Code、Claude 网页版、Cowork）改这个仓库之前，先读完这一页。

仓库主人不用终端，他审改动的方式是在 GitHub 上看 PR 的 Files changed。下面的规矩都是为了让他看到的 diff 小、准、可信。

## 项目一览

| 目录 | 源码 | 构建（在该目录里运行） | 测试 |
|---|---|---|---|
| 根目录 | `index.html`、`style.css`（手写，无构建） | — | 冒烟测试 |
| `gravity-slingshot/` | `src/` | `node build.js` → `index.html` | 冒烟测试 |
| `jieya/`（深夜解压铺） | `src/`（`template.html`、`core.js`、每个玩具一个 `toys/NN-<id>.js`，约定见 `jieya/README.md`） | `node build.js` → `index.html` | 冒烟测试 |
| `nobel-lab/` | `src/`；写条目的说明和工具在 `_dev/`（Jekyll 不发布下划线开头的目录） | `python3 build.py --github .` → `index.html`、`literature-peace/index.html` | `_dev/tools/` 里的检查工具，从仓库根目录运行 |
| `strategy-lab/` | `src/`、`i18n/`（英文版译文）、`daily/`（每日一题）、`ml-engine/`（本机 Python 引擎） | 先 `npm install`，再 `python3 build.py` → `index.html`、`en/`、`teen/`、`ml/`、`cases/` | `sh test/run-all.sh`（半小时左右）；单个文件 `node test/xxx.test.js` |
| `tianxia/`、`tianxia-v2/`、`tianxia-v3/`、`tianxia-v4/` | `tianxia/_source/`（四个版本共用一份，见下面"天下棋局"） | 在 `tianxia/_source/` 里：`node build-pages.js` → 四个版本目录的 `index.html`、`auth.html`、`ai-proxy.mjs`；地图数据 `npm install` 后 `npm run map` | 回放比对 `node tianxia/_source/test/replay.js`；冒烟测试 |
| `_skills/` | 每个 skill 一个目录，分三层：`0-flows/`、`1-makers/`、`2-methods/`（使用说明见 `_skills/README.md`） | 无构建 | `python3 _skills/tools/check_skills.py`（从仓库根目录运行） |

## 铁律

1. **源码只有一份，就在这个仓库里。** 不要在仓库外的目录（比如会话的临时目录）开发再复制进来。
2. **不要手改构建产物。** `.gitattributes` 里标了 `linguist-generated` 的文件都是构建出来的：改 `src/`，跑构建，把源码和产物放在同一个提交里。自动检查会重新构建并逐字节比对。
3. **新版本不复制目录。** 新版本靠开关或配置从同一份源码构建出来，旧网址继续可用。需要复制才能做的，先停下来问仓库主人。
4. **不直接推 main。** 每件事一个分支（`<项目>/<简短描述>`，例如 `tianxia/nobase-v1v2`），一个 PR 只做一件事。仓库主人说"合并"才合并。
5. **PR 说明固定写四项：**
   - **改了什么**：用户能看到的变化，一两句话；
   - **为什么**：对应仓库主人的哪个要求；
   - **影响哪些页面 / 版本**：逐个列出；没影响的也说一句；
   - **怎么验证的**：跑了哪些检查和测试，附截图。
6. **开 PR 之前在本地把自动检查跑一遍**（见下），全绿再开。
7. **新页面要登记**：加进 `.github/scripts/pages.json`；构建出来的还要加进 `.gitattributes`。
8. **版权**：全部"保留所有权利"，不是开源。每个页面带 "All rights reserved" 的版权声明；源文件头上的两行版权声明照抄现有文件；不要加任何开源许可证。
9. **密钥不进仓库，也不进页面。** 需要 API key 的功能给输入框，由使用者自己填。测试里的假密钥写成带 `not-a-real` 字样的，例如 `sk-test-0000-not-a-real-key`。
10. **页面断网也要能打开主体**：外部只从 CDN 加载，其余内联。冒烟测试会切断外网打开每个页面。
11. **仓库里不放压缩包，单个文件不超过 10 MB。** 确有必要的例外逐个写进 `.github/scripts/check_rules.py` 的 `LARGE_OK`，写明理由。

## 天下棋局

四个网页版共用 `tianxia/_source/` 里的一份源码（目录名带下划线，网站不发布它；GitHub 上照常可见）。`build.js` 的四个网页版目标逐层叠加：v2 = v1 + `src/web2/`，v3 = v2 + `src/web3/`，v4 = v3 + `src/web4/`；`build-pages.js` 把四个结果写进各版本目录。`build.js` 不带参数和带 `mp` 时生成的是在 Claude 里发布的单人版和联机版，不进仓库。

**各版本的开关在哪里**（页面开头的 `window.TX_*`，引擎载入时读取）：

| 层 | 文件 | 开关 | 生效的版本 |
|---|---|---|---|
| v1 | `src/web/03_world.js` | `TX_PROV`（台湾是中国的省）、`TX_GUARD`（中国不会战败）、`TX_SHIELD`（中国按中国标准处理）、`TX_NOCCP`（不单列中共）、`TX_NOBASE`（中国领土上不许外国驻军） | v1–v4 |
| v2 | `src/web2/00_v2.js`、`src/web2/03b_world2.js` | `TX_V2`、`TX_RULES2`、`TX_GUARD`（加上美国）、`TX_NS`/`TX_LSP`（联网和存档的名字空间） | v2–v4 |
| v3 | `src/web3/00_v3.js` | `TX_V3`、`TX_RULES3`（行动力按百分比）、`TX_NS`/`TX_LSP` | v3–v4 |
| v4 | `src/web4/00_v4.js` | `TX_V4`、`TX_NS`/`TX_LSP` | v4 |

改共享代码（`src/` 下除 `web*/` 以外的文件）会进入所有版本；只想改新版本就加开关。旧版本要不要某条规则，就是在对应那一层加或删一行开关。

**回放比对**：`test/replay.js` 从四个发布的页面里取出页面自己的引擎脚本，在 Node 里运行，每个版本 × 每个开局年代用固定种子推演 12 回合，逐回合和 `test/replay-golden.json` 比对。必须用 Node 22：不同版本的 JavaScript 引擎在浮点运算的最后一位上可能不同，指纹只能在同一版本上比（浏览器的版本各处不同，所以不用浏览器）。结果不同就说明改动改变了玩法：是有意的，就用 `node tianxia/_source/test/replay.js --write` 重新生成并一起提交，在 PR 说明里写明哪些版本变了（replay-golden.json 里的 `cn`、`wars`、`fronts` 是看得懂的数）；不是有意的，就是改出了问题。

**地图**：`build/` 里的三个脚本从 Natural Earth 原始数据（`build/ne/geojson/`，公共领域，见 `THIRD-PARTY-NOTICES.md`）生成 `src/geo.js`、`src/geo_cn.js`（中国标准地图）、`src/cities.js`。图层数据 `src/layers.js` 由 `tools/layers.mjs` 生成，那个目录还没进仓库。

**房间名过滤**：v4 页面里只有词表的哈希（`src/web4/01a_v4nmdata.js`）。明文词表不进仓库（仓库是公开的），由仓库主人自己保存。

涉及地图、涉华表述、中国领土驻军等的改动，在 PR 说明里单独列出，并写明四个版本各自是否生效。

## 自动检查

`.github/workflows/check.yml` 在每个 PR 和每次推到 main 时运行。本地运行方法（仓库根目录）：

```sh
python3 .github/scripts/check_rules.py     # 规矩：页面登记、版权声明、构建产物标记、密钥、压缩包和大文件
python3 .github/scripts/check_rebuild.py   # 重建一致（先在 strategy-lab/ 和 tianxia/_source/ 里各 npm install）
node .github/scripts/smoke.js              # 冒烟测试；可以加过滤词，例如 node .github/scripts/smoke.js tianxia
node tianxia/_source/test/replay.js        # 天下棋局回放比对
python3 _skills/tools/check_skills.py      # skills 库：格式、测试题、三个工作流的总控协议一致
cd strategy-lab && sh test/run-all.sh      # 改到策略实验室时
```

main 的保护规则要求 "All checks · 全部检查" 通过才能合并。检查失败时，先修好，不要绕过。

其他工作流：`strategy-lab-quest.yml` 是每日一题的定时结算，用到仓库 Secrets 里的私钥，改它之前先读 `strategy-lab/daily/README.md`。
