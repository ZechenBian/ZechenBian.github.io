// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 界面层 v2 · 基础 ===================== */
(() => {
'use strict';
const W = WG, IDS = W.IDS, DEF = W.DEF;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const T = (k, p) => I18N.t(k, p);
const TX = m => I18N.tx(m);
const NAME = id => I18N.countryName(id);
const EN = () => I18N.getLang() === 'en';
const paren = s => (EN() ? ' (' + s + ')' : '（' + s + '）'); // 括注：中文用全角括号，英文用半角并空一格
const colonT = () => (EN() ? ': ' : '：');
const fmtB = b => I18N.money(b, false);
const fmtN = n => I18N.num(n, '0');
const pct = (v, d = 0) => (v * 100).toFixed(d) + '%';
const sep = () => I18N.sep();
const dateStr = (S_, turn) => { const d = W.dateOf(S_, turn ?? S_.turn); return I18N.date(d.y, d.q); };
let S = null;
const UI = { sel: null, hover: null, view: 'political', tab: 'target', cat: 'dip', params: {}, open: {}, busy: false, tier: 'default', engine: 'auto', labels: true, feedFilter: 'all', rankSort: 'power', abort: null, chatBusy: false, adj: null, move: {}, crisisQ: [], planBusy: false };
const SAVE_KEY = 'tianxia.save.v5', OLD_SAVE_KEY = 'tianxia.save.v4', PREF_KEY = (window.TX_LSP || 'tianxia') + '.prefs';
function prefs() { try { return JSON.parse(localStorage.getItem(PREF_KEY) || localStorage.getItem('tianxia.prefs') || '{}'); } catch (e) { return {}; } } // 新版第一次打开时沿用旧版的语言、主题等设置
function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify({ tier: UI.tier, engine: UI.engine, labels: UI.labels, theme: document.documentElement.getAttribute('data-theme') || '', lang: I18N.getLang(), layers: UI.lyr, anim: UI.animPref })); } catch (e) { } } // layers / anim：地图图层与动画（02b_layers.js）
{
  const p = prefs(); if (p.tier) UI.tier = p.tier; if (p.engine) UI.engine = p.engine; if (p.labels === false) UI.labels = false; if (Array.isArray(p.layers)) UI.lyr = p.layers; if (['auto', 'on', 'off'].includes(p.anim)) UI.animPref = p.anim; if (p.theme) document.documentElement.setAttribute('data-theme', p.theme);
  let lang = p.lang; if (!lang) { try { lang = /^zh/i.test(navigator.language || '') ? 'zh' : 'en'; } catch (e) { lang = 'zh'; } } I18N.setLang(lang);
}

/* ---------- 静态文字（按语言切换） ---------- */
function applyStatic() {
  document.documentElement.lang = EN() ? 'en' : 'zh-CN';
  for (const el of $$('[data-i18n]')) el.textContent = T(el.dataset.i18n);
  for (const el of $$('[data-i18n-ph]')) el.setAttribute('placeholder', T(el.dataset.i18nPh));
  for (const el of $$('[data-i18n-al]')) el.setAttribute('aria-label', T(el.dataset.i18nAl));
  for (const el of $$('[data-i18n-ti]')) el.setAttribute('title', T(el.dataset.i18nTi));
  const lb = $('#btnLang'); if (lb) { lb.textContent = EN() ? '中文' : 'EN'; lb.title = T('u.lang_switch'); }
  const sl = $('.brand .seal'); if (sl) sl.textContent = EN() ? '♜' : '棋'; // 英文界面的印章换成棋子（车），不出现汉字
  document.title = T('u.title');
}
function setLang(l) { I18N.setLang(l); savePrefs(); applyStatic(); if (S) renderAll(); if (typeof mpLangChanged === 'function') mpLangChanged(); } // 联机：把新的界面语言告诉房主

/* ---------- 颜色 ---------- */
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function hex(c) { c = c.replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); const n = parseInt(c, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { const A = hex(a), B = hex(b); t = clamp(t, 0, 1); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
const isDark = () => { const t = document.documentElement.getAttribute('data-theme'); if (t) return t === 'dark'; return matchMedia('(prefers-color-scheme: dark)').matches; };
const HUE = {};
(function assignHues() {
  const pal = [205, 25, 140, 280, 50, 330, 175, 95, 245, 0, 115, 305, 160, 70];
  const order = IDS.slice().sort((a, b) => (GEO.land[b] || []).length - (GEO.land[a] || []).length);
  for (const id of order) {
    const nb = new Set(); for (const o of IDS) if (o !== id && (W.landAdj(id, o) || W.dist(id, o) < 600) && HUE[o] !== undefined) nb.add(HUE[o]);
    HUE[id] = pal.find(h => !nb.has(h)) ?? pal[IDS.indexOf(id) % pal.length];
  }
})();
function hsl2hex(h, s, l) { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l); const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); }
const polColor = id => (isDark() ? hsl2hex(HUE[id], 24, 31) : hsl2hex(HUE[id], 34, 77));
const STANCE_CLS = { '强烈反对': 'hostile', '反对': 'hostile', '关切': 'unknown', '中立': 'neutral', '支持': 'friend', '欢迎': 'friend' };
const stanceLabel = st => T('stn.' + (W.STANCE_KEY[st] || 'co'));

/* ---------- 通用小部件 ---------- */
function delta(a, b, fmt = v => v.toFixed(1)) { const d = b - a; if (!isFinite(d) || Math.abs(d) < 1e-9) return ''; return `<i class="${d > 0 ? 'good' : 'bad'}">${d > 0 ? '▲' : '▼'}${fmt(Math.abs(d))}</i>`; }
function relWord(r, war) { if (war) return ['u.rw.war', 'hostile']; if (r >= 60) return ['u.rw.close', 'friend']; if (r >= 25) return ['u.rw.friendly', 'friend']; if (r > -25) return ['u.rw.neutral', 'neutral']; if (r > -60) return ['u.rw.cool', 'unknown']; return ['u.rw.hostile', 'hostile']; }
function statusText(id) { const x = S.actors[id]; if (x.ctrl !== id) return T(x.integrated ? 'u.st.part' : 'u.st.occ', { b: x.ctrl }); if (x.overlord) return T('u.st.vassal', { b: x.overlord }); return T('u.st.indep'); }
const persT = k => I18N.pers(k);
const unitTxt = u => T('u.units_line', { p: { pers: u.pers }, t: Math.round(u.tanks), a: Math.round(u.air), s: Math.round(u.ships) });
function toast(msg, ms = 3200) { const t = $('#toast'); t.textContent = typeof msg === 'string' ? msg : TX(msg); t.hidden = false; clearTimeout(UI.toastT); UI.toastT = setTimeout(() => (t.hidden = true), ms); }
const useLLM = () => UI.engine !== 'rules' && LLM.available();
const threatCls = v => (v >= 60 ? 'bad' : v >= 35 ? 'warn' : 'good');
/* 立即生效的玩家操作统一经由引擎命令执行器（联机版会同时发给房主） */
function doCmd(op, args) { if (window.TX_MP && typeof mpCmd === 'function' && MPS.on) return mpCmd(op, args); const r = W.execCmd(S, S.player, op, args); return r.ok ? r.r : null; }
