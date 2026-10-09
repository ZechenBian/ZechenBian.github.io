// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 测试用：一个假的"兼容 OpenAI 的服务商"，只在本机监听。回答的内容借用 mock-claude.js 里事先写好的那几段。
// 它同时扮演转发代理：路径是 /https://… 的请求当成"经代理转发"，并且像真的代理那样只放行名单里的服务商。
// 密钥只认 test-key-ok（随手编的，不是任何真实服务的密钥）。
const http = require("http"), fs = require("fs"), path = require("path"), vm = require("vm");

/** 借 mock-claude.js 的回答：给它提示词，拿回整段文字 */
function canned() {
  const win = {}, ctx = vm.createContext({ window: win, setTimeout, clearTimeout, Promise, AbortController, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "mock-claude.js"), "utf8"), ctx);
  win.__mock.delay = 0;
  let fnP = win.claude.use("sample");
  return { state: win.__mock, reply: (messages) => fnP.then((fn) => fn(messages.map((m) => ({ role: m.role, content: m.content })), {})).then((r) => r.text) };
}

function start() {
  const can = canned(), calls = [];
  /* 可以在测试里改的开关：
     fail  接下来的几次请求直接报错：[{status, body, headers}]，用一次少一个
     think 回答之前先"想"多少段（每段作为 reasoning_content 流出）
     delay 每一小块之间隔多少毫秒
     allowHosts 充当代理时放行的服务商 */
  const state = { fail: [], think: 0, delay: 2, allowHosts: ["api.deepseek.com", "api.moonshot.cn"], mock: can.state };
  const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-expose-headers": "retry-after, x-tianxia-proxy", "access-control-max-age": "600" };
  const send = (res, status, obj, extra) => { res.writeHead(status, Object.assign({ "content-type": "application/json; charset=utf-8" }, CORS, extra || {})); res.end(typeof obj === "string" ? obj : JSON.stringify(obj)); };
  const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
    let url = decodeURIComponent(req.url), via = "direct", upstream = "";
    const m = /^\/(https?:\/\/[^/]+)(\/.*)$/.exec(url);
    if (m) { via = "proxy"; upstream = m[1]; url = m[2]; }
    let raw = "";
    req.on("data", (d) => { raw += d; });
    req.on("end", () => {
      let body = null; try { body = raw ? JSON.parse(raw) : null; } catch (e) {}
      const auth = req.headers.authorization || "";
      const call = { method: req.method, path: url, via, upstream, key: auth.replace(/^Bearer\s+/i, ""), body, origin: req.headers.origin || "", referer: req.headers.referer || "", cookie: req.headers.cookie || "" };
      calls.push(call);
      if (via === "proxy" && state.allowHosts.indexOf(upstream.replace(/^https?:\/\//, "")) < 0) { send(res, 403, { error: { message: "This proxy does not forward to " + upstream.replace(/^https?:\/\//, "") + " (see ALLOW_HOSTS).", type: "proxy_error" } }, { "x-tianxia-proxy": "1" }); return; }
      if (call.key !== "test-key-ok") { send(res, 401, { error: { message: "Incorrect API key provided: " + (call.key ? call.key.slice(0, 4) + "****" : "(none)") + ".", type: "invalid_request_error", code: "invalid_api_key" } }); return; }
      if (state.fail.length) { const f = state.fail.shift(); send(res, f.status, f.body, f.headers); return; }
      if (req.method === "GET" && /\/models$/.test(url)) { send(res, 200, { object: "list", data: [{ id: "mock-pro" }, { id: "mock-fast" }, { id: "mock-embedding-v2" }] }); return; }
      if (req.method === "POST" && /\/chat\/completions$/.test(url) && body) {
        if (/^(missing|typo)/.test(body.model)) { send(res, 404, { error: { message: "The model `" + body.model + "` does not exist or you do not have access to it.", type: "invalid_request_error", code: "model_not_found" } }); return; }
        if (body.model === "mock-strict" && body.thinking) { send(res, 400, { error: { message: "Unrecognized request argument supplied: thinking", type: "invalid_request_error" } }); return; }
        const first = String(body.messages && body.messages[0] && body.messages[0].content || "");
        const textP = /^Connection test/.test(first) ? Promise.resolve("OK") : can.reply(body.messages);
        textP.then((text) => {
          if (!body.stream) { send(res, 200, { choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }] }); return; }
          res.writeHead(200, Object.assign({ "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" }, CORS));
          const ev = [];
          for (let i = 0; i < state.think; i++) ev.push({ choices: [{ index: 0, delta: { reasoning_content: "先把这一步想清楚。" } }] });
          (text.match(/[\s\S]{1,48}/g) || []).forEach((t) => ev.push({ choices: [{ index: 0, delta: { content: t } }] }));
          ev.push({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
          let i = 0, dead = false; res.on("close", () => { dead = true; });
          (function tick() {
            if (dead) return;
            if (i >= ev.length) { res.write("data: [DONE]\n\n"); res.end(); return; }
            res.write("data: " + JSON.stringify(ev[i++]) + "\n\n"); setTimeout(tick, state.delay);
          })();
        }, (e) => send(res, 500, { error: { message: String(e && e.message || e) } }));
        return;
      }
      send(res, 404, "404 page not found");
    });
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ port: server.address().port, calls, state, close: () => new Promise((r) => server.close(r)) })));
}
module.exports = { start };
