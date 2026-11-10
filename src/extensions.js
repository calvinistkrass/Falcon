'use strict';
// Chrome-Erweiterungen: Installation aus dem Chrome Web Store (CRX) oder aus einem entpackten Ordner.
// Electron unterstützt nur einen Teil der Erweiterungs-APIs – viele Erweiterungen laufen, manche nicht.

const { app, session, BrowserWindow, net } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = () => path.join(app.getPath('userData'), 'extensions');
const REGISTRY = () => path.join(app.getPath('userData'), 'extensions.json');
let registry = null; // [{ key, dir, enabled, source, storeId }]
const loaded = new Map(); // key → Electron-Extension

const ses = () => session.defaultSession;

function loadRegistry() {
  if (registry) return registry;
  try { registry = JSON.parse(fs.readFileSync(REGISTRY(), 'utf8')); } catch { registry = []; }
  if (!Array.isArray(registry)) registry = [];
  return registry;
}
const saveRegistry = () => fs.writeFileSync(REGISTRY(), JSON.stringify(registry, null, 2));

// ---------------------------------------------------------------------------
// CRX / ZIP
// ---------------------------------------------------------------------------
function crxToZip(buf) {
  if (buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50) return buf; // schon ein ZIP
  if (buf.toString('latin1', 0, 4) !== 'Cr24') throw new Error('NOT_CRX');
  const version = buf.readUInt32LE(4);
  if (version === 3) return buf.subarray(12 + buf.readUInt32LE(8));
  if (version === 2) return buf.subarray(16 + buf.readUInt32LE(8) + buf.readUInt32LE(12));
  throw new Error('NOT_CRX');
}

function unzip(buf, dest) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('BAD_ZIP');
  const root = path.resolve(dest);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('BAD_ZIP');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen).replace(/\\/g, '/');
    p += 46 + nameLen + extraLen + commentLen;
    const target = path.resolve(root, name);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('BAD_ZIP'); // kein „../“
    if (name.endsWith('/')) { fs.mkdirSync(target, { recursive: true }); continue; }
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    const data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : null;
    if (!data) throw new Error('BAD_ZIP');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------
function readManifest(dir) {
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8').replace(/^﻿/, ''));
  // __MSG_name__ auflösen
  const locale = (app.getLocale() || 'en').replace('-', '_');
  const msgs = {};
  for (const l of [m.default_locale, locale.split('_')[0], locale].filter(Boolean)) {
    try { Object.assign(msgs, JSON.parse(fs.readFileSync(path.join(dir, '_locales', l, 'messages.json'), 'utf8').replace(/^﻿/, ''))); } catch { /* fehlt */ }
  }
  const t = (s) => (typeof s === 'string' ? s.replace(/__MSG_(\w+)__/g, (_, k) => {
    const hit = Object.entries(msgs).find(([key]) => key.toLowerCase() === k.toLowerCase());
    return hit ? hit[1].message : '';
  }) : '');
  return { raw: m, name: t(m.name) || 'Extension', description: t(m.description), version: m.version || '' };
}
function iconData(dir, raw) {
  const icons = raw.icons || raw.action?.default_icon || raw.browser_action?.default_icon || {};
  const file = typeof icons === 'string' ? icons : icons['48'] || icons['32'] || icons['128'] || icons['16'] || Object.values(icons)[0];
  if (!file) return '';
  try {
    const p = path.resolve(dir, String(file).replace(/^\//, ''));
    if (!p.startsWith(path.resolve(dir))) return '';
    const ext = path.extname(p).slice(1).toLowerCase();
    return `data:image/${ext === 'svg' ? 'svg+xml' : ext || 'png'};base64,${fs.readFileSync(p).toString('base64')}`;
  } catch { return ''; }
}

function describe(entry) {
  try {
    const m = readManifest(entry.dir);
    const ext = loaded.get(entry.key);
    const popup = m.raw.action?.default_popup || m.raw.browser_action?.default_popup || '';
    const options = m.raw.options_ui?.page || m.raw.options_page || '';
    return {
      key: entry.key, id: ext?.id || null, enabled: entry.enabled !== false, loaded: !!ext, error: entry.error || null,
      source: entry.source, storeId: entry.storeId || null,
      name: m.name, description: m.description, version: m.version, mv: m.raw.manifest_version || 2,
      icon: iconData(entry.dir, m.raw), hasPopup: !!popup, hasOptions: !!options
    };
  } catch {
    return { key: entry.key, enabled: false, loaded: false, error: 'MISSING', name: entry.key, source: entry.source };
  }
}

async function load(entry) {
  try {
    const ext = await ses().loadExtension(entry.dir, { allowFileAccess: false });
    loaded.set(entry.key, ext);
    entry.error = null;
    return ext;
  } catch (e) {
    entry.error = String(e.message || e).slice(0, 200);
    return null;
  }
}
async function unload(entry) {
  const ext = loaded.get(entry.key);
  if (ext) { try { ses().removeExtension(ext.id); } catch { /* schon weg */ } }
  loaded.delete(entry.key);
}

async function loadAll() {
  for (const entry of loadRegistry()) if (entry.enabled !== false) await load(entry);
  saveRegistry();
}

// ---------------------------------------------------------------------------
// Installation
// ---------------------------------------------------------------------------
function storeIdFrom(input) {
  const m = String(input || '').trim().match(/(?:^|[/=])([a-p]{32})(?:$|[/?#&])/) || String(input || '').trim().match(/^([a-p]{32})$/);
  return m ? m[1] : null;
}

async function installFromStore(input) {
  const storeId = storeIdFrom(input);
  if (!storeId) return { ok: false, error: 'INVALID_ID' };
  const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${encodeURIComponent(process.versions.chrome)}` +
    `&acceptformat=crx2,crx3&x=${encodeURIComponent(`id=${storeId}&installsource=ondemand&uc`)}`;
  let buf;
  try {
    const res = await net.fetch(url);
    if (!res.ok) return { ok: false, error: res.status === 204 || res.status === 404 ? 'NOT_FOUND' : 'DOWNLOAD_FAILED' };
    buf = Buffer.from(await res.arrayBuffer());
  } catch { return { ok: false, error: 'DOWNLOAD_FAILED' }; }
  if (!buf.length) return { ok: false, error: 'NOT_FOUND' };
  return installBuffer(buf, { source: 'store', storeId, key: storeId });
}

async function installBuffer(buf, { source, storeId, key }) {
  const dir = path.join(ROOT(), key);
  const tmp = `${dir}.tmp-${Date.now()}`;
  try {
    unzip(crxToZip(buf), tmp);
    readManifest(tmp); // gültiges Manifest?
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    return { ok: false, error: e.message === 'NOT_CRX' || e.message === 'BAD_ZIP' ? 'BAD_PACKAGE' : 'BAD_MANIFEST' };
  }
  return finish(tmp, dir, { source, storeId, key });
}

async function installFolder(folder) {
  try { readManifest(folder); } catch { return { ok: false, error: 'BAD_MANIFEST' }; }
  const key = 'local-' + crypto.createHash('sha1').update(path.resolve(folder).toLowerCase()).digest('hex').slice(0, 16);
  const dir = path.join(ROOT(), key);
  const tmp = `${dir}.tmp-${Date.now()}`;
  fs.cpSync(folder, tmp, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules)([\\/]|$)/.test(src) });
  return finish(tmp, dir, { source: 'folder', key, folder: path.resolve(folder) });
}

async function finish(tmp, dir, info) {
  loadRegistry();
  const old = registry.find((e) => e.key === info.key);
  if (old) await unload(old);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(tmp, dir);
  const entry = old || { key: info.key };
  Object.assign(entry, { dir, enabled: true, source: info.source, storeId: info.storeId || null, folder: info.folder || null, installed: Date.now() });
  if (!old) registry.push(entry);
  const ext = await load(entry);
  saveRegistry();
  if (!ext) return { ok: false, error: 'LOAD_FAILED', detail: entry.error, extension: describe(entry) };
  return { ok: true, extension: describe(entry) };
}

async function remove(key) {
  loadRegistry();
  const entry = registry.find((e) => e.key === key);
  if (!entry) return false;
  await unload(entry);
  registry = registry.filter((e) => e !== entry);
  saveRegistry();
  fs.rmSync(entry.dir, { recursive: true, force: true });
  return true;
}
async function setEnabled(key, on) {
  const entry = loadRegistry().find((e) => e.key === key);
  if (!entry) return null;
  entry.enabled = !!on;
  if (on) await load(entry); else await unload(entry);
  saveRegistry();
  return describe(entry);
}
const list = () => loadRegistry().map(describe);

// ---------------------------------------------------------------------------
// Fenster der Erweiterung (Popup unter dem Knopf) und Optionen
// ---------------------------------------------------------------------------
let popupWin = null;
function openPopup(key, parent, anchor) {
  const entry = loadRegistry().find((e) => e.key === key);
  const ext = entry && loaded.get(key);
  if (!ext) return false;
  const m = readManifest(entry.dir).raw;
  const page = m.action?.default_popup || m.browser_action?.default_popup;
  if (!page) return false;
  if (popupWin && !popupWin.isDestroyed()) popupWin.close();
  const b = parent.getContentBounds();
  const w = new BrowserWindow({
    parent, show: false, frame: false, resizable: false, skipTaskbar: true, minimizable: false, maximizable: false,
    width: 360, height: 420, backgroundColor: '#ffffff', roundedCorners: true,
    webPreferences: { session: ses(), sandbox: true, contextIsolation: true }
  });
  popupWin = w;
  const place = (width, height) => {
    const x = Math.round(b.x + Math.min(anchor.right, b.width) - width);
    const y = Math.round(b.y + anchor.bottom + 6);
    w.setBounds({ x: Math.max(b.x + 4, x), y, width, height });
  };
  place(360, 420);
  w.loadURL(`chrome-extension://${ext.id}/${String(page).replace(/^\//, '')}`);
  w.webContents.once('did-finish-load', async () => {
    try {
      // Größe am Inhalt ausrichten (wie in Chrome)
      const [cw, ch] = await w.webContents.executeJavaScript(`(() => {
        const b = document.body, cs = getComputedStyle(b), r = b.getBoundingClientRect();
        const mx = parseFloat(cs.marginLeft) + parseFloat(cs.marginRight), my = parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
        return [Math.ceil(Math.max(r.width, b.scrollWidth) + mx), Math.ceil(Math.max(r.height, b.scrollHeight) + my)];
      })()`);
      place(Math.min(800, Math.max(160, cw)), Math.min(600, Math.max(60, ch)));
    } catch { /* Standardgröße */ }
    if (!w.isDestroyed()) w.show();
  });
  w.on('blur', () => { if (!w.isDestroyed() && !w.webContents.isDevToolsOpened()) w.close(); });
  return true;
}
function optionsUrl(key) {
  const entry = loadRegistry().find((e) => e.key === key);
  const ext = entry && loaded.get(key);
  if (!ext) return null;
  const m = readManifest(entry.dir).raw;
  const page = m.options_ui?.page || m.options_page;
  return page ? `chrome-extension://${ext.id}/${String(page).replace(/^\//, '')}` : null;
}

module.exports = { loadAll, list, installFromStore, installFolder, remove, setEnabled, openPopup, optionsUrl, storeIdFrom, _test: { crxToZip, unzip } };
