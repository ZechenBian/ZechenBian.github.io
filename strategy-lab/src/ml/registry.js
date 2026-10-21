// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 机器学习实验室 · 数据集注册表 QL.mlreg
 * 页面和后台线程各装一份：线程的源码是用 toString() 拼出来的，所以这个函数必须自包含，
 * 只用参数 QL 和标准 JavaScript，不引用函数外面的任何东西。
 * 内容：
 *   一、类别（family / kind / 界面上的五个分组）
 *   二、注册与校验：add(def) 把定义查一遍再收下，出错就抛中文的错误；defaults / clean 处理参数
 *   三、数据的形状检查 checkData（运行器和测试都用）
 *   四、导入 CSV：parseCSV（文本 → 字符串表格）、fromCSV（表格 → Data）、impute（补缺失值） */
function QL_MLREG_INSTALL(QL) {
"use strict";

/* ================================================================== *
 *  一、类别
 * ================================================================== */
var FAMILIES = {
  tabular: { name: "表格数据", desc: "每个样本是一行数（特征），要预测一个实数（回归）或一个类别（分类）。" },
  timeseries: { name: "时间序列", desc: "一条按时间排好的序列，只能用过去预测未来。" },
  image: { name: "图像与格点", desc: "每个样本是一张小图或一块格点（像素、自旋），相邻的格子之间有空间结构。" },
  toy: { name: "科研玩具", desc: "为了看清一个现象（顿悟、群表示、相变……）专门构造的小问题。" }
};
var KINDS = {
  regression: { name: "回归", primary: "mse", higherBetter: false, desc: "预测一个实数，主指标是均方误差。" },
  classification: { name: "分类", primary: "acc", higherBetter: true, desc: "给出每个类别的概率，主指标是准确率。" },
  forecast: { name: "预测", primary: "mse", higherBetter: false, desc: "站在每个时刻往前预测，主指标是均方误差。" }
};
/* 每个 family 允许的 kind。图像和玩具以分类为主，但也允许回归（比如从构型回归温度） */
var FAMILY_KINDS = { tabular: ["regression", "classification"], timeseries: ["forecast"], image: ["classification", "regression"], toy: ["classification", "regression"] };
/* 界面左栏的五个分组：表格按 kind 分成两组，其余按 family */
var GROUPS = [
  { id: "tab-reg", family: "tabular", kind: "regression", name: "表格回归", desc: "从一行特征预测一个实数：先看偏差与方差、过拟合、外推。" },
  { id: "tab-cls", family: "tabular", kind: "classification", name: "表格分类", desc: "从一行特征预测类别：决策边界的形状决定哪种算法好用。" },
  { id: "ts", family: "timeseries", kind: "forecast", name: "时间序列", desc: "只能用过去预测未来：随机游走、自回归、季节、机制切换、混沌和真实行情。" },
  { id: "img", family: "image", kind: "classification", name: "图像与格点", desc: "像素和格点上的数据：卷积、平移对称、物理里的相。" },
  { id: "toy", family: "toy", name: "科研玩具", desc: "专门构造的小问题，用来看清一个学习现象。" }
];
var PLOTS = ["scatter2d", "series", "images", "table", "cayley", "lattice"];
var SPLIT_BY = ["random", "stratified", "group", "time", "custom"];
/* 导入的上限：浏览器里的线程要把整张表复制几份，太大会卡死页面 */
var LIMIT = { rows: 50000, cols: 200, levels: 30, classes: 50, cells: 10000000 };

var reg = { list: [], byId: {}, families: FAMILIES, kinds: KINDS, groups: GROUPS, plots: PLOTS, limits: LIMIT };

function isNum(x) { return typeof x === "number" && isFinite(x); }
function isInt(x) { return isNum(x) && Math.floor(x) === x; }
function nonEmpty(s) { return typeof s === "string" && s.trim().length > 0; }

/* ================================================================== *
 *  二、注册与校验
 * ================================================================== */
function checkParam(s, i, seen) {
  var at = "第 " + (i + 1) + " 个参数";
  if (!s || typeof s !== "object") return at + "不是对象";
  if (typeof s.key !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(s.key)) return at + "的名字 key 不合法（只能用字母、数字、下划线，不以数字开头）：" + String(s.key);
  at = "参数 " + s.key;
  if (seen[s.key]) return at + " 重复了";
  seen[s.key] = 1;
  if (!nonEmpty(s.label)) return at + " 缺少显示名 label";
  if (s.show != null && typeof s.show !== "function") return at + " 的 show 必须是函数";
  var t = s.type;
  if (t === "int" || t === "num") {
    if (!isNum(s.min) || !isNum(s.max) || !isNum(s.def)) return at + " 的 min、max、def 都必须是有限的数";
    if (!(s.min <= s.max)) return at + " 的 min（" + s.min + "）大于 max（" + s.max + "）";
    if (s.def < s.min || s.def > s.max) return at + " 的默认值 def = " + s.def + " 不在 [" + s.min + ", " + s.max + "] 里";
    if (s.step != null && !(isNum(s.step) && s.step > 0)) return at + " 的步长 step 必须是正数";
    if (t === "int" && !(isInt(s.min) && isInt(s.max) && isInt(s.def))) return at + " 是整数参数，min、max、def 都必须是整数";
    return "";
  }
  if (t === "select") {
    if (!Array.isArray(s.options) || !s.options.length) return at + " 是选择题，但选项 options 是空的";
    var vals = {}, hit = false;
    for (var j = 0; j < s.options.length; j++) {
      var o = s.options[j];
      if (!Array.isArray(o) || o.length < 2 || (typeof o[0] !== "string" && !isNum(o[0])) || !nonEmpty(o[1])) return at + " 的第 " + (j + 1) + " 个选项必须写成 [取值, 显示名]";
      if (vals[String(o[0])]) return at + " 的选项取值重复：" + o[0];
      vals[String(o[0])] = 1;
      if (o[0] === s.def) hit = true;
    }
    if (!hit) return at + " 的默认值 def = " + String(s.def) + " 不在选项里";
    return "";
  }
  if (t === "bool") return typeof s.def === "boolean" ? "" : at + " 是开关，默认值 def 必须是 true 或 false";
  return at + " 的类型 type 必须是 int、num、select、bool 之一（现在是 " + String(t) + "）";
}
function checkDef(def) {
  if (!def || typeof def !== "object") return "定义必须是对象";
  if (typeof def.id !== "string" || !/^[a-z0-9_]+$/.test(def.id)) return "编号 id 只能用小写字母、数字和下划线：" + String(def.id);
  if (reg.byId[def.id]) return "编号 " + def.id + " 已经注册过了";
  if (!FAMILIES[def.family]) return "family 必须是 tabular、timeseries、image、toy 之一（现在是 " + String(def.family) + "）";
  if (!KINDS[def.kind]) return "kind 必须是 regression、classification、forecast 之一（现在是 " + String(def.kind) + "）";
  if (FAMILY_KINDS[def.family].indexOf(def.kind) < 0) return def.family + " 类的数据不能是 " + def.kind + "（允许：" + FAMILY_KINDS[def.family].join("、") + "）";
  if (!nonEmpty(def.name)) return "缺少名字 name";
  if (def.summary != null && typeof def.summary !== "string") return "一句话简介 summary 必须是文字";
  if (!Array.isArray(def.params)) return "参数表 params 必须是数组（没有参数就写 []）";
  var seen = {};
  for (var i = 0; i < def.params.length; i++) { var e = checkParam(def.params[i], i, seen); if (e) return e; }
  if (typeof def.gen !== "function") return "生成函数 gen 必须是函数";
  if (def.oracle != null && typeof def.oracle !== "function") return "oracle 必须是函数";
  if (def.bayes != null && typeof def.bayes !== "function") return "bayes 必须是函数";
  if (!nonEmpty(def.docs)) return "说明 docs 不能为空";
  if (def.plot != null && PLOTS.indexOf(def.plot) < 0) return "预览图 plot 必须是 " + PLOTS.join("、") + " 之一";
  if (def.split != null) {
    var sp = def.split;
    if (typeof sp !== "object") return "划分 split 必须是对象";
    if (sp.by != null && SPLIT_BY.indexOf(sp.by) < 0) return "划分方式 split.by 必须是 " + SPLIT_BY.join("、") + " 之一";
    if (sp.train != null || sp.valid != null || sp.test != null) {
      if (!(isNum(sp.train) && isNum(sp.valid) && isNum(sp.test)) || sp.train <= 0 || sp.valid < 0 || sp.test < 0) return "划分比例 split.train / valid / test 必须是非负的数（训练集大于 0）";
      if (Math.abs(sp.train + sp.valid + sp.test - 1) > 1e-6) return "划分比例加起来必须是 1";
    }
  }
  if (def.source != null) {
    var so = def.source;
    if (typeof so !== "object" || !nonEmpty(so.name) || !nonEmpty(so.license)) return "真实数据的出处 source 至少要有 name 和 license";
    if (so.url != null && !/^https:\/\//.test(so.url)) return "出处链接 source.url 必须以 https:// 开头";
  }
  return "";
}
reg.add = function (def) {
  var e = checkDef(def);
  if (e) throw new Error("数据集注册失败（" + (def && typeof def.id === "string" ? def.id : "?") + "）：" + e);
  reg.list.push(def); reg.byId[def.id] = def;
  return def;
};
reg.get = function (id) { return Object.prototype.hasOwnProperty.call(reg.byId, id) ? reg.byId[id] : null; };
function resolve(def) {
  var d = typeof def === "string" ? reg.get(def) : def;
  if (!d || !Array.isArray(d.params)) throw new Error("没有这个数据集：" + String(def && def.id || def));
  return d;
}
/** 参数的默认值 */
reg.defaults = function (def) {
  var d = resolve(def), p = {};
  d.params.forEach(function (s) { p[s.key] = s.def; });
  return p;
};
function cleanOne(s, v) {
  if (s.type === "int" || s.type === "num") {
    var x = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    if (!isFinite(x)) return s.def;
    if (x < s.min) x = s.min;
    if (x > s.max) x = s.max;
    if (s.type === "int") x = Math.round(x);     // min、max 是整数，取整后仍在范围里
    return x === 0 ? 0 : x;                       // 不留 −0
  }
  if (s.type === "select") {
    for (var j = 0; j < s.options.length; j++) if (String(s.options[j][0]) === String(v)) return s.options[j][0];
    return s.def;
  }
  if (v === true || v === false) return v;
  if (v === "true" || v === 1 || v === "1") return true;
  if (v === "false" || v === 0 || v === "0") return false;
  return s.def;
}
/** 把外面传进来的参数（来自界面、存档或 AI）整理干净：缺的补默认值，数夹到 [min, max]，整数取整，
 *  选项不认识就用默认值，多余的键丢掉。返回新对象，不改传进来的那个。 */
reg.clean = function (def, p) {
  var d = resolve(def), out = {};
  p = p && typeof p === "object" ? p : {};
  d.params.forEach(function (s) { out[s.key] = cleanOne(s, Object.prototype.hasOwnProperty.call(p, s.key) ? p[s.key] : undefined); });
  return out;
};
/** 数据集属于界面上的哪个分组：先按 (family, kind) 找，找不到就按 family */
reg.groupOf = function (def) {
  var d = resolve(def), i;
  for (i = 0; i < GROUPS.length; i++) if (GROUPS[i].family === d.family && GROUPS[i].kind === d.kind) return GROUPS[i].id;
  for (i = 0; i < GROUPS.length; i++) if (GROUPS[i].family === d.family) return GROUPS[i].id;
  return null;
};
reg.inGroup = function (gid) { return reg.list.filter(function (d) { return reg.groupOf(d) === gid; }); };
/** 默认的划分（设计文档 §4）。数据集写了 split 就用它的；Data 里带 splitIdx 时运行器直接用那几个下标，
 *  带 groups 时按组划分，这两样只有生成数据之后才知道，由运行器处理。 */
reg.splitOf = function (def, p) {
  var d = resolve(def), sp = d.split || {}, out;
  if (d.family === "timeseries") out = { train: 0.6, valid: 0.2, test: 0.2, by: "time" };
  else if (d.family === "toy") {
    var tf = p && isNum(p.trainFrac) && p.trainFrac > 0 && p.trainFrac < 1 ? p.trainFrac : 0.5;
    out = { train: tf, valid: (1 - tf) / 2, test: (1 - tf) / 2, by: "random" };
  } else out = { train: 0.6, valid: 0.2, test: 0.2, by: d.kind === "classification" ? "stratified" : "random" };
  if (isNum(sp.train)) { out.train = sp.train; out.valid = sp.valid; out.test = sp.test; }
  if (sp.by) out.by = sp.by;
  return out;
};

/* ================================================================== *
 *  三、数据的形状检查：返回空字符串表示没问题，否则是一句中文说明
 * ================================================================== */
function allFinite(a) { for (var i = 0; i < a.length; i++) if (!isFinite(a[i])) return false; return true; }
function checkIdx(name, a, n, used) {
  if (!(a instanceof Int32Array)) return "splitIdx." + name + " 必须是 Int32Array";
  for (var i = 0; i < a.length; i++) {
    var v = a[i];
    if (v < 0 || v >= n) return "splitIdx." + name + " 里的下标 " + v + " 越界";
    if (used[v]) return "下标 " + v + " 同时出现在两份里";
    used[v] = 1;
  }
  return "";
}
reg.checkData = function (def, D) {
  var d = def ? resolve(def) : null, kind = d ? d.kind : D && D.kind, e;
  if (!D || typeof D !== "object") return "数据不是对象";
  var nanOk = !!(D.meta && D.meta.hasNaN);
  if (kind === "forecast") {
    if (!(D.y instanceof Float64Array)) return "序列 y 必须是 Float64Array";
    if (!isInt(D.T) || D.T !== D.y.length || D.T < 2) return "长度 T 必须等于 y 的长度，而且至少是 2";
    if (!nonEmpty(D.freq)) return "缺少频率 freq";
    if (!nonEmpty(D.label)) return "缺少序列名 label";
    if (D.season != null && !(isInt(D.season) && D.season >= 1)) return "季节长度 season 必须是正整数";
    if (D.truthMean != null && (!(D.truthMean instanceof Float64Array) || D.truthMean.length !== D.T)) return "truthMean 必须是长度为 T 的 Float64Array";
    if (D.times != null && (!D.times.length || D.times.length !== D.T)) return "时间标签 times 的长度必须是 T";
    if (!nanOk && !allFinite(D.y)) return "序列里有非有限的数（NaN 或无穷）";
    if (D.truthMean && !allFinite(D.truthMean)) return "truthMean 里有非有限的数";
    return "";
  }
  if (!isInt(D.n) || D.n < 1 || !isInt(D.d) || D.d < 1) return "样本数 n 和特征数 d 必须是正整数";
  var n = D.n;
  if (!(D.X instanceof Float64Array) || D.X.length !== n * D.d) return "X 必须是长度为 n×d 的 Float64Array";
  if (!nanOk && !allFinite(D.X)) return "X 里有 NaN 或无穷（导入的数据要先补缺失值）";
  if (kind === "classification") {
    if (!(D.y instanceof Int32Array) || D.y.length !== n) return "分类的 y 必须是长度为 n 的 Int32Array";
    if (!Array.isArray(D.classes) || D.classes.length < 2) return "分类数据必须带 classes（至少两个类别名）";
    var k = D.classes.length;
    for (var i = 0; i < n; i++) if (D.y[i] < 0 || D.y[i] >= k) return "第 " + i + " 个标签 " + D.y[i] + " 不在 0.." + (k - 1) + " 里";
  } else {
    if (!(D.y instanceof Float64Array) || D.y.length !== n) return "回归的 y 必须是长度为 n 的 Float64Array";
    if (!allFinite(D.y)) return "y 里有 NaN 或无穷";
  }
  if (D.featureNames != null && (!Array.isArray(D.featureNames) || D.featureNames.length !== D.d)) return "featureNames 的长度必须是 d";
  if (D.truth != null && (!(D.truth instanceof Float64Array) || D.truth.length !== n)) return "truth 必须是长度为 n 的 Float64Array";
  if (D.groups != null && (!(D.groups instanceof Int32Array) || D.groups.length !== n)) return "groups 必须是长度为 n 的 Int32Array";
  if (D.shape != null) {
    var prod = 1; for (var s = 0; s < D.shape.length; s++) prod *= D.shape[s];
    if (prod !== D.d) return "shape 各维相乘必须等于 d";
  }
  if (D.splitIdx != null) {
    var used = new Uint8Array(n);
    if ((e = checkIdx("train", D.splitIdx.train, n, used)) || (e = checkIdx("valid", D.splitIdx.valid, n, used)) || (e = checkIdx("test", D.splitIdx.test, n, used))) return e;
    if (!D.splitIdx.train.length || !D.splitIdx.test.length) return "splitIdx 里训练集和测试集都不能是空的";
  }
  return "";
};

/* ================================================================== *
 *  四、导入 CSV
 *  parseCSV：只负责把文本切成字符串表格（RFC 4180 的引号规则；逗号、分号、制表符自动识别；
 *            去掉 BOM；\r\n、\n、\r 三种换行都认）。
 *  fromCSV：把表格变成 Data。数值列原样保留，缺失值记成 NaN（Data.meta.hasNaN = true），
 *           不在这里补：补缺失值要用到"别的样本"的信息，应当只用训练集，见 impute。
 *           类别列做独热编码（最多 30 个水平），缺失算作单独的一个水平"(缺失)"，这不会泄露任何信息。
 * ================================================================== */
var NA = { "": 1, "na": 1, "n/a": 1, "nan": 1, "null": 1, "none": 1, "?": 1, "-": 1, "#n/a": 1, "missing": 1, ".": 1 };
function isMissing(s) { return NA[String(s).trim().toLowerCase()] === 1; }
var NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
/** 字符串 → 数；不是数就返回 NaN。decComma：分号或制表符分隔的文件里，"1,5" 按欧洲习惯读成 1.5 */
function toNum(s, decComma) {
  s = String(s).trim();
  if (decComma && /^[+-]?\d*,\d+$/.test(s)) s = s.replace(",", ".");
  return NUM_RE.test(s) ? parseFloat(s) : NaN;
}
reg.isMissing = isMissing; reg.toNum = toNum;

/** 按给定分隔符切记录。maxRec：最多切出多少条（嗅探分隔符时只看开头几条） */
function records(text, delim, maxRec) {
  var out = [], rec = [], i = 0, L = text.length, field, c;
  while (i < L) {
    // 一个字段：先跳过前导空格，碰到引号就按引号规则读
    var j = i;
    while (j < L && (text.charAt(j) === " ") && delim !== " ") j++;
    if (j < L && text.charAt(j) === '"') {
      var parts = [], k = j + 1, start = k;
      for (;;) {
        var q = text.indexOf('"', k);
        if (q < 0) { parts.push(text.slice(start)); k = L; break; }          // 引号没闭合：一直读到文件末尾
        if (text.charAt(q + 1) === '"') { parts.push(text.slice(start, q + 1)); k = q + 2; start = k; continue; }   // "" 是一个字面的引号
        parts.push(text.slice(start, q)); k = q + 1; break;
      }
      field = parts.join("");
      // 闭合引号之后、分隔符之前如果还有字，宽容地接上
      var e2 = k; while (e2 < L && (c = text.charAt(e2)) !== delim && c !== "\n" && c !== "\r") e2++;
      if (e2 > k) field += text.slice(k, e2).trim();
      i = e2; rec.push(field);
    } else {
      var e = i; while (e < L && (c = text.charAt(e)) !== delim && c !== "\n" && c !== "\r") e++;
      rec.push(text.slice(i, e).trim()); i = e;
    }
    c = i < L ? text.charAt(i) : "\n";
    if (c === delim) { i++; if (i >= L) { rec.push(""); out.push(rec); rec = []; } continue; }
    // 记录结束
    if (c === "\r" && text.charAt(i + 1) === "\n") i += 2; else i++;
    var blank = true; for (var b = 0; b < rec.length; b++) if (rec[b] !== "") { blank = false; break; }
    if (!blank) out.push(rec);
    rec = [];
    if (maxRec && out.length >= maxRec) break;
  }
  return out;
}
/** 自动识别分隔符：看开头 30 条记录，哪个分隔符切出来的列数最一致（而且多于一列）就用哪个。
 *  同样一致时，制表符 > 分号 > 逗号 > 竖线：分号文件里的数常常用逗号当小数点（"1,5;2,3"），
 *  按逗号切也"一致"，但那是错的。 */
function sniff(text) {
  var sample = text.slice(0, 65536), cands = ["\t", ";", ",", "|"], best = ",", bestScore = -1;
  for (var ci = 0; ci < cands.length; ci++) {
    var recs = records(sample, cands[ci], 30), cnt = {}, mode = 0, fm = 0;
    if (recs.length > 1 && sample.length === 65536) recs.pop();   // 截断处的最后一条可能是半截
    for (var r = 0; r < recs.length; r++) { var m = recs[r].length; cnt[m] = (cnt[m] || 0) + 1; if (cnt[m] > fm || (cnt[m] === fm && m > mode)) { fm = cnt[m]; mode = m; } }
    if (mode < 2 || !recs.length) continue;
    var score = fm / recs.length - ci * 1e-3;
    if (score > bestScore + 1e-9) { bestScore = score; best = cands[ci]; }
  }
  return best;
}
/** 第一行是不是表头：有一列在第一行不是数、下面却几乎全是数；或者第一行全不是数、互不相同、下面至少有一列是数 */
function looksLikeHeader(rows) {
  if (rows.length < 2) return true;
  var first = rows[0], nc = first.length, anyNumCol = false, allText = true, seen = {}, distinct = true, j, i;
  for (j = 0; j < nc; j++) {
    var h = first[j], hNum = !isMissing(h) && isFinite(toNum(h, true));
    if (hNum || isMissing(h)) allText = false;
    if (seen[h]) distinct = false; seen[h] = 1;
    var num = 0, tot = 0;
    for (i = 1; i < rows.length && i < 200; i++) { var v = rows[i][j]; if (v == null || isMissing(v)) continue; tot++; if (isFinite(toNum(v, true))) num++; }
    if (tot && num / tot >= 0.8) { anyNumCol = true; if (!hNum && !isMissing(h)) return true; }
  }
  return allText && distinct && !anyNumCol ? true : false;
}
/**
 * parseCSV(text, opt) → { header, rows, delimiter, hasHeader, warnings }
 * opt: { delimiter: 不给就自动识别, header: true | false | "auto"（默认） }
 * rows 里全是字符串（去掉了首尾空白；带引号的字段保留引号里的原样）。短行在末尾补 ""。
 */
reg.parseCSV = function (text, opt) {
  opt = opt || {};
  if (typeof text !== "string") throw new Error("CSV 必须是文本");
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  if (!text.trim()) throw new Error("CSV 是空的");
  var delim = opt.delimiter || sniff(text), warnings = [];
  var recs = records(text, delim, LIMIT.rows + 2);
  var hasHeader = opt.header === true || opt.header === false ? opt.header : looksLikeHeader(recs);
  var nData = recs.length - (hasHeader ? 1 : 0);
  if (nData > LIMIT.rows) throw new Error("数据太多：最多 " + LIMIT.rows + " 行（不算表头），这个文件超过了。请先抽样或截取一部分再导入。");
  if (nData < 1) throw new Error("CSV 里没有数据行");
  var nc = 0, i, j;
  for (i = 0; i < recs.length; i++) if (recs[i].length > nc) nc = recs[i].length;
  // 行尾多出来的空字段（比如每行末尾多一个逗号）不算列
  while (nc > 1) { var allEmpty = true; for (i = 0; i < recs.length; i++) if (recs[i].length >= nc && recs[i][nc - 1] !== "") { allEmpty = false; break; } if (!allEmpty) break; nc--; }
  if (nc > LIMIT.cols) throw new Error("列太多：最多 " + LIMIT.cols + " 列，这个文件有 " + nc + " 列。请先删掉用不上的列。");
  var header = [], used = {};
  for (j = 0; j < nc; j++) {
    var h = hasHeader && recs[0][j] != null ? String(recs[0][j]).trim() : "";
    if (!h) h = "列" + (j + 1);
    var base = h, t = 2; while (used[h]) h = base + "_" + (t++);
    used[h] = 1; header.push(h);
  }
  var rows = [], shortRows = 0;
  for (i = hasHeader ? 1 : 0; i < recs.length; i++) {
    var r = recs[i];
    if (r.length > nc) r = r.slice(0, nc);
    if (r.length < nc) { shortRows++; while (r.length < nc) r.push(""); }
    rows.push(r);
  }
  if (shortRows) warnings.push(shortRows + " 行的字段比表头少，缺的按缺失值处理");
  return { header: header, rows: rows, delimiter: delim, hasHeader: hasHeader, warnings: warnings };
};

function colIndex(c, header, dflt) {
  if (c == null || c === "") return dflt;
  if (isInt(c) && c >= 0 && c < header.length) return c;
  var k = header.indexOf(String(c));
  if (k < 0) throw new Error("找不到这一列：" + String(c));
  return k;
}
/** 一列的概况：多少缺失、非缺失的是不是全是数、有哪些不同的值（按出现次数） */
function profile(rows, j, decComma) {
  var n = rows.length, miss = 0, num = 0, vals = new Float64Array(n), counts = {}, order = [], allInt = true;
  for (var i = 0; i < n; i++) {
    var s = rows[i][j];
    if (s == null || isMissing(s)) { miss++; vals[i] = NaN; continue; }
    s = String(s).trim();
    var v = toNum(s, decComma); vals[i] = v;
    if (isFinite(v)) { num++; if (Math.floor(v) !== v) allInt = false; }
    if (!Object.prototype.hasOwnProperty.call(counts, s)) { counts[s] = 0; order.push(s); }
    counts[s]++;
  }
  return { miss: miss, present: n - miss, numeric: num === n - miss && num > 0, vals: vals, counts: counts, order: order, allInt: allInt };
}
function looksLikeTimeName(h) { return /^(date|time|datetime|timestamp|day|month|period|日期|时间|年月|交易日)$/i.test(String(h).trim()) || /日期|时间/.test(h); }
function parseDate(s) {
  var m = /^(\d{4})[-\/.](\d{1,2})(?:[-\/.](\d{1,2}))?/.exec(String(s).trim());
  return m ? Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 1) / 86400000 : NaN;
}

/**
 * fromCSV(table, opt) → Data（设计文档 §2）
 * opt: { target: 列名或下标（默认最后一列）,
 *        kind: "auto"（默认）| "regression" | "classification" | "forecast",
 *        features: 列名或下标的数组（默认除目标外的全部；预测任务不用）,
 *        categorical: 强制当作类别的列（比如用数字编码的邮编）,
 *        time: 预测任务的时间列（默认按列名猜：date、time、日期……）, freq }
 * 自动判断：目标列有不是数的值 → 分类；全是数并且只有不超过 10 个不同的整数 → 分类；否则回归。
 */
reg.fromCSV = function (table, opt) {
  opt = opt || {};
  if (!table || !Array.isArray(table.header) || !Array.isArray(table.rows)) throw new Error("fromCSV 需要 parseCSV 的结果");
  var H = table.header, rows = table.rows, nc = H.length, decComma = !!table.delimiter && table.delimiter !== ",", i, j, warnings = (table.warnings || []).slice();
  if (!rows.length) throw new Error("CSV 里没有数据行");
  if (rows.length > LIMIT.rows) throw new Error("数据太多：最多 " + LIMIT.rows + " 行");
  if (nc > LIMIT.cols) throw new Error("列太多：最多 " + LIMIT.cols + " 列");
  var tj = colIndex(opt.target, H, nc - 1), kind = opt.kind || "auto";
  if (["auto", "regression", "classification", "forecast"].indexOf(kind) < 0) throw new Error("任务类型 kind 必须是 auto、regression、classification、forecast 之一");
  var tp = profile(rows, tj, decComma);
  if (!tp.present) throw new Error("目标列「" + H[tj] + "」全是缺失值");

  /* ---------- 时间序列 ---------- */
  if (kind === "forecast") {
    if (!tp.numeric) throw new Error("目标列「" + H[tj] + "」里有不是数的值，不能当时间序列");
    var timeCol = opt.time != null ? colIndex(opt.time, H, -1) : -1;
    if (opt.time == null) for (j = 0; j < nc; j++) if (j !== tj && looksLikeTimeName(H[j])) { timeCol = j; break; }
    var T = rows.length, y = new Float64Array(T), times = timeCol >= 0 ? rows.map(function (r) { return String(r[timeCol]); }) : null;
    // 日期从新到旧排的（行情网站常这样）要倒过来：时间必须往前走
    if (times) {
      var d0 = parseDate(times[0]), d1 = parseDate(times[T - 1]);
      if (isFinite(d0) && isFinite(d1) && d0 > d1) { rows = rows.slice().reverse(); times.reverse(); tp = profile(rows, tj, decComma); warnings.push("日期是从新到旧排的，已经倒过来"); }
    }
    // 缺失值用前一个观测补（开头的缺失用第一个观测）：只用到过去，不偷看未来
    var filled = 0, last = NaN, firstObs = NaN;
    for (i = 0; i < T; i++) if (isFinite(tp.vals[i])) { firstObs = tp.vals[i]; break; }
    for (i = 0; i < T; i++) { var v = tp.vals[i]; if (isFinite(v)) last = v; else { filled++; v = isFinite(last) ? last : firstObs; } y[i] = v; }
    if (T < 10) throw new Error("序列太短：至少要 10 个点");
    if (filled) warnings.push(filled + " 个缺失值用前一个观测补上了");
    var freq = opt.freq || "step";
    if (!opt.freq && times) {
      var gaps = [];
      for (i = 1; i < T && gaps.length < 400; i++) { var g = parseDate(times[i]) - parseDate(times[i - 1]); if (isFinite(g)) gaps.push(g); }
      gaps.sort(function (a, b) { return a - b; });
      var med = gaps.length ? gaps[gaps.length >> 1] : NaN;
      freq = med >= 0.5 && med <= 4 ? "day" : med >= 27 && med <= 32 ? "month" : "step";
    }
    var outTs = { y: y, T: T, freq: freq, label: H[tj], kind: "forecast", meta: { source: "csv", target: H[tj], filled: filled, warnings: warnings } };
    if (times) outTs.times = times;
    return outTs;
  }

  /* ---------- 监督学习 ---------- */
  if (kind === "auto") {
    if (!tp.numeric) kind = "classification";
    else kind = tp.allInt && tp.order.length <= 10 ? "classification" : "regression";
  }
  if (kind === "regression" && !tp.numeric) throw new Error("目标列「" + H[tj] + "」里有不是数的值，不能做回归；要做分类请把任务类型改成分类");
  // 目标缺失的行丢掉
  var keep = [];
  for (i = 0; i < rows.length; i++) if (!isMissing(rows[i][tj] == null ? "" : rows[i][tj])) keep.push(i);
  var dropped = rows.length - keep.length, n = keep.length;
  if (dropped) warnings.push(dropped + " 行的目标值缺失，已经去掉");
  if (n < 2) throw new Error("有目标值的行太少");
  var feats;
  if (opt.features) feats = opt.features.map(function (c) { return colIndex(c, H, -1); });
  else { feats = []; for (j = 0; j < nc; j++) if (j !== tj) feats.push(j); }
  if (feats.indexOf(tj) >= 0) throw new Error("目标列不能同时当特征");
  if (!feats.length) throw new Error("没有可用的特征列");
  var forceCat = {}; (opt.categorical || []).forEach(function (c) { forceCat[colIndex(c, H, -1)] = 1; });
  var sub = keep.length === rows.length ? rows : keep.map(function (k) { return rows[k]; });

  // 每一列变成几列数
  var blocks = [], names = [], columns = [], nMissing = 0;
  feats.forEach(function (j) {
    var pr = profile(sub, j, decComma), info = { name: H[j], col: j, missing: pr.miss };
    if (!pr.present) { info.type = "dropped"; info.reason = "全是缺失值"; columns.push(info); warnings.push("列「" + H[j] + "」全是缺失值，没有用"); return; }
    if (pr.numeric && !forceCat[j]) {
      info.type = "num"; nMissing += pr.miss; columns.push(info);
      blocks.push({ kind: "num", vals: pr.vals }); names.push(H[j]);
      return;
    }
    // 类别列：按出现次数排水平；超过 30 个时，几乎每行都不同的看起来是编号或名字，不用；否则保留最常见的 29 个，其余并成"(其他)"
    var lv = pr.order.slice().sort(function (a, b) { return pr.counts[b] - pr.counts[a] || pr.order.indexOf(a) - pr.order.indexOf(b); });
    if (pr.miss) lv.push("(缺失)");
    if (lv.length > LIMIT.levels) {
      if (pr.order.length > 0.9 * pr.present) { info.type = "dropped"; info.reason = "几乎每行都不同，像编号或名字"; columns.push(info); warnings.push("列「" + H[j] + "」几乎每行都不同（像编号或名字），没有用"); return; }
      var other = lv.slice(LIMIT.levels - 1);
      lv = lv.slice(0, LIMIT.levels - 1);
      if (other.indexOf("(缺失)") >= 0 && lv.indexOf("(缺失)") < 0) { lv.pop(); lv.push("(缺失)"); }
      lv.push("(其他)");
      warnings.push("列「" + H[j] + "」有 " + (pr.order.length + (pr.miss ? 1 : 0)) + " 个不同的值，只保留最常见的 " + (LIMIT.levels - 1) + " 个，其余并成「(其他)」");
    }
    var code = {}; lv.forEach(function (s, k) { code[s] = k; });
    var codes = new Int32Array(n), otherCode = code["(其他)"];
    for (var i2 = 0; i2 < n; i2++) {
      var s = sub[i2][j]; s = s == null || isMissing(s) ? "(缺失)" : String(s).trim();
      codes[i2] = Object.prototype.hasOwnProperty.call(code, s) ? code[s] : otherCode;
    }
    info.type = "cat"; info.levels = lv; columns.push(info);
    blocks.push({ kind: "cat", codes: codes, k: lv.length });
    lv.forEach(function (s) { names.push(H[j] + "=" + s); });
  });
  var d = names.length;
  if (!d) throw new Error("没有可用的特征列");
  if (n * d > LIMIT.cells) throw new Error("展开（独热编码）之后有 " + n + " 行 × " + d + " 列，超过了 " + LIMIT.cells + " 个数的上限。请减少行数或类别很多的列。");
  var X = new Float64Array(n * d), off = 0;
  blocks.forEach(function (b) {
    if (b.kind === "num") { for (var i3 = 0; i3 < n; i3++) X[i3 * d + off] = b.vals[i3]; off += 1; }
    else { for (var i4 = 0; i4 < n; i4++) X[i4 * d + off + b.codes[i4]] = 1; off += b.k; }
  });

  var out = { X: X, n: n, d: d, featureNames: names, kind: kind,
    meta: { source: "csv", target: H[tj], kind: kind, columns: columns, missing: nMissing, hasNaN: nMissing > 0, droppedRows: dropped, warnings: warnings } };
  if (kind === "regression") {
    var yr = new Float64Array(n); for (i = 0; i < n; i++) yr[i] = toNum(sub[i][tj], decComma);
    out.y = yr;
  } else {
    // 类别：全是数就按数值从小到大，否则按字符串排，编号 0..k−1
    var labs = sub.map(function (r) { return String(r[tj]).trim(); }), key = {}, uniq = [];
    var numeric = tp.numeric;
    labs.forEach(function (s) { var kk = numeric ? String(toNum(s, decComma)) : s; if (!Object.prototype.hasOwnProperty.call(key, kk)) { key[kk] = 1; uniq.push(kk); } });
    if (numeric) uniq.sort(function (a, b) { return +a - +b; }); else uniq.sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
    if (uniq.length < 2) throw new Error("目标列「" + H[tj] + "」只有一个类别，没法分类");
    if (uniq.length > LIMIT.classes) throw new Error("目标列「" + H[tj] + "」有 " + uniq.length + " 个不同的值，太多了，不像分类；要做回归请把任务类型改成回归");
    var idx = {}; uniq.forEach(function (s, k) { idx[s] = k; });
    var yc = new Int32Array(n); for (i = 0; i < n; i++) yc[i] = idx[numeric ? String(toNum(labs[i], decComma)) : labs[i]];
    out.y = yc; out.classes = uniq;
  }
  return out;
};

/**
 * impute(D, idx, opt) → 新的 Data：X 里的 NaN 换成该列的中位数。
 * idx（Int32Array 或数组）：只用这些行算中位数——应当传训练集的下标。
 *   为什么：中位数是"别的样本"的统计量。用全部行（包括测试集）算，测试集的特征值就影响了训练时看到的数据，
 *   是一种轻微的泄露（不碰标签，单个样本对中位数的影响有界，所以通常很小，但原则上应当避免）。
 *   不传 idx 时就用全部行，结果的 meta.imputed.from = "all" 会如实记下。
 * opt.indicators：给有缺失的列各加一列"是否缺失"（0/1）：缺失本身可能就有信息。
 */
reg.impute = function (D, idx, opt) {
  opt = opt || {};
  var n = D.n, d = D.d, X = D.X, med = new Float64Array(d), has = new Uint8Array(d), i, j, rows = idx ? Array.prototype.slice.call(idx) : null;
  for (j = 0; j < d; j++) {
    var vals = [], m = rows ? rows.length : n;
    for (var t = 0; t < m; t++) { var v = X[(rows ? rows[t] : t) * d + j]; if (v === v) vals.push(v); }
    vals.sort(function (a, b) { return a - b; });
    var L = vals.length;
    med[j] = L ? (L % 2 ? vals[(L - 1) / 2] : 0.5 * (vals[L / 2 - 1] + vals[L / 2])) : 0;
  }
  for (i = 0; i < n * d; i++) if (X[i] !== X[i]) has[i % d] = 1;
  var extra = [], names = [];
  for (j = 0; j < d; j++) names.push(D.featureNames ? D.featureNames[j] : "x" + (j + 1));
  if (opt.indicators) for (j = 0; j < d; j++) if (has[j]) { extra.push(j); names.push(names[j] + "·缺失"); }
  var d2 = d + extra.length, X2 = new Float64Array(n * d2);
  for (i = 0; i < n; i++) {
    for (j = 0; j < d; j++) { var x = X[i * d + j]; X2[i * d2 + j] = x === x ? x : med[j]; }
    for (var e = 0; e < extra.length; e++) { var x0 = X[i * d + extra[e]]; X2[i * d2 + d + e] = x0 === x0 ? 0 : 1; }
  }
  var out = {}, k;
  for (k in D) if (Object.prototype.hasOwnProperty.call(D, k)) out[k] = D[k];
  var meta = {}; if (D.meta) for (k in D.meta) meta[k] = D.meta[k];
  meta.hasNaN = false; meta.imputed = { median: Array.prototype.slice.call(med), from: rows ? "rows" : "all", indicators: extra.length };
  out.X = X2; out.d = d2; out.meta = meta;
  if (D.featureNames || extra.length) out.featureNames = names;
  return out;
};

QL.mlreg = reg;
return reg;
}
if (typeof module !== "undefined" && module.exports) module.exports = QL_MLREG_INSTALL;
