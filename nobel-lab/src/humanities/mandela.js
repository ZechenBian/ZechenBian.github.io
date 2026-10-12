/* 从牢房到投票站 — Nobel Peace Prize 1993: Nelson Mandela & F. W. de Klerk
 * "for their work for the peaceful termination of the apartheid regime, and for laying the foundations
 *  for a new democratic South Africa" (announced 15 Oct 1993).
 * Five chapters: (1) apartheid as a legal machine (dot grid), (2) the negotiation game (simplified model),
 * (3) the TRC amnesty criteria (composite cases), (4) political vs economic equality afterwards, (5) why two laureates.
 */
(() => {
  window.HUM = window.HUM || {};

  /* ---------------- seeded RNG ---------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));

  /* =====================================================================
   * Chapter 2 engine — a deliberately simple model (简化模型).
   * State (0–100): trust 双方信任, anc 非国大基本盘支持, np 国民党基本盘支持, viol 暴力水平, prog 谈判进展.
   * Each choice: d = [Δtrust, Δanc, Δnp, Δviol, Δprog], rec = how much it invites reciprocity (−1..1),
   * hist = true for what actually happened. fx = special effects.
   * ===================================================================== */
  const KEYS = ['trust', 'anc', 'np', 'viol', 'prog'];
  const START = { trust: 20, anc: 65, np: 60, viol: 35, prog: 5 };

  const ROUNDS = [
    {
      date: '1990 年 2 月', title: '开局',
      ctx: {
        M: '2 月 2 日，德克勒克在议会宣布解除对非国大、泛非大和南非共产党的禁令。2 月 11 日，你在坐牢 27 年后走出维克多·韦斯特监狱。全世界在等你出狱后的第一次表态；身后数以万计的支持者，有许多人认为政府只是在耍花招。',
        D: '你 1989 年 9 月就任总统。紧急状态已持续数年，制裁和资本外流在掏空经济，冷战结束也让"共产主义威胁"这张牌不再好用。2 月 2 日议会开幕，你要发表讲话。党内和安全部门里不少人认为放出曼德拉等于引火烧身。',
      },
      M: [
        { t: '支持谈判，但声明武装斗争的理由仍在，不会立即放弃', d: [3, 6, -3, 0, 6], rec: 0.1, hist: true },
        { t: '立即单方面宣布停止武装斗争，以示诚意', d: [9, -14, 4, -2, 6], rec: 0.6 },
        { t: '拒绝在现行宪法下谈判，要求政府先交出权力', d: [-12, 5, 4, 6, -4], rec: -0.7 },
      ],
      D: [
        { t: '全面解禁三个组织，宣布无条件释放曼德拉', d: [14, 3, -8, 0, 12], rec: 0.7, hist: true },
        { t: '只放人不解禁：非国大须先放弃武装斗争才能合法化', d: [-3, 2, 3, 2, 4], rec: -0.2 },
        { t: '维持紧急状态，先找"温和"黑人领袖谈', d: [-12, 4, 4, 8, 0], rec: -0.7 },
      ],
      hist: '2 月 2 日德克勒克在议会宣布解禁三个组织、释放曼德拉；2 月 11 日曼德拉获释。他当天在开普敦的讲话一方面支持谈判，一方面表示武装斗争的理由依然存在——对两边的听众各说了一半。',
      lesson: '双层博弈：每位领导人同时面对谈判对手和自己身后的人。对外的每一句让步，都要在对内的账本上付账。',
    },
    {
      date: '1990 年 8 月 6 日', title: '比勒陀利亚备忘录',
      ctx: {
        M: '政府要求非国大放下武器才谈实质问题；"民族之矛"（非国大武装）的许多成员和地下网络则认为，枪是手里唯一的筹码。',
        D: '非国大愿意谈"暂停"武装行动，但要你在政治犯和流亡者问题上给出东西。警察和军方担心被出卖。',
      },
      M: [
        { t: '宣布暂停武装行动（不是解散"民族之矛"）', d: [12, -7, 5, -4, 10], rec: 0.6, hist: true },
        { t: '坚持武装斗争直到制宪会议召开', d: [-9, 4, -4, 4, -2], rec: -0.6 },
        { t: '宣布永久放弃武装斗争并解散"民族之矛"', d: [15, -18, 6, -4, 10], rec: 0.8 },
      ],
      D: [
        { t: '交换：承诺分阶段释放政治犯、安排流亡者回国', d: [10, 4, -5, -3, 10], rec: 0.6, hist: true },
        { t: '先交出武器库位置，否则不放政治犯', d: [-8, -2, 5, 2, -2], rec: -0.6 },
        { t: '把"暂停"当作前提条件收下，不给任何回报', d: [-4, -3, 3, 0, 3], rec: -0.2 },
      ],
      hist: '8 月 6 日双方签署《比勒陀利亚备忘录》：非国大宣布暂停武装行动；政府承诺推进释放政治犯、为流亡者回国作出安排，并检讨安全立法。非国大内部不少人认为让步太早。',
      lesson: '可信的姿态：暂停而不是解散，是给对方看的承诺，也给自己人留了退路。',
    },
    {
      date: '1991 年 7 月', title: '"因卡塔门"',
      ctx: {
        M: '一年多来，非国大与因卡塔自由党支持者在纳塔尔和德兰士瓦的冲突造成数千人死亡。7 月，媒体披露警方秘密资助因卡塔的集会。许多人怀疑存在一支挑动黑人互斗的"第三势力"。',
        D: '媒体披露警方秘密资助因卡塔的集会，你的执法部长和国防部长都被牵连。非国大指责政府一边谈判一边打代理战争。',
      },
      M: [
        { t: '公开施压：要求撤换部长、停止秘密行动，但留在谈判进程里', d: [-2, 6, -3, 0, 4], rec: 0.0, hist: true },
        { t: '以此为由退出一切谈判，直到政府下台', d: [-12, 5, -3, 6, -8], rec: -0.8 },
        { t: '低调处理，私下与德克勒克沟通', d: [5, -9, 2, 0, 3], rec: 0.5 },
      ],
      D: [
        { t: '把两名部长调到次要职位，停止秘密资助', d: [6, 2, -4, -2, 4], rec: 0.3, hist: true },
        { t: '否认、拖延调查', d: [-10, 3, 2, 5, -2], rec: -0.6 },
        { t: '全面公开安全部门的秘密行动，成立独立调查', d: [12, 3, -12, -4, 4], rec: 0.7 },
      ],
      hist: '7 月媒体（《每周邮报》等）披露警方秘密资助因卡塔。德克勒克把执法部长弗洛克和国防部长马兰调到次要职位，但否认知道更深的暴力行动。"第三势力"之争持续多年；后来的调查（包括真相与和解委员会）认定部分安全部门人员参与或纵容了暴力。',
      lesson: '搅局者不一定在场外：对方阵营内部的人也会用暴力改变谈判的筹码。',
    },
    {
      date: '1991 年 12 月 20 日', title: 'CODESA 开幕',
      ctx: {
        M: '"民主南非大会"（CODESA）在约翰内斯堡附近的肯普顿公园开幕。根本分歧：新宪法由谁来写？你主张由普选产生的制宪议会起草；国民党想在选举前就把少数群体的保护写死。',
        D: 'CODESA 开幕。你的党希望在普选之前通过谈判把权力分享和少数否决权锁进宪法；非国大要由选举产生的制宪议会来写。',
      },
      M: [
        { t: '坚持宪法由选举产生的机构起草，但同意先在 CODESA 谈出约束性的原则', d: [3, 4, 0, 0, 8], rec: 0.3, hist: true },
        { t: '接受由各党派协商直接制定最终宪法', d: [8, -13, 5, 0, 10], rec: 0.7 },
        { t: '拒绝任何过渡安排，要求立即普选', d: [-7, 4, -5, 2, -3], rec: -0.6 },
      ],
      D: [
        { t: '提出少数否决、轮值总统等长期保护方案', d: [-3, -2, 5, 0, 4], rec: -0.2, hist: true },
        { t: '接受选举产生的制宪机构，换取宪法原则先行锁定', d: [8, 3, -7, 0, 10], rec: 0.6 },
        { t: '拖延，等党内意见统一再说', d: [-4, -2, 1, 1, 1], rec: -0.3 },
      ],
      hist: '12 月 20 日 CODESA 第一次全体会议召开，约 19 个政党和团体参加；保守党和泛非大缺席，因卡塔领导人布特莱齐本人也没有到场。会议最后，德克勒克批评非国大没有解散武装，曼德拉当场严厉回击——双方在开幕当天就公开交锋。',
      lesson: '承诺问题：交出权力的一方害怕"赢家通吃"，掌权的一方害怕对方拖到自己更弱时再谈。分歧的核心是：谁来保证承诺被遵守？',
    },
    {
      date: '1992 年 3 月 17 日', title: '白人公投',
      ctx: {
        M: '2 月，保守党在波切夫斯特鲁姆补选中击败国民党。德克勒克宣布举行只有白人参加的公投，问白人选民是否支持继续改革。如果输了，他很可能下台，谈判也会随之停摆。',
        D: '2 月，保守党在波切夫斯特鲁姆补选中击败你的党。右翼说你没有授权去"出卖白人"。你可以把政治生命押在一次白人公投上。',
      },
      M: [
        { t: '反对只限白人的投票方式，但公开呼吁白人投赞成票', d: [5, -3, 4, 0, 2], rec: 0.4, fx: 'refBoost', hist: true },
        { t: '谴责公投是种族主义表演，号召大规模抗议', d: [-6, 4, -4, 4, 0], rec: -0.4, fx: 'refDrag' },
        { t: '不表态，置身事外', d: [0, 0, 0, 0, 0], rec: 0 },
      ],
      D: [
        { t: '举行白人公投，赌上政治生命', d: [2, 0, 0, 0, 0], rec: 0.2, fx: 'referendum', hist: true },
        { t: '不公投，靠议会多数继续推进', d: [0, 0, -9, 0, 3], rec: 0.1 },
        { t: '暂停改革，安抚右翼', d: [-12, -2, 8, 4, -6], rec: -0.6 },
      ],
      hist: '3 月 17 日，约 85% 的登记白人选民投票，68.73% 支持继续改革。德克勒克以此宣称获得授权，保守党的挑战暂时被压下。',
      lesson: '双层博弈：德克勒克用一次对内的赌博，换来对外谈判时的底气——赢了，右翼就不能再说他没有授权。',
    },
    {
      date: '1992 年 6 月 17 日', title: '博伊帕通',
      ctx: {
        M: '5 月 CODESA 第二次会议在通过宪法所需的特别多数（约 70% 还是 75%）以及参议院否决权上卡住。6 月 17 日夜，博伊帕通 45 人遇害，袭击者来自附近一个与因卡塔有关的宿舍区，有人指控警方参与或纵容。愤怒的支持者要你做点什么。',
        D: 'CODESA 第二次会议陷入僵局。6 月 17 日夜，博伊帕通 45 人遇害，袭击者来自与因卡塔有关的宿舍区，有指控称警方卷入。非国大支持者的怒火对准了你的政府。',
      },
      M: [
        { t: '退出谈判，转向"群众行动"，向政府开出复谈条件', d: [-8, 12, -3, 5, -8], rec: -0.3, fx: 'walkout', hist: true },
        { t: '留在谈判桌，只发表谴责声明', d: [3, -15, 2, 0, 2], rec: 0.3 },
        { t: '宣布恢复武装斗争', d: [-20, 8, -10, 18, -15], rec: -1 },
      ],
      D: [
        { t: '前往现场慰问并承诺调查', d: [0, -2, 0, 0, -2], rec: 0.0, hist: true },
        { t: '立即管控宿舍区、禁止公开携带"传统武器"（非国大的要求）', d: [10, 4, -7, -6, 2], rec: 0.6 },
        { t: '指责非国大煽动暴力，扩大紧急状态', d: [-14, 4, 6, 8, -8], rec: -0.8 },
      ],
      hist: '非国大随即退出谈判，发起罢工和"群众行动"，并向政府提出一系列复谈条件。德克勒克前往博伊帕通，被愤怒的人群逼离。后来的司法调查对警方是否卷入结论不一，这至今仍有争议。',
      lesson: '代价信号：退出谈判本身很昂贵（暴力可能上升、进展倒退），正因如此，它能可信地告诉对方"你的底线不是我的底线"，并重设复谈的条件。',
    },
    {
      date: '1992 年 9 月', title: '比索之后',
      ctx: {
        M: '9 月 7 日，非国大支持者游行进入西斯凯"家园"首府比索，西斯凯部队开枪，28 名游行者和 1 名士兵死亡。局势像是在滑向深渊。政府方面传话：可以谈。',
        D: '9 月 7 日比索惨案后，各方都看到了深渊的边缘。非国大愿意谈复会，但要你在宿舍区、危险武器和政治犯问题上兑现。',
      },
      M: [
        { t: '与政府签署《谅解记录》，重返谈判', d: [12, -2, -2, -4, 12], rec: 0.6, fx: 'resume', hist: true },
        { t: '继续群众行动，向其他"家园"进军', d: [-8, 4, -4, 10, -4], rec: -0.6 },
        { t: '绕开政府，先与因卡塔单独谈', d: [-2, -3, 0, -4, 2], rec: 0 },
      ],
      D: [
        { t: '签《谅解记录》：接受选举产生的制宪机构、管控宿舍区、再放一批政治犯', d: [12, 3, -7, -4, 12], rec: 0.7, fx: 'resume', hist: true },
        { t: '只同意恢复会谈，不做实质让步', d: [-3, -2, 1, 1, 2], rec: -0.3 },
        { t: '与布特莱齐和各"家园"领导人结成"温和联盟"对抗非国大', d: [-12, 2, 4, 8, -4], rec: -0.8 },
      ],
      hist: '9 月 26 日，曼德拉与德克勒克签署《谅解记录》：同意由选举产生的机构制定宪法，政府承诺管控宿舍区、禁止公开携带危险武器并释放更多政治犯。谈判恢复；被排除在外的因卡塔则转而与政府疏远。',
      lesson: '退出之后的复会：条件被重设了。双边协议也有代价——没被邀请的一方（因卡塔）成了新的潜在搅局者。',
    },
    {
      date: '1992 年末 – 1993 年初', title: '落日条款',
      ctx: {
        M: '南非共产党领导人乔·斯洛沃提出"落日条款"：选举后组成为期五年的民族团结政府，保障现任公务员、军警的职位和养老金。你的许多同志认为这是向旧政权投降。',
        D: '非国大内部有人提出"落日条款"：五年民族团结政府、保障公务员和军警的饭碗。代价是你要放弃永久性的少数否决权。',
      },
      M: [
        { t: '支持"落日条款"：五年分权政府、保障公务员职位与养老金', d: [14, -8, 10, -2, 12], rec: 0.8, hist: true },
        { t: '拒绝分权：胜者执政，旧官僚体系必须彻底清洗', d: [-12, 6, -12, 5, -4], rec: -0.8 },
        { t: '只保障公务员养老金，不搞分权政府', d: [4, -2, 3, 0, 5], rec: 0.2 },
      ],
      D: [
        { t: '接受：放弃永久否决权，换取有期限的分权和权利法案', d: [12, 3, -6, -2, 12], rec: 0.7, hist: true },
        { t: '坚持永久少数否决和轮值总统', d: [-10, -3, 4, 2, -6], rec: -0.7 },
        { t: '要求先以联邦制把权力下放到各省', d: [-2, -1, 2, 0, 4], rec: -0.1 },
      ],
      hist: '斯洛沃在党刊上提出"落日条款"，在非国大内部引起激烈争论，但很快成为谈判共识：选举后组成五年民族团结政府，保护公务员的职位与养老金。国民党则逐步放弃了永久否决权的要求，转而依靠权利法案和宪法法院。',
      lesson: '承诺问题的解法：让交出权力的一方得到"有期限、写进法律、可被法院执行"的保障。不是信任对方的人品，而是让违约变得困难。',
    },
    {
      date: '1993 年 4 月 10 日', title: '哈尼遇刺',
      ctx: {
        M: '南非共产党领导人、最受年轻人拥护的人物之一克里斯·哈尼，在家门外被极右翼分子枪杀。乡镇里的愤怒一触即发，你的年轻支持者要求报复或停止谈判。',
        D: '克里斯·哈尼被极右翼分子枪杀。全国处在爆发边缘。你的政府掌握军警，但这一夜，黑人多数愿意听的人不是你。',
      },
      M: [
        { t: '在国家电视台呼吁克制，同时要求尽快确定选举日期', d: [10, -4, 4, -12, 14], rec: 0.7, hist: true },
        { t: '暂停谈判，组织全国哀悼与抗议', d: [-6, 6, -3, 8, -6], rec: -0.3 },
        { t: '号召报复', d: [-25, 4, -12, 25, -20], rec: -1 },
      ],
      D: [
        { t: '请曼德拉在国家电视台讲话，并同意加快确定选举日期', d: [10, 4, -6, -10, 12], rec: 0.7, hist: true },
        { t: '宣布全国紧急状态，部署军队', d: [-10, -4, 6, 6, -6], rec: -0.6 },
        { t: '迅速抓捕凶手，但谈判节奏不变', d: [2, 0, 2, -2, 2], rec: 0.1 },
      ],
      hist: '凶手雅努什·瓦卢什（波兰移民，极右翼）很快因一名白人邻居记下车牌而被捕；保守党人克莱夫·德比-刘易斯被判参与策划。曼德拉当晚在国家电视台讲话呼吁克制。此后谈判各方在 1993 年年中把选举日期定为 1994 年 4 月 27 日。',
      lesson: '不让搅局者定议程：刺杀的目的就是让谈判停下来。用"更快确定选举日期"来回应，等于告诉搅局者：暴力只会加速你想阻止的事。',
      after: 'awb',
    },
    {
      date: '1994 年 3 – 4 月', title: '最后的缺席者',
      ctx: {
        M: '选举还剩几周。博普塔茨瓦纳"家园"领导人曼戈普拒绝参选，当地公务员和警察哗变；因卡塔仍在抵制，纳塔尔暴力不断。是等所有人都上船，还是按期开船？',
        D: '博普塔茨瓦纳陷入混乱，右翼武装扬言支援曼戈普；因卡塔仍在抵制。你仍是总统，军队听你调遣。',
      },
      M: [
        { t: '接受国际调解：承认祖鲁王室的宪法地位，换取因卡塔参选', d: [6, -4, 2, -12, 10], rec: 0.6, hist: true },
        { t: '不再等因卡塔，按期选举，靠安全部队压住夸祖鲁', d: [-2, 2, -2, 8, 6], rec: -0.2 },
        { t: '推迟选举，直到所有方都同意', d: [2, -12, 2, 4, -10], rec: 0.1 },
      ],
      D: [
        { t: '派军队恢复博普秩序，并支持国际调解劝因卡塔参选', d: [6, 3, -2, -10, 10], rec: 0.6, hist: true },
        { t: '与布特莱齐另立协议，承诺推迟选举', d: [-15, -4, 2, 6, -12], rec: -0.8 },
        { t: '不干预"家园"，让它们自己解决', d: [-2, -2, 0, 10, 2], rec: -0.2 },
      ],
      hist: '3 月，数百名白人右翼武装人员进入博普塔茨瓦纳支援曼戈普，行动失控；三名 AWB 成员在镜头前被当地警察打死。南非军队接管，曼戈普被撤职，右翼武装威胁就此瓦解，维尔容将军转而登记"自由阵线"参选。4 月 19 日——投票前一周——因卡塔在肯尼亚调解人华盛顿·奥库姆斡旋下同意参选，选票上临时贴上了因卡塔的标签。',
      lesson: '一个选举日期本身就是承诺工具：日期越不可动摇，留在场外的代价越高，抵制者越倾向于最后时刻上船。',
    },
  ];

  const ENDINGS = {
    win: { k: 'win', t: '选举如期举行', d: '1994 年 4 月 26–29 日（主投票日 27 日），近 2000 万人投票，许多人排队数小时。非国大约 62.6%，国民党约 20.4%，因卡塔约 10.5%。5 月 10 日曼德拉就任总统，德克勒克成为副总统之一。' },
    war: { k: 'war', t: '谈判破裂，暴力螺旋', d: '在这个模型里，信任耗尽或暴力失控，谈判桌被掀翻。真实历史并不遥远：从 1990 年年中到 1994 年选举，约有 1.4 万人死于政治暴力（真相与和解委员会报告引用的估计）。' },
    coup: { k: 'coup', t: '右翼政变', d: '在这个模型里，暴力高企而白人选民对改革失去信心，安全部门和右翼武装中的强硬派越过了政府。这一风险在当时被认真对待过——1994 年博普塔茨瓦纳的右翼武装行动就是一次失控的预演。' },
    ousted: { k: 'ousted', t: '被自己的基本盘推翻', d: '' },
    stall: { k: 'stall', t: '选举日期定不下来', d: '在这个模型里，到 1994 年春谈判进展仍不足以举行选举：没有破裂，但也没有终点。拖延本身会给搅局者更多时间。' },
  };

  function newGame(role, seed) {
    return { role, seed, rng: mulberry32(seed), r: 0, s: Object.assign({}, START), leverage: false, over: null, picks: [], track: [Object.assign({}, START)] };
  }

  /* Play choice ci in the current round. Returns an outcome record for the UI. */
  function play(g, ci) {
    const R = ROUNDS[g.r], role = g.role, other = role === 'M' ? 'np' : 'anc', mine = role === 'M' ? 'anc' : 'np';
    const ch = R[role][ci], s = g.s, rng = g.rng, before = Object.assign({}, s);
    const notes = [];
    g.picks.push(ci);
    ch.d.forEach((v, i) => { s[KEYS[i]] += v; });

    // special effects
    const refHappens = (role === 'M' && g.r === 4) || ch.fx === 'referendum';
    if (ch.fx === 'walkout') g.leverage = true;
    if (ch.fx === 'resume' && g.leverage) { s.prog += 6; s.anc += 4; notes.push({ k: 'info', t: '此前退出谈判的代价没有白付：复会的条件对非国大更有利（进展 +6，非国大基本盘 +4）。' }); }
    if (role === 'D' && g.r === 5) { // Boipatong: does the ANC walk out?
      const stay = ci === 1 && s.trust >= 50;
      if (!stay) { g.leverage = true; s.prog -= 6; s.anc += 6; s.trust -= 4; notes.push({ k: 'bad', t: '非国大宣布退出谈判，发起群众行动（进展 −6，信任 −4）。' }); }
      else notes.push({ k: 'good', t: '你满足了对方的核心要求，非国大谴责屠杀但没有退出谈判。' });
    }
    if (refHappens) {
      let p = 0.72 + (s.np - 45) / 60 - (s.viol - 30) / 250;
      if (role === 'M') { const st = R.M[ci].fx; p += st === 'refBoost' ? 0.1 : st === 'refDrag' ? -0.12 : 0; }
      p = clamp(p, 0.05, 0.97);
      const ok = rng() < p;
      if (ok) { s.np = Math.max(s.np, 50) + 14; s.prog += 6; s.trust += 3; notes.push({ k: 'good', t: `白人公投通过（模型中成功概率约 ${Math.round(p * 100)}%）：德克勒克的授权得到确认，国民党基本盘 +14。` }); }
      else { s.np -= 22; s.prog -= 10; notes.push({ k: 'bad', t: `白人公投失败（模型中成功概率约 ${Math.round(p * 100)}%）：右翼宣称改革没有授权，国民党基本盘 −22，进展 −10。` }); }
    }
    if (role === 'D' && g.r === 4 && ci === 1) notes.push({ k: 'info', t: '没有公投，保守党的挑战继续发酵。' });

    // the other side responds (rule: trust, its own base security, violence, how reciprocal your move was, noise)
    const w = 0.5 * s.trust / 100 + 0.5 * (s[other] - 35) / 65 - 0.3 * s.viol / 100 + 0.2 * ch.rec + (rng() - 0.5) * 0.3;
    let resp;
    if (w > 0.3) { s.prog += 5; s.trust += 3; resp = { k: 'good', t: '对方回应积极，愿意在下一步上相向而行（进展 +5，信任 +3）。' }; }
    else if (w > 0.05) { s.prog += 1; resp = { k: 'info', t: '对方观望：口头欢迎，但没有拿出新东西（进展 +1）。' }; }
    else { s.prog -= 3; s.trust -= 3; s[other] += 2; resp = { k: 'bad', t: '对方转向强硬，向自己的基本盘表态（进展 −3，信任 −3，对方基本盘 +2）。' }; }

    // spoilers: more likely when progress jumps or violence is already high
    const dProg = s.prog - before.prog;
    const pSpoil = clamp(0.12 + 0.02 * Math.max(0, dProg) + s.viol / 400, 0, 0.8);
    let spoiler = null;
    if (rng() < pSpoil) {
      const half = s.trust >= 50;
      s.viol += half ? 4 : 8; s.trust -= half ? 1 : 4;
      spoiler = { k: 'bad', p: pSpoil, t: half
        ? '随机事件：某地发生针对平民的袭击，凶手身份不明。双方迅速共同谴责，伤害被控制住（暴力 +4）。'
        : '随机事件：某地发生针对平民的袭击，凶手身份不明，双方互相指责（暴力 +8，信任 −4）。' };
    }
    // drift: low trust feeds violence, high trust calms it
    if (s.trust < 25) s.viol += 3; else if (s.trust > 55) s.viol -= 3;
    KEYS.forEach((k) => (s[k] = clamp(Math.round(s[k]))));

    // interludes after the Hani round: AWB storming Kempton Park, then the interim constitution
    const events = [];
    if (R.after === 'awb' && !check(g)) {
      s.viol = clamp(s.viol + 6);
      if (s.trust >= 40) events.push({ k: 'info', h: '1993 年 6 月 25 日', t: 'AWB 右翼武装分子开着装甲车撞破肯普顿公园谈判会场的玻璃墙。在这个模型里，双方信任足够（≥40），谈判照常继续（暴力 +6）。' });
      else { s.trust = clamp(s.trust - 6); s.prog = clamp(s.prog - 4); events.push({ k: 'bad', h: '1993 年 6 月 25 日', t: 'AWB 右翼武装分子开着装甲车撞进谈判会场。信任不足，双方互相指责安保失职，谈判停摆数周（暴力 +6，信任 −6，进展 −4）。' }); }
      if (s.prog >= 55) { s.trust = clamp(s.trust + 5); s.prog = clamp(s.prog + 6); events.push({ k: 'good', h: '1993 年 11 – 12 月', t: '临时宪法通过：权利法案、宪法法院、34 条约束最终宪法的原则——把"落日条款"式的保障写进了法律（信任 +5，进展 +6）。' }); }
      else events.push({ k: 'bad', h: '1993 年底', t: '进展不足，临时宪法没能按期谈成。' });
    }

    const out = { round: g.r, ci, ch, before, after: Object.assign({}, s), resp, spoiler, notes, events };
    g.r++;
    g.over = check(g) || (g.r >= ROUNDS.length ? (s.prog >= 75 && s.viol < 75 ? 'win' : 'stall') : null);
    g.track.push(Object.assign({}, s));
    return out;
  }
  function check(g) {
    const s = g.s;
    if (s.anc <= 15 || s.np <= 15) return 'ousted';
    if (s.viol >= 85 || (s.trust <= 3 && s.viol >= 50)) return 'war';
    if (s.viol >= 70 && s.np <= 35) return 'coup';
    return null;
  }
  function ousterText(g) {
    const who = g.s.anc <= 15 ? 'anc' : 'np';
    const self = (who === 'anc') === (g.role === 'M');
    const leader = who === 'anc' ? '曼德拉' : '德克勒克';
    const base = who === 'anc' ? '非国大基层与武装派' : '白人选民与国民党议员';
    return `${self ? '你' : '对手'}（${leader}）失去了${base}的支持，被党内强硬派取代${self ? '' : '，新的谈判对手不再认可之前的承诺'}。在这个模型里，基本盘支持跌到 15 以下就意味着下台：领导人能在谈判桌上走多远，取决于身后的人愿不愿跟。`;
  }

  /* ---------------- module ---------------- */
  window.HUM.mandela = {
    title: '从牢房到投票站',
    _engine: { ROUNDS, newGame, play, check, START },
    mount(root, ctx) {
      const H = ctx.h, el = H.el, col = (n) => ctx.color(n), reduced = !!ctx.reduced;
      const cleanups = [];
      if (!document.getElementById('st-mandela')) {
        document.head.append(el('style', { id: 'st-mandela', text: CSS }));
      }
      // theme change → redraw registered canvases
      const redraws = new Set();
      const redrawAll = () => redraws.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
      const mo = new MutationObserver(redrawAll);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
      const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      if (mq) mq.addEventListener('change', redrawAll);
      cleanups.push(() => { mo.disconnect(); if (mq) mq.removeEventListener('change', redrawAll); });

      const CH = [
        { t: '如果南非是 100 个人', build: ch1 },
        { t: '谈判桌', build: ch2 },
        { t: '真相与和解', build: ch3 },
        { t: '之后', build: ch4 },
        { t: '为什么颁给两个人', build: ch5 },
      ];
      const wrap = el('div', { class: 'bench mandela' });
      const head = el('div', { class: 'bench-head' }, [
        el('div', { class: 'k', text: '1993 诺贝尔和平奖 · 互动体验' }),
        el('h2', { text: '从牢房到投票站' }),
        el('p', { text: '1993 年 10 月 15 日，挪威诺贝尔委员会把和平奖同时授予纳尔逊·曼德拉和 F. W. 德克勒克，表彰他们为和平结束种族隔离制度、为新的民主南非奠定基础所做的工作。一个坐了 27 年牢的人，和曾经维护那座监狱的政府的首脑。五幕，看清他们谈的是什么，为什么那么难。' }),
      ]);
      const visited = new Set([0]);
      const pills = CH.map((c, i) => el('button', { type: 'button', class: 'pill', onclick: () => open(i) }, [el('span', { class: 'pill-n', text: String(i + 1) }), el('span', { class: 'pill-t', text: c.t })]));
      const strip = el('div', { class: 'pills mandela-nav', role: 'tablist', 'aria-label': '章节' }, pills);
      const host = el('div', { class: 'mandela-host' });
      wrap.append(head, strip, host);
      root.append(wrap);
      const built = new Map();
      let cur = 0;

      function chapterShell(i) {
        const c = CH[i];
        const sec = el('section', { class: 'mandela-ch', 'aria-label': `第 ${i + 1} 幕 ${c.t}` });
        const reflect = el('div', { class: 'mandela-reflect', hidden: true });
        const prev = H.button({ label: '← 上一幕', onClick: () => open(i - 1) });
        const next = H.button({ label: i < CH.length - 1 ? '下一幕 →' : '回到第一幕', kind: 'primary', onClick: () => open(i < CH.length - 1 ? i + 1 : 0) });
        if (i === 0) prev.disabled = true;
        const body = el('div', { class: 'mandela-body' });
        sec.append(el('div', { class: 'mandela-chhead' }, [el('span', { class: 'mandela-k', text: `第 ${i + 1} 幕 / ${CH.length}` }), el('h3', { text: c.t })]), body, reflect,
          el('div', { class: 'mandela-foot' }, [prev, next]));
        const api = {
          unlock(html) { if (!reflect.hidden) return; reflect.hidden = false; reflect.innerHTML = '<b>这一幕想说的</b>' + html; },
          reflectEl: reflect,
        };
        return { sec, body, api };
      }
      function open(i) {
        cur = i; visited.add(i);
        if (!built.has(i)) {
          const sh = chapterShell(i);
          host.append(sh.sec);
          let handle = null;
          try { handle = CH[i].build(sh.body, sh.api) || null; } catch (e) { console.error(e); sh.body.append(el('p', { class: 'lab-missing', text: '这一幕加载失败。' })); }
          built.set(i, { sec: sh.sec, handle });
        }
        built.forEach((b, k) => { b.sec.hidden = k !== i; });
        pills.forEach((p, k) => { p.setAttribute('aria-selected', String(k === i)); p.dataset.state = k === i ? 'cur' : visited.has(k) ? 'done' : 'open'; });
        const b = built.get(i); if (b.handle && b.handle.shown) b.handle.shown();
        if (wrap.getBoundingClientRect().top < 0) wrap.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
      }
      const P = (html) => el('p', { class: 'mandela-p', html });

      /* =================== Chapter 1: 100 people =================== */
      function ch1(body, api) {
        body.append(P('把 1990 年代初的南非缩成 100 个人。按种族隔离制度的官方分类（下面的颜色就是这套分类本身，不是对任何人的描述），大约 <b>75 个黑人、13 个白人、9 个"有色人"、3 个印度/亚裔</b>（近似值）。方框是全国的土地。逐条按下法律，看这些点被法律搬到哪里。'));
        const CATS = [
          { k: 'B', n: '黑人（非洲人）', c: '--s1', count: 75 },
          { k: 'W', n: '白人', c: '--s2', count: 13 },
          { k: 'C', n: '"有色人"（混血等）', c: '--s3', count: 9 },
          { k: 'I', n: '印度/亚裔', c: '--s4', count: 3 },
        ];
        const LAWS = [
          { y: '起点', n: '假想的起点', e: '先假设每个人都可以在任何地方买地、居住。（真实历史上，殖民征服早已造成大规模剥夺；这个起点只是为了看清后面的法律各自做了什么。）' },
          { y: '1913', n: '《原住民土地法》', e: '黑人只能在划定的"保留地"内购买或租用土地，保留地约占国土的 7%。' },
          { y: '1936', n: '《原住民信托与土地法》', e: '保留地上限提高到约 13%。约四分之三的人口，只能在约八分之一的土地上拥有土地。' },
          { y: '1950', n: '《人口登记法》', e: '每个人被登记进一个"种族"类别，写进身份证件（图中每个点多了一个小标签）。此后住在哪、上什么学、和谁结婚、做什么工作，都由这一栏决定。' },
          { y: '1950', n: '《集团住区法》', e: '城镇被划成按种族分开的住区，划错一边的家庭被强制迁走。例如开普敦第六区 1966 年被宣布为白人区后，约 6 万居民陆续被迁出。' },
          { y: '1952', n: '通行证法', e: '通行证制度早已存在，1952 年的法律把它统一为人人随身携带的"参考簿"。黑人能否留在"白人区"的城市工作、居住，由官员按证件决定；高峰时每年有数十万人因违反通行证法被捕。图中一部分点住进城边的"乡镇"，每天往返于白人区做工。' },
          { y: '1953', n: '《班图教育法》', e: '黑人学校改由国家按专门为黑人设定的低标准统一管理，人均教育经费只有白人学生的零头（见下方柱图）。' },
          { y: '1959–81', n: '"家园"（班图斯坦）', e: '保留地被拆成 10 个"家园"。1970 年起每个黑人都被指定为某个家园的"公民"——即使一辈子住在城里。特兰斯凯（1976）、博普塔茨瓦纳（1977）、文达（1979）、西斯凯（1981）被宣布"独立"，被划给它们的数百万人随即失去南非国籍（空心点）。没有任何国际承认这些"国家"。' },
          { y: '1986–94', n: '拆除', e: '1986 年废除通行证法；1991 年废除土地法、集团住区法和人口登记法；1994 年家园并回南非、国籍恢复。界线消失了，但点停在原地：土地、住房和学校的分布不会随一纸废令回到原位。' },
        ];
        const legend = el('div', { class: 'mandela-legend' }, CATS.map((c) => el('span', {}, [el('i', { style: `background:var(${c.c})` }), `${c.n} ≈${c.count}`])));
        const stage = el('div', { class: 'lab-stage' });
        body.append(legend, stage);
        const cv = H.canvas(stage, { aspect: 0.62, minH: 280, maxH: 430 });
        const lawBtns = LAWS.map((L, i) => el('button', { type: 'button', class: 'seg', 'aria-pressed': String(i === 0), onclick: () => go(i) }, [el('b', { text: L.y }), ' ', L.n]));
        const effect = el('div', { class: 'mandela-effect', 'aria-live': 'polite' });
        const nextBtn = H.button({ label: '下一条法律 →', kind: 'primary', onClick: () => go(Math.min(step + 1, LAWS.length - 1)) });
        const resetBtn = H.button({ label: '回到起点', onClick: () => go(0) });
        const roLand = H.readout('黑人可合法购地的范围'), roPass = H.readout('受通行证管控'), roCit = H.readout('被剥夺南非国籍（示意，点数）');
        const edu = el('div', { class: 'mandela-edu', hidden: true });
        body.append(el('div', { class: 'segs mandela-laws', role: 'group', 'aria-label': '法律' }, lawBtns), el('div', {}, [nextBtn, resetBtn]), effect,
          el('div', { class: 'lab-readout' }, [roLand.el, roPass.el, roCit.el]), edu,
          el('p', { class: 'lab-hint', text: '示意图：点的位置表示"法律允许他在哪里拥有土地或居住"，不是人口地理分布；人数比例为 1990 年代初的近似值，用于所有年份只是为了便于比较。区块大小除保留地比例外均为示意。' }));
        // education bars (nominal rand per pupil per year)
        const EDU = [{ y: '1953', w: 128, b: 17 }, { y: '1975–76', w: 644, b: 42 }];
        edu.append(el('div', { class: 'mandela-edu-h', text: '人均教育经费（兰特/学生/年，名义值；各资料略有出入）' }),
          ...EDU.map((r) => el('div', { class: 'mandela-edu-row' }, [
            el('span', { class: 'mandela-edu-y', text: r.y }),
            el('div', { class: 'mandela-edu-bars' }, [
              el('div', { class: 'mandela-edu-bar', style: `width:${(r.w / 644) * 100}%;background:var(--s2)` }, [el('span', { text: `白人 ${r.w}` })]),
              el('div', { class: 'mandela-edu-bar', style: `width:${Math.max(2, (r.b / 644) * 100)}%;background:var(--s1)` }, [el('span', { class: 'out', text: `黑人 ${r.b}（约 1/${Math.round(r.w / r.b)}）` })]),
            ]),
          ])));

        // dots
        const rng = mulberry32(1913);
        const dots = [];
        CATS.forEach((c) => { for (let i = 0; i < c.count; i++) dots.push({ cat: c.k, c: c.c, x: 0, y: 0, tx: 0, ty: 0, j: rng(), hx: rng(), hy: rng(), hollow: false, tag: false, shuttle: false }); });
        const uni = dots.map(() => [0.03 + 0.94 * rng(), 0.05 + 0.9 * rng()]);
        function pack(list, r, seed) {
          if (!list.length) return;
          const ar = (r.w * cv.w) / Math.max(1, r.h * cv.h);
          const cols = Math.max(1, Math.round(Math.sqrt(list.length * ar))), rows = Math.ceil(list.length / cols);
          list.forEach((d, i) => {
            const cx = i % cols, cy = Math.floor(i / cols);
            d.tx = r.x + (r.w * (cx + 0.5 + (d.hx - 0.5) * 0.25)) / cols;
            d.ty = r.y + (r.h * (cy + 0.5 + (d.hy - 0.5) * 0.25)) / rows;
          });
        }
        function scatter(list, r) { list.forEach((d) => { const u = uni[dots.indexOf(d)]; d.tx = r.x + r.w * (0.05 + 0.9 * u[0]); d.ty = r.y + r.h * (0.05 + 0.9 * u[1]); }); }
        const B = dots.filter((d) => d.cat === 'B'), W = dots.filter((d) => d.cat === 'W'), C = dots.filter((d) => d.cat === 'C'), I = dots.filter((d) => d.cat === 'I');
        const townIdx = new Set(B.filter((_, i) => i % 3 === 1).map((d) => dots.indexOf(d))); // 25 of 75 live in townships
        let zones = [];
        function layout(st) {
          dots.forEach((d) => { d.hollow = false; d.tag = st >= 3 && st < 8; d.shuttle = false; });
          zones = [];
          if (st === 0) { scatter(dots, { x: 0, y: 0, w: 1, h: 1 }); return; }
          const rw = st === 1 ? 0.07 : 0.13;
          const rest = { x: rw + 0.02, y: 0, w: 1 - rw - 0.02, h: 1 };
          const fade = st === 8;
          if (st < 4) {
            zones.push({ x: 0, y: 0, w: rw, h: 1, lab: `保留地 ${st === 1 ? '7' : '13'}%`, kind: 'res', fade });
            pack(B, { x: 0.004, y: 0.01, w: rw - 0.008, h: 0.98 });
            scatter([...W, ...C, ...I], rest);
            return;
          }
          const town = st >= 5;
          const urbanB = B.filter((d) => townIdx.has(dots.indexOf(d))), ruralB = B.filter((d) => !townIdx.has(dots.indexOf(d)));
          const resB = town ? ruralB : B;
          // white zone, then small coloured / indian / township zones along the bottom
          zones.push({ x: 0.15, y: 0, w: 0.85, h: 1, lab: '白人区', kind: 'W', fade });
          zones.push({ x: 0.17, y: 0.78, w: 0.17, h: 0.2, lab: '有色人区', kind: 'C', fade });
          zones.push({ x: 0.36, y: 0.78, w: 0.08, h: 0.2, lab: '印度区', kind: 'I', fade });
          if (town) zones.push({ x: 0.47, y: 0.74, w: 0.17, h: 0.24, lab: '乡镇', kind: 'T', fade });
          if (st >= 7) {
            // 10 homelands as fragments within the 13% strip; 4 "independent" (TBVC)
            const n = 10, gap = 0.012, hh = (1 - gap * (n - 1)) / n;
            const indep = new Set([1, 4, 6, 8]);
            const per = Math.ceil(resB.length / n);
            for (let k = 0; k < n; k++) {
              const z = { x: 0, y: k * (hh + gap), w: 0.13, h: hh, lab: k === 0 ? '10 个"家园"' : '', kind: indep.has(k) ? 'TB' : 'res', fade };
              zones.push(z);
              const grp = resB.slice(k * per, (k + 1) * per);
              pack(grp, { x: 0.004, y: z.y + 0.005, w: 0.122, h: hh - 0.01 });
              if (indep.has(k) && st === 7) grp.forEach((d) => (d.hollow = true));
            }
            if (st === 7) urbanB.forEach((d, i) => { if (i % 3 === 0) d.hollow = true; });
          } else {
            zones.push({ x: 0, y: 0, w: 0.13, h: 1, lab: '保留地 13%', kind: 'res', fade });
            pack(resB, { x: 0.004, y: 0.01, w: 0.122, h: 0.98 });
          }
          pack(W, { x: 0.2, y: 0.06, w: 0.76, h: 0.62 });
          pack(C, { x: 0.18, y: 0.8, w: 0.15, h: 0.16 });
          pack(I, { x: 0.37, y: 0.8, w: 0.06, h: 0.16 });
          if (town) { pack(urbanB, { x: 0.48, y: 0.76, w: 0.15, h: 0.2 }); if (st < 8) urbanB.forEach((d) => (d.shuttle = true)); }
        }
        let step = 0, anim = null, t0 = 0;
        const land = () => ({ x: 10, y: 26, w: cv.w - 20, h: cv.h - 34 });
        function draw(t = 0) {
          const g = cv.g, Wd = cv.w, Hd = cv.h, L = land();
          g.clearRect(0, 0, Wd, Hd);
          g.fillStyle = col('--panel'); g.fillRect(0, 0, Wd, Hd);
          g.strokeStyle = col('--line'); g.lineWidth = 1; g.strokeRect(L.x + 0.5, L.y + 0.5, L.w, L.h);
          g.font = `11px ${col('--body-font') || 'sans-serif'}`; g.textBaseline = 'alphabetic';
          g.fillStyle = col('--muted'); g.textAlign = 'right'; g.fillText(step === 0 ? '全国土地（示意）' : LAWS[step].y + ' · ' + LAWS[step].n, Wd - 10, 16);
          zones.forEach((z) => {
            const x = L.x + z.x * L.w, y = L.y + z.y * L.h, w = z.w * L.w, h = z.h * L.h;
            const c = z.kind === 'res' || z.kind === 'TB' ? '--s1' : z.kind === 'W' ? '--s2' : z.kind === 'C' ? '--s3' : z.kind === 'I' ? '--s4' : '--muted';
            g.save();
            g.globalAlpha = z.fade ? 0.05 : z.kind === 'W' ? 0.06 : 0.14; g.fillStyle = col(c); g.fillRect(x, y, w, h);
            g.globalAlpha = z.fade ? 0.35 : 0.8; g.strokeStyle = col(c); g.setLineDash(z.fade ? [3, 4] : []); g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
            if (z.kind === 'TB' && !z.fade) { g.globalAlpha = 0.35; g.beginPath(); for (let k = -h; k < w; k += 6) { g.moveTo(x + k, y + h); g.lineTo(x + k + h, y); } g.save(); g.rect(x, y, w, h); g.clip(); g.stroke(); g.restore(); }
            g.restore();
            if (z.lab) {
              g.fillStyle = col('--fg'); g.textAlign = 'left';
              if (z.kind === 'res') { g.fillText(z.lab, L.x, L.y - 6); }
              else if (z.kind === 'W') { g.fillText(z.lab, x + 6, y + 14); }
              else { g.save(); g.font = `10px ${col('--body-font') || 'sans-serif'}`; g.fillStyle = col('--muted'); g.textAlign = 'center'; g.fillText(z.lab, x + w / 2, y - 3); g.restore(); }
            }
          });
          if (step === 7) { g.fillStyle = col('--muted'); g.textAlign = 'left'; g.font = `10px ${col('--body-font') || 'sans-serif'}`; g.fillText('斜线 = 宣布"独立"的家园', L.x + 0.15 * L.w + 6, L.y + 30); }
          const r = Math.max(2.2, Math.min(4.2, L.w / 120));
          dots.forEach((d) => {
            let x = L.x + d.x * L.w, y = L.y + d.y * L.h;
            if (d.shuttle && !reduced) { const ph = (Math.sin(t * 0.9 + d.j * 6.28) + 1) / 2; const k = Math.max(0, Math.min(1, (ph - 0.25) * 2)); x += k * (0.5 + 0.25 * d.hx) * L.w * 0.42; y -= k * (0.42 + 0.2 * d.hy) * L.h; }
            const c = col(d.c);
            g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
            if (d.hollow) { g.strokeStyle = c; g.lineWidth = 1.3; g.stroke(); }
            else { g.fillStyle = c; g.globalAlpha = step >= 3 || step === 0 ? 1 : 0.85; g.fill(); g.globalAlpha = 1; }
            if (d.tag) { g.fillStyle = col('--fg'); g.fillRect(x + r - 0.5, y - r - 1.5, 2.2, 2.2); }
          });
          if (step >= 5 && step < 8 && reduced) {
            const z = zones.find((q) => q.kind === 'T'); if (z) {
              const x = L.x + (z.x + z.w / 2) * L.w, y = L.y + z.y * L.h;
              g.strokeStyle = col('--muted'); g.setLineDash([4, 3]); g.beginPath(); g.moveTo(x, y - 2); g.lineTo(x + 0.2 * L.w, L.y + 0.45 * L.h); g.stroke(); g.setLineDash([]);
              g.fillStyle = col('--muted'); g.textAlign = 'right'; g.fillText(L.w < 420 ? '每天往返做工' : '每天往返做工（凭通行证）', L.x + L.w - 6, L.y + 0.45 * L.h - 10);
            }
          }
        }
        let loopT = 0;
        const lp = H.loop((dt, t) => {
          loopT = t;
          let moving = false;
          dots.forEach((d) => {
            const k = Math.min(1, dt * 4.5);
            const dx = d.tx - d.x, dy = d.ty - d.y;
            if (Math.abs(dx) + Math.abs(dy) > 0.0005) { moving = true; d.x += dx * k; d.y += dy * k; } else { d.x = d.tx; d.y = d.ty; }
          });
          draw(t);
          const shuttling = step >= 5 && step < 8;
          if (!moving && !shuttling) lp.stop();
        });
        function settle() { if (reduced) { dots.forEach((d) => { d.x = d.tx; d.y = d.ty; }); draw(); } else lp.start(); }
        let interactions = 0;
        function go(i) {
          step = i; layout(i);
          lawBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
          const L = LAWS[i];
          effect.innerHTML = `<b>${L.y} · ${L.n}</b>　${L.e}`;
          roLand.set(i === 0 ? '不限（假想）' : i === 1 ? '约 7% 的国土' : i < 8 ? '约 13% 的国土' : '法律限制已废除');
          roPass.set(i >= 5 && i < 8 ? '是（图中乡镇里的点）' : i >= 8 ? '1986 年废除' : '—');
          roCit.set(String(dots.filter((d) => d.hollow).length));
          edu.hidden = !(i >= 6);
          nextBtn.disabled = i >= LAWS.length - 1;
          settle();
          if (i > 0) interactions++;
          if (i >= 4 || interactions >= 3) api.unlock('<p>种族隔离常被理解为"偏见"。但把这些法律一条条叠上去，看到的是一台<b>分配机器</b>：它决定谁能拥有土地、谁能在哪里居住和走动、谁能受什么样的教育，最后连谁算这个国家的公民都由它决定。偏见是燃料，法律是机器。</p><p>这也解释了后面几幕的难题：废除法律只需要议会投一次票，可机器运转了几十年留下的分布——谁住在哪里、谁拥有什么、谁受过什么教育——不会跟着消失。而要拆掉机器，必须和掌管机器的人谈。</p>');
        }
        cv.onResize(() => { layout(step); dots.forEach((d) => { d.x = d.tx; d.y = d.ty; }); draw(loopT); });
        redraws.add(() => draw(loopT));
        layout(0); dots.forEach((d) => { d.x = d.tx; d.y = d.ty; });
        go(0); interactions = 0;
        return { destroy() { lp.stop(); cv.destroy(); }, shown() { draw(loopT); if (step >= 5 && step < 8 && !reduced) lp.start(); } };
      }

      /* =================== Chapter 2: the negotiation game =================== */
      function ch2(body, api) {
        body.append(P('1990–1994 年，南非的命运在谈判桌上，也在谈判桌外的街头。选一个角色，走过 10 个真实的节点。每回合你从 2–3 个选项里选一个；对方会按简单规则回应（取决于双方信任、对方自己的基本盘、暴力水平），还有随机发生的搅局事件。每回合之后可以看历史上实际发生了什么。'),
          el('p', { class: 'mandela-tagline', html: '<span class="mandela-badge">简化模型</span> 数值和规则是为了让机制可感，而不是对历史的量化重建。历史上的那条路在这里能走通，但不是唯一的路，也不保证每次都走通。' }));
        const game = el('div', { class: 'mandela-game' });
        body.append(game);
        let g = null, seed = 1000 + Math.floor(Math.random() * 9000), ended = 0;
        const NAMES = { trust: '双方信任', viol: '暴力水平', prog: '谈判进展' };
        function baseName(k) { return k === 'anc' ? '非国大支持者' : '国民党 / 白人选民'; }
        function meters(s, prev) {
          const mine = g.role === 'M' ? 'anc' : 'np', oth = g.role === 'M' ? 'np' : 'anc';
          const rows = [
            ['trust', NAMES.trust, '--accent'], [mine, '我方基本盘支持（' + baseName(mine) + '）', '--s1'], [oth, '对方基本盘支持（' + baseName(oth) + '）', '--s2'],
            ['viol', NAMES.viol, '--warn'], ['prog', NAMES.prog, '--good'],
          ];
          return el('div', { class: 'mandela-meters' }, rows.map(([k, n, c]) => {
            const v = s[k], dv = prev ? v - prev[k] : 0;
            const danger = (k === mine || k === oth) ? v <= 25 : k === 'viol' ? v >= 65 : k === 'trust' ? v <= 10 : false;
            return el('div', { class: 'mandela-meter' + (danger ? ' danger' : '') }, [
              el('span', { class: 'mandela-meter-n', text: n }),
              el('span', { class: 'mandela-meter-bar', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(v), 'aria-label': n }, [el('i', { style: `width:${v}%;background:var(${c})` })]),
              el('span', { class: 'mandela-meter-v', text: String(v) + (dv ? ` (${dv > 0 ? '+' : ''}${dv})` : '') }),
            ]);
          }));
        }
        function timeline() {
          return el('ol', { class: 'mandela-tl', 'aria-label': '回合' }, ROUNDS.map((R, i) => el('li', { class: i < g.r ? 'done' : i === g.r ? 'cur' : '', title: R.date + ' ' + R.title }, [el('span', { text: String(i + 1) })])));
        }
        function roleSelect() {
          game.innerHTML = '';
          const seedRo = el('span', { class: 'mono', text: '#' + seed });
          const card = (role, name, sub, desc) => el('button', { type: 'button', class: 'mandela-role', onclick: () => start(role) }, [el('b', { text: name }), el('span', { class: 'mandela-role-sub', text: sub }), el('span', { text: desc })]);
          game.append(el('div', { class: 'mandela-roles' }, [
            card('M', '曼德拉', '非洲人国民大会（ANC）', '你代表多数，但手里没有国家机器。基层和武装派要成果，也怕你被"收买"。'),
            card('D', '德克勒克', '国民党（NP）政府', '你掌握军警和国家，但时间不站在你这边。白人选民和安全部门怕你交出一切。'),
          ]), el('div', { class: 'mandela-seed' }, ['随机种子 ', seedRo, ' ', H.button({ label: '换一个', onClick: () => { seed = 1000 + Math.floor(Math.random() * 9000); seedRo.textContent = '#' + seed; } })]));
        }
        function start(role) { g = newGame(role, seed); renderRound(null); }
        function renderRound(prevOut) {
          game.innerHTML = '';
          const R = ROUNDS[g.r];
          game.append(el('div', { class: 'mandela-gtop' }, [timeline(), el('span', { class: 'mandela-gmeta', text: `${g.role === 'M' ? '你是曼德拉' : '你是德克勒克'} · 种子 #${g.seed}` })]),
            meters(g.s, prevOut ? prevOut.before : null));
          const opts = R[g.role];
          const card = el('div', { class: 'mandela-round' }, [
            el('div', { class: 'mandela-date', text: `第 ${g.r + 1} 回合 · ${R.date}` }), el('h4', { text: R.title }), el('p', { text: R.ctx[g.role] }),
            el('div', { class: 'mandela-choices' }, opts.map((o, i) => el('button', { type: 'button', class: 'mandela-choice', onclick: () => choose(i) }, [el('span', { class: 'mandela-choice-k', text: 'ABC'[i] }), el('span', { text: o.t })]))),
          ]);
          game.append(card);
        }
        function chip(o) { return el('div', { class: 'mandela-note ' + o.k, html: o.h ? `<b>${o.h}</b>　${o.t}` : o.t }); }
        function choose(i) {
          const out = play(g, i);
          game.innerHTML = '';
          game.append(el('div', { class: 'mandela-gtop' }, [timeline(), el('span', { class: 'mandela-gmeta', text: `${g.role === 'M' ? '你是曼德拉' : '你是德克勒克'} · 种子 #${g.seed}` })]), meters(g.s, out.before));
          const R = ROUNDS[out.round];
          const resBox = el('div', { class: 'mandela-round' }, [
            el('div', { class: 'mandela-date', text: `第 ${out.round + 1} 回合 · ${R.date} · ${R.title}` }),
            el('p', { class: 'mandela-picked', html: `你选择了：<b>${out.ch.t}</b>${out.ch.hist ? ' <span class="mandela-badge">与历史相同</span>' : ''}` }),
            ...out.notes.map(chip), chip(out.resp), out.spoiler ? chip(out.spoiler) : null,
            el('div', { class: 'mandela-lesson', html: `<b>机制</b>　${R.lesson}` }),
            el('details', { class: 'mandela-hist', open: true }, [el('summary', { text: '历史上实际发生了什么' }), el('p', { text: R.hist })]),
            ...out.events.map(chip),
          ]);
          game.append(resBox);
          const nextBtn = g.over ? H.button({ label: '看结局 →', kind: 'primary', onClick: ending }) : H.button({ label: `下一回合：${ROUNDS[g.r].date} →`, kind: 'primary', onClick: () => renderRound(out) });
          game.append(el('div', { class: 'mandela-gnav' }, [nextBtn]));
          nextBtn.focus({ preventScroll: true });
        }
        function ending() {
          ended++;
          const E = ENDINGS[g.over], same = g.picks.filter((ci, r) => ROUNDS[r][g.role][ci].hist).length;
          game.innerHTML = '';
          const box = el('div', { class: 'mandela-ending ' + E.k }, [
            el('div', { class: 'mandela-date', text: `结局 · ${g.r} 回合后` }), el('h4', { text: E.t }),
            el('p', { text: g.over === 'ousted' ? ousterText(g) : E.d }),
            g.over !== 'win' && g.over !== 'stall' ? null : null,
            el('p', { class: 'mandela-small', text: `你的 ${g.picks.length} 次选择中有 ${same} 次与历史相同。` }),
          ]);
          if (g.over === 'win') box.append(el('p', { class: 'mandela-small', text: '真实的路径同样险象环生：模型里你可以重来，1990 年代的人们只有一次机会。' }));
          const traj = el('div', { class: 'lab-stage' });
          game.append(meters(g.s, null), box, el('div', { class: 'mandela-traj-h', text: '你这一局的轨迹' }), traj,
            el('div', { class: 'mandela-gnav' }, [H.button({ label: '同一角色、新种子再来', kind: 'primary', onClick: () => { seed = 1000 + Math.floor(Math.random() * 9000); start(g.role); } }), H.button({ label: '换个角色', onClick: () => roleSelect() })]));
          drawTraj(traj, g.track);
          api.unlock('<p>这个小模型想让你感到四件事。<b>承诺问题</b>：要交出权力的一方，最怕的是对方赢了以后翻脸；"落日条款"、临时宪法、权利法案和宪法法院的作用，就是把承诺做成"违约很难"的制度。<b>搅局者</b>：暴力往往恰好在谈判接近突破时出现，目的就是让领导人停下来；哈尼遇刺后的选择——呼吁克制并锁定选举日期——拒绝了让搅局者定议程。<b>双层博弈</b>：德克勒克的白人公投、曼德拉的暂停武装斗争，都是在对内付账，以换取对外的空间。<b>代价信号</b>：博伊帕通后的退出看起来是倒退，却让复会的条件变了。</p><p>真实历史也提醒我们，"和平过渡"不等于没有流血：1990–1994 年的政治暴力夺走了上万条生命。</p>');
        }
        function drawTraj(parent, track) {
          const cv = H.canvas(parent, { aspect: 0.42, minH: 180, maxH: 260 });
          const mine = g.role === 'M' ? 'anc' : 'np', oth = g.role === 'M' ? 'np' : 'anc';
          const series = [['trust', '--accent', '信任'], [mine, '--s1', '我方基本盘'], [oth, '--s2', '对方基本盘'], ['viol', '--warn', '暴力'], ['prog', '--good', '进展']];
          function draw() {
            const gg = cv.g, W = cv.w, Hh = cv.h;
            gg.clearRect(0, 0, W, Hh); gg.fillStyle = col('--panel'); gg.fillRect(0, 0, W, Hh);
            const n = ROUNDS.length;
            const ax = H.axes(gg, W, Hh, { x0: 0, x1: n, y0: 0, y1: 100, pad: { l: 34, r: 10, t: 26, b: 28 }, xTicks: Array.from({ length: n + 1 }, (_, i) => i), yTicks: [0, 50, 100], xLabel: '回合' }, col);
            series.forEach(([k, c], si) => {
              gg.strokeStyle = col(c); gg.lineWidth = 2; gg.beginPath();
              track.forEach((s, i) => { const x = ax.X(i), y = ax.Y(s[k]); i ? gg.lineTo(x, y) : gg.moveTo(x, y); }); gg.stroke();
            });
            gg.font = `11px ${col('--body-font') || 'sans-serif'}`; gg.textBaseline = 'middle'; gg.textAlign = 'left';
            let x = 36; series.forEach(([, c, lab]) => { gg.fillStyle = col(c); gg.fillRect(x, 8, 10, 3); gg.fillStyle = col('--muted'); gg.fillText(lab, x + 13, 10); x += 13 + gg.measureText(lab).width + 12; });
          }
          cv.onResize(draw); draw(); redraws.add(draw);
          trajCv.push(cv);
        }
        const trajCv = [];
        roleSelect();
        return { destroy() { trajCv.forEach((c) => c.destroy()); } };
      }

      /* =================== Chapter 3: Truth and Reconciliation =================== */
      function ch3(body, api) {
        body.append(P('1995 年议会通过《促进民族团结与和解法》，设立真相与和解委员会（TRC），由德斯蒙德·图图大主教任主席，1996 年起公开听证。它最具争议的设计是<b>以真相换赦免</b>：为政治目的犯下罪行的人，只要完整披露，就可以申请大赦；获赦者不再承担刑事和民事责任。这一安排本身就是谈判的产物——临时宪法的结尾已经承诺了大赦。'),
          P('下面是 5 个<b>虚构的综合案例</b>（参考了真实案件的类型，人物和细节均为虚构）。你是大赦委员会的一员：给，还是不给？'));
        const CRIT = ['政治目的', '完整披露', '相称性', '非私利/私怨'];
        const CASES = [
          { t: '案例 A · 前安全警察', d: '1980 年代中期，他所在的警察秘密小组绑架并杀害了一名被怀疑为地下组织联络人的青年，尸体被秘密掩埋。听证会上他详细交代了指挥链、行动过程和埋尸地点；家属第一次知道了亲人的下落。他说当时相信自己是在保卫国家。',
            c: ['✓', '✓', '有争议', '✓'], v: 'grant', why: '按委员会的标准，这类案件常常获赦：行为是在国家镇压政策框架下、为政治目的实施的，申请人完整披露了事实。相称性一项争议最大，但委员会对"执行上级命令"的案件通常并不因此拒绝。', fam: '家属终于找到遗骸、知道了真相；但凶手不再面临起诉，家属也失去了民事索赔的权利。' },
          { t: '案例 B · 地下武装成员', d: '1980 年代，他在一处餐饮场所放置爆炸物，造成平民死伤。他完整承认了经过，说当时组织号召扩大斗争，他以为那里常有军警人员出入，情报后来被证明有误。',
            c: ['✓', '✓', '有争议', '✓'], v: 'grant', why: '解放运动成员同样要申请大赦，同样适用这些标准。委员会在若干造成平民死亡的案件中给予了大赦，理由是行为与政治斗争相关且完整披露；但每一个这样的决定都受到受害者家属的强烈反对。', fam: '受害者家属认为，"政治目的"不能成为杀害平民的理由；委员会则认为它的任务是判断是否符合法律标准，而不是给行为辩护。' },
          { t: '案例 C · 抢劫杀人', d: '1992 年，一名男子在持枪抢劫商店时杀死店主。申请时他说抢劫是为某政治组织筹措经费，但该组织否认授权，钱也被他个人花掉了。',
            c: ['✗', '?', '—', '✗'], v: 'deny', why: '为个人利益实施的行为不在大赦范围内。"政治目的"不能靠事后声称，委员会会看组织是否授权、钱的去向、当时的背景。被拒的申请大多属于这一类：其实是普通刑事案件。', fam: '对受害者家属而言，拒绝意味着案件仍按普通刑事司法程序处理。' },
          { t: '案例 D · 被拘留者之死', d: '一名前警官申请对一名被拘留者死亡的大赦，但只承认"推搡"，坚称死亡是意外。他的说法与法医证据和其他证人的证词矛盾，也说不清是谁下的命令。',
            c: ['?', '✗', '—', '?'], v: 'deny', why: '没有完整披露就没有大赦——这是整个交换的核心。真实例子：1999 年，与黑人觉醒运动领袖斯蒂夫·比科 1977 年死于拘押有关的几名前警察的大赦申请被拒，理由之一就是没有完整披露。（被拒之后他们也没有被起诉。）', fam: '拒绝维护了"真相换赦免"的原则；但被拒之后起诉很少真的发生，许多家属最终既没有完整真相，也没有审判。' },
          { t: '案例 E · 借冲突之名', d: '1990 年代初的政治冲突中，一名男子以"对方阵营支持者"为由杀死邻居。调查发现两人多年来有土地纠纷，他本人并非任何组织成员，也没有接到任何指示。',
            c: ['✗', '✓', '—', '✗'], v: 'deny', why: '法律明确排除出于个人恶意、私怨或报复的行为。动荡年代里很多暴力夹杂着私人恩怨，委员会必须把它们和政治行为区分开来。', fam: '这类案件提醒人们：并不是所有冲突年代的暴力都是"政治暴力"。' },
        ];
        const host = el('div', { class: 'mandela-cases' });
        const tally = el('p', { class: 'mandela-small', 'aria-live': 'polite' });
        body.append(host, tally);
        let done = 0, agree = 0;
        CASES.forEach((cs, i) => {
          const res = el('div', { class: 'mandela-case-res', hidden: true });
          const btns = [['grant', '给予大赦'], ['deny', '拒绝']].map(([v, lab]) => el('button', { type: 'button', class: 'btn', text: lab, onclick: () => decide(v) }));
          const box = el('div', { class: 'mandela-case' }, [el('div', { class: 'mandela-case-h' }, [el('b', { text: cs.t }), el('span', { class: 'mandela-badge', text: '虚构的综合案例' })]), el('p', { text: cs.d }), el('div', {}, btns), res]);
          host.append(box);
          function decide(v) {
            if (res.hidden) { done++; if (v === cs.v) agree++; }
            btns.forEach((b) => (b.disabled = true));
            res.hidden = false;
            res.innerHTML = '';
            res.append(
              el('div', { class: 'mandela-crit' }, CRIT.map((c, k) => el('span', { class: cs.c[k] === '✓' ? 'ok' : cs.c[k] === '✗' ? 'no' : 'q' }, [el('b', { text: cs.c[k] }), ' ', c]))),
              el('p', { html: `你选择了<b>${v === 'grant' ? '给予大赦' : '拒绝'}</b>。按委员会的标准，这类案件通常会被<b>${cs.v === 'grant' ? '给予大赦' : '拒绝'}</b>。${cs.why}` }),
              el('p', { class: 'mandela-fam', html: `<b>另一边</b>　${cs.fam}` }));
            tally.textContent = `已判 ${done}/5，其中 ${agree} 个与委员会的标准一致。`;
            if (done >= 3) unlockStats();
          }
        });
        const stats = el('div', { class: 'mandela-stats', hidden: true });
        body.append(stats);
        function unlockStats() {
          if (!stats.hidden) return;
          stats.hidden = false;
          // waffle: one common count — 7,116 applications: 1,167 granted, 145 partly granted, 5,143 refused, rest other
          const parts = [['全部赦免 ≈1,167', 1167, '--good'], ['部分赦免 ≈145', 145, '--accent'], ['拒绝 ≈5,143', 5143, '--warn'], ['其他（撤回、不予受理等）', 7116 - 1167 - 145 - 5143, '--muted']];
          const cells = []; let acc = 0;
          parts.forEach(([, n, c], pi) => { const k = Math.round(((acc + n) / 7116) * 100) - Math.round((acc / 7116) * 100); acc += n; for (let j = 0; j < k; j++) cells.push(c); });
          stats.append(el('h4', { text: '真实的数字（约数）' }),
            el('div', { class: 'mandela-waffle', role: 'img', 'aria-label': '约 7,100 份大赦申请中，约 16% 获全部赦免，约 2% 部分赦免，约 72% 被拒' }, cells.map((c) => el('i', { style: `background:var(${c})` }))),
            el('div', { class: 'mandela-legend' }, parts.map(([lab, , c]) => el('span', {}, [el('i', { style: `background:var(${c})` }), lab]))),
            el('ul', { class: 'mandela-list' }, [
              el('li', { text: '约 7,100 份大赦申请（一种常见统计为 7,116 份），每格约 71 份。获全部或部分赦免的约 1,100–1,300 份；不同资料、不同统计时点的数字有出入，也有资料给出更低的获赦数。大多数被拒的申请其实不是政治案件。' }),
              el('li', { text: '约 2.1 万名受害者向委员会提交了陈述，许多人在公开听证中讲述了亲人的遭遇——对很多家庭来说，这是国家第一次正式承认发生过什么。' }),
              el('li', { text: '1996 年，斯蒂夫·比科的家人等向宪法法院起诉，认为大赦剥夺了他们诉诸法院的权利；法院裁定大赦条款合宪，理由是它是政治过渡的一部分，并有宪法依据。' }),
              el('li', { text: '1998 年 10 月提交的报告认定国家是严重侵犯人权的主要责任方，同时也认定非国大等解放运动犯有侵权行为。德克勒克和非国大都曾试图阻止报告中涉及自己的内容发表；德克勒克通过诉讼使报告中关于他的一段在出版时被涂黑。' }),
              el('li', { text: '委员会建议的赔偿远比政府后来支付的多：2003 年政府向约两万名受害者每人一次性发放约 3 万兰特，许多人认为来得太晚、太少。被拒赦免者后来很少被起诉。' }),
            ]));
          api.unlock('<p>真相与和解委员会做了一个艰难的交换：<b>用一部分正义换真相</b>。审判需要证据，而许多罪行的证据被销毁或从未存在；大赦的诱因让一些加害者自己说出了埋尸地点和指挥链。代价是：获赦者不再受审，受害者失去了诉讼权。</p><p>批评来自两边：许多受害者家属认为这是"用他们的痛苦换取国家的平静"；另一些人则认为委员会对旧政权的追究不够深。它没有带来普遍的和解，但它让否认变得困难——在许多转型国家，连这一步都没有走到。</p>');
        }
        return {};
      }

      /* =================== Chapter 4: what changed and what didn't =================== */
      function ch4(body, api) {
        body.append(P('1994 年之后，"一人一票"一夜之间实现了。可第一幕里那些点的位置——土地、住房、教育、工作——要慢得多。切换下面的两条时间线，看看两种平等之间的距离。'));
        // political milestones (示意 level 0–100) and economic data
        const POL = [[1990, 15], [1993.99, 15], [1994, 100], [2025, 100]];
        const MILES = [
          [1994, '首次全民普选，约 2000 万人投票'], [1996, '新宪法通过（含权利法案），宪法法院运行'], [1999, '曼德拉只做一届即卸任，和平交接'],
          [2004, '第三次全国大选'], [2009, '第四次全国大选'], [2014, '第五次全国大选'], [2019, '第六次全国大选'], [2024, '非国大首次失去议会多数（约 40%），组成多党联合政府'],
        ];
        const GINI = [[1993, 59.3], [2000, 57.8], [2005, 65.0], [2008, 62.5], [2010, 60.9], [2014, 59.6], [2022, 54.1]];
        const UNEMP = [[2000, 23.3], [2001, 26.2], [2002, 26.6], [2003, 24.8], [2004, 23.0], [2005, 23.5], [2006, 22.1], [2007, 21.0], [2008, 22.5], [2009, 23.7], [2010, 24.9], [2011, 24.8], [2012, 24.9], [2013, 24.7], [2014, 25.1], [2015, 25.4], [2016, 26.7], [2017, 27.5], [2018, 27.1], [2019, 28.7], [2020, 29.2], [2021, 34.3], [2022, 33.5], [2023, 32.4], [2024, 32.6], [2025, 32.4]];
        let mode = 'both', year = 1994, touched = 0;
        const ch = H.choice({ label: '显示', options: [{ value: 'pol', label: '政治平等' }, { value: 'eco', label: '经济平等' }, { value: 'both', label: '两者叠加' }], value: 'both', onChange: (v) => { mode = v; touched++; draw(); maybeUnlock(); } });
        const stage = el('div', { class: 'lab-stage' });
        body.append(el('div', { class: 'lab-controls' }, [ch.el]), stage);
        const cv = H.canvas(stage, { aspect: 0.56, minH: 290, maxH: 400 });
        const sl = H.slider({ label: '年份', min: 1990, max: 2025, step: 1, value: 1994, format: (v) => String(v), onInput: (v) => { year = v; touched++; draw(); info(); maybeUnlock(); } });
        const roP = H.readout('政治'), roG = H.readout('基尼系数（世界银行，最近的调查年）'), roU = H.readout('官方失业率');
        sl.el.style.gridColumn = '1 / -1';
        body.append(el('div', { class: 'lab-controls' }, [sl.el]), el('div', { class: 'lab-readout' }, [roP.el, roG.el, roU.el]),
          el('p', { class: 'lab-hint', text: '"政治平等"线是示意：1994 年前全国议会选举只对白人开放（1984–94 年有色人和印度裔另设议院，黑人多数始终没有全国投票权），1994 年后所有成年公民一人一票。经济平等线 = 100 − 基尼系数，基尼来自世界银行各年调查（0–100 表示），各年调查口径不完全一致，只宜看量级；世界银行 2018 年报告给出约 0.63（2015），称为世界最高之一。失业率为 15 岁以上官方口径（国际劳工组织估算），2000 年前口径不同，未画出。' }));
        const land = el('div', { class: 'mandela-landbox' }, [
          el('h4', { text: '土地：法律废除之后' }),
          el('div', { class: 'mandela-landrow' }, [el('span', { text: '个人名下的农地中白人所占比例（2017 年政府土地审计，按估算的种族归属）' }), el('div', { class: 'mandela-hbar' }, [el('i', { style: 'width:72%;background:var(--s2)' }), el('b', { text: '约 72%' })])]),
          el('div', { class: 'mandela-landrow' }, [el('span', { text: '1994 年定下的再分配目标（30% 商业农地）完成度：到 2010 年代末经再分配与归还约 820 万公顷' }), el('div', { class: 'mandela-hbar' }, [el('i', { style: 'width:33%;background:var(--s1)' }), el('b', { text: '约三分之一' })])]),
          el('p', { class: 'lab-hint', text: '审计的种族数据是间接推算的，可能有偏差；白人约占人口 7–8%（2020 年代）。' }),
        ]);
        const people = el('div', { class: 'mandela-people' }, [
          el('div', {}, [el('h4', { text: '曼德拉之后' }), el('p', { text: '1994–1999 年任总统，只做一届就交出权力，这在当时的非洲和世界都引人注目。卸任后投入艾滋病防治和儿童事务。2013 年 12 月去世，终年 95 岁。他的遗产在南非国内也有争论：有人认为他在经济问题上对旧秩序让步太多。' })]),
          el('div', {}, [el('h4', { text: '德克勒克之后' }), el('p', { text: '1994 年任副总统；1996 年新宪法通过后，他带领国民党退出民族团结政府，次年退出政坛。他在真相与和解委员会为种族隔离道歉，但否认知情或授权安全部门的杀戮，委员会对此不予采信。2020 年他在采访中否认种族隔离属于"反人类罪"，引起强烈批评，随后道歉撤回。2021 年 11 月去世，生前录制的视频再次为种族隔离道歉。1993 年的联合授奖当时就有批评者认为，暴力仍在其政府治下持续，不应与曼德拉并列。' })]),
        ]);
        body.append(land, people);
        function nearest(arr, y) { let best = null; arr.forEach((p) => { if (p[0] <= y) best = p; }); return best; }
        function info() {
          roP.set(year < 1994 ? '黑人多数没有全国投票权' : (MILES.filter((m) => m[0] <= year).pop() || [0, ''])[1]);
          const gg = nearest(GINI, year); roG.set(gg ? `${(gg[1] / 100).toFixed(2)}（${gg[0]}）` : '—');
          const u = UNEMP.find((p) => p[0] === year); roU.set(u ? u[1].toFixed(1) + '%' : '—（口径不同）');
        }
        function draw() {
          const g = cv.g, W = cv.w, Hh = cv.h;
          g.clearRect(0, 0, W, Hh); g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
          const narrow = W < 520;
          const showP = mode !== 'eco', showE = mode !== 'pol';
          // legend layout first, so the plot leaves room for it
          g.font = `11px ${col('--body-font') || 'sans-serif'}`; g.textBaseline = 'middle'; g.textAlign = 'left';
          const items = [];
          if (showP) items.push(['--s1', '政治平等：投票权（示意，0–100）']);
          if (showE) items.push(['--s4', '经济平等：100 − 基尼系数（越高越平等）'], ['--s2', '官方失业率 %']);
          if (showP && showE) items.push(['--warn', '两者之间的差距']);
          const pos = []; let lx = 36, ly = 10;
          items.forEach(([c, lab]) => { const w = 16 + g.measureText(lab).width + 12; if (lx + w > W - 6 && lx > 36) { lx = 36; ly += 15; } pos.push([c, lab, lx, ly]); lx += w; });
          const ax = H.axes(g, W, Hh, { x0: 1990, x1: 2025, y0: 0, y1: 100, pad: { l: 34, r: 12, t: ly + 16, b: 30 }, xTicks: narrow ? [1990, 2000, 2010, 2020] : [1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025], yTicks: [0, 25, 50, 75, 100] }, col);
          g.strokeStyle = col('--muted'); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(ax.X(year), ax.p.t); g.lineTo(ax.X(year), ax.p.t + ax.ih); g.stroke(); g.setLineDash([]);
          const EQ = GINI.map((p) => [p[0], 100 - p[1]]);
          if (showP && showE) { // gap between political equality (100 after 1994) and economic equality (100 − Gini)
            const pts = EQ.map((p) => [Math.max(1994, p[0]), p[1]]); pts.push([2025, pts[pts.length - 1][1]]);
            g.save(); g.globalAlpha = 0.13; g.fillStyle = col('--warn'); g.beginPath();
            g.moveTo(ax.X(1994), ax.Y(100)); g.lineTo(ax.X(2025), ax.Y(100));
            for (let i = pts.length - 1; i >= 0; i--) g.lineTo(ax.X(pts[i][0]), ax.Y(pts[i][1]));
            g.closePath(); g.fill(); g.restore();
            const xm = ax.X(2009), ym = (ax.Y(100) + ax.Y(EQ[4][1])) / 2;
            g.fillStyle = col('--warn'); g.textAlign = 'center'; g.fillText('差距', xm, ym);
          }
          if (showP) {
            g.strokeStyle = col('--s1'); g.lineWidth = 2.5; g.beginPath(); POL.forEach((p, i) => { const x = ax.X(p[0]), y = ax.Y(p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
            MILES.forEach((m) => { g.fillStyle = col('--panel'); g.strokeStyle = col('--s1'); g.lineWidth = 1.5; g.beginPath(); g.arc(ax.X(m[0]), ax.Y(100), 3.5, 0, 7); g.fill(); g.stroke(); });
          }
          if (showE) {
            g.strokeStyle = col('--s2'); g.lineWidth = 2; g.beginPath(); UNEMP.forEach((p, i) => { const x = ax.X(p[0]), y = ax.Y(p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
            g.strokeStyle = col('--s4'); g.lineWidth = 1.5; g.setLineDash([3, 3]); g.beginPath(); EQ.forEach((p, i) => { const x = ax.X(p[0]), y = ax.Y(p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]);
            g.fillStyle = col('--s4'); EQ.forEach((p) => { g.beginPath(); g.arc(ax.X(p[0]), ax.Y(p[1]), 4, 0, 7); g.fill(); });
          }
          g.textAlign = 'left';
          pos.forEach(([c, lab, x, y]) => { g.fillStyle = col(c); g.fillRect(x, y - 2, 11, 4); g.fillStyle = col('--muted'); g.fillText(lab, x + 15, y); });
        }
        function maybeUnlock() {
          if (touched >= 2) api.unlock('<p>政治平等是一个<b>开关</b>：1994 年 4 月 27 日之前没有，之后有，此后三十年的定期选举和 2024 年的和平权力重组说明这个开关至今仍然打开着。经济平等则是一个<b>存量</b>：它由几代人的土地、住房、教育和资本积累决定，种族隔离的法律可以一天废除，它留下的存量却只能一点一点改变。</p><p>这也是谈判的一部分代价与逻辑：为了让旧政权交出政治权力，新宪法保护了既有财产权，并承诺公务员的饭碗。这个交换避免了内战，也让经济结构的改变注定缓慢。如何评价这笔交易，南非社会至今争论不休。</p>');
        }
        cv.onResize(draw); redraws.add(draw);
        draw(); info();
        return { destroy() { cv.destroy(); }, shown() { draw(); } };
      }

      /* =================== Chapter 5: why two people =================== */
      function ch5(body, api) {
        body.append(P('诺贝尔委员会没有说两人在道德上等量齐观。和平奖奖励的是一种行为：<b>和敌人谈判，并且把谈判坚持到底</b>。值得注意的是，奖项在 1993 年 10 月颁出，比选举早半年——它既是表彰，也是在为一个尚未完成的过程押注。'));
        const STEPS = [
          { y: '1990 年以前', t: '一方在牢里，一方在台上；一方被政府称为恐怖分子，一方被对方视为压迫者。中间隔着一堵墙。', L: 30, R: 570, rotL: 0, rotR: 0, wall: 1 },
          { y: '1990 年 2 月', t: '解禁与释放。两把椅子第一次搬进同一个房间，但离桌子还很远。', L: 90, R: 510, rotL: 0, rotR: 0 },
          { y: '1991 年 12 月', t: 'CODESA。坐到了同一张桌边——开幕当天就当众争吵。', L: 190, R: 410, rotL: 0, rotR: 0 },
          { y: '1992 年 6 月', t: '博伊帕通之后，一方离席。桌子还在，椅子空了一把。', L: 70, R: 410, rotL: 0, rotR: 0 },
          { y: '1992 年 9 月 – 1993 年', t: '《谅解记录》、落日条款、确定选举日期：回到桌边，谈的不再是要不要交接，而是怎么交接。', L: 200, R: 400, rotL: 0, rotR: 0 },
          { y: '1993 年 10 月', t: '诺贝尔委员会把和平奖同时授予两人。领奖时两人各自发表演讲，彼此之间仍然冷淡。', L: 200, R: 400, rotL: 0, rotR: 0, medal: 1 },
          { y: '1994 年 4 月', t: '桌子换成了投票箱。两人都站到了选民面前。', L: 200, R: 400, rotL: 0, rotR: 0, medal: 1, ballot: 1 },
        ];
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 600 230'); svg.setAttribute('class', 'mandela-svg'); svg.setAttribute('role', 'img');
        const mk = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); parent.append(e); return e; };
        mk('line', { x1: 10, y1: 190, x2: 590, y2: 190, class: 'm-floor' });
        const wall = mk('rect', { x: 296, y: 30, width: 8, height: 160, class: 'm-wall' });
        const table = mk('g', { class: 'm-table' });
        mk('rect', { x: 245, y: 120, width: 110, height: 8, rx: 2 }, table); mk('rect', { x: 255, y: 128, width: 6, height: 62 }, table); mk('rect', { x: 339, y: 128, width: 6, height: 62 }, table);
        const ballot = mk('g', { class: 'm-ballot' });
        mk('rect', { x: 265, y: 120, width: 70, height: 70, rx: 3 }, ballot); mk('rect', { x: 285, y: 126, width: 30, height: 4, class: 'm-slot' }, ballot);
        mk('rect', { x: 290, y: 104, width: 22, height: 26, class: 'm-paper' }, ballot);
        function chair(cls, label, facing) {
          const g = mk('g', { class: 'm-chair ' + cls });
          const inner = mk('g', {}, g);
          // seat, back (on the outer side), legs; drawn around x=0
          mk('rect', { x: -22, y: 140, width: 44, height: 7, rx: 2 }, inner);
          mk('rect', { x: facing > 0 ? -22 : 16, y: 92, width: 6, height: 55, rx: 2 }, inner);
          mk('rect', { x: -20, y: 147, width: 5, height: 43 }, inner); mk('rect', { x: 15, y: 147, width: 5, height: 43 }, inner);
          const medal = mk('circle', { cx: 0, cy: 118, r: 9, class: 'm-medal' }, g);
          const t = mk('text', { x: 0, y: 212, 'text-anchor': 'middle', class: 'm-lab' }, g); t.textContent = label;
          return { g, inner, medal };
        }
        const cL = chair('l', '曼德拉 · 非国大', 1), cR = chair('r', '德克勒克 · 国民党', -1);
        const cap = el('div', { class: 'mandela-effect', 'aria-live': 'polite' });
        let si = 0, seen = new Set([0]);
        const range = el('input', { type: 'range', min: 0, max: STEPS.length - 1, step: 1, value: 0, 'aria-label': '时间', class: 'mandela-range' });
        range.addEventListener('input', () => setStep(+range.value));
        const prevB = H.button({ label: '←', onClick: () => setStep(Math.max(0, si - 1)) }), nextB = H.button({ label: '下一步 →', kind: 'primary', onClick: () => setStep(Math.min(STEPS.length - 1, si + 1)) });
        const stage = el('div', { class: 'mandela-svgwrap' + (reduced ? ' still' : '') }, [svg]);
        body.append(stage, el('div', { class: 'mandela-svgctl' }, [prevB, range, nextB]), cap);
        function setStep(i) {
          si = i; seen.add(i); range.value = i;
          const S = STEPS[i];
          cL.g.style.transform = `translate(${S.L}px,0)`; cR.g.style.transform = `translate(${S.R}px,0)`;
          cL.g.classList.toggle('empty', i === 3);
          wall.style.opacity = S.wall ? 1 : 0; table.style.opacity = S.ballot ? 0 : 1; ballot.style.opacity = S.ballot ? 1 : 0;
          [cL, cR].forEach((c) => (c.medal.style.opacity = S.medal ? 1 : 0));
          cap.innerHTML = `<b>${S.y}</b>　${S.t}`;
          svg.setAttribute('aria-label', S.y + '：' + S.t);
          prevB.disabled = i === 0; nextB.disabled = i === STEPS.length - 1;
          if (seen.size >= STEPS.length - 1) unlockCmp();
        }
        // comparison of joint prizes to former adversaries
        const PAIRS = [
          { k: '1973', who: '基辛格 与 黎德寿', what: '1973 年 1 月《巴黎和平协定》（越南战争）', after: ['黎德寿拒绝领奖，理由是和平尚未实现', '战事继续，1975 年 4 月西贡陷落'], now: '协定未能带来持久和平' },
          { k: '1978', who: '萨达特 与 贝京', what: '1978 年戴维营协议；1979 年埃及–以色列和约', after: ['1982 年西奈半岛归还埃及', '1981 年萨达特遇刺'], now: '和约延续至今（常被称为"冷和平"）' },
          { k: '1993', who: '曼德拉 与 德克勒克', what: '1990–93 年谈判；1993 年临时宪法', after: ['1994 年首次全民普选', '1996 年新宪法；此后定期选举与和平交接'], now: '宪政民主延续；经济不平等仍是核心问题' },
          { k: '1994', who: '阿拉法特、佩雷斯 与 拉宾', what: '1993 年奥斯陆协议', after: ['1994 年巴勒斯坦权力机构成立', '1995 年拉宾遇刺；2000 年最终地位谈判失败，第二次因提法达爆发'], now: '最终地位协议从未达成' },
          { k: '1998', who: '休姆 与 特林布尔', what: '1998 年贝尔法斯特（耶稣受难日）协议（北爱尔兰）', after: ['分权政府多次停摆（如 2002–07、2017–20、2022–24 年）', '准军事组织的大规模暴力基本结束'], now: '协议框架延续至今' },
        ];
        const cmp = el('div', { class: 'mandela-cmpwrap', hidden: true });
        body.append(cmp);
        function unlockCmp() {
          if (!cmp.hidden) return;
          cmp.hidden = false;
          const panel = el('div', { class: 'mandela-cmp', 'aria-live': 'polite' });
          const sel = H.choice({ label: '其他颁给昔日对手的和平奖', options: PAIRS.map((p) => ({ value: p.k, label: p.k })), value: '1993', onChange: (v) => show(v) });
          const tbl = el('div', { class: 'dtable' }, [el('table', {}, [
            el('thead', {}, [el('tr', {}, ['年份', '获奖者', '之后', '现状'].map((h) => el('th', { text: h })))]),
            el('tbody', {}, PAIRS.map((p) => el('tr', {}, [el('td', { text: p.k }), el('td', { text: p.who }), el('td', { text: p.after[0] }), el('td', { text: p.now })]))),
          ])]);
          cmp.append(el('h4', { text: '把和平奖颁给昔日对手：结果各不相同' }), sel.el, panel, tbl);
          function show(k) {
            const p = PAIRS.find((q) => q.k === k);
            panel.innerHTML = '';
            panel.append(el('div', { class: 'mandela-cmp-h' }, [el('b', { text: `${p.k} · ${p.who}` })]), el('p', { text: p.what }), el('ul', { class: 'mandela-list' }, p.after.map((a) => el('li', { text: a }))), el('p', { class: 'mandela-small', text: '现状：' + p.now }));
            api.unlock('<p>把奖同时颁给两个昔日的敌人，从来都有争议：它看起来像是在说双方同样值得赞扬。1993 年的批评者正是这样看的。但委员会表彰的不是人品，而是一个结构性的事实：<b>只有一方愿意，和平谈判就不可能</b>。曼德拉必须说服一个被压迫了几十年的多数暂时放下枪，德克勒克必须说服一个享有特权的少数交出权力；两人都冒着被自己人抛弃的风险。</p><p>表格里的结果提醒人们，这样的奖是一种押注。有的押中了，有的没有——差别往往不在颁奖那一刻，而在之后：承诺有没有变成制度，搅局者有没有被孤立，基本盘有没有跟上。南非的过渡之所以被记住，是因为选举真的如期举行，权力真的和平交接，而这一切在 1993 年 10 月时还远未确定。</p>');
          }
          show('1993');
        }
        setStep(0);
        return {};
      }

      open(0);
      return { destroy() { built.forEach((b) => { try { b.handle && b.handle.destroy && b.handle.destroy(); } catch (e) {} }); cleanups.forEach((f) => f()); } };
    },
  };

  const CSS = `
.mandela [hidden] { display: none !important; }
.mandela .lab-readout { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
.mandela .mandela-host { min-width: 0; }
.mandela-ch { padding: 14px; display: grid; gap: 12px; min-width: 0; }
.mandela-ch > * { min-width: 0; max-width: 100%; }
.mandela-chhead { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.mandela-k { font-family: var(--mono-font); font-size: 11px; letter-spacing: .14em; color: var(--accent); }
.mandela-chhead h3 { font-family: var(--cjk-display); font-size: 20px; margin: 0; }
.mandela-body { display: grid; gap: 12px; min-width: 0; }
.mandela-body > * { min-width: 0; max-width: 100%; }
.mandela-p { margin: 0; font-size: 14.5px; line-height: 1.8; max-width: 46em; }
.mandela-p b { color: var(--fg); }
.mandela-reflect { border-left: 3px solid var(--accent); background: var(--bg2); border-radius: 0 8px 8px 0; padding: 10px 14px; font-size: 14px; line-height: 1.8; }
.mandela-reflect > b { display: block; font-family: var(--cjk-display); color: var(--accent); margin-bottom: 4px; }
.mandela-reflect p { margin: 0 0 8px; } .mandela-reflect p:last-child { margin: 0; }
.mandela-foot { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; border-top: 1px solid var(--line); padding-top: 10px; }
.mandela-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12.5px; color: var(--muted); }
.mandela-legend span { display: inline-flex; align-items: center; gap: 6px; }
.mandela-legend i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.mandela-laws .seg { text-align: left; }
.mandela-laws .seg b { font-family: var(--mono-font); font-weight: 600; }
.mandela-effect { font-size: 14px; line-height: 1.75; padding: 10px 12px; border-radius: 8px; background: var(--bg2); min-height: 3.6em; }
.mandela-effect b { color: var(--accent); }
.mandela-edu { display: grid; gap: 6px; }
.mandela-edu-h { font-size: 12.5px; color: var(--muted); }
.mandela-edu-row { display: grid; grid-template-columns: 4.6em minmax(0, 1fr); gap: 8px; align-items: center; font-size: 12px; }
.mandela-edu-y { font-family: var(--mono-font); color: var(--muted); }
.mandela-edu-bars { display: grid; gap: 3px; }
.mandela-edu-bar { height: 16px; border-radius: 3px; position: relative; min-width: 4px; }
.mandela-edu-bar span { position: absolute; left: 6px; top: 0; line-height: 16px; color: var(--bg); font-size: 11px; white-space: nowrap; font-weight: 600; }
.mandela-edu-bar span.out { left: calc(100% + 6px); color: var(--fg); font-weight: 400; }
.mandela-tagline { margin: 0; font-size: 13px; color: var(--muted); }
.mandela-badge { display: inline-block; font-size: 11px; font-family: var(--body-font); padding: 0 7px; border-radius: 999px; border: 1px solid var(--accent); color: var(--accent); line-height: 1.6; vertical-align: 1px; white-space: nowrap; }
.mandela-game { display: grid; gap: 12px; min-width: 0; }
.mandela-game > * { min-width: 0; }
.mandela-roles { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; }
.mandela-role { font: inherit; text-align: left; display: grid; gap: 4px; padding: 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); cursor: pointer; font-size: 13.5px; line-height: 1.6; }
.mandela-role:hover { border-color: var(--accent); }
.mandela-role b { font-family: var(--cjk-display); font-size: 20px; }
.mandela-role-sub { color: var(--accent); font-size: 12.5px; }
.mandela-seed { font-size: 12.5px; color: var(--muted); }
.mandela-gtop { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 6px 12px; }
.mandela-gmeta { font-size: 12px; color: var(--muted); }
.mandela-tl { list-style: none; display: flex; gap: 4px; padding: 0; margin: 0; flex-wrap: wrap; }
.mandela-tl li { width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--line); display: grid; place-items: center; font-family: var(--mono-font); font-size: 10.5px; color: var(--muted); }
.mandela-tl li.done { background: var(--muted); color: var(--bg); border-color: var(--muted); }
.mandela-tl li.cur { border-color: var(--accent); color: var(--accent); border-width: 2px; }
.mandela-meters { display: grid; gap: 5px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); }
.mandela-meter { display: grid; grid-template-columns: minmax(0, 18em) minmax(60px, 1fr) 5.4em; gap: 8px; align-items: center; font-size: 12.5px; }
.mandela-meter-n { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mandela-meter-bar { height: 9px; border-radius: 5px; background: var(--grid); overflow: hidden; display: block; }
.mandela-meter-bar i { display: block; height: 100%; border-radius: 5px; transition: width .5s; }
.mandela-meter-v { font-family: var(--mono-font); font-variant-numeric: tabular-nums; font-size: 12px; text-align: right; white-space: nowrap; }
.mandela-meter.danger .mandela-meter-n, .mandela-meter.danger .mandela-meter-v { color: var(--warn); }
@media (max-width: 560px) {
  .mandela-meter { grid-template-columns: minmax(0, 1fr) 5.4em; }
  .mandela-meter-bar { grid-column: 1 / -1; grid-row: 2; }
}
.mandela-round, .mandela-ending { display: grid; gap: 8px; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--line); }
.mandela-round > *, .mandela-ending > * { min-width: 0; }
.mandela-round h4, .mandela-ending h4 { font-family: var(--cjk-display); font-size: 19px; margin: 0; }
.mandela-round p, .mandela-ending p { margin: 0; font-size: 14px; line-height: 1.75; }
.mandela-date { font-family: var(--mono-font); font-size: 11.5px; color: var(--accent); letter-spacing: .06em; }
.mandela-choices { display: grid; gap: 6px; }
.mandela-choice { font: inherit; font-size: 14px; text-align: left; display: flex; gap: 10px; align-items: flex-start; padding: 9px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); cursor: pointer; line-height: 1.55; }
.mandela-choice:hover { border-color: var(--accent); }
.mandela-choice-k { font-family: var(--mono-font); color: var(--accent); font-weight: 600; flex: none; }
.mandela-picked b { color: var(--fg); }
.mandela-note { font-size: 13.5px; line-height: 1.65; padding: 6px 10px; border-radius: 6px; border-left: 3px solid var(--muted); background: var(--bg2); }
.mandela-note.good { border-left-color: var(--good); } .mandela-note.bad { border-left-color: var(--warn); }
.mandela-note b { color: var(--accent); font-family: var(--mono-font); font-weight: 600; font-size: 12px; }
.mandela-lesson { font-size: 13.5px; line-height: 1.7; }
.mandela-lesson b { color: var(--accent); }
.mandela-hist { border: 1px dashed var(--line); border-radius: 8px; padding: 6px 12px; }
.mandela-hist summary { cursor: pointer; font-size: 13px; color: var(--accent); }
.mandela-hist p { margin: 6px 0 4px; font-size: 13.5px; }
.mandela-gnav { display: flex; flex-wrap: wrap; gap: 6px; }
.mandela-ending { border-width: 2px; }
.mandela-ending.win { border-color: var(--good); } .mandela-ending.war, .mandela-ending.coup, .mandela-ending.ousted { border-color: var(--warn); } .mandela-ending.stall { border-color: var(--muted); }
.mandela-small { font-size: 12.5px !important; color: var(--muted); margin: 0; }
.mandela-traj-h { font-size: 12.5px; color: var(--muted); }
.mandela-cases { display: grid; gap: 10px; }
.mandela-case { display: grid; gap: 8px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; }
.mandela-case > * { min-width: 0; }
.mandela-case p { margin: 0; font-size: 14px; line-height: 1.75; }
.mandela-case-h { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: baseline; }
.mandela-case-h b { font-family: var(--cjk-display); font-size: 16px; }
.mandela-case-res { display: grid; gap: 6px; border-top: 1px solid var(--line); padding-top: 8px; }
.mandela-crit { display: flex; flex-wrap: wrap; gap: 6px; }
.mandela-crit span { font-size: 12.5px; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--line); }
.mandela-crit span.ok { border-color: var(--good); } .mandela-crit span.no { border-color: var(--warn); } .mandela-crit span.q { border-style: dashed; }
.mandela-crit span.ok b { color: var(--good); } .mandela-crit span.no b { color: var(--warn); } .mandela-crit span.q b { color: var(--muted); }
.mandela-fam { color: var(--muted); font-size: 13.5px !important; }
.mandela-fam b { color: var(--fg); }
.mandela-stats { display: grid; gap: 10px; }
.mandela-stats h4, .mandela-landbox h4, .mandela-people h4, .mandela-cmpwrap h4 { font-family: var(--cjk-display); font-size: 16px; margin: 0; }
.mandela-waffle { display: grid; grid-template-columns: repeat(20, 1fr); gap: 3px; max-width: 420px; }
.mandela-waffle i { aspect-ratio: 1; border-radius: 2px; display: block; }
.mandela-legend span i { border-radius: 2px; }
.mandela-list { margin: 0; padding-left: 1.2em; font-size: 13.5px; line-height: 1.75; }
.mandela-list li { margin-bottom: 4px; }
.mandela-landbox { display: grid; gap: 8px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; }
.mandela-landrow { display: grid; gap: 4px; font-size: 13px; }
.mandela-hbar { display: flex; align-items: center; gap: 8px; height: 14px; }
.mandela-hbar i { display: block; height: 100%; border-radius: 3px; }
.mandela-hbar b { font-family: var(--mono-font); font-size: 12px; font-weight: 600; white-space: nowrap; }
.mandela-people { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
.mandela-people > div { padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; }
.mandela-people p { margin: 6px 0 0; font-size: 13.5px; line-height: 1.75; }
.mandela-svgwrap { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
.mandela-svg { display: block; width: 100%; height: auto; }
.mandela-svg .m-floor { stroke: var(--line); stroke-width: 2; }
.mandela-svg .m-wall { fill: var(--muted); transition: opacity .6s; }
.mandela-svg .m-table rect { fill: var(--muted); }
.mandela-svg .m-table, .mandela-svg .m-ballot { transition: opacity .6s; }
.mandela-svg .m-ballot rect { fill: var(--accent); }
.mandela-svg .m-ballot .m-slot { fill: var(--panel); }
.mandela-svg .m-ballot .m-paper { fill: var(--fg); }
.mandela-svg .m-chair { transition: transform .8s cubic-bezier(.4,.1,.2,1); }
.mandela-svg .m-chair.l rect { fill: var(--s1); } .mandela-svg .m-chair.r rect { fill: var(--s2); }
.mandela-svg .m-chair.empty rect { fill: none; stroke: var(--s1); stroke-dasharray: 3 3; }
.mandela-svg .m-medal { fill: var(--accent); transition: opacity .6s; }
.mandela-svg .m-lab { fill: var(--fg); font-size: 13px; font-family: var(--body-font); }
.mandela-svgwrap.still .m-chair, .mandela-svgwrap.still .m-wall, .mandela-svgwrap.still .m-table, .mandela-svgwrap.still .m-ballot, .mandela-svgwrap.still .m-medal { transition: none; }
.mandela-svgctl { display: flex; align-items: center; gap: 8px; }
.mandela-range { flex: 1; min-width: 0; accent-color: var(--accent); }
.mandela-cmpwrap { display: grid; gap: 10px; }
.mandela-cmp { padding: 10px 12px; border-radius: 8px; background: var(--bg2); display: grid; gap: 4px; }
.mandela-cmp p { margin: 0; font-size: 13.5px; }
.mandela-cmp-h b { font-family: var(--cjk-display); font-size: 15px; }
.mandela-cmpwrap .dtable td, .mandela-cmpwrap .dtable th { text-align: left; white-space: normal; min-width: 7em; vertical-align: top; }
.mandela-cmpwrap .dtable td:first-child { min-width: 3em; font-family: var(--mono-font); }
.mandela-cmpwrap .dtable table { min-width: 560px; }
`;
})();
