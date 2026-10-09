// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 英文版的生成工具。
 *
 * 源码只有一份（中文）。英文版在构建时生成：把源码里每一段给人看的中文换成译文，代码本身一个字不动。
 * 所以两种语言的页面跑的是同一套计算，数字逐位相同；改了源码里的中文而没有补译文，构建会失败并指出是哪一段。
 *
 * "一段"（unit）有四种：
 *   lit    单独出现的字符串字面量            "买入持有"
 *   chain  用 + 拼起来的一串，整串当一句来译  "已生成 " + N + " 条路径"  →  已生成 §0§ 条路径
 *   tpl    模板字符串（代码、Markdown）        `…${x}…`                →  …§0§…
 *   raw    String.raw 模板（带 LaTeX 的 Markdown）
 *   cmt    规则代码里的注释。玩法自带的规则是真的函数，界面上用 toString() 把它的源码拿出来给人看，所以函数体里的 // 注释也要译；
 *          只管 fit / init / decide 这三个函数里面的，别处的注释使用者看不到，不动
 * 译文里的 §0§ §1§ … 可以换位置（英文的语序和中文不同），但每个必须正好出现一次。
 *
 * 用法：
 *   node i18n/i18n.js extract            列出每个文件的全部 unit（写到 i18n/work/units.json，并打印统计）
 *   node i18n/i18n.js export <dir>       把还没有译文的 unit 写成给译者的文本（每个文件一份）
 *   node i18n/i18n.js import <file…>     读回译者交的文本，并入 i18n/en/*.json
 *   node i18n/i18n.js apply <outdir>     生成英文版的源码（build.py 调用）；缺译文时失败
 *   node i18n/i18n.js check              只检查：缺译文、占位符不齐、公式或代码被改动
 */
"use strict";
const fs = require("fs"), path = require("path");
function need(name) { try { return require(name); } catch (e) { return require("/opt/npm-tools/node_modules/" + name); } }
const acorn = need("acorn");
const ROOT = path.join(__dirname, ".."), SRC = path.join(ROOT, "src"), CAT = path.join(__dirname, "en"), WORK = path.join(__dirname, "work");

/** 要译的字符：汉字、中文标点、全角字符 */
const CJK = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
const HAN = /[\u3400-\u9fff]/;
const PH = (i) => "\u00a7" + i + "\u00a7";            // §i§。手册的文字里 ⟦…⟧ 已经用作行内代码的记号，所以占位符不用它
const PH_RE = /\u00a7(\d+)\u00a7/g;
const FILES = () => fs.readdirSync(SRC).filter((f) => f.endsWith(".js")).sort();

/* ---------- 解析：找出一个文件里的全部 unit ---------- */
function isStr(n) { return n && n.type === "Literal" && typeof n.value === "string"; }
function isRawTag(n) { return n && n.type === "TaggedTemplateExpression" && ((n.tag.type === "Identifier" && n.tag.name === "R") || (n.tag.type === "MemberExpression" && n.tag.object.name === "String" && n.tag.property.name === "raw")); }
/** 没有 ${} 的模板，可以当成一段固定的文字 */
function plainText(n) {
  if (isStr(n)) return n.value;
  if (n.type === "TemplateLiteral" && n.expressions.length === 0) return n.quasis[0].value.cooked;
  if (isRawTag(n) && n.quasi.expressions.length === 0) return n.quasi.quasis[0].value.raw;
  return null;
}
function parse(file) {
  const src = fs.readFileSync(path.join(SRC, file), "utf8");
  const comments = [];
  const ast = acorn.parse(src, { ecmaVersion: 2022, preserveParens: true, locations: true, onComment: (block, text, start, end, startLoc) => comments.push({ block, text, start, end, line: startLoc ? startLoc.line : 0 }) });
  const units = [], regexes = [], risky = [], shown = [];
  function line(n) { return n.loc.start.line; }
  function mk(kind, node, parts) {
    // parts: 依次是 {t: 文字} 或 {e: 表达式节点, e2: 结束节点（一组前缀时）}
    let zh = "", ph = [], k = 0;
    parts.forEach((p) => { if (p.t !== undefined) zh += p.t; else { zh += PH(k++); ph.push(p); } });
    const u = { file, kind, start: node.start, end: node.end, line: line(node), zh, ph: ph.map((p) => ({ start: p.s, end: p.e, src: src.slice(p.s, p.e), wrap: p.wrap })), kids: [] };
    return u;
  }
  /** 把左结合的 a + b + c 摊平成 [a, b, c]（带括号的子表达式不拆） */
  function flatten(n) { const out = []; (function go(x) { if (x.type === "BinaryExpression" && x.operator === "+") { go(x.left); out.push(x.right); } else out.push(x); })(n); return out; }
  function chainUnit(node) {
    const ops = flatten(node), txt = ops.map(plainText);
    if (!txt.some((t) => t !== null && CJK.test(t))) return null;
    const first = txt.findIndex((t) => t !== null), parts = [];
    // 第一个字符串之前的那几项是按数值相加的（n + 1 + " 步"），合成一个占位符
    if (first > 0) parts.push({ s: ops[0].start, e: ops[first - 1].end, wrap: first > 1 || !simple(ops[0]), nodes: ops.slice(0, first) });
    for (let i = Math.max(first, 0); i < ops.length; i++) {
      if (txt[i] !== null) { const last = parts[parts.length - 1]; if (last && last.t !== undefined) last.t += txt[i]; else parts.push({ t: txt[i] }); }
      else parts.push({ s: ops[i].start, e: ops[i].end, wrap: !simple(ops[i]), nodes: [ops[i]] });
    }
    return { u: mk("chain", node, parts), parts };
  }
  function simple(n) { return n.type === "Identifier" || n.type === "Literal" || n.type === "ParenthesizedExpression" || n.type === "MemberExpression" || n.type === "CallExpression" || n.type === "TemplateLiteral" || n.type === "TaggedTemplateExpression"; }
  function tplUnit(node, quasi, raw) {
    const q = quasi.quasis.map((x) => (raw ? x.value.raw : x.value.cooked));
    if (!q.some((t) => CJK.test(t))) return null;
    const parts = [];
    q.forEach((t, i) => { if (t) parts.push({ t }); if (i < quasi.expressions.length) { const e = quasi.expressions[i]; parts.push({ s: e.start, e: e.end, wrap: !simple(e), nodes: [e] }); } });
    return { u: mk(raw ? "raw" : "tpl", node, parts), parts };
  }
  /** 字面量是不是被当成"键"在用（比较、查找、切分）：这些地方译文必须和别处一致，单独列出来人工看 */
  function riskOf(node, parent, gp) {
    if (!parent) return null;
    if (parent.type === "BinaryExpression" && /^[!=]==?$/.test(parent.operator)) return "compare";
    if (parent.type === "SwitchCase" && parent.test === node) return "case";
    if (parent.type === "Property" && parent.key === node) return "key";
    if (parent.type === "MemberExpression" && parent.property === node) return "index";
    if (parent.type === "BinaryExpression" && parent.operator === "in") return "in";
    if (parent.type === "CallExpression" && parent.arguments.indexOf(node) >= 0 && parent.callee.type === "MemberExpression" && !parent.callee.computed && /^(indexOf|lastIndexOf|includes|startsWith|endsWith|split|replace|replaceAll|match|search|test|localeCompare)$/.test(parent.callee.property.name)) return "call:" + parent.callee.property.name;
    if (parent.type === "NewExpression" && parent.callee.name === "RegExp") return "regexp";
    return null;
  }
  function walk(node, parent, gp, sink, prop) {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "Property" && !node.computed) prop = node.key.name || node.key.value;
    if (node.type === "Property" && !node.computed && /^(fit|init|decide)$/.test(node.key.name || node.key.value) && /Function/.test(node.value.type)) shown.push([node.value.start, node.value.end, node.key.name || node.key.value]);
    let made = null;
    if (node.type === "BinaryExpression" && node.operator === "+" && !(parent && parent.type === "BinaryExpression" && parent.operator === "+" && parent.left === node)) made = chainUnit(node);
    else if (node.type === "TemplateLiteral" && !(parent && parent.type === "TaggedTemplateExpression")) made = tplUnit(node, node, false);
    else if (isRawTag(node)) made = tplUnit(node, node.quasi, true);
    else if (node.type === "TaggedTemplateExpression") { if (node.quasi.quasis.some((q) => CJK.test(q.value.raw))) throw new Error(file + ":" + line(node) + " 有不认识的带标签模板"); }
    else if (isStr(node) && CJK.test(node.value)) { const u = mk("lit", node, [{ t: node.value }]); const r = riskOf(node, parent, gp); if (r) { u.risk = r; risky.push(u); } u.prop = prop; sink.push(u); return; }
    else if (node.type === "Literal" && node.regex && CJK.test(node.regex.pattern)) { const u = mk("regex", node, [{ t: src.slice(node.start, node.end) }]); regexes.push(u); sink.push(u); return; }
    if (made) {
      sink.push(made.u);
      // 占位符里面还可能有别的 unit（例如 (a ? "是" : "否")）
      made.u.prop = prop;
      made.parts.forEach((p) => { if (p.nodes) p.nodes.forEach((n) => walk(n, node, parent, made.u.kids, prop)); });
      return;
    }
    for (const k in node) {
      if (k === "type" || k === "loc" || k === "start" || k === "end") continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach((c) => { if (c && typeof c.type === "string") walk(c, node, parent, sink, prop); });
      else if (v && typeof v.type === "string") walk(v, node, parent, sink, prop);
    }
  }
  walk(ast, null, null, units, "");
  comments.forEach((c) => {
    if (!CJK.test(c.text)) return; const fn = shown.find((r) => c.start >= r[0] && c.end <= r[1]); if (!fn) return;
    if (c.block) throw new Error(file + ":" + c.line + " 规则代码里的块注释还不支持，请改成 // 注释");
    const lead = /^\s*/.exec(c.text)[0];
    units.push({ file, kind: "cmt", start: c.start, end: c.end, line: c.line, zh: c.text.slice(lead.length).replace(/\s+$/, ""), lead, ph: [], kids: [], prop: fn[2] });
  });
  // 按出现的先后编号（含嵌套的），同一段中文在这个文件里是第几次出现也记下来
  const flat = [], seen = new Map();
  (function num(list) { list.sort((a, b) => a.start - b.start).forEach((u) => { u.idx = flat.length; flat.push(u); num(u.kids); }); })(units);
  flat.sort((a, b) => a.start - b.start).forEach((u, i) => { u.idx = i; u.id = file + "#" + i; const c = (seen.get(u.zh) || 0) + 1; seen.set(u.zh, c); u.occ = c; });
  return { file, src, units, flat, regexes, risky };
}

/* ---------- 译文表 ---------- */
function loadCat(file) {
  const p = path.join(CAT, file + ".json");
  if (!fs.existsSync(p)) return { any: new Map(), occ: new Map() };
  const any = new Map(), occ = new Map();
  JSON.parse(fs.readFileSync(p, "utf8")).forEach((e) => { if (e.occ) occ.set(e.occ + "\u0000" + e.zh, e.en); else any.set(e.zh, e.en); });
  return { any, occ };
}
let GLOBAL = null;
function globalCat() {
  if (GLOBAL) return GLOBAL; GLOBAL = new Map();
  const p = path.join(CAT, "_terms.json");
  if (fs.existsSync(p)) JSON.parse(fs.readFileSync(p, "utf8")).forEach((e) => GLOBAL.set(e.zh, e.en));
  return GLOBAL;
}
/** 查一段的译文：先看这个文件里指定"第几次出现"的，再看这个文件里通用的，最后看全局的词表 */
function lookup(cat, u) {
  const a = cat.occ.get(u.occ + "\u0000" + u.zh); if (a !== undefined) return a;
  const b = cat.any.get(u.zh); if (b !== undefined) return b;
  const c = globalCat().get(u.zh); if (c !== undefined) return c;
  return undefined;
}
function saveCat(file, entries) {
  fs.mkdirSync(CAT, { recursive: true });
  // 同一段中文的各次出现译法都一样时只存一条；和全局词表相同的不存
  const by = new Map(); entries.forEach((e) => { if (!by.has(e.zh)) by.set(e.zh, []); by.get(e.zh).push(e); });
  const out = [];
  by.forEach((list, zh) => { const same = list.every((e) => e.en === list[0].en); if (same) { if (globalCat().get(zh) !== list[0].en) out.push({ zh, en: list[0].en }); } else list.forEach((e) => out.push({ zh, en: e.en, occ: e.occ })); });
  if (out.length) fs.writeFileSync(path.join(CAT, file + ".json"), "[\n" + out.map((e) => JSON.stringify(e)).join(",\n") + "\n]\n"); else if (fs.existsSync(path.join(CAT, file + ".json"))) fs.unlinkSync(path.join(CAT, file + ".json"));
}

/* ---------- 检查一条译文 ---------- */
let ALLOW = null;
function allowHan() { if (ALLOW) return ALLOW; ALLOW = new Set(); const p = path.join(CAT, "_allow_han.json"); if (fs.existsSync(p)) JSON.parse(fs.readFileSync(p, "utf8")).forEach((z) => ALLOW.add(z)); return ALLOW; }
/** 不算错、但值得人看一眼的差别：列表项、表格、加粗、行内代码的个数，以及文中出现的数字 */
function warnings(u, en) {
  if (u.kind === "regex" || looksLikeCode(u.zh)) return [];
  const w = [], cnt = (t, re) => (t.match(re) || []).length;
  const pairs = [["list items", /(^|\n)\s*- /g], ["numbered items", /(^|\n)\s*\d+\. /g], ["table pipes", /\|/g], ["bold markers", /\*\*/g], ["inline-code marks", /[\u27e6`]/g], ["paragraph breaks", /\n\n/g], ["headings", /(^|\n)#+ /g]];
  pairs.forEach(([name, re]) => { const a = cnt(u.zh, re), b = cnt(en, re); if (a !== b) w.push(name + " " + a + "→" + b); });
  const strip = (t) => t.replace(/\$\$[\s\S]+?\$\$|\$(?:\\.|[^$\\\n])+?\$/g, " ").replace(/\u27ea[^\u27eb]*\u27eb/g, " ").replace(/\u00a7\d+\u00a7/g, " ");
  const nums = (t) => (strip(t).match(/\d+(?:\.\d+)?/g) || []).sort().join(",");
  if (nums(u.zh) !== nums(en)) { const a = nums(u.zh).split(","), b = nums(en).split(","); const miss = a.filter((x) => { const i = b.indexOf(x); if (i >= 0) { b.splice(i, 1); return false; } return true; }); if (miss.length || b.length) w.push("numbers: missing [" + miss.slice(0, 6).join(" ") + "], extra [" + b.slice(0, 6).join(" ") + "]"); }
  return w;
}
function phList(s) { const out = []; let m; PH_RE.lastIndex = 0; while ((m = PH_RE.exec(s))) out.push(+m[1]); return out.sort((a, b) => a - b).join(","); }
/** 行内与独立公式：$…$、$$…$$（译文里公式必须原样保留；\text{} 里的中文除外） */
/** 一段文字是从公式中间开始或结束的片段（$ 的个数是奇数）时，哪些段落是公式：按 $ 切开，奇偶两组里不含汉字的那一组 */
function fragMaths(zh, en) {
  const cut = (t) => t.split("$"), norm = (x) => x.replace(/\\(?:text|mathrm|textbf|operatorname)\{[^{}]*\}/g, "\\text{}").replace(/\s+/g, "");
  const a = cut(zh), b = cut(en); if (a.length !== b.length) return null;
  const hanAt = (par) => a.some((x, i) => i % 2 === par && HAN.test(x.replace(/\\(?:text|mathrm|textbf|operatorname)\{[^{}]*\}/g, "")));
  const par = !hanAt(0) ? 0 : !hanAt(1) ? 1 : -1; if (par < 0) return null;
  const pick = (arr) => arr.filter((x, i) => i % 2 === par).map(norm);
  return [pick(a), pick(b)];
}
function maths(s) { const out = []; const re = /\$\$([\s\S]+?)\$\$|\$((?:\\.|[^$\\\n])+?)\$/g; let m; while ((m = re.exec(s))) out.push((m[1] || m[2]).replace(/\\(?:text|mathrm|textbf|operatorname)\{[^{}]*\}/g, "\\text{}").replace(/\s+/g, "")); return out; }
function firstDiff(a, b) { const x = a.slice().sort(), y = b.slice().sort(); for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return JSON.stringify(x[i] === undefined ? "(none)" : x[i].slice(0, 60)) + " vs " + JSON.stringify(y[i] === undefined ? "(none)" : y[i].slice(0, 60)); return "(order only)"; }
function tokens(s) { return (s.match(/\u27ea[^\u27eb]*\u27eb/g) || []).slice().sort().join("\n"); }
/** 代码去掉注释和字符串内容之后应当逐字相同 */
function codeSkeleton(s) {
  let out = "", i = 0; const n = s.length;
  while (i < n) {
    const c = s[i], d = s[i + 1];
    if (c === "/" && d === "/") { while (i < n && s[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i = s.indexOf("*/", i + 2); i = i < 0 ? n : i + 2; continue; }
    if (c === '"' || c === "'") { const q = c; let j = i + 1, body = ""; while (j < n && s[j] !== q) { if (s[j] === "\\") { body += s[j] + s[j + 1]; j += 2; } else body += s[j++]; } out += q + (CJK.test(body) || /[A-Za-z]{3,} [A-Za-z]{3,}/.test(body) ? "" : body) + q; i = j + 1; continue; }
    out += c; i++;
  }
  return out.replace(/\s+/g, " ").trim();
}
function looksLikeCode(zh) { return /\bfunction\s+(decide|simulate|init|fit)\s*\([^)]*\)\s*\{/.test(zh); }
function validate(u, en) {
  const errs = [];
  if (typeof en !== "string") return ["no translation"];
  if (u.kind === "regex") { try { const m = /^\/(.*)\/([a-z]*)$/.exec(en); new RegExp(m[1], m[2]); } catch (e) { return ["not a valid regular expression"]; } return []; }
  if (u.kind === "cmt") { const e = []; if (/[\r\n]/.test(en)) e.push("a code comment must stay on one line"); if (CJK.test(en)) e.push("Chinese characters or full-width punctuation left in the comment"); if (!en.trim()) e.push("empty"); return e; }
  if (phList(u.zh) !== phList(en)) errs.push("placeholders differ: source has [" + phList(u.zh) + "], translation has [" + phList(en) + "] (each §n§ must appear exactly once)");
  if (CJK.test(en) && !allowHan().has(u.zh)) errs.push("Chinese characters or full-width punctuation left in the translation near: " + (en.match(/.{0,12}[\u3400-\u9fff\u3000-\u303f\uff00-\uffef].{0,12}/) || [""])[0]);
  if (tokens(u.zh) !== tokens(en)) errs.push("a ⟪…⟫ live-number token was changed, added or dropped");
  if (looksLikeCode(u.zh)) { if (codeSkeleton(u.zh) !== codeSkeleton(en)) errs.push("the code was changed (only comments and Chinese string contents may change)"); }
  else { let a = maths(u.zh), b = maths(en); const odd = (u.zh.split("$").length - 1) % 2 === 1, fm = odd ? fragMaths(u.zh, en) : null; if (fm) { a = fm[0]; b = fm[1]; }
    if (a.slice().sort().join("\n") !== b.slice().sort().join("\n")) errs.push("LaTeX differs: " + a.length + " formulas in the source, " + b.length + " in the translation; first difference: " + firstDiff(a, b)); }
  return errs;
}

/* ---------- 生成英文源码 ---------- */
function render(p, u, cat, missing) {
  const en = lookup(cat, u);
  if (en === undefined) { missing.push(u); return p.src.slice(u.start, u.end); }
  if (u.kind === "regex") return en;                         // 正则的"译文"就是另一段正则的源码
  if (u.kind === "cmt") return "//" + u.lead + en;
  // 占位符里的源码：先把里面嵌套的 unit 换掉
  const phSrc = u.ph.map((h) => { const s = splice(p, h.start, h.end, u.kids.filter((k) => k.start >= h.start && k.end <= h.end), cat, missing); return h.wrap ? "(" + s + ")" : s; });
  const pieces = []; let last = 0, m; PH_RE.lastIndex = 0;
  while ((m = PH_RE.exec(en))) { if (m.index > last) pieces.push(JSON.stringify(en.slice(last, m.index))); pieces.push(phSrc[+m[1]]); last = m.index + m[0].length; }
  if (last < en.length || !pieces.length) pieces.push(JSON.stringify(en.slice(last)));
  if (pieces.length === 1 && pieces[0][0] === '"') return pieces[0];
  if (pieces[0][0] !== '"') pieces.unshift('""');           // 保证从头到尾都是字符串拼接
  const s = pieces.join(" + ");
  return u.kind === "chain" ? s : "(" + s + ")";
}
function splice(p, from, to, units, cat, missing) {
  let out = "", pos = from;
  units.slice().sort((a, b) => a.start - b.start).forEach((u) => { out += p.src.slice(pos, u.start) + render(p, u, cat, missing); pos = u.end; });
  return out + p.src.slice(pos, to);
}
function applyFile(file) {
  const p = parse(file), cat = loadCat(file), missing = [];
  const out = splice(p, 0, p.src.length, p.units, cat, missing);
  return { out, missing, p };
}

/* ---------- 给译者的文本格式 ---------- */
const SP = "\u2423", NL = "\u21b5";                       // ␣ ↵：一段开头或结尾的空格、换行（中间的照原样）
function enc(s) { const a = /^[ \n]*/.exec(s)[0], b = /[ \n]*$/.exec(s.slice(a.length))[0], mid = s.slice(a.length, s.length - b.length); const v = (w) => w.replace(/ /g, SP).replace(/\n/g, NL); return v(a) + mid + v(b); }
function dec(s) { s = s.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, ""); const a = new RegExp("^[" + SP + NL + "]*").exec(s)[0], rest = s.slice(a.length), b = new RegExp("[" + SP + NL + "]*$").exec(rest)[0], mid = rest.slice(0, rest.length - b.length); const v = (w) => w.replace(new RegExp(SP, "g"), " ").replace(new RegExp(NL, "g"), "\n"); return v(a) + mid + v(b); }
function block(u, text) { return "@@@ " + u.id + " | " + u.kind + " | line " + u.line + (u.prop ? " | in " + u.prop : "") + (u.ph.length ? " | " + u.ph.map((h, i) => PH(i) + " = " + h.src.replace(/\s+/g, " ").slice(0, 90)).join(" ; ") : "") + "\n" + enc(text) + "\n"; }
function parseBlocks(text) {
  const out = new Map(), re = /^@@@ (\S+)[^\n]*\n/gm; let m, prev = null, prevEnd = 0;
  while ((m = re.exec(text))) { if (prev) out.set(prev, dec(text.slice(prevEnd, m.index))); prev = m[1]; prevEnd = m.index + m[0].length; }
  if (prev) out.set(prev, dec(text.slice(prevEnd)));
  return out;
}

module.exports = { parse, applyFile, loadCat, saveCat, lookup, validate, warnings, FILES, CJK, HAN, PH, enc, dec, block, parseBlocks, globalCat, codeSkeleton, maths, looksLikeCode, CAT, WORK, SRC, ROOT };

/* ---------- 命令行 ---------- */
if (require.main === module) {
  const cmd = process.argv[2], args = process.argv.slice(3);
  if (cmd === "extract") {
    fs.mkdirSync(WORK, { recursive: true });
    const all = [], stat = []; let regexes = [], risky = [];
    FILES().forEach((f) => { const p = parse(f); p.flat.forEach((u) => all.push({ id: u.id, file: f, kind: u.kind, line: u.line, occ: u.occ, zh: u.zh, ph: u.ph.map((h) => h.src), risk: u.risk, prop: u.prop })); regexes = regexes.concat(p.regexes.map((u) => ({ id: u.id, file: f, line: u.line, src: u.zh }))); risky = risky.concat(p.risky.map((u) => ({ id: u.id, line: u.line, risk: u.risk, zh: u.zh })));
      const han = p.flat.reduce((a, u) => a + (u.zh.match(/[\u3400-\u9fff]/g) || []).length, 0); stat.push(f.padEnd(18) + " units " + String(p.flat.length).padStart(5) + "  han " + String(han).padStart(6)); });
    fs.writeFileSync(path.join(WORK, "units.json"), JSON.stringify(all, null, 0));
    fs.writeFileSync(path.join(WORK, "risky.json"), JSON.stringify({ regexes, risky }, null, 1));
    console.log(stat.join("\n")); console.log("total units", all.length, "unique zh", new Set(all.map((u) => u.zh)).size, "regexes", regexes.length, "risky", risky.length);
  } else if (cmd === "sig") {
    // 和页面里 app-live.js 的算法一致：hash(线程池的源码) + "." + 长度
    const req = (f) => require(path.join(SRC, f));
    const QL_CORE = req("core.js"); global.QL_CORE = QL_CORE; global.QL_ML_INSTALL = req("ml.js"); global.QL_GAMES_INSTALL = req("games.js"); global.QL_OBS_INSTALL = req("obs-games.js"); global.QL_LIVE_INSTALL = req("live.js");
    const QL = QL_CORE({}), STRATS = req("strategies.js"); global.QL_STRATS = STRATS; req("models.js"); req("game-strats.js")(QL).forEach((x) => STRATS.push(x)); req("obs-strats.js")(QL).forEach((x) => STRATS.push(x));
    const QLEngine = new Function(fs.readFileSync(path.join(SRC, "engine-client.js"), "utf8") + "\n;return QLEngine;")();
    const src = QLEngine.poolSource(STRATS.filter((x) => !x.src)); let x = 2166136261; for (let i = 0; i < src.length; i++) { x ^= src.charCodeAt(i); x = Math.imul(x, 16777619); }
    console.log((x >>> 0).toString(36) + "." + src.length);
  } else if (cmd === "apply") {
    const outdir = args[0]; fs.mkdirSync(outdir, { recursive: true }); let miss = 0, bad = 0;
    FILES().forEach((f) => { const r = applyFile(f); fs.writeFileSync(path.join(outdir, f), r.out);
      r.missing.forEach((u) => { if (miss < 40) console.error("缺译文 " + u.id + " (line " + u.line + "): " + JSON.stringify(u.zh.slice(0, 60))); miss++; });
      const cat = loadCat(f); r.p.flat.forEach((u) => { const en = lookup(cat, u); if (en === undefined) return; const e = validate(u, en); if (e.length) { bad++; if (bad < 40) console.error("译文有问题 " + u.id + " (line " + u.line + "): " + e.join("；")); } });
      try { acorn.parse(r.out, { ecmaVersion: 2022 }); } catch (e) { console.error("生成的 " + f + " 语法有错: " + e.message); process.exit(2); } });
    if (miss || bad) { console.error("缺译文 " + miss + " 段，有问题 " + bad + " 段"); if (!process.env.I18N_LENIENT) process.exit(1); }
  } else if (cmd === "check") {
    let miss = 0, bad = 0, n = 0;
    FILES().forEach((f) => { const p = parse(f), cat = loadCat(f); p.flat.forEach((u) => { n++; const en = lookup(cat, u); if (en === undefined) { miss++; return; } const e = validate(u, en); if (e.length) { bad++; console.log(u.id + " (line " + u.line + "): " + e.join("；")); } }); });
    // 被拿去做比较的字面量：凡是和它同文的字面量，译文必须全都一样
    const keyed = new Map(), seenEn = new Map();
    FILES().forEach((f) => { const p = parse(f), cat = loadCat(f); p.risky.forEach((u) => keyed.set(u.zh, u.id)); p.flat.forEach((u) => { if (u.kind !== "lit") return; const en = lookup(cat, u); if (en === undefined) return; if (!seenEn.has(u.zh)) seenEn.set(u.zh, new Map()); const m = seenEn.get(u.zh); if (!m.has(en)) m.set(en, u.id); }); });
    let clash = 0; keyed.forEach((id, zh) => { const m = seenEn.get(zh); if (m && m.size > 1) { clash++; console.log("比较用的字面量译法不一致 " + JSON.stringify(zh) + "（" + id + "）: " + [...m.entries()].map(([en, at]) => JSON.stringify(en) + " @" + at).join(" | ")); } });
    console.log("units " + n + "，缺译文 " + miss + "，有问题 " + bad + (clash ? "，比较用的字面量不一致 " + clash : ""));
    if (miss || bad || clash) process.exitCode = 1;
  } else if (cmd === "export") {
    // export <dir> [每块最多多少汉字]：把还没有译文的 unit 写成给译者的文本；大文件按 unit 的先后切成几块
    const dir = args[0], cap = +args[1] || 1e9; fs.mkdirSync(dir, { recursive: true }); const index = [];
    FILES().forEach((f) => {
      const p = parse(f), cat = loadCat(f), todo = p.flat.filter((u) => lookup(cat, u) === undefined); if (!todo.length) return;
      const han = (u) => (u.zh.match(/[\u3400-\u9fff]/g) || []).length, total = todo.reduce((a, u) => a + han(u), 0), parts = Math.max(1, Math.ceil(total / cap)), per = total / parts;
      let k = 0, acc = 0, cur = [];
      const flush = () => { if (!cur.length) return; const name = f + (parts > 1 ? ".part" + (k + 1) : "") + ".zh.txt"; fs.writeFileSync(path.join(dir, name), cur.map((u) => block(u, u.zh)).join("\n")); index.push({ file: name, src: f, units: cur.length, han: cur.reduce((a, u) => a + han(u), 0), lines: cur[0].line + "-" + cur[cur.length - 1].line }); cur = []; k++; acc = 0; };
      todo.forEach((u) => { cur.push(u); acc += han(u); if (acc >= per && k < parts - 1) flush(); });
      flush();
    });
    fs.writeFileSync(path.join(dir, "_index.json"), JSON.stringify(index, null, 1));
    const snap = []; FILES().forEach((f) => parse(f).flat.forEach((u) => snap.push({ id: u.id, file: f, kind: u.kind, occ: u.occ, zh: u.zh })));
    fs.writeFileSync(path.join(dir, "_units.json"), JSON.stringify(snap));
    index.forEach((x) => console.log(x.file.padEnd(34), "units", String(x.units).padStart(4), " han", String(x.han).padStart(6), " lines", x.lines));
    console.log("共 " + index.reduce((a, x) => a + x.units, 0) + " 段，" + index.reduce((a, x) => a + x.han, 0) + " 个汉字");
  } else if (cmd === "import") {
    // import <给译者的目录> <译者交回的文件…>：按"中文原文"入库，不按编号。所以导出之后源码里别处有改动也不要紧。
    // import <导出时的目录 | -> <译稿…>：目录里的 _units.json 记着导出那一刻每个编号对应哪一段；写 - 表示编号按现在的源码算（手工改几条译文时用）
    const todoDir = args[0], snapOf = new Map();
    if (todoDir === "-") FILES().forEach((f) => parse(f).flat.forEach((u) => snapOf.set(u.id, { id: u.id, file: f, kind: u.kind, occ: u.occ, zh: u.zh })));
    else JSON.parse(fs.readFileSync(path.join(todoDir, "_units.json"), "utf8")).forEach((u) => snapOf.set(u.id, u));
    const got = new Map(); args.slice(1).forEach((a) => parseBlocks(fs.readFileSync(a, "utf8")).forEach((v, k) => got.set(k, v)));
    let n = 0, bad = 0, lost = 0; const warn = [], rej = [], byFile = new Map();
    got.forEach((en, id) => { const sn = snapOf.get(id); if (!sn) { console.log("  不认识的编号 " + id); return; } if (!byFile.has(sn.file)) byFile.set(sn.file, []); byFile.get(sn.file).push({ id, sn, en }); });
    byFile.forEach((list, f) => {
      const p = parse(f), cat = loadCat(f), byKey = new Map(); p.flat.forEach((u) => byKey.set(u.occ + "\u0000" + u.zh, u));
      const set = new Map();
      list.forEach((x) => {
        const k = x.sn.occ + "\u0000" + x.sn.zh, u = byKey.get(k);
        if (!u) { lost++; console.log("  源码里已经没有这一段了 " + x.id + ": " + JSON.stringify(x.sn.zh.slice(0, 40))); return; }
        const e = validate(u, x.en); if (e.length) { bad++; rej.push(x.id + " (line " + u.line + "): " + e.join("; ")); return; }
        n++; const w = warnings(u, x.en); if (w.length) warn.push(x.id + " (line " + u.line + "): " + w.join("; "));
        set.set(k, x.en);
      });
      const entries = [];
      p.flat.forEach((u) => { const k = u.occ + "\u0000" + u.zh; let en = set.get(k); if (en === undefined) { const a = cat.occ.get(k); en = a !== undefined ? a : cat.any.get(u.zh); } if (en !== undefined) entries.push({ zh: u.zh, en, occ: u.occ }); });
      saveCat(f, entries);
    });
    console.log("收下 " + n + " 段，拒收 " + bad + " 段，值得看一眼的 " + warn.length + " 段" + (lost ? "，源码里找不到的 " + lost + " 段" : ""));
    rej.forEach((x) => console.log("  拒收 " + x));
    if (process.env.I18N_WARN) warn.forEach((x) => console.log("  注意 " + x));
  } else if (cmd === "show") {
    // show <文件名 | all> [正则]：按给译者的格式列出原文和现在的译文（原文或译文匹配正则的那些），改译文时先用它找编号
    const re = args[1] ? new RegExp(args[1]) : null;
    (args[0] === "all" ? FILES() : [args[0]]).forEach((f) => { const p = parse(f), cat = loadCat(f); p.flat.forEach((u) => { const en = lookup(cat, u); if (re && !re.test(u.zh) && !(en && re.test(en))) return; console.log(block(u, u.zh).trimEnd() + "\n  => " + (en === undefined ? "(none)" : enc(en)) + "\n"); }); });
  } else if (cmd === "verify") {
    // verify <给译者的那份> <译者交回的一份或几份>：只检查，不入库。译者自己用它查漏、查改坏了的公式和占位符
    const want = parseBlocks(fs.readFileSync(args[0], "utf8")), got = new Map();
    args.slice(1).forEach((a) => parseBlocks(fs.readFileSync(a, "utf8")).forEach((v, k) => { if (got.has(k)) console.log("DUPLICATE " + k); got.set(k, v); }));
    const units = new Map(); new Set([...want.keys()].map((k) => k.split("#")[0])).forEach((f) => parse(f).flat.forEach((u) => units.set(u.id, u)));
    let ok = 0, bad = 0, warn = 0, missing = 0;
    want.forEach((zh, id) => {
      const u = units.get(id); if (!u) { console.log("UNKNOWN UNIT " + id); return; }
      if (!got.has(id)) { missing++; console.log("MISSING " + id); return; }
      const en = got.get(id), e = validate(u, en);
      if (e.length) { bad++; console.log("REJECTED " + id + " (line " + u.line + "): " + e.join("; ")); return; }
      ok++; const w = warnings(u, en); if (w.length) { warn++; console.log("warning  " + id + " (line " + u.line + "): " + w.join("; ")); }
    });
    got.forEach((v, id) => { if (!want.has(id)) console.log("EXTRA " + id + " (not in the input file)"); });
    console.log("\n" + ok + " ok, " + bad + " rejected, " + missing + " missing, " + warn + " with warnings (of " + want.size + " units)");
    process.exit(bad || missing ? 1 : 0);
  } else { console.log("用法见文件开头"); process.exit(1); }
}
