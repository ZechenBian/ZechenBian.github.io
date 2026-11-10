<!-- Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。 -->
<!-- Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。 -->
# English edition · 英文版是怎么来的

The source code is written once, in Chinese. The English pages (`en/index.html` and `quantum/en/index.html`) are generated
at build time: every piece of user-visible Chinese in `src/**/*.js` and `src/**/*.html` is replaced by its translation from
`i18n/en/*.json`; the code itself is not touched. All four pages therefore run the same computation and show the same
numbers. If a Chinese string changes and no translation is supplied, the build fails and names the string.

源码只有一份（中文）。英文页面在构建时生成：把 `src/` 里给人看的中文（JS 字符串和 HTML 片段）换成 `i18n/en/*.json` 里的译文，
代码一个字不动，所以四个页面跑的是同一套计算。改了中文而没补译文，构建会失败并指出是哪一段。页面右上角的「English / 中文」
一键切换；点过之后浏览器记住语言（`localStorage` 的 `genesis.lang`），下次打开直接去那一版。

```
node i18n/i18n.js check                    # report missing, damaged or inconsistent translations
node i18n/i18n.js show <file|all> [regex]  # list units (id, Chinese, current English) whose text matches
node i18n/i18n.js export <dir> [n]         # write the untranslated units as text files for a translator (n = max Chinese characters per file)
node i18n/i18n.js verify <zh> <en…>        # a translator checks a finished batch before handing it in
node i18n/i18n.js import <dir> <files…>    # read translated files back into i18n/en/*.json; <dir> is the export folder
node i18n/i18n.js import - <files…>        # the same for hand-written corrections, with unit ids taken from the current source
node build.js                              # builds all four pages (runs `apply` itself; English sources land in i18n/work/, not committed)
```

A *unit* is one of:

- `html` — the text of one block-level element in an HTML fragment (`src/template.html`, `src/halls/*.html`, `src/q/*.html`),
  including its inline tags (`<b>`, `<span>`, `<i>` …). The tags must stay, in the same order with the same attributes; only
  the text between them is translated.
- `attr` — a `title` / `placeholder` / `aria-label` / `alt` / `value` attribute of an HTML tag.
- `lit` — a string literal in JavaScript; `chain` — a `+` concatenation taken as one sentence; `tpl` — a template string;
  `regex` — a regular expression that matches Chinese. In these, `§0§ §1§ …` stand for pieces of code spliced into the
  sentence; a translation may reorder them but must use each exactly once.

Where things live:

- `en/<file>.json`: the translations of `src/<file>` (slashes in the path become `__`: `halls__bubble.js.json`), keyed by the
  Chinese text (and, where the same Chinese needs different English in different places, by which occurrence it is).
- `en/_terms.json`: names shared across files (halls, particles, buttons, verdicts). A file-level entry wins.
- `en/_allow_han.json` (optional): strings that legitimately keep Chinese characters.
- The settings panel for "Ask the AI" is shared with the strategy lab (`strategy-lab/src/ai.js`); its English comes from
  `strategy-lab/i18n/en/ai.js.json`.

Two safeguards beyond the per-unit checks: a literal that the code compares with `===` / `startsWith` must have the same
English everywhere (`check` reports clashes), and after `apply` every English HTML fragment is scanned for leftover Chinese
outside scripts and comments.

---

# Translator's guide

You are translating a cosmology teaching lab ("Genesis Lab") from Chinese into English. Readers know calculus and basic
physics but not cosmology. The Chinese text is careful and plain; the English must be equally careful and plain.
**Precision first**: every equation, assumption, number and inequality must say exactly what the Chinese says.

## The file format

Each unit looks like this:

```
@@@ app.js#57 | tpl | line 342 | §0§ = fmtT(R.age) ; §1§ = m.T0.toPrecision(3)
奇点之后 §0§。今天的背景温度 §1§ K。
```

Write your translation in the **same format**: copy the `@@@ …` header line unchanged, then put the English text below it.
Translate every unit, in the same order, once. Do not add anything else to the output file.

- `§0§`, `§1§`, … are placeholders for values computed by the code (the header shows the source expression of each). Keep
  each one exactly once; move them wherever English grammar wants them. Never add or drop one.
- `␣` at the very start or end of a unit is a significant space, `↵` a significant newline. Chinese needs no space between
  words; English does. If the unit is a fragment glued to something else, put `␣` where the English needs a space
  (`——这个泡骗不了人` → `␣— this void fools nobody`). Everything in the middle of a unit is literal, including line breaks.
- Units are often **fragments** of a sentence built in code. Read the source around the given line when a fragment is
  unclear, and make the assembled English sentence read correctly.
- For `html` units keep every tag exactly as it is (`<span data-g="omega">…</span>`, `<b class="mono" id="qv-T0"></b>`);
  translate only the text between tags. Entities such as `&lt;` and `&amp;` stay as they are.
- No full-width characters at all in the translation, not even a full-width space (U+3000): `verify` rejects them. Use
  `␣␣` (text) or `&nbsp;&nbsp;` (HTML strings) for a wide gap.

## What must not change

1. **Math**: everything between `$…$` or `$$…$$` is LaTeX and must be copied character for character, including a trailing
   comma or period inside the formula. The only exception is Chinese words inside `\text{…}`, which you translate.
2. **Numbers and symbols**: keep every number, unit and symbol (σ, Ω, Λ, ≈, ≳, →, ×, ±, %, ⁴He, e⁺e⁻, M☉). `亿年` is
   "× 10⁸ yr" when it follows a number produced by the code (`gyr()`), and "hundreds of millions of years" in prose.
3. Identifiers, element ids, CSS variables (`var(--ink)`), JSON keys and object keys used for lookup. Some units are object
   keys that must match a card title elsewhere (the `QG` map in `q/app_q.js`): translate both identically.
4. Literals that the code compares (`startsWith('真引力')`, `=== '计算中'`): the same English everywhere (`check` tells you).

## Style

- American English. Plain, direct sentences; the reader is addressed as "you". No marketing tone, no filler, no
  exclamation marks except where the Chinese has one ("bounce!"). Do not add explanations that are not in the Chinese,
  and do not drop any.
- Sentence case for labels, buttons, chart titles and headings ("Parameters of creation", not "Parameters Of Creation").
  Keep labels short.
- English punctuation only. `X（Y）` → `X (Y)`; `甲：乙` → `A: B`; `、` lists become commas; `——` becomes ` — `.
- Names: use the standard English forms (Friedmann, Lemaître, Gödel, Bianchi IX, Mixmaster, BKL, Kasner, Coleman–De Luccia,
  Guth & Weinberg 1983, Bañados–Teitelboim–Zanelli, Brown–Henneaux, Deser–Jackiw–'t Hooft, Cornish–Spergel–Starkman,
  Alcock–Paczyński, Sachs–Wolfe, Saha, Mészáros, Zel'dovich, BBKS).
- When the Chinese names a hall, button, preset or card, use the English name from `i18n/en/_terms.json` so the text matches
  the interface.

## Vocabulary

| 中文 | English |
|---|---|
| 创世台 / 反推台 / 总览 | Forge / Inference bench / Overview |
| 最初三分钟 | The first three minutes |
| 创世参数 | parameters of creation |
| 尺度因子 / 红移 | scale factor / redshift |
| 大爆炸 / 大坍缩 / 大撕裂 / 反弹 | big bang / Big Crunch / Big Rip / bounce |
| 永远膨胀 / 回转 | expands forever / turnaround |
| 奇点 / 视界 / 粒子视界 / 事件视界 | singularity / horizon / particle horizon / event horizon |
| 哈勃常数 / 哈勃半径 / 哈勃时间 | Hubble constant / Hubble radius / Hubble time |
| 物质 / 辐射 / 暗能量 / 曲率 份额 | matter / radiation / dark-energy / curvature fraction |
| 状态方程 / 幻影能量 | equation of state / phantom energy |
| 平坦 / 开放 / 封闭 | flat / open / closed |
| 减速参数 | deceleration parameter |
| 线性扰动 / 增长 / 坍缩阈值 | linear perturbation / growth / collapse threshold |
| 宜居 / 勉强 / 死寂 | habitable / marginal / dead |
| 宜居诊断 | habitability diagnosis |
| 命运 / 几何 / 年龄 | fate / geometry / age |
| 复合 / 光子退耦 / 最后散射面 | recombination / photon decoupling / last-scattering surface |
| 核合成 / 氘瓶颈 / 中子冻结 | nucleosynthesis / deuterium bottleneck / neutron freeze-out |
| 原初氦丰度 / 氘丰度 | primordial helium abundance / deuterium abundance |
| 重子-光子比 | baryon-to-photon ratio |
| 声学视界 / 标准尺 / 标准烛光 | sound horizon / standard ruler / standard candles |
| 距离模数 / 残差 / 拟合质量 | distance modulus / residual / goodness of fit |
| 有效自由度 / 粒子汤 | effective degrees of freedom / particle soup |
| 电弱相变 / 夸克禁闭 / 湮灭 | electroweak transition / quark confinement / annihilation |
| 暴胀 / 暴胀子 / 再加热 / e-fold 数 | inflation / inflaton / reheating / number of e-folds |
| 扰动幅度 / 谱指数 / 张标比 | perturbation amplitude / spectral index / tensor-to-scalar ratio |
| 德西特温度 | de Sitter temperature |
| 圈量子宇宙学反弹 | loop-quantum-cosmology bounce |
| 闭合类时曲线 / 光锥 / 零测地线 | closed timelike curve / light cone / null geodesic |
| 哥德尔单位 / 转动角速度 | Gödel units / angular velocity of rotation |
| 全天图 / 鬼像 / 匹配圆 | all-sky map / ghost image / matched circles |
| 基本胞腔 / 三维环面 / 烟囱 / 板 | fundamental cell / three-torus / chimney / slab |
| Kasner 时代 / 纪元 / 反弹 / 撞墙 | Kasner era / epoch / bounce / hits the wall |
| 剪切 / 各向异性 / 各向同性 | shear / anisotropy / isotropic |
| 空洞 / 空洞半径 / 过渡宽度 | void / void radius / transition width |
| 径向 / 横向 膨胀率 | radial / transverse expansion rate |
| 偶极 / 哥白尼原理 | dipole / Copernican principle |
| 假真空 / 真空泡 / 成核率 / 泡壁 | false vacuum / vacuum bubble / nucleation rate / bubble wall |
| 永恒暴胀 / 景观 / 测度问题 | eternal inflation / landscape / measure problem |
| 温伯格的彩票 | Weinberg's lottery |
| 亏角 / 锥 / 双像 | deficit angle / cone / double image |
| 霍金温度 / 熵 / 边界中心荷 | Hawking temperature / entropy / boundary central charge |
| 模拟 / 真实 / 文献 / 拟合 / 近似 | simulated / real / literature / fit / approximate |
| 播放 / 暂停 / 慢放 / 重来 / 清空 / 关闭 | Play / Pause / Slow play / Restart / Clear / Close |
| 掷骰子 / 回到我们的宇宙 | Roll the dice / Back to our universe |
| 问 AI / 连接一个 AI | Ask the AI / Connect an AI |
| 读完你自己的发现之后再看 | Read after you have made your own discoveries |
