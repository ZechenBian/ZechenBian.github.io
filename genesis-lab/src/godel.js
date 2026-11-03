// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 哥德尔旋转宇宙引擎：爱因斯坦方程的精确解（Gödel 1949），这里取 Hawking–Ellis 的柱坐标形式
//   ds² = 4a² [ −dt² + dr² + dz² − (sinh⁴r − sinh²r) dφ² + 2√2 sinh²r dφ dt ]
// 物质是静止在 (r,φ,z) 坐标上的尘埃，相对局部惯性系（陀螺仪）以角速度 ω = 1/(√2 a) 转动；
// 方程要求 Λ = −ω²（负的！）、4πGρ = ω²：这是一个单参数族，只能选 ω。
// 引擎内取 4a² = 1 的"哥德尔单位"：坐标长度 ×(2a) = ×(√2/ω) 才是物理长度（c = 1）。
// 测地线在轴上不奇异的笛卡尔型坐标 (t, X, Y, z)（X = r cos φ，Y = r sin φ）里积分：
//   d²xᵃ/dλ² = −Γᵃ_bc uᵇ uᶜ，克氏符按定义从度规算（导数用中心差分）；守恒量 E = −p_t、L = X p_Y − Y p_X 用来核对。
const GODEL = (function () {
  const SQ2 = Math.SQRT2;
  const R_C = Math.asinh(1);          // sinh r = 1：超过它 φ 圆成为闭合类时曲线

  // ---------- 柱坐标形式（解析，用于光锥、固有时等） ----------
  function metricCyl(r) { const s2 = Math.sinh(r) ** 2; return [[-1, 0, SQ2 * s2, 0], [0, 1, 0, 0], [SQ2 * s2, 0, s2 - s2 * s2, 0], [0, 0, 0, 1]]; }
  // (t,φ) 平面里光锥的两条零方向 dt/dφ = u±，u± = √2 sinh²r ± sinh r cosh r；u− > 0 即 φ 圆落进光锥（类时）
  function coneSlopes(r) { const s = Math.sinh(r), c = Math.cosh(r); return { plus: SQ2 * s * s + s * c, minus: SQ2 * s * s - s * c }; }
  // 沿 r = const 的 φ 圆走一圈的固有时：τ = 2π √(sinh⁴r − sinh²r)（r > r_c 时才是闭合类时曲线）
  function loopProperTime(r) { const s = Math.sinh(r); const q = s ** 4 - s ** 2; return q > 0 ? 2 * Math.PI * Math.sqrt(q) : NaN; }
  // 尘埃观察者在 r 处的正交标架（柱坐标分量）：u = ∂_t，e_r = ∂_r，e_φ̂ = (∂_φ + √2 sinh²r ∂_t)/(sinh r cosh r)
  function frameCyl(r) { const s = Math.sinh(r), c = Math.cosh(r); return { u: [1, 0, 0, 0], er: [0, 1, 0, 0], ephi: [SQ2 * s / c, 0, 1 / (s * c), 0], ez: [0, 0, 0, 1] }; }

  // ---------- 笛卡尔型坐标 (t, X, Y, z) ----------
  // F(r) = (sinh²r − sinh⁴r)/r⁴ − 1/r²（r→0 时用级数，避免相消）
  function F(r) {
    if (r < 0.05) { const r2 = r * r; return -2 / 3 - 28 / 45 * r2 - 62 / 315 * r2 * r2; }
    const s2 = Math.sinh(r) ** 2, r2 = r * r; return (s2 - s2 * s2) / (r2 * r2) - 1 / r2;
  }
  function metric(x) {
    const X = x[1], Y = x[2], r2 = X * X + Y * Y, r = Math.sqrt(r2);
    if (r < 1e-12) return [[-1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    const f = F(r), s2 = Math.sinh(r) ** 2, gtX = -SQ2 * s2 * Y / r2, gtY = SQ2 * s2 * X / r2;
    return [[-1, gtX, gtY, 0], [gtX, 1 + f * Y * Y, -f * X * Y, 0], [gtY, -f * X * Y, 1 + f * X * X, 0], [0, 0, 0, 1]];
  }
  function inv4(g) { // 高斯–若尔当求逆
    const n = 4, A = g.map((row, i) => row.concat([0, 0, 0, 0].map((_, j) => (i === j ? 1 : 0))));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; const d = A[c][c];
      for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
      for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
    }
    return A.map((row) => row.slice(n));
  }
  const H = 1e-5;
  function christoffel(x) {
    const gi = inv4(metric(x)), dg = [];
    for (let k = 0; k < 4; k++) {
      if (k === 0 || k === 3) { dg.push(null); continue; } // 度规不依赖 t、z
      const xp = x.slice(), xm = x.slice(); xp[k] += H; xm[k] -= H; const gp = metric(xp), gm = metric(xm);
      dg.push(gp.map((row, i) => row.map((v, j) => (v - gm[i][j]) / (2 * H))));
    }
    const G = [];
    for (let a = 0; a < 4; a++) { G.push([]); for (let b = 0; b < 4; b++) { G[a].push([0, 0, 0, 0]); for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let d = 0; d < 4; d++) {
        const t1 = dg[b] ? dg[b][d][c] : 0, t2 = dg[c] ? dg[c][d][b] : 0, t3 = dg[d] ? dg[d][b][c] : 0;
        sum += gi[a][d] * (t1 + t2 - t3);
      }
      G[a][b][c] = 0.5 * sum;
    } } }
    return G;
  }
  function dot(x, u, v) { const g = metric(x); let s = 0; for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) s += g[a][b] * u[a] * v[b]; return s; }
  function conserved(x, u) {
    const g = metric(x), p = [0, 1, 2, 3].map((a) => g[a][0] * u[0] + g[a][1] * u[1] + g[a][2] * u[2] + g[a][3] * u[3]);
    return { E: -p[0], L: x[1] * p[2] - x[2] * p[1], norm: dot(x, u, u) };
  }
  function cyl(x) { return { t: x[0], r: Math.hypot(x[1], x[2]), phi: Math.atan2(x[2], x[1]), z: x[3] }; }
  // 在 (r, φ) 处沿局部方向发出的光：k = u + cosθ e_r + sinθ e_φ̂（θ 从径向外侧量起，逆时针为正；inc 为相对平面的仰角）
  function nullVector(r, phi, theta, inc) {
    const ct = Math.cos(theta), st = Math.sin(theta), ci = inc ? Math.cos(inc) : 1, si = inc ? Math.sin(inc) : 0;
    let kt, kr, kphi; // 柱坐标分量
    if (r < 1e-9) { kt = 1; kr = ci; kphi = 0; phi = phi + theta; } // 轴上：局部就是闵可夫斯基
    else { const f = frameCyl(r); kt = f.u[0] + ci * st * f.ephi[0]; kr = ci * ct; kphi = ci * st * f.ephi[2]; }
    const cp = Math.cos(phi), sp = Math.sin(phi);
    return [kt, cp * kr - r * sp * kphi, sp * kr + r * cp * kphi, si];
  }
  function pointCart(r, phi, t, z) { return [t || 0, r * Math.cos(phi), r * Math.sin(phi), z || 0]; }
  // 测地线积分（RK4，仿射参数 λ）
  function geodesic(x0, u0, opts) {
    opts = opts || {}; const dl = opts.dl || 0.004, lMax = opts.lambdaMax || 12, rMax = opts.rMax || 6, every = opts.every || 2;
    let x = x0.slice(), u = u0.slice(), lam = 0; const out = [{ x: x.slice(), u: u.slice(), lambda: 0 }];
    const acc = (x, u) => { const G = christoffel(x); const a = [0, 0, 0, 0]; for (let i = 0; i < 4; i++) { let s = 0; for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) s += G[i][b][c] * u[b] * u[c]; a[i] = -s; } return a; };
    let n = 0;
    while (lam < lMax && n++ < 200000) {
      const k1u = acc(x, u), k1x = u;
      const x2 = x.map((v, i) => v + 0.5 * dl * k1x[i]), u2 = u.map((v, i) => v + 0.5 * dl * k1u[i]);
      const k2u = acc(x2, u2), k2x = u2;
      const x3 = x.map((v, i) => v + 0.5 * dl * k2x[i]), u3 = u.map((v, i) => v + 0.5 * dl * k2u[i]);
      const k3u = acc(x3, u3), k3x = u3;
      const x4 = x.map((v, i) => v + dl * k3x[i]), u4 = u.map((v, i) => v + dl * k3u[i]);
      const k4u = acc(x4, u4), k4x = u4;
      for (let i = 0; i < 4; i++) { x[i] += dl / 6 * (k1x[i] + 2 * k2x[i] + 2 * k3x[i] + k4x[i]); u[i] += dl / 6 * (k1u[i] + 2 * k2u[i] + 2 * k3u[i] + k4u[i]); }
      lam += dl;
      if (Math.hypot(x[1], x[2]) > rMax) break;
      if (n % every === 0) out.push({ x: x.slice(), u: u.slice(), lambda: lam });
    }
    return out;
  }
  // ---------- 从轴上发出的光：闭式方程（全天图用） ----------
  // 轴上发出的零测地线角动量 L = 0，用守恒量 E、p_z = k 消去 t、φ 后只剩一个一维方程（取 E = 1，k = cos θ，θ 是和 z 轴的夹角）：
  //   r'² = 2 sech²r − 1 − k²，  r'' = −2 sech²r tanh r，  φ' = −√2 sech²r，  t' = 2 sech²r − 1，  z' = k
  // r 过零继续取负值（相当于 φ + π），这样穿过轴不奇异。k = 0 时折返在 sinh r = 1（哥德尔半径），φ 圈的"拖曳"让光绕轴转着回来。
  // 验证：和笛卡尔型坐标里数值积分的测地线逐点对照（test/godel.test.js）。
  function axisRay(theta, opts) {
    opts = opts || {}; const k = Math.cos(theta), h = opts.dl || 0.01, lMax = opts.lambdaMax || 10, every = opts.every || 1, maxCross = opts.maxCross || Infinity;
    let r = 0, v = Math.sin(theta), phi = 0, t = 0, z = 0, lam = 0, n = 0; const out = { lam: [0], r: [0], phi: [0], t: [0], z: [0], cross: [0] }; let cross = 0;
    const acc = (r) => { const s = 1 / Math.cosh(r); return -2 * s * s * Math.tanh(r); };
    while (lam < lMax && n++ < 1e6) {
      // RK4：状态 (r, v, φ, t, z)
      const f = (r, v) => { const s2 = 1 / (Math.cosh(r) * Math.cosh(r)); return [v, acc(r), -SQ2 * s2, 2 * s2 - 1, k]; };
      const k1 = f(r, v), k2 = f(r + 0.5 * h * k1[0], v + 0.5 * h * k1[1]), k3 = f(r + 0.5 * h * k2[0], v + 0.5 * h * k2[1]), k4 = f(r + h * k3[0], v + h * k3[1]);
      const nr = r + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); if (nr * r < 0) cross++;
      r = nr; v += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]); phi += h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]); t += h / 6 * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]); z += h * k; lam += h;
      if (n % every === 0) { out.lam.push(lam); out.r.push(r); out.phi.push(phi); out.t.push(t); out.z.push(z); out.cross.push(cross); }
      if (cross >= maxCross) break;
    }
    return out;
  }
  // 物理换算（c = 1）：给定 ω，a = 1/(√2 ω)，坐标长度 × 2a = √2/ω
  function physical(omega) {
    const a = 1 / (SQ2 * omega), unit = 2 * a;
    return { a, unit, Rctc: unit * R_C, period: 2 * Math.PI / omega, Lambda: -omega * omega, rho4piG: omega * omega };
  }
  return { R_C, metricCyl, coneSlopes, loopProperTime, frameCyl, metric, inv4, christoffel, dot, conserved, cyl, nullVector, pointCart, geodesic, axisRay, physical };
})();
if (typeof module !== 'undefined') module.exports = GODEL;
