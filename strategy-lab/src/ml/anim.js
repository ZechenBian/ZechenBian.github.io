// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 机器学习实验室 · 动画与模拟
 * 上半个文件 QL_MLANIM 是纯计算（不碰 DOM，Node 里可以直接测）：伊辛模型的 Metropolis 与 Wolff、逾渗的并查集标记、
 * 二维损失面上的几种优化器、多项式最小二乘（勒让德基）、随机 ReLU 特征的最小范数解（单边 Jacobi SVD）。
 * 下半个文件是页面上的模拟（A.renderSim）：数据集自带的（伊辛、逾渗、时间序列的滚动原点）和几个与数据集无关的教学演示
 * （优化器赛跑、偏差与方差、双下降）。每个动画都交给 keep() 登记：换视图时 destroy() 停掉 requestAnimationFrame、断开观察器；
 * 另外画布不在页面里、页面被切到后台、卡片滚出视野时，循环自己停下。系统设置了"减少动态效果"时一律不自动播放，只画一帧静止的图。
 * 随机数一律用 QL.RNG（同样的种子得到同样的模拟）。 */
var QL_MLANIM = (function () {
  "use strict";
  var TC = 2 / Math.log(1 + Math.SQRT2);       // 二维伊辛的临界温度 2/ln(1+√2) = 2.269185…
  var PC = 0.59274605079210;                   // 方格座逾渗的临界概率（Jacobsen 2015）

  /* ================================================================== *
   *  一、二维伊辛（J = k_B = 1，环面）
   * ================================================================== */
  /** 邻接表 nb[4i..4i+3] = 右、下、左、上；两种颜色（行 + 列的奇偶）。L 为偶数时同色格点之间没有键，所以一种颜色可以"同时"更新 */
  function isingLattice(L) {
    var N = L * L, nb = new Int32Array(4 * N), c0 = [], c1 = [];
    for (var r = 0; r < L; r++) for (var c = 0; c < L; c++) {
      var i = r * L + c;
      nb[4 * i] = r * L + (c + 1) % L; nb[4 * i + 1] = ((r + 1) % L) * L + c;
      nb[4 * i + 2] = r * L + (c + L - 1) % L; nb[4 * i + 3] = ((r + L - 1) % L) * L + c;
      ((r + c) & 1 ? c1 : c0).push(i);
    }
    return { L: L, N: N, nb: nb, colors: [Int32Array.from(c0), Int32Array.from(c1)], stack: new Int32Array(N) };
  }
  /** 总能量 H = −Σ_{⟨ij⟩} σ_i σ_j（每个格点数它的右键和下键，2N 条键各数一次） */
  function isingEnergy(s, lat) { var E = 0, nb = lat.nb; for (var i = 0; i < lat.N; i++) E -= s[i] * (s[nb[4 * i]] + s[nb[4 * i + 1]]); return E; }
  function isingMag(s) { var M = 0; for (var i = 0; i < s.length; i++) M += s[i]; return M; }
  /** 初态："random"（每个自旋独立 ±1，即无穷高温）或 "up"（全部朝上，即零温） */
  function isingInit(s, mode, rng) { for (var i = 0; i < s.length; i++) s[i] = mode === "up" ? 1 : mode === "down" ? -1 : (rng.u() < 0.5 ? 1 : -1); return s; }
  /** Metropolis 接受概率 min{1, e^{−βΔE}}。对称提议加这个接受率满足细致平衡：π(x)·min{1, π(y)/π(x)} = min{π(x), π(y)} 关于 x、y 对称 */
  function metroAccept(dE, beta) { return dE <= 0 ? 1 : Math.exp(-beta * dE); }
  /** 一次棋盘 Metropolis 扫描：先更新一种颜色的全部格点，再更新另一种。ΔE = 2σ_i h_i，h_i 是四个邻居之和。
   *  st = { E, M, acc, tries } 就地更新（能量和磁化逐次累加 ΔE、ΔM，不必每步重算）。返回这一扫翻了几个 */
  function metropolisSweep(s, lat, beta, rng, st) {
    var nb = lat.nb, w4 = Math.exp(-4 * beta), w8 = Math.exp(-8 * beta), acc = 0, dE = 0, dM = 0;
    for (var col = 0; col < 2; col++) {
      var sites = lat.colors[col];
      for (var q = 0; q < sites.length; q++) {
        var i = sites[q], b = 4 * i, si = s[i], de = 2 * si * (s[nb[b]] + s[nb[b + 1]] + s[nb[b + 2]] + s[nb[b + 3]]);
        if (de <= 0 || rng.u() < (de === 4 ? w4 : de === 8 ? w8 : Math.exp(-beta * de))) { s[i] = -si; dE += de; dM -= 2 * si; acc++; }
      }
    }
    if (st) { st.E += dE; st.M += dM; st.acc = (st.acc || 0) + acc; st.tries = (st.tries || 0) + lat.N; }
    return acc;
  }
  /** Wolff：从随机格点出发，以 p = 1 − e^{−2β} 连接同号邻居，长出一个团簇并整体翻转。
   *  每加入一个格点就当场翻转它，ΔE 按"翻一个自旋"逐个累加（2σ_j h_j，h_j 用当时的邻居），所以总和恰好是整个团簇翻转的能量差。返回团簇大小 */
  function wolffStep(s, lat, beta, rng, st) {
    var nb = lat.nb, stack = lat.stack, pb = -Math.expm1(-2 * beta), i0 = rng.int(lat.N), s0 = s[i0], top = 0, size = 1, b = 4 * i0;
    var dE = 2 * s0 * (s[nb[b]] + s[nb[b + 1]] + s[nb[b + 2]] + s[nb[b + 3]]);
    s[i0] = -s0; stack[top++] = i0;
    while (top > 0) {
      var i = stack[--top];
      for (var d = 0; d < 4; d++) {
        var j = nb[4 * i + d];
        if (s[j] === s0 && rng.u() < pb) { b = 4 * j; dE += 2 * s0 * (s[nb[b]] + s[nb[b + 1]] + s[nb[b + 2]] + s[nb[b + 3]]); s[j] = -s0; stack[top++] = j; size++; }
      }
    }
    if (st) { st.E += dE; st.M -= 2 * s0 * size; st.cl = (st.cl || 0) + size; st.nc = (st.nc || 0) + 1; }
    return size;
  }
  /** Yang（1952）：无穷大格子的自发磁化 M(T) = (1 − sinh^{−4}(2/T))^{1/8}（T < T_c），否则 0 */
  function yangM(T) { var s = Math.sinh(2 / T); return s > 1 ? Math.pow(1 - Math.pow(s, -4), 0.125) : 0; }

  /* ================================================================== *
   *  二、方格座逾渗（自由边界，上下左右相邻）
   * ================================================================== */
  function findRoot(par, i) { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }
  /** 并查集给开放格点（open[i] 非 0）标团簇。返回 label（关闭的格点为 −1，否则 0..K−1，按扫描顺序编号）、
   *  每个团簇的大小 size、是否同时碰到第一行和最后一行 spans、扫描时第一次遇到的格点 first（= 团簇里编号最小的格点，给着色用：p 变大时颜色不乱跳）。
   *  ws：可复用的工作区（同一个 L 反复调用时省得每次分配） */
  function percLabel(open, L, ws) {
    var N = L * L, i, r, c;
    ws = ws || {};
    if (!ws.par || ws.par.length !== N) { ws.par = new Int32Array(N); ws.label = new Int32Array(N); ws.rid = new Int32Array(N); }
    var par = ws.par, label = ws.label, rid = ws.rid;
    for (i = 0; i < N; i++) { par[i] = i; rid[i] = -1; }
    for (r = 0; r < L; r++) for (c = 0; c < L; c++) {
      i = r * L + c; if (!open[i]) continue;
      if (c + 1 < L && open[i + 1]) { var a = findRoot(par, i), b = findRoot(par, i + 1); if (a !== b) { if (a < b) par[b] = a; else par[a] = b; } }
      if (r + 1 < L && open[i + L]) { a = findRoot(par, i); b = findRoot(par, i + L); if (a !== b) { if (a < b) par[b] = a; else par[a] = b; } }
    }
    var K = 0, first = [];
    for (i = 0; i < N; i++) {
      if (!open[i]) { label[i] = -1; continue; }
      var root = findRoot(par, i);
      if (rid[root] < 0) { rid[root] = K++; first.push(i); }
      label[i] = rid[root];
    }
    var size = new Int32Array(K), top = new Uint8Array(K), bot = new Uint8Array(K), spans = new Uint8Array(K), nSpan = 0, spanId = -1, largest = -1, big = 0;
    for (i = 0; i < N; i++) { var k = label[i]; if (k < 0) continue; size[k]++; if (i < L) top[k] = 1; if (i >= N - L) bot[k] = 1; }
    for (k = 0; k < K; k++) { if (top[k] && bot[k]) { spans[k] = 1; nSpan++; if (spanId < 0 || size[k] > size[spanId]) spanId = k; } if (size[k] > big) { big = size[k]; largest = k; } }
    return { label: label, size: size, spans: spans, first: Int32Array.from(first), K: K, nSpan: nSpan, spanId: spanId, largest: largest };
  }
  /** 一张"耦合"的格子：每个格点一个均匀随机数 u_i，开放 ⇔ u_i < p。按 u 从小到大逐个打开格点（Newman–Ziff），
   *  用并查集加两个虚拟格点（顶、底）判断何时第一次上下连通。返回临界值 p*：p > p* 时连通，p < p* 时不连通 */
  function spanThreshold(u, L, ws) {
    var N = L * L, TOP = N, BOT = N + 1, i;
    ws = ws || {};
    if (!ws.par2 || ws.par2.length !== N + 2) { ws.par2 = new Int32Array(N + 2); ws.ord = new Int32Array(N); }
    var par = ws.par2, ord = ws.ord;
    for (i = 0; i < N; i++) { ord[i] = i; par[i] = -1; }
    par[TOP] = TOP; par[BOT] = BOT;
    ord.sort(function (a, b) { return u[a] - u[b]; });
    function join(a, b) { a = findRoot(par, a); b = findRoot(par, b); if (a !== b) { if (a < b) par[b] = a; else par[a] = b; } }
    for (var q = 0; q < N; q++) {
      i = ord[q]; par[i] = i;
      var r = (i / L) | 0, c = i - r * L;
      if (c + 1 < L && par[i + 1] >= 0) join(i, i + 1);
      if (c > 0 && par[i - 1] >= 0) join(i, i - 1);
      if (r + 1 < L && par[i + L] >= 0) join(i, i + L);
      if (r > 0 && par[i - L] >= 0) join(i, i - L);
      if (r === 0) join(i, TOP);
      if (r === L - 1) join(i, BOT);
      if (findRoot(par, TOP) === findRoot(par, BOT)) return u[i];
    }
    return 1;
  }

  /* ================================================================== *
   *  三、二维损失面与优化器
   * ================================================================== */
  /** 损失面：f、梯度 grad(x, y, out)、画图范围 xr / yr（横纵同比例）、起点、最小值点与最小值 fmin、着色用的偏移 delta（画 log(f − f* + delta)）
   *  quad：旋转过 θ 的二次型 ½(u²/κ + v²)，Hessian 的特征值是 1 和 1/κ（条件数 κ）；rosen：Rosenbrock (1−x)² + 100(y−x²)²；
   *  saddle：½x² + ¼y⁴ − ½y²，原点是鞍点，(0, ±1) 是两个最小值点 */
  function surface(id, o) {
    o = o || {};
    if (id === "rosen") return { id: id, f: function (x, y) { var a = 1 - x, b = y - x * x; return a * a + 100 * b * b; },
      grad: function (x, y, g) { var b = y - x * x; g[0] = -2 * (1 - x) - 400 * x * b; g[1] = 200 * b; return g; },
      xr: [-2.2, 2.2], yr: [-0.8, 2.4], start: [-1.5, 2.1], min: [[1, 1]], fmin: 0, delta: 0.03 };
    if (id === "saddle") return { id: id, f: function (x, y) { return 0.5 * x * x + 0.25 * y * y * y * y - 0.5 * y * y; },
      grad: function (x, y, g) { g[0] = x; g[1] = y * y * y - y; return g; },
      xr: [-3, 3], yr: [-2.2, 2.2], start: [-2.6, 1e-4], min: [[0, 1], [0, -1]], saddle: [0, 0], fmin: -0.25, delta: 0.01 };
    var kappa = Math.max(1, +o.kappa || 20), th = o.theta == null ? 0.5 : +o.theta, cs = Math.cos(th), sn = Math.sin(th), l1 = 1 / kappa;
    var u0 = -2.8, v0 = 1.2;    // 起点：沿平缓方向很远，沿陡峭方向不远
    return { id: "quad", kappa: kappa, theta: th,
      f: function (x, y) { var u = cs * x + sn * y, v = -sn * x + cs * y; return 0.5 * (l1 * u * u + v * v); },
      grad: function (x, y, g) { var u = cs * x + sn * y, v = -sn * x + cs * y, gu = l1 * u, gv = v; g[0] = cs * gu - sn * gv; g[1] = sn * gu + cs * gv; return g; },
      xr: [-3.4, 3.4], yr: [-2.45, 2.45], start: [cs * u0 - sn * v0, sn * u0 + cs * v0], min: [[0, 0]], fmin: 0, delta: 1e-3 };
  }
  var OPTIMIZERS = [
    { id: "gd", name: "梯度下降" }, { id: "momentum", name: "动量（重球）" }, { id: "nesterov", name: "Nesterov" }, { id: "rmsprop", name: "RMSProp" }, { id: "adam", name: "Adam" }
  ];
  function optInit(kind, x, y) { return { kind: kind, x: x, y: y, vx: 0, vy: 0, mx: 0, my: 0, sx: 0, sy: 0, t: 0 }; }
  var G2 = new Float64Array(2);
  /** 走一步。hp = { lr, beta（动量与 Nesterov 的动量系数）, rho（RMSProp 的衰减）, b1, b2（Adam）, eps }
   *  动量（重球，Polyak）：v ← βv − η∇f(x)，x ← x + v；Nesterov：梯度在前瞻点 x + βv 处取；
   *  RMSProp：s ← ρs + (1−ρ)g²，x ← x − ηg/(√s + ε)；Adam：m、v 的指数平均加偏差修正 m̂ = m/(1−β₁ᵗ)、v̂ = v/(1−β₂ᵗ)，x ← x − η m̂/(√v̂ + ε)（逐坐标） */
  function optStep(o, surf, hp) {
    var lr = hp.lr, g = G2, b, eps = hp.eps == null ? 1e-8 : hp.eps;
    o.t++;
    switch (o.kind) {
      case "gd": surf.grad(o.x, o.y, g); o.x -= lr * g[0]; o.y -= lr * g[1]; break;
      case "momentum": b = hp.beta == null ? 0.9 : hp.beta; surf.grad(o.x, o.y, g); o.vx = b * o.vx - lr * g[0]; o.vy = b * o.vy - lr * g[1]; o.x += o.vx; o.y += o.vy; break;
      case "nesterov": b = hp.beta == null ? 0.9 : hp.beta; surf.grad(o.x + b * o.vx, o.y + b * o.vy, g); o.vx = b * o.vx - lr * g[0]; o.vy = b * o.vy - lr * g[1]; o.x += o.vx; o.y += o.vy; break;
      case "rmsprop": b = hp.rho == null ? 0.9 : hp.rho; surf.grad(o.x, o.y, g); o.sx = b * o.sx + (1 - b) * g[0] * g[0]; o.sy = b * o.sy + (1 - b) * g[1] * g[1]; o.x -= lr * g[0] / (Math.sqrt(o.sx) + eps); o.y -= lr * g[1] / (Math.sqrt(o.sy) + eps); break;
      case "adam": {
        var b1 = hp.b1 == null ? 0.9 : hp.b1, b2 = hp.b2 == null ? 0.999 : hp.b2; surf.grad(o.x, o.y, g);
        o.mx = b1 * o.mx + (1 - b1) * g[0]; o.my = b1 * o.my + (1 - b1) * g[1]; o.sx = b2 * o.sx + (1 - b2) * g[0] * g[0]; o.sy = b2 * o.sy + (1 - b2) * g[1] * g[1];
        var c1 = 1 - Math.pow(b1, o.t), c2 = 1 - Math.pow(b2, o.t);
        o.x -= lr * (o.mx / c1) / (Math.sqrt(o.sx / c2) + eps); o.y -= lr * (o.my / c1) / (Math.sqrt(o.sy / c2) + eps); break;
      }
      default: throw new Error("没有这种优化器：" + o.kind);
    }
    return o;
  }

  /* ================================================================== *
   *  四、线性代数小工具
   * ================================================================== */
  /** 对称正定方程 G a = r（G 是 m×m，按行展开；会被改写成 Cholesky 因子）。不正定时在对角线上加一点点再试 */
  function cholSolve(G, m, r) {
    var L = new Float64Array(m * m), jitter = 0, ok = false, i, j, k, sc = 0;
    for (i = 0; i < m; i++) sc = Math.max(sc, Math.abs(G[i * m + i]));
    for (var tries = 0; tries < 8 && !ok; tries++) {
      ok = true;
      for (i = 0; i < m && ok; i++) for (j = 0; j <= i; j++) {
        var s = G[i * m + j] + (i === j ? jitter : 0);
        for (k = 0; k < j; k++) s -= L[i * m + k] * L[j * m + k];
        if (i === j) { if (!(s > 0)) { ok = false; break; } L[i * m + i] = Math.sqrt(s); }
        else L[i * m + j] = s / L[j * m + j];
      }
      if (!ok) jitter = jitter ? jitter * 100 : (sc || 1) * 1e-12;
    }
    var z = new Float64Array(m), a = new Float64Array(m);
    for (i = 0; i < m; i++) { var t = r[i]; for (k = 0; k < i; k++) t -= L[i * m + k] * z[k]; z[i] = t / L[i * m + i]; }
    for (i = m - 1; i >= 0; i--) { t = z[i]; for (k = i + 1; k < m; k++) t -= L[k * m + i] * a[k]; a[i] = t / L[i * m + i]; }
    return a;
  }
  /** 单边 Jacobi（Hestenes）薄 SVD：A 是 r×c（按行展开，r ≥ c 时最准）。返回 U（r×c，按列存：U[j*r + k]）、奇异值 s（c 个，未排序）、V（c×c，按列存）。
   *  反复对两列做平面旋转使它们正交；收敛后列范数就是奇异值。不把 AᵀA 显式算出来，所以小奇异值也算得准 */
  function svdThin(A, r, c) {
    var U = new Float64Array(r * c), V = new Float64Array(c * c), i, j, k;
    for (k = 0; k < r; k++) for (j = 0; j < c; j++) U[j * r + k] = A[k * c + j];
    for (j = 0; j < c; j++) V[j * c + j] = 1;
    for (var sweep = 0; sweep < 80; sweep++) {
      var off = 0;
      for (i = 0; i < c - 1; i++) for (j = i + 1; j < c; j++) {
        var al = 0, be = 0, ga = 0, oi = i * r, oj = j * r;
        for (k = 0; k < r; k++) { var x = U[oi + k], y = U[oj + k]; al += x * x; be += y * y; ga += x * y; }
        if (ga === 0 || Math.abs(ga) <= 1e-15 * Math.sqrt(al * be)) continue;
        off = Math.max(off, Math.abs(ga) / Math.sqrt(al * be));
        var ze = (be - al) / (2 * ga), t = (ze >= 0 ? 1 : -1) / (Math.abs(ze) + Math.sqrt(1 + ze * ze)), cs = 1 / Math.sqrt(1 + t * t), sn = cs * t;
        for (k = 0; k < r; k++) { x = U[oi + k]; y = U[oj + k]; U[oi + k] = cs * x - sn * y; U[oj + k] = sn * x + cs * y; }
        oi = i * c; oj = j * c;
        for (k = 0; k < c; k++) { x = V[oi + k]; y = V[oj + k]; V[oi + k] = cs * x - sn * y; V[oj + k] = sn * x + cs * y; }
      }
      if (off < 1e-14) break;
    }
    var s = new Float64Array(c);
    for (j = 0; j < c; j++) { var nn = 0; for (k = 0; k < r; k++) nn += U[j * r + k] * U[j * r + k]; nn = Math.sqrt(nn); s[j] = nn; if (nn > 0) for (k = 0; k < r; k++) U[j * r + k] /= nn; }
    return { U: U, s: s, V: V, r: r, c: c };
  }
  /** 薄 QR：A（r×c，按行展开，r ≥ c）= Q R，Q 按列存（r×c，列正交），R 是 c×c 上三角（按行展开）。
   *  经典 Gram–Schmidt 做两遍（CGS2）：第二遍把第一遍的舍入误差再正交化掉一次，Q 的正交性和 Householder 一样好 */
  function qrThin(A, r, c) {
    var Q = new Float64Array(r * c), R = new Float64Array(c * c), i, j, k;
    for (k = 0; k < r; k++) for (j = 0; j < c; j++) Q[j * r + k] = A[k * c + j];
    for (j = 0; j < c; j++) {
      var oj = j * r;
      for (var pass = 0; pass < 2; pass++) for (i = 0; i < j; i++) {
        var oi = i * r, d = 0; for (k = 0; k < r; k++) d += Q[oi + k] * Q[oj + k];
        R[i * c + j] += d; for (k = 0; k < r; k++) Q[oj + k] -= d * Q[oi + k];
      }
      var nn = 0; for (k = 0; k < r; k++) nn += Q[oj + k] * Q[oj + k]; nn = Math.sqrt(nn);
      R[j * c + j] = nn; if (nn > 0) for (k = 0; k < r; k++) Q[oj + k] /= nn;
    }
    return { Q: Q, R: R };
  }
  /** 最小范数最小二乘 a = Φ⁺y（Φ 是 n×p，按行展开）。小于 rcond·s_max 的奇异值当作 0（即 Moore–Penrose 伪逆）。
   *  p ≤ n：Φ = U S Vᵀ，a = V S⁺ Uᵀ y。p > n：先做薄 QR Φᵀ = Q R（p×n 与 n×n），再对小的 R 做 SVD R = U_R S V_Rᵀ，
   *  于是 Φ = V_R S (Q U_R)ᵀ，a = Q U_R S⁺ V_Rᵀ y——比直接对 p×n 的 Φᵀ 做 Jacobi 快得多。
   *  p ≥ n 且 Φ 行满秩时解恰好插值 Φa = y，并且在所有插值解里范数最小（a 落在 Φ 的行空间里） */
  function minNormSolve(Phi, n, p, y, rcond) {
    rcond = rcond == null ? 1e-12 : rcond;
    var a = new Float64Array(p), i, j, k, sv, smax = 0, tol, z;
    if (p <= n) {
      sv = svdThin(Phi, n, p);
      for (j = 0; j < p; j++) smax = Math.max(smax, sv.s[j]); tol = rcond * smax;
      for (j = 0; j < p; j++) {
        if (!(sv.s[j] > tol)) continue;
        z = 0; for (k = 0; k < n; k++) z += sv.U[j * n + k] * y[k]; z /= sv.s[j];
        for (i = 0; i < p; i++) a[i] += sv.V[j * p + i] * z;
      }
      return a;
    }
    var At = new Float64Array(p * n);
    for (i = 0; i < n; i++) for (j = 0; j < p; j++) At[j * n + i] = Phi[i * p + j];
    var qr = qrThin(At, p, n);
    sv = svdThin(qr.R, n, n);
    for (j = 0; j < n; j++) smax = Math.max(smax, sv.s[j]); tol = rcond * smax;
    var w = new Float64Array(n);                     // w = U_R S⁺ V_Rᵀ y（长度 n），a = Q w
    for (j = 0; j < n; j++) {
      if (!(sv.s[j] > tol)) continue;
      z = 0; for (k = 0; k < n; k++) z += sv.V[j * n + k] * y[k]; z /= sv.s[j];
      for (i = 0; i < n; i++) w[i] += sv.U[j * n + i] * z;
    }
    for (j = 0; j < n; j++) { var wj = w[j], oj = j * p; if (wj) for (i = 0; i < p; i++) a[i] += qr.Q[oj + i] * wj; }
    return a;
  }
  /** 岭回归 a = (ΦᵀΦ + λI)⁻¹Φᵀy；p > n 时用等价的 Φᵀ(ΦΦᵀ + λI)⁻¹y（解小的那个方程组） */
  function ridgeSolve(Phi, n, p, y, lambda) {
    var i, j, k, s, G, r;
    if (p <= n) {
      G = new Float64Array(p * p); r = new Float64Array(p);
      for (i = 0; i < p; i++) { for (j = 0; j <= i; j++) { s = 0; for (k = 0; k < n; k++) s += Phi[k * p + i] * Phi[k * p + j]; G[i * p + j] = G[j * p + i] = s; } G[i * p + i] += lambda; s = 0; for (k = 0; k < n; k++) s += Phi[k * p + i] * y[k]; r[i] = s; }
      return cholSolve(G, p, r);
    }
    G = new Float64Array(n * n);
    for (i = 0; i < n; i++) { for (j = 0; j <= i; j++) { s = 0; for (k = 0; k < p; k++) s += Phi[i * p + k] * Phi[j * p + k]; G[i * n + j] = G[j * n + i] = s; } G[i * n + i] += lambda; }
    var z = cholSolve(G, n, y), a = new Float64Array(p);
    for (k = 0; k < p; k++) { s = 0; for (i = 0; i < n; i++) s += Phi[i * p + k] * z[i]; a[k] = s; }
    return a;
  }

  /* ================================================================== *
   *  五、多项式最小二乘（勒让德基，x ∈ [−1, 1]）
   * ================================================================== */
  /** P_0..P_deg 在 x 处的值：(k+1)P_{k+1} = (2k+1)xP_k − kP_{k−1}。勒让德多项式在 [−1, 1] 上正交，比单项式 1, x, x², … 的正规方程好解得多 */
  function legendre(x, deg, out) {
    out = out || new Float64Array(deg + 1); out[0] = 1; if (deg >= 1) out[1] = x;
    for (var k = 1; k < deg; k++) out[k + 1] = ((2 * k + 1) * x * out[k] - k * out[k - 1]) / (k + 1);
    return out;
  }
  /** 最小二乘拟合 deg 次多项式（加一点岭 λ‖c‖² 防止 n ≤ deg 时方程组奇异）。返回勒让德基下的系数 */
  function polyFit(xs, ys, n, deg, lambda) {
    var m = deg + 1, G = new Float64Array(m * m), r = new Float64Array(m), phi = new Float64Array(m), i, j, k;
    for (k = 0; k < n; k++) { legendre(xs[k], deg, phi); for (i = 0; i < m; i++) { r[i] += phi[i] * ys[k]; for (j = 0; j <= i; j++) G[i * m + j] += phi[i] * phi[j]; } }
    for (i = 0; i < m; i++) { for (j = 0; j < i; j++) G[j * m + i] = G[i * m + j]; G[i * m + i] += lambda || 0; }
    return cholSolve(G, m, r);
  }
  function polyEval(coef, x, buf) {
    var deg = coef.length - 1, ph = legendre(x, deg, buf), s = 0;
    for (var i = 0; i <= deg; i++) s += coef[i] * ph[i];
    return s;
  }
  /** 偏差—方差分解：preds 是 R×J（R 份训练集、J 个测试点上的预测），truth 是 J 个真值，sigma 是噪声标准差。
   *  期望测试误差 E[(ŷ − y)²] = bias² + variance + σ²（新噪声与 ŷ 独立，交叉项的期望为 0），其中 bias² = (Eŷ − f)²、variance = Var ŷ，再对 x 平均。
   *  用 R 份训练集估计时，直接代入的 (ȳ − f)² 的期望是 bias² + variance/R——方差很大时这一项会冒充偏差。所以返回无偏的估计：
   *  variance = Σ_r (ŷ_r − ȳ)²/(R − 1)，bias2 = (ȳ − f)² − variance/R（对 x 平均）。两者之和恰好等于 fitErr = 平均 (ŷ_r − f)²（代数恒等式），
   *  另附直接代入的 bias2Plug、varPlug（分母 R），它们之和也恰好是 fitErr */
  function biasVariance(preds, R, J, truth, sigma) {
    var b2 = 0, va = 0, mse = 0, j, r;
    for (j = 0; j < J; j++) {
      var m = 0; for (r = 0; r < R; r++) m += preds[r * J + j]; m /= R;
      var d = m - truth[j]; b2 += d * d;
      for (r = 0; r < R; r++) { var e = preds[r * J + j] - m, f = preds[r * J + j] - truth[j]; va += e * e; mse += f * f; }
    }
    b2 /= J; va /= J; mse /= R * J;
    var vu = R > 1 ? va / (R - 1) : 0;
    return { bias2: b2 - vu / R, variance: vu, bias2Plug: b2, varPlug: va / R, noise: sigma * sigma, fitErr: mse, expected: mse + sigma * sigma };
  }

  /** 固定设计（训练集的 x 位置固定，每份训练集只有噪声不同）时偏差与方差的精确值。
   *  岭回归（λ）拟合的多项式是线性平滑器：ŷ(x) = s(x)ᵀy，s(x) = Φ(ΦᵀΦ + λI)⁻¹φ(x)（Φ 是设计点上的勒让德基，n×(deg+1)）。
   *  y = f + σε，所以 E ŷ(x) = s(x)ᵀf、Var ŷ(x) = σ²‖s(x)‖²；bias² = 平均_j (s(x_j)ᵀf − f(x_j))²，variance = σ² 平均_j ‖s(x_j)‖²。
   *  fx：设计点上的真值；xt、ft：J 个测试点与真值。期望测试误差 = bias² + variance + σ² */
  function polyBiasVarExact(xs, n, fx, deg, lambda, xt, J, ft, sigma) {
    var m = deg + 1, Phi = new Float64Array(n * m), G = new Float64Array(m * m), phi = new Float64Array(m), i, j, k, b2 = 0, ss2 = 0;
    for (i = 0; i < n; i++) { legendre(xs[i], deg, phi); for (j = 0; j < m; j++) Phi[i * m + j] = phi[j]; }
    for (i = 0; i < m; i++) for (j = 0; j <= i; j++) { var s = 0; for (k = 0; k < n; k++) s += Phi[k * m + i] * Phi[k * m + j]; G[i * m + j] = G[j * m + i] = s + (i === j ? lambda || 0 : 0); }
    for (j = 0; j < J; j++) {
      legendre(xt[j], deg, phi);
      var w = cholSolve(G, m, phi), mu = 0, ss = 0;
      for (i = 0; i < n; i++) { var si = 0; for (k = 0; k < m; k++) si += Phi[i * m + k] * w[k]; mu += si * fx[i]; ss += si * si; }
      b2 += (mu - ft[j]) * (mu - ft[j]); ss2 += ss;
    }
    var v = sigma * sigma * ss2 / J;
    return { bias2: b2 / J, variance: v, noise: sigma * sigma, expected: b2 / J + v + sigma * sigma };
  }

  /* ================================================================== *
   *  六、随机 ReLU 特征
   * ================================================================== */
  /** 特征池：φ_j(x) = max(0, ⟨w_j, x⟩ + b_j)/√p，x ∈ ℝ^d，w_j ~ N(0, wScale²·I_d)，b_j ~ N(0, bScale²)。
   *  为什么不用一维的 x：一维时 φ_j 是折点在 −b_j/w_j 的折线，n 个点上的特征矩阵的秩 = Σ_段 min(该段的点数, 2)（"段"由落在相邻数据点之间的折点切出），
   *  只要有两个相邻的空隙里都没有折点就不满秩——p = n 时几乎总是这样，插值阈值被抹平。d ≥ 2 时折点是超平面，n 个一般位置的点上 p ≥ n 个特征一般就满秩了 */
  function rfPool(P, d, rng, wScale, bScale) {
    wScale = wScale == null ? 1 : wScale; bScale = bScale == null ? 0.5 : bScale;
    var W = new Float64Array(P * d), b = new Float64Array(P);
    for (var j = 0; j < P; j++) { for (var k = 0; k < d; k++) W[j * d + k] = wScale * rng.normal(); b[j] = bScale * rng.normal(); }
    return { W: W, b: b, P: P, d: d };
  }
  /** n 个点（X 是 n×d，按行展开）上前 p 个特征的矩阵（n×p，按行展开）。
   *  除以 √p 不改变最小范数解的预测（Φ 乘常数时 Φ⁺ 除以同一个常数），只影响岭回归的 λ 的尺度 */
  function rfMatrix(X, n, pool, p, out) {
    out = out || new Float64Array(n * p); var sc = 1 / Math.sqrt(p), d = pool.d, W = pool.W, b = pool.b;
    for (var i = 0; i < n; i++) for (var j = 0; j < p; j++) { var z = b[j]; for (var k = 0; k < d; k++) z += W[j * d + k] * X[i * d + k]; out[i * p + j] = z > 0 ? z * sc : 0; }
    return out;
  }

  return {
    TC: TC, PC: PC,
    isingLattice: isingLattice, isingEnergy: isingEnergy, isingMag: isingMag, isingInit: isingInit, metroAccept: metroAccept, metropolisSweep: metropolisSweep, wolffStep: wolffStep, yangM: yangM,
    percLabel: percLabel, spanThreshold: spanThreshold,
    surface: surface, OPTIMIZERS: OPTIMIZERS, optInit: optInit, optStep: optStep,
    cholSolve: cholSolve, svdThin: svdThin, qrThin: qrThin, minNormSolve: minNormSolve, ridgeSolve: ridgeSolve,
    legendre: legendre, polyFit: polyFit, polyEval: polyEval, biasVariance: biasVariance, polyBiasVarExact: polyBiasVarExact,
    rfPool: rfPool, rfMatrix: rfMatrix
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = QL_MLANIM;

/* ====================================================================== *
 *  页面上的模拟：A.renderSim(card, keep, dataView)
 * ====================================================================== */
if (typeof MLA !== "undefined") (function (A) {
  "use strict";
  var h = A.h, V = QLMLViz, QL = A.QL, F = A.F, G = A.G, P = A.P, M = QL_MLANIM;
  var mem = {};                                  // 每个模拟的设定与状态：视图重画以后接着用（同一次打开页面期间）
  var stats = A.animStats = { frames: 0, live: 0, made: 0 };   // 给测试看：一共画了多少帧、还有几个循环活着

  /* ---------- 样式（只有这个文件用，就放在这里） ---------- */
  function injectCss() {
    if (document.getElementById("mlAnimCss")) return;
    var css = [
      ".an-stage { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: 14px; align-items: start; }",
      ".an-stage.even { grid-template-columns: repeat(2, minmax(0, 1fr)); }",
      "@media (max-width: 760px) { .an-stage, .an-stage.even { grid-template-columns: minmax(0, 1fr); } }",
      ".an-col { min-width: 0; display: grid; gap: 8px; align-content: start; }",
      ".an-sl { display: inline-flex; align-items: center; gap: 6px; flex: 1 1 220px; min-width: 0; max-width: 100%; }",
      ".an-sl > .t { white-space: nowrap; }",
      ".an-track { position: relative; flex: 1 1 90px; min-width: 70px; display: flex; align-items: center; }",
      ".an-track.marked { padding-bottom: 11px; }",
      ".an-track input[type=range] { width: 100%; margin: 0; min-width: 0; }",
      ".an-mark { position: absolute; top: 0; bottom: 0; width: 0; pointer-events: none; }",
      ".an-mark i { position: absolute; left: -1px; top: 1px; height: 14px; border-left: 2px solid var(--c-s3); opacity: 0.85; }",
      ".an-mark b { position: absolute; bottom: -1px; transform: translateX(-50%); font: 600 9.5px/1 var(--font-mono); color: var(--c-s3); white-space: nowrap; }",
      ".an-sl output { font: 500 12px var(--font-mono); color: var(--ink); min-width: 3.4em; text-align: right; font-variant-numeric: tabular-nums; }",
      ".an-stats { display: flex; flex-wrap: wrap; gap: 2px 14px; font-size: 12px; color: var(--muted); }",
      ".an-stats b { font: 500 12px var(--font-mono); color: var(--ink); font-variant-numeric: tabular-nums; }",
      ".an-tbl { border-collapse: collapse; width: 100%; font-size: 12px; }",
      ".an-tbl td, .an-tbl th { padding: 2px 8px 2px 0; text-align: left; border-bottom: 1px solid var(--line); white-space: nowrap; }",
      ".an-tbl th { color: var(--muted); font-weight: 500; }",
      ".an-tbl td.num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }",
      ".an-tbl td.st { color: var(--muted); white-space: normal; }",
      ".an-key { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; vertical-align: 0; background: var(--k); }",
      ".an-cv canvas { touch-action: manipulation; }",
      ".an-cv.click canvas { cursor: crosshair; }",
      ".an-eq { font-size: 12.5px; color: var(--ink2); line-height: 1.7; margin: 2px 0 0; }",
      ".an-eq b { font-family: var(--font-mono); font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }"
    ].join("\n");
    var st = document.createElement("style"); st.id = "mlAnimCss"; st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------- 小工具 ---------- */
  function reduced() { try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; } }
  function now() { return window.performance && performance.now ? performance.now() : Date.now(); }
  var TH = null, THt = 0, themeSubs = [];
  /** 主题色（每半秒最多读一次 CSS 变量）。明暗主题切换时清掉缓存并通知各个模拟重画 */
  function theme() {
    var t = Date.now(); if (TH && t - THt < 500) return TH;
    var css = V.css, c = V.hexRgb;
    TH = { pal: V.palette(), ink: c(css("--c-ink")), ink2: c(css("--c-ink2")), muted: c(css("--c-muted")), grid: c(css("--c-grid")), axis: c(css("--c-axis")), surface: c(css("--c-surface")), neutral: c(css("--c-neutral")),
      seq: V.ramp("--c-seq"), font: css("--font-body") || "sans-serif", mono: css("--font-mono") || "monospace", dark: css("--is-dark") === "1" };
    THt = t; return TH;
  }
  function themeChanged() { TH = null; themeSubs.slice().forEach(function (f) { try { f(); } catch (e) {} }); }
  function onTheme(f) { themeSubs.push(f); return function () { var i = themeSubs.indexOf(f); if (i >= 0) themeSubs.splice(i, 1); }; }
  try { var mq = window.matchMedia("(prefers-color-scheme: dark)"); if (mq.addEventListener) mq.addEventListener("change", themeChanged); else if (mq.addListener) mq.addListener(themeChanged); } catch (e) {}
  try { new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] }); } catch (e) {}
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  /** ImageData 的一个像素按 32 位整数写（小端序：A B G R） */
  function pack(c) { return ((255 << 24) | ((Math.round(c[2]) & 255) << 16) | ((Math.round(c[1]) & 255) << 8) | (Math.round(c[0]) & 255)) >>> 0; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function show(el, on) { el.style.display = on ? "" : "none"; }
  function sci(v) { if (!(v === v)) return "—"; var a = Math.abs(v); return a !== 0 && (a < 1e-3 || a >= 1e5) ? v.toExponential(1).replace("e-", "e−").replace("e+", "e") : G(v); }

  /** 动画循环：只在"正在播放、卡片在视野里、页面在前台、画布还在页面上"时请求下一帧。
   *  tick(dt) 返回 false 就暂停。own(x) 登记要跟着一起销毁的东西（图表、画布的 ResizeObserver、退订函数） */
  function Loop(el, tick, onState) {
    var self = this;
    this.el = el; this.tick = tick; this.onState = onState || null; this.playing = false; this.raf = 0; this.dead = false; this.vis = true; this.last = 0; this.parts = [];
    this._vis = function () { if (!document.hidden) self.kick(); };
    document.addEventListener("visibilitychange", this._vis);
    if (window.IntersectionObserver) { this.io = new IntersectionObserver(function (es) { self.vis = es[es.length - 1].isIntersecting; if (self.vis) self.kick(); }, { rootMargin: "200px 0px" }); this.io.observe(el); }
    stats.live++; stats.made++;
  }
  Loop.prototype.kick = function () {
    if (this.dead || this.raf || !this.playing || !this.vis || document.hidden) return;
    var self = this; this.last = 0; this.raf = requestAnimationFrame(function (t) { self.frame(t); });
  };
  Loop.prototype.frame = function (t) {
    this.raf = 0;
    if (this.dead) return;
    if (!document.body.contains(this.el)) { this.destroy(); return; }
    if (!this.playing || document.hidden || !this.vis) return;
    var dt = this.last ? Math.min(100, t - this.last) : 16.7; this.last = t;
    stats.frames++;
    var r; try { r = this.tick(dt); } catch (e) { console.error(e); r = false; }
    if (r === false) { this.pause(); return; }
    var self = this; this.raf = requestAnimationFrame(function (t2) { self.frame(t2); });
  };
  Loop.prototype.play = function () { if (this.dead) return; if (!this.playing) { this.playing = true; if (this.onState) this.onState(true); } this.kick(); };
  Loop.prototype.pause = function () { if (this.playing) { this.playing = false; if (this.onState) this.onState(false); } if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; } };
  Loop.prototype.toggle = function () { if (this.playing) this.pause(); else this.play(); };
  Loop.prototype.own = function (x) { if (x) this.parts.push(x); return x; };
  Loop.prototype.destroy = function () {
    if (this.dead) return;
    this.dead = true; this.playing = false;
    if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0;
    document.removeEventListener("visibilitychange", this._vis);
    if (this.io) this.io.disconnect();
    this.parts.forEach(function (p) { try { if (typeof p === "function") p(); else if (p.destroy) p.destroy(); else if (p.ro) p.ro.disconnect(); } catch (e) {} });
    this.parts = [];
    stats.live--;
  };

  /** 跟着宽度缩放的画布（QLMLViz.canvasBox）。尺寸变化时整张重画（resized = true）；frame() 只重画内容、不重新分配画布 */
  function stage(host, aspect, draw, opt) {
    var S = { w: 0, h: 0 };
    S.box = V.canvasBox(host, aspect, function (ctx, w, hh) { S.w = w; S.h = hh; draw(ctx, w, hh, true); }, opt);
    S.el = S.box.el; S.canvas = S.box.canvas;
    S.frame = function () { if (!S.w) return; var cv = S.canvas, dpr = cv.width / S.w, ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, S.w, S.h); draw(ctx, S.w, S.h, false); };
    S.full = function () { S.box.redraw(); };
    S.destroy = function () { if (S.box.ro) S.box.ro.disconnect(); };
    return S;
  }
  function button(text, onclick, title) { return h("button", { class: "btn small", type: "button", text: text, title: title || null, onclick: onclick }); }
  function playButton() { var b = button("▶ 播放", null); b.setState = function (on) { b.textContent = on ? "❚❚ 暂停" : "▶ 播放"; b.setAttribute("aria-pressed", on ? "true" : "false"); }; return b; }
  function select(label, options, value, onchange) {
    var s = h("select", { "aria-label": label, onchange: function () { onchange(s.value); } }, options.map(function (o) { return h("option", { value: String(o[0]), text: o[1], selected: String(o[0]) === String(value) }); }));
    return { el: h("label", null, label + " ", s), input: s };
  }
  /** 滑块：o = { label, min, max, step, value, fmt, log（对数刻度）, marks: [{ v, text, title }], onInput(v), onChange(v) } */
  function slider(o) {
    var R = 1000, toPos, fromPos, fmt = o.fmt || G;
    if (o.log) { var l0 = Math.log(o.min), l1 = Math.log(o.max); toPos = function (v) { return Math.round((Math.log(v) - l0) / (l1 - l0) * R); }; fromPos = function (q) { return Math.exp(l0 + (l1 - l0) * q / R); }; }
    else { toPos = function (v) { return v; }; fromPos = function (q) { return +q; }; }
    var inp = h("input", { type: "range", min: o.log ? 0 : o.min, max: o.log ? R : o.max, step: o.log ? 1 : (o.step || "any"), value: toPos(o.value), "aria-label": o.label });
    var out = h("output", { text: fmt(o.value) }), track = h("span", { class: "an-track" + (o.marks && o.marks.length ? " marked" : "") }, inp), cur = o.value;
    (o.marks || []).forEach(function (mk) {
      var lo = +inp.min, hi = +inp.max, fr = clamp((toPos(mk.v) - lo) / (hi - lo), 0, 1);
      track.appendChild(h("span", { class: "an-mark", style: { left: "calc(8px + (100% - 16px) * " + fr.toFixed(4) + ")" }, title: mk.title || "" }, h("i"), h("b", { text: mk.text })));
    });
    inp.addEventListener("input", function () { cur = fromPos(inp.value); out.textContent = fmt(cur); if (o.onInput) o.onInput(cur); });
    inp.addEventListener("change", function () { if (o.onChange) o.onChange(cur); });
    return { el: h("label", { class: "an-sl" }, h("span", { class: "t", text: o.label }), track, out), input: inp,
      get: function () { return cur; }, set: function (v) { cur = v; inp.value = toPos(v); out.textContent = fmt(v); }, disable: function (b) { inp.disabled = !!b; } };
  }
  function statLine(host, keys) {
    var el = h("div", { class: "an-stats", "aria-live": "off" }), refs = {};
    keys.forEach(function (k) { var b = h("b", { text: "—" }), l = h("span", { text: k[1] + " " }); refs[k[0]] = { b: b, l: l }; el.appendChild(h("span", null, l, b)); });
    host.appendChild(el);
    return { el: el, set: function (id, v) { var r = refs[id]; if (r && r.b.textContent !== v) r.b.textContent = v; }, label: function (id, t) { var r = refs[id]; if (r && r.l.textContent !== t + " ") r.l.textContent = t + " "; } };
  }
  function chartBox(host, height, loop) { var ch = V.chart(host, height); loop.own(ch); return ch; }
  /** 对数坐标：把数值换成 log10 画在线性轴上，刻度标成 10 的幂。QLChart 自带的对数轴每个数量级标一个刻度，跨十几个数量级时挤成一团 */
  function lg(v, floor) { return Math.log(Math.max(floor || 1e-300, v)) / Math.LN10; }
  function lgArr(a, floor) { return a.map(function (v) { return lg(v, floor); }); }
  function pow10(v) { var r = Math.round(v); if (Math.abs(v - r) < 1e-6) return Math.abs(r) <= 3 ? G(Math.pow(10, r)) : "1e" + (r < 0 ? "−" + (-r) : String(r)); return G(+Math.pow(10, v).toPrecision(2)); }
  function note(host, text) { var el = h("p", { class: "ml-note", text: text || "" }); host.appendChild(el); return { el: el, set: function (t) { el.textContent = t || ""; show(el, !!t); } }; }
  /** 按时间节流：至少隔 ms 毫秒才真正执行一次 */
  function every(ms) { var last = -1e9; return function (force) { var t = now(); if (force || t - last >= ms) { last = t; return true; } return false; }; }
  function seedOf() { try { return A.dsSeed ? A.dsSeed() : 1; } catch (e) { return 1; } }

  /* ====================================================================== *
   *  伊辛模型：实时的 Metropolis / Wolff
   * ====================================================================== */
  function isingSim(card, dataView) {
    var TC = M.TC, IMG = QL.mlimage || null, dsL = 16;
    try { dsL = +(A.dsParams().L) || 16; } catch (e) {}
    var m = mem.ising || (mem.ising = { T: 2.27, L: 64, algo: "metro", speed: "3", gen: 0 });
    var rng = new QL.RNG(seedOf(), 4242, m.gen);
    function fresh(L) {
      var lat = M.isingLattice(L), s = M.isingInit(new Int8Array(L * L), "random", rng);
      return { L: L, N: L * L, lat: lat, s: s, st: { E: M.isingEnergy(s, lat), M: M.isingMag(s), acc: 0, tries: 0, cl: 0, nc: 0 }, steps: 0, tx: [], tm: [], te: [], marks: [], sweep: null,
        pts: { cool: { T: [], m: [], e: [] }, heat: { T: [], m: [], e: [] } } };
    }
    var w = m.state && m.state.L === m.L ? m.state : (m.state = fresh(m.L));
    var exCache = {};
    function exact(T, L) {
      var key = T.toFixed(4) + "|" + L; if (exCache[key]) return exCache[key];
      var e = null; try { e = IMG && IMG.kaufmanEnergy ? IMG.kaufmanEnergy(T, L).e : IMG && IMG.onsagerEnergy ? IMG.onsagerEnergy(T) : null; } catch (er) { e = null; }
      return (exCache[key] = { m: M.yangM(T), e: e });
    }
    function curT() { return w.sweep ? w.sweep.T : m.T; }
    var SW = { hi: 4.0, lo: 1.0, dT: 0.1, therm: 40, meas: 80 };
    function step() {
      var beta = 1 / curT();
      if (m.algo === "wolff") M.wolffStep(w.s, w.lat, beta, rng, w.st); else M.metropolisSweep(w.s, w.lat, beta, rng, w.st);
      w.steps++;
      var z = w.sweep; if (!z) return;
      z.n++;
      if (z.n > SW.therm) { z.sm += Math.abs(w.st.M) / w.N; z.se += w.st.E / w.N; z.cnt++; }
      if (z.n >= SW.therm + SW.meas) {
        var arr = z.dir < 0 ? w.pts.cool : w.pts.heat; arr.T.push(z.T); arr.m.push(z.sm / z.cnt); arr.e.push(z.se / z.cnt);
        var nt = Math.round((z.T + z.dir * SW.dT) * 1000) / 1000;
        if (z.dir < 0 && nt < SW.lo - 1e-9) { z.dir = 1; nt = Math.round((SW.lo + SW.dT) * 1000) / 1000; }
        if (z.dir > 0 && nt > SW.hi + 1e-9) { endSweep(); return; }
        z.T = nt; z.n = 0; z.sm = 0; z.se = 0; z.cnt = 0; chartsDue = true;
      }
    }
    function startSweep() { w.pts = { cool: { T: [], m: [], e: [] }, heat: { T: [], m: [], e: [] } }; w.sweep = { dir: -1, T: SW.hi, n: 0, sm: 0, se: 0, cnt: 0 }; mark(); tSl.disable(true); swBtn.textContent = "停止扫温度"; chartsDue = true; loop.play(); }
    function endSweep() { w.sweep = null; tSl.disable(false); tSl.set(m.T); mark(); swBtn.textContent = "扫温度"; chartsDue = true; }
    function mark() { var last = w.marks[w.marks.length - 1]; if (last !== w.steps) w.marks.push(w.steps); if (w.marks.length > 6) w.marks.splice(0, w.marks.length - 6); }

    // ---- 控件 ----
    var pb = playButton();
    var tSl = slider({ label: "温度 T", min: 0.5, max: 5, step: 0.01, value: m.T, fmt: function (v) { return F(v, 2); }, marks: [{ v: TC, text: "T_c", title: "T_c = 2/ln(1+√2) ≈ 2.2692" }],
      onInput: function (v) { m.T = v; mark(); chartsDue = true; if (!loop.playing) still(); } });
    var Ls = [16, 32, 64, 128]; if (Ls.indexOf(dsL) < 0) Ls.unshift(dsL);
    var lSel = select("格子", Ls.map(function (L) { return [L, L + " × " + L + (L === dsL ? "（数据集）" : "")]; }), m.L, function (v) { m.L = +v; w = m.state = fresh(m.L); offImg = null; tSl.disable(false); tSl.set(m.T); swBtn.textContent = "扫温度"; full(); });
    var aSel = select("算法", [["metro", "Metropolis（棋盘）"], ["wolff", "Wolff 团簇"]], m.algo, function (v) { m.algo = v; w.st.cl = 0; w.st.nc = 0; w.st.acc = 0; w.st.tries = 0; mark(); still(); });
    var spSel = select("每帧", [["1", "1 步"], ["3", "3 步"], ["10", "10 步"], ["30", "30 步"], ["max", "尽量多"]], m.speed, function (v) { m.speed = v; });
    var swBtn = button("扫温度", function () { if (w.sweep) endSweep(); else startSweep(); }, "从 T = 4 降到 1、再升回 4，每个温度先热化 40 步、再测 80 步");
    var ctl = [pb, button("单步", function () { loop.pause(); step(); record(); still(); }, "走一步：Metropolis 扫一遍，或者翻一个 Wolff 团簇"),
      button("重置", function () { m.gen++; M.isingInit(w.s, "random", rng); resync(); }, "每个自旋独立地取 ±1（相当于无穷高温）"),
      button("全部朝上", function () { M.isingInit(w.s, "up"); resync(); }, "相当于零温"),
      button("T → T_c", function () { m.T = Math.round(TC * 1000) / 1000; tSl.set(m.T); mark(); chartsDue = true; if (!loop.playing) still(); }),
      tSl.el, aSel.el, lSel.el, spSel.el, swBtn];
    function resync() { w.st.E = M.isingEnergy(w.s, w.lat); w.st.M = M.isingMag(w.s); mark(); record(); still(); }
    var foot = "把 T 拖到 T_c ≈ 2.269（绿色刻度）以下：同色的畴越长越大，|m| 升向 Yang 的精确值；拖到上面：畴碎成雪花点，|m| 落到 0 附近。T_c 附近弛豫最慢（临界慢化），换成 Wolff 团簇算法就快得多。" +
      (dataView ? "数据集的每个样本就是一张这样的 " + dsL + " × " + dsL + " 构型，标签是 T < T_c。" : "");
    var c = card("伊辛模型 · 实时模拟", { wide: true, help: "anim:ising", ctl: ctl, foot: foot, id: "simIsing" });
    var stg = h("div", { class: "an-stage" }), left = h("div", { class: "an-col" }), right = h("div", { class: "an-col" });
    stg.appendChild(left); stg.appendChild(right); c.body.appendChild(stg);

    var loop = new Loop(c.el, tick, function (on) { pb.setState(on); });
    pb.addEventListener("click", function () { loop.toggle(); });
    // ---- 画格子 ----
    var off = document.createElement("canvas"), offImg = null, offU32 = null;
    var cv = loop.own(stage(left, 1, paint, { label: "伊辛模型的自旋构型", maxH: 440, cls: "square" }));
    function paint(ctx, wd, hh) {
      var L = w.L, th = theme();
      if (!offImg || off.width !== L) { off.width = L; off.height = L; offImg = off.getContext("2d").createImageData(L, L); offU32 = new Uint32Array(offImg.data.buffer); }
      var up = pack(th.pal[0]), dn = pack(mix(th.surface, th.ink, th.dark ? 0.17 : 0.09)), sgn = m.algo === "wolff" && w.st.M < 0 ? -1 : 1, s = w.s;
      for (var i = 0; i < w.N; i++) offU32[i] = s[i] * sgn > 0 ? up : dn;
      off.getContext("2d").putImageData(offImg, 0, 0);
      var side = Math.min(wd, hh); ctx.imageSmoothingEnabled = false; ctx.drawImage(off, 0, 0, side, side);
      ctx.strokeStyle = V.rgb(th.axis); ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, side - 1, side - 1);
    }
    var sl = statLine(left, [["T", "T ="], ["r", "T/T_c ="], ["n", "步数"], ["m", "|m| ="], ["e", "e ="], ["x", "接受率"]]);
    left.appendChild(h("p", { class: "ml-note", text: "|m| = |Σσ_i|/N 是磁化的绝对值（环面上 ⟨m⟩ = 0，只能看绝对值），e = H/N 是每个自旋的能量。Wolff 每一步翻一整个团簇，低温时几乎整张格子一起翻，所以显示时把多数自旋固定画成蓝色。" }));
    // ---- 图 ----
    var trCh = chartBox(right, 250, loop), swNote = note(right), swCh = chartBox(right, 250, loop);
    var chartsDue = true, chartT = every(220), statT = every(120);
    function record() { w.tx.push(w.steps); w.tm.push(Math.abs(w.st.M) / w.N); w.te.push(w.st.E / w.N); if (w.tx.length > 600) { w.tx.splice(0, w.tx.length - 600); w.tm.splice(0, w.tm.length - 600); w.te.splice(0, w.te.length - 600); } }
    function drawTrace() {
      var T = curT(), ex = exact(T, w.L), x0 = w.tx.length ? w.tx[0] : 0, lay1 = [], lay2 = [];
      w.marks = w.marks.filter(function (s) { return s >= x0; });
      w.marks.forEach(function (s) { lay1.push({ kind: "vline", x: s, color: "grid", width: 1 }); lay2.push({ kind: "vline", x: s, color: "grid", width: 1 }); });
      lay1.push({ kind: "hline", y: ex.m, color: "s3", width: 1.2, dash: [5, 3], label: T < TC ? "Yang：M(T) = " + F(ex.m, 3) : "T ≥ T_c：M = 0" });
      lay1.push({ kind: "line", x: w.tx, y: w.tm, color: "s1", width: 1.6 });
      if (ex.e != null) lay2.push({ kind: "hline", y: ex.e, color: "s3", width: 1.2, dash: [5, 3], label: "精确值 " + F(ex.e, 3) + "（" + w.L + "×" + w.L + " 环面）" });
      lay2.push({ kind: "line", x: w.tx, y: w.te, color: "s2", width: 1.6 });
      trCh.set({ x: { label: m.algo === "wolff" ? "步数（一步 = 翻一个团簇）" : "步数（一步 = 扫一遍全部自旋）", domain: w.tx.length > 1 ? [w.tx[0], Math.max(w.tx[w.tx.length - 1], w.tx[0] + 10)] : [0, 10] },
        panels: [{ y: { label: "|m|（磁化的绝对值）", domain: [0, 1.15], fmt: function (v) { return F(v, 1); } }, layers: lay1 }, { y: { label: "e（每个自旋的能量）", domain: [-2.1, 0.3], fmt: function (v) { return F(v, 1); } }, layers: lay2 }] });
    }
    var refT = [], refM = [], refE = [], refL = 0;
    function drawSweep() {
      var c0 = w.pts.cool, h0 = w.pts.heat;
      swNote.set(!c0.T.length && !h0.T.length && !w.sweep ? "下图：点“扫温度”，T 从 4 慢慢降到 1、再升回 4，每个温度先热化 40 步、再测 80 步，画出 ⟨|m|⟩ 和 ⟨e⟩ 随 T 的变化（虚线是精确值）。" : "");
      if (refL !== w.L) { refL = w.L; refT = []; refM = []; refE = []; for (var T = 0.9; T <= 4.1001; T += 0.02) { var ex = exact(T, w.L); refT.push(T); refM.push(ex.m); refE.push(ex.e == null ? NaN : ex.e); } }
      var l1 = [{ kind: "vline", x: TC, color: "s3", width: 1, dash: [4, 3], label: "T_c" }, { kind: "line", x: refT, y: refM, color: "muted", width: 1.3, dash: [5, 3] }];
      var l2 = [{ kind: "vline", x: TC, color: "s3", width: 1, dash: [4, 3] }, { kind: "line", x: refT, y: refE, color: "muted", width: 1.3, dash: [5, 3] }];
      [[c0, "s1"], [h0, "s2"]].forEach(function (q) { if (!q[0].T.length) return; l1.push({ kind: "line", x: q[0].T, y: q[0].m, color: q[1], width: 1.4 }, { kind: "points", x: q[0].T, y: q[0].m, color: q[1], r: 2.6, ring: false }); l2.push({ kind: "line", x: q[0].T, y: q[0].e, color: q[1], width: 1.4 }, { kind: "points", x: q[0].T, y: q[0].e, color: q[1], r: 2.6, ring: false }); });
      if (w.sweep) { l1.push({ kind: "vline", x: w.sweep.T, color: "ink2", width: 1.2 }); l2.push({ kind: "vline", x: w.sweep.T, color: "ink2", width: 1.2 }); }
      swCh.set({ x: { label: "温度 T", domain: [0.9, 4.1] }, panels: [{ y: { label: "⟨|m|⟩（每个温度上的平均）", domain: [0, 1.15], fmt: function (v) { return F(v, 1); } }, layers: l1 }, { y: { label: "⟨e⟩", domain: [-2.1, 0.3], fmt: function (v) { return F(v, 1); } }, layers: l2 }],
        legend: [{ name: "降温", color: "s1" }, { name: "升温", color: "s2" }, { name: "精确值（|m|：L = ∞，Yang；e：" + w.L + "×" + w.L + "，Kaufman）", color: "muted" }] });
    }
    function updStats() {
      var T = curT(); sl.set("T", F(T, 3)); sl.set("r", F(T / TC, 3)); sl.set("n", String(w.steps)); sl.set("m", F(Math.abs(w.st.M) / w.N, 3)); sl.set("e", F(w.st.E / w.N, 3));
      sl.label("x", m.algo === "wolff" ? "团簇平均占" : "接受率");
      sl.set("x", m.algo === "wolff" ? (w.st.nc ? P(w.st.cl / w.st.nc / w.N, 1) : "—") : (w.st.tries ? P(w.st.acc / w.st.tries, 1) : "—"));
      if (w.st.tries > 2e6) { w.st.acc *= 0.5; w.st.tries *= 0.5; } if (w.st.nc > 4000) { w.st.cl *= 0.5; w.st.nc *= 0.5; }
    }
    function tick() {
      var want = m.speed === "max" ? 1e9 : +m.speed, t0 = now(), k = 0;
      while (k < want) { step(); k++; if (now() - t0 > 6) break; }
      record(); cv.frame();
      if (statT()) updStats();
      if (chartT() || chartsDue) { var sw = chartsDue || !!w.sweep; chartsDue = false; drawTrace(); if (sw) drawSweep(); }
      if (w.sweep) tSl.set(w.sweep.T);
      return true;
    }
    function still() { cv.frame(); updStats(); drawTrace(); drawSweep(); }
    function full() { cv.full(); updStats(); drawTrace(); drawSweep(); }
    loop.own(onTheme(function () { cv.full(); trCh.draw(); swCh.draw(); }));
    if (!w.tx.length) record();
    if (w.sweep) { tSl.disable(true); tSl.set(w.sweep.T); swBtn.textContent = "停止扫温度"; }
    still();
    if (!reduced()) loop.play();
    else if (w.steps === 0) { for (var q0 = 0; q0 < 200; q0++) step(); record(); still(); }   // 不播放：先在后台走 200 步，静止的那一帧才像这个温度下的样子
    return loop;
  }

  /* ====================================================================== *
   *  逾渗：团簇、连通、升高 p
   * ====================================================================== */
  function percSim(card, dataView) {
    var PC = M.PC, dsL = 16, dsW = 0.08;
    try { var dp = A.dsParams(); dsL = +dp.L || 16; dsW = dp.w != null ? +dp.w : 0.08; } catch (e) {}
    var m = mem.perc || (mem.perc = { L: 64, p: 0.5927, gen: 0, R: null });
    var rng = new QL.RNG(seedOf(), 5150, m.gen), SIZES = [16, 32, 64], TARGET = 300;
    if (!m.R) { m.R = {}; SIZES.forEach(function (L) { m.R[L] = []; }); m.rng = new QL.RNG(seedOf(), 5151, 0); m.ws = {}; }
    var w = null;
    function fresh() { var L = m.L, N = L * L, u = new Float64Array(N); for (var i = 0; i < N; i++) u[i] = rng.u(); w = { L: L, N: N, u: u, open: new Uint8Array(N), ws: {}, lab: null, pstar: M.spanThreshold(u, L), colors: null }; relabel(); }
    function relabel() { for (var i = 0; i < w.N; i++) w.open[i] = w.u[i] < m.p ? 1 : 0; w.lab = M.percLabel(w.open, w.L, w.ws); w.colors = null; }
    var rising = false, RATE = 0.025, P0 = 0.45, P1 = 0.75;
    function sampleSome(budget) {
      var t0 = now(), any = false;
      while (now() - t0 < budget) {
        var L = 0; for (var q = 0; q < SIZES.length; q++) if (m.R[SIZES[q]].length < TARGET) { L = SIZES[q]; break; }
        if (!L) break;
        var N = L * L, u = new Float64Array(N); for (var i = 0; i < N; i++) u[i] = m.rng.u();
        m.R[L].push(M.spanThreshold(u, L, m.ws)); any = true;
      }
      return any;
    }
    function samplingDone() { return SIZES.every(function (L) { return m.R[L].length >= TARGET; }); }
    // ---- 控件 ----
    var pb = playButton();
    var pSl = slider({ label: "开放概率 p", min: 0.3, max: 0.9, step: 0.001, value: m.p, fmt: function (v) { return F(v, 3); }, marks: [{ v: PC, text: "p_c", title: "p_c ≈ 0.59274605（Jacobsen 2015）" }],
      onInput: function (v) { m.p = v; if (rising) { rising = false; btnText(); } relabel(); still(); } });
    var Ls = [16, 32, 64, 128]; if (Ls.indexOf(dsL) < 0) Ls.unshift(dsL);
    var lSel = select("格子", Ls.map(function (L) { return [L, L + " × " + L + (dataView && L === dsL ? "（数据集）" : "")]; }), m.L, function (v) { m.L = +v; fresh(); full(); });
    var ctl = [pb, button("换一张格子", function () { m.gen++; fresh(); still(); }, "重新给每个格点抽一个均匀随机数 u；u < p 的格点开放"), pSl.el, lSel.el];
    var foot = "p 小于 p_c ≈ 0.5927（绿色刻度）时只有零碎的小团；越过 p_c，一个从顶连到底的团（橙色）突然出现。右图是上下连通的概率 R_L(p)：格子越大曲线越陡，几条曲线大约在 p_c、高度 1/2 附近相交。" +
      (dataView ? "数据集里每个样本的 p 在 [p_c − " + G(dsW) + ", p_c + " + G(dsW) + "] 上均匀（右图浅色带），标签就是“连不连通”。" : "");
    var c = card("逾渗 · 团簇与连通", { wide: true, help: "anim:perc", ctl: ctl, foot: foot, id: "simPerc" });
    var stg = h("div", { class: "an-stage" }), left = h("div", { class: "an-col" }), right = h("div", { class: "an-col" });
    stg.appendChild(left); stg.appendChild(right); c.body.appendChild(stg);
    var loop = new Loop(c.el, tick, function () { btnText(); });
    function btnText() { pb.textContent = rising && loop.playing ? "❚❚ 暂停" : "▶ 升高 p"; pb.setAttribute("aria-pressed", rising && loop.playing ? "true" : "false"); }
    pb.title = "让 p 从 0.45 慢慢升到 0.75，看团簇怎样长大、合并";
    pb.addEventListener("click", function () { if (loop.playing && rising) { rising = false; btnText(); return; } if (m.p >= P1 - 1e-6) { m.p = P0; relabel(); } rising = true; loop.play(); btnText(); });
    fresh();
    var off = document.createElement("canvas"), offImg = null, offU32 = null;
    var cv = loop.own(stage(left, 1, paint, { label: "逾渗格子：开放的格点按团簇着色", maxH: 440, cls: "square" }));
    function clusterColors() {
      var th = theme(), lab = w.lab, K = lab.K, cols = new Uint32Array(K), cyc = [0, 2, 3, 4, 5, 6, 7], small = pack(mix(th.surface, th.neutral, 0.6)), span = pack(th.pal[1]);
      var pal = cyc.map(function (i) { return pack(mix(th.surface, th.pal[i], th.dark ? 0.62 : 0.5)); });
      for (var k = 0; k < K; k++) cols[k] = lab.spans[k] ? span : lab.size[k] < 4 ? small : pal[(QL.hash32 ? QL.hash32(lab.first[k] + 7 * w.L) : lab.first[k] * 2654435761) % pal.length];
      w.colors = cols; w.closed = pack(mix(th.surface, th.ink, th.dark ? 0.1 : 0.05));
    }
    function paint(ctx, wd, hh) {
      var L = w.L, th = theme();
      if (!offImg || off.width !== L) { off.width = L; off.height = L; offImg = off.getContext("2d").createImageData(L, L); offU32 = new Uint32Array(offImg.data.buffer); }
      if (!w.colors) clusterColors();
      var lab = w.lab.label, cols = w.colors, cl = w.closed;
      for (var i = 0; i < w.N; i++) offU32[i] = lab[i] < 0 ? cl : cols[lab[i]];
      off.getContext("2d").putImageData(offImg, 0, 0);
      var side = Math.min(wd, hh); ctx.imageSmoothingEnabled = false; ctx.drawImage(off, 0, 0, side, side);
      ctx.strokeStyle = V.rgb(th.axis); ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, side - 1, side - 1);
    }
    var sl = statLine(left, [["p", "p ="], ["o", "开放"], ["k", "团簇"], ["b", "最大的团"], ["s", "上下连通"], ["ps", "这张格子的 p* ="]]);
    left.appendChild(h("p", { class: "ml-note", text: "每个格点有一个固定的随机数 u，u < p 就开放，所以 p 变大时格点只开不关，团簇只会长大、合并。p* 是这张格子第一次上下连通时的 p（按 u 从小到大逐个打开格点、用并查集判断，Newman–Ziff 算法）。" }));
    var ch = chartBox(right, 290, loop), chartT = every(250), grid = [];
    for (var q = 0; q <= 200; q++) grid.push(0.4 + 0.4 * q / 200);
    function cdf(arr) { var s = arr.slice().sort(function (a, b) { return a - b; }), out = [], j = 0; for (var q = 0; q < grid.length; q++) { while (j < s.length && s[j] < grid[q]) j++; out.push(s.length ? j / s.length : NaN); } return out; }
    function drawChart() {
      var layers = [], legend = [], cols = ["s4", "s1", "s7"];
      if (dataView) layers.push({ kind: "vband", x0: PC - dsW, x1: PC + dsW, color: "s4", alpha: 0.1 });
      layers.push({ kind: "hline", y: 0.5, color: "muted", width: 1, dash: [3, 3], label: "1/2" }, { kind: "vline", x: PC, color: "s3", width: 1.2, dash: [4, 3], label: "p_c" });
      SIZES.forEach(function (L, i) { if (!m.R[L].length) return; layers.push({ kind: "line", x: grid, y: cdf(m.R[L]), color: cols[i], width: 2 }); legend.push({ name: "L = " + L + "（" + m.R[L].length + " 张格子）", color: cols[i] }); });
      layers.push({ kind: "vline", x: m.p, color: "ink2", width: 1.3, label: "现在", row: 1 });
      ch.set({ x: { label: "开放概率 p", domain: [0.4, 0.8] }, panels: [{ y: { label: "上下连通的概率 R_L(p)", domain: [0, 1.02], fmt: function (v) { return P(v, 0); } }, layers: layers }], legend: legend,
        hover: { xs: grid, tip: function (i) { return { title: "p = " + F(grid[i], 3), rows: SIZES.filter(function (L) { return m.R[L].length; }).map(function (L, k) { return { name: "L = " + L, color: cols[SIZES.indexOf(L)], value: P(cdf(m.R[L])[i], 1) }; }) }; } } });
    }
    function updStats() {
      var lab = w.lab, open = 0; for (var i = 0; i < w.N; i++) open += w.open[i];
      sl.set("p", F(m.p, 3)); sl.set("o", P(open / w.N, 1)); sl.set("k", String(lab.K)); sl.set("b", lab.largest >= 0 ? P(lab.size[lab.largest] / w.N, 1) + " 的格点" : "—");
      sl.set("s", lab.nSpan ? "是" : "否"); sl.set("ps", F(w.pstar, 4));
    }
    function tick(dt) {
      if (rising) { m.p = Math.min(P1, m.p + RATE * dt / 1000); pSl.set(m.p); relabel(); cv.frame(); updStats(); if (m.p >= P1) { rising = false; btnText(); } }
      var more = sampleSome(rising ? 3 : 6);
      if (chartT() || (!rising && !more)) drawChart();
      return rising || !samplingDone();
    }
    function still() { cv.frame(); updStats(); drawChart(); }
    function full() { cv.full(); updStats(); drawChart(); }
    loop.own(onTheme(function () { w.colors = null; cv.full(); ch.draw(); }));
    still();
    if (reduced()) { sampleSome(5000); drawChart(); }
    else { rising = !mem.percRose; mem.percRose = true; if (rising && m.p > 0.5) { m.p = P0; relabel(); pSl.set(m.p); still(); } loop.play(); btnText(); }
    return loop;
  }

  /* ====================================================================== *
   *  时间序列：滚动原点
   * ====================================================================== */
  function rollingSim(card, dataView) {
    var L = A.last && !A.stale() && A.last.res && A.last.res.kind === "forecast" ? A.last : null, res = L ? L.res : null;
    var series = (res && res.data && res.data.series) || (A.preview && A.preview.series);
    if (!series || !series.y || series.y.length < 30) return null;
    var stride = series.stride || 1, ys = series.y, T = series.T || ys.length * stride, t1 = series.t1 || Math.floor(T * 0.6), t2 = series.t2 || Math.floor(T * 0.8);
    var H = res ? res.horizon || 1 : Math.max(1, (A.S && A.S.horizon) || 1), revealed = !!(L && (L.revealed || (A.isRevealed && A.isRevealed(L))));
    function yAt(t) { return ys[clamp(Math.round(t / stride), 0, ys.length - 1)]; }
    var dts = res ? 1 : stride;    // 预测往后每一步隔多少个时刻（有结果时是 1；没有结果、序列又被抽稀过时按抽稀后的点算）
    // 所有原点：{ t, which, q }；预测和真值都按原点顺序排好，每个原点 H 个
    var segs = res ? [["valid", res.origins.valid]].concat(revealed && res.origins.test ? [["test", res.origins.test]] : []) : [["valid", [t1 - 1, t2 - 1 - H]]];
    var O = [];
    segs.forEach(function (sg) { var r = sg[1]; if (!r) return; for (var t = r[0], q = 0; t <= r[1]; t += res ? 1 : stride, q++) O.push({ t: t, which: sg[0], q: q }); });
    if (O.length < 3) return null;
    var nO = O.length, eM = new Float64Array(nO), eN = new Float64Array(nO), runM = new Float64Array(nO), runN = new Float64Array(nO);
    function predAt(k, hh) { var o = O[k]; return res ? res.pred[o.which][o.q * H + hh] : NaN; }
    function truthAt(k, hh) { var o = O[k]; return res ? res.truth[o.which][o.q * H + hh] : yAt(o.t + (1 + hh) * dts); }
    /** 原点 t 处的观测 y_t：上一个原点（t − 1）的一步真值就是它，比抽稀过的预览准 */
    function y0At(k) { return res && k > 0 && O[k - 1].t === O[k].t - 1 ? truthAt(k - 1, 0) : yAt(O[k].t); }
    (function () { var sM = 0, sN = 0; for (var k = 0; k < nO; k++) { var a = 0, b = 0, y0 = y0At(k); for (var hh = 0; hh < H; hh++) { var tr = truthAt(k, hh); if (res) a += Math.pow(predAt(k, hh) - tr, 2); b += Math.pow(y0 - tr, 2); } eM[k] = res ? a / H : NaN; eN[k] = b / H; sM += eM[k]; sN += eN[k]; runM[k] = sM / (k + 1); runN[k] = sN / (k + 1); } })();
    var m = mem.roll || (mem.roll = { speed: "15" });
    var k = 0, acc = 0, W = Math.min(100, Math.max(30, Math.floor((t2 - t1) * 0.6))), RM = Math.max(H + 3, Math.round(W * 0.14));
    // ---- 控件 ----
    var pb = playButton();
    var kSl = slider({ label: "原点", min: 0, max: nO - 1, step: 1, value: 0, fmt: function (v) { return "t = " + O[Math.round(v)].t; }, onInput: function (v) { k = Math.round(v); loop.pause(); draw(); } });
    var spSel = select("速度", [["5", "每秒 5 个原点"], ["15", "每秒 15 个"], ["40", "每秒 40 个"], ["120", "每秒 120 个"]], m.speed, function (v) { m.speed = v; });
    var ctl = [pb, button("从头", function () { k = 0; acc = 0; kSl.set(0); draw(); }), kSl.el, spSel.el];
    var foot = res ? "原点 t 每一帧往前走一步：只用 t 和之前的数据，预测之后的 " + H + " 步（蓝线），再和真实值（灰色虚线）比；下图是累计的均方误差，橙色虚线是“明天 = 今天”的朴素预测。模型只在训练段上拟合一次，滚动时不重训。" + (revealed ? "" : "测试段还没有揭晓，所以只滚过验证段。")
      : "还没有预测结果：这里先演示原点怎样滚过验证段，以及朴素预测（明天 = 今天）的累计误差。运行一个时间序列算法以后，这里会换成它的预测。";
    var c = card(res ? "滚动原点 · " + L.algo.name + " 的预测" : "滚动原点 · 朴素预测", { wide: true, help: "anim:rolling", ctl: ctl, foot: foot, id: "simRoll" });
    var loop = new Loop(c.el, tick, function (on) { pb.setState(on); });
    pb.addEventListener("click", function () { if (!loop.playing && k >= nO - 1) { k = 0; acc = 0; } loop.toggle(); });
    var stg = h("div", { class: "an-col" }); c.body.appendChild(stg);
    var chA = chartBox(stg, 250, loop), chB = chartBox(stg, 190, loop), sl = statLine(stg, [["t", "原点"], ["k", "第"], ["e", "这一步的平方误差"], ["rm", "累计 MSE：模型"], ["rn", "朴素"], ["q", "比值"]]);
    var drawT = every(45);
    function draw() {
      var o = O[k], t = o.t, a = Math.max(0, t - W), b = t + RM * dts, hx = [], hy = [], fx = [], fy = [], y0 = y0At(k), px = [t], py = [y0], nx = [t, t + H * dts], ny = [y0, y0];
      for (var i = Math.floor(a / stride); i * stride <= t; i++) { hx.push(i * stride); hy.push(ys[i]); }
      fx.push(t); fy.push(y0); for (var hh = 0; hh < H; hh++) { fx.push(t + (1 + hh) * dts); fy.push(truthAt(k, hh)); }
      if (res) for (hh = 0; hh < H; hh++) { px.push(t + (1 + hh) * dts); py.push(predAt(k, hh)); }
      var layers = [{ kind: "vband", x0: t1, x1: t2, color: "s4", alpha: 0.07 }];
      if (revealed || !res) layers.push({ kind: "vband", x0: t2, x1: T, color: "s8", alpha: 0.05 });
      layers.push({ kind: "line", x: hx, y: hy, color: "neutral", width: 1.4 }, { kind: "line", x: fx, y: fy, color: "ink2", width: 1.3, dash: [4, 3] }, { kind: "line", x: nx, y: ny, color: "s2", width: 1.5, dash: [3, 3] });
      if (res) layers.push({ kind: "line", x: px, y: py, color: "s1", width: 2.2 }, { kind: "points", x: px.slice(1), y: py.slice(1), color: "s1", r: 2.6 });
      layers.push({ kind: "vline", x: t, color: "ink2", width: 1, label: "t = " + t }, { kind: "points", x: [t], y: [y0], color: "ink", r: 3.2 });
      var lo = Infinity, hi = -Infinity; [hy, fy, res ? py : []].forEach(function (arr) { for (var j = 0; j < arr.length; j++) if (isFinite(arr[j])) { if (arr[j] < lo) lo = arr[j]; if (arr[j] > hi) hi = arr[j]; } });
      var padY = (hi - lo) * 0.08 || 1;
      chA.set({ x: { label: "时刻（浅色底：验证段" + (revealed || !res ? " / 测试段" : "") + "）", domain: [a, b] }, panels: [{ y: { label: series.label || "y", domain: [lo - padY, hi + padY] }, layers: layers }],
        legend: [{ name: "到 t 为止的观测", color: "neutral" }, { name: "之后的真实值", color: "ink2" }].concat(res ? [{ name: "预测（" + H + " 步）", color: "s1" }] : []).concat([{ name: "朴素预测：明天 = 今天", color: "s2" }]) });
      var ox = O.map(function (z) { return z.t; }), lay2 = [];
      if (res) lay2.push({ kind: "line", x: ox.slice(0, k + 1), y: Array.prototype.slice.call(runM, 0, k + 1), color: "s1", width: 2 });
      lay2.push({ kind: "line", x: ox.slice(0, k + 1), y: Array.prototype.slice.call(runN, 0, k + 1), color: "s2", width: 1.6, dash: [4, 3] }, { kind: "vline", x: t, color: "ink2", width: 1 });
      if (revealed && res && res.origins.test) lay2.push({ kind: "vline", x: res.origins.test[0], color: "s8", width: 1, dash: [3, 3], label: "测试段" });
      var top = 0; for (var j = 0; j < nO; j++) { if (res && runM[j] > top) top = runM[j]; if (runN[j] > top) top = runN[j]; }
      chB.set({ x: { label: "原点 t", domain: [ox[0], ox[nO - 1]] }, panels: [{ y: { label: "到这个原点为止的平均平方误差", zero: true, domain: [0, top * 1.12 || 1] }, layers: lay2 }],
        legend: (res ? [{ name: "模型", color: "s1" }] : []).concat([{ name: "朴素预测", color: "s2" }]) });
      sl.set("t", String(t)); sl.set("k", (k + 1) + " / " + nO + " 个"); sl.set("e", res ? sci(eM[k]) : "—"); sl.set("rm", res ? sci(runM[k]) : "—"); sl.set("rn", sci(runN[k])); sl.set("q", res && runN[k] > 0 ? F(runM[k] / runN[k], 3) : "—");
    }
    function tick(dt) {
      acc += (+m.speed || 15) * dt / 1000; var steps = Math.floor(acc); acc -= steps;
      if (steps > 0) { k = Math.min(nO - 1, k + steps); kSl.set(k); if (drawT() || k >= nO - 1) draw(); }
      return k < nO - 1;
    }
    loop.own(onTheme(function () { chA.draw(); chB.draw(); }));
    draw();
    if (!reduced()) loop.play();
    return loop;
  }

  /* ====================================================================== *
   *  优化器赛跑
   * ====================================================================== */
  var BASE_LR = {
    quad: { gd: 1.6, momentum: 0.5, nesterov: 0.5, rmsprop: 0.02, adam: 0.05 },
    rosen: { gd: 0.001, momentum: 0.001, nesterov: 0.001, rmsprop: 0.01, adam: 0.05 },
    saddle: { gd: 0.05, momentum: 0.01, nesterov: 0.01, rmsprop: 0.02, adam: 0.05 }
  };
  var OPT_COL = ["s1", "s2", "s3", "s7", "s5"];
  function optimSim(card) {
    var m = mem.optim || (mem.optim = { surf: "quad", kappa: 100, mult: 1, beta: 0.9, speed: "40", start: null });
    var MAXSTEP = 600, surf = null, racers = [], acc = 0, bg = null, bgKey = "", geo = null;
    function hp(id) { return { lr: BASE_LR[m.surf][id] * m.mult, beta: m.beta, rho: 0.99 }; }
    function reset() {
      surf = M.surface(m.surf, { kappa: m.kappa });
      var s0 = m.start && m.start.surf === m.surf ? m.start.p : surf.start;
      racers = M.OPTIMIZERS.map(function (o, i) { var st = M.optInit(o.id, s0[0], s0[1]), f0 = surf.f(s0[0], s0[1]) - surf.fmin; return { o: o, col: OPT_COL[i], st: st, px: [s0[0]], py: [s0[1]], ls: [Math.max(1e-12, f0)], xs: [0], reach: -1, div: false, done: false }; });
      acc = 0; bgKey = "";
    }
    function stepAll() {
      var moved = false;
      racers.forEach(function (r) {
        if (r.done || r.st.t >= MAXSTEP) return;
        M.optStep(r.st, surf, hp(r.o.id));
        var f = surf.f(r.st.x, r.st.y) - surf.fmin;
        if (!isFinite(f) || Math.abs(r.st.x) > 1e6 || Math.abs(r.st.y) > 1e6) { r.div = true; r.done = true; return; }
        r.px.push(r.st.x); r.py.push(r.st.y); r.ls.push(Math.max(1e-12, f)); r.xs.push(r.st.t);
        if (r.reach < 0 && f < 1e-6) r.reach = r.st.t;
        if (f < 1e-12) r.done = true;
        moved = true;
      });
      return moved;
    }
    // ---- 控件 ----
    var pb = playButton();
    var sSel = select("损失面", [["quad", "病态的二次型"], ["rosen", "Rosenbrock 香蕉谷"], ["saddle", "鞍点"]], m.surf, function (v) { m.surf = v; show(kSl.el, v === "quad"); reset(); full(); loop.play(); });
    var kSl = slider({ label: "条件数 κ", min: 1, max: 300, log: true, value: m.kappa, fmt: function (v) { return F(v, v < 10 ? 1 : 0); }, onInput: function (v) { m.kappa = v; reset(); full(); }, onChange: function () { loop.play(); } });
    show(kSl.el, m.surf === "quad");
    var lSl = slider({ label: "学习率 ×", min: 0.1, max: 10, log: true, value: m.mult, fmt: function (v) { return F(v, v < 1 ? 2 : 1); }, onInput: function (v) { m.mult = v; reset(); full(); }, onChange: function () { loop.play(); } });
    var bSl = slider({ label: "动量 β", min: 0, max: 0.99, step: 0.01, value: m.beta, fmt: function (v) { return F(v, 2); }, onInput: function (v) { m.beta = v; reset(); full(); }, onChange: function () { loop.play(); } });
    var spSel = select("速度", [["10", "每秒 10 步"], ["40", "每秒 40 步"], ["120", "每秒 120 步"], ["400", "每秒 400 步"]], m.speed, function (v) { m.speed = v; });
    var ctl = [pb, button("重来", function () { reset(); full(); loop.play(); }), sSel.el, kSl.el, lSl.el, bSl.el, spSel.el];
    var foot = "梯度下降在陡的方向每一步都来回震荡；条件数 κ 越大，它沿平缓的谷底爬得越慢，动量和 Nesterov 攒起速度，几乎不受 κ 影响（κ 小时反而绕圈）。Adam、RMSProp 按坐标缩放步长，对斜着的谷帮助有限，到了谷底还会抖。香蕉谷：大家先很快落进弯弯的谷底，再沿谷慢慢爬。鞍点：梯度下降在鞍点附近停一百多步，Adam 几步就逃开。点图换起点。";
    var c = card("优化器赛跑", { wide: true, help: "anim:optim", ctl: ctl, foot: foot, id: "simOptim" });
    var stg = h("div", { class: "an-stage even" }), left = h("div", { class: "an-col" }), right = h("div", { class: "an-col" });
    stg.appendChild(left); stg.appendChild(right); c.body.appendChild(stg);
    var loop = new Loop(c.el, tick, function (on) { pb.setState(on); });
    pb.addEventListener("click", function () { if (!loop.playing && racers.every(function (r) { return r.done || r.st.t >= MAXSTEP; })) reset(); loop.toggle(); });
    reset();
    var cv = loop.own(stage(left, 0.78, paint, { label: "损失面的等高线与几种优化器的轨迹（点一下换起点）", maxH: 460, cls: "click" }));
    cv.el.classList.add("an-cv", "click");
    cv.canvas.addEventListener("click", function (e) {
      if (!geo) return; var rc = cv.canvas.getBoundingClientRect(), px = e.clientX - rc.left, py = e.clientY - rc.top;
      if (px < geo.L || px > geo.L + geo.pw || py < geo.T || py > geo.T + geo.ph) return;
      var x = geo.xr[0] + (px - geo.L) / geo.pw * (geo.xr[1] - geo.xr[0]), y = geo.yr[1] - (py - geo.T) / geo.ph * (geo.yr[1] - geo.yr[0]);
      m.start = { surf: m.surf, p: [x, y] }; reset(); full(); loop.play();
    });
    var tbl = h("table", { class: "an-tbl" }), tb = h("tbody");
    tbl.appendChild(h("thead", null, h("tr", null, h("th", { text: "优化器" }), h("th", { text: "学习率" }), h("th", { text: "f − f*" }), h("th", { text: "状态" }))));
    tbl.appendChild(tb); right.appendChild(tbl);
    var rows = M.OPTIMIZERS.map(function (o, i) { var cells = [h("td", null, h("i", { class: "an-key", style: { "--k": "var(--c-" + OPT_COL[i] + ")" } }), o.name), h("td", { class: "num" }), h("td", { class: "num" }), h("td", { class: "st" })]; tb.appendChild(h("tr", null, cells)); return cells; });
    var ch = chartBox(right, 230, loop), chartT = every(160), tableT = every(150);
    function geometry(wd, hh) {
      var Lm = 30, Rm = 8, Tm = 6, Bm = 18, pw = wd - Lm - Rm, ph = hh - Tm - Bm, xr = surf.xr, cy = (surf.yr[0] + surf.yr[1]) / 2, half = (xr[1] - xr[0]) * ph / pw / 2;
      return { L: Lm, T: Tm, pw: pw, ph: ph, xr: xr, yr: [cy - half, cy + half], sx: function (x) { return Lm + (x - xr[0]) / (xr[1] - xr[0]) * pw; }, sy: function (y) { return Tm + ph - (y - (cy - half)) / (2 * half) * ph; } };
    }
    /** 背景：log(f − f* + δ) 的着色和等高线（行进方块法），尺寸、损失面、主题变了才重画 */
    function buildBg(wd, hh, g) {
      var th = theme(), dpr = Math.min(3, window.devicePixelRatio || 1), cvs = document.createElement("canvas"); cvs.width = Math.round(wd * dpr); cvs.height = Math.round(hh * dpr);
      var c2 = cvs.getContext("2d"); c2.setTransform(dpr, 0, 0, dpr, 0, 0);
      var nx = Math.max(30, Math.round(g.pw / 3)), ny = Math.max(24, Math.round(g.ph / 3)), Z = new Float64Array((nx + 1) * (ny + 1)), zlo = Infinity, zhi = -Infinity, i, j;
      for (j = 0; j <= ny; j++) for (i = 0; i <= nx; i++) { var x = g.xr[0] + (g.xr[1] - g.xr[0]) * i / nx, y = g.yr[1] - (g.yr[1] - g.yr[0]) * j / ny, z = Math.log(Math.max(0, surf.f(x, y) - surf.fmin) + surf.delta) / Math.LN10; Z[j * (nx + 1) + i] = z; if (z < zlo) zlo = z; if (z > zhi) zhi = z; }
      var small = document.createElement("canvas"); small.width = nx; small.height = ny;
      var sc = small.getContext("2d"), img = sc.createImageData(nx, ny), u32 = new Uint32Array(img.data.buffer);
      for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) { var zz = (Z[j * (nx + 1) + i] + Z[j * (nx + 1) + i + 1] + Z[(j + 1) * (nx + 1) + i] + Z[(j + 1) * (nx + 1) + i + 1]) / 4, t = (zz - zlo) / ((zhi - zlo) || 1); u32[j * nx + i] = pack(mix(th.surface, V.lerpRamp(th.seq, 0.04 + 0.74 * t), th.dark ? 0.42 : 0.34)); }
      sc.putImageData(img, 0, 0); c2.imageSmoothingEnabled = true; c2.drawImage(small, g.L, g.T, g.pw, g.ph);
      // 等高线
      var NL = 14, cw = g.pw / nx, chh = g.ph / ny, EDGE = [null, [3, 0], [0, 1], [3, 1], [1, 2], [3, 0, 1, 2], [0, 2], [3, 2], [2, 3], [0, 2], [0, 1, 2, 3], [1, 2], [3, 1], [0, 1], [3, 0], null];
      c2.strokeStyle = V.rgb(th.ink, th.dark ? 0.26 : 0.2); c2.lineWidth = 0.8; c2.beginPath();
      for (var lv = 1; lv < NL; lv++) {
        var ell = zlo + (zhi - zlo) * lv / NL;
        for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
          var z00 = Z[j * (nx + 1) + i], z10 = Z[j * (nx + 1) + i + 1], z01 = Z[(j + 1) * (nx + 1) + i], z11 = Z[(j + 1) * (nx + 1) + i + 1];
          var cs = (z00 > ell ? 1 : 0) | (z10 > ell ? 2 : 0) | (z11 > ell ? 4 : 0) | (z01 > ell ? 8 : 0), ed = EDGE[cs]; if (!ed) continue;
          var X0 = g.L + i * cw, Y0 = g.T + j * chh;
          for (var e = 0; e < ed.length; e += 2) { var p1 = edgePt(ed[e]), p2 = edgePt(ed[e + 1]); c2.moveTo(p1[0], p1[1]); c2.lineTo(p2[0], p2[1]); }
        }
      }
      c2.stroke();
      function edgePt(k) {
        if (k === 0) return [X0 + cw * frac(z00, z10), Y0];
        if (k === 1) return [X0 + cw, Y0 + chh * frac(z10, z11)];
        if (k === 2) return [X0 + cw * frac(z01, z11), Y0 + chh];
        return [X0, Y0 + chh * frac(z00, z01)];
      }
      function frac(a, b) { var d = b - a; return d ? clamp((ell - a) / d, 0, 1) : 0.5; }
      return cvs;
    }
    function paint(ctx, wd, hh, resized) {
      var g = geo = geometry(wd, hh), key = [m.surf, F(m.kappa, 3), wd, hh, theme().dark].join("|");
      if (resized || !bg || key !== bgKey) { bg = buildBg(wd, hh, g); bgKey = key; }
      ctx.drawImage(bg, 0, 0, wd, hh);
      V.frame(ctx, wd, hh, g.xr, g.yr, { left: g.L, bottom: 18, top: g.T, right: 8 });
      var th = theme();
      ctx.save(); ctx.beginPath(); ctx.rect(g.L, g.T, g.pw, g.ph); ctx.clip();
      // 最小值（实心十字）与鞍点（×）
      ctx.strokeStyle = V.rgb(th.ink); ctx.lineWidth = 1.6;
      surf.min.forEach(function (p) { var x = g.sx(p[0]), y = g.sy(p[1]); ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6); ctx.stroke(); });
      if (surf.saddle) { var sx0 = g.sx(surf.saddle[0]), sy0 = g.sy(surf.saddle[1]); ctx.beginPath(); ctx.moveTo(sx0 - 5, sy0 - 5); ctx.lineTo(sx0 + 5, sy0 + 5); ctx.moveTo(sx0 + 5, sy0 - 5); ctx.lineTo(sx0 - 5, sy0 + 5); ctx.stroke(); }
      var pal = th.pal, idx = { s1: 0, s2: 1, s3: 2, s4: 3, s5: 4, s6: 5, s7: 6, s8: 7 };
      racers.forEach(function (r) {
        var col = pal[idx[r.col]], n = r.px.length; ctx.strokeStyle = V.rgb(col, 0.95); ctx.lineWidth = 1.7; ctx.lineJoin = "round"; ctx.beginPath();
        for (var q = 0; q < n; q++) { var x = clamp(g.sx(r.px[q]), -1e4, 1e4), y = clamp(g.sy(r.py[q]), -1e4, 1e4); if (q) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
        ctx.stroke();
      });
      // 起点（空心圈）与现在的位置（实心点，套一圈底色）
      var s0x = g.sx(racers[0].px[0]), s0y = g.sy(racers[0].py[0]); ctx.strokeStyle = V.rgb(th.ink); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(s0x, s0y, 5, 0, 6.2832); ctx.stroke();
      racers.forEach(function (r) { var x = g.sx(r.st.x), y = g.sy(r.st.y); if (!(isFinite(x) && isFinite(y))) return; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 6.2832); ctx.fillStyle = V.rgb(th.surface); ctx.fill(); ctx.beginPath(); ctx.arc(x, y, 4, 0, 6.2832); ctx.fillStyle = V.rgb(pal[idx[r.col]]); ctx.fill(); });
      ctx.restore();
    }
    function drawChart() {
      var layers = racers.map(function (r) { return { kind: "line", x: r.xs, y: lgArr(r.ls, 1e-12), color: r.col, width: 1.8 }; });
      layers.unshift({ kind: "hline", y: -6, color: "muted", width: 1, dash: [3, 3], label: "1e−6（算“到了”）" });
      var top = Math.ceil(lg(racers.reduce(function (a, r) { return Math.max(a, r.ls[0]); }, 1)) + 0.5);
      ch.set({ x: { label: "步数", domain: [0, MAXSTEP] }, panels: [{ y: { label: "f − f*（对数坐标）", domain: [-12.3, Math.max(1, top)], fmt: pow10 }, layers: layers }] });
    }
    function drawTable() {
      racers.forEach(function (r, i) {
        var cells = rows[i], f = r.ls[r.ls.length - 1];
        cells[1].textContent = sci(BASE_LR[m.surf][r.o.id] * m.mult);
        cells[2].textContent = r.div ? "—" : sci(f);
        cells[3].textContent = r.div ? "发散了（第 " + r.st.t + " 步）" : r.reach >= 0 ? "第 " + r.reach + " 步到了" : r.st.t >= MAXSTEP ? "跑完 " + MAXSTEP + " 步还没到" : "第 " + r.st.t + " 步";
      });
    }
    function tick(dt) {
      acc += (+m.speed || 40) * dt / 1000; var n = Math.min(200, Math.floor(acc)), moved = false; acc -= n;
      for (var q = 0; q < n; q++) moved = stepAll() || moved;
      if (n) cv.frame();
      if (chartT()) drawChart(); if (tableT()) drawTable();
      var over = racers.every(function (r) { return r.done || r.st.t >= MAXSTEP; });
      if (over) { cv.frame(); drawChart(); drawTable(); }
      return !over;
    }
    function full() { cv.full(); drawChart(); drawTable(); }
    loop.own(onTheme(function () { bgKey = ""; cv.full(); ch.draw(); }));
    if (reduced()) { while (stepAll()) {} }
    full();
    if (!reduced()) loop.play();
    return loop;
  }

  /* ====================================================================== *
   *  偏差与方差
   * ====================================================================== */
  var BV_FUN = {
    sin: { name: "sin(πx)", f: function (x) { return Math.sin(Math.PI * x); } },
    step: { name: "台阶 tanh(5x)", f: function (x) { return Math.tanh(5 * x); } },
    quad: { name: "抛物线 x² − ½", f: function (x) { return x * x - 0.5; } },
    abs: { name: "折线 |x| − ½", f: function (x) { return Math.abs(x) - 0.5; } }
  };
  function biasVarSim(card) {
    var m = mem.bv || (mem.bv = { f: "sin", n: 20, sigma: 0.3, deg: 3, gen: 0 });
    // 训练集的 x 位置固定（固定设计），每份训练集只有噪声不同：偏差与方差有精确的表达式（QL_MLANIM.polyBiasVarExact），
    // 图上的细线和"直接算的测试误差"是蒙特卡罗，会收敛到精确值。随机设计时高次拟合的分布尾巴极重（E ŷ 几乎不存在），几十份训练集估不准偏差
    var RC = 50, RM = 400, J = 101, DMAX = 12, LAM = 1e-6, xt = new Float64Array(J), buf = new Float64Array(DMAX + 1);
    for (var j = 0; j < J; j++) xt[j] = -1 + 2 * (j + 0.5) / J;
    var data = null, sweep = null, cloud = null, revealT = 0;
    function regen() {
      var rng = new QL.RNG(2026, 777, m.gen), f = BV_FUN[m.f].f, n = m.n, xd = new Float64Array(n), fx = new Float64Array(n), Y = new Float64Array(RM * n), Z = new Float64Array(RM * J), ft = new Float64Array(J), i, r;
      for (i = 0; i < n; i++) xd[i] = 2 * rng.u() - 1;
      Array.prototype.sort.call(xd, function (a, b) { return a - b; });
      for (i = 0; i < n; i++) fx[i] = f(xd[i]);
      for (r = 0; r < RM; r++) for (i = 0; i < n; i++) Y[r * n + i] = fx[i] + m.sigma * rng.normal();
      for (r = 0; r < RM * J; r++) Z[r] = rng.normal();
      for (j = 0; j < J; j++) ft[j] = f(xt[j]);
      data = { xd: xd, fx: fx, Y: Y, Z: Z, ft: ft, n: n }; sweep = { next: 0, rows: [] }; cloud = null; fitCloud();
    }
    /** 一个次数：精确的偏差²、方差；前 RC 份训练集的预测（画细线）；RM 份训练集上直接算的测试误差及其标准误 */
    function fitDeg(deg, keepPreds) {
      var n = data.n, ex = M.polyBiasVarExact(data.xd, n, data.fx, deg, LAM, xt, J, data.ft, m.sigma), preds = keepPreds ? new Float64Array(RC * J) : null, s1 = 0, s2 = 0;
      for (var r = 0; r < RM; r++) {
        var c = M.polyFit(data.xd, data.Y.subarray(r * n, (r + 1) * n), n, deg, LAM), e = 0;
        for (var j = 0; j < J; j++) { var v = M.polyEval(c, xt[j], buf), d = v - (data.ft[j] + m.sigma * data.Z[r * J + j]); e += d * d; if (preds && r < RC) preds[r * J + j] = v; }
        e /= J; s1 += e; s2 += e * e;
      }
      var mu = s1 / RM; ex.direct = mu; ex.se = Math.sqrt(Math.max(0, s2 / RM - mu * mu) / (RM - 1)); ex.deg = deg; ex.preds = preds;
      return ex;
    }
    function fitCloud() { cloud = fitDeg(m.deg, true); cloud.k = 0; }
    // ---- 控件 ----
    var pb = playButton();
    var fSel = select("真函数", Object.keys(BV_FUN).map(function (k) { return [k, BV_FUN[k].name]; }), m.f, function (v) { m.f = v; regen(); still(); loop.play(); });
    var nSl = slider({ label: "样本数 n", min: 5, max: 100, step: 1, value: m.n, fmt: function (v) { return String(Math.round(v)); }, onChange: function (v) { m.n = Math.round(v); regen(); still(); loop.play(); } });
    var sSl = slider({ label: "噪声 σ", min: 0, max: 1, step: 0.05, value: m.sigma, fmt: function (v) { return F(v, 2); }, onChange: function (v) { m.sigma = v; regen(); still(); loop.play(); } });
    var dSl = slider({ label: "多项式次数", min: 0, max: DMAX, step: 1, value: m.deg, fmt: function (v) { return String(Math.round(v)); }, onInput: function (v) { setDeg(Math.round(v)); } });
    function setDeg(d) { if (d === m.deg && cloud) return; m.deg = d; dSl.set(d); fitCloud(); drawSweep(); drawCloud(); writeEq(); loop.play(); }
    var ctl = [pb, button("换一组 x 和噪声", function () { m.gen++; regen(); still(); loop.play(); }), fSel.el, nSl.el, sSl.el, dSl.el];
    var foot = "训练集的 x 位置固定（n 个点，在 [−1, 1] 上随机取一次），每份训练集只是噪声不同。每条细线是在一份训练集上拟合的多项式，粗线是它们的平均：平均和真函数（虚线）之差是偏差，细线散开的程度是方差。次数低时偏差大，次数高时方差大。右图点一下就换成那个次数。";
    var c = card("偏差与方差", { wide: true, help: "anim:biasvar", ctl: ctl, foot: foot, id: "simBV" });
    var stg = h("div", { class: "an-stage even" }), left = h("div", { class: "an-col" }), right = h("div", { class: "an-col" });
    stg.appendChild(left); stg.appendChild(right); c.body.appendChild(stg);
    var loop = new Loop(c.el, tick, function (on) { pb.setState(on); });
    pb.addEventListener("click", function () { if (!loop.playing && cloud && cloud.k >= RC && sweep.next > DMAX) { cloud.k = 0; } loop.toggle(); });
    var chC = chartBox(left, 280, loop), chS = chartBox(right, 280, loop), eq = h("p", { class: "an-eq" }); left.appendChild(eq);
    regen();
    var xs = Array.prototype.slice.call(xt);
    function drawCloud() {
      var f = data.ft, k = Math.min(RC, cloud.k), curves = [], mean = new Float64Array(J), lo = Infinity, hi = -Infinity, r, j2;
      for (r = 0; r < k; r++) { var row = Array.prototype.slice.call(cloud.preds, r * J, (r + 1) * J); curves.push(row); for (j2 = 0; j2 < J; j2++) mean[j2] += row[j2] / k; }
      for (j2 = 0; j2 < J; j2++) { if (f[j2] < lo) lo = f[j2]; if (f[j2] > hi) hi = f[j2]; }
      var pad = 2.5 * m.sigma + 0.45, layers = [{ kind: "lines", x: xs, ys: curves, color: "s1", alpha: 0.22, width: 1 }, { kind: "line", x: xs, y: Array.prototype.slice.call(f), color: "ink", width: 1.6, dash: [5, 3] }];
      if (k) layers.push({ kind: "line", x: xs, y: Array.prototype.slice.call(mean), color: "s2", width: 2.6 });
      if (k) { var n = data.n, r0 = k - 1, py = []; for (var i = 0; i < n; i++) py.push(data.Y[r0 * n + i]); layers.push({ kind: "points", x: Array.prototype.slice.call(data.xd), y: py, color: "neutral", r: 2.6 }); }
      chC.set({ x: { label: "x", domain: [-1, 1] }, panels: [{ y: { label: "y（" + m.deg + " 次多项式，" + k + " / " + RC + " 份训练集）", domain: [lo - pad, hi + pad] }, layers: layers }],
        legend: [{ name: "每份训练集的拟合", color: "s1" }, { name: "它们的平均", color: "s2" }, { name: "真函数", color: "ink" }, { name: "最新的一份训练集", color: "neutral", mark: "dot" }] });
    }
    function drawSweep() {
      var rows = sweep.rows, FL = 1e-5;
      var x = rows.map(function (q) { return q.deg; }), pick = function (k) { return rows.map(function (q) { return lg(q[k], FL); }); };
      var tot = rows.map(function (q) { return lg(q.expected, FL); }), all = pick("variance").concat(pick("bias2"), tot, pick("direct"));
      var lo = Math.min.apply(null, all.concat([m.sigma > 0 ? lg(m.sigma * m.sigma) : 0])), hi = Math.max.apply(null, all.concat([0]));
      lo = Math.floor(lo); hi = Math.min(Math.max(Math.ceil(hi), lo + 2), 4);       // 方差爆掉的部分（> 10⁴）出图
      var layers = [{ kind: "vline", x: m.deg, color: "ink2", width: 1.2 }];
      if (m.sigma > 0) layers.push({ kind: "hline", y: lg(m.sigma * m.sigma), color: "muted", width: 1.2, dash: [4, 3], label: "σ² = " + G(m.sigma * m.sigma) });
      layers.push({ kind: "line", x: x, y: pick("bias2"), color: "s3", width: 2 }, { kind: "points", x: x, y: pick("bias2"), color: "s3", r: 2.8 },
        { kind: "line", x: x, y: pick("variance"), color: "s1", width: 2 }, { kind: "points", x: x, y: pick("variance"), color: "s1", r: 2.8 },
        { kind: "line", x: x, y: tot, color: "s2", width: 1.4, dash: [5, 3] }, { kind: "points", x: x, y: pick("direct"), color: "s2", r: 4 });
      chS.set({ x: { label: "多项式次数", domain: [-0.4, DMAX + 0.4], ticks: Array.from({ length: DMAX + 1 }, function (_, i) { return i; }), fmt: function (v) { return String(Math.round(v)); } },
        panels: [{ y: { label: "误差（对数坐标）", domain: [lo - 0.1, hi + 0.1], fmt: pow10 }, layers: layers }],
        legend: [{ name: "偏差²", color: "s3" }, { name: "方差", color: "s1" }, { name: "偏差² + 方差 + σ²（精确）", color: "s2" }, { name: "直接算的测试误差（" + RM + " 份训练集）", color: "s2", mark: "dot" }],
        hover: { xs: x, tip: function (i) { var q = rows[i]; return { title: q.deg + " 次", rows: [{ name: "偏差²", color: "s3", value: sci(q.bias2) }, { name: "方差", color: "s1", value: sci(q.variance) }, { name: "σ²", value: sci(q.noise) }, { name: "三者之和", color: "s2", value: sci(q.expected) }, { name: "直接算的测试误差", color: "s2", mark: "dot", value: sci(q.direct) + " ± " + sci(2 * q.se) }] }; } },
        onClick: function (i) { setDeg(rows[i].deg); } });
    }
    function writeEq() {
      var q = cloud; A.clear(eq);
      [m.deg + " 次：偏差² ", ["b", sci(q.bias2)], " + 方差 ", ["b", sci(q.variance)], " + σ² ", ["b", sci(q.noise)], " = ", ["b", sci(q.expected)],
        "（精确值）；用 " + RM + " 份训练集、在每个测试点上新抽带噪声的 y 直接算 E[(ŷ − y)²] = ", ["b", sci(q.direct) + " ± " + sci(2 * q.se)], "（± 两个标准误）。"]
        .forEach(function (t) { eq.appendChild(typeof t === "string" ? document.createTextNode(t) : h("b", { text: t[1] })); });
    }
    var sweepT = every(170);
    function tick(dt) {
      var busy = false;
      if (cloud.k < RC) { revealT += dt; var add = Math.floor(revealT / 70); if (add > 0) { revealT -= add * 70; cloud.k = Math.min(RC, cloud.k + add); drawCloud(); } busy = true; }
      if (sweep.next <= DMAX) { if (sweepT()) { sweep.rows.push(fitDeg(sweep.next, false)); sweep.next++; drawSweep(); } busy = true; }
      return busy;
    }
    function still() { drawCloud(); drawSweep(); writeEq(); }
    loop.own(onTheme(function () { chC.draw(); chS.draw(); }));
    if (reduced()) { cloud.k = RC; while (sweep.next <= DMAX) { sweep.rows.push(fitDeg(sweep.next, false)); sweep.next++; } }
    still();
    if (!reduced()) loop.play();
    return loop;
  }

  /* ====================================================================== *
   *  双下降：随机 ReLU 特征 + 最小范数最小二乘
   * ====================================================================== */
  function ddSim(card) {
    var m = mem.dd || (mem.dd = { n: 40, sigma: 0.2, gen: 0, p: 0 });
    if (m.n > 60) m.n = 60;
    var D = 3, K = 8, JT = 240, LAMR = 1e-2, f = function (x) { return Math.sin(2.2 * x); }, slice = [];
    for (var q = 0; q <= 100; q++) slice.push(-1 + 2 * q / 100);
    var S = null;
    function pGrid(n) { var r = [0.025, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.65, 0.8, 0.9, 0.95, 0.975, 1, 1.025, 1.05, 1.1, 1.2, 1.4, 1.6, 2, 2.5, 3.2, 4, 5, 6.5, 8], out = []; r.forEach(function (x) { var p = Math.max(1, Math.round(x * n)); if (out.indexOf(p) < 0) out.push(p); }); return out; }
    function regen() {
      var n = m.n, rng = new QL.RNG(2026, 919, m.gen), Pmax = 8 * n, draws = [], Xt = new Float64Array(JT * D), ft = new Float64Array(JT), Xs = new Float64Array(slice.length * D);
      for (var j = 0; j < JT; j++) { for (var d = 0; d < D; d++) Xt[j * D + d] = 2 * rng.u() - 1; ft[j] = f(Xt[j * D]); }
      for (j = 0; j < slice.length; j++) Xs[j * D] = slice[j];
      for (var k = 0; k < K; k++) { var X = new Float64Array(n * D), y = new Float64Array(n); for (var i = 0; i < n; i++) { for (d = 0; d < D; d++) X[i * D + d] = 2 * rng.u() - 1; y[i] = f(X[i * D]) + m.sigma * rng.normal(); } draws.push({ X: X, y: y, pool: M.rfPool(Pmax, D, rng) }); }
      var ps = pGrid(n);
      S = m.S = { n: n, sigma: m.sigma, gen: m.gen, Pmax: Pmax, ps: ps, draws: draws, Xt: Xt, ft: ft, Xs: Xs, buf: new Float64Array(n * Pmax), test: ps.map(function () { return 0; }), testR: ps.map(function () { return 0; }), train: ps.map(function () { return 0; }), norm: ps.map(function () { return 0; }), cnt: ps.map(function () { return 0; }),
        qi: 0, ki: 0, cur: null };
      if (!(m.p >= 1 && m.p <= Pmax)) m.p = n;
    }
    /** 第 k 份（数据 + 特征）在 p 个特征下：最小范数解与岭回归解的测试误差、训练误差、系数范数，以及在切片 x = (t, 0, 0) 上的预测 */
    function evalOne(k, p, wantSlice) {
      var dr = S.draws[k], n = S.n, Phi = M.rfMatrix(dr.X, n, dr.pool, p, S.buf.subarray(0, n * p)), a = M.minNormSolve(Phi, n, p, dr.y), ar = M.ridgeSolve(Phi, n, p, dr.y, LAMR);
      var e = 0, er = 0, tr = 0, nn = 0, i, j, t, W = dr.pool.W, b = dr.pool.b, sc = 1 / Math.sqrt(p);
      // 在测试点上逐点算特征再乘系数（不把 JT × p 的特征矩阵整个存下来）
      function pred(X, j, two) { var x0 = X[j * D], x1 = X[j * D + 1], x2 = X[j * D + 2], s = 0, sr = 0; for (var t = 0; t < p; t++) { var z = b[t] + W[t * D] * x0 + W[t * D + 1] * x1 + W[t * D + 2] * x2; if (z > 0) { z *= sc; s += z * a[t]; sr += z * ar[t]; } } two[0] = s; two[1] = sr; }
      var two = [0, 0];
      for (j = 0; j < JT; j++) { pred(S.Xt, j, two); e += (two[0] - S.ft[j]) * (two[0] - S.ft[j]); er += (two[1] - S.ft[j]) * (two[1] - S.ft[j]); }
      for (i = 0; i < n; i++) { var s2 = 0; for (t = 0; t < p; t++) s2 += Phi[i * p + t] * a[t]; tr += (s2 - dr.y[i]) * (s2 - dr.y[i]); }
      for (t = 0; t < p; t++) nn += a[t] * a[t];
      var out = { test: e / JT, testR: er / JT, train: tr / n, norm: Math.sqrt(nn), p: p };
      if (wantSlice) { out.ys = []; out.yr = []; for (j = 0; j < slice.length; j++) { pred(S.Xs, j, two); out.ys.push(two[0]); out.yr.push(two[1]); } }
      return out;
    }
    function setCur(p) { m.p = p; S.cur = evalOne(0, p, true); }
    // ---- 控件 ----
    var pb = playButton();
    var nSl = slider({ label: "样本数 n", min: 20, max: 60, step: 10, value: m.n, fmt: function (v) { return String(Math.round(v)); }, onChange: function (v) { m.n = Math.round(v); m.p = 0; restart(); } });
    var sSl = slider({ label: "噪声 σ", min: 0, max: 0.6, step: 0.05, value: m.sigma, fmt: function (v) { return F(v, 2); }, onChange: function (v) { m.sigma = v; restart(); } });
    var pSl = slider({ label: "特征数 p", min: 1, max: 8 * m.n, log: true, value: Math.max(1, m.p || m.n), fmt: function (v) { return String(Math.round(v)); }, onInput: function (v) { loop.pause(); setCur(Math.round(v)); drawFit(); drawCurve(); updStats(); } });
    var ctl = [pb, button("重新抽样", function () { m.gen++; restart(); }, "换一批训练数据和随机特征"), nSl.el, sSl.el, pSl.el];
    var foot = "x 在 [−1, 1]³ 里均匀，真函数只依赖第一个坐标：f(x) = sin(2.2 x₁)。特征是 p 个随机的 ReLU(⟨w, x⟩ + b)，只训练最后一层，取最小范数的最小二乘解。p < n 时是普通的最小二乘；p = n 时恰好能插值，系数被迫变得很大，测试误差冲到顶；p > n 以后在所有插值解里取范数最小的那个，特征越多越平滑，误差又降下来。加一点岭正则（绿色虚线）峰就没了。";
    var c = card("双下降", { wide: true, help: "anim:ddescent", ctl: ctl, foot: foot, id: "simDD" });
    var stg = h("div", { class: "an-stage even" }), left = h("div", { class: "an-col" }), right = h("div", { class: "an-col" });
    stg.appendChild(left); stg.appendChild(right); c.body.appendChild(stg);
    var loop = new Loop(c.el, tick, function (on) { pb.setState(on); });
    pb.addEventListener("click", function () { if (!loop.playing && S.qi >= S.ps.length) restart(); else loop.toggle(); });
    var chE = chartBox(left, 280, loop), chF = chartBox(right, 280, loop), sl = statLine(left, [["p", "p ="], ["r", "p/n ="], ["e", "测试误差（这一份）"], ["em", "（" + K + " 份平均）"], ["a", "系数范数 ‖a‖ ="]]);
    function restart() { regen(); rebuildPSlider(); setCur(m.p); drawCurve(); drawFit(); updStats(); loop.play(); }
    function rebuildPSlider() {   // n 变了：对数滑块的范围跟着变
      var nw = slider({ label: "特征数 p", min: 1, max: S.Pmax, log: true, value: m.p, fmt: function (v) { return String(Math.round(v)); }, onInput: function (v) { loop.pause(); setCur(Math.round(v)); drawFit(); drawCurve(); updStats(); } });
      pSl.el.parentNode.replaceChild(nw.el, pSl.el); pSl = nw;
    }
    function drawCurve() {
      var xs = [], te = [], ter = [], trn = [];
      S.ps.forEach(function (p, i) { if (!S.cnt[i]) return; xs.push(p / S.n); te.push(S.test[i] / S.cnt[i]); ter.push(S.testR[i] / S.cnt[i]); trn.push(S.train[i] / S.cnt[i]); });
      var FL = 1e-6, Lte = lgArr(te, FL), Lter = lgArr(ter, FL), Ltrn = lgArr(trn, FL), all = Lte.concat(Lter, Ltrn), lo = all.length ? Math.min.apply(null, all) : -3, hi = all.length ? Math.max.apply(null, all) : 1;
      var layers = [{ kind: "vline", x: 1, color: "s3", width: 1.2, dash: [4, 3], label: "p = n（插值阈值）" }, { kind: "vline", x: m.p / S.n, color: "ink2", width: 1.2, row: 1 }];
      if (xs.length) layers.push({ kind: "line", x: xs, y: Ltrn, color: "s1", width: 1.4 }, { kind: "line", x: xs, y: Lter, color: "s3", width: 1.6, dash: [5, 3] }, { kind: "line", x: xs, y: Lte, color: "s2", width: 2.2 }, { kind: "points", x: xs, y: Lte, color: "s2", r: 2.6 });
      chE.set({ x: { label: "p / n（对数坐标）", scale: "log", domain: [S.ps[0] / S.n, S.Pmax / S.n], fmt: function (v) { return G(v); } }, panels: [{ y: { label: "误差（对数坐标，" + K + " 份平均）", domain: [Math.floor(Math.max(lg(FL), lo)) - 0.2, Math.ceil(hi) + 0.2], fmt: pow10 }, layers: layers }],
        legend: [{ name: "测试误差 E[(f̂ − f)²]", color: "s2" }, { name: "训练误差（低于 1e−6 画在底线）", color: "s1" }, { name: "岭回归 λ = " + G(LAMR) + " 的测试误差", color: "s3" }],
        hover: xs.length ? { xs: xs, tip: function (i) { return { title: "p = " + Math.round(xs[i] * S.n) + "（p/n = " + G(xs[i]) + "）", rows: [{ name: "测试（最小范数）", color: "s2", value: sci(te[i]) }, { name: "测试（岭）", color: "s3", value: sci(ter[i]) }, { name: "训练", color: "s1", value: sci(trn[i]) }] }; } } : null,
        onClick: function (i) { loop.pause(); var p = Math.round(xs[i] * S.n); pSl.set(p); setCur(p); drawFit(); drawCurve(); updStats(); } });
    }
    function drawFit() {
      var cur = S.cur, dr = S.draws[0], px = [], py = [], tf = slice.map(f);
      for (var i = 0; i < S.n; i++) { px.push(dr.X[i * D]); py.push(dr.y[i]); }
      var layers = [{ kind: "points", x: px, y: py, color: "neutral", r: 2.6 }, { kind: "line", x: slice, y: tf, color: "ink", width: 1.5, dash: [5, 3] }];
      if (cur) layers.push({ kind: "line", x: slice, y: cur.yr, color: "s3", width: 1.3, dash: [4, 3] }, { kind: "line", x: slice, y: cur.ys, color: "s2", width: 2.2 });
      chF.set({ x: { label: "x₁（画的是 x₂ = x₃ = 0 这条线上的 f̂）", domain: [-1, 1] }, panels: [{ y: { label: "y（p = " + m.p + "）", domain: [-2.4, 2.4] }, layers: layers }],
        legend: [{ name: "训练样本（按 x₁ 投影）", color: "neutral", mark: "dot" }, { name: "真函数", color: "ink" }, { name: "最小范数解", color: "s2" }, { name: "岭回归", color: "s3" }] });
    }
    function updStats() {
      var cur = S.cur, i = S.ps.indexOf(m.p);
      sl.set("p", String(m.p)); sl.set("r", G(m.p / S.n)); sl.set("e", cur ? sci(cur.test) : "—"); sl.set("em", i >= 0 && S.cnt[i] === K ? sci(S.test[i] / K) : "—"); sl.set("a", cur ? sci(cur.norm) : "—");
    }
    var drawT = every(120);
    function tick() {
      var t0 = now(), changed = false;
      while (S.qi < S.ps.length && now() - t0 < 4) {
        var p = S.ps[S.qi], r = evalOne(S.ki, p, false);
        S.test[S.qi] += r.test; S.testR[S.qi] += r.testR; S.train[S.qi] += r.train; S.norm[S.qi] += r.norm; S.cnt[S.qi]++;
        S.ki++; changed = true;
        if (S.ki >= K) { S.ki = 0; setCur(p); pSl.set(p); S.qi++; drawFit(); updStats(); break; }
      }
      if (changed && drawT()) drawCurve();
      if (S.qi >= S.ps.length) { drawCurve(); updStats(); return false; }
      return true;
    }
    loop.own(onTheme(function () { chE.draw(); chF.draw(); }));
    if (m.S && m.S.n === m.n && m.S.sigma === m.sigma && m.S.gen === m.gen) S = m.S; else regen();   // 视图重画：算好的曲线接着用
    if (!(m.p >= 1 && m.p <= S.Pmax)) m.p = S.n;
    rebuildPSlider(); setCur(m.p);
    if (reduced()) { while (S.qi < S.ps.length) { var p0 = S.ps[S.qi]; for (var k0 = 0; k0 < K; k0++) { var r0 = evalOne(k0, p0, false); S.test[S.qi] += r0.test; S.testR[S.qi] += r0.testR; S.train[S.qi] += r0.train; S.norm[S.qi] += r0.norm; S.cnt[S.qi]++; } S.qi++; } }
    drawCurve(); drawFit(); updStats();
    if (!reduced()) loop.play();
    return loop;
  }

  /* ====================================================================== *
   *  入口
   * ====================================================================== */
  /** views.js 调用：数据视图（dataView = true）只放数据集自带的模拟；动画视图另外放与数据集无关的几个教学演示 */
  A.renderSim = function (card, keep, dataView) {
    injectCss();
    var d = null; try { d = A.ds(); } catch (e) {}
    function run(f) { try { var x = f(card, dataView); if (x) keep(x); } catch (e) { console.error(e); } }
    if (d) {
      if (d.id === "ising") run(isingSim);
      else if (d.id === "percolation") run(percSim);
      else if (d.family === "timeseries" || d.kind === "forecast") run(rollingSim);
    }
    if (!dataView) { run(optimSim); run(biasVarSim); run(ddSim); }
  };
  /** 也可以分开放：数据集自带的模拟（返回有没有放）与教学演示 */
  A.renderDatasetSim = function (card, keep, dataView) {
    injectCss(); var d = null, n0 = 0; try { d = A.ds(); } catch (e) {} if (!d) return false;
    var f = d.id === "ising" ? isingSim : d.id === "percolation" ? percSim : d.family === "timeseries" || d.kind === "forecast" ? rollingSim : null;
    if (!f) return false; try { var x = f(card, dataView); if (x) { keep(x); n0 = 1; } } catch (e) { console.error(e); } return !!n0;
  };
  A.renderDemos = function (card, keep) {
    injectCss(); [optimSim, biasVarSim, ddSim].forEach(function (f) { try { var x = f(card); if (x) keep(x); } catch (e) { console.error(e); } });
  };
  A.anim = { Loop: Loop, stage: stage, slider: slider, mem: mem };
})(MLA);
