'use strict';
/*
 * Übersetzungen
 * Deutsch ist die Ausgangssprache. Die anderen Sprachen übersetzen den deutschen Text
 * (gettext-Prinzip) – fehlt eine Übersetzung, erscheint der deutsche Text.
 */

const I18N = (() => {
  const LANGUAGES = [
    { id: 'de', name: 'Deutsch', locale: 'de-DE' },
    { id: 'en', name: 'English', locale: 'en-US' },
    { id: 'fr', name: 'Français', locale: 'fr-FR' },
    { id: 'es', name: 'Español', locale: 'es-ES' },
    { id: 'tr', name: 'Türkçe', locale: 'tr-TR' }
  ];
  const dicts = {};
  const missing = new Set();
  let lang = 'de';

  // Statische Texte der index.html werden beim ersten Aufruf einmal erfasst
  let staticTexts = null;
  let staticAttrs = null;
  const ATTRS = ['title', 'placeholder', 'aria-label'];

  function add(id, dict) { dicts[id] = { ...(dicts[id] || {}), ...dict }; }

  function resolve(setting) {
    if (setting && setting !== 'auto' && LANGUAGES.some((l) => l.id === setting)) return setting;
    const sys = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return LANGUAGES.some((l) => l.id === sys) ? sys : 'en';
  }

  function t(src, params) {
    let s = src;
    if (lang !== 'de') {
      const hit = dicts[lang]?.[src];
      if (hit != null) s = hit;
      else if (/[a-zäöü]/i.test(src)) missing.add(src);
    }
    return params ? s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m)) : s;
  }

  /** Übersetzung mit eingebetteten DOM-Knoten, z. B. „{host} ist nicht erreichbar“ mit fettem Host. */
  function tNodes(src, nodes) {
    return t(src).split(/(\{\w+\})/).filter(Boolean).map((part) => {
      const m = part.match(/^\{(\w+)\}$/);
      return m && nodes[m[1]] != null ? nodes[m[1]] : part;
    });
  }

  /** Tastenkürzel übersetzen: „Strg+Umschalt+T“ → „Ctrl+Shift+T“. */
  function kb(combo) { return combo.split('+').map((k) => (/^(Strg|Umschalt|Klick)$/.test(k) ? t(k) : k)).join('+'); }

  function collect() {
    staticTexts = [];
    staticAttrs = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('script, style, code, [data-no-i18n]') || !n.nodeValue.trim()
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    });
    while (walker.nextNode()) staticTexts.push({ node: walker.currentNode, orig: walker.currentNode.nodeValue });
    for (const el of document.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))) {
      for (const a of ATTRS) if (el.hasAttribute(a)) staticAttrs.push({ el, attr: a, orig: el.getAttribute(a) });
    }
  }

  function translateStatic() {
    if (!staticTexts) collect();
    for (const { node, orig } of staticTexts) {
      const key = orig.trim();
      node.nodeValue = orig.replace(key, t(key));
    }
    for (const { el, attr, orig } of staticAttrs) el.setAttribute(attr, t(orig));
  }

  function setLanguage(setting) {
    const next = resolve(setting);
    const changed = next !== lang || !staticTexts;
    lang = next;
    document.documentElement.lang = lang;
    if (changed) translateStatic();
    return changed;
  }

  return {
    LANGUAGES, add, t, tNodes, kb, setLanguage, resolve,
    get lang() { return lang; },
    get locale() { return LANGUAGES.find((l) => l.id === lang).locale; },
    get missing() { return [...missing]; }
  };
})();

// Läuft vor allen anderen 'settings'-Empfängern, weil i18n.js direkt nach core.js geladen wird
on('settings', (s) => I18N.setLanguage(s.language));

const $t = I18N.t;  // $t statt t: „t“ ist im Code oft ein Tab
const kb = I18N.kb;
