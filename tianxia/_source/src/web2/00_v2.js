// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 网页版 v2（合并操作的新版，部署在 tianxia-v2/；只在 node build.js web2 的构建里） =====================
 * 和旧版（tianxia/）分开：联网用自己的命名空间（对局列表、房间互不相通），本机存档、设置、教学进度用自己的键（tianxia2.*）。
 * AI 接入的设置（'tianxia.ai'）和联网身份（'tianxia.web.uid'）两版共用：接入一次，两版都能用。 */
window.TX_V2 = true;
window.TX_NS = 'tianxia-web/v2';
window.TX_LSP = 'tianxia2';
