/* ===================== 网页版 · 极简 MQTT 3.1.1 客户端（经 WebSocket） =====================
 * 只实现联机需要的部分：CONNECT/CONNACK、SUBSCRIBE/SUBACK、UNSUBSCRIBE/UNSUBACK、PUBLISH（QoS 0/1，保留消息）、
 * PUBACK、PINGREQ/PINGRESP、DISCONNECT。断线由上一层（01_shim.js）负责重连。
 * TXMQ.connect(url, { clientId, keepalive }) → { on(事件, fn), subscribe(主题[], qos), unsubscribe(主题[]), publish(主题, 字节, {qos, retain}), end() }
 * 事件：'connect'、'close'、'message'(主题, 字节, retain)
 */
const TXMQ = (() => {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const cat = parts => { let n = 0; for (const p of parts) n += p.length; const o = new Uint8Array(n); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };
  const u16 = n => Uint8Array.of((n >> 8) & 255, n & 255);
  const str = s => { const b = enc.encode(s); return cat([u16(b.length), b]); };
  const remLen = n => { const o = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; o.push(d); } while (n > 0); return Uint8Array.from(o); };
  const pkt = (b1, body) => cat([Uint8Array.of(b1), remLen(body.length), body]);
  const EMPTY = new Uint8Array(0);

  function connect(url, opt) {
    opt = opt || {};
    const keep = opt.keepalive || 30, ev = { connect: [], close: [], message: [] };
    const emit = (k, ...a) => { for (const f of ev[k]) { try { f(...a); } catch (e) { console.error('mqtt handler', e); } } };
    let ws = null, buf = new Uint8Array(0), up = false, closed = false, pid = 0, pingT = null, pongT = null, connT = null;
    const wait = new Map(); // 报文编号 → { res, rej, t }
    const nextPid = () => { for (let i = 0; i < 65535; i++) { pid = (pid % 65535) + 1; if (!wait.has(pid)) return pid; } throw new Error('no packet id'); };
    const send = b => { if (ws && ws.readyState === 1) { ws.send(b); return true; } return false; };
    const fail = why => {
      if (closed) return; closed = true; up = false;
      clearInterval(pingT); clearTimeout(pongT); clearTimeout(connT);
      for (const w of wait.values()) { clearTimeout(w.t); w.rej({ code: 'unavailable', message: why || 'closed' }); }
      wait.clear();
      try { if (ws) ws.close(); } catch (e) { }
      emit('close', why);
    };
    const pend = (id, ms) => new Promise((res, rej) => { const t = setTimeout(() => { if (wait.get(id)) { wait.delete(id); rej({ code: 'unavailable', message: 'timeout' }); } }, ms || 15000); wait.set(id, { res, rej, t }); });
    const done = (id, v) => { const w = wait.get(id); if (!w) return; wait.delete(id); clearTimeout(w.t); w.res(v); };
    function handle(b1, body) {
      const type = b1 >> 4;
      if (type === 2) { // CONNACK
        if (body[1] !== 0) { fail('refused ' + body[1]); return; }
        up = true; clearTimeout(connT);
        pingT = setInterval(() => { if (!send(Uint8Array.of(0xc0, 0))) return; clearTimeout(pongT); pongT = setTimeout(() => fail('ping timeout'), 15000); }, Math.max(5, keep * 0.6) * 1000);
        emit('connect');
      } else if (type === 3) { // PUBLISH
        const fl = b1 & 15, qos = (fl >> 1) & 3, retain = !!(fl & 1), tl = (body[0] << 8) | body[1];
        const topic = dec.decode(body.subarray(2, 2 + tl)); let i = 2 + tl, id = 0;
        if (qos > 0) { id = (body[i] << 8) | body[i + 1]; i += 2; }
        const payload = body.slice(i);
        if (qos === 1) send(pkt(0x40, u16(id)));
        else if (qos === 2) send(pkt(0x50, u16(id))); // 不会订阅 QoS 2；照规矩应答
        emit('message', topic, payload, retain);
      } else if (type === 4) done((body[0] << 8) | body[1], true); // PUBACK
      else if (type === 6) send(pkt(0x70, body.subarray(0, 2))); // PUBREL → PUBCOMP
      else if (type === 9) done((body[0] << 8) | body[1], Array.from(body.subarray(2))); // SUBACK
      else if (type === 11) done((body[0] << 8) | body[1], true); // UNSUBACK
      else if (type === 13) clearTimeout(pongT); // PINGRESP
    }
    function feed(chunk) {
      buf = buf.length ? cat([buf, chunk]) : chunk;
      for (;;) {
        if (buf.length < 2) return;
        let mul = 1, len = 0, i = 1, b;
        do { if (i >= buf.length) return; b = buf[i++]; len += (b & 127) * mul; mul *= 128; if (mul > 268435456) { fail('bad length'); return; } } while (b & 128);
        if (buf.length < i + len) return;
        const b1 = buf[0], body = buf.subarray(i, i + len);
        buf = buf.subarray(i + len);
        handle(b1, body);
        if (closed) return;
      }
    }
    try { ws = new WebSocket(url, ['mqtt']); } catch (e) { setTimeout(() => fail('bad url'), 0); }
    if (ws) {
      ws.binaryType = 'arraybuffer';
      connT = setTimeout(() => fail('connect timeout'), opt.timeout || 10000);
      ws.onopen = () => {
        const vh = cat([str('MQTT'), Uint8Array.of(4, 0x02), u16(keep)]); // 协议 3.1.1，清除会话
        send(pkt(0x10, cat([vh, str(opt.clientId || ('tx' + Math.random().toString(36).slice(2, 14)))])));
      };
      ws.onmessage = e => { if (typeof e.data === 'string') return; feed(new Uint8Array(e.data)); };
      ws.onerror = () => fail('socket error');
      ws.onclose = () => fail('socket closed');
    }
    return {
      url,
      get up() { return up; },
      on(k, f) { (ev[k] || (ev[k] = [])).push(f); },
      subscribe(filters, qos) {
        if (!up) return Promise.reject({ code: 'unavailable' });
        const id = nextPid(), q = qos == null ? 1 : qos, p = pend(id);
        send(pkt(0x82, cat([u16(id)].concat(filters.map(f => cat([str(f), Uint8Array.of(q)]))))));
        return p;
      },
      unsubscribe(filters) {
        if (!up) return Promise.resolve(false);
        const id = nextPid(), p = pend(id);
        send(pkt(0xa2, cat([u16(id)].concat(filters.map(str)))));
        return p;
      },
      publish(topic, bytes, o) {
        o = o || {}; const qos = o.qos ? 1 : 0;
        if (!up) return Promise.reject({ code: 'unavailable' });
        const data = typeof bytes === 'string' ? enc.encode(bytes) : bytes || EMPTY;
        if (!qos) { send(pkt(0x30 | (o.retain ? 1 : 0), cat([str(topic), data]))); return Promise.resolve(true); }
        const id = nextPid(), p = pend(id, 20000);
        send(pkt(0x32 | (o.retain ? 1 : 0), cat([str(topic), u16(id), data])));
        return p;
      },
      end() { if (!closed) { send(Uint8Array.of(0xe0, 0)); fail('ended'); } },
    };
  }
  return { connect, enc, dec };
})();
