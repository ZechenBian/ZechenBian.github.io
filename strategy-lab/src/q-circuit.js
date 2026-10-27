// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 策略实验室 · 量子电路谜题（十关）：关卡、门、判定。界面在 app-quantum.js。
 * 态矢量的计算用 q-games.js 里的 QL.qsim：和三套量子玩法是同一份模拟器。
 * 第六关（炸弹）、第七关（四选一）、第十关（打破 75%）各对应一套量子玩法：在这里搭出来的电路是一次，到了那边由规则跑几千次。
 * 只在主线程里用（以及测试），不进后台线程。 */
function QL_QCIRCUIT_INSTALL(QL) {
"use strict";
var Q = QL.qsim, C = Q.C, SQ = Q.SQ, MAT = Q.MAT, BELL = Q.BELL, abs2 = Q.abs2, cmul = Q.mul, cadd = Q.add, conj = Q.conj;

/* ---------- 门 ---------- */
var GATES = {
  H: { label: "H", arity: 1, name: "Hadamard", desc: "|0⟩ → |+⟩，|1⟩ → |−⟩。在 Z 基和 X 基之间换基。" },
  X: { label: "X", arity: 1, name: "比特翻转", desc: "|0⟩ ↔ |1⟩。" },
  Y: { label: "Y", arity: 1, name: "Pauli-Y", desc: "Y = iXZ。" },
  Z: { label: "Z", arity: 1, name: "相位翻转", desc: "|1⟩ 乘上 −1，|0⟩ 不变。" },
  S: { label: "S", arity: 1, name: "S 门", desc: "|1⟩ 乘上 i。" },
  T: { label: "T", arity: 1, name: "T 门", desc: "|1⟩ 乘上 e^{iπ/4}。" },
  R4: { label: "R", sub: "π/4", arity: 1, name: "Ry(π/4)", desc: "绕 y 轴转 π/4：|0⟩ → cos(π/8)|0⟩ + sin(π/8)|1⟩。" },
  R8: { label: "R", sub: "π/8", arity: 1, name: "Ry(π/8)", desc: "绕 y 轴转 π/8：|0⟩ → cos(π/16)|0⟩ + sin(π/16)|1⟩。" },
  CNOT: { label: "CNOT", arity: 2, name: "受控非", desc: "控制位为 1 时翻转目标位。先点控制位，再点同一列的目标位。" },
  CZ: { label: "CZ", arity: 2, name: "受控 Z", desc: "两个比特都为 1 时乘上 −1，两个比特的地位对称。先点一个比特，再点同一列的另一个。" },
  M: { label: "M", arity: 1, name: "测量", desc: "在计算基下测量。测量之后这根线只携带经典的结果，只能当控制位。" },
  BOMB: { label: "B", arity: 1, name: "炸弹", desc: "光子在这一刻经过上面那一路的炸弹。真炸弹：|1⟩ 分量引爆；哑弹：什么也不发生。" }
};

function ket(n, i) { var s = i.toString(2); while (s.length < n) s = "0" + s; return "|" + s + "⟩"; }
function basisScenarios(n) { var out = []; for (var k = 0; k < (1 << n); k++) out.push({ label: "输入 " + ket(n, k), init: Q.basis(n, k) }); return out; }
var TELEPORT_INPUTS = [
  { label: "|0⟩", psi: [C(1), C(0)] },
  { label: "|1⟩", psi: [C(0), C(1)] },
  { label: "|+⟩", psi: [C(SQ), C(SQ)] },
  { label: "|−⟩", psi: [C(SQ), C(-SQ)] },
  { label: "|+i⟩", psi: [C(SQ), C(0, SQ)] },
  { label: "一般态", psi: [C(Math.cos(0.6)), cmul(Q.expi(1.1), C(Math.sin(0.6)))] }
];
function deutschOracle(f) {
  return function (st, n) {
    var out = Q.zeros(n), i;
    for (i = 0; i < st.length; i++) { var x = Q.bitOf(i, n, 0), j = f(x) ? (i ^ Q.maskOf(n, 1)) : i; out[j] = st[i]; }
    for (i = 0; i < st.length; i++) st[i] = out[i];
  };
}
function groverOracle(w) { return function (st) { st[w] = [-st[w][0], -st[w][1]]; }; }
function messageOracle(mats) { return function (st, n) { mats.forEach(function (M) { Q.applySingle(st, n, 0, M); }); }; }

/** 隐形传态这一关的约束：测量过的比特只能当控制位；跨越 Alice 和 Bob 的门只能由 Alice 已经测量过的比特控制 */
function teleportValidate(ops) {
  var sorted = ops.slice().sort(function (a, b) { return a.col - b.col; }), measured = {}, i, k;
  for (i = 0; i < sorted.length; i++) {
    var o = sorted[i];
    for (k = 0; k < o.q.length; k++) {
      var w = o.q[k];
      if (measured[w] !== undefined && measured[w] < o.col) {
        var asControl = (o.g === "CNOT" && o.q[0] === w) || o.g === "CZ";
        if (!asControl) return "测量过的比特只携带经典的结果，只能当控制位。";
      }
    }
    if (o.g === "M") {
      if (measured[o.q[0]] !== undefined) return "这根线已经测量过了。";
      measured[o.q[0]] = o.col;
    }
    if (o.q.length === 2) {
      var bob = o.q.indexOf(2);
      if (bob !== -1) {
        var alice = o.q[1 - bob];
        if (!(measured[alice] !== undefined && measured[alice] < o.col)) return "Alice 和 Bob 相距很远。跨越两边的门只能由 Alice 已经测量过的比特控制。";
        if (o.g === "CNOT" && o.q[0] === 2) return "控制位必须是 Alice 测得的经典结果，Bob 的比特只能当目标。";
      }
    }
  }
  return null;
}

/* ---------- 十关 ----------
 * type：state 制备一个态；unitary 拼出一个算子（对每个输入都成立）；oracle 黑盒算法；teleport 隐形传态；bomb 炸弹；chsh 打破 75%。
 * ref：参考解用了几个门（不超过它三星，多两个以内两星）。game：对应的量子玩法。 */
var LEVELS = [
  {
    id: "minus", n: 1, cols: 4, gates: ["X", "Z", "H"], type: "state", ref: 2, initLabels: ["|0⟩"],
    target: [C(SQ), C(-SQ)], targetLabel: "|−⟩",
    tag: "单比特 · 相对相位", title: "负号在哪里",
    goal: "把 |0⟩ 变成 |−⟩ = (|0⟩ − |1⟩)/√2。",
    hints: ["|+⟩ 和 |−⟩ 在计算基下测出 0 和 1 的概率都是一半，二者只差一个相对相位。", "H 把 |0⟩ 送到 |+⟩，把 |1⟩ 送到 |−⟩。Z 把 |+⟩ 送到 |−⟩。"],
    explain: "两条两个门的路：先 X 再 H，或者先 H 再 Z。判定只看保真度 F = |⟨−|ψ⟩|²，所以整体相位不可观测：−|−⟩ 与 |−⟩ 是同一个物理态。相对相位却可以观测：|+⟩ 和 |−⟩ 在计算基下的统计完全一样，再加一个 H 就能百分之百地区分。"
  },
  {
    id: "hzh", n: 1, cols: 5, gates: ["H", "Z"], type: "unitary", ref: 3, initLabels: ["输入"],
    target: [[C(0), C(1)], [C(1), C(0)]], targetLabel: "X",
    tag: "单比特 · 换基", title: "换个基看 X",
    goal: "只用 H 和 Z，拼出一个与 X 门完全相同的操作。它必须对每个输入都成立，最多相差一个整体相位。",
    hints: ["Z 在 {|+⟩, |−⟩} 基下做的事，正是 X 在 {|0⟩, |1⟩} 基下做的事。"],
    explain: "HZH = X。H 是 Z 基和 X 基之间的换基矩阵（而且 H = H⁻¹），所以用 H 共轭一个门，就是在另一组基里看它。同理 HXH = Z。判定计算的是 |Tr(X†U)|/2，它等于 1 当且仅当 U 与 X 只差一个整体相位。"
  },
  {
    id: "bell", n: 2, cols: 4, gates: ["H", "X", "Z", "CNOT"], type: "state", ref: 2, initLabels: ["|0⟩", "|0⟩"],
    target: [C(SQ), C(0), C(0), C(SQ)], targetLabel: "|Φ⁺⟩",
    tag: "两比特 · 纠缠", title: "纠缠",
    goal: "从 |00⟩ 制备 Bell 态 |Φ⁺⟩ = (|00⟩ + |11⟩)/√2。",
    hints: ["先让上面的比特进入叠加态，再用它去控制下面的比特。"],
    explain: "H 之后两个比特仍是乘积态 |+⟩|0⟩；CNOT 之后就无法写成两个单比特态的乘积了。点电路上方的步骤号，对比 CNOT 前后的 Bloch 球：每个比特的 Bloch 向量从球面缩到了球心，单个比特的约化态变成了最大混合态 I/2，信息全部存在于两者的关联之中。⑮ Bell 游戏里分给 Alice 和 Bob 的，就是这样一对光子。",
    game: "q_bell"
  },
  {
    id: "swap", n: 2, cols: 5, gates: ["CNOT"], type: "unitary", ref: 3, initLabels: ["输入", "输入"],
    target: [[C(1), C(0), C(0), C(0)], [C(0), C(0), C(1), C(0)], [C(0), C(1), C(0), C(0)], [C(0), C(0), C(0), C(1)]], targetLabel: "SWAP",
    tag: "两比特 · 算子恒等式", title: "三次异或",
    goal: "只用 CNOT 交换两个比特。必须对所有输入都成立，包括叠加态。",
    hints: ["经典程序里，a ^= b; b ^= a; a ^= b 可以不用临时变量交换两个数。"],
    explain: "方向交替的三个 CNOT 正是那个异或的技巧。门是线性的，所以在四个基矢上都对，就在一切叠加态上都对；判定检查的是整个 4×4 矩阵，包括各列之间的相对相位。"
  },
  {
    id: "deutsch", n: 2, cols: 5, gates: ["H", "X", "Z"], type: "oracle", ref: 4, initLabels: ["|0⟩", "|0⟩"],
    locked: [{ g: "ORACLE", col: 2, q: [0, 1], label: "U", sub: "f" }], measure: [0],
    cases: [
      { label: "f(x) = 0", kind: "常数", f: function () { return 0; }, expect: [0] },
      { label: "f(x) = 1", kind: "常数", f: function () { return 1; }, expect: [0] },
      { label: "f(x) = x", kind: "平衡", f: function (x) { return x; }, expect: [1] },
      { label: "f(x) = 1 − x", kind: "平衡", f: function (x) { return 1 - x; }, expect: [1] }
    ],
    tag: "黑盒算法 · 相位回踢", title: "只问一次",
    goal: "黑盒 U_f 计算一个未知的函数 f: {0, 1} → {0, 1}，作用为 |x⟩|y⟩ ↦ |x⟩|y ⊕ f(x)⟩。它固定在第 3 列，只能用这一次。判断 f 是常数还是平衡的：常数时上面的比特测出 0，平衡时测出 1。四种 f 都必须判对。",
    hints: ["如果下面的比特处在 |−⟩，那么 y ⊕ f(x) 的效果等于给 |x⟩ 乘上相位 (−1)^f(x)。这叫相位回踢。", "让上面的比特以 |+⟩ 进入黑盒。"],
    explain: "经典的做法必须查询两次。量子的做法：|0⟩|1⟩ 经 H⊗H 变成 |+⟩|−⟩，黑盒之后上面的比特是 ±|+⟩（常数）或 ±|−⟩（平衡），再一个 H 就把两类完全分开。这是 Deutsch 1985 年的算法；Deutsch–Jozsa、Simon 和 Shor 的算法都沿用了同一个结构：叠加、查询、干涉。"
  },
  {
    id: "bomb", n: 1, cols: 16, gates: ["H", "R4", "R8", "BOMB"], type: "bomb", initLabels: ["|0⟩"],
    tag: "测量 · 量子芝诺效应", title: "不碰炸弹",
    goal: "这个比特表示光子走哪一路：|0⟩ 是下面那一路，|1⟩ 是上面那一路。上面那一路可能有一颗单个光子就能引爆的真炸弹，也可能是哑弹。炸弹门 B 表示光子在这一刻经过上面那一路。设计一个实验，让某个测量结果只可能在真炸弹时出现，并且尽量不引爆它。确认是真炸弹且没有爆炸的概率达到 25% 通关，50% 两星，70% 三星。",
    hints: ["H 就是分束器，H·B·H 就是一台 Mach–Zehnder 干涉仪。", "想拿三星：每次只转一点点，每转一次就让炸弹\"看\"一次。哑弹时这些小的转动累积成一次完整的翻转；真炸弹时，每一次\"看\"都把光子拉回 |0⟩。"],
    explain: "这是 Elitzur 和 Vaidman 1993 年的无相互作用测量。干涉仪版本只有 25%。用 N 次 Ry(π/N)、每次之后放一个炸弹：哑弹时 N 次转动合成 Ry(π)，光子必然到 |1⟩；真炸弹时每次存活的概率是 cos²(π/2N)，总的存活概率约为 1 − π²/(4N)，N 越大越接近 1。这就是量子芝诺效应。Kwiat 等人 1995 年用光子做出了这个实验。⑰ 炸弹检测把它变成了一套玩法：光路会丢光子、步数有限，N 不能无限地加。",
    game: "q_bomb"
  },
  {
    id: "grover", n: 2, cols: 7, gates: ["H", "X", "Z", "CNOT", "CZ"], type: "oracle", ref: 9, initLabels: ["|0⟩", "|0⟩"],
    locked: [{ g: "ORACLE", col: 1, q: [0, 1], label: "O", sub: "w" }], measure: [0, 1],
    cases: [0, 1, 2, 3].map(function (w) { return { label: "w = " + (w >> 1) + (w & 1), w: w, expect: [w >> 1, w & 1] }; }),
    tag: "黑盒算法 · 振幅放大", title: "四选一",
    goal: "黑盒 O 把四个基态中某一个未知的 |w⟩ 乘上 −1，其余不变。它固定在第 2 列，只能用这一次。让两个比特的测量结果百分之百等于 w，四种 w 都必须对。",
    hints: ["查询之前先做均匀叠加 |s⟩ = H⊗H|00⟩。查询之后，你需要关于 |s⟩ 的反射 2|s⟩⟨s| − I。", "用 H⊗H 夹住它，问题变成关于 |00⟩ 的反射 2|00⟩⟨00| − I = diag(1, −1, −1, −1)。试试 Z⊗Z 和 CZ 的乘积。"],
    explain: "经典的做法平均要查询 2.25 次，最坏 3 次。Grover 迭代每次把态在 |w⟩ 与其正交补张成的平面里转过 2θ，其中 sin θ = 1/√N。N = 4 时 θ = 30°，起点在 30°，一次迭代正好转到 90°，所以成功的概率恰好是 1。一般的 N 需要约 (π/4)√N 次，这是平方的加速，而且已经被证明是最优的。⑯ 量子搜索里 N 可以大到一百万：那时转几步再测、转过了头怎么办，就是要规则来决定的事了。",
    game: "q_search"
  },
  {
    id: "dense", n: 2, cols: 4, gates: ["H", "X", "Z", "CNOT", "CZ"], type: "oracle", ref: 2, initLabels: ["Φ⁺", "Φ⁺"], bellInit: true,
    locked: [{ g: "ORACLE", col: 0, q: [0], label: "E", sub: "" }], measure: [0, 1],
    cases: [
      { label: "消息 00", mats: [], expect: [0, 0] },
      { label: "消息 01", mats: [MAT.X], expect: [0, 1] },
      { label: "消息 10", mats: [MAT.Z], expect: [1, 0] },
      { label: "消息 11", mats: [MAT.X, MAT.Z], expect: [1, 1] }
    ],
    tag: "通信 · 超密编码", title: "一个粒子两个比特",
    goal: "Alice 和 Bob 事先共享 |Φ⁺⟩，上面的比特归 Alice，下面的归 Bob。Alice 用编码门 E 把两位经典比特 b₁b₂ 写进她的粒子（00 → I，01 → X，10 → Z，11 → 先 X 后 Z），再把这一个粒子寄给 Bob。现在两个粒子都在 Bob 手里。设计解码电路，让测量结果（上，下）等于 b₁b₂，四种消息都要对。",
    hints: ["Alice 的四种操作把 |Φ⁺⟩ 变成四个互相正交的 Bell 态。", "把制备 Bell 态的电路倒过来跑。"],
    explain: "只寄出一个量子比特，却传了两个经典比特，这是 Bennett 和 Wiesner 1992 年提出的超密编码。代价是事先共享的纠缠。没有纠缠时，Holevo 界保证一个量子比特最多只能携带一个经典比特。"
  },
  {
    id: "teleport", n: 3, cols: 6, gates: ["H", "X", "Z", "CNOT", "CZ", "M"], type: "teleport", ref: 6, initLabels: ["|ψ⟩", "Φ⁺", "Φ⁺"],
    validate: teleportValidate,
    tag: "通信 · 隐形传态", title: "隐形传态",
    goal: "最上面的比特是一个未知的态 |ψ⟩，下面两个比特共享 |Φ⁺⟩：中间的归 Alice，最下面的归 Bob。把 |ψ⟩ 传到 Bob 的比特上。规定：Alice 和 Bob 相距很远，跨越两边的门只能由 Alice 已经测量过的比特控制，相当于打电话告诉 Bob 测量结果；测量过的比特只能当控制位。检验时会用 6 个不同的 |ψ⟩。",
    hints: ["先在 Alice 一侧做 Bell 基测量：CNOT，再对最上面的比特做 H，然后测量这两个比特。", "四种测量结果对应 Bob 手里的四种状态，它们与 |ψ⟩ 只差 I、X、Z 或 ZX。用测量结果控制修正门。"],
    explain: "Bennett 等人 1993 年提出。没有超光速：在收到两位经典比特之前，Bob 的比特是最大混合态 I/2，你可以在 Bloch 球上看到它停在球心。|ψ⟩ 在 Alice 那里被测量破坏了，所以也不违反不可克隆定理。这里用延迟测量原理来模拟：测量之后只当控制位的比特，等价于把测量挪到最后。"
  },
  {
    id: "chsh", n: 2, type: "chsh",
    tag: "非定域性 · Bell 不等式", title: "打破 75%",
    goal: "裁判随机给 Alice 一个比特 x、给 Bob 一个比特 y。两人不能交流，各自回答一个比特 a、b。获胜条件是 a ⊕ b = x ∧ y：只有 x = y = 1 时两人要答得不同，其余三种情况要答得相同。先用经典的答法试试最多能赢多少，再让两人共享 |Φ⁺⟩，各自根据收到的比特选择测量的角度。胜率超过 75% 通关，达到 82% 两星，达到量子力学允许的上限三星。",
    hints: ["共享 |Φ⁺⟩ 时，如果 Alice 沿角度 α、Bob 沿角度 β 测量，两人结果相同的概率是 cos²(α − β)。", "你希望三种 (x, y) 的角度差都小，剩下那一种的角度差大。四个角度差的绝对值相等时最好。"],
    explain: "任何经典的做法，包括事先共享随机数，胜率都不超过 75%，这就是 CHSH 形式的 Bell 不等式。量子的最优胜率是 cos²(π/8) ≈ 85.36%，即 Tsirelson 界，对应 CHSH 值 2√2。一组最优的角度：α₀ = 0，α₁ = π/4，β₀ = π/8，β₁ = −π/8。Aspect、Clauser 和 Zeilinger 因为这类实验获得了 2022 年的诺贝尔物理学奖。这里算的是概率；把这组角度交给 ⑮ Bell 游戏里的规则，就能看到一次几百回合的实验里，胜率会在 85% 上下怎样起伏。",
    game: "q_bell"
  }
];
var BYID = {};
LEVELS.forEach(function (L, i) {
  BYID[L.id] = i;
  L.locked = L.locked || [];
  if (L.type === "state") L.scenarios = [{ label: "从 " + ket(L.n, 0) + " 开始", init: Q.basis(L.n, 0) }];
  else if (L.type === "unitary") L.scenarios = basisScenarios(L.n);
  else if (L.type === "oracle") {
    var init = L.bellInit ? BELL : Q.basis(L.n, 0);
    L.scenarios = L.cases.map(function (cs) {
      var fn = L.id === "deutsch" ? deutschOracle(cs.f) : L.id === "grover" ? groverOracle(cs.w) : messageOracle(cs.mats);
      return { label: cs.label + (cs.kind ? "（" + cs.kind + "）" : ""), init: init, oracle: fn, expect: cs.expect };
    });
  } else if (L.type === "teleport") L.scenarios = TELEPORT_INPUTS.map(function (t) { return { label: "|ψ⟩ = " + t.label, init: Q.kron(t.psi, BELL), psi: t.psi }; });
  else if (L.type === "bomb") L.scenarios = [{ label: "真炸弹", init: Q.basis(1, 0), bombLive: true }, { label: "哑弹", init: Q.basis(1, 0), bombLive: false }];
  else L.scenarios = [];
});

/* ---------- 跑一遍电路 ---------- */
function allOps(L, ops) { return L.locked.concat(ops).slice().sort(function (a, b) { return a.col - b.col; }); }
function applyOp(st, n, o, sc) {
  if (o.g === "CNOT") Q.applyCtrl(st, n, o.q[0], o.q[1], MAT.X);
  else if (o.g === "CZ") Q.applyCZ(st, n, o.q[0], o.q[1]);
  else if (o.g === "M") return;                           // 延迟测量：测量过的线之后只当控制位，等价于把测量挪到最后
  else if (o.g === "BOMB") { if (sc.bombLive) Q.project(st, n, o.q[0], 0); }
  else if (o.g === "ORACLE") sc.oracle(st, n);
  else Q.applySingle(st, n, o.q[0], MAT[o.g]);
}
/** 跑到第 uptoCol 列为止（不给就跑完）：返回态矢量 */
function run(L, ops, sc, uptoCol) {
  var st = Q.clone(sc.init), list = allOps(L, ops);
  for (var i = 0; i < list.length; i++) { if (uptoCol != null && list[i].col > uptoCol) break; applyOp(st, L.n, list[i], sc); }
  return st;
}

/* ---------- 判定 ---------- */
function fmt(x, d) { d = d == null ? 4 : d; return (Math.abs(x) < 5e-5 ? 0 : x).toFixed(d); }
function pct(x) { return (100 * x).toFixed(1) + "%"; }
function gateStars(count, ref) { return count <= ref ? 3 : count <= ref + 2 ? 2 : 1; }
function check(L, ops) {
  var res = { pass: false, stars: 0, rows: [], note: "", count: ops.length }, i;
  if (L.validate) { var err = L.validate(ops); if (err) { res.note = err; return res; } }
  if (L.type === "state") {
    var st = run(L, ops, L.scenarios[0]), ov = C(0);
    for (i = 0; i < st.length; i++) ov = cadd(ov, cmul(conj(L.target[i]), st[i]));
    var F = abs2(ov);
    res.rows.push({ label: "保真度 F = |⟨" + L.targetLabel.slice(1, -1) + "|ψ⟩|²", value: fmt(F), ok: F >= 0.999 });
    res.pass = F >= 0.999;
  } else if (L.type === "unitary") {
    var d = 1 << L.n, tr = C(0);
    L.scenarios.forEach(function (sc, j) {
      var col = run(L, ops, sc), o = C(0);
      for (var r = 0; r < d; r++) o = cadd(o, cmul(conj(L.target[r][j]), col[r]));
      tr = cadd(tr, o);
      res.rows.push({ label: sc.label + " 的输出与 " + L.targetLabel + " 一致", value: fmt(abs2(o)), ok: abs2(o) >= 0.999 });
    });
    var overlap = Math.sqrt(abs2(tr)) / d;
    res.rows.push({ label: "整体 |Tr(" + L.targetLabel + "†U)| / " + d + "（含各列的相对相位）", value: fmt(overlap), ok: overlap >= 0.999 });
    res.pass = overlap >= 0.999;
  } else if (L.type === "oracle") {
    var all = true;
    L.scenarios.forEach(function (sc) {
      var st2 = run(L, ops, sc), p = 0;
      for (var k = 0; k < st2.length; k++) if (L.measure.every(function (w, m) { return Q.bitOf(k, L.n, w) === sc.expect[m]; })) p += abs2(st2[k]);
      var ok = p >= 0.99; all = all && ok;
      res.rows.push({ label: sc.label + " → 测出 " + sc.expect.join(""), value: pct(p), ok: ok });
    });
    res.pass = all;
  } else if (L.type === "teleport") {
    var all2 = true;
    L.scenarios.forEach(function (sc) {
      var st3 = run(L, ops, sc), r = Q.reduced(st3, 3, 2), ps = sc.psi, Fq = C(0);
      for (var a = 0; a < 2; a++) for (var b = 0; b < 2; b++) Fq = cadd(Fq, cmul(cmul(conj(ps[a]), r[a][b]), ps[b]));   // F = ⟨ψ|ρ|ψ⟩
      var ok = Fq[0] >= 0.99; all2 = all2 && ok;
      res.rows.push({ label: sc.label + "：Bob 手里的保真度", value: fmt(Fq[0]), ok: ok });
    });
    res.pass = all2;
  } else if (L.type === "bomb") {
    var bombs = ops.filter(function (o) { return o.g === "BOMB"; }).length, live = run(L, ops, L.scenarios[0]), dud = run(L, ops, L.scenarios[1]), detect = 0;
    var survive = abs2(live[0]) + abs2(live[1]);
    for (var o2 = 0; o2 < 2; o2++) if (abs2(dud[o2]) < 1e-9) detect += abs2(live[o2]);   // 哑弹不可能给出的那个结果：只在真炸弹时出现
    res.metric = detect; res.bombs = bombs;
    res.rows.push({ label: "真炸弹：爆炸", value: pct(1 - survive), ok: null });
    res.rows.push({ label: "真炸弹：没爆炸，而且测量结果证明这是真炸弹", value: pct(detect), ok: detect >= 0.2499 });
    res.rows.push({ label: "真炸弹：没爆炸，但结果无法区分", value: pct(Math.max(0, survive - detect)), ok: null });
    if (bombs === 0) res.note = "电路里没有炸弹门，真炸弹和哑弹的行为完全一样，无从区分。";
    res.pass = bombs > 0 && detect >= 0.2499;
    res.stars = !res.pass ? 0 : detect >= 0.7 ? 3 : detect >= 0.5 ? 2 : 1;
    return res;
  }
  if (res.pass) res.stars = gateStars(res.count, L.ref);
  return res;
}

/* ---------- 第十关：Bell 游戏 ----------
 * 角度以 π/16 为一格（偏振片的角度 = 格数 × 11.25°）。量子的那一边用态矢量直接算，和 ⑮ Bell 游戏里的公式应当一致。 */
var UNIT = Math.PI / 16;
function chshQuantum(k) {
  var cells = [[0, 0], [0, 0]], joint = [[null, null], [null, null]], tot = 0, x, y;
  for (x = 0; x < 2; x++) for (y = 0; y < 2; y++) {
    var st = Q.clone(BELL);
    Q.applySingle(st, 2, 0, Q.ry(-2 * k["a" + x] * UNIT));
    Q.applySingle(st, 2, 1, Q.ry(-2 * k["b" + y] * UNIT));
    var P = st.map(abs2), w = 0;
    for (var a = 0; a < 2; a++) for (var b = 0; b < 2; b++) if ((a ^ b) === (x & y)) w += P[2 * a + b];
    cells[x][y] = w; joint[x][y] = P; tot += w / 4;
  }
  return { tot: tot, cells: cells, joint: joint };
}
function chshClassical(t) {
  var cells = [[0, 0], [0, 0]], tot = 0;
  for (var x = 0; x < 2; x++) for (var y = 0; y < 2; y++) { var w = ((t["a" + x] ^ t["b" + y]) === (x & y)) ? 1 : 0; cells[x][y] = w; tot += w / 4; }
  return { tot: tot, cells: cells };
}
function chshStars(p) { return p > 0.75 + 1e-9 ? (p >= 0.8535 ? 3 : p >= 0.82 ? 2 : 1) : 0; }
/** 第十关拨好的四个角度，换成 ⑮ Bell 游戏里"四个角度"那条规则的参数（度） */
function chshToDeg(k) { return { a0: k.a0 * 11.25, a1: k.a1 * 11.25, b0: k.b0 * 11.25, b1: k.b1 * 11.25 }; }

QL.QCIRCUIT = { GATES: GATES, LEVELS: LEVELS, BYID: BYID, ket: ket, run: run, check: check, allOps: allOps, UNIT: UNIT, chshQuantum: chshQuantum, chshClassical: chshClassical, chshStars: chshStars, chshToDeg: chshToDeg, fmt: fmt, pct: pct, teleportValidate: teleportValidate };
return QL.QCIRCUIT;
}
if (typeof module !== "undefined" && module.exports) module.exports = QL_QCIRCUIT_INSTALL;
