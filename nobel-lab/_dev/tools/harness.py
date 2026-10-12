"""Usage: python3 tools/harness.py <id> [outdir]
Builds <outdir>/<id>_harness.html that mounts CHALLENGES.<id> (and LABS.<id> below it if present),
then loads it headlessly at 760px (dark) and 380px (light), clicks through nothing, and reports
console errors + horizontal overflow, saving screenshots <outdir>/<id>_760.png and <id>_380.png.
Import and use `page_for(id)` yourself if you want to drive interactions (see bottom)."""
import sys, pathlib
from playwright.sync_api import sync_playwright
import sys as _sys; _sys.path.insert(0, '/home/claude/nobel/tools')
from browserlock import browser_lock
ROOT = pathlib.Path('/home/claude/nobel/src')

def build(cid, outdir):
    head = (ROOT/'head.html').read_text().replace('<script async src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js"></script>', '')
    parts = [ROOT/'core.js']
    lab = ROOT/'labs'/f'{cid}.js'
    if lab.exists(): parts.append(lab)
    parts.append(ROOT/'challenges'/f'{cid}.js')
    js = ''.join(f'<script>{p.read_text()}</script>\n' for p in parts)
    boot = """<script>
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const solvedSet = new Set();
window.__events = [];
const ctx = { color: css, reduced: false, h: H, typeset(){}, progress: { get: () => [...solvedSet], mark(i, g){ solvedSet.add(i); __events.push(['mark', i, g]); } }, onComplete(x){ __events.push(['complete', x]); } };
window.__inst = CHALLENGES['%s'].mount(document.getElementById('croot'), ctx);
if (window.LABS && LABS['%s']) window.__lab = LABS['%s'].mount(document.getElementById('lroot'), ctx);
</script>""" % (cid, cid, cid)
    html = head + f'<div class="wrap" style="padding-top:16px"><div class="bench"><div id="croot"></div></div><div class="bench" style="margin-top:20px"><div class="lab" id="lroot"></div></div></div>' + js + boot
    out = pathlib.Path(outdir) / f'{cid}_harness.html'
    out.write_text(html)
    return out

def check(cid, outdir):
    f = build(cid, outdir)
    with browser_lock(), sync_playwright() as p:
        b = p.chromium.launch()
        for w, scheme in [(760, 'dark'), (380, 'light')]:
            pg = b.new_page(viewport={'width': w, 'height': 1000}, color_scheme=scheme)
            errs = []
            pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            pg.route('**/*', lambda r: r.abort() if r.request.url.startswith('http') else r.continue_())
            pg.goto('file://' + str(f)); pg.wait_for_timeout(1200)
            sw = pg.evaluate('[document.documentElement.scrollWidth, innerWidth]')
            pg.screenshot(path=str(pathlib.Path(outdir) / f'{cid}_{w}.png'), full_page=True)
            print(cid, w, 'scroll/inner', sw, 'errors', [e for e in errs if 'net::' not in e][:5])
            pg.close()
        b.close()

if __name__ == '__main__':
    check(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else '.')
