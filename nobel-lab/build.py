"""Build the 诺奖思想实验室 pages.

  python3 build.py [OUT]          science site, claude.ai artifact flavour (default OUT: dist/nobel.html)
  python3 build.py --hum [OUT]    Literature & Peace page, artifact flavour (default OUT: dist/hum.html)
  python3 build.py --github DIR   both pages as standalone GitHub Pages files:
                                  DIR/index.html and DIR/literature-peace/index.html

An entry goes live only when its id is in READY (content, challenge and lab written and verified).
"""
import sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
src = ROOT / 'src'

ORIGINAL = ['planck','einstein','bohr','schrodinger','ligo','curie','haber','giauque','dna','hh','crispr']
READY = ['pcr','mrna','insulin','hiv','checkpoint','operon','ips','artemisinin','rontgen','darkenergy','solow','lemons','options','qhe','topo','higgs','bell']
LIVE = set(ORIGINAL + READY)

HUM_CSS = """<style><style>
.f-lit { --f: var(--s4); } .f-peace { --f: var(--good); }
.hum-hero { grid-template-columns: minmax(0, 1fr); }
.hgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; margin-top: 18px; }
.hcard { display: grid; align-content: start; gap: 8px; padding: 24px 22px 26px; background: var(--bg); text-decoration: none; min-width: 0; transition: background .2s; }
.hcard:hover { background: var(--bg2); }
.hcard .row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.hcard .yr { font-family: var(--display-font); font-size: 44px; line-height: 1; color: var(--accent); }
.hcard h3 { font-family: var(--cjk-display); font-size: 22px; line-height: 1.4; margin: 8px 0 0; text-wrap: balance; }
.hcard .who { font-size: 13px; color: var(--muted); }
.hcard .one { font-size: 14px; color: var(--muted); line-height: 1.75; margin: 4px 0 0; }
.hcard .go { font-size: 13px; color: var(--f); margin-top: 6px; }
.humroot { margin-top: 18px; min-width: 0; }
</style>
</style>
"""

GH_HEAD = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="author" content="Zechen Bian">
<meta name="copyright" content="© 2026 Zechen Bian. All rights reserved.">
<meta name="robots" content="noai, noimageai">
<meta name="description" content="@@DESC@@">
<style>
:root { padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
body { margin: 0; } img { max-width: 100%; } [hidden] { display: none !important; }
.site-foot { margin-top: 48px; padding-top: 14px; border-top: 1px solid var(--line); font-size: 12.5px; color: var(--muted); }
.site-foot a { color: inherit; }
</style>
"""
GH_FOOT = '<footer class="site-foot">© 2026 Zechen Bian · 保留所有权利 / All rights reserved · <a href="https://github.com/ZechenBian/zechenbian.github.io/blob/main/LICENSE">LICENSE</a></footer>'
SCI_DESC = '诺贝尔奖还原挑战：从当年真实的现象和难题出发，亲手测量、拟合、拼装，一关一关重现关键发现；完成后揭晓完整的历史、推导与答案演示。'
HUM_DESC = '诺贝尔文学奖与和平奖的互动体验：马尔克斯的“马孔多，一百年”，曼德拉与德克勒克的“从牢房到投票站”。'


def scripts(files, pre=''):
    out = pre
    for f in files:
        t = f.read_text()
        assert '</script' not in t.lower(), f
        out += f'<script>/* {f.name} */\n{t}\n</script>\n'
    return out


def science(github=False):
    for i in READY:
        for d in ('content', 'challenges', 'labs'):
            assert (src / d / f'{i}.js').exists(), f'missing {d}/{i}.js'
    labs = sorted(f for f in (src / 'labs').glob('*.js') if f.stem in LIVE)
    chals = sorted(f for f in (src / 'challenges').glob('*.js') if f.stem in LIVE)
    entries = sorted(f for f in (src / 'content').glob('*.js') if f.stem in READY)
    extra = [src / 'links.js'] if (src / 'links.js').exists() else []
    js = [src / 'core.js', *labs, *chals, src / 'content1.js', src / 'content2.js', src / 'content3.js', *entries, *extra, src / 'app.js']
    nav = '<a href="#">全部挑战</a><a href="#rontgen">从 1901 开始</a>' + ('<a href="literature-peace/">文学与和平</a>' if github else '')
    body = ('<div class="wrap">\n<header class="top"><a class="brand" href="#">诺奖思想实验室<small>NOBEL · IDEAS · BENCH</small></a>\n'
            f'<nav>{nav}</nav></header>\n<main id="app"></main>\n' + (GH_FOOT + '\n' if github else '') + '</div>\n')
    head = (src / 'head.html').read_text()
    if not github:
        return head + body + scripts(js)
    return (GH_HEAD.replace('@@DESC@@', SCI_DESC) + head + '</head>\n<body>\n' + body
            + scripts(js, "<script>window.NOBEL_HUM_URL = 'literature-peace/';</script>\n") + '</body>\n</html>\n')


def humanities(github=False):
    files = [src / 'core.js', src / 'humanities' / 'marquez.js', src / 'humanities' / 'mandela.js', src / 'hum_app.js']
    nav = ('<a href="../">科学奖还原挑战</a>' if github else '') + '<a href="#marquez">文学 · 马尔克斯</a><a href="#mandela">和平 · 曼德拉与德克勒克</a>'
    body = ('<div class="wrap">\n<header class="top"><a class="brand" href="#">诺奖思想实验室<small>LITERATURE · PEACE</small></a>\n'
            f'<nav>{nav}</nav></header>\n<main id="app"></main>\n' + (GH_FOOT + '\n' if github else '') + '</div>\n')
    head = (src / 'head.html').read_text().replace('<title>诺奖思想实验室</title>', '<title>文学与和平</title>')
    if not github:
        return head + HUM_CSS + body + scripts(files)
    return (GH_HEAD.replace('@@DESC@@', HUM_DESC) + head + HUM_CSS + '</head>\n<body>\n' + body
            + scripts(files) + '</body>\n</html>\n')


def write(path, text):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    print(path, len(text.encode()) // 1024, 'KB')


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[:1] == ['--github']:
        out = pathlib.Path(a[1] if len(a) > 1 else ROOT)
        write(out / 'index.html', science(github=True))
        write(out / 'literature-peace' / 'index.html', humanities(github=True))
    elif a[:1] == ['--hum']:
        write(a[1] if len(a) > 1 else ROOT / 'dist' / 'hum.html', humanities())
    else:
        write(a[0] if a else ROOT / 'dist' / 'nobel.html', science())
