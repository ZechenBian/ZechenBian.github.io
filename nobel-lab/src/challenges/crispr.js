/* 细菌的记忆 — 挑战版（Nobel Chemistry 2020: Charpentier & Doudna, a method for genome editing）
 * 时代 2005–2012。读者依次重新发现：间隔序列来自噬菌体 DNA（Mojica 2005；Barrangou & Horvath 2007）、
 * PAM（NGG）、种子区（PAM 近端错配才致逃逸），最后把系统改造成基因编辑工具（Jinek et al. 2012）。
 *
 * 所有序列都是用固定种子的 mulberry32 随机生成的虚构序列（无任何真实病原体序列），并已离线验证：
 *  - 噬菌体 A 带 spacer2 的完全匹配 protospacer + PAM AGG（被免疫）
 *  - 噬菌体 B 在反向互补链上带 spacer4 的完全匹配 + 下链 PAM CGG（被免疫）
 *  - 噬菌体 C 带 spacer1 的完全匹配，但 3′ 侧为 AAC（PAM 突变）→ 仍能感染，留给第二关
 *  - 噬菌体 D 只有 80% 相似（6/30 错配）+ AGG → 仍能感染
 * SpCas9 规则：PAM = 非靶（上）链 5′-NGG-3′，紧接 20 nt protospacer 的 3′ 端；
 *   平末端双链断裂在 PAM 上游 3 bp（protospacer 第 17|18 位之间）；
 *   sgRNA 的间隔段 = protospacer 同序（T→U），因为它与<b>另一条</b>链配对。
 */
(() => {
  const REPEAT = 'AATAGGGGTAGTCACCTTGCGACTACTTAT';
  const SPACERS = [
    'CACCCTACAAGGTCTGCTTTCGTTTGGGGC',
    'TTTCGGTGACAACGTTTACCATATGGCGGT',
    'AAGCGAGATGTATCGTTCTAAGCGTTTCGA',
    'GACGTGACAACGGAGTCCAGAAGAGCCAGT',
    'TGATCCAGACAATGCAACAGGACTCTGCCG',
  ];
  const PHAGE = {
    A: 'CTTCTACTGTAGTTCTAGCTTAACTCCCCTTTCGGCTGGCTTTCGGTGACAACGTTTACCATATGGCGGTAGGGGTGTACCCCATATGCCGTGGTGGAAGACTAAACAATTTCTCCTTATTGATCTGCACCGCACTAGGAATCGCAGTCA',
    B: 'AAATCGGCGGTAGGAGTACAGCGTCTAACAAAACAGATATGTGCAGCACCCAACTATGACGGCCGACTGGCTCTTCTGGACTCCGTTGTCACGTCAAACTCGCCTGATCCTCGTCTTGTGTTAAAGGAGGGGCCATCATTGTGTATCCAT',
    C: 'TGATGGGGGCAACGCTTCCTGAAGACGGGCAGACGTAGCGCAACGGTTACGACTTCACCCTACAAGGTCTGCTTTCGTTTGGGGCAACAGTCACTTTTTTGTGCTTTGAAGGACATGATATTATAGCTACCTATTGTTGAGGGAGCGCGC',
    D: 'AAGCCAAATGTCCTGAGCCATATTAGGAACAAGGGAACTTTTATAACTAACCGAGTTGTCTCGTGCTAAGTGTTTTGAAGGAAACCGTGGCACGTTATCGAGCAAACTAGCAACTTAGCTTTGAGGTTATCCCGAATGTTATTTACACTG',
  };
  const IMMUNE = { A: true, B: true, C: false, D: false }; // 第一关真值（感染实验的结果）
  /* 第二关：11 条已配对的 protospacer + 8 nt 的 3′ 侧翼，按结局标注 */
  const FLANKS = [
    ['CAAGTAGTCGCTGCCGGGTA', 'ATGTGGCA', 0], ['GCGGTTGTCGCAGTTTTATA', 'TGGGTACC', 1],
    ['AGATTCCCTTCAAATGTTGA', 'CGGTCGGG', 1], ['GCATCGGGGCTTAGCGCATA', 'TGGCAACT', 1],
    ['CTAGCAACATTCTGACCGGG', 'AGGTGTAA', 1], ['GGACGATTCCCGGGCGCCGC', 'GATAAACG', 0],
    ['CGAGCTTTCGTCTCACCCGG', 'AACTAATA', 0], ['AATATGTGGAATCGTTATTA', 'TGATAGCT', 0],
    ['CAATTTCGTATCGTTTTTTT', 'GGGGATAC', 1], ['AACCTGCAAGCTGGCTCCTG', 'CCTACCAA', 0],
    ['ACTCACATGTTCGATCGTGG', 'AGGACCGG', 1],
  ];
  /* 第四关：虚构的"类人基因"片段，80 bp；上链 PAM（NGG，且上游有 20 nt）位于 0 基索引 39,44,47,48,66 */
  const TARGET = 'TCTTTGAACGGCGTGGGTGTATTCGTAATACTCATGACATGGCTCGGTGGGAACGCTCTCGTACAGAGGCACAATGATCG';

  const COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };
  const rc = (s) => s.split('').reverse().map((c) => COMP[c]).join('');
  const comp = (s) => s.split('').map((c) => COMP[c]).join('');
  function findAll(hay, needle) { const r = []; let i = hay.indexOf(needle); while (i >= 0) { r.push(i); i = hay.indexOf(needle, i + 1); } return r; }
  /* 最佳近似匹配（滑窗 Hamming），返回 [{at, d}]，d ≤ maxD 且非完全匹配 */
  function nearMatches(hay, needle, maxD) {
    const out = [];
    for (let i = 0; i + needle.length <= hay.length; i++) {
      let d = 0;
      for (let k = 0; k < needle.length; k++) { if (hay[i + k] !== needle[k]) { d++; if (d > maxD) break; } }
      if (d > 0 && d <= maxD) out.push({ at: i, d });
    }
    // 去掉重叠的次优窗口，保留局部最好的
    return out.filter((m) => !out.some((o) => Math.abs(o.at - m.at) < needle.length && (o.d < m.d || (o.d === m.d && o.at < m.at))));
  }
  const isPAM3 = (s) => s.length >= 3 && s[1] === 'G' && s[2] === 'G';

  const CSS = `.crc-scroll{overflow-x:auto;overflow-y:hidden;border:1px solid var(--line);border-radius:8px;background:var(--panel);padding:8px 10px}
.crc-seq{font-family:var(--mono-font,monospace);font-size:12.5px;line-height:1.75;white-space:pre;letter-spacing:.5px}
.crc-lab{font-size:11.5px;color:var(--muted);font-family:var(--mono-font,monospace);margin-bottom:2px}
.crc-rep{color:var(--muted)}
.crc-sp{font-weight:700}
.crc-sp0{color:var(--s1)}.crc-sp1{color:var(--s2)}.crc-sp2{color:var(--s3)}.crc-sp3{color:var(--s4)}.crc-sp4{color:var(--accent)}
.crc-hit{background:color-mix(in srgb,var(--good) 42%,transparent);border-radius:2px}
.crc-near{background:color-mix(in srgb,var(--warn) 34%,transparent);border-radius:2px}
.crc-pam{background:color-mix(in srgb,var(--accent) 45%,transparent);border-radius:2px;font-weight:700}
.crc-card{border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin:8px 0;background:var(--panel)}
.crc-card>h4{margin:0 0 4px;font-size:13.5px;font-weight:600}
.crc-chk{display:flex;flex-wrap:wrap;gap:6px 16px;margin:6px 0}
.crc-chk label{display:flex;align-items:center;gap:6px;font-size:13.5px;cursor:pointer}
.crc-chk input{accent-color:var(--accent);width:15px;height:15px}
.crc-logo{display:grid;grid-template-columns:repeat(8,minmax(26px,1fr));gap:3px;min-width:260px}
.crc-col{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:92px}
.crc-bar{width:100%;display:flex;flex-direction:column;justify-content:flex-end}
.crc-b{font-family:var(--mono-font,monospace);font-size:10px;line-height:1;text-align:center;color:var(--bg);overflow:hidden}
.crc-bA{background:var(--s1)}.crc-bC{background:var(--s2)}.crc-bG{background:var(--accent)}.crc-bT{background:var(--s3)}
.crc-pos{font-size:10.5px;color:var(--muted);font-family:var(--mono-font,monospace);margin-top:3px}
.crc-seed{display:grid;grid-template-columns:repeat(20,minmax(0,1fr));gap:2px;min-width:300px}
.crc-cell{aspect-ratio:1/1.5;border:1px solid var(--line);border-radius:3px;background:var(--bg);font-family:var(--mono-font,monospace);font-size:10px;color:var(--muted);cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center}
.crc-cell[aria-pressed=true]{background:color-mix(in srgb,var(--warn) 55%,transparent);color:var(--fg);border-color:var(--warn)}
.crc-ends{display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted);margin-top:3px}
.crc-dna{position:relative;font-family:var(--mono-font,monospace);font-size:13px;line-height:1.9;white-space:pre}
.crc-base{padding:0;border:0;background:none;font:inherit;color:var(--fg);cursor:default}
.crc-pamb{cursor:pointer;color:var(--accent);font-weight:700;text-decoration:underline dotted}
.crc-pamb[aria-pressed=true]{background:color-mix(in srgb,var(--accent) 45%,transparent)}
.crc-prot{background:color-mix(in srgb,var(--s1) 24%,transparent)}
.crc-cutb{cursor:pointer;border-left:2px solid transparent}
.crc-cutb[aria-pressed=true]{border-left-color:var(--warn);background:color-mix(in srgb,var(--warn) 30%,transparent)}
.crc-cod{background:color-mix(in srgb,var(--fg) 7%,transparent)}
.crc-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}
.crc-sel{font:inherit;font-size:13px;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:5px 8px}
.crc-mono{font-family:var(--mono-font,monospace)}
.crc-tag{font-size:11.5px;padding:1px 6px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
.crc-tag.cut{color:var(--good);border-color:color-mix(in srgb,var(--good) 55%,var(--line))}
.crc-tag.esc{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 55%,var(--line))}`;

  function injectCSS() { if (!document.getElementById('st-crispr')) document.head.append(H.el('style', { id: 'st-crispr', text: CSS })); }

  CHALLENGES.crispr = {
    title: '细菌的记忆',
    mount(root, ctx) {
      injectCSS();
      const h = ctx.h;

      /* ============ 第一关：间隔序列从哪来？ ============ */
      const stage1 = {
        title: '间隔序列从哪来？',
        task: `2005 年。细菌基因组里有一片怪结构：一段 30 nt 的序列一模一样地重复出现几十次，
          每两次重复之间夹着一段<b>长度相同但彼此都不一样</b>的"间隔序列"。没人知道它干什么用。
          <p>你手上有这个菌株的 CRISPR 阵列（5 段间隔序列），还有四株噬菌体的基因组片段，
          以及一张感染实验表：把每株噬菌体分别加到这个菌株上，看菌被杀光（敏感）还是活下来（免疫）。</p>
          <p><b>任务</b>：用下面的搜索工具，把每段间隔序列拿去比对四株噬菌体（别忘了噬菌体是双链的，
          匹配也可能落在反向互补链上）。然后勾出这个菌株<b>免疫</b>的噬菌体——
          注意匹配本身未必够，看看表和序列对不对得上。`,
        hints: [
          '先一段一段搜。完全匹配（绿色）出现在 A、B、C 三株里，其中 B 要勾上"也搜索反向互补"才看得见；D 只有 80% 相似（黄色）。',
          '对照感染表：A 和 B 免疫，C 和 D 不免疫。可 C 明明带着一段 30 nt 的完全匹配——所以"有匹配"不等于"能免疫"，匹配之外还缺一个条件。',
          '免疫的是 <b>A 和 B</b>。C 的匹配序列紧挨着的那三个碱基是 AAC，而 A（AGG）、B（下链 CGG）那里都是 NGG——这个线索下一关才展开。D 只有 24/30 相同，差太多，记忆认不出来。',
        ],
        answer: `免疫的是 <b>噬菌体 A 和 B</b>。
          <p>A 的上链带 spacer 2 的 30 nt 完全匹配；B 的匹配在<b>反向互补链</b>上（spacer 4）。两者的匹配段紧邻一个 NGG。
          C 虽然带 spacer 1 的完全匹配，但其 3′ 侧翼是 AAC 而非 NGG，所以仍能感染（下一关的线索）；
          D 对 spacer 3 只有 24/30 = 80% 相同，不足以被识别。</p>
          <p>结论：间隔序列就是<b>从前入侵过的噬菌体身上截下来的一段 DNA</b>——CRISPR 阵列是一份按时间排列的、
          可遗传的感染档案，细菌靠它认出再次来犯的同一种噬菌体。</p>`,
        build(body, api) {
          const S = { sp: 0, revc: false, picked: new Set() };

          // 阵列显示
          const arr = h.el('div', { class: 'crc-seq' });
          function drawArray() {
            arr.textContent = '';
            arr.append(h.el('span', { class: 'crc-rep', text: '5′ ' }));
            SPACERS.forEach((sp, i) => {
              arr.append(h.el('span', { class: 'crc-rep', text: REPEAT }));
              arr.append(h.el('span', { class: 'crc-sp crc-sp' + i, text: sp, title: `间隔序列 ${i + 1}` }));
            });
            arr.append(h.el('span', { class: 'crc-rep', text: REPEAT + ' 3′' }));
          }
          drawArray();
          const arrBox = h.el('div', {}, [
            h.el('div', { class: 'crc-lab', text: '菌株的 CRISPR 阵列　灰 = 重复序列（30 nt，完全相同）　彩色 = 间隔序列 1–5（各 30 nt）' }),
            h.el('div', { class: 'crc-scroll' }, [arr]),
          ]);

          // 搜索控件
          const sel = h.el('select', { class: 'crc-sel', 'aria-label': '选择间隔序列',
            onchange: (e) => { S.sp = +e.target.value; render(); } },
            SPACERS.map((_, i) => h.el('option', { value: String(i), text: `间隔序列 ${i + 1}` })));
          const tRC = h.toggle({ label: '也搜索反向互补', onChange: (b) => { S.revc = b; render(); } });
          const ctl = h.el('div', { class: 'crc-row' }, [h.el('span', { class: 'crc-lab', text: '搜索：' }), sel, tRC.el]);

          // 噬菌体显示
          const phBox = h.el('div');
          function render() {
            phBox.textContent = '';
            const sp = SPACERS[S.sp], spr = rc(sp);
            let nExact = 0, nNear = 0;
            for (const k of Object.keys(PHAGE)) {
              const seq = PHAGE[k];
              const marks = new Array(seq.length).fill(null);
              const put = (at, len, cls) => { for (let i = at; i < at + len && i < seq.length; i++) if (!marks[i] || cls === 'crc-hit') marks[i] = cls; };
              findAll(seq, sp).forEach((at) => { put(at, 30, 'crc-hit'); nExact++; });
              if (S.revc) findAll(seq, spr).forEach((at) => { put(at, 30, 'crc-hit'); nExact++; });
              nearMatches(seq, sp, 6).forEach((m) => { put(m.at, 30, 'crc-near'); nNear++; });
              if (S.revc) nearMatches(seq, spr, 6).forEach((m) => { put(m.at, 30, 'crc-near'); nNear++; });
              const row = h.el('div', { class: 'crc-seq' });
              let i = 0;
              row.append(h.el('span', { class: 'crc-rep', text: '5′ ' }));
              while (i < seq.length) {
                let j = i; while (j < seq.length && marks[j] === marks[i]) j++;
                row.append(marks[i] ? h.el('span', { class: marks[i], text: seq.slice(i, j) }) : document.createTextNode(seq.slice(i, j)));
                i = j;
              }
              row.append(h.el('span', { class: 'crc-rep', text: ' 3′' }));
              phBox.append(h.el('div', { class: 'crc-card' }, [
                h.el('h4', { text: `噬菌体 ${k}　（${seq.length} nt）` }),
                h.el('div', { class: 'crc-scroll' }, [row]),
              ]));
            }
            info.innerHTML = `间隔序列 ${S.sp + 1}：找到 <b>${nExact}</b> 处完全匹配（绿）、<b>${nNear}</b> 处 ≥80% 近似匹配（黄）` +
              (S.revc ? '，已含反向互补链' : '，<span style="color:var(--muted)">只搜了上链</span>');
          }
          const info = h.el('div', { class: 'crc-lab', 'aria-live': 'polite', style: 'margin:6px 0' });

          // 感染实验表
          const tab = h.el('div', { class: 'dtable' }, [h.el('table', {}, [
            h.el('thead', {}, [h.el('tr', {}, ['噬菌体', '加到该菌株上', '菌落存活率'].map((t) => h.el('th', { text: t })))]),
            h.el('tbody', {}, Object.keys(PHAGE).map((k) => h.el('tr', {}, [
              h.el('td', { text: '噬菌体 ' + k }),
              h.el('td', { text: IMMUNE[k] ? '菌照常生长' : '菌被裂解杀光' }),
              h.el('td', { text: IMMUNE[k] ? '~95%' : '<0.1%' }),
            ]))),
          ])]);

          // 勾选
          const boxes = Object.keys(PHAGE).map((k) => {
            const inp = h.el('input', { type: 'checkbox', id: 'crc1-' + k });
            inp.addEventListener('change', () => { inp.checked ? S.picked.add(k) : S.picked.delete(k); });
            return h.el('label', { for: 'crc1-' + k }, [inp, '噬菌体 ' + k]);
          });
          const chk = h.el('div', { class: 'crc-chk' }, boxes);
          const fb = h.el('div', { class: 'crc-lab', 'aria-live': 'polite' });
          const check = h.button({
            label: '提交', kind: 'primary',
            onClick: () => {
              const truth = Object.keys(IMMUNE).filter((k) => IMMUNE[k]);
              const got = [...S.picked].sort().join(','), want = truth.sort().join(',');
              if (got === want) {
                fb.innerHTML = '';
                api.done(`<b>间隔序列是噬菌体 DNA 的拷贝。</b>Mojica 2005 年注意到间隔序列能在噬菌体和质粒基因组里找到同源序列，
                  猜它是一套遗传性的免疫记忆；Barrangou 与 Horvath 2007 年在嗜热链球菌里做实了因果——
                  往阵列里加一段噬菌体来源的间隔序列，菌就获得对该噬菌体的抗性；把它删掉，抗性就消失。
                  可你也看到了：C 带着完全匹配却照样感染，所以"记住"之外还有一道机关。`);
              } else if (!S.picked.size) fb.innerHTML = '<span style="color:var(--warn)">先勾选。</span>';
              else fb.innerHTML = `<span style="color:var(--warn)">不对。</span>你勾了 ${got || '（空）'}。先把每段间隔序列都搜一遍（记得反向互补），再回头看感染表哪两株的菌活下来了。`;
            },
          });

          body.append(arrBox, ctl, info, phBox,
            h.el('div', { class: 'crc-lab', text: '感染实验（数据）' }), tab,
            h.el('div', { class: 'crc-lab', style: 'margin-top:10px', text: '这个菌株对哪些噬菌体免疫？' }), chk,
            h.el('div', { class: 'crc-row' }, [check, fb]));
          render();
          return { destroy() {} };
        },
      };

      /* ============ 第二关：PAM ============ */
      const stage2 = {
        title: '为什么有的匹配不管用？',
        task: `上一关的噬菌体 C 让人不安：它带着一段 30 nt 的完全匹配，却照样把菌杀光。
          所以"序列记得住"不等于"切得动"。
          <p>于是你把许多噬菌体里<b>所有</b>与某段间隔序列配上的 protospacer 都挑出来（11 条），
          按实验结局分成两组：<b>被切</b>（菌免疫）与<b>逃逸</b>（菌被感染）。
          每条都连着它紧邻 3′ 端的 8 个碱基一起列出——如果机关在侧翼，它就在这 8 个位置里。</p>
          <p><b>任务</b>：对比两组在 +1…+8 各个位置上的碱基组成（下面有分组的碱基计数条），
          找出"被切"组共有而"逃逸"组没有的那个短基序，用三个下拉把 <b>+1、+2、+3</b> 填出来。
          A/C/G/T 表示必须是该碱基，<b>N</b> 表示任意碱基都行。</p>`,
        hints: [
          '只看"被切"那一组：+1 位 A、T、C、G 全都出现过，+2 和 +3 位却清一色是同一个碱基。',
          '再确认"逃逸"组：它们在 +2、+3 这两位上<b>从不</b>同时是那个碱基（噬菌体 C 那条是 AAC）。所以机关只有三位长，且第一位不挑。',
          '答案是 <b>N G G</b>：protospacer 3′ 端紧邻的三个碱基必须是"任意 + G + G"，否则酶根本不动手。',
        ],
        answer: `基序是 <b>N G G</b>（+1 任意、+2 与 +3 必须是 G）。
          <p>从计数看：6 条"被切"的 protospacer 在 +2、+3 位全是 G，而 +1 位四种碱基都出现过（A/T/C/G），
          说明 +1 不受约束；5 条"逃逸"的在 +2/+3 上至少有一位不是 G。</p>
          <p>这个紧邻 protospacer 3′ 端的三联体叫 <b>PAM</b>（protospacer adjacent motif）。它解释了两件事：
          一是 Cas 蛋白必须先认出 PAM 才会解开双链去配对，所以 PAM 突变的噬菌体（如 C）即使序列完全匹配也能逃逸；
          二是细菌自己阵列里的间隔序列旁边没有 PAM，于是不会自切——这正是这套系统能安全地做"自我/非我"区分的办法。</p>`,
        build(body, api) {
          const S = { p1: 'N', p2: 'N', p3: 'N' };
          // 对齐面板
          const rows = FLANKS.map(([pr, fl, out]) => h.el('div', { class: 'crc-seq', style: 'display:flex;gap:10px;align-items:center' }, [
            h.el('span', { text: pr }),
            h.el('span', { class: 'crc-pam', text: fl.slice(0, 3) }),
            h.el('span', { class: 'crc-rep', text: fl.slice(3) }),
            h.el('span', { class: 'crc-tag ' + (out ? 'cut' : 'esc'), text: out ? '被切' : '逃逸' }),
          ]));
          const panel = h.el('div', {}, [
            h.el('div', { class: 'crc-lab', text: '已配对的 protospacer（20 nt）＋ 紧邻 3′ 的 8 nt 侧翼　|　结局' }),
            h.el('div', { class: 'crc-scroll' }, [h.el('div', {}, rows)]),
          ]);
          // 计数条
          function logo(group, label) {
            const sub = FLANKS.filter((r) => r[2] === group);
            const cols = [];
            for (let p = 0; p < 8; p++) {
              const c = { A: 0, C: 0, G: 0, T: 0 };
              sub.forEach((r) => c[r[1][p]]++);
              const bar = h.el('div', { class: 'crc-bar', style: 'height:100%' });
              ['A', 'C', 'G', 'T'].forEach((b) => {
                if (!c[b]) return;
                const frac = c[b] / sub.length;
                bar.append(h.el('div', { class: 'crc-b crc-b' + b, style: `height:${(frac * 100).toFixed(1)}%`, title: `${b} ${c[b]}/${sub.length}` },
                  [frac > 0.22 ? b : '']));
              });
              cols.push(h.el('div', {}, [
                h.el('div', { class: 'crc-col' }, [bar]),
                h.el('div', { class: 'crc-pos', text: '+' + (p + 1) }),
              ]));
            }
            return h.el('div', { style: 'margin:8px 0' }, [
              h.el('div', { class: 'crc-lab', text: `${label}（n = ${sub.length}）　每列 = 该位置的碱基组成` }),
              h.el('div', { class: 'crc-scroll' }, [h.el('div', { class: 'crc-logo' }, cols)]),
            ]);
          }
          // 答案下拉
          const mk = (k, lab) => {
            const s = h.el('select', { class: 'crc-sel', 'aria-label': lab, onchange: (e) => { S[k] = e.target.value; } },
              ['N', 'A', 'C', 'G', 'T'].map((b) => h.el('option', { value: b, text: b })));
            return h.el('label', { class: 'crc-lab', style: 'display:flex;gap:5px;align-items:center' }, [lab, s]);
          };
          const fb = h.el('div', { class: 'crc-lab', 'aria-live': 'polite' });
          const sub = h.button({
            label: '检查基序', kind: 'primary',
            onClick: () => {
              const got = S.p1 + S.p2 + S.p3;
              if (got === 'NGG') {
                fb.innerHTML = '';
                api.done(`<b>PAM。</b>紧邻 protospacer 3′ 端的 5′-NGG-3′ 是动手的前提：Cas 蛋白先认 PAM，
                  再从那一端把双链撬开去和向导配对。这解释了噬菌体 C——序列记得住，但 PAM 坏了（AAC），酶根本不停留；
                  也解释了细菌为什么不自切：阵列里自己的间隔序列旁边没有 PAM。`);
              } else if (got === 'GGG' || got === 'AGG' || got === 'TGG' || got === 'CGG') {
                fb.innerHTML = `<span style="color:var(--warn)">差一点。</span>你填的 ${got} 把 +1 位也定死了，可"被切"组的 +1 位 A/T/C/G 都出现过——那一位应该用 N。`;
              } else if (got === 'NGN' || got === 'NNG') {
                fb.innerHTML = '<span style="color:var(--warn)">还不够。</span>再看一眼"被切"组：+2 和 +3 <b>两位</b>都是清一色的。';
              } else fb.innerHTML = `<span style="color:var(--warn)">不对（${got}）。</span>先找哪些位置在"被切"组里完全不变，再看"逃逸"组是否恰好在那里被破坏。`;
            },
          });
          body.append(panel, logo(1, '被切组的碱基计数'), logo(0, '逃逸组的碱基计数'),
            h.el('div', { class: 'crc-lab', style: 'margin-top:10px', text: '切割所需的侧翼基序（位置 +1…+3）：' }),
            h.el('div', { class: 'crc-row' }, [mk('p1', '+1'), mk('p2', '+2'), mk('p3', '+3'), sub, fb]));
          return { destroy() {} };
        },
      };

      /* ============ 第三关：种子区 ============ */
      const stage3 = {
        title: '种子区',
        task: `PAM 完好、序列也匹配的噬菌体仍会出逃逸突变株。你把一批逃逸株测了序，
          发现它们的 protospacer 相对向导<b>只差一个碱基</b>——但错配的位置各不相同。
          <p>于是做个干净的实验：人工造出 20 株噬菌体，第 $i$ 株在 protospacer 第 $i$ 位带唯一一个错配
          （编号规定：<b>1 = 离 PAM 最远</b>，20 = 紧贴 PAM），每株做 3 次重复，看它能不能逃过切割。</p>
          <p><b>任务</b>：读下面的数据表，然后在那条 20 格的条带上，把"<b>一个错配就足以让噬菌体逃逸</b>"的位置点亮。
          点一下切换；也可以用键盘 Tab 到格子上按空格。</p>`,
        hints: [
          '先把表按位置扫一遍：小编号（离 PAM 远）的那些，3 次重复都还是"仍被切割"；大编号的那些，3 次都逃逸。',
          '分界不是一刀切——中间有几个位置三次重复里有的逃有的切（混合）。被要求点亮的是那些<b>稳定逃逸</b>的位置；1–7 必须留空。',
          '11–20 必须点亮（一个错配即逃逸），1–7 必须留空（错配无妨），8–10 是混合区，点或不点都接受。',
        ],
        answer: `<b>11–20 点亮，1–7 留空</b>（8–10 是过渡的混合区，两种答法都算对）。
          <p>也就是说：靠 PAM 这一侧约 10–12 nt 的错配是致命的，而远端的错配基本被容忍。这段
          PAM 近端的区域叫<b>种子区</b>。</p>
          <p>机制上这正说明配对的<b>方向性</b>：Cas 蛋白先认 PAM，然后从 PAM 这一端开始把双链解开、
          让向导 RNA 逐步插进去形成 <b>R 环</b>（RNA–DNA 杂合＋被置换的单链）。
          种子区就是这条拉链的起始段——起点配不上，拉链根本拉不开，后面匹配得再好也没用；
          而等拉链已经拉到远端，那里零星的错配就不足以把它推回去了。</p>`,
        build(body, api) {
          // 真值与重复数据（固定）
          const truth = (i) => (i >= 11 ? 'esc' : i <= 7 ? 'cut' : 'mix');
          const REPS = { 8: ['cut', 'esc', 'cut'], 9: ['esc', 'cut', 'esc'], 10: ['esc', 'esc', 'cut'] };
          const reps = (i) => (REPS[i] ? REPS[i] : truth(i) === 'esc' ? ['esc', 'esc', 'esc'] : ['cut', 'cut', 'cut']);
          const S = { on: new Set() };

          const tab = h.el('div', { class: 'dtable', style: 'max-height:260px;overflow:auto' }, [h.el('table', {}, [
            h.el('thead', {}, [h.el('tr', {}, ['错配位置 i', '重复 1', '重复 2', '重复 3'].map((t) => h.el('th', { text: t })))]),
            h.el('tbody', {}, Array.from({ length: 20 }, (_, k) => {
              const i = k + 1, r = reps(i);
              return h.el('tr', {}, [
                h.el('td', { text: `第 ${i} 位` + (i === 1 ? '（离 PAM 最远）' : i === 20 ? '（紧贴 PAM）' : '') }),
                ...r.map((x) => h.el('td', {}, [h.el('span', { class: 'crc-tag ' + (x === 'esc' ? 'esc' : 'cut'), text: x === 'esc' ? '逃逸' : '仍被切割' })])),
              ]);
            })),
          ])]);

          const cells = Array.from({ length: 20 }, (_, k) => {
            const i = k + 1;
            const b = h.el('button', { type: 'button', class: 'crc-cell', 'aria-pressed': 'false',
              'aria-label': `protospacer 第 ${i} 位，点击标记为“错配即逃逸”`, text: String(i) });
            b.addEventListener('click', () => {
              const on = b.getAttribute('aria-pressed') === 'true';
              b.setAttribute('aria-pressed', String(!on));
              on ? S.on.delete(i) : S.on.add(i);
            });
            return b;
          });
          const strip = h.el('div', {}, [
            h.el('div', { class: 'crc-scroll' }, [
              h.el('div', {}, [
                h.el('div', { class: 'crc-seed' }, cells),
                h.el('div', { class: 'crc-ends' }, [h.el('span', { text: '← 第 1 位：离 PAM 最远' }), h.el('span', { text: '第 20 位：紧贴 PAM →' })]),
              ]),
            ]),
          ]);
          const fb = h.el('div', { class: 'crc-lab', 'aria-live': 'polite' });
          const sub = h.button({
            label: '提交标记', kind: 'primary',
            onClick: () => {
              const bad = [];
              for (let i = 1; i <= 20; i++) {
                const t = truth(i), on = S.on.has(i);
                if (t === 'esc' && !on) bad.push(`第 ${i} 位该点亮`);
                if (t === 'cut' && on) bad.push(`第 ${i} 位不该点亮`);
              }
              if (!bad.length) {
                fb.innerHTML = '';
                api.done(`<b>种子区。</b>靠 PAM 一侧约 10–12 nt 内的单个错配就让切割失效，远端错配却被容忍。
                  原因是配对有方向：Cas 蛋白先认 PAM，再从 PAM 端起把 DNA 双链解开、让向导 RNA 像拉链一样插进去
                  形成 <b>R 环</b>。拉链的起始段配不上，整件事就启动不了；等拉到远端，零星错配已经推不翻它。
                  这也是后来设计向导序列时判断"脱靶"的基本依据。`);
              } else fb.innerHTML = `<span style="color:var(--warn)">还不对。</span>${bad.slice(0, 3).join('；')}${bad.length > 3 ? `；…（共 ${bad.length} 处）` : ''}。（8–10 位是混合区，点与不点都接受。）`;
            },
          });
          body.append(h.el('div', { class: 'crc-lab', text: '单错配逃逸实验（每位置 3 次重复）' }), tab,
            h.el('div', { class: 'crc-lab', style: 'margin-top:10px', text: '点亮"一个错配即可逃逸"的位置：' }), strip,
            h.el('div', { class: 'crc-row' }, [sub, fb]));
          return { destroy() {} };
        },
      };

      /* ============ 第四关：把它变成工具 ============ */
      const stage4 = {
        title: '把它变成工具',
        task: `2012 年。你现在知道了三件事：识别靠一段可自由指定的向导序列、动手要有 PAM、配对从 PAM 端起。
          那就反过来用它：<b>自己写向导，指定要切的地方</b>。
          <p>下面是一段虚构的"类人基因"片段（80 bp，双链，底色按密码子分组）。要在某处造一个双链断裂，
          你得完成三步。</p>
          <p><b>(a)</b> 在<b>上链</b>点一个合法的 PAM（带虚下划线的 NGG 都可以点），系统会自动框出它上游 20 nt 作为 protospacer。
          <b>(b)</b> 定下向导 RNA 的 20 nt 间隔段——先回答下面那道题：该用哪一条序列。
          <b>(c)</b> 点出 Cas9 切在哪里：在<b>上链</b>相邻两个碱基之间点那道缝。</p>`,
        hints: [
          '(b) 向导 RNA 要和被它置换掉的那条链配对，而不是和自己同序的那条。所以它的序列应当与<b>上链的 protospacer 相同</b>，只把 T 换成 U。',
          '(c) 断裂是平末端的，位置由 PAM 定，不由序列定：从 PAM 往 protospacer 内部数 3 个碱基，缝就在那里（也就是 protospacer 第 17 和第 18 位之间）。',
          '设 PAM 的第一个碱基在上链的第 $p$ 位（1 基），则 protospacer 占 $p-20\\ldots p-1$，切口在第 $p-4$ 与 $p-3$ 位之间。',
        ],
        answer: `(a) 任一个上链 NGG 都行（本片段里有 5 处）。(b) 向导间隔段 = <b>protospacer 自身的序列、T 换成 U</b>。
          因为向导 RNA 要与<b>另一条</b>（靶）链碱基配对，而靶链本来就与上链互补；于是向导与上链同序，
          被置换出来的是上链（非靶链，PAM 就在它上面）。(c) 切口在 <b>PAM 上游 3 bp</b>，即 protospacer 第 17|18 位之间，两条链同一位置断开成平末端。
          <p>把天然系统里的两条 RNA（crRNA 与 tracrRNA）用一个环连成单条 <b>sgRNA</b>，整个工具就只剩"一个蛋白 + 一条可编程 RNA"。</p>`,
        build(body, api) {
          const S = { p: null, cut: null, quizOK: false, cutOK: false };
          const pamStarts = []; // 0 基索引：PAM 第一个碱基，要求上游有 20 nt
          for (let i = 20; i + 3 <= TARGET.length; i++) if (isPAM3(TARGET.slice(i, i + 3))) pamStarts.push(i);

          const dna = h.el('div', { class: 'crc-dna' });
          const topCells = [], gapCells = [];
          function buildDNA() {
            dna.textContent = '';
            const rowT = h.el('div'), rowB = h.el('div'), rowG = h.el('div');
            rowT.append(h.el('span', { class: 'crc-rep', text: "5′ " }));
            rowB.append(h.el('span', { class: 'crc-rep', text: "3′ " }));
            rowG.append(h.el('span', { class: 'crc-rep', text: "   " }));
            for (let i = 0; i < TARGET.length; i++) {
              const isP = pamStarts.includes(i);
              const cls = 'crc-base' + (Math.floor(i / 3) % 2 ? ' crc-cod' : '') + (isP ? ' crc-pamb' : '');
              const e = isP
                ? h.el('button', { type: 'button', class: cls, text: TARGET[i], 'aria-pressed': 'false',
                    'aria-label': `PAM ${TARGET.slice(i, i + 3)}，上链第 ${i + 1} 位，点击选为 PAM`,
                    onclick: () => pickPAM(i) })
                : h.el('span', { class: cls, text: TARGET[i] });
              topCells.push(e); rowT.append(e);
              rowB.append(h.el('span', { class: 'crc-base' + (Math.floor(i / 3) % 2 ? ' crc-cod' : ''), text: COMP[TARGET[i]] }));
              // 缝：第 i 与 i+1 位之间（0 基），用一个窄按钮
              if (i < TARGET.length - 1) {
                const gb = h.el('button', { type: 'button', class: 'crc-base crc-cutb', text: '·', 'aria-pressed': 'false',
                  'aria-label': `上链第 ${i + 1} 与第 ${i + 2} 位之间的缝，点击标记切点`,
                  onclick: () => pickCut(i) });
                gapCells.push(gb); rowG.append(gb);
              } else rowG.append(h.el('span', { class: 'crc-base', text: ' ' }));
            }
            rowT.append(h.el('span', { class: 'crc-rep', text: " 3′（上链 / 非靶链，PAM 在这条上）" }));
            rowB.append(h.el('span', { class: 'crc-rep', text: " 5′（靶链，与向导配对）" }));
            dna.append(rowT, rowG, rowB);
          }
          function paint() {
            topCells.forEach((e, i) => {
              e.classList.remove('crc-prot');
              if (e.classList.contains('crc-pamb')) e.setAttribute('aria-pressed', String(S.p === i));
              if (S.p != null && i >= S.p - 20 && i <= S.p - 1) e.classList.add('crc-prot');
            });
            gapCells.forEach((e, i) => e.setAttribute('aria-pressed', String(S.cut === i)));
          }
          function pickPAM(i) {
            S.p = i; S.cut = null; S.cutOK = false;
            const pr = TARGET.slice(i - 20, i);
            R.pam.set(`${TARGET.slice(i, i + 3)}（上链第 ${i + 1}–${i + 3} 位）`);
            R.pro.set(pr);
            R.tgt.set(rc(pr) + '　(3′→5′ 读作靶链)');
            optA.textContent = `5′-${pr.replace(/T/g, 'U')}-3′`;
            optB.textContent = `5′-${comp(pr).replace(/T/g, 'U')}-3′`;
            R.cut.set('—'); paint(); upd();
          }
          function pickCut(i) {
            if (S.p == null) { fb.innerHTML = '<span style="color:var(--warn)">先选一个 PAM。</span>'; return; }
            S.cut = i; paint();
            const want = S.p - 4; // 缝 i 在第 i+1|i+2 位之间（0 基 i 与 i+1 之间）；切口应在 p-4 与 p-3 之间（0 基）
            R.cut.set(`上链第 ${i + 1} | ${i + 2} 位之间`);
            if (i === want) {
              S.cutOK = true;
              fb.innerHTML = '<span style="color:var(--good)">切点对了</span>：PAM 上游 3 bp，也就是 protospacer 第 17|18 位之间，两链同位断开成平末端。';
            } else {
              S.cutOK = false;
              const d = want - i;
              fb.innerHTML = `<span style="color:var(--warn)">不是这里。</span>你点在距 PAM ${S.p - 1 - i} bp 处；再往 ${d > 0 ? 'PAM 方向' : 'protospacer 内部'}移 ${Math.abs(d)} 个位置。`;
            }
            upd();
          }
          const R = {
            pam: h.readout('已选 PAM'), pro: h.readout('protospacer（上链 20 nt，5′→3′）'),
            tgt: h.readout('靶链对应段'), cut: h.readout('你标的切点'),
          };
          const readout = h.el('div', { class: 'lab-readout' });
          Object.values(R).forEach((x) => readout.append(x.el));

          const optA = h.el('div', { class: 'crc-mono', text: '（先选一个 PAM）' });
          const optB = h.el('div', { class: 'crc-mono', text: '（先选一个 PAM）' });
          const cand = h.el('div', { class: 'crc-card' }, [
            h.el('h4', { text: '两条候选的向导间隔段' }),
            h.el('div', { class: 'crc-lab', text: '甲：与上链 protospacer 同序，T→U' }), optA,
            h.el('div', { class: 'crc-lab', style: 'margin-top:6px', text: '乙：取 protospacer 的互补序列，T→U' }), optB,
          ]);
          const quiz = H.quiz({
            question: '向导 RNA 的 20 nt 间隔段应该用哪一条？',
            options: [
              { label: '甲：与上链 protospacer <b>同序</b>（T→U）', ok: true,
                why: '对。向导要和<b>靶链</b>（与上链互补的那条）配对，所以它自己必须与上链的 protospacer 同序，只把 T 写成 U；被它置换出来的是带 PAM 的上链。' },
              { label: '乙：protospacer 的<b>互补</b>序列（T→U）', ok: false,
                why: '不对。那条与上链互补——它和靶链同序，彼此配不上。向导必须与上链 protospacer 同序（T→U）。' },
            ],
            onOk() { S.quizOK = true; upd(); },
          });
          const fb = h.el('div', { class: 'crc-lab', 'aria-live': 'polite' });
          function upd() {
            if (S.p != null && S.quizOK && S.cutOK) {
              api.done(`<b>可编程的剪刀。</b>Jinek、Chylinski、Fonfara、Hauer、Doudna 与 Charpentier
                （<i>Science</i> 2012, 337:816）证明：只要把天然的 crRNA 与 tracrRNA 用一个发夹环连成<b>单条向导 RNA（sgRNA）</b>，
                Cas9 就能被任意改写的 20 nt 间隔段带到任何带 NGG 的位点上，在 PAM 上游 3 bp 切出平末端双链断裂。
                "一个蛋白 + 一条可编程 RNA"——这就是后来通用的基因组编辑工具。`);
            }
          }
          const bClear = h.button({ label: '重选', onClick: () => { S.p = null; S.cut = null; S.cutOK = false; R.pam.set('—'); R.pro.set('—'); R.tgt.set('—'); R.cut.set('—'); fb.innerHTML = ''; paint(); } });

          buildDNA(); paint();
          body.append(
            h.el('div', { class: 'crc-lab', text: '靶片段（虚构序列）　中间一行的 · 是上链相邻碱基之间的缝，可点' }),
            h.el('div', { class: 'crc-scroll' }, [dna]),
            h.el('div', { class: 'crc-row' }, [bClear]),
            readout, cand, quiz.el, fb);
          api.typeset(body);
          return { destroy() {} };
        },
      };

      return H.stages(root, ctx, [stage1, stage2, stage3, stage4]);
    },
  };
})();
