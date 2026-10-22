<!-- Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。 -->
<!-- Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。 -->
# 机器学习实验室 · 本机 Python 引擎

机器学习实验室（`strategy-lab/ml/index.html`）平时在浏览器里用 JavaScript 跑算法。这个小程序让你改用 **Python** 写算法，
并且能用 **PyTorch**——在苹果芯片的 Mac 上还能用上 GPU（MPS）。它运行在你自己的电脑上，不联网、不上传任何东西。

* 页面照旧负责：选任务、生成数据、划分训练 / 验证 / 测试、打分、画图、排行榜、AI 诊断。
* 引擎只负责：在你的电脑上执行你的 Python 代码（`fit`、`predict`……），把**原始的预测值**交回页面。
* 打分用的还是页面里第一期那一份代码，所以 Python 算法和 JavaScript 算法在同一张排行榜上、按同一套指标比较。
* **测试集的答案从来不发给引擎**：你的代码只能看到训练集和验证集，测试集只有输入。

```
浏览器（页面）                                    你的电脑上的 Python 引擎
  生成数据、划分 ──── 训练集、验证集、测试集的输入 ───→  新开一个 Python 进程
                                                        fit(data, p, lib, ctx)
  画学习曲线、动画 ←─── 进度、快照、print 的输出 ─────     ctx.report / ctx.snapshot
  打分、排行榜     ←─── 训练 / 验证 / 测试上的预测值 ──     predict(model, X)
```

版权所有，保留所有权利；不是开源软件（见仓库根目录 LICENSE）。

---

## 1. 安装

### 1.0 先准备 Python（3.10 或更新）

打开"终端"（启动台 → 其他 → 终端），输入

```bash
python3 --version
```

显示 `Python 3.10.x` 或更大的数字就可以。没有，或者版本太旧：

* 推荐用下面的 **uv**，它会自己下载合适的 Python，什么都不用另外装；
* 或者从 <https://www.python.org/downloads/> 下载安装包；装了 Homebrew 的话 `brew install python` 也行。

下面的命令都在仓库的 `strategy-lab/ml-engine` 目录里执行。先进去：

```bash
cd 你放仓库的地方/strategy-lab/ml-engine
```

### 1.1 方法一：用 uv（推荐）

uv 是一个很快的 Python 包管理器，它会自己准备合适的 Python、建环境、装依赖。装 uv（只要一次）：

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

装完关掉终端再开一个（让它认得 `uv` 这个命令）。然后在 `strategy-lab/ml-engine` 目录里直接启动：

```bash
uv run --extra torch python -m mllab_engine    # 第一次会下载 Python（需要的话）、numpy 和 PyTorch，要等一会儿
```

不要 PyTorch 就去掉 `--extra torch`。uv 会在这个目录里建一个 `.venv`（独立的 Python 环境）和一个 `uv.lock`（记下装了哪些版本），以后每次都用同一条命令启动。

### 1.2 方法二：用 pip

```bash
python3 -m venv .venv           # 建一个独立的 Python 环境（不会弄乱系统里的 Python）
source .venv/bin/activate       # 进入这个环境；提示符前面会出现 (.venv)
pip install -e ".[torch]"       # 装引擎、numpy 和 PyTorch；不要 PyTorch 就写 pip install -e .
```

以后每次开新终端，先 `cd` 到这个目录、`source .venv/bin/activate`，再启动。

`-e` 的意思是"就地安装"：引擎直接用仓库里的这份代码，并且能找到仓库里的页面。不加 `-e` 也能装，但启动时要用 `--page` 告诉它页面在哪里。

### 1.3 PyTorch 装好了吗？用上 GPU 了吗？

```bash
python -c "import torch; print(torch.__version__, torch.backends.mps.is_available())"
```

打印出版本号和 `True`，就说明 PyTorch 能用苹果芯片的 GPU（MPS）。`False` 也能用，只是在 CPU 上算（Intel 芯片的 Mac 没有 MPS）。
PyTorch 是可选的：没有它，只能运行 numpy 写的算法。

---

## 2. 构建页面

引擎要把机器学习实验室的页面提供给浏览器，页面文件是 `strategy-lab/ml/index.html`。仓库里还没有这个文件时，先构建一次：

```bash
cd 你放仓库的地方/strategy-lab
npm install          # 第一次要装构建用的工具（KaTeX），见 strategy-lab/README.md
python3 build.py
```

不先构建也能启动引擎：浏览器里会显示一页说明，构建好以后刷新就行。

## 3. 启动

```bash
python -m mllab_engine           # 用 uv 的话：uv run --extra torch python -m mllab_engine
```

终端里会打印类似这样的几行，并自动打开浏览器：

```
机器学习实验室 · 本机 Python 引擎 0.1.0
Python 3.12.4 · numpy 2.1.0
PyTorch 2.4.0 · 计算设备：苹果芯片 GPU（MPS）
页面：/Users/你/…/strategy-lab/ml/index.html

在浏览器里打开（只有这台电脑能访问；网址里的令牌每次启动都不一样，别发给别人）：
  http://127.0.0.1:8765/ml/?engine=Xk3…

停止引擎：在这个终端里按 Ctrl+C。
```

页面顶栏的"本机引擎"显示已连接，就可以在算法里选 Python 的了。浏览器没有自己打开的话，把那个网址复制到浏览器里。

几个选项：

| 选项 | 作用 |
|---|---|
| `--port 9000` | 换一个端口（默认 8765；被占用时引擎会自动用下一个空闲的） |
| `--page 路径` | 用别的页面文件 |
| `--no-browser` | 不自动打开浏览器 |

## 4. 停止

在运行引擎的那个终端窗口里按 **Ctrl+C**（按住 control 键再按 C）。关掉浏览器标签页不会停止引擎；关掉终端窗口会。
引擎停了以后页面还能照常用，只是只能跑 JavaScript 的算法。下次启动会换一个新的令牌，所以要用新打印出来的网址打开。

### 4½. 在 Claude 里用：作为 Claude 桌面版的本地 MCP 服务器

在 Claude 里打开的机器学习实验室（发布成 Claude 里的 Artifact 的那一份）不能自己联网，连不上上面那个 127.0.0.1 上的引擎。
换一条路：把引擎加进 **Claude 桌面版**的设置，作为"本地 MCP 服务器"。桌面版启动时用 `python -m mllab_engine --mcp` 把它拉起来，
经标准输入 / 输出说 MCP（不监听任何端口，也就不需要令牌：只有桌面版能和它说话）；页面请桌面版调用它的工具，每次运行算法之前桌面版都会问你。

1. 照上面装好引擎（uv 或 pip 都行）。在装好的那个环境里运行

   ```bash
   python -m mllab_engine --claude-config
   ```

   它打印要加进设置的那一段，`command` 是你现在用的这个 Python（装着 numpy、PyTorch 的那个），`PYTHONPATH` 指向这个目录：

   ```json
   {
     "mcpServers": {
       "mllab-engine": {
         "command": "/你的路径/strategy-lab/ml-engine/.venv/bin/python",
         "args": ["-m", "mllab_engine", "--mcp"],
         "env": { "PYTHONPATH": "/你的路径/strategy-lab/ml-engine" }
       }
     }
   }
   ```

2. 在电脑屏幕顶上的菜单栏里点 **Claude → Settings…**，打开 **Developer** 一栏，点 **Edit Config**，把这一段并进 `claude_desktop_config.json`
   （文件里已经有 `mcpServers` 的话，只把 `mllab-engine` 那一项加进去）。这个文件在 Mac 上是
   `~/Library/Application Support/Claude/claude_desktop_config.json`，Windows 上是 `%APPDATA%\Claude\claude_desktop_config.json`。
3. **完全退出** Claude 桌面版再打开。在桌面版里打开实验室，点顶栏的"本机引擎"→"连接本机引擎"，在弹出的对话框里选允许。

连上以后：算法列表里多出"Python（本机引擎）"一组，"从网上取数据"也经引擎去取（只取公网地址，最多 50 MB）。允许过以后再打开页面会自动连上。
连不上的时候看日志：Mac 上 `~/Library/Logs/Claude/mcp-server-mllab-engine.log`，Windows 上 `%APPDATA%\Claude\logs`。
引擎的工具在 Claude 的对话里也看得到；Claude 要调用时同样会先问你。协议见 [PROTOCOL.md](PROTOCOL.md#11-mcp-模式)。

---

## 5. 安全须知（请读一遍）

**引擎会执行你在页面里提交的任何 Python 代码，权限和你本人一样**：能读写你的文件、能联网、能装东西。
每次运行虽然放在一个单独的子进程里，但那只是为了"算法崩了、死循环了不会拖垮引擎"，**不是安全沙箱**。所以：

* 只运行你自己写的、内置的、或者你读过的代码。别人分享给你的 Python 算法，先把代码从头到尾看一遍再运行。
  （第一期的 JavaScript 算法在浏览器的隔离环境里跑，别人的代码碰不到你的东西；Python 引擎没有这层保护。）
* AI 写的代码也一样：运行之前扫一眼，特别是 `import os`、`subprocess`、`open(…, "w")`、`requests` 这类东西。

引擎为了不让**别人**利用它，做了这些事：

* 只监听 `127.0.0.1`：局域网、互联网上的其他电脑都连不上。
* 每次启动生成一个随机令牌，所有接口都要带着它；不知道令牌就什么也做不了。令牌只注入到网址里带着它的那一页里。
* 只认 `127.0.0.1:端口` 和 `localhost:端口` 这两种主机名（防"DNS 重绑定"：恶意网站把自己的域名指向你的 127.0.0.1 也没用）；
  请求如果声明了来源（Origin），必须就是引擎自己的页面；不发任何"跨域许可"（CORS），所以你浏览别的网站时，那些网站的脚本既调不动引擎，也读不到它的回应。
  页面也不能被别的网站嵌进去。
* 网址里的令牌不会随着请求发给别的网站（Referrer-Policy: no-referrer）。不要把带令牌的网址或它的截图发给别人；担心泄露了就重启引擎，换一个新令牌。
* 页面"从网上取数据"时，有的网站不允许网页直接读（浏览器的跨域限制），这时页面会请引擎去取（`POST /api/fetch`）。
  引擎只取公网上的地址：127.0.0.1、局域网（10.x、192.168.x……）、云服务器的元数据地址一律拒绝，每次重定向都重新检查；
  不带 Cookie 或任何登录信息；最多 50 MB。取来的原始文件交回页面，在页面里解析。
* MCP 模式（`--mcp`，给 Claude 桌面版用）不监听任何端口，只经启动它的那个程序的标准输入 / 输出说话；运行代码（`run_start`）标成"会改变东西"的工具，
  桌面版每次都会先问你。标准输出只写 MCP 消息：用户代码的 `print`、库的警告、子进程的输出都改到标准错误（桌面版记在日志里）。

---

## 6. 写一个 Python 算法

### 6.1 监督学习（回归、分类）：两个必须的函数

```python
def fit(data, p, lib, ctx):
    ...                      # 用 data.train 训练，可以看 data.valid（只用来早停、监控）
    return model             # 任何对象：字典、你自己的类、PyTorch 的模块……

def predict(model, X):
    ...                      # X 是 numpy 数组 [n, d]，每行一个样本
    return 预测              # 回归：长度 n 的数组；分类：[n, k] 的概率（每行非负、加起来是 1）

def inspect(model):          # 可选：把模型内部的东西交给"模型内部"标签页画出来
    return {"coef": [...], "layers": [...], "embedding": {...}, "text": "…"}
```

`fit` 拿到的东西：

| 名字 | 是什么 |
|---|---|
| `data.train.X` | 训练集的特征，numpy 的 float64 数组，形状 `[n, d]`。**只读**：要改先 `X = data.train.X.copy()` |
| `data.train.y` | 训练集的答案。分类是 0 … k−1 的整数（int64），回归是 float64。只读 |
| `data.train.n`、`.d` | 样本数、特征数 |
| `data.train.k`、`.classes` | 类别数、类别的名字（回归时 k = 0） |
| `data.train.featureNames` | 特征的名字（可能是 None） |
| `data.train.shape` | 图像数据的 `[H, W]` 或 `[H, W, C]`：X 的每一行是一张图按行展开（通道在最后） |
| `data.train.tokens` | 科研玩具的词表，例如 `{"vocab": 97}`：X 里是 0 … 96 的编号 |
| `data.valid` | 验证集，字段同上 |
| `data.kind` | `"regression"` 或 `"classification"` |
| `p` | 你在页面里设的参数（只读），用 `p.get("lr", 0.01)` 取，第二个数是没设时的默认值 |
| `lib.np` | numpy |
| `lib.torch`、`lib.nn`、`lib.F` | PyTorch、`torch.nn`、`torch.nn.functional`（没装 PyTorch 时是 None） |
| `lib.device` | 该把张量放在哪里：有苹果 GPU 就是 `mps`，否则 `cuda` 或 `cpu` |
| `lib.rng` | 已经按种子播好的随机数发生器（`numpy.random.Generator`），例如 `lib.rng.permutation(n)` |
| `ctx.report(step, loss=…, validLoss=…, trainMetric=…, validMetric=…)` | 学习曲线上的一个点（名字随意，数字就行） |
| `ctx.snapshot(step, model)` | 请实验室给模型拍一张快照（动画用）：二维数据会画出决策面，科研玩具会画出嵌入 |
| `ctx.time_left()` | 时间预算还剩几秒。训练循环里要检查它，`<= 0` 就停下 |
| `ctx.log("文字")` | 写一行日志（`print(...)` 也行，都会显示在页面里） |

种子：`random`、`numpy.random`、`lib.rng`、`torch.manual_seed` 都已经按页面上的种子播好，同样的种子得到同样的结果（GPU 上的 PyTorch 偶尔有极小的差别）。

### 6.2 一个完整的例子：两层神经网络分类器（PyTorch）

把下面整段贴进页面上 Python 算法的代码框，选一个分类数据集，运行。

```python
import numpy as np
import torch
from torch import nn


def fit(data, p, lib, ctx):
    tr, va = data.train, data.valid
    dev = lib.device                                   # mps / cuda / cpu
    mu, sd = tr.X.mean(axis=0), tr.X.std(axis=0) + 1e-8
    # MPS 只支持 float32：在 numpy 里先换好类型，再搬到设备上
    X = torch.from_numpy(((tr.X - mu) / sd).astype(np.float32)).to(dev)
    y = torch.from_numpy(tr.y.astype(np.int64)).to(dev)            # 类别标签用 int64（torch.long）
    Xv = torch.from_numpy(((va.X - mu) / sd).astype(np.float32)).to(dev)
    yv = torch.from_numpy(va.y.astype(np.int64)).to(dev)

    hidden = int(p.get("hidden", 64))
    net = nn.Sequential(nn.Linear(tr.d, hidden), nn.ReLU(), nn.Linear(hidden, tr.k)).to(dev)
    opt = torch.optim.AdamW(net.parameters(), lr=float(p.get("lr", 0.01)), weight_decay=1e-4)
    loss_fn = nn.CrossEntropyLoss()
    model = {"net": net, "mu": mu, "sd": sd, "dev": dev}

    for epoch in range(int(p.get("epochs", 300))):
        net.train()
        loss = loss_fn(net(X), y)                      # 全批量：每一步用全部训练样本
        opt.zero_grad()
        loss.backward()
        opt.step()
        if epoch % 5 == 0:
            net.eval()
            with torch.no_grad():
                out = net(Xv)
                ctx.report(epoch, loss=loss.item(), validLoss=loss_fn(out, yv).item(),
                           validMetric=(out.argmax(dim=1) == yv).float().mean().item())
            ctx.snapshot(epoch, model)
        if ctx.time_left() <= 0:                       # 时间到了就停
            ctx.log("时间到，第", epoch, "轮停下")
            break
    return model


def predict(model, X):
    net = model["net"]
    net.eval()
    with torch.no_grad():                              # 预测时不需要梯度
        x = torch.from_numpy(((X - model["mu"]) / model["sd"]).astype(np.float32)).to(model["dev"])
        prob = torch.softmax(net(x), dim=1)            # 分类要返回概率：做一次 softmax
    return prob.cpu().numpy()                          # 先搬回 CPU 才能变成 numpy
```

要点：

1. **分类的 `predict` 必须返回概率**：形状 `[n, k]`，每行非负、加起来等于 1（差 0.001 以内都算对）。忘了 softmax，页面会提示"第 0 行概率加起来是 …，应该是 1"。
2. **数据和模型放在同一个设备上**（都 `.to(lib.device)`），**数据用 float32**，标签用 int64。
3. 训练时 `net.train()`，验证、预测时 `net.eval()` 加 `with torch.no_grad():`。
4. 交回 numpy 之前 `.cpu()`（有梯度的还要 `.detach()`）。
5. 训练循环检查 `ctx.time_left()`。超过时间预算的 1.5 倍再加 10 秒还没结束，引擎会把进程停掉。
6. `predict` 可能一次拿到好几千行；网络大的话分批做（见 `examples/mlp_torch.py`）。不要在 `predict` 里训练。
7. 出错时页面会指出是你代码的第几行，并显示只含你自己代码的调用栈；常见的错误还会附一句中文提示。

只用 numpy 也完全可以：`examples/ridge_numpy.py`、`examples/softmax_numpy.py` 就是例子。

### 6.3 时间序列预测

```python
def fit(series, p, lib, ctx):
    # series.y：训练段（numpy float64）；series.valid.y：验证段（只用来选参数、早停）
    # series.freq（"day" / "month" / "step"）、series.season（季节长度，可能是 0）、series.T（训练段长度）
    return model

def forecast(model, past, h):
    # past：截至当前时刻（含）的全部观测（只读的 numpy 数组）；返回接下来 h 步的预测（长度 h 的数组）
    return 预测

def update(model, y_new):    # 可选：新的观测到来时更新模型的状态（不重新训练）
    ...
```

实验室的评价方式是"滚动原点、不重训"：模型只在训练段上 `fit` 一次；然后在验证段、测试段的每一个时刻 t，
先把新到的观测喂给 `update`（如果你写了），再调用 `forecast(model, y[0..t], h)`，和真实的 `y[t+1 … t+h]` 比。
最简单的例子见 `examples/ar_numpy.py`。

### 6.4 内置的例子（`examples/` 目录，页面里可以直接选）

| 文件 | 算法 | 需要 |
|---|---|---|
| `ridge_numpy.py` | 岭回归，闭式解 | numpy |
| `softmax_numpy.py` | softmax 回归，梯度下降，会画学习曲线和决策面 | numpy |
| `mlp_torch.py` | 多层感知机，AdamW + 按验证集早停（分类、回归都行） | PyTorch |
| `cnn_torch.py` | 小卷积网络，给图像和格点数据（可选周期边界） | PyTorch |
| `grokking_torch.py` | 嵌入 + MLP，模加法 / 群乘法的 grokking（AdamW、权重衰减 1、全批量），能看到嵌入里长出傅里叶结构 | PyTorch |
| `mlp_forecast_torch.py` | 滞后窗口 MLP 时间序列预测 | PyTorch |
| `ar_numpy.py` | AR(p) 自回归，最小二乘 | numpy |

每个文件开头的注释讲了模型、损失、为什么这样做（定理和证明梗概）。

---

## 7. 常见问题（Mac / MPS）

**`python3: command not found`，或者版本低于 3.10**
用 uv（第 1.1 节），它会自己准备合适的 Python；或者从 python.org 下载安装。

**`No module named 'mllab_engine'`**
不在 `strategy-lab/ml-engine` 目录里，或者没进虚拟环境。先 `cd` 到那个目录，`source .venv/bin/activate`（或者用 `uv run --extra torch python -m mllab_engine`）。

**`No module named 'torch'`（在页面的错误信息里）**
引擎所在的那个 Python 环境里没装 PyTorch：在同一个环境里 `pip install torch`（用 uv 的话，启动命令里加上 `--extra torch`），然后重启引擎。
注意要装进**同一个**环境：`which python` 应该指向 `.venv` 里的 python。

**`Cannot convert a MPS Tensor to float64 dtype` / 类型不匹配（Double 和 Float）**
苹果 GPU 不支持 float64。页面发来的数据是 float64，转成张量时写 `.astype(np.float32)` 或 `dtype=torch.float32`。

**`The operator '…' is not currently implemented for the MPS device`**
这个运算 MPS 还不支持。用下面的方式启动，不支持的运算会自动退回 CPU：
```bash
PYTORCH_ENABLE_MPS_FALLBACK=1 python -m mllab_engine
```

**`Expected all tensors to be on the same device` / `Placeholder storage has not been allocated on MPS device`**
有的张量在 GPU、有的在 CPU。模型 `net.to(lib.device)`，数据 `x.to(lib.device)`，都放到同一个地方。

**`can't convert mps:0 device type tensor to numpy`**
先搬回 CPU：`t.detach().cpu().numpy()`。

**用了 GPU 反而更慢**
小网络、小数据时很常见：每次把任务交给 GPU 都有固定的开销，算得太少时这个开销占大头。在代码里写 `dev = lib.torch.device("cpu")` 试试，
或者用 `MLLAB_DEVICE=cpu python -m mllab_engine` 让 `lib.device` 一律是 CPU。还有：训练循环里少调用 `.item()`（每调用一次，CPU 都要停下来等 GPU 算完）。

**第一次运行要等好几秒**
每次运行都开一个新的 Python 进程，代码里用到 PyTorch 时要先导入它（第一次可能要好几秒，之后会快一些）。导入的时间不算进算法的时间预算。

**页面说"超过 … 秒还没有算完，已经停掉"**
训练循环里没有检查 `ctx.time_left()`，或者有死循环。加上 `if ctx.time_left() <= 0: break`；确实需要更久的话，在页面上把时间预算调大。

**进程"崩溃了（段错误）"或"被系统强行结束（信号 9）"**
段错误多半是 PyTorch / MPS 底层的问题：用 `MLLAB_DEVICE=cpu` 启动试试。信号 9 通常是内存不够：把数据、网络或 batch 调小。

**页面说"引擎正在运行另一个任务"**
引擎一次只跑一个：等它跑完，或者在页面上取消它。

**页面里显示没有令牌 / 401**
引擎重启过（每次启动令牌都会换）。用终端里新打印的网址重新打开页面。

**端口被占用**
引擎会自动换下一个空闲端口，看终端里打印的网址就行；也可以 `--port 9000` 指定。

**macOS 弹窗问"是否允许 Python 接受传入网络连接"**
引擎只监听本机（127.0.0.1），一般不会弹；万一弹了，选"拒绝"通常也不影响在这台电脑上使用。

**浏览器没有自动打开**
把终端里打印的网址复制到浏览器（Safari、Chrome、Edge、Firefox 都行）。

---

## 8. 给开发者

* 文件：`mllab_engine/server.py`（HTTP 服务：只用标准库的 `ThreadingHTTPServer`）、`worker.py`（子进程入口、执行用户代码、报错）、
  `runtime.py`（ctx、lib、快照、预测检查、和 `src/ml/run.js` 一一对应的两种运行）、`codec.py`（数组编码）、`__main__.py`（命令行）。
* 页面和引擎之间的接口：[PROTOCOL.md](PROTOCOL.md)。
* 测试（不需要 PyTorch；PyTorch 的例子只做编译和静态检查）：
  ```bash
  cd strategy-lab/ml-engine
  python3 -m unittest -v
  ```
