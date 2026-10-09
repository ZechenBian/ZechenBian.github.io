// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
const { ok, near, section, done } = require("./harness.js");
const IO = require("../src/io.js");
function run(text, mode, over) { const tb = IO.parseTable(text), g = Object.assign(IO.guess(tb), over || {}); const s = IO.buildSeries(tb, { timeCol: g.timeCol, valCol: g.valCol, mode: mode || "price" }); return { tb, g, s }; }
function days(n, start, step) { const out = []; let t = Date.UTC(start[0], start[1] - 1, start[2]); while (out.length < n) { const d = new Date(t); if (step !== 1 || (d.getUTCDay() !== 0 && d.getUTCDay() !== 6)) out.push(t); t += 864e5; } return out; }
const iso = t => IO.fmtDate(t);
section("CSV 格式识别");
{ // Stooq
  const ds = days(300, [2024, 1, 2], 1); let txt = "Date,Open,High,Low,Close,Volume\n" + ds.map((t, i) => `${iso(t)},${100 + i},${101 + i},${99 + i},${100.5 + i},${1e6 + i}`).join("\n");
  const r = run(txt); ok(r.tb.header[4] === "Close" && r.g.timeCol === 0 && r.g.valCol === 4, "Stooq：时间列与收盘列"); ok(r.s.n === 300 && r.s.v[0] === 100.5 && r.s.K === 261, "Stooq：300 点；无节假日的工作日序列每年 261 步", `K=${r.s.K}`);
}
{ // Nasdaq：美式日期、美元符号、倒序
  const ds = days(260, [2025, 1, 2], 1).reverse(); let txt = "Date,Close/Last,Volume,Open,High,Low\n" + ds.map((t, i) => { const d = new Date(t); return `${("0" + (d.getUTCMonth() + 1)).slice(-2)}/${("0" + d.getUTCDate()).slice(-2)}/${d.getUTCFullYear()},$${(500 - i).toFixed(2)},${48290123 + i},$${(499 - i).toFixed(2)},$501.00,$498.10`; }).join("\n");
  const r = run(txt); ok(r.g.valCol === 1 && r.g.timeCol === 0, "Nasdaq：Close/Last 列"); ok(r.s.v[0] === 500 - 259 && r.s.v[r.s.n - 1] === 500 && r.s.t[0] < r.s.t[1], "Nasdaq：倒序被排成时间正序、$ 被去掉"); ok(r.s.K === 261, "Nasdaq：工作日序列 K=261", String(r.s.K));
}
{ // FRED：缺失值
  const ds = days(400, [2023, 1, 2], 1); let txt = "observation_date,SP500\n" + ds.map((t, i) => `${iso(t)},${i % 37 === 5 ? "" : (4000 + i * 2.5).toFixed(2)}`).join("\n");
  let r = run(txt); ok(r.g.valCol === 1 && r.s.n === 400 - Math.floor((400 - 6) / 37) - 1, "FRED：空值被跳过", `n=${r.s.n}`);
  txt = "DATE,CBBTCUSD\n" + ds.map((t, i) => `${iso(t)},${i % 50 === 0 ? "." : (60000 + i * 10)}`).join("\n"); r = run(txt); ok(r.s.n === 392, "FRED 旧格式：\".\" 被跳过", `n=${r.s.n}`);
}
{ // CryptoDataDownload：首行网址、倒序、毫秒时间戳、7×24
  const ds = days(400, [2025, 6, 1], 7).slice(0, 0); const ts = []; for (let i = 0; i < 400; i++) ts.push(Date.UTC(2025, 5, 1) + i * 864e5); ts.reverse();
  const txt = "https://www.CryptoDataDownload.com\nUnix,Date,Symbol,Open,High,Low,Close,Volume BTC,Volume USDT,tradecount\n" + ts.map((t, i) => `${t},${iso(t)},BTCUSDT,${80000 + i},${80100 + i},${79900 + i},${80050 - i},7993.11,683674414.67,1340109`).join("\n");
  const r = run(txt); ok(r.tb.skipped === 1 && r.tb.header[6] === "Close", "CDD：跳过首行网址"); ok(r.g.valCol === 6 && (r.g.timeCol === 1 || r.g.timeCol === 0), "CDD：收盘列", `time=${r.g.timeCol}`); ok(r.s.K === 365 && r.s.v[0] === 80050 - 399, "CDD：7×24 → K=365，按时间正序", `K=${r.s.K}`);
}
{ // Binance K 线：无表头
  for (const unit of [1, 1000]) { const rows = []; for (let i = 0; i < 200; i++) { const t = (Date.UTC(2024, 0, 1) + i * 3600e3) * unit; rows.push(`${t},${42000 + i},${42100 + i},${41900 + i},${42050 + i},1271.68,${t + 3599999 * unit},53957248.97,47134,682.57,28957416.81,0`); }
    const r = run(rows.join("\n")); ok(r.g.timeCol === 0 && r.g.valCol === 4, `Binance（${unit === 1 ? "毫秒" : "微秒"}）：第 1 列时间、第 5 列收盘`); ok(r.s.v[3] === 42053 && Math.abs(r.s.K - 8766) < 10, "Binance 小时线：K ≈ 8766", `K=${r.s.K}`); }
}
{ // matplotlib msft.csv 的日期写法
  const txt = "Date,Open,High,Low,Close,Volume,Adj. Close*\n" + Array.from({ length: 40 }, (_, i) => `${("0" + (28 - (i % 28))).slice(-2)}-${i < 28 ? "Sep" : "Aug"}-03,29.76,29.97,29.52,${(29.96 - i * 0.1).toFixed(2)},92433800,${(29.79 - i * 0.1).toFixed(2)}`).join("\n");
  const r = run(txt); ok(r.g.valCol === 6, "Adj. Close 优先"); ok(r.s.t[0] < r.s.t[5] && new Date(r.s.t[r.s.n - 1]).getUTCFullYear() === 2003, "日-月缩写-两位年");
}
{ // 分号 + 欧式小数
  const txt = "Datum;Schluss\n" + Array.from({ length: 40 }, (_, i) => `${("0" + (1 + (i % 28))).slice(-2)}.0${1 + Math.floor(i / 28)}.2020;13.${300 + i},93`).join("\n");
  const r = run(txt); near(r.s.v[0], 13300.93, 1e-9, "欧式数字 13.300,93"); ok(r.s.hasTime, "欧式日期 日.月.年");
}
{ // 太阳黑子（SILSO）：分号、无表头、没有可识别的时间列，需要手动选第 4 列
  const txt = Array.from({ length: 120 }, (_, i) => `${1749 + Math.floor(i / 12)};${("0" + (1 + i % 12)).slice(-2)};${(1749 + (i + 0.5) / 12).toFixed(3)};${(96.7 + 30 * Math.sin(i / 20)).toFixed(1).padStart(6)}; -1.0;   -1;1`).join("\n");
  const tb = IO.parseTable(txt); ok(tb.delimiter === ";" && tb.cols.length === 7 && /^第 1 列/.test(tb.header[0]), "太阳黑子：分号分隔、无表头");
  const s = IO.buildSeries(tb, { timeCol: -1, valCol: 3, mode: "signal", sens: 2 }); ok(s.n === 120 && !s.hasTime && s.v.every(x => x > 0), "一般信号 → 正的价格水平");
  let m = 0; for (let i = 0; i < 84; i++) m += Math.log(s.v[i] / 100); near(m / 84, 0, 1e-9, "信号模式：前 70% 标准化后均值为 0");
}
{ // 只有一列数字（粘贴）+ 收益率模式
  const txt = Array.from({ length: 50 }, (_, i) => (i % 2 ? 1.5 : -1).toString()).join("\n"); const tb = IO.parseTable(txt), g = IO.guess(tb);
  ok(g.valCol === 0 && g.timeCol === -1, "单列"); const s = IO.buildSeries(tb, { timeCol: -1, valCol: 0, mode: "retpct" }); ok(s.n === 51, "收益率模式多出一个起点"); near(s.v[2], 100 * 0.99 * 1.015, 1e-9, "收益率（%）累乘");
  const s2 = IO.buildSeries(tb, { timeCol: -1, valCol: 0, mode: "logret" }); near(s2.v[1], 100 * Math.exp(-1), 1e-9, "对数收益累加");
}
{ // 存取往返
  const ds = { id: "x", name: "t", K: 252, mode: "price", v: Float64Array.from([1.23456789, 2, 3]), t: [1000, 87400000, 173800000] }; const back = IO.unpackDs(JSON.parse(JSON.stringify(IO.packDs(ds))));
  ok(back.t[2] === 173800000 && Math.abs(back.v[0] - 1.234568) < 1e-6, "数据集压缩存取"); ok(IO.describe(back).includes("3 个点"), "描述");
}
ok(isNaN(IO.parseTime("123.45")) && isNaN(IO.parseTime("22351900")) && IO.parseTime("2024-03-05 13:30") === Date.UTC(2024, 2, 5, 13, 30), "时间解析的边界");
done();
