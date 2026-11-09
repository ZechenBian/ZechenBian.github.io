# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""亲手写 · 语言模型的练习（api = exercise）：cd strategy-lab/ml-engine && python3 -m unittest -v tests.test_exercises

测试环境里没有 PyTorch，所以这里用 numpy 写的参考实现（剧透！）走一遍 numpy 这条路，再用几种典型的错误写法确认测试抓得住。
有 PyTorch 的机器上，test_torch_* 用 PyTorch 写的参考实现把同样的练习和训练那一步也跑一遍。"""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from mllab_engine import exercises  # noqa: E402
from tests import test_engine as te  # noqa: E402（只借它的小工具；不把 EngineTest 放进本模块，免得它的测试再跑一遍）

try:
    import torch  # noqa: F401
    HAVE_TORCH = True
except Exception:
    HAVE_TORCH = False

# ---------- 参考实现（剧透：自己写完之前别看） ----------
NUMPY_REF = '''
import numpy as np

def softmax(x, dim=-1):
    m = x.max(axis=dim, keepdims=True)
    e = np.exp(x - m)
    return e / e.sum(axis=dim, keepdims=True)

def cross_entropy(logits, targets):
    z = logits.reshape(-1, logits.shape[-1])
    t = targets.reshape(-1)
    m = z.max(axis=1, keepdims=True)
    lse = m[:, 0] + np.log(np.exp(z - m).sum(axis=1))
    return (lse - z[np.arange(len(t)), t]).mean()

class Linear:
    def __init__(self, n_in, n_out):
        self.weight = np.random.normal(0, 1 / np.sqrt(n_in), size=(n_out, n_in)).astype(np.float32)
    def __call__(self, x):
        return x @ self.weight.T

class Embedding:
    def __init__(self, n, d):
        self.weight = np.random.normal(0, 1, size=(n, d)).astype(np.float32)
    def __call__(self, ids):
        return self.weight[ids]

def causal_attention(q, k, v):
    T, d = q.shape[-2], q.shape[-1]
    s = q @ np.swapaxes(k, -1, -2) / np.sqrt(d)
    s = np.where(np.tril(np.ones((T, k.shape[-2]), dtype=bool)), s, -np.inf)
    return softmax(s, -1) @ v
'''

TORCH_REF = '''
import math
import torch
from torch import nn

def softmax(x, dim=-1):
    e = torch.exp(x - x.max(dim=dim, keepdim=True).values)
    return e / e.sum(dim=dim, keepdim=True)

def cross_entropy(logits, targets):
    z = logits.reshape(-1, logits.shape[-1])
    t = targets.reshape(-1)
    m = z.max(dim=1, keepdim=True).values
    lse = m[:, 0] + torch.log(torch.exp(z - m).sum(dim=1))
    return (lse - z[torch.arange(len(t), device=z.device), t]).mean()

class Linear(nn.Module):
    def __init__(self, n_in, n_out):
        super().__init__()
        self.weight = nn.Parameter(torch.randn(n_out, n_in) / math.sqrt(n_in))
    def forward(self, x):
        return x @ self.weight.T

class Embedding(nn.Module):
    def __init__(self, n, d):
        super().__init__()
        self.weight = nn.Parameter(torch.randn(n, d))
    def forward(self, ids):
        return self.weight[ids]

def causal_attention(q, k, v):
    T, d = q.shape[-2], q.shape[-1]
    s = q @ k.transpose(-1, -2) / math.sqrt(d)
    mask = torch.tril(torch.ones(T, k.shape[-2], dtype=torch.bool, device=q.device))
    return softmax(s.masked_fill(~mask, float("-inf")), -1) @ v
'''


def job(code, ex, backend="numpy", params=None, budget=20000):
    return {"api": "exercise", "code": code, "params": params or {}, "seed": 3, "budgetMs": budget,
            "data": {"exercise": ex, "backend": backend}}


class ExerciseTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        te.EngineTest.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        te.EngineTest.tearDownClass.__func__(cls)

    request = te.EngineTest.request
    start = te.EngineTest.start
    events = te.EngineTest.events
    run_job = te.EngineTest.run_job
    result_of = te.EngineTest.result_of
    error_of = te.EngineTest.error_of

    def check_ex(self, code, ex, backend="numpy"):
        res, evs = self.result_of(job(code, ex, backend))
        self.assertEqual(res["api"], "exercise")
        self.assertEqual(res["exercise"], ex)
        self.assertEqual(len(res["tests"]), res["total"])
        self.assertEqual(sum(1 for e in evs if e[1] == "progress" and e[2].get("phase") == "test"), res["total"])
        return res

    def test_reference_passes_every_exercise(self):
        for ex in exercises.EXERCISES[:-1]:
            res = self.check_ex(NUMPY_REF, ex)
            self.assertEqual(res["backend"], "numpy")
            self.assertEqual(res["passed"], res["total"], (ex, [t for t in res["tests"] if not t["ok"]]))
            self.assertGreaterEqual(res["total"], 2)

    def test_naive_softmax_overflows(self):
        bad = NUMPY_REF.replace("e = np.exp(x - m)", "e = np.exp(x)")
        res = self.check_ex(bad, "softmax")
        fails = [t["name"] for t in res["tests"] if not t["ok"]]
        self.assertEqual(len(fails), 1, fails)
        self.assertIn("大数不溢出", fails[0])

    def test_attention_without_mask_breaks_causality(self):
        bad = NUMPY_REF.replace("s = np.where(np.tril(np.ones((T, k.shape[-2]), dtype=bool)), s, -np.inf)", "pass")
        res = self.check_ex(bad, "attention")
        fails = " ".join(t["name"] for t in res["tests"] if not t["ok"])
        self.assertIn("因果性", fails)
        self.assertIn("参照答案", fails)
        ok = [t["name"] for t in res["tests"] if t["ok"]]
        self.assertTrue(any("只有一个位置" in n for n in ok))     # 一个位置时没有"未来"，不加掩码也对

    def test_attention_without_scaling(self):
        bad = NUMPY_REF.replace("/ np.sqrt(d)", "")
        res = self.check_ex(bad, "attention")
        self.assertTrue(any("缩放" in t["name"] and not t["ok"] for t in res["tests"]))

    def test_library_shortcut_is_flagged(self):
        bad = NUMPY_REF.replace("def softmax(x, dim=-1):\n", "import scipy.special\ndef softmax(x, dim=-1):\n    return scipy.special.softmax(x, axis=dim)\n")
        res = self.check_ex(bad, "softmax")
        last = res["tests"][-1]
        self.assertFalse(last["ok"])
        self.assertIn("从零写", last["name"])
        self.assertIn("scipy.special.softmax", last["msg"])
        self.assertEqual(last["line"], 6)

    def test_static_check_rules(self):
        f = exercises.forbidden_uses
        self.assertEqual(f("def softmax(x):\n    return x\ny = softmax(1)\n"), [])                     # 自己的同名函数
        self.assertEqual(len(f("import torch\ny = torch.softmax(x, -1)\n")), 1)
        self.assertEqual(len(f("y = x.softmax(-1)\n")), 1)                                             # 张量的方法
        self.assertEqual(len(f("import torch.nn.functional as F\nl = F.cross_entropy(a, b)\n")), 1)
        self.assertEqual(len(f("from torch import nn\nm = nn.Linear(3, 4)\n")), 1)
        self.assertEqual(f("class M:\n    def __init__(self):\n        self.linear = 1\n    def f(self):\n        return self.linear\n"), [])   # 自己的属性叫 linear 不算
        self.assertEqual(len(f("from torch.nn.functional import scaled_dot_product_attention\n")), 1)
        self.assertIsNone(f("def (:\n"))

    def test_missing_function_and_errors_inside_code(self):
        err = self.error_of(job("x = 1\n", "softmax"))
        self.assertIn("还没有函数 softmax", err["message"])
        code = NUMPY_REF.replace("    return e / e.sum(axis=dim, keepdims=True)", "    return e / e.sum(axis=dim, keepdims=True) + undefined_name")
        res = self.check_ex(code, "softmax")
        t = res["tests"][0]
        self.assertFalse(t["ok"])
        self.assertIn("NameError", t["msg"])
        self.assertGreater(t.get("line", 0), 0)

    def test_inplace_modification_is_caught(self):
        bad = NUMPY_REF.replace("    m = x.max(axis=dim, keepdims=True)\n    e = np.exp(x - m)", "    x -= x.max(axis=dim, keepdims=True)\n    e = np.exp(x)")
        res = self.check_ex(bad, "softmax")
        self.assertTrue(any("不改动" in t["name"] and not t["ok"] for t in res["tests"]))

    def test_unknown_exercise_and_train_needs_torch(self):
        st, _, raw = self.request("POST", "/api/run", job(NUMPY_REF, "nope"))
        self.assertEqual(st, 400)
        if not HAVE_TORCH:
            err = self.error_of(job(NUMPY_REF, "train_tiny", backend="auto"))
            self.assertIn("PyTorch", err["message"])

    def test_bigram_baselines(self):
        import math
        import numpy as np
        rng = np.random.default_rng(0)
        tr, va = rng.integers(0, 5, size=5000), rng.integers(0, 5, size=1000)
        uni, freq, bi = exercises.bigram_baselines(tr, va, 5)
        self.assertAlmostEqual(uni, math.log(5))
        self.assertLess(abs(freq - math.log(5)), 0.02)   # 均匀随机的数据：频率和上一个字符都帮不上忙
        self.assertLess(abs(bi - math.log(5)), 0.05)

    @unittest.skipUnless(HAVE_TORCH, "没有 PyTorch")
    def test_torch_reference_passes(self):
        for ex in exercises.EXERCISES[:-1]:
            res = self.check_ex(TORCH_REF, ex, backend="auto")
            self.assertEqual(res["backend"], "torch")
            self.assertEqual(res["passed"], res["total"], (ex, [t for t in res["tests"] if not t["ok"]]))

    @unittest.skipUnless(HAVE_TORCH and os.environ.get("MLLAB_SHAKESPEARE"), "没有 PyTorch，或者没设 MLLAB_SHAKESPEARE（莎士比亚文本的路径）")
    def test_torch_train_tiny(self):
        res, evs = self.result_of(job(TORCH_REF, "train_tiny", backend="auto", params={"steps": 300}, budget=120000))
        self.assertEqual(res["passed"], res["total"], res["tests"])
        self.assertLess(res["valLoss"], res["baselines"]["bigram"])
        self.assertEqual(len(res["sample"]), 400)


if __name__ == "__main__":
    unittest.main()
