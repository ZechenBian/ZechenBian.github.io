#!/usr/bin/env python3
# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""把 src/ 里的各部分拼成一个自包含的页面。
index.html              独立的网页（中文）：一个文件，双击或放到任何静态网站上都能用（公式库也内联了）
en/index.html           独立的网页（英文）：同一份源码，构建时把给人看的中文换成 i18n/en/ 里的译文（见 i18n/README.md）
dist/strategy-lab.html  在 Claude 里发布用（不带 <html>/<head>，发布时会被套上外壳；公式库从 CDN 取）
dist/preview.html       本地测试用（套上与发布外壳等价的壳）

需要 KaTeX 的发行文件：先 `npm install`（装到 node_modules/katex），或者用环境变量 KATEX_DIR 指到 katex/dist。
英文版另外需要 Node.js 和 acorn（npm install 会装）；没有 i18n/ 目录时只生成中文的。"""
import base64, json, os, re, shutil, subprocess, sys, tempfile
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
def src(f, base=None):
    s, n = HDR.subn("", open(os.path.join(base, f), encoding="utf8").read() if base else rd("src/" + f))
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
JS = ["ml.js", "games.js", "obs-games.js", "live.js", "core.js", "strategies.js", "models.js", "game-strats.js", "obs-strats.js", "human.js", "charts.js", "engine-client.js", "md.js", "io.js",
      "guide.js", "guide-games.js", "guide-worlds.js", "guide-obs.js",
      "ai.js", "app-core.js", "app-live.js", "app-ui.js", "app-charts.js", "app-scenes.js", "app-human.js", "app-guide.js", "claude.js", "app-main.js"]
JS = [f for f in JS if os.path.exists(os.path.join(ROOT, "src", f))]
def bundle(base=None):
    out = "/* %s\n   Not open source. %s */\n" % (COPY, LICENSE_URL) + "\n".join("/* ===== %s ===== */\n%s" % (f, src(f, base)) for f in JS)
    assert "</script" not in out.lower(), "内联脚本里不能出现 </script"
    return out
js = bundle()
samples = rd("data/samples.json")
assert "</script" not in samples.lower()
# 对照表不再随页面发布：它在用户的电脑上现算（src/live.js、src/app-live.js）

BODY = rd("src/body.html"); LANG_SLOT = "      <!--LANG-->\n"
assert BODY.count(LANG_SLOT) == 1
FONTS = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Noto+Serif+SC:wght@700&display=swap"
page = "\n".join([
    "<title>策略实验室</title>",
    '<link rel="stylesheet" href="%s">' % FONTS,
    "<style>\n" + src("styles.css") + "\n</style>",
    "<style>\n/* KaTeX %s 的样式，字体内联 */\n%s\n</style>" % (KATEX_VER, katex_css()),
    BODY.replace(LANG_SLOT, ""),
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
SITE = "https://zechenbian.github.io/strategy-lab/"
def standalone(lang, js, body, samples, title, desc, noscript, lang_btn, head_extra, pre_script):
    """一张完整的页面。lang_btn：去另一种语言的按钮；head_extra：放在 <head> 里的附加内容；pre_script：主脚本之前执行的一小段"""
    return "\n".join([
        "<!doctype html>",
        "<!--\n  %s\n  Not open source: no copying, modification, redistribution, commercial use or AI/ML training without written permission.\n  非开源：未经书面许可，不得复制、修改、再分发、商用或用于 AI/机器学习训练。\n  License: %s\n  Third-party code bundled in this page (KaTeX, MIT License) keeps its own license: see THIRD-PARTY-NOTICES.md.\n-->" % (COPY, LICENSE_URL),
        '<html lang="%s">' % lang,
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
        '<meta name="author" content="Zechen Bian">',
        '<meta name="copyright" content="© 2026 Zechen Bian. All rights reserved.">',
        '<meta name="robots" content="noai, noimageai">',
        '<link rel="license" href="%s">' % LICENSE_URL,
        "<title>%s</title>" % title,
        '<meta name="description" content="%s">' % desc,
        '<link rel="alternate" hreflang="zh-CN" href="%s">' % SITE,
        '<link rel="alternate" hreflang="en" href="%sen/">' % SITE,
        head_extra,
        '<link rel="icon" href="%s">' % ICON,
        '<link rel="preconnect" href="https://fonts.googleapis.com">',
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
        '<link rel="stylesheet" href="%s" media="print" onload="this.media=\'all\'">' % FONTS,
        "<style>" + RESET + "</style>",
        "<style>\n" + src("styles.css") + "\n</style>",
        "<style>\n/* KaTeX %s 的样式，字体内联。KaTeX: MIT License, (c) Khan Academy and other contributors; 字体: SIL Open Font License 1.1。全文见 THIRD-PARTY-NOTICES.md */\n%s\n</style>" % (KATEX_VER, katex_css()),
        "</head>",
        "<body>",
        "<noscript><p style=\"padding:24px\">%s</p></noscript>" % noscript,
        body.replace(LANG_SLOT, "      " + lang_btn + "\n"),
        '<script type="application/json" id="ql-samples">%s</script>' % samples,
        "<script>\n/* KaTeX %s — MIT License, (c) Khan Academy and other contributors. https://github.com/KaTeX/KaTeX */\n%s\n</script>" % (KATEX_VER, katex_js),
        pre_script,
        "<script>\n" + js + "\n</script>",
        "</body>",
        "</html>",
        ""])

HAS_EN = os.path.isdir(os.path.join(ROOT, "i18n/en"))
# 中文页。访问者上次选的是英文时，直接去英文页（英文页上点"中文"会改回来）。从硬盘上打开时地址里要写出文件名
REDIRECT = ('<script>try{if(localStorage.getItem("ql.lang")==="en")location.replace((location.protocol==="file:"?"en/index.html":"en/")+location.hash)}catch(e){}</script>'
            if HAS_EN else "")
BTN_EN = ('<a class="btn" id="btnLang" href="en/index.html" data-dir="en/" data-lang="en" hreflang="en" lang="en" title="Switch to English"><span class="lang-long">English</span><span class="lang-short">EN</span></a>'
          if HAS_EN else "")
zh_page = standalone("zh-CN", js, BODY, samples, "策略实验室",
                     "自己模拟量化的实验台：选一种玩法、一个世界，定一条规则，在成百上千条路径上跑一遍，看结果的分布。全部在浏览器里本地运行。",
                     "这个页面要开着 JavaScript 才能用。", BTN_EN, REDIRECT, "")
open(os.path.join(ROOT, "index.html"), "w", encoding="utf8").write(zh_page)

# 英文页：源码过一遍 i18n/i18n.js（把中文换成译文，代码不动），页面骨架和示例数据的名字按 i18n/en/_html.json 换
en_page = ""
if HAS_EN:
    CJK = re.compile(r"[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]")
    table = json.load(open(os.path.join(ROOT, "i18n/en/_html.json"), encoding="utf8"))
    def tr(text, what, kind):
        for zh, en in table[kind]: text = text.replace(zh, en)
        m = CJK.search(text)
        assert not m, "%s 里还有没译的中文：%s（补到 i18n/en/_html.json）" % (what, text[max(0, m.start() - 20):m.start() + 20])
        return text
    tmp = tempfile.mkdtemp(prefix="ql-en-")
    try:
        node = lambda *a: subprocess.run(["node", os.path.join(ROOT, "i18n/i18n.js")] + list(a), check=True, capture_output=True, text=True).stdout.strip()
        try: node("apply", tmp)
        except FileNotFoundError: sys.exit("生成英文版需要 Node.js（没有找到 node 命令）。只要中文版的话，把 i18n/ 目录挪开再运行。")
        except subprocess.CalledProcessError as e: sys.exit("英文版没有生成：\n" + (e.stderr or e.stdout))
        js_en = bundle(tmp)
        sig = node("sig")                       # 中文版现算缓存的签名：英文版沿用它，两种语言共用一份算过的数
        assert re.fullmatch(r"[0-9a-z]+\.\d+", sig), sig
    finally: shutil.rmtree(tmp, ignore_errors=True)
    BTN_ZH = '<a class="btn" id="btnLang" href="../index.html" data-dir="../" data-lang="zh" hreflang="zh-CN" lang="zh-CN" title="切换到中文">中文</a>'
    en_page = standalone("en", js_en, tr(BODY, "body.html", "html"), tr(samples, "samples.json", "text"), "Strategy Lab",
                         "A workbench for simulating quantitative strategies yourself: pick a game and a world, set a rule, run it over thousands of paths and read the distribution of outcomes. Everything runs locally in your browser.",
                         "This page needs JavaScript to run.", BTN_ZH, "", '<script>window.QL_LIVE_SIG = "%s";</script>' % sig)
    os.makedirs(os.path.join(ROOT, "en"), exist_ok=True)
    open(os.path.join(ROOT, "en/index.html"), "w", encoding="utf8").write(en_page)
print("built: %.0f KB (js %.0f KB, katex css %.0f KB); index.html %.0f KB%s" % (len(page.encode()) / 1024, len(js.encode()) / 1024, len(katex_css().encode()) / 1024, len(zh_page.encode()) / 1024,
      "; en/index.html %.0f KB" % (len(en_page.encode()) / 1024) if en_page else "; 没有 i18n/en，只生成了中文页"))
