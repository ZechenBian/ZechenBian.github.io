// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 机器学习实验室 · 界面主体（二）：中栏的几种看法——图表、排行榜、模型内部、动画回放、数据；
 * 以及排行榜的存档与检验、测试集的揭晓、代码编辑器、导入 CSV、手册。 */
(function (A) {
  "use strict";
  var h = A.h, $ = A.$, clear = A.clear, S = A.S, V = QLMLViz, QL = A.QL, ST = QL.mlstats, F = A.F, G = A.G, P = A.P;
  var charts = [];   // 当前画着的图（换视图时销毁，免得 ResizeObserver 留着）
  function card(title, opt) {
    opt = opt || {};
    var b = h("div", { class: "card-b" }), c = h("div", { class: "card" + (opt.wide ? " wide" : ""), id: opt.id || null },
      h("div", { class: "card-h" }, h("h3", { text: title }), opt.head || null, opt.help ? A.helpBtn(opt.help, title) : null), opt.ctl ? h("div", { class: "card-c" }, opt.ctl) : null, b, opt.foot ? h("div", { class: "card-f" }, opt.foot) : null);
    $("grid").appendChild(c);
    return { el: c, body: b };
  }
  function keep(x) { if (x) charts.push(x); return x; }
  function wipe() { charts.forEach(function (c) { try { if (c.destroy) c.destroy(); else if (c.ro) c.ro.disconnect(); } catch (e) {} }); charts = []; clear($("grid")); }

  /* ---------- 视图切换 ---------- */
  var VIEWS = [["charts", "图表"], ["board", "排行榜"], ["inside", "模型内部"], ["anim", "动画"], ["data", "数据"]];
  A.setView = function (v) { S.view = v; A.persist(); A.renderViews(); };
  A.renderViews = function () {
    var nav = clear($("views")), nRuns = A.expRuns ? A.expRuns().length : 0;
    VIEWS.forEach(function (x) { nav.appendChild(h("button", { class: "chip", type: "button", role: "tab", "data-v": x[0], "aria-pressed": S.view === x[0] ? "true" : "false", onclick: function () { A.setView(x[0]); } }, x[1], x[0] === "board" && nRuns ? h("span", { class: "n", text: String(nRuns) }) : null)); });
    wipe();
    var L = A.last && !A.stale() ? A.last : null;
    try { draw(L); }
    catch (e) { console.error(e); var ce = card("这一栏没有画完", { wide: true }); ce.body.appendChild(h("p", { class: "warn err", text: "画图时出错了：" + String(e && e.message || e) + "。换一栏看看，或者重新运行。" })); }
  };
  function draw(L) {
    if (S.view === "data") return dataView();
    if (S.view === "board") return boardView();
    if (S.view === "anim") return animView(L);     // 模拟和教学动画不需要先运行
    if (!L) { var c = card("还没有结果", { wide: true }); c.body.appendChild(h("p", { class: "ml-note", text: A.last ? "设定改过了：上面显示的是上一次的结果。点“运行”用现在的设定再跑一次。" : "运行一次以后，这里会出现对应的图。先看看“数据”这一栏，了解这个数据集长什么样。" })); return; }
    if (S.view === "charts") return chartsView(L);
    if (S.view === "inside") return insideView(L);
    if (S.view === "anim") return animView(L);
  };

  /* ---------- 图表 ---------- */
  function which(L) { return L.revealed && S.showTest ? "test" : "valid"; }
  function setCtl(L) {
    if (!L.revealed) return null;
    var sel = h("select", { "aria-label": "看哪一份数据", onchange: function () { S.showTest = sel.value === "test"; A.renderViews(); } }, h("option", { value: "valid", text: "验证集", selected: !S.showTest }), h("option", { value: "test", text: "测试集", selected: !!S.showTest }));
    return h("label", null, "数据：", sel);
  }
  function chartsView(L) {
    var res = L.res, w = which(L), pv = res.data || A.preview || {}, cls = res.kind === "classification";
    var stepCurve = !L.algo.curveX || /步|轮|迭代|epoch/i.test(L.algo.curveX);
    var c = card(stepCurve ? "学习曲线" : "训练过程的记录", { head: A.originBadge(L.def, true), help: "chart:curve", wide: !(res.snaps && res.snaps.length), foot: stepCurve ? "实线是训练集，虚线是验证集。验证损失先降后升，就是开始过拟合的地方。" : "横轴是“" + L.algo.curveX + "”：算法在训练时逐个汇报的量。" }); keep(V.curve(c.body, res, { xLabel: L.algo.curveX }));
    var last = res.snaps && res.snaps.length ? res.snaps[res.snaps.length - 1] : null;
    if (last && last.kind === "grid2d") { c = card(cls ? "决策面" : "学到的函数（二维）", { help: "chart:surface", foot: cls ? "底色是模型在每个位置判的类别，越深越有把握；点是训练样本。细线是决策边界。" : "底色是模型的预测值；点是训练样本（颜色是真实的 y）。" }); keep(V.surface(c.body, last, pv)); }
    if (last && last.kind === "fn1d") { c = card("学到的函数", { help: "chart:fn1d", foot: pv.xy && pv.xy.truth ? "虚线是真函数（数据集的理论最优）；灰点是数据。" : "" }); keep(V.fn1d(c.body, last, pv, pv.xy && pv.xy.truth)); }
    if (res.kind === "forecast") {
      var hSel = Math.min(res.horizon || 1, S.hShow || 1);
      var ctl = res.horizon > 1 ? h("label", null, "第 ", h("input", { type: "number", min: 1, max: res.horizon, value: hSel, onchange: function (e) { S.hShow = Math.max(1, Math.min(res.horizon, +e.target.value || 1)); A.renderViews(); } }), " 步的预测") : null;
      c = card("预测对实际", { wide: true, help: "chart:forecast", ctl: ctl }); keep(V.forecastPlot(c.body, res, pv, L.revealed, hSel));
      if (res.horizon > 1) { c = card("误差随预测步长", { help: "chart:errh" }); keep(V.errByH(c.body, res, w)); }
      c = card("残差的分布", { ctl: setCtl(L), help: "chart:resid" }); keep(V.residuals(c.body, res.pred[w], res.truth[w]));
    } else if (cls) {
      var names = pv.classes || null;
      c = card("混淆矩阵", { help: "chart:confusion", ctl: setCtl(L), foot: "每一行是一个真实类别，格子里是它被判成各类的比例；对角线越深越好。" }); keep(V.confusion(c.body, res.pred[w], res.truth[w], res.k, names));
      if (res.k > 2) { c = card("每一类的准确率", { help: "chart:perclass" }); keep(V.perClass(c.body, res.pred[w], res.truth[w], res.k, names)); }
      if (res.k === 2) { var pp = probPos(res.pred[w]), roc = ST.roc(pp, res.truth[w]); c = card("ROC 曲线", { help: "chart:roc" }); keep(V.rocChart(c.body, roc)); }
      var cal = ST.calibration(res.k === 2 ? probPos(res.pred[w]) : res.pred[w], res.truth[w], 10);
      c = card("校准曲线", { help: "chart:calibration", foot: res.k === 2 ? "模型说“是类别 1 的概率为 80%”的那些样本里，实际有多少是类别 1。点在对角线上就是校准得好。" : "模型最有把握的那一类概率为 80% 的那些样本里，实际判对了多少。点在对角线上就是校准得好。" }); keep(V.calibrationChart(c.body, cal));
    } else {
      c = card("预测对实际", { help: "chart:predactual", ctl: setCtl(L) }); keep(V.predActual(c.body, res.pred[w], res.truth[w], { name: w === "test" ? "测试集" : "验证集" }));
      c = card("残差的分布", { help: "chart:resid" }); keep(V.residuals(c.body, res.pred[w], res.truth[w]));
    }
    // 和基线、理论最优比
    var pk = res.primary, rows = [{ name: L.algo.name, train: res.metrics.train[pk], valid: res.metrics.valid[pk], test: L.revealed ? res.metrics.test[pk] : null, color: "s1" }, { name: "基线", train: null, valid: res.baseline.metrics.valid[pk], test: L.revealed ? res.baseline.metrics.test[pk] : null, color: "neutral" }];
    if (res.oracle && res.oracle.metrics) rows.push({ name: "理论最优", train: null, valid: res.oracle.metrics.valid[pk], test: L.revealed ? res.oracle.metrics.test[pk] : null, color: "s3" });
    c = card("和基线、理论最优比", { help: "chart:compare", foot: L.revealed ? "" : "测试集还没有揭晓。" }); keep(V.compareBars(c.body, rows, A.metName(pk), res.higherBetter, function (v) { return A.metFmt(pk, v); }));
    if (res.importance) { c = card("特征重要性（置换）", { help: "chart:importance", foot: "把验证集里某一列随机打乱、其余不动，看成绩变差多少。误差棒是三次打乱的标准误。" }); keep(V.importanceBars(c.body, res.importance)); }
    if (res.log && res.log.length) { c = card("算法的日志"); c.body.appendChild(h("pre", { class: "code", text: res.log.join("\n") })); }
  }
  function probPos(P2) { var n = P2.length / 2, o = new Float64Array(n); for (var i = 0; i < n; i++) o[i] = P2[2 * i + 1]; return o; }

  /* ---------- 模型内部 ---------- */
  function insideView(L) {
    var res = L.res, ins = res.internals || {}, pv = res.data || A.preview || {}, meta = pv.meta || {}, any = false, c;
    if (ins.coef && ins.coef.length) { any = true; c = card("系数", { help: "inside:coef" }); keep(V.coefBars(c.body, ins.coef)); }
    (ins.layers || []).forEach(function (l, i) { any = true; c = card("权重：" + (l.name || "第 " + (i + 1) + " 层") + "（" + l.rows + " × " + l.cols + "）", { help: "inside:weights" }); keep(V.weights(c.body, l)); });
    if (ins.embedding && ins.embedding.data) {
      any = true; var E = ins.embedding, n = E.rows;
      var color = meta.p ? function (t) { return t / Math.max(1, n - 1); } : null;
      c = card("嵌入的主成分（前两个）", { help: "inside:pca", foot: "每个点是词表里的一个元素（模加法里是 0 … p−1）。颜色按编号由浅到深。" }); keep(V.embedPCA(c.body, E, E.labels || Array.from({ length: n }, function (_, i) { return i; }), color));
      if (QL.mltoy && meta.p && A.ds().id === "modadd") { var fr = safe(function () { return QL.mltoy.fourier(E, meta); }); if (fr) { c = card("嵌入的傅里叶谱", { help: "inside:fourier", foot: "把嵌入的每一列看成 ℤ/p 上的函数做离散傅里叶变换：grokking 之后能量集中在少数几个频率上（Nanda 等 2023）。最大的几个频率：" + (fr.top || []).slice(0, 6).join("、") + "。" }); keep(V.spectrum(c.body, fr)); } }
      if (QL.mltoy && meta.irreps && A.ds().id === "group") { var fve = safe(function () { return QL.mltoy.irrepFVE(E, meta); }); if (fve) { c = card("嵌入按不可约表示分解", { help: "inside:irreps", foot: "嵌入矩阵的每一列是群上的函数，按同型分量做正交投影后的方差占比；灰色是随机嵌入的期望值 dim(M_ρ)/(|G|−1)。" }); keep(V.irrepBars(c.body, fve)); } }
    }
    if (A.ds().id === "ising" && QL.mltoy && meta.T && res.kind === "classification" && res.k === 2) { any = true; isingCard(res, meta, L); }
    (ins.activations || []).forEach(function (a) { any = true; c = card("激活值的分布：" + a.name, { help: "inside:act" }); keep(V.histogram(c.body, a.data, { xLabel: "激活值" })); });
    if (ins.tree && ins.tree.nodes) { any = true; c = card("树的结构（前几层）", { help: "inside:tree" }); c.body.appendChild(h("pre", { class: "code", text: treeText(ins.tree.nodes, pv.featureNames, pv.classes) })); }
    if (ins.text) { any = true; c = card("模型的说明"); c.body.appendChild(h("pre", { class: "code", text: ins.text })); }
    if (res.importance) { any = true; c = card("特征重要性（置换）", { help: "chart:importance" }); keep(V.importanceBars(c.body, res.importance)); }
    if (!any) { c = card("这个模型没有交出内部的东西", { wide: true }); c.body.appendChild(h("p", { class: "ml-note", text: "算法的代码里定义 inspect(model) 并返回 layers（权重矩阵）、embedding（嵌入）、coef（系数）、tree（树）或 text，这里就会画出来。内置的神经网络、线性模型和树模型都定义了它。" })); }
  }
  function safe(f) { try { return f(); } catch (e) { console.warn(e); return null; } }
  function rowsOf(E) { var out = []; for (var i = 0; i < E.rows; i++) out.push(Array.prototype.slice.call(E.data, i * E.cols, (i + 1) * E.cols)); return out; }
  function treeText(nodes, names, classes) {
    var lines = [];
    function walk(i, depth) {
      var nd = nodes[i]; if (!nd || depth > 5 || lines.length > 80) return;
      var pad = new Array(depth + 1).join("│  ");
      if (nd.f < 0 || nd.left < 0) { var v = Array.isArray(nd.value) ? (classes ? classes[nd.value.indexOf(Math.max.apply(null, nd.value))] + "（" + nd.value.map(function (x) { return F(x, 2); }).join(", ") + "）" : nd.value.map(function (x) { return F(x, 2); }).join(", ")) : G(nd.value); lines.push(pad + "→ " + v + (nd.n ? "  [" + nd.n + " 个样本]" : "")); return; }
      lines.push(pad + ((names && names[nd.f]) || "x" + (nd.f + 1)) + " ≤ " + G(nd.thr) + (nd.n ? "  [" + nd.n + "]" : ""));
      walk(nd.left, depth + 1); lines.push(pad + "否则"); walk(nd.right, depth + 1);
    }
    walk(0, 0); return lines.join("\n");
  }
  function isingCard(res, meta, L) {
    // "远离 T_c"方案：训练集和验证集只有远离 T_c 的温度，中间温度全在测试集里，交叉温度只能在测试集上读
    var far = A.dsParams().protocol === "far", w = far ? "test" : "valid";
    if (far && !(L.revealed || (A.isRevealed && A.isRevealed(L)))) { var c0 = card("网络读出的“临界温度”", { help: "inside:ising" }); c0.body.appendChild(h("p", { class: "ml-note", text: "“远离 T_c”方案下，中间的温度全在测试集里。揭晓测试集以后，这里画出网络在每个温度上判“有序”的平均概率和它穿过 1/2 的温度 T*。" })); return; }
    var idx = res.index[w], pr = res.pred[w], k = res.k, i;
    var probs = new Float64Array(idx.length), Ts = new Float64Array(idx.length); for (i = 0; i < idx.length; i++) { probs[i] = pr[i * k + 1]; Ts[i] = meta.T[idx[i]]; }
    var cross = QL.mltoy.isingCrossover(probs, Ts), xs = cross.temps, ys = cross.mean;
    var c = card("网络读出的“临界温度”", { help: "inside:ising", foot: "每个温度上，网络判“有序”的平均概率（" + (w === "test" ? "测试集" : "验证集") + "）。它穿过 1/2 的温度 T* = " + (cross.Tstar === cross.Tstar ? F(cross.Tstar, 3) : "—") + "；精确的 T_c = " + F(meta.Tc, 4) + "。T* 不一定是 T_c：固定阈值的读法在 L → ∞ 时收敛到 Yang 温度（低于 T_c），标签本身又用了 T_c。细节见手册和数据集的说明。" });
    var ch = V.chart(c.body, 240); keep(ch);
    var layers = [{ kind: "hline", y: 0.5, color: "muted", width: 1, dash: [4, 3] }, { kind: "vline", x: meta.Tc, color: "s3", width: 1.5, label: "Tc" }, { kind: "line", x: xs, y: ys, color: "s1", width: 2 }, { kind: "points", x: xs, y: ys, color: "s1", r: 3 }];
    if (cross.Tstar === cross.Tstar) layers.push({ kind: "vline", x: cross.Tstar, color: "s2", width: 1.5, dash: [5, 3], label: "T*" });
    ch.set({ x: { label: "温度 T" }, panels: [{ y: { label: "判为有序的平均概率", fmt: function (v) { return P(v, 0); } }, layers: layers }] });
  }
  /* ---------- 动画：训练过程的快照回放 ---------- */
  var playT = 0;
  function animView(L) {
    var res = L ? L.res : null, snaps = res && res.snaps || [], pv = res && res.data || A.preview || {};
    if (!L) { var cz = card("训练过程回放", { wide: true }); cz.body.appendChild(h("p", { class: "ml-note", text: A.last ? "设定改过了：运行一次以后，这里回放这一次训练的过程。下面是数据集的模拟和几个教学动画。" : "运行一次以后，这里回放训练的过程（决策面、学到的函数或嵌入怎样一步步变化）。下面是数据集的模拟和几个教学动画，不用运行也能看。" })); if (A.renderSim) A.renderSim(card, keep); return; }
    if (A.renderSim) A.renderSim(card, keep);    // 数据集自带的模拟和教学动画（src/ml/anim.js）
    if (!snaps.length) { var c0 = card("训练过程回放", { wide: true }); c0.body.appendChild(h("p", { class: "ml-note", text: "这个算法训练时没有拍快照（代码里没有调用 ctx.snapshot），或者这类数据没有能画的快照。二维的数据画决策面，一维的回归画学到的曲线，玩具任务画嵌入的主成分。内置的神经网络都会拍。" })); return; }
    var i = snaps.length - 1, c = card("训练过程回放（" + snaps.length + " 张快照）", { wide: true, help: "anim:replay" }), stage = h("div", { class: "ml-two" }), left = h("div"), right = h("div");
    stage.appendChild(left); stage.appendChild(right); c.body.appendChild(stage);
    var slider = h("input", { type: "range", min: 0, max: snaps.length - 1, step: 1, value: i, "aria-label": "第几张快照" }), lab = h("span", { class: "lab" }), btn = h("button", { class: "btn small", type: "button", text: "▶ 播放" });
    c.body.appendChild(h("div", { class: "ml-player" }, btn, slider, lab));
    var cvBox = null, curveCh = null, specBox = null;
    function draw() {
      var s = snaps[i]; lab.textContent = "第 " + G(s.step) + " 步（" + (i + 1) + " / " + snaps.length + "）";
      if (s.kind === "grid2d") { if (!cvBox) cvBox = keep(V.surface(left, s, pv, { caption: "第 " + G(s.step) + " 步" })); else cvBox.set(function (ctx, w, hh) { V.drawSurface(ctx, w, hh, s, pv.scatter ? pv.scatter.pts : null, { caption: "第 " + G(s.step) + " 步" }); }); }
      else if (s.kind === "fn1d") { if (cvBox && cvBox.destroy) { try { cvBox.destroy(); } catch (e) {} } clear(left); charts = charts.filter(function (x) { return x !== cvBox; }); cvBox = keep(V.fn1d(left, s, pv, pv.xy && pv.xy.truth)); }
      else if (s.kind === "embed") {
        clear(left); cvBox = keep(V.embedPCA(left, s.data, null, function (t) { return t / Math.max(1, s.data.rows - 1); }));
        var meta = pv.meta || {}; if (QL.mltoy && meta.p && A.ds().id === "modadd") { var sp1 = safe(function () { return QL.mltoy.fourier(s.data, meta); }); if (specBox) { try { specBox.destroy(); } catch (e) {} } clear(right); if (sp1) specBox = keep(V.spectrum(right, sp1)); }
      }
      if (s.kind !== "embed") { if (curveCh) { try { curveCh.destroy(); } catch (e) {} } clear(right); curveCh = keep(V.curve(right, res, { mark: s.step, xLabel: L.algo.curveX })); }
    }
    slider.addEventListener("input", function () { i = +slider.value; stopPlay(); draw(); });
    function stopPlay() { clearInterval(playT); playT = 0; btn.textContent = "▶ 播放"; }
    btn.addEventListener("click", function () {
      if (playT) { stopPlay(); return; }
      if (i >= snaps.length - 1) i = 0;
      btn.textContent = "❚❚ 暂停";
      playT = setInterval(function () { if (!document.body.contains(slider)) { stopPlay(); return; } i++; if (i >= snaps.length) { i = snaps.length - 1; stopPlay(); } slider.value = i; draw(); }, 260);
    });
    draw();
  }

  /* ---------- 数据 ---------- */
  function dataView() {
    var d = A.ds(), pv = A.preview, c;
    if (!d) return;
    if (!pv) { c = card("数据", { wide: true }); c.body.appendChild(h("p", { class: "ml-note", text: A.dataErr ? "数据没有生成出来：" + A.dataErr : "正在生成数据…" })); return; }
    var og = A.dsOrigin(d), ob = card(og.label + "：" + d.name, { wide: true, help: "ds:" + d.id, head: A.originBadge(d, true) });
    ob.el.classList.add("ml-origin-card", og.k);
    ob.body.appendChild(h("p", { class: "ml-note", text: og.note }));
    if (A.renderSim) A.renderSim(card, keep, true);
    var foot = "共 " + pv.n + " 个样本" + (pv.d ? "，每个 " + pv.d + " 个特征" : "") + (pv.classes ? "，" + pv.classes.length + " 类" : "") + "。";
    if (pv.series) { c = card("序列", { wide: true, foot: "共 " + pv.series.T + " 个时刻；浅色底是验证段和测试段。" }); keep(V.series(c.body, pv)); }
    else if (pv.scatter) { c = card("散点图（训练集）", { foot: foot }); keep(V.scatter2d(c.body, pv)); }
    else if (pv.xy) { c = card("散点图", { foot: foot }); var ch = V.chart(c.body, 240); keep(ch); var px = [], py = []; for (var i = 0; i < pv.xy.pts.length / 2; i++) { px.push(pv.xy.pts[2 * i]); py.push(pv.xy.pts[2 * i + 1]); } ch.set({ x: { label: "x" }, panels: [{ y: { label: "y" }, layers: [{ kind: "points", x: px, y: py, color: "s1", r: 2.2, alpha: 0.6, ring: false }] }] }); }
    else if (pv.images) { c = card("样本（随机的一部分）", { wide: true, foot: foot }); keep(V.images(c.body, pv)); }
    if (pv.meta && pv.meta.table && pv.meta.order && pv.meta.order <= 120) { c = card("乘法表", { foot: "第 a 行第 b 列是 ab 的编号（颜色）。" }); keep(V.cayley(c.body, pv.meta.table, pv.meta.order, null)); }
    if (pv.classCounts) { c = card("各类的样本数"); var chc = V.chart(c.body, 200), k = pv.classCounts.length, x0 = [], x1 = [], y = [], xm = []; for (var j = 0; j < k; j++) { x0.push(j - 0.4); x1.push(j + 0.4); y.push(pv.classCounts[j]); xm.push(j); } keep(chc); chc.set({ x: { label: "", domain: [-0.6, k - 0.4], ticks: k <= 20 ? xm : null, fmt: function (v) { var q = Math.round(v); return k <= 12 && pv.classes ? String(pv.classes[q]) : String(q); } }, panels: [{ y: { label: "样本数", zero: true }, layers: [{ kind: "bars", x0: x0, x1: x1, y: y, color: "s1", maxW: 56 }] }] }); }
    if (pv.featureNames && !pv.images && !pv.series) { c = card("特征"); c.body.appendChild(h("p", { class: "ml-note", text: pv.featureNames.join("、") })); }
    c = card("这个数据集的说明", { wide: true, help: "ds:" + d.id, head: A.originBadge(d, true) });
    var md = h("div"); c.body.appendChild(md); QLMD.mount(md, d.docs || d.summary || "");
    if (d.source) c.body.appendChild(h("p", { class: "ml-src" }, "来源：" + d.source.name + (d.source.license ? "，许可：" + d.source.license : "") + (d.source.cite ? "。" + d.source.cite : "")));
  }

  /* ---------- 排行榜：存档 ---------- */
  // 一个实验 = 同一个数据集、同样的参数和种子、同样的划分（A.expKey）。存在 localStorage 里；两个标签页同时开着时，存之前先把另一边存的合并进来
  var RKEY = "ql.ml.runs.v1", MAXRUN = 40, MAXCH = 2400000;   // 整份存档最多约 240 万个字符（和本站的其他页面共用浏览器给的空间）
  function loadRB() { try { var o = JSON.parse(localStorage.getItem(RKEY) || "null"); if (o && o.v === 1 && o.exps) return o; } catch (e) {} return { v: 1, exps: {} }; }
  var RB = loadRB();
  /** 两份实验记录合并：运行按编号取并集（删掉的编号记在 gone 里，不会被另一边"复活"），看测试集的次数取大的 */
  function mergeExp(a, b) {
    if (!a) return b; if (!b) return a;
    if (a.truth && b.truth && a.truth !== b.truth) return (a.t || 0) >= (b.t || 0) ? a : b;
    var gone = {}; (a.gone || []).concat(b.gone || []).forEach(function (x) { gone[x] = 1; });
    var byId = {}, runs = [];
    a.runs.concat(b.runs).forEach(function (r) { if (gone[r.id]) return; var o = byId[r.id]; if (!o) { byId[r.id] = r; runs.push(r); } else if (r.looked) o.looked = true; });
    runs.sort(function (x, y) { return x.t - y.t; });
    var top = (a.t || 0) >= (b.t || 0) ? a : b, out = Object.assign({}, top);
    out.runs = runs.slice(-MAXRUN); out.looks = Math.max(a.looks || 0, b.looks || 0); out.gone = Object.keys(gone).slice(-300); out.t = Math.max(a.t || 0, b.t || 0);
    return out;
  }
  /** 太大时先丢最旧的运行的逐样本损失（这几行就不再做配对检验），还不够再丢最旧的实验（只留下看测试集的次数） */
  function shrink(o, limit) {
    var json = JSON.stringify(o); if (json.length <= limit) return json;
    var all = []; Object.keys(o.exps).forEach(function (k) { o.exps[k].runs.forEach(function (r) { if (r.lV || r.cV) all.push(r); }); });
    all.sort(function (x, y) { return x.t - y.t; });
    for (var i = 0; i < all.length && json.length > limit; i++) { var r = all[i]; r.lV = r.lT = r.cV = r.cT = null; r.stripped = true; if (i % 5 === 4) json = JSON.stringify(o); }
    json = JSON.stringify(o);
    var ks = Object.keys(o.exps).sort(function (x, y) { return (o.exps[x].t || 0) - (o.exps[y].t || 0); });
    for (var j = 0; j < ks.length - 1 && json.length > limit; j++) { var E = o.exps[ks[j]]; o.exps[ks[j]] = { name: E.name, ds: E.ds, kind: E.kind, primary: E.primary, hb: E.hb, looks: E.looks || 0, runs: [], gone: (E.gone || []).concat(E.runs.map(function (r) { return r.id; })).slice(-300), t: E.t, truth: E.truth, stub: true }; json = JSON.stringify(o); }
    return json;
  }
  function saveRuns() {
    var disk = loadRB();
    Object.keys(disk.exps).forEach(function (k) { RB.exps[k] = mergeExp(RB.exps[k], disk.exps[k]); });
    var limit = MAXCH;
    for (var tries = 0; tries < 4; tries++) {
      try { localStorage.setItem(RKEY, shrink(RB, limit)); return true; }
      catch (e) { limit = Math.floor(limit / 2); }
    }
    A.toast("浏览器的存储空间不够了：排行榜这一次没有存下来（刷新页面以后会丢）。", 4200);
    return false;
  }
  if (window.addEventListener) window.addEventListener("storage", function (e) { if (e.key === RKEY) { var disk = loadRB(); Object.keys(disk.exps).forEach(function (k) { RB.exps[k] = mergeExp(RB.exps[k], disk.exps[k]); }); if (S.view === "board") A.renderViews(); } });
  var MAXN = 6000;    // 逐样本的损失最多存这么多（取前 MAXN 个，配对检验在同一批样本上做）
  function enc(arr, kind) { if (!arr) return null; var n = Math.min(arr.length, MAXN), ta = kind === "u8" ? Uint8Array.from(arr.subarray ? arr.subarray(0, n) : arr.slice(0, n)) : Float32Array.from(arr.subarray ? arr.subarray(0, n) : arr.slice(0, n)), u = new Uint8Array(ta.buffer), s = ""; for (var i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return { k: kind || "f4", b: btoa(s) }; }
  function dec(o) { if (!o) return null; var s = atob(o.b), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return o.k === "u8" ? u : new Float32Array(u.buffer); }
  /** 这批验证 / 测试样本的指纹：同一个"实验键"下数据其实变了（换了导入的文件、数据集的代码升级了）时，旧记录不能拿来配对 */
  function truthHash(res) { var t = res.truth.valid, u = res.truth.test, s = res.kind + "|" + t.length + "|" + u.length + "|", i; for (i = 0; i < Math.min(t.length, 3000); i++) s += (+t[i]).toPrecision(6) + ","; for (i = 0; i < Math.min(u.length, 500); i++) s += (+u[i]).toPrecision(6) + ","; return A.hashStr(s); }
  A.expRuns = function () { var E = RB.exps[A.expKey()]; return E ? E.runs : []; };
  A.expOf = function (key) { return RB.exps[key || A.expKey()] || null; };
  var vsCache = {};
  /** 一次运行结束：记进这个实验的排行榜。返回这条记录的编号 */
  A.record = function (L) {
    var res = L.res, key = L.key, E = RB.exps[key], th = truthHash(res);
    if (E && (E.truth && E.truth !== th || E.kind !== res.kind || E.primary !== res.primary)) E = null;   // 数据变了：另起一个实验
    if (!E || E.stub && !E.runs.length && E.truth !== th) E = RB.exps[key] = { name: L.def.name, ds: L.def.id, kind: res.kind, primary: res.primary, hb: res.higherBetter, looks: E && E.truth === th ? E.looks || 0 : 0, runs: [], gone: [], t: Date.now(), truth: th };
    E.t = Date.now(); E.truth = th; E.stub = false; E.nValid = res.split.nValid; E.nTest = res.split.nTest;
    E.base = { name: res.baseline.name, mV: res.baseline.metrics.valid, mT: res.baseline.metrics.test, lV: enc(res.baseline.loss.valid), lT: enc(res.baseline.loss.test), cV: res.baseline.correct ? enc(res.baseline.correct.valid, "u8") : null, cT: res.baseline.correct ? enc(res.baseline.correct.test, "u8") : null, stamp: Date.now() };
    E.oracle = res.oracle && res.oracle.metrics ? { mV: res.oracle.metrics.valid, mT: res.oracle.metrics.test } : null;
    var id = "r" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    var a = L.algo, rec = { id: id, t: Date.now(), name: a.name, algoId: a.id, src: a.src || "builtin", lang: a.lang || "js", params: Object.assign({}, L.params), spec: a.src === "builtin" || a.src === "py" ? null : a.params || [], code: a.src === "builtin" || a.src === "py" ? null : a.code, codeHash: A.hashStr(a.code || ""),
      m: res.metrics, looked: false, lV: enc(res.loss.valid), lT: enc(res.loss.test), cV: res.correct ? enc(res.correct.valid, "u8") : null, cT: res.correct ? enc(res.correct.test, "u8") : null, size: res.size, fitMs: res.fitMs, ms: res.ms, H: res.horizon || 1 };
    E.runs.push(rec);
    if (E.runs.length > MAXRUN) { E.runs.splice(0, E.runs.length - MAXRUN).forEach(function (r) { E.gone.push(r.id); }); }
    saveRuns();
    try { A.renderViews(); } catch (e) { console.error(e); }
    return id;
  };
  A.isRevealed = function (L) { var E = RB.exps[L.key]; if (!E) return false; var r = E.runs.filter(function (x) { return x.id === L.runId; })[0]; return !!(r && r.looked); };
  A.looksText = function (L) { var E = RB.exps[L && L.key || A.expKey()]; return E && E.looks ? "这个实验已经看过 " + E.looks + " 次测试集" : "还没有看过测试集"; };
  /** 揭晓测试集：记下次数。看得越多，测试集的成绩越不像"没见过的数据" */
  A.reveal = function (L, runId) {
    var key = L ? L.key : A.expKey(), E = RB.exps[key];
    if (!E) { if (!L) return; E = RB.exps[key] = { name: L.def ? L.def.name : "", kind: L.res ? L.res.kind : "", looks: 0, runs: [], gone: [], t: Date.now(), stub: true }; }
    var id = runId || (L && L.runId), r = E.runs.filter(function (x) { return x.id === id; })[0];
    if (r ? !r.looked : L && !L.revealed) { if (r) r.looked = true; E.looks = (E.looks || 0) + 1; saveRuns(); }
    if (L && L.res && (!runId || runId === L.runId)) L.revealed = true;
    A.renderSummary(); A.renderViews();
    if (E.looks > 1) A.toast("这个实验的测试集已经看过 " + E.looks + " 次了：照着测试集挑算法，测试集的成绩就会偏乐观。", 4200);
  };
  /** 清空记录：运行删掉，看测试集的次数留着（清空不能把"看过"变成"没看过"） */
  A.clearExp = function () { var k = A.expKey(), E = RB.exps[k]; if (E) RB.exps[k] = { name: E.name, ds: E.ds, kind: E.kind, primary: E.primary, hb: E.hb, looks: E.looks || 0, runs: [], gone: (E.gone || []).concat(E.runs.map(function (r) { return r.id; })).slice(-300), t: Date.now(), truth: E.truth, stub: true }; saveRuns(); A.renderViews(); A.renderSummary(); };

  /* ---------- 排行榜：检验 ---------- */
  /** 一条记录和基线在同一批样本上的配对比较，diff 为正表示比基线好。分类：准确率之差，McNemar 检验；回归：逐样本平方误差之差（基线减模型），正态近似的区间和 p；
   *  预测：同上，长期方差按 Diebold–Mariano（H > 1 时等权截断在 H − 1 阶）。只用前 MAXN 个样本 */
  function versus(E, r, set) {
    var base = E.base; if (!base) return null;
    var ck = (E.truth || "") + "|" + base.stamp + "|" + r.id + "|" + set; if (vsCache[ck]) return vsCache[ck];
    var cls = E.kind === "classification", out = null;
    if (cls) {
      var ca = dec(set === "v" ? r.cV : r.cT), cb = dec(set === "v" ? base.cV : base.cT);
      if (ca && cb) {
        var n = Math.min(ca.length, cb.length), sa = 0, sb = 0; for (var i = 0; i < n; i++) { sa += ca[i]; sb += cb[i]; }
        var mc = ST.mcnemar(ca.subarray(0, n), cb.subarray(0, n)), d = (sa - sb) / n, se = Math.sqrt(Math.max(1e-12, (mc.b + mc.c) / n - d * d) / n);
        out = { diff: d, lo: d - 1.96 * se, hi: d + 1.96 * se, p: mc.p, se: se, n: n };
      }
    } else {
      var la = dec(set === "v" ? r.lV : r.lT), lb = dec(set === "v" ? base.lV : base.lT);
      if (la && lb) {
        var m = Math.min(la.length, lb.length), H = E.kind === "forecast" ? r.H || 1 : 1;
        var dm = ST.dieboldMariano(lb.subarray(0, m), la.subarray(0, m), H, H > 1 ? { kernel: "rect" } : undefined), dd = dm.dbar, se2 = dm.lrv > 0 ? Math.sqrt(dm.lrv / m) : NaN;
        if (E.kind !== "forecast") { var z = se2 > 0 ? dd / se2 : 0; dm = { p: se2 > 0 ? Math.min(1, 2 * ST.normCdf(-Math.abs(z))) : dd === 0 ? 1 : 0 }; }
        out = { diff: dd, lo: dd - 1.96 * se2, hi: dd + 1.96 * se2, p: dm.p, se: se2, n: m };
      }
    }
    vsCache[ck] = out; return out;
  }
  function boardView() {
    var key = A.expKey(), E = RB.exps[key], d = A.ds();
    var c = card("排行榜：" + (d ? d.name : ""), { wide: true, help: "board:how", head: d ? A.originBadge(d, true) : null });
    if (!E || !E.runs.length) { c.body.appendChild(h("p", { class: "ml-note", text: "这个实验（同一个数据集、同样的参数和种子、同样的划分）还没有记录。每运行一次，这里就多一行：所有算法在完全相同的样本上比，可以做配对检验。" + (E && E.looks ? "这个实验的测试集已经看过 " + E.looks + " 次。" : "") })); return; }
    var pk = E.primary, hb = E.hb, runs = E.runs.slice();
    var vs = runs.map(function (r) { return versus(E, r, "v"); }), adj = ST.holm(vs.map(function (x) { return x ? x.p : NaN; }));
    var order = runs.map(function (r, i) { return i; }).sort(function (a, b) { var x = runs[a].m.valid[pk], y = runs[b].m.valid[pk]; return hb ? y - x : x - y; });
    var tb = h("tbody"), tbl = h("table", { class: "ml-lb" }, h("thead", null, h("tr", null, ["", "算法", "验证 · " + A.metName(pk), "比基线好多少（95% 区间）", "p（Holm）", "测试", "训练用时", "参数量", ""].map(function (x) { return h("th", { text: x }); }))), tb);
    tb.appendChild(h("tr", { class: "base" }, h("td", { text: "—" }), h("td", { text: (E.base && E.base.name) || "基线" }), h("td", { class: "num", text: A.metFmt(pk, E.base.mV[pk]) }), h("td"), h("td"), h("td", { class: "num", text: E.looks ? A.metFmt(pk, E.base.mT[pk]) : "🔒" }), h("td"), h("td"), h("td")));
    if (E.oracle) tb.appendChild(h("tr", { class: "base" }, h("td", { text: "—" }), h("td", { text: "理论最优（知道真实规律）" }), h("td", { class: "num", text: A.metFmt(pk, E.oracle.mV[pk]) }), h("td"), h("td"), h("td", { class: "num", text: E.looks ? A.metFmt(pk, E.oracle.mT[pk]) : "🔒" }), h("td"), h("td"), h("td")));
    order.forEach(function (i, rank) {
      var r = runs[i], v = vs[i], cur = A.last && A.last.runId === r.id;
      var better = v ? (v.lo > 0 ? "good" : v.hi < 0 ? "bad" : "") : "";
      var dtxt = v ? (v.diff >= 0 ? "+" : "−") + A.metFmt(pk, Math.abs(v.diff)) + " " : r.stripped ? "（旧记录，没存逐样本损失）" : "—", rng = v ? h("small", { text: "[" + A.metFmt(pk, v.lo) + ", " + A.metFmt(pk, v.hi) + "]" }) : null;
      var tag = r.src === "ai" ? "AI" : r.src === "mine" ? "我的" : r.src === "py" ? "Python" : "";
      var testCell = r.looked ? h("td", { class: "num", text: A.metFmt(pk, r.m.test[pk]) }) : h("td", null, h("button", { class: "btn small", type: "button", text: "🔒 揭晓", onclick: function () { A.reveal(A.last && A.last.runId === r.id ? A.last : { key: key }, r.id); } }));
      tb.appendChild(h("tr", { class: cur ? "cur" : "" }, h("td", { class: "num", text: String(rank + 1) }), h("td", null, r.name, tag ? h("span", { class: "tag", text: tag }) : null, paramsText(r.params) ? h("div", { class: "note", text: paramsText(r.params) }) : null),
        h("td", { class: "num", text: A.metFmt(pk, r.m.valid[pk]) }), h("td", { class: "num " + better }, dtxt, rng), h("td", { class: "num", text: v ? fmtP(adj[i]) : "—" }), testCell,
        h("td", { class: "num", text: A.secs(r.fitMs) }), h("td", { class: "num", text: r.size != null ? r.size.toLocaleString("en-US") : "—" }),
        h("td", { class: "acts" }, r.code || r.src === "builtin" || r.src === "py" ? h("button", { class: "btn small", type: "button", text: "载入", title: "把这个算法和它的参数放回左栏", onclick: function () { loadRun(r); } }) : null, h("button", { class: "iconbtn", type: "button", "aria-label": "删掉这一行", text: "✕", onclick: function () { E.runs = E.runs.filter(function (x) { return x.id !== r.id; }); (E.gone = E.gone || []).push(r.id); saveRuns(); A.renderViews(); } }))));
    });
    c.body.appendChild(h("div", { class: "ml-lbwrap" }, tbl));
    var N = runs.length, em = ST.expectedMaxNormal(N), nPair = vs.filter(Boolean).map(function (x) { return x.n; })[0];
    c.body.appendChild(h("p", { class: "ml-note" }, h("b", { text: "怎么读。" }), " “比基线好多少”是在同一批验证样本上的配对比较，正数表示比基线好（" + (E.kind === "classification" ? "准确率之差，检验用 McNemar" : E.kind === "forecast" ? "基线的 MSE 减去这个算法的 MSE，检验用 Diebold–Mariano" : "基线的 MSE 减去这个算法的 MSE，区间和 p 用正态近似") + "）；p 值按 Holm 方法对这 " + N + " 行一起校正过。绿色：区间整个在 0 的上方；红色：整个在下方。" + (E.nValid > MAXN && nPair ? "验证集有 " + E.nValid + " 个样本，配对检验只用了前 " + nPair + " 个，所以“比基线”的差和两列成绩之差可能略有出入。" : "")));
    if (N >= 2) c.body.appendChild(h("p", { class: "ml-note" }, h("b", { text: "挑出来的第一名偏乐观。" }), " 你在这个实验上试了 " + N + " 次。即使这 " + N + " 个算法其实一样好，验证集上最好的那一个平均也会比真实水平高出约 " + F(em, 2) + " 个标准误（独立的 N(0,1) 取最大值的期望；相关的候选会少一些）。所以最后要在测试集上确认，而且测试集只看一次。" + (E.looks ? "这个实验已经看过 " + E.looks + " 次测试集。" : "")));
    c.body.appendChild(h("div", { class: "ml-row" }, h("span", { class: "sp" }), twoStep(h("button", { class: "btn small", type: "button", id: "btnClearExp", text: "清空这个实验的记录" }), "再点一次：清空 " + N + " 条记录（看过测试集的次数会留着）", function () { A.clearExp(); })));
  }
  /** 要确认的按钮：点第一次变成"再点一次……"，4 秒内再点才执行（不用浏览器的 confirm 对话框：在 Claude 里打开时它直接返回"取消"） */
  function twoStep(btn, ask, fn) {
    var label = btn.textContent, armed = false, t = null;
    function reset() { armed = false; clearTimeout(t); btn.textContent = label; btn.classList.remove("danger"); }
    btn.addEventListener("click", function () { if (!armed) { armed = true; btn.textContent = ask; btn.classList.add("danger"); t = setTimeout(reset, 4000); return; } reset(); fn(); });
    btn.addEventListener("blur", function () { if (armed) setTimeout(reset, 150); });
    return btn;
  }
  A.twoStep = twoStep;
  /** 复制到剪贴板：成功、失败都说一声 */
  A.copyText = function (text) {
    try { navigator.clipboard.writeText(text).then(function () { A.toast("已复制"); }, function () { A.toast("没能复制：这里不允许写剪贴板。可以在框里全选以后自己复制。", 3600); }); }
    catch (e) { A.toast("没能复制：这里不允许写剪贴板。可以在框里全选以后自己复制。", 3600); }
  };
  function fmtP(p) { return p == null || !(p === p) ? "—" : p < 0.001 ? "< 0.001" : F(p, 3); }
  function paramsText(p) { if (!p) return ""; var ks = Object.keys(p); if (!ks.length) return ""; return ks.slice(0, 5).map(function (k) { var v = p[k]; return k + "=" + (typeof v === "number" ? G(v) : String(v)); }).join("，") + (ks.length > 5 ? "…" : ""); }
  /** 载入：算法还在而且代码没变，就选它；代码变了或者已经删了，用记录里存的代码和参数表另存一份 */
  function loadRun(r) {
    var list = A.algosFor(A.ds()), a = list.filter(function (x) { return x.id === r.algoId; })[0];
    if (r.code && (!a || A.hashStr(a.code || "") !== r.codeHash)) a = A.saveMine({ name: r.name + (a ? "（排行榜里的版本）" : ""), code: r.code, src: r.src === "ai" ? "ai" : "mine", lang: r.lang, params: r.spec || [], api: A.apiOf(A.ds()) });
    if (!a) { A.toast(r.src === "py" ? "这是本机引擎里的算法：先连上引擎。" : "这个算法已经不在列表里了。"); return; }
    var st = A.S.algo[A.ds().family + "/" + A.ds().kind] || (A.S.algo[A.ds().family + "/" + A.ds().kind] = { id: "", params: {} }); st.params[a.id] = Object.assign({}, r.params || {});
    A.selectAlgo(a.id); A.persist(); A.toast("已载入：" + r.name);
  }

  /* ---------- 我的算法 ---------- */
  /** 存一个算法（自己改的、AI 写的）。o: { name, summary, code, params, docs, src: "mine" | "ai", lang, api, kinds, families, id? }。参数表一律清洗过 */
  A.saveMine = function (o) {
    var d = A.ds(), id = o.id || (o.src === "ai" ? "ai-" : "my-") + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    var params = A.aiCleanParams ? A.aiCleanParams(o.params || [], 40) : o.params || [];
    var rec = { id: id, name: String(o.name || "我的算法").slice(0, 40), summary: o.summary || "", code: String(o.code || ""), params: params, docs: o.docs || "", src: o.src || "mine", lang: o.lang === "py" ? "py" : "js", api: o.api || A.apiOf(d), kinds: o.kinds || [d.kind], families: o.families || [d.family], group: "other", t: Date.now() };
    var i = S.my.findIndex(function (x) { return x.id === id; }); if (i >= 0) S.my[i] = rec; else S.my.push(rec);
    // 最多 60 个：先丢最旧的 AI 写的，自己的算法尽量留着
    while (S.my.length > 60) { var cand = S.my.filter(function (x) { return x.src === "ai" && x.id !== id; }); if (!cand.length) cand = S.my.filter(function (x) { return x.id !== id; }); cand.sort(function (x, y) { return (x.t || 0) - (y.t || 0); }); var drop = cand[0]; S.my = S.my.filter(function (x) { return x !== drop; }); }
    if (!A.persist()) A.toast("浏览器的存储空间不够了：这个算法这一次没有存下来，刷新页面以后会丢。先复制一份代码。", 5000);
    return rec;
  };
  A.deleteMine = function (id) { S.my = S.my.filter(function (x) { return x.id !== id; }); A.persist(); A.renderAlgo(); };

  /* ---------- 代码与说明 ---------- */
  var PY_API = [
    "Python 算法（在本机引擎里运行，详见 ml-engine/README.md）",
    "def fit(data, p, lib, ctx) -> model        # 监督学习；data.train / data.valid 有 X（float64 [n, d]，只读）、y、n、d、k、classes、feature_names、shape、tokens",
    "def predict(model, X) -> [n] 或 [n, k]      # 分类返回每行和为 1 的概率",
    "def inspect(model) -> dict                 # 可选：layers、embedding、coef、tree、text",
    "def fit(series, p, lib, ctx) -> model      # 时间序列：series.y（训练段）、series.valid.y、season、freq",
    "def forecast(model, past, h) -> 长度 h 的数组",
    "def update(model, y_new)                   # 可选",
    "",
    "p：只读的参数映射（p.get(\"lr\", 0.01)）。lib：np、torch、nn、F、device（MPS / CUDA / CPU）、rng（已播种的 numpy Generator）。",
    "ctx：report(step, loss=…, validLoss=…)、snapshot(step, model)、time_left()（秒）、log(...)、budget_ms。"
  ].join("\n");
  A.openCode = function () {
    var a = A.algo(); if (!a) return;
    var ro = a.src === "builtin" || a.src === "py", tab = "code";
    var tabs = h("div", { class: "ml-code-tabs seg", role: "group" }), body = h("div");
    var name = h("input", { type: "text", value: a.name, "aria-label": "名字", style: { width: "100%" } });
    var ta = h("textarea", { class: "codeedit", spellcheck: "false", "aria-label": "算法代码", id: "codeEdit" }); ta.value = a.code || "";
    ta.addEventListener("keydown", function (e) { if (e.key === "Tab") { e.preventDefault(); var s = ta.selectionStart; ta.value = ta.value.slice(0, s) + "  " + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 2; } });
    var pj = h("textarea", { class: "codeedit", spellcheck: "false", "aria-label": "参数表（JSON）", style: { "min-height": "160px" } }); pj.value = JSON.stringify(a.params || [], null, 1);
    var err = h("div", { class: "warn err ml-code-err", hidden: true });
    function show(t) {
      tab = t; clear(body); Array.prototype.forEach.call(tabs.children, function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-t") === t ? "true" : "false"); });
      if (t === "docs") { var md = h("div", { class: "explain" }); body.appendChild(md); QLMD.mount(md, a.docs || a.summary || "（这个算法没有写说明。）"); }
      else if (t === "params") { body.appendChild(h("p", { class: "note", text: "参数表：每一项 {key, label, def, min, max, step, type: \"num\" | \"int\" | \"bool\" | \"select\", desc}。代码里用 p.key 读。" })); body.appendChild(pj); }
      else if (t === "api") { body.appendChild(h("pre", { class: "code", text: a.lang === "py" ? PY_API : A.apiDoc(A.apiOf(A.ds()), "js") })); }
      else { if (!ro) body.appendChild(h("div", { class: "field" }, h("label", { text: "名字" }), h("span"), name)); body.appendChild(ta); if (ro) body.appendChild(h("p", { class: "note", text: "这是内置的算法，这里不能直接改；点“另存为我的算法”复制一份再改。" })); }
    }
    [["code", "代码"], ["docs", "说明"], ["params", "参数表"], ["api", "接口说明"]].forEach(function (x) { tabs.appendChild(h("button", { type: "button", "data-t": x[0], "aria-pressed": "false", text: x[1], onclick: function () { show(x[0]); } })); });
    if (ro) ta.readOnly = true;
    function collect() {
      var code = ta.value, bad = a.lang === "py" ? "" : QLMLRunner.syntax(code); if (bad) { err.hidden = false; err.textContent = "语法错误：" + bad; return null; }
      var params; try { params = JSON.parse(pj.value || "[]"); if (!Array.isArray(params)) throw new Error("参数表应该是数组"); } catch (e) { err.hidden = false; err.textContent = "参数表不是合法的 JSON：" + e.message; return null; }
      err.hidden = true; return { code: code, params: params };
    }
    var foot = [];
    if (!ro) foot.push(twoStep(h("button", { class: "btn", type: "button", id: "btnDelMine", text: "删除" }), "再点一次：删除“" + a.name + "”", function () { A.deleteMine(a.id); m.close(); }));
    foot.push(h("span", { style: { flex: "1" } }));
    foot.push(h("button", { class: "btn", type: "button", text: "复制代码", onclick: function () { A.copyText(ta.value); } }));
    foot.push(h("button", { class: "btn", type: "button", text: ro ? "另存为我的算法" : "另存一份", onclick: function () { var x = collect(); if (!x) return; var rec = A.saveMine({ name: (ro ? a.name + "（改）" : name.value + "（副本）"), summary: a.summary, code: x.code, params: x.params, docs: a.docs, src: "mine", lang: a.lang, api: a.api, kinds: a.kinds, families: a.families }); A.selectAlgo(rec.id); m.close(); A.toast("已存为“" + rec.name + "”，可以改了。"); A.openCode(); } }));
    if (!ro) foot.push(h("button", { class: "btn primary", type: "button", text: "保存并运行", onclick: function () { var x = collect(); if (!x) return; var rec = A.saveMine({ id: a.id, name: name.value, summary: a.summary, code: x.code, params: x.params, docs: a.docs, src: a.src, lang: a.lang, api: a.api, kinds: a.kinds, families: a.families }); A.selectAlgo(rec.id); m.close(); A.run().catch(function () {}); } }));
    var m = A.modal("代码与说明：" + a.name, [tabs, body, err], { foot: foot, focus: "#codeEdit" });
    if (A.lastError && A.lastError.algo && A.lastError.algo.id === a.id) { err.hidden = false; err.textContent = "上一次运行出错：" + A.lastError.message + (A.lastError.line ? "（第 " + A.lastError.line + " 行）" : ""); }
    show(tab);
  };

  /* ---------- 导入 CSV ---------- */
  var CSV_DOC = "你自己导入的数据。数值列的缺失值在划分之后用训练集那一列的中位数补上（验证集、测试集的信息不会漏进训练）；类别列做独热编码，缺失算作单独的一类。";
  var CKEY = "ql.ml.csv.v1";
  /** 把一张表（parseCSV 的结果）变成当前的数据集。o: { target, kind, features, time, name, summary, docs, web（从网上取的：来源）, text（原文，用来区分实验和存档）, store } */
  A.importTable = function (table, o) {
    var data = QL.mlreg.fromCSV(table, { target: o.target, kind: o.kind, features: o.features && o.features.length ? o.features : undefined, time: o.time || undefined });
    var k = o.kind === "forecast" ? "forecast" : data.classes ? "classification" : "regression";
    var def = { id: "csv", family: k === "forecast" ? "timeseries" : "tabular", kind: k, name: o.name || "导入的数据", summary: o.summary || "你导入的 CSV（" + (data.n || data.T || (data.y && data.y.length)) + " 行）。要预测的列：" + o.target + "。", params: [], docs: o.docs || CSV_DOC, plot: k === "forecast" ? "series" : data.d === 2 ? "scatter2d" : "table", web: o.web || null };
    A.csv = { def: def, data: data, hash: A.hashStr([o.target, o.kind, (o.features || []).join(","), o.time || "", o.web ? JSON.stringify(o.web.plan || {}) : "", o.text || ""].join("\u0000")) };
    if (o.store !== false) {
      var rec = { v: 2, target: o.target, kind: o.kind, features: o.features || null, time: o.time || null, name: def.name, summary: def.summary, docs: def.docs, web: o.web || null };
      if (o.text && o.text.length < 300000) rec.text = o.text;
      try { if (rec.text || rec.web) localStorage.setItem(CKEY, JSON.stringify(rec)); else localStorage.removeItem(CKEY); } catch (e) { try { delete rec.text; localStorage.setItem(CKEY, JSON.stringify(rec)); } catch (e2) {} }
    }
    if (o.select !== false) {
      var want = def.family === "timeseries" ? "ts" : def.kind === "classification" ? "tab-cls" : "tab-reg"; S.group = want; (S.ds[want] = S.ds[want] || { id: "csv", seed: 1, params: {} }).id = "csv";
      A.persist(); A.renderLeft(); A.dataChanged();
    }
    return def;
  };
  A.openCsv = function () {
    var g = A.group(), file = h("input", { type: "file", accept: ".csv,.tsv,.txt,text/csv" }), ta = h("textarea", { class: "codeedit", spellcheck: "false", placeholder: "也可以把 CSV 的内容直接贴在这里（第一行是列名）", style: { "min-height": "120px" } });
    var box = h("div"), err = h("div", { class: "warn err", hidden: true }), table = null;
    file.addEventListener("change", function () { var f = file.files && file.files[0]; if (!f) return; if (f.size > 20e6) { err.hidden = false; err.textContent = "文件太大（超过 20 MB）。"; return; } var rd = new FileReader(); rd.onload = function () { ta.value = String(rd.result); parse(); }; rd.readAsText(f); });
    ta.addEventListener("change", parse);
    var tgt = h("select", { "aria-label": "要预测的列" }), kind = h("select", { "aria-label": "任务类型" }, [["auto", "自动判断"], ["regression", "回归"], ["classification", "分类"], ["forecast", "时间序列预测"]].map(function (x) { return h("option", { value: x[0], text: x[1], selected: g.family === "timeseries" ? x[0] === "forecast" : x[0] === "auto" }); }));
    function parse() {
      err.hidden = true; clear(box);
      try { table = QL.mlreg.parseCSV(ta.value); } catch (e) { err.hidden = false; err.textContent = e.message; table = null; return; }
      clear(tgt); table.header.forEach(function (c, i) { tgt.appendChild(h("option", { value: c, text: c, selected: i === table.header.length - 1 })); });
      box.appendChild(h("p", { class: "note", text: "读到 " + table.rows.length + " 行、" + table.header.length + " 列。" }));
    }
    var ok = h("button", { class: "btn primary", type: "button", text: "导入", onclick: function () {
      if (!table) parse(); if (!table) return;
      var def;
      try { def = A.importTable(table, { target: tgt.value, kind: kind.value, name: "导入的数据：" + (file.files && file.files[0] ? file.files[0].name : "粘贴的表格"), text: ta.value }); }
      catch (e) { err.hidden = false; err.textContent = e.message; return; }
      m.close(); A.toast("已导入：" + def.summary);
    } });
    var m = A.modal("导入 CSV", [h("p", { class: "note", text: "数据只在这台电脑的浏览器里处理，不会上传。第一行是列名；数值列直接用，其余的列按类别做独热编码（最多 30 个取值）。最多 5 万行、200 列。" }), file, ta, box,
      h("div", { class: "fields" }, h("div", { class: "field" }, h("label", { text: "要预测的列" }), h("span"), tgt), h("div", { class: "field" }, h("label", { text: "任务" }), h("span"), kind)), err], { foot: [ok] });
  };
  /** 打开页面时恢复上次导入（或从网上取）的数据。原文存着就直接用；从网上取的大文件只存了地址，重新去取（异步，取到以后再选回它） */
  A.restoreCsv = function () {
    var o = null; try { o = JSON.parse(localStorage.getItem(CKEY) || "null"); } catch (e) {} if (!o) return;
    var opt = { target: o.target, kind: o.kind, features: o.features, time: o.time, name: o.name, summary: o.summary, docs: o.docs, web: o.web, text: o.text, store: false, select: false };
    // 从"数据分析案例"那张页面过来（地址是 ml/#csv）：数据已经放好了，打开时直接选中它
    var pick = /^#csv$/.test(location.hash || "");
    function done(table) {
      try {
        var def = A.importTable(table, opt);
        if (pick) {
          var want = def.family === "timeseries" ? "ts" : def.kind === "classification" ? "tab-cls" : "tab-reg"; S.group = want; (S.ds[want] = S.ds[want] || { id: "csv", seed: 1, params: {} }).id = "csv";
          try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
          setTimeout(function () { if (A.toast) A.toast("已选中交过来的数据：" + def.name, 4000); }, 300);
        }
        return true;
      } catch (e) { return false; }
    }
    try {
      if (o.text) { done(o.web && A.webTable ? A.webTable(o.text, o.web.plan || {}).table : QL.mlreg.parseCSV(o.text)); return; }
      if (o.web && A.webRefetch) {
        A.csvPending = true;
        A.webRefetch(o.web).then(function (r) {
          A.csvPending = false; opt.text = r.text;
          if (done(r.table) && !A.last && S.group === (o.kind === "forecast" ? "ts" : o.kind === "classification" ? "tab-cls" : "tab-reg") && S.ds[S.group] && S.ds[S.group].id === "csv") { A.renderLeft(); A.dataChanged(); }
        }, function (e) { A.csvPending = false; A.toast("上次从网上取的数据（" + (o.name || "") + "）没能重新取到：" + String(e && e.message || e).slice(0, 160), 6000); });
      }
    } catch (e) {}
  };

  /* ---------- 手册 ---------- */
  A.openGuide = function (key) {
    var entries = A.guideEntries ? A.guideEntries() : [], byKey = {}; entries.forEach(function (e) { byKey[e.key] = e; });
    if (!key || !byKey[key]) key = entries.length ? entries[0].key : "";
    var nav = h("nav", { class: "gd-nav", "aria-label": "手册目录" }), art = h("article", { class: "gd-art", tabindex: "-1" }), search = h("input", { type: "text", class: "gd-search", placeholder: "在手册里找…", "aria-label": "在手册里找" });
    function renderNav(q) {
      clear(nav); var groups = {}, order = [];
      entries.forEach(function (e) { if (q && (e.title + " " + (e.keys || "") + " " + e.md).toLowerCase().indexOf(q.toLowerCase()) < 0) return; if (!groups[e.group]) { groups[e.group] = []; order.push(e.group); } groups[e.group].push(e); });
      order.forEach(function (g) { nav.appendChild(h("h4", { text: g })); groups[g].forEach(function (e) { nav.appendChild(h("button", { class: "gd-link", type: "button", "aria-current": e.key === key ? "true" : "false", onclick: function () { show(e.key); } }, e.title, e.badge ? h("span", { class: "ml-badge " + e.badge.k, text: e.badge.short }) : null)); }); });
    }
    function show(k) { key = k; var e = byKey[k]; clear(art); if (!e) return; var inn = h("div", { class: "gd-in" }, h("div", { class: "gd-kicker" }, e.group, e.badge ? h("span", { class: "ml-badge " + e.badge.k, text: e.badge.label }) : null), h("h2", { class: "gd-title", text: e.title })), md = h("div"); inn.appendChild(md); art.appendChild(inn); QLMD.mount(md, e.md); if (e.after) e.after(inn); art.scrollTop = 0; renderNav(search.value); }
    search.addEventListener("input", function () { renderNav(search.value); });
    var hd = h("div", { class: "gd-h" }, h("h2", { text: "手册" }), search, h("button", { class: "iconbtn", type: "button", "aria-label": "关闭", text: "✕", onclick: function () { m.close(); } }));
    var m = A.modal("手册", [hd, h("div", { class: "gd-main" }, nav, art)], { bare: true, cls: "guide", focus: ".gd-art" });
    m.guide = true;
    renderNav(""); show(key);
  };
})(MLA);
