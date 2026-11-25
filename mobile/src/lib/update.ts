// Update-Hinweis: Gibt es im GitHub-Release eine neuere Falcon-Mobile-APK als die installierte?
// Nur in der installierten Android-App sinnvoll (Expo Go und Web aktualisieren sich anders).
// Seit 2.4.0 lädt Falcon die APK selbst herunter und öffnet den Android-Installer – der Nutzer bestätigt
// nur noch die Installation (beim ersten Mal erlaubt er Falcon dafür, Apps zu installieren).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { setUpdateRequired } from './required';
import { load, save } from './storage';
import { APP_VERSION } from './session';

const RELEASES = 'https://api.github.com/repos/calvinistkrass/Falcon/releases?per_page=10';
const DISMISS_KEY = 'falcon.update.dismissed';
const CHECK_EVERY_MS = 6 * 3600_000;
const DOWNLOAD_PAGE = 'https://falconbrowser.de/download#android';
const FLAG_GRANT_READ_URI_PERMISSION = 1;

export type AppUpdate = { version: string; url: string; size: number; behind: number };
const MAX_BEHIND = 2; // ab so vielen Versionen Rückstand ist das Update Pflicht

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
  const versions = new Set<string>(); // alle neueren Versionen mit APK
  for (const r of Array.isArray(list) ? list : []) {
    if (r.draft || r.prerelease) continue;
    for (const a of r.assets || []) {
      const m = a.name.match(/^Falcon-Mobile-(\d+\.\d+\.\d+)\.apk$/i);
      if (m && newer(m[1], current)) versions.add(m[1]);
      if (m && newer(m[1], best?.version || current)) best = { version: m[1], url: a.browser_download_url, size: a.size, behind: 0 };
    }
  }
  return best ? { ...(best as AppUpdate), behind: versions.size } : null;
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
        const must = !!u && u.behind >= MAX_BEHIND;
        await setUpdateRequired(must, APP_VERSION);
        if (!stop) setUpdate(u && (must || u.version !== dismissed) ? u : null);
      } catch { /* offline */ }
    };
    const first = setTimeout(check, 1500);
    const iv = setInterval(check, CHECK_EVERY_MS);
    return () => { stop = true; clearTimeout(first); clearInterval(iv); };
  }, []);

  // null = nichts los, 0…1 = Download läuft, 'ready' = APK liegt bereit (Installer kann erneut geöffnet werden)
  const [progress, setProgress] = useState<number | 'ready' | null>(null);
  const [error, setError] = useState('');
  const busy = useRef(false);

  const install = useCallback(async (file: File) => {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: file.contentUri,
      type: 'application/vnd.android.package-archive',
      flags: FLAG_GRANT_READ_URI_PERMISSION
    });
  }, []);

  const download = useCallback(async () => {
    if (!update || busy.current) return;
    busy.current = true;
    setError('');
    try {
      const file = new File(Paths.cache, `Falcon-Mobile-${update.version}.apk`);
      // Schon vollständig heruntergeladen? Dann nur den Installer öffnen.
      if (!(file.exists && update.size && file.size === update.size)) {
        setProgress(0);
        await File.downloadFileAsync(update.url, file, {
          idempotent: true,
          onProgress: ({ bytesWritten, totalBytes }) => {
            const total = totalBytes > 0 ? totalBytes : update.size;
            if (total) setProgress(Math.min(1, bytesWritten / total));
          }
        });
      }
      setProgress('ready');
      await install(file);
    } catch {
      setProgress(null);
      setError('Das Update konnte nicht heruntergeladen werden. Prüfe deine Internetverbindung oder lade es von falconbrowser.de herunter.');
    } finally {
      busy.current = false;
    }
  }, [update, install]);

  const openWebsite = useCallback(() => { Linking.openURL(DOWNLOAD_PAGE).catch(() => {}); }, []);
  const dismiss = useCallback(() => { if (update) save(DISMISS_KEY, update.version); setUpdate(null); setProgress(null); setError(''); }, [update]);
  return { update, download, dismiss, progress, error, openWebsite };
}
