# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
# ---- lab runtime ---------------------------------------------------------------------------
# The page appends this file AFTER your script, so the line numbers of your code do not change.
# The engine (strategy-lab/ml-engine) calls fit / predict / inspect; here they only wrap run(lab):
# the engine's "supervised" job is used as a carrier, its data are three dummy rows.
import base64 as _b64
import json as _json
import math as _math
import time as _time

import numpy as _np

_DATASET_URLS = {
    "tinyshakespeare": "https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt",
}


def _arr(a, who):
    """numpy array from numpy / torch / lists (torch tensors are moved to the CPU first)"""
    if hasattr(a, "detach") and hasattr(a, "cpu"):
        a = a.detach().cpu().numpy()
    try:
        return _np.asarray(a, dtype=_np.float64)
    except (TypeError, ValueError):
        raise ValueError("%s: expected numbers (a list, a numpy array or a tensor)" % who)


def _num(v):
    """one JSON-safe number: finite floats rounded to 6 significant digits, everything else None"""
    try:
        if hasattr(v, "detach"):
            v = v.detach().cpu().item()
        f = float(v)
    except (TypeError, ValueError):
        return None
    if not _math.isfinite(f):
        return None
    if f == int(f) and abs(f) < 1e15:
        return int(f)
    return float("%.6g" % f)


def _nums(a, who):
    return [_num(v) for v in _arr(a, who).ravel()]


def _u8(a, lo, hi):
    """floats -> bytes 0..255 on the scale [lo, hi], base64"""
    span = (hi - lo) or 1.0
    q = _np.clip(_np.nan_to_num((a - lo) / span, nan=0.0, posinf=1.0, neginf=0.0), 0.0, 1.0)
    return _b64.b64encode((q * 255.0 + 0.5).astype(_np.uint8).tobytes()).decode("ascii")


class _Lab:
    """What run(lab) receives. Live: report, log. After the run: result, text, table, plot, scatter, heatmap, regions, images."""

    def __init__(self, p, lib, ctx):
        p = dict(p)
        self._data = p.pop("__data", None) or {}
        self._p, self._lib, self._ctx = p, lib, ctx
        self._out, self._res = [], {}
        self.np = _np
        self.rng = lib.rng                      # numpy Generator, seeded by the page's "seed"

    # ----- parameters and environment
    def p(self, key, default=None):
        """A parameter set in the page (or `default` when it was not sent)."""
        v = self._p.get(key)
        return default if v is None else v

    @property
    def torch(self):
        return self._lib.torch

    @property
    def device(self):
        """torch.device: Apple GPU (mps) if available, else cuda, else cpu. None without PyTorch."""
        return self._lib.device

    def time_left(self):
        """Seconds left in this run's time budget; stop your loop when it reaches 0."""
        return self._ctx.time_left()

    def dataset(self, name):
        """A dataset shipped with the page (a str). If the page did not send it, it is fetched into memory from its source."""
        if name in self._data:
            return self._data[name]
        url = _DATASET_URLS.get(name)
        if not url:
            raise ValueError("lab.dataset: unknown dataset %r (known: %s)" % (name, ", ".join(sorted(_DATASET_URLS))))
        self.log("dataset %r was not sent by the page: reading it from %s (kept in memory, nothing is saved)" % (name, url))
        try:
            import urllib.request
            with urllib.request.urlopen(url, timeout=30) as r:
                return r.read().decode("utf-8")
        except Exception as first:                  # e.g. a Python without root certificates: let the system's curl try
            import subprocess
            try:
                got = subprocess.run(["curl", "-fsSL", "--max-time", "60", url], capture_output=True)
            except OSError:
                got = None
            if got is None or got.returncode != 0 or not got.stdout:
                raise RuntimeError("could not read dataset %r from %s (%s). Run the experiment from the lab page, which sends "
                                   "the data itself." % (name, url, first))
            return got.stdout.decode("utf-8")

    # ----- live output
    def report(self, step, **metrics):
        """One point on the live curves: lab.report(step, train_loss=..., val_loss=...)."""
        self._ctx.report(step, **metrics)

    def log(self, *parts):
        self._ctx.log(*parts)

    # ----- results, shown when the run ends
    def result(self, **named):
        """Headline numbers (or short strings): lab.result(val_acc=0.97, n_params=1234)."""
        for k, v in named.items():
            self._res[str(k)] = v if isinstance(v, str) else _num(v)

    def text(self, title, s):
        self._out.append({"kind": "text", "title": str(title), "text": str(s)[:20000]})

    def table(self, title, columns, rows):
        clean = [[c if isinstance(c, str) else _num(c) for c in row] for row in rows][:500]
        self._out.append({"kind": "table", "title": str(title), "columns": [str(c) for c in columns], "rows": clean})

    def plot(self, title, x, series, xlabel="", ylabel="", logx=False, logy=False):
        """Line plot that is not a training curve: series = {name: y-values} over the common x."""
        xs = _nums(x, "lab.plot x")
        ss = []
        for name, y in series.items():
            ys = _nums(y, "lab.plot series %r" % (name,))
            if len(ys) != len(xs):
                raise ValueError("lab.plot: series %r has %d values but x has %d" % (name, len(ys), len(xs)))
            ss.append({"name": str(name), "y": ys})
        self._out.append({"kind": "plot", "title": str(title), "x": xs, "series": ss, "xlabel": xlabel, "ylabel": ylabel,
                          "logx": bool(logx), "logy": bool(logy)})

    def scatter(self, title, groups, xlabel="", ylabel="", frame=None):
        """Point clouds in the plane: groups = {name: array [N, 2]}. Calls with the same title become frames."""
        gs = []
        for name, pts in groups.items():
            a = _arr(pts, "lab.scatter group %r" % (name,))
            if a.ndim != 2 or a.shape[1] != 2:
                raise ValueError("lab.scatter: group %r must have shape [N, 2], got %s" % (name, list(a.shape)))
            a = a[:4000]
            gs.append({"name": str(name), "xy": [[_num(u), _num(v)] for u, v in a]})
        self._out.append({"kind": "scatter", "title": str(title), "groups": gs, "xlabel": xlabel, "ylabel": ylabel,
                          "frame": None if frame is None else str(frame)})

    def heatmap(self, title, z, extent=None, vmin=None, vmax=None, diverging=False, xlabel="", ylabel="", frame=None):
        """A scalar field z[H, W] (row 0 at the top). extent = (x0, x1, y0, y1) labels the axes."""
        a = _arr(z, "lab.heatmap")
        if a.ndim != 2:
            raise ValueError("lab.heatmap: z must have shape [H, W], got %s" % list(a.shape))
        if a.size > 65536:
            raise ValueError("lab.heatmap: at most 256 x 256 cells")
        fin = a[_np.isfinite(a)]
        lo = float(fin.min()) if vmin is None and fin.size else float(vmin or 0.0)
        hi = float(fin.max()) if vmax is None and fin.size else float(vmax or 1.0)
        if diverging and vmin is None and vmax is None:
            m = max(abs(lo), abs(hi)) or 1.0
            lo, hi = -m, m
        self._out.append({"kind": "heatmap", "title": str(title), "h": int(a.shape[0]), "w": int(a.shape[1]), "b64": _u8(a, lo, hi),
                          "vmin": _num(lo), "vmax": _num(hi), "diverging": bool(diverging),
                          "extent": None if extent is None else [_num(v) for v in extent], "xlabel": xlabel, "ylabel": ylabel,
                          "frame": None if frame is None else str(frame)})

    def regions(self, title, probs, extent, points=None, labels=None, frame=None):
        """Decision regions of a classifier in the plane: probs[H, W, K] on a grid (row 0 at the TOP, i.e. the largest y),
        extent = (x0, x1, y0, y1); points [N, 2] with integer labels [N] are drawn on top."""
        a = _arr(probs, "lab.regions")
        if a.ndim != 3:
            raise ValueError("lab.regions: probs must have shape [H, W, K], got %s" % list(a.shape))
        cls = a.argmax(axis=2).astype(_np.uint8)
        conf = a.max(axis=2)
        k = a.shape[2]
        o = {"kind": "regions", "title": str(title), "h": int(a.shape[0]), "w": int(a.shape[1]), "k": int(k),
             "cls": _b64.b64encode(cls.tobytes()).decode("ascii"), "conf": _u8(conf, 1.0 / k, 1.0),
             "extent": [_num(v) for v in extent], "frame": None if frame is None else str(frame)}
        if points is not None:
            pts = _arr(points, "lab.regions points")[:3000]
            o["points"] = [[_num(u), _num(v)] for u, v in pts]
            o["labels"] = [int(v) for v in _arr(labels, "lab.regions labels").ravel()[:3000]] if labels is not None else None
        self._out.append(o)

    def images(self, title, imgs, cols=8, vmin=None, vmax=None, frame=None):
        """A grid of small grayscale images: imgs[N, H, W]."""
        a = _arr(imgs, "lab.images")
        if a.ndim != 3:
            raise ValueError("lab.images: expected shape [N, H, W], got %s" % list(a.shape))
        a = a[:144]
        if a.size > 200000:
            raise ValueError("lab.images: too many pixels (at most 200,000 in total)")
        lo = float(a.min()) if vmin is None else float(vmin)
        hi = float(a.max()) if vmax is None else float(vmax)
        self._out.append({"kind": "images", "title": str(title), "n": int(a.shape[0]), "h": int(a.shape[1]), "w": int(a.shape[2]),
                          "cols": int(cols), "b64": _u8(a, lo, hi), "frame": None if frame is None else str(frame)})

    def _finish(self):
        n = self._res.get("n_params")
        payload = _json.dumps({"results": self._res, "outputs": self._out, "meta": {"code_sha256": _code_sha256()}}, allow_nan=False)
        return {"size": int(n) if isinstance(n, (int, float)) else 0, "json": payload}


def _code_sha256():
    """Fingerprint of exactly the code that ran (your script plus this runtime), so a result can be tied to its source."""
    try:
        import hashlib
        import linecache
        src = "".join(linecache.cache["<algo>"][2])
        return hashlib.sha256(src.encode("utf-8")).hexdigest()
    except Exception:
        return None


def fit(data, p, lib, ctx):
    entry = globals().get("run")
    if not callable(entry):
        raise RuntimeError("The script must define a function run(lab): the lab calls it and passes the lab object.")
    lab = _Lab(p, lib, ctx)
    entry(lab)
    return lab._finish()


def predict(model, X):
    return _np.zeros(len(X))


def inspect(model):
    return {"extra": {"json": model["json"]}}
