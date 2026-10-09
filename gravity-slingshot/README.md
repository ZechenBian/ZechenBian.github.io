# 引力弹弓 · Gravity Slingshot

[中文](#中文) · [English](#english)

一个关于轨道力学的浏览器小游戏：拉弓发射探测器，借行星引力变轨，把它送进目标环。15 关，全部经暴力搜索验证可解。纯 HTML + Canvas，单文件，无依赖。

A browser puzzle game about orbital mechanics: pull back, launch a probe, bend its path with planetary gravity, and land it in the target ring. 15 levels, every one verified solvable by brute-force search. Pure HTML + Canvas, one file, zero dependencies.

**▶ 在线玩 / Play online:** https://zechenbian.github.io/gravity-slingshot/


---

## 中文

### 怎么玩

**目标**：把探测器送进青色的目标环。顺路收集金色星星。

| 操作 | 效果 |
|---|---|
| 在发射台按住、往后拉、松手 | 发射。拉得越远初速越大（最大 180 px）。橙色虚线是实时预测轨迹：`×` = 会撞毁，`○` = 会飞出屏幕，`◎` = 会命中 |
| 飞行中在屏幕任意处按住拖动 | **点火**（变轨）。紫色线是点火后的新轨迹，松手执行。默认进入慢动作 |
| 飞行中在发射台附近按住 | 丢弃当前探测器，立刻重新发射（不用等它撞毁或超时） |
| `空格` / 快进 | 3 倍速 |
| `R` / 重置 | 世界回到初始状态（小行星、行星质量、时间），本轮发射计数清零 |
| `Enter` | 通关后进入下一关 |
| `⚙` | 设置：随机小行星、预测线长度、慢动作、尾迹、音效、清除记录 |
| `EN` / `中` | 切换语言 |

**失败不扣分**：撞毁、飞出屏幕、被引力捕获（超时）都只是丢掉这一枚探测器，世界继续运行，直接再拉一次。每关记录最少发射次数和最多星星数；集满星星的关卡在底部编号里显示金色。

### 物理

- 行星引力 `a = M / r²`（G = 1），四阶细分的半隐式欧拉积分。
- **火箭方程**：探测器干质量 1，燃料是额外质量。点火时 `Δv = vₑ · ln(m₀ / m₁)`，vₑ = 6。燃料越少、质量越轻，同样的燃料换来的 Δv 越多。探测器自身质量不影响它受到的引力加速度（等效原理），只影响推力效果。
- **行星质量会变，引力随之变，轨道随之漂**：
  - *脉冲星*：`M(t) = M₀ (1 + A sin 2πt/T)`
  - *蒸发*：`M(t) = M₀ e^{−t/τ}`
  - *吸积*：带气体阻力的小行星一颗颗螺旋坠入行星，每次撞击 `M += 220`
- *反引力星*：负质量，把你推开。
- 小行星本身没有引力，但撞上就毁。随机小行星（设置里开）绕最近的行星做近圆轨道运动。

### 关卡

| # | 名称 | 新机制 |
|---|---|---|
| 1 | 热身 | 直线发射 |
| 2 | 绕行 | 单行星弯折 |
| 3 | 回旋镖 | 目标在身后，绕一圈回来 |
| 4 | 点火 | 引入燃料与途中点火 |
| 5 | 卫星 | 运动的月亮，随时重发射 |
| 6 | 反引力 | 负质量行星 |
| 7 | 走廊 | 三行星蛇形 |
| 8 | 引力井 | 紧贴巨行星的目标 |
| 9 | 小行星带 | 公转的小行星环 |
| 10 | 脉冲星 | 质量周期涨落 |
| 11 | 蒸发 | 质量指数衰减 |
| 12 | 吸积 | 行星越来越重 |
| 13 | 移动目标 | 目标公转 |
| 14 | 双月 | 两颗反相位月亮 |
| 15 | 终局 | 反引力 + 脉冲 + 小行星带 |

### 自己加关卡

```
src/
  physics.js    共享物理（游戏和求解器用同一份）
  levels.js     关卡定义（改这里）
  solve.js      暴力求解器：验证可解 + 自动沿真实可赢轨迹放星星 → levels.json
  template.html 页面模板
build.js        把 physics.js 和 levels.json 内联进模板，生成 index.html
```

```bash
# 编辑 src/levels.js 后：
node src/solve.js   # 每关扫 5580 种发射（角度 2° × 速度 0.25 步长），输出胜率和星数
node build.js       # 生成 index.html
```

求解器只用纯弹道（不点火）验证，所以点火永远是"帮手"而非必需。动态关卡还会检查晚发射（t₀ = 80/160/240/320）时是否仍有解。

---

## English

### How to play

**Goal**: get the probe into the teal target ring. Collect the gold stars on the way.

| Action | Effect |
|---|---|
| Press on the launch pad, pull back, release | Launch. Farther pull = faster (max 180 px). The orange dotted line is the live predicted path: `×` = will crash, `○` = will leave the screen, `◎` = will hit the target |
| In flight, press and drag anywhere | **Burn** (change orbit). The purple line shows the new path; release to fire. Time slows down by default |
| In flight, press near the launch pad | Discard the current probe and relaunch immediately (no need to wait for a crash or timeout) |
| `Space` / Fast | 3× speed |
| `R` / Reset | Restore the world (asteroids, planet masses, time) and reset this run's launch count |
| `Enter` | Next level after clearing |
| `⚙` | Settings: random asteroids, prediction length, slow-mo, trail, sound, clear records |
| `EN` / `中` | Switch language |

**Failure costs nothing**: crashing, leaving the screen, or getting captured (timeout) only loses that one probe; the world keeps running and you just pull again. Each level records your fewest launches and most stars; levels with all stars collected show gold in the level strip.

### Physics

- Planetary gravity `a = M / r²` (G = 1), semi-implicit Euler with 4 substeps.
- **Rocket equation**: dry mass 1, fuel is extra mass. A burn gives `Δv = vₑ · ln(m₀ / m₁)` with vₑ = 6. The lighter the ship, the more Δv the same fuel buys. The probe's own mass does not change the gravitational acceleration it feels (equivalence principle); it only changes what a burn does.
- **Planet masses change, gravity changes with them, orbits drift**:
  - *Pulsar*: `M(t) = M₀ (1 + A sin 2πt/T)`
  - *Evaporating*: `M(t) = M₀ e^{−t/τ}`
  - *Accretion*: asteroids under gas drag spiral into the planet one by one; each impact adds `M += 220`
- *Repulsor*: negative mass, pushes you away.
- Asteroids have no gravity of their own but destroy you on contact. Random asteroids (settings) move on near-circular orbits around the nearest planet.

### Levels

| # | Name | New mechanic |
|---|---|---|
| 1 | Warm-up | Straight shot |
| 2 | Flyby | One planet bends the path |
| 3 | Boomerang | Target behind you; whip around and back |
| 4 | Ignition | Fuel and mid-flight burns |
| 5 | Moon | Moving moon; relaunch any time |
| 6 | Repulsor | Negative-mass planet |
| 7 | Corridor | Snake through three planets |
| 8 | Gravity Well | Target hugging a giant planet |
| 9 | Asteroid Belt | Orbiting ring of asteroids |
| 10 | Pulsar | Oscillating mass |
| 11 | Evaporating | Exponentially decaying mass |
| 12 | Accretion | Planet keeps getting heavier |
| 13 | Moving Target | Target in orbit |
| 14 | Two Moons | Two moons, opposite phases |
| 15 | Finale | Repulsor + pulsar + asteroid belt |

### Adding levels

```
src/
  physics.js    shared physics (game and solver use the same code)
  levels.js     level definitions (edit this)
  solve.js      brute-force solver: verifies solvability and places stars along a real winning path → levels.json
  template.html page template
build.js        inlines physics.js and levels.json into the template → index.html
```

```bash
# after editing src/levels.js:
node src/solve.js   # sweeps 5580 launches per level (2° angle × 0.25 speed steps), prints win rate and stars
node build.js       # writes index.html
```

The solver verifies with pure ballistic shots (no burns), so burns are always a help, never a requirement. Dynamic levels are also checked for solvability at later launch times (t₀ = 80/160/240/320).

---

## 版权 / Copyright

© 2026 Zechen Bian. 保留所有权利 / All rights reserved.

本项目**不是开源项目**。可以在线游玩，但未经书面许可，不得复制、修改、再分发、商用或用于 AI/机器学习训练。详见 [LICENSE](../LICENSE)。

This project is **not open source**. You are welcome to play it online, but you may not copy, modify, redistribute, use commercially, or use it to train AI/ML models without written permission. See [LICENSE](../LICENSE).

Built with Claude.
