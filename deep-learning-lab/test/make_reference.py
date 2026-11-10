# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""Record the reference runs the page shows next to each preset.

    python3 test/make_reference.py            # runs every numpy preset through the engine code, writes src/reference.json
    python3 test/make_reference.py u02        # re-records only the experiments whose name starts with u02, keeps the rest

The numpy experiments run here (the same job the page sends, through strategy-lab/ml-engine). The PyTorch experiments cannot
run on a machine without PyTorch: their reference runs were recorded on a MacBook Air M5 and are kept by hand in
src/reference_mac.json, which this script merges in unchanged. Every entry says where and when it was measured."""
import datetime
import json
import os
import platform
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import run_local  # noqa: E402

PRESETS = [   # (experiment, reference name, parameters that differ from the defaults)
    ("u01_backprop_numpy", "default", {}),
    ("u01_backprop_numpy", "zero", {"init_scale": 0}),
    ("u01_backprop_numpy", "bigstep", {"lr": 3.0}),
    ("u02_arithmetic_coding", "default", {}),
    ("u02_shakespeare_ngrams", "default", {}),
    ("u04_optimizers_quadratic", "default", {}),
    ("u04_optimizers_quadratic", "rotate", {"rotate": True}),
    ("u04_init_depth", "default", {}),
    ("u04_fgsm_dimension", "default", {}),
    ("u07_attention_numpy", "default", {}),
]


def sig(v, n=5):
    return float("%.*g" % (n, v)) if isinstance(v, float) else v


def trim_curve(curve, keep=120):
    if len(curve) > keep:
        stride = -(-len(curve) // keep)
        curve = curve[::stride] + ([curve[-1]] if (len(curve) - 1) % stride else [])
    return [{k: sig(v) for k, v in pt.items()} for pt in curve]


def trim_outputs(outputs, budget=60000):
    """Keep tables, plots and texts; of a series of picture frames keep only the last one."""
    last = {}
    for i, o in enumerate(outputs):
        if o.get("frame") is not None:
            last[(o["kind"], o["title"])] = i
    out = [o for i, o in enumerate(outputs) if o.get("frame") is None or last[(o["kind"], o["title"])] == i]
    while out and len(json.dumps(out)) > budget:
        big = max(range(len(out)), key=lambda i: len(json.dumps(out[i])))
        out.pop(big)
    return out


def main():
    import numpy
    where = "the lab's build machine (%s, numpy %s, CPU)" % (platform.system(), numpy.__version__)
    when = datetime.date.today().isoformat()
    only = sys.argv[1:]          # e.g. "u02": re-record only the presets whose experiment starts with one of these
    out = os.path.join(ROOT, "src", "reference.json")
    ref = json.load(open(out, encoding="utf8")) if only and os.path.exists(out) else {}
    for exp, name, params in PRESETS:
        if only and not any(exp.startswith(o) for o in only):
            continue
        script = os.path.join(ROOT, "src", "experiments", exp + ".py")
        job, n_lines = run_local.build_job(script, params, 60, 1, run_local.local_data(script))
        final, _ = run_local.run_job(job, echo=False)
        if not final or final[0] != "done":
            raise SystemExit("reference run failed: %s/%s: %s" % (exp, name, final))
        r = final[1]["result"]
        payload = json.loads(r["internals"]["extra"]["json"])
        ref["%s/%s" % (exp, name)] = {
            "where": where, "when": when, "seed": 1, "params": params, "seconds": round(r["fitMs"] / 1000.0, 2),
            "results": payload["results"], "curve": trim_curve(r["curve"]), "outputs": trim_outputs(payload["outputs"]),
            "log": r.get("log", [])[-12:], "sha": payload["meta"]["code_sha256"]}
        print("%-40s %6.2f s  %s" % (exp + "/" + name, r["fitMs"] / 1000.0, {k: v for k, v in list(payload["results"].items())[:4]}))
    mac = os.path.join(ROOT, "src", "reference_mac.json")
    if os.path.exists(mac):
        ref.update(json.load(open(mac, encoding="utf8")))
    json.dump(ref, open(out, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    print("wrote", out, os.path.getsize(out), "bytes,", len(ref), "entries")


if __name__ == "__main__":
    main()
