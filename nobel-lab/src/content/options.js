/* content/options.js — 1997 年经济学奖：Merton 与 Scholes，衍生品定价的新方法（Black–Scholes–Merton） */
(() => {
  const R = String.raw;
  ENTRIES.push({
    id: 'options', field: 'econ', year: 1997,
    who: [
      { zh: '罗伯特·C·默顿', en: 'Robert C. Merton', share: '1/2' },
      { zh: '迈伦·S·斯科尔斯', en: 'Myron S. Scholes', share: '1/2' },
    ],
    short: '默顿 · 斯科尔斯',
    citation: '表彰他们提出了一种确定衍生品价值的新方法。',
    title: '动态复制与 Black–Scholes 公式',
    formula: R`\partial_t V+\tfrac12\sigma^2S^2\partial_S^2V+rS\,\partial_SV-rV=0`,
    one: R`用股票和无风险借贷不断调整的组合可以精确复制期权的支付，所以期权只能值复制它的成本。这个成本里没有股票的期望收益率，也没有任何人的风险偏好，只剩下波动率 $\sigma$ 和利率 $r$。`,
    teaser: '一张“将来可按约定价买入”的权利，今天值多少钱？',
    scenario: R`
<p>马萨诸塞州剑桥，1969 年。股票期权和认股权证已经交易了几十年，可没有人说得清一张期权"应该"值多少钱。纽约的场外市场上，买卖双方通过经纪商一对一议价，同一类合约的报价可以差出一大截。</p>
<p>理论并不缺。1900 年 Bachelier 在巴黎的博士论文里就把交易所里的价格写成随机游走，算出了期权的期望支付；Sprenkle（1961）、Boness（1964）、Samuelson（1965）把股价改成对数正态。麻烦在于这些公式都要两个看不见的数：股票的期望收益率，以及给期权折现时该用的贴现率。期权的风险比股票大得多，而且随股价和剩余时间不断变化，这个贴现率是多少，谁也说不准。</p>
<p>你手边有：股票，可以按无风险利率存入或借出的现金，以及刚刚被引进经济学的 Itô 随机微积分。你的任务：先在只有两种明天的玩具世界里给期权定价，再把时间切细走到连续时间，然后站到卖出期权的交易员那一边，最后看看市场怎样反过来使用你的结果。</p>`,
    stages: 4,
    puzzle: R`
<p><b>Bachelier（1900）。</b>巴黎大学的博士论文《投机理论》把巴黎交易所法国永续国债（rente）的价格写成没有漂移的随机游走（比爱因斯坦的布朗运动论文早五年），据此计算期权的期望支付，并与交易所的期权价格做了比较。他的模型允许价格为负，也没有处理贴现和风险溢价，在此后半个世纪几乎无人问津，直到 1950 年代 Savage 与 Samuelson 重新发现它。</p>
<p><b>1960 年代的状况。</b>Samuelson（1965）用几何布朗运动给认股权证定价：股价按期望收益率 $\alpha$ 增长，权证的期望支付按另一个贴现率 $\beta\ge\alpha$ 折现。公式在形式上很漂亮，但 $\alpha$ 和 $\beta$ 都无法观测，而且 $\beta$ 应当随权证的杠杆而变，不是常数。Thorp 与 Kassouf（1967）已经在实践中用经验比率做"买股票、卖权证"的对冲交易，但比率是凑出来的。与此同时，Sharpe（1964）等人的资本资产定价模型（CAPM）给出了风险与期望收益的均衡关系，Merton（1969）开始用 Itô 微积分研究连续时间的最优投资。</p>
<p><b>真正的困难。</b>给一个风险资产定价，通常要回答"市场对这种风险要求多少补偿"。期权的风险随时在变：股价上涨时它更像股票，下跌时它几乎一文不值。任何"预期支付再折现"的方法都绕不开这个随时间、随状态变化的风险溢价。</p>
<p><b>关于 Fischer Black。</b>Black 与 Scholes 一起发现了这个公式。他于 1995 年 8 月 30 日去世，终年 57 岁。诺贝尔奖不追授，所以 1997 年的经济学奖只授予 Merton 与 Scholes；瑞典皇家科学院在公告中专门提到了 Black 的贡献。</p>`,
    observation: R`
<p><b>一个消失的参数。</b>1960 年代末，在麻省剑桥的咨询公司 Arthur D. Little 工作的 Black 尝试用 CAPM 给权证定价：假设在每一瞬间，权证与股票的期望收益都满足 CAPM，他得到一个关于权证价值 $w(x,t)$ 的偏微分方程。奇怪的是，股票的期望收益率和市场风险溢价在方程里全部抵消了，只剩下波动率与利率。他一时解不出这个方程。1969 年起他与 MIT 的 Scholes 合作，想到：既然期望收益率不出现在方程里，不妨就令它等于无风险利率，再把 Sprenkle–Samuelson 公式里的两个未知贴现率都换成 $r$，就得到了解。</p>
<p><b>无风险组合。</b>Merton 当时也在 MIT。他指出：如果可以连续交易，持有一份期权、同时卖空 $\partial C/\partial S$ 股股票，这个组合在每一瞬间都没有风险，因此只能获得无风险利率，否则就有套利。这个论证不需要 CAPM，不需要任何关于投资者偏好的假设，也不需要所有人对期望收益率意见一致。Black 与 Scholes 1973 年的论文同时给出了对冲组合的推导和基于 CAPM 的推导；Merton 同年在《贝尔经济学与管理科学杂志》的长文里给出了严格的连续时间版本，并推广到红利、随机利率、美式期权的无套利界等情形。</p>
<p><b>发表与市场。</b>Black 与 Scholes 的论文先后被《政治经济学杂志》（JPE）和《经济学与统计学评论》拒稿，根据 Merton Miller 与 Eugene Fama 的意见修改后，JPE 接受了它，1973 年发表。同年 4 月 26 日，比论文刊出早约一个月，芝加哥期权交易所（CBOE）开张，第一天只交易看涨期权，在 16 只股票上成交 911 张合约。到 1975 年，场内交易员已经在用预先编好程序的计算器按公式计算报价和对冲比率。</p>
<p><b>可以检验的推论。</b>模型说同一标的、同一到期日的期权应当对应同一个波动率。1987 年之前，标普 500 指数期权（1983 年上市）的隐含波动率随行权价变化不大；1987 年 10 月 19 日美国股市单日下跌约 20%（道琼斯指数跌 22.6%）之后，低行权价期权的隐含波动率明显高于高行权价，形成持续至今的"偏斜"（Rubinstein 1994 系统记录了这一点）。</p>`,
    idea: R`
<p><b>复制即定价。</b>如果一个可交易的组合在所有情形下都与期权的支付相同，那么期权的价格只能等于这个组合的成本。差一分钱，就可以卖贵的、买便宜的，锁定无风险利润。这把一个"偏好与均衡"的问题变成了一个"无套利"的问题：不需要知道谁愿意承担多少风险。</p>
<p><b>动态而非静态。</b>期权不能用固定数量的股票和债券静态复制，因为它的支付是股价的非线性函数。但在连续时间里，组合可以随股价不断调整：在每一瞬间持有 $\Delta = \partial C/\partial S$ 股，组合的局部变化与期权的局部变化完全相同。Itô 引理保证了二阶项 $(dS)^2 = \sigma^2S^2dt$ 是确定的，于是剩下的部分没有随机性。这就是 Black–Scholes 偏微分方程。</p>
<p><b>期望收益率消失。</b>股票的期望收益率 $\mu$ 体现了市场对风险的定价，它已经包含在股价本身里。期权是股价的函数，它的价格对 $S$ 的依赖已经把 $\mu$ 吸收掉了。计算上的结果是"风险中性定价"：假装所有资产都按无风险利率增长，求期望支付再按 $r$ 折现。这是一个计算技巧，并不假设投资者真的风险中性。</p>
<p><b>完备市场的一种实现。</b>Arrow 与 Debreu 的一般均衡理论需要每一种"自然状态"都有对应的证券。Black–Scholes–Merton 说明：只要可以连续交易，一只股票加一只债券就能合成无穷多种状态证券。Harrison、Kreps 与 Pliska（1979–1981）把这一点提升为资产定价基本定理：无套利等价于存在等价鞅测度，市场完备等价于这个测度唯一。</p>
<p><b>不只是期权。</b>论文标题里的"公司负债"不是点缀：股东对公司资产拥有的是一份以债务面值为行权价的看涨期权（Merton 1974）。同样的方法可以给贷款担保、存款保险、可转债、投资项目中的灵活性（实物期权）定价。这正是颁奖词说"衍生品"而不说"期权"的原因。</p>`,
    math: R`
<p><b>1. 模型与自融资。</b>取带流的概率空间 $(\Omega,\mathcal F,(\mathcal F_t),\mathbb P)$ 与标准布朗运动 $W$。股票与债券满足</p>
$$dS_t=\mu S_t\,dt+\sigma S_t\,dW_t,\qquad dB_t=rB_t\,dt .$$
<p>策略 $(a_t,b_t)$ 是适应过程，价值 $\Pi_t=a_tS_t+b_tB_t$。称它<b>自融资</b>，若 $d\Pi_t=a_t\,dS_t+b_t\,dB_t$，即调仓时不注入也不抽出资金。<b>套利</b>是一个自融资策略，满足 $\Pi_0\le 0$、$\Pi_T\ge 0$ 几乎必然，且 $\mathbb P(\Pi_T\gt 0)\gt 0$。</p>
<p><b>2. Itô 引理。</b>设 $dX_t=\alpha_t\,dt+\beta_t\,dW_t$，$f\in C^{1,2}$，则</p>
$$df(t,X_t)=\Big(\partial_tf+\alpha_t\,\partial_xf+\tfrac12\beta_t^2\,\partial_x^2f\Big)dt+\beta_t\,\partial_xf\,dW_t .$$
<p>启发式记忆：$(dW)^2=dt$，因为布朗运动在 $[0,t]$ 上的二次变差恰为 $t$。取 $f=\ln S$ 得 $d\ln S=(\mu-\tfrac12\sigma^2)dt+\sigma\,dW$，所以 $S_t=S_0\exp\big((\mu-\tfrac12\sigma^2)t+\sigma W_t\big)$：期望 $S_0e^{\mu t}$，中位数却是 $S_0e^{(\mu-\sigma^2/2)t}$。</p>
<p><b>3. 一期模型。</b>股价 $S\to uS$ 或 $dS$，1 元债券 $\to R$。</p>
<p><i>命题。</i>(i) 无套利 $\iff d\lt R\lt u$。(ii) 此时任一支付 $(f_u,f_d)$ 被唯一的组合</p>
$$\Delta=\frac{f_u-f_d}{(u-d)S},\qquad b=\frac{uf_d-df_u}{(u-d)R}$$
<p>复制，唯一的无套利价格为 $f_0=\frac{1}{R}\big[qf_u+(1-q)f_d\big]$，$q=\frac{R-d}{u-d}\in(0,1)$。</p>
<p><i>证明梗概。</i>(i) 若 $R\ge u$，卖空股票存入债券即为套利；$R\le d$ 时反之。(ii) $\Delta uS+bR=f_u$、$\Delta dS+bR=f_d$ 是非退化线性方程组。若价格 $p\ne\Delta S+b$，卖出较贵的一方、买入较便宜的一方即得套利。代入整理得 $f_0$ 的表达式。∎</p>
<p>第一关的数字：$u=1.2,\ d=0.8,\ R=1.05$，$q=0.625$，$f_0=0.625\times 20/1.05=11.905$。真实概率 $p$ 不出现。</p>
<p><b>4. Black–Scholes–Merton 方程。</b></p>
<p><i>定理（复制）。</i>设 $V\in C^{1,2}([0,T)\times(0,\infty))\cap C([0,T]\times(0,\infty))$ 满足</p>
$$\partial_tV+\tfrac12\sigma^2S^2\partial_S^2V+rS\,\partial_SV-rV=0,\qquad V(T,S)=(S-K)^+ ,$$
<p>且增长不超过多项式。则自融资策略 $a_t=\partial_SV(t,S_t)$，$b_t=\big(V(t,S_t)-a_tS_t\big)/B_t$ 的价值恒等于 $V(t,S_t)$，特别地 $\Pi_T=(S_T-K)^+$。于是在无套利市场中，看涨期权在 $t$ 时刻的价格必为 $V(t,S_t)$。</p>
<p><i>证明梗概。</i>按定义 $\Pi_t=a_tS_t+b_tB_t=V(t,S_t)$，只需验证自融资。由 Itô 引理，$dV=\big(V_t+\mu SV_S+\tfrac12\sigma^2S^2V_{SS}\big)dt+\sigma SV_S\,dW$；另一方面 $a\,dS+b\,dB=V_S(\mu S\,dt+\sigma S\,dW)+r(V-SV_S)\,dt$。两式相减：</p>
$$dV-\big(a\,dS+b\,dB\big)=\big(V_t+\tfrac12\sigma^2S^2V_{SS}+rSV_S-rV\big)dt=0 .$$
<p>$dW$ 项与 $\mu$ 项都抵消了，剩下的正是方程的左边。∎ 反过来，若价格 $p_t\ne V(t,S_t)$，买入便宜的一方、卖出贵的一方并按上述策略对冲即构成套利（多项式增长条件用来排除"加倍下注"之类的病态策略）。Merton 的表述：组合"一份期权减 $V_S$ 股股票"在每一瞬间没有 $dW$ 项，所以它的收益率只能是 $r$。</p>
<p><b>5. 求解。</b>令 $\tau=T-t$，$y=\ln S+(r-\tfrac12\sigma^2)\tau$，$V=e^{-r\tau}u(\tau,y)$。直接代入可验证方程化为热方程</p>
$$\partial_\tau u=\tfrac12\sigma^2\,\partial_y^2u,\qquad u(0,y)=(e^y-K)^+ ,$$
<p>其解是与高斯核的卷积。等价地（Feynman–Kac），</p>
$$V(t,S)=e^{-r\tau}\,\mathbb E\Big[\big(Se^{(r-\sigma^2/2)\tau+\sigma\sqrt\tau Z}-K\big)^+\Big],\qquad Z\sim N(0,1) .$$
<p>行权当且仅当 $Z\gt -d_2$。对 $\mathbb E\big[e^{\sigma\sqrt\tau Z}\mathbf 1_{Z\gt -d_2}\big]$ 配方得 $e^{\sigma^2\tau/2}N(d_2+\sigma\sqrt\tau)$，于是</p>
$$C=S\,N(d_1)-Ke^{-r\tau}N(d_2),\qquad d_{1,2}=\frac{\ln(S/K)+(r\pm\tfrac12\sigma^2)\tau}{\sigma\sqrt\tau} .$$
<p>$S=K=100$、$\tau=1$、$r=5\%$、$\sigma=20\%$：$d_1=0.35$，$d_2=0.15$，$C=100\times0.6368-95.123\times0.5596=10.4506$。</p>
<p><b>6. 风险中性测度。</b>令 $\theta=(\mu-r)/\sigma$（风险的市场价格），定义 $\left.\frac{d\mathbb Q}{d\mathbb P}\right|_{\mathcal F_T}=\exp\big(-\theta W_T-\tfrac12\theta^2T\big)$。由 Girsanov 定理，$W^{\mathbb Q}_t=W_t+\theta t$ 是 $\mathbb Q$-布朗运动，且 $dS=rS\,dt+\sigma S\,dW^{\mathbb Q}$。任何自融资组合的贴现价值 $e^{-rt}\Pi_t$ 是 $\mathbb Q$-（局部）鞅，所以</p>
$$V(t,S_t)=e^{-r(T-t)}\,\mathbb E_{\mathbb Q}\big[(S_T-K)^+\,\big|\,\mathcal F_t\big] .$$
<p><i>资产定价基本定理</i>（Harrison–Kreps 1979，Harrison–Pliska 1981；最一般的形式见 Delbaen–Schachermayer 1994）：（适当意义下）无套利 $\iff$ 存在与 $\mathbb P$ 等价、使贴现价格成为鞅的测度；市场完备 $\iff$ 该测度唯一。Black–Scholes 模型里（流由 $W$ 生成）$\mathbb Q$ 唯一，由鞅表示定理，每个 $\mathbb Q$-平方可积的 $\mathcal F_T$-可测支付都可被复制。</p>
<p><b>7. 二叉树的极限。</b>CRR 树取 $u=e^{\sigma\sqrt{\Delta t}}$，$d=1/u$，$q=\frac{e^{r\Delta t}-d}{u-d}$。展开得</p>
$$q=\frac12+\frac{r-\sigma^2/2}{2\sigma}\sqrt{\Delta t}+O(\Delta t) .$$
<p>$\ln(S_T/S_0)=\sigma\sqrt{\Delta t}\,(2J-n)$，$J\sim\mathrm{Bin}(n,q)$，均值 $(r-\tfrac12\sigma^2)T+O(\sqrt{\Delta t})$，方差 $4q(1-q)\sigma^2T\to\sigma^2T$。单步增量一致有界于 $\sigma\sqrt{\Delta t}\to0$，Lindeberg 条件成立，故 $\ln(S_T/S_0)\Rightarrow N\big((r-\tfrac12\sigma^2)T,\sigma^2T\big)$；加上一致可积性，$C(n)\to C_{\rm BS}$。平值期权的误差为 $O(1/n)$，并随 $n$ 的奇偶交替变号（第二关的锯齿；$n=1000$ 时约 $-0.002$）。</p>
<p><b>8. 希腊字母与两个恒等式。</b></p>
$$\Delta=N(d_1),\quad \Gamma=\frac{\varphi(d_1)}{S\sigma\sqrt\tau},\quad \mathcal V=S\sqrt\tau\,\varphi(d_1),\quad \Theta=-\frac{S\varphi(d_1)\sigma}{2\sqrt\tau}-rKe^{-r\tau}N(d_2) .$$
<p><i>引理。</i>$S\varphi(d_1)=Ke^{-r\tau}\varphi(d_2)$。<i>证明。</i>$\varphi(d_2)/\varphi(d_1)=e^{(d_1-d_2)(d_1+d_2)/2}=e^{\sigma\sqrt\tau\cdot(\ln(S/K)+r\tau)/(\sigma\sqrt\tau)}=\frac{S}{K}e^{r\tau}$。∎ 正因如此，对 $C$ 求 $\partial_S$ 时 $d_1,d_2$ 对 $S$ 的导数项相互抵消，$\Delta=N(d_1)$ 恰好成立。用希腊字母写，方程就是 $\Theta+\tfrac12\sigma^2S^2\Gamma+rS\Delta-rV=0$。看跌–看涨平价 $C-P=S-Ke^{-r\tau}$ 与模型无关：多一份看涨、空一份看跌，静态地复制了远期合约。</p>
<p><b>9. 离散对冲的误差。</b>为简洁取 $r=0$，在 $t_i=iT/N$ 调仓。区间 $[t_i,t_{i+1}]$ 上，对冲者（多组合、空期权）的误差增量为</p>
$$\varepsilon_i=\Delta_i\,\delta S_i-\delta V_i\approx-\tfrac12\Gamma_i(\delta S_i)^2-\Theta_i\,\delta t=-\tfrac12\Gamma_iS_i^2\Big[\Big(\frac{\delta S_i}{S_i}\Big)^2-\sigma^2\delta t\Big],$$
<p>这里用了 $r=0$ 时的 $\Theta=-\tfrac12\sigma^2S^2\Gamma$。方括号内条件均值为 $O(\delta t^2)$、条件方差 $2\sigma^4\delta t^2+O(\delta t^{3})$，各 $\varepsilon_i$ 近似为鞅差，所以</p>
$$\mathrm{Var}\Big(\sum_i\varepsilon_i\Big)\approx\frac{T}{2N}\,\mathbb E\int_0^T\big(\sigma^2S_t^2\Gamma_t\big)^2dt,\qquad \mathrm{SD}\propto N^{-1/2} .$$
<p>（$\Gamma$ 在到期时的平值附近按 $\tau^{-1/2}$ 发散，但 $S_t$ 落在那里的概率按 $\tau^{1/2}$ 缩小，积分有限。）第三关的参数下常数约为 6.6：$N=250$ 时标准差约 0.42 元，是期权价格的 4%。严格的极限定理见 Bertsimas、Kogan 与 Lo（2000）。若每次交易有比例成本 $k$，总成本按 $k\sqrt N$ 增长，与误差 $\propto N^{-1/2}$ 此消彼长（Leland 1985）。</p>
<p><b>10. 用错了波动率。</b>设卖方按 $\sigma_{\rm imp}$ 定价并对冲，而股票的实际波动率是 $\sigma_{\rm real}$（可随时间变化），连续调仓。由方程 4 与 Itô 引理，</p>
$$\Pi_T-(S_T-K)^+=\int_0^Te^{r(T-t)}\,\tfrac12\,\Gamma^{\rm imp}_tS_t^2\big(\sigma_{\rm imp}^2-\sigma_{\rm real}^2\big)\,dt .$$
<p><i>证明梗概。</i>$d(\Pi-V)=r(\Pi-V)dt+\tfrac12\Gamma S^2(\sigma_{\rm imp}^2-\sigma_{\rm real}^2)dt$，再用常数变易。∎ 凸支付 $\Gamma\ge0$，所以只要 $\sigma_{\rm imp}$ 处处不低于实际波动率，卖方几乎必然不亏（El Karoui、Jeanblanc-Picqué 与 Shreve 1998）。演示里的直方图均值与这个积分的路径平均吻合。</p>
<p><b>11. 隐含波动率。</b>$C$ 关于 $\sigma$ 连续、严格递增（$\mathcal V\gt0$），$\sigma\to0$ 时趋于 $(S-Ke^{-rT})^+$，$\sigma\to\infty$ 时趋于 $S$。所以对无套利区间 $\big((S-Ke^{-rT})^+,S\big)$ 内的任一价格，存在唯一的 $\sigma_{\rm imp}$。又 $\partial_\sigma\mathcal V=\mathcal V\,d_1d_2/\sigma$，故 $C(\sigma)$ 在 $\sigma^*=\sqrt{2|\ln(S/K)+rT|/T}$ 以下凸、以上凹；从 $\sigma^*$ 出发的牛顿迭代单调收敛（Manaster–Koehler 1982）。</p>
<p><b>12. 公司负债（Merton 1974）。</b>公司资产 $A$ 服从几何布朗运动，波动率 $\sigma_A$；零息债务面值 $D$ 于 $T$ 到期。到期时股东得 $(A_T-D)^+$，所以股权就是看涨期权：</p>
$$E_0=A_0N(d_1)-De^{-rT}N(d_2),\qquad \text{债务}=A_0-E_0,\qquad s=-\frac1T\ln\frac{A_0-E_0}{De^{-rT}} .$$
<p>$s$ 是信用利差，$N(-d_2)$ 是 $\mathbb Q$ 下的违约概率。这是"结构化"信用模型的起点。</p>
<p><b>13. Bachelier 的公式。</b>若 $S_T=S_0+\sigma_BW_T$（$r=0$），则 $C=(S_0-K)N(d)+\sigma_B\sqrt T\,\varphi(d)$，$d=\frac{S_0-K}{\sigma_B\sqrt T}$，平值时 $C=\sigma_B\sqrt{T/2\pi}\approx0.4\,\sigma_B\sqrt T$。Black–Scholes 平值（$r=0$）为 $S\big(2N(\tfrac12\sigma\sqrt T)-1\big)\approx S\sigma\sqrt{T/2\pi}$：取 $\sigma_B=\sigma S$ 时两者一阶一致。差别在尾部与贴现，也就在"风险怎样定价"这个 Bachelier 没有回答的问题上。</p>
<p><b>14. Merton 的连续时间组合问题（1969、1971）。</b>财富 $X$ 中比例 $\pi$ 投资股票、以速率 $c$ 消费：$dX=\big[\pi X(\mu-r)+rX-c\big]dt+\pi X\sigma\,dW$，最大化 $\mathbb E\int_0^\infty e^{-\rho t}\frac{c^{1-\gamma}}{1-\gamma}dt$。HJB 方程</p>
$$\rho J=\max_{\pi,c}\Big\{\tfrac{c^{1-\gamma}}{1-\gamma}+J_X\big[\pi X(\mu-r)+rX-c\big]+\tfrac12J_{XX}\pi^2X^2\sigma^2\Big\}$$
<p>以 $J\propto X^{1-\gamma}$ 为解，对 $\pi$ 的一阶条件给出</p>
$$\pi^*=\frac{\mu-r}{\gamma\sigma^2} ,$$
<p>与财富和期限无关。$\mu-r=6\%$、$\sigma=20\%$、$\gamma=3$ 时 $\pi^*=0.5$。同一套工具（Itô 引理、动态规划、连续调仓）后来成了期权定价论证的骨架。</p>`,
    labNote: '上图拖动剩余期限 τ：价值曲线从光滑变成到期时的折线，绿色切线的斜率就是 Δ，PDE 残差始终为 0。下图把股票的"实际波动率"调得高于或低于隐含波动率，再模拟：卖方的平均盈亏变成负数或正数，大小等于 Γ 加权的方差差。',
    legacy: R`
<ul>
<li><b>鞅定价理论。</b>Harrison–Kreps（1979）与 Harrison–Pliska（1981）把无套利定价写成等价鞅测度的语言，Delbaen 与 Schachermayer（1994）给出最一般的资产定价基本定理。随机分析从此成为金融数学的标准工具。</li>
<li><b>市场。</b>CBOE 之后，期权、互换、信用衍生品逐一出现。2024 年美国期权清算公司（OCC）清算的上市期权合约约 122 亿张，创历史新高。2020 年代，当日到期（0DTE）的指数期权迅速增长，成为标普 500 指数期权成交的很大一部分。</li>
<li><b>信用。</b>Merton（1974）的结构化模型发展为 KMV 等商业违约概率模型，至今是银行信用风险管理的基本框架之一。</li>
<li><b>微笑与新模型。</b>1987 年之后的波动率偏斜催生了 Heston（1993）的随机波动率模型、Dupire（1994）的局部波动率模型，以及 2010 年代的"粗糙波动率"（Gatheral、Jaisson、Rosenbaum 2018）。1993 年推出、2003 年改为无模型方差公式的 VIX 指数，本身就是由期权价格反推的波动率。</li>
<li><b>Bachelier 回归。</b>2020 年 4 月，WTI 原油期货价格跌到负值前后，芝商所（CME）把部分能源期权的定价与保证金模型切换为允许负价格的 Bachelier 模型；负利率时期的利率期权也普遍用它报价。</li>
<li><b>LTCM。</b>Merton 与 Scholes 是 1994 年成立的对冲基金长期资本管理公司（LTCM）的合伙人。1998 年俄罗斯债务违约之后，这家高杠杆基金在不到四个月里亏损约 46 亿美元；9 月 23 日，在纽约联邦储备银行的协调下，14 家金融机构出资约 36 亿美元接管其头寸，基金于 2000 年初清盘。</li>
<li><b>今天。</b>做市商仍以 Δ、Γ、vega 管理风险；"深度对冲"（Buehler 等 2019）用神经网络在有交易成本、离散调仓的现实条件下直接学习对冲策略，它的基准仍是 Black–Scholes 的 Δ 对冲。</li>
</ul>`,
    myths: [
      '“Black–Scholes 公式需要预测股票会涨还是会跌。”公式里没有期望收益率 μ。复制的成本与股价的漂移无关，投资者对涨跌的看法已经体现在股价里。',
      '“风险中性定价假设投资者不在乎风险。”风险中性测度 Q 只是一个计算工具：在 Q 下求期望再按 r 折现，结果与复制成本相同。真实世界里股票的期望收益照样高于 r。',
      '“LTCM 的崩溃证明期权定价公式是错的。”LTCM 的亏损主要来自高杠杆的相对价值与收敛交易在流动性枯竭时同时亏损，并非公式的计算错误。它暴露的是模型之外的风险：连续交易、无摩擦与分布稳定这些假设在危机中同时失效。',
      '“隐含波动率是市场对未来波动率的最优预测。”它是一种报价方式，除了预期还包含波动率风险溢价。平均而言，指数期权的隐含波动率高于事后实现的波动率，差额正是卖出期权者得到的补偿。',
      '“公式是 Black 和 Scholes 两人完成的，Merton 只是做了推广。”Merton 给出了不依赖 CAPM、只依赖无套利的连续时间复制论证，这正是今天教科书的标准推导；所以模型常被称为 Black–Scholes–Merton 模型。',
    ],
    papers: [
      'F. Black, M. Scholes, “The Pricing of Options and Corporate Liabilities”, <i>J. Polit. Econ.</i> 81, 637 (1973)',
      'R. C. Merton, “Theory of Rational Option Pricing”, <i>Bell J. Econ. Manage. Sci.</i> 4, 141 (1973)',
      'R. C. Merton, “On the Pricing of Corporate Debt: The Risk Structure of Interest Rates”, <i>J. Finance</i> 29, 449 (1974)',
      'L. Bachelier, “Théorie de la spéculation”, <i>Ann. Sci. Éc. Norm. Supér.</i> 17, 21 (1900)',
      'J. C. Cox, S. A. Ross, M. Rubinstein, “Option Pricing: A Simplified Approach”, <i>J. Financ. Econ.</i> 7, 229 (1979)',
      'J. M. Harrison, D. M. Kreps, “Martingales and Arbitrage in Multiperiod Securities Markets”, <i>J. Econ. Theory</i> 20, 381 (1979)',
    ],
    links: [
      { to: 'arrow', label: '状态价格与完备市场' },
      { to: 'assetprice', label: '价格的随机游走与风险溢价' },
    ],
  });
})();
