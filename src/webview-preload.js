// Läuft isoliert in jeder Webseite: füllt gespeicherte Logins aus und erkennt neue Logins.
// Die Seite selbst hat keinen Zugriff auf diesen Code (contextIsolation).
const { ipcRenderer, webFrame } = require('electron');

// Google-Anmeldung: Seite soll Firefox sehen statt Electron/Chromium (siehe google-signin.js).
// Läuft im Hauptkontext der Seite, bevor deren eigene Skripte starten.
if (location.hostname === 'accounts.google.com' || location.hostname === 'accounts.youtube.com') {
  const ua = ipcRenderer.sendSync('signin-user-agent');
  webFrame.executeJavaScript(`(() => {
    const ua = ${JSON.stringify(ua)};
    const define = (obj, key, value) => { try { Object.defineProperty(obj, key, { get: () => value, configurable: true }); } catch {} };
    define(Navigator.prototype, 'userAgent', ua);
    define(Navigator.prototype, 'appVersion', ua.slice(ua.indexOf('/') + 1));
    define(Navigator.prototype, 'vendor', '');
    define(Navigator.prototype, 'userAgentData', undefined);
    try { delete window.chrome; } catch {}
  })();`);
}

if (/^https?:$/.test(location.protocol)) {
  const visible = (el) => {
    if (!el || el.disabled || el.readOnly) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const passwordFields = () => [...document.querySelectorAll('input[type=password]')].filter(visible);

  // Benutzername-Feld: das letzte sichtbare Text/E-Mail-Feld vor dem Passwortfeld
  function usernameFieldFor(pw) {
    const scope = pw.form || document;
    const inputs = [...scope.querySelectorAll('input')].filter(visible);
    const idx = inputs.indexOf(pw);
    for (let i = idx - 1; i >= 0; i--) {
      const t = (inputs[i].type || 'text').toLowerCase();
      if (['text', 'email', 'tel', ''].includes(t)) return inputs[i];
    }
    return document.querySelector('input[autocomplete=username]');
  }

  // Wert so setzen, dass auch React/Vue/Angular-Seiten ihn erkennen
  function setValue(el, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  let creds = null;
  const filled = new WeakSet();
  async function autofill() {
    const pws = passwordFields().filter((p) => !filled.has(p) && !p.value);
    if (!pws.length) return;
    if (creds === null) creds = await ipcRenderer.invoke('pw:for-page').catch(() => []);
    if (!creds.length) return;
    const pw = pws[0];
    const user = usernameFieldFor(pw);
    // Wenn schon ein Benutzername eingetragen ist, passenden Eintrag wählen
    const typed = user && user.value;
    const c = (typed && creds.find((x) => x.username === typed)) || creds[0];
    if (user && !user.value && c.username) setValue(user, c.username);
    setValue(pw, c.password);
    filled.add(pw);
    pw.style.backgroundColor = 'rgba(255, 46, 77, 0.08)';
    ipcRenderer.send('pw:used', c.id);
  }

  // Login-Erkennung
  let lastSent = '';
  function capture(pw) {
    if (!pw || !pw.value) return;
    const user = usernameFieldFor(pw);
    const data = { username: user ? user.value.trim() : '', password: pw.value };
    const key = data.username + '\u0000' + data.password;
    if (key === lastSent) return;
    lastSent = key;
    ipcRenderer.send('pw:submitted', data);
  }
  const pwIn = (root) => root && [...root.querySelectorAll('input[type=password]')].find((p) => p.value);

  document.addEventListener('submit', (e) => capture(pwIn(e.target)), true);
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('button, input[type=submit], [role=button]');
    if (!btn) return;
    capture(pwIn(btn.form || btn.closest('form')) || passwordFields().find((p) => p.value));
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.type === 'password') capture(e.target);
  }, true);

  let timer;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(autofill, 300); };
  window.addEventListener('DOMContentLoaded', () => {
    schedule();
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  });
}
