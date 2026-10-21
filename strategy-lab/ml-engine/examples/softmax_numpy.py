# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
# @name softmax 回归（numpy，梯度下降）
# @api supervised
# @kinds classification
# @families tabular, toy, image
# @needs numpy
# @params [{"key": "lr", "label": "学习率", "def": 0.5, "min": 0.001, "max": 5, "step": 0.001, "type": "num"}, {"key": "epochs", "label": "轮数", "def": 300, "min": 1, "max": 20000, "step": 1, "type": "int"}, {"key": "l2", "label": "L2 正则", "def": 0.0001, "min": 0, "max": 1, "step": 0.0001, "type": "num"}]
#
# 多类逻辑回归：每一类一个线性打分 sᵢ = zᵀW + b（z 是标准化后的特征），概率是 softmax：P(类 c | x) = exp(s_c) / Σ_j exp(s_j)。
# 损失是平均交叉熵 L = −(1/n) Σᵢ log P(yᵢ | xᵢ) 再加 (λ/2)‖W‖²。
# 梯度有个干净的形式：记 G = P − Y（Y 是 one-hot，P 是概率矩阵），则 ∂L/∂W = ZᵀG/n + λW，∂L/∂b = 1ᵀG/n。
# 证明梗概：∂(−log softmax(s)_y)/∂s_c = P_c − [c = y]，再用链式法则 s = zᵀW + b。
# L 是 (W, b) 的凸函数（log-sum-exp 凸，加上线性项），λ > 0 时严格凸，所以学习率够小时全批量梯度下降收敛到唯一的最优点。
#
# 每隔几轮在验证集上算一次损失和准确率（ctx.report），并请实验室拍一张快照（ctx.snapshot：二维数据会画出决策面的变化）。
# 时间预算用完（ctx.time_left() <= 0）就停下。
import numpy as np


def softmax(S):
    S = S - S.max(axis=1, keepdims=True)    # 减去每行最大值：数值上稳定，结果不变
    E = np.exp(S)
    return E / E.sum(axis=1, keepdims=True)


def fit(data, p, lib, ctx):
    tr, va = data.train, data.valid
    n, d, k = tr.n, tr.d, tr.k
    lr, epochs, l2 = float(p.get("lr", 0.5)), int(p.get("epochs", 300)), float(p.get("l2", 1e-4))
    mu = tr.X.mean(axis=0)
    sd = tr.X.std(axis=0)
    sd[sd == 0] = 1.0
    Z = (tr.X - mu) / sd
    W = np.zeros((d, k))
    b = np.zeros(k)
    model = {"mu": mu, "sd": sd, "W": W, "b": b, "size": d * k + k}
    every = max(1, epochs // 200)            # 学习曲线大约 200 个点
    rows = np.arange(n)
    for ep in range(epochs):
        P = softmax(Z @ W + b)
        loss = -np.mean(np.log(P[rows, tr.y] + 1e-12)) + 0.5 * l2 * np.sum(W * W)
        G = P.copy()
        G[rows, tr.y] -= 1.0
        G /= n
        W -= lr * (Z.T @ G + l2 * W)         # 原地更新：model 里的 W、b 跟着变
        b -= lr * G.sum(axis=0)
        if ep % every == 0 or ep == epochs - 1:
            Pv = predict(model, va.X)
            vloss = -np.mean(np.log(Pv[np.arange(va.n), va.y] + 1e-12))
            ctx.report(ep, loss=float(loss), validLoss=float(vloss),
                       trainMetric=float(np.mean(P.argmax(axis=1) == tr.y)), validMetric=float(np.mean(Pv.argmax(axis=1) == va.y)))
            ctx.snapshot(ep, model)
        if ctx.time_left() <= 0:
            ctx.log("时间预算用完，在第 %d 轮停下。" % ep)
            break
    return model


def predict(model, X):
    return softmax(((X - model["mu"]) / model["sd"]) @ model["W"] + model["b"])


def inspect(model):
    W = model["W"]
    return {"layers": [{"name": "W（特征 × 类别）", "rows": W.shape[0], "cols": W.shape[1], "data": W}],
            "text": "softmax 回归：%d 个特征、%d 类；‖W‖ = %.4g" % (W.shape[0], W.shape[1], float(np.linalg.norm(W)))}
