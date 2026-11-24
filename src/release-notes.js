'use strict';
/*
 * „Was ist neu?“ im Update-Fenster: liest die CHANGELOG.md der neuen Version und liefert die Abschnitte
 * zwischen der installierten und der neuen Version als Daten. Die Oberfläche baut daraus selbst Elemente –
 * hier entsteht kein HTML.
 *
 * Die Texte von GitHub (releases.atom) taugen dafür nicht: Ohne Release-Text liefert GitHub die
 * Commit-Nachricht, mitten im Wort abgeschnitten.
 */

const MAX_LENGTH = 1024 * 1024;
const MAX_VERSIONS = 15;
const MAX_ITEMS = 40; // je Abschnitt
const MAX_TEXT = 700; // je Punkt
const TIMEOUT_MS = 10000;
const KINDS = { added: 'added', changed: 'changed', fixed: 'fixed', removed: 'changed', security: 'fixed' };

/** „1.10.0“ > „1.9.2“ – reicht für Falcons Versionsnummern */
function newer(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

/** Markdown der CHANGELOG.md → [{ version, date, groups: [{ kind, items: [{ text, sub }] }] }] */
function parse(markdown) {
  const out = [];
  let section = null;
  let group = null;
  let item = null;
  for (const line of String(markdown || '').split(/\r?\n/)) {
    let m = line.match(/^##\s+\[?v?(\d+\.\d+\.\d+)\]?(?:.*?(\d{4}-\d{2}-\d{2}))?/);
    if (m) { section = { version: m[1], date: m[2] || '', groups: [] }; out.push(section); group = item = null; continue; }
    if (!section) continue;
    m = line.match(/^#{3,}\s+(.+)$/);
    if (m) { group = { kind: KINDS[m[1].trim().toLowerCase()] || '', items: [] }; section.groups.push(group); item = null; continue; }
    const text = line.trim();
    // Leerzeile beendet den Punkt; „[2.0.2]: https://…“ sind Verweise am Dateiende
    if (!text || /^\[[^\]]+\]:\s/.test(text)) { item = null; continue; }
    m = line.match(/^(\s*)[-*]\s+(.+)$/);
    // Umgebrochene Zeile gehört zum Punkt davor
    if (!m && item) { item.text += ` ${text}`; continue; }
    if (!group) { group = { kind: '', items: [] }; section.groups.push(group); }
    item = { text: m ? m[2].trim() : text, sub: !!(m && m[1].length >= 2) };
    group.items.push(item);
  }
  return out;
}

const cut = (t) => (t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT).replace(/\s+\S*$/, '')} …` : t);

/** Nur Versionen, die der Nutzer noch nicht hat – neueste zuerst */
function between(sections, installed, available) {
  return sections
    .filter((s) => newer(s.version, installed) && !newer(s.version, available))
    .sort((a, b) => (newer(a.version, b.version) ? -1 : 1))
    .map((s) => ({
      version: s.version,
      date: s.date,
      groups: s.groups
        .map((g) => ({ kind: g.kind, items: g.items.slice(0, MAX_ITEMS).map((i) => ({ text: cut(i.text), sub: i.sub })) }))
        .filter((g) => g.items.length),
    }))
    .filter((s) => s.groups.length)
    .slice(0, MAX_VERSIONS);
}

/** Lädt die CHANGELOG.md zum Tag der neuen Version. Bei Fehlern: null (dann ohne Text) */
async function load(fetchFn, repo, installed, available) {
  if (!repo || !/^\d+\.\d+\.\d+$/.test(String(available))) return null;
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(`https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/v${available}/CHANGELOG.md`, { signal: stop.signal });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > MAX_LENGTH) return null;
    const notes = between(parse(text), installed, available);
    return notes.length ? notes : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { parse, between, load, newer };
