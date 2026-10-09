#!/bin/sh
# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
# 跑全部测试：先是 Node 里的引擎与数值核对，再是无头浏览器里的界面测试
cd "$(dirname "$0")/.." || exit 1
python3 build.py || exit 1
fail=0
for t in engine worker io ml ai claims model-claims games games-worker obs human guide; do
  out=$(node test/$t.test.js 2>&1); line=$(echo "$out" | grep -E "passed, [0-9]+ failed" | tail -1)
  echo "$t: $line"; echo "$out" | grep -E "^\s+FAIL|CRASH" ; echo "$line" | grep -q ", 0 failed" || fail=1
done
# ui-obs 排第一个：它不用存档、把现算从头跑一遍，算完的结果留在 test/.cache/ 里，后面几个测试接着用
for t in ui-obs ui-tour ui-claude ui-data ui-models ui-explain ui-games ui-human ui-guide ui-review2 ui-review3 ui-review4; do
  out=$(node test/$t.js 2>&1); line=$(echo "$out" | grep -E "passed, [0-9]+ failed|TOTAL LOGS|CRASH" | tail -1); logs=$(echo "$out" | grep -E "^page logs:|TOTAL LOGS" | tail -1)
  echo "$t: $line | $logs"; echo "$out" | grep -E "^\s+FAIL|CRASH"; echo "$out" | grep -qE "[1-9][0-9]* failed|CRASH" && fail=1
done
out=$(node test/ui-responsive.js 2>&1); echo "ui-responsive: $(echo "$out" | tr '\n' ';' | cut -c1-400)"; echo "$out" | grep -q "OVERFLOWING\|CRASH\|logs:" && fail=1
out=$(node test/ui-models-shots.js 2>&1); echo "ui-models-shots: $(echo "$out" | tr '\n' ';' | cut -c1-400)"; echo "$out" | grep -q "OVERFLOWING\|CRASH" && fail=1
out=$(node test/ui-guide-responsive.js 2>&1); echo "ui-guide-responsive: $(echo "$out" | tail -3 | tr '\n' ';' | cut -c1-400)"; echo "$out" | grep -q "OVERFLOWING\|CRASH\|PROBLEMS\|wrong" && fail=1
# 独立的网页版 index.html：不在 Claude 里、连不上外面的网站时也要能用
out=$(node test/ui-standalone.js 2>&1); echo "ui-standalone: $(echo "$out" | grep -E "passed, [0-9]+ failed|CRASH" | tail -1)"; echo "$out" | grep -E "^\s+FAIL|CRASH"; echo "$out" | grep -qE "[1-9][0-9]* failed|CRASH" && fail=1
# 独立网页版里的 AI 面板：接入一家服务商（本机的假接口）之后四种用法都能用
out=$(node test/ui-ai.js 2>&1); echo "ui-ai: $(echo "$out" | grep -E "passed, [0-9]+ failed|CRASH" | tail -1)"; echo "$out" | grep -E "^\\s+FAIL|CRASH"; echo "$out" | grep -qE "[1-9][0-9]* failed|CRASH" && fail=1
out=$(node test/ui-en.js 2>&1); echo "ui-en: $(echo "$out" | grep -E "passed, [0-9]+ failed|CRASH" | tail -1)"; echo "$out" | grep -E "^\\s+FAIL|CRASH"; echo "$out" | grep -qE "[1-9][0-9]* failed|CRASH" && fail=1
[ $fail = 0 ] && echo "ALL GREEN" || echo "SOMETHING FAILED"
exit $fail
