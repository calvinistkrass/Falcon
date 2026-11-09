'use strict';
/* Passwörter: „Speichern?“-Abfrage und Verwaltung in den Einstellungen */

const Passwords = (() => {
  const key = $('#pwKey');
  const offer = $('#pwOffer');
  const queue = [];

  // -------------------------------------------------------------------------
  // Speichern-Abfrage
  // -------------------------------------------------------------------------
  function showOffer() {
    const o = queue[0];
    key.classList.toggle('hidden', !o);
    if (!o) { if (Popover.isOpen(offer)) Popover.close(); return; }
    $('#pwOfferTitle').textContent = o.update ? $t('Passwort aktualisieren?') : $t('Passwort speichern?');
    $('#pwOfferSite').textContent = hostOf(o.origin);
    $('#pwOfferUser').textContent = o.username || '—';
    $('#pwOfferSave').textContent = o.update ? $t('Aktualisieren') : $t('Speichern');
    Popover.open(offer, { anchor: key, align: 'end' });
  }

  function receive(o) {
    const same = queue.findIndex((x) => x.origin === o.origin && x.username === o.username);
    if (same >= 0) { F.passwords.answer(queue[same].id, 'no'); queue[same] = o; }
    else queue.push(o);
    showOffer();
  }

  async function answer(kind) {
    const o = queue.shift();
    if (o) {
      await F.passwords.answer(o.id, kind);
      if (kind === 'save') toast($t('Passwort für {host} gespeichert', { host: hostOf(o.origin) }), 'key');
      if (Settings.section === 'passwords') render();
    }
    showOffer();
  }

  key.addEventListener('click', () => (Popover.isOpen(offer) ? Popover.close() : showOffer()));
  $('#pwOfferClose').addEventListener('click', () => Popover.close());
  offer.querySelectorAll('[data-pw]').forEach((b) => b.addEventListener('click', () => answer(b.dataset.pw)));

  // -------------------------------------------------------------------------
  // Verwaltung
  // -------------------------------------------------------------------------
  const search = $('#pwSearch');
  const listEl = $('#pwList');

  /** Passwort im Klartext holen – der Hauptprozess fragt vorher Windows Hello ab. */
  async function reveal(id) {
    const p = await F.passwords.reveal(id);
    if (p == null) toast($t('Bestätigung abgebrochen'), 'key');
    return p;
  }

  function row(e) {
    const secret = h('span', { class: 'secret' }, '••••••••••');
    let shown = false;
    const eye = h('button', { class: 'tb-btn sm', title: $t('Passwort anzeigen') }, icon('eye'));
    eye.addEventListener('click', async () => {
      if (!shown) {
        const p = await reveal(e.id);
        if (p == null) return;
        secret.textContent = p;
      } else {
        secret.textContent = '••••••••••';
      }
      shown = !shown;
      eye.replaceChildren(icon(shown ? 'eyeOff' : 'eye'));
      eye.title = shown ? $t('Passwort verbergen') : $t('Passwort anzeigen');
    });
    const more = h('button', { class: 'tb-btn sm', title: $t('Weitere Aktionen') }, icon('more'));
    more.addEventListener('click', () => showMenu([
      { label: $t('Benutzername kopieren'), icon: 'copy', disabled: !e.username, onClick: () => { F.copy(e.username); toast($t('Benutzername kopiert'), 'copy'); } },
      { label: $t('Website öffnen'), icon: 'external', onClick: () => { Settings.close(); Tabs.create(e.origin); } },
      { label: $t('Bearbeiten …'), icon: 'edit', onClick: () => edit(e) },
      '-',
      { label: $t('Löschen'), icon: 'trash', danger: true, onClick: () => remove(e) }
    ], { anchor: more, align: 'end' }));

    return h('div', { class: 'list-row' },
      faviconEl(e.origin, 18),
      h('div', { class: 'list-main' }, h('b', {}, hostOf(e.origin)), h('span', {}, e.username || $t('Kein Benutzername'))),
      secret,
      h('div', { class: 'list-actions' },
        eye,
        h('button', {
          class: 'tb-btn sm', title: $t('Passwort kopieren'),
          onclick: async () => { const p = await reveal(e.id); if (p != null) { await F.copy(p); toast($t('Passwort kopiert'), 'copy'); } }
        }, icon('copy')),
        more));
  }

  async function render() {
    const { entries, encrypted, never } = await F.passwords.list();
    $('#pwWarn').classList.toggle('hidden', encrypted);
    const q = search.value.trim().toLowerCase();
    const shown = entries
      .filter((e) => !q || e.origin.toLowerCase().includes(q) || e.username.toLowerCase().includes(q))
      .sort((a, b) => hostOf(a.origin).localeCompare(hostOf(b.origin)) || a.username.localeCompare(b.username));

    if (!entries.length) {
      listEl.replaceChildren(h('div', { class: 'list-empty' }, h('b', {}, $t('Noch keine Passwörter gespeichert')),
        $t('Melde dich auf einer Website an oder importiere eine CSV-Datei aus deinem bisherigen Browser.')));
    } else if (!shown.length) {
      listEl.replaceChildren(h('div', { class: 'list-empty' }, $t('Keine Treffer für „{q}“', { q: search.value.trim() })));
    } else {
      listEl.replaceChildren(...shown.map(row));
    }

    $('#pwNeverWrap').classList.toggle('hidden', !never.length);
    $('#pwNever').replaceChildren(...never.map((origin) => h('div', { class: 'list-row' },
      faviconEl(origin, 18),
      h('div', { class: 'list-main' }, h('b', {}, hostOf(origin))),
      h('div', { class: 'list-actions' },
        h('button', { class: 'tb-btn sm', title: $t('Entfernen'), onclick: async () => { await F.passwords.removeNever(origin); render(); } }, icon('x'))))));
  }

  function edit(e) {
    openForm({
      title: $t('Passwort bearbeiten'),
      description: hostOf(e.origin),
      fields: [
        { name: 'username', label: $t('Benutzername'), value: e.username },
        { name: 'password', label: $t('Neues Passwort'), type: 'password', placeholder: $t('Leer lassen, um es nicht zu ändern') }
      ],
      onSubmit: async (d) => { await F.passwords.update(e.id, d); render(); }
    });
  }

  async function remove(e) {
    const ok = await confirmDialog({
      title: $t('Passwort löschen?'),
      message: $t('Das gespeicherte Passwort für {site} wird entfernt.', { site: hostOf(e.origin) + (e.username ? ` (${e.username})` : '') }),
      confirmLabel: $t('Löschen'),
      danger: true
    });
    if (!ok) return;
    await F.passwords.remove(e.id);
    toast($t('Passwort gelöscht'), 'trash');
    render();
  }

  function add() {
    const t = Tabs.active();
    const origin = t && /^https?:/.test(t.url) ? new URL(t.url).origin : '';
    openForm({
      title: $t('Passwort hinzufügen'),
      fields: [
        { name: 'url', label: $t('Website'), value: origin, placeholder: $t('z. B. store.steampowered.com') },
        { name: 'username', label: $t('Benutzername oder E-Mail') },
        { name: 'password', label: $t('Passwort'), type: 'password' }
      ],
      onSubmit: async (d) => {
        if (!d.url.trim()) return $t('Bitte gib die Website an.');
        if (!d.password) return $t('Bitte gib ein Passwort ein.');
        if (!(await F.passwords.add(d))) return $t('Diese Adresse ist ungültig.');
        render();
      }
    });
  }

  async function importCsv() {
    const r = await F.passwords.import();
    if (!r) return;
    if (r.error === 'auth') return toast($t('Bestätigung abgebrochen'), 'key');
    if (r.error) return toast(r.error, 'warning');
    const parts = [$t('{n} importiert', { n: r.added })];
    if (r.updated) parts.push($t('{n} aktualisiert', { n: r.updated }));
    if (r.skipped) parts.push($t('{n} übersprungen', { n: r.skipped }));
    toast($t('Passwörter: {list}', { list: parts.join(', ') }), 'key');
    render();
  }
  async function exportCsv() {
    const r = await F.passwords.export();
    if (!r) return;
    if (r.error === 'auth') return toast($t('Bestätigung abgebrochen'), 'key');
    toast($t('{n} Passwörter exportiert', { n: r.count }), 'upload');
  }

  search.addEventListener('input', debounce(render, 120));
  $('#pwAdd').addEventListener('click', add);
  $('#pwMore').addEventListener('click', (e) => showMenu([
    { label: $t('Passwörter importieren …'), icon: 'download', onClick: importCsv },
    { label: $t('Passwörter exportieren …'), icon: 'upload', onClick: exportCsv }
  ], { anchor: e.currentTarget, align: 'end' }));

  // -------------------------------------------------------------------------
  // Passkeys (iPhone, Android, Sicherheitsschlüssel)
  // -------------------------------------------------------------------------
  const PASSKEY_KINDS = {
    phone: { label: 'iPhone oder Android-Smartphone', icon: 'phone' },
    key: { label: 'Sicherheitsschlüssel', icon: 'usbKey' },
    device: { label: 'Dieser PC', icon: 'monitor' }
  };
  const fmtDate = (ms) => new Date(ms).toLocaleDateString(I18N.locale, { day: 'numeric', month: 'long', year: 'numeric' });

  async function renderPasskeys() {
    const keys = await F.passkeys.list();
    $('#pkList').replaceChildren(...keys.map((k) => {
      const kind = PASSKEY_KINDS[k.kind] || PASSKEY_KINDS.phone;
      const sub = [$t('Hinzugefügt am {date}', { date: fmtDate(k.created) })];
      if (k.lastUsed) sub.push($t('Zuletzt verwendet am {date}', { date: fmtDate(k.lastUsed) }));
      return h('div', { class: 'list-row' },
        h('span', { class: 'pk-icon' }, icon(kind.icon)),
        h('div', { class: 'list-main' }, h('b', {}, $t(kind.label)), h('span', {}, sub.join(' · '))),
        h('div', { class: 'list-actions' },
          h('button', { class: 'tb-btn sm', title: $t('Entfernen'), onclick: () => removePasskey(k) }, icon('trash'))));
    }));

    // Hinweis, wenn weder Passkey noch Windows Hello zur Verfügung stehen
    const available = keys.length > 0 || await F.authAvailable();
    const method = F.platform === 'win32' ? 'Windows Hello' : F.platform === 'darwin' ? 'Touch ID' : null;
    $('#pwAuthNoteText').textContent = method
      ? $t('{method} ist auf diesem Gerät nicht eingerichtet. Füge einen Passkey hinzu, zum Beispiel dein iPhone.', { method })
      : $t('Füge einen Passkey hinzu, damit der Schutz greift, zum Beispiel dein iPhone.');
    $('#pwAuthNote').classList.toggle('hidden', available || !state.settings.pwRequireAuth);
  }

  async function addPasskey() {
    const r = await F.passkeys.register();
    if (r.ok) toast($t('Passkey hinzugefügt'), 'key');
    else if (r.error === 'auth') toast($t('Bestätigung abgebrochen'), 'key');
    else if (r.error !== 'cancelled' && r.error !== 'busy') toast($t('Passkey wurde nicht hinzugefügt'), 'warning');
    renderPasskeys();
  }

  async function removePasskey(k) {
    const ok = await confirmDialog({
      title: $t('Passkey entfernen?'),
      message: $t('Mit diesem Passkey kannst du deine Passwörter danach nicht mehr entsperren.'),
      confirmLabel: $t('Entfernen'),
      danger: true
    });
    if (!ok) return;
    if (await F.passkeys.remove(k.id)) toast($t('Passkey entfernt'), 'trash');
    else toast($t('Bestätigung abgebrochen'), 'key');
    renderPasskeys();
  }

  $('#pkAdd').addEventListener('click', addPasskey);

  on('settings-section', (s) => { if (s === 'passwords') { search.value = ''; render(); renderPasskeys(); } });
  on('settings', () => { if (Settings.section === 'passwords') { render(); renderPasskeys(); } });

  // -------------------------------------------------------------------------
  // Ausfüllen anbieten (Liste unter dem Login-Feld)
  // -------------------------------------------------------------------------
  let fillMenu = null;

  // Starkes Passwort: 18 Zeichen aus allen Zeichenklassen, ohne leicht verwechselbare Zeichen
  const SETS = ['abcdefghijkmnopqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '-_!?#%+*.'];
  function randomIndex(n) {
    const max = Math.floor(0x100000000 / n) * n; // ohne Modulo-Verzerrung
    const buf = new Uint32Array(1);
    do crypto.getRandomValues(buf); while (buf[0] >= max);
    return buf[0] % n;
  }
  function generatePassword(length = 18) {
    const all = SETS.join('');
    const chars = SETS.map((s) => s[randomIndex(s.length)]);
    while (chars.length < length) chars.push(all[randomIndex(all.length)]);
    for (let i = chars.length - 1; i > 0; i--) { const j = randomIndex(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
    return chars.join('');
  }

  function menuPoint(wv, rect) {
    const box = wv.getBoundingClientRect();
    const zoom = (() => { try { return wv.getZoomFactor(); } catch { return 1; } })();
    return { point: { x: box.left + rect.x * zoom, y: box.top + (rect.y + rect.height) * zoom + 4 }, zoom };
  }

  // Vorschlag unter dem Passwortfeld. Ausgefüllt wird erst nach dem Klick auf „Verwenden“.
  function suggestPassword(wv, rect) {
    const { point, zoom } = menuPoint(wv, rect);
    let password = generatePassword();
    const value = h('code', { class: 'gen-value', 'data-no-i18n': '' }, password);
    const regen = h('button', {
      class: 'tb-btn sm', title: $t('Neu generieren'),
      onclick: (e) => { e.stopPropagation(); password = generatePassword(); value.textContent = password; wv.focus(); }
    }, icon('reload'));
    const card = h('div', { class: 'gen-card' },
      h('div', { class: 'gen-head' }, icon('key'), h('b', {}, $t('Sicheres Passwort vorschlagen'))),
      h('div', { class: 'gen-row' }, value, regen),
      h('p', {}, $t('Falcon speichert es, wenn du dich registrierst.')));
    fillMenu = showMenu([
      { element: card },
      '-',
      { label: $t('Vorgeschlagenes Passwort verwenden'), icon: 'check', onClick: () => { wv.send('pw-generated', password); wv.focus(); } }
    ], { point });
    fillMenu.classList.add('pw-fill', 'pw-gen');
    fillMenu.dataset.sticky = '';
    fillMenu.style.minWidth = `${Math.max(280, Math.round(rect.width * zoom))}px`;
    wv.focus();
  }

  function attachFill(wv) {
    let quietUntil = 0;
    wv.addEventListener('ipc-message', (e) => {
      if (e.channel === 'pw-fill-hide') { if (fillMenu && Popover.current?.el === fillMenu) Popover.close(); return; }
      if (e.channel === 'pw-generate-offer') {
        if (Date.now() < quietUntil || (!wv.classList.contains('active') && wv.closest('#views'))) return;
        if (fillMenu && Popover.current?.el === fillMenu && fillMenu.classList.contains('pw-gen')) return; // schon offen
        quietUntil = Date.now() + 300;
        suggestPassword(wv, (e.args[0] || {}).rect || { x: 0, y: 0, width: 0, height: 0 });
        return;
      }
      if (e.channel !== 'pw-fill-offer' || Date.now() < quietUntil) return;
      const { accounts, rect } = e.args[0] || {};
      if (!accounts?.length || !wv.classList.contains('active') && wv.closest('#views')) return;
      const box = wv.getBoundingClientRect();
      const zoom = (() => { try { return wv.getZoomFactor(); } catch { return 1; } })();
      const point = { x: box.left + rect.x * zoom, y: box.top + (rect.y + rect.height) * zoom + 4 };
      const id = wv.getWebContentsId();
      fillMenu = showMenu([
        { label: $t('Gespeichertes Passwort verwenden'), icon: 'key', disabled: true },
        ...accounts.map((a) => ({
          label: a.username || $t('Kein Benutzername'), icon: 'check',
          onClick: async () => { quietUntil = Date.now() + 1500; if (!(await F.passwords.fill(id, a.id))) toast($t('Passwort konnte nicht ausgefüllt werden'), 'warning'); else wv.focus(); }
        })),
        '-',
        { label: $t('Passwörter verwalten'), icon: 'settings', onClick: () => Settings.open('passwords') }
      ], { point });
      fillMenu.classList.add('pw-fill');
      fillMenu.dataset.sticky = ''; // bleibt offen, wenn der Fokus gleich zur Seite zurückgeht
      fillMenu.style.minWidth = `${Math.max(236, Math.round(rect.width * zoom))}px`;
      // Die Seite behält den Fokus, damit man normal weitertippen kann
      wv.focus();
    });
  }

  return { receive, render, attachFill, generatePassword };
})();
