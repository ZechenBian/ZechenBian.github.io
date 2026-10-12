// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 英文版测试共用的两样工具（ui-en.js、ui-en-lobby.js）：装在页面里的"汉字探头"，和找"被截掉的字"的函数。
// 这两个函数都是整个搬进页面里执行的（addInitScript / evaluate），所以里面不能用到外面的变量。
/** 装在页面里的"汉字探头"：之后凡是进入页面的文字、属性、画到图上的字，带汉字或中文标点的都记下来（连同当时走到哪一步） */
function probe() {
  const RE = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/, seen = new Map(), all = new Map();
  window.__stage = "load";
  // 顺带把出现过的全部文字留一份（去重），供事后检查英文的拼接：缺空格、单复数、a / an 之类
  function note(s, where) { if (typeof s === "string" && s.trim() && s.length < 4000 && all.size < 60000) { const k0 = s.replace(/\s+/g, " ").trim(); if (!all.has(k0)) all.set(k0, where); }
    if (typeof s !== "string" || !RE.test(s)) return; const k = s.replace(/\s+/g, " ").trim().slice(0, 160); if (!seen.has(k)) seen.set(k, window.__stage + " | " + where); }
  function whereOf(n) { const p = n.nodeType === 1 ? n : n.parentElement; if (!p) return "?"; const a = []; for (let e = p, i = 0; e && e !== document.body && i < 4; e = e.parentElement, i++) a.push(e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className ? "." + e.className.split(/\s+/)[0] : "")); return a.join(" < "); }
  const ATTRS = ["title", "aria-label", "placeholder", "alt", "label"];
  function scan(n) {
    if (n.nodeType === 3) { const p = n.parentElement; if (p && /^(SCRIPT|STYLE|NOSCRIPT)$/.test(p.tagName)) return; note(n.nodeValue, whereOf(n)); return; }
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.tagName)) return;
    ATTRS.forEach(a => { if (n.hasAttribute(a)) note(n.getAttribute(a), whereOf(n) + " @" + a); });
    n.childNodes.forEach(scan);
  }
  function start() {
    scan(document.documentElement);
    new MutationObserver(list => list.forEach(r => { if (r.type === "characterData") scan(r.target); else if (r.type === "attributes") note(r.target.getAttribute(r.attributeName), whereOf(r.target) + " @" + r.attributeName); else r.addedNodes.forEach(scan); }))
      .observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.documentElement) start(); else document.addEventListener("readystatechange", start, { once: true });
  const P = CanvasRenderingContext2D.prototype;
  ["fillText", "strokeText"].forEach(m => { const f = P[m]; P[m] = function (t) { note(String(t), "canvas"); return f.apply(this, arguments); }; });
  window.__allText = () => Array.from(all.entries());
  window.__cjk = () => { document.querySelectorAll("input:not([type=password]), textarea").forEach(e => note(e.value, whereOf(e) + " .value")); return Array.from(seen.entries()); };
}
/** 允许留在英文页上的：去中文版的那个按钮 */
const ALLOW = [/^中文$/, /^切换到中文$/];
/** 被截掉的字：按钮、标签、表头这类单行的小东西，内容比盒子宽而盒子又不让溢出。返回 [文字, 位置] */
function clipped() {
  const out = [];
  document.querySelectorAll("button, .btn, .chip, .tag, .iconbtn, th, label, summary, select, .seg button, h2, h3").forEach(e => {
    if (!e.offsetParent || e.closest("[hidden]")) return;
    const cs = getComputedStyle(e); if (cs.overflowX === "visible" && cs.textOverflow !== "ellipsis") return;
    if (e.scrollWidth > e.clientWidth + 1 && !/^(SELECT)$/.test(e.tagName)) out.push([(e.innerText || "").trim().slice(0, 60), e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className ? "." + e.className.split(/\s+/).join(".") : "")]);
  });
  // 结果栏的每一格：里面的字不能伸出去压到旁边那一格
  document.querySelectorAll(".crit > div, .gscore, .statline, .sum-head, .card h3").forEach(e => { if (e.offsetParent && e.scrollWidth > e.clientWidth + 1) out.push([(e.innerText || "").trim().replace(/\s+/g, " ").slice(0, 60), "(overflows its cell by " + (e.scrollWidth - e.clientWidth) + "px) " + (typeof e.className === "string" && e.className ? "." + e.className.split(/\s+/).join(".") : e.tagName.toLowerCase())]); });
  // 弹层里的东西不能伸到弹层外面去（长的代码行应当在自己的框里滚动）
  document.querySelectorAll(".modal-box").forEach(box => { const br = box.getBoundingClientRect(); box.querySelectorAll("pre, textarea, table, .ai-row, input").forEach(e => { if (!e.offsetParent) return; for (let a = e.parentElement; a && a !== box; a = a.parentElement) if (getComputedStyle(a).overflowX !== "visible") return;   /* 外面有会滚动的框兜着，不算 */
      const r = e.getBoundingClientRect(); if (r.right > br.right + 1 || r.left < br.left - 1) out.push(["(spills out of its dialog by " + Math.round(r.right - br.right) + "px)", e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className ? "." + e.className.split(/\s+/).join(".") : "")]); }); });
  return out;
}
module.exports = { probe, ALLOW, clipped };
