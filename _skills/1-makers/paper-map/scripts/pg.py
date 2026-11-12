# Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
# Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
import sys,re
# usage: pg.py FILE.txt PAGE [PAGE2]  -> print pages
t=open(sys.argv[1],encoding='utf-8',errors='replace').read()
parts=re.split(r'<<<page (\d+)>>>',t)
pages={int(parts[i]):parts[i+1] for i in range(1,len(parts),2)}
a=int(sys.argv[2]); b=int(sys.argv[3]) if len(sys.argv)>3 else a
for p in range(a,b+1):
    print(f'=== p.{p} ==='); print(pages.get(p,'(none)'))
