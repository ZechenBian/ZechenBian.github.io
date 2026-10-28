#!/usr/bin/env python3
# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""把 _skills 里分层存放的 skill 装到别处（说明见 _skills/README.md 的"安装与同步"一节）。

仓库里按层分目录（0-flows / 1-makers / 2-methods），而 Claude Code 和 claude.ai 都要求
每个 skill 是一个平铺的文件夹：<名字>/SKILL.md。这个脚本负责"拍平"。evals/ 不随 skill 安装。

用法（仓库根目录）：
  python3 _skills/tools/sync_skills.py list
  python3 _skills/tools/sync_skills.py install [--dest ~/.claude/skills] [--only 名字 ...] [--dry-run]
  python3 _skills/tools/sync_skills.py pack 输出目录 [--only 名字 ...]

install：复制到 Claude Code 的 skills 目录；同名的旧版本先挪进 dest 旁边的 skills-backup/时间戳/
         （例如 ~/.claude/skills-backup/20261028-120000/），不直接覆盖，也不留在 skills 目录里被当成 skill 读到。
pack：每个 skill 打成 输出目录/<名字>.zip，供 claude.ai 的"上传 skill"使用。
      输出目录必须在仓库外面（仓库里不放压缩包，见仓库根目录 CLAUDE.md）。
"""
import argparse, datetime, pathlib, re, shutil, sys, zipfile

HERE = pathlib.Path(__file__).resolve().parent
LIB = HERE.parent
REPO = LIB.parent
LAYERS = ("0-flows", "1-makers", "2-methods")
SKIP = {"evals", "__pycache__"}


def skills(only=None):
    found = []
    for layer in LAYERS:
        for d in sorted((LIB / layer).iterdir()):
            if (d / "SKILL.md").is_file() and (not only or d.name in only):
                found.append((layer, d))
    if only:
        missing = set(only) - {d.name for _, d in found}
        if missing:
            sys.exit(f"找不到这些 skill：{', '.join(sorted(missing))}")
    return found


def version(d):
    text = (d / "SKILL.md").read_text(encoding="utf8")
    m = re.search(r"^## (?:版本|Version)\s*\n+- (v[0-9.]+)", text, re.M)
    return m.group(1) if m else "?"


def files_of(d):
    for p in sorted(d.rglob("*")):
        if p.is_file() and not (set(p.relative_to(d).parts) & SKIP) and p.suffix != ".pyc":
            yield p


def cmd_list(args):
    for layer, d in skills(args.only):
        print(f"{layer:10} {d.name:24} {version(d)}")


def cmd_install(args):
    dest = pathlib.Path(args.dest).expanduser()
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_root = dest.parent / "skills-backup" / stamp
    for _, d in skills(args.only):
        target = dest / d.name
        if args.dry_run:
            print(f"会装：{d.name} → {target}" + (f"（旧版本先备份到 {backup_root / d.name}）" if target.exists() else ""))
            continue
        if target.exists():
            backup = backup_root / d.name
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(target), str(backup))
            print(f"旧版本已备份：{backup}")
        for p in files_of(d):
            out = target / p.relative_to(d)
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, out)
        print(f"已装：{d.name} {version(d)} → {target}")


def cmd_pack(args):
    out = pathlib.Path(args.outdir).expanduser().resolve()
    if out == REPO or REPO in out.parents:
        sys.exit("输出目录在仓库里面。仓库里不放压缩包，请换一个仓库外的目录。")
    out.mkdir(parents=True, exist_ok=True)
    for _, d in skills(args.only):
        z = out / f"{d.name}.zip"
        with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as zf:
            for p in files_of(d):
                zf.write(p, f"{d.name}/{p.relative_to(d).as_posix()}")
        print(f"已打包：{z}")


def main():
    ap = argparse.ArgumentParser(description="把分层存放的 skill 装到 Claude Code，或打包给 claude.ai 上传")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("list", help="列出全部 skill 和版本")
    a.add_argument("--only", nargs="+")
    a.set_defaults(fn=cmd_list)
    a = sub.add_parser("install", help="装到 Claude Code 的 skills 目录")
    a.add_argument("--dest", default="~/.claude/skills")
    a.add_argument("--only", nargs="+")
    a.add_argument("--dry-run", action="store_true")
    a.set_defaults(fn=cmd_install)
    a = sub.add_parser("pack", help="每个 skill 打成一个 zip，供 claude.ai 上传")
    a.add_argument("outdir")
    a.add_argument("--only", nargs="+")
    a.set_defaults(fn=cmd_pack)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
