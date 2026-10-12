/* content/darkenergy.js — 2011 年诺贝尔物理学奖：宇宙加速膨胀（珀尔马特；施密特与里斯） */
(() => {
  const R = String.raw;
  ENTRIES.push({
    id: 'darkenergy', field: 'phy', year: 2011,
    who: [
      { zh: '索尔·珀尔马特', en: 'Saul Perlmutter', share: '1/2' },
      { zh: '布莱恩·P·施密特', en: 'Brian P. Schmidt', share: '1/4' },
      { zh: '亚当·G·里斯', en: 'Adam G. Riess', share: '1/4' },
    ],
    short: '珀尔马特 · 施密特 · 里斯',
    citation: '表彰他们通过观测遥远的超新星发现宇宙在加速膨胀。（奖金一半授予珀尔马特，另一半由施密特与里斯共享。）',
    title: '宇宙的加速膨胀',
    formula: R`q_0 = \tfrac12\Omega_m - \Omega_\Lambda \lt 0`,
    one: R`经过光变曲线校准的 Ia 型超新星表明，远处的超新星比任何只含物质的宇宙所预言的都要暗。今天的宇宙膨胀在加速，$q_0 = \Omega_m/2 - \Omega_\Lambda \approx -0.6$；宇宙约七成的能量是一种压强为负、几乎不随膨胀稀释的成分。`,
    teaser: '引力应该让宇宙膨胀越来越慢，慢了多少？',
    scenario: R`
<p>1990 年代。宇宙在膨胀已经是常识，哈勃常数 $H_0$ 描述它今天有多快。宇宙学家要找的“第二个数”是<b>减速参数</b> $q_0$：宇宙里的物质互相吸引，膨胀应当越来越慢，$q_0$ 告诉我们慢得有多快，也就决定了宇宙的密度、几何和最终命运。桑德奇 1970 年把整个观测宇宙学概括为“寻找两个数”。</p>
<p>测 $q_0$ 需要看几十亿光年外的东西，并且知道它本来有多亮。星系不行，它们自身在演化。Ia 型超新星峰值时和整个星系一样亮，但一个星系大约几百年才出一颗，出现时间无法预知，亮度也只维持几周，还会被尘埃遮暗。你有 4 米级望远镜上的大视场 CCD 相机、凯克 10 米望远镜的光谱仪，以及偶尔申请得到的哈勃空间望远镜时间。</p>
<p>你的任务：先把超新星变成可靠的“标准烛光”；再用一批高红移超新星画出哈勃图，与弗里德曼宇宙的预言比较；最后读出 $q_0$。</p>`,
    stages: 3,
    puzzle: R`
<p>1917 年，爱因斯坦在场方程中加入宇宙学常数 $\Lambda$，以得到一个静态的宇宙。弗里德曼（1922）和勒梅特（1927）找到了膨胀的解；哈勃 1929 年发表星系的速度–距离关系后，爱因斯坦放弃了 $\Lambda$。此后六十年，大多数理论家默认 $\Lambda = 0$，宇宙只受物质引力控制，$q_0 = \Omega_m/2 \gt 0$。</p>
<p>到 1990 年代，这幅图景有几处不协调：暴胀理论（1980 年代）预言空间平直，$\Omega_{\text{总}} = 1$；但星系团的动力学只找到 $\Omega_m \approx 0.2$–0.3。若 $\Omega_m = 1$ 且 $H_0 \approx 65$–70 km/s/Mpc，宇宙年龄只有 $2/(3H_0) \approx 9.3$–10 Gyr，比当时对最老球状星团年龄的估计（1990 年代中期约 13–16 Gyr）还年轻。已有人提出 $\Lambda$ 可能需要回来（如 Krauss 与 Turner 1995，Ostriker 与 Steinhardt 1995），但证据都是间接的。</p>
<p>直接的检验是测出 $d_L(z)$ 到 $z\sim 1$：不同的 $(\Omega_m,\Omega_\Lambda)$ 在 $z\approx 0.5$ 处只差 0.1–0.4 星等。这要求一种误差在 0.2 星等以内、能在高红移成批找到的烛光。1989 年丹麦小组两年里只找到一颗 $z = 0.31$ 的超新星（SN 1988U），说明这件事有多难。</p>`,
    observation: R`
<p><b>把烛光标准化。</b>Pskovskii（1977）曾注意到衰减快的超新星偏暗。Phillips（1993）用 9 颗精确测量的近邻 Ia 型超新星给出定量关系：峰后 15 天 B 波段的下降量 $\Delta m_{15}(B)$ 越小（光变曲线越宽），峰值越亮。Calán/Tololo 巡天（Hamuy 等 1996）用其中 26 颗消光小的超新星把它校准：B 波段斜率 $0.78\pm0.18$ mag/mag，校正后弥散 0.13–0.17 星等（I 到 B 波段）。高红移超新星搜索队用多色光变曲线形状法（MLCS，Riess、Press 与 Kirshner 1995–96），超新星宇宙学计划用时间轴“拉伸因子” $s$（Perlmutter 等 1997），两种做法等价。</p>
<p><b>按需发现超新星。</b>超新星宇宙学计划（SCP，劳伦斯伯克利国家实验室；1988 年由珀尔马特与 Pennypacker 发起，后由珀尔马特领导）发展了定时搜索：新月后拍几千个星系，三周后在下一个新月前重拍，做图像相减，一次就能找到十几颗正在变亮的超新星，并事先预约好光谱和测光的跟踪时间。1992 年他们找到 $z = 0.458$ 的 SN 1992bi。1994 年底，施密特和 Suntzeff 组建了竞争的高红移超新星搜索队（High-z Team），里斯负责关键的分析。</p>
<p><b>结果反转。</b>SCP 前 7 颗（$z\approx 0.35$–0.46；Perlmutter 等 1997）若设 $\Lambda=0$ 给出 $\Omega_m = 0.88^{+0.69}_{-0.60}$，看上去宇宙在明显减速。加入哈勃望远镜测到的 $z = 0.83$ 的 SN 1997ap（Nature 1998 年 1 月）后，结论转向低密度。1998 年 Riess 等用 16 颗高红移和 34 颗近邻超新星发现：高红移超新星比 $\Omega_m = 0.2$、$\Lambda = 0$ 的宇宙预言的远 10%–15%；仅要求 $\Omega_m \ge 0$，就有 $\Omega_\Lambda\gt 0$（3.0σ 与 4.0σ，两种拟合方法）、$q_0\lt 0$（2.8σ 与 3.9σ）。Perlmutter 等（1999）用 42 颗 $z = 0.18$–0.83 的超新星独立得到：平直宇宙中 $\Omega_m = 0.28^{+0.09}_{-0.08}$，$P(\Lambda\gt 0) = 99\%$；误差椭圆沿 $0.8\Omega_m - 0.6\Omega_\Lambda \approx -0.2 \pm 0.1$ 拉长。</p>
<p><b>排查系统误差。</b>两队检查了尘埃消光（颜色）、超新星随宿主星系和年代的演化、选择偏差、引力透镜。尘埃会使超新星变红，而高红移样本的颜色与近邻样本一致（Perlmutter 等 1999）；后来按宿主星系类型分组（Sullivan 等 2003）也得到相同结果。2001 年 Riess 等用 $z\approx 1.7$ 的 SN 1997ff 看到了更早的<b>减速</b>阶段，这是简单的“灰尘埃”或“演化”假说无法模仿的特征。《科学》杂志把这一发现评为 1998 年度突破。</p>`,
    idea: R`
<p>超新星测的是光度距离 $d_L(z)$，它是膨胀历史 $H(z)$ 的积分。远处的超新星偏暗，意思是光走过的距离比任何只含物质的宇宙都长，即使是一个完全空、毫不减速的宇宙也不够长。所以过去的膨胀比今天<b>慢</b>，宇宙在加速。</p>
<p>在广义相对论中，加速度方程是 $\ddot a/a = -\frac{4\pi G}{3}\sum(\rho + 3p/c^2)$。要 $\ddot a\gt 0$，必须有一种成分的压强为负且足够大：$p \lt -\rho c^2/3$。爱因斯坦的 $\Lambda$ 正好是这样一种成分，$p_\Lambda = -\rho_\Lambda c^2$，能量密度不随膨胀稀释。早期物质密度 $\propto a^{-3}$ 占优，膨胀减速；约 60 亿年前 $\Lambda$ 占了上风，膨胀转为加速。</p>
<p>这个结论同时化解了两个矛盾：$\Omega_m\approx 0.3$ 加上 $\Omega_\Lambda \approx 0.7$ 恰好使空间平直；加速膨胀使宇宙年龄延长到约 $0.96/H_0$（$\Omega_m = 0.3$ 的平直宇宙），比最老的恒星更老。几年内，宇宙微波背景（空间平直）和重子声学振荡（$\Omega_m$）从两个独立方向确认了这幅图景。这种成分被 Turner 称为<b>暗能量</b>，它的本性至今未知。</p>
<p>两支队伍互相竞争，样本、拟合方法和分析各自独立，只共用了部分近邻校准样本，却得到相同的结论。这是该奖由两队负责人共享的原因：珀尔马特领导 SCP，施密特领导 High-z 队，里斯是 High-z 队 1998 年论文的第一作者和主要分析者。</p>`,
    math: R`
<p><b>1. 弗里德曼方程。</b>空间均匀各向同性的度规（FLRW）为 $ds^2 = -c^2dt^2 + a(t)^2\big[d\chi^2 + S_k(\chi)^2 d\Omega^2\big]$，取今天 $a_0 = 1$，$S_k(\chi) = R_c\sin(\chi/R_c),\ \chi,\ R_c\sinh(\chi/R_c)$ 分别对应闭合、平直、开放，$R_c$ 是今天的曲率半径。对理想流体 $(\rho_i, p_i)$，爱因斯坦方程（含 $\Lambda$）给出</p>
$$H^2 \equiv \Big(\frac{\dot a}{a}\Big)^2 = \frac{8\pi G}{3}\sum_i\rho_i - \frac{kc^2}{a^2},\qquad \frac{\ddot a}{a} = -\frac{4\pi G}{3}\sum_i\Big(\rho_i + \frac{3p_i}{c^2}\Big),$$
<p>其中 $\Lambda$ 记作一种 $\rho_\Lambda = \Lambda c^2/8\pi G$、$p_\Lambda = -\rho_\Lambda c^2$ 的成分。两式相容等价于连续性方程 $\dot\rho_i + 3H(\rho_i + p_i/c^2) = 0$；若 $p_i = w_i\rho_i c^2$ 且 $w_i$ 为常数，则 $\rho_i \propto a^{-3(1+w_i)}$：物质 $w=0$，$\rho\propto a^{-3}$；辐射 $w = 1/3$，$\rho\propto a^{-4}$；$\Lambda$ 的 $w=-1$，$\rho$ 为常数。定义 $\Omega_i = 8\pi G\rho_{i,0}/3H_0^2$，$\Omega_k = -kc^2/H_0^2$，则第一式在今天给出 $\sum_i\Omega_i + \Omega_k = 1$，且 $R_c = c/(H_0\sqrt{|\Omega_k|})$；并且</p>
$$H(z) = H_0E(z),\qquad E(z)^2 = \Omega_m(1+z)^3 + \Omega_k(1+z)^2 + \Omega_\Lambda\quad(\text{忽略辐射}),\qquad 1+z = 1/a .$$
<p><b>2. 加速的条件。</b>定义 $q \equiv -\ddot a a/\dot a^2$。</p>
<p><i>命题。</i>$q_0 = \tfrac12\sum_i\Omega_i(1+3w_i)$；对物质加宇宙学常数，$q_0 = \Omega_m/2 - \Omega_\Lambda$。膨胀加速（$q\lt 0$）当且仅当 $\sum_i(\rho_i + 3p_i/c^2)\lt 0$；若只有一种成分占主导，这要求 $w\lt -1/3$。</p>
<p><i>证明。</i>加速度方程除以 $H^2 = (8\pi G/3)\rho_{\rm c}$：$\ddot a/(aH^2) = -\tfrac12\sum_i(\rho_i/\rho_{\rm c})(1+3w_i)$。在今天取值并乘以 $-1$ 即得。$q$ 与 $\ddot a$ 异号，故第二句成立。∎</p>
<p>另一个有用的等式：由 $\dot H = \ddot a/a - H^2 = -H^2(1+q)$ 和 $dz/dt = -(1+z)H$ 得 $\dfrac{d\ln H}{dz} = \dfrac{1+q(z)}{1+z}$。在 $z=0$ 处 $E'(0) = 1+q_0$，可以直接用 $E^2$ 的表达式验证：$E'(0) = \tfrac12(3\Omega_m + 2\Omega_k) = 1 + \Omega_m/2 - \Omega_\Lambda$。</p>
<p><b>3. 光度距离。</b>定义 $d_L$ 使得流量 $F = L/(4\pi d_L^2)$。一个在共动距离 $\chi$ 处发光的源，光在今天铺满面积 $4\pi S_k(\chi)^2$ 的球面；每个光子的能量减小为 $1/(1+z)$，光子到达的速率也因时间膨胀减小为 $1/(1+z)$。所以</p>
$$d_L = (1+z)\,S_k(\chi),\qquad \chi = \int_{t_e}^{t_0}\frac{c\,dt}{a} = \frac{c}{H_0}\int_0^z\frac{dz'}{E(z')} .$$
<p>写成 $\Omega$ 的形式就是挑战第二关的公式：$d_L = \frac{c(1+z)}{H_0\sqrt{|\Omega_k|}}S_k\big(\sqrt{|\Omega_k|}\int_0^z dz'/E\big)$，平直时取极限。</p>
<p><b>4. 低红移展开。</b><i>命题。</i>$\dfrac{H_0 d_L}{c} = z + \dfrac{1-q_0}{2}z^2 + O(z^3)$。二次项只依赖 $q_0$，与能量如何分配无关；空间曲率的几何效应（$S_k(\chi)$ 与 $\chi$ 之差）从 $z^3$ 项才出现。</p>
<p><i>证明。</i>$1/E(z) = 1 - E'(0)z + O(z^2) = 1 - (1+q_0)z + O(z^2)$，积分得 $H_0\chi/c = z - \tfrac12(1+q_0)z^2 + O(z^3)$。$S_k(\chi) = \chi \mp \chi^3/(6R_c^2) + \dots$，曲率的几何修正只进入三次项。乘以 $1+z$：$z + z^2 - \tfrac12(1+q_0)z^2 = z + \tfrac12(1-q_0)z^2$。∎</p>
<p>这正是“测 $q_0$”的原始含义：在哈勃图上，$q_0$ 是线性哈勃律之外的第一个修正。$q_0\lt 0$ 意味着同一红移处距离更远、超新星更暗。$z\approx 0.5$ 时展开已不够准，实际拟合用第 3 节的精确积分。</p>
<p><b>5. 距离模数与标准化。</b>$\mu \equiv m - M = 5\log_{10}(d_L/10\,{\rm pc}) = 5\log_{10}(d_L/{\rm Mpc}) + 25$。微分得</p>
$$\frac{\delta d_L}{d_L} = \frac{\ln 10}{5}\,\delta\mu \approx 0.461\,\delta\mu ,$$
<p>所以 0.3 星等的弥散对应约 14% 的距离误差，0.15 星等对应约 7%。Ia 型超新星的峰值 $M_B\approx -19.3$（依赖于 $H_0$ 的取值），原始弥散 0.3–0.4 星等。标准化的经验公式（Phillips 1993；Tripp 1998 加入颜色项）为</p>
$$M_{\rm corr} = M - b\,(\Delta m_{15} - 1.1) \quad\text{或}\quad \mu = m_B - M + \alpha x_1 - \beta c ,$$
<p>其中 $x_1$ 是拉伸参数，$c$ 是颜色（同时吸收尘埃与内禀颜色）。现代样本中 $\alpha\approx 0.14$、$\beta\approx 3$，残余弥散约 0.10–0.15 星等，距离精度 5%–7%。物理上，峰值亮度由爆炸产生的 ⁵⁶Ni 质量决定（⁵⁶Ni → ⁵⁶Co → ⁵⁶Fe，半衰期 6.1 天与 77 天）；镍越多，抛射物越热、越不透明，光子逃出越慢，光变曲线越宽。这一解释大体成立，细节仍在研究。</p>
<p><b>6. 拟合与简并方向。</b>记 $\mathcal M = M + 5\log_{10}(c/H_0\,{\rm Mpc}^{-1}) + 25$，则视星等满足 $m_j - 5\log_{10}D_L(z_j;\Omega_m,\Omega_\Lambda) = \mathcal M + $ 噪声，其中 $D_L = H_0d_L/c$。超新星本身无法区分 $M$ 与 $H_0$，只能约束 $\mathcal M$ 与曲线形状。对高斯误差，</p>
$$\chi^2(\Omega_m,\Omega_\Lambda) = \min_{\mathcal M}\sum_j\frac{(x_j - \mathcal M)^2}{\sigma_j^2} = \sum_j w_jx_j^2 - \frac{(\sum_j w_jx_j)^2}{\sum_j w_j},\quad x_j = m_j - 5\log_{10}D_L(z_j),\ w_j = \sigma_j^{-2} .$$
<p>两参数的置信区域取 $\Delta\chi^2 = 2.30, 6.18, 11.8$（68.3%、95.4%、99.7%，对线性高斯模型精确，一般情形是 Wilks 定理的渐近结果）。在 $(0.3, 0.7)$ 附近，以 $z=0.05$ 为锚点，$z = 0.5$ 处 $\partial\mu/\partial\Omega_m \approx -0.36$、$\partial\mu/\partial\Omega_\Lambda\approx +0.31$：增加物质与增加 $\Lambda$ 的效果几乎相反，误差椭圆沿 $\delta\Omega_\Lambda/\delta\Omega_m\approx 1.2$ 方向拉长。这就是 Perlmutter 等写下的 $0.8\Omega_m - 0.6\Omega_\Lambda\approx -0.2$。宇宙微波背景的声学峰位置约束 $\Omega_m+\Omega_\Lambda$（近似正交的方向），重子声学振荡约束 $\Omega_m$，三者交于一点，即“协调模型”。</p>
<p><b>7. 年龄与转变红移。</b>$t_0 = \int_0^1\frac{da}{a\,H(a)} = \frac{1}{H_0}\int_0^1\frac{da}{a\,E(a)}$。平直时令 $x = a^{3/2}$，$a^{1/2}da = \tfrac23dx$：</p>
$$t_0 = \frac{2}{3H_0}\int_0^1\frac{dx}{\sqrt{\Omega_m + \Omega_\Lambda x^2}} = \frac{2}{3H_0\sqrt{\Omega_\Lambda}}\operatorname{arsinh}\sqrt{\frac{\Omega_\Lambda}{\Omega_m}} .$$
<p>$\Omega_\Lambda\to 0$ 时回到爱因斯坦–德西特的 $2/(3H_0)$。普朗克卫星参数（$\Omega_m = 0.315$，$H_0 = 67.4$ km/s/Mpc，$1/H_0 = 14.5$ Gyr）给出 $t_0 = 13.8$ Gyr。平直时 $q(z) = \frac{\Omega_m(1+z)^3/2 - \Omega_\Lambda}{\Omega_m(1+z)^3 + \Omega_\Lambda}$，变号于 $(1+z_t)^3 = 2\Omega_\Lambda/\Omega_m$，即 $z_t\approx 0.63$，约 61 亿年前。注意 $z_t$ 比“$\Lambda$ 与物质密度相等”的红移 $(\Omega_\Lambda/\Omega_m)^{1/3}-1\approx 0.30$ 更早，因为加速只需 $\rho_\Lambda\gt\rho_m/2$。</p>
<p><b>8. 没有大爆炸的宇宙与宇宙学常数问题。</b>若 $\Omega_\Lambda$ 相对 $\Omega_m$ 太大，$E^2(z)$ 会在某个有限红移变为零：宇宙过去在那里“反弹”，没有大爆炸。观测到 $z\gt 1$ 的天体与宇宙微波背景排除了这一区域，超新星的允许区域也远离它。$\Omega_\Lambda\approx 0.69$ 对应 $\rho_\Lambda\approx 6\times10^{-27}$ kg/m³，约每立方米 3.5 个质子的质量，在自然单位中 $\rho_\Lambda^{1/4}\approx 2.2$ meV。若把它解释为量子场的真空能，按普朗克能标截断的估计要大约 $10^{120}$ 倍（具体数字依赖截断，但差距巨大是确定的），这是理论物理最大的未解之谜之一。描述可能演化的暗能量时常用 $w(a) = w_0 + w_a(1-a)$，此时</p>
$$\rho_{\rm DE}(a)\propto a^{-3(1+w_0+w_a)}\,e^{-3w_a(1-a)},$$
<p>$\Lambda$ 对应 $(w_0,w_a) = (-1, 0)$。</p>`,
    labNote: R`点击左图（或拖滑块）选一个宇宙：金色区域是这批超新星允许的 $(\Omega_m,\Omega_\Lambda)$，它整个落在 $q_0\lt 0$ 的加速一侧，平直线从它中间穿过。右图把你的模型和数据放在一起，试试“只有物质”的几个预设。`,
    legacy: R`
<ul>
<li>确认：WMAP（2003 起）测得空间平直到百分之几；2005 年 SDSS 与 2dFGRS 探测到重子声学振荡。普朗克卫星 2018 年给出 $\Omega_\Lambda = 0.685\pm0.007$、$\Omega_m = 0.315\pm0.007$、宇宙年龄 $13.79\pm0.02$ Gyr。“ΛCDM”成为标准宇宙学模型。</li>
<li>超新星宇宙学本身发展到上千颗（Pantheon+、Union3、DES 五年样本），距离精度靠更好的测光标定和颜色模型提高。2001 年 Riess 等用 $z\approx 1.7$ 的 SN 1997ff 看到了早期的减速阶段。</li>
<li>哈勃常数张力：用造父变星校准的超新星给出 $H_0\approx 73.0\pm1.0$ km/s/Mpc（SH0ES，2022），而普朗克加 ΛCDM 推出 $67.4\pm0.5$，差异约 5σ。詹姆斯·韦布望远镜复核了造父变星测光，另一些用红巨星支顶端校准的分析给出约 70。分歧来自未知系统误差还是新物理，尚无定论。</li>
<li>暗能量是否在演化：DESI 的重子声学振荡数据（2024 年首批；下面的数字来自 2025 年第二批）与微波背景和超新星联合后，偏好 $w_0\gt -1$、$w_a\lt 0$ 的演化暗能量，显著性随所选超新星样本在约 2.8σ 到 4.2σ 之间。这还不足以宣称发现，超新星样本间的系统差异仍在讨论中。</li>
<li>三人及其团队还获得过 2006 年邵逸夫天文学奖（珀尔马特、里斯、施密特）、2007 年格鲁伯宇宙学奖（珀尔马特、施密特与两队），以及 2015 年基础物理学突破奖（两队全体成员）。</li>
<li>新一代巡天：欧几里得空间望远镜（2023 年发射）、鲁宾天文台的时空遗产巡天（2025 年发布首批图像），以及引力波“标准汽笛”（2017 年 GW170817 首次独立测得 $H_0$）。</li>
</ul>`,
    myths: [
      '“爱因斯坦说宇宙学常数是他一生最大的错误。”这句话出自伽莫夫的回忆，没有爱因斯坦本人的文字记录印证。可以确定的是：哈勃的发现之后，爱因斯坦在 1931 年放弃了 Λ，理由是静态宇宙已不再需要它；而他 1917 年的静态解本身也是不稳定的（爱丁顿 1930）。',
      '“超新星观测证明了存在一种叫暗能量的物质。”观测直接确立的是膨胀在加速（$q_0\\lt 0$）。在广义相对论框架内这需要一种压强为负的成分，它可以是宇宙学常数、一个缓慢变化的场，也可能意味着引力在宇宙尺度上需要修改。“暗能量”只是对这一事实的命名。',
      '“两队的结论来自同一批数据。”两队的高红移样本由各自独立发现和测量，光变曲线拟合方法也不同（拉伸因子与 MLCS），只共用了部分近邻校准样本。正因为相互独立，两者的一致才有说服力。',
      '“宇宙加速膨胀，所以太阳系和银河系也在被慢慢拉大。”在引力束缚的系统（行星系、星系、星系团）中，Λ 的效应小到可以忽略，这些系统并不随宇宙膨胀而变大。',
    ],
    papers: [
      'A. G. Riess, A. V. Filippenko, P. Challis, … B. P. Schmidt, … J. Tonry, “Observational Evidence from Supernovae for an Accelerating Universe and a Cosmological Constant”, <i>Astron. J.</i> 116, 1009 (1998)',
      'S. Perlmutter, G. Aldering, G. Goldhaber, … (The Supernova Cosmology Project), “Measurements of Ω and Λ from 42 High-Redshift Supernovae”, <i>Astrophys. J.</i> 517, 565 (1999)',
      'M. M. Phillips, “The Absolute Magnitudes of Type Ia Supernovae”, <i>Astrophys. J.</i> 413, L105 (1993)',
      'S. Perlmutter et al., “Discovery of a Supernova Explosion at Half the Age of the Universe”, <i>Nature</i> 391, 51 (1998)',
      'A. Einstein, “Kosmologische Betrachtungen zur allgemeinen Relativitätstheorie”, <i>Sitzungsber. Preuss. Akad. Wiss.</i> 142 (1917)',
    ],
    links: [
      { to: 'ligo', label: '引力波“标准汽笛”独立测量宇宙距离与 H₀' },
      { to: 'higgs', label: '真空能与宇宙学常数问题' },
    ],
  });
})();
