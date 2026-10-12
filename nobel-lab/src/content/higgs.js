/* content/higgs.js — 2013 年诺贝尔物理学奖：BEH 机制与希格斯玻色子（恩格勒、希格斯） */
(() => {
  const R = String.raw;
  ENTRIES.push({
    id: 'higgs', field: 'phy', year: 2013,
    who: [
      { zh: '弗朗索瓦·恩格勒', en: 'François Englert', share: '1/2' },
      { zh: '彼得·W·希格斯', en: 'Peter W. Higgs', share: '1/2' },
    ],
    short: '恩格勒 · 希格斯',
    citation: '表彰他们从理论上发现了一种机制，它有助于我们理解亚原子粒子质量的起源；该机制所预言的基本粒子最近由欧洲核子研究中心（CERN）大型强子对撞机上的 ATLAS 和 CMS 实验发现，从而得到证实。',
    title: 'BEH 机制与希格斯玻色子',
    formula: R`m_W = \tfrac12 g v,\quad m_h = \sqrt{2\lambda}\,v,\quad v \approx 246\ \text{GeV}`,
    one: R`标量场的真空值 $v$ 把规范对称性“藏”起来时，本应出现的无质量戈德斯通模式被规范场吃掉，成为它的第三个（纵向）偏振，规范粒子于是获得质量 $m = gv$；剩下的径向振动是一个有质量的标量粒子，它与其他粒子的耦合由各自的质量决定；2012 年，它在 125 GeV 处被找到。`,
    teaser: '弱力的射程极短，可规范场为什么不许有质量？',
    scenario: R`
<p>1964 年。量子电动力学极其成功，它的光子没有质量，这由规范对称性保证：在拉格朗日量里加一项 $\tfrac12 m^2A_\mu A^\mu$，规范不变性就被破坏了。杨振宁和米尔斯（1954）把规范原理推广到非阿贝尔群，他们的规范粒子同样必须无质量。另一方面，费米理论把弱相互作用写成四个费米子在同一点的接触作用，耦合常数 $G_F\approx 1.17\times10^{-5}\ \text{GeV}^{-2}$ 有量纲，这暗示传递弱力的粒子很重、作用距离极短。</p>
<p>南部阳一郎（1960）把超导理论的思想带进了粒子物理：方程有某种对称性，基态却可以没有。可戈德斯通（1961）发现，这种“自发破缺”总伴随着无质量的自旋 0 粒子；1962 年戈德斯通、萨拉姆和温伯格给出了一般证明。实验上从未见过严格无质量的自旋 0 粒子（π 介子很轻，但有质量）。给规范粒子质量，看起来两条路都走不通。</p>
<p>你的任务：先弄清楚自发破缺到底产生了什么；再看对称性是规范对称性时情况有何不同；最后跳到 2012 年的日内瓦，在对撞机数据里寻找这一理论留下的可检验预言。</p>`,
    stages: 3,
    puzzle: R`
<p>1934 年费米写下 β 衰变理论，相互作用是两条费米子流在同一时空点的乘积，强度 $G_F$ 的量纲是 $\text{能量}^{-2}$。这样的理论在高能下出问题：中微子散射截面按 $\sigma\sim G_F^2E^2$ 增长，在质心能量几百 GeV 处超过分波幺正性的上限，而且它不可重整。自然的出路是让一个重的矢量粒子 $W$ 传递弱力，费米理论只是它的低能极限，$G_F/\sqrt2 = g^2/8m_W^2$。格拉肖（1961）用 $SU(2)\times U(1)$ 把弱力与电磁力放进同一个规范理论，但 $W$、$Z$ 的质量只能手工加入，这破坏了规范不变性，也毁掉了可重整性。</p>
<p>另一条线索来自凝聚态。BCS 理论（1957）的基态不具有电磁规范对称性。南部（1960）与南部–约纳–拉西尼奥（1961）把同样的机制用于核子，得到近似无质量的 π 介子。戈德斯通（1961）在标量场模型中发现了无质量模式，戈德斯通、萨拉姆、温伯格（1962）证明了一般定理：洛伦兹不变的理论中，连续对称性自发破缺必然产生无质量粒子。</p>
<p>安德森（1963）注意到，超导体与等离子体里并没有无质量模式：电磁场与凝聚体的相位模式结合，成为有能隙的等离激元，他猜测“戈德斯通零质量问题”可以和“杨–米尔斯零质量问题”互相抵消。但他的论证是非相对论的。1964 年 3 月 Klein 与 Lee 论证非相对论理论可以绕过定理，6 月 Gilbert 反驳说洛伦兹不变的理论不行。问题在于：在相对论性的规范理论里，戈德斯通定理的哪一条假设失效了？</p>`,
    observation: R`
<p><b>1964 年的三篇论文。</b>布鲁塞尔的恩格勒与布鲁（Brout）最先投稿（6 月 26 日收稿，8 月 31 日发表于 PRL）。他们用费曼图计算规范场的真空极化，发现标量场有真空值时，规范场传播子的极点移到了 $m^2\neq0$；他们还讨论了由费米子对凝聚引起破缺的动力学情形。爱丁堡的希格斯 7 月投给《物理快报》的第一篇短文指出，规范理论中可选的辐射规范不是洛伦兹协变的，这正好绕开了 Gilbert 的论证；8 月 31 日他投给 PRL 的第二篇（10 月 19 日发表）写出了阿贝尔模型的经典场方程：戈德斯通模式变成矢量粒子的纵向分量，并且明确指出会剩下一个有质量的标量粒子。审稿人（后来得知是南部）提醒他注意恩格勒与布鲁刚发表的论文，他在文中补上了引用。在伦敦帝国理工学院合作的古拉尔尼克、哈根与基布尔（11 月 16 日发表）对定理为何失效给出了最仔细的分析。</p>
<p><b>从机制到标准模型。</b>希格斯（1966）给出了模型的完整粒子谱和标量粒子的衰变；基布尔（1967）把机制推广到非阿贝尔群。温伯格（1967）与萨拉姆（1968）把它装进格拉肖的 $SU(2)\times U(1)$，一个复二重态标量场同时给 $W^\pm$、$Z$ 和轻子质量。1971 年特霍夫特（与韦尔特曼）证明这类理论可重整。1973 年 CERN 的 Gargamelle 气泡室发现中性流；1983 年 UA1 与 UA2 发现 $W$ 与 $Z$，质量约 80 GeV 与 91 GeV，与理论预言一致。</p>
<p><b>寻找剩下的那个粒子。</b>希格斯玻色子的质量 $m_h = \sqrt{2\lambda}\,v$ 依赖未知的自耦合 $\lambda$，理论不预言它。LEP 直接搜索排除了 $m_h \lt 114.4$ GeV（95% 置信度，2003 年），LEP 的精密电弱测量通过圈图修正偏好一个较轻的希格斯；费米实验室的 Tevatron 排除了 160 GeV 附近的一段。另一方面，没有希格斯时纵向 $W$ 的散射振幅随能量平方增长，在约 1 TeV 内破坏幺正性，所以大型强子对撞机（LHC，周长 27 km）要么找到它，要么找到别的新物理。</p>
<p><b>2012 年 7 月 4 日。</b>ATLAS 与 CMS 在 CERN 的联合报告会上各自宣布在约 125 GeV 处看到约 5σ 的超出，主要来自质量分辨率最好的两个衰变道：$h\to\gamma\gamma$ 与 $h\to ZZ^*\to4\ell$。数据为 2011 年 7 TeV 与 2012 年 8 TeV 的质子对撞，每个实验约 10 fb⁻¹。同年 9 月发表的论文中，ATLAS 的局域显著性为 5.9σ（γγ 4.5σ，4ℓ 3.6σ，WW 2.8σ），质量 $126.0\pm0.4\,(\text{统计})\pm0.4\,(\text{系统})$ GeV；CMS 为 5.0σ（γγ 4.1σ，ZZ 3.2σ），质量 $125.3\pm0.4\pm0.5$ GeV。2013 年的角分布检验支持自旋–宇称 $0^+$；两实验 Run 1 合并给出 $m_h = 125.09\pm0.24$ GeV（2015）。</p>`,
    idea: R`
<p>关键在于规范对称性不是物理态之间的变换，而是描述上的冗余。标量场 $\Phi = (v+h)e^{i\theta/v}/\sqrt2$ 的相位 $\theta$ 本是戈德斯通模式，可它能被一个规范变换整个消去：它不是独立的物理粒子。它携带的那一个自由度并没有消失，而是成了规范场的纵向偏振。无质量矢量（2 个偏振）加戈德斯通模式（1 个）等于有质量矢量（3 个偏振），两个“零质量问题”恰好互相抵消。</p>
<p>拉格朗日量依然规范不变，质量来自真空而不是显式的质量项，所以理论在高能下保持良好行为，这正是特霍夫特后来能证明可重整性的原因。超导体是同一件事的非相对论版本：库珀对凝聚体的相位被电磁场吃掉，光子在超导体内获得“质量”，表现为磁场只能穿透有限深度（迈斯纳效应）。</p>
<p>机制留下了一个可检验的残余：标量场沿径向的振动，即希格斯玻色子，$m_h^2 = 2\lambda v^2$。它的质量是自由参数，但一旦 $m_h$ 已知，它的产生率和各衰变道的分支比就全部确定，因为它与每种粒子的耦合都由同一个 $v$ 和该粒子的质量决定：与费米子是 $m_f/v$，与 $W$、$Z$ 是 $2m_V^2/v$。同一个二重态还通过汤川耦合给夸克和带电轻子质量：左手与右手费米子的量子数不同，显式质量项不规范不变，而 $\bar L\Phi e_R$ 是规范不变的。</p>
<p>分工：恩格勒与布鲁最先发表，用的是微扰量子场论；希格斯用经典场论，并且明确强调了那个有质量的标量粒子；古拉尔尼克、哈根与基布尔对戈德斯通定理的失效给出了最完整的说明。2010 年六人共享樱井奖。布鲁于 2011 年去世，诺贝尔奖不追授，每项至多三人，2013 年的奖授予了恩格勒与希格斯。希格斯于 2024 年 4 月去世。</p>`,
    math: R`
<p><b>1. 自发破缺与真空流形。</b>设紧李群 $G$ 正交地作用在 $\mathbb R^n$ 上，标量场 $\phi:\mathbb R^{1,3}\to\mathbb R^n$ 的拉格朗日量为 $\mathcal L = \tfrac12\partial_\mu\phi\cdot\partial^\mu\phi - V(\phi)$，$V$ 是 $G$ 不变的。经典真空是 $V$ 的极小点集 $\mathcal M = \{\phi_0: V(\phi_0) = \min V\}$。若 $\mathcal M$ 是单个轨道 $G\cdot\phi_0$，且稳定子群为 $H = \{g: g\phi_0 = \phi_0\}$，则 $\mathcal M\cong G/H$。$H\neq G$ 时称对称性自发破缺：方程有 $G$ 对称性，选定的真空只有 $H$。例：$V = \mu^2|\phi|^2 + \lambda|\phi|^4$（$\lambda\gt 0$）。$\mu^2\gt 0$ 时唯一极小点是 $0$；$\mu^2\lt 0$ 时极小点集是球面 $|\phi|^2 = -\mu^2/2\lambda$，即 $O(n)/O(n-1)\cong S^{n-1}$。</p>
<p><b>2. 经典戈德斯通定理。</b><i>命题。</i>在极小点 $\phi_0$ 处，质量矩阵 $M^2_{ij} = \partial_i\partial_jV(\phi_0)$ 的核包含切空间 $T_{\phi_0}(G\phi_0) = \mathfrak g\cdot\phi_0$，其维数为 $\dim G - \dim H$。所以小振动中至少有 $\dim G - \dim H$ 个无质量模式。</p>
<p><i>证明。</i>对 $X\in\mathfrak g$ 和任意 $\phi$，$V(e^{tX}\phi) = V(\phi)$。对 $t$ 求导得 $\partial_iV(\phi)\,(X\phi)_i = 0$ 对所有 $\phi$ 成立；再对 $\phi_j$ 求导：$\partial_j\partial_iV(\phi)\,(X\phi)_i + \partial_iV(\phi)\,X_{ij} = 0$。在 $\phi_0$ 处一阶导数为零，故 $M^2(X\phi_0) = 0$。线性映射 $X\mapsto X\phi_0$ 的核是 $\mathfrak h = \operatorname{Lie}(H)$，所以像的维数是 $\dim\mathfrak g - \dim\mathfrak h$。∎</p>
<p>对 $O(n)\to O(n-1)$：$\tfrac{n(n-1)}2 - \tfrac{(n-1)(n-2)}2 = n-1$ 个零模，加上一个径向模式。以复标量 $\Phi = (\phi_1 + i\phi_2)/\sqrt2$ 和标准模型的归一化 $V = \mu^2|\Phi|^2 + \lambda|\Phi|^4$ 为例，令 $v^2 = -\mu^2/\lambda$，$\Phi = (v + h + i\chi)/\sqrt2$，展开得</p>
$$V = -\frac{\lambda v^4}{4} + \lambda v^2h^2 + \lambda v h(h^2+\chi^2) + \frac\lambda4(h^2+\chi^2)^2 ,$$
<p>$\chi$ 没有质量项，$m_h^2 = 2\lambda v^2 = -2\mu^2$。量子场论中的戈德斯通定理（Goldstone、Salam、Weinberg 1962）说：若守恒流 $j^\mu$ 的荷 $Q$ 满足 $\langle 0|[Q,\varphi(0)]|0\rangle\neq0$，在洛伦兹协变、局域、态空间正定的理论里，谱中必有一个无质量粒子。证明梗概：对 $\langle0|[j^\mu(x),\varphi(0)]|0\rangle$ 作谱分解，流守恒与协变性迫使谱测度集中在 $p^2 = 0$。</p>
<p><b>3. 规范理论中定理为何失效。</b>规范理论的量子化必须在三条假设中放弃一条。协变规范（Gupta–Bleuler）保留了协变性与局域性，但态空间度规不定，定理给出的无质量态落在非物理的零范数子空间，与物理态退耦；库仑规范的态空间正定，但理论不是显式协变的，谱分解的论证不再成立。这正是希格斯第一篇短文和古拉尔尼克–哈根–基布尔的要点。还应注意：局域规范对称性本身不能自发破缺（Elitzur 1975），$\langle\Phi\rangle\neq0$ 只在固定规范后才有意义；物理上可观测的是规范不变的量，例如 $\Phi^\dagger\Phi$ 的关联函数。“规范对称性破缺”是一种方便而略不严格的说法。</p>
<p><b>4. 阿贝尔希格斯模型。</b>$\mathcal L = -\tfrac14F_{\mu\nu}F^{\mu\nu} + |D_\mu\Phi|^2 - V(\Phi)$，$D_\mu = \partial_\mu - ieA_\mu$，规范变换 $\Phi\to e^{i\alpha}\Phi$，$A_\mu\to A_\mu + e^{-1}\partial_\mu\alpha$。写 $\Phi = \tfrac1{\sqrt2}(v+h)e^{i\theta/v}$，取 $\alpha = -\theta/v$（幺正规范），相位从 $\mathcal L$ 中完全消失：</p>
$$\mathcal L = -\tfrac14F_{\mu\nu}F^{\mu\nu} + \tfrac12e^2(v+h)^2A_\mu A^\mu + \tfrac12\partial_\mu h\,\partial^\mu h - V\Big(\tfrac{v+h}{\sqrt2}\Big).$$
<p>所以 $m_A = ev$，$m_h = \sqrt{2\lambda}\,v$。自由度计数：破缺前 $2$（无质量矢量的两个螺旋度）$+\,2$（复标量）$= 4$；破缺后 $3$（有质量矢量）$+\,1$（$h$）$= 4$。按维格纳的分类，无质量粒子的小群是 $ISO(2)$，自旋 1 只剩螺旋度 $\pm1$；有质量粒子的小群是 $SO(3)$，自旋 1 有 3 个态。对 $k^\mu = (E,0,0,k)$，纵向偏振为 $\epsilon_L^\mu = (k,0,0,E)/m$，高能下 $\epsilon_L^\mu\approx k^\mu/m$。等价定理（Cornwall–Levin–Tiktopoulos 1974，Lee–Quigg–Thacker 1977）：在 $E\gg m$ 时，纵向矢量粒子的振幅等于被吃掉的戈德斯通玻色子的振幅，误差为 $O(m/E)$。</p>
<p><b>5. 超导体：光子的“质量”。</b>金兹堡–朗道自由能 $F = \int\big[\alpha|\psi|^2 + \tfrac\beta2|\psi|^4 + \tfrac1{2m^*}|(-i\hbar\nabla - e^*\mathbf A)\psi|^2 + \tfrac{B^2}{2\mu_0}\big]$ 与第 4 节的结构相同（静态、非相对论）。在 $|\psi|^2 = n_s$ 固定、取伦敦规范时，超流 $\mathbf j = -(e^{*2}n_s/m^*)\mathbf A$，与麦克斯韦方程联立得 $\nabla^2\mathbf B = \mathbf B/\lambda_L^2$，</p>
$$\lambda_L^2 = \frac{m^*}{\mu_0e^{*2}n_s},\qquad m_\gamma c^2 = \frac{\hbar c}{\lambda_L}.$$
<p>磁场在表面以下按 $e^{-x/\lambda_L}$ 衰减（迈斯纳效应）。铅的 $\lambda_L\approx 40$ nm 对应 $m_\gamma c^2\approx 5$ eV；同理，弱力的力程 $\hbar/(m_Wc)\approx 2.5\times10^{-18}$ m。对应关系：$\psi\leftrightarrow\Phi$，库珀对电荷 $e^* = 2e\leftrightarrow$ 场的荷，$\lambda_L^{-1}\leftrightarrow m_A$，金兹堡–朗道相干长度 $\xi^{-1}\leftrightarrow m_h$（量级上），二者之比 $\kappa = \lambda_L/\xi$ 区分 I 型与 II 型超导体。</p>
<p><b>6. 电弱理论。</b>群 $SU(2)_L\times U(1)_Y$，标量场 $\Phi$ 是超荷 $Y = \tfrac12$ 的复二重态，$D_\mu = \partial_\mu - igW^a_\mu\tfrac{\sigma^a}2 - ig'YB_\mu$。取 $\langle\Phi\rangle = (0, v/\sqrt2)^{\mathsf T}$，保持 $Q = T_3 + Y$ 生成的 $U(1)_{\rm em}$ 不变。$|D_\mu\langle\Phi\rangle|^2$ 给出</p>
$$m_W = \tfrac12gv,\qquad m_Z = \tfrac12\sqrt{g^2+g'^2}\,v,\qquad m_\gamma = 0,\qquad \frac{m_W}{m_Z} = \cos\theta_W,\ \ \tan\theta_W = \frac{g'}g,$$
<p>其中 $Z = \cos\theta_WW^3 - \sin\theta_WB$，$A = \sin\theta_WW^3 + \cos\theta_WB$，电荷 $e = g\sin\theta_W$。计数：$\dim G - \dim H = 4 - 1 = 3$ 个戈德斯通模式被 $W^\pm$、$Z$ 吃掉，真空流形 $\{|\Phi|^2 = v^2/2\}\cong S^3$。由 $G_F/\sqrt2 = g^2/8m_W^2$ 得 $v = (\sqrt2G_F)^{-1/2} = 246.2$ GeV。用 $m_W = 80.37$ GeV、$m_Z = 91.19$ GeV 得 $\cos\theta_W = 0.881$，即 $\sin^2\theta_W = 0.223$（在壳定义；$\overline{\rm MS}$ 方案中为 0.231，差别来自圈图修正）。$V$ 只依赖 $\Phi^\dagger\Phi = \tfrac12|\phi|^2$（$\phi\in\mathbb R^4$），所以它其实有更大的 $SO(4)\cong(SU(2)_L\times SU(2)_R)/\mathbb Z_2$ 对称性，真空保留对角的 $SO(3)$（“守护对称性”，只被 $g'$ 与汤川耦合破坏），这解释了树图水平的 $\rho\equiv m_W^2/(m_Z^2\cos^2\theta_W) = 1$。</p>
<p><b>7. 费米子质量与希格斯耦合。</b>左手费米子是 $SU(2)$ 二重态，右手是单态，显式质量项 $m\bar\psi_L\psi_R$ 不规范不变。汤川项 $-y_e\bar L\Phi e_R + \text{h.c.}$ 是不变的，代入真空值给出 $m_e = y_ev/\sqrt2$（上型夸克用 $\tilde\Phi = i\sigma_2\Phi^*$）。于是 $y_t = \sqrt2m_t/v\approx 0.99$，$y_e\approx 2.9\times10^{-6}$：所有费米子质量都“来自”希格斯场，但汤川耦合本身是 13 个左右的自由参数（含混合角），理论不解释它们的大小。把 $v\to v+h$ 代回，希格斯粒子的耦合完全确定：</p>
$$\mathcal L\supset \frac{2m_W^2}{v}hW^+_\mu W^{-\mu} + \frac{m_Z^2}{v}hZ_\mu Z^\mu - \sum_f\frac{m_f}{v}h\bar ff - \frac{m_h^2}{2v}h^3 - \frac{m_h^2}{8v^2}h^4 .$$
<p>与费米子的耦合正比于其质量，与 $W$、$Z$ 的耦合正比于质量的平方，所以 $m_h = 125$ GeV 的希格斯主要衰变为 $b\bar b$（约 58%）、$WW^*$（21%）、$gg$（8%）、$\tau\tau$（6%）；双光子只经由 $W$ 圈与顶夸克圈产生，分支比约 0.23%，总宽度约 4.1 MeV。</p>
<p><b>8. 发现中的统计。</b>在一个质量窗口内，背景期望 $B$、信号期望 $S$，观测到的计数 $n\sim\text{Poisson}(B + \mu S)$。检验 $\mu = 0$ 的单侧 $p$ 值换算为高斯显著性 $Z = \Phi^{-1}(1-p)$；$5\sigma$ 对应 $p = 2.87\times10^{-7}$，$3\sigma$ 对应 $1.35\times10^{-3}$。似然比给出（Cowan 等 2011 的 Asimov 公式）</p>
$$Z = \sqrt{2\big[(S+B)\ln(1+S/B) - S\big]} = \frac S{\sqrt B}\big(1 + O(S/B)\big).$$
<p><i>命题。</i>若有 $k$ 个独立的道（或实验），在 $S_i\ll B_i$ 的高斯极限下，最优合并的显著性为 $Z^2 = \sum_iS_i^2/B_i = \sum_iZ_i^2$。<i>证明梗概。</i>由奈曼–皮尔逊引理，最强检验统计量是对数似然比 $\sum_i[n_i\ln(1+S_i/B_i) - S_i]\approx\sum_iw_in_i + \text{常数}$，$w_i = S_i/B_i$。$\sum_iw_in_i$ 在零假设下均值 $\sum w_iB_i$、方差 $\sum w_i^2B_i$，在信号假设下均值多出 $\sum w_iS_i$，所以 $Z = \sum_iS_i^2/B_i\big/\sqrt{\sum_iS_i^2/B_i}$。∎ 由此 $Z\propto\sqrt{\text{积分亮度}}$。还要考虑“别处效应”：在一个宽质量范围内找峰时，某处出现 $3\sigma$ 涨落的概率远大于 $1.35\times10^{-3}$，所以要区分局域与全局显著性；2012 年 ATLAS 在 110–600 GeV 范围内的全局显著性约 5.1σ。</p>
<p><b>9. 幺正性、自然性与真空能。</b>没有希格斯时，$W_LW_L\to W_LW_L$ 的振幅随 $s/v^2$ 增长，约在 1 TeV 量级破坏幺正性；希格斯交换抵消增长项，剩下 $\sim m_h^2/v^2$，由此 Lee–Quigg–Thacker（1977）得出 $m_h\lesssim(8\pi\sqrt2/3G_F)^{1/2}\approx 1$ TeV。$m_h = 125$ GeV 时 $\lambda = m_h^2/2v^2\approx 0.13$。标量质量对高能物理敏感：顶夸克圈给出 $\delta m_h^2\approx -\tfrac{3y_t^2}{8\pi^2}\Lambda^2$，若新物理能标 $\Lambda$ 很高，需要精细抵消，这就是自然性问题。真空能：$V(0) - V(v) = \lambda v^4/4\approx 1.2\times10^8\ \text{GeV}^4$，观测到的暗能量密度约 $(2.2\ \text{meV})^4\approx 2.3\times10^{-47}\ \text{GeV}^4$，相差约 $5\times10^{54}$ 倍；势能的零点无法由粒子物理确定，这是宇宙学常数问题的一部分。</p>`,
    labNote: R`左图是势能的剖面：把 $\mu^2$ 拖过零，真空从原点移到半径 $v$ 处。再把规范耦合 $e$ 从零调大，看下方粒子谱里的无质量标量消失、矢量粒子获得质量 $m_A = ev$，而自由度总数始终是 4。下方的双光子谱可以改变积分亮度，看 125 GeV 的峰如何随 $\sqrt L$ 从涨落里浮现。`,
    legacy: R`
<ul>
<li>耦合的测量：发现十年后（2022 年《自然》上的两篇综述），ATLAS 与 CMS 已测得希格斯与 $W$、$Z$、顶夸克、底夸克、τ 轻子的耦合，精度约 5%–10%，与“耦合由质量决定”的预言一致（费米子耦合 $\propto m_f$，矢量玻色子耦合 $\propto m_V^2$）；$h\to b\bar b$ 与 $t\bar th$ 产生在 2018 年被观测到，$h\to\mu\mu$ 有约 3σ 的证据（CMS 2020），这是第一次看到希格斯与第二代费米子的耦合。离壳产生的测量给出总宽度 $3.2^{+2.4}_{-1.7}$ MeV（CMS 2022），与理论值 4.1 MeV 相容。</li>
<li>自耦合与势的形状：三线性耦合 $\lambda_{hhh}$ 需要测双希格斯产生，截面不到单希格斯的千分之一；ATLAS 2022 年的合并分析只把它限制在标准模型值的 $-0.4$ 到 $6.3$ 倍之间（95% 置信度，CMS 的结果相近），高亮度 LHC 预计也只能测到约 50% 的精度。势 $V(\Phi)$ 在真空附近的形状，以及电弱相变在早期宇宙中是一阶还是平滑过渡，至今是直接测量的空白。</li>
<li>真空的稳定性：$m_h\approx 125$ GeV 与 $m_t\approx 173$ GeV 使 $\lambda$ 在约 $10^{10}$–$10^{11}$ GeV 处跑到负值（Degrassi 等 2012），按标准模型外推，电弱真空是亚稳的，寿命远长于宇宙年龄。结论对顶夸克质量非常敏感。</li>
<li>自然性问题：LHC 至今没有发现超对称粒子或其他能稳定希格斯质量的新粒子（例如在常用的简化模型中，胶微子质量下限已超过 2 TeV），“为什么 $v\ll M_{\rm Pl}$”仍无答案，这也促使人们认真考虑人择论证与宇宙学弛豫等新思路。</li>
<li>未来对撞机：“希格斯工厂”方案包括 CERN 的 FCC-ee（2025 年完成可行性研究）、中国的 CEPC、日本的 ILC 与 μ 子对撞机等，目标是把主要耦合测到百分之一以下。</li>
<li>凝聚态中的“希格斯模式”：超导体序参量的振幅模式最早在 NbSe₂ 的拉曼谱中看到（Sooryakumar 与 Klein 1980，Littlewood 与 Varma 1981 给出解释），2013–2014 年又在 NbN 中用太赫兹脉冲直接激发；冷原子与量子磁体中也有对应物。</li>
</ul>`,
    myths: [
      '“希格斯场给了宇宙中所有物质质量。”质子和中子的质量约 0.94 GeV，主要来自量子色动力学中夸克与胶子的能量；u、d 夸克的质量只有几 MeV，三个价夸克加起来约占质子质量的 1%。希格斯场给的是基本粒子（W、Z、夸克、带电轻子）的质量。中微子质量的来源仍不清楚。',
      '“希格斯玻色子赋予粒子质量。”质量来自希格斯场的真空期望值 $v\\approx 246$ GeV。希格斯玻色子是这个场在真空附近的振动；找到它，是对机制的检验，而不是质量的来源。',
      '“希格斯机制是希格斯一个人的发现。”1964 年有三组人独立发表（恩格勒与布鲁，希格斯，古拉尔尼克、哈根与基布尔），安德森 1963 年已有非相对论版本。所以文献中常称 BEH 机制，或更长的 ABEGHHK’tH。希格斯的贡献之一是明确指出了那个可检验的标量粒子。',
      '“规范对称性被自发破缺了。”局域规范对称性是描述的冗余，不能自发破缺（Elitzur 1975）。$\\langle\\Phi\\rangle\\neq0$ 只在固定规范之后才有意义。规范不变的说法是：理论处于“希格斯相”，矢量粒子有质量，谱中没有无质量标量。',
      '“‘上帝粒子’是物理学家给它起的名字。”这是莱德曼 1993 年科普书的书名，他在书里说自己本想称它为“该死的粒子”。物理学家几乎不这样叫它。',
    ],
    papers: [
      'F. Englert, R. Brout, “Broken Symmetry and the Mass of Gauge Vector Mesons”, <i>Phys. Rev. Lett.</i> 13, 321 (1964)',
      'P. W. Higgs, “Broken Symmetries, Massless Particles and Gauge Fields”, <i>Phys. Lett.</i> 12, 132 (1964)',
      'P. W. Higgs, “Broken Symmetries and the Masses of Gauge Bosons”, <i>Phys. Rev. Lett.</i> 13, 508 (1964)',
      'G. S. Guralnik, C. R. Hagen, T. W. B. Kibble, “Global Conservation Laws and Massless Particles”, <i>Phys. Rev. Lett.</i> 13, 585 (1964)',
      'P. W. Anderson, “Plasmons, Gauge Invariance, and Mass”, <i>Phys. Rev.</i> 130, 439 (1963)',
      'J. Goldstone, A. Salam, S. Weinberg, “Broken Symmetries”, <i>Phys. Rev.</i> 127, 965 (1962)',
      'S. Weinberg, “A Model of Leptons”, <i>Phys. Rev. Lett.</i> 19, 1264 (1967)',
      'ATLAS Collaboration, “Observation of a New Particle in the Search for the Standard Model Higgs Boson with the ATLAS Detector at the LHC”, <i>Phys. Lett. B</i> 716, 1 (2012)',
      'CMS Collaboration, “Observation of a New Boson at a Mass of 125 GeV with the CMS Experiment at the LHC”, <i>Phys. Lett. B</i> 716, 30 (2012)',
    ],
    links: [
      { to: 'bcs', label: '超导体里光子获得质量：安德森的启发' },
      { to: 'schrodinger', label: '狄拉克质量项连接左右手费米子，汤川耦合由此给出质量' },
    ],
  });
})();
