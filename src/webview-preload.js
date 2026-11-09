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

// Passkeys: Die Seite darf den Windows-Dialog nicht sofort öffnen. navigator.credentials wird im
// Hauptkontext so umgeleitet, dass Falcon zuerst einen Hinweis zeigt und erst nach dem Klick auf
// „Passkey verwenden“ die eigentliche Anfrage weitergibt. (Reine Bedienhilfe, keine Sicherheitsgrenze.)
if (/^https?:$/.test(location.protocol) && window.top === window) {
  const ORIGIN = location.origin;
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || typeof e.data !== 'object') return;
    if (e.data.__falconPasskey === 'ask') ipcRenderer.sendToHost('passkey-ask', { id: e.data.id, kind: e.data.kind === 'create' ? 'create' : 'get' });
    if (e.data.__falconPasskey === 'cancel') ipcRenderer.sendToHost('passkey-cancel', e.data.id);
  });
  ipcRenderer.on('passkey-answer', (_e, id, ok) => window.postMessage({ __falconPasskey: 'answer', id, ok: !!ok }, ORIGIN));

  webFrame.executeJavaScript(`(() => {
    const creds = navigator.credentials;
    if (!creds || !window.PublicKeyCredential) return;
    const origGet = creds.get.bind(creds);
    const origCreate = creds.create.bind(creds);
    let seq = 0;
    const notAllowed = () => new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError');

    function gate(kind, options, original) {
      // Nur echte Passkey-Abfragen; „conditional“ (Vorschläge im Eingabefeld) läuft ohne Dialog
      if (!options || !options.publicKey || options.mediation === 'conditional' || options.mediation === 'silent') return original(options);
      const id = ++seq;
      return new Promise((resolve, reject) => {
        const signal = options.signal;
        const onAbort = () => { cleanup(); window.postMessage({ __falconPasskey: 'cancel', id }, location.origin); reject(signal.reason || new DOMException('Aborted', 'AbortError')); };
        const onMessage = (e) => {
          if (e.source !== window || !e.data || e.data.__falconPasskey !== 'answer' || e.data.id !== id) return;
          cleanup();
          if (e.data.ok) original(options).then(resolve, reject); else reject(notAllowed());
        };
        const cleanup = () => { window.removeEventListener('message', onMessage); if (signal) signal.removeEventListener('abort', onAbort); };
        if (signal && signal.aborted) return reject(signal.reason || new DOMException('Aborted', 'AbortError'));
        if (signal) signal.addEventListener('abort', onAbort);
        window.addEventListener('message', onMessage);
        window.postMessage({ __falconPasskey: 'ask', id, kind }, location.origin);
      });
    }

    Object.defineProperty(creds, 'get', { configurable: true, value: (options) => gate('get', options, origGet) });
    Object.defineProperty(creds, 'create', { configurable: true, value: (options) => gate('create', options, origCreate) });
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

  // Gespeicherte Logins werden nur angeboten. Das Passwort selbst schickt Falcon erst,
  // wenn der Nutzer in der Liste ein Konto auswählt.
  let accounts = null;
  let target = null; // { pw, user }
  let quietUntil = 0; // direkt nach dem Ausfüllen nicht erneut anbieten
  const loadAccounts = async () => {
    if (accounts === null) accounts = await ipcRenderer.invoke('pw:accounts').catch(() => []);
    return accounts;
  };

  function loginFieldsFor(el) {
    if (!el || el.tagName !== 'INPUT' || !visible(el)) return null;
    const type = (el.type || 'text').toLowerCase();
    if (type === 'password') return { pw: el, user: usernameFieldFor(el) };
    if (!['text', 'email', 'tel', ''].includes(type)) return null;
    const pw = [...(el.form || document).querySelectorAll('input[type=password]')].find(visible);
    return pw && usernameFieldFor(pw) === el ? { pw, user: el } : null;
  }

  async function offer(el) {
    const fields = loginFieldsFor(el);
    if (!fields || !document.hasFocus() || Date.now() < quietUntil) return;
    const list = await loadAccounts();
    if (!list.length || document.activeElement !== el) return;
    target = fields;
    const r = el.getBoundingClientRect();
    ipcRenderer.sendToHost('pw-fill-offer', { accounts: list, rect: { x: r.left, y: r.top, width: r.width, height: r.height } });
  }

  document.addEventListener('focusin', (e) => offer(e.target), true);
  document.addEventListener('mousedown', (e) => { if (e.target === document.activeElement) offer(e.target); }, true);
  document.addEventListener('input', (e) => {
    if (e.isTrusted && target && (e.target === target.pw || e.target === target.user)) ipcRenderer.sendToHost('pw-fill-hide');
  }, true);
  document.addEventListener('focusout', () => setTimeout(() => {
    if (!loginFieldsFor(document.activeElement)) ipcRenderer.sendToHost('pw-fill-hide');
  }, 150), true);

  ipcRenderer.on('pw-fill', (_e, cred) => {
    let t = target && target.pw.isConnected ? target : null;
    if (!t) { const pw = passwordFields()[0]; t = pw ? { pw, user: usernameFieldFor(pw) } : null; }
    if (!t || !cred) return;
    quietUntil = Date.now() + 1500;
    if (t.user && cred.username) setValue(t.user, cred.username);
    setValue(t.pw, cred.password);
    t.pw.style.backgroundColor = 'rgba(124, 108, 255, 0.10)';
    if (t.user && cred.username) t.user.style.backgroundColor = 'rgba(124, 108, 255, 0.10)';
  });

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

}
