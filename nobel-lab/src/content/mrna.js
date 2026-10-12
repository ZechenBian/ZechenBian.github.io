/* content/mrna.js — 2023 年诺贝尔生理学或医学奖：核苷碱基修饰与 mRNA 疫苗 */
(() => {
  const R = String.raw;
  ENTRIES.push({
    id: 'mrna', field: 'med', year: 2023,
    who: [
      { zh: '卡塔林·考里科', en: 'Katalin Karikó', share: '1/2' },
      { zh: '德鲁·魏斯曼', en: 'Drew Weissman', share: '1/2' },
    ],
    short: '考里科 · 魏斯曼',
    citation: '表彰他们关于核苷碱基修饰的发现，这些发现使得研制出针对 COVID-19 的有效 mRNA 疫苗成为可能。',
    title: '核苷修饰与 mRNA 的免疫隐身',
    formula: R`\Psi \;\to\; \downarrow\,\mathrm{TLR} \;\wedge\; \uparrow\,\mathrm{translation}`,
    one: R`体外转录的 mRNA 之所以引发剧烈炎症，是因为先天免疫受体把"未经修饰的核苷"当作外来信号；把尿苷换成假尿苷一类的修饰核苷，既关掉了这个警报，又因为不再激活 PKR 而使翻译量大幅上升。`,
    teaser: '同样是 RNA，为什么有的让细胞拉响警报，有的不会？',
    scenario: R`
<p>费城，宾夕法尼亚大学，2000 年前后。用 mRNA 当药的设想早就有人提过：把编码某个蛋白的 mRNA 送进细胞，细胞自己把蛋白造出来，用完即降解，不进入细胞核，也不改动基因组。体外转录（IVT）做 mRNA 已是常规操作：一段 DNA 模板加上 T7 RNA 聚合酶和四种核苷三磷酸（ATP、CTP、GTP、UTP），几小时就能得到任意序列的 mRNA。</p>
<p>可是只要把它加到细胞上，麻烦就来了：树突状细胞被强烈激活，分泌大量炎症因子；在动物身上注射会引起明显的全身反应；而且蛋白产量低得可怜。当时的普遍解释是"RNA 太容易降解"或者"要把递送做好"。但有一个现象放在那里没人解释：细胞自己的胞质里有的是 RNA，哺乳动物的总 RNA 加到细胞上却几乎不引起反应。细菌的 RNA 则引起很强的反应。</p>
<p>你手边有：可以做任意序列 IVT mRNA 的体系，并且可以在转录时把四种核苷三磷酸中的任何一种换成化学修饰过的类似物；人外周血来源的树突状细胞；测 TNF-α 的 ELISA；以及一个荧光素酶报告基因，用来读出蛋白产量。</p>
<p>你的任务：先弄清楚细胞究竟在"认"什么，再想办法让你的 mRNA 不被认出来，最后判断这件事做成之后值多少。</p>`,
    stages: 3,
    puzzle: R`
<p>1990 年，Wolff 等把裸露的 mRNA 直接注射进小鼠肌肉，检测到了蛋白表达，证明原理可行。此后十多年，mRNA 治疗始终停在原理阶段，主要障碍被归结为两条：不稳定、以及引起强烈的先天免疫反应。</p>
<p>与此同时，先天免疫的分子基础正在被厘清。Toll 样受体（TLR）作为模式识别受体的工作使 Beutler 与 Hoffmann 获 2011 年诺贝尔生理学或医学奖（与树突状细胞的发现者 Steinman 共享）。到 2004 年前后已经知道：<b>TLR3</b> 识别双链 RNA，<b>TLR7</b> 与 <b>TLR8</b> 识别单链 RNA，它们位于内体膜上；胞质里还有 <b>RIG-I</b> 识别 5′ 三磷酸的 RNA，以及<b>蛋白激酶 R（PKR）</b>，它被双链 RNA 激活后磷酸化翻译起始因子 eIF2α，直接关掉翻译。</p>
<p>也就是说，细胞有一整套专门识别"外来 RNA"的装置。问题变成：它凭什么判断一段 RNA 是不是自己的？</p>`,
    observation: R`
<p><b>一个被忽略的对照。</b>考里科与魏斯曼比较不同来源的 RNA 加到人树突状细胞上的效果，发现差别极大：体外转录的 mRNA、细菌总 RNA、线粒体 RNA 都强烈诱导 TNF-α 等炎症因子；而哺乳动物的总 RNA 反应弱得多，<b>纯化的哺乳动物 tRNA 几乎不激活</b>。</p>
<p>把这些 RNA 按来源排一下就看出规律：哺乳动物 tRNA 是细胞里修饰最密集的 RNA（每条约 80 nt 的分子上有十几个修饰核苷，常见的有假尿苷 Ψ、m⁵C、m⁵U、m¹A、二氢尿苷等）；核糖体 RNA 修饰也多；细菌 RNA 修饰少；而体外转录的 mRNA 完全没有修饰，因为 T7 聚合酶只用四种标准核苷三磷酸。<b>刺激性强弱与修饰密度反向相关</b>。线粒体 RNA 的修饰少于胞质 RNA，它的刺激性也更强，与规律一致。</p>
<p><b>决定性实验。</b>Karikó、Buckstein、Ni、Weissman，<i>Immunity</i> 23, 165 (2005)：在体外转录时把某一种核苷三磷酸整个换成修饰过的类似物，做出序列完全相同、只有化学修饰不同的 mRNA，再测树突状细胞的激活。结果是：含 m⁵C、m⁶A、m⁵U、s²U 或<b>假尿苷 Ψ</b> 的 mRNA 都显著降低细胞因子的产生，其中 Ψ 的抑制最彻底，而未修饰的对照依旧强烈激活。他们进一步用表达单一受体的细胞系定位到 TLR3、TLR7、TLR8 都被修饰削弱了响应。结论是：<b>先天免疫并不是在识别"RNA"，而是在识别"没有修饰的核苷"</b>；修饰就是细胞给自己 RNA 盖的"自体"印章。</p>
<p><b>不只是少了炎症。</b>Karikó、Muramatsu、Welsh、Ludwig、Kato、Akira、Weissman，<i>Molecular Therapy</i> 16, 1833 (2008)：Ψ-mRNA 在细胞和小鼠体内的蛋白产量比未修饰 mRNA 高出若干倍，并且这部分增益与 PKR 有关——Ψ-mRNA 激活 PKR 的程度低得多，eIF2α 不被磷酸化，翻译机器不被关闭。2011 年他们又发表了用 HPLC 去掉双链 RNA 杂质可进一步提高产量的工作：修饰与纯化是两个独立且叠加的改进。</p>
<p><b>进入疫苗。</b>后来广泛使用的修饰是 <b>N1-甲基假尿苷（m¹Ψ）</b>，它在 Ψ 的 N1 位多一个甲基，抑制免疫激活的同时翻译效率更高。BNT162b2（辉瑞/BioNTech）与 mRNA-1273（Moderna）都用 m¹Ψ 完全替代尿苷。另外两块拼图不属于本奖，但缺一不可：<b>脂质纳米颗粒（LNP）</b>递送，源自 Cullis 等人几十年的脂质体与可电离脂质工作；以及<b>前融合构象稳定的刺突蛋白</b>——McLellan、Graham 等发现在融合肽附近引入两个脯氨酸（"2P"）可把冠状病毒刺突锁在前融合构象，诱导的中和抗体显著更好。</p>
<p><b>三期试验的数字。</b>Polack 等，<i>N. Engl. J. Med.</i> 383, 2603 (2020 年 12 月)：约 43 000 名受试者随机接种 BNT162b2 或安慰剂，第二剂后 7 天起统计有症状 COVID-19，疫苗组 8 例、安慰剂组 162 例，疫苗有效性 95%（95% 可信区间 90.3%–97.6%）。</p>`,
    idea: R`
<p>把这件事抽象一层：先天免疫面临一个分类问题——在胞内看到一段 RNA，判断它是自己的还是入侵者的。可用的特征不能是序列（病毒序列千变万化），也不能只是结构。细胞实际采用的特征是<b>化学修饰的存在</b>：自身 RNA 在合成后被一整套酶系统密集修饰，而病毒和体外转录的 RNA 没有经过这套系统。修饰因此成为一枚难以伪造的"自体标记"。</p>
<p>反过来用这个规则，就是本奖的发现：<b>给治疗用 mRNA 盖上同一枚印章</b>，它就不再触发警报。这不是把免疫系统压下去，而是让这一个分子不被归类为外来物；接种后针对刺突蛋白的适应性免疫照常建立，被关掉的只是针对 RNA 本身的先天免疫。</p>
<p>第二层收益来自同一处修饰。PKR 被激活后磷酸化 eIF2α，使翻译起始停摆——这是细胞对付病毒的通用手段，代价是把自己的蛋白合成也关掉。Ψ/m¹Ψ 削弱了 PKR 的激活，于是<b>mRNA 不但不引发炎症，还能被翻译得更久、更多</b>。炎症下降与表达上升不是两件事，而是同一个开关的两端。</p>
<p>再往外一层是这项技术的结构性优势：疫苗的"信息"部分只是一段序列。换一个病原体、换一个变异株，只需要改写序列，生产工艺不变。2020 年 1 月 11 日病毒序列公布，1 月 13 日 mRNA-1273 的序列即已确定——这个时间尺度是传统疫苗做不到的。</p>
<p><b>关于考里科的经历。</b>事实层面：她 1985 年从匈牙利到美国，1989 年起在宾夕法尼亚大学从事 mRNA 研究，长期未能获得稳定经费；1995 年被降职并失去终身教职轨道，同期被诊断出癌症。她继续以较低的职位做这项工作，并在复印机旁与魏斯曼相识，开始合作。2013 年她离开宾大加入 BioNTech 任副总裁。2023 年与魏斯曼共获诺贝尔奖。这段经历常被用作"坚持"的励志叙事；更值得注意的是制度层面的问题：一项后来被证明极重要的工作，在十余年里反复被评审认为缺乏重要性而拿不到资助。</p>`,
    math: R`
<p><b>1. 化学。</b>尿苷中尿嘧啶的 N1 与核糖 C1′ 相连（N-糖苷键）。<b>假尿苷 Ψ</b> 是它的 C-糖苷异构体：连接点换成嘧啶环的 C5，分子式不变（同分异构），但 N1 位空出一个额外的氢键供体 N1–H。它是细胞中最常见的 RNA 修饰，由假尿苷合酶在转录后催化异构化，在 tRNA 与 rRNA 中大量存在。<b>m¹Ψ</b> 是 Ψ 的 N1 甲基化产物。Ψ 与腺苷仍按 Watson–Crick 方式配对，故不改变遗传信息；但它增强碱基堆积、提高局部双链的热稳定性（每个取代约使 $T_m$ 升高 0.5–1 ℃），并改变磷酸骨架的局部构象——受体"摸"到的正是这些。</p>
<p><b>2. 识别的最小模型。</b>设受体 $i$（TLR3/7/8、RIG-I、PKR）结合 RNA 的平衡常数为 $K_i$，激活信号近似为占据率</p>
$$a_i = \frac{[\mathrm{RNA}]}{K_i + [\mathrm{RNA}]} .$$
<p>一个修饰核苷使局部结合自由能上升 $\Delta\Delta G_i\gt 0$，若一段 RNA 含 $m$ 个这样的位点且贡献近似可加，则 $K_i \to K_i\,e^{\,m\Delta\Delta G_i/RT}$。在 $[\mathrm{RNA}]\ll K_i$ 的线性区，信号按 $e^{-m\Delta\Delta G_i/RT}$ 指数衰减：修饰密度只要达到每百个核苷几个，激活就下降一两个数量级。这解释了为什么 tRNA（修饰密度最高）几乎不激活，而完全未修饰的 IVT mRNA 最强。</p>
<p><b>3. PKR 与翻译量。</b>PKR 被双链 RNA 激活后磷酸化 eIF2α。设 eIF2α 磷酸化比例为 $p$，有活性的三元复合物比例近似 $1-p$，稳态翻译速率</p>
$$V \;\propto\; (1-p)\,[\mathrm{mRNA}] .$$
<p>再设 mRNA 以速率 $k_d$ 降解、以恒定速率 $k_s$ 输入（递送），蛋白以 $k_p$ 合成、$\gamma$ 降解，则</p>
$$\frac{dM}{dt} = k_s - k_d M,\qquad \frac{dP}{dt} = k_p (1-p) M - \gamma P ,$$
<p>总蛋白产量（单次给药 $M(0)=M_0$、$k_s=0$）为 $\int_0^\infty k_p(1-p)M_0 e^{-k_d t}dt = k_p (1-p) M_0/k_d$。修饰同时降低 $p$ 并（因炎症介导的降解减少）降低 $k_d$，两个因子相乘，所以观察到的表达增益可达一个数量级以上。</p>
<p><b>4. 疫苗有效性的定义。</b>设疫苗组与安慰剂组的发病率（attack rate）分别为 $r_v = c_v/N_v$、$r_p = c_p/N_p$，</p>
$$\mathrm{VE} = 1 - \frac{r_v}{r_p} .$$
<p>代入 2020 年 12 月报告的近似数字 $c_v = 8$、$N_v \approx 18\,198$、$c_p = 162$、$N_p \approx 18\,325$：</p>
$$r_v = 4.40\times10^{-4},\quad r_p = 8.84\times10^{-3},\quad \mathrm{VE} = 1 - 0.0497 = 0.950 .$$
<p>$\mathrm{VE}=0.95$ 的含义是"接种者的发病风险降为未接种者的 1/20"，<b>不是</b>"95% 的接种者受到保护"。注意 $N_v\approx N_p$，所以 $\mathrm{VE}\approx 1 - c_v/c_p = 1 - 8/162 = 0.9506$——这正是条件二项方法的出发点。</p>
<p><b>5. 条件二项与可信区间。</b>把两组的随访人时记为 $T_v, T_p$，$r = T_v/T_p$。若两组发病服从强度 $\lambda_v,\lambda_p$ 的泊松过程，则<b>给定总病例数 $C = c_v+c_p$ 时</b>，$c_v$ 服从二项分布 $\mathrm{Bin}(C,\theta)$，其中</p>
$$\theta = \frac{\lambda_v T_v}{\lambda_v T_v + \lambda_p T_p} .$$
<p><i>证明梗概。</i>独立泊松变量之和仍为泊松，且在给定和的条件下各分量服从以强度为权的二项分布。∎</p>
<p>由 $\mathrm{VE} = 1 - \lambda_v/\lambda_p$ 与上式解出</p>
$$\mathrm{VE} = 1 - \frac{\theta}{(1-\theta)\,r},\qquad \hat\theta = \frac{c_v}{C} .$$
<p>$\mathrm{VE}$ 是 $\theta$ 的严格减函数，所以把 $\theta$ 的区间端点代入即得 $\mathrm{VE}$ 的区间（端点互换）。用 Wilson 区间</p>
$$\theta_{\pm} = \frac{\hat\theta + \frac{z^2}{2C} \pm z\sqrt{\hat\theta(1-\hat\theta)/C + z^2/(4C^2)}}{1 + z^2/C},\qquad z = 1.96 ,$$
<p>对 $c_v=8$、$c_p=162$、$r = 18\,198/18\,325 = 0.9931$ 得 $\mathrm{VE}$ 的 95% 区间约 $[90.0\%,\,97.5\%]$，与报告的 $[90.3\%,\,97.6\%]$ 相符（报告使用的是贝叶斯方法并做了中期分析的校正，故略有差异）。</p>
<p><b>6. 区间宽度由病例数决定，而不是由受试者数决定。</b>令 $\phi = \ln\frac{\theta}{1-\theta}$，则 $\mathrm{VE} = 1 - e^{\phi}/r$，且 $\phi$ 的渐近标准误为</p>
$$\mathrm{SE}(\phi) = \frac{1}{\sqrt{C\,\hat\theta(1-\hat\theta)}} .$$
<p>$C=170,\hat\theta=0.047$ 给 $\mathrm{SE}=0.36$；若病例数降到 $C=42$（同样的 $\hat\theta$），$\mathrm{SE}=0.72$，区间从约 $[90\%,98\%]$ 展宽到约 $[79\%,99\%]$。宽度按 $C^{-1/2}$ 收缩，所以三期试验的规模是由"要攒够多少病例"倒推的：要把 $\mathrm{VE}=0.95$ 的下限压到 30% 以上（监管门槛）只需几十例，要压到 90% 以上才需要上百例。这也说明为什么试验必须在流行强度足够高的地区做——$C$ 由发病率而非入组人数直接决定。</p>
<p><b>7. 群体层面。</b>基本再生数 $R_0$，接种覆盖率 $f$、有效性 $\mathrm{VE}$ 时，有效再生数 $R_e = R_0\,(1 - f\cdot\mathrm{VE})$。$R_e\lt 1$ 要求</p>
$$f \gt \frac{1}{\mathrm{VE}}\Big(1 - \frac{1}{R_0}\Big).$$
<p>$R_0 = 3$、$\mathrm{VE} = 0.95$（对传播的有效性，通常低于对发病的有效性）给 $f \gt 0.70$；若对传播的有效性只有 0.5，则 $f \gt 1.33$，无解——即单靠接种无法阻断传播。这是 2021 年之后实际发生的情况，也说明"对发病有效"与"对传播有效"必须分开讨论。</p>`,
    labNote: '左边选修饰：未修饰时 TNF-α 很高、荧光素酶很低；换成 Ψ 或 m¹Ψ 两条同时反转。关掉 LNP 看递送效率的影响。右边的试验计算器：把病例数从 170 减到 20，点估计不动，可信区间按 $C^{-1/2}$ 迅速展宽。',
    legacy: R`
<ul>
<li>2020–2023：BNT162b2 与 mRNA-1273 在全球接种数十亿剂。多项研究估计仅 2021 一年，COVID-19 疫苗（各类合计）避免的死亡在百万量级；具体数字依模型假设差异较大。</li>
<li>平台化：序列可换、工艺不变。针对流感、呼吸道合胞病毒、巨细胞病毒、寨卡的 mRNA 疫苗进入临床；个体化肿瘤新抗原疫苗（按患者肿瘤突变定制序列）是目前最活跃的方向之一。</li>
<li>蛋白替代与体内编辑：用 mRNA 瞬时表达治疗性蛋白或编辑酶。CRISPR 的体内递送多采用 mRNA 加 LNP 的组合（见基因编辑条目）。</li>
<li>未解决的问题：mRNA 疫苗保护力随时间下降较快、需要冷链、以及肌注后激发黏膜免疫有限；鼻喷等黏膜途径仍在研究。</li>
<li>科研体制：考里科长期拿不到经费、1995 年被降职的经历，使"同行评议如何对待长期、不合主流的研究方向"成为持续讨论的话题。</li>
<li>核苷修饰本身已成为独立领域（表观转录组学）：m⁶A 等修饰调控 mRNA 的稳定性、剪接与翻译，相关酶是新的药物靶点。</li>
</ul>`,
    myths: [
      '“mRNA 疫苗会改变人的基因组。”mRNA 不进入细胞核，细胞内也没有把 RNA 写回基因组的常规途径（逆转录酶是逆转录病毒带来的）；mRNA 在胞质中数小时到数天内被降解。',
      '“有效性 95% 意味着 95% 的接种者不会感染。”VE 是风险比：$1 - r_v/r_p$，含义是接种者的发病风险降到未接种者的约 1/20。它既不是"95% 的人完全免疫"，也不直接等于对传播的阻断效果。',
      '“考里科一个人发明了 mRNA 疫苗。”获奖的是她与魏斯曼合作发现的核苷修饰这一步。疫苗还需要 LNP 递送（Cullis 等）、前融合稳定的刺突抗原设计（McLellan、Graham 等）、以及大规模生产与临床试验，这些由不同团队完成。',
      '“假尿苷是一种人工化学物质。”Ψ 是细胞自身 RNA 中最常见的天然修饰，tRNA 与 rRNA 里大量存在；疫苗用的 m¹Ψ 是它的甲基化衍生物，在古菌与真核生物的 rRNA 中也天然存在。',
      '“未修饰 mRNA 不能用。”可以，CureVac 的候选疫苗就使用未修饰的 mRNA 并通过序列优化降低免疫激活，但其三期试验的有效性（约 48%）明显低于两款 m¹Ψ 疫苗——这反过来支持了修饰的重要性。',
    ],
    papers: [
      'K. Karikó, M. Buckstein, H. Ni, D. Weissman, “Suppression of RNA Recognition by Toll-like Receptors: The Impact of Nucleoside Modification and the Evolutionary Origin of RNA”, <i>Immunity</i> 23, 165 (2005)',
      'K. Karikó, H. Muramatsu, F. A. Welsh, J. Ludwig, H. Kato, S. Akira, D. Weissman, “Incorporation of Pseudouridine Into mRNA Yields Superior Nonimmunogenic Vector With Increased Translational Capacity and Biological Stability”, <i>Molecular Therapy</i> 16, 1833 (2008)',
      'K. Karikó, H. Muramatsu, J. Ludwig, D. Weissman, “Generating the Optimal mRNA for Therapy: HPLC Purification Eliminates Immune Activation and Improves Translation of Nucleoside-Modified, Protein-Encoding mRNA”, <i>Nucleic Acids Research</i> 39, e142 (2011)',
      'F. P. Polack <i>et al.</i>, “Safety and Efficacy of the BNT162b2 mRNA Covid-19 Vaccine”, <i>N. Engl. J. Med.</i> 383, 2603 (2020)',
      'J. Pallesen, N. Wang, K. S. Corbett, D. Wrapp, R. N. Kirchdoerfer, H. L. Turner, C. A. Cottrell, M. M. Becker, L. Wang, W. Shi, W.-P. Kong, E. L. Andres, A. N. Kettenbach, M. R. Denison, J. D. Chappell, B. S. Graham, A. B. Ward, J. S. McLellan, “Immunogenicity and Structures of a Rationally Designed Prefusion MERS-CoV Spike Antigen”, <i>PNAS</i> 114, E7348 (2017)',
    ],
    links: [
      { to: 'pcr', label: '体外转录模板与 RT-qPCR 检测' },
      { to: 'crispr', label: 'mRNA + LNP 递送编辑酶' },
    ],
  });
})();
