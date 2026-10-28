# 第三方材料 / Third-party materials

天下棋局本身保留所有权利（见仓库根目录 [LICENSE](../../LICENSE)）。下面这些第三方材料不属于本项目，按各自的许可使用。
Tianxia itself is all rights reserved (see [LICENSE](../../LICENSE)). The third-party materials below are not part of it and are used under their own terms.

| 材料 / Material | 在哪里 / Where | 用途 / Use | 许可 / Terms |
|---|---|---|---|
| [Natural Earth](https://www.naturalearthdata.com/) 1:10m、1:50m、1:110m 国界（含中国视角版本 `_chn`） | `build/ne/geojson/`，原样 / unmodified | `build/` 里的脚本从它生成地图数据 `src/geo.js`、`src/geo_cn.js`、`src/cities.js` | 公共领域 / Public domain |
| [d3-geo](https://github.com/d3/d3-geo) 3.1.1 | 不在仓库里，`npm install` 安装 / installed by `npm install` | 只在生成地图数据时用于投影，不进页面 / map projection at build time only, not shipped in pages | ISC |
| Google Fonts（Noto Sans SC、Noto Serif SC、IBM Plex Mono） | 页面运行时从 Google 加载 / loaded at runtime | 字体 / typefaces | SIL Open Font License 1.1 |
