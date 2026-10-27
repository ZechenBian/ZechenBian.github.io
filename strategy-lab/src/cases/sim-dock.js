// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 数据分析案例 · 模拟数据：一个共享单车站点（车桩）的逐小时记录，带着"上帝视角"的真实需求。
 * 生成方式（在一小时之内按连续时间模拟）：想取车的人按强度 λ_取(小时, 工作日) 到达，想还车的人按强度 λ_还 到达，两者都是 Poisson 过程；
 * 每天的需求再乘一个均值为 1 的对数正态因子 m_d（天气、活动……），同一天里取车和还车用同一个因子。
 * 有车时取车成功，库存 −1；没车时这个人走了，记录里看不到他（删失）。有空桩时还车成功，库存 +1；桩满了他去了别的站（也看不到）。
 * 每天 5 点调度车把库存补到（或拉回到）目标值；系统只记下：每小时成功的取车数、还车数、这一小时里"有车"的分钟数、"桩满"的分钟数、调度的数量。
 * 所有随机数都来自传进来的 rng（QL.RNG），同样的种子得到逐位相同的数据。 */
var QLCASE_DOCK = (function () {
  "use strict";
  /** 三种站点：住宅区（早上往外骑、晚上骑回来）、办公区（反过来）、两头均衡。数值是工作日每小时的强度（人次/小时，需求规模为 1 时） */
  var BASE = {
    home: {
      pick: [0.15, 0.1, 0.05, 0.05, 0.1, 0.4, 1.75, 4.5, 5.5, 3, 1.25, 1, 1.1, 1, 1, 1.2, 1.5, 1.7, 1.5, 1.2, 0.9, 0.65, 0.45, 0.25],
      ret:  [0.2, 0.1, 0.05, 0.05, 0.05, 0.15, 0.4, 0.75, 0.9, 0.8, 0.75, 0.9, 1.1, 1, 1, 1.3, 2, 3.75, 4.75, 3.5, 2, 1.3, 0.8, 0.4]
    },
    office: {
      pick: [0.1, 0.05, 0.05, 0.05, 0.05, 0.1, 0.3, 0.7, 0.9, 0.75, 0.8, 1.1, 1.6, 1.3, 1, 1.3, 2.2, 4.75, 5.5, 3, 1.25, 0.7, 0.4, 0.2],
      ret:  [0.1, 0.05, 0.05, 0.05, 0.1, 0.3, 1.5, 4.25, 5.25, 3, 1.1, 1, 1.5, 1.4, 1, 1, 1, 1.2, 1.1, 0.8, 0.5, 0.35, 0.25, 0.15]
    },
    balanced: {
      pick: [0.2, 0.1, 0.05, 0.05, 0.1, 0.25, 0.9, 2.25, 2.75, 1.9, 1.3, 1.4, 1.7, 1.5, 1.4, 1.5, 1.9, 2.5, 2.75, 1.9, 1.2, 0.8, 0.5, 0.3],
      ret:  [0.2, 0.1, 0.05, 0.05, 0.1, 0.25, 0.9, 2.25, 2.75, 1.9, 1.3, 1.4, 1.7, 1.5, 1.4, 1.5, 1.9, 2.5, 2.75, 1.9, 1.2, 0.8, 0.5, 0.3]
    }
  };
  /** 周末：早晚高峰没了，午后有一个平缓的峰（取车和还车一样） */
  var WEEKEND = [0.15, 0.1, 0.05, 0.05, 0.05, 0.1, 0.2, 0.4, 0.7, 1.1, 1.5, 1.8, 2, 2.1, 2.1, 2, 1.8, 1.5, 1.2, 0.9, 0.6, 0.45, 0.3, 0.2];
  var DEFAULTS = { type: "home", days: 140, cap: 19, target: 10, scale: 1, daySd: 0.25, rebalance: true };

  function rates(type, work, scale) {
    var b = BASE[type] || BASE.home, p = work ? b.pick : WEEKEND, r = work ? b.ret : WEEKEND;
    return { pick: p.map(function (v) { return v * scale; }), ret: r.map(function (v) { return v * scale; }) };
  }

  /** 模拟。返回按小时排的记录（每条：day, hr, work, bikes0（这一小时开始时的车数）, pick（成功取车）, ret（成功还车）,
   *  avail（有车的分钟数）, full（桩满的分钟数）, lamP / lamR（这一小时真实的强度，含当天的因子）, wantP / wantR（真实想取 / 想还的人数）, moved（调度：正数是补车）） */
  function simulate(opt, rng) {
    var o = {}, k; for (k in DEFAULTS) o[k] = DEFAULTS[k]; for (k in opt || {}) if (opt[k] != null) o[k] = opt[k];
    var recs = [], bikes = o.target, d, h;
    for (d = 0; d < o.days; d++) {
      var wd = d % 7, work = wd < 5 ? 1 : 0;                       // 第 0 天是周一
      var m = Math.exp(o.daySd * rng.normal(0, 1) - o.daySd * o.daySd / 2);   // 均值为 1
      var R = rates(o.type, work, o.scale * m);
      for (h = 0; h < 24; h++) {
        var moved = 0;
        if (h === 5 && o.rebalance) { moved = o.target - bikes; bikes = o.target; }
        var lp = R.pick[h], lr = R.ret[h], tot = lp + lr, t = 0, rec = { day: d, hr: h, work: work, bikes0: bikes, pick: 0, ret: 0, avail: 0, full: 0, lamP: lp, lamR: lr, wantP: 0, wantR: 0, moved: moved };
        while (true) {
          var dt = tot > 0 ? rng.exp(tot) : Infinity;                // 下一个人什么时候来（单位：小时）
          var nt = Math.min(1, t + dt);
          if (bikes > 0) rec.avail += (nt - t) * 60;
          if (bikes >= o.cap) rec.full += (nt - t) * 60;
          t = nt; if (t >= 1) break;
          if (rng.u() < lp / tot) { rec.wantP++; if (bikes > 0) { bikes--; rec.pick++; } }
          else { rec.wantR++; if (bikes < o.cap) { bikes++; rec.ret++; } }
        }
        recs.push(rec);
      }
    }
    return { opt: o, recs: recs, base: { work: rates(o.type, 1, o.scale), weekend: rates(o.type, 0, o.scale) } };
  }

  /** 按小时估计工作日的取车强度，四种做法：
   *  naive：观测到的取车数的平均；dropped：只用整小时都有车的那些小时；offset：Σ取车 / Σ有车的小时数（Poisson 过程只在有车时被观测到的 MLE）；
   *  truth：真实强度 λ 的平均（上帝视角） */
  function estimate(sim, work) {
    var out = { naive: [], dropped: [], offset: [], truth: [], stockout: [], n: [] }, h;
    for (h = 0; h < 24; h++) {
      var n = 0, sp = 0, sl = 0, nd = 0, spd = 0, sa = 0, so = 0;
      sim.recs.forEach(function (r) {
        if (r.hr !== h || r.work !== work) return;
        n++; sp += r.pick; sl += r.lamP; sa += r.avail / 60;
        if (r.avail >= 60 - 1e-9) { nd++; spd += r.pick; } else so++;
      });
      out.n.push(n); out.naive.push(sp / n); out.dropped.push(nd ? spd / nd : NaN); out.offset.push(sa > 0 ? sp / sa : NaN); out.truth.push(sl / n); out.stockout.push(so / n);
    }
    return out;
  }

  /** 决策：早上 5 点该补到多少辆车。用某一组每小时的强度（pick / ret，长度 24），在 [from, to) 这几个小时里模拟 reps 个早上，
   *  算每个起始车数 B = 0…cap 的期望成本：每个没取到车的人 cu，到 to 点时每辆闲着的车 co。返回 { costs, best } */
  function morningCosts(pick, ret, cap, from, to, cu, co, reps, rng) {
    var costs = [], B, rep;
    for (B = 0; B <= cap; B++) {
      var c = 0;
      for (rep = 0; rep < reps; rep++) {
        var bikes = B, lost = 0;
        for (var h = from; h < to; h++) {
          var lp = pick[h], lr = ret[h], tot = lp + lr, t = 0;
          while (tot > 0) {
            t += rng.exp(tot); if (t >= 1) break;
            if (rng.u() < lp / tot) { if (bikes > 0) bikes--; else lost++; }
            else if (bikes < cap) bikes++;
          }
        }
        c += cu * lost + co * bikes;
      }
      costs.push(c / reps);
    }
    var best = 0; for (B = 1; B <= cap; B++) if (costs[B] < costs[best]) best = B;
    return { costs: costs, best: best };
  }

  return { simulate: simulate, estimate: estimate, morningCosts: morningCosts, rates: rates, DEFAULTS: DEFAULTS, BASE: BASE, WEEKEND: WEEKEND };
})();
if (typeof module !== "undefined" && module.exports) module.exports = QLCASE_DOCK;
