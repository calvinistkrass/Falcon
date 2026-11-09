'use strict';
/* Update-Hinweis: Knopf in der Symbolleiste, Popover und Status in „Über Falcon“ */

const Updates = (() => {
  const btn = $('#updateBtn');
  const pop = $('#updatePop');
  let status = { state: 'idle' };
  let announced = null;

  function statusText(s) {
    switch (s.state) {
      case 'checking': return $t('Suche nach Updates …');
      case 'latest': return $t('Falcon ist auf dem neuesten Stand.');
      case 'available': return $t('Version {v} ist verfügbar.', { v: s.available });
      case 'downloading': return $t('Update wird heruntergeladen … {p} %', { p: s.percent || 0 });
      case 'downloaded': return $t('Update ist bereit. Starte Falcon neu, um es zu installieren.');
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
    hint.classList.toggle('hidden', !(s.portable || s.state === 'downloading'));
    hint.textContent = s.portable
      ? $t('Die portable Version kann sich nicht selbst aktualisieren. Lade die neue Datei von GitHub herunter.')
      : statusText(s);
    const action = $('#upAction');
    action.disabled = s.state === 'downloading';
    action.textContent = s.state === 'downloaded' ? $t('Neu starten und aktualisieren')
      : s.portable ? $t('Auf GitHub öffnen')
      : s.state === 'downloading' ? $t('Wird heruntergeladen …')
      : $t('Herunterladen');
  }

  function render() {
    const show = ['available', 'downloading', 'downloaded'].includes(status.state);
    btn.classList.toggle('hidden', !show);
    btn.classList.toggle('ready', status.state === 'downloaded');
    btn.title = statusText(status);
    $('#upStatus').textContent = statusText(status) || $t('Version {v}', { v: F.version });
    $('#upCheck').disabled = ['checking', 'downloading', 'dev', 'unconfigured'].includes(status.state);
    if (Popover.isOpen(pop)) renderPop();
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
  $('#upLater').addEventListener('click', () => Popover.close());
  $('#upAction').addEventListener('click', () => {
    if (status.state === 'downloaded') return F.updates.install();
    if (status.portable && status.url) { Popover.close(); Tabs.create(status.url); return; }
    if (status.state === 'available') F.updates.download();
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
