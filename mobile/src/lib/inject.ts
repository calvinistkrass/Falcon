// Skripte für die WebView: Anmeldedaten beim Absenden erkennen (zum Speichern anbieten) und gespeicherte Passwörter ausfüllen

/** Läuft vor jeder Seite: meldet Benutzername + Passwort, wenn ein Anmeldeformular abgeschickt wird. */
export const CAPTURE_SCRIPT = `(function () {
  if (window.__falconPw) return; window.__falconPw = 1;
  var textLike = function (i) { return /^(text|email|tel|)$/.test(i.type || '') ; };
  function grab(root) {
    root = root || document;
    var pw = [].slice.call(root.querySelectorAll('input[type=password]')).filter(function (i) { return i.value; });
    if (!pw.length) return;
    var all = [].slice.call(root.querySelectorAll('input'));
    var u = '';
    for (var j = all.indexOf(pw[0]) - 1; j >= 0; j--) { if (textLike(all[j]) && all[j].value) { u = all[j].value; break; } }
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ t: 'pw', u: u, p: pw[0].value }));
  }
  document.addEventListener('submit', function (e) { grab(e.target); }, true);
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('button,input[type=submit],[role=button]');
    if (b) { var f = b.closest('form'); setTimeout(function () { grab(f); }, 0); }
  }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.type === 'password') grab(e.target.form); }, true);
})(); true;`;

/** Benutzername und Passwort in die sichtbaren Felder der Seite eintragen. */
export function fillScript(username: string, password: string) {
  return `(function (u, p) {
  var setv = function (el, v) {
    var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    d.set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  var visible = function (i) { return i.offsetParent !== null && !i.disabled && !i.readOnly; };
  var textLike = function (i) { return /^(text|email|tel|)$/.test(i.type || ''); };
  var all = [].slice.call(document.querySelectorAll('input')).filter(visible);
  var pw = all.filter(function (i) { return i.type === 'password'; })[0];
  if (pw) {
    setv(pw, p);
    for (var j = all.indexOf(pw) - 1; j >= 0; j--) { if (textLike(all[j])) { if (u) setv(all[j], u); break; } }
  } else if (u) {
    var user = all.filter(function (i) { return textLike(i) && /user|mail|login|name/i.test((i.autocomplete || '') + ' ' + (i.name || '') + ' ' + (i.id || '') + ' ' + i.type); })[0];
    if (user) setv(user, u);
  }
})(${JSON.stringify(username)}, ${JSON.stringify(password)}); true;`;
}

/** „de-falcon--app.translate.goog/pfad?_x_tr_sl=…“ → „https://falcon-app.de/pfad“ (wie am PC) */
export function untranslate(url: string) {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('.translate.goog')) return '';
    const host = u.hostname.replace(/\.translate\.goog$/, '').replace(/--/g, '\u0000').replace(/-/g, '.').replace(/\u0000/g, '-');
    for (const k of [...u.searchParams.keys()]) if (k.startsWith('_x_tr_')) u.searchParams.delete(k);
    const q = u.searchParams.toString();
    return `https://${host}${u.pathname}${q ? `?${q}` : ''}${u.hash}`;
  } catch { return ''; }
}
export const translateUrl = (url: string, lang = 'de') =>
  `https://translate.google.com/translate?sl=auto&tl=${encodeURIComponent(lang)}&u=${encodeURIComponent(url)}`;
