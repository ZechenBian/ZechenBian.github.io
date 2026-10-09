// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 后台线程的消息循环，重点是"模型训练用的数据"与"回测用的数据"确实分开了
const { QL, STRATS, compile, world, SET0, ok, near, section, done } = require("./harness.js");
const SETD = { costBps: 5, rf: 0, fmin: -1, fmax: 3, lam: 1, ddLimit: 30, ddProb: 5 };

function worker(code) {
  const out = [], scope = { postMessage: m => out.push(m) }; let seq = 0;
  QL.workerMain(scope, compile(code), {});
  return {
    out,
    call(type, payload) {
      const id = ++seq; scope.onmessage({ data: Object.assign({ type, id }, payload) });
      return new Promise((res, rej) => { const poll = () => { const m = out.find(x => x.id === id && (x.type === type || x.type === "error")); if (!m) return setImmediate(poll); if (m.type === "error") rej(new Error(m.message)); else res(m); }; poll(); });
    }
  };
}
// 作弊者：把训练时见过的每一个"下一步收益"都背下来，回测时只要当前这一步的收益是背过的就满仓。
// 如果回测数据和训练数据有任何重叠，它的平均仓位就会大于 0。
const CHEAT = `
function fit(D) { var seen = {}; for (var n = 0; n < D.N; n++) for (var t = 0; t < D.T; t++) seen[D.next(n, t).toFixed(10)] = 1; return { seen: seen, N: D.N, T: D.T }; }
function decide(s, p, st, model) { if (s.t < 1) return 0; return model.seen[s.ret(0).toFixed(10)] ? 1 : 0; }`;
const HOLD = "function decide() { return 1; }";
// 一段没有重复收益的合成"真实数据"
function series(n, seed) { const g = new QL.RNG(seed, 1, 1), s = [100]; for (let i = 1; i < n; i++) s.push(s[i - 1] * Math.exp(0.0003 + 0.012 * g.normal())); return s; }

(async () => {
  section("模拟的世界：模型在另一批路径上训练");
  {
    const cfg = world("gbm", null, 300, 120), w = worker(CHEAT);
    await w.call("world", { cfg });
    const r = await w.call("run", { p: {}, set: SETD, fan: true });
    ok(r.hasFit && r.fit && r.fit.N === 300 && r.fit.T === 120 && !r.fit.data, "运行结果里带着训练批次的规模", JSON.stringify(r.fit));
    // 收益按 32 位浮点存，3.6 万个数里会有千分之一左右碰巧相等；真有重叠时平均仓位接近 1（见下面的对照）
    ok(r.sum.exposure < 0.005 && r.sum.N === 300 && r.sum.T === 120, "回测用的路径没在训练里出现过", "平均仓位 " + r.sum.exposure.toFixed(5));
    const o = await w.call("oos", { p: {}, set: SETD, k: 1 }); ok(o.sum.exposure < 0.005, "样本外的新路径也没有", "平均仓位 " + o.sum.exposure.toFixed(5));
    const sw = await w.call("sweep", { axes: [{ key: "__lam", values: [0.5, 1, 2] }], p: {}, set: SETD }); ok(Array.from(sw.growth).every(v => Math.abs(v) < 0.01), "杠杆扫描同样用的是没见过的路径", Array.from(sw.growth).map(v => v.toFixed(5)).join(" "));
    // 对照：直接在同一批上训练，作弊者满仓——说明这个检验有区分度
    const B = QL.makeBatch(cfg, null, 0), S = compile(CHEAT), leak = QL.summarize(QL.runBatch(B, S, {}, SET0, {}, S.fit(QL.makeData(B))), SET0);
    ok(leak.exposure > 0.98, "对照：在同一批路径上训练再回测，作弊者几乎一直满仓", "平均仓位 " + leak.exposure.toFixed(3));
    const fitB = QL.makeBatch(cfg, null, 0, "fit"), fitB2 = QL.makeBatch(cfg, null, 0, "fit"); let same = 0, rep = true; for (let i = 0; i < 500; i++) { if (fitB.R[i] === B.R[i]) same++; if (fitB.R[i] !== fitB2.R[i]) rep = false; }
    ok(same === 0 && rep, "训练批次与回测批次不同，且可复现");
  }

  section("真实数据：训练段按时间切成 给模型的前一段 / 回测的后一段");
  {
    const s = series(1000, 5), ext = { series: s };
    for (const mode of ["whole", "windows"]) {
      const cfg = { type: "real", params: { mode, split: 70, L: 60, stride: 10 }, N: 1, T: 0, K: 252, seed: 7, S0: 100 };
      const cut = 700, cf = Math.floor(cut * QL.FIT_FRAC);
      const wc = worker(CHEAT), wh = worker(HOLD);
      await wc.call("world", { cfg, ext }); await wh.call("world", { cfg, ext });
      const rc = await wc.call("run", { p: {}, set: SETD }), rh = await wh.call("run", { p: {}, set: SETD }), rhe = await wh.call("run", { p: {}, set: SETD, part: "eval" });
      ok(rc.sum.exposure === 0, `${mode}：回测段里没有模型见过的数据`, "平均仓位 " + rc.sum.exposure);
      ok(rc.fit && rc.fit.data && rc.fit.N === 1 && rc.fit.T === cf - 1, `${mode}：模型拿到的是前 60% 的一整条`, JSON.stringify(rc.fit));
      if (mode === "whole") { ok(rc.sum.T === cut - cf && rh.sum.T === cut - 1, "whole：带训练的规则只回测后一段，不带训练的用整个训练段", `${rc.sum.T} / ${rh.sum.T}`); }
      else ok(rc.sum.N < rh.sum.N && rc.sum.T === 60 && rc.overlapTrain, "windows：回测的窗口只取自后一段，并提示窗口重叠", `${rc.sum.N} / ${rh.sum.N}`);
      ok(rhe.sum.N === rc.sum.N && rhe.sum.T === rc.sum.T && rhe.part === "eval", `${mode}：part = "eval" 让不带训练的规则也在同一段上跑（用于多策略对比）`);
      near(rc.benchSum.growth, rhe.sum.growth, 1e-12, `${mode}：带训练规则的基准 = 同一段上的买入持有`);
      const o = await wc.call("oos", { p: {}, set: SETD, k: 1 }); ok(o.sum.exposure === 0 && o.kind === "test", `${mode}：样本外段同样没见过`);
    }
    // 直接核对三段的下标：给模型 [0, cf)，回测 [cf−1, cut)，样本外 [cut, len)
    const cfg = { type: "real", params: { mode: "whole", split: 70 }, N: 1, T: 0, K: 252, seed: 7, S0: 100 };
    const f = QL.makeBatch(cfg, ext, 0, "fit"), e = QL.makeBatch(cfg, ext, 0, "eval"), a = QL.makeBatch(cfg, ext, 0), t = QL.makeBatch(cfg, ext, 1);
    ok(f.range[0] === 0 && f.range[1] === 420 && e.range[0] === 419 && e.range[1] === 700 && a.range[1] === 700 && t.range[0] === 700 && t.range[1] === 1000, "三段的下标", JSON.stringify([f.range, e.range, t.range]));
    ok(f.T + e.T === a.T, "两段的收益合起来正好是训练段，不重不漏", `${f.T} + ${e.T} = ${a.T}`);
    near(e.L[0], s[419], 1e-3, "回测段从给模型那段的最后一个价格出发");
    let threw = ""; try { QL.makeBatch(cfg, { series: series(70, 1) }, 0, "fit"); } catch (err) { threw = err.message; } ok(/不够/.test(threw), "数据太短时给出说明而不是硬切", threw.slice(0, 40));
  }

  section("bootstrap：模型学真实的前一段，回测从后一段里重抽样");
  {
    const s = series(1000, 9), ext = { series: s }, cfg = { type: "boot", params: { block: 5 }, N: 200, T: 100, K: 252, seed: 7, S0: 100 };
    const wc = worker(CHEAT), wh = worker(HOLD); await wc.call("world", { cfg, ext }); await wh.call("world", { cfg, ext });
    const rc = await wc.call("run", { p: {}, set: SETD }), rh = await wh.call("run", { p: {}, set: SETD });
    ok(rc.sum.exposure === 0 && rc.sum.N === 200 && rc.sum.T === 100, "回测路径里没有模型见过的收益", "平均仓位 " + rc.sum.exposure);
    ok(rc.fit.data && rc.fit.N === 1 && rc.fit.T === 419, "模型拿到的是真实历史的前一段（不是重抽样）", JSON.stringify(rc.fit));
    const o = await wc.call("oos", { p: {}, set: SETD, k: 2 }); ok(o.sum.exposure === 0, "新抽的路径也只来自后一段");
    // 不带训练的规则：从整个训练段重抽样（会抽到前一段的收益）
    const all = QL.makeBatch(cfg, { series: s, split: 0.7 }, 0), early = new Set(); for (let t = 0; t < 418; t++) early.add(Math.fround(s[t + 1] / s[t] - 1)); let hit = 0; for (let i = 0; i < all.R.length; i++) if (early.has(all.R[i])) hit++;
    ok(hit / all.R.length > 0.4 && rh.sum.N === 200, "不带训练的规则仍然用整个训练段", "来自前一段的比例 " + (hit / all.R.length).toFixed(2));
    const ev = QL.makeBatch(cfg, { series: s, split: 0.7 }, 0, "eval"); hit = 0; for (let i = 0; i < ev.R.length; i++) if (early.has(ev.R[i])) hit++; ok(hit === 0, "eval 批次里没有前一段的收益");
  }

  section("模型缓存：只有影响训练的参数变了才重新训练");
  {
    const code = "var fits = 0;\nfunction fit(D, p) { fits++; return { k: p.a, n: fits }; }\nfunction decide(s, p, st, m) { return m.n * 0 + p.b; }";
    const w = worker(code); await w.call("world", { cfg: world("gbm", null, 50, 60) });
    const fitted = () => w.out.filter(m => m.type === "fitted").length;
    await w.call("run", { p: { a: 1, b: 0.5 }, set: SETD, fitKeys: ["a"] }); await w.call("run", { p: { a: 1, b: 0.8 }, set: SETD, fitKeys: ["a"] }); ok(fitted() === 1, "只改仓位参数：不重新训练");
    await w.call("run", { p: { a: 2, b: 0.8 }, set: SETD, fitKeys: ["a"] }); ok(fitted() === 2, "改了训练参数：重新训练");
    await w.call("run", { p: { a: 2, b: 0.9 }, set: SETD }); ok(fitted() === 3, "没有声明 fitKeys：任何参数变了都重新训练");
    await w.call("world", { cfg: world("gbm", null, 50, 60, 252, 8) }); await w.call("run", { p: { a: 2, b: 0.9 }, set: SETD }); ok(fitted() === 4, "换了世界：缓存清空");
  }

  section("扫描：字符串取值、R²、换手");
  {
    const pipe = STRATS.find(x => x.id === "pipe"), p = {}; pipe.params.forEach(q => { p[q.key] = q.def; });
    const w = worker(pipe.code); await w.call("world", { cfg: world("ar1", { phi: 0.2 }, 400, 120) });
    const m = await w.call("sweep", { axes: [{ key: "model", values: ["mean", "ols", "tree"] }], p, set: SETD, fitKeys: pipe.fitKeys });
    ok(m.nx === 3 && m.r2Valid[0] === 0 && m.r2Valid[1] > 0.01 && m.ic[1] > 0.1 && m.turnover[1] > m.turnover[0], "按模型逐个训练并回测", `R² ${Array.from(m.r2Valid).map(v => v.toFixed(3))}  换手 ${Array.from(m.turnover).map(v => v.toFixed(0))}`);
    ok(m.growth[1] > m.growth[0], "有预测力的模型增长率更高");
  }

  section("审阅后补的检查");
  {
    // 杠杆曲线的"录一次、回放多次"：λ = 1 时破产的路径，在更小的 λ 下还活着，后面的决策必须照样回放
    const cfg = world("bet", { p: 0.6, b: 1 }, 800, 100), set = { costBps: 0, rf: 0, fmin: 0, fmax: 1, lam: 1, ddLimit: 30, ddProb: 5 }, w = worker("function decide() { return 1; }");
    await w.call("world", { cfg }); const lams = [0.1, 0.2, 0.5, 0.8], sw = await w.call("sweep", { axes: [{ key: "__lam", values: lams }], p: {}, set });
    const B = QL.makeBatch(cfg, null, 0), S = compile("function decide() { return 1; }"); let worst = 0, ruinDiff = 0;
    lams.forEach((lam, i) => { const s2 = Object.assign({}, set, { lam }), d = QL.summarize(QL.runBatch(B, S, {}, s2, {}), s2); if (isFinite(d.growth) || isFinite(sw.growth[i])) worst = Math.max(worst, Math.abs(d.growth - sw.growth[i])); ruinDiff = Math.max(ruinDiff, Math.abs(d.pRuin - sw.pRuin[i])); });
    ok(worst < 1e-9 && ruinDiff === 0, "全押的规则：各个 λ 下的回放与直接运行一致", `最大偏差 ${worst.toExponential(2)}`); near(sw.growth[1], 0.6 * Math.log(1.2) + 0.4 * Math.log(0.8), 0.02, "λ = 0.2 正是 Kelly 点，增长率 ≈ 2.0%/局");
    // 跳跃世界里的 3 倍杠杆：破产概率也要一致
    const cj = world("jump", { mu: 8, sigma: 15, lam: 6, muJ: -20, sigJ: 15 }, 1500, 252), wj = worker("function decide() { return 3; }"), setj = { costBps: 0, rf: 0, fmin: -5, fmax: 5, lam: 1, ddLimit: 30, ddProb: 5 };
    await wj.call("world", { cfg: cj }); const swj = await wj.call("sweep", { axes: [{ key: "__lam", values: [0.5, 0.75, 1] }], p: {}, set: setj }), Bj = QL.makeBatch(cj, null, 0), Sj = compile("function decide() { return 3; }");
    const direct = [0.5, 0.75, 1].map(lam => { const s2 = Object.assign({}, setj, { lam }); return QL.summarize(QL.runBatch(Bj, Sj, {}, s2, {}), s2).pRuin; });
    ok(direct.every((v, i) => v === swj.pRuin[i]) && direct[2] > direct[0], "跳跃世界：各个 λ 下的破产概率与直接运行一致", direct.map(v => v.toFixed(3)).join(" "));
  }
  {
    // bootstrap：以前某些长度（如 1300、350）会让一个收益同时出现在"模型的历史"和"重抽样的池子"里
    for (const len of [1299, 1300, 1301, 350, 360, 170]) { const ext = { series: series(len, 3) }, cfg = { type: "boot", params: { block: 5 }, N: 150, T: 80, K: 252, seed: 7, S0: 100 }, w = worker(CHEAT); await w.call("world", { cfg, ext }); const r = await w.call("run", { p: {}, set: SETD }); ok(r.sum.exposure === 0, `bootstrap，长度 ${len}：回测池里没有模型见过的收益`, "平均仓位 " + r.sum.exposure); }
    // 给模型的那批路径用负的批次号：任何样本外批次都撞不上
    const cfg = world("gbm", null, 200, 60), w = worker(CHEAT); await w.call("world", { cfg }); await w.call("run", { p: {}, set: SETD });
    for (const k of [7918, 7919, 0, 1, 99999]) { const o = await w.call("oos", { p: {}, set: SETD, k }); ok(o.sum.exposure < 0.01, `样本外批次 k = ${k} 不是模型的训练批次`, "平均仓位 " + o.sum.exposure.toFixed(4)); }
    // bootstrap 世界里模型学的那条真实历史从 S0 出发，与重抽样路径的起点一致
    const fb = QL.makeBatch({ type: "boot", params: { block: 5 }, N: 10, T: 50, K: 252, seed: 7, S0: 100 }, { series: series(1000, 4).map(v => v * 40) }, 0, "fit"); near(fb.L[0], 100, 1e-3, "bootstrap 的训练历史换算成从 100 出发");
  }

  section("路径很短时的流水线");
  {
    const pipe = STRATS.find(x => x.id === "pipe"), p0 = {}; pipe.params.forEach(q => { p0[q.key] = q.def; });
    // T = 20：以前固定跳过前 25 步，训练集是空的（神经网络还会死循环）
    for (const model of ["ols", "knn", "tree", "mlp"]) { const w = worker(pipe.code); await w.call("world", { cfg: world("gbm", null, 300, 20) }); const r = await w.call("run", { p: Object.assign({}, p0, { model }), set: SETD, fitKeys: pipe.fitKeys }); ok(isFinite(r.sum.growth) && r.sum.badFrac === 0 && r.diag.nTrain > 1000, `T = 20，${model}：能训练，仓位里没有 NaN`, `训练 ${r.diag.nTrain} 行`); }
    // 只看方向的仓位：预测是 NaN 时空仓，而不是做空
    { const w = worker(pipe.code.replace("var mu = model.m.predict(x) - s.rf;", "var mu = NaN;")); await w.call("world", { cfg: world("gbm", null, 100, 60) }); const r = await w.call("run", { p: Object.assign({}, p0, { sizing: "sign" }), set: SETD }); ok(r.sum.exposure === 0, "预测是 NaN 时空仓（以前会一直做空）", "平均仓位 " + r.sum.exposure); }
    // 特征需要 20 步历史而路径只有 20 步：给出说得清的错误
    { const w = worker(pipe.code); await w.call("world", { cfg: world("gbm", null, 300, 20) }); let msg = ""; try { await w.call("run", { p: Object.assign({}, p0, { feat: "tech" }), set: SETD }); } catch (e) { msg = e.message; } ok(/可用的样本太少（训练 0 行/.test(msg), "样本不够时报错并说明原因", msg.slice(0, 60)); }
    // 下注游戏：流水线学到的是赌局的盈亏，不再一上来就全押
    { const w = worker(pipe.code); await w.call("world", { cfg: world("bet", { p: 0.6, b: 1 }, 2000, 100) }); const set = { costBps: 0, rf: 0, fmin: 0, fmax: 1, lam: 1, ddLimit: 30, ddProb: 5 }, r = await w.call("run", { p: Object.assign({}, p0, { model: "mean", shrink: 1 }), set });
      ok(r.sum.pRuin === 0 && r.sum.growth > 0.012 && r.sum.exposure > 0.08 && r.sum.exposure < 0.4, "下注游戏 + 均值模型：押注比例在 Kelly 附近，没有路径破产", `每局增长率 ${r.sum.growth.toFixed(4)}（Kelly 0.0201），平均押注 ${r.sum.exposure.toFixed(3)}`); }
  }
  done();
})().catch(e => { console.error("TEST CRASHED:", e); process.exit(1); });
