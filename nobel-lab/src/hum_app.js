/* hum_app.js — standalone preview shell for the Literature & Peace experiences */
(() => {
  const el = H.el;
  const app = document.getElementById('app');
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const typeset = (node) => { const mj = window.MathJax; if (mj && mj.typesetPromise) mj.typesetPromise([node]).catch(() => {}); };
  let handle = null;

  const ITEMS = [
    {
      id: 'marquez', field: 'lit', fieldName: '文学奖', year: 1982,
      who: [{ zh: '加夫列尔·加西亚·马尔克斯', en: 'Gabriel García Márquez' }],
      teaser: '一个虚构的小镇，怎样装下一整片大陆的百年？',
      blurb: '五幕：颠倒的惊奇、名字的轮回、失眠症、香蕉公司、孤独与第二次机会。你会分拣奇迹、预言一个家族的命运、和遗忘赛跑，并亲眼看着一段历史被抹掉。',
      cite: '瑞典学院表彰他的长篇与短篇小说，其中幻想与现实交织成一个丰富的想象世界，映照出一片大陆的生活与冲突。',
    },
    {
      id: 'mandela', field: 'peace', fieldName: '和平奖', year: 1993,
      who: [{ zh: '纳尔逊·曼德拉', en: 'Nelson Mandela' }, { zh: '弗雷德里克·威廉·德克勒克', en: 'F. W. de Klerk' }],
      teaser: '两个敌人，怎样在四年里把一个国家从种族隔离谈到一人一票？',
      blurb: '五幕：先看种族隔离怎样用法律分配土地、居所与公民身份；再坐上谈判桌扮演其中一方，在暗杀、屠杀与右翼冲击中把选举谈下来；然后审理真相与和解委员会的案子，看 30 年后什么变了、什么没变。',
      cite: '挪威诺贝尔委员会表彰两人为和平结束种族隔离制度、为一个新的民主南非奠定基础所做的工作。',
    },
  ];
  const byId = Object.fromEntries(ITEMS.map((x) => [x.id, x]));

  function home() {
    document.title = '文学与和平';
    const cards = ITEMS.map((x) => el('a', { class: 'hcard f-' + x.field, href: '#' + x.id }, [
      el('div', { class: 'row' }, [el('span', { class: 'yr', text: x.year }), el('span', { class: 'chip', text: '诺贝尔' + x.fieldName })]),
      el('h3', { text: x.teaser }),
      el('div', { class: 'who', text: x.who.map((w) => w.zh).join('、') }),
      el('p', { class: 'one', text: x.blurb }),
      el('span', { class: 'go', text: '进入 →' }),
    ]));
    app.replaceChildren(
      el('section', { class: 'hero hum-hero' }, [
        el('div', {}, [
          el('div', { class: 'kicker', text: 'Nobel · 文学 / 和平' }),
          el('h1', { html: '<span class="nw">不是读懂，</span><br><span class="nw">而是<em>走进去</em></span>' }),
          el('p', { text: '科学奖可以被还原，文学奖和和平奖不行：它们没有标准答案。这里用小游戏和互动动画，让你站进作品和那段历史里，体会它背后的意义，以及它带来的社会与文化变迁。' }),
        ]),
      ]),
      el('div', { class: 'hgrid' }, cards),
      el('p', { class: 'foot', text: '内容由 Claude 整理，史实已核对，有争议的数字给出范围；标注“简化模型”“示意”“虚构的综合案例”的部分是为了互动而做的简化。作品原文受版权保护，页面中只有转述，没有引文。' }),
    );
  }

  function detail(x) {
    document.title = `${x.year} · ${HUM[x.id] ? HUM[x.id].title : x.teaser}`;
    const root = el('div', { class: 'humroot' });
    app.replaceChildren(
      el('div', { class: 'crumbs' }, [el('a', { href: '#', text: '← 文学与和平' }), el('div', { class: 'pn' }, ITEMS.filter((o) => o !== x).map((o) => el('a', { href: '#' + o.id, text: `${o.year} ${o.fieldName} →` })))]),
      el('header', { class: 'dhead f-' + x.field }, [
        el('div', { class: 'bigyr', text: x.year }),
        el('div', { class: 'meta' }, [el('span', { class: 'chip', text: '诺贝尔' + x.fieldName })]),
        el('h1', { text: x.teaser }),
        el('div', { class: 'laureates' }, x.who.map((w) => el('div', {}, [el('b', { text: w.zh }), el('span', { text: w.en })]))),
      ]),
      root,
    );
    if (HUM[x.id]) {
      try { handle = HUM[x.id].mount(root, { color: css, reduced, h: H, typeset }); }
      catch (err) { console.error(err); root.replaceChildren(el('p', { class: 'lab-missing', text: '加载失败，请刷新页面重试。' })); }
    }
    typeset(app);
  }

  function route() {
    if (handle) { try { handle.destroy(); } catch (e) {} handle = null; }
    const x = byId[location.hash.replace(/^#/, '')];
    if (x) detail(x); else home();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();
})();
