// Tägliche Belohnung & Missionen – wie in Falcon auf dem PC
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Empty, Screen, Section } from '@/components/ui';
import { MISSION_TEXT, errorText, useSession } from '@/lib/session';
import { C, R } from '@/lib/theme';

export default function Rewards() {
  const { user, daily, claimDaily, missions, claimMission } = useSession();
  const [busy, setBusy] = useState('');
  if (!user) return <Screen title="Belohnungen"><Empty icon="gift-outline" title="Nicht angemeldet" text="Melde dich an, um Belohnungen abzuholen." /></Screen>;

  const claim = async () => {
    setBusy('daily');
    try {
      const r = await claimDaily();
      Alert.alert('Tägliche Belohnung', r.streak % 7 === 0 ? `+${r.reward} FalCoins – ${r.streak} Tage in Folge, Bonus!` : `+${r.reward} FalCoins · Tag ${r.streak} in Folge`);
    } catch (e) { Alert.alert('Tägliche Belohnung', errorText(e)); }
    setBusy('');
  };
  const claimM = async (id: string) => {
    setBusy(id);
    try { const r = await claimMission(id); Alert.alert('Mission geschafft', `+${r.reward} FalCoins für die Mission`); } catch (e) { Alert.alert('Mission', errorText(e)); }
    setBusy('');
  };
  const doneDays = daily.streak % 7 || (daily.streak && !daily.available ? 7 : 0);

  return (
    <Screen title="Belohnungen">
      <Card style={{ padding: 16, gap: 14 }}>
        <View>
          <Text style={s.h}>Tägliche Belohnung</Text>
          <Text style={s.p}>Jeden Tag 10 FalCoins – am 7. Tag in Folge gibt es 50 extra.</Text>
        </View>
        <View style={s.days}>
          {Array.from({ length: 7 }, (_, i) => i + 1).map((n) => (
            <View key={n} style={[s.day, doneDays >= n && s.dayDone, n === 7 && s.dayBonus]}>
              <Text style={s.dayLabel}>Tag {n}</Text>
              <Text style={[s.dayValue, n === 7 && { color: C.gold }]}>+{n === 7 ? 60 : 10}</Text>
            </View>
          ))}
        </View>
        <Text style={s.p}>{daily.streak === 1 ? 'Serie: 1 Tag' : `Serie: ${daily.streak} Tage`}</Text>
        {daily.available
          ? <Button title={`+${daily.next} abholen`} icon="gift-outline" variant="gold" onPress={claim} loading={busy === 'daily'} />
          : <View style={s.claimed}><Ionicons name="checkmark-circle" size={18} color={C.green} /><Text style={s.claimedText}>Heute abgeholt</Text></View>}
      </Card>

      <Section>Missionen von heute</Section>
      <Card>
        {missions.map((m, i) => (
          <View key={m.id} style={[s.mission, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line }]}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={[s.mText, m.claimed && { color: C.text3 }]}>{MISSION_TEXT[m.id].replace('{goal}', String(m.goal))}</Text>
              <View style={s.bar}><View style={[s.fill, { width: `${(m.progress / m.goal) * 100}%` }]} /></View>
              <Text style={s.small}>{m.pcOnly ? 'Nur in Falcon auf dem PC' : `${m.progress} / ${m.goal}`}</Text>
            </View>
            {m.claimed
              ? <View style={s.claimed}><Ionicons name="checkmark-circle" size={18} color={C.green} /><Text style={s.claimedText}>Erledigt</Text></View>
              : <Button small title={`+${m.reward}`} disabled={!m.done} loading={busy === m.id} onPress={() => claimM(m.id)} />}
          </View>
        ))}
      </Card>
      <Text style={s.note}>Missionen werden jeden Tag um Mitternacht neu gestartet. Der Fortschritt zählt auf jedem Gerät für sich.</Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  h: { color: C.text, fontSize: 17, fontWeight: '800' },
  p: { color: C.text2, fontSize: 14, lineHeight: 20, marginTop: 4 },
  days: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: R.sm, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line },
  dayDone: { backgroundColor: 'rgba(61,214,140,0.14)', borderColor: 'rgba(61,214,140,0.45)' },
  dayBonus: { borderColor: 'rgba(245,181,68,0.5)' },
  dayLabel: { color: C.text3, fontSize: 10.5, fontWeight: '600' },
  dayValue: { color: C.text, fontSize: 13, fontWeight: '800', marginTop: 2 },
  claimed: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  claimedText: { color: C.text2, fontSize: 14 },
  mission: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  mText: { color: C.text, fontSize: 15, fontWeight: '600' },
  bar: { height: 6, borderRadius: 3, backgroundColor: C.raised, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: C.accent, borderRadius: 3 },
  small: { color: C.text3, fontSize: 12.5 },
  note: { color: C.text3, fontSize: 13, textAlign: 'center', marginTop: 14, lineHeight: 18 }
});
