// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 说明文字的渲染：一个很小的 Markdown 子集 + KaTeX 公式。
 * 先把代码和公式抽出来，再对其余文字做 HTML 转义，所以模型输出里的任何标签都不会被执行。 */
var QLMD = (function () {
  "use strict";
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function inline(s) {
    s = s.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, "$1<em>$2</em>");
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return s;
  }
  function render(src) {
    src = String(src == null ? "" : src).replace(/\r\n?/g, "\n");
    var store = [];
    function keep(html) { store.push(html); return "\u0001" + (store.length - 1) + "\u0002"; }
    // 1) 代码块与行内代码
    src = src.replace(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g, function (_, c) { return "\n\n" + keep('<pre><code>' + esc(c.replace(/\n$/, "")) + "</code></pre>") + "\n\n"; });
    src = src.replace(/`([^`\n]+)`/g, function (_, c) { return keep("<code>" + esc(c) + "</code>"); });
    // 2) 公式
    function tex(body, display) { return keep('<span class="tex" data-display="' + (display ? 1 : 0) + '" data-tex="' + esc(body) + '">' + esc(display ? "$$" + body + "$$" : "$" + body + "$") + "</span>"); }
    src = src.replace(/\$\$([\s\S]+?)\$\$/g, function (_, b) { return tex(b.trim(), true); });
    src = src.replace(/\\\[([\s\S]+?)\\\]/g, function (_, b) { return tex(b.trim(), true); });
    src = src.replace(/\\\(([\s\S]+?)\\\)/g, function (_, b) { return tex(b.trim(), false); });
    src = src.replace(/(^|[^\\$])\$(?!\s)([^$\n]+?)\$(?!\d)/g, function (_, pre, b) { return pre + tex(b, false); });
    // 2.5) 现算的数字：⟪名字⟫ 或 ⟪名字|格式⟫。先放一个占位，数由 onMount 挂上来的那一方去填（app-live.js）
    src = src.replace(/\u27ea([^\u27eb\n]{1,80})\u27eb/g, function (_, b) { return keep('<span class="lv" data-live="' + esc(b) + '">\u2026</span>'); });
    // 3) 其余文字转义后按块解析
    var lines = esc(src).split("\n"), out = [], para = [], list = null, i;
    function flushP() { if (para.length) { out.push("<p>" + inline(para.join("<br>")) + "</p>"); para = []; } }
    function flushL() { if (list) { out.push("<" + list.tag + ">" + list.items.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</" + list.tag + ">"); list = null; } }
    for (i = 0; i < lines.length; i++) {
      var ln = lines[i], m;
      if (!ln.trim()) { flushP(); flushL(); continue; }
      if ((m = /^\s*(#{1,4})\s+(.*)$/.exec(ln))) { flushP(); flushL(); out.push("<h" + Math.min(4, m[1].length + 1) + ">" + inline(m[2]) + "</h" + Math.min(4, m[1].length + 1) + ">"); continue; }
      if ((m = /^\s*[-*•]\s+(.*)$/.exec(ln))) { flushP(); if (!list || list.tag !== "ul") { flushL(); list = { tag: "ul", items: [] }; } list.items.push(m[1]); continue; }
      if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(ln))) { flushP(); if (!list || list.tag !== "ol") { flushL(); list = { tag: "ol", items: [] }; } list.items.push(m[1]); continue; }
      if (/^\s*\|.*\|\s*$/.test(ln)) { // 表格
        flushP(); flushL(); var rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim(); })); i++; }
        i--; var head = rows.length > 1 && rows[1].every(function (c) { return /^:?-{2,}:?$/.test(c); });
        var h = "<table>"; rows.forEach(function (r, k) { if (head && k === 1) return; h += "<tr>" + r.map(function (c) { return (head && k === 0 ? "<th>" : "<td>") + inline(c) + (head && k === 0 ? "</th>" : "</td>"); }).join("") + "</tr>"; });
        out.push(h + "</table>"); continue;
      }
      if (list && /^\s{2,}\S/.test(ln)) { list.items[list.items.length - 1] += " " + ln.trim(); continue; }
      flushL(); para.push(ln.trim());
    }
    flushP(); flushL();
    var html = out.join("\n");
    // 独占一段的展示公式不要包在 <p> 里
    html = html.replace(/<p>(\u0001\d+\u0002)<\/p>/g, "$1");
    for (var pass = 0; pass < 3; pass++) html = html.replace(/\u0001(\d+)\u0002/g, function (_, k) { return store[+k]; });
    return html;
  }
  /** 行内公式后面紧跟着的句读（，。；）之类）不能掉到下一行的开头，前面紧贴着的开括号也不能留在上一行的末尾。
   *  浏览器在公式这种"整块"的前后总是允许换行，所以把这个标点挪进公式最后（最前）那一个不可拆的小块里。 */
  var CLOSERS = "，。；：、！？）】」』》”’", OPENERS = "（【「『《“‘";
  function glue(el) {
    var bases = el.querySelectorAll(".katex-html > .base"); if (!bases.length) return;
    var nx = el.nextSibling, n = 0;
    if (nx && nx.nodeType === 3) { while (n < 2 && n < nx.nodeValue.length && CLOSERS.indexOf(nx.nodeValue.charAt(n)) >= 0) n++; }
    if (n) { var sp = document.createElement("span"); sp.className = "tex-punct"; sp.textContent = nx.nodeValue.slice(0, n); bases[bases.length - 1].appendChild(sp); nx.nodeValue = nx.nodeValue.slice(n); }
    var pv = el.previousSibling;
    if (pv && pv.nodeType === 3 && pv.nodeValue.length && OPENERS.indexOf(pv.nodeValue.charAt(pv.nodeValue.length - 1)) >= 0) {
      var sp2 = document.createElement("span"); sp2.className = "tex-punct"; sp2.textContent = pv.nodeValue.slice(-1); bases[0].insertBefore(sp2, bases[0].firstChild); pv.nodeValue = pv.nodeValue.slice(0, -1);
    }
  }
  function typeset(root) {
    if (!window.katex) return false;
    var nodes = (root || document).querySelectorAll(".tex:not(.done)");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      try { window.katex.render(el.getAttribute("data-tex"), el, { displayMode: el.getAttribute("data-display") === "1", throwOnError: false, strict: "ignore", trust: false, output: "html" }); el.classList.add("done"); }
      catch (e) { el.classList.add("done"); }
      if (el.getAttribute("data-display") !== "1") { try { glue(el); } catch (e2) {} }
    }
    return true;
  }
  function mount(el, src) { el.classList.add("md"); el.innerHTML = render(src); typeset(el); if (api.onMount) { try { api.onMount(el); } catch (e) { console.error(e); } } }
  /** 流式输出时：已完整的段落按 Markdown 渲染，最后半截按纯文字显示 */
  function mountPartial(el, src) {
    var cut = src.lastIndexOf("\n\n"), head = cut > 0 ? src.slice(0, cut) : "", tail = cut > 0 ? src.slice(cut + 2) : src;
    if ((head.match(/\$\$/g) || []).length % 2 === 1) { tail = src; head = ""; }
    el.classList.add("md"); el.innerHTML = (head ? render(head) : "") + '<p class="partial"></p>';
    el.lastChild.textContent = tail; typeset(el);
  }
  window.addEventListener("load", function () { typeset(document); });
  var api = { render: render, mount: mount, mountPartial: mountPartial, typeset: typeset, esc: esc, onMount: null };
  return api;
})();
