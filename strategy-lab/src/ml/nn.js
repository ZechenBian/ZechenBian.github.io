// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 策略实验室 · 机器学习实验室 · 自动求导小库 QL.nn
 * 反向模式自动求导：每个运算记下父节点和一个反向闭包；backward() 从损失出发做拓扑排序，
 * 逆序调用闭包，梯度一律累加（+=）。算完立刻拆掉中间的计算图，长时间训练也不会越积越多。
 * 这个函数会被 toString() 拼进后台线程，所以必须自包含：只用参数 QL 和标准 JavaScript。
 * 数据一律是 Float32Array（按行展开）；归约在双精度里做，最后才存回单精度。 */
function QL_MLNN_INSTALL(QL) {
"use strict";
var nn = {};
var gradOn = true;      // noGrad 里为 false：新算出来的张量不记录计算图
var markSeq = 0;        // 拓扑排序用的访问标记，每次 backward 换一个号，省得清标记
var defRng = null;      // 没传 rng 时共用的一条流：各层各取一段，避免两层初始化得一模一样

function prod(s) { var p = 1; for (var i = 0; i < s.length; i++) p *= s[i]; return p; }
function sstr(s) { return "[" + s.join(",") + "]"; }
function getRng(rng) {
  if (rng) return rng;
  if (!defRng) { if (!QL || !QL.RNG) throw new Error("nn：需要随机数生成器 rng"); defRng = new QL.RNG(20261021, 91, 7); }
  return defRng;
}

/* ================================================================== *
 *  一、张量与计算图
 * ================================================================== */
function Tensor(data, shape, requiresGrad) {
  this.data = data;
  this.shape = shape;
  this.size = data.length;
  this.grad = null;
  this.requiresGrad = !!requiresGrad;
  this._parents = null;
  this._back = null;
  this._mark = 0;
}
Tensor.prototype.zeroGrad = function () { if (this.grad) this.grad.fill(0); return this; };
Tensor.prototype.item = function () { return this.data[0]; };
/** 反向传播。只对标量调用；非标量要传同样大小的 seed（上游梯度）。
 *  中间结果的梯度和计算图用完即弃，叶子（参数、requiresGrad 的输入）的梯度保留并累加。
 *  同一张图只能 backward 一次：多个损失请先 nn.add 起来。 */
Tensor.prototype.backward = function (seed) {
  if (!this.requiresGrad) throw new Error("backward：这个张量不需要梯度（它是在 noGrad 里算的，或者不依赖任何参数）");
  var i, g = G(this);
  if (seed == null) {
    if (this.size !== 1) throw new Error("backward：只能对标量调用，当前形状 " + sstr(this.shape) + "（先用 nn.sum 或 nn.mean）");
    g[0] += 1;
  } else {
    if (seed.length !== this.size) throw new Error("backward：seed 的长度 " + seed.length + " 与张量大小 " + this.size + " 不符");
    for (i = 0; i < this.size; i++) g[i] += seed[i];
  }
  if (!this._back) return;    // 叶子本身
  // 迭代的深度优先后序：父节点排在用到它的节点前面；递归会在很深的图上爆栈
  var mark = ++markSeq, order = [], st = [this], it = [0];
  this._mark = mark;
  while (st.length) {
    var top = st.length - 1, t = st[top], k = it[top], ps = t._parents;
    if (ps && k < ps.length) {
      it[top] = k + 1;
      var p = ps[k];
      if (p && p._back && p._mark !== mark) { p._mark = mark; st.push(p); it.push(0); }
    } else { st.pop(); it.pop(); order.push(t); }
  }
  for (i = order.length - 1; i >= 0; i--) {
    var nd = order[i];
    if (nd.grad) nd._back(nd.grad);
    nd._back = null; nd._parents = null; nd.grad = null;   // 拆图：闭包里抓着的中间数组随之可回收
  }
};
nn.Tensor = Tensor;
nn.isTensor = function (x) { return x instanceof Tensor; };

/** 梯度缓冲区按需分配 */
function G(t) { return t.grad || (t.grad = new Float32Array(t.size)); }
/** 新节点：只要有一个父节点需要梯度、且不在 noGrad 里，就记录计算图 */
function make(data, shape, parents, back) {
  var t = new Tensor(data, shape, false);
  if (gradOn) for (var i = 0; i < parents.length; i++) if (parents[i] && parents[i].requiresGrad) { t.requiresGrad = true; t._parents = parents; t._back = back; break; }
  return t;
}
function need(x, name) { if (!(x instanceof Tensor)) throw new Error(name + "：参数必须是张量（nn.tensor 构造）"); }
nn.noGrad = function (fn) {
  var old = gradOn; gradOn = false;
  try { return fn(); } finally { gradOn = old; }
};
nn.gradEnabled = function () { return gradOn; };

/* ---------- 构造 ---------- */
function toF32(data) {
  if (data instanceof Float32Array) return new Float32Array(data);
  var n = data.length, out = new Float32Array(n);
  for (var i = 0; i < n; i++) out[i] = data[i];
  return out;
}
function checkShape(shape, n, name) {
  for (var i = 0; i < shape.length; i++) if (!(shape[i] >= 1) || shape[i] !== Math.floor(shape[i])) throw new Error(name + "：形状 " + sstr(shape) + " 不合法");
  if (prod(shape) !== n) throw new Error(name + "：数据长度 " + n + " 与形状 " + sstr(shape) + " 不符");
}
/** 从数组构造（总是复制一份）；shape 省略时是一维 */
nn.tensor = function (data, shape, requiresGrad) {
  var d = toF32(data); shape = shape ? shape.slice() : [d.length];
  checkShape(shape, d.length, "tensor");
  return new Tensor(d, shape, requiresGrad);
};
nn.zeros = function (shape, requiresGrad) { var n = prod(shape); checkShape(shape, n, "zeros"); return new Tensor(new Float32Array(n), shape.slice(), requiresGrad); };
nn.ones = function (shape, requiresGrad) { var t = nn.zeros(shape, requiresGrad); t.data.fill(1); return t; };
/** 可训练参数。init："he"（ReLU 类，std = √(2/fanIn)）| "xavier"（std = √(2/(fanIn+fanOut))）| "zeros" | "ones" | 数字 = 标准差。
 *  fanIn：二维 [in,out] 取 shape[0]；卷积核 [O,C,kh,kw] 取 C·kh·kw */
nn.param = function (shape, init, rng) {
  var n = prod(shape), d = new Float32Array(n), fanIn, fanOut, sd = 0, i;
  checkShape(shape, n, "param");
  if (shape.length === 4) { fanIn = shape[1] * shape[2] * shape[3]; fanOut = shape[0] * shape[2] * shape[3]; }
  else if (shape.length >= 2) { fanIn = shape[0]; fanOut = n / shape[0]; }
  else { fanIn = n; fanOut = n; }
  if (init == null) init = "he";
  if (init === "he") sd = Math.sqrt(2 / fanIn);
  else if (init === "xavier") sd = Math.sqrt(2 / (fanIn + fanOut));
  else if (init === "ones") d.fill(1);
  else if (typeof init === "number") sd = init;
  else if (init !== "zeros") throw new Error("param：不认识的初始化方式 " + init + "（可选 he、xavier、zeros、ones 或标准差数字）");
  if (sd > 0) { var r = getRng(rng); for (i = 0; i < n; i++) d[i] = sd * r.normal(); }
  return new Tensor(d, shape.slice(), true);
};
/** 从按行展开的 Float64Array 里取若干行组成一批 [idx.length, d]；idx 省略时取全部 */
nn.fromRows = function (X, d, idx) {
  var n = idx ? idx.length : Math.floor(X.length / d), out = new Float32Array(n * d), i, j;
  for (i = 0; i < n; i++) {
    var src = (idx ? idx[i] : i) * d, dst = i * d;
    if (!(src >= 0 && src + d <= X.length)) throw new Error("fromRows：行号 " + (idx ? idx[i] : i) + " 超出范围（共 " + Math.floor(X.length / d) + " 行）");
    for (j = 0; j < d; j++) out[dst + j] = X[src + j];
  }
  return new Tensor(out, [n, d], false);
};
/** 按下标取元素（标签取一批），返回同类型的数组 */
nn.pick = function (a, idx) {
  var C = a.constructor, out = new C(idx.length);
  for (var i = 0; i < idx.length; i++) out[i] = a[idx[i]];
  return out;
};

/* ================================================================== *
 *  二、矩阵乘法内核（热点）
 *  主力是"点积形式" C += A·Btᵀ：两个操作数都按行连续读，4×4 分块让每读一个数做四次乘加，
 *  累加在双精度的局部变量里；在 V8 上比朴素的 i-k-j 快约 3 倍（i-k-j 每次乘加都要读写一次 C）。
 *  输入七成以上是 0 时（one-hot、MNIST 这类）改走 i-k-j 并跳过 0，省掉的乘法更多。
 *  这些内核都是独立的函数：循环变量不被闭包捕获，才能留在寄存器里。
 * ================================================================== */
/** C[n×M] += A[n×L]·Bt[M×L]ᵀ；三个矩阵各自从 ao、bo、co 开始（卷积按样本取一段时不用建 subarray 视图，视图会慢两成多） */
function mmNTo(A, ao, Bt, bo, C, co, n, L, M) {
  var i = 0, j, k, r, a0, a1, a2, a3, b0, b1, b2, b3, x, y0, y1, y2, y3;
  var s00, s01, s02, s03, s10, s11, s12, s13, s20, s21, s22, s23, s30, s31, s32, s33;
  for (; i + 3 < n; i += 4) {
    a0 = ao + i * L; a1 = a0 + L; a2 = a1 + L; a3 = a2 + L;
    for (j = 0; j + 3 < M; j += 4) {
      b0 = bo + j * L; b1 = b0 + L; b2 = b1 + L; b3 = b2 + L;
      s00 = 0; s01 = 0; s02 = 0; s03 = 0; s10 = 0; s11 = 0; s12 = 0; s13 = 0;
      s20 = 0; s21 = 0; s22 = 0; s23 = 0; s30 = 0; s31 = 0; s32 = 0; s33 = 0;
      for (k = 0; k < L; k++) {
        y0 = Bt[b0 + k]; y1 = Bt[b1 + k]; y2 = Bt[b2 + k]; y3 = Bt[b3 + k];
        x = A[a0 + k]; s00 += x * y0; s01 += x * y1; s02 += x * y2; s03 += x * y3;
        x = A[a1 + k]; s10 += x * y0; s11 += x * y1; s12 += x * y2; s13 += x * y3;
        x = A[a2 + k]; s20 += x * y0; s21 += x * y1; s22 += x * y2; s23 += x * y3;
        x = A[a3 + k]; s30 += x * y0; s31 += x * y1; s32 += x * y2; s33 += x * y3;
      }
      r = co + i * M + j; C[r] += s00; C[r + 1] += s01; C[r + 2] += s02; C[r + 3] += s03;
      r += M; C[r] += s10; C[r + 1] += s11; C[r + 2] += s12; C[r + 3] += s13;
      r += M; C[r] += s20; C[r + 1] += s21; C[r + 2] += s22; C[r + 3] += s23;
      r += M; C[r] += s30; C[r + 1] += s31; C[r + 2] += s32; C[r + 3] += s33;
    }
    for (; j < M; j++) {
      b0 = bo + j * L; s00 = 0; s10 = 0; s20 = 0; s30 = 0;
      for (k = 0; k < L; k++) { y0 = Bt[b0 + k]; s00 += A[a0 + k] * y0; s10 += A[a1 + k] * y0; s20 += A[a2 + k] * y0; s30 += A[a3 + k] * y0; }
      r = co + i * M + j; C[r] += s00; C[r + M] += s10; C[r + 2 * M] += s20; C[r + 3 * M] += s30;
    }
  }
  for (; i < n; i++) {
    a0 = ao + i * L;
    for (j = 0; j < M; j++) { b0 = bo + j * L; s00 = 0; for (k = 0; k < L; k++) s00 += A[a0 + k] * Bt[b0 + k]; C[co + i * M + j] += s00; }
  }
}
function mmNT(A, Bt, C, n, L, M) { mmNTo(A, 0, Bt, 0, C, 0, n, L, M); }
/** 转置 X[r×c] → [c×r]（新数组） */
function transposeF(X, r, c) {
  var out = new Float32Array(r * c), i, j, ic;
  for (i = 0; i < r; i++) { ic = i * c; for (j = 0; j < c; j++) out[j * r + i] = X[ic + j]; }
  return out;
}
/** 转置 X 里从 xo 开始的 [r×c] 块，写进 out（[c×r]） */
function transposeInto(X, xo, r, c, out) {
  var i, j, ic;
  for (i = 0; i < r; i++) { ic = xo + i * c; for (j = 0; j < c; j++) out[j * r + i] = X[ic + j]; }
}
/** 七成以上是 0 就算稀疏 */
function isSparse(A) {
  var z = 0, n = A.length, i;
  for (i = 0; i < n; i++) if (A[i] === 0) z++;
  return z > 0.7 * n;
}
/** C[n×M] += A[n×K]·B[K×M] */
function mmAB(A, B, C, n, K, M) {
  if (!isSparse(A)) { mmNT(A, transposeF(B, K, M), C, n, K, M); return; }
  var i, k, j, ci, ai, bk, a;
  for (i = 0; i < n; i++) {
    ci = i * M; ai = i * K;
    for (k = 0; k < K; k++) {
      a = A[ai + k]; if (a === 0) continue;
      bk = k * M; for (j = 0; j < M; j++) C[ci + j] += a * B[bk + j];
    }
  }
}
/** C[n×K] += G[n×M]·B[K×M]ᵀ：本来就是点积形式 */
function mmABt(Gd, B, C, n, M, K) { mmNT(Gd, B, C, n, M, K); }
/** C[K×M] += A[n×K]ᵀ·G[n×M] */
function mmAtB(A, Gd, C, n, K, M) {
  if (!isSparse(A)) { mmNT(transposeF(A, n, K), transposeF(Gd, n, M), C, K, n, M); return; }
  var i, k, j, ck, gi, a;
  for (k = 0; k < K; k++) {
    ck = k * M;
    for (i = 0; i < n; i++) {
      a = A[i * K + k]; if (a === 0) continue;
      gi = i * M; for (j = 0; j < M; j++) C[ck + j] += a * Gd[gi + j];
    }
  }
}

/* ================================================================== *
 *  三、运算
 *  反向闭包一律声明自己的循环变量：被闭包捕获的变量在 V8 里放在堆上的上下文里，
 *  前向的循环若用了同名变量会慢一倍。
 * ================================================================== */
nn.matmul = function (a, b) {
  need(a, "matmul"); need(b, "matmul");
  if (a.shape.length !== 2 || b.shape.length !== 2 || a.shape[1] !== b.shape[0]) throw new Error("matmul：形状不匹配 " + sstr(a.shape) + "×" + sstr(b.shape));
  var n = a.shape[0], K = a.shape[1], M = b.shape[1], out = new Float32Array(n * M);
  mmAB(a.data, b.data, out, n, K, M);
  return make(out, [n, M], [a, b], function (g) {
    if (a.requiresGrad) mmABt(g, b.data, G(a), n, M, K);
    if (b.requiresGrad) mmAtB(a.data, g, G(b), n, K, M);
  });
};
/** 全连接层 x·W + b 合成一个运算：少一次遍历、少一个中间数组 */
nn.linear = function (x, W, b) {
  need(x, "linear"); need(W, "linear");
  if (x.shape.length !== 2 || W.shape.length !== 2 || x.shape[1] !== W.shape[0]) throw new Error("linear：形状不匹配 " + sstr(x.shape) + "×" + sstr(W.shape));
  var n = x.shape[0], K = x.shape[1], M = W.shape[1], out = new Float32Array(n * M), i, j;
  if (b) { if (b.size !== M) throw new Error("linear：偏置长度 " + b.size + " 应为 " + M); for (i = 0; i < n; i++) out.set(b.data, i * M); }
  mmAB(x.data, W.data, out, n, K, M);
  return make(out, [n, M], b ? [x, W, b] : [x, W], function (g) {
    var i, j;
    if (x.requiresGrad) mmABt(g, W.data, G(x), n, M, K);
    if (W.requiresGrad) mmAtB(x.data, g, G(W), n, K, M);
    if (b && b.requiresGrad) {
      var gb = G(b), acc = new Float64Array(M);
      for (i = 0; i < n; i++) for (j = 0; j < M; j++) acc[j] += g[i * M + j];
      for (j = 0; j < M; j++) gb[j] += acc[j];
    }
  });
};

/* ---------- 逐元素的二元运算：同形，或小的那个按行广播（[m] 或标量 → [n,m]） ---------- */
function tailFits(big, small) {
  if (prod(small) === 1) return true;
  var s = small.slice(); while (s.length && s[0] === 1) s.shift();
  if (s.length > big.length) return false;
  for (var i = 1; i <= s.length; i++) if (s[s.length - i] !== big[big.length - i]) return false;
  return true;
}
function binary(a, b, op, name) {
  need(a, name); need(b, name);
  var sa = a.size, sb = b.size, N, S, aS = false, bS = false, shape;
  if (sa === sb) { N = sa; S = sa; shape = a.shape.slice(); }
  else if (sa > sb && tailFits(a.shape, b.shape)) { N = sa; S = sb; bS = true; shape = a.shape.slice(); }
  else if (sb > sa && tailFits(b.shape, a.shape)) { N = sb; S = sa; aS = true; shape = b.shape.slice(); }
  else throw new Error(name + "：形状不匹配 " + sstr(a.shape) + " 与 " + sstr(b.shape) + "（只支持同形，或把 [m] 按行广播到 [n,m]）");
  var A = a.data, B = b.data, out = new Float32Array(N), o, j = 0;
  // j 是小张量里的位置：同形时恒等于 o，广播时每 S 个回绕一次（不用取模）
  if (op === 0) for (o = 0; o < N; o++) { out[o] = A[aS ? j : o] + B[bS ? j : o]; if (++j === S) j = 0; }
  else if (op === 1) for (o = 0; o < N; o++) { out[o] = A[aS ? j : o] - B[bS ? j : o]; if (++j === S) j = 0; }
  else for (o = 0; o < N; o++) { out[o] = A[aS ? j : o] * B[bS ? j : o]; if (++j === S) j = 0; }
  return make(out, shape, [a, b], function (g) {
    var q, o;
    if (a.requiresGrad) {
      var ga = G(a); q = 0;
      if (op === 2) for (o = 0; o < N; o++) { ga[aS ? q : o] += g[o] * B[bS ? q : o]; if (++q === S) q = 0; }
      else for (o = 0; o < N; o++) { ga[aS ? q : o] += g[o]; if (++q === S) q = 0; }
    }
    if (b.requiresGrad) {
      var gb = G(b); q = 0;
      if (op === 0) for (o = 0; o < N; o++) { gb[bS ? q : o] += g[o]; if (++q === S) q = 0; }
      else if (op === 1) for (o = 0; o < N; o++) { gb[bS ? q : o] -= g[o]; if (++q === S) q = 0; }
      else for (o = 0; o < N; o++) { gb[bS ? q : o] += g[o] * A[aS ? q : o]; if (++q === S) q = 0; }
    }
  });
}
nn.add = function (a, b) { return binary(a, b, 0, "add"); };
nn.sub = function (a, b) { return binary(a, b, 1, "sub"); };
nn.mul = function (a, b) { return binary(a, b, 2, "mul"); };
nn.scale = function (a, s) {
  need(a, "scale");
  var X = a.data, n = a.size, out = new Float32Array(n), i;
  for (i = 0; i < n; i++) out[i] = X[i] * s;
  return make(out, a.shape.slice(), [a], function (g) { var ga = G(a), i; for (i = 0; i < n; i++) ga[i] += g[i] * s; });
};

/* ---------- 逐元素的一元运算（每个单独写循环：通用的"传函数"版本在 V8 里会变成多态调用，慢好几倍） ---------- */
nn.relu = function (a) {
  need(a, "relu");
  var X = a.data, n = a.size, out = new Float32Array(n), i;
  for (i = 0; i < n; i++) out[i] = X[i] > 0 ? X[i] : 0;
  return make(out, a.shape.slice(), [a], function (g) { var ga = G(a), i; for (i = 0; i < n; i++) if (out[i] > 0) ga[i] += g[i]; });
};
nn.leakyRelu = function (a, slope) {
  need(a, "leakyRelu"); if (slope == null) slope = 0.01;
  var X = a.data, n = a.size, out = new Float32Array(n), i;
  for (i = 0; i < n; i++) out[i] = X[i] > 0 ? X[i] : slope * X[i];
  return make(out, a.shape.slice(), [a], function (g) { var ga = G(a), i; for (i = 0; i < n; i++) ga[i] += X[i] > 0 ? g[i] : slope * g[i]; });
};
nn.tanh = function (a) {
  need(a, "tanh");
  var X = a.data, n = a.size, out = new Float32Array(n), i;
  for (i = 0; i < n; i++) out[i] = Math.tanh(X[i]);
  return make(out, a.shape.slice(), [a], function (g) { var ga = G(a), i; for (i = 0; i < n; i++) { var y = out[i]; ga[i] += g[i] * (1 - y * y); } });
};
nn.sigmoid = function (a) {
  need(a, "sigmoid");
  var X = a.data, n = a.size, out = new Float32Array(n), i;
  for (i = 0; i < n; i++) { var x = X[i]; if (x >= 0) out[i] = 1 / (1 + Math.exp(-x)); else { var e = Math.exp(x); out[i] = e / (1 + e); } }
  return make(out, a.shape.slice(), [a], function (g) { var ga = G(a), i; for (i = 0; i < n; i++) { var y = out[i]; ga[i] += g[i] * y * (1 - y); } });
};
/** GELU 的 tanh 近似：0.5x(1 + tanh(√(2/π)(x + 0.044715x³))) */
nn.gelu = function (a) {
  need(a, "gelu");
  var X = a.data, n = a.size, out = new Float32Array(n), C = Math.sqrt(2 / Math.PI), i;
  for (i = 0; i < n; i++) { var x = X[i]; out[i] = 0.5 * x * (1 + Math.tanh(C * (x + 0.044715 * x * x * x))); }
  return make(out, a.shape.slice(), [a], function (g) {
    var ga = G(a), i;
    for (i = 0; i < n; i++) {
      var x = X[i], t = Math.tanh(C * (x + 0.044715 * x * x * x));
      ga[i] += g[i] * (0.5 * (1 + t) + 0.5 * x * (1 - t * t) * C * (1 + 0.134145 * x * x));
    }
  });
};
nn.square = function (a) {
  need(a, "square");
  var X = a.data, n = a.size, out = new Float32Array(n), i;
  for (i = 0; i < n; i++) out[i] = X[i] * X[i];
  return make(out, a.shape.slice(), [a], function (g) { var ga = G(a), i; for (i = 0; i < n; i++) ga[i] += 2 * X[i] * g[i]; });
};
nn.exp = function (a) {
  need(a, "exp");
  var X = a.data, n = a.size, out = new Float32Array(n), i;
  for (i = 0; i < n; i++) out[i] = Math.exp(X[i]);
  return make(out, a.shape.slice(), [a], function (g) { var ga = G(a), i; for (i = 0; i < n; i++) ga[i] += g[i] * out[i]; });
};
nn.log = function (a) {
  need(a, "log");
  var X = a.data, n = a.size, out = new Float32Array(n), i;
  for (i = 0; i < n; i++) out[i] = Math.log(X[i]);
  return make(out, a.shape.slice(), [a], function (g) { var ga = G(a), i; for (i = 0; i < n; i++) ga[i] += g[i] / X[i]; });
};

/* ---------- 归约 ---------- */
/** 不给 axis：全部相加得标量 [1]；给 axis：沿这一维相加（axis 可以是负数，-1 = 最后一维） */
function reduce(a, axis, isMean, name) {
  need(a, name);
  var X = a.data, n = a.size, i;
  if (axis == null) {
    var s = 0; for (i = 0; i < n; i++) s += X[i];
    var c = isMean ? 1 / n : 1, out1 = new Float32Array(1); out1[0] = s * c;
    return make(out1, [1], [a], function (g) { var ga = G(a), v = g[0] * c, i; for (i = 0; i < n; i++) ga[i] += v; });
  }
  var nd = a.shape.length; if (axis < 0) axis += nd;
  if (!(axis >= 0 && axis < nd)) throw new Error(name + "：axis " + axis + " 超出维数 " + nd);
  var len = a.shape[axis], inner = prod(a.shape.slice(axis + 1)), outer = n / (len * inner), shape = a.shape.slice(0, axis).concat(a.shape.slice(axis + 1));
  if (!shape.length) shape = [1];
  var out = new Float32Array(outer * inner), acc = new Float64Array(inner), cc = isMean ? 1 / len : 1, o, l, j;
  for (o = 0; o < outer; o++) {
    acc.fill(0);
    for (l = 0; l < len; l++) { var base = (o * len + l) * inner; for (j = 0; j < inner; j++) acc[j] += X[base + j]; }
    for (j = 0; j < inner; j++) out[o * inner + j] = acc[j] * cc;
  }
  return make(out, shape, [a], function (g) {
    var ga = G(a), o, l, j;
    for (o = 0; o < outer; o++) for (l = 0; l < len; l++) { var base = (o * len + l) * inner; for (j = 0; j < inner; j++) ga[base + j] += g[o * inner + j] * cc; }
  });
}
nn.sum = function (a, axis) { return reduce(a, axis, false, "sum"); };
nn.mean = function (a, axis) { return reduce(a, axis, true, "mean"); };

/* ---------- softmax 一族（按最后一维的行） ---------- */
nn.softmax = function (a) {
  need(a, "softmax");
  var k = a.shape[a.shape.length - 1], n = a.size / k, X = a.data, out = new Float32Array(a.size), i, j;
  for (i = 0; i < n; i++) {
    var b = i * k, mx = -Infinity, s = 0;
    for (j = 0; j < k; j++) if (X[b + j] > mx) mx = X[b + j];
    for (j = 0; j < k; j++) { var e = Math.exp(X[b + j] - mx); out[b + j] = e; s += e; }
    for (j = 0; j < k; j++) out[b + j] /= s;
  }
  return make(out, a.shape.slice(), [a], function (g) {
    var ga = G(a), i, j;
    for (i = 0; i < n; i++) {
      var b = i * k, dot = 0;
      for (j = 0; j < k; j++) dot += g[b + j] * out[b + j];
      for (j = 0; j < k; j++) ga[b + j] += out[b + j] * (g[b + j] - dot);
    }
  });
};
nn.logSoftmax = function (a) {
  need(a, "logSoftmax");
  var k = a.shape[a.shape.length - 1], n = a.size / k, X = a.data, out = new Float32Array(a.size), i, j;
  for (i = 0; i < n; i++) {
    var b = i * k, mx = -Infinity, s = 0;
    for (j = 0; j < k; j++) if (X[b + j] > mx) mx = X[b + j];
    for (j = 0; j < k; j++) s += Math.exp(X[b + j] - mx);
    var lse = mx + Math.log(s);
    for (j = 0; j < k; j++) out[b + j] = X[b + j] - lse;
  }
  return make(out, a.shape.slice(), [a], function (g) {
    var ga = G(a), i, j;
    for (i = 0; i < n; i++) {
      var b = i * k, sg = 0;
      for (j = 0; j < k; j++) sg += g[b + j];
      for (j = 0; j < k; j++) ga[b + j] += g[b + j] - Math.exp(out[b + j]) * sg;
    }
  });
};
/** 交叉熵（平均到每个样本）。先减去每行最大值再取 log-sum-exp，logits 再大也不会溢出 */
nn.crossEntropy = function (logits, labels) {
  need(logits, "crossEntropy");
  if (logits.shape.length !== 2) throw new Error("crossEntropy：logits 应为二维 [n,k]，当前 " + sstr(logits.shape));
  var n = logits.shape[0], k = logits.shape[1], X = logits.data, P = new Float32Array(n * k), lab = new Int32Array(n), tot = 0, i, j;
  if (!labels || labels.length !== n) throw new Error("crossEntropy：标签个数 " + (labels ? labels.length : 0) + " 与 logits 的行数 " + n + " 不符");
  for (i = 0; i < n; i++) {
    var y = labels[i];
    if (!(y >= 0 && y < k) || y !== Math.floor(y)) throw new Error("crossEntropy：第 " + i + " 个标签 " + y + " 不在 0.." + (k - 1) + " 里");
    lab[i] = y;
    var b = i * k, mx = -Infinity, s = 0;
    for (j = 0; j < k; j++) if (X[b + j] > mx) mx = X[b + j];
    for (j = 0; j < k; j++) { var e = Math.exp(X[b + j] - mx); P[b + j] = e; s += e; }
    tot += mx + Math.log(s) - X[b + y];
    for (j = 0; j < k; j++) P[b + j] /= s;
  }
  var out = new Float32Array(1); out[0] = tot / n;
  return make(out, [1], [logits], function (g) {
    var gl = G(logits), c = g[0] / n, i, j;
    for (i = 0; i < n; i++) { var b = i * k; for (j = 0; j < k; j++) gl[b + j] += c * P[b + j]; gl[b + lab[i]] -= c; }
  });
};
function targetData(t, n, name) {
  var T = t instanceof Tensor ? t.data : t;
  if (!T || T.length !== n) throw new Error(name + "：目标的长度 " + (T ? T.length : 0) + " 与预测的大小 " + n + " 不符");
  return T;
}
/** 均方误差（对全部元素平均）。target 可以是张量或普通数组 */
nn.mse = function (pred, target) {
  need(pred, "mse");
  var n = pred.size, X = pred.data, T = targetData(target, n, "mse"), s = 0, i;
  for (i = 0; i < n; i++) { var d = X[i] - T[i]; s += d * d; }
  var out = new Float32Array(1); out[0] = s / n;
  var tt = target instanceof Tensor ? target : null;
  return make(out, [1], tt ? [pred, tt] : [pred], function (g) {
    var c = 2 * g[0] / n, gp = pred.requiresGrad ? G(pred) : null, gt = tt && tt.requiresGrad ? G(tt) : null, i;
    for (i = 0; i < n; i++) { var d = c * (X[i] - T[i]); if (gp) gp[i] += d; if (gt) gt[i] -= d; }
  });
};
/** 带 logits 的二元交叉熵：max(x,0) − x·t + log(1 + e^{−|x|})，对大 |x| 稳定 */
nn.bceLogits = function (logits, targets) {
  need(logits, "bceLogits");
  var n = logits.size, X = logits.data, T = targetData(targets, n, "bceLogits"), s = 0, i;
  for (i = 0; i < n; i++) { var x = X[i]; s += (x > 0 ? x : 0) - x * T[i] + Math.log1p(Math.exp(-Math.abs(x))); }
  var out = new Float32Array(1); out[0] = s / n;
  return make(out, [1], [logits], function (g) {
    var gl = G(logits), c = g[0] / n, i;
    for (i = 0; i < n; i++) { var x = X[i], p = x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)); gl[i] += c * (p - T[i]); }
  });
};

/* ---------- 取行、拼接、变形 ---------- */
/** 查表：table [V,D]，idx 长度 n → [n,D]；反向是按下标累加（同一个词出现多次，梯度相加） */
nn.embedding = function (table, idx) {
  need(table, "embedding");
  if (table.shape.length !== 2) throw new Error("embedding：表应为二维 [V,D]，当前 " + sstr(table.shape));
  var V = table.shape[0], D = table.shape[1], n = idx.length, T = table.data, out = new Float32Array(n * D), ix = new Int32Array(n), i, j;
  for (i = 0; i < n; i++) {
    var v = idx[i];
    if (!(v >= 0 && v < V) || v !== Math.floor(v)) throw new Error("embedding：第 " + i + " 个下标 " + v + " 超出词表 0.." + (V - 1));
    ix[i] = v;
    var s = v * D, o = i * D; for (j = 0; j < D; j++) out[o + j] = T[s + j];
  }
  return make(out, [n, D], [table], function (g) {
    var gt = G(table), i, j;
    for (i = 0; i < n; i++) { var s = ix[i] * D, o = i * D; for (j = 0; j < D; j++) gt[s + j] += g[o + j]; }
  });
};
/** 二维张量拼接：axis = 1 横着拼（行数相同），axis = 0 竖着拼（列数相同） */
nn.concat = function (list, axis) {
  if (axis == null || axis === -1) axis = 1;
  if (!list || !list.length) throw new Error("concat：列表为空");
  var i, r, j, t0 = list[0];
  for (i = 0; i < list.length; i++) { need(list[i], "concat"); if (list[i].shape.length !== 2) throw new Error("concat：只支持二维张量，第 " + i + " 个是 " + sstr(list[i].shape)); }
  var out, shape;
  if (axis === 1) {
    var n = t0.shape[0], W = 0, offs = [];
    for (i = 0; i < list.length; i++) { if (list[i].shape[0] !== n) throw new Error("concat：行数不同 " + sstr(t0.shape) + " 与 " + sstr(list[i].shape)); offs.push(W); W += list[i].shape[1]; }
    out = new Float32Array(n * W); shape = [n, W];
    for (i = 0; i < list.length; i++) { var w = list[i].shape[1], D = list[i].data, off = offs[i]; for (r = 0; r < n; r++) for (j = 0; j < w; j++) out[r * W + off + j] = D[r * w + j]; }
    return make(out, shape, list.slice(), function (g) {
      for (var q = 0; q < list.length; q++) {
        var t = list[q]; if (!t.requiresGrad) continue;
        var gq = G(t), w2 = t.shape[1], o2 = offs[q];
        for (var rr = 0; rr < n; rr++) for (var jj = 0; jj < w2; jj++) gq[rr * w2 + jj] += g[rr * W + o2 + jj];
      }
    });
  }
  if (axis !== 0) throw new Error("concat：axis 只能是 0 或 1");
  var m = t0.shape[1], N = 0, starts = [];
  for (i = 0; i < list.length; i++) { if (list[i].shape[1] !== m) throw new Error("concat：列数不同 " + sstr(t0.shape) + " 与 " + sstr(list[i].shape)); starts.push(N * m); N += list[i].shape[0]; }
  out = new Float32Array(N * m);
  for (i = 0; i < list.length; i++) out.set(list[i].data, starts[i]);
  return make(out, [N, m], list.slice(), function (g) {
    for (var q = 0; q < list.length; q++) {
      var t = list[q]; if (!t.requiresGrad) continue;
      var gq = G(t), s0 = starts[q]; for (var e = 0; e < t.size; e++) gq[e] += g[s0 + e];
    }
  });
};
/** 改形状（复制数据，不与原张量共享）；shape 里可以有一个 -1 */
nn.reshape = function (a, shape) {
  need(a, "reshape");
  var s = shape.slice(), neg = -1, p = 1, i;
  for (i = 0; i < s.length; i++) { if (s[i] === -1) { if (neg >= 0) throw new Error("reshape：只能有一个 -1"); neg = i; } else p *= s[i]; }
  if (neg >= 0) s[neg] = a.size / p;
  if (prod(s) !== a.size || (neg >= 0 && s[neg] !== Math.floor(s[neg]))) throw new Error("reshape：大小不符，" + sstr(a.shape) + " 变不成 " + sstr(shape));
  var out = new Float32Array(a.data), n = a.size;
  return make(out, s, [a], function (g) { var ga = G(a), i; for (i = 0; i < n; i++) ga[i] += g[i]; });
};
/** [N, …] → [N, 其余相乘] */
nn.flatten = function (a) { return nn.reshape(a, [a.shape[0], -1]); };
nn.transpose2d = function (a) {
  need(a, "transpose2d");
  if (a.shape.length !== 2) throw new Error("transpose2d：只支持二维，当前 " + sstr(a.shape));
  var n = a.shape[0], m = a.shape[1], X = a.data, out = new Float32Array(n * m), i, j;
  for (i = 0; i < n; i++) for (j = 0; j < m; j++) out[j * n + i] = X[i * m + j];
  return make(out, [m, n], [a], function (g) { var ga = G(a), i, j; for (i = 0; i < n; i++) for (j = 0; j < m; j++) ga[i * m + j] += g[j * n + i]; });
};

/* ---------- 卷积与池化 ---------- */
/* 卷积用 im2col：把每张图展开成 (C·kh·kw) × (Ho·Wo) 的矩阵，再用上面分块的点积内核做矩阵乘法。
 * 展开时"第 r 行第 p 列取原图哪个像素"只与形状和填充方式有关，算一次存起来（-1 表示补零），
 * 零填充和循环填充（格点模型的周期边界）于是走同一条路。 */
var convMaps = {}, convMapCount = 0;
function convMap(C, H, W, kh, kw, circ, ph, pw) {
  var key = C + "," + H + "," + W + "," + kh + "," + kw + "," + circ + "," + ph + "," + pw, e = convMaps[key];
  if (e) return e;
  var Ho = H + 2 * ph - kh + 1, Wo = W + 2 * pw - kw + 1, P = Ho * Wo, R = C * kh * kw, map = new Int32Array(R * P), c, ki, kj, oy, ox, r, q;
  for (c = 0; c < C; c++) for (ki = 0; ki < kh; ki++) for (kj = 0; kj < kw; kj++) {
    r = (c * kh + ki) * kw + kj;
    for (oy = 0; oy < Ho; oy++) for (ox = 0; ox < Wo; ox++) {
      var iy = oy + ki - ph, ix = ox + kj - pw; q = r * P + oy * Wo + ox;
      if (circ) { iy = ((iy % H) + H) % H; ix = ((ix % W) + W) % W; map[q] = c * H * W + iy * W + ix; }
      else map[q] = iy >= 0 && iy < H && ix >= 0 && ix < W ? c * H * W + iy * W + ix : -1;
    }
  }
  var mapT = new Int32Array(R * P);   // 转置的布局 [P×R]：前向的点积要按 r 连续读
  for (r = 0; r < R; r++) for (q = 0; q < P; q++) mapT[q * R + r] = map[r * P + q];
  if (convMapCount >= 32) { convMaps = {}; convMapCount = 0; }   // 形状种类很少；万一很多，整个清掉
  e = { map: map, mapT: mapT, Ho: Ho, Wo: Wo, P: P, R: R }; convMaps[key] = e; convMapCount++;
  return e;
}
/** 二维卷积，步长 1。x [N,C,H,W]，w [O,C,kh,kw]，b [O] 或 null。
 *  pad："same"（补零、输出同尺寸，默认）| "circular"（周期边界）| 整数 p（四周补 p 圈零，0 = 不填充） */
nn.conv2d = function (x, w, b, opts) {
  need(x, "conv2d"); need(w, "conv2d");
  if (x.shape.length !== 4 || w.shape.length !== 4 || x.shape[1] !== w.shape[1]) throw new Error("conv2d：形状不匹配 输入 " + sstr(x.shape) + " 卷积核 " + sstr(w.shape) + "（应为 [N,C,H,W] 与 [O,C,kh,kw]）");
  var pad = typeof opts === "string" || typeof opts === "number" ? opts : opts && opts.pad != null ? opts.pad : "same";
  var N = x.shape[0], C = x.shape[1], H = x.shape[2], W = x.shape[3], O = w.shape[0], kh = w.shape[2], kw = w.shape[3], ph, pw, circ = false;
  if (pad === "same" || pad === "circular") {
    if (kh % 2 === 0 || kw % 2 === 0) throw new Error("conv2d：same / circular 填充要求卷积核边长为奇数，当前 " + kh + "×" + kw);
    ph = (kh - 1) / 2; pw = (kw - 1) / 2; circ = pad === "circular";
  } else if (typeof pad === "number" && pad >= 0 && pad === Math.floor(pad)) { ph = pad; pw = pad; }
  else throw new Error("conv2d：不认识的填充方式 " + pad);
  if (b && b.size !== O) throw new Error("conv2d：偏置长度 " + b.size + " 应为输出通道数 " + O);
  if (H + 2 * ph < kh || W + 2 * pw < kw) throw new Error("conv2d：图像 " + H + "×" + W + " 比卷积核 " + kh + "×" + kw + " 还小");
  var cm = convMap(C, H, W, kh, kw, circ, ph, pw), map = cm.map, P = cm.P, R = cm.R, CHW = C * H * W;
  var X = x.data, Wd = w.data, Bd = b ? b.data : null, out = new Float32Array(N * O * P);
  convFwd(X, Wd, Bd, out, cm.mapT, N, O, R, P, CHW);
  return make(out, [N, O, cm.Ho, cm.Wo], b ? [x, w, b] : [x, w], function (g) {
    convBwd(X, Wd, g, w.requiresGrad ? G(w) : null, b && b.requiresGrad ? G(b) : null, x.requiresGrad ? G(x) : null, map, N, O, R, P, CHW);
  });
};
/** 卷积前向：逐张图展开成 colT [P×R]，再 out_n[O×P] = W[O×R]·colTᵀ（+ 偏置），用分块的点积内核 */
function convFwd(X, Wd, Bd, out, mapT, N, O, R, P, CHW) {
  var RP = R * P, OP = O * P, colT = new Float32Array(RP), n, o, p, q, xb, ob, mq, bv;
  for (n = 0; n < N; n++) {
    xb = n * CHW; ob = n * OP;
    for (q = 0; q < RP; q++) { mq = mapT[q]; colT[q] = mq >= 0 ? X[xb + mq] : 0; }
    if (Bd) for (o = 0; o < O; o++) { bv = Bd[o]; for (p = 0; p < P; p++) out[ob + o * P + p] = bv; }
    mmNTo(Wd, 0, colT, 0, out, ob, O, R, P);
  }
}
/** 卷积反向：gW[O×R] += g_n·colᵀ，gb += Σ g，dcol[R×P] = Wᵀ·g_n 再按展开表加回 gx。
 *  展开在这里重算，不为整批存一份 */
function convBwd(X, Wd, g, gw, gb, gx, map, N, O, R, P, CHW) {
  var RP = R * P, OP = O * P, col = gw ? new Float32Array(RP) : null, dcol = gx ? new Float32Array(RP) : null;
  var Wt = gx ? transposeF(Wd, O, R) : null, gT = gx ? new Float32Array(OP) : null, n, o, p, q, xb, ob, s, mq;
  for (n = 0; n < N; n++) {
    xb = n * CHW; ob = n * OP;
    if (gb) for (o = 0; o < O; o++) { s = 0; for (p = 0; p < P; p++) s += g[ob + o * P + p]; gb[o] += s; }
    if (gw) { for (q = 0; q < RP; q++) { mq = map[q]; col[q] = mq >= 0 ? X[xb + mq] : 0; } mmNTo(g, ob, col, 0, gw, 0, O, P, R); }
    if (gx) {
      transposeInto(g, ob, O, P, gT); dcol.fill(0); mmNTo(Wt, 0, gT, 0, dcol, 0, R, O, P);
      for (q = 0; q < RP; q++) { mq = map[q]; if (mq >= 0) gx[xb + mq] += dcol[q]; }
    }
  }
}
/** 最大池化：k×k 窗口、步长 k（默认 2），要求 H、W 能被 k 整除 */
nn.maxPool2d = function (x, k) {
  need(x, "maxPool2d"); k = k || 2;
  if (x.shape.length !== 4) throw new Error("maxPool2d：输入应为 [N,C,H,W]，当前 " + sstr(x.shape));
  var N = x.shape[0], C = x.shape[1], H = x.shape[2], W = x.shape[3];
  if (H % k || W % k) throw new Error("maxPool2d：高和宽（" + H + "×" + W + "）必须能被 " + k + " 整除");
  var Ho = H / k, Wo = W / k, X = x.data, out = new Float32Array(N * C * Ho * Wo), arg = new Int32Array(out.length), nc, oy, ox, dy, dx, o = 0;
  for (nc = 0; nc < N * C; nc++) {
    var base = nc * H * W;
    for (oy = 0; oy < Ho; oy++) for (ox = 0; ox < Wo; ox++) {
      var best = -Infinity, bi = base + oy * k * W + ox * k;
      for (dy = 0; dy < k; dy++) for (dx = 0; dx < k; dx++) { var id = base + (oy * k + dy) * W + ox * k + dx; if (X[id] > best) { best = X[id]; bi = id; } }
      out[o] = best; arg[o] = bi; o++;
    }
  }
  return make(out, [N, C, Ho, Wo], [x], function (g) { var gx = G(x); for (var i = 0; i < out.length; i++) gx[arg[i]] += g[i]; });
};
/** 全局平均池化：[N,C,H,W] → [N,C] */
nn.avgPoolGlobal = function (x) {
  need(x, "avgPoolGlobal");
  if (x.shape.length !== 4) throw new Error("avgPoolGlobal：输入应为 [N,C,H,W]，当前 " + sstr(x.shape));
  var NC = x.shape[0] * x.shape[1], HW = x.shape[2] * x.shape[3], X = x.data, out = new Float32Array(NC), i, j;
  for (i = 0; i < NC; i++) { var s = 0, b = i * HW; for (j = 0; j < HW; j++) s += X[b + j]; out[i] = s / HW; }
  return make(out, [x.shape[0], x.shape[1]], [x], function (g) { var gx = G(x), i, j; for (i = 0; i < NC; i++) { var v = g[i] / HW, b = i * HW; for (j = 0; j < HW; j++) gx[b + j] += v; } });
};

/* ---------- 正则化与归一化 ---------- */
/** 反向缩放的 dropout：训练时每个元素以概率 p 置零、其余乘 1/(1−p)，所以期望不变、预测时什么都不做。
 *  training 不传时跟着是否在记录计算图走：noGrad 里（做预测）自动关掉 */
nn.dropout = function (a, p, rng, training) {
  need(a, "dropout");
  if (training == null) training = gradOn;
  if (!training || !(p > 0)) return a;
  if (!(p < 1)) throw new Error("dropout：p 应在 [0,1) 里，当前 " + p);
  var r = getRng(rng), n = a.size, X = a.data, mask = new Float32Array(n), out = new Float32Array(n), keep = 1 / (1 - p), i;
  for (i = 0; i < n; i++) { if (r.u() >= p) { mask[i] = keep; out[i] = X[i] * keep; } }
  return make(out, a.shape.slice(), [a], function (g) { var ga = G(a), i; for (i = 0; i < n; i++) ga[i] += g[i] * mask[i]; });
};
/** 层归一化：每行（最后一维）减均值、除标准差，再乘 gamma 加 beta（两者可为 null） */
nn.layerNorm = function (a, gamma, beta, eps) {
  need(a, "layerNorm"); if (eps == null) eps = 1e-5;
  var m = a.shape[a.shape.length - 1], n = a.size / m, X = a.data, xh = new Float32Array(a.size), rstd = new Float64Array(n), out = new Float32Array(a.size), i, j;
  if ((gamma && gamma.size !== m) || (beta && beta.size !== m)) throw new Error("layerNorm：gamma / beta 的长度应为 " + m);
  var Gm = gamma ? gamma.data : null, Bt = beta ? beta.data : null;
  for (i = 0; i < n; i++) {
    var b = i * m, mu = 0, v = 0;
    for (j = 0; j < m; j++) mu += X[b + j];
    mu /= m;
    for (j = 0; j < m; j++) { var d = X[b + j] - mu; v += d * d; }
    var rs = 1 / Math.sqrt(v / m + eps); rstd[i] = rs;
    for (j = 0; j < m; j++) { var h = (X[b + j] - mu) * rs; xh[b + j] = h; out[b + j] = (Gm ? Gm[j] * h : h) + (Bt ? Bt[j] : 0); }
  }
  var parents = [a]; if (gamma) parents.push(gamma); if (beta) parents.push(beta);
  return make(out, a.shape.slice(), parents, function (g) {
    var gg = gamma && gamma.requiresGrad ? G(gamma) : null, gbt = beta && beta.requiresGrad ? G(beta) : null, ga = a.requiresGrad ? G(a) : null, i, j;
    for (i = 0; i < n; i++) {
      var b = i * m, s1 = 0, s2 = 0;
      for (j = 0; j < m; j++) {
        var gy = g[b + j], dh = Gm ? gy * Gm[j] : gy;
        if (gg) gg[j] += gy * xh[b + j];
        if (gbt) gbt[j] += gy;
        s1 += dh; s2 += dh * xh[b + j];
      }
      if (ga) {
        s1 /= m; s2 /= m;
        // dx = rstd · (dĥ − mean(dĥ) − ĥ · mean(dĥ·ĥ))
        for (j = 0; j < m; j++) { var dh2 = Gm ? g[b + j] * Gm[j] : g[b + j]; ga[b + j] += rstd[i] * (dh2 - s1 - xh[b + j] * s2); }
      }
    }
  });
};

/* ================================================================== *
 *  四、优化器
 * ================================================================== */
function zeroAll(params) { for (var i = 0; i < params.length; i++) if (params[i].grad) params[i].grad.fill(0); }
/** Adam；weightDecay 是解耦的（AdamW）：θ ← θ − lr·(m̂/(√v̂ + eps) + wd·θ)。
 *  衰减不经过自适应的分母，所以对所有参数是同一个比例。lr、weightDecay 都可以在训练中改。
 *  参数上设了 noDecay = true 的不做衰减；没有梯度（grad 为 null）的参数这一步跳过。 */
nn.adam = function (params, o) {
  o = o || {};
  var opt = { lr: o.lr == null ? 1e-3 : o.lr, beta1: o.beta1 == null ? 0.9 : o.beta1, beta2: o.beta2 == null ? 0.999 : o.beta2,
    eps: o.eps == null ? 1e-8 : o.eps, weightDecay: o.weightDecay || 0, t: 0, params: params };
  var m = [], v = [], k;
  for (k = 0; k < params.length; k++) { need(params[k], "adam"); m.push(new Float64Array(params[k].size)); v.push(new Float64Array(params[k].size)); }
  opt.step = function () {
    opt.t++;
    var lr = opt.lr, b1 = opt.beta1, b2 = opt.beta2, eps = opt.eps, bc1 = 1 - Math.pow(b1, opt.t), bc2 = 1 - Math.pow(b2, opt.t), q, i;
    for (q = 0; q < params.length; q++) {
      var p = params[q], g = p.grad; if (!g) continue;
      var D = p.data, M = m[q], V = v[q], wd = p.noDecay ? 0 : opt.weightDecay, n = p.size;
      for (i = 0; i < n; i++) {
        var gi = g[i], mi = b1 * M[i] + (1 - b1) * gi, vi = b2 * V[i] + (1 - b2) * gi * gi;
        M[i] = mi; V[i] = vi;
        D[i] -= lr * ((mi / bc1) / (Math.sqrt(vi / bc2) + eps) + wd * D[i]);
      }
    }
  };
  opt.zeroGrad = function () { zeroAll(params); };
  return opt;
};
/** 随机梯度下降（可带动量）：v ← μv + g，θ ← θ − lr·v；weightDecay 在这里是加到梯度上的 L2 */
nn.sgd = function (params, o) {
  o = o || {};
  var opt = { lr: o.lr == null ? 0.01 : o.lr, momentum: o.momentum || 0, weightDecay: o.weightDecay || 0, t: 0, params: params }, vel = [], k;
  for (k = 0; k < params.length; k++) { need(params[k], "sgd"); vel.push(new Float64Array(params[k].size)); }
  opt.step = function () {
    opt.t++;
    var lr = opt.lr, mu = opt.momentum, q, i;
    for (q = 0; q < params.length; q++) {
      var p = params[q], g = p.grad; if (!g) continue;
      var D = p.data, Vq = vel[q], wd = p.noDecay ? 0 : opt.weightDecay, n = p.size;
      for (i = 0; i < n; i++) {
        var gi = g[i] + wd * D[i];
        if (mu) { gi = mu * Vq[i] + gi; Vq[i] = gi; }
        D[i] -= lr * gi;
      }
    }
  };
  opt.zeroGrad = function () { zeroAll(params); };
  return opt;
};
/** 把梯度的总 L2 范数裁到 maxNorm 以内，返回裁剪前的范数 */
nn.clipGradNorm = function (params, maxNorm) {
  var s = 0, i, q;
  for (q = 0; q < params.length; q++) { var g = params[q].grad; if (g) for (i = 0; i < g.length; i++) s += g[i] * g[i]; }
  var norm = Math.sqrt(s);
  if (norm > maxNorm && norm > 0) { var c = maxNorm / norm; for (q = 0; q < params.length; q++) { var g2 = params[q].grad; if (g2) for (i = 0; i < g2.length; i++) g2[i] *= c; } }
  return norm;
};

/* ================================================================== *
 *  五、层
 * ================================================================== */
/** 全连接：W [in,out]，b [out]（初始为 0）。init 默认 "he" */
function Linear(inDim, outDim, rng, init) {
  if (!(this instanceof Linear)) return new Linear(inDim, outDim, rng, init);
  this.W = nn.param([inDim, outDim], init || "he", rng);
  this.b = nn.param([outDim], "zeros");
}
Linear.prototype.forward = function (x) { return nn.linear(x, this.W, this.b); };
Linear.prototype.params = function () { return [this.W, this.b]; };
nn.Linear = Linear;

function activate(h, act) {
  if (act === "relu") return nn.relu(h);
  if (act === "tanh") return nn.tanh(h);
  if (act === "gelu") return nn.gelu(h);
  if (act === "sigmoid") return nn.sigmoid(h);
  if (act === "leakyRelu") return nn.leakyRelu(h);
  throw new Error("MLP：不认识的激活函数 " + act + "（可选 relu、tanh、gelu、sigmoid、leakyRelu）");
}
/** 多层感知机：sizes = [d, h1, …, out]，最后一层后面不加激活（输出 logits 或回归值）。
 *  o: { act: "relu" | "tanh" | "gelu", rng, dropout: 隐藏层之后的丢弃率 }。
 *  .training = false 或在 noGrad 里时不做 dropout */
function MLP(sizes, o) {
  if (!(this instanceof MLP)) return new MLP(sizes, o);
  o = o || {};
  if (!sizes || sizes.length < 2) throw new Error("MLP：sizes 至少要有输入和输出两个数");
  var act = o.act || "relu", rng = getRng(o.rng), L = sizes.length - 1, i;
  activate(nn.zeros([1]), act);   // 先检查一遍名字，免得训练到一半才报错
  this.act = act; this.sizes = sizes.slice(); this.dropout = o.dropout || 0; this.training = true; this.rng = rng; this.layers = [];
  var hidInit = act === "tanh" || act === "sigmoid" ? "xavier" : "he";
  for (i = 0; i < L; i++) this.layers.push(new Linear(sizes[i], sizes[i + 1], rng, i < L - 1 ? hidInit : "xavier"));
}
MLP.prototype.forward = function (x) {
  var h = x, L = this.layers.length;
  for (var i = 0; i < L; i++) {
    h = this.layers[i].forward(h);
    if (i < L - 1) { h = activate(h, this.act); if (this.dropout > 0) h = nn.dropout(h, this.dropout, this.rng, this.training && gradOn); }
  }
  return h;
};
MLP.prototype.params = function () { var ps = []; for (var i = 0; i < this.layers.length; i++) ps.push(this.layers[i].W, this.layers[i].b); return ps; };
nn.MLP = MLP;

/** 嵌入表 [vocab, dim]，初始 N(0, std²)，std 默认 1（与 PyTorch 相同；后面接 he 初始化的层正合适） */
function Embedding(vocab, dim, rng, std) {
  if (!(this instanceof Embedding)) return new Embedding(vocab, dim, rng, std);
  this.weight = nn.param([vocab, dim], std == null ? 1 : std, rng);
  this.vocab = vocab; this.dim = dim;
}
Embedding.prototype.forward = function (idx) { return nn.embedding(this.weight, idx); };
Embedding.prototype.params = function () { return [this.weight]; };
nn.Embedding = Embedding;

/** 卷积层：k×k 卷积核（he 初始化）加偏置，o.pad 默认 "same" */
function Conv2d(inC, outC, k, rng, o) {
  if (!(this instanceof Conv2d)) return new Conv2d(inC, outC, k, rng, o);
  this.w = nn.param([outC, inC, k, k], "he", rng);
  this.b = nn.param([outC], "zeros");
  this.pad = o && o.pad != null ? o.pad : "same";
}
Conv2d.prototype.forward = function (x) { return nn.conv2d(x, this.w, this.b, { pad: this.pad }); };
Conv2d.prototype.params = function () { return [this.w, this.b]; };
nn.Conv2d = Conv2d;

/* ================================================================== *
 *  六、工具
 * ================================================================== */
/** 打乱 0..n−1 后切成每批 size 个（最后一批可能不满，也保留）；不给 rng 就按原顺序 */
nn.batches = function (n, size, rng) {
  var perm = new Int32Array(n), i, out = [];
  for (i = 0; i < n; i++) perm[i] = i;
  if (rng) for (i = n - 1; i > 0; i--) { var j = Math.floor(rng.u() * (i + 1)), t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  size = Math.max(1, size | 0);
  for (i = 0; i < n; i += size) out.push(perm.slice(i, Math.min(n, i + size)));
  return out;
};
nn.numParams = function (params) { var s = 0; for (var i = 0; i < params.length; i++) s += params[i].size; return s; };
/** 参数的拷贝与恢复（早停时留住验证集上最好的那一版） */
nn.saveParams = function (params) { var out = []; for (var i = 0; i < params.length; i++) out.push(new Float32Array(params[i].data)); return out; };
nn.loadParams = function (params, saved) { for (var i = 0; i < params.length; i++) params[i].data.set(saved[i]); };
/** 梯度检验：反向传播的梯度与中心差分 (f(θ+ε) − f(θ−ε)) / (实际步长) 比较，返回最大相对误差。
 *  参数是单精度，差分在双精度里算，步长取扰动后实际存下来的值之差。
 *  相对误差的分母不小于全体梯度最大值的 1%，免得几乎为 0 的分量被舍入噪声放大。
 *  每个参数最多均匀抽 maxPer（默认 200）个分量。 */
nn.gradcheck = function (f, params, eps, maxPer) {
  eps = eps || 1e-3; maxPer = maxPer || 200;
  function val(r) { return r instanceof Tensor ? r.data[0] : +r; }
  var q, c, j;
  zeroAll(params);
  var L = f(); L.backward();
  var ana = [], num = [], scale = 0;
  for (q = 0; q < params.length; q++) {
    var p = params[q], D = p.data, cnt = Math.min(p.size, maxPer), step = p.size / cnt;
    for (c = 0; c < cnt; c++) {
      j = Math.floor(c * step);
      var a = p.grad ? p.grad[j] : 0, orig = D[j];
      D[j] = orig + eps; var up = D[j], fp = val(f());
      D[j] = orig - eps; var dn = D[j], fm = val(f());
      D[j] = orig;
      var nm = (fp - fm) / (up - dn);
      ana.push(a); num.push(nm);
      scale = Math.max(scale, Math.abs(a), Math.abs(nm));
    }
  }
  var worst = 0, floor = Math.max(1e-2 * scale, 1e-8);
  for (c = 0; c < ana.length; c++) {
    var e = Math.abs(ana[c] - num[c]) / Math.max(Math.abs(ana[c]), Math.abs(num[c]), floor);
    if (!(e <= worst)) worst = e;     // NaN 也算最坏
  }
  return worst;
};

/* ================================================================== *
 *  七、nn.la：双精度的矩阵小工具（PCA、傅里叶分析、小型线性方程组）
 * ================================================================== */
var la = {};
/** C[n×k] = A[n×m]·B[m×k] */
la.matmul = function (A, B, n, m, k) {
  var C = new Float64Array(n * k), i, l, j;
  for (i = 0; i < n; i++) for (l = 0; l < m; l++) { var a = A[i * m + l]; if (a === 0) continue; var bl = l * k, ci = i * k; for (j = 0; j < k; j++) C[ci + j] += a * B[bl + j]; }
  return C;
};
/** Cholesky 分解 A = L Lᵀ（A 对称正定，d×d），返回下三角 L，不改动 A */
la.chol = function (A, d) {
  var L = new Float64Array(d * d), i, j, k, s;
  for (j = 0; j < d; j++) {
    s = A[j * d + j]; for (k = 0; k < j; k++) s -= L[j * d + k] * L[j * d + k];
    if (!(s > 0)) throw new Error("chol：矩阵不是正定的（第 " + j + " 个主元为 " + s + "）");
    var Ljj = Math.sqrt(s); L[j * d + j] = Ljj;
    for (i = j + 1; i < d; i++) { s = A[i * d + j]; for (k = 0; k < j; k++) s -= L[i * d + k] * L[j * d + k]; L[i * d + j] = s / Ljj; }
  }
  return L;
};
/** 解 A x = b（A 对称正定）。b 长度为 d（向量）或 d·r（d×r 矩阵，按行展开，一次解 r 个右端） */
la.solve = function (A, b, d) {
  var L = la.chol(A, d), r = b.length / d, x = new Float64Array(b.length), y = new Float64Array(d), i, k, c, s;
  if (r !== Math.floor(r) || r < 1) throw new Error("solve：右端的长度 " + b.length + " 不是 " + d + " 的整数倍");
  for (c = 0; c < r; c++) {
    for (i = 0; i < d; i++) { s = b[i * r + c]; for (k = 0; k < i; k++) s -= L[i * d + k] * y[k]; y[i] = s / L[i * d + i]; }
    for (i = d - 1; i >= 0; i--) { s = y[i]; for (k = i + 1; k < d; k++) s -= L[k * d + i] * x[k * r + c]; x[i * r + c] = s / L[i * d + i]; }
  }
  return x;
};
/** 对称矩阵的全部特征值与特征向量（循环 Jacobi，稳健、能处理重根）。
 *  返回 { values: 从大到小, vectors: d×d，第 i 行是第 i 个特征向量 } */
la.eigh = function (A0, d) {
  var A = new Float64Array(A0), V = new Float64Array(d * d), i, p, q, r, sweep, fro = 0;
  for (i = 0; i < d; i++) V[i * d + i] = 1;
  for (i = 0; i < d * d; i++) fro += A[i] * A[i];
  for (sweep = 0; sweep < 100; sweep++) {
    var off = 0;
    for (p = 0; p < d; p++) for (q = p + 1; q < d; q++) off += A[p * d + q] * A[p * d + q];
    if (off <= 1e-30 * fro || off === 0) break;
    for (p = 0; p < d; p++) for (q = p + 1; q < d; q++) {
      var apq = A[p * d + q];
      if (Math.abs(apq) < 1e-300) continue;
      var theta = (A[q * d + q] - A[p * d + p]) / (2 * apq), t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      // A ← A J（列），再 A ← Jᵀ A（行）；V ← V J
      for (r = 0; r < d; r++) { var arp = A[r * d + p], arq = A[r * d + q]; A[r * d + p] = c * arp - s * arq; A[r * d + q] = s * arp + c * arq; }
      for (r = 0; r < d; r++) { var apr = A[p * d + r], aqr = A[q * d + r]; A[p * d + r] = c * apr - s * aqr; A[q * d + r] = s * apr + c * aqr; }
      for (r = 0; r < d; r++) { var vrp = V[r * d + p], vrq = V[r * d + q]; V[r * d + p] = c * vrp - s * vrq; V[r * d + q] = s * vrp + c * vrq; }
    }
  }
  var ord = []; for (i = 0; i < d; i++) ord.push(i);
  ord.sort(function (x, y) { return A[y * d + y] - A[x * d + x] || x - y; });
  var vals = new Float64Array(d), vecs = new Float64Array(d * d);
  for (i = 0; i < d; i++) { var c0 = ord[i]; vals[i] = A[c0 * d + c0]; for (r = 0; r < d; r++) vecs[i * d + r] = V[r * d + c0]; }
  return { values: vals, vectors: vecs };
};
/** 对称半正定矩阵最大的 k 个特征对：小矩阵直接 Jacobi；大矩阵用子空间迭代 + Rayleigh–Ritz */
function topEig(A, m, k) {
  if (m <= 160) { var E = la.eigh(A, m); return { values: E.values.subarray(0, k), vectors: E.vectors.subarray(0, k * m) }; }
  var b = Math.min(m, k + 8), Q = new Float64Array(b * m), Z = new Float64Array(b * m), prev = new Float64Array(b), i, j, c, e, it;
  // 确定性的初值（不消耗任何随机数流）
  for (i = 0; i < b * m; i++) { var h = Math.sin(i * 12.9898 + 78.233) * 43758.5453; Q[i] = h - Math.floor(h) - 0.5; }
  function orth(M) {
    for (var pass = 0; pass < 2; pass++) for (var c1 = 0; c1 < b; c1++) {
      for (var c2 = 0; c2 < c1; c2++) { var dot = 0, x; for (x = 0; x < m; x++) dot += M[c1 * m + x] * M[c2 * m + x]; for (x = 0; x < m; x++) M[c1 * m + x] -= dot * M[c2 * m + x]; }
      var nr = 0, y; for (y = 0; y < m; y++) nr += M[c1 * m + y] * M[c1 * m + y]; nr = Math.sqrt(nr) || 1; for (y = 0; y < m; y++) M[c1 * m + y] /= nr;
    }
  }
  function mulA(src, dst) { for (var c3 = 0; c3 < b; c3++) for (var r = 0; r < m; r++) { var s = 0, ar = r * m, sc = c3 * m; for (var x = 0; x < m; x++) s += A[ar + x] * src[sc + x]; dst[sc + r] = s; } }
  orth(Q);
  for (it = 0; it < 500; it++) {
    mulA(Q, Z);
    var done = true;
    for (c = 0; c < b; c++) { var rq = 0; for (j = 0; j < m; j++) rq += Q[c * m + j] * Z[c * m + j]; if (c < k && Math.abs(rq - prev[c]) > 1e-11 * Math.abs(rq)) done = false; prev[c] = rq; }
    orth(Z); var tmp = Q; Q = Z; Z = tmp;
    if (done && it > 2) break;
  }
  mulA(Q, Z);
  var T = new Float64Array(b * b);
  for (c = 0; c < b; c++) for (e = 0; e < b; e++) { var s2 = 0; for (j = 0; j < m; j++) s2 += Q[c * m + j] * Z[e * m + j]; T[c * b + e] = s2; }
  for (c = 0; c < b; c++) for (e = c + 1; e < b; e++) { var av = 0.5 * (T[c * b + e] + T[e * b + c]); T[c * b + e] = av; T[e * b + c] = av; }
  var Et = la.eigh(T, b), vals = new Float64Array(k), vecs = new Float64Array(k * m);
  for (c = 0; c < k; c++) { vals[c] = Et.values[c]; for (e = 0; e < b; e++) { var u = Et.vectors[c * b + e]; if (u === 0) continue; for (j = 0; j < m; j++) vecs[c * m + j] += u * Q[e * m + j]; } }
  return { values: vals, vectors: vecs };
}
/** 主成分分析。X 为 n×d（按行），返回
 *  { components: k×d（每行一个单位主方向，最大分量取正号以便复现）, explained: k（解释的方差比例）,
 *    variance: k（各主成分的方差，除以 n−1）, mean: d, scores: n×k（中心化后的投影） }。
 *  n < d 时改算 n×n 的 Gram 矩阵，再把特征向量映射回 d 维 */
la.pca = function (X, n, d, k) {
  k = Math.max(1, Math.min(k || 2, d, n));
  var mean = new Float64Array(d), Xc = new Float64Array(n * d), i, j, a, c, den = Math.max(1, n - 1);
  for (i = 0; i < n; i++) for (j = 0; j < d; j++) mean[j] += X[i * d + j];
  for (j = 0; j < d; j++) mean[j] /= n;
  for (i = 0; i < n; i++) for (j = 0; j < d; j++) Xc[i * d + j] = X[i * d + j] - mean[j];
  var comps = new Float64Array(k * d), vars = new Float64Array(k), total = 0;
  if (d <= n) {
    var C = new Float64Array(d * d);
    for (i = 0; i < n; i++) { var row = i * d; for (a = 0; a < d; a++) { var xa = Xc[row + a]; if (xa === 0) continue; for (j = a; j < d; j++) C[a * d + j] += xa * Xc[row + j]; } }
    for (a = 0; a < d; a++) for (j = a; j < d; j++) { var v = C[a * d + j] / den; C[a * d + j] = v; C[j * d + a] = v; }
    for (a = 0; a < d; a++) total += C[a * d + a];
    var E = topEig(C, d, k);
    for (c = 0; c < k; c++) { vars[c] = Math.max(0, E.values[c]); for (j = 0; j < d; j++) comps[c * d + j] = E.vectors[c * d + j]; }
  } else {
    var Gm = new Float64Array(n * n);
    for (i = 0; i < n; i++) for (a = i; a < n; a++) { var s = 0; for (j = 0; j < d; j++) s += Xc[i * d + j] * Xc[a * d + j]; Gm[i * n + a] = s; Gm[a * n + i] = s; }
    for (i = 0; i < n; i++) total += Gm[i * n + i] / den;
    var E2 = topEig(Gm, n, k);
    for (c = 0; c < k; c++) {
      vars[c] = Math.max(0, E2.values[c] / den);
      var nr = 0;
      for (i = 0; i < n; i++) { var u = E2.vectors[c * n + i]; if (u === 0) continue; for (j = 0; j < d; j++) comps[c * d + j] += u * Xc[i * d + j]; }
      for (j = 0; j < d; j++) nr += comps[c * d + j] * comps[c * d + j];
      nr = Math.sqrt(nr) || 1; for (j = 0; j < d; j++) comps[c * d + j] /= nr;
    }
  }
  for (c = 0; c < k; c++) {   // 符号约定：绝对值最大的分量取正
    var bi = 0; for (j = 1; j < d; j++) if (Math.abs(comps[c * d + j]) > Math.abs(comps[c * d + bi])) bi = j;
    if (comps[c * d + bi] < 0) for (j = 0; j < d; j++) comps[c * d + j] = -comps[c * d + j];
  }
  var scores = new Float64Array(n * k), explained = new Float64Array(k);
  for (i = 0; i < n; i++) for (c = 0; c < k; c++) { var t = 0; for (j = 0; j < d; j++) t += Xc[i * d + j] * comps[c * d + j]; scores[i * k + c] = t; }
  for (c = 0; c < k; c++) explained[c] = total > 0 ? vars[c] / total : 0;
  return { components: comps, explained: explained, variance: vars, mean: mean, scores: scores };
};
/** 实数序列的离散傅里叶变换 X_f = Σ_t x_t e^{−2πi f t / n}，f = 0..n−1。
 *  相位用整数 (f·t mod n) 查表，不累积角度误差；O(n²)，n ≤ 几百足够快。
 *  返回 { re, im, power = re² + im² }（实数输入时 power[f] = power[n−f]） */
la.dft = function (x) {
  var n = x.length, re = new Float64Array(n), im = new Float64Array(n), power = new Float64Array(n), cs = new Float64Array(n), sn = new Float64Array(n), f, t;
  for (t = 0; t < n; t++) { cs[t] = Math.cos(2 * Math.PI * t / n); sn[t] = Math.sin(2 * Math.PI * t / n); }
  for (f = 0; f < n; f++) {
    var r = 0, s = 0, idx = 0;
    for (t = 0; t < n; t++) { r += x[t] * cs[idx]; s -= x[t] * sn[idx]; idx += f; if (idx >= n) idx -= n; }
    re[f] = r; im[f] = s; power[f] = r * r + s * s;
  }
  return { re: re, im: im, power: power };
};
nn.la = la;

QL.nn = nn;
return nn;
}
if (typeof module !== "undefined" && module.exports) module.exports = QL_MLNN_INSTALL;
