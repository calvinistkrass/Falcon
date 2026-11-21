'use strict';
/*
 * Updates über GitHub Releases.
 *
 * Das Repository steht in package.json unter "repository" (z. B. "github:name/falcon").
 * Die installierte Version (NSIS-Installer) lädt Updates herunter und installiert sie beim
 * Neustart, ebenso seit 2.4.0 die Linux-Pakete (.deb/.rpm). Die portable .exe und macOS können sich nicht
 * selbst ersetzen – dort öffnet Falcon die Download-Seite auf falconbrowser.de.
 */

const { app, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const pkg = require('../package.json');

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const RECHECK_ON_FOCUS_MS = 60 * 60 * 1000;
const PLACEHOLDER = /DEIN-GITHUB-NAME/i;

let send = () => {};
let status = { state: 'idle', version: pkg.version };
let configured = false;
let lastCheck = 0;
let remember = () => {};

/** „1.10.0“ > „1.9.2“ – reicht für Falcons Versionsnummern */
function newer(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

function repository() {
  const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || '';
  const m = raw.match(/github(?:\.com[/:]|:)([^/\s]+)\/([^/\s#]+?)(?:\.git)?$/i);
  if (!m || PLACEHOLDER.test(m[1])) return null;
  return { owner: m[1], repo: m[2] };
}

const isPortable = () => !!process.env.PORTABLE_EXECUTABLE_DIR;
/** Linux: „deb“ oder „rpm“, wenn Falcon aus dem Paket installiert ist (electron-builder legt die Datei an) */
let pkgType = null;
function linuxPackage() {
  if (pkgType === null) {
    try { pkgType = fs.readFileSync(path.join(process.resourcesPath, 'package-type'), 'utf8').trim(); } catch { pkgType = ''; }
  }
  return pkgType;
}
// Seit 2.4.0 aktualisiert sich auch die Linux-Version (.deb/.rpm) selbst wie unter Windows: Download im
// Hintergrund, Installation beim Neustart über den Paketmanager (Linux fragt dafür einmal nach dem Passwort).
const linuxAuto = () => process.platform === 'linux' && ['deb', 'rpm'].includes(linuxPackage());
// Nicht selbst aktualisieren können: portable .exe und macOS (nicht von Apple signiert – Squirrel.Mac
// verlangt das). Dort öffnet Falcon die Download-Seite auf falconbrowser.de.
const manualUpdate = () => (process.platform === 'win32' ? isPortable() : !linuxAuto());

// macOS (und Linux ohne Paket, z. B. entpackt): Falcon fragt die GitHub-API direkt nach dem neuesten Release,
// das eine Datei für dieses System enthält. .deb/.rpm nutzen seit 2.4.0 electron-updater mit latest-linux.yml
// (der Release-Workflow trägt dort .deb und .rpm ein).
const apiCheck = () => process.platform === 'darwin' || (process.platform === 'linux' && !linuxAuto());

/** Welche Release-Datei passt zu diesem System? */
function assetPattern() {
  if (process.platform === 'darwin') {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    return new RegExp(`-mac-${arch}\\.dmg$`, 'i');
  }
  let type = '';
  try { type = fs.readFileSync(path.join(process.resourcesPath, 'package-type'), 'utf8').trim(); } catch { /* unbekannt */ }
  if (type === 'rpm') return /-linux-x86_64\.rpm$/i;
  if (type === 'deb') return /-linux-amd64\.deb$/i;
  return /-linux-[^.]+\.(deb|rpm)$/i;
}

async function checkViaApi() {
  const r = repository();
  setStatus({ state: 'checking' });
  try {
    const res = await net.fetch(`https://api.github.com/repos/${r.owner}/${r.repo}/releases?per_page=10`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Falcon-Updater' },
    });
    if (!res.ok) throw new Error(`GitHub antwortet mit ${res.status}`);
    const releases = await res.json();
    const pattern = assetPattern();
    const latest = (Array.isArray(releases) ? releases : [])
      .filter((rel) => !rel.draft && !rel.prerelease && (rel.assets || []).some((a) => pattern.test(a.name)))
      .map((rel) => ({ version: String(rel.tag_name || '').replace(/^v/i, ''), notes: rel.body || '' }))
      .filter((rel) => /^\d+\.\d+\.\d+/.test(rel.version))
      .sort((a, b) => (newer(a.version, b.version) ? -1 : newer(b.version, a.version) ? 1 : 0))[0];
    if (latest && newer(latest.version, pkg.version)) {
      const notes = plainNotes(latest.notes);
      remember({ version: latest.version, notes });
      setStatus({ state: 'available', available: latest.version, notes, portable: true, url: releaseUrl(), checkedAt: Date.now() });
    } else {
      remember(null);
      setStatus({ state: 'latest', checkedAt: Date.now() });
    }
  } catch (err) {
    setStatus({ state: 'error', error: String(err?.message || err).split('\n')[0].slice(0, 200) });
  }
  return status;
}

/** Download-Seite für Versionen, die sich nicht selbst aktualisieren (seit 2.4.0 falconbrowser.de statt GitHub) */
function releaseUrl() {
  const hash = process.platform === 'darwin' ? '#mac' : process.platform === 'linux' ? '#linux' : '#windows';
  return `https://falconbrowser.de/download${hash}`;
}

function setStatus(patch) {
  status = { ...status, ...patch };
  send('update-status', status);
}

function plainNotes(notes) {
  const text = Array.isArray(notes) ? notes.map((n) => n.note || '').join('\n') : String(notes || '');
  return text.replace(/<\/(p|li|h\d)>/gi, '\n').replace(/<li>/gi, '• ').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1200);
}

/**
 * sender: schickt Statusmeldungen an die Fenster
 * cache: { get(), set(value) } – merkt sich ein gefundenes Update, damit der Hinweis beim nächsten
 *        Start sofort erscheint (noch bevor GitHub geantwortet hat)
 */
function init(sender, cache) {
  send = sender;
  remember = (v) => cache?.set(v);
  const known = cache?.get();
  if (known && newer(known.version, pkg.version)) {
    status = { ...status, state: 'available', available: known.version, notes: known.notes || '', portable: manualUpdate(), url: releaseUrl(), linux: linuxAuto() };
  } else if (known) {
    remember(null); // inzwischen installiert
  }
  const repo = repository();
  if (!app.isPackaged) { setStatus({ state: 'dev' }); return; }
  if (!repo) { setStatus({ state: 'unconfigured' }); return; }

  if (apiCheck()) {
    configured = true;
    setInterval(check, CHECK_INTERVAL_MS);
    return;
  }

  autoUpdater.setFeedURL({ provider: 'github', owner: repo.owner, repo: repo.repo });
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;
  configured = true;

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }));
  autoUpdater.on('update-not-available', () => { remember(null); setStatus({ state: 'latest', checkedAt: Date.now() }); });
  autoUpdater.on('update-available', (info) => {
    const notes = plainNotes(info.releaseNotes);
    remember({ version: info.version, notes });
    setStatus({ state: 'available', available: info.version, notes, portable: manualUpdate(), url: releaseUrl(), linux: linuxAuto(), checkedAt: Date.now() });
  });
  autoUpdater.on('download-progress', (p) => setStatus({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => setStatus({ state: 'downloaded', available: info.version }));
  autoUpdater.on('error', (err) => {
    const message = String(err?.message || err);
    // Noch kein Release veröffentlicht – das ist kein Fehler
    if (/No published versions|Unable to find latest version|HttpError: 404/i.test(message)) {
      setStatus({ state: 'latest', checkedAt: Date.now() });
      return;
    }
    // Kein Netz o. Ä. – still bleiben, aber in den Einstellungen anzeigen
    setStatus({ state: status.state === 'downloading' ? 'available' : 'error', error: message.split('\n')[0].slice(0, 200) });
  });

  setInterval(check, CHECK_INTERVAL_MS);
}

function check() {
  if (!configured) return Promise.resolve(status);
  if (['checking', 'downloading', 'downloaded'].includes(status.state)) return Promise.resolve(status);
  lastCheck = Date.now();
  if (apiCheck()) return checkViaApi();
  return autoUpdater.checkForUpdates().then(() => status).catch(() => status);
}

/** Beim Zurückkehren zu Falcon erneut prüfen, wenn die letzte Prüfung länger her ist */
function checkIfStale() {
  if (Date.now() - lastCheck > RECHECK_ON_FOCUS_MS) check();
}

function download() {
  if (!configured || status.state !== 'available' || status.portable) return;
  setStatus({ state: 'downloading', percent: 0 });
  autoUpdater.downloadUpdate().catch(() => {});
}

function install() {
  // Installer unsichtbar ausführen (/S) und Falcon danach automatisch wieder öffnen
  if (status.state === 'downloaded') setImmediate(() => autoUpdater.quitAndInstall(true, true));
}

module.exports = { init, check, checkIfStale, download, install, getStatus: () => status, releaseUrl };
