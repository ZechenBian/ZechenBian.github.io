// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 数据接口：把任意来源的数值序列变成实验室能用的"价格水平"。
 * 不只认行情：任何一列数字都可以导入，由你指定它是价格、收益率还是一般信号。 */
var QLIO = (function () {
  "use strict";
  var MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  function splitLine(line, d) {
    if (d === " ") return line.trim().split(/\s+/);
    if (line.indexOf('"') < 0) return line.split(d);
    var out = [], cur = "", q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === d) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur); return out;
  }
  function parseNum(s, decComma) {
    if (s == null) return NaN;
    s = String(s).trim(); if (!s || s === "." || s === "-" || /^(na|nan|null|n\/a|--)$/i.test(s)) return NaN;
    s = s.replace(/[$¥€£%\s]/g, "");
    if (decComma && s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");   // 欧式：点是千分位，逗号是小数点
    else s = s.replace(/,/g, "");
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
    return parseFloat(s);
  }
  /** 把各种常见写法的时间变成毫秒；认不出返回 NaN */
  function parseTime(s) {
    if (s == null) return NaN; s = String(s).trim().replace(/^"|"$/g, ""); if (!s) return NaN;
    var m;
    if (/^\d{16,19}$/.test(s)) return Math.floor(+s / (s.length >= 19 ? 1e6 : 1e3));      // 微秒 / 纳秒
    if (/^\d{13}$/.test(s)) return +s;                                                   // 毫秒
    if (/^\d{10}$/.test(s)) return +s * 1000;                                            // 秒
    if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s)) && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31 && +m[1] > 1600) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s))) return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s))) return Date.UTC(+m[3], +m[1] - 1, +m[2], +(m[4] || 0), +(m[5] || 0));   // 美式 月/日/年
    if ((m = /^(\d{1,2})[- ]([A-Za-z]{3})[A-Za-z]*[- ,]+(\d{2,4})$/.exec(s)) && MON[m[2].toLowerCase()] != null) { var y = +m[3]; if (y < 100) y += y < 70 ? 2000 : 1900; return Date.UTC(y, MON[m[2].toLowerCase()], +m[1]); }
    if ((m = /^([A-Za-z]{3})[A-Za-z]*\.? (\d{1,2}),? (\d{4})$/.exec(s)) && MON[m[1].toLowerCase()] != null) return Date.UTC(+m[3], MON[m[1].toLowerCase()], +m[2]);
    if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s))) return Date.UTC(+m[3], +m[2] - 1, +m[1]);                 // 欧式 日.月.年
    if ((m = /^(\d{4})[-\/](\d{1,2})$/.exec(s))) return Date.UTC(+m[1], +m[2] - 1, 1);
    return NaN;
  }

  /** 文本 → 表格。自动识别分隔符、跳过开头的说明行、判断有没有表头 */
  function parseTable(text) {
    text = String(text || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    var raw = text.split("\n").filter(function (l) { return l.trim() !== ""; });
    if (!raw.length) throw new Error("文件是空的");
    var probe = raw.slice(0, 40), best = ",", bestScore = -1;
    [",", ";", "\t", "|"].forEach(function (d) {
      var counts = probe.map(function (l) { return splitLine(l, d).length; }), mode = {}, top = 1, topC = 0;
      counts.forEach(function (c) { mode[c] = (mode[c] || 0) + 1; if (mode[c] > topC || (mode[c] === topC && c > top)) { topC = mode[c]; top = c; } });
      var score = top > 1 ? topC * Math.min(top, 12) : 0;
      if (score > bestScore) { bestScore = score; best = d; }
    });
    if (bestScore <= 0) best = " ";
    var rows = raw.map(function (l) { return splitLine(l, best).map(function (c) { return c.trim(); }); });
    // 列数取众数；开头列数不对的行（网址、注释）跳过
    var freq = {}, ncol = 1, top = 0; rows.slice(0, 200).forEach(function (r) { freq[r.length] = (freq[r.length] || 0) + 1; if (freq[r.length] > top) { top = freq[r.length]; ncol = r.length; } });
    var start = 0; while (start < rows.length && (rows[start].length !== ncol || /^#/.test(rows[start][0]))) start++;
    rows = rows.slice(start).filter(function (r) { return r.length === ncol && !/^#/.test(r[0]); });
    if (!rows.length) throw new Error("没有找到成列的数据");
    var decComma = best === ";" && rows.slice(0, 50).some(function (r) { return r.some(function (c) { return /^-?[\d.]+,\d+$/.test(c); }); });
    function isData(c) { return parseNum(c, decComma) === parseNum(c, decComma) || parseTime(c) === parseTime(c); }
    var first = rows[0], header = null;
    if (rows.length > 1 && first.some(function (c) { return !isData(c) && c !== ""; }) && first.filter(function (c) { return !isData(c); }).length >= Math.ceil(ncol / 2)) { header = first; rows = rows.slice(1); }
    if (!header) header = first.map(function (_, i) { return "第 " + (i + 1) + " 列"; });
    // 每一列的类型
    var cols = header.map(function (name, j) {
      var nNum = 0, nTime = 0, n = Math.min(rows.length, 300), lastNum = NaN, big = 0;
      for (var i = 0; i < n; i++) { var c = rows[i][j], v = parseNum(c, decComma); if (v === v) { nNum++; lastNum = v; if (Math.abs(v) > 1e9) big++; } if (parseTime(c) === parseTime(c) && !/^-?\d+(\.\d+)?$/.test(c.replace(/^(\d{8}|\d{10}|\d{13}|\d{16,19})$/, "x"))) nTime++; }
      return { name: name, index: j, numFrac: nNum / n, timeFrac: nTime / n, bigFrac: big / n };
    });
    return { header: header, rows: rows, cols: cols, delimiter: best, decComma: decComma, skipped: start };
  }

  /** 猜哪一列是时间、哪一列是要用的数值 */
  function guess(tb) {
    var cols = tb.cols, timeCol = -1, valCol = -1, i;
    function find(re, pred) { for (var k = 0; k < cols.length; k++) if (re.test(cols[k].name) && (!pred || pred(cols[k]))) return k; return -1; }
    var isTime = function (c) { return c.timeFrac > 0.8; }, isNum = function (c) { return c.numFrac > 0.8; };
    timeCol = find(/^(date|datetime|observation_date|日期|时间|time|timestamp)$/i, isTime);
    if (timeCol < 0) timeCol = find(/date|日期|时间/i, isTime);
    if (timeCol < 0) timeCol = find(/time|unix|ts/i, isTime);
    if (timeCol < 0) for (i = 0; i < cols.length; i++) if (isTime(cols[i])) { timeCol = i; break; }
    valCol = find(/adj.*close/i, isNum);
    if (valCol < 0) valCol = find(/^(close|close\/last|last|收盘|收盘价)$/i, isNum);
    if (valCol < 0) valCol = find(/close|last|收盘/i, isNum);
    if (valCol < 0) valCol = find(/price|value|价格|数值|^px/i, isNum);
    // 没有表头的交易所 K 线：开盘时间, 开, 高, 低, 收, 量, ...
    if (valCol < 0 && cols.length >= 6 && /^第 /.test(cols[0].name) && cols[0].timeFrac > 0.8 && cols.slice(1, 5).every(isNum)) { timeCol = 0; valCol = 4; }
    if (valCol < 0) { for (i = cols.length - 1; i >= 0; i--) if (i !== timeCol && isNum(cols[i]) && !/vol|成交|count|数量|^n$/i.test(cols[i].name) && cols[i].bigFrac < 0.5) { valCol = i; break; } }
    if (valCol < 0) for (i = 0; i < cols.length; i++) if (i !== timeCol && isNum(cols[i])) { valCol = i; break; }
    return { timeCol: timeCol, valCol: valCol };
  }

  /** 表格 → 序列。mode: price 价格 / ret 收益率（小数）/ retpct 收益率（%）/ logret 对数收益 / signal 一般信号 */
  function buildSeries(tb, opt) {
    var rows = tb.rows, pts = [], i, tOK = 0;
    for (i = 0; i < rows.length; i++) {
      var x = parseNum(rows[i][opt.valCol], tb.decComma); if (!(x === x)) continue;
      var t = opt.timeCol >= 0 ? parseTime(rows[i][opt.timeCol]) : NaN; if (t === t) tOK++;
      pts.push({ t: t, x: x, i: i });
    }
    if (pts.length < 30) throw new Error("这一列只有 " + pts.length + " 个有效数字，至少需要 30 个");
    var hasT = opt.timeCol >= 0 && tOK > pts.length * 0.9;
    if (hasT) {
      pts = pts.filter(function (p) { return p.t === p.t; }).sort(function (a, b) { return a.t - b.t || a.i - b.i; });
      var dd = []; pts.forEach(function (p) { if (dd.length && dd[dd.length - 1].t === p.t) dd[dd.length - 1] = p; else dd.push(p); }); pts = dd;
    }
    var n = pts.length, v = new Float64Array(n), mode = opt.mode || "price", lev = 100, dropped = 0;
    if (mode === "price") {
      var keep = pts.filter(function (p) { return p.x > 0; }); dropped = n - keep.length; pts = keep; n = pts.length; v = new Float64Array(n);
      for (i = 0; i < n; i++) v[i] = pts[i].x;
    } else if (mode === "signal") {
      var cut = Math.max(10, Math.floor(n * 0.7)), s = 0, s2 = 0; for (i = 0; i < cut; i++) { s += pts[i].x; s2 += pts[i].x * pts[i].x; }
      var mu = s / cut, sd = Math.sqrt(Math.max(1e-300, s2 / cut - mu * mu)), k = (opt.sens == null ? 2 : opt.sens) / 100;
      for (i = 0; i < n; i++) v[i] = 100 * Math.exp(k * (pts[i].x - mu) / sd);
    } else {
      // 第一个点是起点水平，之后每个数是一步的收益
      v = new Float64Array(n + 1); v[0] = 100;
      for (i = 0; i < n; i++) {
        var r = mode === "retpct" ? pts[i].x / 100 : pts[i].x;
        lev = mode === "logret" ? lev * Math.exp(r) : lev * (1 + Math.max(-0.999, r)); v[i + 1] = lev;
      }
    }
    if (v.length < 30) throw new Error("有效数据点太少（" + v.length + " 个）");
    var tArr = null, K = 252;
    if (hasT) {
      tArr = pts.map(function (p) { return p.t; });
      if (mode !== "price" && mode !== "signal") tArr = [tArr[0] - (tArr[1] - tArr[0])].concat(tArr);
      var yrs = (tArr[tArr.length - 1] - tArr[0]) / (365.25 * 864e5);
      if (yrs > 0) K = Math.max(1, Math.round((tArr.length - 1) / yrs));
      if (K >= 245 && K <= 258) K = 252; else if (K >= 360 && K <= 368) K = 365; else if (K >= 50 && K <= 53) K = 52;
    }
    return { v: v, t: tArr, K: K, n: v.length, dropped: dropped, hasTime: hasT };
  }

  function fmtDate(ms) { var d = new Date(ms); return d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + d.getUTCDate()).slice(-2); }
  function describe(ds) {
    var s = ds.v.length + " 个点";
    if (ds.t) s += "，" + fmtDate(ds.t[0]) + " 至 " + fmtDate(ds.t[ds.t.length - 1]);
    s += "，每年约 " + ds.K + " 步";
    return s;
  }

  /* ---------- 本机存储（尽力而为；读不到也不影响使用） ---------- */
  var KEY = "ql.lab.v1";
  function load() { try { var s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function save(obj) { try { localStorage.setItem(KEY, JSON.stringify(obj)); return true; } catch (e) { return false; } }
  function packDs(ds) { return { id: ds.id, name: ds.name, K: ds.K, mode: ds.mode, note: ds.note || "", v: Array.from(ds.v, function (x) { return +x.toPrecision(7); }), t: ds.t ? [ds.t[0]].concat(ds.t.slice(1).map(function (x, i) { return Math.round((x - ds.t[i]) / 1000); })) : null }; }
  function unpackDs(o) { var t = null; if (o.t) { t = [o.t[0]]; for (var i = 1; i < o.t.length; i++) t.push(t[i - 1] + o.t[i] * 1000); } return { id: o.id, name: o.name, K: o.K, mode: o.mode, note: o.note, v: Float64Array.from(o.v), t: t, src: "import" }; }

  return { parseTable: parseTable, guess: guess, buildSeries: buildSeries, parseNum: parseNum, parseTime: parseTime, fmtDate: fmtDate, describe: describe, load: load, save: save, packDs: packDs, unpackDs: unpackDs };
})();
if (typeof module !== "undefined" && module.exports) module.exports = QLIO;
