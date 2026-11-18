// Update-Hinweis: Gibt es im GitHub-Release eine neuere Falcon-Mobile-APK als die installierte?
// Nur in der installierten Android-App sinnvoll (Expo Go und Web aktualisieren sich anders).
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { load, save } from './storage';
import { APP_VERSION } from './session';

const RELEASES = 'https://api.github.com/repos/calvinistkrass/Falcon/releases?per_page=10';
const DISMISS_KEY = 'falcon.update.dismissed';
const CHECK_EVERY_MS = 6 * 3600_000;

export type AppUpdate = { version: string; url: string; size: number };

/** „1.10.0“ > „1.9.2“ */
export function newer(a: string, b: string) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

export async function findUpdate(current = APP_VERSION): Promise<AppUpdate | null> {
  const res = await fetch(RELEASES, { headers: { accept: 'application/vnd.github+json' } });
  if (!res.ok) return null;
  const list = (await res.json()) as { draft?: boolean; prerelease?: boolean; assets?: { name: string; browser_download_url: string; size: number }[] }[];
  let best: AppUpdate | null = null;
  for (const r of Array.isArray(list) ? list : []) {
    if (r.draft || r.prerelease) continue;
    for (const a of r.assets || []) {
      const m = a.name.match(/^Falcon-Mobile-(\d+\.\d+\.\d+)\.apk$/i);
      if (m && newer(m[1], best?.version || current)) best = { version: m[1], url: a.browser_download_url, size: a.size };
    }
  }
  return best;
}

const supported = () => Platform.OS === 'android' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

/** Hinweis für die Startseite: einmal beim Start und danach alle 6 Stunden prüfen. */
export function useAppUpdate() {
  const [update, setUpdate] = useState<AppUpdate | null>(null);

  useEffect(() => {
    if (!supported()) return;
    let stop = false;
    const check = async () => {
      try {
        const u = await findUpdate();
        const dismissed = await load(DISMISS_KEY);
        if (!stop) setUpdate(u && u.version !== dismissed ? u : null);
      } catch { /* offline */ }
    };
    const first = setTimeout(check, 1500);
    const iv = setInterval(check, CHECK_EVERY_MS);
    return () => { stop = true; clearTimeout(first); clearInterval(iv); };
  }, []);

  const download = useCallback(() => { if (update) Linking.openURL(update.url); }, [update]);
  const dismiss = useCallback(() => { if (update) save(DISMISS_KEY, update.version); setUpdate(null); }, [update]);
  return { update, download, dismiss };
}
