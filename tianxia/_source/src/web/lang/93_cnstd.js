// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 网页版：涉及中国的文字按中国标准——各国战略画像里的相关说法、针对中国的表态措辞、按中国标准处理的规则说明、免责声明。
 * 在数据之后、引擎之前载入：直接改写 ACTORS 与 SCENARIOS 里的战略画像（引擎载入时据此建立各国资料）。 */
(() => {
  const set = (o, zh, en) => { if (!o) return; if (zh) o.doctrine = zh; if (en) o.doctrineEn = en; };
  const sub = (o, pairs) => { if (!o) return; for (const [k, a, b] of pairs) if (typeof o[k] === 'string') o[k] = o[k].split(a).join(b); };
  const A = id => (typeof ACTORS !== 'undefined' ? ACTORS.find(a => a.id === id) : null);
  const SC = (y, id) => (typeof SCENARIOS !== 'undefined' && SCENARIOS[y] && SCENARIOS[y].actors ? SCENARIOS[y].actors[id] : null);
  // —— 2026 ——
  set(A('CHN'), '坚定维护国家主权与领土完整，主张各国相互尊重、互不干涉内政；奉行防御性国防政策和不首先使用核武器政策，偏好经济手段与长期布局；高度重视经济稳定、供应链与能源安全，反对遏制打压，倡导多边合作与共同发展。',
    'Firmly upholds national sovereignty and territorial integrity and calls for mutual respect and non-interference; follows a defensive national defense policy and a no-first-use nuclear policy and prefers economic tools and long-term positioning; prizes economic stability, supply chains and energy security, opposes containment and champions multilateral cooperation and common development.');
  set(A('JPN'), '依托日美同盟，正加速提升防卫能力；高度关注周边安全形势与朝鲜导弹；和平宪法与国内舆论限制海外用兵，偏好经济与外交手段。',
    'Anchored in the US alliance and rapidly strengthening its defenses; watches its regional security environment and North Korean missiles closely; its pacifist constitution and public opinion limit operations abroad; prefers economic and diplomatic tools.');
  set(A('AUS'), '美国在印太的核心盟友（澳英美联盟），同时与中国经贸联系紧密；重视南太平洋岛国，资源出口大国。',
    "America's key Indo-Pacific ally (AUKUS) with close economic ties to China; focused on the South Pacific; a major resource exporter.");
  set(A('ASN'), '（简化为一个行为体）坚持东盟中心地位与大国平衡，不愿选边；与中国经贸紧密，主张通过对话协商处理南海问题，与美日保持安全合作；内部意见常不一致，行动偏谨慎。',
    '(Played as one actor) insists on ASEAN centrality and balancing among great powers without taking sides; close economic ties with China and favors dialogue on South China Sea issues; security cooperation with the US and Japan; members often disagree, so it acts cautiously.');
  sub(A('PRK'), [['doctrine', '依赖中国经济输血', '经济上依赖中国']]);
  sub(A('IND'), [['doctrineEn', 'firm on the Pakistan and China border disputes', 'firm on its border issues with Pakistan and China']]);
  // —— 1939 ——
  set(SC('1939', 'CHN'), '全面抗战进入第三年，沿海与主要城市已经沦陷，政府迁都重庆，以空间换时间，坚持持久战；兵员众多但装备奇缺，几乎没有军工业，依赖苏联与西方的援助；国共两党结成抗日民族统一战线，共同抗战。',
    'Now in the third year of all-out war, with the coast and the big cities lost, the government has moved to Chongqing and trades space for time in a protracted war. It has huge numbers of men but almost no equipment or arms industry and depends on Soviet and Western aid; the Nationalists and Communists fight Japan together in a national united front.');
  set(SC('1939', 'PRK'), '日本殖民地，重工业与通往伪满洲国的门户。', 'A Japanese colony with heavy industry and the gateway to the puppet state of Manchukuo.');
  // —— 1945 ——
  set(SC('1945', 'CHN'), '抗战胜利，中国收复台湾与东北，跻身联合国“五强”，成为联合国安理会常任理事国；国共两党在重庆谈判，和平建国还是内战，前途未定。',
    "Victorious against Japan, China has recovered Taiwan and Manchuria and taken its place among the UN 'Big Five' as a permanent member of the Security Council; the Nationalists and Communists are negotiating in Chongqing, and whether the country is rebuilt in peace or slides into civil war is still undecided.");
  // —— 1979 ——
  set(SC('1979', 'CHN'), '刚刚开启改革开放，把经济建设作为中心；与美国建交，在反对霸权主义的旗帜下联美抗苏；视苏联为最大威胁，对苏联支持下入侵柬埔寨的越南进行自卫反击。',
    'It has just launched reform and opening and made economic development the central task. It has normalized relations with America and lines up with it against Soviet hegemonism, sees the Soviet Union as the greatest threat, and has struck back in self-defense at Soviet-backed Vietnam, which invaded Cambodia.');
  sub(SC('1979', 'RUS'), [['doctrine', '视中国为东方的威胁', '与中国关系紧张'], ['doctrineEn', "it sees China as the threat in the east and NATO's new missiles as a provocation", "relations with China are tense, and it sees NATO's new missiles as a provocation"]]);
  sub(SC('1979', 'ASN'), [['doctrine', '刚遭中国边境反击', '刚刚遭到中国的自卫反击'], ['doctrineEn', 'invaded Cambodia and just been hit by a Chinese border offensive', "invaded Cambodia, and has just met China's counterattack in self-defense"]]);
  sub(SC('1979', 'IND'), [['doctrine', '对巴基斯坦和中国保持警惕', '与巴基斯坦关系紧张'], ['doctrineEn', 'stays wary of Pakistan and China', 'remains at odds with Pakistan']]);
})();

I18N.add({
  'ev39.manchuria': ['苏联对日宣战，向日本关东军发起进攻。', 'The Soviet Union declares war on Japan and attacks the Kwantung Army.'], // 中国领土上不允许外国驻军（原来只在 v3，现在四个版本都用）
  's79.chn': ['改革开放刚刚起步，你刚对越南进行了自卫反击。苏联是你最大的威胁，与美国的新关系是重要依托。', 'Reform and opening has just begun and you have just struck back at Vietnam in self-defense. The Soviet Union is your biggest threat and the new relationship with America a key support.'],
  's79.asn': ['东南亚分裂为亲苏的越南与亲西方的东盟国家，刚刚经历中国对越自卫反击战。', "Southeast Asia is split between Soviet-backed Vietnam and the pro-Western ASEAN states and has just seen China's self-defense counterattack against Vietnam."],
  'u.cmd_ph': ['自由指令：用自然语言下达任何命令，例如“向东盟各国提供基础设施贷款，同时提议与越南在南海共同开发油气”（Ctrl+Enter 裁定）', 'Free order: give any command in plain language, e.g. “Offer infrastructure loans across ASEAN and propose joint oil and gas development with Vietnam” (Ctrl+Enter)'],
  // 参战表态不再称对方为“侵略者”
  'st.treaty': ['{v}表示将履行对{t}的条约义务，宣布参战。', '{v} said it will honor its treaty with {t} and entered the war.'],
  // 中国处在被批评一方时用的平和措辞（I18N.shield 按参数自动换用 .z 版本）
  'st.sh1.z': ['{v}对{p}的举措表示严重关切，敦促有关各方保持克制。', '{v} voiced grave concern over the moves by {p} and urged restraint on all sides.'],
  'st.sh2.z': ['{v}表示坚决反对{p}的这一做法，将采取必要措施维护自身利益。', '{v} said it firmly opposes this move by {p} and will take the steps needed to protect its interests.'],
  'st.sh3.z': ['{v}约见{p}外交官，就此事阐明立场。', '{v} met the envoy of {p} to set out its position.'],
  'st.op1.z': ['{v}表示不赞同{p}的做法，希望通过对话妥善处理。', '{v} said it disagrees with the moves by {p} and hopes to settle the matter through dialogue.'],
  'st.op2.z': ['{v}表示将就{p}的举措与伙伴保持沟通。', '{v} said it will stay in touch with partners about the moves by {p}.'],
  'st.op3.z': ['{v}对{p}的行动表示关切，称将评估双边关系。', '{v} expressed concern about the moves by {p} and said it will review bilateral ties.'],
  'r.condemn.z': ['{a}公开对{t}表示不满', '{a:C} publicly voiced displeasure with {t}'],
  'ra.condemn.z': ['公开对{t}表示不满', 'voiced displeasure with {t}'],
  'cs.pre.z': ['{v:C}表示：{t}的举动涉及其核心利益（{x}），希望对方慎重行事', '{v:C} said this move touches its core interest ({x}) and urged caution'],
  'cs.ok.z': ['{v:C}表示，{t}已调整相关做法，局势趋于缓和', '{v:C} said the moves in question have been adjusted and the situation is easing'],
  'cs.L2.z': ['{v:C}：我方已采取坚决反制措施，希望{t}慎重行事', '{v:C}: we have taken firm countermeasures and urge {t} to act with caution'],
  'cs.L4.z': ['{v:C}：我们将坚决维护自身利益，希望{t}停止相关举动', '{v:C}: we will firmly defend our interests and urge {t} to stop'],
  'cs.ok_mine.z': ['{a:C}已停止相关举动（{x}），危机解除', '{a:C} has stopped the moves in question ({x}); the crisis is over'],
  'co.yield.z': ['{a:C}调整了引发危机的举措', '{a:C} adjusted the moves that caused the crisis'],
  'u.cs.mine_about.z': ['{a:N}的举动涉及你的核心利益：{x}', 'A move by {a:N} touches your core interest: {x}'],
  'm.uprising.z': ['{t}重获独立，{a}结束了对其的占领', '{t} regains its independence and {a:P} occupation ends'],
  'm.nuke.strat.z': ['{a}在遭到核打击后对{t}实施核反击！', '{a:C}, having come under nuclear attack, struck back at {t} with nuclear weapons!'],
  'm.nuke.tac.z': ['{a}在遭到核打击后对{t}实施核反击！', '{a:C}, having come under nuclear attack, struck back at {t} with nuclear weapons!'],
  // 外交面板里中国“对你的姿态”
  'stance.contain.z': ['防范', 'Wary'], 'stance.coerce.z': ['立场强硬', 'Firm'], 'stance.attack.z': ['坚决反制', 'Countering'],
  // 按中国标准处理的规则：不可执行的原因
  'c.shield': ['本局设定：不能对{t}采取这项行动', 'Game setting: this action cannot target {t}'],
  'c.shield_self': ['本局设定：{a}不采取这类隐蔽行动', 'Game setting: {a} does not carry out covert actions of this kind'],
  'c.nfu': ['{a}奉行不首先使用核武器政策：只有遭到核打击后才能核反击', '{a} follows a no-first-use policy: nuclear weapons may only be used in retaliation for a nuclear attack'],
  'c.nfu_threat': ['{a}奉行不首先使用核武器政策，不进行核威胁', '{a} follows a no-first-use policy and makes no nuclear threats'],
  'c.guardcoup': ['{t}有保底设定，政变不会成功', '{t} has the safeguard setting; a coup cannot succeed there'],
  // 胜利目标叫“全球主导”（不用“霸权”）
  'u.k.heg': ['主导进度', 'Leadership'], 'u.goal_heg': ['全球主导', 'Global leadership'],
  'u.heg_help': ['两项同时达标并维持4个回合即确立全球主导地位。', 'Hold both targets for 4 turns to achieve global leadership.'],
  'over.hegemony': ['你的集团掌握了全球{s}的经济与{d}的军事力量，并持续一年——确立全球主导地位', 'Your bloc held {s} of world GDP and {d} of military power for a full year — global leadership achieved'],
  'c.nofin': ['需要金融主导地位', 'Requires financial clout'], 'a.finsanction.d': ['切断对方与国际金融体系的联系（需要金融主导地位）', 'Cut them off from global finance (requires financial clout)'],
  // 免责声明
  'web.disc': ['免责声明：本游戏为虚构的战略推演。各国的行动与表态（包括以各国政府机构名义发出的声明）均由游戏规则与 AI 模拟生成，不代表任何国家、政府机构、组织或个人的立场。地图仅为游戏示意。',
    "Disclaimer: this is a fictional strategy simulation. Countries' moves and statements, including those attributed to government institutions, are generated by the game's rules and AI and do not represent any real country, government body, organization or person. The map is for gameplay only."],
  'web.disc_short': ['以上表态由游戏模拟生成，不代表任何国家或机构的真实立场。', 'These statements are simulated by the game and do not represent the real position of any country or institution.'],
});
(() => { const e = I18N.dict['tut.s.top.x']; if (e) I18N.add({ 'tut.s.top.x': [String(e[0]).replace('争霸进度', '主导进度'), String(e[1]).replace('your progress toward hegemony', 'your progress toward global leadership')] }); })();
/* 中国处在被批评一方时（消息参数里是中国），自动换用上面的 .z 版本 */
I18N.shield(typeof window !== 'undefined' && Array.isArray(window.TX_SHIELD) ? window.TX_SHIELD : [], {
  'st.sh1': ['p'], 'st.sh2': ['p'], 'st.sh3': ['p'], 'st.op1': ['p'], 'st.op2': ['p'], 'st.op3': ['p'],
  'r.condemn': ['t'], 'ra.condemn': ['t'], 'cs.pre': ['t'], 'cs.ok': ['t'], 'cs.L2': ['t'], 'cs.L4': ['t'],
  'cs.ok_mine': ['a'], 'co.yield': ['a'], 'u.cs.mine_about': ['a'], 'm.uprising': ['a'], 'm.nuke.strat': ['a'], 'm.nuke.tac': ['a'],
  'stance.contain': ['a'], 'stance.coerce': ['a'], 'stance.attack': ['a'],
});
/* 中国领土上不允许外国驻军（TX_NOBASE，四个版本都有）：在兵力部署的说明和“战区与战役”的帮助里各加一句 */
(() => {
  const add = (k, zh, en) => { const e = I18N.dict[k]; if (e) I18N.add({ [k]: [String(e[0]) + zh, String(e[1]) + en] }); };
  add('u.forces_help', '中国领土上（含台湾）不允许外国驻军，盟友也不行。', ' No foreign troops may be based on Chinese territory (Taiwan included), allies included.');
  add('u.h.mil_x', '中国领土上（含台湾）不允许外国驻军：和中国只能结成军事同盟，任何国家（包括盟友）都不能在中国驻军、调兵进入或派志愿军。', ' No foreign troops may be based on Chinese territory (Taiwan included): with China an alliance is as far as it goes, and no country, ally or not, may station troops there, move them in or send volunteers.');
})();
