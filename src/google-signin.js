'use strict';
/*
 * Google blockiert die Anmeldung in eingebetteten Chromium-Browsern (Electron, CEF) mit
 * „Dieser Browser oder diese App ist unter Umständen nicht sicher“. Erkannt wird das an der
 * Browser-Kennung, den Client-Hints-Headern (Sec-CH-UA) und navigator.userAgentData.
 *
 * Nur gegenüber den Google-Anmeldeseiten gibt sich Falcon deshalb als aktueller Firefox aus –
 * so wie es andere Electron-Browser (z. B. Ferdium, Min) ebenfalls tun. Alle anderen Seiten
 * sehen weiterhin den normalen Chrome-Kennung.
 */

const SIGNIN_HOSTS = ['accounts.google.com', 'accounts.youtube.com'];
const URL_FILTER = SIGNIN_HOSTS.map((host) => `*://${host}/*`);

/** Ungefähr aktuelle Firefox-Version (Release alle 4 Wochen, Firefox 128 kam am 9. Juli 2024). */
function firefoxVersion() {
  const weeks4 = Math.floor((Date.now() - Date.UTC(2024, 6, 9)) / (28 * 864e5));
  return 128 + Math.max(0, weeks4);
}

function firefoxUserAgent() {
  const v = firefoxVersion();
  const os = process.platform === 'darwin'
    ? 'Macintosh; Intel Mac OS X 10.15'
    : process.platform === 'linux' ? 'X11; Linux x86_64' : 'Windows NT 10.0; Win64; x64';
  return `Mozilla/5.0 (${os}; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`;
}

function isSigninHost(url) {
  try { return SIGNIN_HOSTS.includes(new URL(url).hostname); } catch { return false; }
}

function setup(ses) {
  const ua = firefoxUserAgent();
  ses.webRequest.onBeforeSendHeaders({ urls: URL_FILTER }, (details, callback) => {
    const headers = details.requestHeaders;
    headers['User-Agent'] = ua;
    for (const name of Object.keys(headers)) {
      if (/^sec-ch-ua/i.test(name)) delete headers[name];
    }
    callback({ requestHeaders: headers });
  });
}

module.exports = { setup, isSigninHost, firefoxUserAgent };
