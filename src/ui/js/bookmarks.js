'use strict';
/* Lesezeichen: Leiste, Kontextmenüs, Bearbeiten, Import/Export, Verwaltung in den Einstellungen */

const Bookmarks = (() => {
  const bar = $('#bookmarks');
  const all = () => state.settings.bookmarks || [];
  const has = (url) => all().some((b) => b.url === url);
  const save = (list) => updateSettings({ bookmarks: list });

  function open(b, e = {}) {
    if (e.ctrlKey || e.metaKey || e.button === 1) Tabs.create(b.url, { background: true, index: state.tabs.indexOf(Tabs.active()) + 1 });
    else if (e.shiftKey) Tabs.create(b.url);
    else Tabs.navigate(b.url);
  }

  // „»“-Knopf für Lesezeichen, die nicht mehr in die Leiste passen
  const moreBtn = h('button', { class: 'bm-more hidden', onclick: () => overflowMenu() }, icon('chevronsRight'));
  let overflow = [];

  function renderBar() {
    bar.replaceChildren();
    if (!all().length) {
      bar.append(h('span', { class: 'bm-empty' }, $t('Klicke in der Adressleiste auf den Stern, um Seiten hier abzulegen.')));
      return;
    }
    all().forEach((b, i) => {
      bar.append(h('button', {
        class: 'bm', title: `${b.title}\n${b.url}`,
        onclick: (e) => open(b, e),
        onauxclick: (e) => { if (e.button === 1) open(b, e); },
        oncontextmenu: (e) => { e.preventDefault(); e.stopPropagation(); itemMenu(i, { point: { x: e.clientX, y: e.clientY } }); }
      }, faviconEl(b.url, 14), h('span', {}, b.title)));
    });
    moreBtn.title = $t('Weitere Lesezeichen');
    bar.append(moreBtn);
    layout();
  }

  function layout() {
    const items = $$('.bm', bar);
    items.forEach((el) => el.classList.remove('overflow'));
    moreBtn.classList.add('hidden');
    overflow = [];
    if (!items.length || bar.scrollWidth <= bar.clientWidth) return;

    moreBtn.classList.remove('hidden');
    const limit = bar.getBoundingClientRect().right - moreBtn.offsetWidth - 10;
    items.forEach((el, i) => {
      if (el.getBoundingClientRect().right > limit) overflow.push(i);
    });
    // erst nach dem Messen ausblenden, sonst verschiebt sich die Leiste beim Zählen
    overflow.forEach((i) => items[i].classList.add('overflow'));
  }

  function overflowMenu() {
    if (Popover.current?.anchor === moreBtn) return Popover.close();
    showMenu(overflow.map((i) => {
      const b = all()[i];
      return {
        label: b.title, iconEl: faviconEl(b.url, 16),
        onClick: (e) => open(b, e),
        onContextMenu: (e) => itemMenu(i, { point: { x: e.clientX, y: e.clientY } })
      };
    }), { anchor: moreBtn, align: 'end' });
  }

  new ResizeObserver(() => { if (all().length) layout(); }).observe(bar);

  function itemMenu(index, position) {
    const b = all()[index];
    if (!b) return;
    showMenu([
      { label: $t('Öffnen'), icon: 'external', onClick: () => Tabs.navigate(b.url) },
      { label: $t('In neuem Tab öffnen'), icon: 'tab', shortcut: kb('Strg+Klick'), onClick: () => open(b, { ctrlKey: true }) },
      { label: $t('In Seitenleiste öffnen'), icon: 'pip', onClick: () => Sidebar.openUrl(b.url, b.title) },
      '-',
      { label: $t('Bearbeiten …'), icon: 'edit', onClick: () => edit(index) },
      { label: $t('Adresse kopieren'), icon: 'copy', onClick: () => { F.copy(b.url); toast($t('Adresse kopiert'), 'copy'); } },
      '-',
      { label: $t('Löschen'), icon: 'trash', danger: true, onClick: () => remove(index) }
    ], position);
  }

  async function remove(index) {
    const list = [...all()];
    const [removed] = list.splice(index, 1);
    await save(list);
    toast($t('„{title}“ gelöscht', { title: removed.title }), 'trash', {
      label: $t('Rückgängig'),
      onClick: () => { const back = [...all()]; back.splice(index, 0, removed); save(back); }
    });
  }

  function edit(index, preset) {
    const isNew = index < 0;
    const b = isNew ? (preset || { title: '', url: '' }) : all()[index];
    openForm({
      title: isNew ? $t('Lesezeichen hinzufügen') : $t('Lesezeichen bearbeiten'),
      fields: [
        { name: 'title', label: $t('Name'), value: b.title },
        { name: 'url', label: $t('Adresse'), value: b.url, placeholder: 'https://' }
      ],
      submitLabel: $t('Speichern'),
      onSubmit: async ({ title, url }) => {
        url = url.trim();
        if (!url) return $t('Bitte gib eine Adresse ein.');
        if (!looksLikeUrl(url)) return $t('Das sieht nicht nach einer gültigen Adresse aus.');
        url = toUrl(url);
        const entry = { title: title.trim() || hostOf(url) || url, url };
        const list = [...all()];
        if (isNew) list.push(entry); else list[index] = entry;
        await save(list);
      }
    });
  }

  async function toggleCurrent(anchor) {
    const t = Tabs.active();
    if (!t || isInternal(t.url)) return;
    const index = all().findIndex((b) => b.url === t.url);
    if (index >= 0) {
      showMenu([
        { label: $t('Bearbeiten …'), icon: 'edit', onClick: () => edit(index) },
        { label: $t('Lesezeichen entfernen'), icon: 'trash', danger: true, onClick: () => remove(index) }
      ], anchor ? { anchor, align: 'end' } : { point: { x: innerWidth - 260, y: 84 } });
      return;
    }
    const title = (t.title || hostOf(t.url)).slice(0, 80);
    await save([...all(), { title, url: t.url }]);
    toast($t('Lesezeichen hinzugefügt'), 'star', { label: $t('Bearbeiten'), onClick: () => edit(all().length - 1) });
  }

  async function importFile() {
    const r = await F.bookmarks.import();
    if (!r) return;
    if (r.error) return toast($t('Import fehlgeschlagen: {error}', { error: r.error }), 'warning');
    state.settings.bookmarks = r.bookmarks;
    emit('settings', state.settings);
    const skipped = r.total - r.added;
    toast(skipped
      ? $t('{added} Lesezeichen importiert, {skipped} bereits vorhanden', { added: r.added, skipped })
      : $t('{added} Lesezeichen importiert', { added: r.added }), 'download');
  }
  async function exportFile() {
    const r = await F.bookmarks.export();
    if (r) toast($t('{n} Lesezeichen exportiert', { n: r.count }), 'upload');
  }

  bar.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const t = Tabs.active();
    const canAdd = t && !isInternal(t.url) && !has(t.url);
    showMenu([
      { label: $t('Aktuelle Seite hinzufügen'), icon: 'star', disabled: !canAdd, onClick: () => toggleCurrent() },
      { label: $t('Lesezeichen hinzufügen …'), icon: 'plus', onClick: () => edit(-1) },
      '-',
      { label: $t('Importieren …'), icon: 'download', onClick: importFile },
      { label: $t('Exportieren …'), icon: 'upload', onClick: exportFile },
      '-',
      { label: $t('Lesezeichenleiste anzeigen'), checked: true, shortcut: kb('Strg+Umschalt+B'), onClick: () => updateSettings({ showBookmarksBar: false }) }
    ], { point: { x: e.clientX, y: e.clientY } });
  });

  // -------------------------------------------------------------------------
  // Verwaltung in den Einstellungen
  // -------------------------------------------------------------------------
  function renderManager() {
    const box = $('#bmList');
    $('#bmCount').textContent = all().length ? String(all().length) : '';
    if (!all().length) {
      box.replaceChildren(h('div', { class: 'list-empty' }, h('b', {}, $t('Noch keine Lesezeichen')), $t('Importiere sie aus einem anderen Browser oder klicke auf den Stern in der Adressleiste.')));
      return;
    }
    box.replaceChildren(...all().map((b, i) => h('div', { class: 'list-row' },
      faviconEl(b.url, 18),
      h('div', { class: 'list-main' }, h('b', {}, b.title), h('span', {}, b.url)),
      h('div', { class: 'list-actions' },
        h('button', { class: 'tb-btn sm', title: $t('Bearbeiten'), onclick: () => edit(i) }, icon('edit')),
        h('button', { class: 'tb-btn sm', title: $t('Löschen'), onclick: () => remove(i) }, icon('trash'))))));
  }

  $('#bmImport').addEventListener('click', importFile);
  $('#bmExport').addEventListener('click', exportFile);

  on('settings', () => { renderBar(); renderManager(); });

  return { has, toggleCurrent, edit, importFile, exportFile };
})();
