// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 机器学习实验室 · 本机 Python 引擎的客户端（第二期，接口见 ml-engine/PROTOCOL.md）。
 * 页面要从引擎打开（终端里打印的 http://127.0.0.1:端口/ml/?engine=令牌）：引擎在页面里注入 window.QLML_ENGINE = { token, version }，
 * 页面和接口同源，请求带 X-QLML-Token 请求头。别的地方打开的页面（GitHub Pages、file://）连不上引擎，这里只显示怎么启动。
 * 一次运行：页面线程准备数据（ml-prep：训练 / 验证集、测试集的输入、快照网格）→ POST /api/run → 事件流（进度、快照、日志）→
 * 拿到原始预测以后在页面线程里打分（ml-score，和浏览器里跑的算法用同一段代码）。测试集的答案不发给引擎。 */
(function (A) {
  "use strict";
  var h = A.h, $ = A.$, clear = A.clear;
  var E = window.QLML_ENGINE || null, info = null, infoErr = "", examples = [];
  function token() { return E && E.token ? String(E.token) : ""; }
  A.engineReady = function () { return !!(token() && info); };
  A.engineInfo = function () { return info; };
  A.engineCanFetch = function () { return !!(A.engineReady() && info.fetch); };

  /* ---------- 数组的编码（PROTOCOL.md §2） ---------- */
  function b64(t) { var u8 = new Uint8Array(t.buffer, t.byteOffset, t.byteLength), s = "", CH = 0x8000; for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }
  function enc(t, shape) {
    if (t == null) return null;
    if (Array.isArray(t)) t = Float64Array.from(t);
    var code = t instanceof Float64Array ? "f8" : t instanceof Float32Array ? "f4" : t instanceof Int32Array ? "i4" : t instanceof Uint8Array ? "u1" : null;
    if (!code) throw new Error("只能编码 Float64Array / Float32Array / Int32Array / Uint8Array");
    return { $b64: b64(t), dtype: code, shape: shape || [t.length] };
  }
  function dec(o) { var bin = atob(o.$b64), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new ({ f8: Float64Array, f4: Float32Array, i4: Int32Array, u1: Uint8Array })[o.dtype](u8.buffer); }
  function reviver(k, v) { return v && typeof v === "object" && typeof v.$b64 === "string" ? dec(v) : v; }
  A.engineCodec = { enc: enc, dec: dec, reviver: reviver };

  /* ---------- 请求 ---------- */
  function api(method, path, body) {
    var o = { method: method, headers: { "X-QLML-Token": token() }, credentials: "same-origin", cache: "no-store" };
    if (body !== undefined) { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(body); }
    return fetch(path, o).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t, reviver) : null; } catch (e) {}
        if (!r.ok) { var err = new Error((j && j.error) || ("本机引擎回答 HTTP " + r.status)); err.status = r.status; err.body = j; throw err; }
        return j;
      });
    }, function () { throw new Error("连不上本机引擎：引擎可能已经关了。在终端里重新启动它，再用它打印的网址打开这一页。"); });
  }
  A.engineApi = function (method, path, body) { return api(method, path, body); };
  function refresh() {
    if (!token()) return Promise.resolve(null);
    return api("GET", "/api/info").then(function (j) { info = j; infoErr = ""; return api("GET", "/api/examples").then(function (x) { examples = (x && x.examples) || []; publish(); return info; }, function () { publish(); return info; }); },
      function (e) { info = null; infoErr = e.message; paintBtn(); return null; });
  }
  /** 把引擎的示例算法放进算法列表（"Python（本机引擎）"一组） */
  function publish() {
    var torchOk = !!(info && info.torch && info.torch.available);
    window.QL_MLPY = examples.map(function (x) {
      var needTorch = (x.needs || []).indexOf("torch") >= 0, off = needTorch && !torchOk;
      return { id: "py-" + x.id, name: x.name + (off ? "（要先装 PyTorch）" : ""), summary: x.summary || "", api: x.api, kinds: x.kinds || [], families: x.families || [], group: "py", params: x.params || [], code: x.code || "", docs: x.docs || "", src: "py", lang: "py", disabled: off };
    });
    paintBtn(); A.renderAlgo();
  }
  function paintBtn() {
    var b = $("btnEngine"); if (!b) return;
    b.hidden = false;
    var on = A.engineReady();
    b.classList.toggle("on", on);
    b.textContent = on ? "本机引擎" + (info.torch && info.torch.available ? " · " + (info.torch.device || "cpu").toUpperCase() : " · numpy") : "本机引擎";
    b.title = on ? "已连上本机的 Python 引擎（Python " + info.python + "，numpy " + info.numpy + (info.torch && info.torch.available ? "，PyTorch " + info.torch.version + "，设备 " + info.torch.device : "，没有 PyTorch") + "）" : "本机 Python 引擎：在你自己的电脑上用 Python / PyTorch 跑算法。点这里看怎么启动";
  }

  /* ---------- 一次运行 ---------- */
  A.runEngine = function (a, params, opt) {
    opt = opt || {};
    if (!A.engineReady()) { A.toast("没有连上本机引擎。点顶栏的“本机引擎”看怎么启动。", 4200); return Promise.reject(new Error("没有连上本机引擎")); }
    if (a.disabled) { A.toast("这个算法要用 PyTorch，但引擎所在的 Python 里没有装。", 4200); return Promise.reject(new Error("引擎里没有 PyTorch")); }
    var d = A.ds(), spec = A.dsSpec(), opts = A.runOpts(), key = A.expKey(), aKey = A.algoKey();
    var state = { id: null, es: null, prep: null, cancelled: false, done: false };
    var job = { cancel: function () { state.cancelled = true; if (state.prep) state.prep.cancel(); if (state.es) try { state.es.close(); } catch (e) {} if (state.id) api("POST", "/api/run/" + state.id + "/cancel", {}).catch(function () {}); } };
    var me = A.beginExternal(job, d, a), prog = function (m) { A.progress(m, me); };
    var grid = null, kk = 0;
    function fail(e) { if (state.done) return; state.done = true; var err = e && e.message ? e : { message: String(e && e.message || e) }; if (state.cancelled) err = { cancelled: true, message: "已取消" }; A.failExternal(me, err); throw err; }
    state.prep = QLMLRunner.run({ kind: "ml-prep", data: { dataset: spec, opts: opts }, mine: true, budgetMs: 30000 });
    return state.prep.promise.then(function (P) {
      if (state.cancelled) throw { cancelled: true, message: "已取消" };
      var data;
      if (P.api === "forecast") data = { y: enc(P.y), t1: P.t1, t2: P.t2, H: P.H, season: P.season, freq: P.freq, label: P.label };
      else {
        var part = function (s, withY) { var o = { X: enc(s.X, [s.n, s.d]), n: s.n, d: s.d, shape: s.shape || null, tokens: s.tokens || null }; if (withY) { o.y = enc(s.y); o.k = s.k; o.classes = s.classes || null; o.featureNames = s.featureNames || null; } return o; };
        grid = P.grid && P.grid.X ? P.grid : null; kk = P.k || 0;
        data = { kind: P.kind, train: part(P.train, true), valid: part(P.valid, true), test: part(P.test, false) };
        if (grid) data.grid = { X: enc(grid.X, [grid.X.length / (grid.kind === "fn1d" ? 1 : 2), grid.kind === "fn1d" ? 1 : 2]), kind: grid.kind };
      }
      prog({ phase: "data", msg: "发送到本机引擎…" });
      return api("POST", "/api/run", { api: P.api, kind: P.kind, code: a.code, params: params, seed: A.dsSeed(), budgetMs: opts.budgetMs, data: data }).catch(function (e) {
        if (e.status === 409) throw new Error("本机引擎正在跑另一次运行（一次只跑一个）。等它跑完，或者在引擎的终端里看看。");
        throw e;
      });
    }).then(function (r) {
      state.id = r.id;
      if (state.cancelled) { api("POST", "/api/run/" + r.id + "/cancel", {}).catch(function () {}); throw { cancelled: true, message: "已取消" }; }
      return new Promise(function (resolve, reject) {
        // 多久没有任何事件就算引擎没了（引擎每 15 秒发一次心跳注释，EventSource 看不到注释，所以按预算放宽）
        var idleMs = Math.max(60000, opts.budgetMs * 1.5 + 30000), idleT = 0;
        function arm() { clearTimeout(idleT); idleT = setTimeout(function () { try { es.close(); } catch (e) {} reject(new Error("本机引擎超过 " + Math.round(idleMs / 1000) + " 秒没有动静：它可能已经关了或者卡住了。看一下引擎的终端。")); }, idleMs); }
        var done0 = resolve, fail0 = reject; resolve = function (v) { clearTimeout(idleT); done0(v); }; reject = function (e) { clearTimeout(idleT); fail0(e); };
        var es = state.es = new EventSource(r.events + (r.events.indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(token()));
        arm();
        function J(e) { arm(); try { return JSON.parse(e.data, reviver); } catch (x) { return {}; } }
        es.addEventListener("ready", function (e) { var m = J(e); prog({ phase: "data", msg: "引擎已就绪（Python " + (m.python || "") + (m.torch ? "，PyTorch " + m.torch + " · " + (m.device || "") : "") + "）" }); });
        es.addEventListener("progress", function (e) { prog(J(e)); });
        es.addEventListener("snap", function (e) {
          var m = J(e);
          if (m.kind === "grid2d" && grid && grid.bounds) prog({ snap: { step: m.step, kind: "grid2d", data: { nx: grid.nx, ny: grid.ny, x0: grid.bounds.x0, x1: grid.bounds.x1, y0: grid.bounds.y0, y1: grid.bounds.y1, k: kk, values: m.values } } });
        });
        es.addEventListener("log", function () { arm(); });
        es.addEventListener("done", function (e) { es.close(); resolve(J(e).result); });
        es.addEventListener("error", function (e) {
          if (e.data) { es.close(); var m = J(e); reject({ message: m.message || "本机引擎报错", line: m.line || 0, cancelled: !!m.cancelled, timeout: !!m.timeout, traceback: m.traceback || "" }); return; }
          if (es.readyState === 2 && !state.done) reject(new Error("和本机引擎的连接断了：引擎可能已经关了。"));
        });
      });
    }).then(function (R) {
      if (state.cancelled) throw { cancelled: true, message: "已取消" };
      prog({ phase: "eval", msg: "打分中…" });
      var outs = { train: R.pred.train, valid: R.pred.valid, test: R.pred.test, curve: R.curve || [], log: R.log || [], fitMs: R.fitMs, predUs: R.predUs, size: R.size, internals: R.internals || null, engine: "py", ms: R.ms, importance: null };
      if (R.api !== "forecast") {
        outs.gridSnaps = (R.snaps || []).filter(function (s) { return s.kind === "grid2d" || s.kind === "fn1d"; }).map(function (s) { return { step: s.step, kind: s.kind, values: s.values }; });
        outs.snaps = (R.snaps || []).filter(function (s) { return s.kind === "embed"; }).map(function (s) { return { step: s.step, kind: "embed", data: { rows: s.rows, cols: s.cols, data: s.data } }; });
      }
      var sc = QLMLRunner.run({ kind: "ml-score", data: { dataset: spec, opts: opts, outs: outs }, mine: true, budgetMs: 30000 });
      return sc.promise.then(function (res) {
        res.engineInfo = R.engine || null;
        if (R.engine) res.log = (res.log || []).concat(["本机引擎：Python " + R.engine.python + "，numpy " + R.engine.numpy + (R.engine.torch ? "，PyTorch " + R.engine.torch + "（" + R.engine.device + "）" : "")]);
        state.done = true;
        A.endExternal(me, res, params, spec, key, aKey);
        return res;
      });
    }).catch(fail);
  };

  /* ---------- 对话框：状态与启动方法 ---------- */
  var START = [
    "# 第一次：在仓库的 strategy-lab/ml-engine 目录里装好（Python 3.10 或更新）",
    "cd strategy-lab/ml-engine",
    "python3 -m venv .venv && source .venv/bin/activate      # Windows：.venv\\Scripts\\activate",
    "pip install -e \".[torch]\"                              # 不要 PyTorch：pip install -e .",
    "",
    "# 以后每次：先构建页面（在 strategy-lab 目录里 python3 build.py），再启动引擎",
    "python -m mllab_engine",
    "# 终端里会打印 http://127.0.0.1:8765/ml/?engine=…  —— 用这个网址打开这一页"
  ].join("\n");
  A.openEngine = function () {
    var body = h("div", { class: "ml-eng" });
    function paint() {
      clear(body);
      if (A.engineReady()) {
        var t = info.torch || {};
        body.appendChild(h("div", { class: "ok-note" }, h("b", { text: "已连上本机引擎。" }), " Python " + info.python + "，numpy " + info.numpy + "，" + (t.available ? "PyTorch " + t.version + "，设备 " + t.device + (t.device === "mps" ? "（苹果芯片的 GPU）" : t.device === "cuda" ? "（NVIDIA GPU）" : "") : "没有装 PyTorch（只能跑 numpy 的算法）") + "；" + info.cpu_count + " 个 CPU 核。" + (info.busy ? "正在跑一次运行。" : "")));
        body.appendChild(h("p", { class: "note", text: "左栏的算法列表里多了“Python（本机引擎）”一组：选一个，运行时就在你的电脑上用 Python 训练。也可以选一个打开“代码与说明”，另存一份再改。数据在页面里生成、划分好以后才发给引擎；测试集只发输入，不发答案，打分在页面里做，和浏览器里跑的算法用同一份代码。" }));
        if (examples.length) body.appendChild(h("ul", { class: "ml-eng-list" }, examples.map(function (x) { return h("li", null, h("b", { text: x.name }), " · " + (x.kinds || []).map(A.kindName).join("、") + ((x.needs || []).indexOf("torch") >= 0 ? " · 要 PyTorch" : "")); })));
      } else if (E && E.needToken) {
        body.appendChild(h("div", { class: "warn", text: "这一页是本机引擎给的，但网址里没有令牌（或者令牌不对）。请用引擎终端里打印的那个完整网址打开（…/ml/?engine=…）。" }));
      } else if (E && token() && !info) {
        body.appendChild(h("div", { class: "warn err", text: "连不上本机引擎：" + (infoErr || "没有回应") + "。" }));
        body.appendChild(h("button", { class: "btn small", type: "button", text: "再试一次", onclick: function () { refresh().then(paint); } }));
      } else {
        body.appendChild(h("p", { text: "本机引擎是一个小程序，在你自己的电脑上运行，让这一页可以用 Python（numpy、PyTorch，有苹果芯片或 NVIDIA 的 GPU 时用 GPU）训练算法。它只监听本机（127.0.0.1），每次启动换一个随机令牌；只有从它打印的网址打开的页面才能用它。" }));
        body.appendChild(h("pre", { class: "code", text: START }));
        body.appendChild(h("p", { class: "note", text: "这一页现在不是从引擎打开的，所以只用浏览器里的线程（不需要引擎也能用全部内置算法）。详细的说明在仓库的 strategy-lab/ml-engine/README.md，也可以看手册里的“本机引擎”。" }));
      }
      body.appendChild(h("p", { class: "note" }, "安全：引擎会执行你选的 Python 代码，权限和你自己一样（能读写你的文件）。只运行你看过、信得过的代码；AI 写的 Python 代码也要先看一遍。", A.helpBtn ? A.helpBtn("engine:how", "本机引擎") : null));
    }
    paint();
    var m = A.modal("本机引擎", body, { narrow: true, foot: [h("span", { style: { flex: "1" } }), h("button", { class: "btn", type: "button", text: "关闭", onclick: function () { m.close(); } })] });
    if (token()) refresh().then(paint);
  };
  A.initEngine = function () {
    paintBtn();
    if (!token()) return;
    refresh().then(function () { if (A.engineReady()) A.toast("已连上本机引擎：算法列表里多了“Python（本机引擎）”一组。", 3600); });
    setInterval(function () { if (!document.hidden && token()) api("GET", "/api/info").then(function (j) { var was = !!info; info = j; if (!was) publish(); else paintBtn(); }, function () { var was = !!info; info = null; if (was) { paintBtn(); A.renderAlgo(); } }); }, 15000);
  };
})(MLA);
