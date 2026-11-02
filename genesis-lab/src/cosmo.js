// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// FLRW 宇宙引擎：真的在积分弗里德曼方程（加速度形式），不是查表或解析近似。
// 单位：时间用 1/H0（换成 Gyr 乘 977.792/H0），长度用 c/H0（换成 Mpc 乘 299792.458/H0）。
// 模型参数：H0（km/s/Mpc）、Ω_m（物质）、Ω_r（辐射）、Ω_Λ（暗能量，状态方程 w）；曲率 Ω_k = 1 − Ω_m − Ω_r − Ω_Λ 由方程决定。
//   第一弗里德曼方程  H²/H0² = E²(a) = Ω_r a⁻⁴ + Ω_m a⁻³ + Ω_k a⁻² + Ω_Λ a^{−3(1+w)}
//   加速度方程        ä/a  = −H0² [ Ω_r a⁻⁴ + ½ Ω_m a⁻³ + ½(1+3w) Ω_Λ a^{−3(1+w)} ]
// 我们积分第二个（二阶常微分方程，今天 a=1、ȧ=H0 作初值，向过去和向未来各积一遍）：
// 它在转折点（ȧ=0，大坍缩的回转、反弹）也不出问题，而第一个方程在那里要开平方。
// 线性结构增长：δ̈ + 2H δ̇ = (3/2) H0² Ω_m a⁻³ δ（Mészáros 方程，辐射主导期自动冻结增长）。
const COSMO = (function () {
  const GYR = 977.792;          // 1/H0 = 977.792/H0 Gyr（H0 以 km/s/Mpc 计）
  const CKMS = 299792.458;      // 光速 km/s → c/H0 = 299792.458/H0 Mpc
  const T_CMB = 2.7255;         // 今天的 CMB 温度 K（Fixsen 2009）
  const DELTA_C = 1.686;        // 线性坍缩阈值（球对称坍缩模型）
  const A_SING = 1e-7, A_BIG = 1e7, T_MAX = 1000, H_CAP = 0.05, EPS = 0.01;
  const Z_REC = 1090;           // 复合（CMB 发出）红移，近似与模型无关

  // 我们的宇宙：Planck 2018（TT,TE,EE+lowE+lensing，Table 2 最后一列）。Ω_r 由 T_CMB 和三代中微子算出：Ω_r h² = 4.18e-5。
  const FIDUCIAL = { name: 'Planck 2018', H0: 67.4, Om: 0.315, Or: 4.18e-5 / (0.674 * 0.674), OL: 0.685, w: -1 };

  function norm(m) {
    const w = (m.w === undefined || m.w === null) ? -1 : m.w;
    const Or = m.Or === undefined ? 0 : m.Or;
    return { H0: m.H0, Om: m.Om, Or, OL: m.OL, w, Ok: 1 - m.Om - Or - m.OL };
  }
  function E2(m, a) { return m.Or / (a * a * a * a) + m.Om / (a * a * a) + m.Ok / (a * a) + m.OL * Math.pow(a, -3 * (1 + m.w)); }
  function Ez(m, z) { const e = E2(m, 1 / (1 + z)); return e > 0 ? Math.sqrt(e) : NaN; }
  // ä/a（H0² 单位）
  function accel(m, a) { return -(m.Or / (a * a * a * a) + 0.5 * m.Om / (a * a * a) + 0.5 * (1 + 3 * m.w) * m.OL * Math.pow(a, -3 * (1 + m.w))); }
  // 密度会不会在 a→0 时发散（真奇点）；纯 de Sitter 不会
  function singularAtZero(m) { return m.Or > 1e-12 || m.Om > 1e-12 || m.Ok > 1e-12 || (m.OL > 0 && m.w > -1 / 3); }

  // ---------- 积分 ----------
  // 从今天出发，dir=+1 向未来，dir=−1 向过去。返回采样点和停下的原因。
  function integrate(m, dir) {
    let a = 1, v = 1, t = 0;
    const ts = [0], as = [1], vs = [1];
    let stop = null, turn = null, nStep = 0, lastLog = 0, lastT = 0;
    const f = (a, v) => [v, accel(m, a) * a];
    while (nStep < 400000) {
      nStep++;
      const acc = Math.abs(accel(m, a));
      let h = EPS * Math.min(Math.abs(a / v) || H_CAP, acc > 0 ? 1 / Math.sqrt(acc) : H_CAP);
      h = Math.min(h, H_CAP, Math.max(h, 1e-12));
      h *= dir;
      const k1 = f(a, v), k2 = f(a + 0.5 * h * k1[0], v + 0.5 * h * k1[1]);
      const k3 = f(a + 0.5 * h * k2[0], v + 0.5 * h * k2[1]), k4 = f(a + h * k3[0], v + h * k3[1]);
      const na = a + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      const nv = v + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      if (!isFinite(na) || !isFinite(nv)) { stop = { why: 'overflow', t, a }; break; }
      // 转折：ȧ 变号（向未来：膨胀→收缩，即回转；向过去：收缩→膨胀，即反弹）
      if (nv * v < 0 && turn === null) { const fr = v / (v - nv); turn = { t: t + h * fr, a: a + (na - a) * fr }; }
      a = na; v = nv; t += h;
      if (Math.abs(Math.log(a) - lastLog) > 0.004 || Math.abs(t - lastT) > 0.004) { ts.push(t); as.push(a); vs.push(v); lastLog = Math.log(a); lastT = t; }
      if (a <= A_SING) { stop = { why: singularAtZero(m) ? 'singular' : 'asymptotic', t, a }; break; }
      if (a >= A_BIG) { stop = { why: 'big', t, a }; break; }
      if (Math.abs(t) >= T_MAX) { stop = { why: 'tmax', t, a }; break; }
    }
    if (!stop) stop = { why: 'steps', t, a };
    if (ts[ts.length - 1] !== t) { ts.push(t); as.push(a); vs.push(v); }
    return { ts, as, vs, stop, turn };
  }

  // ∫_0^1 da/(a E(a))：有大爆炸时的年龄（辛普森，a=u² 换元消掉 a→0 的尖峰）
  function ageQuad(m, aEnd) {
    aEnd = aEnd === undefined ? 1 : aEnd;
    const n = 4000, u1 = Math.sqrt(aEnd); let s = 0;
    const g = (u) => { if (u <= 0) return 0; const a = u * u, e = E2(m, a); return e > 0 ? 2 * u / (a * Math.sqrt(e)) : NaN; };
    for (let i = 0; i <= n; i++) { const u = u1 * i / n, w = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2); s += w * g(u); }
    return s * (u1 / n) / 3;
  }
  // ∫_{a1}^{a2} da/(a² E)：共形时间（视界用），对数网格
  function confQuad(m, a1, a2) {
    const n = 4000, l1 = Math.log(a1), l2 = Math.log(a2); let s = 0;
    for (let i = 0; i <= n; i++) { const a = Math.exp(l1 + (l2 - l1) * i / n), e = E2(m, a); if (!(e > 0)) return NaN; const w = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2); s += w / (a * Math.sqrt(e)); }
    return s * ((l2 - l1) / n) / 3;
  }

  // ---------- 整体求解 ----------
  function solve(input) {
    const m = norm(input);
    const past = integrate(m, -1), fut = integrate(m, +1);
    const R = { m, past, fut };
    // 过去
    if (past.turn) { R.origin = 'bounce'; R.aMin = past.turn.a; R.tBounce = past.turn.t; }
    else if (past.stop.why === 'singular') { R.origin = 'bigbang'; R.age = -past.stop.t; }
    else if (past.stop.why === 'asymptotic') { R.origin = 'eternalpast'; }
    else R.origin = 'eternalpast';
    if (R.origin === 'bigbang') { const q = ageQuad(m); if (isFinite(q)) R.age = q; }
    // 未来
    const q0 = m.Or + 0.5 * m.Om + 0.5 * (1 + 3 * m.w) * m.OL;
    R.q0 = q0;
    if (fut.stop.why === 'singular') { R.fate = 'crunch'; R.tEnd = fut.stop.t; R.aMax = fut.turn ? fut.turn.a : 1; R.tTurn = fut.turn ? fut.turn.t : 0; }
    else if (fut.stop.why === 'big' && m.w < -1 && m.OL > 0) { R.fate = 'rip'; R.tEnd = ripTime(m); }
    else if (fut.turn) { R.fate = 'crunch'; R.tEnd = fut.stop.t; R.aMax = fut.turn.a; R.tTurn = fut.turn.t; } // 回转但还没到奇点（极慢坍缩）
    else { R.fate = 'eternal'; R.tEnd = Infinity; const aL = fut.as[fut.as.length - 1]; R.accelerating = accel(m, aL) > 0; R.aEnd = aL; }
    // 几何
    R.geometry = Math.abs(m.Ok) < 2e-3 ? 'flat' : (m.Ok > 0 ? 'open' : 'closed'); // |Ω_k| < 0.002 当作平坦（Planck 对 Ω_k 的测量精度也就 0.002）
    R.curvRadius = Math.abs(m.Ok) < 1e-9 ? Infinity : 1 / Math.sqrt(Math.abs(m.Ok)); // c/H0 单位
    // 视界：粒子视界 ∫_0^1 da/(a²E) 只在 a→0 处被辐射或物质（或 w>−1/3 的暗能量）压住时收敛；只有曲率的 Milne 宇宙没有粒子视界
    const phFinite = R.origin === 'bigbang' && (m.Or > 1e-12 || m.Om > 1e-12 || (m.OL > 0 && m.w > -1 / 3));
    R.particleHorizon = phFinite ? confQuad(m, A_SING, 1) : Infinity;
    if (R.fate === 'eternal') R.eventHorizon = (m.OL > 0 && m.w < -1 / 3) ? confQuad(m, 1, 1e9) : Infinity;
    else if (R.fate === 'rip') R.eventHorizon = confQuad(m, 1, 1e9);
    else { // 大坍缩：整个未来的 ∫dt/a，沿轨迹数值积分
      let s = 0; for (let i = 1; i < fut.ts.length; i++) s += (fut.ts[i] - fut.ts[i - 1]) * 0.5 * (1 / fut.as[i] + 1 / fut.as[i - 1]); R.eventHorizon = s;
    }
    // 纪元
    R.aEq = m.Om > 0 ? m.Or / m.Om : Infinity;
    R.aRec = 1 / (1 + Z_REC);
    R.aLambda = (m.OL > 0 && m.Om > 0) ? Math.pow(m.OL / m.Om, 1 / (3 * m.w)) : Infinity;
    R.tOf = (a) => tOfA(R, a);
    R.growth = growth(m, R);
    R.diag = diagnose(R);
    return R;
  }
  function ripTime(m) { // t_rip − t0 = ∫_1^∞ da/(a E)
    const n = 20000; let s = 0; // u = 1/a
    for (let i = 0; i <= n; i++) { const u = i / n; if (u === 0) continue; const a = 1 / u, e = E2(m, a); const g = e > 0 ? 1 / (a * Math.sqrt(e)) / (u * u) : 0; s += ((i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2)) * g; }
    return s / n / 3;
  }
  // 过去分支（单调的大爆炸宇宙）：由 a 找时间 t（相对今天，负数）
  function tOfA(R, a) {
    if (a >= 1) return 0;
    if (R.origin !== 'bigbang') return NaN;
    const { ts, as } = R.past; // as 单调递减
    let lo = 0, hi = as.length - 1;
    if (a <= as[hi]) return ts[hi];
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (as[mid] > a) lo = mid; else hi = mid; }
    const f = (Math.log(as[lo]) - Math.log(a)) / (Math.log(as[lo]) - Math.log(as[hi]));
    return ts[lo] + (ts[hi] - ts[lo]) * f;
  }
  // 今天之后、由 a 找 t（未来分支，膨胀段）
  function tFutOfA(R, a) {
    const { ts, as } = R.fut; if (a <= 1) return 0;
    for (let i = 1; i < as.length; i++) { if (as[i] >= a) { const f = (a - as[i - 1]) / (as[i] - as[i - 1]); return ts[i - 1] + (ts[i] - ts[i - 1]) * f; } if (as[i] < as[i - 1]) return NaN; }
    return NaN;
  }

  // ---------- 线性增长 ----------
  // 以 x = ln a 为自变量（膨胀段 a 单调，背景直接用第一弗里德曼方程，不另积背景，避免误差被放大）：
  //   p = dD/dx，  dp/dx = −(2 + q) p + (3/2) Ω_m a⁻³/E² · D，  q = d ln E / d ln a
  // 从 a_i = 1e-5（所有可比宇宙都在辐射主导期）出发，D=1、p=0，积到膨胀结束（回转、撕裂）或 a=10⁴。
  // 归一化：以 Planck 宇宙今天 δ_8 = 0.81、星系尺度（~10¹² M☉）σ ≈ 2.1 定标——即假设各宇宙的原初扰动幅度相同。
  let FID_D1 = null;
  function dlnE(m, a) { // q = d ln E / d ln a = (Σ nᵢ Ωᵢ aⁿⁱ) / (2E²)
    const nL = -3 * (1 + m.w);
    const num = -4 * m.Or / (a * a * a * a) - 3 * m.Om / (a * a * a) - 2 * m.Ok / (a * a) + nL * m.OL * Math.pow(a, nL);
    return num / (2 * E2(m, a));
  }
  function growthRaw(m, R, aStart, aStop) {
    if (R.origin !== 'bigbang') return null;
    aStart = aStart || 1e-5;
    if (aStop === undefined) aStop = R.fate === 'crunch' ? R.aMax * (1 - 1e-4) : 1e4;
    let x = Math.log(aStart), D = 1, p = 0; const xEnd = Math.log(aStop), dx = 0.005;
    const out = { as: [aStart], Ds: [D] }; let peak = 1, n = 0;
    const f = (x, D, p) => { const a = Math.exp(x), e2 = E2(m, a); if (!(e2 > 0)) return [p, 0]; return [p, -(2 + dlnE(m, a)) * p + 1.5 * m.Om / (a * a * a) / e2 * D]; };
    while (x < xEnd && n++ < 100000) {
      const h = Math.min(dx, xEnd - x);
      const k1 = f(x, D, p), k2 = f(x + .5 * h, D + .5 * h * k1[0], p + .5 * h * k1[1]);
      const k3 = f(x + .5 * h, D + .5 * h * k2[0], p + .5 * h * k2[1]), k4 = f(x + h, D + h * k3[0], p + h * k3[1]);
      D += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); p += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]); x += h;
      if (!isFinite(D)) break;
      if (n % 2 === 0 || x >= xEnd) { out.as.push(Math.exp(x)); out.Ds.push(D); }
      if (D > peak) peak = D;
    }
    out.peak = peak;
    return out;
  }
  function fiducialD1() {
    if (FID_D1 === null) { const m = norm(FIDUCIAL); const g = growthRaw(m, { origin: 'bigbang', fate: 'eternal' }, 1e-5, 1); FID_D1 = g.Ds[g.Ds.length - 1]; }
    return FID_D1;
  }
  // 三个尺度在 Planck 宇宙今天的线性涨落（ΛCDM 的 σ(M)）：
  //   星系团 8 h⁻¹Mpc：σ8 = 0.81；典型星系 10¹² M☉：σ ≈ 2.1；矮星系 / 第一批星系 10⁸ M☉：σ ≈ 3.9，取 3σ 高峰
  const SIG_8 = 0.81, SIG_GAL = 2.1, SIG_FIRST = 3 * 3.9;
  function growth(m, R) {
    const g = growthRaw(m, R); if (!g) return null;
    const d1 = fiducialD1();
    const res = { as: g.as, dFirst: g.Ds.map((D) => D * SIG_FIRST / d1), dGal: g.Ds.map((D) => D * SIG_GAL / d1), d8: g.Ds.map((D) => D * SIG_8 / d1) };
    res.dFirstMax = g.peak * SIG_FIRST / d1; res.dGalMax = g.peak * SIG_GAL / d1; res.d8Max = g.peak * SIG_8 / d1; res.growthMax = g.peak / d1;
    // 第一次越过阈值的 a（线性插值），再换成时间
    const cross = (arr) => { for (let i = 1; i < arr.length; i++) if (arr[i] >= DELTA_C && arr[i - 1] < DELTA_C) { const f = (DELTA_C - arr[i - 1]) / (arr[i] - arr[i - 1]); return g.as[i - 1] + (g.as[i] - g.as[i - 1]) * f; } return NaN; };
    const tAt = (a) => !isFinite(a) ? NaN : (a <= 1 ? tOfA(R, a) : tFutOfA(R, a));
    res.aFirst = cross(res.dFirst); res.aGal = cross(res.dGal); res.aCluster = cross(res.d8);
    res.tFirst = tAt(res.aFirst); res.tGal = tAt(res.aGal); res.tCluster = tAt(res.aCluster);
    const at1 = (arr) => { for (let i = 1; i < g.as.length; i++) if (g.as[i] >= 1 && g.as[i - 1] < 1) { const f = (1 - g.as[i - 1]) / (g.as[i] - g.as[i - 1]); return arr[i - 1] + (arr[i] - arr[i - 1]) * f; } return arr[arr.length - 1]; };
    res.sigma8Today = at1(res.d8); res.dGalToday = at1(res.dGal); res.growthToday = at1(g.Ds.map((D) => D / d1));
    return res;
  }

  // ---------- 宜居诊断（粗略）----------
  function diagnose(R) {
    const m = R.m, gyr = GYR / m.H0, items = [];
    const G = R.growth;
    const fmtT = (t) => (t * gyr).toPrecision(3) + ' Gyr';
    // 1 起点
    if (R.origin === 'bigbang') {
      if (m.Or > 1e-12 || m.Om > 1e-12) items.push({ level: 'ok', key: 'origin', title: '热大爆炸', detail: `从奇点算起 ${fmtT(R.age)}。早期足够热，有核合成和 CMB。` });
      else items.push({ level: 'warn', key: 'origin', title: '大爆炸，但空无一物', detail: `从奇点算起 ${fmtT(R.age)}；没有物质也没有辐射，所谓"大爆炸"只是坐标的起点（米尔恩宇宙其实就是闵可夫斯基时空的一块）。` });
    }
    else if (R.origin === 'bounce') items.push({ level: 'warn', key: 'origin', title: '没有大爆炸（反弹）', detail: `过去收缩到最小 a = ${R.aMin.toPrecision(3)} 后反弹。从没热过：没有氦、没有 CMB——真实宇宙的观测排除了它。` });
    else items.push({ level: 'warn', key: 'origin', title: '没有奇点，无限的过去', detail: '密度不发散，膨胀只是指数地从极小开始（de Sitter 式）。也没有热的开端。' });
    // 2 星系
    if (!G) items.push({ level: 'dead', key: 'galaxies', title: '结构形成：不适用', detail: '没有热大爆炸就没有原初扰动的常规剧本，这里不做判断。' });
    else if (isFinite(G.tFirst)) {
      const T = T_CMB / G.aFirst;
      let d = `10⁸ M☉ 的 3σ 高峰在 a = ${G.aFirst.toPrecision(2)}（背景温度 ${T.toPrecision(2)} K）越过坍缩阈值 δ = 1.686。`;
      d += isFinite(G.tGal) ? ` 像银河系那样的典型星系（10¹² M☉ 的 1σ 涨落）在 ${G.aGal <= 1 ? '大爆炸后 ' + fmtT(G.tGal + R.age) : '今天之后 ' + fmtT(G.tGal)}坍缩；` : ' 典型星系尺度（10¹² M☉ 的 1σ）永远到不了阈值；';
      d += isFinite(G.tCluster) ? `星系团尺度（8 h⁻¹Mpc 的 1σ）在 ${G.aCluster <= 1 ? '大爆炸后 ' + fmtT(G.tCluster + R.age) : '今天之后 ' + fmtT(G.tCluster)}坍缩。` : '星系团尺度（8 h⁻¹Mpc 的 1σ）永远到不了阈值——真实的星系团是 2–3σ 的稀有高峰。';
      items.push({ level: 'ok', key: 'galaxies', title: `第一批星系在大爆炸后 ${fmtT(G.tFirst + R.age)} 形成`, detail: d });
    } else {
      let why;
      const peak = G.dFirstMax.toPrecision(2);
      if (m.Om <= 1e-12) why = '宇宙里没有物质：没有东西可以在引力下聚集。';
      else if (R.fate === 'crunch') why = `宇宙寿命只有 ${fmtT(R.tEnd + R.age)}，连最高的密度峰也只长到 δ = ${peak} 就被大坍缩压碎了。`;
      else if (m.OL > 0 && m.w < -1 / 3) why = `暗能量过早接管（物质-暗能量相等在 a = ${R.aLambda.toPrecision(2)}），增长被冻结：最高的密度峰也只长到 δ = ${peak} < 1.686，永远形不成星系。这正是温伯格 1987 年用来"预言"宇宙学常数不能比我们的大太多的论证。`;
      else if (R.aEq > 0.01) why = `辐射主导得太久（物质-辐射相等要到 a = ${R.aEq.toPrecision(2)}），Mészáros 效应把增长冻结在 δ ≈ ${peak}。`;
      else why = `密度峰最多长到 δ = ${peak}，不够坍缩（开放宇宙的曲率让膨胀太快，增长在 a ≈ Ω_m/|Ω_k| 后冻结）。`;
      items.push({ level: 'dead', key: 'galaxies', title: '没有星系', detail: why });
    }
    // 3 恒星时间
    if (G && isFinite(G.tFirst)) {
      const avail = R.fate === 'eternal' ? Infinity : (R.tEnd - G.tFirst);
      if (avail === Infinity) items.push({ level: 'ok', key: 'stars', title: '恒星可以燃烧到自然终老', detail: R.accelerating ? '永远膨胀并加速：其他星系最终退出视界，每个星系群成为孤岛，但本地的恒星不受影响。' : '永远膨胀、不加速：没有事件视界，整个宇宙保持因果联系。' });
      else if (avail * gyr > 5) items.push({ level: 'ok', key: 'stars', title: `星系形成后还有 ${fmtT(avail)}`, detail: R.fate === 'crunch' ? '够类太阳恒星走完一生，然后一切被大坍缩压回奇点。' : '够类太阳恒星走完一生，然后大撕裂把星系、恒星、原子逐级撕开。' });
      else if (avail * gyr > 0.5) items.push({ level: 'warn', key: 'stars', title: `星系形成后只剩 ${fmtT(avail)}`, detail: '大质量恒星来得及，类太阳恒星和行星上的演化大概来不及。' });
      else items.push({ level: 'dead', key: 'stars', title: `星系刚形成 ${fmtT(avail)} 就结束了`, detail: '没有恒星来得及走完一生。' });
    }
    // 总评
    const dead = items.some((i) => i.level === 'dead'), warn = items.some((i) => i.level === 'warn');
    R.verdict = dead ? 'dead' : (warn ? 'marginal' : 'alive');
    return items;
  }

  // ---------- 距离与观测量 ----------
  // 共动距离 χ(z) 表（c/H0 单位），z 到 zMax；E² ≤ 0 处（反弹宇宙的过去）截断
  function chiTable(m, zMax, n) {
    zMax = zMax || 3; n = n || 1500;
    const zs = new Float64Array(n + 1), chi = new Float64Array(n + 1); let prev = 1 / Ez(m, 0), ok = n;
    for (let i = 1; i <= n; i++) {
      const z = zMax * i / n, zm = zMax * (i - 0.5) / n, e = Ez(m, z), em = Ez(m, zm);
      zs[i] = z;
      if (!(e > 0) || !(em > 0)) { ok = i - 1; for (let j = i; j <= n; j++) { chi[j] = NaN; zs[j] = zMax * j / n; } break; }
      const cur = 1 / e, mid = 1 / em; chi[i] = chi[i - 1] + (zMax / n) * (prev + 4 * mid + cur) / 6; prev = cur;
    }
    return { zs, chi, zMax, n, zOk: zMax * ok / n };
  }
  function chiAt(T, z) {
    if (z <= 0) return 0; if (z > T.zOk) return NaN;
    const f = z / T.zMax * T.n, i = Math.min(T.n - 1, Math.floor(f)); return T.chi[i] + (T.chi[i + 1] - T.chi[i]) * (f - i);
  }
  function Sk(m, chi) {
    const Ok = m.Ok; if (Math.abs(Ok) < 1e-9) return chi;
    const s = Math.sqrt(Math.abs(Ok)); return Ok > 0 ? Math.sinh(s * chi) / s : Math.sin(s * chi) / s;
  }
  // 光度距离、角直径距离（Mpc），距离模数
  function distances(m, T, z) {
    const chi = chiAt(T, z); if (!isFinite(chi)) return { DL: NaN, DA: NaN, DM: NaN, mu: NaN };
    const DM = Sk(m, chi) * CKMS / m.H0; if (!(DM > 0)) return { DL: NaN, DA: NaN, DM, mu: NaN };
    return { DM, DL: DM * (1 + z), DA: DM / (1 + z), mu: 5 * Math.log10(DM * (1 + z)) + 25 };
  }

  return { GYR, CKMS, T_CMB, DELTA_C, Z_REC, FIDUCIAL, norm, E2, Ez, accel, integrate, solve, ageQuad, confQuad, tOfA, tFutOfA, growth, chiTable, chiAt, Sk, distances, SIG_FIRST, SIG_GAL, SIG_8 };
})();
if (typeof module !== 'undefined') module.exports = COSMO;
