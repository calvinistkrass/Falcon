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
  // Geteilte Ansicht: zwei Tabs nebeneinander. Beide gelten als sichtbar.
  let split = null; // { a, b, ratio }
  const inSplit = (tab) => !!split && (tab.id === split.a || tab.id === split.b);
  const splitShown = () => !!split && (state.activeId === split.a || state.activeId === split.b);
  const isShown = (tab) => isActive(tab) || (splitShown() && inSplit(tab));

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
      volume: 1,
      sleeping: false,
      error: null,
      lastActive: Date.now(),
      created: Date.now(),
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
        h('button', { class: 'tab-audio hidden', onclick: (e) => { e.stopPropagation(); toggleMute(tab); }, oncontextmenu: (e) => { e.preventDefault(); e.stopPropagation(); volumePopover(tab); } }),
        h('button', { class: 'tab-close', title: $t('Tab schließen (Strg+W)'), onclick: (e) => { e.stopPropagation(); close(tab.id); } }, icon('x'))));

    el.addEventListener('mousedown', (e) => {
      if (e.button === 1) e.preventDefault(); // kein Autoscroll
      if (e.button === 0 && !e.target.closest('button')) activate(tab.id);
    });
    el.addEventListener('auxclick', (e) => { if (e.button === 1) close(tab.id); });
    el.addEventListener('mouseenter', () => Preview.enter(tab));
    el.addEventListener('mouseleave', () => Preview.leave());
    el.addEventListener('mousedown', () => Preview.hide(), true);
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); contextMenu(tab, e); });

    el.addEventListener('dragstart', (e) => {
      if (e.target.closest('button')) return e.preventDefault();
      dragged = tab;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/uri-list', tab.url);
    });
    el.addEventListener('dragend', (e) => {
      el.classList.remove('dragging'); dragged = null;
      // Außerhalb des Fensters losgelassen → Tab in neues Fenster (nur wenn es noch andere Tabs gibt)
      const outside = e.screenX < window.screenX || e.screenX > window.screenX + window.outerWidth || e.screenY < window.screenY || e.screenY > window.screenY + window.outerHeight;
      if (outside && e.dataTransfer.dropEffect === 'none' && state.tabs.length > 1 && state.tabs.includes(tab)) {
        F.detachTab(isNewTab(tab.url) || isInternal(tab.url) ? '' : tab.url, e.screenX, e.screenY);
        close(tab.id);
        return;
      }
      saveSession();
    });
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
    if (isShown(tab)) wv.classList.add('active');
    views.append(wv);
    applySplit();
  }

  function bind(tab, wv) {
    // Knopf „Zu Falcon hinzufügen“ im Chrome Web Store
    wv.addEventListener('ipc-message', (e) => {
      if (e.channel === 'ext-install') Extensions.installFromPage(e.args[0], () => { try { wv.send('ext-install-done'); } catch { /* Tab zu */ } });
    });
    const navChanged = () => { if (isActive(tab)) emit('nav-state'); };

    wv.addEventListener('dom-ready', () => {
      if (!tab.ready) {
        tab.ready = true;
        if (tab.muted) wv.setAudioMuted(true);
      }
      if (tab.volume !== 1) wv.send('tab-volume', tab.volume);
      Zoom.restore(tab);
      navChanged();
    });
    wv.addEventListener('did-start-loading', () => { tab.loading = true; render(tab); navChanged(); });
    wv.addEventListener('did-stop-loading', () => { tab.loading = false; render(tab); navChanged(); emit('tab-loaded', tab); });

    wv.addEventListener('did-start-navigation', (e) => {
      if (!e.isMainFrame || e.isSameDocument) return;
      // Frisch geöffneter Tab im Vordergrund: Hintergrund-Verbindungen drosseln, bis er geladen hat
      if (isActive(tab) && Date.now() - tab.created < 60_000 && /^https?:/i.test(e.url)) {
        try { F.prioritizeTab(wv.getWebContentsId()); } catch { /* Webview noch nicht bereit */ }
      }
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
    if (key === 'bug') return icon('bug');
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
    tab.webview?.classList.toggle('newtab', isNewTab(tab.url)); // Startseite ohne weißen Hintergrund (kein Aufblitzen)
    el.querySelector('.tab-close').title = $t('Tab schließen (Strg+W)');

    const title = displayTitle(tab);
    const titleEl = el.querySelector('.tab-title');
    if (titleEl.textContent !== title) titleEl.textContent = title;
    el.removeAttribute('title'); // ersetzt durch die Tab-Vorschau

    let key;
    if (tab.loading && !tab.sleeping) key = 'loading';
    else if (isNewTab(tab.url)) key = 'newtab';
    else if (tab.error) key = 'error';
    else if (tab.url && tab.url.startsWith('falcon://downloads')) key = 'download';
    else if (tab.url && tab.url.startsWith('falcon://reports')) key = 'bug';
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
      audio.title = (tab.muted ? $t('Ton einschalten') : $t('Tab stummschalten')) +
        (tab.volume !== 1 ? ` · ${Math.round(tab.volume * 100)} %` : '') + `\n${$t('Rechtsklick: Lautstärke')}`;
    }
    el.classList.toggle('split-pair', inSplit(tab));
    el.classList.toggle('split-shown', splitShown() && inSplit(tab) && !isActive(tab));
  }

  // -------------------------------------------------------------------------
  // Aktionen
  // -------------------------------------------------------------------------
  function activate(id) {
    const tab = byId(id);
    if (!tab) return;
    const prev = active();
    if (prev && prev !== tab) Preview.capture(prev); // letztes Bild merken, bevor der Tab verschwindet
    if (prev && prev !== tab) prev.lastActive = Date.now();
    state.activeId = id;
    tab.lastActive = Date.now();
    if (tab.sleeping) wake(tab);
    if (tab.frozen) freeze(tab, false, tab.frozen);

    // Partner der geteilten Ansicht mitwecken
    if (inSplit(tab)) { const other = byId(tab.id === split.a ? split.b : split.a); if (other?.sleeping) wake(other); if (other?.frozen) freeze(other, false); }
    for (const t of state.tabs) {
      t.webview?.classList.toggle('active', isShown(t));
      render(t);
    }
    applySplit();
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
    if (inSplit(tab)) endSplit(false);
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

  // Alle Tabs schließen: zuerst einen neuen leeren Tab öffnen, damit das Fenster nicht leer ist
  function closeAll() {
    const ids = state.tabs.map((t) => t.id);
    if (split) endSplit(false);
    create();
    for (const id of ids) close(id);
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
    if (tab.sleeping || isShown(tab) || tab.audible || !tab.webview) return false;
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
    for (const t of state.tabs) if (!isShown(t) && now - t.lastActive >= minIdleMs && sleep(t)) count++;
    return count;
  }
  // Game Mode: erst einfrieren (Seite bleibt geladen, keine CPU), später schlafen legen (Speicher frei)
  const FREEZE_AFTER_MS = 30_000;
  // reason: 'game' (Game Mode) oder 'bg' (Falcon minimiert/verdeckt) – jeder Grund taut nur seine eigenen Tabs wieder auf
  async function freeze(tab, on, reason = 'game') {
    if (!tab.webview || !tab.ready || !!tab.frozen === on) return;
    if (!on && tab.frozen !== reason) return;
    let id;
    try { id = tab.webview.getWebContentsId(); } catch { return; }
    if (await F.setTabFrozen(id, on)) { tab.frozen = on ? reason : false; render(tab); emit('tabs-changed'); }
  }
  setInterval(() => {
    if (!state.settings.gameMode) return;
    const now = Date.now();
    for (const t of state.tabs) {
      if (!isShown(t) && !t.audible && !t.sleeping && now - t.lastActive > FREEZE_AFTER_MS) freeze(t, true);
    }
    sleepInactive((state.settings.sleepMinutes || 10) * 60_000);
  }, 10_000);
  on('settings', (s) => { if (!s.gameMode) for (const t of state.tabs) if (t.frozen === 'game') freeze(t, false, 'game'); });

  // Falcon minimiert oder ganz verdeckt (z. B. Spiel im Vollbild): nach 2 Minuten alle Tabs einfrieren, die gerade
  // nichts abspielen. Chat- und Mail-Seiten bleiben wach, damit Nachrichten weiter ankommen.
  const BG_FREEZE_MS = 120_000;
  const STAY_AWAKE = /(^|\.)(discord\.com|whatsapp\.com|telegram\.org|messenger\.com|teams\.microsoft\.com|slack\.com|mail\.google\.com|outlook\.(live|office)\.com|twitch\.tv|kick\.com|meet\.google\.com|zoom\.us)$/i;
  // Die Wartezeit läuft im Hauptprozess: Timer in einem minimierten Fenster werden von Chromium stark gebremst
  function bgCheck() {
    const hidden = document.visibilityState === 'hidden';
    F.uiHidden(hidden && state.settings.bgFreeze !== false, BG_FREEZE_MS);
    if (!hidden) for (const t of state.tabs) if (t.frozen === 'bg') freeze(t, false, 'bg');
  }
  F.on('bg-freeze', () => {
    if (document.visibilityState !== 'hidden' || state.settings.bgFreeze === false) return;
    for (const t of state.tabs) if (!t.audible && !t.sleeping && !t.frozen && !STAY_AWAKE.test(hostOf(t.url))) freeze(t, true, 'bg');
  });
  document.addEventListener('visibilitychange', bgCheck);


  // -------------------------------------------------------------------------
  // Geteilte Ansicht
  // -------------------------------------------------------------------------
  const divider = h('div', { id: 'splitDivider', class: 'hidden', title: $t('Ziehen zum Ändern der Breite') },
    h('div', { class: 'split-tools' },
      h('button', { class: 'tb-btn sm', title: $t('Seiten tauschen'), onclick: () => swapSplit() }, icon('swap')),
      h('button', { class: 'tb-btn sm', title: $t('Geteilte Ansicht beenden'), onclick: () => endSplit() }, icon('x'))));
  views.append(divider);

  function applySplit() {
    const on = splitShown();
    views.classList.toggle('split', on);
    divider.classList.toggle('hidden', !on);
    for (const t of state.tabs) {
      if (!t.webview) continue;
      t.webview.classList.toggle('split-l', on && t.id === split.a);
      t.webview.classList.toggle('split-r', on && t.id === split.b);
      t.webview.classList.toggle('focused', on && isActive(t));
    }
    if (on) views.style.setProperty('--split', `${(split.ratio * 100).toFixed(2)}%`);
  }
  function startSplit(left, right) {
    if (!left || !right || left === right) return;
    split = { a: left.id, b: right.id, ratio: 0.5 };
    activate(right.id);
  }
  function splitWithNew() {
    const cur = active();
    const t = create(null, { index: state.tabs.indexOf(cur) + 1, activate: false });
    startSplit(cur, t);
  }
  function endSplit(reactivate = true) {
    if (!split) return;
    split = null;
    for (const t of state.tabs) { t.webview?.classList.remove('split-l', 'split-r', 'focused'); render(t); }
    if (reactivate && active()) activate(state.activeId); else applySplit();
  }
  function swapSplit() {
    if (!split) return;
    split = { a: split.b, b: split.a, ratio: 1 - split.ratio };
    applySplit();
  }
  // Breite per Ziehen
  divider.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    document.body.classList.add('resizing');
    const box = views.getBoundingClientRect();
    const move = (ev) => { split.ratio = Math.min(0.8, Math.max(0.2, (ev.clientX - box.left) / box.width)); applySplit(); };
    const up = () => { document.body.classList.remove('resizing'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
  // Klick in die andere Hälfte macht sie zum aktiven Tab (Adressleiste folgt)
  views.addEventListener('focusin', (e) => {
    if (!splitShown() || e.target.tagName !== 'WEBVIEW') return;
    const t = state.tabs.find((x) => x.webview === e.target);
    if (t && !isActive(t)) activate(t.id);
  });

  // -------------------------------------------------------------------------
  // Lautstärke pro Tab
  // -------------------------------------------------------------------------
  function setVolume(tab, v) {
    tab.volume = Math.max(0, Math.min(1, v));
    if (tab.webview && tab.ready) tab.webview.send('tab-volume', tab.volume);
    render(tab);
  }
  function volumePopover(tab) {
    const value = h('b', { class: 'vol-value' }, `${Math.round(tab.volume * 100)} %`);
    const range = h('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round(tab.volume * 100), class: 'vol-range' });
    range.addEventListener('input', () => { setVolume(tab, range.value / 100); value.textContent = `${range.value} %`; });
    const mute = h('button', { class: 'tb-btn sm', title: tab.muted ? $t('Ton einschalten') : $t('Tab stummschalten'), onclick: () => { toggleMute(tab); mute.replaceChildren(icon(tab.muted ? 'volumeX' : 'volume')); } });
    mute.replaceChildren(icon(tab.muted ? 'volumeX' : 'volume'));
    const pop = h('div', { class: 'pop vol-pop' },
      h('div', { class: 'vol-head' }, h('span', {}, $t('Lautstärke')), value),
      h('div', { class: 'vol-row' }, mute, range),
      h('p', { class: 'vol-hint', 'data-no-i18n': '' }, displayTitle(tab)));
    document.body.append(pop);
    Popover.open(pop, { anchor: tab.el, align: 'start', onClose: () => pop.remove() });
    range.focus();
  }

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
      { label: $t('Lautstärke: {n} %', { n: Math.round(tab.volume * 100) }), icon: 'volume', onClick: () => volumePopover(tab) },
      { label: $t('Schlafen legen'), icon: 'moon', disabled: isShown(tab) || tab.sleeping || tab.audible, onClick: () => sleep(tab) },
      '-',
      inSplit(tab)
        ? { label: $t('Geteilte Ansicht beenden'), icon: 'split', onClick: () => endSplit() }
        : { label: isActive(tab) ? $t('Geteilte Ansicht mit neuem Tab') : $t('Neben aktuellem Tab anzeigen'), icon: 'split', onClick: () => (isActive(tab) ? splitWithNew() : startSplit(active(), tab)) },
      inSplit(tab) ? { label: $t('Seiten tauschen'), icon: 'swap', onClick: swapSplit } : null,
      '-',
      { label: $t('Schließen'), icon: 'x', shortcut: kb('Strg+W'), onClick: () => close(tab.id) },
      { label: $t('Andere Tabs schließen'), disabled: state.tabs.length < 2, onClick: () => closeOthers(tab.id) },
      { label: $t('Tabs rechts schließen'), disabled: i === state.tabs.length - 1, onClick: () => closeRight(tab.id) },
      { label: $t('Alle Tabs schließen'), icon: 'x', danger: true, onClick: closeAll },
      '-',
      { label: $t('Geschlossenen Tab wieder öffnen'), icon: 'restore', shortcut: kb('Strg+Umschalt+T'), disabled: !closedTabs.length, onClick: reopen }
    ], { point: { x: e.clientX, y: e.clientY } });
  }

  // -------------------------------------------------------------------------
  // Sitzung
  // -------------------------------------------------------------------------
  const saveSessionNow = () => {
    if (INCOGNITO || F.detached) return; // herausgezogene Fenster überschreiben die Sitzung des Hauptfensters nicht
    const saved = state.tabs.filter((t) => !isInternal(t.url));
    // Angebot „Tabs wiederherstellen“ noch offen und nichts Neues geöffnet: alte Sitzung behalten
    if (offered && saved.every((t) => isStartPage(t.url))) return;
    store.set(SESSION_KEY, {
      tabs: saved.map((t) => ({ url: t.url, title: t.title })),
      active: saved.indexOf(active())
    });
  };
  const saveSession = debounce(saveSessionNow, 400);
  // Vor dem Beenden (z. B. Neustart für ein Update) sofort speichern
  window.addEventListener('beforeunload', saveSessionNow);

  const isStartPage = (url) => !state.settings.restoreSession && state.settings.startPage === 'custom' && !!state.settings.startUrl && url === state.settings.startUrl;
  function lastSession() {
    if (INCOGNITO || F.detached) return null;
    const s = store.get(SESSION_KEY, null);
    return s && Array.isArray(s.tabs) && s.tabs.length ? s : null;
  }
  function openSession(s) {
    const created = s.tabs.map((t) => create(t.url, { title: t.title, lazy: true, activate: false }));
    activate((created[s.active] || created[0]).id);
  }
  function restoreSession() {
    const s = lastSession();
    if (!s) return false;
    openSession(s);
    return true;
  }

  // -------------------------------------------------------------------------
  // „Tabs wiederherstellen?“ oben links – wenn Falcon die letzten Tabs nicht von selbst öffnet:
  // nach einem Absturz/erzwungenen Beenden immer, sonst bei einem anderen Start als „Letzte Sitzung“
  // -------------------------------------------------------------------------
  let offered = null;
  /** Vor dem Anlegen des ersten Tabs aufrufen – danach wird die Sitzung überschrieben */
  function offerSession(clean) {
    const last = lastSession();
    if (!last) return;
    // Die eigene Startseite öffnet sich ohnehin von selbst
    const tabs = last.tabs.filter((t) => !isStartPage(t.url));
    if (!tabs.length) return;
    const s = offered = { tabs, active: tabs.indexOf(last.tabs[last.active]) };
    const n = s.tabs.length;
    const box = h('section', { class: 'restore-pop', role: 'dialog', 'aria-label': $t('Letzte Tabs wiederherstellen?') },
      h('button', { class: 'tb-btn sm', title: $t('Nicht wiederherstellen'), onclick: () => finish(false) }, icon('x')),
      h('span', { class: 'restore-icon' }, icon('restore')),
      h('div', { class: 'restore-text' },
        h('h3', {}, clean ? $t('Letzte Tabs wiederherstellen?') : $t('Falcon wurde nicht richtig beendet')),
        h('p', {}, n === 1
          ? (clean ? $t('Beim Schließen war noch ein Tab offen.') : $t('Möchtest du deinen letzten Tab wiederherstellen?'))
          : (clean ? $t('Beim Schließen waren noch {n} Tabs offen.', { n }) : $t('Möchtest du deine letzten {n} Tabs wiederherstellen?', { n }))),
        h('p', { class: 'restore-tabs', 'data-no-i18n': '' }, s.tabs.slice(0, 3).map((t) => t.title || hostOf(t.url) || t.url).join(' · ') + (n > 3 ? ` · +${n - 3}` : ''))),
      h('button', { class: 'btn primary', onclick: () => finish(true) }, n === 1 ? $t('Tab wiederherstellen') : $t('Tabs wiederherstellen')));
    function finish(restore) {
      const blank = restore ? state.tabs.filter((t) => isNewTab(t.url)) : [];
      offered = null;
      box.remove();
      if (restore) {
        openSession(s);
        for (const t of blank) close(t.id);
      }
      saveSession();
    }
    $('#content').append(box);
  }

  on('settings', () => state.tabs.forEach(render));

  return {
    create, activate, close, closeAll, closeOthers, closeRight, duplicate, reopen, navigate, reload, toggleMute,
    byWebview: (wv) => state.tabs.find((t) => t.webview === wv),
    cycle, goTo, sleep, sleepInactive, restoreSession, offerSession, displayTitle, active, byId, isShown,
    startSplit, splitWithNew, endSplit, swapSplit, setVolume, volumePopover, get split() { return split ? { ...split } : null; },
    get closedCount() { return closedTabs.length; }
  };
})();

// ---------------------------------------------------------------------------
// Tab-Vorschau: beim Darüberfahren ein kleines Fensterbild mit Titel und Adresse
// ---------------------------------------------------------------------------
const Preview = (() => {
  const img = h('img', { class: 'tp-img', alt: '' });
  const ph = h('div', { class: 'tp-ph' });
  const title = h('b', { class: 'tp-title', 'data-no-i18n': '' });
  const host = h('span', { class: 'tp-host', 'data-no-i18n': '' });
  const note = h('span', { class: 'tp-note' });
  const box = h('div', { class: 'tab-preview', 'aria-hidden': 'true' }, h('div', { class: 'tp-shot' }, img, ph), h('div', { class: 'tp-text' }, title, host, note));
  document.body.append(box);
  let timer = 0, current = null, shown = false;
  async function capture(tab) {
    if (!tab?.webview || !tab.ready || tab.sleeping || isNewTab(tab.url)) return;
    let id;
    try { id = tab.webview.getWebContentsId(); } catch { return; }
    const data = await F.tabThumb(id).catch(() => null);
    if (data) { tab.thumb = data; tab.thumbUrl = tab.url; if (current === tab && shown) fill(tab); }
  }
  function fill(tab) {
    title.textContent = Tabs.displayTitle(tab);
    host.textContent = isNewTab(tab.url) ? '' : hostOf(tab.url) || tab.url;
    note.textContent = tab.sleeping ? $t('Schlafend – wird beim Öffnen neu geladen') : INCOGNITO ? $t('Inkognito') : '';
    const pic = tab.thumb && !isNewTab(tab.url) ? tab.thumb : '';
    img.hidden = !pic; ph.hidden = !!pic;
    if (pic && img.src !== pic) img.src = pic;
    if (!pic) ph.replaceChildren(tab.favicon ? h('img', { src: tab.favicon, alt: '' }) : icon(isNewTab(tab.url) ? 'plus' : 'globe'));
  }
  function place(tab) {
    const r = tab.el.getBoundingClientRect();
    const w = 260;
    box.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    box.style.top = `${r.bottom + 6}px`;
  }
  function show(tab) {
    if (!tab.el?.isConnected || [...document.querySelectorAll('.overlay')].some((o) => o.offsetParent) || tab.el.classList.contains('dragging')) return;
    current = tab; shown = true;
    fill(tab); place(tab);
    box.classList.add('show');
    // Aktiver Tab: frisches Bild; andere Tabs zeigen ihr letztes Bild
    if (Tabs.active() === tab || !tab.thumb || tab.thumbUrl !== tab.url) capture(tab);
  }
  function enter(tab) {
    clearTimeout(timer);
    if (shown) { show(tab); return; } // beim Wandern über die Tabs sofort wechseln
    timer = setTimeout(() => show(tab), 450);
  }
  function hide() { clearTimeout(timer); shown = false; current = null; box.classList.remove('show'); }
  function leave() { clearTimeout(timer); timer = setTimeout(hide, 120); }
  addEventListener('blur', hide);
  on('tabs-changed', () => { if (current && !state.tabs.includes(current)) hide(); });
  return { enter, leave, hide, capture };
})();
