'use strict';
/* falcon://reports – Übersicht der gemeldeten Fehler (nur für den Admin lesbar) */

(async () => {
  const api = window.falconReports;
  const $ = (s) => document.querySelector(s);
  if (!api) { document.body.textContent = 'Falcon API not available.'; return; }

  let dict = {};
  window.I18N = { add: (_l, map) => { dict = map; } };
  const info = await api.info();
  if (info.accent) document.documentElement.style.setProperty('--accent', info.accent);
  if (info.lang && info.lang !== 'de') {
    await new Promise((resolve) => { const s = document.createElement('script'); s.src = `locales/${info.lang}.js`; s.onload = s.onerror = resolve; document.head.append(s); });
    document.documentElement.lang = info.lang;
  }
  const locale = { de: 'de-DE', en: 'en-US', fr: 'fr-FR', es: 'es-ES', tr: 'tr-TR' }[info.lang] || 'de-DE';
  const t = (src, p) => { let s = dict[src] || src; if (p) for (const [k, v] of Object.entries(p)) s = s.replaceAll(`{${k}}`, v); return s; };
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll('[data-tp]').forEach((el) => { el.placeholder = t(el.dataset.tp); });
  document.title = t('Gemeldete Fehler');

  const CATS = { bug: 'Fehler', site: 'Website funktioniert nicht', crash: 'Absturz oder Einfrieren', idea: 'Vorschlag', other: 'Sonstiges' };
  const STATUS = [['new', 'Neu'], ['progress', 'In Arbeit'], ['done', 'Erledigt']];
  const ICON_TRASH = '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>';
  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'html') e.innerHTML = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c);
    return e;
  }

  let reports = [];
  let filter = 'open';
  let errorCode = null;

  async function load() {
    $('#summary').textContent = t('Wird geladen …');
    const r = await api.list();
    errorCode = r && !r.ok ? r.error : null;
    reports = r && r.ok ? r.reports : [];
    render();
  }

  function row(r) {
    const status = el('select', { onchange: async (e) => {
      const res = await api.setStatus(r.id, e.target.value);
      if (res?.ok) { r.status = e.target.value; render(); }
    } }, STATUS.map(([v, l]) => el('option', { value: v }, t(l))));
    status.value = r.status || 'new';
    const when = r.created ? new Date(r.created).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    return el('article', { class: `report${r.status === 'done' ? ' done' : ''}` },
      el('div', { class: 'r-head' },
        el('span', { class: `r-cat ${r.category || 'other'}` }, t(CATS[r.category] || 'Sonstiges')),
        el('span', {}, when),
        el('span', { class: 'r-status' }, status),
        el('button', { class: 'icon-btn', title: t('Löschen'), html: ICON_TRASH, onclick: async () => {
          if (!confirm(t('Diese Meldung endgültig löschen?'))) return;
          const res = await api.remove(r.id);
          if (res?.ok) { reports = reports.filter((x) => x !== r); render(); }
        } })),
      el('p', { class: 'r-text' }, r.text || ''),
      el('div', { class: 'r-meta' },
        r.email ? el('span', {}, '✉ ', el('a', { href: `mailto:${encodeURIComponent(r.email).replace(/%40/g, '@')}` }, r.email)) : null,
        r.url ? el('span', {}, '🔗 ', el('a', { href: '#', title: r.url, onclick: (e) => { e.preventDefault(); api.open(r.url); } }, r.url.length > 70 ? r.url.slice(0, 70) + '…' : r.url)) : null,
        el('span', {}, `Falcon ${r.version || '?'}`),
        r.os ? el('span', {}, r.os) : null),
      r.screenshot ? el('img', { class: 'r-shot', src: r.screenshot, alt: '', onclick: () => { $('#viewer img').src = r.screenshot; $('#viewer').classList.remove('hidden'); } }) : null);
  }

  function render() {
    const q = $('#q').value.trim().toLowerCase();
    const shown = reports
      .filter((r) => filter === 'all' || (filter === 'done' ? r.status === 'done' : r.status !== 'done'))
      .filter((r) => !q || [r.text, r.email, r.url, r.version, r.os].some((x) => String(x || '').toLowerCase().includes(q)));
    $('#list').replaceChildren(shown.length ? el('div', { class: 'card' }, shown.map(row)) : '');
    const open = reports.filter((r) => r.status !== 'done').length;
    $('#summary').textContent = errorCode ? '' : t('{open} offen · {all} insgesamt', { open, all: reports.length });
    const empty = !shown.length;
    $('#empty').classList.toggle('hidden', !empty);
    if (errorCode === 'PERMISSION_DENIED' || errorCode === 'SIGNED_OUT' || errorCode === 'HTTP_403') {
      $('#emptyTitle').textContent = t('Kein Zugriff');
      $('#emptyText').textContent = info.signedIn ? t('Nur der Entwickler-Account darf die Meldungen sehen.') : t('Melde dich mit dem Entwickler-Account an.');
    } else if (errorCode) {
      $('#emptyTitle').textContent = t('Meldungen konnten nicht geladen werden');
      $('#emptyText').textContent = errorCode;
    } else {
      $('#emptyTitle').textContent = reports.length ? t('Keine Treffer') : t('Noch keine Meldungen');
      $('#emptyText').textContent = reports.length ? '' : t('Sobald jemand einen Fehler meldet, erscheint er hier.');
    }
  }

  $('#q').addEventListener('input', render);
  $('#reload').addEventListener('click', load);
  $('#viewer').addEventListener('click', () => $('#viewer').classList.add('hidden'));
  document.querySelectorAll('#filter button').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.f;
    document.querySelectorAll('#filter button').forEach((x) => x.classList.toggle('sel', x === b));
    render();
  }));
  load();
})();
