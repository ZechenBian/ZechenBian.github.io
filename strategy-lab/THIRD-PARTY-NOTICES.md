# Third-party notices · 第三方声明

`index.html`、`en/index.html` 和 `ml/index.html` 里内联了下面这个库的发行文件（样式、脚本和字体）。源码目录 `src/` 里没有第三方代码；机器学习实验室（`src/ml/`、`ml/index.html`）另外嵌了四份第三方的数据，许可见文末“数据”一节。

The built pages `index.html`, `en/index.html` and `ml/index.html` inline the distribution files (stylesheet, script and fonts) of the library below. The source directory `src/` contains no third-party code; the Machine Learning Lab (`src/ml/`, `ml/index.html`) also embeds four third-party datasets, whose licences are listed under "Data" at the end.

## KaTeX

https://github.com/KaTeX/KaTeX — version 0.16.47

```
The MIT License (MIT)

Copyright (c) 2013-2020 Khan Academy and other contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### KaTeX fonts

The KaTeX fonts embedded in the stylesheet are licensed under the SIL Open Font License, Version 1.1 (https://openfontlicense.org). The copyright notice carried in the font files reads (followed, in each file, by that face's Reserved Font Name):

```
Copyright (c) 2009-2010, Design Science, Inc. (<www.mathjax.org>)
Copyright (c) 2014-2018 Khan Academy (<www.khanacademy.org>)
```

## Fonts loaded at run time · 运行时加载的字体

界面字体 IBM Plex Sans、IBM Plex Mono 和 Noto Serif SC 在打开页面时从 Google Fonts 加载，没有随本仓库分发；三者都以 SIL Open Font License 1.1 发布。

The interface fonts IBM Plex Sans, IBM Plex Mono and Noto Serif SC are loaded from Google Fonts when the page opens and are not distributed with this repository; all three are published under the SIL Open Font License 1.1.

## 数据 · Data

机器学习实验室（`src/ml/data-tabular.js`、`src/ml/data-image.js`，构建后在 `ml/index.html` 里）嵌了下面四份来自 UCI 机器学习数据库的数据，都按 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 使用。为了嵌进页面，数值重新编码成了紧凑的字符串，数值本身不变；其他改动写在每一条后面。

The Machine Learning Lab (`src/ml/data-tabular.js`, `src/ml/data-image.js`, and after the build `ml/index.html`) embeds the four datasets below from the UCI Machine Learning Repository, each used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). To embed them the values were re-encoded as compact strings, with the numbers unchanged; other changes are noted with each entry.

- **Iris.** Fisher, R. (1936). Iris [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C56C76 — values as in Fisher (1936), R and scikit-learn; the UCI file differs from the original in samples 35 and 38, and the original values are used. 数值与 Fisher（1936）原文、R 和 scikit-learn 一致；UCI 存档的文件在第 35、38 个样本上与原文不符，这里用原文的值。
- **Wine.** Aeberhard, S. & Forina, M. (1992). Wine [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5PC7J — class labels renumbered from 1–3 to 0–2. 类别编号从 1–3 改为 0–2。
- **Breast Cancer Wisconsin (Diagnostic).** Wolberg, W., Mangasarian, O., Street, N., & Street, W. (1993). Breast Cancer Wisconsin (Diagnostic) [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5DW2B — patient IDs removed; diagnosis encoded as 0 = malignant, 1 = benign (as in scikit-learn). 去掉了病人编号；诊断编成 0（恶性）/ 1（良性），与 scikit-learn 相同。
- **Optical Recognition of Handwritten Digits.** Alpaydin, E. & Kaynak, C. (1998). Optical Recognition of Handwritten Digits [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C50P49 — the 1,797-image test part (`optdigits.tes`, the same as scikit-learn's `load_digits`). 只用了测试部分（1797 张，`optdigits.tes`，与 scikit-learn 的 `load_digits` 相同）。
