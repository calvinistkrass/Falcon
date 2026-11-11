'use strict';
/* Start, Tastenkürzel und Verbindung zum Hauptprozess */

// ---------------------------------------------------------------------------
// Navigationsleiste
// ---------------------------------------------------------------------------
(() => {
  const back = $('#back');
  const forward = $('#forward');
  const reload = $('#reload');

  on('nav-state', () => {
    const t = Tabs.active();
    const ready = !!(t?.webview && t.ready);
    back.disabled = !(ready && t.webview.canGoBack());
    forward.disabled = !(ready && t.webview.canGoForward());
    const loading = !!t?.loading;
    if (reload.dataset.icon !== (loading ? 'x' : 'reload')) setIcon(reload, loading ? 'x' : 'reload');
    reload.title = loading ? $t('Laden abbrechen (Esc)') : $t('Neu laden (F5)');
  });

  back.addEventListener('click', () => Tabs.active()?.webview?.goBack());
  forward.addEventListener('click', () => Tabs.active()?.webview?.goForward());
  reload.addEventListener('click', (e) => {
    const t = Tabs.active();
    if (t?.loading && t.webview) t.webview.stop();
    else Tabs.reload(t, e.shiftKey || e.ctrlKey);
  });
  $('#newTab').addEventListener('click', () => Tabs.create());
})();

// ---------------------------------------------------------------------------
// Tastenkürzel
// ---------------------------------------------------------------------------
function handleShortcut({ key, ctrl, shift, alt }) {
  const t = Tabs.active();
  const wv = t?.ready ? t.webview : null;

  if (key === 'mouse-back' || key === 'mouse-forward') {
    const dir = key === 'mouse-back' ? -1 : 1;
    if (state.settings.mouseButtons === 'tabs') return Tabs.cycle(dir);
    return dir < 0 ? wv?.goBack() : wv?.goForward();
  }
  if (key === 'escape') {
    if (Palette.isOpen()) return Palette.close();
    if (FullscreenHint.windowFullscreen) { F.win('fullscreen'); return; }
    if (Popover.current) return Popover.close();
    if (Settings.isOpen()) return Settings.close();
    if (!$('#findbar').classList.contains('hidden')) return Find.close();
    if (t?.loading && wv) wv.stop();
    return;
  }
  if (ctrl && shift && key === 't') return Tabs.reopen();
  if (ctrl && shift && key === 'n') return F.newIncognitoWindow();
  if (ctrl && shift && key === 'g') return Perf.setGameMode(!state.settings.gameMode);
  if (ctrl && shift && key === 's') return Screenshot.capture('area');
  if (ctrl && shift && key === 'b') return updateSettings({ showBookmarksBar: !state.settings.showBookmarksBar });
  if (ctrl && shift && key === 'delete') return Settings.open('privacy');
  if (ctrl && key === 'k') return Palette.toggle();
  if (ctrl && key === 't') return Tabs.create();
  if (ctrl && key === 'w') return t && Tabs.close(t.id);
  if (ctrl && key === 'tab') return Tabs.cycle(shift ? -1 : 1);
  if (ctrl && /^[1-9]$/.test(key)) return Tabs.goTo(key === '9' ? -1 : Number(key) - 1);
  if ((ctrl && key === 'l') || key === 'f6' || (alt && key === 'd')) return Omnibox.focus();
  if (ctrl && key === 'f') return Find.open();
  if (ctrl && key === 'd') return Bookmarks.toggleCurrent($('#bookmarkBtn'));
  if (ctrl && key === 'j') return openInternalPage(DOWNLOADS_URL);
  if (ctrl && key === ',') return Settings.open();
  if (ctrl && key === 'h') return Settings.open('history');
  if (ctrl && key === 'p') return wv?.print();
  if ((ctrl && key === 'r') || key === 'f5') return Tabs.reload(t, shift || (ctrl && key === 'f5'));
  if (ctrl && (key === '+' || key === '=')) return Zoom.step(1);
  if (ctrl && key === '-') return Zoom.step(-1);
  if (ctrl && key === '0') return Zoom.reset();
  if (key === 'f9') return Reader.toggle();
  if (key === 'f11') return F.win('fullscreen');
  if (key === 'f12') return wv?.isDevToolsOpened() ? wv.closeDevTools() : wv?.openDevTools();
  if (alt && key === 'arrowleft') return wv?.goBack();
  if (alt && key === 'arrowright') return wv?.goForward();
  if (alt && key === 'home') return t && Tabs.navigate('', t);
}

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
  const global =
    (ctrl && ['k', 't', 'w', 'l', 'f', 'd', 'j', 'h', 'r', 'p', 'tab', '+', '=', '-', '0', ',', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(key)) ||
    (ctrl && e.shiftKey && ['g', 'b', 'n', 's', 'delete'].includes(key)) ||
    ['f5', 'f6', 'f9', 'f11', 'f12', 'escape'].includes(key) ||
    (e.altKey && ['arrowleft', 'arrowright', 'home', 'd'].includes(key));
  if (!global) return;
  if (inField && e.altKey && ['arrowleft', 'arrowright'].includes(key)) return; // Cursor im Eingabefeld
  e.preventDefault();
  handleShortcut({ key, ctrl, shift: e.shiftKey, alt: e.altKey });
});
F.on('shortcut', handleShortcut);

// ---------------------------------------------------------------------------
// Hauptprozess
// ---------------------------------------------------------------------------
F.on('open-tab', (data) => {
  const { url, background } = typeof data === 'string' ? { url: data, background: false } : data;
  // Einziger Tab ist ein leerer neuer Tab (z. B. frisches Inkognito-Fenster) → dort öffnen
  const only = state.tabs.length === 1 ? state.tabs[0] : null;
  if (only && isNewTab(only.url) && !background) return Tabs.navigate(url, only);
  const index = state.tabs.indexOf(Tabs.active()) + 1;
  Tabs.create(url, { background, index });
});
F.on('search-tab', (q) => Tabs.create(searchUrl(q)));
F.on('download', (d) => Downloads.update(d));
F.on('pw-offer', (o) => Passwords.receive(o));
F.on('page-context-menu', openPageMenu);
// Einstellungen, die ein anderes Falcon-Fenster geändert hat
F.on('settings-changed', (s) => { state.settings = s; emit('settings', s); });
// ---------------------------------------------------------------------------
// Vollbild: kurzer Hinweis, wie man es beendet; Esc beendet auch das F11-Vollbild
// ---------------------------------------------------------------------------
const FullscreenHint = (() => {
  const el = $('#fsHint');
  let timer;
  let windowFullscreen = false;
  function show() {
    el.replaceChildren(...I18N.tNodes('Drücke {key}, um den Vollbildmodus zu beenden', { key: h('kbd', {}, 'Esc') }));
    el.classList.remove('hidden', 'out');
    clearTimeout(timer);
    timer = setTimeout(() => { el.classList.add('out'); timer = setTimeout(() => el.classList.add('hidden'), 300); }, 3500);
  }
  function hide() { clearTimeout(timer); el.classList.add('hidden'); }
  return {
    show, hide,
    get windowFullscreen() { return windowFullscreen; },
    set windowFullscreen(v) { windowFullscreen = v; }
  };
})();

F.on('win-state', (s) => {
  const wasFullscreen = FullscreenHint.windowFullscreen;
  FullscreenHint.windowFullscreen = s === 'fullscreen';
  document.body.classList.toggle('fullscreen', s === 'fullscreen');
  document.body.classList.toggle('maximized', s === 'max');
  if (s === 'fullscreen' && !wasFullscreen) FullscreenHint.show();
  if (s !== 'fullscreen') FullscreenHint.hide();
});

// ---------------------------------------------------------------------------
// Fensterrahmen: Platz für die nativen Fensterknöpfe freihalten
// ---------------------------------------------------------------------------
(() => {
  const root = document.documentElement;
  const wco = navigator.windowControlsOverlay;
  function update() {
    if (F.platform === 'darwin') {
      root.style.setProperty('--wco-left', '72px');
      return;
    }
    let right = 138;
    if (wco?.visible) {
      const r = wco.getTitlebarAreaRect();
      if (r.width) right = Math.max(0, innerWidth - (r.x + r.width));
    }
    root.style.setProperty('--wco-right', `${right}px`);
  }
  wco?.addEventListener('geometrychange', update);
  addEventListener('resize', update);
  update();
})();

// ---------------------------------------------------------------------------
// Einstellungen anwenden
// ---------------------------------------------------------------------------
(() => {
  let prev = {};
  on('settings', (s) => {
    applyAccent(s.accent);
    document.body.classList.toggle('no-bookmarks', !s.showBookmarksBar);
    // Startseite bekommt Akzentfarbe und Suchmaschine über die URL
    if (prev.accent && (prev.accent !== s.accent || prev.searchEngine !== s.searchEngine || prev.language !== s.language || JSON.stringify(prev.newtab) !== JSON.stringify(s.newtab))) {
      for (const t of state.tabs) {
        if (!isNewTab(t.url)) continue;
        t.url = newTabUrl();
        if (t.webview && t.ready) t.webview.loadURL(t.url).catch(() => {});
      }
    }
    if (prev.language !== s.language) { emit('nav-state'); emit('page-error', Tabs.active()); }
    prev = { ...s };
  });
})();

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
(async function init() {
  hydrateIcons();
  document.body.classList.add(`platform-${F.platform}`);
  state.settings = await F.getSettings();
  emit('settings', state.settings);
  if (INCOGNITO) { document.body.classList.add('incognito'); document.title = 'Falcon Inkognito'; }
  if (!(state.settings.restoreSession && Tabs.restoreSession())) Tabs.create();
})();
