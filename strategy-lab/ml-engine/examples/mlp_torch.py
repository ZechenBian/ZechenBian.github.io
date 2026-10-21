# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
# @name 多层感知机（PyTorch，AdamW + 早停）
# @api supervised
# @kinds classification, regression
# @families tabular, toy, image
# @needs torch
# @params [{"key": "hidden", "label": "每层宽度", "def": 64, "min": 4, "max": 1024, "step": 4, "type": "int"}, {"key": "layers", "label": "隐藏层数", "def": 2, "min": 1, "max": 6, "step": 1, "type": "int"}, {"key": "lr", "label": "学习率", "def": 0.003, "min": 0.00001, "max": 0.1, "step": 0.0001, "type": "num"}, {"key": "wd", "label": "权重衰减", "def": 0.0001, "min": 0, "max": 1, "step": 0.0001, "type": "num"}, {"key": "batch", "label": "批大小", "def": 128, "min": 8, "max": 4096, "step": 8, "type": "int"}, {"key": "epochs", "label": "最多轮数", "def": 300, "min": 1, "max": 5000, "step": 1, "type": "int"}, {"key": "patience", "label": "早停耐心（轮）", "def": 25, "min": 1, "max": 500, "step": 1, "type": "int"}]
#
# 多层感知机：x → Linear → ReLU → … → Linear → 输出。分类时输出 k 个打分（logits），用交叉熵训练，predict 时做 softmax 变成概率；
# 回归时输出 1 个数，先把 y 标准化，用均方误差训练，predict 时再换回原来的单位。
# 优化器 AdamW：Adam 的自适应步长，加上"解耦"的权重衰减（每步把权重乘以 1 − lr·wd，而不是把 wd·w 加进梯度）。
# 早停：每一轮结束在验证集上算一次损失，记住最好的那一轮的权重；连续 patience 轮没有变好就停下，最后换回最好的权重。
# 验证集只用来早停和画曲线，测试集算法拿不到。
#
# 苹果芯片的 GPU（MPS）只支持 float32，所以所有张量都用 torch.float32，类别标签用 torch.long；
# 模型和数据都放在 lib.device 上（有 MPS 就是 MPS，否则 CUDA 或 CPU）。小网络、小数据在 CPU 上可能更快：把 dev 改成 torch.device("cpu") 试试。
import math

import numpy as np
import torch
from torch import nn


def to_device(a, dtype, dev):
    """numpy → 张量：先在 numpy 里换好类型（float32 / int64）再搬到设备上。np.array 会复制一份（页面发来的数据是只读的）"""
    return torch.from_numpy(np.array(a, dtype=dtype)).to(dev)


def fit(data, p, lib, ctx):
    tr, va = data.train, data.valid
    dev = lib.device
    cls = data.kind == "classification"
    mu = tr.X.mean(axis=0)
    sd = tr.X.std(axis=0)
    sd[sd == 0] = 1.0

    def tensor_x(X):
        return to_device((X - mu) / sd, np.float32, dev)

    Xtr, Xva = tensor_x(tr.X), tensor_x(va.X)
    if cls:
        ym, ys, out_dim = 0.0, 1.0, tr.k
        ytr = to_device(tr.y, np.int64, dev)
        yva = to_device(va.y, np.int64, dev)
        loss_fn = nn.CrossEntropyLoss()
    else:
        ym, ys, out_dim = float(tr.y.mean()), float(tr.y.std()) or 1.0, 1
        ytr = to_device((tr.y - ym) / ys, np.float32, dev)
        yva = to_device((va.y - ym) / ys, np.float32, dev)
        loss_fn = nn.MSELoss()

    width, depth = int(p.get("hidden", 64)), int(p.get("layers", 2))
    mods, d_in = [], tr.d
    for _ in range(depth):
        mods += [nn.Linear(d_in, width), nn.ReLU()]
        d_in = width
    mods.append(nn.Linear(d_in, out_dim))
    net = nn.Sequential(*mods).to(dev)
    opt = torch.optim.AdamW(net.parameters(), lr=float(p.get("lr", 3e-3)), weight_decay=float(p.get("wd", 1e-4)))
    model = {"net": net, "mu": mu, "sd": sd, "cls": cls, "k": tr.k, "ym": ym, "ys": ys, "dev": dev,
             "size": sum(q.numel() for q in net.parameters())}

    def output(xb):
        o = net(xb)
        return o if cls else o.squeeze(1)

    n, bs = tr.n, int(p.get("batch", 128))
    patience = int(p.get("patience", 25))
    best, best_state, bad = math.inf, None, 0
    for ep in range(int(p.get("epochs", 300))):
        net.train()
        perm = torch.from_numpy(lib.rng.permutation(n)).to(dev)
        total = torch.zeros((), device=dev)        # 在设备上累加，一轮只同步一次（MPS 上每次 .item() 都要等 GPU）
        correct = torch.zeros((), device=dev)
        for i in range(0, n, bs):
            idx = perm[i:i + bs]
            o = output(Xtr[idx])
            loss = loss_fn(o, ytr[idx])
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            total += loss.detach() * idx.numel()
            if cls:
                correct += (o.detach().argmax(dim=1) == ytr[idx]).sum()
        net.eval()
        with torch.no_grad():
            vo = output(Xva)
            vloss = loss_fn(vo, yva).item()
            point = {"loss": total.item() / n, "validLoss": vloss}
            if cls:
                point["trainMetric"] = correct.item() / n
                point["validMetric"] = (vo.argmax(dim=1) == yva).float().mean().item()
        ctx.report(ep, **point)
        ctx.snapshot(ep, model)                    # 二维数据：实验室会在网格上调用 predict，画出决策面的变化
        if vloss < best - 1e-7:
            best, bad = vloss, 0
            best_state = {key: v.detach().clone() for key, v in net.state_dict().items()}
        else:
            bad += 1
            if bad >= patience:
                ctx.log("验证集损失 %d 轮没有变好，在第 %d 轮早停（最好的验证损失 %.4g）。" % (patience, ep, best))
                break
        if ctx.time_left() <= 0:
            ctx.log("时间预算用完，在第 %d 轮停下。" % ep)
            break
    if best_state is not None:
        net.load_state_dict(best_state)
    net.eval()
    return model


def predict(model, X):
    net, dev = model["net"], model["dev"]
    net.eval()
    Z = (X - model["mu"]) / model["sd"]
    outs = []
    with torch.no_grad():                          # 预测时不需要梯度：省内存、更快
        for i in range(0, max(1, len(Z)), 4096):   # 分批：数据很多时不至于一次占满显存
            o = net(to_device(Z[i:i + 4096], np.float32, dev))
            if model["cls"]:
                o = torch.softmax(o, dim=1)
            else:
                o = o.squeeze(1) * model["ys"] + model["ym"]
            outs.append(o.cpu().numpy())
    return np.concatenate(outs).astype(np.float64)


def inspect(model):
    layers = []
    for name, w in model["net"].named_parameters():
        if w.dim() == 2:
            layers.append({"name": name, "rows": w.shape[0], "cols": w.shape[1], "data": w.detach().cpu().numpy()})
    return {"layers": layers, "text": "MLP：%d 个参数，设备 %s" % (model["size"], model["dev"])}
