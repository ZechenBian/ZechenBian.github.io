// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 网页版 v3（行动力按百分比的新版，部署在 tianxia-v3/；只在 node build.js web3 的构建里） =====================
 * 在 v2（合并操作、六个页签、统一输入框）之上：行动点改成每回合 100% 的行动力，每项行动占一定百分比，
 * 花钱的行动按金额占本国 GDP 的比例多占（规则见 src/engine/06_turn.js 的“规则 v3”）。
 * 和 v1、v2 分开：联网用自己的命名空间，本机存档、设置、教学进度用自己的键（tianxia3.*）；AI 接入的设置与联网身份三版共用。 */
window.TX_V3 = true;
window.TX_NS = 'tianxia-web/v3';
window.TX_LSP = 'tianxia3';
window.TX_RULES3 = true;
// 中国领土上不允许外国驻军（TX_NOBASE）原来在这里打开，现在移到了 v1 那一层（src/web/03_world.js），四个版本都有
