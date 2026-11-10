# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""Reference runs of the PyTorch experiments, recorded on a Mac.

The build machine has no PyTorch, so make_reference.py cannot make these. Three steps; the middle one happens on the Mac:

    python3 test/mac_reference.py job u07_char_transformer quick:max_steps=300,eval_every=50 default nopos:positional=false > job.json
        One engine job that runs the named presets back to back in one process, every seed reset before each one.
        Send it to the engine on the Mac (run_start) and save the engine's reply: the result of the `done` event,
        or the whole run_events reply.

    python3 test/mac_reference.py record u07_char_transformer reply.json "MacBook Air M5" [--when 2026-11-10] [--note "..."]
        Checks that the code that ran is this repository's code (sha256 of the script plus src/labrt.py), then writes
        one entry per preset into src/reference_mac.json. python3 test/make_reference.py merges that file into
        src/reference.json.

    python3 test/mac_reference.py check u01_backprop_numpy a b:lr=3.0 c:__seed=5
        Runs such a job through the engine code here and compares every preset with a run on its own. This tests the
        wrapper; it needs an experiment that runs without PyTorch.

A preset may carry its own seed as the parameter __seed (the script never sees it): quick2:max_steps=300,__seed=2.
That is for checking that a question's answer does not depend on the seed; `record` refuses such runs, because the
page's reference runs all use the seed the page starts with. Their numbers are kept with

    python3 test/mac_reference.py seeds u07_char_transformer reply.json "MacBook Air M5" [--when 2026-11-10]
        Same check of the code, then the results of every run (no curves, no outputs) go into test/mac_seeds.json."""
import datetime
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import run_local  # noqa: E402
from make_reference import trim_curve, trim_outputs  # noqa: E402

MARK = "# ---- reference wrapper"
WRAPPER = MARK + ''' (not part of the page): several presets back to back, every seed reset before each ----
_PRESETS = %s


def fit(data, p, lib, ctx):
    import hashlib as _h
    import linecache as _lc
    import random as _random
    import time as _time
    src = "".join(_lc.cache["<algo>"][2])
    out = {"sha_of_page_job": _h.sha256(src[:src.index("\\n# ---- reference wrapper") + 1].encode("utf-8")).hexdigest(), "runs": {}}
    seed = abs(int(getattr(lib, "_seed", 1)))

    class _Rec:
        def __init__(self):
            self.points, self.logs = 0, []

        def report(self, step, *a, **m):
            self.points += 1
            ctx.report(step, *a, **m)

        def log(self, *parts):
            self.logs.append(" ".join(str(x) for x in parts))
            ctx.log(*parts)

        def time_left(self):
            return ctx.time_left()

    for name, extra in _PRESETS:
        q = dict(p)
        q.update(extra)
        s = abs(int(q.pop("__seed", seed)))
        _random.seed(s)
        _np.random.seed(s %% (2 ** 32))
        lib.rng = _np.random.default_rng(s)
        if lib.torch is not None:
            lib.torch.manual_seed(s)
        rec, t0 = _Rec(), _time.perf_counter()
        lab = _Lab(q, lib, rec)
        run(lab)
        last = {}
        for i, o in enumerate(lab._out):                # of a series of picture frames keep the last one
            if o.get("frame") is not None:
                last[(o["kind"], o["title"])] = i
        outs = [o for i, o in enumerate(lab._out) if o.get("frame") is None or last[(o["kind"], o["title"])] == i]
        out["runs"][name] = {"params": {k: v for k, v in extra.items() if k != "__seed"}, "seed": s, "results": lab._res, "points": rec.points,
                             "outputs": outs, "log": rec.logs, "seconds": round(_time.perf_counter() - t0, 2)}
    return {"size": 0, "json": _json.dumps(out, allow_nan=False)}
'''


def parse_presets(specs):
    """["quick:max_steps=300,eval_every=50", "default"] -> [["quick", {"max_steps": 300, "eval_every": 50}], ["default", {}]]"""
    out = []
    for s in specs:
        name, _, rest = s.partition(":")
        params = {}
        for kv in filter(None, rest.split(",")):
            k, v = kv.split("=", 1)
            try:
                params[k] = json.loads(v)
            except ValueError:
                params[k] = v
        out.append([name, params])
    return out


def script_of(exp):
    return os.path.join(ROOT, "src", "experiments", exp + ".py")


def build(exp, presets, budget_s=600, seed=1):
    job, _ = run_local.build_job(script_of(exp), {}, budget_s, seed)
    page_sha = hashlib.sha256(job["code"].encode("utf-8")).hexdigest()
    job["code"] += WRAPPER % repr(presets)
    return job, page_sha


def result_of(reply):
    """The engine's result, from whichever form the reply was saved in."""
    if isinstance(reply, dict) and "events" in reply:
        done = [e for e in reply["events"] if e.get("name") == "done"]
        if not done:
            raise SystemExit("the reply has no `done` event: the run did not finish")
        return json.loads(done[0]["text"])["result"]
    return reply.get("result", reply)


def entries(exp, result, where, when, seed=1, note="", any_seed=False):
    extra = json.loads(result["internals"]["extra"]["json"])
    job, _ = run_local.build_job(script_of(exp), {}, 600, seed)
    page_sha = hashlib.sha256(job["code"].encode("utf-8")).hexdigest()
    if extra.get("sha_of_page_job") != page_sha:
        raise SystemExit("the code that ran (%s) is not the code in this repository (%s): record again" % (extra.get("sha_of_page_job"), page_sha))
    curve, at, out = result.get("curve") or [], 0, {}
    names = list(extra["runs"])
    for i, name in enumerate(names):
        r = extra["runs"][name]
        pts = curve[at:at + r["points"]]
        at += r["points"]
        if r.get("seed", seed) != seed and not any_seed:
            raise SystemExit("run %s used seed %s: reference runs use seed %s" % (name, r.get("seed"), seed))
        said = "Recorded on the Mac" + (" in one engine process that ran %d presets of this experiment one after another, with every seed reset before each." % len(names) if len(names) > 1 else ".")
        out["%s/%s" % (exp, name)] = {
            "where": where, "when": when, "seed": r.get("seed", seed), "params": r["params"], "seconds": r["seconds"], "results": r["results"],
            "curve": trim_curve(pts), "outputs": trim_outputs(r["outputs"]), "log": r["log"][-12:], "sha": page_sha,
            "note": (said + " " + note).strip()}
    if at != len(curve):
        raise SystemExit("the runs reported %d curve points, the engine returned %d" % (at, len(curve)))
    return out


def where_of(machine, result):
    e = result.get("engine") or {}
    dev = e.get("device")
    return "%s, PyTorch %s on %s, Python %s, numpy %s" % (
        machine, e.get("torch"), "the Apple GPU (mps)" if dev == "mps" else "the CPU" if dev == "cpu" else dev, e.get("python"), e.get("numpy"))


def take(args, flag, default=None):
    if flag in args:
        i = args.index(flag)
        v = args[i + 1]
        del args[i:i + 2]
        return v
    return default


def main():
    args = sys.argv[1:]
    if len(args) < 2 or args[0] not in ("job", "record", "check", "seeds"):
        raise SystemExit(__doc__)
    cmd, exp = args[0], args[1]
    rest = args[2:]
    if cmd == "job":
        budget = float(take(rest, "--budget", 600))
        job, sha = build(exp, parse_presets(rest), budget)
        json.dump(job, sys.stdout)
        sys.stderr.write("page job sha256 %s; %d characters of code; budget %g s\n" % (sha, len(job["code"]), budget))
    elif cmd == "record":
        when = take(rest, "--when", datetime.date.today().isoformat())
        note = take(rest, "--note", "")
        result = result_of(json.load(open(rest[0], encoding="utf8")))
        new = entries(exp, result, where_of(rest[1], result), when, note=note)
        path = os.path.join(ROOT, "src", "reference_mac.json")
        ref = json.load(open(path, encoding="utf8")) if os.path.exists(path) else {}
        ref.update(new)
        json.dump(ref, open(path, "w", encoding="utf8"), ensure_ascii=False, indent=1, sort_keys=True)
        for k, v in new.items():
            print("%-40s %7.2f s  %d curve points, %d outputs  %s" % (k, v["seconds"], len(v["curve"]), len(v["outputs"]), dict(list(v["results"].items())[:3])))
        print("wrote", path, "- now run python3 test/make_reference.py")
    elif cmd == "seeds":
        when = take(rest, "--when", datetime.date.today().isoformat())
        result = result_of(json.load(open(rest[0], encoding="utf8")))
        got = entries(exp, result, where_of(rest[1], result), when, any_seed=True)
        path = os.path.join(HERE, "mac_seeds.json")
        book = json.load(open(path, encoding="utf8")) if os.path.exists(path) else {}
        for k, v in got.items():
            if any("time budget nearly used up" in line for line in v["log"]):
                print("%-36s seed %d  not kept: the time budget cut this run short" % (k, v["seed"]))
                continue
            book[k] = {"where": v["where"], "when": v["when"], "seed": v["seed"], "params": v["params"], "seconds": v["seconds"], "results": v["results"], "sha": v["sha"]}
            print("%-36s seed %d  %7.2f s  %s" % (k, v["seed"], v["seconds"], {a: v["results"].get(a) for a in list(v["results"])[:3]}))
        json.dump(book, open(path, "w", encoding="utf8"), ensure_ascii=False, indent=1, sort_keys=True)
        print("wrote", path)
    else:
        presets = parse_presets(rest)
        job, sha = build(exp, presets, 120)
        final, _ = run_local.run_job(job, echo=False)
        if not final or final[0] != "done":
            raise SystemExit("the wrapped job failed: %s" % (final,))
        got = entries(exp, final[1]["result"], "here", "today", any_seed=True)
        bad = 0
        for name, params in presets:
            own = {k: v for k, v in params.items() if k != "__seed"}
            alone, _ = run_local.run_job(run_local.build_job(script_of(exp), own, 60, int(params.get("__seed", 1)))[0], echo=False)
            r = alone[1]["result"]
            pay = json.loads(r["internals"]["extra"]["json"])
            e = got["%s/%s" % (exp, name)]
            same = (e["results"] == pay["results"] and e["curve"] == trim_curve(r["curve"]) and e["outputs"] == trim_outputs(pay["outputs"])
                    and e["sha"] == pay["meta"]["code_sha256"] and e["log"] == r.get("log", [])[-12:])
            bad += not same
            print("%-12s %s  %s" % (name, "same as a run on its own" if same else "DIFFERS from a run on its own", dict(list(e["results"].items())[:3])))
        sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
