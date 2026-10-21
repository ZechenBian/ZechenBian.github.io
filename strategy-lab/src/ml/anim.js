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
   *  bias² = 平均_j (ȳ_j − f_j)²，variance = 平均_j 平均_r (ŷ_rj − ȳ_j)²；期望测试误差 E[(ŷ − y)²] = bias² + variance + σ²（交叉项的期望为 0） */
  function biasVariance(preds, R, J, truth, sigma) {
    var b2 = 0, va = 0, mse = 0, j, r;
    for (j = 0; j < J; j++) {
      var m = 0; for (r = 0; r < R; r++) m += preds[r * J + j]; m /= R;
      var d = m - truth[j]; b2 += d * d;
      for (r = 0; r < R; r++) { var e = preds[r * J + j] - m, f = preds[r * J + j] - truth[j]; va += e * e; mse += f * f; }
    }
    b2 /= J; va /= R * J; mse /= R * J;
    return { bias2: b2, variance: va, noise: sigma * sigma, fitErr: mse, expected: mse + sigma * sigma };
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
    legendre: legendre, polyFit: polyFit, polyEval: polyEval, biasVariance: biasVariance,
    rfPool: rfPool, rfMatrix: rfMatrix
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = QL_MLANIM;
