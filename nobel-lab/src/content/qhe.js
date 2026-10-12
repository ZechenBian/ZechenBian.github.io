/* content/qhe.js — 1985 年诺贝尔物理学奖：量子化霍尔效应（冯·克利青） */
(() => {
  const R = String.raw;
  ENTRIES.push({
    id: 'qhe', field: 'phy', year: 1985,
    who: [{ zh: '克劳斯·冯·克利青', en: 'Klaus von Klitzing', share: '全奖' }],
    short: '冯·克利青',
    citation: '表彰他发现了量子化霍尔效应。',
    title: R`量子化霍尔效应：$R_{xy} = h/(ie^2)$`,
    formula: R`R_{xy} = \frac{h}{i\,e^{2}},\quad R_{xx} = 0\quad (i = 1, 2, 3, \dots)`,
    one: R`低温强磁场下的二维电子气中，霍尔电阻出现一串平台，数值精确等于 $h/(ie^2)$（$i$ 为整数），同时纵向电阻降为零；平台的值与材料、尺寸和杂质都无关。后来的理论表明，这个整数是拓扑不变量：被占据态在布里渊环面上构成的矢量丛的陈数。`,
    teaser: '把二维电子放进 18 特斯拉的磁场，霍尔电压会怎样？',
    scenario: R`
<p>1980 年初。霍尔效应已经有一百年历史：电流流过导体，加上垂直的磁场，横向会出现电压 $V_H$，测它就能数出载流子。半导体工业的 MOS 场效应管（MOSFET）提供了一种新样品：正的栅压把电子吸到硅与二氧化硅的界面，形成一层几纳米厚、垂直方向运动被量子化的<b>二维电子气</b>，电子数可以用栅压连续调节。1966 年 IBM 的 Fowler 等人用磁阻振荡证实了它的二维性；理论家（Ando 等，1974–75）已经在计算强磁场下这种二维电子的输运。</p>
<p>你是维尔茨堡大学的冯·克利青，36 岁，在格勒诺布尔强磁场实验室（马普固体研究所与法国国家科研中心合办）做实验。你有 Dorda（西门子）和 Pepper（剑桥卡文迪什实验室，样品出自 Plessey 公司）提供的高迁移率硅 MOSFET 霍尔条，磁体能开到近 20 T，样品浸在减压到 1.5 K 的液氦里。</p>
<p>你的任务：先用经典霍尔效应数出界面上的电子；再在强磁场下扫描栅压，同时记录霍尔电阻和纵向电阻；最后弄清你看到的东西为什么出现在那里。</p>`,
    stages: 3,
    puzzle: R`
<p>霍尔（E. H. Hall）1879 年在约翰斯·霍普金斯大学发现了以他命名的效应。德鲁德模型给出 $R_{xy} = B/(ne)$：霍尔电阻随磁场线性增长，斜率只由载流子密度决定，从此成为半导体表征的标准工具。</p>
<p>二维电子气在 1960 年代成为现实。Schrieffer（1957）讨论过表面反型层中的输运；Fowler、Fang、Howard 与 Stiles（IBM，1966）在硅 MOSFET 中看到只依赖垂直磁场分量的舒布尼科夫–德哈斯振荡，证明电子只在界面平面内运动。朗道（1930）已经算出磁场中电子的动能量子化为朗道能级；在二维情形，每个能级是高度简并的分立能级，态密度只剩下一串被杂质展宽的峰。</p>
<p>Ando、Matsumoto 与 Uemura（1975）在自洽玻恩近似下计算了二维电子的霍尔电导，发现费米能处在能级之间的某些特殊点时它等于 $e^2/h$ 的整数倍。日本的 Kawaji 小组和冯·克利青本人（Englert 与 von Klitzing 1978）的数据里都已出现过霍尔电压的台阶状结构，但没有人评估过它的精度。而真实样品里，杂质会造成不导电的<b>局域态</b>。局域态会怎样影响霍尔电导当时并不清楚，一个自然的猜想是局域电子不载流，霍尔电导应小于理想值。精确量子化既没有被预期，也没有被注意到。</p>`,
    observation: R`
<p><b>格勒诺布尔，1980 年 2 月 4–5 日夜。</b>冯·克利青在 $B = 18$ T、$T = 1.5$ K、电流 $I = 1\ \mu\mathrm{A}$ 下扫描栅压，同时测霍尔电压 $U_H$ 和沿电流方向的电压 $U_{pp}$。在 $U_{pp}$ 降到零的栅压区间，$U_H$ 完全平直。最低朗道能级的 4 个子能级（2 个自旋 × 2 个能谷）填满时，平台高度是 $U_H \approx 6.453$ mV，即 $R_{xy} \approx 6453\ \Omega$。据他后来回忆，那是夜里两点左右；他意识到这个数等于 $h/(4e^2)$，实验记录本上（日期记为 1980 年 2 月 4 日）写下了霍尔电压与 $(h/e^2)\cdot I$ 的关系。</p>
<p><b>精度与普适性。</b>论文（与 Dorda、Pepper 合作，1980 年 5 月 30 日投稿）报告：不同样品的平均值为 $i = 4$ 平台 $6453.22 \pm 0.10\ \Omega$，$i = 8$ 平台 $3226.62\pm0.10\ \Omega$，$i = 2$ 平台 $12\,906.5\pm1.0\ \Omega$；更精细的一次测量给出 $h/4e^2 = 6453.17\pm0.02\ \Omega$，与当时推荐值 $6453.204\pm0.005\ \Omega$ 相差约 5 ppm。样品的长宽比从 25 到 0.65，氧化层厚度从 100 到 400 nm，平台值都相同。由此得到精细结构常数 $\alpha^{-1} = 137.0353(4)$，论文标题即“基于量子化霍尔电阻高精度测定精细结构常数的新方法”。</p>
<p><b>零电阻。</b>平台上纵向电压消失：电流流动而不耗散。同一时刻，纵向电导 $\sigma_{xx}$ 也为零（见“推导”第 1 节），所以这既不是超导，也不是普通的绝缘体。</p>
<p><b>后来的检验。</b>1981 年 Tsui 与 Gossard 在 GaAs/AlGaAs 异质结中测到同样的平台值；各国计量实验室在不同材料之间比较量子化电阻，一致性达到 $10^{-10}$ 量级。2012 年 Janssen 等人比较了石墨烯与 GaAs 的平台，在 $8.7\times10^{-11}$ 的相对不确定度内没有差别。</p>`,
    idea: R`
<p>平台上的霍尔电阻不是材料参数，而是自然常数 $h/e^2$ 除以一个整数。电阻通常依赖样品的一切细节：杂质、形状、温度；这里一个宏观、无序、温度有限的固体给出的数却精确到十亿分之一以下。这说明它由某种不随连续形变而改变的东西决定。</p>
<p>理论随后给出三种互相印证的解释。Laughlin（1981）的规范论证：把样品弯成圆环，穿过环心的磁通每增加一个磁通量子 $h/e$，哈密顿量规范等价于原来的，费米能处于迁移率能隙时，唯一可能的变化是整数个电子从一边被搬到另一边，于是 $\sigma_{xy} = ie^2/h$。Thouless、Kohmoto、Nightingale 与 den Nijs（TKNN，1982）用久保公式证明，周期势中的霍尔电导等于 $e^2/h$ 乘以一个整数；B. Simon 以及 Avron、Seiler 与 Simon（1983）随即指出，这个整数是被占据能带在布里渊环面上的陈数，一个拓扑不变量。Halperin（1982）指出电流由样品边缘的手征通道承载，每个通道贡献恰好 $e^2/h$，这是“体–边对应”的第一个例子。</p>
<p>杂质的角色因此反转：它们产生的局域态把费米能“钉”在能隙里，使整数在一段有限的磁场或密度范围内保持不变，平台才有宽度；而局域态不感受穿过圆环的磁通，所以不改变平台的值。一个完全干净的二维电子气反而没有平台（第 3 节）。这是凝聚态物理中第一次清楚地看到：可观测量可以由拓扑不变量决定。</p>`,
    math: R`
<p><b>1. 电阻率张量与经典霍尔效应。</b>电荷 $-e$、有效质量 $m^*$ 的电子在电场 $\mathbf E$ 与磁场 $B\hat z$ 中，德鲁德方程 $m^*\dot{\mathbf v} = -e(\mathbf E + \mathbf v\times\mathbf B) - m^*\mathbf v/\tau$，电流 $\mathbf j = -ne\mathbf v$。稳态时 $\mathbf E = \rho\,\mathbf j$，</p>
$$\rho = \begin{pmatrix}\rho_{xx} & \rho_{xy}\\ -\rho_{xy} & \rho_{xx}\end{pmatrix},\qquad \rho_{xx} = \frac{1}{ne\mu},\quad \rho_{xy} = \frac{B}{ne},\quad \mu = \frac{e\tau}{m^*} .$$
<p>$\rho_{xy}$ 与散射时间无关。对二维导体（$n$ 是面密度），在宽 $W$、电压探针间距 $L$ 的霍尔条中 $R_{xy} = V_H/I = E_yW/(j_xW) = \rho_{xy}$，与几何无关；$R_{xx} = \rho_{xx}L/W$。电导张量 $\sigma = \rho^{-1}$ 给出</p>
$$\sigma_{xx} = \frac{\rho_{xx}}{\rho_{xx}^2 + \rho_{xy}^2},\qquad \sigma_{xy} = \frac{-\rho_{xy}}{\rho_{xx}^2 + \rho_{xy}^2} .$$
<p>所以当 $\rho_{xy}\ne 0$ 时，$\rho_{xx} = 0 \iff \sigma_{xx} = 0$：平台上纵向电阻和纵向电导同时为零，电流垂直于电场流动，$\mathbf j\cdot\mathbf E = 0$，没有耗散。以下只写 $\sigma_{xy}$ 的大小，符号约定从略。</p>
<p><b>2. 朗道能级与简并度。</b>取朗道规范 $\mathbf A = (0, Bx, 0)$，$H = \big[p_x^2 + (p_y + eBx)^2\big]/2m^*$。令 $\psi = e^{iky}\varphi(x)$，得一维谐振子</p>
$$H_k = \frac{p_x^2}{2m^*} + \frac12 m^*\omega_c^2\,(x - X_k)^2,\qquad \omega_c = \frac{eB}{m^*},\quad X_k = -k\ell_B^2,\quad \ell_B = \sqrt{\hbar/eB},$$
<p>能量 $E_N = \hbar\omega_c(N+\tfrac12)$ 与 $k$ 无关。</p>
<p><i>命题。</i>面积为 $A$ 的样品中，每个朗道能级（固定自旋）有 $N_\Phi = eBA/h = \Phi/\Phi_0$ 个态，$\Phi_0 = h/e$ 是磁通量子。等价地，每单位面积的简并度为 $eB/h = 1/(2\pi\ell_B^2)$，与 $m^*$ 无关。</p>
<p><i>证明梗概。</i>在 $L_x\times L_y$ 的矩形上取 $y$ 方向周期边界，$k = 2\pi j/L_y$，$j\in\mathbb Z$。轨道中心 $X_k$ 须落在 $[0, L_x]$ 内，相邻中心间距 $2\pi\ell_B^2/L_y$，故态数为 $L_xL_y/(2\pi\ell_B^2) = eBA/h$。另一种看法：零场时二维态密度（固定自旋）为常数 $g_0 = m^*/2\pi\hbar^2$，磁场把每段宽 $\hbar\omega_c$ 的能量区间里的态并入一个能级，$g_0\hbar\omega_c = eB/h$。∎</p>
<p><i>注。</i>在亏格 $g$ 的闭黎曼面上加常磁场，由 Weitzenböck 公式 $\nabla_A^*\nabla_A = 2\bar\partial_A^*\bar\partial_A + B$（适当单位），最低朗道能级就是 $\ker\bar\partial_A = H^0(\Sigma, L)$，$L$ 是 $\deg L = N_\Phi$ 的全纯线丛。由黎曼–罗赫定理，$N_\Phi \gt 2g-2$ 时其维数为 $N_\Phi + 1 - g$；环面上恰为 $N_\Phi$。</p>
<p>数值：$e/h = 2.418\times10^{14}\ \mathrm{m^{-2}T^{-1}}$；$\ell_B = 25.66\ \mathrm{nm}/\sqrt{B/\mathrm T}$，18 T 时 6.05 nm。硅反型层 $m^* \approx 0.19\,m_e$，18 T 时 $\hbar\omega_c \approx 11.0$ meV，远大于 1.5 K 的 $k_BT = 0.13$ meV。Si(100) 中每个朗道能级还按自旋（$g\mu_BB \approx 2.1$ meV，交换作用会将其增强）和两个能谷（分裂更小，依赖样品）分成 4 个子能级。</p>
<p><b>3. 填充因子；干净系统没有平台。</b>定义 $\nu = n/(eB/h) = nh/(eB)$，即被占据的子能级数。$\nu = i$ 时 $\rho_{xy} = B/(ne) = h/(ie^2)$：经典直线恰好在这些点穿过平台值。</p>
<p><i>命题（伽利略不变性）。</i>若系统具有连续平移不变性（无杂质、无周期势，相互作用任意），则对一切 $B$，$\rho_{xy} = B/(ne)$，$\rho_{xx} = 0$。</p>
<p><i>证明。</i>换到以漂移速度 $\mathbf v_d = \mathbf E\times\mathbf B/B^2$ 运动的参考系，电场被消去，平衡态无电流。变回原参考系，整个电子流体以 $\mathbf v_d$ 运动，$\mathbf j = -ne\mathbf v_d$，$|\mathbf j| = neE/B$ 且 $\mathbf j\perp\mathbf E$。∎</p>
<p>所以平台的存在<b>需要</b>破坏平移不变性的无序。Středa 公式说明平台的值从哪里来：费米能处于（迁移率）能隙时，</p>
$$\sigma_{xy} = e\left.\frac{\partial n}{\partial B}\right|_{\mu}.$$
<p><i>证明梗概。</i>在一块圆盘内缓慢增加 $B$，法拉第定律给出环向电场 $\oint\mathbf E\cdot d\mathbf l = -\dot\Phi$。$\sigma_{xx} = 0$ 时唯一的电流是沿径向的霍尔电流，流入圆盘的电荷速率 $\dot Q = \sigma_{xy}\dot\Phi$，即 $\sigma_{xy} = \partial Q/\partial\Phi = e\,\partial n/\partial B$。∎ 填满 $i$ 个子能级时 $n = ieB/h$，于是 $\sigma_{xy} = ie^2/h$。</p>
<p><b>4. Laughlin 的规范论证（1981）。</b>把二维电子气做成圆环（或圆柱面），穿过环孔的磁通为 $\Phi$，环上总电流为 $I$。设费米能处在迁移率能隙中（费米能附近只有局域态）。</p>
<ol>
<li>规范不变性：$\Phi\to\Phi + \Phi_0$ 时，单值的规范变换 $\psi\mapsto e^{i\theta}\psi$（$\theta$ 为环向角）把 $H(\Phi+\Phi_0)$ 变回 $H(\Phi)$，谱以 $\Phi_0$ 为周期。</li>
<li>局域态不环绕孔，只获得一个规范相位，不受影响。扩展态则谱流：在朗道规范图像中，每个被填满的扩展能级的轨道中心整体移动一格，净效果是把一个电子从内边缘搬到外边缘。</li>
<li>绝热定理加能隙：一个周期后系统回到基态，至多相差整数 $i$ 个电子从一边转移到另一边，能量变化 $\Delta E = ieV_H$。</li>
<li>由 $I = \partial E/\partial\Phi$（哈密顿量对矢势的导数就是电流），一个周期内的平均电流 $I = \Delta E/\Phi_0 = ie^2V_H/h$。</li>
</ol>
<p>于是 $\sigma_{xy} = ie^2/h$。论证只用到规范不变性和能隙，不涉及杂质的任何细节。用数学语言说，$i$ 是算子族 $H(\Phi)$，$\Phi\in[0,\Phi_0]$ 的谱流；Avron、Seiler 与 Simon（1994）把它写成一对投影的指标 $i = \operatorname{ind}(P, UPU^*)$。</p>
<p><b>5. 久保公式与 TKNN：霍尔电导是陈数。</b>在周期势中，若每个原胞的磁通为 $(p/q)\Phi_0$，磁平移群在 $q$ 倍原胞上交换，布洛赫定理成立，准动量 $\mathbf k$ 取值于磁布里渊区，一个二维环面 $T^2$。记周期部分 $u_{n\mathbf k}$，布洛赫哈密顿量 $H(\mathbf k)$，速度 $v_j = \hbar^{-1}\partial_{k_j}H$。零温久保公式为</p>
$$\sigma_{xy} = \frac{ie^2\hbar}{A}\sum_{\mathbf k}\sum_{E_n\lt E_F\lt E_m}\frac{\langle n|v_x|m\rangle\langle m|v_y|n\rangle - \langle n|v_y|m\rangle\langle m|v_x|n\rangle}{(E_n - E_m)^2}.$$
<p>利用 $\langle m|\partial_{k_j}H|n\rangle = (E_n - E_m)\langle m|\partial_{k_j}u_n\rangle$（$m\ne n$），能量分母被消去；被占据带之间的项两两抵消，可以对 $m$ 用完备性求和，得到</p>
$$\sigma_{xy} = \frac{e^2}{\hbar}\sum_{n\ \text{占据}}\int_{T^2}\frac{d^2k}{(2\pi)^2}\,\Omega_n(\mathbf k) = \frac{e^2}{h}\sum_n C_n,\qquad \Omega_n = \partial_{k_x}\mathcal A_y - \partial_{k_y}\mathcal A_x,\quad \mathcal A_j = i\langle u_n|\partial_{k_j}u_n\rangle .$$
<p><i>定理（TKNN 1982；Avron、Seiler 与 Simon 1983）。</i>设 $E_F$ 位于谱隙中，$P(\mathbf k)$ 是到被占据能带的谱投影，则它在 $T^2$ 上光滑，其像构成一个复矢量丛 $\mathcal E\to T^2$，且</p>
$$\sigma_{xy} = \frac{e^2}{h}\,c_1(\mathcal E),\qquad c_1(\mathcal E) = \frac{i}{2\pi}\int_{T^2}\operatorname{tr}\big(P\,[\partial_{k_1}P, \partial_{k_2}P]\big)\,d^2k\ \in\ \mathbb Z .$$
<p><i>证明梗概。</i>上面的计算把久保公式化成贝里曲率的积分；对单带，$\operatorname{tr}(P[\partial_1P,\partial_2P]) = \langle\partial_1u|\partial_2u\rangle - \langle\partial_2u|\partial_1u\rangle = -i\Omega$。整数性：$\Omega = d\mathcal A$ 只在局部成立。若丛非平凡，就没有全局光滑的规范。把 $T^2$ 分成圆盘 $D$ 与其补集，两边各取光滑截面 $u_D$ 与 $u'$，在 $\partial D$ 上 $u' = e^{i\chi}u_D$，于是 $\mathcal A' = \mathcal A - d\chi$。由斯托克斯公式，$\int_{T^2}\Omega = \oint_{\partial D}(\mathcal A - \mathcal A') = \oint_{\partial D}d\chi \in 2\pi\mathbb Z$，即 $C$ 是转移函数 $e^{i\chi}:\partial D\cong S^1\to U(1)$ 的映射度（绕数）。∎ 多带情形用 $\det$ 代替相位。</p>
<p>例：每个朗道能级的陈数为 1（与第 3 节的 $\partial n/\partial B = e/h$ 一致）。TKNN 还发现，对 Hofstadter 模型（每格磁通 $p/q$），费米能处于第 $r$ 个能隙时霍尔整数 $t_r$ 满足丢番图方程 $r = qs_r + pt_r$，$|t_r|\le q/2$。</p>
<p><b>6. 体–边对应。</b>真实样品有边界。约束势 $V(x)$ 在边缘把朗道能级抬高，每个被填满的能级在每条边与费米能相交一次，形成一条一维<b>手征</b>通道，群速度 $v = (eB)^{-1}dV/dx$，即边缘处的 $\mathbf E\times\mathbf B$ 漂移，两条边方向相反。一条通道内态密度 $1/(2\pi\hbar v)$ 与速度相乘为 $1/h$，所以两边化学势差 $\Delta\mu = eV$ 时电流 $I = (e/h)\,\Delta\mu$，电导 $e^2/h$。反向传播的态在另一条边上，相隔 $W\gg\ell_B$，杂质无法背散射，于是（Büttiker 1988）$R_{xy} = h/(ie^2)$ 且 $R_{xx} = 0$。</p>
<p><i>体–边对应（Hatsugai 1993）。</i>穿过一个体能隙的手征边缘模（按方向计符号）的数目，等于该能隙以下所有能带陈数之和。Kellendonk、Richter 与 Schulz-Baldes（2002）用 K 理论中 Toeplitz 扩张的指标映射证明了无序情形下 $\sigma_{\text{体}} = \sigma_{\text{边}}$。</p>
<p><b>7. 无序与严格结果。</b>强磁场下的二维无序系统中，几乎所有态都是局域的，每个朗道带只在一个临界能量 $E_c$ 处存在扩展态，局域长度 $\xi\propto|E - E_c|^{-\nu_{\rm loc}}$，数值上 $\nu_{\rm loc}\approx 2.6$。费米能在两个 $E_c$ 之间移动时，陈数不能改变，这就是平台。Bellissard、van Elst 与 Schulz-Baldes（1994）在非交换几何框架中证明：若费米能处于动力学局域区，$\sigma_{xy} = (e^2/h)\operatorname{Ch}(P_F)$，其中 $\operatorname{Ch}(P) = 2\pi i\,\mathcal T\big(P[\partial_1P,\partial_2P]\big)$（$\mathcal T$ 为单位面积的迹，$\partial_j = i[x_j,\cdot\,]$），由 Connes 的指标定理它等于 Fredholm 算子 $PUP$ 的指标，$U = (x+iy)/|x+iy|$，是整数。对有相互作用的有能隙系统，Hastings 与 Michalakis（2015）证明了环面上的量子化，修正随系统尺寸超多项式地衰减。</p>
<p><b>8. 计量学。</b>由 $\alpha = e^2/(4\pi\varepsilon_0\hbar c)$ 得 $R_K \equiv h/e^2 = \mu_0c/(2\alpha)$。1980 年的测量因此给出 $\alpha^{-1} = 137.0353(4)$。1990 年 1 月 1 日起，国际上采用约定值 $R_{K\text{-}90} = 25\,812.807\ \Omega$ 作为电阻标准。2019 年 5 月 20 日国际单位制重新定义，$h = 6.626\,070\,15\times10^{-34}$ J s 与 $e = 1.602\,176\,634\times10^{-19}$ C 成为定义值：</p>
$$R_K = \frac{h}{e^2} = 25\,812.807\,45\ldots\ \Omega\quad(\text{精确}),\qquad \frac{R_K}{R_{K\text{-}90}} - 1 \approx 1.78\times10^{-8} .$$
<p>此后 $\mu_0$ 反而成了需要通过 $\alpha$ 测定的量。与约瑟夫森常数 $K_J = 2e/h$ 结合，$K_J^2R_K = 4/h$：基布尔秤用这两种量子电学标准把机械功率与电功率比较，把千克联系到 $h$ 上。</p>
<p><b>9. 分数量子霍尔效应。</b>Tsui、Störmer 与 Gossard（1982）在更干净的 GaAs 样品中发现 $\nu = 1/3$ 处的平台，$R_{xy} = 3h/e^2$。此时最低朗道能级只填了三分之一，单粒子图像没有能隙，能隙来自电子间的库仑排斥。Laughlin（1983）给出试探波函数（$z = x+iy$）</p>
$$\Psi_m = \prod_{i\lt j}(z_i - z_j)^m\,\exp\Big(-\sum_k\frac{|z_k|^2}{4\ell_B^2}\Big),\qquad \nu = \frac1m,\ m\ \text{奇数},$$
<p>其准粒子激发带电荷 $e/m$：在某一点绝热插入一个磁通量子，按第 4 节的论证，被推开的电荷是 $\nu e$。这类态在环面上有 $m$ 重简并的基态，是“拓扑序”的第一个例子；Niu、Thouless 与 Wu（1985）把陈数推广到多体基态，对 $q$ 重简并基态得到 $\sigma_{xy} = (C/q)\,e^2/h$。1998 年诺贝尔物理学奖授予 Laughlin、Störmer 与 Tsui。</p>`,
    labNote: R`拖动光标停在一个平台上：$R_{xy}$ 锁定在 $h/(ie^2)$，$\rho_{xx}$ 为零，下方的能级图里费米能落在两组扩展态之间的局域态中。再升高温度，或把局域态比例调到 0，平台随之消失；换成 Si 样品看 4 重简并的子能级。`,
    legacy: R`
<ul>
<li>电阻标准：1990 年起各国用量子化霍尔电阻作为电阻基准，取约定值 $R_{K\text{-}90}$；2019 年国际单位制以 $h$ 与 $e$ 的定义值重建，量子霍尔电阻和约瑟夫森电压一起成为电学单位的直接实现，基布尔秤借此把千克联系到 $h$。石墨烯器件可在更高温度、更低磁场下工作，正在成为新一代标准。</li>
<li>分数量子霍尔效应（1982）与 Laughlin 的解释带来 1998 年诺贝尔物理学奖；分数电荷 1997 年由散粒噪声测得，任意子的交换统计 2020 年在碰撞实验和干涉仪中得到直接证据。$\nu = 5/2$ 态可能承载非阿贝尔任意子（Moore 与 Read 1991），是拓扑量子计算的候选。</li>
<li>拓扑物态：TKNN 的陈数开启了用拓扑不变量分类物态的方向。Haldane（1988）构造了不需要净磁场的陈绝缘体模型；2005–2007 年发现量子自旋霍尔效应与拓扑绝缘体；2013 年在磁性拓扑绝缘体薄膜中观测到零磁场下的量子反常霍尔效应。见 2016 年诺贝尔物理学奖。</li>
<li>石墨烯中的“半整数”量子霍尔效应（2005），$\sigma_{xy} = 4(N+\tfrac12)e^2/h$，以及室温下的量子霍尔平台（2007），是 2010 年石墨烯诺贝尔奖工作的重要证据。</li>
<li>2023–2024 年，在扭转双层 MoTe₂ 和多层石墨烯中观测到零磁场下的分数量子反常霍尔效应。</li>
<li>数学物理：霍尔电导成为非交换几何（Bellissard）、指标理论、K 理论在物理中的典型应用，也是凝聚态中拓扑场论（陈–西蒙斯理论）的出发点。</li>
</ul>`,
    myths: [
      '“量子化这么精确，是因为样品非常纯净。”恰恰相反，平台的存在需要无序。完全平移不变的二维电子气满足伽利略不变性，霍尔电阻严格等于 B/(ne)，是一条直线。杂质产生的局域态把费米能钉在能隙里，平台才有宽度；高迁移率决定的是能隙够不够清楚，而不是量子化本身。',
      '“纵向电阻为零，说明电子气变成了超导体。”平台上纵向电导也为零：在强磁场中 ρ_xx = σ_xx/(σ_xx² + σ_xy²)，两者同时为零。电流垂直于电场流动，所以不耗散；体内其实是绝缘的，电流沿边缘的手征通道流动。这与超导的机制完全不同。',
      '“冯·克利青是第一个看到霍尔平台的人。”更早的数据（日本 Kawaji 小组；Englert 与 von Klitzing 1978）中已出现台阶状结构，Ando 等的理论也在特殊点给出过 e²/h 的整数倍。他的发现是：平台值以极高精度等于 h/(ie²)，与样品的一切细节无关，因此可以用来测定基本常数和定义电阻单位。',
    ],
    papers: [
      'K. v. Klitzing, G. Dorda, M. Pepper, “New Method for High-Accuracy Determination of the Fine-Structure Constant Based on Quantized Hall Resistance”, <i>Phys. Rev. Lett.</i> 45, 494 (1980)',
      'R. B. Laughlin, “Quantized Hall conductivity in two dimensions”, <i>Phys. Rev. B</i> 23, 5632 (1981)',
      'D. J. Thouless, M. Kohmoto, M. P. Nightingale, M. den Nijs, “Quantized Hall Conductance in a Two-Dimensional Periodic Potential”, <i>Phys. Rev. Lett.</i> 49, 405 (1982)',
      'B. I. Halperin, “Quantized Hall conductance, current-carrying edge states, and the existence of extended states in a two-dimensional disordered potential”, <i>Phys. Rev. B</i> 25, 2185 (1982)',
      'D. C. Tsui, H. L. Störmer, A. C. Gossard, “Two-Dimensional Magnetotransport in the Extreme Quantum Limit”, <i>Phys. Rev. Lett.</i> 48, 1559 (1982)',
      'J. Bellissard, A. van Elst, H. Schulz-Baldes, “The noncommutative geometry of the quantum Hall effect”, <i>J. Math. Phys.</i> 35, 5373 (1994)',
    ],
    links: [
      { to: 'topo', label: '霍尔电导 = 陈数：TKNN 不变量开启拓扑物态' },
      { to: 'transistor', label: '半导体器件中的二维电子气（MOSFET）' },
      { to: 'planck', label: 'h/e² 成为电阻标准，2019 年 SI 以 h 定义千克' },
    ],
  });
})();
