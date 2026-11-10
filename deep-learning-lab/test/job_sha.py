# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""sha256 of the code a job carries for one script (script + blank line + src/labrt.py), as the engine sees it."""
import hashlib, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def job_code(path):
    code = open(path, encoding="utf8").read()
    if not code.endswith("\n"):
        code += "\n"
    return code + "\n" + open(os.path.join(ROOT, "src", "labrt.py"), encoding="utf8").read()
if __name__ == "__main__":
    for p in sys.argv[1:]:
        c = job_code(p)
        print(hashlib.sha256(c.encode("utf8")).hexdigest(), len(c), p)
