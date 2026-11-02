// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 原初核合成（半解析）：中子–质子比的冻结 + 氘瓶颈 → 氦丰度。
//   弱作用把 n 和 p 互相转换：n+ν→p+e、n+e⁺→p+ν̄、n→p+e+ν̄ 及其逆过程。速率按玻恩近似的相空间积分算（Weinberg《宇宙学》§3.2 的公式），
//   归一化用中子寿命 τ_n：A = 1/(τ_n f(q))，f(q)=∫₁^q ε√(ε²−1)(q−ε)²dε，q = Q/m_e。G_F 进来的方式：A ∝ G_F²，τ_n ∝ 1/G_F²。
//   膨胀率 H(T) 和中微子温度来自 thermal.js（含 N_eff）。
//   dX_n/dt = λ_pn (1−X_n) − λ_np X_n，从 T = 10 MeV（平衡）积到氘瓶颈打开：X_D/X_n = X_p·8.14η(T/m_N)^{3/2}e^{B_D/T} 达到阈值 ϑ，
//   然后所有中子进 ⁴He：Y_p = 2X_n。阈值 ϑ 按标准参数校准到 Y_p = 0.247（PArthENoPE 等完整网络的结果）——校准只这一个数，
//   对 η、N_eff、Q、τ_n、G_F 的依赖都是物理算出来的。氘丰度用经验标度律 D/H ∝ η^{-1.6}（拟合，不是算的）。
const BBN = (function () {
  const ME = 0.51099895e-3, Q0 = 1.29333e-3, BD = 2.224575e-3, MN = 0.93891e-3 * 1000, TAU0 = 878.4; // GeV（MN 以 GeV 计 0.939）
  const MN_GEV = 0.93891;
  function f0(q) { // 相空间积分
    const n = 400; let s = 0; for (let i = 0; i <= n; i++) { const e = 1 + (q - 1) * i / n, w = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2); s += w * e * Math.sqrt(Math.max(0, e * e - 1)) * (q - e) ** 2; } return s * ((q - 1) / n) / 3;
  }
  const fe = (E, T) => 1 / (Math.exp(Math.min(700, E / T)) + 1); // 费米分布，E、T 以 m_e 为单位
  // 六个过程的速率（乘 A 之前）；Tg、Tn 以 m_e 为单位
  function rates(Tg, Tn, q) {
    const n = 300, emax = 1 + 40 * Math.max(Tg, Tn) + q; let np = 0, pn = 0;
    const simpson = (lo, hi, fn) => { let s = 0; for (let i = 0; i <= n; i++) { const e = lo + (hi - lo) * i / n, w = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2); s += w * fn(e); } return s * ((hi - lo) / n) / 3; };
    const ps = (e) => e * Math.sqrt(Math.max(0, e * e - 1));
    // n ν → p e（ε > q）、p e → n ν
    np += simpson(q, emax, (e) => ps(e) * (e - q) ** 2 * fe(e - q, Tn) * (1 - fe(e, Tg)));
    pn += simpson(q, emax, (e) => ps(e) * (e - q) ** 2 * fe(e, Tg) * (1 - fe(e - q, Tn)));
    // n e⁺ → p ν̄、p ν̄ → n e⁺
    np += simpson(1, emax, (e) => ps(e) * (e + q) ** 2 * fe(e, Tg) * (1 - fe(e + q, Tn)));
    pn += simpson(1, emax, (e) => ps(e) * (e + q) ** 2 * fe(e + q, Tn) * (1 - fe(e, Tg)));
    // n → p e ν̄（1 < ε < q）、p e ν̄ → n
    np += simpson(1, q, (e) => ps(e) * (q - e) ** 2 * (1 - fe(e, Tg)) * (1 - fe(q - e, Tn)));
    pn += simpson(1, q, (e) => ps(e) * (q - e) ** 2 * fe(e, Tg) * fe(q - e, Tn));
    return { np, pn };
  }
  let THETA = 0.02565; // 氘瓶颈阈值：用 calibrate() 按标准参数（η=6.1e-10、N_eff=3.044、τ_n=878.4 s）校准到 Y_p = 0.247 得到的值
  // 参数：Q（GeV）、GF（相对标准的倍数）、eta（重子-光子比）、thermal 表（含 N_eff）
  function run(tab, par) {
    par = par || {}; const Q = par.Q || Q0, GF = par.GF || 1, eta = par.eta || 6.1e-10, q = Q / ME, q0 = Q0 / ME;
    const tauN = TAU0 / (GF * GF) * f0(q0) / f0(q); // 中子寿命随 G_F、Q 变
    const A = 1 / (tauN * f0(q));
    // 以温度为步长向下积分；速率远大于膨胀率时用指数积分（精确于常速率）
    const T1 = 10e-3, T2 = 0.02e-3; const n = 900; const out = { Ts: [], ts: [], Xn: [], Xeq: [], tauN, A, eta, Q, GF };
    let X = null, t = tab.atT(T1).t, tPrev = t;
    const thetaUse = par.theta || THETA || 0.03;
    let Tnuc = NaN, tNuc = NaN, Xnuc = NaN;
    for (let i = 0; i <= n; i++) {
      const T = Math.exp(Math.log(T1) + (Math.log(T2) - Math.log(T1)) * i / n), st = tab.atT(T);
      const r = rates(T / ME, st.Tnu / ME, q), lnp = A * r.np, lpn = A * r.pn, lam = lnp + lpn, Xeq = lpn / lam;
      if (X === null) X = Xeq;
      else { const dt = st.t - tPrev; X = Xeq + (X - Xeq) * Math.exp(-lam * dt); }
      tPrev = st.t;
      out.Ts.push(T); out.ts.push(st.t); out.Xn.push(X); out.Xeq.push(Xeq);
      // 氘瓶颈
      const ratio = (1 - X) * 8.14 * eta * Math.pow(T / MN_GEV, 1.5) * Math.exp(Math.min(700, BD / T));
      if (!isFinite(Tnuc) && ratio >= thetaUse) { Tnuc = T; tNuc = st.t; Xnuc = X; }
    }
    if (!isFinite(Tnuc)) { Tnuc = T2; tNuc = tPrev; Xnuc = X; }
    out.Tnuc = Tnuc; out.tNuc = tNuc; out.Xnuc = Xnuc; out.Yp = Math.min(1, 2 * Xnuc);
    // 冻结：X_n 离开平衡的温度（|X − X_eq|/X_eq > 10%）
    for (let i = 0; i < out.Ts.length; i++) if (Math.abs(out.Xn[i] - out.Xeq[i]) > 0.1 * out.Xeq[i]) { out.Tfreeze = out.Ts[i]; out.tFreeze = out.ts[i]; out.npFreeze = out.Xn[i] / (1 - out.Xn[i]); break; }
    out.DH = 2.53e-5 * Math.pow(6.1e-10 / eta, 1.6); // 拟合
    return out;
  }
  function calibrate(tab) { // 标准参数下 Y_p = 0.247
    let lo = 1e-4, hi = 1; for (let i = 0; i < 30; i++) { const mid = Math.sqrt(lo * hi); const y = run(tab, { theta: mid }).Yp; if (y > 0.247) lo = mid; else hi = mid; }
    THETA = Math.sqrt(lo * hi); return THETA;
  }
  return { ME, Q0, BD, TAU0, f0, rates, run, calibrate, get theta() { return THETA; } };
})();
if (typeof module !== 'undefined') module.exports = BBN;
