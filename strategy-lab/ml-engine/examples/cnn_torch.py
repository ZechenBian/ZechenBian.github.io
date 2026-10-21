# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
# @name 小卷积网络（PyTorch，图像与格点）
# @api supervised
# @kinds classification, regression
# @families image
# @needs torch
# @params [{"key": "c1", "label": "第一层通道数", "def": 16, "min": 2, "max": 128, "step": 2, "type": "int"}, {"key": "c2", "label": "第二层通道数", "def": 32, "min": 2, "max": 256, "step": 2, "type": "int"}, {"key": "circular", "label": "周期边界（格点模型用）", "def": false, "type": "bool"}, {"key": "lr", "label": "学习率", "def": 0.002, "min": 0.00001, "max": 0.1, "step": 0.0001, "type": "num"}, {"key": "wd", "label": "权重衰减", "def": 0.0001, "min": 0, "max": 1, "step": 0.0001, "type": "num"}, {"key": "batch", "label": "批大小", "def": 64, "min": 8, "max": 2048, "step": 8, "type": "int"}, {"key": "epochs", "label": "最多轮数", "def": 60, "min": 1, "max": 1000, "step": 1, "type": "int"}, {"key": "patience", "label": "早停耐心（轮）", "def": 8, "min": 1, "max": 200, "step": 1, "type": "int"}]
#
# 卷积网络：conv3×3 → ReLU →（图够大时）2×2 最大池化 → conv3×3 → ReLU → 全局平均池化 → 线性层。
# 卷积对平移是"等变"的：把输入平移一格，特征图也平移一格（周期边界时严格成立，零填充时除了边缘）；
# 全局平均池化再把它变成平移"不变"的。所以模型天生就知道"猫在左上角还是右下角都是猫"，比 MLP 省很多参数。
# 格点模型（例如伊辛模型的自旋构型）是环面上的，勾上"周期边界"让卷积绕回去，等变性就是严格的。
#
# 数据：data.train.shape 是 [H, W] 或 [H, W, C]，X 的每一行是一张图按行展开（通道在最后，H×W×C）。
# 这里把它变成 PyTorch 要的 [N, C, H, W]。像素用训练集所有像素的均值、标准差标准化。
# 分类：交叉熵 + softmax；回归：标准化 y 后用均方误差。AdamW、按验证集早停，同多层感知机那个例子。
# MPS 只支持 float32；大数据集时 predict 分批做。
import math

import numpy as np
import torch
from torch import nn


def to_device(a, dtype, dev):
    """numpy → 张量：先在 numpy 里换好类型再搬到设备上（np.array 会复制，页面发来的数据是只读的）"""
    return torch.from_numpy(np.array(a, dtype=dtype)).to(dev)


class SmallCNN(nn.Module):
    def __init__(self, C, c1, c2, out_dim, pool, pad_mode):
        super().__init__()
        layers = [nn.Conv2d(C, c1, 3, padding=1, padding_mode=pad_mode), nn.ReLU()]
        if pool:
            layers.append(nn.MaxPool2d(2))
        layers += [nn.Conv2d(c1, c2, 3, padding=1, padding_mode=pad_mode), nn.ReLU()]
        self.body = nn.Sequential(*layers)
        self.head = nn.Linear(c2, out_dim)

    def forward(self, x):                  # x: [N, C, H, W]
        h = self.body(x)
        h = h.mean(dim=(2, 3))             # 全局平均池化 → [N, c2]
        return self.head(h)


def images(X, model):
    """[n, H·W·C] 的行 → [n, C, H, W] 的 float32 numpy 数组（已标准化）"""
    H, W, C = model["hwc"]
    x = ((X - model["mu"]) / model["sd"]).reshape(-1, H, W, C).transpose(0, 3, 1, 2)
    return np.ascontiguousarray(x, dtype=np.float32)


def fit(data, p, lib, ctx):
    tr, va = data.train, data.valid
    if not tr.shape:
        raise ValueError("这个算法要图像数据：data.train.shape 应该是 [H, W] 或 [H, W, C]。表格数据请用多层感知机。")
    H, W = int(tr.shape[0]), int(tr.shape[1])
    C = int(tr.shape[2]) if len(tr.shape) > 2 else 1
    if H * W * C != tr.d:
        raise ValueError("data.train.shape = %s 和每行的像素数 %d 对不上。" % (tr.shape, tr.d))
    dev = lib.device
    cls = data.kind == "classification"
    mu, sd = float(tr.X.mean()), float(tr.X.std()) or 1.0
    model = {"hwc": (H, W, C), "mu": mu, "sd": sd, "cls": cls, "dev": dev}
    Xtr = to_device(images(tr.X, model), np.float32, dev)
    Xva = to_device(images(va.X, model), np.float32, dev)
    if cls:
        ym, ys, out_dim = 0.0, 1.0, tr.k
        ytr, yva = to_device(tr.y, np.int64, dev), to_device(va.y, np.int64, dev)
        loss_fn = nn.CrossEntropyLoss()
    else:
        ym, ys, out_dim = float(tr.y.mean()), float(tr.y.std()) or 1.0, 1
        ytr, yva = to_device((tr.y - ym) / ys, np.float32, dev), to_device((va.y - ym) / ys, np.float32, dev)
        loss_fn = nn.MSELoss()
    pad_mode = "circular" if p.get("circular") else "zeros"
    net = SmallCNN(C, int(p.get("c1", 16)), int(p.get("c2", 32)), out_dim, min(H, W) >= 8, pad_mode).to(dev)
    model.update(net=net, ym=ym, ys=ys, size=sum(q.numel() for q in net.parameters()))
    opt = torch.optim.AdamW(net.parameters(), lr=float(p.get("lr", 2e-3)), weight_decay=float(p.get("wd", 1e-4)))

    def output(xb):
        o = net(xb)
        return o if cls else o.squeeze(1)

    def valid_pass():                      # 验证集分批过一遍：返回 (平均损失, 准确率或 None)
        tot, hit = 0.0, 0
        for i in range(0, va.n, 1024):
            o = output(Xva[i:i + 1024])
            tot += loss_fn(o, yva[i:i + 1024]).item() * o.shape[0]
            if cls:
                hit += int((o.argmax(dim=1) == yva[i:i + 1024]).sum().item())
        return tot / va.n, (hit / va.n if cls else None)

    n, bs, patience = tr.n, int(p.get("batch", 64)), int(p.get("patience", 8))
    best, best_state, bad = math.inf, None, 0
    for ep in range(int(p.get("epochs", 60))):
        net.train()
        perm = torch.from_numpy(lib.rng.permutation(n)).to(dev)
        total, seen = torch.zeros((), device=dev), 0
        for i in range(0, n, bs):
            idx = perm[i:i + bs]
            loss = loss_fn(output(Xtr[idx]), ytr[idx])
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            total += loss.detach() * idx.numel()
            seen += idx.numel()
            if ctx.time_left() <= 0:       # 一轮可能很长：轮内也看一眼时间
                break
        net.eval()
        with torch.no_grad():
            vloss, vacc = valid_pass()
        point = {"loss": total.item() / seen, "validLoss": vloss}
        if vacc is not None:
            point["validMetric"] = vacc
        ctx.report(ep, **point)
        if vloss < best - 1e-7:
            best, bad = vloss, 0
            best_state = {key: v.detach().clone() for key, v in net.state_dict().items()}
        else:
            bad += 1
            if bad >= patience:
                ctx.log("验证集损失 %d 轮没有变好，在第 %d 轮早停。" % (patience, ep))
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
    x = images(X, model)
    outs = []
    with torch.no_grad():
        for i in range(0, max(1, len(x)), 1024):
            o = net(to_device(x[i:i + 1024], np.float32, dev))
            o = torch.softmax(o, dim=1) if model["cls"] else o.squeeze(1) * model["ys"] + model["ym"]
            outs.append(o.cpu().numpy())
    return np.concatenate(outs).astype(np.float64)


def inspect(model):
    net = model["net"]
    w1 = net.body[0].weight.detach().cpu().numpy()          # 第一层卷积核 [c1, C, 3, 3]
    return {"layers": [{"name": "第一层卷积核（每行一个核：C×3×3）", "rows": w1.shape[0], "cols": int(np.prod(w1.shape[1:])), "data": w1},
                       {"name": "输出层", "rows": net.head.weight.shape[0], "cols": net.head.weight.shape[1], "data": net.head.weight.detach().cpu().numpy()}],
            "text": "小卷积网络：输入 %d×%d×%d，%d 个参数，设备 %s" % (model["hwc"] + (model["size"], model["dev"]))}
