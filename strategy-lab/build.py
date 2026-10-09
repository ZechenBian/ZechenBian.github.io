#!/usr/bin/env python3
# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""把 src/ 里的各部分拼成一个自包含的页面。
index.html              独立的网页：一个文件，双击或放到任何静态网站上都能用（公式库也内联了）
dist/strategy-lab.html  在 Claude 里发布用（不带 <html>/<head>，发布时会被套上外壳；公式库从 CDN 取）
dist/preview.html       本地测试用（套上与发布外壳等价的壳）

需要 KaTeX 的发行文件：先 `npm install`（装到 node_modules/katex），或者用环境变量 KATEX_DIR 指到 katex/dist。"""
import base64, json, os, re, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
def katex_dir():
    for d in [os.environ.get("KATEX_DIR"), os.path.join(ROOT, "node_modules/katex/dist"), "/opt/npm-tools/node_modules/katex/dist"]:
        if d and os.path.exists(os.path.join(d, "katex.min.js")): return d
    sys.exit("找不到 KaTeX：先运行 npm install，或者设置环境变量 KATEX_DIR=…/katex/dist")
KATEX = katex_dir()
KATEX_VER = json.load(open(os.path.join(KATEX, "../package.json")))["version"]
rd = lambda p: open(os.path.join(ROOT, p), encoding="utf8").read()
# 每个源文件头上都有两行版权声明；拼成一页时去掉，整页只在最前面留一份
HDR = re.compile(r"\A(?://|/\*) Copyright \(c\) 2026 Zechen Bian\.[^\n]*\n(?://|  ) ?Not open source\.[^\n]*\n")
def src(f):
    s, n = HDR.subn("", rd("src/" + f))
    assert n == 1, "缺少版权声明：src/" + f
    return s
COPY = "Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。"
LICENSE_URL = "https://github.com/ZechenBian/zechenbian.github.io/blob/main/LICENSE"

def katex_css():
    css = open(os.path.join(KATEX, "katex.min.css"), encoding="utf8").read()
    def face(m):
        name = m.group(1)
        b64 = base64.b64encode(open(os.path.join(KATEX, "fonts", name + ".woff2"), "rb").read()).decode()
        return 'src:url(data:font/woff2;base64,%s) format("woff2")' % b64
    css, n = re.subn(r'src:url\(fonts/([A-Za-z0-9_-]+)\.woff2\) format\("woff2"\),url\(fonts/[^)]+\.woff\) format\("woff"\),url\(fonts/[^)]+\.ttf\) format\("truetype"\)', face, css)
    assert n == 20, n
    assert "url(fonts/" not in css
    return css

# 顺序有讲究：模型库和玩法是被内核"安装"的，要先于内核定义；规则表在内核之后；界面各部分按依赖排
JS = ["ml.js", "games.js", "obs-games.js", "live.js", "core.js", "strategies.js", "models.js", "game-strats.js", "obs-strats.js", "charts.js", "engine-client.js", "md.js", "io.js",
      "guide.js", "guide-games.js", "guide-worlds.js", "guide-obs.js",
      "ai.js", "app-core.js", "app-live.js", "app-ui.js", "app-charts.js", "app-scenes.js", "app-guide.js", "claude.js", "app-main.js"]
JS = [f for f in JS if os.path.exists(os.path.join(ROOT, "src", f))]
js = "/* %s\n   Not open source. %s */\n" % (COPY, LICENSE_URL) + "\n".join("/* ===== %s ===== */\n%s" % (f, src(f)) for f in JS)
assert "</script" not in js.lower(), "内联脚本里不能出现 </script"
samples = rd("data/samples.json")
assert "</script" not in samples.lower()
# 对照表不再随页面发布：它在用户的电脑上现算（src/live.js、src/app-live.js）

FONTS = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Noto+Serif+SC:wght@700&display=swap"
page = "\n".join([
    "<title>策略实验室</title>",
    '<link rel="stylesheet" href="%s">' % FONTS,
    "<style>\n" + src("styles.css") + "\n</style>",
    "<style>\n/* KaTeX %s 的样式，字体内联 */\n%s\n</style>" % (KATEX_VER, katex_css()),
    rd("src/body.html"),
    '<script type="application/json" id="ql-samples">%s</script>' % samples,
    '<script src="https://cdn.jsdelivr.net/npm/katex@%s/dist/katex.min.js" defer></script>' % KATEX_VER,
    "<script>\n" + js + "\n</script>",
])
os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
open(os.path.join(ROOT, "dist/strategy-lab.html"), "w", encoding="utf8").write(page)
RESET = ':root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif;background:#fafaf8}img{max-width:100%}[hidden]{display:none!important}'
shell = ('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>'
         + RESET + '</style></head><body>' + page + '</body></html>')
open(os.path.join(ROOT, "dist/preview.html"), "w", encoding="utf8").write(shell)

# 独立的网页：完整的文档；公式库内联（不依赖 CDN）；字体样式不阻塞首屏（连不上 Google Fonts 时用系统字体）
katex_js = open(os.path.join(KATEX, "katex.min.js"), encoding="utf8").read()
assert "</script" not in katex_js.lower()
ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%232a78d6'/%3E%3Cpath d='M6 22l6-7 5 4 9-11' fill='none' stroke='%23fff' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"
standalone = "\n".join([
    "<!doctype html>",
    "<!--\n  %s\n  Not open source: no copying, modification, redistribution, commercial use or AI/ML training without written permission.\n  非开源：未经书面许可，不得复制、修改、再分发、商用或用于 AI/机器学习训练。\n  License: %s\n  Third-party code bundled in this page (KaTeX, MIT License) keeps its own license: see THIRD-PARTY-NOTICES.md.\n-->" % (COPY, LICENSE_URL),
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
    '<meta name="author" content="Zechen Bian">',
    '<meta name="copyright" content="© 2026 Zechen Bian. All rights reserved.">',
    '<meta name="robots" content="noai, noimageai">',
    '<link rel="license" href="%s">' % LICENSE_URL,
    "<title>策略实验室</title>",
    '<meta name="description" content="自己模拟量化的实验台：选一种玩法、一个世界，定一条规则，在成百上千条路径上跑一遍，看结果的分布。全部在浏览器里本地运行。">',
    '<link rel="icon" href="%s">' % ICON,
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="%s" media="print" onload="this.media=\'all\'">' % FONTS,
    "<style>" + RESET + "</style>",
    "<style>\n" + src("styles.css") + "\n</style>",
    "<style>\n/* KaTeX %s 的样式，字体内联。KaTeX: MIT License, (c) Khan Academy and other contributors; 字体: SIL Open Font License 1.1。全文见 THIRD-PARTY-NOTICES.md */\n%s\n</style>" % (KATEX_VER, katex_css()),
    "</head>",
    "<body>",
    "<noscript><p style=\"padding:24px\">这个页面要开着 JavaScript 才能用。</p></noscript>",
    rd("src/body.html"),
    '<script type="application/json" id="ql-samples">%s</script>' % samples,
    "<script>\n/* KaTeX %s — MIT License, (c) Khan Academy and other contributors. https://github.com/KaTeX/KaTeX */\n%s\n</script>" % (KATEX_VER, katex_js),
    "<script>\n" + js + "\n</script>",
    "</body>",
    "</html>",
    ""])
open(os.path.join(ROOT, "index.html"), "w", encoding="utf8").write(standalone)
print("built: %.0f KB (js %.0f KB, katex css %.0f KB); index.html %.0f KB" % (len(page.encode()) / 1024, len(js.encode()) / 1024, len(katex_css().encode()) / 1024, len(standalone.encode()) / 1024))
