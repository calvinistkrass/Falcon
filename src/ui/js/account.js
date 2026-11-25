'use strict';
/* Falcon-Konto: Profil-Symbol, Anmeldung, Profileinstellungen und Sync-Status */

const Account = (() => {
  const btn = $('#profileBtn');
  let acc = { signedIn: false };
  let pop = null;

  const MOBILE_URL = 'https://falconbrowser.de/app';
  const KINDS = [
    ['bookmarks', 'Lesezeichen', 'bookmark'],
    ['passwords', 'Passwörter', 'key'],
    ['history', 'Verlauf', 'clock'],
    ['settings', 'Einstellungen', 'sliders'],
    ['tabs', 'Offene Tabs für andere PCs', 'devices']
  ];
  const ERRORS = {
    UPDATE_REQUIRED: 'Falcon ist zu alt. Aktualisiere Falcon, um dein Konto wieder zu nutzen.',
    ALREADY_REQUESTED: 'Für diesen Kauf läuft schon eine Rückerstattung.',
    REFUND_EXPIRED: 'Die Frist ist abgelaufen: Für den Beta-Zugriff gibt es eine Rückerstattung nur innerhalb von 24 Stunden nach dem Kauf.',
    ALREADY_DECIDED: 'Über diesen Antrag wurde schon entschieden.',
    ALREADY_OWNED: 'Bereits erworben – du kannst erst nach Ablauf erneut kaufen.',
    EMAIL_EXISTS: 'Für diese E-Mail-Adresse gibt es schon ein Konto.',
    EMAIL_NOT_FOUND: 'E-Mail-Adresse oder Passwort ist falsch.',
    INVALID_PASSWORD: 'E-Mail-Adresse oder Passwort ist falsch.',
    INVALID_LOGIN_CREDENTIALS: 'E-Mail-Adresse oder Passwort ist falsch.',
    INVALID_EMAIL: 'Bitte gib eine gültige E-Mail-Adresse ein.',
    MISSING_PASSWORD: 'Bitte gib ein Passwort ein.',
    WEAK_PASSWORD: 'Das Passwort muss mindestens 8 Zeichen lang sein.',
    USER_DISABLED: 'Dieses Konto wurde deaktiviert.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Zu viele Versuche. Bitte warte kurz und versuche es dann erneut.',
    NETWORK: 'Keine Verbindung zum Falcon-Server. Bist du online?',
    WRONG_OLD_PASSWORD: 'Das alte Passwort stimmt nicht.',
    RELOGIN: 'Bitte melde dich ab und noch einmal an.',
    PERMISSION_DENIED: 'Der Server hat den Zugriff verweigert.',
    NO_DATABASE: 'Der Sync-Speicher ist noch nicht eingerichtet.',
    SESSION_EXPIRED: 'Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.',
    CREDENTIAL_TOO_OLD_LOGIN_AGAIN: 'Bitte melde dich ab und noch einmal an.'
  };
  const errorText = (code) => $t(ERRORS[code] || 'Das hat nicht geklappt ({code}).', { code });

  // ---------------------------------------------------------------------------
  // Profil-Symbol
  // ---------------------------------------------------------------------------
  const color = () => state.settings.profileColor || state.settings.accent || '#7c6cff';
  function initials() {
    const src = (acc.displayName || acc.email || '').trim();
    if (!src) return '';
    const parts = src.split(/[\s@._-]+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (acc.displayName && parts[1] ? parts[1][0] : '')).toUpperCase();
  }
  function avatar(size = 22) {
    if (!acc.signedIn) return h('span', { class: 'avatar empty', style: { width: `${size}px`, height: `${size}px` } }, icon('user'));
    return h('span', {
      class: 'avatar', style: { width: `${size}px`, height: `${size}px`, background: color(), fontSize: `${Math.round(size * 0.42)}px` }
    }, initials());
  }
  let lastCoins = null;
  function renderButton() {
    // Kleines „+1“, wenn ein FalCoin dazukommt
    if (acc.signedIn && lastCoins != null && acc.coins > lastCoins && !(pop && Popover.isOpen(pop))) {
      const plus = h('span', { class: 'coin-plus' }, `+${acc.coins - lastCoins}`);
      document.body.append(plus);
      const r = btn.getBoundingClientRect();
      plus.style.left = `${r.left + r.width / 2}px`;
      plus.style.top = `${r.bottom - 4}px`;
      plus.addEventListener('animationend', () => plus.remove(), { once: true });
    }
    lastCoins = acc.signedIn ? acc.coins || 0 : null;
    btn.replaceChildren(avatar(22));
    const dot = acc.signedIn && (acc.lastError || acc.needsKey || !acc.emailVerified);
    if (dot) btn.append(h('i', { class: `profile-dot${acc.lastError || acc.needsKey ? ' err' : ''}` }));
    btn.title = acc.signedIn ? `${acc.displayName || acc.email}${acc.displayName ? `\n${acc.email}` : ''}` : $t('Bei Falcon anmelden');
  }

  function ago(ms) {
    if (!ms) return $t('Noch nie');
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 45) return $t('Gerade eben');
    if (s < 3600) return $t('Vor {n} Min.', { n: Math.max(1, Math.round(s / 60)) });
    if (s < 86400) return $t('Vor {n} Std.', { n: Math.round(s / 3600) });
    return new Date(ms).toLocaleString(I18N.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function syncLine() {
    if (acc.needsKey) return h('span', { class: 'sync-line err' }, icon('warning'), $t('Sync pausiert – Schlüssel entsperren'));
    if (acc.keyPending && !acc.syncing) return h('span', { class: 'sync-line err' }, icon('warning'), $t('Sync wird eingerichtet …'), ' ', errorText(acc.lastError));
    if (acc.syncing) return h('span', { class: 'sync-line' }, h('span', { class: 'spinner sm' }), $t('Wird synchronisiert …'));
    if (acc.lastError) return h('span', { class: 'sync-line err' }, icon('warning'), errorText(acc.lastError));
    return h('span', { class: 'sync-line ok' }, icon('check'), $t('Synchronisiert · {when}', { when: ago(acc.lastSync) }));
  }

  // ---------------------------------------------------------------------------
  // Kontomenü
  // ---------------------------------------------------------------------------
  function closePop() { if (pop && Popover.isOpen(pop)) Popover.close(); }
  function openPop(rerender = false) {
    // Beim Neuzeichnen das vorhandene Popover nur füllen – nicht schließen und neu öffnen
    if (rerender && !(pop && Popover.isOpen(pop))) return;
    const body = acc.locked
      ? [h('div', { class: 'acc-hero' },
          h('img', { src: F.logoUrl, alt: '', width: 44, height: 44 }),
          h('b', {}, $t('Update erforderlich')),
          h('p', {}, $t('Falcon ist zu alt. Aktualisiere Falcon, um dein Konto wieder zu nutzen.'), ' ', acc.hadAccount ? $t('Danach bist du automatisch wieder angemeldet.') : '')),
        h('div', { class: 'acc-actions' }, h('button', { class: 'btn primary', onclick: () => { closePop(); Updates.updateNow(); } }, $t('Jetzt aktualisieren')))]
      : acc.signedIn
      ? [
          h('div', { class: 'acc-head' }, avatar(44),
            h('div', { class: 'acc-id' }, h('b', { 'data-no-i18n': '' }, acc.displayName || acc.email.split('@')[0]), h('span', { 'data-no-i18n': '' }, acc.email))),
          !acc.emailVerified ? h('div', { class: 'acc-note' }, icon('info'),
            h('span', {}, $t('Bitte bestätige deine E-Mail-Adresse.')),
            h('button', { class: 'link-btn', onclick: resendVerification }, $t('Erneut senden'))) : null,
          acc.needsKey || (acc.keyPending && !acc.canUnlock) ? h('button', { class: 'acc-note err', onclick: () => { closePop(); unlockDialog(); } }, icon('warning'), h('span', {}, $t('Deine Sync-Daten sind gesperrt. Hier entsperren.'))) : null,
          acc.daily?.available ? h('button', { class: 'acc-daily', onclick: () => claimDaily() }, icon('coin'),
            h('span', {}, $t('Tägliche Belohnung abholen')), h('b', {}, `+${acc.daily.next}`)) : null,
          h('button', { class: 'acc-coins', title: $t('Du bekommst einen FalCoin für jede Website, die du besuchst, solange du angemeldet bist.'), onclick: () => { closePop(); shopDialog(); } },
            h('span', { class: 'coin-ic' }, icon('coin')), h('b', {}, (acc.coins || 0).toLocaleString(I18N.locale)), h('span', {}, $t('FalCoins')),
            h('small', { class: 'coin-soon' }, icon('shop'), $t('Shop'))),
          h('div', { class: 'acc-sync' }, syncLine(),
            h('button', { class: 'tb-btn sm', title: $t('Jetzt synchronisieren'), disabled: acc.syncing || acc.needsKey, onclick: syncNow }, icon('sync'))),
          h('div', { class: 'menu-sep' }),
          h('button', { class: 'menu-item', onclick: () => { closePop(); rewardsDialog(); } }, icon('flag'), h('span', { class: 'menu-label' }, $t('Missionen')),
            missionsReady() ? h('span', { class: 'mission-dot' }, String(missionsReady())) : null),
          h('button', { class: 'menu-item', onclick: () => { closePop(); historyDialog(); } }, icon('clock'), h('span', { class: 'menu-label' }, $t('FalCoin-Verlauf'))),
          acc.admin ? h('button', { class: 'menu-item', onclick: () => { closePop(); walletAdminDialog(); } }, icon('coin'), h('span', { class: 'menu-label' }, $t('FalCoins der Nutzer verwalten')), pendingRefunds ? h('span', { class: 'mission-dot', title: $t('Offene Rückerstattungen') }, String(pendingRefunds)) : null, h('span', { class: 'admin-tag' }, 'Admin')) : null,
          h('button', { class: 'menu-item', onclick: () => { closePop(); remoteTabsDialog(); } }, icon('devices'), h('span', { class: 'menu-label' }, $t('Tabs von anderen PCs'))),
          h('button', { class: 'menu-item', onclick: () => { closePop(); Settings.open('account'); } }, icon('user'), h('span', { class: 'menu-label' }, $t('Konto & Sync verwalten'))),
          h('button', { class: 'menu-item', onclick: () => { closePop(); signOut(); } }, icon('logout'), h('span', { class: 'menu-label' }, $t('Abmelden')))
        ]
      : [
          h('div', { class: 'acc-hero' },
            h('img', { src: F.logoUrl, alt: '', width: 44, height: 44 }),
            h('b', {}, $t('Falcon auf all deinen PCs')),
            h('p', {}, $t('Melde dich an, um Lesezeichen, Passwörter, Verlauf und Einstellungen zu synchronisieren. Alles wird vorher auf deinem PC verschlüsselt.'))),
          h('div', { class: 'acc-actions' },
            h('button', { class: 'btn primary', onclick: () => { closePop(); authDialog('signin'); } }, $t('Anmelden')),
            h('button', { class: 'btn ghost', onclick: () => { closePop(); authDialog('signup'); } }, $t('Konto erstellen')))
        ];
    if (rerender) { pop.replaceChildren(...body.filter(Boolean)); return; }
    pop?.remove();
    pop = h('section', { class: 'pop account-pop' }, ...body);
    document.body.append(pop);
    const el = pop;
    Popover.open(el, { anchor: btn, onClose: () => { el.remove(); if (pop === el) pop = null; } });
    // Einmal pro Öffnen nachsehen, ob die E-Mail inzwischen bestätigt wurde
    if (acc.signedIn && !acc.emailVerified) F.account.refreshProfile();
  }

  // ---------------------------------------------------------------------------
  // Dialoge
  // ---------------------------------------------------------------------------
  function field(label, attrs) {
    const input = h('input', { class: 'field-input', spellcheck: false, ...attrs });
    return { input, el: h('label', {}, label, input) };
  }

  function authDialog(mode = 'signin') {
    if (Updates.blocked()) return;
    const error = h('p', { class: 'dialog-error' });
    const name = field($t('Name'), { name: 'name', autocomplete: 'off', placeholder: $t('Wie sollen wir dich nennen?') });
    const email = field($t('E-Mail-Adresse'), { name: 'email', type: 'email', autocomplete: 'off' });
    const pass = field($t('Passwort'), { name: 'password', type: 'password', autocomplete: 'off' });
    const hint = h('small', { class: 'field-hint' }, $t('Mindestens 8 Zeichen. Mit diesem Passwort werden auch deine Sync-Daten verschlüsselt.'));
    const forgot = h('button', { type: 'button', class: 'link-btn', onclick: () => forgotPassword(email.input.value) }, $t('Passwort vergessen?'));
    const title = h('h3');
    const submit = h('button', { type: 'submit', class: 'btn primary' });
    const switchText = h('span');
    const switchBtn = h('button', { type: 'button', class: 'link-btn', onclick: () => setMode(mode === 'signin' ? 'signup' : 'signin') });

    const form = h('form', { class: 'dialog auth-dialog', novalidate: true },
      h('div', { class: 'dialog-body' },
        h('div', { class: 'auth-brand' }, h('img', { src: F.logoUrl, alt: '', width: 36, height: 36 })),
        title,
        h('div', { class: 'fields' }, name.el, email.el, pass.el),
        hint,
        error,
        h('div', { class: 'auth-row' }, forgot),
        h('div', { class: 'auth-switch' }, switchText, switchBtn)),
      h('div', { class: 'dialog-foot auth-foot' },
        h('button', { type: 'button', class: 'btn ghost', onclick: () => close() }, $t('Abbrechen')),
        submit));

    function setMode(m) {
      mode = m;
      const up = m === 'signup';
      title.textContent = up ? $t('Falcon-Konto erstellen') : $t('Bei Falcon anmelden');
      submit.textContent = up ? $t('Konto erstellen') : $t('Anmelden');
      switchText.textContent = up ? $t('Schon ein Konto?') : $t('Noch kein Konto?');
      switchBtn.textContent = up ? $t('Anmelden') : $t('Konto erstellen');
      name.el.classList.toggle('hidden', !up);
      hint.classList.toggle('hidden', !up);
      forgot.classList.toggle('hidden', up);
      pass.input.autocomplete = up ? 'new-password' : 'current-password';
      error.textContent = '';
      (up ? name.input : email.input).focus();
    }

    const close = dialogShell(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const values = { name: name.input.value.trim(), email: email.input.value.trim(), password: pass.input.value };
      if (!/^\S+@\S+\.\S+$/.test(values.email)) { error.textContent = errorText('INVALID_EMAIL'); return; }
      if (mode === 'signup' && values.password.length < 8) { error.textContent = errorText('WEAK_PASSWORD'); return; }
      if (!values.password) { error.textContent = errorText('MISSING_PASSWORD'); return; }
      submit.disabled = true;
      submit.replaceChildren(h('span', { class: 'spinner sm' }));
      const wasSignup = mode === 'signup';
      let r;
      try { r = wasSignup ? await F.account.signUp(values) : await F.account.signIn(values); } catch { r = { ok: false, error: 'UNKNOWN' }; }
      submit.disabled = false;
      setMode(mode);
      if (!r.ok) {
        error.replaceChildren(errorText(r.error));
        // Konto gibt es schon (z. B. nach einem abgebrochenen Versuch) → direkt anmelden anbieten
        if (r.error === 'EMAIL_EXISTS') {
          error.append(' ', h('button', { type: 'button', class: 'link-btn', onclick: () => { setMode('signin'); pass.input.value = values.password; pass.input.focus(); } }, $t('Stattdessen anmelden')));
        }
        return;
      }
      close();
      await refresh();
      if (r.needsKey) unlockDialog();
      else welcomeDialog(wasSignup);
    });
    setMode(mode);
  }

  // Bestätigung nach Registrierung bzw. Anmeldung
  function welcomeDialog(isNew) {
    const name = acc.displayName || (acc.email || '').split('@')[0];
    const box = h('div', { class: 'dialog welcome-dialog', role: 'dialog' },
      h('div', { class: 'dialog-body' },
        h('div', { class: 'welcome-avatar' }, avatar(64), h('span', { class: 'welcome-check' }, icon('check'))),
        h('h3', {}, isNew ? $t('Willkommen bei Falcon, {name}!', { name }) : $t('Willkommen zurück, {name}!', { name })),
        h('p', { class: 'welcome-mail', 'data-no-i18n': '' }, $t('Du bist angemeldet als {email}', { email: acc.email })),
        h('ul', { class: 'welcome-list' },
          h('li', {}, icon('sync'), h('span', {}, acc.keyPending
            ? $t('Der Sync wird eingerichtet, sobald die Verbindung zum Server steht.')
            : $t('Lesezeichen, Passwörter, Verlauf und Einstellungen werden jetzt synchronisiert.'))),
          h('li', {}, icon('lock'), h('span', {}, $t('Alles wird auf deinem PC verschlüsselt, bevor es hochgeladen wird.'))),
          isNew && !acc.emailVerified ? h('li', {}, icon('info'), h('span', {}, $t('Wir haben dir eine E-Mail geschickt. Bitte bestätige darin deine Adresse.'))) : null)),
      h('div', { class: 'dialog-foot' },
        h('button', { class: 'btn ghost', onclick: () => { close(); Settings.open('account'); } }, $t('Sync-Einstellungen')),
        h('button', { class: 'btn primary', onclick: () => close() }, $t('Los geht’s'))));
    const close = dialogShell(box);
    box.querySelector('.btn.primary').focus();
  }

  async function forgotPassword(prefill = '') {
    openForm({
      title: $t('Passwort zurücksetzen'),
      description: $t('Wir schicken dir einen Link, mit dem du ein neues Passwort festlegen kannst.'),
      fields: [{ name: 'email', label: $t('E-Mail-Adresse'), type: 'email', value: prefill }],
      submitLabel: $t('Link senden'),
      onSubmit: async ({ email }) => {
        const r = await F.account.resetPassword({ email: email.trim() });
        if (!r.ok && r.error !== 'EMAIL_NOT_FOUND') return errorText(r.error);
        toast($t('Falls es ein Konto für {email} gibt, ist der Link unterwegs.', { email: email.trim() }), 'check');
      }
    });
  }

  // Nach „Passwort vergessen“ sind die Sync-Daten noch mit dem alten Passwort verschlüsselt
  function unlockDialog() {
    if (!acc.canUnlock) {
      // Erst mit dem aktuellen Passwort bestätigen – oft reicht das schon, um den Sync einzurichten
      openForm({
        title: $t('Sync einrichten'),
        description: $t('Gib dein Falcon-Passwort ein, um den Sync auf diesem PC einzurichten.'),
        fields: [{ name: 'password', label: $t('Passwort'), type: 'password' }],
        submitLabel: $t('Weiter'),
        onSubmit: async ({ password }) => {
          const r = await F.account.signIn({ email: acc.email, password });
          if (!r.ok) return errorText(r.error);
          await refresh();
          if (r.needsKey) setTimeout(unlockDialog, 50);
          else toast($t('Sync ist eingerichtet'), 'check');
        }
      });
      return;
    }
    const error = h('p', { class: 'dialog-error' });
    const old = field($t('Altes Passwort'), { type: 'password', autocomplete: 'off' });
    const form = h('form', { class: 'dialog', novalidate: true },
      h('div', { class: 'dialog-body' },
        h('h3', {}, $t('Sync-Daten entsperren')),
        h('p', {}, $t('Deine Sync-Daten wurden mit deinem früheren Passwort verschlüsselt. Gib es ein, um sie zu übernehmen – oder fang mit den Daten dieses PCs neu an.')),
        h('div', { class: 'fields' }, old.el),
        error),
      h('div', { class: 'dialog-foot' },
        h('button', {
          type: 'button', class: 'btn ghost danger-text', onclick: async () => {
            if (!(await confirmDialog({ title: $t('Neu anfangen?'), message: $t('Die bisher synchronisierten Daten werden vom Server gelöscht. Die Daten auf diesem PC bleiben erhalten und werden neu hochgeladen.'), confirmLabel: $t('Neu anfangen'), danger: true }))) return;
            const r = await F.account.resetSyncData();
            if (!r.ok) { error.textContent = errorText(r.error); return; }
            close(); refresh();
          }
        }, $t('Neu anfangen')),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => close() }, $t('Später')),
        h('button', { type: 'submit', class: 'btn primary' }, $t('Entsperren'))));
    const close = dialogShell(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await F.account.unlockKey({ oldPassword: old.input.value });
      if (!r.ok) { error.textContent = errorText(r.error); return; }
      close(); refresh();
      toast($t('Sync-Daten entsperrt'), 'check');
    });
    old.input.focus();
  }

  // ---------------------------------------------------------------------------
  // FalCoin-Shop
  // ---------------------------------------------------------------------------
  const SHOP = [
    {
      id: 'beta14', price: 350, icon: 'flask', field: 'betaUntil', extendLabel: 'Um 30 Tage verlängern', title: 'Beta-Zugriff · 30 Tage',
      // Seit 2.6.0 abgeschaltet: alle Beta-Funktionen sind frei. Zum Wiedereinschalten die nächsten Zeilen entfernen (und available in src/account.js)
      available: false, offLabel: 'Für alle kostenlos', unavailableText: 'Alle Beta-Funktionen sind jetzt für alle kostenlos – auch ohne Konto. Du musst nichts mehr kaufen.',
      text: 'Teste neue Funktionen vor allen anderen – dazu gehört der Game Mode. Dein Zugriff gilt ab dem Kauf 30 Tage lang. Eine Rückerstattung ist nur innerhalb von 24 Stunden nach dem Kauf möglich.',
      perks: [
        'Game Mode – gibt CPU und Arbeitsspeicher für Spiele frei: Hintergrund-Tabs werden pausiert und schlafen gelegt',
        'Akzentfarbe – Falcon in deiner Farbe, auch mit eigenen Farben',
        'RGB-Modus – die Akzentfarbe läuft durch alle Farben, Tabs und Knöpfe leuchten',
        'Angebots-Wunschliste – Falcon meldet sich, wenn ein Spiel kostenlos oder reduziert ist',
        'Seite übersetzen – Websites direkt in deine Sprache übersetzen',
        'Alle weiteren Beta-Funktionen, sobald sie erscheinen'
      ]
    }
  ];
  const fmtUntil = (ms) => new Date(ms).toLocaleDateString(I18N.locale, { day: 'numeric', month: 'long', year: 'numeric' });
  function shopDialog() {
    if (!acc.signedIn) return authDialog('signin');
    const list = h('div', { class: 'shop-list' });
    const balance = h('b');
    const box = h('div', { class: 'dialog shop-dialog', role: 'dialog' },
      h('div', { class: 'dialog-body' },
        h('div', { class: 'shop-head' },
          h('h3', {}, $t('FalCoin-Shop')),
          h('span', { class: 'acc-coins inline' }, h('span', { class: 'coin-ic' }, icon('coin')), balance)),
        h('p', { class: 'shop-sub' }, $t('Du bekommst einen FalCoin für jede Website, die du besuchst, solange du angemeldet bist.')),
        list),
      h('div', { class: 'dialog-foot' },
        h('button', { class: 'btn ghost', onclick: () => { close(); refundDialog(); } }, icon('restore'), $t('Rückerstattung beantragen')),
        h('button', { class: 'btn primary', onclick: () => close() }, $t('Schließen'))));
    const close = dialogShell(box);
    // Aktuellen Kontostand vom Server holen
    F.account.refreshCoins().then(async () => { acc = await F.account.state(); renderAll(); if (box.isConnected) render(); });
    function render() {
      balance.textContent = (acc.coins || 0).toLocaleString(I18N.locale);
      list.replaceChildren(...SHOP.map((item) => {
        const missing = item.price - (acc.coins || 0);
        const active = (acc[item.field] || 0) > Date.now();
        const off = item.available === false;
        const buy = h('button', {
          class: 'btn primary', disabled: off || active || missing > 0,
          onclick: async () => {
            const ok = await confirmDialog({
              title: active ? $t('{name} verlängern?', { name: $t(item.title) }) : $t('{name} kaufen?', { name: $t(item.title) }),
              message: $t('{price} FalCoins werden von deinem Guthaben abgezogen.', { price: item.price.toLocaleString(I18N.locale) }),
              confirmLabel: $t('Für {price} FalCoins kaufen', { price: item.price.toLocaleString(I18N.locale) })
            });
            if (!ok) return;
            buy.disabled = true;
            const r = await F.account.purchase({ item: item.id });
            if (!r.ok) {
              buy.disabled = false;
              toast(r.error === 'NOT_ENOUGH' ? $t('Nicht genug FalCoins.') : errorText(r.error), 'warning');
              return;
            }
            acc = await F.account.state();
            renderAll(); render();
            toast($t('{name} aktiv bis {date}', { name: $t(item.title), date: fmtUntil(r.until) }), 'check');
          }
        }, off ? $t(item.offLabel || 'Zurzeit nicht verfügbar') : active ? $t('Bereits erworben') : missing > 0 ? $t('Noch {n} FalCoins', { n: missing.toLocaleString(I18N.locale) }) : $t('Kaufen'));
        return h('div', { class: `shop-item${active ? ' owned' : ''}` },
          h('span', { class: 'shop-ic' }, icon(item.icon)),
          h('div', { class: 'shop-main' },
            h('b', {}, $t(item.title), active ? h('span', { class: 'beta-badge' }, $t('Aktiv')) : null),
            h('p', {}, $t(item.text)),
            off ? h('small', { class: 'shop-unavailable' }, icon(item.offLabel ? 'check' : 'clock'), h('span', {}, $t(item.unavailableText))) : null,
            item.perks ? h('div', { class: 'shop-perks' }, h('small', {}, $t('Das bekommst du:')),
              h('ul', {}, item.perks.map((p) => h('li', {}, icon('check'), h('span', {}, $t(p)))))) : null,
            active ? h('small', { class: 'shop-until' }, $t('Aktiv bis {date}', { date: fmtUntil(acc[item.field]) })) : null,
            h('span', { class: 'shop-price' }, h('span', { class: 'coin-ic' }, icon('coin')), item.price.toLocaleString(I18N.locale))),
          buy);
      }));
    }
    render();
  }

  // ---------------------------------------------------------------------------
  // Tägliche Belohnung, Missionen, Verlauf
  // ---------------------------------------------------------------------------
  const MISSION_TEXT = {
    visits20: 'Besuche heute {goal} Seiten',
    sites5: 'Besuche {goal} verschiedene Websites',
    gamemode30: 'Nutze {goal} Minuten den Game Mode'
  };
  const missionsReady = () => (acc.missions || []).filter((m) => m.done && !m.claimed).length;
  async function claimDaily() {
    const r = await F.account.claimDaily();
    if (!r.ok) { toast(r.error === 'ALREADY_CLAIMED' ? $t('Heute schon abgeholt – komm morgen wieder!') : errorText(r.error), 'warning'); return; }
    acc = await F.account.state(); renderAll();
    toast(r.streak % 7 === 0
      ? $t('+{n} FalCoins – {days} Tage in Folge, Bonus!', { n: r.reward, days: r.streak })
      : $t('+{n} FalCoins · Tag {days} in Folge', { n: r.reward, days: r.streak }), 'coin');
  }
  function rewardsDialog() {
    if (!acc.signedIn) return authDialog('signin');
    const body = h('div', { class: 'rw-body' });
    const box = h('div', { class: 'dialog rw-dialog', role: 'dialog' },
      h('div', { class: 'dialog-body' }, h('h3', {}, $t('Tägliche Belohnung & Missionen')), body),
      h('div', { class: 'dialog-foot' }, h('button', { class: 'btn primary', onclick: () => close() }, $t('Schließen'))));
    const close = dialogShell(box);
    function render() {
      const d = acc.daily || {};
      const days = Array.from({ length: 7 }, (_, i) => {
        const n = i + 1;
        const doneDay = (d.streak % 7 || (d.streak && !d.available ? 7 : 0)) >= n;
        return h('div', { class: `rw-day${doneDay ? ' done' : ''}${n === 7 ? ' bonus' : ''}` }, h('small', {}, $t('Tag {n}', { n })), h('b', {}, `+${n === 7 ? 60 : 10}`));
      });
      body.replaceChildren(
        h('section', { class: 'rw-daily' },
          h('div', { class: 'rw-row' },
            h('div', {}, h('b', {}, $t('Tägliche Belohnung')), h('p', {}, $t('Jeden Tag 10 FalCoins – am 7. Tag in Folge gibt es 50 extra.'))),
            d.available
              ? h('button', { class: 'btn primary', onclick: async () => { await claimDaily(); render(); } }, $t('+{n} abholen', { n: d.next }))
              : h('span', { class: 'rw-claimed' }, icon('check'), $t('Heute abgeholt'))),
          h('div', { class: 'rw-days' }, days),
          h('p', { class: 'rw-streak' }, d.streak === 1 ? $t('Serie: 1 Tag') : $t('Serie: {n} Tage', { n: d.streak || 0 }))),
        h('section', { class: 'rw-missions' },
          h('b', {}, $t('Missionen von heute')),
          ...(acc.missions || []).map((m) => h('div', { class: `rw-mission${m.claimed ? ' claimed' : ''}` },
            h('div', { class: 'rw-m-main' },
              h('span', {}, $t(MISSION_TEXT[m.id] || m.id, { goal: m.goal })),
              h('div', { class: 'rw-bar' }, h('i', { style: { width: `${(m.progress / m.goal) * 100}%` } })),
              h('small', {}, `${m.progress} / ${m.goal}`)),
            m.claimed ? h('span', { class: 'rw-claimed' }, icon('check'), $t('Erledigt'))
              : h('button', {
                class: 'btn primary sm', disabled: !m.done,
                onclick: async () => {
                  const r = await F.account.claimMission({ id: m.id });
                  if (!r.ok) { toast(errorText(r.error), 'warning'); return; }
                  acc = await F.account.state(); renderAll(); render();
                  toast($t('+{n} FalCoins für die Mission', { n: r.reward }), 'coin');
                }
              }, `+${m.reward}`))),
          h('p', { class: 'rw-note' }, $t('Missionen werden jeden Tag um Mitternacht neu gestartet.'))));
    }
    render();
  }
  const LOG_TEXT = {
    visits: (e) => $t('Website-Besuche · {date}', { date: new Date(e.label).toLocaleDateString(I18N.locale, { day: 'numeric', month: 'long' }) }),
    daily: (e) => $t('Tägliche Belohnung · Tag {n}', { n: e.label }),
    mission: (e) => $t('Mission: {name}', { name: $t(MISSION_TEXT[e.label] || e.label, { goal: { visits20: 20, sites5: 5, gamemode30: 30 }[e.label] || '' }) }),
    purchase: (e) => $t('Kauf: {item}', { item: e.label === 'gameMode' ? $t('Game Mode · 2 Monate') : e.label === 'beta14' ? $t('Beta-Zugriff') : e.label }),
    refund: (e) => $t('Rückerstattung: {item}', { item: e.label === 'gameMode' ? $t('Game Mode') : e.label === 'beta14' ? $t('Beta-Zugriff') : e.label })
  };
  async function historyDialog() {
    if (!acc.signedIn) return authDialog('signin');
    const list = h('div', { class: 'hist-list' }, h('div', { class: 'rt-empty' }, h('span', { class: 'spinner' })));
    const box = h('div', { class: 'dialog hist-dialog', role: 'dialog' },
      h('div', { class: 'dialog-body' },
        h('div', { class: 'shop-head' }, h('h3', {}, $t('FalCoin-Verlauf')),
          h('span', { class: 'acc-coins inline' }, h('span', { class: 'coin-ic' }, icon('coin')), h('b', {}, (acc.coins || 0).toLocaleString(I18N.locale)))),
        list),
      h('div', { class: 'dialog-foot' }, h('button', { class: 'btn primary', onclick: () => close() }, $t('Schließen'))));
    const close = dialogShell(box);
    const r = await F.account.coinLog();
    if (!r.ok) { list.replaceChildren(h('div', { class: 'rt-empty' }, errorText(r.error))); return; }
    if (!r.entries.length) { list.replaceChildren(h('div', { class: 'rt-empty' }, $t('Noch keine Einträge'))); return; }
    list.replaceChildren(...r.entries.map((e) => h('div', { class: 'hist-row' },
      h('span', { class: `hist-ic ${e.amount < 0 ? 'out' : 'in'}` }, icon(e.type === 'purchase' ? 'shop' : e.type === 'refund' ? 'restore' : e.type === 'mission' ? 'flag' : e.type === 'daily' ? 'coin' : 'globe')),
      h('div', { class: 'hist-main' }, h('b', {}, (LOG_TEXT[e.type] || ((x) => x.type))(e)),
        h('small', {}, new Date(e.at).toLocaleString(I18N.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))),
      h('b', { class: `hist-amount ${e.amount < 0 ? 'out' : 'in'}` }, `${e.amount > 0 ? '+' : ''}${e.amount.toLocaleString(I18N.locale)}`))));
  }


  // ---------------------------------------------------------------------------
  // Rückerstattung beantragen (Käufe aus Versehen) – Entscheidung kommt beim nächsten Start als Hinweis
  // ---------------------------------------------------------------------------
  const ITEM_NAME = (id) => (id === 'beta14' ? $t('Beta-Zugriff') : id === 'gameMode' ? $t('Game Mode') : id);
  const REFUND_STATE = { pending: 'Beantragt', approved: 'Erstattet', denied: 'Abgelehnt' };
  async function refundDialog() {
    if (!acc.signedIn) return authDialog('signin');
    const body = h('div', { class: 'rf-body' }, h('div', { class: 'rt-empty' }, h('span', { class: 'spinner' })));
    const send = h('button', { class: 'btn primary', type: 'button', disabled: true }, $t('Antrag senden'));
    const box = h('div', { class: 'dialog rf-dialog', role: 'dialog' },
      h('div', { class: 'dialog-body' },
        h('h3', {}, $t('Rückerstattung beantragen')),
        h('p', { class: 'shop-sub' }, $t('Etwas aus Versehen gekauft? Wähle den Kauf aus und sag kurz, warum. Die Antwort bekommst du beim nächsten Start von Falcon.')),
        h('p', { class: 'shop-sub rf-window' }, $t('Beim Beta-Zugriff geht eine Rückerstattung nur innerhalb von 24 Stunden nach dem Kauf.')),
        body),
      h('div', { class: 'dialog-foot' }, h('button', { class: 'btn ghost', onclick: () => close() }, $t('Abbrechen')), send));
    const close = dialogShell(box);
    const r = await F.account.listPurchases();
    if (!r.ok) { body.replaceChildren(h('div', { class: 'rt-empty' }, errorText(r.error))); return; }
    if (!r.purchases.length) { body.replaceChildren(h('div', { class: 'rt-empty' }, $t('Du hast noch nichts im Shop gekauft.'))); return; }
    const fmt = (ms) => new Date(ms).toLocaleDateString(I18N.locale, { day: 'numeric', month: 'long', year: 'numeric' });
    const left = (p) => {
      const h_ = Math.max(0, Math.ceil((p.refundUntil - Date.now()) / 3600_000));
      return h_ <= 1 ? $t('noch unter 1 Stunde') : $t('noch {n} Stunden', { n: h_ });
    };
    const label = (p) => p.refund ? ` – ${$t(REFUND_STATE[p.refund] || p.refund)}` : p.expired ? ` – ${$t('Frist abgelaufen')}` : p.refundUntil ? ` – ${left(p)}` : '';
    const select = h('select', { class: 'field-input' }, r.purchases.map((p) => h('option', { value: p.id, disabled: !!p.refund || p.expired },
      `${ITEM_NAME(p.item)} · ${p.price.toLocaleString(I18N.locale)} FalCoins · ${fmt(p.at)}${label(p)}`)));
    const first = r.purchases.find((p) => !p.refund && !p.expired);
    if (first) select.value = first.id;
    const email = h('input', { class: 'field-input', type: 'email', value: r.email || '', placeholder: $t('E-Mail-Adresse'), spellcheck: false });
    const reason = h('textarea', { class: 'field-input rf-reason', rows: 4, maxlength: 1000, placeholder: $t('Warum möchtest du den Kauf zurückgeben?') });
    const error = h('p', { class: 'dialog-error' });
    body.replaceChildren(
      h('div', { class: 'fields' },
        h('label', {}, $t('Kauf'), select),
        h('label', {}, $t('E-Mail-Adresse'), email),
        h('label', {}, $t('Grund'), reason)),
      error);
    const check = () => { send.disabled = !first || !reason.value.trim() || !/^\S+@\S+\.\S+$/.test(email.value.trim()); };
    reason.addEventListener('input', check); email.addEventListener('input', check); check();
    if (!first) error.textContent = r.purchases.some((p) => p.expired && !p.refund)
      ? $t('Für deine Käufe ist keine Rückerstattung mehr möglich: Beim Beta-Zugriff geht das nur innerhalb von 24 Stunden nach dem Kauf.')
      : $t('Für alle deine Käufe läuft schon eine Rückerstattung.');
    send.addEventListener('click', async () => {
      send.disabled = true; error.textContent = '';
      const res = await F.account.requestRefund({ purchaseId: select.value, email: email.value, reason: reason.value });
      if (!res.ok) { error.textContent = errorText(res.error); check(); return; }
      close();
      toast($t('Antrag gesendet – die Antwort bekommst du beim nächsten Start von Falcon.'), 'check');
    });
    reason.focus();
  }

  // Entschiedene Rückerstattungen beim Start anzeigen (statt einer E-Mail)
  async function showRefundNotices() {
    const r = await F.account.refundNotices();
    if (!r.ok) return;
    for (const x of r.refunds) {
      const ok = x.status === 'approved';
      await confirmDialog({
        title: ok ? $t('Rückerstattung genehmigt') : $t('Rückerstattung abgelehnt'),
        message: (ok
          ? $t('Du hast {n} FalCoins für „{item}“ zurückbekommen. Der Kauf wurde rückgängig gemacht.', { n: x.price.toLocaleString(I18N.locale), item: ITEM_NAME(x.item) })
          : $t('Deine Rückerstattung für „{item}“ wurde abgelehnt.', { item: ITEM_NAME(x.item) })) + (x.note ? `\n\n${$t('Nachricht')}: ${x.note}` : ''),
        confirmLabel: $t('OK'), alert: true
      });
      await F.account.markRefundSeen({ id: x.id });
    }
    if (r.refunds.some((x) => x.status === 'approved')) { acc = await F.account.state(); renderAll(); }
  }
  // Admin: offene Anträge beim Start melden
  let pendingRefunds = 0;
  async function checkPendingRefunds() {
    if (!acc.admin) return;
    const r = await F.account.adminListRefunds();
    if (!r.ok) return;
    pendingRefunds = r.refunds.filter((x) => x.status === 'pending').length;
    renderAll();
    if (pendingRefunds) toast(pendingRefunds === 1 ? $t('1 neuer Antrag auf Rückerstattung') : $t('{n} neue Anträge auf Rückerstattung', { n: pendingRefunds }), 'coin', { label: $t('Ansehen'), onClick: () => walletAdminDialog() });
  }

  // ---------------------------------------------------------------------------
  // Admin: FalCoins aller Nutzer bearbeiten
  // ---------------------------------------------------------------------------
  // Seit 2.1.9 nur noch Beta verschenken – Game Mode ist darin enthalten
  const GRANTS = [
    { field: 'betaUntil', name: 'Beta', icon: 'flask', days: 30, give: 'Beta-Zugriff für 30 Tage schenken', revoke: 'Beta-Zugriff entziehen' }
  ];
  function walletAdminDialog() {
    // Rückerstattungen: offene Anträge genehmigen oder ablehnen
    const refundsBox = h('section', { class: 'rf-admin' });
    async function loadRefunds() {
      const r = await F.account.adminListRefunds();
      if (!r.ok) { refundsBox.replaceChildren(); return; }
      const open = r.refunds.filter((x) => x.status === 'pending');
      const done = r.refunds.filter((x) => x.status !== 'pending').slice(0, 5);
      pendingRefunds = open.length; renderAll();
      const fmt = (ms) => new Date(ms).toLocaleString(I18N.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const decide = async (x, approve) => {
        let note = '';
        if (approve) {
          if (!(await confirmDialog({ title: $t('Rückerstattung genehmigen?'), message: $t('{name} bekommt {n} FalCoins zurück, „{item}“ wird entzogen.', { name: x.name || x.email, n: x.price.toLocaleString(I18N.locale), item: ITEM_NAME(x.item) }), confirmLabel: $t('Genehmigen') }))) return;
        } else {
          const ok = await new Promise((resolve) => openForm({
            title: $t('Rückerstattung ablehnen'), description: $t('Optional: eine kurze Begründung – der Nutzer sieht sie beim nächsten Start.'),
            fields: [{ name: 'note', label: $t('Begründung'), placeholder: $t('z. B. Der Kauf wurde schon genutzt.') }], submitLabel: $t('Ablehnen'),
            onSubmit: ({ note: n }) => { note = n; resolve(true); }, onCancel: () => resolve(false)
          }));
          if (!ok) return;
        }
        const res = await F.account.adminDecideRefund({ id: x.id, approve, note });
        if (!res.ok) { toast(errorText(res.error), 'warning'); return; }
        toast(approve ? $t('Rückerstattung genehmigt') : $t('Rückerstattung abgelehnt'), 'check');
        loadRefunds(); load();
      };
      refundsBox.replaceChildren(...[
        h('h4', { class: 'rf-title' }, $t('Rückerstattungen'), open.length ? h('span', { class: 'mission-dot' }, String(open.length)) : null),
        open.length ? h('div', { class: 'rf-list' }, open.map((x) => h('div', { class: 'rf-row' },
          h('div', { class: 'rf-main' },
            h('b', { 'data-no-i18n': '' }, `${x.name || x.email.split('@')[0]} · ${ITEM_NAME(x.item)} · ${x.price.toLocaleString(I18N.locale)} FalCoins`),
            h('span', { 'data-no-i18n': '' }, `${x.email} · ${fmt(x.created)}`),
            h('p', { 'data-no-i18n': '' }, x.reason)),
          h('div', { class: 'rf-actions' },
            h('button', { class: 'btn primary sm', onclick: () => decide(x, true) }, $t('Genehmigen')),
            h('button', { class: 'btn ghost sm', onclick: () => decide(x, false) }, $t('Ablehnen')))))) : h('p', { class: 'rf-none' }, $t('Keine offenen Anträge.')),
        done.length ? h('details', { class: 'rf-done' }, h('summary', {}, $t('Zuletzt entschieden')),
          done.map((x) => h('div', { class: 'rf-done-row', 'data-no-i18n': '' }, `${x.status === 'approved' ? '✓' : '✕'} ${x.name || x.email} · ${ITEM_NAME(x.item)} · ${x.price} · ${fmt(x.decidedAt)}${x.note ? ` – ${x.note}` : ''}`))) : null].filter(Boolean));
    }
    loadRefunds();
    const search = h('input', { class: 'field-input', placeholder: $t('Name oder E-Mail suchen'), spellcheck: false });
    const list = h('div', { class: 'wa-list' }, h('div', { class: 'rt-empty' }, h('span', { class: 'spinner' })));
    const box = h('div', { class: 'dialog wa-dialog', role: 'dialog' },
      h('div', { class: 'dialog-body' },
        h('h3', {}, $t('FalCoins der Nutzer verwalten')),
        h('p', { class: 'shop-sub' }, $t('Nur für dein Admin-Konto sichtbar. Änderungen gelten sofort.')),
        refundsBox,
        search, list),
      h('div', { class: 'dialog-foot' }, h('button', { class: 'btn primary', onclick: () => close() }, $t('Schließen'))));
    const close = dialogShell(box);
    let wallets = [];
    async function load() {
      const r = await F.account.listWallets();
      if (!r.ok) { list.replaceChildren(h('div', { class: 'rt-empty' }, errorText(r.error))); return; }
      wallets = r.wallets;
      render();
    }
    function render() {
      const q = search.value.trim().toLowerCase();
      const shown = wallets.filter((w) => !q || w.email.toLowerCase().includes(q) || w.name.toLowerCase().includes(q));
      if (!shown.length) { list.replaceChildren(h('div', { class: 'rt-empty' }, $t(wallets.length ? 'Keine Treffer' : 'Noch keine Wallets'))); return; }
      list.replaceChildren(...shown.map((w) => {
        const input = h('input', { class: 'field-input wa-input', type: 'number', min: 0, step: 1, value: w.balance });
        const save = h('button', { class: 'btn primary sm', disabled: true }, $t('Speichern'));
        input.addEventListener('input', () => { save.disabled = String(Math.round(Number(input.value))) === String(w.balance) || input.value === ''; });
        const commit = async (patch) => {
          save.disabled = true;
          const r = await F.account.adminUpdateWallet({ uid: w.uid, ...patch });
          if (!r.ok) { toast(errorText(r.error), 'warning'); return; }
          Object.assign(w, patch, patch.balance !== undefined ? { balance: Math.round(Number(patch.balance)) } : {});
          toast($t('Gespeichert'), 'check');
          render();
          if (w.uid && acc.signedIn) refresh();
        };
        save.addEventListener('click', () => commit({ balance: input.value }));
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !save.disabled) commit({ balance: input.value }); });
        const step = (d) => h('button', { class: 'tb-btn sm wa-step', title: `${d > 0 ? '+' : ''}${d}`, onclick: () => { input.value = Math.max(0, Math.round(Number(input.value || 0)) + d); input.dispatchEvent(new Event('input')); } }, `${d > 0 ? '+' : ''}${d}`);
        const gm = (w.gameModeUntil || 0) > Date.now();
        // Alle Freischaltungen aus dem Shop verleihen oder entziehen
        const grant = (g) => {
          const on = (w[g.field] || 0) > Date.now();
          return h('button', {
            class: 'btn ghost sm', title: on ? $t(g.revoke) : $t(g.give),
            onclick: () => {
              const d = new Date();
              if (g.months) d.setMonth(d.getMonth() + g.months);
              if (g.days) d.setDate(d.getDate() + g.days);
              commit({ [g.field]: on ? 0 : d.getTime() });
            }
          }, icon(g.icon), h('span', { 'data-no-i18n': '' }, g.name), on ? $t('Entziehen') : $t('Schenken'));
        };
        return h('div', { class: 'wa-row' },
          h('div', { class: 'wa-user' },
            h('b', { 'data-no-i18n': '' }, w.name || w.email.split('@')[0] || w.uid.slice(0, 8)),
            h('span', { 'data-no-i18n': '' }, w.email || w.uid),
            h('span', { class: 'wa-tags' },
              gm ? h('span', { class: 'beta-badge' }, $t('Game Mode bis {date}', { date: fmtUntil(w.gameModeUntil) })) : null,
              (w.betaUntil || 0) > Date.now() ? h('span', { class: 'beta-badge' }, $t('Beta bis {date}', { date: fmtUntil(w.betaUntil) })) : null)),
          h('div', { class: 'wa-edit' },
            step(-100), step(-10), input, step(10), step(100), save,
            ...GRANTS.map(grant)));
      }));
    }
    search.addEventListener('input', render);
    load();
  }

  // ---------------------------------------------------------------------------
  // Tabs von anderen PCs
  // ---------------------------------------------------------------------------
  let remoteCache = null; // { at, devices }
  async function loadRemoteTabs(maxAge = 60_000) {
    if (!acc.signedIn || acc.needsKey || acc.keyPending) return [];
    if (remoteCache && Date.now() - remoteCache.at < maxAge) return remoteCache.devices;
    const r = await F.account.remoteTabs();
    if (!r.ok) throw new Error(r.error);
    remoteCache = { at: Date.now(), devices: r.devices };
    return r.devices;
  }
  function openUrl(url, background = false) {
    const t = Tabs.active();
    if (!background && t && isNewTab(t.url)) Tabs.navigate(url, t);
    else Tabs.create(url, { background, index: state.tabs.indexOf(t) + 1 });
  }
  async function remoteTabsDialog() {
    if (!acc.signedIn) return authDialog('signin');
    const list = h('div', { class: 'rt-list' }, h('div', { class: 'rt-empty' }, h('span', { class: 'spinner' })));
    const box = h('div', { class: 'dialog rt-dialog', role: 'dialog' },
      h('div', { class: 'dialog-body' }, h('h3', {}, $t('Tabs von anderen PCs')), list),
      h('div', { class: 'dialog-foot' },
        h('button', { class: 'btn ghost', onclick: async () => { remoteCache = null; render(); } }, icon('sync'), $t('Aktualisieren')),
        h('button', { class: 'btn primary', onclick: () => close() }, $t('Schließen'))));
    const close = dialogShell(box);
    async function render() {
      let devices;
      try { devices = await loadRemoteTabs(0); } catch (e) {
        list.replaceChildren(h('div', { class: 'rt-empty' }, errorText(e.message)));
        return;
      }
      if (!devices.length) {
        list.replaceChildren(h('div', { class: 'rt-empty' }, icon('devices'),
          h('b', {}, $t('Noch keine anderen PCs')),
          h('span', {}, $t('Melde dich auf einem anderen PC bei Falcon an. Dessen offene Tabs erscheinen dann hier.'))));
        return;
      }
      list.replaceChildren(...devices.map((d) => h('section', { class: 'rt-device' },
        h('header', {}, icon(d.kind === 'phone' ? 'phone' : 'devices'), h('b', { 'data-no-i18n': '' }, d.name), h('span', {}, ago(d.at)),
          d.tabs.length > 1 ? h('button', { class: 'link-btn', onclick: () => { close(); d.tabs.forEach((t, i) => openUrl(t.url, i > 0)); } }, $t('Alle öffnen')) : null),
        d.tabs.length
          ? h('div', { class: 'rt-tabs' }, d.tabs.map((t) => h('button', { class: 'rt-tab', title: t.url, onclick: (e) => { close(); openUrl(t.url, e.ctrlKey || e.button === 1); } },
              faviconEl(t.url, 16), h('span', { 'data-no-i18n': '' }, t.title || t.url), h('small', {}, hostOf(t.url)))))
          : h('p', { class: 'rt-none' }, $t('Keine offenen Tabs')))));
    }
    render();
  }

  // ---------------------------------------------------------------------------
  // Aktionen
  // ---------------------------------------------------------------------------
  async function syncNow() {
    const s = await F.account.syncNow();
    acc = s; renderAll();
    if (s.lastError) toast(errorText(s.lastError), 'warning');
  }
  async function resendVerification() {
    const r = await F.account.resendVerification();
    toast(r.ok ? $t('Bestätigungs-E-Mail gesendet') : errorText(r.error), r.ok ? 'check' : 'warning');
  }
  async function signOut(skipConfirm = false) {
    if (!skipConfirm && !(await confirmDialog({
      title: $t('Abmelden?'),
      message: $t('Lesezeichen, Passwörter und Verlauf bleiben auf diesem PC. Sie werden nur nicht mehr synchronisiert.'),
      confirmLabel: $t('Abmelden')
    }))) return;
    await F.account.signOut();
    await refresh();
    toast($t('Abgemeldet'), 'logout');
  }
  function editName() {
    openForm({
      title: $t('Name ändern'), fields: [{ name: 'displayName', label: $t('Name'), value: acc.displayName }],
      onSubmit: async ({ displayName }) => { const r = await F.account.updateProfile({ displayName }); if (!r.ok) return errorText(r.error); refresh(); }
    });
  }
  function editDevice() {
    openForm({
      title: $t('Name dieses PCs'), description: $t('So erscheint dieser PC bei deinen synchronisierten Daten.'),
      fields: [{ name: 'deviceName', label: $t('Gerätename'), value: acc.deviceName }],
      onSubmit: async ({ deviceName }) => { const r = await F.account.updateProfile({ deviceName }); if (!r.ok) return errorText(r.error); refresh(); }
    });
  }
  function changePassword() {
    openForm({
      title: $t('Passwort ändern'),
      fields: [
        { name: 'current', label: $t('Aktuelles Passwort'), type: 'password' },
        { name: 'next', label: $t('Neues Passwort'), type: 'password' },
        { name: 'repeat', label: $t('Neues Passwort wiederholen'), type: 'password' }
      ],
      submitLabel: $t('Passwort ändern'),
      onSubmit: async ({ current, next, repeat }) => {
        if (next.length < 8) return errorText('WEAK_PASSWORD');
        if (next !== repeat) return $t('Die neuen Passwörter stimmen nicht überein.');
        const r = await F.account.changePassword({ current, next });
        if (!r.ok) return errorText(r.error);
        toast($t('Passwort geändert'), 'check');
      }
    });
  }
  function deleteAccount() {
    openForm({
      title: $t('Falcon-Konto löschen'),
      description: $t('Dein Konto und alle synchronisierten Daten werden endgültig vom Server gelöscht. Die Daten auf diesem PC bleiben erhalten. Zur Bestätigung gib dein Passwort ein.'),
      fields: [{ name: 'password', label: $t('Passwort'), type: 'password' }],
      submitLabel: $t('Endgültig löschen'),
      onSubmit: async ({ password }) => {
        const r = await F.account.deleteAccount({ password });
        if (!r.ok) return errorText(r.error);
        await refresh();
        toast($t('Dein Falcon-Konto wurde gelöscht'), 'trash');
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Einstellungen › Konto
  // ---------------------------------------------------------------------------
  function row(label, sub, control) {
    return h('div', { class: 's-row' }, h('div', { class: 's-label' }, h('b', {}, label), sub ? h('span', {}, sub) : null), control);
  }
  function renderSettings() {
    const root = $('#accountSettings');
    if (!root) return;
    if (acc.locked) {
      root.replaceChildren(h('div', { class: 's-card acc-signed-out' },
        h('img', { src: F.logoUrl, alt: '', width: 56, height: 56 }),
        h('div', {},
          h('b', {}, $t('Update erforderlich')),
          h('p', {}, $t('Falcon ist zu alt. Aktualisiere Falcon, um dein Konto wieder zu nutzen.'), ' ', acc.hadAccount ? $t('Danach bist du automatisch wieder angemeldet.') : ''),
          h('div', { class: 'acc-actions' }, h('button', { class: 'btn primary', onclick: () => { Settings.close(); Updates.updateNow(); } }, $t('Jetzt aktualisieren'))))));
      return;
    }
    if (!acc.signedIn) {
      root.replaceChildren(h('div', { class: 's-card acc-signed-out' },
        h('img', { src: F.logoUrl, alt: '', width: 56, height: 56 }),
        h('div', {},
          h('b', {}, $t('Falcon auf all deinen PCs')),
          h('p', {}, $t('Mit einem Falcon-Konto hast du Lesezeichen, Passwörter, Verlauf und Einstellungen auf jedem PC dabei. Alles wird auf deinem PC verschlüsselt, bevor es hochgeladen wird – nicht einmal der Server kann es lesen.')),
          h('div', { class: 'acc-actions' },
            h('button', { class: 'btn primary', onclick: () => authDialog('signup') }, $t('Konto erstellen')),
            h('button', { class: 'btn ghost', onclick: () => authDialog('signin') }, $t('Anmelden'))))));
      return;
    }

    const swatches = h('div', { class: 'swatches' }, [{ name: 'Wie Akzentfarbe', value: '' }, ...ACCENTS].map((a) => {
      const b = h('button', {
        class: `swatch${(state.settings.profileColor || '') === a.value ? ' sel' : ''}${a.value ? '' : ' auto'}`,
        title: $t(a.name), onclick: () => updateSettings({ profileColor: a.value }).then(renderAll)
      });
      b.style.setProperty('--c', a.value || state.settings.accent);
      return b;
    }));

    root.replaceChildren(
      h('div', { class: 's-card acc-profile' },
        avatar(56),
        h('div', { class: 'acc-id' },
          h('b', { 'data-no-i18n': '' }, acc.displayName || acc.email.split('@')[0]),
          h('span', { 'data-no-i18n': '' }, acc.email),
          acc.emailVerified
            ? h('span', { class: 'badge-ok' }, icon('check'), $t('E-Mail bestätigt'))
            : h('span', { class: 'badge-warn' }, $t('E-Mail nicht bestätigt'), ' · ', h('button', { class: 'link-btn', onclick: resendVerification }, $t('Erneut senden'))))),
      h('div', { class: 's-card' },
        row($t('Name'), acc.displayName || $t('Nicht festgelegt'), h('button', { class: 'btn ghost', onclick: editName }, $t('Ändern'))),
        row($t('Profilfarbe'), $t('Farbe deines Profilbilds.'), swatches),
        row($t('Dieser PC'), acc.deviceName, h('button', { class: 'btn ghost', onclick: editDevice }, $t('Umbenennen'))),
        row($t('FalCoins'), $t('Du bekommst einen FalCoin für jede Website, die du besuchst, solange du angemeldet bist.'),
          h('div', { class: 'acc-coin-row' },
            h('span', { class: 'acc-coins inline' }, h('span', { class: 'coin-ic' }, icon('coin')), h('b', {}, (acc.coins || 0).toLocaleString(I18N.locale))),
            h('button', { class: 'btn ghost', onclick: () => shopDialog() }, icon('shop'), $t('Shop'))))),

      h('h3', { class: 's-sub' }, $t('Synchronisierung')),
      h('div', { class: 's-card' },
        acc.needsKey ? h('div', { class: 's-row acc-warn' }, h('div', { class: 's-label' }, h('b', {}, $t('Sync-Daten gesperrt')), h('span', {}, $t('Nach einem Passwort-Reset müssen deine Sync-Daten einmal entsperrt werden.'))),
          h('button', { class: 'btn primary', onclick: unlockDialog }, $t('Entsperren'))) : null,
        h('div', { class: 's-row' }, h('div', { class: 's-label' }, h('b', {}, $t('Status')), syncLine()),
          h('button', { class: 'btn ghost', disabled: acc.syncing || acc.needsKey, onclick: syncNow }, icon('sync'), $t('Jetzt synchronisieren'))),
        ...KINDS.map(([kind, label, ic]) => {
          const input = h('input', { type: 'checkbox' });
          input.checked = acc.kinds?.[kind] !== false;
          input.addEventListener('change', async () => { acc = await F.account.setKinds({ [kind]: input.checked }); renderAll(); });
          return h('div', { class: 's-row' },
            h('div', { class: 's-label s-label-icon' }, icon(ic), h('b', {}, $t(label))),
            h('label', { class: 'switch' }, input, h('span')));
        }),
        h('div', { class: 's-row acc-e2e' }, icon('lock'), h('span', {}, $t('Ende-zu-Ende-verschlüsselt: Deine Daten werden mit deinem Passwort geschützt, bevor sie deinen PC verlassen.')))),

      h('h3', { class: 's-sub' }, $t('Auf dem Handy')),
      h('div', { class: 's-card' },
        row($t('Lesezeichen auf dem Handy'), $t('Öffne die Falcon-Web-App auf deinem Smartphone und melde dich an. Deine Lesezeichen und die Tabs deiner PCs werden erst auf dem Handy entschlüsselt.'),
          h('div', { class: 'acc-coin-row' },
            h('code', { class: 'mobile-url', 'data-no-i18n': '' }, MOBILE_URL.replace('https://', '')),
            h('button', { class: 'btn ghost', onclick: () => { F.copy(MOBILE_URL); toast($t('Link kopiert'), 'copy'); } }, icon('copy'), $t('Kopieren')),
            h('button', { class: 'btn', onclick: () => { Settings.close(); openUrl(MOBILE_URL); } }, icon('external'), $t('Besuchen'))))),

      h('h3', { class: 's-sub' }, $t('Sicherheit')),
      h('div', { class: 's-card' },
        row($t('Passwort'), $t('Ändert auch den Schlüssel deiner Sync-Daten.'), h('button', { class: 'btn ghost', onclick: changePassword }, $t('Passwort ändern'))),
        row($t('Abmelden'), $t('Deine Daten bleiben auf diesem PC.'), h('button', { class: 'btn ghost', onclick: () => signOut() }, icon('logout'), $t('Abmelden'))),
        row($t('Konto löschen'), $t('Löscht dein Konto und alle Daten auf dem Server.'), h('button', { class: 'btn ghost danger-text', onclick: deleteAccount }, $t('Konto löschen'))))
    );
  }

  function renderAll() {
    renderButton();
    if (Settings.section === 'account') renderSettings();
    openPop(true);
  }
  async function refresh() { acc = await F.account.state(); renderAll(); }

  if (INCOGNITO) btn.classList.add('hidden');
  btn.addEventListener('click', () => (pop && Popover.isOpen(pop) ? closePop() : openPop()));
  F.on('account-changed', (s) => {
    const expired = !s.signedIn && s.lastError === 'SESSION_EXPIRED' && acc.signedIn;
    acc = s; renderAll();
    if (expired) toast(errorText('SESSION_EXPIRED'), 'warning', { label: $t('Anmelden'), onClick: () => authDialog('signin') });
  });
  on('settings', () => { renderButton(); if (Settings.section === 'account') renderSettings(); });
  if (!INCOGNITO) refresh(); else renderButton();
  // Relative Zeitangabe aktuell halten
  setInterval(() => { if (!acc.syncing) openPop(true); }, 30_000);

  // Eigene Tabs melden, wenn sich etwas ändert (der Hauptprozess wartet ohnehin eine Minute)
  const tabsDirty = debounce(() => { if (acc.signedIn && !INCOGNITO) F.account.dirty('tabs'); }, 5000);
  on('tabs-changed', tabsDirty);
  on('tab-loaded', tabsDirty);

  setTimeout(async () => {
    if (!INCOGNITO) acc = await F.account.state();
    if (!INCOGNITO && acc.signedIn) { showRefundNotices().catch(() => {}); checkPendingRefunds().catch(() => {}); }
    if (acc.signedIn && acc.daily?.available) toast($t('Deine tägliche Belohnung wartet: +{n} FalCoins', { n: acc.daily.next }), 'coin', { label: $t('Abholen'), onClick: () => claimDaily() });
  }, 8000);

  return { open: openPop, renderSettings, authDialog, refresh, remoteTabsDialog, loadRemoteTabs, openUrl, shopDialog, walletAdminDialog, rewardsDialog, historyDialog, refundDialog, get state() { return acc; } };
})();
