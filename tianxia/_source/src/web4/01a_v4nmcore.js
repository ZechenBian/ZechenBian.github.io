// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 网页版 v4 · 房间名与昵称的检查 =====================
 * 依据《互联网用户账号信息管理规定》（国家网信办，2022 年 8 月 1 日起施行）第八条与《网络信息内容生态治理规定》第六、七条：
 * 名称里不得有违法与不良信息；不得假冒、仿冒党政军机关、新闻媒体等的名称，不得擅自使用“新闻”“报道”；不得夹带网址、邮箱、联系方式，
 * 不得用同音、谐音、相近的字符规避。这里做四类检查：
 *   1. 长度与字符：只允许汉字、字母、数字、空格和少数标点（不收表情符号与旗帜符号）；
 *   2. 联系方式与网址：网址、邮箱、六位以上的数字串、“加微信/QQ群”之类；
 *   3. 假冒机构：官方、客服、管理员、党政军机关与新闻媒体的名称、“新闻”“报道”；
 *   4. 禁用词：只以摘要（53 位散列）的形式写进页面（src/web4/01a_v4nmdata.js，由 tools/v4_names/gen.js 生成），源码里看不到原词。
 * 检查前先统一写法：全角转半角、转小写、去掉零宽字符、繁体转简体（常见字）、常见的数字字母替代（0→o、1→i、3→e、4→a、5→s、7→t、@→a、$→s），
 * 再分别在“只留汉字”“只留字母数字汉字”“只留字母”三种写法里逐段比对，所以夹空格、夹符号、夹数字都躲不过去。
 * 建局与改昵称时检查；对局列表、大厅、席位表显示别人的名称时再检查一遍（中继没有身份验证，别人可以绕开页面直接写），不合规的一律显示成默认名。 */
const TXNM = (() => {
  const ZW = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u00AD\u034F\u180E]/g;
  // 常见繁体字 → 简体（只收禁用词里用得到的字）
  const T2S = {
    臺: '台', 獨: '独', 灣: '湾', 華: '华', 國: '国', 輪: '轮', 達: '达', 賴: '赖', 黨: '党', 習: '习', 澤: '泽', 東: '东', 鄧: '邓', 錦: '锦', 濤: '涛',
    溫: '温', 寶: '宝', 強: '强', 樂: '乐', 際: '际', 滬: '沪', 寧: '宁', 紀: '纪', 萬: '万', 歲: '岁', 軍: '军', 團: '团', 報: '报', 導: '导', 網: '网',
    賭: '赌', 場: '场', 彩: '彩', 嫖: '嫖', 賣: '卖', 視: '视', 頻: '频', 槍: '枪', 彈: '弹', 藥: '药', 襲: '袭', 擊: '击', 聖: '圣', 戰: '战', 傻: '傻',
    媽: '妈', 雞: '鸡', 婊: '婊', 賤: '贱', 雜: '杂', 種: '种', 廢: '废', 腦: '脑', 殘: '残', 礙: '碍', 滾: '滚', 殺: '杀', 門: '门', 時: '时', 運: '运',
    動: '动', 鬥: '斗', 爭: '争', 會: '会', 員: '员', 務: '务', 院: '院', 聞: '闻', 處: '处', 員: '员', 機: '机', 關: '关', 號: '号', 群: '群', 線: '线',
    體: '体', 僞: '伪', 偽: '伪', 亂: '乱', 倫: '伦', 陰: '阴', 莖: '茎', 慰: '慰', 毒: '毒', 販: '贩', 嗎: '吗', 啡: '啡', 麻: '麻', 頭: '头', 搖: '摇',
    龍: '龙', 鳳: '凤', 樓: '楼', 圍: '围', 姦: '奸', 爾: '尔', 開: '开', 錫: '锡', 熙: '熙', 劃: '划', 鋒: '锋', 紫: '紫', 陽: '阳', 澳: '澳', 盤: '盘',
    發: '发', 變: '变', 屍: '尸', 鬼: '鬼', 蠻: '蛮', 綠: '绿', 豬: '猪', 猴: '猴', 營: '营', 摘: '摘', 器: '器', 官: '官', 鎮: '镇', 壓: '压', 殺: '杀',
    訊: '讯', 聯: '联', 絡: '络', 電: '电', 記: '记', 協: '协', 衛: '卫', 視: '视', 臺: '台', 喪: '丧', 屌: '屌', 幹: '干', 這: '这', 個: '个', 們: '们',
  };
  const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
  const base = s => String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(ZW, '').replace(/[\u3400-\u9FFF\uF900-\uFAFF]/g, c => T2S[c] || c);
  const exc = s => s.replace(/独(特|家|到|白|奏|唱|处|享|占鳌头)/g, '〇$1'); // “西藏独特风光”“香港独家”之类不算
  const leet = s => s.replace(/[0134578@$]/g, c => LEET[c] || c);
  /* 三种写法：只留汉字、只留字母数字汉字、只留字母（数字字母替代之后）；外加按非字母数字切开的单词（单字母连写拼回去） */
  function forms(s) {
    const b = base(s);
    const cjk = exc(b.replace(/[^\u3400-\u9FFF]/g, ''));
    const aln = exc(b.replace(/[^a-z0-9\u3400-\u9FFF]/g, ''));
    const lat = leet(b.replace(/[^a-z0-9@$]/g, '')).replace(/[^a-z]/g, '');
    const toks = b.split(/[^a-z0-9@$]+/).filter(Boolean).map(leet);
    const words = new Set(toks.map(w => w.replace(/[^a-z]/g, '')).filter(Boolean));
    let run = ''; for (const w of toks) { if (w.length === 1) run += w; else { if (run.length > 1) words.add(run); run = ''; } } if (run.length > 1) words.add(run);
    return { b, cjk, aln, lat, words: [...words] };
  }
  /* cyrb53（公开领域的 53 位散列），生成器与页面用同一份 */
  function h53(str) {
    let h1 = 0xdeadbeef ^ 7, h2 = 0x41c6ce57 ^ 7;
    for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  const DATA = { S: new Set(), L: [], W: new Set() };
  function add(d) { for (const x of d.S || []) DATA.S.add(x); for (const x of d.W || []) DATA.W.add(x); DATA.L = [...new Set(DATA.L.concat(d.L || []))].sort((a, b) => a - b); }
  /* 假冒机构与“新闻”“报道”（不敏感，直接写明文） */
  const FAKE = ['官方', '官网', '客服', '管理员', '系统通知', '系统消息', '国务院', '中共中央', '党中央', '中央军委', '中央委员会', '全国人大', '政协', '外交部', '国防部', '公安部', '公安局', '派出所', '武警', '解放军', '新华社', '人民日报', '央视', '中央电视台', '网信办', '国家安全部', '新闻', '报道', '联合国官方'];
  const FAKE_EN = ['official', 'admin', 'moderator', 'cctv', 'xinhua'];
  const CONTACT = [/(https?:|www\.|\.(com|cn|net|org|io|xyz|top|me|cc|tk|vip|club|site|online|app|dev|info|biz|ru|hk|tw)(\b|$))/i, /[^\s@]+@[^\s@]+\.[a-z]{2,}/i, /\d{6,}/, /[零〇一二三四五六七八九壹贰叁肆伍陆柒捌玖]{6,}/,
    /(微信|威信|薇信|v信|vx号|加v|加微|qq群|qq号|扣扣|企鹅号|群号|加群|进群|电报|telegram|whatsapp|wechat|discord\.gg|t\.me)/i, /(^|[^a-z])(vx|wx|qq|tg)([^a-z]|$)/i];
  const OK_CH = /^[\u3400-\u9FFF\uF900-\uFAFFA-Za-z0-9 ·•\-_.,!?()（）【】《》、，。！？：:'"&+#~\u3000]+$/;
  const LIM = { room: 24, nick: 16, chat: 300 };
  /* 返回 null 表示合规；否则返回原因：empty / long / chars / contact / fake / banned */
  function why(s, kind) {
    const raw = String(s == null ? '' : s).normalize('NFKC').replace(ZW, '').trim();
    if (!raw) return 'empty';
    if ([...raw].length > (LIM[kind] || 24)) return 'long';
    if (kind !== 'chat' && !OK_CH.test(raw)) return 'chars';
    if (/[\u{1F1E6}-\u{1F1FF}]/u.test(raw)) return 'chars'; // 旗帜符号
    if (CONTACT.some(re => re.test(raw))) return 'contact';
    const f = forms(raw);
    if (FAKE.some(w => f.cjk.includes(w) || f.aln.includes(w))) return 'fake';
    if (f.words.some(w => FAKE_EN.some(x => w === x || w.startsWith(x)))) return 'fake'; // 按整词（badminton 里的 admin 不算）
    if (f.words.some(w => DATA.W.has(h53(w)))) return 'banned';
    for (const str of [f.cjk, f.aln, f.lat]) for (const L of DATA.L) for (let i = 0; i + L <= str.length; i++) if (DATA.S.has(h53(str.slice(i, i + L)))) return 'banned';
    return null;
  }
  const ok = (s, kind) => why(s, kind) === null;
  return { base, forms, h53, add, why, ok, LIM, _data: DATA };
})();
try { window.TXNM = TXNM; } catch (e) { }
