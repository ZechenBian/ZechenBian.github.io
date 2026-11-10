// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 把 src/ 里的引擎和页面逻辑内联进 template.html，生成单文件页面（GitHub Pages 不跑构建）。
// 两个版本从同一份源码构建：经典版 index.html；量子版 quantum/index.html（多了 src/q/ 的引擎、旋钮面板和"最初三分钟"展区）。
// 用法：node build.js            两个版本都构建
//       node build.js --artifact <路径> [--artifact-q <路径>]   另外输出发到 Claude Artifact 的变体（去掉文档骨架）
const fs = require('fs'), path = require('path');
let SRC_DIR = path.join(__dirname, 'src');                      // 英文版构建时指向 i18n/work/en-src（译好的源码）
const src = (p) => fs.readFileSync(path.join(SRC_DIR, p), 'utf8');
// 英文版：i18n/en/ 里有译文时，先用 i18n/i18n.js 把源码里的中文换成英文（代码不动），再按同样的办法拼页面
const HAS_EN = fs.existsSync(path.join(__dirname, 'i18n/en')) && fs.readdirSync(path.join(__dirname, 'i18n/en')).some((f) => f.endsWith('.json'));
const EN_SRC = path.join(__dirname, 'i18n/work/en-src');
// 页面骨架里由 build.js 自己填的字样
const TXT = {
  zh: { title: '创世实验室 · Genesis Lab', titleQ: '创世实验室 · 量子版', badgeQ: '量子版', toClassic: '← 经典版', toQuantum: '量子版 →', early: '最初三分钟', earlyGo: '最初三分钟 →', qCards: '量子物理给出的数', qCardsNote: '由上面的旋钮算出', lang: 'English', langHint: 'Switch to English', htmlLang: 'zh-CN' },
  en: { title: 'Genesis Lab', titleQ: 'Genesis Lab · Quantum Edition', badgeQ: 'Quantum', toClassic: '← Classical edition', toQuantum: 'Quantum edition →', early: 'The first three minutes', earlyGo: 'The first three minutes →', qCards: 'Numbers from quantum physics', qCardsNote: 'computed from the knobs above', lang: '中文', langHint: '切换到中文版', htmlLang: 'en' },
};
const strip = (code) => code.replace(/\nif \(typeof module !== 'undefined'\) module\.exports = \w+;\n/, '\n');
// KaTeX（MIT）：样式、字体和脚本全部内联，断网也能排公式。发行文件从 node_modules 取（npm install），或者 KATEX_DIR 指向 katex/dist。
function katexDir() {
  for (const d of [process.env.KATEX_DIR, path.join(__dirname, 'node_modules/katex/dist'), path.join(__dirname, '../strategy-lab/node_modules/katex/dist'), '/opt/npm-tools/node_modules/katex/dist'])
    if (d && fs.existsSync(path.join(d, 'katex.min.js'))) return d;
  throw new Error('找不到 KaTeX：在 genesis-lab/ 里 npm install，或设置 KATEX_DIR=…/katex/dist');
}
const KATEX = katexDir(), KATEX_VER = JSON.parse(fs.readFileSync(path.join(KATEX, '../package.json'), 'utf8')).version;
function katexCss() {
  let css = fs.readFileSync(path.join(KATEX, 'katex.min.css'), 'utf8'), n = 0;
  css = css.replace(/src:url\(fonts\/([A-Za-z0-9_-]+)\.woff2\) format\("woff2"\),url\(fonts\/[^)]+\.woff\) format\("woff"\),url\(fonts\/[^)]+\.ttf\) format\("truetype"\)/g, (m, name) => { n++; return 'src:url(data:font/woff2;base64,' + fs.readFileSync(path.join(KATEX, 'fonts', name + '.woff2')).toString('base64') + ') format("woff2")'; });
  if (n !== 20 || css.includes('url(fonts/')) throw new Error('KaTeX 字体内联失败：' + n);
  return css;
}
const KATEX_CSS = '<style>\n/* KaTeX ' + KATEX_VER + ' 的样式，字体内联。KaTeX: MIT License, (c) Khan Academy and other contributors; 字体: SIL Open Font License 1.1。全文见 THIRD-PARTY-NOTICES.md */\n' + katexCss() + '\n</style>';
const katexJs = fs.readFileSync(path.join(KATEX, 'katex.min.js'), 'utf8'), autoJs = fs.readFileSync(path.join(KATEX, 'contrib/auto-render.min.js'), 'utf8');
if (/<\/script/i.test(katexJs + autoJs)) throw new Error('KaTeX 脚本里有 </script>');
const KATEX_JS = '<script>\n/* KaTeX ' + KATEX_VER + ' — MIT License, (c) Khan Academy and other contributors. https://github.com/KaTeX/KaTeX */\n' + katexJs + '\n' + autoJs + '\n</script>\n<script>if (window.GENESIS && GENESIS.tex) { GENESIS.tex(document.body); }</script>';
// 问 AI 的接口模块和策略实验室共用一份（使用者自带密钥，只存在本机浏览器）；Artifact 变体里不需要它（用页面自己的 sample 能力）
const QLAI_ZH = fs.readFileSync(path.join(__dirname, '../strategy-lab/src/ai.js'), 'utf8').replace(/\nif \(typeof module !== "undefined" && module\.exports\) module\.exports = QLAI;\n/, '\n');
// 英文版的"问 AI"设置面板：策略实验室已经译过 ai.js，直接借它的译文（同一份代码、同一处设置）
const QLAI_EN = () => require(path.join(__dirname, '../strategy-lab/i18n/i18n.js')).applyFile('ai.js').out.replace(/\nif \(typeof module !== "undefined" && module\.exports\) module\.exports = QLAI;\n/, '\n');
function build(q, artifact, lang) {
  lang = lang || 'zh'; const en = lang === 'en', T = TXT[lang]; SRC_DIR = en ? EN_SRC : path.join(__dirname, 'src');
  let t = src('template.html');
  const fill = (slot, text) => { if (!t.includes(slot)) throw new Error('template.html 里缺少占位符 ' + slot); t = t.replace(slot, () => text); };
  fill('<html lang="zh-CN">', '<html lang="' + T.htmlLang + '">');
  fill('__TITLE__', q ? T.titleQ : T.title);
  fill('__EDITION_BADGE__', q ? ' <span class="tag real" style="font-size:12px;vertical-align:middle">' + T.badgeQ + '</span>' : '');
  // 同一版的另一种语言（英文页在 en/ 和 quantum/en/ 下），以及另一版（经典 ↔ 量子）
  const other = en ? (q ? '../' : '../') : (q ? 'en/' : 'en/'), edition = en ? (q ? '../../en/' : '../quantum/en/') : (q ? '../' : 'quantum/');
  fill('__EDITION_LINK__', ' <a href="' + edition + '">' + (q ? T.toClassic : T.toQuantum) + '</a> · <a id="lang-switch" href="' + other + '" hreflang="' + (en ? 'zh-CN' : 'en') + '" lang="' + (en ? 'zh-CN' : 'en') + '" title="' + T.langHint + '">' + T.lang + '</a>');
  fill('__LANG_SCRIPT__', artifact ? '' : '<script>/* 记住语言：点过切换链接的，下次打开直接去那一版 */(function(){try{var k="genesis.lang",want=' + JSON.stringify(lang) + ';var s=localStorage.getItem(k);if(s&&s!==want&&location.protocol!=="file:"){location.replace((s==="en"?' + JSON.stringify(en ? '' : 'en/') + ':' + JSON.stringify(en ? '../' : '')+')+location.hash);return;}document.addEventListener("DOMContentLoaded",function(){var a=document.getElementById("lang-switch");if(a)a.addEventListener("click",function(){try{localStorage.setItem(k,a.getAttribute("lang")==="en"?"en":"zh");}catch(e){}});});}catch(e){}})();</script>');
  fill('__Q_TAB__', q ? '\n      <button data-hall="early">' + T.early + '</button>' : '');
  fill('__Q_PANEL__', q ? src('q/panel.html') : '');
  fill('__Q_CARDS__', q ? '\n      <div class="card" style="margin-top:14px"><h3>' + T.qCards + ' <span class="note" style="font-weight:400">' + T.qCardsNote + '</span></h3><div class="kv" id="q-cards"></div></div>' : '');
  fill('__Q_HALL__', q ? src('q/hall.html') : '');
  fill('__Q_OVERVIEW_BTN__', q ? ' <button class="btn" data-go="early">' + T.earlyGo + '</button>' : '');
  const cosmo = strip(src('cosmo.js')); if (/<\/script/i.test(cosmo)) throw new Error('cosmo.js 里有 </script>');
  // 引擎源码另存一份字符串，给参数空间地图的 Worker 用（Worker 里不能碰页面，只跑引擎）
  fill('__COSMO__', (q ? 'window.GENESIS_Q = true;\n' : '') + 'window.GENESIS_COSMO_SRC = ' + JSON.stringify(cosmo) + ';\n' + cosmo);
  fill('__NBODY__', strip(src('nbody.js'))); fill('__GODEL__', strip(src('godel.js'))); fill('__PRESETS__', strip(src('presets.js'))); fill('__PUZZLES__', strip(src('puzzles.js')));
  fill('__Q_ENGINES__', q ? ['q/thermal.js', 'q/bbn.js', 'q/recomb.js', 'q/inflation.js'].map((f) => strip(src(f))).join('\n') : '');
  fill('__APP__', strip(src('app.js'))); fill('__Q_APP__', q ? strip(src('q/app_q.js')) : '');
  // 其他展区：每个展区一个引擎（src/*.js，可在 Node 里测）+ 一个页面模块和一段 HTML（src/halls/）
  for (const [slot, f] of [['__MIX_HALL__', 'mixmaster'], ['__LTB_HALL__', 'ltb'], ['__BUBBLE_HALL__', 'bubble'], ['__TOPO_HALL__', 'topo'], ['__G21_HALL__', 'g21']]) fill(slot, src('halls/' + f + '.html'));
  fill('__HALLS__', ['mixmaster.js', 'halls/mixmaster.js', 'ltb.js', 'halls/ltb.js', 'bubble.js', 'halls/bubble.js', 'topo.js', 'halls/topo.js', 'gravity21.js', 'halls/g21.js'].map((f) => strip(src(f))).join('\n'));
  fill('__GLOSS__', strip(src('gloss.js'))); fill('__QLAI__', artifact ? '' : (en ? QLAI_EN() : QLAI_ZH)); fill('__HELP__', strip(src('help.js')));
  fill('__KATEX_CSS__', KATEX_CSS); fill('__KATEX_JS__', KATEX_JS);
  return t;
}
const pages = [['index.html', false, 'zh'], ['quantum/index.html', true, 'zh']];
if (HAS_EN) { // 译文齐全才生成英文页；缺译文时 apply 会失败并指出是哪一段
  const r = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'i18n/i18n.js'), 'apply', EN_SRC], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('英文版源码没有生成（见上面的提示）：补齐 i18n/en/ 里的译文，或者把 i18n/en/ 挪开只构建中文版'); process.exit(r.status || 1); }
  pages.push(['en/index.html', false, 'en'], ['quantum/en/index.html', true, 'en']);
}
const OUT_DIR = process.env.GENESIS_OUT || __dirname; // GENESIS_OUT：把页面构建到别的目录（本地试玩时不动仓库里的产物）
for (const [out, q, lang] of pages) { const t = build(q, false, lang); const f = path.join(OUT_DIR, out); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); console.log(out, 'written,', t.length, 'bytes'); }
// 可选：Artifact 变体（中文；Artifact 自带文档骨架，去掉 doctype/html/head/body；下载按钮改为显示文本）
function artifact(t, title) {
  let a = t.replace(/<!doctype html>\s*<!--[\s\S]*?-->\s*/i, '').replace(/<html[^>]*>|<\/html>|<head>|<\/head>|<body>|<\/body>/g, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
  a = a.replace('<title>' + title + '</title>', '<title>' + title + '</title>\n<meta name="claude:viewport-fit-sides" content="cover">');
  a = a.replace('<script>\n', '<script>window.GENESIS_ARTIFACT = true; // Artifact 环境：下载按钮改为显示文本\n');
  return '<!-- Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。 -->\n' + a.replace(/^\s+/, '');
}
for (const [flag, q, title] of [['--artifact', false, '创世实验室 · Genesis Lab'], ['--artifact-q', true, '创世实验室 · 量子版']]) {
  const i = process.argv.indexOf(flag); if (i > 0 && process.argv[i + 1]) { const a = artifact(build(q, true), title); fs.writeFileSync(process.argv[i + 1], a); console.log('artifact variant written to', process.argv[i + 1], a.length, 'bytes'); }
}
