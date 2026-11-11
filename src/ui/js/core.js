'use strict';
/* Grundbausteine: DOM-Helfer, Icons, Zustand, Popover, Menüs, Dialoge, Toasts */

const F = window.falcon;
/** Inkognito-Fenster: eigene Sitzung im Arbeitsspeicher, kein Verlauf, keine gespeicherte Sitzung */
const INCOGNITO = !!F.incognito;
const APP_TITLE = INCOGNITO ? 'Falcon Inkognito' : 'Falcon';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Kleiner DOM-Builder – vermeidet innerHTML mit Fremddaten. */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

// ---------------------------------------------------------------------------
// Icons (24er Raster, 1.7px Strich)
// ---------------------------------------------------------------------------
const ICONS = {
  arrowLeft: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  reload: '<path d="M20 11.5A8 8 0 1 1 17.7 6M20 4v4.5h-4.5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  split: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M12 5v14"/>',
  swap: '<path d="M7 7.5h12M16 4.5l3 3-3 3M17 16.5H5M8 13.5l-3 3 3 3"/>',
  puzzle: '<path d="M10 4.5a2 2 0 0 1 4 0V6h3.5A1.5 1.5 0 0 1 19 7.5V11h-1.5a2 2 0 0 0 0 4H19v3.5a1.5 1.5 0 0 1-1.5 1.5H14v-1.5a2 2 0 0 0-4 0V20H6.5A1.5 1.5 0 0 1 5 18.5V15h1.5a2 2 0 0 0 0-4H5V7.5A1.5 1.5 0 0 1 6.5 6H10z"/>',
  devices: '<rect x="3" y="5" width="13" height="10" rx="1.5"/><path d="M7 19h5M9.5 15v4"/><rect x="17" y="9" width="4.5" height="10" rx="1"/>',
  speed: '<path d="M4.5 16a7.5 7.5 0 1 1 15 0"/><path d="m12 16 3.5-4.5"/>',
  flag: '<path d="M6 20.5V4.5M6 5h10.5l-2 4 2 4H6"/>',
  shop: '<path d="M4.5 9.5 6 5h12l1.5 4.5M4.5 9.5h15M4.5 9.5V19h15V9.5M9.5 19v-5h5v5"/>',
  flask: '<path d="M9.5 4.5h5M10.5 4.5v5L5.5 18a1.3 1.3 0 0 0 1.1 2h10.8a1.3 1.3 0 0 0 1.1-2l-5-8.5v-5M8 14.5h8"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5v9M14.5 9.3c-.5-.8-1.4-1.3-2.5-1.3-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.9 2.5 2-1 2-2.5 2c-1.1 0-2-.5-2.5-1.3"/>',
  bug: '<rect x="8" y="7.5" width="8" height="12" rx="4"/><path d="M9.5 7.5a2.5 2.5 0 0 1 5 0M4.5 10.5 8 12M19.5 10.5 16 12M4.5 17l3.5-1M19.5 17 16 16M12 11v8"/>',
  user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 19.5a7 7 0 0 1 14 0"/>',
  sync: '<path d="M4.5 12a7.5 7.5 0 0 1 13.2-4.9L19.5 9M19.5 4.5V9H15M19.5 12a7.5 7.5 0 0 1-13.2 4.9L4.5 15M4.5 19.5V15H9"/>',
  logout: '<path d="M14 4.5h3.5A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5H14M10 16l-4-4 4-4M6 12h9"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
  warning: '<path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0zM12 9.5v4M12 17h.01"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.9 12.1 8.6-8.6M16.5 6.5l2.5 2.5M14 9l2 2"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 20h14"/>',
  more: '<circle cx="12" cy="5.5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="18.5" r="1" fill="currentColor"/>',
  gamepad: '<path d="M7 7h10a5 5 0 0 1 4.9 6l-.6 3a2.6 2.6 0 0 1-4.6 1.1L15 15H9l-1.7 2.1A2.6 2.6 0 0 1 2.7 16l-.6-3A5 5 0 0 1 7 7z"/><path d="M7.5 10.5v3M6 12h3"/><path d="M15.5 11h.01M17.5 13h.01" stroke-width="2.4"/>',
  pip: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><rect x="12" y="11.5" width="6.5" height="5" rx="1"/>',
  volume: '<path d="M11 5 6.5 8.5H3.5v7h3L11 19z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.5 6a8.5 8.5 0 0 1 0 12"/>',
  volumeX: '<path d="M11 5 6.5 8.5H3.5v7h3L11 19z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  external: '<path d="M14 4h6v6M20 4l-8.5 8.5M18 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4.5"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
  edit: '<path d="M16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1 1-4z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 1.8h7a2 2 0 0 0 2-1.8l1-12M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff: '<path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.4 3.2M6.6 6.6C3.9 8.4 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 5.4-1.7M3 3l18 18M9.9 9.9a2.8 2.8 0 0 0 4.2 4.2"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  chevronUp: '<path d="m6 15 6-6 6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  printer: '<path d="M7 9V3.5h10V9M7 17.5H5a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4.5a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="6.5" rx="1"/>',
  code: '<path d="m15.5 17.5 5.5-5.5-5.5-5.5M8.5 6.5 3 12l5.5 5.5"/>',
  maximize: '<path d="M8 3.5H5.5a2 2 0 0 0-2 2V8M16 3.5h2.5a2 2 0 0 1 2 2V8M3.5 16v2.5a2 2 0 0 0 2 2H8M20.5 16v2.5a2 2 0 0 1-2 2H16"/>',
  zoom: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M8.5 11h5M11 8.5v5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/>',
  shield: '<path d="M12 21s7.5-3.5 7.5-9.5V6L12 3 4.5 6v5.5C4.5 17.5 12 21 12 21z"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  palette: '<path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.8-.9 1.8-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8h2.1A4.3 4.3 0 0 0 21 10.6C21 6.4 17 3 12 3z"/><circle cx="7.5" cy="11.5" r="1" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1" fill="currentColor"/><circle cx="15" cy="7.5" r="1" fill="currentColor"/>',
  bookmark: '<path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4-6.5 4v-16a1 1 0 0 1 1-1z"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14.5h8"/>',
  cloudOff: '<path d="M3 3l18 18M8.5 6.4A6 6 0 0 1 17.6 10h.4a4 4 0 0 1 2.5 7.1M17 19H7a4.5 4.5 0 0 1-1.3-8.8"/>',
  tab: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M3 9h18"/>',
  duplicate: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M5.5 15.5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2"/>',
  restore: '<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.5"/><path d="m20.5 15-4.5-4.5-9 9"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  scissors: '<circle cx="6" cy="6.5" r="2.5"/><circle cx="6" cy="17.5" r="2.5"/><path d="M8.2 7.7 20 18M8.2 16.3 20 6"/>',
  clipboard: '<rect x="5.5" y="4.5" width="13" height="16" rx="2"/><path d="M9 4.5V3.5h6v1"/>',
  selectAll: '<path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  block: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  incognito: '<path d="M3 11h18M5.5 11 7.5 5h9l2 6"/><circle cx="7.5" cy="16" r="2.6"/><circle cx="16.5" cy="16" r="2.6"/><path d="M10.1 16c1.2-.8 2.6-.8 3.8 0"/>',
  book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15.5H5.5A1.5 1.5 0 0 0 4 21z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15.5h5.5A1.5 1.5 0 0 1 20 21z"/>',
  chevronsRight: '<path d="m6 7 5 5-5 5M13 7l5 5-5 5"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18h2"/>',
  usbKey: '<rect x="8" y="9" width="8" height="12.5" rx="2"/><path d="M10 9V4.5a2 2 0 0 1 4 0V9M12 13.5v3"/>',
  monitor: '<rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M8 20.5h8M12 16.5v4"/>'
};

function icon(name) {
  const tpl = document.createElement('template');
  tpl.innerHTML = `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return tpl.content.firstChild;
}
function hydrateIcons(root = document) {
  for (const el of $$('[data-icon]', root)) {
    const current = el.querySelector(':scope > svg.ic[data-name]');
    if (current && current.dataset.name === el.dataset.icon) continue;
    current?.remove();
    const svg = icon(el.dataset.icon);
    svg.dataset.name = el.dataset.icon;
    el.prepend(svg);
  }
}
function setIcon(el, name) { el.dataset.icon = name; hydrateIcons(el.parentElement || el); }

// ---------------------------------------------------------------------------
// Zustand & Ereignisse
// ---------------------------------------------------------------------------
const state = { settings: {}, tabs: [], activeId: null };
const bus = new EventTarget();
const on = (type, fn) => bus.addEventListener(type, (e) => fn(e.detail));
const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

async function updateSettings(patch) {
  state.settings = await F.setSettings(patch);
  emit('settings', state.settings);
  return state.settings;
}

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Speicher voll oder gesperrt */ }
  }
};

const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------
const ENGINES = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=' },
  ecosia: { name: 'Ecosia', url: 'https://www.ecosia.org/search?q=' }
};
const engine = () => ENGINES[state.settings.searchEngine] || ENGINES.google;
const searchUrl = (q) => engine().url + encodeURIComponent(q.trim());

function newTabUrl() {
  const q = new URLSearchParams({ engine: state.settings.searchEngine || 'google', accent: state.settings.accent || '', lang: I18N.lang });
  if (INCOGNITO) q.set('incognito', '1');
  return `${F.newTabUrl}?${q}`;
}
const isNewTab = (url) => !url || url.startsWith(F.newTabUrl);
const isInternal = (url) => !url || url.startsWith('file:') || url.startsWith('about:') || url.startsWith('falcon:');
const DOWNLOADS_URL = 'falcon://downloads/';
/** Interne Seite öffnen – vorhandenen Tab wiederverwenden */
function openInternalPage(url) {
  const existing = state.tabs.find((t) => t.url && t.url.startsWith(url.replace(/\/$/, '')));
  if (existing) return Tabs.activate(existing.id);
  const t = Tabs.active();
  if (t && isNewTab(t.url)) return Tabs.navigate(url, t);
  Tabs.create(url, { index: state.tabs.indexOf(t) + 1 });
}

function looksLikeUrl(s) {
  if (/\s/.test(s)) return false;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(s) || /^(about|view-source|data):/i.test(s)) return true;
  if (/^localhost(:\d+)?(\/|$)/i.test(s)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(s)) return true;
  return /^[^\s/?#]+\.[a-z]{2,63}(:\d+)?([/?#].*)?$/i.test(s);
}
function toUrl(input) {
  const s = input.trim();
  if (!s) return newTabUrl();
  if (!looksLikeUrl(s)) return searchUrl(s);
  if (/^[a-z][a-z\d+.-]*:/i.test(s)) return s;
  return (/^(localhost|\d{1,3}(\.\d{1,3}){3})/i.test(s) ? 'http://' : 'https://') + s;
}
function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }
function faviconFor(url, size = 32) {
  const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
  return host ? `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(host)}` : '';
}
/** Favicon mit Fallback auf ein Globus-Symbol. */
function faviconEl(url, size = 16) {
  const src = faviconFor(url, size * 2);
  if (!src) return icon('globe');
  const img = h('img', { src, alt: '', width: size, height: size });
  img.addEventListener('error', () => img.replaceWith(icon('globe')), { once: true });
  return img;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toLocaleString(I18N.locale, { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`;
}

// ---------------------------------------------------------------------------
// Akzentfarbe
// ---------------------------------------------------------------------------
const ACCENTS = [
  { name: 'Violett', value: '#7c6cff' },
  { name: 'Blau', value: '#3b9eff' },
  { name: 'Türkis', value: '#2ec4b6' },
  { name: 'Grün', value: '#3dd68c' },
  { name: 'Orange', value: '#ff8b3e' },
  { name: 'Rot', value: '#f2555a' },
  { name: 'Pink', value: '#f2559b' }
];
function applyAccent(hex) {
  const root = document.documentElement;
  root.style.setProperty('--accent', hex);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  root.style.setProperty('--accent-fg', lum > 0.55 ? '#0b0b0d' : '#ffffff');
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
const toastHost = h('div', { id: 'toasts', 'aria-live': 'polite' });
document.body.append(toastHost);
function toast(message, iconName = 'check', action) {
  const dismiss = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  const el = h('div', { class: 'toast' }, icon(iconName), h('span', {}, message),
    action ? h('button', { class: 'toast-action', onclick: () => { dismiss(); action.onClick(); } }, action.label) : null);
  toastHost.append(el);
  while (toastHost.children.length > 3) toastHost.firstChild.remove();
  setTimeout(dismiss, action ? 5000 : 2600);
}

// ---------------------------------------------------------------------------
// Popover – immer nur eines gleichzeitig
// ---------------------------------------------------------------------------
const Popover = {
  current: null,

  open(el, { anchor, point, align = 'end', offset = 6, onClose } = {}) {
    this.close();
    el.classList.remove('hidden');
    el.style.left = el.style.top = '0px';
    const w = el.offsetWidth, hgt = el.offsetHeight;
    let x, y;
    if (point) {
      x = point.x; y = point.y;
      if (x + w > innerWidth - 8) x = Math.max(8, x - w);
      if (y + hgt > innerHeight - 8) y = Math.max(8, y - hgt);
    } else {
      const r = anchor.getBoundingClientRect();
      x = align === 'start' ? r.left : align === 'center' ? r.left + r.width / 2 - w / 2 : r.right - w;
      y = r.bottom + offset;
    }
    el.style.left = `${Math.round(Math.min(Math.max(8, x), innerWidth - w - 8))}px`;
    el.style.top = `${Math.round(Math.min(Math.max(8, y), innerHeight - hgt - 8))}px`;
    el.style.transformOrigin = point ? 'top left' : align === 'start' ? 'top left' : 'top right';
    anchor?.classList.add('pressed');
    this.current = { el, anchor, onClose };
  },

  close() {
    const c = this.current;
    if (!c) return;
    this.current = null;
    c.el.classList.add('hidden');
    c.anchor?.classList.remove('pressed');
    c.onClose?.();
  },

  toggle(el, opts) { if (this.isOpen(el)) this.close(); else this.open(el, opts); },
  isOpen(el) { return this.current?.el === el; }
};
document.addEventListener('mousedown', (e) => {
  const c = Popover.current;
  if (c && !c.el.contains(e.target) && !c.anchor?.contains(e.target)) Popover.close();
}, true);
// Klick in eine Webseite nimmt der Oberfläche den Fokus – dann wie bei einem Klick daneben schließen
window.addEventListener('blur', () => { if (Popover.current && !('sticky' in Popover.current.el.dataset)) Popover.close(); });
window.addEventListener('resize', () => Popover.close());

// ---------------------------------------------------------------------------
// Kontextmenüs
// ---------------------------------------------------------------------------
/**
 * items: { label, icon, shortcut, onClick, disabled, danger, checked } | '-' | { element }
 */
function showMenu(items, position) {
  const menu = h('div', { class: 'pop menu', role: 'menu' });
  const clean = items.filter(Boolean).filter((it, i, arr) => it !== '-' || (i > 0 && arr[i - 1] !== '-' && i < arr.length - 1));
  for (const it of clean) {
    if (it === '-') { menu.append(h('div', { class: 'menu-sep', role: 'separator' })); continue; }
    if (it.element) { menu.append(it.element); continue; }
    menu.append(h('button', {
      class: `menu-item${it.danger ? ' danger' : ''}`, role: 'menuitem', disabled: !!it.disabled,
      onclick: (e) => { Popover.close(); it.onClick?.(e); },
      onauxclick: (e) => { if (e.button === 1 && it.onClick) { Popover.close(); it.onClick(e); } },
      oncontextmenu: (e) => { e.preventDefault(); if (it.onContextMenu) { Popover.close(); it.onContextMenu(e); } }
    },
    it.checked != null ? (it.checked ? h('span', { class: 'menu-check' }, icon('check')) : h('span', { style: { width: '15px' } })) : it.iconEl ? h('span', { class: 'menu-fav' }, it.iconEl) : (it.icon ? icon(it.icon) : h('span', { style: { width: '15px' } })),
    h('span', { class: 'menu-label' }, it.label),
    it.shortcut ? h('span', { class: 'menu-key' }, it.shortcut) : null));
  }
  document.body.append(menu);
  Popover.open(menu, { ...position, onClose: () => menu.remove() });

  menu.tabIndex = -1;
  menu.focus();
  menu.addEventListener('keydown', (e) => {
    const list = $$('.menu-item:not(:disabled)', menu);
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === 'Escape') { e.stopPropagation(); Popover.close(); }
  });
  return menu;
}

// ---------------------------------------------------------------------------
// Dialoge (Electron hat kein prompt())
// ---------------------------------------------------------------------------
let openDialogs = 0;
function dialogShell(content, onDismiss) {
  const overlay = h('div', { class: 'overlay' }, content);
  const close = () => {
    if (!overlay.isConnected) return;
    overlay.remove();
    if (--openDialogs === 0 && $('#settings').classList.contains('hidden')) F.overlayDim(false);
  };
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) { onDismiss?.(); close(); } });
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); onDismiss?.(); close(); } });
  document.body.append(overlay);
  openDialogs++;
  F.overlayDim(true);
  Popover.close();
  return close;
}

function openForm({ title, description, fields, submitLabel = $t('Speichern'), onSubmit }) {
  const error = h('p', { class: 'dialog-error' });
  const inputs = fields.map((f) => {
    if (f.type === 'select') {
      const sel = h('select', { class: 'field-input', name: f.name }, (f.options || []).map((o) => h('option', { value: o.value }, o.label)));
      sel.value = f.value ?? '';
      return sel;
    }
    return h('input', {
      class: 'field-input', name: f.name, value: f.value || '', placeholder: f.placeholder || '',
      type: f.type || 'text', spellcheck: false, autocomplete: 'off'
    });
  });
  const form = h('form', { class: 'dialog', novalidate: true },
    h('div', { class: 'dialog-body' },
      h('h3', {}, title),
      description ? h('p', {}, description) : null,
      h('div', { class: 'fields' }, fields.map((f, i) => h('label', {}, f.label, inputs[i]))),
      error),
    h('div', { class: 'dialog-foot' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => close() }, $t('Abbrechen')),
      h('button', { type: 'submit', class: 'btn primary' }, submitLabel)));
  const close = dialogShell(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(inputs.map((i) => [i.name, i.value]));
    const result = await onSubmit(data);
    if (typeof result === 'string') error.textContent = result;
    else close();
  });
  inputs[0]?.focus();
  inputs[0]?.select();
}

function confirmDialog({ title, message, confirmLabel = 'OK', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } close(); };
    const box = h('div', { class: 'dialog', role: 'alertdialog' },
      h('div', { class: 'dialog-body' }, h('h3', {}, title), message ? h('p', {}, message) : null),
      h('div', { class: 'dialog-foot' },
        h('button', { class: 'btn ghost', onclick: () => finish(false) }, $t('Abbrechen')),
        h('button', { class: `btn ${danger ? 'danger-solid' : 'primary'}`, onclick: () => finish(true) }, confirmLabel)));
    const close = dialogShell(box, () => { if (!done) { done = true; resolve(false); } });
    box.querySelector('.dialog-foot .btn:last-child').focus();
  });
}
