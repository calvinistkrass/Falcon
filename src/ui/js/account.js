'use strict';
/* Falcon-Konto: Profil-Symbol, Anmeldung, Profileinstellungen und Sync-Status */

const Account = (() => {
  const btn = $('#profileBtn');
  let acc = { signedIn: false };
  let pop = null;

  const KINDS = [
    ['bookmarks', 'Lesezeichen', 'bookmark'],
    ['passwords', 'Passwörter', 'key'],
    ['history', 'Verlauf', 'clock'],
    ['settings', 'Einstellungen', 'sliders']
  ];
  const ERRORS = {
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
  function renderButton() {
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
    if (acc.syncing) return h('span', { class: 'sync-line' }, h('span', { class: 'spinner sm' }), $t('Wird synchronisiert …'));
    if (acc.lastError) return h('span', { class: 'sync-line err' }, icon('warning'), errorText(acc.lastError));
    return h('span', { class: 'sync-line ok' }, icon('check'), $t('Synchronisiert · {when}', { when: ago(acc.lastSync) }));
  }

  // ---------------------------------------------------------------------------
  // Kontomenü
  // ---------------------------------------------------------------------------
  function closePop() { if (pop && Popover.isOpen(pop)) Popover.close(); }
  function openPop() {
    pop?.remove();
    const body = acc.signedIn
      ? [
          h('div', { class: 'acc-head' }, avatar(44),
            h('div', { class: 'acc-id' }, h('b', { 'data-no-i18n': '' }, acc.displayName || acc.email.split('@')[0]), h('span', { 'data-no-i18n': '' }, acc.email))),
          !acc.emailVerified ? h('div', { class: 'acc-note' }, icon('info'),
            h('span', {}, $t('Bitte bestätige deine E-Mail-Adresse.')),
            h('button', { class: 'link-btn', onclick: resendVerification }, $t('Erneut senden'))) : null,
          acc.needsKey ? h('button', { class: 'acc-note err', onclick: () => { closePop(); unlockDialog(); } }, icon('warning'), h('span', {}, $t('Deine Sync-Daten sind gesperrt. Hier entsperren.'))) : null,
          h('div', { class: 'acc-sync' }, syncLine(),
            h('button', { class: 'tb-btn sm', title: $t('Jetzt synchronisieren'), disabled: acc.syncing || acc.needsKey, onclick: syncNow }, icon('sync'))),
          h('div', { class: 'menu-sep' }),
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
    pop = h('section', { class: 'pop account-pop' }, ...body);
    document.body.append(pop);
    const el = pop;
    Popover.open(el, { anchor: btn, onClose: () => { el.remove(); if (pop === el) pop = null; } });
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
      const r = mode === 'signup' ? await F.account.signUp(values) : await F.account.signIn(values);
      submit.disabled = false;
      setMode(mode);
      if (!r.ok) { error.textContent = errorText(r.error); return; }
      close();
      await refresh();
      if (mode === 'signup') toast($t('Willkommen bei Falcon! Wir haben dir eine E-Mail zur Bestätigung geschickt.'), 'check');
      else toast($t('Angemeldet als {email}', { email: values.email }), 'check');
      if (r.needsKey) unlockDialog();
    });
    setMode(mode);
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
      confirmDialog({ title: $t('Sync-Daten gesperrt'), message: $t('Bitte melde dich ab und noch einmal an, um deine Sync-Daten zu entsperren.'), confirmLabel: $t('Abmelden') })
        .then((ok) => { if (ok) signOut(true); });
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
        row($t('Dieser PC'), acc.deviceName, h('button', { class: 'btn ghost', onclick: editDevice }, $t('Umbenennen')))),

      h('h3', { class: 's-sub' }, $t('Synchronisierung')),
      h('div', { class: 's-card' },
        acc.needsKey ? h('div', { class: 's-row acc-warn' }, h('div', { class: 's-label' }, h('b', {}, $t('Sync-Daten gesperrt')), h('span', {}, $t('Nach einem Passwort-Reset müssen deine Sync-Daten einmal entsperrt werden.'))),
          h('button', { class: 'btn primary', onclick: unlockDialog }, $t('Entsperren'))) : null,
        h('div', { class: 's-row' }, h('div', { class: 's-label' }, h('b', {}, $t('Status')), syncLine()),
          h('button', { class: 'btn ghost', disabled: acc.syncing || acc.needsKey, onclick: syncNow }, icon('sync'), $t('Jetzt synchronisieren'))),
        ...KINDS.map(([kind, label, ic]) => {
          const input = h('input', { type: 'checkbox' });
          input.checked = !!acc.kinds?.[kind];
          input.addEventListener('change', async () => { acc = await F.account.setKinds({ [kind]: input.checked }); renderAll(); });
          return h('div', { class: 's-row' },
            h('div', { class: 's-label s-label-icon' }, icon(ic), h('b', {}, $t(label))),
            h('label', { class: 'switch' }, input, h('span')));
        }),
        h('div', { class: 's-row acc-e2e' }, icon('lock'), h('span', {}, $t('Ende-zu-Ende-verschlüsselt: Deine Daten werden mit deinem Passwort geschützt, bevor sie deinen PC verlassen.')))),

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
    if (pop && Popover.isOpen(pop)) openPop();
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
  setInterval(() => { if (pop && Popover.isOpen(pop) && !acc.syncing) openPop(); }, 30_000);

  return { open: openPop, renderSettings, authDialog, refresh, get state() { return acc; } };
})();
