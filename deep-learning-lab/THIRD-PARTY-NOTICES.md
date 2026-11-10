# Third-party notices · 第三方声明

`index.html` 里内联了下面这个库的发行文件（样式、脚本和字体），并带着一份数据文件。源码目录 `src/` 里没有第三方代码；图表和 Markdown 两个模块在构建时从 `../strategy-lab/src/charts.js`、`../strategy-lab/src/md.js` 取，是本仓库自己的代码。

The built page `index.html` inlines the distribution files (stylesheet, script and fonts) of the library below, and ships one data file. The source directory `src/` contains no third-party code; the chart and Markdown modules come from this repository's own `strategy-lab/src/`.

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

## Tiny Shakespeare (data file)

`data/tinyshakespeare.txt` is the file `data/tinyshakespeare/input.txt` of Andrej Karpathy's char-rnn repository, https://github.com/karpathy/char-rnn, retrieved on 2026-11-10 and unchanged (1,115,394 bytes, sha256 `86c4e6aa9db7c042ec79f339dcb96d42b0075e16b8fc2e86bf0ca57e2dc565ed`). According to that repository's Readme it is a subset of the works of William Shakespeare; those works are in the public domain. The repository's Readme states that its code is released under the MIT license.

`data/tinyshakespeare.txt` 是 Andrej Karpathy 的 char-rnn 仓库里的 `data/tinyshakespeare/input.txt`，2026-11-10 取得，未作改动。按该仓库 Readme 的说法，内容是莎士比亚作品的一部分；莎士比亚的作品属于公有领域；该仓库的 Readme 写明其代码以 MIT 许可发布。

## Acknowledgement (no code or text included)

The page is an unofficial companion to Tony Feng's course Math 270, "A Survey of Deep Learning for Mathematicians" (UC Berkeley, Fall 2025). It links to the course's lecture notes, slides and notebooks and reproduces none of them. The character-level transformer in `src/experiments/u07_char_transformer.py` was written for this lab; its overall structure follows the well-known layout of Andrej Karpathy's nanoGPT (https://github.com/karpathy/nanoGPT), from which no code is copied.
