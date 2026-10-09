// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 把 physics.js 和 levels.json 内联进 template.html，生成根目录 index.html
// Inline physics.js and levels.json into template.html → index.html at repo root
const fs=require('fs'),path=require('path');
const src=p=>fs.readFileSync(path.join(__dirname,'src',p),'utf8');
let t=src('template.html');
t=t.replace('__PHYSICS__',src('physics.js').replace("if(typeof module!=='undefined')module.exports=PH;\n",''));
t=t.replace('__LEVELS__',src('levels.json'));
fs.writeFileSync(path.join(__dirname,'index.html'),t);
console.log('index.html written,',t.length,'bytes');
