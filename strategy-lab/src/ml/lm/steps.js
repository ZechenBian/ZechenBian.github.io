// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 亲手写 · 语言模型：各步的题目、起始代码、提示（页面在 app.js）。测试在本机引擎里：ml-engine/mllab_engine/exercises.py。
 *
 * 写这几步的规矩（铺开后面的步骤时照着做）：
 *  1. 先给困难，再给任务：每一步开头说清"不这样做会出什么事"（溢出、log 0、偷看答案），让人先撞上，再改。
 *  2. 公式只写一行，接口写全：函数名、参数、形状、返回什么，和 exercises.py 的测试一一对应。
 *  3. 每一步留一个"先预测"的问题，答案要能被这一步的测试或训练结果判定，不能只是感想。
 *  4. 提示分两层：第一层只指方向（为什么），第二层给关键的一行；不给整段答案。
 *  5. 起始代码 PyTorch 和 numpy 各一份，接口完全一样；只有训练那一步要 PyTorch。 */
var LMSTEPS = (function () {
  "use strict";
  var PRE = {
    torch: "import math\nimport torch\nfrom torch import nn\n",
    numpy: "import math\nimport numpy as np\n"
  };

  var OVERVIEW = [
    "一个语言模型只做一件事：看着前面的字，给“下一个字是什么”的每种可能打分。",
    "",
    "这一页你会亲手写出五个零件，每写完一个，就在你自己的电脑上和一份独立算出的答案对一遍；最后把它们拼成一个一层的小模型，在莎士比亚全集的一百多万个字符上训练几分钟，看它学着写出台词。",
    "",
    "- **每一步**：读题 → 写代码 → 先写下你的预测 → 运行测试 → 看哪一项没过、为什么。",
    "- **在哪里跑**：代码由本机引擎在你的电脑上运行（Python；有 PyTorch 时用 PyTorch，苹果芯片上训练用它的 GPU）。",
    "- **谁当裁判**：每项测试的答案由引擎用 numpy 另外算，不用 PyTorch 自带的同名函数，所以你的实现和裁判不共用代码。",
    "- **规矩**：不能调用库里现成的 softmax、交叉熵、线性层、嵌入、注意力（引擎会扫一遍代码）。张量的加减乘除、exp、log、max、求和、矩阵乘法都可以用。",
    "",
    "思路和斯坦福 CS336 课的第一次作业一样：从零写组件，每个组件用测试把关。这里的题目、测试和讲解都是这一页自己的。"
  ].join("\n");

  var STEPS = [
    {
      id: "softmax", n: 1, title: "softmax：把分数变成概率", tests: 5,
      text: [
        "模型对每个候选的字给一个实数分数（logit）。要把分数变成概率，常用的是",
        "$$\\mathrm{softmax}(x)_i = \\frac{e^{x_i}}{\\sum_j e^{x_j}}.$$",
        "**先照公式直接写一版，运行一次**：五项里会有一项挂掉。想清楚为什么，再改。",
        "",
        "要写的：`softmax(x, dim=-1)`，沿第 `dim` 维做 softmax，返回和 `x` 同形状的张量，不改动传进来的 `x`。"
      ].join("\n"),
      predict: "照公式直接写的那一版，挂的会是哪一项？为什么？",
      hints: [
        "float32 能表示的最大的数大约是 $3.4\\times10^{38}$，而 $e^{1000}$ 远比它大。对所有的 $x_i$ 减去同一个数 $c$，softmax 的结果变不变？",
        "减去这一维上的最大值：PyTorch 写 `x - x.max(dim=dim, keepdim=True).values`，numpy 写 `x - x.max(axis=dim, keepdims=True)`。最大的那一项变成 $e^0 = 1$，分母至少是 1。"
      ],
      starter: {
        torch: "def softmax(x, dim=-1):\n    \"\"\"沿第 dim 维的 softmax；返回和 x 同形状的张量\"\"\"\n    raise NotImplementedError  # 换成你的实现\n",
        numpy: "def softmax(x, dim=-1):\n    \"\"\"沿第 dim 维的 softmax；返回和 x 同形状的数组\"\"\"\n    raise NotImplementedError  # 换成你的实现\n"
      }
    },
    {
      id: "cross_entropy", n: 2, title: "交叉熵：猜得有多准", tests: 4,
      text: [
        "训练的时候，模型给真正出现的那个字的概率是 $p$，这一处的损失就是 $-\\ln p$：猜得越准越接近 0，把握满满地猜错会非常大。一批位置取平均：",
        "$$\\ell = \\frac1N\\sum_{n=1}^{N}\\Big(\\ln\\sum_j e^{z_{n,j}} - z_{n,y_n}\\Big),$$",
        "其中 $z_n$ 是第 $n$ 个位置的分数，$y_n$ 是那里真正出现的字的编号。",
        "",
        "要写的：`cross_entropy(logits, targets)`。`logits` 的形状是 (…, V)，`targets` 是前面几维相同的整数编号；返回所有位置的平均，一个数。",
        "",
        "用 PyTorch 写时：最后一步训练要对它求导，所以从头到尾都用张量运算，中间不要转成 numpy，也不要用 `.item()`、`float()`。用 numpy 写时没有求导，不用管这一条。"
      ].join("\n"),
      predict: "所有 logits 都相等时（模型完全不知道），损失应该是多少？用 V 写出来。",
      hints: [
        "先算 softmax 再取 log，概率很小的时候会变成 $\\ln 0$。把 log 和 softmax 合在一起写：$\\ln\\sum_j e^{z_j}$ 也可以先减去最大值再加回来。",
        "先展平：`z = logits.reshape(-1, V)`，`t = targets.reshape(-1)`；`z[torch.arange(N), t]` 取出每一行真实那一类的分数（numpy 用 `np.arange`）。"
      ],
      starter: {
        torch: "def cross_entropy(logits, targets):\n    \"\"\"logits: (…, V) 的分数；targets: 同样前几维的整数编号。返回所有位置的平均交叉熵（一个数）\"\"\"\n    raise NotImplementedError\n",
        numpy: "def cross_entropy(logits, targets):\n    \"\"\"logits: (…, V) 的分数；targets: 同样前几维的整数编号。返回所有位置的平均交叉熵（一个数）\"\"\"\n    raise NotImplementedError\n"
      }
    },
    {
      id: "linear", n: 3, title: "线性层：一个矩阵", tests: 3,
      text: [
        "线性层就是乘一个矩阵：$y = xW^\\top$，$W$ 的形状是（输出维数, 输入维数）。现在的语言模型里，线性层大多不带偏置，这里也不带。",
        "",
        "要写的：`class Linear`。`Linear(in_features, out_features)` 把权重放在 `self.weight`；`layer(x)` 时 `x` 的最后一维是 `in_features`，前面几维随意。",
        "",
        "用 PyTorch 写时：继承 `nn.Module`，权重用 `nn.Parameter` 包起来（优化器靠它找到要训练的参数），前向写在 `forward` 里。用 numpy 写时：权重是一个 numpy 数组，前向写在 `__call__` 里。",
        "",
        "**初始化**：权重取随机数。标准差取多少？测试会查它在 $1/\\sqrt{\\text{in}}$ 的 0.3 到 3 倍之间。"
      ].join("\n"),
      predict: "如果权重的标准差取 1 而不是 1/√in，输入是 256 维、每一维方差为 1 时，输出每一维的标准差大约是多少？",
      hints: [
        "$x$ 的各分量独立、方差为 1 时，$\\sum_{i=1}^{\\text{in}} x_i w_i$ 的方差是 $\\text{in}\\cdot\\mathrm{Var}(w)$。想让输出的方差还是 1，$\\mathrm{Var}(w)$ 该取多少？层一多，这个倍数会一层层乘上去。",
        "`x @ self.weight.T` 对任意前几维都成立：矩阵乘法按最后两维算，前面的维自动当成一批。"
      ],
      starter: {
        torch: "class Linear(nn.Module):\n    def __init__(self, in_features, out_features):\n        super().__init__()\n        self.weight = None  # 换成 nn.Parameter(…)，形状 (out_features, in_features)\n\n    def forward(self, x):\n        raise NotImplementedError\n",
        numpy: "class Linear:\n    def __init__(self, in_features, out_features):\n        self.weight = None  # 换成形状 (out_features, in_features) 的 numpy 数组\n\n    def __call__(self, x):\n        raise NotImplementedError\n"
      }
    },
    {
      id: "embedding", n: 4, title: "嵌入：编号变成向量", tests: 2,
      text: [
        "文字先变成编号（这一页的莎士比亚文本里一共有 65 种字符），编号再变成向量。嵌入层就是一张表：第 $i$ 行是编号 $i$ 的向量，训练时和别的权重一起学。",
        "",
        "要写的：`class Embedding`。`Embedding(num_embeddings, embedding_dim)` 的 `self.weight` 形状是（个数, 维数）；`layer(ids)` 把每个编号换成表里对应的那一行，输出的形状是 `ids` 的形状后面再加一维。",
        "",
        "初始化用标准正态，或者标准差 0.02 的正态，都可以。"
      ].join("\n"),
      predict: "查表和“先把编号变成 one-hot 向量，再乘一个 (个数 × 维数) 的矩阵”结果一样吗？哪个快？各要多少次乘法？",
      hints: [
        "张量可以拿一个整数张量去索引：结果的形状就是索引的形状，再接上被索引那个张量剩下的维。",
        "`self.weight[ids]` 就是查表。"
      ],
      starter: {
        torch: "class Embedding(nn.Module):\n    def __init__(self, num_embeddings, embedding_dim):\n        super().__init__()\n        self.weight = None  # 换成 nn.Parameter(…)，形状 (num_embeddings, embedding_dim)\n\n    def forward(self, ids):\n        raise NotImplementedError\n",
        numpy: "class Embedding:\n    def __init__(self, num_embeddings, embedding_dim):\n        self.weight = None  # 换成形状 (num_embeddings, embedding_dim) 的 numpy 数组\n\n    def __call__(self, ids):\n        raise NotImplementedError\n"
      }
    },
    {
      id: "attention", n: 5, title: "因果注意力：回头看", tests: 4,
      text: [
        "只看上一个字是不够的：要猜 “Romeo and Jul” 后面是什么，得看见好几个字之前的 “Romeo”。注意力让每个位置自己决定该看前面的哪些位置、各看多少：",
        "$$\\mathrm{Attn}(Q,K,V) = \\mathrm{softmax}\\!\\Big(\\frac{QK^\\top}{\\sqrt d} + M\\Big)V,$$",
        "$M$ 在“后面的位置”上是 $-\\infty$，其余是 0。这叫因果掩码：训练时第 $t$ 个位置要猜第 $t+1$ 个字，不能偷看它。",
        "",
        "要写的：`causal_attention(q, k, v)`，三个输入的形状都是 (…, T, d)，返回 (…, T, d)。可以调用你在第 1 步写的 `softmax`。"
      ].join("\n"),
      predict: "如果忘了加掩码，训练时的 loss 会比加了掩码的更低还是更高？那样训练出来的模型能用来写字吗？",
      hints: [
        "分数矩阵 `s = q @ k.transpose(-1, -2) / math.sqrt(d)`（numpy：`np.swapaxes(k, -1, -2)`），形状 (…, T, T)：第 $t$ 行是第 $t$ 个位置对各个位置的打分。",
        "掩码：`torch.tril(torch.ones(T, T, dtype=torch.bool, device=q.device))` 是下三角为真；不允许的位置填 $-\\infty$：`s.masked_fill(~mask, float('-inf'))`（numpy：`np.where(mask, s, -np.inf)`）。掩码要和 `q` 在同一个设备上，训练时才不会出错。"
      ],
      starter: {
        torch: "def causal_attention(q, k, v):\n    \"\"\"q, k, v: (…, T, d)。返回 (…, T, d)：每个位置只看它自己和前面的位置\"\"\"\n    raise NotImplementedError\n",
        numpy: "def causal_attention(q, k, v):\n    \"\"\"q, k, v: (…, T, d)。返回 (…, T, d)：每个位置只看它自己和前面的位置\"\"\"\n    raise NotImplementedError\n"
      }
    },
    {
      id: "train_tiny", n: 6, title: "拼起来，训练", train: true, tests: 2,
      text: [
        "五个零件拼成一个一层的字符级语言模型：",
        "",
        "词嵌入 + 位置嵌入 → 因果注意力（再加回输入）→ 两层前馈（再加回）→ 输出层，得到 65 个字符的分数；损失用你的交叉熵，优化器用 PyTorch 自带的 AdamW。",
        "",
        "模型的接线由引擎固定，所有的权重都来自你写的 `Linear` 和 `Embedding`，前向用你写的 `causal_attention`，采样时用你写的 `softmax`。这一步不用写新代码：前五步都通过了就可以训练。",
        "",
        "裁判是三个在验证集上算出来的数，和你的模型无关：",
        "",
        "- **均匀乱猜**：$\\ln 65 \\approx 4.17$；",
        "- **只看字符出现的频率**；",
        "- **只看上一个字符**：数一数“某个字后面跟着某个字”出现了多少次。",
        "",
        "要你的模型赢过“只看上一个字符”。赢不了，说明注意力没帮上忙。"
      ].join("\n"),
      predict: "训练完以后，验证集上的 loss 大约是多少？写一个数。",
      predictNumber: true,
      hints: [
        "loss 不降：先看第 2 步的交叉熵是不是一直用张量运算（中间转成 numpy、用了 `.item()` 都会断开求导）。",
        "报设备不一致的错：掩码之类在函数里新建的张量，要加 `device=q.device`。"
      ],
      starter: null
    }
  ];

  var NEXT = [
    "这一页先做到这里。同一套做法接下来要铺开的零件：RMSNorm、多头注意力、旋转位置编码（RoPE）、SwiGLU 前馈、自己写的 AdamW 和学习率表、梯度裁剪、BPE 分词器，最后在 TinyStories 上训一个能写简单故事的模型。"
  ].join("\n");

  return { PRE: PRE, OVERVIEW: OVERVIEW, STEPS: STEPS, NEXT: NEXT };
})();
