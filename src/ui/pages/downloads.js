'use strict';
/* falcon://downloads – alle Downloads mit Suche, Fortschritt und Aktionen */

(async () => {
  const api = window.falconDownloads;
  const $ = (s) => document.querySelector(s);
  if (!api) { document.body.textContent = 'Falcon API not available.'; return; }

  // ---- Sprache (Ausgangssprache Deutsch, Übersetzungen aus ui/locales) ----
  let dict = {};
  window.I18N = { add: (_lang, map) => { dict = map; } };
  const info = await api.info();
  if (info.accent) document.documentElement.style.setProperty('--accent', info.accent);
  if (info.lang && info.lang !== 'de') {
    await new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = `locales/${info.lang}.js`;
      s.onload = s.onerror = resolve;
      document.head.append(s);
    });
    document.documentElement.lang = info.lang;
  }
  const locale = { de: 'de-DE', en: 'en-US', fr: 'fr-FR', es: 'es-ES', tr: 'tr-TR' }[info.lang] || 'de-DE';
  const t = (src, params) => {
    let s = dict[src] || src;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, v);
    return s;
  };
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll('[data-tp]').forEach((el) => { el.placeholder = t(el.dataset.tp); });
  document.title = t('Downloads');

  // ---- Helfer ----
  const ICONS = {
    file: '<path d="M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><path d="M13.5 3.5v5h5"/>',
    folder: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5V17a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17z"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    pause: '<path d="M9 6v12M15 6v12"/>',
    play: '<path d="M8 5.5v13l10-6.5z"/>',
    retry: '<path d="M20 11.5A8 8 0 1 1 17.7 6M20 4v4.5h-4.5"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  };
  const svg = (name) => `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>`;
  function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'html') e.innerHTML = v; // nur für eigene SVG-Konstanten
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) e.append(c);
    return e;
  }
  function bytes(n) {
    if (!n) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    return `${(n / 1024 ** i).toLocaleString(locale, { maximumFractionDigits: i ? 1 : 0 })} ${u[i]}`;
  }
  const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
  function duration(sec) {
    if (!isFinite(sec) || sec <= 0) return '';
    if (sec < 60) return t('noch {n} s', { n: Math.ceil(sec) });
    if (sec < 3600) return t('noch {n} Min.', { n: Math.ceil(sec / 60) });
    return t('noch {n} Std.', { n: (sec / 3600).toLocaleString(locale, { maximumFractionDigits: 1 }) });
  }
  function dayLabel(ms) {
    const d = new Date(ms); d.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((today - d) / 86400000);
    if (diff === 0) return t('Heute');
    if (diff === 1) return t('Gestern');
    return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  }

  // ---- Daten ----
  let items = await api.list();
  const speed = new Map(); // id -> { bytes, at, bps }
  const running = (d) => d.state === 'progressing' || d.state === 'started';

  function trackSpeed(d) {
    if (!running(d) || d.paused) { speed.delete(d.id); return; }
    const now = Date.now();
    const s = speed.get(d.id);
    if (!s) { speed.set(d.id, { bytes: d.received, at: now, bps: 0 }); return; }
    const dt = (now - s.at) / 1000;
    if (dt < 0.5) return;
    const inst = Math.max(0, (d.received - s.bytes) / dt);
    s.bps = s.bps ? s.bps * 0.6 + inst * 0.4 : inst;
    s.bytes = d.received; s.at = now;
  }

  function meta(d) {
    if (running(d)) {
      if (d.paused) return { text: t('Pausiert – {done} von {total}', { done: bytes(d.received), total: d.total ? bytes(d.total) : '?' }) };
      const bps = speed.get(d.id)?.bps || 0;
      const parts = [d.total ? t('{done} von {total}', { done: bytes(d.received), total: bytes(d.total) }) : bytes(d.received)];
      if (bps) parts.push(`${bytes(bps)}/s`);
      if (bps && d.total) parts.push(duration((d.total - d.received) / bps));
      return { text: parts.filter(Boolean).join(' · ') };
    }
    if (d.state === 'completed') {
      if (!d.exists) return { text: t('Gelöscht oder verschoben'), cls: 'err' };
      return { text: bytes(d.total || d.received), cls: 'ok' };
    }
    if (d.state === 'cancelled') return { text: t('Abgebrochen'), cls: 'err' };
    return { text: t('Fehlgeschlagen'), cls: 'err' };
  }

  function row(d) {
    const ext = (d.name.match(/\.([a-z0-9]{1,5})$/i) || [])[1];
    const done = d.state === 'completed';
    const gone = done && !d.exists;
    const failed = !done && !running(d);
    const m = meta(d);
    const pct = d.total ? Math.min(100, (d.received / d.total) * 100) : 0;
    const act = (name, title, fn, cls) => el('button', { class: `icon-btn${cls ? ' ' + cls : ''}`, title, 'aria-label': title, html: svg(name), onclick: fn });
    const favicon = host(d.url) ? el('img', { src: `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(host(d.url))}`, alt: '', onerror: (e) => e.target.remove() }) : null;

    return el('div', { class: `item${gone ? ' gone' : ''}${failed ? ' failed' : ''}${d.paused ? ' paused' : ''}`, 'data-id': d.id },
      el('div', { class: 'file', html: svg('file') }, ext ? el('small', {}, ext) : null),
      el('div', { class: 'body' },
        el('button', { class: 'name', title: done && !gone ? t('Öffnen') : d.name, onclick: () => { if (done && !gone) api.open(d.id); } }, d.name),
        el('div', { class: 'source' }, favicon, el('a', { href: '#', title: d.url, onclick: (e) => { e.preventDefault(); api.openSource(d.id); } }, d.url)),
        running(d) ? el('div', { class: `bar${d.total ? '' : ' indeterminate'}` }, el('i', { style: `width:${pct}%` })) : null,
        el('div', { class: `meta${m.cls ? ' ' + m.cls : ''}` }, m.text)),
      el('div', { class: 'actions' },
        running(d) && !d.paused ? act('pause', t('Pausieren'), () => api.pause(d.id)) : null,
        running(d) && d.paused ? act('play', t('Fortsetzen'), () => api.resume(d.id), 'primary') : null,
        running(d) ? act('x', t('Abbrechen'), () => api.cancel(d.id)) : null,
        done && !gone ? act('folder', t('Im Ordner anzeigen'), () => api.show(d.id)) : null,
        (failed || gone) ? act('retry', t('Erneut herunterladen'), () => api.retry(d.id)) : null,
        !running(d) ? act('trash', t('Aus der Liste entfernen'), () => api.remove(d.id)) : null));
  }

  function render() {
    const q = $('#q').value.trim().toLowerCase();
    const shown = items.filter((d) => !q || d.name.toLowerCase().includes(q) || d.url.toLowerCase().includes(q));
    const groups = new Map();
    for (const d of shown) {
      const key = dayLabel(d.start);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    }
    $('#list').replaceChildren(...[...groups].map(([label, list]) =>
      el('section', { class: 'day' }, el('h2', {}, label), el('div', { class: 'card' }, list.map(row)))));

    const active = items.filter(running).length;
    $('#summary').textContent = !items.length ? '' : active
      ? (active === 1 ? t('1 Download läuft') : t('{n} Downloads laufen', { n: active }))
      : (items.length === 1 ? t('1 Download') : t('{n} Downloads', { n: items.length }));
    $('#empty').classList.toggle('hidden', shown.length > 0);
    $('#emptyTitle').textContent = items.length ? t('Keine Treffer') : t('Noch keine Downloads');
    $('#emptyText').textContent = items.length ? t('Versuche einen anderen Suchbegriff.') : t('Dateien, die du herunterlädst, erscheinen hier.');
    $('#clearAll').disabled = !items.some((d) => !running(d));
  }

  api.onChanged((d) => {
    if (d.removed) items = items.filter((x) => x.id !== d.id);
    else if (d.reset) items = d.items;
    else {
      const i = items.findIndex((x) => x.id === d.id);
      if (i >= 0) items[i] = d; else items.unshift(d);
      trackSpeed(d);
    }
    render();
  });

  $('#q').addEventListener('input', render);
  $('#openDir').addEventListener('click', () => api.openDir());
  $('#clearAll').addEventListener('click', () => api.clear());
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey && e.key.toLowerCase() === 'f') || (e.key === '/' && document.activeElement !== $('#q'))) { e.preventDefault(); $('#q').focus(); }
  });
  render();
})();
