// Offene Tabs auf dem Gerät merken, damit sie nach dem Neustart der App wieder da sind.
// Inkognito-Tabs werden nie gespeichert. Datei statt SecureStore, weil die Liste groß werden kann.
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

export type SavedTabs = { activeId: string; tabs: { id: string; url: string; title: string }[] };

const KEY = 'falcon.tabs';
const web = Platform.OS === 'web';
const file = () => new File(Paths.document, 'falcon-tabs.json');

function parse(raw: string | null): SavedTabs | null {
  if (!raw) return null;
  try {
    const x = JSON.parse(raw);
    const tabs = Array.isArray(x?.tabs)
      ? x.tabs.filter((t: unknown): t is SavedTabs['tabs'][number] => !!t && typeof (t as { id?: unknown }).id === 'string' && typeof (t as { url?: unknown }).url === 'string')
        .map((t: SavedTabs['tabs'][number]) => ({ id: t.id, url: t.url, title: typeof t.title === 'string' ? t.title : '' }))
      : [];
    return { activeId: typeof x?.activeId === 'string' ? x.activeId : '', tabs: tabs.slice(0, 100) };
  } catch {
    return null;
  }
}

export async function loadTabs(): Promise<SavedTabs | null> {
  if (web) { try { return parse(localStorage.getItem(KEY)); } catch { return null; } }
  try {
    const f = file();
    return f.exists ? parse(await f.text()) : null;
  } catch {
    return null;
  }
}

/** sync: beim Wechsel in den Hintergrund sofort schreiben (die App kann danach jederzeit beendet werden) */
export function saveTabs(data: SavedTabs, sync = false): Promise<void> | void {
  const raw = JSON.stringify(data);
  if (web) { try { localStorage.setItem(KEY, raw); } catch { /* egal */ } return; }
  try {
    const f = file();
    if (sync) { f.writeSync(raw); return; }
    return f.write(raw).catch(() => {});
  } catch {
    /* Speicher voll o. Ä. – Tabs gehen dann eben verloren */
  }
}
