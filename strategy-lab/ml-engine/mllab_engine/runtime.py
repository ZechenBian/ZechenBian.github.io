# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""子进程里真正干活的部分：把页面发来的数据整理成算法看到的样子、准备 lib 和 ctx、调用 fit / predict / forecast、
检查预测的格式、拍快照、截断模型内部结构，最后拼成结果。

和 src/ml/run.js 一一对应（注释里写了对应的 JS 函数）。差别只有一处是有意的：这里不算任何指标，
只把原始预测交回去，由页面用同一份 JavaScript（src/ml/stats.js）打分，指标的定义只存在于一个地方。

这个模块只在子进程里导入：numpy 在这里才第一次被导入，PyTorch 更是只在算法用到时才导入（见 Lib）。"""
import math
import os
import sys
import time
import types
import warnings

import numpy as np

from .codec import Typed

MAX_CURVE = 2000          # 学习曲线最多保留的点数（均匀抽稀），同 run.js
MAX_CURVE_RAW = 200000    # 抽稀之前最多存多少点（防止每步都 report 时把内存吃光）
MAX_SNAPS = 60            # 快照最多张数，同 run.js
MAX_TRAIN_PRED = 20000    # 训练集太大时只预测这么多行，同 run.js
MAX_LOG = 200             # 日志最多行数，同 run.js
PROGRESS_GAP_MS = 120     # 进度事件的最小间隔（约每秒 8 次），同 run.js


class EngineError(Exception):
    """引擎自己发现的问题（格式不对、没返回模型……）：消息就是给人看的中文，不加异常类型的前缀"""


def now_ms():
    return time.perf_counter() * 1000.0


class Namespace(types.SimpleNamespace):
    """既能 data.train.X，也能 data.train["X"]、data.train.get("X")"""

    def __getitem__(self, key):
        try:
            return getattr(self, key)
        except AttributeError:
            raise KeyError(key)

    def get(self, key, default=None):
        return getattr(self, key, default)

    def __contains__(self, key):
        return hasattr(self, key)

    def keys(self):
        return list(vars(self).keys())


def field(obj, key, default=None):
    """从字典或对象里取一个字段（inspect 可以返回字典，也可以返回带属性的对象）"""
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


# ---------- 数字的写法：和 JavaScript 的 String(v)、v.toPrecision(p) 一样，报错信息才和第一期逐字相同 ----------
def js_num(v):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return "NaN"
    if v != v:
        return "NaN"
    if v in (math.inf, -math.inf):
        return "Infinity" if v > 0 else "-Infinity"
    if v == int(v) and abs(v) < 1e21:
        return str(int(v))
    r = repr(v)
    if "e" in r:
        mant, ex = r.split("e")
        ex = int(ex)
        if -7 < ex < 21:
            from decimal import Decimal
            return format(Decimal(r), "f")
        return mant + "e" + ("+" if ex > 0 else "-") + str(abs(ex))
    return r


def to_precision(x, p):
    x = float(x)
    if x != x:
        return "NaN"
    if x in (math.inf, -math.inf):
        return "Infinity" if x > 0 else "-Infinity"
    if x == 0:
        return "0" if p == 1 else "0." + "0" * (p - 1)
    s = "%.*e" % (p - 1, x)
    mant, ex = s.split("e")
    e = int(ex)
    if e < -6 or e >= p:
        return mant + "e" + ("+" if e >= 0 else "-") + str(abs(e))
    return "%.*f" % (max(0, p - 1 - e), x)


# ---------- PyTorch：用到才导入 ----------
_TORCH = {"tried": False, "mod": None, "device": None, "seeded": False}


def _pick_device(torch):
    """mps（苹果芯片的 GPU）> cuda > cpu；环境变量 MLLAB_DEVICE=cpu 可以强制用 CPU（排查 MPS 问题时有用）"""
    want = (os.environ.get("MLLAB_DEVICE") or "").strip().lower()
    try:
        mps_ok = getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available()
    except Exception:
        mps_ok = False
    try:
        cuda_ok = torch.cuda.is_available()
    except Exception:
        cuda_ok = False
    if want == "cpu" or (want == "mps" and not mps_ok and not cuda_ok) or (want == "cuda" and not cuda_ok and not mps_ok):
        return torch.device("cpu")
    if want == "cuda" and cuda_ok:
        return torch.device("cuda")
    if mps_ok:
        return torch.device("mps")
    if cuda_ok:
        return torch.device("cuda")
    return torch.device("cpu")


def seed_torch(seed):
    """torch 已经被导入（不管是 lib.torch 还是算法自己 import torch）就给它播种，只播一次"""
    torch = sys.modules.get("torch")
    if torch is None or _TORCH["seeded"]:
        return
    _TORCH["seeded"] = True
    try:
        torch.manual_seed(int(seed) % (2 ** 63))     # 同时给 CPU、CUDA、MPS 的随机数播种
    except Exception:
        pass


def load_torch(seed):
    if not _TORCH["tried"]:
        _TORCH["tried"] = True
        try:
            import torch
        except ImportError:
            return None
        _TORCH["mod"] = torch
        try:
            _TORCH["device"] = _pick_device(torch)
        except Exception:
            _TORCH["device"] = torch.device("cpu")
        seed_torch(seed)
    return _TORCH["mod"]


def torch_device():
    return _TORCH["device"]


def is_tensor(x):
    torch = sys.modules.get("torch")
    return torch is not None and isinstance(x, torch.Tensor)


def tensor_to_numpy(x):
    torch = sys.modules["torch"]
    t = x.detach().cpu()
    if t.dtype not in (torch.float64, torch.float32):
        t = t.to(torch.float32)     # float16 / bfloat16 / 整数 / 布尔：numpy 不一定认得，先换成 float32
    return t.numpy()


class Lib:
    """传给 fit 的 lib：np、torch、nn、F、device、rng。torch 那几个是第一次用到时才导入的
    （导入 PyTorch 要一两秒；只用 numpy 的算法不必等）"""

    def __init__(self, seed):
        self._seed = seed
        self.np = np
        self.rng = np.random.default_rng(abs(int(seed)))

    @property
    def torch(self):
        return load_torch(self._seed)

    @property
    def nn(self):
        t = load_torch(self._seed)
        return t.nn if t is not None else None

    @property
    def F(self):
        t = load_torch(self._seed)
        return t.nn.functional if t is not None else None

    @property
    def device(self):
        t = load_torch(self._seed)
        return _TORCH["device"] if t is not None else None

    def __repr__(self):
        return "<lib: np, torch, nn, F, device, rng>"


# ---------- 把算法的输出变成数字数组 ----------
def as_float_array(out, who):
    if out is None or isinstance(out, (str, bytes, dict)) or isinstance(out, (int, float, bool)):
        raise EngineError(who + " 没有返回数组。")
    if is_tensor(out):
        out = tensor_to_numpy(out)
    if isinstance(out, np.ndarray) and out.ndim == 0:
        raise EngineError(who + " 没有返回数组。")
    try:
        a = np.asarray(out, dtype=np.float64)
    except (TypeError, ValueError) as e:
        if isinstance(out, (list, tuple)) and any(is_tensor(v) for v in out[:5]):
            try:
                a = np.asarray([float(v) for v in out], dtype=np.float64)
            except Exception:
                raise EngineError(who + " 返回的东西没法变成数字数组（%s）。" % e)
        else:
            raise EngineError(who + " 返回的东西没法变成数字数组（%s）。" % e)
    if a.ndim == 0:
        raise EngineError(who + " 没有返回数组。")
    return a


def clean_pred(kind, out, n, k, who):
    """run.js 的 cleanPred：检查、整理成 float64；分类的每行概率要非负、和为 1（差 1e-3 以内），再归一化"""
    a = as_float_array(out, who)
    if kind == "classification":
        want = n * k
        if a.ndim == 2 and a.size == want and a.shape != (n, k):
            raise EngineError("%s 返回的数组形状是 (%d, %d)，应该是 (%d, %d)：每行一个样本、每列一个类别的概率。" % (who, a.shape[0], a.shape[1], n, k))
        if a.size != want:
            raise EngineError("%s 返回了 %d 个数，应该是 %d 个（每个样本 %d 个类别的概率，按行排）。" % (who, a.size, want, k))
        v = a.reshape(n, k)
        with np.errstate(invalid="ignore", over="ignore"):
            bad = ~(v >= 0) | ~np.isfinite(v)
            rowbad = bad.any(axis=1)
            s = np.where(bad, 0.0, v).sum(axis=1)
            zero = ~(s > 0)
            off = np.abs(s - 1) > 1e-3
        problem = rowbad | zero | off
        if problem.any():
            i = int(np.argmax(problem))
            if rowbad[i]:
                c = int(np.argmax(bad[i]))
                raise EngineError("%s 的第 %d 行概率里有负数或不是数的值（%s）。" % (who, i, js_num(v[i, c])))
            if zero[i]:
                raise EngineError("%s 的第 %d 行概率全是 0。" % (who, i))
            raise EngineError("%s 的第 %d 行概率加起来是 %s，应该是 1（是不是忘了做 softmax？）。" % (who, i, to_precision(s[i], 4)))
        return (v / s[:, None]).ravel()
    if a.size != n:
        raise EngineError("%s 返回了 %d 个数，应该是 %d 个。" % (who, a.size, n))
    o = a.ravel()
    fin = np.isfinite(o)
    if not fin.all():
        raise EngineError("%s 的第 %d 个预测不是有限的数。" % (who, int(np.argmin(fin))))
    return o.copy()


# ---------- 截断：别让结果大得离谱（run.js 的 trimInternals） ----------
def _flat(a):
    if a is None:
        return None
    if is_tensor(a):
        a = tensor_to_numpy(a)
    try:
        return np.asarray(a, dtype=np.float64).ravel()
    except (TypeError, ValueError):
        return None


def _shape2(a):
    if is_tensor(a):
        return tuple(a.shape) if a.dim() == 2 else None
    if isinstance(a, np.ndarray):
        return a.shape if a.ndim == 2 else None
    return None


def _ival(v):
    try:
        return int(v)
    except (TypeError, ValueError, OverflowError):
        return 0


def _fval(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return math.nan


def trim_internals(x):
    if x is None or isinstance(x, (str, bytes, int, float, bool)):
        return None
    if not isinstance(x, dict) and not hasattr(x, "__dict__"):
        return None
    left = [400000]

    def arr(a):
        f = _flat(a)
        if f is None:
            return None
        n = min(f.size, left[0])
        left[0] -= n
        return Typed(f[:n].astype(np.float32), "f4")

    def dims(entry, data):
        rows, cols = _ival(field(entry, "rows")), _ival(field(entry, "cols"))
        if not rows and not cols:
            sh = _shape2(data)     # 没写 rows / cols 时，二维数组自己的形状就是答案（JS 版没有这一条）
            if sh:
                rows, cols = int(sh[0]), int(sh[1])
        return rows, cols

    out = {}
    layers = field(x, "layers")
    if isinstance(layers, (list, tuple)):
        out["layers"] = []
        for l in list(layers)[:12]:
            data = field(l, "data")
            r, c = dims(l, data)
            out["layers"].append({"name": str(field(l, "name") or ""), "rows": r, "cols": c, "data": arr(data)})
    emb = field(x, "embedding")
    if emb is not None and field(emb, "data") is not None:
        data = field(emb, "data")
        r, c = dims(emb, data)
        labels = field(emb, "labels")
        out["embedding"] = {"rows": r, "cols": c, "data": arr(data), "labels": [str(s) for s in list(labels)[:2000]] if isinstance(labels, (list, tuple)) else None}
    acts = field(x, "activations")
    if isinstance(acts, (list, tuple)):
        out["activations"] = [{"name": str(field(a, "name") or ""), "data": arr(field(a, "data"))} for a in list(acts)[:8]]
    tree = field(x, "tree")
    nodes = field(tree, "nodes") if tree is not None else None
    if isinstance(nodes, (list, tuple)):
        def node(nd):
            val = field(nd, "value")
            if isinstance(val, (list, tuple)) or isinstance(val, np.ndarray):
                val = [_fval(v) for v in list(val)[:50]]
            else:
                val = _fval(val)
            return {"f": _ival(field(nd, "f")), "thr": _fval(field(nd, "thr")), "left": _ival(field(nd, "left")), "right": _ival(field(nd, "right")), "value": val, "n": _ival(field(nd, "n"))}
        out["tree"] = {"nodes": [node(nd) for nd in list(nodes)[:2000]]}
    coef = field(x, "coef")
    if isinstance(coef, (list, tuple)):
        out["coef"] = [{"name": str(field(c, "name")), "value": _fval(field(c, "value"))} for c in list(coef)[:500]]
    text = field(x, "text")
    if isinstance(text, str):
        out["text"] = text[:4000]
    extra = field(x, "extra")
    if isinstance(extra, dict):
        import json

        def plain(o):
            if is_tensor(o):
                o = tensor_to_numpy(o)
            if isinstance(o, np.ndarray):
                if o.size > 50000:
                    raise TypeError("too big")
                return o.tolist()
            if isinstance(o, np.generic):
                return o.item()
            raise TypeError("not JSON")
        try:
            out["extra"] = json.loads(json.dumps(extra, default=plain, allow_nan=False))
        except (TypeError, ValueError):
            pass
    return out


def decimate(curve, mx):
    """run.js 的 decimate：均匀抽出 mx 个点（Math.round 是四舍五入，不是 Python 的银行家舍入）"""
    if len(curve) <= mx:
        return curve
    step = (len(curve) - 1) / (mx - 1)
    return [curve[int(math.floor(i * step + 0.5))] for i in range(mx)]


def find_module(model, depth=0, seen=None):
    """模型里第一个 torch.nn.Module（模型本身、字典里的值、对象的属性，最多往下找三层）"""
    torch = sys.modules.get("torch")
    if torch is None:
        return None
    seen = seen if seen is not None else set()
    if id(model) in seen or depth > 3:
        return None
    seen.add(id(model))
    if isinstance(model, torch.nn.Module):
        return model
    if isinstance(model, dict):
        items = list(model.values())
    elif isinstance(model, (list, tuple)):
        items = list(model)
    elif hasattr(model, "__dict__") and not isinstance(model, type):
        items = list(vars(model).values())
    else:
        return None
    for v in items:
        m = find_module(v, depth + 1, seen)
        if m is not None:
            return m
    return None


def count_params(model):
    """参数个数：model 里写了整数 size 就用它；否则数 torch 模块的参数、numpy 浮点数组的元素（最多往下找三层）"""
    explicit = model.get("size") if isinstance(model, dict) else (None if isinstance(model, np.ndarray) or is_tensor(model) else getattr(model, "size", None))
    if isinstance(explicit, (int, float, np.integer, np.floating)) and not isinstance(explicit, bool) and math.isfinite(float(explicit)):
        return int(explicit)
    torch = sys.modules.get("torch")
    seen = set()

    def walk(o, depth):
        if id(o) in seen or depth > 3:
            return 0
        seen.add(id(o))
        if torch is not None:
            if isinstance(o, torch.nn.Module):
                return sum(int(p.numel()) for p in o.parameters())
            if isinstance(o, torch.Tensor):
                return int(o.numel()) if o.is_floating_point() else 0
        if isinstance(o, np.ndarray):
            return int(o.size) if o.dtype.kind in "fc" else 0     # 下标、标签之类的整数数组不算参数
        if isinstance(o, dict):
            items = o.values()
        elif isinstance(o, (list, tuple)):
            items = o
        elif hasattr(o, "__dict__") and not isinstance(o, type) and not callable(o):
            items = vars(o).values()
        else:
            return 0
        return sum(walk(v, depth + 1) for v in items)
    try:
        total = walk(model, 0)
    except Exception:
        return None
    return total or None


def auto_layers(model):
    """DESIGN.md §5：对神经网络模型，inspect 没给 layers 时自动补上权重矩阵（PyTorch 模块里二维及以上的参数）"""
    mod = find_module(model)
    if mod is None:
        return None
    out = []
    for name, prm in mod.named_parameters():
        if prm.dim() < 2:
            continue
        rows = int(prm.shape[0])
        out.append({"name": name, "rows": rows, "cols": int(prm.numel()) // max(1, rows), "data": prm.detach()})
        if len(out) >= 12:
            break
    return out or None


# ---------- 进度、日志 ----------
class Channel:
    """子进程 → 服务进程的消息：每条是 (事件名, JSON 文本)。JSON 在子进程里就编码好，服务进程只管转发"""

    def __init__(self, conn, quiet=False):
        self.conn = conn
        self.quiet = quiet
        self.logs = []
        self.dropped = 0

    def send(self, kind, payload):
        from .codec import dumps
        text = dumps(payload)
        try:
            self.conn.send((kind, text))
        except (BrokenPipeError, EOFError, OSError):
            os._exit(3)     # 服务进程已经不在了：没人要结果了

    def log(self, text):
        text = str(text)[:500]
        if len(self.logs) < MAX_LOG:
            self.logs.append(text)
            self.send("log", {"text": text})
        else:
            if self.dropped == 0:
                self.send("log", {"text": "（输出太多，后面的不再显示）"})
            self.dropped += 1


class Run:
    """一次运行的状态：学习曲线、快照、计时"""

    def __init__(self, chan, budget_ms):
        self.chan = chan
        self.budget = budget_ms
        self.t0 = now_ms()
        self.deadline = self.t0 + budget_ms
        self.curve = []
        self.curve_stride = 1
        self.curve_skip = 0
        self.snaps = []
        self.last_post = 0.0
        self.min_gap = 0.0
        self.last_snap_step = -math.inf
        self.snapper = None


def _num(v):
    """学习曲线上的数：整数保持整数（步数 3 而不是 3.0），其余变成 float；不是数、不是有限的数 → None（丢掉）"""
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, np.integer)):
        return int(v)
    if isinstance(v, float):
        f = v
    elif isinstance(v, np.floating) or (isinstance(v, np.ndarray) and v.size == 1):
        f = float(v)
    elif is_tensor(v) and v.numel() == 1:
        f = float(v.detach().cpu().item())
    else:
        return None
    return f if math.isfinite(f) else None


class Ctx:
    """传给 fit 的 ctx。蛇形命名是 Python 的写法（time_left() 单位是秒）；
    驼峰命名的几个和第一期的 JavaScript 一样（timeLeft() 单位是毫秒），照抄 JS 代码的人也不会出错"""
    __slots__ = ("_run", "_forecast")

    def __init__(self, run, forecast=False):
        self._run = run
        self._forecast = forecast

    @property
    def budget_ms(self):
        return self._run.budget

    @property
    def budgetMs(self):
        return self._run.budget

    def time_left(self):
        """时间预算还剩几秒；训练循环应当在它 <= 0 时停下"""
        return (self._run.deadline - now_ms()) / 1000.0

    def timeLeft(self):
        return self._run.deadline - now_ms()

    def log(self, *parts):
        self._run.chan.log(" ".join(str(p) for p in parts))

    def report(self, step, metrics=None, **kw):
        """学习曲线上的一个点：ctx.report(epoch, loss=..., validLoss=..., trainMetric=..., validMetric=...)"""
        r = self._run
        st = _num(step)
        pt = {"step": st}
        items = {}
        if isinstance(metrics, dict):
            items.update(metrics)
        items.update(kw)
        for key, val in items.items():
            f = _num(val)
            if f is not None and key != "step":
                pt[str(key)] = f
        r.curve_skip += 1
        if r.curve_skip >= r.curve_stride:
            r.curve_skip = 0
            r.curve.append(pt)
            if len(r.curve) >= MAX_CURVE_RAW:
                r.curve = r.curve[::2]
                r.curve_stride *= 2
        t = now_ms()
        if t - r.last_post > PROGRESS_GAP_MS:
            r.last_post = t
            r.chan.send("progress", {"phase": "fit", "step": st, "point": pt, "n": len(r.curve)})

    def snapshot(self, step, model):
        """请引擎给模型拍一张快照（动画用）：引擎当场在网格上调用 predict（或调用 inspect 取嵌入）。最多保留 60 张，多了就隔一张扔一张、拉大间隔"""
        if self._forecast:
            return
        r = self._run
        if r.snapper is None or not r.snapper.mode:
            return
        st = _num(step)
        if st is None:
            st = 0.0
        if st - r.last_snap_step < r.min_gap:
            return
        if len(r.snaps) >= MAX_SNAPS:
            r.snaps = r.snaps[::2]
            g = r.min_gap * 2
            r.min_gap = max(1.0, g if g else (st - r.snaps[0]["step"]) / MAX_SNAPS)
            if st - r.last_snap_step < r.min_gap:
                return
        s = r.snapper.take(model)
        if not s:
            return
        s["step"] = st
        r.snaps.append(s)
        r.last_snap_step = st
        r.chan.send("snap", s)


class Algo:
    """用户代码里找到的几个函数"""

    def __init__(self, ns):
        def fn(name):
            f = ns.get(name)
            return f if callable(f) else None
        self.fit, self.predict, self.forecast, self.update, self.inspect = fn("fit"), fn("predict"), fn("forecast"), fn("update"), fn("inspect")
        self.predict_n = False
        if self.predict is not None:
            try:
                import inspect as _ins
                ps = [p for p in _ins.signature(self.predict).parameters.values() if p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD)]
                self.predict_n = len(ps) >= 3 and ps[2].name in ("n", "N")    # 照抄 JS 写成 predict(model, X, n) 的也能用
            except (TypeError, ValueError):
                pass

    def call_predict(self, model, X):
        if self.predict_n:
            return self.predict(model, X, X.shape[0])
        return self.predict(model, X)


class Snapper:
    """run.js 的 makeSnapper。网格由页面生成（data.grid.X），这样快照和页面画图用的坐标是同一套"""

    def __init__(self, data, algo, kind, k, tokens):
        self.algo, self.kind, self.k = algo, kind, k
        self.mode, self.X = None, None
        grid = data.get("grid") if isinstance(data, dict) else None
        if isinstance(grid, dict) and grid.get("X") is not None:
            X = np.asarray(grid["X"], dtype=np.float64)
            d = int(data["train"].get("d") or 0) if isinstance(data.get("train"), dict) else 0
            if X.ndim == 1:
                X = X.reshape(-1, d or 2)
            X.setflags(write=False)
            self.X = X
            self.mode = str(grid.get("kind") or "grid2d")
        elif tokens and algo.inspect is not None:
            self.mode = "embed"

    def take(self, model):
        if self.X is not None:
            m = self.X.shape[0]
            if self.mode == "fn1d":
                ys = clean_pred("regression", self.algo.call_predict(model, self.X), m, 0, "predict（画曲线时）")
                return {"kind": self.mode, "values": Typed(ys, "f4")}
            out = clean_pred(self.kind, self.algo.call_predict(model, self.X), m, self.k, "predict（画决策面时）")
            return {"kind": self.mode, "values": Typed(out, "f4")}
        if self.mode == "embed":
            ins = self.algo.inspect(model)
            emb = field(ins, "embedding")
            data = field(emb, "data") if emb is not None else None
            if data is not None:
                rows, cols = _ival(field(emb, "rows")), _ival(field(emb, "cols"))
                if not rows and not cols:
                    sh = _shape2(data)
                    if sh:
                        rows, cols = int(sh[0]), int(sh[1])
                return {"kind": "embed", "rows": rows, "cols": cols, "data": Typed(_flat(data), "f4")}
        return None


# ---------- 数据：页面发来的字典 → 算法看到的对象 ----------
def _ro(a):
    a.setflags(write=False)     # 只读：fit 改不了它，后面在训练集上预测时用的还是原样的数据
    return a


def make_split(raw, kind, k, who, with_y=True):
    if not isinstance(raw, dict) or raw.get("X") is None:
        raise EngineError("页面发来的数据缺少 %s.X。" % who)
    X = np.asarray(raw["X"], dtype=np.float64)
    n = raw.get("n")
    d = raw.get("d")
    if X.ndim == 1:
        if not d:
            d = 1 if n is None or n == X.size else X.size // max(1, int(n))
        if int(d) <= 0 or X.size % int(d):
            raise EngineError("页面发来的 %s.X 有 %d 个数，不能按每行 %s 个排成矩阵。" % (who, X.size, d))
        X = X.reshape(-1, int(d))
    if X.ndim != 2:
        raise EngineError("页面发来的 %s.X 应该是二维的 [n, d]，现在是 %d 维。" % (who, X.ndim))
    n = int(n) if n is not None else X.shape[0]
    d = int(d) if d is not None else X.shape[1]
    if X.shape != (n, d):
        raise EngineError("页面发来的 %s.X 形状是 %s，但 n=%d、d=%d。" % (who, list(X.shape), n, d))
    X = np.ascontiguousarray(X)
    sp = Namespace(X=_ro(X), n=n, d=d)
    if with_y:
        if raw.get("y") is None:
            raise EngineError("页面发来的数据缺少 %s.y。" % who)
        y = np.asarray(raw["y"]).ravel()
        if y.size != n:
            raise EngineError("页面发来的 %s.y 有 %d 个数，应该是 %d 个。" % (who, y.size, n))
        if kind == "classification":
            yf = y.astype(np.float64)
            if y.size and (not np.all(np.isfinite(yf)) or np.any(yf != np.floor(yf)) or yf.min() < 0 or yf.max() >= k):
                raise EngineError("页面发来的 %s.y 里有不在 0 到 %d 之间的类别编号。" % (who, k - 1))
            y = y.astype(np.int64)
        else:
            y = y.astype(np.float64)
        sp.y = _ro(np.ascontiguousarray(y))
        classes = raw.get("classes")
        sp.k = k
        sp.classes = list(classes) if isinstance(classes, (list, tuple)) else None
        names = raw.get("featureNames")
        sp.featureNames = list(names) if isinstance(names, (list, tuple)) else None
        sp.feature_names = sp.featureNames
        shape = raw.get("shape")
        sp.shape = [int(s) for s in shape] if isinstance(shape, (list, tuple)) else None
        tokens = raw.get("tokens")
        sp.tokens = dict(tokens) if isinstance(tokens, dict) else None
        sp.kind = kind
    return sp


def engine_info():
    torch = sys.modules.get("torch")
    dev = _TORCH["device"]
    return {"python": "%d.%d.%d" % sys.version_info[:3], "numpy": np.__version__, "torch": getattr(torch, "__version__", None) if torch else None, "device": dev.type if dev is not None and torch is not None else None}


def _params(job):
    p = job.get("params")
    return types.MappingProxyType(dict(p) if isinstance(p, dict) else {})


def _budget(job):
    try:
        b = float(job.get("budgetMs") or 20000)
    except (TypeError, ValueError):
        b = 20000.0
    return max(1000.0, b)


# ---------- 一次运行：监督学习（run.js 的 runSupervised，去掉了指标、基线、理论最优、置换重要性——这些页面自己算） ----------
def run_supervised(job, algo, chan, lib):
    data = job.get("data")
    if not isinstance(data, dict):
        raise EngineError("页面发来的请求里没有 data。")
    kind = data.get("kind") or job.get("kind")
    if kind not in ("regression", "classification"):
        raise EngineError("监督学习的 kind 只能是 regression 或 classification，收到的是 %r。" % (kind,))
    cls = kind == "classification"
    tr_raw = data.get("train") or {}
    k = 0
    if cls:
        classes = tr_raw.get("classes")
        k = int(tr_raw.get("k") or (len(classes) if isinstance(classes, (list, tuple)) else 0))
        if k < 2:
            raise EngineError("分类数据至少要有两类。")
    tr = make_split(tr_raw, kind, k, "train")
    va = make_split(data.get("valid"), kind, k, "valid")
    te = make_split(data.get("test"), kind, k, "test", with_y=False)
    if not tr.n or not va.n or not te.n:
        raise EngineError("划分之后有一份是空的（训练 %d、验证 %d、测试 %d）：样本太少，或者比例不对。" % (tr.n, va.n, te.n))
    if va.d != tr.d or te.d != tr.d:
        raise EngineError("训练、验证、测试的特征个数不一样（%d、%d、%d）。" % (tr.d, va.d, te.d))
    if algo.fit is None or algo.predict is None:
        raise EngineError("算法的代码里要有 fit(data, p, lib, ctx) 和 predict(model, X) 两个函数。")
    run = Run(chan, _budget(job))
    run.snapper = Snapper(data, algo, kind, k, tr.tokens)
    ctx = Ctx(run)
    chan.send("progress", {"phase": "data", "msg": "数据：训练 %d、验证 %d、测试 %d" % (tr.n, va.n, te.n)})
    t_fit = now_ms()
    model = algo.fit(Namespace(train=tr, valid=va, kind=kind), _params(job), lib, ctx)
    fit_ms = now_ms() - t_fit
    if model is None:
        raise EngineError("fit 没有返回模型（最后要 return 一个对象）。")
    if not run.snaps and run.snapper.mode:
        s0 = run.snapper.take(model)
        if s0:
            s0["step"] = run.curve[-1]["step"] if run.curve else 0
            run.snaps.append(s0)
            chan.send("snap", s0)
    chan.send("progress", {"phase": "eval", "msg": "评估中…"})
    tr_idx, trX = None, tr.X
    if tr.n > MAX_TRAIN_PRED:     # 训练集太大时只在一部分上预测：第 floor(q·n/20000) 行，q = 0..19999（同 run.js）
        tr_idx = (np.arange(MAX_TRAIN_PRED, dtype=np.int64) * tr.n) // MAX_TRAIN_PRED
        trX = _ro(np.ascontiguousarray(tr.X[tr_idx]))
    t_p = now_ms()
    p_tr = clean_pred(kind, algo.call_predict(model, trX), trX.shape[0], k, "predict")
    p_va = clean_pred(kind, algo.call_predict(model, va.X), va.n, k, "predict")
    p_te = clean_pred(kind, algo.call_predict(model, te.X), te.n, k, "predict")
    pred_us = (now_ms() - t_p) / (trX.shape[0] + va.n + te.n) * 1000.0
    internals = None
    if algo.inspect is not None:
        try:
            internals = trim_internals(algo.inspect(model))
        except Exception as e:
            chan.log("inspect 出错：%s: %s" % (type(e).__name__, e))
    if not (internals and internals.get("layers")):
        try:
            layers = auto_layers(model)
            if layers:
                internals = internals or {}
                internals.update(trim_internals({"layers": layers}) or {})
        except Exception:
            pass
    return {
        "api": "supervised", "kind": kind, "k": k,
        "split": {"nTrain": tr.n, "nValid": va.n, "nTest": te.n},
        "pred": {"train": Typed(p_tr, "f8"), "valid": Typed(p_va, "f8"), "test": Typed(p_te, "f8")},
        "trainIdx": Typed(tr_idx, "i4") if tr_idx is not None else None,
        "curve": decimate(run.curve, MAX_CURVE), "snaps": run.snaps, "log": list(chan.logs),
        "fitMs": fit_ms, "predUs": pred_us, "size": count_params(model), "internals": internals,
        "ms": now_ms() - run.t0, "engine": engine_info(),
    }


# ---------- 一次运行：时间序列预测（run.js 的 runForecast：滚动原点、不重训） ----------
def forecast_origins(T, t1, t2, H, season):
    """三段的预测原点 [from, to]（含两端），和 run.js 完全一样"""
    warm = min(t1 - 2, max(10, 2 * (season or 0)))
    return {"train": [warm, t1 - 1 - H], "valid": [t1 - 1, t2 - 1 - H], "test": [t2 - 1, T - 1 - H]}


def run_forecast(job, algo, chan, lib):
    data = job.get("data")
    if not isinstance(data, dict) or data.get("y") is None:
        raise EngineError("页面发来的请求里没有时间序列 data.y。")
    y = np.ascontiguousarray(np.asarray(data["y"], dtype=np.float64).ravel())
    T = int(y.size)
    if T < 30:
        raise EngineError("时间序列太短（至少要 30 个点）。")
    fin = np.isfinite(y)
    if not fin.all():
        raise EngineError("时间序列的第 %d 个值不是有限的数。" % int(np.argmin(fin)))
    t1 = int(data["t1"]) if data.get("t1") is not None else int(math.floor(T * 0.6))
    t2 = int(data["t2"]) if data.get("t2") is not None else int(math.floor(T * 0.8))
    H = max(1, min(50, _ival(data.get("H") or data.get("horizon") or 1)))
    season = _ival(data.get("season") or 0)
    if not (0 < t1 < t2 < T):
        raise EngineError("划分点不对：应该 0 < t1 < t2 < T，收到 t1=%d、t2=%d、T=%d。" % (t1, t2, T))
    if t1 < 20 or t2 - t1 < 5 + H or T - t2 < 5 + H:
        raise EngineError("序列太短，划分之后验证段或测试段不够预测 %d 步。" % H)
    if algo.fit is None or algo.forecast is None:
        raise EngineError("时间序列算法的代码里要有 fit(series, p, lib, ctx) 和 forecast(model, past, h) 两个函数。")
    run = Run(chan, _budget(job))
    ctx = Ctx(run, forecast=True)
    chan.send("progress", {"phase": "data", "msg": "数据：训练 %d、验证 %d、测试 %d 个时刻；预测 %d 步" % (t1, t2 - t1, T - t2, H)})
    series = Namespace(y=y[:t1].copy(), T=t1, freq=str(data.get("freq") or "step"), season=season, label=str(data.get("label") or ""),
                       valid=Namespace(y=y[t1:t2].copy(), start=t1))
    t_fit = now_ms()
    model = algo.fit(series, _params(job), lib, ctx)
    fit_ms = now_ms() - t_fit
    if model is None:
        raise EngineError("fit 没有返回模型（最后要 return 一个对象）。")
    chan.send("progress", {"phase": "eval", "msg": "滚动预测中…"})
    yro = _ro(y.copy())      # forecast 拿到的 past 是它的只读视图，改不坏后面要用的序列
    state = {"fed": t1}      # 已经喂给 update 的观测到 y[fed-1] 为止；从 t1 开始喂

    def feed(to):
        if algo.update is None:
            return
        while state["fed"] < to:
            algo.update(model, float(y[state["fed"]]))
            state["fed"] += 1

    budget, deadline = run.budget, run.deadline

    def eval_range(a, b, do_feed, who):     # 原点 t ∈ [a, b]：用 y[0..t] 预测 y[t+1..t+H]
        nO = max(0, b - a + 1)
        pred = np.empty(nO * H, dtype=np.float64)
        for q in range(nO):
            t = a + q
            if do_feed:
                feed(t + 1)
            f = algo.forecast(model, yro[:t + 1], H)
            if f is None or isinstance(f, (str, bytes, dict)):
                raise EngineError("%s：forecast 应该返回长度为 %d 的数组。" % (who, H))
            try:
                fa = as_float_array(f, "forecast").ravel()
            except EngineError:
                raise EngineError("%s：forecast 应该返回长度为 %d 的数组。" % (who, H))
            if fa.size < H:
                raise EngineError("%s：forecast 应该返回长度为 %d 的数组。" % (who, H))
            fa = fa[:H]
            if not np.isfinite(fa).all():
                raise EngineError("%s：第 %d 个时刻的预测不是有限的数。" % (who, t))
            pred[q * H:(q + 1) * H] = fa
            if (q & 63) == 0 and now_ms() > deadline + budget:
                raise EngineError("滚动预测太慢，超过了时间预算的两倍。")
        return pred

    org = forecast_origins(T, t1, t2, H, season)
    t_p = now_ms()
    p_tr = eval_range(org["train"][0], org["train"][1], False, "训练段")   # 样本内：只为了看过拟合，不调用 update
    p_va = eval_range(org["valid"][0], org["valid"][1], True, "验证段")
    p_te = eval_range(org["test"][0], org["test"][1], True, "测试段")
    n_orig = (p_tr.size + p_va.size + p_te.size) // H
    pred_us = (now_ms() - t_p) / max(1, n_orig) * 1000.0
    internals = None
    if algo.inspect is not None:
        try:
            internals = trim_internals(algo.inspect(model))
        except Exception as e:
            chan.log("inspect 出错：%s: %s" % (type(e).__name__, e))
    return {
        "api": "forecast", "kind": "forecast", "k": 0, "horizon": H,
        "split": {"nTrain": t1, "nValid": t2 - t1, "nTest": T - t2, "t1": t1, "t2": t2, "T": T},
        "origins": org,
        "pred": {"train": Typed(p_tr, "f8"), "valid": Typed(p_va, "f8"), "test": Typed(p_te, "f8")},
        "curve": decimate(run.curve, MAX_CURVE), "snaps": [], "log": list(chan.logs),
        "fitMs": fit_ms, "predUs": pred_us, "size": count_params(model), "internals": internals,
        "ms": now_ms() - run.t0, "engine": engine_info(),
    }


def run(job, algo, chan, lib):
    warnings.filterwarnings("ignore", message=".*NumPy array is not writable.*")   # 数据是只读的，torch.as_tensor 会唠叨一句
    if job.get("api") == "forecast":
        return run_forecast(job, algo, chan, lib)
    return run_supervised(job, algo, chan, lib)
