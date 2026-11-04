// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 泡泡宇宙（永恒暴胀 + 真空泡成核）引擎。
//   假真空是 de Sitter 空间，a(t) = e^{Ht}；真空泡以单位四维体积速率 λ 随机成核（Coleman–De Luccia），泡壁几乎以光速扩张：
//   t_n 成核的泡在 t 时的共动半径 r = (1 − e^{−H(t−t_n)})/(H a_n)，物理半径 R = (e^{H(t−t_n)} − 1)/H。
//   一个共动点到 t 还在假真空里的概率（三维）p(t) = exp[−(4π/3)(λ/H⁴)∫₀^{Ht}(1−e^{−x})³dx] → exp[−(4π/3)(λ/H⁴)(Ht − 11/6)]，
//   假真空的物理体积 ∝ e^{3Ht}p(t)：指数 3 − (4π/3)λ/H⁴ > 0 即永恒暴胀（Guth–Weinberg：λ/H⁴ < 9/4π ≈ 0.716）。
//   画面用二维切片：成核率 λ₂（单位物理面积、单位时间），p(t) = exp[−π(λ₂/H³)(Ht − 3/2)]，永恒条件 λ₂/H³ < 2/π。
//   泡内是开放的 FLRW（CDL 泡的内部是 k = −1 的 FLRW）；再暴胀 N 个 e-fold 后今天的曲率 Ω_k ≈ e^{−2(N − N_*)}，N_* ≈ 60（粗略）。
//   泡与泡相撞：两泡壁相遇；碰撞留在我们泡里的印记是 CMB 上一个圆盘（Aguirre–Johnson–Kleban）。
// 单位：H = 1（假真空的哈勃率），c = 1。
const BUBBLE = (function () {
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // ∫₀^x (1−e^{−u})³ du = x − 3(1−e^{−x}) + (3/2)(1−e^{−2x}) − (1/3)(1−e^{−3x})
  function surv3Int(x) { return x - 3 * (1 - Math.exp(-x)) + 1.5 * (1 - Math.exp(-2 * x)) - (1 - Math.exp(-3 * x)) / 3; }
  function surv2Int(x) { return x - 2 * (1 - Math.exp(-x)) + 0.5 * (1 - Math.exp(-2 * x)); } // ∫₀^x (1−e^{−u})² du
  // 三维：假真空概率、物理体积增长指数、是否永恒
  function survival3(lam4, Ht) { return Math.exp(-4 * Math.PI / 3 * lam4 * surv3Int(Ht)); }
  function eternal3(lam4) { return { exponent: 3 - 4 * Math.PI / 3 * lam4, eternal: lam4 < 9 / (4 * Math.PI), critical: 9 / (4 * Math.PI) }; }
  // 二维切片
  function survival2(lam2, Ht) { return Math.exp(-Math.PI * lam2 * surv2Int(Ht)); }
  function eternal2(lam2) { return { exponent: 2 - Math.PI * lam2, eternal: lam2 < 2 / Math.PI, critical: 2 / Math.PI }; }
  // 泡内：N 个 e-fold 后今天的曲率（粗略：Ω_k ≈ e^{−2(N − N*)}，上限 1）
  function interiorCurvature(N, Nstar) { Nstar = Nstar || 60; return Math.min(1, Math.exp(-2 * (N - Nstar))); }
  // 二维泡沫模拟：固定物理窗口（边长 W，以 1/H 计）、观察者在中心的共动点上；泡在窗口内按物理速率 λ₂ 成核（只在假真空处）
  class Foam2D {
    constructor(o) {
      o = o || {}; this.lam = o.lam2 === undefined ? 0.1 : o.lam2; this.W = o.W || 24; this.t = 0; this.rnd = mulberry32(o.seed || 1); this.bubbles = []; this.collisions = []; this.engulfed = null; this.nNuc = 0; this.lamSampler = o.lamSampler || null;
      this.obs = { x: 0, y: 0 }; // 观察者的共动坐标（a = 1 时）
    }
    a(t) { return Math.exp(t === undefined ? this.t : t); }
    // 物理坐标（相对观察者，窗口内）：x_phys = a (x − x_obs)
    phys(b, t) { const a = this.a(t); return { x: a * (b.x - this.obs.x), y: a * (b.y - this.obs.y), R: Math.exp((t === undefined ? this.t : t) - b.tn) - 1 }; }
    inBubble(x, y, t) { // 共动点 (x, y) 在 t 时是否已在某个泡里
      const a = this.a(t); for (const b of this.bubbles) { const r = (1 - Math.exp(-((t === undefined ? this.t : t) - b.tn))) / Math.exp(b.tn); const dx = x - b.x, dy = y - b.y; if (dx * dx + dy * dy < r * r) return b; } return null;
    }
    step(dt) {
      const t0 = this.t, t1 = t0 + dt, a1 = this.a(t1); this.t = t1;
      // 成核：窗口内（物理面积 W²）的期望个数 λ₂ W² dt；位置均匀，落在假真空才算
      const n = poisson(this.rnd, this.lam * this.W * this.W * dt);
      for (let k = 0; k < n; k++) {
        const px = (this.rnd() - 0.5) * this.W, py = (this.rnd() - 0.5) * this.W; const x = this.obs.x + px / a1, y = this.obs.y + py / a1;
        if (this.inBubble(x, y, t1)) continue;
        const b = { x, y, tn: t1, id: this.nNuc++, lam: this.lamSampler ? this.lamSampler(this.rnd) : 0, hit: new Set() }; this.bubbles.push(b);
      }
      // 碰撞：两泡的物理半径之和 ≥ 中心距离
      const bs = this.bubbles;
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const A = bs[i], B = bs[j]; if (A.hit.has(B.id)) continue; const RA = Math.exp(t1 - A.tn) - 1, RB = Math.exp(t1 - B.tn) - 1, d = a1 * Math.hypot(A.x - B.x, A.y - B.y); if (RA + RB >= d) { A.hit.add(B.id); B.hit.add(A.id); this.collisions.push({ a: A.id, b: B.id, t: t1 }); } }
      // 观察者被吞没？
      if (!this.engulfed) { const b = this.inBubble(this.obs.x, this.obs.y, t1); if (b) this.engulfed = { bubble: b, t: t1 }; }
      // 清理：物理上离开窗口太远的泡（近边 > 1.5 W）
      this.bubbles = bs.filter((b) => { const p = this.phys(b, t1); return Math.hypot(p.x, p.y) - p.R < 1.5 * this.W; });
      return n;
    }
    // 窗口内假真空面积的份额（蒙特卡洛）
    falseFraction(samples) { samples = samples || 2000; let f = 0; const a = this.a(); for (let k = 0; k < samples; k++) { const px = (this.rnd() - 0.5) * this.W, py = (this.rnd() - 0.5) * this.W; if (!this.inBubble(this.obs.x + px / a, this.obs.y + py / a)) f++; } return f / samples; }
    // 换一个还在假真空里的观察点（窗口内随机找）
    relocate() { const a = this.a(); for (let k = 0; k < 500; k++) { const px = (this.rnd() - 0.5) * this.W, py = (this.rnd() - 0.5) * this.W; const x = this.obs.x + px / a, y = this.obs.y + py / a; if (!this.inBubble(x, y)) { this.obs = { x, y }; this.engulfed = null; return true; } } return false; }
  }
  function poisson(rnd, mu) { if (mu > 50) { return Math.max(0, Math.round(mu + Math.sqrt(mu) * gauss(rnd))); } const L = Math.exp(-mu); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; }
  function gauss(rnd) { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); }
  // 我们泡的过去光锥里期望的碰撞数（粗略）：N ≈ (4π/3)(λ/H_F⁴)(H_F/H_I)²·(1/Ω_k 的量级因子略去)，只给数量级
  function expectedCollisions(lam4, HFoverHI) { return 4 * Math.PI / 3 * lam4 * HFoverHI * HFoverHI; }
  return { survival3, eternal3, survival2, eternal2, surv3Int, surv2Int, interiorCurvature, Foam2D, poisson, expectedCollisions, mulberry32 };
})();
if (typeof module !== 'undefined') module.exports = BUBBLE;
