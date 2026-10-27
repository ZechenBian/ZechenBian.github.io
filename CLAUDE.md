# 仓库规矩 / Repository rules

这是 Zechen Bian 的个人主页仓库，也放着他的几个网页项目（每个项目一个子目录）。
GitHub Pages 直接发布 main 分支，服务器上不跑构建，所以**构建出来的页面也要提交**。
任何会话（Claude Code、Claude 网页版、Cowork）改这个仓库之前，先读完这一页。

仓库主人不用终端，他审改动的方式是在 GitHub 上看 PR 的 Files changed。下面的规矩都是为了让他看到的 diff 小、准、可信。

## 项目一览

| 目录 | 源码 | 构建（在该目录里运行） | 测试 |
|---|---|---|---|
| 根目录 | `index.html`、`style.css`（手写，无构建） | — | 冒烟测试 |
| `gravity-slingshot/` | `src/` | `node build.js` → `index.html` | 冒烟测试 |
| `nobel-lab/` | `src/`；写条目的说明和工具在 `_dev/`（Jekyll 不发布下划线开头的目录） | `python3 build.py --github .` → `index.html`、`literature-peace/index.html` | `_dev/tools/` 里的检查工具，从仓库根目录运行 |
| `strategy-lab/` | `src/`、`i18n/`（英文版译文）、`daily/`（每日一题）、`ml-engine/`（本机 Python 引擎） | 先 `npm install`，再 `python3 build.py` → `index.html`、`en/`、`teen/`、`ml/`、`cases/` | `sh test/run-all.sh`（半小时左右）；单个文件 `node test/xxx.test.js` |
| `tianxia/`、`tianxia-v2/`、`tianxia-v3/`、`tianxia-v4/` | **还不在仓库里**（见下面"天下棋局"） | 暂无 | 冒烟测试 |

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
11. **仓库里不放压缩包，单个文件不超过 10 MB。**

## 天下棋局

四个版本的页面都是从**仓库外**的一份源码构建的（页面里的注释提到 `src/engine/01_core.js`、`src/web/02_ai.js`、`build/geo_build_cn.mjs`），版本之间靠页面顶部的 `window.TX_*` 开关区分（`TX_V2`、`TX_RULES3`、`TX_NOBASE` 等）。下一步要把源码放进 `tianxia/src/`，用 `tianxia/editions.json` 写明每个版本开哪些开关，四个页面从同一份源码构建。

在那之前：不要手改这四个 `index.html`；要改天下棋局，先向仓库主人要源码。涉及地图、涉华表述、中国领土驻军等的改动，在 PR 说明里单独列出，并写明四个版本各自是否生效。

## 自动检查

`.github/workflows/check.yml` 在每个 PR 和每次推到 main 时运行。本地运行方法（仓库根目录）：

```sh
python3 .github/scripts/check_rules.py     # 规矩：页面登记、版权声明、构建产物标记、密钥、压缩包和大文件
python3 .github/scripts/check_rebuild.py   # 重建一致（策略实验室要先在 strategy-lab/ 里 npm install）
node .github/scripts/smoke.js              # 冒烟测试；可以加过滤词，例如 node .github/scripts/smoke.js tianxia
cd strategy-lab && sh test/run-all.sh      # 改到策略实验室时
```

main 的保护规则要求 "All checks · 全部检查" 通过才能合并。检查失败时，先修好，不要绕过。

其他工作流：`strategy-lab-quest.yml` 是每日一题的定时结算，用到仓库 Secrets 里的私钥，改它之前先读 `strategy-lab/daily/README.md`。
