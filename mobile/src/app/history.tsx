// Verlauf – vom PC und von diesem Handy (nicht aus Inkognito-Tabs)
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Empty, Favicon, Field, Screen } from '@/components/ui';
import { errorText, useSession } from '@/lib/session';
import { C, hostOf } from '@/lib/theme';

function dayLabel(ms: number) {
  const d = new Date(ms); const t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Heute';
  if (d.toDateString() === y.toDateString()) return 'Gestern';
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function History() {
  const { user, history, openUrl, clearHistory, removeHistory } = useSession();
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const out: { day: string; items: typeof history }[] = [];
    for (const e of history.slice(0, 500)) {
      if (t && !e.url.toLowerCase().includes(t) && !(e.title || '').toLowerCase().includes(t)) continue;
      const day = dayLabel(e.last || 0);
      if (out[out.length - 1]?.day !== day) out.push({ day, items: [] });
      out[out.length - 1].items.push(e);
    }
    return out;
  }, [history, q]);

  if (!user) return <Screen title="Verlauf"><Empty icon="time-outline" title="Nicht angemeldet" text="Melde dich an, um deinen Verlauf zu sehen." /></Screen>;
  const clear = () => Alert.alert('Verlauf löschen?', 'Der Verlauf wird auf allen Geräten gelöscht, die ihn synchronisieren.', [
    { text: 'Abbrechen', style: 'cancel' },
    { text: 'Löschen', style: 'destructive', onPress: () => clearHistory().catch((e) => Alert.alert('Fehler', errorText(e))) }
  ]);
  const open = (url: string) => { openUrl(url); router.navigate('/browser'); };

  return (
    <Screen title="Verlauf" right={history.length ? <Pressable hitSlop={10} onPress={clear} accessibilityLabel="Verlauf löschen"><Ionicons name="trash-outline" size={21} color={C.danger} /></Pressable> : undefined}>
      <Field icon="search" placeholder="Verlauf durchsuchen" value={q} onChangeText={setQ} autoCapitalize="none" autoCorrect={false} />
      {!history.length ? <Empty icon="time-outline" title="Noch kein Verlauf" text="Besuchte Seiten aus Falcon auf dem PC und von hier erscheinen hier. Inkognito-Tabs werden nicht gespeichert." /> : null}
      {groups.map((g) => (
        <View key={g.day}>
          <Text style={s.day}>{g.day}</Text>
          <Card>
            {g.items.map((e, i) => (
              <Pressable key={e.url} onPress={() => open(e.url)} onLongPress={() => Alert.alert(hostOf(e.url), e.url, [
                { text: 'Abbrechen', style: 'cancel' }, { text: 'Aus Verlauf entfernen', style: 'destructive', onPress: () => removeHistory(e.url).catch(() => {}) }
              ])} style={({ pressed }) => [s.row, i > 0 && s.sep, pressed && { backgroundColor: 'rgba(255,255,255,0.04)' }]}>
                <Favicon url={e.url} size={20} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.title} numberOfLines={1}>{e.title || hostOf(e.url)}</Text>
                  <Text style={s.url} numberOfLines={1}>{hostOf(e.url)}{e.last ? ` · ${new Date(e.last).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ''}</Text>
                </View>
              </Pressable>
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  day: { color: C.text3, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 20, marginBottom: 8, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  title: { color: C.text, fontSize: 15, fontWeight: '600' },
  url: { color: C.text3, fontSize: 12.5, marginTop: 1 }
});
