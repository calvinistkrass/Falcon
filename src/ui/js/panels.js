'use strict';
/* Downloads, Leistung/Game Mode, Suche in Seite, Zoom, Bild-in-Bild, Menüs, Fehlerseite, Statusblase */

// ---------------------------------------------------------------------------
// Zoom (pro Website gemerkt, wie in Chrome)
// ---------------------------------------------------------------------------
const Zoom = (() => {
  const KEY = 'falcon.zoom';
  const FACTORS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
  const chip = $('#zoomChip');
  const perHost = store.get(KEY, {});

  const factorFor = (tab) => (tab && perHost[hostOf(tab.url)]) || 1;
  const percent = (f) => `${Math.round(f * 100)} %`;

  function apply(tab) {
    if (tab?.webview && tab.ready) tab.webview.setZoomFactor(factorFor(tab));
  }

  function set(factor, tab = Tabs.active()) {
    const host = tab && hostOf(tab.url);
    if (!host) return;
    if (Math.abs(factor - 1) < 0.001) delete perHost[host];
    else perHost[host] = factor;
    if (!INCOGNITO) store.set(KEY, perHost);
    for (const t of state.tabs) if (hostOf(t.url) === host) apply(t);
    updateChip();
  }

  function step(dir, tab = Tabs.active()) {
    const cur = factorFor(tab);
    let i = FACTORS.findIndex((f) => f >= cur - 0.001);
    if (i < 0) i = FACTORS.length - 1;
    if (FACTORS[i] > cur + 0.001 && dir > 0) i--;
    set(FACTORS[Math.max(0, Math.min(FACTORS.length - 1, i + dir))], tab);
  }

  function updateChip() {
    const f = factorFor(Tabs.active());
    chip.classList.toggle('hidden', Math.abs(f - 1) < 0.001);
    chip.textContent = percent(f);
  }

  chip.addEventListener('click', () => set(1));
  on('nav-state', updateChip);

  return { restore: apply, set, step, reset: () => set(1), current: () => factorFor(Tabs.active()), percent };
})();

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------
const Downloads = (() => {
  const btn = $('#downloadsBtn');
  const pop = $('#downloadsPop');
  const listEl = $('#dlList');
  const ring = btn.querySelector('.dl-ring');
  const circle = ring.querySelector('circle');
  const items = new Map();
  const RING = 100.5;

  const running = (d) => d.state === 'started' || d.state === 'progressing';

  function meta(d) {
    if (running(d) && d.paused) return `${$t('Pausiert')} · ${d.total ? $t('{done} von {total}', { done: formatBytes(d.received), total: formatBytes(d.total) }) : formatBytes(d.received)}`;
    if (running(d) && d.openWhenDone) return `${d.total ? $t('{done} von {total}', { done: formatBytes(d.received), total: formatBytes(d.total) }) : formatBytes(d.received)} · ${$t('Wird nach dem Download geöffnet')}`;
    if (running(d)) return d.total ? $t('{done} von {total}', { done: formatBytes(d.received), total: formatBytes(d.total) }) : formatBytes(d.received);
    if (d.state === 'completed') return `${formatBytes(d.total || d.received)} · ${hostOf(d.url) || $t('Fertig')}`;
    if (d.state === 'cancelled') return $t('Abgebrochen');
    return $t('Fehlgeschlagen');
  }

  function renderList() {
    if (!items.size) {
      listEl.replaceChildren(h('div', { class: 'dl-empty' }, $t('Keine Downloads in dieser Sitzung')));
      return;
    }
    listEl.replaceChildren(...[...items.values()].reverse().map((d) => {
      const ext = (d.name.match(/\.([a-z0-9]{1,5})$/i) || [])[1];
      const pct = d.total ? Math.min(100, (d.received / d.total) * 100) : 0;
      const done = d.state === 'completed';
      return h('div', {
        class: `dl-item${done ? ' done' : ''}${running(d) ? ' running' : ''}${d.openWhenDone ? ' open-when-done' : ''}`,
        title: done ? $t('Öffnen') : running(d) ? $t('Klicken: nach dem Download öffnen · Rechtsklick: weitere Aktionen') : '',
        onclick: (e) => { if (!e.target.closest('button')) primary(d); },
        oncontextmenu: (e) => { e.preventDefault(); e.stopPropagation(); itemMenu(d, e); }
      },
      h('div', { class: 'dl-file' }, icon('file'), ext ? h('small', {}, ext) : null),
      h('div', { class: 'dl-body' },
        h('div', { class: 'dl-name' }, d.name),
        running(d) ? h('div', { class: 'dl-bar' }, h('i', { style: { width: `${pct}%` } })) : null,
        h('div', { class: `dl-meta${d.state === 'interrupted' || d.state === 'failed' ? ' err' : ''}` }, meta(d))),
      h('div', { class: 'dl-actions' },
        running(d) ? h('button', { class: 'tb-btn sm', title: $t('Abbrechen'), onclick: () => F.cancelDownload(d.id) }, icon('x')) : null,
        done ? h('button', { class: 'tb-btn sm', title: $t('Im Ordner anzeigen'), onclick: () => F.showInFolder(d.path) }, icon('folder')) : null));
    }));
  }

  // Linksklick: fertige Downloads öffnen, laufende nach dem Download automatisch öffnen (erneut klicken = aus)
  function primary(d) {
    d = items.get(d.id) || d; // aktueller Stand, nicht der vom letzten Zeichnen
    if (d.state === 'completed') { F.openPath(d.path); return; }
    if (running(d)) F.downloadControl(d.id, 'open-when-done', !d.openWhenDone);
  }

  function forget(id) {
    items.delete(id);
    renderList();
    renderButton();
  }

  function itemMenu(d, e) {
    d = items.get(d.id) || d;
    const done = d.state === 'completed';
    const failed = d.state === 'cancelled' || d.state === 'interrupted' || d.state === 'failed';
    showMenu([
      running(d) ? { label: $t('Nach dem Download öffnen'), checked: !!d.openWhenDone, onClick: () => F.downloadControl(d.id, 'open-when-done', !d.openWhenDone) } : null,
      done ? { label: $t('Öffnen'), icon: 'external', onClick: () => F.openPath(d.path) } : null,
      done ? { label: $t('Im Ordner anzeigen'), icon: 'folder', onClick: () => F.showInFolder(d.path) } : null,
      running(d) && !d.paused ? { label: $t('Pausieren'), icon: 'pause', onClick: () => F.downloadControl(d.id, 'pause') } : null,
      running(d) && d.paused ? { label: $t('Fortsetzen'), icon: 'play', onClick: () => F.downloadControl(d.id, 'resume') } : null,
      failed ? { label: $t('Erneut herunterladen'), icon: 'reload', onClick: () => { F.downloadControl(d.id, 'retry'); forget(d.id); } } : null,
      '-',
      /^https?:/i.test(d.url) ? { label: $t('Downloadlink kopieren'), icon: 'link', onClick: () => { F.copy(d.url); toast($t('Adresse kopiert'), 'copy'); } } : null,
      { label: $t('Downloads-Ordner öffnen'), icon: 'folder', onClick: () => F.downloads.openDir() },
      { label: $t('Alle Downloads anzeigen'), icon: 'download', shortcut: kb('Strg+J'), onClick: () => openInternalPage(DOWNLOADS_URL) },
      '-',
      running(d) ? { label: $t('Abbrechen'), icon: 'x', danger: true, onClick: () => F.cancelDownload(d.id) } : null,
      !running(d) ? { label: $t('Aus der Liste entfernen'), icon: 'trash', onClick: () => forget(d.id) } : null
    ], { point: { x: e.clientX, y: e.clientY } });
  }

  function renderButton() {
    const active = [...items.values()].filter(running);
    ring.classList.toggle('hidden', !active.length);
    if (active.length) {
      const total = active.reduce((s, d) => s + (d.total || 0), 0);
      const recv = active.reduce((s, d) => s + d.received, 0);
      circle.style.strokeDashoffset = String(total ? RING * (1 - recv / total) : RING * 0.75);
    }
  }

  function update(d) {
    const prev = items.get(d.id);
    items.set(d.id, { ...prev, ...d });
    if (Popover.isOpen(pop) || !prev) renderList();
    renderButton();
    if (d.state === 'started') Popover.open(pop, { anchor: btn });
    if (d.state === 'completed' && !Popover.isOpen(pop)) {
      btn.classList.add('badge');
      toast($t('{name} wurde heruntergeladen', { name: d.name }), 'download', { label: $t('Öffnen'), onClick: () => F.openPath(d.path) });
    }
  }

  function toggle() {
    renderList();
    btn.classList.remove('badge');
    Popover.toggle(pop, { anchor: btn });
  }

  btn.addEventListener('click', toggle);
  $('#dlAll').addEventListener('click', () => { Popover.close(); openInternalPage(DOWNLOADS_URL); });
  $('#dlClear').addEventListener('click', () => {
    for (const [id, d] of items) if (!running(d)) items.delete(id);
    renderList();
  });
  renderList();

  return { update, toggle };
})();

// ---------------------------------------------------------------------------
// Leistung & Game Mode
// ---------------------------------------------------------------------------
const Perf = (() => {
  const btn = $('#perfBtn');
  const dot = btn.querySelector('.perf-dot');
  btn.prepend(icon('speed')); // nur ein Symbol – alle Werte stehen im Fenster dahinter
  const pop = $('#perfPop');
  const gameBtn = $('#gameBtn');
  const SAMPLES = 60;
  const cpu = [];
  const mem = [];
  let last = null;

  const fmtMem = (mb) => (mb >= 1024 ? `${(mb / 1024).toLocaleString(I18N.locale, { maximumFractionDigits: 1 })} GB` : `${mb} MB`);

  function draw(canvas, data, max, limit) {
    const dpr = devicePixelRatio || 1;
    const w = canvas.clientWidth, hgt = canvas.clientHeight;
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = hgt * dpr; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (const y of [0.5, hgt / 2, hgt - 0.5]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    if (data.length < 2) return;

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const step = w / (SAMPLES - 1);
    const x0 = w - (data.length - 1) * step;
    const y = (v) => hgt - 2 - (Math.min(v, max) / max) * (hgt - 6);

    ctx.beginPath();
    data.forEach((v, i) => (i ? ctx.lineTo(x0 + i * step, y(v)) : ctx.moveTo(x0, y(v))));
    const line = new Path2D();
    data.forEach((v, i) => (i ? line.lineTo(x0 + i * step, y(v)) : line.moveTo(x0, y(v))));
    ctx.lineTo(w, hgt); ctx.lineTo(x0, hgt); ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, hgt);
    grad.addColorStop(0, `${accent}55`);
    grad.addColorStop(1, `${accent}00`);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke(line);
    // RAM-Grenze als gestrichelte Linie
    if (limit) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(240, 88, 91, 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y(limit)); ctx.lineTo(w, y(limit)); ctx.stroke();
      ctx.restore();
    }
  }

  // ---- RAM-Limit: am längsten unbenutzte Tabs schlafen legen ----
  let lastEnforce = 0;
  let lastNotice = 0;
  function enforceRamLimit() {
    const limit = state.settings.ramLimit;
    if (!limit || !last || last.memMB <= limit || Date.now() - lastEnforce < 4000) return;
    const candidates = state.tabs
      .filter((t) => !Tabs.isShown(t) && !t.sleeping && !t.audible && t.webview)
      .sort((a, b) => a.lastActive - b.lastActive);
    if (!candidates.length) return;
    lastEnforce = Date.now();
    const tab = candidates[0];
    if (!Tabs.sleep(tab)) return;
    if (Date.now() - lastNotice > 60_000) {
      lastNotice = Date.now();
      toast($t('RAM-Grenze erreicht – „{title}“ schläft jetzt', { title: Tabs.displayTitle(tab) }), 'moon');
    }
  }

  function renderPop() {
    if (!last) return;
    $('#pCpu').textContent = `${Math.round(last.cpu)} %`;
    $('#pMem').textContent = fmtMem(last.memMB);
    $('#pProc').textContent = last.processes;
    $('#pTabs').textContent = state.tabs.filter((t) => !t.sleeping).length;
    $('#pSleep').textContent = state.tabs.filter((t) => t.sleeping || t.frozen).length;
    $('#pBlocked').textContent = last.blocked.toLocaleString(I18N.locale);
    $('#pGameDesc').textContent = $t('Pausiert Hintergrund-Tabs nach 30 Sekunden, legt sie nach {n} Min. schlafen und schaltet Animationen ab.', { n: state.settings.sleepMinutes || 10 });
    $('#pGame').checked = !!state.settings.gameMode;
    const lim = Number(state.settings.netLimit) || 0;
    const limOn = lim > 0 && (!state.settings.netLimitGameOnly || state.settings.gameMode);
    $('#pNetLimit').textContent = limOn ? $t('Netzwerk-Limiter aktiv: {n} Mbit/s', { n: lim }) : '';
    $('#pNetLimit').classList.toggle('hidden', !limOn);
    draw($('#cpuGraph'), cpu, Math.max(100, ...cpu));
    const limit = state.settings.ramLimit || 0;
    draw($('#memGraph'), mem, Math.max(Math.max(...mem) * 1.25, limit * 1.1) || 1, limit);
    $('#pMemLimit').textContent = limit ? $t('Grenze {n}', { n: fmtMem(limit) }) : '';
    renderTabList();
  }

  // Task-Manager: die größten Tabs mit Speicher und CPU, schlafen legen oder schließen
  async function renderTabList() {
    const box = $('#pTabList');
    const list = await F.tabMetrics().catch(() => []);
    const rows = [];
    for (const m of list) {
      const tab = state.tabs.find((t) => { try { return t.webview && t.webview.getWebContentsId() === m.id; } catch { return false; } });
      if (tab) rows.push({ tab, ...m });
    }
    rows.sort((a, b) => b.memMB - a.memMB);
    const asleep = state.tabs.filter((t) => t.sleeping).length;
    box.replaceChildren(...rows.slice(0, 8).map((r) => h('div', { class: 'perf-tab' },
      r.tab.favicon ? h('img', { src: r.tab.favicon, alt: '' }) : icon('globe'),
      h('span', { class: 'perf-tab-title', title: r.tab.url }, Tabs.displayTitle(r.tab), r.tab.frozen ? h('small', {}, ` · ${$t('Pausiert')}`) : null),
      h('span', { class: 'perf-tab-num', title: r.shared ? $t('Teilt sich den Prozess mit anderen Tabs derselben Website') : '' }, `${fmtMem(r.memMB)}${r.shared ? '*' : ''}`),
      h('span', { class: 'perf-tab-num cpu' }, `${Math.round(r.cpu)} %`),
      h('button', { class: 'tb-btn sm', title: $t('Schlafen legen'), disabled: Tabs.isShown(r.tab) || r.tab.audible, onclick: () => { Tabs.sleep(r.tab); renderTabList(); } }, icon('moon')),
      h('button', { class: 'tb-btn sm', title: $t('Schließen'), onclick: () => { Tabs.close(r.tab.id); renderTabList(); } }, icon('x')))),
      asleep ? h('p', { class: 'perf-tab-note' }, $t('{n} schlafende Tabs brauchen keinen Speicher.', { n: asleep })) : null);
  }

  // Automatischer Game Mode: Spiel im Vollbild erkannt (Windows)
  let autoGame = false;
  F.on('game-detected', ({ game }) => {
    if (INCOGNITO || F.detached || state.settings.autoGameMode === false || Updates.required) return;
    if (game && !state.settings.gameMode) { autoGame = true; setGameMode(true).then(() => toast($t('Spiel erkannt – Game Mode an'), 'gamepad')); }
    else if (!game && autoGame) { autoGame = false; if (state.settings.gameMode) setGameMode(false); }
  });

  async function tick() {
    const open = Popover.isOpen(pop);
    if (!state.settings.showHud && !open && !state.settings.ramLimit) return;
    try { last = await F.metrics(); } catch { return; }
    cpu.push(last.cpu); mem.push(last.memMB);
    if (cpu.length > SAMPLES) { cpu.shift(); mem.shift(); }
    dot.className = `perf-dot${last.cpu > 85 ? ' crit' : last.cpu > 50 ? ' warn' : ''}`;
    enforceRamLimit();
    if (open) renderPop();
  }

  async function setGameMode(enabled) {
    if (enabled && Updates.blocked()) {
      emit('settings', state.settings); // Schalter zurücksetzen
      if (Popover.isOpen(pop)) renderPop();
      return;
    }
    await updateSettings({ gameMode: enabled });
    if (enabled) {
      toast($t('Game Mode an – inaktive Tabs schlafen nach {n} Min.', { n: state.settings.sleepMinutes }), 'gamepad');
    } else {
      toast($t('Game Mode aus'), 'gamepad');
    }
  }

  btn.addEventListener('click', () => { Popover.toggle(pop, { anchor: btn }); renderPop(); });
  gameBtn.addEventListener('click', () => setGameMode(!state.settings.gameMode));
  $('#pGame').addEventListener('change', (e) => setGameMode(e.target.checked));
  $('#pSleepNow').addEventListener('click', () => {
    const n = Tabs.sleepInactive(0);
    toast(n === 0 ? $t('Keine inaktiven Tabs') : n === 1 ? $t('1 Tab schlafen gelegt') : $t('{n} Tabs schlafen gelegt', { n }), 'moon');
    renderPop();
  });

  on('settings', (s) => {
    btn.classList.toggle('hidden', !s.showHud);
    btn.classList.toggle('game', !!s.gameMode);
    gameBtn.classList.toggle('on', !!s.gameMode);
    gameBtn.title = s.gameMode ? $t('Game Mode ist an (Strg+Umschalt+G)') : $t('Game Mode (Strg+Umschalt+G)');
    document.body.classList.toggle('gamemode', !!s.gameMode);
  });
  F.on('blocked-count', (n) => { if (last) last.blocked = n; });
  setInterval(tick, 1000);
  tick();

  return { setGameMode };
})();

// ---------------------------------------------------------------------------
// Suche in Seite
// ---------------------------------------------------------------------------
const Find = (() => {
  const bar = $('#findbar');
  const input = $('#findInput');
  const count = $('#findCount');
  let lastQuery = '';

  const webview = () => { const t = Tabs.active(); return t?.ready ? t.webview : null; };

  function open() {
    bar.classList.remove('hidden');
    input.focus();
    input.select();
    if (input.value) run(true);
  }
  function close() {
    if (bar.classList.contains('hidden')) return;
    bar.classList.add('hidden');
    count.textContent = '';
    lastQuery = '';
    webview()?.stopFindInPage('keepSelection');
  }
  function run(forward = true) {
    const wv = webview();
    const q = input.value;
    if (!wv) return;
    if (!q) { wv.stopFindInPage('clearSelection'); count.textContent = ''; count.classList.remove('none'); lastQuery = ''; return; }
    wv.findInPage(q, { forward, findNext: q !== lastQuery });
    lastQuery = q;
  }

  input.addEventListener('input', () => run(true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); run(!e.shiftKey); }
    if (e.key === 'Escape') { e.stopPropagation(); close(); Tabs.active()?.webview?.focus(); }
  });
  $('#findNext').addEventListener('click', () => run(true));
  $('#findPrev').addEventListener('click', () => run(false));
  $('#findClose').addEventListener('click', close);

  on('find-result', (r) => {
    if (!r.finalUpdate) return;
    count.textContent = r.matches ? `${r.activeMatchOrdinal}/${r.matches}` : '0/0';
    count.classList.toggle('none', !r.matches);
  });
  on('tab-activated', close);

  return { open, close };
})();

// ---------------------------------------------------------------------------
// Bild-in-Bild
// ---------------------------------------------------------------------------
async function togglePictureInPicture() {
  const t = Tabs.active();
  if (!t?.ready) return;
  const result = await t.webview.executeJavaScript(`(async () => {
    if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return 'off'; }
    const videos = [...document.querySelectorAll('video')].filter((v) => v.readyState > 0 && !v.disablePictureInPicture);
    if (!videos.length) return 'none';
    videos.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
    await videos[0].requestPictureInPicture();
    return 'on';
  })()`, true).catch(() => 'none');
  if (result === 'none') toast($t('Auf dieser Seite läuft kein Video'), 'pip');
}
$('#pipBtn').addEventListener('click', togglePictureInPicture);

// ---------------------------------------------------------------------------
// Hauptmenü (⋮)
// ---------------------------------------------------------------------------
function openAppMenu() {
  const t = Tabs.active();
  const ready = !!t?.ready;
  const out = h('output', {}, Zoom.percent(Zoom.current()));
  const zoomBtn = (name, title, fn) => h('button', { class: 'tb-btn', title, onclick: (e) => { e.stopPropagation(); fn(); out.textContent = Zoom.percent(Zoom.current()); } }, icon(name));
  const zoomRow = h('div', { class: 'menu-zoom' },
    h('span', { class: 'menu-label' }, icon('zoom'), $t('Zoom')),
    zoomBtn('minus', $t('Verkleinern (Strg+-)'), () => Zoom.step(-1)),
    out,
    zoomBtn('plus', $t('Vergrößern (Strg++)'), () => Zoom.step(1)),
    zoomBtn('maximize', $t('Vollbild (F11)'), () => { Popover.close(); F.win('fullscreen'); }));

  showMenu([
    { label: $t('Neuer Tab'), icon: 'plus', shortcut: kb('Strg+T'), onClick: () => Tabs.create() },
    { label: $t('Neues Inkognito-Fenster'), icon: 'incognito', shortcut: kb('Strg+Umschalt+N'), onClick: () => F.newIncognitoWindow() },
    { label: $t('Geschlossenen Tab öffnen'), icon: 'restore', shortcut: kb('Strg+Umschalt+T'), disabled: !Tabs.closedCount, onClick: () => Tabs.reopen() },
    '-',
    { label: $t('Verlauf'), icon: 'clock', shortcut: kb('Strg+H'), onClick: () => Settings.open('history') },
    { label: $t('Downloads'), icon: 'download', shortcut: kb('Strg+J'), onClick: () => openInternalPage(DOWNLOADS_URL) },
    { label: $t('Lesezeichen'), icon: 'bookmark', onClick: () => Settings.open('bookmarks') },
    { label: $t('Passwörter'), icon: 'key', onClick: () => Settings.open('passwords') },
    !INCOGNITO && Account.state.signedIn ? { label: $t('Tabs von anderen PCs'), icon: 'devices', onClick: () => Account.remoteTabsDialog() } : null,
    '-',
    { element: zoomRow },
    '-',
    { label: $t('Als Overlay öffnen'), icon: 'pip', disabled: !t || !/^https?:/.test(t.url), onClick: () => F.openOverlay(t.url) },
    { label: $t('Auf Seite suchen …'), icon: 'search', shortcut: kb('Strg+F'), disabled: !ready, onClick: () => Find.open() },
    { label: $t('Drucken …'), icon: 'printer', shortcut: kb('Strg+P'), disabled: !ready, onClick: () => t.webview.print() },
    { label: $t('Entwicklertools'), icon: 'code', shortcut: kb('F12'), disabled: !ready, onClick: () => t.webview.openDevTools() },
    '-',
    { label: $t('Screenshot …'), icon: 'scissors', shortcut: kb('Strg+Umschalt+S'), disabled: !ready, onClick: () => Screenshot.menu() },
    { label: $t('Fehler melden …'), icon: 'bug', onClick: () => Report.open() },
    { label: $t('Gemeldete Fehler'), icon: 'bug', onClick: () => openInternalPage('falcon://reports/') },
    { label: $t('Einstellungen'), icon: 'settings', shortcut: kb('Strg+,'), onClick: () => Settings.open() },
    { label: $t('Über Falcon'), icon: 'info', onClick: () => Settings.open('about') }
  ], { anchor: $('#menuBtn'), align: 'end' });
}
$('#menuBtn').addEventListener('click', () => {
  if (Popover.current?.anchor === $('#menuBtn')) Popover.close(); else openAppMenu();
});

// ---------------------------------------------------------------------------
// Kontextmenü in Webseiten (Hauptprozess liefert die Daten)
// ---------------------------------------------------------------------------
function webviewByContentsId(id) {
  for (const wv of $$('webview')) {
    try { if (wv.getWebContentsId() === id) return wv; } catch { /* noch nicht bereit */ }
  }
  return null;
}

/** Lädt ein Bild, wandelt es in PNG um (auch WebP, AVIF, SVG, GIF) und legt es in die Zwischenablage. */
async function copyImage(src) {
  let objectUrl = null;
  try {
    const r = await F.fetchImage(src);
    if (!r) throw new Error('fetch');
    objectUrl = URL.createObjectURL(new Blob([r.bytes], { type: r.type }));
    const img = new Image();
    img.src = objectUrl;
    await img.decode();
    // SVGs ohne feste Größe bekommen eine sinnvolle Standardgröße
    const w = img.naturalWidth || 512;
    const hgt = img.naturalHeight || Math.round(w * 0.75);
    const canvas = h('canvas', { width: w, height: hgt });
    canvas.getContext('2d').drawImage(img, 0, 0, w, hgt);
    const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png || !(await F.writeImage(new Uint8Array(await png.arrayBuffer())))) throw new Error('write');
    toast($t('Bild kopiert'), 'copy');
  } catch {
    toast($t('Bild konnte nicht kopiert werden'), 'warning');
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

// ---------------------------------------------------------------------------
// Seite übersetzen (seit 2.3.9) – direkt in der Seite, ohne Umleitung auf translate.google.com.
// Ein kleines Skript sammelt die Texte der Seite, der Hauptprozess übersetzt sie stapelweise
// (translate:batch) und das Skript schreibt sie zurück. Später nachgeladene Texte werden mitübersetzt,
// „Original anzeigen“ stellt die ursprünglichen Texte wieder her.
// ---------------------------------------------------------------------------
const Translate = (() => {
  const btn = $('#translateBtn');
  const pop = $('#translatePop');
  const MAX_NODES = 6000;
  const BATCH_CHARS = 4000;
  const BATCH_ITEMS = 100;

  // Läuft in der Webseite (eigene Welt der Seite, nur Textknoten werden geändert – kein HTML)
  const PAGE_SCRIPT = `(() => {
    if (window.__falconTr) return true;
    const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','CODE','PRE','KBD','SAMP','VAR','TEMPLATE','IFRAME','CANVAS','SVG','MATH','INPUT','SELECT','OPTION']);
    const entries = new Map(); // id → { node, orig, lead, trail }
    const ids = new WeakMap(); // Textknoten → id
    const ours = new WeakSet(); // von uns geschriebene Knoten (Observer ignoriert sie)
    let seq = 0, on = false, obs = null;
    const pending = new Set();
    const skipEl = (el) => {
      for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
        if (SKIP.has(e.tagName) || e.isContentEditable || e.getAttribute('translate') === 'no' || e.classList?.contains('notranslate')) return true;
      }
      return false;
    };
    // Sätze mit Formatierung (fett, Links …) bestehen aus mehreren Textknoten. Sie werden zusammen übersetzt
    // (als HTML mit Markierungen <a i=N>), damit der Satz stimmt; jeder Knoten bekommt danach sein Stück zurück.
    const blocks = new WeakMap();
    const blockOf = (el) => {
      let e = el;
      while (e && e !== document.body) {
        let d = blocks.get(e);
        if (d === undefined) { d = getComputedStyle(e).display; blocks.set(e, d); }
        if (!d.startsWith('inline') && d !== 'contents') return e;
        e = e.parentElement;
      }
      return document.body;
    };
    const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    function group(nodes, out) {
      let cur = [], blk = null;
      const flush = () => {
        if (cur.length === 1) out.push({ id: cur[0].id, text: cur[0].text });
        else if (cur.length > 1) out.push({ ids: cur.map((c) => c.id), html: cur.map((c, k) => '<a i=' + k + '>' + esc(c.text) + '</a>').join(' ') });
        cur = [];
      };
      for (const n of nodes) {
        const b = blockOf(n.node.parentElement);
        if (b !== blk || cur.length >= 20) { flush(); blk = b; }
        cur.push(n);
      }
      flush();
      return out;
    }
    function collect(root, out, limit) {
      if (!root) return;
      if (root.nodeType === 3) { take(root, out); return; }
      if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
      if (root.nodeType === 1 && skipEl(root)) return;
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement && SKIP.has(n.parentElement.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
      });
      for (let n = w.nextNode(); n && out.length < limit; n = w.nextNode()) take(n, out);
    }
    function take(n, out) {
      if (ids.has(n) || ours.has(n)) return;
      const v = n.nodeValue;
      if (!v || v.length > 5000) return;
      const t = v.trim();
      if (!/\\p{L}/u.test(t)) return;
      if (skipEl(n.parentElement)) return;
      const id = ++seq;
      ids.set(n, id);
      entries.set(id, { node: n, orig: v, lead: v.slice(0, v.length - v.trimStart().length), trail: v.slice(v.trimEnd().length) });
      out.push({ id, text: t, node: n });
    }
    window.__falconTr = {
      start(limit) {
        on = true;
        const nodes = [];
        collect(document.body, nodes, limit);
        const out = group(nodes, []);
        if (document.title && !ids.has(document)) { ids.set(document, 0); out.unshift({ id: 0, text: document.title }); entries.set(0, { title: true, orig: document.title }); }
        if (!obs) {
          obs = new MutationObserver((list) => {
            if (!on) return;
            for (const m of list) {
              if (m.type === 'characterData') { if (!ours.has(m.target)) { ids.delete(m.target); pending.add(m.target); } }
              else for (const n of m.addedNodes) pending.add(n);
            }
          });
          obs.observe(document.body, { childList: true, subtree: true, characterData: true });
        }
        return out;
      },
      pending(limit) {
        if (!on || !pending.size) return [];
        const nodes = [];
        for (const n of [...pending]) { pending.delete(n); if (n.isConnected) collect(n, nodes, limit); if (nodes.length >= limit) break; }
        return group(nodes, []);
      },
      apply(pairs) {
        for (const [id, text] of pairs) {
          const e = entries.get(id);
          if (!e || !text) continue;
          if (e.title) { document.title = text; continue; }
          if (!e.node.isConnected) continue;
          ours.add(e.node);
          e.node.nodeValue = e.lead + text + e.trail;
        }
        return true;
      },
      restore() {
        on = false;
        obs?.disconnect(); obs = null;
        pending.clear();
        for (const e of entries.values()) {
          if (e.title) document.title = e.orig;
          else if (e.node.isConnected) { ours.add(e.node); e.node.nodeValue = e.orig; }
        }
        entries.clear();
        delete window.__falconTr;
        return true;
      }
    };
    return true;
  })()`;

  const langName = (code) => {
    if (!code) return $t('Unbekannt');
    try { const n = new Intl.DisplayNames([I18N.locale || I18N.lang || 'de'], { type: 'language' }).of(code); return n ? n[0].toUpperCase() + n.slice(1) : code; } catch { return code; }
  };
  const isWeb = (tab) => !!tab && /^https?:/i.test(tab.url || '');
  const isTranslated = (tab = Tabs.active()) => !!tab?.translation;
  const js = (tab, code) => tab.webview.executeJavaScript(code);

  const source = (it) => it.html ?? it.text;
  const decoder = new DOMParser();
  const decode = (html) => decoder.parseFromString(`<!doctype html><body>${html}`, 'text/html').body.textContent; // nur Text, nichts wird ausgeführt

  /** Antwort für einen Eintrag → [[Knoten-id, Text], …] */
  function pairsFor(it, translated) {
    if (!it.html) return [[it.id, translated]];
    const parts = new Map();
    for (const m of translated.matchAll(/<a i="?(\d+)"?>([\s\S]*?)<\/a>/g)) parts.set(Number(m[1]), decode(m[2]).replace(/\s+([.,;:!?»)])/g, '$1').trim());
    return it.ids.map((id, k) => [id, parts.get(k)]).filter((p) => p[1]);
  }

  /** Texte in Stapel teilen (Zeichen- und Anzahl-Grenze des Hauptprozesses), getrennt nach Text und HTML */
  function batches(items) {
    return [...chunk(items.filter((i) => !i.html)), ...chunk(items.filter((i) => i.html))];
  }
  function chunk(items) {
    const out = [];
    let cur = [], chars = 0;
    for (const it of items) {
      const len = Math.min(source(it).length, 5000);
      if (cur.length && (chars + len > BATCH_CHARS || cur.length >= BATCH_ITEMS)) { out.push(cur); cur = []; chars = 0; }
      cur.push(it); chars += len;
    }
    if (cur.length) out.push(cur);
    return out;
  }

  /** Übersetzt die Einträge und schreibt sie in die Seite. Gibt die erkannten Sprachen zurück. */
  async function run(tab, items, session) {
    const langs = {};
    const queue = batches(items);
    const worker = async () => {
      while (queue.length) {
        if (tab.translation !== session) return; // inzwischen zurückgesetzt oder neue Seite
        const batch = queue.shift();
        const res = await F.translateBatch(batch.map(source), session.to, batch[0].html ? 'html' : 'text');
        if (res?.error) throw new Error(res.error);
        res.langs.forEach((l) => { if (l) langs[l] = (langs[l] || 0) + 1; });
        if (tab.translation !== session) return;
        const pairs = batch.flatMap((b, i) => pairsFor(b, res.translations[i]));
        await js(tab, `window.__falconTr && window.__falconTr.apply(${JSON.stringify(pairs)})`);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    return langs;
  }

  function stopPolling(tab) { clearInterval(tab.translation?.timer); }

  function forget(tab) {
    if (!tab?.translation) return;
    stopPolling(tab);
    tab.translation = null;
    if (tab === Tabs.active()) { renderButton(); if (Popover.isOpen(pop)) Popover.close(); }
  }

  async function restore(tab) {
    const session = tab.translation;
    forget(tab);
    if (!session) return;
    try { await js(tab, 'window.__falconTr && window.__falconTr.restore()'); } catch { /* Seite weg */ }
  }

  function bind(tab) {
    if (tab.__trBound) return;
    tab.__trBound = true;
    // Neue Seite = neue Inhalte: Übersetzung endet (Navigation innerhalb der Seite behält sie)
    tab.webview.addEventListener('did-navigate', () => forget(tab));
  }

  async function translate(tab = Tabs.active()) {
    if (!isWeb(tab)) return;
    if (tab.translation) return restore(tab);
    if (Updates.blocked()) return;
    bind(tab);
    const session = { to: (I18N.lang || 'de').slice(0, 2), from: '', busy: true, timer: null };
    tab.translation = session;
    if (tab === Tabs.active()) renderButton();
    try {
      await js(tab, PAGE_SCRIPT);
      const items = await js(tab, `window.__falconTr.start(${MAX_NODES})`);
      if (!items?.length) { await restore(tab); toast($t('Auf dieser Seite gibt es nichts zu übersetzen'), 'translate'); return; }
      const langs = await run(tab, items, session);
      if (tab.translation !== session) return;
      const from = Object.entries(langs).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      if (from && from.split('-')[0] === session.to) {
        await restore(tab);
        toast($t('Diese Seite ist bereits auf {lang}', { lang: langName(session.to) }), 'translate');
        return;
      }
      session.from = from;
      session.busy = false;
      // Später nachgeladene Texte (Kommentare, Feeds, Single-Page-Apps) mitübersetzen
      session.timer = setInterval(async () => {
        if (tab.translation !== session || session.polling) return;
        session.polling = true;
        try {
          const more = await js(tab, `window.__falconTr ? window.__falconTr.pending(${BATCH_ITEMS * 3}) : null`);
          if (more === null) { forget(tab); return; }
          if (more.length) await run(tab, more, session);
        } catch { /* Seite lädt gerade neu */ } finally { session.polling = false; }
      }, 1500);
      if (tab === Tabs.active()) { renderButton(); openPopup(); }
    } catch (err) {
      console.warn('Übersetzen:', err?.message || err);
      await restore(tab);
      toast($t('Die Seite konnte nicht übersetzt werden. Prüfe deine Internetverbindung.'), 'warning');
    }
  }

  function renderButton() {
    const tab = Tabs.active();
    const tr = tab?.translation;
    btn.classList.toggle('hidden', !tr);
    btn.classList.toggle('busy', !!tr?.busy);
    btn.title = tr?.busy ? $t('Seite wird übersetzt …') : $t('Seite übersetzt');
  }

  function openPopup() {
    const tr = Tabs.active()?.translation;
    if (!tr || tr.busy) return;
    $('#trTitle').textContent = $t('Seite übersetzt');
    $('#trLangs').textContent = `${langName(tr.from)} → ${langName(tr.to)}`;
    Popover.open(pop, { anchor: btn });
  }

  btn.addEventListener('click', () => (Popover.isOpen(pop) ? Popover.close() : openPopup()));
  $('#trClose').addEventListener('click', () => Popover.close());
  $('#trOriginal').addEventListener('click', () => { Popover.close(); const t = Tabs.active(); if (t) restore(t); });
  on('nav-state', renderButton);
  on('tab-activated', renderButton);

  return { translate, isTranslated, label: (tab) => (isTranslated(tab) ? $t('Original anzeigen') : $t('Seite übersetzen')) };
})();

/** „mailto:a%40b.de?subject=…“ → „a@b.de“; sonst leer */
function mailAddress(link) {
  if (!/^mailto:/i.test(link || '')) return '';
  const raw = link.slice(7).split('?')[0];
  try { return decodeURIComponent(raw).trim(); } catch { return raw.trim(); }
}

function openPageMenu(p) {
  const wv = webviewByContentsId(p.webContentsId);
  if (!wv) return;
  const r = wv.getBoundingClientRect();
  const point = { x: r.left + p.x, y: r.top + p.y };
  const act = (fn) => () => { wv.focus(); fn(); };
  const selection = (p.selectionText || '').trim();
  const items = [];

  if (p.misspelledWord) {
    for (const s of (p.dictionarySuggestions || []).slice(0, 4)) items.push({ label: s, onClick: () => F.replaceMisspelling(p.webContentsId, s) });
    if (!p.dictionarySuggestions?.length) items.push({ label: $t('Keine Vorschläge'), disabled: true });
    items.push({ label: $t('Zum Wörterbuch hinzufügen'), icon: 'plus', onClick: () => F.addToDictionary(p.misspelledWord) }, '-');
  }
  const mail = mailAddress(p.linkURL);
  if (mail) {
    items.push({ label: $t('E-Mail-Adresse kopieren'), icon: 'copy', onClick: () => F.copy(mail) }, '-');
  } else if (p.linkURL) {
    items.push(
      { label: $t('Link in neuem Tab öffnen'), icon: 'tab', onClick: () => Tabs.create(p.linkURL, { background: true, index: state.tabs.indexOf(Tabs.active()) + 1 }) },
      { label: $t('Link in Seitenleiste öffnen'), icon: 'pip', onClick: () => Sidebar.openUrl(p.linkURL) },
      { label: $t('Link in Inkognito-Fenster öffnen'), icon: 'incognito', onClick: () => F.newIncognitoWindow(p.linkURL) },
      { label: $t('Link als Overlay öffnen'), icon: 'pip', onClick: () => F.openOverlay(p.linkURL) },
      { label: $t('Linkadresse kopieren'), icon: 'link', onClick: () => F.copy(p.linkURL) },
      '-');
  }
  if (p.mediaType === 'image' && p.srcURL) {
    items.push(
      { label: $t('Bild in neuem Tab öffnen'), icon: 'image', onClick: () => Tabs.create(p.srcURL, { background: true }) },
      { label: $t('Bild speichern unter …'), icon: 'download', onClick: () => wv.downloadURL(p.srcURL) },
      { label: $t('Bild kopieren'), icon: 'copy', onClick: () => copyImage(p.srcURL) },
      { label: $t('Bildadresse kopieren'), icon: 'link', onClick: () => F.copy(p.srcURL) },
      '-');
  }
  if (p.isEditable) {
    const f = p.editFlags || {};
    items.push(
      { label: $t('Rückgängig'), shortcut: kb('Strg+Z'), disabled: !f.canUndo, onClick: act(() => wv.undo()) },
      '-',
      { label: $t('Ausschneiden'), icon: 'scissors', shortcut: kb('Strg+X'), disabled: !f.canCut, onClick: act(() => wv.cut()) },
      { label: $t('Kopieren'), icon: 'copy', shortcut: kb('Strg+C'), disabled: !f.canCopy, onClick: act(() => wv.copy()) },
      { label: $t('Einfügen'), icon: 'clipboard', shortcut: kb('Strg+V'), disabled: !f.canPaste, onClick: act(() => wv.paste()) },
      { label: $t('Alles auswählen'), icon: 'selectAll', shortcut: kb('Strg+A'), disabled: !f.canSelectAll, onClick: act(() => wv.selectAll()) },
      '-');
  } else if (selection) {
    const short = selection.length > 28 ? `${selection.slice(0, 28)}…` : selection;
    items.push(
      { label: $t('Kopieren'), icon: 'copy', shortcut: kb('Strg+C'), onClick: act(() => wv.copy()) },
      { label: $t('Mit {engine} nach „{text}“ suchen', { engine: engine().name, text: short }), icon: 'search', onClick: () => Tabs.create(searchUrl(selection), { index: state.tabs.indexOf(Tabs.active()) + 1 }) },
      '-');
  }
  if (!p.linkURL && !p.isEditable && !selection && p.mediaType === 'none') {
    items.push(
      { label: $t('Zurück'), icon: 'arrowLeft', shortcut: kb('Alt+←'), disabled: !p.canGoBack, onClick: () => wv.goBack() },
      { label: $t('Vorwärts'), icon: 'arrowRight', shortcut: kb('Alt+→'), disabled: !p.canGoForward, onClick: () => wv.goForward() },
      { label: $t('Neu laden'), icon: 'reload', shortcut: kb('Strg+R'), onClick: () => wv.reload() },
      '-',
      {
        label: Translate.label(Tabs.byWebview(wv)), icon: 'translate',
        disabled: !/^https?:/.test(p.pageURL), onClick: () => Translate.translate(Tabs.byWebview(wv))
      },
      { label: $t('Screenshot …'), icon: 'scissors', shortcut: kb('Strg+Umschalt+S'), onClick: () => Screenshot.menu({ point }) },
      '-',
      { label: $t('Drucken …'), icon: 'printer', shortcut: kb('Strg+P'), onClick: () => wv.print() },
      { label: $t('Seitenquelltext anzeigen'), icon: 'code', disabled: !/^https?:/.test(p.pageURL), onClick: () => Tabs.create(`view-source:${p.pageURL}`) },
      '-');
  }
  items.push({ label: $t('Untersuchen'), icon: 'code', onClick: () => wv.inspectElement(p.x, p.y) });
  showMenu(items, { point });
}

// ---------------------------------------------------------------------------
// Fehlerseite & Statusblase
// ---------------------------------------------------------------------------
const PageError = (() => {
  const box = $('#pageError');
  const text = $('#peText');
  const code = $('#peCode');

  function message(err) {
    const host = h('b', {}, hostOf(err.url) || err.url);
    const msg = (src) => I18N.tNodes(src, { host });
    if (err.code === 'crash') return msg('Beim Anzeigen dieser Seite ist ein Fehler aufgetreten.');
    if (err.code === -106) return msg('Keine Internetverbindung. Prüfe Netzwerkkabel, Router oder WLAN.');
    if (err.code === -105 || err.code === -137) return msg('Die Serveradresse von {host} wurde nicht gefunden.');
    if (err.code === -102) return msg('{host} hat die Verbindung abgelehnt.');
    if (err.code === -7 || err.code === -118) return msg('{host} hat zu lange gebraucht, um zu antworten.');
    if (err.code === -101 || err.code === -100) return msg('Die Verbindung zu {host} wurde unterbrochen.');
    if (err.code <= -200 && err.code > -300) return msg('Die Verbindung zu {host} ist nicht sicher. Das Zertifikat der Seite ist ungültig.');
    return msg('{host} ist im Moment nicht erreichbar.');
  }

  // Fehler, hinter denen meist eine fehlende Internetverbindung steckt
  const OFFLINE_CODES = [-106, -105, -137, -21, -109, -130];
  const isOffline = (err) => OFFLINE_CODES.includes(err.code) || (!navigator.onLine && typeof err.code === 'number');
  FalconGame.mount($('#peGame'));

  on('page-error', (tab) => {
    if (!tab || tab.id !== state.activeId || !tab.error) { box.classList.add('hidden'); FalconGame.hide(); return; }
    text.replaceChildren(...message(tab.error));
    code.textContent = tab.error.desc || '';
    box.classList.remove('hidden');
    if (isOffline(tab.error)) FalconGame.show(); else FalconGame.hide();
  });

  // Sobald die Verbindung zurück ist, Offline-Tabs automatisch neu laden
  window.addEventListener('online', () => {
    for (const t of state.tabs) if (t.error && isOffline(t.error)) Tabs.reload(t);
  });
  $('#peRetry').addEventListener('click', () => Tabs.reload());
})();

(() => {
  const bubble = $('#statusBubble');
  let timer;
  on('status', (url) => {
    clearTimeout(timer);
    if (!url) { timer = setTimeout(() => bubble.classList.add('hidden'), 120); return; }
    let shown = url;
    try { shown = decodeURI(url); } catch { /* ungültig kodiert */ }
    bubble.textContent = shown.replace(/^https:\/\//, '');
    bubble.classList.remove('hidden');
  });
  on('tab-activated', () => bubble.classList.add('hidden'));
})();
