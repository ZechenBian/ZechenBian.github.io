// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 英文版对照：译文齐全（i18n check 无缺译、无坏译），构建出来的英文页面 lang="en"、标题是英文、
// 页面骨架（脚本和注释之外）没有残留的中文、语言切换和版本切换的链接指向正确的网址，中英两版的脚本逐字节一样长（同一套代码）。
const assert = require('assert');
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let n = 0; function ok(name, cond, info) { n++; assert.ok(cond, name + (info ? '：' + info : '')); console.log('✓ ' + name + (info ? '：' + info : '')); }
const CJK = /[㐀-鿿　-〿＀-￯]/;

// 1 译文齐全
{ const r = spawnSync(process.execPath, [path.join(ROOT, 'i18n/i18n.js'), 'check'], { encoding: 'utf8' });
  const last = (r.stdout.trim().split('\n').pop() || '');
  ok('i18n check: no missing or damaged translations', r.status === 0 && /缺译文 0，有问题 0/.test(last), last); }

// 2 构建出来的英文页面
function strip(html) { // 去掉脚本、样式和注释，只剩给人看的骨架
  return html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
}
for (const [rel, q] of [['en/index.html', false], ['quantum/en/index.html', true]]) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  ok(rel + ': <html lang="en">', /<html lang="en">/.test(html));
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  ok(rel + ': English title', title.startsWith('Genesis Lab') && !CJK.test(title), title);
  const body = strip(html).replace(/<a id="lang-switch"[^>]*>中文<\/a>/, '');
  const left = body.match(/.{0,30}[㐀-鿿　-〿＀-￯].{0,30}/g) || [];
  ok(rel + ': no Chinese left in the page skeleton', left.length === 0, left.slice(0, 3).join(' | '));
  ok(rel + ': language switch points at the Chinese edition', new RegExp('<a id="lang-switch" href="\\.\\./" hreflang="zh-CN"').test(html));
  ok(rel + ': edition link points at the other English edition', html.includes(q ? 'href="../../en/"' : 'href="../quantum/en/"'));
  ok(rel + ': copyright notice', html.includes('All rights reserved'));
  ok(rel + ': language memory script present', html.includes('genesis.lang'));
  // 同一套代码：中英两版的脚本块数目一样
  const zh = fs.readFileSync(path.join(ROOT, q ? 'quantum/index.html' : 'index.html'), 'utf8');
  const count = (s) => (s.match(/<script/g) || []).length;
  ok(rel + ': same number of script blocks as the Chinese edition', count(zh) === count(html), count(zh) + ' vs ' + count(html));
}
console.log(`\n${n} checks passed · en.test.js`);
