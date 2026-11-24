'use strict';
/* Chrome-Erweiterungen: Knopf in der Symbolleiste (öffnen und verwalten), Installation aus dem Chrome Web Store */

const Extensions = (() => {
  const btn = $('#extBtn');
  let list = [];
  let pop = null;

  const ERRORS = {
    INVALID_ID: 'Kein gültiger Link oder keine gültige ID aus dem Chrome Web Store.',
    NOT_FOUND: 'Erweiterung nicht gefunden.',
    DOWNLOAD_FAILED: 'Download fehlgeschlagen. Bist du online?',
    BAD_PACKAGE: 'Das Paket ist beschädigt.',
    BAD_MANIFEST: 'Die manifest.json fehlt oder ist ungültig.'
  };
  const errorText = (r) => (r.error === 'LOAD_FAILED'
    ? $t('Falcon konnte diese Erweiterung nicht laden: {error}', { error: r.detail || '?' })
    : $t(ERRORS[r.error] || 'Das hat nicht geklappt ({code}).', { code: r.error }));

  function iconFor(ext) {
    if (ext.icon) return h('span', { class: 'ext-icon' }, h('img', { src: ext.icon, alt: '' }));
    return h('span', { class: 'ext-icon' }, icon('puzzle'));
  }

  // ---- Symbolleiste: öffnen, ein-/ausschalten, Optionen, entfernen ----
  function renderButton() {
    btn.classList.toggle('hidden', INCOGNITO || !list.length);
    if (!list.length && pop && Popover.isOpen(pop)) Popover.close();
  }
  function row(ext) {
    const toggle = h('input', { type: 'checkbox' });
    toggle.checked = ext.enabled;
    toggle.addEventListener('change', () => F.extensions.enable(ext.key, toggle.checked));
    const sub = ext.error === 'MISSING' ? h('span', { class: 'ext-err' }, $t('Datei fehlt – bitte neu installieren'))
      : ext.enabled && ext.error ? h('span', { class: 'ext-err' }, $t('Konnte nicht geladen werden: {error}', { error: ext.error }))
      : h('span', { 'data-no-i18n': '' }, ext.version ? `v${ext.version}` : '');
    return h('div', { class: `ext-row${ext.enabled ? '' : ' off'}`, title: ext.description || '' },
      iconFor(ext),
      h('div', {
        class: 'list-main', role: 'button',
        onclick: async () => {
          if (!ext.loaded) return;
          if (!ext.hasPopup) { Popover.close(); toast($t('Diese Erweiterung hat kein eigenes Fenster.'), 'puzzle'); return; }
          const r = btn.getBoundingClientRect();
          Popover.close();
          await F.extensions.popup(ext.key, { right: r.right, bottom: r.bottom });
        }
      }, h('b', { 'data-no-i18n': '' }, ext.name), sub),
      ext.hasOptions && ext.loaded ? h('button', {
        class: 'tb-btn sm', title: $t('Optionen'), onclick: async () => { const url = await F.extensions.options(ext.key); if (url) { Popover.close(); Tabs.create(url); } }
      }, icon('settings')) : null,
      h('label', { class: 'switch' }, toggle, h('span')),
      h('button', {
        class: 'tb-btn sm', title: $t('Entfernen'), onclick: async () => {
          Popover.close();
          if (!(await confirmDialog({ title: $t('{name} entfernen?', { name: ext.name }), message: $t('Die Erweiterung und ihre Daten werden aus Falcon gelöscht.'), confirmLabel: $t('Entfernen'), danger: true }))) return;
          await F.extensions.remove(ext.key);
        }
      }, icon('trash')));
  }
  function fillPop() { pop.replaceChildren(h('header', { class: 'pop-head' }, h('h3', {}, $t('Erweiterungen'))), ...list.map(row)); }
  function openPop() {
    pop?.remove();
    pop = h('section', { class: 'pop ext-pop' });
    fillPop();
    document.body.append(pop);
    const el = pop;
    Popover.open(el, { anchor: btn, onClose: () => { el.remove(); if (pop === el) pop = null; } });
  }
  btn.addEventListener('click', () => (pop && Popover.isOpen(pop) ? Popover.close() : openPop()));

  // Aus dem Chrome Web Store heraus installieren
  async function installFromPage(info, done) {
    if (INCOGNITO) { toast($t('Erweiterungen kannst du nur in normalen Fenstern installieren.'), 'puzzle'); return done(); }
    const name = info?.name || $t('Erweiterung');
    const existing = list.find((e) => e.storeId === info?.id);
    const ok = await confirmDialog({
      title: existing ? $t('„{name}“ aktualisieren?', { name }) : $t('„{name}“ zu Falcon hinzufügen?', { name }),
      message: $t('Falcon lädt die Erweiterung aus dem Chrome Web Store. Nicht jede Erweiterung funktioniert in Falcon vollständig.'),
      confirmLabel: existing ? $t('Aktualisieren') : $t('Hinzufügen')
    });
    if (!ok) return done();
    const r = await F.extensions.installStore(info.id);
    done();
    installed(r);
  }

  function installed(r) {
    if (r.ok) toast($t('{name} wurde installiert', { name: r.extension.name }), 'puzzle');
    else if (r.error !== 'CANCELLED') toast(errorText(r), 'warning');
  }
  const changed = (l) => { list = l; renderButton(); if (pop && Popover.isOpen(pop)) fillPop(); };
  async function refresh() { changed(await F.extensions.list()); }
  F.on('extensions-changed', changed);
  if (!INCOGNITO) refresh(); else renderButton();

  return { refresh, installFromPage, get list() { return list; } };
})();
