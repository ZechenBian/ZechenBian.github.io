"""Usage: python3 tools/texcheck_ui.py <id> [<id> ...]
Mounts CHALLENGES.<id> (every stage built eagerly, in detached containers) and LABS.<id> in headless Chromium,
collects every string that could carry TeX (stage title/task/hints/answer, H.answer labels, H.quiz text, any
H.el html attribute), validates each $…$ segment with the local KaTeX, and reports TeX errors and page errors."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
import sys as _sys; _sys.path.insert(0, '/home/claude/nobel/tools')
from browserlock import browser_lock
ROOT = pathlib.Path('/home/claude/nobel/src')
KATEX = pathlib.Path('/opt/npm-tools/node_modules/katex/dist/katex.min.js').read_text()

HOOK = r"""
window.__tex = [];
const _el = H.el;
H.el = function (tag, attrs, children) { if (attrs && typeof attrs.html === 'string' && attrs.html.includes('$')) __tex.push(['el.html', attrs.html]); return _el(tag, attrs, children); };
const _ans = H.answer; H.answer = function (o) { if (o && o.label) __tex.push(['answer.label', o.label]); if (o && o.unit) __tex.push(['answer.unit', o.unit]); return _ans(o); };
const _quiz = H.quiz; H.quiz = function (o) { if (o) { if (o.question) __tex.push(['quiz.q', o.question]); (o.options || []).forEach((x) => { __tex.push(['quiz.opt', x.label || '']); if (x.why) __tex.push(['quiz.why', x.why]); }); } return _quiz(o); };
const _stages = H.stages;
H.stages = function (root, ctx, stages) {
  stages.forEach((s, i) => {
    __tex.push([`stage${i+1}.title`, s.title || '']); __tex.push([`stage${i+1}.task`, s.task || '']);
    (s.hints || []).forEach((h, k) => __tex.push([`stage${i+1}.hint${k+1}`, h])); __tex.push([`stage${i+1}.answer`, s.answer || '']);
  });
  // eager build of every stage body in a detached host so dynamic strings get collected and build errors surface
  stages.forEach((s, i) => {
    const body = document.createElement('div'); document.getElementById('detached').append(body);
    const api = { done(){}, say(h){ if (typeof h === 'string') __tex.push([`stage${i+1}.say`, h]); }, typeset(){}, solved: () => false };
    try { const hd = s.build(body, api); if (hd && hd.destroy) setTimeout(() => { try { hd.destroy(); } catch (e) {} }, 0); }
    catch (e) { __tex.push(['BUILD-ERROR', `stage ${i+1}: ${e && e.message}`]); }
  });
  return _stages(root, ctx, stages);
};
"""

CHECK = r"""
(() => {
  const out = [];
  for (const [where, s] of __tex) {
    if (where === 'BUILD-ERROR') { out.push(`${where}: ${s}`); continue; }
    if (typeof s !== 'string') continue;
    const re = /\$\$([\s\S]*?)\$\$|\$([^$]*?)\$/g; let m;
    while ((m = re.exec(s))) {
      const tex = m[1] ?? m[2];
      if (/<[A-Za-z!\/]/.test(tex)) out.push(`${where}: raw '<' in TeX: ${tex.slice(0, 60)}`);
      try { katex.renderToString(tex, { throwOnError: true, strict: 'ignore', displayMode: m[1] != null }); }
      catch (e) { out.push(`${where}: TeX error: ${String(e.message).split('\n')[0]} :: ${tex.slice(0, 80)}`); }
    }
    const rest = s.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/\$[^$]*?\$/g, '');
    if (rest.includes('$')) out.push(`${where}: unbalanced $ :: ${s.slice(0, 80)}`);
  }
  return out;
})()
"""

def page_for(cid):
    head = (ROOT/'head.html').read_text().replace('<script async src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js"></script>', '')
    parts = [f'<script>{KATEX}</script>', f'<script>{(ROOT/"core.js").read_text()}</script>', f'<script>{HOOK}</script>']
    lab = ROOT/'labs'/f'{cid}.js'
    if lab.exists(): parts.append(f'<script>{lab.read_text()}</script>')
    ch = ROOT/'challenges'/f'{cid}.js'
    if ch.exists(): parts.append(f'<script>{ch.read_text()}</script>')
    boot = """<script>
const css=(n)=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const ctx={color:css,reduced:false,h:H,typeset(){},progress:{get:()=>[],mark(){}},onComplete(){}};
window.__errs=[];
try { if (window.CHALLENGES && CHALLENGES['%s']) CHALLENGES['%s'].mount(document.getElementById('croot'), ctx); else __errs.push('no CHALLENGES.%s'); } catch(e){ __errs.push('challenge mount: '+e.message); }
try { if (window.LABS && LABS['%s']) { const L = LABS['%s']; if (L.title) __tex.push(['lab.title', L.title]); L.mount(document.getElementById('lroot'), ctx); } else __errs.push('no LABS.%s'); } catch(e){ __errs.push('lab mount: '+e.message); }
</script>""" % ((cid,) * 6)
    return head + '<div class="wrap"><div id="croot"></div><div class="lab" id="lroot"></div><div id="detached" hidden></div></div>' + ''.join(parts) + boot

def run(ids, outdir='/tmp'):
    total = 0
    with browser_lock(), sync_playwright() as p:
        b = p.chromium.launch()
        for cid in ids:
            f = pathlib.Path(outdir) / f'_texcheck_{cid}.html'; f.write_text(page_for(cid))
            pg = b.new_page(viewport={'width': 900, 'height': 900}); errs = []
            pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
            pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' and 'net::' not in m.text else None)
            pg.route('**/*', lambda r: r.abort() if r.request.url.startswith('http') else r.continue_())
            pg.goto('file://' + str(f)); pg.wait_for_timeout(900)
            probs = pg.evaluate(CHECK) + pg.evaluate('window.__errs') + errs
            n = pg.evaluate('__tex.length')
            print(f'{cid}: strings={n} problems={len(probs)}')
            for x in probs[:40]: print('   ', x)
            total += len(probs); pg.close()
        b.close()
    return total

if __name__ == '__main__':
    sys.exit(1 if run(sys.argv[1:], '/tmp/claude-0/-home-claude/d27d6727-b2ea-5843-a5b3-5f0bf678e0e6/scratchpad') else 0)
