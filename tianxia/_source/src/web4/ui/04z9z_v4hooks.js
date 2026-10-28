// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 网页版 v4 · 测试钩子（只读或触发界面函数；界面代码在一个闭包里，测试从这里调用） */
try { window.__TX4 = { showReport: R => showReport(R), setLang: l => setLang(l), renderAll: () => renderAll(), endTurn: () => mpEndTurn(), closeModal: () => closeModal(), select: id => select(id), showStart: () => mpShowStart(), showMissions: () => v4mShowList(), missionResult: () => v4mShowResult(), missionBrief: (id, live) => v4mShowBrief(id, !!live), fx: () => ({ pending: V4F.pending, last: V4F.last, turn: V4F.turn }), fxPlay: () => v4fPlay(V4F.last), animLevel: () => animLevel() }; } catch (e) { }
