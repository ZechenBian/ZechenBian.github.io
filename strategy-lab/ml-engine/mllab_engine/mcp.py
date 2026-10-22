# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""本机引擎的 MCP 模式：python -m mllab_engine --mcp

给 Claude 桌面版用。在 Claude 里打开的机器学习实验室不能自己联网，连不上 127.0.0.1 上的 HTTP 引擎；
但它可以请 Claude 桌面版调用"本地 MCP 服务器"的工具（每次都要你允许）。把这个命令加进桌面版的
claude_desktop_config.json（python -m mllab_engine --claude-config 会打印要加的那一段），桌面版启动时会把引擎
作为子进程拉起来，经标准输入 / 输出说 MCP（JSON-RPC 2.0，一行一条消息）。

和 HTTP 模式比：
  * 不监听任何端口，也就不需要令牌：只有启动它的 Claude 桌面版能和它说话；
  * 运行算法、替页面取数据用的是同一份代码（Engine.start_run、fetcher.fetch）；
  * 工具的结果有大小限制，大的东西分块：取来的数据先压缩再按块读（read_blob），运行的请求分块交（run_upload），
    事件按条取（run_events，太长的一条分几次）。

实现的是带 initialize 握手的那一代协议（2024-11-05 到 2025-11-25）。2026-07-28 起的客户端会先发 server/discover 试探，
这里回答"没有这个方法"，按规范它们就会退回 initialize 握手。
标准输出只能写 MCP 消息：启动时把 1 号文件描述符换成标准错误，别的东西（用户代码的 print、库的警告、子进程）写的都进标准错误，
桌面版把它记在 mcp-server-mllab-engine.log 里。"""
import base64
import collections
import gzip
import json
import math
import os
import secrets
import sys
import threading
import time

from . import __version__, fetcher

PROTOCOLS = ("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05")
CHUNK = 384 * 1024                 # read_blob 一块的原始字节数（base64 以后约 512 KB）
EVENT_BUDGET = 480 * 1024          # run_events 一次带回的事件文字最多这么多字符；更长的一条分几次
MAX_WAIT_MS = 20000                # run_events 最多等多久（桌面版等一个工具的回答大约两分钟）
MAX_UPLOAD = 200 * 1024 * 1024     # 一次运行的请求最大 200 MB（和 HTTP 模式一样）
KEEP_BLOBS = 4
KEEP_UPLOADS = 4

READ = {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": False}
TOOLS = [
    {"name": "info", "title": "本机引擎的信息",
     "description": "机器学习实验室的本机 Python 引擎：版本、Python、numpy、PyTorch 和计算设备、CPU 核数、是否正在运行。只读。",
     "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}, "annotations": READ},
    {"name": "examples", "title": "示例算法",
     "description": "引擎附带的示例算法（Python 代码、参数表、说明），机器学习实验室把它们放进“Python（本机引擎）”一组。只读。",
     "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}, "annotations": READ},
    {"name": "fetch_url", "title": "从网上取一个数据文件",
     "description": "替机器学习实验室从网上取一个数据文件（CSV、JSON 之类）。只取公网地址（不取本机、局域网），不带任何登录信息，最多 50 MB。"
                    "回答里是第一块数据（base64，引擎可能先 gzip 压缩过，见 packed），其余的块用 read_blob 取。",
     "inputSchema": {"type": "object", "properties": {"url": {"type": "string", "description": "http:// 或 https:// 开头的地址"}}, "required": ["url"], "additionalProperties": False},
     "annotations": {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": True}},
    {"name": "read_blob", "title": "读取取来的数据的一块",
     "description": "fetch_url 取来的数据的第 index 块（base64）。只读。",
     "inputSchema": {"type": "object", "properties": {"id": {"type": "string"}, "index": {"type": "integer", "minimum": 0}}, "required": ["id", "index"], "additionalProperties": False},
     "annotations": READ},
    {"name": "run_upload", "title": "交一次运行的请求（分块）",
     "description": "把一次运行的请求（JSON 文字）分块交给引擎：只存在引擎的内存里，不执行任何东西。第一块不带 upload，之后带上回答里的 upload。",
     "inputSchema": {"type": "object", "properties": {"upload": {"type": ["string", "null"]}, "text": {"type": "string"}}, "required": ["text"], "additionalProperties": False},
     "annotations": READ},
    {"name": "run_start", "title": "运行算法",
     "description": "在这台电脑上运行机器学习实验室发来的 Python 算法：新开一个子进程，权限和你自己一样（能读写你的文件）。只运行你看过、信得过的代码。"
                    "请求放在 job 里，或者先用 run_upload 分块交、这里给 upload。回答是这次运行的 id，进度用 run_events 取。",
     "inputSchema": {"type": "object", "properties": {"upload": {"type": "string"}, "job": {"type": "object"}}, "additionalProperties": False},
     "annotations": {"readOnlyHint": False, "destructiveHint": False, "openWorldHint": False}},
    {"name": "run_events", "title": "运行的进度",
     "description": "一次运行的事件（ready、progress、snap、log、done、error），从第 from 条起；没有新事件时最多等 waitMs 毫秒。只读。",
     "inputSchema": {"type": "object", "properties": {"id": {"type": "string"}, "from": {"type": "integer", "minimum": 0}, "part": {"type": "integer", "minimum": 0},
                                                      "waitMs": {"type": "integer", "minimum": 0, "maximum": MAX_WAIT_MS}}, "required": ["id"], "additionalProperties": False},
     "annotations": READ},
    {"name": "run_cancel", "title": "停止运行",
     "description": "停止一次运行（结束它的子进程）。",
     "inputSchema": {"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"], "additionalProperties": False},
     "annotations": {"readOnlyHint": False, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False}},
]
INSTRUCTIONS = ("这是机器学习实验室（策略实验室的一部分）的本机 Python 引擎，主要给在 Claude 里打开的实验室页面用："
                "页面经这些工具在你的电脑上运行算法、替页面从网上取数据文件。run_start 会执行代码，权限和你自己一样。")


class ToolError(Exception):
    """工具报错：message 是一句中文，页面原样显示"""


def _b64(b):
    return base64.b64encode(b).decode("ascii")


class McpServer:
    """一个 MCP 会话：读一行、答一行。tools/call 在各自的线程里做（取数据、等事件都可能要等一会儿）"""

    def __init__(self, out, engine=None):
        if engine is None:
            from .server import Engine
            engine = Engine(port=0)
        self.out = out
        self.eng = engine
        self.wlock = threading.Lock()
        self.lock = threading.Lock()
        self.blobs = collections.OrderedDict()
        self.uploads = collections.OrderedDict()
        self.cancelled = set()
        self.threads = []

    # ---------- 收发 ----------
    def send(self, msg):
        line = json.dumps(msg, ensure_ascii=False, separators=(",", ":")) + "\n"
        with self.wlock:
            try:
                self.out.write(line.encode("utf-8"))
                self.out.flush()
            except (OSError, ValueError):
                pass                   # 桌面版已经关了

    def reply(self, mid, result=None, error=None):
        with self.lock:
            if mid in self.cancelled:          # 客户端取消了这个请求：规范要求不再回答
                self.cancelled.discard(mid)
                return
        msg = {"jsonrpc": "2.0", "id": mid}
        if error is not None:
            msg["error"] = error
        else:
            msg["result"] = result
        self.send(msg)

    def handle_line(self, raw):
        raw = raw.strip()
        if not raw:
            return
        try:
            msg = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
        except (UnicodeDecodeError, ValueError) as e:
            self.send({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error: %s" % e}})
            return
        if isinstance(msg, list):              # 旧版协议允许批量
            for m in msg:
                self.handle(m)
            return
        self.handle(msg)

    def handle(self, msg):
        if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0":
            self.send({"jsonrpc": "2.0", "id": msg.get("id") if isinstance(msg, dict) else None, "error": {"code": -32600, "message": "Invalid Request"}})
            return
        method = msg.get("method")
        if method is None:                     # 客户端发来的回答（这里从不向客户端发请求）：不理
            return
        params = msg.get("params") if isinstance(msg.get("params"), dict) else {}
        if "id" not in msg:                    # 通知
            if method == "notifications/cancelled":
                rid = params.get("requestId")
                if rid is not None:
                    with self.lock:
                        self.cancelled.add(rid)
            return
        mid = msg["id"]
        if method == "initialize":
            want = params.get("protocolVersion")
            self.reply(mid, {"protocolVersion": want if want in PROTOCOLS else PROTOCOLS[0],
                             "capabilities": {"tools": {"listChanged": False}},
                             "serverInfo": {"name": "mllab-engine", "title": "机器学习实验室 · 本机引擎", "version": __version__},
                             "instructions": INSTRUCTIONS})
        elif method == "ping":
            self.reply(mid, {})
        elif method == "tools/list":
            self.reply(mid, {"tools": TOOLS})
        elif method == "tools/call":
            t = threading.Thread(target=self._call, args=(mid, params), name="mllab-mcp-call", daemon=True)
            t.start()
            self.threads = [x for x in self.threads if x.is_alive()] + [t]
        else:                                  # 包括 server/discover：这是老一代的服务器
            self.reply(mid, error={"code": -32601, "message": "Method not found: %s" % method})

    def _call(self, mid, params):
        name = params.get("name")
        args = params.get("arguments") or {}
        fn = getattr(self, "t_" + str(name), None) if isinstance(name, str) and name.isidentifier() else None
        if fn is None or not any(t["name"] == name for t in TOOLS):
            self.reply(mid, error={"code": -32602, "message": "Unknown tool: %s" % name})
            return
        if not isinstance(args, dict):
            self.reply(mid, error={"code": -32602, "message": "arguments must be an object"})
            return
        try:
            out = fn(args, mid)
            self.reply(mid, {"content": [{"type": "text", "text": json.dumps(out, ensure_ascii=False, separators=(",", ":"))}], "isError": False})
        except ToolError as e:
            self.reply(mid, {"content": [{"type": "text", "text": str(e)}], "isError": True})
        except Exception as e:                 # 引擎自己的 bug：也作为工具的错误报回去，会话不断
            self.eng.say("MCP 工具 %s 出错：%s: %s" % (name, type(e).__name__, e))
            self.reply(mid, {"content": [{"type": "text", "text": "引擎内部出错：%s: %s" % (type(e).__name__, e)}], "isError": True})

    def serve(self, inp):
        """从 inp（二进制流）一行一行地读，直到对方关掉"""
        try:
            for raw in iter(inp.readline, b""):
                self.handle_line(raw)
        finally:
            self.eng.close()

    # ---------- 工具 ----------
    def t_info(self, args, mid):
        out = self.eng.info()
        out["mode"] = "mcp"
        return out

    def t_examples(self, args, mid):
        return {"examples": self.eng.examples()}

    def t_fetch_url(self, args, mid):
        url = args.get("url")
        if not isinstance(url, str) or not url.strip():
            raise ToolError("要给 url。")
        try:
            r = fetcher.fetch(url, version=__version__)
        except fetcher.FetchError as e:
            raise ToolError(str(e))
        data, packed = r["data"], None
        is_gz = data[:2] == b"\x1f\x8b"
        is_zip = data[:4] == b"PK\x03\x04"
        if not is_gz and not is_zip and len(data) > 64 * 1024:   # 文字压缩得很好：传得快
            z = gzip.compress(data, 6)
            if len(z) < len(data) * 0.9:
                data, packed = z, "gzip"
        bid = secrets.token_hex(8)
        with self.lock:
            self.blobs[bid] = data
            while len(self.blobs) > KEEP_BLOBS:
                self.blobs.popitem(last=False)
        chunks = max(1, int(math.ceil(len(data) / float(CHUNK))))
        self.eng.say("取数据：%s（%.1f MB）" % (r["url"], r["bytes"] / 2 ** 20))
        return {"id": bid, "url": r["url"], "status": r["status"], "contentType": r["contentType"], "bytes": r["bytes"], "size": len(data),
                "packed": packed, "chunks": chunks, "index": 0, "data": _b64(data[:CHUNK])}

    def t_read_blob(self, args, mid):
        bid, idx = args.get("id"), args.get("index")
        with self.lock:
            data = self.blobs.get(bid) if isinstance(bid, str) else None
        if data is None:
            raise ToolError("这份数据已经不在引擎里了（引擎只留最近 %d 份，或者重启过）：重新取一次。" % KEEP_BLOBS)
        chunks = max(1, int(math.ceil(len(data) / float(CHUNK))))
        if not isinstance(idx, int) or isinstance(idx, bool) or not (0 <= idx < chunks):
            raise ToolError("index 要在 0 到 %d 之间。" % (chunks - 1))
        return {"id": bid, "index": idx, "chunks": chunks, "data": _b64(data[idx * CHUNK:(idx + 1) * CHUNK])}

    def t_run_upload(self, args, mid):
        text, up = args.get("text"), args.get("upload")
        if not isinstance(text, str):
            raise ToolError("text 应该是字符串。")
        with self.lock:
            if up is None:
                up = secrets.token_hex(8)
                self.uploads[up] = [0, []]
                while len(self.uploads) > KEEP_UPLOADS:
                    self.uploads.popitem(last=False)
            rec = self.uploads.get(up) if isinstance(up, str) else None
            if rec is None:
                raise ToolError("没有这次上传（引擎重启过，或者它太旧被清掉了）：重新运行一次。")
            rec[0] += len(text.encode("utf-8"))
            if rec[0] > MAX_UPLOAD:
                self.uploads.pop(up, None)
                raise ToolError("请求太大（超过 %d MB）：把数据集调小一些。" % (MAX_UPLOAD // 2 ** 20))
            rec[1].append(text)
            return {"upload": up, "received": rec[0]}

    def t_run_start(self, args, mid):
        if isinstance(args.get("job"), dict):
            req = args["job"]
        elif isinstance(args.get("upload"), str):
            with self.lock:
                rec = self.uploads.pop(args["upload"], None)
            if rec is None:
                raise ToolError("没有这次上传（引擎重启过，或者它太旧被清掉了）：重新运行一次。")
            try:
                req = json.loads("".join(rec[1]))
            except ValueError as e:
                raise ToolError("交来的请求不是合法的 JSON：%s" % e)
        else:
            raise ToolError("要给 job，或者先用 run_upload 交请求、再给 upload。")
        status, obj = self.eng.start_run(req)
        if status != 200:
            raise ToolError(obj.get("error") or ("引擎拒绝了这次运行（%d）。" % status))
        return {"id": obj["id"]}

    def t_run_events(self, args, mid):
        rid = args.get("id")
        run = self.eng.get_run(rid) if isinstance(rid, str) else None
        if run is None:
            raise ToolError("没有这次运行（引擎重启过，或者它太旧已经被清掉了）。")
        start = args.get("from") or 0
        part = args.get("part") or 0
        if not isinstance(start, int) or not isinstance(part, int) or start < 0 or part < 0:
            raise ToolError("from、part 应该是非负整数。")
        wait = args.get("waitMs")
        wait = MAX_WAIT_MS if not isinstance(wait, (int, float)) else max(0, min(MAX_WAIT_MS, wait))
        deadline = time.monotonic() + wait / 1000.0
        with run.cond:
            while start >= len(run.events) and not run.finished and not self.eng.closing:
                left = deadline - time.monotonic()
                with self.lock:
                    gone = mid in self.cancelled
                if left <= 0 or gone:
                    break
                run.cond.wait(min(left, 0.5))
            evs = list(run.events)
            finished = run.finished
            state = run.state
        out, size, i, p = [], 0, start, part
        while i < len(evs):
            name, text = evs[i]
            if p > 0 or len(text) > EVENT_BUDGET:          # 很长的一条（多半是 done 里的预测值）：分几次带回去
                parts = int(math.ceil(len(text) / float(EVENT_BUDGET)))
                if out:
                    break
                out.append({"i": i, "name": name, "text": text[p * EVENT_BUDGET:(p + 1) * EVENT_BUDGET], "part": p, "parts": parts})
                if p + 1 < parts:
                    p += 1
                else:
                    i, p = i + 1, 0
                break
            if out and size + len(text) > EVENT_BUDGET:
                break
            out.append({"i": i, "name": name, "text": text})
            size += len(text)
            i += 1
        return {"events": out, "next": i, "part": p, "finished": bool(finished and i >= len(evs) and p == 0), "state": state}

    def t_run_cancel(self, args, mid):
        rid = args.get("id")
        run = self.eng.get_run(rid) if isinstance(rid, str) else None
        if run is None:
            raise ToolError("没有这次运行。")
        run.cancel.set()
        return {"ok": True, "state": run.state}


def claude_config():
    """要加进 Claude 桌面版 claude_desktop_config.json 的那一段：用现在这个 Python（装着 numpy、PyTorch 的那个）"""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return {"mcpServers": {"mllab-engine": {"command": sys.executable, "args": ["-m", "mllab_engine", "--mcp"], "env": {"PYTHONPATH": root}}}}


def main():
    """标准输出只留给 MCP：复制一份 1 号描述符自己用，再把 1 号指向标准错误"""
    out = os.fdopen(os.dup(sys.stdout.fileno()), "wb", buffering=0)
    try:
        sys.stdout.flush()
    except (OSError, ValueError):
        pass
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    sys.stdout = sys.stderr
    inp = os.fdopen(os.dup(sys.stdin.fileno()), "rb")
    srv = McpServer(out)
    print("机器学习实验室 · 本机引擎 %s（MCP 模式，Python %d.%d.%d）" % ((__version__,) + sys.version_info[:3]), file=sys.stderr, flush=True)
    try:
        srv.serve(inp)
    except KeyboardInterrupt:
        pass
    return 0
