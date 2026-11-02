// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 把 src/ 里的引擎和页面逻辑内联进 template.html，生成单文件 index.html（GitHub Pages 不跑构建）。
// 用法：node build.js
const fs = require('fs'), path = require('path');
const src = (p) => fs.readFileSync(path.join(__dirname, 'src', p), 'utf8');
const strip = (code) => code.replace(/\nif \(typeof module !== 'undefined'\) module\.exports = \w+;\n/, '\n');
let t = src('template.html');
for (const [slot, file] of [['__COSMO__', 'cosmo.js'], ['__GODEL__', 'godel.js'], ['__PRESETS__', 'presets.js'], ['__PUZZLES__', 'puzzles.js'], ['__APP__', 'app.js']]) {
  if (!t.includes(slot)) throw new Error('template.html 里缺少占位符 ' + slot);
  t = t.replace(slot, () => strip(src(file)));
}
fs.writeFileSync(path.join(__dirname, 'index.html'), t);
console.log('index.html written,', t.length, 'bytes');
// 可选：node build.js --artifact <路径>  生成发到 Claude Artifact 的变体（Artifact 自带文档骨架，去掉 doctype/html/head/body）
const ai = process.argv.indexOf('--artifact');
if (ai > 0 && process.argv[ai + 1]) {
  let a = t.replace(/<!doctype html>\s*<!--[\s\S]*?-->\s*/i, '').replace(/<html[^>]*>|<\/html>|<head>|<\/head>|<body>|<\/body>/g, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
  a = a.replace('<title>创世实验室 · Genesis Lab</title>', '<title>创世实验室 · Genesis Lab</title>\n<meta name="claude:viewport-fit-sides" content="cover">');
  a = '<!-- Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。 -->\n' + a.replace(/^\s+/, '');
  fs.writeFileSync(process.argv[ai + 1], a); console.log('artifact variant written to', process.argv[ai + 1], a.length, 'bytes');
}
