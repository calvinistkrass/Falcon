// FalCoin-Shop – dieselben Artikel und Preise wie in Falcon auf dem PC
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, CoinIcon, Empty, Screen } from '@/components/ui';
import { SHOP, ShopItem, errorText, fmtDate, useSession } from '@/lib/session';
import { C, R } from '@/lib/theme';

// Vorteile-Liste (optional je Artikel)
const perksOf = (item: ShopItem): readonly string[] => ('perks' in item ? (item as { perks: readonly string[] }).perks : []);

export default function Shop() {
  const { user, wallet, refreshCoins, purchase } = useSession();
  const [busy, setBusy] = useState('');
  const [now] = useState(Date.now);
  useEffect(() => { refreshCoins(); }, [refreshCoins]);

  if (!user) {
    return (
      <Screen title="FalCoin-Shop">
        <Empty icon="storefront-outline" title="Nicht angemeldet" text="Melde dich an, um FalCoins zu sammeln und im Shop einzulösen.">
          <View style={{ marginTop: 12 }}><Button title="Anmelden" onPress={() => router.navigate('/account')} /></View>
        </Empty>
      </Screen>
    );
  }
  const coins = wallet.balance + wallet.pending;

  const buy = (item: ShopItem, active: boolean) => {
    const price = item.price.toLocaleString('de-DE');
    Alert.alert(active ? `${item.title} verlängern?` : `${item.title} kaufen?`, `${price} FalCoins werden von deinem Guthaben abgezogen.`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: `Für ${price} FalCoins kaufen`,
        onPress: async () => {
          setBusy(item.id);
          try {
            const r = await purchase(item.id);
            Alert.alert('Gekauft', `${item.title} aktiv bis ${fmtDate(r.until)}`);
          } catch (e) { Alert.alert('Kauf fehlgeschlagen', errorText(e)); }
          setBusy('');
        }
      }
    ]);
  };

  return (
    <Screen title="FalCoin-Shop" right={<View style={s.balance}><CoinIcon size={18} /><Text style={s.balanceText}>{coins.toLocaleString('de-DE')}</Text></View>}>
      <Text style={s.sub}>Du bekommst einen FalCoin für jede Website, die du besuchst, solange du angemeldet bist – hier im Browser und in Falcon auf dem PC.</Text>
      <View style={{ gap: 14 }}>
        {SHOP.map((item) => {
          const until = wallet[item.field];
          const active = until > now;
          const missing = item.price - coins;
          const off = 'available' in item && item.available === false;
          return (
            <Card key={item.id} style={[s.item, active ? s.owned : null]}>
              <View style={s.top}>
                <View style={s.ic}><Ionicons name={item.icon} size={24} color={C.accent} /></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Text style={s.title}>{item.title}</Text>
                    {active ? <View style={s.badge}><Text style={s.badgeText}>Aktiv</Text></View> : null}
                  </View>
                  <View style={s.price}><CoinIcon size={16} /><Text style={s.priceText}>{item.price.toLocaleString('de-DE')}</Text></View>
                </View>
              </View>
              <Text style={s.text}>{item.text}</Text>
              {perksOf(item).length ? (
                <View style={{ gap: 6 }}>
                  <Text style={s.perksHead}>Das bekommst du:</Text>
                  {perksOf(item).map((p) => (
                    <View key={p} style={{ flexDirection: 'row', gap: 8 }}>
                      <Ionicons name="checkmark" size={16} color={C.green} style={{ marginTop: 1 }} />
                      <Text style={[s.text, { flex: 1 }]}>{p}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {'note' in item ? <Text style={s.note}>{item.note}</Text> : null}
              {off && 'unavailableText' in item ? (
                <View style={s.off}><Ionicons name="time-outline" size={16} color={C.text2} /><Text style={[s.text, { flex: 1 }]}>{item.unavailableText}</Text></View>
              ) : null}
              {active ? <Text style={s.until}>Aktiv bis {fmtDate(until)}</Text> : null}
              <Button
                title={off ? 'Zurzeit nicht verfügbar' : missing > 0 ? `Noch ${missing.toLocaleString('de-DE')} FalCoins` : active ? item.extendLabel : 'Kaufen'}
                disabled={off || missing > 0} loading={busy === item.id} onPress={() => buy(item, active)} />
            </Card>
          );
        })}
      </View>
      <View style={{ marginTop: 18, flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Button title="Missionen" icon="flag-outline" variant="ghost" small onPress={() => router.push('/rewards')} /></View>
        <View style={{ flex: 1 }}><Button title="Verlauf" icon="time-outline" variant="ghost" small onPress={() => router.push('/coinlog')} /></View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  sub: { color: C.text2, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 32, borderRadius: 16, backgroundColor: C.goldSoft },
  balanceText: { color: C.text, fontSize: 14.5, fontWeight: '800' },
  item: { padding: 16, gap: 12 },
  owned: { borderColor: 'rgba(124,108,255,0.5)' },
  top: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  ic: { width: 46, height: 46, borderRadius: R.md, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: 16.5, fontWeight: '800' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: C.accentSoft },
  badgeText: { color: '#c2baff', fontSize: 12, fontWeight: '700' },
  price: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  priceText: { color: C.gold, fontSize: 15, fontWeight: '800' },
  text: { color: C.text2, fontSize: 14, lineHeight: 20 },
  perksHead: { color: C.text3, fontSize: 12.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  note: { color: C.text3, fontSize: 13, fontStyle: 'italic' },
  until: { color: C.green, fontSize: 13.5, fontWeight: '600' },
  off: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: R.md, backgroundColor: C.raised }
});
