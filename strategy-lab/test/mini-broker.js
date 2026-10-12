// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 测试用的极简 MQTT 中继（经 WebSocket）：只认 3.1.1 的连接、订阅（带 + 和 # 通配）、QoS 0 的发布和保留消息、心跳。
// 实时房间的测试用它代替公共的中继，这样测试不依赖外面的网络。
function need(name, fallback) { try { return require(name); } catch (e) { return require(fallback); } }
const { WebSocketServer } = need("ws", "/opt/npm-tools/node_modules/ws");
function match(filter, topic) { const a = filter.split("/"), b = topic.split("/"); for (let i = 0; i < a.length; i++) { if (a[i] === "#") return true; if (i >= b.length) return false; if (a[i] !== "+" && a[i] !== b[i]) return false; } return a.length === b.length; }
function remLen(n) { const o = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; o.push(d); } while (n > 0); return Buffer.from(o); }
function pkt(b1, body) { return Buffer.concat([Buffer.from([b1]), remLen(body.length), body]); }
function str(s) { const b = Buffer.from(s, "utf8"); return Buffer.concat([Buffer.from([b.length >> 8, b.length & 255]), b]); }
/** start(port?) → { url, port, retained: Map, clients(), log: [], drop(): 把所有连接掐断（测重连）, close() } */
function start(port) {
  return new Promise(resolve => {
    const wss = new WebSocketServer({ port: port || 0, host: "127.0.0.1", handleProtocols: ps => (ps.has("mqtt") ? "mqtt" : false) });
    const retained = new Map(), socks = new Set(), log = [];
    function deliver(topic, payload, retain, only) {
      for (const c of only ? [only] : socks) { if (c.readyState !== 1 || !c.subs) continue; if (c.subs.some(f => match(f, topic))) c.send(pkt(0x30 | (retain ? 1 : 0), Buffer.concat([str(topic), payload]))); }
    }
    wss.on("connection", ws => {
      socks.add(ws); ws.subs = []; let buf = Buffer.alloc(0);
      ws.on("close", () => socks.delete(ws));
      ws.on("message", data => {
        buf = Buffer.concat([buf, Buffer.from(data)]);
        for (;;) {
          if (buf.length < 2) return;
          let mul = 1, len = 0, i = 1, b;
          do { if (i >= buf.length) return; b = buf[i++]; len += (b & 127) * mul; mul *= 128; } while (b & 128);
          if (buf.length < i + len) return;
          const b1 = buf[0], body = buf.subarray(i, i + len); buf = buf.subarray(i + len);
          const type = b1 >> 4;
          if (type === 1) ws.send(Buffer.from([0x20, 2, 0, 0]));
          else if (type === 8) {
            const id = body.subarray(0, 2), filters = []; let k = 2;
            while (k < body.length) { const l = (body[k] << 8) | body[k + 1]; filters.push(body.subarray(k + 2, k + 2 + l).toString("utf8")); k += 2 + l + 1; }
            ws.subs.push(...filters); ws.send(Buffer.concat([Buffer.from([0x90, 2 + filters.length]), id, Buffer.alloc(filters.length)]));
            for (const [t, p] of retained) if (filters.some(f => match(f, t))) ws.send(pkt(0x31, Buffer.concat([str(t), p])));   // 订阅时把留着的消息补发过去（带保留标记）
          } else if (type === 3) {
            const tl = (body[0] << 8) | body[1], topic = body.subarray(2, 2 + tl).toString("utf8"), payload = Buffer.from(body.subarray(2 + tl));
            log.push({ topic, text: payload.toString("utf8"), retain: !!(b1 & 1) });
            if (b1 & 1) { if (payload.length) retained.set(topic, payload); else retained.delete(topic); }
            deliver(topic, payload, false);                                                                                   // 转给已经订阅的人时不带保留标记
          } else if (type === 12) ws.send(Buffer.from([0xd0, 0]));
          else if (type === 14) ws.close();
        }
      });
    });
    wss.on("listening", () => {
      const p = wss.address().port;
      resolve({ url: "ws://127.0.0.1:" + p, port: p, retained, log, clients: () => socks.size, drop: () => { for (const c of socks) c.terminate(); }, close: () => new Promise(r => { for (const c of socks) c.terminate(); wss.close(() => r()); }) });
    });
  });
}
module.exports = { start, match };
