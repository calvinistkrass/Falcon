// Admin: FalCoins und Game Mode aller Nutzer bearbeiten (nur für das Admin-Konto – die Firestore-Regeln prüfen das)
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, CoinIcon, Empty, Screen } from '@/components/ui';
import { AdminWallet, errorText, fmtDate, useSession } from '@/lib/session';
import { C, R } from '@/lib/theme';

export default function Admin() {
  const { admin, adminWallets, adminUpdateWallet } = useSession();
  const [list, setList] = useState<AdminWallet[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [now] = useState(Date.now);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setList(await adminWallets()); } catch (e) { setError(errorText(e)); }
    setLoading(false);
  }, [adminWallets]);
  useEffect(() => { if (!admin) return; const t = setTimeout(load, 0); return () => clearTimeout(t); }, [admin, load]);

  if (!admin) return <Screen title="Admin"><Empty icon="shield-outline" title="Kein Zugriff" text="Nur für das Admin-Konto." /></Screen>;
  const commit = async (w: AdminWallet, patch: { balance?: number; gameModeUntil?: number; betaUntil?: number }) => {
    try { await adminUpdateWallet(w.uid, patch); setList((l) => (l || []).map((x) => (x.uid === w.uid ? { ...x, ...patch } : x))); }
    catch (e) { Alert.alert('Nicht gespeichert', errorText(e)); }
  };

  return (
    <Screen title="FalCoins verwalten" scroll={false}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.text2} />} keyboardShouldPersistTaps="handled">
        <Text style={s.small}>Nur für dein Admin-Konto sichtbar. Änderungen gelten sofort.</Text>
        {error ? <Empty icon="cloud-offline-outline" title="Nicht geladen" text={error} />
          : !list ? <ActivityIndicator color={C.accent} style={{ marginTop: 30 }} />
            : list.map((w) => <WalletCard key={w.uid} w={w} now={now} onCommit={(p) => commit(w, p)} />)}
      </ScrollView>
    </Screen>
  );
}

function WalletCard({ w, now, onCommit }: { w: AdminWallet; now: number; onCommit: (p: { balance?: number; gameModeUntil?: number; betaUntil?: number }) => Promise<void> }) {
  const [value, setValue] = useState(String(w.balance));
  const gm = w.gameModeUntil > now;
  const beta = w.betaUntil > now;
  const save = () => { const n = Number(value); if (Number.isFinite(n) && n !== w.balance) onCommit({ balance: n }); };
  const toggleGm = () => { const d = new Date(); d.setMonth(d.getMonth() + 2); onCommit({ gameModeUntil: gm ? 0 : d.getTime() }); };
  const toggleBeta = () => { const d = new Date(); d.setDate(d.getDate() + 14); onCommit({ betaUntil: beta ? 0 : d.getTime() }); };
  return (
    <Card style={{ padding: 14, gap: 10 }}>
      <View>
        <Text style={s.name} numberOfLines={1}>{w.name || w.email || w.uid}</Text>
        {w.name && w.email ? <Text style={s.small} numberOfLines={1}>{w.email}</Text> : null}
        <Text style={s.small}>{[gm && `Game Mode bis ${fmtDate(w.gameModeUntil)}`, beta && `Beta bis ${fmtDate(w.betaUntil)}`].filter(Boolean).join(' · ') || 'Keine Freischaltungen'}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={s.input}>
          <CoinIcon size={16} />
          <TextInput value={value} onChangeText={setValue} onEndEditing={save} keyboardType="number-pad" style={s.inputText} selectionColor={C.accent} accessibilityLabel="FalCoins" />
        </View>
        <Button small title="Speichern" onPress={save} disabled={Number(value) === w.balance} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {[100, 500, 1000].map((n) => <Button key={n} small variant="ghost" title={`+${n}`} onPress={() => { setValue(String(w.balance + n)); onCommit({ balance: w.balance + n }); }} />)}
        <Button small variant="ghost" icon="game-controller-outline" title={gm ? 'Game Mode entziehen' : 'Game Mode 2 Monate'} onPress={toggleGm} />
        <Button small variant="ghost" icon="flask-outline" title={beta ? 'Beta entziehen' : 'Beta 14 Tage'} onPress={toggleBeta} />
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  small: { color: C.text3, fontSize: 12.5, lineHeight: 17 },
  name: { color: C.text, fontSize: 15.5, fontWeight: '700' },
  input: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 12, borderRadius: R.sm, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line },
  inputText: { flex: 1, color: C.text, fontSize: 15, fontWeight: '700', height: '100%' }
});
