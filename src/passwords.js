// Falcon Passwort-Manager: verschlüsselter Speicher (Windows DPAPI / macOS Keychain / Linux Secret Service)
const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const FILE = () => path.join(app.getPath('userData'), 'passwords.dat');
let entries = null;

function canEncrypt() {
  try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
}

function load() {
  if (entries) return entries;
  entries = [];
  try {
    const raw = fs.readFileSync(FILE());
    const json = raw.subarray(0, 4).toString() === 'PLN:'
      ? raw.subarray(4).toString('utf8')
      : safeStorage.decryptString(raw);
    entries = JSON.parse(json);
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Passwörter konnten nicht geladen werden:', e.message);
  }
  return entries;
}

function persist() {
  const json = JSON.stringify(entries);
  const data = canEncrypt() ? safeStorage.encryptString(json) : Buffer.concat([Buffer.from('PLN:'), Buffer.from(json, 'utf8')]);
  fs.writeFileSync(FILE(), data);
}

function originOf(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.origin;
  } catch { return null; }
}
const bareHost = (origin) => { try { return new URL(origin).hostname.replace(/^www\./, ''); } catch { return ''; } };

// Passend: gleiche Domain (www. egal). http-Einträge werden nie auf https-fremden Seiten genutzt und umgekehrt.
function forUrl(url) {
  const origin = originOf(url);
  if (!origin) return [];
  const proto = new URL(origin).protocol;
  const host = bareHost(origin);
  return load()
    .filter((e) => bareHost(e.origin) === host && new URL(e.origin).protocol === proto)
    .sort((a, b) => (b.lastUsed || b.created || 0) - (a.lastUsed || a.created || 0));
}

function list() {
  return load().map(({ password, ...rest }) => ({ ...rest, hasPassword: !!password }));
}
function reveal(id) {
  return load().find((e) => e.id === id)?.password ?? null;
}

function upsert({ origin, username, password }) {
  if (!origin || !password) return false;
  load();
  const existing = entries.find((e) => e.origin === origin && e.username === username);
  if (existing) { existing.password = password; existing.updated = Date.now(); }
  else entries.push({ id: crypto.randomUUID(), origin, username: username || '', password, created: Date.now() });
  persist();
  return true;
}
function exists({ origin, username, password }) {
  return load().some((e) => e.origin === origin && e.username === username && e.password === password);
}
function touch(id) {
  const e = load().find((x) => x.id === id);
  if (e) { e.lastUsed = Date.now(); persist(); }
}
function remove(id) {
  load();
  entries = entries.filter((e) => e.id !== id);
  persist();
}
function update(id, patch) {
  const e = load().find((x) => x.id === id);
  if (!e) return false;
  if (typeof patch.username === 'string') e.username = patch.username;
  if (typeof patch.password === 'string' && patch.password) e.password = patch.password;
  e.updated = Date.now();
  persist();
  return true;
}

// ---------- CSV (Chrome / Edge / Opera / Brave / Firefox / Bitwarden-kompatibel) ----------
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delim = !firstLine.includes(',') && firstLine.includes(';') ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

function importCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { added: 0, updated: 0, skipped: 0 };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const iUrl = col('url', 'origin', 'login_uri', 'website', 'web site', 'origin_url');
  const iUser = col('username', 'login', 'login_username', 'user', 'email', 'username_value');
  const iPass = col('password', 'login_password', 'password_value');
  if (iUrl < 0 || iPass < 0) throw new Error('Unbekanntes CSV-Format: Spalten „url“ und „password“ wurden nicht gefunden.');
  load();
  let added = 0, updated = 0, skipped = 0;
  for (const r of rows.slice(1)) {
    let url = (r[iUrl] || '').trim();
    if (url && !/^[a-z]+:\/\//i.test(url)) url = 'https://' + url;
    const origin = originOf(url);
    const password = r[iPass] || '';
    const username = iUser >= 0 ? (r[iUser] || '') : '';
    if (!origin || !password) { skipped++; continue; }
    const e = entries.find((x) => x.origin === origin && x.username === username);
    if (e) { if (e.password !== password) { e.password = password; e.updated = Date.now(); updated++; } else skipped++; }
    else { entries.push({ id: crypto.randomUUID(), origin, username, password, created: Date.now() }); added++; }
  }
  persist();
  return { added, updated, skipped };
}

function exportCsv() {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = ['name,url,username,password,note'];
  for (const e of load()) lines.push([bareHost(e.origin), e.origin + '/', e.username, e.password, ''].map(cell).join(','));
  return lines.join('\r\n') + '\r\n';
}

module.exports = { originOf, forUrl, list, reveal, upsert, exists, touch, remove, update, importCsv, exportCsv, canEncrypt, count: () => load().length };
