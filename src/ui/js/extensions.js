'use strict';
/* Chrome-Erweiterungen: Knopf in der Symbolleiste und Einstellungsbereich */

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

  // ---- Symbolleiste ----
  function renderButton() {
    const active = list.filter((e) => e.loaded);
    btn.classList.toggle('hidden', INCOGNITO || !active.length);
  }
  function openPop() {
    pop?.remove();
    const active = list.filter((e) => e.loaded);
    pop = h('section', { class: 'pop ext-pop' },
      h('header', { class: 'pop-head' }, h('h3', {}, $t('Erweiterungen'))),
      ...active.map((ext) => h('button', {
        class: 'menu-item', title: ext.description || '',
        onclick: async () => {
          if (!ext.hasPopup) { Popover.close(); toast($t('Diese Erweiterung hat kein eigenes Fenster.'), 'puzzle'); return; }
          const r = btn.getBoundingClientRect();
          Popover.close();
          await F.extensions.popup(ext.key, { right: r.right, bottom: r.bottom });
        }
      }, iconFor(ext), h('span', { class: 'menu-label', 'data-no-i18n': '' }, ext.name))),
      h('div', { class: 'menu-sep' }),
      h('button', { class: 'menu-item', onclick: () => { Popover.close(); Settings.open('extensions'); } }, icon('settings'), h('span', { class: 'menu-label' }, $t('Erweiterungen verwalten'))));
    document.body.append(pop);
    const el = pop;
    Popover.open(el, { anchor: btn, onClose: () => { el.remove(); if (pop === el) pop = null; } });
  }
  btn.addEventListener('click', () => (pop && Popover.isOpen(pop) ? Popover.close() : openPop()));

  // ---- Einstellungen ----
  function renderSettings() {
    const root = $('#extList');
    if (!root) return;
    if (!list.length) {
      root.replaceChildren(h('div', { class: 'list-empty' }, $t('Noch keine Erweiterungen installiert')));
      return;
    }
    root.replaceChildren(...list.map((ext) => {
      const toggle = h('input', { type: 'checkbox' });
      toggle.checked = ext.enabled;
      toggle.addEventListener('change', async () => { await F.extensions.enable(ext.key, toggle.checked); });
      const sub = ext.error === 'MISSING' ? h('span', { class: 'ext-err' }, $t('Datei fehlt – bitte neu installieren'))
        : ext.enabled && ext.error ? h('span', { class: 'ext-err' }, $t('Konnte nicht geladen werden: {error}', { error: ext.error }))
        : h('span', { 'data-no-i18n': '' }, [ext.version && `v${ext.version}`, ext.description].filter(Boolean).join(' · '));
      return h('div', { class: `ext-row${ext.enabled ? '' : ' off'}` },
        iconFor(ext),
        h('div', { class: 'list-main' },
          h('b', { 'data-no-i18n': '' }, ext.name, ext.source === 'folder' ? h('span', { class: 'ext-tag' }, $t('Lokal')) : null, h('span', { class: 'ext-tag' }, `MV${ext.mv || 2}`)),
          sub),
        ext.hasOptions && ext.loaded ? h('button', {
          class: 'btn ghost', onclick: async () => { const url = await F.extensions.options(ext.key); if (url) { Settings.close(); Tabs.create(url); } }
        }, $t('Optionen')) : null,
        h('label', { class: 'switch' }, toggle, h('span')),
        h('button', {
          class: 'tb-btn sm', title: $t('Entfernen'), onclick: async () => {
            if (!(await confirmDialog({ title: $t('{name} entfernen?', { name: ext.name }), message: $t('Die Erweiterung und ihre Daten werden aus Falcon gelöscht.'), confirmLabel: $t('Entfernen'), danger: true }))) return;
            await F.extensions.remove(ext.key);
          }
        }, icon('trash')));
    }));
  }

  function installed(r) {
    if (r.ok) toast($t('{name} wurde installiert', { name: r.extension.name }), 'puzzle');
    else if (r.error !== 'CANCELLED') toast(errorText(r), 'warning');
  }
  $('#extStore').addEventListener('click', () => openForm({
    title: $t('Erweiterung installieren'),
    description: $t('Füge den Link einer Erweiterung aus dem Chrome Web Store ein, z. B. Bitwarden oder Dark Reader.'),
    fields: [{ name: 'input', label: $t('Link oder ID aus dem Chrome Web Store'), placeholder: 'https://chromewebstore.google.com/detail/…' }],
    submitLabel: $t('Installieren'),
    onSubmit: async ({ input }) => {
      const r = await F.extensions.installStore(input);
      if (!r.ok && r.error !== 'LOAD_FAILED') return errorText(r);
      installed(r);
    }
  }));
  $('#extFolder').addEventListener('click', async () => installed(await F.extensions.installFolder()));

  async function refresh() { list = await F.extensions.list(); renderButton(); if (Settings.section === 'extensions') renderSettings(); }
  F.on('extensions-changed', (l) => { list = l; renderButton(); if (Settings.section === 'extensions') renderSettings(); });
  if (!INCOGNITO) refresh(); else renderButton();

  return { renderSettings, refresh, get list() { return list; } };
})();
