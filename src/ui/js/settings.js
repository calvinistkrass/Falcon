'use strict';
/* Einstellungen */

const Settings = (() => {
  const overlay = $('#settings');
  let section = 'general';

  // Übersetzt wird erst beim Anzeigen
  const SHORTCUTS = [
    ['Befehlspalette', 'Strg+K'], ['Neuer Tab', 'Strg+T'], ['Tab schließen', 'Strg+W'],
    ['Neues Inkognito-Fenster', 'Strg+Umschalt+N'], ['Leseansicht', 'F9'],
    ['Tab wiederherstellen', 'Strg+Umschalt+T'], ['Nächster Tab', 'Strg+Tab'],
    ['Tab 1–8 / letzter', 'Strg+1…9'], ['Adressleiste', 'Strg+L'],
    ['Verlauf', 'Strg+H'], ['Maus-Seitentasten', '◀ ▶'],
    ['Auf Seite suchen', 'Strg+F'], ['Lesezeichen', 'Strg+D'],
    ['Lesezeichenleiste', 'Strg+Umschalt+B'], ['Downloads', 'Strg+J'],
    ['Zoom', 'Strg+±'], ['Neu laden', 'F5'],
    ['Game Mode', 'Strg+Umschalt+G'], ['Einstellungen', 'Strg+,'],
    ['Vollbild', 'F11'], ['Entwicklertools', 'F12']
  ];
  const AUTH_METHOD = F.platform === 'win32' ? 'Windows Hello' : F.platform === 'darwin' ? 'Touch ID' : null;

  function open(target = section) {
    overlay.classList.remove('hidden');
    F.overlayDim(true);
    Popover.close();
    select(target);
    overlay.querySelector('.s-main').scrollTop = 0;
  }
  function close() {
    if (overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    if (!openDialogs) F.overlayDim(false);
  }
  const isOpen = () => !overlay.classList.contains('hidden');

  // Standardbrowser
  async function renderDefaultBrowser() {
    const { supported, isDefault } = await F.defaultBrowser.status().catch(() => ({ supported: false }));
    $('#sDefaultCard').classList.toggle('hidden', !supported);
    $('#sDefaultBtn').classList.toggle('hidden', !!isDefault);
    const ok = $('#sDefaultOk');
    ok.classList.toggle('hidden', !isDefault);
    ok.replaceChildren(icon('check'), $t('Falcon ist dein Standardbrowser'));
    $('#sDefaultText').textContent = isDefault
      ? $t('Links aus anderen Programmen öffnen sich in Falcon.')
      : $t('Links aus anderen Programmen in Falcon öffnen.');
  }
  $('#sDefaultBtn').addEventListener('click', async () => {
    await F.defaultBrowser.set();
    toast($t('Wähle in den Windows-Einstellungen bei „Webbrowser“ Falcon aus.'), 'settings');
  });
  // Nach der Rückkehr aus den Windows-Einstellungen neu prüfen
  window.addEventListener('focus', () => { if (isOpen() && section === 'general') renderDefaultBrowser(); });

  function select(name) {
    if (name === 'general') renderDefaultBrowser();
    if (name === 'account' && typeof Account !== 'undefined') Account.renderSettings();
    section = name;
    $$('.s-tab', overlay).forEach((t) => t.classList.toggle('sel', t.dataset.section === name));
    $$('.s-section', overlay).forEach((s) => s.classList.toggle('sel', s.dataset.section === name));
    emit('settings-section', name);
  }

  // -------------------------------------------------------------------------
  // Steuerelemente
  // -------------------------------------------------------------------------
  const langSel = $('#sLanguage');
  langSel.append(h('option', { value: 'auto' }), ...I18N.LANGUAGES.map((l) => h('option', { value: l.id }, l.name)));
  langSel.addEventListener('change', () => updateSettings({ language: langSel.value }));

  const engineSel = $('#sEngine');
  engineSel.append(...Object.entries(ENGINES).map(([id, e]) => h('option', { value: id }, e.name)));
  engineSel.addEventListener('change', () => updateSettings({ searchEngine: engineSel.value }));

  const startup = $('#sStartup');
  startup.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) updateSettings({ restoreSession: b.dataset.value === 'restore' });
  });

  const mouse = $('#sMouse');
  mouse.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) updateSettings({ mouseButtons: b.dataset.value });
  });

  const swatches = $('#sAccents');
  swatches.append(...ACCENTS.map((a) => h('button', {
    class: 'swatch', dataset: { value: a.value, name: a.name },
    onclick: () => updateSettings({ accent: a.value })
  })));
  // Eigene CSS-Variablen gehen nur über setProperty
  $$('.swatch', swatches).forEach((s) => s.style.setProperty('--c', s.dataset.value));

  const toggles = { sBookmarksBar: 'showBookmarksBar', sSidebar: 'showSidebar', sHud: 'showHud', sGame: 'gameMode', sAdblock: 'adblock', sAdblockAnnoy: 'adblockAnnoyances', sPwAuth: 'pwRequireAuth', sDlAsk: 'downloadAsk' };
  for (const [id, key] of Object.entries(toggles)) {
    $(`#${id}`).addEventListener('change', (e) => {
      if (key === 'gameMode') Perf.setGameMode(e.target.checked);
      else updateSettings({ [key]: e.target.checked });
    });
  }
  const showDir = async () => { $('#dlDir').textContent = await F.downloads.dir(); };
  $('#dlChooseDir').addEventListener('click', async () => {
    const dir = await F.downloads.chooseDir();
    if (dir) { showDir(); toast($t('Downloads werden jetzt hier gespeichert'), 'folder'); }
  });
  $('#dlOpenDir').addEventListener('click', () => F.downloads.openDir());
  on('settings-section', (name) => { if (name === 'downloads') showDir(); });

  const nt = () => ({ image: '', showShortcuts: true, showClock: true, ...(state.settings.newtab || {}) });
  $('#sNtShortcuts').addEventListener('change', (e) => updateSettings({ newtab: { ...nt(), showShortcuts: e.target.checked } }));
  $('#sNtClock').addEventListener('change', (e) => updateSettings({ newtab: { ...nt(), showClock: e.target.checked } }));
  $('#ntBgChoose').addEventListener('click', async () => {
    const s = await F.newtab.chooseImage();
    if (s) { state.settings = s; emit('settings', s); toast($t('Hintergrundbild gesetzt'), 'image'); }
  });
  $('#ntBgClear').addEventListener('click', async () => { const s = await F.newtab.clearImage(); state.settings = s; emit('settings', s); });

  $('#sSleep').addEventListener('change', (e) => updateSettings({ sleepMinutes: Number(e.target.value) }));
  $('#sRamLimit').addEventListener('change', (e) => updateSettings({ ramLimit: Number(e.target.value) }));

  $('#sClearHistory').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: $t('Verlauf löschen?'), message: $t('Besuchte Seiten werden nicht mehr in der Adressleiste vorgeschlagen.'), confirmLabel: $t('Löschen'), danger: true });
    if (ok) { History.clear(); toast($t('Verlauf gelöscht'), 'trash'); }
  });
  $('#sClearData').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: $t('Browserdaten löschen?'),
      message: $t('Cache, Cookies und gespeicherte Website-Daten werden entfernt. Du wirst auf allen Websites abgemeldet. Passwörter und Lesezeichen bleiben erhalten.'),
      confirmLabel: $t('Daten löschen'),
      danger: true
    });
    if (!ok) return;
    await F.clearData();
    toast($t('Browserdaten gelöscht'), 'trash');
  });

  function sync(s) {
    langSel.value = s.language || 'auto';
    langSel.options[0].textContent = $t('Systemsprache');
    engineSel.value = s.searchEngine;
    $$('button', startup).forEach((b) => b.classList.toggle('sel', (b.dataset.value === 'restore') === !!s.restoreSession));
    $$('button', mouse).forEach((b) => b.classList.toggle('sel', b.dataset.value === (s.mouseButtons || 'history')));
    $$('.swatch', swatches).forEach((b) => {
      b.classList.toggle('sel', b.dataset.value.toLowerCase() === String(s.accent).toLowerCase());
      b.title = $t(b.dataset.name);
    });
    for (const [id, key] of Object.entries(toggles)) $(`#${id}`).checked = !!s[key];
    $('#sSleep').value = String(s.sleepMinutes);
    $('#sRamLimit').value = String(s.ramLimit || 0);
    $('#sNtShortcuts').checked = s.newtab?.showShortcuts !== false;
    $('#sNtClock').checked = s.newtab?.showClock !== false;
    $('#ntBgClear').classList.toggle('hidden', !s.newtab?.image);
    renderTexts();
  }

  /** Texte, die per JavaScript entstehen und bei einem Sprachwechsel neu gesetzt werden. */
  function renderTexts() {
    $('#sKeys').replaceChildren(...SHORTCUTS.map(([label, combo]) => h('div', { class: 'key-row' },
      h('span', {}, $t(label)), h('span', {}, kb(combo).split('+').map((k) => h('kbd', {}, k))))));
    $('#aboutVersion').textContent = $t('Version {v}', { v: F.version });
    $('#pwAuthDesc').textContent = AUTH_METHOD
      ? $t('Vor dem Anzeigen, Kopieren, Importieren und Exportieren von Passwörtern bestätigen – mit einem Passkey oder {method}.', { method: AUTH_METHOD })
      : $t('Vor dem Anzeigen, Kopieren, Importieren und Exportieren von Passwörtern mit einem Passkey bestätigen.');
  }

  // -------------------------------------------------------------------------
  // Statische Inhalte
  // -------------------------------------------------------------------------
  $('#sLogo').src = F.logoUrl;
  $('#aboutLogo').src = F.logoUrl;
  $('#abLogo').src = F.logoUrl;
  $('#shieldLogo').src = F.logoUrl;
  $('#shPopLogo').src = F.logoUrl;
  $('#vChrome').textContent = F.versions.chrome;
  $('#vElectron').textContent = F.versions.electron;
  $('#vNode').textContent = F.versions.node;

  $$('.s-tab', overlay).forEach((t) => t.addEventListener('click', () => select(t.dataset.section)));
  $('#settingsClose').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !Popover.current) { e.stopPropagation(); close(); }
  });

  on('settings', sync);

  return { open, close, isOpen, get section() { return isOpen() ? section : null; } };
})();
