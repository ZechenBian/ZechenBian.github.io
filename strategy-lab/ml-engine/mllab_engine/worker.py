# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""子进程的入口：每次运行都开一个新的 Python 进程（multiprocessing 的 spawn 方式），
所以算法崩溃、死循环、把内存吃光，都只会弄死这个子进程，服务进程不受影响；服务进程到点了直接把它杀掉。

注意：子进程不是安全沙箱。算法代码拥有和你本人一样的权限（能读写文件、联网）。见 README 的"安全"一节。

这个模块在服务进程里也会被导入（为了把 child_main 交给 multiprocessing），所以顶层不导入 numpy / torch。"""
import io
import linecache
import os
import random
import re
import signal
import sys
import traceback
import types

USER_FILE = "<algo>"      # 用户代码在调用栈里的"文件名"：报错时据此挑出用户自己的那几层
TORCH_WORDS = re.compile(r"\btorch\b|\blib\.(?:nn|F|device)\b")


class LogStream(io.TextIOBase):
    """print() 的输出：每一行都变成一条 log 事件（页面里能看到），同时照样打印在终端里"""

    def __init__(self, chan, mirror):
        super().__init__()
        self.chan = chan
        self.mirror = mirror
        self.buf = ""

    @property
    def encoding(self):
        return "utf-8"

    def writable(self):
        return True

    def isatty(self):
        return False

    def write(self, s):
        s = str(s)
        if self.mirror is not None:
            try:
                self.mirror.write(s)
            except Exception:
                pass
        self.buf += s
        while "\n" in self.buf:
            line, self.buf = self.buf.split("\n", 1)
            line = line.rsplit("\r", 1)[-1]       # 进度条之类用 \r 覆盖的行只留最后一段
            if line.strip():
                self.chan.log(line)
        if len(self.buf) > 10000:
            self.chan.log(self.buf[-500:])
            self.buf = ""
        return len(s)

    def flush(self):
        if self.buf.strip():
            self.chan.log(self.buf.rsplit("\r", 1)[-1])
        self.buf = ""
        if self.mirror is not None:
            try:
                self.mirror.flush()
            except Exception:
                pass


# 常见错误 → 一句给新手的提示（按顺序匹配：错误信息里同时出现这几个片段，不分大小写）
HINTS = [
    (("read-only",), "页面发来的数据是只读的（为了不让 fit 改坏它，后面还要在训练集上预测）。要改的话先复制一份，例如 X = data.train.X.copy()。"),
    (("not writeable",), "页面发来的数据是只读的。要改的话先复制一份，例如 X = data.train.X.copy()。"),
    (("mps", "float64"), "苹果芯片的 GPU（MPS）不支持 float64：把张量换成 float32，例如 torch.tensor(X, dtype=torch.float32, device=lib.device)。"),
    (("expected scalar type",), "两个张量的类型不一致（常见：一个是 float64，一个是 float32）。数据统一用 torch.float32，类别标签用 torch.long。"),
    (("must have the same dtype",), "两个张量的类型不一致（常见：一个是 float64，一个是 float32）。数据统一用 torch.float32。"),
    (("found dtype double",), "张量是 float64（double）：换成 float32，例如 torch.tensor(X, dtype=torch.float32)。"),
    (("same device",), "张量不在同一个设备上：把模型和数据都放到 lib.device 上（net.to(lib.device)、x.to(lib.device)）。"),
    (("placeholder storage has not been allocated",), "张量不在同一个设备上：把模型和数据都放到 lib.device 上（net.to(lib.device)、x.to(lib.device)）。"),
    (("can't convert mps",), "GPU 上的张量要先搬回 CPU 才能变成 numpy：用 t.detach().cpu().numpy()。"),
    (("can't convert cuda",), "GPU 上的张量要先搬回 CPU 才能变成 numpy：用 t.detach().cpu().numpy()。"),
    (("requires grad",), "带梯度的张量不能直接变成 numpy：用 t.detach().cpu().numpy()；predict 里最好整个包在 with torch.no_grad(): 里。"),
    (("not currently implemented for the mps device",), "这个运算 MPS 还不支持。可以用 PYTORCH_ENABLE_MPS_FALLBACK=1 python -m mllab_engine 重新启动引擎（不支持的运算自动退回 CPU），或者在代码里改用 CPU：dev = lib.torch.device(\"cpu\")。"),
    (("out of memory",), "内存（或显存）不够：把 batch 调小、网络调小，或者少用一些数据。"),
    (("no module named 'torch'",), "这个 Python 环境里没有装 PyTorch：在引擎所在的环境里运行 pip install torch（或 uv pip install torch），然后重启引擎。见 README。"),
    (("'nonetype' object has no attribute",), "某个值是 None。如果是 lib.torch / lib.nn / lib.device：说明没装 PyTorch，见 README；否则检查是不是有函数忘了 return。"),
]


def _hint(msg):
    low = msg.lower()
    for keys, text in HINTS:
        if all(k in low for k in keys):
            return text
    return ""


def describe_error(e):
    """异常 → {message, line, traceback, type, hint}；line 是用户代码里的行号（找不到就是 0）"""
    from .runtime import EngineError
    if isinstance(e, SyntaxError) and getattr(e, "filename", None) == USER_FILE:
        line = int(e.lineno or 0)
        tb = "".join(traceback.format_exception_only(type(e), e))
        return {"message": "语法错误（第 %d 行）：%s" % (line, e.msg), "line": line, "traceback": tb, "type": type(e).__name__, "hint": ""}
    frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == USER_FILE]
    line = int(frames[-1].lineno or 0) if frames else 0
    if isinstance(e, EngineError):
        msg = str(e)
    elif isinstance(e, SystemExit):
        msg = "代码里调用了 sys.exit() / exit()，运行被结束了。"
    elif isinstance(e, KeyboardInterrupt):
        msg = "运行被中断了。"
    else:
        text = str(e)
        msg = type(e).__name__ + (": " + text if text else "")
    hint = "" if isinstance(e, EngineError) else _hint(msg)
    tb = ""
    if frames:
        tb = "Traceback (most recent call last):\n" + "".join(traceback.format_list(frames[-8:]))
        tb += "".join(traceback.format_exception_only(type(e), e))
    return {"message": msg + ("\n提示：" + hint if hint else ""), "line": line, "traceback": tb, "type": type(e).__name__, "hint": hint}


def load_algo(code):
    """编译并执行用户代码（在一个全新的模块里），返回其中的 fit / predict / forecast / update / inspect"""
    from .runtime import Algo
    code = str(code)
    if not code.endswith("\n"):
        code += "\n"
    linecache.cache[USER_FILE] = (len(code), None, code.splitlines(True), USER_FILE)    # 让 traceback 能显示出错的那一行
    compiled = compile(code, USER_FILE, "exec", dont_inherit=True)
    mod = types.ModuleType("mllab_algo", "用户的算法代码")
    mod.__file__ = USER_FILE
    sys.modules["mllab_algo"] = mod       # dataclass、pickle 之类要从 sys.modules 里找模块
    exec(compiled, mod.__dict__)
    return Algo(mod.__dict__)


def _seed_all(seed):
    import numpy as np
    random.seed(seed)
    np.random.seed(seed % (2 ** 32))


def _watch_parent():
    """服务进程没了（被强行杀掉、崩溃）就自己退出：不留下一个没人管的死循环"""
    import threading
    import time
    ppid = os.getppid()

    def loop():
        while True:
            time.sleep(1.0)
            if os.getppid() != ppid:
                os._exit(4)
    threading.Thread(target=loop, name="mllab-watch-parent", daemon=True).start()


def child_main(job, conn, opts=None):
    """子进程的主函数。job 是服务进程收到的请求（数组还是 {"$b64"} 的样子）；conn 是只写的管道"""
    opts = opts or {}
    try:
        signal.signal(signal.SIGINT, signal.SIG_IGN)     # Ctrl+C 交给服务进程处理（它会把这个子进程杀掉）
    except (ValueError, OSError, AttributeError):
        pass
    if os.name == "posix":
        _watch_parent()
    from .runtime import Channel
    chan = Channel(conn, quiet=bool(opts.get("quiet")))
    real_out, real_err = sys.stdout, sys.stderr
    mirror_out = None if opts.get("quiet") else (sys.__stdout__ or None)
    sys.stdout = LogStream(chan, mirror_out)
    sys.stderr = LogStream(chan, None if opts.get("quiet") else (sys.__stderr__ or None))
    try:
        try:
            import numpy  # noqa: F401
        except ImportError:
            chan.send("error", {"message": "这个 Python 环境里没有 numpy：先运行 pip install numpy（见 README）。", "line": 0, "traceback": "", "type": "ImportError", "hint": ""})
            return
        from . import codec, runtime
        try:
            seed = int(job.get("seed") or 0)
        except (TypeError, ValueError):
            seed = 0
        seed = abs(seed)
        try:
            job["data"] = codec.decode(job.get("data"))
        except codec.CodecError as e:
            chan.send("error", {"message": "页面发来的数据解不开：%s" % e, "line": 0, "traceback": "", "type": "CodecError", "hint": ""})
            return
        _seed_all(seed)
        code = job.get("code") or ""
        if TORCH_WORDS.search(code):
            runtime.load_torch(seed)   # 代码里提到 torch：先导入好（要一两秒），不占算法的时间预算；没装的话这里静静地跳过
        chan.send("ready", {"pid": os.getpid(), "python": "%d.%d.%d" % sys.version_info[:3], "numpy": numpy.__version__,
                            "torch": runtime.engine_info()["torch"], "device": runtime.engine_info()["device"]})
        lib = runtime.Lib(seed)
        algo = load_algo(code)
        if sys.modules.get("torch") is not None:
            runtime.load_torch(seed)   # 算法自己在顶层 import torch 的话，也给它播种、选好设备
        result = runtime.run(job, algo, chan, lib)
        sys.stdout.flush()
        sys.stderr.flush()
        result["log"] = list(chan.logs)
        chan.send("done", {"result": result})
    except BaseException as e:     # noqa: B902 —— 连 SystemExit 也要报告给页面
        try:
            sys.stdout.flush()
            sys.stderr.flush()
        except Exception:
            pass
        try:
            chan.send("error", describe_error(e))
        except Exception:
            chan.send("error", {"message": "%s: %s" % (type(e).__name__, e), "line": 0, "traceback": "", "type": type(e).__name__, "hint": ""})
    finally:
        sys.stdout, sys.stderr = real_out, real_err
        try:
            conn.close()
        except Exception:
            pass
