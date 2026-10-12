/* humanities/marquez.js — 马孔多，一百年
 * Gabriel García Márquez, Nobel Prize in Literature 1982.
 * Five chapters: magical realism as a change of viewpoint; cyclical time & names; the insomnia plague
 * (memory and language); the banana company and the 1928 massacre (history and erasure); solitude,
 * the Nobel lecture and the book's afterlife (incl. China).
 * Copyright: no quotations from the novel or from the Nobel lecture — every scene and argument below
 * is paraphrased in our own words. */
(() => {
  window.HUM = window.HUM || {};
  const ID = 'marquez';

  const CSS = `
.marquez { display: grid; min-width: 0; }
.marquez [hidden] { display: none !important; }
.marquez > * { min-width: 0; }
.marquez-banner { border-bottom: 1px solid var(--line); padding: 0 16px 14px; display: grid; gap: 4px; }
.marquez-bcv { height: 64px; margin: 0 -16px; position: relative; overflow: hidden; }
.marquez-kick { font-family: var(--mono-font); font-size: 11px; letter-spacing: .16em; color: var(--accent); }
.marquez-title { font-family: var(--cjk-display); font-weight: 900; font-size: clamp(22px, 3.2vw, 30px); margin: 0; line-height: 1.25; letter-spacing: .04em; }
.marquez-sub { margin: 0; font-size: 13.5px; color: var(--muted); line-height: 1.75; max-width: 46em; }
.marquez-ch { padding: 14px; display: grid; gap: 14px; min-width: 0; }
.marquez-ch > * { min-width: 0; max-width: 100%; }
.marquez-chead { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.marquez-k { font-family: var(--mono-font); font-size: 11px; letter-spacing: .14em; color: var(--accent); }
.marquez-chead h3 { font-family: var(--cjk-display); font-size: 21px; margin: 0; letter-spacing: .03em; }
.marquez-frame { font-size: 14.5px; line-height: 1.85; max-width: 46em; }
.marquez-frame p { margin: 0 0 8px; }
.marquez-body { display: grid; gap: 12px; min-width: 0; }
.marquez-body > * { min-width: 0; max-width: 100%; }
.marquez-refl { border-left: 2px solid var(--accent); background: var(--bg2); padding: 12px 16px; border-radius: 0 8px 8px 0; font-size: 14px; line-height: 1.85; }
.marquez-refl h4 { margin: 0 0 6px; font-family: var(--cjk-display); font-size: 16px; letter-spacing: .06em; }
.marquez-refl p { margin: 0 0 8px; max-width: 46em; }
.marquez-refl-lock { font-size: 13px; color: var(--muted); border: 1px dashed var(--line); border-radius: 8px; padding: 8px 12px; }
.marquez-foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; border-top: 1px solid var(--line); padding-top: 10px; }
.marquez-note-s { font-size: 12px; color: var(--muted); }
.marquez-tagline { font-family: var(--mono-font); font-size: 11px; letter-spacing: .1em; color: var(--muted); }
/* ch1 sorting */
.marquez-pool { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr)); gap: 8px; }
.marquez-pool:empty { display: none; }
.marquez-bins { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 10px; }
.marquez-bin { border: 1px dashed var(--line); border-radius: 10px; padding: 8px; min-height: 90px; display: grid; gap: 6px; align-content: start; }
.marquez-bin.over { border-color: var(--accent); background: var(--bg2); }
.marquez-bin h5 { margin: 0; font-size: 13px; font-weight: 600; display: flex; justify-content: space-between; gap: 8px; }
.marquez-bin h5 span { font-family: var(--mono-font); font-weight: 400; color: var(--muted); font-size: 12px; }
.marquez-card { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; background: var(--bg); display: grid; gap: 4px; cursor: grab; }
.marquez-card:active { cursor: grabbing; }
.marquez-card[data-inv="1"] { border-color: var(--accent); }
.marquez-ct { font-weight: 600; font-size: 14px; }
.marquez-cd { margin: 0; font-size: 13px; color: var(--muted); line-height: 1.65; }
.marquez-acts { display: flex; gap: 4px; flex-wrap: wrap; }
.marquez-mac { font-size: 13px; line-height: 1.7; border-top: 1px dotted var(--line); padding-top: 5px; margin-top: 2px; }
.marquez-mac b { font-weight: 600; color: var(--accent); margin-right: 4px; }
.marquez-sum { font-size: 14px; padding: 8px 12px; border-radius: 8px; background: var(--bg2); }
.marquez-real { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr)); gap: 8px; margin-top: 8px; }
.marquez-rc { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; background: var(--panel); display: grid; gap: 6px; align-content: start; font-size: 13.5px; }
.marquez-rc p { margin: 0; }
.marquez-rc .marquez-ans { font-size: 13px; color: var(--muted); }
.marquez-rc .marquez-ans b { color: var(--fg); }
/* ch2 spiral */
.marquez-split { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 14px; align-items: start; }
@media (max-width: 720px) { .marquez-split { grid-template-columns: minmax(0, 1fr); } }
.marquez-cvbox { min-width: 0; }
.marquez-who { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; display: grid; gap: 6px; background: var(--bg); }
.marquez-who h4 { margin: 0; font-family: var(--cjk-display); font-size: 17px; }
.marquez-who p { margin: 0; font-size: 13.5px; line-height: 1.75; }
.marquez-who .marquez-par { color: var(--muted); font-size: 12.5px; }
.marquez-verdict { font-size: 13px; font-weight: 600; }
.marquez-verdict.ok { color: var(--good); } .marquez-verdict.no { color: var(--warn); } .marquez-verdict.mid { color: var(--accent); }
.marquez-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: var(--muted); }
.marquez-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 5px; vertical-align: 0; }
.marquez-fam { margin: 0; padding-left: 1.6em; font-size: 13px; line-height: 1.7; color: var(--muted); max-height: 260px; overflow-y: auto; }
.marquez-fam li.cur { color: var(--fg); }
.marquez-fam b { color: var(--fg); font-weight: 500; }
.marquez-twist { border: 1px solid var(--accent); border-radius: 10px; padding: 10px 12px; font-size: 13.5px; line-height: 1.75; }
.marquez-twist p { margin: 0 0 6px; }
/* ch3 insomnia */
.marquez-house { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 130px), 1fr)); gap: 8px; }
.marquez-obj { font: inherit; color: var(--fg); background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 10px 6px 8px; cursor: pointer; display: grid; justify-items: center; gap: 4px; min-height: 118px; align-content: start; }
.marquez-obj[aria-pressed="true"] { border-color: var(--accent); }
.marquez-obj svg { transition: opacity .3s; }
.marquez-obj[data-gone="1"] svg { opacity: .22; }
.marquez-lab { font-size: 12px; line-height: 1.45; text-align: center; padding: 2px 6px; border-radius: 4px; background: var(--bg2); border: 1px solid var(--line); min-height: 1.45em; max-width: 100%; overflow-wrap: anywhere; }
.marquez-bar { width: 80%; height: 3px; border-radius: 2px; background: var(--line); overflow: hidden; }
.marquez-bar i { display: block; height: 100%; background: var(--accent); }
.marquez-opts { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr)); gap: 6px; }
.marquez-opts .quiz-opt { font-size: 13px; }
.marquez-phase { font-size: 13px; color: var(--muted); }
.marquez-sign { display: grid; justify-items: center; gap: 0; padding: 8px 0 4px; }
.marquez-sign svg { width: min(100%, 360px); height: auto; }
/* ch4 banana */
.marquez-steps { display: flex; flex-wrap: wrap; gap: 4px; }
.marquez-steps .seg { font-size: 12px; }
.marquez-story { font-size: 14px; line-height: 1.85; max-width: 46em; }
.marquez-story p { margin: 0 0 8px; }
.marquez-demands { display: grid; gap: 6px; }
.marquez-reply { font-size: 13.5px; border-left: 2px solid var(--line); padding: 4px 10px; margin: 4px 0; color: var(--muted); }
.marquez-reply b { color: var(--fg); font-weight: 500; }
.marquez-asks { display: flex; flex-wrap: wrap; gap: 4px; }
.marquez-note { background: var(--bg2); border-radius: 8px; padding: 10px 14px; font-size: 14px; line-height: 1.9; display: grid; gap: 2px; }
.marquez-note h5 { margin: 0 0 4px; font-size: 12px; font-family: var(--mono-font); letter-spacing: .12em; color: var(--muted); font-weight: 400; }
.marquez-nl { display: block; }
.marquez-nl.ov { color: var(--muted); }
.marquez-nl.ov::before { content: "官方版本 · "; font-family: var(--mono-font); font-size: 11px; color: var(--warn); }
.marquez-in { font: inherit; font-size: 13.5px; color: var(--fg); background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 5px 8px; width: 100%; max-width: 30em; }
.marquez-hist { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; background: var(--bg); display: grid; gap: 8px; font-size: 13.5px; line-height: 1.8; }
.marquez-hist .marquez-k { color: var(--warn); }
.marquez-hist p { margin: 0; }
.marquez-hist ul { margin: 0; padding-left: 1.2em; }
/* ch5 */
.marquez-tl { list-style: none; margin: 0; padding: 0 0 0 16px; border-left: 1px solid var(--line); display: grid; gap: 10px; }
.marquez-tl li { position: relative; transition: opacity .35s; }
.marquez-tl li::before { content: ""; position: absolute; left: -21px; top: .55em; width: 9px; height: 9px; border-radius: 50%; background: var(--panel); border: 1.5px solid var(--muted); }
.marquez-tl li[data-on="1"]::before { background: var(--accent); border-color: var(--accent); }
.marquez-tl li[data-on="0"] { opacity: .32; }
.marquez-tl li[data-on="0"] .marquez-tlt { display: none; }
.marquez-tly { font-family: var(--mono-font); font-size: 12px; color: var(--accent); margin-right: 8px; }
.marquez-tlh { font-weight: 600; font-size: 14px; }
.marquez-tlt { margin: 2px 0 0; font-size: 13px; color: var(--muted); line-height: 1.75; }
.marquez-facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr)); gap: 8px; }
.marquez-fact { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: var(--bg); display: grid; gap: 4px; align-content: start; }
.marquez-fact h5 { margin: 0; font-size: 13.5px; font-weight: 600; }
.marquez-fact p { margin: 0; font-size: 13px; line-height: 1.75; }
.marquez-facts[data-view="in"] .marquez-fact { border-color: var(--accent); }
.marquez-final { font-family: var(--cjk-display); font-weight: 600; font-size: clamp(16px, 2vw, 19px); line-height: 1.75; margin: 0; max-width: 34em; }
`;

  const SVGI = (d) => `<svg viewBox="0 0 48 48" width="46" height="46" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

  /* ---------- butterflies (drawn in --accent) ---------- */
  function butterfly(g, x, y, s, flap, rot, col, alpha) {
    g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha = alpha; g.fillStyle = col;
    const k = 0.22 + 0.78 * Math.abs(Math.cos(flap));
    for (const sg of [-1, 1]) {
      g.save(); g.scale(sg * k, 1);
      g.beginPath(); g.ellipse(s * 0.55, -s * 0.3, s * 0.58, s * 0.42, -0.55, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(s * 0.42, s * 0.36, s * 0.36, s * 0.28, 0.6, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    g.globalAlpha = alpha * 0.9; g.fillRect(-s * 0.06, -s * 0.55, s * 0.12, s * 1.05);
    g.restore();
  }
  function flock(n, W, Hh, seed) {
    let r = seed || 7; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: n }, () => ({ x: rnd() * W, y: rnd() * Hh, a: -Math.PI / 2 + (rnd() - 0.5) * 2, ph: rnd() * 6.28, s: 5 + rnd() * 4, v: 16 + rnd() * 14 }));
  }
  function stepFlock(F, dt, W, Hh, rise) {
    F.forEach((b) => {
      b.a += (Math.random() - 0.5) * dt * 3;
      if (rise) b.a += (-Math.PI / 2 - b.a) * dt * 0.6;
      b.x += Math.cos(b.a) * b.v * dt; b.y += Math.sin(b.a) * b.v * dt * 0.7;
      b.ph += dt * (8 + b.s);
      if (b.x < -12) b.x = W + 10; if (b.x > W + 12) b.x = -10;
      if (b.y < -12) { b.y = Hh + 10; b.x = Math.random() * W; } if (b.y > Hh + 12) b.y = -10;
    });
  }

  /* ================= data ================= */
  const SORT = [
    { id: 'ice', t: '冰块', k: 'tech', d: '吉卜赛人的帐篷里摆着一大块透明、冒着寒气的东西。想摸一下，得先付钱。',
      m: '族长付了钱，把手按上去，激动得像见证了神迹。整部小说正是从这块冰开始的——它是奥雷里亚诺上校一生里最早、也最顽固的记忆之一。' },
    { id: 'mag', t: '磁铁', k: 'tech', d: '两块铁锭被拖过街道，各家的铁锅、铁钉、门闩纷纷从屋里滚出来，跟在后面跑。',
      m: '全村目瞪口呆。族长当场拿一头骡子和两只山羊换下了磁铁，打算用它把埋在地下的金子吸出来。' },
    { id: 'dag', t: '银版照相', k: 'tech', d: '一个人在木盒子前一动不动站了好几分钟，然后一块金属板上出现了他的脸。',
      m: '这台新奇的机器让族长着了迷：他后来想用它拍下上帝，好一劳永逸地证明祂存在与否。' },
    { id: 'train', t: '火车', k: 'tech', d: '一个冒着烟、拖着一长串车厢的铁家伙，沿着两条铁轨开进了小镇。',
      m: '第一个看见它的女人尖叫着跑过街道。火车带来了电灯、电影、留声机和外国人——也带来了第四幕的香蕉公司。' },
    { id: 'film', t: '电影', k: 'tech', d: '幕布上，一个人在上一部片子里死了，到下一部片子里又活生生地出现，还换了个身份。',
      m: '观众觉得被愚弄了——他们刚为他流过眼泪——愤怒地砸了座椅。镇长只好出面解释：那只是一台制造幻觉的机器。' },
    { id: 'teeth', t: '假牙', k: 'tech', d: '一个满脸皱纹、牙齿掉光的老人装上一副新牙，第二天看上去年轻了几十岁。',
      m: '镇上的人以为亲眼见到了返老还童的魔法，吓得不轻。' },
    { id: 'rem', t: '升天的姑娘', k: 'magic', d: '一个美得出奇的姑娘在院子里收床单，一阵风把她连同床单一起托上了天空，再也没有回来。',
      m: '镇上很快就接受了。最念念不忘的那个人，惦记的其实是被一起卷走的那几条上好的亚麻床单。' },
    { id: 'bfly', t: '黄蝴蝶', k: 'magic', d: '一个年轻机修工走到哪里，一群黄色的蝴蝶就跟到哪里。',
      m: '姑娘的母亲起初只把它们当成恼人的飞虫。对恋爱中的梅梅来说，蝴蝶只是“他来了”的信号。' },
    { id: 'blood', t: '一道血', k: 'magic', d: '一个男人在自己屋里中了枪。一道血从门下流出，穿过街道、拐过街角、沿着墙根绕开地毯，一路流进他母亲的厨房。',
      m: '叙述者像记账一样平静地写下这条路线；母亲顺着血迹找到了儿子。没有人追问血为什么会认路。' },
    { id: 'mel', t: '回来的死者', k: 'magic', d: '一个据说已经死在远方的吉卜赛人回来了——他说，死后的孤独实在受不了。',
      m: '没有人尖叫。布恩迪亚家给他收拾出一间屋子，他接着做他的实验、写他的羊皮卷。' },
    { id: 'rain', t: '长雨', k: 'magic', d: '一场雨，下了四年十一个月零两天。',
      m: '人们抱怨的是潮湿、发霉的衣服、无事可做的漫长日子——没有人怀疑这件事是否可能。' },
    { id: 'lev', t: '悬空的神父', k: 'magic', d: '神父喝下一杯热巧克力，身体便离地升起十来厘米。',
      m: '这被当成了布道和募捐的手段：为了给教堂筹钱，他一次次当众表演。' },
  ];
  const REAL = [
    { t: '一位随麦哲伦环球航行的意大利人在航海记里写道：南美洲尽头有一种骡子脑袋、骆驼身子、鹿的腿、像马一样嘶叫的动物；还有一个当地巨人第一次照镜子，被自己的影子吓得魂飞魄散。', real: true,
      w: '安东尼奥·皮加费塔（Antonio Pigafetta）对 1519–1522 年那次航行的记录。马尔克斯的诺奖演讲就从这本书讲起——那头“怪兽”多半是原驼。' },
    { t: '一位墨西哥将军在战争中失去一条腿，后来为这条腿举行了隆重的葬礼。', real: true,
      w: '安东尼奥·洛佩斯·德圣安纳（Santa Anna）在 1838 年对法国的“糕点战争”中失去一条腿，1842 年为它举行了盛大的军礼葬仪。演讲里也提到了他。' },
    { t: '一位独裁者为了对付一场猩红热，下令用红纸把全城的路灯包起来。', real: true,
      w: '萨尔瓦多的马克西米利亚诺·埃尔南德斯·马丁内斯（1931–1944 年间掌权），演讲所举的例子。演讲同时提到，正是此人主导了 1932 年对农民起义的血腥镇压（史家的估计从一万到三四万不等）。' },
    { t: '一位上校发动了三十二次武装起义，全部失败；晚年他每天做小金鱼，攒够了就熔掉重做。', real: false,
      w: '这是小说里的奥雷里亚诺·布恩迪亚上校。但他有真实的影子：哥伦比亚“千日战争”（1899–1902）里的自由党将领，常被提到的是拉斐尔·乌里韦·乌里韦；马尔克斯的外祖父就是那场战争的老兵。' },
  ];

  // cat: JA (José Arcadio names) · A (Aureliano names) · F (women) · X (adopted)
  const FAM = [
    { id: 'jab', n: '何塞·阿尔卡蒂奥·布恩迪亚', s: 0, cat: 'JA', par: '第一代 · 马孔多的创建者',
      out: '痴迷吉卜赛人带来的科学：磁铁、放大镜、星盘、炼金术。晚年神志错乱，被家人绑在院子里的栗树下度过余生。' },
    { id: 'urs', n: '乌尔苏拉·伊瓜兰', s: 0.25, cat: 'F', par: '第一代 · 他的妻子，也是他的表亲',
      out: '两人是近亲，她一直害怕生下长猪尾巴的孩子。她活了一百多岁，是全书里真正撑起这个家的人，也是第一个看出“名字的规律”的人。' },
    { id: 'ja2', n: '何塞·阿尔卡蒂奥', s: 1.0, cat: 'JA', pred: true, act: 'imp', par: '族长与乌尔苏拉的长子',
      out: '体格巨大、欲望旺盛。少年时跟着吉卜赛人出走，多年后带着满身刺青回来，娶了丽贝卡；后来在自己屋里离奇地中枪身亡——就是第一幕那道认路的血。' },
    { id: 'col', n: '奥雷里亚诺·布恩迪亚上校', s: 1.5, cat: 'A', pred: true, act: 'luc', par: '族长与乌尔苏拉的次子',
      out: '沉默、内向，从小就有预感。他发动了三十二次起义，全部失败，和十七个女人生了十七个儿子；晚年把自己关在作坊里，一遍遍做小金鱼。' },
    { id: 'ama', n: '阿玛兰妲', s: 1.25, cat: 'F', par: '族长与乌尔苏拉的女儿',
      out: '一生拒绝所有求爱者，晚年不紧不慢地为自己织寿衣。' },
    { id: 'reb', n: '丽贝卡', s: 1.75, cat: 'X', par: '被收养的孤女（虚线表示非血亲）',
      out: '背着一袋父母的遗骨来到马孔多，有偷偷吃土的习惯——第三幕的失眠症就是跟着她进的门。后来嫁给了何塞·阿尔卡蒂奥。' },
    { id: 'arc', n: '阿尔卡蒂奥', s: 2.0, cat: 'JA', pred: true, act: 'imp', par: '何塞·阿尔卡蒂奥与皮拉尔·特尔内拉之子',
      out: '战争中被任命管理马孔多，很快变成一个暴虐的小独裁者；政权更替后被行刑队枪决。' },
    { id: 'aj', n: '奥雷里亚诺·何塞', s: 2.5, cat: 'A', pred: true, act: 'imp', par: '上校与皮拉尔·特尔内拉之子',
      out: '迷恋自己的姑姑阿玛兰妲，为了忘掉她去打仗，回来后在街头被士兵打死。热烈、冲动——活得更像一个“何塞·阿尔卡蒂奥”。' },
    { id: 'a17', n: '十七个奥雷里亚诺', s: 2.6, cat: 'A', many: true, par: '上校在战争年代与十七个女人所生',
      out: '他们额头上都带着一个洗不掉的灰十字；后来几乎全被逐一追杀。同一个名字，被成批地发放，也被成批地收回。（小说的族谱里还有很多这样的“侧枝”，这里只画主干。）' },
    { id: 'rem', n: '美人儿蕾梅黛丝', s: 3.25, cat: 'F', par: '阿尔卡蒂奥与圣索菲亚·德拉佩德之女',
      out: '美得让追求她的男人一个个送命，自己却对世事浑然不觉——第一幕里随床单升天的就是她。' },
    { id: 'jas', n: '何塞·阿尔卡蒂奥第二', s: 3.0, cat: 'JA', pred: true, act: 'luc', twin: true, par: '阿尔卡蒂奥与圣索菲亚·德拉佩德之子（孪生兄弟之一）',
      out: '瘦削、孤僻、清醒。他成了香蕉工人罢工的领头人，是大屠杀之后唯一坚持说出真相的证人；晚年把自己关在梅尔基亚德斯的房间里研读羊皮卷。' },
    { id: 'as', n: '奥雷里亚诺第二', s: 3.5, cat: 'A', pred: true, act: 'imp', twin: true, par: '孪生兄弟之二',
      out: '高大、喧闹、爱狂欢。和情人佩特拉·科特斯在一起时，他家的牲畜就疯狂繁殖，他便通宵宴饮，甚至拿钞票糊墙。' },
    { id: 'ja5', n: '何塞·阿尔卡蒂奥', s: 4.0, cat: 'JA', pred: true, act: 'mix', par: '奥雷里亚诺第二与费尔南达·德尔·卡皮奥之子',
      out: '被送去罗马念神学院（乌尔苏拉盼着他当教皇），回来时却慵懒、讲究、沉溺享乐；最后被他自己招进家里的几个孩子淹死在浴池里，藏着的金子也被他们拿走。他既不“强壮敢闯”，也谈不上“清醒”——但名字附带的悲剧记号照样应验。' },
    { id: 'meme', n: '雷纳塔·雷梅黛丝（梅梅）', s: 4.25, cat: 'F', par: '奥雷里亚诺第二与费尔南达之女',
      out: '爱上了总有黄蝴蝶跟着的机修工马乌里西奥·巴比洛尼亚。母亲以防偷鸡贼为由请人守夜，他夜里潜入时中枪，终身瘫痪；梅梅从此再不开口，被送进远方的修道院。' },
    { id: 'au', n: '阿玛兰妲·乌尔苏拉', s: 4.36, cat: 'F', par: '奥雷里亚诺第二与费尔南达之女',
      out: '在布鲁塞尔读书，后来回到衰败的马孔多，想凭一己之力让这座老房子重新活过来。' },
    { id: 'ab', n: '奥雷里亚诺·巴比洛尼亚', s: 5.5, cat: 'A', pred: true, act: 'luc', par: '梅梅与马乌里西奥·巴比洛尼亚之子（被当作弃婴送回家）',
      out: '从小关在梅尔基亚德斯的房间里，沉默、博学，一点点破译那些羊皮卷。他并不知道阿玛兰妲·乌尔苏拉是自己的姨母——两人相爱了。' },
    { id: 'pig', n: '奥雷里亚诺', s: 6.5, cat: 'A', par: '奥雷里亚诺·巴比洛尼亚与阿玛兰妲·乌尔苏拉之子',
      out: '一百年来唯一在爱里孕育的孩子——却长着一条猪尾巴。乌尔苏拉怕了一辈子的事，在最后一代应验了。母亲产后死去，孩子没能活下来。' },
  ];
  const URS_END = 5.62; // Úrsula dies after the rain, while Aureliano Babilonia is a child
  const EXPECT = { JA: 'imp', A: 'luc' };
  const TEMPER = { imp: '冲动、强壮、敢闯（带着悲剧记号）', luc: '孤僻、沉默、头脑清醒' };

  const OBJ = [
    { id: 'cow', n: '牛', f: '每天早上要挤奶', icon: '<path d="M9 20h23c2-4 6-6 10-4l-2 6h-2v3c0 3-2 6-5 6H14c-3 0-5-3-5-6z"/><path d="M14 31v8M19 31v8M28 31v8M33 31v8"/><path d="M35 15l-2-4M41 16l3-3"/><path d="M9 21c-3 1-4 4-4 7"/>' },
    { id: 'pot', n: '锅', f: '架在火上煮饭', icon: '<path d="M8 20h32v7a11 11 0 0 1-11 11H19A11 11 0 0 1 8 27z"/><path d="M4 20h40M20 15h8"/><path d="M16 44c2-2 2-3 0-5M24 44c2-2 2-3 0-5M32 44c2-2 2-3 0-5"/>' },
    { id: 'clock', n: '钟', f: '告诉你现在几点', icon: '<circle cx="24" cy="24" r="16"/><path d="M24 14v10l7 5"/><path d="M24 9v2M39 24h-2M24 39v-2M9 24h2"/>' },
    { id: 'door', n: '门', f: '推开能出去，关上能挡风', icon: '<rect x="13" y="6" width="22" height="36" rx="1"/><circle cx="30" cy="25" r="1.6"/><path d="M8 42h32"/>' },
    { id: 'bed', n: '床', f: '躺下睡觉（如果还睡得着）', icon: '<path d="M5 37V14M5 29h38v8M43 37v-8"/><path d="M9 29v-5a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v5"/>' },
    { id: 'tree', n: '香蕉树', f: '结的果子可以吃', icon: '<path d="M24 44V20"/><path d="M24 20c-6-8-14-8-18-6 6 0 12 2 18 6zM24 20c6-8 14-8 18-6-6 0-12 2-18 6zM24 20c-2-8 0-14 4-16-2 5-3 10-4 16z"/><path d="M27 26c3 1 5 4 5 8M27 30c2 1 3 3 3 6"/>' },
    { id: 'table', n: '桌子', f: '吃饭时把碗放在上面', icon: '<path d="M6 18h36M9 18v22M39 18v22M6 23h36"/>' },
    { id: 'ink', n: '墨水', f: '用来写这些标签', icon: '<path d="M16 25h16v15H16zM19 25v-4h10v4"/><path d="M25 22L40 5c-1 7-5 12-12 17"/>' },
  ];

  const STEPS = [
    { tab: '火车', pop: '几百户人家', plant: '无', mgr: '0', wage: '—', houses: 7, rows: 0, cmp: false, sold: false,
      html: '<p>上校十七个儿子中的一个——奥雷里亚诺·特里斯特——把铁路修到了马孔多。第一列火车开进小镇时，第一个看见它的女人吓得尖叫。</p><p>火车带来了电灯、电影、留声机，也带来了源源不断的外地人。</p>' },
    { tab: '香蕉', pop: '外来者增多', plant: '试种', mgr: '1（赫伯特先生）', wage: '—', houses: 9, rows: 1, cmp: false, sold: false,
      html: '<p>一位外国先生在布恩迪亚家的饭桌上吃了一串香蕉，然后开始测量、称重、计算。不久之后，工程师、律师、农艺师、测量员接踵而来，在镇外勘察了很多天。</p>' },
    { tab: '公司', pop: '数千外地人涌入', plant: '沿铁路扩张', mgr: '数十人及家属', wage: '现金', houses: 14, rows: 3, cmp: true, sold: false,
      html: '<p>香蕉公司来了。河道被改，种植园沿着铁路一直铺开；外国管理者住进铁丝网围起来的整洁住宅区，有草坪、有泳池。小镇人口暴涨，“外地人”成了多数，老居民在自己的街上认不出路人。</p>' },
    { tab: '代金券', pop: '数千', plant: '一望无际', mgr: '数十人及家属', wage: '公司代金券', houses: 14, rows: 4, cmp: true, sold: false,
      html: '<p>工资不再发现金，而是发公司印的代金券——只能在公司自己的商店里换东西。工人宿舍没有像样的卫生设施；公司的医生给每个病人开同一种药丸。</p>' },
    { tab: '罢工', pop: '数千', plant: '一望无际', mgr: '数十人及家属', wage: '公司代金券', houses: 14, rows: 4, cmp: true, sold: false, demands: true,
      html: '<p>何塞·阿尔卡蒂奥第二成了工人里的领头人。罢工开始了。勾选你认为合理的诉求，把请愿书递给公司：</p>' },
    { tab: '军队', pop: '数千', plant: '停工', mgr: '数十人及家属', wage: '停发', houses: 14, rows: 4, cmp: true, sold: true,
      html: '<p>军队开进马孔多，宣布戒严。官方把罢工者定性为一伙作乱的人。士兵们接管了码头和铁路，替罢工者去砍香蕉、装车皮。</p>' },
    { tab: '车站广场', pop: '数千', plant: '停工', mgr: '数十人及家属', wage: '停发', houses: 14, rows: 4, cmp: true, sold: true, square: true, html: '' },
    { tab: '第二天', pop: '?', plant: '?', mgr: '?', wage: '?', houses: 14, rows: 4, cmp: true, sold: true, ask: true,
      html: '<p>第二天早上，镇子一切如常。去问问镇上的人昨晚发生了什么（每问一个人，看看你的笔记本）：</p>' },
    { tab: '真实的 1928', pop: '—', plant: '—', mgr: '—', wage: '—', houses: 14, rows: 4, cmp: true, sold: false, hist: true, html: '' },
    { tab: '雨', pop: '人口流散', plant: '荒废', mgr: '0（公司撤走）', wage: '—', houses: 8, rows: 1, cmp: false, sold: false, rain: true,
      html: '<p>回到小说。然后开始下雨，一下就是四年十一个月零两天。公司停了工、撤走了，种植园变回荒地，外地人陆续离开。雨停的时候，马孔多只剩一副被泡烂的空壳，再也没有恢复元气。</p>' },
  ];
  const SQUARE = [
    '<p>官方通知工人们到车站广场集合，说省里的长官要来调停。广场上聚了几千人——男人、女人，还有被大人举过头顶的孩子。</p>',
    '<p>来的不是调停的人。一名军官宣读了戒严令，限人群在几分钟内散开。人群没有散。</p>',
    '<p>（这里我们不画。小说写了，而且写得很具体；我们只留下一片空白。）</p>',
    '<p>何塞·阿尔卡蒂奥第二在一列长得望不到头的火车上醒来，满车都是遇难者，火车正在夜里开往海边。他跳下车，沿着铁轨走回马孔多。趁还记得，在笔记本上写下你看到的。</p>',
  ];
  const NOTE0 = ['车站广场上挤满了罢工的工人和他们的家人。', '士兵向人群开了枪。', '夜里，一列很长的火车开往海边，车厢都关着。', '我亲眼看见了。'];
  const ASKS = [
    { who: '卖甜食的女人', say: '死人？那天晚上我睡得很好，什么动静也没听见。', line: '车站广场上很平静，工人们听了劝告就散了。' },
    { who: '巡逻的军官', say: '您一定是太累了。回家睡一觉吧，镇上一切都好。', line: '那天夜里一切如常，没有人受伤。' },
    { who: '镇公所的告示', say: '（墙上新贴的公告）工人们已经得到满意的答复，各自回家了；公司将在雨季结束后恢复生产。', line: '火车只是照常运香蕉。' },
    { who: '一个孩子', say: '火车？火车每天晚上都开呀，运的是香蕉。', line: '你记错了。' },
  ];

  const TL = [
    { y: 1899, h: '“千日战争”（1899–1902）', t: '哥伦比亚自由党与保守党之间的内战，死者以万计。马尔克斯的外祖父尼古拉斯·马尔克斯上校在自由党一方参战——奥雷里亚诺上校身上有他和那一代将领的影子。' },
    { y: 1927, h: '生于阿拉卡塔卡', t: '3 月 6 日，加西亚·马尔克斯出生在加勒比海岸香蕉区的小镇阿拉卡塔卡，由外祖父母带大到八岁左右。外祖母讲鬼怪和预兆时面不改色，外祖父讲战争和屠杀。' },
    { y: 1928, h: '香蕉园大屠杀', t: '12 月 5–6 日，谢纳加车站广场。（见第四幕）' },
    { y: 1955, h: '马孔多第一次出现', t: '第一部小说《枯枝败叶》出版，故事就发生在一个叫马孔多的小镇——名字取自他童年时火车路过的一处香蕉庄园。' },
    { y: 1963, h: '“爆炸”', t: '科塔萨尔《跳房子》、巴尔加斯·略萨《城市与狗》相继问世，加上富恩特斯等人，拉丁美洲小说在六十年代突然被全世界看见，史称“文学爆炸”（Boom）。' },
    { y: 1967, h: '《百年孤独》出版', t: '在布宜诺斯艾利斯由南美出版社出版，首印约八千册很快售罄。此后译成数十种语言，据估计累计销量达数千万册。' },
    { y: 1982, h: '诺贝尔文学奖', t: '12 月在斯德哥尔摩领奖时，他没穿燕尾服，而是一身白色的加勒比传统服装 liqui-liqui。12 月 8 日的演讲题为《拉丁美洲的孤独》（见下）。' },
    { y: 1984, h: '来到中国', t: '1984 年前后，国内出现了多个从西班牙文或英文转译的中译本。当时中国尚未加入国际版权公约（1992 年加入），这些译本都没有得到作者授权。' },
    { y: 1985, h: '寻根文学', t: '韩少功发表《文学的“根”》，一批作家转向乡土、地方传说与民族记忆。马孔多让很多人意识到：写自己村子的鬼魂和祖先，也可以是世界文学。' },
    { y: 1986, h: '莫言', t: '莫言多次谈到八十年代初读《百年孤独》的震撼，也写文章把马尔克斯和福克纳比作两座灼热的高炉——提醒自己必须逃开，否则会被烤化。他的高密东北乡常被拿来与马孔多相比；2012 年他获得诺贝尔文学奖。' },
    { y: 2011, h: '第一个授权中译本', t: '新经典 / 南海出版公司推出范晔从西班牙文译出的授权版本，此后在中国再次成为长销书。' },
    { y: 2014, h: '逝世', t: '4 月 17 日在墨西哥城去世，享年 87 岁。' },
    { y: 2024, h: '剧集', t: '他生前一直拒绝把这本书拍成影视；2024 年底，经家人授权的西班牙语剧集在哥伦比亚拍摄完成并上线。' },
  ];
  const FACTS = [
    { h: '智利，1973',
      out: '圣地亚哥发生军事政变，总统阿连德身亡，军政府宣布恢复秩序。此后执政十七年。',
      in: '演讲引用的估计：之后约有一百万人离开智利，差不多每十个人里就有一个。很多家庭的餐桌，从此常年空着一把椅子。' },
    { h: '阿根廷，1976–1983',
      out: '军政府执政期间，部分人员“下落不明”。',
      in: '1984 年官方委员会（CONADEP）记录了近九千名失踪者，人权组织估计可达三万。被关押孕妇在狱中生下的孩子被送走、改名——直到今天，“五月广场祖母”仍在寻找长大成人的孙辈。' },
    { h: '乌拉圭，1973–1985',
      out: '一个小国经历了十二年的军人统治。',
      in: '演讲说：这个约两百五十万人口的国家，每五个公民中就有一人流亡在外。' },
    { h: '萨尔瓦多，1979 起',
      out: '内战爆发，局势动荡（战争持续到 1992 年）。',
      in: '演讲说：自 1979 年以来，平均大约每二十分钟就有一个萨尔瓦多人沦为难民。这个国家的人还记得 1932 年那场由第一幕里“红纸路灯”的独裁者主导的镇压。' },
    { h: '整个大陆',
      out: '军事政变频繁，政权更替不稳定。',
      in: '演讲列举：五场战争、十七次军事政变；因国家镇压而失踪的人近十二万；被迫离乡的流亡者加起来，比挪威的人口还多。（均为演讲引用的 1982 年估计）' },
    { h: '孩子',
      out: '地区婴儿死亡率偏高。',
      in: '演讲说：1970 年代以来，有约两千万拉丁美洲儿童没活过一岁——比同期欧洲出生的孩子还多。他随即指出，这片土地对这一切的回答，是出生的人始终多于死去的人。' },
  ];

  /* ================= mount ================= */
  HUM.marquez = {
    title: '马孔多，一百年',
    mount(root, ctx) {
      const h = ctx.h, el = h.el, C = (n) => ctx.color(n);
      const reduced = !!ctx.reduced;
      if (!document.getElementById('st-' + ID)) document.head.append(el('style', { id: 'st-' + ID, text: CSS }));
      const cleanups = [];
      const redraws = new Set();
      const redrawAll = () => redraws.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
      const mo = new MutationObserver(redrawAll);
      mo.observe(document.documentElement, { attributes: true });
      const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      if (mq && mq.addEventListener) mq.addEventListener('change', redrawAll);
      cleanups.push(() => { mo.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener('change', redrawAll); });
      const font = (px, fam) => `${px}px ${C(fam || '--body-font') || 'sans-serif'}`;
      const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

      const wrapEl = el('div', { class: 'marquez' });
      root.append(wrapEl);

      /* ---------- banner with butterflies ---------- */
      const bcv = el('div', { class: 'marquez-bcv', 'aria-hidden': 'true' });
      const banner = el('header', { class: 'marquez-banner' }, [
        bcv,
        el('div', { class: 'marquez-kick', text: '1982 · 诺贝尔文学奖 · 加夫列尔·加西亚·马尔克斯（Gabriel García Márquez，1927–2014）' }),
        el('h2', { class: 'marquez-title', text: '马孔多，一百年' }),
        el('p', { class: 'marquez-sub', text: '瑞典学院的授奖理由大意是：他的长篇和短篇小说把奇幻与现实交织进一个丰富的想象世界，映照出一整个大陆的生活与冲突。核心作品《百年孤独》（Cien años de soledad，1967）讲布恩迪亚家族七代人在虚构小镇马孔多的一百年。下面五幕，每一幕先动手，再读“这一幕想说的”。' }),
      ]);
      wrapEl.append(banner);
      const bc = h.canvas(bcv, { aspect: 0.08, minH: 64, maxH: 64 });
      bc.canvas.style.display = 'block';
      let bfl = flock(7, 600, 64, 11);
      const drawBanner = () => {
        const g = bc.g, W = bc.w, Hh = bc.h; g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const col = C('--accent');
        bfl.forEach((b) => butterfly(g, ((b.x % (W + 24)) + W + 24) % (W + 24) - 12, b.y, b.s, b.ph, b.a + Math.PI / 2, col, 0.75));
      };
      bc.onResize((W, Hh) => { bfl = flock(Math.max(4, Math.round(W / 110)), W, Hh, 11); drawBanner(); });
      bfl = flock(Math.max(4, Math.round(bc.w / 110)), bc.w, bc.h, 11);
      drawBanner(); redraws.add(drawBanner);
      const bLoop = h.loop((dt) => { stepFlock(bfl, dt, bc.w, bc.h, false); drawBanner(); });
      let bannerVisible = true;
      const io = ('IntersectionObserver' in window) ? new IntersectionObserver((es) => {
        bannerVisible = es[0].isIntersecting; if (!reduced) { if (bannerVisible) bLoop.start(); else bLoop.stop(); }
      }) : null;
      if (io) io.observe(bcv);
      if (!reduced) bLoop.start();
      cleanups.push(() => { bLoop.stop(); bc.destroy(); if (io) io.disconnect(); });

      /* ---------- chapter framework ---------- */
      const CH = [
        { title: '颠倒的惊奇', build: ch1, intro: '<p>魔幻现实主义常被误解成“往现实里撒一把魔法”。其实它做的是一件更根本的事：<b>换一双眼睛</b>。在马孔多，什么东西让人目瞪口呆，什么东西被当成家常便饭？</p><p>先凭<b>你自己</b>的直觉，把下面十二张牌分进两栏（拖动，或点牌上的按钮）。分完之后，再翻到马孔多人的视角。</p>' },
        { title: '名字的轮回', build: ch2, intro: '<p>布恩迪亚家族七代人，男孩子几乎只叫两个名字：<b>何塞·阿尔卡蒂奥</b>和<b>奥雷里亚诺</b>。活了一百多岁的乌尔苏拉看出一个规律：叫奥雷里亚诺的，往往内向、沉默，却有一种清醒的洞察；叫何塞·阿尔卡蒂奥的，往往冲动、强壮、敢闯，却总像被打上了悲剧的记号。</p><p>在螺旋上让孩子一个个出生。每当一个男孩被取名，先按乌尔苏拉的规律猜猜他的性情，再看小说怎么写。螺旋每转一圈是一代人；同名的人落在同一条辐线上。</p>' },
        { title: '失眠症', build: ch3, intro: '<p>马孔多曾染上一场失眠症。没人觉得累，起初甚至很高兴——直到人们发现，失眠的真正症状是<b>遗忘</b>：先忘掉童年，再忘掉东西的名字，最后连东西是干什么用的都忘了。</p><p>布恩迪亚家想出的办法，是给每样东西贴上写着名字的标签；后来标签上还得写明用途。现在轮到你守住这间屋子：点一样东西，再选出正确的标签贴回去。标签会慢慢褪色——而且越来越快。</p>' },
        { title: '香蕉公司', build: ch4, intro: '<p>小说里最“魔幻”的一段，偏偏写的是真事。下面是一个<b>示意</b>的马孔多：一步步推进，看铁路、外国资本和香蕉怎样改变一个小镇，看一场罢工怎样结束——以及结束之后，记忆怎样被改写。</p><p>（场景和数字是简化示意，小说本身没有给出具体数字；第 9 步是真实历史。）</p>' },
        { title: '孤独与第二次机会', build: ch5, intro: '<p>最后，把书放回它所在的世界：它从哪里来，1982 年的奖和演讲说了什么，又怎样改变了拉丁美洲看自己的方式——包括远在中国的读者和作家。</p><p>拖动年份，沿时间线往前走；然后在“外部视角 / 内部视角”之间切换，读同一组拉丁美洲的事实。</p>' },
      ];
      const pills = CH.map((c, i) => el('button', { type: 'button', class: 'pill', onclick: () => open(i) }, [el('span', { class: 'pill-n', text: String(i + 1) }), el('span', { class: 'pill-t', text: c.title })]));
      const strip = el('div', { class: 'pills', role: 'tablist', 'aria-label': '五幕' }, pills);
      const host = el('div');
      wrapEl.append(strip, host);
      const built = new Map(); const done = new Set(); let cur = 0;

      function refreshPills() {
        pills.forEach((p, i) => { p.setAttribute('aria-selected', String(i === cur)); p.dataset.state = i === cur ? 'cur' : done.has(i) ? 'done' : 'open'; });
      }
      function buildCh(i) {
        const c = CH[i];
        const body = el('div', { class: 'marquez-body' });
        const reflLock = el('div', { class: 'marquez-refl-lock', text: '先完成上面的互动，“这一幕想说的”就会出现在这里。' });
        const refl = el('div', { class: 'marquez-refl', hidden: true }, [el('h4', { text: '这一幕想说的' })]);
        const prev = h.button({ label: '← 上一幕', onClick: () => open(i - 1) }); prev.disabled = i === 0;
        const next = h.button({ label: i < CH.length - 1 ? '下一幕 →' : '回到开头 ↑', kind: 'primary', onClick: () => open(i < CH.length - 1 ? i + 1 : 0) });
        const sec = el('section', { class: 'marquez-ch', 'aria-label': c.title }, [
          el('div', { class: 'marquez-chead' }, [el('span', { class: 'marquez-k', text: `第 ${i + 1} 幕 / ${CH.length}` }), el('h3', { text: c.title })]),
          el('div', { class: 'marquez-frame', html: c.intro }),
          body, reflLock, refl,
          el('div', { class: 'marquez-foot' }, [prev, next]),
        ]);
        host.append(sec);
        const api = {
          unlock() { if (!refl.hidden) return; refl.hidden = false; reflLock.hidden = true; done.add(i); refreshPills(); if (ctx.typeset) ctx.typeset(refl); },
          refl,
        };
        let handle = null;
        try { handle = c.build(body, api, refl) || null; } catch (e) { console.error(e); body.append(el('p', { class: 'lab-missing', text: '这一幕加载失败。' })); }
        built.set(i, { sec, handle });
      }
      function open(i) {
        if (i < 0 || i >= CH.length) return;
        const old = built.get(cur); if (old && old.handle && old.handle.hide && cur !== i) old.handle.hide();
        cur = i;
        if (!built.has(i)) buildCh(i);
        built.forEach((b, k) => { b.sec.hidden = k !== i; });
        const b = built.get(i); if (b.handle && b.handle.show) b.handle.show();
        refreshPills();
      }
      const reflP = (refl, htmls) => htmls.forEach((x) => refl.append(el('p', { html: x })));

      /* ===== Chapter 1: inverted wonder ===== */
      function ch1(body, api, refl) {
        const place = {}; let flipped = false; let view = 'you';
        const cards = {};
        const pool = el('div', { class: 'marquez-pool' });
        const mkBin = (key, label) => {
          const list = el('div', { class: 'marquez-pool' });
          const cnt = el('span', { text: '0' });
          const bin = el('div', { class: 'marquez-bin', 'data-bin': key }, [el('h5', {}, [label, cnt]), list]);
          bin.addEventListener('dragover', (e) => { if (flipped) return; e.preventDefault(); bin.classList.add('over'); });
          bin.addEventListener('dragleave', () => bin.classList.remove('over'));
          bin.addEventListener('drop', (e) => { e.preventDefault(); bin.classList.remove('over'); const id = e.dataTransfer.getData('text/plain'); if (cards[id]) put(id, key); });
          return { bin, list, cnt };
        };
        const bins = { wow: mkBin('wow', '让人惊奇'), norm: mkBin('norm', '理所当然') };
        const prog = el('div', { class: 'marquez-note-s', 'aria-live': 'polite' });
        const flipBtn = h.button({ label: '翻到马孔多人的视角 ↻', kind: 'primary', onClick: () => flip() });
        flipBtn.disabled = true;
        const viewCh = h.choice({ options: [{ value: 'you', label: '你的分法' }, { value: 'mac', label: '马孔多人的分法' }], value: 'you', onChange: (v) => { view = v; layout(); } });
        viewCh.el.hidden = true;
        const sum = el('div', { class: 'marquez-sum', hidden: true, 'aria-live': 'polite' });

        shuffle(SORT).forEach((c) => {
          const bW = el('button', { type: 'button', class: 'seg', text: '惊奇', 'aria-pressed': 'false', onclick: () => put(c.id, 'wow') });
          const bN = el('button', { type: 'button', class: 'seg', text: '理所当然', 'aria-pressed': 'false', onclick: () => put(c.id, 'norm') });
          const mac = el('div', { class: 'marquez-mac', hidden: true }, [el('b', { text: c.k === 'tech' ? '马孔多：惊奇！' : '马孔多：理所当然' }), c.m]);
          const node = el('div', { class: 'marquez-card', draggable: 'true', 'data-id': c.id }, [
            el('div', { class: 'marquez-ct', text: c.t }), el('p', { class: 'marquez-cd', text: c.d }),
            el('div', { class: 'marquez-acts', role: 'group', 'aria-label': '归类：' + c.t }, [bW, bN]), mac,
          ]);
          node.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; });
          cards[c.id] = { c, node, bW, bN, mac };
          pool.append(node);
        });
        function put(id, key) {
          if (flipped) return;
          place[id] = key; const k = cards[id];
          k.bW.setAttribute('aria-pressed', String(key === 'wow')); k.bN.setAttribute('aria-pressed', String(key === 'norm'));
          bins[key].list.append(k.node);
          count();
        }
        function count() {
          const n = Object.keys(place).length;
          bins.wow.cnt.textContent = String(bins.wow.list.children.length); bins.norm.cnt.textContent = String(bins.norm.list.children.length);
          prog.textContent = n < SORT.length ? `已分 ${n} / ${SORT.length} 张` : '全部分好了。现在换一双眼睛看看。';
          flipBtn.disabled = n < SORT.length || flipped;
        }
        const macOf = (c) => (c.k === 'tech' ? 'wow' : 'norm');
        function layout() {
          SORT.forEach((c) => { const k = cards[c.id]; const key = view === 'mac' ? macOf(c) : place[c.id]; bins[key].list.append(k.node); });
          bins.wow.cnt.textContent = String(bins.wow.list.children.length); bins.norm.cnt.textContent = String(bins.norm.list.children.length);
        }
        function flip() {
          flipped = true; flipBtn.disabled = true; view = 'mac'; viewCh.set('mac'); viewCh.el.hidden = false;
          let inv = 0;
          SORT.forEach((c) => { const k = cards[c.id]; const isInv = place[c.id] !== macOf(c); if (isInv) inv++; k.node.dataset.inv = isInv ? '1' : '0'; k.mac.hidden = false; k.node.draggable = false; k.bW.disabled = true; k.bN.disabled = true; });
          layout();
          sum.hidden = false;
          sum.innerHTML = `你有 <b>${inv} / ${SORT.length}</b> 张牌和马孔多人的判断相反（金色边框的那些）。` + (inv >= 9
            ? '几乎整个颠倒了：我们觉得平常的技术，马孔多人目瞪口呆；我们觉得不可能的事，他们眼皮都不抬。'
            : '你的直觉已经有点“马孔多化”了——不过请注意，小说是怎样让你做到这一点的。');
          prog.textContent = '';
          api.unlock();
        }
        body.append(pool, el('div', { class: 'marquez-bins' }, [bins.wow.bin, bins.norm.bin]), el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;align-items:center' }, [flipBtn, prog]), viewCh.el, sum);
        count();

        reflP(refl, [
          '“现实主义”不是现实本身，而是一种约定：<b>谁的日常算“正常”</b>。在欧洲小说的约定里，火车和电影是背景，升天和死而复生是奇迹；马孔多把这把尺子倒过来拿。冰块被当作神迹，一个姑娘被风卷上天却只换来对床单的惋惜——惊奇被放在了“我们”的东西上，平静留给了“我们”以为不可能的东西。',
          '关键在叙述者的语气。马尔克斯多次说过，他是从外祖母那里学会这种讲法的：她讲最离奇的事情时，脸上没有一丝惊讶，于是听的人也就信了。那种不动声色，本身就是一种立场——拒绝用别人的尺子来量自己的世界。',
          '他在 1982 年的诺奖演讲里更进一步：拉丁美洲的问题不是想象太多，而是<b>现实本身就过于庞大</b>，缺的是让别人相信它的常规手段。下面四件事，哪些是史书里的，哪些是小说里的？',
        ]);
        const realBox = el('div', { class: 'marquez-real' });
        REAL.forEach((r) => {
          const ans = el('p', { class: 'marquez-ans', hidden: true });
          const pick = (guess) => {
            ans.hidden = false;
            ans.innerHTML = `<b>${guess === r.real ? '猜对了。' : '其实是' + (r.real ? '真事' : '小说') + '。'}</b>${r.w}`;
            bR.setAttribute('aria-pressed', String(guess)); bF.setAttribute('aria-pressed', String(!guess));
          };
          const bR = el('button', { type: 'button', class: 'seg', text: '史书里的', 'aria-pressed': 'false', onclick: () => pick(true) });
          const bF = el('button', { type: 'button', class: 'seg', text: '小说里的', 'aria-pressed': 'false', onclick: () => pick(false) });
          realBox.append(el('div', { class: 'marquez-rc' }, [el('p', { text: r.t }), el('div', { class: 'marquez-acts' }, [bR, bF]), ans]));
        });
        refl.append(realBox, el('p', { class: 'marquez-note-s', style: 'margin-top:8px', text: '演讲内容此处均为转述，不是引文。' }));
        return null;
      }

      /* ===== Chapter 2: names in a circle ===== */
      function ch2(body, api, refl) {
        const split = el('div', { class: 'marquez-split' });
        const cvBox = el('div', { class: 'marquez-cvbox' });
        const side = el('div', { style: 'display:grid;gap:10px;min-width:0' });
        split.append(cvBox, side); body.append(split);
        const cv = h.canvas(cvBox, { aspect: 0.92, minH: 300, maxH: 460 });
        const legend = el('div', { class: 'marquez-legend' });
        const colOf = (cat) => ({ JA: '--s2', A: '--s1', F: '--s3', X: '--s4' })[cat];
        [['JA', '何塞·阿尔卡蒂奥们'], ['A', '奥雷里亚诺们'], ['F', '女儿们'], ['X', '养女']].forEach(([c, t]) => {
          const i = el('i'); legend.append(el('span', {}, [i, t])); i.dataset.cat = c;
        });
        const paintLegend = () => legend.querySelectorAll('i').forEach((i) => (i.style.background = C(colOf(i.dataset.cat))));
        paintLegend();
        const ursNote = el('span', {}, [el('i', { style: 'border-radius:1px;height:3px;width:14px;vertical-align:3px' }), '乌尔苏拉的一生']);
        legend.append(ursNote);
        const paintUrs = () => (ursNote.querySelector('i').style.background = C('--accent'));
        paintUrs();
        cvBox.append(legend);

        const who = el('div', { class: 'marquez-who', 'aria-live': 'polite' });
        const predBox = el('div', { class: 'quiz', hidden: true });
        const nextBtn = h.button({ label: '下一个孩子出生 →', kind: 'primary', onClick: () => advance() });
        const windBtn = h.button({ label: '让风吹过马孔多', onClick: () => wind() }); windBtn.hidden = true;
        const roN = h.readout('已预测', '0'), roHit = h.readout('你猜中', '0'), roRule = h.readout('规律成立（按名字）', '—');
        const ros = el('div', { class: 'lab-readout' }, [roN.el, roHit.el, roRule.el]);
        const twist = el('div', { class: 'marquez-twist', hidden: true });
        const famList = el('ol', { class: 'marquez-fam', 'aria-label': '已出生的家族成员（简化族谱）' });
        side.append(who, predBox, el('div', {}, [nextBtn, windBtn]), ros, twist, el('div', { class: 'marquez-tagline', text: '族谱（简化，只画主干）' }), famList);

        let shown = 2; let pending = null; let current = 1; let nPred = 0, nHit = 0, nFit = 0, nMis = 0, nMid = 0; let twinsDone = 0;
        let fade = 1, windT = -1; let finished = false;
        const guesses = {};
        const wl = h.loop((dt) => { if (windT >= 0) { windT += dt; fade = Math.max(0.1, 1 - windT / 3.2); draw(); if (fade <= 0.1) { wl.stop(); } } });

        function renderList() {
          famList.innerHTML = '';
          FAM.slice(0, shown).forEach((m, k) => {
            famList.append(el('li', { class: k === current ? 'cur' : '' }, [el('b', { text: m.n }), ' — ' + m.par]));
          });
          famList.scrollTop = famList.scrollHeight;
        }
        function showWho(m, withOut) {
          who.innerHTML = '';
          who.append(el('h4', { text: m.n }), el('p', { class: 'marquez-par', text: m.par }));
          if (withOut) who.append(el('p', { text: m.out }));
          if (withOut && m.pred) {
            const exp = EXPECT[m.cat];
            let cls, txt;
            if (m.act === 'mix') { cls = 'mid'; txt = '说不清：两种性情都不像，但悲剧记号应验了。'; }
            else if (m.act === exp) { cls = 'ok'; txt = '规律成立：' + TEMPER[m.act] + '。'; }
            else { cls = 'no'; txt = '规律失灵：名字是“' + (m.cat === 'JA' ? '何塞·阿尔卡蒂奥' : '奥雷里亚诺') + '”，性情却是“' + TEMPER[m.act] + '”。'; }
            who.append(el('div', { class: 'marquez-verdict ' + cls, text: txt }));
          }
        }
        function tally() {
          roN.set(String(nPred)); roHit.set(nPred ? `${nHit} / ${nPred}` : '0');
          const swapped = twinsDone === 2 ? `；孪生子按“换过身份”算：${nFit + 2} 成立 · ${nMis - 2} 失灵` : '';
          roRule.set(nPred ? `${nFit} 成立 · ${nMis} 失灵 · ${nMid} 说不清${swapped}` : '—');
        }
        function advance() {
          if (pending || shown >= FAM.length) return;
          const m = FAM[shown]; current = shown; shown++;
          renderList();
          if (m.pred) {
            pending = m; nextBtn.disabled = true;
            showWho(m, false);
            predBox.hidden = false; predBox.innerHTML = '';
            predBox.append(el('div', { class: 'quiz-q', html: `这个孩子取名<b>${m.n}</b>。按乌尔苏拉的规律，你猜他会是：` }));
            const opts = el('div', { class: 'quiz-opts' });
            ['imp', 'luc'].forEach((t) => opts.append(el('button', { type: 'button', class: 'quiz-opt', text: TEMPER[t], onclick: () => guess(t) })));
            predBox.append(opts);
            const first = opts.querySelector('button'); if (first && document.activeElement === nextBtn) first.focus();
          } else {
            showWho(m, true);
          }
          if (shown >= FAM.length) { nextBtn.disabled = true; nextBtn.textContent = '第七代，最后一个'; windBtn.hidden = false; finished = true; api.unlock(); }
          draw();
        }
        function guess(t) {
          const m = pending; if (!m) return;
          guesses[m.id] = t; nPred++;
          if (t === m.act) nHit++;
          if (m.act === 'mix') nMid++; else if (m.act === EXPECT[m.cat]) nFit++; else nMis++;
          if (m.twin) twinsDone++;
          pending = null; predBox.hidden = true; predBox.innerHTML = ''; nextBtn.disabled = false;
          showWho(m, true);
          if (twinsDone === 2 && twist.hidden) {
            twist.hidden = false;
            twist.innerHTML = '';
            [
              '<b>孪生子之谜。</b>这对双胞胎正好反了过来：叫何塞·阿尔卡蒂奥的那个瘦削、清醒、孤独；叫奥雷里亚诺的那个高大、喧闹、纵情。',
              '小说给了一个解释：两人小时候长得一模一样，常常互换衣服和名字捉弄大人，乌尔苏拉怀疑他们在某次游戏里换过之后就再也没换回来。两人在同一时刻死去；下葬那天，醉醺醺的送葬者搞混了棺材，各自被埋进了对方的墓穴。',
              '如果承认他们换过身份，规律又成立了——例外反而成了规律最有力的证据。',
            ].forEach((x) => twist.append(el('p', { html: x })));
          }
          tally(); draw(); nextBtn.focus();
        }
        function wind() {
          windBtn.disabled = true;
          who.innerHTML = '';
          who.append(el('h4', { text: '羊皮卷' }), el('p', { text: '吉卜赛人梅尔基亚德斯一百年前写下的羊皮卷，终于被最后一个奥雷里亚诺破译：上面用梵文和密码，提前写好了这个家族的全部历史，一直写到他此刻正在读它的这一瞬间。他越读越快，屋外起了一阵越来越猛的风，把马孔多从地面、也从人们的记忆里一点点抹掉。' }));
          if (reduced) { fade = 0.12; draw(); } else { windT = 0; wl.start(); }
        }

        function draw() {
          const g = cv.g, W = cv.w, Hh = cv.h;
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const cx = W / 2, cy = Hh / 2 + 4, R = Math.min(W, Hh) / 2 - 22, r0 = R * 0.07;
          const rad = (s) => r0 + (R - r0) * s / 7;
          const drift = (1 - fade) * 26;
          const pt = (s) => { const a = 2 * Math.PI * s, r = rad(s) + drift * (s / 7); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
          g.save(); g.globalAlpha = Math.max(fade, 0.35);
          // spokes
          g.setLineDash([3, 4]); g.strokeStyle = C('--grid'); g.lineWidth = 1;
          [[0, '--s2'], [Math.PI, '--s1']].forEach(([a]) => { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + (R + 8) * Math.cos(a), cy + (R + 8) * Math.sin(a)); g.stroke(); });
          g.setLineDash([]);
          g.font = font(11); g.textBaseline = 'bottom';
          g.textBaseline = 'top';
          g.fillStyle = C('--s2'); g.textAlign = 'right'; g.fillText('何塞·阿尔卡蒂奥们 → 右侧辐线', W - 4, 4);
          g.fillStyle = C('--s1'); g.textAlign = 'left'; g.fillText('左侧辐线 ← 奥雷里亚诺们', 4, 4);
          // spiral
          g.strokeStyle = C('--line'); g.lineWidth = 1; g.beginPath();
          for (let s = 0; s <= 7.0001; s += 0.01) { const [x, y] = pt(s); if (s === 0) g.moveTo(x, y); else g.lineTo(x, y); }
          g.stroke();
          // generation marks
          g.font = font(10, '--mono-font'); g.fillStyle = C('--muted'); g.textAlign = 'center'; g.textBaseline = 'middle';
          for (let k = 1; k <= 7; k++) { const [x, y] = pt(k - 1 + 0.875); g.fillText(String(k), x, y - 8); }
          g.restore();
          // Úrsula's life
          const sCur = FAM[Math.min(current, FAM.length - 1)].s;
          const sEnd = Math.min(URS_END, Math.max(0.26, shown > 2 ? Math.max(...FAM.slice(0, shown).map((m) => m.s)) : 0.26));
          g.save(); g.globalAlpha = 0.55 * fade + 0.1; g.strokeStyle = C('--accent'); g.lineWidth = 3; g.lineCap = 'round'; g.beginPath();
          for (let s = 0.25; s <= sEnd + 1e-6; s += 0.01) { const [x, y] = pt(s); if (s === 0.25) g.moveTo(x, y); else g.lineTo(x, y); }
          g.stroke(); g.restore();
          // twins swap
          if (twinsDone === 2) {
            const a = pt(3.0), b = pt(3.5);
            g.save(); g.globalAlpha = fade; g.setLineDash([4, 4]); g.strokeStyle = C('--accent'); g.lineWidth = 1.2;
            g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(cx, cy - R * 0.25, b[0], b[1]); g.stroke(); g.setLineDash([]);
            g.fillStyle = C('--accent'); g.font = font(11); g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText('互换？', cx, cy - R * 0.12 - 2);
            g.restore();
          }
          // nodes
          FAM.slice(0, shown).forEach((m, k) => {
            const isCur = k === current;
            const col = C(colOf(m.cat));
            g.save(); g.globalAlpha = fade;
            if (m.many) {
              for (let j = 0; j < 17; j++) { const [x, y] = pt(m.s + j * 0.009); g.fillStyle = col; g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill(); }
              g.restore(); return;
            }
            const [x, y] = pt(m.s); const r = isCur ? 9 : 6.5;
            const unknown = pending && pending.id === m.id;
            g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
            if (m.cat === 'X') { g.setLineDash([2, 2]); g.strokeStyle = col; g.lineWidth = 1.6; g.fillStyle = C('--panel'); g.fill(); g.stroke(); g.setLineDash([]); }
            else if (unknown) { g.fillStyle = C('--panel'); g.fill(); g.strokeStyle = col; g.lineWidth = 1.6; g.stroke(); }
            else { g.fillStyle = col; g.fill(); }
            if (isCur) { g.strokeStyle = C('--fg'); g.lineWidth = 1.4; g.beginPath(); g.arc(x, y, r + 3, 0, Math.PI * 2); g.stroke(); }
            if (unknown) { g.fillStyle = C('--fg'); g.font = font(11); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', x, y + 0.5); }
            if (m.id === 'pig') { g.strokeStyle = C('--fg'); g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + r, y); g.bezierCurveTo(x + r + 6, y - 6, x + r + 10, y + 6, x + r + 14, y - 2); g.stroke(); }
            g.restore();
          });
          // current label
          const m = FAM[Math.min(current, shown - 1)];
          if (m && !m.many && fade > 0.5) {
            const [x, y] = pt(m.s); const a = 2 * Math.PI * m.s;
            g.font = font(12.5); const tw = g.measureText(m.n).width;
            let lx = x + Math.cos(a) * 16, ly = y + Math.sin(a) * 16 + (Math.abs(Math.sin(a)) < 0.3 ? 16 : 0);
            lx = Math.cos(a) >= 0 ? lx : lx - tw; lx = Math.max(4, Math.min(W - tw - 4, lx));
            ly = Math.max(14, Math.min(Hh - 6, ly));
            g.fillStyle = C('--panel'); g.globalAlpha = 0.85; g.fillRect(lx - 3, ly - 12, tw + 6, 17); g.globalAlpha = 1;
            g.fillStyle = C('--fg'); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(m.n, lx, ly + 1);
          }
          if (fade < 0.6) {
            g.fillStyle = C('--muted'); g.font = font(12); g.textAlign = 'center'; g.textBaseline = 'bottom';
            g.fillText('（马孔多被风抹去）', W / 2, Hh - 4);
          }
          void sCur;
        }
        cv.onResize(draw); redraws.add(draw); redraws.add(paintLegend); redraws.add(paintUrs);
        current = 1; renderList(); showWho(FAM[0], true); who.append(el('p', { class: 'marquez-par', text: '族长与乌尔苏拉已在螺旋中心。点“下一个孩子出生”。' }));
        tally(); draw();

        reflP(refl, [
          '<b>孤独</b>在这本书里不是“一个人待着”，而是这个家族世代相传的病：没有能力真正去爱、去和别人连接。上校打了一辈子仗，最后只信得过自己手里的小金鱼；阿玛兰妲拒绝所有人，给自己织寿衣；每个人都关进自己的房间、自己的执念。名字一样，孤独也一样。',
          '<b>时间在这里不是直线，而是圆。</b>名字回来，性格回来，甚至错误也回来——近亲相爱、长猪尾巴的恐惧，从第一代一直绕到第七代才应验。乌尔苏拉晚年说过类似的感慨：时间好像没有往前走，只是在原地打转。读者在螺旋上能看见的这种重复，正是小说的结构。',
          '结尾，梅尔基亚德斯的羊皮卷原来早已写下了全部历史；最后一个奥雷里亚诺读到自己的那一刻，风把马孔多抹去。小说最后的判决是：这样一个被孤独困住的家族，<b>没有重来一次的机会</b>。记住这一点——第五幕里，马尔克斯会在诺奖讲台上把这个判决翻转过来。',
        ]);
        return { destroy() { wl.stop(); cv.destroy(); } };
      }

      /* ===== Chapter 3: insomnia ===== */
      function ch3(body, api, refl) {
        const st = {}; let t = 0, running = false, over = false, sel = null, best = 0, phase = 1;
        const house = el('div', { class: 'marquez-house' });
        const nodes = {};
        OBJ.forEach((o) => {
          const lab = el('span', { class: 'marquez-lab' }); const bar = el('i');
          const b = el('button', { type: 'button', class: 'marquez-obj', 'aria-pressed': 'false', html: SVGI(o.icon) });
          b.append(lab, el('span', { class: 'marquez-bar' }, [bar]));
          b.addEventListener('click', () => choose(o.id));
          nodes[o.id] = { b, lab, bar }; house.append(b);
        });
        const phaseEl = el('div', { class: 'marquez-phase', 'aria-live': 'polite' });
        const opts = el('div', { class: 'marquez-opts', role: 'group', 'aria-label': '可选的标签' });
        const startBtn = h.button({ label: '开始：失眠症来了', kind: 'primary', onClick: () => start() });
        const nightBtn = h.button({ label: '又过了一夜 →', onClick: () => tick(2.2) }); nightBtn.hidden = true;
        const roT = h.readout('第几夜', '—'), roK = h.readout('还记得的东西', '8 / 8'), roB = h.readout('最多同时记得', '—');
        const end = el('div', { hidden: true });
        body.append(house, phaseEl, opts, el('div', {}, [startBtn, nightBtn]), el('div', { class: 'lab-readout' }, [roT.el, roK.el, roB.el]), end,
          el('p', { class: 'lab-hint', text: reduced ? '（已按“减少动态效果”设置改为逐夜推进：每点一次“又过了一夜”，时间前进一步；每贴一张标签也会过去一点时间。）' : '游戏机制是简化的示意：遗忘的速度会不断加快。' }));

        function reset() {
          OBJ.forEach((o, i) => { st[o.id] = 0.75 + 0.25 * ((i * 37) % 11) / 10; });
          t = 0; over = false; sel = null; best = 0; phase = 1; end.hidden = true; end.innerHTML = '';
          render();
        }
        const rate = (tt) => 0.034 * (1 + Math.pow(tt / 16, 2));
        function scramble(s, frac) {
          if (frac <= 0) return s;
          return [...s].map((ch, i) => (ch === ' ' || ch === '·' ? ch : ((Math.sin(i * 12.9898 + s.length * 78.233) * 43758.5453) % 1 + 1) % 1 < frac ? '□' : ch)).join('');
        }
        function labelText(o) { return phase === 1 ? o.n : `${o.n} · ${o.f}`; }
        function render() {
          let keep = 0;
          OBJ.forEach((o) => {
            const m = st[o.id], n = nodes[o.id];
            n.lab.style.opacity = String(m <= 0 ? 1 : 0.15 + 0.85 * m);
            n.lab.textContent = m <= 0 ? '？' : labelText(o);
            n.bar.style.width = Math.max(0, m * 100) + '%';
            n.b.dataset.gone = m <= 0 ? '1' : '0';
            n.b.setAttribute('aria-label', m <= 0 ? '一样已经想不起名字的东西' : '标签：' + labelText(o) + '（清晰度 ' + Math.round(m * 100) + '%）');
            n.b.setAttribute('aria-pressed', String(sel === o.id));
            if (m > 0) keep++;
          });
          if (running) best = Math.max(best, keep);
          roT.set(running || over ? `第 ${Math.floor(t / 2.2) + 1} 夜` : '—');
          roK.set(`${keep} / ${OBJ.length}`); roB.set(best ? String(best) : '—');
          phaseEl.textContent = !running && !over ? '屋里的东西还都贴着清楚的标签。' :
            phase === 1 ? '第一阶段：人们开始忘记东西的名字。' :
            phase === 2 ? '第二阶段：名字还在，用途却忘了——标签上必须写明这东西是干什么用的。' :
            '第三阶段：连标签上的字也开始认不出来了。';
          return keep;
        }
        function showOpts() {
          opts.innerHTML = '';
          if (!sel || over) return;
          const o = OBJ.find((x) => x.id === sel);
          let list;
          if (phase === 1) list = [o.n, ...shuffle(OBJ.filter((x) => x.id !== o.id)).slice(0, 3).map((x) => x.n)];
          else list = [`${o.n} · ${o.f}`, ...shuffle(OBJ.filter((x) => x.id !== o.id)).slice(0, 3).map((x) => `${o.n} · ${x.f}`)];
          const frac = phase === 3 ? Math.min(0.75, (t - 36) / 40 + 0.2) : 0;
          shuffle(list.map((s, i) => ({ s, ok: i === 0 }))).forEach((it) => {
            opts.append(el('button', { type: 'button', class: 'quiz-opt', text: scramble(it.s, frac), onclick: (e) => pick(it.ok, e.currentTarget) }));
          });
        }
        function choose(id) { if (!running || over) return; sel = id; render(); showOpts(); const f = opts.querySelector('button'); if (f) f.focus(); }
        function pick(ok, btn) {
          if (!sel || over) return;
          if (ok) { st[sel] = 1; const id = sel; sel = null; opts.innerHTML = ''; render(); nodes[id].b.focus(); }
          else { btn.classList.add('picked'); btn.dataset.res = 'no'; btn.disabled = true; }
          if (reduced) tick(0.6);
        }
        function tick(dt) {
          if (!running || over) return;
          t += dt;
          const np = t < 18 ? 1 : t < 36 ? 2 : 3;
          if (np !== phase) { phase = np; if (sel) showOpts(); }
          OBJ.forEach((o) => { if (st[o.id] > 0) st[o.id] = Math.max(0, st[o.id] - rate(t) * dt * (0.85 + 0.3 * ((o.id.length * 7) % 5) / 4)); });
          const keep = render();
          if (keep === 0 || t > 95) finish();
        }
        let acc = 0, lastShown = -1;
        const lp = h.loop((dt) => { tick(dt); acc += dt; if (phase === 3 && sel && Math.floor(t / 3) !== lastShown) { lastShown = Math.floor(t / 3); showOpts(); } });
        function start() {
          reset(); running = true; startBtn.hidden = true; nightBtn.hidden = !reduced; render();
          if (!reduced) lp.start();
          nodes[OBJ[0].id].b.focus();
        }
        function finish() {
          over = true; running = false; lp.stop(); sel = null; opts.innerHTML = ''; nightBtn.hidden = true;
          startBtn.hidden = false; startBtn.textContent = '再来一次'; render();
          end.hidden = false; end.innerHTML = '';
          end.append(el('div', { class: 'marquez-sum', html: `你守了 <b>${Math.floor(t / 2.2) + 1}</b> 夜，最多同时记得 <b>${best}</b> 样东西。最后，屋里每样东西都只剩一个问号。这不是你手慢——游戏就是这样设计的：遗忘只会越来越快，而贴标签的手永远只有一双。` }));
          end.append(el('div', { class: 'marquez-sign', html: signSVG() }));
          end.append(el('p', { class: 'marquez-note-s', style: 'margin:0', text: '小说里，镇口立起写着镇名的牌子，主街上还有一块更大的牌子，宣告上帝存在。可是当人们忘了文字本身的意思，牌子也就只剩下木头和墨迹。' }));
          api.unlock();
        }
        function signSVG() {
          return `<svg viewBox="0 0 360 170" role="img" aria-label="镇口的两块木牌：一块写着马孔多，一块宣告上帝存在">
            <g fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round">
              <path d="M70 60v100M250 40v120"/><path d="M10 160h340" stroke="var(--line)"/></g>
            <rect x="22" y="34" width="96" height="34" rx="3" fill="var(--bg2)" stroke="var(--muted)"/>
            <text x="70" y="57" text-anchor="middle" font-size="16" fill="var(--fg)" font-family="var(--cjk-display)">马孔多</text>
            <rect x="178" y="10" width="144" height="40" rx="3" fill="var(--bg2)" stroke="var(--muted)"/>
            <text x="250" y="37" text-anchor="middle" font-size="19" fill="var(--fg)" font-family="var(--cjk-display)">上帝存在</text>
          </svg>`;
        }
        reset();

        reflP(refl, [
          '布恩迪亚家的标签是一个绝妙的寓言：<b>文字是外置的记忆</b>。我们把记不住的东西写下来、贴出去、存进档案——但标签只有在有人还能读懂它的时候才有用。一个忘了“牛”和“挤奶”是什么意思的人，面对一张写着“牛·每天早上要挤奶”的纸，什么也想不起来。',
          '小说里，失眠症是靠一个外人治好的：从死亡里回来的吉卜赛人梅尔基亚德斯带来一剂药水，人们一喝，记忆才回来。也就是说，单靠这个镇子自己，是守不住记忆的。',
          '这一幕是第四幕的预演。个人会忘记，<b>集体也会忘记</b>——而且集体的遗忘有时并非疾病，而是被安排的。下一幕，马孔多将面对一件被官方要求忘掉的事。',
        ]);
        return { hide() { lp.stop(); }, show() { if (running && !over && !reduced) lp.start(); }, destroy() { lp.stop(); } };
      }

      /* ===== Chapter 4: the banana company ===== */
      function ch4(body, api, refl) {
        let step = 0, sub = 0, submitted = false, asked = 0, maxStep = 0;
        let animT = 0; let anim = null; // {kind, t0, dur}
        const tabs = el('div', { class: 'marquez-steps', role: 'group', 'aria-label': '步骤' });
        const tabBtns = STEPS.map((s, i) => { const b = el('button', { type: 'button', class: 'seg', text: `${i + 1} ${s.tab}`, 'aria-pressed': 'false', onclick: () => go(i) }); tabs.append(b); return b; });
        const sceneBox = el('div');
        const cv = h.canvas(sceneBox, { aspect: 0.48, minH: 210, maxH: 340 });
        const tagS = el('div', { class: 'marquez-tagline', text: '示意场景 · 非比例' });
        const roP = h.readout('人口（示意）'), roPl = h.readout('种植园'), roM = h.readout('外国管理者'), roW = h.readout('工资形式');
        const ros = el('div', { class: 'lab-readout' }, [roP.el, roPl.el, roM.el, roW.el]);
        const story = el('div', { class: 'marquez-story', 'aria-live': 'polite' });
        const extra = el('div', { style: 'display:grid;gap:8px;min-width:0' });
        const note = el('div', { class: 'marquez-note', hidden: true }, [el('h5', { text: '你的笔记本' })]);
        const noteLines = NOTE0.map((s) => { const sp = el('span', { class: 'marquez-nl', text: s }); note.append(sp); return sp; });
        const myIn = el('input', { type: 'text', class: 'marquez-in', maxlength: '60', placeholder: '可选：用你自己的话补一句（最多 60 字）', 'aria-label': '在笔记本上补一句你自己的话' });
        myIn.addEventListener('input', () => { if (asked < 4) noteLines[3].textContent = myIn.value.trim() || NOTE0[3]; });
        const prevB = h.button({ label: '← 上一步', onClick: () => go(step - 1, true) });
        const nextB = h.button({ label: '下一步 →', kind: 'primary', onClick: () => onNext() });
        body.append(tabs, sceneBox, tagS, ros, story, extra, note, el('div', {}, [prevB, nextB]));

        // demands
        const DEM = ['宿舍要有像样的卫生设施', '要有真正的医疗服务，而不是人人一样的药丸', '发现金，不发代金券', '承认我们是公司的雇员'];
        const demToggles = DEM.map((d) => h.toggle({ label: d, value: false }));
        const demReply = el('div', { class: 'marquez-reply', hidden: true });
        const demBtn = h.button({ label: '把请愿书递给公司', onClick: () => {
          const n = demToggles.filter((x) => x.get()).length;
          submitted = true; demBtn.disabled = true; demToggles.forEach((x) => (x.el.querySelector('input').disabled = true));
          demReply.hidden = false;
          demReply.innerHTML = `你勾选了 <b>${n}</b> 条。公司的律师们在法庭上证明了一件事：这些工人<b>根本不存在</b>——他们只是零散雇来的临时工，算不上公司的雇员。法庭照此裁决，请愿书一条也没有被回应。<br><span class="marquez-note-s">（小说情节，转述。真实的 1928 年请愿书见第 9 步。）</span>`;
          updNav();
        } });
        const demBox = el('div', { class: 'marquez-demands' }, [...demToggles.map((x) => x.el), el('div', {}, [demBtn]), demReply]);
        // asks
        const askReplies = el('div');
        const askBtns = ASKS.map((a, i) => h.button({ label: '问：' + a.who, onClick: (e) => {
          e.currentTarget.disabled = true; asked++;
          askReplies.append(el('div', { class: 'marquez-reply', html: `<b>${a.who}：</b>${a.say}` }));
          overwrite(noteLines[i], a.line);
          updNav();
        } }));
        const askBox = el('div', {}, [el('div', { class: 'marquez-asks' }, askBtns), askReplies]);
        function overwrite(sp, txt) {
          sp.classList.add('ov');
          if (reduced) { sp.textContent = txt; return; }
          const from = sp.textContent; let k = 0; const L = Math.max(from.length, txt.length);
          const id = setInterval(() => {
            k++; sp.textContent = txt.slice(0, k) + from.slice(k, L).replace(/[^，。]/g, (c, j) => (j % 2 ? '▒' : c));
            if (k >= L) { clearInterval(id); sp.textContent = txt; }
          }, 45);
          timers.push(id);
        }
        const timers = [];
        // history panel
        const estBox = el('div');
        const hist = el('div', { class: 'marquez-hist' });
        hist.append(
          el('div', { class: 'marquez-k', text: '历史 · 哥伦比亚 · 1928' }),
          el('p', { html: '1928 年 11 月 12 日起，哥伦比亚加勒比海岸马格达莱纳省香蕉区的数万名工人（常见说法在 2.5 万以上）对<b>联合果品公司</b>（United Fruit Company）及其承包商发起罢工。' }),
          el('p', { text: '他们的请愿书共九条，内容包括：用现金而不是代金券发工资、按周发薪、取消公司商店、改善宿舍卫生、提供医院服务、工伤赔偿、集体保险，以及不再通过承包商雇人——公司借承包制主张这些工人不是它的雇员，从而规避劳工法。' }),
          el('p', { html: '政府宣布香蕉区戒严，任命<b>卡洛斯·科尔特斯·巴尔加斯</b>将军为军事长官。12 月 5 日深夜至 6 日凌晨，军队在<b>谢纳加</b>（Ciénaga）车站广场向聚集的罢工者及其家属开枪。' }),
          el('p', { text: '死了多少人，至今没有定论：' }),
          estBox,
          el('p', { class: 'marquez-note-s', text: '图注：军方指挥官承认 47 人死亡；美国驻波哥大使馆 1928 年 12 月的电报引用公司法律顾问的说法“500–600 人”，1929 年 1 月的电报引用公司驻波哥大代表的说法“超过 1000 人”；历史学者汇集的各方估计从 47 到约 2000 不等。小说的“约三千”是文学数字。' }),
          el('p', { html: '1929 年 9 月，年轻的自由党议员<b>豪尔赫·埃列塞尔·盖坦</b>在国会就此事发起了持续数日的辩论，指控军方与公司的责任；他事前到香蕉区搜集了证词。此事让他成为全国性的政治人物。' }),
          el('p', { html: '加西亚·马尔克斯 1927 年生在同一片香蕉区的<b>阿拉卡塔卡</b>，就在谢纳加附近。他出生的第二年发生了这一切；他是听着大人们对这件事的讲述——以及沉默——长大的。' }),
          el('p', { html: '小说里“约三千人”的数字是文学性的，不是统计。但对世界上许多读者、甚至许多哥伦比亚人来说，小说里的那个版本后来<b>成了这件事被记住的样子</b>。这本身也引发争议：2017 年一位哥伦比亚议员公开称这场屠杀是被夸大的“神话”，随即遭到众多历史学者以档案证据反驳。虚构、记忆与史实之间的张力至今仍在。' }),
        );
        const est = h.canvas(estBox, { aspect: 0.42, minH: 190, maxH: 250 });
        function drawEst() {
          const g = est.g, W = est.w, Hh = est.h; g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const L = Math.min(130, W * 0.34), Rr = 16, top = 10, bot = 30;
          const lo = Math.log10(10), hi = Math.log10(5000);
          const X = (v) => L + (Math.log10(v) - lo) / (hi - lo) * (W - L - Rr);
          const rows = [
            { t: '军方承认', a: 47, b: 47, c: '--s1' },
            { t: '美使馆 1928.12', a: 500, b: 600, c: '--s2' },
            { t: '美使馆 1929.1', a: 1000, b: 1000, c: '--s2', more: true },
            { t: '学者汇集的估计', a: 47, b: 2000, c: '--muted' },
            { t: '小说（非统计）', a: 3000, b: 3000, c: '--accent', lit: true },
          ];
          const rh = (Hh - top - bot) / rows.length;
          g.strokeStyle = C('--grid'); g.lineWidth = 1; g.font = font(10, '--mono-font'); g.fillStyle = C('--muted'); g.textAlign = 'center'; g.textBaseline = 'top';
          [10, 30, 100, 300, 1000, 3000].forEach((v) => { const x = X(v); g.beginPath(); g.moveTo(x, top); g.lineTo(x, Hh - bot); g.stroke(); g.fillText(String(v), x, Hh - bot + 4); });
          g.textBaseline = 'bottom'; g.fillText('死亡人数（对数刻度）', L + (W - L - Rr) / 2, Hh - 1);
          rows.forEach((r, i) => {
            const y = top + rh * (i + 0.5);
            g.font = font(W < 420 ? 10 : 11); g.fillStyle = C('--fg'); g.textAlign = 'right'; g.textBaseline = 'middle';
            let t = r.t; while (g.measureText(t).width > L - 8 && t.length > 4) t = t.slice(0, -2) + '…';
            g.fillText(t, L - 8, y);
            g.strokeStyle = C(r.c); g.fillStyle = C(r.c); g.lineWidth = 4; g.lineCap = 'round';
            if (r.a !== r.b) { g.beginPath(); g.moveTo(X(r.a), y); g.lineTo(X(r.b), y); g.stroke(); }
            g.beginPath(); g.arc(X(r.a), y, 4, 0, Math.PI * 2); g.fill();
            if (r.a !== r.b) { g.beginPath(); g.arc(X(r.b), y, 4, 0, Math.PI * 2); g.fill(); }
            if (r.more) { g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(r.a) + 6, y); g.lineTo(X(r.a) + 18, y); g.moveTo(X(r.a) + 14, y - 4); g.lineTo(X(r.a) + 18, y); g.lineTo(X(r.a) + 14, y + 4); g.stroke(); }
            if (r.lit) { g.setLineDash([2, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(X(r.a), y - rh * 0.4); g.lineTo(X(r.a), y + rh * 0.4); g.stroke(); g.setLineDash([]); }
          });
          g.lineCap = 'butt';
        }
        est.onResize(drawEst); redraws.add(drawEst);

        function setStoryHTML(x) { story.innerHTML = x; }
        function updNav() {
          prevB.disabled = step === 0 && sub === 0;
          let ok = true;
          if (STEPS[step].demands && !submitted) ok = false;
          if (STEPS[step].ask && asked < ASKS.length) ok = false;
          if (step === STEPS.length - 1) ok = false;
          nextB.disabled = !ok;
          nextB.textContent = STEPS[step].square && sub < 3 ? (sub === 1 ? '（几分钟过去了）→' : '继续 →') : step === 7 ? '切到真实历史 →' : '下一步 →';
          tabBtns.forEach((b, i) => { b.setAttribute('aria-pressed', String(i === step)); b.disabled = i > maxStep; });
        }
        function onNext() {
          if (STEPS[step].square && sub < 3) { sub++; enterSub(); return; }
          go(step + 1);
        }
        function enterSub() {
          setStoryHTML(SQUARE[sub]);
          extra.innerHTML = '';
          if (sub === 2) startAnim('fade', 2.6);
          if (sub === 3) { startAnim('train', 7); note.hidden = false; extra.append(myIn); }
          draw(); updNav();
        }
        function go(i, back) {
          if (i < 0 || i >= STEPS.length) return;
          if (back && STEPS[step].square && sub > 0) { sub--; enterSub(); return; }
          step = i; maxStep = Math.max(maxStep, i);
          const S = STEPS[i];
          sub = S.square ? (back ? 3 : 0) : 0;
          roP.set(S.pop); roPl.set(S.plant); roM.set(S.mgr); roW.set(S.wage);
          extra.innerHTML = '';
          sceneBox.hidden = !!S.hist; tagS.hidden = !!S.hist; ros.hidden = !!S.hist;
          note.hidden = !(i > 6 || (S.square && sub === 3));
          if (S.square) { enterSub(); }
          else {
            setStoryHTML(S.html);
            if (S.demands) extra.append(demBox);
            if (S.ask) extra.append(askBox);
            if (S.hist) { extra.append(hist); }
          }
          if (i === 0) startAnim('arrive', 3.5);
          else if (S.rain) { startAnim('rain', 1e9); api.unlock(); }
          else if (!S.square) stopAnim();
          draw(); updNav();
        }

        // scene
        function startAnim(kind, dur) { anim = { kind, dur }; animT = 0; if (reduced) { animT = kind === 'rain' ? 0 : dur; lp.stop(); } else lp.start(); }
        function stopAnim() { anim = null; lp.stop(); }
        const lp = h.loop((dt) => { animT += dt; draw(); if (anim && animT > anim.dur) { lp.stop(); } });
        function house(g, x, y, w, hh, col) { g.strokeStyle = col; g.lineWidth = 1.2; g.strokeRect(x, y - hh, w, hh); g.beginPath(); g.moveTo(x - 2, y - hh); g.lineTo(x + w / 2, y - hh - w * 0.45); g.lineTo(x + w + 2, y - hh); g.stroke(); }
        function trainAt(g, x, y, cars, col, closed) {
          g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 1.2;
          g.fillRect(x, y - 13, 26, 13); g.fillRect(x + 4, y - 20, 6, 7);
          for (let k = 0; k < cars; k++) { const cx = x + 30 + k * 24; if (closed) g.strokeRect(cx, y - 11, 20, 11); else g.fillRect(cx, y - 11, 20, 11); }
        }
        function draw() {
          const g = cv.g, W = cv.w, Hh = cv.h; const S = STEPS[step];
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const G = Hh * 0.7, T = Hh * 0.84;
          const muted = C('--muted'), fg = C('--fg'), line = C('--line');
          let wash = 1;
          if (S.rain) wash = reduced ? 0.45 : Math.max(0.35, 1 - animT / 12);
          g.save(); g.globalAlpha = wash;
          // ground & track
          g.strokeStyle = line; g.lineWidth = 1; g.beginPath(); g.moveTo(0, G); g.lineTo(W, G); g.stroke();
          g.strokeStyle = muted; g.beginPath(); g.moveTo(0, T); g.lineTo(W, T); g.moveTo(0, T + 4); g.lineTo(W, T + 4); g.stroke();
          for (let x = 4; x < W; x += 12) { g.beginPath(); g.moveTo(x, T - 1); g.lineTo(x, T + 5); g.stroke(); }
          // houses (town, left)
          const hw = Math.max(14, Math.min(20, W / 34));
          for (let k = 0; k < S.houses; k++) {
            const row = k % 2, col = Math.floor(k / 2);
            const x = 10 + col * (hw + 8) + row * 8; const y = G - row * 0; if (x > W * 0.36) continue;
            house(g, x, y - (row ? 26 : 0), hw, hw * 0.75, row ? line : muted);
          }
          // station
          const sx = W * 0.42; g.strokeStyle = fg; g.lineWidth = 1.2; g.strokeRect(sx, G - 22, 34, 22); g.beginPath(); g.moveTo(sx - 4, G - 22); g.lineTo(sx + 38, G - 22); g.stroke();
          g.fillStyle = muted; g.font = font(10); g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText('车站', sx + 17, G + 3);
          // plantation (right)
          const px0 = W * 0.6, px1 = W - 10;
          for (let r = 0; r < S.rows; r++) {
            const y = G - 8 - r * 16;
            for (let x = px0 + (r % 2) * 7; x < px1; x += 14) {
              g.strokeStyle = C('--s3'); g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 9);
              g.moveTo(x, y - 9); g.quadraticCurveTo(x - 6, y - 12, x - 7, y - 7); g.moveTo(x, y - 9); g.quadraticCurveTo(x + 6, y - 12, x + 7, y - 7); g.stroke();
            }
          }
          if (S.rows) { g.fillStyle = muted; g.font = font(10); g.textAlign = 'right'; g.textBaseline = 'top'; g.fillText('香蕉种植园', px1, G + 3); }
          // compound
          if (S.cmp) {
            const cx0 = W * 0.6, cy0 = Hh * 0.06, cw = W * 0.36, ch = Hh * 0.22;
            g.setLineDash([2, 3]); g.strokeStyle = C('--s4'); g.lineWidth = 1; g.strokeRect(cx0, cy0, cw, ch); g.setLineDash([]);
            for (let k = 0; k < 3; k++) house(g, cx0 + 10 + k * (cw - 20) / 3, cy0 + ch - 6, Math.min(18, cw / 6), 10, C('--s4'));
            g.fillStyle = muted; g.font = font(10); g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('铁丝网后的外国人住宅区', cx0, cy0 + ch + 3);
          }
          // soldiers
          if (S.sold || (S.square && sub < 3)) {
            g.strokeStyle = fg; g.lineWidth = 1.6;
            const n = 9; for (let k = 0; k < n; k++) { const x = W * 0.38 + k * 6, y = G - 30; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 9); g.stroke(); g.beginPath(); g.arc(x, y - 11, 1.6, 0, Math.PI * 2); g.stroke(); }
          }
          // crowd in square
          if (S.square && sub <= 2) {
            let a = 1; if (sub === 2) a = Math.max(0, 1 - animT / (anim ? anim.dur : 1));
            g.fillStyle = C('--s1'); g.globalAlpha = wash * a;
            const x0 = W * 0.36, x1 = W * 0.58, y0 = G - 64, y1 = G - 36;
            const hs = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
            for (let k = 0; k < 120; k++) { const x = x0 + hs(k) * (x1 - x0), y = y0 + hs(k + 500) * (y1 - y0); g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill(); }
            g.globalAlpha = wash;
            if (sub === 2 && a <= 0.01) { g.fillStyle = muted; g.font = font(12); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('（空白）', (x0 + x1) / 2, (y0 + y1) / 2); }
          }
          // trains
          if (step === 0) {
            const p = anim ? Math.min(1, animT / anim.dur) : 1; const e = 1 - Math.pow(1 - p, 3);
            trainAt(g, W + 10 - e * (W * 0.62), T - 2, 4, C('--accent'), false);
          } else if (S.square && sub === 3) {
            const p = anim ? Math.min(1, animT / anim.dur) : 1;
            const cars = 40; const len = 30 + cars * 24;
            const x = reduced ? -len * 0.35 : -len + p * (W + len * 0.9);
            trainAt(g, Math.max(-len, x) + len - 26, T - 2, 0, fg, true);
            for (let k = 0; k < cars; k++) { const cx = x + k * 24; if (cx > -24 && cx < W) { g.strokeStyle = fg; g.lineWidth = 1.2; g.strokeRect(cx, T - 13, 20, 11); } }
            g.fillStyle = muted; g.font = font(10); g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText('开往海边 →', W - 6, T - 18);
          } else if (step >= 1 && step <= 3) {
            trainAt(g, W * 0.38 + 0, T - 2, 4, C('--accent'), false);
          }
          g.restore();
          // rain
          if (S.rain) {
            g.strokeStyle = C('--s1'); g.globalAlpha = 0.45; g.lineWidth = 1;
            const off = reduced ? 0 : (animT * 220);
            for (let k = 0; k < Math.round(W / 6); k++) {
              const x = (k * 53) % W; const y = ((k * 97 + off) % (Hh + 20)) - 20;
              g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + 12); g.stroke();
            }
            g.globalAlpha = 1; g.fillStyle = fg; g.font = font(13); g.textAlign = 'left'; g.textBaseline = 'top';
            g.fillText('4 年 11 个月零 2 天', 10, 8);
          }
        }
        cv.onResize(draw); redraws.add(draw);
        go(0);

        reflP(refl, [
          '小说写的不只是一场屠杀，更是<b>第二重暴力：抹除</b>。枪声之后，官方版本一遍遍重复，直到唯一记得的人显得像个疯子——何塞·阿尔卡蒂奥第二后来把自己关进梅尔基亚德斯的房间，一遍遍对来访者念叨那个数字。你的笔记本被改写的过程，就是这件事的缩影：并不需要有人撕掉它，只需要每个人都换一种说法。',
          '在这里，魔幻现实主义倒转了方向：第一幕里，不可能的事被说得像家常；这一幕里，<b>真实发生的事被说成了不可能</b>。官方否认本身，比任何升天的姑娘都更“魔幻”。',
          '而文学填补了档案的空白。几十年后，对世界上许多读者来说，“香蕉园大屠杀”首先就是小说里的那一段——这是虚构的力量，也是它的风险：它能让一件被埋的事重新被看见，但它的数字不是史学的数字。好的读者两样都要记得。',
        ]);
        return { hide() { lp.stop(); }, show() { if (anim && !reduced && (STEPS[step].rain || animT < anim.dur)) lp.start(); draw(); }, destroy() { lp.stop(); timers.forEach(clearInterval); cv.destroy(); est.destroy(); } };
      }

      /* ===== Chapter 5: solitude and a second chance ===== */
      function ch5(body, api, refl) {
        const items = TL.map((x) => {
          const li = el('li', { 'data-on': '0' }, [el('span', { class: 'marquez-tly', text: String(x.y) }), el('span', { class: 'marquez-tlh', text: x.h }), el('p', { class: 'marquez-tlt', text: x.t })]);
          return { x, li };
        });
        const tl = el('ol', { class: 'marquez-tl', 'aria-label': '时间线' }, items.map((i) => i.li));
        const yr = h.slider({ label: '年份', min: 1899, max: 2024, step: 1, value: 1928, format: (v) => String(v), onInput: (v) => setYear(v) });
        function setYear(v) { items.forEach(({ x, li }) => (li.dataset.on = x.y <= v ? '1' : '0')); }
        setYear(1928);
        body.append(el('div', { class: 'lab-controls' }, [yr.el]), tl);

        body.append(el('div', { class: 'marquez-frame', html: '<p><b>同一组事实，两种读法。</b>下面是 1970–80 年代拉丁美洲的几件事，大多取自马尔克斯在诺奖演讲中列举的内容（数字为他当时引用的估计，个别补充了今天的史料）。先用“外部视角”读——像一个隔着大洋翻报纸的人；再切到“内部视角”。</p>' }));
        const facts = el('div', { class: 'marquez-facts', 'data-view': 'out' });
        const fps = FACTS.map((f) => { const p = el('p', { text: f.out }); facts.append(el('div', { class: 'marquez-fact' }, [el('h5', { text: f.h }), p])); return { f, p }; });
        let toggled = false;
        const vc = h.choice({ label: '视角', options: [{ value: 'out', label: '外部视角' }, { value: 'in', label: '内部视角' }], value: 'out', onChange: (v) => {
          facts.dataset.view = v; fps.forEach(({ f, p }) => (p.textContent = v === 'in' ? f.in : f.out));
          if (v === 'in' && !toggled) { toggled = true; api.unlock(); }
        } });
        body.append(vc.el, facts, el('p', { class: 'marquez-note-s', style: 'margin:0', text: '这是一个阅读练习，不是对任何国家或政治立场的评判；“外部视角”是对一种距离感的模拟，并非引自任何具体的报道。' }));

        reflP(refl, [
          '这正是 1982 年 12 月 8 日那篇演讲——《拉丁美洲的孤独》——的论证。转述其大意：欧洲的理性头脑习惯用衡量自己的尺子来衡量拉丁美洲，忘了他们自己的历史也曾漫长而血腥；用别人的尺子解读我们的现实，只会让我们更不为人知、更不自由、<b>更孤独</b>。他也拒绝把这片大陆的暴力简单归结为外来的阴谋，认为它扎根于积累了几个世纪的不公；他希望远方的同情能变成实际的支持。',
          '演讲的结尾，他提到老师福克纳当年拒绝接受“人类的末日”，又承认核毁灭在今天已是科学上的可能。但他说，面对压迫、掠夺和遗弃，这片大陆的回答始终是生命本身；现在开始建造一种新的、以生命为中心的乌托邦还不算太晚——在那里，没有人能替别人决定怎样死去，爱和幸福真正可能，而那些被判处百年孤独的族群，终于能在世上得到<b>第二次机会</b>。这正是把第二幕里小说的最后判决，在讲台上翻转了过来。',
          '这本书也改变了拉丁美洲看自己的方式：本地的传说、祖父母的故事、被官方抹掉的事件，不再是“落后”的标记，而是可以进入世界文学的材料。这种启示远远传到了别处——托妮·莫里森、萨尔曼·拉什迪等作家都谈到过他的影响；在八十年代的中国，它和“寻根”的冲动相遇，让一代作家回头去写自己的高密、自己的湘西、自己的村庄。',
        ]);
        const closeBox = el('div');
        const cvc = h.canvas(closeBox, { aspect: 0.22, minH: 110, maxH: 170 });
        let F = flock(14, cvc.w, cvc.h, 3);
        const drawClose = () => {
          const g = cvc.g, W = cvc.w, Hh = cvc.h; g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const col = C('--accent'); F.forEach((b) => butterfly(g, b.x, b.y, b.s, b.ph, b.a + Math.PI / 2, col, 0.8));
        };
        cvc.onResize((W, Hh) => { F = flock(Math.max(8, Math.round(W / 50)), W, Hh, 3); drawClose(); }); redraws.add(drawClose);
        const cl = h.loop((dt) => { stepFlock(F, dt, cvc.w, cvc.h, true); drawClose(); });
        refl.append(closeBox, el('p', { class: 'marquez-final', text: '马孔多是虚构的。但一个大陆的人在这个虚构的小镇里认出了自己的祖父母、自己的战争、自己被要求忘掉的那一夜——这件事是真的。孤独没有被治好；它只是第一次被讲成了一个所有人都听得懂的故事。' }));
        drawClose();
        const unlocked = () => !refl.hidden;
        const watch = setInterval(() => { if (unlocked() && !reduced && visible && !cl.running) cl.start(); }, 400);
        let visible = true;
        return { show() { visible = true; }, hide() { visible = false; cl.stop(); }, destroy() { clearInterval(watch); cl.stop(); cvc.destroy(); } };
      }

      open(0);
      return {
        destroy() {
          built.forEach((b) => { try { b.handle && b.handle.destroy && b.handle.destroy(); } catch (e) {} });
          cleanups.forEach((f) => { try { f(); } catch (e) {} });
          redraws.clear();
          root.innerHTML = '';
        },
      };
    },
  };
})();
