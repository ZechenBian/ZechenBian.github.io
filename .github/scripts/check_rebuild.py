#!/usr/bin/env python3
# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""重建一致：每个有构建脚本的项目从 src/ 重新构建一遍，构建前后磁盘上的文件必须一模一样。

在 GitHub 上（磁盘 = 提交的内容）它检查的是"提交的页面就是源码构建出来的"：
防止有人直接改了构建产物，或者改了源码忘了重建。
在本地跑，它检查的是"磁盘上的页面和磁盘上的源码一致"；不一致时构建已经把页面更新了，把它们一起提交即可。

用法（仓库根目录）：python3 .github/scripts/check_rebuild.py
策略实验室的构建要 KaTeX 和 acorn：先在 strategy-lab/ 里 npm install；天下棋局的地图要 d3-geo：先在 tianxia/_source/ 里 npm install。
"""
import hashlib, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]

# (名字, 在哪个目录里运行, 构建命令, 要比对的目录)。新项目有了构建脚本就加一行。
# 要比对的目录省略时就是运行的目录；天下棋局的源码在 tianxia/_source，产物写到四个版本的目录里。
TIANXIA_PAGES = ["tianxia", "tianxia-v2", "tianxia-v3", "tianxia-v4"]
BUILDS = [
    ("引力弹弓 gravity-slingshot", "gravity-slingshot", ["node", "build.js"]),
    ("深夜解压铺 jieya",           "jieya",             ["node", "build.js"]),
    ("诺奖实验室 nobel-lab",       "nobel-lab",         ["python3", "build.py", "--github", "."]),
    ("策略实验室 strategy-lab",    "strategy-lab",      ["python3", "build.py"]),
    # 地图数据（geo.js、geo_cn.js、cities.js）从 Natural Earth 原始数据生成；要先在 tianxia/_source 里 npm install（d3-geo）
    ("天下棋局地图 tianxia map",   "tianxia/_source",   ["npm", "run", "--silent", "map"], ["tianxia/_source/src"]),
    ("天下棋局 tianxia",           "tianxia/_source",   ["node", "build-pages.js"], TIANXIA_PAGES),
]


def snapshot(dirs):
    """这些目录里所有不被 .gitignore 忽略的文件（已跟踪的和新文件）→ 内容哈希。"""
    out = subprocess.run(["git", "ls-files", "-co", "--exclude-standard", "-z", "--", *dirs],
                         cwd=ROOT, capture_output=True, check=True).stdout.decode()
    snap = {}
    for f in filter(None, out.split("\0")):
        p = ROOT / f
        if p.is_file():
            snap[f] = hashlib.sha256(p.read_bytes()).hexdigest()
    return snap


def main():
    failed = []
    for name, d, cmd, *watch in BUILDS:
        dirs = watch[0] if watch else [d]
        before = snapshot(dirs)
        r = subprocess.run(cmd, cwd=ROOT / d, capture_output=True, text=True)
        if r.returncode:
            print(f"✗ {name}：构建失败 / build failed\n{r.stdout[-3000:]}{r.stderr[-3000:]}")
            failed.append(name)
            continue
        after = snapshot(dirs)
        changed = sorted(f for f in before.keys() | after.keys() if before.get(f) != after.get(f))
        if changed:
            print(f"✗ {name}：重建出来的文件和现有的不一样 / rebuilt files differ:")
            for f in changed:
                what = "新生成 new" if f not in before else ("被删除 removed" if f not in after else "内容不同 changed")
                print(f"    {f}  ({what})")
            print("  → 改源码后要重新构建，并把源码和构建产物一起提交；不要直接改构建产物。")
            failed.append(name)
        else:
            print(f"✓ {name}：重建结果一致 / rebuild matches")
    if failed:
        print(f"\n重建不一致的项目 / projects that do not rebuild cleanly: {', '.join(failed)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
