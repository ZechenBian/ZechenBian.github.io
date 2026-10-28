#!/usr/bin/env python3
# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""_skills 的机械检查（说明见 _skills/README.md 的"维护"一节）：

1. 每个 skill 目录有 SKILL.md；frontmatter 只有 name 和 description；name 和目录名一致，
   只含小写字母、数字和连字符，不超过 64 个字符，不含 claude / anthropic。
2. description 不超过 1024 个字符、不含尖括号；超过 200 个字符只提醒，不算失败。
3. 正文有"## 版本"（英文 skill 为"## Version"）一节，并带 All rights reserved 版权行。
4. evals/ 下至少 3 个测试用例（prompt.md、case.yaml、graders/），case.yaml 的 name 和目录名一致；
   trigger_eval.json 至少 10 条，该触发和不该触发的都有。
5. 三个 flow 的《总控协议》一段逐字相同。
6. README.md 列出了每一个 skill。

用法（仓库根目录）：python3 _skills/tools/check_skills.py
"""
import json, pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
LIB = HERE.parent
LAYERS = ("0-flows", "1-makers", "2-methods")
NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
PROTO_BEGIN = "<!-- 总控协议 v1 开始"
PROTO_END = "<!-- 总控协议 v1 结束 -->"
GRADER_HEAD = "---\ntype: llm\nfocus: trace\nweight: 1\n---\n"

problems, notes = [], []


def bad(msg):
    problems.append(msg)
    print("✗ " + msg)


def note(msg):
    notes.append(msg)
    print("· " + msg)


def frontmatter(text):
    """返回 (字段字典, 正文)；格式不对时返回 (None, text)。只认 key: value 一行一个。"""
    if not text.startswith("---\n"):
        return None, text
    end = text.find("\n---\n", 4)
    if end < 0:
        return None, text
    fields = {}
    for line in text[4:end].splitlines():
        if not line.strip():
            continue
        key, sep, value = line.partition(":")
        if not sep:
            return None, text
        fields[key.strip()] = value.strip().strip('"').strip("'")
    return fields, text[end + 5:]


def check_skill(d):
    rel = d.relative_to(LIB)
    p = d / "SKILL.md"
    if not p.is_file():
        bad(f"{rel}：缺 SKILL.md")
        return None
    text = p.read_text(encoding="utf8")
    fields, body = frontmatter(text)
    if fields is None:
        bad(f"{rel}/SKILL.md：开头不是合法的 frontmatter（--- 包起来的 name 和 description）")
        return None
    extra = set(fields) - {"name", "description"}
    if extra:
        bad(f"{rel}/SKILL.md：frontmatter 里多了 {sorted(extra)}（claude.ai 保存时只保留 name 和 description）")
    name, desc = fields.get("name", ""), fields.get("description", "")
    if name != d.name:
        bad(f"{rel}/SKILL.md：name「{name}」和目录名「{d.name}」不一致")
    if not NAME_RE.match(name) or len(name) > 64 or "claude" in name or "anthropic" in name:
        bad(f"{rel}/SKILL.md：name「{name}」不合规（小写字母、数字、连字符，≤64，不含 claude/anthropic）")
    if not desc:
        bad(f"{rel}/SKILL.md：description 是空的")
    if len(desc) > 1024:
        bad(f"{rel}/SKILL.md：description 有 {len(desc)} 个字符，超过 1024")
    elif len(desc) > 200:
        note(f"{rel}：description 有 {len(desc)} 个字符（建议 200 以内，不算失败）")
    if "<" in desc or ">" in desc:
        bad(f"{rel}/SKILL.md：description 里有尖括号")
    if "## 版本" not in body and "## Version" not in body:
        bad(f"{rel}/SKILL.md：缺“## 版本”一节")
    if "All rights reserved" not in body:
        bad(f"{rel}/SKILL.md：缺版权行（All rights reserved）")

    ev = d / "evals"
    cases = [c for c in sorted(ev.iterdir()) if c.is_dir()] if ev.is_dir() else []
    if len(cases) < 3:
        bad(f"{rel}：evals/ 里只有 {len(cases)} 个测试用例，至少要 3 个")
    for c in cases:
        crel = c.relative_to(LIB)
        pm, cy, gd = c / "prompt.md", c / "case.yaml", c / "graders"
        if not pm.is_file() or not pm.read_text(encoding="utf8").startswith("---\n"):
            bad(f"{crel}：缺 prompt.md，或它不是以设置块开头")
        if not cy.is_file():
            bad(f"{crel}：缺 case.yaml")
        else:
            y = cy.read_text(encoding="utf8")
            if 'schema_version: "1.1"' not in y or f"\nname: {c.name}\n" not in y or "expected_outcome:" not in y:
                bad(f"{crel}/case.yaml：要有带引号的 schema_version、和目录同名的 name、expected_outcome")
            if "scaffold_script" in y and not (c / "place-files.sh").is_file():
                bad(f"{crel}：case.yaml 引用了 place-files.sh，但文件不存在")
        graders = sorted(gd.glob("*.md")) if gd.is_dir() else []
        if not graders:
            bad(f"{crel}：graders/ 里没有判分条目")
        for g in graders:
            if not g.read_text(encoding="utf8").startswith(GRADER_HEAD):
                bad(f"{g.relative_to(LIB)}：开头不是固定的判分设置块")
    te = ev / "trigger_eval.json"
    if not te.is_file():
        bad(f"{rel}：缺 evals/trigger_eval.json")
    else:
        try:
            items = json.loads(te.read_text(encoding="utf8"))
            flags = {bool(i["should_trigger"]) for i in items if i.get("query")}
            if len(items) < 10 or flags != {True, False}:
                bad(f"{te.relative_to(LIB)}：至少 10 条，并且该触发和不该触发的都要有")
        except (ValueError, KeyError, TypeError) as e:
            bad(f"{te.relative_to(LIB)}：读不了（{e}）")
    return name, body


def protocol(body):
    i, j = body.find(PROTO_BEGIN), body.find(PROTO_END)
    return body[i:j] if 0 <= i < j else None


def main():
    skills = {}
    for layer in LAYERS:
        ld = LIB / layer
        if not ld.is_dir():
            bad(f"缺少分层目录 {layer}/")
            continue
        for d in sorted(x for x in ld.iterdir() if x.is_dir()):
            got = check_skill(d)
            if got:
                skills[got[0]] = (layer, got[1])

    flows = {n: b for n, (layer, b) in skills.items() if layer == "0-flows"}
    blocks = {n: protocol(b) for n, b in flows.items()}
    for n, blk in blocks.items():
        if blk is None:
            bad(f"0-flows/{n}：找不到《总控协议》一段（开始和结束的注释）")
    texts = {blk for blk in blocks.values() if blk is not None}
    if len(texts) > 1:
        bad("三个 flow 的《总控协议》不一致：改一处时三处要一起改")

    readme = LIB / "README.md"
    if not readme.is_file():
        bad("缺 _skills/README.md（使用说明）")
    else:
        rt = readme.read_text(encoding="utf8")
        for n in skills:
            if f"`{n}`" not in rt:
                bad(f"README.md 没有列出 `{n}`")

    if problems:
        print(f"\n共 {len(problems)} 处不合规矩 / {len(problems)} problem(s)")
        sys.exit(1)
    print(f"✓ skills 检查通过：{len(skills)} 个 skill，{len(notes)} 条提醒 / skills OK")


if __name__ == "__main__":
    main()
