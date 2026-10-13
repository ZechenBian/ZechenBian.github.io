#!/usr/bin/env node
// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 每日一题的结算程序。只用 Node 自带的模块。
 * 平时在仓库的 GitHub Actions 里每天跑（.github/workflows/strategy-lab-quest.yml）；仓库主人也可以在自己的机器上跑（见 README.md）。
 *
 * 交上来的规则是加密的（src/quest.js 的 questSeal），别人看不到。这个程序拿着私钥，是唯一解得开的地方：
 *   1. 定下结算哪一天（不指定就是最近几天里还没结算的），读出那一天的题。没有题的日子是重温的旧题，挑法和页面一样。
 *   2. 取 drand 那一轮的随机数，定出结算的几组数据。
 *   3. 从 GitHub 取回那一天交的规则。同一个账号只算截止前最后交的那一条；截止之后改过正文的作废。
 *   4. 用私钥把每一份解开，核对里面的东西。把别人封好的那一份原样再交一遍的不算（同一份密文出现在两个账号名下，后来的那个不排名）。
 *   5. 每条规则单独开一个容器（没有网络、文件只读、没有私钥和令牌），和基准规则一起在结算的几组、公开的几组上各打一遍。
 *   6. 把结果贴成一条 Issue：每个人的成绩和起的名字。代码、参数不公布，也不进日志。
 *
 *   node daily/settle.js                    结算最近几天里还没结算的
 *   node daily/settle.js --day=2026-10-14   只结算这一天
 *   --dry-run     照常解开、跑一遍，但不公布（第一次用的时候先这样试）
 *   --force       已经公布过也重新结算（会再贴一条，页面认最新的那一条）
 *   --sandbox=process   不开容器，直接开子进程（只给测试用：没有隔离，所以不许公布）
 * 环境变量：QUEST_PRIVATE_KEY（私钥，PEM）、GITHUB_TOKEN（发 Issue 用）、GITHUB_REPOSITORY（不给就是页面里写的那个仓库）。
 * 日志是公开的：这里只印日期、题目的代号、Issue 的编号和账号、每一步成没成，不印任何解开之后的内容。 */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto"), zlib = require("zlib"), cp = require("child_process");
const { QL, QLJobs, ROOT } = require("./engine.js");
const QLHub = require(path.join(ROOT, "src", "hub.js"));
const Q = QL.QUEST, DAILY = __dirname;
const RELAYS = ["https://api.drand.sh", "https://api2.drand.sh", "https://api3.drand.sh", "https://drand.cloudflare.com"];
const BOT = Q.seal.settlers[0];
const NOTE = "这条 Issue 是策略实验室“每日一题”的结算结果，由本仓库的 GitHub Actions 自动发布（https://zechenbian.github.io/strategy-lab/）。里面是每个人的成绩和规则的名字，没有代码。请不要改动下面的内容。";
// entries：一天最多结算多少条（按交的先后，多出来的不算）；每条最多 entryMs，所以整个任务最长大约 entries × entryMs（工作流的时限要比它长）
const LIMITS = { entries: 100, publish: 100, entryMs: 90000, refsMs: 240000, out: 4e6, plain: 400000, catchUp: 3, margin: 90000 };
const P256_SPKI = Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex");   // P-256 公钥的 DER 开头，后面跟 65 字节的点
const KEYRE = /^[A-Za-z_][A-Za-z0-9_]{0,23}$/;

/* ---------- 解开封好的一份 ---------- */
/** key: 私钥（Node 的 KeyObject）；box: 封好的一份；info: QL.questSealInfo 给的那串字。解不开、样子不对时抛错 */
function unseal(key, box, info) {
  const raw = QL.questBoxOk(box) ? QL.questB64.dec(box) : null;
  if (!raw || raw.length < Q.seal.head + 17 || raw[0] !== Q.seal.ver || (raw[1] & ~1)) throw new Error("bad box");
  const buf = Buffer.from(raw.buffer, raw.byteOffset, raw.length), eph = buf.subarray(2, 67), iv = buf.subarray(67, 79), body = buf.subarray(79, buf.length - 16), tag = buf.subarray(buf.length - 16);
  const pubRaw = Buffer.from(crypto.createPublicKey(key).export({ type: "spki", format: "der" })).subarray(-65);
  const shared = crypto.diffieHellman({ privateKey: key, publicKey: crypto.createPublicKey({ key: Buffer.concat([P256_SPKI, eph]), format: "der", type: "spki" }) });
  const aes = Buffer.from(crypto.hkdfSync("sha256", shared, Buffer.concat([eph, pubRaw]), Buffer.from(info, "utf8"), 32));
  const d = crypto.createDecipheriv("aes-256-gcm", aes, iv); d.setAAD(Buffer.from(info, "utf8")); d.setAuthTag(tag);
  let plain = Buffer.concat([d.update(body), d.final()]);
  if (raw[1] & 1) plain = zlib.inflateRawSync(plain, { maxOutputLength: LIMITS.plain });
  if (plain.length > LIMITS.plain) throw new Error("too long");
  return JSON.parse(plain.toString("utf8"));
}
/** 解开之后的东西像不像一条规则。返回 { name, p, code }；不像样时返回一句原因（不含里面的内容） */
function payloadOf(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return "not an object";
  if (typeof o.code !== "string" || !o.code.trim() || o.code.length > Q.maxCode) return "no code, or code too long";
  if (!/\bfunction\s+decide\s*\(/.test(o.code)) return "no decide function";
  if (QLJobs.syntax(o.code)) return "syntax error";
  // 规则用不着 import()；它失败时抛出来的东西来自沙盒外面那一层，不给这个机会。import 是保留字，中间还可以夹注释，
  // 所以只要代码里出现这个词（哪怕在注释里）就不收：宁可错杀，页面在交之前就会提醒
  if (/\bimport\b/.test(o.code)) return "uses import";
  const p = {}; let bad = false;
  if (o.p != null) { if (typeof o.p !== "object" || Array.isArray(o.p) || Object.keys(o.p).length > 12) return "bad parameters"; Object.keys(o.p).forEach(k => { if (!KEYRE.test(k) || typeof o.p[k] !== "number" || !Number.isFinite(o.p[k])) bad = true; else p[k] = o.p[k]; }); }
  if (bad) return "bad parameters";
  const name = typeof o.name === "string" ? o.name.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 40) : "";
  return { name, p, code: o.code };
}
const sha = s => crypto.createHash("sha256").update(s, "utf8").digest("hex");

/* ---------- 沙盒 ---------- */
/** 在沙盒里跑一件事。mode: "docker"（真的隔离）或 "process"（子进程，没有隔离，测试用）。返回 { ok, result | selftest | error, timedOut } */
function runBox(input, o) {
  return new Promise(resolve => {
    const name = "sl-quest-" + crypto.randomBytes(6).toString("hex"), docker = o.mode === "docker";
    const args = docker ? ["run", "--rm", "-i", "--name", name, "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", "65534:65534",
      "--pids-limit", "128", "--memory", "1g", "--memory-swap", "1g", "--cpus", "1", "--workdir", "/", "-v", ROOT + ":/sl:ro", o.image, "node", "--max-old-space-size=768", "/sl/daily/box.js"] : [path.join(DAILY, "box.js")];
    // 子进程的环境里什么都不带：私钥和令牌只在这个进程自己手里
    const child = cp.spawn(docker ? "docker" : process.execPath, args, { env: { PATH: process.env.PATH || "", HOME: process.env.HOME || "", DOCKER_HOST: process.env.DOCKER_HOST || "" }, stdio: ["pipe", "pipe", "ignore"] });
    let out = "", done = false, timedOut = false;
    const finish = v => { if (done) return; done = true; clearTimeout(timer); resolve(Object.assign({ timedOut }, v)); };
    const timer = setTimeout(() => { timedOut = true; try { if (docker) cp.spawn("docker", ["kill", name], { stdio: "ignore" }); } catch (e) {} try { child.kill("SIGKILL"); } catch (e) {} }, o.timeout);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", d => { if (out.length <= LIMITS.out) out += d; });
    child.on("error", () => finish({ ok: false, error: "sandbox did not start" }));
    child.on("close", () => {
      if (timedOut) return finish({ ok: false, error: "timeout" });
      if (out.length > LIMITS.out) return finish({ ok: false, error: "output too large" });
      let r = null; try { r = JSON.parse(out, (k, v) => (v === "\u0000nan" ? NaN : v === "\u0000+inf" ? Infinity : v === "\u0000-inf" ? -Infinity : v)); } catch (e) {}
      finish(r && typeof r === "object" && typeof r.ok === "boolean" ? r : { ok: false, error: "no result" });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(input));
  });
}
/** 开工之前先查一遍沙盒是不是真的关得住：不是 root、带不进环境变量、写不了文件、连不上网。有一样不对就不干了 */
async function sandboxOk(o) {
  const r = await runBox({ selftest: true }, Object.assign({}, o, { timeout: 60000 })), s = r && r.ok && r.selftest;
  if (!s) return "self-test did not run (" + (r && r.error || "?") + ")";
  const bad = [];
  if (!(s.uid > 0)) bad.push("runs as root");
  if (s.env && s.env.length) bad.push("environment leaks: " + s.env.join(","));
  if (s.write && s.write.length) bad.push("can write to " + s.write.join(","));
  if (s.dns !== "blocked") bad.push("DNS works");
  if (s.tcp !== "blocked") bad.push("network works");
  return bad.join("; ");
}

/* ---------- GitHub 和 drand ---------- */
function api(o, url, init) {
  const headers = Object.assign({ Accept: "application/vnd.github+json", "User-Agent": "strategy-lab-quest", "X-GitHub-Api-Version": "2022-11-28" }, o.token ? { Authorization: "Bearer " + o.token } : {}, (init && init.headers) || {});
  return o.fetch(url, Object.assign({}, init, { headers })).then(async r => { if (!r.ok) throw new Error("GitHub " + r.status + " for " + url.replace(/\?.*$/, "")); return r.json(); });
}
/** 从 since 起动过的 Issue，从旧到新，收拾成 hub.js 的样子。返回 { open: 还开着的, all: 连关掉的在内 }。
 *  参赛的规则和结算的结果只认开着的（关掉就是撤下）；认"照搬"的时候连关掉的也看（见 settleDay） */
async function listIssues(o, since) {
  const open = [], all = [];
  for (let k = 1; k <= 30; k++) {
    const arr = await api(o, "https://api.github.com/repos/" + o.repo + "/issues?state=all&per_page=100&sort=created&direction=asc&page=" + k + "&since=" + encodeURIComponent(since));
    if (!Array.isArray(arr)) throw new Error("GitHub: unexpected answer");
    arr.forEach(it => { const x = QLHub.norm(it); if (!x) return; all.push(x); if (!it.state || it.state === "open") open.push(x); });
    if (arr.length < 100) break;
  }
  return { open, all };
}
/** 这些 Issue 的正文最后一次是什么时候改的（毫秒；没改过是 0）。REST 接口不给这个，得问 GraphQL */
async function lastEdits(o, numbers) {
  const out = {}, [owner, name] = o.repo.split("/");
  for (let i = 0; i < numbers.length; i += 50) {
    const part = numbers.slice(i, i + 50), q = "query($owner:String!,$name:String!){repository(owner:$owner,name:$name){" + part.map(n => "i" + n + ":issue(number:" + n + "){lastEditedAt}").join(" ") + "}}";
    const r = await api(o, "https://api.github.com/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, variables: { owner, name } }) });
    if (!r || !r.data || !r.data.repository) throw new Error("GitHub GraphQL: " + (r && r.errors && r.errors[0] && r.errors[0].message || "unexpected answer"));
    // 问不到的那一条（刚好被删掉了之类）当成"改过"：只作废它自己，不耽误这一天其余的人
    part.forEach(n => { const x = r.data.repository["i" + n]; out[n] = !x ? Infinity : x.lastEditedAt ? Date.parse(x.lastEditedAt) || Infinity : 0; });
  }
  return out;
}
/** drand 那一轮的随机数。几个地址挨个问：给出来的要自洽（随机数是签名的 SHA-256），而且问到的几个要一样 */
async function beacon(o, round) {
  let got = null, n = 0;
  for (const base of RELAYS) {
    try {
      const r = await o.fetch(base + "/" + Q.beacon.chain + "/public/" + round), x = r.ok ? await r.json() : null;
      if (!x || x.round !== round || !/^[0-9a-f]{64}$/i.test(x.randomness) || !/^([0-9a-f]{2})+$/i.test(x.signature)) continue;
      const rnd = String(x.randomness).toLowerCase();
      if (crypto.createHash("sha256").update(Buffer.from(x.signature, "hex")).digest("hex") !== rnd) continue;
      if (got && got !== rnd) throw new Error("drand relays disagree");
      got = rnd; n++;
      if (n >= 2) break;
    } catch (e) { if (/disagree/.test(String(e && e.message))) throw e; }
  }
  if (!got) throw new Error("drand: round " + round + " is not available from any relay");
  return { round, randomness: got };
}

/* ---------- 结算一天 ---------- */
function loadSpec(day) {
  let days = []; try { const idx = JSON.parse(fs.readFileSync(path.join(DAILY, "index.json"), "utf8")); if (idx && idx.v === 1 && Array.isArray(idx.days)) days = idx.days; } catch (e) {}
  const pick = QL.questPick(days, day);
  if (!pick.src) return null;
  const raw = JSON.parse(fs.readFileSync(path.join(DAILY, "q", pick.src + ".json"), "utf8"));
  if (!raw || raw.day !== pick.src) throw new Error("challenge file " + pick.src + " is malformed");
  const spec = QL.questOk(pick.src === day ? raw : Object.assign({}, raw, { day }));
  if (!spec) throw new Error("challenge file " + pick.src + " does not pass the format check");
  return { spec, rerun: pick.rerun };
}
const partOf = x => (x ? { mean: x.mean, se: x.se, d: x.d, dse: x.dse } : null);
/** 结算一天。o: { day, key, fetch, repo, token, mode, image, now, dryRun, force, log }
 *  返回 { day, status, ... }：status 是 "none"（这一天没有题）、"early"（还没到时候）、"done"（已经结算过）、"dry"（演练）、"posted"（公布了） */
async function settleDay(o) {
  const day = o.day, log = o.log || (() => {}), L = loadSpec(day);
  if (!L) return { day, status: "none" };
  const spec = L.spec, dead = QL.questDeadline(day), round = QL.questRound(day), trusted = [BOT, o.repo.split("/")[0]];
  if (o.now() < Math.max(dead, QL.beaconTime(round)) + LIMITS.margin) return { day, status: "early" };
  log(day + ": challenge " + spec.id + (L.rerun ? " (rerun of " + L.rerun + ")" : ""));
  const listed = await listIssues(o, day + "T00:00:00Z"), items = listed.open;
  const old = QL.questResult(items, spec, trusted);
  if (old && !o.force) { log(day + ": already settled in #" + old.issue); return { day, status: "done", issue: old.issue }; }
  const b = await beacon(o, round), fin = QL.questFinSeeds(spec, b.randomness), pub = QL.questPubSeeds(spec), seeds = fin.concat(pub), cut = fin.length;
  let ents = QL.questEntries(items, spec), more = 0;
  if (ents.length > LIMITS.entries) { more = ents.length - LIMITS.entries; ents = ents.slice(0, LIMITS.entries); }
  // 截止之后改过正文的作废。只有"动过"的才需要去问（评论也算动过，所以要问清楚是不是改了正文）
  const touched = ents.filter(e => e.touched).map(e => e.n), edits = touched.length ? await lastEdits(o, touched) : {};
  const skipped = { edited: 0, sealed: 0, more }, rows = [];
  // 把别人封好的那一份原样再交一遍，不用知道里面是什么也能蹭到一样的成绩。封好的一份每次都不一样（密钥和随机数都是现生成的），
  // 所以同一份出现在两个账号名下，后来的那个只可能是照搬的：不排名，也不去解它。别人中途交过又换掉的、交了又撤下的那些份也算在内
  const first = {};
  listed.all.forEach(it => { const m = it.meta; if (it.kind !== "quest" || !m || m.day !== day || m.cid !== spec.cid || m.v !== 2 || !QL.questBoxOk(m.box) || !it.user) return; const f = first[m.box]; if (!f || it.at < f.at || (it.at === f.at && it.n < f.n)) first[m.box] = { n: it.n, user: it.user, at: it.at }; });
  const info = QL.questSealInfo(day, spec.cid), base = spec.refs[0], box = { mode: o.mode, image: o.image };
  log(day + ": " + ents.length + " sealed entr" + (ents.length === 1 ? "y" : "ies") + (more ? " (+" + more + " over the limit)" : ""));
  for (const e of ents) {
    if (edits[e.n] > dead) { skipped.edited++; log("  #" + e.n + " @" + e.user + ": edited after the deadline, void"); continue; }
    const src = first[e.box];
    if (src && src.user !== e.user) { rows.push({ n: e.n, user: e.user, uid: e.uid, at: e.at, name: "", ch: sha(e.box).slice(0, 16), fin: null, pub: null, err: "", dup: src.n, dupUser: src.user, tries: e.tries }); log("  #" + e.n + " @" + e.user + ": a copy of the sealed entry in #" + src.n + ", not ranked"); continue; }
    let pl; try { pl = payloadOf(unseal(o.key, e.box, info)); } catch (x) { pl = "cannot be opened"; }
    if (typeof pl === "string") { skipped.sealed++; log("  #" + e.n + " @" + e.user + ": " + pl + ", void"); continue; }
    const row = { n: e.n, user: e.user, uid: e.uid, at: e.at, name: pl.name, ch: sha(e.box).slice(0, 16), fin: null, pub: null, err: "", dup: 0, dupUser: "", tries: e.tries };
    const r = await runBox({ codes: [{ id: "game", code: spec.canon }, { id: "ref:" + base.id, code: base.canon }, { id: "you", code: pl.code }],
      msg: { kind: "quest", game: "game", gp: spec.p, T: spec.T, K: spec.sets.K, seeds, cut, trace: false, entries: [{ id: "ref:" + base.id, p: base.p, slot: 0 }, { id: "you", p: pl.p, slot: Q.slot }] } }, Object.assign({ timeout: o.entryMs || LIMITS.entryMs }, box));
    const me = r.ok && r.result && Array.isArray(r.result.rows) ? r.result.rows.filter(x => x && x.id === "you")[0] : null;
    if (r.timedOut) row.err = "timeout";
    else if (!r.ok) row.err = "failed";
    else if (!me) row.err = "did not take part";
    else if (me.err) row.err = "error";
    else if (!me.parts || !Number.isFinite(me.parts[0].mean)) row.err = "no score";
    else { row.fin = partOf(me.parts[0]); row.pub = partOf(me.parts[1]); }
    rows.push(row);
    log("  #" + e.n + " @" + e.user + ": " + (row.err || "scored"));
  }
  // 基准规则也在同样的沙盒里跑一遍：页面会拿它们和自己算的对一对，对得上说明结算用的数据和程序没有走样
  const rr = await runBox({ codes: [{ id: "game", code: spec.canon }].concat(spec.refs.map(r => ({ id: "ref:" + r.id, code: r.canon }))),
    msg: { kind: "quest", game: "game", gp: spec.p, T: spec.T, K: spec.sets.K, seeds, cut, trace: false, entries: spec.refs.map((r, i) => ({ id: "ref:" + r.id, p: r.p, slot: i })) } }, Object.assign({ timeout: o.refsMs || LIMITS.refsMs }, box));
  if (!rr.ok || !rr.result || !Array.isArray(rr.result.rows) || rr.result.rows.some(x => x.err || !x.parts)) throw new Error("the reference rules did not run (" + (rr.error || "error in a reference rule") + ")");
  const refs = rr.result.rows.map(x => ({ id: String(x.id).replace(/^ref:/, ""), fin: partOf(x.parts[0]), pub: partOf(x.parts[1]) }));
  // 太多的话只公布排在前面的（一条 Issue 的正文有长度上限）
  const rk = QL.questRank(rows.map(r => ({ score: r.fin ? r.fin.mean : NaN, at: r.at, n: r.n, err: r.err || (r.dup ? "dup" : "") })), spec.higher);
  let order = rows.map((r, i) => i).sort((a, c) => (rk[a] || 1e9) - (rk[c] || 1e9) || rows[a].at - rows[c].at);
  if (order.length > LIMITS.publish) { skipped.more += order.length - LIMITS.publish; order = order.slice(0, LIMITS.publish); }
  const title = QLHub.title("result", day + " " + QL.questText(spec.title, "zh") + " · 结算");
  let meta, body;
  for (;;) {   // 正文放不下就少公布几行，直到放得下
    meta = { kind: "result", v: 1, day, cid: spec.cid, id: spec.id, round: b.round, randomness: b.randomness, at: o.now(), sets: { fin: spec.sets.fin, pub: spec.sets.pub, K: spec.sets.K }, refs, rows: order.map(i => rows[i]), skipped };
    body = QLHub.pack(meta, "", NOTE);
    if (body.length <= 60000 || order.length <= 5) break;
    const keep = Math.max(5, Math.floor(order.length * 0.9)); skipped.more += order.length - keep; order = order.slice(0, keep);
  }
  if (body.length > 64000) throw new Error("the result is too long for one issue");
  const ranked = rk.filter(Boolean).length;
  log(day + ": " + ranked + " ranked, " + (rows.length - ranked) + " without a score, void: " + skipped.edited + " edited, " + skipped.sealed + " unreadable");
  if (o.dryRun) return { day, status: "dry", meta, title, body };
  if (o.mode !== "docker" && !o.allowUnsandboxed) throw new Error("refusing to publish a result computed without the sandbox");
  const made = await api(o, "https://api.github.com/repos/" + o.repo + "/issues", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body }) });
  log(day + ": published as #" + made.number);
  return { day, status: "posted", issue: made.number, meta, title, body };
}

/* ---------- 命令行 ---------- */
async function main() {
  const args = process.argv.slice(2), flag = n => args.includes("--" + n) || /^(1|true)$/i.test(process.env["QUEST_" + n.replace(/-/g, "_").toUpperCase()] || "");
  const opt = n => { const a = args.filter(x => x.startsWith("--" + n + "="))[0]; return a ? a.slice(n.length + 3) : ""; };
  const log = s => console.log(s), now = () => Date.now();
  const pem = process.env.QUEST_PRIVATE_KEY || "";
  delete process.env.QUEST_PRIVATE_KEY;   // 读进来就从环境里拿掉：之后开的子进程本来也不带环境，这是多一道
  if (!pem.trim()) { log("QUEST_PRIVATE_KEY is not set: nothing can be opened, so nothing is settled. See strategy-lab/daily/README.md."); return 0; }
  log("node " + process.version + "; sandbox: " + (opt("sandbox") || "docker") + (flag("dry-run") ? "; dry run (nothing will be published)" : ""));
  let key; try { key = crypto.createPrivateKey(pem); if (key.asymmetricKeyType !== "ec" || (key.asymmetricKeyDetails || {}).namedCurve !== "prime256v1") throw new Error("not a P-256 key"); } catch (e) { log("QUEST_PRIVATE_KEY cannot be used: " + String(e && e.message || e).slice(0, 80)); return 1; }
  // 仓库里放着的公钥要和这把私钥是一对：不是的话，现在交上来的东西这把私钥解不开
  try {
    const der = QL.questPem(fs.readFileSync(path.join(DAILY, "quest-public.pem"), "utf8"));
    if (!der || Buffer.compare(Buffer.from(der), Buffer.from(crypto.createPublicKey(key).export({ type: "spki", format: "der" })))) log("WARNING: daily/quest-public.pem does not match QUEST_PRIVATE_KEY. Entries sealed with the published key cannot be opened.");
    else log("QUEST_PRIVATE_KEY matches daily/quest-public.pem");
  } catch (e) { log("WARNING: daily/quest-public.pem is missing, so the page cannot seal entries yet."); }
  const o = { key, fetch: (u, i) => fetch(u, i), repo: process.env.GITHUB_REPOSITORY || QLHub.REPO, token: process.env.GITHUB_TOKEN || "", mode: opt("sandbox") || "docker", image: process.env.QUEST_IMAGE || "node:22-alpine",
    now, dryRun: flag("dry-run"), force: flag("force"), log, allowUnsandboxed: false };
  if (o.mode !== "docker" && !o.dryRun) { log("--sandbox=" + o.mode + " has no isolation: only allowed together with --dry-run."); return 1; }
  if (o.mode === "docker") { const bad = await sandboxOk(o); if (bad) { log("The sandbox is not safe to use (" + bad + "). Nothing was run."); return 1; } log("sandbox self-test passed"); }
  const one = opt("day") || process.env.QUEST_DAY || "", today = new Date(now()).toISOString().slice(0, 10), days = [];
  if (one) { if (!(QL.questOpen(one) === QL.questOpen(one))) { log("--day must look like 2026-10-14"); return 1; } days.push(one); }
  else for (let k = LIMITS.catchUp; k >= 1; k--) days.push(new Date(QL.questOpen(today) - k * 864e5).toISOString().slice(0, 10));
  let failed = 0;
  for (const day of days) {
    try { const r = await settleDay(Object.assign({ day }, o)); if (r.status === "none") log(day + ": no challenge"); else if (r.status === "early") log(day + ": not closed yet"); }
    catch (e) { failed++; log(day + ": FAILED: " + String(e && e.message || e).slice(0, 200)); }
  }
  return failed ? 1 : 0;
}
if (require.main === module) main().then(code => { process.exitCode = code; }, e => { console.log("FAILED: " + String(e && e.message || e).slice(0, 200)); process.exitCode = 1; });
module.exports = { unseal, payloadOf, runBox, sandboxOk, listIssues, lastEdits, beacon, settleDay, loadSpec, LIMITS, NOTE, BOT };
