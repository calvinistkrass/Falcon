'use strict';
/* Befehlspalette (Strg+K): offene Tabs, Befehle, Lesezeichen und Verlauf durchsuchen */

const Palette = (() => {
  let overlay = null;
  let input, list;
  let results = [];
  let sel = 0;

  const SECTIONS = [
    ['general', 'Allgemein', 'sliders'], ['appearance', 'Darstellung', 'palette'],
    ['performance', 'Leistung & Game Mode', 'gamepad'], ['history', 'Verlauf', 'clock'],
    ['adblock', 'Werbeblocker', 'block'], ['downloads', 'Downloads', 'download'],
    ['privacy', 'Datenschutz', 'shield'], ['passwords', 'Passwörter', 'key'],
    ['bookmarks', 'Lesezeichen', 'bookmark'], ['shortcuts', 'Tastenkürzel', 'keyboard'],
    ['about', 'Über Falcon', 'info']
  ];

  function commands() {
    const t = Tabs.active();
    const web = !!t && /^https?:/.test(t.url);
    const s = state.settings;
    const list = [
      { label: 'Neuer Tab', icon: 'plus', key: 'Strg+T', run: () => Tabs.create() },
      { label: 'Neues Inkognito-Fenster', icon: 'incognito', key: 'Strg+Umschalt+N', run: () => F.newIncognitoWindow() },
      { label: 'Tab wiederherstellen', icon: 'restore', key: 'Strg+Umschalt+T', run: () => Tabs.reopen(), when: Tabs.closedCount > 0 },
      { label: 'Tab schließen', icon: 'x', key: 'Strg+W', run: () => t && Tabs.close(t.id), when: !!t },
      { label: 'Neu laden', icon: 'reload', key: 'F5', run: () => Tabs.reload(t), when: web },
      { label: s.gameMode ? 'Game Mode ausschalten' : 'Game Mode einschalten', icon: 'gamepad', key: 'Strg+Umschalt+G', words: 'game mode gaming', run: () => Perf.setGameMode(!s.gameMode) },
      { label: 'Inaktive Tabs schlafen legen', icon: 'moon', words: 'sleep ram', run: () => { const n = Tabs.sleepInactive(); toast($t('{n} Tabs schlafen jetzt', { n }), 'moon'); } },
      { label: 'Leseansicht', icon: 'book', key: 'F9', words: 'reader', run: () => Reader.toggle(), when: web },
      { label: 'Bild-in-Bild', icon: 'pip', words: 'pip video', run: () => togglePictureInPicture(), when: web },
      { label: 'Als Overlay öffnen', icon: 'pip', words: 'overlay', run: () => F.openOverlay(t.url), when: web },
      { label: 'Auf Seite suchen', icon: 'search', key: 'Strg+F', words: 'find', run: () => Find.open(), when: web },
      { label: Bookmarks.has(t?.url) ? 'Lesezeichen bearbeiten' : 'Lesezeichen hinzufügen', icon: 'star', key: 'Strg+D', words: 'bookmark', run: () => Bookmarks.toggleCurrent($('#bookmarkBtn')), when: web },
      { label: s.showBookmarksBar ? 'Lesezeichenleiste ausblenden' : 'Lesezeichenleiste einblenden', icon: 'bookmark', key: 'Strg+Umschalt+B', run: () => updateSettings({ showBookmarksBar: !s.showBookmarksBar }) },
      { label: 'Downloads', icon: 'download', key: 'Strg+J', words: 'falcon://downloads', run: () => openInternalPage(DOWNLOADS_URL) },
      { label: 'Verlauf', icon: 'clock', key: 'Strg+H', words: 'history', run: () => Settings.open('history') },
      { label: 'Vollbild', icon: 'maximize', key: 'F11', words: 'fullscreen', run: () => F.win('fullscreen') },
      { label: 'Entwicklertools', icon: 'code', key: 'F12', words: 'devtools', run: () => t?.webview?.openDevTools(), when: web },
      { label: 'Einstellungen', icon: 'settings', key: 'Strg+,', words: 'settings', run: () => Settings.open() },
      ...SECTIONS.map(([id, name, icon]) => ({
        label: $t('Einstellungen › {name}', { name: $t(name) }), raw: true, icon, words: `settings ${id}`, run: () => Settings.open(id)
      }))
    ];
    return list.filter((c) => c.when !== false).map((c) => ({ ...c, kind: 'cmd', title: c.raw ? c.label : $t(c.label) }));
  }

  // Alle Suchwörter müssen vorkommen; Treffer am Wortanfang zählen mehr
  function match(q, ...fields) {
    const hay = fields.filter(Boolean).join(' ').toLowerCase();
    let score = 0;
    for (const w of q) {
      const i = hay.indexOf(w);
      if (i < 0) return 0;
      score += i === 0 ? 3 : /[\s/.›-]/.test(hay[i - 1]) ? 2 : 1;
    }
    return score;
  }

  function search(text) {
    const q = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const active = Tabs.active();
    const tabs = state.tabs.filter((t) => t !== active).map((t) => ({
      kind: 'tab', title: Tabs.displayTitle(t), sub: isNewTab(t.url) ? '' : t.url, url: t.url, tab: t
    }));
    const cmds = commands();
    if (!q.length) return [...tabs.slice(0, 5), ...cmds.slice(0, 8)];

    const rank = (items, fields, limit) => items
      .map((it) => ({ it, s: match(q, ...fields(it)) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map((x) => x.it);

    const seen = new Set(state.tabs.map((t) => t.url));
    const bookmarks = Bookmarks.flat()
      .filter((b) => !seen.has(b.url))
      .map((b) => ({ kind: 'bookmark', title: b.title || b.url, sub: b.url, url: b.url }));
    bookmarks.forEach((b) => seen.add(b.url));
    const history = History.query(text, 6)
      .filter((e) => !seen.has(e.url))
      .map((e) => ({ kind: 'history', title: e.title || e.url, sub: e.url, url: e.url }));

    return [
      ...rank(tabs, (t) => [t.title, t.url], 5),
      ...rank(cmds, (c) => [c.title, c.label, c.words], 6),
      ...rank(bookmarks, (b) => [b.title, b.url], 5),
      ...history
    ];
  }

  const GROUPS = { tab: 'Offene Tabs', cmd: 'Befehle', bookmark: 'Lesezeichen', history: 'Verlauf' };

  function render() {
    results = search(input.value);
    sel = Math.min(sel, Math.max(0, results.length - 1));
    const rows = [];
    let group = null;
    results.forEach((r, i) => {
      if (r.kind !== group) { group = r.kind; rows.push(h('div', { class: 'pal-group' }, $t(GROUPS[r.kind]))); }
      const lead = r.kind === 'cmd' ? h('span', { class: 'pal-icon' }, icon(r.icon)) : faviconEl(r.url, 16);
      rows.push(h('div', {
        class: `pal-item${i === sel ? ' sel' : ''}`, role: 'option', 'aria-selected': String(i === sel),
        onmousemove: () => { if (sel !== i) { sel = i; highlight(); } },
        onclick: () => run(r)
      },
      lead,
      h('span', { class: 'pal-text' }, h('b', { 'data-no-i18n': '' }, r.title), r.sub ? h('span', { 'data-no-i18n': '' }, r.sub) : null),
      r.kind === 'tab' ? h('span', { class: 'pal-hint' }, $t('Wechseln')) : r.key ? h('span', { class: 'pal-key' }, ...kb(r.key).split('+').map((k) => h('kbd', {}, k))) : null));
    });
    if (!results.length) rows.push(h('div', { class: 'pal-empty' }, $t('Keine Treffer')));
    list.replaceChildren(...rows);
  }

  function highlight() {
    $$('.pal-item', list).forEach((el, i) => {
      el.classList.toggle('sel', i === sel);
      el.setAttribute('aria-selected', String(i === sel));
      if (i === sel) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function run(r) {
    close();
    if (r.kind === 'tab') return Tabs.activate(r.tab.id);
    if (r.kind === 'cmd') return r.run();
    const t = Tabs.active();
    if (t && isNewTab(t.url)) Tabs.navigate(r.url, t); else Tabs.create(r.url);
  }

  function open() {
    if (overlay) { input.select(); return; }
    Popover.close();
    input = h('input', {
      class: 'pal-input', type: 'text', spellcheck: false, autocomplete: 'off',
      placeholder: $t('Tabs, Lesezeichen, Verlauf und Befehle durchsuchen')
    });
    list = h('div', { class: 'pal-list', role: 'listbox' });
    const box = h('div', { class: 'palette', role: 'dialog', 'aria-label': $t('Befehlspalette') },
      h('div', { class: 'pal-search' }, icon('search'), input, h('kbd', {}, 'Esc')),
      list);
    overlay = h('div', { class: 'overlay pal-overlay', onmousedown: (e) => { if (e.target === overlay) close(); } }, box);
    document.body.append(overlay);
    F.overlayDim(true);

    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, results.length); highlight(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + results.length) % Math.max(1, results.length); highlight(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (results[sel]) run(results[sel]); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    });
    sel = 0;
    render();
    input.focus();
  }

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    if (!openDialogs && !Settings.isOpen()) F.overlayDim(false);
    Tabs.active()?.webview?.focus();
  }

  const isOpen = () => !!overlay;
  const toggle = () => (overlay ? close() : open());

  return { open, close, toggle, isOpen };
})();
