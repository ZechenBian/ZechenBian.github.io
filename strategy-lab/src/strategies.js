// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 内置规则模板。每个模板 = 代码（用户能看能改）+ 参数表 + 四段说明。
 * 说明的格式和 Claude 面板输出的格式相同：假设 / 目标 / 最优性 / 何时失效 / 可检验的预测。
 * tier: "proven" 在所述模型与目标下可证最优；"family" 只在这个策略族内参数最优；"heuristic" 启发式，无保证。 */
var QL_STRATS = (function () {
  var R = String.raw;
  function n(key, label, def, min, max, step, extra) { var o = { key: key, label: label, def: def, min: min, max: max, step: step, type: "num" }; if (extra) for (var k in extra) o[k] = extra[k]; return o; }
  function b(key, label, def) { return { key: key, label: label, def: def, type: "bool" }; }
  var L = [];

  L.push({
    id: "const", name: "固定比例（Kelly / Merton）", group: "基准",
    summary: "每一步都把仓位调回净值的 f 倍。",
    params: [n("f", "仓位比例 f", 1, -1, 5, 0.05)],
    scaleKey: "f",
    code:
`// 固定比例：每一步都把仓位调回净值的 f 倍。
// f = 1 是满仓，0.5 是半仓，2 是两倍杠杆，负数是做空。
function decide(s, p) {
  return p.f;
}`,
    explain: {
      tier: "proven",
      assume: R`各步收益 $r_t$ 独立同分布（或价格是几何布朗运动）：过去不携带关于未来的任何信息。没有交易成本。`,
      objective: R`长期增长率 $g(f)=\mathbb{E}\,\log(1+f\,r)$，也就是 $\tfrac1T\,\mathbb{E}\log W_T$。`,
      optimal: R`**定理（Kelly 1956，Breiman 1961）。** 设 $r_1,r_2,\dots$ 独立同分布，$g$ 在可行域 $\{f:\ 1+f\,r_1>0\ \text{几乎必然}\}$ 内取到最大值，允许的策略是任意只依赖过去的仓位 $f_t$。则使 $\mathbb{E}\log W_T$ 最大的策略是常数 $f_t\equiv f^*=\arg\max_f g(f)$。（记号里把无风险利率取成 0；一般情形把 $1+f\,r$ 换成 $1+f\,r+(1-f)\,r_f$。）

**证明思路。** $\log W_T=\sum_t\log(1+f_t r_{t+1})$。因为 $r_{t+1}$ 与 $\mathcal F_t$ 独立，$\mathbb{E}[\log(1+f_t r_{t+1})\mid\mathcal F_t]=g(f_t)\le g(f^*)$，逐项求和即得；$r$ 不是常数时 $g$ 严格凹，所以 $f^*$ 唯一。Breiman 进一步证明 $f^*$ 策略的净值渐近几乎必然超过任何本质不同的策略。

几何布朗运动、连续再平衡时 $g(f)=r_f+f(\mu-r_f)-\tfrac12 f^2\sigma^2$（$r_f$ 是无风险利率），于是 $f^*=(\mu-r_f)/\sigma^2$（Merton 1969）。`,
      fails: R`$\mu$ 和 $\sigma$ 要靠估计，而 $f^*$ 对 $\mu$ 的误差非常敏感。在几何布朗运动里 $g(2f^*)=r_f$：下注量是最优值的两倍时，增长率退回到无风险利率，再多就低于无风险利率。所以实践中常用半 Kelly。厚尾和向下的跳跃会让最优比例更小，并出现一个不能越过的杠杆上限。有比例交易成本时，最优的不再是每步调回 $f^*$，而是等仓位漂出 $f^*$ 两侧的一条不交易带才调（Taksar–Klass–Assaf 1988；Davis–Norman 1990）。`,
      test: R`杠杆曲线应在 $f^*$ 处取峰值，并在 $2f^*$ 附近回到无风险利率。`
    }
  });

  L.push({
    id: "hold", name: "买入持有", group: "基准",
    summary: "始终满仓，所有主动规则的参照物。",
    params: [],
    code:
`// 买入持有：始终满仓。它是所有主动规则的参照物。
function decide(s, p) {
  return 1;
}`,
    explain: {
      tier: "heuristic",
      assume: R`不需要任何模型。`,
      objective: R`没有优化目标，它是"什么都不做"的基线。`,
      optimal: R`一般不是最优。在几何布朗运动里，只有当 $(\mu-r_f)/\sigma^2$ 恰好等于 1 时满仓才是对数最优；这个比值大于 1 说明应该加杠杆，小于 1 说明应该留现金。`,
      fails: R`它本身不会"失效"，但回撤完全由市场决定。`,
      test: R`杠杆曲线在 $\lambda=1$ 处通常不是峰值，峰值的位置就是这个世界里的 Kelly 比例。`
    }
  });

  L.push({
    id: "ma", name: "均线交叉", group: "趋势",
    summary: "短均线在长均线上方时持有，否则空仓或做空。",
    params: [n("fast", "短均线（步）", 10, 2, 100, 1), n("slow", "长均线（步）", 50, 5, 300, 1), n("size", "仓位大小", 1, 0, 3, 0.05), b("short", "下方时做空", false)],
    scaleKey: "size",
    code:
`// 均线交叉：短均线在长均线之上持有，否则空仓（或做空）。
function decide(s, p) {
  var fast = s.sma(p.fast), slow = s.sma(p.slow);
  if (!(slow === slow)) return 0;            // 数据还不够算长均线
  if (fast > slow) return p.size;
  return p.short ? -p.size : 0;
}`,
    explain: {
      tier: "heuristic",
      assume: R`价格有会持续的趋势：收益正自相关，或者市场在"牛""熊"状态之间缓慢切换。`,
      objective: R`没有显式目标。`,
      optimal: R`不是任何标准模型下的最优解。在牛熊切换模型里，最优仓位是"当前处于牛市"的后验概率 $\pi_t$ 的函数：无成本时 $f_t\approx\mathbb{E}[r\mid\pi_t]/\mathrm{Var}[r\mid\pi_t]$，随 $\pi_t$ 连续变化；有交易成本且只能满仓或空仓时，最优解是对 $\pi_t$ 的双阈值规则（Dai–Zhang–Zhu 2010）。均线差只是 $\pi_t$ 的一个粗糙代理。

在独立同分布或几何布朗运动的世界里它没有预测力：仓位 $f_t$ 与未来收益独立，$\mathbb{E}\log(1+f_t r)=\mathbb{E}\,g(f_t)\le g(\mathbb{E}f_t)$（Jensen 不等式，$g$ 是凹函数），所以它的增长率不会超过仓位取其平均值的固定比例策略，还要白付换手成本。`,
      fails: R`震荡行情里反复被打脸；两个窗口长度非常容易过拟合。`,
      test: R`在几何布朗运动里对 (短均线, 长均线) 做二维扫描：热力图是一片平地，处处不超过"仓位取其平均值的固定比例"。默认参数下 $g(1)-g(0)=\mu-r_f-\tfrac12\sigma^2>0$（满仓比空仓涨得快），所以也处处不如买入持有；若 $\mu-r_f<\tfrac12\sigma^2$，买入持有的增长率还不如把钱放在无风险利率上，任何减少持仓时间的规则都会胜出，但那不是预测力。换到牛熊切换世界，长均线取 50–100 步时夏普明显高于买入持有（回撤小得多），增长率则和买入持有差不多，略低一点。换到 $H>\tfrac12$ 的分数布朗运动，优势大得多，而且窗口越短越好；$H<\tfrac12$ 时它系统性亏损。`
    }
  });

  L.push({
    id: "mom", name: "时间序列动量", group: "趋势",
    summary: "过去 n 步涨了就做多，跌了就做空或空仓。",
    params: [n("n", "回看窗口（步）", 20, 1, 250, 1), n("size", "仓位大小", 1, 0, 3, 0.05), b("short", "下跌时做空", true)],
    scaleKey: "size",
    code:
`// 时间序列动量：过去 n 步涨了就做多，跌了就做空（或空仓）。
function decide(s, p) {
  var m = s.mom(p.n);                        // 过去 n 步的累计收益
  if (!(m === m)) return 0;
  if (m > 0) return p.size;
  return p.short ? -p.size : 0;
}`,
    explain: {
      tier: "heuristic",
      assume: R`收益正自相关：$\mathbb{E}[r_{t+1}\mid\text{过去}]$ 与过去的收益同号。`,
      objective: R`没有显式目标。`,
      optimal: R`在 AR(1) 世界 $r_{t+1}-\mu\Delta=\varphi\,(r_t-\mu\Delta)+\varepsilon$ 里（$\Delta$ 是每步的时长，$\sigma^2\Delta$ 是单步收益的无条件方差），短视的对数最优仓位在二阶近似下对最近一步收益是线性的：
$$f_t\approx\frac{\mu\Delta+\varphi\,(r_t-\mu\Delta)}{\sigma^2\Delta\,(1-\varphi^2)}$$
（无风险利率取 0；不为 0 时分子再减去 $r_f\Delta$）。
符号规则只保留了方向，丢掉了信号强度，所以即使在它最适合的世界里也只是一个粗化的近似。`,
      fails: R`$\varphi\le 0$ 时系统性亏损；每次翻转都要付两倍的换手成本。`,
      test: R`在 AR(1) 世界里，把窗口设为 1、交易成本设为 0，再把 $\varphi$ 从 $-0.2$ 调到 $0.2$：增长率相对基准的差应随 $\varphi$ 单调上升，并在 $\varphi$ 略大于 0 处由负转正（$\varphi=0$ 时它没有任何信号，却放弃了基准的漂移）。窗口更长或有成本时，转正的位置更靠右。`
    }
  });

  L.push({
    id: "meanrev", name: "均值回复（z 分数带）", group: "均值回复",
    summary: "价格偏离滚动均线若干个标准差时反向开仓，回到均线附近平仓。",
    params: [n("n", "均线窗口（步）", 20, 5, 200, 1), n("entry", "开仓阈值（标准差）", 1.5, 0.3, 3.5, 0.05), n("exit", "平仓阈值（标准差）", 0.3, 0, 1.5, 0.05), n("size", "仓位大小", 1, 0, 3, 0.05), b("short", "允许做空", true)],
    scaleKey: "size",
    code:
`// 均值回复：价格比 n 步均线低 entry 个标准差时买入，回到 exit 以内时平仓；
// 高出 entry 个标准差时做空（可关）。
function init(p) {
  return { side: 0 };                        // 每条路径各自记住当前方向
}
function decide(s, p, st) {
  var z = s.z(p.n);                          // (价格 − 均线) / 滚动标准差
  if (!(z === z)) return 0;
  if (st.side === 0) {
    if (z < -p.entry) st.side = 1;
    else if (z > p.entry && p.short) st.side = -1;
  } else if (st.side === 1 && z > -p.exit) st.side = 0;
  else if (st.side === -1 && z < p.exit) st.side = 0;
  return st.side * p.size;
}`,
    explain: {
      tier: "heuristic",
      assume: R`价格围绕一个缓慢变化的均值来回摆动（OU 型过程）。`,
      objective: R`没有显式目标。`,
      optimal: R`带状规则的**形状**有理论依据：有交易成本时，OU 过程上的最优买卖时机确实是阈值型的。Zhang–Zhang (2008) 对带交易成本的反复买卖、Leung–Li (2015) 对固定成本下的一次进出（最优双重停时）证明了这一点，阈值由变分不等式（自由边界问题）决定；Bertram (2010) 则在阈值规则族内解出了使单位时间期望收益最大的阈值。但这里用滚动均线和滚动标准差代替真实的均衡价和平稳标准差，阈值也不是解出来的，所以谈不上最优，只能在这个规则族里调参。`,
      fails: R`均值本身在漂移（出现趋势）时会一路逆势持仓；窗口 n 与真实半衰期不匹配时信号失真。`,
      test: R`在均值回复世界里对 (开仓阈值, 窗口) 做扫描会出现一片高地；把交易成本调到 0，最优开仓阈值应明显变小（无成本时连续调仓的线性规则更优）。`
    }
  });

  L.push({
    id: "band", name: "固定阈值带（已知均衡价）", group: "均值回复",
    summary: "价格跌出均衡价下方的带就买，回到退出点平仓；上方对称做空。",
    params: [n("theta", "均衡价 θ", 100, 20, 500, 1), n("width", "带宽", 5, 0.5, 30, 0.25, { unit: "%" }), n("exit", "退出点（相对 θ）", 0, -30, 30, 0.25, { unit: "%", hint: "0 = 回到均衡价就平仓；等于带宽 = 到对侧的带才平仓" }), n("size", "仓位大小", 1, 0, 3, 0.05), b("short", "允许做空", true)],
    scaleKey: "size",
    code:
`// 固定阈值带：已知均衡价 theta。
// 对数偏离 x = ln(S/theta)。x < −width 时买入，x ≥ exit 时平仓；做空对称。
function init(p) {
  return { side: 0 };
}
function decide(s, p, st) {
  var x = Math.log(s.price / p.theta);
  var w = p.width / 100, e = p.exit / 100;
  if (st.side === 0) {
    if (x < -w) st.side = 1;
    else if (x > w && p.short) st.side = -1;
  } else if (st.side === 1 && x >= e) st.side = 0;
  else if (st.side === -1 && x <= -e) st.side = 0;
  return st.side * p.size;
}`,
    explain: {
      tier: "family",
      assume: R`对数价格是 OU 过程 $dX=\kappa(\ln\theta-X)\,dt+\sigma\,dW$，并且均衡价 $\theta$ 已知。`,
      objective: R`单位时间的期望对数收益，即长期增长率（扣除每次进出的固定比例成本）。`,
      optimal: R`**族内最优解的形状已知，参数待定。** Bertram (2010) 证明：在 OU 过程上，在"在 $a$ 处进入、在 $m$ 处退出"的规则族内，使单位时间期望收益最大的解满足 $m=-a$，即退出点在均衡价另一侧与进入点对称的位置，而 $a$ 由 $(\kappa,\sigma,\text{成本})$ 决定的一个超越方程给出。所以这个规则族包含了那个解（把"退出点"设成等于带宽），但带宽要靠扫描去找。`,
      fails: R`$\theta$ 估错或发生结构性变化时，会长期持有一个不会回来的仓位；带太窄则成本吃掉全部利润。`,
      test: R`关闭做空，对 (带宽, 退出点) 做二维扫描，目标取增长率。有成本时，最高点落在 退出点 = 带宽 的对角线上，成本越高最优带宽越大（成本只有几个基点时，对角线附近很平）；成本为 0 时最优带宽趋于 0，最优的退出点也贴着均衡价：退出点在均衡价上下 1% 以内几乎没有差别，再远就明显变差（偏出 6% 时每年少约 2 个百分点）。带宽固定得偏大时，最优退出点会落在 0 和带宽之间。`
    }
  });

  L.push({
    id: "oukelly", name: "线性均值回复（OU 下的对数最优）", group: "均值回复",
    summary: "仓位随对数偏离线性变化：f = (κ·ln(θ/S) + σ²/2 − r_f)/σ²。",
    params: [n("kappa", "回复速度 κ（你的估计）", 5, 0.2, 60, 0.1, { unit: "/年" }), n("theta", "均衡价 θ（你的估计）", 100, 20, 500, 1), n("sigma", "波动 σ（你的估计）", 20, 1, 120, 0.5, { unit: "%/年" }), n("shrink", "整体收缩系数", 1, 0, 1.5, 0.01)],
    scaleKey: "shrink",
    code:
`// OU 世界里的对数最优仓位（连续时间、无成本）：
//   f = (kappa · ln(theta / S) + sigma² / 2 − r_f) / sigma²
// kappa、theta、sigma 是你对这个世界的估计；shrink 是整体收缩系数。
function decide(s, p) {
  var sg = p.sigma / 100;
  var drift = p.kappa * Math.log(p.theta / s.price) + 0.5 * sg * sg;   // 瞬时期望收益（年率）
  return p.shrink * (drift - s.rf * s.K) / (sg * sg);                  // s.rf 是每步的无风险利率，乘以每年步数换成年率
}`,
    explain: {
      tier: "proven",
      assume: R`对数价格是 OU 过程，参数 $(\kappa,\theta,\sigma)$ 已知；可以连续调仓，没有交易成本。`,
      objective: R`$\mathbb{E}\log W_T$。`,
      optimal: R`**定理（对数效用的短视性）。** 设价格满足 $dS/S=\mu_t\,dt+\sigma_t\,dW$，$\mu_t,\sigma_t$ 是适应过程，$\sigma_t>0$，且 $\mathbb{E}\int_0^T\bigl((\mu_t-r_f)/\sigma_t\bigr)^2dt<\infty$。则最大化 $\mathbb{E}\log W_T$ 的仓位是 $f_t=(\mu_t-r_f)/\sigma_t^2$。

**证明思路。** 由 Itô 公式，$d\log W=\bigl(r_f+f_t(\mu_t-r_f)-\tfrac12 f_t^2\sigma_t^2\bigr)dt+f_t\sigma_t\,dW$。对满足 $\mathbb{E}\int_0^T f_t^2\sigma_t^2\,dt<\infty$ 的策略，随机积分项是鞅，取期望后消失（一般情形用局部化）；剩下的被积函数对每个 $(t,\omega)$ 分别是 $f_t$ 的凹二次函数，逐点最大化即可，不需要考虑未来（没有跨期对冲需求）。

OU 情形：$X=\ln S$ 满足 $dX=\kappa(\ln\theta-X)dt+\sigma dW$，由 Itô 公式 $dS/S=\bigl(\kappa(\ln\theta-X)+\tfrac12\sigma^2\bigr)dt+\sigma dW$，代入即得代码里的公式。`,
      fails: R`参数估错时线性系数整体偏离；仓位随偏离无界增长，实际会被杠杆上限截断；有交易成本时连续调仓的换手很大，净增长率可能输给带状规则。`,
      test: R`把参数设成与世界一致、成本设为 0、仓位上下限放宽到 ±10，对"收缩系数"做扫描，峰值应在 1 附近。连续时间的最优解没有仓位上限；按天调仓时，仓位越大，一步之内亏光的风险越大。默认参数下这种路径极少，上下限放到 ±20 也还没有路径破产（换一批路径偶尔会碰上一两条）。把每年的步数调小（比如 52），或者只把世界的波动调大、规则里的估计不跟着改，就会出现增长率变成 $-\infty$ 的情形；世界和规则的 $\sigma$ 一起调大则不会成批破产：仓位按 $1/\sigma$ 缩小，一步之内亏光的风险不再随 $\sigma$ 增加（只是 ±20 的上下限截到仓位的时候少了，碰上一两条破产路径的批次会多一些）。`
    }
  });

  L.push({
    id: "voltarget", name: "波动率目标", group: "风险管理",
    summary: "让组合的预期波动保持在目标值：波动高就减仓，低就加仓。",
    params: [n("target", "目标波动", 15, 2, 60, 0.5, { unit: "%/年" }), n("n", "估计窗口（步）", 20, 5, 120, 1), n("cap", "仓位上限", 2, 0.5, 5, 0.1)],
    scaleKey: "target",
    code:
`// 波动率目标：让组合的预期波动保持在 target。
// 已实现波动高就减仓，低就加仓。
function decide(s, p) {
  var v = s.vol(p.n);                        // 最近 n 步的每步波动
  if (!(v > 0)) return 0;
  var annual = v * Math.sqrt(s.K);           // 年化
  return Math.min(p.cap, p.target / 100 / annual);
}`,
    explain: {
      tier: "family",
      assume: R`波动可以预测（有聚集性），而期望超额收益的上升慢于方差：例如夏普比率恒定（$\mu_t-r_f=\lambda\sigma_t$），或期望收益与波动无关。`,
      objective: R`在给定平均风险下提高夏普比率或增长率。`,
      optimal: R`由"线性均值回复"里的短视性定理，对数最优仓位是 $f_t=(\mu_t-r_f)/\sigma_t^2$，所以答案取决于风险溢价怎样随波动变化：

- 夏普比率恒定，$\mu_t-r_f=\lambda\sigma_t$：$f_t=\lambda/\sigma_t$，这正是波动率目标，目标波动等于 $\lambda$。此时它就是对数最优解。
- 期望收益与波动无关（这里的 GARCH、Heston 世界）：$f_t=(\mu-r_f)/\sigma_t^2$，与**方差**成反比（Moreira–Muir 2017 的经验研究用的也是方差的倒数）。波动率目标与**标准差**成反比：方向一致，反应不足。
- 风险溢价与方差成正比，$\mu_t-r_f=\gamma\sigma_t^2$：$f_t\equiv\gamma$，按波动择时没有好处。

另外 $\sigma_t$ 只能用已实现波动去估计。所以它是一个规则族：在"夏普恒定"的模型下包含最优解，在别的模型下只是方向正确。`,
      fails: R`风险溢价与方差成正比（$\mu_t-r_f\propto\sigma_t^2$）时好处消失；估计窗口短则仓位抖动、换手高，窗口长则反应迟钝。`,
      test: R`在 Heston 世界里，它的夏普应高于买入持有（默认参数下约 0.44 对 0.40；固定比例的夏普与买入持有相同）。GARCH 的默认参数下波动起伏不大，两者分不出高低（约 0.37 对 0.39）；把 α 调到 0.15、β 调到 0.84，才拉开到 0.52 对 0.41。在独立同分布的正态世界里两者应无差别，甚至因估计噪声略差。`
    }
  });

  L.push({
    id: "stop", name: "止损与再入场", group: "风险管理",
    summary: "从持仓以来的最高价回撤超过阈值就清仓，等价格创新高再回来。",
    params: [n("stop", "止损幅度", 10, 1, 50, 0.5, { unit: "%" }), n("n", "再入场：创 n 步新高", 20, 2, 120, 1), n("size", "仓位大小", 1, 0, 3, 0.05)],
    scaleKey: "size",
    code:
`// 止损：价格从持仓以来的最高点回撤超过 stop 就清仓；
// 之后等价格创 n 步新高再入场。
function init(p) {
  return { inPos: true, peak: 0 };
}
function decide(s, p, st) {
  if (st.inPos) {
    if (s.price > st.peak) st.peak = s.price;
    if (s.price < st.peak * (1 - p.stop / 100)) { st.inPos = false; st.peak = 0; }
  } else if (s.t >= p.n && s.price >= s.hi(p.n)) {
    st.inPos = true; st.peak = s.price;
  }
  return st.inPos ? p.size : 0;
}`,
    explain: {
      tier: "heuristic",
      assume: R`下跌会持续（动量，或者进入了熊市状态）。`,
      objective: R`限制单次回撤。`,
      optimal: R`**在鞅世界里止损不创造价值。** 若每步超额收益的条件期望为零（折现后的价格是鞅），那么对任何有界的、只依赖过去的仓位比例 $f_t$，折现后的净值 $W_{t+1}=W_t(1+f_t r_{t+1})$ 仍是鞅（鞅变换），$\mathbb{E}W_T=W_0$；止损只是其中一种规则。它改变的是分布的形状：把少数大亏换成多次小亏。Kaminski–Lo (2014) 证明：收益独立同分布、风险溢价为正时，止损降低期望收益，降幅等于空仓时间的比例乘以风险溢价；在动量或状态切换的世界里才可能有正的"止损溢价"。`,
      fails: R`震荡行情里被反复洗出，每次都卖在低点、买在高点；跳空时实际成交价会远差于止损线。`,
      test: R`在几何布朗运动里，它的增长率不会高于平均仓位相同的固定比例策略（理由同均线交叉：Jensen 不等式），而最大回撤分布的右尾会变短；默认参数下（$\mu-r_f>\tfrac12\sigma^2$）它因此也输给买入持有。要靠择时本身赢过买入持有，得换到牛熊切换这类有记忆的世界。`
    }
  });

  L.push({
    id: "cppi", name: "CPPI（固定比例组合保险）", group: "风险管理",
    summary: "保住净值的一个底线，把高出底线的\"安全垫\"放大 m 倍投入风险资产。",
    params: [n("floor", "保底线（初始净值的比例）", 80, 50, 99, 1, { unit: "%" }), n("m", "乘数 m", 4, 1, 10, 0.1), n("cap", "仓位上限", 2, 0.5, 5, 0.1)],
    scaleKey: "m",
    code:
`// CPPI：保住净值的 floor 部分，把高出的"安全垫"放大 m 倍投入风险资产。
// 初始净值为 1，所以 floor = 80 表示保住 0.8。
function decide(s, p) {
  var cushion = s.wealth - p.floor / 100;
  if (cushion <= 0) return 0;
  return Math.min(p.cap, p.m * cushion / s.wealth);
}`,
    explain: {
      tier: "proven",
      assume: R`价格是几何布朗运动，可以连续交易，没有跳跃，没有交易成本；杠杆不受限制（仓位上限不起作用）。`,
      objective: R`带最低净值约束的幂效用：$\max\ \mathbb{E}\,\dfrac{(W_T-F)^{1-\gamma}}{1-\gamma}$，要求始终 $W_t\ge F$。`,
      optimal: R`**定理（Merton 1971；Black–Perold 1992）。** 在上述假设下，最优策略把投入风险资产的**金额**保持为安全垫的常数倍：$f_t W_t=m\,(W_t-F)$，其中 $m=(\mu-r_f)/(\gamma\sigma^2)$。也就是说 CPPI 正是这类效用（HARA）下的最优策略，乘数 $m$ 对应风险厌恶系数 $\gamma$。这里的底线是常数，对应无风险利率 $r_f=0$；$r_f\ne0$ 时定理里的 $F$ 要换成它的现值 $F e^{-r_f(T-t)}$，约束相应地是 $W_t\ge F e^{-r_f(T-t)}$，代码里仍用常数底线，与定理差这一个折现。

**证明思路。** 令 $C_t=W_t-F$（无风险利率为 0 时 $F$ 是常数）。$C_t$ 的动态与"没有底线、初始净值为 $C_0$"的 Merton 问题完全相同，而后者的最优解是对 $C_t$ 的固定比例 $m$。`,
      fails: R`一步之内跌幅超过 $1/m$ 就会击穿底线（跳空风险），所以 $m$ 越大对跳跃越脆弱；震荡行情里它高买低卖，损耗约与 $m^2\sigma^2$ 成正比。`,
      test: R`终值分布应在保底线处被截断（没有跳跃时 $P(W_T<F)\approx 0$）。换到跳跃扩散世界：要一步之内跌掉 $1/m$ 以上才会跌穿底线。默认的倍数 $m=4$ 对应 25%，默认的跳跃没有这么大，截断照旧；把倍数调到 8（一步跌 12.5% 就够），就能看到终值落到底线以下的路径。`
    }
  });

  L.push({
    id: "kellyest", name: "滚动估计的 Kelly", group: "基准",
    summary: "用过去 n 步估计均值和方差，按收缩后的 (均值 − 无风险利率)/方差 下注。",
    params: [n("n", "估计窗口（步）", 120, 20, 500, 1), n("shrink", "收缩系数", 0.5, 0, 1, 0.01), n("cap", "仓位上限（绝对值）", 2, 0.5, 5, 0.1)],
    scaleKey: "shrink",
    code:
`// 用过去 n 步估计每步收益的均值和方差，按 shrink × (均值 − 无风险利率) / 方差 下注。
// 看看"参数要靠估计"会让 Kelly 变得多糟。
function decide(s, p) {
  var m = s.mean(p.n), v = s.vol(p.n);
  if (!(v > 0)) return 0;
  var f = p.shrink * (m - s.rf) / (v * v);
  return Math.max(-p.cap, Math.min(p.cap, f));
}`,
    explain: {
      tier: "family",
      assume: R`收益独立同分布，但 $\mu$、$\sigma$ 未知，只能从过去的数据里估计。`,
      objective: R`长期增长率。`,
      optimal: R`参数已知时 $f^*=\mu/\sigma^2$ 最优（无风险利率取 0），但把估计值代进去就不是了。用长度为 $\tau$ 年的窗口估计，$\hat\mu$ 的标准误是 $\sigma/\sqrt{\tau}$，与采样频率无关：$\sigma=20\%$ 时，要 25 年的数据才能把它降到 4%。

在几何布朗运动里 $g$ 是二次函数，若 $\hat f$ 无偏且与未来独立，则
$$\mathbb{E}\,g(\hat f)=g(f^*)-\tfrac12\sigma^2\,\mathrm{Var}(\hat f),\qquad \mathrm{Var}(\hat f)\approx\frac{1}{\sigma^2\tau}.$$
估计噪声直接以方差的形式从增长率里扣除。对 $c\hat f$ 做同样的计算，最优的收缩系数是 $c^*=f^{*2}/(f^{*2}+\mathrm{Var}\hat f)<1$，这就是"分数 Kelly"的一个理由。`,
      fails: R`窗口短时 $\hat f$ 的噪声远大于 $f^*$ 本身，策略实际上是在随机加减杠杆，全靠仓位上限兜底。`,
      test: R`把交易成本设为 0、仓位上限放宽，对"收缩系数"做扫描，峰值应远小于 1：默认的几何布朗运动（$\mu=8\%$，$\sigma=20\%$）、窗口 120 步时，按上式 $c^*\approx 0.07$；有成本时峰值更靠近 0。对"估计窗口"做扫描，在独立同分布的世界里窗口越长越好。`
    }
  });

  L.push({
    id: "grid", name: "网格", group: "均值回复",
    summary: "价格每比锚定价低一格就多买一份，每高一格就少一份。",
    params: [n("grid", "格距", 3, 0.5, 20, 0.25, { unit: "%" }), n("unit", "每格加减的仓位", 0.2, 0.02, 1, 0.01), n("base", "锚定价处的仓位", 0.5, 0, 2, 0.05), n("minPos", "仓位下限", 0, -1, 1, 0.05), n("maxPos", "仓位上限", 2, 0.5, 4, 0.05)],
    code:
`// 网格：价格每比锚定价低一格就多买一份，每高一格就少一份。
// 锚定价取每条路径的起始价。
function init(p) {
  return { anchor: 0 };
}
function decide(s, p, st) {
  if (s.t === 0) st.anchor = s.price;
  var steps = Math.round(Math.log(st.anchor / s.price) / (p.grid / 100));   // 低于锚定价多少格
  return Math.max(p.minPos, Math.min(p.maxPos, p.base + p.unit * steps));
}`,
    explain: {
      tier: "family",
      assume: R`价格在锚定价附近来回震荡（均值回复）。`,
      objective: R`没有显式目标；实际上是在做空波动：价格来回震荡时赚钱，单边走远时亏钱（相当于卖出"价格不回来"的保险）。`,
      optimal: R`网格是"仓位随对数偏离线性变化"的离散化。在 OU 世界里，这个线性形式正是对数最优解的形式（见"线性均值回复"）：最优斜率是每单位对数偏离 $\kappa/\sigma^2$ 份仓位，对应到网格就是 每格仓位 ÷ 格距 $=\kappa/\sigma^2$。所以在 OU 世界里，当格距趋于 0、每格仓位 ÷ 格距 $=\kappa/\sigma^2$、锚定价等于 $\theta$、锚定价处的仓位取 $\tfrac12$（无风险利率为 0 时；一般是 $\tfrac12-r_f/\sigma^2$）、仓位上下限不起作用时，它逼近最优解；在其他世界里没有依据。`,
      fails: R`单边下跌时不断加仓，亏损随偏离的平方增长；锚定价过时后整个网格都在错误的位置。`,
      test: R`在 OU 世界、成本为 0 时，对 (每格仓位, 格距) 扫描：增长率几乎只取决于 每格仓位/格距 这个比值，等高线是过原点的射线。比值小的时候增长率随它上升；升到每 1% 格距 0.5 份上下就基本到顶，再大也不掉下来，因为仓位被上下限（默认 0 到 2）截住了。看到的是一片高原，不是一道山脊。不受限制时的最优比值是 $\kappa/\sigma^2$（默认参数下是每 1% 格距 1.25 份），早已在高原里面。`
    }
  });

  L.push({
    id: "martingale", name: "输了加倍（反面教材）", group: "反面教材",
    summary: "上一步亏了就把仓位翻倍，赚了就回到起始仓位。",
    params: [n("base", "起始仓位", 0.05, 0.01, 1, 0.01), n("mult", "亏损后的倍数", 2, 1, 4, 0.1), n("cap", "仓位上限", 1, 0.1, 5, 0.05)],
    code:
`// 输了加倍（马丁格尔）：上一步亏了就把仓位乘以 mult，赚了就回到 base。
// 反面教材：重点看它的终值分布，而不是中位数。
function init(p) {
  return { f: p.base, w: 1 };
}
function decide(s, p, st) {
  if (s.t > 0) st.f = s.wealth < st.w ? Math.min(p.cap, st.f * p.mult) : p.base;
  st.w = s.wealth;
  return st.f;
}`,
    explain: {
      tier: "heuristic",
      assume: R`"连输之后更可能赢"。在独立的赌局里这是赌徒谬误。`,
      objective: R`让"最后是赢的"这件事的概率尽量大，不管输的时候输多少。`,
      optimal: R`**定理（鞅变换）。** 若每步收益的条件期望为零，则对任何有界的、只依赖过去的仓位规则，净值过程仍是鞅，$\mathbb{E}[W_T]=W_0$。加倍不能创造期望，只是改造分布的形状：短期内大概率小赢、小概率巨亏；押的次数一多，"小概率"就累积成大概率。

即使赌局对你有利，它的增长率也低于最优的固定比例（Kelly 定理：独立同分布时常数 $f^*$ 在所有只依赖过去的规则里最优）。它在亏损之后放大仓位，与"按当前净值的固定比例下注"方向恰好相反。`,
      fails: R`仓位上限或本金耗尽之时，就是它兑现全部亏损之时。`,
      test: R`在胜率 50% 的下注游戏里（交易成本设为 0），无论押多少次，$\mathbb{E}[W_T]$ 都应在误差范围内等于 1。默认参数下，押 10 次时约 65% 的路径赢钱、约 5% 破产；加到 100 次，破产的比例超过一半。`
    }
  });

  return L;
})();
if (typeof module !== "undefined" && module.exports) module.exports = QL_STRATS;
