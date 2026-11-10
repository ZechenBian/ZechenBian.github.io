# ---- standalone mode -----------------------------------------------------------------------
# The lab page appends this when you copy an experiment as one file. Run it with
#     python experiment.py [name=value ...] [seed=1] [budget=600]
# It prints what the page would draw: live points, the log, the results, tables and texts. Pictures are listed by title.
if __name__ == "__main__":
    import sys as _sys

    class _Ctx:
        def __init__(self, budget):
            self._t0, self._budget = _time.time(), budget

        def report(self, step, **metrics):
            print("step %s   %s" % (step, "   ".join("%s=%.5g" % (k, float(v)) for k, v in metrics.items())))

        def log(self, *parts):
            print(*parts)

        def time_left(self):
            return self._budget - (_time.time() - self._t0)

    class _Lib:
        def __init__(self, seed):
            self.rng = _np.random.default_rng(abs(int(seed)))        # the same generator the engine hands to the page's runs
            try:
                import torch
                torch.manual_seed(seed)
                self.torch = torch
                self.device = torch.device("mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu")
            except ImportError:
                self.torch, self.device = None, None

    _params = {}
    for _a in _sys.argv[1:]:
        _k, _, _v = _a.partition("=")
        try:
            _params[_k] = _json.loads(_v)
        except ValueError:
            _params[_k] = _v
    _seed, _budget = int(_params.pop("seed", 1)), float(_params.pop("budget", 600))
    _lab = _Lab(_params, _Lib(_seed), _Ctx(_budget))
    run(_lab)
    print("\nresults:")
    for _k, _v in _lab._res.items():
        print("  %s = %s" % (_k, _v))
    for _o in _lab._out:
        if _o["kind"] == "text":
            print("\n--- %s ---\n%s" % (_o["title"], _o["text"]))
        elif _o["kind"] == "table":
            print("\n--- %s ---\n%s" % (_o["title"], " | ".join(_o["columns"])))
            for _r in _o["rows"]:
                print(" | ".join(str(_c) for _c in _r))
        else:
            _what = {"plot": "a plot", "scatter": "a scatter plot", "heatmap": "a heat map", "regions": "a picture of decision regions", "images": "a sheet of images"}.get(_o["kind"], "a picture")
            print("\n--- %s%s: %s, drawn in the lab page ---" % (_o["title"], " [%s]" % _o["frame"] if _o.get("frame") else "", _what))
