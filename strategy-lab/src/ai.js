// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 独立网页里的 AI 接口：使用者自带 API 密钥，从浏览器直接调用所选的服务商。
 *
 * 在 Claude 里打开页面时用不到这一层：那里由宿主提供 Claude（window.claude.use("sample")），而且页面不能自己联网。
 * 放到普通网站上以后没有那个能力，这里提供同样形状的替代品：sample(input, {modelTier, signal, onText}) → {text, truncated}。
 *
 *   · 服务商：DeepSeek、ChatGPT（OpenAI）、Kimi（月之暗面）、豆包（火山方舟），以及任何兼容 OpenAI Chat Completions 的接口。
 *   · 密钥只存在本机浏览器里（localStorage "ql.ai.v1"），请求从浏览器直接发给所选的服务商；填了转发代理时经代理转发。
 *     接口地址与代理地址必须是 http(s):// 开头，而且不能指向本网站（免得把密钥发给本站）。
 *   · 有的服务商不允许网页直接调用（浏览器的跨域限制）。这时请求会以"连不上"告终，设置里可以填一个转发代理：
 *     代理地址的用法是 <代理>/<完整的接口地址>，例如 https://my-proxy.example.workers.dev/https://api.deepseek.com/chat/completions
 *   · 回答是流式的：边生成边显示。模型先"深度思考"时，正文到来之前只报告已经想了多少字。
 *   · 服务商报错点名不认某个可选参数（HTTP 400）时去掉它重试，成功后在这次打开页面期间记住；429 / 5xx 退避后重试。
 * 模型的名字变得很快。这里的默认值是 2026 年 10 月的；设置里的"获取模型列表"会向服务商查询当前可用的模型。 */
var QLAI = (function () {
  "use strict";
  var LSK = "ql.ai.v1";
  var NOTHINK = { thinking: { type: "disabled" } };
  /* name 全称；short 界面上的简称；base 接口地址；model 默认模型；fast 做小事（挑图表）用的模型；models 候选；keyUrl 申请密钥的网址；
     quiet(model) 不需要深度思考时附带的请求参数；maxTok 需要显式给出的最大输出；sites 同一家的不同站点（密钥不通用）；hint 设置里的提示；
     cors 能不能从网页直接调用。2026-10-09 在 https://zechenbian.github.io 上用一把无效的密钥实测：DeepSeek、OpenAI、Kimi（两个站点）都能读到
     "密钥无效"的回答，也就是允许网页调用；火山方舟的回答被浏览器的跨域限制拦下，要经转发代理 */
  var PRE = [
    { id: "deepseek", name: "DeepSeek（深度求索）", short: "DeepSeek", base: "https://api.deepseek.com", model: "deepseek-v4-pro", fast: "deepseek-flash", models: ["deepseek-v4-pro", "deepseek-flash"], keyUrl: "https://platform.deepseek.com/api_keys",
      quiet: function () { return NOTHINK; } },
    { id: "openai", name: "ChatGPT（OpenAI）", short: "ChatGPT", base: "https://api.openai.com/v1", model: "gpt-6-sol", fast: "gpt-6-luna", models: ["gpt-6-sol", "gpt-6.1-sol", "gpt-6-luna", "gpt-5.6", "gpt-5.5", "gpt-5.4-mini"], keyUrl: "https://platform.openai.com/api-keys",
      hint: "ChatGPT 的会员订阅不包含 API 用量：API 要在 platform.openai.com 另外开通并充值。" },
    { id: "kimi", name: "Kimi（月之暗面）", short: "Kimi", base: "https://api.moonshot.cn/v1", model: "kimi-k3", fast: "kimi-k2.6", models: ["kimi-k3", "kimi-k2.6", "kimi-k2.5"], keyUrl: "https://platform.moonshot.cn/console/api-keys",
      sites: [["https://api.moonshot.cn/v1", "国内站 moonshot.cn"], ["https://api.moonshot.ai/v1", "国际站 moonshot.ai"]],
      quiet: function (m) { return /^kimi-k2\.[0-6]\b/.test(m) ? NOTHINK : /^kimi-k3/.test(m) ? { reasoning_effort: "low" } : null; },
      hint: "国内站和国际站的密钥不通用：密钥是在哪个站申请的，下面的\"站点\"就选哪个。" },
    { id: "doubao", name: "豆包（火山方舟）", short: "豆包", base: "https://ark.cn-beijing.volces.com/api/v3", model: "doubao-seed-2-1-pro-260915", fast: "doubao-seed-2-1-lite-260915", models: ["doubao-seed-2-1-pro-260915", "doubao-seed-2-1-lite-260915", "doubao-seed-2-1-turbo-260628"], keyUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
      quiet: function () { return NOTHINK; }, maxTok: 8192, cors: false,
      hint: "模型要先在方舟控制台开通。\"模型\"一栏也可以填你创建的推理接入点的编号（ep- 开头）。" },
    { id: "custom", name: "其他（兼容 OpenAI 的接口）", short: "AI", base: "", model: "", fast: "", models: [], keyUrl: "",
      hint: "任何兼容 OpenAI Chat Completions 的接口都可以：填接口地址（到 /v1 为止）、密钥和模型名。本机的 Ollama、LM Studio 也算（例如 http://localhost:11434/v1，可以不填密钥）。" }
  ];
  function byId(id) { for (var i = 0; i < PRE.length; i++) if (PRE[i].id === id) return PRE[i]; return null; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function trimUrl(s) { return String(s || "").trim().replace(/\/+$/, ""); }
  // 本机与局域网地址（Ollama、LM Studio 等）：不经过转发代理（云端的代理连不到这些地址），也可以不填密钥
  var LOCAL = /^(https?:\/\/)?(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[::1\]|0\.0\.0\.0|[^/:?#\s]+\.local)(:\d+)?(\/|$)/i;
  function isLocal(u) { return LOCAL.test(String(u || "").trim()); }
  /** 规范网址：补上 https://（本机与局域网补 http://）；接口地址去掉误贴的 /chat/completions；别的协议、坏网址返回空串 */
  function normUrl(s, isBase) {
    s = trimUrl(s); if (!s || s.charAt(0) === "/") return "";          // 相对路径会指向本网站
    if (!/^https?:\/\//i.test(s)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^/:]+:\d+(\/|$)/.test(s)) return "";   // javascript:、ftp:// 等
      s = (isLocal(s) ? "http://" : "https://") + s.replace(/^\/+/, "");
    }
    if (isBase) s = trimUrl(s.replace(/\/(chat\/completions|completions|models)$/i, ""));
    try { var u = new URL(s); if (!/^https?:$/.test(u.protocol) || !u.hostname || u.username || u.password) return ""; } catch (e) { return ""; }
    return s;
  }
  function sameSite(u) { try { return location.protocol !== "file:" && new URL(u).origin === location.origin; } catch (e) { return true; } }
  var ZW = /[\s​-‍⁠﻿]/g;                             // 复制密钥时常夹带的空白与零宽字符

  /* ---------- 设置（只存在本机） ---------- */
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(LSK) || "null");
      if (o && typeof o === "object") return { p: byId(o.p) ? o.p : "", by: o.by && typeof o.by === "object" ? o.by : {}, proxy: typeof o.proxy === "string" ? o.proxy : "" };
    } catch (e) {}
    return { p: "", by: {}, proxy: "" };
  }
  var CFG = load(), subs = [], CAP = {};                                  // CAP：服务商+模型 → 已知不支持的参数（这次打开页面期间有效）
  function fire() { subs.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }
  function save(c) {
    CFG = { p: byId(c && c.p) ? c.p : "", by: clone((c && c.by) || {}), proxy: trimUrl(c && c.proxy) };
    try { localStorage.setItem(LSK, JSON.stringify(CFG)); } catch (e) {}
    Object.keys(CAP).forEach(function (k) { delete CAP[k]; });
    fire();
  }
  try { window.addEventListener("storage", function (e) { if (e.key === LSK) { CFG = load(); fire(); } }); } catch (e) {}   // 另一个标签页改了设置
  /** 合并预设与使用者填写的值；baseBad / proxyBad / keyBad 标出填错的地方 */
  function conf(c, pid) {
    c = c || CFG; pid = pid || c.p; var P = byId(pid); if (!P) return null;
    var u = (c.by && c.by[pid]) || {};
    var rawBase = trimUrl(u.base) || P.base || "", base = normUrl(rawBase, true), rawProxy = trimUrl(c.proxy), proxy = normUrl(rawProxy, false);
    var key = String(u.key || "").replace(ZW, "");
    return { id: pid, P: P, key: key, keyBad: !!key && !/^[\x21-\x7e]+$/.test(key),
      model: String(u.model || "").trim() || P.model || "", fast: String(u.fast || "").trim() || (trimUrl(u.base) && trimUrl(u.base) !== P.base ? "" : P.fast) || "",
      base: base && !sameSite(base) ? base : "", baseBad: !!rawBase && (!base || sameSite(base)),
      proxy: proxy && !sameSite(proxy) ? proxy : "", proxyBad: !!rawProxy && (!proxy || sameSite(proxy)),
      think: u.think !== false };
  }
  function usable(k) { return !!(k && k.base && k.model && !k.keyBad && !k.proxyBad && (k.key || isLocal(k.base))); }
  function viaProxy(k) { return !!(k.proxy && !isLocal(k.base)); }
  /** 这家服务商已知不允许网页直接调用，而这次又没有经过转发代理 */
  function noCors(k) { return !!(k && k.P && k.P.cors === false && k.base === k.P.base && !viaProxy(k)); }
  function url(k, path) { return (viaProxy(k) ? k.proxy + "/" : "") + k.base + path; }
  function headers(k, json) { var h = {}; if (json) h["Content-Type"] = "application/json"; if (k.key) h.Authorization = "Bearer " + k.key; return h; }
  /** 设置里填得对不对：返回错误代码或空串 */
  function problem(k) {
    if (!k) return "no_provider";
    return k.baseBad ? "bad_base" : !k.base ? "no_base" : !k.model ? "no_model" : k.keyBad ? "bad_key" : k.proxyBad ? "bad_proxy" : !k.key && !isLocal(k.base) ? "no_key" : "";
  }

  /* ---------- 错误 ---------- */
  function clean(s) { return String(s || "").replace(/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").replace(/\s+/g, " ").trim(); }
  function mkErr(code, detail, extra) { var e = { code: code, message: code }; if (detail) e.detail = clean(detail).slice(0, 300); if (extra) for (var x in extra) e[x] = extra[x]; return e; }
  function abortErr() { var e = new Error("aborted"); e.name = "AbortError"; return e; }
  async function httpErr(res) {
    var txt = ""; try { txt = await res.text(); } catch (e) {}
    var j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (Array.isArray(j)) j = j[0];
    var er = j && typeof j === "object" ? (j.error !== undefined ? j.error : j.Error !== undefined ? j.Error : j) : null;
    var m = er ? (typeof er === "string" ? er : er.message || er.msg || er.Message || j.message || j.msg || "") : "";
    var ec = er && typeof er === "object" ? String(er.code || er.type || er.Code || er.status || "") : "";
    if (!m) m = txt.replace(/<[^>]+>/g, " ");
    m = clean(m).slice(0, 300);
    var s = res.status, all = m + " " + ec, proxy = res.headers.get("x-tianxia-proxy") === "1" || res.headers.get("x-ai-proxy") === "1";
    var code = proxy ? "proxy_refused"                                    // 转发代理自己拒绝（网站或服务商不在它的允许名单里）
      : /content.{0,12}(risk|filter|policy)|data_inspection|inappropriate|sensitive.?content|high.?risk|flagged|moderation|prohibited|blocked due to|敏感|违规|不安全|审核/i.test(all) ? "refused"
      : s === 402 || /insufficient[_ ]?(balance|quota|funds|credit)|exceeded your current quota|quota.?exceeded|余额|欠费|arrearage|overdue|billing/i.test(all) ? "quota"
      : s === 401 || s === 403 || (s < 500 && /api[_ -]?key|unauthori[sz]ed|authenticat|invalid.?token/i.test(all)) ? "bad_auth"
      : s === 429 ? "rate_limited"
      : /context.?length|maximum context|too many tokens|prompt is too long|input.{0,20}too long|超出.{0,6}长度/i.test(all) ? "prompt_too_large"
      : /model|endpoint/i.test(all) && (s === 404 || /not.?(exist|found)|does not exist|invalid model|unknown model|not.?activated|NotOpen|未开通|不存在|no access/i.test(all)) ? "bad_model"
      : s === 404 || s === 405 ? "bad_url"
      : s === 400 || s === 422 ? "invalid_request"
      : s === 408 || s === 504 ? "timeout" : "upstream_error";
    var ra = +(res.headers.get("retry-after") || 0);
    return mkErr(code, "HTTP " + s + (m ? " · " + m : ""), { status: s, raw: m, retryAfter: ra > 0 ? Math.min(20000, Math.max(1000, ra * 1000)) : 0 });
  }

  /* ---------- 请求 ---------- */
  /** 输入（字符串或 [{role, content}]）→ 交替的 user / assistant 消息（有的接口不接受连续两条同角色的消息） */
  function msgs(input) {
    var a = typeof input === "string" ? [{ role: "user", content: input }] : Array.isArray(input) ? input : [{ role: "user", content: String(input) }], out = [];
    a.forEach(function (x) {
      if (!x) return;
      var role = x.role === "assistant" ? "assistant" : "user", content = typeof x.content === "string" ? x.content : JSON.stringify(x.content), l = out[out.length - 1];
      if (l && l.role === role) l.content += "\n\n" + content; else out.push({ role: role, content: content });
    });
    if (!out.length || out[0].role !== "user") out.unshift({ role: "user", content: "(begin)" });
    return out;
  }
  /** 去掉夹在正文里的思考段（有的模型把它放在 <think>…</think> 里）；流式显示到一半时，没闭合的那一段也不显示 */
  function visible(t) {
    var s = String(t || "").replace(/<(think|thinking|reasoning|reflection)>[\s\S]*?<\/\1>/gi, "");
    var i = s.search(/<(think|thinking|reasoning|reflection)>/i); if (i >= 0) s = s.slice(0, i);
    return s.replace(/^\s+/, "");
  }
  async function post(k, path, body, sig) {
    var res;
    try { res = await fetch(url(k, path), { method: "POST", headers: headers(k, true), body: JSON.stringify(body), signal: sig, credentials: "omit", referrerPolicy: "no-referrer" }); }
    catch (e) { if (e && e.name === "AbortError") throw e; throw mkErr("network", String((e && e.message) || e), { proxy: viaProxy(k), nocors: noCors(k) }); }   // 跨域被拦、网络不通、代理连不上都落在这里
    if (!res.ok) throw await httpErr(res);
    return res;
  }
  /** 逐行解析服务商的流（OpenAI 兼容格式） */
  function sse(o) {
    var raw = "", think = 0, fin = null, err = null, shown = "";
    return {
      line: function (l) {
        if (l.slice(0, 5) !== "data:") return;                            // 注释（: keep-alive）与 event: 行
        var d = l.slice(5).trim(); if (!d || d === "[DONE]") return;
        var j; try { j = JSON.parse(d); } catch (e) { return; }
        if (j.error) { var er = j.error; err = mkErr(/overload|rate/i.test(String(er.type || er.code || "")) ? "rate_limited" : "upstream_error", String(er.message || er.type || "stream error"), { retry: true }); return; }
        var c = j.choices && j.choices[0]; if (!c) return;
        var dl = c.delta || c.message || {};
        var rc = typeof dl.reasoning_content === "string" ? dl.reasoning_content : typeof dl.reasoning === "string" ? dl.reasoning : "";
        if (rc) { think += rc.length; if (o.onThink && !raw) try { o.onThink(think); } catch (e) {} }
        if (typeof dl.content === "string" && dl.content) {
          raw += dl.content; var v = visible(raw);
          if (v !== shown) { shown = v; if (o.onText) try { o.onText({ text: v }); } catch (e) {} }
          else if (o.onThink && !v) try { o.onThink(think + raw.length); } catch (e) {}
        }
        if (c.finish_reason) fin = c.finish_reason;
      },
      get err() { return err; },
      res: function () { return { text: visible(raw), fin: fin, stream: true }; }
    };
  }
  async function readStream(res, o, beat) {
    var p = sse(o), rd = res.body.getReader(), dec = new TextDecoder(), buf = "", done = false, i;
    try {
      for (;;) {
        var r = await rd.read(); beat(); if (r.done) { done = true; break; }
        if (o.sig && o.sig.aborted) throw abortErr();
        buf += dec.decode(r.value, { stream: true });
        while ((i = buf.indexOf("\n")) >= 0) { p.line(buf.slice(0, i).replace(/\r$/, "")); buf = buf.slice(i + 1); if (p.err) throw p.err; }
      }
      buf += dec.decode(); if (buf.trim()) p.line(buf.trim());
      if (p.err) throw p.err;
    } catch (e) {
      if (e && (e.name === "AbortError" || e.code)) throw e;
      throw mkErr("upstream_error", "stream interrupted: " + String((e && e.message) || e), { retry: true });
    } finally { if (!done) try { rd.cancel().catch(function () {}); } catch (e) {} }
    return p.res();
  }
  /** 发一次请求。f.extra 不要深度思考时的参数；f.mt 最大输出；f.stream 流式 */
  async function once(k, model, m, f, o, beat) {
    var body = { model: model, messages: m };
    if (f.extra) { var q = clone(f.extra); for (var x in q) body[x] = q[x]; }
    if (f.mt && k.P.maxTok) body.max_tokens = k.P.maxTok;
    if (f.stream) body.stream = true;
    var res = await post(k, "/chat/completions", body, o.sig); beat();
    var ct = res.headers.get("content-type") || "";
    if (res.body && /event-stream/i.test(ct)) return readStream(res, o, beat);
    var txt = await res.text(); beat();
    if (/^\s*(data|event):/.test(txt)) { var p = sse(o); txt.split("\n").forEach(function (l) { if (!p.err) p.line(l.replace(/\r$/, "")); }); if (p.err) throw p.err; return p.res(); }   // 流式回复但标错了类型
    var j; try { j = JSON.parse(txt); } catch (e) { throw mkErr("upstream_error", "not JSON: " + txt.slice(0, 160)); }
    if (j && j.error && !j.choices) { var er = j.error; throw mkErr("upstream_error", String((er && (er.message || er.msg)) || er)); }
    var c = j.choices && j.choices[0], t = c && c.message ? c.message.content : c && c.text;
    if (Array.isArray(t)) t = t.map(function (y) { return typeof y === "string" ? y : (y && y.text) || ""; }).join("");
    t = visible(t);
    if (t && o.onText) try { o.onText({ text: t }); } catch (e) {}
    return { text: t, fin: c && c.finish_reason };
  }
  function wait(ms, sig) {
    return new Promise(function (ok, no) {
      if (sig && sig.aborted) { no(abortErr()); return; }
      var t = setTimeout(ok, ms);
      if (sig) sig.addEventListener("abort", function () { clearTimeout(t); no(abortErr()); }, { once: true });
    });
  }
  async function call(k, model, input, o, beat) {
    var m = msgs(input), ck = k.id + "|" + k.base + "|" + model, cap = CAP[ck] || (CAP[ck] = {});
    var extra = o.quiet && k.P.quiet ? k.P.quiet(model) : null;
    var f = { extra: cap.extra === false ? null : extra, mt: !!k.P.maxTok && cap.mt !== false, stream: cap.stream !== false };
    var dropped = [], retries = 0, blind = false;
    for (var n = 0; n < 8; n++) {
      var r;
      try { r = await once(k, model, m, f, o, beat); }
      catch (e) {
        if (!e || e.name === "AbortError") throw e;
        if ((e.status === 400 || e.status === 422) && e.code === "invalid_request") {   // 参数不被接受：报错点名哪个就去掉哪个；没点名就把可选参数都去掉试一次
          var t = String(e.raw || "");
          var named = f.extra && /thinking|reasoning/i.test(t) ? "extra" : f.mt && /max_tokens|max_completion_tokens|maximum.{0,20}tokens|tokens.{0,20}(range|exceed|large)/i.test(t) ? "mt" : f.stream && /\bstream/i.test(t) ? "stream" : null;
          if (named) { f[named] = named === "extra" ? null : false; dropped.push(named); continue; }
          if (!blind && (f.extra || f.mt)) { blind = true; if (f.extra) { f.extra = null; dropped.push("extra"); } if (f.mt) { f.mt = false; dropped.push("mt"); } continue; }
        }
        if (retries < 2 && (e.retry || e.code === "rate_limited" || (e.code === "upstream_error" && e.status >= 500))) { retries++; await wait(e.retryAfter || (retries === 1 ? 2500 : 7000), o.sig); continue; }
        throw e;
      }
      dropped.forEach(function (x) { cap[x] = false; });                 // 去掉之后成功了：记住这个模型不支持
      return r;
    }
    throw mkErr("invalid_request");
  }

  /* ---------- 对外：与 Claude 里的 sample 同形 ---------- */
  var TOTAL = 900000, IDLE = 180000;                                      // 整个请求最长 15 分钟；连续 3 分钟一个字节都没收到就放弃
  async function run(input, o) {
    o = o || {};
    var k = conf(); if (!usable(k)) throw mkErr("unavailable");
    var tier = o.modelTier || "default", model = tier === "quick" && k.fast ? k.fast : k.model;
    var ext = o.signal, ctl = new AbortController(), why = "", idleT = null;
    function onAb() { why = why || "cancelled"; ctl.abort(); }
    if (ext) { if (ext.aborted) throw mkErr("cancelled"); ext.addEventListener("abort", onAb, { once: true }); }
    var totalT = setTimeout(function () { why = "timeout"; ctl.abort(); }, o.timeout || TOTAL);
    function beat() { clearTimeout(idleT); idleT = setTimeout(function () { why = "timeout"; ctl.abort(); }, IDLE); }
    beat();
    try {
      var opt = { sig: ctl.signal, onText: o.onText, onThink: o.onThink, quiet: !(tier === "complex" && k.think) }, r;
      try { r = await call(k, model, input, opt, beat); }
      catch (e) {
        if (!(e && e.code === "bad_model" && model !== k.model)) throw e;
        model = k.model; r = await call(k, model, input, opt, beat);       // 做小事用的那个模型在这个账号上不可用：换回主模型
      }
      if (!r.text) throw mkErr(/content_filter|refusal|safety/i.test(String(r.fin || "")) ? "refused" : "empty_completion");
      return { text: r.text, truncated: r.fin === "length", model: model, provider: k.id };
    } catch (e) {
      var err = ctl.signal.aborted ? mkErr(why || "cancelled") : e && e.name === "AbortError" ? mkErr("cancelled") : e;
      if (err && err.code !== "cancelled") try { console.warn("[AI]", k.id, model, err.code, err.detail || ""); } catch (x) {}   // 详情只记在本机的控制台，里面没有密钥
      throw err;
    } finally { clearTimeout(totalT); clearTimeout(idleT); if (ext) ext.removeEventListener("abort", onAb); }
  }
  function sample() {
    if (!usable(conf())) return null;
    var s = function (input, o) { return run(input, o); };
    s.limits = function () { return Promise.resolve({ tools: false, images: false, maxPromptBytes: 1 << 20 }); };
    return s;
  }
  async function timed(fn, ms) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, ms);
    try { return await fn(ctl.signal); }
    catch (e) { if (ctl.signal.aborted) throw mkErr("timeout"); throw e; }
    finally { clearTimeout(t); }
  }
  /** 测试连接（用设置面板里还没保存的草稿）：发一句最短的话，看能不能回 */
  async function test(c) {
    var k = conf(c || CFG), bad = problem(k); if (bad) throw mkErr(bad);
    var t0 = Date.now();
    var r = await timed(function (sig) { return call(k, k.model, "Connection test. Reply with the single word: OK", { sig: sig, quiet: true }, function () {}); }, 90000);
    return { ms: Date.now() - t0, text: String(r.text || "").slice(0, 80), model: k.model, viaProxy: viaProxy(k) };
  }
  /** 向服务商查询可用的模型（GET /models），去掉嵌入、语音、绘图等非对话模型 */
  async function models(c) {
    var k = conf(c || CFG), bad = problem(k); if (bad && bad !== "no_model") throw mkErr(bad);
    var res = await timed(async function (sig) {
      var r; try { r = await fetch(url(k, "/models"), { headers: headers(k, false), signal: sig, credentials: "omit", referrerPolicy: "no-referrer" }); }
      catch (e) { if (e && e.name === "AbortError") throw e; throw mkErr("network", String((e && e.message) || e), { proxy: viaProxy(k), nocors: noCors(k) }); }
      if (!r.ok) throw await httpErr(r);
      return r.json();
    }, 30000);
    var arr = Array.isArray(res) ? res : (res && (res.data || res.models)) || [];
    var ids = arr.map(function (x) { return typeof x === "string" ? x : x && (x.id || x.name || x.model); }).filter(function (x) { return typeof x === "string" && x; }).map(function (s) { return s.replace(/^models\//, "").slice(0, 120); });
    var seen = {}; return ids.filter(function (s) { if (seen[s]) return false; seen[s] = 1; return !/embed|whisper|tts|dall-e|moderation|rerank|transcri|realtime|audio|speech|image|imagen|veo|sora|ocr|bge-|aqa|seedream|seedance|video/i.test(s); }).sort();
  }

  /* ---------- 给界面用的文字 ---------- */
  var ERR = {
    unavailable: "还没有接入 AI。先点\"接入 AI…\"，选一家服务商并填上密钥。",
    no_provider: "先选一家服务商。", no_base: "没有填接口地址。", bad_base: "接口地址不对：要以 http:// 或 https:// 开头，而且不能指向本网站。", no_model: "没有填模型的名字。",
    no_key: "没有填密钥。", bad_key: "密钥里有不该出现的字符（中文、全角符号等），请重新复制一遍。", bad_proxy: "转发代理的地址不对：要以 http:// 或 https:// 开头，而且不能指向本网站。",
    bad_auth: "服务商不认这把密钥：可能是密钥填错了、已经作废，或者这把密钥属于另一个站点。",
    quota: "账号的余额或额度不够了，要到服务商那里充值。",
    rate_limited: "调用太频繁，或者达到了服务商给这个账号的限速。过一会儿再试。",
    bad_model: "服务商不认识这个模型的名字，或者这个账号还没有开通它。到设置里点\"获取模型列表\"换一个。",
    bad_url: "接口地址不对（服务商回答\"没有这个地址\"）。检查设置里的接口地址。",
    prompt_too_large: "发送的内容超出了这个模型的长度上限。换一个上下文更长的模型，或者把自己写的代码改短一些。",
    refused: "服务商的内容审核拦下了这次请求，换个说法试试。",
    invalid_request: "服务商不接受这个请求的格式。换一个模型试试；用的是\"其他\"接口时，确认它兼容 OpenAI 的 Chat Completions。",
    timeout: "等了很久没有回音，已经放弃。可以再试一次，或者换一个更快的模型。",
    upstream_error: "服务商那边出了错。过一会儿再试。",
    empty_completion: "模型没有给出回答。再试一次，或者把要求说得更具体一些。",
    proxy_refused: "转发代理拒绝了这次请求：这个网站或者这家服务商不在它的允许名单里。",
    network: "请求没有发出去。可能是网络不通，也可能是这家服务商不允许网页直接调用（浏览器的跨域限制）。后一种情况要在设置的\"高级\"里填一个转发代理。",
    network_cors: "请求没有发出去：这家服务商不允许网页直接调用（浏览器的跨域限制）。要在设置的\"高级\"里填一个转发代理。",
    network_proxy: "连不上转发代理。检查设置里代理的地址，以及代理是不是还在运行。"
  };
  /** 把错误说成人话；服务商的原话（detail）另外返回，界面用小字显示 */
  function explain(e) {
    var code = e && e.code === "network" ? (e.proxy ? "network_proxy" : e.nocors ? "network_cors" : "network") : e && e.code;
    return { text: ERR[code] || "出错了" + (e && e.message ? "（" + e.message + "）" : "") + "。", detail: e && e.detail && !/^network/.test(code) ? e.detail : "" };
  }
  function label(c) { var k = conf(c || CFG); return usable(k) ? { short: k.P.short, model: k.model, id: k.id } : null; }

  return {
    PRE: PRE, preset: byId, cfg: function () { return clone(CFG); }, save: save, conf: conf, usable: usable, problem: problem, ready: function () { return usable(conf()); },
    isLocal: isLocal, viaProxy: viaProxy, noCors: noCors, sample: sample, test: test, models: models, label: label, explain: explain, visible: visible,
    onChange: function (f) { subs.push(f); }, _cap: CAP, _key: LSK
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = QLAI;
