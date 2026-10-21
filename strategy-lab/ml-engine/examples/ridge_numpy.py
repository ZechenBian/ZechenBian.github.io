# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
# @name 岭回归（numpy，闭式解）
# @api supervised
# @kinds regression
# @families tabular, toy, image
# @needs numpy
# @params [{"key": "lam", "label": "正则强度 λ", "def": 1.0, "min": 0, "max": 1000, "step": 0.1, "type": "num", "desc": "越大，系数越往 0 收；0 就是普通最小二乘"}]
#
# 岭回归：线性模型 ŷ = b + zᵀw，z 是标准化后的特征（每一列减去训练集的均值、除以标准差）。
# 损失是 Σ(yᵢ − b − zᵢᵀw)² + λ‖w‖²（截距 b 不罚）。对 w 求导令其为 0，得到闭式解
#     w = (ZᵀZ + λI)⁻¹ Zᵀ(y − ȳ)，  b = ȳ。
# 证明梗概：特征已经中心化，所以对 b 求导给出 b = ȳ；代回去后损失是 w 的严格凸二次型（λ > 0 时 ZᵀZ + λI 正定），
# 唯一的驻点就是最小点。λ = 0 且 ZᵀZ 奇异时解不唯一，这里用最小范数解（伪逆）。
#
# 为什么先标准化：λ‖w‖² 对每个系数一视同仁，特征的单位不同（米和毫米）时罚得就不公平了。
# 没有迭代，所以学习曲线只有一个点；inspect 返回每个特征的系数（按标准化后的尺度：特征增加一个标准差，预测变化多少）。
import numpy as np


def fit(data, p, lib, ctx):
    X, y = data.train.X, data.train.y
    lam = float(p.get("lam", 1.0))
    mu = X.mean(axis=0)
    sd = X.std(axis=0)
    sd[sd == 0] = 1.0                      # 常数列：除以 1，免得除以 0
    Z = (X - mu) / sd
    ybar = float(y.mean())
    d = Z.shape[1]
    if lam > 0:
        w = np.linalg.solve(Z.T @ Z + lam * np.eye(d), Z.T @ (y - ybar))
    else:
        w = np.linalg.lstsq(Z, y - ybar, rcond=None)[0]
    model = {"mu": mu, "sd": sd, "w": w, "b": ybar, "lam": lam, "names": data.train.featureNames, "size": d + 1}
    train_mse = float(np.mean((predict(model, X) - y) ** 2))
    valid_mse = float(np.mean((predict(model, data.valid.X) - data.valid.y) ** 2))
    ctx.report(0, loss=train_mse, validLoss=valid_mse)
    return model


def predict(model, X):
    return ((X - model["mu"]) / model["sd"]) @ model["w"] + model["b"]


def inspect(model):
    w = model["w"]
    names = model["names"] or ["x%d" % (j + 1) for j in range(len(w))]
    coef = [{"name": "截距", "value": model["b"]}] + [{"name": names[j], "value": w[j]} for j in range(len(w))]
    return {"coef": coef, "text": "岭回归，λ = %g；系数按标准化后的尺度，‖w‖ = %.4g" % (model["lam"], float(np.linalg.norm(w)))}
