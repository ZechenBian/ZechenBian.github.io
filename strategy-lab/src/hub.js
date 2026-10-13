// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 策略实验室 · 大家的东西放在哪里（GitHub 当后台，没有自己的服务器）
 * 别人交上来的每一份东西（一局的成绩、一条规则、一个世界……）是仓库里的一条 Issue：
 *   谁交的 = Issue 的作者（GitHub 账号）；打分 = Issue 上的 👍；撤下 = 仓库的主人把这条 Issue 关掉。
 * 读：GitHub 的公开接口，不用登录。每个 IP 每小时只有 60 次，所以一次把最近的 Issue 都取回来，各处共用，三分钟内不重取。
 * 交：页面不替人发帖（那需要登录和令牌，令牌不该交给一张网页）。它把内容填进"新建 Issue"的地址，人自己点一下提交。
 * 一条 Issue 是哪一类，看标题开头的 [SL:类别]；内容在正文的 json 代码块里（要带代码的，再跟一个 js 代码块）。
 * 正文是别人写的：这里只把它当数据解析，从不执行，也不当成 HTML 往页面里放。
 * 这个文件不碰界面；Node 里也能跑（测试时用 QLHub.use 换一个假的 fetch）。 */
var QLHub = (function () {
  "use strict";
  var REPO = "ZechenBian/ZechenBian.github.io", API = "https://api.github.com/repos/" + REPO, WEB = "https://github.com/" + REPO;
  var KINDS = { daily: 1, rule: 1, world: 1, game: 1, deca: 1, quest: 1 };
  var TTL = 180000, MAX_URL = 6000, MAX_PAGES = 3, SKEY = "ql.hub.v1";
  var NOTE = "这条 Issue 由策略实验室生成（https://zechenbian.github.io/strategy-lab/）。提交即表示你同意：下面的内容在策略实验室里公开展示，别人可以载入、运行和修改。请不要改动下面的代码块。";
  var PASTE = "（内容太长，放不进地址里。请回到策略实验室点\"复制内容\"，然后把这里整段换成复制的内容。）";
  var mem = {}, doFetch = null;

  function tag(kind) { return "[SL:" + kind + "]"; }
  function title(kind, text) { return (tag(kind) + " " + String(text == null ? "" : text).replace(/\s+/g, " ").trim()).slice(0, 120); }
  /** 把一份东西写成 Issue 的正文。meta 是一个普通对象（会补上 sl: 1）；code 可以没有 */
  function pack(meta, code) {
    var m = Object.assign({ sl: 1 }, meta), out = [NOTE, "", "```json", JSON.stringify(m).replace(/`/g, "\\u0060"), "```"];
    if (code) {
      code = String(code).replace(/\r\n?/g, "\n").replace(/\s+$/, "");
      if (code.indexOf("````") >= 0) throw new Error("代码里不能出现连续四个反引号。");
      out.push("", "````js", code, "````");
    }
    return out.join("\n") + "\n";
  }
  /** 反过来：{ meta, code }；不是这里生成的、或者被改坏了的，返回 null */
  function unpack(body) {
    if (typeof body !== "string" || body.length > 200000) return null;
    body = body.replace(/\r\n?/g, "\n");
    var m = /```json[ \t]*\n([\s\S]*?)\n```/.exec(body); if (!m) return null;
    var meta; try { meta = JSON.parse(m[1]); } catch (e) { return null; }
    if (!meta || typeof meta !== "object" || Array.isArray(meta) || meta.sl !== 1 || !KINDS[meta.kind]) return null;
    var c = /````js[ \t]*\n([\s\S]*?)\n````/.exec(body.slice(m.index + m[0].length));
    return { meta: meta, code: c ? c[1] : "" };
  }
  /** 去 GitHub 新建一条 Issue 的地址。内容太长放不进地址时，clip 里是要人自己粘贴的正文 */
  function newUrl(kind, text, body) {
    var base = WEB + "/issues/new?title=" + encodeURIComponent(title(kind, text)), full = base + "&body=" + encodeURIComponent(body);
    if (full.length <= MAX_URL) return { url: full, clip: "" };
    return { url: base + "&body=" + encodeURIComponent(PASTE), clip: body };
  }
  function issueUrl(n) { return WEB + "/issues/" + (n | 0); }

  /* ---------- 读 ---------- */
  function fetcher() { return doFetch || (typeof fetch === "function" ? function (u, o) { return fetch(u, o); } : null); }
  function getJson(url) {
    var f = fetcher(); if (!f) return Promise.reject({ offline: true });
    return f(url, { headers: { Accept: "application/vnd.github+json" } }).then(function (r) {
      if (r.status === 403 || r.status === 429) {
        var hd = function (k) { try { return r.headers.get(k); } catch (e) { return null; } };
        throw { limited: r.status === 429 || hd("x-ratelimit-remaining") === "0", status: r.status, reset: +hd("x-ratelimit-reset") || 0 };
      }
      if (!r.ok) throw { status: r.status };
      return r.json();
    }, function () { throw { offline: true }; });
  }
  /** 一条原始的 Issue → 这里用的样子；不是策略实验室的东西就返回 null */
  function norm(it) {
    if (!it || it.pull_request || typeof it.title !== "string") return null;
    var m = /^\[SL:([a-z]+)\]\s*(.*)$/.exec(it.title); if (!m || !KINDS[m[1]]) return null;
    var p = unpack(it.body); if (!p || p.meta.kind !== m[1]) return null;
    var rc = it.reactions || {}, u = it.user || {};
    return {
      n: it.number | 0, kind: m[1], title: m[2].slice(0, 120), meta: p.meta, code: p.code, user: String(u.login || "").slice(0, 60), avatar: typeof u.avatar_url === "string" && /^https:\/\/avatars\.githubusercontent\.com\//.test(u.avatar_url) ? u.avatar_url : "",
      url: issueUrl(it.number), at: Date.parse(it.created_at) || 0, upd: Date.parse(it.updated_at) || 0, up: rc["+1"] | 0, down: rc["-1"] | 0, comments: it.comments | 0
    };
  }
  function scan(since) {
    var out = [];
    function page(k) {
      var url = API + "/issues?state=open&per_page=100&sort=created&direction=desc&page=" + k + (since ? "&since=" + encodeURIComponent(since) : "");
      return getJson(url).then(function (arr) {
        if (!Array.isArray(arr)) throw { status: 0 };
        arr.forEach(function (it) { var x = norm(it); if (x) out.push(x); });
        return arr.length === 100 && k < MAX_PAGES ? page(k + 1) : out;
      });
    }
    return page(1);
  }
  function sget() { try { return JSON.parse(sessionStorage.getItem(SKEY) || "null") || {}; } catch (e) { return {}; } }
  function sput(key, rec) { try { var o = sget(); o[key] = rec; var s = JSON.stringify(o); if (s.length < 1500000) sessionStorage.setItem(SKEY, s); } catch (e) {} }
  /** 取回大家交上来的东西。opt: { kind, since（ISO 时间：只要这之后动过的）, fresh（不用缓存） }
   *  返回 { items, at, stale, error }：取不到新的但手里有旧的，就给旧的（stale 为真，error 说明为什么） */
  function list(opt) {
    opt = opt || {};
    var key = opt.since || "all", now = Date.now(), c = mem[key] || (mem[key] = sget()[key] || null);
    function pick(rec, extra) { return Object.assign({ items: rec.items.filter(function (x) { return !opt.kind || x.kind === opt.kind; }), at: rec.at, stale: false, error: null }, extra || {}); }
    if (c && !opt.fresh && now - c.at < TTL) return Promise.resolve(pick(c));
    return scan(opt.since).then(function (items) {
      var rec = mem[key] = { at: Date.now(), items: items }; sput(key, rec);
      return pick(rec);
    }, function (e) {
      if (c) return pick(c, { stale: true, error: e || {} });
      throw e || {};
    });
  }
  return {
    REPO: REPO, WEB: WEB, KINDS: Object.keys(KINDS), title: title, pack: pack, unpack: unpack, newUrl: newUrl, issueUrl: issueUrl, list: list, norm: norm,
    /** 测试用：换一个取数的函数，并清掉缓存 */
    use: function (f) { doFetch = f || null; mem = {}; try { sessionStorage.removeItem(SKEY); } catch (e) {} }
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = QLHub;
