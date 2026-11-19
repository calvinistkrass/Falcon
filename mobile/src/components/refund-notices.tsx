// Entschiedene Rückerstattungen beim Start als Hinweis zeigen (Falcon kann keine E-Mails senden);
// das Admin-Konto bekommt eine Mitteilung über offene Anträge.
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { ITEM_NAME, Refund, useSession } from '@/lib/session';

const show = (title: string, text: string, buttons?: { text: string; onPress?: () => void; style?: 'cancel' }[]) =>
  new Promise<void>((resolve) => Alert.alert(title, text, (buttons || [{ text: 'OK' }]).map((b) => ({ ...b, onPress: () => { b.onPress?.(); resolve(); } })), { cancelable: false }));

export function RefundNotices() {
  const { user, admin, refundNotices, markRefundSeen, adminRefunds, refreshCoins } = useSession();
  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    let stop = false;
    const t = setTimeout(async () => {
      let list: Refund[] = [];
      try { list = await refundNotices(); } catch { return; }
      for (const r of list) {
        if (stop) return;
        const ok = r.status === 'approved';
        await show(ok ? 'Rückerstattung genehmigt' : 'Rückerstattung abgelehnt',
          (ok ? `Du hast ${r.price.toLocaleString('de-DE')} FalCoins für „${ITEM_NAME(r.item)}“ zurückbekommen. Der Kauf wurde rückgängig gemacht.`
            : `Deine Rückerstattung für „${ITEM_NAME(r.item)}“ wurde abgelehnt.`) + (r.note ? `\n\nNachricht: ${r.note}` : ''));
        await markRefundSeen(r.id).catch(() => {});
      }
      if (list.some((r) => r.status === 'approved')) refreshCoins();
    }, 4000);
    return () => { stop = true; clearTimeout(t); };
  }, [uid, refundNotices, markRefundSeen, refreshCoins]);
  useEffect(() => {
    if (!uid || !admin) return;
    const t = setTimeout(async () => {
      try {
        const n = (await adminRefunds()).filter((r) => r.status === 'pending').length;
        if (n) await show('Rückerstattungen', n === 1 ? '1 neuer Antrag auf Rückerstattung.' : `${n} neue Anträge auf Rückerstattung.`,
          [{ text: 'Später', style: 'cancel' }, { text: 'Ansehen', onPress: () => router.push('/admin') }]);
      } catch { /* offline */ }
    }, 6000);
    return () => clearTimeout(t);
  }, [uid, admin, adminRefunds]);
  return null;
}
