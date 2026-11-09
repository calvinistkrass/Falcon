'use strict';
// Falcon als Standardbrowser: Registrierung unter HKCU und Abfrage der aktuellen Auswahl.
// Windows lässt Programme den Standardbrowser nicht selbst setzen – Falcon registriert sich
// und öffnet dann die passende Seite der Windows-Einstellungen.

const { app, shell } = require('electron');
const { execFile } = require('child_process');

const APP_NAME = 'Falcon';
const PROG_URL = 'FalconURL';
const PROG_HTML = 'FalconHTML';
const CLIENT_KEY = `HKCU\\Software\\Clients\\StartMenuInternet\\${APP_NAME}`;
const FILE_TYPES = ['.htm', '.html', '.shtml', '.xht', '.xhtml', '.svg', '.webp', '.pdf'];

const supported = () => process.platform === 'win32';

function reg(args) {
  return new Promise((resolve) => {
    execFile('reg.exe', args, { windowsHide: true }, (err, stdout) => resolve(err ? null : String(stdout)));
  });
}
const add = (key, name, value) => reg(['add', key, ...(name === null ? ['/ve'] : ['/v', name]), '/t', 'REG_SZ', '/d', value, '/f']);

function command() {
  const exe = process.execPath;
  // In der Entwicklung startet electron.exe den App-Ordner
  return app.isPackaged ? `"${exe}" "%1"` : `"${exe}" "${app.getAppPath()}" "%1"`;
}

/** Schreibt die Registrierung (nur HKCU, keine Adminrechte nötig). */
async function register() {
  if (!supported()) return false;
  const exe = process.execPath;
  const icon = `"${exe}",0`;
  const cmd = command();
  for (const [prog, label] of [[PROG_URL, 'Falcon URL'], [PROG_HTML, 'Falcon HTML Document']]) {
    const k = `HKCU\\Software\\Classes\\${prog}`;
    await add(k, null, label);
    if (prog === PROG_URL) await add(k, 'URL Protocol', '');
    await add(`${k}\\DefaultIcon`, null, icon);
    await add(`${k}\\shell\\open\\command`, null, cmd);
  }
  await add(CLIENT_KEY, null, APP_NAME);
  await add(`${CLIENT_KEY}\\DefaultIcon`, null, icon);
  await add(`${CLIENT_KEY}\\shell\\open\\command`, null, app.isPackaged ? `"${exe}"` : `"${exe}" "${app.getAppPath()}"`);
  const cap = `${CLIENT_KEY}\\Capabilities`;
  await add(cap, 'ApplicationName', APP_NAME);
  await add(cap, 'ApplicationDescription', 'A fast, focused Chromium browser built for gamers.');
  await add(cap, 'ApplicationIcon', icon);
  await add(`${cap}\\StartMenu`, 'StartMenuInternet', APP_NAME);
  for (const p of ['http', 'https']) await add(`${cap}\\URLAssociations`, p, PROG_URL);
  for (const ext of FILE_TYPES) await add(`${cap}\\FileAssociations`, ext, PROG_HTML);
  await add('HKCU\\Software\\RegisteredApplications', APP_NAME, `Software\\Clients\\StartMenuInternet\\${APP_NAME}\\Capabilities`);
  return true;
}

/** true, wenn Windows https-Links an Falcon gibt. */
async function isDefault() {
  if (!supported()) return false;
  const out = await reg(['query', 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice', '/v', 'ProgId']);
  return !!out && new RegExp(`ProgId\\s+REG_SZ\\s+${PROG_URL}\\b`, 'i').test(out);
}

/** Registrieren und die Windows-Einstellungen direkt bei Falcon öffnen. */
async function makeDefault() {
  if (!supported()) return false;
  await register();
  try {
    await shell.openExternal(`ms-settings:defaultapps?registeredAppUser=${encodeURIComponent(APP_NAME)}`);
  } catch {
    await shell.openExternal('ms-settings:defaultapps').catch(() => {});
  }
  return true;
}

/** Beim Start der installierten Version: Pfad aktuell halten, falls Falcon schon registriert ist. */
async function refreshRegistration() {
  if (!supported() || !app.isPackaged) return;
  const out = await reg(['query', 'HKCU\\Software\\RegisteredApplications', '/v', APP_NAME]);
  if (out) await register();
}

/** URL oder Datei aus den Startargumenten (z. B. Link aus einer anderen App). */
function urlFromArgv(argv) {
  const args = argv.slice(app.isPackaged ? 1 : 2).filter((a) => a && !a.startsWith('--'));
  for (const a of args) {
    if (/^https?:\/\//i.test(a)) return a;
    if (/^[a-z]:[\\/]/i.test(a) && FILE_TYPES.some((ext) => a.toLowerCase().endsWith(ext))) {
      return require('url').pathToFileURL(a).href;
    }
  }
  return null;
}

module.exports = { supported, register, isDefault, makeDefault, refreshRegistration, urlFromArgv };
