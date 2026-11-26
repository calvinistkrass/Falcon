// Benachrichtigungen vom Admin an alle mit Konto: einmal anzeigen, mit „Verstanden“ wegklicken
import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';
import { load, save } from '@/lib/storage';
import { useSession } from '@/lib/session';

const SEEN_KEY = 'falcon.notices.seen';

export function Notices() {
  const { user, notices } = useSession();

  useEffect(() => {
    if (!user) return;
    let stop = false;
    const check = async () => {
      try {
        const seen: string[] = JSON.parse((await load(SEEN_KEY)) || '[]');
        const fresh = (await notices()).filter((n) => !seen.includes(n.id)).reverse(); // älteste zuerst
        const next = (i: number) => {
          if (stop || i >= fresh.length) return;
          const n = fresh[i];
          Alert.alert(n.title || 'Falcon', n.text, [{
            text: 'Verstanden',
            onPress: async () => {
              const list: string[] = JSON.parse((await load(SEEN_KEY)) || '[]');
              await save(SEEN_KEY, JSON.stringify([...list.filter((x) => x !== n.id), n.id].slice(-200)));
              next(i + 1);
            }
          }], { cancelable: false });
        };
        next(0);
      } catch { /* offline */ }
    };
    const first = setTimeout(check, 2500);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => { stop = true; clearTimeout(first); sub.remove(); };
  }, [user, notices]);

  return null;
}
