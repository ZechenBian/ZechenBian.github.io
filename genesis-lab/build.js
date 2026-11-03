// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 把 src/ 里的引擎和页面逻辑内联进 template.html，生成单文件页面（GitHub Pages 不跑构建）。
// 两个版本从同一份源码构建：经典版 index.html；量子版 quantum/index.html（多了 src/q/ 的引擎、旋钮面板和"最初三分钟"展区）。
// 用法：node build.js            两个版本都构建
//       node build.js --artifact <路径> [--artifact-q <路径>]   另外输出发到 Claude Artifact 的变体（去掉文档骨架）
const fs = require('fs'), path = require('path');
const src = (p) => fs.readFileSync(path.join(__dirname, 'src', p), 'utf8');
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
const QLAI = fs.readFileSync(path.join(__dirname, '../strategy-lab/src/ai.js'), 'utf8').replace(/\nif \(typeof module !== "undefined" && module\.exports\) module\.exports = QLAI;\n/, '\n');
function build(q, artifact) {
  let t = src('template.html');
  const fill = (slot, text) => { if (!t.includes(slot)) throw new Error('template.html 里缺少占位符 ' + slot); t = t.replace(slot, () => text); };
  fill('__TITLE__', q ? '创世实验室 · 量子版' : '创世实验室 · Genesis Lab');
  fill('__EDITION_BADGE__', q ? ' <span class="tag real" style="font-size:12px;vertical-align:middle">量子版</span>' : '');
  fill('__EDITION_LINK__', q ? ' <a href="../">← 经典版</a>' : ' <a href="quantum/">量子版 →</a>');
  fill('__Q_TAB__', q ? '\n      <button data-hall="early">最初三分钟</button>' : '');
  fill('__Q_PANEL__', q ? src('q/panel.html') : '');
  fill('__Q_CARDS__', q ? '\n      <div class="card" style="margin-top:14px"><h3>量子物理给出的数 <span class="note" style="font-weight:400">由上面的旋钮算出</span></h3><div class="kv" id="q-cards"></div></div>' : '');
  fill('__Q_HALL__', q ? src('q/hall.html') : '');
  fill('__Q_OVERVIEW_BTN__', q ? ' <button class="btn" data-go="early">最初三分钟 →</button>' : '');
  const cosmo = strip(src('cosmo.js')); if (/<\/script/i.test(cosmo)) throw new Error('cosmo.js 里有 </script>');
  // 引擎源码另存一份字符串，给参数空间地图的 Worker 用（Worker 里不能碰页面，只跑引擎）
  fill('__COSMO__', (q ? 'window.GENESIS_Q = true;\n' : '') + 'window.GENESIS_COSMO_SRC = ' + JSON.stringify(cosmo) + ';\n' + cosmo);
  fill('__NBODY__', strip(src('nbody.js'))); fill('__GODEL__', strip(src('godel.js'))); fill('__PRESETS__', strip(src('presets.js'))); fill('__PUZZLES__', strip(src('puzzles.js')));
  fill('__Q_ENGINES__', q ? ['q/thermal.js', 'q/bbn.js', 'q/recomb.js', 'q/inflation.js'].map((f) => strip(src(f))).join('\n') : '');
  fill('__APP__', strip(src('app.js'))); fill('__Q_APP__', q ? strip(src('q/app_q.js')) : '');
  // 其他展区：每个展区一个引擎（src/*.js，可在 Node 里测）+ 一个页面模块和一段 HTML（src/halls/）
  fill('__MIX_HALL__', src('halls/mixmaster.html')); fill('__HALLS__', [strip(src('mixmaster.js')), strip(src('halls/mixmaster.js'))].join('\n'));
  fill('__GLOSS__', strip(src('gloss.js'))); fill('__QLAI__', artifact ? '' : QLAI); fill('__HELP__', strip(src('help.js')));
  fill('__KATEX_CSS__', KATEX_CSS); fill('__KATEX_JS__', KATEX_JS);
  return t;
}
const pages = [['index.html', false], ['quantum/index.html', true]];
for (const [out, q] of pages) { const t = build(q); const f = path.join(__dirname, out); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); console.log(out, 'written,', t.length, 'bytes'); }
// 可选：Artifact 变体（Artifact 自带文档骨架，去掉 doctype/html/head/body；下载按钮改为显示文本）
function artifact(t, title) {
  let a = t.replace(/<!doctype html>\s*<!--[\s\S]*?-->\s*/i, '').replace(/<html[^>]*>|<\/html>|<head>|<\/head>|<body>|<\/body>/g, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
  a = a.replace('<title>' + title + '</title>', '<title>' + title + '</title>\n<meta name="claude:viewport-fit-sides" content="cover">');
  a = a.replace('<script>\n', '<script>window.GENESIS_ARTIFACT = true; // Artifact 环境：下载按钮改为显示文本\n');
  return '<!-- Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。 -->\n' + a.replace(/^\s+/, '');
}
for (const [flag, q, title] of [['--artifact', false, '创世实验室 · Genesis Lab'], ['--artifact-q', true, '创世实验室 · 量子版']]) {
  const i = process.argv.indexOf(flag); if (i > 0 && process.argv[i + 1]) { const a = artifact(build(q, true), title); fs.writeFileSync(process.argv[i + 1], a); console.log('artifact variant written to', process.argv[i + 1], a.length, 'bytes'); }
}
