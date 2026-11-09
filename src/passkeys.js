'use strict';
/*
 * Passkeys zum Entsperren der Passwörter (WebAuthn).
 *
 * Die Zeremonie läuft in einem kleinen Fenster auf http://localhost:<port>, weil WebAuthn einen
 * sicheren Ursprung braucht (file:// gilt nicht). Windows zeigt dann seinen eigenen Passkey-Dialog,
 * in dem man auch „iPhone, iPad oder Android-Gerät“ (QR-Code + Bluetooth) oder einen
 * Sicherheitsschlüssel wählen kann. Gespeichert werden nur öffentliche Schlüssel; die Signatur wird
 * hier im Hauptprozess geprüft.
 */

const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');

const RP_ID = 'localhost';
const FILE = () => path.join(app.getPath('userData'), 'passkeys.json');
const PAGE = path.join(__dirname, 'auth-window', 'auth.html');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s || ''), 'base64url');
const sha256 = (data) => crypto.createHash('sha256').update(data).digest();

// ---------------------------------------------------------------------------
// Speicher
// ---------------------------------------------------------------------------
let store = null;
function load() {
  if (store) return store;
  try { store = JSON.parse(fs.readFileSync(FILE(), 'utf8')); } catch { store = {}; }
  store.userId ||= b64u(crypto.randomBytes(16));
  store.credentials ||= [];
  return store;
}
function persist() { fs.writeFileSync(FILE(), JSON.stringify(store, null, 2)); }

function list() {
  return load().credentials.map(({ id, kind, created, lastUsed }) => ({ id, kind, created, lastUsed }));
}
function count() { return load().credentials.length; }
function remove(id) {
  load();
  store.credentials = store.credentials.filter((c) => c.id !== id);
  persist();
}

// ---------------------------------------------------------------------------
// Lokaler Server (liefert nur die eine Seite aus)
// ---------------------------------------------------------------------------
let server = null;
let origin = null;
function ensureServer() {
  if (server) return Promise.resolve(origin);
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url.split('?')[0] === '/auth') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:",
          'Cache-Control': 'no-store'
        });
        res.end(fs.readFileSync(PAGE));
      } else {
        res.writeHead(404).end();
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      origin = `http://localhost:${server.address().port}`;
      resolve(origin);
    });
  });
}

// ---------------------------------------------------------------------------
// Zeremonie im eigenen Fenster
// ---------------------------------------------------------------------------
let active = null; // { win, request, challenge, resolve, mode }

ipcMain.handle('passkey-window:request', (e) => (active && e.sender === active.win.webContents ? active.request : null));
ipcMain.handle('passkey-window:finish', (e, result) => {
  if (!active || e.sender !== active.win.webContents) return { ok: false };
  let outcome;
  try {
    outcome = active.mode === 'register' ? finishRegistration(result) : finishAssertion(result);
  } catch (err) {
    outcome = { ok: false, error: err.message };
  }
  if (outcome.ok) {
    const done = active;
    active = null;
    done.resolve(outcome);
    setTimeout(() => { if (!done.win.isDestroyed()) done.win.close(); }, 450);
  }
  return outcome;
});
ipcMain.on('passkey-window:cancel', (e) => {
  if (active && e.sender === active.win.webContents) active.win.close();
});

async function ceremony(mode, { parent, strings, reason }) {
  if (active) { active.win.focus(); return { ok: false, error: 'busy' }; }
  const base = await ensureServer();
  const challenge = crypto.randomBytes(32);
  const creds = load().credentials;

  const publicKey = mode === 'register'
    ? {
      challenge: b64u(challenge),
      rp: { id: RP_ID, name: 'Falcon' },
      user: { id: store.userId, name: 'falcon', displayName: 'Falcon' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -8 }, { type: 'public-key', alg: -257 }],
      excludeCredentials: creds.map((c) => ({ type: 'public-key', id: c.id, transports: c.transports })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      attestation: 'none',
      timeout: 180000
    }
    : {
      challenge: b64u(challenge),
      rpId: RP_ID,
      allowCredentials: creds.map((c) => ({ type: 'public-key', id: c.id, transports: c.transports })),
      userVerification: 'required',
      timeout: 180000
    };

  const win = new BrowserWindow({
    parent, modal: !!parent, width: 420, height: 350, resizable: false, minimizable: false, maximizable: false,
    fullscreenable: false, show: false, frame: false, backgroundColor: '#17181b', title: 'Falcon',
    icon: nativeImage.createFromPath(path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'falcon.ico' : 'falcon.png')),
    webPreferences: { preload: path.join(__dirname, 'auth-window', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  return new Promise((resolve) => {
    active = {
      win, mode, challenge: b64u(challenge), origin: base, resolve,
      request: { mode, publicKey, strings, reason, logo: 'data:image/png;base64,' + logoBase64() }
    };
    win.once('ready-to-show', () => { win.show(); win.focus(); win.webContents.focus(); });
    win.on('closed', () => {
      if (active && active.win === win) { active = null; resolve({ ok: false, error: 'cancelled' }); }
    });
    win.loadURL(`${base}/auth`);
  });
}

let logoCache = null;
function logoBase64() {
  if (!logoCache) {
    const img = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'falcon.png')).resize({ width: 96, height: 96, quality: 'best' });
    logoCache = img.toPNG().toString('base64');
  }
  return logoCache;
}

// ---------------------------------------------------------------------------
// Prüfung
// ---------------------------------------------------------------------------
function checkClientData(clientDataJSON, type) {
  const data = JSON.parse(fromB64u(clientDataJSON).toString('utf8'));
  if (data.type !== type) throw new Error('Falscher Typ');
  if (data.challenge !== active.challenge) throw new Error('Challenge stimmt nicht');
  if (data.origin !== active.origin) throw new Error('Ursprung stimmt nicht');
  return data;
}

function parseAuthData(buf) {
  if (buf.length < 37) throw new Error('Authenticator-Daten zu kurz');
  return { rpIdHash: buf.subarray(0, 32), flags: buf[32], signCount: buf.readUInt32BE(33) };
}

function checkAuthData(auth) {
  if (!auth.rpIdHash.equals(sha256(RP_ID))) throw new Error('RP-ID stimmt nicht');
  if (!(auth.flags & 0x01)) throw new Error('Keine Nutzerbestätigung');      // UP
  if (!(auth.flags & 0x04)) throw new Error('Keine Nutzerverifizierung');     // UV
}

function kindFromTransports(transports = []) {
  if (transports.includes('hybrid')) return 'phone';
  if (transports.includes('internal')) return 'device';
  if (transports.some((t) => ['usb', 'nfc', 'ble'].includes(t))) return 'key';
  return 'phone';
}

function finishRegistration(r) {
  checkClientData(r.clientDataJSON, 'webauthn.create');
  if (!r.publicKey) throw new Error('Kein öffentlicher Schlüssel');
  const auth = parseAuthData(fromB64u(r.authenticatorData));
  checkAuthData(auth);
  // Schlüssel testweise laden – wirft bei kaputten Daten
  crypto.createPublicKey({ key: fromB64u(r.publicKey), format: 'der', type: 'spki' });
  const transports = Array.isArray(r.transports) ? r.transports.filter((t) => typeof t === 'string') : [];
  load().credentials.push({
    id: r.rawId, publicKey: r.publicKey, alg: r.alg, transports,
    kind: kindFromTransports(transports), signCount: auth.signCount, created: Date.now()
  });
  persist();
  return { ok: true };
}

function finishAssertion(r) {
  const cred = load().credentials.find((c) => c.id === r.rawId);
  if (!cred) throw new Error('Unbekannter Passkey');
  const clientData = fromB64u(r.clientDataJSON);
  checkClientData(r.clientDataJSON, 'webauthn.get');
  const authBuf = fromB64u(r.authenticatorData);
  const auth = parseAuthData(authBuf);
  checkAuthData(auth);

  const key = crypto.createPublicKey({ key: fromB64u(cred.publicKey), format: 'der', type: 'spki' });
  const signed = Buffer.concat([authBuf, sha256(clientData)]);
  const valid = crypto.verify(cred.alg === -8 ? null : 'sha256', signed, key, fromB64u(r.signature));
  if (!valid) throw new Error('Signatur ungültig');

  // Zähler darf nicht rückwärts laufen (Hinweis auf einen kopierten Schlüssel); Smartphones senden oft 0
  if (auth.signCount > 0 || cred.signCount > 0) {
    if (auth.signCount <= cred.signCount) throw new Error('Signaturzähler ungültig');
    cred.signCount = auth.signCount;
  }
  cred.lastUsed = Date.now();
  persist();
  return { ok: true };
}

module.exports = {
  list, count, remove,
  register: (opts) => ceremony('register', opts),
  verify: (opts) => ceremony('verify', opts)
};
