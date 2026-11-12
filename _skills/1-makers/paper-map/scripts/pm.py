#!/usr/bin/env python3
# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""pm.py — paper-map corpus toolkit.

A corpus is a folder:
  corpus.json      title, scope, outline (acts), papers, gaps, changelog, version
  maps/<KEY>.json  one theorem-dependency map per paper (schema below)
  fixes.json       corrections from checks and reviews (applied at merge time)
  checks/*.json    independent-check results ({"summary":..., "items":[...]})
  story.html       the corpus story (HTML fragment; $...$ math; data-node links)
  prompts/<KEY>.md extraction prompts (generated)
  build/           generated: paper-map.json, index.html, delta.json

Commands:
  new DIR --title T --scope S
  prompt DIR KEY --title T --pdf P --txt X [--source R]
  register DIR KEY --title T --authors A --year Y [--arxiv ID] [--source R]
  rebib DIR                  re-resolve every paper's bibliography against the corpus
  merge DIR                  build/paper-map.json + build/delta.json
  check DIR                  cycles, dangling edges, non-English text, LaTeX, unresolved citations
  sample DIR --keys K1,K2    input for an independent check of the given papers
  build DIR [--template F]   build/index.html
  levels DIR [--template F]  build/levels.html: reading levels per paper and layers per result, by purpose
  manifest DIR               file list for publishing page + corpus/ + tools/ as one artifact (never source texts)
"""
import argparse, base64, datetime, glob, json, os, random, re, subprocess, sys
from graphlib import TopologicalSorter, CycleError

HERE = os.path.dirname(os.path.abspath(__file__))
TODAY = datetime.date.today().isoformat()

KIND = {"定义": "Definition", "定理": "Theorem", "命题": "Proposition", "引理": "Lemma", "推论": "Corollary",
        "猜想": "Conjecture", "构造": "Construction", "断言": "Claim"}
STATUS = {"本文证明": "proved here", "引自他文": "cited from elsewhere", "只陈述未证": "stated without proof",
          "物理论证": "physics argument", "猜想": "conjecture", "作者自称粗略": "author calls it sketchy"}
ETYPE = {"证明用到": "used in proof", "定义用到": "used in definition", "作者称推广": "author: generalises",
         "作者称一致或等价": "author: agrees / equivalent", "背景": "background"}
KINDS = set(KIND.values()); STATUSES = set(STATUS.values()); ETYPES = set(ETYPE.values())
DEP = {"used in proof", "used in definition"}


def load(p, default=None):
    if not os.path.exists(p):
        return default
    with open(p) as f:
        return json.load(f)


def save(p, obj):
    os.makedirs(os.path.dirname(p) or ".", exist_ok=True)
    with open(p, "w") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def corpus(d):
    c = load(os.path.join(d, "corpus.json"))
    if c is None:
        sys.exit(f"{d} is not a corpus (no corpus.json); run: pm.py new {d}")
    return c


def order(c):
    return [p["key"] for p in sorted(c["papers"], key=lambda p: (p.get("year", 0), p["key"]))]


# ---------------------------------------------------------------- new / register / prompt
def cmd_new(a):
    if os.path.exists(os.path.join(a.dir, "corpus.json")):
        sys.exit("corpus already exists")
    for sub in ["maps", "checks", "prompts", "build"]:
        os.makedirs(os.path.join(a.dir, sub), exist_ok=True)
    save(os.path.join(a.dir, "corpus.json"), {
        "title": a.title, "scope": a.scope, "version": "0", "created": TODAY,
        "outline": [], "papers": [], "gaps": [], "changelog": []})
    save(os.path.join(a.dir, "fixes.json"), {"nodes": {}, "edges": {}, "drop_cross": []})
    with open(os.path.join(a.dir, "story.html"), "w") as f:
        f.write('<article class="story">\n<h1 class="st-title">' + a.title + '</h1>\n<p class="lede">(story not written yet)</p>\n</article>\n')
    print("created", a.dir)


def cmd_register(a):
    c = corpus(a.dir)
    old = next((p for p in c["papers"] if p["key"] == a.key), {})
    c["papers"] = [p for p in c["papers"] if p["key"] != a.key]
    entry = dict(old)
    entry.update({"key": a.key, "title": a.title, "authors": a.authors, "year": int(a.year),
                  "arxiv": a.arxiv or old.get("arxiv", ""), "source": a.source or old.get("source", ""), "added": old.get("added", TODAY)})
    if a.level:
        entry["level"] = a.level
    if a.scope:
        entry["scope"] = a.scope
    c["papers"].append(entry)
    save(os.path.join(a.dir, "corpus.json"), c)
    print("registered", a.key, "→", len(c["papers"]), "papers")


PROMPT = re.sub(r"^\s*<!--.*?-->\s*", "", open(os.path.join(HERE, "extract_prompt_en.md")).read(), flags=re.S) if os.path.exists(os.path.join(HERE, "extract_prompt_en.md")) else None


def cmd_prompt(a):
    c = corpus(a.dir)
    if PROMPT is None:
        sys.exit("extract_prompt_en.md missing next to pm.py")
    batch = [f"- {p['key']}: {p['authors']} — {p['title']} ({p['year']})" for p in c["papers"]]
    if a.key not in [p["key"] for p in c["papers"]]:
        batch.append(f"- {a.key}: {a.title} (the paper you are extracting)")
    out = os.path.abspath(os.path.join(a.dir, "maps", a.key + ".json"))
    level = (a.level or "full").lower()
    if level == "reference":
        sys.exit("level 'reference': nothing to extract — register the paper and give it a one-line role in corpus.json")
    scope = {
        "full": "Level **full**: extract the whole paper, as below.",
        "partial": ("Level **partial**: the user needs only this part of the paper: **%s**. Read the abstract and introduction, then "
                    "extract every numbered result in that part, and every result elsewhere in the paper that those results use "
                    "(follow the references back, transitively), with their edges and citations. Do not extract anything else; list "
                    "the pages you did not read in coverage.pages_unread and say in coverage.notes that this is a partial extraction "
                    "of the given part." % (a.scope or "(the user did not say which part — stop and report)")),
        "statements": ("Level **statements**: the user needs only the main results as statements%s. Read the abstract and introduction "
                       "and the statements of the main results; extract those results (main: true), the definitions needed to state "
                       "them (with 'used in definition' edges) and their literature citations. Do not follow proofs; edges of type "
                       "'used in proof' are not required. Say in coverage.notes that this is a statements-level extraction."
                       % ((" — in particular: " + a.scope) if a.scope else "")),
    }.get(level)
    if scope is None:
        sys.exit("level must be full, partial, statements or reference")
    txt = (PROMPT.replace("{SCOPE}", scope).replace("{KEY}", a.key).replace("{TITLE}", a.title).replace("{PDF}", a.pdf)
           .replace("{TXT}", a.txt).replace("{SOURCE}", a.source or a.pdf).replace("{OUT}", out)
           .replace("{BATCH}", "\n".join(batch)))
    p = os.path.join(a.dir, "prompts", a.key + ".md")
    with open(p, "w") as f:
        f.write(txt)
    print(p)


# ---------------------------------------------------------------- bibliography re-resolution
def norm_words(s):
    return [w for w in re.sub(r"[^a-z0-9 ]", " ", s.lower()).split() if len(w) > 2]


def title_match(ref, title):
    tw = set(norm_words(title))
    if not tw:
        return 0.0
    rw = set(norm_words(ref))
    return len(tw & rw) / len(tw)


def authors_match(ref, authors):
    """At least one author surname of the corpus paper appears in the reference text."""
    names = [w.strip().split()[-1] for w in re.split(r",|\band\b|&", authors) if w.strip()]
    return any(n.lower() in ref.lower() for n in names if len(n) > 1)

SERIES = re.compile(r"(?:,|\b(?:part|paper))\s*([ivx]+|\d+)\.?\s*$", re.I)

def series_match(ref, title):
    """Parts of a series are different papers: if the corpus title ends with a part marker
    ('…, II', 'Part 2'), the reference must carry the same marker; if it has none, the reference must not
    end its title with one either (checked loosely on the text before the first period after the title)."""
    m = SERIES.search(title.strip())
    if m:
        mark = m.group(1).lower()
        return re.search(r"(?:,|\bpart|\bpaper)\s*%s\b" % re.escape(mark), ref, re.I) is not None
    return re.search(r"gauge theories,\s*(?:i{1,3}|iv|v)\b|\bpart\s+(?:i{1,3}|\d)\b", ref, re.I) is None

def cmd_rebib(a):
    c = corpus(a.dir)
    keys = {p["key"]: p for p in c["papers"]}
    changes = []
    for k in keys:
        mp = os.path.join(a.dir, "maps", k + ".json")
        m = load(mp)
        if m is None:
            continue
        for bk, b in m.get("bib", {}).items():
            if b.get("batch"):
                continue
            ref = b.get("ref", "")
            for k2, p2 in keys.items():
                if k2 == k:
                    continue
                hit = (p2.get("arxiv") and p2["arxiv"] in ref) or (
                    title_match(ref, p2["title"]) >= 0.85 and authors_match(ref, p2.get("authors", ""))
                    and series_match(ref, p2["title"]))
                if hit:
                    b["batch"] = k2
                    b["resolved_by"] = f"pm.py rebib {TODAY} (check)"
                    changes.append((k, bk, k2, ref[:90]))
        save(mp, m)
    for ch in changes:
        print("resolved: %s [%s] → %s   (%s)" % ch)
    print(len(changes), "bibliography entries newly resolved")


# ---------------------------------------------------------------- merge
WORD = [(r"(?:Theorems?|Thm\.?|Th\.)", "Thm"), (r"(?:Propositions?|Prop\.?)", "Prop"), (r"(?:Lemmas?|Lem\.?)", "Lem"),
        (r"(?:Corollar(?:y|ies)|Cor\.?)", "Cor"), (r"(?:Definitions?|Def\.?)", "Def"), (r"(?:Conjectures?|Conj\.?)", "Conj"),
        (r"(?:Remarks?|Rem\.?)", "Rem"), (r"(?:Examples?|Ex\.?)", "Rem"), (r"(?:Eqns?\.?|Equations?)", "Eq")]


def resolve(target, paper, ids):
    t = target.strip()
    if not t:
        return [], "no specific location given"
    tried, found, hints = [], [], []
    for pat, pre in WORD:
        for mm in re.finditer(pat + r"\s*((?:[A-Z]?\d+(?:\.\d+)*[a-z]?(?:\s*(?:,|and)\s*)?)+)", t):
            for num in re.findall(r"[A-Z]?\d+(?:\.\d+)*", mm.group(1)):
                tried.append(f"{paper}:{pre}{num}")
    for num in re.findall(r"\((\d+(?:\.\d+)*)\)", t):
        tried.append(f"{paper}:Eq{num}")
    strip = lambda s: s.split(":")[1].lstrip("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")
    for cand in tried:
        if cand in ids:
            found.append(cand)
        else:
            hints += [i for i in ids if i.startswith(paper + ":") and strip(i) == strip(cand)]
    if found:
        return sorted(set(found)), None
    if re.fullmatch(r"[§\s\d.,]+|§.*", t):
        return [], "section-level only"
    msg = "numbering not matched: " + t
    if hints:
        msg += " (same number exists as " + ", ".join(sorted(set(hints))) + "; not linked)"
    return [], msg


def norm_enum(x, table, allowed, what):
    if x in allowed:
        return x
    if x in table:
        return table[x]
    raise SystemExit(f"unknown {what}: {x!r}")


def cmd_merge(a):
    c = corpus(a.dir)
    fix = load(os.path.join(a.dir, "fixes.json"), {"nodes": {}, "edges": {}, "drop_cross": []})
    ORDER = order(c)
    papers = {}
    for k in ORDER:
        m = load(os.path.join(a.dir, "maps", k + ".json"))
        if m is None:
            print("warning: no map for", k)
            continue
        papers[k] = m
    ORDER = [k for k in ORDER if k in papers]
    nodes, edges, ids = [], [], set()
    for k in ORDER:
        for n in papers[k]["nodes"]:
            n = dict(n); n["paper"] = k
            n["kind"] = norm_enum(n["kind"], KIND, KINDS, "kind")
            n["status"] = norm_enum(n["status"], STATUS, STATUSES, "status")
            if n["id"] in fix["nodes"]:
                f = fix["nodes"][n["id"]]
                n.update({x: y for x, y in f.items() if not x.startswith("_")}); n["corrected"] = f.get("_why", "")
            nodes.append(n); ids.add(n["id"])
        for e in papers[k]["edges"]:
            e = dict(e); e["type"] = norm_enum(e["type"], ETYPE, ETYPES, "edge type"); e["cross"] = False; edges.append(e)
    outside = {}
    for k in ORDER:
        m = papers[k]
        for ci in m.get("cites", []):
            b = m.get("bib", {}).get(ci["key"], {})
            use = norm_enum(ci["use"], ETYPE, ETYPES, "use")
            if b.get("batch") in papers or use == "background":
                continue
            outside.setdefault(ci["from_node"], []).append({"key": ci["key"], "ref": b.get("ref", ""), "target": ci.get("target", ""),
                                                            "use": use, "page": ci["page"]})
    for n in nodes:
        n["outside"] = outside.get(n["id"], [])
    links = []
    for k in ORDER:
        m = papers[k]
        for ci in m.get("cites", []):
            b = m.get("bib", {}).get(ci["key"], {})
            tgt = b.get("batch")
            if not tgt or tgt == k or tgt not in papers:
                continue
            use = norm_enum(ci["use"], ETYPE, ETYPES, "use")
            res, why = resolve(ci.get("target", ""), tgt, ids)
            link = {"from_node": ci["from_node"], "from_paper": k, "to_paper": tgt, "key": ci["key"], "target": ci.get("target", ""),
                    "use": use, "page": ci["page"], "phrase": ci["phrase"], "resolved": res, "unresolved": why}
            for d in fix.get("drop_cross", []):
                if d["to"] == ci["from_node"] and d["from"] in res:
                    res = [x for x in res if x != d["from"]]; use = d["use"]; why = d["note"]
                    link["resolved"], link["use"], link["unresolved"] = res, use, why
            links.append(link)
            if use != "background":
                for r in res:
                    edges.append({"from": r, "to": ci["from_node"], "type": use, "cross": True,
                                  "evidence": f"{k} p. {ci['page']}: '{ci['phrase']}'"})
    bad = [e for e in edges if e["from"] not in ids or e["to"] not in ids]
    deps = {i: set() for i in ids}
    for e in edges:
        if e["type"] in DEP and e["from"] in ids and e["to"] in ids:
            deps[e["to"]].add(e["from"])
    try:
        list(TopologicalSorter(deps).static_order()); cyc = None
    except CycleError as err:
        cyc = err.args[1]
    batch = [{"key": k, "title": papers[k]["title"], "source": papers[k]["source"], "version": papers[k].get("version", ""),
              "coverage": dict(papers[k].get("coverage", {}), counts={KIND.get(x, x): y for x, y in papers[k].get("coverage", {}).get("counts", {}).items()}),
              "doubtful": papers[k].get("doubtful", []),
              "bib_batch": {kk: v["batch"] for kk, v in papers[k].get("bib", {}).items() if v.get("batch")}} for k in ORDER]
    meta = {x: c.get(x) for x in ["title", "name", "scope", "version", "outline", "gaps", "changelog", "links"]}
    meta["short"] = {p["key"]: p.get("short") or (p["authors"].split(",")[0].split("—")[0].strip() + " " + str(p["year"])) for p in c["papers"]}
    PAL = ["#8a6a1f", "#2f66b0", "#c0502a", "#2b8a57", "#7a4ea6", "#b4336a", "#1d8799", "#5b6b1e", "#a0522d", "#4b5bb5", "#8c3b8c", "#2f7f6f"]
    meta["colors"] = {p["key"]: p.get("color") or PAL[i % len(PAL)] for i, p in enumerate(c["papers"])}
    out = {"corpus": meta, "batch": batch, "nodes": nodes, "edges": edges, "links": links}
    prev = load(os.path.join(a.dir, "build", "paper-map.json"))
    save(os.path.join(a.dir, "build", "paper-map.json"), out)
    delta = {"date": TODAY}
    if prev:
        pn = {n["id"] for n in prev["nodes"]}; pe = {(e["from"], e["to"], e["type"]) for e in prev["edges"]}
        delta["new_nodes"] = sorted(n["id"] for n in nodes if n["id"] not in pn)
        delta["new_edges"] = sorted("%s -> %s (%s)" % (e["from"], e["to"], e["type"]) for e in edges if (e["from"], e["to"], e["type"]) not in pe)
        delta["new_cross_edges"] = [x for x in delta["new_edges"] if any(e["cross"] and "%s -> %s (%s)" % (e["from"], e["to"], e["type"]) == x for e in edges)]
        save(os.path.join(a.dir, "build", "delta.json"), delta)
    print("papers", len(ORDER), "nodes", len(nodes), "edges", len(edges), "cross", sum(e["cross"] for e in edges),
          "links", len(links), "dangling", len(bad), "cycle", cyc)
    if prev:
        print("delta:", len(delta["new_nodes"]), "new nodes,", len(delta["new_edges"]), "new edges,", len(delta["new_cross_edges"]), "new cross edges")


# ---------------------------------------------------------------- check
def cmd_check(a):
    m = load(os.path.join(a.dir, "build", "paper-map.json"))
    if m is None:
        sys.exit("run merge first")
    ids = {n["id"] for n in m["nodes"]}
    problems = 0
    dang = [e for e in m["edges"] if e["from"] not in ids or e["to"] not in ids]
    if dang:
        problems += 1; print("DANGLING edges:", len(dang))
    deps = {i: set() for i in ids}
    for e in m["edges"]:
        if e["type"] in DEP and e["from"] in ids and e["to"] in ids:
            deps[e["to"]].add(e["from"])
    try:
        list(TopologicalSorter(deps).static_order())
    except CycleError as err:
        problems += 1; print("CYCLE:", err.args[1])
    cjk = re.compile(r"[一-鿿]")
    s = json.dumps(m, ensure_ascii=False)
    if cjk.search(s):
        problems += 1; print("NON-ENGLISH text in merged map:", len(cjk.findall(s)), "CJK characters")
    unres = [l for l in m["links"] if l["use"] != "background" and not l["resolved"] and l["unresolved"].startswith("numbering")]
    for l in unres:
        print("unresolved numbered citation:", l["from_node"], "→", l["to_paper"], l["target"], "|", l["unresolved"])
    story = os.path.join(a.dir, "story.html")
    if os.path.exists(story):
        st = open(story).read()
        badref = [x for x in re.findall(r'data-(?:node|path)="([^"]+)"', st) if x not in ids]
        if badref:
            problems += 1; print("story links to unknown nodes:", badref)
        gids = {g["id"] for g in (m.get("corpus") or {}).get("gaps", [])}
        badgap = [x for x in re.findall(r'data-gap="([^"]+)"', st) if x not in gids]
        if badgap:
            problems += 1; print("story links to unknown gaps:", badgap)
    gsrc = [(g["id"], s_["node"]) for g in (m.get("corpus") or {}).get("gaps", []) for s_ in g.get("sources", []) if s_.get("node") and s_["node"] not in ids]
    if gsrc:
        problems += 1; print("gap sources point to unknown nodes:", gsrc)
    if os.path.exists(story):
        for mm in re.finditer(r"<svg.*?</svg>", st, re.S):
            if "$" in mm.group(0):
                problems += 1; print("math inside an <svg> (KaTeX cannot render it)"); break
        if re.search(r"<(?![a-zA-Z/!])", st):
            problems += 1; print("unescaped '<' in story text (write &lt; inside math)")
    tex = os.path.join(HERE, "texcheck.js")
    if os.path.exists(tex):
        r = subprocess.run(["node", tex, os.path.join(a.dir, "build", "paper-map.json"), story], capture_output=True, text=True)
        print(r.stdout.strip().splitlines()[0] if r.stdout.strip() else r.stderr[-300:])
        if " errors 0" not in r.stdout:
            problems += 1
    print("CHECK:", "ok" if problems == 0 else f"{problems} problem(s)")


# ---------------------------------------------------------------- sample for independent check
def cmd_sample(a):
    m = load(os.path.join(a.dir, "build", "paper-map.json"))
    keys = a.keys.split(",")
    c = corpus(a.dir)
    src = {p["key"]: p.get("source", "") for p in c["papers"]}
    N = {n["id"]: n for n in m["nodes"]}
    random.seed(a.seed)
    node = lambda i: {"id": i, "kind": N[i]["kind"], "loc": N[i]["loc"], "statement": N[i]["statement"]}
    items = []
    for e in m["edges"]:
        if e["cross"] and (N[e["to"]]["paper"] in keys or N[e["from"]]["paper"] in keys):
            items.append({"item": f"edge {e['from']} -> {e['to']}", "type": e["type"], "evidence": e["evidence"], "from": node(e["from"]), "to": node(e["to"]), "cross": True})
    for k in keys:
        es = [e for e in m["edges"] if not e["cross"] and N[e["to"]]["paper"] == k and e["type"] in DEP]
        for e in random.sample(es, min(a.per_paper, len(es))):
            items.append({"item": f"edge {e['from']} -> {e['to']}", "type": e["type"], "evidence": e["evidence"], "from": node(e["from"]), "to": node(e["to"]), "cross": False})
        items += [{"item": f"main {n['id']}", "node": node(n["id"])} for n in m["nodes"] if n["paper"] == k and n.get("main")]
    out = os.path.join(a.dir, "checks", f"input-{TODAY}-{'-'.join(keys)}.json")
    save(out, {"papers": {k: src.get(k, "") for k in src}, "items": items})
    print(out, len(items), "items")


# ---------------------------------------------------------------- build page
def cmd_build(a):
    pm_json = os.path.join(a.dir, "build", "paper-map.json")
    srcs = [os.path.join(a.dir, "corpus.json"), os.path.join(a.dir, "fixes.json")] + glob.glob(os.path.join(a.dir, "maps", "*.json"))
    if not os.path.exists(pm_json) or max(os.path.getmtime(f) for f in srcs if os.path.exists(f)) > os.path.getmtime(pm_json):
        print("corpus changed since the last merge: merging first")
        cmd_merge(a)
    css, kjs, kauto, K = katex_assets()
    esc = lambda s: s.replace("</", "<\\/")
    data = open(os.path.join(a.dir, "build", "paper-map.json")).read()
    checks = sorted(glob.glob(os.path.join(a.dir, "checks", "result-*.json")))
    merged = {"summary": " ".join(load(p).get("summary", "") for p in checks), "items": sum((load(p).get("items", []) for p in checks), [])} if checks else None
    t = open(a.template or os.path.join(HERE, "page_template.html")).read()
    t = (t.replace("__KATEXCSS__", css).replace("__KATEXJS__", esc(open(K + "katex.min.js").read()))
          .replace("__AUTORENDER__", esc(open(K + "contrib/auto-render.min.js").read()))
          .replace("__DATA__", esc(data)).replace("__CHECK__", esc(json.dumps(merged, ensure_ascii=False) if merged else "null"))
          .replace("__STORY__", open(os.path.join(a.dir, "story.html")).read())
          .replace("__TITLE__", corpus(a.dir)["title"]))
    out = os.path.join(a.dir, "build", "index.html")
    with open(out, "w") as f:
        f.write(t)
    print(out, len(t), "bytes")


def katex_assets():
    """KaTeX css (fonts inlined as base64 woff2), js and auto-render, so pages render offline."""
    cands = [os.environ.get("KATEX_DIST", ""), "/opt/npm-tools/node_modules/katex/dist/",
             os.path.join(HERE, "node_modules", "katex", "dist", ""), os.path.join(os.getcwd(), "node_modules", "katex", "dist", "")]
    K = next((k if k.endswith("/") else k + "/" for k in cands if k and os.path.exists(os.path.join(k, "katex.min.css"))), None)
    if K is None:
        sys.exit("KaTeX not found: run `npm install katex` next to pm.py, or set KATEX_DIST to katex/dist")
    css = open(K + "katex.min.css").read()
    css = re.sub(r'src:url\(fonts/([A-Za-z0-9_-]+)\.woff2\) format\("woff2"\)(?:,url\([^)]*\) format\("[a-z]+"\))*',
                 lambda mm: 'src:url(data:font/woff2;base64,%s) format("woff2")' % base64.b64encode(open(K + "fonts/" + mm.group(1) + ".woff2", "rb").read()).decode(), css)
    return css, open(K + "katex.min.js").read(), open(K + "contrib/auto-render.min.js").read(), K


PAGE_RE = re.compile(r"pp?\.\s*(\d+)(?:\s*[\u2013-]\s*(\d+))?")


def node_pages(loc):
    m = PAGE_RE.search(loc or "")
    if not m:
        return None, None
    a = int(m.group(1)); b = int(m.group(2) or a)
    return a, min(b, a + 6)


def NODE_PAPER(i):
    return i.split(":")[0]


def order_keys(c):
    return order(c)


def cmd_levels(a):
    """Build build/levels.html: per purpose (the story, or one open problem), each paper gets a level
    (full / partial / statements / reference) and its results fall into layers (core, needed for the
    statements, needed for the proofs, not needed). Suggestions come from corpus.json "levels"; the
    viewer's own choices are saved by the page (artifact db doc choices/levels) or copied back by hand."""
    c = corpus(a.dir); m = load(os.path.join(a.dir, "build", "paper-map.json"))
    if m is None:
        sys.exit("run merge first")
    story = open(os.path.join(a.dir, "story.html")).read() if os.path.exists(os.path.join(a.dir, "story.html")) else ""
    linked = set(re.findall(r'data-node="([^"]+)"', story))
    ids = {n["id"] for n in m["nodes"]}
    cross = set()
    for e in m["edges"]:
        if e.get("cross"):
            cross.update([e["from"], e["to"]])
    spine = set(((c.get("spine") or {}).get("rows") or {}).values())
    nodes = []
    for n in m["nodes"]:
        pf, pt = node_pages(n.get("loc"))
        nodes.append({"id": n["id"], "p": n["paper"], "k": n["kind"], "t": n["statement"], "loc": n.get("loc", ""),
                      "s": n["status"], "m": bool(n.get("main")), "pf": pf, "pt": pt})
    dep = [[e["from"], e["to"], "d" if e["type"] == "used in definition" else "p"] for e in m["edges"]
           if not e.get("cross") and e["type"] in DEP]
    papers = []
    for p in c["papers"]:
        mx = max([x["pt"] or 0 for x in nodes if x["p"] == p["key"]] or [0])
        papers.append({"key": p["key"], "title": p["title"], "short": p.get("short", p["key"]), "authors": p.get("authors", ""),
                       "year": p.get("year", ""), "color": p.get("color", "#555"), "pages": p.get("pages") or mx})
    order, act_of = [], {}
    for act in c.get("outline", []):
        for k in act.get("papers", []):
            if k not in order:
                order.append(k); act_of[k] = "Act %s · %s" % (act["act"], act.get("question", ""))
    for p in order_keys(c):
        if p not in order:
            order.append(p); act_of[p] = "Not placed in an act"
    sug = (c.get("levels") or {}).get("story", {})
    purposes = [{"id": "story", "label": "The story (main line)", "title": "Purpose: the story",
                 "why": "Core = what the Story tab uses: results it links to, results cited across papers, and the spine.",
                 "core": sorted((linked | cross | spine) & ids), "pages": {}, "suggest": sug}]
    for g in c.get("gaps", []):
        core = sorted({s_["node"] for s_ in g.get("sources", []) if s_.get("node") in ids})
        pages = {}
        for s_ in g.get("sources", []):
            key = (s_.get("paper") or "").split()[0]
            mm = re.match(r"^(\d+)(?:\s*[\u2013-]\s*(\d+))?$", str(s_.get("page", "")).strip())
            if key in {p["key"] for p in papers} and mm and not s_.get("node"):
                lo = int(mm.group(1)); hi = int(mm.group(2) or lo)
                for q in range(lo, hi + 1):
                    pages.setdefault(key, []).append([q, s_.get("note", "")[:90]])
        if not core and not pages:
            continue
        named = {NODE_PAPER(x) for x in core} | set(pages)
        label = re.sub(r"\$[^$]*\$", "…", g["title"])
        purposes.append({"id": g["id"], "label": "%s · %s" % (g["id"], label[:80]), "title": "Purpose: %s · %s" % (g["id"], g["title"]),
                         "why": "Core = the results and pages this open problem cites. Papers it names are suggested as Partial; the rest as Reference.",
                         "core": core, "pages": pages,
                         "suggest": {p["key"]: ({"level": "partial", "why": "named by %s" % g["id"]} if p["key"] in named else {"level": "reference", "why": "not named by %s" % g["id"]}) for p in papers}})
    data = {"title": (c.get("name") or c["title"]) + " — reading levels", "corpusKey": os.path.basename(os.path.abspath(a.dir)),
            "sub": "%d papers · pick a purpose; each paper gets a level, and its results are layered by what that purpose needs. Built from the dependency map." % len(papers),
            "papers": papers, "order": order, "actOf": act_of, "nodes": nodes, "dep": dep, "purposes": purposes}
    css, kjs, kauto, K = katex_assets()
    esc = lambda x: x.replace("</", "<\\/")
    t = open(a.template or os.path.join(HERE, "levels_template.html")).read()
    t = (t.replace("__KATEXCSS__", css).replace("__KATEXJS__", esc(kjs)).replace("__AUTORENDER__", esc(kauto))
          .replace("__DATA__", esc(json.dumps(data, ensure_ascii=False))).replace("__TITLE__", data["title"]))
    out = os.path.join(a.dir, "build", "levels.html")
    with open(out, "w") as f:
        f.write(t)
    print(out, len(t), "bytes;", len(purposes), "purposes")

def cmd_manifest(a):
    """Print the file list for publishing the corpus as one multi-file artifact:
    index.html (the page) + corpus/ (everything needed to continue) + tools/ (a copy of this toolkit).
    Source texts (PDF, page-marked txt) are never included."""
    d = os.path.abspath(a.dir); out = []
    page = os.path.join(d, "build", "index.html")
    if not os.path.exists(page):
        sys.exit("run build first")
    out.append({"as": "index.html", "path": page})
    for rel in ["corpus.json", "fixes.json", "story.html", "README.md"]:
        f = os.path.join(d, rel)
        if os.path.exists(f):
            out.append({"as": "corpus/" + rel, "path": f})
    for sub in ["maps", "checks"]:
        for f in sorted(glob.glob(os.path.join(d, sub, "*.json"))):
            out.append({"as": "corpus/%s/%s" % (sub, os.path.basename(f)), "path": f})
    for rel in ["SKILL.md", "pm.py", "extract_prompt_en.md", "texcheck.js", "page_template.html", "levels_template.html", "pg.py", "shot_corpus.py"]:
        f = os.path.join(HERE, rel)
        if os.path.exists(f):
            # artifacts do not serve .py files: publish them as .py.txt (rename back after restoring)
            out.append({"as": "tools/" + rel + (".txt" if rel.endswith(".py") else ""), "path": f})
    bad = [x for x in out if re.search(r"\.(pdf|txt)$", x["path"], re.I)]
    if bad:
        sys.exit("refusing to publish source texts: %s" % bad)
    print(json.dumps(out, ensure_ascii=False, indent=1))

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    p = sp.add_parser("new"); p.add_argument("dir"); p.add_argument("--title", required=True); p.add_argument("--scope", required=True); p.set_defaults(f=cmd_new)
    p = sp.add_parser("register"); p.add_argument("dir"); p.add_argument("key"); p.add_argument("--title", required=True); p.add_argument("--authors", required=True)
    p.add_argument("--year", required=True); p.add_argument("--arxiv"); p.add_argument("--source")
    p.add_argument("--level", choices=["full", "partial", "statements", "reference"], help="how much of the paper the corpus needs"); p.add_argument("--scope"); p.set_defaults(f=cmd_register)
    p = sp.add_parser("prompt"); p.add_argument("dir"); p.add_argument("key"); p.add_argument("--title", required=True); p.add_argument("--pdf", required=True)
    p.add_argument("--txt", required=True); p.add_argument("--source"); p.add_argument("--level", choices=["full", "partial", "statements", "reference"])
    p.add_argument("--scope", help="which part (for partial) or which results (for statements), e.g. \"§§2–4\" or \"Thm 1.1, Thm 1.4\""); p.set_defaults(f=cmd_prompt)
    p = sp.add_parser("rebib"); p.add_argument("dir"); p.set_defaults(f=cmd_rebib)
    p = sp.add_parser("merge"); p.add_argument("dir"); p.set_defaults(f=cmd_merge)
    p = sp.add_parser("check"); p.add_argument("dir"); p.set_defaults(f=cmd_check)
    p = sp.add_parser("sample"); p.add_argument("dir"); p.add_argument("--keys", required=True); p.add_argument("--per-paper", type=int, default=2)
    p.add_argument("--seed", type=int, default=20261111); p.set_defaults(f=cmd_sample)
    p = sp.add_parser("build"); p.add_argument("dir"); p.add_argument("--template"); p.set_defaults(f=cmd_build)
    p = sp.add_parser("manifest"); p.add_argument("dir"); p.set_defaults(f=cmd_manifest)
    p = sp.add_parser("levels"); p.add_argument("dir"); p.add_argument("--template"); p.set_defaults(f=cmd_levels)
    a = ap.parse_args(); a.f(a)


if __name__ == "__main__":
    main()
