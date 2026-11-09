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
    store.set(KEY, perHost);
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
        class: `dl-item${done ? ' done' : ''}`, title: done ? $t('Öffnen') : '',
        onclick: (e) => { if (done && !e.target.closest('button')) F.openPath(d.path); }
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
  const text = $('#perfText');
  const dot = btn.querySelector('.perf-dot');
  const pop = $('#perfPop');
  const gameBtn = $('#gameBtn');
  const SAMPLES = 60;
  const cpu = [];
  const mem = [];
  let last = null;

  const fmtMem = (mb) => (mb >= 1024 ? `${(mb / 1024).toLocaleString(I18N.locale, { maximumFractionDigits: 1 })} GB` : `${mb} MB`);

  function draw(canvas, data, max) {
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
  }

  function renderPop() {
    if (!last) return;
    $('#pCpu').textContent = `${Math.round(last.cpu)} %`;
    $('#pMem').textContent = fmtMem(last.memMB);
    $('#pProc').textContent = last.processes;
    $('#pTabs').textContent = state.tabs.filter((t) => !t.sleeping).length;
    $('#pSleep').textContent = state.tabs.filter((t) => t.sleeping).length;
    $('#pBlocked').textContent = last.blocked.toLocaleString(I18N.locale);
    $('#pGameDesc').textContent = $t('Legt Hintergrund-Tabs nach {n} Min. schlafen und schaltet Animationen ab.', { n: state.settings.sleepMinutes || 10 });
    $('#pGame').checked = !!state.settings.gameMode;
    draw($('#cpuGraph'), cpu, Math.max(100, ...cpu));
    draw($('#memGraph'), mem, Math.max(...mem) * 1.25 || 1);
  }

  async function tick() {
    const open = Popover.isOpen(pop);
    if (!state.settings.showHud && !open) return;
    try { last = await F.metrics(); } catch { return; }
    cpu.push(last.cpu); mem.push(last.memMB);
    if (cpu.length > SAMPLES) { cpu.shift(); mem.shift(); }
    text.textContent = `${String(Math.round(last.cpu)).padStart(2, ' ')} % · ${fmtMem(last.memMB)}`;
    dot.className = `perf-dot${last.cpu > 85 ? ' crit' : last.cpu > 50 ? ' warn' : ''}`;
    if (open) renderPop();
  }

  async function setGameMode(enabled) {
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
    { label: $t('Geschlossenen Tab öffnen'), icon: 'restore', shortcut: kb('Strg+Umschalt+T'), disabled: !Tabs.closedCount, onClick: () => Tabs.reopen() },
    '-',
    { label: $t('Downloads'), icon: 'download', shortcut: kb('Strg+J'), onClick: () => Downloads.toggle() },
    { label: $t('Lesezeichen'), icon: 'bookmark', onClick: () => Settings.open('bookmarks') },
    { label: $t('Passwörter'), icon: 'key', onClick: () => Settings.open('passwords') },
    '-',
    { element: zoomRow },
    '-',
    { label: $t('Auf Seite suchen …'), icon: 'search', shortcut: kb('Strg+F'), disabled: !ready, onClick: () => Find.open() },
    { label: $t('Drucken …'), icon: 'printer', shortcut: kb('Strg+P'), disabled: !ready, onClick: () => t.webview.print() },
    { label: $t('Entwicklertools'), icon: 'code', shortcut: kb('F12'), disabled: !ready, onClick: () => t.webview.openDevTools() },
    '-',
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
  if (p.linkURL) {
    items.push(
      { label: $t('Link in neuem Tab öffnen'), icon: 'tab', onClick: () => Tabs.create(p.linkURL, { background: true, index: state.tabs.indexOf(Tabs.active()) + 1 }) },
      { label: $t('Link in Seitenleiste öffnen'), icon: 'pip', onClick: () => Sidebar.openUrl(p.linkURL) },
      { label: $t('Linkadresse kopieren'), icon: 'link', onClick: () => F.copy(p.linkURL) },
      '-');
  }
  if (p.mediaType === 'image' && p.srcURL) {
    items.push(
      { label: $t('Bild in neuem Tab öffnen'), icon: 'image', onClick: () => Tabs.create(p.srcURL, { background: true }) },
      { label: $t('Bild speichern unter …'), icon: 'download', onClick: () => wv.downloadURL(p.srcURL) },
      { label: $t('Bild kopieren'), icon: 'copy', onClick: act(() => wv.copyImageAt(p.x, p.y)) },
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

  on('page-error', (tab) => {
    if (!tab || tab.id !== state.activeId || !tab.error) { box.classList.add('hidden'); return; }
    text.replaceChildren(...message(tab.error));
    code.textContent = tab.error.desc || '';
    box.classList.remove('hidden');
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
