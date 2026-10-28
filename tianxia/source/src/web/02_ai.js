/* ===================== 网页版 · AI 推演接口（玩家自带 API 密钥） =====================
 * 在 claude.ai 里，推演层（src/llm.js）经页面运行时的 sample 能力调用 Claude。放到普通网站上时没有这个能力，这里提供同样接口的替代品：
 *   window.claude.use('sample') → TXAI.sample()：sample.json(input, {modelTier, signal, onText}) 返回解析好的 JSON 对象，出错时抛出 {code, message, detail}。
 * 玩家在“设置 → AI 推演接口”里选服务商、填自己的 API 密钥：ChatGPT（OpenAI）、DeepSeek、豆包（火山方舟）、通义千问、Kimi、智谱 GLM、
 * Gemini、Claude（Anthropic API）、OpenRouter、硅基流动、Ollama（本机），或任何兼容 OpenAI Chat Completions 的接口。
 *   · 密钥只存在本机浏览器（localStorage 'tianxia.ai'），请求从浏览器直接发给所选服务商；填了转发代理时经代理转发。
 *     不经过联机中继，也不会发给其他玩家。接口地址与代理地址必须是 http(s):// 开头、而且不能指向本网站（免得把密钥发给本站）。
 *   · 有的服务商不允许网页直接调用（浏览器的跨域限制 CORS），要经转发代理：tianxia/ai-proxy.mjs（Cloudflare Worker 或本机 Node）。
 *     代理地址的用法：<代理>/<完整接口地址>，例如 https://ai-proxy.xxx.workers.dev/https://api.deepseek.com/chat/completions
 *   · 先请求 JSON 模式、关闭深度思考（更快）；服务商报错点名不认这些参数（HTTP 400）时去掉重试，重试成功后才记住“这个模型不支持”。
 *     回复里的代码块、<think> 段与前后多余文字都能容忍。
 *   · 同时最多 3 个请求，其余排队；429 / 5xx / 流中途断开时退避后重试；单次请求最长 4 分钟。
 *   · 错误里服务商的原话（detail）只在本机的设置面板里显示，不写进 errText（errText 会进入战报与聊天记录，联机时会同步给其他玩家）。
 * 模型名称变化很快（2026 年 10 月的默认值见 PRE），设置里的“获取模型列表”会向服务商查询当前可用的模型。
 * 一键接入（不用复制密钥）：OpenRouter 的 OAuth PKCE 授权，见下面的 oauthStart / oauthFinish 与 src/web/auth.html。
 */
window.TXAI = (() => {
  'use strict';
  const LSK = 'tianxia.ai';
  const NOTHINK = { thinking: { type: 'disabled' } };
  // n 名称 [中, 英]；b 界面文字里代替“Claude”的简称；base 接口地址；model 默认模型；models 候选；key 申请密钥的网址；fast 快速推演用的模型；
  // cors 1 = 可以从网页直接调用，0 = 不行（要转发代理），缺省 = 不确定；fastBody 关闭深度思考的请求参数；maxTok 默认最大输出；kind 'anthropic' = Claude 原生接口
  const PRE = [
    { id: 'openai', n: ['ChatGPT（OpenAI）', 'ChatGPT (OpenAI)'], b: ['ChatGPT', 'ChatGPT'], base: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-5.5', 'gpt-5.2', 'gpt-4o-mini'], key: 'https://platform.openai.com/api-keys', cors: 1 },
    { id: 'deepseek', n: ['DeepSeek（深度求索）', 'DeepSeek'], b: ['DeepSeek', 'DeepSeek'], base: 'https://api.deepseek.com', model: 'deepseek-flash', models: ['deepseek-flash', 'deepseek-v4-pro'], key: 'https://platform.deepseek.com/api_keys', cors: 0, fastBody: NOTHINK },
    { id: 'doubao', n: ['豆包（火山方舟）', 'Doubao (Volcengine Ark)'], b: ['豆包', 'Doubao'], base: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-2-1-lite-260915', models: ['doubao-seed-2-1-lite-260915', 'doubao-seed-2-1-pro-260915', 'doubao-seed-2-1-turbo-260628', 'doubao-seed-evolving'], key: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey', fastBody: NOTHINK, maxTok: 8192 },
    { id: 'qwen', n: ['通义千问（阿里云百炼）', 'Qwen (Alibaba Cloud)'], b: ['通义千问', 'Qwen'], base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.6-plus', models: ['qwen3.6-plus', 'qwen3.5-flash', 'qwen3-max'], key: 'https://bailian.console.aliyun.com/?apiKey=1', fastBody: { enable_thinking: false } },
    { id: 'kimi', n: ['Kimi（月之暗面）', 'Kimi (Moonshot AI)'], b: ['Kimi', 'Kimi'], base: 'https://api.moonshot.cn/v1', model: 'kimi-k2.6', models: ['kimi-k2.6', 'kimi-k3'], key: 'https://platform.moonshot.cn/console/api-keys', fastBody: NOTHINK },
    { id: 'glm', n: ['智谱 GLM', 'Zhipu GLM'], b: ['智谱', 'GLM'], base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.7-flash', models: ['glm-4.7-flash', 'glm-4.7', 'glm-5'], key: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys', fastBody: NOTHINK, maxTok: 8192 },
    { id: 'gemini', n: ['Gemini（Google）', 'Gemini (Google)'], b: ['Gemini', 'Gemini'], base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.1-flash-lite', models: ['gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-3.1-pro-preview'], key: 'https://aistudio.google.com/apikey', cors: 1 },
    { id: 'claude', kind: 'anthropic', n: ['Claude（Anthropic API）', 'Claude (Anthropic API)'], b: ['Claude', 'Claude'], base: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5-5', models: ['claude-sonnet-5-5', 'claude-haiku-4-5-20251001', 'claude-opus-5-5'], fast: 'claude-haiku-4-5-20251001', key: 'https://console.anthropic.com/settings/keys', cors: 1, maxTok: 8192 },
    { id: 'openrouter', n: ['OpenRouter（多家模型，含 DeepSeek）', 'OpenRouter (many models, incl. DeepSeek)'], b: ['OpenRouter', 'OpenRouter'], base: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4.1-mini', models: ['openai/gpt-4.1-mini', 'deepseek/deepseek-chat'], key: 'https://openrouter.ai/keys', cors: 1 },
    { id: 'siliconflow', n: ['硅基流动 SiliconFlow', 'SiliconFlow'], b: ['硅基流动', 'SiliconFlow'], base: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3', models: ['deepseek-ai/DeepSeek-V3'], key: 'https://cloud.siliconflow.cn/account/ak' },
    { id: 'ollama', n: ['Ollama（本机模型）', 'Ollama (local models)'], b: ['Ollama', 'Ollama'], base: 'http://localhost:11434/v1', model: 'qwen3:8b', models: ['qwen3:8b', 'qwen2.5:7b', 'llama3.1:8b'], noKey: 1, cors: 1 },
    { id: 'custom', n: ['其他（OpenAI 兼容接口）', 'Other (OpenAI-compatible API)'], b: ['AI', 'AI'], base: '', model: '', models: [] },
  ];
  const byId = id => PRE.find(p => p.id === id) || null;
  const clone = o => JSON.parse(JSON.stringify(o));
  const trimUrl = s => String(s || '').trim().replace(/\/+$/, '');
  // 本机与局域网地址（Ollama、LM Studio 等）：不经过转发代理（云端的代理连不到这些地址），也可以不填密钥
  const LOCAL = /^(https?:\/\/)?(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[::1\]|0\.0\.0\.0|[^/:?#\s]+\.local)(:\d+)?(\/|$)/i;
  const isLocal = u => LOCAL.test(String(u || '').trim());
  // 规范网址：补上 https://（本机与局域网补 http://）；接口地址去掉误贴的 /chat/completions 等；其他协议、坏网址返回空串
  function normUrl(s, isBase) {
    s = trimUrl(s); if (!s || s[0] === '/') return ''; // 相对路径会指向本网站
    if (!/^https?:\/\//i.test(s)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^/:]+:\d+(\/|$)/.test(s)) return ''; // javascript:、ftp:// 等
      s = (isLocal(s) ? 'http://' : 'https://') + s.replace(/^\/+/, '');
    }
    if (isBase) s = trimUrl(s.replace(/\/(chat\/completions|completions|messages)$/i, ''));
    try { const u = new URL(s); if (!/^https?:$/.test(u.protocol) || !u.hostname || u.username || u.password) return ''; } catch (e) { return ''; }
    return s;
  }
  const sameSite = u => { try { return new URL(u).origin === location.origin; } catch (e) { return true; } };
  const ZW = /[\s\u{200b}-\u{200d}\u{2060}\u{feff}]/gu; // 复制密钥时常夹带的空白与零宽字符

  /* ---------- 设置（只存在本机） ---------- */
  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(LSK) || 'null');
      if (o && typeof o === 'object') return { p: byId(o.p) ? o.p : '', by: o.by && typeof o.by === 'object' ? o.by : {}, proxy: typeof o.proxy === 'string' ? o.proxy : '' };
    } catch (e) { }
    return { p: '', by: {}, proxy: '' };
  }
  let CFG = load();
  const subs = [];
  const fire = () => { for (const f of subs) try { f(); } catch (e) { } };
  const CAP = {}; // 服务商+模型 → 已知不支持的参数（本次打开页面内有效；改设置时清空）
  function save(c) {
    CFG = { p: byId(c && c.p) ? c.p : '', by: clone((c && c.by) || {}), proxy: trimUrl(c && c.proxy) };
    try { localStorage.setItem(LSK, JSON.stringify(CFG)); } catch (e) { }
    for (const k of Object.keys(CAP)) delete CAP[k];
    fire();
  }
  try { window.addEventListener('storage', e => { if (e.key === LSK) { CFG = load(); fire(); } }); } catch (e) { } // 另一个标签页改了设置
  // 合并预设与玩家填写的值；baseBad / proxyBad / keyBad 标出填错的地方
  function conf(c, pid) {
    c = c || CFG; pid = pid || c.p; const P = byId(pid); if (!P) return null;
    const u = (c.by && c.by[pid]) || {};
    const rawBase = trimUrl(u.base) || P.base || '', base = normUrl(rawBase, true), rawProxy = trimUrl(c.proxy), proxy = normUrl(rawProxy, false);
    const key = String(u.key || '').replace(ZW, '');
    return { id: pid, P, kind: P.kind || 'openai', key, keyBad: !!key && !/^[\x21-\x7e]+$/.test(key),
      model: String(u.model || '').trim() || P.model || '', fast: String(u.fast || '').trim() || P.fast || '',
      base: base && !sameSite(base) ? base : '', baseBad: !!rawBase && (!base || sameSite(base)),
      proxy: proxy && !sameSite(proxy) ? proxy : '', proxyBad: !!rawProxy && (!proxy || sameSite(proxy)),
      think: !!u.think, maxTok: Math.max(0, Math.round(+u.maxTok || 0)) || P.maxTok || 0 };
  }
  const usable = k => !!(k && k.base && k.model && !k.keyBad && !k.proxyBad && (k.key || k.P.noKey || isLocal(k.base)));
  const viaProxy = k => !!(k.proxy && !isLocal(k.base));
  const url = (k, path) => (viaProxy(k) ? k.proxy + '/' : '') + k.base + path;
  function headers(k, json) {
    const h = {}; if (json) h['Content-Type'] = 'application/json';
    if (k.kind === 'anthropic') { if (k.key) h['x-api-key'] = k.key; h['anthropic-version'] = '2023-06-01'; h['anthropic-dangerous-direct-browser-access'] = 'true'; }
    else if (k.key) h.Authorization = 'Bearer ' + k.key;
    if (k.id === 'openrouter') { h['HTTP-Referer'] = location.origin + location.pathname; h['X-Title'] = 'Tianxia'; }
    return h;
  }

  /* ---------- 错误 ---------- */
  const clean = s => String(s || '').replace(/[<>\u{0}-\u{8}\u{b}\u{c}\u{e}-\u{1f}]/gu, ' ').replace(/\s+/g, ' ').trim();
  // message 只放错误代码：errText 对不认识的代码会显示 message，而 errText 的结果会进入战报、聊天记录（联机时同步给其他玩家）
  function mkErr(code, detail, extra) { const e = { code, message: code }; if (detail) e.detail = clean(detail).slice(0, 240); return Object.assign(e, extra || {}); }
  const abortErr = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
  async function httpErr(res) {
    let txt = ''; try { txt = await res.text(); } catch (e) { }
    let j = null; try { j = JSON.parse(txt); } catch (e) { }
    if (Array.isArray(j)) j = j[0]; // Gemini 兼容接口的错误是数组
    const er = j && typeof j === 'object' ? (j.error !== undefined ? j.error : j.Error !== undefined ? j.Error : j) : null;
    let m = er ? (typeof er === 'string' ? er : er.message || er.msg || er.Message || j.message || j.msg || '') : '';
    const ec = er && typeof er === 'object' ? String(er.code || er.type || er.Code || er.status || '') : '';
    if (!m) m = txt.replace(/<[^>]+>/g, ' ');
    m = clean(m).slice(0, 300);
    const s = res.status, all = m + ' ' + ec, proxy = res.headers.get('x-tianxia-proxy') === '1';
    const code = proxy ? 'proxy_refused' // 转发代理自己拒绝（网站或服务商不在允许名单里）
      : /content.{0,12}(risk|filter|policy)|data_inspection|inappropriate|sensitive.?content|high.?risk|flagged|moderation|prohibited|blocked due to|敏感|违规|不安全|审核/i.test(all) ? 'refused'
      : s === 402 || /insufficient[_ ]?(balance|quota|funds|credit)|exceeded your current quota|quota.?exceeded|余额|欠费|arrearage|overdue|billing/i.test(all) ? 'quota'
      : s === 401 || s === 403 || (s < 500 && /api[_ -]?key|API_KEY_INVALID|unauthori[sz]ed|authenticat|invalid.?token/i.test(all)) ? 'not_granted'
      : s === 429 ? 'rate_limited'
      : /context.?length|maximum context|too many tokens|prompt is too long|input.{0,20}too long|超出.{0,6}长度/i.test(all) ? 'prompt_too_large'
      : /model/i.test(all) && (s === 404 || /not.?(exist|found)|does not exist|invalid model|unknown model|not.?activated|NotOpen|未开通|不存在|no access/i.test(all)) ? 'bad_model'
      : s === 404 || s === 405 ? 'bad_url'
      : s === 400 || s === 422 ? 'invalid_request'
      : s === 408 || s === 504 ? 'timeout' : 'upstream_error';
    const ra = +(res.headers.get('retry-after') || 0);
    return mkErr(code, 'HTTP ' + s + (m ? ' · ' + m : ''), { status: s, raw: m, retryAfter: ra > 0 ? Math.min(20000, Math.max(1000, ra * 1000)) : 0 });
  }

  /* ---------- 请求 ---------- */
  const SYS = 'You are the simulation engine of a grand-strategy wargame. Follow the instructions in the user messages exactly. Reply with one valid JSON object and nothing else: no Markdown, no code fences, no text before or after it.';
  // 输入（字符串或 [{role, content}]）→ 交替的 user/assistant 消息（有的接口不接受连续两条同角色消息）
  function msgs(input) {
    const a = typeof input === 'string' ? [{ role: 'user', content: input }] : Array.isArray(input) ? input : [{ role: 'user', content: String(input) }];
    const out = [];
    for (const x of a) {
      if (!x) continue;
      const role = x.role === 'assistant' ? 'assistant' : 'user', content = typeof x.content === 'string' ? x.content : JSON.stringify(x.content);
      const l = out[out.length - 1]; if (l && l.role === role) l.content += '\n\n' + content; else out.push({ role, content });
    }
    if (!out.length || out[0].role !== 'user') out.unshift({ role: 'user', content: '(begin)' });
    return out;
  }
  async function post(k, path, body, sig) {
    let res;
    try { res = await fetch(url(k, path), { method: 'POST', headers: headers(k, true), body: JSON.stringify(body), signal: sig, credentials: 'omit', referrerPolicy: 'no-referrer' }); }
    catch (e) { if (e && e.name === 'AbortError') throw e; throw mkErr('network', String((e && e.message) || e), { proxy: viaProxy(k) }); } // 跨域被拦、网络不通、代理连不上都在这里
    if (!res.ok) throw await httpErr(res);
    return res;
  }
  // SSE 解析（OpenAI 兼容格式与 Anthropic 格式）；逐行喂入
  function sse(anth, onText) {
    let text = '', fin = null, err = null;
    return {
      line(l) {
        if (!l.startsWith('data:')) return; // 注释（: keep-alive）与 event: 行
        const d = l.slice(5).trim(); if (!d || d === '[DONE]') return;
        let o; try { o = JSON.parse(d); } catch (e) { return; }
        if (o.error || o.type === 'error') { const er = o.error || {}; err = mkErr(/overload|rate/i.test(String(er.type || er.code || '')) ? 'rate_limited' : 'upstream_error', String(er.message || er.type || 'stream error'), { retry: true }); return; }
        let dt = '';
        if (anth) {
          if (o.type === 'content_block_delta' && o.delta && o.delta.type === 'text_delta') dt = o.delta.text || '';
          else if (o.type === 'message_delta' && o.delta && o.delta.stop_reason) fin = o.delta.stop_reason === 'max_tokens' ? 'length' : o.delta.stop_reason;
        } else {
          const c = o.choices && o.choices[0];
          if (c) { const dl = c.delta || c.message || {}; if (typeof dl.content === 'string') dt = dl.content; if (c.finish_reason) fin = c.finish_reason; }
        }
        if (dt) { text += dt; if (onText) try { onText({ text, delta: dt }); } catch (e) { } }
      },
      get err() { return err; },
      res: () => ({ text, fin, stream: true }),
    };
  }
  async function readStream(res, anth, onText) {
    const p = sse(anth, onText), rd = res.body.getReader(), dec = new TextDecoder();
    let buf = '', done = false;
    try {
      for (;;) {
        const r = await rd.read(); if (r.done) { done = true; break; }
        buf += dec.decode(r.value, { stream: true });
        let i; while ((i = buf.indexOf('\n')) >= 0) { p.line(buf.slice(0, i).replace(/\r$/, '')); buf = buf.slice(i + 1); if (p.err) throw p.err; }
      }
      buf += dec.decode(); if (buf.trim()) p.line(buf.trim());
      if (p.err) throw p.err;
    } catch (e) {
      if (e && (e.name === 'AbortError' || e.code)) throw e;
      throw mkErr('upstream_error', 'stream interrupted: ' + String((e && e.message) || e), { retry: true });
    } finally { if (!done) try { rd.cancel().catch(() => { }); } catch (e) { } }
    return p.res();
  }
  // 发一次请求。f：json = JSON 模式，extra = 关闭深度思考的参数，mt = 最大输出，stream = 流式
  async function once(k, model, m, f, sig, onText) {
    const anth = k.kind === 'anthropic';
    let body;
    if (anth) body = { model, max_tokens: (f.mt && k.maxTok) || 8192, system: SYS, messages: m };
    else {
      body = { model, messages: [{ role: 'system', content: SYS }].concat(m) };
      if (f.json) body.response_format = { type: 'json_object' };
      if (f.extra && k.P.fastBody) Object.assign(body, clone(k.P.fastBody));
      if (f.mt && k.maxTok) body.max_tokens = k.maxTok;
    }
    if (f.stream) body.stream = true;
    const res = await post(k, anth ? '/messages' : '/chat/completions', body, sig);
    const ct = res.headers.get('content-type') || '';
    if (res.body && /event-stream/i.test(ct)) return readStream(res, anth, onText);
    const txt = await res.text();
    if (/^\s*(data|event):/.test(txt)) { const p = sse(anth, onText); for (const l of txt.split('\n')) { p.line(l.replace(/\r$/, '')); if (p.err) throw p.err; } return p.res(); } // 流式回复但标错了类型
    let j; try { j = JSON.parse(txt); } catch (e) { throw mkErr('upstream_error', 'not JSON: ' + txt.slice(0, 160)); }
    if (j && j.error && !j.choices && !j.content) { const er = j.error; throw mkErr('upstream_error', String((er && (er.message || er.msg)) || er)); }
    if (anth) return { text: (j.content || []).filter(b => b && b.type === 'text').map(b => b.text).join(''), fin: j.stop_reason === 'max_tokens' ? 'length' : j.stop_reason };
    const c = j.choices && j.choices[0];
    let t = c && c.message ? c.message.content : c && c.text;
    if (Array.isArray(t)) t = t.map(x => (typeof x === 'string' ? x : (x && x.text) || '')).join('');
    if (t && onText) try { onText({ text: String(t), delta: String(t) }); } catch (e) { }
    return { text: String(t || ''), fin: c && c.finish_reason };
  }
  const wait = (ms, sig) => new Promise((ok, no) => {
    if (sig && sig.aborted) { no(abortErr()); return; }
    const t = setTimeout(ok, ms);
    if (sig) sig.addEventListener('abort', () => { clearTimeout(t); no(abortErr()); }, { once: true });
  });
  async function call(k, model, input, o) {
    const m = msgs(input), ck = k.id + '|' + k.base + '|' + model, cap = CAP[ck] || (CAP[ck] = {});
    const f = { json: k.kind !== 'anthropic' && cap.json !== false, extra: !!(k.P.fastBody && !k.think) && cap.extra !== false, mt: !!k.maxTok && cap.mt !== false, stream: !!o.onText && cap.stream !== false };
    const dropped = []; let retries = 0, blind = false;
    for (let n = 0; n < 8; n++) {
      let r;
      try { r = await once(k, model, m, f, o.sig, o.onText); }
      catch (e) {
        if (!e || e.name === 'AbortError') throw e;
        if ((e.status === 400 || e.status === 422) && e.code === 'invalid_request') { // 参数不被接受：报错点名哪个就去掉哪个；没点名就把可选参数都去掉试一次
          const t = String(e.raw || '');
          const named = f.json && /response_format|json/i.test(t) ? 'json' : f.extra && /thinking|reasoning/i.test(t) ? 'extra'
            : f.mt && /max_tokens|max_completion_tokens|maximum.{0,20}tokens|tokens.{0,20}(range|exceed|large)/i.test(t) ? 'mt' : f.stream && /\bstream/i.test(t) ? 'stream' : null;
          if (named) { f[named] = false; dropped.push(named); continue; }
          if (!blind && (f.json || f.extra || f.mt)) { blind = true; for (const x of ['json', 'extra', 'mt']) if (f[x]) { f[x] = false; dropped.push(x); } continue; }
        }
        if (retries < 2 && (e.retry || e.code === 'rate_limited' || (e.code === 'upstream_error' && e.status >= 500))) { retries++; await wait(e.retryAfter || (retries === 1 ? 2500 : 7000), o.sig); continue; }
        throw e;
      }
      if (r.stream && r.fin == null && !parseJSON(r.text) && retries < 2) { retries++; continue; } // 流没收到结束标记就断了：重试
      for (const x of dropped) cap[x] = false; // 去掉之后成功了：记住这个模型不支持
      return r;
    }
    throw mkErr('invalid_request');
  }

  /* ---------- 解析 JSON（容忍代码块、<think> 段和前后多余文字） ---------- */
  function balanced(s, i) {
    let d = 0, q = false, es = false;
    for (let p = i; p < s.length; p++) {
      const c = s[p];
      if (q) { if (es) es = false; else if (c === '\\') es = true; else if (c === '"') q = false; continue; }
      if (c === '"') q = true; else if (c === '{' || c === '[') d++; else if (c === '}' || c === ']') { d--; if (!d) return p; }
    }
    return -1;
  }
  function parseJSON(t) {
    let s = String(t || '').replace(/<(think|thinking|reasoning|reflection)>[\s\S]*?<\/\1>/gi, '');
    const cm = [...s.matchAll(/<\/(think|thinking|reasoning|reflection)>/gi)].pop(); if (cm) s = s.slice(cm.index + cm[0].length); // 开头的标签被截掉了
    s = s.trim();
    const obj = o => (o && typeof o === 'object' && !Array.isArray(o) ? o : Array.isArray(o) && o.length === 1 && o[0] && typeof o[0] === 'object' && !Array.isArray(o[0]) ? o[0] : null);
    const tp = x => { try { return obj(JSON.parse(x)); } catch (e) { return null; } };
    const fix = x => x.replace(/,\s*([}\]])/g, '$1');
    let o = tp(s); if (o) return o;
    try { if (Array.isArray(JSON.parse(s))) return null; } catch (e) { } // 整段是多个元素的数组：不猜
    for (const fm of [...s.matchAll(/```[a-zA-Z]*\s*([\s\S]*?)```/g)].reverse()) { const x = fm[1].trim(); if ((o = tp(x) || tp(fix(x)))) return o; } // 最后一个代码块最可能是答案
    let tries = 0; // 依次从每个 { 开始找配平的对象（前面的说明文字里也可能有花括号）
    for (let i = s.indexOf('{'); i >= 0 && tries < 200; i = s.indexOf('{', i + 1), tries++) {
      const j = balanced(s, i); if (j < 0) continue;
      const seg = s.slice(i, j + 1); if ((o = tp(seg) || tp(fix(seg)))) return o;
    }
    const i0 = s.indexOf('{'), k = s.lastIndexOf('}');
    if (i0 >= 0 && k > i0 && (o = tp(s.slice(i0, k + 1)) || tp(fix(s.slice(i0, k + 1))))) return o;
    return null;
  }

  /* ---------- 并发上限 ---------- */
  const MAXC = 3; let active = 0; const queue = [];
  function slot(sig) {
    if (sig && sig.aborted) return Promise.reject(mkErr('cancelled'));
    if (active < MAXC) { active++; return Promise.resolve(); }
    return new Promise((ok, no) => {
      const w = { go: () => { if (sig) sig.removeEventListener('abort', ab); ok(); } };
      const ab = () => { const i = queue.indexOf(w); if (i >= 0) queue.splice(i, 1); no(mkErr('cancelled')); };
      if (sig) sig.addEventListener('abort', ab, { once: true });
      queue.push(w);
    });
  }
  function free() { const w = queue.shift(); if (w) w.go(); else active = Math.max(0, active - 1); }

  /* ---------- 对外：与 claude.ai 的 sample 同形 ---------- */
  const TIMEOUT = 240000;
  async function run(input, o, wantJson) {
    o = o || {};
    const k = conf(); if (!usable(k)) throw mkErr('unavailable');
    const model = o.modelTier === 'quick' && k.fast ? k.fast : k.model;
    const ext = o.signal;
    await slot(ext);
    const ctl = new AbortController(); let tmo = false;
    const onAb = () => ctl.abort();
    if (ext) { if (ext.aborted) ctl.abort(); else ext.addEventListener('abort', onAb, { once: true }); }
    const tm = setTimeout(() => { tmo = true; ctl.abort(); }, o.timeout || TIMEOUT);
    try {
      const r = await call(k, model, input, { sig: ctl.signal, onText: o.onText });
      if (!wantJson) return r.text;
      const obj = parseJSON(r.text);
      if (!obj) throw mkErr(/content_filter|refusal|safety/i.test(String(r.fin || '')) ? 'refused' : r.fin === 'length' ? 'too_long' : 'invalid_json', r.text ? '…' + r.text.slice(-140) : 'empty reply', { text: r.text });
      return obj;
    } catch (e) {
      const err = ctl.signal.aborted ? mkErr(tmo ? 'timeout' : 'cancelled') : e;
      if (err && err.code !== 'cancelled') try { console.warn('[AI]', k.id, model, err.code, err.detail || ''); } catch (x) { } // 详情只记在本机控制台
      throw err;
    } finally { clearTimeout(tm); if (ext) ext.removeEventListener('abort', onAb); free(); }
  }
  function sample() {
    if (!usable(conf())) return null;
    const s = async (input, o) => ({ text: await run(input, o, false), truncated: false });
    s.json = (input, o) => run(input, o, true);
    s.limits = async () => ({ images: false, maxPromptBytes: 1 << 20 });
    return s;
  }
  async function timed(fn, ms) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { return await fn(ctl.signal); }
    catch (e) { if (ctl.signal.aborted) throw mkErr('timeout'); throw e; }
    finally { clearTimeout(t); }
  }
  // 设置里填得对不对：返回错误代码或空串
  function problem(k) {
    if (!k) return 'no_provider';
    return k.baseBad ? 'bad_base' : !k.base ? 'no_base' : !k.model ? 'no_model' : k.keyBad ? 'bad_key' : k.proxyBad ? 'bad_proxy' : !k.key && !k.P.noKey && !isLocal(k.base) ? 'no_key' : '';
  }
  // 测试连接（用设置面板里尚未保存的草稿）
  async function test(c) {
    const k = conf(c || CFG), bad = problem(k); if (bad) throw mkErr(bad);
    const t0 = Date.now();
    const r = await timed(sig => call(k, k.model, 'Connection test. Reply with exactly this JSON object: {"ok":true}', { sig }), 90000);
    return { ms: Date.now() - t0, json: !!parseJSON(r.text), text: String(r.text || '').slice(0, 200), model: k.model };
  }
  // 向服务商查询可用模型（GET /models），去掉嵌入、语音、绘图等非对话模型
  async function models(c) {
    const k = conf(c || CFG), bad = problem(k); if (bad && bad !== 'no_model') throw mkErr(bad);
    const res = await timed(async sig => {
      let r; try { r = await fetch(url(k, '/models'), { headers: headers(k, false), signal: sig, credentials: 'omit', referrerPolicy: 'no-referrer' }); }
      catch (e) { if (e && e.name === 'AbortError') throw e; throw mkErr('network', String((e && e.message) || e), { proxy: viaProxy(k) }); }
      if (!r.ok) throw await httpErr(r);
      return r.json();
    }, 30000);
    const arr = Array.isArray(res) ? res : (res && (res.data || res.models)) || [];
    const ids = arr.map(x => (typeof x === 'string' ? x : x && (x.id || x.name || x.model))).filter(x => typeof x === 'string' && x).map(s => s.replace(/^models\//, '').slice(0, 120));
    return [...new Set(ids)].filter(s => !/embed|whisper|tts|dall-e|moderation|rerank|transcri|realtime|audio|speech|image|imagen|veo|sora|ocr|bge-|aqa/i.test(s)).sort();
  }
  function label(c) { const k = conf(c || CFG); return usable(k) ? { zh: k.P.b[0], en: k.P.b[1] } : null; }

  /* ---------- 一键接入：OpenRouter 授权（OAuth PKCE，不用复制密钥） ----------
   * 点按钮 → 弹出 OpenRouter 的授权页（登录后点“授权”）→ 回到本站的 auth.html，它只把授权码写进 localStorage（'tianxia.oauth.code'）→
   * 游戏页用自己保存的 code_verifier 向 OpenRouter 换取密钥（POST /api/v1/auth/keys），存进 AI 设置（与手填的密钥一样只存在本机）。
   * 授权码单独拿到也没用：没有本机保存的 verifier 换不出密钥；授权码 10 分钟内有效。state 防止别人塞进来的授权结果。
   * 没有充值的账号只能用免费模型：GET /api/v1/key 的 is_free_tier 为真（或查不到）时，从 GET /api/v1/models 里挑一个免费的对话模型。
   * 本机测试：页面开在 localhost / 127.0.0.1 上时，可以用地址参数 ?orbase=http://… 把 OpenRouter 换成模拟服务。 */
  const OAK = 'tianxia.oauth', OAC = 'tianxia.oauth.code', OR0 = 'https://openrouter.ai';
  function orBase() {
    try { const q = String(new URLSearchParams(location.search).get('orbase') || '').replace(/\/+$/, ''); if (q && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /^https?:\/\/[^/?#\s]+$/.test(q)) return q; } catch (e) { }
    return OR0;
  }
  const b64u = u8 => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const lsDel = k => { try { localStorage.removeItem(k); } catch (e) { } };
  // 免费模型的偏好（能力较强、上下文够长）；都没有时用 OpenRouter 的免费模型路由 openrouter/free
  const FREE_PREF = [/^deepseek\/deepseek-(chat|v3)/, /^qwen\/qwen3-(235b|max|next|coder)/, /^openai\/gpt-oss-120b/, /^z-ai\/glm-4\.[5-9]/, /^moonshotai\/kimi-k2/, /^meta-llama\/llama-3\.3-70b/, /^google\/gemma-3-27b/, /^mistralai\/mistral-small/];
  // 开始授权：返回要打开的授权页地址（mode：'popup' 弹出窗口，'redirect' 本页跳转）
  async function oauthStart(mode) {
    if (typeof crypto === 'undefined' || !crypto.subtle) throw mkErr('oauth_unsupported');
    const v = b64u(crypto.getRandomValues(new Uint8Array(48))), st = b64u(crypto.getRandomValues(new Uint8Array(12)));
    const ch = b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))));
    try { localStorage.setItem(OAK, JSON.stringify({ v, st, at: Date.now(), mode: mode === 'redirect' ? 'redirect' : 'popup', back: location.href.replace(/#.*$/, '') })); localStorage.removeItem(OAC); } catch (e) { throw mkErr('oauth_unsupported'); }
    const cb = new URL('auth.html', location.href).href.replace(/[?#].*$/, '');
    return orBase() + '/auth?' + new URLSearchParams({ callback_url: cb, code_challenge: ch, code_challenge_method: 'S256', key_label: 'Tianxia · ' + location.host, state: st }).toString();
  }
  const oauthPending = () => { const c = lsGet(OAC); return !!(c && (c.code || c.error)); };
  async function freeModel() {
    let list = [];
    try { const r = await timed(sig => fetch(orBase() + '/api/v1/models', { signal: sig, credentials: 'omit', referrerPolicy: 'no-referrer' }), 20000); if (r.ok) { const j = await r.json(); list = Array.isArray(j && j.data) ? j.data : []; } } catch (e) { }
    const ids = list.filter(m => m && typeof m.id === 'string');
    const free = ids.filter(m => /:free$/.test(m.id) && (+m.context_length || 0) >= 32000 && !/vision|-vl\b|embed|guard|r1\b|think/i.test(m.id)).map(m => m.id);
    for (const re of FREE_PREF) { const id = free.find(x => re.test(x)); if (id) return id; }
    return free[0] || 'openrouter/free';
  }
  // 授权页回来以后：用授权码换密钥并保存。没有待处理的授权码时返回 null
  async function oauthFinish() {
    const c = lsGet(OAC); if (!c || (!c.code && !c.error)) return null;
    lsDel(OAC);
    const p = lsGet(OAK);
    if (c.error) { lsDel(OAK); throw mkErr('oauth_denied'); } // 在授权页点了取消
    if (!p || !p.v) throw mkErr('oauth_lost');
    lsDel(OAK);
    if (Date.now() - (+p.at || 0) > 15 * 60000) throw mkErr('oauth_expired');
    if (p.st && c.st !== p.st) throw mkErr('oauth_state');
    const j = await timed(async sig => {
      let r; try { r = await fetch(orBase() + '/api/v1/auth/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: String(c.code), code_verifier: p.v, code_challenge_method: 'S256' }), signal: sig, credentials: 'omit', referrerPolicy: 'no-referrer' }); }
      catch (e) { if (e && e.name === 'AbortError') throw e; throw mkErr('network', String((e && e.message) || e)); }
      if (!r.ok) { const e = await httpErr(r); if (r.status === 403 && /expired/i.test(e.raw || '')) throw mkErr('oauth_expired'); throw e; }
      return r.json();
    }, 30000);
    const key = String((j && j.key) || '').replace(ZW, ''); if (!key || !/^[\x21-\x7e]+$/.test(key)) throw mkErr('upstream_error', 'no key in the reply');
    let paid = null; // 是否充过值（查不到时按免费账号处理，免得产生费用）
    try { const r = await timed(sig => fetch(orBase() + '/api/v1/key', { headers: { Authorization: 'Bearer ' + key }, signal: sig, credentials: 'omit', referrerPolicy: 'no-referrer' }), 15000); if (r.ok) { const d = ((await r.json()) || {}).data; if (d && typeof d.is_free_tier === 'boolean') paid = !d.is_free_tier; } } catch (e) { }
    const model = paid ? '' : await freeModel();
    const by = clone(CFG.by || {}), u = Object.assign({}, by.openrouter || {}, { key, model, fast: '', oauth: 1 });
    if (orBase() !== OR0) u.base = orBase() + '/api/v1'; else u.base = '';
    by.openrouter = u;
    save({ p: 'openrouter', by, proxy: CFG.proxy });
    return { model: model || byId('openrouter').model, free: !paid, back: String(p.back || ''), mode: p.mode };
  }

  return Object.freeze({
    PRE, preset: byId, get cfg() { return clone(CFG); }, save, conf, usable, problem, ready: () => usable(conf()), isLocal, viaProxy,
    sample, test, models, label, onChange: f => subs.push(f), parseJSON, _cap: CAP,
    oauthStart, oauthFinish, oauthPending, orBase,
  });
})();
