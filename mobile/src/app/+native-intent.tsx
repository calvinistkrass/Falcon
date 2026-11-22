// Links von außen (Falcon als Standardbrowser): http(s)-Adressen nicht als App-Pfad deuten, sondern im
// Browser-Tab öffnen. Alles andere (falcon://…) geht wie bisher an Expo Router.
import { pushIncoming } from '@/lib/incoming';

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (/^https?:\/\//i.test(path)) {
      pushIncoming(path);
      return '/browser';
    }
  } catch { /* nie abstürzen */ }
  return path;
}
