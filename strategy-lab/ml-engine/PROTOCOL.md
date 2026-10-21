<!-- Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。 -->
<!-- Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。 -->
# 本机引擎的接口（页面 ⇄ 引擎）

给写页面这一侧客户端的人看。引擎版本 0.1.0。所有 JSON 都是 UTF-8；所有字段名区分大小写。
算法这一侧的 Python 接口在 [README.md](README.md#写一个-python-算法)；第一期的结果格式在 [src/ml/DESIGN.md](../src/ml/DESIGN.md) §5。

## 0. 分工（最要紧的一条）

**引擎不算任何指标。** 页面在自己的线程里生成数据、做划分（同第一期，`ml-data` 任务），把训练集、验证集和测试集的**输入**发给引擎
（**不发测试集的 y**）；引擎执行 `fit`、`predict`（或 `forecast`），把**原始的预测值**交回来；页面再用第一期同一份 JavaScript
（`QL.mlstats`：`metrics`、`perExample`、`baselinePred` …）打分、算基线、理论最优、配对检验，拼成 DESIGN.md §5 的结果对象。
这样指标的定义只有一处。

一次运行的时序：

```
页面                                   引擎
 │  POST /api/run {api, code, data…}  →│  检查请求，登记，开子进程
 │← 200 {id}                           │
 │  GET /api/run/<id>/events  (SSE)   →│
 │← event: ready                       │  子进程导入好 numpy（和 PyTorch），开始执行用户代码
 │← event: progress {phase:"data"}     │
 │← event: progress {phase:"fit"} …    │  ctx.report（约每秒 8 次）
 │← event: snap …                      │  ctx.snapshot（引擎当场在 data.grid 上调用 predict）
 │← event: log …                       │  ctx.log / print
 │← event: progress {phase:"eval"}     │  在训练 / 验证 / 测试的输入上 predict
 │← event: done {result}  或  error    │  连接随即关闭
 │  页面用 result.pred 和自己手里的真值打分
```

## 1. 连接

* 引擎只监听 `127.0.0.1`。启动时打印的网址形如 `http://127.0.0.1:8765/ml/?engine=<令牌>`（端口被占用时会往后挪，令牌每次启动都换）。
* 页面就由引擎在 `/ml/` 提供，所以页面和接口**同源**，请求用相对路径（`/api/info`）即可。引擎**不发任何 CORS 头**：别的来源（包括 claude.ai 上发布的那一份页面、`file://`、别的端口）都调不了引擎。
* **令牌注入**：引擎在页面的 `<head>` 后面紧接着插入一段
  ```html
  <script>window.QLML_ENGINE={"token":"<令牌>","version":"0.1.0"};</script>
  ```
  只有网址里带着正确的 `?engine=<令牌>` 时才填令牌；否则是 `{"token":null,"version":"0.1.0","needToken":true}`——这时页面应提示"请用引擎终端里打印的网址打开"。
  （这是为了同一台电脑上的其他用户：他们能连上 127.0.0.1，但不知道令牌，就拿不到能执行代码的权限。）页面**不要**把 `?engine=` 从地址栏里删掉，否则刷新以后就没有令牌了。
  页面没有 `window.QLML_ENGINE` 就说明不是从引擎打开的：照第一期的方式只用浏览器线程。
* 每个 `/api/*` 请求都要带请求头 `X-QLML-Token: <令牌>`。唯一的例外是事件流 `GET /api/run/<id>/events`：浏览器的 `EventSource` 设不了请求头，所以它也接受 `?token=<令牌>`。
* 引擎还会拒绝：`Host` 不是 `127.0.0.1:<端口>` 或 `localhost:<端口>` 的请求（403，防 DNS 重绑定，连页面本身也不给）；带了 `Origin` 但不是 `http://<同一个 Host>` 的请求（403，`Origin: null` 也算）；`Sec-Fetch-Site` 是 `cross-site` 或 `same-site` 的 `/api/*` 请求（403）。页面从 `127.0.0.1` 打开就一直用 `127.0.0.1`，从 `localhost` 打开就一直用 `localhost`。
* 所有回应都带 `Cache-Control: no-store`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`（网址里有令牌，不能随 Referer 发给字体服务器、AI 服务商）、`Cross-Origin-Resource-Policy: same-origin`；页面另带 `X-Frame-Options: DENY`。
* 出错时的回应体都是 `{"error": "中文说明"}`：

| 状态码 | 什么时候 |
|---|---|
| 400 | JSON 不合法；缺 `code` / `data`；`api`、`kind`、`seed`、`budgetMs` 不对 |
| 401 | 没带令牌或令牌不对 |
| 403 | Host / Origin / Sec-Fetch-Site 不对 |
| 404 | 没有这个接口，或者没有这次运行（引擎重启过，或者太旧被清掉了：引擎只留最近 8 次） |
| 405 | 请求方法不对（回应里有 `Allow`） |
| 409 | 已经有一次运行在跑：`{"error", "running": "<那次的 id>"}`。引擎一次只跑一个 |
| 411 / 413 | 没有 `Content-Length` / 请求体超过 200 MB |
| 500 | 引擎自己的 bug |
| 503 | 引擎正在关闭 |

## 2. 数组的编码

JSON 里的数组一律写成

```json
{"$b64": "<小端字节序的 base64>", "dtype": "f8", "shape": [n, d]}
```

`dtype` 只有四种：`f8` = Float64Array，`f4` = Float32Array，`i4` = Int32Array，`u1` = Uint8Array。`shape` 可以省略（当作一维）；有的话，各维之积必须等于元素个数。
引擎发回来的数组也是这个样子（预测值 `f8`，快照、模型内部的矩阵 `f4`，下标 `i4`）。请求里也可以直接用普通的 JSON 数组（小东西方便），但大数组请用 base64：快得多、小得多。
JavaScript 的 typed array 在所有常见的机器上都是小端，`.buffer` 直接编码就对：

```js
function b64(t) {          // typed array → base64
  var u8 = new Uint8Array(t.buffer, t.byteOffset, t.byteLength), s = "", CH = 0x8000;
  for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}
function enc(t, shape) {
  var code = t instanceof Float64Array ? "f8" : t instanceof Float32Array ? "f4" : t instanceof Int32Array ? "i4" : t instanceof Uint8Array ? "u1" : null;
  if (!code) throw new Error("只能编码 Float64Array / Float32Array / Int32Array / Uint8Array");
  return { $b64: b64(t), dtype: code, shape: shape || [t.length] };
}
function dec(o) {          // {"$b64"…} → typed array（多维的也按行展开成一维，形状在 o.shape）
  var bin = atob(o.$b64), u8 = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new ({ f8: Float64Array, f4: Float32Array, i4: Int32Array, u1: Uint8Array })[o.dtype](u8.buffer);
}
function reviver(k, v) { return v && typeof v === "object" && typeof v.$b64 === "string" ? dec(v) : v; }
// JSON.parse(text, reviver)
```

JSON 里没有 NaN / ∞：引擎把不是有限数的浮点数写成 `null`。

## 3. `GET /api/info`

```json
{ "version": "0.1.0", "python": "3.12.4", "numpy": "2.1.0",
  "torch": { "available": true, "version": "2.4.0", "device": "mps" },
  "cpu_count": 10, "platform": "darwin", "busy": false, "running": null, "maxBodyMB": 200 }
```

`torch.device` 是 `"mps"`（苹果芯片 GPU）、`"cuda"`、`"cpu"`，没装 PyTorch 时 `available: false`、`version` 和 `device` 都是 `null`（检查失败时另有 `error`）。
`busy` / `running`：现在有没有运行、是哪一次。顶栏的"本机引擎"状态用它。`fetch`：有这一项说明引擎支持 `POST /api/fetch`（§4½）。

## 4. `GET /api/examples`

`ml-engine/examples/*.py` 里的示例算法，页面可以把它们当成"Python 预设"：

```json
{ "examples": [ { "id": "mlp_torch", "file": "mlp_torch.py", "name": "多层感知机（PyTorch，AdamW + 早停）",
    "api": "supervised", "kinds": ["classification", "regression"], "families": ["tabular", "toy", "image"], "needs": ["torch"],
    "params": [ { "key": "hidden", "label": "每层宽度", "def": 64, "min": 4, "max": 1024, "step": 4, "type": "int" }, … ],
    "summary": "说明的第一段", "docs": "整段说明（纯文本，可能有公式字符）", "code": "整个文件的源码" } … ] }
```

`params` 的格式同 DESIGN.md §2（`type`: `int` | `num` | `bool` | `select`）。`needs` 含 `torch` 而 `/api/info` 说没有 PyTorch 时，页面应该把它标成不可用。
元数据来自文件头的注释：版权两行之后，`# @name …`、`# @api …`、`# @kinds a, b`、`# @families …`、`# @needs …`、`# @params <JSON 一行>`，再往下的注释是说明，第一行非注释处结束。

## 4½. `POST /api/fetch`：替页面从网上取一个数据文件

页面"从网上取数据"时，先在浏览器里直接取；网站不允许跨域读取（浏览器拦下）时，改请引擎去取。请求体 `{"url": "https://…"}`，回应：

```json
{ "status": 200, "url": "重定向之后的地址", "contentType": "text/csv", "bytes": 123456,
  "data": {"$b64": "…", "dtype": "u1", "shape": [123456]} }
```

`data` 是原始字节（不解压、不转码：gzip、zip、编码的识别都在页面里做）。出错时 `502 {"error": "中文说明", "status": 网站回的 HTTP 状态或 null}`。

* 只取 `http://`、`https://`；地址里不能带用户名密码。
* 主机名解析出的每个地址都必须是公网地址（`ipaddress.is_global`），每一次重定向的目标也重新检查，最多 5 次重定向。这样页面（或者 AI 给的地址）没法借引擎去访问 127.0.0.1、局域网里的设备、云服务器的元数据地址。测试时设 `MLLAB_ALLOW_PRIVATE_FETCH=1` 放行。
* 不带 Cookie 或任何登录信息；`User-Agent: mllab-engine/<版本>`；最多 50 MB（`/api/info` 的 `fetch.maxMB`），30 秒超时。
* 和运行互不影响：正在跑算法时也可以取。

## 5. `POST /api/run`

请求体（`Content-Type: application/json`，最大 200 MB）：

```json
{ "api": "supervised" | "forecast",
  "kind": "regression" | "classification" | "forecast",
  "code": "Python 源码（最长 2 MB）",
  "params": { "lr": 0.003, … },
  "seed": 12345,
  "budgetMs": 20000,
  "data": { … 见下 } }
```

* `params`：算法参数（页面按预设的 `params` 定义清洗过的值）。算法里拿到的是只读的映射。
* `seed`：整数。引擎用它给 `random`、`numpy.random`（全局的和 `lib.rng`）、`torch.manual_seed` 播种。同样的种子、同样的数据，numpy 算法的结果逐位相同（GPU 上的 PyTorch 不保证逐位相同）。
* `budgetMs`：时间预算，取 `max(1000, budgetMs)`（缺省 20000）。见 §8。
* 回应：`200 {"id": "<16 位十六进制>", "events": "/api/run/<id>/events"}`。之后马上去连事件流（晚一点连也行：事件从头重放）。

### 5.1 监督学习的 `data`

```json
{ "kind": "classification",
  "train": { "X": <f8 [n, d]>, "y": <i4 [n]（分类）| f8 [n]（回归）>, "n": 600, "d": 2, "k": 3,
             "classes": ["甲", "乙", "丙"], "featureNames": ["x1", "x2"] | null,
             "shape": [H, W] | [H, W, C] | null, "tokens": { "vocab": 97 } | null },
  "valid": { 同上 },
  "test":  { "X": <f8 [m, d]>, "n": m },
  "grid":  { "X": <f8 [g, d]>, "kind": "grid2d" } }
```

* 就是第一期 `R.subset(...)` 得到的三份（`index` 不用发）。**`test` 里不要放 `y`**。
* 分类：`y` 是 0 … k−1 的整数，`k` = `train.k`（缺省取 `classes` 的长度），至少 2。回归：`k` 可以是 0 或不写。
* `grid`（可选）：快照用的网格。算法每调用一次 `ctx.snapshot(step, model)`，引擎就在 `grid.X` 上调用一次 `predict`。
  二维数据（`d = 2`、没有 `shape`）时由页面按第一期 `makeSnapper` 的办法生成 48×48 的网格（按行：`q = j·48 + i`），`kind` 写 `"grid2d"`；
  一维回归可以发 200 个点、`kind: "fn1d"`。网格的范围（x0, x1, y0, y1）页面自己记着，拼 §5 的快照时用。
  没有 `grid` 但有 `tokens`、且算法定义了 `inspect` 时，快照是嵌入矩阵（`inspect(model).embedding`），同第一期的 `"embed"`。

### 5.2 时间序列的 `data`

```json
{ "y": <f8 [T]>, "t1": 600, "t2": 800, "H": 1, "season": 12, "freq": "day", "label": "收盘价" }
```

* `y` 是整条序列（滚动原点预测要用到测试段之前的观测，这是滚动预测本身的定义；测试段的打分仍在页面）。至少 30 个点，必须都是有限数。
* `t1`、`t2`：划分点，缺省 `floor(0.6T)`、`floor(0.8T)`；`H`：预测步数，夹到 1 … 50；`season` 缺省 0。和第一期一样要求 `t1 ≥ 20`、`t2 − t1 ≥ 5 + H`、`T − t2 ≥ 5 + H`。
* 原点和第一期 `runForecast` 完全一样（`warm = min(t1 − 2, max(10, 2·season))`）：

| 段 | 原点 t（含两端） | 调用 `update`？ |
|---|---|---|
| train（样本内，只为看过拟合） | `warm … t1 − 1 − H` | 不调用 |
| valid | `t1 − 1 … t2 − 1 − H` | 调用 |
| test | `t2 − 1 … T − 1 − H` | 调用 |

  在原点 t 预测之前，若算法定义了 `update`，把还没喂过的 `y[s]` 依次喂给它（`update(model, y[s])`，s 从上次喂到的地方一直到 t；第一次从 `s = t1` 开始），
  然后调用 `forecast(model, y[0..t], H)`，它预测 `y[t+1 … t+H]`。训练段的原点数可能是 0（序列很短、`season` 很大时）。

## 6. `GET /api/run/<id>/events`（Server-Sent Events）

`Content-Type: text/event-stream`。每条事件：

```
id: 7
event: progress
data: {"phase":"fit","step":12,"point":{"step":12,"loss":0.31,"validLoss":0.35},"n":13}

```

* `id` 是这次运行里从 0 开始连续的编号。断线重连时带 `Last-Event-ID: <收到的最后一个 id>`（`EventSource` 会自动带）或 `?from=<下一个 id>`，引擎从那里接着发；
  已经全部收到、运行也结束了，回 `204`（`EventSource` 见到 204 就不再重连）。
* 没有新事件时每 15 秒发一行注释 `: ping`（保持连接，不是事件）。
* 最后一条一定是 `done` 或 `error`，之后引擎关闭连接。**用 `EventSource` 时收到这两种事件要自己 `es.close()`**，否则它会重连（重连会得到 204，也无妨）。

| 事件 | data |
|---|---|
| `ready` | `{pid, python, numpy, torch, device}`：子进程准备好了，开始执行用户代码（`torch` / `device` 是已经导入的 PyTorch 版本和设备，没导入时是 null） |
| `progress` | `{phase: "data", msg}`；`{phase: "fit", step, point, n}`（`point` = 学习曲线上的一个点，`n` = 目前点数；最多约每秒 8 次）；`{phase: "eval", msg}` |
| `snap` | 网格快照：`{step, kind: "grid2d" \| "fn1d", values: f4}`，`values` 分类时是 g·k 个概率（按行），回归时 g 个值；嵌入快照：`{step, kind: "embed", rows, cols, data: f4}` |
| `log` | `{text}`：`ctx.log(...)` 和 `print(...)` 的每一行（最多 200 行，再多时发一条"（输出太多，后面的不再显示）"） |
| `done` | `{result}`，见 §7 |
| `error` | `{message, line, traceback, type, hint}`，另可能有 `timeout: true`、`cancelled: true`、`crashed: true`，见 §9 |

`snap` 事件每拍一张就发一张；`result.snaps` 是抽稀后留下的那些（最多 60 张，规则同第一期：满 60 张就隔一张扔一张，并加大最小间隔）。

用 `EventSource`（最简单）：

```js
var es = new EventSource("/api/run/" + id + "/events?token=" + encodeURIComponent(QLML_ENGINE.token));
["ready", "progress", "snap", "log"].forEach(function (t) { es.addEventListener(t, function (e) { onEvent(t, JSON.parse(e.data, reviver)); }); });
es.addEventListener("done", function (e) { es.close(); finish(null, JSON.parse(e.data, reviver).result); });
es.addEventListener("error", function (e) {
  if (e.data) { es.close(); finish(JSON.parse(e.data)); }   // 引擎发来的 error 事件
  // 没有 e.data 的是连接断了：EventSource 会自己带着 Last-Event-ID 重连，不用管；引擎没了的话 readyState 会变成 CLOSED
});
```

（注意 `EventSource` 自己的连接错误也叫 `error` 事件，靠有没有 `e.data` 区分。）也可以用 `fetch` 带 `X-QLML-Token` 请求头、自己按空行切分流。

## 7. 结果 `result`

### 7.1 监督学习

```json
{ "api": "supervised", "kind": "classification", "k": 3,
  "split": { "nTrain": 600, "nValid": 200, "nTest": 200 },
  "pred": { "train": <f8>, "valid": <f8>, "test": <f8> },
  "trainIdx": null | <i4 [20000]>,
  "curve": [ { "step": 0, "loss": 1.1, "validLoss": 1.0, "trainMetric": 0.4, "validMetric": 0.45 }, … ],
  "snaps": [ { "step": 0, "kind": "grid2d", "values": <f4> }, … ],
  "log": ["…"], "fitMs": 1234.5, "predUs": 3.2, "size": 4866 | null,
  "internals": { … } | null, "ms": 1300.2,
  "engine": { "python": "3.12.4", "numpy": "2.1.0", "torch": "2.4.0" | null, "device": "mps" | null } }
```

* `pred.*`：回归是 n 个预测值；分类是 n·k 个概率（按行，每行已经检查过、归一化过，规则和第一期 `cleanPred` 一样，见 §9）。
* 训练集超过 20000 行时只在其中 20000 行上预测：第 `floor(q·n/20000)` 行，q = 0 … 19999（同第一期），`trainIdx` 就是这些行号；否则 `trainIdx` 是 null，`pred.train` 对应训练集的全部行。
* `curve`：`ctx.report` 的点，均匀抽稀到最多 2000 个（同第一期 `decimate`）。只保留有限的数值字段。
* `fitMs`：`fit` 的墙钟时间；`predUs`：训练 / 验证 / 测试三次 `predict` 的总时间除以总行数，单位微秒；`ms`：子进程里从 `fit` 开始到结束的时间。
* `size`：参数个数。模型里有整数 `size` 就用它；否则数 PyTorch 模块的参数和 numpy 浮点数组的元素（最多往下找三层）；找不到是 null。
* `internals`：`inspect(model)` 按第一期 `trimInternals` 截断：`layers`（≤ 12 个，`{name, rows, cols, data: f4}`）、`embedding`（`{rows, cols, data: f4, labels}`）、
  `activations`（≤ 8）、`tree`（≤ 2000 个节点）、`coef`（≤ 500）、`text`（≤ 4000 字）、`extra`（能变成 JSON 的部分）；所有数组合计最多 40 万个数。
  比第一期多一条：`rows` / `cols` 没写而 `data` 是二维数组时，用它的形状。模型里有 PyTorch 模块而 `inspect` 没给 `layers` 时，引擎自动补上二维以上的权重。
  `inspect` 出错不算运行失败，只在 `log` 里记一行。

页面拼 DESIGN.md §5 的结果：`metrics` / `loss` / `correct` 用 `pred` 和手里的 `truth`（训练集取 `trainIdx` 那些行）现算；`baseline`、`oracle`、`bayes`、`data` 照第一期在页面算；
`snaps` 补上网格的 `nx, ny, x0, x1, y0, y1, k`；`importance` 对引擎的运行是 null（置换重要性要再调用很多次 `predict`，第二期没做）。

### 7.2 时间序列

```json
{ "api": "forecast", "kind": "forecast", "k": 0, "horizon": 3,
  "split": { "nTrain": 600, "nValid": 200, "nTest": 200, "t1": 600, "t2": 800, "T": 1000 },
  "origins": { "train": [24, 596], "valid": [599, 796], "test": [799, 996] },
  "pred": { "train": <f8 [原点数 × H]>, "valid": <f8>, "test": <f8> },
  "curve": [ … ], "snaps": [], "log": [ … ], "fitMs": 12.3, "predUs": 45.6, "size": 4 | null, "internals": { … } | null, "ms": 80.1, "engine": { … } }
```

`pred.*[q·H + h]` 是原点 `t = origins.*[0] + q` 处对 `y[t+1+h]` 的预测（h = 0 … H−1），顺序同 §5.2 的表。`predUs` 是每个原点的平均时间。
页面照第一期 `runForecast` 的 `evalRange` 自己构造 `truth`、`naive`、`origin`，再算 `metrics`、`loss`、`baseline`、`oracle`。

## 8. 时间限制、取消、一次一个

* 子进程从启动到发出 `ready` 最多 120 秒（导入 numpy / PyTorch、解码数据）。
* `ready` 之后，`budgetMs × 1.5 + 10 秒` 还没结束就杀掉子进程，发 `error {timeout: true, message: "超过 … 秒还没有算完，已经停掉：多半是代码里有死循环……"}`。
  算法里的 `ctx.time_left()` 从 `fit` 开始算，到 `budgetMs` 用完时变成 ≤ 0。滚动预测比预算的两倍还慢时报"滚动预测太慢，超过了时间预算的两倍。"（同第一期）。
* `POST /api/run/<id>/cancel`（请求体可以为空）：杀掉子进程，事件流收到 `error {cancelled: true, message: "已取消"}`。回应 `{"ok": true, "state": …}`；已经结束的运行什么也不做。
* 一次只跑一个：正在跑时 `POST /api/run` 回 409。最后一条事件发出之前引擎就已经空出来了，所以收到 `done` / `error` 后马上发下一次不会撞上 409。
* `GET /api/run/<id>`：`{id, api, kind, state, finished, events, elapsedMs}`，`state` 是 `starting` | `running` | `done` | `error` | `cancelled` | `timeout`。

## 9. 错误事件

```json
{ "message": "ValueError: matmul: Input operand 1 has a mismatch …\n提示：…",
  "line": 8,
  "traceback": "Traceback (most recent call last):\n  File \"<algo>\", line 5, in fit\n    b = helper(a)\n  File \"<algo>\", line 8, in helper\n    return a @ np.ones(4)\nValueError: …\n",
  "type": "ValueError", "hint": "" }
```

* `line`：出错位置在**用户代码里**的行号（从 1 数；调用栈里最内层的那一层用户代码），找不到时是 0。页面拿它去高亮代码编辑器里的那一行。
* `traceback`：只含用户代码的那几层（最多 8 层），文件名一律是 `<algo>`；引擎自己的栈不出现。没有用户代码那几层时是空串。
* `message`：Python 的异常是 `类型: 说明`；语法错误是 `语法错误（第 N 行）：…`；引擎自己发现的问题是中文句子，和第一期逐字相同，例如
  `fit 没有返回模型（最后要 return 一个对象）。`、`predict 返回了 3 个数，应该是 4 个（每个样本 2 个类别的概率，按行排）。`、
  `predict 的第 0 行概率加起来是 2.000，应该是 1（是不是忘了做 softmax？）。`、`predict 的第 5 行概率里有负数或不是数的值（NaN）。`、`predict 的第 0 行概率全是 0。`、
  `predict 的第 3 个预测不是有限的数。`、`验证段：forecast 应该返回长度为 3 的数组。`。快照时出的错，`predict` 写作 `predict（画决策面时）`。
  比第一期多一条：分类的 `predict` 返回二维数组但形状不是 (n, k) 时（例如转置了），报 `predict 返回的数组形状是 (a, b)，应该是 (n, k)……`。
* `hint`：常见错误的一句中文提示（改了只读的数据、MPS 不支持 float64、张量不在同一个设备上、没装 PyTorch……），也已经接在 `message` 末尾（"\n提示：…"）。
* `crashed: true`：子进程没留下话就没了（段错误、被系统因内存不够杀掉、`os._exit`），`message` 说明可能的原因。

## 10. Python 这一侧（摘要）

详见 README。引擎在一个全新的模块里 `exec` 用户代码，找其中的函数：

```python
def fit(data, p, lib, ctx) -> model        # 监督学习
def predict(model, X) -> 数组 [n] 或 [n, k]
def inspect(model) -> dict                 # 可选
def fit(series, p, lib, ctx) -> model      # 时间序列
def forecast(model, past, h) -> 长度 ≥ h 的数组（只用前 h 个）
def update(model, y_new)                   # 可选
```

* `data.train` / `data.valid`：`X`（float64 [n, d]，**只读**）、`y`（分类 int64，否则 float64，只读）、`n`、`d`、`k`、`classes`、`featureNames`（别名 `feature_names`）、`shape`、`tokens`、`kind`；`data.kind`。测试集算法拿不到。属性和下标两种写法都行（`data.train.X`、`data.train["X"]`）。
* `series`：`y`（训练段，float64 副本）、`T`（= t1）、`freq`、`season`、`label`、`valid.y`、`valid.start`（= t1）。`past` 是整条序列到 t（含）的只读视图。
* `p`：只读的参数映射（`types.MappingProxyType`），用 `p.get("lr", 0.01)`。
* `lib`：`np`、`torch`、`nn`（`torch.nn`）、`F`（`torch.nn.functional`）、`device`（有 MPS 用 MPS，否则 CUDA，否则 CPU；环境变量 `MLLAB_DEVICE=cpu` 强制 CPU）、`rng`（`np.random.Generator`，已播种）。没装 PyTorch 时 `torch` / `nn` / `F` / `device` 是 None。
* `ctx`：`report(step, **指标)`（也可以 `report(step, {"loss": …})`）、`snapshot(step, model)`、`time_left()`（秒）、`log(*parts)`、`budget_ms`；
  照抄第一期 JavaScript 的写法也行：`timeLeft()`（毫秒）、`budgetMs`。时间序列里 `snapshot` 什么也不做。
* `predict` 的第三个参数若名叫 `n`（照抄 JS 的 `predict(model, X, n)`），引擎会把行数传进去。
* `print` 的输出变成 `log` 事件，也照样打印在引擎的终端里。
