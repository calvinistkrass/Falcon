'use strict';
// Falcon – Hauptprozess

const { app, BrowserWindow, ipcMain, session, Menu, clipboard, shell, nativeImage, dialog, screen, protocol, net, webContents } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const adblock = require('./adblock');
const bookmarksIO = require('./bookmarks-io');
const pw = require('./passwords');
const { verifyUser, isAvailable } = require('./auth');
const passkeys = require('./passkeys');
const winAuthn = require('./win-webauthn');
const tldts = require('tldts');
const googleSignin = require('./google-signin');
const updater = require('./updater');
const { translator } = require('./i18n-main');
const defaultBrowser = require('./default-browser');
const account = require('./account');

const IS_MAC = process.platform === 'darwin';
const ICON = path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'falcon.ico' : 'falcon.png');
const CHROME_BG = '#0e0f11';
const INCOGNITO_BG = '#14101c';

// Viele Seiten (Discord, Twitch, Google) behandeln unbekannte Browser schlechter – daher Chrome-UA ohne Electron-Token.
app.userAgentFallback = app.userAgentFallback
  .replace(/\sElectron\/\S+/, '')
  .replace(/\sfalcon-browser\/\S+/i, '')
  .replace(/\sFalcon\/\S+/i, '');

if (process.platform === 'win32') app.setAppUserModelId('com.falcon.browser');

// Interne Seiten wie falcon://downloads
protocol.registerSchemesAsPrivileged([{ scheme: 'falcon', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

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
  ramLimit: 0,
  downloadDir: '',
  downloadAsk: false,
  sidePanelWidth: 380,
  pwNever: [],
  pwRequireAuth: true,
  adblockAnnoyances: false,
  adblockAllow: [],
  newtab: { image: '', showShortcuts: true, showClock: true },
  profileColor: '',
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
  if (!isUi(e)) return;
  pendingPrompts.get(id)?.(!!ok);
  pendingPrompts.delete(id);
});
function askPasskeyPrompt(reason) {
  const target = focusedUi();
  if (!alive(target)) return Promise.resolve(false);
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    pendingPrompts.set(id, resolve);
    target.webContents.send('passkey-prompt', { id, reason });
  });
}

async function confirmUser(reason, { force = false } = {}) {
  if (!force && !settings.pwRequireAuth) return true;
  if (Date.now() - lastConfirmed < AUTH_GRACE_MS) return true;
  let r;
  if (passkeys.count()) {
    if (!(await askPasskeyPrompt(tr(reason)))) return false;
    r = await passkeys.verify({ parent: focusedUi(), strings: passkeyStrings(), reason: tr(reason) });
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
let win;                       // Hauptfenster (für Dialoge ohne eigenes Fenster)
const uiWindows = new Set();   // alle Falcon-Fenster, auch Inkognito
const INCOGNITO_PARTITION = 'incognito'; // ohne „persist:“ → nur im Arbeitsspeicher
const incognitoSession = () => session.fromPartition(INCOGNITO_PARTITION);

const alive = (w) => w && !w.isDestroyed();
const isUi = (e) => uiWindows.has(BrowserWindow.fromWebContents(e.sender));
const parentFor = (e) => (e && BrowserWindow.fromWebContents(e.sender)) || win;
const focusedUi = () => { const f = BrowserWindow.getFocusedWindow(); return uiWindows.has(f) ? f : win; };
/** An alle Falcon-Fenster (optional nur normale oder nur Inkognito) */
function broadcast(channel, data, { incognito } = {}) {
  for (const w of uiWindows) {
    if (!alive(w) || (incognito !== undefined && !!w.falconIncognito !== incognito)) continue;
    w.webContents.send(channel, data);
  }
}
const send = (channel, data) => { if (alive(win)) win.webContents.send(channel, data); };
/** Nachricht an das Fenster, in dem ein Webview liegt */
function toHost(contents, channel, data) {
  const host = contents.hostWebContents;
  if (host && !host.isDestroyed()) host.send(channel, data);
}

function restoredBounds() {
  const w = settings.window;
  if (!w || !w.width || !w.height) return { width: 1400, height: 880 };
  // Nur übernehmen, wenn das Fenster noch auf einem vorhandenen Bildschirm liegt
  const area = screen.getDisplayMatching({ x: w.x ?? 0, y: w.y ?? 0, width: w.width, height: w.height }).workArea;
  const visible = w.x != null && w.x < area.x + area.width - 100 && w.x + w.width > area.x + 100 && w.y >= area.y - 10 && w.y < area.y + area.height - 100;
  return visible ? { x: w.x, y: w.y, width: w.width, height: w.height } : { width: Math.min(w.width, area.width), height: Math.min(w.height, area.height) };
}

function createWindow({ incognito = false } = {}) {
  const bounds = restoredBounds();
  if (incognito && alive(win)) {
    const b = win.getBounds();
    Object.assign(bounds, { x: b.x + 40, y: b.y + 40, width: Math.min(b.width, 1280), height: Math.min(b.height, 820) });
  }
  const w = new BrowserWindow({
    ...bounds,
    minWidth: 640,
    minHeight: 420,
    title: incognito ? 'Falcon – Inkognito' : 'Falcon',
    icon: nativeImage.createFromPath(ICON),
    backgroundColor: incognito ? INCOGNITO_BG : CHROME_BG,
    show: false,
    titleBarStyle: 'hidden',
    ...(IS_MAC
      ? { trafficLightPosition: { x: 14, y: 13 } }
      : { titleBarOverlay: { color: incognito ? INCOGNITO_BG : CHROME_BG, symbolColor: '#9a9aa3', height: 40 } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
      spellcheck: true
    }
  });

  w.falconIncognito = incognito;
  uiWindows.add(w);
  if (!incognito && !alive(win)) win = w;

  if (!incognito && settings.window && settings.window.maximized) w.maximize();
  w.loadFile(path.join(__dirname, 'ui', 'index.html'), incognito ? { query: { incognito: '1' } } : undefined);
  w.once('ready-to-show', () => w.show());

  const sendHere = (channel, data) => { if (alive(w)) w.webContents.send(channel, data); };
  const state = () => (w.isFullScreen() ? 'fullscreen' : w.isMaximized() ? 'max' : 'normal');
  for (const ev of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) w.on(ev, () => sendHere('win-state', state()));

  // Seitentasten der Maus (Windows meldet sie als App-Befehl – auch wenn eine Webseite den Fokus hat)
  w.on('app-command', (_e, cmd) => {
    if (cmd === 'browser-backward') sendHere('shortcut', { key: 'mouse-back' });
    if (cmd === 'browser-forward') sendHere('shortcut', { key: 'mouse-forward' });
  });

  w.on('close', () => {
    if (incognito) return;
    const b = w.getNormalBounds();
    settings.window = { ...b, maximized: w.isMaximized() };
    writeSettingsNow();
  });
  w.on('closed', () => {
    uiWindows.delete(w);
    if (win === w) win = [...uiWindows].find((x) => alive(x) && !x.falconIncognito) || [...uiWindows].find(alive) || null;
    // Letztes Inkognito-Fenster zu → alle Inkognito-Daten verwerfen
    if (incognito && ![...uiWindows].some((x) => x.falconIncognito)) incognitoSession().clearStorageData().catch(() => {});
  });
  return w;
}
ipcMain.on('win:new-incognito', (_e, url) => {
  const w = createWindow({ incognito: true });
  if (typeof url === 'string' && /^https?:/i.test(url)) w.webContents.once('did-finish-load', () => w.webContents.send('open-tab', { url }));
});

// ---------------------------------------------------------------------------
// Overlay: kleines Fenster, das immer im Vordergrund bleibt (z. B. Stream oder Guide neben dem Spiel)
// ---------------------------------------------------------------------------
const overlays = new Map(); // webContents.id → { url }
ipcMain.on('overlay:open', (e, url) => {
  if (!isUi(e) || !/^https?:/i.test(String(url))) return;
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const o = new BrowserWindow({
    width: 480, height: 300, minWidth: 240, minHeight: 150,
    x: area.x + area.width - 500, y: area.y + area.height - 320,
    frame: false, alwaysOnTop: true, backgroundColor: '#000000', title: 'Falcon Overlay',
    icon: nativeImage.createFromPath(ICON), show: false,
    webPreferences: { preload: path.join(__dirname, 'overlay', 'preload.js'), contextIsolation: true, nodeIntegration: false, webviewTag: true, sandbox: false }
  });
  // Ebene über Vollbild-Fenstern (randlose Spiele); exklusiver Vollbildmodus lässt sich nicht überlagern
  o.setAlwaysOnTop(true, 'screen-saver');
  o.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlays.set(o.webContents.id, { url });
  o.on('closed', () => overlays.delete(o.webContents?.id));
  o.loadFile(path.join(__dirname, 'overlay', 'overlay.html'));
  o.once('ready-to-show', () => o.showInactive());
});
const overlayOf = (e) => (overlays.has(e.sender.id) ? BrowserWindow.fromWebContents(e.sender) : null);
ipcMain.on('overlay:info', (e) => {
  e.returnValue = {
    url: overlays.get(e.sender.id)?.url || 'about:blank',
    logo: require('url').pathToFileURL(path.join(__dirname, '..', 'assets', 'falcon.png')).href,
    strings: { opacity: tr('Deckkraft'), toTab: tr('In Tab öffnen'), close: tr('Schließen') }
  };
});
ipcMain.on('overlay:opacity', (e, v) => overlayOf(e)?.setOpacity(Math.max(0.3, Math.min(1, Number(v) || 1))));
ipcMain.on('overlay:close', (e) => overlayOf(e)?.close());
ipcMain.on('overlay:to-tab', (e, url) => {
  const o = overlayOf(e);
  if (!o) return;
  if (alive(win) && /^https?:/i.test(String(url))) { win.webContents.send('open-tab', { url }); win.focus(); }
  o.close();
});

// ---------------------------------------------------------------------------
// Game Mode: Hintergrund-Tabs einfrieren (Seite bleibt geladen, verbraucht aber keine CPU)
// ---------------------------------------------------------------------------
ipcMain.handle('tab:set-frozen', async (e, id, frozen) => {
  if (!isUi(e)) return false;
  const wc = require('electron').webContents.fromId(id);
  if (!wc || wc.isDestroyed() || wc.getType() !== 'webview') return false;
  try {
    if (frozen) {
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
      await wc.debugger.sendCommand('Page.setWebLifecycleState', { state: 'frozen' });
    } else if (wc.debugger.isAttached()) {
      await wc.debugger.sendCommand('Page.setWebLifecycleState', { state: 'active' });
      wc.debugger.detach();
    }
    return true;
  } catch {
    return false; // z. B. wenn die Entwicklertools offen sind
  }
});

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
      broadcast('blocked-count', stats.total);
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

// Download-Liste für falcon://downloads (Inkognito-Downloads werden nicht gespeichert)
const DL_FILE = () => path.join(app.getPath('userData'), 'downloads.json');
const DL_MAX = 500;
let dlLog = null;
let dlSaveTimer = null;
function dlEntries() {
  if (!dlLog) {
    try { dlLog = JSON.parse(fs.readFileSync(DL_FILE(), 'utf8')); } catch { dlLog = []; }
    if (!Array.isArray(dlLog)) dlLog = [];
    // Nach einem Absturz gibt es keine laufenden Downloads mehr
    for (const d of dlLog) if (d.state === 'progressing' || d.state === 'started') { d.state = 'interrupted'; d.paused = false; }
  }
  return dlLog;
}
function saveDlLog(now = false) {
  clearTimeout(dlSaveTimer);
  const write = () => { try { fs.writeFileSync(DL_FILE(), JSON.stringify(dlEntries().slice(0, DL_MAX))); } catch { /* egal */ } };
  if (now) write(); else dlSaveTimer = setTimeout(write, 1500);
}
const dlView = (d) => ({ ...d, exists: d.state === 'completed' && !!d.path && fs.existsSync(d.path) });
function pushToDownloadPages(data) {
  for (const wc of webContents.getAllWebContents()) {
    if (!wc.isDestroyed() && wc.getURL().startsWith('falcon://downloads')) wc.send('dlpage:changed', data);
  }
}

function setupDownloads(ses) {
  ses.on('will-download', (_e, item) => {
    if (settings.downloadAsk) item.setSaveDialogOptions({ defaultPath: path.join(downloadDir(), item.getFilename()) });
    else item.setSavePath(uniquePath(downloadDir(), item.getFilename()));
    const id = crypto.randomUUID();
    downloadItems.set(id, item);
    const incognito = ses === incognitoSession();
    const entry = incognito ? null : { id, name: item.getFilename(), url: item.getURL(), path: '', state: 'started', received: 0, total: item.getTotalBytes(), paused: false, start: Date.now() };
    if (entry) { dlEntries().unshift(entry); if (dlLog.length > DL_MAX) dlLog.length = DL_MAX; }
    const report = (state, extra = {}) => {
      const data = {
        id, state, name: item.getFilename(), url: item.getURL(),
        received: item.getReceivedBytes(), total: item.getTotalBytes(), paused: item.isPaused(), ...extra
      };
      broadcast('download', data, { incognito });
      if (entry) {
        Object.assign(entry, { state, name: data.name, received: data.received, total: data.total, paused: data.paused, path: item.getSavePath() || entry.path });
        if (extra.path) entry.end = Date.now();
        saveDlLog(state !== 'progressing');
        pushToDownloadPages(dlView(entry));
      }
    };
    report('started');
    item.on('updated', (_ev, state) => report(state));
    item.once('done', (_ev, state) => {
      downloadItems.delete(id);
      report(state, { path: item.getSavePath() });
    });
  });
}
ipcMain.handle('download:cancel', (_e, id) => { downloadItems.get(id)?.cancel(); return true; });

// Aktionen der Seite falcon://downloads – nur von dieser Seite aus erlaubt
const fromFalconPage = (e, page) => { try { const u = new URL(e.senderFrame.url); return u.protocol === 'falcon:' && u.hostname === page; } catch { return false; } };
function pageLanguage() {
  const supported = ['de', 'en', 'fr', 'es', 'tr'];
  const lang = settings.language && settings.language !== 'auto' ? settings.language : app.getLocale().slice(0, 2);
  return supported.includes(lang) ? lang : 'en';
}
ipcMain.handle('dlpage', async (e, action, id) => {
  if (!fromFalconPage(e, 'downloads')) return null;
  const d = typeof id === 'string' ? dlEntries().find((x) => x.id === id) : null;
  const item = typeof id === 'string' ? downloadItems.get(id) : null;
  switch (action) {
    case 'info': return { lang: pageLanguage(), accent: settings.accent };
    case 'list': return dlEntries().map(dlView);
    case 'open': if (d?.path && fs.existsSync(d.path)) shell.openPath(d.path); return true;
    case 'show': if (d?.path) shell.showItemInFolder(d.path); return true;
    case 'pause': item?.pause(); if (item && d) { d.paused = true; pushToDownloadPages(dlView(d)); } return true;
    case 'resume': if (item?.canResume()) item.resume(); if (item && d) { d.paused = false; pushToDownloadPages(dlView(d)); } return true;
    case 'cancel': item?.cancel(); return true;
    case 'retry': if (d && /^(https?|data|blob):/i.test(d.url)) session.defaultSession.downloadURL(d.url); return true;
    case 'source': if (d && /^https?:/i.test(d.url)) toHost(e.sender, 'open-tab', { url: d.url, background: false }); return true;
    case 'remove':
      if (!d || downloadItems.has(d.id)) return false;
      dlLog = dlEntries().filter((x) => x !== d);
      saveDlLog(true);
      pushToDownloadPages({ id: d.id, removed: true });
      return true;
    case 'clear':
      dlLog = dlEntries().filter((x) => downloadItems.has(x.id));
      saveDlLog(true);
      pushToDownloadPages({ reset: true, items: dlLog.map(dlView) });
      return true;
    case 'open-dir': shell.openPath(downloadDir()); return true;
  }
  return null;
});

// falcon://<seite>/ liefert Dateien aus src/ui (Seite selbst aus src/ui/pages)
const UI_DIR = path.join(__dirname, 'ui');
const FALCON_PAGES = { downloads: 'pages/downloads.html' };
function setupFalconProtocol(ses) {
  if (ses.protocol.isProtocolHandled('falcon')) return;
  ses.protocol.handle('falcon', (req) => {
    let u;
    try { u = new URL(req.url); } catch { return new Response('Bad request', { status: 400 }); }
    const page = FALCON_PAGES[u.hostname];
    if (!page) return new Response('Not found', { status: 404 });
    const rel = u.pathname === '/' ? page : decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const file = rel === 'falcon.png' ? path.join(__dirname, '..', 'assets', 'falcon.png') : path.resolve(UI_DIR, rel);
    if (rel !== 'falcon.png' && !file.startsWith(UI_DIR + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).href);
  });
}
ipcMain.handle('downloads:dir', () => downloadDir());
ipcMain.handle('downloads:choose-dir', async (e) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(parentFor(e), { defaultPath: downloadDir(), properties: ['openDirectory', 'createDirectory'] });
  if (canceled || !filePaths[0]) return null;
  settings.downloadDir = filePaths[0];
  saveSettings();
  return filePaths[0];
});
// ---------------------------------------------------------------------------
// Falcon-Konto & Sync
// ---------------------------------------------------------------------------
const SYNC_SETTINGS = ['accent', 'language', 'searchEngine', 'adblock', 'adblockAnnoyances', 'adblockAllow', 'showBookmarksBar', 'showSidebar',
  'showHud', 'sleepMinutes', 'ramLimit', 'mouseButtons', 'sidebarApps', 'pwNever', 'restoreSession', 'newtab', 'profileColor'];
function applySyncedSettings(patch) {
  settings = { ...settings, ...patch };
  adblock.configure({ enabled: settings.adblock !== false, annoyances: !!settings.adblockAnnoyances, allow: settings.adblockAllow || [] });
  saveSettings();
  broadcast('settings-changed', settings);
}
const syncProviders = {
  bookmarks: {
    get: () => settings.bookmarks || [],
    set: (tree) => { if (Array.isArray(tree)) applySyncedSettings({ bookmarks: tree }); }
  },
  settings: {
    get: () => {
      const out = {};
      for (const k of SYNC_SETTINGS) if (settings[k] !== undefined) out[k] = settings[k];
      if (out.newtab) { const { image: _local, ...rest } = out.newtab; out.newtab = rest; } // Hintergrundbild ist ein lokaler Pfad
      return out;
    },
    set: (remote) => {
      const patch = {};
      for (const k of SYNC_SETTINGS) if (remote && remote[k] !== undefined) patch[k] = remote[k];
      if (patch.newtab) patch.newtab = { ...settings.newtab, ...patch.newtab, image: settings.newtab?.image || '' };
      applySyncedSettings(patch);
    }
  },
  passwords: { get: () => pw.all(), set: (list) => pw.replaceAll(list) },
  history: {
    get: async () => {
      const w = [...uiWindows].find((x) => alive(x) && !x.falconIncognito);
      if (!w) return [];
      const list = await w.webContents.executeJavaScript('History.all()').catch(() => []);
      return (Array.isArray(list) ? list : []).slice(0, 2000);
    },
    set: (list) => { if (Array.isArray(list)) broadcast('history-replace', list, { incognito: false }); }
  }
};
pw.setOnChange(() => account.markDirty('passwords'));

const accountHandlers = {
  state: () => account.state(),
  signUp: (a) => account.signUp(a),
  signIn: (a) => account.signIn(a),
  signOut: () => account.signOut(),
  resetPassword: (a) => account.resetPassword(a),
  resendVerification: () => account.resendVerification(),
  refreshProfile: () => account.refreshProfile(),
  updateProfile: (a) => account.updateProfile(a),
  unlockKey: (a) => account.unlockKey(a),
  resetSyncData: () => account.resetSyncData(),
  changePassword: (a) => account.changePassword(a),
  deleteAccount: (a) => account.deleteAccount(a),
  syncNow: () => account.syncNow(),
  setKinds: (a) => account.setKinds(a),
  dirty: (kind) => { if (kind === 'history') account.markDirty('history'); return true; }
};
ipcMain.handle('account', async (e, action, arg) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!uiWindows.has(w) || w.falconIncognito) return { ok: false, error: 'FORBIDDEN' };
  const fn = accountHandlers[action];
  return fn ? fn(arg && typeof arg === 'object' ? { ...arg } : arg) : { ok: false, error: 'UNKNOWN_ACTION' };
});

ipcMain.handle('default-browser:status', async () => ({ supported: defaultBrowser.supported(), isDefault: await defaultBrowser.isDefault() }));
ipcMain.handle('default-browser:set', () => defaultBrowser.makeDefault());
ipcMain.handle('downloads:open-dir', () => shell.openPath(downloadDir()));

// ---------------------------------------------------------------------------
// Webviews
// ---------------------------------------------------------------------------
const SHORTCUT_KEYS_CTRL = ['k', 't', 'w', 'l', 'r', 'd', 'h', 'j', 'tab', '+', '=', '-', '0', 'f', 'p', ',', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return;

  // Neue Seite im Tab → Werbeblocker-Zähler zurücksetzen
  contents.on('did-start-navigation', (_ev, url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) adblock.resetTab(contents.id, url);
  });
  contents.once('destroyed', () => adblock.resetTab(contents.id, ''));

  contents.setWindowOpenHandler(({ url, disposition }) => {
    toHost(contents, 'open-tab', { url, background: disposition === 'background-tab' });
    return { action: 'deny' };
  });

  // Kontextmenü wird in der Falcon-Oberfläche gezeichnet, damit es zum Design passt
  contents.on('context-menu', (_ev, p) => {
    toHost(contents, 'page-context-menu', {
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
      ['f5', 'f6', 'f9', 'f11', 'f12'].includes(key) ||
      (input.alt && ['arrowleft', 'arrowright', 'home'].includes(key)) ||
      (ctrl && input.shift && ['g', 'b', 'n', 'delete'].includes(key));
    const payload = { key, ctrl, shift: input.shift, alt: input.alt };
    if (key === 'escape') return toHost(contents, 'shortcut', payload); // Seite bekommt Escape trotzdem
    if (!hit) return;
    event.preventDefault();
    toHost(contents, 'shortcut', payload);
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
ipcMain.on('win', (e, action) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!alive(w)) return;
  if (action === 'min') w.minimize();
  else if (action === 'max') w.isMaximized() ? w.unmaximize() : w.maximize();
  else if (action === 'close') w.close();
  else if (action === 'fullscreen') w.setFullScreen(!w.isFullScreen());
});
ipcMain.on('overlay-dim', (e, dim) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!alive(w) || IS_MAC || !w.setTitleBarOverlay) return;
  const base = w.falconIncognito ? INCOGNITO_BG : CHROME_BG;
  try { w.setTitleBarOverlay({ color: dim ? '#08090a' : base, symbolColor: dim ? '#55555c' : '#9a9aa3' }); } catch {}
});

ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:set', async (e, patch) => {
  const { window: _ignored, ...safe } = patch || {};
  if (safe.pwRequireAuth === false && settings.pwRequireAuth && !(await confirmUser('Falcon möchte den Passwortschutz ausschalten.'))) {
    delete safe.pwRequireAuth;
  }
  settings = { ...settings, ...safe };
  if ('bookmarks' in safe) account.markDirty('bookmarks');
  if (SYNC_SETTINGS.some((k) => k in safe)) account.markDirty('settings');
  if ('adblock' in safe || 'adblockAnnoyances' in safe || 'adblockAllow' in safe) {
    adblock.configure({ enabled: settings.adblock !== false, annoyances: !!settings.adblockAnnoyances, allow: settings.adblockAllow || [] });
  }
  saveSettings();
  for (const w of uiWindows) if (alive(w) && w.webContents !== e.sender) w.webContents.send('settings-changed', settings);
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
ipcMain.handle('bookmarks:export', async (e) => {
  const { canceled, filePath } = await dialog.showSaveDialog(parentFor(e), {
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
ipcMain.handle('bookmarks:import', async (e) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(parentFor(e), {
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
  account.markDirty('bookmarks');
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
  if (!isUi(e)) return false;
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
  if (e.sender.getType() !== 'webview' || e.sender.session === incognitoSession()) return;
  const origin = pw.originOf(frameUrl(e));
  if (!origin || !data || typeof data.password !== 'string' || !data.password) return;
  if ((settings.pwNever || []).includes(origin)) return;
  const entry = { origin, username: String(data.username || '').slice(0, 200), password: data.password.slice(0, 500) };
  if (pw.exists(entry)) return;
  const known = pw.forUrl(origin).some((x) => x.username === entry.username);
  const id = crypto.randomUUID();
  pendingLogins.set(id, entry);
  setTimeout(() => pendingLogins.delete(id), 5 * 60 * 1000);
  toHost(e.sender, 'pw-offer', { id, origin, username: entry.username, update: known });
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
ipcMain.handle('pw:import', async (e) => {
  if (!(await confirmUser('Falcon möchte Passwörter importieren.'))) return { error: 'auth' };
  const { canceled, filePaths } = await dialog.showOpenDialog(parentFor(e), {
    title: tr('Passwörter importieren (CSV aus Chrome, Edge, Opera, Firefox, Brave …)'),
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  if (canceled || !filePaths[0]) return null;
  try { return pw.importCsv(fs.readFileSync(filePaths[0], 'utf8')); }
  catch (err) { return { error: tr(err.message) }; }
});
ipcMain.handle('pw:export', async (e) => {
  const { response } = await dialog.showMessageBox(parentFor(e), {
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
  const { canceled, filePath } = await dialog.showSaveDialog(parentFor(e), {
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
  if (!isUi(e) || !/^(https?|data):/i.test(String(url))) return null;
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
  if (!isUi(e)) return false;
  const img = nativeImage.createFromBuffer(Buffer.from(png));
  if (img.isEmpty()) return false;
  clipboard.writeImage(img);
  return true;
});
ipcMain.handle('auth:available', () => isAvailable());

// ---------- Leseansicht (Mozilla Readability) ----------
// Läuft in einer isolierten JavaScript-Welt der Seite: die Seite kann nicht eingreifen, CSP greift nicht.
const READER_WORLD = 1801;
let readerScripts = null;
function readerSource() {
  if (!readerScripts) {
    const dir = path.dirname(require.resolve('@mozilla/readability/package.json'));
    readerScripts = {
      readability: fs.readFileSync(path.join(dir, 'Readability.js'), 'utf8'),
      readerable: fs.readFileSync(path.join(dir, 'Readability-readerable.js'), 'utf8')
    };
  }
  return readerScripts;
}
function readerTarget(e, id) {
  if (!isUi(e)) return null;
  const wc = require('electron').webContents.fromId(id);
  return wc && !wc.isDestroyed() && wc.getType() === 'webview' ? wc : null;
}
ipcMain.handle('reader:check', async (e, id) => {
  const wc = readerTarget(e, id);
  if (!wc) return false;
  const code = `(() => { ${readerSource().readerable}; return isProbablyReaderable(document, { minContentLength: 180, minScore: 22 }); })()`;
  try { return !!(await wc.executeJavaScriptInIsolatedWorld(READER_WORLD, [{ code }])); } catch { return false; }
});
ipcMain.handle('reader:extract', async (e, id) => {
  const wc = readerTarget(e, id);
  if (!wc) return null;
  const code = `(() => { ${readerSource().readability};
    const a = new Readability(document.cloneNode(true), { charThreshold: 300 }).parse();
    return a && { title: a.title, byline: a.byline, content: a.content, siteName: a.siteName, length: a.length, lang: a.lang || document.documentElement.lang };
  })()`;
  try { return await wc.executeJavaScriptInIsolatedWorld(READER_WORLD, [{ code }]); } catch { return null; }
});

// ---------- Startseite ----------
const newtabConfig = () => {
  const n = { image: '', showShortcuts: true, showClock: true, ...(settings.newtab || {}) };
  const image = n.image && fs.existsSync(n.image) ? `${require('url').pathToFileURL(n.image).href}?v=${fs.statSync(n.image).mtimeMs}` : '';
  return { image, showShortcuts: n.showShortcuts !== false, showClock: n.showClock !== false };
};
ipcMain.on('newtab:config', (e) => {
  const url = e.senderFrame?.url || '';
  e.returnValue = /^file:.*\/ui\/newtab\.html/.test(url) ? newtabConfig() : null;
});
ipcMain.handle('newtab:choose-image', async (e) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(parentFor(e), {
    properties: ['openFile'],
    filters: [{ name: tr('Bilder'), extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'] }]
  });
  if (canceled || !filePaths[0]) return null;
  // Kopie im Datenordner, damit das Bild auch nach Verschieben des Originals bleibt
  const dest = path.join(app.getPath('userData'), `newtab-background${path.extname(filePaths[0]).toLowerCase()}`);
  for (const f of fs.readdirSync(app.getPath('userData'))) if (f.startsWith('newtab-background')) fs.rmSync(path.join(app.getPath('userData'), f), { force: true });
  fs.copyFileSync(filePaths[0], dest);
  settings.newtab = { ...(settings.newtab || {}), image: dest };
  saveSettings();
  return settings;
});
ipcMain.handle('newtab:clear-image', () => {
  if (settings.newtab?.image) fs.rmSync(settings.newtab.image, { force: true });
  settings.newtab = { ...(settings.newtab || {}), image: '' };
  saveSettings();
  return settings;
});
ipcMain.handle('update:status', () => updater.getStatus());
ipcMain.handle('update:check', () => updater.check());
ipcMain.on('update:download', () => updater.download());
ipcMain.on('update:install', () => updater.install());
ipcMain.on('signin-user-agent', (e) => { e.returnValue = googleSignin.firefoxUserAgent(); });

// ---------- Passkeys auf Websites (über webauthn.dll) ----------
ipcMain.on('webauthn:available', (e) => { e.returnValue = winAuthn.isAvailable(); });
ipcMain.handle('webauthn:request', async (e, req) => {
  const fail = (name, message = name) => ({ error: { name, message } });
  if (e.sender.getType() !== 'webview' || !req || typeof req !== 'object') return fail('NotAllowedError');
  let url;
  try { url = new URL(frameUrl(e)); } catch { return fail('SecurityError'); }
  const host = url.hostname;
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(host)) return fail('SecurityError', 'Passkeys need a secure connection (https).');
  const pk = req.publicKey || {};
  const rpId = String((req.kind === 'create' ? pk.rp?.id : pk.rpId) || host).toLowerCase();
  // RP-ID muss die eigene Domain oder eine übergeordnete, registrierbare Domain sein (keine öffentliche Endung wie „co.uk“)
  const registrable = tldts.getDomain(host, { allowPrivateDomains: true }) || host;
  if (!(rpId === host || (host.endsWith(`.${rpId}`) && rpId.length >= registrable.length))) return fail('SecurityError', 'The relying party ID is not valid for this site.');

  const bytes = (x) => (x && typeof x.__b === 'string' ? Buffer.from(x.__b, 'base64url') : Buffer.alloc(0));
  const hostWin = BrowserWindow.fromWebContents(e.sender.hostWebContents) || win;
  const hwnd = alive(hostWin) ? hostWin.getNativeWindowHandle().readBigUInt64LE(0) : 0n;
  const b64 = (buf) => (buf ? Buffer.from(buf).toString('base64url') : null);
  try {
    if (req.kind === 'create') {
      const sel = pk.authenticatorSelection || {};
      const r = await winAuthn.makeCredential({
        hwnd, origin: url.origin, challenge: bytes(pk.challenge), timeout: pk.timeout,
        rp: { id: rpId, name: String(pk.rp?.name || rpId) },
        user: { id: bytes(pk.user?.id), name: String(pk.user?.name || ''), displayName: String(pk.user?.displayName || pk.user?.name || '') },
        algs: (pk.pubKeyCredParams || []).map((p) => p.alg).filter(Number.isInteger),
        exclude: (pk.excludeCredentials || []).map((c) => ({ id: bytes(c.id) })),
        residentKey: sel.residentKey || (sel.requireResidentKey ? 'required' : 'discouraged'),
        userVerification: sel.userVerification || 'preferred',
        attachment: sel.authenticatorAttachment
      });
      return { result: {
        id: b64(r.credentialId), clientDataJSON: b64(r.clientDataJSON), attestationObject: b64(r.attestationObject),
        authenticatorData: b64(r.authenticatorData), publicKey: b64(r.publicKey), alg: r.alg, transports: r.transports,
        attachment: r.transports.includes('internal') ? 'platform' : 'cross-platform'
      } };
    }
    const r = await winAuthn.getAssertion({
      hwnd, origin: url.origin, rpId, challenge: bytes(pk.challenge), timeout: pk.timeout,
      allow: (pk.allowCredentials || []).map((c) => ({ id: bytes(c.id) })),
      userVerification: pk.userVerification || 'preferred'
    });
    return { result: {
      id: b64(r.credentialId), clientDataJSON: b64(r.clientDataJSON), authenticatorData: b64(r.authenticatorData),
      signature: b64(r.signature), userHandle: b64(r.userHandle)
    } };
  } catch (err) {
    const name = /^[A-Za-z]+Error$/.test(String(err.name)) ? err.name : 'NotAllowedError';
    return fail(name, String(err.message || name));
  }
});

ipcMain.handle('passkey:list', () => passkeys.list());
ipcMain.handle('passkey:register', async () => {
  // Wer schon einen Passkey hat, muss neue Passkeys bestätigen – sonst ließe sich der Schutz umgehen
  if (passkeys.count() && !(await confirmUser('Falcon möchte einen neuen Passkey hinzufügen.', { force: true }))) return { ok: false, error: 'auth' };
  const r = await passkeys.register({ parent: focusedUi(), strings: passkeyStrings(), reason: tr('Falcon möchte einen neuen Passkey hinzufügen.') });
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
    const url = defaultBrowser.urlFromArgv(argv);
    if (url) win.webContents.send('open-tab', url);
  });

  app.whenReady().then(() => {
    loadSettings();
    Menu.setApplicationMenu(null);
    setupAdblock(session.defaultSession);
    for (const ses of [session.defaultSession, incognitoSession()]) {
      if (ses !== session.defaultSession) adblock.attach(ses);
      googleSignin.setup(ses);
      setupDownloads(ses);
      setupFalconProtocol(ses);
      // Berechtigungen (Kamera/Mikro für Discord etc.) erlauben
      ses.setPermissionRequestHandler((_wc, permission, cb) => {
        cb(['media', 'fullscreen', 'notifications', 'clipboard-sanitized-write', 'pointerLock', 'display-capture'].includes(permission));
      });
    }
    const first = createWindow();
    updater.init((channel, data) => broadcast(channel, data), {
      get: () => settings.pendingUpdate || null,
      set: (v) => { settings.pendingUpdate = v; saveSettings(); }
    });
    // Sofort prüfen, sobald die Oberfläche geladen ist – nicht erst nach einer Wartezeit
    first.webContents.once('did-finish-load', () => {
      updater.check();
      // Falcon wurde über einen Link oder eine HTML-Datei gestartet
      const startUrl = defaultBrowser.urlFromArgv(process.argv);
      if (startUrl) setTimeout(() => { if (alive(first)) first.webContents.send('open-tab', startUrl); }, 300);
    });
    defaultBrowser.refreshRegistration();
    account.init({ notify: (state) => broadcast('account-changed', state, { incognito: false }), providers: syncProviders, locale: pageLanguage });
    app.on('browser-window-focus', () => account.syncIfStale());
    app.on('browser-window-focus', () => updater.checkIfStale());
  });

  app.on('before-quit', () => writeSettingsNow());
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (uiWindows.size === 0) createWindow(); });
}
