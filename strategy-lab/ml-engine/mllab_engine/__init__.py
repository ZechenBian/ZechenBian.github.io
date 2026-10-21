# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
"""机器学习实验室 · 本机 Python 引擎。

页面（strategy-lab/ml/index.html）在浏览器里生成数据、划分训练 / 验证 / 测试，
把训练集、验证集和测试集的输入（没有测试集的答案）发给这个引擎；
引擎在一个单独的子进程里执行用户写的 Python 算法（fit / predict / forecast），
把原始的预测值传回页面，页面再用和第一期同一份 JavaScript 代码打分。
所以指标的定义只有一处（src/ml/stats.js），这里一个指标都不算。"""

__version__ = "0.1.0"
