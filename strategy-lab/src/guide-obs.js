// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 手册的内容（四）：四套观测玩法，以及"现算"的登记表和自检清单。
 * 正文里凡是模拟出来的数都写成 ⟪名字⟫，在读者的电脑上现算；名字在 G.live 里登记（怎么取这个数）。
 * G.checks 是自检清单：每一条是一句可以用现算的数判对错的话。测试里把它们全部跑一遍，读者也可以在手册的"自检"页里自己跑。
 * 细则里的每一句都对着 obs-games.js 里的裁判核对过：裁判怎么判，这里就怎么写。 */
(function (G) {
  "use strict";
  var R = String.raw, g = G.games, LIVE = G.live = G.live || {}, CHK = G.checks = G.checks || [];
  function n(x, d) { x = +x; if (!(x === x)) return "—"; var s = d == null ? String(+x.toPrecision(6)) : x.toFixed(d); return s.replace("-", "−"); }
  function pct(x, d) { return n(x * 100, d == null ? 0 : d) + "%"; }

  /* ================================================================== *
   *  现算的数：登记
   * ================================================================== */
  /** 对照表里的一格：名字本身是得分，名字.se 是标准误，名字.d / .dse 是与基准的配对差和它的标准误。
   *  引擎里的得分一律越高越好，成本记成负数；neg 把它翻回正的成本 */
  function cell(id, game, scene, strat, fmt, neg) {
    LIVE[id] = { cell: [game, scene, strat, 0], fmt: fmt, neg: !!neg }; LIVE[id + ".se"] = { cell: [game, scene, strat, 1], fmt: fmt };
    LIVE[id + ".d"] = { cell: [game, scene, strat, 2], fmt: fmt }; LIVE[id + ".dse"] = { cell: [game, scene, strat, 3], fmt: fmt };
  }
  function aux(id, game, scene, strat, k, fmt) { LIVE[id] = { cell: [game, scene, strat, 4 + k], fmt: fmt }; }
  function calc(id, f, fmt, how) { LIVE[id] = { calc: f, fmt: fmt, how: how || "按公式或倒推直接算出" }; }
  function grid(prefix, game, scenes, rules, fmt, auxes, neg) {
    Object.keys(scenes).forEach(function (k) {
      rules.forEach(function (r) {
        var id = prefix + "." + k + "." + r[0];
        cell(id, game, scenes[k], r[1], fmt, neg);
        (auxes || []).forEach(function (a, i) { aux(id + "." + a[0], game, scenes[k], r[1], i, a[1]); });
      });
    });
  }
  function chk(group, say, need, test) { CHK.push({ id: "c" + (CHK.length + 1), group: group, say: say, need: need, test: test }); }
  /** x 与目标值相差不超过 k 个标准误（外加一点固定的余量） */
  function within(x, target, se, k, slack) { var ok = Math.abs(x - target) <= k * se + (slack || 0); return { ok: ok, note: "现算 " + n(x, 4) + " ± " + n(se, 4) + "，应为 " + n(target, 4) }; }
  function between(x, lo, hi) { return { ok: x >= lo && x <= hi, note: "现算 " + n(x, 4) + "，应在 " + n(lo, 4) + " 到 " + n(hi, 4) + " 之间" }; }
  function less(a, b, what) { return { ok: a < b, note: n(a, 4) + " 应小于 " + n(b, 4) + (what ? "（" + what + "）" : "") }; }
  function wd(QL, type, over) { return Object.assign(QL.worldDefaults(type), over || {}); }

  var M_SC = { mu1: "漂移 · 时长 1", mu25: "漂移 · 时长 25", sg: "波动 · 250 个点", sg25: "波动 · 25 个点", kp: "回复速度 · 时长 10", kp2: "回复速度 · 时长 2", h: "Hurst · 250 个点", h1000: "Hurst · 1000 个点" };
  grid("m", "o_meas", M_SC, [["prior", "meas_prior"], ["std", "meas_std"], ["half", "meas_half"], ["sub", "meas_sub"], ["shrink", "meas_shrink"], ["jack", "meas_jack"]], 3, [["bias", 2], ["mae", 3]], true);
  var P_SC = { bm: "布朗运动", ou: "均值回复 φ=0.9", ou10: "均值回复 · 提前 10 步", fbm: "分数布朗 H=0.75", osc: "带噪谐振子", logi: "Logistic", logi5: "Logistic · 提前 5 步", login: "Logistic · 5% 观测噪声", lor: "洛伦兹" };
  grid("p", "o_pred", P_SC, [["stay", "pred_stay"], ["line", "pred_line"], ["mean", "pred_mean"], ["ar", "pred_ar"], ["nn", "pred_nn"]], 3, [["rmse", 3], ["rmse0", 3]]);
  var D_SC = { g: "幅度 1σ", half: "幅度 0.5σ", two: "幅度 2σ", f500: "误报罚 500 步", unk: "幅度不确定", t3: "厚尾噪声" };
  grid("d", "o_det", D_SC, [["shew", "det_shew"], ["ma", "det_ma"], ["cusum", "det_cusum"], ["clip", "det_clip"], ["shir", "det_shir"], ["dp", "det_dp"]], 1, [["fa", "%1"], ["delay", 1], ["miss", "%1"]], true);
  var S_SC = { bm: "没有漂移", up: "向上漂移 +0.05", dn: "向下漂移 −0.05", t50: "只有 50 步", t3: "厚尾步长", ou: "均值回复" };
  grid("s", "o_stop", S_SC, [["end", "stop_end"], ["now", "stop_now"], ["trail", "stop_trail"], ["sqrt", "stop_sqrt"], ["37", "stop_37"], ["dp", "stop_dp"]], 3, [["pos", "%0"], ["lin", 3], ["hit", "%1"]], true);

  calc("m.sg.th", function (QL) { var sp = QL.measSpec(wd(QL, "o_meas", { what: "sigma" })); return (sp.v0 + sp.m0 * sp.m0) / (2 * (sp.n - 1)) / sp.v0; }, 3);
  calc("p.ou.best", function (QL) { return QL.WORLDS.o_pred.theory(wd(QL, "o_pred", { src: "ou" })).best; }, 3);
  calc("p.ou10.best", function (QL) { return QL.WORLDS.o_pred.theory(wd(QL, "o_pred", { src: "ou", h: 10 })).best; }, 3);
  calc("p.fbm.best", function (QL) { return QL.WORLDS.o_pred.theory(wd(QL, "o_pred", { src: "fbm" })).best; }, 3);
  calc("p.osc.best", function (QL) { return QL.WORLDS.o_pred.theory(wd(QL, "o_pred", { src: "osc" })).best; }, 3);
  calc("d.g.dpv", function (QL) { return QL.WORLDS.o_det.theory(wd(QL, "o_det")).dp; }, 1);
  calc("d.half.dpv", function (QL) { return QL.WORLDS.o_det.theory(wd(QL, "o_det", { delta: 0.5 })).dp; }, 1);
  calc("d.two.dpv", function (QL) { return QL.WORLDS.o_det.theory(wd(QL, "o_det", { delta: 2 })).dp; }, 1);
  calc("d.never", function (QL) { return QL.WORLDS.o_det.theory(wd(QL, "o_det")).never; }, 0);
  calc("d.g.A", function (QL) { return QL.WORLDS.o_det.theory(wd(QL, "o_det")).Amid; }, 3);
  calc("s.bm.dpv", function (QL) { return QL.WORLDS.o_stop.theory(wd(QL, "o_stop")).dp; }, 3);
  calc("s.bm.endv", function (QL) { return QL.WORLDS.o_stop.theory(wd(QL, "o_stop")).end; }, 3);
  calc("s.dp1000", function (QL) { return QL.WORLDS.o_stop.theory(wd(QL, "o_stop", { T: 1000 })).dp; }, 3);
  calc("s.gps.v", function (QL) { return QL.gps().v; }, 4);
  calc("s.gps.z", function (QL) { return QL.gps().z; }, 4);
  calc("s.sa", function (QL) { var T = QL.worldDefaults("o_stop").T, p = 1, k; for (k = 1; k <= T; k++) p *= (2 * k - 1) / (2 * k); return p; }, "%2");   // C(2T, T)/4^T
  LIVE["d.cu1.delay"] = { sim: { world: "o_det", wp: { delta: 1 }, strat: "det_cusum", sp: { k: 0.5, h: 5.5 } }, pick: function (r) { return r.aux[1]; }, fmt: 1, how: "幅度 1、h = 5.5 的累积和，专门跑了一次" };
  LIVE["d.f500.cusumold"] = { sim: { world: "o_det", wp: { F: 500 }, strat: "det_cusum", sp: { k: 0.5, h: 5.47 } }, pick: function (r) { return -r.score; }, fmt: 1, how: "误报罚 500 步、h 仍取 5.47 的累积和，专门跑了一次" };
  LIVE["d.cu05.delay"] = { sim: { world: "o_det", wp: { delta: 0.5 }, strat: "det_cusum", sp: { k: 0.25, h: 11 } }, pick: function (r) { return r.aux[1]; }, fmt: 1, how: "幅度 0.5、h = 11 的累积和，专门跑了一次" };

  /* ================================================================== *
   *  ⑪ 测量参数
   * ================================================================== */
  g.o_meas = {
    scene: R`1908 年，Jean Perrin 在显微镜下盯着悬浮在水里的树脂小球，每隔 30 秒记下它的位置。小球被水分子撞得东倒西歪，轨迹毫无规律。但 Einstein 三年前算出过：位移的平方平均起来与时间成正比，比例系数（扩散系数）由温度、黏度、小球的大小和一个当时还没人量准的数决定。Perrin 从乱走的轨迹里量出了扩散系数，从而数出了一摩尔物质里有多少个分子。

这就是这套玩法：给你一条随机的轨迹，背后藏着一个参数，把它量出来。四档世界对应四种经典的测量。

- **漂移**：粒子在外力下平均朝一个方向挪得多快。金融里是"这个资产的预期收益到底是多少"。
- **波动**：Perrin 量的扩散系数。金融里是波动率。
- **回复速度**：被弹簧（光镊、反馈回路）拉住的粒子多快回到平衡位置。金融里是配对交易的价差多快合拢。
- **Hurst 指数**：增量之间的长程相关有多强。Hurst 在尼罗河几百年的水位记录里发现了它。

四个参数，同一条轨迹能告诉你的多少天差地别。这套玩法要你亲手看到这一点。`,
    rules: function (p, th) {
      var w = p.what, T = Math.max(8, p.T | 0), L = [], sd0 = th && th.sd0 != null ? th.sd0 : NaN, m0 = th && th.m0 != null ? th.m0 : NaN, D = w === "kappa" ? +p.durk : w === "mu" ? +p.dur : NaN;
      if (w === "sigma") {
        L.push(`每一局给你一条轨迹：${T} 个观测 X(0), X(1), …，均匀地铺在一段长为 1 的时间里。`);
        L.push(`这一档的世界是没有漂移的布朗运动：X 从 0 出发，相邻两个观测之差互相独立，服从均值 0、标准差 σ·√间隔 的正态分布。`);
        L.push(`要测的是波动 σ。它每一局不同，在 ${n(p.slo)} 到 ${n(p.shi)} 之间按对数均匀地抽。`);
      } else if (w === "kappa") {
        L.push(`每一局给你一条轨迹：${T} 个观测，均匀地铺在一段长为 ${n(D)} 的时间里（相邻两个隔 ${n(D / (T - 1), 4)}）。`);
        L.push(`这一档的世界是均值回复：X 围着一个平衡位置来回，偏离每经过时间 t 只留下 e^(−κt) 倍，同时不断有新的噪声加进来；偏离的平稳标准差是 1。平衡位置每一局不同（从标准正态里抽），你不知道。`);
        L.push(`要测的是回复速度 κ。它每一局不同，在 ${n(p.klo)} 到 ${n(p.khi)} 之间按对数均匀地抽。`);
      } else if (w === "hurst") {
        L.push(`每一局给你一条轨迹：${T} 个观测。`);
        L.push(`这一档的世界是分数布朗运动：X 从 0 出发，每个增量的标准差是 1，增量之间的相关由 Hurst 指数 H 决定（H = ½ 时互不相关）。`);
        L.push(`要测的是 H。它每一局不同，在 ${n(p.hlo)} 到 ${n(p.hhi)} 之间均匀地抽（取在 0.01 的格点上）。`);
      } else {
        L.push(`每一局给你一条轨迹：${T} 个观测 X(0), X(1), …，均匀地铺在一段长为 ${n(D)} 的时间里（相邻两个隔 ${n(D / (T - 1), 4)}）。`);
        L.push(`这一档的世界是带漂移的布朗运动：X 从 0 出发，每单位时间平均移动 μ，同时叠加波动 σ = ${n(p.sigma)}（每单位时间的标准差）。σ 你是知道的。`);
        L.push(`要测的是漂移 μ。它每一局不同，从均值 0、标准差 τ = ${n(p.tau)} 的正态分布里抽。`);
      }
      L.push(`裁判只在一部分时刻来问你要估计（手里的观测数每增加一成问一次），最后一个观测到手时一定问。计分只看最后一次。`);
      L.push(`你每次返回一个数。没给出有限的数时，按先验均值${m0 === m0 ? "（" + n(m0, 4) + "）" : ""}算。`);
      L.push(`你知道的：这一局测的是哪个参数、真值是从哪个分布里抽的、相邻观测隔多久，以及到现在为止的全部观测。你不知道的：真值。`);
      L.push(`得分 = (最后的估计 − 真值)² ÷ 真值的先验方差${sd0 === sd0 ? "（先验标准差是 " + n(sd0, 4) + "）" : ""}，全部对局取平均，越低越好。每局都报先验均值，得分是 1；每局都报准，得分是 0。基准是"不看数据"。`);
      return L;
    },
    see: R`- **布朗运动 · 测漂移。** 时长 1：标准估计的得分是 ⟪m.mu1.std⟫（公式给出 4），比不看数据（1）差四倍；把它向 0 收缩之后是 ⟪m.mu1.shrink⟫（公式 0.8）。降采样到五分之一：⟪m.mu1.sub⟫，没有变化。时长 25：⟪m.mu25.std⟫。**漂移只认时间跨度。**
- **布朗运动 · 测波动。** 250 个点：⟪m.sg.std⟫，已经量得很准。降采样到五分之一：⟪m.sg.sub⟫，差了近五倍。只有 30 个点：⟪m.sg25.std⟫。**波动只认点数。**
- **均值回复 · 测回复速度。** 时长 10：得分 ⟪m.kp.std⟫，但平均高估 ⟪m.kp.std.bias⟫（真值的平均是 3.9）；折半去偏之后偏差是 ⟪m.kp.jack.bias⟫。时长 2：得分 ⟪m.kp2.std⟫，比不看数据还差。**回复速度认的是这段时间里装得下多少个弛豫时间。**
- **分数布朗运动 · 测 Hurst 指数。** 250 个点：得分 ⟪m.h.std⟫，平均绝对误差 ⟪m.h.std.mae⟫。要把 0.50 和 0.55 分开，这点精度不够；1000 个点时是 ⟪m.h1000.std.mae⟫。`,
    known: R`**记号。** 真值 $\theta$ 每局从先验分布里抽，方差 $v_0$；$\hat\theta$ 是你最后报的估计。得分是 $\mathbb{E}(\hat\theta-\theta)^2/v_0$，期望同时对真值和轨迹取。$n$ 是采样点数，$D$ 是总时长，$\Delta=D/(n-1)$。

**最好能做到多少。** 对任何估计，$\mathbb{E}(\hat\theta-\theta)^2=\mathbb{E}\bigl(\hat\theta-\mathbb{E}[\theta\mid X]\bigr)^2+\mathbb{E}\operatorname{Var}(\theta\mid X)$。所以后验均值最优，最优得分是 $\mathbb{E}\operatorname{Var}(\theta\mid X)/v_0\le1$：数据只会让后验方差平均起来变小。标准估计不是后验均值，它的得分可以超过 1。

**定理 1（漂移：只有时长有用）。** $X_t=\mu t+\sigma W_t$，$\sigma$ 已知，在 $n$ 个等间隔的时刻观测。则 $X_D-X_0$ 是 $\mu$ 的充分统计量；$\hat\mu=(X_D-X_0)/D$ 是极大似然估计，$\hat\mu\sim N(\mu,\sigma^2/D)$。若 $\mu\sim N(0,\tau^2)$，记 $s=D\tau^2/\sigma^2$，则标准估计的得分是 $1/s$，后验均值 $\frac{s}{1+s}\hat\mu$ 的得分是 $\frac1{1+s}$。

*证明。* 增量 $\Delta X_i\sim N(\mu\Delta,\sigma^2\Delta)$ 独立，对数似然是 $-\sum_i(\Delta X_i-\mu\Delta)^2/(2\sigma^2\Delta)=\text{常数}+\mu(X_D-X_0)/\sigma^2-\mu^2D/(2\sigma^2)$，只通过 $X_D-X_0$ 依赖于 $\mu$。其余是正态–正态共轭。

两个数：$\sigma=0.2$、要把 $\mu$ 量准到 $\pm0.02$（一个标准误），需要 $D=\sigma^2/0.02^2=100$。把"单位时间"读成年，这就是那句行话：**年化波动 20% 的资产，要一百年的数据才能把预期收益量准到 2 个百分点，而且用日线、分钟线还是逐笔数据都一样。**

**定理 2（波动：只有点数有用）。** $X_t=\sigma W_t$。则 $\hat\sigma^2=\sum_i(\Delta X_i)^2/D\sim\sigma^2\chi^2_{n-1}/(n-1)$，无偏，$\operatorname{Var}\hat\sigma^2=2\sigma^4/(n-1)$，$\hat\sigma$ 的相对标准误约为 $1/\sqrt{2(n-1)}$，与 $D$ 无关。

**这两条定理背后的事实。** 固定时间段 $[0,D]$，把采样无限加密。二次变差 $\sum_i(\Delta X_i)^2$ 几乎必然收敛到 $\sigma^2D$（沿着逐次加细的分割）：一条轨迹就把 $\sigma$ 完全暴露了，$\sigma$ 不同的两个布朗运动，在路径空间上的分布互相奇异。而 $\mu$ 不同、$\sigma$ 相同的两个，分布互相绝对连续（Cameron–Martin–Girsanov），似然比是 $\exp\bigl((\mu_1-\mu_2)X_D/\sigma^2-(\mu_1^2-\mu_2^2)D/(2\sigma^2)\bigr)$：没有任何事件能把它们确定地区分开，采样多密都不行。

**回复速度。** 等间隔采样的均值回复过程满足 $X_{i+1}-m=\varphi(X_i-m)+\varepsilon_i$，$\varphi=e^{-\kappa\Delta}$。带截距的最小二乘给出 $\hat\varphi$，$\hat\kappa=-\ln\hat\varphi/\Delta$。大样本下 $\sqrt n(\hat\varphi-\varphi)\to N(0,1-\varphi^2)$，换算成 $\operatorname{Var}\hat\kappa\approx\dfrac{1-\varphi^2}{n\varphi^2\Delta^2}\approx\dfrac{2\kappa}{D}$（$\kappa\Delta\ll1$ 时）。相对标准误约 $\sqrt{2/(\kappa D)}$，只取决于 $\kappa D$：这段时间相当于多少个弛豫时间。
它有偏：$\mathbb{E}\hat\varphi-\varphi\approx-(1+3\varphi)/n$（Kendall 1954；Marriott–Pope 1954），于是 $\mathbb{E}\hat\kappa-\kappa\approx4/D$，与 $\kappa$ 是多少无关。**回复总是显得比实际快**：拿一段不够长的历史去估价差的半衰期，会系统性地低估它。

**Hurst 指数。** 分数布朗运动满足 $\mathbb{E}(X_{t+k}-X_t)^2=k^{2H}$。取 $k=1,2$ 两个尺度的样本均方增量之比，$\hat H=\tfrac12\log_2(V_2/V_1)$。它的误差没有简单的公式，上面的数字是现算的。`,
    tryit: [
      `测漂移：把"采样点数"从 250 调到 2000，标准估计的得分纹丝不动；把"总时长"调到 4，得分降到四分之一。`,
      `测漂移：对"向先验收缩"的权重 w 做"参数扫描"，实验点落在理论的抛物线上。把 τ 调小到 0.03（真值都挤在 0 附近），最优的 w 接近 0：这时最好的估计就是几乎不看数据。`,
      `测波动：对"降采样"的 k 做"参数扫描"，得分大致与 k 成正比。`,
      `测回复速度：看结果栏下面的"平均偏差"。标准估计明显为正，"折半去偏"接近 0，但后者的得分反而略高（方差大了）。`,
      `打开"单局明细"看一局：估计值是怎样随着观测增多稳定下来的。测漂移时它稳定得很慢。`
    ],
    origin: R`- **Einstein（1905）与 Perrin（1908）。** Einstein 的布朗运动理论给出均方位移 $\langle x^2\rangle=2Dt$，以及扩散系数与阿伏伽德罗常数的关系。Perrin 用显微镜逐点记录胶体颗粒的位置，量出了扩散系数，1926 年因此获得诺贝尔物理学奖。
- **Merton（1980）。** 论文《On estimating the expected return on the market》指出：方差可以靠加密采样估得很准，期望收益却只能靠拉长样本，这两件事的难度不在一个量级上。
- **Kendall（1954），Marriott 和 Pope（1954）。** 给出了一阶自相关的最小二乘估计的小样本偏差。
- **Hurst（1951）。** 英国水文学家 Hurst 为设计尼罗河上的水库研究历年的水位，发现它的累积偏差随时间增长得比独立增量应有的 $\sqrt t$ 更快，指数在 0.7 上下。Mandelbrot 和 Van Ness（1968）用分数布朗运动给了它一个模型。
- **光镊。** 用激光夹住的小球，位置服从的正是均值回复过程；从位置记录里估回复速度，是标定光阱刚度的标准做法。`
  };

  /* ================================================================== *
   *  ⑫ 预测
   * ================================================================== */
  g.o_pred = {
    scene: R`1961 年冬天，气象学家 Edward Lorenz 想把计算机上的一段天气模拟重算一遍。为了省时间，他从打印纸上抄下中途的一组数当作起点：纸上印的是 0.506，机器里存的是 0.506127。一个小时之后他回来，新算出的天气和原来的已经毫不相干。

方程里没有任何随机性，预测却只在很短的时间里管用。这是一头。另一头是布朗运动：全是随机性，最好的预测就是"它不变"。真实的序列夹在两头之间，而且光看图分不出它更靠近哪一头。

这套玩法把六种世界摆在一起。每一步，你报出这个量 h 步之后会是多少，和"原地不动"比。它要你回答三个问题：这个世界里有没有可以预测的东西？线性的办法够不够？能提前多久？`,
    rules: function (p, th) {
      var T = p.T | 0, h = Math.max(1, p.h | 0), w0 = Math.max(0, Math.min(p.warm | 0, T - h - 1)), src = p.src, ns = +p.noise || 0, L = [], d;
      if (src === "bm") d = `布朗运动：从 0 出发，每一步加上一个独立的标准正态增量。`;
      else if (src === "ou") d = `均值回复：偏离均值的部分每一步只留下 φ = ${n(p.phi)} 倍，再加上新的噪声；均值是 0，平稳标准差是 1。`;
      else if (src === "fbm") d = `分数布朗运动：从 0 出发，每个增量的标准差是 1，增量之间有长程相关，Hurst 指数 H = ${n(p.H)}。`;
      else if (src === "osc") d = `带噪谐振子：x(t) = 2ρ·cos(2π/周期)·x(t−1) − ρ²·x(t−2) + 噪声，周期 ${n(p.period)} 步，ρ = ${n(p.rho)}；除以它的平稳标准差之后给你看${ns > 0 ? "，再加上标准差 " + n(ns) + " 的观测噪声" : ""}。`;
      else if (src === "lorenz") d = `洛伦兹系统：三个变量的确定性微分方程组，你只看得到 x，每隔 τ = ${n(p.tau)} 采样一次（除以 7.93，使标准差约为 1）${ns > 0 ? "，再加上标准差 " + n(ns) + " 的观测噪声" : ""}。`;
      else d = `Logistic 映射：x(t+1) = ${n(p.a)}·x(t)·(1 − x(t))，没有任何随机性，初值每局不同${ns > 0 ? "；你看到的读数另加一点观测噪声（标准差是信号标准差的 " + pct(ns) + "）" : ""}。`;
      L.push(`一局共 ${T} 步。每一步你看到一个观测值。`);
      L.push(`这一档的世界是${d}`);
      L.push(`每一步你返回一个数：对 ${h} 步之后那个观测值的预测。没给出有限的数时，按"原地不动"（预测它等于现在的值）算。`);
      L.push(`前 ${w0} 步是热身：照常要你预测，但不计分，给需要先学一会儿的规则留时间。最后 ${h} 步没有答案可对，也不计分。`);
      L.push(`你知道的：到现在为止的全部观测值、提前几步、一局多长。你不知道的：这是哪一种世界、它的参数是多少（除非你把这份知识写进规则里）。`);
      L.push(`得分（技巧分）= 1 − 你的预测误差平方和 ÷ "原地不动"的预测误差平方和。每一局各算一个，再对全部对局取平均。0 = 和原地不动一样；1 = 每一步都报准；负数 = 还不如原地不动。基准是"原地不动"。`);
      return L;
    },
    see: R`- **布朗运动。** 全军覆没：线性外推 ⟪p.bm.line⟫，自回归 ⟪p.bm.ar⟫，相似历史 ⟪p.bm.nn⟫。没有任何规则能胜过原地不动，这是定理。
- **均值回复（φ = 0.9）。** 提前 1 步，理论上限只有 ⟪p.ou.best⟫，"回到均值"拿到 ⟪p.ou.mean⟫。提前 10 步，上限升到 ⟪p.ou10.best⟫，实测 ⟪p.ou10.mean⟫。回复要放到半衰期（这里是 6.6 步）的尺度上才看得出来。
- **分数布朗运动（H = 0.75）。** 增量正相关，线性规则有用：自回归 ⟪p.fbm.ar⟫，上限 ⟪p.fbm.best⟫。但它没有均值可回："回到均值"是 ⟪p.fbm.mean⟫。
- **带噪谐振子。** 线性高斯，两个滞后就是全部：自回归 ⟪p.osc.ar⟫，上限 ⟪p.osc.best⟫。
- **Logistic 映射。** 看起来是白噪声，线性规则只能拿到一半：⟪p.logi.ar⟫。相似历史几乎拿满：⟪p.logi.nn⟫。但提前 5 步就只剩 ⟪p.logi5.nn⟫：误差每一步翻一倍。
- **洛伦兹。** 相似历史 ⟪p.lor.nn⟫，线性 ⟪p.lor.ar⟫。`,
    known: R`**最优预测是条件期望。** 对任何只看历史的预测 $F_t$，$\mathbb{E}(F_t-X_{t+h})^2=\mathbb{E}\bigl(F_t-\mathbb{E}[X_{t+h}\mid\mathcal{F}_t]\bigr)^2+\mathbb{E}\operatorname{Var}(X_{t+h}\mid\mathcal{F}_t)$，所以最好的预测是 $\mathbb{E}[X_{t+h}\mid\mathcal{F}_t]$，剩下的那部分误差谁也去不掉。

**鞅：原地不动就是最优。** 布朗运动是鞅，条件期望就是当前值。别的规则多出来的均方误差，恰好是它偏离当前值的均方大小（见"原地不动"那条规则的定理）。

**线性高斯的世界：最优预测是线性的，上限算得出来。**

- 均值回复（一阶自回归）：$\mathbb{E}[X_{t+h}\mid X_t]=m+\varphi^h(X_t-m)$，技巧分的上限是 $(1-\varphi^h)/2$，永远到不了 $\tfrac12$ 以上。
- 带噪谐振子（二阶自回归）：用最近两个值，按递推往前推 $h$ 步。
- 分数布朗运动：增量的自协方差 $\gamma(k)=\tfrac12\bigl(|k+1|^{2H}-2|k|^{2H}+|k-1|^{2H}\bigr)$。对"接下来 $h$ 步一共走多少"的最优线性预测要解方程组 $\Gamma a=c$（$\Gamma_{ij}=\gamma(i-j)$，$c_i=\sum_{j=1}^h\gamma(i+j)$），能解释掉的比例是 $c^\top\Gamma^{-1}c/h^{2H}$。只用最近一个增量、提前一步时，它是 $\gamma(1)^2=(2^{2H-1}-1)^2$。

**命题（Logistic 映射：不相关，却完全可预测）。** $a=4$ 时，令 $x_t=\sin^2(2^t\omega)$，则 $x_{t+1}=4x_t(1-x_t)$。$\omega$ 在 $[0,\pi]$ 上均匀分布时，$x_t$ 的分布不随 $t$ 变（密度 $1/(\pi\sqrt{x(1-x)})$，均值 $\tfrac12$，方差 $\tfrac18$），并且对所有 $k\ge1$ 有 $\operatorname{Cov}(x_t,x_{t+k})=0$。

*证明。* 倍角公式给出递推。$x_t=\tfrac12\bigl(1-\cos(2^{t+1}\omega)\bigr)$，而频率不同的余弦在一个周期上正交。

所以最好的线性预测就是均值 $\tfrac12$，均方误差是方差 $\tfrac18$；原地不动的均方误差是 $2\times\tfrac18$；线性规则的技巧分恰好是 $\tfrac12$。而知道方程的人可以做到 1。**线性相关为零，不等于不可预测。**

**能提前多久：Lyapunov 指数。** 相邻两条轨道的距离平均每步乘以 $e^\lambda$。上面的表示说明 Logistic 映射每一步把角度 $\omega$ 翻一倍，$\lambda=\ln2$。初始误差是 $\varepsilon$ 时，$h$ 步之后是 $\varepsilon\,2^h$，可预测的步数约为 $\log_2(1/\varepsilon)$：把初值多量准一位二进制小数，只能多预测一步。洛伦兹系统（经典参数）的最大 Lyapunov 指数约为每单位时间 0.906。

**只看得到一个分量怎么办。** 嵌入定理。Takens（1981）：状态空间是 $d$ 维紧流形时，对一般的（generic）光滑系统和观测函数，由 $2d+1$ 个相继的观测值组成的向量 $(x_t,x_{t-1},\dots,x_{t-2d})$ 给出状态空间的一个嵌入。Sauer、Yorke 和 Casdagli（1991）把条件放宽成：$m$ 大于吸引子盒维数的两倍时，$m$ 个相继的观测值在吸引子上是单射。洛伦兹吸引子的维数约 2.06，所以 5 个就有保证，实际上两三个通常已经够用。用"最近几个观测值"当状态去找相似的历史，依据在这里。`,
    tryit: [
      `在"Logistic 映射"里把规则从"相似历史"换成"自回归"：技巧分从接近 1 掉到 0.5 上下。打开"单局明细"看这条序列：肉眼完全看不出规律。`,
      `还是 Logistic：把"提前几步"从 1 一步一步调到 8，看"相似历史"的技巧分怎样塌下去。`,
      `加一点"观测噪声"（比如 0.05）：一步预测几乎不受影响，多步预测塌得更快。`,
      `换到"布朗运动"，把每条规则都试一遍：没有一条是正的。再让 Claude 写一条它认为能赢的，看看结果。`,
      `"均值回复"里对"回到均值"的 w 做"参数扫描"，再把"提前几步"调到 10 重扫一次。`
    ],
    origin: R`- **Lorenz（1963）。** 论文《Deterministic nonperiodic flow》从一个只有三个变量的对流模型出发，说明确定性的方程可以对初值极端敏感，长期天气预报因此有原则上的期限。
- **May（1976）。** 《Simple mathematical models with very complicated dynamics》用 Logistic 映射说明：一行的递推就能产生看似随机的序列。
- **Lorenz（1969）的相似法；Farmer 和 Sidorowich（1987）。** 在历史里找"和今天最像的日子"来预报，气象里很早就这么做；Lorenz 用它估计了大气里误差增长的速度。后者把同样的想法用在混沌序列上，并给出了预测误差随提前量指数增长的规律。
- **Takens（1981）。** 嵌入定理。
- **金融里的对应。** 有效市场假说的一种说法就是"价格是鞅"：这一档世界里，任何预测规则的技巧分都是非正的。`
  };

  /* ================================================================== *
   *  ⑬ 变点检测
   * ================================================================== */
  g.o_det = {
    scene: R`一条灌装线，每瓶应该装 500 毫升。传感器的读数有噪声，单看一个读数说明不了什么。某一刻阀门磨损了，平均灌装量悄悄多了一点。你要尽早发现：晚一步，就多出一批不合格品。可是如果机器本来没毛病，你却把生产线停下来检查，同样要赔上一笔。

同一个问题有很多张面孔：雷达屏幕上什么时候出现了目标，地震仪上地震波什么时候到，一个病区的感染率是不是升高了，一个策略的优势是不是已经没了。

它难在两头都要顾：报警线定得低，变化一来很快就能发现，可是噪声自己也常常碰到线；定得高，不误报了，真变了又迟迟看不出来。`,
    rules: function (p, th) {
      var T = p.T | 0, gap = +p.gap, rho = 1 / gap, src = p.src, L = [];
      L.push(`一局共 ${T} 步，每一步给你一个读数。`);
      L.push(src === "t3" ? `变化之前，读数是纯噪声：均值 0、标准差 1，但服从自由度 3 的 t 分布（偶尔会出现很离谱的值）。各步互相独立。` : `变化之前，读数是纯噪声：标准正态，各步互相独立。`);
      L.push(`每一步之前，变化有 ρ = 1/${n(gap)} 的概率发生；发生之后不会变回去。所以变化平均出现在第 ${n(gap)} 步前后，也有 ${pct(Math.pow(1 - rho, T), 1)} 的对局到终局都没有变化。`);
      L.push(src === "unk" ? `变化之后，读数的均值抬高。抬高多少每一局不同：在名义幅度 δ = ${n(p.delta)} 的一半到两倍之间（按对数均匀地抽）。规则只知道名义值。` : `变化之后，读数的均值抬高 δ = ${n(p.delta)}（以噪声的标准差为单位），噪声不变。`);
      L.push(`每一步你返回 1（报警）或 0（继续看）。一报警，这一局就结束。`);
      L.push(`代价按步数算。变化还没发生就报警（误报）：罚 ${n(p.F)} 步。变化发生之后才报：晚了几步就是几步（变化发生的那一步就报，算 0 步）。一直没报：从变化发生到终局，每一步都算延迟；没有变化也没报，代价是 0。`);
      L.push(`你知道的：ρ、名义幅度 δ、误报的代价、一局多长、到现在为止的全部读数。你不知道的：变化发生了没有、发生在哪一步，以及噪声是哪一种。`);
      L.push(`得分 = 各局代价的平均（步），越低越好。基准是"单点超限"（一个读数超过 3 就报）。`);
      return L;
    },
    see: R`- **正态噪声，幅度 1。** 动态规划 ⟪d.g.dp⟫ 步（倒推值 ⟪d.g.dpv|2⟫），后验概率 ⟪d.g.shir⟫，累积和 ⟪d.g.cusum⟫，截断的累积和 ⟪d.g.clip⟫，滑动平均 ⟪d.g.ma⟫，单点超限 ⟪d.g.shew⟫。会积累证据的规则，比只看一个读数的好三倍以上。
- **幅度减半。** 最优代价从 ⟪d.g.dpv⟫ 升到 ⟪d.half.dpv⟫ 步；幅度加倍则降到 ⟪d.two.dpv⟫ 步。
- **误报罚得更重（500 步）。** 最优规则把报警线从 π ≥ ⟪d.g.A⟫ 提到 0.99 以上，宁可多等几步：⟪d.f500.dp⟫ 步。累积和的报警线要跟着调高（⟪d.f500.cusum⟫ 步）；还留在原来的 5.47 的话是 ⟪d.f500.cusumold⟫ 步。
- **幅度不确定。** 按名义幅度算似然比的规则都变差了：动态规划 ⟪d.unk.dp⟫ 步。
- **厚尾噪声。** 按正态噪声推出来的"最优"规则是 ⟪d.t3.dp⟫ 步，不截断的累积和 ⟪d.t3.cusum⟫ 步，都输给"截断的累积和"的 ⟪d.t3.clip⟫ 步。单点超限的误报占到 ⟪d.t3.shew.fa⟫。`,
    known: R`**记号。** $\nu$ 是变化发生的时刻，$P(\nu=k)=\rho(1-\rho)^k$。读数 $Y_t=\varepsilon_t+\delta\,\mathbf 1\{t\ge\nu\}$。$\tau$ 是你报警的时刻。代价 $=F\cdot\mathbf 1\{\tau<\nu\}+(\tau-\nu)^+$；一直没报时取 $\tau=T$，并且没有误报这一项。

**从不报警。** 代价是 $\mathbb{E}(T-\nu)^+=T-\dfrac{(1-\rho)\bigl(1-(1-\rho)^T\bigr)}{\rho}$，默认设定下约 ⟪d.never⟫ 步。

**定理（Shiryaev 1963）。** 记 $\pi_t=P(\nu\le t\mid Y_0,\dots,Y_t)$ 为"变化已经发生"的后验概率。噪声是标准正态时：

1. $\pi_t$ 可以递推：$\pi^-=\pi_{t-1}+(1-\pi_{t-1})\rho$，$\ \pi_t=\dfrac{\pi^-\Lambda_t}{\pi^-\Lambda_t+1-\pi^-}$，$\ \Lambda_t=\exp\bigl(\delta(Y_t-\delta/2)\bigr)$。
2. 对任何报警时刻，$\mathbb{E}[\text{代价}]=\mathbb{E}\Bigl[F(1-\pi_\tau)+\sum_{s<\tau}\pi_s\Bigr]$（没报警的局上没有第一项）。
3. 局无限长时，最优的规则是"$\pi_t$ 第一次不低于某个常数 $A^*$ 时报警"。

证明的思路写在"后验概率"那条规则里。有限的 $T$ 步里，最优的报警线随时间变化，由倒推得到（"有限期动态规划"），但只在最后一小段才明显偏离常数。

**累积和在算什么。** $S_t=\max(0,S_{t-1}+Y_t-\delta/2)$ 满足 $\delta S_t=\max\Bigl(0,\ \max_{j\le t}\ \delta\sum_{i=j}^t(Y_i-\delta/2)\Bigr)$：对"变化发生在第 $j$ 步"的各个假设求对数似然比，取最大的那个。它不需要知道 $\rho$。在"两次误报之间的平均间隔不低于给定值、最坏情形下的平均延迟最小"这个准则下，它恰好最优（Moustakides 1986）。

**延迟与幅度。** 变化之后，对数似然比平均每步涨 $\delta^2/2$。要攒到同样的证据量，需要的步数与 $\delta^2$ 成反比：**幅度减半，同样可靠的报警要晚四倍。** 这是布朗运动的标度性：把幅度乘以 $c$、时间乘以 $1/c^2$，整个问题不变。

**为什么厚尾会打乱这一切。** 似然比 $\Lambda_t=e^{\delta(Y_t-\delta/2)}$ 对读数是指数敏感的。正态噪声下，一个 6 倍标准差的读数几乎不可能出现，所以出现了就是强证据；$t$ 分布下它不算稀奇，但规则仍然按正态来算，于是一个离谱的读数就足以把 $\pi$ 推过报警线。`,
    tryit: [
      `对"累积和"的 h 做"参数扫描"：一条单谷曲线。左边死于误报，右边死于延迟。`,
      `把"一次误报的代价"从 50 调到 500：看"后验概率"的默认报警线怎么变，结果栏下面误报的比例怎么变。`,
      `换到"厚尾噪声"，在"有限期动态规划""累积和"和"截断的累积和"之间切换。然后让 Claude 写一条用滑动中位数的规则，看它排在哪儿。`,
      `打开"单局明细"：读数、报警的位置，和代价是怎么一步一步累上去的。多换几局看看误报长什么样。`,
      `把"变化的幅度"调到 3：单点超限追上来了。幅度够大时，不需要积累证据。`
    ],
    origin: R`- **Shewhart（1924）。** 在西电公司（Western Electric）检验部门提出控制图：把读数画在一张带上下限的图上，越限才干预。这是统计质量控制的开端。
- **Page（1954）。** 论文《Continuous inspection schemes》提出累积和（CUSUM）。
- **Shiryaev（1963）。** 在 Kolmogorov 的建议下研究"尽快发现信号出现"的问题，给出了上面的贝叶斯解。
- **Lorden（1971），Moustakides（1986）。** 证明了 CUSUM 在最坏情形准则下先是渐近最优、后来是精确最优。
- **亲戚。** Wald（1945）的序贯概率比检验解决的是"两个假设选一个、越快越好"；变点检测是"假设会在中途换掉"的版本。`
  };

  /* ================================================================== *
   *  ⑭ 停在最高点
   * ================================================================== */
  g.o_stop = {
    scene: R`你手里有一样东西，价格每天在变，你必须在一年之内卖掉。年底回头看，这一年里总有一天是最高价。你当然希望卖在那一天，可是那一天到来的时候，你并不知道它就是最高点。

Shiryaev 把它提成一个数学问题：看着一条布朗运动的路径往前走，在哪一刻停下，才能离整条路径的最高点尽量近？注意最高点可能出现在你停下之后：停早了，会被后面的新高甩开；停晚了，又把到手的高点吐了回去。

它和秘书问题是亲戚：都是只能选一次、不能反悔、想选到最好的。区别在于，秘书问题里候选人互不相干，这里的值是一步一步累加出来的。这个区别让答案完全不同。`,
    rules: function (p, th) {
      var T = p.T | 0, src = p.src, mu = +p.mu || 0, L = [];
      if (src === "ou") L.push(`路径从 0 出发，共 ${T} 步。这一档的世界是均值回复：每一步，偏离只留下 φ = ${n(p.phi)} 倍，再加上新的噪声；均值是 0，平稳标准差是 1。`);
      else L.push(`路径从 0 出发，共 ${T} 步：每一步加上${mu ? "漂移 μ = " + n(mu) + " 和" : ""}一个随机的步长。步长的标准差是 1，${src === "t3" ? "服从自由度 3 的 t 分布（偶尔一步跨得很远）" : "服从正态分布"}，各步互相独立。`);
      L.push(`每一步你先看到路径现在的值，再返回 1（停）或 0（走）。停了就不能反悔，手里的值定在这一步。一直不停，就走到头，手里是终点的值。`);
      L.push(`记 M 为整条路径（从开局到终点，包括你停下之后的那一段）的最高点。这一局的代价 = (M − 你手里的值)²${src === "ou" ? "" : " ÷ " + T}。`);
      L.push(`你知道的：到现在为止的路径、一局多少步${src === "ou" ? "" : "、每步的漂移"}。你不知道的：以后的路径，以及这是哪一种世界。`);
      L.push(`得分 = 各局代价的平均，越低越好。基准是"走到头"。`);
      return L;
    },
    see: R`- **没有漂移。** 走到头 ⟪s.bm.end⟫，立刻停 ⟪s.bm.now⟫：两个极端一样差。回落超过 $1.12\sqrt{\text{剩余步数}}$ 就停：⟪s.bm.sqrt⟫；动态规划 ⟪s.bm.dp⟫（倒推值 ⟪s.bm.dpv⟫）。照搬秘书问题：⟪s.bm.37⟫，等于没用。
- **向上漂移。** 走到头 ⟪s.up.end⟫，动态规划 ⟪s.up.dp⟫：几乎就是一直拿着。立刻停 ⟪s.up.now⟫。
- **向下漂移。** 反过来：立刻停 ⟪s.dn.now⟫，动态规划 ⟪s.dn.dp⟫，走到头 ⟪s.dn.end⟫。
- **厚尾步长。** 结论基本不变：⟪s.t3.sqrt⟫ 对 ⟪s.t3.end⟫。
- **均值回复。** 换了一个世界：照搬秘书问题反而最好（⟪s.ou.37⟫），走到头 ⟪s.ou.end⟫，回落 1.5 就停的固定回落最差（⟪s.ou.trail⟫）。
- **一个到处都成立的数。** 立刻停而正好停在最高点的比例：正态步长 ⟪s.bm.now.hit⟫，厚尾步长 ⟪s.t3.now.hit⟫，公式 $\binom{2T}{T}/4^T$ 给出 ⟪s.sa⟫。`,
    known: R`**记号。** $X_0=0$，$X_{t+1}=X_t+\mu+\xi_{t+1}$；$M_t=\max_{s\le t}X_s$；$\tau$ 是你停下的时刻。代价是 $\mathbb{E}(M_T-X_\tau)^2/T$。连续时间的版本里 $X$ 换成布朗运动 $B$。

**命题（按距离本身计分，所有规则打平）。** 没有漂移时，对任何（有界的）停止规则，$\mathbb{E}(M_T-X_\tau)=\mathbb{E}M_T$。

*证明。* $X$ 是鞅，可选停时定理给出 $\mathbb{E}X_\tau=0$。

所以计分必须用平方（或别的非线性函数）才分得出高下。结果栏下面的"离最高点的平均距离"对每条规则都一样（没有漂移时走到头 ⟪s.bm.end.lin⟫，$\sqrt{\ }$ 规则 ⟪s.bm.sqrt.lin⟫），就是这个命题。

**两个极端一样。** $M_T-B_T$、$M_T$ 和 $|B_T|$ 同分布（Lévy）。所以走到头的代价 $\mathbb{E}(M_T-B_T)^2/T$ 和立刻停的代价 $\mathbb{E}M_T^2/T$ 都等于 1。

**定理（Graversen–Peskir–Shiryaev 2001）。** 没有漂移的布朗运动，
$$\inf_\tau\frac{\mathbb{E}(M_T-B_\tau)^2}{T}=2\Phi(z^*)-1\approx0.7385,\qquad\tau^*=\inf\bigl\{t:\ M_t-B_t\ge z^*\sqrt{T-t}\bigr\},$$
$z^*\approx1.1228$ 是 $4\Phi(z)-2z\varphi(z)-3=0$ 的根。证明的思路写在"回落超过 $z\sqrt{\text{剩余步数}}$"那条规则里。

最优规则只把代价从 1 降到 0.74。**事先看不到未来，离最高点的距离就去不掉多少。**

**离散的 $T$ 步。** 只在整数时刻看路径，最高点比连续时间的低（$\mathbb{E}M_T\approx\sqrt{2T/\pi}-0.58$），各条规则的代价也跟着低一点。$T=250$：走到头 ⟪s.bm.endv⟫，最优 ⟪s.bm.dpv⟫；$T=1000$ 时最优是 ⟪s.dp1000⟫，慢慢靠近 0.7385。

**最高点出现在什么时候。** 布朗运动在 $[0,T]$ 上取到最大值的时刻 $\theta$ 服从反正弦律：$P(\theta\le t)=\frac2\pi\arcsin\sqrt{t/T}$，密度在两端最大、中间最小。最高点最可能出现在开头或结尾，而不是中间。离散的版本更干净：**定理（Sparre Andersen 1953）。** 步长的分布对称而且连续时，$P(X_1\le0,\dots,X_T\le0)=\binom{2T}{T}/4^T$，与步长具体服从什么分布无关。这正是"立刻停恰好停在最高点"的概率。

**有漂移。** 结构会变。Shiryaev、Xu 和 Zhou（2008）对几何布朗运动、按"卖出价 ÷ 最高价"的期望计，证明了两头的情形：漂移相对波动足够大时一直拿到最后最优，漂移不为正时立刻卖出最优。这里按距离的平方计，方向相同，但两头都只是接近最优：向上漂移时走到头 ⟪s.up.end⟫、最优 ⟪s.up.dp⟫，向下漂移时立刻停 ⟪s.dn.now⟫、最优 ⟪s.dn.dp⟫。对带漂移的布朗运动和平方距离，du Toit 和 Peskir（2007）发现最优的停止区域可以不是"回落大于某条线"这么简单的形状。这里的动态规划对每个"还剩几步、离最高点多远"的状态各存一个"停 / 走"，不预设形状。`,
    tryit: [
      `没有漂移时，在"走到头""立刻停"和"回落超过 z·√剩余步数"之间切换：前两个打平，第三个低四分之一。再看结果栏下面的"离最高点的平均距离"：三个一样。`,
      `对系数 z 做"参数扫描"：谷底在 1 附近，很平。`,
      `把漂移调成 +0.05，再调成 −0.05："有限期动态规划"的说明里会显示倒推出的停止线，看它怎么变。`,
      `换到"均值回复"：原来最差的"照搬秘书问题"成了最好的。`,
      `在"布朗运动"和"厚尾步长"之间切换，选"立刻停"，看"正好停在最高点的比例"：两边是同一个数。`
    ],
    origin: R`- **Graversen、Peskir 和 Shiryaev（2001）。** 论文《Stopping Brownian motion without anticipation as close as possible to its ultimate maximum》解决了没有漂移的情形。
- **du Toit 和 Peskir（2007）。** 《The trap of complacency in predicting the maximum》处理有漂移的布朗运动，发现最优停止区域的形状比预想的复杂。
- **Shiryaev、Xu 和 Zhou（2008）。** 《Thou shalt buy and hold》：对几何布朗运动，按"卖出价 ÷ 最高价"的期望来衡量，漂移相对波动足够大时最优策略是一直持有到最后。
- **Lévy（1939）的反正弦律；Sparre Andersen（1953）。** 关于最大值出现时刻的两个经典结果。
- **交易里的对应。** 移动止损（"从高点回落多少就卖"）是这个问题的一种启发式答案。定理说：没有漂移时，合理的回落幅度应当随剩余时间按平方根收窄；有向上的漂移时，最好干脆不设。`
  };

  G.gameIndex = G.gameIndex || {};
  G.gameIndex.o_meas = ["这个参数是多少", "有的参数靠时长，有的靠点数，有的怎么都量不准", "物理实验 · 统计估计"];
  G.gameIndex.o_pred = ["h 步之后是多少", "有没有可预测的结构、线性够不够、能提前多久", "天气预报 · 混沌"];
  G.gameIndex.o_det = ["现在报不报警", "早报怕误报，晚报怕延迟", "质量控制 · 雷达"];
  G.gameIndex.o_stop = ["现在停不停", "最高点可能还在后头，也可能已经过去", "最优停止"];

  /* ---------- 各条内置规则的用处：现实里谁这么做，在这里拿它看什么 ---------- */
  var u = G.gstrats;
  u.meas_prior = `基准：不看数据，报先验均值。任何估计都该先和它比。数据少、噪声大的时候，输给它并不稀奇。`;
  u.meas_std = `教科书上的做法：漂移用首尾之差除以时长，波动用增量的平方和，回复速度用一阶自回归，Hurst 指数用两个尺度的均方增量之比。拿它看每个参数本来能量多准。`;
  u.meas_half = `"老数据不作数"：只看最近一段。参数真的在变时这样做有道理；参数不变时，它只是白白丢掉信息。拿它看丢掉一半数据的代价。`;
  u.meas_sub = `把日线换成周线、每 k 个点取一个。拿它分清两类参数：靠点数的（波动）会变差，只靠时长的（漂移）纹丝不动。`;
  u.meas_shrink = `组合管理里对预期收益的"收缩"：数据说的只信一部分，其余信先验。数据少、噪声大的时候用。漂移这一档里，它取对权重时就是最优的估计。`;
  u.meas_jack = `Quenouille 1949 年提出的去偏办法。估回复速度、半衰期这类小样本里有偏的量时用。拿它看一件容易混的事：去掉偏差不等于减小误差。`;
  u.pred_stay = `气象里叫"持续性预报"：明天和今天一样。它是基准；对鞅（布朗运动）它就是最优的。`;
  u.pred_line = `"趋势会延续"：按最近一步的走势画直线。拿它看，在没有趋势的世界里外推会把误差翻倍。`;
  u.pred_mean = `"涨多了要回调"：认为偏离会收回去一部分。只在确实有均值可回的世界里管用；放到没有均值的世界里，它比原地不动差得多。`;
  u.pred_ar = `时间序列分析的主力：从这条序列自己的过去学一个线性关系。线性高斯的世界里它趋于最优。拿它看线性方法在混沌序列上的天花板。`;
  u.pred_nn = `"类比预报"：在历史里找最像现在的时刻，看它后来怎样。Lorenz 1969 年用它检验过天气能预报多远。序列是确定的、非线性的时候用。`;
  u.det_shew = `工厂里最老的控制图：一个读数超出 3 个标准差就停线检查。大的突变它反应最快，小的偏移它几乎看不见。这套玩法的基准。`;
  u.det_ma = `最直观的做法：最近 n 个读数的平均高了就报警。常用，但窗口是固定的：变化比窗口预想的小，就攒不够证据。`;
  u.det_cusum = `质量控制、入侵检测、行情监控里的标准做法（Page 1954）。知道变化的幅度时用；在"最坏情况下的延迟"这个标准下，它是最优的。`;
  u.det_clip = `读数里会冒出离群值（厚尾）时用。每个读数最多算作 c，一个离谱的读数就顶不动报警线了。`;
  u.det_shir = `知道变化大概何时发生（先验）时用：直接算"已经变了"的概率，够高就报。局足够长时，这是贝叶斯意义下的最优规则。`;
  u.det_dp = `有限期里的精确最优解：每一步一条报警线，事先倒推出来。用它量别的规则离最优还差多少。`;
  u.stop_end = `"买入持有"到最后一天。有向上的漂移时它几乎就是最优的。这套玩法的基准。`;
  u.stop_now = `"趁早卖"。有向下的漂移时它几乎就是最优的；没有漂移时，它与走到头打平。`;
  u.stop_trail = `交易里的移动止损：从最高点回落超过一个固定的幅度就走。拿它看"固定的幅度"与"随剩余时间缩小的幅度"差多少。`;
  u.stop_sqrt = `没有漂移的布朗运动里，最优规则就是这个形状（Graversen、Peskir、Shiryaev 2001）：回落的门槛与剩余时间的平方根成正比。`;
  u.stop_37 = `把秘书问题的"先看 37%"原样搬过来。秘书问题里的候选人互相独立，路径上相邻的值却高度相关。拿它看换了世界之后，照搬的规则还剩多少用处。`;
  u.stop_dp = `按正态步长倒推出来的"停 / 走"表，离散步数下的精确最优。用它对照别的规则。`;

  /* ---------- 算法的基础信息 ---------- */
  var A = G.algo;
  function a(id, kind, fit, step, mem, need) { A[id] = { kind: kind, fit: fit, step: step, mem: mem, need: need }; }
  a("meas_prior", "常数", "不用", "O(1)", "O(1)", "只用先验");
  a("meas_std", "公式", "不用", "O(t)：把到目前为止的 t 个观测扫一遍", "O(1)", "全部观测");
  a("meas_half", "公式", "不用", "O(w·t)", "O(1)", "最近比例 w 的观测");
  a("meas_sub", "公式", "不用", "O(t/k)", "O(1)", "每隔 k 个取一个");
  a("meas_shrink", "公式", "不用", "O(t)", "O(1)", "全部观测，外加先验");
  a("meas_jack", "公式", "不用", "O(t)：算三次标准估计", "O(1)", "全部观测");
  a("pred_stay", "常数", "不用", "O(1)", "O(1)", "只用当前值");
  a("pred_line", "公式", "不用", "O(1)", "O(1)", "最近两个值");
  a("pred_mean", "滚动统计", "不用", "O(1)", "O(1)", "到目前为止的平均值");
  a("pred_ar", "在线学习", "不用", "O(q²)", "O(q²)：系数和一个 q×q 的矩阵", "只用自己这条序列");
  a("pred_nn", "在线学习（不存模型，每次现找）", "不用", "O(t·m)：把历史扫一遍", "O(t)：全部历史", "只用自己这条序列");
  a("det_shew", "门槛", "不用", "O(1)", "O(1)", "只用当前读数");
  a("det_ma", "滚动统计", "不用", "O(1)", "O(n)：最近 n 个读数", "最近 n 步");
  a("det_clip", "状态机", "不用", "O(1)", "O(1)：一个累积量", "只用当前读数");
  a("det_cusum", "状态机", "不用", "O(1)", "O(1)：一个累积量", "只用当前读数");
  a("det_shir", "在线滤波", "不用", "O(1)", "O(1)：后验概率", "要知道 ρ 和 δ");
  a("det_dp", "动态规划 + 在线滤波", "O(T·G·Q)：G 个网格点，Q 个求积点", "O(1)：更新后验、查表", "O(T)：每一步一条报警线", "要知道 ρ、δ、F、T");
  a("stop_end", "常数", "不用", "O(1)", "O(1)", "什么都不用");
  a("stop_now", "常数", "不用", "O(1)", "O(1)", "什么都不用");
  a("stop_trail", "滚动统计", "不用", "O(t)：现找历史最高点（记下来可以做到 O(1)）", "O(1)", "到目前为止的最高点");
  a("stop_sqrt", "滚动统计", "不用", "O(t)（同上）", "O(1)", "最高点和剩余步数");
  a("stop_37", "滚动统计", "不用", "O(t)（同上）", "O(1)", "最高点和已过的步数");
  a("stop_dp", "动态规划", "O(T·G·51)：G 个网格点", "O(t) 找最高点，再查表", "O(T·G)：一张停 / 走的表", "要知道步长的分布和漂移");

  /* ================================================================== *
   *  自检清单（价格世界的对照表、十套玩法）：手册正文里拿对照表说过的话，和几个公式给出的数
   * ================================================================== */
  var PXG = "价格世界的对照表", TGG = "十套玩法";
  var PS = ["const", "hold", "ma", "mom", "meanrev", "band", "oukelly", "voltarget", "stop", "cppi", "kellyest", "grid", "martingale", "pipe", "kalman", "hmm", "ogd", "qlearn"];
  G.checkStrats = PS;       // 测试里核对：这张单子就是全部内置的价格规则
  /** 一条规则在一个世界里：与买入持有的配对差（每年）和它的标准误。返回这两个数的名字 */
  function pc(strat, world) {
    var id = "x." + strat + "." + world;
    if (!LIVE[id]) { LIVE[id] = { pcell: [strat, world, "dg"], fmt: "%1" }; LIVE[id + ".se"] = { pcell: [strat, world, "dgSE"], fmt: "%1" }; }
    return [id, id + ".se"];
  }
  function pcol(list, world) { return [].concat.apply([], list.map(function (s) { return pc(s, world); })); }
  function zOf(v, strat, world) { var id = "x." + strat + "." + world; return v(id) / v(id + ".se"); }
  function zs(v, list, world) { return list.map(function (s) { return zOf(v, s, world); }); }
  function zText(a) { return a.map(function (z) { return n(z, 0); }).join("、"); }
  var TREND = ["ma", "mom", "stop", "cppi"], MREV = ["meanrev", "band", "oukelly", "grid"];
  chk(PXG, "几何布朗运动里，止损与再入场显著跑输买入持有（差距超过 2 个标准误）", pc("stop", "gbm"), function (v) { var z = zOf(v, "stop", "gbm"); return { ok: z < -2, note: "每年 " + pct(v("x.stop.gbm"), 1) + "，是标准误的 " + n(z, 1) + " 倍" }; });
  chk(PXG, "换到牛熊切换，同一条规则显著跑赢", pc("stop", "regime"), function (v) { var z = zOf(v, "stop", "regime"); return { ok: z > 2, note: "每年 +" + pct(v("x.stop.regime"), 1) + "，是标准误的 " + n(z, 1) + " 倍" }; });
  chk(PXG, "趋势类的四条规则（均线交叉、时间序列动量、止损与再入场、CPPI）：分数布朗运动里都显著为正，均值回复里都显著为负", pcol(TREND, "fbm").concat(pcol(TREND, "ou")), function (v) { var a = zs(v, TREND, "fbm"), b = zs(v, TREND, "ou"); return { ok: a.every(function (z) { return z > 2; }) && b.every(function (z) { return z < -2; }), note: "标准误的倍数：分数布朗 " + zText(a) + "；均值回复 " + zText(b) }; });
  chk(PXG, "均值回复类的四条规则（均值回复、固定阈值带、线性均值回复、网格）：正好反过来", pcol(MREV, "ou").concat(pcol(MREV, "fbm")), function (v) { var a = zs(v, MREV, "ou"), b = zs(v, MREV, "fbm"); return { ok: a.every(function (z) { return z > 2; }) && b.every(function (z) { return z < -2; }), note: "标准误的倍数：均值回复 " + zText(a) + "；分数布朗 " + zText(b) }; });
  chk(PXG, "牛熊切换一列里，隐马尔可夫模型比其余每一条规则都多赚", pcol(PS, "regime").filter(function (id) { return !/\.se$/.test(id); }), function (v) { var top = v("x.hmm.regime"), second = -Infinity; PS.forEach(function (s) { if (s !== "hmm") second = Math.max(second, v("x." + s + ".regime")); }); return { ok: top > second, note: "隐马尔可夫每年 +" + pct(top, 1) + "，第二名 +" + pct(second, 1) }; });
  chk(PXG, "Bootstrap 一列（把标普 500 的月收益打散重排）：没有一条规则既超过 2 个标准误、又每年多赚 3 个百分点以上", pcol(PS, "boot"), function (v) { var best = -Infinity, hit = 0; PS.forEach(function (s) { var d = v("x." + s + ".boot"); best = Math.max(best, d); if (d > 0.03 && zOf(v, s, "boot") > 2) hit++; }); return { ok: hit === 0, note: "多赚得最多的一条是每年 +" + pct(best, 1) }; });
  LIVE["x.oukelly.iid_t.ruin"] = { pcell: ["oukelly", "iid_t", "ruin"], fmt: "%2" }; LIVE["x.voltarget.iid_t.ruin"] = { pcell: ["voltarget", "iid_t", "ruin"], fmt: "%2" };
  chk(PXG, "厚尾的经典分布里，带杠杆的两条规则（线性均值回复、波动率目标）都有路径净值归零", ["x.oukelly.iid_t.ruin", "x.voltarget.iid_t.ruin"], function (v) { var a = v("x.oukelly.iid_t.ruin"), b = v("x.voltarget.iid_t.ruin"); return { ok: a > 0 && b > 0, note: "归零的路径占 " + pct(a, 2) + " 和 " + pct(b, 2) }; });
  LIVE["x.voltarget.regime.sharpe"] = { pcell: ["voltarget", "regime", "sharpe"], fmt: 2 }; LIVE["x.bench.regime.sharpe"] = { pbench: ["regime", 1], fmt: 2 };
  chk(PXG, "牛熊切换里，波动率目标的夏普比率比买入持有高 0.3 以上", ["x.voltarget.regime.sharpe", "x.bench.regime.sharpe"], function (v) { var a = v("x.voltarget.regime.sharpe"), b = v("x.bench.regime.sharpe"); return { ok: a - b > 0.3, note: n(a, 2) + " 对 " + n(b, 2) }; });
  chk(PXG, "收益有自相关的两个世界（动量、反转）里，预测模型流水线都显著跑赢；时间序列动量在反转的世界里显著跑输", pc("pipe", "ar1").concat(pc("pipe", "ar1_rev"), pc("mom", "ar1_rev")), function (v) { var a = zOf(v, "pipe", "ar1"), b = zOf(v, "pipe", "ar1_rev"), c = zOf(v, "mom", "ar1_rev"); return { ok: a > 2 && b > 2 && c < -2, note: "标准误的倍数：" + n(a, 0) + "、" + n(b, 0) + "、" + n(c, 0) }; });

  cell("t.lock.thr", "g_lock", "指数分布", "lock_thr", 4); cell("t.lock.unif", "g_lock", "均匀分布", "lock_thr", 4);
  calc("t.lock.rho", function (QL) { return QL.lockTheory(QL.worldDefaults("g_lock")).rhoStar; }, 4);
  chk(TGG, "① 接单与冷却：固定门槛 2.01 的平均每回合收益与理论值 ρ* 相符", ["t.lock.thr", "t.lock.thr.se", "t.lock.rho"], function (v) { return within(v("t.lock.thr"), v("t.lock.rho"), v("t.lock.thr.se"), 4, 0.001); });
  chk(TGG, "① 同一个门槛放到均匀分布 U(0, 2) 里，一单也接不到", ["t.lock.unif"], function (v) { return { ok: v("t.lock.unif") === 0, note: "得分 " + n(v("t.lock.unif"), 4) }; });
  cell("t.sec.cut", "g_sec", "选最好 · 只看名次", "sec_cut", 3); cell("t.sec.cut1000", "g_sec", "1000 人", "sec_cut", 3);
  calc("t.sec.p", function (QL) { return QL.secClassic(100).value; }, 4);
  chk(TGG, "② 秘书问题：先看 37 人再选，选中最好者的概率与理论值相符", ["t.sec.cut", "t.sec.cut.se", "t.sec.p"], function (v) { return within(v("t.sec.cut"), v("t.sec.p"), v("t.sec.cut.se"), 4); });
  chk(TGG, "② 人数变成 1000、还是先看 37 人：成功率掉到 12% 上下", ["t.sec.cut1000"], function (v) { return between(v("t.sec.cut1000"), 0.09, 0.16); });
  cell("t.coin.frac", "g_coin", "实验原样（封顶 250）", "coin_frac", 1); cell("t.coin.dp", "g_coin", "实验原样（封顶 250）", "coin_dp", 1);
  chk(TGG, "③ 偏硬币下注：每次押 20%（Kelly 比例）拿到动态规划最优值的 94% 到 98%", ["t.coin.frac", "t.coin.dp"], function (v) { return between(v("t.coin.frac") / v("t.coin.dp"), 0.94, 0.98); });
  cell("t.bold.all", "g_bold", "轮盘 18/38，翻倍", "bold_all", 3); cell("t.bold.timid", "g_bold", "轮盘 18/38，翻倍", "bold_timid", 3);
  calc("t.bold.p", function (QL) { return QL.boldQ(0.5, QL.worldDefaults("g_bold").p); }, 4);
  chk(TGG, "④ 翻倍或出局：一把全押，成功率就是单把的胜率", ["t.bold.all", "t.bold.all.se", "t.bold.p"], function (v) { return within(v("t.bold.all"), v("t.bold.p"), v("t.bold.all.se"), 4); });
  chk(TGG, "④ 每把只押 1% 慢慢磨：成功率不到 1%", ["t.bold.timid"], function (v) { return less(v("t.bold.timid"), 0.01); });
  [["rand", "ban_rand"], ["greedy", "ban_greedy"], ["ucb", "ban_ucb"], ["ts", "ban_ts"]].forEach(function (x) { cell("t.ban." + x[0], "g_bandit", "5 台，U(0,1)", x[1], 3); });
  chk(TGG, "⑤ 多臂老虎机：默认场景下四种算法的得分与手册里写的相符（随机 0.50、贪心 0.78、UCB 0.73、Thompson 0.80，各 ±0.012）", ["t.ban.rand", "t.ban.greedy", "t.ban.ucb", "t.ban.ts"], function (v) { var a = [v("t.ban.rand"), v("t.ban.greedy"), v("t.ban.ucb"), v("t.ban.ts")], w = [0.5, 0.78, 0.73, 0.8]; return { ok: a.every(function (x, i) { return Math.abs(x - w[i]) < 0.012; }), note: "现算 " + a.map(function (x) { return n(x, 3); }).join("、") }; });
  cell("t.news.crit", "g_news", "高利润（进价 3）", "news_crit", 1); cell("t.news.mean", "g_news", "高利润（进价 3）", "news_mean", 1);
  calc("t.news.best", function (QL) { return QL.newsTheory(QL.worldDefaults("g_news")).best; }, 1); calc("t.news.atmean", function (QL) { return QL.newsTheory(QL.worldDefaults("g_news")).atMean; }, 1);
  chk(TGG, "⑥ 报童问题：按临界分位订货，平均每天的利润与理论最优相符", ["t.news.crit", "t.news.crit.se", "t.news.best"], function (v) { return within(v("t.news.crit"), v("t.news.best"), v("t.news.crit.se"), 4); });
  chk(TGG, "⑥ 订需求的均值：与公式相符，比最优少一成上下", ["t.news.mean", "t.news.mean.se", "t.news.atmean", "t.news.best"], function (v) { var r = within(v("t.news.mean"), v("t.news.atmean"), v("t.news.mean.se"), 4), q = v("t.news.atmean") / v("t.news.best"); return { ok: r.ok && q > 0.85 && q < 0.93, note: r.note + "；是最优值的 " + pct(q) }; });
  cell("t.curse.fix", "g_curse", "原题（m = 1.5，没有信息）", "curse_fix", 2); cell("t.curse.shade", "g_curse", "有估值，噪声 15", "curse_shade", 2); cell("t.curse.bayes", "g_curse", "有估值，噪声 15", "curse_bayes", 2);
  calc("t.curse.60", function (QL) { return QL.curseProfit(60, 1.5); }, 2);
  chk(TGG, "⑦ 赢家诅咒：原题里出价 60，平均每次亏 9", ["t.curse.fix", "t.curse.fix.se", "t.curse.60"], function (v) { return within(v("t.curse.fix"), v("t.curse.60"), v("t.curse.fix.se"), 4); });
  chk(TGG, "⑦ 有估值、噪声 15：按估值打八折只赚 2 上下，贝叶斯出价赚 8 以上", ["t.curse.shade", "t.curse.bayes"], function (v) { var a = v("t.curse.shade"), b = v("t.curse.bayes"); return { ok: a > 1.5 && a < 2.5 && b > 8, note: "现算 " + n(a, 2) + " 和 " + n(b, 2) }; });
  cell("t.prop.fix", "g_prop", "标准：30 天、±10%、日线 5%", "prop_fix", 3); cell("t.prop.fix0", "g_prop", "没有优势（μ = 0）", "prop_fix", 3);
  chk(TGG, "⑧ 自营考核：2 倍仓位的通过率接近四成；没有优势时不过半", ["t.prop.fix", "t.prop.fix0"], function (v) { var a = v("t.prop.fix"), b = v("t.prop.fix0"); return { ok: a > 0.36 && a < 0.42 && b < 0.5, note: "现算 " + pct(a, 1) + " 和 " + pct(b, 1) }; });
  cell("t.ash.rev", "g_ashare", "主板制度（T+1，±10%）", "ash_rev", 3); cell("t.ash.free", "g_ashare", "T+0、不设涨跌停", "ash_rev", 3);
  chk(TGG, "⑨ A 股制度：高抛低吸在主板制度下每年约 1.5%，去掉 T+1 和涨跌停之后约 15%", ["t.ash.rev", "t.ash.free"], function (v) { var a = v("t.ash.rev"), b = v("t.ash.free"); return { ok: Math.abs(a - 0.015) < 0.004 && Math.abs(b - 0.154) < 0.01, note: "现算 " + pct(a, 1) + " 和 " + pct(b, 1) }; });
  cell("t.exec.now", "g_exec", "默认（λ = 0.5）", "exec_now", 2, true); cell("t.exec.twap", "g_exec", "默认（λ = 0.5）", "exec_twap", 2, true); cell("t.exec.ac", "g_exec", "默认（λ = 0.5）", "exec_ac", 2, true);
  calc("t.exec.twapv", function (QL) { var p = QL.worldDefaults("g_exec"), th = QL.execTheory(p); return th.cost(th.twap()).obj; }, 2); calc("t.exec.acv", function (QL) { var p = QL.worldDefaults("g_exec"), th = QL.execTheory(p); return th.cost(th.ac(p.lam)).obj; }, 2);
  chk(TGG, "⑩ 大单执行：一次卖完的成本是 5；匀速卖和 Almgren–Chriss 计划的成本与公式相符", ["t.exec.now", "t.exec.twap", "t.exec.twap.se", "t.exec.twapv", "t.exec.ac", "t.exec.ac.se", "t.exec.acv"], function (v) { var a = within(v("t.exec.twap"), v("t.exec.twapv"), v("t.exec.twap.se"), 4, 0.02), b = within(v("t.exec.ac"), v("t.exec.acv"), v("t.exec.ac.se"), 4, 0.02); return { ok: Math.abs(v("t.exec.now") - 5) < 1e-6 && a.ok && b.ok, note: "匀速：" + a.note + "；计划：" + b.note }; });

  /* ================================================================== *
   *  自检清单（观测玩法）
   * ================================================================== */
  var MG = "⑪ 测量参数", PG = "⑫ 预测", DG = "⑬ 变点检测", SG = "⑭ 停在最高点";
  chk(MG, "测漂移、时长 1：标准估计的得分等于公式 σ²/(Dτ²) = 4", ["m.mu1.std", "m.mu1.std.se"], function (v) { return within(v("m.mu1.std"), 4, v("m.mu1.std.se"), 4); });
  chk(MG, "同上：向先验收缩（w = 0.2）的得分等于公式 1/(1 + s) = 0.8", ["m.mu1.shrink", "m.mu1.shrink.se"], function (v) { return within(v("m.mu1.shrink"), 0.8, v("m.mu1.shrink.se"), 4); });
  chk(MG, "不看数据的得分是 1", ["m.mu1.prior", "m.mu1.prior.se"], function (v) { return within(v("m.mu1.prior"), 1, v("m.mu1.prior.se"), 4); });
  chk(MG, "测漂移、时长 25：标准估计的得分等于 0.16", ["m.mu25.std", "m.mu25.std.se"], function (v) { return within(v("m.mu25.std"), 0.16, v("m.mu25.std.se"), 4); });
  chk(MG, "降采样对漂移的估计没有影响（相差不到 5%）", ["m.mu1.std", "m.mu1.sub"], function (v) { return between(v("m.mu1.sub") / v("m.mu1.std"), 0.95, 1.05); });
  chk(MG, "只用最近一半的数据，漂移的误差翻倍", ["m.mu1.std", "m.mu1.half"], function (v) { return between(v("m.mu1.half") / v("m.mu1.std"), 1.7, 2.3); });
  chk(MG, "测波动、250 个点：标准估计的得分与公式 E[σ²]/(2(n−1)v₀) 相符", ["m.sg.std", "m.sg.std.se", "m.sg.th"], function (v) { return within(v("m.sg.std"), v("m.sg.th"), v("m.sg.std.se"), 4, 0.001); });
  chk(MG, "降采样到五分之一，波动的误差变成四到六倍", ["m.sg.std", "m.sg.sub"], function (v) { return between(v("m.sg.sub") / v("m.sg.std"), 3.6, 6.4); });
  chk(MG, "测回复速度、时长 10：标准估计平均高估约 4/D = 0.4", ["m.kp.std.bias"], function (v) { return between(v("m.kp.std.bias"), 0.25, 0.55); });
  chk(MG, "折半去偏把这个偏差去掉了大半", ["m.kp.jack.bias", "m.kp.std.bias"], function (v) { return less(Math.abs(v("m.kp.jack.bias")), 0.3 * v("m.kp.std.bias"), "标准估计偏差的三成"); });
  chk(MG, "但去偏之后均方误差并没有变小", ["m.kp.jack", "m.kp.std"], function (v) { return less(v("m.kp.std"), v("m.kp.jack")); });
  chk(MG, "测回复速度、时长 2：标准估计比不看数据还差（得分大于 1）", ["m.kp2.std"], function (v) { return less(1, v("m.kp2.std")); });
  chk(PG, "布朗运动：线性外推的技巧分是 −1", ["p.bm.line", "p.bm.line.se"], function (v) { return within(v("p.bm.line"), -1, v("p.bm.line.se"), 4, 0.02); });
  chk(PG, "布朗运动：没有一条规则胜过原地不动", ["p.bm.line", "p.bm.mean", "p.bm.ar", "p.bm.nn"], function (v) { var m = Math.max(v("p.bm.line"), v("p.bm.mean"), v("p.bm.ar"), v("p.bm.nn")); return { ok: m < 0, note: "四条规则里最高的是 " + n(m, 4) }; });
  chk(PG, "布朗运动：相似历史（k = 4）的技巧分约为 −1/k = −0.25", ["p.bm.nn"], function (v) { return between(v("p.bm.nn"), -0.3, -0.2); });
  chk(PG, "均值回复、提前 1 步：回到均值不超过理论上限 0.05，也不比它低太多", ["p.ou.mean", "p.ou.best"], function (v) { return between(v("p.ou.mean"), v("p.ou.best") - 0.015, v("p.ou.best") + 0.003); });
  chk(PG, "均值回复、提前 10 步：上限升到 0.33，实测在它下面不远", ["p.ou10.mean", "p.ou10.best"], function (v) { return between(v("p.ou10.mean"), v("p.ou10.best") - 0.06, v("p.ou10.best") + 0.005); });
  chk(PG, "带噪谐振子：自回归接近理论最优", ["p.osc.ar", "p.osc.best"], function (v) { return between(v("p.osc.ar"), v("p.osc.best") - 0.03, v("p.osc.best") + 0.005); });
  chk(PG, "分数布朗运动：自回归为正，但不超过理论上限", ["p.fbm.ar", "p.fbm.best"], function (v) { return between(v("p.fbm.ar"), 0.1, v("p.fbm.best") + 0.005); });
  chk(PG, "Logistic 映射：线性规则的技巧分是 0.5", ["p.logi.ar"], function (v) { return between(v("p.logi.ar"), 0.46, 0.51); });
  chk(PG, "Logistic 映射：相似历史超过 0.99", ["p.logi.nn"], function (v) { return less(0.99, v("p.logi.nn")); });
  chk(PG, "Logistic 映射：提前 5 步比提前 1 步差得多", ["p.logi.nn", "p.logi5.nn"], function (v) { return less(v("p.logi5.nn"), v("p.logi.nn") - 0.2); });
  chk(DG, "动态规划的实测代价与倒推值相符", ["d.g.dp", "d.g.dp.se", "d.g.dpv"], function (v) { return within(v("d.g.dp"), v("d.g.dpv"), v("d.g.dp.se"), 4); });
  chk(DG, "固定报警线的后验概率规则与动态规划相差不到 3%", ["d.g.shir", "d.g.dp"], function (v) { return between(v("d.g.shir") / v("d.g.dp"), 0.97, 1.03); });
  chk(DG, "累积和（默认的 h）比最优差不到一成", ["d.g.cusum", "d.g.dpv"], function (v) { return between(v("d.g.cusum") / v("d.g.dpv"), 0.95, 1.1); });
  chk(DG, "单点超限的代价是最优的三倍以上", ["d.g.shew", "d.g.dpv"], function (v) { return less(3 * v("d.g.dpv"), v("d.g.shew")); });
  chk(DG, "幅度减半，最优代价变大；加倍，变小", ["d.g.dpv", "d.half.dpv", "d.two.dpv"], function (v) { return { ok: v("d.two.dpv") < v("d.g.dpv") && v("d.g.dpv") < v("d.half.dpv"), note: n(v("d.two.dpv"), 2) + " < " + n(v("d.g.dpv"), 2) + " < " + n(v("d.half.dpv"), 2) }; });
  chk(DG, "厚尾噪声：截断的累积和胜过按正态噪声倒推的动态规划，也胜过不截断的累积和", ["d.t3.clip", "d.t3.dp", "d.t3.cusum"], function (v) { return { ok: v("d.t3.clip") < v("d.t3.dp") && v("d.t3.clip") < v("d.t3.cusum"), note: "截断 " + n(v("d.t3.clip"), 2) + "，动态规划 " + n(v("d.t3.dp"), 2) + "，不截断 " + n(v("d.t3.cusum"), 2) }; });
  chk(DG, "正态噪声下截断几乎不花钱（比最优差不到一成）", ["d.g.clip", "d.g.dpv"], function (v) { return between(v("d.g.clip") / v("d.g.dpv"), 0.95, 1.1); });
  chk(DG, "误报罚 500 步：报警线不跟着调的累积和，代价是调过的两倍以上", ["d.f500.cusumold", "d.f500.cusum"], function (v) { return less(2 * v("d.f500.cusum"), v("d.f500.cusumold")); });
  chk(DG, "幅度减半、报警线加倍：累积和的延迟变成三到五倍", ["d.cu1.delay", "d.cu05.delay"], function (v) { return between(v("d.cu05.delay") / v("d.cu1.delay"), 3, 5); });
  chk(SG, "没有漂移：走到头的实测代价与递推值相符", ["s.bm.end", "s.bm.end.se", "s.bm.endv"], function (v) { return within(v("s.bm.end"), v("s.bm.endv"), v("s.bm.end.se"), 4); });
  chk(SG, "没有漂移：立刻停与走到头的代价相同", ["s.bm.now", "s.bm.now.se", "s.bm.endv"], function (v) { return within(v("s.bm.now"), v("s.bm.endv"), v("s.bm.now.se"), 4); });
  chk(SG, "动态规划的实测代价与倒推值相符", ["s.bm.dp", "s.bm.dp.se", "s.bm.dpv"], function (v) { return within(v("s.bm.dp"), v("s.bm.dpv"), v("s.bm.dp.se"), 4); });
  chk(SG, "回落超过 1.12·√剩余步数 的规则与动态规划相差不到 0.03", ["s.bm.sqrt", "s.bm.dp"], function (v) { return between(v("s.bm.sqrt") - v("s.bm.dp"), -0.03, 0.03); });
  chk(SG, "离散的最优值低于连续时间的 0.7385，步数多了向它靠近", ["s.bm.dpv", "s.dp1000", "s.gps.v"], function (v) { return { ok: v("s.bm.dpv") < v("s.dp1000") && v("s.dp1000") < v("s.gps.v"), note: n(v("s.bm.dpv"), 4) + " < " + n(v("s.dp1000"), 4) + " < " + n(v("s.gps.v"), 4) }; });
  chk(SG, "按距离本身计分，各条规则打平（相差不到 0.03）", ["s.bm.end.lin", "s.bm.sqrt.lin", "s.bm.now.lin", "s.bm.37.lin"], function (v) { var a = [v("s.bm.end.lin"), v("s.bm.sqrt.lin"), v("s.bm.now.lin"), v("s.bm.37.lin")], d = Math.max.apply(null, a) - Math.min.apply(null, a); return { ok: d < 0.03, note: "最大与最小相差 " + n(d, 4) }; });
  chk(SG, "立刻停正好停在最高点的比例等于 C(2T, T)/4^T（正态步长）", ["s.bm.now.hit", "s.sa"], function (v) { return between(v("s.bm.now.hit"), v("s.sa") - 0.017, v("s.sa") + 0.017); });
  chk(SG, "厚尾步长下这个比例一样（Sparre Andersen）", ["s.t3.now.hit", "s.sa"], function (v) { return between(v("s.t3.now.hit"), v("s.sa") - 0.017, v("s.sa") + 0.017); });
  chk(SG, "向上漂移：走到头接近最优，立刻停差得远", ["s.up.end", "s.up.dp", "s.up.now"], function (v) { return { ok: v("s.up.end") - v("s.up.dp") < 0.02 && v("s.up.now") > 3 * v("s.up.dp"), note: "走到头 " + n(v("s.up.end"), 3) + "，动态规划 " + n(v("s.up.dp"), 3) + "，立刻停 " + n(v("s.up.now"), 3) }; });
  chk(SG, "均值回复：照搬秘书问题的规则胜过走到头，固定回落最差", ["s.ou.37", "s.ou.end", "s.ou.trail"], function (v) { return { ok: v("s.ou.37") < v("s.ou.end") && v("s.ou.end") < v("s.ou.trail"), note: n(v("s.ou.37"), 3) + " < " + n(v("s.ou.end"), 3) + " < " + n(v("s.ou.trail"), 3) }; });

  /* ================================================================== *
   *  价格世界的另一面：不当价格，当作研究对象
   *  每个世界：一段话（应该看到什么），和几个"去对应的观测玩法"的按钮 [按钮上的字, 玩法, 世界参数]
   * ================================================================== */
  G.worldObs = {
    gbm: { md: R`把对数价格 $X_t=\ln S_t$ 当作一个粒子的位置：$X_t=X_0+mt+\sigma W_t$，$m=\mu-\sigma^2/2$，$W$ 是标准布朗运动。对这样一条轨迹可以问四个问题，每个都有一套对应的观测玩法。

- **参数量得出来吗。** 去掉漂移后，位移的均方随时间线性增长：$\mathbb{E}(X_{t+s}-X_t-ms)^2=\sigma^2s$（Einstein 1905；扩散系数是 $\sigma^2/2$）。$\sigma$ 靠加密采样就能量准，$n$ 个点时相对标准误约 $1/\sqrt{2n}$，与时长无关。$m$ 只能靠拉长时间：$\operatorname{Var}\hat m=\sigma^2/D$，与采样多密无关。默认的 $\sigma=20\%$ 下，一年的数据给出的 $\hat m$ 的标准误是每年 20 个百分点。
- **能预测吗。** 增量独立，$\mathbb{E}[X_{t+h}\mid\mathcal{F}_t]=X_t+mh$。过去的走势对下一步没有任何信息；画趋势线、往均值拉，都只会比"原地不动"差。
- **变化多快能发现。** 设漂移在一个未知的时刻跳了 $\delta$ 个单步标准差。把标准化的增量 $z_t$ 的对数似然比 $\delta(z_t-\delta/2)$ 累加起来、跌到 0 以下就从 0 重新开始，超过报警线就报警：这是累积和（CUSUM）。误报间隔为 $\gamma$ 时，最坏情况下的平均延迟在 $\gamma\to\infty$ 时渐近于 $2\ln\gamma/\delta^2$（Lorden 1971），没有别的规则能更快。
- **最高点认得出来吗。** $\max_{s\le t}W_s$ 与 $|W_t|$ 同分布（反射原理）；取到最大值的时刻 $\theta$ 服从反正弦律 $P(\theta\le s)=\frac2\pi\arcsin\sqrt{s/t}$，最高点最可能出现在开头或结尾。没有漂移时，不论用什么规则，停下的位置与最高点的平均距离都一样（可选停止定理：$\mathbb{E}X_\tau=X_0$）；按距离的平方计，才分得出规则的好坏。`,
      go: [["测漂移", "o_meas", { what: "mu" }], ["测波动", "o_meas", { what: "sigma" }], ["预测下一步", "o_pred", { src: "bm" }], ["发现漂移的突变", "o_det", { src: "gauss" }], ["停在最高点", "o_stop", { src: "bm" }]] },
    ou: { md: R`这是过阻尼的朗之万方程：一个泡在黏性液体里、被弹簧（或光镊）拉住的小球，位置 $X$ 满足 $dX=\kappa(\bar x-X)\,dt+\sigma\,dW$，这里 $\bar x=\ln\theta$。把它当作研究对象，应该看到：

- **平稳分布和弛豫。** 平稳分布是 $N(\bar x,\ \sigma^2/2\kappa)$，这是势阱里的 Boltzmann 分布。自相关按指数衰减，$\operatorname{Corr}(X_t,X_{t+s})=e^{-\kappa s}$；弛豫时间是 $1/\kappa$，半衰期是 $\ln2/\kappa$。默认 $\kappa=5$／年：半衰期约 0.14 年，35 个交易日上下。
- **功率谱是洛伦兹线型。** $S(\omega)=\dfrac{\sigma^2}{\kappa^2+\omega^2}$：低频是平的，过了拐角频率 $\kappa$ 之后按 $1/\omega^2$ 下降。高频的那一段和布朗运动分不出来；要看出"有回复"，观测的时长得盖住好几个弛豫时间。
- **能预测，但只在弛豫时间之内。** $\mathbb{E}[X_{t+h}\mid X_t]=\bar x+e^{-\kappa h}(X_t-\bar x)$。与"原地不动"相比，均方误差最多少掉 $(1-e^{-\kappa h})/2$：看得越远这个比例越高，上限是一半，那时最好的预测就是报均值。
- **回复速度很难量准。** 相对标准误约 $\sqrt{2/(\kappa D)}$，而且有偏：$\mathbb{E}\hat\kappa-\kappa\approx4/D$，回复总显得比实际快。默认 $\kappa=5$、两年的数据：相对标准误约 45%，偏差约 $+2$。
- **最高点不再挤在两端。** 轨迹很快忘掉自己的过去，最高点出现在各个时段的机会差不多。"先看一段、再等新高"的规则在布朗运动里没有用，在这里有用。`,
      go: [["测回复速度", "o_meas", { what: "kappa" }], ["预测", "o_pred", { src: "ou" }], ["停在最高点", "o_stop", { src: "ou" }]] },
    ar1: { md: R`这个世界里，收益自己是一个离散时间的均值回复过程：$r_{t+1}-\bar r=\varphi\,(r_t-\bar r)+\varepsilon_{t+1}$。"⑫ 预测"里的"均值回复"世界，就是把同一个递推直接当作被预测的量。

- **自相关按几何级数衰减。** $\operatorname{Corr}(r_t,r_{t+k})=\varphi^k$。
- **最优的一步预测**是 $\bar r+\varphi\,(r_t-\bar r)$，能解释的方差比例是 $\varphi^2$。默认 $\varphi=0.1$：只有 1%。
- **$\varphi$ 本身不好量。** 最小二乘估计的标准误约 $\sqrt{(1-\varphi^2)/n}$，要把 $\varphi=0.1$ 和 0 分开（两个标准误），需要大约 400 个观测；它还有偏，$\mathbb{E}\hat\varphi-\varphi\approx-(1+3\varphi)/n$。`,
      go: [["预测一个 AR(1) 序列", "o_pred", { src: "ou" }], ["测回复速度", "o_meas", { what: "kappa" }]] },
    fbm: { md: R`分数布朗运动 $B^H$ 是均值为 0、协方差为 $\mathbb{E}B^H_sB^H_t=\tfrac12\bigl(s^{2H}+t^{2H}-|t-s|^{2H}\bigr)$ 的高斯过程（这里再乘上一个波动 $\sigma$）。把它当作研究对象，应该看到：

- **反常扩散。** $\mathbb{E}(X_{t+s}-X_t)^2=\sigma^2s^{2H}$。在双对数图上，均方位移对时间是一条斜率 $2H$ 的直线：$H=\frac12$ 是普通扩散，$H>\frac12$ 走得更快（超扩散），$H<\frac12$ 更慢（次扩散）。
- **自相似。** 对任何 $c>0$，$(X_{ct})_{t\ge0}$ 与 $(c^HX_t)_{t\ge0}$ 同分布：把时间轴拉长 $c$ 倍、纵轴缩小 $c^H$ 倍，统计上看不出区别。
- **长记忆。** 单位间隔的增量的自协方差是 $\gamma(k)=\frac{\sigma^2}{2}\bigl(|k+1|^{2H}-2|k|^{2H}+|k-1|^{2H}\bigr)\sim\sigma^2H(2H-1)\,k^{2H-2}$。$H>\frac12$ 时 $\sum_k\gamma(k)=\infty$：$n$ 个增量的样本均值的方差恰好是 $\sigma^2n^{2H-2}$，比独立时的 $1/n$ 衰减得慢。
- **能预测。** $H\ne\frac12$ 时它不是半鞅，过去的增量对未来有信息。只用上一个增量做线性预测，能解释的方差比例是 $\rho_1^2$，$\rho_1=2^{2H-1}-1$；$H=0.75$ 时是 0.17，用上最近 60 个增量是 ⟪p.fbm.best|3⟫，再往前的历史几乎不再添什么。`,
      go: [["测 Hurst 指数", "o_meas", { what: "hurst" }], ["预测", "o_pred", { src: "fbm" }]] },
    logistic: { md: R`$x_{t+1}=a\,x_t(1-x_t)$ 里没有任何随机性。把它当作研究对象，应该看到（$a=4$ 时）：

- **它通得过白噪声的线性检验。** 不变密度是 $\rho(x)=\dfrac{1}{\pi\sqrt{x(1-x)}}$（Ulam 和 von Neumann 1947），在它之下 $\operatorname{Cov}(x_t,x_{t+k})=0$ 对一切 $k\ge1$ 成立。*证明。* 取 $x_0=\sin^2(\pi u)$，$u$ 在 $[0,1]$ 上均匀，则 $x_0$ 的密度就是 $\rho$，并且 $x_t=\sin^2(2^t\pi u)=\tfrac12\bigl(1-\cos(2^{t+1}\pi u)\bigr)$；频率为不同正整数的余弦在 $[0,1]$ 上正交。
- **其实完全确定。** 把 $x_{t+1}$ 对 $x_t$ 画成散点图，所有的点落在一条抛物线上。自相关和线性的自回归看不见它；"在历史里找最像现在的时刻，看它后来怎样"一步就能报准。
- **预测有期限。** Lyapunov 指数是 $\int\ln|4(1-2x)|\,\rho(x)\,dx=\ln2$：初始的误差平均每步翻一倍，精度为 $\varepsilon$ 的初值最多管 $\log_2(1/\varepsilon)$ 步。
- **通往混沌的路。** 把 $a$ 从 3 往上调，轨道的周期依次是 2、4、8、…，相邻两次倍周期分岔的间隔按 Feigenbaum 常数 $4.669\ldots$ 的比例缩短，在 $a\approx3.5699$ 处进入混沌。这里的参数从 3.57 起。`,
      go: [["预测下一步", "o_pred", { src: "logi" }], ["提前 5 步", "o_pred", { src: "logi", h: 5 }], ["加 5% 的观测噪声", "o_pred", { src: "logi", noise: 0.05 }]] },
    lorenz: { md: R`三个变量的常微分方程，没有随机项。把它当作研究对象，应该看到：

- **奇怪吸引子。** 相空间的体积按 $e^{-(10+1+8/3)\,t}$ 收缩（向量场的散度是常数 $-13.67$），所有轨道被吸到一个体积为零的集合上，却永不重复。这个集合的维数约 2.06。
- **对初值敏感。** 最大的 Lyapunov 指数约 0.906／单位时间：相邻两条轨道的距离每 $\ln2/0.906\approx0.77$ 个时间单位翻一倍。
- **只看一个分量就够。** 嵌入定理（Takens 1981；Sauer、Yorke 和 Casdagli 1991）：对一般的（generic）光滑系统和观测量，延迟坐标 $(x_t,x_{t-\tau},x_{t-2\tau},\ldots)$ 的个数多于吸引子盒维数的两倍时，这个向量在吸引子上是单射。所以只凭 $x$ 的记录，就能在历史里找到"与现在处于同一状态"的时刻，用它的后续来预测。
- **预测的期限由 Lyapunov 指数决定。** 提前量每增加 0.77 个时间单位，误差翻一倍，直到与吸引子本身一样大。`,
      go: [["预测下一步", "o_pred", { src: "lorenz" }], ["提前 10 步", "o_pred", { src: "lorenz", h: 10 }]] },
    osc: { md: R`$x_t=2\rho\cos\omega\cdot x_{t-1}-\rho^2x_{t-2}+\varepsilon_t$ 是被随机力推动的欠阻尼振子。把它当作研究对象，应该看到：

- **功率谱上有一个峰。** $S(\lambda)=\dfrac{\sigma_\varepsilon^2}{\bigl|1-2\rho\cos\omega\,e^{-i\lambda}+\rho^2e^{-2i\lambda}\bigr|^2}$，峰在 $\lambda\approx\omega$ 附近；$\rho$ 越接近 1，峰越窄越高（品质因数越大）。
- **自相关是衰减的余弦。** $\operatorname{Corr}(x_t,x_{t+k})=\rho^k\,\dfrac{\sin(k\omega+\psi)}{\sin\psi}$，$\tan\psi=\dfrac{1+\rho^2}{1-\rho^2}\tan\omega$。
- **周期大致固定，相位会漂。** 振幅和相位的记忆大约是 $1/(1-\rho)$ 步；默认 $\rho=0.97$ 时约 33 步，不到一个默认的周期（40 步）。所以"按固定的周期高抛低吸"撑不了几个来回。
- **最优的预测就是递推本身。** 知道 $\rho$ 和 $\omega$ 时，一步预测的误差只剩 $\varepsilon_t$。"⑫ 预测"里的默认设置（周期 20 步，$\rho=0.95$）下，技巧分的上限是 ⟪p.osc.best|3⟫；自回归从数据里学系数，能学到接近这个数。`,
      go: [["预测", "o_pred", { src: "osc" }]] },
    regime: { md: R`牛熊切换是一个藏在噪声后面的两态开关（随机电报噪声）。把它当作研究对象，问题是**滤波**：从看得见的收益推断看不见的状态。

- **滤波的递推。** 每来一个收益，用贝叶斯公式更新"现在是牛市"的概率，再按转移概率往前推一步。这是隐马尔可夫模型的前向算法；连续时间的版本是 Wonham（1965）滤波。规则里的"隐马尔可夫"做的就是这件事。
- **只切换一次的特例就是变点检测。** 状态从"正常"跳到"异常"之后不再回来，问题变成：什么时候报警。Shiryaev（1963）证明，"异常"的后验概率第一次超过一个固定的门槛时报警是最优的。
- **分得清分不清，看信噪比。** 两个状态的漂移相差 $\Delta m$、波动为 $\sigma$ 时，观测时长 $t$ 之内累积的信噪比是 $(\Delta m)^2t/\sigma^2$。它远小于 1 时，哪种滤波都无能为力；状态的平均寿命要比 $\sigma^2/(\Delta m)^2$ 长得多，切换才看得出来。`,
      go: [["变点检测", "o_det", { src: "gauss" }], ["幅度不确定时", "o_det", { src: "unk" }]] },
    jump: { md: R`跳跃让增量的分布长出厚尾。默认参数下，一次跳跃的幅度（均方根）约 8%，日常波动的单步标准差不到 1%：一次跳跃带来的方差抵得上几十步扩散。把它当作研究对象，要看的是厚尾怎样改变"取平均"这件事。观测玩法里用自由度 3 的 Student-t 噪声代表厚尾，不是这里的泊松跳跃，但出问题的是同一个地方。

- **检测。** 累积和把每一步的读数原样加进去，一个离群值就能把它顶过报警线，误报增多。把读数先截断到 $\pm c$ 再累加（Huber 1965 的稳健化），代价是正态噪声下略慢一点，换来厚尾下明显更少的误报。
- **最高点。** 对称、连续的步长分布，不论尾巴多厚，"一步都不走、起点就是最高点"的概率都是 $\binom{2T}{T}/4^T$（Sparre Andersen 1953）：这个数与分布无关。`,
      go: [["厚尾噪声下的检测", "o_det", { src: "t3" }], ["厚尾步长下的最高点", "o_stop", { src: "t3" }]] }
  };
  G.algoNotes.obs = R`**怎么读这张表。** 四套观测玩法的规则多数是一个公式或一个门槛，每一步只做固定的几次运算。值得看的是三处。测量类的规则每次被问到都把手里的观测重扫一遍，所以是 $O(t)$；裁判只在观测数增加一成时才问一次，整局加起来仍是 $O(T)$。最近邻预测不存模型，每次把全部历史扫一遍找最像的时刻，整局是 $O(T^2)$，是这张表里最慢的。两个动态规划（变点检测、停在最高点）事先把整个问题倒推完、存成表，现场只查表：它们要求事先知道的东西也最多。`;

  /* ---------- 名词 ---------- */
  G.glossary.push("观测与估计",
    ["先验 / 后验", `先验是看到数据之前对一个未知量的看法（它可能取哪些值、各有多大可能）。后验是看了数据之后、用贝叶斯公式更新过的看法。`],
    ["后验均值", `后验分布的平均值。在"误差按平方计"的标准下，它是最好的估计。`],
    ["均方误差", `估计（或预测）与真值之差的平方，取平均。它等于偏差的平方加上方差。`],
    ["偏差", `估计值的平均，与真值之差。偏差不会因为多看几条轨迹再取平均而消失，方差会。`],
    ["充分统计量", `数据的一个概括：知道了它，原始数据里就不再有关于那个参数的任何额外信息。`],
    ["收缩", `把估计往一个事先认定的值（比如 0）拉一拉。数据少、噪声大的时候，拉过之后的均方误差更小。`],
    ["二次变差", `把一段路径切成很多小段，每小段的增量平方后加起来。布朗运动的二次变差等于波动的平方乘以时长，与怎么切无关。`],
    ["弛豫时间", `偏离衰减到原来的 1/e 所需的时间，等于回复速度的倒数。`],
    ["Hurst 指数", `衡量增量之间长程相关的一个数，在 0 到 1 之间。等于一半时增量互不相关；大于一半时趋势延续；小于一半时来回震荡。`],
    ["技巧分", `预测比一个简单的参照（这里是"原地不动"）少掉的均方误差比例。0 是和参照一样，1 是完全报准，负数是不如参照。`],
    ["Lyapunov 指数", `混沌系统里，相邻两条轨道分开的平均指数速率。它决定了预测能提前多久。`],
    ["变点", `一个序列的统计性质（比如均值）发生改变的那个时刻。`],
    ["误报 / 延迟", `变化还没发生就报警，是误报。变化发生之后过了多少步才报，是延迟。两者此消彼长。`],
    ["似然比", `同一份数据在两个假设下出现的概率（密度）之比。它量的是数据支持哪个假设、支持到什么程度。`],
    ["反正弦律", `随机游走取到最大值的时刻的分布：两端的概率最大，中间最小。最高点更可能出现在开头或结尾。`]);
})(typeof QL_GUIDE !== "undefined" ? QL_GUIDE : require("./guide.js"));
