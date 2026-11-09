// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 亲手写 · 语言模型（ml/lm/index.html）：每一步写一个零件，交给本机引擎在你的电脑上运行测试（api = exercise，见 ml-engine/PROTOCOL.md §12），
 * 最后拼成一个小模型训练。题目在 steps.js；测试和训练在 ml-engine/mllab_engine/exercises.py。
 * 连引擎的两条路和机器学习实验室一样（src/ml/engine.js）：从引擎打开的页面走 HTTP（同源，带令牌）；
 * 在 Claude 里打开时经 Claude 桌面版调用本地 MCP 服务器 host:mllab-engine。这里只用到运行和取事件，代码写得更短。
 * 你的代码、每一步的状态、预测台账只存在这台设备的浏览器里（localStorage，取不到时照常能用，只是不保存）。 */
(function () {
  "use strict";
  var S = LMSTEPS, STEPS = S.STEPS;

  /* ---------- 小工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function h(tag, attrs) {
    var el = document.createElement(tag), k;
    for (k in attrs || {}) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "text") el.textContent = v;
      else if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) { if (c == null || c === false) return; if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; } el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c); }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function md(src) { var el = h("div", { class: "md" }); try { QLMD.mount(el, src); } catch (e) { el.textContent = src; } return el; }
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("qlml.lm." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("qlml.lm." + k, JSON.stringify(v)); } catch (e) {} }
  };
  function toast(text, ms) {
    var t = h("div", { class: "toast", role: "status", text: text });
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, ms || 3200);
  }
  function modal(title, body, foot) {
    var box, root = h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": title, onclick: function (e) { if (e.target === root) close(); } },
      box = h("div", { class: "modal-box narrow" },
        h("div", { class: "modal-h" }, h("h2", { text: title }), h("button", { class: "iconbtn", type: "button", "aria-label": "关闭", text: "✕", onclick: function () { close(); } })),
        h("div", { class: "modal-b" }, body),
        h("div", { class: "modal-f" }, foot || h("button", { class: "btn", type: "button", text: "关闭", onclick: function () { close(); } }))));
    function key(e) { if (e.key === "Escape") close(); }
    function close() { if (root.parentNode) root.parentNode.removeChild(root); document.removeEventListener("keydown", key); }
    document.addEventListener("keydown", key);
    $("overlays").appendChild(root);
    var f = box.querySelector("button, a, input, textarea, select"); if (f) f.focus();
    return { close: close, box: box };
  }
  /* 要确认的按钮：第一次点只换成“再点一次……”，3 秒内再点才执行（在 Claude 里 confirm() 弹不出来，一律当成“取消”） */
  function twoStep(btn, ask, action) {
    var armed = false, label = btn.textContent, t = null;
    btn.addEventListener("click", function () {
      if (armed) { clearTimeout(t); armed = false; btn.textContent = label; btn.classList.remove("armed"); action(); return; }
      armed = true; btn.textContent = ask; btn.classList.add("armed");
      t = setTimeout(function () { armed = false; btn.textContent = label; btn.classList.remove("armed"); }, 3000);
    });
    return btn;
  }
  function fmt(x, d) { return x == null || !isFinite(x) ? "—" : Number(x).toFixed(d == null ? 3 : d); }

  /* ---------- 本机引擎（PROTOCOL.md §1、§5、§6、§11） ---------- */
  var E = window.QLML_ENGINE || null;
  var HOSTED = !!(window.claude && typeof window.claude.use === "function");
  var MODE = E && E.token ? "http" : HOSTED ? "mcp" : "none";
  var MCPN = "host:mllab-engine", mcpP = null, info = null, infoErr = "", connecting = null;
  function token() { return E && E.token ? String(E.token) : ""; }
  function api(method, path, body) {
    var o = { method: method, headers: { "X-QLML-Token": token() }, credentials: "same-origin", cache: "no-store" };
    if (body !== undefined) { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(body); }
    return fetch(path, o).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) throw new Error((j && j.error) || ("本机引擎回答 HTTP " + r.status));
        return j;
      });
    }, function () { throw new Error("连不上本机引擎：它可能已经关了。在终端里重新启动它，再用它打印的网址打开这一页。"); });
  }
  function mcpNs() { if (!mcpP) mcpP = HOSTED ? Promise.resolve().then(function () { return window.claude.use("mcp"); }).then(function (m) { return m || null; }, function () { return null; }) : Promise.resolve(null); return mcpP; }
  function textOf(r) { return r && Array.isArray(r.content) ? r.content.filter(function (c) { return c && c.type === "text"; }).map(function (c) { return c.text; }).join("") : r && typeof r.payload === "string" ? r.payload : ""; }
  function payloadOf(r) { var p = r && r.payload; if (typeof p === "string") { try { p = JSON.parse(p); } catch (e) {} } if (p == null || typeof p === "string") { var t = textOf(r); try { p = JSON.parse(t); } catch (e) { p = t || p; } } return p; }
  var MCPERR = {
    server_not_connected: "Claude 桌面版里没有找到本机引擎，或者它没在运行：按“本机引擎”里的步骤把它加进桌面版的设置，再完全退出、重新打开桌面版。",
    not_in_manifest: "这个页面没有被允许使用本机引擎。",
    approval_required: "这一步要你点“允许”，但没有得到允许。再试一次，在弹出的对话框里选允许。",
    cancelled: "你没有允许这一次调用。",
    server_unavailable: "本机引擎没有回应：它可能还在启动，或者卡住了。等几秒再试。",
    not_granted: "当前的打开方式下，这个页面不能调用 Claude 桌面版的本机工具（要在 Claude 桌面版里打开）。"
  };
  function mcall(tool, input) {
    return mcpNs().then(function (m) {
      if (!m) throw { code: "not_granted" };
      return m.callTool(MCPN, tool, input || {}, { cache: false });
    }).then(payloadOf, function (e) {
      var code = e && e.code;
      if (code === "tool_error") throw Object.assign(new Error((e.result && textOf(e.result)) || e.message || "本机引擎报错。"), { code: code });
      throw Object.assign(new Error(MCPERR[code] || ("调用本机引擎出错了（" + (code || "未知") + "）。")), { code: code, retryable: !!(e && e.retryable) });
    });
  }
  function connect() {
    if (connecting) return connecting;
    var p = MODE === "http" ? api("GET", "/api/info") : MODE === "mcp" ? mcall("info") : Promise.reject(new Error("不是从本机引擎打开的。"));
    connecting = p.then(function (j) { info = j; infoErr = ""; return j; }, function (e) { info = null; infoErr = e.message; return null; })
      .then(function (r) { connecting = null; paintEngine(); onBackendKnown(); return r; });
    return connecting;
  }
  function ready() { return !!info; }
  function hasTorch() { return !!(info && info.torch && info.torch.available); }

  /** 交一次运行，事件交给 onEv(name, data)；返回 Promise<result>，失败时是带 .ev（引擎的 error 事件）的 Error */
  function run(job, onEv, state) {
    function fail(ev) { var e = new Error(ev && ev.message || "运行失败"); e.ev = ev || {}; return e; }
    if (MODE === "http") {
      return api("POST", "/api/run", job).then(function (r) {
        state.id = r.id;
        return new Promise(function (ok, no) {
          var es = new EventSource("/api/run/" + r.id + "/events?token=" + encodeURIComponent(token())), idle;
          function arm() { clearTimeout(idle); idle = setTimeout(function () { es.close(); no(fail({ message: "本机引擎超过 3 分钟没有动静：它可能已经关了或者卡住了。看一下引擎的终端。" })); }, 180000); }
          arm();
          ["ready", "progress", "log"].forEach(function (t) { es.addEventListener(t, function (e) { arm(); var d = {}; try { d = JSON.parse(e.data); } catch (x) {} onEv(t, d); }); });
          es.addEventListener("done", function (e) { clearTimeout(idle); es.close(); ok(JSON.parse(e.data).result); });
          es.addEventListener("error", function (e) {
            if (e.data) { clearTimeout(idle); es.close(); var d = {}; try { d = JSON.parse(e.data); } catch (x) {} no(fail(d)); }
            else if (es.readyState === 2) { clearTimeout(idle); no(fail({ message: "和本机引擎的连接断了。" })); }
          });
          state.cancel = function () { api("POST", "/api/run/" + r.id + "/cancel", {}).catch(function () {}); };
        });
      });
    }
    if (MODE === "mcp") {
      onEv("progress", { phase: "data", msg: "等你在 Claude 里允许运行…" });
      return mcall("run_start", { job: job }).then(function (r) {
        state.id = r.id;
        state.cancel = function () { mcall("run_cancel", { id: r.id }).catch(function () {}); };
        return new Promise(function (ok, no) {
          var from = 0, part = 0, buf = "", misses = 0;
          (function loop() {
            mcall("run_events", { id: r.id, from: from, part: part, waitMs: 15000 }).then(function (x) {
              misses = 0;
              var end = null;
              (x.events || []).forEach(function (ev) {
                var text = ev.text;
                if (ev.parts) { buf += ev.text; if (ev.part + 1 < ev.parts) return; text = buf; buf = ""; }
                var d = {}; try { d = JSON.parse(text); } catch (e) {}
                if (ev.name === "done") end = function () { ok(d.result); };
                else if (ev.name === "error") end = function () { no(fail(d)); };
                else onEv(ev.name, d);
              });
              from = x.next; part = x.part || 0;
              if (end) return end();
              if (x.finished) return no(fail({ message: "运行结束了，但没有收到结果。" }));
              loop();
            }, function (e) {
              if (e.retryable && ++misses <= 3) { setTimeout(loop, 1000 + Math.random() * 1000); return; }
              no(fail({ message: e.message }));
            });
          })();
        });
      });
    }
    return Promise.reject(fail({ message: "还没有连上本机引擎。" }));
  }

  /* ---------- 状态 ---------- */
  var backend = store.get("backend", "torch");          // 起始代码用哪一份：torch 或 numpy（连上引擎以后按它有没有 PyTorch 定）
  var cur = Math.max(0, Math.min(STEPS.length, store.get("cur", 0) | 0));   // 0 = 总览，1…6 = 各步
  var status = store.get("status", {});                  // id → { passed, total, at }
  var ledger = store.get("ledger", []);                  // 预测台账
  var running = null;
  function codeOf(st) { var c = store.get("code." + backend + "." + st.id, null); return c == null ? (st.starter ? st.starter[backend] : "") : c; }
  function setCode(st, text) { store.set("code." + backend + "." + st.id, text); }
  function done(st) { var s = status[st.id]; return !!(s && s.total && s.passed === s.total); }
  function onBackendKnown() {
    if (!ready()) return;
    var want = hasTorch() ? "torch" : "numpy";
    if (want !== backend) { backend = want; store.set("backend", backend); render(); }
  }

  /** 第 1…upto 步的代码拼成一个文件；lines 记下每一步从拼好的文件第几行开始，用来把引擎报的行号换回"第几步第几行" */
  function assemble(upto) {
    var parts = [S.PRE[backend]], map = [], line = S.PRE[backend].split("\n").length;
    STEPS.forEach(function (st) {
      if (!st.starter || st.n > upto) return;
      var c = codeOf(st); if (!/\n$/.test(c)) c += "\n";
      parts.push("\n# ===== 第 " + st.n + " 步：" + st.title + " =====\n");
      line += 2;
      map.push({ step: st.n, start: line, n: c.split("\n").length - 1 });
      parts.push(c); line += c.split("\n").length - 1;
    });
    return { code: parts.join(""), map: map };
  }
  function where(map, ln) {
    if (!ln) return "";
    for (var i = 0; i < map.length; i++) { var m = map[i]; if (ln >= m.start && ln < m.start + m.n) return "第 " + m.step + " 步的第 " + (ln - m.start + 1) + " 行"; }
    return ln < (map[0] ? map[0].start : 1) ? "开头的 import 那几行" : "第 " + ln + " 行";
  }

  function remap(map, text) { return String(text || "").replace(/（第 (\d+) 行）/g, function (_, n) { return "（" + where(map, +n) + "）"; }).replace(/\bline (\d+)\b/g, function (_, n) { return where(map, +n); }); }

  /* ---------- 左栏 ---------- */
  function paintSteps() {
    var b = clear($("blkSteps"));
    b.appendChild(h("h2", null, "步骤", h("small", { text: STEPS.filter(done).length + " / " + STEPS.length + " 完成" })));
    var list = h("ol", { class: "lm-steps" });
    list.appendChild(h("li", null, h("button", { type: "button", class: "lm-step" + (cur === 0 ? " cur" : ""), "aria-current": cur === 0 ? "true" : null, onclick: function () { go(0); } },
      h("span", { class: "lm-mark", text: "◇" }), h("span", { class: "lm-name", text: "总览：这一页要做什么" }))));
    STEPS.forEach(function (st) {
      var s = status[st.id], mark = done(st) ? "✓" : s ? "◐" : "○", cls = done(st) ? " ok" : s ? " half" : "";
      list.appendChild(h("li", null, h("button", { type: "button", class: "lm-step" + cls + (cur === st.n ? " cur" : ""), "aria-current": cur === st.n ? "true" : null, onclick: function () { go(st.n); } },
        h("span", { class: "lm-mark", "aria-label": done(st) ? "已通过" : s ? "试过，还没全过" : "还没做", text: mark }),
        h("span", { class: "lm-name", text: st.n + " · " + st.title }),
        s && s.total ? h("span", { class: "lm-score num", text: s.passed + "/" + s.total }) : null)));
    });
    b.appendChild(list);
  }
  function paintEngine() {
    var b = clear($("blkEngine")), btn = $("btnEngine");
    b.appendChild(h("h2", { text: "本机引擎" }));
    if (ready()) {
      var t = info.torch || {};
      b.appendChild(h("p", { class: "lm-eng ok", text: "已连上 · Python " + info.python + " · " + (t.available ? "PyTorch " + t.version + " · " + (t.device === "mps" ? "苹果芯片 GPU" : t.device) : "没有 PyTorch，用 numpy 写") }));
      btn.textContent = "本机引擎 ✓";
    } else {
      b.appendChild(h("p", { class: "lm-eng", text: MODE === "none" ? "没连上：这一页要从本机引擎打开才能运行代码。" : connecting ? "正在连接…" : "没连上" + (infoErr ? "：" + infoErr : "。") }));
      b.appendChild(h("button", { class: "btn small", type: "button", text: MODE === "mcp" ? "连接本机引擎" : "怎么启动", onclick: openEngine }));
      btn.textContent = "本机引擎";
    }
    b.appendChild(h("p", { class: "note", text: "现在的起始代码：" + (backend === "torch" ? "PyTorch" : "numpy") + "。" + (ready() && !hasTorch() ? "第 1–5 步可以用 numpy 写；第 6 步训练要 PyTorch，怎么装见“本机引擎”。" : "") }));
  }

  var START = [
    "# 第一次：在仓库的 strategy-lab/ml-engine 目录里装好（Python 3.10 或更新）",
    "cd strategy-lab/ml-engine",
    "python3 -m venv .venv && source .venv/bin/activate",
    "pip install -e \".[torch]\"",
    "",
    "# 以后每次：先在 strategy-lab 目录里构建页面（python3 build.py），再启动引擎",
    "python -m mllab_engine",
    "# 终端里打印 http://127.0.0.1:8765/ml/?engine=…",
    "# 把网址里的 /ml/ 换成 /ml/lm/ 打开这一页（或者在机器学习实验室的顶栏点“亲手写”）"
  ].join("\n");
  /* 没有 PyTorch：怎么装、装完以后会怎样（训练那一步和引擎弹窗共用） */
  function torchHelp() {
    return h("div", { class: "warn" }, h("div", null,
      h("b", { text: "训练这一步要 PyTorch，现在的引擎里没有。" }),
      h("ol", { class: "lm-ol" },
        h("li", { text: "在终端里按 Ctrl+C 停掉引擎。" }),
        h("li", null, "在启动引擎的那个环境里装上 PyTorch（装引擎时建的 .venv：先 ", h("code", { text: "source .venv/bin/activate" }), "），运行 ", h("code", { text: "pip install torch" }), "。"),
        h("li", null, "重新运行 ", h("code", { text: "python -m mllab_engine" }), "，用新打印的网址打开这一页（把 /ml/ 换成 /ml/lm/）。")),
      h("p", { class: "note", text: "装好以后起始代码会换成 PyTorch 的写法，前五步要用 PyTorch 再写一遍、再通过一次（第 6 步用的是 PyTorch 版本）。你的 numpy 版本会留着，引擎换回没有 PyTorch 时还在。" })));
  }
  function openEngine() {
    var body = h("div", { class: "ml-eng" });
    if (ready()) {
      var tt = info.torch || {};
      body.appendChild(h("p", { text: "已连上本机引擎：Python " + info.python + "，" + (tt.available ? "PyTorch " + tt.version + "，设备 " + tt.device + "。" : "没有 PyTorch。") }));
      if (!tt.available) body.appendChild(torchHelp());
      body.appendChild(h("p", { class: "note", text: "你的代码在你自己的电脑上运行，权限和你一样；只运行你看过、信得过的代码。" }));
    }
    else if (MODE === "mcp") {
      body.appendChild(h("p", { text: "你是在 Claude 里打开的这一页：经 Claude 桌面版调用本机引擎（本地 MCP 服务器 mllab-engine）。设置方法和机器学习实验室一样：装好引擎，运行 python -m mllab_engine --claude-config，把打印出来的那一段并进桌面版的 claude_desktop_config.json，完全退出再打开桌面版。" }));
      if (infoErr) body.appendChild(h("div", { class: "warn err", text: infoErr }));
      body.appendChild(h("button", { class: "btn primary", type: "button", text: "连接本机引擎", onclick: function () { m.close(); connect(); paintEngine(); } }));
    } else if (E && E.needToken) {
      body.appendChild(h("div", { class: "warn", text: "这一页是本机引擎给的，但网址里没有令牌（或者令牌不对）：用引擎终端里打印的完整网址打开，把 /ml/ 换成 /ml/lm/。" }));
    } else {
      body.appendChild(h("p", { text: "本机引擎是一个小程序，在你自己的电脑上运行你写的 Python 代码（只监听本机 127.0.0.1，每次启动换一个随机令牌）。启动方法：" }));
      body.appendChild(h("pre", { class: "code", text: START }));
      body.appendChild(h("p", { class: "note", text: "没连上引擎时，代码照样可以写，会存在这台设备的浏览器里。" }));
    }
    var m = modal("本机引擎", body);
  }

  /* ---------- 中栏：总览 ---------- */
  function renderOverview(main) {
    main.appendChild(h("section", { class: "lm-card" }, h("h2", { class: "lm-h", text: "这一页要做什么" }), md(S.OVERVIEW),
      h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", text: "从第 1 步开始", onclick: function () { go(1); } }))));
    main.appendChild(h("section", { class: "lm-card" }, h("h2", { class: "lm-h", text: "接下来" }), md(S.NEXT)));
  }

  /* ---------- 中栏：一步 ---------- */
  function renderStep(main, st) {
    var card = h("section", { class: "lm-card" });
    card.appendChild(h("div", { class: "lm-kicker", text: "第 " + st.n + " 步 / 共 " + STEPS.length + " 步" }));
    card.appendChild(h("h2", { class: "lm-h", text: st.title }));
    card.appendChild(md(st.text));
    main.appendChild(card);

    var ed = null;
    if (st.starter) {
      var codeCard = h("section", { class: "lm-card" });
      ed = h("textarea", { class: "codeedit lm-code", spellcheck: "false", autocapitalize: "off", autocomplete: "off", "aria-label": "第 " + st.n + " 步的代码", rows: "14" });
      ed.value = codeOf(st);
      ed.addEventListener("input", function () { setCode(st, ed.value); });
      ed.addEventListener("keydown", function (e) {
        if (e.key === "Tab" && !e.shiftKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); var a = ed.selectionStart, z = ed.selectionEnd; ed.value = ed.value.slice(0, a) + "    " + ed.value.slice(z); ed.selectionStart = ed.selectionEnd = a + 4; setCode(st, ed.value); }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doRun(st); }
      });
      codeCard.appendChild(h("div", { class: "lm-codehead" }, h("h3", { text: "你的代码" }), h("span", { class: "note", text: (backend === "torch" ? "PyTorch" : "numpy") + " · 前面已经有 " + S.PRE[backend].trim().split("\n").join("；") }),
        twoStep(h("button", { class: "btn small ghost", type: "button", text: "恢复起始代码" }), "再点一次：你写的会丢掉", function () { ed.value = st.starter[backend]; setCode(st, ed.value); })));
      codeCard.appendChild(ed);
      main.appendChild(codeCard);
    }

    // 先预测，再运行
    var runCard = h("section", { class: "lm-card" });
    var predNum = h("input", { type: "number", class: "lm-pnum", step: st.predictNumber ? "0.01" : "1", min: "0", max: st.predictNumber ? "10" : String(st.tests), "aria-label": st.predictNumber ? "预测的验证集 loss" : "预计通过几项", placeholder: st.predictNumber ? "例如 2.10" : "0–" + st.tests });
    var predText = h("textarea", { class: "lm-ptext", rows: "2", placeholder: st.predictNumber ? "为什么是这个数（可以不写）" : "你的回答，写在运行之前（可以不写）", "aria-label": st.predictNumber ? "预测的理由" : "这一步的问题，你的回答" });
    var draft = store.get("draft." + st.id, null);
    if (draft) { predNum.value = draft.num || ""; predText.value = draft.text || ""; }
    function saveDraft() { store.set("draft." + st.id, { num: predNum.value, text: predText.value }); }
    predNum.addEventListener("input", saveDraft); predText.addEventListener("input", saveDraft);
    runCard.appendChild(h("h3", { text: "先预测，再运行" }));
    if (st.train && ready() && !hasTorch()) runCard.appendChild(torchHelp());
    if (st.predictNumber) {
      runCard.appendChild(md(st.predict));
      var lb = store.get("last." + st.id, null);
      runCard.appendChild(h("p", { class: "note", text: lb && lb.baselines ? "上一次运行算出的参照：只看上一个字符 " + fmt(lb.baselines.bigram) + "，只看频率 " + fmt(lb.baselines.unigram) + "，均匀乱猜 " + fmt(lb.baselines.uniform) + "。" : "参照只知道一个：均匀乱猜是 ln 65 ≈ 4.17；另外两个基线第一次训练时由引擎算出来。" }));
      runCard.appendChild(h("div", { class: "lm-pred" }, h("label", null, "预计验证集 loss ", predNum), predText));
    } else {
      runCard.appendChild(h("div", { class: "lm-pred" },
        h("label", null, "预计通过 ", predNum, " 项（这一步共 " + st.tests + " 项测试，调用了库里现成的实现时多一项）"),
        h("div", { class: "lm-q" }, h("b", { text: "这一步的问题：" }), md(st.predict)), predText));
    }
    var params = null;
    if (st.train) {
      var sel = function (key, label, opts, def) {
        var s = h("select", { "aria-label": label }); opts.forEach(function (o) { s.appendChild(h("option", { value: String(o), text: String(o), selected: o === def })); });
        return { key: key, el: s, wrap: h("label", { class: "lm-param" }, label + " ", s) };
      };
      params = [sel("steps", "训练步数", [300, 1000, 1500, 3000], store.get("p.steps", 1500)), sel("d", "向量维数", [32, 64, 128], store.get("p.d", 64))];
      params.forEach(function (p) { p.el.addEventListener("change", function () { store.set("p." + p.key, +p.el.value); }); });
      runCard.appendChild(h("div", { class: "row" }, params.map(function (p) { return p.wrap; }), h("span", { class: "note", text: "批量 32、上下文 64 个字符、学习率 0.002（带预热和余弦衰减）。" })));
    }
    var btnRun = h("button", { class: "btn primary", type: "button", text: st.train ? "开始训练" : "运行测试", disabled: !!(st.train && ready() && !hasTorch()), onclick: function () { doRun(st); } });
    var btnStop = h("button", { class: "btn", type: "button", text: "停下", hidden: true, onclick: function () { if (running && running.state.cancel) running.state.cancel(); } });
    var hintsShown = store.get("hints." + st.id, 0);
    var hintBox = h("div", { class: "lm-hints" });
    function paintHints() {
      clear(hintBox);
      st.hints.slice(0, hintsShown).forEach(function (t, i) { hintBox.appendChild(h("div", { class: "lm-hint" }, h("b", { text: "提示 " + (i + 1) + "：" }), md(t))); });
    }
    var btnHint = h("button", { class: "btn ghost", type: "button", text: "看一条提示", onclick: function () { if (hintsShown < st.hints.length) { hintsShown++; store.set("hints." + st.id, hintsShown); paintHints(); } if (hintsShown >= st.hints.length) btnHint.disabled = true; } });
    if (hintsShown >= st.hints.length) btnHint.disabled = true;
    paintHints();
    runCard.appendChild(h("div", { class: "row lm-actions" }, btnRun, btnStop, btnHint, h("span", { class: "note lm-kbd", text: st.starter ? "⌘/Ctrl + Enter 也能运行" : "" })));
    runCard.appendChild(hintBox);
    main.appendChild(runCard);

    var out = h("section", { class: "lm-card lm-out", hidden: true });
    main.appendChild(out);
    var nav = h("div", { class: "row lm-nav" },
      st.n > 1 ? h("button", { class: "btn", type: "button", text: "← 第 " + (st.n - 1) + " 步", onclick: function () { go(st.n - 1); } }) : h("button", { class: "btn", type: "button", text: "← 总览", onclick: function () { go(0); } }),
      h("span", { style: { flex: "1" } }),
      st.n < STEPS.length ? h("button", { class: "btn", type: "button", text: "第 " + (st.n + 1) + " 步 →", onclick: function () { go(st.n + 1); } }) : null);
    main.appendChild(nav);

    var last = store.get("last." + st.id, null);
    if (last) paintResult(out, st, last, true);
    current = { st: st, btnRun: btnRun, btnStop: btnStop, out: out, predNum: predNum, predText: predText, params: params };
  }
  var current = null;

  /* ---------- 运行 ---------- */
  function doRun(st, force) {
    if (running) return;
    if (!ready()) { openEngine(); return; }
    if (st.train && !hasTorch()) { toast("训练这一步要 PyTorch：在启动引擎的 Python 环境里 pip install torch，再重启引擎。", 5200); return; }
    if (st.train) {
      var missing = STEPS.filter(function (s) { return s.starter && !done(s); });
      if (missing.length && !force) {
        var c0 = current;
        clear(c0.out); c0.out.hidden = false;
        c0.out.appendChild(h("div", { class: "warn" }, h("div", null, "第 " + missing.map(function (s) { return s.n; }).join("、") + " 步还没全部通过，训练多半会出错。",
          h("div", { class: "row", style: { marginTop: "8px" } }, h("button", { class: "btn small", type: "button", text: "还是要训练", onclick: function () { doRun(st, true); } })))));
        return;
      }
    }
    var c = current, pnum = c.predNum.value.trim(), ptext = c.predText.value.trim();
    var a = assemble(st.train ? STEPS.length : st.n);
    var params = {}; (c.params || []).forEach(function (p) { params[p.key] = +p.el.value; });
    var job = { api: "exercise", code: a.code, params: params, seed: (Math.random() * 1e9) | 0, budgetMs: st.train ? 600000 : 30000,
      data: { exercise: st.id, backend: backend === "numpy" ? "numpy" : "auto" } };
    var live = { tests: [], curve: [], log: [], msg: "" };
    c.btnRun.disabled = true; c.btnStop.hidden = false;
    var state = {}; running = { state: state };
    var out = c.out; out.hidden = false;
    var t0 = Date.now();
    function paintLive() { paintResult(out, st, { live: true, tests: live.tests, curve: live.curve, msg: live.msg, log: live.log, map: a.map }, false); }
    paintLive();
    try { out.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { out.scrollIntoView(); }
    run(job, function (name, d) {
      if (name === "progress") {
        if (d.phase === "test" && d.test) live.tests.push(d.test);
        else if (d.phase === "fit" && d.point) live.curve.push(d.point);
        if (d.msg) live.msg = d.msg;
        paintLive();
      } else if (name === "log" && d.text) { live.log.push(d.text); if (live.log.length > 60) live.log.shift(); }
      else if (name === "ready") { live.msg = "引擎准备好了，开始运行"; paintLive(); }
    }, state).then(function (res) {
      res.map = a.map; res.at = Date.now(); res.wall = Date.now() - t0;
      status[st.id] = { passed: res.passed, total: res.total, at: res.at }; store.set("status", status);
      record(st, pnum, ptext, res);
      store.set("last." + st.id, slim(res));
      paintResult(out, st, res, false);
      paintSteps();
      if (res.passed === res.total) toast(st.train ? "训练完了：看看它写的台词。" : "全部通过。" + (st.n < STEPS.length ? "下一步：" + STEPS[st.n].title : ""), 3600);
    }, function (e) {
      var ev = e.ev || {};
      var res = { error: ev.message || e.message, where: where(a.map, ev.line), cancelled: !!ev.cancelled, timeout: !!ev.timeout, tests: live.tests, curve: live.curve, map: a.map };
      res.error = remap(a.map, res.error);
      if (!ev.cancelled) record(st, pnum, ptext, { passed: 0, total: 0, failed: true });
      paintResult(out, st, res, false);
    }).then(function () {
      running = null; c.btnRun.disabled = false; c.btnStop.hidden = true;
      store.set("draft." + st.id, null);
    });
  }
  function slim(res) { var r = Object.assign({}, res); if (r.curve && r.curve.length > 400) { var k = Math.ceil(r.curve.length / 400); r.curve = r.curve.filter(function (p, i) { return i % k === 0 || p.validLoss != null; }); } return r; }

  /* ---------- 预测台账 ---------- */
  function record(st, pnum, ptext, res) {
    var e = { at: Date.now(), step: st.n, title: st.title, pred: pnum === "" ? null : +pnum, why: ptext || "", kind: st.train ? "loss" : "count" };
    if (st.train) { e.actual = res.valLoss != null ? +res.valLoss.toFixed(3) : null; e.hit = e.pred != null && e.actual != null ? Math.abs(e.pred - e.actual) <= 0.15 : null; e.bigram = res.baselines ? +res.baselines.bigram.toFixed(3) : null; }
    else { e.actual = res.failed ? null : res.passed; e.total = res.total; e.hit = e.pred != null && e.actual != null ? e.pred === e.actual : null; }
    ledger.push(e); if (ledger.length > 500) ledger.shift();
    store.set("ledger", ledger);
  }
  function openLedger() {
    var body = h("div", { class: "lm-ledger" });
    var scored = ledger.filter(function (e) { return e.hit != null; }), hits = scored.filter(function (e) { return e.hit; }).length;
    var half = Math.floor(scored.length / 2), a = scored.slice(0, half), b = scored.slice(half);
    function rate(xs) { return xs.length ? Math.round(100 * xs.filter(function (e) { return e.hit; }).length / xs.length) + "%" : "—"; }
    body.appendChild(h("p", null, "写了预测的运行 ", h("b", { class: "num", text: String(scored.length) }), " 次，猜中 ", h("b", { class: "num", text: String(hits) }), " 次。前一半命中率 ", h("b", { class: "num", text: rate(a) }), "，后一半 ", h("b", { class: "num", text: rate(b) }), "。"));
    body.appendChild(h("p", { class: "note", text: "“猜中”的算法：测试那几步，预计通过的项数和实际一样；训练那一步，预测的验证集 loss 和实际相差不超过 0.15。没写预测的运行也记下来，但不计分。“理由”一栏是你对这一步问题的回答，不自动打分：回头对着结果自己看。表格在手机上可以左右滑。" }));
    if (!ledger.length) body.appendChild(h("p", { class: "note", text: "还没有记录。每次运行之前在“先预测，再运行”里写一个数。" }));
    else {
      var tb = h("tbody");
      ledger.slice().reverse().slice(0, 100).forEach(function (e) {
        var dt = new Date(e.at), pad = function (x) { return (x < 10 ? "0" : "") + x; };
        tb.appendChild(h("tr", null, h("td", { text: (dt.getMonth() + 1) + "/" + dt.getDate() + " " + pad(dt.getHours()) + ":" + pad(dt.getMinutes()) }), h("td", { text: String(e.step) }),
          h("td", { class: "num", text: e.pred == null ? "—" : String(e.pred) }),
          h("td", { class: "num", text: e.actual == null ? "出错" : e.kind === "loss" ? fmt(e.actual) : e.actual + "/" + e.total }),
          h("td", { text: e.hit == null ? "" : e.hit ? "✓" : "✗" }), h("td", { class: "txt", text: e.why })));
      });
      body.appendChild(h("div", { class: "tablewrap" }, h("table", { class: "data" }, h("thead", null, h("tr", null, h("th", { text: "时间" }), h("th", { text: "第几步" }), h("th", { text: "预测" }), h("th", { text: "实际" }), h("th", { text: "中" }), h("th", { text: "理由" }))), tb)));
    }
    var foot = [
      h("button", { class: "btn", type: "button", text: "导出（JSON）", onclick: function () {
        var blob = new Blob([JSON.stringify({ source: "亲手写 · 语言模型", exported: new Date().toISOString(), entries: ledger }, null, 2)], { type: "application/json" });
        var a2 = h("a", { href: URL.createObjectURL(blob), download: "lm-predictions.json" }); document.body.appendChild(a2); a2.click(); setTimeout(function () { URL.revokeObjectURL(a2.href); a2.remove(); }, 1000);
      } }),
      h("span", { style: { flex: "1" } }),
      h("button", { class: "btn", type: "button", text: "关闭", onclick: function () { m.close(); } })];
    var m = modal("预测台账", body, foot);
  }

  /* ---------- 结果 ---------- */
  function paintResult(out, st, r, stale) {
    clear(out); out.hidden = false;
    var head = h("div", { class: "lm-outhead" });
    if (r.live) head.appendChild(h("span", { class: "a-status" }, h("span", { class: "spin" }), r.msg || "正在运行…"));
    else if (r.error) head.appendChild(h("b", { class: "verdict down", text: r.cancelled ? "已停下" : r.timeout ? "超时了" : "没能运行完" }));
    else head.appendChild(h("b", { class: "verdict " + (r.passed === r.total ? "up" : "down"), text: (r.passed === r.total ? "全部通过：" : "通过 ") + r.passed + " / " + r.total + (r.passed === r.total ? "" : " 项") }));
    if (stale && r.at) head.appendChild(h("span", { class: "note", text: "上一次运行 · " + new Date(r.at).toLocaleString() }));
    if (!r.live && !r.error && r.backend) head.appendChild(h("span", { class: "tag", text: r.backend === "torch" ? "PyTorch" : "numpy" }));
    out.appendChild(head);
    if (r.error) {
      out.appendChild(h("div", { class: "warn err" }, h("div", null, h("b", { text: r.where ? "出错的位置：" + r.where + "。" : "" }), h("pre", { class: "lm-err", text: r.error }))));
    }
    if (r.tests && r.tests.length) {
      var ul = h("ul", { class: "ck-list" });
      r.tests.forEach(function (t) {
        var note = [t.msg || ""];
        var lns = t.lines && t.lines.length ? t.lines : t.line ? [t.line] : [];
        if (lns.length) note.push("位置：" + lns.map(function (n) { return where(r.map || [], n); }).join("；") + "。");
        if (t.err != null && t.ok) note.push("最大误差 " + t.err.toExponential(1) + "（容差 " + (t.tol != null ? t.tol.toExponential(1) : "—") + "）");
        ul.appendChild(h("li", { class: "ck " + (t.ok ? "pass" : "fail") }, h("span", { class: "ck-i", text: t.ok ? "✓" : "✗" }), h("span", { class: "ck-say", text: t.name }), h("span", { class: "ck-note", text: remap(r.map || [], note.filter(Boolean).join(" ")) })));
      });
      out.appendChild(ul);
    }
    if (st.train && (r.curve && r.curve.length)) out.appendChild(curveChart(r));
    if (st.train && r.baselines && !r.live) {
      var b = r.baselines;
      out.appendChild(h("div", { class: "lm-base" },
        h("table", { class: "data" }, h("caption", { text: "验证集上的平均交叉熵（nats，越小越好）" }),
          h("tbody", null,
            h("tr", { class: "me" }, h("td", { text: "你的模型（" + (r.steps || "") + " 步）" }), h("td", { text: fmt(r.valLoss) })),
            h("tr", null, h("td", { text: "只看上一个字符" }), h("td", { text: fmt(b.bigram) })),
            h("tr", null, h("td", { text: "只看字符出现的频率" }), h("td", { text: fmt(b.unigram) })),
            h("tr", null, h("td", { text: "均匀乱猜（ln " + r.vocab + "）" }), h("td", { text: fmt(b.uniform) }))))));
      out.appendChild(h("p", { class: "note", text: "参数 " + (r.params || 0).toLocaleString() + " 个 · 设备 " + r.device + " · 用了 " + fmt(r.seconds, 0) + " 秒。" }));
    }
    if (st.train && r.sample && !r.live) out.appendChild(h("div", null, h("h3", { text: "它写的（温度 0.8，400 个字符）" }), h("pre", { class: "lm-sample", text: r.sample })));
    if (!r.live && !r.error && st.train && r.passed === r.total) out.appendChild(md("比一比：字符级的 nanoGPT 在默认设置（6 层、384 维、上下文 256）下验证集 loss 大约 1.47。差距来自哪里——层数、维数、上下文还是训练步数？可以先预测，再在后面的步骤里一个个加上去试。"));
    if (r.log && r.log.length && r.live) out.appendChild(h("pre", { class: "lm-log", text: r.log.slice(-6).join("\n") }));
  }

  /* 学习曲线：训练 loss（平滑过的）、验证 loss（点），三条基线的虚线 */
  function curveChart(r) {
    var wrap = h("div", { class: "lm-chart" });
    var leg = h("div", { class: "qc-legend" },
      h("span", { class: "qc-leg" }, h("span", { class: "qc-key", style: { "--k": "var(--c-s1)" } }), "训练 loss（平滑）"),
      h("span", { class: "qc-leg" }, h("span", { class: "qc-key qc-key-dot", style: { "--k": "var(--c-s2)" } }), "验证 loss"),
      r.baselines ? h("span", { class: "qc-leg" }, h("span", { class: "qc-key qc-key-dash", style: { "--k": "var(--c-muted)" } }), "只看上一个字符") : null);
    var cv = h("canvas", { class: "qc-canvas", role: "img", "aria-label": "学习曲线" });
    wrap.appendChild(leg); wrap.appendChild(cv);
    requestAnimationFrame(function () { draw(cv, r); });
    return wrap;
  }
  function draw(cv, r) {
    var css = getComputedStyle(document.documentElement), col = function (n, d) { return (css.getPropertyValue(n) || d).trim() || d; };
    var W = Math.max(280, cv.clientWidth || 600), H = 220, dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + "px";
    var g = cv.getContext("2d"); g.scale(dpr, dpr);
    var pts = r.curve || [], xs = pts.map(function (p) { return p.step; });
    var ys = []; pts.forEach(function (p) { if (p.loss != null) ys.push(p.loss); if (p.validLoss != null) ys.push(p.validLoss); });
    var bi = r.baselines ? r.baselines.bigram : null; if (bi != null) ys.push(bi);
    if (!ys.length) return;
    var x0 = 0, x1 = Math.max.apply(null, xs.concat([1])), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    y0 = Math.max(0, Math.floor((y0 - 0.1) * 10) / 10); y1 = Math.ceil((y1 + 0.05) * 10) / 10; if (y1 - y0 < 0.5) y1 = y0 + 0.5;
    var L = 40, R = 10, T = 8, B = 24, pw = W - L - R, ph = H - T - B;
    function X(v) { return L + pw * (v - x0) / (x1 - x0 || 1); } function Y(v) { return T + ph * (1 - (v - y0) / (y1 - y0)); }
    g.font = "11px " + col("--font-mono", "monospace"); g.fillStyle = col("--c-muted", "#777"); g.strokeStyle = col("--c-grid", "#ddd"); g.lineWidth = 1;
    for (var k = 0; k <= 4; k++) { var yv = y0 + (y1 - y0) * k / 4, yy = Math.round(Y(yv)) + 0.5; g.beginPath(); g.moveTo(L, yy); g.lineTo(W - R, yy); g.stroke(); g.textAlign = "right"; g.fillText(yv.toFixed(1), L - 6, yy + 4); }
    g.textAlign = "center"; [0, 0.5, 1].forEach(function (f) { var xv = Math.round(x0 + (x1 - x0) * f); g.fillText(String(xv), Math.min(W - R - 12, Math.max(L + 8, X(xv))), H - 6); });
    if (bi != null) { g.setLineDash([4, 3]); g.strokeStyle = col("--c-muted", "#888"); g.beginPath(); g.moveTo(L, Y(bi)); g.lineTo(W - R, Y(bi)); g.stroke(); g.setLineDash([]); }
    g.strokeStyle = col("--c-s1", "#2a78d6"); g.lineWidth = 1.8; g.beginPath(); var on = false;
    pts.forEach(function (p) { if (p.loss == null) return; if (!on) { g.moveTo(X(p.step), Y(p.loss)); on = true; } else g.lineTo(X(p.step), Y(p.loss)); }); g.stroke();
    g.fillStyle = col("--c-s2", "#eb6834");
    pts.forEach(function (p) { if (p.validLoss == null) return; g.beginPath(); g.arc(X(p.step), Y(p.validLoss), 3, 0, 2 * Math.PI); g.fill(); });
  }

  /* ---------- 页面 ---------- */
  function go(n) {
    if (running) { toast("正在运行：等它结束或者先停下。", 2600); return; }
    cur = n; store.set("cur", n); render();
    var pr = $("paneRes"); if (pr) pr.scrollTop = 0;
    if (window.matchMedia && window.matchMedia("(max-width: 779.9px)").matches) setTab("res");
  }
  function render() {
    paintSteps(); paintEngine();
    var main = clear($("paneRes"));
    if (cur === 0) renderOverview(main); else renderStep(main, STEPS[cur - 1]);
    $("topStep").textContent = cur === 0 ? "总览" : "第 " + cur + " 步 · " + STEPS[cur - 1].title;
  }
  function setTab(t) {
    $("app").setAttribute("data-tab", t);
    Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === t ? "true" : "false"); });
  }
  function init() {
    Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (b) { b.addEventListener("click", function () { setTab(b.getAttribute("data-tab")); }); });
    $("btnEngine").addEventListener("click", openEngine);
    $("btnLedger").addEventListener("click", openLedger);
    var back = $("btnBack"); if (back && location.search && MODE === "http") back.href = "../" + location.search;   // 回到实验室时带上令牌
    window.addEventListener("resize", function () { var cv = document.querySelector(".lm-chart canvas"); if (cv && current && current.out && !current.out.hidden) { var last = store.get("last." + current.st.id, null); if (last && last.curve) draw(cv, last); } });
    render();
    if (MODE === "http") connect();
    else if (MODE === "mcp") {
      mcpNs().then(function (m) {
        if (!m) return;
        return Promise.resolve().then(function () { return window.claude.use("permissions"); }).then(function (p) { return p ? p.state("mcp:" + MCPN) : "unavailable"; }).catch(function () { return "unavailable"; })
          .then(function (s) { if (s === "granted") connect(); });
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
