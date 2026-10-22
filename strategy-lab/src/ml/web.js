// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 机器学习实验室 · 从网上取数据。
 * 三种找法：
 *   用一句话描述 → 你接入的 AI 给出几个数据文件的地址（附要预测的列、任务类型、要丢掉的列、要筛的行）→ 页面按顺序去取，取到第一个能用的为止；
 *   直接填一个数据文件的网址；
 *   从下面"现成的"里挑（地址都核实过：GitHub 上公开的数据仓库）。
 * 取的办法：先在浏览器里直接取（不带 Cookie）；GitHub 的地址取不到时换 jsDelivr 的镜像；网站不允许网页直接读（跨域限制）时，
 * 连着本机引擎就请引擎去取（POST /api/fetch，只取公网地址）。取来的文件可以是 CSV、TSV、JSON、JSON Lines，也可以是 .gz 或 .zip 压缩的。
 * 取到以后先预览，确认要预测的列和任务类型再导入；导入后和导入 CSV 一样用，数据集标成"从网上取的数据"并记下地址。
 * 接的 AI 是 Claude 时（独立网页里），它在服务商那边先上网搜索（web_search），再给地址；别家只能凭记忆给。
 * 在 Claude 里打开页面时，页面不能自己联网（Artifact 的安全规则），改请 Claude 桌面版替它取：接上本机引擎（本地 MCP 服务器）就经引擎取，
 * 没接上就用桌面版自带的浏览器（host:claude_browser：打开那个地址、读出页面上的文字；只能取不压缩的文本文件）。每次都要你允许。 */
var QL_MLWEBCAT = [
  // 时间序列（GitHub 上 datasets 组织的公开数据包，大多是 ODC-PDDL 公有领域；数据一直在更新）
  { id: "sp500", name: "标普 500 月度（1871 年起，Shiller）", url: "https://raw.githubusercontent.com/datasets/s-and-p-500/main/data/data.csv", kind: "forecast", target: "SP500", time: "Date", desc: "标普 500 指数的月度值，另有股息、盈利、CPI、长期利率、PE10 等列（2023 年 6 月以后只更新了指数本身）。", source: "Robert Shiller / FRED，经 github.com/datasets/s-and-p-500 整理", license: "ODC-PDDL-1.0", real: true, keys: "股票 指数 美股 sp500 s&p shiller 月线" },
  { id: "vix", name: "VIX 恐慌指数日线（1990 年起）", url: "https://raw.githubusercontent.com/datasets/finance-vix/main/data/vix-daily.csv", kind: "forecast", target: "CLOSE", time: "DATE", desc: "CBOE 波动率指数的日线开高低收。", source: "CBOE，经 github.com/datasets/finance-vix 整理", license: "ODC-PDDL-1.0", real: true, keys: "波动率 vix 恐慌 期权 日线" },
  { id: "brent", name: "布伦特原油日价（1987 年起）", url: "https://raw.githubusercontent.com/datasets/oil-prices/main/data/brent-daily.csv", kind: "forecast", target: "Price", time: "Date", desc: "每桶美元。", source: "美国能源信息署 EIA，经 github.com/datasets/oil-prices 整理", license: "ODC-PDDL-1.0", real: true, keys: "原油 石油 油价 brent 大宗商品 日线" },
  { id: "wti", name: "WTI 原油日价（1986 年起）", url: "https://raw.githubusercontent.com/datasets/oil-prices/main/data/wti-daily.csv", kind: "forecast", target: "Price", time: "Date", desc: "每桶美元。", source: "美国能源信息署 EIA，经 github.com/datasets/oil-prices 整理", license: "ODC-PDDL-1.0", real: true, keys: "原油 石油 油价 wti 大宗商品 日线" },
  { id: "gold", name: "黄金月价（1833 年起）", url: "https://raw.githubusercontent.com/datasets/gold-prices/main/data/monthly.csv", kind: "forecast", target: "Price", time: "Date", desc: "每盎司美元。", source: "World Bank 与 Timothy Green 的历史记录，经 github.com/datasets/gold-prices 整理", license: "ODC-PDDL-1.0", real: true, keys: "黄金 金价 gold 贵金属 月线" },
  { id: "gas", name: "美国天然气日价（1997 年起，Henry Hub）", url: "https://raw.githubusercontent.com/datasets/natural-gas/main/data/daily.csv", kind: "forecast", target: "Price", time: "Date", desc: "每百万英热单位美元。", source: "美国能源信息署 EIA，经 github.com/datasets/natural-gas 整理", license: "ODC-PDDL-1.0", real: true, keys: "天然气 能源 henry hub 日线" },
  { id: "us10y", name: "美国 10 年期国债收益率月度（1953 年起）", url: "https://raw.githubusercontent.com/datasets/bond-yields-us-10y/main/data/monthly.csv", kind: "forecast", target: "Rate", time: "Date", desc: "百分比。", source: "美联储，经 github.com/datasets/bond-yields-us-10y 整理", license: "ODC-PDDL-1.0", real: true, keys: "国债 利率 收益率 bond yield 美债 月线" },
  { id: "cpi", name: "美国 CPI 月度（1913 年起）", url: "https://raw.githubusercontent.com/datasets/cpi-us/main/data/cpiai.csv", kind: "forecast", target: "Index", time: "Date", drop: ["Inflation"], desc: "城市居民消费价格指数（1982–84 = 100），另有同比通胀率一列。", source: "美国劳工统计局 BLS，经 github.com/datasets/cpi-us 整理", license: "公有领域（美国联邦政府数据）", real: true, keys: "通胀 物价 cpi 消费价格 月线" },
  { id: "caseshiller", name: "美国全国房价指数月度（1975 年起，Case-Shiller）", url: "https://raw.githubusercontent.com/datasets/house-prices-us/main/data/national-month.csv", kind: "forecast", target: "National-US", time: "Date", drop: ["National-US-SA"], desc: "S&P CoreLogic Case-Shiller 全国房价指数（未季调；另一列是季调后的）。", source: "S&P Dow Jones Indices，经 github.com/datasets/house-prices-us 整理", license: "见数据包的说明", real: true, keys: "房价 房地产 case shiller 住房 月线" },
  { id: "co2", name: "莫纳罗亚 CO₂ 浓度月均（1958 年起）", url: "https://raw.githubusercontent.com/datasets/co2-ppm/main/data/co2-mm-mlo.csv", kind: "forecast", target: "Average", time: "Date", desc: "百万分之一（ppm），有明显的年周期和上升趋势。", source: "NOAA，经 github.com/datasets/co2-ppm 整理", license: "ODC-PDDL-1.0", real: true, keys: "二氧化碳 气候 co2 季节 月度" },
  { id: "temp", name: "全球气温距平月度（1850 年起，GCAG）", url: "https://raw.githubusercontent.com/datasets/global-temp/main/data/monthly.csv", kind: "forecast", target: "Mean", time: "Year", filter: { Source: "GCAG" }, drop: ["Source"], desc: "相对于 20 世纪平均的气温距平（°C）；原文件里两个来源交错，这里只取 GCAG。", source: "NOAA，经 github.com/datasets/global-temp 整理", license: "ODC-PDDL-1.0", real: true, keys: "气温 气候 温度 全球变暖 月度" },
  { id: "fx-cny", name: "人民币兑美元日汇率（1981 年起）", url: "https://raw.githubusercontent.com/datasets/exchange-rates/main/data/daily.csv", kind: "forecast", target: "Exchange rate", time: "Date", filter: { Country: "China" }, drop: ["Country"], desc: "每美元兑多少人民币；原文件有二十多种货币，这里只取 China。换成别的国家：取到以后在“只留这些行”里改。", source: "美联储 H.10，经 github.com/datasets/exchange-rates 整理", license: "ODC-PDDL-1.0", real: true, keys: "汇率 人民币 外汇 美元 fx 日线" },
  { id: "seaice", name: "北极海冰面积日度（1978 年起）", url: "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/seaice.csv", kind: "forecast", target: "Extent", time: "Date", desc: "百万平方公里，强烈的年周期。", source: "NSIDC，经 seaborn-data 整理", license: "见 seaborn-data 的说明", real: true, keys: "海冰 北极 气候 季节 日度" },
  { id: "flights", name: "航空旅客人数月度（1949–1960）", url: "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/flights.csv", kind: "forecast", target: "passengers", desc: "Box–Jenkins 的经典“航空旅客”序列：趋势 + 随水平增大的季节波动（取对数后才是加性的）。", source: "Box & Jenkins（1976），经 seaborn-data 整理", license: "见 seaborn-data 的说明", real: true, keys: "航空 旅客 airline 季节 经典 月度" },
  // 表格：分类
  { id: "penguins", name: "帕尔默企鹅物种（344 只）", url: "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/penguins.csv", kind: "classification", target: "species", desc: "三种企鹅的嘴长、嘴厚、鳍长、体重、岛屿、性别；有少量缺失值。", source: "Gorman 等（2014），Palmer Station LTER，经 seaborn-data 整理", license: "CC0（palmerpenguins）", real: true, keys: "企鹅 penguins 物种 生物 分类" },
  { id: "titanic", name: "泰坦尼克号乘客生还（891 人）", url: "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/titanic.csv", kind: "classification", target: "survived", drop: ["alive", "class", "who", "adult_male", "embark_town", "deck"], desc: "舱位、性别、年龄、同行亲属、票价、登船港口。丢掉了 alive（就是答案本身）和几列重复的。", source: "Kaggle / Encyclopedia Titanica，经 seaborn-data 整理", license: "见 seaborn-data 的说明", real: true, keys: "泰坦尼克 titanic 生还 乘客 分类" },
  // 表格：回归
  { id: "diamonds", name: "钻石价格（5.4 万颗，随机取 5 万）", url: "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/diamonds.csv", kind: "regression", target: "price", desc: "克拉、切工、颜色、净度、尺寸。价格的分布很偏：可以想想要不要对价格取对数。", source: "ggplot2，经 seaborn-data 整理", license: "见 seaborn-data 的说明", real: true, keys: "钻石 diamonds 价格 回归" },
  { id: "mpg", name: "汽车油耗（398 款，1970–82）", url: "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/mpg.csv", kind: "regression", target: "mpg", drop: ["name"], desc: "气缸数、排量、马力、车重、加速、年份、产地；马力有少量缺失。", source: "UCI Auto MPG，经 seaborn-data 整理", license: "见 seaborn-data 的说明", real: true, keys: "汽车 油耗 mpg 回归" },
  { id: "tips", name: "餐厅小费（244 单）", url: "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/tips.csv", kind: "regression", target: "tip", desc: "账单金额、性别、是否吸烟、星期、午餐或晚餐、人数。", source: "Bryant & Smith（1995），经 seaborn-data 整理", license: "见 seaborn-data 的说明", real: true, keys: "小费 tips 餐厅 回归" },
  { id: "taxis", name: "纽约出租车小费（6433 单）", url: "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/taxis.csv", kind: "regression", target: "tip", drop: ["pickup", "dropoff", "total"], desc: "距离、车费、过路费、乘客数、颜色、付款方式、上下车区域。丢掉了 total（它包含小费，会泄露答案）。", source: "NYC TLC，经 seaborn-data 整理", license: "见 seaborn-data 的说明", real: true, keys: "出租车 纽约 小费 taxi 回归" }
];
if (typeof module !== "undefined" && module.exports) module.exports = QL_MLWEBCAT;

if (typeof MLA !== "undefined") (function (A) {
  "use strict";
  var h = A.h, $ = A.$, clear = A.clear, QL = A.QL, S = A.S, G = A.G;
  var MAXB = 30 * 2 ** 20, LIM = (QL.mlreg && QL.mlreg.limits && QL.mlreg.limits.rows) || 50000;
  var KINDS = [["regression", "回归"], ["classification", "分类"], ["forecast", "时间序列预测"]];
  var SITE = "https://zechenbian.github.io/strategy-lab/ml/", SEARCHES = 5;
  function kindOfGroup() { var g = A.group(); return g.family === "timeseries" ? "forecast" : g.kind || "regression"; }
  function hostOf(u) { try { return new URL(u).host; } catch (e) { return ""; } }
  function okUrl(u) { try { var x = new URL(u); return (x.protocol === "https:" || x.protocol === "http:") && !x.username && !x.password; } catch (e) { return false; } }

  /* ---------- 取：浏览器直接取 → GitHub 换镜像 → 本机引擎 ---------- */
  function timeoutSignal(ms, outer) { var c = new AbortController(), t = setTimeout(function () { c.abort(); }, ms); if (outer) outer.addEventListener("abort", function () { c.abort(); }); return { signal: c.signal, done: function () { clearTimeout(t); } }; }
  async function readCapped(resp) {
    var len = +resp.headers.get("Content-Length") || 0; if (len > MAXB) throw new Error("文件太大（" + (len / 2 ** 20).toFixed(0) + " MB），最多 " + (MAXB / 2 ** 20) + " MB。");
    if (!resp.body || !resp.body.getReader) return new Uint8Array(await resp.arrayBuffer());
    var rd = resp.body.getReader(), parts = [], n = 0;
    for (;;) { var x = await rd.read(); if (x.done) break; n += x.value.length; if (n > MAXB) { try { rd.cancel(); } catch (e) {} throw new Error("文件太大，超过了 " + (MAXB / 2 ** 20) + " MB。"); } parts.push(x.value); }
    var out = new Uint8Array(n), o = 0; parts.forEach(function (p) { out.set(p, o); o += p.length; }); return out;
  }
  async function direct(url, sig) {
    var t = timeoutSignal(30000, sig);
    try {
      var r = await fetch(url, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer", redirect: "follow", signal: t.signal });
      if (!r.ok) { var e = new Error("网站回答 HTTP " + r.status + "。"); e.http = r.status; throw e; }
      return { bytes: await readCapped(r), url: r.url || url, contentType: r.headers.get("Content-Type") || "" };
    } finally { t.done(); }
  }
  /** raw.githubusercontent.com/{owner}/{repo}/{branch}/{path} → cdn.jsdelivr.net/gh/{owner}/{repo}@{branch}/{path} */
  function mirror(url) { var m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/.exec(url); return m ? "https://cdn.jsdelivr.net/gh/" + m[1] + "/" + m[2] + "@" + m[3] + "/" + m[4] : null; }
  async function viaEngine(url) {
    var r = await A.engineFetch(url);
    return { bytes: r.packed === "gzip" ? await inflate(r.bytes, "gzip") : r.bytes, url: r.url || url, contentType: r.contentType || "" };
  }
  /* 在 Claude 里、没接本机引擎时：请 Claude 桌面版自带的浏览器打开这个地址，读出页面上的文字（get_page_text）。
     它的回答是"Title: …\nURL: …\nSource element: …\n---\n正文"，太长时末尾有"[truncated to N chars]"。纯文本文件的标题是空的；有标题的是网页 */
  var BRN = "host:claude_browser", BRMAX = 2000000, brTab = null, brUrl = "";
  function pageText(t) {
    var s = String(t || ""), m = /^Title:[ \t]*(.*)\r?\nURL:[ \t]*(.*)\r?\n(?:Source element:.*\r?\n)?---\r?\n/.exec(s);
    var o = { title: m ? m[1].trim() : "", url: m ? m[2].trim() : "", body: m ? s.slice(m[0].length) : s, truncated: false };
    var tc = o.body.lastIndexOf("\n\nTab Context:"); if (tc >= 0) o.body = o.body.slice(0, tc);
    var tr = /\s*\[truncated to \d+ chars\]\s*$/.exec(o.body); if (tr) { o.truncated = true; o.body = o.body.slice(0, tr.index); }
    return o;
  }
  A.webPageText = pageText;
  function wait(ms, sig) { return new Promise(function (ok, no) { var t = setTimeout(ok, ms); if (sig) sig.addEventListener("abort", function () { clearTimeout(t); no(new Error("已停止。")); }, { once: true }); }); }
  var BRERR = {
    server_not_connected: "Claude 桌面版的浏览器连不上：要在 Claude 桌面版里打开这一页（网页版的 Claude、手机上没有这个浏览器）。",
    not_in_manifest: "你没有允许这个页面使用 Claude 桌面版的浏览器（或者在这个页面的权限里关掉了它）。",
    approval_required: "要你允许这个页面使用 Claude 桌面版的浏览器，但没有得到允许。", cancelled: "你没有允许这一次。",
    blocked_by_policy: "你所在组织的设置不允许这个页面使用 Claude 桌面版的浏览器。", not_granted: "当前的打开方式下用不了 Claude 桌面版的浏览器。", capability_disabled: "当前的打开方式下用不了 Claude 桌面版的浏览器。"
  };
  function brErr(e) { return e && e.code === "tool_error" ? (A.mcpText(e.result) || e.message || "浏览器报错。") : e && BRERR[e.code] ? BRERR[e.code] : e && e.code ? "浏览器出错了（" + e.code + "）。" : String(e && e.message || e); }
  async function viaBrowser(url, sig) {
    if (/\.(gz|zip|bz2|xz|7z|xlsx?|parquet|feather)(\?|#|$)/i.test(url)) throw new Error("压缩文件、Excel 之类经浏览器取不了（浏览器会把它当成下载）：要接上本机引擎。");
    var before = brUrl, r0;
    try {
      if (brTab) { try { await A.mcpCall(BRN, "navigate", { url: url, tabId: brTab }); } catch (e) { if (e && e.code === "tool_error") brTab = null; else throw e; } }
      if (!brTab) {
        r0 = await A.mcpCall(BRN, "preview_start", { url: url });
        var m = /tabId\s+([A-Za-z0-9_:-]+)/.exec(A.mcpText(r0));
        if (!m) throw new Error("Claude 桌面版的浏览器没有说新开的标签页是哪个。");
        brTab = m[1]; before = "";
      }
      var last = null;
      for (var k = 0; k < 8; k++) {
        await wait(k === 0 ? 500 : 900, sig);
        var p = pageText(A.mcpText(await A.mcpCall(BRN, "get_page_text", { tabId: brTab, max_chars: BRMAX })));
        if (!p.body.trim() || (p.url === before && p.url !== url)) continue;     // 还在加载，或者还停在上一页（下载类的地址不会换页）
        if (last && last.body.length === p.body.length) { last = p; break; }
        last = p; if (p.truncated) break;
      }
    } catch (e) { if (sig && sig.aborted) throw e; throw new Error(brErr(e)); }
    if (!last) throw new Error("浏览器没有打开这个文件（可能被当成了下载，或者打不开）。");
    brUrl = last.url;
    if (last.title) throw new Error("取到的是网页（" + last.title.slice(0, 40) + "），不是数据文件：要找“下载”的那个地址（通常以 .csv、.json 结尾）。");
    var body = last.body.replace(/^Pretty[- ]?print\s*\n/i, "");
    if (last.truncated) { var nl = body.lastIndexOf("\n"); if (nl > 0) body = body.slice(0, nl); }
    return { bytes: new TextEncoder().encode(body), url: last.url || url, contentType: "", truncated: last.truncated };
  }
  /** 依次试几种办法；log(文字, 好坏) 记下每一步 */
  async function getBytes(url, log, sig) {
    var errs = [];
    if (A.aiHost) {                    // 在 Claude 里：页面自己不能联网，只能请 Claude 桌面版去取
      if (A.engineCanFetch && A.engineCanFetch()) {
        try { log("请本机引擎去取（经 Claude 桌面版）…"); var e1 = await viaEngine(url); e1.via = "engine"; log("✓ 本机引擎取到了（" + size(e1.bytes.length) + "）", "good"); return e1; }
        catch (e) { if (sig && sig.aborted) throw e; if (/HTTP (404|410)/.test(e.message || "")) throw new Error("没有这个文件（" + e.message + "）"); errs.push("本机引擎：" + e.message); log("✕ 本机引擎：" + e.message, "bad"); }
      } else errs.push("本机引擎没有连上（点顶栏的“本机引擎”看怎么连）");
      try { log("请 Claude 桌面版的浏览器去取 …"); var b1 = await viaBrowser(url, sig); b1.via = "browser"; log("✓ 浏览器取到了（" + size(b1.bytes.length) + "）", "good"); return b1; }
      catch (e) { if (sig && sig.aborted) throw e; errs.push("浏览器：" + e.message); log("✕ 浏览器：" + e.message, "bad"); }
      var eh = new Error(errs.join("；")); eh.all = errs; throw eh;
    }
    try { log("直接取 " + hostOf(url) + " …"); var r = await direct(url, sig); r.via = "direct"; log("✓ 取到了（" + size(r.bytes.length) + "）", "good"); return r; }
    catch (e) { if (sig && sig.aborted) throw e; if (e.http === 404 || e.http === 410) throw new Error("没有这个文件（网站回答 HTTP " + e.http + "）。"); var cors = !e.http; errs.push(cors ? "浏览器读不到（多半是这个网站不允许网页直接读，也可能是网络不通）" : e.message); log("✕ " + errs[errs.length - 1], "bad"); }
    var mu = mirror(url);
    if (mu) { try { log("换 jsDelivr 的镜像 …"); var r2 = await direct(mu, sig); r2.via = "mirror"; log("✓ 取到了（" + size(r2.bytes.length) + "）", "good"); return r2; } catch (e) { if (sig && sig.aborted) throw e; errs.push("镜像：" + e.message); log("✕ " + e.message, "bad"); } }
    if (A.engineCanFetch && A.engineCanFetch()) {
      try { log("请本机引擎去取 …"); var r3 = await viaEngine(url); r3.via = "engine"; log("✓ 本机引擎取到了（" + size(r3.bytes.length) + "）", "good"); return r3; }
      catch (e) { if (sig && sig.aborted) throw e; errs.push("本机引擎：" + e.message); log("✕ 本机引擎：" + e.message, "bad"); }
    } else errs.push(A.engineReady && A.engineReady() ? "本机引擎的版本太旧，不能替页面取数据" : "没有连上本机引擎（连上以后，浏览器读不到的网站可以请它去取）");
    var err = new Error(errs.join("；")); err.all = errs; throw err;
  }
  function size(n) { return n < 1024 ? n + " 字节" : n < 2 ** 20 ? (n / 1024).toFixed(0) + " KB" : (n / 2 ** 20).toFixed(1) + " MB"; }

  /* ---------- 解压与转码 ---------- */
  async function inflate(u8, fmt) {
    if (typeof DecompressionStream === "undefined") throw new Error("这个浏览器不会解压（没有 DecompressionStream）：换新一点的浏览器，或者先下载解压再用“导入 CSV”。");
    var s = new Blob([u8]).stream().pipeThrough(new DecompressionStream(fmt));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  var DATA_EXT = /\.(csv|tsv|txt|tab|json|jsonl|ndjson|dat)$/i;
  /** 最小的 zip 读取：中央目录 → 挑一个数据文件（指定了名字就用它，否则最大的那个）→ 存储或 deflate 解压 */
  async function unzip(u8, want) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), eocd = -1, i;
    for (i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("zip 文件坏了（找不到目录）。");
    var n = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true), list = [], td = new TextDecoder();
    for (i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("zip 文件坏了（目录项不对）。");
      var nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      list.push({ method: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), usize: dv.getUint32(p + 24, true), off: dv.getUint32(p + 42, true), name: td.decode(u8.subarray(p + 46, p + 46 + nl)) });
      p += 46 + nl + el + cl;
    }
    var files = list.filter(function (e) { return !/\/$/.test(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name); });
    var pick = want ? files.filter(function (e) { return e.name === want || e.name.split("/").pop() === want; })[0] : null;
    if (!pick) { var cand = files.filter(function (e) { return DATA_EXT.test(e.name); }); cand.sort(function (a, b) { return b.usize - a.usize; }); pick = cand[0]; }
    if (!pick) throw new Error("zip 里没有数据文件（.csv、.tsv、.json……）。里面有：" + files.slice(0, 8).map(function (e) { return e.name; }).join("、"));
    if (pick.csize === 0xffffffff || pick.off === 0xffffffff) throw new Error("这个 zip 太大（zip64），读不了：先下载解压再用“导入 CSV”。");
    if (pick.usize > 120 * 2 ** 20) throw new Error("zip 里的 " + pick.name + " 解压后太大（" + size(pick.usize) + "）。");
    var q = pick.off; if (dv.getUint32(q, true) !== 0x04034b50) throw new Error("zip 文件坏了（文件头不对）。");
    var start = q + 30 + dv.getUint16(q + 26, true) + dv.getUint16(q + 28, true), comp = u8.subarray(start, start + pick.csize);
    var bytes = pick.method === 0 ? comp : pick.method === 8 ? await inflate(comp, "deflate-raw") : null;
    if (!bytes) throw new Error("zip 用了不认识的压缩方法（" + pick.method + "）。");
    return { name: pick.name, bytes: bytes, others: files.length - 1 };
  }
  function decodeText(u8) {
    var start = u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf ? 3 : 0, b = u8.subarray(start);
    try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(b), enc: "UTF-8" }; } catch (e) {}
    try { return { text: new TextDecoder("gb18030", { fatal: true }).decode(b), enc: "GB18030" }; } catch (e) {}
    return { text: new TextDecoder("windows-1252").decode(b), enc: "Windows-1252" };
  }
  /** 字节 → 文字（自动识别 gzip、zip；zip 里挑一个数据文件） */
  async function bytesToText(u8, plan) {
    var notes = [];
    if (u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b) { u8 = await inflate(u8, "gzip"); notes.push("gzip 解压后 " + size(u8.length)); }
    if (u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04) { var z = await unzip(u8, plan.zipEntry); u8 = z.bytes; notes.push("从 zip 里取了 " + z.name + (z.others ? "（另有 " + z.others + " 个文件）" : "")); }
    var d = decodeText(u8); if (d.enc !== "UTF-8") notes.push("按 " + d.enc + " 编码读");
    return { text: d.text, notes: notes };
  }

  /* ---------- 文字 → 表格（CSV / TSV / JSON / JSON Lines），筛行，控制行数 ---------- */
  function cellStr(v) { return v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); }
  function flatten(o, pre, out, depth) { for (var k in o) { var v = o[k], key = pre ? pre + "." + k : k; if (v && typeof v === "object" && !Array.isArray(v) && depth < 2) flatten(v, key, out, depth + 1); else out[key] = v; } return out; }
  function findRecords(j, path) {
    if (path) { var cur = j; String(path).split(".").forEach(function (seg) { if (cur == null) return; cur = /^\d+$/.test(seg) && Array.isArray(cur) ? cur[+seg] : cur[seg]; }); if (Array.isArray(cur)) return cur; throw new Error("JSON 里 " + path + " 不是一个数组。"); }
    var best = null;
    (function walk(x, d) {
      if (!x || typeof x !== "object" || d > 4) return;
      if (Array.isArray(x)) { if (x.length && (typeof x[0] === "object") && (!best || x.length > best.length)) best = x; x.slice(0, 3).forEach(function (y) { walk(y, d + 1); }); return; }
      Object.keys(x).forEach(function (k) { walk(x[k], d + 1); });
    })(j, 0);
    if (!best) throw new Error("JSON 里找不到记录的数组。");
    return best;
  }
  function recordsToTable(recs) {
    if (Array.isArray(recs[0])) { var hd = recs[0].map(cellStr); return { header: hd, rows: recs.slice(1).map(function (r) { return hd.map(function (_, i) { return cellStr(r[i]); }); }) }; }
    var flat = recs.map(function (r) { return r && typeof r === "object" ? flatten(r, "", {}, 0) : { value: r }; }), keys = [], seen = {};
    flat.slice(0, 1000).forEach(function (r) { Object.keys(r).forEach(function (k) { if (!seen[k]) { seen[k] = 1; keys.push(k); } }); });
    return { header: keys, rows: flat.map(function (r) { return keys.map(function (k) { return cellStr(r[k]); }); }) };
  }
  /** 行数超过上限时：时间序列留最近的，其余按固定种子随机抽（保持原来的顺序） */
  function limitRows(rows, kind, warnings) {
    if (rows.length <= LIM) return rows;
    var n0 = rows.length;
    if (kind === "forecast") { warnings.push("一共 " + n0 + " 行，超过 " + LIM + " 行的上限：只留最近的 " + LIM + " 行。"); return rows.slice(n0 - LIM); }
    var rng = new QL.RNG(20261021, 7, 0), idx = []; for (var i = 0; i < n0; i++) idx.push(i);
    for (i = 0; i < LIM; i++) { var j = i + rng.int(n0 - i), t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    idx = idx.slice(0, LIM).sort(function (a, b) { return a - b; });
    warnings.push("一共 " + n0 + " 行，超过 " + LIM + " 行的上限：随机取了 " + LIM + " 行（种子固定，每次取到的一样）。");
    return idx.map(function (k) { return rows[k]; });
  }
  function applyFilter(t, filter, warnings) {
    var ks = filter ? Object.keys(filter) : []; if (!ks.length) return t;
    var cols = ks.map(function (k) { var j = t.header.indexOf(k); if (j < 0) throw new Error("要筛的列“" + k + "”不在表里（表里有：" + t.header.slice(0, 12).join("、") + (t.header.length > 12 ? "……" : "") + "）。"); return j; });
    var n0 = t.rows.length, rows = t.rows.filter(function (r) { return ks.every(function (k, q) { return String(r[cols[q]]).trim() === String(filter[k]).trim(); }); });
    if (!rows.length) { var vals = {}; t.rows.slice(0, 20000).forEach(function (r) { vals[String(r[cols[0]]).trim()] = 1; }); throw new Error("按 " + ks.map(function (k) { return k + " = " + filter[k]; }).join("、") + " 筛完一行也不剩。“" + ks[0] + "”这一列的取值有：" + Object.keys(vals).slice(0, 30).join("、") + "。"); }
    warnings.push("只留 " + ks.map(function (k) { return k + " = " + filter[k]; }).join("、") + " 的行：" + n0 + " 行里留下 " + rows.length + " 行。");
    return { header: t.header, rows: rows, delimiter: t.delimiter, hasHeader: true, warnings: t.warnings };
  }
  /** 文字 + 取法 → { table（parseCSV 的格式）, warnings, format } */
  A.webTable = function (text, plan) {
    plan = plan || {}; var warnings = [], fmt = plan.format && plan.format !== "auto" ? plan.format : null, s = text.replace(/^﻿/, ""), t0 = s.slice(0, 2000).trim();
    if (!fmt) fmt = /^[\[{]/.test(t0) ? (/^\{[^\n]*\}\s*\n\s*\{/.test(t0) ? "jsonl" : "json") : /\t/.test(t0.split("\n")[0]) ? "tsv" : "csv";
    if (/^\s*<(!doctype|html|\?xml)/i.test(t0)) throw new Error("取到的是网页（HTML），不是数据文件：要找“下载”的那个地址（通常以 .csv、.json 结尾）。");
    var t;
    if (fmt === "json" || fmt === "jsonl") {
      var recs;
      if (fmt === "jsonl") recs = s.split(/\r?\n/).filter(function (l) { return l.trim(); }).slice(0, 400000).map(function (l) { return JSON.parse(l); });
      else { var j; try { j = JSON.parse(s); } catch (e) { throw new Error("JSON 读不出来：" + e.message); } recs = findRecords(j, plan.jsonPath); }
      if (!recs.length) throw new Error("JSON 里的记录是空的。");
      t = recordsToTable(recs); t.delimiter = ","; t.hasHeader = true; t.warnings = [];
      if (t.header.length > QL.mlreg.limits.cols) throw new Error("列太多（" + t.header.length + " 列），最多 " + QL.mlreg.limits.cols + " 列。");
    } else {
      // 很大的 CSV：先按行切开、筛行、控制行数，再交给 parseCSV（带引号的换行在这么大的文件里很少见）
      var lines = s.split(/\r?\n/);
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      if (lines.length - 1 > LIM) {
        var head = lines[0], body = lines.slice(1);
        if (plan.filter) { var vs = Object.keys(plan.filter).map(function (k) { return String(plan.filter[k]).trim(); }); body = body.filter(function (l) { return vs.every(function (v) { return l.indexOf(v) >= 0; }); }); }
        body = limitRows(body, plan.kind, warnings);
        s = [head].concat(body).join("\n");
      }
      t = QL.mlreg.parseCSV(s, fmt === "tsv" ? { delimiter: "\t" } : undefined);
    }
    t = applyFilter(t, plan.filter, warnings);
    if (t.rows.length > LIM) t.rows = limitRows(t.rows, plan.kind, warnings);
    if (t.rows.length < 10) throw new Error("数据太少：只有 " + t.rows.length + " 行。");
    return { table: t, warnings: warnings.concat(t.warnings || []), format: fmt };
  };
  /** 打开页面时重新去取（上次从网上取的文件太大、没有存原文） */
  A.webRefetch = async function (web) {
    if (A.aiHost && A.engineSettled) await A.engineSettled();        // 在 Claude 里：先等本机引擎（允许过的话）连上
    var r = await getBytes(web.url, function () {});
    var d = await bytesToText(r.bytes, web.plan || {}), T = A.webTable(d.text, web.plan || {});
    return { table: T.table, text: d.text };
  };

  /* ---------- AI：把描述变成几个候选的地址 ---------- */
  function catLine(c) { return "- " + c.name + " | " + c.url + " | kind=" + c.kind + " | target=" + c.target + (c.time ? " | time=" + c.time : "") + (c.filter ? " | filter=" + JSON.stringify(c.filter) : "") + (c.drop ? " | drop=" + JSON.stringify(c.drop) : ""); }
  function prompt(desc, kind, failed, search) {
    return [
      "你是数据检索助手，替一个浏览器里的机器学习实验室找可以直接下载的数据文件。用中文写说明。",
      "# 使用者想要的数据\n" + desc,
      "# 实验室现在的任务\n" + A.group().name + "（kind = " + kind + "）。可以选 regression（回归）、classification（分类）、forecast（时间序列预测）；描述里说清楚了要别的任务，就按描述来。",
      "# 要求\n" + [
        "- 给 1 到 4 个候选，按把握从大到小排。必须是文件本身的地址（CSV、TSV、JSON、JSON Lines，或者它们的 .gz / .zip），不是网页；不要需要登录、API 密钥或付费的。",
        search ? "- 你可以用网络搜索（web_search 工具），最多 " + SEARCHES + " 次。先搜索，找到数据文件本身的下载地址（直链）；只给在搜索结果里见到过、或者你确信真实存在的地址，不要编造。搜索结果里的网页本身不算，要的是网页上“下载”的那个文件地址。" : "- 只给你确信真实存在的地址，不确定就少给几个，不要编造。",
        A.aiHost ? (A.engineCanFetch && A.engineCanFetch() ? "- 页面经使用者电脑上的本机引擎去取，不受跨域限制，也可以是 .gz / .zip。" : "- 页面经使用者电脑上的浏览器去取：只能是不压缩的文本文件（CSV、TSV、JSON、JSON Lines），最好不超过 2 MB；不要 .gz / .zip。needsEngine 一律写 false。") :
        "- 浏览器只能直接读允许跨域的网站。优先用：raw.githubusercontent.com（GitHub 上公开的数据仓库，比如 github.com/datasets/*、mwaskom/seaborn-data、owid/* 等）、cdn.jsdelivr.net/gh/…、huggingface.co/datasets/<名字>/resolve/main/<文件>。别的网站只有在使用者连着本机引擎时才取得到，这种候选把 needsEngine 设成 true。",
        "- 一个文件最多 30 MB；超过 5 万行时实验室会自动抽样（时间序列留最近的）。",
        "- 指定 target（要预测的那一列，名字和文件里的表头一字不差）、kind、time（时间序列的日期列；没有就不写）、drop（要丢掉的列，特别是会泄露答案的列，比如和答案重复或由答案算出来的列）、filter（只留某一类的行，例如 {\"Country\": \"China\"}，值要和文件里的写法一字不差）、jsonPath（JSON 里记录数组的路径，例如 data.items）、zipEntry（zip 里要用的文件名）。",
        "- 写明 source（出处）、license（知道的话）、real（这份数据是真实采集的就写 true，模拟或合成的写 false）、why（为什么符合描述，一两句）。"
      ].join("\n"),
      "# 已知可用的（地址和表头都核实过，合适就直接用）\n" + QL_MLWEBCAT.map(catLine).join("\n"),
      failed && failed.length ? "# 上一轮给的这些地址取不到或不能用，换别的\n" + failed.map(function (f) { return "- " + f.url + "：" + f.why; }).join("\n") : "",
      "# 输出格式\n" + (search ? "搜索完以后，最后的回答" : "") + "只输出一个 JSON 对象，不要别的文字，也不要代码围栏：\n{\"candidates\": [{\"name\": \"…\", \"url\": \"https://…\", \"format\": \"csv | tsv | json | jsonl | auto\", \"target\": \"…\", \"kind\": \"regression | classification | forecast\", \"time\": \"…\", \"drop\": [\"…\"], \"filter\": {\"列\": \"值\"}, \"jsonPath\": \"…\", \"zipEntry\": \"…\", \"source\": \"…\", \"license\": \"…\", \"real\": true, \"needsEngine\": false, \"why\": \"…\"}], \"note\": \"…\"}"
    ].filter(Boolean).join("\n\n");
  }
  function str(x, n) { return typeof x === "string" ? x.trim().slice(0, n) : ""; }
  function cleanPlan(c) {
    if (!c || typeof c !== "object" || !okUrl(str(c.url, 4000))) return null;
    var f = null; if (c.filter && typeof c.filter === "object" && !Array.isArray(c.filter)) { f = {}; Object.keys(c.filter).slice(0, 3).forEach(function (k) { if (typeof c.filter[k] === "string" || typeof c.filter[k] === "number") f[String(k).slice(0, 80)] = String(c.filter[k]).slice(0, 120); }); if (!Object.keys(f).length) f = null; }
    return { name: str(c.name, 60) || hostOf(c.url), url: str(c.url, 4000), format: ["csv", "tsv", "json", "jsonl", "auto"].indexOf(c.format) >= 0 ? c.format : "auto", target: str(c.target, 120), kind: ["regression", "classification", "forecast"].indexOf(c.kind) >= 0 ? c.kind : "", time: str(c.time, 120), drop: Array.isArray(c.drop) ? c.drop.filter(function (x) { return typeof x === "string"; }).slice(0, 50).map(function (x) { return x.slice(0, 120); }) : [], filter: f, jsonPath: str(c.jsonPath, 200), zipEntry: str(c.zipEntry, 200), source: str(c.source, 300), license: str(c.license, 120), real: c.real === true ? true : c.real === false ? false : null, needsEngine: !!c.needsEngine, why: str(c.why, 400) };
  }
  function parsePlans(text) { var fence = /```(?:json)?\s*(\{[\s\S]*\})\s*```/.exec(text); if (fence) text = fence[1]; else { var k = text.lastIndexOf('{"candidates"'); if (k < 0) k = text.lastIndexOf('{ "candidates"'); if (k > 0) text = text.slice(k); } var a = text.indexOf("{"), b = text.lastIndexOf("}"); if (a < 0 || b <= a) throw new Error("AI 的回答里没有 JSON。"); var o = JSON.parse(text.slice(a, b + 1)); return { list: (Array.isArray(o.candidates) ? o.candidates : []).map(cleanPlan).filter(Boolean).slice(0, 4), note: str(o.note, 500) }; }
  A.webPrompt = prompt; A.webParsePlans = parsePlans;

  /* ---------- 对话框 ---------- */
  A.openWeb = function () {
    var kind0 = kindOfGroup(), m, busy = false, ctl = null, round = 0, failed = [];
    var desc = h("textarea", { id: "webDesc", rows: "3", placeholder: "用一句话描述想要的数据，比如：过去三十年的布伦特原油日价；或者：能预测房价的表格，有面积、房间数这些特征", "aria-label": "描述想要的数据" });
    var aiBtn = h("button", { class: "btn primary", type: "button", id: "webAsk", text: "让 AI 找" });
    var url = h("input", { type: "url", id: "webUrl", placeholder: "https://…/data.csv", spellcheck: "false", "aria-label": "数据文件的网址" });
    var urlBtn = h("button", { class: "btn", type: "button", id: "webGet", text: "取" });
    var q = h("input", { type: "text", placeholder: "在现成的里找…", "aria-label": "在现成的数据里找" });
    var cat = h("div", { class: "ml-web-cat" }), cands = h("div", { class: "ml-web-cands" }), logBox = h("ol", { class: "ml-web-log", "aria-live": "polite" }), prev = h("div", { class: "ml-web-prev" });
    var aiNote = h("div", { class: "note" });
    function log(t, cls) { logBox.appendChild(h("li", { class: cls || "", text: t })); }
    function setBusy(b) { busy = b; [aiBtn, urlBtn].forEach(function (x) { x.disabled = b || (x === aiBtn && !(A.aiReady && A.aiReady())); }); stopBtn.hidden = !b; }
    var stopBtn = h("button", { class: "btn small", type: "button", text: "停止", hidden: true, onclick: function () { if (ctl) ctl.abort(); if (aiCall) aiCall.cancel(); } }), aiCall = null;
    var search = !!(A.aiCanSearch && A.aiCanSearch());
    if (!(A.aiReady && A.aiReady())) { aiBtn.disabled = true; aiNote.textContent = "还没有接入 AI：可以直接填网址，或者从下面现成的里挑。要用描述找，先在右栏接入 AI。"; }
    else if (search) aiNote.textContent = A.aiWho() + " 会先上网搜索（最多 " + SEARCHES + " 次，搜索按次另外计费），再给几个数据文件的地址；页面逐个去取，取不到就换下一个。";
    else aiNote.textContent = A.aiWho() + " 只能凭它知道的给地址（不会上网搜；接的是 Claude 时才会先搜索）；给的地址页面会逐个去取，取不到就换下一个。";
    function paintCat() {
      clear(cat); var s = q.value.trim().toLowerCase(), list = QL_MLWEBCAT.slice();
      list.sort(function (a, b) { return (b.kind === kind0) - (a.kind === kind0); });
      list = list.filter(function (c) { return !s || (c.name + " " + c.desc + " " + c.keys + " " + c.url).toLowerCase().indexOf(s) >= 0; });
      if (!list.length) { cat.appendChild(h("p", { class: "note", text: "没有找到。" })); return; }
      list.forEach(function (c) {
        cat.appendChild(h("div", { class: "ml-web-item" }, h("div", null, h("b", { text: c.name }), h("span", { class: "tag", text: c.kind === "forecast" ? "时间序列" : c.kind === "classification" ? "分类" : "回归" }), h("div", { class: "note", text: c.desc + "来源：" + c.source + "。" })),
          h("button", { class: "btn small", type: "button", text: "取", "data-cat": c.id, onclick: function () { tryPlans([Object.assign({}, c)]); } })));
      });
    }
    q.addEventListener("input", paintCat);
    /** 依次试几个候选，取到第一个能用的就预览 */
    async function tryPlans(list, keepLog) {
      if (busy) return; setBusy(true); clear(prev); if (!keepLog) clear(logBox); ctl = new AbortController();
      list.forEach(function (p) { if (!p.kind) p.kind = kind0; });
      try {
        for (var i = 0; i < list.length; i++) {
          var p = list[i]; log((list.length > 1 ? "候选 " + (i + 1) + "：" : "") + p.name + " — " + p.url);
          if (p.needsEngine && !(A.engineCanFetch && A.engineCanFetch())) log("  （AI 说这个网站可能要本机引擎才取得到）");
          try {
            var r = await getBytes(p.url, function (t, c) { log("  " + t, c); }, ctl.signal);
            var d = await bytesToText(r.bytes, p); d.notes.forEach(function (n) { log("  " + n); });
            var T = A.webTable(d.text, p);
            if (r.truncated) { var tw = "浏览器只读到了前 " + (BRMAX / 10000) + " 万个字符：文件可能不全（最后不完整的一行已经去掉）。要完整的大文件，接上本机引擎。"; T.warnings.unshift(tw); log("  " + tw, "bad"); }
            log("  ✓ 读出 " + T.table.rows.length + " 行、" + T.table.header.length + " 列（" + T.format.toUpperCase() + "）", "good");
            preview(p, r, d.text, T); return;
          } catch (e) {
            if (ctl.signal.aborted) { log("已停止。"); return; }
            log("  ✕ " + (e.message || e), "bad"); failed.push({ url: p.url, why: String(e.message || e).slice(0, 200) });
          }
        }
        log(list.length > 1 ? "几个候选都没取到。" : "没有取到。", "bad");
        if (A.aiReady && A.aiReady() && round > 0 && round < 3) prev.appendChild(h("div", { class: "a-actions" }, h("button", { class: "btn small primary", type: "button", text: "让 AI 换几个地址", onclick: function () { ask(); } })));
        prev.appendChild(h("p", { class: "note", text: "浏览器读不到的网站，连上本机引擎以后可以请它去取；也可以自己用浏览器打开那个地址下载，再用“导入 CSV”。" }));
      } finally { setBusy(false); logBox.setAttribute("data-done", String((+logBox.getAttribute("data-done") || 0) + 1)); }
    }
    function ask() {
      var text = desc.value.trim(); if (!text) { desc.focus(); return; }
      if (busy || !(A.aiReady && A.aiReady())) return;
      round++; setBusy(true); clear(cands); if (round === 1) clear(logBox); log((round > 1 ? "第 " + round + " 轮：" : "") + "请 " + A.aiWho() + (search ? " 上网搜索、找数据 …" : " 找数据 …"));
      aiCall = A.aiAsk(prompt(text, kind0, round > 1 ? failed : null, search), "default", null, search ? { webSearch: SEARCHES, onSearch: function (x) {
        if (x.query) log("  " + A.aiWho() + " 搜索：" + x.query); else if (x.error) log("  这次搜索没成功（" + x.error + "）", "bad"); else if (x.results != null) log("  搜到 " + x.results + " 条结果");
      } } : null);
      var meta = aiCall.meta;
      aiCall.promise.then(function (reply) {
        aiCall = null; setBusy(false);
        if (search && meta && meta.searchOff) log("（这个账号或模型没有开通网络搜索：这一轮 " + A.aiWho() + " 只能凭它知道的给地址。开通在 platform.claude.com 的组织设置里。）", "bad");
        var P; try { P = parsePlans(reply); } catch (e) { log("✕ " + e.message, "bad"); cands.appendChild(h("pre", { class: "code", text: reply.slice(0, 3000) })); return; }
        if (!P.list.length) { log("✕ AI 没有给出能用的地址。" + (P.note ? P.note : ""), "bad"); return; }
        log("AI 给了 " + P.list.length + " 个候选" + (P.note ? "。" + P.note : "。"), "good");
        P.list.forEach(function (p, i) { cands.appendChild(h("div", { class: "ml-web-item" }, h("div", null, h("b", { text: (i + 1) + ". " + p.name }), p.real === false ? h("span", { class: "ml-badge sim", text: "来源说是模拟的" }) : p.real === true ? h("span", { class: "ml-badge real", text: "来源说是真实的" }) : null, h("div", { class: "note", text: [p.url, p.why, p.source ? "出处：" + p.source : "", p.license ? "许可：" + p.license : ""].filter(Boolean).join(" · ") })), h("button", { class: "btn small", type: "button", text: "取这个", onclick: function () { tryPlans([p]); } }))); });
        tryPlans(P.list, true);
      }, function (e) { aiCall = null; setBusy(false); log("✕ " + A.aiErrText(e), "bad"); });
    }
    aiBtn.addEventListener("click", ask);
    desc.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask(); } });
    urlBtn.addEventListener("click", function () { var u = url.value.trim(); if (!okUrl(u)) { log("✕ 网址要以 http:// 或 https:// 开头。", "bad"); return; } tryPlans([{ name: u.split("/").pop().split("?")[0] || hostOf(u), url: u, format: "auto", kind: "", drop: [], filter: null }]); });
    url.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); urlBtn.click(); } });

    /** 预览：前几行、要预测的列、任务、时间列、用哪些列、只留哪些行；确认后导入 */
    function preview(p, r, text, T) {
      clear(prev);
      var t = T.table, H = t.header, kindSel = h("select", { id: "webKind", "aria-label": "任务类型" }, KINDS.map(function (x) { return h("option", { value: x[0], text: x[1], selected: x[0] === (p.kind || kind0) }); }));
      var tgt = h("select", { id: "webTarget", "aria-label": "要预测的列" }, H.map(function (c, i) { return h("option", { value: c, text: c, selected: p.target ? c === p.target : i === H.length - 1 }); }));
      var tim = h("select", { id: "webTime", "aria-label": "时间列" }, [h("option", { value: "", text: "（按行的顺序）" })].concat(H.map(function (c) { return h("option", { value: c, text: c, selected: c === p.time }); })));
      var drop = {}; (p.drop || []).forEach(function (c) { drop[c] = 1; });
      var cols = h("div", { class: "ml-web-cols" });
      function paintCols() { clear(cols); H.forEach(function (c) { if (c === tgt.value || (kindSel.value === "forecast" && c === tim.value)) return; var cb = h("input", { type: "checkbox", checked: !drop[c], onchange: function () { if (cb.checked) delete drop[c]; else drop[c] = 1; } }); cols.appendChild(h("label", { class: "ml-web-col" }, cb, c)); }); }
      tgt.addEventListener("change", paintCols); kindSel.addEventListener("change", function () { timeRow.hidden = kindSel.value !== "forecast"; colsRow.hidden = kindSel.value === "forecast"; paintCols(); }); tim.addEventListener("change", paintCols);
      var nShow = Math.min(6, t.rows.length), cShow = Math.min(10, H.length);
      var tbl = h("table", { class: "ptab ml-web-table" }, h("thead", null, h("tr", null, H.slice(0, cShow).map(function (c) { return h("th", { text: c }); }), H.length > cShow ? h("th", { text: "…" }) : null)),
        h("tbody", null, t.rows.slice(0, nShow).map(function (row) { return h("tr", null, row.slice(0, cShow).map(function (v) { return h("td", { text: String(v).slice(0, 24) }); }), H.length > cShow ? h("td", { text: "…" }) : null); })));
      var timeRow = h("div", { class: "field", hidden: kindSel.value !== "forecast" }, h("label", { text: "时间列" }), h("span"), tim);
      var colsRow = h("div", { hidden: kindSel.value === "forecast" }, h("div", { class: "note", text: "用哪些列做特征（会泄露答案的列——和答案重复、或者由答案算出来的——一定要去掉）：" }), cols);
      var err = h("div", { class: "warn err", hidden: true });
      var name = p.name || hostOf(p.url);
      prev.appendChild(h("h3", { class: "ml-web-h", text: "预览：" + name }));
      prev.appendChild(h("p", { class: "note", text: t.rows.length + " 行 × " + H.length + " 列 · 来自 " + hostOf(r.url) + (r.via === "engine" ? "（本机引擎取的）" : r.via === "browser" ? "（Claude 桌面版的浏览器取的）" : r.via === "mirror" ? "（jsDelivr 镜像）" : "") + (p.source ? " · 出处：" + p.source : "") + (p.license ? " · 许可：" + p.license : "") }));
      T.warnings.forEach(function (w) { prev.appendChild(h("div", { class: "warn", text: w })); });
      prev.appendChild(h("div", { class: "ml-lbwrap" }, tbl));
      prev.appendChild(h("div", { class: "fields" }, h("div", { class: "field" }, h("label", { text: "要预测的列" }), h("span"), tgt), h("div", { class: "field" }, h("label", { text: "任务" }), h("span"), kindSel), timeRow));
      prev.appendChild(colsRow); paintCols();
      prev.appendChild(err);
      prev.appendChild(h("div", { class: "a-actions" }, h("button", { class: "btn primary", type: "button", id: "webImport", text: "导入，作为当前的数据集", onclick: function () {
        var k = kindSel.value, feats = k === "forecast" ? null : H.filter(function (c) { return c !== tgt.value && !drop[c]; });
        if (k !== "forecast" && !feats.length) { err.hidden = false; err.textContent = "至少要留一列做特征。"; return; }
        var plan = { format: T.format, filter: p.filter || null, jsonPath: p.jsonPath || "", zipEntry: p.zipEntry || "", kind: k };
        var web = { url: r.url || p.url, asked: p.url, via: r.via, name: name, source: p.source || "", license: p.license || "", real: p.real == null ? null : p.real, fetchedAt: new Date().toISOString().slice(0, 10), plan: plan };
        var docs = "**数据的来源：从网上取的数据。** 地址：" + web.url + "（" + web.fetchedAt + " 取的" + (r.via === "engine" ? "，本机引擎取的" : "") + "）。" + (p.source ? "出处：" + p.source + "。" : "") + (p.license ? "许可：" + p.license + "。" : "") + (p.real === false ? "来源说它是模拟或合成的数据。" : p.real === true ? "来源说它是采集来的真实数据。" : "") + (p.why ? "\n\n" + p.why : "") + (T.warnings.length ? "\n\n" + T.warnings.join("\n\n") : "") + "\n\n数值列的缺失值在划分之后用训练集那一列的中位数补上；文字列按类别做独热编码（最多 30 个取值）。";
        try { var def = A.importTable(t, { target: tgt.value, kind: k, features: feats, time: k === "forecast" ? tim.value || null : null, name: name, summary: "从 " + hostOf(web.url) + " 取的数据（" + t.rows.length + " 行）。要预测的列：" + tgt.value + "。", docs: docs, web: web, text: text }); m.close(); A.toast("已导入：" + def.summary, 3600); }
        catch (e) { err.hidden = false; err.textContent = e.message; }
      } })));
      prev.scrollIntoView && setTimeout(function () { try { prev.scrollIntoView({ block: "nearest" }); } catch (e) {} }, 30);
    }

    paintCat();
    var body = [
      !A.aiHost ? null : A.engineCanFetch && A.engineCanFetch() ? h("div", { class: "note", id: "webHost", text: "在 Claude 里：页面自己不能联网，网上的数据由本机引擎去取（经 Claude 桌面版，最多 50 MB，压缩文件也行）。" }) :
        h("div", { class: "warn", id: "webHost" }, "你是在 Claude 里打开的这一页：页面自己不能联网，要请 Claude 桌面版替它取。没接本机引擎时用桌面版自带的浏览器：不用装东西，但只能取不压缩的 CSV、JSON 之类，最多约 200 万个字符，第一次会问你允不允许。大文件、压缩文件要接上本机引擎（点顶栏的“本机引擎”看怎么连）。都只在 Claude 桌面版里能用；也可以用网站版 ", h("a", { href: SITE, target: "_blank", rel: "noopener", text: SITE }), "。"),
      h("p", { class: "note", text: "取来的数据只在这台电脑的浏览器里处理，不会上传到别处。取的时候不带你的 Cookie 或登录信息。取到以后先预览，确认了再导入；导入的数据集会标成“从网上取的数据”并记下地址。" }),
      h("div", { class: "ml-web-sec" }, h("h3", { text: "用描述找" }), desc, h("div", { class: "ml-row" }, aiBtn, stopBtn, h("span", { class: "sp" })), aiNote),
      h("div", { class: "ml-web-sec" }, h("h3", { text: "或者直接填数据文件的网址" }), h("div", { class: "ml-row" }, url, urlBtn), h("div", { class: "note", text: A.aiHost ? "CSV、TSV、JSON、JSON Lines（接上本机引擎时也可以是它们的 .gz / .zip，最多 50 MB）。" : "CSV、TSV、JSON、JSON Lines，或者它们的 .gz / .zip；最多 30 MB。" + (A.engineCanFetch && A.engineCanFetch() ? "已连上本机引擎：浏览器读不到的网站会请引擎去取。" : "浏览器读不到的网站（跨域限制），连上本机引擎以后可以请它去取。") })),
      cands, logBox, prev,
      h("details", { class: "more ml-web-sec", open: true }, h("summary", { text: "现成的（地址核实过，都是真实数据）" }), q, cat)
    ];
    m = A.modal("从网上取数据", body, { cls: "mlweb", head: A.helpBtn("data:web", "从网上取数据"), focus: "#webDesc", onClose: function () { if (ctl) ctl.abort(); if (aiCall) aiCall.cancel(); } });
  };
})(MLA);
