// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 网页版 v4（部署在 tianxia-v4/；只在 node build.js web4 的构建里） =====================
 * 在 v3（行动力按百分比、六个页签、统一输入框、协议回合结束时结算）之上：
 *   · 房间名与昵称按国内账号名称的现行规定过滤，房间可以设密码（对局内容用密码派生的密钥加密）——src/web4/01b_v4net.js、ui/04z9a_v4room.js
 *   · 十个单机任务：指定年代、国家、目标与期限，一回合按半年或一年连算几个季度，目标一达成就判定——ui/04z9b_v4mission.js
 *   · 每回合的“局势说明”：国力各项为什么变了（国内政策、对外行动、战争、世界局势）——ui/04z9c_v4explain.js
 *   · 简化模式（新手）、详细教程与行动手册、地图动画——ui/04z9d…f
 * 和 v1–v3 分开：联网用自己的命名空间（对局列表、房间互不相通），本机存档、设置、教学进度用自己的键（tianxia4.*）；AI 接入的设置与联网身份各版共用。 */
window.TX_V4 = true;
window.TX_NS = 'tianxia-web/v4';
window.TX_LSP = 'tianxia4';
