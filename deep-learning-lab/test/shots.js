// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// Development aid: open the built page at desktop and phone width, report script errors and horizontal overflow,
// and save screenshots.   node test/shots.js <output dir> [route ...]
const path = require('path'), fs = require('fs');
function need() { for (const p of [path.join(__dirname, '../../strategy-lab/node_modules/playwright'), 'playwright', '/opt/npm-tools/node_modules/playwright']) { try { return require(p); } catch (e) {} } throw new Error('Playwright not found'); }
const { chromium } = need();
(async () => {
  const out = process.argv[2] || '.', routes = process.argv.slice(3).length ? process.argv.slice(3) : ['home', 'u1', 'u1-train', 'u7', 'u5', 'ledger'];
  const file = 'file://' + path.join(__dirname, '..', 'index.html');
  const browser = await chromium.launch();
  let bad = 0;
  for (const vp of [{ name: 'desktop', width: 1360, height: 860 }, { name: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, deviceScaleFactor: 1 });
    await ctx.route('**/*', (r) => (r.request().url().startsWith('file:') || r.request().url().startsWith('data:') ? r.continue() : r.abort()));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { bad++; console.log('  PAGE ERROR', vp.name, String(e.stack || e).split('\n').slice(0, 4).join(' | ')); });
    page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR|Failed to load resource/.test(m.text())) { bad++; console.log('  CONSOLE', vp.name, m.text().slice(0, 300)); } });
    for (const r of routes) {
      await page.goto(file + '#' + r); await page.waitForTimeout(700);
      const info = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, main: document.querySelector('#main').scrollWidth, mw: document.querySelector('#main').clientWidth, text: document.body.innerText.length, tex: document.querySelectorAll('.tex').length, texDone: document.querySelectorAll('.tex .katex').length, texErr: document.querySelectorAll('.katex-error').length }));
      if (info.sw > info.iw + 1 || info.main > info.mw + 1) { bad++; console.log('  OVERFLOW', vp.name, r, JSON.stringify(info)); }
      if (info.texErr || info.tex !== info.texDone) { bad++; console.log('  KATEX', vp.name, r, JSON.stringify(info)); }
      console.log(vp.name, r, JSON.stringify(info));
      await page.screenshot({ path: path.join(out, vp.name + '-' + r + '.png') });
    }
    await ctx.close();
  }
  await browser.close();
  console.log(bad ? bad + ' problems' : 'no problems');
  process.exit(bad ? 1 : 0);
})();
