// Einfacher, schneller Werbe- & Tracker-Blocker auf Domain-Basis.
const BLOCKED_HOSTS = new Set([
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'google-analytics.com',
  'googletagservices.com', 'adservice.google.com', 'pagead2.googlesyndication.com',
  'adnxs.com', 'adsrvr.org', 'advertising.com', 'amazon-adsystem.com', 'taboola.com',
  'outbrain.com', 'criteo.com', 'criteo.net', 'rubiconproject.com', 'pubmatic.com',
  'openx.net', 'casalemedia.com', 'moatads.com', 'scorecardresearch.com', 'quantserve.com',
  'adform.net', 'smartadserver.com', 'yieldmo.com', 'media.net', 'zedo.com', 'popads.net',
  'popcash.net', 'propellerads.com', 'adcash.com', 'exoclick.com', 'juicyads.com',
  'hotjar.com', 'mouseflow.com', 'crazyegg.com', 'mixpanel.com', 'segment.io',
  'facebook.net', 'ads-twitter.com', 'ads.linkedin.com', 'bat.bing.com', 'adsafeprotected.com',
  'teads.tv', 'sharethrough.com', 'spotxchange.com', 'springserve.com', 'indexww.com',
  'lijit.com', 'sovrn.com', '33across.com', 'bidswitch.net', 'contextweb.com', 'gumgum.com',
  'serving-sys.com', 'adroll.com', 'revcontent.com', 'mgid.com', 'zergnet.com',
  'trafficjunky.net', 'clickadu.com', 'hilltopads.net', 'onclickads.net', 'adsterra.com'
]);

function isBlocked(url) {
  let host;
  try { host = new URL(url).hostname; } catch { return false; }
  // Prüft Domain und alle übergeordneten Domains (ads.example.com -> example.com)
  while (host && host.includes('.')) {
    if (BLOCKED_HOSTS.has(host)) return true;
    host = host.slice(host.indexOf('.') + 1);
  }
  return false;
}

module.exports = { isBlocked };
