# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""The Python half of test/seed_audit.js: run the listed experiments with many seeds and write down their results.

    python3 test/seed_audit.py runs.json out.json 40

runs.json is a list of {"exp": "u01_backprop_numpy", "set": {...}}; out.json gets, for each of them, the list of the
`results` of the runs with seeds 1..N (null where a run failed). Runs go through the engine code, as on the page."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run_local  # noqa: E402

if __name__ == "__main__":
    runs = json.load(open(sys.argv[1], encoding="utf8"))
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 40
    out = []
    for r in runs:
        script = os.path.join(HERE, "..", "src", "experiments", r["exp"] + ".py")
        rows, data = [], run_local.local_data(script)
        for seed in range(1, n + 1):
            final, _ = run_local.run_job(run_local.build_job(script, r["set"], 120, seed, data)[0], echo=False)
            rows.append(json.loads(final[1]["result"]["internals"]["extra"]["json"])["results"] if final and final[0] == "done" else None)
        out.append(rows)
        sys.stderr.write("%s %s: %d seeds\n" % (r["exp"], json.dumps(r["set"]), n))
    json.dump(out, open(sys.argv[2], "w", encoding="utf8"))
