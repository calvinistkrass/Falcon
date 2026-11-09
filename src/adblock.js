'use strict';
/*
 * Werbe- und Trackerblocker.
 *
 * Nutzt die Ghostery-Engine mit EasyList, EasyPrivacy, uBlock-Origin-Listen u. a. Die Listen werden
 * beim ersten Start geladen, lokal zwischengespeichert und wöchentlich erneuert. Ohne Internet und
 * ohne Cache greift eine kleine eingebaute Domainliste.
 *
 * Electron erlaubt pro Sitzung nur einen Listener je webRequest-Ereignis. Deshalb hängt Falcon die
 * Engine selbst ein (statt enableBlockingInSession), zählt dabei pro Tab mit und berücksichtigt
 * Ausnahmen pro Website.
 */

const { app, ipcMain, net, webContents } = require('electron');
const path = require('path');
const fs = require('fs');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
// Das Paket erlaubt keinen Tiefen-Import, also den Pfad des Preload-Pakets direkt auflösen
// Im gepackten Programm liegt das Preload-Paket verschachtelt unter der Engine – deshalb von dort aus suchen
const PRELOAD_PATH = require.resolve('@ghostery/adblocker-electron-preload', { paths: [path.dirname(require.resolve('@ghostery/adblocker-electron'))] });

const LIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const FALLBACK_HOSTS = new Set([
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'google-analytics.com',
  'googletagservices.com', 'adservice.google.com', 'adnxs.com', 'adsrvr.org', 'amazon-adsystem.com',
  'taboola.com', 'outbrain.com', 'criteo.com', 'criteo.net', 'rubiconproject.com', 'pubmatic.com',
  'openx.net', 'casalemedia.com', 'moatads.com', 'scorecardresearch.com', 'quantserve.com', 'adform.net',
  'smartadserver.com', 'media.net', 'popads.net', 'propellerads.com', 'exoclick.com', 'hotjar.com',
  'facebook.net', 'ads-twitter.com', 'bat.bing.com', 'teads.tv', 'adroll.com', 'mgid.com', 'adsterra.com'
]);

let engine = null;
let ready = null;
let options = { enabled: true, annoyances: false, allow: [] };
let onStats = () => {};
let totalBlocked = 0;
let info = { source: 'fallback', updated: null, rules: 0 };
const tabStats = new Map(); // webContentsId -> { blocked, hosts: Map<host, count> }
const topUrls = new Map();  // webContentsId -> URL der Seite

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

function fallbackMatch(url) {
  let host;
  try { host = new URL(url).hostname; } catch { return false; }
  while (host && host.includes('.')) {
    if (FALLBACK_HOSTS.has(host)) return true;
    host = host.slice(host.indexOf('.') + 1);
  }
  return false;
}

function cacheFile() {
  return path.join(app.getPath('userData'), options.annoyances ? 'adblock-full.bin' : 'adblock-ads.bin');
}

async function loadEngine({ forceUpdate = false } = {}) {
  const file = cacheFile();
  try {
    const age = Date.now() - fs.statSync(file).mtimeMs;
    if (forceUpdate || age > LIST_MAX_AGE_MS) fs.rmSync(file, { force: true });
  } catch { /* noch kein Cache */ }

  const fetchFn = (url, init) => net.fetch(url, init);
  const caching = { path: file, read: fs.promises.readFile, write: fs.promises.writeFile };
  try {
    engine = options.annoyances
      ? await ElectronBlocker.fromPrebuiltFull(fetchFn, caching)
      : await ElectronBlocker.fromPrebuiltAdsAndTracking(fetchFn, caching);
    let rules = 0;
    try { const f = engine.getFilters(); rules = f.networkFilters.length + f.cosmeticFilters.length; } catch { /* nur Info */ }
    info = { source: 'lists', updated: fs.existsSync(file) ? fs.statSync(file).mtimeMs : Date.now(), rules };
  } catch (err) {
    console.warn('Filterlisten nicht verfügbar, nutze eingebaute Liste:', err.message);
    engine = null;
    info = { source: 'fallback', updated: null, rules: FALLBACK_HOSTS.size };
  }
  return info;
}

function pageUrlFor(id) {
  if (topUrls.has(id)) return topUrls.get(id);
  try { const wc = webContents.fromId(id); return wc ? wc.getURL() : ''; } catch { return ''; }
}

function isAllowedSite(url) {
  const host = hostOf(url);
  return !!host && options.allow.some((h) => host === h || host.endsWith('.' + h));
}

function record(details) {
  const id = details.webContentsId;
  totalBlocked++;
  if (id == null) return;
  let s = tabStats.get(id);
  if (!s) tabStats.set(id, (s = { blocked: 0, hosts: new Map() }));
  s.blocked++;
  const host = hostOf(details.url);
  s.hosts.set(host, (s.hosts.get(host) || 0) + 1);
  onStats(id, stats(id));
}

function stats(id) {
  const s = tabStats.get(id) || { blocked: 0, hosts: new Map() };
  const top = [...s.hosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([host, count]) => ({ host, count }));
  const url = pageUrlFor(id);
  return { blocked: s.blocked, top, total: totalBlocked, host: hostOf(url), allowed: isAllowedSite(url), enabled: options.enabled };
}

/** Neue Seite im Tab → Zähler zurücksetzen */
function resetTab(id, url) {
  topUrls.set(id, url);
  tabStats.delete(id);
  onStats(id, stats(id));
}

function setup(ses, { settings, notify }) {
  options = { enabled: settings.adblock !== false, annoyances: !!settings.adblockAnnoyances, allow: settings.adblockAllow || [] };
  onStats = notify;
  ready = loadEngine();
  ipcMain.handle('@ghostery/adblocker/inject-cosmetic-filters', (event, url, msg) => {
    if (!engine || !options.enabled || isAllowedSite(url)) return undefined;
    return engine.onInjectCosmeticFilters(event, url, msg);
  });
  ipcMain.handle('@ghostery/adblocker/is-mutation-observer-enabled', (event) => (engine ? engine.onIsMutationObserverEnabled(event) : false));
  attach(ses);
}

/** Blocker an eine (weitere) Sitzung hängen, z. B. die Inkognito-Sitzung */
function attach(ses) {
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    if (!options.enabled || details.resourceType === 'mainFrame') return callback({});
    if (isAllowedSite(pageUrlFor(details.webContentsId))) return callback({});
    if (engine) {
      engine.onBeforeRequest(details, (result) => {
        if (result.cancel || result.redirectURL) record(details);
        callback(result);
      });
      return;
    }
    if (fallbackMatch(details.url)) { record(details); return callback({ cancel: true }); }
    callback({});
  });

  ses.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    if (!engine || !options.enabled || isAllowedSite(details.url)) return callback({});
    engine.onHeadersReceived(details, callback);
  });

  // Kosmetische Filter (Werbeflächen in der Seite ausblenden) über Ghosterys Preload
  ses.setPreloads([...ses.getPreloads().filter((p) => p !== PRELOAD_PATH), PRELOAD_PATH]);
}

function configure(next) {
  const reload = next.annoyances !== undefined && next.annoyances !== options.annoyances;
  options = { ...options, ...next };
  if (reload) ready = loadEngine();
  return ready;
}

module.exports = {
  setup,
  attach,
  configure,
  resetTab,
  stats,
  update: () => (ready = loadEngine({ forceUpdate: true })),
  info: async () => { await ready; return { ...info, total: totalBlocked }; }
};
