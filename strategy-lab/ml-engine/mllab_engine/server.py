# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""本机引擎的 HTTP 服务：只用标准库（http.server 的 ThreadingHTTPServer）。

只监听 127.0.0.1（别的电脑连不上）；每次启动生成一个随机令牌，所有 /api/* 都要带上它；
Host 必须是 127.0.0.1:端口 或 localhost:端口（防 DNS 重绑定：恶意网站把自己的域名解析到 127.0.0.1 也没用）；
带了 Origin 的请求，Origin 必须就是本服务自己；不发任何 CORS 头，所以别的网站的脚本读不到这里的任何回应。
页面（/ml/）和接口同源，页面里注入令牌（只有网址里带着正确的 ?engine=令牌 时才注入）。

每次运行在一个新的子进程里（见 worker.py），一次只跑一个；进度用 Server-Sent Events 推给页面。
完整的接口见 PROTOCOL.md。"""
import collections
import errno
import hmac
import http.server
import importlib.metadata
import importlib.util
import json
import math
import multiprocessing
import os
import re
import secrets
import subprocess
import sys
import threading
import time
from urllib.parse import parse_qs, urlsplit

from . import __version__
from . import worker

PKG_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(PKG_DIR)                    # strategy-lab/ml-engine
MAX_BODY = 200 * 1024 * 1024                              # 请求体最大 200 MB
MAX_CODE = 2 * 1024 * 1024                                # 算法代码最长 2 MB
KEEP_RUNS = 8                                             # 留着最近几次运行的事件（页面断线重连还能拿到结果）
RUN_PATH = re.compile(r"^/api/run/([A-Za-z0-9_-]{1,64})(/events|/cancel)?$")
HEAD_TAG = re.compile(r"<head(?:\s[^>]*)?>", re.IGNORECASE)

# 检查 PyTorch 用的小程序：在单独的进程里跑（导入 torch 要一两秒、几百 MB 内存，服务进程不必背着它）
TORCH_PROBE = r"""
import json, os, sys
try:
    import torch
except Exception as e:
    print(json.dumps({"available": False, "version": None, "device": None, "error": "%s: %s" % (type(e).__name__, e)}))
    sys.exit(0)
dev = "cpu"
try:
    mps = getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available()
    cuda = torch.cuda.is_available()
    want = (os.environ.get("MLLAB_DEVICE") or "").strip().lower()
    if want == "cpu": dev = "cpu"
    elif want == "cuda" and cuda: dev = "cuda"
    elif mps: dev = "mps"
    elif cuda: dev = "cuda"
except Exception:
    pass
print(json.dumps({"available": True, "version": torch.__version__, "device": dev}))
"""


def page_candidates(cwd=None):
    """默认的页面位置：仓库里 strategy-lab/ml/index.html（相对这个包），再试几个相对当前目录的位置"""
    cwd = cwd or os.getcwd()
    out = [os.path.normpath(os.path.join(PROJECT_DIR, "..", "ml", "index.html")),
           os.path.normpath(os.path.join(cwd, "..", "ml", "index.html")),
           os.path.normpath(os.path.join(cwd, "ml", "index.html")),
           os.path.normpath(os.path.join(cwd, "strategy-lab", "ml", "index.html"))]
    seen, uniq = set(), []
    for p in out:
        if p not in seen:
            seen.add(p)
            uniq.append(p)
    return uniq


def dist_version(name):
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None
    except Exception:
        return None


def missing_page_html(path, explicit):
    """页面还没构建时给的说明页"""
    esc = lambda s: str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    how = ("你用 --page 指定了这个文件，但它不存在。检查一下路径。" if explicit else
           "在仓库的 <code>strategy-lab</code> 目录里运行 <code>python3 build.py</code>（第一次要先 <code>npm install</code>，见 strategy-lab/README.md），然后刷新这一页。")
    return ("<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>机器学习实验室 · 本机引擎</title>"
            "<style>body{font:16px/1.7 -apple-system,'PingFang SC','Noto Sans SC',sans-serif;max-width:640px;margin:48px auto;padding:0 16px;color:#222;background:#fafaf7}"
            "code{background:#eee;padding:1px 5px;border-radius:4px}</style></head><body>"
            "<h1>本机引擎在运行，但页面还没有构建</h1>"
            "<p>引擎要找的页面文件是：<br><code>%s</code></p><p>%s</p>"
            "<p>也可以用 <code>python -m mllab_engine --page 页面文件的路径</code> 指定别的位置。</p>"
            "<p>引擎版本 %s。停止引擎：在运行它的终端里按 Ctrl+C。</p></body></html>") % (esc(path), how, esc(__version__))


class Run:
    """一次运行：事件列表（SSE 从头重放，断线重连不丢）、状态、取消开关"""

    def __init__(self, rid, api, kind, budget_ms):
        self.id = rid
        self.api = api
        self.kind = kind
        self.budget_ms = budget_ms
        self.events = []                 # [(事件名, JSON 文本)]
        self.cond = threading.Condition()
        self.state = "starting"          # starting → running → done | error | cancelled | timeout
        self.finished = False
        self.cancel = threading.Event()
        self.t0 = time.monotonic()
        self.t_end = None
        self.proc = None

    def push(self, name, payload, final_state=None):
        text = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        with self.cond:
            if self.finished:
                return False
            self.events.append((name, text))
            if final_state:
                self.finished = True
                self.state = final_state
                self.t_end = time.monotonic()
            self.cond.notify_all()
        return True

    def status(self):
        with self.cond:
            end = self.t_end if self.t_end is not None else time.monotonic()
            return {"id": self.id, "api": self.api, "kind": self.kind, "state": self.state, "finished": self.finished,
                    "events": len(self.events), "elapsedMs": int((end - self.t0) * 1000)}


def _died_message(code):
    if code is None:
        return "Python 子进程没有回应。"
    if code == 0:
        return "Python 子进程没有交回结果就退出了（代码里是不是调用了 os._exit？）。"
    if code < 0:
        sig = -code
        if sig == 9:
            return "Python 子进程被系统强行结束了（信号 9）：最常见的原因是内存不够。把数据、网络或 batch 调小再试。"
        if sig == 11:
            return "Python 子进程崩溃了（段错误，信号 11）：多半是底层库（PyTorch / MPS）出了错。可以用 MLLAB_DEVICE=cpu python -m mllab_engine 改用 CPU 再试。"
        return "Python 子进程被信号 %d 结束了。" % sig
    return "Python 子进程意外退出了（退出码 %d）。" % code


class Engine:
    """引擎：配置、令牌、当前的运行；HTTP 服务见 Handler"""

    def __init__(self, port=8765, page=None, token=None, quiet=False, kill_slack_s=10.0, startup_timeout_s=120.0,
                 max_body=MAX_BODY, examples_dir=None):
        self.requested_port = int(port)
        self.page = os.path.abspath(os.path.expanduser(page)) if page else None
        self.token = token or secrets.token_urlsafe(24)
        self.quiet = quiet
        self.kill_slack_s = float(kill_slack_s)
        self.startup_timeout_s = float(startup_timeout_s)
        self.max_body = int(max_body)
        self.examples_dir = examples_dir or os.path.join(PROJECT_DIR, "examples")
        self.lock = threading.Lock()
        self.runs = collections.OrderedDict()
        self.current = None
        self.closing = False
        self.httpd = None
        self.port = None
        self._torch = None
        self._torch_lock = threading.Lock()

    # ---------- 生命周期 ----------
    def bind(self):
        """绑定 127.0.0.1；端口被占用就往后找（最多试 30 个）。port=0 让系统挑一个空闲端口（测试用）"""
        ports = [0] if self.requested_port == 0 else list(range(self.requested_port, self.requested_port + 30))
        last = None
        for p in ports:
            try:
                self.httpd = _HTTPServer(("127.0.0.1", p), Handler)
                break
            except OSError as e:
                if e.errno in (errno.EADDRINUSE, 10048) or getattr(e, "winerror", None) == 10048:
                    last = e
                    continue
                raise
        if self.httpd is None:
            raise last or OSError("没有空闲的端口")
        self.httpd.engine = self
        self.port = self.httpd.server_address[1]
        return self.port

    @property
    def url(self):
        return "http://127.0.0.1:%d/ml/?engine=%s" % (self.port, self.token)

    def serve_forever(self):
        self.httpd.serve_forever(poll_interval=0.25)

    def start_thread(self):
        if self.httpd is None:
            self.bind()
        t = threading.Thread(target=self.serve_forever, name="mllab-http", daemon=True)
        t.start()
        return t

    def close(self):
        self.closing = True
        with self.lock:
            runs = list(self.runs.values())
        for r in runs:
            r.cancel.set()
            if r.proc is not None:
                _kill(r.proc)
            with r.cond:
                r.cond.notify_all()
        if self.httpd is not None:
            try:
                self.httpd.shutdown()
            except Exception:
                pass
            try:
                self.httpd.server_close()
            except Exception:
                pass

    def say(self, text):
        if not self.quiet:
            try:
                print(text, flush=True)
            except (OSError, ValueError):
                pass                   # 终端已经关了：不打印也无妨

    # ---------- 信息 ----------
    def torch_info(self):
        """{available, version, device}；第一次调用时在单独的进程里检查（最多等 90 秒），结果缓存"""
        with self._torch_lock:
            if self._torch is not None:
                return self._torch
            info = {"available": False, "version": None, "device": None}
            if importlib.util.find_spec("torch") is not None:
                try:
                    out = subprocess.run([sys.executable, "-c", TORCH_PROBE], capture_output=True, text=True, timeout=90)
                    line = (out.stdout or "").strip().splitlines()
                    got = json.loads(line[-1]) if line else {}
                    info = {"available": bool(got.get("available")), "version": got.get("version"), "device": got.get("device") if got.get("available") else None}
                    if got.get("error"):
                        info["error"] = got["error"]
                except Exception as e:
                    info = {"available": False, "version": None, "device": None, "error": "%s: %s" % (type(e).__name__, e)}
            self._torch = info
            return info

    def info(self):
        cur = self.current
        return {"version": __version__, "python": "%d.%d.%d" % sys.version_info[:3], "numpy": dist_version("numpy"),
                "torch": self.torch_info(), "cpu_count": os.cpu_count(), "platform": sys.platform,
                "busy": cur is not None, "running": cur.id if cur is not None else None, "maxBodyMB": self.max_body // (1024 * 1024)}

    def page_path(self):
        if self.page:
            return self.page, True
        cands = page_candidates()
        for p in cands:
            if os.path.isfile(p):
                return p, False
        return cands[0], False

    def examples(self):
        """examples/*.py 的列表：文件头的 "# @键 值" 是元数据，接下来的注释是说明"""
        out = []
        d = self.examples_dir
        if not os.path.isdir(d):
            return out
        for fn in sorted(os.listdir(d)):
            if not fn.endswith(".py") or fn.startswith("_"):
                continue
            try:
                with open(os.path.join(d, fn), encoding="utf-8") as f:
                    code = f.read()
            except OSError:
                continue
            meta, docs = {}, []
            for line in code.splitlines()[2:]:
                if not line.startswith("#"):
                    break
                s = line[1:].strip() if len(line) < 2 or line[1] != " " else line[2:].rstrip()
                if s.startswith("@"):
                    key, _, val = s[1:].partition(" ")
                    meta[key.strip()] = val.strip()
                else:
                    docs.append(s)
            try:
                params = json.loads(meta.get("params") or "[]")
            except ValueError:
                params = []
            text = "\n".join(docs).strip()
            split = lambda v: [x.strip() for x in (v or "").split(",") if x.strip()]
            out.append({"id": fn[:-3], "file": fn, "name": meta.get("name") or fn[:-3], "api": meta.get("api") or "supervised",
                        "kinds": split(meta.get("kinds")), "families": split(meta.get("families")), "needs": split(meta.get("needs")),
                        "params": params, "summary": text.split("\n\n")[0].replace("\n", "") if text else "", "docs": text, "code": code})
        return out

    def host_ok(self, host):
        return host in ("127.0.0.1:%d" % self.port, "localhost:%d" % self.port)

    def token_ok(self, given):
        return bool(given) and hmac.compare_digest(str(given).encode("utf-8"), self.token.encode("utf-8"))

    # ---------- 运行 ----------
    def start_run(self, req):
        """检查请求、登记、在后台线程里开子进程。返回 (HTTP 状态码, 回应)"""
        if not isinstance(req, dict):
            return 400, {"error": "请求体应该是一个 JSON 对象。"}
        api = req.get("api")
        if api not in ("supervised", "forecast"):
            return 400, {"error": "api 只能是 supervised 或 forecast。"}
        code = req.get("code")
        if not isinstance(code, str) or not code.strip():
            return 400, {"error": "缺少算法代码（code）。"}
        if len(code) > MAX_CODE:
            return 400, {"error": "算法代码太长了（最多 2 MB）。"}
        params = req.get("params")
        if params is not None and not isinstance(params, dict):
            return 400, {"error": "params 应该是一个对象。"}
        data = req.get("data")
        if not isinstance(data, dict):
            return 400, {"error": "缺少数据（data）。"}
        kind = "forecast" if api == "forecast" else (data.get("kind") or req.get("kind"))
        if api == "supervised" and kind not in ("regression", "classification"):
            return 400, {"error": "监督学习的 kind 只能是 regression 或 classification。"}
        try:
            seed = int(req.get("seed") or 0)
        except (TypeError, ValueError):
            return 400, {"error": "seed 应该是整数。"}
        try:
            budget = float(req.get("budgetMs") or 20000)
            if not math.isfinite(budget) or budget <= 0:
                raise ValueError
        except (TypeError, ValueError):
            return 400, {"error": "budgetMs 应该是正数（毫秒）。"}
        budget = max(1000.0, min(budget, 24 * 3600 * 1000.0))
        job = {"api": api, "kind": kind, "code": code, "params": params or {}, "seed": seed, "budgetMs": budget, "data": data}
        with self.lock:
            if self.closing:
                return 503, {"error": "引擎正在关闭。"}
            if self.current is not None:
                return 409, {"error": "引擎正在运行另一个任务，等它结束或者先取消它。", "running": self.current.id}
            rid = secrets.token_hex(8)
            run = Run(rid, api, kind, budget)
            self.current = run
            self.runs[rid] = run
            while len(self.runs) > KEEP_RUNS:
                old_id, old = next(iter(self.runs.items()))
                if old is run or not old.finished:
                    break
                self.runs.pop(old_id)
        threading.Thread(target=self._supervise, args=(run, job), name="mllab-run-" + rid, daemon=True).start()
        self.say("[运行 %s] 开始：%s / %s，时间预算 %.0f 秒" % (rid, api, kind, budget / 1000))
        return 200, {"id": rid, "events": "/api/run/%s/events" % rid}

    def get_run(self, rid):
        with self.lock:
            return self.runs.get(rid)

    def _finish(self, run, state, name, payload):
        # 先腾出位置再发最后一条事件：页面收到 done / error 之后马上发下一次运行，不会撞上 409
        with self.lock:
            if self.current is run:
                self.current = None
        if run.push(name, payload, final_state=state):
            if state == "done":
                self.say("[运行 %s] 完成，用时 %.1f 秒" % (run.id, time.monotonic() - run.t0))
            else:
                msg = payload.get("message", "") if isinstance(payload, dict) else ""
                if isinstance(payload, str):
                    try:
                        msg = json.loads(payload).get("message", "")
                    except (ValueError, AttributeError):
                        msg = ""
                if state == "cancelled":
                    self.say("[运行 %s] 已取消" % run.id)
                else:
                    self.say("[运行 %s] %s：%s" % (run.id, {"error": "出错", "timeout": "超时"}.get(state, state), str(msg).split("\n")[0][:200]))

    def _supervise(self, run, job):
        ctx = multiprocessing.get_context("spawn")
        rconn, wconn = ctx.Pipe(duplex=False)
        proc = ctx.Process(target=worker.child_main, args=(job, wconn, {"quiet": self.quiet}), name="mllab-run-" + run.id)
        try:
            proc.start()
        except Exception as e:
            try:
                wconn.close()
                rconn.close()
            except Exception:
                pass
            self._finish(run, "error", "error", {"message": "开不了 Python 子进程：%s" % e, "line": 0, "traceback": ""})
            return
        job = None
        wconn.close()          # 服务进程这边不写；关掉自己的这一端，子进程退出时这边才读得到"结束"
        run.proc = proc
        started = time.monotonic()
        hard = None
        try:
            while True:
                if run.cancel.is_set():
                    _kill(proc)
                    self._finish(run, "cancelled", "error", {"message": "已取消", "cancelled": True, "line": 0, "traceback": ""})
                    return
                now = time.monotonic()
                if hard is None and now - started > self.startup_timeout_s:
                    _kill(proc)
                    self._finish(run, "timeout", "error", {"message": "Python 子进程启动太慢（%.0f 秒还没准备好），已经停掉。第一次导入 PyTorch 可能很慢，再试一次；仍然这样的话见 README 的常见问题。" % self.startup_timeout_s, "timeout": True, "line": 0, "traceback": ""})
                    return
                if hard is not None and now > hard:
                    _kill(proc)
                    secs = run.budget_ms * 1.5 / 1000 + self.kill_slack_s
                    self._finish(run, "timeout", "error", {"message": "超过 %.0f 秒还没有算完，已经停掉：多半是代码里有死循环，或者训练没有在时间预算用完时停下（用 ctx.time_left() 判断）。" % secs, "timeout": True, "line": 0, "traceback": ""})
                    return
                try:
                    if not rconn.poll(0.05):
                        if not proc.is_alive() and not rconn.poll(0):
                            raise EOFError
                        continue
                    kind, text = rconn.recv()
                except (EOFError, OSError):
                    proc.join(2)
                    if run.cancel.is_set():        # 是我们自己杀的（取消、引擎关闭），不是崩溃
                        self._finish(run, "cancelled", "error", {"message": "已取消", "cancelled": True, "line": 0, "traceback": ""})
                    else:
                        self._finish(run, "error", "error", {"message": _died_message(proc.exitcode), "line": 0, "traceback": "", "crashed": True})
                    return
                if kind == "ready":
                    hard = time.monotonic() + run.budget_ms * 1.5 / 1000 + self.kill_slack_s
                    run.state = "running"
                    run.push("ready", text)
                elif kind == "done":
                    self._finish(run, "done", "done", text)
                    return
                elif kind == "error":
                    self._finish(run, "error", "error", text)
                    return
                else:
                    run.push(kind, text)
        finally:
            with self.lock:
                if self.current is run:
                    self.current = None
            try:
                rconn.close()
            except Exception:
                pass
            proc.join(5)
            if proc.is_alive():
                _kill(proc)


def _kill(proc):
    try:
        if proc.is_alive():
            proc.terminate()
            proc.join(1)
        if proc.is_alive():
            proc.kill()
            proc.join(1)
    except Exception:
        pass


class _HTTPServer(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    engine = None

    def handle_error(self, request, client_address):
        # 浏览器中途断开之类的错误不必打一大段调用栈
        exc = sys.exc_info()[1]
        if isinstance(exc, (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, TimeoutError)):
            return
        super().handle_error(request, client_address)


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "mllab-engine/" + __version__
    sys_version = ""
    protocol_version = "HTTP/1.0"

    def log_message(self, fmt, *args):     # 不打印每一条访问记录
        pass

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")

    def do_HEAD(self):
        self._handle("HEAD")

    def do_OPTIONS(self):
        self._handle("OPTIONS")

    def do_PUT(self):
        self._handle("PUT")

    def do_DELETE(self):
        self._handle("DELETE")

    def do_PATCH(self):
        self._handle("PATCH")

    # ---------- 回应 ----------
    def _base_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")

    def _drain(self):
        """回应之前把没读的请求体读掉（不大的话）：带着没读完的数据关连接，系统会发 RST，浏览器可能连回应都收不到"""
        if getattr(self, "_consumed", True):
            return
        self._consumed = True
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return
        if 0 < n <= 16 * 1024 * 1024:
            while n > 0:
                b = self.rfile.read(min(n, 1 << 20))
                if not b:
                    break
                n -= len(b)

    def _send(self, status, body, ctype, extra=None):
        self._drain()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self._base_headers()
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status, obj, extra=None):
        self._send(status, json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8", extra)

    def _handle(self, method):
        self._consumed = False
        try:
            self._route(method)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        except Exception as e:
            self.server.engine.say("引擎内部出错：%s: %s" % (type(e).__name__, e))
            try:
                self._json(500, {"error": "引擎内部出错：%s: %s" % (type(e).__name__, e)})
            except Exception:
                pass

    # ---------- 路由 ----------
    def _route(self, method):
        eng = self.server.engine
        url = urlsplit(self.path)
        path = url.path
        host = (self.headers.get("Host") or "").strip().lower()
        if not eng.host_ok(host):
            return self._json(403, {"error": "Host 不对：引擎只接受 127.0.0.1:%d 或 localhost:%d（防 DNS 重绑定）。" % (eng.port, eng.port)})
        origin = self.headers.get("Origin")
        if origin is not None and origin.strip().lower() != "http://" + host:
            return self._json(403, {"error": "Origin 不对：只接受来自本引擎自己的页面的请求。"})
        q = parse_qs(url.query)
        if path.startswith("/api/"):
            site = (self.headers.get("Sec-Fetch-Site") or "").strip().lower()
            if site in ("cross-site", "same-site"):
                return self._json(403, {"error": "只接受来自本引擎自己的页面的请求。"})
            given = self.headers.get("X-QLML-Token")
            m = RUN_PATH.match(path)
            if given is None and method == "GET" and m and m.group(2) == "/events":
                given = (q.get("token") or [None])[0]     # EventSource 设不了请求头，所以事件流也接受 ?token=
            if not eng.token_ok(given):
                return self._json(401, {"error": "缺少令牌，或者令牌不对（请求头 X-QLML-Token）。引擎每次启动都会换一个新令牌：用终端里打印的网址重新打开页面。"})
            return self._api(method, path, q, m)
        if method not in ("GET", "HEAD"):
            return self._json(405, {"error": "不支持这个请求方法。"}, {"Allow": "GET"})
        if path == "/":
            return self._send(302, b"", "text/plain; charset=utf-8", {"Location": "/ml/" + ("?" + url.query if url.query else "")})
        if path == "/ml":
            return self._send(301, b"", "text/plain; charset=utf-8", {"Location": "/ml/" + ("?" + url.query if url.query else "")})
        if path in ("/ml/", "/ml/index.html"):
            return self._page(q)
        return self._send(404, "没有这个页面。".encode("utf-8"), "text/plain; charset=utf-8")

    def _page(self, q):
        eng = self.server.engine
        path, explicit = eng.page_path()
        extra = {"X-Frame-Options": "DENY"}       # 别的网站不能把这一页嵌进去（防点击劫持：这一页里有令牌）
        try:
            with open(path, encoding="utf-8") as f:
                html = f.read()
        except OSError:
            return self._send(200, missing_page_html(path, explicit).encode("utf-8"), "text/html; charset=utf-8", extra)
        authed = eng.token_ok((q.get("engine") or [""])[0])
        cfg = {"token": eng.token if authed else None, "version": __version__}
        if not authed:
            cfg["needToken"] = True
        script = "<script>window.QLML_ENGINE=%s;</script>" % json.dumps(cfg, separators=(",", ":"))
        m = HEAD_TAG.search(html)
        html = html[:m.end()] + script + html[m.end():] if m else script + html
        return self._send(200, html.encode("utf-8"), "text/html; charset=utf-8", extra)

    def _read_body(self):
        eng = self.server.engine
        length = self.headers.get("Content-Length")
        if length is None:
            self._json(411, {"error": "请求要带 Content-Length。"})
            return None
        try:
            n = int(length)
            if n < 0:
                raise ValueError
        except ValueError:
            self._json(400, {"error": "Content-Length 不对。"})
            return None
        if n > eng.max_body:
            self.close_connection = True
            self._json(413, {"error": "请求太大（%.0f MB），最多 %.0f MB：把数据集调小一些。" % (n / 2 ** 20, eng.max_body / 2 ** 20)})
            return None
        self._consumed = True
        chunks, left = [], n
        while left > 0:
            b = self.rfile.read(min(left, 1 << 20))
            if not b:
                break
            chunks.append(b)
            left -= len(b)
        if left:
            self._json(400, {"error": "请求体没有收全。"})
            return None
        return b"".join(chunks)

    def _api(self, method, path, q, m):
        eng = self.server.engine
        if path == "/api/info":
            if method != "GET":
                return self._json(405, {"error": "只能 GET。"}, {"Allow": "GET"})
            return self._json(200, eng.info())
        if path == "/api/examples":
            if method != "GET":
                return self._json(405, {"error": "只能 GET。"}, {"Allow": "GET"})
            return self._json(200, {"examples": eng.examples()})
        if path == "/api/run":
            if method != "POST":
                return self._json(405, {"error": "只能 POST。"}, {"Allow": "POST"})
            body = self._read_body()
            if body is None:
                return None
            try:
                req = json.loads(body.decode("utf-8"))
            except (UnicodeDecodeError, ValueError) as e:
                return self._json(400, {"error": "请求体不是合法的 JSON：%s" % e})
            body = None
            status, obj = eng.start_run(req)
            return self._json(status, obj)
        if m:
            run = eng.get_run(m.group(1))
            if run is None:
                return self._json(404, {"error": "没有这次运行（引擎重启过，或者它太旧已经被清掉了）。"})
            sub = m.group(2)
            if sub == "/events":
                if method != "GET":
                    return self._json(405, {"error": "只能 GET。"}, {"Allow": "GET"})
                return self._events(run, q)
            if sub == "/cancel":
                if method != "POST":
                    return self._json(405, {"error": "只能 POST。"}, {"Allow": "POST"})
                run.cancel.set()
                return self._json(200, {"ok": True, "state": run.state})
            if method != "GET":
                return self._json(405, {"error": "只能 GET。"}, {"Allow": "GET"})
            return self._json(200, run.status())
        return self._json(404, {"error": "没有这个接口。"})

    def _events(self, run, q):
        """Server-Sent Events：从第 start 条开始重放，再等新的；最后一条是 done 或 error，之后关闭连接"""
        eng = self.server.engine
        start = 0
        lei = self.headers.get("Last-Event-ID")
        try:
            if lei is not None and lei.strip() != "":
                start = int(lei) + 1
            elif q.get("from"):
                start = int(q["from"][0])
        except ValueError:
            start = 0
        start = max(0, start)
        with run.cond:
            if run.finished and start >= len(run.events):
                return self._send(204, b"", "text/plain; charset=utf-8")   # 都收到了：204 让 EventSource 不再重连
        self._drain()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("X-Accel-Buffering", "no")
        self._base_headers()
        self.end_headers()
        self.close_connection = True
        idx = start
        while True:
            with run.cond:
                if idx >= len(run.events) and not run.finished and not eng.closing:
                    run.cond.wait(15)
                batch = run.events[idx:]
                done = run.finished
            if batch:
                out = "".join("id: %d\nevent: %s\ndata: %s\n\n" % (idx + j, name, text) for j, (name, text) in enumerate(batch))
                self.wfile.write(out.encode("utf-8"))
                idx += len(batch)
            elif not done and not eng.closing:
                self.wfile.write(b": ping\n\n")      # 注释行：保持连接，不是事件
            if done or eng.closing:
                return None
