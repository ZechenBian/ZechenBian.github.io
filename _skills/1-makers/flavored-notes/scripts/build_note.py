#!/usr/bin/env python3
# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""Build a math/physics note from Pandoc-Markdown source into PDF + clean Markdown.

    python3 build_note.py NOTE.src.md [--outdir DIR] [--no-pdf] [--cjk-font NAME]
                                      [--engine xelatex|lualatex] [--paper a4|letter]

Outputs, next to the source unless --outdir is given:
    NOTE.pdf   typeset with amsthm environments, numbered, hyperlinked
    NOTE.md    clean GitHub/Obsidian-style Markdown ($...$ math, numbered,
               theorems as blockquotes) -- the same numbers as the PDF
    NOTE.tex   the LaTeX, for Overleaf or hand edits

The source syntax (fenced divs for theorems, \\label in display math, @refs)
is documented at the top of note_filter.lua and in the skill's SKILL.md.
Exit code is non-zero if the PDF failed; the relevant LaTeX errors are printed.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
FILTER = os.path.join(HERE, "note_filter.lua")

CJK_RE = re.compile(r"[぀-ヿ㐀-䶿一-鿿가-힯＀-￯]")

CJK_FONT_CANDIDATES = [
    # Linux (Noto / Source Han / Fandol / WenQuanYi)
    "Noto Serif CJK SC", "Source Han Serif SC", "FandolSong", "Noto Sans CJK SC",
    "WenQuanYi Zen Hei",
    # macOS
    "Songti SC", "STSong", "PingFang SC",
    # Windows
    "SimSun", "Microsoft YaHei",
]


def quiet(stderr):
    """Drop pandoc's warning about the deliberately empty lang variable."""
    out = []
    skip = False
    for line in stderr.splitlines(keepends=True):
        if "Invalid 'lang' value" in line:
            skip = True
            continue
        if skip and "IETF language tag" in line:
            skip = False
            continue
        skip = False
        out.append(line)
    return "".join(out)


def run(cmd, cwd=None):
    return subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          text=True, encoding="utf-8", errors="replace")


def kpse_has(sty):
    if not shutil.which("kpsewhich"):
        return False
    r = run(["kpsewhich", sty])
    return r.returncode == 0 and r.stdout.strip() != ""


def font_available(name):
    if shutil.which("fc-list"):
        r = run(["fc-list", ":", "family"])
        fams = set()
        for line in r.stdout.splitlines():
            for f in line.split(","):
                fams.add(f.strip())
        return name in fams
    return None  # unknown


def pick_cjk_font(user_choice):
    if user_choice:
        return user_choice
    unknown = []
    for f in CJK_FONT_CANDIDATES:
        ok = font_available(f)
        if ok:
            return f
        if ok is None:
            unknown.append(f)
    if sys.platform == "darwin":
        return "Songti SC"
    if sys.platform.startswith("win"):
        return "SimSun"
    return unknown[0] if unknown else None


def read_front_matter(text):
    m = re.match(r"^---\s*\n(.*?)\n(---|\.\.\.)\s*\n", text, re.S)
    return m.group(1) if m else ""


def header_tex(zh, cjk_mode, engine, cjk_font=None):
    lines = [
        r"\usepackage{amsthm}",
        r"\usepackage{mathtools}",
        r"\usepackage{amscd}",
        # unicode-math resets the mathcode of @ that amscd's CD environment needs
        r'\AtBeginDocument{\mathcode`\@="8000 }',
    ]
    if kpse_has("tikz-cd.sty"):
        lines.append(r"\usepackage{tikz-cd}")
    body = r"\normalfont" if zh else r"\itshape"
    # head punctuation/spacing and the note in parentheses: Western vs Chinese conventions
    punct, space = ("{}", "{1em}") if zh else ("{.}", "{0.5em}")
    note = r"\thmnote{\mdseries（#3）}" if zh else r"\thmnote{\ \mdseries(#3)}"
    rnote = r"\thmnote{（#3）}" if zh else r"\thmnote{\ (#3)}"
    rfont = r"\bfseries" if zh else r"\itshape"   # no real italics in CJK fonts
    lines += [
        r"\providecommand{\notehead}{}",
        r"\newtheoremstyle{noteplain}{0.7em}{0.7em}{" + body + r"}{}{\bfseries}" + punct + space
        + r"{\thmname{#1}" + note + "}",
        r"\newtheoremstyle{notedef}{0.7em}{0.7em}{\normalfont}{}{\bfseries}" + punct + space
        + r"{\thmname{#1}" + note + "}",
        r"\newtheoremstyle{noteremark}{0.6em}{0.6em}{\normalfont}{}{" + rfont + "}" + punct + space
        + r"{\thmname{#1}" + rnote + "}",
        r"\theoremstyle{noteplain}\newtheorem*{noteplain}{\notehead}",
        r"\theoremstyle{notedef}\newtheorem*{notedef}{\notehead}",
        r"\theoremstyle{noteremark}\newtheorem*{noteremark}{\notehead}",
        r"\providecommand{\phantomsection}{}",
        r"\allowdisplaybreaks",
        r"\IfFileExists{titling.sty}{\usepackage{titling}\setlength{\droptitle}{-5em}"
        r"\pretitle{\begin{center}\LARGE}\posttitle{\par\end{center}\vskip 0.3em}"
        r"\preauthor{\begin{center}\large}\postauthor{\par\end{center}}"
        r"\predate{\begin{center}\normalsize}\postdate{\par\end{center}}}{}",
    ]
    if zh:
        lines += [
            r"\renewcommand{\proofname}{证明}",
            # Chinese proof head: bold, no trailing period
            r"\makeatletter\renewenvironment{proof}[1][\proofname]{\par\pushQED{\qed}\normalfont"
            r"\topsep6\p@\@plus6\p@\relax\trivlist\item[\hskip\labelsep\bfseries #1\hskip1em]"
            r"\ignorespaces}{\popQED\endtrivlist\@endpefalse}\makeatother",
            r"\AtBeginDocument{\renewcommand{\contentsname}{目录}\renewcommand{\refname}{参考文献}"
            r"\renewcommand{\abstractname}{摘要}}",
        ]
    if cjk_mode == "fallback" and engine == "xelatex" and cjk_font:
        lines.append(CJK_FALLBACK.replace("@@FONT@@", cjk_font))
    return "\n".join(lines) + "\n"


# Without xeCJK: Latin text stays in the main (Latin) font, and XeTeX's
# inter-character tokens switch to the CJK font around runs of CJK characters.
# ICU line breaking (linebreaklocale) allows breaks between CJK characters.
CJK_FALLBACK = r"""
\newfontfamily\notecjkfamily{@@FONT@@}[AutoFakeSlant=0.18]
\XeTeXinterchartokenstate=1
\XeTeXlinebreaklocale "zh"
\XeTeXlinebreakskip=0pt plus 1pt
\newXeTeXintercharclass\NoteCJK
\makeatletter
\def\note@cls#1#2{\count@=#1\relax\loop\XeTeXcharclass\count@=\NoteCJK\relax
  \ifnum\count@<#2\advance\count@\@ne\repeat}
\note@cls{"2E80}{"2FDF}\note@cls{"3000}{"303F}\note@cls{"3040}{"30FF}
\note@cls{"3100}{"31FF}\note@cls{"3400}{"4DBF}\note@cls{"4E00}{"9FFF}
\note@cls{"AC00}{"D7AF}\note@cls{"F900}{"FAFF}\note@cls{"FE30}{"FE4F}\note@cls{"FF00}{"FFEF}
\def\note@prevfam{\familydefault}
\def\note@cjkon{\edef\note@prevfam{\f@family}\notecjkfamily}
\def\note@cjkoff{\fontfamily{\note@prevfam}\selectfont}
\@tempcnta=0
\loop
  \ifnum\@tempcnta=\NoteCJK\else
    \XeTeXinterchartoks\@tempcnta\NoteCJK={\note@cjkon}%
    \XeTeXinterchartoks\NoteCJK\@tempcnta={\note@cjkoff}%
  \fi
  \ifnum\@tempcnta<7 \advance\@tempcnta\@ne\repeat
\XeTeXinterchartoks 4095 \NoteCJK={\note@cjkon}
\XeTeXinterchartoks \NoteCJK 4095={\note@cjkoff}
\makeatother
"""


def summarize_log(log_text):
    errors = []
    lines = log_text.splitlines()
    for i, line in enumerate(lines):
        if line.startswith("!"):
            errors.append("\n".join(lines[i:i + 6]))
    overfull = []
    shipped = 0
    for i, line in enumerate(lines):
        for n in re.findall(r"\[(\d+)(?=[\s\]{<]|$)", line):
            shipped = max(shipped, int(n))
        m = re.match(r"Overfull \\hbox \((\d+(?:\.\d+)?)pt too wide\)", line)
        if m and float(m.group(1)) > 5.0:
            snippet = lines[i + 1] if i + 1 < len(lines) else ""
            snippet = re.sub(r"\\[A-Z]+/[^ ]+ ", "", snippet).replace("[]", "").strip()
            overfull.append((float(m.group(1)), shipped + 1, snippet[:70]))
    undefined = sorted(set(re.findall(r"Reference `([^']+)' on page", log_text)))
    missing_chars = sorted(set(re.findall(r"Missing character: There is no (\S+)", log_text)))
    pm = re.search(r"Output written on .*?\((\d+) pages?", log_text, re.S)
    pages = int(pm.group(1)) if pm else None
    return errors, overfull, undefined, missing_chars, pages


def last_page_lines(pdf, pages):
    if not pages or not shutil.which("pdftotext"):
        return None
    r = run(["pdftotext", "-f", str(pages), "-l", str(pages), "-layout", pdf, "-"])
    rows = [x for x in r.stdout.splitlines() if x.strip()]
    if rows and rows[-1].strip().isdigit():  # page number
        rows = rows[:-1]
    return len(rows)


def render_pages(pdf, stem, preview_root, dpi):
    """Render every page into a fresh folder, so rounds never mix."""
    if not shutil.which("pdftoppm"):
        print("preview: pdftoppm not found (install poppler-utils)")
        return
    os.makedirs(preview_root, exist_ok=True)
    k = 1
    while os.path.exists(os.path.join(preview_root, f"{stem}-pages-{k}")):
        k += 1
    d = os.path.join(preview_root, f"{stem}-pages-{k}")
    os.makedirs(d)
    run(["pdftoppm", "-r", str(dpi), "-png", pdf, os.path.join(d, "page")])
    print("preview: ", d, f"({len(os.listdir(d))} PNG at {dpi} dpi)")


def unescape_brackets(md):
    """pandoc's gfm writer escapes [ ] ( ) as \\[ \\] \\( \\); some viewers read
    those as math delimiters. Undo it outside code and math."""
    parts = re.split(r"(```.*?```|~~~.*?~~~|\$\$.*?\$\$|`[^`\n]*`|\$[^$\n]+\$)", md, flags=re.S)
    for i in range(0, len(parts), 2):
        for esc in ("[", "]", "(", ")"):
            parts[i] = parts[i].replace("\\" + esc, esc)
    return "".join(parts)


def find_pandoc():
    p = shutil.which("pandoc")
    if p:
        return p
    try:  # `pip install pypandoc_binary` ships a pandoc binary
        import pypandoc  # type: ignore
        return pypandoc.get_pandoc_path()
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source")
    ap.add_argument("--outdir")
    ap.add_argument("--no-pdf", action="store_true", help="Markdown only")
    ap.add_argument("--cjk-font", help="font family for Chinese/Japanese/Korean text")
    ap.add_argument("--engine", choices=["xelatex", "lualatex"], default="xelatex")
    ap.add_argument("--paper", choices=["a4", "letter"], default="letter")
    ap.add_argument("--preview", metavar="DIR",
                    help="after building, render the PDF pages to PNG in a fresh folder under DIR")
    ap.add_argument("--dpi", type=int, default=100, help="resolution for --preview (default 100)")
    args = ap.parse_args()

    pandoc = find_pandoc()
    if not pandoc:
        sys.exit("pandoc not found. Install it (apt/brew), or: pip install pypandoc_binary")

    src = os.path.abspath(args.source)
    text = open(src, encoding="utf-8").read()
    base = os.path.basename(src)
    stem = base[:-len(".src.md")] if base.endswith(".src.md") else os.path.splitext(base)[0]
    outdir = os.path.abspath(args.outdir or os.path.dirname(src))
    os.makedirs(outdir, exist_ok=True)

    fm = read_front_matter(text)
    lang_m = re.search(r"^lang:\s*['\"]?([A-Za-z-]+)", fm, re.M)
    lang = lang_m.group(1) if lang_m else ""
    has_cjk = bool(CJK_RE.search(text))
    zh = lang.lower().startswith("zh") or (has_cjk and not lang)
    note_lang = "zh" if zh else "en"

    # Chinese: no smart quotes (they come out as two closing marks); type “ ” directly.
    reader = "markdown+tex_math_dollars+fenced_divs+latex_macros" + ("-smart" if zh else "")
    common = [pandoc, src, "--from", reader, "--lua-filter", FILTER, "-M", "note-lang=" + note_lang]

    # ---------- clean Markdown
    md_out = os.path.join(outdir, stem + ".md")
    if os.path.abspath(md_out) == src:
        md_out = os.path.join(outdir, stem + ".rendered.md")
    r = run(common + ["--to", "gfm+tex_math_dollars", "--wrap", "none", "-o", md_out + ".body"])
    sys.stderr.write(r.stderr)
    if r.returncode != 0:
        sys.exit("pandoc (markdown) failed")
    body = open(md_out + ".body", encoding="utf-8").read()
    os.remove(md_out + ".body")
    # title block from metadata, rendered by pandoc itself so math/markup survive
    tb = run([pandoc, src, "--from", reader, "--to", "gfm+tex_math_dollars",
              "--wrap", "none", "--template", os.path.join(HERE, "md_title.template"),
              "-V", "abstract-title=" + ("摘要" if zh else "Abstract.")])
    md_text = (tb.stdout.strip() + "\n\n" if tb.returncode == 0 and tb.stdout.strip() else "") + body
    md_text = unescape_brackets(md_text)
    open(md_out, "w", encoding="utf-8").write(md_text)
    print("markdown:", md_out)

    if args.no_pdf:
        return

    # ---------- LaTeX / PDF
    engine = args.engine
    if not shutil.which(engine):
        alt = "lualatex" if engine == "xelatex" else "xelatex"
        engine = alt if shutil.which(alt) else None

    cjk_mode = None
    font = None
    vars_ = ["-V", "documentclass=article", "-V", "fontsize=11pt",
             "-V", "geometry:margin=1in", "-V", "papersize=" + args.paper,
             "-V", "colorlinks=true", "-V", "linkcolor=blue!50!black",
             "-V", "urlcolor=blue!50!black", "-V", "citecolor=blue!50!black",
             "-V", "secnumdepth=2", "--number-sections",
             # no babel (it has no good Chinese support), no lmodern.sty dependency
             "-V", "lang=", "-V", "fontfamily=fontspec"]
    if zh or has_cjk:
        font = pick_cjk_font(args.cjk_font)
        if font is None:
            print("warning: no CJK font found; Chinese characters will be missing. Use --cjk-font.")
        elif kpse_has("xeCJK.sty") and engine in ("xelatex", None):
            cjk_mode = "xecjk"
            vars_ += ["-V", "CJKmainfont=" + font]
        elif kpse_has("luatexja.sty") and engine == "lualatex":
            cjk_mode = "luatexja"
            vars_ += ["-V", "CJKmainfont=" + font]
        else:
            # Fallback without xeCJK: Latin text in Latin Modern, CJK runs switched to
            # the CJK font by XeTeX's inter-character tokens (see CJK_FALLBACK).
            cjk_mode = "fallback"
            if shutil.which("xelatex"):
                engine = "xelatex"

    with tempfile.TemporaryDirectory() as tmp:
        hdr = os.path.join(tmp, "note-header.tex")
        open(hdr, "w", encoding="utf-8").write(header_tex(zh, cjk_mode, engine or "xelatex", font))
        tex_path = os.path.join(tmp, stem + ".tex")
        r = run(common + ["--to", "latex", "--standalone", "-H", hdr, "-o", tex_path] + vars_)
        sys.stderr.write(quiet(r.stderr))
        if r.returncode != 0:
            sys.exit("pandoc (latex) failed")
        # -H inlines the header, so the .tex we hand over is self-contained (compile with XeLaTeX)
        shutil.copy(tex_path, os.path.join(outdir, stem + ".tex"))
        print("tex:     ", os.path.join(outdir, stem + ".tex"))
        if not engine:
            print("No xelatex/lualatex found: wrote Markdown and .tex only. Compile the .tex with "
                  "XeLaTeX (e.g. on Overleaf) or install TeX Live / MacTeX.")
            return

        log = ""
        for _ in range(2):  # two passes for cross-reference hyperlinks
            r = run([engine, "-interaction=nonstopmode", "-halt-on-error", stem + ".tex"], cwd=tmp)
            logf = os.path.join(tmp, stem + ".log")
            log = open(logf, encoding="utf-8", errors="replace").read() if os.path.exists(logf) else r.stdout
            if r.returncode != 0:
                break
        errors, overfull, undefined, missing, pages = summarize_log(log)
        pdf_tmp = os.path.join(tmp, stem + ".pdf")
        ok = r.returncode == 0 and os.path.exists(pdf_tmp)
        pdf_out = os.path.join(outdir, stem + ".pdf")
        if ok:
            shutil.copy(pdf_tmp, pdf_out)
            print("pdf:     ", pdf_out, f"({pages} pages)" if pages else "")
        if cjk_mode:
            print("cjk:      " + cjk_mode)
        for e in errors[:5]:
            print("LaTeX error:\n" + e + "\n")
        for w, pg, snip in overfull[:12]:
            print(f"overfull line, page ~{pg}, {w:.0f}pt too wide: {snip}")
        if undefined:
            print("undefined LaTeX references:", ", ".join(undefined))
        if missing:
            print("glyphs missing from the font:", " ".join(missing[:20]))
        if ok:
            n = last_page_lines(pdf_out, pages)
            if n is not None and pages and pages > 1 and n <= 6:
                print(f"note: the last page has only {n} line(s) of text; trim or rebalance")
            if args.preview:
                render_pages(pdf_out, stem, os.path.abspath(args.preview), args.dpi)
        if not ok:
            sys.exit(1)


if __name__ == "__main__":
    main()
