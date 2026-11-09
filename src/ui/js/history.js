'use strict';
/* Verlauf – Grundlage für die Vorschläge der Adressleiste */

const History = (() => {
  const KEY = 'falcon.history';
  const MAX = 3000;
  let entries = store.get(KEY, []);
  const persist = debounce(() => store.set(KEY, entries.slice(0, MAX)), 800);

  const normalize = (url) => url.replace(/#.*$/, '');

  function add(url, title) {
    if (!/^https?:/i.test(url)) return;
    url = normalize(url);
    const i = entries.findIndex((e) => e.url === url);
    const entry = i >= 0 ? entries.splice(i, 1)[0] : { url, title: '', visits: 0 };
    entry.visits++;
    entry.last = Date.now();
    if (title) entry.title = title;
    entries.unshift(entry);
    persist();
  }

  function setTitle(url, title) {
    const e = entries.find((x) => x.url === normalize(url));
    if (e && title) { e.title = title; persist(); }
  }

  /** Häufigkeit × Aktualität – ähnlich der „Frecency“ in Firefox. */
  function score(e, q) {
    const ageDays = (Date.now() - e.last) / 864e5;
    const recency = ageDays < 1 ? 100 : ageDays < 7 ? 70 : ageDays < 30 ? 50 : ageDays < 90 ? 30 : 10;
    const host = hostOf(e.url);
    let match = 1;
    if (host.startsWith(q)) match = 4;
    else if (host.includes(q)) match = 2.5;
    else if ((e.title || '').toLowerCase().startsWith(q)) match = 2;
    return Math.log2(1 + e.visits) * recency * match;
  }

  function query(q, limit = 6) {
    q = q.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
    if (!q) return [];
    return entries
      .filter((e) => e.url.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').includes(q) || (e.title || '').toLowerCase().includes(q))
      .map((e) => ({ e, s: score(e, q) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map((x) => x.e);
  }

  /** Bester Host zum inline Vervollständigen („you“ → „youtube.com“). */
  function completeHost(prefix) {
    const p = prefix.toLowerCase().replace(/^https?:\/\//, '');
    if (p.length < 2 || /[\s/]/.test(p)) return null;
    const bare = p.replace(/^www\./, '');
    const counts = new Map();
    for (const e of entries) {
      const host = hostOf(e.url);
      if (host.startsWith(bare)) counts.set(host, (counts.get(host) || 0) + score(e, bare));
    }
    let best = null, bestScore = 0;
    for (const [host, s] of counts) if (s > bestScore) { best = host; bestScore = s; }
    if (!best) return null;
    return p.startsWith('www.') ? 'www.' + best : best;
  }

  function clear() { entries = []; store.set(KEY, []); emit('history-changed'); }
  function remove(url) { entries = entries.filter((e) => e.url !== url); persist(); emit('history-changed'); }
  const all = () => entries;

  return { add, setTitle, query, completeHost, clear, remove, all };
})();
