'use strict';
// Falcon – Hauptprozess

const { app, BrowserWindow, ipcMain, session, Menu, clipboard, shell, nativeImage, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const adblock = require('./adblock');
const bookmarksIO = require('./bookmarks-io');
const pw = require('./passwords');
const { verifyUser, isAvailable } = require('./auth');
const passkeys = require('./passkeys');
const googleSignin = require('./google-signin');
const updater = require('./updater');
const { translator } = require('./i18n-main');

const IS_MAC = process.platform === 'darwin';
const ICON = path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'falcon.ico' : 'falcon.png');
const CHROME_BG = '#0e0f11';

// Viele Seiten (Discord, Twitch, Google) behandeln unbekannte Browser schlechter – daher Chrome-UA ohne Electron-Token.
app.userAgentFallback = app.userAgentFallback
  .replace(/\sElectron\/\S+/, '')
  .replace(/\sfalcon-browser\/\S+/i, '')
  .replace(/\sFalcon\/\S+/i, '');

if (process.platform === 'win32') app.setAppUserModelId('com.falcon.browser');

app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');
const DEFAULT_ACCENT = '#7c6cff';
const DEFAULTS = {
  accent: DEFAULT_ACCENT,
  language: 'auto',
  searchEngine: 'google',
  adblock: true,
  gameMode: false,
  sleepMinutes: 10,
  showHud: true,
  showBookmarksBar: true,
  showSidebar: true,
  restoreSession: true,
  mouseButtons: 'history',
  downloadDir: '',
  downloadAsk: false,
  sidePanelWidth: 380,
  pwNever: [],
  pwRequireAuth: true,
  adblockAnnoyances: false,
  adblockAllow: [],
  window: null,
  bookmarks: [
    { title: 'Twitch', url: 'https://www.twitch.tv' },
    { title: 'YouTube', url: 'https://www.youtube.com' },
    { title: 'Steam', url: 'https://store.steampowered.com' },
    { title: 'Discord', url: 'https://discord.com/app' }
  ]
};
// Farben aus Version 1.0, die es nicht mehr gibt
const LEGACY_ACCENTS = { '#ff2e4d': DEFAULT_ACCENT, '#00e5ff': '#3b9eff', '#39ff14': '#3dd68c', '#b14cff': '#a26bff', '#ff9f1c': '#ff8b3e', '#ff3ec8': '#f2559b' };

let settings = { ...DEFAULTS };
const tr = (src) => translator(settings.language)(src);

const AUTH_GRACE_MS = 60_000;
let lastConfirmed = 0;

function passkeyStrings() {
  return {
    lang: settings.language,
    titleRegister: tr('Passkey hinzufügen'),
    titleVerify: tr('Mit Passkey bestätigen'),
    hint: tr('Wähle im folgenden Windows-Fenster dein iPhone oder Android-Gerät (QR-Code mit der Handykamera scannen), einen Sicherheitsschlüssel oder diesen PC.'),
    phone: tr('iPhone / Android'),
    key: tr('Sicherheitsschlüssel'),
    device: tr('Dieser PC'),
    waiting: tr('Warte auf deinen Passkey …'),
    cancelled: tr('Abgebrochen oder Zeit abgelaufen.'),
    failed: tr('Das hat nicht geklappt: {error}'),
    success: tr('Bestätigt'),
    cancel: tr('Abbrechen'),
    retry: tr('Erneut versuchen')
  };
}

/**
 * Bestätigung vor heiklen Aktionen: mit einem eingerichteten Passkey (iPhone, Android,
 * Sicherheitsschlüssel), sonst mit Windows Hello bzw. Touch ID.
 */
// Erst ein kleiner Hinweis in Falcon; der Windows-Passkey-Dialog kommt nur nach einem Klick
const pendingPrompts = new Map();
ipcMain.on('passkey-prompt:answer', (e, id, ok) => {
  if (!win || e.sender !== win.webContents) return;
  pendingPrompts.get(id)?.(!!ok);
  pendingPrompts.delete(id);
});
function askPasskeyPrompt(reason) {
  if (!win || win.isDestroyed()) return Promise.resolve(false);
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    pendingPrompts.set(id, resolve);
    send('passkey-prompt', { id, reason });
  });
}

async function confirmUser(reason, { force = false } = {}) {
  if (!force && !settings.pwRequireAuth) return true;
  if (Date.now() - lastConfirmed < AUTH_GRACE_MS) return true;
  let r;
  if (passkeys.count()) {
    if (!(await askPasskeyPrompt(tr(reason)))) return false;
    r = await passkeys.verify({ parent: win, strings: passkeyStrings(), reason: tr(reason) });
  } else {
    r = await verifyUser(tr(reason));
  }
  if (r.ok) lastConfirmed = Date.now();
  return r.ok;
}
function loadSettings() {
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8')) }; }
  catch { settings = { ...DEFAULTS }; }
  if (LEGACY_ACCENTS[settings.accent]) settings.accent = LEGACY_ACCENTS[settings.accent];
}
let saveTimer;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeSettingsNow, 150);
}
function writeSettingsNow() {
  clearTimeout(saveTimer);
  try { fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(settings, null, 2)); }
  catch (e) { console.error('Einstellungen konnten nicht gespeichert werden:', e); }
}

// ---------------------------------------------------------------------------
// Fenster
// ---------------------------------------------------------------------------
let win;
const send = (channel, data) => { if (win && !win.isDestroyed()) win.webContents.send(channel, data); };

function restoredBounds() {
  const w = settings.window;
  if (!w || !w.width || !w.height) return { width: 1400, height: 880 };
  // Nur übernehmen, wenn das Fenster noch auf einem vorhandenen Bildschirm liegt
  const area = screen.getDisplayMatching({ x: w.x ?? 0, y: w.y ?? 0, width: w.width, height: w.height }).workArea;
  const visible = w.x != null && w.x < area.x + area.width - 100 && w.x + w.width > area.x + 100 && w.y >= area.y - 10 && w.y < area.y + area.height - 100;
  return visible ? { x: w.x, y: w.y, width: w.width, height: w.height } : { width: Math.min(w.width, area.width), height: Math.min(w.height, area.height) };
}

function createWindow() {
  win = new BrowserWindow({
    ...restoredBounds(),
    minWidth: 640,
    minHeight: 420,
    title: 'Falcon',
    icon: nativeImage.createFromPath(ICON),
    backgroundColor: CHROME_BG,
    show: false,
    titleBarStyle: 'hidden',
    ...(IS_MAC
      ? { trafficLightPosition: { x: 14, y: 13 } }
      : { titleBarOverlay: { color: CHROME_BG, symbolColor: '#9a9aa3', height: 40 } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
      spellcheck: true
    }
  });

  if (settings.window && settings.window.maximized) win.maximize();
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  win.once('ready-to-show', () => win.show());

  const state = () => (win.isFullScreen() ? 'fullscreen' : win.isMaximized() ? 'max' : 'normal');
  for (const ev of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) win.on(ev, () => send('win-state', state()));

  // Seitentasten der Maus (Windows meldet sie als App-Befehl – auch wenn eine Webseite den Fokus hat)
  win.on('app-command', (_e, cmd) => {
    if (cmd === 'browser-backward') send('shortcut', { key: 'mouse-back' });
    if (cmd === 'browser-forward') send('shortcut', { key: 'mouse-forward' });
  });

  win.on('close', () => {
    const b = win.getNormalBounds();
    settings.window = { ...b, maximized: win.isMaximized() };
    writeSettingsNow();
  });
}

// ---------------------------------------------------------------------------
// Werbeblocker
// ---------------------------------------------------------------------------
function setupAdblock(ses) {
  adblock.setup(ses, {
    settings,
    // Zähler gehen an das Fenster, in dem der Tab liegt
    notify: (webContentsId, stats) => {
      const host = require('electron').webContents.fromId(webContentsId)?.hostWebContents;
      if (host && !host.isDestroyed()) host.send('adblock-stats', { webContentsId, ...stats });
      send('blocked-count', stats.total);
    }
  });
}
ipcMain.handle('adblock:stats', (_e, id) => adblock.stats(id));
ipcMain.handle('adblock:info', () => adblock.info());
ipcMain.handle('adblock:update', async () => { await adblock.update(); return adblock.info(); });

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------
const downloadItems = new Map();
const downloadDir = () => {
  const dir = settings.downloadDir;
  return dir && fs.existsSync(dir) ? dir : app.getPath('downloads');
};
/** Freier Dateiname im Zielordner: „Datei.zip“ → „Datei (1).zip“ */
function uniquePath(dir, name) {
  const safe = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'download';
  const ext = path.extname(safe);
  const base = safe.slice(0, safe.length - ext.length);
  let candidate = path.join(dir, safe);
  for (let i = 1; fs.existsSync(candidate); i++) candidate = path.join(dir, `${base} (${i})${ext}`);
  return candidate;
}

function setupDownloads(ses) {
  ses.on('will-download', (_e, item) => {
    if (settings.downloadAsk) item.setSaveDialogOptions({ defaultPath: path.join(downloadDir(), item.getFilename()) });
    else item.setSavePath(uniquePath(downloadDir(), item.getFilename()));
    const id = crypto.randomUUID();
    downloadItems.set(id, item);
    const report = (state, extra = {}) => send('download', {
      id, state, name: item.getFilename(), url: item.getURL(),
      received: item.getReceivedBytes(), total: item.getTotalBytes(), paused: item.isPaused(), ...extra
    });
    report('started');
    item.on('updated', (_ev, state) => report(state));
    item.once('done', (_ev, state) => {
      downloadItems.delete(id);
      report(state, { path: item.getSavePath() });
    });
  });
}
ipcMain.handle('download:cancel', (_e, id) => { downloadItems.get(id)?.cancel(); return true; });
ipcMain.handle('downloads:dir', () => downloadDir());
ipcMain.handle('downloads:choose-dir', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { defaultPath: downloadDir(), properties: ['openDirectory', 'createDirectory'] });
  if (canceled || !filePaths[0]) return null;
  settings.downloadDir = filePaths[0];
  saveSettings();
  return filePaths[0];
});
ipcMain.handle('downloads:open-dir', () => shell.openPath(downloadDir()));

// ---------------------------------------------------------------------------
// Webviews
// ---------------------------------------------------------------------------
const SHORTCUT_KEYS_CTRL = ['t', 'w', 'l', 'r', 'd', 'h', 'j', 'tab', '+', '=', '-', '0', 'f', 'p', ',', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return;

  // Neue Seite im Tab → Werbeblocker-Zähler zurücksetzen
  contents.on('did-start-navigation', (_ev, url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) adblock.resetTab(contents.id, url);
  });
  contents.once('destroyed', () => adblock.resetTab(contents.id, ''));

  contents.setWindowOpenHandler(({ url, disposition }) => {
    send('open-tab', { url, background: disposition === 'background-tab' });
    return { action: 'deny' };
  });

  // Kontextmenü wird in der Falcon-Oberfläche gezeichnet, damit es zum Design passt
  contents.on('context-menu', (_ev, p) => {
    send('page-context-menu', {
      webContentsId: contents.id,
      x: p.x, y: p.y,
      linkURL: p.linkURL, linkText: p.linkText,
      srcURL: p.srcURL, mediaType: p.mediaType, hasImageContents: p.hasImageContents,
      selectionText: p.selectionText, isEditable: p.isEditable, editFlags: p.editFlags,
      misspelledWord: p.misspelledWord, dictionarySuggestions: p.dictionarySuggestions,
      pageURL: p.pageURL, canGoBack: contents.navigationHistory.canGoBack(), canGoForward: contents.navigationHistory.canGoForward()
    });
  });

  // Browser-Tastenkürzel auch dann, wenn die Webseite den Fokus hat
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = (input.key || '').toLowerCase();
    const ctrl = input.control || input.meta;
    const hit =
      (ctrl && SHORTCUT_KEYS_CTRL.includes(key)) ||
      ['f5', 'f6', 'f11', 'f12'].includes(key) ||
      (input.alt && ['arrowleft', 'arrowright', 'home'].includes(key)) ||
      (ctrl && input.shift && ['g', 'b', 'delete'].includes(key));
    const payload = { key, ctrl, shift: input.shift, alt: input.alt };
    if (key === 'escape') return send('shortcut', payload); // Seite bekommt Escape trotzdem
    if (!hit) return;
    event.preventDefault();
    send('shortcut', payload);
  });
});

ipcMain.handle('webview:replace-misspelling', (_e, id, word) => {
  const wc = require('electron').webContents.fromId(id);
  if (wc && wc.getType() === 'webview') wc.replaceMisspelling(word);
});
ipcMain.handle('webview:add-to-dictionary', (_e, word) => session.defaultSession.addWordToSpellCheckerDictionary(word));

// ---------------------------------------------------------------------------
// IPC: Fenster & Einstellungen
// ---------------------------------------------------------------------------
ipcMain.on('win', (_e, action) => {
  if (!win) return;
  if (action === 'min') win.minimize();
  else if (action === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (action === 'close') win.close();
  else if (action === 'fullscreen') win.setFullScreen(!win.isFullScreen());
});
ipcMain.on('overlay-dim', (_e, dim) => {
  if (!win || IS_MAC || !win.setTitleBarOverlay) return;
  try { win.setTitleBarOverlay({ color: dim ? '#08090a' : CHROME_BG, symbolColor: dim ? '#55555c' : '#9a9aa3' }); } catch {}
});

ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:set', async (_e, patch) => {
  const { window: _ignored, ...safe } = patch || {};
  if (safe.pwRequireAuth === false && settings.pwRequireAuth && !(await confirmUser('Falcon möchte den Passwortschutz ausschalten.'))) {
    delete safe.pwRequireAuth;
  }
  settings = { ...settings, ...safe };
  if ('adblock' in safe || 'adblockAnnoyances' in safe || 'adblockAllow' in safe) {
    adblock.configure({ enabled: settings.adblock !== false, annoyances: !!settings.adblockAnnoyances, allow: settings.adblockAllow || [] });
  }
  saveSettings();
  return settings;
});

ipcMain.handle('metrics', () => {
  const m = app.getAppMetrics();
  let mem = 0, cpu = 0;
  for (const p of m) {
    mem += p.memory.workingSetSize || 0; // KB
    cpu += p.cpu.percentCPUUsage || 0;
  }
  return { memMB: Math.round(mem / 1024), cpu: Math.round(cpu * 10) / 10, processes: m.length, blocked: adblock.stats(-1).total };
});

ipcMain.handle('open-external', (_e, p) => shell.openPath(p));
ipcMain.handle('show-in-folder', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('clear-data', async () => {
  await session.defaultSession.clearCache();
  await session.defaultSession.clearStorageData();
  return true;
});

// ---------- Lesezeichen Import/Export ----------
ipcMain.handle('bookmarks:export', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: tr('Lesezeichen exportieren'),
    defaultPath: path.join(app.getPath('documents'), tr('falcon-lesezeichen.html')),
    filters: [{ name: tr('Lesezeichen (HTML)'), extensions: ['html'] }, { name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return null;
  const list = settings.bookmarks || [];
  const data = filePath.toLowerCase().endsWith('.json') ? JSON.stringify(list, null, 2) : bookmarksIO.toHtml(list);
  fs.writeFileSync(filePath, data, 'utf8');
  return { count: bookmarksIO.count(list), filePath };
});
ipcMain.handle('bookmarks:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: tr('Lesezeichen importieren'),
    properties: ['openFile'],
    filters: [{ name: tr('Lesezeichen (HTML, JSON)'), extensions: ['html', 'htm', 'json'] }]
  });
  if (canceled || !filePaths[0]) return null;
  let imported;
  try { imported = bookmarksIO.parse(fs.readFileSync(filePaths[0], 'utf8')); }
  catch (err) { return { error: err.message }; }
  const { tree, added, total } = bookmarksIO.merge(settings.bookmarks || [], imported);
  settings.bookmarks = tree;
  saveSettings();
  return { added, total, bookmarks: tree };
});

// ---------- Passwörter ----------
const pendingLogins = new Map();
const frameUrl = (e) => (e.senderFrame && e.senderFrame.url) || e.sender.getURL();

// Aus Webseiten (webview-preload): die Herkunft wird immer aus dem echten Frame ermittelt, nie von der Seite übernommen
// Nur Benutzernamen – das Passwort gibt es erst über pw:fill nach einem Klick
ipcMain.handle('pw:accounts', (e) => {
  if (e.sender.getType() !== 'webview') return [];
  return pw.forUrl(frameUrl(e)).map(({ id, username }) => ({ id, username }));
});
ipcMain.handle('pw:fill', (e, webContentsId, id) => {
  if (!win || e.sender !== win.webContents) return false;
  const wc = require('electron').webContents.fromId(webContentsId);
  if (!wc || wc.isDestroyed() || wc.getType() !== 'webview') return false;
  // Nur passend zur Seite, die gerade wirklich in diesem Webview geladen ist
  const cred = pw.forUrl(wc.getURL()).find((c) => c.id === id);
  if (!cred) return false;
  wc.send('pw-fill', { username: cred.username, password: cred.password });
  pw.touch(id);
  return true;
});
ipcMain.on('pw:submitted', (e, data) => {
  if (e.sender.getType() !== 'webview') return;
  const origin = pw.originOf(frameUrl(e));
  if (!origin || !data || typeof data.password !== 'string' || !data.password) return;
  if ((settings.pwNever || []).includes(origin)) return;
  const entry = { origin, username: String(data.username || '').slice(0, 200), password: data.password.slice(0, 500) };
  if (pw.exists(entry)) return;
  const known = pw.forUrl(origin).some((x) => x.username === entry.username);
  const id = crypto.randomUUID();
  pendingLogins.set(id, entry);
  setTimeout(() => pendingLogins.delete(id), 5 * 60 * 1000);
  if (win && !win.isDestroyed()) win.webContents.send('pw-offer', { id, origin, username: entry.username, update: known });
});

// Aus der Falcon-Oberfläche
ipcMain.handle('pw:offer-answer', (_e, id, answer) => {
  const entry = pendingLogins.get(id);
  pendingLogins.delete(id);
  if (!entry) return false;
  if (answer === 'save') return pw.upsert(entry);
  if (answer === 'never') {
    settings.pwNever = [...new Set([...(settings.pwNever || []), entry.origin])];
    saveSettings();
  }
  return true;
});
ipcMain.handle('pw:list', () => ({ entries: pw.list(), encrypted: pw.canEncrypt(), never: settings.pwNever || [] }));
ipcMain.handle('pw:reveal', async (_e, id) => ((await confirmUser('Falcon möchte ein gespeichertes Passwort anzeigen.')) ? pw.reveal(id) : null));
ipcMain.handle('pw:delete', (_e, id) => { pw.remove(id); return true; });
ipcMain.handle('pw:update', (_e, id, patch) => pw.update(id, patch || {}));
ipcMain.handle('pw:add', (_e, { url, username, password } = {}) => {
  let u = String(url || '').trim();
  if (u && !/^[a-z]+:\/\//i.test(u)) u = 'https://' + u;
  const origin = pw.originOf(u);
  if (!origin || !password) return false;
  return pw.upsert({ origin, username: String(username || ''), password: String(password) });
});
ipcMain.handle('pw:never-remove', (_e, origin) => {
  settings.pwNever = (settings.pwNever || []).filter((o) => o !== origin);
  saveSettings();
  return true;
});
ipcMain.handle('pw:import', async () => {
  if (!(await confirmUser('Falcon möchte Passwörter importieren.'))) return { error: 'auth' };
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: tr('Passwörter importieren (CSV aus Chrome, Edge, Opera, Firefox, Brave …)'),
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  if (canceled || !filePaths[0]) return null;
  try { return pw.importCsv(fs.readFileSync(filePaths[0], 'utf8')); }
  catch (err) { return { error: tr(err.message) }; }
});
ipcMain.handle('pw:export', async () => {
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    title: tr('Passwörter exportieren'),
    message: tr('Passwörter als unverschlüsselte Datei exportieren?'),
    detail: tr('Jeder, der Zugriff auf die CSV-Datei hat, kann deine Passwörter lesen. Lösche die Datei, sobald du sie nicht mehr brauchst.'),
    buttons: [tr('Abbrechen'), tr('Exportieren')],
    defaultId: 0,
    cancelId: 0
  });
  if (response !== 1) return null;
  if (!(await confirmUser('Falcon möchte deine gespeicherten Passwörter exportieren.'))) return { error: 'auth' };
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: tr('Passwörter exportieren'),
    defaultPath: path.join(app.getPath('documents'), tr('falcon-passwoerter.csv')),
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, pw.exportCsv(), 'utf8');
  return { count: pw.count(), filePath };
});
ipcMain.handle('copy', (_e, text) => { clipboard.writeText(String(text)); return true; });

// „Bild kopieren“: copyImageAt funktioniert in Webviews nicht zuverlässig. Deshalb lädt Falcon das
// Bild selbst (mit den Cookies der Sitzung), die Oberfläche wandelt es in PNG um und schreibt es hier.
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
ipcMain.handle('image:fetch', async (e, url) => {
  if (!win || e.sender !== win.webContents || !/^(https?|data):/i.test(String(url))) return null;
  try {
    const res = await session.defaultSession.fetch(url);
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) return null;
    return { bytes, type: res.headers.get('content-type') || '' };
  } catch {
    return null;
  }
});
ipcMain.handle('image:write', (e, png) => {
  if (!win || e.sender !== win.webContents) return false;
  const img = nativeImage.createFromBuffer(Buffer.from(png));
  if (img.isEmpty()) return false;
  clipboard.writeImage(img);
  return true;
});
ipcMain.handle('auth:available', () => isAvailable());
ipcMain.handle('update:status', () => updater.getStatus());
ipcMain.handle('update:check', () => updater.check());
ipcMain.on('update:download', () => updater.download());
ipcMain.on('update:install', () => updater.install());
ipcMain.on('signin-user-agent', (e) => { e.returnValue = googleSignin.firefoxUserAgent(); });

ipcMain.handle('passkey:list', () => passkeys.list());
ipcMain.handle('passkey:register', async () => {
  // Wer schon einen Passkey hat, muss neue Passkeys bestätigen – sonst ließe sich der Schutz umgehen
  if (passkeys.count() && !(await confirmUser('Falcon möchte einen neuen Passkey hinzufügen.', { force: true }))) return { ok: false, error: 'auth' };
  const r = await passkeys.register({ parent: win, strings: passkeyStrings(), reason: tr('Falcon möchte einen neuen Passkey hinzufügen.') });
  if (r.ok) lastConfirmed = Date.now();
  return { ok: r.ok, error: r.error };
});
ipcMain.handle('passkey:remove', async (_e, id) => {
  if (!(await confirmUser('Falcon möchte einen Passkey entfernen.', { force: true }))) return false;
  passkeys.remove(id);
  return true;
});

// ---------- Start ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const url = argv.find((a) => /^https?:\/\//i.test(a));
    if (url) win.webContents.send('open-tab', url);
  });

  app.whenReady().then(() => {
    loadSettings();
    Menu.setApplicationMenu(null);
    setupAdblock(session.defaultSession);
    googleSignin.setup(session.defaultSession);
    setupDownloads(session.defaultSession);
    // Berechtigungen (Kamera/Mikro für Discord etc.) erlauben
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
      cb(['media', 'fullscreen', 'notifications', 'clipboard-sanitized-write', 'pointerLock', 'display-capture'].includes(permission));
    });
    createWindow();
    updater.init(send);
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}
