'use strict';
/*
 * Leseansicht: zeigt Artikel ohne Werbung und Seitenleisten (Mozilla Readability, wie in Firefox).
 * Der Artikel wird in einem iframe ohne Skripte angezeigt – fremdes HTML kann dort nichts ausführen.
 */

const Reader = (() => {
  const btn = $('#readerBtn');
  const view = $('#reader');
  const frame = $('#rdFrame');
  const SIZES = [15, 16, 17, 18, 20, 22, 24];
  let openFor = null; // Tab-ID, deren Artikel gerade angezeigt wird

  const prefs = () => ({ theme: 'dark', size: 18, ...(state.settings.reader || {}) });
  const wcId = (tab) => { try { return tab?.webview && tab.ready ? tab.webview.getWebContentsId() : null; } catch { return null; } };

  const THEMES = {
    dark: { bg: '#101113', fg: '#dcdce0', muted: '#8a8a93', link: '#a99cff', rule: 'rgba(255,255,255,.1)' },
    sepia: { bg: '#f4ecd8', fg: '#433422', muted: '#7d6b52', link: '#8a4b14', rule: 'rgba(67,52,34,.15)' },
    light: { bg: '#ffffff', fg: '#1d1d1f', muted: '#6e6e73', link: '#4b3bd6', rule: 'rgba(0,0,0,.1)' }
  };

  function documentFor(article) {
    const p = prefs();
    const c = THEMES[p.theme] || THEMES.dark;
    const minutes = Math.max(1, Math.round((article.length || 0) / 1200));
    const esc = (s) => String(s || '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    return `<!doctype html><html lang="${esc(article.lang || I18N.lang)}"><head><meta charset="utf-8"><style>
      html { background: ${c.bg}; }
      body { max-width: 720px; margin: 0 auto; padding: 56px 32px 96px; color: ${c.fg};
        font: ${p.size}px/1.7 Georgia, "Iowan Old Style", "Palatino Linotype", serif; -webkit-font-smoothing: antialiased; }
      header { margin-bottom: 32px; padding-bottom: 20px; border-bottom: 1px solid ${c.rule}; font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif; }
      .site { color: ${c.muted}; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; }
      h1 { margin: 8px 0 10px; font: 700 ${Math.round(p.size * 1.75)}px/1.2 "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; letter-spacing: -.01em; }
      .meta { color: ${c.muted}; font-size: 14px; }
      a { color: ${c.link}; }
      img, video, figure { max-width: 100%; height: auto; border-radius: 8px; }
      figure { margin: 24px 0; } figcaption { color: ${c.muted}; font-size: .85em; margin-top: 6px; }
      pre, code { font-family: "Cascadia Mono", Consolas, monospace; font-size: .85em; }
      pre { overflow: auto; padding: 14px; border-radius: 8px; background: ${c.rule}; }
      blockquote { margin: 20px 0; padding-left: 18px; border-left: 3px solid ${c.rule}; color: ${c.muted}; }
      table { border-collapse: collapse; max-width: 100%; } td, th { border: 1px solid ${c.rule}; padding: 6px 10px; }
      h2, h3 { font-family: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; line-height: 1.3; margin-top: 1.8em; }
    </style></head><body>
      <header>
        <div class="site">${esc(article.siteName || hostOf(article.url))}</div>
        <h1>${esc(article.title)}</h1>
        <div class="meta">${[article.byline ? esc(article.byline) : '', esc($t('{n} Min. Lesezeit', { n: minutes }))].filter(Boolean).join(' · ')}</div>
      </header>
      <main>${article.content}</main>
    </body></html>`;
  }

  async function open(tab = Tabs.active()) {
    const id = wcId(tab);
    if (id == null) return;
    const article = await F.reader.extract(id);
    if (!article || !article.content) { toast($t('Leseansicht ist für diese Seite nicht verfügbar'), 'warning'); return; }
    article.url = tab.url;
    openFor = tab.id;
    view.dataset.article = JSON.stringify(article);
    frame.srcdoc = documentFor(article);
    $('#rdSite').textContent = hostOf(tab.url);
    view.classList.remove('hidden');
    btn.classList.add('on');
    renderControls();
  }

  function close() {
    if (openFor == null) return;
    openFor = null;
    view.classList.add('hidden');
    frame.srcdoc = '';
    btn.classList.remove('on');
  }

  function toggle() { if (openFor === state.activeId) close(); else open(); }

  function rerender() {
    if (openFor == null || !view.dataset.article) return;
    const y = frame.contentWindow?.scrollY || 0;
    frame.srcdoc = documentFor(JSON.parse(view.dataset.article));
    frame.addEventListener('load', () => frame.contentWindow.scrollTo(0, y), { once: true });
  }

  function renderControls() {
    const p = prefs();
    $$('#rdTheme button').forEach((b) => b.classList.toggle('sel', b.dataset.v === p.theme));
    view.dataset.theme = p.theme;
  }

  // Links im Artikel öffnen in einem neuen Tab (das iframe selbst darf nicht navigieren)
  frame.addEventListener('load', () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      e.preventDefault();
      if (/^https?:/i.test(a.href)) Tabs.create(a.href, { index: state.tabs.indexOf(Tabs.active()) + 1 });
    });
    doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'F9') { e.preventDefault(); close(); } });
  });

  const setSize = (dir) => {
    const p = prefs();
    const i = Math.max(0, Math.min(SIZES.length - 1, SIZES.indexOf(p.size) + dir));
    updateSettings({ reader: { ...p, size: SIZES[i] === undefined ? 18 : SIZES[i] } }).then(rerender);
  };
  $('#rdClose').addEventListener('click', close);
  $('#rdSmaller').addEventListener('click', () => setSize(-1));
  $('#rdBigger').addEventListener('click', () => setSize(1));
  $('#rdTheme').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) updateSettings({ reader: { ...prefs(), theme: b.dataset.v } }).then(() => { renderControls(); rerender(); });
  });
  btn.addEventListener('click', toggle);

  // Nach dem Laden prüfen, ob die Seite ein Artikel ist
  async function check(tab) {
    const id = wcId(tab);
    tab.readerable = id != null && !isInternal(tab.url) ? await F.reader.check(id).catch(() => false) : false;
    if (tab.id === state.activeId) updateButton();
  }
  function updateButton() {
    const t = Tabs.active();
    btn.classList.toggle('hidden', !t?.readerable && openFor !== t?.id);
  }

  on('nav-state', () => {
    const t = Tabs.active();
    if (openFor != null && (openFor !== state.activeId || t?.loading)) close();
    if (t && !t.loading && t.readerable === undefined) check(t);
    updateButton();
  });
  on('tab-loaded', (tab) => check(tab));

  return { toggle, close };
})();
