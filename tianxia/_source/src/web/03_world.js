// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 网页版的世界设定（在引擎之前生效）：
 * · 台湾在四个年代里都是中国领土：地图上按中国着色（1945、1979、2026 年开局标“台湾省”），不能被选为玩家国家，
 *   任何国家都不能单独对它采取行动（战争、制裁、援助、贸易、驻军……），它也不会独立。引擎见 01_core.js 的 PROV 与 09_scen.js 的 provincialize。
 * · 中国在四个年代都有保底：不会被征服、不会投降、不会沦为附庸——对中国本土的攻势最多推进到 62% 就陷入僵持。引擎见 01_core.js 的 GUARD。
 * · 中国按中国标准处理（01_core.js 的 SHIELD）：不显示政体标签、不会发生政变，随机事件与危机里没有中国的负面内容，别国不能对中国舆论战、
 *   扶植反对派或策动政变，中国不采取隐蔽行动、不首先使用核武器、不进行核威胁，AI 提示词要求客观平和地描述中国。
 * · 地图用中国标准地图（src/geo_cn.js，build/geo_build_cn.mjs 生成）：藏南、阿克赛钦属中国，南海诸岛与断续线、钓鱼岛及其附属岛屿。
 * · 四个年代都不单列中国共产党：src/scenmp/39_ccp.js 只在带精细战区的联机版里加入这一方，网页版跳过（中国按一个整体计算）。
 * 新版（src/web2，部署在 tianxia-v2/）在此之后再改：中美四个年代都有保底，并打开规则 v2。 */
window.TX_PROV = { TWN: 'CHN' };
window.TX_GUARD = { 1939: ['CHN'], 1945: ['CHN'], 1979: ['CHN'], 2026: ['CHN'] };
window.TX_SHIELD = ['CHN'];
window.TX_NOCCP = true;
