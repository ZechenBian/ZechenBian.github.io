<!-- Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。 -->
<!-- Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。 -->
# 深夜解压铺

十三个点一点、划一划就能放松的小玩具，放在一个页面里：泡泡纸、流沙字、电子木鱼、切切乐等。网址 `/jieya/`。
不联网、不上传任何东西；进度和偏好只存在本机浏览器（localStorage，键名以 `jieya:` 开头）。

## 文件

| 文件 | 作用 |
|---|---|
| `src/template.html` | 页面外壳：样式、顶栏（玩具货架）、舞台、页脚 |
| `src/core.js` | 公共核心 `window.J`：注册玩具、切换、音效、画布、存储 |
| `src/toys/NN-<id>.js` | 每个玩具一个文件；文件名前的两位数字就是货架上的顺序 |
| `build.js` | 把上面这些拼成 `index.html`（构建产物，不要手改） |

改完源码，在本目录运行 `node build.js`，把源码和 `index.html` 放进同一个提交。

## 玩具的约定

每个玩具是一段立即执行的函数，最后调用一次 `J.register({...})`：

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 英文短名，也用作网址的 `#id` 和存储键 |
| `name` | 是 | 货架上显示的中文名 |
| `hint` | 否 | 进入时舞台顶部的一句提示，第一次按下后淡出 |
| `create(root)` | 是 | 第一次进入时调用一次，在 `root` 里建画布或 DOM |
| `resize(W, H)` | 否 | 舞台尺寸变化时调用 |
| `enter()` / `leave()` | 否 | 切进 / 切出时调用 |
| `tick(now, dt)` | 否 | 只有当前玩具每帧被调用 |
| `key(e)` | 否 | 键盘事件；返回 `true` 表示已处理 |
| `actions` | 否 | 页脚按钮：`{label, run, on?}`，`label` 可以是函数 |
| `stat()` | 否 | 页脚左侧的统计文字（HTML）；内容变了就调用 `J.stat()` 请求刷新 |

`J` 提供的工具：`J.canvas(root)`（按设备像素比自适应的画布）、`J.sfx.tone()` / `J.sfx.noise()`（合成音效，全局静音开关已处理）、`J.store`（带 `jieya:` 前缀、出错不抛的 localStorage）、`J.buzz(ms)`（震动）、`J.css(text)`（注入样式）、`J.local(e, el)`（指针坐标）、`J.fmt(n)`、`J.C`（配色）。

© 2026 Zechen Bian · All rights reserved / 保留所有权利
