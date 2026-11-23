'use strict';
/* Falcon – Website: Sprachen (Standard Englisch). Quelltext der Seiten ist Deutsch; Übersetzungen in i18n-data.js.
   Übersetzt werden ganze Absätze/Knöpfe (innerHTML ohne Symbole) und Attribute (title, alt, aria-label, placeholder, Meta-Texte). */
(() => {
  const LANGS = [['en', 'English'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español'], ['tr', 'Türkçe']];
  const KEY = 'falcon.lang';
  let lang = 'en';
  try { lang = localStorage.getItem(KEY) || 'en'; } catch { /* privater Modus */ }
  if (!LANGS.some(([id]) => id === lang)) lang = 'en';
  if (/[?&]i18n-collect\b/.test(location.search)) lang = 'de';

  const INLINE = new Set(['A', 'B', 'STRONG', 'EM', 'I', 'CODE', 'SPAN', 'SMALL', 'BR', 'IMG', 'KBD', 'SUP', 'SUB', 'MARK', 'U', 'S', 'svg']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'svg', 'IMG']);
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const hasText = (el) => /\p{L}{2}/u.test(Array.from(el.childNodes).map(function txt(n) {
    if (n.nodeType === 3) return n.nodeValue;
    if (n.nodeType !== 1 || n.localName === 'svg') return '';
    return Array.from(n.childNodes).map(txt).join('');
  }).join(''));
  const onlyInline = (el) => Array.from(el.children).every((c) => (INLINE.has(c.tagName) || c.localName === 'svg') && (c.localName === 'svg' || onlyInline(c)));
  const keyOf = (el) => norm(el.innerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>'));

  /** Alle übersetzbaren Blöcke: äußerstes Element, das Text hat und nur Inline-Elemente enthält */
  function blocks(root) {
    const out = [];
    (function walk(el) {
      for (const c of el.children) {
        if (SKIP.has(c.tagName) || SKIP.has(c.localName) || c.hasAttribute('data-no-i18n') || c.id === 'langPick') continue;
        if (hasText(c) && onlyInline(c)) out.push(c);
        else walk(c);
      }
    })(root);
    return out;
  }
  const ATTRS = ['title', 'alt', 'aria-label', 'placeholder'];
  function attrs(root) {
    const out = [];
    for (const el of root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))) {
      if (el.closest('[data-no-i18n]')) continue;
      for (const a of ATTRS) { const v = el.getAttribute(a); if (v && /\p{L}{2}/u.test(v)) out.push([el, a, norm(v)]); }
    }
    for (const m of document.querySelectorAll('meta[name="description"], meta[property="og:title"], meta[property="og:description"]')) out.push([m, 'content', norm(m.content)]);
    return out;
  }

  // Wörterbuch: Schlüssel (deutscher Text) → Übersetzung
  const D = window.FALCON_I18N || { keys: [] };
  const map = new Map();
  if (lang !== 'de' && D[lang]) D.keys.forEach((k, i) => { if (D[lang][i]) map.set(k, D[lang][i]); });
  const t = (s, vars) => {
    let r = map.get(s) ?? s;
    if (vars) for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(v);
    return r;
  };

  function translate(root) {
    if (!map.size) return;
    for (const el of blocks(root)) {
      const tr = map.get(keyOf(el));
      if (!tr) continue;
      const svgs = Array.from(el.querySelectorAll('svg'));
      let i = 0;
      el.innerHTML = tr.replace(/<svg\/>/g, () => `<i data-i18n-svg="${i++}"></i>`);
      el.querySelectorAll('i[data-i18n-svg]').forEach((ph) => { const s = svgs[Number(ph.dataset.i18nSvg)]; if (s) ph.replaceWith(s); else ph.remove(); });
    }
    for (const [el, a, v] of attrs(root)) { const tr = map.get(v); if (tr) el.setAttribute(a, tr); }
  }

  function picker() {
    const cur = LANGS.find(([id]) => id === lang);
    const wrap = document.createElement('div');
    wrap.id = 'langPick';
    wrap.className = 'lang-pick';
    wrap.innerHTML = `<button type="button" class="lang-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="${t('Sprache')}: ${cur[1]}" title="${t('Sprache')}">`
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z"/></svg>'
      + `<span>${lang.toUpperCase()}</span></button>`
      + `<ul class="lang-list" role="listbox" hidden>${LANGS.map(([id, name]) => `<li role="option" tabindex="-1" data-lang="${id}" aria-selected="${id === lang}" lang="${id}">${name}${id === lang ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : ''}</li>`).join('')}</ul>`;
    document.body.append(wrap);
    const btn = wrap.querySelector('button'); const list = wrap.querySelector('ul');
    const open = (o) => { list.hidden = !o; btn.setAttribute('aria-expanded', String(o)); if (o) list.querySelector('[aria-selected="true"]')?.focus(); };
    btn.addEventListener('click', () => open(list.hidden));
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) open(false); });
    const pick = (id) => { try { localStorage.setItem(KEY, id); } catch { /* egal */ } if (id !== lang) location.reload(); else open(false); };
    list.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) pick(li.dataset.lang); });
    list.addEventListener('keydown', (e) => {
      const items = Array.from(list.children); const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (i >= 0) pick(items[i].dataset.lang); }
      else if (e.key === 'Escape') { open(false); btn.focus(); }
    });
  }

  if (/[?&]i18n-collect\b/.test(location.search)) {
    const snap = { blocks: blocks(document.body).map(keyOf), attrs: attrs(document).map((x) => x[2]), title: norm(document.title) }; // vor main.js
    window.__i18nCollect = () => snap;
  } else {
    document.documentElement.lang = lang;
    const og = document.querySelector('meta[property="og:locale"]');
    if (og) og.content = { en: 'en_US', de: 'de_DE', fr: 'fr_FR', es: 'es_ES', tr: 'tr_TR' }[lang];
    document.title = t(norm(document.title));
    translate(document.body);
    picker();
  }
  document.documentElement.classList.remove('i18n-wait');
  window.FalconI18n = { lang, t, translate, LANGS };
})();
