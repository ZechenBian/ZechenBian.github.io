// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 大家一起打的引擎这一半（social.js）和 GitHub 这一层（hub.js）：每日一局是哪一局、动作写成一行字、交来的一局怎么核对、Issue 的读写
const path = require("path"), { QL, ok, near, section, done } = require("./harness.js");
require(path.join(__dirname, "../src/human.js"))(QL);
require(path.join(__dirname, "../src/social.js"))(QL);
const Hub = require(path.join(__dirname, "../src/hub.js"));

/** 用一种固定的打法把一局打完，返回 humanStep 的最后结果 */
function playOut(B, pol) {
  let st = QL.humanStep(B, []), g = 0;
  while (!st.done && g++ < 5000) { const a = st.acts.slice(); while (a.length < st.t) a.push(NaN); a[st.t] = pol(st.view, st.t); st = QL.humanStep(B, a); }
  return st;
}
const POL = { g_sec: (v, t) => (t >= 6 && v.rank === 1 ? 1 : 0), g_lock: v => (v.x >= 1.2 ? 1 : 0), g_bandit: (v, t) => t % v.pulls.length, g_coin: (v, t) => (t % 3 === 0 ? -0.1 : 1 / 3) };

section("一、日期");
ok(QL.dayOf(Date.UTC(2026, 9, 12, 23, 59, 59)) === "2026-10-12" && QL.dayOf(Date.UTC(2026, 9, 13, 0, 0, 0)) === "2026-10-13", "一天按 UTC 算，0 点换日");
ok(QL.dayNum("1970-01-01") === 0 && QL.dayNum("1970-01-02") === 1 && QL.dayNum("2026-10-12") === Math.round(Date.UTC(2026, 9, 12) / 864e5), "dayNum 是从 1970-01-01 起的天数");
ok([NaN].concat(["2026-13-01", "2026-02-30", "2026-1-1", "20261012", "", null, "2026-10-12T00:00"].map(QL.dayNum)).every(x => x !== x), "写法不对的、没有这一天的日期都是 NaN");
ok(QL.dayShift("2026-10-12", -1) === "2026-10-11" && QL.dayShift("2026-12-31", 1) === "2027-01-01" && QL.dayShift("2028-02-28", 1) === "2028-02-29", "dayShift 跨月、跨年、闰日都对");

section("二、每日一局是哪一局");
{
  const a = QL.dailySpec("2026-10-12"), b = QL.dailySpec("2026-10-12");
  ok(JSON.stringify(a) === JSON.stringify(b), "同一天给出的永远是同一局");
  const days = []; for (let i = 0; i < 28; i++) days.push(QL.dailySpec(QL.dayShift("2026-10-12", i)));
  ok([0, 1, 2, 3].every(i => days[i].type === days[i + 4].type) && new Set(days.slice(0, 4).map(d => d.type)).size === 4, "四套玩法按天轮换", days.slice(0, 4).map(d => d.type).join(","));
  ok(new Set(days.map(d => d.seed)).size >= 27 && days.every(d => Number.isInteger(d.seed) && d.seed >= 0 && d.seed < 1e6), "每天的种子不一样，是 0 到 999999 之间的整数");
  ok(days.every(d => d.k === 0 && d.T === QL.WORLDS[d.type].Tof(d.hp) && JSON.stringify(d.hp) === JSON.stringify(QL.humanSizes(d.type, QL.worldDefaults(d.type)).filter(z => z.id === "m")[0].hp)), "用的是这套玩法默认设定下\"中等长度\"的那一档");
  ok(QL.dailyGames().every(g => !!QL.humanDef(g)), "轮到的玩法都能亲手玩");
  let threw = false; try { QL.dailySpec("nope"); } catch (e) { threw = true; } ok(threw, "日期不对时报错，不悄悄给一局");
  const B1 = QL.humanEpisode(a.type, a.hp, a.seed, 0), B2 = QL.humanEpisode(a.type, a.hp, a.seed, 0);
  ok(Array.from(B1.R).join() === Array.from(B2.R).join() && Array.from(B1.L).join() === Array.from(B2.L).join(), "同一天生成的对局逐个数相同");
}

section("三、动作写成一行字");
{
  ok(QL.actsPack([1, 0, NaN, 0.25, -1]) === "1,0,,0.25,-1" && QL.actsPack([]) === "" && QL.actsPack([NaN, 1]) === ",1", "写法：逗号隔开，裁判没问的回合留空");
  const back = QL.actsUnpack("1,0,,0.25,-1", 10);
  ok(back.length === 5 && back[0] === 1 && back[2] !== back[2] && back[3] === 0.25 && back[4] === -1, "读回来是同样的数");
  ok(["1,a", "1;2", "1, 2", "0x10", "1e999", "Infinity", "NaN", "--1", "1.2.3"].every(s => QL.actsUnpack(s, 10) === null), "不是数的一概不认");
  ok(QL.actsUnpack("1,1,1", 2) === null && QL.actsUnpack("1,1", 2).length === 2, "比这一局的回合数还长的不认");
  ok(QL.actsUnpack(123, 5) === null && QL.actsUnpack(new Array(30000).join("1,"), 1e6) === null, "不是字符串、长得离谱的不认");
  let exact = true;
  for (const type of QL.dailyGames()) {
    const s = QL.dailySpec("2026-10-12"), z = QL.humanSizes(type, QL.worldDefaults(type)).filter(x => x.id === "m")[0];
    for (let k = 0; k < 5; k++) {
      const st = playOut(QL.humanEpisode(type, z.hp, s.seed, k), POL[type]), u = QL.actsUnpack(QL.actsPack(st.acts), st.T);
      if (!u || u.length !== st.acts.length || !u.every((v, i) => Object.is(v, st.acts[i]) || (v !== v && st.acts[i] !== st.acts[i]))) exact = false;
    }
  }
  ok(exact, "四套玩法各打 5 局：写出去再读回来，每一个动作都分毫不差（包括 1/3 这样的小数）");
}

section("四、核对交来的一局");
for (const type of QL.dailyGames()) {
  const day = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"].filter(d => QL.dailySpec(d).type === type)[0], spec = QL.dailySpec(day);
  const st = playOut(QL.humanEpisode(spec.type, spec.hp, spec.seed, 0), POL[type]), packed = QL.actsPack(st.acts);
  const rp = QL.humanReplay(spec, QL.actsUnpack(packed, spec.T));
  ok(rp.ok && rp.score === st.score && QL.actsPack(rp.acts) === packed, type + "：照着动作重放，得分和当时一样", String(st.score));
  const cut = st.acts.slice(0, Math.max(0, st.acts.length - 2)), rc = QL.humanReplay(spec, cut);
  // 截掉结尾的两步：要么没打完（不算数），要么剩下的回合本来就没得选、由裁判代答（那就还是同一局）
  ok(!rc.ok ? rc.why === "short" : QL.actsPack(rc.acts) === packed, type + "：截短的动作不会被当成另一局打完的成绩", JSON.stringify(rc.ok ? "auto" : rc.why));
  const other = QL.humanReplay(Object.assign({}, spec, { seed: spec.seed + 1 }), st.acts);
  ok(!other.ok || other.score !== st.score || type === "g_sec", type + "：换一个种子，同样的动作一般得不到同样的分");
  ok(QL.humanReplay(spec, "1,0").ok === false && QL.humanReplay(spec, null).ok === false, type + "：不是数组的不认");
  ok(QL.humanReplay({ type: "nope", hp: {}, seed: 1, k: 0 }, []).ok === false, type + "：玩法不对时不抛错，只说不算数");
}
{
  const r = QL.rankRows([{ score: 3, at: 5 }, { score: 5, at: 9 }, { score: 3, at: 2 }, { score: 1, at: 1 }], false);
  ok(r.rank.join() === "2,1,2,4" && r.order.join() === "1,2,0,3", "排名次：高分在前，并列同名次、先交的排前面", r.rank.join() + " / " + r.order.join());
  const l = QL.rankRows([{ score: 3, at: 5 }, { score: 5, at: 9 }, { score: 1, at: 1 }], true);
  ok(l.rank.join() === "2,3,1", "\"越低越好\"的得分反过来排", l.rank.join());
  ok(QL.rankRows([], false).rank.length === 0, "空榜不出错");
}

section("五、Issue 的正文：写和读");
{
  const meta = { kind: "rule", name: "门槛 `c`", n: 3 }, code = "function decide(s, p) {\r\n  return s.x >= p.c ? 1 : 0;   // ```不该打断```\r\n}\n\n";
  const body = Hub.pack(meta, code), u = Hub.unpack(body);
  ok(u && u.meta.sl === 1 && u.meta.name === meta.name && u.meta.n === 3 && u.code === "function decide(s, p) {\n  return s.x >= p.c ? 1 : 0;   // ```不该打断```\n}", "写出去再读回来：内容一样，换行统一成 \\n", JSON.stringify(u && u.code));
  ok(Hub.unpack(body.replace(/\n/g, "\r\n")).code === u.code && Hub.unpack("前面多写了几句\n\n" + body + "\n后面也多写了几句").meta.name === meta.name, "GitHub 把换行改成 \\r\\n、前后被人加了话，都读得出来");
  ok(body.indexOf("`c`") < 0 && body.indexOf("\\u0060c\\u0060") > 0, "内容里的反引号换了写法，不会把代码块提前结束");
  let threw = false; try { Hub.pack({ kind: "rule" }, "a ```` b"); } catch (e) { threw = true; } ok(threw, "代码里有连续四个反引号时拒绝打包");
  ok(Hub.unpack(Hub.pack({ kind: "daily", acts: "1,0" })).code === "", "不带代码的也行");
  const bad = ["", "没有代码块", "```json\n{oops}\n```", "```json\n[1,2]\n```", "```json\n{\"sl\":2,\"kind\":\"rule\"}\n```", "```json\n{\"sl\":1,\"kind\":\"evil\"}\n```", "```json\n{\"sl\":1}\n```", null, 42, "```json\nnull\n```"];
  ok(bad.every(b => Hub.unpack(b) === null), "不是这里生成的、被改坏的、类别不认识的，一律读不出来");
  ok(Hub.unpack(new Array(250000).join("x")) === null, "长得离谱的正文不解析");
  ok(Hub.title("daily", "2026-10-12  秘书问题\n39.8") === "[SL:daily] 2026-10-12 秘书问题 39.8" && Hub.title("rule", new Array(300).join("长")).length === 120, "标题：类别在最前面，去掉换行，限长");
  const short = Hub.newUrl("daily", "x", Hub.pack({ kind: "daily", acts: "1,0,1" })), url = new URL(short.url);
  ok(short.clip === "" && url.origin + url.pathname === "https://github.com/ZechenBian/ZechenBian.github.io/issues/new" && url.searchParams.get("title") === "[SL:daily] x" && Hub.unpack(url.searchParams.get("body")).meta.acts === "1,0,1", "内容不长：整个放进新建 Issue 的地址里");
  const long = Hub.newUrl("rule", "y", Hub.pack({ kind: "rule" }, new Array(900).join("// 很长的中文注释\n")));
  ok(long.clip.length > 3000 && long.url.length < 1500 && Hub.unpack(long.clip).meta.kind === "rule" && Hub.unpack(new URL(long.url).searchParams.get("body")) === null, "内容太长：地址里只放一句提示，正文交给剪贴板");
}

section("六、从 GitHub 取回来的东西");
(async () => {
  const mk = (n, kind, meta, extra) => Object.assign({ number: n, title: Hub.title(kind, "t" + n), body: Hub.pack(Object.assign({ kind }, meta || {})), user: { login: "u" + n, avatar_url: "https://avatars.githubusercontent.com/u/" + n + "?v=4" }, html_url: "https://evil.example/" + n, created_at: "2026-10-12T0" + (n % 10) + ":00:00Z", reactions: { "+1": n, "-1": 1 }, comments: 2 }, extra || {});
  const x = Hub.norm(mk(7, "rule", { name: "a" }));
  ok(x && x.n === 7 && x.kind === "rule" && x.user === "u7" && x.up === 7 && x.down === 1 && x.url === "https://github.com/ZechenBian/ZechenBian.github.io/issues/7" && x.at === Date.parse("2026-10-12T07:00:00Z"), "一条 Issue 整理成这里用的样子；链接按编号自己拼，不用对方给的", JSON.stringify(x && x.url));
  ok(Hub.norm(mk(1, "rule", {}, { pull_request: {} })) === null && Hub.norm(mk(1, "rule", {}, { title: "随便问问" })) === null && Hub.norm(mk(1, "rule", {}, { title: "[SL:daily] x" })) === null && Hub.norm(mk(1, "rule", {}, { body: "空的" })) === null && Hub.norm(null) === null, "拉取请求、不相干的 Issue、标题和内容对不上的，都不算");
  ok(Hub.norm(mk(1, "rule", {}, { user: { login: "a", avatar_url: "https://evil.example/a.png" } })).avatar === "" && Hub.norm(mk(1, "rule", {}, { user: null })).user === "", "头像只认 GitHub 自己的地址；没有作者时不出错");

  let calls = [], pages = {}, mode = "ok";
  const res = (status, json, headers) => ({ status, ok: status >= 200 && status < 300, headers: { get: k => (headers || {})[k] || null }, json: async () => json });
  Hub.use(async url => {
    calls.push(url);
    if (mode === "down") throw new Error("net");
    if (mode === "limited") return res(403, { message: "rate limit" }, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "123" });
    if (mode === "404") return res(404, {});
    return res(200, pages[new URL(url).searchParams.get("page")] || []);
  });
  const p1 = []; for (let i = 1; i <= 100; i++) p1.push(i % 10 === 0 ? { number: 1000 + i, title: "别的", body: "", user: { login: "z" } } : mk(i, i % 2 ? "rule" : "world", {}));
  pages = { 1: p1, 2: [mk(201, "rule", {}), mk(202, "daily", { day: "2026-10-12" })] };
  const all = await Hub.list({});
  ok(calls.length === 2 && /page=1/.test(calls[0]) && /page=2/.test(calls[1]) && /state=open/.test(calls[0]) && /per_page=100/.test(calls[0]) && !/since=/.test(calls[0]), "一页满 100 条就接着取下一页；只要开着的 Issue", calls.join(" | ").slice(0, 200));
  ok(all.items.length === 92 && !all.stale && all.error === null, "不相干的 Issue 被筛掉", all.items.length);
  const rules = await Hub.list({ kind: "rule" });
  ok(calls.length === 2 && rules.items.length === 51 && rules.items.every(r => r.kind === "rule"), "三分钟之内再要，不再去取；按类别筛", calls.length + " / " + rules.items.length);
  await Hub.list({ kind: "rule", fresh: true });
  ok(calls.length === 4, "指明要新的，才再去取");
  const since = await Hub.list({ kind: "daily", since: "2026-10-12T00:00:00Z" });
  ok(calls.length === 6 && /since=2026-10-12T00%3A00%3A00Z/.test(calls[4]) && since.items.length === 1, "带上 since：只要这之后动过的；和不带 since 的分开缓存", calls[4]);
  mode = "limited";
  const st = await Hub.list({ kind: "rule", fresh: true });
  ok(st.stale && st.error.limited && st.items.length === 51, "被限流时给上一次取到的，并说明是旧的");
  let err = null; try { await Hub.list({ since: "2026-10-13T00:00:00Z" }); } catch (e) { err = e; }
  ok(err && err.limited === true && err.reset === 123, "手里没有旧的：把\"被限流\"照实报出来", JSON.stringify(err));
  mode = "down"; err = null; try { await Hub.list({ since: "2026-10-14T00:00:00Z" }); } catch (e) { err = e; }
  ok(err && err.offline === true, "断网：报\"连不上\"");
  mode = "404"; err = null; try { await Hub.list({ since: "2026-10-15T00:00:00Z" }); } catch (e) { err = e; }
  ok(err && err.status === 404 && !err.limited, "别的错误带着状态码报出来");
  mode = "ok"; pages = { 1: p1, 2: p1, 3: p1, 4: p1 }; calls = []; Hub.use(Hub.use.f = async url => { calls.push(url); return res(200, pages[new URL(url).searchParams.get("page")] || []); });
  const many = await Hub.list({});
  ok(calls.length === 3 && many.items.length === 270, "最多取 3 页，不会没完没了地翻", calls.length + " / " + many.items.length);
  Hub.use(null);
  done();
})();
