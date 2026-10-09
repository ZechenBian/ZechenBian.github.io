// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 每条规则的说明都要能排版：没有 KaTeX 报错，没有漏网的 $，五个小节齐全
const path = require("path"), fs = require("fs"), { open } = require("./ui-smoke.js");
const SH = n => path.join(__dirname, "../shots/" + n);
let pass = 0, fail = 0; const ok = (c, name, d) => { if (c) pass++; else { fail++; console.log("  FAIL", name, d || ""); } };
(async () => {
  const t = await open({ viewport: { width: 1440, height: 1000 }, init: fs.readFileSync(path.join(__dirname, "mock-claude.js"), "utf8") }); const { page, logs } = t;
  await page.waitForSelector(".crit .big"); await page.waitForFunction(() => !window.App.isBusy);
  const ids = await page.evaluate(() => window.App.allStrats().map(s => s.id));   // 价格世界的规则和十套玩法各自的规则
  for (const id of ids) {
    const info = await page.evaluate(sid => {
      const A = window.App, st = A.strat(sid), host = document.createElement("div"); host.style.cssText = "position:absolute;left:-9999px;width:700px"; document.body.appendChild(host);
      window.QLMD.mount(host, A.explainMd(st));
      const out = { err: [...host.querySelectorAll(".katex-error")].map(e => e.textContent.slice(0, 60)), katex: host.querySelectorAll(".katex").length, heads: [...host.querySelectorAll("h2,h3,h4")].map(h => h.textContent), dollars: (host.textContent.match(/\$[^$]{1,80}\$/g) || []).slice(0, 3), len: host.textContent.length, tier: st.explain && st.explain.tier };
      host.remove(); return out;
    }, id);
    ok(info.err.length === 0, id + "：公式都能排版", info.err.join(" | "));
    ok(info.dollars.length === 0, id + "：没有漏掉没排版的公式", info.dollars.join(" | "));
    ok(info.heads.length >= 5 && info.len > 100, id + "：小节齐全", info.heads.join(",") + " / " + info.len);
  }
  // 世界的说明：公式都排得出来，没有漏掉的 $，没有 undefined / NaN；一句话的介绍（blurb）是纯文字
  const worlds = await page.evaluate(() => { const A = window.App, QL = A.QL, out = {}; for (const k in QL.WORLDS) { const w = QL.WORLDS[k]; let note = ""; try { const th = w.theory ? w.theory(QL.worldDefaults(k), { K: w.defaults.K, rf: 0 }) : null; note = th && th.note || ""; } catch (e) { note = "THREW " + e.message; }
    const host = document.createElement("div"); document.body.appendChild(host); window.QLMD.mount(host, note);
    const errs = host.querySelectorAll(".katex-error").length, undone = host.querySelectorAll(".tex:not(.done)").length, clone = host.cloneNode(true); clone.querySelectorAll(".katex").forEach(e => e.remove());
    out[k] = { note, blurb: w.blurb, errs, undone, rest: clone.textContent, n: host.querySelectorAll(".katex").length }; host.remove(); } return out; });
  for (const k in worlds) { const w = worlds[k];
    ok(!/THREW|undefined|NaN/.test(w.note + w.blurb) && w.errs === 0 && w.undone === 0 && !/[$\\^_{}]/.test(w.rest), "世界 " + k + " 的说明：公式都排出来了，正文里没有残留的记号", (w.rest.match(/[$\\^_{}].{0,20}/) || [w.errs + " errors"])[0]);
    ok(!/\$|\\[a-z]+\{/.test(w.blurb), "世界 " + k + " 的一句话介绍是纯文字"); }
  ok(["gbm", "ou", "heston", "fbm", "ar1", "osc", "bet"].every(k => worlds[k] && worlds[k].n >= 2), "有公式的那几个世界，说明里的公式确实是排版出来的");
  // 看两张实际的弹层
  for (const id of ["voltarget", "kalman"]) { await page.selectOption("#stratSel", id); await page.waitForTimeout(500); await page.waitForFunction(() => !window.App.isBusy); await page.click('#blkStrat button:has-text("代码与说明")'); await page.waitForSelector(".modal-box .katex", { timeout: 8000 }); await page.waitForTimeout(300); await page.screenshot({ path: SH("x-explain-" + id + ".png") }); await page.keyboard.press("Escape"); await page.waitForTimeout(200); }
  console.log(`\n${pass} passed, ${fail} failed`); console.log("page logs:", logs.length ? "\n" + logs.join("\n") : "none");
  await t.close(); process.exitCode = fail || logs.length ? 1 : 0;
})().catch(e => { console.error("TEST CRASHED:", e.message.split("\n").slice(0, 5).join("\n")); process.exit(1); });
