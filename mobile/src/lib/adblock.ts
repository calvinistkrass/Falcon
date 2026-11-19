// Werbeblocker für den Handy-Browser: Werbe- und Tracker-Domains werden nicht geladen
// (Navigationen und Popups über onShouldStartLoadWithRequest, Skripte/Bilder/Frames per Skript in der Seite),
// typische Werbeflächen werden ausgeblendet. Einstellung bleibt auf dem Gerät.
import { useCallback, useEffect, useState } from 'react';
import { load, save } from './storage';

export const AD_HOSTS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com', 'google-analytics.com', 'googletagservices.com',
  'adnxs.com', 'taboola.com', 'outbrain.com', 'criteo.com', 'criteo.net', 'amazon-adsystem.com', 'pubmatic.com', 'rubiconproject.com',
  'openx.net', 'adsrvr.org', 'casalemedia.com', 'moatads.com', 'scorecardresearch.com', 'quantserve.com', 'zedo.com', 'popads.net',
  'propellerads.com', 'exoclick.com', 'adcolony.com', 'applovin.com', 'smartadserver.com', 'yieldmo.com', 'sharethrough.com', 'teads.tv',
  'media.net', 'adform.net', 'bidswitch.net', '3lift.com', 'indexww.com', 'contextweb.com', 'spotxchange.com', 'lijit.com', 'sovrn.com',
  'mgid.com', 'revcontent.com', 'adskeeper.com', 'popcash.net', 'hilltopads.net', 'juicyads.com', 'trafficjunky.net', 'adsterra.com',
  'onclickads.net', 'adfox.ru', 'ads.yahoo.com', 'advertising.com', 'serving-sys.com', 'flashtalking.com', 'adition.com', 'yieldlab.net',
  'adtelligent.com', 'gumgum.com', 'undertone.com', 'connatix.com', 'primis.tech', 'vidoomy.com', 'a-ads.com', 'clickadu.com',
  'admaven.com', 'ad-maven.com', 'pushame.com', 'richads.com', 'galaksion.com', 'monetag.com', 'hotjar.com', 'adroll.com', 'bat.bing.com'
];
const SET = new Set(AD_HOSTS);
export function isAdHost(url: string) {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  for (let h = host; h.includes('.'); h = h.slice(h.indexOf('.') + 1)) if (SET.has(h)) return true;
  return false;
}

const SELECTORS = [
  'ins.adsbygoogle', '[id^="google_ads_iframe"]', '[id^="div-gpt-ad"]', 'iframe[src*="doubleclick.net"]', 'iframe[src*="googlesyndication"]',
  '.adsbox', '.ad-banner', '.ad-container', '.ad-slot', '.ad-wrapper', '.advertisement', '.advert', '.sponsored-ad', '[data-ad-slot]',
  '[data-google-query-id]', '[id^="taboola-"]', '.trc_rbox_container', '.OUTBRAIN', '[data-widget-id^="AR_"]', '.mgbox', '#ad_banner',
  '.banner-ad', '.top-ad', '.sticky-ad', '.adunit', 'amp-ad', 'amp-embed[type="taboola"]'
];

/** Läuft vor jeder Seite: blendet Werbeflächen aus und verhindert, dass Werbe-Skripte, -Bilder und -Frames nachgeladen werden. */
export const ADBLOCK_SCRIPT = `(function () {
  if (window.__falconAds) return; window.__falconAds = 1;
  var hosts = ${JSON.stringify(AD_HOSTS)};
  var set = {}; hosts.forEach(function (h) { set[h] = 1; });
  var count = 0, timer = 0;
  function bad(u) {
    try { var h = new URL(u, location.href).hostname.toLowerCase(); } catch (e) { return false; }
    for (; h.indexOf('.') > -1; h = h.slice(h.indexOf('.') + 1)) if (set[h]) return true;
    return false;
  }
  function report() { clearTimeout(timer); timer = setTimeout(function () { try { window.ReactNativeWebView.postMessage(JSON.stringify({ t: 'ads', n: count })); } catch (e) {} }, 400); }
  function hit() { count++; report(); }
  ['HTMLScriptElement', 'HTMLIFrameElement', 'HTMLImageElement'].forEach(function (n) {
    var P = window[n] && window[n].prototype; if (!P) return;
    var d = Object.getOwnPropertyDescriptor(P, 'src'); if (!d || !d.set) return;
    Object.defineProperty(P, 'src', { configurable: true, enumerable: d.enumerable, get: d.get, set: function (v) { if (bad(String(v))) { hit(); return; } d.set.call(this, v); } });
  });
  var sa = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (k, v) { if (/^(src|href)$/i.test(k) && /^(SCRIPT|IFRAME|IMG|LINK)$/.test(this.tagName) && bad(String(v))) { hit(); return; } return sa.apply(this, arguments); };
  var of = window.fetch;
  if (of) window.fetch = function (r) { var u = typeof r === 'string' ? r : (r && r.url) || ''; if (bad(u)) { hit(); return Promise.reject(new TypeError('blocked')); } return of.apply(this, arguments); };
  var xo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) { if (bad(String(u))) { hit(); this.__blocked = 1; } return xo.apply(this, arguments); };
  var xs = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () { if (this.__blocked) return; return xs.apply(this, arguments); };
  var wo = window.open;
  window.open = function (u) { if (u && bad(String(u))) { hit(); return null; } return wo.apply(this, arguments); };
  var css = ${JSON.stringify(SELECTORS.join(','))} + '{display:none!important}';
  function addCss() { var s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s); }
  if (document.documentElement) addCss(); else document.addEventListener('DOMContentLoaded', addCss);
  new MutationObserver(function (list) {
    list.forEach(function (m) { m.addedNodes.forEach(function (n) {
      if (n.nodeType === 1 && /^(SCRIPT|IFRAME|IMG)$/.test(n.tagName) && n.src && bad(n.src)) { n.remove(); hit(); }
    }); });
  }).observe(document.documentElement || document, { childList: true, subtree: true });
})(); true;`;

const KEY = 'falcon.adblock';
/** Werbeblocker an/aus (Standard: an), auf dem Gerät gespeichert. */
export function useAdblock(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => { load(KEY).then((v) => { if (v === '0') setOn(false); }).catch(() => {}); }, []);
  const set = useCallback((v: boolean) => { setOn(v); save(KEY, v ? '1' : '0').catch(() => {}); }, []);
  return [on, set];
}
