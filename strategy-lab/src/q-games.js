// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 策略实验室 · 三套量子玩法（Bell 游戏、量子搜索、炸弹检测），以及它们和"量子电路"面板共用的态矢量模拟器。
 * 与十套玩法、四套观测玩法共用同一个裁判框架（games.js）：gen(c) 生成一局的全部随机数，play(E) 一回合一回合地问规则要动作。
 * 量子力学只在裁判手里：规则看不到量子态本身，只能通过裁判给的那几个动作（测量、再转一步、让光子走一圈）去碰它，
 * 和实验物理学家面对一台仪器时一样。三套玩法各自有一个"经典的做法能做到多好"的理论上限，以及量子的做法能把它推到哪里。
 * 同一份代码在主线程（只用元数据和理论值）和后台线程（真正去跑）里各执行一遍，所以必须自包含。 */
function QL_QUANTUM_INSTALL(QL) {
"use strict";
var WORLDS = QL.WORLDS, num = QL.num, sel = QL.sel, LIB = QL.gameLib, GROUP = "量子玩法";
QL.WORLD_GROUPS.splice(2, 0, GROUP);
QL.QUANTUM_GROUP = GROUP;
function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
var RAD = Math.PI / 180;
var memo = {};
function once(tag, key, f) { var m = memo[tag]; if (!m || m.key !== key) m = memo[tag] = { key: key, val: f() }; return m.val; }

/* ================================================================== *
 *  一、态矢量模拟器（"量子电路"面板也用它）
 *  复数写成 [实部, 虚部]；n 个比特的态是长度 2^n 的复数数组，第 0 个比特是最高位：基矢的标签是 |q0 q1 q2⟩。
 * ================================================================== */
var SQ = Math.SQRT1_2;
function C(re, im) { return [re, im || 0]; }
function cmul(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
function cadd(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
function conj(a) { return [a[0], -a[1]]; }
function abs2(a) { return a[0] * a[0] + a[1] * a[1]; }
function expi(t) { return [Math.cos(t), Math.sin(t)]; }
/** 绕 y 轴转 t（弧度）：|0⟩ → cos(t/2)|0⟩ + sin(t/2)|1⟩ */
function ry(t) { var c = Math.cos(t / 2), s = Math.sin(t / 2); return [[C(c), C(-s)], [C(s), C(c)]]; }
var MAT = {
  I: [[C(1), C(0)], [C(0), C(1)]],
  H: [[C(SQ), C(SQ)], [C(SQ), C(-SQ)]],
  X: [[C(0), C(1)], [C(1), C(0)]],
  Y: [[C(0), C(0, -1)], [C(0, 1), C(0)]],
  Z: [[C(1), C(0)], [C(0), C(-1)]],
  S: [[C(1), C(0)], [C(0), C(0, 1)]],
  T: [[C(1), C(0)], [C(0), C(SQ, SQ)]],
  R4: ry(Math.PI / 4),
  R8: ry(Math.PI / 8)
};
function maskOf(n, q) { return 1 << (n - 1 - q); }
function bitOf(i, n, q) { return (i >> (n - 1 - q)) & 1; }
function zeros(n) { var s = []; for (var i = 0; i < (1 << n); i++) s.push(C(0)); return s; }
function basis(n, k) { var s = zeros(n); s[k] = C(1); return s; }
function kron(a, b) { var o = [], i, j; for (i = 0; i < a.length; i++) for (j = 0; j < b.length; j++) o.push(cmul(a[i], b[j])); return o; }
function clone(s) { return s.map(function (a) { return [a[0], a[1]]; }); }
var BELL = [C(SQ), C(0), C(0), C(SQ)];   // |Φ⁺⟩ = (|00⟩ + |11⟩)/√2
/** 在第 q 个比特上作用 2×2 矩阵 M（原地） */
function applySingle(st, n, q, M) {
  var m = maskOf(n, q);
  for (var i = 0; i < st.length; i++) {
    if (i & m) continue;
    var j = i | m, a = st[i], b = st[j];
    st[i] = cadd(cmul(M[0][0], a), cmul(M[0][1], b));
    st[j] = cadd(cmul(M[1][0], a), cmul(M[1][1], b));
  }
}
/** 受控门：控制位 c 为 1 时在目标位 t 上作用 M */
function applyCtrl(st, n, c, t, M) {
  var mc = maskOf(n, c), mt = maskOf(n, t);
  for (var i = 0; i < st.length; i++) {
    if (!(i & mc) || (i & mt)) continue;
    var j = i | mt, a = st[i], b = st[j];
    st[i] = cadd(cmul(M[0][0], a), cmul(M[0][1], b));
    st[j] = cadd(cmul(M[1][0], a), cmul(M[1][1], b));
  }
}
function applyCZ(st, n, a, b) {
  var ma = maskOf(n, a), mb = maskOf(n, b);
  for (var i = 0; i < st.length; i++) if ((i & ma) && (i & mb)) st[i] = [-st[i][0], -st[i][1]];
}
/** 把第 q 个比特投影到 v（不归一化：剩下的范数平方就是这个结果出现的概率） */
function project(st, n, q, v) {
  var m = maskOf(n, q);
  for (var i = 0; i < st.length; i++) if (((i & m) ? 1 : 0) !== v) st[i] = C(0);
}
/** 第 q 个比特的约化密度矩阵 */
function reduced(st, n, q) {
  var m = maskOf(n, q), r = [[C(0), C(0)], [C(0), C(0)]];
  for (var i = 0; i < st.length; i++) {
    if (i & m) continue;
    var j = i | m;
    r[0][0] = cadd(r[0][0], cmul(st[i], conj(st[i])));
    r[0][1] = cadd(r[0][1], cmul(st[i], conj(st[j])));
    r[1][0] = cadd(r[1][0], cmul(st[j], conj(st[i])));
    r[1][1] = cadd(r[1][1], cmul(st[j], conj(st[j])));
  }
  return r;
}
/** 第 q 个比特的 Bloch 向量（按迹归一化）。纠缠起来的比特，向量缩进球里；最大纠缠时缩到球心 */
function bloch(st, n, q) {
  var r = reduced(st, n, q), tr = r[0][0][0] + r[1][1][0];
  if (tr < 1e-12) return { x: 0, y: 0, z: 0, tr: 0 };
  return { x: 2 * r[0][1][0] / tr, y: -2 * r[0][1][1] / tr, z: (r[0][0][0] - r[1][1][0]) / tr, tr: tr };
}
QL.qsim = { C: C, mul: cmul, add: cadd, conj: conj, abs2: abs2, expi: expi, ry: ry, MAT: MAT, SQ: SQ, BELL: BELL,
  maskOf: maskOf, bitOf: bitOf, zeros: zeros, basis: basis, kron: kron, clone: clone,
  applySingle: applySingle, applyCtrl: applyCtrl, applyCZ: applyCZ, project: project, reduced: reduced, bloch: bloch };

/* ================================================================== *
 *  ⑮ Bell 游戏（CHSH）
 * ================================================================== */
/** 两个偏振片的方向相差 d 度时，两边结果相同的概率。
 *  纠缠源（可见度 v）：(1 + v·cos 2d)/2。局部隐变量源：1 − 2|d|/180（|d| 折到 0° 到 90° 之间）。 */
function bellSame(src, v, d) {
  if (src === "lhv") { var r = ((d % 180) + 180) % 180; if (r > 90) r = 180 - r; return 1 - 2 * r / 180; }
  return (1 + v * Math.cos(2 * d * RAD)) / 2;
}
/** 四个角度（度）的测量方案：Alice 收到 x 用 A[x]，Bob 收到 y 用 B[y]，各自报测量结果。四种输入等可能时赢的概率 */
function bellWin(src, v, a0, a1, b0, b1) {
  var A = [a0, a1], B = [b0, b1], s = 0, x, y;
  for (x = 0; x < 2; x++) for (y = 0; y < 2; y++) { var ps = bellSame(src, v, A[x] - B[y]); s += (x & y) ? 1 - ps : ps; }
  return s / 4;
}
/** 只有一个角度 φ 的标准方案：Alice 用 0 或 2φ，Bob 用 φ 或 −φ */
function bellPhi(src, v, phi) { return bellWin(src, v, 0, 2 * phi, phi, -phi); }
function bellTheory(p) {
  var src = p.src === "lhv" ? "lhv" : "q", v = clamp(+p.v, 0, 1), ts = 0.5 + v * Math.SQRT2 / 4;
  return { src: src, v: v, ts: ts, best: src === "lhv" ? 0.75 : Math.max(0.75, ts), vcrit: SQ };
}
QL.bellSame = bellSame; QL.bellWin = bellWin; QL.bellPhi = bellPhi; QL.bellTheory = bellTheory;

LIB.bell_zero = {
  head: "两人都答 0：不管收到什么。它是这套玩法的基准。",
  decide: function decide(s, p) {
    return 0;                                   // 只有 x = y = 1 的那一种输入会输：赢 3/4
  }
};
LIB.bell_rand = {
  head: "各自随便答：每回合抛一枚自己的硬币。",
  decide: function decide(s, p) {
    return s.rnd() < 0.5 ? 0 : 1;               // s.rnd() 是自己的随机数，对方看不到
  }
};
LIB.bell_table = {
  head: "经典的答法表：Alice 收到 0 答 a0、收到 1 答 a1；Bob 收到 0 答 b0、收到 1 答 b1。",
  decide: function decide(s, p) {
    if (s.role === "A") return s.x === 0 ? p.a0 : p.a1;   // s.role 是 "A"（Alice）或 "B"（Bob），s.x 是自己收到的那个比特
    return s.x === 0 ? p.b0 : p.b1;
  }
};
LIB.bell_shared = {
  head: "共用随机数挑答法：每回合按两人共有的随机数，以 w 的概率一起用\"都答 0\"，否则一起用\"照收到的比特答\"。",
  decide: function decide(s, p) {
    if (s.shared < p.w) return 0;               // s.shared：这一回合两人共有的随机数（事先约好的一本随机数表）
    return s.x;                                 // 另一张答法表：收到什么就答什么（只在 x = y = 0 时赢）
  }
};
LIB.bell_phi = {
  head: "测量纠缠光子（一个角度 φ）：Alice 收到 0 沿 0° 测、收到 1 沿 2φ 测；Bob 收到 0 沿 φ 测、收到 1 沿 −φ 测。两人都报测到的结果。",
  decide: function decide(s, p) {
    var deg = s.role === "A" ? (s.x === 0 ? 0 : 2 * p.phi) : (s.x === 0 ? p.phi : -p.phi);
    return s.measure(deg);                      // 把偏振片转到 deg 度，测自己手里的那个光子：通过 = 0，被挡住 = 1
  }
};
LIB.bell_q = {
  head: "测量纠缠光子（四个角度）：Alice 收到 0、1 分别沿 α0、α1 测，Bob 收到 0、1 分别沿 β0、β1 测。两人都报测到的结果。",
  decide: function decide(s, p) {
    if (s.role === "A") return s.measure(s.x === 0 ? p.a0 : p.a1);
    return s.measure(s.x === 0 ? p.b0 : p.b1);
  }
};

WORLDS.q_bell = {
  ideas: ['Alice 和 Bob 每回合用 s.shared 把两个人的偏振片一起转一个随机的角度：胜率会变吗', '只在收到 1 的时候测量，收到 0 的时候直接答 0', '先用经典答法表，再只把 Bob 换成测量'],
  mk: { 2: "输掉的回合" },
  name: "⑮ Bell 游戏", short: "Bell 游戏", group: GROUP, game: true, quantum: true, no: 15, unit: "回合",
  blurb: "裁判每回合各给 Alice 和 Bob 一个随机比特，两人不能通气，各答一个比特：两人都收到 1 时要答得不同，其余时候要答得相同。什么都不带，最多赢 75%；各拿一个纠缠光子，能赢到 85%。",
  params: [
    num("T", "一局多少回合", 200, 10, 2000, 10, { hint: "一局就是一次实验：回合越多，一次实验越能分辨 75% 和 85%" }),
    sel("src", "光子从哪里来", "q", [["q", "纠缠光子对"], ["lhv", "局部隐变量源"]], { descs: { q: "每回合一对处在 |Φ⁺⟩ = (|HH⟩ + |VV⟩)/√2 的光子，Alice 和 Bob 各拿一个。可以加白噪声：可见度 v < 1 时，有 1 − v 的概率这一对光子是完全随机的。", lhv: "Bell 自己写下的那种经典模型：每对光子出厂时带着同一个隐藏的偏振方向 λ（在 0° 到 180° 之间均匀），测量结果由偏振片的角度和 λ 决定，哪一边的结果都不受另一边的角度影响。" } }),
    num("v", "纠缠的可见度 v", 1, 0, 1, 0.01, { show: function (p) { return p.src !== "lhv"; }, hint: "1 = 理想的纠缠；低于 1/√2 ≈ 0.707 时，任何测量角度都赢不过 75%" })
  ],
  defaults: { N: 2000, T: 200, K: 1 },
  Tof: function (p) { return clamp(p.T | 0, 1, 20000); },
  hidden: function (p, T) { return { x: T, y: T, sh: T, u: 2 * T, lam: T }; },
  consts: function (p, T) { return { T: T, src: p.src === "lhv" ? "lhv" : "q", v: clamp(+p.v, 0, 1) }; },
  score: function () { return { name: "胜率", kind: "prob", digits: 1 }; },
  track: { name: "累计赢的回合" }, obs: { name: "这一回合要答得不同吗（x 与 y 都是 1）", draw: "bars" }, action: { name: "两人答得不同（a ⊕ b）", kind: "flag" },
  aux: [{ name: "CHSH 值 S（经典 ≤ 2，量子 ≤ 2√2）", digits: 3 }, { name: "Bob 答 1 的比例：Alice 收到 1 时减收到 0 时", digits: 3 }, { name: "单看这一局就能断定超过了 75% 的比例（高出 3 个标准误）", kind: "prob", digits: 1 }],
  defStrat: "bell_phi",
  gen: function (c) {
    var T = c.T, g = c.rng, h = c.h, t;
    for (t = 0; t < T; t++) {
      var x = g.u() < 0.5 ? 1 : 0, y = g.u() < 0.5 ? 1 : 0;
      h.x[t] = x; h.y[t] = y; h.sh[t] = g.u(); h.u[2 * t] = g.u(); h.u[2 * t + 1] = g.u(); h.lam[t] = 180 * g.u();
      c.r[t] = x & y;                           // 一回合结束后才公布：这一回合是不是"要答得不同"的那一种
      c.lv[t] = 0;                              // 行动之前两人共同看得到的东西：没有
    }
    c.lv[T] = 0;
  },
  play: function (E) {
    var T = E.T, V = E.V, g = E.g, hx = E.h.x, hy = E.h.y, sh = E.h.sh, hu = E.h.u, lam = E.h.lam, lhv = g.src === "lhv", v = g.v;
    var t, a, b, x, y, wins = 0, n = [0, 0, 0, 0], same = [0, 0, 0, 0], b1 = [0, 0], nx = [0, 0];
    var done = [false, false], out = [0, 0], first = -1, firstDeg = 0, firstOut = 0;
    function meas(role, deg) {
      if (done[role]) return out[role];         // 一回合只能测一次：再测，还是同一个结果
      deg = +deg; if (!(deg === deg) || !isFinite(deg)) deg = 0;
      var o;
      if (lhv) o = Math.cos(2 * (deg - lam[t]) * RAD) >= 0 ? 0 : 1;   // 结果由偏振片的角度和这对光子自带的 λ 决定
      else if (first < 0) { o = hu[2 * t] < 0.5 ? 0 : 1; first = role; firstDeg = deg; firstOut = o; }   // 先测的一方：一半一半
      else o = hu[2 * t + 1] < (1 + v * Math.cos(2 * (firstDeg - deg) * RAD)) / 2 ? firstOut : 1 - firstOut;   // 后测的一方：按两个角度之差
      done[role] = true; out[role] = o;
      return o;
    }
    function measA(deg) { return meas(0, deg); }
    function measB(deg) { return meas(1, deg); }
    V.last = NaN;
    for (t = 0; t < T; t++) {
      x = hx[t]; y = hy[t]; done[0] = done[1] = false; first = -1; V.shared = sh[t];
      V.role = "A"; V.x = x; V.measure = measA; a = E.ask(t, 0) >= 0.5 ? 1 : 0;
      V.role = "B"; V.x = y; V.measure = measB; b = E.ask(t, 1) >= 0.5 ? 1 : 0;
      var k = 2 * x + y, win = (a ^ b) === (x & y) ? 1 : 0;
      wins += win; n[k]++; if (a === b) same[k]++; nx[x]++; b1[x] += b;
      V.last = win;
      E.dx(t, x & y); E.put(t, a ^ b, wins, win ? 0 : 2);
    }
    var S = 0, ok = true;
    for (k = 0; k < 4; k++) { if (!n[k]) { ok = false; break; } var e = (2 * same[k] - n[k]) / n[k]; S += k === 3 ? -e : e; }
    E.score = wins / T; E.aux[0] = ok ? S : NaN; E.aux[1] = nx[0] && nx[1] ? b1[1] / nx[1] - b1[0] / nx[0] : NaN; E.aux[2] = wins > 0.75 * T + 3 * Math.sqrt(0.1875 * T) ? 1 : 0;   // 按经典上限 3/4 时的标准差 √(3/16·T) 算
  },
  theory: function (p) {
    var th = bellTheory(p), marks = [{ id: "cl", name: "不用纠缠的任何做法的上限（Bell–CHSH 不等式）", value: 0.75, kind: "theory" }];
    if (th.src === "lhv") marks.push({ id: "best", name: "局部隐变量源下的最好成绩：和不用纠缠一样", value: 0.75, kind: "optimum" });
    else if (th.ts > 0.75) marks.push({ id: "best", name: "量子力学允许的最好成绩：1/2 + v·√2/4（v = 1 时是 Tsirelson 界 cos²22.5°）", value: th.ts, kind: "optimum" });
    else marks.push({ id: "best", name: "可见度不到 1/√2：最好的仍是不用纠缠的 75%（测量最多 " + (th.ts * 100).toFixed(1) + "%）", value: 0.75, kind: "optimum" });
    return {
      src: th.src, v: th.v, ts: th.ts, best: th.best, marks: marks,
      curves: {
        "bell_phi.phi": { f: function (phi) { return bellPhi(th.src, th.v, phi); }, name: th.src === "lhv" ? "理论：隐变量源上的胜率" : "理论胜率 1/2 + v·(3cos2φ − cos6φ)/8" },
        "bell_shared.w": { f: function (w) { return w >= 0 && w <= 1 ? 0.25 + w / 2 : NaN; }, name: "理论：两张答法表按 w 混合，1/4 + w/2" }
      }
    };
  },
  refs: function (p) {
    return [
      { id: "zero", name: "都答 0", lib: "bell_zero", p: {}, bench: true },
      { id: "rand", name: "各自随便答", lib: "bell_rand", p: {} },
      { id: "same", name: "纠缠光子，但都沿 0° 测", lib: "bell_phi", p: { phi: 0 } },
      { id: "opt", name: "纠缠光子，标准角度（0°/45° 对 22.5°/−22.5°）", lib: "bell_phi", p: { phi: 22.5 } }
    ];
  },
  scenes: [
    { name: "理想纠缠", p: { src: "q", v: 1 } }, { name: "可见度 0.9", p: { src: "q", v: 0.9 } }, { name: "可见度 0.7", p: { src: "q", v: 0.7 } },
    { name: "局部隐变量源", p: { src: "lhv" } }, { name: "一局 50 回合", p: { T: 50 } }, { name: "一局 1000 回合", p: { T: 1000 } }
  ],
  api: [
    "同一段代码给两个人用：每回合裁判先问 Alice、再问 Bob。s.role 是 \"A\" 或 \"B\"；s.x 是这个人自己收到的比特（0 或 1），对方的那一个他看不到。",
    "动作：返回这个人的答案，0 或 1（≥ 0.5 算 1）。两人的答案 a、b 满足 a ⊕ b = x ∧ y 就赢：只有两人都收到 1 时要答得不同。",
    "s.measure(deg)  把偏振片转到 deg 度（角度制），测自己手里的那个光子：通过返回 0，被挡住返回 1。每回合每人只能测一次，再调用返回同一个结果。",
    "s.shared       这一回合两人共有的一个 (0,1) 随机数（事先约好的随机数表）；s.rnd() 是自己的随机数",
    "s.last         上一回合赢了没有（1 = 赢，0 = 输，第一回合是 NaN）；s.ret(k) 是 k+1 回合之前那一回合是否\"要答得不同\"",
    "st             Alice 和 Bob 各有自己的一份 st（init 各调用一次），互不相通。代码顶层的变量是两人共用的：拿它传话就是作弊，胜率可以超过量子力学的上限 85.36%，那正是传了话的证据。",
    "s.g.src  s.g.v  s.g.T   光子从哪来（\"q\" 纠缠，\"lhv\" 局部隐变量）、可见度、一局多少回合"
  ].join("\n")
};

/* ================================================================== *
 *  ⑯ 量子搜索（Grover）
 * ================================================================== */
/** N 个盒子里有 M 个奖品时，从均匀叠加态出发、转 k 步（每步一次查询）再测量，测到奖品的概率。
 *  每一步有 eps 的概率退相干（整个寄存器变成完全混合态，之后再转也没用，测量就是随便猜） */
function grovP(N, M, k, eps) {
  if (M <= 0) return 0;
  if (M >= N) return 1;
  var th = Math.asin(Math.sqrt(M / N)), s = Math.sin((2 * k + 1) * th), keep = eps > 0 ? Math.pow(1 - eps, k) : 1;
  return keep * s * s + (1 - keep) * M / N;
}
/** 固定"转 k 步就测、落空就从头再来"，查询预算是 T 时，用掉的查询次数的期望（没找到的局按 T 算） */
function grovCost(N, M, k, eps, T) {
  var p = grovP(N, M, k, eps), L = k + 1, m = Math.floor(T / L);
  if (!(p > 0) || m < 1) return T;
  var q = 1 - p, qm = Math.pow(q, m);
  return L * (1 - qm * (1 + m * p)) / p + T * qm;
}
/** 经典的最好做法：不放回地一个一个查。用掉的查询次数 min(X, T) 的期望，X 是第一个奖品在随机次序里的位置 */
function sweepCost(N, M, T) {
  if (M <= 0) return T;
  var tail = 1, s = 0, j;
  for (j = 0; j < T; j++) { s += tail; if (j >= N - M) break; tail *= (N - M - j) / (N - j); if (tail < 1e-15) break; }
  return s;
}
/** 一组世界参数里每一局的奖品数：知道时就是 M；不知道时在 1 到 M 之间均匀 */
function searchMs(p) { var M = clamp(p.M | 0, 1, 1 << 20); if (p.mk === "unknown") { var a = []; for (var i = 1; i <= M; i++) a.push(i); return a; } return [M]; }
function searchN(p) { return Math.pow(2, clamp(p.n | 0, 1, 24)); }
/** "转 k 步、落空重来"这一族里期望查询最少的 k（不计预算）。M 不知道时照它是 1 来算 */
function grovBestK(N, M, eps) {
  var th = Math.asin(Math.sqrt(Math.min(1, M / N))), hi = Math.ceil(Math.PI / (4 * th)) + 2, best = 0, bv = Infinity;
  for (var k = 0; k <= hi; k++) { var v = (k + 1) / grovP(N, M, k, eps); if (v < bv - 1e-12) { bv = v; best = k; } }
  return best;
}
function grovFullK(N, M) { return Math.floor(Math.PI / (4 * Math.asin(Math.sqrt(Math.min(1, M / N))))); }
function searchTheory(p) {
  return once("search", JSON.stringify([p.n, p.M, p.mk, p.eps, p.T]), function () {
    var N = searchN(p), Ms = searchMs(p), eps = clamp(+p.eps, 0, 1), T = clamp(p.T | 0, 1, 1e7), avg = function (f) { var s = 0; Ms.forEach(function (m) { s += f(m); }); return s / Ms.length; };
    var known = p.mk !== "unknown", Mk = known ? Ms[0] : 1;
    var kBest = grovBestK(N, Mk, eps), kFull = grovFullK(N, Mk);
    return {
      N: N, Ms: Ms, known: known, kBest: kBest, kFull: kFull,
      guess: avg(function (m) { return grovCost(N, m, 0, eps, T); }),
      sweep: avg(function (m) { return sweepCost(N, m, T); }),
      best: avg(function (m) { return grovCost(N, m, kBest, eps, T); }),
      full: avg(function (m) { return grovCost(N, m, kFull, eps, T); }),
      fixed: function (k) { return avg(function (m) { return grovCost(N, m, k, eps, T); }); },
      pFull: avg(function (m) { return grovP(N, m, kFull, eps); })
    };
  });
}
QL.grovP = grovP; QL.grovCost = grovCost; QL.sweepCost = sweepCost; QL.grovBestK = grovBestK; QL.grovFullK = grovFullK; QL.searchTheory = searchTheory;

LIB.srch_guess = {
  head: "每次都直接测：不转，测出来的就是随便猜的一个盒子。它是这套玩法的基准。",
  decide: function decide(s, p) {
    return 0;                                   // 0 = 测量并核对；1 = 再转一步
  }
};
LIB.srch_fixed = {
  head: "固定转 k 步再测：落空了就从头再来，还是转 k 步。",
  decide: function decide(s, p) {
    return s.k < p.k ? 1 : 0;                   // s.k：上次测量之后已经转了几步
  }
};
LIB.srch_full = {
  head: "转到成功率最高再测（Grover）：转 ⌊π/(4θ)⌋ 步，sin θ = √(M/N)。不知道有几个奖品时，当作只有一个。",
  decide: function decide(s, p, st) {
    if (st.k === undefined) {
      var M = s.g.M === s.g.M ? s.g.M : 1;      // s.g.M 是 NaN：不知道有几个奖品，就当作 1 个
      st.k = Math.floor(Math.PI / (4 * Math.asin(Math.sqrt(Math.min(1, M / s.g.N)))));
    }
    return s.k < st.k ? 1 : 0;
  }
};
LIB.srch_best = {
  head: "按期望查询次数最少来转：在\"转 k 步、落空重来\"里挑 (k + 1)/P(测中) 最小的 k。比转到成功率最高要早停。",
  decide: function decide(s, p, st) {
    if (st.k === undefined) {
      var N = s.g.N, M = s.g.M === s.g.M ? s.g.M : 1, eps = s.g.eps, th = Math.asin(Math.sqrt(Math.min(1, M / N))), best = 0, bv = Infinity;
      for (var k = 0; k <= Math.ceil(Math.PI / (4 * th)) + 2; k++) {
        var keep = Math.pow(1 - eps, k), sn = Math.sin((2 * k + 1) * th);
        var pk = keep * sn * sn + (1 - keep) * M / N;   // 转 k 步再测，测中的概率（算上退相干）
        if ((k + 1) / pk < bv - 1e-12) { bv = (k + 1) / pk; best = k; }   // 每一轮花 k + 1 次查询，平均要 1/pk 轮
      }
      st.k = best;
    }
    return s.k < st.k ? 1 : 0;
  }
};
LIB.srch_bbht = {
  head: "不知道有几个奖品（Boyer–Brassard–Høyer–Tapp）：每一轮从 0 到 m − 1 里随机挑转几步，落空就把 m 放大 λ 倍，直到 √N 为止。",
  init: function init(p) {
    return { m: 1, j: -1 };                     // j = −1：这一轮转几步还没定
  },
  decide: function decide(s, p, st) {
    if (st.j < 0) st.j = Math.floor(s.rnd() * st.m);
    if (s.k < st.j) return 1;
    st.j = -1; st.m = Math.min(p.lam * st.m, Math.sqrt(s.g.N));   // 这一轮测完：下一轮的范围放大
    return 0;
  }
};

WORLDS.q_search = {
  ideas: ['先按只有一个奖品转，落空一次就把转的步数减半', '不知道有几个奖品：先用几轮经典的随便猜估计 M，再按估出来的 M 转', '退相干的世界里：每轮只转到 √N 的一半就测'],
  mk: { 1: "测量并核对", 2: "退相干了", 3: "已经找到" },
  name: "⑯ 量子搜索", short: "量子搜索", group: GROUP, game: true, quantum: true, no: 16, unit: "次查询",
  blurb: "N 个盒子里藏着奖品，问一次黑盒算一次查询。每次查询，要么让量子计算机再转一步，要么测量、并用这次查询核对测出来的那个盒子。找到奖品为止，比谁用的查询少。",
  params: [
    num("n", "量子比特数 n（盒子数 N = 2ⁿ）", 10, 2, 20, 1, { hint: "n = 10 时 N = 1024；n = 20 时超过一百万" }),
    num("T", "查询预算", 4096, 16, 50000, 16, { hint: "用完还没找到，这一局按预算记" }),
    sel("mk", "奖品有几个", "known", [["known", "正好 M 个，你知道 M"], ["unknown", "1 到 M 个之间，你不知道"]], { descs: { known: "每一局都正好藏着 M 个奖品，位置随机，规则读得到 M。", unknown: "每一局的奖品数在 1 到 M 之间均匀地抽，规则读不到它（s.g.M 是 NaN，s.g.Mmax 是 M）。" } }),
    num("M", "奖品数 M（或上限）", 1, 1, 256, 1),
    num("eps", "每转一步退相干的概率", 0, 0, 0.2, 0.001, { hint: "退相干之后整个寄存器变成完全混合态：再转也没用，测量就是随便猜" })
  ],
  defaults: { N: 500, T: 4096, K: 1 },
  Tof: function (p) { return clamp(p.T | 0, 1, 1e6); },
  hidden: function (p, T) { return { u: T, M: 1 }; },
  consts: function (p, T) { var N = searchN(p), M = clamp(p.M | 0, 1, N); return { T: T, n: clamp(p.n | 0, 1, 24), N: N, M: p.mk === "unknown" ? NaN : M, Mmax: M, eps: clamp(+p.eps, 0, 1) }; },
  score: function () { return { name: "找到奖品用掉的查询次数", digits: 1, lower: true }; },
  track: { name: "已经用掉的查询" }, obs: { name: "此刻测量能测中的概率（只有裁判知道）" }, action: { name: "再转一步", kind: "flag" },
  aux: [{ name: "预算内没找到的比例", kind: "prob", digits: 1 }, { name: "平均测量了几次", digits: 2 }, { name: "这一局的奖品数", digits: 2 }],
  defStrat: "srch_best",
  ranges: function (p) { var th = searchTheory(p); return { "srch_fixed.k": [0, Math.max(10, Math.ceil(2.5 * th.kFull)), th.kBest] }; },
  gen: function (c) {
    var T = c.T, g = c.rng, N = searchN(c.p), Mx = clamp(c.p.M | 0, 1, N), t;
    c.h.M[0] = c.p.mk === "unknown" ? 1 + g.int(Mx) : Mx;
    for (t = 0; t < T; t++) { c.h.u[t] = g.u(); c.r[t] = 0; c.lv[t] = 0; }
    c.lv[T] = 0;
  },
  play: function (E) {
    var T = E.T, V = E.V, g = E.g, N = g.N, M = E.h.M[0], u = E.h.u, eps = g.eps, th = Math.asin(Math.sqrt(Math.min(1, M / N)));
    var k = 0, dec = false, fails = 0, meas = 0, t, a, found = -1;
    V.k = 0; V.fails = 0; V.last = NaN;
    for (t = 0; t < T; t++) {
      var sn = Math.sin((2 * k + 1) * th), pNow = dec ? M / N : sn * sn;
      V.k = k; V.fails = fails;
      E.dx(t, pNow);
      a = E.ask(t);
      if (a !== a) { E.put(t, NaN, t + 1, 0); continue; }   // 无效的返回值：这一次查询白白浪费
      if (a >= 0.5) {                                        // 再转一步：一次查询
        k++;
        var m = 0;
        if (!dec && eps > 0 && u[t] < eps) { dec = true; m = 2; } else if (dec) m = 2;
        V.last = NaN; E.put(t, 1, t + 1, m);
      } else {                                               // 测量，并用一次查询核对测出来的盒子
        meas++;
        if (u[t] < pNow) { found = t; V.last = 1; E.put(t, 0, t + 1, 1); break; }
        fails++; k = 0; dec = false; V.last = 0;             // 落空：重新准备均匀叠加态，从头再来
        E.put(t, 0, t + 1, 1);
      }
    }
    if (found >= 0) E.fill(found + 1, found + 1, 3);
    var used = found >= 0 ? found + 1 : T;
    E.score = -used; E.aux[0] = found >= 0 ? 0 : 1; E.aux[1] = meas; E.aux[2] = M;
  },
  theory: function (p) {
    var th = searchTheory(p), marks = [
      { id: "guess", name: "每次都直接测（公式）", value: -th.guess },
      { id: "sweep", name: "经典的最好做法：不放回地一个一个查（公式）", value: -th.sweep, kind: "theory" }
    ];
    if (th.known) {
      marks.push({ id: "full", name: "转 " + th.kFull + " 步再测（转到成功率最高，公式）", value: -th.full });
      marks.push({ id: "best", name: "转 " + th.kBest + " 步再测（这一族里期望查询最少，公式）", value: -th.best, kind: "optimum" });
    }
    return {
      N: th.N, kBest: th.kBest, kFull: th.kFull, known: th.known, guess: th.guess, sweep: th.sweep, best: th.best, full: th.full, pFull: th.pFull, marks: marks,
      curves: { "srch_fixed.k": { f: function (k) { k = Math.round(k); return k >= 0 ? -th.fixed(k) : NaN; }, name: "理论：转 k 步、落空重来" } }
    };
  },
  refs: function (p) {
    var th = searchTheory(p), L = [
      { id: "guess", name: "每次都直接测", lib: "srch_guess", p: {}, bench: true },
      { id: "full", name: "转到成功率最高再测（Grover）", lib: "srch_full", p: {} },
      { id: "best", name: "按期望查询最少来转", lib: "srch_best", p: {} },
      { id: "bbht", name: "不知道有几个：随机步数、逐轮放大（λ = 1.2）", lib: "srch_bbht", p: { lam: 1.2 } }
    ];
    return L;
  },
  scenes: [
    { name: "1024 个盒子，1 个奖品", p: { n: 10, M: 1, mk: "known", eps: 0 } }, { name: "4 个奖品，知道", p: { M: 4 } }, { name: "1 到 16 个，不知道", p: { mk: "unknown", M: 16 } },
    { name: "每步 1% 退相干", p: { eps: 0.01 } }, { name: "每步 5% 退相干", p: { eps: 0.05 } }, { name: "只有 16 个盒子", p: { n: 4, T: 256 } }, { name: "2²⁰ 个盒子", p: { n: 20, T: 6000 } }
  ],
  api: [
    "动作：返回 1 = 再转一步（一次 Grover 迭代，花一次查询）；返回 0 = 测量，并花一次查询核对测出来的那个盒子。测中了这一局结束；落空了，寄存器重新准备成均匀叠加态，从头再来。",
    "s.k          上次测量之后已经转了几步（测量之后归零）",
    "s.fails      已经落空了几次；s.last 是上一次测量的结果（1 = 测中，0 = 落空，没测过是 NaN）",
    "s.g.N  s.g.n  盒子数 N = 2ⁿ、量子比特数 n；s.g.T 是查询预算",
    "s.g.M        奖品数（不知道时是 NaN）；s.g.Mmax 是它的上限；s.g.eps 是每转一步退相干的概率",
    "s.rnd()      (0,1) 上的均匀随机数。量子态本身规则看不到：它在裁判手里，只能通过转和测去碰。"
  ].join("\n")
};

/* ================================================================== *
 *  ⑰ 炸弹检测（Elitzur–Vaidman，量子芝诺效应）
 * ================================================================== */
/** 每颗炸弹：先转 N 次、每次 90°/N，每次之后让光子走一圈；走完测量，水平偏振判真、竖直判哑；光子半路丢了就换一个从头来。
 *  按回合精确地倒推出这种做法的期望得分（转一次、测一次、判一次各占一个回合，预算 T 个回合） */
function zenoScore(N, q, eps, c, T) {
  N = Math.max(1, N | 0);
  var s2 = Math.pow(Math.sin(Math.PI / (2 * N)), 2);
  /* 换一个新光子、还剩 r 步时的期望得分 f(r)。第 j 圈（j = 1…N）在第 j 步：光子先以 ε 的概率丢掉（之后从 f(r − j) 重来），
   * 没丢的话真炸弹以 sin²(π/2N) 的概率炸掉；走完 N 圈之后测量（第 N + 1 步）、判定（第 N + 2 步），都判对。
   * 记 a 为"一圈下来光子还在、也没炸"的概率，W(r) = Σ_{j ≤ min(N, r)} a^{j−1} f(r − j)，则
   *   f(r) = ε·W(r) − c(1 − ε)s²·(1 − a^{min(N, r)})/(1 − a) + [r ≥ N + 2]·a^N，W(r + 1) = f(r) + a·(W(r) − [r ≥ N]·a^{N−1} f(r − N))。
   * 每个 r 只要常数次运算：整个倒推是 O(T)。 */
  function run(a, boom) {
    var f = new Float64Array(T + 1), W = 0, aN = Math.pow(a, N), aN1 = Math.pow(a, N - 1), r;
    for (r = 1; r <= T; r++) {
      if (r > 1) W = f[r - 1] + a * (W - (r - 1 >= N ? aN1 * f[r - 1 - N] : 0));
      var m = Math.min(N, r), G = a < 1 ? (1 - Math.pow(a, m)) / (1 - a) : m;
      f[r] = eps * W - boom * G + (r >= N + 2 ? aN : 0);
    }
    return f[T];
  }
  var live = run((1 - eps) * (1 - s2), c * (1 - eps) * s2), dud = run(1 - eps, 0);
  return { score: q * live + (1 - q) * dud, live: live, dud: dud };
}
/** 真炸弹在一个光子上的结局：完好地走完 N 圈的概率、半路被炸的概率（不计预算、没有损耗时就是 cos^{2N}(π/2N) 和其余） */
function zenoOnce(N, eps) {
  var s2 = Math.pow(Math.sin(Math.PI / (2 * N)), 2), stay = (1 - eps) * (1 - s2), ok = Math.pow(stay, N), boom = 0, alive = 1;
  for (var j = 0; j < N; j++) { boom += alive * (1 - eps) * s2; alive *= stay; }
  return { ok: ok, boom: boom, lost: 1 - ok - boom };
}
function bombTheory(p) {
  return once("bomb", JSON.stringify([p.q, p.eps, p.c, p.T]), function () {
    var q = clamp(+p.q, 0, 1), eps = clamp(+p.eps, 0, 0.999), c = Math.max(0, +p.c), T = clamp(p.T | 0, 1, 1e5), best = 1, bv = -Infinity, cur = [], N;
    for (N = 1; N <= Math.min(400, T - 2); N++) { var v = zenoScore(N, q, eps, c, T).score; cur[N] = v; if (v > bv + 1e-12) { bv = v; best = N; } }
    // 直接看一眼：转 90° 走一圈。真炸弹一定炸（除非光子先丢了），哑弹测出竖直、判对
    var look = zenoScore(1, q, eps, c, T).score;
    return { q: q, eps: eps, c: c, T: T, nBest: best, best: bv, curve: cur, look: look, guess: Math.abs(2 * q - 1), two: cur[2] };
  });
}
QL.zenoScore = zenoScore; QL.zenoOnce = zenoOnce; QL.bombTheory = bombTheory;

LIB.bomb_look = {
  head: "直接看一眼：光子转到竖直偏振、整个送进炸弹那一路，再测。经典的检查方法。它是这套玩法的基准。",
  decide: function decide(s, p) {
    if (s.last === s.last) return s.last === 1 ? -2 : -1;   // 测过了：竖直（1）判哑弹，水平（0）判真炸弹
    if (s.n === 0) return 90;                   // 新的光子：转 90°，走一圈
    return 0;                                   // 走完了：测量
  }
};
LIB.bomb_guess = {
  head: "不测，直接猜：真炸弹的比例过半就判真，否则判哑。",
  decide: function decide(s, p) {
    return s.g.q >= 0.5 ? -1 : -2;              // −1 = 判真炸弹，−2 = 判哑弹
  }
};
LIB.bomb_zeno = {
  head: "量子芝诺：每次只转 90°/N，走一圈，重复 N 次再测。水平偏振判真，竖直判哑；光子半路丢了就换一个从头来。",
  decide: function decide(s, p) {
    if (s.last === s.last) return s.last === 1 ? -2 : -1;
    if (s.n < p.N) return 90 / p.N;             // s.n：这个光子已经走了几圈（换光子时归零）
    return 0;
  }
};
LIB.bomb_best = {
  head: "按损耗和预算选步数：开局之前倒推出每一种 N 的期望得分，取最好的 N，再按量子芝诺的做法测。",
  fit: function fit(D, p, ml, rng) {
    // 只用到细则里的常数（D.g：每颗几步、真炸弹的比例、丢光子的概率、炸一颗扣几分），不看数据。N 从 1 试到 min(400, T − 2)
    var g = D.g, T = g.T, best = 1, bv = -Infinity, N;
    // 换一个新光子、还剩 r 步时的期望得分 f(r)：a 是一圈下来光子还在、也没炸的概率，boom 是每圈炸掉的扣分
    function score(N, a, boom) {
      var f = new Float64Array(T + 1), W = 0, aN = Math.pow(a, N), aN1 = Math.pow(a, N - 1);
      for (var r = 1; r <= T; r++) {
        if (r > 1) W = f[r - 1] + a * (W - (r - 1 >= N ? aN1 * f[r - 1 - N] : 0));   // W(r) = Σ a^(j−1)·f(r − j)：丢了光子从头来
        var m = Math.min(N, r), G = a < 1 ? (1 - Math.pow(a, m)) / (1 - a) : m;
        f[r] = g.eps * W - boom * G + (r >= N + 2 ? aN : 0);  // 走完 N 圈、测量、判定：都判对，得 1 分
      }
      return f[T];
    }
    for (N = 1; N <= Math.min(400, T - 2); N++) {
      var s2 = Math.pow(Math.sin(Math.PI / (2 * N)), 2);
      var v = g.q * score(N, (1 - g.eps) * (1 - s2), g.c * (1 - g.eps) * s2) + (1 - g.q) * score(N, 1 - g.eps, 0);
      if (v > bv + 1e-12) { bv = v; best = N; }
    }
    return { N: best, note: "倒推的结果：N = " + best + " 最好，期望每颗得 " + bv.toFixed(3) + " 分。" };
  },
  decide: function decide(s, p, st, model) {
    if (s.last === s.last) return s.last === 1 ? -2 : -1;
    if (s.n < model.N) return 90 / model.N;
    return 0;
  }
};

WORLDS.q_bomb = {
  ideas: ['先转小角度试几圈，光子丢得多就把步数减少', '走完 N 圈测出水平之后，再换一个光子复核一次', '真炸弹很少时，干脆直接看一眼'],
  mk: { 1: "测量", 2: "光子丢了", 3: "这一局已经结束" },
  name: "⑰ 炸弹检测", short: "炸弹检测", group: GROUP, game: true, quantum: true, no: 17, unit: "步",
  blurb: "一批炸弹真假混杂，真炸弹只要被一个光子碰到就会炸。不碰它，能不能知道它是真的？每一步把光子的偏振转一个角度、让它走一圈，竖直偏振的那一部分会去炸弹那一路。转得越小越安全，可光路会丢光子，步数也有限。",
  params: [
    num("T", "每颗炸弹最多用几步", 300, 10, 3000, 10, { hint: "转一次走一圈、测量一次、做出判定，各占一步" }),
    num("c", "炸掉一颗扣几分", 1, 0, 10, 0.5, { hint: "判对 +1，判错 −1，炸了扣这么多，没判 0 分" }),
    num("q", "真炸弹的比例", 0.5, 0, 1, 0.01),
    num("eps", "光子每走一圈丢失的概率", 0.01, 0, 0.2, 0.001, { hint: "0 = 完美的光路；丢了的光子不会碰到炸弹，但这一圈白走" })
  ],
  defaults: { N: 2000, T: 300, K: 1 },
  Tof: function (p) { return clamp(p.T | 0, 3, 1e5); },
  hidden: function (p, T) { return { live: 1, u: 2 * T }; },
  consts: function (p, T) { return { T: T, q: clamp(+p.q, 0, 1), eps: clamp(+p.eps, 0, 0.999), c: Math.max(0, +p.c) }; },
  score: function () { return { name: "平均每颗的得分", digits: 3 }; },
  track: { name: "这一颗定下来的得分" }, obs: { name: "光子到炸弹之前的偏振角（只有裁判知道，度）" }, action: { name: "这一步的动作（度；0 测量，−1 判真，−2 判哑）", kind: "level" },
  aux: [{ name: "炸掉的比例", kind: "prob", digits: 1 }, { name: "判错的比例", kind: "prob", digits: 1 }, { name: "真炸弹里完好地确认出来的比例", kind: "prob", digits: 1, cond: true }, { name: "平均用了几步", digits: 1 }],
  defStrat: "bomb_best",
  ranges: function (p) { var th = bombTheory(p); return { "bomb_zeno.N": [1, Math.max(20, Math.min(400, Math.ceil(2.5 * th.nBest))), th.nBest] }; },
  gen: function (c) {
    var T = c.T, g = c.rng, t;
    c.h.live[0] = g.u() < clamp(+c.p.q, 0, 1) ? 1 : 0;
    for (t = 0; t < T; t++) { c.h.u[2 * t] = g.u(); c.h.u[2 * t + 1] = g.u(); c.r[t] = 0; c.lv[t] = 0; }
    c.lv[T] = 0;
  },
  play: function (E) {
    var T = E.T, V = E.V, g = E.g, live = E.h.live[0] === 1, u = E.h.u, eps = g.eps;
    var psi = 0, turned = 0, n = 0, photons = 1, t, a, sc = 0, end = -1, boom = 0, wrong = 0, ok = NaN;
    V.n = 0; V.turned = 0; V.photons = 1; V.lost = 0; V.last = NaN;
    for (t = 0; t < T; t++) {
      V.n = n; V.turned = turned; V.photons = photons;
      a = E.ask(t);
      if (a === -1 || a === -2) {                                     // 判定：这一局结束
        var sayLive = a === -1, right = sayLive === live;
        sc = right ? 1 : -1; wrong = right ? 0 : 1; if (live) ok = sayLive ? 1 : 0;
        E.dx(t, psi); E.put(t, a, sc, 0); end = t; break;
      }
      if (a === 0) {                                                  // 测量偏振：竖直的概率是 sin²ψ。这个光子用掉了，下一步换新的
        var vert = u[2 * t] < Math.pow(Math.sin(psi * RAD), 2) ? 1 : 0;
        E.dx(t, psi); V.last = vert; V.lost = 0;
        psi = 0; turned = 0; n = 0; photons++;
        E.put(t, 0, 0, 1); continue;
      }
      if (!(a > 0) || !isFinite(a)) { E.dx(t, psi); V.lost = 0; E.put(t, NaN, 0, 0); continue; }   // 无效的动作：这一步什么也没发生
      var d = a % 180;
      psi = (psi + d) % 180; turned = (turned + d) % 180; n++;
      E.dx(t, psi);
      if (u[2 * t] < eps) {                                           // 光子在光路里丢了：没有碰到炸弹，换一个新的从头来
        V.lost = 1; psi = 0; turned = 0; n = 0; photons++;
        E.put(t, a, 0, 2); continue;
      }
      V.lost = 0;
      if (live) {
        if (u[2 * t + 1] < Math.pow(Math.sin(psi * RAD), 2)) { sc = -g.c; boom = 1; if (live) ok = 0; E.put(t, a, sc, 3); end = t; break; }   // 竖直的那一部分进了炸弹那一路：炸了
        psi = 0;                                                      // 没炸：光子一定走的是另一路，偏振塌回水平
      }
      E.put(t, a, 0, 0);
    }
    if (end >= 0) E.fill(end + 1, sc, 3);
    else if (live) ok = 0;
    E.score = sc; E.aux[0] = boom; E.aux[1] = wrong; E.aux[2] = live ? ok : NaN; E.aux[3] = end >= 0 ? end + 1 : T;
  },
  theory: function (p) {
    var th = bombTheory(p), marks = [
      { id: "look", name: "直接看一眼（公式）", value: th.look },
      { id: "guess", name: "不测，猜比例大的一边（公式）", value: th.guess },
      { id: "best", name: "量子芝诺，N = " + th.nBest + "（各种 N 里最好，倒推）", value: th.best, kind: "optimum" },
      { id: "all", name: "每颗都判对、一颗不炸", value: 1, kind: "bound" }
    ];
    return {
      nBest: th.nBest, best: th.best, look: th.look, guess: th.guess, two: th.two, marks: marks,
      curves: { "bomb_zeno.N": { f: function (N) { N = Math.round(N); return N >= 1 && N <= 400 && N <= th.T - 2 ? th.curve[N] : NaN; }, name: "理论（按回合倒推）" } }
    };
  },
  refs: function (p) {
    var th = bombTheory(p);
    return [
      { id: "look", name: "直接看一眼", lib: "bomb_look", p: {}, bench: true },
      { id: "guess", name: "不测，直接猜", lib: "bomb_guess", p: {} },
      { id: "two", name: "两步（每步 45°）", lib: "bomb_zeno", p: { N: 2 } },
      { id: "z10", name: "量子芝诺，N = 10", lib: "bomb_zeno", p: { N: 10 } },
      { id: "best", name: "量子芝诺，按损耗选 N（N = " + th.nBest + "）", lib: "bomb_best", p: {} }
    ];
  },
  scenes: [
    { name: "完美的光路", p: { eps: 0 } }, { name: "每圈丢 1%", p: { eps: 0.01 } }, { name: "每圈丢 5%", p: { eps: 0.05 } },
    { name: "真炸弹只占 10%", p: { q: 0.1 } }, { name: "炸一颗扣 10 分", p: { c: 10 } }, { name: "每颗只给 30 步", p: { T: 30 } }
  ],
  api: [
    "动作：返回一个正数 a = 把光子的偏振再转 a 度，然后让它走一圈：竖直偏振的那一部分去炸弹那一路，水平的那一部分走另一路，最后汇合。",
    "返回 0 = 测量光子的偏振（水平 → s.last = 0，竖直 → s.last = 1）。这个光子用掉了，下一步换一个新的，从水平偏振开始。",
    "返回 −1 = 判定\"是真炸弹\"，返回 −2 = 判定\"是哑弹\"，这一局结束：判对 +1，判错 −1。炸了扣 s.g.c 分，步数用完还没判是 0 分。其他的数什么也不做，白白用掉一步。",
    "真炸弹：光子竖直偏振的那一部分走进炸弹那一路就会炸，概率是 sin²(此刻的偏振角)；没炸的话，光子一定走的是另一路，偏振塌回水平。哑弹：什么也不发生。",
    "s.n          这个光子已经走了几圈；s.turned 是它累计转过的角度（度，按 180° 取余）；换光子时都归零",
    "s.lost       上一步光子是不是在光路里丢了（1 = 丢了，已经换了一个新的）；s.photons 是到现在用了几个光子",
    "s.last       上一次测量的结果（0 水平，1 竖直，没测过是 NaN）",
    "s.g.q  s.g.eps  s.g.c  s.g.T   真炸弹的比例、每圈丢光子的概率、炸一颗扣几分、每颗最多几步"
  ].join("\n")
};

/* ---------- 每套玩法里哪些参数说的是"世界" ---------- */
var WLAYER = {
  q_bell: { wsel: "src", wkeys: ["src", "v"] },
  q_search: { wsel: "mk", wkeys: ["mk", "M", "eps"] },
  q_bomb: { wkeys: ["q", "eps"], wname: "真假混杂的炸弹，会丢光子的光路", wdesc: "每颗炸弹是真是假各自独立地抽，真的概率是 q。光子在光路里每走一圈，有 ε 的概率被吸收掉；被吸收的光子碰不到炸弹。" }
};
Object.keys(WLAYER).forEach(function (k) { var o = WLAYER[k]; Object.keys(o).forEach(function (q) { WORLDS[k][q] = o[q]; }); });

QL.QUANTUM = ["q_bell", "q_search", "q_bomb"];
QL.ALL_GAMES = (QL.ALL_GAMES || QL.GAMES.concat(QL.OBS || [])).concat(QL.QUANTUM);
}
if (typeof module !== "undefined" && module.exports) module.exports = QL_QUANTUM_INSTALL;
