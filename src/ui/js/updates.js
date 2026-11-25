'use strict';
/* Update-Hinweis: Knopf in der Symbolleiste, Popover und Status in „Über Falcon“ */

const Updates = (() => {
  const btn = $('#updateBtn');
  const pop = $('#updatePop');
  let status = { state: 'idle' };
  let announced = null;
  let requestedHere = false;  // Download in diesem Fenster gestartet → danach automatisch neu starten
  let countdown = null;       // { left, timer }
  const RESTART_AFTER = 5;

  function statusText(s) {
    switch (s.state) {
      case 'checking': return $t('Suche nach Updates …');
      case 'latest': return $t('Falcon ist auf dem neuesten Stand.');
      case 'available': return $t('Version {v} ist verfügbar.', { v: s.available });
      case 'downloading': return $t('Update wird heruntergeladen … {p} %', { p: s.percent || 0 });
      case 'downloaded': return $t('Update ist bereit. Falcon installiert es beim nächsten Neustart automatisch.');
      case 'error': return $t('Updates konnten nicht geprüft werden.');
      case 'unconfigured': return $t('Updates sind noch nicht mit GitHub verknüpft.');
      case 'dev': return $t('In der Entwicklungsversion werden keine Updates gesucht.');
      default: return '';
    }
  }

  // „Was ist neu?“ – Daten aus release-notes.js; nur Textknoten, **fett** und `Code`
  const KIND = { added: 'Neu', changed: 'Geändert', fixed: 'Behoben' };
  function inline(text) {
    return String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/).filter(Boolean).map((part) => (
      /^\*\*[^*]+\*\*$/.test(part) ? h('b', {}, part.slice(2, -2))
        : /^`[^`]+`$/.test(part) ? h('code', {}, part.slice(1, -1))
          : part.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')));
  }
  function dateText(iso) {
    const d = new Date(`${iso}T12:00:00`);
    return iso && !isNaN(d) ? d.toLocaleDateString(I18N.locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  }
  let shownNotes = '';
  function renderNotes(notes) {
    const box = $('#upNotes');
    const list = Array.isArray(notes) ? notes : [];
    const key = list.length ? JSON.stringify([I18N.locale, list]) : '';
    box.classList.toggle('hidden', !key);
    if (key === shownNotes) return; // beim Download-Fortschritt nicht neu aufbauen (Scrollposition bleibt)
    shownNotes = key;
    box.replaceChildren(...list.map((n) => h('section', { class: 'up-ver' },
      list.length > 1 && h('h4', {}, n.version, h('span', {}, dateText(n.date))),
      n.groups.map((g) => h('div', { class: `up-group ${g.kind}` },
        KIND[g.kind] && h('h5', {}, $t(KIND[g.kind])),
        h('ul', {}, g.items.map((i) => h('li', { class: i.sub ? 'sub' : null }, inline(i.text)))))))));
    box.scrollTop = 0;
  }
  // Der Text kann nachladen, während das Fenster schon offen ist – nicht unter den Rand rutschen
  function keepInside() {
    if (!Popover.isOpen(pop)) return;
    const r = pop.getBoundingClientRect();
    if (r.bottom > innerHeight - 8) pop.style.top = `${Math.round(Math.max(8, innerHeight - r.height - 8))}px`;
  }

  function renderPop() {
    const s = status;
    $('#upTitle').textContent = s.state === 'downloaded' ? $t('Update bereit') : $t('Falcon {v} ist verfügbar', { v: s.available || '' });
    $('#upCurrent').textContent = $t('Installiert: {v}', { v: F.version });
    renderNotes(s.notes);
    const prog = $('#upProgress');
    prog.classList.toggle('hidden', s.state !== 'downloading');
    prog.firstElementChild.style.width = `${s.percent || 0}%`;
    const hint = $('#upHint');
    hint.classList.toggle('hidden', !(s.portable || s.state === 'downloading' || s.state === 'downloaded'));
    hint.textContent = s.portable
      ? $t('Diese Version kann sich nicht selbst aktualisieren. Lade die neue Version von falconbrowser.de herunter.')
      : s.state === 'downloaded' && s.linux
        ? (countdown
          ? $t('Falcon startet in {n} s neu und installiert das Update. Linux fragt dafür einmal nach deinem Passwort. Deine Tabs bleiben erhalten.', { n: countdown.left })
          : $t('Beim Neustart installiert Falcon das Update – Linux fragt dafür einmal nach deinem Passwort. Mit „Später“ wird es beim Schließen von Falcon installiert.'))
      : s.state === 'downloaded'
        ? (countdown
          ? $t('Falcon startet in {n} s neu, installiert das Update im Hintergrund und öffnet sich danach wieder. Deine Tabs bleiben erhalten.', { n: countdown.left })
          : $t('Falcon installiert das Update im Hintergrund und öffnet sich danach wieder. Mit „Später“ wird es beim Schließen von Falcon installiert.'))
        : statusText(s);
    const action = $('#upAction');
    action.disabled = s.state === 'downloading';
    action.textContent = s.state === 'downloaded' ? (countdown ? $t('Jetzt neu starten') : $t('Neu starten und aktualisieren'))
      : s.portable ? $t('Von falconbrowser.de herunterladen')
      : s.state === 'downloading' ? $t('Wird heruntergeladen …')
      : $t('Herunterladen');
    keepInside();
  }

  function stopCountdown() {
    if (!countdown) return;
    clearInterval(countdown.timer);
    countdown = null;
    if (Popover.isOpen(pop)) renderPop();
  }
  function install() {
    stopCountdown();
    F.updates.install();
  }
  // Nach dem Download kurz Bescheid geben, dann automatisch neu starten
  function startCountdown() {
    if (countdown) return;
    countdown = { left: RESTART_AFTER };
    countdown.timer = setInterval(() => {
      countdown.left--;
      if (countdown.left <= 0) return install();
      if (Popover.isOpen(pop)) renderPop();
    }, 1000);
    open();
  }

  function render() {
    renderLock();
    const show = ['available', 'downloading', 'downloaded'].includes(status.state) || status.required;
    btn.classList.toggle('hidden', !show);
    btn.classList.toggle('ready', status.state === 'downloaded');
    btn.title = statusText(status);
    $('#upStatus').textContent = statusText(status) || $t('Version {v}', { v: F.version });
    $('#upCheck').disabled = ['checking', 'downloading', 'dev', 'unconfigured'].includes(status.state);
    if (Popover.isOpen(pop)) renderPop();
    if (status.state === 'downloaded' && requestedHere) { requestedHere = false; startCountdown(); }
    if (status.state === 'available' && announced !== status.available) {
      announced = status.available;
      // Kurz warten, bis die Oberfläche steht, dann den Hinweis gut sichtbar öffnen
      setTimeout(() => { if (!status.required && !Popover.current && !Settings.isOpen()) open(); }, 600);
    }
  }

  function open() {
    renderPop();
    Popover.open(pop, { anchor: btn.classList.contains('hidden') ? $('#menuBtn') : btn, align: 'end' });
    $('#upNotes').scrollTop = 0;
  }

  btn.addEventListener('click', () => (Popover.isOpen(pop) ? Popover.close() : open()));
  $('#upLater').addEventListener('click', () => {
    if (countdown) toast($t('Das Update wird installiert, wenn du Falcon schließt.'), 'download');
    stopCountdown();
    Popover.close();
  });
  $('#upAction').addEventListener('click', () => {
    if (status.state === 'downloaded') return install();
    if (status.portable && status.url) { Popover.close(); Tabs.create(status.url); return; }
    if (status.state === 'available') { requestedHere = true; F.updates.download(); return; }
    if (status.required && status.state !== 'downloading') updateNow();
  });
  $('#upCheck').addEventListener('click', async () => {
    status = await F.updates.check();
    render();
    if (status.state === 'latest') toast($t('Falcon ist auf dem neuesten Stand.'), 'check');
  });

  // Pflicht-Update: Ab zwei Versionen Rückstand sind Konto und Zusatzfunktionen gesperrt, bis aktualisiert wird
  let gate = null;
  let gateShown = false;
  async function updateNow() {
    if (status.state === 'downloaded') return install();
    if (status.portable && status.url) { Tabs.create(status.url); return; }
    if (!['available', 'downloading'].includes(status.state)) { status = await F.updates.check(); render(); }
    if (status.state === 'available') F.updates.download();
    requestedHere = true;
    open();
  }
  function showRequired() {
    gateShown = true;
    if (gate?.isConnected) return;
    let close = () => {};
    const box = gate = h('div', { class: 'dialog update-required', role: 'alertdialog' },
      h('div', { class: 'dialog-body' },
        h('span', { class: 'restore-icon' }, icon('download')),
        h('h3', {}, $t('Update erforderlich')),
        h('p', {}, $t('Falcon {v} ist {n} Versionen veraltet. Bis du aktualisierst, sind dein Falcon-Konto, Game Mode, Akzentfarbe, RGB-Modus, Wunschliste und das Übersetzen gesperrt.', { v: F.version, n: status.behind })),
        h('p', {}, $t('Nach dem Update ist alles wieder da und du bist automatisch wieder angemeldet.'))),
      h('div', { class: 'dialog-foot' },
        h('button', { class: 'btn ghost', onclick: () => close() }, $t('Eingeschränkt weitersurfen')),
        h('button', { class: 'btn primary', onclick: () => { close(); updateNow(); } }, $t('Jetzt aktualisieren'))));
    close = dialogShell(box);
    box.querySelector('.btn.primary').focus();
  }
  /** Gesperrt? Dann den Hinweis zeigen und true zurückgeben */
  function blocked() {
    if (!status.required) return false;
    showRequired();
    return true;
  }
  function renderLock() {
    btn.classList.toggle('required', !!status.required);
    if (!status.required) { gateShown = false; return; }
    if (!gateShown && !F.detached && !INCOGNITO) { gateShown = true; setTimeout(() => { if (status.required) showRequired(); }, 1200); }
  }

  F.on('update-status', (s) => { status = s; render(); });
  on('settings', () => render());
  F.updates.status().then((s) => { status = s; render(); });

  return { open, blocked, updateNow, get required() { return !!status.required; }, get behind() { return status.behind || 0; } };
})();
