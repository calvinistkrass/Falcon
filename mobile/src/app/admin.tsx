// Admin: Benachrichtigungen an alle Nutzer mit Falcon-Konto senden (nur für das Admin-Konto – die Firestore-Regeln prüfen das)
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput } from 'react-native';
import { Button, Card, Empty, Screen } from '@/components/ui';
import { Notice, errorText, useSession } from '@/lib/session';
import { C, R } from '@/lib/theme';

export default function Admin() {
  const { admin, notices, sendNotice, deleteNotice } = useSession();
  const [list, setList] = useState<Notice[]>([]);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => { notices().then(setList).catch(() => setList([])); }, [notices]);
  useEffect(() => { if (admin) reload(); }, [admin, reload]);

  if (!admin) return <Screen title="Admin"><Empty icon="shield-outline" title="Kein Zugriff" text="Nur für das Admin-Konto." /></Screen>;

  const send = () => {
    if (!text.trim()) { Alert.alert('Benachrichtigung', 'Bitte schreib eine Nachricht.'); return; }
    Alert.alert('An alle senden?', 'Alle mit Falcon-Konto sehen die Nachricht beim nächsten Start und klicken sie mit „Verstanden“ weg.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Senden', onPress: async () => {
          setBusy(true);
          try { await sendNotice(title, text); setTitle(''); setText(''); reload(); Alert.alert('Gesendet', 'Die Benachrichtigung ist unterwegs.'); }
          catch (e) { Alert.alert('Nicht gesendet', errorText(e)); }
          setBusy(false);
        }
      }
    ]);
  };
  const remove = (n: Notice) => Alert.alert('Benachrichtigung löschen?', 'Wer sie noch nicht gesehen hat, bekommt sie dann nicht mehr.', [
    { text: 'Abbrechen', style: 'cancel' },
    { text: 'Löschen', style: 'destructive', onPress: async () => { try { await deleteNotice(n.id); reload(); } catch (e) { Alert.alert('Nicht gelöscht', errorText(e)); } } }
  ]);

  return (
    <Screen title="Benachrichtigungen">
      <Card style={{ padding: 16, gap: 10 }}>
        <Text style={s.label}>Titel (optional)</Text>
        <TextInput style={s.input} value={title} onChangeText={setTitle} maxLength={80} placeholder="z. B. Wartung heute Abend" placeholderTextColor={C.text3} />
        <Text style={s.label}>Nachricht</Text>
        <TextInput style={[s.input, { minHeight: 110, textAlignVertical: 'top' }]} value={text} onChangeText={setText} maxLength={1000} multiline placeholder="Was sollen alle erfahren?" placeholderTextColor={C.text3} />
        <Button title="An alle senden" icon="send-outline" onPress={send} loading={busy} />
      </Card>
      <Text style={s.section}>Gesendet</Text>
      {list.length ? list.map((n) => (
        <Card key={n.id} style={{ padding: 14, gap: 6, marginBottom: 10 }}>
          <Text style={s.title}>{n.title || 'Ohne Titel'}</Text>
          <Text style={s.text}>{n.text}</Text>
          <Text style={s.small}>{new Date(n.created).toLocaleString('de-DE')}</Text>
          <Button title="Löschen" icon="trash-outline" variant="ghost" small onPress={() => remove(n)} />
        </Card>
      )) : <Text style={s.small}>Noch keine Benachrichtigungen.</Text>}
    </Screen>
  );
}

const s = StyleSheet.create({
  label: { color: C.text2, fontSize: 13, fontWeight: '600' },
  input: { color: C.text, fontSize: 15, padding: 12, borderRadius: R.md, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line },
  section: { color: C.text3, fontSize: 12.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 22, marginBottom: 10 },
  title: { color: C.text, fontSize: 15, fontWeight: '700' },
  text: { color: C.text2, fontSize: 14, lineHeight: 20 },
  small: { color: C.text3, fontSize: 12.5 }
});
