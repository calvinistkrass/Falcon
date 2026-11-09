'use strict';
/*
 * Updates über GitHub Releases.
 *
 * Das Repository steht in package.json unter "repository" (z. B. "github:name/falcon").
 * Die installierte Version (NSIS-Installer) lädt Updates herunter und installiert sie beim
 * Neustart. Die portable .exe kann sich nicht selbst ersetzen – dort öffnet Falcon die
 * Release-Seite, damit man die neue Datei herunterladen kann.
 */

const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const pkg = require('../package.json');

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const PLACEHOLDER = /DEIN-GITHUB-NAME/i;

let send = () => {};
let status = { state: 'idle', version: pkg.version };
let configured = false;

function repository() {
  const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || '';
  const m = raw.match(/github(?:\.com[/:]|:)([^/\s]+)\/([^/\s#]+?)(?:\.git)?$/i);
  if (!m || PLACEHOLDER.test(m[1])) return null;
  return { owner: m[1], repo: m[2] };
}

const isPortable = () => !!process.env.PORTABLE_EXECUTABLE_DIR;

function releaseUrl(version) {
  const r = repository();
  if (!r) return null;
  return `https://github.com/${r.owner}/${r.repo}/releases${version ? `/tag/v${version}` : '/latest'}`;
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

function init(sender) {
  send = sender;
  const repo = repository();
  if (!app.isPackaged) { setStatus({ state: 'dev' }); return; }
  if (!repo) { setStatus({ state: 'unconfigured' }); return; }

  autoUpdater.setFeedURL({ provider: 'github', owner: repo.owner, repo: repo.repo });
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;
  configured = true;

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }));
  autoUpdater.on('update-not-available', () => setStatus({ state: 'latest', checkedAt: Date.now() }));
  autoUpdater.on('update-available', (info) => setStatus({
    state: 'available', available: info.version, notes: plainNotes(info.releaseNotes),
    portable: isPortable(), url: releaseUrl(info.version), checkedAt: Date.now()
  }));
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

  setTimeout(check, 15_000);
  setInterval(check, CHECK_INTERVAL_MS);
}

function check() {
  if (!configured) return Promise.resolve(status);
  if (['checking', 'downloading', 'downloaded'].includes(status.state)) return Promise.resolve(status);
  return autoUpdater.checkForUpdates().then(() => status).catch(() => status);
}

function download() {
  if (!configured || status.state !== 'available' || status.portable) return;
  setStatus({ state: 'downloading', percent: 0 });
  autoUpdater.downloadUpdate().catch(() => {});
}

function install() {
  if (status.state === 'downloaded') autoUpdater.quitAndInstall(false, true);
}

module.exports = { init, check, download, install, getStatus: () => status, releaseUrl };
