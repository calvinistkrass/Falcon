'use strict';
/* Tabs und die zugehörigen Webviews */

const Tabs = (() => {
  const strip = $('#tabs');
  const views = $('#views');
  const SESSION_KEY = 'falcon.session';
  const closedTabs = [];
  let nextId = 1;
  let dragged = null;

  const byId = (id) => state.tabs.find((t) => t.id === id);
  const active = () => byId(state.activeId);
  const isActive = (tab) => tab.id === state.activeId;

  // -------------------------------------------------------------------------
  // Anlegen
  // -------------------------------------------------------------------------
  function create(url, opts = {}) {
    const { background = false, index, title = '', lazy = false } = opts;
    const tab = {
      id: nextId++,
      url: url || newTabUrl(),
      title,
      favicon: null,
      loading: false,
      ready: false,
      audible: false,
      muted: false,
      sleeping: false,
      error: null,
      lastActive: Date.now(),
      webview: null,
      el: null
    };
    tab.el = buildElement(tab);

    const at = index == null ? state.tabs.length : Math.max(0, Math.min(index, state.tabs.length));
    state.tabs.splice(at, 0, tab);
    strip.insertBefore(tab.el, state.tabs[at + 1]?.el || $('#newTab'));
    tab.el.classList.add('entering');
    tab.el.addEventListener('animationend', () => tab.el.classList.remove('entering'), { once: true });

    if (lazy) tab.sleeping = true;
    else mount(tab);
    render(tab);

    const shouldActivate = opts.activate ?? (!background || state.activeId == null);
    if (shouldActivate) activate(tab.id);
    saveSession();
    emit('tabs-changed');
    return tab;
  }

  function buildElement(tab) {
    const el = h('div', { class: 'tab', role: 'tab', draggable: 'true', dataset: { id: tab.id } },
      h('span', { class: 'ear l' }),
      h('span', { class: 'ear r' }),
      h('div', { class: 'tab-inner' },
        h('span', { class: 'tab-icon' }),
        h('span', { class: 'tab-title' }),
        h('button', { class: 'tab-audio hidden', onclick: (e) => { e.stopPropagation(); toggleMute(tab); } }),
        h('button', { class: 'tab-close', title: $t('Tab schließen (Strg+W)'), onclick: (e) => { e.stopPropagation(); close(tab.id); } }, icon('x'))));

    el.addEventListener('mousedown', (e) => {
      if (e.button === 1) e.preventDefault(); // kein Autoscroll
      if (e.button === 0 && !e.target.closest('button')) activate(tab.id);
    });
    el.addEventListener('auxclick', (e) => { if (e.button === 1) close(tab.id); });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); contextMenu(tab, e); });

    el.addEventListener('dragstart', (e) => {
      if (e.target.closest('button')) return e.preventDefault();
      dragged = tab;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/uri-list', tab.url);
    });
    el.addEventListener('dragend', () => { el.classList.remove('dragging'); dragged = null; saveSession(); });
    el.addEventListener('dragover', (e) => {
      if (!dragged || dragged === tab) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const ref = e.clientX > r.left + r.width / 2 ? el.nextSibling : el;
      if (ref !== dragged.el && ref !== dragged.el.nextSibling) strip.insertBefore(dragged.el, ref);
      state.tabs = $$('.tab:not(.leaving)', strip).map((n) => byId(Number(n.dataset.id))).filter(Boolean);
    });
    return el;
  }

  // -------------------------------------------------------------------------
  // Webview
  // -------------------------------------------------------------------------
  function mount(tab) {
    const wv = document.createElement('webview');
    wv.setAttribute('preload', F.webviewPreloadUrl);
    if (INCOGNITO) wv.setAttribute('partition', 'incognito');
    wv.setAttribute('allowpopups', '');
    wv.setAttribute('webpreferences', 'backgroundThrottling=yes');
    wv.setAttribute('src', tab.url);
    tab.webview = wv;
    tab.ready = false;
    tab.sleeping = false;
    bind(tab, wv);
    PasskeyPrompt.attach(wv, () => tab);
    Passwords.attachFill(wv);
    if (isActive(tab)) wv.classList.add('active');
    views.append(wv);
  }

  function bind(tab, wv) {
    const navChanged = () => { if (isActive(tab)) emit('nav-state'); };

    wv.addEventListener('dom-ready', () => {
      if (!tab.ready) {
        tab.ready = true;
        if (tab.muted) wv.setAudioMuted(true);
      }
      Zoom.restore(tab);
      navChanged();
    });
    wv.addEventListener('did-start-loading', () => { tab.loading = true; render(tab); navChanged(); });
    wv.addEventListener('did-stop-loading', () => { tab.loading = false; render(tab); navChanged(); emit('tab-loaded', tab); });

    wv.addEventListener('did-start-navigation', (e) => {
      if (!e.isMainFrame || e.isSameDocument) return;
      if (hostOf(e.url) !== hostOf(tab.url)) tab.favicon = null;
      if (tab.error) { tab.error = null; if (isActive(tab)) emit('page-error', tab); }
    });

    const onNavigate = (e) => {
      if (e.isMainFrame === false) return;
      tab.url = e.url;
      tab.readerable = undefined;
      if (isNewTab(e.url)) { tab.title = ''; tab.favicon = null; }
      render(tab);
      navChanged();
      saveSession();
    };
    wv.addEventListener('did-navigate', (e) => {
      tab.title = ''; // Seiten ohne <title> sollen nicht den alten Titel behalten
      onNavigate(e);
      History.add(e.url);
    });
    wv.addEventListener('did-navigate-in-page', onNavigate);

    wv.addEventListener('page-title-updated', (e) => {
      tab.title = e.title;
      History.setTitle(tab.url, e.title);
      render(tab);
      if (isActive(tab)) document.title = `${displayTitle(tab)} – ${APP_TITLE}`;
      saveSession();
    });
    wv.addEventListener('page-favicon-updated', (e) => { tab.favicon = e.favicons[0] || null; render(tab); });

    wv.addEventListener('media-started-playing', () => { tab.audible = true; render(tab); });
    wv.addEventListener('media-paused', () => { tab.audible = false; render(tab); });

    wv.addEventListener('enter-html-full-screen', () => document.body.classList.add('fullscreen'));
    wv.addEventListener('leave-html-full-screen', () => document.body.classList.remove('fullscreen'));

    wv.addEventListener('found-in-page', (e) => { if (isActive(tab)) emit('find-result', e.result); });
    wv.addEventListener('update-target-url', (e) => { if (isActive(tab)) emit('status', e.url); });
    wv.addEventListener('zoom-changed', (e) => Zoom.step(e.zoomDirection === 'in' ? 1 : -1, tab));

    wv.addEventListener('did-fail-load', (e) => {
      if (!e.isMainFrame || e.errorCode === -3) return; // -3: abgebrochen (z. B. durch neue Navigation)
      tab.error = { code: e.errorCode, desc: e.errorDescription, url: e.validatedURL || tab.url };
      tab.loading = false;
      render(tab);
      if (isActive(tab)) { emit('page-error', tab); emit('nav-state'); }
    });
    wv.addEventListener('render-process-gone', () => {
      tab.error = { code: 'crash', desc: 'RENDERER_CRASHED', url: tab.url };
      tab.loading = false;
      render(tab);
      if (isActive(tab)) emit('page-error', tab);
    });
  }

  // -------------------------------------------------------------------------
  // Darstellung
  // -------------------------------------------------------------------------
  function displayTitle(tab) {
    if (isNewTab(tab.url)) return $t('Neuer Tab');
    if (tab.error) return hostOf(tab.error.url) || $t('Fehler');
    return tab.title || hostOf(tab.url) || tab.url;
  }

  function iconNode(key) {
    if (key === 'loading') return h('span', { class: 'spinner' });
    if (key === 'newtab') return h('img', { src: F.logoUrl, alt: '' });
    if (key === 'error') return icon('warning');
    if (key === 'globe') return icon('globe');
    if (key === 'download') return icon('download');
    const img = h('img', { src: key, alt: '' });
    img.addEventListener('error', () => img.replaceWith(icon('globe')), { once: true });
    return img;
  }

  function render(tab) {
    const el = tab.el;
    const act = isActive(tab);
    el.classList.toggle('active', act);
    el.setAttribute('aria-selected', String(act));
    el.classList.toggle('sleeping', tab.sleeping);
    el.classList.toggle('frozen', !!tab.frozen);
    el.querySelector('.tab-close').title = $t('Tab schließen (Strg+W)');

    const title = displayTitle(tab);
    const titleEl = el.querySelector('.tab-title');
    if (titleEl.textContent !== title) titleEl.textContent = title;
    el.title = tab.sleeping ? `${title}\n${$t('Schlafend – wird beim Öffnen neu geladen')}` : title;

    let key;
    if (tab.loading && !tab.sleeping) key = 'loading';
    else if (isNewTab(tab.url)) key = 'newtab';
    else if (tab.error) key = 'error';
    else if (tab.url && tab.url.startsWith('falcon://downloads')) key = 'download';
    else key = tab.favicon || (isInternal(tab.url) ? 'globe' : faviconFor(tab.url));
    if (el.dataset.iconKey !== key) {
      el.dataset.iconKey = key;
      el.querySelector('.tab-icon').replaceChildren(iconNode(key));
    }

    const audio = el.querySelector('.tab-audio');
    const showAudio = tab.audible || tab.muted;
    audio.classList.toggle('hidden', !showAudio);
    if (showAudio) {
      const name = tab.muted ? 'volumeX' : 'volume';
      if (audio.dataset.icon !== name) setIcon(audio, name);
      audio.title = tab.muted ? $t('Ton einschalten') : $t('Tab stummschalten');
    }
  }

  // -------------------------------------------------------------------------
  // Aktionen
  // -------------------------------------------------------------------------
  function activate(id) {
    const tab = byId(id);
    if (!tab) return;
    const prev = active();
    if (prev && prev !== tab) prev.lastActive = Date.now();
    state.activeId = id;
    tab.lastActive = Date.now();
    if (tab.sleeping) wake(tab);
    if (tab.frozen) freeze(tab, false);

    for (const t of state.tabs) {
      t.webview?.classList.toggle('active', t === tab);
      render(t);
    }
    document.title = `${displayTitle(tab)} – ${APP_TITLE}`;
    tab.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    emit('tab-activated', tab);
    emit('page-error', tab);
    emit('nav-state');
    if (isNewTab(tab.url)) requestAnimationFrame(() => Omnibox.focus());
    else tab.webview?.focus();
  }

  function close(id) {
    const tab = byId(id);
    if (!tab) return;
    const i = state.tabs.indexOf(tab);
    if (!isNewTab(tab.url)) {
      closedTabs.push({ url: tab.url, title: tab.title, index: i });
      if (closedTabs.length > 25) closedTabs.shift();
    }
    state.tabs.splice(i, 1);
    tab.webview?.remove();
    tab.webview = null;
    tab.el.classList.remove('active');
    tab.el.classList.add('leaving');
    setTimeout(() => tab.el.remove(), 160);

    if (!state.tabs.length) create();
    else if (state.activeId === id) activate(state.tabs[Math.min(i, state.tabs.length - 1)].id);
    saveSession();
    emit('tabs-changed');
  }

  function closeOthers(id) { for (const t of [...state.tabs]) if (t.id !== id) close(t.id); }
  function closeRight(id) {
    const i = state.tabs.findIndex((t) => t.id === id);
    for (const t of state.tabs.slice(i + 1)) close(t.id);
  }
  function duplicate(id) {
    const t = byId(id);
    if (t) create(t.url, { index: state.tabs.indexOf(t) + 1, title: t.title });
  }
  function reopen() {
    const c = closedTabs.pop();
    if (c) create(c.url, { index: c.index, title: c.title });
  }

  function navigate(input, tab = active()) {
    if (!tab) return;
    const url = toUrl(input);
    tab.url = url;
    tab.error = null;
    if (!tab.webview) mount(tab);
    else if (tab.ready) tab.webview.loadURL(url).catch(() => { /* Fehler zeigt did-fail-load */ });
    else tab.webview.setAttribute('src', url);
    render(tab);
    if (isActive(tab)) { emit('page-error', tab); emit('nav-state'); tab.webview.focus(); }
  }

  function reload(tab = active(), ignoreCache = false) {
    if (!tab) return;
    if (tab.sleeping || !tab.webview) return wake(tab);
    if (tab.error) return navigate(tab.error.url, tab);
    if (ignoreCache) tab.webview.reloadIgnoringCache(); else tab.webview.reload();
  }

  function toggleMute(tab = active()) {
    if (!tab) return;
    tab.muted = !tab.muted;
    if (tab.webview && tab.ready) tab.webview.setAudioMuted(tab.muted);
    render(tab);
  }

  function cycle(dir) {
    const i = state.tabs.findIndex((t) => t.id === state.activeId);
    const next = state.tabs[(i + dir + state.tabs.length) % state.tabs.length];
    if (next) activate(next.id);
  }
  function goTo(index) {
    const t = index < 0 ? state.tabs[state.tabs.length - 1] : state.tabs[index];
    if (t) activate(t.id);
  }

  // -------------------------------------------------------------------------
  // Tab-Schlaf
  // -------------------------------------------------------------------------
  function sleep(tab) {
    if (tab.sleeping || isActive(tab) || tab.audible || !tab.webview) return false;
    tab.webview.remove();
    tab.webview = null;
    tab.ready = false;
    tab.loading = false;
    tab.sleeping = true;
    tab.frozen = false;
    render(tab);
    emit('tabs-changed');
    return true;
  }
  function wake(tab) {
    mount(tab);
    render(tab);
    emit('tabs-changed');
  }
  function sleepInactive(minIdleMs = 0) {
    const now = Date.now();
    let count = 0;
    for (const t of state.tabs) if (!isActive(t) && now - t.lastActive >= minIdleMs && sleep(t)) count++;
    return count;
  }
  // Game Mode: erst einfrieren (Seite bleibt geladen, keine CPU), später schlafen legen (Speicher frei)
  const FREEZE_AFTER_MS = 30_000;
  async function freeze(tab, on) {
    if (!tab.webview || !tab.ready || !!tab.frozen === on) return;
    let id;
    try { id = tab.webview.getWebContentsId(); } catch { return; }
    if (await F.setTabFrozen(id, on)) { tab.frozen = on; render(tab); emit('tabs-changed'); }
  }
  setInterval(() => {
    if (!state.settings.gameMode) return;
    const now = Date.now();
    for (const t of state.tabs) {
      if (!isActive(t) && !t.audible && !t.sleeping && now - t.lastActive > FREEZE_AFTER_MS) freeze(t, true);
    }
    sleepInactive((state.settings.sleepMinutes || 10) * 60_000);
  }, 10_000);
  on('settings', (s) => { if (!s.gameMode) for (const t of state.tabs) if (t.frozen) freeze(t, false); });

  // -------------------------------------------------------------------------
  // Kontextmenü
  // -------------------------------------------------------------------------
  function contextMenu(tab, e) {
    const i = state.tabs.indexOf(tab);
    showMenu([
      { label: $t('Neuer Tab rechts'), icon: 'plus', onClick: () => create(null, { index: i + 1 }) },
      '-',
      { label: $t('Neu laden'), icon: 'reload', shortcut: kb('Strg+R'), onClick: () => reload(tab) },
      { label: $t('Duplizieren'), icon: 'duplicate', onClick: () => duplicate(tab.id) },
      { label: $t('Als Overlay öffnen'), icon: 'pip', disabled: !/^https?:/.test(tab.url), onClick: () => F.openOverlay(tab.url) },
      { label: tab.muted ? $t('Ton einschalten') : $t('Tab stummschalten'), icon: tab.muted ? 'volume' : 'volumeX', onClick: () => toggleMute(tab) },
      { label: $t('Schlafen legen'), icon: 'moon', disabled: isActive(tab) || tab.sleeping || tab.audible, onClick: () => sleep(tab) },
      '-',
      { label: $t('Schließen'), icon: 'x', shortcut: kb('Strg+W'), onClick: () => close(tab.id) },
      { label: $t('Andere Tabs schließen'), disabled: state.tabs.length < 2, onClick: () => closeOthers(tab.id) },
      { label: $t('Tabs rechts schließen'), disabled: i === state.tabs.length - 1, onClick: () => closeRight(tab.id) },
      '-',
      { label: $t('Geschlossenen Tab wieder öffnen'), icon: 'restore', shortcut: kb('Strg+Umschalt+T'), disabled: !closedTabs.length, onClick: reopen }
    ], { point: { x: e.clientX, y: e.clientY } });
  }

  // -------------------------------------------------------------------------
  // Sitzung
  // -------------------------------------------------------------------------
  const saveSessionNow = () => {
    if (INCOGNITO) return;
    const saved = state.tabs.filter((t) => !isInternal(t.url));
    store.set(SESSION_KEY, {
      tabs: saved.map((t) => ({ url: t.url, title: t.title })),
      active: saved.indexOf(active())
    });
  };
  const saveSession = debounce(saveSessionNow, 400);
  // Vor dem Beenden (z. B. Neustart für ein Update) sofort speichern
  window.addEventListener('beforeunload', saveSessionNow);

  function restoreSession() {
    if (INCOGNITO) return false;
    const s = store.get(SESSION_KEY, null);
    if (!s || !Array.isArray(s.tabs) || !s.tabs.length) return false;
    const created = s.tabs.map((t) => create(t.url, { title: t.title, lazy: true, activate: false }));
    activate((created[s.active] || created[0]).id);
    return true;
  }

  on('settings', () => state.tabs.forEach(render));

  return {
    create, activate, close, closeOthers, closeRight, duplicate, reopen, navigate, reload, toggleMute,
    cycle, goTo, sleep, sleepInactive, restoreSession, displayTitle, active, byId,
    get closedCount() { return closedTabs.length; }
  };
})();
