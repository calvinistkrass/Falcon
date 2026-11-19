// FalCoin-Verlauf: Website-Besuche, Belohnungen, Missionen und Käufe
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, CoinIcon, Empty, Screen } from '@/components/ui';
import { LogEntry, MISSION_TEXT, errorText, useSession } from '@/lib/session';
import { C } from '@/lib/theme';

const GOALS: Record<string, number> = { visits20: 20, sites5: 5, gamemode30: 30 };
function label(e: LogEntry) {
  if (e.type === 'visits') return `Website-Besuche · ${new Date(e.label).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}`;
  if (e.type === 'daily') return `Tägliche Belohnung · Tag ${e.label}`;
  if (e.type === 'mission') return `Mission: ${(MISSION_TEXT[e.label] || e.label).replace('{goal}', String(GOALS[e.label] || ''))}`;
  if (e.type === 'purchase') return `Kauf: ${e.label === 'gameMode' ? 'Game Mode · 2 Monate' : e.label === 'beta14' ? 'Beta-Zugriff' : e.label}`;
  return e.type;
}
const ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = { purchase: 'storefront-outline', mission: 'flag-outline', daily: 'gift-outline', visits: 'globe-outline' };

export default function CoinLog() {
  const { user, wallet, coinLog } = useSession();
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { coinLog().then(setEntries).catch((e) => setError(errorText(e))); }, [coinLog]);
  useEffect(() => { if (user) load(); }, [user, load]);

  return (
    <Screen title="FalCoin-Verlauf" right={<View style={s.balance}><CoinIcon size={18} /><Text style={s.balanceText}>{(wallet.balance + wallet.pending).toLocaleString('de-DE')}</Text></View>}>
      {!user ? <Empty icon="time-outline" title="Nicht angemeldet" />
        : error ? <Empty icon="cloud-offline-outline" title="Nicht geladen" text={error} />
          : !entries ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
            : !entries.length ? <Empty icon="time-outline" title="Noch keine Einträge" text="Besuche Websites oder hol dir die tägliche Belohnung." />
              : (
                <Card>
                  {entries.map((e, i) => (
                    <View key={`${e.at}-${i}`} style={[s.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line }]}>
                      <View style={[s.ic, { backgroundColor: e.amount < 0 ? 'rgba(240,88,91,0.14)' : 'rgba(61,214,140,0.14)' }]}>
                        <Ionicons name={ICONS[e.type] || 'ellipse-outline'} size={17} color={e.amount < 0 ? C.danger : C.green} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.title} numberOfLines={2}>{label(e)}</Text>
                        <Text style={s.when}>{new Date(e.at).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                      <Text style={[s.amount, { color: e.amount < 0 ? C.danger : C.green }]}>{e.amount > 0 ? '+' : ''}{e.amount.toLocaleString('de-DE')}</Text>
                    </View>
                  ))}
                </Card>
              )}
    </Screen>
  );
}

const s = StyleSheet.create({
  balance: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 32, borderRadius: 16, backgroundColor: C.goldSoft },
  balanceText: { color: C.text, fontSize: 14.5, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  ic: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: 14.5, fontWeight: '600' },
  when: { color: C.text3, fontSize: 12.5, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '800' }
});
