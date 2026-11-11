'use strict';
/* Falcon Web-App: Lesezeichen und Tabs der PCs auf dem Handy.
   Anmeldung über Firebase Authentication, Daten aus Firestore – entschlüsselt erst hier im Browser
   (gleiches Verfahren wie in Falcon: PBKDF2-SHA256 + AES-256-GCM, gzip). */

const CONFIG = { apiKey: 'AIzaSyCIvT5YqYTYUJuFp89qDxbF1IImYjyes7U', projectId: 'falcon-browser-d4976' };
const AUTH = 'https://identitytoolkit.googleapis.com/v1';
const STORE = `https://firestore.googleapis.com/v1/projects/${CONFIG.projectId}/databases/(default)/documents`;

const $ = (s) => document.querySelector(s);
const enc = new TextEncoder();
let session = null; // { uid, idToken, key: CryptoKey }
let bookmarks = [];
let devices = [];
let view = 'bookmarks';

// ---- Sprache (Deutsch / Englisch) ----
const EN = !/^de/i.test(navigator.language || '');
const T = EN ? {
  'Abmelden': 'Sign out', 'Anmelden': 'Sign in', 'Lesezeichen': 'Bookmarks', 'Tabs von PCs': 'Tabs from PCs', 'Suchen': 'Search',
  'E-Mail-Adresse': 'Email address', 'Passwort': 'Password', 'Keine Lesezeichen': 'No bookmarks', 'Keine Treffer': 'No results',
  'Noch keine anderen PCs': 'No PCs yet', 'Keine offenen Tabs': 'No open tabs', 'E-Mail-Adresse oder Passwort ist falsch.': 'Email address or password is incorrect.',
  'Keine Verbindung. Bist du online?': 'No connection. Are you online?', 'Deine Sync-Daten konnten nicht entschlüsselt werden. Melde dich einmal in Falcon an.': 'Your sync data couldn’t be decrypted. Sign in to Falcon once.',
  'Das hat nicht geklappt': 'That didn’t work',
  'Melde dich mit deinem Falcon-Konto an, um deine Lesezeichen und die offenen Tabs deiner PCs zu sehen.': 'Sign in with your Falcon account to see your bookmarks and the open tabs of your PCs.',
  'Deine Daten werden erst hier auf dem Handy mit deinem Passwort entschlüsselt. Das Passwort wird nicht gespeichert.': 'Your data is only decrypted here on your phone with your password. The password isn’t stored.'
} : {};
const t = (s) => T[s] || s;
if (EN) {
  document.documentElement.lang = 'en';
  for (const el of document.querySelectorAll('p, label, button, h1')) {
    for (const node of el.childNodes) if (node.nodeType === 3 && node.textContent.trim()) node.textContent = node.textContent.replace(node.textContent.trim(), t(node.textContent.trim()));
  }
  $('#q').placeholder = t('Suchen');
}

// ---- Netzwerk ----
async function api(url, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(url, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error('NETWORK'); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const m = String(json.error?.message || '');
    if (res.status === 404) return null;
    throw new Error((m.match(/^[A-Z_]{2,}/) || [])[0] || json.error?.status || `HTTP_${res.status}`);
  }
  return json;
}

// ---- Kryptografie ----
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
// Falcon speichert iv(12) | tag(16) | ciphertext – WebCrypto erwartet ciphertext | tag
function split(buf) { const iv = buf.slice(0, 12), tag = buf.slice(12, 28), ct = buf.slice(28); const out = new Uint8Array(ct.length + 16); out.set(ct); out.set(tag, ct.length); return { iv, data: out }; }
async function unwrapKey(fields, password, uid) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const kek = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(fields.salt.stringValue), iterations: Number(fields.iter.integerValue), hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const { iv, data } = split(b64(fields.wrapped.stringValue));
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`falcon-key:${uid}`) }, kek, data);
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
}
async function decrypt(b64text, aad) {
  const { iv, data } = split(b64(b64text));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, session.key, data);
  const stream = new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

// ---- Anmeldung ----
$('#login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#submit');
  btn.disabled = true;
  $('#error').textContent = '';
  try {
    const email = $('#email').value.trim();
    const r = await api(`${AUTH}/accounts:signInWithPassword?key=${CONFIG.apiKey}`, { method: 'POST', body: { email, password: $('#password').value, returnSecureToken: true } });
    const keyDoc = await api(`${STORE}/users/${r.localId}/meta/key`, { token: r.idToken });
    if (!keyDoc) throw new Error('NO_KEY');
    let key;
    try { key = await unwrapKey(keyDoc.fields, $('#password').value, r.localId); } catch { throw new Error('NO_KEY'); }
    session = { uid: r.localId, idToken: r.idToken, key };
    try { localStorage.setItem('falcon.email', email); } catch { /* egal */ }
    $('#password').value = '';
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#logout').classList.remove('hidden');
    await load();
  } catch (err) {
    const code = err.message;
    $('#error').textContent = /INVALID_LOGIN|INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_EMAIL|MISSING_PASSWORD/.test(code) ? t('E-Mail-Adresse oder Passwort ist falsch.')
      : code === 'NETWORK' ? t('Keine Verbindung. Bist du online?')
      : code === 'NO_KEY' ? t('Deine Sync-Daten konnten nicht entschlüsselt werden. Melde dich einmal in Falcon an.')
      : `${t('Das hat nicht geklappt')} (${code})`;
  } finally { btn.disabled = false; }
});
try { $('#email').value = localStorage.getItem('falcon.email') || ''; } catch { /* egal */ }
$('#logout').addEventListener('click', () => { session = null; bookmarks = []; devices = []; location.reload(); });

// ---- Daten ----
async function load() {
  $('#content').innerHTML = '<div class="spinner"></div>';
  const [bm, dev] = await Promise.all([
    api(`${STORE}/users/${session.uid}/sync/bookmarks`, { token: session.idToken }).catch(() => null),
    api(`${STORE}/users/${session.uid}/devices?pageSize=50`, { token: session.idToken }).catch(() => null)
  ]);
  bookmarks = bm ? await decrypt(bm.fields.data.stringValue, `${session.uid}:bookmarks`).catch(() => []) : [];
  devices = [];
  for (const d of dev?.documents || []) {
    const id = d.name.split('/').pop();
    try {
      const x = await decrypt(d.fields.data.stringValue, `${session.uid}:device:${id}`);
      devices.push({ name: x.name, tabs: x.tabs || [], at: Number(d.fields.at?.integerValue) || 0 });
    } catch { /* anderer Schlüssel */ }
  }
  devices.sort((a, b) => b.at - a.at);
  render();
}

// ---- Darstellung ----
const ICON = {
  folder: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5V17a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17z"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  pc: '<rect x="3" y="5" width="18" height="11" rx="1.5"/><path d="M8 20h8M12 16v4"/>'
};
const svg = (n, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}">${ICON[n]}</svg>`;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'html') e.innerHTML = v; else if (v != null) e.setAttribute(k, v); }
  for (const c of kids.flat()) if (c != null) e.append(c);
  return e;
}
function link(item) {
  const fav = el('img', { src: `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host(item.url))}`, alt: '', loading: 'lazy' });
  fav.onerror = () => fav.remove();
  return el('a', { class: 'row', href: item.url, target: '_blank', rel: 'noopener' }, fav, el('span', { class: 't' }, el('b', {}, item.title || host(item.url)), el('small', {}, host(item.url))));
}
function tree(list) {
  return list.map((n) => (n.folder
    ? el('details', { class: 'folder' }, el('summary', { html: `${svg('folder', 'fi')}<span></span>${svg('chev', 'chev')}` }), el('div', { class: 'kids' }, tree(n.children || [])))
    : link(n)));
}
function flat(list, out = []) { for (const n of list) { if (n.folder) flat(n.children || [], out); else out.push(n); } return out; }

function render() {
  const q = $('#q').value.trim().toLowerCase();
  const c = $('#content');
  if (view === 'bookmarks') {
    if (q) {
      const hits = flat(bookmarks).filter((b) => (b.title || '').toLowerCase().includes(q) || b.url.toLowerCase().includes(q));
      c.replaceChildren(hits.length ? el('div', { class: 'card' }, hits.map(link)) : el('div', { class: 'empty' }, t('Keine Treffer')));
    } else {
      c.replaceChildren(bookmarks.length ? el('div', { class: 'card' }, tree(bookmarks)) : el('div', { class: 'empty' }, t('Keine Lesezeichen')));
      // Ordnernamen nachträglich setzen (textContent, kein HTML)
      const folders = [];
      (function walk(list) { for (const n of list) if (n.folder) { folders.push(n); walk(n.children || []); } })(bookmarks);
      c.querySelectorAll('.folder > summary > span').forEach((s, i) => { s.textContent = folders[i]?.title || ''; });
    }
  } else {
    if (!devices.length) { c.replaceChildren(el('div', { class: 'empty' }, t('Noch keine anderen PCs'))); return; }
    c.replaceChildren(...devices.map((d) => {
      const tabs = d.tabs.filter((x) => !q || (x.title || '').toLowerCase().includes(q) || x.url.toLowerCase().includes(q));
      const when = d.at ? new Date(d.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
      const head = el('h2', { html: svg('pc') }, document.createTextNode(d.name), el('span', {}, when));
      return el('section', { class: 'device' }, head, tabs.length ? el('div', { class: 'card' }, tabs.map(link)) : el('div', { class: 'empty' }, t(q ? 'Keine Treffer' : 'Keine offenen Tabs')));
    }));
  }
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  view = b.dataset.view;
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('sel', x === b));
  render();
}));
$('#q').addEventListener('input', render);
