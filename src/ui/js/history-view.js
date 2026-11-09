'use strict';
/* Verlauf in den Einstellungen (Strg+H): nach Tagen gruppiert, durchsuchbar */

(() => {
  const list = $('#histList');
  const search = $('#histSearch');
  const PAGE = 200;
  let shown = PAGE;

  function dayLabel(ts) {
    const d = new Date(ts);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    if (diff === 0) return $t('Heute');
    if (diff === 1) return $t('Gestern');
    return d.toLocaleDateString(I18N.locale, { weekday: 'long', day: 'numeric', month: 'long', year: diff > 300 ? 'numeric' : undefined });
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    const items = History.all().filter((e) => !q || e.url.toLowerCase().includes(q) || (e.title || '').toLowerCase().includes(q));
    if (!items.length) {
      list.replaceChildren(h('div', { class: 'list-empty' }, q ? $t('Keine Treffer für „{q}“', { q: search.value.trim() }) : $t('Der Verlauf ist leer.')));
      return;
    }
    const out = [];
    let lastDay = '';
    for (const e of items.slice(0, shown)) {
      const day = dayLabel(e.last);
      if (day !== lastDay) { out.push(h('h4', { class: 's-sub hist-day' }, day)); lastDay = day; }
      out.push(h('div', { class: 'list-row hist-row' },
        h('span', { class: 'hist-time' }, new Date(e.last).toLocaleTimeString(I18N.locale, { hour: '2-digit', minute: '2-digit' })),
        faviconEl(e.url, 16),
        h('button', {
          class: 'list-main hist-open', title: e.url,
          onclick: (ev) => { Settings.close(); if (ev.ctrlKey || ev.button === 1) Tabs.create(e.url, { background: true }); else Tabs.create(e.url); }
        }, h('b', {}, e.title || e.url.replace(/^https?:\/\//, '')), h('span', {}, hostOf(e.url))),
        h('div', { class: 'list-actions' },
          h('button', { class: 'tb-btn sm', title: $t('Aus dem Verlauf entfernen'), onclick: () => History.remove(e.url) }, icon('x')))));
    }
    if (items.length > shown) out.push(h('button', { class: 'btn hist-more', onclick: () => { shown += PAGE; render(); } }, $t('Mehr anzeigen')));
    list.replaceChildren(h('div', { class: 's-card hist-card' }, out));
  }

  search.addEventListener('input', debounce(() => { shown = PAGE; render(); }, 120));
  $('#histClear').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: $t('Verlauf löschen?'), message: $t('Besuchte Seiten werden nicht mehr in der Adressleiste vorgeschlagen.'), confirmLabel: $t('Löschen'), danger: true });
    if (ok) { History.clear(); toast($t('Verlauf gelöscht'), 'trash'); }
  });
  on('settings-section', (name) => { if (name === 'history') { search.value = ''; shown = PAGE; render(); search.focus(); } });
  on('history-changed', () => { if (Settings.section === 'history') render(); });
})();
