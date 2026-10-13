// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 沙盒里跑的那一小段。结算的程序（settle.js）每跑一条别人交的规则，就开一个容器执行这个文件：
 *   从标准输入读一件任务（JSON：几段代码和任务的参数），放进引擎里跑（engine.js），把结果（JSON）写到标准输出。
 * 容器里没有网络，文件只读，没有私钥、没有令牌，也没有别人交的规则：这里读得到的只有引擎（本来就是公开的）和这一件任务。
 * 输入里带 selftest 时不跑任务，而是查一遍自己是不是真的被关住了（settle.js 每次开工之前先查）。 */
"use strict";
function selftest() {
  const fs = require("fs"), dns = require("dns"), net = require("net");
  const rep = { uid: typeof process.getuid === "function" ? process.getuid() : -1, env: Object.keys(process.env).filter(k => /QUEST|GITHUB|ACTIONS|RUNNER|TOKEN|SECRET|PRIVATE|PASSWORD/i.test(k)), write: [], dns: "", tcp: "" };
  for (const dir of ["/tmp", "/sl", "/sl/daily", "/", process.cwd()]) { try { const f = dir.replace(/\/$/, "") + "/.box-write-test"; fs.writeFileSync(f, "x"); rep.write.push(dir); try { fs.unlinkSync(f); } catch (e) {} } catch (e) {} }
  return new Promise(res => {
    let left = 2; const done = () => { if (--left === 0) res(rep); };
    dns.lookup("api.github.com", err => { rep.dns = err ? "blocked" : "open"; done(); });
    const s = net.connect({ host: "1.1.1.1", port: 443 }); let over = false;
    const end = v => { if (over) return; over = true; rep.tcp = v; try { s.destroy(); } catch (e) {} done(); };
    s.on("connect", () => end("open")); s.on("error", () => end("blocked")); setTimeout(() => end("blocked"), 3000);
  });
}
/** 一次写完就退出，中间不让出执行权：任务是同步算完的，算完之后规则里留下的任何"晚一点再执行"的东西（比如 import() 失败以后的回调）都没有机会运行 */
function finish(o) {
  const fs = require("fs"), data = Buffer.from(JSON.stringify(o, (k, v) => (typeof v !== "number" || Number.isFinite(v) ? v : v !== v ? "\u0000nan" : v > 0 ? "\u0000+inf" : "\u0000-inf")), "utf8");
  // 管道一时写不进去（EAGAIN）就接着试，最多等十秒；写不完的话外面读到的是半截，会当成"没有结果"
  let off = 0; const until = Date.now() + 10000;
  while (off < data.length && Date.now() < until) { try { off += fs.writeSync(1, data, off, data.length - off); } catch (e) { if (e.code !== "EAGAIN") break; } }
  process.exit(0);
}
let buf = "", big = false;
process.stdin.setEncoding("utf8");
process.stdin.on("data", d => { if (big) return; buf += d; if (buf.length > 4e6) { big = true; buf = ""; } });
process.stdin.on("end", () => {
  let inp;
  try { if (big) throw new Error("input too large"); inp = JSON.parse(buf); } catch (e) { finish({ ok: false, error: String(e && e.message || e).slice(0, 200) }); return; }
  if (inp && inp.selftest) { selftest().then(rep => finish({ ok: true, selftest: rep })); return; }
  let out;
  try { out = { ok: true, result: require("./engine.js").job(inp.codes, inp.msg) }; }
  catch (e) { out = { ok: false, error: String(e && e.message || e).slice(0, 300) }; }
  finish(out);
});
