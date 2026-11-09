'use strict';
/* Adressleiste: Anzeige, Eingabe, Vorschläge, Inline-Vervollständigung */

const Omnibox = (() => {
  const box = $('#omnibox');
  const field = $('.omni-field');
  const input = $('#url');
  const display = $('#urlDisplay');
  const list = $('#suggest');
  const siteInfo = $('#siteInfo');
  const star = $('#bookmarkBtn');

  let editing = false;
  let typed = '';          // was der Nutzer wirklich getippt hat (ohne Vervollständigung)
  let rows = [];
  let sel = 0;
  let selectOnMouseUp = false;

  const currentUrl = () => {
    const t = Tabs.active();
    return t ? (t.error?.url || t.url) : '';
  };

  // -------------------------------------------------------------------------
  // Anzeige
  // -------------------------------------------------------------------------
  function renderDisplay(url) {
    display.replaceChildren();
    if (editing || !url || isNewTab(url)) { field.classList.remove('formatted'); return; }
    let u;
    try { u = new URL(url); } catch { field.classList.remove('formatted'); return; }
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      if (u.protocol === 'http:') display.append(h('span', {}, 'http://'));
      const rest = url.slice(url.indexOf(u.host) + u.host.length);
      display.append(h('span', { class: 'host' }, u.host), h('span', {}, rest === '/' ? '' : rest));
    } else {
      display.append(h('span', {}, url));
    }
    field.classList.add('formatted');
  }

  function sync() {
    const url = currentUrl();
    if (!editing) {
      input.value = isNewTab(url) ? '' : url;
      renderDisplay(url);
    }
    let name = 'search', cls = '', tip = $t('Suchen oder Adresse eingeben');
    if (url && !isNewTab(url)) {
      if (url.startsWith('https:')) { name = 'lock'; tip = $t('Verbindung ist sicher'); }
      else if (url.startsWith('http:')) { name = 'warning'; cls = 'insecure'; tip = $t('Nicht sicher – die Verbindung ist nicht verschlüsselt'); }
      else if (url.startsWith('file:')) { name = 'file'; tip = $t('Lokale Datei'); }
      else name = 'globe';
    }
    if (siteInfo.dataset.icon !== name) setIcon(siteInfo, name);
    siteInfo.className = `omni-btn ${cls}`.trim();
    siteInfo.title = tip;

    const internal = !url || isInternal(url);
    star.classList.toggle('hidden', internal);
    star.classList.toggle('on', !internal && Bookmarks.has(url));
    star.title = Bookmarks.has(url) ? $t('Lesezeichen bearbeiten (Strg+D)') : $t('Lesezeichen für diese Seite (Strg+D)');
  }

  function focus() {
    input.focus();
    input.select();
  }

  // -------------------------------------------------------------------------
  // Vorschläge
  // -------------------------------------------------------------------------
  function highlight(text, q) {
    const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
    if (i < 0) return [text];
    return [text.slice(0, i), h('mark', {}, text.slice(i, i + q.length)), text.slice(i + q.length)];
  }

  function build() {
    const q = typed.trim();
    if (!q) return hide();
    const out = [];
    const seen = new Set();
    const push = (row) => {
      if (row.url && seen.has(row.url)) return;
      if (row.url) seen.add(row.url);
      out.push(row);
    };
    const completed = input.value !== typed ? input.value : null;
    const search = { kind: 'search', query: q };

    if (completed) push({ kind: 'url', url: toUrl(completed), label: completed, primary: true });
    else if (looksLikeUrl(q)) push({ kind: 'url', url: toUrl(q), label: q, primary: true });
    else out.push(search);
    if (out[0] !== search) out.push(search);

    const ql = q.toLowerCase();
    for (const t of state.tabs) {
      if (t.id === state.activeId || isInternal(t.url)) continue;
      if ((t.title || '').toLowerCase().includes(ql) || t.url.toLowerCase().includes(ql)) {
        push({ kind: 'tab', url: t.url, label: t.title || t.url, sub: hostOf(t.url), tabId: t.id, tag: $t('Zu Tab wechseln') });
      }
      if (out.length >= 4) break;
    }
    for (const b of Bookmarks.flat()) {
      if (b.title.toLowerCase().includes(ql) || b.url.toLowerCase().includes(ql)) push({ kind: 'url', url: b.url, label: b.title, sub: hostOf(b.url), tag: $t('Lesezeichen') });
      if (out.length >= 6) break;
    }
    for (const e of History.query(q, 8)) {
      if (out.length >= 8) break;
      push({ kind: 'url', url: e.url, label: e.title || e.url.replace(/^https?:\/\/(www\.)?/, ''), sub: e.title ? e.url.replace(/^https?:\/\/(www\.)?/, '') : null });
    }

    rows = out;
    sel = 0;
    render();
  }

  function render() {
    list.replaceChildren(...rows.map((r, i) => {
      let iconEl, text;
      if (r.kind === 'search') {
        iconEl = icon('search');
        text = [h('span', {}, r.query), h('span', { class: 'sg-sub' }, $t('Mit {engine} suchen', { engine: engine().name }))];
      } else {
        iconEl = r.primary ? icon('globe') : faviconEl(r.url, 16);
        text = [h('span', {}, highlight(r.label, typed.trim())), r.sub ? h('span', { class: 'sg-sub' }, highlight(r.sub, typed.trim())) : null];
      }
      return h('div', {
        class: `sg-row${i === sel ? ' sel' : ''}`, role: 'option',
        onmousemove: () => { if (sel !== i) { sel = i; mark(); } },
        onclick: (e) => commit(r, e)
      }, h('span', { class: 'sg-icon' }, iconEl), h('span', { class: 'sg-text' }, text), r.tag ? h('span', { class: 'sg-tag' }, r.tag) : null);
    }));
    const visible = rows.length > 0;
    list.classList.toggle('hidden', !visible);
    box.classList.toggle('suggesting', visible);
  }

  function mark() { $$('.sg-row', list).forEach((el, i) => el.classList.toggle('sel', i === sel)); }

  function hide() {
    rows = [];
    list.classList.add('hidden');
    box.classList.remove('suggesting');
  }

  function commit(row, e = {}) {
    let url;
    if (!row) url = toUrl(input.value);
    else if (row.kind === 'search') url = searchUrl(row.query);
    else if (row.kind === 'tab') { Tabs.activate(row.tabId); input.blur(); return; }
    else url = row.url;

    input.blur();
    if (e.altKey || e.button === 1) Tabs.create(url);
    else Tabs.navigate(url);
  }

  // -------------------------------------------------------------------------
  // Ereignisse
  // -------------------------------------------------------------------------
  input.addEventListener('mousedown', () => { selectOnMouseUp = document.activeElement !== input; });
  input.addEventListener('mouseup', () => {
    if (selectOnMouseUp && input.selectionStart === input.selectionEnd) input.select();
    selectOnMouseUp = false;
  });
  input.addEventListener('focus', () => {
    editing = true;
    typed = input.value;
    box.classList.add('focused');
    field.classList.remove('formatted');
  });
  input.addEventListener('blur', () => {
    editing = false;
    box.classList.remove('focused');
    hide();
    sync();
  });

  input.addEventListener('input', (e) => {
    typed = input.value;
    const atEnd = input.selectionStart === input.value.length;
    if (e.inputType === 'insertText' && atEnd) {
      const host = History.completeHost(typed);
      if (host && host.length > typed.length && host.startsWith(typed.toLowerCase())) {
        input.value = typed + host.slice(typed.length);
        input.setSelectionRange(typed.length, input.value.length);
      }
    }
    build();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!rows.length) return;
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      mark();
      const r = rows[sel];
      input.value = r.kind === 'search' ? r.query : r.kind === 'url' && r.primary ? r.label : r.url;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.ctrlKey && /^[a-z\d-]+$/i.test(typed.trim())) {
        input.blur();
        return Tabs.navigate(`https://www.${typed.trim()}.com`);
      }
      commit(rows.length ? rows[sel] : null, e);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      if (rows.length || input.value !== (isNewTab(currentUrl()) ? '' : currentUrl())) {
        hide();
        input.value = isNewTab(currentUrl()) ? '' : currentUrl();
        typed = input.value;
        input.select();
      } else {
        input.blur();
        Tabs.active()?.webview?.focus();
      }
    }
  });

  list.addEventListener('mousedown', (e) => e.preventDefault()); // Fokus im Eingabefeld halten
  star.addEventListener('click', () => Bookmarks.toggleCurrent(star));
  siteInfo.addEventListener('click', () => {
    const url = currentUrl();
    if (!url || isNewTab(url)) return focus();
    const secure = url.startsWith('https:');
    showMenu([
      { label: secure ? $t('Verbindung ist sicher') : url.startsWith('http:') ? $t('Verbindung ist nicht sicher') : $t('Interne Seite'), icon: secure ? 'lock' : 'warning', disabled: true },
      '-',
      { label: $t('Adresse kopieren'), icon: 'copy', onClick: () => { F.copy(url); toast($t('Adresse kopiert'), 'copy'); } },
      { label: $t('Seitenquelltext anzeigen'), icon: 'code', disabled: !/^https?:/.test(url), onClick: () => Tabs.create(`view-source:${url}`) }
    ], { anchor: siteInfo, align: 'start' });
  });

  on('nav-state', sync);
  on('settings', sync);

  return { sync, focus, get editing() { return editing; } };
})();
