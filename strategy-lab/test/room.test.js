// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 实时房间的通道（mq.js）：极简 MQTT 客户端和房间里的"保留消息"。用本机的假中继（mini-broker.js），不连外面的网络
const path = require("path"), { ok, section, done } = require("./harness.js");
const broker = require("./mini-broker.js"), { QLMQ, QLRoom } = require(path.join(__dirname, "../src/mq.js"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 4000)) { if (f()) return true; await sleep(25); } return false; };

(async () => {
  section("一、房间号");
  {
    const codes = []; for (let i = 0; i < 300; i++) codes.push(QLRoom.newCode());
    ok(codes.every(c => /^[A-Z2-9]{6}$/.test(c) && !/[01ILO]/.test(c)) && new Set(codes).size > 295, "新房间号：6 位，不含 0、1、I、L、O，基本不重样");
    ok(QLRoom.codeOk("ABC234") && ["abc234", "ABC23", "ABC2345", "ABC10L", "", null, 123456].every(c => !QLRoom.codeOk(c)), "认得出写法不对的房间号");
    let threw = false; try { QLRoom.open("nope", "u", {}); } catch (e) { threw = true; } ok(threw, "房间号不对时不去连中继");
    ok(QLRoom.brokers().length === 3 && QLRoom.brokers().every(u => /^wss:\/\//.test(u)), "默认用三台公共中继，都走加密的连接");
  }

  section("二、MQTT 客户端");
  const B1 = await broker.start(), B2 = await broker.start();
  {
    const got = [], a = QLMQ.connect(B1.url, {}), b = QLMQ.connect(B1.url, {});
    b.on("message", (t, text, retained) => got.push([t, text, retained]));
    ok(await until(() => a.isUp() && b.isUp()), "连得上");
    ok(a.publish("x/keep", "旧消息 ✓", true) && a.publish("x/gone", "不留", false), "连上之后能发");
    await sleep(60); b.subscribe("x/#");
    ok(await until(() => got.length === 1) && got[0][0] === "x/keep" && got[0][1] === "旧消息 ✓" && got[0][2] === true, "订阅时收到中继留着的那一条（带\"保留\"标记，中文不乱码）；没留的那条收不到", JSON.stringify(got));
    a.publish("x/live", "刚发的", true);
    ok(await until(() => got.length === 2) && got[1][2] === false, "订阅之后别人新发的：不带\"保留\"标记", JSON.stringify(got[1]));
    const big = new Array(3000).join("长消息");
    a.publish("x/big", big, false);
    ok(await until(() => got.length === 3) && got[2][1] === big, "几 KB 的消息（要用两个字节写长度）收发无误");
    let closed = ""; a.on("close", why => { closed = why; }); a.end();
    ok(await until(() => closed === "ended") && !a.isUp() && a.publish("x/y", "z") === false, "关掉之后不再发");
    const c = QLMQ.connect("ws://127.0.0.1:9/nope", { timeout: 1500 }); let why = ""; c.on("close", w => { why = w; });
    ok(await until(() => !!why, 3000) && !c.isUp(), "连不上的地址：报一次关闭，不抛错", why);
    b.end();
  }

  section("三、房间：一个主题一份，版本戳大的为准");
  const evA = [], evB = [], st = [];
  const A = QLRoom.open("ABC234", "ua", { doc: (k, d, w) => evA.push([k, d, w]), status: (n, t) => st.push(n + "/" + t) }, { brokers: [B1.url, B2.url] });
  ok(await until(() => A.up() === 2) && st[st.length - 1] === "2/2" && A.total() === 2, "两台中继都连上，状态有通知", st.join(" "));
  ok(A.set("p/ua", { n: "甲", t: 1 }) === 2 && A.get("p/ua").t === 1, "写一份：两台中继都发到，自己立刻读得到");
  await sleep(80);
  const B = QLRoom.open("ABC234", "ub", { doc: (k, d, w) => evB.push([k, d, w, B.info(k) && B.info(k).live]) }, { brokers: [B1.url, B2.url] });
  ok(await until(() => evB.length >= 1) && evB.length === 1 && evB[0][0] === "p/ua" && evB[0][1].n === "甲" && evB[0][2] === "ua" && evB[0][3] === false, "后进来的人收到之前留着的那一份，只通知一次（两台中继各发来一份，重复的不理），并且知道这是旧消息", JSON.stringify(evB));
  A.set("p/ua", { n: "甲", t: 2 });
  ok(await until(() => evB.length === 2) && evB[1][1].t === 2 && evB[1][3] === true && B.get("p/ua").t === 2, "对方更新：收到新的，标着\"刚发的\"");
  await sleep(120); ok(evB.length === 2 && evA.length === 0, "同一份不会通知两遍；自己写的不通知自己");
  B.set("cfg", { k: 1 }); ok(await until(() => evA.length === 1) && A.get("cfg").k === 1 && A.keys("p/").join() === "p/ua" && A.keys("").sort().join() === "cfg,p/ua", "另一个方向也通；keys 按前缀列出现有的");
  // 旧版本、坏消息、过大的消息、别的房间的消息：都不理
  const raw = QLMQ.connect(B1.url, {}); await until(() => raw.isUp());
  const P = "strategy-lab/v1/r/ABC234/", n0 = evB.length;
  raw.publish(P + "p/ua", JSON.stringify({ s: 1, w: "ua", d: { n: "旧", t: 0 } }), true);
  raw.publish(P + "p/ux", "{不是 JSON", true); raw.publish(P + "p/uy", JSON.stringify({ s: "x", w: "u", d: {} }), true); raw.publish(P + "p/uz", JSON.stringify({ s: 5, w: "u", d: "字符串" }), true);
  raw.publish(P + "p/uw", JSON.stringify({ s: Date.now(), w: "u", d: { junk: new Array(70000).join("x") } }), true);
  raw.publish(P + "坏 键", JSON.stringify({ s: Date.now(), w: "u", d: {} }), true);
  raw.publish("strategy-lab/v1/r/ZZZ999/p/ua", JSON.stringify({ s: Date.now() * 2, w: "ua", d: { n: "别的房间" } }), true);
  await sleep(200);
  ok(evB.length === n0 && B.get("p/ua").t === 2 && B.keys("p/").join() === "p/ua", "版本更旧的、不是 JSON 的、字段不对的、过大的、键不合规矩的、别的房间的：一概不理", JSON.stringify(evB.slice(n0)));
  // 别人想撤掉我正在写的东西：不让
  raw.publish(P + "p/ua", "", true); await sleep(150);
  ok(A.get("p/ua") && A.get("p/ua").t === 2, "别人往我的主题上发空消息，我自己这一份不受影响");
  ok(B.get("p/ua") === null, "（别人那里会当成我撤掉了，直到我下一次报到）");
  A.set("p/ua", { n: "甲", t: 3 }); ok(await until(() => B.get("p/ua") && B.get("p/ua").t === 3), "我再报到一次，别人那里就恢复了");

  section("四、掉线重连；离开");
  B1.drop(); B2.drop();
  ok(await until(() => A.up() === 0, 3000), "中继把连接掐断：状态变成没连上", st.slice(-3).join(" "));
  ok(A.set("p/ua", { n: "甲", t: 9 }) === 0 && A.get("p/ua").t === 9, "没连上时写的先记在本机");
  ok(await until(() => A.up() === 2 && B.up() === 2, 12000), "过一会儿自己连回来");
  ok(await until(() => B.get("p/ua") && B.get("p/ua").t === 9, 4000), "连回来之后把没发出去的补发，别人收得到");
  A.close();
  ok(await until(() => B.get("p/ua") === null) && ![...B1.retained.keys()].some(k => k.endsWith("ABC234/p/ua")) && ![...B2.retained.keys()].some(k => k.endsWith("ABC234/p/ua")), "离开：把自己留在两台中继上的东西都撤掉，别人那里也没有了");
  ok([...B1.retained.keys()].some(k => k.endsWith("ABC234/cfg")), "别人写的东西不动");
  await sleep(100); const up0 = A.up(); A.set("p/ua", { n: "甲" }); await sleep(150);
  ok(up0 === 0 && B.get("p/ua") === null, "离开之后不再连、不再发");
  raw.end(); B.close(); await sleep(80); await B1.close(); await B2.close();
  done();
  setTimeout(() => process.exit(process.exitCode || 0), 200);
})().catch(e => { console.error("CRASH", e); process.exit(1); });
