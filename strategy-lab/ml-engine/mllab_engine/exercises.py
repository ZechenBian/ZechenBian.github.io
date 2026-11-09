# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""亲手写 · 语言模型（strategy-lab/ml/lm/）：每个练习的测试，在子进程里运行（PROTOCOL.md §12）。

页面把你写的整份代码（各步的代码按顺序拼起来）连同练习的名字发来；这里在一个全新的模块里执行它，
找到这一步要你写的函数或类，拿随机输入去调用，再和这里用 numpy（float64）独立算出的答案比。

* 有 PyTorch 时，输入是 CPU 上的 float32 张量（下标是 int64 张量），你的代码用 PyTorch 写；
  没有 PyTorch 时，输入是 numpy 数组，同样的练习用 numpy 写。练习的接口两边一样。
* 答案只用 numpy 算，不用 PyTorch 自带的同名函数：这样"你的实现"和"裁判"不会共用同一段代码。
* "从零写"的约定由静态检查守着：代码里不能调用库里现成的 softmax、交叉熵、线性层、嵌入、注意力（见 FORBID）。
  调用你自己写的同名函数（不带模块前缀的 softmax(x)）不算。
* 最后一步 train_tiny 用你写的组件拼一个一层的字符级语言模型，在莎士比亚全集的字符上训练（要 PyTorch）。
"""
import ast
import math
import os
import sys
import time

import numpy as np

EXERCISES = ("softmax", "cross_entropy", "linear", "embedding", "attention", "train_tiny")

# 库里现成的实现：写成 模块.名字（torch.softmax、F.cross_entropy、nn.Linear……）或张量的方法（x.softmax(-1)）都不行
FORBID_ANY = {"softmax", "log_softmax", "logsumexp", "Softmax", "LogSoftmax", "scaled_dot_product_attention"}  # 任何对象上的这些属性
FORBID_MOD = {"cross_entropy", "CrossEntropyLoss", "nll_loss", "NLLLoss", "linear", "Linear", "Bilinear", "LazyLinear",
              "embedding", "Embedding", "EmbeddingBag", "MultiheadAttention", "Transformer", "TransformerEncoderLayer",
              "TransformerDecoderLayer", "TransformerEncoder", "TransformerDecoder", "special"}               # 模块上的这些属性
MODULE_ROOTS = {"torch", "nn", "F", "functional", "scipy", "special", "np", "numpy", "jax", "jnp", "sklearn"}

SHAKESPEARE_URL = "https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt"


class ExerciseError(Exception):
    """练习本身没法开始（缺函数、没装 PyTorch、数据取不到）：页面把它当成一次失败的运行"""


# ---------------------------------------------------------------- 后端
class Backend:
    """把 numpy 的输入换成你的代码要的样子（PyTorch 张量或 numpy 数组），再把你的输出换回 float64 的 numpy 数组"""

    def __init__(self, want="auto"):
        self.torch = None
        if want != "numpy":
            torch = sys.modules.get("torch")
            if torch is None:
                try:
                    import torch  # noqa: F811
                except Exception:
                    torch = None
            self.torch = torch
        self.name = "torch" if self.torch is not None else "numpy"

    def f(self, a):
        a = np.ascontiguousarray(a, dtype=np.float32)
        return self.torch.from_numpy(a.copy()) if self.torch is not None else a.copy()

    def i(self, a):
        a = np.ascontiguousarray(a, dtype=np.int64)
        return self.torch.from_numpy(a.copy()) if self.torch is not None else a.copy()

    def out(self, x, who):
        """你的输出 → float64 numpy 数组；不是张量 / 数组时报一句中文"""
        t = self.torch
        if t is not None and isinstance(x, t.Tensor):
            return x.detach().to("cpu").double().numpy()
        if isinstance(x, np.ndarray) or np.isscalar(x):
            return np.asarray(x, dtype=np.float64)
        if isinstance(x, (list, tuple)):
            try:
                return np.asarray(x, dtype=np.float64)
            except (TypeError, ValueError):
                pass
        raise ExerciseError("%s 返回的是 %s，应该是%s。" % (who, type(x).__name__, "一个 PyTorch 张量" if t is not None else "一个 numpy 数组"))

    def same_object_unchanged(self, before, x):
        return np.array_equal(before, self.out(x, "（输入）").astype(np.float32))


# ---------------------------------------------------------------- 静态检查
def module_aliases(tree):
    names = set(MODULE_ROOTS)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                names.add((a.asname or a.name).split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            if mod.split(".")[0] in ("torch", "numpy", "scipy", "jax", "sklearn"):
                for a in node.names:
                    if a.name in ("nn", "functional", "special") or a.asname in ("F", "nn"):
                        names.add(a.asname or a.name)
    return names


def _root(node):
    while isinstance(node, ast.Attribute):
        node = node.value
    return node.id if isinstance(node, ast.Name) else None


def forbidden_uses(code):
    """[(行号, 写法)]：库里现成的实现。语法错误时返回 None（语法错误由执行代码时报）"""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return None
    mods = module_aliases(tree)
    out = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute):
            if node.attr in FORBID_ANY or (node.attr in FORBID_MOD and _root(node.value) in mods):
                out.append((node.lineno, ast.unparse(node)))
        elif isinstance(node, ast.ImportFrom) and (node.module or "").split(".")[0] in ("torch", "scipy", "jax", "sklearn"):
            for a in node.names:
                if a.name in FORBID_ANY or a.name in FORBID_MOD - {"special"}:
                    out.append((node.lineno, "from %s import %s" % (node.module, a.name)))
    out.sort()
    return out


# ---------------------------------------------------------------- 参照答案（numpy，float64）
def ref_softmax(x, dim=-1):
    x = np.asarray(x, dtype=np.float64)
    m = x.max(axis=dim, keepdims=True)
    e = np.exp(x - m)
    return e / e.sum(axis=dim, keepdims=True)


def ref_cross_entropy(logits, targets):
    z = np.asarray(logits, dtype=np.float64)
    z = z.reshape(-1, z.shape[-1])
    t = np.asarray(targets).reshape(-1).astype(np.int64)
    m = z.max(axis=1, keepdims=True)
    lse = m[:, 0] + np.log(np.exp(z - m).sum(axis=1))
    return float(np.mean(lse - z[np.arange(len(t)), t]))


def ref_attention(q, k, v):
    q, k, v = (np.asarray(a, dtype=np.float64) for a in (q, k, v))
    T, d = q.shape[-2], q.shape[-1]
    s = q @ np.swapaxes(k, -1, -2) / math.sqrt(d)
    s = np.where(np.tril(np.ones((T, k.shape[-2]), dtype=bool)), s, -np.inf)
    return ref_softmax(s, -1) @ v


# ---------------------------------------------------------------- 一次检查的记录
class Report:
    def __init__(self, chan):
        self.chan = chan
        self.tests = []

    def add(self, name, ok, msg="", err=None, tol=None):
        t = {"name": name, "ok": bool(ok), "msg": msg}
        if err is not None and math.isfinite(err):
            t["err"] = float(err)
        if tol is not None:
            t["tol"] = float(tol)
        self.tests.append(t)
        self.chan.send("progress", {"phase": "test", "msg": ("✓ " if ok else "✗ ") + name, "test": t, "n": len(self.tests)})
        return ok

    def check(self, name, fn):
        """跑一项检查：fn() 返回 (ok, msg, err, tol)；fn 里你的代码抛了异常，就把异常记成这一项没通过"""
        try:
            ok, msg, err, tol = fn()
        except ExerciseError as e:
            return self.add(name, False, str(e))
        except Exception as e:     # 你的代码出错：记下来，接着做下一项
            from .worker import describe_error
            d = describe_error(e)
            line = (" （第 %d 行）" % d["line"]) if d.get("line") else ""
            t = {"name": name, "ok": False, "msg": "运行出错%s：%s" % (line, d["message"])}
            if d.get("line"):
                t["line"] = d["line"]
            self.tests.append(t)
            self.chan.send("progress", {"phase": "test", "msg": "✗ " + name, "test": t, "n": len(self.tests)})
            return False
        return self.add(name, ok, msg, err, tol)


def close(mine, ref, rtol=1e-4, atol=1e-5):
    """(ok, 说明, 最大误差, 容差)"""
    mine = np.asarray(mine, dtype=np.float64)
    ref = np.asarray(ref, dtype=np.float64)
    if mine.shape != ref.shape:
        return False, "形状是 %s，应该是 %s。" % (tuple(mine.shape), tuple(ref.shape)), None, None
    if not np.all(np.isfinite(mine)):
        bad = int(np.sum(~np.isfinite(mine)))
        return False, "结果里有 %d 个不是有限的数（NaN 或无穷大）。" % bad, None, None
    err = float(np.max(np.abs(mine - ref))) if mine.size else 0.0
    tol = float(atol + rtol * (np.max(np.abs(ref)) if ref.size else 0.0))
    if err <= tol:
        return True, "", err, tol
    return False, "和参照答案最多差 %.3g，容差是 %.3g。" % (err, tol), err, tol


def need(ns, name, kind):
    f = ns.get(name)
    if f is None:
        raise ExerciseError("代码里还没有%s %s：照这一步的说明写一个。" % ("函数" if kind == "def" else "类", name))
    if kind == "class" and not isinstance(f, type):
        raise ExerciseError("%s 应该是一个类（class %s: ...）。" % (name, name))
    if kind == "def" and not callable(f):
        raise ExerciseError("%s 应该是一个函数。" % name)
    return f


def call_layer(layer, x):
    if callable(layer):
        return layer(x)
    if hasattr(layer, "forward"):
        return layer.forward(x)
    raise ExerciseError("这个类的实例没法调用：写一个 forward(self, x) 方法（用 PyTorch 时继承 torch.nn.Module）。")


def weight_of(layer, shape, who):
    w = getattr(layer, "weight", None)
    if w is None:
        raise ExerciseError("%s 的实例上没有 weight 属性：权重要放在 self.weight 里。" % who)
    return w


def set_weight(be, layer, W, who):
    w = weight_of(layer, W.shape, who)
    t = be.torch
    if t is not None and isinstance(w, t.Tensor):
        if tuple(w.shape) != tuple(W.shape):
            raise ExerciseError("%s 的 weight 形状是 %s，应该是 %s。" % (who, tuple(w.shape), tuple(W.shape)))
        with t.no_grad():
            w.copy_(t.from_numpy(np.asarray(W, dtype=np.float32)).to(w.device, w.dtype))
        return
    if isinstance(w, np.ndarray):
        if w.shape != W.shape:
            raise ExerciseError("%s 的 weight 形状是 %s，应该是 %s。" % (who, w.shape, W.shape))
        w[...] = W
        return
    raise ExerciseError("%s 的 weight 是 %s，应该是%s。" % (who, type(w).__name__, "一个 PyTorch 张量（nn.Parameter）" if t is not None else "一个 numpy 数组"))


# ---------------------------------------------------------------- 各个练习
def ex_softmax(ns, be, rep, rng):
    f = need(ns, "softmax", "def")

    def t1():
        x = rng.normal(size=(2, 3, 5))
        return close(be.out(f(be.f(x), -1), "softmax"), ref_softmax(x.astype(np.float32), -1))
    rep.check("最后一维上的 softmax 和参照答案一致", t1)

    def t2():
        x = rng.normal(size=(4, 6)) * 2
        for d in (0, 1):
            r = close(be.out(f(be.f(x), d), "softmax"), ref_softmax(x.astype(np.float32), d))
            if not r[0]:
                return False, ("dim=%d 时：" % d) + r[1], r[2], r[3]
        return True, "", r[2], r[3]
    rep.check("dim 参数：沿第 0 维、第 1 维也对", t2)

    def t3():
        x = np.array([[1000.0, 1001.0, 1002.0], [-1000.0, -1000.0, -1000.0], [0.0, 0.0, 90.0]])
        return close(be.out(f(be.f(x), -1), "softmax"), ref_softmax(x, -1))
    rep.check("大数不溢出：输入有 ±1000 时仍然正确（不出现 NaN）", t3)

    def t4():
        x = rng.normal(size=(8, 50)) * 5     # 不大到溢出：这一项只查“是不是概率”，溢出归上一项
        y = be.out(f(be.f(x), -1), "softmax")
        if y.shape != x.shape:
            return False, "形状是 %s，应该是 %s。" % (y.shape, x.shape), None, None
        if np.any(y < 0) or not np.all(np.isfinite(y)):
            return False, "有负数或者不是有限的数。", None, None
        err = float(np.max(np.abs(y.sum(-1) - 1)))
        return err < 1e-5, "" if err < 1e-5 else "每一行加起来最多差 1 有 %.3g。" % err, err, 1e-5
    rep.check("每一行都是概率：非负、加起来等于 1", t4)

    def t5():
        x = rng.normal(size=(3, 4)).astype(np.float32)
        xin = be.f(x)
        f(xin, -1)
        ok = be.same_object_unchanged(x, xin)
        return ok, "" if ok else "函数改动了传进来的输入（就地修改）：先复制一份，或者别用带下划线的就地操作。", None, None
    rep.check("不改动传进来的输入", t5)


def ex_cross_entropy(ns, be, rep, rng):
    f = need(ns, "cross_entropy", "def")

    def scalar(x):
        a = be.out(x, "cross_entropy")
        if a.size != 1:
            raise ExerciseError("cross_entropy 应该返回一个数（所有位置的平均），这里返回了形状 %s 的数组。" % (tuple(a.shape),))
        return a.reshape(())

    def t1():
        z = rng.normal(size=(6, 10)); t = rng.integers(0, 10, size=6)
        return close(scalar(f(be.f(z), be.i(t))), ref_cross_entropy(z.astype(np.float32), t))
    rep.check("(N, V) 的 logits：平均交叉熵和参照答案一致", t1)

    def t2():
        z = rng.normal(size=(2, 3, 7)); t = rng.integers(0, 7, size=(2, 3))
        return close(scalar(f(be.f(z), be.i(t))), ref_cross_entropy(z.astype(np.float32), t))
    rep.check("(B, T, V) 的 logits：前面几维都展平再平均", t2)

    def t3():
        z = rng.normal(size=(5, 12)) * 300; z[0, 3] = 3000.0; t = rng.integers(0, 12, size=5)
        return close(scalar(f(be.f(z), be.i(t))), ref_cross_entropy(z.astype(np.float32), t), rtol=1e-4, atol=1e-3)
    rep.check("logits 很大（上千）时不溢出", t3)

    def t4():
        V = 9
        u = scalar(f(be.f(np.zeros((4, V))), be.i(np.arange(4))))
        ok = abs(float(u) - math.log(V)) < 1e-5
        return ok, "" if ok else "logits 全是 0 时应该等于 ln %d ≈ %.5f，这里是 %.5f。" % (V, math.log(V), float(u)), abs(float(u) - math.log(V)), 1e-5
    rep.check("logits 全相等时等于 ln V（完全不确定）", t4)


def ex_linear(ns, be, rep, rng):
    C = need(ns, "Linear", "class")

    def t1():
        layer = C(16, 8)
        w = weight_of(layer, (8, 16), "Linear")
        shp = tuple(w.shape)
        if shp != (8, 16):
            return False, "Linear(16, 8) 的 weight 形状是 %s，应该是 (8, 16)：(输出维数, 输入维数)。" % (shp,), None, None
        if be.torch is not None:
            if not isinstance(w, be.torch.nn.Parameter):
                return False, "weight 要用 nn.Parameter 包起来，优化器才找得到它（也要继承 torch.nn.Module）。", None, None
            if not isinstance(layer, be.torch.nn.Module):
                return False, "Linear 要继承 torch.nn.Module。", None, None
        return True, "", None, None
    rep.check("构造：weight 的形状是 (out, in)，是可训练的参数", t1)

    def t2():
        n_in, n_out = 256, 128
        w = be.out(weight_of(C(n_in, n_out), (n_out, n_in), "Linear"), "Linear.weight")
        s, target = float(w.std()), 1 / math.sqrt(n_in)
        ok = 0.3 * target <= s <= 3 * target and abs(float(w.mean())) < 3 * target / math.sqrt(w.size) * 10
        return ok, "" if ok else "Linear(256, 128) 的初始权重标准差是 %.4g；常见的取法在 1/√in ≈ %.4g 附近（0.3 到 3 倍之间都算对）。" % (s, target), s, target
    rep.check("初始化的尺度：权重标准差约为 1/√in", t2)

    def t3():
        layer = C(5, 3)
        W = rng.normal(size=(3, 5))
        set_weight(be, layer, W, "Linear")
        x = rng.normal(size=(2, 4, 5))
        return close(be.out(call_layer(layer, be.f(x)), "Linear"), x.astype(np.float32) @ W.astype(np.float32).T)
    rep.check("前向：y = x Wᵀ，前面任意几维都按批处理", t3)


def ex_embedding(ns, be, rep, rng):
    C = need(ns, "Embedding", "class")

    def t1():
        layer = C(11, 6)
        w = weight_of(layer, (11, 6), "Embedding")
        if tuple(w.shape) != (11, 6):
            return False, "Embedding(11, 6) 的 weight 形状是 %s，应该是 (11, 6)：(词表大小, 向量维数)。" % (tuple(w.shape),), None, None
        if be.torch is not None and not isinstance(w, be.torch.nn.Parameter):
            return False, "weight 要用 nn.Parameter 包起来（也要继承 torch.nn.Module）。", None, None
        s = float(be.out(w, "Embedding.weight").std())
        if not (0.005 <= s <= 3):
            return False, "初始权重的标准差是 %.4g：太%s了。常见的取法是标准差 1 左右（或者 0.02）。" % (s, "小" if s < 0.005 else "大"), s, None
        return True, "", None, None
    rep.check("构造：weight 的形状是 (词表大小, 维数)，初始化合理", t1)

    def t2():
        layer = C(7, 4)
        W = rng.normal(size=(7, 4))
        set_weight(be, layer, W, "Embedding")
        ids = rng.integers(0, 7, size=(2, 5))
        return close(be.out(call_layer(layer, be.i(ids)), "Embedding"), W.astype(np.float32)[ids])
    rep.check("查表：每个编号换成 weight 的那一行，形状 (…, 维数)", t2)


def ex_attention(ns, be, rep, rng):
    f = need(ns, "causal_attention", "def")

    def t1():
        q, k, v = rng.normal(size=(2, 5, 8)), rng.normal(size=(2, 5, 8)), rng.normal(size=(2, 5, 8))
        return close(be.out(f(be.f(q), be.f(k), be.f(v)), "causal_attention"), ref_attention(*(a.astype(np.float32) for a in (q, k, v))))
    rep.check("输出和参照答案一致", t1)

    def t2():
        q, k, v = rng.normal(size=(1, 6, 4)), rng.normal(size=(1, 6, 4)), rng.normal(size=(1, 6, 4))
        a = be.out(f(be.f(q), be.f(k), be.f(v)), "causal_attention")
        k2, v2 = k.copy(), v.copy()
        k2[:, 3:] = rng.normal(size=(1, 3, 4)) * 5
        v2[:, 3:] = rng.normal(size=(1, 3, 4)) * 5
        b = be.out(f(be.f(q), be.f(k2), be.f(v2)), "causal_attention")
        err = float(np.max(np.abs(a[:, :3] - b[:, :3])))
        ok = err < 1e-5
        return ok, "" if ok else "改了第 3 个位置以后的 k、v，前 3 个位置的输出也变了（最多变了 %.3g）：每个位置只能看它自己和它前面的位置。" % err, err, 1e-5
    rep.check("因果性：改动后面的位置，不影响前面位置的输出", t2)

    def t3():
        d = 64
        q, k, v = rng.normal(size=(1, 4, d)) * 3, rng.normal(size=(1, 4, d)) * 3, rng.normal(size=(1, 4, d))
        return close(be.out(f(be.f(q), be.f(k), be.f(v)), "causal_attention"), ref_attention(*(a.astype(np.float32) for a in (q, k, v))))
    rep.check("缩放：维数 d = 64 时也对（分数要除以 √d）", t3)

    def t4():
        q, k, v = rng.normal(size=(3, 1, 5)), rng.normal(size=(3, 1, 5)), rng.normal(size=(3, 1, 5))
        return close(be.out(f(be.f(q), be.f(k), be.f(v)), "causal_attention"), v.astype(np.float32))
    rep.check("只有一个位置时，输出就是 v", t4)


# ---------------------------------------------------------------- 最后一步：拼成一个模型，训练
def shakespeare_text(chan):
    """莎士比亚全集里截出的约 100 万个字符（Karpathy 的 char-rnn 数据，作品本身是公有领域）；第一次用时下载，存在本机的缓存目录"""
    path = os.environ.get("MLLAB_SHAKESPEARE")
    if path and os.path.exists(path):
        return open(path, encoding="utf8").read()
    cache = os.path.join(os.environ.get("XDG_CACHE_HOME") or os.path.join(os.path.expanduser("~"), ".cache"), "mllab-engine")
    path = os.path.join(cache, "tinyshakespeare.txt")
    if os.path.exists(path) and os.path.getsize(path) > 100000:
        return open(path, encoding="utf8").read()
    chan.send("progress", {"phase": "data", "msg": "第一次用：下载莎士比亚的文本（约 1 MB）……"})
    from . import fetcher
    try:
        r = fetcher.fetch(SHAKESPEARE_URL, max_bytes=5 * 2 ** 20)
    except Exception as e:
        raise ExerciseError("下载莎士比亚的文本没成功（%s）。可以自己从 %s 下载，存成 %s，再运行一次；"
                            "或者设环境变量 MLLAB_SHAKESPEARE=文件的路径。" % (e, SHAKESPEARE_URL, path))
    data = r["data"] if isinstance(r, dict) else r
    if isinstance(data, np.ndarray):
        data = data.tobytes()
    text = bytes(data).decode("utf8")
    os.makedirs(cache, exist_ok=True)
    with open(path, "w", encoding="utf8") as fh:
        fh.write(text)
    return text


def bigram_baselines(train, val, V):
    """(均匀分布, 只看字符频率, 只看上一个字符) 三种做法在验证集上的平均交叉熵（nats）。加一平滑。"""
    uni = np.bincount(train, minlength=V).astype(np.float64) + 1
    uni /= uni.sum()
    big = np.ones((V, V))
    np.add.at(big, (train[:-1], train[1:]), 1)
    big /= big.sum(1, keepdims=True)
    return math.log(V), float(-np.mean(np.log(uni[val]))), float(-np.mean(np.log(big[val[:-1], val[1:]])))


def ex_train_tiny(ns, be, rep, rng, chan, budget_ms, params):
    torch = be.torch
    if torch is None:
        raise ExerciseError("训练这一步要用 PyTorch（要靠它自动求导）。在启动引擎的那个 Python 环境里装上 PyTorch：pip install torch，再重启引擎。")
    nn = torch.nn
    Emb, Lin = need(ns, "Embedding", "class"), need(ns, "Linear", "class")
    attn, ce = need(ns, "causal_attention", "def"), need(ns, "cross_entropy", "def")
    for C, nm in ((Emb, "Embedding"), (Lin, "Linear")):
        if not issubclass(C, nn.Module):
            raise ExerciseError("%s 要继承 torch.nn.Module，权重用 nn.Parameter：这样拼成的模型才能把它的参数交给优化器。" % nm)
    from .runtime import torch_device
    dev = torch_device() or torch.device("cpu")
    d = int(params.get("d", 64)); T = int(params.get("block", 64)); B = int(params.get("batch", 32))
    steps = int(params.get("steps", 1500)); lr = float(params.get("lr", 2e-3))
    text = shakespeare_text(chan)
    chars = sorted(set(text)); V = len(chars); stoi = {c: i for i, c in enumerate(chars)}
    data = np.array([stoi[c] for c in text], dtype=np.int64)
    n = int(0.9 * len(data)); train, val = data[:n], data[n:]
    base = bigram_baselines(train, val, V)
    chan.send("progress", {"phase": "data", "msg": "文本 %d 个字符，词表 %d 个字符；训练 %d、验证 %d。" % (len(data), V, len(train), len(val))})

    class TinyLM(nn.Module):
        """一层：词嵌入 + 位置嵌入 → 因果注意力（残差）→ 两层前馈（残差）→ 输出层。全部用你写的组件。"""

        def __init__(self):
            super().__init__()
            self.tok, self.pos = Emb(V, d), Emb(T, d)
            self.q, self.k, self.v, self.o = Lin(d, d), Lin(d, d), Lin(d, d), Lin(d, d)
            self.ff1, self.ff2, self.head = Lin(d, 4 * d), Lin(4 * d, d), Lin(d, V)

        def forward(self, idx):
            t = idx.shape[1]
            x = self.tok(idx) + self.pos(torch.arange(t, device=idx.device))
            x = x + self.o(attn(self.q(x), self.k(x), self.v(x)))
            return self.head(x + self.ff2(torch.relu(self.ff1(x))))

    model = TinyLM().to(dev)
    nparam = sum(p.numel() for p in model.parameters())
    if nparam == 0:
        raise ExerciseError("拼成的模型里一个可训练的参数也没有：Linear、Embedding 的 weight 要用 nn.Parameter。")
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    g = np.random.default_rng(int(rng.integers(1 << 31)))

    def batch(src):
        ix = g.integers(0, len(src) - T - 1, size=B)
        x = np.stack([src[i:i + T] for i in ix]); y = np.stack([src[i + 1:i + T + 1] for i in ix])
        return torch.from_numpy(x).to(dev), torch.from_numpy(y).to(dev)

    vb = [batch(val) for _ in range(20)]

    def val_loss():
        model.eval()
        with torch.no_grad():
            s = sum(float(ce(model(x), y)) for x, y in vb) / len(vb)
        model.train()
        return s

    t0 = time.time(); deadline = t0 + budget_ms / 1000.0
    curve, last_post, step, smooth = [], 0.0, 0, None
    first = None
    while step < steps:
        x, y = batch(train)
        loss = ce(model(x), y)
        if not hasattr(loss, "requires_grad") or not loss.requires_grad:
            raise ExerciseError("你的 cross_entropy 返回的数没有连着计算图（requires_grad 是 False），没法求导："
                                "里面不能转成 numpy、不能用 .item() 或 float() 再算，要一直用张量运算。")
        if first is None:
            first = float(loss)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        for gr in (p.grad for p in model.parameters()):
            if gr is not None and not torch.isfinite(gr).all():
                raise ExerciseError("第 %d 步的梯度里出现了 NaN：多半是 softmax 或交叉熵在数值上不稳定。" % step)
        opt.step()
        lr_now = lr * min(1.0, (step + 1) / 100) * (0.1 + 0.9 * 0.5 * (1 + math.cos(math.pi * step / steps)))
        for gp in opt.param_groups:
            gp["lr"] = lr_now
        li = float(loss.detach())
        smooth = li if smooth is None else 0.95 * smooth + 0.05 * li
        step += 1
        pt = {"step": step, "loss": smooth}
        if step % 100 == 0 or step == steps:
            pt["validLoss"] = val_loss()
        now = time.time()
        if "validLoss" in pt or now - last_post > 0.15:
            curve.append(pt)
            chan.send("progress", {"phase": "fit", "step": step, "point": pt, "n": len(curve)})
            last_post = now
        if now > deadline:
            chan.send("log", {"text": "时间预算用完，在第 %d 步停下。" % step})
            break
    vl = val_loss()
    if not curve or curve[-1].get("step") != step or "validLoss" not in curve[-1]:
        curve.append({"step": step, "loss": smooth, "validLoss": vl})
    # 采样：每一步用你写的 softmax（有的话）把最后一个位置的 logits 变成概率
    sm = ns.get("softmax")
    model.eval()
    ctx = torch.tensor([[stoi["\n"]]], device=dev)
    out = []
    with torch.no_grad():
        for _ in range(400):
            logits = model(ctx[:, -T:])[:, -1, :] / 0.8
            p = sm(logits, -1) if callable(sm) else torch.softmax(logits, -1)
            nxt = torch.multinomial(p.float().clamp_min(0), 1)
            ctx = torch.cat([ctx, nxt], 1)
            out.append(chars[int(nxt)])
    secs = time.time() - t0
    uni, freq, bi = base
    rep.add("训练能跑通：%d 步，loss 从 %.2f 降到 %.2f" % (step, first, smooth), smooth < first - 0.5,
            "" if smooth < first - 0.5 else "loss 几乎没降：看看学习率、初始化，或者 cross_entropy 是不是对的。")
    rep.add("验证集上的 loss 比“只看上一个字符”的做法低（%.3f 对 %.3f）" % (vl, bi), vl < bi,
            "" if vl < bi else "还没有比只看上一个字符的计数模型更好：注意力没有帮上忙。多训几步，或者检查注意力的实现。")
    return {"curve": curve, "sample": "".join(out), "valLoss": vl, "steps": step, "seconds": secs, "params": nparam,
            "baselines": {"uniform": uni, "unigram": freq, "bigram": bi}, "device": str(dev), "vocab": V,
            "config": {"d": d, "block": T, "batch": B, "lr": lr, "steps": steps}}


# ---------------------------------------------------------------- 入口
def run_exercise(job, ns, chan, lib):
    data = job.get("data") or {}
    ex = data.get("exercise")
    if ex not in EXERCISES:
        raise ExerciseError("没有这个练习：%r。" % (ex,))
    t0 = time.time()
    want = data.get("backend") or "auto"
    be = Backend("numpy" if want == "numpy" else "auto")
    rep = Report(chan)
    code = job.get("code") or ""
    bad = forbidden_uses(code)
    seed = int(job.get("seed") or 0)
    rng = np.random.default_rng(seed + 1)
    extra = None
    if ex == "train_tiny":
        extra = ex_train_tiny(ns, be, rep, rng, chan, float(job.get("budgetMs") or 240000), job.get("params") or {})
    else:
        {"softmax": ex_softmax, "cross_entropy": ex_cross_entropy, "linear": ex_linear,
         "embedding": ex_embedding, "attention": ex_attention}[ex](ns, be, rep, rng)
    if bad:
        rep.add("从零写：没有调用库里现成的实现", False,
                "；".join("第 %d 行 %s" % (ln, s) for ln, s in bad[:5]) + "：这些要你自己写。", None, None)
        rep.tests[-1]["line"] = bad[0][0]
    out = {"api": "exercise", "kind": "exercise", "exercise": ex, "backend": be.name, "tests": rep.tests,
           "passed": sum(1 for t in rep.tests if t["ok"]), "total": len(rep.tests), "ms": (time.time() - t0) * 1000.0}
    if extra:
        out.update(extra)
    return out
