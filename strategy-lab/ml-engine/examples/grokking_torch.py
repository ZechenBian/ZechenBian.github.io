# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
# @name 嵌入 + MLP：模加法 / 群乘法与 grokking（PyTorch）
# @api supervised
# @kinds classification
# @families toy
# @needs torch
# @params [{"key": "dim", "label": "嵌入维数", "def": 128, "min": 4, "max": 512, "step": 4, "type": "int"}, {"key": "hidden", "label": "隐藏层宽度", "def": 256, "min": 8, "max": 2048, "step": 8, "type": "int"}, {"key": "lr", "label": "学习率", "def": 0.001, "min": 0.00001, "max": 0.05, "step": 0.0001, "type": "num"}, {"key": "wd", "label": "权重衰减", "def": 1.0, "min": 0, "max": 10, "step": 0.01, "type": "num", "desc": "grokking 的关键：没有它，测试准确率通常一直上不去"}, {"key": "steps", "label": "最多步数", "def": 30000, "min": 10, "max": 1000000, "step": 10, "type": "int"}, {"key": "tied", "label": "两个位置共用一张嵌入表", "def": true, "type": "bool"}, {"key": "evalEvery", "label": "每隔几步记一次曲线", "def": 10, "min": 1, "max": 1000, "step": 1, "type": "int"}]
#
# 任务：输入是一对元素 (a, b)（X 的每行是两个 0..m−1 的编号，data.train.tokens["vocab"] = m），输出 a ∘ b：
# 模 p 加法 (a + b) mod p，或者某个有限群的乘法。只给一部分 (a, b) 当训练集，看模型能不能"想通"整张乘法表。
#
# 模型：嵌入表 E（m × dim），把 a、b 各查出一个 dim 维向量，拼成 2·dim 维 → Linear → ReLU → Linear → k 个打分（k = 群的阶）。
# 训练：全批量（每一步用全部训练样本）、AdamW、权重衰减 wd = 1、交叉熵。
# 典型现象（Power et al. 2022 "Grokking"）：训练准确率很快到 100%，验证准确率却在很长时间里接近随机，
# 然后突然跳到接近 100%。一个解释：权重衰减持续地把"背答案"的大范数解往"有结构"的小范数解推。
# 对模 p 加法，学到的嵌入往往集中在少数几个频率上：E 的列近似 cos(2πka/p)、sin(2πka/p)，
# 网络用 cos(ω(a+b−c)) = cos ω(a+b) cos ωc + sin ω(a+b) sin ωc 这类三角恒等式来算 a+b（Nanda et al. 2023）。
# 群乘法的情形，嵌入按群的不可约表示分解（Chughtai et al. 2023）。实验室的"模型内部"会对嵌入做 PCA 和傅里叶分析。
#
# inspect 返回嵌入矩阵（行 = 群元素）；ctx.snapshot 每隔一段拍一张嵌入的快照，动画里能看到结构是怎么长出来的。
# "曲线"上的验证准确率就是 grokking 论文里的"测试准确率"（真正的测试集在页面里另算）。
import numpy as np
import torch
from torch import nn


class EmbedMLP(nn.Module):
    def __init__(self, vocab, n_tok, dim, hidden, k, tied):
        super().__init__()
        self.n_tok, self.tied = n_tok, tied
        if tied:
            self.emb = nn.Embedding(vocab, dim)                      # 两个位置共用一张表
        else:
            self.embs = nn.ModuleList([nn.Embedding(vocab, dim) for _ in range(n_tok)])
        self.hidden = nn.Linear(n_tok * dim, hidden)
        self.out = nn.Linear(hidden, k)

    def embed(self, x):                                              # x: [N, n_tok] 的 long
        if self.tied:
            return self.emb(x).flatten(1)                            # [N, n_tok, dim] → [N, n_tok·dim]
        return torch.cat([self.embs[j](x[:, j]) for j in range(self.n_tok)], dim=1)

    def forward(self, x):
        return self.out(torch.relu(self.hidden(self.embed(x))))

    def table(self):
        """嵌入矩阵（行 = 元素）；不共用时把几张表横着拼起来"""
        if self.tied:
            return self.emb.weight
        return torch.cat([e.weight for e in self.embs], dim=1)


def fit(data, p, lib, ctx):
    tr, va = data.train, data.valid
    dev = lib.device
    vocab = int((tr.tokens or {}).get("vocab") or 0) or int(max(tr.X.max(), va.X.max())) + 1
    xtr = torch.from_numpy(np.array(tr.X, dtype=np.int64)).to(dev)      # 编号在 X 里是浮点数，换成 long 才能查表
    xva = torch.from_numpy(np.array(va.X, dtype=np.int64)).to(dev)
    ytr = torch.from_numpy(np.array(tr.y, dtype=np.int64)).to(dev)
    yva = torch.from_numpy(np.array(va.y, dtype=np.int64)).to(dev)
    tied = bool(p.get("tied", True))
    net = EmbedMLP(vocab, tr.d, int(p.get("dim", 128)), int(p.get("hidden", 256)), tr.k, tied).to(dev)
    opt = torch.optim.AdamW(net.parameters(), lr=float(p.get("lr", 1e-3)), weight_decay=float(p.get("wd", 1.0)), betas=(0.9, 0.98))
    loss_fn = nn.CrossEntropyLoss()
    model = {"net": net, "dev": dev, "vocab": vocab, "size": sum(q.numel() for q in net.parameters())}
    steps, every = int(p.get("steps", 30000)), max(1, int(p.get("evalEvery", 10)))
    snap_every = max(every, steps // 120)
    for step in range(steps):
        net.train()
        logits = net(xtr)                                            # 全批量
        loss = loss_fn(logits, ytr)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        opt.step()
        last = step == steps - 1 or ctx.time_left() <= 0
        if step % every == 0 or last:                                # 每隔几步才把数取回 CPU（MPS 上每次 .item() 都要等 GPU）
            net.eval()
            with torch.no_grad():
                vo = net(xva)
                ctx.report(step, loss=loss.item(), validLoss=loss_fn(vo, yva).item(),
                           trainMetric=(logits.argmax(dim=1) == ytr).float().mean().item(),
                           validMetric=(vo.argmax(dim=1) == yva).float().mean().item())
        if step % snap_every == 0 or last:
            ctx.snapshot(step, model)                                # 实验室会调用 inspect 取嵌入矩阵
        if last:
            if step < steps - 1:
                ctx.log("时间预算用完，在第 %d 步停下（grokking 常常要上万步：可以把时间预算调大）。" % step)
            break
    net.eval()
    return model


def predict(model, X):
    net, dev = model["net"], model["dev"]
    net.eval()
    outs = []
    with torch.no_grad():
        for i in range(0, max(1, len(X)), 8192):
            x = torch.from_numpy(np.array(X[i:i + 8192], dtype=np.int64)).to(dev)
            outs.append(torch.softmax(net(x), dim=1).cpu().numpy())
    return np.concatenate(outs).astype(np.float64)


def inspect(model):
    net = model["net"]
    E = net.table().detach().cpu().numpy()
    return {"embedding": {"rows": E.shape[0], "cols": E.shape[1], "data": E, "labels": [str(i) for i in range(E.shape[0])]},
            "layers": [{"name": "hidden.weight", "rows": net.hidden.weight.shape[0], "cols": net.hidden.weight.shape[1], "data": net.hidden.weight.detach().cpu().numpy()},
                       {"name": "out.weight", "rows": net.out.weight.shape[0], "cols": net.out.weight.shape[1], "data": net.out.weight.detach().cpu().numpy()}],
            "text": "嵌入 + MLP：元素 %d 个，嵌入矩阵 %d×%d，%d 个参数，设备 %s" % (E.shape[0], E.shape[0], E.shape[1], model["size"], model["dev"])}
