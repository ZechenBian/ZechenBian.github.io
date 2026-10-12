// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 策略实验室 · 实时房间的通道（公共 MQTT 中继，没有自己的服务器）
 * GitHub 没有实时的通道，房间里"谁打到哪了"这种一秒一变的东西走公共的 MQTT 中继服务器（经 WebSocket）。
 * 上半个文件是一个极简的 MQTT 3.1.1 客户端，只实现用得到的部分：连接、订阅、发布（QoS 0，保留消息）、心跳。
 * 下半个文件是房间：房间里的东西都是"保留消息"，一个主题一份，内容是 { s: 版本戳, w: 谁写的, d: 数据 }。
 *   · 同时连几台中继，写的时候每一台都发，读的时候取并集；同一个主题以版本戳大的为准，所以重复收到、先后颠倒都没关系。
 *   · 断线自动重连；重连之后把自己写的东西再发一遍。
 *   · 房间号就是主题的一部分：知道房间号的人都能进来、都能看到里面的东西。里面只有昵称、进度和这一局的动作，没有别的。
 * 收到的内容是别人写的：这里只做 JSON 解析和类型检查，往页面上放的时候一律当纯文字。
 * 这个文件不碰界面；Node 里也能跑（Node 22 自带 WebSocket）。 */
var QLMQ = (function () {
  "use strict";
  var enc = new TextEncoder(), dec = new TextDecoder();
  function cat(parts) { var n = 0, i, o, k = 0; for (i = 0; i < parts.length; i++) n += parts[i].length; o = new Uint8Array(n); for (i = 0; i < parts.length; i++) { o.set(parts[i], k); k += parts[i].length; } return o; }
  function u16(n) { return Uint8Array.of((n >> 8) & 255, n & 255); }
  function str(s) { var b = enc.encode(s); return cat([u16(b.length), b]); }
  function remLen(n) { var o = []; do { var d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; o.push(d); } while (n > 0); return Uint8Array.from(o); }
  function pkt(b1, body) { return cat([Uint8Array.of(b1), remLen(body.length), body]); }
  function rid(n) { var s = ""; while (s.length < n) s += Math.random().toString(36).slice(2); return s.slice(0, n); }

  /** 连一台中继。返回 { up, on(事件, fn), subscribe(主题), publish(主题, 文字, 保留), end() }；事件：connect、close(原因)、message(主题, 文字, 是否保留) */
  function connect(url, opt) {
    opt = opt || {};
    var keep = opt.keepalive || 30, ev = { connect: [], close: [], message: [] }, ws = null, buf = new Uint8Array(0), up = false, closed = false, pid = 0, pingT = null, pongT = null, connT = null;
    function emit(k, a, b, c) { ev[k].slice().forEach(function (f) { try { f(a, b, c); } catch (e) { if (typeof console !== "undefined") console.error(e); } }); }
    function send(b) { if (ws && ws.readyState === 1) { try { ws.send(b); return true; } catch (e) {} } return false; }
    function fail(why) {
      if (closed) return; closed = true; up = false;
      clearInterval(pingT); clearTimeout(pongT); clearTimeout(connT);
      try { if (ws) ws.close(); } catch (e) {}
      emit("close", why || "closed");
    }
    function handle(b1, body) {
      var type = b1 >> 4;
      if (type === 2) {                                    // CONNACK
        if (body[1] !== 0) { fail("refused " + body[1]); return; }
        up = true; clearTimeout(connT);
        pingT = setInterval(function () { if (!send(Uint8Array.of(0xc0, 0))) return; clearTimeout(pongT); pongT = setTimeout(function () { fail("ping timeout"); }, 15000); }, Math.max(5, keep * 0.6) * 1000);
        emit("connect");
      } else if (type === 3) {                             // PUBLISH
        var fl = b1 & 15, qos = (fl >> 1) & 3, tl = (body[0] << 8) | body[1], topic = dec.decode(body.subarray(2, 2 + tl)), i = 2 + tl, id = 0;
        if (qos > 0) { id = (body[i] << 8) | body[i + 1]; i += 2; }
        if (qos === 1) send(pkt(0x40, u16(id)));           // 这里只订阅 QoS 0；中继真发来 QoS 1 也照规矩应答
        emit("message", topic, dec.decode(body.subarray(i)), !!(fl & 1));
      } else if (type === 13) clearTimeout(pongT);         // PINGRESP
    }
    function feed(chunk) {
      buf = buf.length ? cat([buf, chunk]) : chunk;
      for (;;) {
        if (buf.length < 2) return;
        var mul = 1, len = 0, i = 1, b;
        do { if (i >= buf.length) return; b = buf[i++]; len += (b & 127) * mul; mul *= 128; if (mul > 268435456) { fail("bad length"); return; } } while (b & 128);
        if (buf.length < i + len) return;
        var b1 = buf[0], body = buf.subarray(i, i + len);
        buf = buf.subarray(i + len);
        handle(b1, body);
        if (closed) return;
      }
    }
    try { ws = new WebSocket(url, ["mqtt"]); } catch (e) { setTimeout(function () { fail("bad url"); }, 0); }
    if (ws) {
      ws.binaryType = "arraybuffer";
      connT = setTimeout(function () { fail("connect timeout"); }, opt.timeout || 10000);
      ws.onopen = function () { send(pkt(0x10, cat([str("MQTT"), Uint8Array.of(4, 0x02), u16(keep), str(opt.clientId || "sl" + rid(14))]))); };   // 协议 3.1.1，不留会话
      ws.onmessage = function (e) { if (typeof e.data === "string") return; feed(new Uint8Array(e.data)); };
      ws.onerror = function () { fail("socket error"); };
      ws.onclose = function () { fail("socket closed"); };
    }
    return {
      url: url,
      isUp: function () { return up; },
      on: function (k, f) { ev[k].push(f); },
      subscribe: function (filter) { if (!up) return false; pid = (pid % 65535) + 1; return send(pkt(0x82, cat([u16(pid), str(filter), Uint8Array.of(0)]))); },
      publish: function (topic, text, retain) { if (!up) return false; return send(pkt(0x30 | (retain ? 1 : 0), cat([str(topic), enc.encode(text == null ? "" : text)]))); },
      end: function () { if (!closed) { send(Uint8Array.of(0xe0, 0)); fail("ended"); } }
    };
  }
  return { connect: connect, rid: rid };
})();

var QLRoom = (function () {
  "use strict";
  var DEF = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt", "wss://mqtt.eclipseprojects.io:443/mqtt"];
  var NS = "strategy-lab/v1/r/", MAX_DOC = 60000;
  /** 用哪几台中继。只有在本机打开页面时（开发、测试）才认地址里的 ?broker=ws://…，免得别人发一条链接就把你引到他的服务器上 */
  function brokers() {
    try {
      var local = location.protocol === "file:" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname), q = local ? new URLSearchParams(location.search).get("broker") : null;
      if (q) { var L = q.split(",").map(function (s) { return s.trim(); }).filter(function (s) { return /^wss?:\/\//.test(s); }).slice(0, 4); if (L.length) return L; }
    } catch (e) {}
    return DEF.slice();
  }
  function codeOk(c) { return typeof c === "string" && /^[A-Z2-9]{6}$/.test(c); }
  /** 新的房间号：6 位，去掉了容易看混的 0/O、1/I/L */
  function newCode() { var A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", s = "", a = new Uint8Array(6), i; try { crypto.getRandomValues(a); } catch (e) { for (i = 0; i < 6; i++) a[i] = Math.random() * 256; } for (i = 0; i < 6; i++) s += A[a[i] % A.length]; return s; }

  /** 进一个房间。uid：我是谁（随机编号）；on：{ doc(key, data 或 null, 谁写的), status(连上了几台, 一共几台) }
   *  返回 { set(key, data), del(key), get(key), keys(prefix), up(), close() } */
  function open(code, uid, on, opt) {
    if (!codeOk(code)) throw new Error("房间号不对");
    opt = opt || {}; on = on || {};
    var prefix = NS + code + "/", urls = opt.brokers || brokers(), docs = {}, mine = {}, dead = false;
    var conns = urls.map(function (url) { return { url: url, cl: null, up: false, tries: 0, timer: 0 }; });
    function nUp() { return conns.filter(function (c) { return c.up; }).length; }
    function status() { if (on.status) { try { on.status(nUp(), conns.length); } catch (e) {} } }
    function wire(key) { var d = docs[key]; return d.d === null ? "" : JSON.stringify({ s: d.s, w: d.w, d: d.d }); }
    function onMsg(topic, text, retained) {
      if (dead || topic.slice(0, prefix.length) !== prefix || text.length > MAX_DOC) return;
      var key = topic.slice(prefix.length), cur = docs[key], m = null;
      if (!/^[a-z0-9_\/.-]{1,80}$/i.test(key)) return;
      if (text === "") {                                   // 空消息 = 这一份被撤掉了。自己还在写的东西不让别人撤
        if (!cur || cur.d === null || mine[key]) return;
        docs[key] = { s: cur.s + 1, w: cur.w, d: null, rt: Date.now(), live: true };
        if (on.doc) on.doc(key, null, cur.w);
        return;
      }
      try { m = JSON.parse(text); } catch (e) { return; }
      if (!m || typeof m !== "object" || typeof m.s !== "number" || !(m.s === m.s) || typeof m.w !== "string" || m.w.length > 40 || m.d == null || typeof m.d !== "object") return;
      if (cur && !(m.s > cur.s || (m.s === cur.s && m.w > cur.w))) return;                  // 旧的、重复的：不理
      docs[key] = { s: m.s, w: m.w, d: m.d, rt: Date.now(), live: !retained };   // live：这是对方刚刚发的，不是中继替它留着的旧消息
      if (on.doc) on.doc(key, m.d, m.w);
    }
    function start(c) {
      if (dead) return;
      var cl = QLMQ.connect(c.url, { clientId: "sl" + QLMQ.rid(14), keepalive: 30, timeout: opt.timeout || 10000 });
      c.cl = cl;
      cl.on("connect", function () {
        c.up = true; c.tries = 0;
        cl.subscribe(prefix + "#");
        Object.keys(mine).forEach(function (k) { if (docs[k]) cl.publish(prefix + k, wire(k), true); });
        status();
      });
      cl.on("message", onMsg);
      cl.on("close", function () {
        if (c.cl !== cl) return;
        c.up = false; c.cl = null; status();
        if (!dead) c.timer = setTimeout(function () { start(c); }, Math.min(15000, 1000 * Math.pow(2, Math.min(c.tries++, 4))) * (0.7 + Math.random() * 0.6));
      });
    }
    function pub(key) { var text = wire(key), n = 0; conns.forEach(function (c) { if (c.up && c.cl.publish(prefix + key, text, true)) n++; }); return n; }
    conns.forEach(start);
    return {
      code: code, uid: uid,
      /** 写一份（保留消息）。返回这一下发到了几台中继；一台都没连上时先记着，连上了自动补发 */
      set: function (key, data) {
        var cur = docs[key], s = Math.max(Date.now(), cur ? cur.s + 1 : 0);
        docs[key] = { s: s, w: uid, d: data, rt: Date.now(), live: true }; mine[key] = 1;
        return pub(key);
      },
      del: function (key) { var cur = docs[key]; if (!cur) return 0; docs[key] = { s: cur.s + 1, w: uid, d: null, rt: Date.now(), live: true }; delete mine[key]; return pub(key); },
      get: function (key) { var d = docs[key]; return d && d.d !== null ? d.d : null; },
      /** 这一份（的最新版本）是什么时候收到的（本机时间），是不是对方刚发的。没有这一份时是 null */
      info: function (key) { var d = docs[key]; return d && d.d !== null ? { rt: d.rt, live: d.live, w: d.w } : null; },
      keys: function (pre) { return Object.keys(docs).filter(function (k) { return docs[k].d !== null && k.slice(0, pre.length) === pre; }); },
      up: nUp, total: function () { return conns.length; },
      close: function () {
        if (dead) return;
        Object.keys(mine).forEach(function (k) { conns.forEach(function (c) { if (c.up) c.cl.publish(prefix + k, "", true); }); });   // 走的时候把自己的东西撤掉
        dead = true;
        conns.forEach(function (c) { clearTimeout(c.timer); if (c.cl) { var cl = c.cl; c.cl = null; c.up = false; setTimeout(function () { cl.end(); }, 30); } });
      }
    };
  }
  return { open: open, newCode: newCode, codeOk: codeOk, brokers: brokers, NS: NS };
})();
if (typeof module !== "undefined" && module.exports) module.exports = { QLMQ: QLMQ, QLRoom: QLRoom };
