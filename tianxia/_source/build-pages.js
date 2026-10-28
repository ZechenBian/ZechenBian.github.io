// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 构建网站上的四个版本：用 build.js 的四个网页版目标，把结果直接写进仓库里各版本的目录。
//   web  → tianxia/index.html      (v1)
//   web2 → tianxia-v2/index.html   (v2)
//   web3 → tianxia-v3/index.html   (v3)
//   web4 → tianxia-v4/index.html   (v4)
// 每个目录里的 auth.html（AI 一键授权的回调页）和 ai-proxy.mjs（玩家自建的 AI 中继）也从 src/web/ 复制过去。
// 各版本的开关在哪个文件里，见仓库根目录 CLAUDE.md 的「天下棋局」一节。
// 用法：node build-pages.js（在 tianxia/_source/ 里运行）
"use strict";
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const EDITIONS = [["web", "tianxia"], ["web2", "tianxia-v2"], ["web3", "tianxia-v3"], ["web4", "tianxia-v4"]];
const COPIED = ["auth.html", "ai-proxy.mjs"];

for (const [target, dir] of EDITIONS) {
  execFileSync(process.execPath, ["build.js", target], { cwd: __dirname, stdio: "inherit" });
  fs.copyFileSync(path.join(__dirname, "out", `tianxia_${target}.html`), path.join(ROOT, dir, "index.html"));
  for (const f of COPIED) fs.copyFileSync(path.join(__dirname, "src/web", f), path.join(ROOT, dir, f));
  console.log(`  → ${dir}/index.html, ${COPIED.map((f) => dir + "/" + f).join(", ")}`);
}
