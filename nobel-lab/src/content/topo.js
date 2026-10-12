/* content/topo.js — 2016 年诺贝尔物理学奖：拓扑相变与物质的拓扑相（索利斯；霍尔丹、科斯特利茨） */
(() => {
  const R = String.raw;
  ENTRIES.push({
    id: 'topo', field: 'phy', year: 2016,
    who: [
      { zh: '戴维·J·索利斯', en: 'David J. Thouless', share: '1/2' },
      { zh: 'F·邓肯·M·霍尔丹', en: 'F. Duncan M. Haldane', share: '1/4' },
      { zh: 'J·迈克尔·科斯特利茨', en: 'J. Michael Kosterlitz', share: '1/4' },
    ],
    short: '索利斯 · 霍尔丹 · 科斯特利茨',
    citation: '表彰他们在拓扑相变与物质拓扑相方面的理论发现。（奖金一半授予索利斯，另一半由霍尔丹与科斯特利茨共享。）',
    title: '拓扑相变与物质的拓扑相',
    formula: R`k_BT_{\mathrm{KT}} = \tfrac{\pi}{2}\,\Upsilon(T_{\mathrm{KT}}^{-}),\qquad C = \frac{1}{2\pi}\int_{T^2}\Omega \in \mathbb{Z}`,
    one: R`二维 XY 系统没有长程序，却有相变：低温时涡旋与反涡旋成对束缚，高温时解离，刚度在 $T_{\rm KT}$ 处从 $2k_BT_{\rm KT}/\pi$ 跳到零（Kosterlitz–Thouless）。量子物态也可以由整数值的拓扑不变量（绕数、陈数）区分；它们只在能隙闭合时改变，并迫使边界上出现无法消除的态（Thouless、Haldane）。`,
    teaser: '二维没有长程序，为什么还会有相变？',
    scenario: R`
<p>1970 年代初，英国伯明翰大学。统计物理刚刚有了一条新定理：Mermin 与 Wagner（1966）证明，在二维、相互作用为短程的系统中，连续对称性在任何非零温度下都不会自发破缺。二维磁体没有自发磁化，二维晶体没有真正的长程平移序，超流薄膜似乎也不该有“凝聚”。可是很薄的氦膜确实会超流；高温级数分析又暗示二维磁性模型在某个有限温度出现奇异性。二维系统里究竟有没有相变？如果有，它区分的是什么？</p>
<p>你是刚到伯明翰的博士后科斯特利茨，与索利斯合作。你手里有最简单的模型：平面内可以自由转动的“XY 自旋”，以及纸、笔和一台早期计算机。十年后，同样的数学会在量子物态里再次出现：索利斯在西雅图研究量子霍尔效应，霍尔丹研究一维量子自旋链。</p>
<p>你的任务：先学会给一张自旋快照里的“缺陷”定量计数；再判断它们在什么温度变得重要；最后到一条一维量子链上，看看链的两端会发生什么。</p>`,
    stages: 3,
    puzzle: R`
<p>朗道的相变理论（1937）用序参量和对称性破缺刻画物态：铁磁体破缺转动对称，晶体破缺平移对称，超流破缺相位对称。Peierls 与朗道在 1930 年代就指出，二维晶体中原子位移的热涨落随样品尺寸对数发散。Mermin 与 Wagner（1966）、Hohenberg（1967）把这一点严格化：二维、短程相互作用的系统在 $T\gt 0$ 时不能自发破缺连续对称性。按朗道的框架，二维 XY 磁体、超流薄膜和二维晶体都没有可以破缺的东西，也就不该有相变。</p>
<p>线索却指向另一面。Stanley 与 Kaplan（1966）的高温级数暗示二维磁性模型的磁化率在有限温度发散。Wegner（1967）发现 XY 模型的自旋波近似给出按幂律衰减的关联，而高温下关联必然按指数衰减，两者之间似乎必须有一个奇点。Berezinskii（1970–71）指出低温相具有幂律关联，并讨论了涡旋的作用。问题是：没有对称性破缺，相变区分的到底是什么？</p>
<p>十年后，问题以量子形式出现。1980 年的量子霍尔平台精确到十亿分之一以下，需要一种与样品细节无关的解释。在一维，$S = 1/2$ 的反铁磁海森堡链（贝特 1931 年精确求解）没有能隙，关联按幂律衰减；人们普遍以为任何自旋的反铁磁链都如此。</p>`,
    observation: R`
<p><b>涡旋解离（1972–74）。</b>Kosterlitz 与 Thouless 在伯明翰的两篇论文（1972 年短文，1973 年长文）提出：二维 XY 系统的相变由涡旋–反涡旋对的解离驱动，同样的机制也适用于二维超流（量子化涡旋）和二维晶体（位错）。简单的能量–熵比较给出 $k_BT^* = \pi J/2$。Kosterlitz（1974）用重整化群求出临界行为：关联长度 $\xi\sim\exp\big(b/\sqrt{T/T_{\rm KT}-1}\big)$，转变点的关联指数 $\eta = 1/4$。</p>
<p><b>普适跳变与超流氦薄膜（1977–78）。</b>Nelson 与 Kosterlitz（1977）预言，二维超流面密度在转变处从一个普适值跳到零：$\rho_s(T_{\rm KT}^-)/T_{\rm KT} = 2m^2k_B/(\pi\hbar^2) \approx 3.49\times10^{-9}\ \mathrm{g\,cm^{-2}\,K^{-1}}$（⁴He），与膜厚和衬底无关。Bishop 与 Reppy（1978，康奈尔）用扭摆振子测量氦薄膜的超流密度，看到它在转变温度处突然消失，跳变与预言的普适比值相符。此后，超导薄膜和约瑟夫森结阵列中的电流–电压关系 $V\propto I^{a(T)}$（在 $T_{\rm KT}$ 处 $a = 3$）、二维胶体晶体经由六角相的两步熔化（KTHNY 理论，1978–79），以及 2006 年二维超冷原子气体的干涉图样（Hadzibabic 等直接看到自由涡旋），都证实了这一图像。</p>
<p><b>TKNN（1982）与绝热输运（1983）。</b>索利斯与 Kohmoto、Nightingale、den Nijs 在西雅图计算了周期势与磁场中的二维电子（Hofstadter 蝴蝶），证明每个能隙中的霍尔电导是 $e^2/h$ 乘以一个整数，后者满足丢番图方程 $r = qs_r + pt_r$。B. Simon（1983）指出这个整数是陈数。同年索利斯证明，缓慢周期变化的一维绝缘体每个周期输运的电荷也是一个陈数（Thouless 泵）；2016 年在冷原子中实现。</p>
<p><b>霍尔丹的自旋链（1981–90）。</b>霍尔丹的结论（1981 年预印本，1983 年发表）与普遍看法相反：整数自旋的反铁磁海森堡链有能隙，半整数自旋链没有。这一预言起初争议很大，随后得到数值计算（Botet 与 Jullien 1983 等）和中子散射的确认：CsNiCl₃（Buyers 等 1986）与 NENP（Renard 等 1987）中都观测到能隙。$S = 1$ 链的能隙约为 $0.41\,J$。1990 年 Hagiwara 等在掺入 Cu²⁺ 的 NENP 中用电子自旋共振看到了链被切断处的自旋 1/2（随后又用非磁性杂质得到确认），这正是 AKLT 模型（1987）预言的边缘态。</p>
<p><b>Haldane 模型的实现。</b>霍尔丹 1988 年构造的蜂窝格子模型没有净磁场，却有量子霍尔效应。2013 年薛其坤团队在铬掺杂的 (Bi,Sb)₂Te₃ 薄膜中观测到零磁场下的量子反常霍尔效应；2014 年 Esslinger 团队用周期摇晃的蜂窝光晶格中的超冷 ⁴⁰K 原子实现了 Haldane 模型本身。</p>`,
    idea: R`
<p>两部分工作的共同语言是拓扑：一些量只能取整数值，所以在连续的形变下不能改变，只有当某种“障碍”出现时才会跳变。涡旋的绕数要改变，正反涡旋必须相遇湮灭；能带的绕数或陈数要改变，能隙必须闭合。</p>
<p>Kosterlitz 与 Thouless 的洞见是：二维 XY 系统的相变不是对称性破缺（Mermin–Wagner 定理不允许），而是拓扑缺陷的解离。低温时涡旋只以正负对出现，系统没有长程序却保有刚度，关联按幂律衰减；高温时自由涡旋大量出现，刚度消失，关联按指数衰减。转变温度可以用能量与熵的比较估计，重整化群再给出普适的预言：刚度在 $T_{\rm KT}$ 处跳变，$\Upsilon(T_{\rm KT}^-) = 2k_BT_{\rm KT}/\pi$。这是第一个由拓扑缺陷驱动、不破缺任何对称性的相变。</p>
<p>索利斯把拓扑带进了量子物态：量子霍尔电导（TKNN）和绝热泵送的电荷都是陈数，即被占据能带在一个二维环面上构成的矢量丛的示性数。霍尔丹发现，整数与半整数自旋链的区别来自 σ 模型中的拓扑项；他 1988 年的模型说明，量子霍尔效应不需要朗道能级和净磁场，只需要破缺时间反演对称的能带拓扑。这些不变量不由任何局部序参量刻画，而是基态在动量空间或参数空间上的整体性质。它们还迫使样品的边界上出现无法消除的态，这就是体–边对应。</p>`,
    math: R`
<p><b>1. XY 模型；没有长程序。</b>在正方格子上，每个格点一个角度 $\theta_i\in\mathbb R/2\pi\mathbb Z$，$H = -J\sum_{\langle ij\rangle}\cos(\theta_i - \theta_j)$，$J\gt 0$。它在整体转动 $\theta_i\mapsto\theta_i + \alpha$ 下不变。序参量 $m = \langle e^{i\theta_0}\rangle$。</p>
<p><i>定理（Mermin–Wagner 1966；经典 XY 模型见 Mermin 1967）。</i>对二维、有限程相互作用的系统，任何 $T\gt 0$ 下 $\lim_{h\to0}\lim_{|\Lambda|\to\infty}m(h, T) = 0$，$h$ 是沿固定方向的外场。</p>
<p><i>启发式证明。</i>低温下 $\cos(\theta_i - \theta_j)\approx 1 - \tfrac12(\theta_i - \theta_j)^2$，连续极限 $H\approx E_0 + \tfrac J2\int|\nabla\theta|^2d^2r$，这是一个高斯场，$\langle|\theta_{\mathbf k}|^2\rangle = k_BT/(Jk^2)$。于是</p>
$$\langle\theta(0)^2\rangle = \frac{k_BT}{J}\int_{1/L\lt |\mathbf k|\lt 1/a}\frac{d^2k}{(2\pi)^2}\,\frac1{k^2} = \frac{k_BT}{2\pi J}\ln\frac La\ \longrightarrow\ \infty,\qquad \langle e^{i\theta}\rangle = e^{-\langle\theta^2\rangle/2} = \Big(\frac aL\Big)^{k_BT/4\pi J}\to 0 .$$
<p>三维中同一个积分收敛，序可以存在。严格证明用 Bogoliubov 不等式把 $m^2$ 控制在一个积分的倒数以下，这个积分在二维、$h\to 0$ 时对数发散。∎ 同样的高斯计算给出 $\langle e^{i(\theta(\mathbf r) - \theta(0))}\rangle\simeq(a/r)^{\eta}$，$\eta = k_BT/(2\pi J)$：低温下关联按幂律衰减（准长程序）；而 $\beta J$ 足够小时，高温展开给出指数衰减。两种行为之间必须有奇点。</p>
<p><b>2. 涡旋：绕数是映射度。</b>设 $e^{i\theta}$ 在平面区域 $U$ 上除有限个点外连续。对 $U$ 中避开这些点的闭曲线 $\gamma$，定义</p>
$$w(\gamma) = \frac1{2\pi}\oint_\gamma\nabla\theta\cdot d\mathbf l = \deg\big(e^{i\theta}\circ\gamma : S^1\to S^1\big)\in\mathbb Z .$$
<p><i>命题。</i>(i) $w(\gamma)$ 只依赖 $\gamma$ 在 $U$ 中的自由同伦类；(ii) 若 $\gamma = \partial D$，则 $w(\gamma) = \sum_{p\in D}q_p$，$q_p$ 是 $D$ 内各奇点的荷（绕小圆的绕数）；(iii) 若 $\sum_{p\in D}q_p\ne 0$，则不存在在整个 $D$ 上连续、且在 $\partial D$ 上与原场相同的场。</p>
<p><i>证明梗概。</i>(i) 是映射度的同伦不变性，$\pi_1(S^1)\cong\mathbb Z$。(ii) 在 $D$ 挖去奇点小圆盘后的区域上，$d\theta$ 是闭 1-形式，由斯托克斯公式即得。(iii) 若能连续延拓，$e^{i\theta}\circ\partial D$ 在圆盘内零伦，度为 0，与 (ii) 矛盾。∎ 格点上同样成立：把每条边的角差取在 $(-\pi, \pi]$，每个小方格的和是 $2\pi q_p$，$q_p\in\mathbb Z$；任意回路的和等于它围住的小方格的 $q_p$ 之和，因为内部的边正反各走一次。这是挑战第一关的离散斯托克斯公式。</p>
<p><i>能量。</i>荷为 $q$ 的涡旋 $\theta = q\varphi$ 满足 $|\nabla\theta| = |q|/r$，在 $a\lt r\lt R$ 的环形区域上</p>
$$E_q = \frac J2\int_a^R\Big(\frac qr\Big)^2 2\pi r\,dr = \pi Jq^2\ln\frac Ra ,$$
<p>再加上核心能量 $E_c$。它随系统尺寸对数发散，所以孤立涡旋在低温下被压制；但荷为 $\pm1$ 的一对相距 $r$ 时远场互相抵消，$E_{\rm pair} = 2\pi J\ln(r/a) + 2E_c$ 是有限的。$|q|\ge 2$ 的涡旋能量是 $q^2$ 倍，会分裂成 $|q|$ 个单位涡旋。正方格子上的数值（挑战第二关）：$E(R)$ 对 $\ln R$ 的斜率为 3.15，随 $R$ 增大趋于 $\pi$。</p>
<p><b>3. Kosterlitz–Thouless 论证与重整化群。</b>涡旋中心可以放在约 $\pi R^2/a^2$ 个位置上，熵 $S = k_B\ln(\pi R^2/a^2)$，所以</p>
$$F = E - TS = (\pi J - 2k_BT)\ln\frac Ra + \text{常数} .$$
<p>$T\lt T^* = \pi J/2k_B$ 时 $F\to+\infty$，自由涡旋被压制；$T\gt T^*$ 时自由涡旋大量产生，破坏幂律关联。精确的处理把配分函数写成自旋波与涡旋“库仑气体”的乘积（Villain 近似；José、Kadanoff、Kirkpatrick 与 Nelson 1977）：</p>
$$\frac{H_{\rm v}}{k_BT} = -\pi K\sum_{i\ne j}q_iq_j\ln\frac{|\mathbf r_i - \mathbf r_j|}a + \frac{E_c}{k_BT}\sum_iq_i^2,\qquad \sum_iq_i = 0,\quad K = \frac J{k_BT} .$$
<p>束缚的涡旋对像电介质中的偶极子一样屏蔽涡旋之间的相互作用。逐步积掉尺度 $a\to ae^{l}$ 上的紧密对，Kosterlitz（1974）得到</p>
$$\frac{dK^{-1}}{dl} = 4\pi^3y^2 + O(y^4),\qquad \frac{dy}{dl} = (2 - \pi K)\,y + O(y^3),\qquad y = e^{-E_c/k_BT} .$$
<p>$y = 0$ 是一条不动点线：$K\gt 2/\pi$ 的部分吸引（低温相，涡旋逸度流向 0，涡旋全部成对），$K\lt 2/\pi$ 的部分排斥（高温相）。分界线经过 $(K, y) = (2/\pi, 0)$。由此得到：</p>
<ul>
<li><b>普适跳变</b>（Nelson–Kosterlitz 1977）：重整化后的刚度（螺旋模量）$\Upsilon = k_BT\,K_R$ 满足 $\Upsilon(T_{\rm KT}^-) = \tfrac2\pi k_BT_{\rm KT}$，而 $T\gt T_{\rm KT}$ 时 $\Upsilon = 0$。对超流薄膜 $\Upsilon = (\hbar/m)^2\rho_s$，于是 $\rho_s(T_{\rm KT}^-)/T_{\rm KT} = 2m^2k_B/(\pi\hbar^2)$。</li>
<li>低温相 $\eta(T) = k_BT/(2\pi\Upsilon(T))\le 1/4$，在 $T_{\rm KT}$ 处取等号。</li>
<li>高温一侧 $\xi\sim\exp\big(b/\sqrt{T/T_{\rm KT} - 1}\big)$，比任何幂律都发散得快。自由能的奇异部分 $\propto\xi^{-2}$ 在 $T_{\rm KT}$ 处各阶导数都连续（本质奇点），所以这是一个“无穷阶”相变；比热只在 $T_{\rm KT}$ 以上有一个非普适的圆峰。</li>
</ul>
<p>正方格子 XY 模型的数值结果是 $k_BT_{\rm KT} = 0.8929\,J$（Hasenbusch 2005），远低于粗略估计 $T^*\approx 1.571\,J/k_B$：自旋波和小涡旋对已经把大尺度上的刚度降到 $2T_{\rm KT}/\pi\approx 0.57\,J$。Fröhlich 与 Spencer（1981）严格证明，低温下关联函数有幂律下界（不会指数衰减）；结合高温下的指数衰减，二维 XY 模型确有相变。</p>
<p><b>4. 一维能带的绕数与 SSH 链。</b>链的每个元胞有 A、B 两个格点。若跳跃只连接 A 与 B（子格对称，或称手征对称），$\Gamma = \mathrm{diag}(1, -1)$ 满足 $\Gamma H\Gamma = -H$，布洛赫哈密顿量为</p>
$$H(k) = \begin{pmatrix}0 & \overline{h(k)}\\ h(k) & 0\end{pmatrix},\qquad E = \pm|h(k)|,\qquad h(k) = \sum_{m\ge 0}t_m e^{imk},$$
<p>$t_m$ 是 $B_n$ 与 $A_{n+m}$ 之间的跳跃（SSH 链：$t_0 = v$，$t_1 = w$）。若 $h(k)\ne 0$ 对一切 $k$ 成立（有能隙），定义</p>
$$\nu = \frac1{2\pi i}\oint_{|z| = 1}\frac{h'(z)}{h(z)}\,dz = \deg\Big(\frac h{|h|}: S^1\to S^1\Big)\in\mathbb Z,\qquad h(z) = \sum_m t_mz^m .$$
<p>它在保持能隙与子格对称的形变下不变，只能在某个 $k$ 处 $h(k) = 0$（能隙闭合）时改变。由辐角原理，$\nu$ 等于多项式 $h$ 在单位圆盘内的零点数。</p>
<p><i>定理（一维体–边对应）。</i>在半无限链 $n\ge 0$ 上（设 $t_0\ne 0$），$E = 0$ 的可归一化本征态都只占 A 子格，其个数等于 $\nu$。</p>
<p><i>证明。</i>$H$ 与 $\Gamma$ 反对易，所以零能空间在 $\Gamma$ 下不变，可以分别求 A、B 子格上的零模。对只占 A 的态，$H\psi = 0$ 等价于 B 格点上的方程 $\sum_mt_m\psi_A(n + m) = 0$（$n\ge 0$）。这是常系数线性递推，解空间由 $z_j^n$ 张成（$h(z_j) = 0$；重根时乘以 $n$ 的多项式），可归一化当且仅当 $|z_j|\lt 1$。对只占 B 的态，A 格点上的方程 $\sum_m\bar t_m\psi_B(n - m) = 0$ 连同 $\psi_B(-1) = \psi_B(-2) = \cdots = 0$ 逐个给出 $\psi_B\equiv 0$。所以零模数等于单位圆内的零点数，即 $\nu$。∎</p>
<p>这是 Toeplitz 算子指标定理（Gohberg–Krein）的特例：一般的有限程子格对称链中，左端 A 子格零模数减 B 子格零模数等于 $\nu$，在保持能隙的扰动下不变。长度为 $N$ 的有限链两端的零模通过体杂化，劈裂约为 $|z_{\max}|^N$，指数小。对 SSH 链，$w\gt v$ 时 $\nu = 1$，左端零模 $\psi_A(n)\propto(-v/w)^n$。对无自旋费米子，两个 $\nu$ 不同的区域之间的畴壁上有一个零模，半满时携带 $\pm e/2$ 的电荷（Jackiw–Rebbi 1976；Su–Schrieffer–Heeger 1979）。</p>
<p><b>5. 陈数与 Haldane 模型。</b>二维能带的被占据态 $u_{n\mathbf k}$ 在布里渊环面 $T^2$ 上构成复矢量丛 $\mathcal E$。贝里联络 $\mathcal A = i\langle u|du\rangle$，曲率 $\Omega = d\mathcal A$，陈数 $C = \frac1{2\pi}\int_{T^2}\Omega = \int_{T^2}c_1(\mathcal E)\in\mathbb Z$（整数性的证明见“量子霍尔效应”条目第 5 节：它是转移函数 $S^1\to U(1)$ 的绕数）。TKNN（1982）：$\sigma_{xy} = (e^2/h)\,C$。对两能带 $H(\mathbf k) = d_0 + \mathbf d\cdot\boldsymbol\sigma$，$\mathbf d$ 处处非零时，下能带的态与 $-\hat{\mathbf d}$ 平行，它的贝里相位是 $\hat{\mathbf d}$ 扫过的立体角的一半，于是</p>
$$C_- = \frac1{4\pi}\int_{T^2}\hat{\mathbf d}\cdot\big(\partial_{k_1}\hat{\mathbf d}\times\partial_{k_2}\hat{\mathbf d}\big)\,dk_1dk_2 = \deg\big(\hat{\mathbf d}: T^2\to S^2\big).$$
<p>Haldane（1988）在蜂窝格子上取最近邻跳跃 $t_1$、次近邻跳跃 $t_2e^{\pm i\varphi}$（沿顺时针与逆时针三角形环路的相位相反，每个元胞的净磁通为零），以及子格势 $\pm M$。记 $k_j = \mathbf k\cdot\mathbf a_j$（$\mathbf a_{1,2}$ 为布拉维格矢），</p>
$$d_x - id_y = t_1\big(1 + e^{-ik_1} + e^{-ik_2}\big),\qquad d_z = M - 2t_2\sin\varphi\,\big(\sin k_1 - \sin k_2 + \sin(k_2 - k_1)\big),$$
<p>$d_0 = 2t_2\cos\varphi\,\big(\cos k_1 + \cos k_2 + \cos(k_2 - k_1)\big)$ 不影响陈数。</p>
<p><i>命题。</i>设 $t_1\ne 0$。$(d_x, d_y)$ 只在两个狄拉克点 $K = (2\pi/3, 4\pi/3)$、$K' = (4\pi/3, 2\pi/3)$ 为零，那里 $d_z$ 分别等于 $m_K = M - 3\sqrt3\,t_2\sin\varphi$ 与 $m_{K'} = M + 3\sqrt3\,t_2\sin\varphi$。若二者都不为零，则</p>
$$C_- = \tfrac12\big[\operatorname{sgn}m_K - \operatorname{sgn}m_{K'}\big] .$$
<p><i>证明。</i>取南极 $-\hat z\in S^2$ 作为 $\hat{\mathbf d}$ 的正则值，它的原像是质量为负的狄拉克点。映射度等于原像处局部定向符号之和。在 $p$ 处 $d\hat{\mathbf d}_p = |d_z|^{-1}\,\partial(d_x, d_y)/\partial(k_1, k_2)$，其行列式为 $|d_z|^{-2}t_1^2\sin(k_2 - k_1)$：在 $K$ 为正，在 $K'$ 为负（两个狄拉克锥的手征相反）。南极处切平面的基 $(\hat x, \hat y)$ 相对于外法向 $-\hat z$ 是负定向的，所以 $K$ 贡献 $-1$，$K'$ 贡献 $+1$：$C_- = -[m_K\lt 0] + [m_{K'}\lt 0]$，与所述公式相同。∎</p>
<p>所以 $|M|\lt 3\sqrt3\,|t_2\sin\varphi|$ 时 $C_- = -\operatorname{sgn}(t_2\sin\varphi)$，$|M|\gt 3\sqrt3\,|t_2\sin\varphi|$ 时 $C_- = 0$；相边界上 $K$ 或 $K'$ 处能隙闭合。整体符号依赖 $T^2$ 的定向与 $\Omega$ 的符号约定，相图本身不依赖。这是第一个不需要净磁场的陈绝缘体。在条带几何中，由体–边对应（Hatsugai 1993），每条边上有 $|C|$ 支手征边缘态，两条边上的传播方向相反（演示实验）。</p>
<p><b>6. Thouless 泵。</b>一维绝缘体的哈密顿量缓慢、周期地变化，$H(t + \tau) = H(t)$，能隙始终打开。</p>
<p><i>定理（Thouless 1983）。</i>每个周期通过任一截面的电荷为 $Q = eC$，$C$ 是被占据能带在 $(k, t)\in S^1\times S^1$ 上的陈数。</p>
<p><i>证明梗概。</i>一阶绝热微扰给出能带 $n$ 中态的平均速度 $v_n(k) = \hbar^{-1}\partial_k\varepsilon_n - \Omega_n^{kt}$（反常速度项）。第一项对 $k$ 积分为零，所以一个周期内输运的粒子数为 $\sum_n\frac1{2\pi}\int_0^\tau dt\oint dk\,\Omega_n^{kt} = C$。∎ 例：在 SSH 链上加交错势 $\pm\Delta$（Rice–Mele 模型），让 $(v - w, \Delta)$ 沿一个绕过原点的圆转一圈，恰好泵过一个电子。在这里，第 4 节的一维绕数与第 5 节的二维陈数由同一个机制联系起来：把时间当作第二个动量。</p>
<p><b>7. 霍尔丹的自旋链。</b>反铁磁海森堡链 $H = J\sum_i\mathbf S_i\cdot\mathbf S_{i+1}$，$J\gt 0$。$S = 1/2$ 时贝特解无能隙；Lieb–Schultz–Mattis（1961）证明，平移不变的 $S = 1/2$ 链不可能同时有唯一基态和有限能隙（Affleck 与 Lieb 1986 推广到所有半整数 $S$）。霍尔丹把大 $S$ 链的低能理论写成 $O(3)$ 非线性 σ 模型：单位矢量场 $\mathbf n(x, \tau)$，欧氏作用量</p>
$$S_E = \frac1{2g}\int dx\,d\tau\Big(\frac1c(\partial_\tau\mathbf n)^2 + c(\partial_x\mathbf n)^2\Big) - i\theta Q[\mathbf n],\qquad Q = \frac1{4\pi}\int\mathbf n\cdot(\partial_x\mathbf n\times\partial_\tau\mathbf n)\,dx\,d\tau\in\mathbb Z,\qquad \theta = 2\pi S,\ g = \frac2S .$$
<p>$Q$ 是（紧化为 $S^2$ 的）时空到 $S^2$ 的映射度，即瞬子数。$S$ 为整数时 $e^{i\theta Q} = 1$，拓扑项不起作用，模型与普通 $O(3)$ σ 模型一样动力学地产生能隙；$S$ 为半整数时 $\theta = \pi$，不同瞬子扇区相消，模型无能隙（流向 $SU(2)_1$ WZW 共形场论；Affleck 与 Haldane 1987）。这就是<b>霍尔丹猜想</b>：整数自旋链有能隙。对 $S = 1$，DMRG（White 与 Huse 1993）给出 $\Delta\approx 0.4105\,J$，关联长度约 6 个格距；严格证明至今没有。</p>
<p>可以严格处理的例子是 AKLT 模型（Affleck、Kennedy、Lieb、Tasaki 1987）$H = \sum_i\big[\mathbf S_i\cdot\mathbf S_{i+1} + \tfrac13(\mathbf S_i\cdot\mathbf S_{i+1})^2\big]$：把每个 $S = 1$ 看作两个对称化的自旋 1/2，相邻格点各出一个组成单态。它在环上有唯一基态，并被证明有能隙；开链两端各剩一个自由的自旋 1/2，基态四重简并。现代观点下，这是<b>对称性保护的拓扑相</b>：端点上 $SO(3)$ 只能以投影表示实现，投影表示由 $H^2(SO(3), U(1))\cong\mathbb Z/2$ 分类，非平凡类不能在不闭合能隙、不破缺对称性的前提下连到直积态（Pollmann、Turner、Berg 与 Oshikawa 2010；Chen、Gu 与 Wen 2011）。</p>
<p><b>8. 分类。</b>对无相互作用的费米子，按 Altland–Zirnbauer 的十个对称类，$d$ 维有能隙相的分类群由 K 理论给出，具有 Bott 周期性（复类周期 2，实类周期 8；Schnyder、Ryu、Furusaki 与 Ludwig 2008，Kitaev 2009）。例：无对称的 A 类在 $d = 2$ 为 $\mathbb Z$（陈数），只有手征对称的 AIII 类在 $d = 1$ 为 $\mathbb Z$（第 4 节的绕数），时间反演 $\mathcal T^2 = -1$ 的 AII 类在 $d = 2, 3$ 为 $\mathbb Z/2$（Kane–Mele 不变量）。有相互作用时，可逆拓扑相的分类与群上同调和配边理论联系起来（Kapustin 2014；Freed 与 Hopkins 2016）。</p>`,
    labNote: R`把子格势 $M$ 拖过相图中的边界线 $|M| = 3\sqrt3\,|t_2\sin\varphi|$：体能隙闭合又重新打开，陈数从 $\mp1$ 变为 0，横穿能隙的边缘态随之消失。把 $\varphi$ 换号，陈数和两条边上边缘态的传播方向一起反转。右下是下能带的贝里曲率，它集中在两个狄拉克点附近。`,
    legacy: R`
<ul>
<li>KT 物理成为二维系统的通用语言：超流与超导薄膜、约瑟夫森结阵列、二维晶体经由六角相的熔化（KTHNY），以及冷原子气体（2006）。近年在二维磁性材料和二维超导体中也被反复检验。</li>
<li>拓扑绝缘体：Kane 与 Mele（2005）把两份自旋相反的 Haldane 模型组合成保持时间反演对称的量子自旋霍尔态，引入 $\mathbb Z/2$ 不变量；Bernevig、Hughes 与张首晟（2006）预言 HgTe 量子阱，König 等（2007）观测到；三维拓扑绝缘体（Fu、Kane、Mele 与 Moore、Balents，2007）随即在 Bi₁₋ₓSbₓ（2008）和 Bi₂Se₃ 中由角分辨光电子能谱证实。</li>
<li>陈绝缘体与拓扑能带：量子反常霍尔效应（2013），Haldane 模型的冷原子实现（2014），拓扑光子学（Haldane 与 Raghu 2008 提出，2009 年在微波光子晶体中观测到单向边缘态），拓扑泵（2016），以及外尔半金属（2015）。2023–24 年，在扭转双层 MoTe₂ 和多层石墨烯莫尔体系中观测到零磁场下的分数陈绝缘体（分数量子反常霍尔效应）。</li>
<li>拓扑量子计算：Kitaev（2001 年马约拉纳链，2003 年任意子）提出用拓扑简并的基态储存量子信息，局部噪声无法区分这些态。半导体–超导纳米线中的马约拉纳零模实验仍有争议；2025 年微软发布基于“拓扑导体”的芯片；同期发表的《自然》论文附有编辑说明：其结果本身不构成存在马约拉纳零模的证据。</li>
<li>Haldane 相成为对称性保护拓扑相的第一个例子；纠缠谱（Li 与 Haldane 2008）和矩阵乘积态给出了一维有能隙相的完整分类。</li>
<li>数学：拓扑物态把 K 理论、指标定理、非交换几何和配边理论带进了凝聚态物理；“可逆拓扑相等价于可逆场论”（Freed 与 Hopkins）是这一方向的一个代表性结果。</li>
</ul>`,
    myths: [
      '“拓扑相变就是两个拓扑相之间的相变。”Kosterlitz–Thouless 相变是一个经典热力学相变，由拓扑缺陷（涡旋）的解离驱动，两侧都不是“拓扑相”。物质的拓扑相（量子霍尔态、陈绝缘体、Haldane 链）是量子基态的性质，由整数不变量区分，它们之间的转变要求能隙闭合。两部分工作共享的是拓扑这一数学工具。',
      '“Mermin–Wagner 定理说二维系统不可能有相变。”定理禁止的是 T > 0 时连续对称性的自发破缺（长程序），不是相变本身。KT 相变发生在幂律关联与指数关联两相之间；离散对称性的破缺在二维完全可以发生，例如昂萨格 1944 年精确求解的二维伊辛模型。',
      '“拓扑绝缘体的边缘态来自表面的杂质或悬挂键。”普通的表面态可以被表面处理消除，拓扑边缘态则由体的不变量强制存在：只要能隙不闭合、保护它的对称性不被破坏，任何扰动都消除不了它们。',
      '“霍尔丹能隙已经被严格证明。”这仍是猜想。对 S = 1 海森堡链，数值计算给出约 0.41 J 的能隙，中子散射实验也证实了它，但严格证明至今没有；严格结果只对 AKLT 这样的特殊模型成立。',
    ],
    papers: [
      'J. M. Kosterlitz, D. J. Thouless, “Ordering, metastability and phase transitions in two-dimensional systems”, <i>J. Phys. C</i> 6, 1181 (1973)',
      'J. M. Kosterlitz, “The critical properties of the two-dimensional xy model”, <i>J. Phys. C</i> 7, 1046 (1974)',
      'V. L. Berezinskii, “Destruction of long-range order in one-dimensional and two-dimensional systems having a continuous symmetry group. I. Classical systems”, <i>Sov. Phys. JETP</i> 32, 493 (1971)',
      'D. J. Thouless, M. Kohmoto, M. P. Nightingale, M. den Nijs, “Quantized Hall Conductance in a Two-Dimensional Periodic Potential”, <i>Phys. Rev. Lett.</i> 49, 405 (1982)',
      'D. J. Thouless, “Quantization of particle transport”, <i>Phys. Rev. B</i> 27, 6083 (1983)',
      'F. D. M. Haldane, “Nonlinear Field Theory of Large-Spin Heisenberg Antiferromagnets: Semiclassically Quantized Solitons of the One-Dimensional Easy-Axis Néel State”, <i>Phys. Rev. Lett.</i> 50, 1153 (1983)',
      'F. D. M. Haldane, “Model for a Quantum Hall Effect without Landau Levels: Condensed-Matter Realization of the ‘Parity Anomaly’”, <i>Phys. Rev. Lett.</i> 61, 2015 (1988)',
      'D. R. Nelson, J. M. Kosterlitz, “Universal Jump in the Superfluid Density of Two-Dimensional Superfluids”, <i>Phys. Rev. Lett.</i> 39, 1201 (1977)',
    ],
    links: [
      { to: 'qhe', label: 'TKNN：量子霍尔电导是陈数' },
      { to: 'bcs', label: '超流与超导薄膜中的 KT 相变' },
      { to: 'higgs', label: '对称性破缺之外的物态分类' },
    ],
  });
})();
