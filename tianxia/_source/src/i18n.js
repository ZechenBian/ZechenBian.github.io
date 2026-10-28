// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 双语框架 / i18n =====================
 * 引擎只产生结构化消息 {k, p}，界面按当前语言渲染。
 * 模板占位符：{a} 国家名（玩家显示为“你/you”）；{a:C} 句首大写；{a:P} 所有格；{a:PC} 句首所有格；{a:N} 强制显示国名；
 * {n:+} 带符号数字；{n:%} 小数转百分比；{n:1} 保留一位小数。
 * 参数值：国家代号字符串 | 数字 | {m:金额} | {id:代号}（总是国名）| {k,p} 嵌套消息 | {list:[…]} | {raw:文本} | {zh, en}（AI 写的双语文字）
 * 整条消息也可以是 {zh, en}：联机局里玩家语言不同时，所有人都看得到的 AI 文字两种语言都存，各自按自己的界面语言显示。
 */
const I18N = (() => {
  'use strict';
  let lang = 'zh', player = null;
  const D = {};
  const NAMES = {}, VOICES = {};
  function add(obj) { for (const k in obj) D[k] = obj[k]; }
  function setLang(l) { lang = l === 'en' ? 'en' : 'zh'; }
  function getLang() { return lang; }
  function setPlayer(id) { player = id; }
  function registerNames(list) { for (const a of list) { NAMES[a.id] = [a.name, a.en]; if (a.voice) VOICES[a.id] = [a.voice, a.voiceEn || a.voice]; } }
  const li = () => (lang === 'en' ? 1 : 0);
  function has(key) { return !!D[key]; }
  function raw(key) { const e = D[key]; return e ? (e[li()] ?? e[0]) : null; }
  function countryName(id) { const n = NAMES[id]; return n ? n[li()] : id; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function money(b, unit = true) {
    if (b === undefined || b === null || !isFinite(b)) return '—';
    const neg = b < 0; b = Math.abs(b); let s;
    if (lang === 'en') {
      if (b >= 1000) s = '$' + (b / 1000).toFixed(b >= 10000 ? 1 : 2) + 'T';
      else if (b >= 100) s = '$' + Math.round(b) + 'B';
      else if (b >= 1) s = '$' + b.toFixed(1) + 'B';
      else s = '$' + Math.max(1, Math.round(b * 1000)) + 'M';
    } else {
      if (b >= 1000) s = (b / 1000).toFixed(b >= 10000 ? 1 : 2) + '万亿';
      else if (b >= 1) s = Math.round(b * 10) + '亿';
      else s = (b * 10).toFixed(1) + '亿';
      if (unit) s += '美元';
    }
    return (neg ? '-' : '') + s;
  }
  function pers(k) { // k：千人
    if (typeof k !== 'number' || !isFinite(k)) return '—'; k = Math.max(0, k);
    if (lang === 'en') return k >= 1000 ? (k / 1000).toFixed(k >= 10000 ? 1 : 2) + ' million' : Math.round(k * 1000).toLocaleString('en-US');
    return k >= 10 ? (k / 10).toFixed(k >= 10000 ? 0 : k >= 100 ? 1 : 2).replace(/\.0+$/, '') + '万人' : Math.round(k * 1000) + '人';
  }
  function num(v, mod) {
    if (typeof v !== 'number' || !isFinite(v)) return String(v ?? '');
    if (mod === '%') return Math.round(v * 100) + '%';
    if (mod === '1') return v.toFixed(1);
    if (mod === '0') return Math.round(v).toLocaleString('en-US');
    if (mod === '+' || mod === '+1') { const r = mod === '+1' ? v.toFixed(1) : String(Math.round(v)); return (v >= 0 ? '+' : '') + r; }
    return Number.isInteger(v) ? v.toLocaleString('en-US') : (Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(1));
  }
  function actor(id, mod) {
    const isMe = player && id === player && mod !== 'N';
    if (lang === 'en') {
      if (isMe) return mod === 'C' ? 'You' : mod === 'P' ? 'your' : mod === 'PC' ? 'Your' : 'you';
      const n = countryName(id);
      return mod === 'P' || mod === 'PC' ? (n.endsWith('s') ? n + "'" : n + "'s") : n;
    }
    const n = isMe ? '你' : countryName(id);
    return mod === 'P' || mod === 'PC' ? n + '的' : n;
  }
  function param(v, mod) {
    if (v === undefined || v === null) return '';
    if (typeof v === 'number') return num(v, mod);
    if (typeof v === 'string') return NAMES[v] ? actor(v, mod) : v;
    if (Array.isArray(v)) return v.map(x => param(x, mod)).join(lang === 'en' ? ', ' : '、');
    if (typeof v === 'object') {
      if ('m' in v) return money(v.m, mod !== 'short');
      if ('pers' in v) return pers(v.pers);
      if ('c' in v && Array.isArray(v.c)) return v.c[li()] ?? v.c[0];
      if ('id' in v) return countryName(v.id);
      if ('voice' in v) { const vv = VOICES[v.voice]; const s = vv ? vv[li()] : countryName(v.voice); return mod === 'C' ? cap(s) : s; }
      if ('k' in v) { const s = t(v.k, v.p); return mod === 'C' ? cap(s) : s; }
      if ('list' in v) return v.list.map(x => param(x, mod)).join(lang === 'en' ? ', ' : '、');
      if ('raw' in v) return String(v.raw);
      if ('pct' in v) return Math.round(v.pct * 100) + '%';
      if (typeof v.zh === 'string' || typeof v.en === 'string') return lang === 'en' ? (v.en || v.zh) : (v.zh || v.en); // AI 写的中英双语文字（联机时玩家语言不同）
    }
    return String(v);
  }
  function fill(tpl, p) { return tpl.replace(/\{(\w+)(?::([A-Z%+0-9]+))?\}/g, (m, k, mod) => param(p ? p[k] : undefined, mod)); }
  /* 按中国标准处理的国家（网页版，I18N.shield）：消息里它处在被批评一方时，改用措辞平和的版本（键名加 .z） */
  let ZIDS = [], ZMAP = {};
  const zid = v => (typeof v === 'string' ? ZIDS.includes(v) : !!v && typeof v === 'object' && (ZIDS.includes(v.id) || ZIDS.includes(v.voice)));
  function shield(ids, map) { ZIDS = (ids || []).slice(); ZMAP = Object.assign({}, ZMAP, map || {}); }
  function t(key, p) { const z = ZIDS.length && p && ZMAP[key]; if (z && z.some(n => zid(p[n])) && D[key + '.z']) key = key + '.z'; const e = D[key]; if (!e) return key; return fill(e[li()] ?? e[0], p || {}); }
  function tx(msg) {
    if (msg === undefined || msg === null) return '';
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) return msg.map(tx).join(lang === 'en' ? ' ' : '');
    if (typeof msg === 'object' && msg.k) return t(msg.k, msg.p);
    if (typeof msg === 'object' && 'raw' in msg) return String(msg.raw ?? '');
    if (typeof msg === 'object' && (msg.zh || msg.en)) return lang === 'en' ? (msg.en || msg.zh) : (msg.zh || msg.en);
    return String(msg);
  }
  function txIn(l, msg) { const o = lang; lang = l === 'en' ? 'en' : 'zh'; try { return tx(msg); } finally { lang = o; } }
  function voice(id) { const vv = VOICES[id]; return vv ? vv[li()] : countryName(id); }
  function date(y, q) { return lang === 'en' ? `Q${q} ${y}` : `${y}年Q${q}`; }
  const sep = () => (lang === 'en' ? ', ' : '、');
  return { add, shield, setLang, getLang, setPlayer, registerNames, t, tx, txIn, voice, cap, money, num, pers, countryName, date, has, raw, sep, keys: () => Object.keys(D), dict: D };
})();
if (typeof ACTORS !== 'undefined') I18N.registerNames(ACTORS);
