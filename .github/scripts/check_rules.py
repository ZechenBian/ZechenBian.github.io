#!/usr/bin/env python3
# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""仓库规矩的机械检查（说明见仓库根目录 CLAUDE.md）：

1. 每个对外页面都在 .github/scripts/pages.json 里登记了，并且带版权声明（All rights reserved）。
2. 由构建生成的页面在 .gitattributes 里标了 linguist-generated（PR 里默认折叠）。
3. 仓库里没有像密钥的字符串（API key、令牌、私钥）。测试里的假密钥要带 "not-a-real" 字样。
4. 没有压缩包，单个文件不超过 10 MB。

用法（仓库根目录）：python3 .github/scripts/check_rules.py
"""
import json, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
MAX_BYTES = 10 * 1024 * 1024
ARCHIVES = (".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar")
SECRET = re.compile(
    r"sk-ant-[A-Za-z0-9_-]{10,}"               # Anthropic
    r"|sk-[A-Za-z0-9_-]{20,}"                  # OpenAI 一类
    r"|gh[pousr]_[A-Za-z0-9]{30,}"             # GitHub 令牌
    r"|github_pat_[A-Za-z0-9_]{20,}"
    r"|AKIA[0-9A-Z]{16}"                       # AWS
    r"|AIza[0-9A-Za-z_-]{35}"                  # Google
    r"|-----BEGIN ([A-Z]+ )?PRIVATE KEY-----"  # 私钥
)

problems = []
def bad(msg):
    problems.append(msg)
    print("✗ " + msg)


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, check=True).stdout.decode()


def main():
    tracked = [f for f in git("ls-files", "-z").split("\0") if f]
    pages = json.loads((ROOT / ".github/scripts/pages.json").read_text(encoding="utf8"))["pages"]
    listed = {p["path"] for p in pages}

    # 1. 页面登记 + 版权声明
    for f in tracked:
        name = pathlib.PurePosixPath(f).name
        if name == "index.html" and "/src/" not in "/" + f and f not in listed:
            bad(f"{f}：新页面没有登记到 .github/scripts/pages.json（登记后才会被冒烟测试覆盖）")
    for p in pages:
        f = ROOT / p["path"]
        if not f.is_file():
            bad(f"{p['path']}：pages.json 里登记了，但文件不存在")
            continue
        if "All rights reserved" not in f.read_text(encoding="utf8", errors="replace"):
            bad(f"{p['path']}：缺少版权声明（All rights reserved）")

    # 2. 构建产物要标 linguist-generated
    gen = [p["path"] for p in pages if p.get("generated")]
    if gen:
        attrs = git("check-attr", "linguist-generated", "--", *gen)
        for line in attrs.splitlines():
            path, _, value = line.split(": ", 2)
            if value.strip() != "true":
                bad(f"{path}：是构建产物，但 .gitattributes 里没有标 linguist-generated=true")

    # 3. 密钥  4. 压缩包和大文件
    for f in tracked:
        p = ROOT / f
        if not p.is_file():
            continue
        if f.lower().endswith(ARCHIVES):
            bad(f"{f}：仓库里不放压缩包")
        size = p.stat().st_size
        if size > MAX_BYTES:
            bad(f"{f}：{size / 1048576:.1f} MB，超过单个文件 10 MB 的上限")
        data = p.read_bytes()
        if b"\0" in data[:8000]:
            continue  # 二进制文件不扫
        for n, line in enumerate(data.decode("utf8", errors="replace").splitlines(), 1):
            m = SECRET.search(line)
            if m and "not-a-real" not in line:
                bad(f"{f}:{n}：像是密钥（{m.group(0)[:12]}…）。密钥不进仓库；测试用的假密钥要带 not-a-real 字样")

    if problems:
        print(f"\n共 {len(problems)} 处不合规矩 / rule violations")
        sys.exit(1)
    print(f"✓ 规矩检查通过：{len(pages)} 个页面，{len(tracked)} 个文件 / rules OK")


if __name__ == "__main__":
    main()
