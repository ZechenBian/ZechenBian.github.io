// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* End-to-end test of the built page with a stand-in Claude runtime (test/serve.js): the tutor is canned, the store is
 * in memory, the engine is the real one (numpy experiments only where PyTorch is missing).
 *     node test/e2e.js [screenshot dir]
 * It walks the page the way a reader would: widget -> ask about a line -> train with a prediction -> edit a script ->
 * break it -> reload and find everything again; then repeats the essentials at phone width and without capabilities. */
const path = require('path'), fs = require('fs');
function need() { for (const p of [path.join(__dirname, '../../strategy-lab/node_modules/playwright'), 'playwright', '/opt/npm-tools/node_modules/playwright']) { try { return require(p); } catch (e) {} } throw new Error('Playwright not found'); }
const { chromium } = need();
const { start } = require('./serve.js');
const shots = process.argv[2] || null;
let failures = 0, step = 0;
function ok(cond, what) { step++; if (cond) console.log('  ok  ' + what); else { failures++; console.log('  FAIL ' + what); } }
async function shot(page, name) { if (shots) await page.screenshot({ path: path.join(shots, name + '.png') }); }

(async () => {
  const srv = await start(0), browser = await chromium.launch();
  async function open(vp, query) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile, deviceScaleFactor: 1 });
    await ctx.route('**/*', (r) => (r.request().url().startsWith(srv.url) ? r.continue() : r.abort()));
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e).split('\n').slice(0, 3).join(' | ')));
    page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
    await page.goto(srv.url + (query || '')); await page.waitForTimeout(500);
    return { ctx, page, errors };
  }
  const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.querySelector('#main').scrollWidth <= document.querySelector('#main').clientWidth + 1);

  /* ================= desktop, everything available ================= */
  console.log('desktop');
  let { ctx, page, errors } = await open({ w: 1360, h: 900 });
  ok(await page.locator('h1').first().textContent() === 'Deep Learning Lab', 'the overview opens');
  ok((await page.locator('.map-row').count()) === 12, 'twelve weeks in the course map');
  await page.waitForTimeout(600);
  const homeText = await page.locator('.col.home').innerText(), railText = await page.locator('#rail').innerText();
  ok(!/Not saved/.test(homeText + railText) && /Your remarks, predictions, runs and edited scripts are saved to your Claude account, private to you/.test(homeText) && /Saved to your Claude account/.test(railText), 'the overview says what is saved and where, and the course map agrees');
  await page.click('text=Begin with week 1'); await page.waitForTimeout(400);
  ok(page.url().endsWith('#u1'), 'route #u1');
  ok((await page.locator('.sheet .blk').count()) > 60, 'the week 1 notes are rendered as blocks');
  ok((await page.locator('.katex-error').count()) === 0 && (await page.locator('.tex:not(.done)').count()) === 0, 'every formula typeset without error');

  // finding one's way: the course map lists the sections of the open unit, and references to sections are links
  ok((await page.locator('#rail-secs a').count()) === 9, 'the course map lists the unit\'s seven sections, its check questions and its experiments');
  ok((await page.locator('.sheet a.seclink').count()) >= 6, 'references such as “section 6” in the notes are links');
  ok(await page.evaluate(() => { const c = document.querySelector('.widget canvas').getBoundingClientRect(); return c.top < window.innerHeight - 150; }), 'the figure to play with starts on the first screen');
  // the widget: by hand (drag a kink), then by rule
  const k0 = await page.locator('.widget input[type=range]').first().inputValue();
  await page.evaluate(() => document.querySelector('.widget canvas').scrollIntoView({ block: 'center', behavior: 'instant' })); await page.waitForTimeout(300);
  const cvBox = await page.locator('.widget canvas').first().boundingBox();
  const dotX = cvBox.x + 34 + (-0.8 + 1) / 2 * (cvBox.width - 2 - 44), dotY = cvBox.y + (cvBox.height - 2 - 22) - 0.6 / 2.1 * (cvBox.height - 2 - 32);   // kink 1 starts at x = -0.8, where the curve is at height 0
  await page.mouse.move(dotX, dotY); await page.mouse.down(); await page.mouse.move(dotX + 60, dotY, { steps: 6 }); await page.mouse.up();
  const k1 = await page.locator('.widget input[type=range]').first().inputValue();
  ok(+k1 > +k0 + 0.1, 'a kink can be dragged on the picture (from ' + k0 + ' to ' + k1 + ')');
  await page.click('.widget button:has-text("Reset")');
  await page.locator('.widget input[type=range]').nth(1).evaluate((el) => { el.value = '0.33'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const yLeft = await page.evaluate(() => document.querySelector('#main').scrollTop);
  await page.click('#rail-secs a:has-text("6. Backpropagation")'); await page.waitForTimeout(700);
  ok(page.url().endsWith('#u1-sec-6') && await page.evaluate(() => { const h = document.getElementById('sec-6').getBoundingClientRect(), m = document.querySelector('#main').getBoundingClientRect(); return h.top >= m.top && h.top < m.top + 120; }), 'a section link scrolls to the section and names it in the address');
  ok(await page.evaluate(() => { const a = document.querySelector('#rail-secs a[aria-current]'); return !!a && /^6\./.test(a.textContent); }), 'the course map marks the section being read');
  // Back returns to the place that was left, Forward to the section
  const ySec = await page.evaluate(() => document.querySelector('#main').scrollTop);
  await page.goBack(); await page.waitForTimeout(500);
  const yBack = await page.evaluate(() => document.querySelector('#main').scrollTop);
  ok(page.url().endsWith('#u1') && yLeft > 20 && ySec - yLeft > 300 && Math.abs(yBack - yLeft) <= 2, 'Back after a section link returns to the place the reader left (' + Math.round(yLeft) + ' → ' + Math.round(ySec) + ' → ' + Math.round(yBack) + ')');
  await page.goForward(); await page.waitForTimeout(500);
  ok(page.url().endsWith('#u1-sec-6') && Math.abs((await page.evaluate(() => document.querySelector('#main').scrollTop)) - ySec) <= 2, 'and Forward goes to the section again');
  ok((await page.locator('.widget input[type=range]').nth(1).inputValue()) === '0.33', 'jumping to a section keeps the state of the figure');
  await page.evaluate(() => { document.querySelector('#main').scrollTo({ top: 0, behavior: 'instant' }); }); await page.waitForTimeout(200);
  await page.click('.widget button:has-text("Reset")');
  await page.click('text=Let gradient descent finish'); await page.waitForTimeout(250);
  const early = await page.evaluate(() => { const w = document.querySelector('.widget'), m = /gradient descent steps\s*([\d,]+)/.exec(w.innerText.replace(/\s+/g, ' ')); return { stop: [...w.querySelectorAll('button')].some((b) => b.textContent === 'Stop'), n: m ? +m[1].replace(/,/g, '') : 0 }; });
  ok(early.stop && early.n >= 1 && early.n <= 60, 'gradient descent begins with single steps that can be watched (' + early.n + ' steps after a quarter of a second)');
  await page.waitForFunction(() => /found the hat|stopped at loss/.test(document.querySelector('.widget').innerText), null, { timeout: 20000 });
  ok(/found the hat/.test(await page.locator('.widget').first().innerText()), 'gradient descent fits the hat from the default start');
  await shot(page, 'e2e-u1-widget');

  // ask about a selection
  const para = page.locator('.sheet .blk .md p', { hasText: 'The standing assumption' }).first();
  await para.scrollIntoViewIfNeeded();
  await page.evaluate(() => { const p = [...document.querySelectorAll('.sheet .blk .md p')].find((x) => x.textContent.includes('The standing assumption')); const r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new Event('selectionchange')); });
  await page.waitForSelector('#seltools:not([hidden])', { timeout: 3000 });
  ok(true, 'selecting text shows the Ask toolbar');
  await page.click('#sel-explain');
  await page.waitForFunction(() => /Canned answer/.test(document.querySelector('#m-body').innerText) && !document.querySelector('#m-live'), null, { timeout: 8000 });
  ok(/Canned answer/.test(await page.locator('#m-body').innerText()), 'the tutor answers in the margin');
  ok((await page.locator('#m-body .ans .katex').count()) >= 1, 'formulas in the answer are typeset');
  const prompt = await page.evaluate(() => window.__lastPrompt.map((t) => t.content).join('\n'));
  ok(/<notes>/.test(prompt) && /The standing assumption/.test(prompt) && /at most 120 words/.test(prompt) && /\$\(x_i, y_i\)\$|\\\{\(x_i, y_i\)/.test(prompt), 'the prompt carries the notes, the passage with its LaTeX, and the length rule');
  ok(await page.evaluate(() => window.__lastTier) === 'default', 'short answers use the default tier');
  ok((await page.locator('.sheet .mark').count()) === 1 && (await page.locator('.sheet .mark').first().textContent()) === 'R1', 'the block carries the chip R1');
  await page.click('text=Go deeper');
  await page.waitForFunction(() => /in-depth answer/.test(document.querySelector('#m-body').innerText) && !document.querySelector('#m-live'), null, { timeout: 8000 });
  ok(await page.evaluate(() => window.__lastTier) === 'complex', '“Go deeper” asks the most capable tier and shows the long answer');
  await page.fill('#m-fq', 'And why'); await page.press('#m-fq', 'Shift+Enter'); await page.waitForTimeout(200);
  ok(/\n/.test(await page.inputValue('#m-fq')) && (await page.locator('#m-body .entry').count()) === 1, 'Shift+Enter in a question box starts a new line and sends nothing');
  await page.fill('#m-fq', 'And why is that enough?'); await page.press('#m-fq', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('#m-body .entry').length === 2 && !document.querySelector('#m-live'), null, { timeout: 8000 });
  ok(await page.evaluate(() => window.__lastPrompt.length) === 3, 'Enter sends a follow-up, with the thread so far');
  await shot(page, 'e2e-u1-remark');
  // similar question detection
  await page.evaluate(() => { const p = [...document.querySelectorAll('.sheet .blk .md p')].find((x) => x.textContent.includes('The standing assumption')); const r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new Event('selectionchange')); });
  await page.waitForSelector('#seltools:not([hidden])'); await page.click('#sel-ask');
  ok((await page.locator('#m-body .quote .katex').count()) >= 1 && !/\$/.test(await page.locator('#m-body .quote').first().innerText()), 'formulas in the quoted passage are typeset in the margin');
  await page.fill('#m-q', 'Explain this.'); await page.waitForTimeout(500);
  ok((await page.locator('#m-body .similar').count()) >= 1, 'asking the same thing again points to the earlier remark');
  await page.click('#m-head .iconbtn >> nth=0');
  // the list of remarks: titles that tell remarks apart, Enter sends, and a question typed twice is not asked twice
  const listTitle = await page.locator('#m-list .rcard .rq').first().innerText();
  ok(/^Explain this: The data are pairs/.test(listTitle) && (await page.locator('#m-list .rcard .rq .katex').count()) >= 1 && !/\$/.test(await page.locator('#m-list .rcard').first().innerText()), 'in the list a stock question carries the beginning of its passage, with its formula typeset');
  const listBox = '#m-body textarea[aria-label="Question for the tutor"]';
  await page.fill(listBox, 'What is a loss function?'); await page.press(listBox, 'Enter');
  await page.waitForFunction(() => /^R2/.test(document.querySelector('#m-head h3').innerText) && /Canned answer/.test(document.querySelector('#m-body').innerText) && !document.querySelector('#m-live'), null, { timeout: 8000 });
  ok(true, 'Enter in the list\'s question box asks the tutor');
  const backLabel = await page.locator('#m-head button[aria-label="Back to all remarks"]').innerText();
  await page.click('#m-head button[aria-label="Back to all remarks"]'); await page.waitForTimeout(200);
  ok(/All remarks/.test(backLabel) && (await page.locator('#m-list .rcard').count()) === 2, 'the thread has a way back to the list that says where it leads');
  await page.fill(listBox, 'what is a loss function'); await page.press(listBox, 'Enter'); await page.waitForTimeout(600);
  ok(/^R2/.test(await page.locator('#m-head h3').innerText()) && /You asked this before/.test(await page.locator('#toast').innerText()), 'the same question typed again opens the earlier remark');
  await page.click('#m-head button[aria-label="Back to all remarks"]'); await page.waitForTimeout(200);
  ok((await page.locator('#m-list .rcard').count()) === 2, 'and no second remark is made for it');

  /* ---------- Train ---------- */
  await page.click('.tabs button:has-text("Train")'); await page.waitForTimeout(300);
  ok((await page.locator('.exp').count()) === 3, 'week 1 has two experiments and a scratch bench');
  ok(await noOverflow(page), 'no horizontal overflow on the Train tab');
  const engineDialog = () => page.evaluate(() => { const b = document.querySelector('.mbox'), d = b.querySelector('details'), btn = [...b.querySelectorAll('button')].find((x) => /Connect to my Mac|Check again/.test(x.textContent)); return { first: b.querySelector('p').innerText, open: d.open, steps: d.querySelectorAll('ol li').length, above: btn.getBoundingClientRect().bottom <= d.getBoundingClientRect().top + 1, onScreen: btn.getBoundingClientRect().bottom <= window.innerHeight && d.querySelector('summary').getBoundingClientRect().bottom <= window.innerHeight }; });
  await page.click('#btn-engine'); await page.waitForTimeout(250);
  let dlg = await engineDialog();
  ok(/^You need the engine only to run experiments yourself/.test(dlg.first) && !dlg.open && dlg.steps === 4 && dlg.above && dlg.onScreen, 'the engine dialog says first what the engine is for and offers Connect; the setup steps are folded below');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  const card = page.locator('.exp[data-exp="u01_backprop_numpy"]');
  await card.locator('.predict label').nth(2).click();
  await card.locator('button:has-text("Lock in and run")').click();
  await page.waitForFunction(() => { const c = document.querySelector('.exp[data-exp="u01_backprop_numpy"]'); return c && c.querySelector('.verdict'); }, null, { timeout: 60000 });
  const verdict = await card.locator('.verdict').innerText();
  ok(/Your prediction held/.test(verdict) && /largest relative error was/.test(verdict), 'the run judges the prediction from its own numbers');
  await page.waitForTimeout(900);
  ok(await page.evaluate(() => { const v = document.querySelector('.exp[data-exp="u01_backprop_numpy"] .verdict').getBoundingClientRect(), m = document.querySelector('#main').getBoundingClientRect(); return v.top >= m.top - 1 && v.top < m.bottom - 60; }), 'when the run ends the verdict is scrolled into view');
  ok((await card.locator('.verdict a.seclink').count()) >= 1, 'the explanation links to the section of the notes it cites');
  await page.evaluate(() => document.querySelector('.exp[data-exp="u01_backprop_numpy"] .exp-h p.hint').scrollIntoView({ block: 'center', behavior: 'instant' })); await page.waitForTimeout(400);
  await page.evaluate(() => { const p = document.querySelector('.exp[data-exp="u01_backprop_numpy"] .exp-h p.hint'), r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new Event('selectionchange')); });
  await page.waitForSelector('#seltools:not([hidden])', { timeout: 3000 });
  ok(true, 'selecting the “Data” line of an experiment offers Ask');
  await page.evaluate(() => getSelection().removeAllRanges()); await page.waitForTimeout(250);
  ok((await card.locator('.tile').count()) >= 5 && (await card.locator('.qc-canvas').count()) >= 1 && (await card.locator('.pix canvas').count()) === 1, 'tiles, live curves and the decision-region picture are drawn');
  ok((await card.locator('.pix .frame input').count()) === 1, 'the picture has a frame slider');
  ok(await page.evaluate(() => window.__mcpCalls.includes('info') && window.__mcpCalls.includes('run_start') && window.__mcpCalls.includes('run_events')), 'the page talked to the engine: info, run_start, run_events');
  await shot(page, 'e2e-u1-train-done');
  ok(/1 of 1/.test(await page.locator('#rail').innerText()), 'the ledger counts the prediction');
  // second preset, wrong prediction
  await card.locator('.chip:has-text("Start from all zeros")').click();
  await card.locator('.predict label').nth(2).click();
  await card.locator('button:has-text("Lock in and run")').click();
  await page.waitForFunction(() => { const c = document.querySelector('.exp[data-exp="u01_backprop_numpy"]'); return c && c.querySelector('.verdict') && /chance/.test(c.querySelector('.verdict').innerText); }, null, { timeout: 60000 });
  ok(/Not what you predicted/.test(await card.locator('.verdict').innerText()), 'a wrong prediction is reported as such');
  ok(/1 of 2/.test(await page.locator('#rail').innerText()), 'the ledger now reads 1 of 2');
  // back at a question that was answered: the box says what was answered and offers to predict again
  await card.locator('.chip:has-text("Check the gradient")').click(); await page.waitForTimeout(200);
  ok(/predict again/i.test(await card.locator('.predict .kicker').innerText()) && /You answered this on .+which held\. That first answer is the one the ledger counts/.test((await card.locator('.predict').innerText()).replace(/\s+/g, ' ')), 'an answered question says what was answered and offers to predict again');
  // a run looked at without predicting is labelled so, and counts for nothing
  await card.locator('.chip:has-text("A step size ten times larger")').click();
  await card.locator('button:has-text("Show the reference run")').click(); await page.waitForTimeout(400);
  ok(/no prediction was made/i.test(await card.locator('.predict .kicker').innerText()) && /What happened/.test(await card.locator('.verdict').innerText()) && !/Your prediction held|Not what you predicted/.test(await card.locator('.verdict').innerText()), 'a result looked at without predicting is headed “no prediction was made”');
  ok(/1 of 2/.test(await page.locator('#rail').innerText()), 'and adds nothing to the ledger');
  // history
  await card.locator('.exp-tabs button:has-text("History")').click();
  ok((await card.locator('.rcard').count()) === 2, 'both runs are in the history');
  // a comparison chosen here stays when another question is picked
  await card.locator('button:has-text("Compare with the next run")').first().click(); await page.waitForTimeout(150);
  await card.locator('.exp-tabs button:has-text("Run")').click();
  await card.locator('.chip:has-text("Start from all zeros")').click(); await page.waitForTimeout(150);
  await card.locator('.exp-tabs button:has-text("History")').click(); await page.waitForTimeout(150);
  ok((await card.locator('button:has-text("Comparing")').count()) === 1, 'a comparison chosen in History survives picking another question');
  await card.locator('button:has-text("Comparing")').click(); await page.waitForTimeout(150);
  await card.locator('button:has-text("Show")').nth(1).click();
  ok(/Showing your run from/.test(await card.innerText()), 'an earlier run can be shown again');
  // code: break the script, run, see the line
  await card.locator('.exp-tabs button:has-text("Code")').click();
  const src = await card.locator('.editor textarea').inputValue();
  ok(/def backward\(/.test(src) && (await card.locator('.editor pre .tk-k').count()) > 20, 'the editor shows the script, highlighted');
  await card.locator('.editor textarea').fill(src.replace('    rng = lab.rng\n    width, depth', '    rng = lab.rng\n    boom = undefined_name + 1\n    width, depth'));
  await page.waitForTimeout(500);
  ok(await card.locator('button:has-text("Reset to the original")').isVisible(), 'Reset appears as soon as the script differs from the original');
  await card.locator('.exp-tabs button:has-text("Run")').click();
  await card.locator('.chip:has-text("Check the gradient")').click();
  ok((await card.locator('.predict').count()) === 0 && /free run: no prediction and no verdict/.test(await card.innerText()), 'with an edited script the question is withdrawn: runs are free runs');
  await card.locator('button:has-text("Run my edited script")').click();
  await page.waitForFunction(() => { const c = document.querySelector('.exp[data-exp="u01_backprop_numpy"] .err'); return !!c; }, null, { timeout: 60000 });
  const err = await card.locator('.err').innerText();
  const boomLine = src.split('\n').findIndex((l) => /^    rng = lab\.rng$/.test(l)) + 2;      // the line added above, counted in the reader's script
  ok(/NameError/.test(err) && new RegExp('line ' + boomLine + '\\b').test(err), 'a failing script reports the Python error and the line in the reader\'s script');
  ok((await card.locator('.verdict').count()) === 0, 'and gives no verdict');
  await card.locator('button:has-text("Show line ' + boomLine + '")').click(); await page.waitForTimeout(600);
  ok(await page.evaluate(() => { const b = document.querySelector('.exp[data-exp="u01_backprop_numpy"] .errbar').getBoundingClientRect(), e = document.querySelector('.exp[data-exp="u01_backprop_numpy"] .editor').getBoundingClientRect(), m = document.querySelector('#main').getBoundingClientRect(); return b.top >= e.top && b.bottom <= e.bottom && b.top >= m.top && b.bottom <= m.bottom; }), '“Show line” puts the marked line inside the visible part of the editor');
  await card.locator('.exp-tabs button:has-text("Run")').click();
  await card.locator('button:has-text("Ask the tutor to find the cause")').click();
  await page.waitForFunction(() => /Put this script in the editor/.test(document.querySelector('#m-body').innerText), null, { timeout: 8000 });
  const p2 = await page.evaluate(() => window.__lastPrompt.map((t) => t.content).join('\n'));
  ok(/NameError/.test(p2) && /undefined_name/.test(p2) && /COMPLETE script/.test(p2), 'the diagnosis prompt carries the script and the traceback');
  await page.click('text=Put this script in the editor'); await page.waitForTimeout(400);
  ok(/A canned script/.test(await card.locator('.editor textarea').inputValue()), 'the tutor\'s script lands in the editor');
  await page.click('#toast button'); await page.waitForTimeout(300);
  ok(/undefined_name/.test(await card.locator('.editor textarea').inputValue()), 'Undo brings the reader\'s script back');
  await card.locator('button:has-text("Reset to the original")').click(); await page.waitForTimeout(300);
  ok(!/undefined_name/.test(await card.locator('.editor textarea').inputValue()), 'Reset restores the original script');
  // a PyTorch experiment on a machine without PyTorch: an honest message
  const torch = page.locator('.exp[data-exp="u01_autograd_torch"]');
  ok((await torch.locator('button:has-text("on my Mac")').count()) === 0 && /has no PyTorch/.test(await torch.innerText()) && /recorded run answers the question/.test(await torch.innerText()), 'a PyTorch experiment with a numpy-only engine offers no run and says why');
  await torch.locator('.predict label').nth(0).click();
  await torch.locator('button:has-text("Lock in and show the reference run")').click(); await page.waitForTimeout(500);
  ok(/Your prediction held/.test(await torch.locator('.verdict').innerText()) && (await torch.locator('.err').count()) === 0, 'and the recorded run answers its question');
  // scratch bench runs its template
  const scratch = page.locator('.exp[data-exp="scratch_u1"]');
  await scratch.locator('button:has-text("Run on my Mac")').click();
  await page.waitForFunction(() => { const c = document.querySelector('.exp[data-exp="scratch_u1"]'); return c && c.querySelectorAll('.tile').length >= 3; }, null, { timeout: 60000 });
  ok((await scratch.locator('.qc-canvas').count()) >= 2, 'the scratch bench runs and draws its curve and scatter plot');
  await shot(page, 'e2e-u1-train-scratch');

  /* ---------- reload: everything is still there ---------- */
  await page.waitForTimeout(1200);      // let the page finish bringing the last result into view
  await page.evaluate(() => { document.querySelector('#main').scrollTo({ top: 700, behavior: 'instant' }); }); await page.waitForTimeout(500);
  await page.reload(); await page.waitForTimeout(1300);
  ok(/2 of 3/.test(await page.locator('#rail').innerText()), 'after a reload the ledger is back');
  ok((await page.evaluate(() => document.querySelector('#main').scrollTop)) > 400, 'and the page is where the reader left it');
  const again = page.locator('.exp[data-exp="u01_backprop_numpy"]');
  ok(/Your last run here/.test(await again.innerText()), 'after a reload each experiment offers its last run');
  await again.locator('button:has-text("Show it")').click(); await page.waitForTimeout(300);
  ok(/Showing your run from/.test(await again.innerText()) && (await again.locator('.verdict').count()) === 1, 'and shows it with its verdict');
  await page.goto(srv.url + '#u1'); await page.waitForTimeout(600);
  ok((await page.locator('.sheet .mark').count()) === 1, 'after a reload the remark chip is back on its block');
  await page.click('.sheet .mark'); await page.waitForTimeout(200);
  ok(/Canned answer/.test(await page.locator('#m-body').innerText()), 'and the thread opens from the chip');
  await page.goto(srv.url + '#ledger'); await page.waitForTimeout(400);
  ok((await page.locator('table.data tbody tr').count()) === 3 && /missed/.test(await page.locator('table.data').innerText()), 'the ledger page lists the three predictions');
  await shot(page, 'e2e-ledger');

  /* ---------- other units ---------- */
  for (const u of ['u2', 'u4', 'u7']) {
    await page.goto(srv.url + '#' + u); await page.waitForTimeout(700);
    ok((await page.locator('.katex-error').count()) === 0 && (await page.locator('.sheet .blk').count()) > 50 && (await page.locator('.widget canvas').count()) >= 1, u + ': notes and widget render');
    await shot(page, 'e2e-' + u);
  }
  // no display formula is wider than the reading column at this width
  for (const u of ['u1', 'u2', 'u4', 'u7']) {
    await page.goto(srv.url + '#' + u); await page.waitForTimeout(600);
    const wide = await page.evaluate(() => { document.querySelectorAll('.sheet details').forEach((d) => { d.open = true; }); return [...document.querySelectorAll('.sheet .katex-display')].filter((el) => el.scrollWidth > el.clientWidth + 1).length; });
    ok(wide === 0, u + ': every display formula fits the column');
  }
  ok((await page.locator('.stmt-h b .katex').count()) >= 1 && !(await page.locator('.stmt-h').allInnerTexts()).join(' ').includes('$'), 'a formula in the name of a statement is typeset');
  // week 4 figure: its counters agree with what its text and buttons claim
  await page.goto(srv.url + '#u4'); await page.waitForTimeout(600);
  await page.click('.widget summary:has-text("What you found")');
  await page.click('.widget button:has-text("Set the textbook step η")'); await page.waitForTimeout(200);
  const w4 = (await page.locator('.widget .w-read').innerText()).replace(/\s+/g, ' ');
  ok(/started 87/.test(w4) && /long-run factor per step 0\.923/.test(w4) && /your best at this κ 87 steps/.test(w4), 'week 4 figure: the textbook step shows 87 steps and factor 0.923');
  const grid = await page.evaluate(() => {
    let plain = Infinity, mom = Infinity, rate = Infinity;
    for (let v = -3; v <= 0.35 + 1e-9; v += 0.005) { const e = Math.pow(10, v), q = DL.quadSim(25, e, 0, 20000); if (q.hit != null && q.hit < plain) plain = q.hit; }
    for (let m = 0; m <= 0.95 + 1e-9; m += 0.01) for (let v = -3; v <= 0.35 + 1e-9; v += 0.005) { const e = Math.pow(10, v), q = DL.quadSim(25, e, m, 20000); if (q.hit != null && q.hit < mom) mom = q.hit; rate = Math.min(rate, DL.quadRate(25, e, m)); }
    return { plain, mom, rate, tbPlain: DL.quadSim(25, 2 / 26, 0, 20000).hit, tbMom: DL.quadSim(25, Math.pow(2 / 6, 2), Math.pow(4 / 6, 2), 20000).hit, tbRate: DL.quadRate(25, Math.pow(2 / 6, 2), Math.pow(4 / 6, 2)) };
  });
  ok(grid.plain === grid.tbPlain, 'no step size on the slider beats the textbook step on the figure\'s counter (' + grid.plain + ' against ' + grid.tbPlain + ')');
  ok(grid.mom < grid.tbMom && grid.mom >= 0.6 * grid.tbMom && grid.rate >= grid.tbRate - 1e-9, 'with momentum the textbook pair is beaten on the counter by about a quarter (' + grid.mom + ' against ' + grid.tbMom + ') and by nothing on the long-run factor, as the text says');
  // week 7 figure: the first task can be done as it is worded
  await page.goto(srv.url + '#u7'); await page.waitForTimeout(600);
  await page.locator('.widget input[type=range]').nth(1).evaluate((el) => { el.value = '215'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const w7 = (await page.locator('.widget .w-read').first().innerText()).replace(/\s+/g, ' ');
  ok(/Point the query along D/.test(await page.locator('.widget').first().innerText()) && /output = Σ weight × value = 3\.9\d/.test(w7) && /✓ D has 89% of the weight/.test(w7), 'week 7 figure: with the query along D the output is close to 4 and the task is ticked (' + w7.slice(0, 60) + '…)');
  await page.goto(srv.url + '#u7-train'); await page.waitForTimeout(500);
  const att = page.locator('.exp[data-exp="u07_attention_numpy"]');
  await att.locator('.predict label').nth(0).click();
  await att.locator('button:has-text("Lock in and show the reference run")').click(); await page.waitForTimeout(400);
  ok(/reference run, recorded on/.test(await att.innerText()) && /Not what you predicted/.test(await att.locator('.verdict').innerText()), 'a reference run answers a question without the engine');
  // the PyTorch experiment: its reference runs were recorded on a Mac (src/reference_mac.json)
  const tr = page.locator('.exp[data-exp="u07_char_transformer"]');
  await tr.locator('.predict label').nth(1).click();
  await tr.locator('button:has-text("Lock in and show the reference run")').click(); await page.waitForTimeout(400);
  ok(/recorded on MacBook Air M5/.test(await tr.innerText()) && /Your prediction held/.test(await tr.locator('.verdict').innerText()) && /2\.259/.test(await tr.locator('.verdict').innerText()), 'the transformer\'s quick question is judged from the run recorded on the Mac');
  ok((await tr.locator('.qc-canvas').count()) >= 1 && /Sample from the trained model/.test(await tr.innerText()) && /one engine process/.test(await tr.innerText()), 'the recorded run shows its curve, the generated text, and how it was recorded');
  await shot(page, 'e2e-u7-train-reference');
  await tr.locator('.chip:has-text("Remove the position table")').click();
  await tr.locator('.predict label').nth(1).click();
  await tr.locator('button:has-text("Lock in and show the reference run")').click(); await page.waitForTimeout(400);
  ok(/Your prediction held/.test(await tr.locator('.verdict').innerText()) && /1\.663 without positions, against 1\.576 with them/.test(await tr.locator('.verdict').innerText()), 'the no-positions question is judged against the full recorded run');
  // the data path of that experiment: the page sends Tiny Shakespeare along with the job, in pieces
  const sent = await page.evaluate(async () => {
    const code = 'import hashlib\n\n\ndef run(lab):\n    t = lab.dataset("tinyshakespeare")\n    lab.result(n=len(t), distinct=len(set(t)))\n    lab.text("sha256", hashlib.sha256(t.encode("utf-8")).hexdigest())\n';
    const j = DL.engine.job(code, {}, 1, 30, { tinyshakespeare: DL.DATA.tinyshakespeare }), said = [];
    const r = await DL.engine.run(j.job, (name, d) => { if (name === 'status') said.push(d.text); }).promise;
    return { n: r.payload.results.n, distinct: r.payload.results.distinct, sha: r.payload.outputs[0].text, pieces: said.filter((t) => /Sending the script and data/.test(t)).length, log: (r.result.log || []).join(' ') };
  });
  ok(sent.n === 1115394 && sent.distinct === 65 && sent.sha === '86c4e6aa9db7c042ec79f339dcb96d42b0075e16b8fc2e86bf0ca57e2dc565ed' && sent.pieces >= 4 && !/not sent by the page/.test(sent.log), 'a job that carries the dataset reaches the engine in pieces, and the script reads exactly that text (' + sent.pieces + ' pieces)');
  await page.goto(srv.url + '#u4-train'); await page.waitForTimeout(500);
  const opt = page.locator('.exp[data-exp="u04_optimizers_quadratic"]');
  await opt.locator('.chip:has-text("Rotate the coordinates")').click();
  await opt.locator('.predict label').nth(0).click();
  await opt.locator('button:has-text("Lock in and run")').click();
  await page.waitForFunction(() => { const c = document.querySelector('.exp[data-exp="u04_optimizers_quadratic"]'); return c && c.querySelector('.verdict'); }, null, { timeout: 60000 });
  ok(/Your prediction held/.test(await opt.locator('.verdict').innerText()), 'week 4: the rotation question is judged from the run');
  await shot(page, 'e2e-u4-train');
  /* ---------- week 2 ---------- */
  await page.goto(srv.url + '#u2'); await page.waitForTimeout(700);
  ok((await page.locator('#rail-secs a').count()) === 9 && (await page.locator('.sheet .figure svg').count()) === 4, 'week 2: the course map lists seven sections, the check questions and the experiments; four diagrams render');
  const w2 = async () => (await page.locator('.widget .w-read').innerText()).replace(/\s+/g, ' ');
  ok(/the 40 letters cost 80\.0 bits/.test(await w2()) && !/✓/.test(await w2()), 'week 2 figure: equal probabilities cost 2 bits per letter, 80 in all');
  await page.click('.widget summary:has-text("What you found")');
  await page.click('.widget button:has-text("Set the model to the letter frequencies")'); await page.waitForTimeout(150);
  ok(/the 40 letters cost 70\.0 bits/.test(await w2()) && /✓ no model does better: 70\.0 bits is the minimum/.test(await w2()), 'week 2 figure: the letter frequencies give the entropy, 1.75 bits per letter, and the tick');
  await page.locator('.widget input[type=range]').nth(3).evaluate((el) => { el.value = '0.005'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const dz = +(/cost ([\d.]+) bits/.exec(await w2()) || [])[1];
  ok(dz > 80 && !/✓/.test(await w2()), 'week 2 figure: a model that nearly rules out D makes the message longer than equal probabilities do (' + dz + ' bits)');
  await page.click('.widget .chip:has-text("All four equally likely")');
  await page.click('.widget button:has-text("Set the model to the letter frequencies")'); await page.waitForTimeout(150);
  ok(/the 40 letters cost 80\.0 bits/.test(await w2()) && /✓/.test(await w2()), 'week 2 figure: on the uniform source nothing beats 2 bits per letter');
  const ent = await page.evaluate(() => DL.CODE_SOURCES.map((S) => S.p.reduce((a, v) => a - v * Math.log2(v), 0).toFixed(3)));
  const found = await page.locator('.widget .w-reveal').innerText();
  ok(ent.join() === '1.750,1.357,2.000' && /1\.75 bits for the first source, 1\.357 for the second, 2 for the third/.test(found), 'week 2 figure: the entropies its text states are those of its three sources');
  ok(await page.evaluate(() => DL.EXPERIMENTS.every((e) => (e.presets || []).every((p) => !/\$|\\[a-zA-Z]/.test(p.q + ' ' + p.opts.join(' '))))), 'every prediction question and option is plain text: the question box shows no TeX source');
  await page.goto(srv.url + '#u2-train'); await page.waitForTimeout(500);
  const ac = page.locator('.exp[data-exp="u02_arithmetic_coding"]');
  await ac.locator('.predict label').nth(2).click();
  await ac.locator('button:has-text("Lock in and run")').click();
  await page.waitForFunction(() => { const c = document.querySelector('.exp[data-exp="u02_arithmetic_coding"]'); return c && c.querySelector('.verdict'); }, null, { timeout: 60000 });
  ok(/Your prediction held/.test(await ac.locator('.verdict').innerText()) && /0\.0796 per letter/.test(await ac.locator('.verdict').innerText()), 'week 2: arithmetic coding is run by the engine and spends 0.0796 bits per letter (seed 1)');
  ok(/6\.645/.test(await ac.innerText()) && /0\.01449/.test(await ac.innerText()) && /0\.2084/.test(await ac.innerText()) && /0\.1029/.test(await ac.innerText()), 'week 2: the numbers the explanations quote are on the screen');
  await shot(page, 'e2e-u2-train');
  const ng = page.locator('.exp[data-exp="u02_shakespeare_ngrams"]');
  await ng.locator('.predict label').nth(2).click();
  await ng.locator('button:has-text("Lock in and run")').click();
  await page.waitForFunction(() => { const c = document.querySelector('.exp[data-exp="u02_shakespeare_ngrams"]'); return c && (c.querySelector('.verdict') || c.querySelector('.err')); }, null, { timeout: 120000 });
  const ngText = await ng.innerText();
  ok(/Your prediction held/.test(await ng.locator('.verdict').innerText()) && /0\.366 bits per character/.test(ngText) && !/not sent by the page/.test(ngText), 'week 2: the counting experiment gets Tiny Shakespeare from the page and its plug-in estimate at k = 9 is 0.366 bits');
  await ng.locator('.chip:has-text("Score the held-out text")').click();
  await ng.locator('.predict label').nth(1).click();
  await ng.locator('button:has-text("Lock in and show the reference run")').click(); await page.waitForTimeout(400);
  ok(/Your prediction held/.test(await ng.locator('.verdict').innerText()) && /lowest at k = 4 \(2\.408\)/.test(await ng.locator('.verdict').innerText()), 'week 2: the held-out question is answered by the reference run (minimum 2.408 bits at k = 4)');
  /* ---------- weeks written after the sample: the same checks for each, then what is particular to it ---------- */
  const weekRun = async (u, exp, opt, re, what) => {
    await page.goto(srv.url + '#' + u + '-train'); await page.waitForTimeout(500);
    const card = page.locator('.exp[data-exp="' + exp + '"]');
    await card.locator('.predict label').nth(opt).click();
    await card.locator('button:has-text("Lock in and run")').click();
    await page.waitForFunction((id) => { const c = document.querySelector('.exp[data-exp="' + id + '"]'); return c && (c.querySelector('.verdict') || c.querySelector('.err')); }, exp, { timeout: 120000 });
    const held = /Your prediction held/.test(await card.locator('.verdict').innerText()), txt = await card.innerText();
    ok(held && re.test(txt), what + (held && re.test(txt) ? '' : ' [verdict: ' + (await card.locator('.verdict').innerText()).slice(0, 200).replace(/\s+/g, ' ') + ']'));
  };
  const weekRef = async (u, exp, chip, opt, re, what) => {
    await page.goto(srv.url + '#' + u + '-train'); await page.waitForTimeout(500);
    const card = page.locator('.exp[data-exp="' + exp + '"]');
    await card.locator('.chip:has-text("' + chip + '")').click();
    await card.locator('.predict label').nth(opt).click();
    await card.locator('button:has-text("Lock in and show the reference run")').click(); await page.waitForTimeout(400);
    ok(/Your prediction held/.test(await card.locator('.verdict').innerText()) && re.test(await card.locator('.verdict').innerText()), what);
  };
  const weekNotes = async (u, secs, figs) => {
    await page.goto(srv.url + '#' + u); await page.waitForTimeout(800);
    const r = await page.evaluate(() => ({ rail: document.querySelectorAll('#rail-secs a').length, figs: document.querySelectorAll('.sheet .figure svg').length, err: document.querySelectorAll('.katex-error').length, raw: document.querySelectorAll('.sheet .tex:not(.done)').length, widget: !!document.querySelector('.sheet .widget canvas') }));
    ok(r.rail === secs + 2 && r.figs === figs && r.err === 0 && r.raw === 0 && r.widget, u + ': ' + secs + ' sections, the check questions and the experiments in the course map; ' + figs + ' diagrams; every formula typeset; the hands-on figure draws');
  };
  /* week 3 */
  await weekNotes('u3', 6, 2);
  {
    const rd = async () => (await page.locator('.widget .w-read').innerText()).replace(/\s+/g, ' ');
    ok(/a coordinate exactly 0: no/.test(await rd()), 'week 3 figure: with the disk the constrained minimum has no zero coordinate');
    await page.click('.widget .chip:has-text("Diamond")'); await page.waitForTimeout(100);
    await page.click('.widget summary:has-text("What you found")');
    await page.click('.widget button:has-text("Drop 200 random minima")'); await page.waitForTimeout(150);
    const l1 = +(/random minima: (\d+) of 200/.exec(await rd()) || [])[1];
    await page.click('.widget .chip:has-text("Disk")');
    await page.click('.widget button:has-text("Drop 200 random minima")'); await page.waitForTimeout(150);
    const l2 = +(/random minima: (\d+) of 200/.exec(await rd()) || [])[1];
    ok(l1 > 60 && l2 === 0, 'week 3 figure: of 200 random minima, the diamond puts ' + l1 + ' on a corner and the disk none');
    ok(await page.evaluate(() => { const s = DL.ballMin([3, 0.2], 'l1', 1); return Math.abs(s.w[0] - 1) < 1e-12 && s.w[1] === 0; }), 'week 3 figure: a minimum far out along the first axis lands exactly on the diamond\'s corner (1, 0)');
  }
  await weekRun('u3', 'u03_estimators', 2, /0\.18\d\d by n \+ 1/, 'week 3: the engine runs the variance estimators and dividing by n + 1 wins');
  await weekRef('u3', 'u03_losses_priors', 'Weight decay as a prior', 2, /ratio 0\.1\d\d/, 'week 3: the reference run answers the ridge question (MAP far better than least squares)');
  /* week 5 */
  await weekNotes('u5', 6, 3);
  {
    const rd = async () => (await page.locator('.widget .w-read').innerText()).replace(/\s+/g, ' ');
    const grab = (t, k) => +(new RegExp(k + ', largest response (-?[\\d.]+)').exec(t) || [])[1];
    const t0 = await rd();
    await page.click('.widget button[aria-label="Move the shape right"]'); await page.click('.widget button[aria-label="Move the shape down"]'); await page.waitForTimeout(100);
    const t1 = await rd();
    ok(grab(t0, 'convolution') === grab(t1, 'convolution') && grab(t0, 'dense layer') !== grab(t1, 'dense layer') && /shape at \(5, 6\)/.test(t1), 'week 5 figure: moving the shape keeps the convolution\'s largest response and changes the dense layer\'s');
    ok(await page.evaluate(() => { const N = 16, im = new Float64Array(N * N), sh = new Float64Array(N * N); im[5 * N + 6] = 1; im[6 * N + 6] = 1; sh[7 * N + 9] = 1; sh[8 * N + 9] = 1;
      const k = [[0.3, -1, 2], [0.5, 1.5, -0.7], [1, 0.2, -2]], a = DL.conv2same(im, k, N), b = DL.conv2same(sh, k, N);
      for (let i = 0; i < N - 3; i++) for (let j = 0; j < N - 4; j++) if (Math.abs(a[i * N + j] - b[(i + 2) * N + j + 3]) > 1e-12) return false; return true; }), 'week 5 figure: the convolution commutes with a shift away from the border, for an arbitrary filter');
  }
  await weekRun('u5', 'u05_shifted_motif', 2, /with it on the right\./, 'week 5: the engine trains both models; the dense network is at chance on shifted patterns');
  await weekRef('u5', 'u05_residual_depth', 'Add the skips', 2, /residual against/, 'week 5: the reference run answers the residual question');
  /* week 6 */
  await weekNotes('u6', 5, 3);
  {
    const rd = async () => (await page.locator('.widget .w-read').innerText()).replace(/\s+/g, ' ');
    const back = (t) => +(/plain, 60 steps back: ([\d.e+-]+)/.exec(t) || [])[1];
    const g0 = back(await rd());
    const set = async (i, v) => page.locator('.widget input[type=range]').nth(i).evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
    await set(0, '1'); await set(1, '0.1'); await page.waitForTimeout(100);
    const g1 = back(await rd());
    await set(0, '3'); await page.waitForTimeout(100);
    const g2 = back(await rd());
    await page.click('.widget summary:has-text("What you found")'); await page.click('.widget button:has-text("Show the additive path")'); await page.waitForTimeout(100);
    ok(g0 < 1e-8 && g1 > 0.05 && g2 < 1e-20 && /additive, 60 steps back: 1\.0e\+0/.test(await rd()), 'week 6 figure: the gradient through 60 steps vanishes at w = 0.9 (' + g0 + '), survives at w = 1 with small inputs (' + g1 + '), saturates away at w = 3, and the additive path keeps all of it');
  }
  await weekRun('u6', 'u06_long_memory', 2, /for the plain RNN/, 'week 6: the engine trains both recurrent networks; the plain RNN\'s first-step gradient is more than 100 times smaller');
  await weekRef('u6', 'u06_decoding', 'Search for the most probable', 2, /0\.517 for beam search/, 'week 6: the reference run answers the beam-search question (0.517 bits per character)');
  /* week 8 */
  await weekNotes('u8', 6, 2);
  {
    const rd = async () => (await page.locator('.widget .w-read').innerText()).replace(/\s+/g, ' ');
    ok(/above this budget's best by/.test(await rd()), 'week 8 figure: the starting model is not the best for its budget');
    await page.click('.widget summary:has-text("What you found")');
    await page.click('.widget button:has-text("Jump to this budget\'s optimum")'); await page.waitForTimeout(100);
    const t1 = await rd();
    await page.click('.widget button:has-text("Set GPT-3\'s choice")'); await page.waitForTimeout(100);
    const t2 = await rd();
    ok(/✓ the lowest loss for this budget/.test(t1) && /tokens per parameter 19\.\d/.test(t1) && /tokens per parameter 1\.7/.test(t2) && /above this budget's best by 0\.01\d\d/.test(t2), 'week 8 figure: at 1e23 the optimum has about 19 tokens per parameter; GPT-3 had 1.7 and sits above its budget\'s optimum');
  }
  await weekRun('u8', 'u08_compute_optimal', 1, /grows by 3\.256/, 'week 8: the engine computes the compute-optimal split (ten times the compute, 3.256 times the parameters)');
  await weekRef('u8', 'u08_bpe', 'Three times as many', 1, /a cut of 1[67]/, 'week 8: the reference run answers the BPE question (about a sixth fewer tokens)');
  /* week 9 */
  await weekNotes('u9', 5, 2);
  {
    const rd = async () => (await page.locator('.widget .w-read').innerText()).replace(/\s+/g, ' ');
    ok(/gap 1\.9507/.test(await rd()) && !/✓/.test(await rd()), 'week 9 figure: with q the prior, the ELBO is 1.9507 below log p(x)');
    await page.click('.widget summary:has-text("What you found")'); await page.click('.widget button:has-text("Set q to the posterior")'); await page.waitForTimeout(100);
    ok(/✓ the bound is tight/.test(await rd()), 'week 9 figure: with q the posterior, the bound is tight');
    ok(await page.evaluate(() => { let worst = -Infinity; for (let m = -3; m <= 3; m += 0.1) for (let v = 0.02; v <= 3; v += 0.02) for (const x of [-2, 0, 1.5]) { const r = DL.elboToy(x, 0.5, m, v); worst = Math.max(worst, r.elbo - r.logp, Math.abs(r.logp - r.elbo - r.kl)); } return worst < 1e-12; }), 'week 9 figure: on a grid of q and x, the ELBO never exceeds log p(x) and the gap equals the KL divergence');
  }
  await weekRun('u9', 'u09_reparam', 2, /for the score function \(2\d\.\d+ times\)/, 'week 9: the engine compares the two gradient estimators (score function about 22 times the variance)');
  await weekRef('u9', 'u09_gan', 'Halve the distance', 2, /0\.693146 at θ = 1/, 'week 9: the reference run answers the JS question (ln 2 at both shifts)');
  await page.goto(srv.url + '#u13'); await page.waitForTimeout(400);
  const fullW = await page.evaluate(() => { const w = DL.COURSE.units.filter((u) => u.status === 'full').map((u) => String(u.week)); return w.slice(0, -1).join(', ') + ' and ' + w[w.length - 1]; });
  ok(new RegExp('full units for weeks ' + fullW + '\\.').test(await page.locator('.sheet').innerText()) && /\b2, 3\b/.test(fullW), 'a planned week names the written weeks (' + fullW + ')');
  await page.goto(srv.url + '#'); await page.waitForTimeout(400);
  ok(new RegExp('Weeks ' + fullW + ' are written out in full, with [a-z-]+ experiments between them').test(await page.locator('.col.home').innerText()), 'the overview counts the written weeks and the experiments');
  await page.goto(srv.url + '#u13'); await page.waitForTimeout(400);
  ok(/not written yet/.test(await page.locator('.sheet').innerText()) && (await page.locator('.sheet button:has-text("Ask the tutor")').count()) === 3, 'a planned week shows its syllabus and three questions');
  await page.click('.sheet button:has-text("Ask the tutor") >> nth=0');
  await page.waitForFunction(() => /Canned answer/.test(document.querySelector('#m-body').innerText), null, { timeout: 8000 });
  ok(/has not written notes for this week/.test(await page.evaluate(() => window.__lastPrompt[0].content)), 'the tutor is told when a week has no notes');
  await page.goto(srv.url + '#u5-sources'); await page.waitForTimeout(300);
  ok((await page.locator('.src-list a').count()) >= 8, 'the Sources tab links the course material and the papers');
  ok(errors.length === 0, 'no script errors on desktop' + (errors.length ? ': ' + errors.slice(0, 3).join(' || ') : ''));
  await ctx.close();

  /* ================= phone ================= */
  console.log('phone');
  ({ ctx, page, errors } = await open({ w: 390, h: 844, mobile: true }));
  for (const r of ['home', 'u1', 'u1-train', 'u2', 'u2-train', 'u3', 'u3-train', 'u4', 'u5', 'u5-train', 'u6', 'u6-train', 'u8', 'u8-train', 'u9-train', 'u7', 'u7-train', 'u9', 'u9-sources', 'ledger']) {
    await page.goto(srv.url + '#' + r); await page.waitForTimeout(500);
    ok(await noOverflow(page), 'phone: no horizontal overflow on #' + r);
  }
  for (const u of ['u2', 'u3', 'u5', 'u6', 'u8', 'u9']) {
    await page.goto(srv.url + '#' + u); await page.waitForTimeout(700);
    ok((await page.evaluate(() => { document.querySelectorAll('.sheet details').forEach((d) => { d.open = true; }); return [...document.querySelectorAll('.sheet .katex-display')].filter((el) => el.scrollWidth > el.clientWidth + 1).length; })) === 0, 'phone: every display formula of ' + u + ' fits the column, proofs included');
  }
  await page.goto(srv.url + '#u1'); await page.waitForTimeout(700);
  ok((await page.locator('.sheet .figure .can-scroll').count()) === 2 && (await page.evaluate(() => [...document.querySelectorAll('.sheet .katex-display')].filter((el) => el.scrollWidth > el.clientWidth + 1).length)) === 0, 'phone: the two diagrams are marked as scrolling sideways, and every display formula fits');
  ok(await page.evaluate(() => [...document.querySelectorAll('.sheet .figure .can-scroll')].every((el) => { const c = el.nextElementSibling, r = c && c.getBoundingClientRect(), b = el.getBoundingClientRect(); return c && c.classList.contains('scroll-cue') && /scroll/.test(c.textContent) && getComputedStyle(c).visibility === 'visible' && r.height >= 10 && r.top >= b.bottom - 4 && r.right <= window.innerWidth; })) && !(await page.locator('#toast').isVisible()), 'phone: each block that scrolls sideways has a small “scroll” tag below it, over nothing, and no message covers the page');
  const below0 = await page.evaluate(() => { const el = document.querySelector('.sheet .figure .can-scroll'); return el.parentElement.getBoundingClientRect().bottom; });
  await page.evaluate(() => { document.querySelector('.sheet .figure .can-scroll').scrollLeft = 40; }); await page.waitForTimeout(250);
  ok(await page.evaluate((below0) => { const a = [...document.querySelectorAll('.sheet .figure .can-scroll')]; return getComputedStyle(a[0].nextElementSibling).visibility === 'hidden' && getComputedStyle(a[1].nextElementSibling).visibility === 'visible' && Math.abs(a[0].parentElement.getBoundingClientRect().bottom - below0) < 1; }, below0), 'phone: the tag disappears once its block has been scrolled, and nothing below it moves');
  ok(await page.locator('#toc').isVisible() && (await page.locator('.blk > .up').first().isVisible()), 'phone: the notes carry a folded list of sections, and each heading a way back to it');
  // a finger on a dot of the week 1 figure
  {
    const cdp = await ctx.newCDPSession(page);
    const swipe = async (x0, y0, dx, dy) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
      for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + dx * i / 10, y: y0 + dy * i / 10 }] }); await page.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(400);
    };
    const top = () => page.evaluate(() => document.querySelector('#main').scrollTop);
    await page.evaluate(() => document.querySelector('.widget canvas').scrollIntoView({ block: 'center', behavior: 'instant' })); await page.waitForTimeout(300);
    const pb = await page.locator('.widget canvas').first().boundingBox();
    const px = pb.x + 34 + (-0.8 + 1) / 2 * (pb.width - 2 - 44), py = pb.y + (pb.height - 2 - 22) - 0.6 / 2.1 * (pb.height - 2 - 32);
    const t0 = await top(), kk0 = await page.locator('.widget input[type=range]').first().inputValue();
    await swipe(pb.x + pb.width - 16, pb.y + pb.height - 30, -30, -90);      // far from every dot: an ordinary swipe
    const t1 = await top(), kk1 = await page.locator('.widget input[type=range]').first().inputValue();
    ok(Math.abs(t1 - t0) > 30 && kk1 === kk0, 'phone: a swipe on the picture away from the dots scrolls the page (' + Math.round(t1 - t0) + ' px)');
    await page.evaluate(() => document.querySelector('.widget canvas').scrollIntoView({ block: 'center', behavior: 'instant' })); await page.waitForTimeout(300);
    const pb2 = await page.locator('.widget canvas').first().boundingBox(), t2 = await top();
    await swipe(px + 16, py - pb.y + pb2.y + 14, 60, -70);      // starts 21 px off the first dot and moves diagonally
    const t3 = await top(), kk2 = await page.locator('.widget input[type=range]').first().inputValue();
    ok(+kk2 > +kk0 + 0.1 && Math.abs(t3 - t2) <= 2, 'phone: a finger near a dot takes it, a diagonal drag moves it (from ' + kk0 + ' to ' + kk2 + '), and the page stays put');
    await cdp.detach();
  }
  await page.click('#toc summary'); await page.click('#toc a:has-text("3. Neural networks")'); await page.waitForTimeout(600);
  ok(await page.evaluate(() => { const h = document.getElementById('sec-3').getBoundingClientRect(); return h.top >= 0 && h.top < 220; }), 'phone: a section link goes to the section');
  await page.evaluate(() => [...document.querySelectorAll('.sheet .blk .md p')].find((x) => x.textContent.includes('The standing assumption')).scrollIntoView({ block: 'center', behavior: 'instant' })); await page.waitForTimeout(400);
  await page.evaluate(() => { const p = [...document.querySelectorAll('.sheet .blk .md p')].find((x) => x.textContent.includes('The standing assumption')), r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new Event('selectionchange')); });
  await page.waitForSelector('#seltools:not([hidden])', { timeout: 3000 }); await page.click('#sel-explain');
  await page.waitForFunction(() => /Canned answer/.test(document.querySelector('#m-body').innerText) && !document.querySelector('#m-live'), null, { timeout: 8000 });
  await page.evaluate(() => { document.querySelector('#main').scrollTo({ top: 0, behavior: 'instant' }); });
  // on a touch keyboard Enter is a new line; the button sends
  await page.click('#m-head button[aria-label="Back to all remarks"]'); await page.waitForTimeout(200);
  const pBox = '#m-body textarea[aria-label="Question for the tutor"]', nBefore = await page.locator('#m-list .rcard').count();
  await page.fill(pBox, 'first line'); await page.press(pBox, 'Enter'); await page.waitForTimeout(300);
  ok(/\n/.test(await page.inputValue(pBox)) && !/Enter sends/.test(await page.locator('#m-body').innerText()) && (await page.locator('#m-list .rcard').count()) === nBefore && /^Remarks/.test(await page.locator('#m-head').innerText()), 'phone: Enter in a question box starts a new line; the Ask button sends');
  await page.fill(pBox, '');
  await page.click('#m-list .rcard:has-text("Explain this")'); await page.waitForTimeout(300);
  await page.click('#m-body button:has-text("Show the place")'); await page.waitForTimeout(900);
  ok(await page.evaluate(() => { const b = [...document.querySelectorAll('.sheet .blk')].find((x) => x.textContent.includes('The standing assumption')).getBoundingClientRect(); return !document.querySelector('#margin').classList.contains('open') && b.top >= 0 && b.top < window.innerHeight - 80; }), 'phone: “Show the place” closes the sheet and shows the line');
  await page.goto(srv.url + '#u7-train'); await page.waitForTimeout(500);
  const pAtt = page.locator('.exp[data-exp="u07_attention_numpy"]');
  await pAtt.locator('.predict label').nth(0).click();
  await pAtt.locator('button:has-text("Lock in and show the reference run")').click(); await page.waitForTimeout(1000);
  ok(await page.evaluate(() => { const v = document.querySelector('.exp[data-exp="u07_attention_numpy"] .verdict').getBoundingClientRect(), m = document.querySelector('#main').getBoundingClientRect(); return v.top >= m.top - 1 && v.top < m.bottom - 60; }), 'phone: the verdict is scrolled into view');
  // the engine dialog and the code editor on a phone
  await page.click('#btn-engine'); await page.waitForTimeout(250);
  const pd = await page.evaluate(() => { const b = document.querySelector('.mbox'), d = b.querySelector('details'), btn = [...b.querySelectorAll('button')].find((x) => /Connect to my Mac|Check again/.test(x.textContent)); return { first: b.querySelector('p').innerText, open: d.open, onScreen: btn.getBoundingClientRect().bottom <= window.innerHeight && d.querySelector('summary').getBoundingClientRect().bottom <= window.innerHeight }; });
  ok(/^You need the engine only to run experiments yourself/.test(pd.first) && !pd.open && pd.onScreen, 'phone: the engine dialog fits the first screen: what it is for, Connect, and the folded setup');
  await shot(page, 'e2e-phone-engine');
  await page.click('.mbox .iconbtn'); await page.waitForTimeout(150);
  await page.goto(srv.url + '#u1-train'); await page.waitForTimeout(500);
  await page.locator('.exp[data-exp="u01_backprop_numpy"] .exp-tabs button:has-text("Code")').click(); await page.waitForTimeout(300);
  const lnPos = await page.evaluate(() => { const e = document.querySelector('.exp[data-exp="u01_backprop_numpy"] .editor'); e.scrollIntoView({ block: 'center', behavior: 'instant' }); e.scrollLeft = 180; const n = e.querySelector('.ln').getBoundingClientRect(), b = e.getBoundingClientRect(); return { moved: e.scrollLeft, left: n.left - b.left, width: n.width }; });
  ok(lnPos.moved > 100 && Math.abs(lnPos.left) <= 2 && lnPos.width >= 30, 'phone: the editor\'s line numbers stay in view when a long line is scrolled sideways');
  await shot(page, 'e2e-phone-editor');
  await page.goto(srv.url + '#ledger'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => { const r = document.querySelector('table.ledger td[data-label="Result"]').getBoundingClientRect(), w = document.querySelector('table.ledger td[data-label="It was"]').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && w.right <= window.innerWidth && r.width > 20; }) && await noOverflow(page), 'phone: the ledger shows what happened and whether the prediction held without sideways scrolling');
  await shot(page, 'e2e-phone-ledger');
  await page.goto(srv.url + '#u7'); await page.waitForTimeout(500);
  await page.click('#btn-margin'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector('#margin').classList.contains('open')), 'phone: the margin opens as a sheet');
  await shot(page, 'e2e-phone-margin');
  await page.click('#m-head .iconbtn'); await page.click('#btn-map'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector('#rail').classList.contains('open')), 'phone: the course map opens as a drawer');
  await page.click('#rail .unit-link:has-text("Optimization")'); await page.waitForTimeout(400);
  ok(page.url().endsWith('#u4') && !(await page.evaluate(() => document.querySelector('#rail').classList.contains('open'))), 'phone: choosing a week navigates and closes the drawer');
  await shot(page, 'e2e-phone-u4');
  ok(errors.length === 0, 'no script errors on the phone' + (errors.length ? ': ' + errors.slice(0, 3).join(' || ') : ''));
  await ctx.close();

  /* ================= no Claude runtime capabilities ================= */
  /* ================= the variant published as a Claude Artifact ================= */
  console.log('artifact variant');
  {
    const out = path.join(require('os').tmpdir(), 'dl-artifact-' + process.pid + '.html');
    require('child_process').execFileSync('node', [path.join(__dirname, '..', 'build.js'), '--artifact', out], { stdio: 'ignore' });
    const c = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
    await c.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
    const p = await c.newPage();
    await p.goto('file://' + out + '#u2'); await p.waitForTimeout(900);
    ok(/^<!DOCTYPE html>/.test(fs.readFileSync(out, 'utf8')) && await p.evaluate(() => document.compatMode === 'CSS1Compat' && document.querySelectorAll('.sheet .tex').length > 100 && [...document.querySelectorAll('.sheet .tex')].every((t) => t.querySelector('.katex'))), 'the Artifact variant starts with a doctype, runs in standards mode, and typesets its formulas (in quirks mode KaTeX refuses)');
    await c.close(); fs.unlinkSync(out);
  }

  console.log('without tutor and engine');
  ({ ctx, page, errors } = await open({ w: 1200, h: 800 }, '?off=sample,mcp,db'));
  await page.goto(srv.url + '?off=sample,mcp,db#u1-train'); await page.waitForTimeout(600);
  await page.click('text=Connect to my Mac'); await page.waitForTimeout(600);
  ok(/reference run/.test(await page.locator('#engine-card').innerText()), 'without the engine the card says what still works');
  await page.click('#btn-engine'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => { const b = document.querySelector('.mbox'); return /^You need the engine only to run experiments yourself/.test(b.querySelector('p').innerText) && b.querySelector('details').open; }), 'when Connect has failed the engine dialog opens with the setup steps unfolded');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(/Saved in this browser only/.test(await page.locator('#rail').innerText()), 'without the database the page says it saves in the browser');
  await page.goto(srv.url + '?off=sample,mcp,db#u1'); await page.waitForTimeout(500);
  ok(/The tutor needs Claude/.test(await page.locator('#m-body').innerText()), 'without the tutor the margin says so and still keeps notes');
  ok(errors.length === 0, 'no script errors without capabilities' + (errors.length ? ': ' + errors.slice(0, 3).join(' || ') : ''));
  await ctx.close();

  await browser.close(); srv.close();
  console.log(failures ? '\n' + failures + ' of ' + step + ' checks failed' : '\nall ' + step + ' checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
