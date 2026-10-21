// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 独立网页里的 AI 接口（src/ai.js）：设置的校验、请求的形状、流式解析、出错时的归类与重试。
// 不联网：fetch 换成假的，按测试的需要回放服务商的各种回答。密钥是随手编的。
const { ok, section, done } = require("./harness.js");
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
global.location = { protocol: "https:", origin: "https://zechenbian.github.io" };
global.window = { addEventListener() {} };
const warn = console.warn; console.warn = () => {};                     // 出错时页面会在控制台记一行，测试里不用看
const AI = require("../src/ai.js");
const KEY = "sk-test-0000-not-a-real-key";

/* ---------- 假的服务商 ---------- */
let calls = [], handler = null;
global.fetch = async (url, init) => {
  init = init || {}; const c = { url: String(url), method: init.method || "GET", headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : null, credentials: init.credentials, referrerPolicy: init.referrerPolicy, signal: init.signal };
  calls.push(c);
  if (init.signal && init.signal.aborted) { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
  const res = await handler(c);
  // 真的 fetch 被中止时，读回答的那一头会收到 AbortError；假的这里照着做
  if (init.signal && res && res.body && res.__abort) init.signal.addEventListener("abort", () => res.__abort(), { once: true });
  return res;
};
const enc = new TextEncoder();
/** 把一串事件编成服务商的流，再按很小的块切开（会切在一行中间、甚至一个汉字中间） */
function sse(events, o) {
  o = o || {}; const text = events.map(e => (e === ":" ? ": keep-alive\r\n\r\n" : "data: " + (typeof e === "string" ? e : JSON.stringify(e)) + (o.crlf ? "\r\n\r\n" : "\n\n"))).join(""), bytes = enc.encode(text), step = o.step || 7;
  let i = 0, timer = null, ctlRef = null;
  const body = new ReadableStream({
    start(ctl) { ctlRef = ctl; },
    pull(ctl) { return new Promise(res => { timer = setTimeout(() => { if (i >= bytes.length) ctl.close(); else { ctl.enqueue(bytes.slice(i, i + step)); i += step; } res(); }, o.delay || 0); }); },
    cancel() { clearTimeout(timer); }
  });
  const res = new Response(body, { status: 200, headers: { "content-type": o.type || "text/event-stream; charset=utf-8" } });
  res.__abort = () => { clearTimeout(timer); try { const e = new Error("aborted"); e.name = "AbortError"; ctlRef.error(e); } catch (x) {} };
  return res;
}
const delta = (content, extra) => ({ choices: [Object.assign({ index: 0, delta: content == null ? {} : { content } }, extra || {})] });
const think = t => ({ choices: [{ index: 0, delta: { reasoning_content: t } }] });
const stop = (why) => ({ choices: [{ index: 0, delta: {}, finish_reason: why || "stop" }] });
const answer = (text, o) => sse([].concat(text.match(/[\s\S]{1,5}/g).map(x => delta(x)), [stop(o && o.fin), "[DONE]"]), o);
const jerr = (status, obj, headers) => new Response(JSON.stringify(obj), { status, headers: Object.assign({ "content-type": "application/json" }, headers || {}) });
function setup(p, over, proxy) { const by = {}; by[p] = Object.assign({ key: KEY }, over || {}); AI.save({ p, by, proxy: proxy || "" }); calls = []; }
async function fails(fn) { try { await fn(); return null; } catch (e) { return e; } }

(async () => {
  section("服务商的清单");
  {
    const ids = AI.PRE.map(p => p.id);
    ok(ids.join() === "claude,deepseek,openai,kimi,doubao,custom", "Claude 排第一，然后是 DeepSeek、ChatGPT、Kimi、豆包，最后是\"其他\"", ids.join());
    ok(AI.PRE.slice(0, 5).every(p => /^https:\/\//.test(p.base) && p.model && p.fast && p.models.indexOf(p.model) >= 0 && /^https:\/\//.test(p.keyUrl) && p.name && p.short), "五家都有接口地址、默认模型、便宜的模型、申请密钥的网址");
    ok(AI.preset("claude").api === "anthropic" && AI.preset("claude").search === true && AI.PRE.filter(p => p.search).length === 1, "只有 Claude 走自己的接口、能在服务商那边搜索");
    ok(AI.preset("custom").base === "" && AI.preset("custom").model === "", "\"其他\"的接口地址和模型由使用者自己填");
    ok(AI.preset("kimi").sites.length === 2 && AI.preset("kimi").sites[0][0] === AI.preset("kimi").base, "Kimi 有国内站和国际站两个站点");
  }

  section("设置的校验");
  {
    AI.save({ p: "", by: {} });
    ok(!AI.ready() && AI.sample() === null && AI.label() === null && AI.problem(AI.conf()) === "no_provider", "什么都没填：不可用");
    AI.save({ p: "deepseek", by: {} });
    ok(AI.problem(AI.conf()) === "no_key" && !AI.ready(), "选了服务商没填密钥：不可用");
    const c = (by, proxy) => AI.conf({ p: "deepseek", by: { deepseek: by }, proxy: proxy || "" });
    ok(c({ key: " sk-ab​cd\n" }).key === "sk-abcd", "密钥里夹带的空白和零宽字符被去掉");
    ok(AI.problem(c({ key: "sk-密钥" })) === "bad_key", "密钥里有中文：报错");
    ok(c({ key: KEY }).base === "https://api.deepseek.com" && c({ key: KEY }).model === "deepseek-v4-pro" && c({ key: KEY }).fast === "deepseek-flash" && c({ key: KEY }).think === true, "没改的项用预设");
    ok(c({ key: KEY, base: "api.example.com/v1/chat/completions/" }).base === "https://api.example.com/v1", "接口地址：补上 https://，去掉误贴的 /chat/completions");
    ok(c({ key: KEY, base: "localhost:11434/v1" }).base === "http://localhost:11434/v1", "本机地址补的是 http://");
    ok(AI.problem(c({ key: KEY, base: "https://zechenbian.github.io/api" })) === "bad_base", "接口地址指向本网站：拒绝（免得把密钥发给本站）");
    ok(AI.problem(c({ key: KEY, base: "javascript:alert(1)" })) === "bad_base" && AI.problem(c({ key: KEY, base: "/v1" })) === "bad_base" && AI.problem(c({ key: KEY, base: "https://u:p@x.com/v1" })) === "bad_base" && AI.problem(c({ key: KEY, base: "ftp://x.com" })) === "bad_base", "别的协议、相对路径、带账号密码的网址：拒绝");
    ok(AI.problem(c({ key: KEY }, "https://zechenbian.github.io/p")) === "bad_proxy" && AI.problem(c({ key: KEY }, "file:///etc")) === "bad_proxy", "转发代理同样要查");
    ok(AI.problem(c({ key: KEY }, "my-proxy.example.workers.dev/")) === "" && c({ key: KEY }, "my-proxy.example.workers.dev/").proxy === "https://my-proxy.example.workers.dev", "代理地址补上 https://、去掉结尾的斜杠");
    const loc = AI.conf({ p: "custom", by: { custom: { base: "http://127.0.0.1:11434/v1", model: "qwen3:8b" } } });
    ok(AI.usable(loc) && AI.problem(loc) === "", "本机的接口可以不填密钥");
    ok(AI.problem(AI.conf({ p: "custom", by: { custom: { key: KEY } } })) === "no_base" && AI.problem(AI.conf({ p: "custom", by: { custom: { key: KEY, base: "https://x.com/v1" } } })) === "no_model", "\"其他\"：缺接口地址、缺模型名分别报出来");
    setup("kimi"); const l = AI.label();
    ok(AI.ready() && l.short === "Kimi" && l.model === "kimi-k3" && JSON.parse(store[AI._key]).by.kimi.key === KEY, "保存之后可用；设置存在本机");
    ok(Object.keys(store).join() === AI._key, "只写了自己的那一项");
  }

  section("请求的形状");
  {
    handler = () => answer("好的");
    setup("deepseek"); let s = AI.sample();
    await s("你好", { modelTier: "default" });
    let c = calls[0];
    ok(c.url === "https://api.deepseek.com/chat/completions" && c.method === "POST" && c.headers.Authorization === "Bearer " + KEY && c.headers["Content-Type"] === "application/json", "发到服务商的 /chat/completions，带着密钥", c.url);
    ok(c.credentials === "omit" && c.referrerPolicy === "no-referrer", "不带 cookie，不带来源页");
    ok(c.body.model === "deepseek-v4-pro" && c.body.stream === true && c.body.messages.length === 1 && c.body.messages[0].role === "user" && c.body.messages[0].content === "你好", "模型、流式、消息");
    ok(c.body.thinking && c.body.thinking.type === "disabled" && !("max_tokens" in c.body), "DeepSeek · 问结果：关掉深度思考");
    calls = []; await s("写一条规则", { modelTier: "complex" });
    ok(!("thinking" in calls[0].body) && calls[0].body.model === "deepseek-v4-pro", "DeepSeek · 写规则：让它思考");
    calls = []; await s("挑图", { modelTier: "quick" });
    ok(calls[0].body.model === "deepseek-flash" && calls[0].body.thinking.type === "disabled", "DeepSeek · 调图表：用便宜的模型，不思考");
    setup("deepseek", { think: false }); s = AI.sample(); await s("写一条规则", { modelTier: "complex" });
    ok(calls[0].body.thinking.type === "disabled", "设置里关了深度思考：写规则也不思考");
    setup("kimi"); s = AI.sample(); await s("问", { modelTier: "default" });
    ok(calls[0].url === "https://api.moonshot.cn/v1/chat/completions" && calls[0].body.model === "kimi-k3" && calls[0].body.reasoning_effort === "low" && !("thinking" in calls[0].body), "Kimi K3：不认 thinking，改用 reasoning_effort");
    calls = []; await s("写", { modelTier: "complex" }); ok(!("reasoning_effort" in calls[0].body), "Kimi K3 · 写规则：不限制思考");
    calls = []; await s("挑图", { modelTier: "quick" }); ok(calls[0].body.model === "kimi-k2.6" && calls[0].body.thinking.type === "disabled", "Kimi K2.6：可以关掉思考");
    setup("kimi", { base: "https://api.moonshot.ai/v1" }); s = AI.sample(); await s("问", { modelTier: "quick" });
    ok(calls[0].url === "https://api.moonshot.ai/v1/chat/completions" && calls[0].body.model === "kimi-k3", "Kimi 国际站：换了接口地址");
    setup("openai"); s = AI.sample(); await s("问", { modelTier: "default" });
    ok(calls[0].url === "https://api.openai.com/v1/chat/completions" && calls[0].body.model === "gpt-6-sol" && !("thinking" in calls[0].body) && !("max_tokens" in calls[0].body) && !("reasoning_effort" in calls[0].body), "ChatGPT：不带别家的参数");
    setup("doubao"); s = AI.sample(); await s("问", { modelTier: "default" });
    ok(calls[0].url === "https://ark.cn-beijing.volces.com/api/v3/chat/completions" && calls[0].body.max_tokens === 8192 && calls[0].body.thinking.type === "disabled", "豆包：给出最大输出，关掉思考");
    setup("doubao", { model: "ep-20261001-abcde" }); s = AI.sample(); await s("问", { modelTier: "complex" });
    ok(calls[0].body.model === "ep-20261001-abcde", "豆包：模型可以填推理接入点的编号");
    setup("custom", { base: "https://llm.example.com/v1", model: "my-model" }); s = AI.sample(); await s("问", { modelTier: "quick" });
    ok(calls[0].url === "https://llm.example.com/v1/chat/completions" && calls[0].body.model === "my-model" && Object.keys(calls[0].body).sort().join() === "messages,model,stream", "\"其他\"接口：只发最基本的三项");
    // 多轮
    calls = []; await s([{ role: "user", content: "背景" }, { role: "user", content: "问题一" }, { role: "assistant", content: "回答一" }, { role: "user", content: "问题二" }], {});
    const m = calls[0].body.messages;
    ok(m.length === 3 && m[0].role === "user" && m[0].content === "背景\n\n问题一" && m[1].role === "assistant" && m[2].content === "问题二", "连续两条同角色的消息合成一条");
    calls = []; await s([{ role: "assistant", content: "先说一句" }], {}); ok(calls[0].body.messages[0].role === "user" && calls[0].body.messages.length === 2, "第一条不是使用者说的：前面补一条");
    const lim = await s.limits(); ok(lim.tools === false, "这一路不支持让模型自己调用回测（深度模式不显示）");
  }

  section("转发代理");
  {
    handler = () => answer("好");
    setup("deepseek", null, "https://my-proxy.example.workers.dev/"); await AI.sample()("问", {});
    ok(calls[0].url === "https://my-proxy.example.workers.dev/https://api.deepseek.com/chat/completions" && calls[0].headers.Authorization === "Bearer " + KEY, "经代理：<代理>/<完整的接口地址>", calls[0].url);
    setup("custom", { base: "http://localhost:11434/v1", model: "qwen3:8b", key: "" }, "https://my-proxy.example.workers.dev"); await AI.sample()("问", {});
    ok(calls[0].url === "http://localhost:11434/v1/chat/completions" && !("Authorization" in calls[0].headers), "本机的接口不走代理；没有密钥就不带那个请求头", calls[0].url);
    handler = () => jerr(403, { error: { message: "This proxy does not serve https://example.org", type: "proxy_error" } }, { "x-tianxia-proxy": "1" });
    setup("deepseek", null, "https://my-proxy.example.workers.dev"); const e = await fails(() => AI.sample()("问", {}));
    ok(e && e.code === "proxy_refused" && /允许名单/.test(AI.explain(e).text), "代理自己拒绝：说清楚是代理的事，不说成密钥不对", e && e.code);
    handler = () => { throw new TypeError("Failed to fetch"); };
    const e2 = await fails(() => AI.sample()("问", {})); ok(e2.code === "network" && e2.proxy === true && /连不上转发代理/.test(AI.explain(e2).text), "代理连不上");
    setup("deepseek"); const e3 = await fails(() => AI.sample()("问", {}));
    ok(e3.code === "network" && !e3.proxy && !e3.nocors && /可能是网络不通/.test(AI.explain(e3).text) && /跨域/.test(AI.explain(e3).text) && /转发代理/.test(AI.explain(e3).text) && AI.explain(e3).detail === "", "直连发不出去：提示可能是跨域限制，要填转发代理");
    // 已知不允许网页直接调用的服务商（实测：火山方舟）：不说"可能"，直接说要代理；填了代理就不再这么说
    ok(AI.preset("doubao").cors === false && ["deepseek", "openai", "kimi"].every((id) => AI.preset(id).cors !== false), "预设里记着哪一家不允许网页直接调用");
    setup("doubao"); ok(AI.noCors(AI.conf()) === true, "豆包、没填代理：需要代理");
    const e4 = await fails(() => AI.sample()("问", {}));
    ok(e4.code === "network" && e4.nocors === true && /不允许网页直接调用/.test(AI.explain(e4).text) && !/可能/.test(AI.explain(e4).text) && /转发代理/.test(AI.explain(e4).text), "豆包直连发不出去：明说这家不允许网页直接调用", AI.explain(e4).text);
    const e5 = await fails(() => AI.models()); ok(e5.code === "network" && e5.nocors === true, "查模型列表时也一样");
    setup("doubao", null, "https://my-proxy.example.workers.dev"); ok(AI.noCors(AI.conf()) === false, "豆包、填了代理：不再提示");
    setup("doubao", { base: "https://ark.ap-southeast.bytepluses.com/api/v3" }); ok(AI.noCors(AI.conf()) === false, "接口地址改成了别的站点：没测过，不下结论");
  }

  section("流式回答");
  {
    setup("deepseek");
    const seen = [], thinks = [];
    handler = () => sse([":", think("先想一想，"), think("这个问题要用 Kelly 公式。"), ":", delta("第一步：$f^*="), delta("\\mu/\\sigma^2$。"), delta("\n\n第二步：回测。"), stop(), "[DONE]"], { step: 5, crlf: true });
    let r = await AI.sample()("问", { modelTier: "complex", onText: u => seen.push(u.text), onThink: n => thinks.push(n) });
    ok(r.text === "第一步：$f^*=\\mu/\\sigma^2$。\n\n第二步：回测。" && r.truncated === false && r.model === "deepseek-v4-pro" && r.provider === "deepseek", "拼出完整的正文（块切在汉字中间也不乱码）", JSON.stringify(r.text));
    ok(seen.length === 3 && seen[0] === "第一步：$f^*=" && seen[2] === r.text, "正文边到边报，每次给的是到目前为止的全文");
    ok(thinks.length === 2 && thinks[0] === 5 && thinks[1] === 5 + "这个问题要用 Kelly 公式。".length, "正文到来之前，报告已经想了多少字", thinks.join());
    // 思考写在正文里的 <think> 段
    seen.length = 0; thinks.length = 0;
    handler = () => sse([delta("<think>让我"), delta("想想</th"), delta("ink>\n\n答案是 "), delta("42。"), stop(), "[DONE]"]);
    r = await AI.sample()("问", { onText: u => seen.push(u.text), onThink: n => thinks.push(n) });
    ok(r.text === "答案是 42。" && seen.every(t => t.indexOf("think") < 0 && t.indexOf("让我") < 0) && seen[seen.length - 1] === "答案是 42。" && thinks.length >= 1, "夹在正文里的 <think> 段不显示，也不算进回答", JSON.stringify([r.text, seen, thinks]));
    ok(AI.visible("<think>a</think>b<THINK>c</THINK>d") === "bd" && AI.visible("x<think>没写完") === "x" && AI.visible("  \n正文") === "正文", "去思考段的几种情形");
    handler = () => answer("写到一半", { fin: "length" });
    r = await AI.sample()("问", {}); ok(r.truncated === true && r.text === "写到一半", "输出长度用完：标成被截断");
    // 不是流式的回答、标错类型的流式回答
    handler = () => jerr(200, { choices: [{ message: { role: "assistant", content: "<think>…</think>整段给的回答" }, finish_reason: "stop" }] });
    seen.length = 0; r = await AI.sample()("问", { onText: u => seen.push(u.text) }); ok(r.text === "整段给的回答" && seen.join() === "整段给的回答", "服务商不流式、整段返回：照样能用");
    handler = () => answer("标错了类型", { type: "application/json" });
    r = await AI.sample()("问", {}); ok(r.text === "标错了类型", "流式回答但内容类型标成了 JSON：照样能读");
    handler = () => jerr(200, { choices: [{ message: { content: [{ type: "text", text: "分" }, { type: "text", text: "块" }] }, finish_reason: "stop" }] });
    r = await AI.sample()("问", {}); ok(r.text === "分块", "正文是分块数组的写法");
    handler = () => sse([delta(""), stop(), "[DONE]"]);
    let e = await fails(() => AI.sample()("问", {})); ok(e.code === "empty_completion", "一个字都没回：报\"没有给出回答\"", e.code);
    handler = () => sse([stop("content_filter"), "[DONE]"]);
    e = await fails(() => AI.sample()("问", {})); ok(e.code === "refused", "被内容审核拦下");
    handler = () => sse([delta("写了一点"), { error: { message: "server overloaded", type: "overloaded_error" } }]);
    let n = 0; const h0 = handler; handler = c => { n++; return n === 1 ? h0(c) : answer("重来之后的全文"); };
    r = await AI.sample()("问", {}); ok(r.text === "重来之后的全文" && n === 2, "流到一半服务商报错：重试，结果以重来的那一次为准");
  }

  section("出错的归类");
  {
    setup("deepseek");
    const cases = [
      [401, { error: { message: "Authentication Fails, Your api key: ****abcd is invalid", type: "authentication_error" } }, "bad_auth", /密钥/],
      [403, { error: { message: "forbidden" } }, "bad_auth", /密钥/],
      [402, { error: { message: "Insufficient Balance" } }, "quota", /余额|充值/],
      [429, { error: { message: "You exceeded your current quota, please check your plan and billing details", type: "insufficient_quota" } }, "quota", /余额|充值/],
      [404, { error: { message: "The model `deepseek-v9` does not exist or you do not have access to it.", code: "model_not_found" } }, "bad_model", /获取模型列表/],
      [400, { error: { message: "Model Not Exist", type: "invalid_request_error" } }, "bad_model", /模型/],
      [404, { error: { code: "InvalidEndpointOrModel.NotFound", message: "The model or endpoint doubao-x does not exist or you do not have access to it." } }, "bad_model", /模型/],
      [404, "<html><body>404 page not found</body></html>", "bad_url", /接口地址/],
      [400, { error: { message: "This model's maximum context length is 65536 tokens. However, you requested 70000 tokens" } }, "prompt_too_large", /长度/],
      [400, { error: { message: "Content Exists Risk" } }, "refused", /审核/],
      [400, { error: { message: "messages: field required" } }, "invalid_request", /格式/],
      [504, "gateway timeout", "timeout", /没有回音/]
    ];
    for (const [status, body, code, re] of cases) {
      handler = () => (typeof body === "string" ? new Response(body, { status, headers: { "content-type": "text/html" } }) : jerr(status, body));
      const e = await fails(() => AI.sample()("问", { modelTier: "complex" })), ex = e ? AI.explain(e) : { text: "" };
      ok(e && e.code === code && re.test(ex.text) && /^HTTP \d+/.test(e.detail) && e.detail.indexOf("<") < 0, "HTTP " + status + " → " + code, e && (e.code + " | " + ex.text + " | " + e.detail));
    }
    // 每个会出现的代码都有一句人话
    const codes = ["unavailable", "no_provider", "no_base", "bad_base", "no_model", "no_key", "bad_key", "bad_proxy", "bad_auth", "quota", "rate_limited", "bad_model", "bad_url", "prompt_too_large", "refused", "invalid_request", "timeout", "upstream_error", "empty_completion", "proxy_refused", "network"];
    ok(codes.every(c => { const t = AI.explain({ code: c }).text; return t && t.indexOf("出错了") < 0 && /。$/.test(t); }), "每种错误都有一句说得清的话");
    ok(/出错了/.test(AI.explain({ code: "weird", message: "x" }).text), "不认识的错误也有话说");
    AI.save({ p: "", by: {} }); const e0 = await fails(() => Promise.resolve().then(() => { const s = AI.sample(); if (!s) throw { code: "unavailable" }; }));
    ok(e0.code === "unavailable", "没接入时拿不到调用的入口");
  }

  section("自动处理：去掉不认的参数、退避重试、换回主模型");
  {
    setup("deepseek", { model: "strict-model", fast: "" });
    let n = 0;
    handler = c => { n++; return c.body.thinking ? jerr(400, { error: { message: "Unrecognized request argument supplied: thinking", type: "invalid_request_error" } }) : answer("去掉之后成功"); };
    let r = await AI.sample()("问", {});
    ok(r.text === "去掉之后成功" && n === 2 && calls[0].body.thinking && !calls[1].body.thinking, "服务商点名不认 thinking：去掉重试");
    calls = []; await AI.sample()("问", {}); ok(calls.length === 1 && !calls[0].body.thinking, "这次打开页面期间记住了，不再多试一次");
    setup("doubao", { model: "old-model" }); n = 0;
    handler = c => { n++; return c.body.max_tokens || c.body.thinking ? jerr(400, { error: { message: "bad request" } }) : answer("都去掉之后成功"); };
    r = await AI.sample()("问", {}); ok(r.text === "都去掉之后成功" && n === 2 && !calls[1].body.max_tokens && !calls[1].body.thinking, "报错没点名：把可选的参数都去掉试一次");
    setup("openai"); n = 0;
    handler = () => { n++; return n === 1 ? jerr(429, { error: { message: "Rate limit reached" } }, { "retry-after": "1" }) : answer("限速之后重试成功"); };
    const t0 = Date.now(); r = await AI.sample()("问", {});
    ok(r.text === "限速之后重试成功" && n === 2 && Date.now() - t0 >= 900, "限速：等服务商说的时间再试", String(Date.now() - t0));
    n = 0; handler = () => { n++; return jerr(400, { error: { message: "messages: field required" } }); };
    let e = await fails(() => AI.sample()("问", {})); ok(e.code === "invalid_request" && n === 1, "和可选参数无关的 400：不重试");
    setup("deepseek"); n = 0;
    handler = c => { n++; return c.body.model === "deepseek-flash" ? jerr(404, { error: { message: "Model Not Exist" } }) : answer("主模型的回答"); };
    r = await AI.sample()("挑图", { modelTier: "quick" });
    ok(r.text === "主模型的回答" && r.model === "deepseek-v4-pro" && n === 2, "便宜的模型用不了：换回主模型");
  }

  section("Claude：Messages 接口");
  {
    const ev = (type, o) => Object.assign({ type }, o || {});
    const text = (i, t) => ev("content_block_delta", { index: i, delta: { type: "text_delta", text: t } });
    const claude = (parts, o) => sse([ev("message_start", { message: { id: "msg_1", role: "assistant", content: [] } }), ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } })]
      .concat((parts || ["好的"]).map(t => text(0, t)), [ev("content_block_stop", { index: 0 }), ev("message_delta", { delta: { stop_reason: (o && o.fin) || "end_turn" } }), ev("message_stop")]), o);
    setup("claude"); handler = () => claude(["你", "好"]);
    let s = AI.sample(), r = await s("你好", { modelTier: "default" }), c = calls[0];
    ok(c.url === "https://api.anthropic.com/v1/messages" && c.method === "POST" && c.headers["x-api-key"] === KEY && !("Authorization" in c.headers) && c.headers["anthropic-version"] === "2023-06-01" && c.headers["anthropic-dangerous-direct-browser-access"] === "true", "发到 /v1/messages：x-api-key、anthropic-version、允许网页直接调用的请求头", c.url);
    ok(c.credentials === "omit" && c.referrerPolicy === "no-referrer", "不带 cookie，不带来源页");
    ok(c.body.model === "claude-opus-5-5" && c.body.stream === true && c.body.max_tokens === 32000 && !("output_config" in c.body) && !("thinking" in c.body) && !("tools" in c.body) && c.body.messages[0].content === "你好", "默认：Opus 5.5、流式、给出最大输出；不带 effort，用模型自己的默认值", JSON.stringify(c.body));
    ok(r.text === "你好" && r.provider === "claude" && r.model === "claude-opus-5-5" && r.truncated === false && r.searches === 0, "拼出正文");
    calls = []; await s("写一条规则", { modelTier: "complex" });
    ok(calls[0].body.output_config && calls[0].body.output_config.effort === "high" && calls[0].body.max_tokens === 64000, "写规则（开着深度思考）：effort high，最大输出放到 64000");
    calls = []; await s("挑图", { modelTier: "quick" });
    ok(calls[0].body.model === "claude-haiku-5-5" && calls[0].body.output_config.effort === "low" && calls[0].body.max_tokens === 8192, "做小事：Haiku 5.5，effort low");
    setup("claude", { think: false }); s = AI.sample(); await s("写", { modelTier: "complex" });
    ok(!("output_config" in calls[0].body), "设置里关了深度思考：写规则也用默认的 effort（5.5 代的模型思考关不掉）");
    // 思考、几段正文、服务商那边的搜索
    const seen = [], thinks = [], searched = [];
    handler = () => sse([
      ev("message_start", { message: {} }), "event: ping",
      ev("content_block_start", { index: 0, content_block: { type: "thinking", thinking: "" } }), ev("content_block_delta", { index: 0, delta: { type: "thinking_delta", thinking: "先搜一搜" } }), ev("content_block_stop", { index: 0 }),
      ev("content_block_start", { index: 1, content_block: { type: "text", text: "" } }), text(1, "我先搜一下。"), ev("content_block_stop", { index: 1 }),
      ev("content_block_start", { index: 2, content_block: { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: {} } }),
      ev("content_block_delta", { index: 2, delta: { type: "input_json_delta", partial_json: "{\"query\": \"布伦特" } }), ev("content_block_delta", { index: 2, delta: { type: "input_json_delta", partial_json: "原油 日价 csv\"}" } }), ev("content_block_stop", { index: 2 }),
      ev("content_block_start", { index: 3, content_block: { type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: [{ type: "web_search_result", title: "Brent", url: "https://example.org/brent.csv" }, { type: "web_search_result", title: "EIA", url: "https://www.eia.gov/" }] } }), ev("content_block_stop", { index: 3 }),
      ev("content_block_start", { index: 4, content_block: { type: "text", text: "" } }), text(4, "{\"candidates\": []"), text(4, "}"), ev("content_block_stop", { index: 4 }),
      ev("message_delta", { delta: { stop_reason: "end_turn" } }), ev("message_stop")], { step: 9, crlf: true });
    setup("claude"); calls = [];
    r = await AI.sample()("找数据", { webSearch: 4, onText: u => seen.push(u.text), onThink: n => thinks.push(n), onSearch: x => searched.push(x) });
    ok(calls[0].body.tools && calls[0].body.tools.length === 1 && calls[0].body.tools[0].type === "web_search_20250305" && calls[0].body.tools[0].name === "web_search" && calls[0].body.tools[0].max_uses === 4, "要搜索：带上 web_search 工具和次数上限", JSON.stringify(calls[0].body.tools));
    ok(r.text === "我先搜一下。\n\n{\"candidates\": []}" && r.searches === 1 && !r.searchOff, "搜索前后的几段正文连起来，中间空一行；记下搜了几次", JSON.stringify(r.text));
    ok(thinks.join() === "4" && seen[seen.length - 1] === r.text, "正文之前报告想了多少字；正文边到边报");
    ok(searched.length === 2 && searched[0].query === "布伦特原油 日价 csv" && searched[0].n === 1 && searched[1].results === 2, "搜了什么、搜到几条，都报给页面", JSON.stringify(searched));
    calls = []; handler = () => claude(["好"]); await AI.sample()("找", { webSearch: 3 });
    setup("deepseek"); calls = []; handler = () => answer("好"); await AI.sample()("找", { webSearch: 3 });
    ok(!("tools" in calls[0].body) && AI.canSearch() === false, "别家：要搜索也不带工具（它们不会在服务商那边搜）");
    setup("claude"); ok(AI.canSearch() === true, "接的是 Claude：能搜索");
    // 搜索没开通、effort 不认、max_tokens 太大：按报错改了再试，并记住
    let n = 0;
    handler = c => { n++; return c.body.tools ? jerr(400, { type: "error", error: { type: "invalid_request_error", message: "Web search is not enabled for your organization." } }) : claude(["不搜也给了"]); };
    r = await AI.sample()("找", { webSearch: 3 });
    ok(r.text === "不搜也给了" && n === 2 && r.searchOff === true, "组织没开通网络搜索：不搜再试一次，并告诉页面没能搜", JSON.stringify(r));
    calls = []; r = await AI.sample()("找", { webSearch: 3 }); ok(calls.length === 1 && !calls[0].body.tools && r.searchOff === true, "这次打开页面期间记住了");
    setup("claude", { model: "claude-old-1" }); n = 0;
    handler = c => { n++; return c.body.output_config ? jerr(400, { type: "error", error: { type: "invalid_request_error", message: "output_config.effort: Extra inputs are not permitted" } }) : c.body.max_tokens > 8192 ? jerr(400, { type: "error", error: { type: "invalid_request_error", message: "max_tokens: 64000 > 8192, which is the maximum allowed number of output tokens for claude-old-1" } }) : claude(["老模型"]); };
    r = await AI.sample()("写", { modelTier: "complex" });
    ok(r.text === "老模型" && n === 3 && calls[calls.length - 1].body.max_tokens === 8192 && !calls[calls.length - 1].body.output_config, "老模型：去掉 effort、把最大输出调到 8192", n + " " + JSON.stringify(calls[calls.length - 1].body));
    // 出错的归类
    setup("claude");
    const cases = [
      [401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, "bad_auth"],
      [400, { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." } }, "quota"],
      [404, { type: "error", error: { type: "not_found_error", message: "model: claude-opus-9" } }, "bad_model"],
      [429, { type: "error", error: { type: "rate_limit_error", message: "Number of request tokens has exceeded your per-minute rate limit" } }, "rate_limited"],
      [413, { type: "error", error: { type: "request_too_large", message: "Request exceeds the maximum allowed number of bytes." } }, "upstream_error"]
    ];
    for (const [status, body, code] of cases) {
      handler = () => jerr(status, body, status === 429 ? { "retry-after": "1" } : null);
      const e = await fails(() => AI.sample()("问", {}));
      ok(e && e.code === code, "Claude HTTP " + status + " → " + code, e && (e.code + " | " + e.detail));
    }
    n = 0; handler = () => { n++; return n === 1 ? jerr(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }) : claude(["过载之后重试成功"]); };
    r = await AI.sample()("问", {}); ok(r.text === "过载之后重试成功" && n === 2, "529 过载：退避后重试");
    n = 0; handler = () => { n++; return n === 1 ? sse([ev("message_start", { message: {} }), ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }), text(0, "写了一点"), ev("error", { error: { type: "overloaded_error", message: "Overloaded" } })]) : claude(["重来的全文"]); };
    r = await AI.sample()("问", {}); ok(r.text === "重来的全文" && n === 2, "流到一半报过载：重试");
    handler = () => claude(["写到一半"], { fin: "max_tokens" }); r = await AI.sample()("问", {}); ok(r.truncated === true, "max_tokens 用完：标成被截断");
    handler = () => claude(["我不"], { fin: "refusal" }); let e = await fails(() => AI.sample()("问", {})); ok(e && e.code === "refused", "stop_reason 是 refusal：报被拒绝", e && e.code);
    handler = () => jerr(200, { type: "message", content: [{ type: "text", text: "整段" }, { type: "server_tool_use", id: "x", name: "web_search", input: { query: "q" } }, { type: "text", text: "给的" }], stop_reason: "end_turn" });
    r = await AI.sample()("问", {}); ok(r.text === "整段\n\n给的" && r.searches === 1, "不流式、整段返回：照样能用");
    // 测试连接、模型列表、转发代理
    handler = () => claude(["OK"]); calls = [];
    r = await AI.test(); ok(r.text === "OK" && r.model === "claude-opus-5-5" && calls[0].body.output_config.effort === "low" && calls[0].body.max_tokens === 8192, "测试连接：effort low，很快回话");
    handler = () => jerr(200, { data: [{ type: "model", id: "claude-opus-5-5", display_name: "Claude Opus 5.5" }, { type: "model", id: "claude-haiku-5-5" }, { type: "model", id: "claude-sonnet-5-5" }], has_more: false });
    calls = []; const ids = await AI.models();
    ok(ids.join() === "claude-haiku-5-5,claude-opus-5-5,claude-sonnet-5-5" && calls[0].url === "https://api.anthropic.com/v1/models?limit=100" && calls[0].headers["x-api-key"] === KEY && calls[0].headers["anthropic-dangerous-direct-browser-access"] === "true", "模型列表：/v1/models，同样的请求头", calls[0].url);
    setup("claude", null, "https://my-proxy.example.workers.dev"); handler = () => claude(["好"]); await AI.sample()("问", {});
    ok(calls[0].url === "https://my-proxy.example.workers.dev/https://api.anthropic.com/v1/messages" && calls[0].headers["x-api-key"] === KEY, "也可以经转发代理", calls[0].url);
    const lab = AI.label(); ok(lab.short === "Claude" && lab.model === "claude-opus-5-5", "界面上的简称是 Claude");
  }

  section("停止与超时");
  {
    setup("deepseek");
    handler = () => sse([delta("一"), delta("二"), delta("三"), delta("四"), delta("五"), delta("六"), stop(), "[DONE]"], { delay: 25, step: 16 });
    const ctl = new AbortController(), seen = []; setTimeout(() => ctl.abort(), 120);
    let e = await fails(() => AI.sample()("问", { signal: ctl.signal, onText: u => seen.push(u.text) }));
    ok(e && e.code === "cancelled" && seen.length >= 1, "点了停止：中断，报\"已停止\"", e && e.code);
    const c2 = new AbortController(); c2.abort(); e = await fails(() => AI.sample()("问", { signal: c2.signal })); ok(e.code === "cancelled", "还没发出去就停了");
    handler = () => sse([delta("慢"), delta("慢"), delta("来"), stop(), "[DONE]"], { delay: 60, step: 8 });
    e = await fails(() => AI.sample()("问", { timeout: 150 })); ok(e.code === "timeout" && /没有回音/.test(AI.explain(e).text), "等得太久：放弃", e.code);
  }

  section("测试连接与模型列表");
  {
    setup("kimi"); handler = () => answer("OK");
    let r = await AI.test();
    ok(r.text === "OK" && r.model === "kimi-k3" && r.ms >= 0 && r.viaProxy === false && calls[0].body.reasoning_effort === "low" && /Connection test/.test(calls[0].body.messages[0].content), "测试连接：发一句最短的话");
    // 用还没保存的草稿测试
    calls = []; r = await AI.test({ p: "deepseek", by: { deepseek: { key: "sk-draft-000" } } });
    ok(calls[0].headers.Authorization === "Bearer sk-draft-000" && calls[0].url.indexOf("api.deepseek.com") > 0 && AI.label().short === "Kimi", "测试用的是设置面板里的草稿，不动已保存的设置");
    let e = await fails(() => AI.test({ p: "deepseek", by: { deepseek: {} } })); ok(e.code === "no_key" && calls.length === 1, "草稿没填密钥：不发请求");
    handler = c => jerr(200, { object: "list", data: [{ id: "deepseek-v4-pro" }, { id: "deepseek-flash" }, { id: "text-embedding-3" }, { id: "deepseek-flash" }, { id: "tts-1" }, { id: "doubao-seedream-4" }] });
    calls = []; const ids = await AI.models({ p: "deepseek", by: { deepseek: { key: KEY } } });
    ok(ids.join() === "deepseek-flash,deepseek-v4-pro" && calls[0].url === "https://api.deepseek.com/models" && calls[0].method === "GET" && calls[0].headers.Authorization === "Bearer " + KEY && !("Content-Type" in calls[0].headers), "模型列表：去重、排序、去掉非对话模型", ids.join());
    handler = () => jerr(401, { error: { message: "invalid api key" } });
    e = await fails(() => AI.models({ p: "deepseek", by: { deepseek: { key: KEY } } })); ok(e.code === "bad_auth", "查模型列表时密钥不对");
  }
  console.warn = warn;
  done();
})().catch(e => { console.log("CRASH", e && e.stack || e); process.exit(1); });
