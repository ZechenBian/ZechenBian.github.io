# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""本机引擎的测试：cd strategy-lab/ml-engine && python3 -m unittest -v

在一个线程里起服务（系统挑的空闲端口），用 http.client 发请求（可以伪造 Host / Origin），
真的开子进程跑算法。PyTorch 的例子这里只编译、不运行（测试环境里没有 PyTorch）。"""
import http.client
import importlib.util
import json
import math
import os
import py_compile
import sys
import tempfile
import time
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import numpy as np  # noqa: E402

from mllab_engine import __version__, codec, runtime, server  # noqa: E402
from mllab_engine.server import Engine  # noqa: E402

EXAMPLES = os.path.join(ROOT, "examples")
HEADER = ("# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。\n"
          "# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。\n")


def example(name):
    with open(os.path.join(EXAMPLES, name), encoding="utf-8") as f:
        return f.read()


def parse_sse(text):
    """SSE 文本 → [(id, 事件名, 解码后的数据)]；注释行（: ping）跳过"""
    out = []
    for block in text.replace("\r\n", "\n").split("\n\n"):
        if not block.strip():
            continue
        eid, name, data = None, "message", []
        for line in block.split("\n"):
            if not line or line.startswith(":"):
                continue
            key, _, val = line.partition(":")
            val = val[1:] if val.startswith(" ") else val
            if key == "data":
                data.append(val)
            elif key == "event":
                name = val
            elif key == "id":
                eid = int(val)
        if data:
            out.append((eid, name, codec.loads("\n".join(data))))
    return out


class FakeCtx:
    """在测试进程里直接调用例子代码（算参考答案）时用的 ctx"""
    budget_ms = 1e9

    def report(self, step, metrics=None, **kw):
        pass

    def snapshot(self, step, model):
        pass

    def time_left(self):
        return 1e9

    def log(self, *a):
        pass


def load_module(code):
    ns = {"__name__": "ref_algo"}
    exec(compile(code, "<ref>", "exec"), ns)
    return ns


def split_dict(X, y, idx, kind, k=0, with_y=True, **extra):
    d = {"X": codec.typed(X[idx], "f8"), "n": len(idx), "d": X.shape[1]}
    if with_y:
        d["y"] = codec.typed(y[idx], "i4" if kind == "classification" else "f8")
        d["k"] = k
        d["classes"] = ["类%d" % c for c in range(k)] if kind == "classification" else None
    d.update(extra)
    return d


def supervised_job(code, X, y, kind, k=0, params=None, seed=7, budget=20000, grid=None, n_tr=None, n_va=None, extra=None):
    n = len(X)
    n_tr = n_tr or int(n * 0.6)
    n_va = n_va or int(n * 0.2)
    tr, va, te = np.arange(n_tr), np.arange(n_tr, n_tr + n_va), np.arange(n_tr + n_va, n)
    data = {"kind": kind, "train": split_dict(X, y, tr, kind, k, **(extra or {})), "valid": split_dict(X, y, va, kind, k, **(extra or {})),
            "test": split_dict(X, y, te, kind, with_y=False)}
    if grid is not None:
        data["grid"] = {"X": codec.typed(grid, "f8")}
    return {"api": "supervised", "kind": kind, "code": code, "params": params or {}, "seed": seed, "budgetMs": budget, "data": data}, (tr, va, te)


class EngineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.page = os.path.join(cls.tmp.name, "index.html")
        with open(cls.page, "w", encoding="utf-8") as f:
            f.write("<!doctype html><html lang=\"zh-CN\"><HEAD data-x=\"1\"><title>测试页</title></HEAD><body>机器学习实验室</body></html>")
        cls.eng = Engine(port=0, page=cls.page, quiet=True, kill_slack_s=1.0)
        cls.eng.bind()
        cls.thread = cls.eng.start_thread()
        cls.port = cls.eng.port
        cls.seen_headers = []

    @classmethod
    def tearDownClass(cls):
        cls.eng.close()
        cls.thread.join(5)
        cls.tmp.cleanup()

    # ---------- 小工具 ----------
    def request(self, method, path, body=None, headers=None, token=True, host=None, timeout=60):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=timeout)
        c.putrequest(method, path, skip_host=True, skip_accept_encoding=True)
        c.putheader("Host", host or "127.0.0.1:%d" % self.port)
        if token:
            c.putheader("X-QLML-Token", self.eng.token if token is True else token)
        data = None
        if body is not None:
            data = body if isinstance(body, bytes) else json.dumps(body).encode("utf-8")
            c.putheader("Content-Type", "application/json")
            c.putheader("Content-Length", str(len(data)))
        for k, v in (headers or {}).items():
            c.putheader(k, v)
        c.endheaders()
        if data is not None:
            c.send(data)
        r = c.getresponse()
        raw = r.read()
        hdrs = {k.lower(): v for k, v in r.getheaders()}
        c.close()
        self.seen_headers.append(hdrs)
        return r.status, hdrs, raw

    def start(self, job):
        st, _, raw = self.request("POST", "/api/run", job)
        self.assertEqual(st, 200, raw)
        return json.loads(raw)["id"]

    def events(self, rid, headers=None, query=""):
        st, hdrs, raw = self.request("GET", "/api/run/%s/events%s" % (rid, query), headers=headers)
        self.assertEqual(st, 200, raw)
        self.assertTrue(hdrs["content-type"].startswith("text/event-stream"))
        return parse_sse(raw.decode("utf-8"))

    def run_job(self, job):
        rid = self.start(job)
        evs = self.events(rid)
        self.assertIn(evs[-1][1], ("done", "error"))
        return rid, evs

    def result_of(self, job):
        rid, evs = self.run_job(job)
        if evs[-1][1] != "done":
            self.fail("运行出错：%r" % (evs[-1][2],))
        return evs[-1][2]["result"], evs

    def error_of(self, job):
        rid, evs = self.run_job(job)
        self.assertEqual(evs[-1][1], "error", "应该出错，却成功了")
        return evs[-1][2]

    def wait_idle(self, secs=10):
        t0 = time.time()
        while self.eng.current is not None and time.time() - t0 < secs:
            time.sleep(0.05)
        self.assertIsNone(self.eng.current)

    # ---------- 编码 ----------
    def test_codec_roundtrip(self):
        rng = np.random.default_rng(1)
        arrays = {"f8": rng.normal(size=(3, 4)), "f4": rng.normal(size=(2, 3, 2)).astype(np.float32),
                  "i4": rng.integers(-2 ** 31, 2 ** 31 - 1, size=7, dtype=np.int64).astype(np.int32), "u1": rng.integers(0, 256, size=(5,), dtype=np.int64).astype(np.uint8)}
        for code, a in arrays.items():
            enc = codec.typed(a)
            self.assertEqual(enc["dtype"], code)
            self.assertEqual(enc["shape"], list(a.shape))
            back = codec.loads(json.dumps({"x": enc, "nested": [enc]}))
            for b in (back["x"], back["nested"][0]):
                self.assertEqual(b.dtype, a.dtype)
                self.assertEqual(b.shape, a.shape)
                np.testing.assert_array_equal(b, a)
                self.assertTrue(b.flags.writeable)
        # 指定代号、空数组、没有 shape 时当一维
        e = codec.typed(np.arange(4), "f4")
        self.assertEqual(e["dtype"], "f4")
        np.testing.assert_array_equal(codec.decode_array({"$b64": e["$b64"], "dtype": "f4"}), np.arange(4, dtype=np.float32))
        self.assertEqual(codec.loads(json.dumps(codec.typed(np.zeros((0, 3)))) ).shape, (0, 3))
        # 字节序：确实是小端
        self.assertEqual(codec.typed(np.array([1], dtype=np.int32))["$b64"], "AQAAAA==")
        # NaN / ∞ → null；numpy 标量 → Python 数；布尔数组 → u1；大整数 → f8
        j = json.loads(codec.dumps({"a": float("nan"), "b": np.float32(1.5), "c": [np.int64(3), float("inf")], "d": np.array([True, False]), "e": np.array([2 ** 40])}))
        self.assertEqual((j["a"], j["b"], j["c"]), (None, 1.5, [3, None]))
        self.assertEqual(j["d"]["dtype"], "u1")
        self.assertEqual(j["e"]["dtype"], "f8")
        for bad in ({"$b64": "AAAA", "dtype": "f2"}, {"$b64": "AAAAAAAAAAA=", "dtype": "f8", "shape": [2]}, {"$b64": "AAA", "dtype": "f4"}, {"$b64": "AAAA", "dtype": "f4", "shape": [-1]}):
            with self.assertRaises(codec.CodecError):
                codec.decode_array(bad)

    def test_js_number_formatting(self):
        # 和 JavaScript 的 String(v)、v.toPrecision(4) 逐字相同（第一期的报错信息里用的就是它们）
        cases = {2.0: "2.000", 0.9: "0.9000", 12345.678: "1.235e+4", 0.00001234: "0.00001234", 1.234e-7: "1.234e-7", 0: "0.000", 1.0004: "1.000", 999.96: "1000"}
        for v, want in cases.items():
            self.assertEqual(runtime.to_precision(v, 4), want, v)
        for v, want in {-1.0: "-1", float("nan"): "NaN", float("inf"): "Infinity", 0.5: "0.5", 1e-7: "1e-7", 1.5e21: "1.5e+21", 123456789012.0: "123456789012", 1e-5: "0.00001", -0.25: "-0.25"}.items():
            self.assertEqual(runtime.js_num(v), want, v)

    def test_clean_pred_messages(self):
        cp = runtime.clean_pred
        E = runtime.EngineError
        with self.assertRaisesRegex(E, r"^predict 的第 1 行概率加起来是 2\.000，应该是 1（是不是忘了做 softmax？）。$"):
            cp("classification", np.array([[0.5, 0.5], [1.0, 1.0]]), 2, 2, "predict")
        with self.assertRaisesRegex(E, r"^predict 的第 0 行概率里有负数或不是数的值（-0\.5）。$"):
            cp("classification", np.array([[-0.5, 1.5], [0.5, 0.5]]), 2, 2, "predict")
        with self.assertRaisesRegex(E, r"^predict 的第 0 行概率里有负数或不是数的值（NaN）。$"):
            cp("classification", [[float("nan"), 1.0]], 1, 2, "predict")
        with self.assertRaisesRegex(E, r"^predict 的第 0 行概率里有负数或不是数的值（Infinity）。$"):
            cp("classification", [[float("inf"), 1.0]], 1, 2, "predict")
        with self.assertRaisesRegex(E, r"^predict 的第 0 行概率全是 0。$"):
            cp("classification", [[0.0, 0.0]], 1, 2, "predict")
        with self.assertRaisesRegex(E, r"^predict 返回了 3 个数，应该是 4 个（每个样本 2 个类别的概率，按行排）。$"):
            cp("classification", [0.5, 0.5, 1.0], 2, 2, "predict")
        with self.assertRaisesRegex(E, r"^predict 返回的数组形状是 \(2, 3\)"):
            cp("classification", np.full((2, 3), 1 / 2), 3, 2, "predict")
        with self.assertRaisesRegex(E, r"^predict 没有返回数组。$"):
            cp("regression", None, 2, 0, "predict")
        with self.assertRaisesRegex(E, r"^predict 没有返回数组。$"):
            cp("regression", 3.0, 1, 0, "predict")
        with self.assertRaisesRegex(E, r"^predict 的第 1 个预测不是有限的数。$"):
            cp("regression", [1.0, float("nan")], 2, 0, "predict")
        with self.assertRaisesRegex(E, r"^predict 返回了 1 个数，应该是 2 个。$"):
            cp("regression", [1.0], 2, 0, "predict")
        # 差 1e-3 以内的照样收下，并且归一化
        out = cp("classification", np.array([[0.2, 0.8005], [0.3, 0.7]], dtype=np.float32), 2, 2, "predict")
        self.assertEqual(out.dtype, np.float64)
        np.testing.assert_allclose(out.reshape(2, 2).sum(1), 1.0, rtol=0, atol=1e-12)
        np.testing.assert_allclose(cp("regression", np.array([[1.0], [2.0]]), 2, 0, "predict"), [1.0, 2.0])

    # ---------- 服务：身份与来源检查 ----------
    def test_info(self):
        st, hdrs, raw = self.request("GET", "/api/info")
        self.assertEqual(st, 200)
        info = json.loads(raw)
        self.assertEqual(info["version"], __version__)
        self.assertEqual(info["python"], "%d.%d.%d" % sys.version_info[:3])
        self.assertEqual(info["numpy"], np.__version__)
        self.assertIsInstance(info["cpu_count"], int)
        self.assertEqual(set(info["torch"]) >= {"available", "version", "device"}, True)
        if importlib.util.find_spec("torch") is None:
            self.assertEqual((info["torch"]["available"], info["torch"]["version"], info["torch"]["device"]), (False, None, None))
        self.assertEqual(hdrs["cache-control"], "no-store")

    def test_rejections(self):
        p = self.port
        self.assertEqual(self.request("GET", "/api/info", token=False)[0], 401)
        self.assertEqual(self.request("GET", "/api/info", token="x" * 32)[0], 401)
        self.assertEqual(self.request("GET", "/api/info?token=" + self.eng.token, token=False)[0], 401)   # 只有事件流接受 ?token=
        # DNS 重绑定：Host 不是本机 → 拒绝（页面本身也不给，因为页面里有令牌）
        for host in ("evil.example:%d" % p, "127.0.0.1:%d" % (p + 1), "127.0.0.1", "evil.example"):
            self.assertEqual(self.request("GET", "/api/info", host=host)[0], 403, host)
            self.assertEqual(self.request("GET", "/ml/?engine=" + self.eng.token, host=host, token=False)[0], 403, host)
        # Origin：带了就必须是自己
        for origin in ("http://evil.example", "null", "http://localhost:%d" % p, "https://127.0.0.1:%d" % p):
            self.assertEqual(self.request("GET", "/api/info", headers={"Origin": origin})[0], 403, origin)
        self.assertEqual(self.request("GET", "/api/info", headers={"Origin": "http://127.0.0.1:%d" % p})[0], 200)
        self.assertEqual(self.request("GET", "/api/info", host="localhost:%d" % p, headers={"Origin": "http://localhost:%d" % p})[0], 200)
        self.assertEqual(self.request("GET", "/api/info", headers={"Sec-Fetch-Site": "cross-site"})[0], 403)
        self.assertEqual(self.request("GET", "/api/info", headers={"Sec-Fetch-Site": "same-site"})[0], 403)
        self.assertEqual(self.request("GET", "/api/info", headers={"Sec-Fetch-Site": "same-origin"})[0], 200)
        # 跨域预检：没有令牌、没有 CORS 头
        st, hdrs, _ = self.request("OPTIONS", "/api/run", token=False, headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-qlml-token"})
        self.assertIn(st, (401, 403))
        st, _, _ = self.request("OPTIONS", "/api/run")
        self.assertEqual(st, 405)
        self.assertEqual(self.request("POST", "/api/info", body={})[0], 405)
        self.assertEqual(self.request("GET", "/api/run")[0], 405)
        self.assertEqual(self.request("GET", "/api/nothing")[0], 404)
        self.assertEqual(self.request("GET", "/api/run/doesnotexist/events")[0], 404)
        self.assertEqual(self.request("POST", "/api/run", body=b"{not json")[0], 400)
        self.assertEqual(self.request("POST", "/api/run", body={"api": "supervised", "data": {}})[0], 400)
        self.assertEqual(self.request("POST", "/api/run", body={"api": "nope", "code": "x", "data": {}})[0], 400)
        old = self.eng.max_body
        self.eng.max_body = 1000
        try:
            self.assertEqual(self.request("POST", "/api/run", body=b"{" + b" " * 2000 + b"}")[0], 413)
        finally:
            self.eng.max_body = old
        for h in self.seen_headers:
            self.assertFalse([k for k in h if k.startswith("access-control-")], h)

    def test_page(self):
        tok = self.eng.token
        st, hdrs, _ = self.request("GET", "/", token=False)
        self.assertEqual((st, hdrs["location"]), (302, "/ml/"))
        st, hdrs, _ = self.request("GET", "/?engine=" + tok, token=False)
        self.assertEqual((st, hdrs["location"]), (302, "/ml/?engine=" + tok))
        self.assertEqual(self.request("GET", "/ml", token=False)[0], 301)
        for path in ("/ml/?engine=" + tok, "/ml/index.html?engine=" + tok):
            st, hdrs, raw = self.request("GET", path, token=False)
            self.assertEqual(st, 200)
            html = raw.decode("utf-8")
            want = '<HEAD data-x="1"><script>window.QLML_ENGINE={"token":"%s","version":"%s"};</script><title>' % (tok, __version__)
            self.assertIn(want, html)
            self.assertEqual(hdrs["x-frame-options"], "DENY")
            self.assertEqual(hdrs["cache-control"], "no-store")
            self.assertEqual(hdrs["referrer-policy"], "no-referrer")
            self.assertTrue(hdrs["content-type"].startswith("text/html"))
        # 网址里没有正确的令牌：页面照给，但不注入令牌
        for path in ("/ml/", "/ml/?engine=wrong"):
            html = self.request("GET", path, token=False)[2].decode("utf-8")
            self.assertIn('window.QLML_ENGINE={"token":null,"version":"%s","needToken":true};' % __version__, html)
            self.assertNotIn(tok, html)
        self.assertEqual(self.request("GET", "/favicon.ico", token=False)[0], 404)
        self.assertEqual(self.request("GET", "/ml/app.js", token=False)[0], 404)
        self.assertEqual(self.request("POST", "/ml/", token=False, body={})[0], 405)
        # 页面不存在：给一张说明怎么构建的中文页
        old, old_c = self.eng.page, server.page_candidates
        try:
            self.eng.page = os.path.join(self.tmp.name, "missing.html")
            html = self.request("GET", "/ml/", token=False)[2].decode("utf-8")
            self.assertIn("页面还没有构建", html)
            self.assertIn("missing.html", html)
            self.assertIn("--page", html)
            self.eng.page = None
            server.page_candidates = lambda cwd=None: [os.path.join(self.tmp.name, "nope", "index.html")]
            html = self.request("GET", "/ml/", token=False)[2].decode("utf-8")
            self.assertIn("python3 build.py", html)
        finally:
            self.eng.page, server.page_candidates = old, old_c

    def test_examples_listing(self):
        st, _, raw = self.request("GET", "/api/examples")
        self.assertEqual(st, 200)
        ex = {e["id"]: e for e in json.loads(raw)["examples"]}
        self.assertEqual(set(ex), {"ridge_numpy", "softmax_numpy", "mlp_torch", "cnn_torch", "grokking_torch", "mlp_forecast_torch", "ar_numpy"})
        self.assertEqual(ex["ar_numpy"]["api"], "forecast")
        self.assertEqual(ex["mlp_torch"]["needs"], ["torch"])
        self.assertEqual(ex["mlp_torch"]["kinds"], ["classification", "regression"])
        self.assertEqual(ex["ridge_numpy"]["params"][0]["key"], "lam")
        for e in ex.values():
            self.assertTrue(e["name"] and e["summary"] and e["docs"], e["id"])
            self.assertTrue(e["code"].startswith(HEADER), e["id"])
            for prm in e["params"]:
                self.assertTrue({"key", "label", "def", "type"} <= set(prm), (e["id"], prm))

    # ---------- 监督学习：端到端 ----------
    def test_ridge_end_to_end(self):
        rng = np.random.default_rng(3)
        n, d = 300, 3
        X = rng.normal(size=(n, d)) * [1.0, 10.0, 0.1] + [0.0, 5.0, -1.0]
        y = X @ np.array([1.5, -0.2, 4.0]) + 0.3 + rng.normal(scale=0.1, size=n)
        job, (tr, va, te) = supervised_job(example("ridge_numpy.py"), X, y, "regression", params={"lam": 0.5},
                                           extra={"featureNames": ["甲", "乙", "丙"]})
        res, evs = self.result_of(job)
        # 参考答案：在测试里独立算一遍闭式解
        mu, sd = X[tr].mean(0), X[tr].std(0)
        Z = (X[tr] - mu) / sd
        w = np.linalg.solve(Z.T @ Z + 0.5 * np.eye(d), Z.T @ (y[tr] - y[tr].mean()))
        ref = lambda idx: ((X[idx] - mu) / sd) @ w + y[tr].mean()
        for part, idx in (("train", tr), ("valid", va), ("test", te)):
            got = res["pred"][part]
            self.assertEqual((got.dtype, got.shape), (np.float64, (len(idx),)))
            np.testing.assert_allclose(got, ref(idx), rtol=1e-9, atol=1e-9)
        self.assertEqual((res["api"], res["kind"], res["k"]), ("supervised", "regression", 0))
        self.assertEqual(res["split"], {"nTrain": 180, "nValid": 60, "nTest": 60})
        self.assertIsNone(res["trainIdx"])
        self.assertEqual(res["size"], d + 1)
        self.assertEqual(len(res["curve"]), 1)
        self.assertEqual(set(res["curve"][0]), {"step", "loss", "validLoss"})
        coef = res["internals"]["coef"]
        self.assertEqual([c["name"] for c in coef], ["截距", "甲", "乙", "丙"])
        np.testing.assert_allclose([c["value"] for c in coef[1:]], w, rtol=1e-9)
        self.assertGreaterEqual(res["fitMs"], 0)
        self.assertGreater(res["predUs"], 0)
        self.assertEqual(res["engine"]["numpy"], np.__version__)
        names = [e[1] for e in evs]
        self.assertEqual(names[0], "ready")
        self.assertIn("progress", names)
        self.assertEqual([e[0] for e in evs], list(range(len(evs))))     # 事件编号从 0 连续
        # 断线重连：Last-Event-ID / ?from= 从中间接着发；都收到了就 204
        rid = self.start(job)
        full = self.events(rid)
        part = self.events(rid, headers={"Last-Event-ID": "1"})
        self.assertEqual([e[0] for e in part], [e[0] for e in full][2:])
        part = self.events(rid, query="?from=3")
        self.assertEqual(part[0][0], 3)
        self.assertEqual(self.request("GET", "/api/run/%s/events" % rid, headers={"Last-Event-ID": str(full[-1][0])})[0], 204)
        st, _, raw = self.request("GET", "/api/run/%s/events?token=%s" % (rid, self.eng.token), token=False)    # EventSource 式的 ?token=
        self.assertEqual(st, 200)
        self.assertEqual(parse_sse(raw.decode("utf-8"))[-1][1], "done")
        status = json.loads(self.request("GET", "/api/run/%s" % rid)[2])
        self.assertEqual((status["state"], status["finished"]), ("done", True))

    def test_softmax_end_to_end(self):
        rng = np.random.default_rng(5)
        k, per = 3, 100
        centers = np.array([[0.0, 0.0], [3.0, 0.5], [0.5, 3.0]])
        X = np.concatenate([rng.normal(size=(per, 2)) * 0.6 + c for c in centers])
        y = np.repeat(np.arange(k), per)
        perm = rng.permutation(len(X))
        X, y = X[perm], y[perm]
        g = np.linspace(-2, 5, 6)
        grid = np.array([[a, b] for b in g for a in g])
        code = example("softmax_numpy.py")
        params = {"lr": 0.5, "epochs": 150, "l2": 1e-3}
        job, (tr, va, te) = supervised_job(code, X, y, "classification", k=k, params=params, grid=grid)
        res, evs = self.result_of(job)
        # 参考答案：在测试进程里直接执行同一份代码（全批量梯度下降是确定的）
        ns = load_module(code)
        sp = lambda idx: types.SimpleNamespace(X=X[idx], y=y[idx].astype(np.int64), n=len(idx), d=2, k=k)
        model = ns["fit"](types.SimpleNamespace(train=sp(tr), valid=sp(va), kind="classification"), params, None, FakeCtx())
        for part, idx in (("train", tr), ("valid", va), ("test", te)):
            got = res["pred"][part]
            self.assertEqual(got.shape, (len(idx) * k,))
            np.testing.assert_allclose(got, ns["predict"](model, X[idx]).ravel(), rtol=1e-9, atol=1e-12)
            np.testing.assert_allclose(got.reshape(-1, k).sum(1), 1.0, atol=1e-12)
        acc = np.mean(res["pred"]["valid"].reshape(-1, k).argmax(1) == y[va])
        self.assertGreater(acc, 0.9)
        self.assertEqual(res["size"], 2 * k + k)
        self.assertGreater(len(res["curve"]), 100)
        self.assertEqual(set(res["curve"][0]), {"step", "loss", "validLoss", "trainMetric", "validMetric"})
        self.assertLess(res["curve"][-1]["loss"], res["curve"][0]["loss"])
        lay = res["internals"]["layers"][0]
        self.assertEqual((lay["rows"], lay["cols"], lay["data"].dtype, lay["data"].size), (2, k, np.float32, 2 * k))
        snaps = [e[2] for e in evs if e[1] == "snap"]
        self.assertTrue(snaps)
        self.assertEqual(snaps[0]["values"].shape, (len(grid) * k,))
        self.assertEqual(snaps[0]["values"].dtype, np.float32)

    def test_snapshots_on_2d_grid(self):
        code = (
            "import numpy as np\n"
            "def fit(data, p, lib, ctx):\n"
            "    m = {'t': 0.0}\n"
            "    print('开始训练', data.train.n)\n"
            "    for step in range(500):\n"
            "        m['t'] = step / 500\n"
            "        ctx.report(step, loss=1.0 - m['t'])\n"
            "        ctx.snapshot(step, m)\n"
            "    ctx.log('完成', 500)\n"
            "    return m\n"
            "def predict(model, X):\n"
            "    q = 1 / (1 + np.exp(-(X[:, 0] - model['t'])))\n"
            "    return np.stack([1 - q, q], axis=1)\n")
        rng = np.random.default_rng(2)
        X = rng.normal(size=(100, 2))
        y = (X[:, 0] > 0).astype(int)
        grid = rng.normal(size=(25, 2))
        res, evs = self.result_of(supervised_job(code, X, y, "classification", k=2, grid=grid)[0])
        snaps = res["snaps"]
        self.assertLessEqual(len(snaps), 60)
        self.assertGreaterEqual(len(snaps), 25)
        steps = [s["step"] for s in snaps]
        self.assertEqual(steps, sorted(steps))
        self.assertEqual(steps[0], 0)
        self.assertGreater(steps[-1], 400)
        for s in snaps:
            self.assertEqual(s["kind"], "grid2d")
            t = s["step"] / 500
            q = 1 / (1 + np.exp(-(grid[:, 0] - t)))
            np.testing.assert_allclose(s["values"], np.stack([1 - q, q], 1).ravel(), rtol=1e-6, atol=1e-6)
        ev_snaps = [e[2] for e in evs if e[1] == "snap"]
        self.assertGreaterEqual(len(ev_snaps), len(snaps))
        self.assertTrue({s["step"] for s in snaps} <= {s["step"] for s in ev_snaps})
        progress = [e[2] for e in evs if e[1] == "progress" and e[2].get("phase") == "fit"]
        self.assertTrue(progress and "point" in progress[0])
        self.assertEqual(len(res["curve"]), 500)
        logs = [e[2]["text"] for e in evs if e[1] == "log"]
        self.assertIn("开始训练 60", logs)       # print() 的输出也进日志
        self.assertIn("完成 500", logs)
        self.assertEqual(res["log"], logs)

    def test_embed_snapshots_and_internals(self):
        code = (
            "import numpy as np\n"
            "def fit(data, p, lib, ctx):\n"
            "    m = data.train.tokens['vocab']\n"
            "    model = {'E': lib.rng.normal(size=(m, 4)), 'k': data.train.k}\n"
            "    for s in range(5):\n"
            "        model['E'] = model['E'] * 0.5\n"
            "        ctx.snapshot(s, model)\n"
            "    return model\n"
            "def predict(model, X):\n"
            "    return np.full((len(X), model['k']), 1.0 / model['k'])\n"
            "def inspect(model):\n"
            "    return {'embedding': {'data': model['E'], 'labels': list(range(len(model['E'])))}, 'tree': {'nodes': [{'f': 1, 'thr': 0.5, 'value': [1, 2]}]}, 'extra': {'a': np.arange(3)}}\n")
        p = 7
        A, B = np.meshgrid(np.arange(p), np.arange(p))
        X = np.stack([A.ravel(), B.ravel()], 1).astype(float)
        y = (X[:, 0] + X[:, 1]) % p
        res, evs = self.result_of(supervised_job(code, X, y.astype(int), "classification", k=p, extra={"tokens": {"vocab": p}})[0])
        snaps = res["snaps"]
        self.assertEqual(len(snaps), 5)
        self.assertEqual((snaps[0]["kind"], snaps[0]["rows"], snaps[0]["cols"], snaps[0]["data"].size), ("embed", p, 4, p * 4))
        np.testing.assert_allclose(snaps[1]["data"], snaps[0]["data"] * 0.5, rtol=1e-6)
        emb = res["internals"]["embedding"]
        self.assertEqual((emb["rows"], emb["cols"], emb["labels"][:3]), (p, 4, ["0", "1", "2"]))
        np.testing.assert_allclose(emb["data"], snaps[-1]["data"], rtol=1e-6)
        self.assertEqual(res["internals"]["tree"]["nodes"][0], {"f": 1, "thr": 0.5, "left": 0, "right": 0, "value": [1.0, 2.0], "n": 0})
        self.assertEqual(res["internals"]["extra"], {"a": [0, 1, 2]})

    def test_large_train_set_is_subsampled(self):
        code = "import numpy as np\ndef fit(data, p, lib, ctx):\n    return {}\ndef predict(model, X):\n    return X[:, 0] * 2\n"
        n_tr = 20500
        X = np.arange(n_tr + 200, dtype=float)[:, None]
        res, _ = self.result_of(supervised_job(code, X, X[:, 0], "regression", n_tr=n_tr, n_va=100)[0])
        idx = (np.arange(20000) * n_tr) // 20000
        np.testing.assert_array_equal(res["trainIdx"], idx)
        np.testing.assert_array_equal(res["pred"]["train"], 2 * idx)
        self.assertIsNone(res["size"])

    def test_probability_validation_end_to_end(self):
        code = ("import numpy as np\n"
                "def fit(data, p, lib, ctx):\n    return {'k': data.train.k}\n"
                "def predict(model, X):\n    return np.ones((len(X), model['k']))\n")
        rng = np.random.default_rng(0)
        X = rng.normal(size=(50, 2))
        err = self.error_of(supervised_job(code, X, (X[:, 0] > 0).astype(int), "classification", k=2)[0])
        self.assertEqual(err["message"], "predict 的第 0 行概率加起来是 2.000，应该是 1（是不是忘了做 softmax？）。")
        self.assertEqual(err["line"], 0)

    # ---------- 时间序列 ----------
    def forecast_job(self, code, y, t1, t2, H, season=0, params=None):
        return {"api": "forecast", "kind": "forecast", "code": code, "params": params or {}, "seed": 1, "budgetMs": 20000,
                "data": {"y": codec.typed(y, "f8"), "t1": t1, "t2": t2, "H": H, "season": season, "freq": "day", "label": "测试序列"}}

    def test_forecast_ar_end_to_end(self):
        rng = np.random.default_rng(11)
        T, H = 300, 3
        y = np.zeros(T)
        for t in range(2, T):
            y[t] = 0.5 + 0.6 * y[t - 1] - 0.3 * y[t - 2] + rng.normal()
        t1, t2 = int(T * 0.6), int(T * 0.8)
        res, _ = self.result_of(self.forecast_job(example("ar_numpy.py"), y, t1, t2, H, params={"order": 2}))
        # 参考答案：训练段上的最小二乘 + 递推预测
        q = 2
        A = np.column_stack([np.ones(t1 - q), y[1:t1 - 1], y[0:t1 - 2]])
        beta = np.linalg.lstsq(A, y[q:t1], rcond=None)[0]

        def fc(t):
            h = [y[t - 1], y[t]]
            out = []
            for _ in range(H):
                v = beta[0] + beta[1] * h[-1] + beta[2] * h[-2]
                out.append(v)
                h.append(v)
            return out
        warm = min(t1 - 2, max(10, 0))
        ranges = {"train": (warm, t1 - 1 - H), "valid": (t1 - 1, t2 - 1 - H), "test": (t2 - 1, T - 1 - H)}
        self.assertEqual(res["origins"], {k: list(v) for k, v in ranges.items()})
        for part, (a, b) in ranges.items():
            ref = np.array([fc(t) for t in range(a, b + 1)]).ravel()
            self.assertEqual(res["pred"][part].shape, ((b - a + 1) * H,))
            np.testing.assert_allclose(res["pred"][part], ref, rtol=1e-9, atol=1e-9)
        self.assertEqual((res["api"], res["horizon"], res["size"]), ("forecast", H, 3))
        self.assertEqual(res["split"], {"nTrain": t1, "nValid": t2 - t1, "nTest": T - t2, "t1": t1, "t2": t2, "T": T})
        self.assertEqual(res["internals"]["coef"][0]["name"], "常数 c")
        self.assertIn("谱半径", res["internals"]["text"])

    def test_forecast_origin_order_and_update(self):
        T, H, season = 200, 3, 12
        t1, t2 = int(T * 0.6), int(T * 0.8)
        y = np.arange(T) + 0.5
        code = ("def fit(series, p, lib, ctx):\n"
                "    assert len(series.y) == series.T == %d and len(series.valid.y) == %d and series.valid.start == %d and series.season == %d\n"
                "    return {'fed': 0, 'last': -1.0}\n"
                "def update(model, y_new):\n"
                "    model['fed'] += 1\n"
                "    model['last'] = y_new\n"
                "def forecast(model, past, h):\n"
                "    return [len(past) - 1, model['fed'], model['last']] + [0.0] * (h - 3)\n") % (t1, t2 - t1, t1, season)
        res, _ = self.result_of(self.forecast_job(code, y, t1, t2, H, season=season))
        warm = min(t1 - 2, max(10, 2 * season))
        self.assertEqual(warm, 24)
        exp = {"train": [(t, 0, -1.0) for t in range(warm, t1 - H)],
               "valid": [(t, t + 1 - t1, y[t] if t + 1 > t1 else -1.0) for t in range(t1 - 1, t2 - H)],
               "test": [(t, t + 1 - t1, y[t]) for t in range(t2 - 1, T - H)]}
        for part, rows in exp.items():
            np.testing.assert_array_equal(res["pred"][part].reshape(-1, H), np.array(rows, dtype=float), err_msg=part)
        self.assertEqual(len(exp["train"]), t1 - H - warm)
        self.assertEqual(len(exp["valid"]), t2 - t1 - H + 1)
        self.assertEqual(len(exp["test"]), T - t2 - H + 1)
        # 没有 update：一直没人喂
        code2 = "def fit(series, p, lib, ctx):\n    return {}\ndef forecast(model, past, h):\n    return [past[-1] * 0 + len(past) - 1] * h\n"
        res2, _ = self.result_of(self.forecast_job(code2, y, t1, t2, 1))
        np.testing.assert_array_equal(res2["pred"]["test"], np.arange(t2 - 1, T - 1, dtype=float))
        np.testing.assert_array_equal(res2["pred"]["train"], np.arange(10, t1 - 1, dtype=float))

    def test_forecast_errors(self):
        y = np.arange(200.0)
        err = self.error_of(self.forecast_job("def fit(s, p, lib, ctx):\n    return 1\ndef forecast(m, past, h):\n    return [1.0]\n", y, 120, 160, 3))
        self.assertEqual(err["message"], "训练段：forecast 应该返回长度为 3 的数组。")
        err = self.error_of(self.forecast_job("def fit(s, p, lib, ctx):\n    return 1\n", y, 120, 160, 1))
        self.assertIn("forecast(model, past, h)", err["message"])
        st, _, raw = self.request("POST", "/api/run", self.forecast_job("x", y, 120, 160, 1) | {"code": ""})
        self.assertEqual(st, 400)

    # ---------- 出错时的行号 ----------
    def test_user_error_line_numbers(self):
        X = np.random.default_rng(0).normal(size=(40, 2))
        y = X[:, 0]
        code = ("import numpy as np\n"            # 1
                "\n"                              # 2
                "def fit(data, p, lib, ctx):\n"   # 3
                "    a = np.ones(3)\n"            # 4
                "    b = helper(a)\n"             # 5
                "    return b\n"                  # 6
                "def helper(a):\n"                # 7
                "    return a @ np.ones(4)\n"     # 8
                "def predict(model, X):\n"
                "    return X[:, 0]\n")
        err = self.error_of(supervised_job(code, X, y, "regression")[0])
        self.assertEqual(err["line"], 8)
        self.assertTrue(err["message"].startswith("ValueError"), err["message"])
        self.assertIn('File "<algo>", line 8, in helper', err["traceback"])
        self.assertIn('File "<algo>", line 5, in fit', err["traceback"])
        self.assertIn("return a @ np.ones(4)", err["traceback"])
        self.assertNotIn("runtime.py", err["traceback"])
        self.assertNotIn("worker.py", err["traceback"])
        # 语法错误
        err = self.error_of(supervised_job("import numpy as np\n\ndef fit(data, p, lib, ctx:\n    return 1\n", X, y, "regression")[0])
        self.assertEqual(err["line"], 3)
        self.assertTrue(err["message"].startswith("语法错误（第 3 行）"), err["message"])
        # 顶层语句出错
        err = self.error_of(supervised_job("x = 1\ny = x / 0\n", X, y, "regression")[0])
        self.assertEqual((err["line"], err["type"]), (2, "ZeroDivisionError"))
        # 引擎自己发现的问题：中文消息，没有类型前缀
        err = self.error_of(supervised_job("def fit(data, p, lib, ctx):\n    pass\ndef predict(m, X):\n    return X[:, 0]\n", X, y, "regression")[0])
        self.assertEqual(err["message"], "fit 没有返回模型（最后要 return 一个对象）。")
        # 改只读的数据：给新手一句提示；预测里出错，行号指向 predict
        err = self.error_of(supervised_job("def fit(data, p, lib, ctx):\n    X = data.train.X\n    X -= 1\n    return {}\ndef predict(m, X):\n    return X[:, 0]\n", X, y, "regression")[0])
        self.assertEqual(err["line"], 3)
        self.assertIn("提示：", err["message"])
        self.assertIn("copy()", err["hint"])
        err = self.error_of(supervised_job("def fit(data, p, lib, ctx):\n    return {}\ndef predict(m, X):\n    return X[:, 5]\n", X, y, "regression")[0])
        self.assertEqual((err["line"], err["type"]), (4, "IndexError"))

    # ---------- 超时、取消、一次只跑一个 ----------
    def test_infinite_loop_is_killed(self):
        self.wait_idle()
        X = np.zeros((30, 1))
        job = supervised_job("def fit(data, p, lib, ctx):\n    while True:\n        pass\ndef predict(m, X):\n    return X[:, 0]\n", X, X[:, 0], "regression", budget=1000)[0]
        t0 = time.time()
        err = self.error_of(job)
        took = time.time() - t0
        self.assertTrue(err.get("timeout"), err)
        self.assertIn("死循环", err["message"])
        self.assertGreater(took, 2.0)          # 预算 1 秒 × 1.5 + 测试里的余量 1 秒
        self.assertLess(took, 15.0)
        self.wait_idle()
        self.assertFalse(json.loads(self.request("GET", "/api/info")[2])["busy"])

    def test_cancel_and_busy(self):
        self.wait_idle()
        X = np.zeros((30, 1))
        slow = supervised_job("import time\ndef fit(data, p, lib, ctx):\n    while ctx.time_left() > 0:\n        time.sleep(0.01)\n    return {}\ndef predict(m, X):\n    return X[:, 0]\n",
                              X, X[:, 0], "regression", budget=60000)[0]
        rid = self.start(slow)
        st, _, raw = self.request("POST", "/api/run", slow)
        self.assertEqual(st, 409)
        self.assertEqual(json.loads(raw)["running"], rid)
        t0 = time.time()
        while json.loads(self.request("GET", "/api/run/%s" % rid)[2])["state"] != "running":
            self.assertLess(time.time() - t0, 30)
            time.sleep(0.05)
        self.assertTrue(json.loads(self.request("GET", "/api/info")[2])["busy"])
        st, _, raw = self.request("POST", "/api/run/%s/cancel" % rid, body={})
        self.assertEqual(st, 200)
        evs = self.events(rid)
        self.assertEqual(evs[-1][1], "error")
        self.assertTrue(evs[-1][2].get("cancelled"))
        self.assertLess(time.time() - t0, 30)
        # 收到最后一条事件以后马上可以开下一次
        quick = supervised_job("def fit(data, p, lib, ctx):\n    return {}\ndef predict(m, X):\n    return X[:, 0]\n", X, X[:, 0], "regression")[0]
        res, _ = self.result_of(quick)
        self.assertEqual(res["pred"]["test"].shape, (6,))
        self.assertEqual(self.request("POST", "/api/run/%s/cancel" % rid, body={})[0], 200)    # 已经结束的：什么也不做


class StaticTest(unittest.TestCase):
    def test_all_sources_compile(self):
        # PyTorch 的例子在这里没法运行（没有 PyTorch），至少要能编译；也按 Python 3.10 的语法检查一遍
        import ast
        files = [os.path.join(d, f) for d in (EXAMPLES, os.path.join(ROOT, "mllab_engine"), HERE) for f in sorted(os.listdir(d)) if f.endswith(".py")]
        self.assertGreaterEqual(len(files), 14)
        with tempfile.TemporaryDirectory() as tmp:
            for f in files:
                py_compile.compile(f, cfile=os.path.join(tmp, os.path.basename(f) + "c"), doraise=True)
                with open(f, encoding="utf-8") as fh:
                    ast.parse(fh.read(), filename=f, feature_version=(3, 10))

    def test_copyright_headers(self):
        files = [os.path.join(ROOT, "pyproject.toml")]
        for d in (EXAMPLES, os.path.join(ROOT, "mllab_engine"), HERE):
            files += [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.endswith(".py")]
        for f in files:
            with open(f, encoding="utf-8") as fh:
                self.assertTrue(fh.read().startswith(HEADER), f)
        for f in ("README.md", "PROTOCOL.md"):
            with open(os.path.join(ROOT, f), encoding="utf-8") as fh:
                self.assertIn("Copyright (c) 2026 Zechen Bian. All rights reserved.", fh.read(400), f)

    def test_torch_examples_use_float32_and_device(self):
        # 静态检查：PyTorch 的例子把数据放到 lib.device 上、用 float32、预测时 no_grad + eval
        for name in ("mlp_torch.py", "cnn_torch.py", "grokking_torch.py", "mlp_forecast_torch.py"):
            src = example(name)
            self.assertIn("lib.device", src, name)
            self.assertNotIn("float64)", src.replace("astype(np.float64)", "").replace("dtype=np.float64)", ""), name)
            self.assertNotIn("torch.float64", src, name)
            self.assertNotIn(".double()", src, name)
            self.assertIn("torch.no_grad()", src, name)
            self.assertIn(".eval()", src, name)
            self.assertIn("net.train()", src, name)
            self.assertIn("ctx.time_left()", src, name)


if __name__ == "__main__":
    unittest.main()
