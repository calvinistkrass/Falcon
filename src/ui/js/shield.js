'use strict';
/* Werbeblocker: Falcon-Symbol in der Adressleiste, Popover pro Seite und Einstellungsbereich */

const Shield = (() => {
  const btn = $('#shieldBtn');
  const count = $('#shieldCount');
  const pop = $('#shieldPop');
  const stats = new Map(); // webContentsId -> Statistik vom Hauptprozess

  const activeId = () => {
    const t = Tabs.active();
    try { return t?.webview && t.ready ? t.webview.getWebContentsId() : null; } catch { return null; }
  };
  const current = () => stats.get(activeId()) || { blocked: 0, top: [], total: 0, host: hostOf(Tabs.active()?.url || ''), allowed: false };
  const allowList = () => state.settings.adblockAllow || [];

  function renderButton() {
    const t = Tabs.active();
    const internal = !t || isInternal(t.url);
    btn.classList.toggle('hidden', internal);
    if (internal) return;
    const s = current();
    const on = state.settings.adblock !== false && !s.allowed;
    btn.classList.toggle('off', !on);
    count.textContent = s.blocked > 99 ? '99+' : String(s.blocked);
    count.classList.toggle('hidden', !on || !s.blocked);
    btn.title = !on ? $t('Werbeblocker ist für diese Seite aus')
      : s.blocked ? $t('{n} Werbeanzeigen und Tracker blockiert', { n: s.blocked }) : $t('Werbeblocker');
  }

  function renderPop() {
    const s = current();
    const host = s.host || hostOf(Tabs.active()?.url || '');
    const globalOn = state.settings.adblock !== false;
    const on = globalOn && !s.allowed;

    $('#shHost').textContent = host;
    $('#shCount').textContent = on ? s.blocked.toLocaleString(I18N.locale) : '–';
    $('#shCountLabel').textContent = !globalOn ? $t('Der Werbeblocker ist überall ausgeschaltet.')
      : s.allowed ? $t('Auf dieser Seite ausgeschaltet.')
        : s.blocked ? $t('Werbeanzeigen und Tracker auf dieser Seite blockiert')
          : $t('Keine Werbung oder Tracker gefunden');
    $('#shTop').replaceChildren(...(on ? s.top : []).map((t) => h('div', { class: 'sh-row' },
      faviconEl(`https://${t.host}`, 14), h('span', {}, t.host), h('b', {}, String(t.count)))));
    $('#shTop').classList.toggle('hidden', !on || !s.top.length);

    const siteSwitch = $('#shSite');
    siteSwitch.checked = !s.allowed;
    siteSwitch.disabled = !globalOn;
    $('#shSiteLabel').textContent = $t('Werbeblocker auf {host}', { host });
    $('#shGlobal').textContent = globalOn ? $t('Überall ausschalten') : $t('Überall einschalten');
    $('#shTotal').textContent = $t('Insgesamt {n} blockiert', { n: (s.total || 0).toLocaleString(I18N.locale) });
  }

  async function refresh() {
    const id = activeId();
    if (id != null) stats.set(id, await F.adblock.stats(id));
    renderButton();
    if (Popover.isOpen(pop)) renderPop();
  }

  async function setSiteAllowed(host, allowed) {
    const list = allowList().filter((h) => h !== host);
    if (allowed) list.push(host);
    await updateSettings({ adblockAllow: list });
    Tabs.reload();
    refresh();
  }

  btn.addEventListener('click', async () => {
    if (Popover.isOpen(pop)) return Popover.close();
    await refresh();
    renderPop();
    Popover.open(pop, { anchor: btn, align: 'end' });
  });
  $('#shSite').addEventListener('change', (e) => setSiteAllowed(current().host || hostOf(Tabs.active().url), !e.target.checked));
  $('#shGlobal').addEventListener('click', async () => {
    await updateSettings({ adblock: state.settings.adblock === false });
    Tabs.reload();
    refresh();
  });
  $('#shSettings').addEventListener('click', () => Settings.open('adblock'));

  F.on('adblock-stats', (s) => {
    stats.set(s.webContentsId, s);
    if (s.webContentsId === activeId()) { renderButton(); if (Popover.isOpen(pop)) renderPop(); }
  });
  on('tab-activated', refresh);
  on('nav-state', renderButton);
  on('settings', () => { renderButton(); renderSettings(); });

  // -------------------------------------------------------------------------
  // Einstellungen › Werbeblocker
  // -------------------------------------------------------------------------
  async function renderInfo() {
    const i = await F.adblock.info();
    $('#abInfo').textContent = i.source === 'lists'
      ? $t('{n} Filterregeln · aktualisiert am {date}', { n: i.rules.toLocaleString(I18N.locale), date: new Date(i.updated).toLocaleDateString(I18N.locale) })
      : $t('Filterlisten nicht verfügbar – eingeschränkter Schutz mit eingebauter Liste.');
    $('#abTotal').textContent = i.total.toLocaleString(I18N.locale);
  }

  function renderSettings() {
    const list = allowList();
    $('#abAllowWrap').classList.toggle('hidden', !list.length);
    $('#abAllow').replaceChildren(...list.map((host) => h('div', { class: 'list-row' },
      faviconEl(`https://${host}`, 18),
      h('div', { class: 'list-main' }, h('b', {}, host)),
      h('div', { class: 'list-actions' },
        h('button', { class: 'tb-btn sm', title: $t('Entfernen'), onclick: () => updateSettings({ adblockAllow: allowList().filter((x) => x !== host) }) }, icon('x'))))));
  }

  $('#abUpdate').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    $('#abInfo').textContent = $t('Filterlisten werden aktualisiert …');
    await F.adblock.update();
    b.disabled = false;
    renderInfo();
    toast($t('Filterlisten aktualisiert'), 'shield');
  });
  on('settings-section', (name) => { if (name === 'adblock') { renderInfo(); renderSettings(); } });

  return { refresh };
})();
