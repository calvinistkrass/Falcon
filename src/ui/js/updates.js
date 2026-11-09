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

  function renderPop() {
    const s = status;
    $('#upTitle').textContent = s.state === 'downloaded' ? $t('Update bereit') : $t('Falcon {v} ist verfügbar', { v: s.available || '' });
    $('#upCurrent').textContent = $t('Installiert: {v}', { v: F.version });
    const notes = $('#upNotes');
    notes.textContent = s.notes || '';
    notes.classList.toggle('hidden', !s.notes);
    const prog = $('#upProgress');
    prog.classList.toggle('hidden', s.state !== 'downloading');
    prog.firstElementChild.style.width = `${s.percent || 0}%`;
    const hint = $('#upHint');
    hint.classList.toggle('hidden', !(s.portable || s.state === 'downloading' || s.state === 'downloaded'));
    hint.textContent = s.portable
      ? $t('Die portable Version kann sich nicht selbst aktualisieren. Lade die neue Datei von GitHub herunter.')
      : s.state === 'downloaded'
        ? (countdown
          ? $t('Falcon startet in {n} s neu, installiert das Update im Hintergrund und öffnet sich danach wieder. Deine Tabs bleiben erhalten.', { n: countdown.left })
          : $t('Falcon installiert das Update im Hintergrund und öffnet sich danach wieder. Mit „Später“ wird es beim Schließen von Falcon installiert.'))
        : statusText(s);
    const action = $('#upAction');
    action.disabled = s.state === 'downloading';
    action.textContent = s.state === 'downloaded' ? (countdown ? $t('Jetzt neu starten') : $t('Neu starten und aktualisieren'))
      : s.portable ? $t('Auf GitHub öffnen')
      : s.state === 'downloading' ? $t('Wird heruntergeladen …')
      : $t('Herunterladen');
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
    const show = ['available', 'downloading', 'downloaded'].includes(status.state);
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
      setTimeout(() => { if (!Popover.current && !Settings.isOpen()) open(); }, 600);
    }
  }

  function open() {
    renderPop();
    Popover.open(pop, { anchor: btn.classList.contains('hidden') ? $('#menuBtn') : btn, align: 'end' });
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
    if (status.state === 'available') { requestedHere = true; F.updates.download(); }
  });
  $('#upCheck').addEventListener('click', async () => {
    status = await F.updates.check();
    render();
    if (status.state === 'latest') toast($t('Falcon ist auf dem neuesten Stand.'), 'check');
  });

  F.on('update-status', (s) => { status = s; render(); });
  on('settings', () => render());
  F.updates.status().then((s) => { status = s; render(); });

  return { open };
})();
