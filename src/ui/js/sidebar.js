'use strict';
/* Seitenleiste mit Web-Apps, die neben der Seite offen bleiben */

const Sidebar = (() => {
  const APPS = [
    { id: 'discord', name: 'Discord', url: 'https://discord.com/app' },
    { id: 'twitch', name: 'Twitch', url: 'https://www.twitch.tv' },
    { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com' },
    { id: 'ytmusic', name: 'YouTube Music', url: 'https://music.youtube.com' },
    { id: 'whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com' }
  ];
  const MIN_WIDTH = 300;
  const MAX_WIDTH = 760;

  const appsEl = $('#sideApps');
  const panel = $('#sidepanel');
  const body = $('#spBody');
  const views = new Map();     // id -> webview (bleiben im Hintergrund aktiv, z. B. für Discord-Anrufe)
  const buttons = new Map();
  let current = null;

  function button(app) {
    const img = h('img', { src: faviconFor(app.url, 64), alt: '' });
    img.addEventListener('error', () => img.replaceWith(icon('globe')), { once: true });
    const btn = h('button', { class: 'sb-btn', title: app.name, onclick: () => toggle(app) }, img);
    buttons.set(app.id, btn);
    return btn;
  }

  function viewFor(app) {
    let wv = views.get(app.id);
    if (!wv) {
      wv = document.createElement('webview');
      wv.setAttribute('preload', F.webviewPreloadUrl);
      wv.setAttribute('allowpopups', '');
      wv.setAttribute('src', app.url);
      views.set(app.id, wv);
      PasskeyPrompt.attach(wv, null);
      Passwords.attachFill(wv);
      body.append(wv);
    }
    return wv;
  }

  function show(app) {
    current = app;
    for (const [id, wv] of views) wv.classList.toggle('off', id !== app.id);
    viewFor(app).classList.remove('off');
    for (const [id, b] of buttons) b.classList.toggle('active', id === app.id);
    const img = $('#spIcon');
    img.src = faviconFor(app.url, 32);
    $('#spTitle').textContent = app.name;
    panel.classList.remove('hidden');
  }

  function close() {
    panel.classList.add('hidden');
    for (const b of buttons.values()) b.classList.remove('active');
    if (current?.id === 'link') { views.get('link')?.remove(); views.delete('link'); }
    current = null;
  }

  function toggle(app) {
    if (current?.id === app.id) close(); else show(app);
  }

  function openUrl(url, title) {
    views.get('link')?.remove();
    views.delete('link');
    show({ id: 'link', name: title || hostOf(url), url });  // per Kontextmenü geöffneter Link
  }

  // Breite per Ziehen ändern
  $('#spResize').addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panel.offsetWidth;
    const handle = e.currentTarget;
    handle.classList.add('active');
    document.body.classList.add('resizing');
    const move = (ev) => {
      const w = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startW + ev.clientX - startX));
      document.documentElement.style.setProperty('--sp-width', `${w}px`);
    };
    const up = () => {
      handle.classList.remove('active');
      document.body.classList.remove('resizing');
      removeEventListener('mousemove', move);
      removeEventListener('mouseup', up);
      updateSettings({ sidePanelWidth: panel.offsetWidth });
    };
    addEventListener('mousemove', move);
    addEventListener('mouseup', up);
  });

  $('#spClose').addEventListener('click', close);
  $('#spReload').addEventListener('click', () => current && views.get(current.id)?.reload());
  $('#spOpen').addEventListener('click', () => {
    if (!current) return;
    const wv = views.get(current.id);
    let url = current.url;
    try { url = wv.getURL() || url; } catch { /* noch nicht geladen */ }
    Tabs.create(url);
  });
  $('#sbSettings').addEventListener('click', () => Settings.open());

  appsEl.append(...APPS.map(button));

  on('settings', (s) => {
    document.body.classList.toggle('no-sidebar', !s.showSidebar);
    if (s.sidePanelWidth) document.documentElement.style.setProperty('--sp-width', `${s.sidePanelWidth}px`);
  });

  return { openUrl, close };
})();
