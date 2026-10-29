// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 深夜解压铺：把 src/core.js 和 src/toys/*.js（按文件名顺序）内联进 src/template.html，生成 index.html
// Inline src/core.js and src/toys/*.js (in file-name order) into src/template.html → index.html
const fs = require('fs'), path = require('path');
const src = p => fs.readFileSync(path.join(__dirname, 'src', p), 'utf8');
// 用 split/join 而不是 String.replace：源码里有 "$&" 一类字符时 replace 会把它们当成替换模式
const put = (t, mark, s) => { const parts = t.split(mark); if (parts.length !== 2) throw new Error(mark + ' 应该恰好出现一次'); return parts.join(s); };

const toys = fs.readdirSync(path.join(__dirname, 'src', 'toys')).filter(f => /^\d\d-[a-z]+\.js$/.test(f)).sort();
let t = src('template.html');
t = put(t, '__CORE__', src('core.js').replace(/\n$/, ''));
t = put(t, '__TOYS__', toys.map(f => src(path.join('toys', f))).join('').replace(/\n$/, ''));
fs.writeFileSync(path.join(__dirname, 'index.html'), t);
console.log('index.html written,', t.length, 'chars,', toys.length, 'toys');
