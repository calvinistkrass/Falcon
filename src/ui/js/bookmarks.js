'use strict';
/*
 * Lesezeichen mit Ordnern: Leiste, Ordner-Menüs, Kontextmenüs, Bearbeiten/Verschieben,
 * Import/Export und Verwaltung in den Einstellungen.
 *
 * Ein Eintrag ist ein Lesezeichen { title, url } oder ein Ordner { folder: true, title, children }.
 * Einträge werden über ihren Pfad angesprochen: eine Liste von Indizes, z. B. [2, 0].
 */

const Bookmarks = (() => {
  const bar = $('#bookmarks');
  const tree = () => state.settings.bookmarks || [];
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const save = (next) => updateSettings({ bookmarks: next });

  // -------------------------------------------------------------------------
  // Baum-Helfer
  // -------------------------------------------------------------------------
  function listAt(root, folderPath) {
    let list = root;
    for (const i of folderPath) list = list[i].children;
    return list;
  }
  const nodeAt = (root, path) => listAt(root, path.slice(0, -1))[path[path.length - 1]];

  function* walk(list = tree(), path = []) {
    for (let i = 0; i < list.length; i++) {
      yield { node: list[i], path: [...path, i] };
      if (list[i].folder) yield* walk(list[i].children, [...path, i]);
    }
  }
  const flat = () => [...walk()].filter((x) => !x.node.folder).map((x) => x.node);
  const findPath = (url) => [...walk()].find((x) => !x.node.folder && x.node.url === url)?.path || null;
  const has = (url) => !!findPath(url);
  const folders = () => [...walk()].filter((x) => x.node.folder).map((x) => ({ path: x.path, title: x.node.title, depth: x.path.length - 1 }));
  const countIn = (folder) => folder.children.reduce((n, c) => n + (c.folder ? countIn(c) : 1), 0);

  function open(b, e = {}) {
    if (e.ctrlKey || e.metaKey || e.button === 1) Tabs.create(b.url, { background: true, index: state.tabs.indexOf(Tabs.active()) + 1 });
    else if (e.shiftKey) Tabs.create(b.url);
    else Tabs.navigate(b.url);
  }
  function openAll(folder) {
    let index = state.tabs.indexOf(Tabs.active()) + 1;
    for (const c of folder.children) if (!c.folder) Tabs.create(c.url, { background: true, index: index++ });
  }

  // -------------------------------------------------------------------------
  // Leiste
  // -------------------------------------------------------------------------
  const moreBtn = h('button', { class: 'bm-more hidden', onclick: () => overflowMenu() }, icon('chevronsRight'));
  let overflow = [];

  function barButton(item, path) {
    if (item.folder) {
      const btn = h('button', {
        class: 'bm bm-folder', title: item.title,
        onclick: () => folderMenu(path, { anchor: btn, align: 'start' }),
        oncontextmenu: (e) => { e.preventDefault(); e.stopPropagation(); itemMenu(path, { point: { x: e.clientX, y: e.clientY } }); }
      }, icon('folder'), h('span', {}, item.title));
      return btn;
    }
    return h('button', {
      class: 'bm', title: `${item.title}\n${item.url}`,
      onclick: (e) => open(item, e),
      onauxclick: (e) => { if (e.button === 1) open(item, e); },
      oncontextmenu: (e) => { e.preventDefault(); e.stopPropagation(); itemMenu(path, { point: { x: e.clientX, y: e.clientY } }); }
    }, faviconEl(item.url, 14), h('span', {}, item.title));
  }

  function renderBar() {
    bar.replaceChildren();
    if (!tree().length) {
      bar.append(h('span', { class: 'bm-empty' }, $t('Klicke in der Adressleiste auf den Stern, um Seiten hier abzulegen.')));
      return;
    }
    tree().forEach((item, i) => bar.append(barButton(item, [i])));
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
    items.forEach((el, i) => { if (el.getBoundingClientRect().right > limit) overflow.push(i); });
    overflow.forEach((i) => items[i].classList.add('overflow'));
  }
  new ResizeObserver(() => { if (tree().length) layout(); }).observe(bar);

  /** Menüeinträge für eine Liste von Lesezeichen/Ordnern; Ordner öffnen ein Untermenü an derselben Stelle. */
  function menuItems(list, basePath, position) {
    return list.map((item, i) => {
      const path = [...basePath, i];
      return item.folder
        ? { label: item.title, iconEl: icon('folder'), shortcut: '›', onClick: () => setTimeout(() => folderMenu(path, position), 0),
          onContextMenu: (e) => itemMenu(path, { point: { x: e.clientX, y: e.clientY } }) }
        : { label: item.title, iconEl: faviconEl(item.url, 16), onClick: (e) => open(item, e),
          onContextMenu: (e) => itemMenu(path, { point: { x: e.clientX, y: e.clientY } }) };
    });
  }

  function folderMenu(path, position) {
    const folder = nodeAt(tree(), path);
    if (!folder) return;
    const links = folder.children.filter((c) => !c.folder).length;
    const items = folder.children.length ? menuItems(folder.children, path, position) : [{ label: $t('Leerer Ordner'), disabled: true }];
    if (links > 1) items.push('-', { label: $t('Alle öffnen ({n})', { n: links }), icon: 'tab', onClick: () => openAll(folder) });
    showMenu(items, position);
  }

  function overflowMenu() {
    if (Popover.current?.anchor === moreBtn) return Popover.close();
    const position = { anchor: moreBtn, align: 'end' };
    showMenu(overflow.map((i) => menuItems([tree()[i]], [], position).map((it) => ({
      ...it,
      onClick: tree()[i].folder ? () => setTimeout(() => folderMenu([i], position), 0) : it.onClick,
      onContextMenu: (e) => itemMenu([i], { point: { x: e.clientX, y: e.clientY } })
    }))[0]), position);
  }

  // -------------------------------------------------------------------------
  // Kontextmenüs
  // -------------------------------------------------------------------------
  function itemMenu(path, position) {
    const item = nodeAt(tree(), path);
    if (!item) return;
    if (item.folder) {
      const links = item.children.filter((c) => !c.folder).length;
      showMenu([
        { label: $t('Alle öffnen ({n})', { n: links }), icon: 'tab', disabled: !links, onClick: () => openAll(item) },
        '-',
        { label: $t('Lesezeichen hinzufügen …'), icon: 'plus', onClick: () => edit(null, null, path) },
        { label: $t('Ordner hinzufügen …'), icon: 'folder', onClick: () => addFolder(path) },
        { label: $t('Umbenennen …'), icon: 'edit', onClick: () => renameFolder(path) },
        '-',
        { label: $t('Löschen'), icon: 'trash', danger: true, onClick: () => remove(path) }
      ], position);
      return;
    }
    showMenu([
      { label: $t('Öffnen'), icon: 'external', onClick: () => Tabs.navigate(item.url) },
      { label: $t('In neuem Tab öffnen'), icon: 'tab', shortcut: kb('Strg+Klick'), onClick: () => open(item, { ctrlKey: true }) },
      { label: $t('In Seitenleiste öffnen'), icon: 'pip', onClick: () => Sidebar.openUrl(item.url, item.title) },
      '-',
      { label: $t('Bearbeiten …'), icon: 'edit', onClick: () => edit(path) },
      { label: $t('Adresse kopieren'), icon: 'copy', onClick: () => { F.copy(item.url); toast($t('Adresse kopiert'), 'copy'); } },
      '-',
      { label: $t('Löschen'), icon: 'trash', danger: true, onClick: () => remove(path) }
    ], position);
  }

  bar.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const t = Tabs.active();
    const canAdd = t && !isInternal(t.url) && !has(t.url);
    showMenu([
      { label: $t('Aktuelle Seite hinzufügen'), icon: 'star', disabled: !canAdd, onClick: () => toggleCurrent() },
      { label: $t('Lesezeichen hinzufügen …'), icon: 'plus', onClick: () => edit(null) },
      { label: $t('Ordner hinzufügen …'), icon: 'folder', onClick: () => addFolder([]) },
      '-',
      { label: $t('Importieren …'), icon: 'download', onClick: importFile },
      { label: $t('Exportieren …'), icon: 'upload', onClick: exportFile },
      '-',
      { label: $t('Lesezeichenleiste anzeigen'), checked: true, shortcut: kb('Strg+Umschalt+B'), onClick: () => updateSettings({ showBookmarksBar: false }) }
    ], { point: { x: e.clientX, y: e.clientY } });
  });

  // -------------------------------------------------------------------------
  // Bearbeiten
  // -------------------------------------------------------------------------
  async function remove(path) {
    const next = clone(tree());
    const parent = listAt(next, path.slice(0, -1));
    const index = path[path.length - 1];
    const [removed] = parent.splice(index, 1);
    await save(next);
    toast($t('„{title}“ gelöscht', { title: removed.title }), 'trash', {
      label: $t('Rückgängig'),
      onClick: () => {
        const back = clone(tree());
        try { listAt(back, path.slice(0, -1)).splice(index, 0, removed); } catch { back.push(removed); }
        save(back);
      }
    });
  }

  const folderOptions = () => [{ value: '', label: $t('Lesezeichenleiste') },
    ...folders().map((f) => ({ value: f.path.join('.'), label: `${' '.repeat(f.depth + 1)}${f.title}` }))];

  /** path = vorhandenes Lesezeichen oder null für neu; folderPath = Zielordner für neue Lesezeichen */
  function edit(path, preset, folderPath = []) {
    const isNew = !path;
    const b = isNew ? (preset || { title: '', url: '' }) : nodeAt(tree(), path);
    const currentFolder = isNew ? folderPath : path.slice(0, -1);
    openForm({
      title: isNew ? $t('Lesezeichen hinzufügen') : $t('Lesezeichen bearbeiten'),
      fields: [
        { name: 'title', label: $t('Name'), value: b.title },
        { name: 'url', label: $t('Adresse'), value: b.url, placeholder: 'https://' },
        { name: 'folder', label: $t('Ordner'), type: 'select', options: folderOptions(), value: currentFolder.join('.') }
      ],
      submitLabel: $t('Speichern'),
      onSubmit: async ({ title, url, folder }) => {
        url = url.trim();
        if (!url) return $t('Bitte gib eine Adresse ein.');
        if (!looksLikeUrl(url)) return $t('Das sieht nicht nach einer gültigen Adresse aus.');
        url = toUrl(url);
        const entry = { title: title.trim() || hostOf(url) || url, url };
        const target = folder ? folder.split('.').map(Number) : [];
        const next = clone(tree());
        if (!isNew && target.join('.') === currentFolder.join('.')) {
          listAt(next, currentFolder)[path[path.length - 1]] = entry;
        } else {
          // Erst einfügen, dann das Original entfernen – so bleiben die Pfade gültig
          const marker = {};
          if (!isNew) listAt(next, currentFolder)[path[path.length - 1]] = marker;
          listAt(next, target).push(entry);
          if (!isNew) { const list = listAt(next, currentFolder); list.splice(list.indexOf(marker), 1); }
        }
        await save(next);
      }
    });
  }

  function addFolder(parentPath = []) {
    openForm({
      title: $t('Ordner hinzufügen'),
      fields: [{ name: 'title', label: $t('Name'), placeholder: $t('Neuer Ordner') }],
      submitLabel: $t('Speichern'),
      onSubmit: async ({ title }) => {
        const next = clone(tree());
        listAt(next, parentPath).push({ folder: true, title: title.trim() || $t('Neuer Ordner'), children: [] });
        await save(next);
      }
    });
  }

  function renameFolder(path) {
    const folder = nodeAt(tree(), path);
    openForm({
      title: $t('Ordner umbenennen'),
      fields: [{ name: 'title', label: $t('Name'), value: folder.title }],
      submitLabel: $t('Speichern'),
      onSubmit: async ({ title }) => {
        const next = clone(tree());
        nodeAt(next, path).title = title.trim() || folder.title;
        await save(next);
      }
    });
  }

  async function toggleCurrent(anchor) {
    const t = Tabs.active();
    if (!t || isInternal(t.url)) return;
    const path = findPath(t.url);
    if (path) {
      showMenu([
        { label: $t('Bearbeiten …'), icon: 'edit', onClick: () => edit(path) },
        { label: $t('Lesezeichen entfernen'), icon: 'trash', danger: true, onClick: () => remove(path) }
      ], anchor ? { anchor, align: 'end' } : { point: { x: innerWidth - 260, y: 84 } });
      return;
    }
    const title = (t.title || hostOf(t.url)).slice(0, 80);
    await save([...clone(tree()), { title, url: t.url }]);
    toast($t('Lesezeichen hinzugefügt'), 'star', { label: $t('Bearbeiten'), onClick: () => edit([tree().length - 1]) });
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

  // -------------------------------------------------------------------------
  // Verwaltung in den Einstellungen
  // -------------------------------------------------------------------------
  function managerRows(list, basePath, depth) {
    return list.flatMap((item, i) => {
      const path = [...basePath, i];
      const indent = { paddingLeft: `${16 + depth * 22}px` };
      if (item.folder) {
        return [h('div', { class: 'list-row bm-folder-row', style: indent },
          h('span', { class: 'bm-folder-ic' }, icon('folder')),
          h('div', { class: 'list-main' }, h('b', {}, item.title), h('span', {}, $t('{n} Lesezeichen', { n: countIn(item) }))),
          h('div', { class: 'list-actions' },
            h('button', { class: 'tb-btn sm', title: $t('Umbenennen …'), onclick: () => renameFolder(path) }, icon('edit')),
            h('button', { class: 'tb-btn sm', title: $t('Löschen'), onclick: () => remove(path) }, icon('trash')))),
        ...managerRows(item.children, path, depth + 1)];
      }
      return [h('div', { class: 'list-row', style: indent },
        faviconEl(item.url, 18),
        h('div', { class: 'list-main' }, h('b', {}, item.title), h('span', {}, item.url)),
        h('div', { class: 'list-actions' },
          h('button', { class: 'tb-btn sm', title: $t('Bearbeiten'), onclick: () => edit(path) }, icon('edit')),
          h('button', { class: 'tb-btn sm', title: $t('Löschen'), onclick: () => remove(path) }, icon('trash'))))];
    });
  }

  function renderManager() {
    const box = $('#bmList');
    const total = flat().length;
    $('#bmCount').textContent = total ? String(total) : '';
    if (!tree().length) {
      box.replaceChildren(h('div', { class: 'list-empty' }, h('b', {}, $t('Noch keine Lesezeichen')), $t('Importiere sie aus einem anderen Browser oder klicke auf den Stern in der Adressleiste.')));
      return;
    }
    box.replaceChildren(...managerRows(tree(), [], 0));
  }

  $('#bmImport').addEventListener('click', importFile);
  $('#bmExport').addEventListener('click', exportFile);
  $('#bmAddFolder').addEventListener('click', () => addFolder([]));

  on('settings', () => { renderBar(); renderManager(); });

  return { has, flat, toggleCurrent, edit, importFile, exportFile };
})();
