// 组装单文件页面：src/* → out/tianxia.html（单人版）；node build.js mp → out/tianxia_mp.html（联机版）
// node build.js web → out/tianxia_web.html：可以放到 GitHub Pages 等普通网站上的联机版（不含精细战区；联网经公共 MQTT 中继，见 src/web）
// node build.js mp nth → 联机版去掉精细战区的数据
// node build.js web2 → out/tianxia_web2.html：合并操作的新版（规则 v2、六个页签、统一输入框；部署在 tianxia-v2/），在网页版之上再加 src/web2
// node build.js web3 → out/tianxia_web3.html：行动力按百分比的新版（规则 v3；部署在 tianxia-v3/），在 v2 之上再加 src/web3
// node build.js web4 → out/tianxia_web4.html：v4（房间名过滤与密码、单机任务、局势说明、简化模式、详细教程、地图动画；部署在 tianxia-v4/），在 v3 之上再加 src/web4
const fs = require('fs'), path = require('path');
const WEB4 = process.argv.includes('web4');
const WEB3 = process.argv.includes('web3') || WEB4;
const WEB2 = process.argv.includes('web2') || WEB3;
const WEB = process.argv.includes('web') || WEB2;
const MP = process.argv.includes('mp') || WEB;
const NTH = WEB || process.argv.includes('nth');
const dir = __dirname + '/src/';
let html = fs.readFileSync(dir + 'shell.html', 'utf8');
const rd = f => fs.readFileSync(dir + f, 'utf8');
const ls = sub => (fs.existsSync(dir + sub) ? fs.readdirSync(dir + sub).filter(f => f.endsWith('.js')).map(f => sub + '/' + f) : []);
const cat = sub => ls(sub).sort().map(rd).join('\n');
const byBase = (a, b) => path.basename(a).localeCompare(path.basename(b));
const put = (k, v) => { if (!html.includes(k)) throw new Error('missing ' + k); html = html.split(k).join(v.replace(/<\/script/gi, '<\\/script')); };
if (WEB) { const js = ls('web').concat(WEB2 ? ls('web2') : []).concat(WEB3 ? ls('web3') : []).concat(WEB4 ? ls('web4') : []).sort(byBase).map(rd).join('\n').replace(/<\/script/gi, '<\\/script'); if (!html.includes('<script>\n/*__GEO__*/')) throw new Error('missing geo script'); html = html.split('<script>\n/*__GEO__*/').join('<script>\n' + js + '\n</script>\n<script>\n/*__GEO__*/'); } // 网页版：先装上联机后端
put('/*__STYLE__*/', rd('style.css') + (MP && fs.existsSync(dir + 'uimp/mp.css') ? '\n' + rd('uimp/mp.css') : '') + (WEB && fs.existsSync(dir + 'web/web.css') ? '\n' + rd('web/web.css') : '') + (WEB2 && fs.existsSync(dir + 'web2/v2.css') ? '\n' + rd('web2/v2.css') : '') + (WEB3 && fs.existsSync(dir + 'web3/v3.css') ? '\n' + rd('web3/v3.css') : '') + (WEB4 && fs.existsSync(dir + 'web4/v4.css') ? '\n' + rd('web4/v4.css') : ''));
put('/*__GEO__*/', rd(WEB && fs.existsSync(dir + 'geo_cn.js') ? 'geo_cn.js' : 'geo.js') + '\n' + // 网页版用中国标准地图（build/geo_build_cn.mjs 生成；引擎用到的字段与 geo.js 相同）
   (fs.existsSync(dir + 'cities.js') ? rd('cities.js') : '') + (fs.existsSync(dir + 'layers.js') ? '\n' + rd('layers.js') : '')); // 地图图层数据（tools/layers.mjs 生成）
const scenmp = ls('scenmp').filter(f => !(NTH && /\/4\d_th_/.test(f))).sort().map(rd).join('\n'); // 不含精细战区时去掉战区数据（中共的数据保留：没有精细战区时并入中华民国）
put('/*__DATA__*/', rd('data.js') + '\n' + cat('scen') + (MP ? '\n' + scenmp : '')); // 联机版专有数据（精细战区、中共）
put('/*__I18N__*/', rd('i18n.js') + '\n' + cat('lang') + (WEB ? '\n' + cat('web/lang') : '') + (WEB2 ? '\n' + cat('web2/lang') : '') + (WEB3 ? '\n' + cat('web3/lang') : '') + (WEB4 ? '\n' + cat('web4/lang') : ''));
put('/*__ENGINE__*/', cat('engine').replace("if (typeof module !== 'undefined') module.exports = WG;", ''));
put('/*__LLM__*/', rd('llm.js'));
// 界面：联机版把 src/uimp 的文件按文件名插入到 src/ui 之间（同一作用域，05_boot.js 最后）；网页版再加上 src/web/ui（AI 推演接口的设置界面）
const ui = ls('ui').concat(MP ? ls('uimp') : []).concat(WEB ? ls('web/ui') : []).concat(WEB2 ? ls('web2/ui') : []).concat(WEB3 ? ls('web3/ui') : []).concat(WEB4 ? ls('web4/ui') : []).sort(byBase);
put('/*__UI__*/', (MP ? 'window.TX_MP = true;\n' : '') + (WEB ? 'window.TX_WEB = true;\n' : '') + ui.map(rd).join('\n'));
if (MP) html = html.replace('<title>天下棋局</title>', WEB4 ? '<title>天下棋局·联机版 v4</title>' : WEB3 ? '<title>天下棋局·联机版 v3</title>' : WEB2 ? '<title>天下棋局·联机版 v2</title>' : '<title>天下棋局·联机版</title>');
if (WEB) { // 普通网站要完整的 HTML 文档（claude.ai 会自己补上外壳）
  const at = html.indexOf('<div class="app"');
  const lic = '<!--\n  Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。\n  Not open source: no copying, modification, redistribution, commercial use or AI/ML training without written permission.\n  非开源：未经书面许可，不得复制、修改、再分发、商用或用于 AI/机器学习训练。\n  License: https://github.com/ZechenBian/zechenbian.github.io/blob/main/LICENSE\n-->\n';
  const meta = '<meta name="author" content="Zechen Bian">\n<meta name="copyright" content="© 2026 Zechen Bian. All rights reserved.">\n<meta name="robots" content="noai, noimageai">\n<link rel="license" href="https://github.com/ZechenBian/zechenbian.github.io/blob/main/LICENSE">\n';
  html = '<!doctype html>\n' + lic + '<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' + meta + '<meta name="description" content="' + (WEB4 ? '天下棋局·联机版 v4（单机任务、局势说明、简化模式、详细教程、地图动画，房间可设密码）' : WEB3 ? '天下棋局·联机版 v3（行动力按百分比，一个回合能做更多事）' : WEB2 ? '天下棋局·联机版 v2（合并操作的新版）' : '天下棋局·联机版') + '：1939、1945、1979、2026 四个年代开局的大战略推演，和朋友在各自的设备上联网对弈">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n' + html.slice(0, at) + '</head>\n<body>\n' + html.slice(at) + '\n</body>\n</html>\n';
}
if (WEB4) { // v4：谷歌字体改成不挡页面加载（国内打不开时先用系统字体显示，不白屏）
  const fl = /<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)">/;
  if (!fl.test(html)) throw new Error('missing font link');
  html = html.replace(fl, (m, u) => `<link rel="stylesheet" href="${u}" media="print" onload="this.media='all'"><noscript><link rel="stylesheet" href="${u}"></noscript>`);
}
fs.mkdirSync(__dirname + '/out', { recursive: true });
const out = __dirname + '/out/' + (WEB4 ? 'tianxia_web4.html' : WEB3 ? 'tianxia_web3.html' : WEB2 ? 'tianxia_web2.html' : WEB ? 'tianxia_web.html' : MP ? (NTH ? 'tianxia_mp_nth.html' : 'tianxia_mp.html') : 'tianxia.html');
fs.writeFileSync(out, html);
console.log('built', path.basename(out), (html.length / 1024).toFixed(0) + 'KB');
