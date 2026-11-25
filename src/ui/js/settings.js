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
    ['Game Mode', 'Strg+Umschalt+G'], ['Screenshot', 'Strg+Umschalt+S'], ['Einstellungen', 'Strg+,'],
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
    const done = await F.defaultBrowser.set().catch(() => false);
    await renderDefaultBrowser();
    if (done) { toast($t('Falcon ist dein Standardbrowser'), 'check'); return; }
    const hint = F.platform === 'darwin' ? $t('Bestätige die Frage von macOS. Erscheint keine: Systemeinstellungen → Schreibtisch & Dock → Standard-Webbrowser.')
      : F.platform === 'linux' ? $t('Wähle in den Systemeinstellungen unter „Standardanwendungen“ bei „Web“ Falcon aus.')
        : $t('Wähle in den Windows-Einstellungen bei „Webbrowser“ Falcon aus.');
    toast(hint, 'settings');
    $('#sDefaultText').textContent = hint; // bleibt stehen, bis Falcon wieder den Fokus bekommt
  });
  // Nach der Rückkehr aus den Einstellungen des Systems neu prüfen
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
  // Eigene Startseite: Adresse prüfen und ergänzen (example.com → https://example.com)
  const startUrl = $('#sStartUrl');
  async function saveStartUrl() {
    const raw = startUrl.value.trim();
    if (raw === (state.settings.startUrl || '')) { startUrl.classList.remove('bad'); return; }
    const url = !raw ? '' : /^https?:\/\//i.test(raw) ? raw : /^[a-z][a-z\d+.-]*:(?!\d)/i.test(raw) || !looksLikeUrl(raw) ? null : toUrl(raw);
    let ok = url === '';
    if (url) { try { ok = /^https?:$/.test(new URL(url).protocol); } catch { ok = false; } }
    startUrl.classList.toggle('bad', !ok);
    if (!ok) { toast($t('Das sieht nicht nach einer gültigen Adresse aus.'), 'warning'); return; }
    await updateSettings({ startUrl: url });
    if (url) toast($t('Startseite gespeichert'), 'check');
  }
  startUrl.addEventListener('change', saveStartUrl);
  startUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') startUrl.blur(); });
  startup.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const v = b.dataset.value;
    updateSettings(v === 'restore' ? { restoreSession: true } : { restoreSession: false, startPage: v }).then(() => { if (v === 'custom') startUrl.focus(); });
  });

  const mouse = $('#sMouse');
  mouse.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) updateSettings({ mouseButtons: b.dataset.value });
  });

  const swatches = $('#sAccents');
  swatches.append(...ACCENTS.map((a) => h('button', {
    class: 'swatch', dataset: { value: a.value, name: a.name },
    onclick: () => { if (!Updates.blocked()) updateSettings({ accent: a.value }); }
  })));
  // Eigene CSS-Variablen gehen nur über setProperty
  $$('.swatch', swatches).forEach((s) => s.style.setProperty('--c', s.dataset.value));

  // Eigene Farbe: Farbwähler des Systems, Vorschau beim Ziehen, gespeichert wird beim Schließen
  const ownColor = h('input', { type: 'color', id: 'sAccentOwn' });
  const ownSwatch = h('label', { class: 'swatch own' }, ownColor);
  swatches.append(ownSwatch);
  ownColor.addEventListener('click', (e) => { if (Updates.blocked()) e.preventDefault(); });
  ownColor.addEventListener('input', () => { if (!state.settings.rgbMode) applyAccent(ownColor.value); ownSwatch.style.setProperty('--c', ownColor.value); });
  ownColor.addEventListener('change', () => updateSettings({ accent: ownColor.value }));

  $('#sRgb').addEventListener('change', (e) => {
    if (Updates.blocked()) { e.target.checked = false; return; }
    updateSettings({ rgbMode: e.target.checked });
  });

  $('#wishEdit').addEventListener('click', () => { if (!Updates.blocked()) Wishlist.dialog(); });

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

  const nt = () => ({ image: '', showShortcuts: true, showClock: true, showDeals: true, ...(state.settings.newtab || {}) });
  $('#sNtDeals').addEventListener('change', (e) => updateSettings({ newtab: { ...nt(), showDeals: e.target.checked } }));
  $('#sNtShortcuts').addEventListener('change', (e) => updateSettings({ newtab: { ...nt(), showShortcuts: e.target.checked } }));
  $('#sNtClock').addEventListener('change', (e) => updateSettings({ newtab: { ...nt(), showClock: e.target.checked } }));
  $('#ntBgChoose').addEventListener('click', async () => {
    const s = await F.newtab.chooseImage();
    if (s) { state.settings = s; emit('settings', s); toast($t('Hintergrundbild gesetzt'), 'image'); }
  });
  $('#ntBgClear').addEventListener('click', async () => { const s = await F.newtab.clearImage(); state.settings = s; emit('settings', s); });

  $('#sSleep').addEventListener('change', (e) => updateSettings({ sleepMinutes: Number(e.target.value) }));
  $('#sRamLimit').addEventListener('change', (e) => updateSettings({ ramLimit: Number(e.target.value) }));
  $('#sNetLimit').addEventListener('change', (e) => updateSettings({ netLimit: Number(e.target.value) }));
  $('#sNetGameOnly').addEventListener('change', (e) => updateSettings({ netLimitGameOnly: e.target.checked }));

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
    $$('button', startup).forEach((b) => b.classList.toggle('sel', b.dataset.value === (s.restoreSession ? 'restore' : s.startPage === 'custom' ? 'custom' : 'falcon')));
    $('#startUrlRow').classList.toggle('hidden', !!s.restoreSession || s.startPage !== 'custom');
    if (document.activeElement !== startUrl) { startUrl.value = s.startUrl || ''; startUrl.classList.remove('bad'); }
    $$('button', mouse).forEach((b) => b.classList.toggle('sel', b.dataset.value === (s.mouseButtons || 'history')));
    const accent = String(s.accent).toLowerCase();
    const own = !ACCENTS.some((a) => a.value === accent);
    $$('.swatch[data-value]', swatches).forEach((b) => {
      b.classList.toggle('sel', b.dataset.value.toLowerCase() === accent);
      b.title = $t(b.dataset.name);
    });
    ownSwatch.classList.toggle('sel', own);
    ownSwatch.classList.toggle('set', own);
    ownSwatch.title = $t('Eigene Farbe');
    ownColor.setAttribute('aria-label', $t('Eigene Farbe'));
    ownSwatch.style.setProperty('--c', accent);
    if (/^#[0-9a-f]{6}$/.test(accent)) ownColor.value = accent;
    for (const [id, key] of Object.entries(toggles)) $(`#${id}`).checked = !!s[key];
    $('#sSleep').value = String(s.sleepMinutes);
    $('#sRamLimit').value = String(s.ramLimit || 0);
    $('#sNetLimit').value = String(s.netLimit || 0);
    $('#sNetGameOnly').checked = s.netLimitGameOnly !== false;
    $('#sRgb').checked = !!s.rgbMode;
    $('#sNetGameOnly').disabled = !s.netLimit;
    $('#sNtDeals').checked = s.newtab?.showDeals !== false;
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

// ---------------------------------------------------------------------------
// Angebots-Wunschliste (Einstellungen → Darstellung, Befehlspalette, Hinweis bei Treffern)
// ---------------------------------------------------------------------------
const Wishlist = (() => {
  const list = () => (Array.isArray(state.settings.wishlist) ? state.settings.wishlist : []);
  const fmtPrice = (n) => `${n.toLocaleString(I18N.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
  function dialog() {
    const input = h('input', { class: 'field-input', placeholder: $t('Spiel, z. B. Cyberpunk 2077'), maxlength: 80, spellcheck: false });
    const add = h('button', { class: 'btn primary', type: 'submit' }, icon('plus'), $t('Hinzufügen'));
    const rows = h('div', { class: 'wish-list' });
    let hits = [];
    const render = () => {
      const l = list();
      rows.replaceChildren(...(l.length ? l.map((w) => {
        const hit = hits.find((x) => x.name === w.name);
        return h('div', { class: 'wish-row' },
          h('div', { class: 'wish-main' },
            h('b', { 'data-no-i18n': '' }, w.name),
            hit ? h('a', { class: `wish-hit ${hit.kind}`, href: '#', onclick: (e) => { e.preventDefault(); Tabs.create(hit.url); close(); } },
              hit.kind === 'free' ? $t('Gerade kostenlos') : `${fmtPrice(hit.price)} · −${hit.savings} %${hit.store ? ` · ${hit.store}` : ''}`)
              : h('span', {}, $t('Kein Angebot gerade'))),
          h('button', { class: 'icon-btn', title: $t('Entfernen'), onclick: () => updateSettings({ wishlist: list().filter((x) => x.name !== w.name) }).then(render) }, icon('x')));
      }) : [h('p', { class: 'rf-none' }, $t('Noch keine Spiele auf deiner Wunschliste.'))]));
    };
    const form = h('form', { class: 'wish-add', onsubmit: async (e) => {
      e.preventDefault();
      const name = input.value.trim().replace(/\s+/g, ' ');
      if (!name) return;
      if (list().some((x) => x.name.toLowerCase() === name.toLowerCase())) { input.select(); return; }
      if (list().length >= 30) { toast($t('Höchstens 30 Spiele'), 'warning'); return; }
      await updateSettings({ wishlist: [...list(), { name, added: Date.now() }] });
      input.value = ''; render(); refresh();
    } }, input, add);
    const box = h('div', { class: 'dialog wish-dialog', role: 'dialog' },
      h('div', { class: 'dialog-body' },
        h('h3', {}, $t('Angebots-Wunschliste')),
        h('p', { class: 'shop-sub' }, $t('Falcon prüft alle 3 Stunden, ob ein Spiel kostenlos oder um mindestens 20 % reduziert ist, und meldet sich mit einer Benachrichtigung.')),
        form, rows),
      h('div', { class: 'dialog-foot' }, h('button', { class: 'btn primary', onclick: () => close() }, $t('Fertig'))));
    const close = dialogShell(box);
    const refresh = async () => { hits = await F.wishlist.check(); if (box.isConnected) render(); };
    render(); refresh();
    input.focus();
  }
  F.on('wishlist-hit', (x) => toast(x.body, 'gamepad', { label: $t('Ansehen'), onClick: () => Tabs.create(x.url) }));
  return { dialog };
})();
