# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""页面 ⇄ 引擎之间的数组编码。

JSON 里放不下二进制，几万个数写成十进制文本又慢又大，所以数组一律写成
    {"$b64": "<小端字节的 base64>", "dtype": "f8" | "f4" | "i4" | "u1", "shape": [..]}
对应 JavaScript 的 Float64Array / Float32Array / Int32Array / Uint8Array 的 .buffer。
shape 可以省略（当作一维）。普通的 JSON 数组也收（由使用的一方自己转成 numpy）。

这个模块在服务进程里也会被导入，服务进程不导入 numpy（保持轻快），所以 numpy 只在用到时才导入。"""
import base64
import json
import math

# dtype 代号 → numpy 的类型串（都是小端）
DTYPES = {"f8": "<f8", "f4": "<f4", "i4": "<i4", "u1": "|u1"}
ITEMSIZE = {"f8": 8, "f4": 4, "i4": 4, "u1": 1}


class CodecError(ValueError):
    """编码不对：消息是给人看的中文"""


def _np():
    import numpy as np
    return np


def decode_array(obj):
    """{"$b64", "dtype", "shape"} → numpy 数组（只读的视图之外再复制一份，保证可写、内存对齐）"""
    np = _np()
    code = obj.get("dtype")
    if code not in DTYPES:
        raise CodecError("数组的 dtype 只能是 f8、f4、i4、u1 之一，收到的是 %r。" % (code,))
    try:
        raw = base64.b64decode(obj.get("$b64") or "", validate=True)
    except (ValueError, TypeError) as e:
        raise CodecError("数组的 base64 编码不对：%s" % e)
    size = ITEMSIZE[code]
    if len(raw) % size:
        raise CodecError("数组的字节数 %d 不是 %d 的倍数（dtype %s）。" % (len(raw), size, code))
    count = len(raw) // size
    shape = obj.get("shape")
    if shape is None:
        shape = [count]
    if not isinstance(shape, (list, tuple)) or not all(isinstance(s, int) and not isinstance(s, bool) and s >= 0 for s in shape):
        raise CodecError("数组的 shape 应该是非负整数的列表，收到的是 %r。" % (shape,))
    want = 1
    for s in shape:
        want *= s
    if want != count:
        raise CodecError("数组的 shape %r 要 %d 个数，实际有 %d 个。" % (list(shape), want, count))
    native = {"f8": np.float64, "f4": np.float32, "i4": np.int32, "u1": np.uint8}[code]
    arr = np.frombuffer(raw, dtype=DTYPES[code]).astype(native, copy=True)   # 复制：可写、按本机字节序
    return arr.reshape(tuple(shape))


def _hook(d):
    if "$b64" in d:
        return decode_array(d)
    return d


def loads(text):
    """JSON 文本 → Python 对象；其中的 {"$b64": …} 变成 numpy 数组"""
    return json.loads(text, object_hook=_hook)


def decode(obj):
    """已经解析好的 JSON 对象（字典 / 列表）里的 {"$b64": …} 递归地换成 numpy 数组"""
    if isinstance(obj, dict):
        if "$b64" in obj:
            return decode_array(obj)
        return {k: decode(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [decode(v) for v in obj]
    return obj


def _code_for(arr):
    """numpy 数组该用哪种代号：浮点 → f8（float32 / float16 → f4），整数 → i4（放不下就 f8），布尔 → u1"""
    np = _np()
    k = arr.dtype.kind
    if k == "f":
        return "f4" if arr.dtype.itemsize <= 4 else "f8"
    if k == "b":
        return "u1"
    if k == "u" and arr.dtype.itemsize == 1:
        return "u1"
    if k in "iu":
        if arr.size == 0:
            return "i4"
        lo, hi = int(arr.min()), int(arr.max())
        return "i4" if -2 ** 31 <= lo and hi < 2 ** 31 else "f8"
    if k == "c":
        raise CodecError("复数数组没法传给页面。")
    return "f8"


def typed(arr, code=None):
    """把数组按指定代号（或自动选的）编码成 {"$b64", "dtype", "shape"}"""
    np = _np()
    arr = np.asarray(arr)
    if arr.dtype == object:
        arr = arr.astype(np.float64)
    code = code or _code_for(arr)
    if code not in DTYPES:
        raise CodecError("未知的 dtype 代号 %r。" % (code,))
    a = np.ascontiguousarray(arr, dtype=DTYPES[code])
    return {"$b64": base64.b64encode(a.tobytes()).decode("ascii"), "dtype": code, "shape": [int(s) for s in a.shape]}


class Typed:
    """标记：这个数组用指定的代号编码（例如概率用 f8、快照用 f4）"""
    __slots__ = ("arr", "code")

    def __init__(self, arr, code):
        self.arr = arr
        self.code = code


def to_jsonable(obj, depth=0):
    """Python 对象 → 能 json.dumps 的对象：numpy 数组 → {"$b64"…}；numpy 标量 → Python 数；NaN / ±∞ → null
    （JSON 里没有 NaN，JavaScript 的 JSON.parse 遇到会出错）"""
    if depth > 64:
        raise CodecError("结果嵌套得太深了。")
    if obj is None or isinstance(obj, (bool, str)):
        return obj
    if isinstance(obj, int):
        return obj
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, Typed):
        return typed(obj.arr, obj.code)
    if isinstance(obj, dict):
        return {str(k): to_jsonable(v, depth + 1) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(v, depth + 1) for v in obj]
    mod = type(obj).__module__ or ""
    if mod.startswith("numpy"):
        np = _np()
        if isinstance(obj, np.ndarray):
            return typed(obj)
        if isinstance(obj, np.generic):
            return to_jsonable(obj.item(), depth + 1)
    return str(obj)


def dumps(obj):
    """Python 对象 → 紧凑的 JSON 文本（不含换行，可以直接放进 SSE 的一行 data:）"""
    return json.dumps(to_jsonable(obj), ensure_ascii=False, separators=(",", ":"), allow_nan=False)
