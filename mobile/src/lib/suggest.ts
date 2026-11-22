// Vorschläge beim Tippen in Such- und Adressleiste (wie in Chrome/Brave): passende Seiten aus Verlauf und
// Lesezeichen plus Suchvorschläge der gewählten Suchmaschine.
import { useEffect, useMemo, useState } from 'react';
import type { Bookmark, HistoryEntry } from './session';
import { hostOf } from './theme';

export type Suggestion = { kind: 'search' | 'history' | 'bookmark'; text: string; url?: string; sub?: string };

const REMOTE: Record<string, (q: string) => string> = {
  google: (q) => `https://suggestqueries.google.com/complete/search?client=firefox&hl=de&q=${encodeURIComponent(q)}`,
  duckduckgo: (q) => `https://duckduckgo.com/ac/?type=list&q=${encodeURIComponent(q)}`
};

function flat(list: Bookmark[], out: { title: string; url: string }[] = []) {
  for (const b of list) {
    if (b.folder) flat(b.children || [], out);
    else if (b.url) out.push({ title: b.title || b.url, url: b.url });
  }
  return out;
}
const short = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

export function useSuggestions(query: string, opts: { history: HistoryEntry[]; bookmarks: Bookmark[]; engine: string; enabled: boolean }) {
  const { history, bookmarks, engine, enabled } = opts;
  const q = query.trim();
  // Antwort der Suchmaschine – gehört immer zu genau einer Eingabe (alte Antworten werden ignoriert)
  const [remote, setRemote] = useState<{ q: string; list: string[] }>({ q: '', list: [] });

  useEffect(() => {
    if (!enabled || !q || q.length > 120 || /^[a-z][a-z\d+.-]*:\/\//i.test(q)) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch((REMOTE[engine] || REMOTE.google)(q), { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: unknown) => {
          const list = Array.isArray(d) && Array.isArray(d[1]) ? (d[1] as unknown[]).filter((x): x is string => typeof x === 'string') : [];
          setRemote({ q, list: list.slice(0, 6) });
        })
        .catch(() => { /* offline oder abgebrochen */ });
    }, 140);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, engine, enabled]);

  const local = useMemo(() => {
    if (!q) return [] as Suggestion[];
    const ql = q.toLowerCase();
    const out: Suggestion[] = [];
    const seen = new Set<string>();
    const hits = history
      .filter((e) => e.url && (e.url.toLowerCase().includes(ql) || (e.title || '').toLowerCase().includes(ql)))
      .sort((a, b) => {
        // Seiten, deren Adresse mit der Eingabe beginnt, zuerst – dann häufig und kürzlich besuchte
        const pa = short(a.url).toLowerCase().startsWith(ql) ? 1 : 0, pb = short(b.url).toLowerCase().startsWith(ql) ? 1 : 0;
        return pb - pa || (b.visits || 0) - (a.visits || 0) || (b.last || 0) - (a.last || 0);
      });
    for (const b of flat(bookmarks)) {
      if (out.length >= 2) break;
      if ((b.title.toLowerCase().includes(ql) || b.url.toLowerCase().includes(ql)) && !seen.has(b.url)) {
        seen.add(b.url); out.push({ kind: 'bookmark', text: b.title, url: b.url, sub: short(b.url) });
      }
    }
    for (const e of hits) {
      if (out.length >= 4) break;
      if (seen.has(e.url)) continue;
      seen.add(e.url);
      out.push({ kind: 'history', text: e.title || short(e.url), url: e.url, sub: e.title ? short(e.url) : hostOf(e.url) });
    }
    return out;
  }, [q, history, bookmarks]);

  return useMemo(() => {
    if (!enabled || !q) return [] as Suggestion[];
    const searches = remote.q === q ? remote.list.filter((s) => s.toLowerCase() !== q.toLowerCase()).slice(0, 5) : [];
    return [{ kind: 'search', text: q } as Suggestion, ...local, ...searches.map((s) => ({ kind: 'search', text: s }) as Suggestion)];
  }, [enabled, q, local, remote]);
}
