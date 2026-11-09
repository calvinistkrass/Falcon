// Läuft isoliert in jeder Webseite: füllt gespeicherte Logins aus und erkennt neue Logins.
// Die Seite selbst hat keinen Zugriff auf diesen Code (contextIsolation).
const { ipcRenderer, webFrame, contextBridge } = require('electron');

// Falcon-Startseite: Einstellungen (Hintergrundbild, Uhr, Verknüpfungen) bereitstellen
if (location.protocol === 'file:' && /\/ui\/newtab\.html$/.test(location.pathname)) {
  try { contextBridge.exposeInMainWorld('falconNewTab', ipcRenderer.sendSync('newtab:config')); } catch { /* ältere Seite */ }
}

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

// Passkeys auf Websites
// 1. Die Seite ruft navigator.credentials.create/get auf → Falcon zeigt zuerst einen kleinen Hinweis.
// 2. Erst nach „Passkey verwenden“ geht die Anfrage weiter – unter Windows über webauthn.dll
//    (Electron selbst kann kein WebAuthn), sonst an die normale Browser-Schnittstelle.
// Die Seite kann nur ihren eigenen Ursprung anfragen: den prüft der Hauptprozess anhand des echten Frames.
if (/^https?:$/.test(location.protocol) && window.top === window) {
  const ORIGIN = location.origin;
  const pending = new Map(); // id → { kind, publicKey }
  let native = null;
  const nativeAvailable = () => (native ??= !!ipcRenderer.sendSync('webauthn:available'));
  const reply = (data) => window.postMessage({ __falconPasskey: 'answer', ...data }, ORIGIN);

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || typeof e.data !== 'object') return;
    const d = e.data;
    if (d.__falconPasskey === 'ask') {
      pending.set(d.id, { kind: d.kind === 'create' ? 'create' : 'get', publicKey: d.publicKey });
      ipcRenderer.sendToHost('passkey-ask', { id: d.id, kind: d.kind === 'create' ? 'create' : 'get' });
    }
    if (d.__falconPasskey === 'cancel') { pending.delete(d.id); ipcRenderer.sendToHost('passkey-cancel', d.id); }
  });

  ipcRenderer.on('passkey-answer', async (_e, id, ok) => {
    const req = pending.get(id);
    pending.delete(id);
    if (!ok || !req) return reply({ id, ok: false });
    if (!nativeAvailable()) return reply({ id, ok: true }); // Seite nutzt die eingebaute Schnittstelle
    try {
      const r = await ipcRenderer.invoke('webauthn:request', req);
      reply(r.error ? { id, ok: false, error: r.error } : { id, ok: true, result: r.result });
    } catch (err) {
      reply({ id, ok: false, error: { name: 'NotAllowedError', message: String(err.message || err) } });
    }
  });

  webFrame.executeJavaScript(`(() => {
    const creds = navigator.credentials;
    if (!creds || !window.PublicKeyCredential) return;
    const origGet = creds.get.bind(creds);
    const origCreate = creds.create.bind(creds);
    let seq = 0;
    const notAllowed = () => new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError');

    const b64u = (buf) => { const b = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)); let s = ''; for (const c of b) s += String.fromCharCode(c); return btoa(s).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''); };
    const fromB64u = (s) => { const bin = atob(String(s || '').replace(/-/g, '+').replace(/_/g, '/')); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out.buffer; };
    // Optionen übertragbar machen: Binärdaten → { __b: base64url }
    const encode = (v) => {
      if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return { __b: b64u(v) };
      if (Array.isArray(v)) return v.map(encode);
      if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = encode(v[k]); return o; }
      return v;
    };
    const fixed = (props) => Object.fromEntries(Object.entries(props).map(([k, value]) => [k, { value, enumerable: true }]));

    function credentialFrom(kind, r) {
      const rawId = fromB64u(r.id);
      let response;
      if (kind === 'create') {
        const ad = fromB64u(r.authenticatorData);
        const pk = r.publicKey ? fromB64u(r.publicKey) : null;
        response = Object.create(AuthenticatorAttestationResponse.prototype, fixed({
          clientDataJSON: fromB64u(r.clientDataJSON), attestationObject: fromB64u(r.attestationObject),
          getTransports: () => r.transports || [], getAuthenticatorData: () => ad,
          getPublicKey: () => pk, getPublicKeyAlgorithm: () => r.alg
        }));
      } else {
        response = Object.create(AuthenticatorAssertionResponse.prototype, fixed({
          clientDataJSON: fromB64u(r.clientDataJSON), authenticatorData: fromB64u(r.authenticatorData),
          signature: fromB64u(r.signature), userHandle: r.userHandle ? fromB64u(r.userHandle) : null
        }));
      }
      const json = kind === 'create'
        ? { clientDataJSON: r.clientDataJSON, attestationObject: r.attestationObject, authenticatorData: r.authenticatorData, transports: r.transports || [], publicKey: r.publicKey, publicKeyAlgorithm: r.alg }
        : { clientDataJSON: r.clientDataJSON, authenticatorData: r.authenticatorData, signature: r.signature, userHandle: r.userHandle || undefined };
      return Object.create(PublicKeyCredential.prototype, fixed({
        id: r.id, rawId, type: 'public-key', response, authenticatorAttachment: r.attachment || null,
        getClientExtensionResults: () => ({}),
        toJSON: () => ({ id: r.id, rawId: r.id, type: 'public-key', authenticatorAttachment: r.attachment || null, clientExtensionResults: {}, response: json })
      }));
    }

    function gate(kind, options, original) {
      if (!options || !options.publicKey || options.mediation === 'conditional' || options.mediation === 'silent') return original(options);
      const id = ++seq;
      return new Promise((resolve, reject) => {
        const signal = options.signal;
        const onAbort = () => { cleanup(); window.postMessage({ __falconPasskey: 'cancel', id }, location.origin); reject(signal.reason || new DOMException('Aborted', 'AbortError')); };
        const onMessage = (e) => {
          if (e.source !== window || !e.data || e.data.__falconPasskey !== 'answer' || e.data.id !== id) return;
          cleanup();
          const d = e.data;
          if (d.result) return resolve(credentialFrom(kind, d.result));
          if (d.ok) return original(options).then(resolve, reject);
          reject(d.error ? new DOMException(d.error.message || d.error.name, d.error.name || 'NotAllowedError') : notAllowed());
        };
        const cleanup = () => { window.removeEventListener('message', onMessage); if (signal) signal.removeEventListener('abort', onAbort); };
        if (signal && signal.aborted) return reject(signal.reason || new DOMException('Aborted', 'AbortError'));
        if (signal) signal.addEventListener('abort', onAbort);
        window.addEventListener('message', onMessage);
        window.postMessage({ __falconPasskey: 'ask', id, kind, publicKey: encode(options.publicKey) }, location.origin);
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
