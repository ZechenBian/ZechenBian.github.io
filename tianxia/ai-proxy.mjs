// 天下棋局 · AI 转发代理 / Tianxia AI relay proxy
//
// 有的 AI 服务商（如 DeepSeek）不允许网页直接调用（浏览器的跨域限制 CORS）。这个小程序把网页发来的请求原样转给 AI 服务商，
// 再给回复加上允许网页读取的响应头。它不记录、不保存任何内容；只转发对话、模型列表这几种 AI 接口，只转发到 ALLOW_HOSTS 里的服务商，
// 只接受来自 ALLOW_ORIGINS 里网站的网页请求（没有 Origin 头的请求一律拒绝）。
// Some AI providers (DeepSeek, for one) block calls from web pages (CORS). This passes the page's requests unchanged to the provider
// and adds the response headers that let the page read the reply. It logs and stores nothing, forwards only chat/model-list API calls,
// only to the providers in ALLOW_HOSTS, and only for web pages from the sites in ALLOW_ORIGINS (requests without an Origin are refused).
//
// 用法一 / Option 1 — Cloudflare Worker：新建 Worker，把本文件全部内容粘贴到代码编辑器里，部署；游戏的“转发代理”填 Worker 的地址。
//   Create a Worker, paste this whole file into its code editor and deploy; put the Worker's address into the game's “Relay proxy”.
//   可选的环境变量 / optional variables: ALLOW_ORIGINS、ALLOW_HOSTS（逗号分隔，覆盖下面的默认值 / comma-separated, replace the defaults）
// 用法二 / Option 2 — 本机 / your own computer（Node.js 18+）：node ai-proxy.mjs [端口/port，默认 8787]；“转发代理”填 http://127.0.0.1:8787
//
// 请求格式 / request format：<代理地址>/<完整的 AI 接口地址>
//   https://ai-proxy.xxx.workers.dev/https://api.deepseek.com/chat/completions
// 注意：Origin 头挡得住别的网站的网页，挡不住自己伪造请求头的程序；代理只是转发，费用记在请求里所带密钥的账上。
// Note: the Origin check stops other websites' pages, not programs that fake headers; the proxy only relays, and usage is billed to the key in each request.

const ALLOW_ORIGINS = ['https://zechenbian.github.io', 'http://localhost', 'http://127.0.0.1']; // 前缀匹配（可带端口）；'*' = 任何网站 / prefix match (ports allowed); '*' = any site
const ALLOW_HOSTS = [
  'api.openai.com', 'api.deepseek.com', 'ark.cn-beijing.volces.com', 'ark.ap-southeast.bytepluses.com',
  'dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com', 'api.moonshot.cn', 'api.moonshot.ai', 'open.bigmodel.cn', 'api.z.ai',
  'generativelanguage.googleapis.com', 'api.anthropic.com', 'openrouter.ai', 'api.siliconflow.cn', 'api.siliconflow.com',
  'api.groq.com', 'api.mistral.ai', 'api.x.ai', 'api.together.xyz', 'api.fireworks.ai', 'api.minimaxi.com', 'api.minimax.io',
  'api.lingyiwanwu.com', 'api.baichuan-ai.com', 'qianfan.baidubce.com', 'api.hunyuan.cloud.tencent.com', 'api.stepfun.com',
];
const PATHS = /\/(chat\/completions|messages|models)$/; // 只转发对话与模型列表接口
const PASS_REQ = /^(authorization|content-type|accept|x-api-key|anthropic-version|anthropic-beta|anthropic-dangerous-direct-browser-access|http-referer|x-title|openai-organization|openai-project)$/i;
const PASS_RES = /^(content-type|retry-after|x-request-id|request-id|openai-processing-ms)$/i;
const list = (v, d) => (typeof v === 'string' && v.trim() ? v.split(',').map(s => s.trim()).filter(Boolean) : d);

async function handle(req, env = {}) {
  const origins = list(env.ALLOW_ORIGINS, ALLOW_ORIGINS), hosts = list(env.ALLOW_HOSTS, ALLOW_HOSTS);
  const origin = req.headers.get('origin') || '';
  const cors = {
    'Access-Control-Allow-Origin': origin || '*', 'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': req.headers.get('access-control-request-headers') || 'authorization, content-type, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access',
    'Access-Control-Expose-Headers': 'retry-after, x-request-id, x-tianxia-proxy', 'Access-Control-Max-Age': '86400',
  };
  if (req.headers.get('access-control-request-private-network') === 'true') cors['Access-Control-Allow-Private-Network'] = 'true'; // 网页访问本机代理时 Chrome 要求
  // 代理自己的报错带上 x-tianxia-proxy，游戏据此提示“代理拒绝”，而不是“密钥无效”
  const refuse = (status, msg) => new Response(JSON.stringify({ error: { message: msg, type: 'proxy_error' } }), { status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'x-tianxia-proxy': '1' } });
  const u = new URL(req.url);
  let t = u.searchParams.get('url') || (u.pathname.slice(1) + u.search);
  t = t.replace(/^(https?):\/+/i, '$1://'); // 有的平台会把路径里的 // 合并成 /
  if (!/^https?:\/\//i.test(t) && req.method === 'GET') return new Response('Tianxia AI relay proxy is running.\nUsage: <this address>/https://api.deepseek.com/chat/completions\n', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  if (!origin) return refuse(403, 'This proxy only serves web pages (the request has no Origin header).');
  if (!origins.includes('*') && !origins.some(o => origin === o || origin.startsWith(o + ':'))) return refuse(403, 'This proxy does not serve ' + origin + ' (see ALLOW_ORIGINS).');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET' && req.method !== 'POST') return refuse(405, 'Only GET and POST are relayed.');
  let tu; try { tu = new URL(t); } catch (e) { return refuse(400, 'Bad target URL.'); }
  if (tu.protocol !== 'https:' && env.ALLOW_HTTP !== '1') return refuse(403, 'This proxy only forwards to https:// addresses.');
  if (!hosts.includes(tu.hostname)) return refuse(403, 'This proxy does not forward to ' + tu.host + ' (see ALLOW_HOSTS).');
  if (!PATHS.test(tu.pathname)) return refuse(403, 'This proxy only relays …/chat/completions, …/messages and …/models.');
  const h = new Headers();
  for (const [k, v] of req.headers) if (PASS_REQ.test(k)) h.set(k, v);
  let r;
  try { r = await fetch(tu.toString(), { method: req.method, headers: h, body: req.method === 'POST' ? await req.arrayBuffer() : undefined, redirect: 'manual', signal: req.signal }); }
  catch (e) { return refuse(502, 'Proxy could not reach ' + tu.host + ': ' + ((e && e.message) || e)); }
  if (r.status >= 300 && r.status < 400) return refuse(502, tu.host + ' answered with a redirect, which is not followed.');
  const ct = r.headers.get('content-type') || '';
  if (/text\/html/i.test(ct)) { try { r.body && r.body.cancel(); } catch (e) { } return new Response(JSON.stringify({ error: { message: tu.host + ' returned a web page (HTTP ' + r.status + ') instead of an API reply.' } }), { status: r.status >= 400 ? r.status : 502, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' } }); }
  const oh = new Headers(cors);
  for (const [k, v] of r.headers) if (PASS_RES.test(k)) oh.set(k, v);
  oh.set('Cache-Control', 'no-store');
  return new Response(r.body, { status: r.status, headers: oh }); // 流式回复（SSE）原样流过
}

export default { fetch: (req, env) => handle(req, env) };

// —— 本机运行（node ai-proxy.mjs）——
const isNode = typeof globalThis.WebSocketPair === 'undefined' && typeof globalThis.Deno === 'undefined' && !!(globalThis.process && process.versions && process.versions.node && process.argv && process.argv[1])
  && decodeURIComponent(String(import.meta.url || '')).endsWith('/' + process.argv[1].replace(/\\/g, '/').split('/').pop()); // 直接运行本文件时才启动
if (isNode) {
  const httpMod = 'node:' + 'http'; // 写成拼接，免得 Worker 的打包工具去解析它
  import(httpMod).then(http => {
    const port = +(process.argv[2] || process.env.PORT || 8787), host = process.env.HOST || '127.0.0.1';
    const keep = /^(origin|access-control-request-headers|access-control-request-method|access-control-request-private-network|authorization|content-type|accept|x-api-key|anthropic-version|anthropic-beta|anthropic-dangerous-direct-browser-access|http-referer|x-title|openai-organization|openai-project)$/i;
    http.createServer(async (q, s) => {
      const ac = new AbortController();
      s.on('close', () => { if (!s.writableFinished) ac.abort(); }); // 网页取消或关掉：上游请求也停下，免得继续计费
      try {
        const chunks = []; for await (const c of q) chunks.push(c);
        const hd = Object.entries(q.headers).filter(([k, v]) => typeof v === 'string' && keep.test(k));
        const req = new Request('http://' + host + ':' + port + q.url, { method: q.method, headers: hd, signal: ac.signal, body: q.method === 'POST' ? new Uint8Array(Buffer.concat(chunks)) : undefined });
        const r = await handle(req, process.env);
        s.writeHead(r.status, Object.fromEntries(r.headers));
        if (r.body) for await (const c of r.body) { if (ac.signal.aborted) break; s.write(c); }
        s.end();
      } catch (e) {
        if (ac.signal.aborted) { s.destroy(); return; }
        if (!s.headersSent) s.writeHead(502, { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*', 'x-tianxia-proxy': '1', 'access-control-expose-headers': 'x-tianxia-proxy' });
        s.end('proxy error: ' + ((e && e.message) || e));
      }
    }).listen(port, host, () => console.log(`Tianxia AI relay proxy: http://${host}:${port}  ← 填到游戏的“转发代理” / put this into “Relay proxy”`));
  });
}
