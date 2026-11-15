// Fehler melden & öffentliche Liste aller Meldungen (Admin: Status ändern, löschen)
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Button, Card, Empty, Field, Screen } from '@/components/ui';
import { Report, errorText, useSession } from '@/lib/session';
import { C, R } from '@/lib/theme';

const CATEGORIES = [['bug', 'Fehler'], ['site', 'Website funktioniert nicht'], ['crash', 'Absturz oder Einfrieren'], ['idea', 'Vorschlag'], ['other', 'Sonstiges']];
const STATUS = [['new', 'Neu'], ['progress', 'In Arbeit'], ['done', 'Erledigt']];
const STATUS_COLOR: Record<string, string> = { new: C.blue, progress: C.gold, done: C.green };

export default function ReportScreen() {
  const params = useLocalSearchParams<{ url?: string }>();
  const [tab, setTab] = useState<'new' | 'list'>('new');
  return (
    <Screen title="Fehler melden" scroll={false}>
      <View style={s.segment}>
        {([['new', 'Melden'], ['list', 'Alle Meldungen']] as const).map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[s.segBtn, tab === k && s.segOn]}><Text style={[s.segText, tab === k && { color: C.text }]}>{l}</Text></Pressable>
        ))}
      </View>
      {tab === 'new' ? <Form url={params.url} onDone={() => setTab('list')} /> : <List />}
    </Screen>
  );
}

function Form({ url, onDone }: { url?: string; onDone: () => void }) {
  const { user, submitReport } = useSession();
  const [category, setCategory] = useState(url ? 'site' : 'bug');
  const [text, setText] = useState('');
  const [email, setEmail] = useState('');
  const [withUrl, setWithUrl] = useState(!!url);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await submitReport({ text, category, url: withUrl ? url : undefined, email: user ? undefined : email });
      setText('');
      Alert.alert('Danke!', 'Deine Meldung ist angekommen.');
      onDone();
    } catch (e) { Alert.alert('Nicht gesendet', errorText(e)); }
    setBusy(false);
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Text style={s.label}>Art</Text>
      <View style={s.chips}>
        {CATEGORIES.map(([v, l]) => (
          <Pressable key={v} onPress={() => setCategory(v)} style={[s.chip, category === v && s.chipOn]}><Text style={[s.chipText, category === v && { color: C.text }]}>{l}</Text></Pressable>
        ))}
      </View>
      <Text style={s.label}>Was ist passiert?</Text>
      <TextInput style={s.area} multiline value={text} onChangeText={setText} placeholder="Beschreib kurz, was du gemacht hast und was passiert ist."
        placeholderTextColor={C.text3} selectionColor={C.accent} textAlignVertical="top" maxLength={5000} />
      {url ? (
        <View style={s.switchRow}>
          <Text style={[s.small, { flex: 1 }]} numberOfLines={2}>Adresse der Seite mitsenden ({url})</Text>
          <Switch value={withUrl} onValueChange={setWithUrl} trackColor={{ true: C.accent }} />
        </View>
      ) : null}
      {user ? null : <Field icon="mail-outline" placeholder="E-Mail für Rückfragen (optional)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />}
      <Text style={s.small}>Öffentlich sichtbar sind nur Beschreibung, Art, Version, Datum und Status – deine E-Mail und die Adresse sieht nur der Entwickler.</Text>
      <Button title="Senden" icon="send" onPress={send} loading={busy} disabled={!text.trim()} />
    </ScrollView>
  );
}

function List() {
  const { admin, publicReports, adminReports, updateReport, deleteReport } = useSession();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setReports(await (admin ? adminReports() : publicReports())); } catch (e) { setError(errorText(e)); }
    setLoading(false);
  }, [admin, adminReports, publicReports]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  const manage = (r: Report) => Alert.alert('Meldung', 'Status ändern oder löschen', [
    ...STATUS.filter(([v]) => v !== (r.status || 'new')).map(([v, l]) => ({ text: l, onPress: () => updateReport(r.id, v).then(load).catch((e) => Alert.alert('Fehler', errorText(e))) })),
    { text: 'Löschen', style: 'destructive' as const, onPress: () => deleteReport(r.id).then(load).catch((e) => Alert.alert('Fehler', errorText(e))) },
    { text: 'Abbrechen', style: 'cancel' as const }
  ]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.text2} />}>
      {admin ? <Text style={s.small}>Admin-Ansicht: Tippe auf eine Meldung, um den Status zu ändern.</Text> : null}
      {error ? <Empty icon="cloud-offline-outline" title="Nicht geladen" text={error} />
        : !reports ? <ActivityIndicator color={C.accent} style={{ marginTop: 30 }} />
          : !reports.length ? <Empty icon="chatbubble-ellipses-outline" title="Noch keine Meldungen" />
            : reports.map((r) => {
              const st = r.status || 'new';
              return (
                <Pressable key={r.id} disabled={!admin} onPress={() => manage(r)}>
                  <Card style={{ padding: 14, gap: 8, opacity: st === 'done' ? 0.7 : 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[s.badge, { backgroundColor: `${STATUS_COLOR[st]}22` }]}><Text style={[s.badgeText, { color: STATUS_COLOR[st] }]}>{(STATUS.find(([v]) => v === st) || STATUS[0])[1]}</Text></View>
                      <Text style={s.small}>{(CATEGORIES.find(([v]) => v === r.category) || ['', r.category])[1]}</Text>
                      <Text style={[s.small, { marginLeft: 'auto' }]}>{r.created ? new Date(r.created).toLocaleDateString('de-DE') : ''}</Text>
                    </View>
                    <Text style={s.text}>{r.text}</Text>
                    <Text style={s.small}>{[r.version && `Version ${r.version}`, admin && r.os, admin && r.email, admin && r.url].filter(Boolean).join(' · ')}</Text>
                  </Card>
                </Pressable>
              );
            })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  segment: { flexDirection: 'row', padding: 4, marginHorizontal: 16, marginBottom: 4, borderRadius: R.md, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line },
  segBtn: { flex: 1, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line2 },
  segText: { color: C.text2, fontSize: 14, fontWeight: '700' },
  label: { color: C.text2, fontSize: 13.5, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line },
  chipOn: { borderColor: C.accent, backgroundColor: C.accentSoft },
  chipText: { color: C.text2, fontSize: 13.5, fontWeight: '600' },
  area: { minHeight: 140, padding: 14, borderRadius: R.md, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line, color: C.text, fontSize: 15.5 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  small: { color: C.text3, fontSize: 12.5, lineHeight: 17 },
  text: { color: C.text, fontSize: 14.5, lineHeight: 20 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 12, fontWeight: '700' }
});
