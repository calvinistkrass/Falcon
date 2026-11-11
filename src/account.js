'use strict';
// Falcon-Konto: Anmeldung über Firebase Authentication (REST) und Sync über Firestore.
// Alle Sync-Daten werden vor dem Hochladen auf dem PC verschlüsselt (AES-256-GCM). Der Schlüssel
// liegt in Firestore nur mit dem Kontopasswort verschlüsselt vor – Firebase kann nichts davon lesen.

const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');
const { promisify } = require('util');
const config = require('./firebase-config');

const pbkdf2 = promisify(crypto.pbkdf2);
const KINDS = ['bookmarks', 'passwords', 'history', 'settings'];
const ALL_KINDS = [...KINDS, 'tabs']; // „tabs“: eigene offene Tabs für andere PCs bereitstellen (wird nicht zusammengeführt)

// Feste Kennung dieser Installation – unabhängig vom Konto
function deviceId() {
  const file = path.join(app.getPath('userData'), 'device-id');
  try { const id = fs.readFileSync(file, 'utf8').trim(); if (/^[0-9a-f-]{36}$/.test(id)) return id; } catch { /* neu anlegen */ }
  const id = crypto.randomUUID();
  try { fs.writeFileSync(file, id); } catch { /* egal */ }
  return id;
}
const PBKDF2_ITER = 310000;

// In der Entwicklung kann ein lokaler Firebase-Emulator genutzt werden
const EMU = !app.isPackaged && process.env.FALCON_FIREBASE_EMULATOR;
const AUTH = EMU ? `${EMU}/identitytoolkit.googleapis.com/v1` : 'https://identitytoolkit.googleapis.com/v1';
const TOKEN = EMU ? `${EMU}/securetoken.googleapis.com/v1` : 'https://securetoken.googleapis.com/v1';
const STORE = `${EMU ? `${EMU}/v1` : 'https://firestore.googleapis.com/v1'}/projects/${config.projectId}/databases/(default)/documents`;

const FILE = () => path.join(app.getPath('userData'), 'account.json');

let data = null;          // gespeicherter Zustand (ohne Klartext-Geheimnisse)
let secret = null;        // { refreshToken, dataKey (Buffer) }
let idToken = null;
let idTokenExp = 0;
let pendingPassword = null; // nur kurz im Speicher, wenn der Sync-Schlüssel nicht entsperrt werden konnte
let syncing = false;
let syncTimer = null;
let periodicTimer = null;
let notify = () => {};
let providers = {};
let locale = () => 'de';

// ---------------------------------------------------------------------------
// Speicher
// ---------------------------------------------------------------------------
const canEncrypt = () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } };
function seal(obj) {
  const json = JSON.stringify(obj);
  return canEncrypt() ? 'enc:' + safeStorage.encryptString(json).toString('base64') : 'pln:' + Buffer.from(json).toString('base64');
}
function unseal(str) {
  if (!str) return null;
  const buf = Buffer.from(str.slice(4), 'base64');
  return JSON.parse(str.startsWith('enc:') ? safeStorage.decryptString(buf) : buf.toString('utf8'));
}

function load() {
  if (data) return data;
  try {
    data = JSON.parse(fs.readFileSync(FILE(), 'utf8'));
    const s = unseal(data.secret);
    secret = s ? { refreshToken: s.refreshToken, dataKey: s.dataKey ? Buffer.from(s.dataKey, 'base64') : null } : null;
  } catch {
    data = null; secret = null;
  }
  if (!data || !secret?.refreshToken) { data = null; secret = null; }
  return data;
}
function persist() {
  if (!data) { try { fs.unlinkSync(FILE()); } catch { /* gibt es nicht */ } return; }
  data.secret = seal({ refreshToken: secret.refreshToken, dataKey: secret.dataKey ? secret.dataKey.toString('base64') : null });
  fs.writeFileSync(FILE(), JSON.stringify(data, null, 2));
}

function publicState() {
  load();
  if (!data) return { signedIn: false };
  return {
    signedIn: true,
    email: data.email,
    displayName: data.displayName || '',
    emailVerified: !!data.emailVerified,
    deviceName: data.deviceName || os.hostname(),
    kinds: data.kinds,
    syncing,
    lastSync: data.lastSync || 0,
    lastError: data.lastError || null,
    needsKey: !secret.dataKey && !data.keyError,
    keyPending: !secret.dataKey && !!data.keyError,
    canUnlock: !!pendingPassword,
    coins: (data.coins?.balance || 0) + (data.coins?.pending || 0),
    betaUntil: data.betaUntil || 0,
    beta: (data.betaUntil || 0) > Date.now(),
    admin: !!data.admin
  };
}
const changed = () => notify(publicState());

// ---------------------------------------------------------------------------
// Netzwerk
// ---------------------------------------------------------------------------
class AccountError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

async function request(url, { method = 'GET', body, token, form, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      body: form ? new URLSearchParams(form).toString() : body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new AccountError('NETWORK');
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  if (!res.ok) {
    const err = json.error || {};
    // Firebase Auth: „EMAIL_EXISTS“, „WEAK_PASSWORD : …“; Firestore: status „PERMISSION_DENIED“ …
    const m = typeof err.message === 'string' ? err.message.match(/^([A-Z_]{2,})(?=$|\s|:)/) : null;
    const e = new AccountError((m && m[1]) || err.status || `HTTP_${res.status}`, res.status);
    e.detail = typeof err.message === 'string' ? err.message : '';
    throw e;
  }
  return json;
}

const auth = (action, body, headers) => request(`${AUTH}/accounts:${action}?key=${config.apiKey}`, { method: 'POST', body, headers });

function setTokens(r) {
  idToken = r.idToken || r.id_token;
  idTokenExp = Date.now() + (Number(r.expiresIn || r.expires_in) || 3600) * 1000;
  const refresh = r.refreshToken || r.refresh_token;
  if (refresh && secret) secret.refreshToken = refresh;
}

async function token() {
  if (!load()) throw new AccountError('SIGNED_OUT');
  if (idToken && Date.now() < idTokenExp - 60_000) return idToken;
  try {
    const r = await request(`${TOKEN}/token?key=${config.apiKey}`, { method: 'POST', form: { grant_type: 'refresh_token', refresh_token: secret.refreshToken } });
    setTokens(r);
    persist();
    return idToken;
  } catch (e) {
    if (['TOKEN_EXPIRED', 'USER_DISABLED', 'USER_NOT_FOUND', 'INVALID_REFRESH_TOKEN'].includes(e.code)) {
      clearLocal();
      notify({ signedIn: false, lastError: 'SESSION_EXPIRED' });
    }
    throw e;
  }
}

// Firestore
const docUrl = (p) => `${STORE}/${p}`;
async function getDoc(p) {
  try {
    return await request(docUrl(p), { token: await token() });
  } catch (e) {
    // Nur „The database (default) does not exist …“ – fehlende Dokumente nennen im Pfad ebenfalls „databases“
    if (e.code === 'NOT_FOUND' && /database .*does not exist/i.test(e.detail || '')) throw new AccountError('NO_DATABASE', 404);
    if (e.code === 'NOT_FOUND' || e.status === 404) return null;
    throw e;
  }
}
async function putDoc(p, fields, precondition) {
  const q = precondition?.updateTime ? `?currentDocument.updateTime=${encodeURIComponent(precondition.updateTime)}`
    : precondition?.exists === false ? '?currentDocument.exists=false' : '';
  return request(docUrl(p) + q, { method: 'PATCH', token: await token(), body: { fields } });
}
async function deleteDoc(p) {
  try { await request(docUrl(p), { method: 'DELETE', token: await token() }); } catch (e) { if (e.status !== 404) throw e; }
}
const str = (v) => ({ stringValue: String(v) });
const int = (v) => ({ integerValue: String(Math.round(v)) });

// ---------------------------------------------------------------------------
// Verschlüsselung
// ---------------------------------------------------------------------------
function encrypt(key, obj, aad) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(zlib.gzipSync(Buffer.from(JSON.stringify(obj)))), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
function decrypt(key, b64, aad) {
  const buf = Buffer.from(b64, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(buf.subarray(28)), d.final()])).toString('utf8'));
}

async function wrapKey(dataKey, password, uid) {
  const salt = crypto.randomBytes(16);
  const kek = await pbkdf2(password, salt, PBKDF2_ITER, 32, 'sha256');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', kek, iv);
  c.setAAD(Buffer.from(`falcon-key:${uid}`));
  const ct = Buffer.concat([c.update(dataKey), c.final()]);
  return { salt: str(salt.toString('base64')), iter: int(PBKDF2_ITER), wrapped: str(Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64')), v: int(1) };
}
async function unwrapKey(doc, password, uid) {
  try {
    const f = doc.fields;
    const kek = await pbkdf2(password, Buffer.from(f.salt.stringValue, 'base64'), Number(f.iter.integerValue), 32, 'sha256');
    const buf = Buffer.from(f.wrapped.stringValue, 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', kek, buf.subarray(0, 12));
    d.setAAD(Buffer.from(`falcon-key:${uid}`));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
  } catch { return null; }
}
const keyPath = () => `users/${data.uid}/meta/key`;
const syncPath = (kind) => `users/${data.uid}/sync/${kind}`;

/** Sync-Schlüssel holen oder beim ersten Mal anlegen. */
async function setupKey(password) {
  const doc = await getDoc(keyPath());
  if (!doc) {
    const key = crypto.randomBytes(32);
    try {
      await putDoc(keyPath(), await wrapKey(key, password, data.uid), { exists: false });
      return key;
    } catch (e) {
      if (!/ALREADY_EXISTS|FAILED_PRECONDITION/.test(e.code)) throw e;
      return setupKey(password); // ein anderer PC war schneller
    }
  }
  return unwrapKey(doc, password, data.uid);
}

// ---------------------------------------------------------------------------
// Anmeldung
// ---------------------------------------------------------------------------
function startSession(r, email) {
  data = {
    v: 1, uid: r.localId, email: r.email || email, displayName: r.displayName || '', emailVerified: false,
    deviceName: os.hostname(), kinds: Object.fromEntries(ALL_KINDS.map((k) => [k, true])), sync: {}, lastSync: 0, lastError: null
  };
  secret = { refreshToken: r.refreshToken, dataKey: null };
  setTokens(r);
}

// Die Anmeldung steht, sobald Firebase sie bestätigt hat. Klappt das Einrichten des Sync-Schlüssels
// nicht (z. B. offline), bleibt man trotzdem angemeldet und Falcon versucht es beim nächsten Sync erneut.
let pendingTimer = null;
function rememberPassword(password) {
  pendingPassword = password;
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => { pendingPassword = null; changed(); }, 15 * 60_000);
}
async function finishSignIn(password) {
  let key = null;
  try {
    key = await setupKey(password);
    data.keyError = null;
  } catch (e) {
    if (!(e instanceof AccountError)) console.error('Sync-Schlüssel:', e);
    data.keyError = e.code || 'UNKNOWN';
    data.lastError = data.keyError;
  }
  if (key) { secret.dataKey = key; pendingPassword = null; } else rememberPassword(password);
  persist();
  changed();
  scheduleSync(key ? 500 : 20_000);
  startPeriodic();
  loadCoins().then(checkAdmin).catch(() => {});
}

const safe = (fn) => async (...args) => {
  try { return { ok: true, ...(await fn(...args)) }; } catch (e) {
    if (!(e instanceof AccountError)) console.error('Konto:', e);
    return { ok: false, error: e.code || 'UNKNOWN' };
  }
};
const localeHeader = () => ({ 'X-Firebase-Locale': locale() });

const signUp = safe(async ({ name, email, password }) => {
  const r = await auth('signUp', { email, password, returnSecureToken: true });
  startSession(r, email);
  if (name) {
    const u = await auth('update', { idToken, displayName: name, returnSecureToken: true });
    setTokens(u);
    data.displayName = name;
  }
  auth('sendOobCode', { requestType: 'VERIFY_EMAIL', idToken }, localeHeader()).catch(() => {});
  await finishSignIn(password);
  return {};
});

const signIn = safe(async ({ email, password }) => {
  const r = await auth('signInWithPassword', { email, password, returnSecureToken: true });
  startSession(r, email);
  try {
    const u = (await auth('lookup', { idToken })).users?.[0];
    if (u) { data.displayName = u.displayName || ''; data.emailVerified = !!u.emailVerified; }
  } catch { /* nicht wichtig */ }
  await finishSignIn(password);
  return { needsKey: !secret.dataKey && !data.keyError };
});

function clearLocal() {
  clearTimeout(syncTimer); clearInterval(periodicTimer);
  data = null; secret = null; idToken = null; idTokenExp = 0; pendingPassword = null;
  persist();
}
const signOut = safe(async () => {
  try { await flushCoins(); } catch { /* egal */ }
  // Eigene offenen Tabs vom Server entfernen (wenn möglich)
  try { if (secret?.dataKey) await deleteDoc(devicePath()); } catch { /* offline – egal */ }
  clearLocal(); changed(); return {};
});

const resetPassword = safe(async ({ email }) => {
  await auth('sendOobCode', { requestType: 'PASSWORD_RESET', email }, localeHeader());
  return {};
});
const resendVerification = safe(async () => {
  await auth('sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: await token() }, localeHeader());
  return {};
});
const refreshProfile = safe(async () => {
  const u = (await auth('lookup', { idToken: await token() })).users?.[0];
  if (u && (data.displayName !== (u.displayName || '') || data.emailVerified !== !!u.emailVerified)) {
    data.displayName = u.displayName || ''; data.emailVerified = !!u.emailVerified; persist(); changed();
  }
  return {};
});
const updateProfile = safe(async ({ displayName, deviceName }) => {
  if (typeof displayName === 'string' && displayName !== data.displayName) {
    const u = await auth('update', { idToken: await token(), displayName: displayName.trim().slice(0, 60), returnSecureToken: true });
    setTokens(u);
    data.displayName = displayName.trim().slice(0, 60);
  }
  if (typeof deviceName === 'string') data.deviceName = deviceName.trim().slice(0, 60) || os.hostname();
  persist(); changed();
  return {};
});

/** Nach „Passwort vergessen“: Schlüssel mit dem alten Passwort entsperren und neu verpacken. */
const unlockKey = safe(async ({ oldPassword }) => {
  if (!pendingPassword) throw new AccountError('RELOGIN');
  const doc = await getDoc(keyPath());
  const key = doc && await unwrapKey(doc, oldPassword, data.uid);
  if (!key) throw new AccountError('WRONG_OLD_PASSWORD');
  await putDoc(keyPath(), await wrapKey(key, pendingPassword, data.uid), { updateTime: doc.updateTime });
  secret.dataKey = key; pendingPassword = null;
  persist(); changed(); scheduleSync(300);
  return {};
});
/** Alte Sync-Daten verwerfen und mit neuem Schlüssel neu anfangen. Lokale Daten bleiben erhalten. */
const resetSyncData = safe(async () => {
  if (!pendingPassword) throw new AccountError('RELOGIN');
  for (const k of KINDS) await deleteDoc(syncPath(k));
  const key = crypto.randomBytes(32);
  await putDoc(keyPath(), await wrapKey(key, pendingPassword, data.uid));
  secret.dataKey = key; pendingPassword = null; data.sync = {};
  persist(); changed(); scheduleSync(300);
  return {};
});

const changePassword = safe(async ({ current, next }) => {
  const r = await auth('signInWithPassword', { email: data.email, password: current, returnSecureToken: true });
  setTokens(r);
  const u = await auth('update', { idToken, password: next, returnSecureToken: true });
  setTokens(u);
  if (secret.dataKey) await putDoc(keyPath(), await wrapKey(secret.dataKey, next, data.uid));
  persist(); changed();
  return {};
});

const deleteAccount = safe(async ({ password }) => {
  const r = await auth('signInWithPassword', { email: data.email, password, returnSecureToken: true });
  setTokens(r);
  for (const k of KINDS) await deleteDoc(syncPath(k));
  try {
    const res = await request(`${STORE}/users/${data.uid}/devices?pageSize=50`, { token: await token() });
    for (const doc of res.documents || []) await deleteDoc(`users/${data.uid}/devices/${doc.name.split('/').pop()}`);
  } catch { /* keine Geräte */ }
  await deleteDoc(keyPath());
  await auth('delete', { idToken });
  clearLocal(); changed();
  return {};
});

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------
const MERGE = {
  // Ordner nach Namen zusammenführen, Lesezeichen nach URL
  bookmarks(local, remote, first) {
    const base = structuredClone(first ? remote : local);
    const other = first ? local : remote;
    const mergeInto = (target, items) => {
      for (const n of items || []) {
        if (n.folder) {
          const f = target.find((x) => x.folder && x.title === n.title);
          if (f) mergeInto(f.children || (f.children = []), n.children);
          else target.push(structuredClone(n));
        } else if (!target.some((x) => !x.folder && x.url === n.url)) target.push(structuredClone(n));
      }
    };
    mergeInto(base, other);
    return base;
  },
  passwords(local, remote) {
    const key = (e) => `${e.origin}\n${e.username}`;
    const map = new Map();
    for (const e of remote || []) map.set(key(e), e);
    for (const e of local || []) {
      const r = map.get(key(e));
      if (!r || (e.updated || e.created || 0) >= (r.updated || r.created || 0)) map.set(key(e), r ? { ...r, ...e } : e);
      else map.set(key(e), { ...r, id: e.id });
    }
    return [...map.values()];
  },
  history(local, remote) {
    const map = new Map();
    for (const e of [...(remote || []), ...(local || [])]) {
      const x = map.get(e.url);
      if (!x) { map.set(e.url, { ...e }); continue; }
      x.visits = Math.max(x.visits || 0, e.visits || 0);
      if ((e.last || 0) > (x.last || 0)) { x.last = e.last; if (e.title) x.title = e.title; }
    }
    return [...map.values()].sort((a, b) => (b.last || 0) - (a.last || 0)).slice(0, 3000);
  },
  // Beim ersten Sync eines PCs gelten die Einstellungen des Kontos, danach die zuletzt lokal geänderten
  settings: (local, remote, first) => (first ? { ...local, ...remote } : { ...remote, ...local })
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hasData = (v) => (Array.isArray(v) ? v.length > 0 : v && Object.keys(v).length > 0);

async function syncKind(kind, attempt = 0) {
  const p = providers[kind];
  const st = data.sync[kind] || (data.sync[kind] = { rev: null, dirty: true });
  const aad = `${data.uid}:${kind}`;
  const remote = await getDoc(syncPath(kind));
  let upload;

  if (!remote) {
    const local = await p.get();
    if (!hasData(local)) { st.dirty = false; return; }
    upload = local;
  } else if (remote.updateTime !== st.rev) {
    const remoteData = decrypt(secret.dataKey, remote.fields.data.stringValue, aad);
    if (st.dirty || st.rev == null) {
      const merged = MERGE[kind](await p.get(), remoteData, st.rev == null);
      await p.set(merged);
      if (same(merged, remoteData)) { st.rev = remote.updateTime; st.dirty = false; return; }
      upload = merged;
    } else {
      await p.set(remoteData);
      st.rev = remote.updateTime; st.dirty = false;
      return;
    }
  } else if (st.dirty) {
    upload = await p.get();
  } else return;

  st.dirty = false; // Änderungen während des Hochladens markieren den Bereich erneut
  try {
    const doc = await putDoc(syncPath(kind), {
      data: str(encrypt(secret.dataKey, upload, aad)),
      device: str(data.deviceName || os.hostname()),
      at: int(Date.now()),
      v: int(1)
    }, remote ? { updateTime: remote.updateTime } : { exists: false });
    st.rev = doc.updateTime;
  } catch (e) {
    st.dirty = true;
    if (/FAILED_PRECONDITION|ALREADY_EXISTS|ABORTED/.test(e.code) && attempt < 2) return syncKind(kind, attempt + 1);
    throw e;
  }
}

async function syncNow() {
  if (!load() || syncing) return publicState();
  if (!secret.dataKey) {
    // Schlüssel konnte bei der Anmeldung nicht eingerichtet werden – jetzt erneut versuchen
    if (!data.keyError) return publicState();
    if (!pendingPassword) { data.lastError = 'RELOGIN'; persist(); changed(); return publicState(); }
    syncing = true; changed();
    try {
      const key = await setupKey(pendingPassword);
      if (key) { secret.dataKey = key; pendingPassword = null; } else data.lastError = null;
      data.keyError = null;
    } catch (e) { data.keyError = data.lastError = e.code || 'UNKNOWN'; }
    syncing = false;
    persist(); changed();
    if (!secret.dataKey) return publicState();
  }
  syncing = true; changed();
  let error = null;
  for (const kind of KINDS) {
    if (!data?.kinds?.[kind]) continue;
    try { await syncKind(kind); } catch (e) {
      if (!(e instanceof AccountError)) console.error(`Sync ${kind}:`, e);
      error = e.code || 'UNKNOWN';
      if (!data) break; // abgemeldet
    }
  }
  if (data) {
    try { await pushTabs(); } catch (e) { if (!(e instanceof AccountError)) console.error('Sync tabs:', e); error = error || e.code || 'UNKNOWN'; }
  }
  syncing = false;
  if (data) { data.lastError = error; if (!error) data.lastSync = Date.now(); persist(); }
  changed();
  return publicState();
}

function scheduleSync(ms) {
  if (!load() || (!secret.dataKey && !data.keyError)) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(), ms);
}
function startPeriodic() {
  clearInterval(periodicTimer);
  periodicTimer = setInterval(() => syncNow(), 10 * 60_000);
}

/** Lokale Änderung – nach kurzer Pause hochladen. */
function markDirty(kind) {
  if (!load() || !ALL_KINDS.includes(kind) || data.kinds[kind] === false) return;
  const st = data.sync[kind] || (data.sync[kind] = { rev: null, dirty: true });
  if (!st.dirty) { st.dirty = true; persist(); }
  scheduleSync(kind === 'history' ? 120_000 : kind === 'tabs' ? 60_000 : 15_000);
}

// ---------------------------------------------------------------------------
// Offene Tabs auf anderen PCs
// ---------------------------------------------------------------------------
const devicePath = () => `users/${data.uid}/devices/${deviceId()}`;
let lastTabsHash = null;
async function pushTabs(force = false) {
  if (!data || !secret?.dataKey || !providers.openTabs) return;
  if (data.kinds.tabs === false) {
    if (lastTabsHash !== 'off') { await deleteDoc(devicePath()); lastTabsHash = 'off'; }
    return;
  }
  const tabs = (await providers.openTabs.get()).slice(0, 60);
  const hash = crypto.createHash('sha1').update(JSON.stringify(tabs)).digest('hex');
  // Spätestens alle 6 Stunden neu hochladen, damit der PC als „aktiv“ gilt
  if (!force && hash === lastTabsHash && Date.now() - (data.tabsAt || 0) < 6 * 3600_000) return;
  const id = deviceId();
  await putDoc(devicePath(), {
    data: str(encrypt(secret.dataKey, { name: data.deviceName || os.hostname(), tabs }, `${data.uid}:device:${id}`)),
    at: int(Date.now()), v: int(1)
  });
  lastTabsHash = hash;
  data.tabsAt = Date.now();
  if (data.sync.tabs) data.sync.tabs.dirty = false;
}
const remoteTabs = safe(async () => {
  if (!load() || !secret?.dataKey) return { devices: [] };
  const res = await request(`${STORE}/users/${data.uid}/devices?pageSize=50`, { token: await token() });
  const own = deviceId();
  const devices = [];
  for (const doc of res.documents || []) {
    const id = doc.name.split('/').pop();
    if (id === own) continue;
    const at = Number(doc.fields?.at?.integerValue) || 0;
    if (Date.now() - at > 30 * 86400_000) continue; // seit 30 Tagen nicht gesehen
    try {
      const d = decrypt(secret.dataKey, doc.fields.data.stringValue, `${data.uid}:device:${id}`);
      devices.push({ id, name: d.name || '?', at, tabs: Array.isArray(d.tabs) ? d.tabs : [] });
    } catch { /* anderer Schlüssel (alter PC) – überspringen */ }
  }
  devices.sort((a, b) => b.at - a.at);
  return { devices };
});

// ---------------------------------------------------------------------------
// Fehlermeldungen (für alle, auch ohne Konto) und Übersicht für den Admin
// ---------------------------------------------------------------------------
const toFields = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) =>
  [k, typeof v === 'number' ? int(v) : k === 'created' ? { timestampValue: v } : str(v)]));
const fromFields = (f = {}) => Object.fromEntries(Object.entries(f).map(([k, v]) =>
  [k, v.stringValue ?? (v.integerValue != null ? Number(v.integerValue) : v.timestampValue ?? v.booleanValue ?? null)]));

const submitReport = safe(async (r) => {
  const signedIn = !!load();
  const body = {
    text: String(r.text || '').trim().slice(0, 5000),
    category: String(r.category || 'bug').slice(0, 40),
    version: app.getVersion(),
    os: `${os.type()} ${os.release()} (${process.arch})`,
    url: r.url ? String(r.url).slice(0, 1000) : undefined,
    screenshot: r.screenshot && r.screenshot.length <= 900000 ? r.screenshot : undefined,
    email: r.email ? String(r.email).trim().slice(0, 200) : undefined,
    uid: signedIn ? data.uid : undefined,
    created: new Date().toISOString(),
    status: 'new'
  };
  if (!body.text) throw new AccountError('EMPTY');
  const opts = { method: 'POST', body: { fields: toFields(body) } };
  if (signedIn) opts.token = await token();
  const res = await request(`${STORE}/reports?key=${config.apiKey}`, opts);
  // Öffentliche Kopie mit derselben ID – nur Beschreibung, Art, Version, Datum und Status
  const id = String(res.name || '').split('/').pop();
  if (id) {
    const pub = { text: body.text, category: body.category, version: body.version, created: body.created, status: 'new' };
    const o = { method: 'PATCH', body: { fields: toFields(pub) } };
    if (signedIn) o.token = await token();
    await request(`${STORE}/reportsPublic/${id}?currentDocument.exists=false&key=${config.apiKey}`, o).catch(() => {});
  }
  return {};
});

// Öffentliche Liste – für alle lesbar, auch ohne Anmeldung
const listPublicReports = safe(async () => {
  const opts = load() ? { token: await token() } : {};
  const res = await request(`${STORE}/reportsPublic?pageSize=200&key=${config.apiKey}`, opts);
  const reports = (res.documents || []).map((d) => ({ id: d.name.split('/').pop(), ...fromFields(d.fields) }))
    .sort((a, b) => String(b.created).localeCompare(String(a.created)));
  return { reports };
});

// Nur der Admin (siehe Firestore-Regeln) darf Meldungen lesen
const listReports = safe(async () => {
  const res = await request(`${STORE}/reports?pageSize=200`, { token: await token() });
  const reports = (res.documents || []).map((d) => ({ id: d.name.split('/').pop(), ...fromFields(d.fields) }))
    .sort((a, b) => String(b.created).localeCompare(String(a.created)));
  if (data && !data.admin) { data.admin = true; persist(); changed(); }
  return { reports };
});
async function checkAdmin() {
  if (!load()) return false;
  try {
    await request(`${STORE}/reports?pageSize=1`, { token: await token() });
    data.admin = true;
  } catch (e) {
    if (e.status === 403 || e.code === 'PERMISSION_DENIED') data.admin = false;
  }
  persist(); changed();
  return !!data?.admin;
}
const updateReport = safe(async ({ id, status }) => {
  if (!/^[\w-]{10,40}$/.test(String(id)) || !['new', 'progress', 'done'].includes(status)) throw new AccountError('INVALID');
  await request(`${STORE}/reports/${id}?updateMask.fieldPaths=status`, { method: 'PATCH', token: await token(), body: { fields: { status: str(status) } } });
  await request(`${STORE}/reportsPublic/${id}?updateMask.fieldPaths=status&currentDocument.exists=true`, { method: 'PATCH', token: await token(), body: { fields: { status: str(status) } } }).catch(() => {});
  return {};
});
const deleteReport = safe(async ({ id }) => {
  if (!/^[\w-]{10,40}$/.test(String(id))) throw new AccountError('INVALID');
  await deleteDoc(`reports/${id}`);
  await deleteDoc(`reportsPublic/${id}`).catch(() => {});
  return {};
});

// ---------------------------------------------------------------------------
// FalCoins: 1 Coin pro Website-Besuch, solange man angemeldet ist
// ---------------------------------------------------------------------------
const coinsPath = () => `users/${data.uid}/meta/coins`;
let coinTimer = null;
let coinNotify = null;
function addCoin(n = 1) {
  if (!load()) return;
  data.coins = data.coins || { balance: 0, pending: 0 };
  data.coins.pending += n;
  // Zustand höchstens einmal pro Sekunde melden
  if (!coinNotify) coinNotify = setTimeout(() => { coinNotify = null; persist(); changed(); }, 1000);
  if (!coinTimer) coinTimer = setTimeout(() => { coinTimer = null; flushCoins(); }, 30_000);
}
async function flushCoins() {
  if (!load() || !data.coins?.pending) return;
  const n = data.coins.pending;
  try {
    const res = await request(`${STORE.replace(/\/documents$/, '')}/documents:commit`, {
      method: 'POST', token: await token(),
      body: { writes: [{ transform: {
        document: `projects/${config.projectId}/databases/(default)/documents/${coinsPath()}`,
        fieldTransforms: [{ fieldPath: 'balance', increment: { integerValue: String(n) } }]
      } }] }
    });
    const balance = Number(res.writeResults?.[0]?.transformResults?.[0]?.integerValue);
    data.coins.pending -= n;
    if (Number.isFinite(balance)) data.coins.balance = balance;
    persist(); changed();
  } catch { /* später erneut */ }
}
async function loadCoins() {
  if (!load()) return;
  try {
    const doc = await getDoc(coinsPath());
    data.coins = { balance: Number(doc?.fields?.balance?.integerValue) || 0, pending: data.coins?.pending || 0 };
    data.betaUntil = Number(doc?.fields?.betaUntil?.integerValue) || 0;
    persist(); changed();
  } catch { /* offline */ }
}

// ---------------------------------------------------------------------------
// FalCoin-Shop
// ---------------------------------------------------------------------------
const SHOP = { beta14: { price: 1000, days: 14 } };
// Kontostand vom Server holen (z. B. FalCoins von anderen PCs)
const refreshCoins = safe(async () => { await flushCoins(); await loadCoins(); return {}; });
const docName = (p) => `projects/${config.projectId}/databases/(default)/documents/${p}`;
const purchase = safe(async ({ item }) => {
  const it = SHOP[item];
  if (!it) throw new AccountError('INVALID');
  if (!load()) throw new AccountError('SIGNED_OUT');
  // Erst offene FalCoins gutschreiben, damit der Kontostand stimmt
  await flushCoins();
  if (data.coins?.pending) throw new AccountError('NETWORK');
  for (let attempt = 0; attempt < 3; attempt++) {
    const doc = await getDoc(coinsPath());
    const balance = Number(doc?.fields?.balance?.integerValue) || 0;
    if (balance < it.price) throw new AccountError('NOT_ENOUGH');
    const until = Math.max(Date.now(), Number(doc?.fields?.betaUntil?.integerValue) || 0) + it.days * 86400_000;
    // Abbuchen und Freischalten in einem Schritt – nur wenn sich der Kontostand inzwischen nicht geändert hat
    const writes = [
      {
        update: { name: docName(coinsPath()), fields: { balance: int(balance - it.price), betaUntil: int(until) } },
        updateMask: { fieldPaths: ['balance', 'betaUntil'] },
        currentDocument: { updateTime: doc.updateTime }
      },
      {
        update: { name: docName(`users/${data.uid}/purchases/${crypto.randomUUID()}`), fields: { item: str(item), price: int(it.price), at: int(Date.now()), until: int(until) } },
        currentDocument: { exists: false }
      }
    ];
    try {
      await request(`${STORE.replace(/\/documents$/, '')}/documents:commit`, { method: 'POST', token: await token(), body: { writes } });
      data.coins.balance = balance - it.price;
      data.betaUntil = until;
      persist(); changed();
      return { until };
    } catch (e) {
      if (!/FAILED_PRECONDITION|ABORTED/.test(e.code) || attempt === 2) throw e;
    }
  }
  throw new AccountError('UNKNOWN');
});

function setKinds(kinds) {
  if (!load()) return publicState();
  if (typeof kinds?.tabs === 'boolean') { data.kinds.tabs = kinds.tabs; lastTabsHash = null; }
  for (const k of KINDS) if (typeof kinds?.[k] === 'boolean') {
    if (kinds[k] && !data.kinds[k]) data.sync[k] = { rev: null, dirty: true }; // wieder eingeschaltet: zusammenführen
    data.kinds[k] = kinds[k];
  }
  persist(); changed(); scheduleSync(1000);
  return publicState();
}

function init(opts) {
  notify = opts.notify || notify;
  providers = opts.providers || {};
  locale = opts.locale || locale;
  if (load() && secret.dataKey) { scheduleSync(4000); startPeriodic(); }
  if (load()) setTimeout(() => { loadCoins().then(flushCoins).then(checkAdmin).catch(() => {}); }, 5000);
  app.on('before-quit', () => { flushCoins(); });
}
function syncIfStale() {
  if (load() && secret?.dataKey && Date.now() - (data.lastSync || 0) > 5 * 60_000) scheduleSync(1000);
}

module.exports = {
  KINDS, init, state: publicState, signUp, signIn, signOut, resetPassword, resendVerification, refreshProfile,
  updateProfile, unlockKey, resetSyncData, changePassword, deleteAccount, syncNow, setKinds, markDirty, syncIfStale, remoteTabs,
  submitReport, listReports, listPublicReports, updateReport, deleteReport, addCoin, flushCoins, purchase, refreshCoins,
  _test: { encrypt, decrypt, MERGE }
};
