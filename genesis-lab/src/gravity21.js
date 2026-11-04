// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 2+1 维引力引擎：两维空间 + 一维时间里的广义相对论。
//   这里 Riemann 张量完全由 Ricci 张量决定：真空处处局部平坦（Λ = 0）或局部 (A)dS——没有引力波、没有牛顿引力。
//   质点 m 只把平面剪掉一个角 δ = 8πGm 再粘上（锥形亏角，Deser–Jackiw–'t Hooft 1984）：光线在剪开的图上是直线，
//   粘起来后从质点两侧绕过的两条直线都能到观察者——两个像，夹角正好是 δ，和距离无关。总亏角到 2π 空间就闭合（球面）。
//   Λ < 0 时有 BTZ 黑洞（Bañados–Teitelboim–Zanelli 1992）：ds² = −f dt² + dr²/f + r²dφ²，f = r²/ℓ² − M，
//   视界 r₊ = ℓ√M，霍金温度 T = r₊/(2πℓ²)，熵 S = 2πr₊/(4G)（"面积"就是周长）。测地线：E、L 守恒，ṙ² = E² − f(κ + L²/r²)，κ = 1 有质量、0 光。
//   2+1 维的弗里德曼方程：H² + k/a² = 8πGρ，ä/a = −8πGp：尘埃（p = 0）不减速——没有引力吸引。
// 单位：G = c = 1（2+1 维里 G 无量纲？不：这里 8πG = 1 的单位把亏角写成 δ = m）。
const GRAVITY21 = (function () {
  // ---------- 锥 ----------
  // 剪开的图：去掉以 +x 轴为中心、张角 δ 的楔；点的极角 φ ∈ (δ/2, 2π − δ/2) 才在图上
  function inChart(x, y, delta) { let ph = Math.atan2(y, x); if (ph < 0) ph += 2 * Math.PI; return ph > delta / 2 && ph < 2 * Math.PI - delta / 2; }
  function rot(p, a) { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] - s * p[1], s * p[0] + c * p[1]]; }
  // 线段 P→Q 是否整段在图上（不穿过楔）
  function segmentOK(P, Q, delta) { for (let i = 0; i <= 200; i++) { const u = i / 200, x = P[0] + (Q[0] - P[0]) * u, y = P[1] + (Q[1] - P[1]) * u; if (Math.hypot(x, y) < 1e-9) continue; if (!inChart(x, y, delta)) return false; } return true; }
  // 观察者 O、光源 S（都在图上）：像 = 到 S 或它的副本 R(±δ)S 的直线，条件是这条直线"正确地"穿过粘合边：
  //   直线绕顶点扫过的极角是单调的（|Δφ| < π），从 O 的极角出发，终点极角 φ_end：
  //   k = 0 直接：φ_end 落在图上 (δ/2, 2π − δ/2)；k = +1：向下扫过边 e₊（φ_end < δ/2）；k = −1：向上扫过边 e₋（φ_end > 2π − δ/2）
  function images(O, S, delta) {
    const out = []; let phO = Math.atan2(O[1], O[0]); if (phO < 0) phO += 2 * Math.PI;
    for (const [k, T] of [[0, S], [1, rot(S, delta)], [-1, rot(S, -delta)]]) {
      const sweep = Math.atan2(O[0] * T[1] - O[1] * T[0], O[0] * T[0] + O[1] * T[1]), phEnd = phO + sweep; // 连续扫角
      const valid = k === 0 ? (phEnd > delta / 2 && phEnd < 2 * Math.PI - delta / 2) : (k === 1 ? (phEnd < delta / 2 && phEnd > -delta / 2) : (phEnd > 2 * Math.PI - delta / 2 && phEnd < 2 * Math.PI + delta / 2));
      if (!valid) continue; const dx = T[0] - O[0], dy = T[1] - O[1]; out.push({ copy: k, target: T, dir: Math.atan2(dy, dx), dist: Math.hypot(dx, dy), sweep });
    }
    return out;
  }
  // 粘起来的锥：把图上的极角 φ ∈ [δ/2, 2π − δ/2] 均匀拉到 [0, 2π]（画面坐标）
  function glue(x, y, delta) { const r = Math.hypot(x, y); let ph = Math.atan2(y, x); if (ph < 0) ph += 2 * Math.PI; const ph2 = (ph - delta / 2) * 2 * Math.PI / (2 * Math.PI - delta); return [r * Math.cos(ph2), r * Math.sin(ph2)]; }
  // ---------- BTZ ----------
  function btz(M, ell) { const rp = ell * Math.sqrt(Math.max(M, 0)); return { M, ell, rp, f: (r) => r * r / (ell * ell) - M, T: rp / (2 * Math.PI * ell * ell), S: 2 * Math.PI * rp / 4, centralCharge: 3 * ell / 2 }; }
  // 测地线：状态 (r, ṙ, φ, t)，仿射参数 λ；κ = 1 有质量（λ 是固有时）、0 光
  function geodesic(B, o) {
    const E = o.E, L = o.L, kap = o.massive ? 1 : 0, f = B.f, dl = o.dl || 0.01, lMax = o.lambdaMax || 60; const fp = (r) => 2 * r / (B.ell * B.ell);
    const V = (r) => f(r) * (kap + L * L / (r * r)), Vp = (r) => fp(r) * (kap + L * L / (r * r)) - f(r) * 2 * L * L / (r * r * r);
    let r = o.r0, v2 = E * E - V(r); if (v2 < 0) return { ok: false, why: 'E 太小：这里不允许' }; let v = (o.outward === false ? -1 : 1) * Math.sqrt(v2), ph = o.phi0 || 0, t = 0, lam = 0; const out = { r: [r], phi: [ph], t: [0], lam: [0], ok: true, fate: null };
    let n = 0;
    while (lam < lMax && n++ < 200000) {
      const a = (r) => -0.5 * Vp(r);
      const k1r = v, k1v = a(r), r2 = r + 0.5 * dl * k1r, k2r = v + 0.5 * dl * k1v, k2v = a(r2), r3 = r + 0.5 * dl * k2r, k3r = v + 0.5 * dl * k2v, k3v = a(r3), r4 = r + dl * k3r, k4r = v + dl * k3v, k4v = a(r4);
      const nr = r + dl / 6 * (k1r + 2 * k2r + 2 * k3r + k4r); v += dl / 6 * (k1v + 2 * k2v + 2 * k3v + k4v); ph += dl * L / (r * r); const fr = f(r); t += dl * E / Math.max(fr, 1e-6); r = nr; lam += dl;
      out.r.push(r); out.phi.push(ph); out.t.push(t); out.lam.push(lam);
      if (r <= B.rp * 1.001) { out.fate = 'horizon'; break; }
      if (r > 30 * B.ell && v > 0) { v = -v; out.bounces = (out.bounces || 0) + 1; } // AdS 边界：光在有限坐标时间到达无穷远并被反射（这里在 r = 30ℓ 处翻转径向速度作近似）
    }
    if (!out.fate) out.fate = out.bounces ? 'bounce' : 'orbit';
    // 核对 E：ṙ² + V = E²
    out.rmin = Math.min(...out.r); out.rmax = Math.max(...out.r); out.energyErr = Math.abs(v * v + V(r) - E * E) / (E * E);
    return out;
  }
  // 有效势的转折点：E² = V(r) 的根（画轨道范围用）
  function turning(B, E, L, massive) { const kap = massive ? 1 : 0, V = (r) => B.f(r) * (kap + L * L / (r * r)); const roots = []; let prev = null; for (let i = 1; i <= 4000; i++) { const r = B.rp * 1.0001 + (40 * B.ell - B.rp) * i / 4000, g = E * E - V(r); if (prev !== null && prev * g <= 0) roots.push(r); prev = g; } return roots; }
  // ---------- 2+1 维 FLRW ----------
  // H² + k/a² = 8πGρ，ä/a = −8πGp；8πG = 1。成分：尘埃 ρ_d ∝ a⁻²（p=0）、辐射 ρ_r ∝ a⁻³（p = ρ/2）、Λ（ρ = Λ，p = −Λ）
  function flrw21(o) {
    const Od = o.dust || 0, Or = o.rad || 0, OL = o.lambda || 0, k = o.k || 0, dt = 0.002, tMax = o.tMax || 6; // 以今天 a = 1、H₀ = 1 定标：Ω_d + Ω_r + Ω_Λ − k = 1
    let a = 1, v = 1, t = 0; const out = { ts: [0], as: [1] }; const acc = (a) => a * (-(Or / (2 * a * a * a)) + OL); // ä/a = −p：辐射 p = ρ_r/2，Λ p = −Λ
    for (let dir of [-1, 1]) { a = 1; v = 1; t = 0; const ts = [], as = []; let n = 0; while (n++ < 20000) { const h = dir * dt; const k1 = [v, acc(a)], a2 = a + 0.5 * h * k1[0], v2 = v + 0.5 * h * k1[1], k2 = [v2, acc(a2)], a3 = a + 0.5 * h * k2[0], v3 = v + 0.5 * h * k2[1], k3 = [v3, acc(a3)], a4 = a + h * k3[0], v4 = v + h * k3[1], k4 = [v4, acc(a4)]; a += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); v += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]); t += h; if (a <= 1e-4 || a > 40 || Math.abs(t) > tMax) break; ts.push(t); as.push(a); } if (dir < 0) { out.ts = ts.reverse().concat(out.ts); out.as = as.reverse().concat(out.as); } else { out.ts = out.ts.concat(ts); out.as = out.as.concat(as); } }
    return out;
  }
  return { inChart, rot, segmentOK, images, glue, btz, geodesic, turning, flrw21 };
})();
if (typeof module !== 'undefined') module.exports = GRAVITY21;
