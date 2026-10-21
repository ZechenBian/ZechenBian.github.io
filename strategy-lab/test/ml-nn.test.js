// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 自动求导小库 QL.nn：梯度检验、形状、损失、优化器、训练是否真的能学会、可复现、自包含、速度
const { QL, ok, near, section, done } = require("./harness.js");
const fs = require("fs"), path = require("path"), vm = require("vm");
const INSTALL = require("../src/ml/nn.js");
INSTALL(QL);
const nn = QL.nn, RNG = QL.RNG, la = nn.la;
const T_START = Date.now();

let seedc = 100;
/** 随机张量。o: { scale, shift, away（离 0 至少这么远，避开 ReLU 之类的折点）, grad } */
function rt(shape, o) {
  o = o || {};
  const r = new RNG(seedc++, 3, 3), n = shape.reduce((a, b) => a * b, 1), d = new Float32Array(n);
  for (let i = 0; i < n; i++) { let v = r.normal() * (o.scale == null ? 1 : o.scale); if (o.away) v = (v >= 0 ? 1 : -1) * (o.away + Math.abs(v)); d[i] = v + (o.shift || 0); }
  return nn.tensor(d, shape, o.grad !== false);
}
/** 把任意形状的输出用一组固定的随机权重加成标量，再做梯度检验：每个输出分量的梯度都不一样 */
function check(name, build, params, eps, tol) {
  let R = null;
  const f = () => { const out = build(); if (!R) R = rt(out.shape, { grad: false }); return nn.sum(nn.mul(out, R)); };
  const e = nn.gradcheck(f, params, eps || 1e-2);
  ok(e < (tol || 2e-2), "梯度检验 " + name, e.toExponential(2));
}
function throws(fn, re, name) { let msg = ""; try { fn(); } catch (e) { msg = e.message; } ok(re.test(msg), name, msg || "没有抛错"); }
function maxDiff(a, b) { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; }
function argmaxRows(t) { const k = t.shape[1], n = t.shape[0], out = new Int32Array(n); for (let i = 0; i < n; i++) { let b = 0; for (let j = 1; j < k; j++) if (t.data[i * k + j] > t.data[i * k + b]) b = j; out[i] = b; } return out; }
function accOf(logits, y) { const p = argmaxRows(logits); let c = 0; for (let i = 0; i < y.length; i++) if (p[i] === y[i]) c++; return c / y.length; }

section("张量、形状与广播");
{
  const t = nn.tensor([1, 2, 3, 4, 5, 6], [2, 3]);
  ok(t.data instanceof Float32Array && t.shape.join() === "2,3" && t.grad === null && t.requiresGrad === false, "tensor：Float32Array、形状、无梯度");
  ok(nn.zeros([3, 2]).size === 6 && nn.ones([2]).data[1] === 1, "zeros / ones");
  const p = nn.param([50, 40], "he", new RNG(1, 1, 1)); let s2 = 0; for (const v of p.data) s2 += v * v;
  near(Math.sqrt(s2 / p.size), Math.sqrt(2 / 50), 0.02, "param he：标准差 √(2/fanIn)");
  const px = nn.param([8, 3, 3, 3], "xavier", new RNG(1, 1, 2)); let s3 = 0; for (const v of px.data) s3 += v * v;
  near(Math.sqrt(s3 / px.size), Math.sqrt(2 / (27 + 72)), 0.03, "param xavier（卷积核的 fanIn = C·kh·kw）");
  ok(nn.param([3], "zeros").data.every(v => v === 0) && nn.param([3], "ones").data.every(v => v === 1) && nn.param([4, 4], 0.5, new RNG(2, 2, 2)).requiresGrad, "param zeros / ones / 数字标准差");
  throws(() => nn.tensor([1, 2, 3], [2, 2]), /tensor：数据长度 3 与形状 \[2,2\] 不符/, "形状不符时中文报错");
  throws(() => nn.matmul(nn.zeros([2, 3]), nn.zeros([4, 5])), /^matmul：形状不匹配 \[2,3\]×\[4,5\]$/, "matmul 形状不匹配的报错");
  const a = nn.tensor([1, 2, 3, 4, 5, 6], [2, 3]), b = nn.tensor([10, 20, 30], [3]);
  ok(Array.from(nn.add(a, b).data).join() === "11,22,33,14,25,36" && nn.add(a, b).shape.join() === "2,3", "add：[n,m] + [m] 按行广播");
  ok(Array.from(nn.add(b, a).data).join() === "11,22,33,14,25,36", "add：[m] + [n,m] 也行");
  ok(Array.from(nn.sub(a, b).data).join() === "-9,-18,-27,-6,-15,-24" && Array.from(nn.sub(b, a).data).join() === "9,18,27,6,15,24", "sub 两个方向的广播");
  ok(Array.from(nn.mul(a, nn.tensor([2], [1])).data).join() === "2,4,6,8,10,12", "mul：标量 [1] 广播");
  ok(Array.from(nn.add(a, nn.tensor([1, 1, 1], [1, 3])).data).join() === "2,3,4,5,6,7", "add：[1,m] 也算行广播");
  throws(() => nn.add(a, nn.zeros([2])), /add：形状不匹配 \[2,3\] 与 \[2\]/, "不能广播的形状报错");
  ok(Array.from(nn.sum(a, 0).data).join() === "5,7,9" && Array.from(nn.sum(a, 1).data).join() === "6,15" && nn.sum(a).data[0] === 21 && nn.sum(a).shape.join() === "1", "sum：全部 / 按列 / 按行");
  ok(Array.from(nn.mean(a, -1).data).join() === "2,5" && nn.mean(a).data[0] === 3.5, "mean");
  const r = nn.reshape(a, [3, -1]); ok(r.shape.join() === "3,2" && r.data !== a.data && Array.from(r.data).join() === "1,2,3,4,5,6", "reshape：-1 推断、复制数据");
  throws(() => nn.reshape(a, [4, -1]), /reshape：大小不符/, "reshape 大小不符");
  ok(Array.from(nn.transpose2d(a).data).join() === "1,4,2,5,3,6" && nn.transpose2d(a).shape.join() === "3,2", "transpose2d");
  const c1 = nn.concat([a, nn.tensor([7, 8], [2, 1])], 1), c0 = nn.concat([a, nn.tensor([7, 8, 9], [1, 3])], 0);
  ok(c1.shape.join() === "2,4" && Array.from(c1.data).join() === "1,2,3,7,4,5,6,8", "concat axis 1");
  ok(c0.shape.join() === "3,3" && Array.from(c0.data).join() === "1,2,3,4,5,6,7,8,9", "concat axis 0");
  const x4 = nn.zeros([2, 3, 8, 6]), w = nn.zeros([5, 3, 3, 3]);
  ok(nn.conv2d(x4, w, null, { pad: "same" }).shape.join() === "2,5,8,6" && nn.conv2d(x4, w, null, { pad: 0 }).shape.join() === "2,5,6,4" && nn.conv2d(x4, w, null, { pad: "circular" }).shape.join() === "2,5,8,6" && nn.conv2d(x4, w, null, { pad: 2 }).shape.join() === "2,5,10,8", "conv2d 输出形状（same / 0 / circular / 2）");
  ok(nn.maxPool2d(x4, 2).shape.join() === "2,3,4,3" && nn.avgPoolGlobal(x4).shape.join() === "2,3" && nn.flatten(x4).shape.join() === "2,144", "池化与 flatten 的形状");
  throws(() => nn.maxPool2d(nn.zeros([1, 1, 5, 4]), 2), /maxPool2d：高和宽（5×4）必须能被 2 整除/, "maxPool2d 尺寸不整除报错");
  throws(() => nn.conv2d(x4, nn.zeros([5, 3, 2, 2]), null, { pad: "same" }), /奇数/, "same 填充要求奇数卷积核");
  throws(() => nn.crossEntropy(nn.zeros([2, 3]), new Int32Array([0, 3])), /crossEntropy：第 1 个标签 3 不在 0..2 里/, "标签越界报错");
  throws(() => nn.embedding(nn.zeros([4, 2]), [1, 4]), /embedding：第 1 个下标 4 超出词表 0..3/, "嵌入下标越界报错");
  // 已知的卷积：循环填充下，"把右边的邻居搬过来"的卷积核就是向左平移一格（周期边界）
  const img = nn.tensor([1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 1, 3, 3]), shiftK = nn.tensor([0, 0, 0, 0, 0, 1, 0, 0, 0], [1, 1, 3, 3]);
  ok(Array.from(nn.conv2d(img, shiftK, null, { pad: "circular" }).data).join() === "2,3,1,5,6,4,8,9,7", "circular 卷积 = 周期平移");
  ok(Array.from(nn.conv2d(img, shiftK, null, "same").data).join() === "2,3,0,5,6,0,8,9,0", "same 卷积在边上补零");
  ok(Array.from(nn.maxPool2d(nn.tensor([1, 5, 2, 0, 3, 4, 9, 1, 0, 0, 0, 0, 7, 8, 6, 2], [1, 1, 4, 4]), 2).data).join() === "5,9,8,6", "maxPool2d 取每个 2×2 窗口的最大值");
}

section("计算图：记录、累加、拆除、noGrad");
{
  const w = rt([3, 2]), x = rt([4, 3], { grad: false });
  const h = nn.tanh(nn.matmul(x, w)), L = nn.sum(h);
  ok(h.requiresGrad && h._back && !x.requiresGrad, "依赖参数的结果记录计算图，数据本身不需要梯度");
  L.backward();
  ok(w.grad && h._back === null && h._parents === null && h.grad === null && L._back === null, "backward 之后中间节点的图和梯度都拆掉了，参数的梯度留着");
  const g1 = Float32Array.from(w.grad);
  nn.sum(nn.tanh(nn.matmul(x, w))).backward();
  ok(maxDiff(w.grad, g1.map(v => 2 * v)) < 1e-6, "梯度是累加的（不清零时第二次变成两倍）");
  w.zeroGrad(); ok(w.grad.every(v => v === 0), "zeroGrad 清零");
  const ng = nn.noGrad(() => nn.relu(nn.matmul(x, w)));
  ok(!ng.requiresGrad && ng._back === null && nn.gradEnabled(), "noGrad 里算的张量不记录，出来以后恢复");
  throws(() => ng.backward(), /backward：这个张量不需要梯度/, "对不需要梯度的张量 backward 报错");
  throws(() => nn.matmul(x, w).backward(), /backward：只能对标量调用/, "非标量 backward 需要 seed");
  // 非标量配 seed：结果等于 sum(out ⊙ seed) 的梯度
  const xg = rt([2, 3]), seed = new Float32Array([1, -2, 0.5, 3, 0, 1]); nn.square(xg).backward(seed);
  ok(maxDiff(xg.grad, Array.from(xg.data, (v, i) => 2 * v * seed[i])) < 1e-6, "带 seed 的 backward");
  // 同一个张量用两次：梯度两路相加
  const u = rt([5]); nn.sum(nn.mul(u, u)).backward(); ok(maxDiff(u.grad, Array.from(u.data, v => 2 * v)) < 1e-6, "同一个张量出现两次，梯度相加");
  // 很深的图不会爆栈（迭代式拓扑排序）
  const z = rt([3]); let y = z; for (let i = 0; i < 20000; i++) y = nn.scale(y, 1.0001);
  let deepOk = true; try { nn.sum(y).backward(); } catch (e) { deepOk = false; }
  ok(deepOk && Math.abs(z.grad[0] - Math.pow(1.0001, 20000)) < 1e-3 * Math.pow(1.0001, 20000), "两万层深的图也能反传");
}

section("矩阵乘法内核：分块、尾部、稀疏路径都与双精度朴素算法一致");
{
  for (const [n, K, M, sparse] of [[5, 7, 6, false], [8, 16, 12, false], [3, 2, 9, false], [9, 20, 5, true], [13, 1, 1, false]]) {
    const a = rt([n, K]), b = rt([K, M]);
    if (sparse) for (let i = 0; i < a.size; i++) if (i % 5) a.data[i] = 0;    // 八成是 0：走跳过 0 的那条路
    const c = nn.matmul(a, b), ref = new Float64Array(n * M);
    for (let i = 0; i < n; i++) for (let k = 0; k < K; k++) for (let j = 0; j < M; j++) ref[i * M + j] += a.data[i * K + k] * b.data[k * M + j];
    const G = rt([n, M], { grad: false }); nn.sum(nn.mul(c, G)).backward();
    const ga = new Float64Array(n * K), gb = new Float64Array(K * M);
    for (let i = 0; i < n; i++) for (let k = 0; k < K; k++) for (let j = 0; j < M; j++) { ga[i * K + k] += G.data[i * M + j] * b.data[k * M + j]; gb[k * M + j] += a.data[i * K + k] * G.data[i * M + j]; }
    ok(maxDiff(c.data, ref) < 1e-4 && maxDiff(a.grad, ga) < 1e-4 && maxDiff(b.grad, gb) < 1e-4, `matmul [${n},${K}]×[${K},${M}]${sparse ? "（稀疏）" : ""} 前向与两个梯度`);
  }
}

section("梯度检验（单精度，最大相对误差 < 2e-2）");
{
  let a = rt([3, 5]), b = rt([5, 4]); check("matmul", () => nn.matmul(a, b), [a, b]);
  a = rt([5, 7]); b = rt([7, 6]); check("matmul（分块的尾部）", () => nn.matmul(a, b), [a, b]);
  const xs = rt([6, 10]); for (let i = 0; i < xs.size; i++) if (i % 4) xs.data[i] = 0; const ws = rt([10, 3]); check("matmul（稀疏输入）", () => nn.matmul(xs, ws), [ws]);
  let x = rt([4, 6]), W = rt([6, 5]), bb = rt([5]); check("linear", () => nn.linear(x, W, bb), [x, W, bb]);
  a = rt([4, 3]); b = rt([4, 3]); const v3 = rt([3]), s1 = rt([1]);
  check("add 同形", () => nn.add(a, b), [a, b]); check("add 行广播", () => nn.add(a, v3), [a, v3]); check("add 向量在前", () => nn.add(v3, a), [v3, a]); check("add 标量广播", () => nn.add(a, s1), [a, s1]);
  check("sub 同形", () => nn.sub(a, b), [a, b]); check("sub 行广播", () => nn.sub(a, v3), [a, v3]); check("sub 向量在前", () => nn.sub(v3, a), [v3, a]);
  check("mul 同形", () => nn.mul(a, b), [a, b]); check("mul 行广播", () => nn.mul(a, v3), [a, v3]);
  check("scale", () => nn.scale(a, -2.5), [a]);
  const ak = rt([4, 5], { away: 0.05 });
  check("relu", () => nn.relu(ak), [ak], 1e-3); check("leakyRelu", () => nn.leakyRelu(ak, 0.1), [ak], 1e-3); check("leakyRelu 默认斜率", () => nn.leakyRelu(ak), [ak], 1e-3);
  check("tanh", () => nn.tanh(a), [a]); check("sigmoid", () => nn.sigmoid(a), [a]); check("gelu", () => nn.gelu(a), [a]); check("square", () => nn.square(a), [a]);
  const as = rt([3, 4], { scale: 0.5 }), apos = rt([3, 4], { away: 0.5, scale: 0.3 }); for (let i = 0; i < apos.size; i++) apos.data[i] = Math.abs(apos.data[i]);
  check("exp", () => nn.exp(as), [as]); check("log", () => nn.log(apos), [apos]);
  const t3 = rt([2, 3, 4]);
  check("sum 全部", () => nn.sum(a), [a]); check("sum axis 0", () => nn.sum(a, 0), [a]); check("sum axis 1（三维）", () => nn.sum(t3, 1), [t3]); check("mean 全部", () => nn.mean(t3), [t3]); check("mean axis -1", () => nn.mean(t3, -1), [t3]);
  const lg = rt([3, 5], { scale: 2 });
  check("softmax", () => nn.softmax(lg), [lg]); check("logSoftmax", () => nn.logSoftmax(lg), [lg]);
  const labs = new Int32Array([4, 0, 2]); check("crossEntropy", () => nn.crossEntropy(lg, labs), [lg]);
  const pr = rt([6, 1]), tg = rt([6, 1]); check("mse（张量目标，两边都有梯度）", () => nn.mse(pr, tg), [pr, tg]); check("mse（数组目标）", () => nn.mse(pr, [1, 2, 3, 4, 5, 6]), [pr]);
  const bl = rt([7], { scale: 3 }); check("bceLogits", () => nn.bceLogits(bl, [0, 1, 1, 0, 0.3, 1, 0]), [bl]);
  const tab = rt([4, 3]); check("embedding（重复下标的梯度相加）", () => nn.embedding(tab, new Int32Array([0, 2, 2, 1, 0, 2])), [tab]);
  const c1 = rt([3, 2]), c2 = rt([3, 4]), c3 = rt([3, 1]); check("concat axis 1", () => nn.concat([c1, c2, c3], 1), [c1, c2, c3]);
  const d1 = rt([2, 3]), d2 = rt([4, 3]); check("concat axis 0", () => nn.concat([d1, d2], 0), [d1, d2]);
  const rs = rt([2, 6]); check("reshape", () => nn.reshape(rs, [3, 4]), [rs]); check("transpose2d", () => nn.transpose2d(rs), [rs]);
  const cx = rt([2, 2, 5, 5]), cw = rt([3, 2, 3, 3]), cb = rt([3]);
  check("conv2d same", () => nn.conv2d(cx, cw, cb, { pad: "same" }), [cx, cw, cb]);
  check("conv2d circular", () => nn.conv2d(cx, cw, cb, { pad: "circular" }), [cx, cw, cb]);
  check("conv2d pad 0", () => nn.conv2d(cx, cw, cb, { pad: 0 }), [cx, cw, cb]);
  const cw5 = rt([2, 2, 5, 5], { scale: 0.5 }); check("conv2d 5×5、无偏置", () => nn.conv2d(cx, cw5, null, { pad: "same" }), [cx, cw5]);
  const cw1 = rt([4, 2, 1, 1]); check("conv2d 1×1", () => nn.conv2d(cx, cw1, cb.size === 3 ? null : null, { pad: 0 }), [cx, cw1]);
  const mp = nn.tensor(Array.from({ length: 2 * 2 * 4 * 4 }, (_, i) => ((i * 37) % 64) * 0.05 - 1.6), [2, 2, 4, 4], true);   // 各不相同、间隔 0.05：扰动不会改变最大值的位置
  check("maxPool2d", () => nn.maxPool2d(mp, 2), [mp], 1e-3);
  const gp = rt([2, 3, 4, 4]); check("avgPoolGlobal", () => nn.avgPoolGlobal(gp), [gp]);
  const dp = rt([5, 6]); check("dropout（固定掩码）", () => nn.dropout(dp, 0.4, new RNG(5, 5, 5), true), [dp]);
  const ln = rt([4, 6], { scale: 2, shift: 1 }), gam = rt([6], { shift: 1 }), bet = rt([6]);
  check("layerNorm", () => nn.layerNorm(ln, gam, bet), [ln, gam, bet]); check("layerNorm（无仿射）", () => nn.layerNorm(ln, null, null), [ln]);
  // 组合：一个小网络整体做梯度检验
  const rng = new RNG(9, 9, 9), mlp = new nn.MLP([3, 6, 6, 4], { act: "gelu", rng }), xin = rt([5, 3], { grad: false }), yl = new Int32Array([0, 3, 1, 1, 2]);
  ok(nn.gradcheck(() => nn.crossEntropy(mlp.forward(xin), yl), mlp.params(), 1e-2) < 2e-2, "梯度检验 MLP（gelu）+ 交叉熵，全部参数");
  const conv = new nn.Conv2d(1, 3, 3, rng, { pad: "circular" }), head = new nn.Linear(12, 2, rng), xi = rt([3, 1, 4, 4], { grad: false }), yi = new Int32Array([1, 0, 1]);
  const cnnLoss = () => nn.crossEntropy(head.forward(nn.flatten(nn.maxPool2d(nn.tanh(conv.forward(xi)), 2))), yi);
  ok(nn.gradcheck(cnnLoss, conv.params().concat(head.params()), 1e-3) < 2e-2, "梯度检验 卷积 → tanh → 池化 → 全连接 → 交叉熵");
  const emb = new nn.Embedding(5, 3, rng), lin = new nn.Linear(6, 5, rng), ia = new Int32Array([0, 4, 2]), ib = new Int32Array([1, 1, 3]);
  ok(nn.gradcheck(() => nn.crossEntropy(lin.forward(nn.concat([emb.forward(ia), emb.forward(ib)], 1)), new Int32Array([1, 0, 4])), emb.params().concat(lin.params()), 1e-2) < 2e-2, "梯度检验 嵌入 → 拼接 → 全连接");
  // gradcheck 本身能发现错的梯度：把一个运算的反向故意弄错
  const wrong = rt([4]); const bad = () => { const o = nn.square(wrong); const back = o._back; o._back = function (g) { back(g.map(v => v * 1.5)); }; return nn.sum(o); };
  ok(nn.gradcheck(bad, [wrong], 1e-2) > 0.2, "gradcheck 能抓到错误的梯度");
}

section("损失函数的数值");
{
  const L = nn.tensor([1, 2, 3, 0.5, -1, 2], [2, 3]), y = new Int32Array([2, 0]);
  const man = (Math.log(Math.exp(1) + Math.exp(2) + Math.exp(3)) - 3 + Math.log(Math.exp(0.5) + Math.exp(-1) + Math.exp(2)) - 0.5) / 2;
  near(nn.crossEntropy(L, y).data[0], man, 1e-6, "crossEntropy 等于手算");
  near(nn.crossEntropy(L, y).data[0], -(nn.logSoftmax(L).data[2] + nn.logSoftmax(L).data[3]) / 2, 1e-6, "crossEntropy = −平均 logSoftmax[标签]");
  const H = nn.tensor([1000, -1000, 0, -500, 500, 499], [2, 3], true), ce = nn.crossEntropy(H, new Int32Array([0, 2]));
  near(ce.data[0], (0 + 1 + Math.log(1 + Math.exp(-1))) / 2, 1e-5, "logits 上千也不溢出，值正确");
  ce.backward(); ok(Array.from(H.grad).every(Number.isFinite) && Math.abs(H.grad[4] - 0.5 * (1 / (1 + Math.exp(-1)))) < 1e-5, "巨大 logits 的梯度有限且正确");
  const sm = nn.softmax(H); ok(Math.abs(sm.data[0] - 1) < 1e-7 && Math.abs(sm.data[3] + sm.data[4] + sm.data[5] - 1) < 1e-6, "softmax 对巨大输入稳定，每行和为 1");
  near(nn.mse(nn.tensor([1, 2, 3]), [0, 2, 5]).data[0], 5 / 3, 1e-6, "mse");
  const bce = nn.bceLogits(nn.tensor([100, -100, 50, 0]), [1, 0, 0, 1]);
  near(bce.data[0], (0 + 0 + 50 + Math.log(2)) / 4, 1e-5, "bceLogits 对 ±100 稳定，值正确");
}

section("优化器");
{
  // Adam：与双精度手算逐步对照（三步，梯度每步都在变，检验偏差修正）
  const c = [1, 3, 0.5], p = nn.tensor([0.5, -1, 2], [3], true), ct = nn.tensor(c), opt = nn.adam([p], { lr: 0.1 });
  let ref = [0.5, -1, 2], m = [0, 0, 0], v = [0, 0, 0];
  for (let t = 1; t <= 3; t++) {
    opt.zeroGrad(); nn.sum(nn.mul(nn.square(p), ct)).backward(); opt.step();
    for (let i = 0; i < 3; i++) { const g = 2 * c[i] * ref[i]; m[i] = 0.9 * m[i] + 0.1 * g; v[i] = 0.999 * v[i] + 0.001 * g * g; const mh = m[i] / (1 - Math.pow(0.9, t)), vh = v[i] / (1 - Math.pow(0.999, t)); ref[i] = Math.fround(ref[i] - 0.1 * mh / (Math.sqrt(vh) + 1e-8)); }
  }
  ok(maxDiff(p.data, ref) < 1e-6 && opt.t === 3, "Adam 三步与手算一致", Array.from(p.data).map(x => x.toFixed(6)).join(","));
  // 解耦的权重衰减：梯度为 0 时 θ 恰好乘以 (1 − lr·wd)
  const q = nn.tensor([2, -4], [2], true), ow = nn.adam([q], { lr: 0.1, weightDecay: 0.5 }); q.grad = new Float32Array(2); ow.step();
  ok(Math.abs(q.data[0] - 2 * 0.95) < 1e-6 && Math.abs(q.data[1] + 4 * 0.95) < 1e-6, "AdamW：零梯度时 θ ← θ(1 − lr·wd)");
  // 解耦的另一面：把损失放大 1000 倍，更新完全不变（衰减不经过自适应分母）；耦合的 L2 则会变
  // 损失取线性项 scale·Σkθ：梯度方向与尺度无关；耦合的 L2 加在梯度上，放大损失后某些分量的梯度会变号
  function adamRun(scaleLoss, coupled) {
    const w = nn.tensor([1, -2, 0.5], [3], true), o = nn.adam([w], { lr: 0.05, weightDecay: coupled ? 0 : 0.1 }), k = nn.tensor([-0.05, 0.1, 0.02]);
    for (let s = 0; s < 5; s++) { o.zeroGrad(); let L = nn.scale(nn.sum(nn.mul(w, k)), scaleLoss); if (coupled) L = nn.add(L, nn.scale(nn.sum(nn.square(w)), 0.1)); L.backward(); o.step(); }
    return w.data;
  }
  ok(maxDiff(adamRun(1, false), adamRun(1000, false)) < 1e-5, "AdamW 的衰减与损失的尺度无关");
  ok(maxDiff(adamRun(1, true), adamRun(1000, true)) > 0.1, "对照：耦合的 L2（加进损失）会随损失尺度改变");
  const nd = nn.tensor([3], [1], true); nd.noDecay = true; const on = nn.adam([nd], { lr: 0.1, weightDecay: 1 }); nd.grad = new Float32Array(1); on.step();
  ok(nd.data[0] === 3, "noDecay 的参数不衰减");
  // SGD + 动量：v ← μv + g，θ ← θ − lr·v
  const s = nn.tensor([1], [1], true), os = nn.sgd([s], { lr: 0.1, momentum: 0.9 });
  os.zeroGrad(); nn.scale(nn.sum(s), 2).backward(); os.step(); const s1 = s.data[0];
  os.zeroGrad(); nn.scale(nn.sum(s), 2).backward(); os.step();
  ok(Math.abs(s1 - 0.8) < 1e-6 && Math.abs(s.data[0] - 0.42) < 1e-6, "SGD 动量两步与手算一致", s1 + " " + s.data[0]);
  os.lr = 0; os.zeroGrad(); nn.scale(nn.sum(s), 2).backward(); const before = s.data[0]; os.step(); ok(s.data[0] === before, "学习率可以随时改（lr = 0 不动）");
  const cg = nn.tensor([3, 4], [2], true); cg.grad = new Float32Array([3, 4]); const nrm = nn.clipGradNorm([cg], 1);
  ok(nrm === 5 && Math.abs(Math.hypot(cg.grad[0], cg.grad[1]) - 1) < 1e-6, "clipGradNorm");
}

section("dropout 与 layerNorm");
{
  const a = nn.ones([20000], true), d = nn.dropout(a, 0.3, new RNG(7, 7, 7), true);
  let zeros = 0, s = 0, kept = true; for (const v of d.data) { s += v; if (v === 0) zeros++; else if (Math.abs(v - 1 / 0.7) > 1e-6) kept = false; }
  near(s / d.size, 1, 0.02, "dropout：期望不变（反向缩放）"); near(zeros / d.size, 0.3, 0.015, "dropout：丢弃比例 ≈ p"); ok(kept, "留下的元素乘 1/(1−p)");
  nn.sum(d).backward(); ok(maxDiff(a.grad, d.data) < 1e-6, "dropout 的梯度就是掩码");
  ok(nn.dropout(a, 0.3, new RNG(1, 1, 1), false) === a && nn.noGrad(() => nn.dropout(a, 0.3, new RNG(1, 1, 1))) === a, "预测时（training = false 或在 noGrad 里）原样返回");
  const r1 = nn.dropout(a, 0.5, new RNG(3, 3, 3), true), r2 = nn.dropout(a, 0.5, new RNG(3, 3, 3), true); ok(maxDiff(r1.data, r2.data) === 0, "同一个种子得到同一个掩码");
  const x = rt([5, 8], { scale: 3, shift: 2 }), y = nn.layerNorm(x, null, null); let worstM = 0, worstV = 0;
  for (let i = 0; i < 5; i++) { let m = 0, v = 0; for (let j = 0; j < 8; j++) m += y.data[i * 8 + j]; m /= 8; for (let j = 0; j < 8; j++) v += (y.data[i * 8 + j] - m) ** 2; v /= 8; worstM = Math.max(worstM, Math.abs(m)); worstV = Math.max(worstV, Math.abs(v - 1)); }
  ok(worstM < 1e-5 && worstV < 1e-3, "layerNorm：每行均值 0、方差 1", worstM.toExponential(1) + " " + worstV.toExponential(1));
  const gm = rt([8], { grad: false }), bt = rt([8], { grad: false }), z = nn.layerNorm(x, gm, bt);
  ok(maxDiff(z.data, Array.from(y.data, (v, i) => gm.data[i % 8] * v + bt.data[i % 8])) < 1e-5, "layerNorm：再乘 gamma 加 beta");
}

section("工具与 nn.la");
{
  const bs = nn.batches(103, 25, new RNG(1, 2, 3)), seen = new Uint8Array(103); let cnt = 0;
  for (const b of bs) for (const i of b) { seen[i]++; cnt++; }
  ok(bs.length === 5 && bs[4].length === 3 && bs[0] instanceof Int32Array && cnt === 103 && seen.every(v => v === 1), "batches：每个下标恰好一次，最后一批不满也保留");
  ok(Array.from(nn.batches(103, 25, new RNG(1, 2, 3))[2]).join() === Array.from(bs[2]).join() && Array.from(bs[0]).join() !== Array.from(nn.batches(103, 25, new RNG(2, 2, 3))[0]).join(), "batches：同种子同顺序，换种子换顺序");
  ok(Array.from(nn.batches(5, 2)[1]).join() === "2,3", "batches：不给 rng 按原顺序");
  const mlp = new nn.MLP([4, 8, 3], { rng: new RNG(1, 1, 1) }); ok(nn.numParams(mlp.params()) === 4 * 8 + 8 + 8 * 3 + 3, "numParams");
  const X = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), fr = nn.fromRows(X, 3, new Int32Array([2, 0]));
  ok(fr.shape.join() === "2,3" && Array.from(fr.data).join() === "7,8,9,1,2,3" && nn.fromRows(X, 3).shape.join() === "3,3", "fromRows");
  throws(() => nn.fromRows(X, 3, [3]), /fromRows：行号 3 超出范围/, "fromRows 越界报错");
  ok(Array.from(nn.pick(new Int32Array([5, 6, 7]), [2, 0])).join() === "7,5" && nn.pick(new Int32Array(3), [0]) instanceof Int32Array, "pick");
  const sv = nn.saveParams(mlp.params()); mlp.layers[0].W.data[0] += 1; nn.loadParams(mlp.params(), sv); ok(mlp.layers[0].W.data[0] === sv[0][0], "saveParams / loadParams");
  ok(Array.from(la.matmul([1, 2, 3, 4, 5, 6], [1, 0, 0, 1, 1, 1], 2, 3, 2)).join() === "4,5,10,11", "la.matmul");
  const A = new Float64Array([4, 2, 0.6, 2, 5, 1, 0.6, 1, 3]), Lc = la.chol(A, 3), LLt = la.matmul(Lc, Array.from({ length: 9 }, (_, i) => Lc[(i % 3) * 3 + Math.floor(i / 3)]), 3, 3, 3);
  ok(maxDiff(LLt, A) < 1e-12 && Lc[1] === 0 && Lc[2] === 0, "la.chol：L Lᵀ = A，L 是下三角");
  const xs = la.solve(A, [1, 2, 3], 3), Ax = la.matmul(A, xs, 3, 3, 1); ok(maxDiff(Ax, [1, 2, 3]) < 1e-12, "la.solve");
  const X2 = la.solve(A, [1, 0, 0, 1, 0, 0], 3), AX = la.matmul(A, X2, 3, 3, 2); ok(maxDiff(AX, [1, 0, 0, 1, 0, 0]) < 1e-12, "la.solve 多个右端");
  throws(() => la.chol([1, 2, 2, 1], 2), /chol：矩阵不是正定的/, "chol 对非正定矩阵报错");
  const E = la.eigh([2, 1, 0, 1, 2, 0, 0, 0, 5], 3);
  ok(maxDiff(E.values, [5, 3, 1]) < 1e-12 && Math.abs(Math.abs(E.vectors[3] * E.vectors[4]) - 0.5) < 1e-12, "la.eigh：特征值从大到小，特征向量正确");
  // PCA：二维里沿 (3,4)/5 方向拉长的高斯云
  const g = new RNG(4, 4, 4), n = 2000, P = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) { const s = 5 * g.normal(), t = g.normal(); P[i * 3] = 10 + 0.6 * s - 0.8 * t; P[i * 3 + 1] = -3 + 0.8 * s + 0.6 * t; P[i * 3 + 2] = 0.1 * g.normal(); }
  const pc = la.pca(P, n, 3, 2);
  ok(Math.abs(pc.components[0] - 0.6) < 0.01 && Math.abs(pc.components[1] - 0.8) < 0.01, "PCA 找到主方向 (0.6, 0.8)", Array.from(pc.components.subarray(0, 3)).map(v => v.toFixed(3)).join(","));
  near(pc.explained[0], 25 / 26.01, 0.01, "PCA 解释方差比例"); near(pc.mean[0], 10, 0.2, "PCA 均值");
  let sv1 = 0; for (let i = 0; i < n; i++) sv1 += pc.scores[i * 2] ** 2; near(sv1 / (n - 1), pc.variance[0], 1e-6 * pc.variance[0], "PCA 得分的方差 = 主成分方差");
  // n < d：走 Gram 矩阵；d > 160：走子空间迭代。三条路给出同样的主方向
  const d = 200, m = 300, Y = new Float64Array(m * d), u1 = new Float64Array(d), u2 = new Float64Array(d);
  for (let j = 0; j < d; j++) { u1[j] = Math.cos(2 * Math.PI * 3 * j / d); u2[j] = Math.sin(2 * Math.PI * 5 * j / d); }
  for (let i = 0; i < m; i++) { const s = 3 * g.normal(), t = 1.5 * g.normal(); for (let j = 0; j < d; j++) Y[i * d + j] = s * u1[j] + t * u2[j] + 0.05 * g.normal(); }
  // 对照：同一份数据的协方差矩阵直接做完整的 Jacobi 分解
  function refEig(rows) {
    const mu = new Float64Array(d), C = new Float64Array(d * d);
    for (let i = 0; i < rows; i++) for (let j = 0; j < d; j++) mu[j] += Y[i * d + j] / rows;
    for (let i = 0; i < rows; i++) for (let a = 0; a < d; a++) { const xa = Y[i * d + a] - mu[a]; for (let b = 0; b < d; b++) C[a * d + b] += xa * (Y[i * d + b] - mu[b]) / (rows - 1); }
    return la.eigh(C, d);
  }
  const cosv = (c, u) => { let s = 0, nu = 0, nc = 0; for (let j = 0; j < d; j++) { s += c[j] * u[j]; nu += u[j] * u[j]; nc += c[j] * c[j]; } return Math.abs(s) / Math.sqrt(nu * nc); };
  const sameAsRef = (res, ref) => cosv(res.components.subarray(0, d), ref.vectors.subarray(0, d)) > 0.99999 && cosv(res.components.subarray(d, 2 * d), ref.vectors.subarray(d, 2 * d)) > 0.99999 && Math.abs(res.variance[0] / ref.values[0] - 1) < 1e-8 && Math.abs(res.variance[1] / ref.values[1] - 1) < 1e-8;
  const big = la.pca(Y, m, d, 2), gram = la.pca(Y, 120, d, 2);
  ok(sameAsRef(big, refEig(m)), "PCA（d = 200，子空间迭代）与完整的 Jacobi 分解一致");
  ok(sameAsRef(gram, refEig(120)), "PCA（n < d，Gram 矩阵）与完整的 Jacobi 分解一致");
  ok(cosv(big.components.subarray(0, d), u1) > 0.98 && cosv(big.components.subarray(d, 2 * d), u2) > 0.98, "PCA 的主方向接近生成数据的方向");
  // DFT：cos(2π·3t/n) 的能量全在频率 3 和 n−3；Parseval
  const N = 64, xs2 = new Float64Array(N); for (let t = 0; t < N; t++) xs2[t] = Math.cos(2 * Math.PI * 3 * t / N) + 0.5 * Math.sin(2 * Math.PI * 7 * t / N);
  const F = la.dft(xs2);
  ok(Math.abs(F.re[3] - N / 2) < 1e-9 && Math.abs(F.im[7] + N / 4) < 1e-9 && Math.abs(F.power[N - 3] - F.power[3]) < 1e-9 && Math.abs(F.power[5]) < 1e-18, "DFT：频率位置与相位");
  let e1 = 0, e2 = 0; for (let t = 0; t < N; t++) { e1 += xs2[t] ** 2; e2 += F.power[t]; } near(e2 / N, e1, 1e-9, "DFT：Parseval 恒等式");
}

section("自包含：只用 QL 和标准 JavaScript（与后台线程同样的拼法）");
{
  const src = fs.readFileSync(path.join(__dirname, "../src/ml/nn.js"), "utf8"), lines = src.split("\n");
  ok(lines[0] === "// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。" && lines[1] === "// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。", "版权声明在头两行");
  ok(!/Math\.random/.test(src), "不用 Math.random");
  ok(!/=>|\blet\s|\bconst\s|`/.test(INSTALL.toString()), "ES5 风格（没有箭头函数、let、const、模板字符串）");
  // 新的上下文里没有 require / module / process，也没有本文件的任何变量
  const ctx = vm.createContext({ QL: { RNG: QL.RNG } });
  const script = "var nn = (" + INSTALL.toString() + ")(QL);" +
    "var rng = new QL.RNG(1, 2, 3), m = new nn.MLP([2, 8, 2], { act: 'tanh', rng: rng }), opt = nn.adam(m.params(), { lr: 0.05, weightDecay: 0.01 });" +
    "var X = nn.tensor([0, 0, 0, 1, 1, 0, 1, 1], [4, 2]), y = new Int32Array([0, 1, 1, 0]), L;" +
    "for (var s = 0; s < 300; s++) { opt.zeroGrad(); L = nn.crossEntropy(m.forward(X), y); L.backward(); opt.step(); }" +
    "var cv = new nn.Conv2d(1, 2, 3, rng, { pad: 'circular' }), img = nn.tensor(new Float32Array(32), [2, 1, 4, 4]);" +
    "var o = nn.sum(nn.avgPoolGlobal(nn.maxPool2d(nn.relu(cv.forward(img)), 2))); o.backward();" +
    "var e = new nn.Embedding(5, 3, rng), ln = nn.layerNorm(nn.dropout(e.forward([1, 2]), 0.2, rng, true), nn.param([3], 'ones'), nn.param([3], 'zeros'));" +
    "nn.sum(ln).backward(); var sg = nn.sgd(e.params(), { lr: 0.1, momentum: 0.9 }); sg.step();" +
    "var pc = nn.la.pca(new Float64Array([1, 2, 2, 4.1, 3, 6.2, 4, 7.9]), 4, 2, 1), f = nn.la.dft([1, 0, -1, 0]);" +
    "var gc = nn.gradcheck(function () { return nn.sum(nn.gelu(nn.linear(X, m.layers[0].W, m.layers[0].b))); }, m.layers[0].params(), 1e-2);" +
    "result = { loss: L.data[0], pc: pc.explained[0], f: f.power[1], gc: gc, batches: nn.batches(10, 3, rng).length, solve: nn.la.solve([2, 0, 0, 2], [2, 4], 2)[1] };";
  let res = null, err = null; try { vm.runInContext(script, ctx); res = ctx.result; } catch (e) { err = e; }
  ok(res && res.loss < 0.05 && res.pc > 0.99 && res.f === 4 && res.gc < 2e-2 && res.batches === 4 && Math.abs(res.solve - 2) < 1e-12, "在只有 QL 的新环境里训练、卷积、PCA、DFT、梯度检验都能跑", err ? err.message : JSON.stringify(res));
  ok(typeof require === "function" && vm.runInContext("typeof require + typeof module + typeof process", ctx) === "undefinedundefinedundefined", "新环境里确实没有 Node 的全局变量");
}

section("训练：真的能学会");
{
  // (a) XOR
  const rng = new RNG(11, 1, 1), m = new nn.MLP([2, 16, 2], { act: "tanh", rng }), opt = nn.adam(m.params(), { lr: 0.05 });
  const X = nn.tensor([0, 0, 0, 1, 1, 0, 1, 1], [4, 2]), y = new Int32Array([0, 1, 1, 0]);
  for (let s = 0; s < 300; s++) { opt.zeroGrad(); nn.crossEntropy(m.forward(X), y).backward(); opt.step(); }
  ok(accOf(nn.noGrad(() => m.forward(X)), y) === 1, "XOR：训练集 100%");
}
function moons(n, noise, rng) {
  const X = new Float64Array(n * 2), y = new Int32Array(n);
  for (let i = 0; i < n; i++) { const c = i % 2, t = Math.PI * rng.u(); y[i] = c; X[i * 2] = (c ? 1 - Math.cos(t) : Math.cos(t)) + noise * rng.normal(); X[i * 2 + 1] = (c ? 0.5 - Math.sin(t) : Math.sin(t)) + noise * rng.normal(); }
  return { X, y, n };
}
function trainMoons(seed, steps) {
  const rng = new RNG(seed, 2, 2), D = moons(400, 0.12, rng), m = new nn.MLP([2, 32, 32, 2], { act: "relu", rng }), opt = nn.adam(m.params(), { lr: 0.01 });
  let L = null;
  for (let ep = 0; ep < steps; ep++) for (const idx of nn.batches(D.n, 64, rng)) { opt.zeroGrad(); L = nn.crossEntropy(m.forward(nn.fromRows(D.X, 2, idx)), nn.pick(D.y, idx)); L.backward(); opt.step(); }
  return { loss: L.data[0], acc: accOf(nn.noGrad(() => m.forward(nn.fromRows(D.X, 2))), D.y), W: m.layers[1].W.data };
}
{
  // (b) 两个半月：小批量
  const r = trainMoons(5, 60);
  ok(r.acc > 0.95, "两个半月：MLP 训练集准确率 > 95%", (100 * r.acc).toFixed(1) + "%");
  // (e) 可复现：同一个种子逐位相同；换种子不同
  const r2 = trainMoons(5, 60), r3 = trainMoons(6, 60);
  ok(r2.loss === r.loss && maxDiff(r2.W, r.W) === 0, "同一个种子：最终损失与权重逐位相同", String(r.loss));
  ok(r3.loss !== r.loss, "换一个种子：结果不同");
}
{
  // (c) 小卷积网络分辨横条与竖条（8×8，带噪声，条的位置和长度随机）
  const rng = new RNG(21, 3, 3), n = 240, H = 8, X = new Float32Array(n * H * H), y = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const vert = i % 2, pos = rng.int(H), len = 4 + rng.int(5), st = rng.int(H - len + 1); y[i] = vert;
    for (let p = 0; p < H * H; p++) X[i * H * H + p] = 0.3 * rng.normal();
    for (let l = st; l < st + len; l++) X[i * H * H + (vert ? l * H + pos : pos * H + l)] += 1;
  }
  const xt = nn.tensor(X, [n, 1, H, H]), c1 = new nn.Conv2d(1, 6, 3, rng), c2 = new nn.Conv2d(6, 6, 3, rng), head = new nn.Linear(6, 2, rng);
  const fwd = x => head.forward(nn.avgPoolGlobal(nn.relu(c2.forward(nn.maxPool2d(nn.relu(c1.forward(x)), 2)))));
  const opt = nn.adam(c1.params().concat(c2.params(), head.params()), { lr: 0.02 });
  for (let s = 0; s < 120; s++) { opt.zeroGrad(); nn.crossEntropy(fwd(xt), y).backward(); opt.step(); }
  const acc = accOf(nn.noGrad(() => fwd(xt)), y);
  ok(acc > 0.95, "卷积网络：横条 vs 竖条 > 95%", (100 * acc).toFixed(1) + "%");
}
{
  // (d) 模加法 a + b mod 23：一半做训练，AdamW（wd = 1）。训练集很快背下来；测试集准确率先跌到 0 附近，再慢慢爬（grokking）
  const Pm = 23, N = Pm * Pm, rng = new RNG(1, 1, 1), perm = nn.batches(N, N, rng)[0], ntr = Math.floor(N / 2);
  const A = new Int32Array(N), B = new Int32Array(N), Y = new Int32Array(N);
  for (let i = 0; i < N; i++) { A[i] = Math.floor(perm[i] / Pm); B[i] = perm[i] % Pm; Y[i] = (A[i] + B[i]) % Pm; }
  const tr = { a: A.slice(0, ntr), b: B.slice(0, ntr), y: Y.slice(0, ntr) }, te = { a: A.slice(ntr), b: B.slice(ntr), y: Y.slice(ntr) };
  const emb = new nn.Embedding(Pm, 32, rng, 0.3), mlp = new nn.MLP([64, 128, Pm], { act: "relu", rng });
  const opt = nn.adam(emb.params().concat(mlp.params()), { lr: 1e-2, weightDecay: 1.0, beta2: 0.98 });
  const fwd = d => mlp.forward(nn.concat([emb.forward(d.a), emb.forward(d.b)], 1)), acc = d => accOf(nn.noGrad(() => fwd(d)), d.y);
  const t0 = Date.now(), hist = []; let hit = -1, s = 0;
  for (s = 1; s <= 1500 && Date.now() - t0 < 20000; s++) {
    opt.zeroGrad(); nn.crossEntropy(fwd(tr), tr.y).backward(); opt.step();
    if (s % 250 === 0) { const a1 = acc(tr), a2 = acc(te); if (hit < 0 && a1 === 1) hit = s; hist.push(s + "步 " + (100 * a1).toFixed(0) + "%/" + (100 * a2).toFixed(0) + "%"); }
  }
  console.log("   模加法（训练/测试准确率）：" + hist.join("  ") + "   用时 " + (Date.now() - t0) + " ms");
  ok(acc(tr) > 0.99, "模加法：训练集准确率 ≈ 100%", (100 * acc(tr)).toFixed(1) + "%，第 " + hit + " 步首次 100%");
  ok(true, "模加法：测试集准确率（只报告，不要求 grokking）", (100 * acc(te)).toFixed(1) + "%");
}

section("速度（2 核共享 CPU，只报告，宽松的上限只防止退化）");
{
  const rng = new RNG(1, 2, 3), n = 128, X = new Float64Array(n * 784); for (let i = 0; i < X.length; i++) X[i] = rng.normal();
  const y = new Int32Array(n); for (let i = 0; i < n; i++) y[i] = rng.int(10);
  const mlp = new nn.MLP([784, 128, 10], { rng }), opt = nn.adam(mlp.params(), { lr: 1e-3 }), x = nn.fromRows(X, 784);
  const step = () => { opt.zeroGrad(); nn.crossEntropy(mlp.forward(x), y).backward(); opt.step(); };
  const time = (f, R) => { for (let i = 0; i < 5; i++) f(); const t0 = process.hrtime.bigint(); for (let i = 0; i < R; i++) f(); return Number(process.hrtime.bigint() - t0) / 1e6 / R; };
  const ms = time(step, 30);
  for (let i = 0; i < X.length; i++) if (i % 5) X[i] = 0;    // 像 MNIST 一样八成是 0
  const xs = nn.fromRows(X, 784), msSparse = time(() => { opt.zeroGrad(); nn.crossEntropy(mlp.forward(xs), y).backward(); opt.step(); }, 30);
  const m2 = new nn.MLP([128, 128, 10], { rng }), o2 = nn.adam(m2.params()), x2 = rt([128, 128], { grad: false });
  const ms2 = time(() => { o2.zeroGrad(); nn.crossEntropy(m2.forward(x2), y).backward(); o2.step(); }, 50);
  const xc = rt([64, 1, 16, 16], { grad: false }), conv = new nn.Conv2d(1, 8, 3, rng);
  const msc = time(() => { conv.w.zeroGrad(); conv.b.zeroGrad(); nn.sum(conv.forward(xc)).backward(); }, 30);
  const xc2 = rt([64, 8, 16, 16]), conv2 = new nn.Conv2d(8, 8, 3, rng);
  const msc2 = time(() => { conv2.w.zeroGrad(); nn.sum(conv2.forward(xc2)).backward(); }, 10);
  console.log(`   MLP 784→128→10，batch 128，一步前向+反向+Adam：稠密输入 ${ms.toFixed(1)} ms，八成为 0 的输入 ${msSparse.toFixed(1)} ms；128→128→10：${ms2.toFixed(2)} ms`);
  console.log(`   conv2d [64,1,16,16] → 8 通道 3×3，前向+反向：${msc.toFixed(2)} ms；[64,8,16,16] → 8 通道（含输入梯度）：${msc2.toFixed(1)} ms`);
  ok(ms < 60 && ms2 < 15 && msc < 30, "速度没有明显退化", ms.toFixed(1) + " / " + ms2.toFixed(2) + " / " + msc.toFixed(2) + " ms");
}

console.log("\n   总用时 " + ((Date.now() - T_START) / 1000).toFixed(1) + " s");
done();
