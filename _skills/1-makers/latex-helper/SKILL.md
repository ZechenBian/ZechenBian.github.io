---
name: latex-helper
description: 用户用自然语言（常为中文）描述一个数学记号、公式、交换图或排版效果，想知道 LaTeX 怎么写时使用——"这个符号怎么打""公式怎么对齐""编译报错怎么办"都算。直接给可粘贴的代码块、所需宏包、歧义时的多种写法。
---

# LaTeX 速查

## 回答格式

1. 先给代码块（可直接粘贴），再一行说明。
2. 需要宏包，就在代码块上方写 `\usepackage{...}`；不需要就不写。
3. 描述有歧义时给两三种写法，按推荐顺序排，各用一句话说差别。
4. 会反复用的记号，给一个 `\newcommand`，建议放进导言区。
5. 不讲课。用户问一个符号就答一个符号。

## 用户常用领域的默认写法

用户做拓扑场论、K 理论、Langlands，常见记号按下面写：

- 扭 K 理论：`{}^{\tau}K_G(G)`（前上标用空组 `{}` 顶住）；`K^0(\operatorname{Bun}_G(\Sigma))`
- 模空间与栈：`\operatorname{Bun}_G`、`\mathcal{M}_g`、`\mathbb{R}\Gamma`
- 环群：`LG`、`\Omega G`、`\widetilde{LG}`；仿射李代数 `\widehat{\mathfrak{g}}_k`
- 范畴：`\mathrm{QCoh}(G)`、`\mathrm{MF}^{\tau}_G(G; W_\tau)`、`\operatorname{Rep}(C_0(G))`
- 映射用 `\colon`：`f\colon X\to Y`；多字母算子用 `\operatorname{}`（`\operatorname{Ind}`、`\operatorname{Hom}`）
- 交换图：`tikz-cd`；弦图、编织图：`tikz`
- 中文文档：`ctex`（`\documentclass{ctexart}`）

## 常见坑

- `\mathrm` 与 `\mathit`：多字母名用 `\mathrm` 或 `\operatorname`，否则会被当成变量相乘。
- 定界符：`\left\{ ... \right.` 必须成对；长公式用 `\bigl( \bigr)` 手动控制大小。
- 对齐：多行用 `align` / `aligned`，不要用 `eqnarray`。
- 空格：`\,` `\;` `\quad`；微分写 `\,\mathrm{d}x`。
- 前上标要 `{}^{\tau}`，否则会粘到前一个符号上。

## 编译报错

用户贴报错时：先指出出错行和原因，再只给修好的那一段，不重写整个文件。

## 版本

- v1.1 · 2026-10-28：只加版本记录与测试题。先编译再给、触发率测试、个人宏文件三条（LH1–LH3）暂缓。
- v1 · 2026-10：初版。

© 2026 Zechen Bian · All rights reserved / 保留所有权利
