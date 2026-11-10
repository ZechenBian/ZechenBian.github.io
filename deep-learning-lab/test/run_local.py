# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""Run one experiment script through the real engine code (strategy-lab/ml-engine), the way the page does:
the script, then src/labrt.py appended, sent as a "supervised" job with three dummy rows.

    python3 test/run_local.py src/experiments/u01_backprop_numpy.py [key=value ...] [--budget 20] [--seed 1] [--json out.json]

Prints the log, the last curve point, the results and a one-line summary of every output."""
import json
import multiprocessing as mp
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "..", "strategy-lab", "ml-engine"))

DUMMY = {"kind": "regression", "train": {"X": [[0], [1]], "y": [0, 1], "n": 2, "d": 1},
         "valid": {"X": [[0]], "y": [0], "n": 1, "d": 1}, "test": {"X": [[0]], "n": 1, "d": 1}}


def build_job(script_path, params, budget_s=20, seed=1, data=None):
    code = open(script_path, encoding="utf8").read()
    if not code.endswith("\n"):
        code += "\n"
    rt = open(os.path.join(ROOT, "src", "labrt.py"), encoding="utf8").read()
    p = dict(params)
    if data:
        p["__data"] = data
    return {"api": "supervised", "kind": "regression", "code": code + "\n" + rt, "params": p, "seed": seed,
            "budgetMs": int(budget_s * 1000), "data": DUMMY}, code.count("\n")


def run_job(job, echo=True):
    from mllab_engine import worker
    ctx = mp.get_context("spawn")
    parent, child = ctx.Pipe(duplex=False)
    proc = ctx.Process(target=worker.child_main, args=(job, child, {"quiet": True}))
    proc.start()
    child.close()
    events, final = [], None
    while True:
        try:
            kind, text = parent.recv()
        except EOFError:
            break
        d = json.loads(text)
        events.append((kind, d))
        if echo and kind == "log":
            print("  log:", d["text"])
        if kind in ("done", "error"):
            final = (kind, d)
            break
    proc.join(10)
    return final, events


def summarize(final, n_user_lines):
    kind, d = final
    if kind == "error":
        print("ERROR line %s%s: %s" % (d.get("line"), " (in the lab runtime)" if d.get("line", 0) > n_user_lines else "", d.get("message")))
        print(d.get("traceback", ""))
        return None
    r = d["result"]
    payload = json.loads(r["internals"]["extra"]["json"])
    print("  fit %.0f ms, %d curve points, last: %s" % (r["fitMs"], len(r["curve"]), r["curve"][-1] if r["curve"] else None))
    print("  results:", payload["results"])
    for o in payload["outputs"]:
        extra = {"text": lambda o: repr(o["text"][:70]), "table": lambda o: "%d rows x %s" % (len(o["rows"]), o["columns"]),
                 "plot": lambda o: "%d points, series %s" % (len(o["x"]), [s["name"] for s in o["series"]]),
                 "scatter": lambda o: [(g["name"], len(g["xy"])) for g in o["groups"]],
                 "heatmap": lambda o: "%dx%d [%s, %s]" % (o["h"], o["w"], o["vmin"], o["vmax"]),
                 "regions": lambda o: "%dx%d k=%d" % (o["h"], o["w"], o["k"]),
                 "images": lambda o: "%d images %dx%d" % (o["n"], o["h"], o["w"])}[o["kind"]](o)
        print("  output %-8s %s%s: %s" % (o["kind"], o["title"], " [" + o["frame"] + "]" if o.get("frame") else "", extra))
    return r, payload


if __name__ == "__main__":
    args = sys.argv[1:]
    script, params, budget, seed, out = args[0], {}, 20, 1, None
    i = 1
    while i < len(args):
        a = args[i]
        if a == "--budget":
            budget = float(args[i + 1]); i += 2; continue
        if a == "--seed":
            seed = int(args[i + 1]); i += 2; continue
        if a == "--json":
            out = args[i + 1]; i += 2; continue
        k, v = a.split("=", 1)
        try:
            params[k] = json.loads(v)
        except ValueError:
            params[k] = v
        i += 1
    job, n_lines = build_job(script, params, budget, seed)
    final, events = run_job(job)
    res = summarize(final, n_lines)
    if out and res:
        json.dump({"result": {k: v for k, v in res[0].items() if k not in ("pred",)}, "payload": res[1]}, open(out, "w"))
    sys.exit(0 if final and final[0] == "done" else 1)
