# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
# @name AR(p) 自回归（numpy，最小二乘）
# @api forecast
# @kinds forecast
# @families timeseries
# @needs numpy
# @params [{"key": "order", "label": "阶数 p", "def": 3, "min": 1, "max": 60, "step": 1, "type": "int", "desc": "用过去几个值来预测下一个"}]
#
# AR(p) 模型：y_t = c + φ₁ y_{t−1} + … + φ_p y_{t−p} + ε_t，ε_t 独立同分布、均值 0。
# 在训练段上用最小二乘估计 (c, φ)：把每个 t ≥ p 写成一行 [1, y_{t−1}, …, y_{t−p}]，目标是 y_t，求 argmin ‖Xβ − y‖²。
# 多步预测用"递推"：先预测 ŷ_{t+1}，把它当成观测值放回去，再预测 ŷ_{t+2}，……
# 在 ε 的均值为 0、参数已知时，这样得到的恰好是条件期望 E[y_{t+h} | y_{≤t}]（对 h 归纳：线性 + 期望的线性性），即平方损失下的最优预测。
#
# 平稳性：特征多项式 z^p − φ₁ z^{p−1} − … − φ_p 的根都在单位圆内时（等价地，伴随矩阵的谱半径 < 1），过程是（弱）平稳的，
# 多步预测会收敛到均值 c / (1 − Σφ)。inspect 会把这个谱半径写出来。
# 预测时不需要 update：forecast 每次都拿到截至当前时刻的全部观测 past，直接用最后 p 个。
import numpy as np


def design(y, q):
    """第 t 行（t = q … len(y)−1）是 [1, y[t−1], …, y[t−q]]"""
    m = len(y) - q
    cols = [np.ones(m)] + [y[q - j - 1: len(y) - j - 1] for j in range(q)]
    return np.column_stack(cols), y[q:]


def fit(series, p, lib, ctx):
    y = series.y
    q = max(1, min(int(p.get("order", 3)), len(y) // 3))
    X, t = design(y, q)
    beta = np.linalg.lstsq(X, t, rcond=None)[0]
    resid = t - X @ beta
    model = {"c": float(beta[0]), "phi": beta[1:], "q": q, "sigma": float(np.std(resid)), "size": q + 1}
    # 验证段上的一步预测误差（只是给学习曲线一个参考点）
    full = np.concatenate([y, series.valid.y])
    Xv, tv = design(full, q)
    Xv, tv = Xv[len(y) - q:], tv[len(y) - q:]
    ctx.report(0, loss=float(np.mean(resid ** 2)), validLoss=float(np.mean((tv - Xv @ beta) ** 2)))
    return model


def forecast(model, past, h):
    q, c, phi = model["q"], model["c"], model["phi"]
    hist = list(past[-q:])
    if len(hist) < q:                     # 开头的时刻观测还不够 p 个：用最早的值补齐
        hist = [hist[0]] * (q - len(hist)) + hist
    out = []
    for _ in range(h):
        nxt = c + sum(phi[j] * hist[-1 - j] for j in range(q))
        out.append(nxt)
        hist.append(nxt)
    return np.array(out)


def inspect(model):
    q, phi = model["q"], model["phi"]
    roots = np.roots(np.concatenate([[1.0], -phi])) if q > 0 else np.array([])
    rho = float(np.max(np.abs(roots))) if roots.size else 0.0
    coef = [{"name": "常数 c", "value": model["c"]}] + [{"name": "φ%d（y[t−%d]）" % (j + 1, j + 1), "value": float(phi[j])} for j in range(q)]
    return {"coef": coef, "text": "AR(%d)：残差标准差 σ = %.4g；伴随矩阵的谱半径 = %.4f（< 1 才平稳）" % (q, model["sigma"], rho)}
