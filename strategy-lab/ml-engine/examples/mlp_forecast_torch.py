# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
# @name 滞后窗口 MLP 预测（PyTorch）
# @api forecast
# @kinds forecast
# @families timeseries
# @needs torch
# @params [{"key": "lags", "label": "窗口长度（看过去几步）", "def": 24, "min": 1, "max": 512, "step": 1, "type": "int"}, {"key": "hidden", "label": "隐藏层宽度", "def": 64, "min": 4, "max": 1024, "step": 4, "type": "int"}, {"key": "lr", "label": "学习率", "def": 0.001, "min": 0.00001, "max": 0.1, "step": 0.0001, "type": "num"}, {"key": "wd", "label": "权重衰减", "def": 0.0001, "min": 0, "max": 1, "step": 0.0001, "type": "num"}, {"key": "batch", "label": "批大小", "def": 64, "min": 8, "max": 4096, "step": 8, "type": "int"}, {"key": "epochs", "label": "最多轮数", "def": 300, "min": 1, "max": 5000, "step": 1, "type": "int"}, {"key": "patience", "label": "早停耐心（轮）", "def": 20, "min": 1, "max": 500, "step": 1, "type": "int"}]
#
# 把预测变成监督学习：取长度为 L 的"滞后窗口" (y_{t−L+1}, …, y_t) 作输入，下一个值 y_{t+1} 作目标，
# 在训练段上滑动窗口得到 (输入, 目标) 对，训练一个两层隐藏层的 MLP（均方误差、AdamW）。
# 早停用验证段：窗口可以跨过训练段的末尾（输入里有训练段的值），但目标都在验证段里。
# 多步预测用递推：把一步预测接到窗口末尾，再预测下一步。注意误差会沿着递推累积。
# 序列先用训练段的均值、标准差标准化（网络在 0 附近、尺度为 1 的数上最好训练）。
#
# 和线性的 AR(L) 比：AR 是这个网络去掉隐藏层的特例；MLP 能表示非线性的依赖（例如阈值、门限效应），
# 但数据少时更容易过拟合——看看验证段和训练段的差距。
# 训练在 lib.device（可能是 MPS）上；训练完把网络搬回 CPU 做逐点预测：每次只算一个窗口，GPU 的启动开销反而更大。
import math

import numpy as np
import torch
from torch import nn


def windows(z, L):
    """z 是一维序列：返回 X[i] = z[i : i+L]、t[i] = z[i+L]，i = 0 … len(z)−L−1"""
    m = len(z) - L
    idx = np.arange(m)[:, None] + np.arange(L)[None, :]
    return z[idx], z[L:]


def fit(series, p, lib, ctx):
    y, yv = series.y, series.valid.y
    L = max(1, min(int(p.get("lags", 24)), len(y) // 3))
    mu, sd = float(y.mean()), float(y.std()) or 1.0
    z = (y - mu) / sd
    zall = (np.concatenate([y, yv]) - mu) / sd
    Xtr, ttr = windows(z, L)
    Xall, tall = windows(zall, L)
    Xva, tva = Xall[len(y) - L:], tall[len(y) - L:]     # 目标落在验证段里的那些窗口
    dev = lib.device

    def to_dev(a):
        return torch.from_numpy(np.array(a, dtype=np.float32)).to(dev)

    Xtr_t, ttr_t, Xva_t, tva_t = to_dev(Xtr), to_dev(ttr), to_dev(Xva), to_dev(tva)
    H = int(p.get("hidden", 64))
    net = nn.Sequential(nn.Linear(L, H), nn.ReLU(), nn.Linear(H, H), nn.ReLU(), nn.Linear(H, 1)).to(dev)
    opt = torch.optim.AdamW(net.parameters(), lr=float(p.get("lr", 1e-3)), weight_decay=float(p.get("wd", 1e-4)))
    loss_fn = nn.MSELoss()
    n, bs, patience = len(ttr), int(p.get("batch", 64)), int(p.get("patience", 20))
    best, best_state, bad = math.inf, None, 0
    for ep in range(int(p.get("epochs", 300))):
        net.train()
        perm = torch.from_numpy(lib.rng.permutation(n)).to(dev)
        total = torch.zeros((), device=dev)
        for i in range(0, n, bs):
            idx = perm[i:i + bs]
            loss = loss_fn(net(Xtr_t[idx]).squeeze(1), ttr_t[idx])
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            total += loss.detach() * idx.numel()
        net.eval()
        with torch.no_grad():
            vloss = loss_fn(net(Xva_t).squeeze(1), tva_t).item()
        ctx.report(ep, loss=total.item() / n, validLoss=vloss)        # 都是标准化尺度上的一步预测均方误差
        if vloss < best - 1e-7:
            best, bad = vloss, 0
            best_state = {key: v.detach().clone() for key, v in net.state_dict().items()}
        else:
            bad += 1
            if bad >= patience:
                ctx.log("验证段损失 %d 轮没有变好，在第 %d 轮早停。" % (patience, ep))
                break
        if ctx.time_left() <= 0:
            ctx.log("时间预算用完，在第 %d 轮停下。" % ep)
            break
    if best_state is not None:
        net.load_state_dict(best_state)
    net = net.to("cpu").eval()
    return {"net": net, "L": L, "mu": mu, "sd": sd, "size": sum(q.numel() for q in net.parameters())}


def forecast(model, past, h):
    L, mu, sd, net = model["L"], model["mu"], model["sd"], model["net"]
    z = (np.asarray(past[-L:], dtype=np.float64) - mu) / sd
    if len(z) < L:                                      # 开头的时刻观测不够 L 个：前面补 0（标准化后的均值）
        z = np.concatenate([np.zeros(L - len(z)), z])
    window = [float(v) for v in z]
    out = []
    with torch.no_grad():
        for _ in range(h):
            x = torch.tensor([window[-L:]], dtype=torch.float32)          # [1, L]，在 CPU 上
            nxt = float(net(x)[0, 0])
            out.append(nxt)
            window.append(nxt)
    return np.array(out) * sd + mu


def inspect(model):
    w = model["net"][0].weight.detach().numpy()          # 第一层：[H, L]，第 j 列是"过去第 L−j 步"的权重
    return {"layers": [{"name": "第一层（隐藏单元 × 滞后）", "rows": w.shape[0], "cols": w.shape[1], "data": w}],
            "text": "滞后窗口 MLP：L = %d，%d 个参数（预测在 CPU 上做）" % (model["L"], model["size"])}
